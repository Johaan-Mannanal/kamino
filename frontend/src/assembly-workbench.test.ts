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
  window.dispatchEvent(new Event('pagehide'))
  vi.resetModules()
  vi.doUnmock('./assembly-api')
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
    id: 'test-job',
    name: 'test',
    synthetic: true,
    status: 'completed',
    revision: 1,
    project_path: 'revisions/0001/project.json',
    package_path: 'revisions/0001/package.json',
    export_generated: true,
    motion_validation_passed: true,
    export_path: 'attempts/0001/bundle/scene.xml',
    validation_path: 'attempts/0001/bundle/validation.json',
    bundle_path: 'attempts/0001/simulation.zip',
    error: null,
    attempts: [
      {
        number: 1,
        revision: 1,
        status: 'completed',
        export_generated: true,
        motion_validation_passed: true,
        export_path: 'attempts/0001/bundle/scene.xml',
        validation_path: 'attempts/0001/bundle/validation.json',
        bundle_path: 'attempts/0001/simulation.zip',
        error: null,
        export_config: { collision_mode: 'box', exclude_joint_pairs: false },
      },
    ],
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
  await vi.waitFor(() =>
    expect(document.querySelector('#job-status')?.textContent).toContain(
      'motion validation passed: yes',
    ),
  )
  const button = [...document.querySelectorAll<HTMLButtonElement>('#attempts button')].find(
    (item) => item.textContent === 'Download Result ZIP',
  )!
  expect(button).toBeDefined()
  expect(document.querySelector<HTMLButtonElement>('#process')!.disabled).toBe(true)
  button.click()
  await vi.waitFor(() =>
    expect(file).toHaveBeenCalledWith('test-job', 'attempts/0001/simulation.zip'),
  )
  expect(create).toHaveBeenCalled()
  expect(click).toHaveBeenCalled()
  click.mockRestore()
})

it('edits property provenance and preserves unknown friction until explicitly supplied', async () => {
  await load()
  const set = (label: string, value: string, event = 'input') => {
    const field = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
    expect(field).not.toBeNull()
    field.value = value
    field.dispatchEvent(new Event(event))
  }
  set('Mass provenance', 'measured', 'change')
  set('Mass note', 'Scale reading')
  document.querySelector<HTMLElement>('#apply')!.click()
  let record = JSON.parse(document.querySelector<HTMLTextAreaElement>('#editor')!.value)
  expect(record.mass_kg).toEqual({ value: 0.1, source: 'measured', note: 'Scale reading' })
  expect(record.sliding_friction).toBeNull()
  set('Sliding friction (blank = unknown)', '0.4')
  set('Friction provenance', 'estimated', 'change')
  set('Friction note', 'Trial assumption')
  document.querySelector<HTMLElement>('#apply')!.click()
  record = JSON.parse(document.querySelector<HTMLTextAreaElement>('#editor')!.value)
  expect(record.sliding_friction).toEqual({
    value: 0.4,
    source: 'estimated',
    note: 'Trial assumption',
  })
  set('Sliding friction (blank = unknown)', '')
  document.querySelector<HTMLElement>('#apply')!.click()
  record = JSON.parse(document.querySelector<HTMLTextAreaElement>('#editor')!.value)
  expect(record.sliding_friction).toBeNull()
  expect(document.querySelector('#summary')?.textContent).toContain('0/1 acknowledged')
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const pendingJob = (id = 'job-a', status = 'awaiting_review', revision = 1) => ({
  id,
  name: 'test',
  synthetic: true,
  status,
  revision,
  project_path: 'project.json',
  package_path: 'package.json',
  attempts: [],
  export_generated: false,
  motion_validation_passed: null,
  error: null,
})
async function open(id: string) {
  document.querySelector<HTMLInputElement>('#job-id')!.value = id
  document.querySelector<HTMLElement>('#open-job')!.click()
  await vi.waitFor(() =>
    expect(document.querySelector('#job-status')?.textContent).toContain(`Job ${id}`),
  )
}
function pivot(value: string) {
  const field = document.querySelector<HTMLInputElement>('[aria-label="Pivot X (m)"]')!
  field.value = value
  field.dispatchEvent(new Event('input'))
  document.querySelector<HTMLElement>('#apply')!.click()
}
it('keeps edits made during a pending save dirty and prevents duplicate saves', async () => {
  const result = deferred<ReturnType<typeof pendingJob>>()
  const save = vi.fn(
    (_id: string, _project: typeof pack.project, _revision: number) => result.promise,
  )
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      get: async () => pendingJob(),
      reviewPackage: async () => structuredClone(pack),
      save,
    },
    setAssemblyToken: vi.fn(),
  }))
  await import('./assembly-workbench')
  await open('job-a')
  pivot('0.1')
  document.querySelector<HTMLElement>('#save-revision')!.click()
  pivot('0.2')
  document.querySelector<HTMLElement>('#save-revision')!.click()
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0][1].groups[0].frame.position_m[0]).toBe(0.1)
  result.resolve(pendingJob('job-a', 'awaiting_review', 2))
  await vi.waitFor(() =>
    expect(document.querySelector('#job-status')?.textContent).toContain('revision 2'),
  )
  expect(document.querySelector('#job-status')?.textContent).toContain('unsaved edits')
  expect(document.querySelector<HTMLButtonElement>('#process')!.disabled).toBe(true)
})
it('ignores a late poll after a different job has been opened', async () => {
  const result = deferred<ReturnType<typeof pendingJob>>()
  let count = 0
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      get: vi.fn((id: string) =>
        id === 'job-b'
          ? Promise.resolve(pendingJob(id))
          : ++count === 1
            ? Promise.resolve(pendingJob(id, 'validating'))
            : result.promise,
      ),
      reviewPackage: async () => structuredClone(pack),
    },
    setAssemblyToken: vi.fn(),
  }))
  await import('./assembly-workbench')
  await open('job-a')
  await vi.waitFor(() => expect(count).toBe(2), { timeout: 2000 })
  await open('job-b')
  result.resolve(pendingJob('job-a', 'completed'))
  await new Promise((done) => setTimeout(done, 20))
  expect(document.querySelector('#job-status')?.textContent).toContain('Job job-b')
})
it('ignores an older open request when a newer request wins', async () => {
  const result = deferred<ReturnType<typeof pendingJob>>()
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      get: (id: string) => (id === 'job-a' ? result.promise : Promise.resolve(pendingJob(id))),
      reviewPackage: async () => structuredClone(pack),
    },
    setAssemblyToken: vi.fn(),
  }))
  await import('./assembly-workbench')
  document.querySelector<HTMLInputElement>('#job-id')!.value = 'job-a'
  document.querySelector<HTMLElement>('#open-job')!.click()
  await open('job-b')
  result.resolve(pendingJob('job-a'))
  await new Promise((done) => setTimeout(done, 20))
  expect(document.querySelector('#job-status')?.textContent).toContain('Job job-b')
})

