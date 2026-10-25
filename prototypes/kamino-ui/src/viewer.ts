import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { Properties } from "./workflow";
import { storyScene } from "./story-motion";
import { fitStoryCamera } from "./story-camera";

export class MugViewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
    new THREE.PerspectiveCamera(34, 1, 0.001, 100);
  controls: OrbitControls;
  content = new THREE.Group();
  rotated = new THREE.Group();
  object = new THREE.Group();
  mode = "studio";
  targetScale = 1;
  storyWire = new THREE.Group();
  wireMaterial = new THREE.MeshBasicMaterial({
    color: "#8babc6",
    wireframe: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  lastStoryProgress = -1;
  frame = 0;
  needsRender = true;
  disposed = false;
  resizeObserver: ResizeObserver;
  floor: THREE.Mesh;
  grid: THREE.GridHelper;
  material = new THREE.MeshStandardMaterial({
    color: "#e5ddc9",
    roughness: 0.27,
    metalness: 0.03,
  });
  reduced = matchMedia("(prefers-reduced-motion: reduce)");
  constructor(
    public host: HTMLElement,
    public story = false,
    public groundCanvas?: HTMLCanvasElement,
  ) {
    if (story)
      this.camera = new THREE.OrthographicCamera(
        -0.087,
        0.087,
        0.087,
        -0.087,
        0.001,
        100,
      );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x0b0c0e, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D object. Drag to orbit, shift-drag to pan, scroll to zoom.",
    );
    this.renderer.domElement.setAttribute("role", "img");
    host.append(this.renderer.domElement);
    if (story) {
      this.material.color.set("#f2f1ed");
      this.material.metalness = 0;
    }
    this.scene.add(
      new THREE.HemisphereLight(
        story ? 0xf4f6fa : 0xe7eefb,
        0x34302b,
        story ? 0.9 : 1.8,
      ),
    );
    const key = new THREE.DirectionalLight(story ? 0xffffff : 0xfff6e7, 3.2);
    key.position.set(-0.2, 0.4, 0.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -0.3;
    key.shadow.camera.right = 0.3;
    key.shadow.camera.top = 0.3;
    key.shadow.camera.bottom = -0.3;
    key.shadow.camera.near = 0.01;
    key.shadow.camera.far = 2;
    key.shadow.bias = -0.0001;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(
      story ? 0xf4f5f7 : 0xb5cafa,
      story ? 0.5 : 2,
    );
    rim.position.set(0.2, 0.15, -0.2);
    this.scene.add(rim);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShadowMaterial({ opacity: story ? 0.18 : 0.28 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid = new THREE.GridHelper(1, 40, 0x34383e, 0x202328);
    this.grid.position.y = 0.0001;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.32;
    this.grid.visible = !story;
    this.scene.add(this.grid);
    this.object.add(this.rotated);
    this.rotated.add(this.content);
    this.scene.add(this.object);
    this.createMug();
    if (story) {
      this.material.transparent = true;
      for (const item of this.content.children) {
        if (item instanceof THREE.Mesh) {
          const wire = new THREE.Mesh(item.geometry, this.wireMaterial);
          wire.position.copy(item.position);
          wire.renderOrder = 2;
          this.storyWire.add(wire);
        }
      }
      this.storyWire.scale.copy(this.content.scale);
      this.rotated.add(this.storyWire);
    }
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.reduced.matches;
    this.controls.enabled = !story;
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 1.3;
    this.controls.maxPolarAngle = Math.PI * 0.94;
    this.resetCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    const tick = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(tick);
      if (this.story && !this.needsRender) return;
      this.needsRender = false;
      const current = this.object.scale.x;
      const s =
        this.story || this.reduced.matches
          ? this.targetScale
          : THREE.MathUtils.lerp(current, this.targetScale, 0.13);
      this.object.scale.setScalar(s);
      this.object.position.y = 0;
      this.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.rotated);
      this.object.position.y = -box.min.y;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
  createMug() {
    const points = [
      [0, 0],
      [0.031, 0],
      [0.036, 0.002],
      [0.038, 0.007],
      [0.039, 0.085],
      [0.039, 0.097],
      [0.038, 0.1],
      [0.035, 0.1],
      [0.034, 0.097],
      [0.034, 0.012],
      [0.03, 0.008],
      [0, 0.008],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(points, 96),
      this.material,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    this.content.add(body);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.035, 0.082, 0),
      new THREE.Vector3(0.063, 0.08, 0),
      new THREE.Vector3(0.071, 0.053, 0),
      new THREE.Vector3(0.062, 0.027, 0),
      new THREE.Vector3(0.036, 0.025, 0),
    ]);
    const handle = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 64, 0.006, 20, false),
      this.material,
    );
    handle.castShadow = true;
    handle.receiveShadow = true;
    this.content.add(handle);
    this.normalize(true);
  }
  normalize(demo = false) {
    // Measure source-local geometry, independent of the previous preview's scale/orientation.
    const parent = this.content.parent;
    this.content.removeFromParent();
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.content);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    for (const child of this.content.children) child.position.sub(center);
    if (demo)
      this.content.scale.set(0.12 / size.x, 0.1 / size.y, 0.09 / size.z);
    else this.content.scale.setScalar(0.12 / Math.max(size.x, size.y, size.z));
    this.content.updateMatrixWorld(true);
    parent?.add(this.content);
  }
  bounds(rotation: [number, number, number]): [number, number, number] {
    // Match the backend's Rz * Ry * Rx convention. Full rotated extent is the reference.
    const r = rotation.map(THREE.MathUtils.degToRad);
    const m = new THREE.Matrix4()
      .makeRotationZ(r[2])
      .multiply(new THREE.Matrix4().makeRotationY(r[1]))
      .multiply(new THREE.Matrix4().makeRotationX(r[0]));
    this.rotated.quaternion.setFromRotationMatrix(m);
    this.rotated.updateMatrixWorld(true);
    const size = new THREE.Box3()
      .setFromObject(this.rotated)
      .getSize(new THREE.Vector3());
    const scale = this.object.scale.x || 1;
    return [
      (size.x / scale) * 1000,
      (size.y / scale) * 1000,
      (size.z / scale) * 1000,
    ];
  }
  update(p: Properties) {
    const b = this.bounds(p.rotation);
    this.targetScale = p.length / b[{ x: 0, y: 1, z: 2 }[p.axis]];
    return b;
  }
  setMode(mode: string) {
    this.mode = mode;
    this.content.traverse((n) => {
      if (n instanceof THREE.Mesh) {
        const m = n.material as THREE.MeshStandardMaterial;
        m.wireframe = mode === "mesh";
        m.color.set(mode === "collision" ? "#75a7f8" : "#e5ddc9");
        m.transparent = mode === "collision";
        m.opacity = mode === "collision" ? 0.55 : 1;
      }
    });
  }
  storyProgress(progress: number) {
    if (progress === this.lastStoryProgress) return;
    this.lastStoryProgress = progress;
    this.needsRender = true;
    const state = storyScene(progress);
    this.rotated.rotation.set(0, state.rotation, 0);
    this.targetScale = state.scale;
    this.material.opacity = 1 - state.wire * 0.88;
    this.wireMaterial.opacity = state.wire * 0.7;
  }
  resize() {
    this.needsRender = true;
    const { width, height } = this.host.getBoundingClientRect();
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    if (this.camera instanceof THREE.OrthographicCamera) {
      fitStoryCamera(this.camera, aspect);
      this.drawGround();
    } else {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }
  drawGround() {
    const canvas = this.groundCanvas;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const area = canvas.getBoundingClientRect(),
      view = this.host.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.round(area.width * ratio));
    canvas.height = Math.max(1, Math.round(area.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, area.width, area.height);
    ctx.lineWidth = 0.75;
    this.camera.updateMatrixWorld(true);
    const line = (a: THREE.Vector3, b: THREE.Vector3) => {
      a.applyMatrix4(this.camera.matrixWorldInverse);
      b.applyMatrix4(this.camera.matrixWorldInverse);
      const near = -0.01;
      if (a.z >= near && b.z >= near) return;
      if (a.z >= near) a.lerp(b, (near - a.z) / (b.z - a.z));
      else if (b.z >= near) b.lerp(a, (near - b.z) / (a.z - b.z));
      const depth = Math.max(0.01, -(a.z + b.z) / 2);
      a.applyMatrix4(this.camera.projectionMatrix);
      b.applyMatrix4(this.camera.projectionMatrix);
      const project = (p: THREE.Vector3) => [
        view.left - area.left + (p.x * 0.5 + 0.5) * view.width,
        view.top - area.top + (0.5 - p.y * 0.5) * view.height,
      ];
      const pa = project(a),
        pb = project(b);
      ctx.strokeStyle = `rgba(118,145,177,${0.1 * Math.exp(-depth * 1.1)})`;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    };
    // Project the actual y=0 floor through the mug camera, then expand into the page.
    // This keeps the horizon and vanishing points consistent without another WebGL context.
    for (let i = -80; i <= 80; i++) {
      const p = i * 0.025;
      line(new THREE.Vector3(p, 0, -2), new THREE.Vector3(p, 0, 2));
      line(new THREE.Vector3(-2, 0, p), new THREE.Vector3(2, 0, p));
    }
  }
  resetCamera() {
    this.camera.position.set(0.185, 0.145, 0.28);
    this.controls?.target.set(0, 0.055, 0);
    this.controls?.update();
  }
  async replace(file: File) {
    if (file.size > 30 * 1024 * 1024)
      throw Error("Use a GLB smaller than 30 MiB.");
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (!url.startsWith("data:") && !url.startsWith("blob:"))
        throw Error("Use a self-contained GLB with embedded textures.");
      return url;
    });
    const result = await new GLTFLoader(manager).parseAsync(
      await file.arrayBuffer(),
      "",
    );
    if (this.disposed) {
      this.release(result.scene);
      throw Error("Mesh preview was closed.");
    }
    const box = new THREE.Box3().setFromObject(result.scene);
    if (box.isEmpty() || !Number.isFinite(box.max.length()))
      throw Error("This GLB has no usable geometry.");
    this.release(this.content);
    this.content.clear();
    this.content.scale.setScalar(1);
    this.content.add(result.scene);
    this.normalize();
    this.setMode(this.mode);
  }
  async glb(p: Properties) {
    const snapshot = this.content.clone(true);
    const rotation = new THREE.Group();
    rotation.add(snapshot);
    const r = p.rotation.map(THREE.MathUtils.degToRad);
    rotation.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationZ(r[2])
        .multiply(new THREE.Matrix4().makeRotationY(r[1]))
        .multiply(new THREE.Matrix4().makeRotationX(r[0])),
    );
    rotation.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(rotation);
    const s = b.getSize(new THREE.Vector3());
    const scale =
      p.length / (s.getComponent({ x: 0, y: 1, z: 2 }[p.axis]) * 1000);
    const exportRoot = new THREE.Group();
    exportRoot.add(rotation);
    exportRoot.scale.setScalar(scale);
    exportRoot.position.y = -b.min.y * scale;
    exportRoot.updateMatrixWorld(true);
    // Export solid geometry even if wireframe/collision is selected in the viewer.
    exportRoot.traverse((n) => {
      if (n instanceof THREE.Mesh) {
        const original = n.material as THREE.MeshStandardMaterial;
        n.material = original.clone();
        n.material.wireframe = false;
        n.material.transparent = false;
        n.material.opacity = 1;
        n.material.color.set("#e5ddc9");
      }
    });
    try {
      return (await new GLTFExporter().parseAsync(exportRoot, {
        binary: true,
        onlyVisible: true,
      })) as ArrayBuffer;
    } finally {
      exportRoot.traverse((n) => {
        if (n instanceof THREE.Mesh) (n.material as THREE.Material).dispose();
      });
    }
  }
  release(node: THREE.Object3D) {
    const mats = new Set<THREE.Material>();
    node.traverse((n) => {
      if (n instanceof THREE.Mesh) {
        n.geometry.dispose();
        for (const m of Array.isArray(n.material) ? n.material : [n.material])
          mats.add(m);
      }
    });
    mats.forEach((m) => {
      for (const v of Object.values(m))
        if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.release(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
