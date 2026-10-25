import * as THREE from 'three'
import { assemblyApi, setAssemblyToken, type AssemblyJob } from './assembly-api'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  assignPart,
  frames,
  invalidateReview,
  matrix,
  parsePackage,
  replaceProject,
  acknowledge,
  type ReviewPackage,
} from './assembly-review'
import './assembly.css'

const root = document.querySelector<HTMLDivElement>('#assembly-app')!
root.innerHTML = `<header><a href="/">Photo2Sim</a><span>Guided assembly review</span></header>
<main><h1>From parts to a moving assembly.</h1><p>Group rigid parts, review pivots and joint limits, then prepare a simulator export. This preview is kinematic; it does not test forces, collisions or hardware accuracy.</p>
<details><summary>API access</summary><label>Application token <input id="api-token" type="password" autocomplete="off"></label><button id="set-token">Set token for this session</button></details>
<section class="job-controls"><h2>Import source project</h2><label>Review project JSON <input id="import-project" type="file" accept=".json,application/json"></label><label>Source meshes (select all files) <input id="import-meshes" type="file" accept=".obj,.stl" multiple></label><button id="import">Import and open review</button><p>Mesh filenames must match the paths in the project. For nested paths, select a folder below.</p><label>Source mesh folder <input id="import-folder" type="file" webkitdirectory multiple></label><h2>Open existing job</h2><label>Job ID <input id="job-id" type="text" autocomplete="off"></label><button id="open-job">Open job</button><p id="job-status"></p><div id="attempts"></div></section>
<label class="load">Open review package <input id="load" type="file" accept=".json,application/json"></label>
<p id="message" role="status">Import a project and its meshes, open a saved job, or load an offline review package.</p>
<div id="workspace" hidden><div class="layout"><section class="stage"><div id="viewer"></div><button id="reset">Reset preview pose</button><p id="summary"></p><div id="sliders"></div></section>
<section class="edit"><h2>1. Group parts</h2><p>Colors identify rigid links. Unassigned parts need an exclusion reason. Reassignment preserves their reference position.</p><div id="parts"></div>
<h2>2. Review links and joints</h2><label>Review item <select id="selection"></select></label><p>Edit the selected record below. Link frames are common-reference pivots in metres; joint axes are local unit vectors; limits are radians. Source and review notes travel with the export.</p><div id="fields"></div><details><summary>Advanced selected record JSON</summary><textarea id="editor" spellcheck="false" aria-label="Selected review record"></textarea></details><button id="apply">Apply edit</button><button id="approve">Acknowledge this item</button><p>Write a review_note before acknowledging. Any geometry, grouping or parameter edit clears all acknowledgements. This does not mark estimates as measurements.</p>
<h2>3. Save and process</h2><button id="save-revision">Save revision to job</button><label>Collision geometry <select id="collision-mode"><option value="box">Box (historical default)</option><option value="convex_mesh">Convex mesh</option></select></label><label><input id="exclude-joint-pairs" type="checkbox"> Exclude direct parent-child collision pairs</label><button id="process">Run preparation, export and validation</button><p>These export settings are recorded per attempt and do not alter the reviewed source project. Save the review before processing. Previous attempts remain available after a revision or failed validation.</p><button id="save">Download project JSON</button><button id="save-package">Download review package</button>
<details><summary>Advanced: full project / add links and joints</summary><textarea id="full" aria-label="Full project JSON" spellcheck="false"></textarea><button id="apply-full">Apply full project</button></details><details><summary>Provenance and limitations</summary><pre id="notes"></pre></details></section></div></div></main>`
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
let payload: ReviewPackage | undefined,
  job: AssemblyJob | undefined,
  savedProject = '',
  pollTimer: ReturnType<typeof setTimeout> | undefined,
  values: Record<string, number> = {},
  dispose: (() => void) | undefined,
  updateView: (() => void) | undefined
