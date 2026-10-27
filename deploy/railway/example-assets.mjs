// A deliberate allowlist shared by development and production packaging.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

export const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../examples/assemblies/hinged-panel');
export const exampleFiles = [
  ['simulation.zip', 'simulation.zip'], ['SHA256SUMS', 'SHA256SUMS'],
  ['input/post.obj', 'post.obj'], ['input/panel.obj', 'panel.obj'],
  ['evidence/revision-0003.json', 'reviewed-project.json'],
  ['evidence/download-validation.json', 'validation.json'],
];

export function exampleMiddleware(request, response, next) {
  if (!['GET', 'HEAD'].includes(request.method)) return next();
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = exampleFiles.find(([, name]) => pathname === '/examples/hinged-panel/' + name);
  if (!file) return next();
  readFile(path.join(exampleRoot, file[0])).then(bytes => {
    const type = file[1].endsWith('.zip') ? 'application/zip' : file[1].endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8';
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  }).catch(next);
}
