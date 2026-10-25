// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { Api } from './api'
import type { TargetInventory } from './target-review'
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  dispose: vi.fn(),
  context: vi.fn(),
  controlsDispose: vi.fn(),
  disconnect: vi.fn(),
  render: vi.fn(),
  realControls: false,
  controls: [] as { target: import('three').Vector3 }[],
}))
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas')
      setPixelRatio() {}
      setSize() {}
      render = mocks.render
      dispose = mocks.dispose
      forceContextLoss = mocks.context
    },
  }
})
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = mocks.parse
  },
}))
vi.mock('three/addons/controls/OrbitControls.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/addons/controls/OrbitControls.js')>()
  const { Vector3 } = await vi.importActual<typeof import('three')>('three')
  return {
    OrbitControls: class {
      target = new Vector3()
      enableDamping = false
      constructor(camera: THREE.Camera, element: HTMLElement) {
        if (mocks.realControls) {
          const controls = new actual.OrbitControls(camera, element)
          mocks.controls.push(controls)
          return controls
        }
        mocks.controls.push(this)
      }
      update() {}
      dispose: () => void = mocks.controlsDispose
    },
  }
})
import { mountViewer } from './viewer'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.controls.length = 0
  mocks.realControls = false
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = mocks.disconnect
    },
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 123),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('devicePixelRatio', 1)
  document.body.innerHTML = '<div id="host"></div>'
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
function mesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
}
const orientation = { x_deg: 90, y_deg: 0, z_deg: 0 }
it('previews sizing after orientation so prepared geometry matches the reported extents', async () => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 2), new THREE.MeshStandardMaterial())
  mocks.parse.mockResolvedValue({ scene: object })
  const cleanup = mountViewer(
    document.querySelector('#host')!,
    { file: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) } as unknown as Api,
    'job',
    'mesh.glb',
    orientation,
    [2, 4, 6],
  )
  await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled())
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  expect(size.toArray()).toEqual(
    expect.arrayContaining([expect.closeTo(2), expect.closeTo(8), expect.closeTo(18)]),
  )
  cleanup()
})
it('releases a parsed mesh that finishes after its mount was disposed, without creating a stale canvas', async () => {
  let resolve!: (value: { scene: THREE.Object3D }) => void
  mocks.parse.mockReturnValue(
    new Promise((r) => {
      resolve = r
    }),
  )
  const object = mesh(),
    dispose = vi.spyOn(object.geometry, 'dispose')
  const host = document.querySelector<HTMLElement>('#host')!
  const file = vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) })
  const cleanup = mountViewer(host, { file } as unknown as Api, 'old-job', 'mesh.glb', orientation)
  await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled())
  cleanup()
  resolve({ scene: object })
  await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
  expect(host.querySelector('canvas')).toBeNull()
  expect(file).toHaveBeenCalledWith('old-job', 'mesh.glb')
})
it('cleans animation, resize observation, controls, GPU geometry/material/texture and WebGL context', async () => {
  const object = mesh(),
    geometry = vi.spyOn(object.geometry, 'dispose'),
    material = vi.spyOn(object.material, 'dispose')
  const texture = new THREE.Texture()
  object.material.map = texture
  const disposeTexture = vi.spyOn(texture, 'dispose')
  mocks.parse.mockResolvedValue({ scene: object })
  const host = document.querySelector<HTMLElement>('#host')!
  const cleanup = mountViewer(
    host,
    { file: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) } as unknown as Api,
    'job',
    'mesh.glb',
    orientation,
  )
  await vi.waitFor(() => expect(host.querySelector('canvas')).not.toBeNull())
  cleanup()
  for (const dispose of [
    geometry,
    material,
    disposeTexture,
    mocks.dispose,
    mocks.context,
    mocks.controlsDispose,
    mocks.disconnect,
  ])
    expect(dispose).toHaveBeenCalledOnce()
  expect(cancelAnimationFrame).toHaveBeenCalledWith(123)
})
it('shows an authenticated-load failure with download fallback', async () => {
  const host = document.querySelector<HTMLElement>('#host')!
  const cleanup = mountViewer(
    host,
    {
      file: async () => {
        throw new Error('HTTP 401')
      },
    } as unknown as Api,
    'job',
    'mesh.glb',
    orientation,
  )
  await vi.waitFor(() => expect(host.textContent).toContain('HTTP 401'))
  expect(host.textContent).toContain('download below')
  cleanup()
})

