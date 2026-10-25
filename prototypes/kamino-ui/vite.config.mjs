import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export default {
  root,
  cacheDir: path.join(root, '.cache/vite'),
  resolve: { dedupe: ['three'] },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  test: { include: ['src/*.test.ts'], cache: false },
};
