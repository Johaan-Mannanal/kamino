import "./style.css";
import { browserAccess } from "../../../frontend/src/access";
import { initAppearance } from "./appearance";
initAppearance();
import { mountHome } from "./home";
import { MugViewer } from "./viewer";
import {
  defaults,
  validatePhotos,
  validateProperties,
  dimensions,
  saveRevision,
  backendProperties,
  zipStore,
  type Properties,
  type Revision,
} from "./workflow";
import { BackendSession, SessionCancelledError } from "./backend-session";
import { UploadNavigation } from "./live-navigation";
import { reviewPhoto, type CropRect } from "./photo-review";
import {
  STATUS_LABEL,
  assemblyUrl,
  describeError,
  isAuthError,
  isRunning,
  jobIdFromSearch,
  meshReady,
  mountLiveWorkspace,
  promptForToken,
  searchWithJob,
} from "./live-workspace";

const app = document.querySelector<HTMLDivElement>("#app")!;
// Real jobs go through one controller; the procedural demo never touches it.
let liveSession: BackendSession | undefined;
const uploads = new UploadNavigation();
const live = () => (liveSession ??= new BackendSession());
const liveJobId = () => jobIdFromSearch(location.search);
const setLiveJob = (id: string | null) =>
  history.replaceState(
    null,
    "",
    `${location.pathname}${searchWithJob(location.search, id)}${location.hash}`,
  );
const asset = (name: string) => `/assets/${name}`;
const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const icon = (name: string, size = 16) =>
  `<img class="icon" src="${asset(name)}" width="${size}" height="${size}" alt="">`;
const brand = () =>
  `<a class="brand" href="#home" aria-label="Kamino home">${icon("c76c7.svg", 22)}<span>Kamino</span></a>`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
type Photo = { name: string; url: string; file?: File; original?: File; crop?: CropRect };
let photos: Photo[] = [];
let draft = defaults();
let revisions: Revision[] = [];
let meshIdentity = 1;
let customMesh: File | undefined;
let viewer: MugViewer | undefined;
let cleanup = () => {};
let navToken = 0;
let prepared = new Map<number, Blob>();
let busy = false;
let checkingAccess = false;
const demoPhotos = () =>
  ["5df27.png", "06849.png", "d28af.png"].map((file, i) => ({
    name: ["Front", "Side", "Above"][i],
    url: asset(file),
  }));
const toast = (message: string) => {
  const t = document.querySelector<HTMLDivElement>("#toast")!;
  t.textContent = message;
  t.classList.add("visible");
  window.setTimeout(() => t.classList.remove("visible"), 3500);
};
const saved = () => revisions.at(-1);
const dirty = () =>
  !saved() || JSON.stringify(draft) !== JSON.stringify(saved()!.properties);
const route = (name: string) => {
  if (location.hash === `#${name}`) void render();
  else location.hash = name;
};
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  app.querySelector<T>(selector)!;
const on = (selector: string, event: string, fn: EventListener) =>
  $(selector)?.addEventListener(event, fn);
