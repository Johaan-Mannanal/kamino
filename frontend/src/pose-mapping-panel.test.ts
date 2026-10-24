// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import type { ReviewProject } from './assembly-review'
import { createMappingPanel } from './pose-mapping-panel'

it('previews each capture, retains out-of-range values, resets and saves a reloadable review', async () => {
  const project = {
    name: 'generic',
    joints: [{ name: 'hinge', kind: 'revolute', limits_rad: [-1, 1] }],
  } as ReviewProject
  const pack = {
    format: 'photo2sim-captures-1.0',
    captures: [10, 90].map((v, i) => ({
      id: `pose${i}`,
      samples: 3,
      calibration_sha256: 'a'.repeat(64),
      source_hashes: { 'capture.json': 'b'.repeat(64) },
      pairing: { association: 'operator-confirmed' },
      photos: [],
      signals: { 'hinge.pos': { unit: 'degrees', median: v, minimum: v, maximum: v } },
    })),
  }
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const preview = vi.fn()
  const save = vi.fn()
  const panel = createMappingPanel(host, preview, save)
  panel.sync(project, 1)
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Capture pack or saved mapping review"]',
  )!
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ size: 500, text: async () => JSON.stringify(pack) }],
  })
  input.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(host.textContent).toContain('pose1'))
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Preview capture"]')!
  select.value = 'pose1'
  select.dispatchEvent(new Event('change'))
  expect(preview).toHaveBeenLastCalledWith({ hinge: Math.PI / 2 }, 'pose1')
  expect(host.textContent).toContain('Joint limit conflict')
  host.querySelector<HTMLButtonElement>('[data-action="save"]')!.click()
  expect(save.mock.calls[0][1].comparisons[1].joints.hinge.angle_rad).toBeCloseTo(Math.PI / 2)
  panel.sync(project, 1)
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Preview capture"]')!.value).toBe('')
  panel.sync({ ...project, name: 'other' }, 2)
  expect(host.textContent).not.toContain('pose1')
})

it('ignores a capture load completing after another workspace opens', async () => {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const panel = createMappingPanel(host, vi.fn(), vi.fn())
  const p = { joints: [] } as unknown as ReviewProject
  panel.sync(p, 1)
  let finish!: (v: string) => void
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', {
    value: [
      {
        size: 5,
        text: () =>
          new Promise<string>((r) => {
            finish = r
          }),
      },
    ],
  })
  input.dispatchEvent(new Event('change'))
  panel.sync(p, 2)
  finish('{}')
  await new Promise((r) => setTimeout(r, 0))
  expect(host.textContent).not.toContain('Choose a capture pack')
})

it('keeps the newer capture import when an older file read finishes late', async () => {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const panel = createMappingPanel(host, vi.fn(), vi.fn())
  panel.sync({ joints: [] } as unknown as ReviewProject, 1)
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!
  let finish!: (v: string) => void
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      {
        size: 5,
        text: () =>
          new Promise<string>((r) => {
            finish = r
          }),
      },
    ],
  })
  input.dispatchEvent(new Event('change'))
  const captures = {
    format: 'photo2sim-captures-1.0',
    captures: [
      {
        id: 'newer',
        samples: 2,
        calibration_sha256: 'a'.repeat(64),
        source_hashes: { 'capture.json': 'b'.repeat(64) },
        pairing: {},
        photos: [],
        signals: { test: { median: 0, minimum: 0, maximum: 0, unit: 'degrees' } },
      },
    ],
  }
  Object.defineProperty(input, 'files', {
    value: [{ size: 500, text: async () => JSON.stringify(captures) }],
  })
  input.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(host.textContent).toContain('newer'))
  captures.captures[0].id = 'older'
  finish(JSON.stringify(captures))
  await new Promise((r) => setTimeout(r, 0))
  expect(host.textContent).toContain('newer')
  expect(host.textContent).not.toContain('older')
})

it('plays, pauses, resets and invalidates observation replay without stale callbacks', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const preview = vi.fn()
  const panel = createMappingPanel(host, preview, vi.fn())
  const project = {
    joints: [{ name: 'hinge', kind: 'revolute', limits_rad: [-2, 2] }],
  } as ReviewProject
  panel.sync(project, 1)
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!
  const pack = {
    format: 'photo2sim-captures-1.0',
    captures: [
      {
        id: 'replay',
        samples: 2,
        calibration_sha256: 'a'.repeat(64),
        source_hashes: { source: 'b'.repeat(64) },
        pairing: {},
        photos: [],
        signals: { 'hinge.pos': { unit: 'degrees', median: 0, minimum: 0, maximum: 90 } },
        observations: [
          { time_s: 0, values: { 'hinge.pos': 0 } },
          { time_s: 1, values: { 'hinge.pos': 90 } },
        ],
      },
    ],
  }
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ size: 500, text: async () => JSON.stringify(pack) }],
  })
  input.dispatchEvent(new Event('change'))
  await vi.runAllTimersAsync()
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Preview capture"]')!
  select.value = 'replay'
  select.dispatchEvent(new Event('change'))
  expect(host.textContent).toContain('Unverified observation replay')
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  host.querySelector<HTMLButtonElement>('[data-action="play-observations"]')!.click()
  clock = 600
  await vi.advanceTimersByTimeAsync(600)
  host.querySelector<HTMLButtonElement>('[data-action="pause-observations"]')!.click()
  const calls = preview.mock.calls.length
  await vi.advanceTimersByTimeAsync(1000)
  expect(preview).toHaveBeenCalledTimes(calls)
  panel.invalidatePending()
  await vi.advanceTimersByTimeAsync(1000)
  expect(preview).toHaveBeenCalledTimes(calls)
  vi.useRealTimers()
})