it('renders only the explicitly selected surfaces before applying orientation and sizing', async () => {
  const box = new THREE.BoxGeometry(1, 3, 2).toNonIndexed()
  const vertices = Array.from({ length: box.attributes.position.count }, (_, i) => [
    box.attributes.position.getX(i),
    box.attributes.position.getY(i),
    box.attributes.position.getZ(i),
  ])
  const faces = Array.from({ length: vertices.length / 3 }, (_, i) => [i * 3, i * 3 + 1, i * 3 + 2])
  const inventory = {
    geometry: {
      chosen: { vertices, faces },
      distractor: { vertices: vertices.map((v) => v.map((n) => n * 100)), faces },
    },
  } as unknown as TargetInventory
  const file = vi.fn().mockRejectedValue(Error('Whole scene must not replace selected geometry'))
  const cleanup = mountViewer(
    document.querySelector('#host')!,
    { file } as unknown as Api,
    'job',
    'mesh.glb',
    orientation,
    [2, 4, 6],
    { inventory, islandIds: ['chosen'] },
  )
  await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled())
  const scene = mocks.render.mock.calls[0][0] as THREE.Scene
  const size = new THREE.Box3().setFromObject(scene.children[0]).getSize(new THREE.Vector3())
  expect(size.x).toBeCloseTo(2)
  expect(size.y).toBeCloseTo(8)
  expect(size.z).toBeCloseTo(18)
  expect(file).not.toHaveBeenCalled()
  cleanup()
})

const host = () => document.querySelector<HTMLElement>('#host')!
const fileApi = () => ({
  file: vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })),
})
const zeroRotation = { x_deg: 0, y_deg: 0, z_deg: 0 }
const ready = () => vi.waitFor(() => expect(mocks.render).toHaveBeenCalled())

it('switches actual GLB materials between mesh and studio without changing geometry or appearance', async () => {
  const object = mesh()
  object.material.color.set('#bb2244')
  object.material.transparent = true
  object.material.opacity = 0.35
  object.material.map = new THREE.Texture()
  const map = object.material.map
  const vertices = Array.from(object.geometry.attributes.position.array)
  mocks.parse.mockResolvedValue({ scene: object })
  const api = fileApi()
  const view = mountViewer(host(), api as unknown as Api, 'job', 'mesh.glb', zeroRotation)
  view.setMode('mesh')
  await ready()
  expect(object.material.wireframe).toBe(true)
  view.setMode('studio')
  expect(object.material.wireframe).toBe(false)
  expect(object.material.color.getHexString()).toBe('bb2244')
  expect(object.material.opacity).toBe(0.35)
  expect(object.material.map).toBe(map)
  expect(Array.from(object.geometry.attributes.position.array)).toEqual(vertices)
  expect(api.file).toHaveBeenCalledOnce()
  view()
})

it('captures orbit pan and relative zoom and restores them for differently sized geometry', async () => {
  const object = mesh()
  mocks.parse.mockResolvedValue({ scene: object })
  const view = mountViewer(host(), fileApi() as unknown as Api, 'job', 'mesh.glb', zeroRotation)
  expect(view.getViewState()).toBeNull()
  await ready()
  const camera = mocks.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera
  const extent = Math.sqrt(3)
  const target = mocks.controls.at(-1)!.target.set(0.2 * extent, -0.1 * extent, 0.3 * extent)
  camera.position.copy(target).add(new THREE.Vector3(2, 3, 6).multiplyScalar((extent / 7) * 2))
  const state = view.getViewState()!
  expect(state.direction).toEqual([
    expect.closeTo(2 / 7),
    expect.closeTo(3 / 7),
    expect.closeTo(6 / 7),
  ])
  expect(state.targetOffset).toEqual([
    expect.closeTo(0.2),
    expect.closeTo(-0.1),
    expect.closeTo(0.3),
  ])
  expect(state.distanceRatio).toBeCloseTo(2)
  view()
  mocks.render.mockClear()
  mocks.parse.mockResolvedValue({
    scene: new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshStandardMaterial()),
  })
  const restored = mountViewer(
    host(),
    fileApi() as unknown as Api,
    'job',
    'mesh.glb',
    zeroRotation,
    undefined,
    undefined,
    { initialViewState: state, mode: 'mesh' },
  )
  await ready()
  const next = restored.getViewState()!
  expect(next.direction).toEqual(state.direction.map((v) => expect.closeTo(v)))
  expect(next.targetOffset).toEqual(state.targetOffset.map((v) => expect.closeTo(v)))
  expect(next.distanceRatio).toBeCloseTo(2)
  const nextCamera = mocks.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera
  expect(nextCamera.near).toBeGreaterThan(0)
  expect(nextCamera.far).toBeGreaterThan(nextCamera.position.length())
  restored.resetCamera()
  expect(restored.getViewState()!.targetOffset).toEqual([0, 0, 0])
  const scene = mocks.render.mock.calls.at(-1)![0] as THREE.Scene
  let wireframe = false
  scene.traverse((n) => {
    if (n instanceof THREE.Mesh) wireframe = (n.material as THREE.MeshStandardMaterial).wireframe
  })
  expect(wireframe).toBe(true)
  restored()
})

