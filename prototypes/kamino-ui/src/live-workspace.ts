/// <reference types="vite/client" />
import { ApiError } from "../../../frontend/src/api";
import { browserAccess } from "../../../frontend/src/access";
import { makeSizing } from "../../../frontend/src/sizing";
import { mountViewer } from "../../../frontend/src/viewer";
import { canRetry } from "../../../frontend/src/pipeline";
import type { JobStatus, Scalar, Source } from "../../../frontend/src/types";
import {
  mountTargetGeometry,
  readTargetDraft,
  targetReviewControls,
} from "../../../frontend/src/target-review";
import {
  SessionCancelledError,
  type BackendSession,
  type Job,
  type Orientation,
  type ReviewedInputs,
  type Suggestions,
} from "./backend-session";
import {
  generateGate,
  primaryViewer,
  syncTargetControls,
  targetControlsKey,
} from "./live-target-review";

// ---------------------------------------------------------------------------
// Pure helpers (unit tested). Nothing here invents bounds, mass or friction.
// ---------------------------------------------------------------------------

export type Axis = "x" | "y" | "z";
export type Draft = {
  x: string;
  y: string;
  z: string;
  axis: "" | Axis;
  length: string;
  unit: "mm" | "m";
  referenceSource: Source;
  description: string;
  acknowledged: boolean;
  mass: string;
  massSource: Source;
  friction: string;
  frictionSource: Source;
};
/** Saved or explicitly applied values whose notes survive an unchanged save. */
export type Origins = { mass: Scalar | null; friction: Scalar | null };
export type SuggestionChoice = {
  mass: boolean;
  friction: boolean;
  axis: "" | Axis;
};

/** referenceEpoch records which target/orientation binding the draft was confirmed against. */
type RetainedDraft = {
  draft: Draft;
  origins: Origins;
  referenceEpoch?: number;
};
const retainedDrafts = new WeakMap<
  BackendSession,
  Map<string, RetainedDraft>
>();

/** Navigation keeps tab-memory drafts. Full reload deliberately restores saved inputs. */
export function retainWorkspaceDraft(
  session: BackendSession,
  id: string,
  value: RetainedDraft | null,
) {
  let jobs = retainedDrafts.get(session);
  if (!jobs) retainedDrafts.set(session, (jobs = new Map()));
  if (value) jobs.set(id, structuredClone(value));
  else jobs.delete(id);
}
export function restoreWorkspaceDraft(
  session: BackendSession,
  job: Job,
): RetainedDraft | null {
  const value = retainedDrafts.get(session)?.get(job.id);
  return value ? structuredClone(value) : null;
}
export function editWorkspaceDraft(previous: Draft, next: Draft): Draft {
  return previous.x !== next.x || previous.y !== next.y || previous.z !== next.z
    ? { ...next, acknowledged: false }
    : next;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES: [Source, string][] = [
  ["user_supplied", "User supplied"],
  ["measured", "Measured"],
  ["sourced", "Sourced"],
  ["estimated", "Estimated"],
];
const DEFAULT_ASSEMBLY_URL = "http://127.0.0.1:5173/assembly.html";
const EDITABLE: JobStatus[] = ["awaiting_properties", "completed", "failed"];
const RUNNING: JobStatus[] = [
  "queued",
  "reconstructing",
  "preparing",
  "validating",
];
export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  reconstructing: "Reconstructing mesh",
  awaiting_properties: "Awaiting reviewed properties",
  preparing: "Preparing simulation export",
  validating: "Validating simulation",
  completed: "Completed",
  failed: "Failed",
};

export function assemblyUrl(
  raw: string | undefined = import.meta.env.VITE_KAMINO_ASSEMBLY_URL,
) {
  try {
    const url = new URL(raw || DEFAULT_ASSEMBLY_URL);
    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : DEFAULT_ASSEMBLY_URL;
  } catch {
    return DEFAULT_ASSEMBLY_URL;
  }
}
export function jobIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("job");
  return id && UUID.test(id) ? id.toLowerCase() : null;
}
export function searchWithJob(search: string, id: string | null) {
  const params = new URLSearchParams(search);
  if (id) params.set("job", id);
  else params.delete("job");
  const value = params.toString();
  return value ? `?${value}` : "";
}
export const isRunning = (job: Job | null) =>
  !!job && RUNNING.includes(job.status);
/** The workspace only opens for a real reconstructed mesh. */
export const meshReady = (job: Job | null) =>
  !!job?.mesh_path && !["queued", "reconstructing"].includes(job.status);
export const isAuthError = (error: unknown) =>
  error instanceof ApiError && error.status === 401;
export const sameOrientation = (a: Orientation, b: Orientation) =>
  a.x_deg === b.x_deg && a.y_deg === b.y_deg && a.z_deg === b.z_deg;
const text = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function draftFromJob(job: Job): {
  draft: Draft;
  origins: Origins;
  notice: string | null;
} {
  const properties = job.properties;
  const sizing = properties?.sizing;
  const reference = sizing?.mode === "uniform" ? sizing.reference : null;
  const notice =
    properties && !reference
      ? sizing?.mode === "independent_axes"
        ? "Saved properties use advanced independent-axis stretching. Saving here replaces them with uniform sizing; earlier attempts remain downloadable."
        : "Saved properties use legacy three-axis sizing. Saving here replaces them with uniform sizing; earlier attempts remain downloadable."
      : null;
  return {
    draft: {
      x: text(job.orientation.x_deg),
      y: text(job.orientation.y_deg),
      z: text(job.orientation.z_deg),
      axis: reference?.axis ?? "",
      length: text(reference?.length),
      unit: reference?.unit ?? "mm",
      referenceSource: reference?.source ?? "user_supplied",
      description: reference?.description ?? "",
      // A saved reference bound to an older target context must be confirmed again.
      acknowledged:
        !!reference &&
        (properties?.geometry_context_sha256 ?? null) ===
          (job.geometry_review?.geometry_context_sha256 ?? null),
      mass: text(properties?.mass_kg.value),
      massSource: properties?.mass_kg.source ?? "user_supplied",
      friction: text(properties?.sliding_friction?.value),
      frictionSource: properties?.sliding_friction?.source ?? "user_supplied",
    },
    origins: {
      mass: properties?.mass_kg ?? null,
      friction: properties?.sliding_friction ?? null,
    },
    notice,
  };
}

