import { describe, expect, it } from 'vitest'
import { applySuggestionToDraft, makeProperties } from './properties'

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

describe('Gemini suggestion drafts', () => {
  it('only changes a draft when the operator explicitly applies a suggestion', () => {
    const original = { x: '41', dimensions_source: 'measured', mass: '61' }
    const result = applySuggestionToDraft(original, {
      dimensions_m: { x: 0.042, y: 0.027, z: 0.058, source: 'estimated', note: 'AI suggestion' },
      mass_kg: { value: 0.058, source: 'estimated', note: 'AI suggestion' },
      sliding_friction: null,
      clarifying_questions: ['Confirm the pins.'],
      notes: ['Unverified.'],
    })
    expect(original).toEqual({ x: '41', dimensions_source: 'measured', mass: '61' })
    expect(result).toMatchObject({
      x: '42',
      y: '27',
      z: '58',
      dimensions_source: 'estimated',
      mass: '58',
      mass_source: 'estimated',
      friction: '',
    })
  })
})
