import { describe, it, expect } from "vitest";
import {
  defaults,
  validatePhotos,
  validateProperties,
  dimensions,
  saveRevision,
  backendProperties,
  zipStore,
} from "./workflow";
describe("Kamino prototype workflow", () => {
  it("accepts the three demo photo formats", () =>
    expect(
      validatePhotos(
        ["image/jpeg", "image/png", "image/webp"].map((type) => ({
          type,
          size: 30,
        })),
      ),
    ).toBeNull());
  it("rejects empty, excessive, oversized and unsupported selections", () => {
    const p = { type: "image/jpeg", size: 1 };
    for (const f of [
      [],
      Array(5).fill(p),
      [{ ...p, size: 11 * 1024 * 1024 }],
      [{ ...p, type: "text/html" }],
    ])
      expect(validatePhotos(f)).toBeTruthy();
  });
  it("uniformly scales from each chosen axis", () => {
    expect(dimensions({ ...defaults(), length: 132 })).toEqual([
      132, 110.00000000000001, 99.00000000000001,
    ]);
    expect(dimensions({ ...defaults(), axis: "y", length: 200 })).toEqual([
      240, 200, 180,
    ]);
  });
  it("rejects invalid physical values and allows unknown friction", () => {
    for (const p of [
      { length: 0 },
      { mass: -1 },
      { friction: -1 },
      { rotation: [0, 181, 0] },
      { length: NaN },
    ])
      expect(validateProperties({ ...defaults(), ...p } as any)).toBeTruthy();
    expect(validateProperties({ ...defaults(), friction: null })).toBeNull();
  });
  it("keeps saved revisions immutable when drafts change", () => {
    const p = defaults();
    const r = saveRevision(p, [], 1);
    p.rotation[0] = 30;
    p.mass = 2;
    expect(r.properties.mass).toBe(0.34);
    expect(r.properties.rotation[0]).toBe(0);
    expect(saveRevision(p, [r], 1).id).toBe(2);
  });
  it("blocks invalid revisions", () =>
    expect(() => saveRevision({ ...defaults(), length: 0 }, [], 1)).toThrow());
  it("maps mm and degrees into the backend contract without applying estimates", () => {
    const p = backendProperties(defaults(), [120, 100, 90]);
    expect(p.dimensions_m).toMatchObject({ x: 0.12, y: 0.1, z: 0.09 });
    expect(p.sizing.mode).toBe("uniform");
    expect(p.sizing.reference.correspondence).toBe("full_mesh_extent");
    expect(p.mass_kg.source).toBe("user_supplied");
  });
  it("writes ZIP local/central/end records with explicit prototype contents", () => {
    const z = zipStore([
      { name: "README.txt", bytes: new TextEncoder().encode("Prototype only") },
    ]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(new TextDecoder().decode(z)).toContain("Prototype only");
  });
});