/** Blank → null. The origin note is kept only when value and source are unchanged. */
export function toScalar(
  raw: string,
  source: Source,
  origin: Scalar | null,
): Scalar | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  const note =
    origin && origin.value === value && origin.source === source
      ? origin.note
      : null;
  return note ? { value, source, note } : { value, source };
}

export function draftOrientation(draft: Draft): Orientation | string {
  const values = [draft.x, draft.y, draft.z].map((v) =>
    v.trim() ? Number(v) : NaN,
  );
  if (values.some((v) => !Number.isFinite(v) || v < -180 || v > 180))
    return "Orientation angles must be numbers from −180° to 180°.";
  return { x_deg: values[0], y_deg: values[1], z_deg: values[2] };
}

type Built<T> =
  | { value: T; error?: undefined }
  | { value?: undefined; error: string };

/** Orientation plus the accepted uniform-sizing validator (frontend/src/sizing.ts). */
export function buildSizing(
  draft: Draft,
): Built<Pick<ReviewedInputs, "orientation" | "sizing">> {
  const orientation = draftOrientation(draft);
  if (typeof orientation === "string") return { error: orientation };
  let sizing: ReviewedInputs["sizing"] | undefined;
  try {
    sizing = makeSizing(
      {
        sizing_mode: "uniform",
        reference_axis: draft.axis,
        reference_length: draft.length,
        reference_unit: draft.unit,
        reference_source: draft.referenceSource,
        reference_description: draft.description,
        reference_full_extent: draft.acknowledged ? "on" : "",
      },
      orientation,
    );
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!sizing) return { error: "Choose uniform sizing." };
  return { value: { orientation, sizing } };
}

export function buildReviewed(
  draft: Draft,
  origins: Origins,
): Built<ReviewedInputs> {
  const sized = buildSizing(draft);
  if (sized.error !== undefined) return { error: sized.error };
  const mass = toScalar(draft.mass, draft.massSource, origins.mass);
  if (!mass || !Number.isFinite(mass.value) || mass.value <= 0)
    return { error: "Mass must be a positive number in kilograms." };
  const friction = toScalar(
    draft.friction,
    draft.frictionSource,
    origins.friction,
  );
  if (friction && (!Number.isFinite(friction.value) || friction.value < 0))
    return { error: "Friction must be zero or greater, or blank if unknown." };
  return {
    value: { ...sized.value, mass_kg: mass, sliding_friction: friction },
  };
}

/** Explicitly copies selected known suggestions into a new draft. Unknowns never erase values. */
export function applySuggestions(
  draft: Draft,
  origins: Origins,
  suggestions: Suggestions,
  choice: SuggestionChoice,
): { draft: Draft; origins: Origins; applied: string[] } {
  const next = { ...draft };
  const nextOrigins = { ...origins };
  const applied: string[] = [];
  if (choice.mass && suggestions.mass_kg) {
    next.mass = String(suggestions.mass_kg.value);
    next.massSource = suggestions.mass_kg.source;
    nextOrigins.mass = { ...suggestions.mass_kg };
    applied.push("mass");
  }
  if (choice.friction && suggestions.sliding_friction) {
    next.friction = String(suggestions.sliding_friction.value);
    next.frictionSource = suggestions.sliding_friction.source;
    nextOrigins.friction = { ...suggestions.sliding_friction };
    applied.push("friction");
  }
  const dimensions = suggestions.dimensions_m;
  if (choice.axis && dimensions) {
    // One reference only: uniform sizing keeps the mesh's own proportions.
    next.axis = choice.axis;
    next.length = String(dimensions[choice.axis]);
    next.unit = "m";
    next.referenceSource = dimensions.source;
    next.description =
      `Suggested full ${choice.axis.toUpperCase()} extent${dimensions.note ? `: ${dimensions.note}` : ""}`.slice(
        0,
        2000,
      );
    next.acknowledged = false;
    applied.push(`${choice.axis.toUpperCase()} reference`);
  }
  return { draft: next, origins: nextOrigins, applied };
}

export function canGenerate(
  job: Job | null,
  dirty: boolean,
  busy: boolean,
  invalid: boolean,
) {
  if (!job || busy || dirty || invalid || !job.mesh_path || !job.properties)
    return false;
  if (job.status !== "awaiting_properties" && job.status !== "failed")
    return false;
  if (job.status === "failed" && !canRetry(job)) return false;
  const sizing = job.properties.sizing;
  return (
    !sizing || sameOrientation(sizing.reviewed_orientation, job.orientation)
  );
}

export type Provenance = {
  model?: string;
  requested_model?: string;
  fallback_used?: boolean;
  fallback_models?: string[];
  object_hint?: string | null;
  created_at?: string;
};
export function parseProvenance(raw: unknown): Provenance | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    model: str(r.model),
    requested_model: str(r.requested_model),
    fallback_used:
      typeof r.fallback_used === "boolean" ? r.fallback_used : undefined,
    fallback_models: Array.isArray(r.fallback_models)
      ? r.fallback_models.filter((m): m is string => typeof m === "string")
      : undefined,
    object_hint: typeof r.object_hint === "string" ? r.object_hint : null,
    created_at: str(r.created_at),
  };
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  if (error instanceof ApiError) {
    if (error.category)
      parts.push(`Category: ${error.category.replace(/_/g, " ")}.`);
    if (error.retryAfter) parts.push(`Retry after ${error.retryAfter} s.`);
    if (error.manual_entry_available !== false && error.category)
      parts.push("Manual entry remains available.");
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// DOM workspace
// ---------------------------------------------------------------------------

export const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Exchange the team code for an HttpOnly session; never persist the code in JS. */
export function promptForToken(
  session: BackendSession,
  message: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "guide live-token";
    dialog.innerHTML = `<h2>Team sign-in</h2><p class="muted small">${esc(message)}</p><p class="muted small">Ask Johaan for an access code. Friends: 30 minutes · Judges: 6 hours · Team: 12 hours. Refresh and new tabs keep access. Friends share 2 mesh submissions and 10 Gemini requests per 24 hours; judges share 10 and 40. Cooldowns apply. Provider API keys are not needed.</p><form><label class="property-field"><span>Team access code</span><div class="input-shell"><input name="token" type="password" autocomplete="off" spellcheck="false" required aria-label="Team access code"></div></label><p class="error" role="alert"></p><div class="save-row"><button class="text-button" type="button" data-cancel>Cancel</button><button class="primary compact" type="submit">Sign in</button></div></form>`;
    document.body.append(dialog);
    const input = dialog.querySelector<HTMLInputElement>("input")!;
    const submit = dialog.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    dialog.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = () =>
      dialog.close();
    dialog.querySelector("form")!.onsubmit = async (event) => {
      event.preventDefault();
      if (submit.disabled || !input.value.trim()) return;
      submit.disabled = true;
      submit.textContent = "Signing in…";
      try {
        await browserAccess.signIn(input.value);
        session.setToken("");
        input.value = "";
        if (dialog.open) dialog.close("ok");
      } catch (error) {
        if (dialog.open)
          dialog.querySelector('[role="alert"]')!.textContent =
            describeError(error);
      } finally {
        submit.disabled = false;
        submit.textContent = "Sign in";
      }
    };
    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "ok";
      input.value = "";
      dialog.remove();
      resolve(ok);
    });
    dialog.showModal();
    input.focus();
  });
}

