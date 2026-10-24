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
