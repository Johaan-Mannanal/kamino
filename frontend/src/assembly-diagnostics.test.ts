import { expect, it } from 'vitest'
import { validationFindings } from './assembly-diagnostics'
it('identifies the actual failing joint rather than the commanded joint', () => {
  const rows = validationFindings({
    passed: false,
    tracking_tolerance_rad: 0.03,
    original: {
      passed: false,
      checks: { tracking: false, no_warnings: true },
      trials: [{ phases: [{ joint: 'hinge', tracking_errors_rad: { hinge: 0.001, elbow: 0.2 } }] }],
    },
  })
  expect(rows.some((r) => r.joint === 'elbow' && r.message.includes('0.2'))).toBe(true)
  expect(rows.some((r) => r.joint === 'hinge')).toBe(false)
  expect(rows.some((r) => r.message.includes('Tracking'))).toBe(true)
  expect(rows.some((r) => r.message.includes('warnings'))).toBe(false)
})
it('preserves original and relocated failures and exception details', () => {
  const rows = validationFindings({
    passed: false,
    original: { passed: true },
    relocated: { passed: false, error: 'Missing mesh' },
  })
  expect(rows).toContainEqual({ section: 'Relocated', message: 'Missing mesh' })
  const error = validationFindings({
    passed: false,
    error: { code: 'validation_failed', message: 'Unable to load model' },
  })
  expect(error.some((r) => r.message === 'Unable to load model')).toBe(true)
})
it('does not infer joint causes from old aggregate reports or claim missing results pass', () => {
  const rows = validationFindings({
    passed: false,
    original: {
      passed: false,
      checks: { tracking: false },
      trials: [{ phases: [{ joint: 'hinge', max_all_joint_tracking_error_rad: 0.5 }] }],
    },
  })
  expect(rows.every((r) => !r.joint)).toBe(true)
  expect(validationFindings({ foo: 'bar' })[0].message).toContain('unavailable')
  expect(validationFindings(null)[0].message).toContain('unavailable')
  expect(
    validationFindings({ passed: false, original: { trials: 'bad', checks: { tracking: false } } })
      .length,
  ).toBeGreaterThan(0)
})
