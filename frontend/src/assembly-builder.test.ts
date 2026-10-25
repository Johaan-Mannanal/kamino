import { expect, it } from 'vitest'
import { addConnectedLink, renameLink, changeJointKind } from './assembly-builder'
import type { ReviewProject } from './assembly-review'
const pose = () => ({
  position_m: [0, 0, 0] as [number, number, number],
  quaternion_wxyz: [1, 0, 0, 0] as [number, number, number, number],
})
const project = (): ReviewProject => ({
  schema_version: 'assembly-review-1.0',
  name: 'door',
  synthetic: true,
  root_link: 'base',
  parts: [],
  groups: [
    {
      name: 'base',
      frame: pose(),
      mass_kg: { value: 0.1, source: 'estimated' },
      sliding_friction: null,
      reviewed: true,
      review_note: 'test',
    },
  ],
  joints: [],
  notes: [],
  review_snapshot: 'old',
})
it('adds a connected hinge with explicit assumptions and invalidates review', () => {
  const p = project()
  const next = addConnectedLink(p, 'door', 'base', 'door_hinge', 'revolute')
  expect(next.groups.map((g) => g.name)).toEqual(['base', 'door'])
  expect(next.joints[0]).toMatchObject({
    parent: 'base',
    child: 'door',
    kind: 'revolute',
    axis: [0, 0, 1],
    limits_rad: [-0.8, 0.8],
    source: 'user_supplied',
    drive: { source: 'estimated' },
  })
  expect(next.groups.every((g) => !g.reviewed)).toBe(true)
  expect(p.groups).toHaveLength(1)
  expect(next.review_snapshot).toBeNull()
})
it('rejects bad names, duplicates and missing parents without changing the draft', () => {
  const p = addConnectedLink(project(), 'door', 'base', 'hinge', 'fixed')
  for (const args of [
    ['door', 'base', 'another'],
    ['bad name', 'base', 'other'],
    ['new', 'missing', 'other'],
    ['new', 'base', 'hinge'],
  ] as const)
    expect(() => addConnectedLink(p, args[0], args[1], args[2], 'fixed')).toThrow()
  expect(p.groups).toHaveLength(2)
})
it('renames root and child references including grouped parts', () => {
  const p = addConnectedLink(project(), 'door', 'base', 'hinge', 'fixed')
  p.parts = [
    {
      id: 'part',
      mesh: 'p.obj',
      sha256: 'a'.repeat(64),
      pose: pose(),
      group: 'door',
      source: 'estimated',
      note: 'test',
      excluded_reason: null,
    },
  ]
  const next = renameLink(renameLink(p, 'base', 'frame'), 'door', 'panel')
  expect(next.root_link).toBe('frame')
  expect(next.joints[0]).toMatchObject({ parent: 'frame', child: 'panel' })
  expect(next.parts[0].group).toBe('panel')
  expect(() => renameLink(next, 'panel', 'frame')).toThrow()
})
it('converts fixed joints to driven hinges and clears hinge-only fields on fixed conversion', () => {
  const p = addConnectedLink(project(), 'door', 'base', 'hinge', 'fixed')
  const hinge = changeJointKind(p.joints[0], 'revolute')
  expect(hinge.drive?.kp).toBe(5)
  const fixed = changeJointKind(hinge, 'fixed')
  expect([fixed.axis, fixed.limits_rad, fixed.drive, fixed.damping]).toEqual([
    null,
    null,
    null,
    null,
  ])
  expect(fixed.reviewed).toBe(false)
})
