import type { Api } from './api'
import type { Job, Properties } from './types'

const jobs = new Map<string, { record: Job; ticks: number; scenario: string }>()
const cube = '# Synthetic mock cube; uploaded photos were not used\no cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 8 7 6\n'
const cubeUrl = URL.createObjectURL(new Blob([cube], { type: 'text/plain' }))
const sceneUrl = URL.createObjectURL(new Blob(['<!-- SYNTHETIC DEMO ONLY: no MuJoCo validation -->\n<mujoco model="mock_cube"/>\n'], { type: 'application/xml' }))

export let mockScenario: 'normal' | 'provider_failure' | 'completed_demo' = 'normal'
export function setMockScenario(value: typeof mockScenario) { mockScenario = value }

export const mockApi: Api = {
  async health() { return { status: 'ok', provider: 'mock' } },
  async create(files) {
    const id = crypto.randomUUID(), now = new Date().toISOString()
    const record: Job = {
      schema_version: '1.0', id, status: 'queued', provider: 'mock', synthetic: true,
      created_at: now, updated_at: now, progress: 0,
      source_images: files.map((f, i) => `uploads/${String(i).padStart(2, '0')}.${f.name.split('.').pop()?.toLowerCase() || 'png'}`),
      provider_task_id: `mock-${id}`, mesh_path: null, properties: null, asset: null, export_path: null, error: null
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
        item.record.error = { code: 'provider_failed', message: 'Synthetic provider failure for UI testing. Your selected photos remain available.' }
      } else {
        item.record.status = 'awaiting_properties'
        item.record.progress = 100
        item.record.mesh_path = 'reconstruction/mesh.obj'
      }
      item.record.updated_at = new Date().toISOString()
    }
    return structuredClone(item.record)
  },
  async save(id, properties: Properties) {
    const item = jobs.get(id)
    if (!item || item.record.status !== 'awaiting_properties') throw new Error('Properties can only be saved while awaiting input.')
    item.record.properties = structuredClone(properties)
    item.record.updated_at = new Date().toISOString()
    if (item.scenario === 'completed_demo') {
      item.record.status = 'completed'
      item.record.asset = {
        asset_id: crypto.randomUUID(), visual_mesh: 'reconstruction/mesh.obj', properties,
        collision: { kind: 'box', mesh_path: null }, synthetic: true,
        notes: ['Synthetic UI-only downstream completion. No geometry or simulation validation was run.']
      }
      item.record.export_path = 'export/scene.xml'
    }
    return structuredClone(item.record)
  },
  fileUrl(_id, path) { return path === 'export/scene.xml' ? sceneUrl : cubeUrl }
}
