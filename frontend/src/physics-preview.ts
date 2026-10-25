import * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import type { PhysicsSettings, Vec3 } from './types'

export type PhysicsPreview = {
  physics?: PhysicsSettings | null
  placement_m?: Vec3 | null
  showCollision: boolean
  metric: boolean
}

/** Display-only collision approximation in the centred, already oriented/sized frame. */
export function collisionPreview(
  source: THREE.Object3D,
  settings: PhysicsPreview,
): THREE.Object3D | null {
  if (!settings.showCollision) return null
  source.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(source, true)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const collision = settings.metric ? settings.physics?.collision : undefined
  let geometry: THREE.BufferGeometry
  if (collision?.kind === 'convex_hull') {
    const points: THREE.Vector3[] = []
    const inverse = source.parent
      ? new THREE.Matrix4().copy(source.parent.matrixWorld).invert()
      : new THREE.Matrix4()
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const position = object.geometry.getAttribute('position')
      if (!position) return
      const transform = inverse.clone().multiply(object.matrixWorld)
      for (let i = 0; i < position.count; i++)
        points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(transform))
    })
    if (points.length < 4)
      throw new Error('Convex collision preview needs a three-dimensional mesh.')
    geometry = new ConvexGeometry(points)
    const vertices = geometry.getAttribute('position')
    let volume6 = 0
    const origin = points[0]
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3()
    for (let i = 0; vertices && i + 2 < vertices.count; i += 3) {
      a.fromBufferAttribute(vertices, i).sub(origin)
      b.fromBufferAttribute(vertices, i + 1).sub(origin)
      c.fromBufferAttribute(vertices, i + 2).sub(origin)
      volume6 += a.dot(b.cross(c))
    }
    const span = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3())
    const scale = Math.max(span.x, span.y, span.z)
    if (!vertices?.count || !Number.isFinite(volume6) || Math.abs(volume6) <= scale ** 3 * 1e-10) {
      geometry.dispose()
      throw new Error('Convex collision preview needs a nonzero-volume three-dimensional mesh.')
    }
  } else {
    const extents = collision?.box_size_m ?? size.toArray()
    geometry = new THREE.BoxGeometry(...(extents as Vec3))
    // The source has been centred; retain exact bounding centre for non-centred fixtures.
    geometry.translate(center.x, center.y, center.z)
  }
  const overlay = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xffa65b,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
    }),
  )
  overlay.name = 'physics-collision-preview'
  overlay.userData.physicsOverlay = true
  if (collision?.offset_m) overlay.position.set(...collision.offset_m)
  overlay.renderOrder = 2
  return overlay
}
