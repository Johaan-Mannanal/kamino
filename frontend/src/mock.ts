import type { Api } from './api'
import type { Job, Properties, ValidationReport } from './types'
import type { Suggestions } from './types'
import { ApiError } from './api'

const jobs = new Map<string, { record: Job; ticks: number; scenario: string }>()
const cached = new Map<string, Suggestions>()
const cube =
  '# Synthetic mock cube; uploaded photos were not used\no cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 5 1 4 8\n'
const cubeUrl = URL.createObjectURL(new Blob([cube], { type: 'text/plain' }))
const sceneUrl = URL.createObjectURL(
  new Blob(['<!-- SYNTHETIC DEMO ONLY: no MuJoCo validation -->\n<mujoco model="mock_cube"/>\n'], {
    type: 'application/xml',
  }),
)

export let mockScenario: 'normal' | 'provider_failure' | 'completed_demo' | 'validation_failure' =
  'normal'
export function setMockScenario(value: typeof mockScenario) {
  mockScenario = value
}

export const mockApi: Api = {
  async cachedSuggestions(id) {
    const result = cached.get(id)
    if (!result) throw new ApiError('No saved suggestions for this job', 404)
    return structuredClone(result)
  },
  async suggest(id) {
    const result: Suggestions = {
      dimensions_m: {
        x: 0.04,
        y: 0.05,
        z: 0.06,
        source: 'estimated',
        note: 'Synthetic UI estimate — unverified',
      },
      mass_kg: { value: 0.08, source: 'estimated', note: 'Synthetic UI estimate — unverified' },
      sliding_friction: null,
      clarifying_questions: [
        'Measure the full X/Y/Z extents after choosing the object orientation.',
        'Weigh the object to replace the mass estimate.',
      ],
      notes: [
        'Synthetic mock response. Gemini was not called.',
        'Contact-pair friction is unknown.',
      ],
    }
    cached.set(id, result)
    return structuredClone(result)
  },
  async health() {
    return { status: 'ok', provider: 'mock' }
  },
  async create(files) {
    const id = crypto.randomUUID(),
      now = new Date().toISOString()
    const record: Job = {
      schema_version: '1.0',
      id,
      status: 'queued',
      provider: 'mock',
      synthetic: true,
      created_at: now,
      updated_at: now,
      progress: 0,
      source_images: files.map(
        (f, i) =>
          `uploads/${String(i).padStart(2, '0')}.${f.name.split('.').pop()?.toLowerCase() || 'png'}`,
      ),
      provider_task_id: `mock-${id}`,
      mesh_path: null,
      properties: null,
      asset: null,
      export_path: null,
      validation_path: null,
      bundle_path: null,
      error: null,
    }
    jobs.set(id, { record, ticks: 0, scenario: mockScenario })
    return structuredClone(record)
  },
  async get(id) {
    const item = jobs.get(id)
    if (!item) throw new Error('Mock job was not found. Start a new upload.')
    if (item.record.status === 'queued' || item.record.status === 'reconstructing') {
      item.ticks++
      if (item.ticks < 4) {
        item.record.status = 'reconstructing'
        item.record.progress = item.ticks * 25
      } else if (item.scenario === 'provider_failure') {
        item.record.status = 'failed'
        item.record.error = {
          code: 'provider_failed',
          message:
            'Synthetic provider failure for UI testing. Your selected photos remain available.',
        }
      } else {
        item.record.status = 'awaiting_properties'
        item.record.progress = 100
        item.record.mesh_path = 'reconstruction/mesh.glb'
      }
      item.record.updated_at = new Date().toISOString()
    }
    if (item.record.status === 'preparing' || item.record.status === 'validating') {
      item.ticks++
      if (item.ticks >= 2) item.record.status = 'validating'
      if (item.ticks >= 4) {
        item.record.export_path = 'attempts/demo/bundle/scene.xml'
        item.record.validation_path = 'attempts/demo/bundle/validation-report.json'
        if (item.scenario === 'validation_failure') {
          item.record.status = 'failed'
          item.record.error = {
            code: 'validation_failed',
            message:
              'Synthetic validation failure. Correct the properties or retry using the saved reconstruction.',
          }
        } else {
          item.record.status = 'completed'
          item.record.bundle_path = 'attempts/demo/simulation.zip'
        }
      }
    }
    return structuredClone(item.record)
  },
  async save(id, properties: Properties) {
    const item = jobs.get(id)
    if (!item || !['awaiting_properties', 'failed'].includes(item.record.status))
      throw new Error(
        'Properties can only be saved while awaiting input or after simulation failure.',
      )
    item.record.properties = structuredClone(properties)
    item.record.status = 'awaiting_properties'
    item.record.error = null
    item.record.asset = null
    item.record.export_path = null
    item.record.validation_path = null
    item.record.bundle_path = null
    item.record.updated_at = new Date().toISOString()
    return structuredClone(item.record)
  },
  async process(id) {
    const item = jobs.get(id)
    if (!item?.record.properties || !item.record.mesh_path)
      throw new Error('Save properties and finish reconstruction first.')
    if (!['awaiting_properties', 'failed'].includes(item.record.status))
      throw new Error('Job is already processing or completed.')
    item.ticks = 0
    item.record.status = 'preparing'
    item.record.error = null
    item.record.export_path = null
    item.record.validation_path = null
    item.record.bundle_path = null
    item.record.asset = {
      asset_id: crypto.randomUUID(),
      visual_mesh: 'meshes/visual.obj',
      properties: item.record.properties,
      collision: { kind: 'box', mesh_path: null },
      synthetic: true,
      notes: ['Synthetic UI fixture. No geometry or validation was run.'],
    }
    return structuredClone(item.record)
  },
  async report(id): Promise<ValidationReport> {
    const passed = jobs.get(id)?.scenario !== 'validation_failure'
    return {
      passed,
      scope: 'Synthetic UI report. Checks were not executed.',
      viewer_inspected: false,
      portability_passed: passed,
      original: { passed },
      relocated: { passed },
    }
  },
  async file(id, path) {
    if (path.endsWith('.glb')) {
      const response = await fetch('/mock/mesh.glb')
      if (!response.ok) throw new Error('Mock GLB fixture is missing.')
      return response.blob()
    }
    if (path.endsWith('.zip')) {
      const response = await fetch('/mock/simulation.zip')
      if (!response.ok) throw new Error('Mock ZIP fixture is missing.')
      return response.blob()
    }
    if (path.endsWith('.json'))
      return new Blob([JSON.stringify(await mockApi.report(id, path), null, 2)], {
        type: 'application/json',
      })
    return new Blob(
      [
        path.endsWith('.xml')
          ? '<!-- Synthetic UI fixture, not validated -->\n<mujoco model="demo"/>\n'
          : cube,
      ],
      { type: 'text/plain' },
    )
  },
  fileUrl(_id, path) {
    return path.endsWith('.xml') ? sceneUrl : cubeUrl
  },
}
