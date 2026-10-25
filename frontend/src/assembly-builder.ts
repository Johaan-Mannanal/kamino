import { frames, invalidateReview, type Joint, type ReviewProject } from './assembly-review'
const pose = () => ({
  position_m: [0, 0, 0] as [number, number, number],
  quaternion_wxyz: [1, 0, 0, 0] as [number, number, number, number],
})
function name(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value))
    throw Error(
      'Use a name starting with a letter, then letters, digits, underscores or hyphens (up to 64 characters).',
    )
}
export function changeJointKind(joint: Joint, kind: 'fixed' | 'revolute' | 'prismatic'): Joint {
  const next = structuredClone(joint)
  next.kind = kind
  next.reviewed = false
  if (kind === 'fixed') {
    next.axis = null
    next.limits_rad = null
    next.limits_m = null
    next.spring = null
    next.coupling = null
    next.damping = null
    next.drive = null
  } else {
    next.axis ??= [0, 0, 1]
    if (kind === 'prismatic') {
      next.limits_m ??= [-0.05, 0.05]
      next.limits_rad = null
    } else {
      next.limits_rad ??= [-0.8, 0.8]
      next.limits_m = null
    }
    if (joint.kind !== kind) {
      next.spring = null
      next.coupling = null
      next.drive = null
      next.damping = null
    }
    next.damping ??= {
      value: kind === 'prismatic' ? 1.5 : 0.2,
      source: 'estimated',
      note: 'Starting assumption; review before export',
    }
    if (!next.coupling)
      next.drive ??= {
        kp: 5,
        ...(kind === 'prismatic' ? { force_limit_n: 2 } : { force_limit_nm: 2 }),
        source: 'estimated',
        note: 'Starting assumption; not calibrated to hardware',
      }
  }
  return next
}
export function addConnectedLink(
  project: ReviewProject,
  link: string,
  parent: string,
  joint: string,
  kind: 'fixed' | 'revolute' | 'prismatic',
): ReviewProject {
  name(link)
  name(joint)
  if (project.groups.length >= 128) throw Error('Maximum 128 links')
  if (project.groups.some((g) => g.name === link) || project.joints.some((j) => j.name === joint))
    throw Error('Link and joint names must be unique within their lists')
  const parentGroup = project.groups.find((g) => g.name === parent)
  if (!parentGroup) throw Error('Choose an existing parent link')
  const next = structuredClone(project)
  next.groups.push({
    name: link,
    frame: structuredClone(parentGroup.frame),
    mass_kg: {
      value: 0.1,
      source: 'estimated',
      note: 'Starting assumption; review or replace before export',
    },
    sliding_friction: null,
    reviewed: false,
    review_note: '',
  })
  next.joints.push(
    changeJointKind(
      {
        name: joint,
        parent,
        child: link,
        kind: 'fixed',
        origin: pose(),
        axis: null,
        limits_rad: null,
        source: 'user_supplied',
        note: 'Connection chosen in the guided editor; axis and limits require review',
        damping: null,
        drive: null,
        reviewed: false,
        review_note: '',
      },
      kind,
    ),
  )
  invalidateReview(next)
  frames(next, {})
  return next
}
export function renameLink(
  project: ReviewProject,
  oldName: string,
  newName: string,
): ReviewProject {
  name(newName)
  if (!project.groups.some((g) => g.name === oldName)) throw Error('Unknown link')
  if (oldName !== newName && project.groups.some((g) => g.name === newName))
    throw Error('Link name already exists')
  const next = structuredClone(project)
  for (const g of next.groups) if (g.name === oldName) g.name = newName
  for (const p of next.parts) if (p.group === oldName) p.group = newName
  for (const j of next.joints) {
    if (j.parent === oldName) j.parent = newName
    if (j.child === oldName) j.child = newName
  }
  if (next.root_link === oldName) next.root_link = newName
  invalidateReview(next)
  frames(next, {})
  return next
}
