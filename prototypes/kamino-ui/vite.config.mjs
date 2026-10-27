import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleMiddleware } from '../../deploy/railway/example-assets.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
export default {
  root,
  plugins: [{ name: 'complete-example', configureServer(server) { server.middlewares.use(exampleMiddleware); } }],
  cacheDir: path.join(root, '.cache/vite'),
  resolve: { dedupe: ['three'] },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  test: { include: ['src/*.test.ts'], cache: false },
};
