import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5189';
let server;
try {
  if (!process.env.KAMINO_BASE_URL) {
    const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
    server = spawn(process.execPath, [viteBin, 'preview', '--configLoader', 'native', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { cwd: root, stdio: 'inherit', windowsHide: true });
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (server.exitCode !== null) throw new Error('Preview server could not start. Check whether port 5189 is available.');
      try { ready = (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (!ready) await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!ready) throw new Error('Preview server did not become ready within 15 seconds.');
  }
  for (const file of ['browser-check.cjs', 'home-check.cjs', 'home-mobile-check.cjs', 'appearance-check.cjs', 'pause-check.cjs']) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [file], { cwd: root, env: { ...process.env, KAMINO_BASE_URL: baseUrl }, stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
    if (code !== 0) throw new Error(`${file} failed with exit code ${code}.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server?.kill();
}
