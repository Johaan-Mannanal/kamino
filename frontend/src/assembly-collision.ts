import { Box3, BoxGeometry, BufferGeometry, Vector3 } from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { matrix, type ReviewPackage } from './assembly-review'

export type CollisionMode = 'box' | 'convex_mesh'
export type CollisionProxy = { link: string; geometry: BufferGeometry }

// Mirrors preparation's inverse(group.frame) * part.pose, then one shape per link.
// This is a geometric preview; MuJoCo compiles its own hull and resolves contacts.
export function buildCollisionPreviews(pack: ReviewPackage, mode: CollisionMode) {
  const proxies: CollisionProxy[] = [],
    warnings: string[] = []
  for (const group of pack.project.groups) {
    const settings = group.physics?.collision
    const linkMode = settings ? (settings.kind === 'convex_hull' ? 'convex_mesh' : 'box') : mode
    const points: Vector3[] = [],
      bounds = new Box3()
    let tooLarge = false
    for (const part of pack.project.parts.filter((p) => p.group === group.name)) {
      const transform = matrix(group.frame).invert().multiply(matrix(part.pose))
      for (const v of pack.geometry[part.id].vertices) {
        const point = new Vector3(...v).applyMatrix4(transform)
        bounds.expandByPoint(point)
        if (linkMode === 'convex_mesh') {
          if (points.length < 100000) points.push(point)
          else tooLarge = true
        }
      }
    }
    if (bounds.isEmpty()) {
      warnings.push(`${group.name}: no assigned geometry to preview.`)
      continue
    }
    if (tooLarge) {
      warnings.push(
        `${group.name}: convex preview omitted above 100,000 vertices; inspect the exported MuJoCo collision geometry.`,
      )
      continue
    }
    const size = bounds.getSize(new Vector3())
    if (Math.min(size.x, size.y, size.z) <= 1e-8) {
      warnings.push(`${group.name}: degenerate geometry; collision preview unavailable.`)
      continue
    }
    try {
      let geometry: BufferGeometry
      if (linkMode === 'box') {
        const centre = bounds.getCenter(new Vector3())
        if (settings?.box_size_m) size.fromArray(settings.box_size_m)
        if (settings?.offset_m) centre.add(new Vector3(...settings.offset_m))
        geometry = new BoxGeometry(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z)
      } else {
        geometry = new ConvexGeometry(points)
        if (settings?.offset_m) geometry.translate(...settings.offset_m)
        if (!geometry.getAttribute('position')?.count) {
          geometry.dispose()
          throw Error('Hull is empty')
        }
      }
      proxies.push({ link: group.name, geometry })
    } catch {
      warnings.push(
        `${group.name}: convex hull preview unavailable; inspect the exported MuJoCo geometry.`,
      )
    }
  }
  return { proxies, warnings }
}
