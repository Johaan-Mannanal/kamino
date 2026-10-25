import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  frames,
  assignPart,
  invalidateReview,
  parsePackage,
  type ReviewProject,
} from './assembly-review'
const pose = (x = 0, y = 0, z = 0) => ({
  position_m: [x, y, z] as [number, number, number],
  quaternion_wxyz: [1, 0, 0, 0] as [number, number, number, number],
})
const project = (): ReviewProject => ({
  schema_version: 'assembly-review-1.0',
  name: 'test',
  synthetic: true,
  root_link: 'base',
  notes: [],
  parts: [
    {
      id: 'part',
      mesh: 'part.obj',
      sha256: 'a'.repeat(64),
      pose: pose(0.2, 0, 0),
      group: 'arm',
      source: 'sourced',
      note: 'fixture',
      excluded_reason: null,
    },
  ],
  groups: ['base', 'arm'].map((name, i) => ({
    name,
    frame: pose(i * 0.1),
    mass_kg: { value: 0.1, source: 'estimated' },
    sliding_friction: null,
    reviewed: true,
    review_note: 'fixture',
  })),
  joints: [
    {
      name: 'hinge',
      parent: 'base',
      child: 'arm',
      kind: 'revolute',
      axis: [0, 0, 1],
      limits_rad: [-1, 1],
      source: 'sourced',
      note: 'test',
      origin: pose(),
      damping: { value: 0.1, source: 'estimated' },
      drive: { kp: 5, force_limit_nm: 2, source: 'estimated' },
      reviewed: true,
      review_note: 'test',
    },
  ],
})
it('rotates around the group pivot without moving the reference geometry', () => {
  const p = project()
  const f = frames(p, { hinge: Math.PI / 2 })
  const position = new Vector3(0.1, 0, 0).applyMatrix4(f.arm)
  expect(position.x).toBeCloseTo(0.1)
  expect(position.y).toBeCloseTo(0.1)
})
it('reassignment invalidates all prior review and clears exclusion', () => {
  const p = project()
  p.parts[0].excluded_reason = 'old'
  assignPart(p, 'part', 'base')
  expect(p.parts[0].group).toBe('base')
  expect(p.parts[0].excluded_reason).toBeNull()
  expect(p.groups.every((x) => !x.reviewed) && p.joints.every((x) => !x.reviewed)).toBe(true)
})
it('frame edits invalidate approvals without changing source properties', () => {
  const p = project()
  invalidateReview(p)
  expect(p.groups[0].mass_kg.source).toBe('estimated')
  expect(p.joints[0].reviewed).toBe(false)
})
it('rejects cyclic graphs in kinematic preview', () => {
  const p = project()
  p.joints[0].parent = 'arm'
  expect(() => frames(p, {})).toThrow()
})
it('rejects malformed package geometry', () => {
  expect(() => parsePackage(JSON.stringify({ format: 'wrong' }))).toThrow()
  expect(() =>
    parsePackage(
      JSON.stringify({
        format: 'photo2sim-review-package-1.0',
        project: project(),
        geometry: { part: { vertices: [[NaN, 0, 0]], faces: [[0, 1, 2]] } },
      }),
    ),
  ).toThrow()
})

const pack = (p = project()) => ({
  format: 'photo2sim-review-package-1.0',
  project: p,
  geometry: {
    part: {
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      faces: [[0, 1, 2]],
      bounds_m: [
        [0, 0, 0],
        [1, 1, 0],
      ],
    },
  },
})
it('rejects invalid editable physical and joint properties', () => {
  for (const mutate of [
    (p: ReviewProject) => {
      p.groups[0].mass_kg.value = -2
    },
    (p: ReviewProject) => {
      p.joints[0].limits_rad = [1, 2]
    },
    (p: ReviewProject) => {
      p.joints[0].origin.position_m[0] = 1
    },
    (p: ReviewProject) => {
      p.joints[0].source = 'guessed'
    },
    (p: ReviewProject) => {
      p.groups[1].name = 'base'
    },
  ]) {
    const p = project()
    mutate(p)
    expect(() => parsePackage(JSON.stringify(pack(p)))).toThrow()
  }
})
it('requires repackaging when imported source identity changes', async () => {
  const { replaceProject } = await import('./assembly-review')
  const original = parsePackage(JSON.stringify(pack()))
  for (const key of ['mesh', 'sha256', 'source', 'note'] as const) {
    const changed = structuredClone(original.project)
    changed.parts[0][key] = 'different'
    expect(() => replaceProject(original, changed)).toThrow(/source/i)
  }
})
it('clears every stale approval before acknowledging one item', async () => {
  const { acknowledge } = await import('./assembly-review')
  const p = project()
  acknowledge(p, p.groups[0])
  p.groups.forEach((x) => (x.reviewed = true))
  p.joints.forEach((x) => (x.reviewed = true))
  p.groups[1].frame.position_m[0] = 0.3
  const loaded = parsePackage(JSON.stringify(pack(p))).project
  expect([...loaded.groups, ...loaded.joints].every((x) => !x.reviewed)).toBe(true)
  acknowledge(loaded, loaded.groups[0])
  expect(loaded.groups[1].reviewed).toBe(false)
  expect(loaded.joints[0].reviewed).toBe(false)
})
