import type { Orientation, Properties, Sizing } from './types'

export const sizingMode = (properties: Properties | null) =>
  properties ? properties.sizing?.mode || 'legacy_independent_axes' : 'uniform'

export function makeSizing(
  values: Record<string, string>,
  orientation: Orientation,
): Sizing | undefined {
  const mode = values.sizing_mode
  if (mode === 'legacy_independent_axes') return undefined
  if (mode === 'independent_axes') {
    if (values.acknowledge_distortion !== 'on')
      throw Error('Acknowledge advanced distortion before saving.')
    return { mode, reviewed_orientation: { ...orientation }, acknowledge_distortion: true }
  }
  if (mode !== 'uniform') throw Error('Choose a sizing mode.')
  const axis = values.reference_axis
  if (!['x', 'y', 'z'].includes(axis))
    throw Error('Choose the corresponding full mesh extent axis.')
  if (values.reference_full_extent !== 'on')
    throw Error(
      'Confirm the reference matches the full mesh extent, including any pins. Body-only measurements cannot size an extent including pins.',
    )
  const length = Number(values.reference_length)
  if (!values.reference_length?.trim() || !Number.isFinite(length) || length <= 0)
    throw Error('Reference length must be a positive finite number.')
  const unit = values.reference_unit
  if (!['mm', 'm'].includes(unit)) throw Error('Choose reference units.')
  const source = values.reference_source
  if (!['measured', 'user_supplied', 'estimated', 'sourced'].includes(source))
    throw Error('Choose a reference source.')
  const description = values.reference_description?.trim()
  if (!description) throw Error('Describe what the full extent includes.')
  return {
    mode,
    reviewed_orientation: { ...orientation },
    reference: {
      axis: axis as 'x' | 'y' | 'z',
      length,
      unit: unit as 'mm' | 'm',
      source: source as Properties['dimensions_m']['source'],
      correspondence: 'full_mesh_extent',
      description,
    },
  }
}

export function sizingControls(properties: Properties | null, draft: Record<string, string>) {
  const escape = (v: string) =>
    v.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    )
  const field = (name: string, fallback: string | number = '') =>
    escape(draft[name] ?? String(fallback))
  const selected = draft.sizing_mode || sizingMode(properties)
  const sizing = properties?.sizing
  const reference = sizing?.reference
  const options = (name: string, entries: [string, string][], fallback: string) =>
    entries
      .map(
        ([v, label]) =>
          `<option value="${v}" ${(draft[name] ?? fallback) === v ? 'selected' : ''}>${label}</option>`,
      )
      .join('')
  return `<h3>Sizing and reference correspondence</h3><label>Sizing mode<select name="sizing_mode">${options(
    'sizing_mode',
    [
      ['uniform', 'Uniform: preserve proportions'],
      ['independent_axes', 'Advanced: stretch each axis'],
      ...(properties && !properties.sizing
        ? [
            ['legacy_independent_axes', 'Legacy three-axis sizing (existing job)'] as [
              string,
              string,
            ],
          ]
        : []),
    ],
    selected,
  )}</select></label>${
    selected === 'uniform'
      ? `
  <p>Review and save orientation first. Select the matching full extent on the red X, green Y or blue Z axis. A body-only measurement cannot size a full extent that includes pins. No reference is inferred from AI estimates.</p>
  <div class="grid three"><label>Full mesh extent<select name="reference_axis">${options(
    'reference_axis',
    [
      ['', 'Choose axis'],
      ['x', 'X full extent'],
      ['y', 'Y full extent'],
      ['z', 'Z full extent'],
    ],
    reference?.axis || '',
  )}</select></label>
  <label>Reference length<input name="reference_length" type="number" min="0" step="any" required value="${field('reference_length', reference?.length ?? '')}"></label>
  <label>Reference units<select name="reference_unit">${options(
    'reference_unit',
    [
      ['mm', 'Millimetres'],
      ['m', 'Metres'],
    ],
    reference?.unit || 'mm',
  )}</select></label></div>
  <label>Reference source<select name="reference_source">${options(
    'reference_source',
    [
      ['user_supplied', 'User supplied'],
      ['measured', 'Measured'],
      ['estimated', 'Estimated'],
      ['sourced', 'Sourced'],
    ],
    reference?.source || 'user_supplied',
  )}</select></label>
  <label>Describe the full extent (body, pins and other protrusions)<input name="reference_description" required value="${field('reference_description', reference?.description || '')}"></label>
  <label><input name="reference_full_extent" type="checkbox" ${(draft.reference_full_extent ?? (reference ? 'on' : '')) === 'on' ? 'checked' : ''}> My reference corresponds to the selected full mesh extent, including any pins/protrusions.</label>
  <button id="preview-sizing" type="button">Preview resulting dimensions</button><p id="sizing-preview" role="status"></p>`
      : selected === 'independent_axes'
        ? `
  <p>Advanced stretching changes source proportions. Enter three full dimensions below.</p><label><input name="acknowledge_distortion" type="checkbox" ${(draft.acknowledge_distortion ?? (sizing?.acknowledge_distortion ? 'on' : '')) === 'on' ? 'checked' : ''}> I acknowledge independent-axis distortion.</label>`
        : '<p>Legacy compatibility: these three dimensions independently stretch the mesh. Choose uniform sizing to correct proportions; existing exports remain available.</p>'
  }`
}
