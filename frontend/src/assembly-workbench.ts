import { brandLink } from './brand'
import * as THREE from 'three'
import { assemblyApi, setAssemblyToken, type AssemblyJob } from './assembly-api'
import { accessDescription, browserAccess } from './access'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  assignPart,
  frames,
  jointLimits,
  jointValues,
  invalidateReview,
  matrix,
  parsePackage,
  replaceProject,
  acknowledge,
  type ReviewPackage,
} from './assembly-review'
import { addConnectedLink, renameLink, changeJointKind } from './assembly-builder'
import { validationFindings } from './assembly-diagnostics'
import { buildCollisionPreviews, type CollisionMode } from './assembly-collision'
import { createMappingPanel } from './pose-mapping-panel'
import {
  createPhysicsDraft,
  advancedPhysicsControls,
  readAdvancedPhysics,
  validateAdvancedPhysics,
} from './advanced-physics'
import './assembly.css'

const root = document.querySelector<HTMLDivElement>('#assembly-app')!
root.innerHTML = `<header>${brandLink('/')}<span>Guided assembly review</span></header>
<main><h1>From parts to a moving assembly.</h1><p>Group rigid parts, review pivots and joint limits, then prepare a simulator export. This preview is kinematic; it does not test forces, collisions or hardware accuracy.</p>
<details><summary>Generation access</summary><p>Hosted generation requires a team-issued access code. Already signed in on Kamino? Your browser access works here too. Session duration and usage limits are shared by code. <a href="/example.html">Explore a complete offline example</a> or read <a href="https://github.com/Johaan-Mannanal/kamino/blob/main/docs/HOSTED_ACCESS.md">access and data-handling details</a>.</p><label>Team access code <input id="api-token" type="password" autocomplete="off"></label><button id="set-token">Sign in</button><button id="sign-out">Sign out</button></details>
<section class="job-controls"><h2>Start from component meshes</h2><p>Upload separate geometry-only OBJ/STL parts in a shared reference frame. Choose their units; positions are preserved. Define links and joints below. No project JSON is needed.</p><div class="guided-grid"><label>Assembly name <input id="draft-name" value="my_assembly" maxlength="64"></label><label>Source units <select id="draft-units"><option value="">Choose units</option><option value="m">Metres</option><option value="mm">Millimetres</option></select></label><label>Component meshes <input id="draft-meshes" type="file" accept=".obj,.stl" multiple></label><label><input id="draft-synthetic" type="checkbox"> Synthetic example geometry</label></div><button id="create-draft">Create assembly draft</button><p>Starting masses and drive settings are estimates to review. Original files are retained. STEP conversion is available through the optional CAD tool.</p><details><summary>Import an existing source project</summary><h2>Import source project</h2><label>Review project JSON <input id="import-project" type="file" accept=".json,application/json"></label><label>Source meshes (select all files) <input id="import-meshes" type="file" accept=".obj,.stl" multiple></label><button id="import">Import and open review</button><p>Mesh filenames must match the paths in the project. For nested paths, select a folder below.</p><label>Source mesh folder <input id="import-folder" type="file" webkitdirectory multiple></label></details><h2>Open existing job</h2><label>Job ID <input id="job-id" type="text" autocomplete="off"></label><button id="open-job">Open job</button><p id="job-status"></p><div id="attempts"></div></section>
<label class="load">Open review package <input id="load" type="file" accept=".json,application/json"></label>
<p id="message" role="status">Import a project and its meshes, open a saved job, or load an offline review package.</p>
<div id="workspace" hidden><div class="layout"><section class="stage"><div id="viewer"></div><button id="reset">Reset preview pose</button><label><input id="show-collision" type="checkbox"> Show collision approximation</label><p id="collision-preview-note"></p><p id="collision-preview-warning" role="status"></p><p id="summary"></p><div id="sliders"></div></section>
<section class="edit"><h2>1. Group parts</h2><p>Colors identify rigid links. Unassigned parts need an exclusion reason. Reassignment preserves their reference position.</p><div id="parts"></div><details><summary>Add a link and connection</summary><div class="guided-grid"><label>New link name <input id="new-link-name"></label><label>Parent link <select id="new-parent"></select></label><label>New joint name <input id="new-joint-name"></label><label>Connection type <select id="new-kind"><option value="revolute">Revolute hinge</option><option value="prismatic">Prismatic slider</option><option value="fixed">Fixed</option></select></label></div><button id="add-link">Add link and joint</button><p>Assign at least one part to the new link, then review its pivot, mass and joint parameters. A moving joint starts on local Z with estimated drive settings.</p></details>
<h2>2. Review links and joints</h2><label>Review item <select id="selection"></select></label><p>Edit the selected record below. Link frames are common-reference pivots in metres; joint axes are local unit vectors; hinge limits are radians and slider travel is metres. Pivot edits change joint frames while preserving source geometry at the reference pose; they do not translate the entire scene. Source and review notes travel with the export.</p><div id="fields"></div><details><summary>Advanced selected record JSON</summary><textarea id="editor" spellcheck="false" aria-label="Selected review record"></textarea></details><button id="apply">Apply edit</button><button id="approve">Acknowledge this item</button><p>Write a review_note before acknowledging. Any geometry, grouping or parameter edit clears all acknowledgements. This does not mark estimates as measurements.</p>
<h2>3. Save and process</h2><button id="save-revision">Save revision to job</button><label>Collision geometry <select id="collision-mode"><option value="box">Box (historical default)</option><option value="convex_mesh">Convex mesh</option></select></label><label><input id="exclude-joint-pairs" type="checkbox"> Exclude direct parent-child collision pairs</label><button id="process">Run preparation, export and validation</button><p>These export settings are recorded per attempt and do not alter the reviewed source project. Save the review before processing. To change a completed result, apply edits, acknowledge the revised inputs and save a new revision. Previous attempts remain available after a revision or failed validation.</p><button id="save">Download project JSON</button><button id="save-package">Download review package</button>
<div id="mapping-review"></div><button id="save-mapping-job" disabled>Save mapping to job</button><p>Mapping evidence is retained for this saved revision. Existing attempt ZIPs remain unchanged. A newly saved mapping can be exported in a new attempt on this revision.</p><details><summary>Advanced: full project / add links and joints</summary><textarea id="full" aria-label="Full project JSON" spellcheck="false"></textarea><button id="apply-full">Apply full project</button></details><details><summary>Provenance and limitations</summary><pre id="notes"></pre></details></section></div></div></main>`
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
let payload: ReviewPackage | undefined,
  job: AssemblyJob | undefined,
  savedProject = '',
  savedMapping = '',
  savedMappingVersion = 0,
  generation = 0,
  mutationPending = false,
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
const mappingPanel = createMappingPanel(
  el('mapping-review'),
  (pose, capture) => {
    values = { ...pose }
    const sliders = el('sliders').querySelectorAll<HTMLInputElement>('input[type=range]')
    payload?.project.joints
      .filter((j) => j.kind !== 'fixed')
      .forEach((j) => {
        const slider = Array.from(sliders).find((s) => s.dataset.joint === j.name)!
        const angle = jointValues(payload!.project, values)[j.name]
        slider.disabled = !!capture || !!j.coupling
        // A range input clamps values, so keep candidate truth in the label and values map.
        slider.value = capture ? '0' : String(angle)
        slider.hidden = !!capture
        slider.parentElement!.querySelector('span')!.textContent =
          `${j.name} · ${angle.toFixed(5)} ${j.kind === 'prismatic' ? 'm' : 'rad'}${capture ? ' · capture candidate (unclipped)' : ''}${j.coupling ? ' · linked follower' : ''}`
      })
    updateView?.()
    message(
      capture
        ? `Previewing ${capture}. Unmapped independent joints display at zero; linked followers use their driver. No physical mapping or accuracy implied.`
        : 'Capture preview reset.',
    )
  },
  download,
)
function beginWorkspace() {
  mappingPanel.invalidatePending()
  generation += 1
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = undefined
  mutationPending = true
  renderJob()
  return generation
}
function workspaceError(active: number, e: unknown) {
  if (active !== generation) return
  mutationPending = false
  renderJob()
  error(e)
}
const running = (status: string) => ['preparing', 'exporting', 'validating'].includes(status)
async function downloadArtifact(path: string) {
  if (!job) return
  const active = generation
  const blob = await assemblyApi.file(job.id, path)
  if (active !== generation) return
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
    el<HTMLButtonElement>('save-mapping-job').disabled = true
    el<HTMLButtonElement>('save-revision').disabled = true
    el<HTMLButtonElement>('process').disabled = true
    status.textContent =
      'Offline review package. Import its source project and meshes to process it.'
    return
  }
  const dirty = !!payload && JSON.stringify(payload.project) !== savedProject
  el<HTMLButtonElement>('save-mapping-job').disabled =
    mutationPending || running(job.status) || dirty || !payload
  status.textContent = `Job ${job.id} · revision ${job.revision} · ${job.status} · ${job.synthetic ? 'synthetic' : 'source-assisted'} · ${dirty ? 'unsaved edits' : 'saved'} · export generated: ${job.export_generated ? 'yes' : 'no'} · motion validation passed: ${job.motion_validation_passed === null ? 'pending' : job.motion_validation_passed ? 'yes' : 'no'}${job.error ? ' · ' + job.error.message : ''}`
  el<HTMLButtonElement>('save-revision').disabled = mutationPending || running(job.status) || !dirty
  const mappingChanged =
    job.status === 'completed' &&
    !!job.mapping_review_path &&
    (job.mapping_version ?? 0) !== (job.attempts.at(-1)?.mapping_version ?? 0)
  el<HTMLButtonElement>('process').disabled =
    mutationPending ||
    (!['awaiting_review', 'failed'].includes(job.status) && !mappingChanged) ||
    dirty ||
    !payload
  el<HTMLButtonElement>('process').textContent =
    job.status === 'failed'
      ? 'Retry preparation, export and validation'
      : 'Run preparation, export and validation'
  for (const attempt of job.attempts) {
    const row = document.createElement('div')
    row.className = 'attempt'
    const label = document.createElement('p')
    label.textContent = `Attempt ${attempt.number} · revision ${attempt.revision} · ${attempt.status} · ${attempt.export_config?.collision_mode || 'box'} collision · adjacent pairs ${attempt.export_config?.exclude_joint_pairs ? 'excluded' : 'native'} · export generated: ${attempt.export_generated ? 'yes' : 'no'} · motion validation passed: ${attempt.motion_validation_passed === null ? 'pending' : attempt.motion_validation_passed ? 'yes' : 'no'}${attempt.error ? ' · ' + attempt.error.message : ''}`
    row.append(label)
    if (attempt.validation_path) {
      const inspect = document.createElement('button')
      inspect.textContent = 'Inspect validation'
      const details = document.createElement('div')
      details.className = 'validation-details'
      details.setAttribute('aria-live', 'polite')
      inspect.onclick = async () => {
        if (!job) return
        const active = generation,
          id = job.id
        inspect.disabled = true
        details.textContent = 'Loading validation report…'
        try {
          const blob = await assemblyApi.file(id, attempt.validation_path!)
          const report = JSON.parse(await blob.text())
          if (active !== generation || job?.id !== id || !details.isConnected) return
          details.replaceChildren()
          const context = document.createElement('p')
          context.textContent = `Report for attempt ${attempt.number}, revision ${attempt.revision}. Review buttons open the current draft; changing it does not alter this report.`
          details.append(context)
          for (const finding of validationFindings(report)) {
            const line = document.createElement('p')
            line.textContent = `${finding.section}: ${finding.message}`
            details.append(line)
            const index = payload?.project.joints.findIndex((j) => j.name === finding.joint) ?? -1
            if (index >= 0) {
              const review = document.createElement('button')
              review.textContent = `Review ${finding.joint}`
              review.onclick = () => {
                if (
                  el<HTMLTextAreaElement>('editor').value !== JSON.stringify(selection(), null, 2)
                ) {
                  message('Apply the current field edits before switching review items.')
                  return
                }
                el<HTMLSelectElement>('selection').value = `joint:${index}`
                select()
                el('fields').scrollIntoView?.({ block: 'center' })
                message(
                  `Reviewing ${finding.joint} in the current draft. Historical report remains unchanged.`,
                )
              }
              details.append(review)
            }
          }
        } catch {
          if (active === generation && details.isConnected)
            details.textContent =
              'Could not read the validation report. Retry or download it for inspection.'
        } finally {
          inspect.disabled = false
        }
      }
      row.append(inspect, details)
    }
    for (const [title, path] of [
      ['Export', attempt.export_path],
      ['Validation report', attempt.validation_path],
      ['Result ZIP', attempt.bundle_path],
    ] as const) {
      if (!path) continue
      const button = document.createElement('button')
      button.textContent = `Download ${title}`
      button.onclick = () => downloadArtifact(path).catch(error)
      row.append(button)
    }
    attempts.append(row)
  }
  if (running(job.status) && !mutationPending) schedulePoll()
}
function schedulePoll() {
  if (pollTimer || !job) return
  const active = generation
  const id = job.id
  pollTimer = setTimeout(async () => {
    pollTimer = undefined
    try {
      const next = await assemblyApi.get(id)
      if (active !== generation || job?.id !== id) return
      job = next
      renderJob()
    } catch (e) {
      if (active === generation) error(e)
    }
  }, 1200)
}
async function openJob(id: string, active = beginWorkspace()) {
  try {
    const next = await assemblyApi.get(id)
    if (active !== generation) return
    const packageData = parsePackage(JSON.stringify(await assemblyApi.reviewPackage(next)))
    if (active !== generation) return
    const retainedMapping = next.mapping_review_path
      ? await (await assemblyApi.file(next.id, next.mapping_review_path)).text()
      : undefined
    if (active !== generation) return
    mutationPending = false
    job = next
    payload = packageData
    savedProject = JSON.stringify(payload.project)
    el<HTMLInputElement>('job-id').value = id
    render()
    if (retainedMapping) mappingPanel.loadSavedReview(retainedMapping)
    savedMapping = retainedMapping ? JSON.stringify(mappingPanel.getReview()) : ''
    savedMappingVersion = next.mapping_version ?? 0
    renderJob()
    message('Opened saved job and review package.')
  } catch (e) {
    workspaceError(active, e)
  }
}
function selection() {
  const [kind, n] = el<HTMLSelectElement>('selection').value.split(':')
  return kind === 'group' ? payload!.project.groups[+n] : payload!.project.joints[+n]
}
function select(draft = selection()) {
  const item = structuredClone(draft)
  const editor = el<HTMLTextAreaElement>('editor')
  editor.value = JSON.stringify(item, null, 2)
  el<HTMLButtonElement>('apply').disabled = false
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
  function provenance(label: string, value: string, update: (value: string) => void) {
    const row = document.createElement('label')
    row.textContent = label
    const field = document.createElement('select')
    field.setAttribute('aria-label', label)
    for (const source of ['estimated', 'measured', 'sourced', 'user_supplied']) {
      const option = document.createElement('option')
      option.value = source
      option.textContent = source.replace('_', ' ')
      field.append(option)
    }
    field.value = value
    field.onchange = () => {
      update(field.value)
      editor.value = JSON.stringify(item, null, 2)
    }
    row.append(field)
    fields.append(row)
  }
  if ('frame' in item) {
    input('Link name', item.name, (v) => {
      item.name = v
    })
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
    provenance('Mass provenance', item.mass_kg.source, (v) => {
      item.mass_kg.source = v
    })
    input('Mass note', item.mass_kg.note ?? '', (v) => {
      item.mass_kg.note = v
    })
    let frictionSource = item.sliding_friction?.source ?? 'estimated'
    let frictionNote = item.sliding_friction?.note ?? ''
    input('Sliding friction (blank = unknown)', item.sliding_friction?.value ?? '', (v) => {
      item.sliding_friction =
        v.trim() === ''
          ? null
          : {
              value: Number(v),
              source: frictionSource,
              note: frictionNote,
            }
    })
    provenance('Friction provenance', frictionSource, (v) => {
      frictionSource = v
      if (item.sliding_friction) item.sliding_friction.source = v
    })
    input('Friction note', frictionNote, (v) => {
      frictionNote = v
      if (item.sliding_friction) item.sliding_friction.note = v
    })
    const physicsHost = document.createElement('div')
    let physicsDraft = createPhysicsDraft(item.physics)
    physicsHost.innerHTML = advancedPhysicsControls(physicsDraft, { placement: false })
      .replace('Default bounding box', 'Use export collision setting')
      .replace('Collision offset from body centre', 'Collision offset from mesh bounds centre')
    const updatePhysics = () => {
      physicsDraft = readAdvancedPhysics(physicsHost, physicsDraft)
      const checked = validateAdvancedPhysics(physicsDraft, { placement: false })
      if (checked.ok) {
        item.physics = checked.physics
        editor.value = JSON.stringify(item, null, 2)
        el<HTMLButtonElement>('apply').disabled = false
      } else {
        el<HTMLButtonElement>('apply').disabled = true
        message(checked.error)
      }
    }
    physicsHost.addEventListener('input', updatePhysics)
    physicsHost.addEventListener('change', updatePhysics)
    fields.append(physicsHost)
  } else {
    input('Joint name', item.name, (v) => {
      item.name = v
    })
    const kindLabel = document.createElement('label')
    kindLabel.textContent = 'Joint type'
    const kind = document.createElement('select')
    kind.setAttribute('aria-label', 'Joint type')
    kind.add(new Option('Fixed', 'fixed'))
    kind.add(new Option('Revolute hinge', 'revolute'))
    kind.add(new Option('Prismatic slider', 'prismatic'))
    kind.value = item.kind
    kind.onchange = () =>
      select(changeJointKind(item, kind.value as 'fixed' | 'revolute' | 'prismatic'))
    kindLabel.append(kind)
    fields.append(kindLabel)
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
    const limits = jointLimits(item)
    const unit = item.kind === 'prismatic' ? 'm' : 'rad'
    if (limits)
      ['Lower', 'Upper'].forEach((label, i) =>
        input(`${label} limit (${unit})`, limits[i], (v) => {
          limits[i] = Number(v)
        }),
      )
    if (item.drive) {
      input(
        item.kind === 'prismatic' ? 'Position gain (N/m)' : 'Position gain (Nm/rad)',
        item.drive.kp,
        (v) => {
          item.drive!.kp = Number(v)
        },
      )
      input(
        item.kind === 'prismatic' ? 'Force limit (N)' : 'Torque limit (Nm)',
        (item.kind === 'prismatic' ? item.drive.force_limit_n : item.drive.force_limit_nm)!,
        (v) => {
          if (item.kind === 'prismatic') item.drive!.force_limit_n = Number(v)
          else item.drive!.force_limit_nm = Number(v)
        },
      )
    }
    if (item.damping)
      input(
        item.kind === 'prismatic' ? 'Damping (N s/m)' : 'Damping (Nm s/rad)',
        item.damping.value,
        (v) => {
          item.damping!.value = Number(v)
        },
      )
    if (item.kind !== 'fixed') {
      const advanced = document.createElement('details')
      const summary = document.createElement('summary')
      summary.textContent = 'Advanced joint physics'
      advanced.append(summary)
      const start = fields.childElementCount
      input(
        `Spring stiffness (${item.kind === 'prismatic' ? 'N/m' : 'Nm/rad'}; blank = none)`,
        item.spring?.stiffness ?? '',
        (v) => {
          item.spring =
            v.trim() === ''
              ? null
              : {
                  stiffness: Number(v),
                  rest: item.spring?.rest ?? 0,
                  source: item.spring?.source ?? 'estimated',
                  note: item.spring?.note,
                }
        },
      )
      input(`Spring rest (${unit})`, item.spring?.rest ?? 0, (v) => {
        item.spring = {
          stiffness: item.spring?.stiffness ?? 0,
          rest: Number(v),
          source: item.spring?.source ?? 'estimated',
          note: item.spring?.note,
        }
      })
      provenance('Spring provenance', item.spring?.source ?? 'estimated', (v) => {
        if (item.spring) item.spring.source = v
      })
      input('Spring note', item.spring?.note ?? '', (v) => {
        if (item.spring) item.spring.note = v
      })
      const driverLabel = document.createElement('label')
      driverLabel.textContent = 'Linked motion driver'
      const driver = document.createElement('select')
      driver.setAttribute('aria-label', 'Linked motion driver')
      driver.add(new Option('Independent position drive', ''))
      payload!.project.joints
        .filter((j) => j.name !== item.name && j.kind === item.kind)
        .forEach((j) => driver.add(new Option(j.name, j.name)))
      driver.value = item.coupling?.driver_joint ?? ''
      driver.onchange = () => {
        item.coupling = driver.value
          ? {
              driver_joint: driver.value,
              ratio: item.coupling?.ratio ?? 1,
              offset: item.coupling?.offset ?? 0,
              source: item.coupling?.source ?? 'estimated',
              note: item.coupling?.note,
            }
          : null
        item.drive = item.coupling
          ? null
          : {
              kp: 5,
              ...(item.kind === 'prismatic' ? { force_limit_n: 2 } : { force_limit_nm: 2 }),
              source: 'estimated',
            }
        select(item)
      }
      driverLabel.append(driver)
      fields.append(driverLabel)
      if (item.coupling) {
        input('Linked motion ratio (follower / driver)', item.coupling.ratio, (v) => {
          item.coupling!.ratio = Number(v)
        })
        input(`Linked motion offset (${unit})`, item.coupling.offset, (v) => {
          item.coupling!.offset = Number(v)
        })
        provenance('Linked motion provenance', item.coupling.source, (v) => {
          item.coupling!.source = v
        })
        input('Linked motion note', item.coupling.note ?? '', (v) => {
          item.coupling!.note = v
        })
      }
      while (fields.childElementCount > start) advanced.append(fields.children[start])
      const caption = document.createElement('p')
      caption.textContent =
        'Springs act in the regenerated simulator export. Linked followers use one equality constraint and no competing actuator. This preview only moves geometry.'
      advanced.append(caption)
      fields.append(advanced)
    }
    provenance('Joint provenance', item.source, (v) => {
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
  const parents = el<HTMLSelectElement>('new-parent')
  const previousParent = parents.value
  parents.replaceChildren(...p.groups.map((g) => new Option(g.name, g.name)))
  parents.value = p.groups.some((g) => g.name === previousParent) ? previousParent : p.root_link
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
    const limits = jointLimits(j)
    if (j.kind === 'fixed' || !limits) continue
    const label = document.createElement('label')
    const title = document.createElement('span')
    const unit = j.kind === 'prismatic' ? 'm' : 'rad'
    title.textContent = `${j.name} · ${jointValues(p, values)[j.name].toFixed(3)} ${unit}${j.coupling ? ' · linked follower' : ''}`
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(limits[0])
    slider.max = String(limits[1])
    slider.step = 'any'
    slider.value = String(jointValues(p, values)[j.name])
    slider.dataset.joint = j.name
    slider.disabled = !!j.coupling
    slider.setAttribute('aria-label', j.name + (j.kind === 'prismatic' ? ' position' : ' angle'))
    slider.oninput = () => {
      values[j.name] = +slider.value
      const resolved = jointValues(p, values)
      sliders.querySelectorAll<HTMLInputElement>('input[data-joint]').forEach((input) => {
        const joint = p.joints.find((j) => j.name === input.dataset.joint)!
        const position = resolved[joint.name]
        input.value = String(position)
        input.parentElement!.querySelector('span')!.textContent =
          `${joint.name} · ${position.toFixed(3)} ${joint.kind === 'prismatic' ? 'm' : 'rad'}${joint.coupling ? ' · linked follower' : ''}`
      })
      updateView?.()
    }
    label.append(title, slider)
    sliders.append(label)
  }
  mount()
  mappingPanel.sync(p, generation)
  renderJob()
}
function collisionCaption() {
  const enabled = el<HTMLInputElement>('show-collision').checked
  const mode = el<HTMLSelectElement>('collision-mode').value
  el('collision-preview-note').textContent =
    (enabled
      ? 'Orange = collision; colored parts = visual geometry. '
      : 'Collision overlay hidden. ') +
    'Preview of current draft and selected export settings, not a saved attempt. ' +
    (mode === 'box'
      ? 'One link-local bounding box per link; empty spaces are filled. '
      : 'One convex hull per link; concavities and gaps are filled. MuJoCo compiles its own hull. ') +
    (el<HTMLInputElement>('exclude-joint-pairs').checked
      ? 'Direct parent-child collision pairs will be excluded. '
      : 'Native parent-child filtering selected. ') +
    'Sliders move the geometry only; this view does not detect or resolve contacts.'
}
function mount() {
  collisionCaption()
  el('collision-preview-warning').textContent = ''
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
    const collisionMeshes: { link: string; mesh: THREE.Mesh; edges: THREE.LineSegments }[] = []
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
    if (el<HTMLInputElement>('show-collision').checked) {
      const preview = buildCollisionPreviews(
        payload!,
        el<HTMLSelectElement>('collision-mode').value as CollisionMode,
      )
      el('collision-preview-warning').textContent = preview.warnings.join(' ')
      for (const proxy of preview.proxies) {
        const mesh = new THREE.Mesh(
          proxy.geometry,
          new THREE.MeshBasicMaterial({
            color: '#ff8a3d',
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
          }),
        )
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(proxy.geometry),
          new THREE.LineBasicMaterial({
            color: '#ff8a3d',
            transparent: true,
            opacity: 0.9,
            depthTest: false,
          }),
        )
        mesh.add(edges)
        mesh.matrixAutoUpdate = false
        mesh.renderOrder = 2
        edges.renderOrder = 3
        scene.add(mesh)
        collisionMeshes.push({ link: proxy.link, mesh, edges })
      }
    }
    for (const g of p.groups) {
      const a = new THREE.AxesHelper(0.025)
      a.matrixAutoUpdate = false
      scene.add(a)
      axes.push(a)
    }
    for (const j of p.joints) {
      if (j.kind === 'fixed' || !j.axis) continue
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
        collisionMeshes.forEach(({ link, mesh }) => {
          mesh.matrix.copy(transforms[link])
          mesh.matrixWorldNeedsUpdate = true
        })
        p.groups.forEach((g, i) => {
          axes[i].matrix.copy(transforms[g.name])
          axes[i].matrixWorldNeedsUpdate = true
        })
        let n = 0
        for (const j of p.joints) {
          if (j.kind === 'fixed' || !j.axis) continue
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
      collisionMeshes.forEach(({ mesh, edges }) => {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        edges.geometry.dispose()
        ;(edges.material as THREE.Material).dispose()
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
el<HTMLInputElement>('show-collision').onchange = () => {
  if (payload) mount()
}
el<HTMLSelectElement>('collision-mode').onchange = () => {
  if (payload) mount()
}
el<HTMLInputElement>('exclude-joint-pairs').onchange = collisionCaption
el<HTMLInputElement>('load').onchange = async () => {
  const f = el<HTMLInputElement>('load').files?.[0]
  if (!f) return
  const active = beginWorkspace()
  try {
    if (f.size > 100 * 1024 * 1024) throw Error('Maximum package size: 100 MiB')
    const next = parsePackage(await f.text())
    if (active !== generation) return
    mutationPending = false
    payload = next
    job = undefined
    savedProject = ''
    render()
    message('Loaded locally. Review all groups and joints; physical calibration remains separate.')
  } catch (e) {
    workspaceError(active, e)
  }
}
el('add-link').onclick = () => {
  if (!payload) return
  try {
    const next = structuredClone(payload)
    next.project = addConnectedLink(
      next.project,
      el<HTMLInputElement>('new-link-name').value.trim(),
      el<HTMLSelectElement>('new-parent').value,
      el<HTMLInputElement>('new-joint-name').value.trim(),
      el<HTMLSelectElement>('new-kind').value as 'fixed' | 'revolute' | 'prismatic',
    )
    payload = parsePackage(JSON.stringify(next))
    render()
    el<HTMLSelectElement>('selection').value = `group:${payload.project.groups.length - 1}`
    select()
    message('Link and joint added. Assign parts and review the starting assumptions before export.')
  } catch (e) {
    error(e)
  }
}
el('create-draft').onclick = async () => {
  if (mutationPending) return
  const active = beginWorkspace()
  const button = el<HTMLButtonElement>('create-draft')
  button.disabled = true
  try {
    const units = el<HTMLSelectElement>('draft-units').value
    const files = Array.from(el<HTMLInputElement>('draft-meshes').files || [])
    const name = el<HTMLInputElement>('draft-name').value.trim()
    if (units !== 'm' && units !== 'mm') throw Error('Choose the mesh source units.')
    if (!files.length) throw Error('Select component OBJ/STL meshes.')
    message('Importing meshes and preparing an unreviewed draft…')
    const created = await assemblyApi.fromMeshes(
      name,
      units,
      el<HTMLInputElement>('draft-synthetic').checked,
      files,
    )
    if (active === generation) await openJob(created.id, active)
  } catch (e) {
    workspaceError(active, e)
  } finally {
    button.disabled = false
  }
}
el('set-token').onclick = async () => {
  const button = el<HTMLButtonElement>('set-token')
  const input = el<HTMLInputElement>('api-token')
  if (button.disabled || !input.value.trim()) return
  button.disabled = true
  try {
    const access = await browserAccess.signIn(input.value)
    setAssemblyToken('')
    input.value = ''
    message(accessDescription(access))
  } catch (e) {
    error(e)
  } finally {
    button.disabled = false
  }
}
el('sign-out').onclick = async () => {
  try {
    await browserAccess.signOut()
    setAssemblyToken('')
    message('Signed out on this browser.')
  } catch (e) {
    error(e)
  }
}
el('import').onclick = async () => {
  const active = beginWorkspace()
  try {
    const project = el<HTMLInputElement>('import-project').files?.[0]
    if (!project) throw Error('Select a review project JSON.')
    const raw = JSON.parse(await project.text()) as ReviewPackage['project']
    if (raw.schema_version !== 'assembly-review-1.0' || !Array.isArray(raw.parts))
      throw Error('Select an assembly-review-1.0 project.')
    if (active !== generation) return
    const expected = new Set(raw.parts.map((part) => part.mesh))
    const files = [
      ...Array.from(el<HTMLInputElement>('import-meshes').files || []),
      ...Array.from(el<HTMLInputElement>('import-folder').files || []),
    ]
    const meshes = [...expected].map((path) => {
      const matches = files.filter(
        (file) =>
          file.name === path ||
          file.webkitRelativePath === path ||
          file.webkitRelativePath.endsWith('/' + path),
      )
      if (matches.length !== 1) throw Error(`Select exactly one source mesh for ${path}.`)
      return { path, file: matches[0] }
    })
    message('Importing source meshes and checking hashes…')
    const created = await assemblyApi.create(project, meshes)
    if (active === generation) await openJob(created.id, active)
  } catch (e) {
    workspaceError(active, e)
  }
}
el('open-job').onclick = () => {
  openJob(el<HTMLInputElement>('job-id').value.trim()).catch(error)
}
el('save-revision').onclick = async () => {
  if (!job || !payload || mutationPending) return
  const active = generation
  const submitted = JSON.stringify(payload.project)
  mutationPending = true
  renderJob()
  try {
    const next = await assemblyApi.save(job.id, JSON.parse(submitted), job.revision)
    if (active !== generation) return
    job = next
    savedProject = submitted
    savedMapping = ''
    savedMappingVersion = 0
    message(`Saved revision ${job.revision}.`)
  } catch (e) {
    if (active === generation) error(e)
  } finally {
    if (active === generation) {
      mutationPending = false
      renderJob()
    }
  }
}
el('save-mapping-job').onclick = async () => {
  if (!job || !payload || mutationPending || running(job.status)) return
  if (JSON.stringify(payload.project) !== savedProject) {
    message('Save this assembly revision before retaining mapping evidence.')
    return
  }
  const active = generation
  try {
    const review = mappingPanel.getReview()
    if (!review) throw Error('Load a capture pack or mapping review first.')
    mutationPending = true
    renderJob()
    const next = await assemblyApi.saveMapping(job.id, job.revision, savedMappingVersion, review)
    if (active !== generation) return
    job = next
    savedMapping = JSON.stringify(review)
    savedMappingVersion = next.mapping_version ?? 0
    message(
      `Saved mapping version ${job.mapping_version} for revision ${job.revision}. Existing exports are unchanged.`,
    )
  } catch (e) {
    if (active === generation) error(e)
  } finally {
    if (active === generation) {
      mutationPending = false
      renderJob()
    }
  }
}
el('process').onclick = async () => {
  if (!job || !payload || mutationPending) return
  try {
    const currentMapping = mappingPanel.getReview()
    if (currentMapping && JSON.stringify(currentMapping) !== savedMapping) {
      message('Save the current mapping to this job before processing.')
      return
    }
  } catch (e) {
    error(e)
    return
  }
  if (JSON.stringify(payload.project) !== savedProject) {
    message('Save this revision before processing.')
    return
  }
  const active = generation
  mutationPending = true
  renderJob()
  try {
    const next = await assemblyApi.process(
      job.id,
      job.revision,
      {
        collision_mode: el<HTMLSelectElement>('collision-mode').value as 'box' | 'convex_mesh',
        exclude_joint_pairs: el<HTMLInputElement>('exclude-joint-pairs').checked,
      },
      savedMappingVersion,
    )
    if (active !== generation) return
    job = next
    message('Preparation started. Export and motion validation results will appear separately.')
  } catch (e) {
    if (active === generation) error(e)
  } finally {
    if (active === generation) {
      mutationPending = false
      renderJob()
    }
  }
}
el('selection').onchange = () => select()
el('apply').onclick = () => {
  if (!payload) return
  try {
    const next = structuredClone(payload)
    const [kind, n] = el<HTMLSelectElement>('selection').value.split(':')
    const item = JSON.parse(el<HTMLTextAreaElement>('editor').value)
    if (kind === 'group') {
      const oldName = next.project.groups[+n].name
      if (oldName !== item.name) next.project = renameLink(next.project, oldName, item.name)
      next.project.groups[+n] = item
    } else next.project.joints[+n] = item
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
  mappingPanel.invalidatePending()
  generation += 1
  dispose?.()
  if (pollTimer) clearTimeout(pollTimer)
})
