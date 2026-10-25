import { expect, it } from 'vitest'
import type { ReviewProject } from './assembly-review'
import {
  parseCaptures,
  createMappings,
  compareCaptures,
  editMapping,
  verifyMapping,
  saveReview,
  loadReview,
  replayObservation,
} from './pose-mapping'

export const project = {
  joints: [
    { name: 'hinge', kind: 'revolute', limits_rad: [-1, 1] },
    { name: 'jaw', kind: 'revolute', limits_rad: [0, 1.6] },
  ],
} as ReviewProject
export const pack = {
  format: 'photo2sim-captures-1.0',
  captures: [10, 90].map((angle, i) => ({
    id: `pose${i}`,
    samples: 10,
    calibration_sha256: 'a'.repeat(64),
    source_hashes: { 'capture.json': 'b'.repeat(64) },
    pairing: { association: 'operator-confirmed, not synchronized' },
    photos: [],
    signals: {
      'hinge.pos': { median: angle, minimum: angle, maximum: angle, unit: 'degrees' },
      'jaw.pos': {
        median: 5 + i * 5,
        minimum: 5 + i * 5,
        maximum: 5 + i * 5,
        unit: 'normalized_0_100',
      },
    },
  })),
}

it('uses one candidate across captures without clamping or inferring a jaw angle', () => {
  const captures = parseCaptures(JSON.stringify(pack))
  const mappings = createMappings(project, captures)
  const result = compareCaptures(project, captures, mappings)
  expect(result[0].joints.hinge.angle_rad).toBeCloseTo(Math.PI / 18)
  expect(result[1].joints.hinge.angle_rad).toBeCloseTo(Math.PI / 2)
  expect(result[1].joints.hinge.issues.join(' ')).toContain('limit')
  expect(result[0].joints.jaw.angle_rad).toBeNull()
  expect(result[0].joints.jaw.issues.join(' ')).toContain('conversion')
  expect(mappings.every((m) => m.status === 'unverified')).toBe(true)
})
it('applies explicit normalized conversion and signed offset; edits revoke verification', () => {
  const c = parseCaptures(JSON.stringify(pack))
  const m = createMappings(project, c)
  m[0] = editMapping(m[0], { sign: -1, offset_rad: 0.2 })
  m[1] = editMapping(m[1], { radians_per_unit: 0.01 })
  const r = compareCaptures(project, c, m)
  expect(r[0].joints.hinge.angle_rad).toBeCloseTo(0.2 - Math.PI / 18)
  expect(r[0].joints.jaw.angle_rad).toBeCloseTo(0.05)
  const verified = verifyMapping(project, c, m, 'jaw', 'Johaan', 'Two measured openings', [
    'pose0',
    'pose1',
  ])
  expect(verified.status).toBe('user_verified')
  expect(editMapping(verified, { offset_rad: 0.1 }).status).toBe('unverified')
})
it('blocks verification with insufficient evidence or limit conflicts', () => {
  const c = parseCaptures(JSON.stringify(pack))
  const m = createMappings(project, c)
  expect(() => verifyMapping(project, c, m, 'hinge', 'J', 'Checked', ['pose0', 'pose1'])).toThrow(
    /conflict/,
  )
  m[1] = editMapping(m[1], { radians_per_unit: 0.01 })
  expect(() => verifyMapping(project, c, m, 'jaw', 'J', 'Checked', ['pose0'])).toThrow(/two/)
  expect(() => verifyMapping(project, c, m, 'jaw', '', '', ['pose0', 'pose1'])).toThrow()
})
it('reports unit, missing source and calibration conflicts', () => {
  const c = parseCaptures(JSON.stringify(pack))
  const m = createMappings(project, c)
  c.captures[1].signals['hinge.pos'].unit = 'radians'
  c.captures[1].calibration_sha256 = 'c'.repeat(64)
  delete c.captures[1].signals['jaw.pos']
  const r = compareCaptures(project, c, m)
  expect(r[1].joints.hinge.angle_rad).toBeNull()
  expect(r[1].joints.hinge.issues.join(' ')).toMatch(/unit/)
  expect(r[0].joints.hinge.issues.join(' ')).toMatch(/calibration/)
  expect(r[1].joints.jaw.issues.join(' ')).toMatch(/Missing/)
})
it('saves and reloads exact-bound evidence; rejects changed projects and forged verification', () => {
  const c = parseCaptures(JSON.stringify(pack))
  const m = createMappings(project, c)
  m[1] = editMapping(m[1], { radians_per_unit: 0.01 })
  m[1] = verifyMapping(project, c, m, 'jaw', 'J', 'Measured', ['pose0', 'pose1'])
  const saved = saveReview(project, c, m)
  expect(loadReview(JSON.stringify(saved), project).mappings[1].status).toBe('user_verified')
  expect(() => loadReview(JSON.stringify(saved), { ...project, name: 'changed' })).toThrow(
    /project/,
  )
  saved.mappings[1].offset_rad = 0.1
  expect(() => loadReview(JSON.stringify(saved), project)).toThrow(/verification/)
})
it('rejects invalid numbers, duplicate captures and unsafe image types', () => {
  for (const mutate of [
    (p: any) => {
      p.captures[0].signals['jaw.pos'].median = null
    },
    (p: any) => {
      p.captures[1].id = p.captures[0].id
    },
    (p: any) => {
      p.captures[0].photos = [{ data_url: 'javascript:alert(1)' }]
    },
  ]) {
    const p = structuredClone(pack)
    mutate(p)
    expect(() => parseCaptures(JSON.stringify(p))).toThrow()
  }
})
it('invalidates verification when embedded photo evidence changes', () => {
  const c = parseCaptures(JSON.stringify(pack))
  c.captures[0].photos = [
    {
      view: 'front',
      original_sha256: 'd'.repeat(64),
      data_url: 'data:image/jpeg;base64,YQ==',
      note: 'Preview',
    },
  ]
  const m = createMappings(project, c)
  m[1] = editMapping(m[1], { radians_per_unit: 0.01 })
  m[1] = verifyMapping(project, c, m, 'jaw', 'J', 'Measured', ['pose0', 'pose1'])
  const saved = saveReview(project, c, m)
  saved.captures.captures[0].photos[0].data_url = 'data:image/jpeg;base64,Yg=='
  expect(() => loadReview(JSON.stringify(saved), project)).toThrow(/verification/)
})
it('replays the nearest preceding recorded observation with the same conversion and limit warning', () => {
  const raw: any = structuredClone(pack)
  raw.captures[0].samples = 3
  raw.captures[0].signals['hinge.pos'].maximum = 90
  raw.captures[0].signals['jaw.pos'].maximum = 10
  raw.captures[0].observations = [
    { time_s: 0, values: { 'hinge.pos': 10, 'jaw.pos': 5 } },
    { time_s: 0.5, values: { 'hinge.pos': 90, 'jaw.pos': 10 } },
    { time_s: 2, values: { 'hinge.pos': 20, 'jaw.pos': 8 } },
  ]
  const captures = parseCaptures(JSON.stringify(raw))
  const mappings = createMappings(project, captures)
  mappings[1] = editMapping(mappings[1], { radians_per_unit: 0.01 })
  const replay = replayObservation(project, captures.captures[0], mappings, 1.25)
  expect(replay.sample_index).toBe(1)
  expect(replay.sample_time_s).toBe(0.5)
  expect(replay.joints.hinge.angle_rad).toBeCloseTo(Math.PI / 2)
  expect(replay.joints.hinge.issues.join(' ')).toContain('limit')
  expect(replay.joints.jaw.angle_rad).toBeCloseTo(0.1)
})
it('rejects invalid observation timelines and preserves stationary packs', () => {
  expect(parseCaptures(JSON.stringify(pack)).captures[0].observations).toBeUndefined()
  for (const mutate of [
    (p: any) => (p.captures[0].observations = [{ time_s: 0, values: { 'hinge.pos': 10 } }]),
    (p: any) => {
      p.captures[0].samples = 2
      p.captures[0].observations = [
        { time_s: 1, values: { 'hinge.pos': 10, 'jaw.pos': 5 } },
        { time_s: 1, values: { 'hinge.pos': 10, 'jaw.pos': 5 } },
      ]
    },
    (p: any) => {
      p.captures[0].samples = 2
      p.captures[0].observations = [
        { time_s: 0, values: { 'hinge.pos': 1000, 'jaw.pos': 5 } },
        { time_s: 1, values: { 'hinge.pos': 10, 'jaw.pos': 5 } },
      ]
    },
  ]) {
    const raw = structuredClone(pack)
    mutate(raw)
    expect(() => parseCaptures(JSON.stringify(raw))).toThrow(/observation/i)
  }
})
it('loads and saves legacy mapping attestations after only new defaults are expanded', () => {
  const single = structuredClone(project)
  single.joints = [single.joints[0]]
  single.joints[0].limits_rad = [-2, 2]
  single.joints[0].drive = { kp: 5, force_limit_nm: 2, source: 'estimated' }
  const captures = parseCaptures(JSON.stringify(pack))
  const mapped = createMappings(single, captures)
  mapped[0] = verifyMapping(
    single,
    captures,
    mapped,
    mapped[0].joint,
    'Reviewer',
    'Two fixture poses',
    captures.captures.map((c) => c.id),
  )
  const review = saveReview(single, captures, mapped)
  const legacy = JSON.parse(JSON.stringify(review))
  // Recreate pre-extension binding text rather than using the new writer.
  const binding = JSON.parse(legacy.mappings[0].verification_binding)
  legacy.mappings[0].verification_binding = JSON.stringify(binding)
  legacy.project_snapshot = JSON.stringify(single)
  const expanded = structuredClone(single)
  Object.assign(expanded.joints[0], { limits_m: null, spring: null, coupling: null })
  expanded.joints[0].drive!.force_limit_n = null
  const loaded = loadReview(JSON.stringify(legacy), expanded)
  expect(loaded.mappings[0].status).toBe('user_verified')
  expect(loaded.mappings[0].verification_binding).toBe(legacy.mappings[0].verification_binding)
  expanded.joints[0].spring = { stiffness: 1, rest: 0, source: 'estimated' }
  expect(() => loadReview(JSON.stringify(legacy), expanded)).toThrow(/different project/)
})
