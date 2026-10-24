import { stripTypeScriptTypes } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, '.preview')
mkdirSync(out, { recursive: true })
for (const name of ['lean', 'api', 'mock', 'properties', 'types']) {
  let source = readFileSync(resolve(root, 'src', `${name}.ts`), 'utf8')
  source = stripTypeScriptTypes(source)
    .replaceAll(/from '(\.\/[^']+)'/g, (_match, path) => `from '${path}.js'`)
    .replaceAll("import './lean.css'", '')
    .replaceAll('import.meta.env.VITE_API_BASE_URL', "'http://127.0.0.1:8000'")
    .replaceAll('import.meta.env.VITE_API_MODE', "'mock'")
  writeFileSync(resolve(out, `${name}.js`), source)
}
writeFileSync(resolve(out, 'lean.css'), readFileSync(resolve(root, 'src/lean.css')))
writeFileSync(resolve(out, 'index.html'), readFileSync(resolve(root, 'index.html'), 'utf8').replace('/src/lean.ts', '/lean.js').replace('</head>', '<link rel="stylesheet" href="/lean.css"/></head>'))
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
if (process.argv.includes('--build-only')) process.exit(0)
createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url
  if (!/^\/[\w.-]+$/.test(path)) { res.writeHead(404).end(); return }
  const extension = path.slice(path.lastIndexOf('.'))
  try { res.writeHead(200, { 'Content-Type': mime[extension] || 'text/plain' }).end(readFileSync(resolve(out, path.slice(1)))) }
  catch { res.writeHead(404).end() }
}).listen(5173, '127.0.0.1', () => console.log('Photo2Sim source preview: http://127.0.0.1:5173'))
