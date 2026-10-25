// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { cropFile, validateCrop, type CropRect } from "./photo-review";

const full: CropRect = { x: 0, y: 0, width: 400, height: 300 };
it("rejects empty, fractional, nonfinite and out-of-image crops", () => {
  expect(validateCrop(full, 400, 300)).toBeNull();
  for (const crop of [
    { ...full, width: 0 }, { ...full, x: -1 }, { ...full, x: 1 },
    { ...full, height: NaN }, { ...full, x: 0.5 },
  ]) expect(validateCrop(crop, 400, 300)).toBeTruthy();
});

it("keeps the exact original file for a confirmed full-frame image", async () => {
  const original = new File(["original bytes"], "view.jpg", { type: "image/jpeg" });
  const image = { naturalWidth: 400, naturalHeight: 300 } as HTMLImageElement;
  expect(await cropFile(original, image, full)).toBe(original);
});

it("exports the selected source rectangle without stretching or resampling", async () => {
  const original = new File(["original"], "view.jpg", { type: "image/jpeg" });
  const image = { naturalWidth: 400, naturalHeight: 300 } as HTMLImageElement;
  const draw = vi.fn();
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as never);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) {
    expect(this.width).toBe(100); expect(this.height).toBe(150);
    callback(new Blob(["png"], { type: "image/png" }));
  });
  try {
    const result = await cropFile(original, image, { x: 20, y: 30, width: 100, height: 150 });
    expect(draw).toHaveBeenCalledWith(image, 20, 30, 100, 150, 0, 0, 100, 150);
    expect(result.name).toBe("view-crop.png");
    expect(result.type).toBe("image/png");
    expect(original.size).toBe(8);
  } finally { context.mockRestore(); encode.mockRestore(); }
});

it("rejects oversized or failed encoding instead of silently reducing image quality", async () => {
  const original = new File(["original"], "view.jpg");
  const image = { naturalWidth: 400, naturalHeight: 300 } as HTMLImageElement;
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)])));
  try {
    await expect(cropFile(original, image, { ...full, width: 100 })).rejects.toThrow("10 MiB");
    encode.mockImplementation(callback => callback(null));
    await expect(cropFile(original, image, { ...full, width: 100 })).rejects.toThrow("encode");
  } finally { context.mockRestore(); encode.mockRestore(); }
});
