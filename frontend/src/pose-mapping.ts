import type { ReviewProject } from './assembly-review'
export type Unit = 'degrees' | 'radians' | 'normalized_0_100' | 'normalized_-100_100'
export type Signal = { unit: Unit; median: number; minimum: number; maximum: number }
export type Observation = { time_s: number; values: Record<string, number> }
export type Capture = {
  id: string
  samples: number
  calibration_sha256: string
  source_hashes: Record<string, string>
  pairing: Record<string, unknown>
  signals: Record<string, Signal>
  observations?: Observation[]
  photos: { view: string; original_sha256: string; data_url: string; note?: string }[]
}
export type CapturePack = { format: 'photo2sim-captures-1.0'; captures: Capture[] }
export type Mapping = {
  joint: string
  signal: string
  unit: Unit
  sign: 1 | -1
  offset_rad: number
  radians_per_unit: number | null
  status: 'unverified' | 'user_verified'
  reviewer: string
  evidence_note: string
  capture_ids: string[]
  verification_binding: string | null
}
const units = ['degrees', 'radians', 'normalized_0_100', 'normalized_-100_100']
const check = (ok: unknown, message: string) => {
  if (!ok) throw Error(message)
}
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export function parseCaptures(text: string): CapturePack {
  check(text.length < 40_000_000, 'Capture file exceeds 40 MB')
  const p = JSON.parse(text) as CapturePack
  check(
    p?.format === 'photo2sim-captures-1.0' &&
      Array.isArray(p.captures) &&
      p.captures.length >= 1 &&
      p.captures.length <= 20,
    'Choose a capture pack with 1–20 captures',
  )
  const ids = new Set<string>()
  for (const c of p.captures) {
    check(
      c && typeof c.id === 'string' && c.id.length > 0 && c.id.length < 200 && !ids.has(c.id),
      'Invalid or duplicate capture ID',
    )
    ids.add(c.id)
    check(
      Number.isInteger(c.samples) &&
        c.samples >= 2 &&
        c.samples <= 20_000 &&
        hash(c.calibration_sha256),
      'Invalid capture provenance',
    )
    check(
      object(c.source_hashes) &&
        Object.keys(c.source_hashes).length > 0 &&
        Object.values(c.source_hashes).every(hash),
      'Source hashes required',
    )
    check(
      object(c.pairing) &&
        object(c.signals) &&
        Object.keys(c.signals).length > 0 &&
        Object.keys(c.signals).length <= 128,
      'Invalid capture signals or pairing',
    )
    for (const s of Object.values(c.signals)) {
      check(
        s &&
          units.includes(s.unit) &&
          [s.median, s.minimum, s.maximum].every(Number.isFinite) &&
          s.minimum <= s.median &&
          s.median <= s.maximum,
        'Invalid signal units or values',
      )
    }
    if (c.observations !== undefined) {
      check(
        Array.isArray(c.observations) && c.observations.length === c.samples,
        'Invalid observation count',
      )
      let previous = -1
      const keys = Object.keys(c.signals).sort()
      for (const observation of c.observations) {
        check(
          object(observation) &&
            Number.isFinite(observation.time_s) &&
            observation.time_s >= 0 &&
            observation.time_s > previous &&
            object(observation.values) &&
            JSON.stringify(Object.keys(observation.values).sort()) === JSON.stringify(keys),
          'Invalid observation timeline',
        )
        previous = observation.time_s
        for (const key of keys) {
          const value = observation.values[key]
          const signal = c.signals[key]
          check(
            Number.isFinite(value) && value >= signal.minimum && value <= signal.maximum,
            'Invalid observation value',
          )
        }
      }
    }
    check(Array.isArray(c.photos) && c.photos.length <= 8, 'Invalid capture photos')
    for (const photo of c.photos)
      check(
        photo &&
          typeof photo.view === 'string' &&
          hash(photo.original_sha256) &&
          typeof photo.data_url === 'string' &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo.data_url),
        'Only embedded JPEG photo previews are accepted',
      )
  }
  return p
}
export const unitScale = (unit: Unit): number | null =>
  unit === 'degrees' ? Math.PI / 180 : unit === 'radians' ? 1 : null
