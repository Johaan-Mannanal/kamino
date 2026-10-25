import './advanced-physics.css'
import type { PhysicsSettings, Source, Vec3 } from './types'

export type PhysicsDraft = {
  values: Record<string, string>
  original: PhysicsSettings | null
  originalPlacement: Vec3 | null
}
type Options = { placement?: boolean }
type Result =
  | { ok: true; physics: PhysicsSettings | null; placement_m?: Vec3 | null }
  | { ok: false; error: string }
const clone = <T>(value: T): T => structuredClone(value)
const axes = ['x', 'y', 'z'] as const
const vector = (
  values: Record<string, string>,
  prefix: string,
  input?: Vec3 | null,
  fallback = '',
) => {
  axes.forEach((axis, index) => {
    values[`${prefix}_${axis}`] = input ? String(input[index]) : fallback
  })
}

export function createPhysicsDraft(
  physics?: PhysicsSettings | null,
  placement?: Vec3 | null,
): PhysicsDraft {
  const values: Record<string, string> = {
    collision: physics?.collision?.kind ?? 'default',
    torsional: physics?.torsional_friction ? String(physics.torsional_friction.value) : '',
    torsional_source: physics?.torsional_friction?.source ?? 'user_supplied',
    rolling: physics?.rolling_friction ? String(physics.rolling_friction.value) : '',
    rolling_source: physics?.rolling_friction?.source ?? 'user_supplied',
    inertia: physics?.inertia?.mode ?? 'automatic',
    inertia_source: physics?.inertia?.source ?? (physics?.inertia ? 'estimated' : 'user_supplied'),
    contact: physics?.contact?.compliance ?? 'default',
    response: physics?.contact?.response ?? 'low',
    contact_source: physics?.contact?.source ?? (physics?.contact ? 'estimated' : 'user_supplied'),
    placement: placement ? 'manual' : 'default',
  }
  vector(values, 'box', physics?.collision?.box_size_m)
  vector(values, 'offset', physics?.collision?.offset_m, '0')
  vector(values, 'com', physics?.inertia?.center_of_mass_m, '0')
  vector(values, 'diagonal', physics?.inertia?.diagonal_kg_m2)
  vector(values, 'placement', placement, '0')
  return { values, original: clone(physics ?? null), originalPlacement: clone(placement ?? null) }
}

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const select = (draft: PhysicsDraft, key: string, label: string, options: [string, string][]) =>
  `<label>${label}<select data-physics="${key}">${options.map(([value, text]) => `<option value="${value}"${draft.values[key] === value ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`
const number = (draft: PhysicsDraft, key: string, label: string, positive = false) =>
  `<label>${label}<input data-physics="${key}" type="number" step="any"${positive ? ' min="0"' : ''} value="${escape(draft.values[key] ?? '')}"></label>`
const source = (draft: PhysicsDraft, key: string) =>
  select(draft, `${key}_source`, 'Source', [
    ['user_supplied', 'User supplied'],
    ['estimated', 'Estimated'],
    ['measured', 'Measured'],
    ['sourced', 'Sourced'],
  ])
const group = (draft: PhysicsDraft, prefix: string, label: string, positive = false) =>
  `<fieldset class="advanced-physics-vector"><legend>${label}</legend><div>${axes.map((axis) => number(draft, `${prefix}_${axis}`, prefix === 'diagonal' ? `I${axis}${axis}` : axis.toUpperCase(), positive)).join('')}</div></fieldset>`
const state = (shown: boolean) => (shown ? '' : ' hidden disabled')

export function advancedPhysicsControls(draft: PhysicsDraft, options: Options = {}): string {
  return `<details class="advanced-physics"><summary>Advanced physics</summary><div class="advanced-physics-content">
    <p>Optional settings in SI units. Defaults retain the existing collision and solver assumptions.</p>
    ${select(draft, 'collision', 'Collision shape', [
      ['default', 'Default bounding box'],
      ['box', 'Box'],
      ['convex_hull', 'Convex hull'],
    ])}
    <fieldset data-physics-section="collision"${state(draft.values.collision !== 'default')}>
      <fieldset data-physics-section="box"${state(draft.values.collision === 'box')}>${group(draft, 'box', 'Box full size (m); leave all blank to use mesh bounds', true)}</fieldset>
      ${group(draft, 'offset', 'Collision offset from body centre (m)')}
    </fieldset>
    <div class="advanced-physics-pair"><fieldset><legend>Twist friction (m)</legend>${number(draft, 'torsional', 'Coefficient; blank keeps default', true)}${source(draft, 'torsional')}</fieldset>
    <fieldset><legend>Rolling friction (m)</legend>${number(draft, 'rolling', 'Coefficient; blank keeps default', true)}${source(draft, 'rolling')}</fieldset></div>
    ${select(draft, 'inertia', 'Inertia', [
      ['automatic', 'Automatic box approximation'],
      ['manual', 'Manual COM and diagonal inertia'],
    ])}
    <fieldset data-physics-section="inertia"${state(draft.values.inertia === 'manual')}>
      ${group(draft, 'com', 'Centre of mass in local body frame (m)')}
      ${group(draft, 'diagonal', 'Ixx / Iyy / Izz (kg·m²)', true)}${source(draft, 'inertia')}
      <p>Positive diagonal moments must satisfy all triangle inequalities. Switching to automatic discards manual COM and inertia.</p>
    </fieldset>
    ${select(draft, 'contact', 'Contact compliance', [
      ['default', 'Default solver settings'],
      ['firm', 'Firm'],
      ['soft', 'Soft'],
    ])}
    <fieldset data-physics-section="contact"${state(draft.values.contact !== 'default')}>
      ${select(draft, 'response', 'Contact response', [
        ['low', 'Low'],
        ['medium', 'Medium'],
        ['high', 'High'],
      ])}${source(draft, 'contact')}
      <p>These presets adjust solver response; they are not a restitution coefficient or measured material properties.</p>
    </fieldset>
    ${
      options.placement
        ? `${select(draft, 'placement', 'Initial body placement', [
            ['default', 'Default placement'],
            ['manual', 'Absolute body centre'],
          ])}<fieldset data-physics-section="placement"${state(draft.values.placement === 'manual')}>${group(draft, 'placement', 'Body centre in world coordinates (m)')}<p>This is the body centre, not the bottom of the collision shape.</p></fieldset>`
        : ''
    }
  </div></details>`
}

/** Restore controls without replacing the details element or changing its open state. */
export function writeAdvancedPhysics(root: ParentNode, draft: PhysicsDraft) {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-physics]').forEach((input) => {
    input.value = draft.values[input.dataset.physics!] ?? ''
  })
  const visible: Record<string, boolean> = {
    collision: draft.values.collision !== 'default',
    box: draft.values.collision === 'box',
    inertia: draft.values.inertia === 'manual',
    contact: draft.values.contact !== 'default',
    placement: draft.values.placement === 'manual',
  }
  root.querySelectorAll<HTMLFieldSetElement>('[data-physics-section]').forEach((section) => {
    section.hidden = !visible[section.dataset.physicsSection!]
    section.disabled = section.hidden
  })
}

export function readAdvancedPhysics(root: ParentNode, previous: PhysicsDraft): PhysicsDraft {
  const next = clone(previous)
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-physics]').forEach((input) => {
    next.values[input.dataset.physics!] = input.value
  })
  if (previous.values.inertia === 'manual' && next.values.inertia === 'automatic') {
    vector(next.values, 'com', null, '0')
    vector(next.values, 'diagonal', null)
    next.values.inertia_source = 'user_supplied'
  }
  writeAdvancedPhysics(root, next)
  return next
}

export function validateAdvancedPhysics(draft: PhysicsDraft, options: Options = {}): Result {
  const value = draft.values
  const baseline = createPhysicsDraft(draft.original, draft.originalPlacement).values
  const unchanged = (keys: string[]) => keys.every((key) => value[key] === baseline[key])
  const vectorKeys = (prefix: string) => axes.map((axis) => `${prefix}_${axis}`)
  try {
    const enumValue = <T extends string>(key: string, allowed: readonly T[]): T => {
      if (!allowed.includes(value[key] as T))
        throw new Error(`Choose a valid ${key.replaceAll('_', ' ')}.`)
      return value[key] as T
    }
    const numeric = (key: string, label: string, positive = false): number => {
      const raw = value[key]?.trim()
      const result = Number(raw)
      if (!raw || !Number.isFinite(result) || (positive && result <= 0))
        throw new Error(`${label} must be ${positive ? 'positive and ' : ''}finite.`)
      return result
    }
    const triple = (prefix: string, label: string, positive = false): Vec3 =>
      axes.map((axis) =>
        numeric(`${prefix}_${axis}`, `${label} ${axis.toUpperCase()}`, positive),
      ) as Vec3
    const provenance = (key: string): Source =>
      enumValue(`${key}_source`, ['measured', 'sourced', 'estimated', 'user_supplied'] as const)
    const physics: PhysicsSettings = {}
    const collision = enumValue('collision', ['default', 'box', 'convex_hull'] as const)
    if (collision !== 'default') {
      const boxKeys = vectorKeys('box')
      const hasSize = collision === 'box' && boxKeys.some((key) => value[key]?.trim())
      physics.collision = {
        kind: collision,
        box_size_m: hasSize ? triple('box', 'Box full size', true) : null,
        offset_m: triple('offset', 'Collision offset'),
      }
      if (
        unchanged(['collision', ...boxKeys, ...vectorKeys('offset')]) &&
        draft.original?.collision
      )
        physics.collision = clone(draft.original.collision)
    }
    for (const [key, property] of [
      ['torsional', 'torsional_friction'],
      ['rolling', 'rolling_friction'],
    ] as const) {
      if (value[key]?.trim()) {
        const coefficient = numeric(key, `${key === 'torsional' ? 'Twist' : 'Rolling'} friction`)
        if (coefficient < 0) throw new Error('Twist and rolling friction must be zero or greater.')
        physics[property] = { value: coefficient, source: provenance(key) }
        if (unchanged([key, `${key}_source`]) && draft.original?.[property])
          physics[property] = clone(draft.original[property])
      }
    }
    const inertia = enumValue('inertia', ['automatic', 'manual'] as const)
    if (inertia === 'manual') {
      const diagonal = triple('diagonal', 'Inertia', true)
      if (
        diagonal.some(
          (moment, index) =>
            moment >
            diagonal.reduce(
              (sum, other, otherIndex) => sum + (otherIndex === index ? 0 : other),
              0,
            ),
        )
      )
        throw new Error('Inertia must satisfy Ixx ≤ Iyy + Izz and all triangle inequalities.')
      physics.inertia = {
        mode: 'manual',
        center_of_mass_m: triple('com', 'Centre of mass'),
        diagonal_kg_m2: diagonal,
        source: provenance('inertia'),
      }
      if (
        unchanged(['inertia', 'inertia_source', ...vectorKeys('com'), ...vectorKeys('diagonal')]) &&
        draft.original?.inertia
      )
        physics.inertia = clone(draft.original.inertia)
    } else if (draft.original?.inertia?.mode === 'automatic' && unchanged(['inertia'])) {
      physics.inertia = clone(draft.original.inertia)
    }
    const contact = enumValue('contact', ['default', 'firm', 'soft'] as const)
    if (contact !== 'default') {
      physics.contact = {
        compliance: contact,
        response: enumValue('response', ['low', 'medium', 'high'] as const),
        source: provenance('contact'),
      }
      if (unchanged(['contact', 'response', 'contact_source']) && draft.original?.contact)
        physics.contact = clone(draft.original.contact)
    }
    const result: Result = { ok: true, physics: Object.keys(physics).length ? physics : null }
    if (options.placement)
      result.placement_m =
        enumValue('placement', ['default', 'manual'] as const) === 'manual'
          ? triple('placement', 'World body centre')
          : null
    return result
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Review advanced physics values.',
    }
  }
}
