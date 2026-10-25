import { expect, it } from 'vitest'
import { addConnectedLink, changeJointKind } from './assembly-builder'
import {
  frames,
  jointValues,
  normalizeProjectDefaults,
  parsePackage,
  type ReviewPackage,
  type ReviewProject,
} from './assembly-review'
const pose = () => ({
  position_m: [0, 0, 0] as [number, number, number],
  quaternion_wxyz: [1, 0, 0, 0] as [number, number, number, number],
})
function project(): ReviewProject {
  return {
    schema_version: 'assembly-review-1.0',
    name: 'fixture',
    synthetic: true,
    root_link: 'base',
    parts: [
      {
        id: 'part',
        mesh: 'part.obj',
        sha256: 'a'.repeat(64),
        pose: pose(),
        group: 'base',
        source: 'estimated',
        note: 'synthetic',
        excluded_reason: null,
      },
    ],
    groups: [
      {
        name: 'base',
        frame: pose(),
        mass_kg: { value: 0.1, source: 'estimated' },
        sliding_friction: null,
        reviewed: false,
        review_note: '',
      },
    ],
    joints: [],
    notes: [],
  }
}
function pack(p: ReviewProject): ReviewPackage {
  return {
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
  }
}
it('creates sliders with metres travel and newtons, clears incompatible units when converting', () => {
  const p = addConnectedLink(project(), 'slider', 'base', 'travel', 'prismatic')
  expect(p.joints[0]).toMatchObject({
    kind: 'prismatic',
    limits_m: [-0.05, 0.05],
    limits_rad: null,
    drive: { force_limit_n: 2 },
  })
  expect(p.joints[0].drive?.force_limit_nm).toBeUndefined()
  p.joints[0].spring = { stiffness: 12, rest: 0.02, source: 'estimated' }
  const hinge = changeJointKind(p.joints[0], 'revolute')
  expect(hinge.limits_m).toBeNull()
  expect(hinge.drive?.force_limit_nm).toBe(2)
  expect(hinge.spring).toBeNull()
  const t = frames(p, { travel: 0.03 })
  expect(t.slider.elements[12]).toBe(0)
  expect(t.slider.elements[14]).toBeCloseTo(0.03)
})
it('resolves negative ratios, offsets and chains consistently and persists physics/springs on reopen', () => {
  let p = addConnectedLink(project(), 'driver', 'base', 'driver_joint', 'prismatic')
  p = addConnectedLink(p, 'follower', 'base', 'follower_joint', 'prismatic')
  p.joints[1].drive = null
  p.joints[1].coupling = {
    driver_joint: 'driver_joint',
    ratio: -0.5,
    offset: 0.01,
    source: 'user_supplied',
  }
  p.joints[0].spring = { stiffness: 4, rest: 0.02, source: 'estimated', note: 'test' }
  p.groups[1].physics = {
    collision: { kind: 'box', box_size_m: [0.1, 0.2, 0.3], offset_m: [0.01, 0, 0] },
    rolling_friction: { value: 0.01, source: 'estimated' },
  }
  const saved = parsePackage(JSON.stringify(pack(p)))
  expect(saved.project.groups[1].physics).toEqual(p.groups[1].physics)
  expect(saved.project.joints[0].spring).toEqual(p.joints[0].spring)
  expect(jointValues(saved.project, { driver_joint: 0.04, follower_joint: 0.04 })).toMatchObject({
    driver_joint: 0.04,
    follower_joint: -0.01,
  })
  expect(frames(saved.project, { driver_joint: 0.04 }).follower.elements[14]).toBeCloseTo(-0.01)
})
it('rejects coupling cycles, missing drivers, wrong type, impossible travel and competing drives', () => {
  let p = addConnectedLink(project(), 'a', 'base', 'a_joint', 'prismatic')
  p = addConnectedLink(p, 'b', 'base', 'b_joint', 'prismatic')
  p.joints[1].drive = null
  p.joints[1].coupling = { driver_joint: 'a_joint', ratio: 1, offset: 0, source: 'estimated' }
  const cases = [
    (v: ReviewProject) => {
      v.joints[1].coupling!.driver_joint = 'missing'
    },
    (v: ReviewProject) => {
      v.joints[0].coupling = { driver_joint: 'b_joint', ratio: 1, offset: 0, source: 'estimated' }
      v.joints[0].drive = null
    },
    (v: ReviewProject) => {
      v.joints[0] = changeJointKind(v.joints[0], 'revolute')
    },
    (v: ReviewProject) => {
      v.joints[1].coupling!.ratio = 3
    },
    (v: ReviewProject) => {
      v.joints[1].drive = { kp: 5, force_limit_n: 2, source: 'estimated' }
    },
  ]
  for (const change of cases) {
    const next = structuredClone(p)
    change(next)
    expect(() => parsePackage(JSON.stringify(pack(next)))).toThrow()
  }
})
it('keeps recorded angular mapping on independent hinges and derives followers', async () => {
  const { createMappings } = await import('./pose-mapping')
  let p = addConnectedLink(project(), 'a', 'base', 'driver', 'revolute')
  p = addConnectedLink(p, 'b', 'base', 'follower', 'revolute')
  p.joints[1].coupling = { driver_joint: 'driver', ratio: -1, offset: 0, source: 'estimated' }
  p.joints[1].drive = null
  const mappings = createMappings(p, {
    format: 'photo2sim-captures-1.0',
    captures: [
      { signals: { driver: { unit: 'radians', median: 0, minimum: -1, maximum: 1 } } },
    ] as never,
  })
  expect(mappings.map((m) => m.joint)).toEqual(['driver'])
})
it('retains legacy acknowledgements when the API expands only new nullable defaults', () => {
  const original = normalizeProjectDefaults(
    addConnectedLink(project(), 'arm', 'base', 'hinge', 'revolute'),
  )
  for (const item of [...original.groups, ...original.joints]) {
    item.reviewed = true
    item.review_note = 'Old reviewed input'
  }
  original.review_snapshot = JSON.stringify({ ...original, review_snapshot: null })
  const expanded = structuredClone(original)
  for (const group of expanded.groups) group.physics = null
  for (const joint of expanded.joints) {
    joint.limits_m = null
    joint.spring = null
    joint.coupling = null
    if (joint.drive) joint.drive.force_limit_n = null
  }
  const reopened = parsePackage(JSON.stringify(pack(expanded)))
  expect(reopened.project.review_snapshot).toBe(original.review_snapshot)
  expect(
    [...reopened.project.groups, ...reopened.project.joints].every((item) => item.reviewed),
  ).toBe(true)
  expanded.joints[0].spring = { stiffness: 1, rest: 0, source: 'estimated' }
  expect(parsePackage(JSON.stringify(pack(expanded))).project.review_snapshot).toBeNull()
})
