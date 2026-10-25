import type { Properties, Source, Suggestions } from './types'

export function applySuggestionToDraft(draft: Record<string, string>, suggestion: Suggestions) {
  const next = { ...draft }
  const dimensions = suggestion.dimensions_m
  if (dimensions) {
    next.x = String(dimensions.x * 1000)
    next.y = String(dimensions.y * 1000)
    next.z = String(dimensions.z * 1000)
    next.dimensions_source = 'estimated'
    next.dimensions_note = dimensions.note || 'AI suggestion — unverified'
  }
  if (suggestion.mass_kg) {
    next.mass = String(suggestion.mass_kg.value * 1000)
    next.mass_source = 'estimated'
    next.mass_note = suggestion.mass_kg.note || 'AI suggestion — unverified'
  }
  const friction = suggestion.sliding_friction
  next.friction = friction ? String(friction.value) : ''
  next.friction_source = 'estimated'
  next.friction_note = friction?.note || (friction ? 'AI suggestion — unverified' : '')
  return next
}

export function makeProperties(values: Record<string, string>): Properties {
  const positive = (key: string) => {
    const raw = values[key]?.trim()
    const number = Number(raw)
    if (!raw || !Number.isFinite(number) || number <= 0)
      throw new Error(`${key} must be a positive number.`)
    return number
  }
  const source = (key: string): Source => {
    const value = values[key]
    if (!['measured', 'user_supplied', 'sourced', 'estimated'].includes(value))
      throw new Error(`Choose a source for ${key}.`)
    return value as Source
  }
  const friction = values.friction?.trim()
  const coefficient = friction ? Number(friction) : null
  if (coefficient !== null && (!Number.isFinite(coefficient) || coefficient < 0))
    throw new Error('Friction must be zero or greater, or left blank if unknown.')
  return {
    dimensions_m: {
      x: positive('x') / 1000,
      y: positive('y') / 1000,
      z: positive('z') / 1000,
      source: source('dimensions_source'),
      note: values.dimensions_note?.trim() || null,
    },
    mass_kg: {
      value: positive('mass') / 1000,
      source: source('mass_source'),
      note: values.mass_note?.trim() || null,
    },
    sliding_friction:
      coefficient === null
        ? null
        : {
            value: coefficient,
            source: source('friction_source'),
            note: values.friction_note?.trim() || null,
          },
  }
}

export function validatePhotos(files: File[]): string | null {
  if (files.length < 1 || files.length > 4) return 'Choose 1–4 photos of the same object.'
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return `${file.name}: use JPEG, PNG, or WebP.`
    if (file.size > 10 * 1024 * 1024) return `${file.name}: each photo must be at most 10 MiB.`
  }
  return null
}
