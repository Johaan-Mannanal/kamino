// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  advancedPhysicsControls,
  createPhysicsDraft,
  readAdvancedPhysics,
  validateAdvancedPhysics,
  writeAdvancedPhysics,
} from './advanced-physics'
import type { PhysicsSettings } from './types'
const mount = (physics?: PhysicsSettings) => {
  const draft = createPhysicsDraft(physics),
    root = document.createElement('form')
  root.innerHTML = advancedPhysicsControls(draft, { placement: true })
  const set = (key: string, value: string) => {
    root.querySelector<HTMLInputElement>(`[data-physics="${key}"]`)!.value = value
  }
  return { draft, root, set }
}
describe('advanced physics panel', () => {
  it('is collapsed and retains null defaults without writing placement unless requested', () => {
    const { draft, root } = mount()
    expect(root.querySelector('details')!.open).toBe(false)
    expect(root.querySelector('[name]')).toBeNull()
    expect(validateAdvancedPhysics(readAdvancedPhysics(root, draft))).toEqual({
      ok: true,
      physics: null,
    })
    expect(validateAdvancedPhysics(draft, { placement: true })).toEqual({
      ok: true,
      physics: null,
      placement_m: null,
    })
  })
  it('round-trips historical manual data and provenance notes exactly', () => {
    const saved: PhysicsSettings = {
      collision: { kind: 'box', box_size_m: [0.2, 0.3, 0.4], offset_m: [0.01, -0.03, 0] },
      torsional_friction: { value: 0, source: 'measured', note: 'Measured fixture' },
      rolling_friction: { value: 0.003, source: 'sourced', note: 'Manufacturer' },
      inertia: {
        mode: 'manual',
        center_of_mass_m: [0.01, 0.02, 0],
        diagonal_kg_m2: [0.1, 0.2, 0.3],
        source: 'measured',
        note: 'Pendulum',
      },
      contact: {
        compliance: 'soft',
        response: 'medium',
        source: 'estimated',
        note: 'Review preset',
      },
    }
    const { draft, root } = mount(saved)
    expect(validateAdvancedPhysics(readAdvancedPhysics(root, draft))).toEqual({
      ok: true,
      physics: saved,
    })
    expect(root.textContent).toContain('not a restitution coefficient')
  })
  it('parses explicit SI values, source and world body centre', () => {
    const { draft, root, set } = mount()
    set('collision', 'convex_hull')
    set('offset_x', '-0.2')
    set('torsional', '0.003')
    set('rolling', '0')
    set('rolling_source', 'estimated')
    set('contact', 'firm')
    set('response', 'high')
    set('placement', 'manual')
    set('placement_z', '0.5')
    expect(validateAdvancedPhysics(readAdvancedPhysics(root, draft), { placement: true })).toEqual({
      ok: true,
      physics: {
        collision: { kind: 'convex_hull', box_size_m: null, offset_m: [-0.2, 0, 0] },
        torsional_friction: { value: 0.003, source: 'user_supplied' },
        rolling_friction: { value: 0, source: 'estimated' },
        contact: { compliance: 'firm', response: 'high', source: 'user_supplied' },
      },
      placement_m: [0, 0, 0.5],
    })
    expect(root.querySelector<HTMLFieldSetElement>('[data-physics-section="box"]')!.disabled).toBe(
      true,
    )
    expect(
      root.querySelector<HTMLFieldSetElement>('[data-physics-section="collision"]')!.hidden,
    ).toBe(false)
  })
  it('rejects partial/nonpositive box size, negative friction, nonfinite vectors and invalid inertia', () => {
    const invalids = [
      { collision: 'box', box_x: '0.2' },
      { collision: 'box', box_x: '0', box_y: '1', box_z: '1' },
      { torsional: '-1' },
      { rolling: 'Infinity' },
      { collision: 'convex_hull', offset_x: 'NaN' },
      { inertia: 'manual', diagonal_x: '1', diagonal_y: '1', diagonal_z: '3' },
      { inertia: 'manual', diagonal_x: '0', diagonal_y: '1', diagonal_z: '1' },
      { inertia: 'manual', diagonal_x: '1', diagonal_y: '1', diagonal_z: '1', com_z: '' },
      { placement: 'manual', placement_y: '' },
      { contact: 'firm', response: 'restitution' },
    ]
    for (const values of invalids) {
      const draft = createPhysicsDraft()
      Object.assign(draft.values, values)
      expect(validateAdvancedPhysics(draft, { placement: true }).ok, JSON.stringify(values)).toBe(
        false,
      )
    }
  })
  it('drops stale notes after edits and discards manual COM/inertia on automatic switch', () => {
    const { draft, root, set } = mount({
      inertia: {
        mode: 'manual',
        center_of_mass_m: [1, 2, 3],
        diagonal_kg_m2: [1, 1, 1],
        source: 'user_supplied',
        note: 'Old',
      },
      torsional_friction: { value: 1, source: 'estimated', note: 'Old friction' },
    })
    set('torsional', '2')
    set('inertia', 'automatic')
    const next = readAdvancedPhysics(root, draft)
    expect(next.values.com_x).toBe('0')
    expect(next.values.diagonal_x).toBe('')
    expect(validateAdvancedPhysics(next)).toEqual({
      ok: true,
      physics: { torsional_friction: { value: 2, source: 'estimated' } },
    })
    set('inertia', 'manual')
    expect(validateAdvancedPhysics(readAdvancedPhysics(root, next)).ok).toBe(false)
  })
  it('restores visible controls and disabled state while preserving details openness', () => {
    const { draft, root, set } = mount()
    root.querySelector('details')!.open = true
    set('inertia', 'manual')
    set('collision', 'box')
    set('placement', 'manual')
    readAdvancedPhysics(root, draft)
    expect(
      root.querySelector<HTMLFieldSetElement>('[data-physics-section="inertia"]')!.disabled,
    ).toBe(false)
    writeAdvancedPhysics(root, draft)
    expect(root.querySelector<HTMLSelectElement>('[data-physics="inertia"]')!.value).toBe(
      'automatic',
    )
    expect(
      root.querySelector<HTMLFieldSetElement>('[data-physics-section="inertia"]')!.disabled,
    ).toBe(true)
    expect(root.querySelector('details')!.open).toBe(true)
  })
  it('ignores inactive stale values and preserves explicit historical automatic provenance', () => {
    const draft = createPhysicsDraft({
      inertia: { mode: 'automatic', source: 'sourced', note: 'Legacy model' },
    })
    draft.values.box_x = '-5'
    draft.values.diagonal_x = 'NaN'
    expect(validateAdvancedPhysics(draft)).toEqual({
      ok: true,
      physics: { inertia: { mode: 'automatic', source: 'sourced', note: 'Legacy model' } },
    })
  })
})
