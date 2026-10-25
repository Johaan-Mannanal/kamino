export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, v));
export function smoothstep(lo: number, hi: number, value: number) {
  const t = clamp((value - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}
// Frame-rate-independent settling: follows the wheel immediately without snapping on fast input.
export function settle(current: number, target: number, deltaMs: number) {
  return (
    current + (target - current) * (1 - Math.exp(-Math.min(deltaMs, 64) / 55))
  );
}
export function chooseChapter(progress: number, previous: number) {
  const p = clamp(progress, 0, 4);
  if (previous < 0) return Math.round(p);
  let next = previous;
  // A small hysteresis band prevents trackpad jitter from repeatedly changing captions.
  while (next < 4 && p > next + 0.58) next++;
  while (next > 0 && p < next - 0.52) next--;
  return next;
}
export function storyScene(progress: number) {
  const p = clamp(progress, 0, 4);
  return {
    hero: 1 - smoothstep(0, 0.45, p),
    rotation: p * Math.PI * 0.5,
    wire: smoothstep(1.45, 2, p) * (1 - smoothstep(2.45, 3, p)),
    scale: 1 + 0.1 * smoothstep(2.65, 3.35, p),
  };
}
