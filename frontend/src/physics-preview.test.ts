import { expect, it } from 'vitest'
import * as THREE from 'three'
import { collisionPreview } from './physics-preview'
import { orientationMatrix } from './orientation'

function reviewedMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.2, 0.08),
    new THREE.MeshStandardMaterial(),
  )
  mesh.position.set(0.04, -0.03, 0.02)
  mesh.rotation.set(0.1, -0.2, 0.3)
  const rotated = new THREE.Group()
  rotated.add(mesh)
  rotated.applyMatrix4(orientationMatrix({ x_deg: 37, y_deg: 19, z_deg: -23 }))
  const source = new THREE.Group()
  source.add(rotated)
  source.scale.set(2, 3, 4)
  const root = new THREE.Group()
  root.add(source)
  source.updateMatrixWorld(true)
  source.position.sub(new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3()))
  root.updateMatrixWorld(true)
  return { root, source, mesh }
}
const pointKey = (point: THREE.Vector3) =>
  point
    .toArray()
    .map((value) => value.toFixed(6))
    .join(',')
function worldPoints(mesh: THREE.Mesh) {
  mesh.updateWorldMatrix(true, false)
  const positions = mesh.geometry.getAttribute('position')
  return new Set(
    Array.from({ length: positions.count }, (_, i) =>
      pointKey(
        new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld),
      ),
    ),
  )
}
const release = (overlay: THREE.Object3D | null) =>
  overlay?.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        material.dispose()
    }
  })

it('builds the convex overlay from centred vertices after reviewed rotation and world-axis scaling', () => {
  const { root, source, mesh } = reviewedMesh()
  const overlay = collisionPreview(source, {
    showCollision: true,
    metric: true,
    physics: { collision: { kind: 'convex_hull' } },
  }) as THREE.Mesh
  root.add(overlay)
  expect(worldPoints(overlay)).toEqual(worldPoints(mesh))
  const expected = new THREE.Box3().setFromObject(source)
  const actual = new THREE.Box3().setFromObject(overlay)
  expect(actual.min.toArray()).toEqual(
    expected.min.toArray().map((value) => expect.closeTo(value, 6)),
  )
  expect(actual.max.toArray()).toEqual(
    expected.max.toArray().map((value) => expect.closeTo(value, 6)),
  )
  release(overlay)
})

it('uses explicit box dimensions as full sizes and applies the collision offset exactly once', () => {
  const { source } = reviewedMesh()
  const overlay = collisionPreview(source, {
    showCollision: true,
    metric: true,
    physics: {
      collision: {
        kind: 'box',
        box_size_m: [0.8, 0.9, 1.2],
        offset_m: [0.05, -0.02, 0.1],
      },
    },
  })!
  const bounds = new THREE.Box3().setFromObject(overlay)
  expect(bounds.getSize(new THREE.Vector3()).toArray()).toEqual([
    expect.closeTo(0.8),
    expect.closeTo(0.9),
    expect.closeTo(1.2),
  ])
  expect(bounds.getCenter(new THREE.Vector3()).toArray()).toEqual([
    expect.closeTo(0.05),
    expect.closeTo(-0.02),
    expect.closeTo(0.1),
  ])
  release(overlay)
})

it('derives the default box from the complete oriented and sized visual bounds', () => {
  const { source } = reviewedMesh()
  const overlay = collisionPreview(source, { showCollision: true, metric: true })!
  const expected = new THREE.Box3().setFromObject(source)
  const actual = new THREE.Box3().setFromObject(overlay)
  expect(actual.min.toArray()).toEqual(
    expected.min.toArray().map((value) => expect.closeTo(value, 6)),
  )
  expect(actual.max.toArray()).toEqual(
    expected.max.toArray().map((value) => expect.closeTo(value, 6)),
  )
  release(overlay)
})

