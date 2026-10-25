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
it('opens a saved job and downloads its validated result with API authentication', async () => {
  const file = vi.fn(async () => new Blob(['bundle']))
  const job = {
    id: 'test-job', name: 'test', synthetic: true, status: 'completed', revision: 1,
    project_path: 'revisions/0001/project.json', package_path: 'revisions/0001/package.json',
    export_generated: true, motion_validation_passed: true,
    export_path: 'attempts/0001/bundle/scene.xml',
    validation_path: 'attempts/0001/bundle/validation.json',
    bundle_path: 'attempts/0001/simulation.zip', error: null,
    attempts: [{ number: 1, revision: 1, status: 'completed', export_generated: true,
      motion_validation_passed: true, export_path: 'attempts/0001/bundle/scene.xml',
      validation_path: 'attempts/0001/bundle/validation.json',
      bundle_path: 'attempts/0001/simulation.zip', error: null,
      export_config: { collision_mode: 'box', exclude_joint_pairs: false } }],
  }
  vi.doMock('./assembly-api', () => ({
    assemblyApi: { get: vi.fn(async () => job), reviewPackage: vi.fn(async () => pack), file },
    setAssemblyToken: vi.fn(),
  }))
  const create = vi.fn(() => 'blob:test')
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  await import('./assembly-workbench')
  document.querySelector<HTMLInputElement>('#job-id')!.value = 'test-job'
  document.querySelector<HTMLElement>('#open-job')!.click()
  await vi.waitFor(() => expect(document.querySelector('#job-status')?.textContent).toContain('motion validation passed: yes'))
  const button = [...document.querySelectorAll<HTMLButtonElement>('#attempts button')]
    .find((item) => item.textContent === 'Download Result ZIP')!
  expect(button).toBeDefined()
  button.click()
  await vi.waitFor(() => expect(file).toHaveBeenCalledWith('test-job', 'attempts/0001/simulation.zip'))
  expect(create).toHaveBeenCalled()
  expect(click).toHaveBeenCalled()
  click.mockRestore()
})
