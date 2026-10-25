export type Finding = { section: string; message: string; joint?: string }
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const errorText = (v: unknown) =>
  typeof v === 'string'
    ? v
    : typeof object(v).message === 'string'
      ? (object(v).message as string)
      : ''
const labels: Record<string, string> = {
  tracking:
    'Tracking failed: actual joint positions did not reach the requested targets. Review pivots, collisions, masses and drive settings; the report does not establish which is the cause.',
  actual_joint_motion:
    'Motion failed: at least one joint did not move far enough. Review its connection, limits, collision geometry and drive.',
  joint_limits:
    'Joint limits failed: motion exceeded the allowed tolerance. Review limits and drive settings.',
  reset_repeatable:
    'Reset failed: repeated trials ended differently. Inspect the retained scene and report.',
  no_warnings:
    'Simulator warnings were recorded. Inspect the retained report before using this export.',
  reviewed_model_consistency:
    'Export does not match the reviewed model. Regenerate from the saved revision.',
}
export function validationFindings(value: unknown): Finding[] {
  const report = object(value),
    rows: Finding[] = []
  const topError = errorText(report.error)
  if (topError) rows.push({ section: 'Validation', message: topError })
  for (const [key, section] of [
    ['original', 'Original'],
    ['relocated', 'Relocated'],
  ]) {
    const run = object(report[key])
    if (!Object.keys(run).length) continue
    const err = errorText(run.error)
    if (err) rows.push({ section, message: err })
    for (const [check, passed] of Object.entries(object(run.checks))) {
      if (passed === false)
        rows.push({ section, message: labels[check] ?? `Failed check: ${check}` })
    }
    const maxima = new Map<string, { error: number; unit: string }>()
    for (const trial of Array.isArray(run.trials) ? run.trials : []) {
      for (const phase of Array.isArray(object(trial).phases)
        ? (object(trial).phases as unknown[])
        : []) {
        for (const unit of ['rad', 'm'])
          for (const [joint, error] of Object.entries(
            object(object(phase)[`tracking_errors_${unit}`]),
          )) {
            if (typeof error === 'number' && Number.isFinite(error))
              maxima.set(joint, { error: Math.max(maxima.get(joint)?.error ?? 0, error), unit })
          }
      }
    }
    for (const [joint, { error, unit }] of maxima) {
      const tolerance = report[`tracking_tolerance_${unit}`]
      if (
        typeof tolerance === 'number' &&
        Number.isFinite(tolerance) &&
        tolerance >= 0 &&
        error > tolerance
      )
        rows.push({
          section,
          joint,
          message: `${joint}: maximum tracking error ${error.toPrecision(3)} ${unit}; tolerance ${tolerance} ${unit}. Review this joint and its connected links.`,
        })
    }
    if (run.passed === true)
      rows.push({
        section,
        message: 'Motion checks passed under the saved simulation assumptions.',
      })
    else if (!rows.some((r) => r.section === section))
      rows.push({
        section,
        message: 'Detailed check results unavailable; download the retained report.',
      })
  }
  if (!rows.length)
    rows.push({
      section: 'Validation',
      message: 'Detailed check results unavailable; download the retained report.',
    })
  return rows
}
