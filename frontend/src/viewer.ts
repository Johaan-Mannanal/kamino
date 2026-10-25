import type { TargetInventory } from './target-review'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import type { Api } from './api'
import type { Orientation } from './types'
import { orientationMatrix } from './orientation'

export type ViewerMode = 'studio' | 'mesh'
export type ViewerViewState = {
  direction: [number, number, number]
  targetOffset: [number, number, number]
  distanceRatio: number
}
export type ViewerOptions = { mode?: ViewerMode; initialViewState?: ViewerViewState | null }
export interface ViewerHandle {
  (): void
  setMode(mode: ViewerMode): void
  resetCamera(): void
  getViewState(): ViewerViewState | null
}

// The caller owns this mount. Disposing also invalidates pending fetch/parse work.
export function mountViewer(
  host: HTMLElement,
  api: Api,
  id: string,
  path: string,
  orientation: Orientation,
  scaleFactors?: number[],
  selection?: { inventory: TargetInventory; islandIds: string[] },
  options: ViewerOptions = {},
): ViewerHandle {
  let disposed = false
  let renderer: THREE.WebGLRenderer | undefined
  let controls: OrbitControls | undefined
  let observer: ResizeObserver | undefined
  let model: THREE.Object3D | undefined
  let frame = 0
  let camera: THREE.PerspectiveCamera | undefined
  let extent = 0
  let mode = options.mode ?? 'studio'
  let initialViewState = options.initialViewState
  const applyMode = () => {
    model?.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
        if ('wireframe' in material) material.wireframe = mode === 'mesh'
      }
    })
  }
  const fitCamera = () => {
    if (!camera || !controls) return
    // Flush residual orbit/pan inertia before fitting, so Reset stays fitted.
    const damping = controls.enableDamping
    controls.enableDamping = false
    controls.update()
    controls.target.set(0, 0, 0)
    camera.aspect = (host.clientWidth || 300) / (host.clientHeight || 320)
    const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2)
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect)
    // The bounds diagonal encloses the mesh in a sphere. Fit that sphere to
    // the narrower field of view with margin, retaining the usual wide view.
    const distance = Math.max(
      extent * Math.sqrt(4.25),
      (extent * 0.55) / Math.sin(Math.min(halfVertical, halfHorizontal)),
    )
    camera.position.set(1, -1.5, 1).normalize().multiplyScalar(distance)
    updateClipping()
    controls.update()
    controls.enableDamping = damping
  }
  const updateClipping = () => {
    if (!camera || !controls) return
    const distance = camera.position.distanceTo(controls.target)
    camera.near = Math.max(extent / 1000, distance / 1000000)
    camera.far = Math.max(extent * 100, distance + controls.target.length() + extent * 5)
    camera.updateProjectionMatrix()
  }
  const restoreCamera = (state: ViewerViewState | null | undefined) => {
    if (!camera || !controls || !state) return
    if (
      state.direction.length !== 3 ||
      state.targetOffset.length !== 3 ||
      ![...state.direction, ...state.targetOffset, state.distanceRatio].every(Number.isFinite) ||
      state.distanceRatio <= 0
    )
      return
    const direction = new THREE.Vector3(...state.direction)
    if (!Number.isFinite(direction.length()) || direction.length() === 0) return
    const target = new THREE.Vector3(...state.targetOffset).multiplyScalar(extent)
    const position = direction
      .normalize()
      .multiplyScalar(state.distanceRatio * extent)
      .add(target)
    if (
      ![
        ...target.toArray(),
        ...position.toArray(),
        position.distanceTo(target),
        target.length(),
      ].every(Number.isFinite) ||
      position.distanceTo(target) <= 0
    )
      return
    controls.target.copy(target)
    camera.position.copy(position)
    updateClipping()
    controls.update()
  }
  const release = (object: THREE.Object3D) => {
    const textures = new Set<THREE.Texture>()
    const materials = new Set<THREE.Material>()
    object.traverse((item) => {
      const mesh = item as THREE.Mesh
      mesh.geometry?.dispose()
      if (mesh.material)
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material)
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value)
        }
    })
    textures.forEach((texture) => {
      texture.dispose()
      const source = texture.source?.data
      if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()
    })
    materials.forEach((material) => material.dispose())
  }
  const cleanup = () => {
    cancelAnimationFrame(frame)
    observer?.disconnect()
    controls?.dispose()
    controls = undefined
    camera = undefined
    if (model) {
      release(model)
      model = undefined
    }
    renderer?.dispose()
    renderer?.forceContextLoss()
    renderer = undefined
  }
  host.textContent = 'Loading authenticated mesh…'
  void (async () => {
    try {
      // Read bytes with application authorization. No bearer token is placed in a URL.
      if (selection) {
        const group = new THREE.Group()
        for (const island of selection.islandIds) {
          const data = selection.inventory.geometry?.[island]
          if (!data) throw Error('Selected target preview is unavailable.')
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(data.vertices.flat(), 3),
          )
          geometry.setIndex(data.faces.flat())
          geometry.computeVertexNormals()
          group.add(
            new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({ color: 0x448dde, side: THREE.DoubleSide }),
            ),
          )
        }
        model = group
      } else {
        const blob = await api.file(id, path)
        if (disposed) return
        if (/\.glb$/i.test(path)) {
          const bytes = await blob.arrayBuffer()
          if (disposed) return
          // Only embedded GLB resources are supported; never fetch remote texture URLs.
          const manager = new THREE.LoadingManager()
          manager.setURLModifier((url) => {
            if (!url.startsWith('blob:') && !url.startsWith('data:'))
              throw new Error('External GLB resources are unsupported. Download the mesh instead.')
            return url
          })
          const gltf = await new GLTFLoader(manager).parseAsync(bytes, '')
          model = gltf.scene
        } else if (/\.obj$/i.test(path)) {
          model = new OBJLoader().parse(await blob.text())
        } else throw new Error('Preview supports GLB and OBJ. Download this mesh to inspect it.')
      }
      if (disposed) {
        release(model)
        model = undefined
        return
      }
      // Parent rotation happens after existing node transforms, before centring.
      const rotated = new THREE.Group()
      rotated.add(model)
      rotated.applyMatrix4(orientationMatrix(orientation))
      const oriented = new THREE.Group()
      oriented.add(rotated)
      // A parent scale acts on the reviewed world axes AFTER rotation, matching
      // preparation even when advanced scaling and arbitrary rotations combine.
      if (scaleFactors) {
        if (scaleFactors.length !== 3 || scaleFactors.some((s) => !Number.isFinite(s) || s <= 0))
          throw Error('Invalid sizing preview scale')
        oriented.scale.set(scaleFactors[0], scaleFactors[1], scaleFactors[2])
      }
      oriented.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(oriented)
      if (box.isEmpty()) throw new Error('The mesh contains no visible geometry.')
      const center = box.getCenter(new THREE.Vector3())
      extent = box.getSize(new THREE.Vector3()).length()
      if (!Number.isFinite(extent) || extent <= 0) throw new Error('The mesh has invalid bounds.')
      oriented.position.sub(center)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#151719')
      scene.add(oriented, new THREE.HemisphereLight(0xffffff, 0x777777, 3))
      const light = new THREE.DirectionalLight(0xffffff, 3)
      light.position.set(extent, -extent, extent * 2)
      scene.add(light)
      const axes = new THREE.AxesHelper(extent * 0.7)
      scene.add(axes)
      // Include viewer helpers in disposal.
      model = scene
      applyMode()
      camera = new THREE.PerspectiveCamera(40, 1, extent / 1000, extent * 100)
      camera.up.set(0, 0, 1)
      camera.position.set(extent, -extent * 1.5, extent)
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.domElement.setAttribute(
        'aria-label',
        '3D mesh preview. Drag to orbit and scroll to zoom. Red X, green Y, blue Z.',
      )
      renderer.domElement.setAttribute('role', 'img')
      host.replaceChildren(renderer.domElement)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      const resize = () => {
        if (!renderer || !camera || disposed) return
        const width = host.clientWidth || 300,
          height = host.clientHeight || 320
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
      observer = new ResizeObserver(resize)
      observer.observe(host)
      resize()
      fitCamera()
      restoreCamera(initialViewState)
      const draw = () => {
        if (disposed || !renderer || !camera) return
        controls?.update()
        renderer.render(scene, camera)
        frame = requestAnimationFrame(draw)
      }
      draw()
    } catch (error) {
      cleanup()
      if (!disposed)
        host.textContent = `Preview unavailable: ${(error as Error).message} Use the reconstructed mesh download below.`
    }
  })()
  const handle: ViewerHandle = Object.assign(
    () => {
      if (disposed) return
      disposed = true
      cleanup()
    },
    {
      setMode(next: ViewerMode) {
        if (disposed) return
        mode = next
        applyMode()
      },
      resetCamera() {
        if (disposed) return
        initialViewState = null
        fitCamera()
      },
      getViewState(): ViewerViewState | null {
        if (disposed || !camera || !controls || extent <= 0) return null
        const offset = camera.position.clone().sub(controls.target)
        const distance = offset.length()
        if (!Number.isFinite(distance) || distance <= 0) return null
        return {
          direction: offset.divideScalar(distance).toArray() as [number, number, number],
          targetOffset: controls.target.clone().divideScalar(extent).toArray() as [
            number,
            number,
            number,
          ],
          distanceRatio: distance / extent,
        }
      },
    },
  )
  return handle
}