it('retains unsaved local work when opening another job fails', async () => {
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      get: async () => {
        throw Error('Job not found')
      },
    },
    setAssemblyToken: vi.fn(),
  }))
  await load()
  pivot('0.2')
  document.querySelector<HTMLInputElement>('#job-id')!.value = 'missing'
  document.querySelector<HTMLElement>('#open-job')!.click()
  await vi.waitFor(() =>
    expect(document.querySelector('#message')?.textContent).toContain('Job not found'),
  )
  expect(document.querySelector<HTMLElement>('#workspace')!.hidden).toBe(false)
  expect(
    JSON.parse(document.querySelector<HTMLTextAreaElement>('#editor')!.value).frame.position_m[0],
  ).toBe(0.2)
  document.querySelector<HTMLElement>('#approve')!.click()
  expect(document.querySelector('#summary')?.textContent).toContain('1/1 acknowledged')
})

it('creates a connected link, groups a part and renames references without JSON', async () => {
  await load()
  const fill = (id: string, value: string) => {
    const field = document.querySelector<HTMLInputElement>(id)!
    expect(field).not.toBeNull()
    field.value = value
    field.dispatchEvent(new Event('input'))
  }
  fill('#new-link-name', 'panel')
  fill('#new-joint-name', 'hinge')
  document.querySelector<HTMLElement>('#add-link')!.click()
  const group = document.querySelector<HTMLSelectElement>('#parts select')!
  group.value = 'panel'
  group.dispatchEvent(new Event('change'))
  const selector = document.querySelector<HTMLSelectElement>('#selection')!
  selector.value = 'group:1'
  selector.dispatchEvent(new Event('change'))
  fill('[aria-label="Link name"]', 'door')
  document.querySelector<HTMLElement>('#apply')!.click()
  const p = JSON.parse(document.querySelector<HTMLTextAreaElement>('#full')!.value)
  expect(p.parts[0].group).toBe('door')
  expect(p.joints[0].child).toBe('door')
  expect(p.groups[1].name).toBe('door')
  expect(p.groups.every((g: { reviewed: boolean }) => !g.reviewed)).toBe(true)
})

