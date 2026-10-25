import { Matrix4, Quaternion, Vector3 } from 'three'
import type { PhysicsSettings } from './types'
import { createPhysicsDraft, validateAdvancedPhysics } from './advanced-physics'
export type Pose = {
  position_m: [number, number, number]
  quaternion_wxyz: [number, number, number, number]
}
type Scalar = { value: number; source: string; note?: string | null }
export type Part = {
  id: string
  mesh: string
  sha256: string
  pose: Pose
  group: string | null
  source: string
  note: string
  excluded_reason: string | null
}
export type Group = {
  name: string
  frame: Pose
  mass_kg: Scalar
  sliding_friction: Scalar | null
  physics?: PhysicsSettings | null
  reviewed: boolean
  review_note: string
}
export type Joint = {
  name: string
  parent: string
  child: string
  kind: 'fixed' | 'revolute' | 'prismatic'
  origin: Pose
  axis: [number, number, number] | null
  limits_rad: [number, number] | null
  limits_m?: [number, number] | null
  spring?: { stiffness: number; rest: number; source: string; note?: string | null } | null
  coupling?: {
    driver_joint: string
    ratio: number
    offset: number
    source: string
    note?: string | null
  } | null
  source: string
  note: string | null
  damping: Scalar | null
  drive: {
    kp: number
    force_limit_nm?: number | null
    force_limit_n?: number | null
    source: string
    note?: string | null
  } | null
  reviewed: boolean
  review_note: string
}
export type ReviewProject = {
  schema_version: 'assembly-review-1.0'
  name: string
  synthetic: boolean
  root_link: string
  parts: Part[]
  groups: Group[]
  joints: Joint[]
  notes: string[]
  review_snapshot?: string | null
}
export type ReviewPackage = {
  format: 'photo2sim-review-package-1.0'
  project: ReviewProject
  geometry: Record<string, { vertices: number[][]; faces: number[][]; bounds_m: number[][] }>
}
// Omitted and null new extension defaults have identical meaning in historical
// review/mapping snapshots. Preserve every non-default value and unrelated key.
export function normalizeProjectDefaults<T>(project: T): T {
  const data = structuredClone(project) as unknown as Record<string, unknown>
  if (!data || typeof data !== 'object') return project
  for (const key of ['groups', 'links']) {
    if (!Array.isArray(data[key])) continue
    for (const item of data[key])
      if (item && typeof item === 'object' && item.physics == null) delete item.physics
  }
  if (Array.isArray(data.joints))
    for (const joint of data.joints) {
      if (!joint || typeof joint !== 'object') continue
      for (const key of ['limits_m', 'spring', 'coupling'])
        if (joint[key] == null) delete joint[key]
      if (joint.drive && typeof joint.drive === 'object')
        for (const key of ['force_limit_n', 'force_limit_nm'])
          if (joint.drive[key] == null) delete joint.drive[key]
    }
  return data as T
}

