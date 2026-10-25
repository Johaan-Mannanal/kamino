import type { Suggestions } from './types'

export type SuggestedProperty = 'dimensions_m' | 'mass_kg' | 'sliding_friction'
export function suggestionDraft(
  suggestions: Suggestions,
  key: SuggestedProperty,
): Record<string, string> {
  const property = suggestions[key]
  if (property === null) return {}
  const note = property.note || 'AI suggestion — unverified'
  if (key === 'dimensions_m') {
    const dimensions = suggestions.dimensions_m!
    if (
      ![dimensions.x, dimensions.y, dimensions.z].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    )
      throw new Error('The dimension estimate is invalid. Enter measurements manually.')
    return {
      x: String(dimensions.x * 1000),
      y: String(dimensions.y * 1000),
      z: String(dimensions.z * 1000),
      dimensions_source: 'estimated',
      dimensions_note: note,
    }
  }
  const scalar = key === 'mass_kg' ? suggestions.mass_kg! : suggestions.sliding_friction!
  if (
    !Number.isFinite(scalar.value) ||
    scalar.value < 0 ||
    (key === 'mass_kg' && scalar.value === 0)
  )
    throw new Error('The property estimate is invalid. Enter it manually.')
  return key === 'mass_kg'
    ? { mass: String(scalar.value * 1000), mass_source: 'estimated', mass_note: note }
    : { friction: String(scalar.value), friction_source: 'estimated', friction_note: note }
}