it('keeps metre-only collision overrides out of an unsized source-unit preview', () => {
  const { source } = reviewedMesh()
  const overlay = collisionPreview(source, {
    showCollision: true,
    metric: false,
    physics: {
      collision: {
        kind: 'box',
        box_size_m: [20, 30, 40],
        offset_m: [10, 10, 10],
      },
    },
  })!
  const expected = new THREE.Box3().setFromObject(source)
  const actual = new THREE.Box3().setFromObject(overlay)
  expect(actual.min.toArray()).toEqual(
    expected.min.toArray().map((value) => expect.closeTo(value, 6)),
  )
  expect(actual.max.toArray()).toEqual(
    expected.max.toArray().map((value) => expect.closeTo(value, 6)),
  )
  release(overlay)
})

it.each(['box', 'convex_hull'] as const)(
  'does not mutate source geometry, materials, hierarchy, or reviewed transforms for %s',
  (kind) => {
    const { source, mesh } = reviewedMesh()
    const before = {
      positions: [...mesh.geometry.getAttribute('position').array],
      material: mesh.material,
      parent: source.parent,
      meshParent: mesh.parent,
      children: [...source.children],
      transforms: [source, mesh.parent!, mesh].map((object) => ({
        position: object.position.clone(),
        quaternion: object.quaternion.toArray(),
        scale: object.scale.clone(),
      })),
    }
    const overlay = collisionPreview(source, {
      showCollision: true,
      metric: true,
      physics: { collision: { kind } },
    })!
    expect([...mesh.geometry.getAttribute('position').array]).toEqual(before.positions)
    expect(mesh.material).toBe(before.material)
    expect(source.parent).toBe(before.parent)
    expect(mesh.parent).toBe(before.meshParent)
    expect(source.children).toEqual(before.children)
    ;[source, mesh.parent!, mesh].forEach((object, i) => {
      expect(object.position).toEqual(before.transforms[i].position)
      expect(object.quaternion.toArray()).toEqual(before.transforms[i].quaternion)
      expect(object.scale).toEqual(before.transforms[i].scale)
    })
    expect(overlay.userData.physicsOverlay).toBe(true)
    release(overlay)
  },
)

it('does not construct a collision overlay while it is hidden', () => {
  const { source } = reviewedMesh()
  expect(collisionPreview(source, { showCollision: false, metric: true })).toBeNull()
})

it('rejects a planar source instead of presenting an invalid three-dimensional convex hull', () => {
  const source = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial())
  expect(() =>
    collisionPreview(source, {
      showCollision: true,
      metric: true,
      physics: { collision: { kind: 'convex_hull' } },
    }),
  ).toThrow()
})

it('uses actual transformed tetrahedron vertices for collision extents rather than a rotated local bounding box', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.2, 0, 0, 0, 0.4, 0, 0, 0, 0.6], 3),
  )
  geometry.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3])
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  const rotated = new THREE.Group()
  rotated.add(mesh)
  rotated.applyMatrix4(orientationMatrix({ x_deg: 23, y_deg: 41, z_deg: -17 }))
  const source = new THREE.Group()
  source.add(rotated)
  source.scale.set(2, 3, 4)
  const root = new THREE.Group()
  root.add(source)
  const exactBounds = () => {
    mesh.updateWorldMatrix(true, false)
    const bounds = new THREE.Box3()
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++)
      bounds.expandByPoint(
        new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld),
      )
    return bounds
  }
  source.position.sub(exactBounds().getCenter(new THREE.Vector3()))
  const expected = exactBounds()
  const overlay = collisionPreview(source, { showCollision: true, metric: true })!
  root.add(overlay)
  const actual = new THREE.Box3().setFromObject(overlay, true)
  expect(actual.min.toArray()).toEqual(
    expected.min.toArray().map((value) => expect.closeTo(value, 6)),
  )
  expect(actual.max.toArray()).toEqual(
    expected.max.toArray().map((value) => expect.closeTo(value, 6)),
  )
  expect(actual.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0, 6)
  release(overlay)
})