export function createMappings(project: ReviewProject, pack: CapturePack): Mapping[] {
  return project.joints
    .filter((j) => j.kind === 'revolute')
    .map((j) => {
      const signal =
        [j.name + '.pos', j.name].find((n) => Object.hasOwn(pack.captures[0].signals, n)) ?? ''
      const unit = pack.captures[0].signals[signal]?.unit ?? 'degrees'
      return {
        joint: j.name,
        signal,
        unit,
        sign: 1,
        offset_rad: 0,
        radians_per_unit: unitScale(unit),
        status: 'unverified',
        reviewer: '',
        evidence_note: '',
        capture_ids: [],
        verification_binding: null,
      }
    })
}
export function editMapping(m: Mapping, change: Partial<Mapping>): Mapping {
  return {
    ...m,
    ...change,
    status: 'unverified',
    reviewer: '',
    evidence_note: '',
    capture_ids: [],
    verification_binding: null,
  }
}
function validMappings(project: ReviewProject, mappings: Mapping[]) {
  const names = project.joints.filter((j) => j.kind === 'revolute').map((j) => j.name)
  check(
    Array.isArray(mappings) &&
      names.length === mappings.length &&
      new Set(mappings.map((m) => m.joint)).size === names.length,
    'Mapping must cover each revolute joint once',
  )
  for (const m of mappings) {
    check(
      names.includes(m.joint) &&
        typeof m.signal === 'string' &&
        units.includes(m.unit) &&
        [1, -1].includes(m.sign) &&
        Number.isFinite(m.offset_rad),
      'Invalid mapping',
    )
    check(
      m.radians_per_unit === null ||
        (Number.isFinite(m.radians_per_unit) && m.radians_per_unit > 0),
      'Conversion must be positive or unset',
    )
    const scale = unitScale(m.unit)
    check(
      scale === null || m.radians_per_unit === scale,
      'Angular units use their exact radians conversion',
    )
    check(['unverified', 'user_verified'].includes(m.status), 'Invalid verification status')
  }
}
type JointResult = { angle_rad: number | null; issues: string[] }
function mapValues(
  project: ReviewProject,
  c: Capture,
  mappings: Mapping[],
  values: Record<string, number>,
  calibrationConflict: boolean,
) {
  const joints: Record<string, JointResult> = Object.create(null)
  for (const m of mappings) {
    const issues: string[] = []
    if (calibrationConflict) issues.push('Different calibration hashes across captures')
    if (m.signal && mappings.filter((x) => x.signal === m.signal).length > 1)
      issues.push('Duplicate source signal mapping')
    const signal = Object.hasOwn(c.signals, m.signal) ? c.signals[m.signal] : undefined
    let angle: number | null = null
    if (!signal) issues.push('Missing source signal')
    else if (signal.unit !== m.unit) issues.push('Declared unit mismatch')
    else if (m.radians_per_unit === null)
      issues.push('Explicit conversion required for normalized signal')
    else {
      const sourceValue = values[m.signal]
      if (!Number.isFinite(sourceValue)) issues.push('Missing source observation')
      const value = m.sign * m.radians_per_unit * sourceValue + m.offset_rad
      if (!Number.isFinite(value)) issues.push('Nonfinite conversion')
      else {
        angle = value
        const limits = project.joints.find((j) => j.name === m.joint)!.limits_rad!
        const ends = [signal.minimum, signal.maximum].map(
          (v) => m.sign * m.radians_per_unit! * v + m.offset_rad,
        )
        if (ends.some((v) => !Number.isFinite(v) || v < limits[0] || v > limits[1]))
          issues.push(`Joint limit conflict [${limits.join(', ')}] rad; values are not clipped`)
      }
    }
    joints[m.joint] = { angle_rad: angle, issues }
  }
  return joints
}
export function compareCaptures(project: ReviewProject, pack: CapturePack, mappings: Mapping[]) {
  validMappings(project, mappings)
  const calibrationConflict = new Set(pack.captures.map((c) => c.calibration_sha256)).size !== 1
  return pack.captures.map((c) => ({
    capture_id: c.id,
    joints: mapValues(
      project,
      c,
      mappings,
      Object.fromEntries(Object.entries(c.signals).map(([key, signal]) => [key, signal.median])),
      calibrationConflict,
    ),
  }))
}
export function replayObservation(
  project: ReviewProject,
  capture: Capture,
  mappings: Mapping[],
  time_s: number,
): { sample_index: number; sample_time_s: number; joints: Record<string, JointResult> } {
  validMappings(project, mappings)
  check(
    Number.isFinite(time_s) && time_s >= 0 && capture.observations,
    'Observation replay unavailable',
  )
  const observations = capture.observations!
  let sample_index = 0
  for (let i = 1; i < observations.length; i++) {
    if (observations[i].time_s > time_s) break
    sample_index = i
  }
  const sample = observations[sample_index]
  return {
    sample_index,
    sample_time_s: sample.time_s,
    joints: mapValues(project, capture, mappings, sample.values, false),
  }
}
const canonical = (value: unknown): string => {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : object(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sorted(v[k])]),
          )
        : v
  return JSON.stringify(sorted(value))
}
export const projectBinding = (p: ReviewProject) => canonical(p)
function binding(project: ReviewProject, pack: CapturePack, m: Mapping) {
  return canonical({
    project,
    captures: pack.captures,
    conversion: {
      joint: m.joint,
      signal: m.signal,
      unit: m.unit,
      sign: m.sign,
      offset_rad: m.offset_rad,
      radians_per_unit: m.radians_per_unit,
    },
    reviewer: m.reviewer,
    evidence_note: m.evidence_note,
    capture_ids: m.capture_ids,
  })
}
export function verifyMapping(
  project: ReviewProject,
  pack: CapturePack,
  mappings: Mapping[],
  joint: string,
  reviewer: string,
  note: string,
  ids: string[],
): Mapping {
  check(reviewer.trim() && note.trim(), 'Reviewer and evidence note required')
  check(
    new Set(ids).size >= 2 && ids.every((id) => pack.captures.some((c) => c.id === id)),
    'Cite at least two captures',
  )
  const m = mappings.find((m) => m.joint === joint)!
  check(m, 'Unknown mapping joint')
  check(
    compareCaptures(project, pack, mappings).every((r) => !r.joints[joint].issues.length),
    'Resolve mapping conflicts before verification',
  )
  check(
    new Set(pack.captures.filter((c) => ids.includes(c.id)).map((c) => c.signals[m.signal].median))
      .size >= 2,
    'Need two distinct source readings to verify a conversion',
  )
  const result: Mapping = {
    ...m,
    status: 'user_verified',
    reviewer: reviewer.trim(),
    evidence_note: note.trim(),
    capture_ids: ids,
    verification_binding: null,
  }
  result.verification_binding = binding(project, pack, result)
  return result
}
export function saveReview(project: ReviewProject, captures: CapturePack, mappings: Mapping[]) {
  const comparisons = compareCaptures(project, captures, mappings)
  for (const m of mappings.filter((m) => m.status === 'user_verified')) {
    check(
      m.verification_binding === binding(project, captures, m),
      'Stale verification; review again',
    )
    verifyMapping(project, captures, mappings, m.joint, m.reviewer, m.evidence_note, m.capture_ids)
  }
  return {
    format: 'photo2sim-mapping-review-1.0',
    project_snapshot: projectBinding(project),
    captures,
    mappings,
    comparisons,
    physical_accuracy_verified: false,
    note: 'User verification is an attestation, not independent calibration. No hardware commands. Unmapped joints display at zero only.',
  }
}
export function loadReview(text: string, project: ReviewProject) {
  check(text.length < 50_000_000, 'Review exceeds 50 MB')
  const r = JSON.parse(text)
  check(
    r?.format === 'photo2sim-mapping-review-1.0' && r.project_snapshot === projectBinding(project),
    'Mapping review belongs to a different project revision',
  )
  const captures = parseCaptures(JSON.stringify(r.captures))
  return saveReview(project, captures, r.mappings as Mapping[])
}
