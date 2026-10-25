import type { Job } from './types'

export type EntryPage = 'home' | 'upload' | null
const asset = (name: string) => `${import.meta.env.BASE_URL}kamino/${name}`
const image = (name: string, className = '', alt = '') =>
  `<img src="${asset(name)}" class="${className}" alt="${alt}" draggable="false">`
export const escapeText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const brand = () =>
  `<button class="k-brand" data-page="home" aria-label="Kamino home">${image('c76c7.svg')}<span translate="no">Kamino</span></button>`
const guide = () =>
  '<button class="k-text" data-guide>Quick guide <span aria-hidden="true">↗</span></button>'
const uploadLink = () =>
  `<button class="k-button k-primary" data-page="upload">Upload your photos ${image('0f26a.svg')}</button>`
const demoLink = () =>
  `<a class="k-button k-secondary" href="?demo=synthetic">Try the demo ${image('55033.svg')}</a>`
export const guideDialog = () =>
  `<dialog class="k-guide" aria-labelledby="guide-title"><div><h2 id="guide-title">A quick guide to Kamino</h2><button data-close-guide aria-label="Close quick guide">×</button></div><ol><li>Choose 1–4 clear photos of one object from different angles. JPEG, PNG or WebP; 10 MiB and 25 megapixels per photo.</li><li>Create a mesh and wait for reconstruction. Keep the job URL to return later.</li><li>Review geometry and orientation, enter measurements manually, and save confirmed properties. Optional Gemini estimates must be explicitly applied to the draft and saved.</li><li>Generate a simulation, inspect warnings and validation, then download available files. Earlier attempts remain available in Workspace.</li></ol><p>Home uses illustrative mug artwork. The separate runnable demo uses a synthetic cube; it does not reconstruct photos.</p></dialog>`

export class PhotoPreviews {
  private urls = new Map<File, string>()
  sync(files: File[]) {
    for (const [file, url] of this.urls)
      if (!files.includes(file)) {
        URL.revokeObjectURL(url)
        this.urls.delete(file)
      }
    for (const file of files)
      if (!this.urls.has(file) && /^image\/(jpeg|png|webp)$/.test(file.type))
        this.urls.set(file, URL.createObjectURL(file))
  }
  get(file: File) {
    return this.urls.get(file) || ''
  }
  dispose() {
    this.sync([])
  }
}

const chapters = [
  ['From photos to simulation.', 'Turn everyday objects into simulation-ready assets.'],
  ['Capture every angle.', 'A few clear photos. A complete view of your object.'],
  ['Bring it into 3D.', 'Explore the shape behind your photographs.'],
  [
    'Make it your own.',
    'Set a known dimension. Review scale, orientation and physical properties.',
  ],
  [
    'Ready for your next experiment.',
    'Create an asset from your photos, or explore a prepared demo.',
  ],
]
const heading = (title: string, index: number) =>
  index === 1
    ? 'Capture every<br class="k-chapter-break"> angle.'
    : index === 2
      ? 'Bring it<br class="k-chapter-break"> into 3D.'
      : index === 3
        ? 'Make it<br class="k-chapter-break"> your own.'
        : index === 4
          ? 'Ready for your<br class="k-chapter-break"> next experiment.'
          : title
