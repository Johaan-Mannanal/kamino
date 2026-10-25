import { OrthographicCamera, Vector3 } from "three";
import { it, expect } from "vitest";
import { fitStoryCamera } from "./story-camera";

it("keeps the mug upright across the frame and at different screen proportions", () => {
  for (const aspect of [0.6, 1, 1.5]) {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
    fitStoryCamera(camera, aspect);
    const leftRim = new Vector3(-.03,.1,0).project(camera);
    const rightRim = new Vector3(.03,.1,0).project(camera);
    expect(leftRim.y).toBeCloseTo(rightRim.y,10);
    for (const x of [-0.05, 0, 0.05]) {
      const bottom = new Vector3(x, 0, 0).project(camera);
      const top = new Vector3(x, 0.1, 0).project(camera);
      expect(top.x).toBeCloseTo(bottom.x, 10);
      expect(top.y).toBeGreaterThan(bottom.y);
    }
  }
});