const message = (s: string) => {
  el('message').textContent = s
}
const error = (e: unknown) => message(e instanceof Error ? e.message : String(e))
const download = (name: string, data: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const running = (status: string) => ['preparing', 'exporting', 'validating'].includes(status)
async function downloadArtifact(path: string) {
  if (!job) return
  const blob = await assemblyApi.file(job.id, path)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = path.split('/').at(-1) || 'artifact'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function renderJob() {
  const status = el('job-status')
  const attempts = el('attempts')
  attempts.replaceChildren()
  if (!job) {
    status.textContent = 'Offline review package. Import its source project and meshes to process it.'
    return
  }
  const dirty = !!payload && JSON.stringify(payload.project) !== savedProject
  status.textContent = `Job ${job.id} · revision ${job.revision} · ${job.status} · ${job.synthetic ? 'synthetic' : 'source-assisted'} · ${dirty ? 'unsaved edits' : 'saved'} · export generated: ${job.export_generated ? 'yes' : 'no'} · motion validation passed: ${job.motion_validation_passed === null ? 'pending' : job.motion_validation_passed ? 'yes' : 'no'}${job.error ? ' · ' + job.error.message : ''}`
  el<HTMLButtonElement>('save-revision').disabled = running(job.status) || !dirty
  el<HTMLButtonElement>('process').disabled = running(job.status) || dirty || !payload
  for (const attempt of job.attempts) {
    const row = document.createElement('div')
    row.className = 'attempt'
    const label = document.createElement('p')
    label.textContent = `Attempt ${attempt.number} · revision ${attempt.revision} · ${attempt.status} · ${attempt.export_config?.collision_mode || 'box'} collision · adjacent pairs ${attempt.export_config?.exclude_joint_pairs ? 'excluded' : 'native'} · export generated: ${attempt.export_generated ? 'yes' : 'no'} · motion validation passed: ${attempt.motion_validation_passed === null ? 'pending' : attempt.motion_validation_passed ? 'yes' : 'no'}${attempt.error ? ' · ' + attempt.error.message : ''}`
    row.append(label)
    for (const [title, path] of [['Export', attempt.export_path], ['Validation report', attempt.validation_path], ['Result ZIP', attempt.bundle_path]] as const) {
      if (!path) continue
      const button = document.createElement('button')
      button.textContent = `Download ${title}`
      button.onclick = () => downloadArtifact(path).catch(error)
      row.append(button)
    }
    attempts.append(row)
  }
  if (running(job.status)) schedulePoll()
}
function schedulePoll() {
  if (pollTimer || !job) return
  pollTimer = setTimeout(async () => {
    pollTimer = undefined
    try {
      job = await assemblyApi.get(job!.id)
      renderJob()
    } catch (e) { error(e) }
  }, 1200)
}
async function openJob(id: string) {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = undefined
  const next = await assemblyApi.get(id)
  const packageData = parsePackage(JSON.stringify(await assemblyApi.reviewPackage(next)))
  job = next
  payload = packageData
  savedProject = JSON.stringify(payload.project)
  el<HTMLInputElement>('job-id').value = id
  render()
  renderJob()
  message('Opened saved job and review package.')
}
function selection() {
  const [kind, n] = el<HTMLSelectElement>('selection').value.split(':')
  return kind === 'group' ? payload!.project.groups[+n] : payload!.project.joints[+n]
}
function select() {
  const item = structuredClone(selection())
  const editor = el<HTMLTextAreaElement>('editor')
  editor.value = JSON.stringify(item, null, 2)
  const fields = el('fields')
  fields.replaceChildren()
  function input(label: string, value: number | string, update: (value: string) => void) {
    const row = document.createElement('label')
    row.textContent = label
    const field = document.createElement('input')
    field.type = typeof value === 'number' ? 'number' : 'text'
    field.step = 'any'
    field.value = String(value)
    field.setAttribute('aria-label', label)
    field.oninput = () => {
      update(field.value)
      editor.value = JSON.stringify(item, null, 2)
    }
    row.append(field)
    fields.append(row)
  }
  if ('frame' in item) {
    ;['X', 'Y', 'Z'].forEach((axis, i) =>
      input(`Pivot ${axis} (m)`, item.frame.position_m[i], (v) => {
        item.frame.position_m[i] = Number(v)
      }),
    )
    ;['w', 'x', 'y', 'z'].forEach((axis, i) =>
      input(`Frame quaternion ${axis}`, item.frame.quaternion_wxyz[i], (v) => {
        item.frame.quaternion_wxyz[i] = Number(v)
      }),
    )
    input('Mass (kg)', item.mass_kg.value, (v) => {
      item.mass_kg.value = Number(v)
    })
    input('Mass provenance', item.mass_kg.source, (v) => {
      item.mass_kg.source = v
    })
  } else {
    input('Parent link', item.parent, (v) => {
      item.parent = v
    })
    input('Child link', item.child, (v) => {
      item.child = v
    })
    if (item.axis)
      ['X', 'Y', 'Z'].forEach((axis, i) =>
        input(`Joint axis ${axis}`, item.axis![i], (v) => {
          item.axis![i] = Number(v)
        }),
      )
    if (item.limits_rad)
      ['Lower', 'Upper'].forEach((label, i) =>
        input(`${label} limit (rad)`, item.limits_rad![i], (v) => {
          item.limits_rad![i] = Number(v)
        }),
      )
    if (item.drive) {
      input('Position gain (Nm/rad)', item.drive.kp, (v) => {
        item.drive!.kp = Number(v)
      })
      input('Torque limit (Nm)', item.drive.force_limit_nm, (v) => {
        item.drive!.force_limit_nm = Number(v)
      })
    }
    if (item.damping)
      input('Damping (Nm s/rad)', item.damping.value, (v) => {
        item.damping!.value = Number(v)
      })
    input('Joint provenance', item.source, (v) => {
      item.source = v
    })
  }
  input('Review note', item.review_note, (v) => {
    item.review_note = v
  })
}
function render() {
  if (!payload) return
  values = {}
  el('workspace').hidden = false
  const p = payload.project
  el('summary').textContent =
    `${p.name} · ${p.parts.length} parts · ${p.groups.length} links · ${p.joints.length} joints · ${p.synthetic ? 'Synthetic' : 'Source-assisted'} · ${[...p.groups, ...p.joints].filter((x) => x.reviewed).length}/${p.groups.length + p.joints.length} acknowledged`
  el('notes').textContent = p.notes.join('\n\n')
  el<HTMLTextAreaElement>('full').value = JSON.stringify(p, null, 2)
  const parts = el('parts')
  parts.replaceChildren()
  p.parts.forEach((part) => {
    const row = document.createElement('div')
    row.className = 'part'
    const label = document.createElement('label')
    label.textContent = part.id
    const s = document.createElement('select')
    s.setAttribute('aria-label', 'Group for ' + part.id)
    const empty = new Option('Unassigned / excluded', '')
    s.add(empty)
    p.groups.forEach((g) => s.add(new Option(g.name, g.name)))
    s.value = part.group ?? ''
    s.onchange = () => {
      assignPart(p, part.id, s.value || null)
      render()
    }
    label.append(s)
    row.append(label)
    if (!part.group) {
      const reason = document.createElement('input')
      reason.placeholder = 'Reason for exclusion'
      reason.setAttribute('aria-label', 'Exclusion reason for ' + part.id)
      reason.value = part.excluded_reason ?? ''
      reason.onchange = () => {
        part.excluded_reason = reason.value
        invalidateReview(p)
        render()
      }
      row.append(reason)
    }
    const source = document.createElement('small')
    source.textContent = part.source + ' · ' + part.note
    row.append(source)
    parts.append(row)
  })
  const sel = el<HTMLSelectElement>('selection')
  const previous = sel.value
  sel.replaceChildren()
  p.groups.forEach((g, i) =>
    sel.add(new Option(`Link: ${g.name}${g.reviewed ? ' ✓' : ''}`, `group:${i}`)),
  )
  p.joints.forEach((j, i) =>
    sel.add(new Option(`Joint: ${j.name}${j.reviewed ? ' ✓' : ''}`, `joint:${i}`)),
  )
  if ([...sel.options].some((o) => o.value === previous)) sel.value = previous
  select()
  const sliders = el('sliders')
  sliders.replaceChildren()
  for (const j of p.joints) {
    if (j.kind !== 'revolute' || !j.limits_rad) continue
    const label = document.createElement('label')
    const title = document.createElement('span')
    title.textContent = j.name + ' · 0.000 rad'
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(j.limits_rad[0])
    slider.max = String(j.limits_rad[1])
    slider.step = 'any'
    slider.value = '0'
    slider.setAttribute('aria-label', j.name + ' angle')
    slider.oninput = () => {
      values[j.name] = +slider.value
      title.textContent = j.name + ' · ' + (+slider.value).toFixed(3) + ' rad'
      updateView?.()
    }
    label.append(title, slider)
    sliders.append(label)
  }
  mount()
  renderJob()
}
function mount() {
  dispose?.()
  dispose = undefined
  updateView = undefined
  const host = el('viewer')
  host.replaceChildren()
  try {
    const p = payload!.project,
      scene = new THREE.Scene()
    scene.background = new THREE.Color('#171e25')
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    host.append(renderer.domElement)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 100)
    camera.up.set(0, 0, 1)
    const orbit = new OrbitControls(camera, renderer.domElement)
    const meshes: THREE.Mesh[] = [],
      axes: THREE.AxesHelper[] = [],
      arrows: THREE.ArrowHelper[] = []
    const palette = ['#d7b567', '#73b8d8', '#b793d4', '#77bc9d', '#e39076', '#e4cb84', '#839cd0']
    for (const part of p.parts) {
      const source = payload!.geometry[part.id]
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(source.vertices.flat(), 3))
      geo.setIndex(source.faces.flat())
      geo.computeVertexNormals()
      const index = p.groups.findIndex((g) => g.name === part.group)
      const material = new THREE.MeshStandardMaterial({
        color: index < 0 ? '#5e646a' : palette[index % palette.length],
        roughness: 0.7,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: index < 0,
        opacity: index < 0 ? 0.2 : 1,
      })
      const mesh = new THREE.Mesh(geo, material)
      mesh.matrixAutoUpdate = false
      scene.add(mesh)
      meshes.push(mesh)
    }
    for (const g of p.groups) {
      const a = new THREE.AxesHelper(0.025)
      a.matrixAutoUpdate = false
      scene.add(a)
      axes.push(a)
    }
    for (const j of p.joints) {
      if (j.kind !== 'revolute' || !j.axis) continue
      const a = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(),
        0.06,
        0xffcf55,
        0.012,
        0.007,
      )
      scene.add(a)
      arrows.push(a)
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(1, -2, 3)
    scene.add(light)
    updateView = () => {
      try {
        const transforms = frames(p, values)
        p.parts.forEach((part, i) => {
          const t = part.group
            ? transforms[part.group]
                .clone()
                .multiply(matrix(p.groups.find((g) => g.name === part.group)!.frame).invert())
                .multiply(matrix(part.pose))
            : matrix(part.pose)
          meshes[i].matrix.copy(t)
          meshes[i].matrixWorldNeedsUpdate = true
        })
        p.groups.forEach((g, i) => {
          axes[i].matrix.copy(transforms[g.name])
          axes[i].matrixWorldNeedsUpdate = true
        })
        let n = 0
        for (const j of p.joints) {
          if (j.kind !== 'revolute' || !j.axis) continue
          const t = transforms[j.child]
          arrows[n].position.setFromMatrixPosition(t)
          arrows[n++].setDirection(new THREE.Vector3(...j.axis).transformDirection(t))
        }
        scene.updateMatrixWorld(true)
      } catch (e) {
        error(e)
      }
    }
    updateView()
    const bounds = new THREE.Box3()
    meshes.forEach((m) => bounds.expandByObject(m))
    const center = bounds.getCenter(new THREE.Vector3()),
      size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 0.1)
    orbit.target.copy(center)
    camera.position.copy(center).add(new THREE.Vector3(1, -1, 0.7).multiplyScalar(size * 1.5))
    orbit.update()
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()
    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      orbit.update()
      renderer.render(scene, camera)
    }
    animate()
    dispose = () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      orbit.dispose()
      meshes.forEach((m) => {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      })
      axes.forEach((a) => a.dispose())
      arrows.forEach((a) => a.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
    }
  } catch (e) {
    host.textContent = '3D preview unavailable. ' + String(e)
  }
}
el<HTMLInputElement>('load').onchange = async () => {
  try {
    const f = el<HTMLInputElement>('load').files?.[0]
    if (!f) return
    if (f.size > 100 * 1024 * 1024) throw Error('Maximum package size: 100 MiB')
    payload = parsePackage(await f.text())
    job = undefined
    savedProject = ''
    render()
    message('Loaded locally. Review all groups and joints; physical calibration remains separate.')
  } catch (e) {
    error(e)
  }
}
el('set-token').onclick = () => {
  setAssemblyToken(el<HTMLInputElement>('api-token').value)
  message('Application token set for this browser session.')
}
el('import').onclick = async () => {
  try {
    const project = el<HTMLInputElement>('import-project').files?.[0]
    if (!project) throw Error('Select a review project JSON.')
    const raw = JSON.parse(await project.text()) as ReviewPackage['project']
    if (raw.schema_version !== 'assembly-review-1.0' || !Array.isArray(raw.parts))
      throw Error('Select an assembly-review-1.0 project.')
    const expected = new Set(raw.parts.map((part) => part.mesh))
    const files = [
      ...Array.from(el<HTMLInputElement>('import-meshes').files || []),
      ...Array.from(el<HTMLInputElement>('import-folder').files || []),
    ]
    const meshes = [...expected].map((path) => {
      const matches = files.filter((file) =>
        file.name === path || file.webkitRelativePath === path ||
        file.webkitRelativePath.endsWith('/' + path),
      )
      if (matches.length !== 1) throw Error(`Select exactly one source mesh for ${path}.`)
      return { path, file: matches[0] }
    })
    message('Importing source meshes and checking hashes…')
    const created = await assemblyApi.create(project, meshes)
    await openJob(created.id)
  } catch (e) { error(e) }
}
el('open-job').onclick = () => {
  openJob(el<HTMLInputElement>('job-id').value.trim()).catch(error)
}
el('save-revision').onclick = async () => {
  if (!job || !payload) return
  try {
    job = await assemblyApi.save(job.id, payload.project, job.revision)
    savedProject = JSON.stringify(payload.project)
    renderJob()
    message(`Saved revision ${job.revision}.`)
  } catch (e) { error(e) }
}
el('process').onclick = async () => {
  if (!job || !payload) return
  if (JSON.stringify(payload.project) !== savedProject) {
    message('Save this revision before processing.')
    return
  }
  try {
    job = await assemblyApi.process(job.id, job.revision, {
      collision_mode: el<HTMLSelectElement>('collision-mode').value as 'box' | 'convex_mesh',
      exclude_joint_pairs: el<HTMLInputElement>('exclude-joint-pairs').checked,
    })
    renderJob()
    message('Preparation started. Export and motion validation results will appear separately.')
  } catch (e) { error(e) }
}
el('selection').onchange = select
el('apply').onclick = () => {
  if (!payload) return
  try {
    const next = structuredClone(payload)
    const [kind, n] = el<HTMLSelectElement>('selection').value.split(':')
    const item = JSON.parse(el<HTMLTextAreaElement>('editor').value)
    if (kind === 'group') next.project.groups[+n] = item
    else next.project.joints[+n] = item
    invalidateReview(next.project)
    payload = parsePackage(JSON.stringify(next))
    render()
    message('Applied. Re-review the changed assembly.')
  } catch (e) {
    error(e)
  }
}
el('approve').onclick = () => {
  if (!payload) return
  const item = selection()
  if (!item.review_note.trim()) {
    message('Apply a nonempty review_note first.')
    return
  }
  if (el<HTMLTextAreaElement>('editor').value !== JSON.stringify(item, null, 2)) {
    message('Apply the editor changes before acknowledging.')
    return
  }
  acknowledge(payload.project, item)
  render()
  message('Acknowledged as an engineering review. Provenance is unchanged.')
}
el('apply-full').onclick = () => {
  if (!payload) return
  try {
    const project = JSON.parse(el<HTMLTextAreaElement>('full').value)
    payload = replaceProject(payload, project)
    render()
    message('Project updated; acknowledgements cleared.')
  } catch (e) {
    error(e)
  }
}
el('reset').onclick = () => render()
el('save').onclick = () => {
  if (payload) download(payload.project.name + '-project.json', payload.project)
}
el('save-package').onclick = () => {
  if (payload) download(payload.project.name + '-review-package.json', payload)
}
window.addEventListener('pagehide', () => {
  dispose?.()
  if (pollTimer) clearTimeout(pollTimer)
})
