import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { buildCollisionPreviews } from './assembly-collision'
import { frames, matrix, type ReviewPackage, type Pose } from './assembly-review'

const identity: Pose = { position_m: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] }
function fixture(): ReviewPackage {
  const vertices = [-0.5, 0.5].flatMap((x) =>
    [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => [x, y, z])),
  )
  return {
    format: 'photo2sim-review-package-1.0',
    project: {
      schema_version: 'assembly-review-1.0',
      name: 'fixture',
      synthetic: true,
      root_link: 'base',
      notes: [],
      groups: [
        {
          name: 'base',
          frame: identity,
          mass_kg: { value: 1, source: 'estimated' },
          sliding_friction: null,
          reviewed: false,
          review_note: '',
        },
      ],
      joints: [],
      parts: [
        [0, 0, 0],
        [2, 0, 0],
        [0, 2, 0],
      ].map((p, i) => ({
        id: `p${i}`,
        mesh: `p${i}.obj`,
        sha256: 'a'.repeat(64),
        pose: { ...identity, position_m: p as [number, number, number] },
        group: 'base',
        source: 'user_supplied',
        note: 'synthetic',
        excluded_reason: null,
      })),
    },
    geometry: Object.fromEntries(
      [0, 1, 2].map((i) => [
        `p${i}`,
        {
          vertices,
          faces: [],
          bounds_m: [
            [-0.5, -0.5, -0.5],
            [0.5, 0.5, 0.5],
          ],
        },
      ]),
    ),
  }
}
function volume(geometry: import('three').BufferGeometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  const v = g.getAttribute('position')
  let sum = 0
  for (let i = 0; i < v.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(v, i),
      b = new Vector3().fromBufferAttribute(v, i + 1),
      c = new Vector3().fromBufferAttribute(v, i + 2)
    sum += a.dot(b.cross(c)) / 6
  }
  if (g !== geometry) g.dispose()
  return Math.abs(sum)
}
describe('export collision geometry preview', () => {
  it('builds one link-local box around all assigned parts, excluding omitted parts', () => {
    const p = fixture()
    p.project.parts[2].group = null
    p.project.groups[0].frame = {
      position_m: [0.2, 0.3, 0.4],
      quaternion_wxyz: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
    }
    const result = buildCollisionPreviews(p, 'box')
    expect(result.warnings).toEqual([])
    expect(result.proxies).toHaveLength(1)
    const g = result.proxies[0].geometry
    g.computeBoundingBox()
    const expected = new Box3()
    for (const part of p.project.parts.filter((x) => x.group)) {
      const t = matrix(p.project.groups[0].frame).invert().multiply(matrix(part.pose))
      p.geometry[part.id].vertices.forEach((v) =>
        expected.expandByPoint(new Vector3(...v).applyMatrix4(t)),
      )
    }
    expect(g.boundingBox!.min.distanceTo(expected.min)).toBeLessThan(1e-6)
    expect(g.boundingBox!.max.distanceTo(expected.max)).toBeLessThan(1e-6)
    g.dispose()
  })
  it('uses a convex hull of the whole link, filling gaps but less than the full box', () => {
    const p = fixture(),
      box = buildCollisionPreviews(p, 'box'),
      hull = buildCollisionPreviews(p, 'convex_mesh')
    expect(hull.warnings).toEqual([])
    expect(volume(box.proxies[0].geometry)).toBeCloseTo(9)
    expect(volume(hull.proxies[0].geometry)).toBeCloseTo(7)
    box.proxies[0].geometry.dispose()
    hull.proxies[0].geometry.dispose()
  })
  it('keeps collision geometry at the child pivot as the existing joint transforms move', () => {
    const p = fixture()
    p.project.groups.push({
      ...p.project.groups[0],
      name: 'arm',
      frame: { ...identity, position_m: [1, 0, 0] },
    })
    p.project.parts.forEach((x) => (x.group = 'arm'))
    p.project.joints = [
      {
        name: 'hinge',
        parent: 'base',
        child: 'arm',
        kind: 'revolute',
        origin: identity,
        axis: [0, 0, 1],
        limits_rad: [-2, 2],
        source: 'estimated',
        note: 'fixture',
        damping: { value: 0.1, source: 'estimated' },
        drive: { kp: 1, force_limit_nm: 1, source: 'estimated' },
        reviewed: false,
        review_note: '',
      },
    ]
    const result = buildCollisionPreviews(p, 'box')
    expect(result.proxies.map((x) => x.link)).toEqual(['arm'])
    expect(result.warnings.join(' ')).toContain('base')
    const t = frames(p.project, { hinge: Math.PI / 2 }).arm
    // Common-frame point (2,0,0) is (1,0,0) in the child frame.
    expect(new Vector3(1, 0, 0).applyMatrix4(t).toArray()).toEqual([1, 1, 0])
    result.proxies[0].geometry.dispose()
  })
})
