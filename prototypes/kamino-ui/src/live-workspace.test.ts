// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../frontend/src/api";
import type { Api } from "../../../frontend/src/api";
import { mountViewer } from "../../../frontend/src/viewer";
import type { TargetInventory } from "../../../frontend/src/target-review";
import { BackendSession } from "./backend-session";
import type { Job, Suggestions } from "./backend-session";
import {
  applySuggestions,
  assemblyUrl,
  buildReviewed,
  buildSizing,
  canGenerate,
  describeError,
  draftFromJob,
  jobIdFromSearch,
  meshReady,
  isAuthError,
  parseProvenance,
  searchWithJob,
  toScalar,
  editWorkspaceDraft,
  retainWorkspaceDraft,
  restoreWorkspaceDraft,
  mountLiveWorkspace,
  type Draft,
} from "./live-workspace";

it("offers in-place team recovery only for a job ownership denial", () => {
  expect(isAuthError(new ApiError("Wrong browser", 403, { category: "job_access" }))).toBe(true);
  expect(isAuthError(new ApiError("Forbidden origin", 403))).toBe(false);
});

vi.mock("../../../frontend/src/viewer", () => ({
  mountViewer: vi.fn(() =>
    Object.assign(vi.fn(), {
      setMode: vi.fn(),
      resetCamera: vi.fn(),
      getViewState: vi.fn(() => ({
        direction: [0, 0, 1],
        targetOffset: [0.2, 0, 0],
        distanceRatio: 3,
      })),
    }),
  ),
}));
vi.mock("../../../frontend/src/target-review", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../frontend/src/target-review")
  >()),
  mountTargetGeometry: vi.fn(() => vi.fn()),
}));

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const orientation = { x_deg: 0, y_deg: 90, z_deg: 0 };
const source = "a".repeat(64);
const context = "d".repeat(64);
const [body, handle, stray] = ["b", "c", "e"].map((c) => c.repeat(64));
const triangle = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ],
  faces: [[0, 1, 2]],
};
const inventoryFor = (hash = source): TargetInventory => ({
  source_mesh_sha256: hash,
  algorithm: "surface-islands-exact-seams-v1",
  islands: [body, handle, stray].map((id, i) => ({
    id,
    label: ["Body", "Handle", "Stray"][i],
    node_index: 0,
    face_count: 1,
    vertex_count: 3,
    bounds_input_units: [
      [0, 0, 0],
      [1, 1, 0],
    ],
  })),
  geometry: { [body]: triangle, [handle]: triangle, [stray]: triangle },
});
const review = {
  source_mesh_sha256: source,
  island_ids: [body, handle],
  orientation,
  review_note: "Body and handle are one object",
  acknowledge_geometry: true,
  algorithm: "surface-islands-exact-seams-v1",
  geometry_context_sha256: context,
  reviewed_at: "2026-10-24T00:00:00Z",
  state: "user_reviewed_not_physically_verified" as const,
};
function job(changes: Partial<Job> = {}): Job {
  return {
    schema_version: "1.0",
    id: ID,
    status: "awaiting_properties",
    provider: "mock",
    synthetic: true,
    created_at: "2026-10-24T00:00:00Z",
    updated_at: "2026-10-24T00:00:00Z",
    progress: 100,
    source_images: ["uploads/00.png"],
    provider_task_id: null,
    mesh_path: "reconstruction/mesh.glb",
    properties: null,
    asset: null,
    export_path: null,
    validation_path: null,
    bundle_path: null,
    error: null,
    orientation,
    ...changes,
  };
}
const saved = job({
  properties: {
    dimensions_m: { x: 0.1, y: 0.2, z: 0.3, source: "measured" },
    mass_kg: { value: 0.4, source: "estimated", note: "Gemini: ceramic" },
    sliding_friction: null,
    sizing: {
      mode: "uniform",
      reviewed_orientation: orientation,
      reference: {
        axis: "z",
        length: 300,
        unit: "mm",
        source: "measured",
        correspondence: "full_mesh_extent",
        description: "Body and handle",
      },
    },
  },
});
/** Target reviewed and the saved reference bound to its geometry context. */
const reviewed = job({
  ...saved,
  input_revision: 3,
  geometry_review: review,
  properties: { ...saved.properties!, geometry_context_sha256: context },
});
const $ = <T extends HTMLElement = HTMLElement>(host: HTMLElement, s: string) =>
  host.querySelector<T>(s)!;
const islands = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLInputElement>("[data-target-island]"),
];
const loaded = (state: BackendSession) =>
  vi.waitFor(() => {
    expect(state.target.inventory).toBeTruthy();
    expect(state.target.loading).toBe(false);
  });
const generateDisabled = (host: HTMLElement) =>
  $<HTMLButtonElement>(host, "#live-generate").disabled;