const mobileCopy = [
  '',
  'A few photos, from every side.',
  'Turn your views into editable geometry.',
  'Set the scale. Refine the properties.',
  '',
]
function artwork(index: number) {
  if (index === 0)
    return `<div class="k-hero-light"></div>${image('46613.png', 'k-hero-mug', 'Illustrative ceramic mug')}${image('c75af.svg', 'k-contact-shadow')}`
  if (index === 4)
    return `<div class="k-artwork k-artwork-4">${image('adbad.png', 'k-studio', 'Illustrative ceramic mug')}<p class="k-art-caption">Ceramic mug · Illustrative asset</p></div>`
  return `<div class="k-artwork k-artwork-${index}">${image('adbad.png', 'k-studio', 'Illustrative ceramic mug')}${index === 1 ? `<div class="k-camera">${image('5df27.png')}<picture><source media="(min-width: 960px) and (prefers-reduced-motion: reduce)" srcset="${asset('586fa.svg')}"><source media="(max-width: 959px), (prefers-reduced-motion: reduce)" srcset="${asset('186a3.svg')}">${image('dc0c1.svg')}</picture></div><div class="k-viewpoints">${['5df27.png', '06849.png', 'd28af.png'].map((name, i) => `<div>${image(name)}<span>${['Front', 'Side', 'Above'][i]}</span></div>`).join('')}</div>` : ''}${index === 2 ? `${image('472fe.svg', 'k-wireframe')}${image('46613.png', 'k-mobile-geometry-background')}<picture class="k-mobile-wireframe"><source media="(min-width: 960px) and (prefers-reduced-motion: reduce)" srcset="${asset('cf89c.svg')}">${image('590dd.svg')}</picture>` : ''}${index === 3 ? `<div class="k-scale-card"><span>Known length · X</span><strong>120 → 132 mm</strong><span>132 × 110 × 99 mm</span></div><div class="k-mobile-inspector" role="img" aria-label="Illustration of manual dimensions and proportional scaling; edit actual measurements in Workspace"><strong>Dimensions</strong><span>Manual entry · mm</span><hr><small>Width 120 → 132 mm</small><div class="k-demo-field"><span>Width</span><div class="k-demo-focus">132 <small>mm</small></div></div><div class="k-demo-fields"><div class="k-demo-field"><span>Height</span><div>110 <small>mm</small></div></div><div class="k-demo-field"><span>Depth</span><div>99 <small>mm</small></div></div></div><small>Was 120 × 100 × 90 mm</small><span class="k-proportions">${image('02f35.svg')}Preserve proportions · On</span></div>` : ''}<p class="k-art-caption">${index === 2 ? 'Geometry preview · Illustrative asset' : index === 3 ? 'Proportions preserved · Illustrative asset' : ''}</p></div>`
}
export function homeScreen(hasJob: boolean) {
  return `<div class="k-home"><div class="k-story"><div class="k-story-pin" data-chapter="0"><header class="k-home-header">${brand()}<nav>${guide()}${hasJob ? '<button class="k-text" data-page="workspace">Return to Workspace</button>' : ''}<button class="k-text k-accent" data-page="upload">Upload your photos ↗</button></nav></header><main id="entry-content" class="k-story-stage">${chapters.map(([title, body], index) => `<article class="k-chapter" data-chapter-panel="${index}" ${index ? 'inert' : ''}><div class="k-story-copy"><h${index === 0 ? 1 : 2}>${heading(title, index)}</h${index === 0 ? 1 : 2}><p><span class="k-desktop-copy">${body}</span>${mobileCopy[index] ? `<span class="k-mobile-copy">${mobileCopy[index]}</span>` : ''}</p>${index === 4 ? `<div class="k-home-actions">${uploadLink()}${demoLink()}</div><small>1–4 JPEG, PNG or WebP images</small>` : ''}</div>${artwork(index)}</article>`).join('')}</main><footer class="k-story-footer"><span data-scroll-label>Scroll to explore ↓</span><div class="k-story-navigation">${['60408.svg', 'ca7e4.svg', '63a20.svg', '4d5c4.svg'].map((name, index) => image(name, `k-story-position k-position-${index + 1}`)).join('')}<nav aria-label="Home story chapters">${chapters.map(([title], index) => `<button data-chapter-link="${index}" aria-label="${escapeText(title)}" ${index === 0 ? 'aria-current="step"' : ''}></button>`).join('')}</nav></div></footer></div></div><div class="k-mobile-footer"><span translate="no">Kamino</span>${guide()}${hasJob ? '<button class="k-text" data-page="workspace">Return to Workspace</button>' : ''}<span>MJCF / XML + meshes</span></div></div>`
}
export function uploadScreen(options: {
  files: File[]
  previews: PhotoPreviews
  busy: boolean
  job: Job | null
  mock: boolean
}) {
  const { files, previews, busy, job, mock } = options
  return `<header class="k-upload-header">${brand()}<div class="k-project"><span>New asset</span><small>New asset / Draft</small></div>${guide()}</header><nav class="k-breadcrumb" aria-label="Asset workflow"><button data-page="home">Home</button>${image('53f3d.svg')}<span aria-current="step">${image('14155.svg')}Upload</span>${image('53f3d.svg')}<span>Creating mesh</span>${image('53f3d.svg')}<button data-page="workspace" ${job ? '' : 'disabled'}>Workspace</button></nav><main id="entry-content" class="k-upload"><div class="k-upload-intro"><div class="k-eyebrow">CREATE AN ASSET <span>/</span> NEW DRAFT</div><h1>Upload photos</h1><p>Add a few views of the same object. You’ll review its geometry and properties next.</p></div>${mock ? '<p class="k-demo-note">Synthetic demo mode · Uploads produce a fixture cube, not a reconstruction of your photos.</p>' : ''}<label id="drop" class="k-drop" for="photos" ${busy ? 'aria-disabled="true"' : ''}>${image('0e7df.svg')}<strong>Drop photos here</strong><span>1–4 JPEG, PNG or WebP images</span><span class="k-button k-secondary">Choose photos</span></label><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden ${busy ? 'disabled' : ''}><input id="replace-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden ${busy ? 'disabled' : ''}><div class="k-photo-heading"><strong>Selected photos <span>${files.length} / 4</span></strong><small>10 MiB each · 25 MP</small></div><div class="k-photo-list">${files.map((file, index) => `<div class="selected k-photo-row"><img class="k-photo-preview" src="${escapeText(previews.get(file))}" alt="Selected photo ${index + 1}"><div><strong>Photo ${index + 1}</strong><span>${escapeText(file.name)}</span></div><button class="k-button k-secondary" data-replace="${index}" ${busy ? 'disabled' : ''}>Replace</button><button class="remove k-remove" data-index="${index}" aria-label="Remove ${escapeText(file.name)}" ${busy ? 'disabled' : ''}>${image('7a293.svg')}</button></div>`).join('') || '<p class="k-no-photos">Your selected photos will appear here.</p>'}</div><button class="k-button k-add" id="add-photos" ${busy || files.length >= 4 ? 'disabled' : ''}>${image('4b0ec.svg')}Add photos</button><div class="k-upload-actions"><button class="k-button k-quiet" data-page="home">Back to start ${image('55033.svg')}</button><button class="k-button k-primary" id="upload" ${busy || !files.length ? 'disabled' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>Starting…' : `${image('0f26a.svg')}Create mesh`}</button></div>${job ? '<p class="k-retained">Your previous job and its saved files are kept until a new job starts. <button class="k-text k-accent" data-page="workspace">Return to that job ↗</button></p>' : ''}<div class="k-demo-row"><div><strong>Just exploring?</strong><span>Try a synthetic cube without uploading photos.</span></div><a href="?demo=synthetic">Open the demo ↗</a></div></main>`
}
export function creatingScreen(job: Job | null) {
  const failed = job?.status === 'failed'
  return `<header class="k-creating-header">${brand()}</header><main id="entry-content" class="k-creating"><div class="k-creating-copy"><h1>${failed ? 'Mesh creation needs attention' : job ? 'Creating your mesh' : 'Opening your saved asset'}</h1><p>${failed ? escapeText(job.error?.message || 'The provider did not finish. Your job is kept.') : job ? 'Reconstructing geometry from your photos.' : 'Loading the latest saved job state.'}</p>${!failed ? '<div class="k-progress" role="status" aria-label="Waiting for the backend"><span></span></div>' : ''}${job?.synthetic ? '<small>Synthetic cube demo · No photo reconstruction or simulation checks.</small>' : ''}<div class="k-creating-actions">${job ? '<button id="refresh" class="k-text">Refresh status</button>' : '<button id="restore-job" class="k-text">Retry opening asset</button>'}<button data-page="upload" class="k-text">Choose other photos</button></div>${job ? `<small>Job ${escapeText(job.id)} · ${escapeText(job.provider)}</small>` : ''}</div></main>`
}

