import { OrthographicCamera } from "three";

// Product presentation uses parallel verticals so an off-centre mug cannot appear to lean.
export function fitStoryCamera(camera: OrthographicCamera, aspect: number) {
  const halfHeight = 0.087 / Math.min(Math.max(aspect, 0.1), 1);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.position.set(0, 0.155, 0.35);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.055, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
