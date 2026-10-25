export type Axis = "x" | "y" | "z";
export type Properties = {
  length: number;
  axis: Axis;
  mass: number;
  friction: number | null;
  rotation: [number, number, number];
};
export type Revision = {
  id: number;
  created: string;
  properties: Properties;
  meshIdentity: number;
};
export const defaults = (): Properties => ({
  length: 120,
  axis: "x",
  mass: 0.34,
  friction: 0.55,
  rotation: [0, 0, 0],
});
export const copy = <T>(value: T): T => structuredClone(value);
export function validateProperties(p: Properties): string | null {
  if (!Number.isFinite(p.length) || p.length <= 0 || p.length > 100000)
    return "Known length must be greater than 0 and at most 100,000 mm.";
  if (!["x", "y", "z"].includes(p.axis)) return "Choose a reference axis.";
  if (!Number.isFinite(p.mass) || p.mass <= 0)
    return "Mass must be a positive number in kilograms.";
  if (p.friction !== null && (!Number.isFinite(p.friction) || p.friction < 0))
    return "Friction must be zero or greater, or blank if unknown.";
  if (
    p.rotation.length !== 3 ||
    p.rotation.some((v) => !Number.isFinite(v) || Math.abs(v) > 180)
  )
    return "Orientation must be between −180° and 180°.";
  return null;
}
// Same 1–4 / MIME / 10 MiB boundary as the existing frontend validator.
export function validatePhotos(
  files: Pick<File, "type" | "size">[],
): string | null {
  if (!files.length || files.length > 4)
    return "Choose 1–4 photos of the same object.";
  if (
    files.some(
      (f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type),
    )
  )
    return "Use JPEG, PNG or WebP images.";
  if (files.some((f) => f.size > 10 * 1024 * 1024))
    return "Each photo must be at most 10 MiB.";
  return null;
}
export function dimensions(
  p: Properties,
  bounds: [number, number, number] = [120, 100, 90],
): [number, number, number] {
  const index = { x: 0, y: 1, z: 2 }[p.axis];
  const factor = p.length / bounds[index];
  return bounds.map((v) => v * factor) as [number, number, number];
}
export function saveRevision(
  p: Properties,
  previous: Revision[],
  meshIdentity: number,
): Revision {
  const error = validateProperties(p);
  if (error) throw new Error(error);
  return {
    id: (previous.at(-1)?.id ?? 0) + 1,
    created: new Date().toISOString(),
    properties: copy(p),
    meshIdentity,
  };
}
export function backendProperties(
  p: Properties,
  bounds: [number, number, number],
) {
  const [x, y, z] = dimensions(p, bounds).map((v) => v / 1000);
  return {
    dimensions_m: { x, y, z, source: "user_supplied" },
    mass_kg: { value: p.mass, source: "user_supplied" },
    sliding_friction:
      p.friction === null
        ? null
        : { value: p.friction, source: "user_supplied" },
    sizing: {
      mode: "uniform",
      reference: {
        axis: p.axis,
        length: p.length,
        unit: "mm",
        correspondence: "full_mesh_extent",
        source: "user_supplied",
        description: "Full reviewed mesh extent, including protrusions",
      },
      reviewed_orientation: {
        x_deg: p.rotation[0],
        y_deg: p.rotation[1],
        z_deg: p.rotation[2],
      },
    },
  };
}
export function zipStore(
  files: { name: string; bytes: Uint8Array }[],
): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const crc = (bytes: Uint8Array) => {
    let c = -1;
    for (const b of bytes) {
      c ^= b;
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ -1) >>> 0;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const sum = crc(f.bytes);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint32(14, sum, true);
    l.setUint32(18, f.bytes.length, true);
    l.setUint32(22, f.bytes.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, sum, true);
    d.setUint32(20, f.bytes.length, true);
    d.setUint32(24, f.bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    chunks.push(local, f.bytes);
    central.push(dir);
    offset += local.length + f.bytes.length;
  }
  const size = central.reduce((s, a) => s + a.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + 22);
  let pos = 0;
  for (const c of [...chunks, ...central, end]) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}