const type = (el: HTMLElement, value: string) => {
  (el as HTMLInputElement | HTMLTextAreaElement).value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const complete = (draft: Partial<Draft> = {}): Draft => ({
  ...draftFromJob(saved).draft,
  ...draft,
});

describe("job URL state", () => {
  it("accepts only UUID job ids and preserves other parameters", () => {
    expect(jobIdFromSearch(`?job=${ID.toUpperCase()}`)).toBe(ID);
    expect(jobIdFromSearch("?job=../../etc")).toBeNull();
    expect(searchWithJob("?a=1", ID)).toBe(`?a=1&job=${ID}`);
    expect(searchWithJob(`?job=${ID}`, null)).toBe("");
  });
  it("opens the workspace only for a reconstructed mesh", () => {
    expect(meshReady(job({ status: "reconstructing" }))).toBe(false);
    expect(meshReady(job({ mesh_path: null }))).toBe(false);
    expect(meshReady(job({ status: "failed" }))).toBe(true);
    expect(meshReady(job())).toBe(true);
  });
  it("keeps the assembly link on http(s)", () => {
    expect(assemblyUrl("javascript:alert(1)")).toBe(
      "http://127.0.0.1:5173/assembly.html",
    );
    expect(assemblyUrl("")).toBe("http://127.0.0.1:5173/assembly.html");
    expect(assemblyUrl("https://example.test/assembly.html")).toBe(
      "https://example.test/assembly.html",
    );
  });
});

describe("draft from saved job", () => {
  it("defaults unknown friction to estimated without changing saved provenance", () => {
    const fresh = draftFromJob(job());
    expect(fresh.draft.frictionSource).toBe("estimated");
    expect(toScalar(fresh.draft.friction, fresh.draft.frictionSource, fresh.origins.friction))
      .toMatchObject({ value: 0.8, source: "estimated", note: expect.stringContaining("Fallback estimate") });
    expect(toScalar("0.4", fresh.draft.frictionSource, null)).toMatchObject({
      value: 0.4,
      source: "estimated",
    });
    const existing = job({
      properties: {
        ...saved.properties!,
        sliding_friction: {
          value: 0.3,
          source: "user_supplied",
          note: "Existing entry",
        },
      },
    });
    const reopened = draftFromJob(existing);
    expect(reopened.draft.frictionSource).toBe("user_supplied");
    expect(
      toScalar(
        reopened.draft.friction,
        reopened.draft.frictionSource,
        reopened.origins.friction,
      ),
    ).toEqual(existing.properties!.sliding_friction);
  });
  it("starts with a labelled friction fallback and blank mass and dimensions", () => {
    const { draft, origins, notice } = draftFromJob(job());
    expect([
      draft.mass,
      draft.friction,
      draft.length,
      draft.axis,
      draft.description,
    ]).toEqual(["", "0.8", "", "", ""]);
    expect(draft.acknowledged).toBe(false);
    expect(origins.mass).toBeNull();
    expect(origins.friction).toMatchObject({ value: 0.8, source: "estimated" });
    expect(notice).toBeNull();
    expect(buildReviewed(draft, origins).error).toBeTruthy();
  });
  it("loads saved values and provenance", () => {
    const { draft, origins } = draftFromJob(saved);
    expect(draft).toMatchObject({
      y: "90",
      axis: "z",
      length: "300",
      mass: "0.4",
      massSource: "estimated",
      acknowledged: true,
    });
    expect(origins.mass?.note).toBe("Gemini: ceramic");
  });
  it("flags legacy sizing instead of silently relabelling it", () => {
    const legacy = job({ properties: { ...saved.properties!, sizing: null } });
    expect(draftFromJob(legacy).notice).toMatch(/legacy/);
    expect(draftFromJob(legacy).draft.axis).toBe("");
  });
});

describe("reviewed inputs", () => {
  it("builds the accepted uniform sizing with friction blank as null", () => {
    const { draft, origins } = draftFromJob(saved);
    const built = buildReviewed(draft, origins);
    expect(built.error).toBeUndefined();
    expect(built.value).toMatchObject({
      orientation,
      sizing: {
        mode: "uniform",
        reviewed_orientation: orientation,
        reference: { axis: "z", correspondence: "full_mesh_extent" },
      },
      mass_kg: { value: 0.4, source: "estimated", note: "Gemini: ceramic" },
      sliding_friction: null,
    });
  });
  it("drops an origin note once the value or source changes", () => {
    const origin = { value: 0.4, source: "estimated" as const, note: "Gemini" };
    expect(toScalar("0.5", "estimated", origin)).toEqual({
      value: 0.5,
      source: "estimated",
    });
    expect(toScalar("0.4", "measured", origin)).toEqual({
      value: 0.4,
      source: "measured",
    });
    expect(toScalar(" ", "measured", origin)).toBeNull();
  });
  it("requires explicit full-extent acknowledgement and valid angles", () => {
    expect(buildSizing(complete({ acknowledged: false })).error).toMatch(
      /full mesh extent/,
    );
    expect(buildSizing(complete({ x: "181" })).error).toMatch(/−180/);
    expect(buildSizing(complete({ x: "" })).error).toMatch(/−180/);
    expect(
      buildReviewed(complete({ mass: "0" }), { mass: null, friction: null })
        .error,
    ).toMatch(/Mass/);
    expect(
      buildReviewed(complete({ friction: "-1" }), {
        mass: null,
        friction: null,
      }).error,
    ).toMatch(/Friction/);
  });
});

describe("suggestions", () => {
  const suggestions: Suggestions = {
    dimensions_m: {
      x: 0.12,
      y: 0.09,
      z: 0.1,
      source: "estimated",
      note: "rim to base",
    },
    mass_kg: { value: 0.32, source: "estimated", note: "ceramic" },
    sliding_friction: null,
    clarifying_questions: [],
    notes: [],
  };
  it("applies only selected known values and keeps unknown fields", () => {
    const { draft, origins } = draftFromJob(saved);
    const withFriction = { ...draft, friction: "0.5" };
    const result = applySuggestions(withFriction, origins, suggestions, {
      mass: true,
      friction: true,
      axis: "",
    });
    expect(result.draft.mass).toBe("0.32");
    expect(result.draft.friction).toBe("0.5");
    expect(result.origins.mass?.note).toBe("ceramic");
    expect(result.applied).toEqual(["mass"]);
    expect(withFriction.mass).toBe("0.4");
  });
  it("uses one dimension as the reference and requires re-acknowledgement", () => {
    const { draft, origins } = draftFromJob(saved);
    const result = applySuggestions(draft, origins, suggestions, {
      mass: false,
      friction: false,
      axis: "x",
    });
    expect(result.draft).toMatchObject({
      axis: "x",
      length: "0.12",
      unit: "m",
      referenceSource: "estimated",
      acknowledged: false,
    });
    expect(result.draft.description).toContain("rim to base");
    expect(buildSizing(result.draft).error).toBeTruthy();
  });
  it("reads optional model provenance defensively", () => {
    expect(
      parseProvenance({
        model: "m2",
        requested_model: "m1",
        fallback_used: true,
        fallback_models: ["m2", 3],
      }),
    ).toMatchObject({
      model: "m2",
      requested_model: "m1",
      fallback_used: true,
      fallback_models: ["m2"],
    });
    expect(parseProvenance([])).toBeNull();
  });
  it("describes structured suggestion errors", () => {
    const error = new ApiError("Gemini quota reached (HTTP 503)", 503, {
      category: "rate_limit",
      retryAfter: "5",
      manual_entry_available: true,
    });
    expect(describeError(error)).toBe(
      "Gemini quota reached (HTTP 503) Category: rate limit. Retry after 5 s. Manual entry remains available.",
    );
  });
});

describe("generate simulation", () => {
  it("only retries the accepted simulation failures", () => {
    expect(
      canGenerate(
        {
          ...saved,
          status: "failed",
          error: { code: "provider_failed", message: "Failed" },
        },
        false,
        false,
        false,
      ),
    ).toBe(false);
    expect(
      canGenerate(
        {
          ...saved,
          status: "failed",
          error: { code: "validation_failed", message: "Failed" },
        },
        false,
        false,
        false,
      ),
    ).toBe(true);
  });
  it("requires saved, current, non-dirty inputs", () => {
    expect(canGenerate(saved, false, false, false)).toBe(true);
    expect(canGenerate(saved, true, false, false)).toBe(false);
    expect(canGenerate(saved, false, true, false)).toBe(false);
    expect(canGenerate(saved, false, false, true)).toBe(false);
    expect(canGenerate(job(), false, false, false)).toBe(false);
    expect(
      canGenerate({ ...saved, status: "preparing" }, false, false, false),
    ).toBe(false);
    expect(
      canGenerate(
        { ...saved, orientation: { x_deg: 1, y_deg: 90, z_deg: 0 } },
        false,
        false,
        false,
      ),
    ).toBe(false);
  });
});

describe("retained manual drafts", () => {
  it("retains values and estimated notes per session and job without aliasing", () => {
    const state = new BackendSession({} as Api);
    const value = {
      draft: complete({ mass: "0.9" }),
      origins: draftFromJob(saved).origins,
    };
    retainWorkspaceDraft(state, saved.id, value);
    value.draft.mass = "99";
    expect(restoreWorkspaceDraft(state, saved)?.draft.mass).toBe("0.9");
    expect(restoreWorkspaceDraft(state, saved)?.origins.mass?.note).toBe(
      "Gemini: ceramic",
    );
    expect(restoreWorkspaceDraft(state, { ...saved, id: "other" })).toBeNull();
    expect(
      restoreWorkspaceDraft(new BackendSession({} as Api), saved),
    ).toBeNull();
    retainWorkspaceDraft(state, saved.id, null);
    expect(restoreWorkspaceDraft(state, saved)).toBeNull();
  });
  it("invalidates correspondence on rotation edits while retaining the reference draft", () => {
    const before = complete();
    const next = editWorkspaceDraft(before, { ...before, x: "90" });
    expect(next.acknowledged).toBe(false);
    expect(next.length).toBe(before.length);
    expect(before.acknowledged).toBe(true);
    expect(
      editWorkspaceDraft(before, { ...before, mass: "0.9" }).acknowledged,
    ).toBe(true);
  });
});

describe("live workspace DOM regressions", () => {
  const cleanups: (() => void)[] = [];
  const sessions: BackendSession[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    sessions.splice(0).forEach((state) => state.dispose());
    document.body.replaceChildren();
    vi.clearAllMocks();
  });
  function mounted(overrides: Partial<Api> = {}, current: Job = saved) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fixture"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    HTMLDialogElement.prototype.showModal = vi.fn();
    const adapter = {
      get: vi.fn(async () => current),
      file: vi.fn(async () => new Blob(["fixture"])),
      cachedSuggestions: vi.fn(async () => {
        throw new ApiError("No suggestions", 404);
      }),
      report: vi.fn(async () => ({ passed: true })),
      geometry: vi.fn(async () => inventoryFor()),
      previewSizing: vi.fn(async () => ({
        geometry_context_sha256: context,
        dimensions_m: saved.properties!.dimensions_m,
        sizing_result: {
          orientation,
          scale_factors: [0.1, 0.1, 0.1],
          source_extents_input_units: [1, 2, 3],
        },
      })),
      ...overrides,
    } as unknown as Api;
    const state = new BackendSession(adapter);
    state.job = current;
    sessions.push(state);
    const host = document.createElement("div");
    document.body.append(host);
    const mountContext = {
      session: state,
      brand: "",
      steps: "",
      icon: () => "",
      toast: vi.fn(),
      onEditPhotos: vi.fn(),
      onLeave: vi.fn(),
    };
    const mount = () => {
      const cleanup = mountLiveWorkspace(host, mountContext);
      cleanups.push(cleanup);
      return cleanup;
    };
    const cleanup = mount();
    return { state, host, adapter, mount, cleanup };
  }
  const estimate = (value: number | null): Suggestions => ({
    dimensions_m: null, mass_kg: null,
    sliding_friction: value === null ? null : { value, source: "estimated", note: "Estimated plastic contact" },
    notes: [], clarifying_questions: [],
  });
  it("automatically fills new-job friction and keeps an honest fallback when Gemini returns unknown", async () => {
    const { host, state } = mounted({ cachedSuggestions: vi.fn(async () => estimate(null)) }, job());
    await loaded(state);
    expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("0.8");
    expect($<HTMLSelectElement>(host, '[name="frictionSource"]').value).toBe("estimated");
    expect(host.textContent).toContain("Fallback estimate");
    expect(state.job!.properties).toBeNull();
    const origin = draftFromJob(job()).origins.friction;
    expect(origin?.note).toContain("not measured");
  });
  it("automatically uses cached Gemini friction without applying mass or saving", async () => {
    const { host, state } = mounted({ cachedSuggestions: vi.fn(async () => ({ ...estimate(0.35), mass_kg: { value: 0.5, source: "estimated" } })) }, job());
    await vi.waitFor(() => expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("0.35"));
    expect($<HTMLInputElement>(host, '[name="mass"]').value).toBe("");
    expect(state.job!.properties).toBeNull();
    expect(state.dirty).toBe(true);
  });
  it("does not overwrite a manual friction edit or clearing with a late estimate", async () => {
    let resolve!: (s: Suggestions) => void;
    const { host, state } = mounted({ cachedSuggestions: vi.fn(() => new Promise<Suggestions>(r => { resolve = r; })) }, job());
    await loaded(state);
    type($(host, '[name="friction"]'), "");
    resolve(estimate(0.35));
    await vi.waitFor(() => expect(host.textContent).toContain("Estimates ready"));
    expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("");
  });
  it("preserves saved unknown friction instead of replacing it with a new estimate", async () => {
    const { host } = mounted({ cachedSuggestions: vi.fn(async () => estimate(0.35)) });
    await vi.waitFor(() => expect(host.textContent).toContain("Estimates ready"));
    expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("");
  });
  it("keeps estimated fallback usable when the suggestions service fails", async () => {
    const { host } = mounted({ cachedSuggestions: vi.fn(async () => { throw new ApiError("Estimate unavailable", 503); }) }, job());
    await vi.waitFor(() => expect(host.textContent).toContain("Estimate unavailable"));
    expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("0.8");
    expect($<HTMLSelectElement>(host, '[name="frictionSource"]').value).toBe("estimated");
  });
  it("accepts an explicit zero estimate and preserves it across a workspace remount", async () => {
    const { host, cleanup, mount } = mounted({ cachedSuggestions: vi.fn(async () => estimate(0)) }, job());
    await vi.waitFor(() => expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("0"));
    type($(host, '[name="friction"]'), "0.21");
    cleanup();
    mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Estimates ready"));
    expect($<HTMLInputElement>(host, '[name="friction"]').value).toBe("0.21");
  });
  it("blocks actions while refreshing and retains numeric drafts when saved inputs change", async () => {
    let resolve!: (value: Job) => void;
    const waiting = new Promise<Job>((done) => {
      resolve = done;
    });
    const { host, state } = mounted({ get: vi.fn(() => waiting) });
    const refresh = state.refresh();
    expect(
      host.querySelector<HTMLButtonElement>("#live-generate")!.disabled,
    ).toBe(true);
    expect(host.querySelector<HTMLButtonElement>("#live-save")!.disabled).toBe(
      true,
    );
    const mass = host.querySelector<HTMLInputElement>('[name="mass"]')!;
    mass.value = "0.91";
    mass.dispatchEvent(new Event("input", { bubbles: true }));
    resolve({
      ...saved,
      input_revision: 2,
      properties: {
        ...saved.properties!,
        mass_kg: { value: 0.7, source: "measured" },
      },
    });
    await refresh;
    expect(mass.value).toBe("0.91");
    expect(state.dirty).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked,
    ).toBe(false);
    expect(host.querySelector("#live-preview-output")!.textContent).toContain(
      "Saved inputs changed",
    );
    expect(
      host.querySelector<HTMLButtonElement>("#live-generate")!.disabled,
    ).toBe(true);
  });
  it("does not mark an own successful save as a stale refreshed draft", async () => {
    const { host, state } = mounted(
      { save: vi.fn(async () => ({ ...reviewed, input_revision: 4 })) },
      reviewed,
    );
    await loaded(state);
    const mass = host.querySelector<HTMLInputElement>('[name="mass"]')!;
    mass.value = "0.9";
    mass.dispatchEvent(new Event("input", { bubbles: true }));
    await state.saveProperties(reviewed.properties!);
    expect(state.dirty).toBe(false);
    expect(
      host.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked,
    ).toBe(true);
  });
  it("disables Save for reconstruction failures but permits simulation correction", async () => {
    const { host, state } = mounted(
      {},
      {
        ...reviewed,
        status: "failed",
        error: { code: "provider_failed", message: "Failed" },
      },
    );
    await loaded(state);
    const mass = host.querySelector<HTMLInputElement>('[name="mass"]')!;
    mass.value = "0.9";
    mass.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host.querySelector<HTMLButtonElement>("#live-save")!.disabled).toBe(
      true,
    );
    state.job = {
      ...state.job!,
      error: { code: "validation_failed", message: "Failed" },
    };
    state.markDirty();
    expect(host.querySelector<HTMLButtonElement>("#live-save")!.disabled).toBe(
      false,
    );
  });
  it("replaces orientation-only preview with authoritative server scaling", async () => {
    const { host, state, adapter } = mounted({}, reviewed);
    await loaded(state);
    host.querySelector<HTMLButtonElement>("#live-orient-preview")!.click();
    host.querySelector<HTMLButtonElement>("#live-preview")!.click();
    await vi.waitFor(() =>
      expect(vi.mocked(mountViewer).mock.lastCall?.[5]).toEqual([
        0.1, 0.1, 0.1,
      ]),
    );
    expect(host.querySelector("#live-viewer-label")!.textContent).toContain(
      "Server sizing",
    );
    // Primary preview is the selected reviewed target, bound to its context.
    expect(vi.mocked(mountViewer).mock.lastCall?.[6]?.islandIds).toEqual(
      [body, handle].sort(),
    );
    expect(adapter.previewSizing).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ geometry_context_sha256: context }),
    );
  });
  it("shows Gemini notes and questions without changing manual values until explicit Apply", async () => {
    let deliver!: (suggestions: Suggestions) => void;
    const waiting = new Promise<Suggestions>((resolve) => {
      deliver = resolve;
    });
    const save = vi.fn();
    const { host, state } = mounted({
      cachedSuggestions: vi.fn(() => waiting),
      save,
    });
    const mass = host.querySelector<HTMLInputElement>('[name="mass"]')!;
    mass.value = "0.9";
    mass.dispatchEvent(new Event("input", { bubbles: true }));
    deliver({
      dimensions_m: null,
      mass_kg: {
        value: 0.32,
        source: "estimated",
        note: "Unverified ceramic estimate",
      },
      sliding_friction: null,
      notes: ["Image inference is uncertain", "Confirm the contacting surface"],
      clarifying_questions: ["Does the extent include the handle?"],
    });
    await vi.waitFor(() =>
      expect(host.querySelector("#live-suggestions")!.textContent).toContain(
        "Does the extent include the handle?",
      ),
    );
    expect(host.querySelector("#live-suggestions")!.textContent).toContain(
      "Image inference is uncertain",
    );
    expect(host.querySelector("#live-suggestions")!.textContent).toContain(
      "Confirm the contacting surface",
    );
    expect(mass.value).toBe("0.9");
    host.querySelector<HTMLInputElement>('[name="sg-mass"]')!.checked = true;
    host.querySelector<HTMLButtonElement>("#live-apply")!.click();
    expect(mass.value).toBe("0.32");
    expect(
      host.querySelector<HTMLSelectElement>('[name="massSource"]')!.value,
    ).toBe("estimated");
    expect(state.dirty).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector("#live-save")!.textContent).toContain(
      "Save reviewed properties",
    );
  });

  it("keeps unsaved fields and estimate origins across unmount and remount", () => {
    const { host, state, mount, cleanup } = mounted();
    expect(host.querySelector<HTMLButtonElement>("#live-retry")!.hidden).toBe(
      false,
    );
    expect(host.querySelector("#live-retry")!.textContent).toBe(
      "Refresh status",
    );
    const mass = host.querySelector<HTMLInputElement>('[name="mass"]')!;
    mass.value = "0.9";
    mass.dispatchEvent(new Event("input", { bubbles: true }));
    cleanup();
    mount();
    expect(host.querySelector<HTMLInputElement>('[name="mass"]')!.value).toBe(
      "0.9",
    );
    expect(state.dirty).toBe(true);
    expect(host.querySelector("#live-save-status")!.textContent).toContain(
      "Unsaved",
    );
    const x = host.querySelector<HTMLInputElement>('[name="x"]')!;
    x.value = "90";
    x.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      host.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked,
    ).toBe(false);
  });
  it("retries failed photos, viewer and report after token reentry without processing", async () => {
    const denied = new ApiError("Token needed", 401);
    const file = vi
      .fn()
      .mockRejectedValueOnce(denied)
      .mockResolvedValue(new Blob(["photo"]));
    const report = vi
      .fn()
      .mockRejectedValueOnce(denied)
      .mockResolvedValue({ passed: true });
    const process = vi.fn();
    const { host, adapter } = mounted(
      { file, report, process },
      {
        ...saved,
        status: "completed",
        validation_path: "attempts/a/report.json",
      },
    );
    await vi.waitFor(() =>
      expect(document.querySelector("dialog input")).toBeTruthy(),
    );
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
    dialog.querySelector<HTMLInputElement>("input")!.value =
      "application-token";
    dialog.returnValue = "ok";
    dialog.dispatchEvent(new Event("close"));
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(host.querySelector("#live-photos img")).toBeTruthy(),
    );
    expect(adapter.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mountViewer).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(process).not.toHaveBeenCalled();
  });
});

