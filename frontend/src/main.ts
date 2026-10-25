import './style.css'
import './workflow.css'
import { liveApi, setApiToken, type Api } from './api'
import { mockApi, setMockScenario } from './mock'
import { makeProperties, validatePhotos } from './properties'
import type { Job, Source, ValidationReport } from './types'
import { canRetry, canDownloadBundle, preparedMeshPath } from './pipeline'
import { GlbPreview } from './preview'
import { SuggestionPanel } from './suggestions'

const mode = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'
const api: Api = mode === 'live' ? liveApi : mockApi
const app = document.querySelector<HTMLDivElement>('#app')!
let files: File[] = [],
  job: Job | null = null,
  message = '',
  busy = false
let busyAction: 'upload' | 'save' | 'process' | null = null
let validation: ValidationReport | null = null,
  reportError = '',
  reportPath = ''
let timer: number | undefined
let draft: Record<string, string> = {}
const meshPreview = new GlbPreview(api)
const suggestionPanel = new SuggestionPanel(api, (patch) => {
  draft = { ...draft, ...patch }
  message =
    'Estimate applied to the form. Review it, keep its source as Estimated, then save properties to confirm.'
  render()
})
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
function reportView() {
  if (reportError)
    return `<p class="notice" role="status">${esc(reportError)} <button id="retry-report">Retry report</button></p>`
  if (!validation)
    return job?.validation_path
      ? '<p class="hint" role="status">Loading validation report…</p>'
      : ''
  return `<div class="validation"><strong>${validation.passed ? (mode === 'mock' ? 'Mock validation passed' : 'Validation passed') : mode === 'mock' ? 'Mock validation failed' : 'Validation failed'}</strong><div class="validation-runs"><span>Original scene: ${validation.original ? (validation.original.passed ? 'Passed' : 'Failed') : 'Not checked'}</span><span>Relocated scene: ${validation.relocated ? (validation.relocated.passed ? 'Passed' : 'Failed') : 'Not checked'}</span></div><p>${esc(validation.scope || validation.error || 'Inspect the report for individual checks.')}</p><p>${mode === 'mock' ? 'No simulation checks were executed.' : validation.viewer_inspected ? 'Viewer inspection recorded.' : 'Headless checks only. Viewer inspection remains.'}</p>${job?.asset?.notes.length ? `<details><summary>Geometry assumptions</summary><ul>${job.asset.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>` : ''}</div>`
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
function render() {
  const focus = document.activeElement as HTMLInputElement | HTMLSelectElement | null
  const focusName = focus?.name
  const cursor =
    focus instanceof HTMLInputElement && focus.type === 'text'
      ? [focus.selectionStart, focus.selectionEnd]
      : null
  const editable = !!job,
    done =
      job?.status === 'completed' || job?.status === 'preparing' || job?.status === 'validating',
    canSave = job?.status === 'awaiting_properties' || canRetry(job)
  app.innerHTML = `<a class="skip" href="#workflow">Skip to content</a><header><div><strong translate="no">Photo2Sim</strong></div></header>
  <main id="workflow"><h1>Create an asset</h1>
  ${mode === 'mock' || job?.synthetic ? `<div class="mode-note"><strong>Synthetic demo</strong><span>The mock creates a known cube. Photos do not affect the result.</span></div>` : ''}
  ${message ? `<div class="notice" role="status" aria-live="polite">${esc(message)} <button id="dismiss" aria-label="Dismiss">×</button></div>` : ''}
  ${mode === 'live' ? '<details class="access"><summary>API access</summary><label>Application token<input id="api-token" type="password" autocomplete="off" placeholder="Only needed for a protected backend"></label><button id="connect" type="button">Set token</button></details>' : ''}
  <section><h2><span>1</span>Photos</h2><div class="body"><label class="drop" id="drop" for="photos">Drop photos here or choose files <span>1–4 JPEG, PNG, or WebP · 10 MiB each · 25 MP</span></label><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>${files.map((f, i) => `<div class="selected"><span>${esc(f.name)}</span><button type="button" data-index="${i}" class="remove" aria-label="Remove ${esc(f.name)}">Remove</button></div>`).join('')}${mode === 'mock' ? `<label class="demo">Demo result ${selectScenario()}</label>` : ''}<button class="primary" id="upload" ${busy || !files.length ? 'disabled' : ''}>${busyAction === 'upload' ? '<span class="spinner" aria-hidden="true"></span>' : ''}${job ? 'Start new job' : 'Upload photos'}</button></div></section>
  <section><h2><span>2</span>Object data</h2><div class="body"><div id="suggestions-slot"></div>${done ? propertySummary() : editable ? `<form id="properties"><div class="field-head">Full dimensions <span>millimetres</span></div><div class="grid three">${(['x', 'y', 'z'] as const).map((a) => input(a, a.toUpperCase(), job?.properties ? job.properties.dimensions_m[a] * 1000 : '', !!done, true)).join('')}</div><div class="grid two gap"><label>Dimension source ${select('dimensions_source', job?.properties?.dimensions_m.source || 'measured', !!done)}</label>${input('dimensions_note', 'Note · optional', job?.properties?.dimensions_m.note || '', !!done)}</div><div class="grid two gap">${input('mass', 'Mass · grams', job?.properties ? job.properties.mass_kg.value * 1000 : '', !!done, true)}<label>Mass source ${select('mass_source', job?.properties?.mass_kg.source || 'user_supplied', !!done)}</label></div>${input('mass_note', 'Mass note · optional', job?.properties?.mass_kg.note || '', !!done)}<div class="grid two gap"><label>Sliding friction · blank if unknown<input name="friction" type="number" min="0" step="any" value="${val('friction', job?.properties?.sliding_friction?.value ?? '')}" ${done ? 'disabled' : ''}></label><label>Friction source ${select('friction_source', job?.properties?.sliding_friction?.source || 'estimated', !!done)}</label></div>${input('friction_note', 'Friction note · optional', job?.properties?.sliding_friction?.note || '', !!done)}<div class="form-end"><span>mm → m and g → kg when saved</span>${!done ? `<button class="primary" ${!canSave || busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save properties'}</button>` : ''}</div>${!canSave && !done ? `<p class="hint">${job ? 'Enter measurements now. Save after reconstruction.' : 'Upload photos to start.'}</p>` : ''}</form>` : '<p class="empty">Upload photos to add measurements.</p>'}</div></section>
  <section><h2><span>3</span>Process</h2><div class="body"><div class="stages" aria-label="Processing stages">${stages()}</div>${job ? `<div class="jobline"><span>Job ${esc(job.id.slice(0, 8))} · ${esc(job.provider)} · ${job.synthetic ? 'Synthetic' : 'Provider generated'}</span><button id="refresh">Refresh</button></div>` : ''}${job?.status === 'failed' ? `<div class="failure"><strong>${esc(job.error?.code || 'Failed')}</strong><p>${esc(job.error?.message || 'The provider did not finish.')}</p></div>` : ''}${(job?.status === 'awaiting_properties' && job.properties) || canRetry(job) ? `<button class="primary" id="process" ${busy ? 'disabled' : ''}>${canRetry(job) ? 'Retry simulation' : 'Generate simulation'}</button>` : ''}${reportView()}</div></section>
  <section><h2><span>4</span>Files</h2><div class="body"><div id="preview-slot"></div>${job?.mesh_path || job?.export_path ? `<div class="files">${job?.mesh_path ? link(job.mesh_path, 'Reconstructed mesh') : ''}${preparedMeshPath(job) ? link(preparedMeshPath(job)!, 'Prepared mesh') : ''}${job?.export_path ? link(job.export_path, canDownloadBundle(job) ? 'MuJoCo scene' : 'Diagnostic scene') : ''}${job?.validation_path ? link(job.validation_path, 'Validation report') : ''}${canDownloadBundle(job) ? link(job!.bundle_path!, 'Simulation ZIP') : ''}</div>` : '<p class="empty">Files appear when available.</p>'}${job?.status === 'completed' && mode === 'mock' ? '<p class="hint">Synthetic UI demo. No geometry or simulation validation was run.</p>' : ''}</div></section></main>`
  bind()
  meshPreview.mount(document.querySelector('#preview-slot'), job)
  suggestionPanel.mount(document.querySelector('#suggestions-slot'), job, done || busy)
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
  if (!job) return
  const id = job.id
  try {
    const updated = await api.get(id)
    if (job?.id !== id) return
    job = updated
    message = ''
    render()
    schedule()
    if (job.validation_path && job.validation_path !== reportPath) void loadReport()
  } catch (e) {
    message = `${(e as Error).message} Inputs are kept. Select Refresh to retry.`
    render()
  }
}
function bind() {
  const saveButton = document.querySelector<HTMLButtonElement>('#properties button')
  if (saveButton)
    saveButton.innerHTML = `${busyAction === 'save' ? '<span class="spinner" aria-hidden="true"></span>' : ''}Save properties`
  const processButton = document.querySelector<HTMLButtonElement>('#process')
  if (processButton && busyAction === 'process')
    processButton.insertAdjacentHTML(
      'afterbegin',
      '<span class="spinner" aria-hidden="true"></span>',
    )
  document.querySelector<HTMLInputElement>('#photos')?.addEventListener('change', (e) => {
    files = [...((e.target as HTMLInputElement).files || [])]
    message = validatePhotos(files) || ''
    render()
  })
  const drop = document.querySelector<HTMLElement>('#drop')
  drop?.setAttribute('tabindex', '0')
  drop?.setAttribute('role', 'button')
  drop?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
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
    files = [...(e.dataTransfer?.files || [])]
    message = validatePhotos(files) || ''
    render()
  })
  document.querySelectorAll<HTMLButtonElement>('.remove').forEach((b) =>
    b.addEventListener('click', () => {
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
    const error = validatePhotos(files)
    if (error) {
      message = error
      render()
      return
    }
    busyAction = 'upload'
    busy = true
    message = ''
    render()
    try {
      job = await api.create(files)
      draft = {}
      if (mode === 'live') {
        const url = new URL(location.href)
        url.searchParams.set('job', job.id)
        history.replaceState(null, '', url)
      }
      validation = null
      reportPath = ''
      reportError = ''
      render()
      schedule()
    } catch (e) {
      message = (e as Error).message
    } finally {
      busy = false
      busyAction = null
      render()
    }
  })
  document.querySelector('#refresh')?.addEventListener('click', refresh)
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement
    if (t.name) draft[t.name] = t.value
  })
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement
    if (t.name) draft[t.name] = t.value
  })
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!job || (job.status !== 'awaiting_properties' && !canRetry(job))) return
    draft = Object.fromEntries(
      [...new FormData(e.target as HTMLFormElement)].map(([k, v]) => [k, String(v)]),
    )
    try {
      const properties = makeProperties(draft)
      busyAction = 'save'
      busy = true
      render()
      job = await api.save(job.id, properties)
      draft = {}
      validation = null
      reportPath = ''
      reportError = ''
      message = 'Properties saved. Generate the simulation when ready.'
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
    if (Object.keys(draft).length) {
      message = 'Save your revised properties before generating the simulation.'
      render()
      return
    }
    busyAction = 'process'
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
    message = 'Application token set for this session.'
    render()
    if (!job) void restoreJob()
  })
  document.querySelector('#dismiss')?.addEventListener('click', () => {
    message = ''
    render()
  })
}
render()
async function restoreJob() {
  const id = new URL(location.href).searchParams.get('job')
  if (mode !== 'live' || !id) return
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return
  try {
    job = await api.get(id)
    render()
    schedule()
    if (job.validation_path) void loadReport()
  } catch (error) {
    message = `${(error as Error).message} Reopen this job after restoring API access.`
    render()
  }
}
void restoreJob()
