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
let generationRequests = 0;
let legacyJobReads = 0;
const backend = createServer((req, res) => {
  if (req.url === "/api/session") {
    const role = req.headers.cookie?.includes("fixture.team") ? "team"
      : req.headers.cookie?.includes("fixture.judge") ? "judge"
      : req.headers.cookie?.includes("fixture.student") ? "student" : null;
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(JSON.stringify({ required: true, authenticated: !!role, role, public_student_access: true }));
    } else if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", "kamino_session=; Path=/api; Max-Age=0; HttpOnly; SameSite=Strict");
      res.end(JSON.stringify({ authenticated: false }));
    } else {
      const granted = req.headers.authorization === "Bearer fixture-team" ? "team"
        : req.headers.authorization === "Bearer fixture-judge" ? "judge" : role || "student";
      res.setHeader("Set-Cookie", `kamino_session=fixture.${granted}; Path=/api; HttpOnly; SameSite=Strict`);
      res.end(JSON.stringify({ authenticated: true, role: granted, session_seconds: granted === "judge" ? 21600 : 1800 }));
    }
    return;
  }
  if (req.method === "POST") generationRequests++;
  if (req.url === "/api/jobs/22222222-2222-4222-8222-222222222222") {
    legacyJobReads++;
    const denied = !req.headers.cookie?.includes("fixture.team");
    res.writeHead(denied ? 403 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(denied
      ? { detail: "Use team access for legacy recovery", category: "job_access" }
      : { detail: "Fixture recovered legacy job not found" }));
    return;
  }
  if (req.url === "/api/jobs/11111111-1111-4111-8111-111111111111") {
    res.writeHead(req.headers.cookie?.includes("fixture.") ? 404 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "Fixture saved job not found" }));
    return;
  }
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
  await check("Caddy returns compatible browser security headers", async () => {
    const response = await fetch(base);
    const csp = response.headers.get("content-security-policy") || "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data: blob:/);
    assert.match(csp, /worker-src 'self' blob:/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
    );
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(self), microphone=(), geolocation=()",
    );
    assert.match(
      response.headers.get("strict-transport-security") || "",
      /max-age=31536000; includeSubDomains/,
    );
  });
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
      assert.match(await disclosure.innerText(), /student access is automatic/i);
      assert.match(await disclosure.innerText(), /shared daily allowance/i);
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
      for (const name of ["LICENSE", "NOTICE"]) {
        const legal = await fetch(base + "/" + name);
        assert.equal(legal.status, 200, name + " must accompany distributed web assets");
        assert.deepEqual(Buffer.from(await legal.arrayBuffer()), await readFile(path.join(root, name)));
      }
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
  await check("a saved-job URL obtains public access without demanding a code", async () => {
    await context.clearCookies();
    await page.goto(base + "/?job=11111111-1111-4111-8111-111111111111#creating");
    await page.waitForFunction(() => document.querySelector("#live-load-error")?.textContent.includes("Fixture saved job not found"));
    assert.equal(await page.locator("dialog.live-token").count(), 0);
    assert.ok((await context.cookies()).some(cookie => cookie.name === "kamino_session" && cookie.value === "fixture.student"));
  });
  await check("a legacy-job denial requests privileged sign-in instead of looping public access", async () => {
    await context.clearCookies();
    legacyJobReads = 0;
    await page.goto(base + "/?job=22222222-2222-4222-8222-222222222222#creating");
    const dialog = page.locator("dialog.live-token");
    await dialog.waitFor({ state: "visible", timeout: 3000 });
    assert.equal(legacyJobReads, 1, "ownership denial must not loop student restoration");
    await page.getByLabel("Team access code", { exact: true }).fill("fixture-team");
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#live-load-error")?.textContent.includes("Fixture recovered legacy job not found"));
    assert.equal(await dialog.count(), 0);
    assert.equal(legacyJobReads, 2, "restore the saved URL once after privileged sign-in");
    assert.equal(generationRequests, 0, "recovery must not submit provider or simulation work");
  });
  await check("public student access is automatic and judge access survives refresh and Assembly", async () => {
    await context.clearCookies();
    await page.goto(base + "/#upload");
    await page.getByRole("button", { name: "Student access", exact: true }).waitFor();
    assert.equal(await page.locator("dialog.live-token").count(), 0);
    await page.getByRole("button", { name: "Student access", exact: true }).click();
    await page.getByLabel("Team access code", { exact: true }).fill("fixture-judge");
    await page.locator("dialog.live-token").getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    await page.goto(base + "/assembly.html");
    await page.waitForFunction(() => document.querySelector("#access-status")?.textContent.includes("judge"));
    await page.locator("details > summary").first().click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#access-status")?.textContent.includes("Signed out"));
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#access-status")?.textContent.includes("student"));
    assert.equal(generationRequests, 0, "access must not create provider or simulation work");
  });
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