describe("live target review", () => {
  it.each(["selection", "note", "acknowledgement"])(
    "labels an unsaved target %s accurately without changing inputs or downloads",
    async (edit) => {
      const { host, state, adapter } = mounted(
        {},
        {
          ...reviewed,
          status: "completed",
          bundle_path: "attempts/a/bundle.zip",
        },
      );
      await loaded(state);
      expect($(host, "#live-saved").textContent).toBe("Saved");
      const original = structuredClone(state.target.draft);
      state.setTargetDraft({
        ...original,
        ...(edit === "selection"
          ? { selectedIslandIds: [body] }
          : edit === "note"
            ? { reviewNote: "A revised review note" }
            : { acknowledged: false }),
      });
      expect(state.dirty).toBe(false);
      expect($(host, "#live-saved").textContent).toBe(
        "Draft · Unsaved changes",
      );
      expect($(host, "#live-save-status").textContent).toBe(
        "Draft · Unsaved changes",
      );
      expect(generateDisabled(host)).toBe(true);
      if (edit === "selection")
        expect($<HTMLInputElement>(host, '[name="acknowledged"]').checked).toBe(
          false,
        );
      expect($<HTMLInputElement>(host, '[name="mass"]').value).toBe("0.4");
      expect($<HTMLInputElement>(host, '[name="length"]').value).toBe("300");
      expect($(host, "#live-bundle").hidden).toBe(false);
      expect(
        host.querySelector('#live-outputs [data-kind="bundle"]'),
      ).toBeTruthy();
      state.setTargetDraft(original);
      // Restoring a selection still requires explicit target acknowledgement.
      if (edit === "selection") state.setTargetDraft(original);
      expect(state.targetStatus.status).toBe("reviewed");
      expect($(host, "#live-saved").textContent).toBe(
        edit === "selection" ? "Reference review required" : "Saved",
      );
      expect(generateDisabled(host)).toBe(true);
      expect(adapter.save).not.toHaveBeenCalled();
      expect(adapter.process).not.toHaveBeenCalled();
    },
  );

  const cleanups: (() => void)[] = [];
  const sessions: BackendSession[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    sessions.splice(0).forEach((state) => state.dispose());
    document.body.replaceChildren();
    vi.clearAllMocks();
  });
  function mounted(overrides: Partial<Api> = {}, current: Job = saved) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fixture"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const adapter = {
      get: vi.fn(async () => current),
      file: vi.fn(async () => new Blob(["fixture"])),
      cachedSuggestions: vi.fn(async () => {
        throw new ApiError("No suggestions", 404);
      }),
      report: vi.fn(async () => ({ passed: true })),
      geometry: vi.fn(async () => inventoryFor()),
      previewSizing: vi.fn(async () => ({
        geometry_context_sha256: context,
        dimensions_m: saved.properties!.dimensions_m,
        sizing_result: {
          orientation,
          scale_factors: [0.1, 0.1, 0.1],
          source_extents_input_units: [1, 2, 3],
        },
      })),
      saveOrientation: vi.fn(),
      reviewGeometry: vi.fn(),
      save: vi.fn(async () => reviewed),
      process: vi.fn(),
      ...overrides,
    } as unknown as Api;
    const state = new BackendSession(adapter);
    state.job = current;
    sessions.push(state);
    const host = document.createElement("div");
    document.body.append(host);
    const liveContext = {
      session: state,
      brand: "",
      steps: "",
      icon: () => "",
      toast: vi.fn(),
      onEditPhotos: vi.fn(),
      onLeave: vi.fn(),
    };
    const mount = () => {
      const cleanup = mountLiveWorkspace(host, liveContext);
      cleanups.push(cleanup);
      return cleanup;
    };
    const cleanup = mount();
    return { state, host, adapter, mount, cleanup };
  }

  it("clears the legacy sizing notice only after a successful uniform save", async () => {
    const legacy = {
      ...reviewed,
      properties: { ...reviewed.properties!, sizing: null },
    };
    const save = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Save failed", 500))
      .mockResolvedValueOnce({ ...reviewed, input_revision: 4 });
    const { host, state } = mounted({ save }, legacy);
    await loaded(state);
    const notice = () => host.querySelector<HTMLElement>(".live-notice");
    expect(notice()?.textContent).toContain("legacy three-axis sizing");
    type($(host, '[name="length"]'), "300");
    expect(notice()?.textContent).toContain("legacy three-axis sizing");
    await expect(state.saveProperties(reviewed.properties!)).rejects.toThrow(
      "Save failed",
    );
    expect(notice()?.textContent).toContain("legacy three-axis sizing");
    await state.saveProperties(reviewed.properties!);
    expect(state.job?.properties?.sizing?.mode).toBe("uniform");
    expect(notice()?.textContent ?? "").toBe("");
    expect(notice()?.hidden ?? true).toBe(true);
    expect($<HTMLInputElement>(host, '[name="length"]').value).toBe("300");
  });

  it.each(["awaiting_properties", "failed"] as const)(
    "explicitly saves edited inputs before generating from %s",
    async (status) => {
      const before = {
        ...reviewed,
        status,
        error:
          status === "failed"
            ? { code: "validation_failed", message: "Retryable" }
            : null,
      };
      const save = vi.fn(async (_id, properties) => ({
        ...reviewed,
        properties,
        input_revision: 4,
      }));
      const process = vi.fn(async () => ({
        ...reviewed,
        status: "preparing" as const,
      }));
      const { host, state } = mounted({ save, process }, before);
      await loaded(state);
      type($(host, '[name="mass"]'), "0.58");
      const button = $<HTMLButtonElement>(host, "#live-generate");
      expect(button.textContent).toBe(
        status === "failed" ? "Save & retry" : "Save & generate",
      );
      expect(button.disabled).toBe(false);
      button.click();
      await vi.waitFor(() => expect(state.job?.status).toBe("preparing"));
      expect(save).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({
          mass_kg: expect.objectContaining({ value: 0.58 }),
          geometry_context_sha256: context,
        }),
      );
      expect(save.mock.invocationCallOrder[0]).toBeLessThan(
        process.mock.invocationCallOrder[0],
      );
    },
  );
  it("keeps combined generation blocked after target edits even with valid numeric drafts", async () => {
    const { host, state, adapter } = mounted({}, reviewed);
    await loaded(state);
    type($(host, '[name="mass"]'), "0.58");
    expect(generateDisabled(host)).toBe(false);
    state.setTargetDraft({ ...state.target.draft, selectedIslandIds: [body] });
    expect(generateDisabled(host)).toBe(true);
    expect($<HTMLInputElement>(host, '[name="acknowledged"]').checked).toBe(
      false,
    );
    expect(adapter.process).not.toHaveBeenCalled();
  });
  it("keeps photos before the viewer and inspector while retaining review and Home scrolling", () => {
    const { host, cleanup } = mounted({}, reviewed);
    expect(host.querySelector(".inspector #live-target")).not.toBeNull();
    expect(host.querySelector(".inspector .live-outputs")).not.toBeNull();
    expect(host.querySelector(".inspector .sources")).toBeNull();
    const photos = host.querySelector(".live-workspace > .sources");
    expect(photos).not.toBeNull();
    expect(
      photos!.compareDocumentPosition(
        host.querySelector(".workspace-center")!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(host.querySelectorAll(".sources")).toHaveLength(1);
    const inspector = host.querySelector(".inspector")!;
    expect(
      inspector
        .querySelector(".live-suggestions")!
        .compareDocumentPosition(inspector.querySelector("#live-form")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      document.documentElement.classList.contains("live-workspace-page"),
    ).toBe(true);
    cleanup();
    expect(
      document.documentElement.classList.contains("live-workspace-page"),
    ).toBe(false);
  });

  it("keeps all original source photos enlargable after retries and draft edits", async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    const { host, state, adapter } = mounted(
      {},
      { ...reviewed, source_images: ["uploads/00.png", "uploads/01.png"] },
    );
    await loaded(state);
    await vi.waitFor(() =>
      expect(host.querySelectorAll("#live-photos img")).toHaveLength(2),
    );
    host.querySelector<HTMLButtonElement>(".source-photo")!.click();
    expect(
      document.querySelector("dialog[open] img")!.getAttribute("src"),
    ).toBe("blob:fixture");
    document.querySelector("dialog")!.remove();
    type($(host, '[name="mass"]'), "0.5");
    host.querySelector<HTMLButtonElement>("#live-files-retry")!.click();
    await vi.waitFor(() =>
      expect(host.querySelectorAll("#live-photos img")).toHaveLength(2),
    );
    expect(host.querySelectorAll(".sources")).toHaveLength(1);
    expect(adapter.file).toHaveBeenCalledWith(ID, "uploads/01.png");
    expect(adapter.save).not.toHaveBeenCalled();
  });

  it("switches live display and resets its camera without editing or processing inputs", async () => {
    const { host, state, adapter } = mounted({}, reviewed);
    await loaded(state);
    const current = vi.mocked(mountViewer).mock.results.at(-1)!.value;
    const before = JSON.stringify(state.job);
    const reads = vi.mocked(adapter.cachedSuggestions).mock.calls.length;
    const mesh = host.querySelector<HTMLButtonElement>("#live-view-mesh");
    expect(mesh).not.toBeNull();
    mesh!.click();
    expect(mesh!.getAttribute("aria-pressed")).toBe("true");
    expect(
      host.querySelector("#live-view-studio")!.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(current.setMode).toHaveBeenCalledWith("mesh");
    host.querySelector<HTMLButtonElement>("#live-reset-camera")!.click();
    expect(current.resetCamera).toHaveBeenCalledOnce();
    expect(state.dirty).toBe(false);
    expect(JSON.stringify(state.job)).toBe(before);
    expect(adapter.save).not.toHaveBeenCalled();
    expect(adapter.saveOrientation).not.toHaveBeenCalled();
    expect(adapter.process).not.toHaveBeenCalled();
    expect(vi.mocked(adapter.cachedSuggestions).mock.calls.length).toBe(reads);
  });

  it.each(["orientation", "sizing"])(
    "preserves camera and mesh mode across a same-target %s preview",
    async (kind) => {
      const { host, state } = mounted({}, reviewed);
      await loaded(state);
      host.querySelector<HTMLButtonElement>("#live-view-mesh")!.click();
      if (kind === "orientation") {
        type($(host, '[name="x"]'), "45");
        host.querySelector<HTMLButtonElement>("#live-orient-preview")!.click();
      } else {
        host.querySelector<HTMLButtonElement>("#live-preview")!.click();
      }
      await vi.waitFor(() =>
        expect(vi.mocked(mountViewer).mock.lastCall?.[7]).toMatchObject({
          mode: "mesh",
          initialViewState: {
            direction: [0, 0, 1],
            targetOffset: [0.2, 0, 0],
            distanceRatio: 3,
          },
        }),
      );
      if (kind === "sizing")
        expect(vi.mocked(mountViewer).mock.lastCall?.[5]).toEqual([
          0.1, 0.1, 0.1,
        ]);
    },
  );

  it("fits a new target or source but preserves the camera when selected island order changes", async () => {
    let currentInventory = inventoryFor();
    const { state } = mounted(
      { geometry: vi.fn(async () => currentInventory) },
      reviewed,
    );
    await loaded(state);
    const mounts = vi.mocked(mountViewer).mock.calls.length;
    state.setTargetDraft({
      ...state.target.draft,
      selectedIslandIds: [handle, body],
    });
    expect(vi.mocked(mountViewer).mock.calls.length).toBe(mounts);
    // An orientation preview remounts the same target even if the source selection order differs.
    state.setTargetDraft({ ...state.target.draft, selectedIslandIds: [body] });
    expect(
      vi.mocked(mountViewer).mock.lastCall?.[7]?.initialViewState,
    ).toBeNull();
    currentInventory = inventoryFor("f".repeat(64));
    await state.loadGeometry(true);
    expect(
      vi.mocked(mountViewer).mock.lastCall?.[7]?.initialViewState,
    ).toBeNull();
  });

  it("does not reuse another job's view when remounting the workspace", async () => {
    const { state, cleanup, mount } = mounted({}, reviewed);
    await loaded(state);
    cleanup();
    state.job = { ...reviewed, id: "22222222-2222-4222-8222-222222222222" };
    mount();
    expect(
      vi.mocked(mountViewer).mock.lastCall?.[7]?.initialViewState,
    ).toBeNull();
    expect(vi.mocked(mountViewer).mock.lastCall?.[7]?.mode).toBe("studio");
  });

  it("starts initial estimates once processing returns to an editable workspace", async () => {
    sessionStorage.clear();
    const suggestions = vi.fn(async () => ({
      dimensions_m: null,
      mass_kg: null,
      sliding_friction: null,
      notes: [],
      clarifying_questions: [],
    }));
    const { state, adapter } = mounted(
      { get: vi.fn(async () => reviewed), suggestions },
      { ...reviewed, status: "validating" },
    );
    expect(adapter.cachedSuggestions).not.toHaveBeenCalled();
    await state.refresh();
    await vi.waitFor(() =>
      expect(suggestions).toHaveBeenCalledExactlyOnceWith(ID, {
        refresh: false,
      }),
    );
    state.markDirty();
    expect(suggestions).toHaveBeenCalledTimes(1);
    sessionStorage.clear();
  });

  it("shows every source island unselected and saves an explicit multipart review", async () => {
    // Server clears the reference binding when the new review is saved.
    const afterReview = job({
      ...saved,
      input_revision: 2,
      geometry_review: review,
    });
    const reviewGeometry = vi.fn(async () => afterReview);
    const { host, state, adapter } = mounted({ reviewGeometry });
    await loaded(state);
    expect(islands(host).map((box) => [box.value, box.checked])).toEqual([
      [body, false],
      [handle, false],
      [stray, false],
    ]);
    expect(generateDisabled(host)).toBe(true);
    expect($<HTMLButtonElement>(host, "#live-preview").disabled).toBe(true);
    islands(host)[0].click();
    islands(host)[1].click();
    type($(host, "#target-review-note"), "Body and handle are one object");
    $<HTMLInputElement>(host, "#target-review-ack").click();
    expect(state.target.draft).toEqual({
      selectedIslandIds: [body, handle],
      reviewNote: "Body and handle are one object",
      acknowledged: true,
    });
    $<HTMLButtonElement>(host, "#save-target-review").click();
    await vi.waitFor(() => expect(state.job).toBe(afterReview));
    expect(reviewGeometry).toHaveBeenCalledWith(ID, {
      source_mesh_sha256: source,
      island_ids: [body, handle],
      orientation,
      review_note: "Body and handle are one object",
      acknowledge_geometry: true,
      expected_input_revision: 1,
    });
    // Reference invalidated: numbers kept, full-extent ack required again.
    const ack = $<HTMLInputElement>(host, '[name="acknowledged"]');
    expect(ack.checked).toBe(false);
    expect($<HTMLInputElement>(host, '[name="mass"]').value).toBe("0.4");
    expect($<HTMLInputElement>(host, '[name="length"]').value).toBe("300");
    expect(generateDisabled(host)).toBe(true);
    expect($(host, "#live-generate-reason").textContent).toMatch(
      /reference correspondence/,
    );
    // Explicit re-acknowledgement and Save bind the reference to the new context.
    ack.click();
    $<HTMLButtonElement>(host, "#live-save").click();
    await vi.waitFor(() => expect(generateDisabled(host)).toBe(false));
    expect(adapter.save).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ geometry_context_sha256: context }),
    );
    expect(adapter.saveOrientation).not.toHaveBeenCalled();
  });

  it("blocks Generate synchronously on refresh and ignores a late stale inventory", async () => {
    const { host, state, adapter } = mounted({}, reviewed);
    await loaded(state);
    expect(generateDisabled(host)).toBe(false);
    const mass = $<HTMLInputElement>(host, '[name="mass"]');
    const pending: ((value: TargetInventory) => void)[] = [];
    vi.mocked(adapter.geometry).mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const first = state.refresh();
    expect(generateDisabled(host)).toBe(true);
    await first;
    expect(generateDisabled(host)).toBe(true);
    const second = state.refresh();
    await second;
    pending[0](inventoryFor());
    await Promise.resolve();
    expect(state.target.loading).toBe(true);
    expect(generateDisabled(host)).toBe(true);
    pending[1](inventoryFor("9".repeat(64)));
    await vi.waitFor(() => expect(state.target.loading).toBe(false));
    expect(islands(host).every((box) => !box.checked)).toBe(true);
    expect(generateDisabled(host)).toBe(true);
    expect($<HTMLInputElement>(host, '[name="acknowledged"]').checked).toBe(
      false,
    );
    expect(mass.value).toBe("0.4");
  });

  it("keeps target and numeric drafts across status refresh and remount", async () => {
    const unreviewed = job({ ...saved, input_revision: 2 });
    const { host, state, mount, cleanup } = mounted({}, unreviewed);
    await loaded(state);
    islands(host)[2].click();
    const note = $<HTMLTextAreaElement>(host, "#target-review-note");
    note.focus();
    type(note, "Only the stray part");
    type($(host, '[name="mass"]'), "0.91");
    await state.refresh();
    await loaded(state);
    expect($(host, "#target-review-note")).toBe(note);
    expect(note.value).toBe("Only the stray part");
    expect(islands(host)[2].checked).toBe(true);
    expect($<HTMLInputElement>(host, '[name="mass"]').value).toBe("0.91");
    cleanup();
    mount();
    expect(islands(host).map((box) => box.checked)).toEqual([
      false,
      false,
      true,
    ]);
    expect($<HTMLTextAreaElement>(host, "#target-review-note").value).toBe(
      "Only the stray part",
    );
    expect($<HTMLInputElement>(host, '[name="mass"]').value).toBe("0.91");
    expect(generateDisabled(host)).toBe(true);
  });

  it("saves orientation separately, keeping numbers and requiring a new target review", async () => {
    const turned = { x_deg: 10, y_deg: 90, z_deg: 0 };
    const saveOrientation = vi.fn(async () =>
      job({ ...reviewed, orientation: turned }),
    );
    const { host, state } = mounted({ saveOrientation }, reviewed);
    await loaded(state);
    const button = $<HTMLButtonElement>(host, "#live-save-orientation");
    expect(button.disabled).toBe(true);
    type($(host, '[name="x"]'), "10");
    type($(host, '[name="mass"]'), "0.9");
    expect(generateDisabled(host)).toBe(true);
    expect(button.disabled).toBe(false);
    expect($<HTMLButtonElement>(host, "#save-target-review").disabled).toBe(
      true,
    );
    button.click();
    await vi.waitFor(() => expect(state.job?.orientation).toEqual(turned));
    expect(saveOrientation).toHaveBeenCalledWith(ID, turned);
    expect($<HTMLInputElement>(host, '[name="x"]').value).toBe("10");
    expect($<HTMLInputElement>(host, '[name="mass"]').value).toBe("0.9");
    expect($<HTMLInputElement>(host, '[name="length"]').value).toBe("300");
    expect(state.targetStatus.status).toBe("stale");
    expect(generateDisabled(host)).toBe(true);
    expect($<HTMLButtonElement>(host, "#save-target-review").disabled).toBe(
      false,
    );
  });

  it("keeps old completed downloads accessible without a current review", async () => {
    const done = job({
      ...saved,
      status: "completed",
      bundle_path: "attempts/a/bundle.zip",
      validation_path: "attempts/a/report.json",
    });
    const { host, state } = mounted({}, done);
    await loaded(state);
    expect($(host, "#live-bundle").hidden).toBe(false);
    expect(
      host.querySelector('#live-outputs [data-kind="bundle"]'),
    ).toBeTruthy();
    expect(generateDisabled(host)).toBe(true);
  });
});
