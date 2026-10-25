import { describe, expect, it } from 'vitest'
import { makeSizing, sizingMode } from './sizing'

const orientation = { x_deg: 90, y_deg: 0, z_deg: 0 }
const values = {
  sizing_mode: 'uniform',
  reference_axis: 'z',
  reference_length: '60',
  reference_unit: 'mm',
  reference_source: 'user_supplied',
  reference_description: 'Full object including pins',
  reference_full_extent: 'on',
}
describe('explicit sizing correspondence', () => {
  it('retains reference units, source, extent and reviewed orientation', () => {
    expect(makeSizing(values, orientation)).toEqual({
      mode: 'uniform',
      reviewed_orientation: orientation,
      reference: {
        axis: 'z',
        length: 60,
        unit: 'mm',
        source: 'user_supplied',
        correspondence: 'full_mesh_extent',
        description: 'Full object including pins',
      },
    })
  })
  it('does not assume a body-only length corresponds to the full mesh', () => {
    expect(() => makeSizing({ ...values, reference_full_extent: '' }, orientation)).toThrow(/full/i)
    expect(() => makeSizing({ ...values, reference_axis: '' }, orientation)).toThrow(/axis|extent/i)
    expect(() => makeSizing({ ...values, reference_length: '0' }, orientation)).toThrow(/positive/i)
  })
  it('requires advanced acknowledgement and labels old jobs as legacy', () => {
    expect(() => makeSizing({ sizing_mode: 'independent_axes' }, orientation)).toThrow(
      /acknowledge/i,
    )
    expect(
      makeSizing({ sizing_mode: 'independent_axes', acknowledge_distortion: 'on' }, orientation),
    ).toEqual({
      mode: 'independent_axes',
      reviewed_orientation: orientation,
      acknowledge_distortion: true,
    })
    expect(sizingMode(null)).toBe('uniform')
    expect(
      sizingMode({
        dimensions_m: { x: 0.04, y: 0.05, z: 0.06, source: 'estimated' },
        mass_kg: { value: 0.05, source: 'estimated' },
        sliding_friction: null,
      }),
    ).toBe('legacy_independent_axes')
  })
})