it('creates a draft from files and declared units without a project JSON', async () => {
  const fromMeshes = vi.fn(async (name, units, synthetic, files) => {
    expect([name, units, synthetic, files[0].name]).toEqual(['panel', 'mm', true, 'part.stl'])
    return pendingJob()
  })
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      fromMeshes,
      get: async () => pendingJob(),
      reviewPackage: async () => structuredClone(pack),
    },
    setAssemblyToken: vi.fn(),
  }))
  await import('./assembly-workbench')
  const field = document.querySelector<HTMLInputElement>('#draft-meshes')!
  expect(field).not.toBeNull()
  Object.defineProperty(field, 'files', { value: [new File(['mesh'], 'part.stl')] })
  document.querySelector<HTMLInputElement>('#draft-name')!.value = 'panel'
  document.querySelector<HTMLSelectElement>('#draft-units')!.value = 'mm'
  document.querySelector<HTMLInputElement>('#draft-synthetic')!.checked = true
  document.querySelector<HTMLElement>('#create-draft')!.click()
  await vi.waitFor(() =>
    expect(document.querySelector('#job-status')?.textContent).toContain('Job job-a'),
  )
  expect(document.querySelector('#summary')?.textContent).toContain('1 parts')
})

it('shows retained validation failures and navigates to the joint without changing inputs', async () => {
  const { addConnectedLink } = await import('./assembly-builder')
  const withJoint = structuredClone(pack)
  withJoint.project = addConnectedLink(
    withJoint.project as never,
    'panel',
    'base',
    'hinge',
    'revolute',
  ) as never
  const failure = {
    ...pendingJob('failed', 'failed'),
    attempts: [
      {
        number: 1,
        revision: 1,
        status: 'failed',
        export_generated: true,
        motion_validation_passed: false,
        export_path: 'scene.xml',
        validation_path: 'validation.json',
        bundle_path: null,
        error: null,
        export_config: { collision_mode: 'box', exclude_joint_pairs: false },
      },
    ],
  }
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      get: async () => failure,
      reviewPackage: async () => withJoint,
      file: async () => ({
        text: async () =>
          JSON.stringify({
            passed: false,
            tracking_tolerance_rad: 0.03,
            original: {
              passed: false,
              checks: { tracking: false },
              trials: [{ phases: [{ tracking_errors_rad: { hinge: 0.4 } }] }],
            },
          }),
      }),
    },
    setAssemblyToken: vi.fn(),
  }))
  await import('./assembly-workbench')
  await open('failed')
  const button = [...document.querySelectorAll<HTMLButtonElement>('#attempts button')].find(
    (b) => b.textContent === 'Inspect validation',
  )
  expect(button).toBeDefined()
  button!.click()
  await vi.waitFor(() =>
    expect(document.querySelector('#attempts')!.textContent).toContain('Tracking failed'),
  )
  const review = [...document.querySelectorAll<HTMLButtonElement>('#attempts button')].find(
    (b) => b.textContent === 'Review hinge',
  )!
  expect(review).toBeDefined()
  review.click()
  expect(document.querySelector<HTMLSelectElement>('#selection')!.value).toBe('joint:0')
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="Position gain (Nm/rad)"]')!.value,
  ).toBe('5')
})

it('does not show an old validation response after changing jobs', async () => {
  const result = deferred<{ text: () => Promise<string> }>()
  const old = {
    ...pendingJob('old', 'failed'),
    attempts: [
      {
        number: 1,
        revision: 1,
        status: 'failed',
        export_generated: true,
        motion_validation_passed: false,
        validation_path: 'validation.json',
        export_path: null,
        bundle_path: null,
        error: null,
        export_config: { collision_mode: 'box', exclude_joint_pairs: false },
      },
    ],
  }
  vi.doMock('./assembly-api', () => ({
    assemblyApi: {
      get: async (id: string) => (id === 'old' ? old : pendingJob('new')),
      reviewPackage: async () => structuredClone(pack),
      file: () => result.promise,
    },
    setAssemblyToken: vi.fn(),
  }))
  await import('./assembly-workbench')
  await open('old')
  const button = [...document.querySelectorAll<HTMLButtonElement>('#attempts button')].find(
    (b) => b.textContent === 'Inspect validation',
  )
  expect(button).toBeDefined()
  button!.click()
  await open('new')
  result.resolve({ text: async () => JSON.stringify({ passed: false, error: 'old failure' }) })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('#attempts')!.textContent).not.toContain('old failure')
})
