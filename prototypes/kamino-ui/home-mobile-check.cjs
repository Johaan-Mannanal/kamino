const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseUrl = (process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5188').replace(/\/$/, '');
const outDir = process.env.KAMINO_EVIDENCE_DIR || path.join(__dirname, 'evidence', 'generated');
(async () => {
  const browser = await chromium.launch({
    ...(process.env.KAMINO_BROWSER_EXECUTABLE ? { executablePath: process.env.KAMINO_BROWSER_EXECUTABLE } : {}),
    headless: true, args: ['--enable-unsafe-swiftshader'],
  });
  const errors = [];
  let checks = 0;
  const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS ' + message); };
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl + '/');
    await page.waitForSelector('#story-viewer canvas', { timeout: 5000 });
    check(await page.locator('.static-home').count() === 0, 'touch mobile uses the scroll narrative');
    check(await page.locator('.story-sticky').evaluate(node => getComputedStyle(node).position === 'sticky'), 'mobile stage stays pinned during native scrolling');
    // Start over the decorative WebGL canvas: it must not capture the gesture.
    const canvas = await page.locator('#story-viewer canvas').boundingBox();
    assert.ok(canvas);
    const cdp = await context.newCDPSession(page);
    const x = canvas.x + canvas.width / 2;
    const startY = Math.min(700, canvas.y + canvas.height * 0.8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - i * 25 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => scrollY > 40 && Number(document.querySelector('#story').dataset.progress) > 0.05);
    check(true, 'a native touch swipe over the object advances the narrative');
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('#story').style.getPropertyValue('--story-travel')) / 4 - Math.max(320, document.querySelector('.story-sticky').getBoundingClientRect().height * 0.62)) < 0.1);
      await page.evaluate(() => window.scrollTo(0, 0));
      const distance = await page.locator('#story').evaluate(node => parseFloat(node.style.getPropertyValue('--story-travel')) / 4);
      for (const chapter of [1, 2, 3, 4, 0]) {
        await page.evaluate(y => window.scrollTo(0, y), distance * chapter);
        await page.waitForFunction(p => Math.abs(Number(document.querySelector('#story').dataset.progress) - p) < 0.005, chapter);
        await page.waitForTimeout(300);
        const layout = await page.evaluate(() => {
          const rect = selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          };
          const r = document.querySelector('.story-panel[aria-hidden="false"]').getBoundingClientRect();
          return { width: document.documentElement.scrollWidth, viewportWidth: innerWidth, viewportHeight: innerHeight,
            panel: { top: r.top, bottom: r.bottom, right: r.right }, canvas: rect('#story-viewer'), photos: rect('#capture-thumbs'),
            phone: rect('#capture-phone'), controls: rect('.story-bottom'), stage: rect('.story-stage'),
            visible: document.querySelectorAll('.story-panel[aria-hidden="false"]').length,
            hiddenPanelsInert: [...document.querySelectorAll('.story-panel[aria-hidden="true"]')].every(node => node.inert),
          };
        });
        const label = `${viewport.width}x${viewport.height}, chapter ${chapter}`;
        check(layout.width <= layout.viewportWidth && layout.stage.right <= layout.viewportWidth, `no horizontal overflow at ${label}`);
        check(layout.visible === 1 && layout.hiddenPanelsInert, `one accessible chapter at ${label}`);
        check(layout.panel.top >= 0 && layout.panel.bottom <= layout.controls.top, `copy and actions remain visible at ${label}`);
        check(layout.canvas.width > 80 && layout.canvas.height > 80 && layout.canvas.top >= 0 && layout.canvas.bottom <= layout.controls.top, `object remains visible at ${label}`);
        if (chapter === 1) {
          check(layout.canvas.bottom + 8 <= layout.photos.top, `capture photos clear the object at ${label}`);
          check(layout.phone.right + 8 <= layout.canvas.left, `capture phone clears the object at ${label}`);
          await page.screenshot({ path: path.join(outDir, `home-mobile-${viewport.width}x${viewport.height}.png`) });
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-chapter="4"]').click();
    await page.waitForFunction(() => Number(document.querySelector('#story').dataset.progress) > 3.999);
    await page.locator('.story-panel [data-demo]').click();
    await page.waitForSelector('.workspace');
    check(true, 'final mobile demo action remains usable');
    await page.goto(baseUrl + '/');
    await page.waitForSelector('#story-viewer canvas');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForSelector('.static-home');
    check(await page.locator('#story-viewer canvas').count() === 0, 'enabling reduced motion disposes the animated viewer');
    check(await page.locator('.static-chapters').isVisible(), 'reduced motion exposes the complete static narrative');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForSelector('#story-viewer canvas');
    check(await page.locator('.static-home').count() === 0, 'disabling reduced motion restores the mobile narrative');
    await page.setViewportSize({ width: 1024, height: 768 });
    check(await page.locator('#story-viewer canvas').count() === 1, 'crossing the mobile breakpoint keeps one animated viewer');
    check(errors.length === 0, 'no mobile browser runtime errors');
    fs.writeFileSync(path.join(outDir, 'home-mobile-results.json'), JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
