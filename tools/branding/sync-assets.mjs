// Production SVG/PNG artwork is checked in; no renderer/font install is needed to build.
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = path.join(root, "frontend/src/brand/assets");
const check = process.argv.includes("--check");
let count = 0;
for (const app of ["frontend", "prototypes/kamino-ui"]) {
  const publicDir = path.join(root, app, "public");
  for (const name of (await readdir(source)).sort()) {
    const data = await readFile(path.join(source, name));
    const targets = [path.join(publicDir, "brand", name)];
    if (
      [
        "favicon.svg",
        "favicon.png",
        "favicon.ico",
        "apple-touch-icon.png",
        "site.webmanifest",
      ].includes(name)
    )
      targets.push(path.join(publicDir, name));
    for (const target of targets) {
      if (check) {
        let current;
        try {
          current = await readFile(target);
        } catch {}
        if (!current?.equals(data))
          throw Error(
            `Missing or stale brand asset: ${path.relative(root, target)}`,
          );
      } else {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, data);
      }
      count++;
    }
  }
}
if (!process.argv.includes("--frontend-only")) {
  const exportMark = path.join(root, "src/photo2sim/simulation/brand.svg");
  const markData = await readFile(path.join(source, "kamino-mark-blue.svg"));
  if (check) {
    if (!(await readFile(exportMark)).equals(markData))
      throw Error("Stale portable export logo");
  } else await writeFile(exportMark, markData);
}
console.log(
  `${check ? "Verified" : "Synced"} ${count} frontend brand assets; portable logo included unless --frontend-only.`,
);