/** Native scroll, with one pinned illustrative stage. Mobile/reduced motion shows all chapters. */
export function mountHomeStory(host: HTMLElement) {
  const story = host.querySelector<HTMLElement>('.k-story')!
  const pin = host.querySelector<HTMLElement>('.k-story-pin')!
  const panels = [...host.querySelectorAll<HTMLElement>('[data-chapter-panel]')]
  const media = window.matchMedia?.(
    '(min-width: 960px) and (prefers-reduced-motion: no-preference)',
  )
  let frame = 0
  const update = () => {
    const pinned = media?.matches ?? false
    const index = pinned
      ? Math.max(
          0,
          Math.min(
            4,
            Math.floor(
              (-story.getBoundingClientRect().top + innerHeight * 0.1) / Math.max(1, innerHeight),
            ),
          ),
        )
      : 0
    pin.dataset.chapter = String(index)
    panels.forEach((panel, i) => {
      panel.toggleAttribute('inert', pinned && i !== index)
    })
    host.querySelectorAll<HTMLElement>('[data-chapter-link]').forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'step')
      else button.removeAttribute('aria-current')
    })
    const label = host.querySelector('[data-scroll-label]')!
    label.textContent = index === 4 ? 'MuJoCo scene + meshes' : 'Scroll to explore ↓'
    frame = 0
  }
  const scroll = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  const click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-chapter-link]')
    if (!button) return
    const i = Number(button.dataset.chapterLink)
    window.scrollTo({
      top: scrollY + story.getBoundingClientRect().top + innerHeight * i,
      behavior: 'smooth',
    })
  }
  update()
  window.addEventListener('scroll', scroll, { passive: true })
  window.addEventListener('resize', scroll)
  media?.addEventListener('change', scroll)
  host.addEventListener('click', click)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', scroll)
    window.removeEventListener('resize', scroll)
    media?.removeEventListener('change', scroll)
    host.removeEventListener('click', click)
  }
}
