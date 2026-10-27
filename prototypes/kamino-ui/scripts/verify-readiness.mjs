import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const temporary = await mkdtemp(path.join(tmpdir(), "kamino-readiness-"));
const web = path.join(temporary, "web");
const evidence =
  process.env.KAMINO_EVIDENCE_DIR ||
  path.join(root, "outputs/release-readiness/browser");
await mkdir(evidence, { recursive: true });
const backend = createServer((req, res) => {
  const status = req.url === "/api/unavailable" ? 503 : 404;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      detail:
        status === 503 ? "Fixture unavailable" : "Fixture API route missing",
    }),
  );
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
let server, browser;
let serverLog = "";
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS " + name);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.error("FAIL " + name + ": " + error.message);
  }
}
const fixture = {
  format: "photo2sim-review-package-1.0",
  project: {
    schema_version: "assembly-review-1.0",
    name: "resize_fixture",
    synthetic: true,
    root_link: "base",
    notes: ["Synthetic preview geometry; no physical claims."],
    parts: [
      {
        id: "part",
        mesh: "part.obj",
        sha256: "a".repeat(64),
        pose: { position_m: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] },
        group: "base",
        source: "estimated",
        note: "Synthetic fixture",
        excluded_reason: null,
      },
    ],
    groups: [
      {
        name: "base",
        frame: { position_m: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] },
        mass_kg: { value: 0.1, source: "estimated" },
        sliding_friction: null,
        reviewed: false,
        review_note: "",
      },
    ],
    joints: [],
  },
  geometry: {
    part: {
      vertices: [
        [0, 0, 0],
        [0.1, 0, 0],
        [0, 0.1, 0],
      ],
      faces: [[0, 1, 2]],
      bounds_m: [
        [0, 0, 0],
        [0.1, 0.1, 0],
      ],
    },
  },
};
try {
  execFileSync(process.execPath, [
    path.join(root, "deploy/railway/assemble-web.mjs"),
    path.join(root, "frontend/dist"),
    path.join(root, "prototypes/kamino-ui/dist"),
    web,
  ]);
  server = spawn(
    process.env.CADDY_BIN || "caddy",
    [
      "run",
      "--config",
      path.join(root, "deploy/railway/Caddyfile"),
      "--adapter",
      "caddyfile",
    ],
    {
      env: {
        ...process.env,
        PORT: String(port),
        API_UPSTREAM: `127.0.0.1:${backend.address().port}`,
        WEB_ROOT: web,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (data) => {
    serverLog += data;
  });
  server.stderr.on("data", (data) => {
    serverLog += data;
  });
  server.on("error", (error) => {
    serverLog += error.message;
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    if (server.exitCode !== null) throw Error("Caddy failed: " + serverLog);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Caddy did not start: " + serverLog);
  browser = await chromium.launch({
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
    ...(process.env.KAMINO_BROWSER_EXECUTABLE
      ? { executablePath: process.env.KAMINO_BROWSER_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, isMobile: true, hasTouch: true,
  });
  const unexpected = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "data:" ||
      url.protocol === "blob:" ||
      url.hostname === "127.0.0.1"
    )
      return route.continue();
    unexpected.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await check(
    "home offers a visible complete-example path without scrolling",
    async () => {
      await page.goto(base);
      const link = page.locator('.site-header a[href="/example.html"]');
      await link.waitFor({ state: "visible", timeout: 4000 });
      const box = await link.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 900);
      assert.ok(
        await page
          .locator(
            '.site-header a[href="https://github.com/Johaan-Mannanal/kamino"]',
          )
          .isVisible(),
      );
      await page.screenshot({ path: path.join(evidence, "home-desktop.png") });
    },
  );
  await check(
    "mobile home preserves visible navigation and viewport width",
    async () => {
      for (const [width, height] of [[320, 568], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.goto(base);
        assert.equal(await page.evaluate(() => innerWidth), width, 'header must not stretch the mobile layout viewport');
        assert.ok(await page.locator('.site-header a[href="/example.html"]').isVisible());
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base);
      assert.ok(
        await page.locator('.site-header a[href="/example.html"]').isVisible(),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({ path: path.join(evidence, "home-mobile.png") });
    },
  );
  await check(
    "upload explains hosted access before selecting files",
    async () => {
      await page.goto(base + "/#upload");
      await page.locator("#choose").waitFor();
      const disclosure = page.locator("#generation-access");
      await disclosure.waitFor({ state: "visible", timeout: 3000 });
      assert.match(await disclosure.innerText(), /access code/i);
      assert.ok(
        await disclosure.locator('a[href="/example.html"]').isVisible(),
      );
      assert.ok(
        await page.evaluate(
          () =>
            !!(
              document
                .querySelector("#generation-access")
                .compareDocumentPosition(document.querySelector("#drop-zone")) &
              Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
      );
      await page.screenshot({ path: path.join(evidence, "upload-mobile.png") });
    },
  );
  await check(
    "complete example downloads the original portable ZIP and inputs",
    async () => {
      const response = await page.goto(base + "/example.html");
      assert.equal(response.status(), 200);
      assert.match(await page.locator("main").innerText(), /synthetic/i);
      const link = page.getByRole("link", {
        name: "Download MuJoCo bundle",
        exact: true,
      });
      const url = new URL(await link.getAttribute("href"), base);
      const downloaded = await fetch(url);
      assert.equal(downloaded.status, 200);
      const actual = createHash("sha256")
        .update(Buffer.from(await downloaded.arrayBuffer()))
        .digest("hex");
      const expected = createHash("sha256")
        .update(
          await readFile(
            path.join(root, "examples/assemblies/hinged-panel/simulation.zip"),
          ),
        )
        .digest("hex");
      assert.equal(actual, expected);
      for (const name of [
        "post.obj",
        "panel.obj",
        "reviewed-project.json",
        "validation.json",
        "SHA256SUMS",
      ])
        assert.equal(
          (await fetch(base + "/examples/hinged-panel/" + name)).status,
          200,
          name,
        );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(evidence, "example-mobile.png"),
      });
    },
  );
  await check(
    "assembly entry fits 390px without horizontal overflow",
    async () => {
      await page.goto(base + "/assembly.html");
      await page.locator("#draft-name").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "assembly page is wider than viewport",
      );
    },
  );
  await check(
    "loaded assembly canvas shrinks from desktop to phone",
    async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page
        .locator("#load")
        .setInputFiles({
          name: "resize-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(fixture)),
        });
      await page.locator("#viewer canvas").waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(
        () =>
          document.querySelector("#viewer canvas").getBoundingClientRect()
            .width <= innerWidth,
        null,
        { timeout: 4000 },
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(evidence, "assembly-mobile.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "unknown frontend paths retain HTTP 404 and offer recovery links",
    async () => {
      const response = await page.goto(base + "/missing/page");
      assert.equal(response.status(), 404);
      assert.ok(
        await page
          .getByRole("link", { name: "Back to Kamino", exact: true })
          .isVisible(),
      );
      assert.ok(
        await page
          .getByRole("link", { name: "Explore the example", exact: true })
          .isVisible(),
      );
      await page.screenshot({ path: path.join(evidence, "404-mobile.png") });
    },
  );
  await check('both local Vite apps expose a usable example and the original bundle', async () => {
    for (const app of ['prototypes/kamino-ui', 'frontend']) {
      const probe = createServer();
      await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
      const devPort = probe.address().port;
      await new Promise(resolve => probe.close(resolve));
      const args = [path.join(root, app, 'node_modules/vite/bin/vite.js')];
      if (app !== 'frontend') args.push('--configLoader', 'native');
      args.push('--host', '127.0.0.1', '--port', String(devPort), '--strictPort');
      const dev = spawn(process.execPath, args, { cwd: path.join(root, app), stdio: 'ignore' });
      try {
        let ready = false;
        const devBase = `http://127.0.0.1:${devPort}`;
        for (let i = 0; i < 80; i++) {
          try { ready = (await fetch(devBase + '/example.html')).ok; } catch {}
          if (ready) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(ready, app + ' Vite did not start');
        if (app === 'frontend') {
          await page.goto(devBase + '/assembly.html');
          await page.locator('details > summary').first().click();
          await page.getByRole('link', { name: 'Explore a complete offline example', exact: true }).click();
        } else await page.goto(devBase + '/example.html');
        await page.getByRole('link', { name: 'Download MuJoCo bundle', exact: true }).waitFor({ timeout: 3000 });
        const response = await fetch(devBase + '/examples/hinged-panel/simulation.zip');
        assert.equal(response.status, 200);
        const original = await readFile(path.join(root, 'examples/assemblies/hinged-panel/simulation.zip'));
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
      } finally { dev.kill(); }
    }
  });
  await check(
    "API 404 and 503 remain JSON responses from the backend",
    async () => {
      for (const [route, code, detail] of [
        ["missing", 404, "Fixture API route missing"],
        ["unavailable", 503, "Fixture unavailable"],
      ]) {
        const response = await fetch(base + "/api/" + route);
        assert.equal(response.status, code);
        assert.equal((await response.json()).detail, detail);
      }
    },
  );
  await check("no external requests or uncaught browser errors", async () => {
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser?.close();
  server?.kill();
  await new Promise((resolve) => backend.close(resolve));
  await writeFile(
    path.join(evidence, "results.json"),
    JSON.stringify({ checks: results, serverLog }, null, 2),
  );
  await rm(temporary, { recursive: true, force: true });
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
