import { describe, expect, it } from 'vitest'
import { suggestionDraft } from './suggestion-values'
import { makeProperties } from './properties'
import type { Suggestions } from './types'

const suggestions: Suggestions = {
  dimensions_m: { x: 0.04, y: 0.05, z: 0.06, source: 'estimated', note: 'Unverified estimate' },
  mass_kg: { value: 0.08, source: 'estimated' },
  sliding_friction: null,
  clarifying_questions: [],
  notes: [],
}
describe('explicit estimate application', () => {
  it('converts only the selected group and never confirms or changes its provenance', () => {
    expect(suggestionDraft(suggestions, 'dimensions_m')).toEqual({
      x: '40',
      y: '50',
      z: '60',
      dimensions_source: 'estimated',
      dimensions_note: 'Unverified estimate',
    })
    expect(suggestionDraft(suggestions, 'mass_kg')).toMatchObject({
      mass: '80',
      mass_source: 'estimated',
    })
    expect(suggestionDraft(suggestions, 'sliding_friction')).toEqual({})
    expect(suggestions.mass_kg!.value).toBe(0.08)
  })
  it('round-trips estimated values to the shared property payload', () => {
    const fields = {
      ...suggestionDraft(suggestions, 'dimensions_m'),
      ...suggestionDraft(suggestions, 'mass_kg'),
      friction: '',
    }
    expect(makeProperties(fields)).toMatchObject({
      dimensions_m: { x: 0.04, y: 0.05, z: 0.06, source: 'estimated' },
      mass_kg: { value: 0.08, source: 'estimated' },
      sliding_friction: null,
    })
  })
  it('rejects malformed estimates and forces estimated provenance even for a bad source label', () => {
    expect(() =>
      suggestionDraft(
        { ...suggestions, mass_kg: { value: Infinity, source: 'estimated' } },
        'mass_kg',
      ),
    ).toThrow()
    expect(
      suggestionDraft({ ...suggestions, mass_kg: { value: 0.08, source: 'measured' } }, 'mass_kg')
        .mass_source,
    ).toBe('estimated')
  })
})
