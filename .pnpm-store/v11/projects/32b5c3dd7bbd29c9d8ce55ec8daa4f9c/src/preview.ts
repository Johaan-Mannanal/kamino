import type { Api } from './api'
import type { Job } from './types'

/** Owns the authenticated Blob and releases it on replacement or navigation. */
export class GlbPreview {
  readonly element = document.createElement('div')
  private key = ''
  private version = 0
  private url: string | null = null
  constructor(private api: Api) {
    this.element.className = 'mesh-preview'
    window.addEventListener('pagehide', () => this.reset())
  }
  mount(slot: HTMLElement | null, job: Job | null) {
    const path = job?.mesh_path
    if (!slot || !job || !path || !path.toLowerCase().endsWith('.glb')) {
      this.reset()
      return
    }
    const key = `${job.id}/${path}`
    slot.append(this.element)
    if (this.key === key) return
    this.reset()
    this.key = key
    slot.append(this.element)
    void this.load(job.id, path)
  }
  private reset() {
    this.version++
    this.key = ''
    this.element.querySelector('model-viewer')?.removeAttribute('src')
    this.element.replaceChildren()
    this.element.remove()
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }
  private async load(id: string, path: string) {
    const version = ++this.version
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    this.element.innerHTML = '<p role="status">Loading mesh preview…</p>'
    try {
      const [module, blob] = await Promise.all([
        import('@google/model-viewer'),
        this.api.file(id, path),
      ])
      if (version !== this.version) return
      module.ModelViewerElement.modelCacheSize = 0
      this.url = URL.createObjectURL(blob)
      const viewer = document.createElement('model-viewer')
      viewer.setAttribute('src', this.url)
      viewer.setAttribute(
        'alt',
        'Reconstructed object mesh. Scale and orientation have not been confirmed in this preview.',
      )
      viewer.setAttribute('camera-controls', '')
      viewer.setAttribute('touch-action', 'pan-y')
      viewer.setAttribute('interaction-prompt', 'none')
      viewer.setAttribute('loading', 'eager')
      const status = document.createElement('p')
      status.setAttribute('role', 'status')
      status.textContent = 'Loading 3D view…'
      viewer.addEventListener('load', () => {
        if (version === this.version)
          status.textContent =
            'Drag to rotate. Scroll or pinch to zoom. Reconstruction axes and scale are unconfirmed.'
      })
      viewer.addEventListener(
        'error',
        () => {
          if (version === this.version)
            this.failed(id, path, 'The mesh could not be displayed. Downloads remain available.')
        },
        { once: true },
      )
      this.element.replaceChildren(viewer, status)
    } catch (error) {
      if (version === this.version)
        this.failed(id, path, `${(error as Error).message} Downloads remain available.`)
    }
  }
  private failed(id: string, path: string, message: string) {
    this.element.querySelector('model-viewer')?.removeAttribute('src')
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    const status = document.createElement('p')
    status.setAttribute('role', 'status')
    status.textContent = message
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.textContent = 'Retry preview'
    retry.addEventListener('click', () => void this.load(id, path))
    this.element.replaceChildren(status, retry)
  }
}
