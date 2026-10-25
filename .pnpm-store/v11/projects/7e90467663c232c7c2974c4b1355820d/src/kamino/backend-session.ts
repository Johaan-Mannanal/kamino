import type { Api } from '../api'
import type { Job, Suggestions, SizingPreview, ValidationReport, Orientation } from '../types'
import { applySuggestionToDraft, makeProperties, validatePhotos } from '../properties'
import { makeSizing, sizingMode } from '../sizing'
import { makeOrientation } from '../orientation'
import { canRetry } from '../pipeline'

export class BackendSession {
  job: Job | null = null
  draft: Record<string, string> = {}
  rotation: Record<string, string> = {}
  preview: SizingPreview | null = null
  suggestions: Suggestions | null = null
  report: ValidationReport | null = null
  message = ''
  suggestionMessage = ''
  busy = ''
  suggestionBusy = false
  version = 0
  generation = 0
  onChange = () => {}
  constructor(public api: Api) {}
  get orientation(): Orientation { return this.job?.orientation || { x_deg: 0, y_deg: 0, z_deg: 0 } }
  get dirty() { return !!Object.keys(this.draft).length || !!Object.keys(this.rotation).length }
  edit(values: Record<string, string>) { Object.assign(this.draft, values); this.preview = null; this.version++; }
  editRotation(values: Record<string, string>) { this.rotation = { ...Object.fromEntries(Object.entries(this.orientation).map(([k,v]) => [k,String(v)])), ...this.rotation, ...values }; this.preview = null; this.version++; }
  values() {
    const p = this.job?.properties
    return {
      sizing_mode: sizingMode(p || null),
      x: p ? String(p.dimensions_m.x * 1000) : '', y: p ? String(p.dimensions_m.y * 1000) : '', z: p ? String(p.dimensions_m.z * 1000) : '',
      dimensions_source: p?.dimensions_m.source || 'user_supplied', dimensions_note: p?.dimensions_m.note || '',
      mass: p ? String(p.mass_kg.value * 1000) : '', mass_source: p?.mass_kg.source || 'user_supplied', mass_note: p?.mass_kg.note || '',
      friction: p?.sliding_friction ? String(p.sliding_friction.value) : '', friction_source: p?.sliding_friction?.source || 'estimated', friction_note: p?.sliding_friction?.note || '',
      ...this.draft,
    }
  }
  async create(files: File[]) {
    if (this.busy) throw Error('A request is already running.')
    const error = validatePhotos(files); if (error) throw Error(error)
    this.busy = 'upload'; this.onChange()
    const generation = ++this.generation
    try {
      const job = await this.api.create(files)
      if (generation !== this.generation) return
      this.job = job; this.draft = {}; this.rotation = {}; this.preview = null; this.suggestions = null; this.report = null; this.message = ''; this.version++
    } finally { this.busy = ''; this.onChange() }
  }
  async open(id: string) {
    const generation = ++this.generation
    const job = await this.api.get(id)
    if (generation !== this.generation) return
    this.job = job; this.draft = {}; this.rotation = {}; this.preview = null; this.report = null; this.version++; this.onChange()
  }
  async refresh() {
    if (!this.job || this.busy) return
    const id = this.job.id, generation = ++this.generation
    const job = await this.api.get(id)
    if (this.job?.id !== id || generation !== this.generation) return
    if (job.input_revision !== this.job.input_revision) { this.preview = null; this.version++ }
    this.job = job; this.onChange()
    if (job.validation_path) {
      try { const report = await this.api.report(id, job.validation_path); if (this.job?.id === id && generation === this.generation) { this.report = report; this.onChange() } }
      catch { this.message = 'Validation report could not be loaded. Saved files are retained; refresh to retry.'; this.onChange() }
    }
  }
  async estimates(hint: string, action: 'cached' | 'request' | 'refresh') {
    if (!this.job || this.suggestionBusy) return
    const id = this.job.id
    this.suggestionBusy = true; this.suggestionMessage = ''; this.onChange()
    try {
      const result = action === 'cached' ? await this.api.cachedSuggestions(id) : await this.api.suggestions(id, { object_hint: hint, refresh: action === 'refresh' })
      if (this.job?.id !== id) return
      this.suggestions = result; this.suggestionMessage = 'Unverified estimates loaded. Apply to the draft explicitly, then save confirmed properties.'
    } catch (error) { if (this.job?.id === id) this.suggestionMessage = `${(error as Error).message} Your manual draft and saved estimates are kept.` }
    finally { this.suggestionBusy = false; this.onChange() }
  }
  applyEstimates() { if (this.suggestions) { this.draft = applySuggestionToDraft(this.draft, this.suggestions); this.preview = null; this.version++; this.message = 'Estimates applied to the draft only. Review and save explicitly.'; this.onChange() } }
  async mutate(action: string, fn: (id: string, version: number) => Promise<void>) {
    if (!this.job || this.busy) throw Error('Wait for the current request to finish.')
    const id = this.job.id, version = this.version
    ++this.generation; this.busy = action; this.onChange()
    try { await fn(id, version) } finally { this.busy = ''; this.onChange() }
  }
  async saveOrientation() {
    await this.mutate('orientation', async (id, version) => {
      const updated = await this.api.saveOrientation(id, makeOrientation(this.rotation))
      if (this.job?.id !== id) return
      this.job = updated; this.preview = null
      if (version === this.version) this.rotation = {}
      this.message = version === this.version ? 'Orientation saved. Preview dimensions before saving properties.' : 'Orientation saved; newer rotation edits remain unsaved.'
    })
  }
  async previewSizing() {
    if (!this.job) throw Error('Open a mesh first.')
    if (Object.keys(this.rotation).length) throw Error('Save the reviewed orientation before sizing.')
    const id = this.job.id, version = this.version, revision = this.job.input_revision
    const sizing = makeSizing(this.values(), this.orientation)
    if (!sizing || sizing.mode !== 'uniform') { this.preview = null; return }
    const result = await this.api.previewSizing(id, { sizing, orientation: this.orientation })
    if (this.job?.id !== id || version !== this.version || revision !== this.job.input_revision) throw Error('Inputs changed during preview. Review and preview again.')
    this.preview = result; this.message = 'Dimensions previewed by the backend. Save properties to keep the reference.'; this.onChange()
  }
  async saveProperties() {
    if (Object.keys(this.rotation).length) throw Error('Save the orientation draft before properties.')
    await this.mutate('properties', async (id, version) => {
      const values = this.values(), sizing = makeSizing(values, this.orientation)
      if (sizing?.mode === 'uniform') {
        const preview = await this.api.previewSizing(id, { sizing, orientation: this.orientation })
        if (version !== this.version || this.job?.id !== id) throw Error('Inputs changed during preview. Review and save again.')
        for (const axis of ['x','y','z'] as const) values[axis] = String(preview.dimensions_m[axis] * 1000)
        values.dimensions_source = preview.dimensions_m.source; values.dimensions_note = preview.dimensions_m.note || ''
      }
      const updated = await this.api.save(id, { ...makeProperties(values), ...(sizing ? { sizing } : {}) })
      if (this.job?.id !== id) return
      this.job = updated; this.preview = null
      if (version === this.version) this.draft = {}
      this.message = version === this.version ? 'Properties saved. Generate the simulation explicitly when ready.' : 'Properties saved; newer edits remain unsaved.'
    })
  }
  async process() {
    if (!this.job?.properties || this.dirty) throw Error('Save property and orientation drafts before generating.')
    if (this.job.status !== 'awaiting_properties' && !canRetry(this.job)) throw Error('This job is not ready to generate. Save corrections first.')
    await this.mutate('process', async id => { const updated = await this.api.process(id); if (this.job?.id === id) this.job = updated })
  }
}
