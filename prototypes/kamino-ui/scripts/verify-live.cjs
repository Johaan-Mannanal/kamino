// Local synthetic acceptance only. Start tools/ui_acceptance_server.py first.
const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const evidence = path.join(root, 'outputs/ui-integration');
const base = process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5188';
const api = process.env.KAMINO_API_URL || 'http://127.0.0.1:8001';
const token = 'ui-acceptance-only';
const checks = [];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const executable = process.env.KAMINO_BROWSER_EXECUTABLE || process.env.KAMINO_BROWSER;
  const browser = await chromium.launch({
    ...(executable ? { executablePath: executable } : {}),
    headless: true, args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const external = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.origin); return route.abort();
    }
    return route.continue();
  });
  const grantToken = async () => {
    await page.getByRole('textbox', { name: 'Application access token', exact: true }).fill(token);
    await page.getByRole('button', { name: 'Use token', exact: true }).click();
  };
  const job = async id => {
    const response = await fetch(`${api}/api/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); return response.json();
  };
  const download = async (selector, name) => {
    const event = page.waitForEvent('download'); await selector.click();
    const file = await event; const target = path.join(evidence, name); await file.saveAs(target);
    const bytes = fs.readFileSync(target); assert.equal(bytes.subarray(0, 2).toString(), 'PK'); return bytes;
  };
  try {
    await page.goto(`${base}/#upload`);
    await page.locator('#photo-input').setInputFiles(path.join(root, 'frontend/fixtures/synthetic-test.png'));
    await page.locator('#create-mesh').click();
    await grantToken();
    assert.equal(await page.locator('.photo-row').count(), 1);
    await page.locator('#create-mesh').click();
    await page.locator('#live-form').waitFor({ timeout: 30000 });
    const id = new URL(page.url()).searchParams.get('job'); assert.ok(id);
    checks.push('Real authenticated multipart upload and mock reconstruction; selected photo retained after 401');
    await page.locator('#live-viewer canvas').waitFor({ timeout: 20000 });
    assert.equal(await page.getByRole('spinbutton', { name: 'Mass', exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('spinbutton', { name: 'Friction', exact: true }).inputValue(), '');
    await page.getByRole('combobox', { name: 'Reference axis', exact: true }).selectOption('z');
    await page.getByRole('spinbutton', { name: 'Reference length', exact: true }).fill('80');
    await page.getByRole('textbox', { name: 'Full extent description', exact: true }).fill('Full synthetic cube Z extent; estimated test reference');
    await page.getByRole('combobox', { name: 'Reference source', exact: true }).selectOption('estimated');
    await page.locator('[name=acknowledged]').check();
    await page.getByRole('spinbutton', { name: 'Mass', exact: true }).fill('0.12');
    await page.getByRole('combobox', { name: 'Mass source', exact: true }).selectOption('estimated');
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    await page.locator('#live-preview').click();
    await page.getByText(/Server dimensions: X 80.0 mm/).waitFor();
    await page.locator('#live-save').click();
    await page.waitForFunction(() => document.querySelector('#live-save-status')?.textContent === 'Saved');
    const firstSaved = await job(id);
    assert.equal(firstSaved.properties.mass_kg.value, 0.12);
    assert.equal(firstSaved.properties.sliding_friction, null);
    assert.equal(firstSaved.properties.dimensions_m.source, 'estimated');
    assert.deepEqual(firstSaved.sizing_result.scale_factors, Array(3).fill(firstSaved.sizing_result.scale_factors[0]));
    checks.push('Authoritative uniform sizing, honest provenance, null friction and explicit save/process separation');
    await page.locator('#live-generate').click();
    await page.locator('#live-bundle:visible').waitFor({ timeout: 30000 });
    const a = await download(page.locator('#live-bundle'), 'browser-A.zip');
    const first = await job(id); assert.equal(first.status, 'completed');
    checks.push('Real local preparation/validation and authenticated MuJoCo ZIP download');
    const seeded = spawnSync(path.join(root, '.venv-sim/Scripts/python.exe'), ['tools/ui_acceptance_server.py', '--seed-job', id], { cwd: root, encoding: 'utf8' });
    assert.equal(seeded.status, 0, seeded.stderr);
    await page.locator('.live-suggestions summary').click();
    await page.locator('#live-suggest').click();
    await page.locator('#live-apply').waitFor();
    assert.equal(await page.getByRole('spinbutton', { name: 'Mass', exact: true }).inputValue(), '0.12');
    const suggestionText = await page.locator('#live-suggestions').innerText();
    assert.match(suggestionText, /estimated/i); assert.match(suggestionText, /synthetic/i);
    assert.ok(await page.locator('#live-suggestions ul').count() >= 2);
    await page.locator('[name=sg-mass]').check();
    await page.locator('#live-apply').click();
    assert.equal((await job(id)).properties.mass_kg.value, 0.12);
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    await page.locator('#live-save').click();
    await page.waitForFunction(() => document.querySelector('#live-save-status')?.textContent === 'Saved');
    checks.push('Cached Gemini notes/questions visible; reading preserves draft, explicit Apply remains unsaved until Save');
    await page.locator('#live-suggest-refresh').click();
    await page.getByText(/Category: not configured/).waitFor();
    assert.equal(await page.getByRole('spinbutton', { name: 'Mass', exact: true }).isEnabled(), true);
    checks.push('Unavailable Gemini preserves manual entry and sanitized category; no external request');
    await page.locator('#live-generate').click();
    await page.locator('#live-bundle:visible').waitFor({ timeout: 30000 });
    const b = await download(page.locator('#live-bundle'), 'browser-B.zip');
    const second = await job(id); assert.equal(second.attempts.length, 2);
    assert.notEqual(first.bundle_path, second.bundle_path);
    const historical = await fetch(`${api}/api/jobs/${id}/files/${first.bundle_path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(hash(Buffer.from(await historical.arrayBuffer())), hash(a));
    checks.push('Regeneration retains immutable earlier bundle bytes and distinct attempts');
    await page.screenshot({ path: path.join(evidence, 'workspace-desktop.png'), fullPage: true });
    await page.reload(); await grantToken(); await page.locator('#live-form').waitFor();
    assert.equal((await job(id)).properties.mass_kg.value, second.properties.mass_kg.value);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(evidence, 'workspace-mobile.png'), fullPage: true });
    checks.push('Saved job reopens by URL with token reentry; mobile layout has no horizontal overflow');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    const result = { passed: true, synthetic: true, job: id, checks, zipA: hash(a), zipB: hash(b), externalRequests: external, browserErrors: errors };
    fs.writeFileSync(path.join(evidence, 'browser-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(evidence, 'browser-failure.json'), JSON.stringify({ error: error.message, checks, external, errors, url: page.url() }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
