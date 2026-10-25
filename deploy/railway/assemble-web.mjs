// Combine both production builds; the new workflow owns index.html.
// Fail rather than silently overwrite an assembly asset with different bytes.
import { readdir, readFile, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';

const [legacy, modern, destination] = process.argv.slice(2);
if (!legacy || !modern || !destination) throw new Error('Expected legacy-dist modern-dist empty-destination');
async function files(root, prefix = '') {
  const found = [];
  for (const item of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) found.push(...await files(root, relative));
    else if (item.isFile()) found.push(relative);
    else throw new Error(`Unsupported build entry: ${relative}`);
  }
  return found.sort();
}
await mkdir(destination, { recursive: true });
if ((await readdir(destination)).length) throw new Error('Destination must be empty');
await access(path.join(legacy, 'assembly.html'));
await access(path.join(modern, 'index.html'));
const oldFiles = await files(legacy);
const newFiles = await files(modern);
const oldSet = new Set(oldFiles);
for (const file of newFiles) {
  if (!oldSet.has(file) || file === 'index.html') continue;
  const [a, b] = await Promise.all([readFile(path.join(legacy, file)), readFile(path.join(modern, file))]);
  if (!a.equals(b)) throw new Error(`Conflicting assembly/UI asset: ${file}`);
}
for (const [root, entries] of [[legacy, oldFiles], [modern, newFiles]]) {
  for (const file of entries) {
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
}
console.log(JSON.stringify({ legacyFiles: oldFiles.length, modernFiles: newFiles.length, rootOwner: 'prototypes/kamino-ui', assemblyRetained: true }));
