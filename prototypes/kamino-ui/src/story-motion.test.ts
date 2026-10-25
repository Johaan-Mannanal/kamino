import { it, expect } from "vitest";
import { chooseChapter, settle, storyScene } from "./story-motion";
it("responds to the first scroll without a stationary lead-in", () => {
  expect(storyScene(0.02).rotation).toBeGreaterThan(0);
  expect(settle(0, 0.1, 16)).toBeGreaterThan(0);
});
it("keeps a readable caption selected at every intermediate position", () => {
  let active = 0;
  for (let p = 0; p <= 4; p += 0.01) {
    active = chooseChapter(p, active);
    expect(active).toBeGreaterThanOrEqual(0);
    expect(active).toBeLessThanOrEqual(4);
  }
  expect(chooseChapter(0.5, 0)).toBe(0);
  expect(chooseChapter(0.5, 1)).toBe(1);
  expect(chooseChapter(0.61, 0)).toBe(1);
  expect(chooseChapter(0.45, 1)).toBe(0);
});
it("has no rotation, material or scale jump across former chapter boundaries", () => {
  for (const p of [1, 2, 3]) {
    const a = storyScene(p - 0.0001),
      b = storyScene(p + 0.0001);
    expect(Math.abs(a.rotation - b.rotation)).toBeLessThan(0.001);
    expect(Math.abs(a.wire - b.wire)).toBeLessThan(0.001);
    expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.001);
  }
});
it("reverses the exact scene and text state when scrolling back", () => {
  const saved = storyScene(1.3);
  storyScene(3);
  expect(storyScene(1.3)).toEqual(saved);
  expect(chooseChapter(0, 4)).toBe(0);
});
it("settles independently of display frame rate", () => {
  let a = 0,
    b = 0;
  for (let i = 0; i < 60; i++) a = settle(a, 1, 1000 / 60);
  for (let i = 0; i < 120; i++) b = settle(b, 1, 1000 / 120);
  expect(a).toBeCloseTo(b, 8);
});
it("finishes the larger opening pose before any capture elements appear", () => {
  expect(storyScene(0).hero).toBe(1);
  let active = 0;
  for (let p = 0; p <= 4; p += 0.01) {
    active = chooseChapter(p, active);
    if (active === 1) expect(storyScene(p).hero).toBe(0);
  }
});
