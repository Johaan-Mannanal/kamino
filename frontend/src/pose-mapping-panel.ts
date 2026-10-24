import type { ReviewProject } from './assembly-review'
import {
  parseCaptures,
  createMappings,
  compareCaptures,
  editMapping,
  verifyMapping,
  saveReview,
  loadReview,
  projectBinding,
  replayObservation,
  unitScale,
  type CapturePack,
  type Mapping,
  type Unit,
} from './pose-mapping'

export function createMappingPanel(
  host: HTMLElement,
  preview: (values: Record<string, number>, capture: string) => void,
  download: (name: string, data: unknown) => void,
) {
  let project: ReviewProject,
    workspace = -1,
    version = 0,
    identity = '',
    pack: CapturePack | undefined,
    mappings: Mapping[] = [],
    selected = '',
    replayTime = 0,
    replayTimer: number | undefined,
    replayStatus: HTMLElement | undefined,
    replayScrub: HTMLInputElement | undefined
  host.classList.add('mapping-panel')
  host.innerHTML = `<h2>4. Compare captures and replay</h2><p>Map recorded signals to model joint angles. Preview one candidate across several poses before accepting it. This is kinematic review, not physics validation or hardware control.</p>
<label>Capture pack or saved mapping review <input type="file" accept=".json" aria-label="Capture pack or saved mapping review"></label>
<p class="mapping-message" role="status">Load an audited capture pack to begin.</p><div class="mapping-content"></div>`
  const status = host.querySelector<HTMLElement>('.mapping-message')!
  const content = host.querySelector<HTMLElement>('.mapping-content')!
  const file = host.querySelector<HTMLInputElement>('input[type=file]')!
  function stopReplay() {
    if (replayTimer !== undefined) window.clearInterval(replayTimer)
    replayTimer = undefined
  }
  function updateReplayControls(capture: CapturePack['captures'][number]) {
    if (!capture.observations || !replayStatus || !replayScrub) return
    const replay = replayObservation(project, capture, mappings, replayTime)
    replayStatus.textContent = `Unverified observation replay · ${replay.sample_index + 1}/${capture.observations.length} at ${replay.sample_time_s.toFixed(3)} s`
    replayScrub.value = String(replayTime)
  }
  function fail(e: unknown) {
    status.textContent = e instanceof Error ? e.message : String(e)
  }
  const text = (parent: HTMLElement, tag: string, value: string) => {
    const e = document.createElement(tag)
    e.textContent = value
    parent.append(e)
    return e
  }
  const button = (parent: HTMLElement, label: string, action: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.onclick = () => {
      try {
        action()
      } catch (e) {
        fail(e)
      }
    }
    parent.append(b)
    return b
  }
  function apply() {
    if (!pack || !selected) return
    const capture = pack.captures.find((c) => c.id === selected)!
    const result = capture.observations
      ? replayObservation(project, capture, mappings, replayTime)
      : compareCaptures(project, pack, mappings).find((r) => r.capture_id === selected)!
    const values = Object.fromEntries(
      Object.entries(result.joints).map(([name, row]) => [name, row.angle_rad ?? 0]),
    )
    preview(values, selected)
  }
  function draw() {
    replayStatus = undefined
    replayScrub = undefined
    content.replaceChildren()
    if (!pack) return
    const note = text(
      content,
      'p',
      'q = sign × radians-per-unit × reading + offset. All offsets are radians. Unmapped joints use zero only for display. Values outside limits are shown unchanged. Normalized conversions here are linear approximations; jaw gap is not joint angle.',
    )
    note.className = 'mapping-scope'
    const label = document.createElement('label')
    label.textContent = 'Preview capture'
    const select = document.createElement('select')
    select.setAttribute('aria-label', 'Preview capture')
    select.add(new Option('Select a capture', ''))
    pack.captures.forEach((c) => select.add(new Option(c.id, c.id)))
    select.value = selected
    select.onchange = () => {
      stopReplay()
      selected = select.value
      replayTime = 0
      if (!selected) preview({}, '')
      draw()
      apply()
    }
    label.append(select)
    content.append(label)
    button(content, 'Reset capture preview', () => {
      stopReplay()
      selected = ''
      preview({}, '')
      draw()
    })
    const photos = document.createElement('div')
    photos.className = 'mapping-photos'
    content.append(photos)
    const capture = pack.captures.find((c) => c.id === selected)
    if (capture) {
      if (capture.observations) {
        const last = capture.observations.at(-1)!.time_s
        const replay = replayObservation(project, capture, mappings, replayTime)
        const replayControls = document.createElement('div')
        replayControls.className = 'observation-replay'
        replayStatus = text(
          replayControls,
          'p',
          `Unverified observation replay · ${replay.sample_index + 1}/${capture.observations.length} at ${replay.sample_time_s.toFixed(3)} s`,
        )
        const scrub = document.createElement('input')
        scrub.type = 'range'
        scrub.min = '0'
        scrub.max = String(last)
        scrub.step = 'any'
        scrub.value = String(replayTime)
        scrub.setAttribute('aria-label', 'Observation replay time')
        replayScrub = scrub
        const seek = () => {
          stopReplay()
          replayTime = Number(scrub.value)
          apply()
          updateReplayControls(capture)
        }
        scrub.addEventListener('input', seek)
        replayControls.append(scrub)
        if (new Set(pack.captures.map((item) => item.calibration_sha256)).size !== 1)
          text(
            replayControls,
            'p',
            'Warning: different calibration hashes exist across this capture pack.',
          )
        const play = button(replayControls, 'Play observation replay', () => {
          stopReplay()
          const beganAt = performance.now()
          const beganAtTime = replayTime
          replayTimer = window.setInterval(() => {
            if (!pack || selected !== capture.id) {
              stopReplay()
              return
            }
            replayTime = Math.min(last, beganAtTime + (performance.now() - beganAt) / 1000)
            apply()
            updateReplayControls(capture)
            if (replayTime >= last) stopReplay()
          }, 50)
        })
        play.dataset.action = 'play-observations'
        const pause = button(replayControls, 'Pause observation replay', stopReplay)
        pause.dataset.action = 'pause-observations'
        button(replayControls, 'Reset observation replay', () => {
          stopReplay()
          replayTime = 0
          apply()
          updateReplayControls(capture)
        })
        content.append(replayControls)
      }
      for (const photo of capture.photos) {
        const figure = document.createElement('figure'),
          img = document.createElement('img')
        img.src = photo.data_url
        img.alt = `${capture.id}: ${photo.view}`
        figure.append(img)
        text(
          figure,
          'figcaption',
          photo.view + ' · resized source photo; camera alignment unverified',
        )
        photos.append(figure)
      }
      const details = document.createElement('details')
      text(details, 'summary', 'Capture pairing and source hashes')
      text(
        details,
        'pre',
        JSON.stringify(
          {
            samples: capture.samples,
            calibration_sha256: capture.calibration_sha256,
            pairing: capture.pairing,
            source_hashes: capture.source_hashes,
          },
          null,
          2,
        ),
      )
      content.append(details)
    }
    const signalNames = [...new Set(pack.captures.flatMap((c) => Object.keys(c.signals)))].sort()
    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i],
        row = document.createElement('details')
      row.className = 'mapping-row'
      text(
        row,
        'summary',
        `${m.joint} · ${m.status === 'user_verified' ? 'User-verified (attestation)' : 'Unverified'}`,
      )
      const grid = document.createElement('div')
      grid.className = 'guided-grid'
      row.append(grid)
      const change = (values: Partial<Mapping>) => {
        stopReplay()
        mappings[i] = editMapping(mappings[i], values)
        status.textContent = `${m.joint}: candidate changed; user verification cleared.`
        draw()
        apply()
        const updated = content.querySelectorAll<HTMLDetailsElement>('.mapping-row')[i]
        updated.open = true
      }
      const field = (
        name: string,
        input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
      ) => {
        const l = document.createElement('label')
        l.textContent = name
        input.setAttribute('aria-label', `${m.joint} ${name}`)
        l.append(input)
        grid.append(l)
      }
      const source = document.createElement('select')
      source.add(new Option('Unmapped', ''))
      signalNames.forEach((n) => source.add(new Option(n, n)))
      source.value = m.signal
      source.onchange = () => {
        const unit =
          pack!.captures.find((c) => Object.hasOwn(c.signals, source.value))?.signals[source.value]
            .unit ?? 'degrees'
        change({ signal: source.value, unit, radians_per_unit: unitScale(unit) })
      }
      field('Source signal', source)
      const unit = document.createElement('select')
      for (const u of ['degrees', 'radians', 'normalized_0_100', 'normalized_-100_100'])
        unit.add(new Option(u, u))
      unit.value = m.unit
      unit.onchange = () =>
        change({ unit: unit.value as Unit, radians_per_unit: unitScale(unit.value as Unit) })
      field('Source units', unit)
      const sign = document.createElement('select')
      sign.add(new Option('+1', '1'))
      sign.add(new Option('−1', '-1'))
      sign.value = String(m.sign)
      sign.onchange = () => change({ sign: Number(sign.value) as 1 | -1 })
      field('Sign', sign)
      for (const [name, key] of [
        ['Offset (rad)', 'offset_rad'],
        ['Radians per unit', 'radians_per_unit'],
      ] as const) {
        const input = document.createElement('input')
        input.type = 'number'
        input.step = 'any'
        input.value = m[key] === null ? '' : String(m[key])
        input.readOnly = key === 'radians_per_unit' && unitScale(m.unit) !== null
        input.onchange = () => {
          const value = input.value === '' ? null : Number(input.value)
          if (
            (key === 'offset_rad' && value === null) ||
            (value !== null &&
              (!Number.isFinite(value) || (key === 'radians_per_unit' && value <= 0)))
          ) {
            fail('Enter a finite offset or a positive conversion scale.')
            input.value = m[key] === null ? '' : String(m[key])
            return
          }
          change({ [key]: value })
        }
        field(name, input)
      }
      const reviewer = document.createElement('input')
      reviewer.value = m.reviewer
      field('Reviewer', reviewer)
      const evidence = document.createElement('textarea')
      evidence.value = m.evidence_note
      field('Evidence note', evidence)
      text(
        row,
        'p',
        'Recording verification cites every loaded capture. Describe the independent sign, offset and conversion evidence. At least two distinct readings and no conflicts are required. This records your judgement; it does not certify physical accuracy.',
      )
      button(row, 'Record user verification', () => {
        mappings[i] = verifyMapping(
          project,
          pack!,
          mappings,
          m.joint,
          reviewer.value,
          evidence.value,
          pack!.captures.map((c) => c.id),
        )
        status.textContent = `${m.joint}: user verification recorded with evidence.`
        draw()
      })
      button(row, 'Mark unverified', () => change({}))
      content.append(row)
    }
    text(content, 'h3', 'All captures — same candidate mapping')
    const results = compareCaptures(project, pack, mappings)
    const table = document.createElement('table'),
      head = document.createElement('tr')
    for (const name of ['Capture / joint', 'Angle (rad)', 'Findings']) text(head, 'th', name)
    table.append(head)
    for (const result of results)
      for (const [name, value] of Object.entries(result.joints)) {
        const row = document.createElement('tr')
        text(row, 'td', `${result.capture_id} / ${name}`)
        text(
          row,
          'td',
          value.angle_rad === null ? 'Unmapped (display 0)' : value.angle_rad.toFixed(5),
        )
        text(
          row,
          'td',
          value.issues.join('; ') || 'Within limits; physical mapping still requires evidence',
        )
        if (value.issues.length) row.className = 'mapping-conflict'
        table.append(row)
      }
    const scroll = document.createElement('div')
    scroll.className = 'mapping-table'
    scroll.append(table)
    content.append(scroll)
    button(content, 'Save mapping review and report', () =>
      download('mapping-review.json', saveReview(project, pack!, mappings)),
    ).dataset.action = 'save'
    text(
      content,
      'p',
      'A local review download is available. “Save mapping to job” retains this capture and photo evidence for the exact project revision; hardware configuration is unchanged.',
    )
  }
  file.onchange = async () => {
    const f = file.files?.[0]
    if (!f || !project) return
    const active = ++version
    stopReplay()
    selected = ''
    replayTime = 0
    preview({}, '')
    draw()
    try {
      if (f.size > 50_000_000) throw Error('File exceeds 50 MB')
      const raw = await f.text()
      if (active !== version) return
      let nextPack: CapturePack, nextMappings: Mapping[]
      if (JSON.parse(raw)?.format === 'photo2sim-mapping-review-1.0') {
        const review = loadReview(raw, project)
        nextPack = review.captures
        nextMappings = review.mappings
      } else {
        nextPack = parseCaptures(raw)
        nextMappings = createMappings(project, nextPack)
      }
      pack = nextPack
      mappings = nextMappings
      selected = ''
      replayTime = 0
      stopReplay()
      preview({}, '')
      status.textContent = `Loaded ${pack.captures.length} captures. Source hashes are recorded; browser imports do not re-audit original files. No automatic verification.`
      draw()
    } catch (e) {
      if (active === version) fail(e)
    } finally {
      if (active === version) file.value = ''
    }
  }
  return {
    sync(next: ReviewProject, key: number) {
      version++
      stopReplay()
      const nextIdentity = projectBinding(next)
      if (key !== workspace) {
        pack = undefined
        mappings = []
        status.textContent = 'Load an audited capture pack to begin.'
      } else if (identity !== nextIdentity && pack) {
        const previous = mappings
        mappings = createMappings(next, pack).map((m) =>
          editMapping(previous.find((p) => p.joint === m.joint) ?? m, {}),
        )
        status.textContent =
          'Project changed; all mapping verification cleared. Recheck the candidate against this revision.'
      }
      project = next
      workspace = key
      identity = nextIdentity
      selected = ''
      replayTime = 0
      draw()
    },
    cancelPreview() {
      stopReplay()
      selected = ''
      replayTime = 0
      draw()
    },
    invalidatePending() {
      version++
      stopReplay()
    },
    getReview() {
      return pack ? saveReview(project, pack, mappings) : undefined
    },
    loadSavedReview(raw: string) {
      stopReplay()
      version++
      const review = loadReview(raw, project)
      pack = review.captures
      mappings = review.mappings
      selected = ''
      replayTime = 0
      preview({}, '')
      status.textContent = `Loaded ${pack.captures.length} saved captures for this project revision.`
      draw()
    },
    dispose() {
      stopReplay()
      version++
    },
  }
}
