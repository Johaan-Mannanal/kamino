import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { orientationMatrix } from './orientation'
import type { Job, Orientation } from './types'

export type TargetInventory = {
  source_mesh_sha256: string
  algorithm: string
  islands: {
    id: string
    label: string
    node_index: number
    face_count: number
    vertex_count: number
    bounds_input_units: number[][]
  }[]
  geometry?: Record<string, { vertices: number[][]; faces: number[][] }>
}
export type TargetReviewRequest = {
  source_mesh_sha256: string
  island_ids: string[]
  orientation: Orientation
  review_note: string
  acknowledge_geometry: boolean
  expected_input_revision: number
}
export type TargetReview = Omit<TargetReviewRequest, 'expected_input_revision'> & {
  algorithm: string
  geometry_context_sha256: string
  reviewed_at: string
  state: 'user_reviewed_not_physically_verified'
}
export type TargetDraft = { selectedIslandIds: string[]; reviewNote: string; acknowledged: boolean }
export type TargetReviewState = {
  inventory: TargetInventory | null
  loading: boolean
  error: string | null
  draft: TargetDraft
}
const sameOrientation = (a: Orientation, b: Orientation) =>
  ['x_deg', 'y_deg', 'z_deg'].every((k) => a[k as keyof Orientation] === b[k as keyof Orientation])