export type LiveContext = {
  session: BackendSession;
  brand: string;
  steps: string;
  icon: (name: string, size?: number) => string;
  toast: (message: string) => void;
  onEditPhotos: () => void;
  /** Called when the job is no longer a mesh-ready job (replaced or reset). */
  onLeave: () => void;
};

type ViewerSpec = { orientation: Orientation; scale?: number[]; label: string };
const fileName = (job: Job, path: string) =>
  `kamino-${job.id.slice(0, 8)}-${path.split("/").pop() || "file"}`;
const sourceSelect = (name: string, value: Source, label: string) =>
  `<label class="property-field"><span>${label}</span><select name="${name}" aria-label="${label}">${SOURCES.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
const input = (
  label: string,
  name: string,
  value: string,
  unit: string,
  extra = "",
) =>
  `<label class="property-field"><span>${label}</span><div class="input-shell"><input name="${name}" aria-label="${label}" type="number" step="any" value="${esc(value)}" ${extra}><span>${unit}</span></div></label>`;
const metres = (v: number) => `${(v * 1000).toFixed(1)} mm`;

export function mountLiveWorkspace(
  host: HTMLElement,
  ctx: LiveContext,
): () => void {
  const { session, icon, toast } = ctx;
  const initialJob = session.job!;
  const jobId = initialJob.id;
  const initial = draftFromJob(initialJob);
  const retained = restoreWorkspaceDraft(session, initialJob);
  let draft = retained?.draft ?? initial.draft;
  let origins = retained?.origins ?? initial.origins;
  if (retained && !session.dirty) session.markDirty();
  // Target/orientation invalidations since this draft was confirmed clear its reference ack.
  let seenEpoch = retained?.referenceEpoch ?? session.referenceEpoch;
  let targetKey = "";
  let targetViewKey = "";
  let disposeTargetView = () => {};
  const inputSnapshot = (job: Job) =>
    JSON.stringify([
      job.input_revision,
      job.mesh_path,
      job.orientation,
      job.properties,
    ]);
  let savedInputSnapshot = inputSnapshot(initialJob);
  let disposed = false;
  let suggestions: Suggestions | null = null;
  let suggestionError: unknown = null;
  let suggestionState = "";
  let provenance: Provenance | null | string = null;
  let suggestionBusy = false;
  let initialEstimatesStarted = false;
  let previewError = "";
  let draftViewer: ViewerSpec | null = null;
  let viewerKey = "";
  let disposeViewer = () => {};
  let outputsKey = "";
  let reportKey = "";
  let reportSummary = "";
  let promptedFor: unknown = null;
  let prompting = false;
  const urls: string[] = [];

  host.innerHTML = `<header class="project-header">${ctx.brand}<span class="divider"></span><span class="project-title">Job ${esc(jobId.slice(0, 8))}</span><span id="live-saved" class="muted small"></span><div class="header-right"><span id="live-status" class="badge" role="status" aria-live="polite"></span><a class="text-button" href="${esc(assemblyUrl())}">Assembly ↗</a><button class="secondary compact" id="live-bundle" hidden>Download bundle</button><button class="primary compact" id="live-generate">Generate simulation</button></div></header>${ctx.steps}<main class="workspace live-workspace"><aside class="sources"><div class="section-line"><strong>Source photos</strong><span class="muted">${initialJob.source_images.length}/4</span></div><div id="live-photos"></div><button class="secondary add-photos" id="live-edit-photos">${icon("49255.svg", 13)}New upload</button><p class="source-note">${esc(initialJob.provider)} reconstruction${initialJob.synthetic ? " · synthetic mock geometry" : ""}<br>Z-up · fixed X → Y → Z rotations<br>Server sizing in metres</p></aside><section class="workspace-center"><div class="viewport"><div class="viewport-toolbar"><span class="badge">${initialJob.synthetic ? "Synthetic mock mesh" : "Reconstructed mesh"}</span><div class="viewer-actions"><button class="secondary compact" id="live-orient-preview" type="button">Preview draft orientation</button><button class="secondary compact" id="live-mesh" type="button">Download mesh</button><button class="square" id="live-fullscreen" type="button" aria-label="Toggle fullscreen">${icon("28ea9.svg")}</button></div></div><div class="viewport-label"><span id="live-viewer-label"></span></div><div id="live-viewer" class="viewer"></div><div class="viewport-help"><span>Geometry preview only · collision is generated during preparation and not shown</span><span>Red X · Green Y · Blue Z · Z-up</span></div></div><div id="live-target" class="live-target"></div><section class="live-outputs" aria-labelledby="live-outputs-title"><h2 id="live-outputs-title">Simulation</h2><p id="live-generate-reason" class="muted small" role="status"></p><div id="live-outputs"></div></section></section><aside class="inspector"><div class="section-line"><h2>Physical properties</h2>${icon("66491.svg")}</div><p class="muted small">Manual review · saved to the server</p>${initial.notice ? `<p class="live-notice small" role="note">${esc(initial.notice)}</p>` : ""}<form id="live-form" novalidate><section class="property-section"><h3>Orientation <span>Fixed X → Y → Z · Z-up</span></h3><div class="field-grid three">${(["x", "y", "z"] as const).map((a) => input(`${a.toUpperCase()} rotation`, a, draft[a], "°", 'min="-180" max="180"')).join("")}</div><p class="muted tiny">Active right-handed rotations about the fixed X, then Y, then Z axes.</p><div class="save-row"><span class="muted small" id="live-orientation-status" role="status"></span><button type="button" class="secondary compact" id="live-save-orientation">Save orientation</button></div></section><section class="property-section"><h3>Sizing <span>Uniform · one full-extent reference</span></h3><p id="live-target-gate" class="live-target-gate small" role="status"></p><div class="field-grid two"><label class="property-field"><span>Full extent axis</span><select name="axis" aria-label="Reference axis"><option value="">Choose axis</option>${(["x", "y", "z"] as const).map((a) => `<option value="${a}" ${draft.axis === a ? "selected" : ""}>${a.toUpperCase()} · full extent</option>`).join("")}</select></label>${input("Reference length", "length", draft.length, "", 'min="0"')}<label class="property-field"><span>Units</span><select name="unit" aria-label="Reference units"><option value="mm" ${draft.unit === "mm" ? "selected" : ""}>Millimetres</option><option value="m" ${draft.unit === "m" ? "selected" : ""}>Metres</option></select></label>${sourceSelect("referenceSource", draft.referenceSource, "Reference source")}</div><label class="property-field live-wide"><span>Describe the full extent (body, pins and other protrusions)</span><div class="input-shell"><input name="description" aria-label="Full extent description" maxlength="2000" value="${esc(draft.description)}"></div></label><label class="live-check"><input type="checkbox" name="acknowledged" ${draft.acknowledged ? "checked" : ""}> My reference matches the selected full mesh extent, including any protrusions.</label><button type="button" class="secondary compact" id="live-preview">Preview dimensions on server</button><div id="live-preview-output" class="live-preview small" role="status" aria-live="polite"></div></section><section class="property-section"><h3>Dynamics <span>Manual entry</span></h3><div class="field-grid two">${input("Mass", "mass", draft.mass, "kg", 'min="0"')}${sourceSelect("massSource", draft.massSource, "Mass source")}${input("Friction", "friction", draft.friction, "μ", 'min="0"')}${sourceSelect("frictionSource", draft.frictionSource, "Friction source")}</div><p class="muted tiny">Leave friction blank if unknown; it is saved as unknown.</p></section><p id="live-form-error" class="error" aria-live="polite"></p><p id="live-error" class="error" role="alert"></p><button type="button" class="text-button" id="live-retry" hidden>Retry status</button><div class="save-row"><span class="muted small" id="live-save-status"></span><button class="primary compact" id="live-save" type="submit">Save reviewed properties</button></div></form><details class="suggestions live-suggestions"><summary>${icon("a4dc8.svg", 15)}Gemini suggestions</summary><p class="muted small">Requests run only when you ask. Values are never applied or saved automatically.</p><label class="property-field"><span>Object hint (optional)</span><div class="input-shell"><input id="live-hint" maxlength="200" aria-label="Object hint"></div></label><div class="save-row"><button class="secondary compact" type="button" id="live-suggest">Request</button><button class="secondary compact" type="button" id="live-suggest-refresh">Refresh (new request)</button></div><div id="live-suggestions" aria-live="polite"></div></details><p class="prototype-note">Save orientation first, then save the target review, then preview and save properties against that reviewed target. Generate simulation is a separate step.</p></aside></main>`;

  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    host.querySelector<T>(selector)!;
  const form = $<HTMLFormElement>("#live-form");
  const currentJob = () => (session.job?.id === jobId ? session.job : null);
  document.documentElement.classList.add("live-workspace-page");
  host.classList.add("live-workspace-host");
  const inspector = $(".inspector");
  const suggestionsCard = $(".live-suggestions");
  suggestionsCard.setAttribute("open", "");
  suggestionsCard.querySelector("summary")!.textContent =
    "Gemini starting values";
  suggestionsCard.querySelector("p")!.textContent =
    "Saved estimates load first. If none exist, one automatic Gemini request is attempted per job in this browser session. Values are never applied or saved automatically. Manual retry remains available.";
  inspector.insertBefore(suggestionsCard, form);
  inspector.insertBefore($("#live-target"), form);
  inspector.append($(".live-outputs"), $(".sources"));
  inspector.querySelector<HTMLElement>(
    ":scope > .prototype-note",
  )!.textContent =
    "Save orientation and target review first. Review the reference, then save properties or use Save & generate. Numerical checks do not establish physical accuracy.";

  const download = async (
    blob: Promise<Blob> | (() => Promise<Blob>),
    name: string,
  ) => {
    try {
      const data = await (typeof blob === "function" ? blob() : blob);
      if (disposed) return;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) {
      if (!disposed) await handleError(error, "Download failed");
    }
  };

  async function handleError(error: unknown, prefix?: string) {
    if (disposed || error instanceof SessionCancelledError) return;
    if (isAuthError(error)) {
      if (prompting || promptedFor === error) return;
      promptedFor = error;
      prompting = true;
      const accepted = await promptForToken(
        session,
        "The API requires an application token. Your draft is kept; repeat your last action afterwards.",
      );
      prompting = false;
      // Only the job status is re-read; no save, provider or processing request is retried.
      if (accepted && !disposed) {
        session
          .refresh()
          .then(retryArtifacts)
          .catch((refreshError) => void handleError(refreshError));
      }
      return;
    }
    toast(`${prefix ? `${prefix}: ` : ""}${describeError(error)}`);
  }

  // Source photos come from the job itself, through authenticated reads.
  const photoHost = $("#live-photos");
  let photoRequest = 0;
  function loadPhotos() {
    const request = ++photoRequest;
    photoHost.replaceChildren();
    initialJob.source_images.forEach((path, index) => {
      const button = document.createElement("button");
      button.className = "source-photo";
      button.type = "button";
      button.innerHTML = `<span>View ${index + 1} · loading…</span>`;
      photoHost.append(button);
      session
        .file(path)
        .then((blob) => {
          if (disposed || request !== photoRequest) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          button.innerHTML = `<img src="${url}" alt="Uploaded source view ${index + 1}"><span>View ${index + 1}</span>`;
          button.onclick = () => {
            const d = document.createElement("dialog");
            d.className = "photo-dialog";
            d.innerHTML = `<img src="${url}" alt="Uploaded source view ${index + 1}"><form method="dialog"><button class="secondary">Close</button></form>`;
            document.body.append(d);
            d.onclose = () => d.remove();
            d.showModal();
          };
        })
        .catch((error) => {
          if (disposed || request !== photoRequest) return;
          button.innerHTML = `<span>View ${index + 1} · unavailable</span>`;
          if (isAuthError(error)) void handleError(error);
        });
    });
  }
  loadPhotos();

  function retryArtifacts() {
    if (disposed) return;
    viewerKey = "";
    reportKey = "";
    reportSummary = "";
    outputsKey = "";
    loadPhotos();
    update();
  }
  const retryFiles = document.createElement("button");
  retryFiles.type = "button";
  retryFiles.className = "secondary compact";
  retryFiles.id = "live-files-retry";
  retryFiles.textContent = "Retry files";
  retryFiles.onclick = retryArtifacts;
  $(".viewer-actions").append(retryFiles);

  function syncViewer(job: Job) {
    // Selected target only; the all-surface review view lives in #live-target.
    const spec = primaryViewer(
      job,
      session.target,
      session.targetStatus,
      session.sizingPreview,
      draftViewer?.orientation ?? null,
    );
    $("#live-viewer-label").textContent = spec.label;
    if (spec.key === viewerKey || !job.mesh_path) return;
    viewerKey = spec.key;
    disposeViewer();
    disposeViewer = mountViewer(
      $("#live-viewer"),
      session.api,
      job.id,
      job.mesh_path,
      spec.orientation,
      spec.scale,
      spec.selection,
    );
  }

  // Target review: controls outside the physical-properties form, events delegated
  // to the persistent host so a structural re-render never needs re-binding.
  const targetHost = $("#live-target");
  const savedOrientation = (job: Job) => {
    const value = draftOrientation(draft);
    return typeof value !== "string" && sameOrientation(value, job.orientation);
  };
  // A status refresh does not lock fields being edited; it only blocks saving.
  const targetLocked = (job: Job) =>
    session.busy ||
    isRunning(job) ||
    !EDITABLE.includes(job.status) ||
    (job.status === "failed" && !canRetry(job));
  function pushTargetDraft(next = readTargetDraft(targetHost)) {
    if (JSON.stringify(next) === JSON.stringify(session.target.draft)) return;
    session.setTargetDraft(next);
  }
  targetHost.addEventListener("input", (event) => {
    if ((event.target as HTMLElement).closest("#target-review-form"))
      pushTargetDraft();
  });
  targetHost.addEventListener("change", (event) => {
    if ((event.target as HTMLElement).closest("#target-review-form"))
      pushTargetDraft();
  });
  targetHost.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button || button.disabled) return;
    const inventory = session.target.inventory;
    if (button.id === "reload-target-geometry") void session.loadGeometry(true);
    else if (button.id === "target-select-all" && inventory)
      pushTargetDraft({
        ...session.target.draft,
        selectedIslandIds: inventory.islands.map((island) => island.id),
      });
    else if (button.id === "target-clear")
      pushTargetDraft({ ...session.target.draft, selectedIslandIds: [] });
  });
  targetHost.addEventListener("submit", async (event) => {
    event.preventDefault();
    const job = currentJob();
    if (!job || targetLocked(job) || session.refreshing) return;
    if (!savedOrientation(job))
      return toast("Save orientation before confirming the target.");
    pushTargetDraft();
    try {
      await session.saveTargetReview();
      if (!disposed)
        toast(
          "Target review saved. Confirm the reference full extent, then preview and save properties.",
        );
    } catch (error) {
      await handleError(error, "Target review not saved");
    }
  });
  function syncTarget(job: Job) {
    const target = session.target;
    const key = targetControlsKey(job, target);
    if (key !== targetKey) {
      targetKey = key;
      targetViewKey = "";
      disposeTargetView();
      disposeTargetView = () => {};
      const focused = targetHost.contains(document.activeElement)
        ? document.activeElement?.id
        : "";
      targetHost.innerHTML = targetReviewControls(job, target);
      if (focused)
        targetHost
          .querySelector<HTMLElement>(`#${focused}`)
          ?.focus({ preventScroll: true });
      const photos = targetHost.querySelector("#target-source-photos");
      if (photos)
        photos.textContent =
          "Compare with the uploaded Source photos below in this inspector.";
    }
    const status = session.targetStatus;
    const orientationSaved = savedOrientation(job);
    syncTargetControls(targetHost, target, status, {
      locked: targetLocked(job),
      orientationSaved,
    });
    if (session.refreshing)
      targetHost
        .querySelector<HTMLButtonElement>("#save-target-review")
        ?.setAttribute("disabled", "");
    const view = targetHost.querySelector<HTMLElement>("#target-geometry-view");
    if (!view || !target.inventory) return;
    const value = draftOrientation(draft);
    const orientation =
      draftViewer && typeof value !== "string" ? value : job.orientation;
    const viewKey = JSON.stringify([
      target.inventory.source_mesh_sha256,
      [...target.draft.selectedIslandIds].sort(),
      orientation,
    ]);
    if (viewKey === targetViewKey) return;
    targetViewKey = viewKey;
    disposeTargetView();
    disposeTargetView = mountTargetGeometry(
      view,
      target.inventory,
      orientation,
      target.draft.selectedIslandIds,
    );
  }

  function readDraft(): Draft {
    const f = new FormData(form);
    const get = (key: string) => String(f.get(key) ?? "");
    return {
      x: get("x"),
      y: get("y"),
      z: get("z"),
      axis: get("axis") as Draft["axis"],
      length: get("length"),
      unit: get("unit") === "m" ? "m" : "mm",
      referenceSource: get("referenceSource") as Source,
      description: get("description"),
      acknowledged: f.get("acknowledged") === "on",
      mass: get("mass"),
      massSource: get("massSource") as Source,
      friction: get("friction"),
      frictionSource: get("frictionSource") as Source,
    };
  }
  function writeDraft(next: Draft) {
    for (const [key, value] of Object.entries(next)) {
      const el = form.elements.namedItem(key) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (!el) continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox")
        el.checked = !!value;
      else el.value = String(value);
    }
  }
  const onEdit = () => {
    const next = editWorkspaceDraft(draft, readDraft());
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    if (next.x !== draft.x || next.y !== draft.y || next.z !== draft.z) {
      draftViewer = null;
      (form.elements.namedItem("acknowledged") as HTMLInputElement).checked =
        false;
    }
    draft = next;
    previewError = "";
    session.markDirty();
  };
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const built = buildReviewed(draft, origins);
    if (built.error !== undefined) return update();
    const blocked = referenceBlock(currentJob());
    if (blocked) {
      previewError = blocked;
      return update();
    }
    try {
      await session.saveReviewed(built.value);
      if (!session.dirty) retainWorkspaceDraft(session, jobId, null);
      if (disposed) return;
      if (!session.dirty) {
        // Saved values (and their server-side notes) become the new origins.
        const saved = session.job?.properties;
        if (saved)
          origins = { mass: saved.mass_kg, friction: saved.sliding_friction };
        draftViewer = null;
        update();
      }
      toast(
        session.dirty
          ? "Saved. Newer edits remain unsaved."
          : "Reviewed properties saved.",
      );
    } catch (error) {
      await handleError(error);
    }
  });

  /** Sizing binds to the saved orientation and the current reviewed target only. */
  function referenceBlock(job: Job | null) {
    if (!job) return "Open a reconstructed job first.";
    if (!savedOrientation(job))
      return "Save orientation before target review and sizing.";
    const status = session.targetStatus;
    return status.status === "reviewed" ? "" : status.reason;
  }
  $("#live-preview").onclick = async () => {
    const built = buildSizing(draft);
    const blocked = referenceBlock(currentJob());
    if (built.error !== undefined || blocked) {
      previewError = built.error ?? blocked;
      return update();
    }
    previewError = "";
    $("#live-preview-output").textContent = "Requesting server preview…";
    try {
      await session.previewSizing(built.value.sizing, built.value.orientation);
      if (disposed) return;
      draftViewer = null;
      update();
    } catch (error) {
      if (error instanceof SessionCancelledError || disposed) return;
      if (isAuthError(error)) await handleError(error);
      previewError = describeError(error);
      update();
    }
  };

  $("#live-orient-preview").onclick = () => {
    const orientation = draftOrientation(draft);
    if (typeof orientation === "string") return toast(orientation);
    draftViewer = {
      orientation,
      label: "Draft orientation · unsaved · unscaled",
    };
    update();
  };
  $("#live-save-orientation").onclick = async () => {
    const orientation = draftOrientation(draft);
    if (typeof orientation === "string") return toast(orientation);
    try {
      // Numeric drafts stay; the session invalidates target and reference binding.
      await session.saveOrientation(orientation);
      if (disposed) return;
      draftViewer = null;
      update();
      toast(
        "Orientation saved. Review the target again, then confirm the reference full extent.",
      );
    } catch (error) {
      await handleError(error, "Orientation not saved");
    }
  };
  $("#live-mesh").onclick = () => {
    const job = currentJob();
    if (job?.mesh_path)
      void download(session.file(job.mesh_path), fileName(job, job.mesh_path));
  };
  $("#live-fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $(".viewport").requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser.");
    }
  };
  $("#live-edit-photos").onclick = () => ctx.onEditPhotos();
  $("#live-retry").onclick = () =>
    void session.refresh().then(retryArtifacts).catch(handleError);
  $("#live-generate").onclick = async () => {
    try {
      if (session.dirty || !currentJob()?.properties) {
        const built = buildReviewed(draft, origins);
        const blocked = referenceBlock(currentJob());
        if (built.error !== undefined || blocked)
          throw new Error(built.error ?? blocked);
        await session.saveAndProcess(built.value);
        if (!session.dirty) retainWorkspaceDraft(session, jobId, null);
      } else await session.process();
      if (!disposed)
        toast(
          "Simulation preparation requested. Status updates from the server.",
        );
    } catch (error) {
      await handleError(error, "Could not start simulation");
    }
  };
  $("#live-bundle").onclick = () => {
    const job = currentJob();
    if (job?.bundle_path)
      void download(
        () => session.downloadBundle(),
        fileName(job, job.bundle_path),
      );
  };

  // Outputs: status, diagnostics, reports and earlier attempts (all downloadable).
  $("#live-outputs").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-path]",
    );
    const job = currentJob();
    if (!button || !job) return;
    const path = button.dataset.path!;
    const attempt = button.dataset.attempt;
    if (button.dataset.kind === "bundle")
      void download(
        () => session.downloadBundle(attempt || undefined),
        fileName(job, path),
      );
    else void download(session.file(path), fileName(job, path));
  });

  function renderOutputs(job: Job) {
    const key = JSON.stringify([
      job.status,
      job.progress,
      job.updated_at,
      job.error,
      job.attempts?.length,
      reportSummary,
    ]);
    if (key === outputsKey) return;
    outputsKey = key;
    const fileButton = (
      label: string,
      path: string | null,
      kind = "file",
      attempt = "",
    ) =>
      path
        ? `<button class="secondary compact" type="button" data-kind="${kind}" data-path="${esc(path)}" data-attempt="${esc(attempt)}">${label}</button>`
        : "";
    const attempts = job.attempts ?? [];
    const running = job.status === "queued" || job.status === "reconstructing";
    $("#live-outputs").innerHTML =
      `<p class="live-status-line"><strong>${STATUS_LABEL[job.status]}</strong>${running ? ` <span class="muted">· ${Math.round(job.progress)}%</span>` : ""}</p>${job.status === "completed" && !job.bundle_path ? '<p class="muted small">Completed without a simulation bundle.</p>' : ""}${job.error ? `<p class="error">Diagnostics: ${esc(job.error.code)} — ${esc(job.error.message)}</p>` : ""}${reportSummary ? `<p class="small">${reportSummary}</p>` : ""}<div class="live-downloads">${job.status === "completed" ? fileButton("Simulation bundle", job.bundle_path, "bundle") : ""}${fileButton("Validation report", job.validation_path)}${fileButton("Scene XML", job.export_path)}</div>${attempts.length ? `<details class="live-attempts"><summary>Attempts (${attempts.length})</summary><ul>${attempts.map((a, i) => `<li><span>Attempt ${i + 1} · ${STATUS_LABEL[a.status]} · input revision ${a.inputs.input_revision}</span><span class="live-downloads">${a.status === "completed" ? fileButton("Bundle", a.bundle_path, "bundle", a.id) : ""}${fileButton("Report", a.validation_path)}${fileButton("Scene XML", a.export_path)}${fileButton("Inputs", a.inputs_path)}</span></li>`).join("")}</ul></details>` : ""}<p class="prototype-note">Export generation and validation are separate steps. A prepared export is not a validated simulation until its validation report passes.</p>`;
  }
  function syncReport(job: Job) {
    const path = job.validation_path;
    if ((path ?? "") === reportKey) return;
    reportKey = path ?? "";
    reportSummary = "";
    if (!path) return;
    session
      .report(path)
      .then((report) => {
        if (disposed || reportKey !== path) return;
        reportSummary = esc(
          `Validation ${report.passed ? "passed" : "did not pass"}${report.scope ? ` · ${report.scope}` : ""}${report.error ? ` · ${report.error}` : ""}`,
        );
        update();
      })
      .catch((error) => {
        if (disposed || reportKey !== path) return;
        reportSummary = esc(
          `Validation report unavailable: ${describeError(error)}`,
        );
        update();
      });
  }

  // Cache-first initial request; neither arrival nor provider failure changes the draft.
  const suggestionHost = $("#live-suggestions");
  async function loadProvenance() {
    try {
      const blob = await session.file("suggestions/gemini.json");
      const parsed = parseProvenance(JSON.parse(await blob.text()));
      provenance = parsed ?? "Model provenance unavailable.";
    } catch (error) {
      provenance = `Model provenance unavailable (${describeError(error)})`;
    }
    if (!disposed) renderSuggestions();
  }
  async function readSuggestions(
    read: () => Promise<Suggestions>,
    cached: boolean,
  ) {
    suggestionBusy = true;
    suggestionError = null;
    suggestionState = cached
      ? "Checking saved suggestions…"
      : "Requesting suggestions…";
    renderSuggestions();
    try {
      const values = await read();
      if (disposed) return;
      suggestions = values;
      suggestionState = cached
        ? "Estimates ready (not applied)."
        : "Suggestions ready (not applied).";
      provenance = null;
      void loadProvenance();
    } catch (error) {
      if (error instanceof SessionCancelledError || disposed) return;
      // Kept so this suggestion-only failure is not shown as a workspace error.
      suggestionError = error;
      suggestionState =
        cached && error instanceof ApiError && error.status === 404
          ? "No saved suggestions. Automatic request unavailable or already attempted; request explicitly or enter values manually."
          : describeError(error);
      if (isAuthError(error)) await handleError(error);
    } finally {
      suggestionBusy = false;
      if (!disposed) {
        renderSuggestions();
        update();
      }
    }
  }
  const request = (refresh: boolean) => {
    const hint = $<HTMLInputElement>("#live-hint").value.trim();
    void readSuggestions(
      () =>
        session.requestSuggestions({
          ...(hint ? { object_hint: hint } : {}),
          refresh,
        }),
      false,
    );
  };
  $("#live-suggest").onclick = () => request(false);
  $("#live-suggest-refresh").onclick = () => request(true);
  function renderSuggestions() {
    const s = suggestions;
    const scalar = (
      name: string,
      label: string,
      value: Scalar | null,
      unit: string,
    ) =>
      value
        ? `<label class="live-check"><input type="checkbox" name="${name}"> ${label} ${value.value} ${unit} · ${value.source}${value.note ? ` · ${esc(value.note)}` : ""}</label>`
        : `<p class="muted tiny">${label}: unknown — draft unchanged.</p>`;
    const p = provenance;
    const provenanceText =
      typeof p === "string"
        ? esc(p)
        : p
          ? esc(
              `Model ${p.model ?? "unknown"}${p.requested_model && p.requested_model !== p.model ? ` (requested ${p.requested_model})` : ""}${p.fallback_used ? " · fallback used" : ""}${p.object_hint ? ` · hint “${p.object_hint}”` : ""}${p.created_at ? ` · ${p.created_at}` : ""}`,
            )
          : s
            ? "Loading model provenance…"
            : "";
    suggestionHost.innerHTML = `<p class="muted small" role="status">${esc(suggestionState)}</p>${provenanceText ? `<p class="muted tiny">${provenanceText}</p>` : ""}${
      s
        ? `<div class="live-suggestion-values">${scalar("sg-mass", "Mass", s.mass_kg, "kg")}${scalar("sg-friction", "Friction", s.sliding_friction, "μ")}${
            s.dimensions_m
              ? `<fieldset class="live-axes"><legend class="tiny">Use one estimate as the sizing reference (${s.dimensions_m.source}). Proportions stay the mesh's own.</legend><label><input type="radio" name="sg-axis" value="" checked> None</label>${(["x", "y", "z"] as const).map((a) => `<label><input type="radio" name="sg-axis" value="${a}"> ${a.toUpperCase()} ${metres(s.dimensions_m![a])}</label>`).join("")}</fieldset>`
              : '<p class="muted tiny">Dimensions: unknown — reference unchanged.</p>'
          }${s.clarifying_questions.length ? `<ul class="tiny">${s.clarifying_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}${s.notes.length ? `<ul class="tiny muted">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}<button class="secondary compact" type="button" id="live-apply">Apply selected to draft</button></div>`
        : ""
    }`;
    const apply =
      suggestionHost.querySelector<HTMLButtonElement>("#live-apply");
    if (apply && s)
      apply.onclick = () => {
        const checked = (name: string) =>
          !!suggestionHost.querySelector<HTMLInputElement>(
            `[name="${name}"]:checked`,
          );
        const axis = (suggestionHost.querySelector<HTMLInputElement>(
          '[name="sg-axis"]:checked',
        )?.value ?? "") as SuggestionChoice["axis"];
        const result = applySuggestions(draft, origins, s, {
          mass: checked("sg-mass"),
          friction: checked("sg-friction"),
          axis,
        });
        if (!result.applied.length)
          return toast("Select at least one known value to apply.");
        draft = result.draft;
        origins = result.origins;
        writeDraft(draft);
        session.markDirty();
        toast(
          `Applied ${result.applied.join(", ")} to the draft. Review${axis ? ", confirm the reference correspondence" : ""} and save.`,
        );
      };
    syncSuggestButtons();
  }
  function syncSuggestButtons() {
    const blocked =
      suggestionBusy ||
      session.busy ||
      session.refreshing ||
      isRunning(currentJob());
    $<HTMLButtonElement>("#live-suggest").disabled = blocked;
    $<HTMLButtonElement>("#live-suggest-refresh").disabled = blocked;
  }

  let left = false;
  function update() {
    if (disposed || left) return;
    const job = currentJob();
    if (!job || !meshReady(job)) {
      left = true;
      return ctx.onLeave();
    }
    if (session.referenceEpoch !== seenEpoch) {
      // Source, selection, review or saved orientation changed: keep numbers, re-confirm.
      seenEpoch = session.referenceEpoch;
      if (draft.acknowledged) {
        draft = { ...draft, acknowledged: false };
        (form.elements.namedItem("acknowledged") as HTMLInputElement).checked =
          false;
        previewError =
          "Target or saved orientation changed. Your values are kept; confirm the reference full extent again, then preview and save.";
      }
    }
    const snapshot = inputSnapshot(job);
    if (snapshot !== savedInputSnapshot) {
      savedInputSnapshot = snapshot;
      if (session.refreshing && !session.busy) {
        draft.acknowledged = false;
        (form.elements.namedItem("acknowledged") as HTMLInputElement).checked =
          false;
        draftViewer = null;
        previewError =
          "Saved inputs changed on the server. Your draft is kept; review orientation and reference correspondence before saving again.";
        session.markDirty();
      }
    }
    const built = buildReviewed(draft, origins);
    const invalid = !!built.error;
    const editable =
      EDITABLE.includes(job.status) &&
      (job.status !== "failed" || canRetry(job));
    const working = session.busy || session.refreshing;
    const globalError =
      session.error && session.error !== suggestionError ? session.error : null;
    if (globalError && isAuthError(globalError)) void handleError(globalError);
    $("#live-status").textContent = STATUS_LABEL[job.status];
    const savedText = working
      ? "Working…"
      : session.dirty
        ? "Draft · Unsaved changes"
        : job.properties
          ? "Saved"
          : "Not yet saved";
    $("#live-saved").textContent = savedText;
    $("#live-save-status").textContent = editable
      ? savedText
      : "Editing paused while the server works";
    $("#live-form-error").textContent =
      session.dirty || job.properties ? (built.error ?? "") : "";
    $("#live-error").textContent = globalError
      ? describeError(globalError)
      : "";
    $("#live-retry").hidden = false;
    $("#live-retry").textContent = globalError
      ? "Retry status"
      : "Refresh status";
    $<HTMLButtonElement>("#live-retry").disabled = working;
    const orientationSaved = savedOrientation(job);
    const referenceBlocked = referenceBlock(job);
    $<HTMLButtonElement>("#live-save").disabled =
      working ||
      !session.dirty ||
      invalid ||
      !editable ||
      !!referenceBlocked ||
      session.target.loading;
    $<HTMLButtonElement>("#live-preview").disabled =
      working || !!referenceBlocked || session.target.loading;
    $("#live-target-gate").textContent = referenceBlocked
      ? `Reference sizing waits for the target: ${referenceBlocked}`
      : session.targetStatus.reason;
    const orientationButton = $<HTMLButtonElement>("#live-save-orientation");
    orientationButton.disabled =
      working ||
      !editable ||
      orientationSaved ||
      typeof draftOrientation(draft) === "string";
    $("#live-orientation-status").textContent = orientationSaved
      ? "Saved orientation"
      : "Unsaved orientation · save before target review";
    const gate = generateGate({
      job,
      dirty: session.dirty,
      working,
      invalid,
      orientationSaved,
      stageReady: canGenerate(job, session.dirty, working, invalid),
      target: session.target,
      targetStatus: session.targetStatus,
    });
    const generate = $<HTMLButtonElement>("#live-generate");
    const needsSave = session.dirty || !job.properties;
    const combinedReady =
      needsSave &&
      editable &&
      !working &&
      !invalid &&
      !session.target.loading &&
      !referenceBlocked;
    const reason = isRunning(job)
      ? "Processing saved inputs. Earlier downloads remain available."
      : combinedReady
        ? "Ready to save the reviewed inputs and generate a new attempt. Earlier downloads remain available."
        : gate.reason;
    generate.disabled = !(combinedReady || gate.allowed);
    generate.title = reason;
    $("#live-generate-reason").textContent = reason;
    generate.textContent =
      job.status === "preparing" || job.status === "validating"
        ? "Generating…"
        : needsSave
          ? job.status === "failed"
            ? "Save & retry"
            : "Save & generate"
          : job.status === "failed"
            ? "Retry simulation"
            : "Generate simulation";
    $("#live-bundle").hidden = !(job.status === "completed" && job.bundle_path);
    // Only a preview bound to the current reviewed target is shown as current sizing.
    const context = job.geometry_review?.geometry_context_sha256 ?? null;
    const preview =
      session.sizingPreview &&
      session.targetStatus.status === "reviewed" &&
      !!context &&
      session.sizingPreview.geometry_context_sha256 === context
        ? session.sizingPreview
        : null;
    $("#live-preview-output").innerHTML = previewError
      ? `<span class="error">${esc(previewError)}</span>`
      : preview
        ? `Server dimensions: X ${metres(preview.dimensions_m.x)} · Y ${metres(preview.dimensions_m.y)} · Z ${metres(preview.dimensions_m.z)} (${esc(preview.dimensions_m.source)})<br>Scale factors: ${preview.sizing_result.scale_factors.map((f) => f.toPrecision(4)).join(" · ")} · source extents ${preview.sizing_result.source_extents_input_units.map((v) => v.toPrecision(4)).join(" × ")} input units<br><span class="muted">Correspondence is user supplied and not verified by the server.</span>`
        : "";
    syncReport(job);
    renderOutputs(job);
    syncSuggestButtons();
    syncTarget(job);
    syncViewer(job);
    // A directly opened job may not have started source validation yet.
    const target = session.target;
    if (job.mesh_path && !target.inventory && !target.loading && !target.error)
      void session.loadGeometry(false);
    if (!initialEstimatesStarted && !isRunning(job) && !working) {
      initialEstimatesStarted = true;
      void readSuggestions(() => session.initialSuggestions(), true);
    }
  }

  const unsubscribe = session.subscribe(update);
  update();
  if (isRunning(initialJob)) {
    suggestionState =
      "Suggestions are available when the server is not processing.";
    renderSuggestions();
  }

  return () => {
    document.documentElement.classList.remove("live-workspace-page");
    host.classList.remove("live-workspace-host");
    retainWorkspaceDraft(
      session,
      jobId,
      session.dirty ? { draft, origins, referenceEpoch: seenEpoch } : null,
    );
    disposed = true;
    unsubscribe();
    disposeViewer();
    disposeTargetView();
    urls.forEach((url) => URL.revokeObjectURL(url));
  };
}