export function matrix(p: Pose): Matrix4 {
  if (
    !p ||
    p.position_m.length !== 3 ||
    p.quaternion_wxyz.length !== 4 ||
    ![...p.position_m, ...p.quaternion_wxyz].every(Number.isFinite)
  )
    throw Error('Invalid frame')
  const [w, x, y, z] = p.quaternion_wxyz
  if (Math.abs(w * w + x * x + y * y + z * z - 1) > 1e-6)
    throw Error('Frame quaternion must have unit length')
  return new Matrix4().compose(
    new Vector3(...p.position_m),
    new Quaternion(x, y, z, w),
    new Vector3(1, 1, 1),
  )
}
export function jointLimits(j: Joint): [number, number] | null | undefined {
  return j.kind === 'prismatic' ? j.limits_m : j.limits_rad
}
export function jointValues(p: ReviewProject, q: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = Object.create(null)
  const visiting = new Set<string>()
  const byName = new Map(p.joints.map((j) => [j.name, j]))
  function value(j: Joint): number {
    if (j.name in result) return result[j.name]
    if (visiting.has(j.name)) throw Error('Linked joint motion has a cycle')
    visiting.add(j.name)
    let v = q[j.name] ?? 0
    if (j.coupling) {
      const driver = byName.get(j.coupling.driver_joint)
      if (!driver || driver.kind === 'fixed' || driver.kind !== j.kind)
        throw Error('Linked motion requires an existing driver of the same moving joint type')
      v = j.coupling.offset + j.coupling.ratio * value(driver)
      const mapped = jointLimits(driver)!.map((x) => j.coupling!.offset + j.coupling!.ratio * x)
      const limits = jointLimits(j)!
      if (Math.min(...mapped) < limits[0] - 1e-12 || Math.max(...mapped) > limits[1] + 1e-12)
        throw Error('Linked motion exceeds follower limits')
    }
    if (!Number.isFinite(v)) throw Error('Joint preview values must be finite')
    visiting.delete(j.name)
    return (result[j.name] = v)
  }
  p.joints.forEach(value)
  return result
}
export function frames(p: ReviewProject, q: Record<string, number>): Record<string, Matrix4> {
  const resolved = jointValues(p, q)
  const groups = new Map(p.groups.map((g) => [g.name, g]))
  const result: Record<string, Matrix4> = Object.create(null)
  const parents = new Map<string, Joint>()
  for (const j of p.joints) {
    if (
      parents.has(j.child) ||
      j.child === p.root_link ||
      !groups.has(j.parent) ||
      !groups.has(j.child)
    )
      throw Error('Invalid joint graph')
    parents.set(j.child, j)
  }
  const visiting = new Set<string>()
  function visit(name: string): Matrix4 {
    if (result[name]) return result[name]
    if (visiting.has(name)) throw Error('Joint graph has a cycle')
    visiting.add(name)
    const g = groups.get(name)
    if (!g) throw Error('Missing group')
    if (name === p.root_link) result[name] = matrix(g.frame)
    else {
      const j = parents.get(name)
      if (!j) throw Error('Disconnected group: ' + name)
      const relative = matrix(groups.get(j.parent)!.frame).invert().multiply(matrix(g.frame))
      if (j.kind !== 'fixed') {
        if (
          !j.axis ||
          j.axis.length !== 3 ||
          !j.axis.every(Number.isFinite) ||
          Math.abs(new Vector3(...j.axis).length() - 1) > 1e-6
        )
          throw Error('Joint axis must be unit length')
        const axis = new Vector3(...j.axis)
        relative.multiply(
          j.kind === 'prismatic'
            ? new Matrix4().makeTranslation(
                ...(axis.multiplyScalar(resolved[j.name]).toArray() as [number, number, number]),
              )
            : new Matrix4().makeRotationAxis(axis, resolved[j.name]),
        )
      }
      result[name] = visit(j.parent).clone().multiply(relative)
    }
    visiting.delete(name)
    return result[name]
  }
  p.groups.forEach((g) => visit(g.name))
  return result
}
export function invalidateReview(p: ReviewProject) {
  p.review_snapshot = null
  for (const x of [...p.groups, ...p.joints]) x.reviewed = false
}
export function assignPart(p: ReviewProject, id: string, group: string | null) {
  const part = p.parts.find((x) => x.id === id)
  if (!part) throw Error('Unknown part')
  if (group !== null && !p.groups.some((x) => x.name === group)) throw Error('Unknown group')
  part.group = group
  part.excluded_reason = null
  invalidateReview(p)
}
export function parsePackage(text: string): ReviewPackage {
  const r = JSON.parse(text) as ReviewPackage
  if (
    r.format !== 'photo2sim-review-package-1.0' ||
    r.project?.schema_version !== 'assembly-review-1.0' ||
    !Array.isArray(r.project.parts) ||
    !Array.isArray(r.project.groups) ||
    !Array.isArray(r.project.joints)
  )
    throw Error('Choose a Kamino review package JSON')
  if (r.project.parts.length > 2000 || r.project.groups.length > 128)
    throw Error('Project exceeds review limits')
  validateProject(r.project)
  let triangles = 0
  for (const p of r.project.parts) {
    const g = r.geometry?.[p.id]
    matrix(p.pose)
    if (
      !g ||
      !Array.isArray(g.vertices) ||
      !Array.isArray(g.faces) ||
      !g.vertices.every((v) => v.length === 3 && v.every(Number.isFinite)) ||
      !g.faces.every(
        (f) =>
          f.length === 3 && f.every((i) => Number.isInteger(i) && i >= 0 && i < g.vertices.length),
      )
    )
      throw Error('Invalid preview geometry: ' + p.id)
    triangles += g.faces.length
  }
  if (triangles > 2000000) throw Error('Preview exceeds two million triangles')
  frames(r.project, {})
  if (!snapshotMatches(r.project)) invalidateReview(r.project)
  return r
}