const sameIds = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function initialTargetDraft(job: Job, inventory: TargetInventory): TargetDraft {
  const r = job.geometry_review
  if (
    !r ||
    r.source_mesh_sha256 !== inventory.source_mesh_sha256 ||
    r.island_ids.some((id) => !inventory.islands.some((i) => i.id === id))
  )
    return { selectedIslandIds: [], reviewNote: '', acknowledged: false }
  return {
    selectedIslandIds: [...r.island_ids],
    reviewNote: r.review_note,
    acknowledged: sameOrientation(r.orientation, job.orientation),
  }
}
export function targetReviewStatus(
  job: Job,
  state: TargetReviewState,
): {
  status: 'loading' | 'error' | 'unreviewed' | 'unsaved' | 'stale' | 'reviewed'
  referenceReady: boolean
  canProcess: boolean
  reason: string
} {
  const result = (
    status: ReturnType<typeof targetReviewStatus>['status'],
    reason: string,
    referenceReady = false,
  ) => ({ status, reason, referenceReady, canProcess: status === 'reviewed' && referenceReady })
  if (state.error) return result('error', state.error)
  if (state.loading || !state.inventory)
    return result('loading', 'Load the source geometry before target review.')
  const r = job.geometry_review
  if (!r)
    return result(
      state.draft.selectedIslandIds.length ? 'unsaved' : 'unreviewed',
      'Choose the surfaces belonging to your intended object and save its review.',
    )
  if (
    r.source_mesh_sha256 !== state.inventory.source_mesh_sha256 ||
    !sameOrientation(r.orientation, job.orientation)
  )
    return result('stale', 'Source or orientation changed. Review the target and reference again.')
  if (
    !sameIds(state.draft.selectedIslandIds, r.island_ids) ||
    !state.draft.acknowledged ||
    state.draft.reviewNote.trim() !== r.review_note.trim()
  )
    return result(
      'unsaved',
      'Target review has unsaved changes. Save the review before processing.',
    )
  const ready = job.properties?.geometry_context_sha256 === r.geometry_context_sha256
  return result(
    'reviewed',
    ready
      ? 'Target reviewed by you. Physical accuracy remains unverified.'
      : 'Target reviewed; review and save its reference correspondence.',
    ready,
  )
}
export function targetReviewRequest(job: Job, state: TargetReviewState): TargetReviewRequest {
  const ids = state.draft.selectedIslandIds,
    inventory = state.inventory
  if (!inventory || !ids.length || !state.draft.acknowledged || !state.draft.reviewNote.trim())
    throw Error(
      'Select at least one surface, describe your review and acknowledge the selected geometry.',
    )
  if (ids.some((id) => !inventory.islands.some((i) => i.id === id)))
    throw Error('Source changed; reload the geometry inventory.')
  return {
    source_mesh_sha256: inventory.source_mesh_sha256,
    island_ids: [...ids],
    orientation: { ...job.orientation },
    review_note: state.draft.reviewNote.trim(),
    acknowledge_geometry: true,
    expected_input_revision: job.input_revision ?? 1,
  }
}
export function readTargetDraft(host: HTMLElement): TargetDraft {
  return {
    selectedIslandIds: [
      ...host.querySelectorAll<HTMLInputElement>('[data-target-island]:checked'),
    ].map((e) => e.value),
    reviewNote: host.querySelector<HTMLTextAreaElement>('#target-review-note')?.value || '',
    acknowledged: host.querySelector<HTMLInputElement>('#target-review-ack')?.checked || false,
  }
}
export function targetReviewControls(job: Job, state: TargetReviewState): string {
  const status = targetReviewStatus(job, state)
  return `<section id="target-review"><h2>Target geometry &amp; review</h2><div class="body"><p>Choose every surface that belongs to one intended object. Several separate surfaces may belong together. Leave unrelated objects unchecked.</p><p>Blue surfaces are selected; grey surfaces are excluded. Geometry proportions are unverified. Save orientation before confirming this target.</p><div id="target-geometry-view" class="mesh-viewer" role="img" aria-label="All source surfaces, with selected target highlighted"></div><div id="target-source-photos" aria-label="Original source photos"></div><form id="target-review-form"><fieldset ${state.loading ? 'disabled' : ''}><legend>Surfaces in the reconstruction</legend>${(state.inventory?.islands || []).map((i) => `<label><input type="checkbox" data-target-island value="${esc(i.id)}" ${state.draft.selectedIslandIds.includes(i.id) ? 'checked' : ''}> ${esc(i.label)}</label>`).join('')}<button type="button" id="target-select-all">Select all surfaces</button><button type="button" id="target-clear">Clear selection</button><label>Review note<textarea id="target-review-note" maxlength="2000" required>${esc(state.draft.reviewNote)}</textarea></label><label><input id="target-review-ack" type="checkbox" ${state.draft.acknowledged ? 'checked' : ''}> I inspected the selected target geometry. Physical shape and dimensions remain unverified.</label><button type="submit" id="save-target-review">Save target review</button></fieldset></form><p id="target-review-status" role="status">${esc(status.reason)}</p>${state.error ? '<button id="reload-target-geometry" type="button">Reload geometry</button>' : ''}</div></section>`
}
export function mountTargetGeometry(
  host: HTMLElement,
  inventory: TargetInventory,
  orientation: Orientation,
  selectedIslandIds: string[],
): () => void {
  let renderer: THREE.WebGLRenderer | undefined,
    controls: OrbitControls | undefined,
    observer: ResizeObserver | undefined,
    frame = 0
  const scene = new THREE.Scene(),
    objects: THREE.Mesh[] = []
  const cleanup = () => {
    cancelAnimationFrame(frame)
    observer?.disconnect()
    controls?.dispose()
    for (const m of objects) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    renderer?.dispose()
    renderer?.forceContextLoss()
    renderer = undefined
  }
  try {
    if (!inventory.geometry) throw Error('Geometry preview has not loaded.')
    const group = new THREE.Group()
    for (const island of inventory.islands) {
      const data = inventory.geometry[island.id]
      if (!data) throw Error('Geometry preview is incomplete.')
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices.flat(), 3))
      geometry.setIndex(data.faces.flat())
      geometry.computeVertexNormals()
      const selected = selectedIslandIds.includes(island.id),
        material = new THREE.MeshStandardMaterial({
          color: selected ? 0x448dde : 0x777777,
          transparent: !selected,
          opacity: selected ? 1 : 0.3,
          side: THREE.DoubleSide,
          depthWrite: selected,
        })
      const mesh = new THREE.Mesh(geometry, material)
      group.add(mesh)
      objects.push(mesh)
    }
    group.applyMatrix4(orientationMatrix(orientation))
    group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group),
      extent = box.getSize(new THREE.Vector3()).length()
    if (!Number.isFinite(extent) || extent <= 0) throw Error('Source has invalid preview bounds.')
    group.position.sub(box.getCenter(new THREE.Vector3()))
    scene.add(group, new THREE.HemisphereLight(0xffffff, 0x666666, 3))
    scene.background = new THREE.Color('#151719')
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(extent, -extent, 2 * extent)
    scene.add(light)
    const axes = new THREE.AxesHelper(extent * 0.6)
    scene.add(axes)
    objects.push(axes as unknown as THREE.Mesh)
    const camera = new THREE.PerspectiveCamera(40, 1, extent / 10000, extent * 100)
    camera.position.set(extent * 1.3, -extent * 1.5, extent)
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    host.replaceChildren(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const resize = () => {
      const width = host.clientWidth || 500,
        height = host.clientHeight || 320
      renderer?.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const animate = () => {
      if (!renderer) return
      controls?.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()
  } catch (error) {
    cleanup()
    host.textContent = `Preview unavailable: ${(error as Error).message} Inspect the original source download before reviewing.`
  }
  return cleanup
}