function header(title = "Ceramic mug", workspace = false) {
  return `<header class="project-header">${brand()}<span class="divider"></span><span class="project-title">${esc(title)}</span><span id="saved-state" class="muted small">${workspace ? "Demo mesh · Local prototype" : "New asset / Draft"}</span><div class="header-right">${workspace ? '<span id="export-state" class="muted small"></span><button class="primary compact" id="prepare">Prepare export</button>' : '<button class="text-button" data-guide>Quick guide ↗</button>'}</div></header>`;
}
function steps(active: string, liveJob = false) {
  return `<nav class="steps" aria-label="Workflow"><a href="#home">Home</a><span>→</span><a href="#upload" class="${active === "upload" ? "active" : ""}">Upload</a><span>→</span><span class="${active === "creating" ? "active" : ""}">Creating mesh</span><span>→</span><span class="${active === "workspace" ? "active" : ""}">Workspace</span><span class="step-note">${active === "workspace" ? (liveJob ? "Review and save · server job" : "Review and edit · simulated workflow") : ""}</span></nav>`;
}
function guide() {
  const dialog = document.createElement("dialog");
  dialog.className = "guide";
  dialog.innerHTML = `<h2>A small guide to Kamino.</h2><p>Upload 2–4 photos for better coverage. One photo is supported. Include different angles and important details such as ports and pins. Photos are sent to the configured Kamino API for reconstruction. Keep the job URL to resume it later. Provider credentials stay on the server.</p><p>Drag to orbit, shift-drag to pan, and scroll over the viewer to zoom. Review orientation and a known full extent, preview dimensions on the server, then save reviewed properties. Generate simulation is a separate action; its downloadable bundle requires successful validation.</p><p>Try the demo and Use demo photos open a separate procedural ceramic mug. Those demo photos are not uploaded or reconstructed. Demo export contains a GLB and properties JSON, with no simulation validation.</p><form method="dialog"><button class="primary">Got it</button></form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
function wireGuides() {
  app
    .querySelectorAll("[data-guide]")
    .forEach((el) => el.addEventListener("click", guide));
}
function mount(host: HTMLElement, story = false) {
  try {
    return new MugViewer(host, story);
  } catch {
    host.innerHTML = `<img class="viewer-fallback" src="${asset("46613.png")}" alt="Ceramic mug"><p class="viewer-error">3D preview unavailable. Enable WebGL or try another browser. Property editing still works.</p>`;
    return undefined;
  }
}

function home() {
  cleanup = mountHome(app, {
    brand: brand(),
    photos: demoPhotos(),
    onDemo: () => {
      if (uploads.pending)
        return toast(
          "Your upload is still being accepted. Wait before opening the demo.",
        );
      // The explicit demo is synthetic: leave any real job and stop polling it.
      liveSession?.cancel();
      setLiveJob(null);
      photos = demoPhotos();
      customMesh = undefined;
      draft = defaults();
      revisions = [];
      prepared.clear();
      meshIdentity++;
      route("creating");
    },
  });
  mountResume(".site-header > div");
  wireGuides();
}

function mountResume(selector: string) {
  const id = liveJobId() ?? uploads.acceptedId ?? liveSession?.job?.id;
  if (!id && !uploads.pending) return;
  const host = app.querySelector(selector);
  if (!host) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = uploads.pending
    ? "Upload in progress…"
    : "Resume server job";
  button.disabled = uploads.pending;
  button.onclick = () => {
    if (!id || uploads.pending) return;
    setLiveJob(id);
    route("creating");
  };
  host.prepend(button);
}

function upload() {
  app.innerHTML = `${header("Untitled asset")}${steps("upload")}<main class="upload-content"><p class="eyebrow">CREATE AN ASSET / NEW DRAFT</p><h1>Upload photos</h1><p class="muted">Upload 2–4 photos of the same object from different angles. Include important details such as ports and pins. One photo is supported.</p><div id="drop-zone" class="drop-zone">${icon("0e7df.svg", 28)}<strong>Drop photos here</strong><span class="muted">2–4 photos recommended · One photo supported · JPEG, PNG or WebP · Up to 10 MiB each</span><button id="choose" class="secondary">Choose photos</button><input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div><p id="upload-error" class="error" role="alert"></p><div class="selection-heading"><strong>Selected photos <span id="photo-count"></span></strong><button class="text-button accent" id="sample-photos">Use demo photos</button></div><div id="photo-list"></div><div class="upload-actions"><a class="quiet" href="#home">← Back to start</a><button id="create-mesh" class="primary">${icon("0f26a.svg")}Create mesh</button></div><p class="prototype-note" id="upload-note"></p><p class="live-upload-links small"><button class="text-button" id="access-token" type="button">Application access token</button><a class="text-button" href="${esc(assemblyUrl())}">Assembly workflow ↗</a></p></main>`;
  mountResume(".live-upload-links");
  const guidance = document.createElement("p");
  guidance.className = "photo-capture-guide small";
  guidance.textContent = "Keep the whole object visible from different angles. Optional cropping can remove distractions; it does not guarantee accurate geometry.";
  $("#photo-list").before(guidance);
  const draw = () => {
    const demo = photos.length > 0 && photos.some((p) => !p.file);
    $("#photo-count").textContent = `· ${photos.length} of 4`;
    $<HTMLButtonElement>("#create-mesh").disabled =
      !photos.length || uploads.pending || checkingAccess;
    $<HTMLButtonElement>("#choose").disabled = uploads.pending || checkingAccess;
    $<HTMLButtonElement>("#sample-photos").disabled = uploads.pending || checkingAccess;
    if (uploads.pending)
      $("#create-mesh").lastChild!.textContent = "Uploading…";
    $("#upload-note").textContent = demo
      ? "Demo photos open the synthetic procedural mug. Nothing is uploaded or reconstructed."
      : "Your photos are uploaded to the configured Kamino API for reconstruction. Provider keys stay on the server.";
    if (!demo && (liveJobId() || uploads.acceptedId || liveSession?.job))
      $("#upload-note").textContent +=
        " A server job already exists. Resume it above; Create mesh starts another reconstruction.";
    $("#photo-list").innerHTML = photos
      .map(
        (p, i) =>
          `<div class="photo-row"><img src="${p.url}" alt="${p.file !== p.original ? "Cropped photo" : "Original photo"} ${i + 1}"><div><strong>${esc(p.name)}</strong><small>${p.file ? (p.file === p.original ? "Original photo" : "Cropped · Original kept in this tab") : "Demo photo"}</small></div>${p.file ? `<button class="secondary compact" data-review="${i}" ${uploads.pending || checkingAccess ? "disabled" : ""}>${p.file !== p.original ? "Edit crop" : "Crop (optional)"}</button>` : ""}<button class="text-button" data-remove="${i}" aria-label="Remove ${esc(p.name)}" ${uploads.pending || checkingAccess ? "disabled" : ""}>Remove ×</button></div>`,
      )
      .join("");
    app.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          if (uploads.pending || checkingAccess) return;
          const p = photos.splice(Number(b.dataset.remove), 1)[0];
          if (p.file) URL.revokeObjectURL(p.url);
          draw();
        }),
    );
    app.querySelectorAll<HTMLButtonElement>("[data-review]").forEach(b => {
      b.onclick = async () => {
        if (uploads.pending || checkingAccess) return;
        const photo = photos[Number(b.dataset.review)];
        const token = navToken;
        const result = await reviewPhoto(photo.original ?? photo.file!, photo.crop);
        if (!result || token !== navToken || !photos.includes(photo)) return;
        URL.revokeObjectURL(photo.url);
        photo.original ??= photo.file;
        photo.file = result.file; photo.crop = result.crop;
        photo.url = URL.createObjectURL(result.file);
        draw();
      };
    });
  };
  const add = (files: File[]) => {
    if (uploads.pending || checkingAccess) return;
    if (!files.length) return;
    // Real photos replace demo photos so a real upload never mixes in demo art.
    const own = photos.filter((p) => p.file);
    const error = validatePhotos([...own.map((p) => p.file!), ...files]);
    $("#upload-error").textContent = error ?? "";
    if (error) return;
    photos = own;
    photos.push(
      ...files.map((file) => ({
        file,
        original: file,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    );
    draw();
  };
  $("#choose").onclick = () => $<HTMLInputElement>("#photo-input").click();
  on("#photo-input", "change", () => {
    add(Array.from($<HTMLInputElement>("#photo-input").files ?? []));
    $<HTMLInputElement>("#photo-input").value = "";
  });
  $("#sample-photos").onclick = () => {
    if (uploads.pending || checkingAccess) return;
    photos.forEach((p) => {
      if (p.file) URL.revokeObjectURL(p.url);
    });
    photos = demoPhotos();
    $("#upload-error").textContent = "";
    draw();
  };
  for (const type of ["dragenter", "dragover"])
    on("#drop-zone", type, (e) => {
      e.preventDefault();
      $("#drop-zone").classList.add("drag-over");
    });
  on("#drop-zone", "dragleave", () =>
    $("#drop-zone").classList.remove("drag-over"),
  );
  on("#drop-zone", "drop", (e) => {
    e.preventDefault();
    $("#drop-zone").classList.remove("drag-over");
    add(Array.from((e as DragEvent).dataTransfer?.files ?? []));
  });
  $("#access-token").textContent = "Team sign-in";
  $("#access-token").onclick = async () => {
    try {
      const status = await browserAccess.status();
      if (status.required && status.authenticated) {
        await browserAccess.signOut();
        live().setToken("");
        $("#access-token").textContent = "Team sign-in";
        toast("Signed out on this browser.");
      } else if (status.required) {
        if (
          await promptForToken(
            live(),
            "Sign in to upload photos and open saved jobs.",
          )
        )
          $("#access-token").textContent = "Sign out";
      } else toast("This server does not require sign-in.");
    } catch (error) {
      toast(describeError(error));
    }
  };
  const accessView = navToken;
  void browserAccess
    .status()
    .then((status) => {
      if (navToken === accessView && status.required && status.authenticated)
        $("#access-token").textContent = "Sign out";
    })
    .catch(() => {
      /* Create mesh retries the access check with a visible error. */
    });
  $("#create-mesh").onclick = async () => {
    if (!photos.length || uploads.pending || checkingAccess) return;
    const files = photos.flatMap((p) => (p.file ? [p.file] : []));
    if (files.length !== photos.length) {
      // Explicit synthetic demo: procedural mug, no upload, no reconstruction.
      liveSession?.cancel();
      setLiveJob(null);
      customMesh = undefined;
      draft = defaults();
      revisions = [];
      prepared.clear();
      meshIdentity++;
      route("creating");
      return;
    }
    const token = navToken;
    $("#upload-error").textContent = "";
    checkingAccess = true;
    draw();
    $("#create-mesh").lastChild!.textContent = "Checking access…";
    try {
      const access = await browserAccess.status();
      if (token !== navToken) return;
      if (
        !access.authenticated &&
        !(await promptForToken(live(), "Sign in before sending your photos."))
      )
        return;
      if (token !== navToken) return;
      checkingAccess = false;
      const request = uploads.submit(() => live().upload(files), {
        remember: setLiveJob,
        isCurrent: () => token === navToken,
        openCurrent: () => route("creating"),
        acceptedInBackground: () => {
          toast("Upload accepted. Use Resume server job to continue.");
        },
        takingLonger: () => {
          if (token === navToken)
            $("#upload-note").textContent =
              "Still waiting for the upload response. Large photos or a slow connection can take longer. Keep this tab open; do not resubmit, because the server may already be accepting this job.";
        },
      });
      draw();
      $("#upload-note").textContent =
        `Sending ${files.length} photo(s), ${(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)} MiB. Keep this tab open. Creating mesh starts after the server confirms the upload.`;
      await request;
    } catch (error) {
      if (error instanceof SessionCancelledError) return;
      if (token !== navToken) {
        toast(
          `Upload failed: ${describeError(error)} Your selected photos are kept.`,
        );
        return;
      }
      // Selected photos stay in place so the user can retry.
      if (isAuthError(error)) {
        $("#upload-error").textContent =
          "Your sign-in expired. Sign in, then choose Create mesh again.";
        void promptForToken(
          live(),
          "Sign in again, then choose Create mesh. The rejected request did not start reconstruction.",
        );
      } else
        $("#upload-error").textContent =
          `Upload failed: ${describeError(error)}`;
    } finally {
      checkingAccess = false;
      if (token === navToken) {
        $("#create-mesh").lastChild!.textContent = "Create mesh";
        draw();
      } else void render();
    }
  };
  draw();
  wireGuides();
}

function liveLoading(token: number, id: string) {
  const session = live();
  app.innerHTML = `<header class="site-header">${brand()}</header><main class="loading"><h1>Creating your mesh</h1><p class="muted" id="live-load-status" role="status" aria-live="polite">Loading job status…</p><div class="progress" id="live-load-bar" role="progressbar" aria-label="Server job progress" aria-valuemin="0" aria-valuemax="100"><span></span></div><p class="loading-note">Job ${esc(id.slice(0, 8))} · status from the server</p><p id="live-load-error" class="error" role="alert"></p><div class="live-load-actions"><button class="secondary compact" id="live-load-retry" hidden>Retry</button><button class="text-button" id="live-load-back">Back to photos</button></div><p class="prototype-note">Leaving this page stops watching; the server job continues and can be reopened from this URL.</p></main>`;
  let failure: unknown = null;
  const restore = () => {
    failure = null;
    paint();
    session.restore(id).catch(fail);
  };
  const fail = async (error: unknown) => {
    if (token !== navToken || error instanceof SessionCancelledError) return;
    failure = error;
    paint();
    if (
      isAuthError(error) &&
      (await promptForToken(session, "Sign in to open this saved job."))
    )
      if (token === navToken) restore();
  };
  let leaving = false;
  const paint = () => {
    if (token !== navToken || leaving) return;
    const job = session.job?.id === id ? session.job : null;
    if (job && meshReady(job)) {
      leaving = true;
      return route("workspace");
    }
    const error = failure ?? session.error;
    const failed = job?.status === "failed";
    $("#live-load-status").textContent = job
      ? `${job.synthetic ? "Synthetic mock reconstruction" : "Reconstruction"} · ${STATUS_LABEL[job.status]}${isRunning(job) ? ` · ${Math.round(job.progress)}%` : ""}`
      : "Loading job status…";
    const bar = $("#live-load-bar");
    bar.hidden = failed || (!!error && !job);
    if (job)
      bar.setAttribute("aria-valuenow", String(Math.round(job.progress)));
    $("#live-load-error").textContent = failed
      ? `Reconstruction failed${job.error ? `: ${job.error.code} — ${job.error.message}` : "."} Your selected photos are kept for another attempt.`
      : error
        ? describeError(error)
        : "";
    $("#live-load-retry").hidden = !error || isAuthError(error);
  };
  $("#live-load-back").onclick = () => {
    session.cancel();
    route("upload");
  };
  $("#live-load-retry").onclick = () => {
    if (session.job?.id === id) {
      failure = null;
      session.refresh().catch(fail);
    } else restore();
  };
  const unsubscribe = session.subscribe(paint);
  cleanup = () => {
    unsubscribe();
  };
  if (session.job?.id === id) {
    paint();
    // Resume status reads if watching was stopped earlier; polling then continues.
    if (!leaving && !session.polling && !session.busy)
      session.refresh().catch(fail);
  } else restore();
}

function liveWorkspace(id: string) {
  const session = live();
  if (session.job?.id !== id || !meshReady(session.job))
    return route("creating");
  cleanup = mountLiveWorkspace(app, {
    session,
    brand: brand(),
    steps: steps("workspace", true),
    icon,
    toast,
    onEditPhotos: () => route("upload"),
    onLeave: () => route("creating"),
  });
}
function loading(token: number) {
  app.innerHTML = `<header class="site-header">${brand()}</header><main class="loading"><h1>Creating your mesh</h1><p class="muted">Preparing your demo geometry.</p><div class="progress" role="progressbar" aria-label="Creating demo mesh"><span></span></div><p class="loading-note">Simulated processing · No provider request</p><button class="text-button" id="cancel-create">Cancel</button></main>`;
  $("#cancel-create").onclick = () => route("upload");
  const timer = setTimeout(() => {
    if (token === navToken) route("workspace");
  }, 2200);
  cleanup = () => clearTimeout(timer);
}
const field = (
  label: string,
  name: string,
  value: number | string,
  unit: string,
  min?: number,
  max?: number,
  readonly = false,
) =>
  `<label class="property-field"><span>${label}</span><div class="input-shell"><input name="${name}" aria-label="${label}" type="number" step="any" value="${value}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} ${readonly ? "readonly" : ""}><span>${unit}</span></div></label>`;
function workspace() {
  if (!photos.length) photos = demoPhotos();
  if (!revisions.length) revisions = [saveRevision(draft, [], meshIdentity)];
  app.innerHTML = `${header(customMesh ? "Local mesh" : "Ceramic mug demo", true)}${steps("workspace")}<main class="workspace"><aside class="sources"><div class="section-line"><strong>Source photos</strong><span class="muted">${photos.length}/4</span></div>${photos.map((p, i) => `<button class="source-photo" data-photo="${i}"><img src="${p.url}" alt="Source view ${i + 1}"><span>${esc(p.file ? `View ${i + 1}` : p.name)}</span></button>`).join("")}<a class="secondary add-photos" href="#upload">${icon("49255.svg", 13)}Edit photos</a><p class="source-note">${customMesh ? "Local GLB" : "Procedural demo mesh"}<br>Photos not reconstructed<br>Y-up · millimetres</p></aside><section class="workspace-center"><div class="viewport"><div class="viewport-toolbar"><div class="segmented" role="group" aria-label="Viewport mode"><button class="selected" data-view="studio">Studio</button><button data-view="mesh">Mesh</button><button data-view="collision">Collision</button></div><div class="viewer-actions"><button class="secondary compact" id="replace-mesh">Replace mesh</button><input type="file" id="mesh-file" accept=".glb" hidden><button class="square" id="fullscreen" aria-label="Toggle fullscreen">${icon("28ea9.svg")}</button><button class="square" id="reset-camera" aria-label="Reset camera">${icon("f8f8a.svg")}</button></div></div><div class="viewport-label"><span>${customMesh ? "Local mesh" : "Ceramic mug"} / Perspective</span><span class="badge">${customMesh ? "Local GLB" : "Demo mesh"}</span><small id="preview-state">Applied preview · Session only</small></div><div id="viewer" class="viewer"></div><div class="viewport-help"><span>Drag to orbit · Shift to pan · Scroll to zoom</span><span>X → &nbsp;Y ↑ &nbsp;Z ↗ · Y-up</span></div></div></section><aside class="inspector"><div class="section-line"><h2>Physical properties</h2>${icon("66491.svg")}</div><p class="muted small">Manual editing</p><form id="properties"><section class="property-section"><h3>Orientation <span>Y-up</span></h3><div class="field-grid three">${draft.rotation.map((v, i) => field(["X", "Y", "Z"][i], `rotation${i}`, v, "°", -180, 180)).join("")}</div><button type="button" class="text-button" id="align">${icon("6ade8.svg", 14)}Align base to ground</button></section><section class="property-section"><h3>Sizing <span>Uniform scale</span></h3><div class="field-grid two">${field("Known length", "length", draft.length, "mm", 0.001, 100000)}<label class="property-field"><span>Axis</span><select name="axis" aria-label="Reference axis">${["x", "y", "z"].map((a) => `<option value="${a}" ${a === draft.axis ? "selected" : ""}>${a.toUpperCase()} · full extent</option>`).join("")}</select></label></div><div class="field-grid three dimensions">${["Width", "Height", "Depth"].map((l, i) => field(`${["X", "Y", "Z"][i]} · ${l}`, `dimension${i}`, [120, 100, 90][i], "mm", undefined, undefined, true)).join("")}</div><p class="muted small">${icon("fd1ec.svg", 13)}Preserve proportions · On</p><p class="muted tiny">Known length represents the full selected extent, including protrusions. Rotation updates that extent.</p></section><section class="property-section"><h3>Dynamics <span>Draft · Editable</span></h3><div class="field-grid two">${field("Mass", "mass", draft.mass, "kg", 0.001)}${field("Friction", "friction", draft.friction ?? "", "μ", 0)}</div><p class="muted tiny">Leave friction blank if unknown.</p></section><details class="suggestions"><summary>${icon("a4dc8.svg", 15)}Demo suggestions</summary><p class="muted small">Sample values · Not applied · No AI call</p><div class="section-line small"><span>Mass 0.32 kg</span><span>Friction 0.45 μ</span></div><button class="secondary compact" type="button" id="apply-suggestion">Apply to draft</button></details><p id="form-error" class="error" role="alert"></p><div class="save-row"><span class="muted small" id="save-status"></span><button class="primary compact" id="save" type="submit">Apply changes</button></div></form><p class="prototype-note">Session-only demo: refreshing resets changes and exports. Download your export before leaving. Reconstruction and simulation validation are not run.</p></aside></main>`;
  viewer = mount($("#viewer"));
  const canvas = $("#viewer canvas");
  if (canvas) {
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (e) => {
      const k = e as KeyboardEvent;
      if (!["ArrowLeft", "ArrowRight"].includes(k.key) || !viewer) return;
      k.preventDefault();
      viewer.camera.position.applyAxisAngle(
        new (viewer.camera.position.constructor as any)(0, 1, 0),
        k.key === "ArrowLeft" ? 0.15 : -0.15,
      );
    });
  }
  const bounds = () =>
    viewer?.bounds(draft.rotation) ??
    ([120, 100, 90] as [number, number, number]);
  const update = () => {
    const error = validateProperties(draft);
    $("#form-error").textContent = error ?? "";
    if (!error) {
      const b = viewer?.update(draft) ?? bounds();
      dimensions(draft, b).forEach((v, i) => {
        $<HTMLInputElement>(`[name="dimension${i}"]`).value = v.toFixed(1);
      });
    }
    $("#save-status").textContent = dirty() ? "Unapplied changes" : "Applied for this session";
    $("#saved-state").textContent = dirty()
      ? "Draft / Unapplied changes"
      : "Applied for this session";
    $("#preview-state").textContent = dirty()
      ? "Scale preview · Unapplied"
      : "Applied preview · Session only";
    $<HTMLButtonElement>("#save").disabled = !!error || !dirty();
    $<HTMLButtonElement>("#prepare").disabled =
      !!error || dirty() || !viewer || busy;
    $("#prepare").textContent = prepared.has(saved()!.id)
      ? "Download export"
      : "Prepare export";
    $("#export-state").textContent = prepared.has(saved()!.id)
      ? "Demo package ready"
      : "Prototype · Not validated";
  };
  const read = () => {
    const f = new FormData($<HTMLFormElement>("#properties"));
    const number = (key: string) =>
      String(f.get(key)).trim() === "" ? NaN : Number(f.get(key));
    draft = {
      length: number("length"),
      axis: String(f.get("axis")) as Properties["axis"],
      mass: number("mass"),
      friction:
        String(f.get("friction")).trim() === "" ? null : number("friction"),
      rotation: [number("rotation0"), number("rotation1"), number("rotation2")],
    };
    update();
  };
  const setForm = () => {
    const values: Record<string, string | number> = {
      length: draft.length,
      axis: draft.axis,
      mass: draft.mass,
      friction: draft.friction ?? "",
      rotation0: draft.rotation[0],
      rotation1: draft.rotation[1],
      rotation2: draft.rotation[2],
    };
    for (const [k, v] of Object.entries(values))
      $<HTMLInputElement>(`[name="${k}"]`).value = String(v);
    update();
  };
  const download = (id: number) => {
    const blob = prepared.get(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kamino-prototype-r${id}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast("Downloaded demo GLB + properties. Simulation was not validated.");
  };
  on("#properties", "input", read);
  on("#properties", "change", read);
  on("#properties", "submit", (e) => {
    e.preventDefault();
    read();
    const error = validateProperties(draft);
    if (error) return;
    revisions.push(saveRevision(draft, revisions, meshIdentity));
    update();
    toast("Changes applied for this session. Refresh resets the demo.");
  });
  $("#align").onclick = () => {
    draft.rotation = [0, 0, 0];
    setForm();
    toast("Base aligned to ground. Camera preserved.");
  };
  $("#apply-suggestion").onclick = () => {
    draft.mass = 0.32;
    draft.friction = 0.45;
    setForm();
    toast("Demo values copied to draft. Apply changes to use them this session.");
  };
  $("#reset-camera").onclick = () => viewer?.resetCamera();
  $("#fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $(".viewport").requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser.");
    }
  };
  app.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        viewer?.setMode(b.dataset.view!);
        app
          .querySelectorAll(".segmented button")
          .forEach((n) =>
            n.classList.toggle(
              "selected",
              (n as HTMLElement).dataset.view === b.dataset.view,
            ),
          );
        if (b.dataset.view === "collision")
          toast(
            "Collision is a translucent visual preview, not a generated collision hull.",
          );
      }),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-photo]").forEach(
    (b) =>
      (b.onclick = () => {
        const photo = photos[Number(b.dataset.photo)];
        const d = document.createElement("dialog");
        d.className = "photo-dialog";
        d.innerHTML = `<img src="${photo.url}" alt="Selected source photo"><form method="dialog"><button class="secondary">Close</button></form>`;
        document.body.append(d);
        d.onclose = () => d.remove();
        d.showModal();
      }),
  );
  $("#replace-mesh").onclick = () => $<HTMLInputElement>("#mesh-file").click();
  on("#mesh-file", "change", async () => {
    const f = $<HTMLInputElement>("#mesh-file").files?.[0];
    if (!f || !viewer) return;
    const importToken = navToken;
    const importViewer = viewer;
    busy = true;
    update();
    try {
      await importViewer.replace(f);
      if (importToken !== navToken) return;
      customMesh = f;
      meshIdentity++;
      prepared.clear();
      draft = defaults();
      const b = importViewer.bounds(draft.rotation);
      draft.length = b[0];
      setForm();
      toast("Local GLB loaded. Review dimensions before saving.");
    } catch (e) {
      if (importToken === navToken) toast((e as Error).message);
    } finally {
      if (importToken === navToken) {
        busy = false;
        update();
      }
    }
  });
  $("#prepare").onclick = async () => {
    if (!viewer || dirty() || busy) return;
    const r = saved()!;
    if (prepared.has(r.id)) {
      download(r.id);
      return;
    }
    busy = true;
    const exportToken = navToken;
    const exportViewer = viewer;
    update();
    $("#prepare").textContent = "Preparing…";
    try {
      const glb = await exportViewer.glb(r.properties);
      if (exportToken !== navToken) return;
      const boundsNow = exportViewer.bounds(r.properties.rotation);
      const encoder = new TextEncoder();
      const json = JSON.stringify(
        {
          prototype: true,
          reconstruction: "not run",
          simulation_validation: "not run",
          revision: r,
          properties: backendProperties(r.properties, boundsNow),
        },
        null,
        2,
      );
      const zip = zipStore([
        { name: "mesh.glb", bytes: new Uint8Array(glb) },
        { name: "properties.json", bytes: encoder.encode(json) },
        {
          name: "README.txt",
          bytes: encoder.encode(
            "Kamino FRONTEND PROTOTYPE\nContains demo/local geometry and manually reviewed properties.\nPhotos are excluded. No provider calls, reconstruction, MuJoCo scene generation, collision validation, or simulation validation ran.\nGLB transforms are baked in metres and Y-up.\n",
          ),
        },
      ]);
      prepared.set(
        r.id,
        new Blob([zip as BlobPart], { type: "application/zip" }),
      );
      toast("Demo export ready. Download it from this workspace.");
    } catch (e) {
      if (exportToken === navToken)
        toast(`Could not prepare export: ${(e as Error).message}`);
    } finally {
      if (exportToken === navToken) {
        busy = false;
        update();
      }
    }
  };
  if (customMesh && viewer) {
    const token = navToken;
    busy = true;
    void viewer
      .replace(customMesh)
      .then(() => {
        if (token === navToken) {
          busy = false;
          update();
        }
      })
      .catch(() => toast("Reload the local GLB to restore its preview."));
  }
  update();
}
async function render() {
  navToken++;
  cleanup();
  cleanup = () => {};
  viewer?.dispose();
  viewer = undefined;
  busy = false;
  window.scrollTo({ top: 0, behavior: "instant" });
  const requestedPage = location.hash.slice(1) || "home";
  // Watching/restoring another job would cancel an upload's session generation.
  const page =
    uploads.pending && ["creating", "workspace"].includes(requestedPage)
      ? "upload"
      : requestedPage;
  document.documentElement.dataset.page = [
    "upload",
    "creating",
    "workspace",
  ].includes(page)
    ? page
    : "home";
  const jobId = liveJobId();
  if (page === "upload") upload();
  else if (page === "creating") {
    if (jobId) return liveLoading(navToken, jobId);
    if (!photos.length || photos.some((p) => p.file)) {
      route("upload");
      return;
    }
    loading(navToken);
  } else if (page === "workspace") {
    if (jobId) return liveWorkspace(jobId);
    // The procedural demo workspace never presents the user's photos as reconstructed.
    if (photos.some((p) => p.file)) return route("upload");
    workspace();
  } else if (jobId && !location.hash) route("creating");
  else home();
}
window.addEventListener("hashchange", () => void render());
window.addEventListener("beforeunload", (event) => {
  if (!uploads.pending && !liveSession?.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});
void render();
