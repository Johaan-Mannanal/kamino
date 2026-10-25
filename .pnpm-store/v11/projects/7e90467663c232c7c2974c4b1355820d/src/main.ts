import './style.css'
import './workflow.css'
import './entry.css'
import {
  creatingScreen,
  guideDialog,
  homeScreen,
  mountHomeStory,
  PhotoPreviews,
  uploadScreen,
  type EntryPage,
} from './entry-screens'
import { liveApi, setApiToken, type Api } from './api'
import { mockApi, setMockScenario } from './mock'
import { applySuggestionToDraft, makeProperties, validatePhotos } from './properties'
import type {
  Job,
  Source,
  Suggestions,
  Orientation,
  ValidationReport,
  SizingPreview,
} from './types'
import { makeSizing, sizingControls, sizingMode } from './sizing'
import { makeOrientation } from './orientation'
import { mountViewer } from './viewer'
import { canRetry, canDownloadBundle, preparedMeshPath } from './pipeline'

const syntheticDemo = new URL(location.href).searchParams.get('demo') === 'synthetic'
const mode = !syntheticDemo && import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'
const api: Api = mode === 'live' ? liveApi : mockApi
const app = document.querySelector<HTMLDivElement>('#app')!
let entryPage: EntryPage =
  new URL(location.href).searchParams.get('view') === 'upload'
    ? 'upload'
    : new URL(location.href).searchParams.has('job')
      ? null
      : 'home'
const photoPreviews = new PhotoPreviews()
let disposeHome: (() => void) | undefined
let replaceIndex: number | null = null
let guideTrigger: HTMLElement | null = null
let files: File[] = [],
  job: Job | null = null,
  message = '',
  busy = false
let busyAction: 'upload' | 'save' | 'process' | null = null
let validation: ValidationReport | null = null,
  reportError = '',
  reportPath = ''
let timer: number | undefined
let jobGeneration = 0
let draft: Record<string, string> = {}
let suggestions: Suggestions | null = null,
  suggestionBusy = false,
  suggestionMessage = '',
  objectHint = ''
let orientationDraft: Record<string, string> = {}
let sizingPreview: SizingPreview | null = null
let sizingDraftVersion = 0
let viewerKey = '',
  viewerNode: HTMLElement | null = null,
  disposeViewer: (() => void) | undefined