it.each([
  { direction: [0, 0, 0], targetOffset: [0, 0, 0], distanceRatio: 1 },
  { direction: [1, 0, 0], targetOffset: [NaN, 0, 0], distanceRatio: 1 },
  { direction: [1, 0, 0], targetOffset: [0, 0, 0], distanceRatio: -1 },
])('falls back to a finite fitted camera for invalid saved state %j', async (state) => {
  mocks.parse.mockResolvedValue({ scene: mesh() })
  const view = mountViewer(
    host(),
    fileApi() as unknown as Api,
    'job',
    'mesh.glb',
    zeroRotation,
    undefined,
    undefined,
    { initialViewState: state as any },
  )
  await ready()
  expect(view.getViewState()!.targetOffset).toEqual([0, 0, 0])
  expect(view.getViewState()!.distanceRatio).toBeGreaterThan(0)
  expect(view.getViewState()!.direction.every(Number.isFinite)).toBe(true)
  view()
})

it('honors reset during loading over an initial snapshot and disposes once', async () => {
  let resolve!: (v: { scene: THREE.Object3D }) => void
  mocks.parse.mockReturnValue(
    new Promise((r) => {
      resolve = r
    }),
  )
  const view = mountViewer(
    host(),
    fileApi() as unknown as Api,
    'job',
    'mesh.glb',
    zeroRotation,
    undefined,
    undefined,
    {
      initialViewState: { direction: [1, 0, 0], targetOffset: [4, 5, 6], distanceRatio: 10 },
    },
  )
  view.setMode('mesh')
  view.resetCamera()
  await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled())
  const object = mesh()
  resolve({ scene: object })
  await ready()
  expect(view.getViewState()!.targetOffset).toEqual([0, 0, 0])
  expect(object.material.wireframe).toBe(true)
  view()
  view()
  view.resetCamera()
  view.setMode('studio')
  expect(view.getViewState()).toBeNull()
  expect(mocks.dispose).toHaveBeenCalledOnce()
})

it.each([[201, 427], [390, 600], [1200, 300]])(
  'fits all mesh vertices initially and after Reset in a %s by %s viewport',
  async (width, height) => {
    mocks.realControls = true
    Object.defineProperties(host(), {
      clientWidth: { configurable: true, value: width },
      clientHeight: { configurable: true, value: height },
    })
    const object = new THREE.Mesh(
      new THREE.BoxGeometry(8, 1, 2),
      new THREE.MeshStandardMaterial(),
    )
    mocks.parse.mockResolvedValue({ scene: object })
    const view = mountViewer(host(), fileApi() as unknown as Api, 'job', 'mesh.glb', zeroRotation)
    await ready()
    const camera = mocks.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera
    const assertFits = () => {
      object.updateWorldMatrix(true, false)
      camera.updateMatrixWorld(true)
      const positions = object.geometry.attributes.position
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld).project(camera)
        expect(Math.abs(p.x)).toBeLessThan(1)
        expect(Math.abs(p.y)).toBeLessThan(1)
        expect(Math.abs(p.z)).toBeLessThan(1)
      }
    }
    assertFits()
    // Reset also works when the container changed before ResizeObserver delivered.
    Object.defineProperty(host(), 'clientWidth', { configurable: true, value: 160 })
    camera.position.set(0.1, 0.1, 0.1)
    mocks.controls.at(-1)!.target.set(10, 20, 30)
    view.resetCamera()
    expect(camera.aspect).toBeCloseTo(160 / height)
    assertFits()
    expect(view.getViewState()!.targetOffset).toEqual([0, 0, 0])
    view()
  },
)

it('resets immediately even while real OrbitControls still has drag inertia', async () => {
  mocks.realControls = true
  mocks.parse.mockResolvedValue({ scene: mesh() })
  const view = mountViewer(host(), fileApi() as unknown as Api, 'job', 'mesh.glb', zeroRotation)
  await ready()
  const fitted = view.getViewState()!
  const canvas = host().querySelector('canvas')!
  Object.defineProperty(canvas, 'clientHeight', { value: 480 })
  Object.defineProperty(canvas, 'clientWidth', { value: 640 })
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } })
    canvas.dispatchEvent(event)
  }
  pointer('pointerdown', 300, 240)
  pointer('pointermove', 430, 280)
  pointer('pointerup', 430, 280)
  expect(view.getViewState()!.direction).not.toEqual(fitted.direction)
  view.resetCamera()
  expect(view.getViewState()!.direction).toEqual(fitted.direction.map((v) => expect.closeTo(v, 8)))
  const real = mocks.controls.at(
    -1,
  ) as unknown as import('three/addons/controls/OrbitControls.js').OrbitControls
  real.update()
  expect(view.getViewState()!.direction).toEqual(fitted.direction.map((v) => expect.closeTo(v, 8)))
  view()
})
