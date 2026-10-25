// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../frontend/src/api";
import type { Api } from "../../../frontend/src/api";
import { mountViewer } from "../../../frontend/src/viewer";
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
  parseProvenance,
  searchWithJob,
  toScalar,
  editWorkspaceDraft,
  retainWorkspaceDraft,
  restoreWorkspaceDraft,
  mountLiveWorkspace,
  type Draft,
} from "./live-workspace";

vi.mock("../../../frontend/src/viewer", () => ({
  mountViewer: vi.fn(() => vi.fn()),
}));

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const orientation = { x_deg: 0, y_deg: 90, z_deg: 0 };
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
  it("starts blank without saved values and never fabricates them", () => {
    const { draft, origins, notice } = draftFromJob(job());
    expect([
      draft.mass,
      draft.friction,
      draft.length,
      draft.axis,
      draft.description,
    ]).toEqual(["", "", "", "", ""]);
    expect(draft.acknowledged).toBe(false);
    expect(origins).toEqual({ mass: null, friction: null });
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
      previewSizing: vi.fn(async () => ({
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
    const context = {
      session: state,
      brand: "",
      steps: "",
      icon: () => "",
      toast: vi.fn(),
      onEditPhotos: vi.fn(),
      onLeave: vi.fn(),
    };
    const mount = () => {
      const cleanup = mountLiveWorkspace(host, context);
      cleanups.push(cleanup);
      return cleanup;
    };
    const cleanup = mount();
    return { state, host, adapter, mount, cleanup };
  }
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
    const { host, state } = mounted({
      save: vi.fn(async () => ({ ...saved, input_revision: 2 })),
    });
    const mass = host.querySelector<HTMLInputElement>('[name="mass"]')!;
    mass.value = "0.9";
    mass.dispatchEvent(new Event("input", { bubbles: true }));
    await state.saveProperties(saved.properties!);
    expect(state.dirty).toBe(false);
    expect(
      host.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked,
    ).toBe(true);
  });
  it("disables Save for reconstruction failures but permits simulation correction", () => {
    const { host, state } = mounted(
      {},
      {
        ...saved,
        status: "failed",
        error: { code: "provider_failed", message: "Failed" },
      },
    );
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
    const { host } = mounted();
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
