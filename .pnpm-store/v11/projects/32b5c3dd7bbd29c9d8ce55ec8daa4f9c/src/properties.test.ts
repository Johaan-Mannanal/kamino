import { describe, expect, it } from 'vitest'
import { makeProperties } from './properties'

const values = {
  x: '40',
  y: '50',
  z: '60',
  mass: '80',
  dimensions_source: 'measured',
  mass_source: 'user_supplied',
  friction: '',
  friction_source: 'estimated',
}
describe('property conversion', () => {
  it('converts millimetres and grams and leaves unknown friction null', () => {
    expect(makeProperties(values)).toMatchObject({
      dimensions_m: { x: 0.04, y: 0.05, z: 0.06, source: 'measured' },
      mass_kg: { value: 0.08, source: 'user_supplied' },
      sliding_friction: null,
    })
  })
  it('rejects invalid physical inputs', () => {
    expect(() => makeProperties({ ...values, x: '0' })).toThrow()
    expect(() => makeProperties({ ...values, friction: '-0.1' })).toThrow()
  })
})
