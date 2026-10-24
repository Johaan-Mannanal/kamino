// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const identity = { position_m: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] }
const pack = {
  format: 'photo2sim-review-package-1.0',
  project: {
    schema_version: 'assembly-review-1.0',
    name: 'test',
    synthetic: true,
    root_link: 'base',
    notes: ['Estimated test'],
    parts: [
      {
        id: 'p',
        mesh: 'p.obj',
        sha256: 'a'.repeat(64),
        pose: identity,
        group: 'base',
        source: 'sourced',
        note: 'Fixture',
      },
    ],
    groups: [
      {
        name: 'base',
        frame: identity,
        mass_kg: { value: 0.1, source: 'estimated' },
        sliding_friction: null,
        reviewed: false,
        review_note: 'Engineering fixture',
      },
    ],
    joints: [],
  },
  geometry: {
    p: {
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      faces: [
        [0, 1, 2],
        [0, 1, 3],
      ],
      bounds_m: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    },
  },
}
beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = '<div id="assembly-app"></div>'
  vi.doMock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three')
    return {
      ...actual,
      WebGLRenderer: class {
        constructor() {
          throw Error('No GPU in DOM test')
        }
      },
    }
  })
})
async function load() {
  await import('./assembly-workbench')
  const input = document.querySelector<HTMLInputElement>('#load')!
  Object.defineProperty(input, 'files', {
    value: [{ size: 100, text: async () => JSON.stringify(pack) }],
  })
  input.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(document.querySelector('#summary')?.textContent).toContain('1 parts'),
  )
}
it('loads locally, acknowledges, then clears review on reassignment', async () => {
  await load()
  ;(document.querySelector('#approve') as HTMLElement).click()
  expect(document.querySelector('#summary')?.textContent).toContain('1/1 acknowledged')
  const select = document.querySelector<HTMLSelectElement>('#parts select')!
  select.value = ''
  select.dispatchEvent(new Event('change'))
  expect(document.querySelector('#summary')?.textContent).toContain('0/1 acknowledged')
  expect(document.querySelector('input[placeholder="Reason for exclusion"]')).not.toBeNull()
})
it('provides guided numeric fields and applies a pivot edit before acknowledgement', async () => {
  await load()
  const field = document.querySelector<HTMLInputElement>('[aria-label="Pivot X (m)"]')!
  expect(field).not.toBeNull()
  field.value = '.15'
  field.dispatchEvent(new Event('input'))
  ;(document.querySelector('#apply') as HTMLElement).click()
  expect(
    JSON.parse((document.querySelector('#editor') as HTMLTextAreaElement).value).frame
      .position_m[0],
  ).toBe(0.15)
  expect(document.querySelector('#summary')?.textContent).toContain('0/1 acknowledged')
})
