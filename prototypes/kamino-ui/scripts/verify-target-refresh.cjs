// Explicitly MOCKED browser source/inventory races. No server mutation/provider calls.
// Run verify-live.cjs first to create a fixture-backed reviewed job.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const evidence = path.resolve(process.env.KAMINO_EVIDENCE_DIR || path.join(root, 'outputs/target-ui-integration'));
const base = process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5188';
const api = process.env.KAMINO_API_URL || 'http://127.0.0.1:8001';
const token = 'ui-acceptance-only';
const headers = { Authorization: `Bearer ${token}` };
const output = { mocked: true, scope: 'browser-only delayed GET job/inventory transport; no actual source replacement or backend writes', cases: [], externalRequests: [], unexpectedMutations: [], browserErrors: [] };

async function json(url) {
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  return response.json();
}
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const live = JSON.parse(fs.readFileSync(path.join(evidence, 'browser-results.json'), 'utf8'));
  assert.equal(live.passed, true);
  const id = process.env.KAMINO_TEST_JOB || live.job;
  const saved = await json(`${api}/api/jobs/${id}`);
  assert.ok(saved.geometry_review && saved.properties?.geometry_context_sha256);
  const inventory = await json(`${api}/api/jobs/${id}/geometry?preview=true`);
  // The mock supplies an otherwise-current, process-eligible stage. Backend state stays untouched.
  const metadata = { ...saved, status: 'awaiting_properties', error: null };
  const changed = { ...inventory, source_mesh_sha256: 'e'.repeat(64) };
  const executable = process.env.KAMINO_BROWSER_EXECUTABLE || process.env.KAMINO_BROWSER;
  const browser = await chromium.launch({ ...(executable ? { executablePath: executable } : {}), headless: true, args: ['--enable-unsafe-swiftshader'] });
  const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    for (const scenario of ['stale-first', 'fresh-first', 'fresh-failure', 'draft-retention']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('pageerror', error => output.browserErrors.push({ scenario, message: error.message }));
      let requests = 0;
      const pending = new Map();
      const waitRequest = async number => {
        for (let n = 0; n < 200; n++) {
          if (pending.has(number)) return pending.get(number);
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error(`${scenario}: no forced inventory request ${number}`);
      };
      const fulfil = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
          output.externalRequests.push(url.origin); return route.abort();
        }
        if (url.pathname.startsWith('/api/') && !['GET', 'OPTIONS'].includes(request.method())) {
          output.unexpectedMutations.push({ scenario, method: request.method(), path: url.pathname });
          return route.abort();
        }
        // Let initial unauthorized requests exercise the real application-token prompt.
        if (request.headers().authorization !== headers.Authorization) return route.continue();
        if (url.pathname === `/api/jobs/${id}`) return fulfil(route, metadata);
        if (url.pathname === `/api/jobs/${id}/geometry`) {
          requests++;
          if (requests === 1) return fulfil(route, inventory);
          pending.set(requests, route);
          return;
        }
        return route.continue();
      });
      try {
        await page.goto(`${base}/?job=${id}#workspace`);
        await page.getByRole('textbox', { name: 'Application access token', exact: true }).fill(token);
        await page.getByRole('button', { name: 'Use token', exact: true }).click();
        await page.locator('#target-review-status').waitFor({ timeout: 20000 });
        await page.waitForFunction(() => !document.querySelector('#live-generate')?.disabled);
        const initialMass = await page.locator('[name=mass]').inputValue();
        if (scenario === 'draft-retention') {
          await page.locator('[name=mass]').fill('0.93');
          await page.locator('#target-review-note').fill('Retain this unsaved review note across forced refresh');
        }
        await page.locator('#live-retry').click();
        const old = await waitRequest(2);
        assert.equal(await page.locator('#live-generate').isDisabled(), true);
        // A forced inventory refresh must supersede an already pending inventory request.
        await page.locator('#live-retry').click({ timeout: 5000 });
        const fresh = await waitRequest(3);
        if (scenario === 'stale-first') {
          await fulfil(old, inventory); await frame(page);
          assert.equal(await page.locator('#live-generate').isDisabled(), true);
          await fulfil(fresh, changed);
        } else {
          await fulfil(fresh, scenario === 'draft-retention' ? inventory : scenario === 'fresh-failure' ? { detail: 'Deliberate mocked inventory outage' } : changed, scenario === 'fresh-failure' ? 503 : 200);
          await frame(page);
          await fulfil(old, scenario === 'draft-retention' ? changed : inventory);
        }
        await frame(page);
        if (scenario === 'draft-retention') {
          assert.equal(await page.locator('[name=mass]').inputValue(), '0.93');
          assert.equal(await page.locator('#target-review-note').inputValue(), 'Retain this unsaved review note across forced refresh');
          assert.ok(await page.locator('[data-target-island]:checked').count() > 0);
        } else if (scenario !== 'fresh-failure') {
          await page.waitForFunction(() => document.querySelectorAll('[data-target-island]:checked').length === 0);
          assert.equal(await page.locator('[name=mass]').inputValue(), initialMass);
          assert.equal(await page.locator('[name=acknowledged]').isChecked(), false);
        }
        assert.equal(await page.locator('#live-generate').isDisabled(), true);
        const reason = await page.locator('#target-review-status').innerText();
        if (scenario === 'fresh-failure') assert.match(reason, /outage|503|failed|error/i);
        await page.screenshot({ path: path.join(evidence, `mocked-refresh-${scenario}.png`), fullPage: true });
        output.cases.push({ scenario, passed: true, inventoryRequests: requests, reason });
      } finally { await page.close(); }
    }
    assert.deepEqual(output.externalRequests, []);
    assert.deepEqual(output.unexpectedMutations, []);
    assert.deepEqual(output.browserErrors, []);
    output.passed = true;
  } catch (error) {
    output.passed = false; output.error = error.message; throw error;
  } finally {
    fs.writeFileSync(path.join(evidence, 'mocked-target-refresh-results.json'), JSON.stringify(output, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(output, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