const zeroOrientation: Orientation = { x_deg: 0, y_deg: 0, z_deg: 0 }
let scenario: 'normal' | 'provider_failure' | 'completed_demo' | 'validation_failure' = 'normal'
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const val = (key: string, fallback: string | number) => esc(draft[key] ?? String(fallback))
const names: Record<Source, string> = {
  measured: 'Measured',
  user_supplied: 'User supplied',
  sourced: 'Sourced',
  estimated: 'Estimated',
}
const opts = (current: Source) =>
  (Object.keys(names) as Source[])
    .map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${names[s]}</option>`)
    .join('')
const select = (name: string, current: Source, disabled: boolean) =>
  `<select name="${name}" ${disabled ? 'disabled' : ''}>${opts((draft[name] as Source) || current)}</select>`
const input = (
  name: string,
  label: string,
  fallback: string | number,
  disabled: boolean,
  required = false,
) =>
  `<label>${label}<input name="${name}" ${required ? 'type="number" min="0.001" step="any" required' : 'type="text"'} value="${val(name, fallback)}" ${disabled ? 'disabled' : ''}></label>`
const running = (s: Job['status']) =>
  ['queued', 'reconstructing', 'preparing', 'validating'].includes(s)
const safe = (p: string) =>
  p.split('/').every((x) => x && x !== '.' && x !== '..' && !x.includes(':') && !x.includes('\\'))
const link = (p: string, label: string) =>
  safe(p)
    ? `<button type="button" class="download" data-path="${esc(p)}"><span>${esc(label)}</span><span>Download</span></button>`
    : ''
function propertySummary() {
  const properties = job?.properties
  if (!properties) return ''
  const number = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value)
  const dimensions = properties.dimensions_m
  const friction = properties.sliding_friction
  const row = (name: string, display: string, source: Source | null, note?: string | null) =>
    `<tr><th scope="row">${name}</th><td>${display}${note ? `<span class="property-note">${esc(note)}</span>` : ''}</td><td>${source ? names[source] : ''}</td></tr>`
  return `<table class="property-summary"><caption class="sr-only">Confirmed object data</caption><tbody>${row('Dimensions', `${number(dimensions.x * 1000)} × ${number(dimensions.y * 1000)} × ${number(dimensions.z * 1000)} mm`, dimensions.source, dimensions.note)}${row('Mass', `${number(properties.mass_kg.value * 1000)} g`, properties.mass_kg.source, properties.mass_kg.note)}${row('Sliding friction', friction ? number(friction.value) : 'Unknown', friction?.source || null, friction?.note)}</tbody></table>`
}
function sizingForm() {
  const props = job?.properties || null
  const selected = draft.sizing_mode || sizingMode(props)
  return (
    sizingControls(props, draft) +
    (selected === 'uniform'
      ? ''
      : `
    <div class="field-head">Full dimensions <span>millimetres</span></div>
    <div class="grid three">${(['x', 'y', 'z'] as const).map((a) => input(a, a.toUpperCase(), props ? props.dimensions_m[a] * 1000 : '', false, true)).join('')}</div>
    <div class="grid two gap"><label>Dimension source ${select('dimensions_source', props?.dimensions_m.source || 'estimated', false)}</label>${input('dimensions_note', 'Note · optional', props?.dimensions_m.note || '', false)}</div>`)
  )
}
function attemptHistory() {
  if (!job?.attempts?.length) return ''
  return `<details><summary>Prior processing attempts (${job.attempts.length})</summary>${job.attempts
    .map(
      (a) => `
    <div><p>Revision ${a.inputs.input_revision} · ${esc(a.status)} · ${esc(a.inputs.properties.sizing?.mode || 'legacy_independent_axes')}</p>
    ${a.inputs_path ? link(a.inputs_path, 'Saved attempt inputs') : ''}${a.bundle_path ? link(a.bundle_path, 'Retained simulation ZIP') : ''}${a.validation_path ? link(a.validation_path, 'Attempt numerical report') : ''}</div>`,
    )
    .join('')}</details>`
}
const readPropertyForm = () =>
  Object.fromEntries(
    [...new FormData(document.querySelector<HTMLFormElement>('#properties')!)].map(([k, v]) => [
      k,
      String(v),
    ]),
  )
async function previewSizing(values: Record<string, string>) {
  if (!job) throw Error('Open a reconstructed job first.')
  if (Object.keys(orientationDraft).length)
    throw Error('Save the reviewed orientation before sizing.')
  const sizing = makeSizing(values, job.orientation)
  if (!sizing || sizing.mode !== 'uniform') return null
  const id = job.id,
    version = sizingDraftVersion,
    revision = job.input_revision,
    orientation = JSON.stringify(job.orientation)
  const result = await api.previewSizing(id, { sizing, orientation: job.orientation })
  if (
    job?.id !== id ||
    version !== sizingDraftVersion ||
    job.input_revision !== revision ||
    JSON.stringify(job.orientation) !== orientation
  )
    throw Error('Inputs changed during preview; review and preview again.')
  return result
}
function reportView() {
  if (reportError)
    return `<p class="notice" role="status">${esc(reportError)} <button id="retry-report">Retry report</button></p>`
  if (!validation)
    return job?.validation_path
      ? '<p class="hint" role="status">Loading validation report…</p>'
      : ''
  return `<div class="validation"><strong>${validation.passed ? (mode === 'mock' ? 'Mock validation passed' : 'Validation passed') : mode === 'mock' ? 'Mock validation failed' : 'Validation failed'}</strong><div class="validation-runs"><span>Original scene: ${validation.original ? (validation.original.passed ? (mode === 'mock' ? 'Simulated pass' : 'Passed') : mode === 'mock' ? 'Simulated failure' : 'Failed') : 'Not checked'}</span><span>Relocated scene: ${validation.relocated ? (validation.relocated.passed ? (mode === 'mock' ? 'Simulated pass' : 'Passed') : mode === 'mock' ? 'Simulated failure' : 'Failed') : 'Not checked'}</span></div><p>${esc(validation.scope || validation.error || 'Inspect the report for individual checks.')}</p><p>${mode === 'mock' ? 'No simulation checks were executed.' : validation.viewer_inspected ? 'Viewer inspection recorded.' : 'Headless checks only. Viewer inspection remains.'}</p>${job?.asset?.notes.length ? `<details><summary>Geometry assumptions</summary><ul>${job.asset.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>` : ''}</div>`
}
function stages() {
  const s = job?.status,
    recon = !!job?.mesh_path,
    props = !!job?.properties,
    geometry = !!job?.asset,
    exported = canDownloadBundle(job)
  const items: [string, string, string][] = [
    [
      'Upload',
      job ? 'done' : 'waiting',
      job
        ? `${job.source_images.length} ${job.source_images.length === 1 ? 'photo' : 'photos'}`
        : '',
    ],
    [
      'Reconstruction',
      s === 'failed' && !recon ? 'failed' : recon ? 'done' : job ? 'current' : 'waiting',
      job ? `${job.progress}%` : '',
    ],
    [
      'Properties',
      props ? 'done' : s === 'awaiting_properties' ? 'current' : 'waiting',
      props ? 'Saved' : '',
    ],
    ['Geometry', s === 'preparing' ? 'current' : geometry ? 'done' : 'waiting', ''],
    [
      'Simulation',
      s === 'failed' && job?.error?.code === 'validation_failed'
        ? 'failed'
        : exported
          ? 'done'
          : s === 'validating'
            ? 'current'
            : 'waiting',
      '',
    ],
    ['Export', exported ? 'done' : 'waiting', ''],
  ]
  return items
    .map(
      ([name, state, detail]) =>
        `<div class="stage ${state}" ${state === 'current' ? 'aria-current="step"' : ''}><span class="mark" aria-hidden="true">${state === 'done' ? '✓' : state === 'failed' ? '!' : ''}</span><strong>${name}</strong><span class="sr-only">${state === 'done' ? 'Complete' : state === 'current' ? 'In progress' : state === 'failed' ? 'Failed' : 'Waiting'}</span><span>${detail}</span></div>`,
    )
    .join('')
}
function suggestionView(canSave: boolean) {
  return `<details class="suggestions"><summary>Optional Gemini estimates</summary><p>Unverified estimates. Review values and provenance before saving. Manual entry stays available.</p><label>Object hint<input id="object-hint" value="${esc(objectHint)}"></label><div class="suggestion-actions"><button type="button" id="cached-suggestions" ${suggestionBusy ? 'disabled' : ''}>Load saved suggestions</button><button type="button" id="request-suggestions" ${suggestionBusy ? 'disabled' : ''}>Request suggestions</button><button type="button" id="refresh-suggestions" ${suggestionBusy ? 'disabled' : ''}>Refresh estimates</button></div>${suggestionBusy ? '<p role="status">Requesting suggestions…</p>' : ''}${suggestionMessage ? `<p role="status">${esc(suggestionMessage)}</p>` : ''}${
    suggestions
      ? `<div class="suggestion-result"><strong>Estimated · unverified</strong><p>Dimensions: ${suggestions.dimensions_m ? `${esc(String(suggestions.dimensions_m.x * 1000))} × ${esc(String(suggestions.dimensions_m.y * 1000))} × ${esc(String(suggestions.dimensions_m.z * 1000))} mm` : 'Unknown'}. Mass: ${suggestions.mass_kg ? `${esc(String(suggestions.mass_kg.value * 1000))} g` : 'Unknown'}. Friction: ${suggestions.sliding_friction ? esc(String(suggestions.sliding_friction.value)) : 'Unknown'}.</p><ul>${[
          suggestions.dimensions_m?.note,
          suggestions.mass_kg?.note,
          suggestions.sliding_friction?.note,
          ...suggestions.notes,
          ...suggestions.clarifying_questions,
        ]
          .filter(Boolean)
          .map((note) => `<li>${esc(note!)}</li>`)
          .join(
            '',
          )}</ul><button type="button" id="apply-suggestions" ${!canSave || busy ? 'disabled' : ''}>Apply estimates to editable form</button></div>`
      : ''
  }</details>`
}
function orientationView(canSave: boolean, done: boolean) {
  if (!job?.mesh_path) return ''
  const orientation = job.orientation || zeroOrientation
  return `<section><h2>Mesh preview & orientation</h2><div class="body"><div id="mesh-viewer" class="mesh-viewer"></div><p class="hint">Drag to orbit · scroll to zoom · red X, green Y, blue Z. Preview uses the reviewed rotation and the latest previewed or saved sizing. While edits are unsaved it shows raw proportions; preview dimensions again before saving. Prepared downloads include saved rotation and sizing.</p>${done ? `<p>Saved rotation: X ${orientation.x_deg}°, Y ${orientation.y_deg}°, Z ${orientation.z_deg}°.</p>` : `<form id="orientation"><p>Right-handed, fixed X then Y then Z (Rz × Ry × Rx), before centring and scaling. Dimensions describe the final axes.</p><div class="grid three">${(['x_deg', 'y_deg', 'z_deg'] as const).map((axis) => `<label>${axis[0].toUpperCase()} · degrees<input name="${axis}" type="number" min="-180" max="180" step="any" required value="${esc(orientationDraft[axis] ?? String(orientation[axis]))}"></label>`).join('')}</div><div class="suggestion-actions"><button type="button" id="preview-orientation">Preview rotation</button><button type="submit" ${!canSave || busy ? 'disabled' : ''}>Save orientation</button></div>${Object.keys(orientationDraft).length ? '<p class="hint">Rotation draft is not saved. Save before processing.</p>' : ''}</form>`}</div></section>`
}
function syncViewer() {
  const host = document.querySelector<HTMLElement>('#mesh-viewer')
  if (!host || !job?.mesh_path) {
    disposeViewer?.()
    disposeViewer = undefined
    viewerNode = null
    viewerKey = ''
    return
  }
  let orientation = job.orientation || zeroOrientation
  try {
    if (Object.keys(orientationDraft).length) orientation = makeOrientation(orientationDraft)
  } catch {
    /* retain saved preview until valid */
  }
  const scales =
    sizingPreview?.sizing_result.scale_factors ||
    (Object.keys(draft).length === 0 && Object.keys(orientationDraft).length === 0
      ? job.sizing_result?.scale_factors
      : undefined)
  const key = JSON.stringify([job.id, job.mesh_path, orientation, scales])
  if (key === viewerKey && viewerNode) {
    host.replaceWith(viewerNode)
    return
  }
  disposeViewer?.()
  viewerNode = host
  viewerKey = key
  disposeViewer = mountViewer(host, api, job.id, job.mesh_path, orientation, scales)
}
function render() {
  // A late request from a removed mount must not bind handlers onto a newer app.
  if (!app.isConnected) return
  disposeHome?.()
  disposeHome = undefined
  photoPreviews.sync(files)
  const isEntry =
    entryPage !== null || !job?.mesh_path || ['queued', 'reconstructing'].includes(job.status)
  document.body.classList.toggle('entry-view', isEntry)
  if (isEntry) {
    let screen =
      entryPage === 'home'
        ? homeScreen(!!job)
        : entryPage === 'upload'
          ? uploadScreen({ files, previews: photoPreviews, busy, job, mock: mode === 'mock' })
          : creatingScreen(job)
    if (message && entryPage !== 'home')
      screen = screen.replace(
        '<main ',
        `<div class="notice" role="status" aria-live="polite">${esc(message)} <button id="dismiss" aria-label="Dismiss">×</button></div><main `,
      )
    app.innerHTML = `<div class="k-entry"><a class="skip" href="#entry-content">Skip to content</a>${screen}${mode === 'live' && entryPage !== 'home' ? '<details class="k-access"><summary>API access</summary><label>Application token<input id="api-token" type="password" autocomplete="off" placeholder="Only needed for a protected backend"></label><button id="connect" type="button">Set token</button></details>' : ''}</div>${guideDialog()}`
    bind()
    syncViewer()
    if (entryPage === 'home') disposeHome = mountHomeStory(app)
    return
  }
  const focus = document.activeElement as HTMLInputElement | HTMLSelectElement | null
  const focusName = focus?.name
  const cursor =
    focus instanceof HTMLInputElement && focus.type === 'text'
      ? [focus.selectionStart, focus.selectionEnd]
      : null
  const editable = !!job,
    done = job?.status === 'preparing' || job?.status === 'validating',
    canSave = job?.status === 'awaiting_properties' || job?.status === 'completed' || canRetry(job)
  app.innerHTML = `<a class="skip" href="#workflow">Skip to content</a><header><div><strong translate="no">Kamino</strong></div></header>
  <main id="workflow"><h1>Create an asset</h1>
  ${mode === 'mock' || job?.synthetic ? `<div class="mode-note"><strong>Synthetic demo</strong><span>Synthetic geometry. This job does not demonstrate photo reconstruction.</span></div>` : ''}
  ${message ? `<div class="notice" role="status" aria-live="polite">${esc(message)} <button id="dismiss" aria-label="Dismiss">×</button></div>` : ''}
  ${mode === 'live' ? '<details class="access"><summary>API access</summary><label>Application token<input id="api-token" type="password" autocomplete="off" placeholder="Only needed for a protected backend"></label><button id="connect" type="button">Set token</button></details>' : ''}
  <section><h2><span>1</span>Photos</h2><div class="body"><label class="drop" id="drop" for="photos">Drop photos here or choose files <span>1–4 JPEG, PNG, or WebP · 10 MiB each · 25 MP</span></label><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>${files.map((f, i) => `<div class="selected"><span>${esc(f.name)}</span><button type="button" data-index="${i}" class="remove" aria-label="Remove ${esc(f.name)}">Remove</button></div>`).join('')}${mode === 'mock' ? `<label class="demo">Demo result ${selectScenario()}</label>` : ''}<button class="primary" id="upload" ${busy || !files.length ? 'disabled' : ''}>${busyAction === 'upload' ? '<span class="spinner" aria-hidden="true"></span>' : ''}${job ? 'Start new job' : 'Upload photos'}</button></div></section>
  <section><h2><span>2</span>Object data</h2><div class="body">${editable && !done ? suggestionView(!!canSave) : ''}${done ? propertySummary() : editable ? `<form id="properties">${sizingForm()}<div class="grid two gap">${input('mass', 'Mass · grams', job?.properties ? job.properties.mass_kg.value * 1000 : '', !!done, true)}<label>Mass source ${select('mass_source', job?.properties?.mass_kg.source || 'user_supplied', !!done)}</label></div>${input('mass_note', 'Mass note · optional', job?.properties?.mass_kg.note || '', !!done)}<div class="grid two gap"><label>Sliding friction · blank if unknown<input name="friction" type="number" min="0" step="any" value="${val('friction', job?.properties?.sliding_friction?.value ?? '')}" ${done ? 'disabled' : ''}></label><label>Friction source ${select('friction_source', job?.properties?.sliding_friction?.source || 'estimated', !!done)}</label></div>${input('friction_note', 'Friction note · optional', job?.properties?.sliding_friction?.note || '', !!done)}<div class="form-end"><span>mm → m and g → kg when saved</span>${!done ? `<button id="save-properties" type="submit" class="primary" ${!canSave || busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save properties'}</button>` : ''}</div>${!canSave && !done ? `<p class="hint">${job ? 'Enter measurements now. Save after reconstruction.' : 'Upload photos to start.'}</p>` : ''}</form>` : '<p class="empty">Upload photos to add measurements.</p>'}</div></section>
  ${orientationView(!!canSave, !!done)}
  <section><h2><span>3</span>Process</h2><div class="body"><div class="stages" aria-label="Processing stages">${stages()}</div>${job ? `<div class="jobline"><span>Job ${esc(job.id.slice(0, 8))} · ${esc(job.provider)} · ${job.synthetic ? 'Synthetic' : 'Provider generated'}</span><button id="refresh" ${busy ? 'disabled' : ''}>Refresh</button></div>` : ''}${job?.status === 'failed' ? `<div class="failure"><strong>${esc(job.error?.code || 'Failed')}</strong><p>${esc(job.error?.message || 'The provider did not finish.')}</p></div>` : ''}${(job?.status === 'awaiting_properties' && job.properties) || canRetry(job) ? `<button class="primary" id="process" ${busy ? 'disabled' : ''}>${canRetry(job) ? 'Retry simulation' : 'Generate simulation'}</button>` : ''}<p>Geometry review: reference correspondence and physical accuracy remain unverified. Numerical validation reports simulation smoke checks separately.</p>${reportView()}${attemptHistory()}</div></section>
  <section><h2><span>4</span>Files</h2><div class="body">${job?.mesh_path || job?.export_path ? `<div class="files">${job?.mesh_path ? link(job.mesh_path, 'Reconstructed mesh') : ''}${preparedMeshPath(job) ? link(preparedMeshPath(job)!, 'Prepared mesh') : ''}${job?.export_path ? link(job.export_path, canDownloadBundle(job) ? 'MuJoCo scene' : 'Diagnostic scene') : ''}${job?.validation_path ? link(job.validation_path, 'Validation report') : ''}${canDownloadBundle(job) ? link(job!.bundle_path!, 'Simulation ZIP') : ''}</div>` : '<p class="empty">Files appear when available.</p>'}${job?.status === 'completed' && mode === 'mock' ? '<p class="hint">Synthetic UI demo. No geometry or simulation validation was run.</p>' : ''}</div></section></main>`
  app.insertAdjacentHTML(
    'afterbegin',
    '<nav class="k-workspace-nav" aria-label="Kamino navigation"><button data-page="home">Kamino home</button><button data-page="upload">Upload another object</button></nav>',
  )
  bind()
  syncViewer()
  const sizingStatus = document.querySelector('#sizing-preview')
  if (sizingStatus) {
    const result =
      sizingPreview ||
      (Object.keys(draft).length === 0 &&
      Object.keys(orientationDraft).length === 0 &&
      job?.sizing_result
        ? {
            dimensions_m: job.sizing_result.resulting_dimensions_m,
            sizing_result: job.sizing_result,
          }
        : null)
    sizingStatus.textContent = result
      ? `Resulting full dimensions X/Y/Z: ${(['x', 'y', 'z'] as const).map((a) => (result.dimensions_m[a] * 1000).toFixed(3)).join(' × ')} mm. Oriented source extents: ${result.sizing_result.source_extents_input_units.join(' × ')} input units. Scale: ${result.sizing_result.scale_factors.join(' : ')}. Reference correspondence remains user-supplied; physical accuracy is unverified.`
      : 'No dimensions previewed. Choose a corresponding reference; do not infer one from estimates.'
  }
  if (focusName) {
    const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${focusName}"]`,
    )
    field?.focus({ preventScroll: true })
    if (cursor && field instanceof HTMLInputElement && cursor[0] !== null && cursor[1] !== null)
      field.setSelectionRange(cursor[0], cursor[1])
  }
}
function selectScenario() {
  return `<select id="scenario"><option value="normal" ${scenario === 'normal' ? 'selected' : ''}>Completed simulation</option><option value="provider_failure" ${scenario === 'provider_failure' ? 'selected' : ''}>Provider failure</option><option value="validation_failure" ${scenario === 'validation_failure' ? 'selected' : ''}>Validation failure</option></select>`
}
function schedule() {
  if (timer) clearTimeout(timer)
  if (!app.isConnected) return
  if (job && running(job.status)) timer = window.setTimeout(refresh, 1000)
}
async function loadReport() {
  if (!job?.validation_path) return
  const id = job.id,
    path = job.validation_path
  reportPath = path
  try {
    const result = await api.report(id, path)
    if (job?.id === id && job.validation_path === path) {
      validation = result
      reportError = ''
      render()
    }
  } catch (error) {
    if (job?.id === id && job.validation_path === path) {
      reportError = `${(error as Error).message} The job and files are kept.`
      render()
    }
  }
}
async function refresh() {
  if (!job || busy) return
  const id = job.id
  const generation = ++jobGeneration
  try {
    const updated = await api.get(id)
    if (job?.id !== id || generation !== jobGeneration) return
    if (updated.input_revision !== job.input_revision) {
      sizingPreview = null
      sizingDraftVersion++
    }
    job = updated
    if (entryPage !== 'upload') message = ''
    render()
    schedule()
    if (job.validation_path && job.validation_path !== reportPath) void loadReport()
  } catch (e) {
    if (job?.id !== id || generation !== jobGeneration) return
    message = `${(e as Error).message} Inputs are kept. Select Refresh to retry.`
    render()
  }
}
function bind() {
  document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) =>
    button.addEventListener('click', () => {
      if (busy) return
      entryPage = button.dataset.page === 'workspace' ? null : (button.dataset.page as EntryPage)
      render()
      window.scrollTo?.(0, 0)
      document
        .querySelector<HTMLElement>(entryPage === null ? '#workflow' : '#entry-content')
        ?.setAttribute('tabindex', '-1')
      document
        .querySelector<HTMLElement>(entryPage === null ? '#workflow' : '#entry-content')
        ?.focus({ preventScroll: true })
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-guide]').forEach((button) =>
    button.addEventListener('click', () => {
      guideTrigger = button
      const dialog = document.querySelector<HTMLDialogElement>('.k-guide')!
      dialog.showModal()
    }),
  )
  const dialog = document.querySelector<HTMLDialogElement>('.k-guide')
  document.querySelector('[data-close-guide]')?.addEventListener('click', () => dialog?.close())
  dialog?.addEventListener('close', () => guideTrigger?.focus())
  document.querySelector('#restore-job')?.addEventListener('click', () => void restoreJob())
  document
    .querySelector('#add-photos')
    ?.addEventListener('click', () => document.querySelector<HTMLInputElement>('#photos')?.click())
  document.querySelectorAll<HTMLButtonElement>('[data-replace]').forEach((button) =>
    button.addEventListener('click', () => {
      if (busy) return
      replaceIndex = Number(button.dataset.replace)
      document.querySelector<HTMLInputElement>('#replace-photo')?.click()
    }),
  )
  document
    .querySelector<HTMLInputElement>('#replace-photo')
    ?.addEventListener('change', (event) => {
      if (busy) return
      const selected = (event.target as HTMLInputElement).files?.[0]
      if (!selected || replaceIndex === null) return
      const candidate = [...files]
      candidate[replaceIndex] = selected
      const error = validatePhotos(candidate)
      if (!error) files = candidate
      message = error || ''
      replaceIndex = null
      render()
    })
  const saveButton = document.querySelector<HTMLButtonElement>('#save-properties')
  if (saveButton)
    saveButton.innerHTML = `${busyAction === 'save' ? '<span class="spinner" aria-hidden="true"></span>' : ''}Save properties`
  const processButton = document.querySelector<HTMLButtonElement>('#process')
  if (processButton && busyAction === 'process')
    processButton.insertAdjacentHTML(
      'afterbegin',
      '<span class="spinner" aria-hidden="true"></span>',
    )
  document.querySelector<HTMLInputElement>('#photos')?.addEventListener('change', (e) => {
    selectPhotos([...((e.target as HTMLInputElement).files || [])])
  })
  const drop = document.querySelector<HTMLElement>('#drop')
  drop?.setAttribute('tabindex', '0')
  drop?.setAttribute('role', 'button')
  drop?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (busy) return
      document.querySelector<HTMLInputElement>('#photos')?.click()
    }
  })
  drop?.addEventListener('dragover', (e) => {
    e.preventDefault()
    drop.classList.add('over')
  })
  drop?.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop?.addEventListener('drop', (e) => {
    e.preventDefault()
    selectPhotos([...(e.dataTransfer?.files || [])])
  })
  document.querySelectorAll<HTMLButtonElement>('.remove').forEach((b) =>
    b.addEventListener('click', () => {
      if (busy) return
      files.splice(Number(b.dataset.index), 1)
      message = ''
      render()
    }),
  )
  document.querySelector<HTMLSelectElement>('#scenario')?.addEventListener('change', (e) => {
    scenario = (e.target as HTMLSelectElement).value as typeof scenario
    setMockScenario(scenario)
  })
  document.querySelector('#upload')?.addEventListener('click', async () => {
    if (busy) return
    const error = validatePhotos(files)
    if (error) {
      message = error
      render()
      return
    }
    busyAction = 'upload'
    jobGeneration++
    busy = true
    message = ''
    render()
    try {
      job = await api.create(files)
      entryPage = null
      files = []
      draft = {}
      orientationDraft = {}
      sizingPreview = null
      sizingDraftVersion++
      suggestions = null
      suggestionMessage = ''
      if (mode === 'live') {
        const url = new URL(location.href)
        url.searchParams.set('job', job.id)
        url.searchParams.delete('view')
        history.replaceState(null, '', url)
      }
      validation = null
      reportPath = ''
      reportError = ''
      render()
    } catch (e) {
      message = (e as Error).message
    } finally {
      busy = false
      busyAction = null
      render()
      schedule()
    }
  })
  document.querySelector('#refresh')?.addEventListener('click', refresh)
  document.querySelector<HTMLInputElement>('#object-hint')?.addEventListener('input', (event) => {
    objectHint = (event.target as HTMLInputElement).value
  })
  for (const action of ['cached', 'request', 'refresh'] as const)
    document.querySelector(`#${action}-suggestions`)?.addEventListener('click', async () => {
      if (!job || suggestionBusy) return
      const id = job.id
      suggestionBusy = true
      suggestionMessage = ''
      render()
      try {
        const result =
          action === 'cached'
            ? await api.cachedSuggestions(id)
            : await api.suggestions(id, { object_hint: objectHint, refresh: action === 'refresh' })
        if (job?.id !== id) return
        suggestions = result
        suggestionMessage =
          'Suggestions loaded. Apply explicitly to edit, then save confirmed properties.'
      } catch (error) {
        if (job?.id === id)
          suggestionMessage = `${(error as Error).message} Your draft and saved suggestions are kept; continue manually or retry.`
      } finally {
        suggestionBusy = false
        render()
        document.querySelector<HTMLDetailsElement>('.suggestions')?.setAttribute('open', '')
      }
    })
  document.querySelector('#apply-suggestions')?.addEventListener('click', () => {
    if (!suggestions) return
    if (
      !window.confirm(
        'Replace suggested fields in your editable draft with unverified AI estimates? Nothing is saved until you choose Save properties.',
      )
    )
      return
    draft = applySuggestionToDraft(draft, suggestions)
    message = 'Estimates applied to the editable form. Review them and save properties to confirm.'
    render()
  })
  document.querySelector('#orientation')?.addEventListener('input', (event) => {
    sizingPreview = null
    sizingDraftVersion++
    const target = event.target as HTMLInputElement
    const saved = job?.orientation || zeroOrientation
    orientationDraft = {
      x_deg: String(saved.x_deg),
      y_deg: String(saved.y_deg),
      z_deg: String(saved.z_deg),
      ...orientationDraft,
      [target.name]: target.value,
    }
  })
  document.querySelector('#preview-orientation')?.addEventListener('click', () => {
    try {
      makeOrientation(orientationDraft)
      message = 'Previewing rotation draft. Save orientation before processing.'
      render()
    } catch (error) {
      message = (error as Error).message
      render()
    }
  })
  document.querySelector('#orientation')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!job || busy) return
    try {
      const values = Object.fromEntries(
        [...new FormData(event.target as HTMLFormElement)].map(([key, value]) => [
          key,
          String(value),
        ]),
      )
      orientationDraft = values
      const orientation = makeOrientation(values)
      jobGeneration++
      busy = true
      render()
      job = await api.saveOrientation(job.id, orientation)
      sizingPreview = null
      sizingDraftVersion++
      const hasNewerEdits = (['x_deg', 'y_deg', 'z_deg'] as const).some(
        (axis) => orientationDraft[axis] !== values[axis],
      )
      if (!hasNewerEdits) orientationDraft = {}
      validation = null
      reportPath = ''
      reportError = ''
      message = hasNewerEdits
        ? 'Orientation saved. Newer rotation edits remain unsaved; review and save them before processing.'
        : 'Orientation saved. Review the rotated mesh before processing.'
    } catch (error) {
      message = (error as Error).message
    } finally {
      busy = false
      render()
    }
  })
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement
    if (t.name)
      draft[t.name] =
        t instanceof HTMLInputElement && t.type === 'checkbox' ? (t.checked ? 'on' : '') : t.value
    sizingPreview = null
    sizingDraftVersion++
    const status = document.querySelector('#sizing-preview')
    if (status) status.textContent = 'Inputs changed; preview resulting dimensions again.'
  })
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement
    if (t.name)
      draft[t.name] =
        t instanceof HTMLInputElement && t.type === 'checkbox' ? (t.checked ? 'on' : '') : t.value
    if (t.name === 'sizing_mode') {
      sizingPreview = null
      sizingDraftVersion++
      render()
    }
  })
  document.querySelector('#preview-sizing')?.addEventListener('click', async () => {
    if (busy) return
    try {
      const values = readPropertyForm()
      sizingPreview = await previewSizing(values)
      message =
        'Sizing preview only; save properties to retain the reference and resulting dimensions.'
    } catch (error) {
      message = (error as Error).message
    }
    render()
  })
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (
      !job ||
      busy ||
      (job.status !== 'awaiting_properties' && job.status !== 'completed' && !canRetry(job))
    )
      return
    draft = Object.fromEntries(
      [...new FormData(e.target as HTMLFormElement)].map(([k, v]) => [k, String(v)]),
    )
    try {
      if (Object.keys(orientationDraft).length)
        throw Error('Save the reviewed orientation before properties.')
      const submitted = { ...draft },
        version = sizingDraftVersion
      const sizing = makeSizing(draft, job.orientation)
      const preview = await previewSizing(draft)
      const values = { ...draft }
      if (preview) {
        for (const a of ['x', 'y', 'z'] as const) values[a] = String(preview.dimensions_m[a] * 1000)
        values.dimensions_source = preview.dimensions_m.source
        values.dimensions_note = preview.dimensions_m.note || ''
      }
      const properties = { ...makeProperties(values), ...(sizing ? { sizing } : {}) }
      busyAction = 'save'
      jobGeneration++
      busy = true
      render()
      job = await api.save(job.id, properties)
      const newerEdits =
        version !== sizingDraftVersion || JSON.stringify(draft) !== JSON.stringify(submitted)
      if (!newerEdits) draft = {}
      sizingPreview = newerEdits ? null : preview
      validation = null
      reportPath = ''
      reportError = ''
      message = newerEdits
        ? 'Properties saved. Newer edits remain unsaved; preview and save them before processing.'
        : 'Properties saved. Generate the simulation when ready.'
    } catch (error) {
      message = (error as Error).message
    } finally {
      busy = false
      busyAction = null
      render()
    }
  })
  document.querySelector('#process')?.addEventListener('click', async () => {
    if (!job) return
    if (Object.keys(draft).length || Object.keys(orientationDraft).length) {
      message = 'Save your revised properties and orientation before generating the simulation.'
      render()
      return
    }
    busyAction = 'process'
    jobGeneration++
    busy = true
    message = ''
    render()
    try {
      job = await api.process(job.id)
      validation = null
      reportPath = ''
      reportError = ''
      schedule()
    } catch (error) {
      message = (error as Error).message
    } finally {
      busy = false
      busyAction = null
      render()
    }
  })
  document.querySelector('#retry-report')?.addEventListener('click', () => void loadReport())
  document.querySelectorAll<HTMLButtonElement>('.download').forEach((button) =>
    button.addEventListener('click', async () => {
      if (!job || !button.dataset.path) return
      button.disabled = true
      try {
        const blob = await api.file(job.id, button.dataset.path)
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = button.dataset.path.split('/').pop() || 'artifact'
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 10000)
      } catch (error) {
        message = (error as Error).message
        render()
      } finally {
        button.disabled = false
      }
    }),
  )
  document.querySelector('#connect')?.addEventListener('click', () => {
    setApiToken(document.querySelector<HTMLInputElement>('#api-token')?.value || '')
    viewerKey = ''
    message = 'Application token set for this session.'
    render()
    if (!job) void restoreJob()
  })
  document.querySelector('#dismiss')?.addEventListener('click', () => {
    message = ''
    render()
  })
}
function selectPhotos(selected: File[]) {
  if (busy || !selected.length) return
  const candidate = [...files, ...selected]
  const error = validatePhotos(candidate)
  if (!error) files = candidate
  message = error || ''
  render()
}
render()
async function restoreJob() {
  const id = new URL(location.href).searchParams.get('job')
  if (mode !== 'live' || !id) return
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    entryPage = 'upload'
    message =
      'The saved job link is invalid. Open a valid job URL or choose photos for a new asset.'
    render()
    return
  }
  const generation = ++jobGeneration
  try {
    const restored = await api.get(id)
    if (generation !== jobGeneration) return
    job = restored
    render()
    schedule()
    if (job.validation_path) void loadReport()
  } catch (error) {
    if (generation !== jobGeneration) return
    message = `${(error as Error).message} Reopen this job after restoring API access.`
    render()
  }
}
void restoreJob()
if (syntheticDemo) {
  // Deliberately local-only: this fixture never reaches liveApi or a provider.
  void mockApi
    .create([new File(['synthetic cube fixture'], 'synthetic-demo.png', { type: 'image/png' })])
    .then((created) => {
      job = created
      entryPage = null
      render()
      schedule()
    })
}

window.addEventListener('pagehide', () => {
  disposeViewer?.()
  disposeHome?.()
  photoPreviews.dispose()
  if (timer) clearTimeout(timer)
})