// Source geometry cannot be swapped beneath an already loaded preview.
export function replaceProject(original: ReviewPackage, project: ReviewProject): ReviewPackage {
  const identity = (p: Part) => [p.id, p.mesh, p.sha256, p.source, p.note]
  if (
    JSON.stringify(original.project.parts.map(identity)) !==
    JSON.stringify(project.parts.map(identity))
  )
    throw Error('Source parts are immutable here; repackage changed source geometry or provenance')
  invalidateReview(project)
  return parsePackage(JSON.stringify({ ...original, project }))
}
export function acknowledge(p: ReviewProject, item: Group | Joint) {
  if (!snapshotMatches(p)) invalidateReview(p)
  if (!item.review_note.trim()) throw Error('A review note is required')
  item.reviewed = true
  p.review_snapshot = JSON.stringify({ ...p, review_snapshot: null })
}
function validateProject(p: ReviewProject) {
  const require = (ok: unknown, message: string) => {
    if (!ok) throw Error(message)
  }
  const name = (v: string) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v)
  const source = (v: string) =>
    require(['measured', 'user_supplied', 'sourced', 'estimated'].includes(
      v,
    ), 'Invalid provenance source')
  const note = (v: unknown) => require(v == null || typeof v === 'string', 'Invalid note')
  const scalar = (v: Scalar, positive = false) => {
    require(v &&
      Number.isFinite(v.value) &&
      (positive ? v.value > 0 : v.value >= 0), 'Invalid physical property')
    source(v.source)
    note(v.note)
  }
  const review = (v: Group | Joint) => {
    require(typeof v.reviewed === 'boolean' &&
      typeof v.review_note === 'string', 'Invalid review acknowledgement')
  }
  require(name(p.name) &&
    name(p.root_link) &&
    typeof p.synthetic === 'boolean', 'Invalid project identity')
  require(Array.isArray(p.notes) &&
    p.notes.every((n) => typeof n === 'string'), 'Invalid project notes')
  require(p.review_snapshot == null ||
    typeof p.review_snapshot === 'string', 'Invalid review snapshot')
  require(p.parts.length > 0 &&
    p.groups.length > 0 &&
    p.joints.length <= 127, 'Invalid assembly size')
  for (const names of [
    p.parts.map((x) => x.id),
    p.groups.map((x) => x.name),
    p.joints.map((x) => x.name),
  ])
    require(names.every(name) &&
      new Set(names).size === names.length, 'Invalid or duplicate identifiers')
  const names = new Set(p.groups.map((x) => x.name))
  require(names.has(p.root_link), 'Missing root group')
  for (const part of p.parts) {
    source(part.source)
    require(typeof part.note === 'string', 'Part provenance note required')
    require(typeof part.mesh === 'string' &&
      part.mesh.length &&
      !/[\\:\x00]/.test(part.mesh) &&
      part.mesh.split('/').every((s) => s && s !== '.' && s !== '..'), 'Invalid source path')
    require(/^[0-9a-f]{64}$/.test(part.sha256), 'Invalid source hash')
    require(part.group == null || names.has(part.group), 'Unknown part group')
    note(part.excluded_reason)
    require(!(part.group && part.excluded_reason), 'Assigned part cannot be excluded')
  }
  for (const g of p.groups) {
    matrix(g.frame)
    scalar(g.mass_kg, true)
    if (g.sliding_friction != null) scalar(g.sliding_friction)
    if (g.physics != null) {
      const collision = g.physics.collision
      require(collision?.kind !== 'convex_hull' ||
        collision.box_size_m == null, 'Box size only applies to box collision')
      const inertia = g.physics.inertia
      if (inertia?.mode === 'automatic')
        require(inertia.diagonal_kg_m2 == null &&
          (inertia.center_of_mass_m ?? [0, 0, 0]).every(
            (v) => v === 0,
          ), 'Automatic inertia uses the collision centre; choose manual for custom COM')
      const checked = validateAdvancedPhysics(createPhysicsDraft(g.physics))
      require(checked.ok, checked.ok ? '' : checked.error)
    }
    review(g)
  }
  for (const j of p.joints) {
    source(j.source)
    note(j.note)
    review(j)
    matrix(j.origin)
    require(j.origin.position_m.every((v) => v === 0) &&
      j.origin.quaternion_wxyz.every(
        (v, i) => v === (i === 0 ? 1 : 0),
      ), 'Joint origin is derived from group frames')
    require(['fixed', 'revolute', 'prismatic'].includes(j.kind), 'Unsupported joint kind')
    if (j.kind === 'fixed')
      require([j.axis, j.limits_rad, j.limits_m, j.damping, j.drive, j.spring, j.coupling].every(
        (v) => v == null,
      ), 'Fixed joint has hinge parameters')
    else {
      require(j.axis &&
        j.axis.length === 3 &&
        j.axis.every(Number.isFinite) &&
        Math.abs(j.axis.reduce((s, v) => s + v * v, 0) - 1) <= 1e-6, 'Invalid joint axis')
      const limits = jointLimits(j)
      require(limits &&
        limits.length === 2 &&
        limits.every(Number.isFinite) &&
        limits[0] < limits[1] &&
        limits[0] <= 0 &&
        limits[1] >= 0, 'Invalid joint limits')
      require(j.kind === 'prismatic'
        ? j.limits_rad == null
        : j.limits_m == null, 'Joint limits use incorrect units')
      require(j.damping, 'Moving joint requires damping')
      scalar(j.damping!)
      if (j.coupling) {
        require(j.drive == null, 'Linked followers cannot have a competing position drive')
        require(name(j.coupling.driver_joint) &&
          Number.isFinite(j.coupling.ratio) &&
          Number.isFinite(j.coupling.offset), 'Invalid linked joint motion')
        source(j.coupling.source)
        note(j.coupling.note)
      } else {
        require(j.drive, 'Independent moving joint requires a drive')
        const force = j.kind === 'prismatic' ? j.drive!.force_limit_n : j.drive!.force_limit_nm
        require(Number.isFinite(j.drive!.kp) &&
          j.drive!.kp > 0 &&
          typeof force === 'number' &&
          Number.isFinite(force) &&
          force > 0, 'Invalid position drive')
        require(j.kind === 'prismatic'
          ? j.drive!.force_limit_nm == null
          : j.drive!.force_limit_n == null, 'Slider force limits use N; hinge torque limits use Nm')
        source(j.drive!.source)
        note(j.drive!.note)
      }
      if (j.spring) {
        require(Number.isFinite(j.spring.stiffness) &&
          j.spring.stiffness >= 0 &&
          Number.isFinite(j.spring.rest) &&
          j.spring.rest >= limits![0] &&
          j.spring.rest <= limits![1], 'Invalid spring stiffness or rest')
        source(j.spring.source)
        note(j.spring.note)
      }
    }
  }
}

function snapshotMatches(p: ReviewProject): boolean {
  if (!p.review_snapshot) return false
  const content = (project: ReviewProject) => {
    const data = {
      ...project,
      review_snapshot: null,
      groups: project.groups.map((g) => ({ ...g, reviewed: false, review_note: '' })),
      joints: project.joints.map((j) => ({ ...j, reviewed: false, review_note: '' })),
    }
    const sorted = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(sorted)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, sorted(x)]),
            )
          : v
    return JSON.stringify(sorted(normalizeProjectDefaults(data)))
  }
  try {
    return content(p) === content(JSON.parse(p.review_snapshot))
  } catch {
    return false
  }
}
