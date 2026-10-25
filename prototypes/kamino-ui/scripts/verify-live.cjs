// Local synthetic acceptance only. Start tools/ui_acceptance_server.py first.
const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const evidence = path.resolve(process.env.KAMINO_EVIDENCE_DIR || path.join(root, 'outputs/target-ui-integration'));
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
  const reviewTarget = async note => {
    const save = page.locator('#save-target-review');
    await page.locator('[data-target-island]').first().waitFor({ timeout: 20000 });
    for (const island of await page.locator('[data-target-island]').all()) await island.check();
    await page.locator('#target-review-note').fill(note);
    await page.locator('#target-review-ack').check();
    await save.click();
    await page.getByText(/Target reviewed/).first().waitFor();
  };
  const saveReference = async () => {
    await page.locator('[name=acknowledged]').check();
    await page.locator('#live-preview').click();
    await page.getByText(/Server dimensions: X 80.0 mm/).waitFor();
    await page.locator('#live-save').click();
    await page.waitForFunction(() => document.querySelector('#live-save-status')?.textContent === 'Saved');
  };
  const multipartAcceptance = async () => {
    const code = [
      'import json,hashlib,trimesh',
      'from pathlib import Path',
      'from uuid import uuid4',
      'from datetime import datetime,UTC',
      'from photo2sim.api.store import JobStore',
      'from photo2sim.contracts import JobRecord',
      'store=JobStore(Path("outputs/ui-integration/data")); ident=uuid4(); now=datetime.now(UTC)',
      'mesh=store.job_dir(ident)/"reconstruction/mesh.glb"; mesh.parent.mkdir(parents=True)',
      'scene=trimesh.Scene()',
      'for name,size,x in [("known-target-a",1,-4),("known-target-b",0.5,-2),("known-distractor",3,3)]:',
      '    part=trimesh.creation.box(extents=[size]*3); part.apply_translation([x,0,0]); scene.add_geometry(part,node_name=name)',
      'scene.export(mesh)',
      'store.create(JobRecord(id=ident,status="awaiting_properties",provider="mock",synthetic=True,created_at=now,updated_at=now,mesh_path="reconstruction/mesh.glb",progress=100))',
      'print(json.dumps({"id":str(ident),"source_sha256":hashlib.sha256(mesh.read_bytes()).hexdigest()}))',
    ].join('\n');
    const seeded = spawnSync(path.join(root, '.venv-sim/Scripts/python.exe'), ['-c', code], { cwd: root, encoding: 'utf8' });
    assert.equal(seeded.status, 0, seeded.stderr);
    const fixture = JSON.parse(seeded.stdout.trim());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/?job=${fixture.id}#workspace`);
    await grantToken();
    await page.locator('[data-target-island]').first().waitFor({ timeout: 20000 });
    await page.getByRole('spinbutton', { name: 'X rotation', exact: true }).fill('90');
    await page.locator('#live-save-orientation').click();
    await page.locator('[data-target-island]').first().waitFor();
    const response = await fetch(`${api}/api/jobs/${fixture.id}/geometry`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const inventory = await response.json();
    assert.equal(inventory.islands.length, 3);
    assert.equal(await page.locator('[data-target-island]:checked').count(), 0);
    // This deliberate test choice follows the fixture's known layout, never a product default.
    const ids = inventory.islands.filter(surface => surface.bounds_input_units[1][0] < 0).map(surface => surface.id);
    assert.equal(ids.length, 2);
    for (const id of ids) await page.locator(`[data-target-island][value="${id}"]`).check();
    await page.locator('#target-review-note').fill('Explicit known synthetic multipart target: retain the two left boxes; exclude the right distractor');
    await page.locator('#target-review-ack').check();
    await page.locator('#save-target-review').click();
    await page.getByText(/Target reviewed/).first().waitFor();
    await page.locator('[name=axis]').selectOption('z');
    await page.locator('[name=length]').fill('100');
    await page.locator('[name=description]').fill('Full Z extent of the reviewed synthetic selected surface set; diagnostic estimated reference');
    await page.locator('[name=referenceSource]').selectOption('estimated');
    await page.locator('[name=mass]').fill('0.1');
    await page.locator('[name=massSource]').selectOption('estimated');
    const bind = async () => {
      await page.locator('[name=acknowledged]').check();
      await page.locator('#live-preview').click();
      await page.getByText(/Server dimensions:/).waitFor();
      await page.locator('#live-save').click();
      await page.waitForFunction(() => document.querySelector('#live-save-status')?.textContent === 'Saved');
    };
    await bind();
    await page.locator('#live-generate').click();
    await page.locator('#live-bundle:visible').waitFor({ timeout: 30000 });
    const before = await job(fixture.id);
    const a = await download(page.locator('#live-bundle'), 'multipart-A.zip');
    const shape = spawnSync(path.join(root, '.venv-sim/Scripts/python.exe'), ['-c', 'import io,json,sys,zipfile,trimesh; z=zipfile.ZipFile(sys.argv[1]); meta=json.loads(z.read("asset.json")); mesh=trimesh.load(io.BytesIO(z.read(meta["visual_mesh"])),file_type="obj",process=False); print(json.dumps({"faces":len(mesh.faces)}))', path.join(evidence, 'multipart-A.zip')], { cwd: root, encoding: 'utf8' });
    assert.equal(shape.status, 0, shape.stderr);
    assert.equal(JSON.parse(shape.stdout).faces, 24);
    await page.locator(`[data-target-island][value="${ids[1]}"]`).uncheck();
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    assert.equal(await page.locator('[name=acknowledged]').isChecked(), false);
    assert.equal(await page.locator('[name=length]').inputValue(), '100');
    assert.equal(await page.locator('[name=mass]').inputValue(), '0.1');
    await page.locator('#target-review-note').fill('Corrected diagnostic target: explicitly retain only the first known left box');
    await page.locator('#target-review-ack').check();
    await page.locator('#save-target-review').click();
    await page.getByText(/Target reviewed/).first().waitFor();
    await bind();
    await page.locator('#live-generate').click();
    await page.locator('#live-bundle:visible').waitFor({ timeout: 30000 });
    const after = await job(fixture.id);
    assert.equal(after.geometry_review.island_ids.length, 1);
    assert.notEqual(before.geometry_review.geometry_context_sha256, after.geometry_review.geometry_context_sha256);
    const old = await fetch(`${api}/api/jobs/${fixture.id}/files/${before.bundle_path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(hash(Buffer.from(await old.arrayBuffer())), hash(a));
    await download(page.locator('#live-bundle'), 'multipart-B.zip');
    await page.screenshot({ path: path.join(evidence, 'multipart-corrected.png'), fullPage: true });
    checks.push('Actual synthetic multipart selection retains two smaller boxes, excludes distractor, exports24faces; correction changes context/rebinds reference and preserves earlier ZIP');
    return { ...fixture, selectedBefore: ids, selectedAfter: after.geometry_review.island_ids, contextBefore: before.geometry_review.geometry_context_sha256, contextAfter: after.geometry_review.geometry_context_sha256, attempts: after.attempts.length };
  };
  try {
    await page.goto(`${base}/#upload`);
    await page.locator('#photo-input').setInputFiles(path.join(root, 'frontend/fixtures/synthetic-test.png'));
    assert(await page.locator('#create-mesh').isDisabled());
    await page.getByRole('button', { name: 'Review framing', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[name="width"]')?.value) > 0);
    await page.locator('[name="confirmed"]').check();
    await page.getByRole('button', { name: 'Use this framing' }).click();
    await page.waitForSelector('dialog', { state: 'detached' });
    await page.locator('#create-mesh').click();
    await grantToken();
    assert.equal(await page.locator('.photo-row').count(), 1);
    await page.locator('#create-mesh').click();
    await page.locator('#live-form').waitFor({ timeout: 30000 });
    const id = new URL(page.url()).searchParams.get('job'); assert.ok(id);
    checks.push('Real authenticated multipart upload and mock reconstruction; selected photo retained after 401');
    await page.locator('#live-viewer canvas').waitFor({ timeout: 20000 });
    await page.getByRole('spinbutton', { name: 'X rotation', exact: true }).fill('90');
    await page.locator('#live-save-orientation').click();
    await page.locator('[data-target-island]').first().waitFor({ timeout: 20000 });
    assert.equal(await page.locator('[data-target-island]:checked').count(), 0);
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    checks.push('Saved orientation then source-bound inventory: no target surfaces selected automatically');
    await reviewTarget('Explicit inspection of every surface of the known synthetic cube; not a physical object claim');
    assert.equal(await page.getByRole('spinbutton', { name: 'Mass', exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('spinbutton', { name: 'Friction', exact: true }).inputValue(), '');
    await page.getByRole('combobox', { name: 'Reference axis', exact: true }).selectOption('z');
    await page.getByRole('spinbutton', { name: 'Reference length', exact: true }).fill('80');
    await page.getByRole('textbox', { name: 'Full extent description', exact: true }).fill('Full synthetic cube Z extent; estimated test reference');
    await page.getByRole('combobox', { name: 'Reference source', exact: true }).selectOption('estimated');
    await page.getByRole('spinbutton', { name: 'Mass', exact: true }).fill('0.12');
    await page.getByRole('combobox', { name: 'Mass source', exact: true }).selectOption('estimated');
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    await saveReference();
    const firstSaved = await job(id);
    assert.equal(firstSaved.properties.mass_kg.value, 0.12);
    assert.equal(firstSaved.properties.sliding_friction, null);
    assert.equal(firstSaved.properties.dimensions_m.source, 'estimated');
    assert.deepEqual(firstSaved.sizing_result.scale_factors, Array(3).fill(firstSaved.sizing_result.scale_factors[0]));
    assert.ok(firstSaved.geometry_review);
    assert.equal(firstSaved.properties.geometry_context_sha256, firstSaved.geometry_review.geometry_context_sha256);
    checks.push('Authoritative uniform sizing, honest provenance, null friction and explicit save/process separation');
    await page.locator('#target-review-note').fill('Unsaved target note; must block generation');
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    assert.equal((await job(id)).geometry_review.review_note, firstSaved.geometry_review.review_note);
    await page.locator('#target-review-note').fill(firstSaved.geometry_review.review_note);
    const island = page.locator('[data-target-island]').first();
    await island.uncheck();
    assert.equal(await page.locator('#live-generate').isDisabled(), true);
    assert.equal(await page.locator('[name=acknowledged]').isChecked(), false);
    assert.equal(await page.getByRole('spinbutton', { name: 'Reference length', exact: true }).inputValue(), '80');
    assert.equal(await page.getByRole('spinbutton', { name: 'Mass', exact: true }).inputValue(), '0.12');
    await island.check();
    await reviewTarget(`${firstSaved.geometry_review.review_note}; explicitly rechecked after local selection test`);
    await saveReference();
    checks.push('Unsaved target review blocks Generate; selection changes invalidate correspondence while retaining numeric drafts');
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
    const multipart = await multipartAcceptance();
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    const result = { passed: true, scope: 'actual authenticated local API with synthetic reconstruction and explicitly seeded multipart geometry; no mocked API routes', synthetic: true, job: id, multipart, checks, zipA: hash(a), zipB: hash(b), externalRequests: external, browserErrors: errors };
    fs.writeFileSync(path.join(evidence, 'browser-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(evidence, 'browser-failure.json'), JSON.stringify({ error: error.message, checks, external, errors, url: page.url() }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
