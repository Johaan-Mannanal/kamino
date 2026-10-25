import { ApiError, type Api } from './api'
import type { Job, Suggestions } from './types'
import { suggestionDraft, type SuggestedProperty } from './suggestion-values'

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export class SuggestionPanel {
  readonly element = document.createElement('details')
  private id = ''
  private result: Suggestions | null = null
  private hint = ''
  private notice = ''
  private busy = false
  private locked = false
  private retryAt = 0
  private retryTimer: number | undefined
  private version = 0
  constructor(
    private api: Api,
    private apply: (patch: Record<string, string>) => void,
  ) {
    this.element.className = 'suggestions'
  }
  mount(slot: HTMLElement | null, job: Job | null, locked: boolean) {
    if (!slot || !job) {
      this.reset()
      return
    }
    const changed = this.id !== job.id
    if (changed) {
      this.reset()
      this.id = job.id
    }
    const lockChanged = this.locked !== locked
    this.locked = locked
    slot.append(this.element)
    if (changed || lockChanged) this.render()
    if (changed) void this.load(true)
  }
  private reset() {
    this.version++
    this.id = ''
    this.result = null
    this.hint = ''
    this.notice = ''
    this.busy = false
    this.retryAt = 0
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.element.open = false
    this.element.remove()
  }
  private render() {
    const open = this.element.open
    const number = (value: number) =>
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
    const row = (key: SuggestedProperty, label: string, display: string) =>
      `<div class="estimate"><span><strong>${label}</strong>${display}${this.result?.[key]?.note ? `<span class="property-note">${escape(this.result[key]!.note!)}</span>` : ''}</span><button type="button" data-apply="${key}" ${this.locked ? 'disabled' : ''}>Apply ${label.toLowerCase()}</button></div>`
    const s = this.result
    this.element.innerHTML = `<summary>Property estimates</summary><p>Gemini estimates are unverified. Applying an estimate fills the form; review and save to confirm it.</p><label>Object description <input id="object-hint" name="object_hint" maxlength="2000" value="${escape(this.hint)}" placeholder="Optional, for example a USB-C charger"></label><div class="suggestion-actions"><button type="button" id="get-estimates" ${this.busy || this.locked || Date.now() < this.retryAt ? 'disabled' : ''}>${this.busy ? 'Getting estimates…' : 'Get estimates'}</button>${s ? `<button type="button" id="refresh-estimates" ${this.busy || this.locked || Date.now() < this.retryAt ? 'disabled' : ''}>Refresh estimates</button>` : ''}</div>${this.notice ? `<p class="hint" role="status">${escape(this.notice)}</p>` : ''}${s ? `<div class="estimate-label">Estimated · unverified</div>${s.dimensions_m ? row('dimensions_m', 'Dimensions', `${number(s.dimensions_m.x * 1000)} × ${number(s.dimensions_m.y * 1000)} × ${number(s.dimensions_m.z * 1000)} mm`) : '<p>Dimensions unknown.</p>'}${s.mass_kg ? row('mass_kg', 'Mass', `${number(s.mass_kg.value * 1000)} g`) : '<p>Mass unknown.</p>'}${s.sliding_friction ? row('sliding_friction', 'Friction', number(s.sliding_friction.value)) : '<p>Friction unknown. Leave blank unless you have evidence.</p>'}${s.clarifying_questions.length ? `<ul>${s.clarifying_questions.map((question) => `<li>${escape(question)}</li>`).join('')}</ul>` : ''}${s.notes.length ? `<ul class="suggestion-notes">${s.notes.map((note) => `<li>${escape(note)}</li>`).join('')}</ul>` : ''}` : ''}`
    this.element.open = open
    this.element
      .querySelector<HTMLInputElement>('#object-hint')
      ?.addEventListener('input', (event) => {
        this.hint = (event.target as HTMLInputElement).value
      })
    this.element
      .querySelector('#get-estimates')
      ?.addEventListener('click', () => void this.load(false))
    this.element
      .querySelector('#refresh-estimates')
      ?.addEventListener('click', () => void this.load(false, true))
    this.element.querySelectorAll<HTMLButtonElement>('[data-apply]').forEach((button) =>
      button.addEventListener('click', () => {
        if (!this.result || this.locked) return
        try {
          this.apply(suggestionDraft(this.result, button.dataset.apply as SuggestedProperty))
        } catch (error) {
          this.notice = (error as Error).message
          this.render()
        }
      }),
    )
  }
  private async load(cacheOnly: boolean, refresh = false) {
    const id = this.id
    if (!id || this.busy || (!cacheOnly && (this.locked || Date.now() < this.retryAt))) return
    const version = ++this.version
    if (!cacheOnly) {
      this.busy = true
      this.notice = ''
      this.render()
    }
    try {
      const result = cacheOnly
        ? await this.api.cachedSuggestions(id)
        : await this.api.suggest(id, this.hint, refresh)
      if (this.id !== id || this.version !== version) return
      this.result = result
      this.notice = cacheOnly
        ? 'Loaded saved estimates. No Gemini request was made.'
        : 'Estimates ready. Review before applying.'
    } catch (error) {
      if (this.id !== id || this.version !== version) return
      if (error instanceof ApiError && cacheOnly && error.status === 404) return
      if (error instanceof ApiError && error.status === 429) {
        const seconds = Math.max(1, Math.ceil(error.retryAfter || 5))
        this.retryAt = Date.now() + seconds * 1000
        this.notice = `Gemini is busy. Retry in ${seconds} seconds. Manual entry is available.`
        this.retryTimer = window.setTimeout(() => {
          if (this.id === id) this.render()
        }, seconds * 1000)
      } else
        this.notice =
          error instanceof ApiError && error.status === 503
            ? 'Gemini is unavailable. Continue with manual entry; any saved estimates remain here.'
            : `${(error as Error).message} Manual entry is available.`
    } finally {
      if (this.id === id && this.version === version) {
        this.busy = false
        this.render()
      }
    }
  }
}
