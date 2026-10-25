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
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    enableDamping = false
    update() {}
    dispose = mocks.controlsDispose
  },
}))
import { mountViewer } from './viewer'
beforeEach(() => {
  vi.clearAllMocks()
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
