import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendSession,
  SessionCancelledError,
  type Job,
  type Orientation,
  type Properties,
  type Sizing,
  type SizingPreview,
} from "./backend-session";
import { ApiError, type Api } from "../../../frontend/src/api";
import type {
  TargetInventory,
  TargetReview,
} from "../../../frontend/src/target-review";

const orientation: Orientation = { x_deg: 0, y_deg: 0, z_deg: 0 };
const source = "a".repeat(64),
  first = "b".repeat(64),
  second = "c".repeat(64),
  context = "d".repeat(64);
const inventory: TargetInventory = {
  source_mesh_sha256: source,
  algorithm: "surface-islands-exact-seams-v1",
  islands: [first, second].map((id, i) => ({
    id,
    label: `Surface ${i + 1}`,
    node_index: 0,
    face_count: 12,
    vertex_count: 8,
    bounds_input_units: [
      [0, 0, 0],
      [1, 1, 1],
    ],
  })),
  geometry: {},
};
const review: TargetReview = {
  source_mesh_sha256: source,
  island_ids: [first],
  orientation,
  review_note: "Reviewed first surface",
  acknowledge_geometry: true,
  algorithm: inventory.algorithm,
  geometry_context_sha256: context,
  reviewed_at: "2026-10-25T00:00:00Z",
  state: "user_reviewed_not_physically_verified",
};
const sizing: Sizing = {
  mode: "uniform",
  reviewed_orientation: orientation,
  reference: {
    axis: "x",
    length: 120,
    unit: "mm",
    source: "user_supplied",
    correspondence: "full_mesh_extent",
    description: "Reviewed full extent",
  },
};
const properties: Properties = {
  geometry_context_sha256: context,
  dimensions_m: { x: 0.12, y: 0.08, z: 0.06, source: "estimated" },
  mass_kg: { value: 0.34, source: "user_supplied" },
  sliding_friction: null,
  sizing,
};
const preview: SizingPreview = {
  geometry_context_sha256: context,
  dimensions_m: properties.dimensions_m,
  sizing_result: {
    mode: "uniform",
    orientation,
    source_extents_input_units: [3, 2, 1.5],
    scale_factors: [0.04, 0.04, 0.04],
    resulting_dimensions_m: properties.dimensions_m,
    reference_extent_input_units: 3,
    geometry_review: "unverified",
  },
};
function job(changes: Partial<Job> = {}): Job {
  return {
    geometry_review: review,
    input_revision: 1,
    schema_version: "1.0",
    id: "job-a",
    status: "awaiting_properties",
    provider: "mock",
    synthetic: true,
    created_at: "2026-10-25T00:00:00Z",
    updated_at: "2026-10-25T00:00:00Z",
    progress: 100,
    source_images: ["uploads/00.png"],
    provider_task_id: null,
    mesh_path: "reconstruction/mesh.obj",
    properties,
    asset: null,
    export_path: null,
    validation_path: null,
    bundle_path: null,
    error: null,
    orientation,
    ...changes,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function api(overrides: Partial<Api> = {}): Api {
  return {
    geometry: vi.fn(async () => inventory),
    reviewGeometry: vi.fn(async (_id, request) =>
      job({
        input_revision: 2,
        geometry_review: {
          ...review,
          ...request,
          geometry_context_sha256: context,
        },
        properties: { ...properties, geometry_context_sha256: null },
      }),
    ),
    health: vi.fn(async () => ({ status: "ok", provider: "mock" })),
    create: vi.fn(async () => job()),
    get: vi.fn(async () => job()),
    save: vi.fn(async () => job()),
    saveOrientation: vi.fn(async () => job()),
    previewSizing: vi.fn(async () => preview),
    cachedSuggestions: vi.fn(async () => ({
      dimensions_m: null,
      mass_kg: null,
      sliding_friction: null,
      notes: [],
      clarifying_questions: [],
    })),
    suggestions: vi.fn(async () => ({
      dimensions_m: null,
      mass_kg: null,
      sliding_friction: null,
      notes: [],
      clarifying_questions: [],
    })),
    process: vi.fn(async () => job({ status: "preparing" })),
    file: vi.fn(async () => new Blob(["server bytes"])),
    fileUrl: vi.fn(() => "unused"),
    report: vi.fn(async () => ({ passed: true })),
    ...overrides,
  };
}
const sessions: BackendSession[] = [];
function session(adapter: Api) {
  const result = new BackendSession(adapter, { pollIntervalMs: 25 });
  sessions.push(result);
  return result;
}
afterEach(() => {
  sessions.forEach((value) => value.dispose());
  sessions.length = 0;
  vi.useRealTimers();
});

describe("live backend session", () => {
  it.each(["inventory-first", "metadata-first"])(
    "keeps failed metadata blocked in %s order even when geometry succeeds",
    async (order) => {
      const metadata = deferred<Job>(),
        geometry = deferred<TargetInventory>();
      const adapter = api();
      const state = session(adapter);
      await state.restore("job-a");
      adapter.get = vi.fn(() => metadata.promise);
      adapter.geometry = vi.fn(() => geometry.promise);
      const reading = state.refresh().catch((error) => error);
      if (order === "inventory-first") {
        geometry.resolve(inventory);
        await vi.waitFor(() => expect(state.target.loading).toBe(false));
        metadata.reject(new ApiError("Status offline"));
      } else {
        metadata.reject(new ApiError("Status offline"));
        expect(await reading).toBeInstanceOf(ApiError);
        geometry.resolve(inventory);
      }
      expect(await reading).toBeInstanceOf(ApiError);
      await vi.waitFor(() => expect(state.target.loading).toBe(false));
      expect(state.refreshing).toBe(false);
      expect(state.targetStatus.canProcess).toBe(false);
      expect(state.targetStatus.reason).toContain(
        "Job status could not be refreshed",
      );
      adapter.geometry = vi.fn(async () => inventory);
      await state.loadGeometry(true);
      expect(state.targetStatus.canProcess).toBe(false);
      await expect(state.process()).rejects.toThrow("Retry status");
      expect(adapter.process).not.toHaveBeenCalled();
      adapter.get = vi.fn(async () => job());
      await state.refresh();
      expect(state.targetStatus.canProcess).toBe(true);
      await state.process();
      expect(adapter.process).toHaveBeenCalledOnce();
    },
  );

  it("does not turn a failed old metadata read into a failure after a newer confirmed save", async () => {
    const metadata = deferred<Job>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    adapter.get = vi.fn(() => metadata.promise);
    const reading = state.refresh().catch((error) => error);
    await vi.waitFor(() => expect(state.target.loading).toBe(false));
    adapter.save = vi.fn(async () => job({ input_revision: 2 }));
    await state.saveProperties(properties);
    metadata.reject(new ApiError("Abandoned status failure"));
    expect(await reading).toBeInstanceOf(ApiError);
    expect(state.refreshing).toBe(false);
    expect(state.job?.input_revision).toBe(2);
    expect(state.targetStatus.canProcess).toBe(true);
    expect(state.error).toBeNull();
  });

  it("does not let optional Gemini unavailability block generation with fresh reviewed job metadata", async () => {
    const unavailable = new ApiError("Gemini unavailable", 503, {
      category: "not_configured",
      manual_entry_available: true,
    });
    const adapter = api({
      suggestions: vi.fn(async () => {
        throw unavailable;
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    await expect(state.requestSuggestions()).rejects.toBe(unavailable);
    expect(state.error).toBe(unavailable);
    expect(state.targetStatus.canProcess).toBe(true);
    await state.process();
    expect(adapter.process).toHaveBeenCalledOnce();
  });

  it("retains newer target drafts when a source-only inventory read finishes after orientation save", async () => {
    const geometry = deferred<TargetInventory>();
    const rotated = { x_deg: 90, y_deg: 0, z_deg: 0 };
    const adapter = api({
      saveOrientation: vi.fn(async () =>
        job({
          orientation: rotated,
          properties: { ...properties, geometry_context_sha256: null },
        }),
      ),
    });
    const state = session(adapter);
    await state.restore("job-a");
    adapter.geometry = vi.fn(() => geometry.promise);
    const loading = state.loadGeometry(true);
    await state.saveOrientation(rotated);
    state.setTargetDraft({
      selectedIslandIds: [second],
      reviewNote: "Recheck second surface after rotation",
      acknowledged: false,
    });
    state.setTargetDraft({ ...state.target.draft, acknowledged: true });
    geometry.resolve(inventory);
    await loading;
    expect(state.job?.orientation).toEqual(rotated);
    expect(state.target.draft).toEqual({
      selectedIslandIds: [second],
      reviewNote: "Recheck second surface after rotation",
      acknowledged: true,
    });
    expect(state.targetStatus.status).toBe("stale");
    expect(state.targetStatus.canProcess).toBe(false);
  });

  it("does not overwrite a newer saved context or subsequent note draft with a pending inventory read", async () => {
    const reviewSaving = deferred<Job>(),
      geometry = deferred<TargetInventory>();
    const newContext = "e".repeat(64);
    const adapter = api({ reviewGeometry: vi.fn(() => reviewSaving.promise) });
    const state = session(adapter);
    await state.restore("job-a");
    const saving = state.saveTargetReview();
    adapter.geometry = vi.fn(() => geometry.promise);
    const loading = state.loadGeometry(true);
    reviewSaving.resolve(
      job({
        input_revision: 2,
        geometry_review: { ...review, geometry_context_sha256: newContext },
        properties: { ...properties, geometry_context_sha256: null },
      }),
    );
    await saving;
    state.setTargetDraft({
      ...state.target.draft,
      reviewNote: "New local note",
    });
    geometry.resolve(inventory);
    await loading;
    expect(state.job?.geometry_review?.geometry_context_sha256).toBe(
      newContext,
    );
    expect(state.target.draft.reviewNote).toBe("New local note");
    expect(state.targetStatus.status).toBe("unsaved");
    expect(state.targetStatus.canProcess).toBe(false);
  });
  it("starts a new job with no selected surface and requires review then explicit reference save", async () => {
    let saved = job({
      geometry_review: null,
      properties: { ...properties, geometry_context_sha256: null },
    });
    const adapter = api({
      get: vi.fn(async () => saved),
      reviewGeometry: vi.fn(async (_id, request) => {
        saved = job({
          ...saved,
          input_revision: 2,
          geometry_review: { ...review, ...request },
          properties: { ...properties, geometry_context_sha256: null },
        });
        return saved;
      }),
      save: vi.fn(async (_id, value) => {
        saved = job({ ...saved, input_revision: 3, properties: value });
        return saved;
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    expect(state.target.draft.selectedIslandIds).toEqual([]);
    await expect(state.process()).rejects.toThrow("Choose the surfaces");
    state.setTargetDraft({
      selectedIslandIds: [first, second],
      reviewNote: "Both pieces belong together",
      acknowledged: true,
    });
    expect(state.target.draft.acknowledged).toBe(false);
    state.setTargetDraft({ ...state.target.draft, acknowledged: true });
    await state.saveTargetReview();
    expect(adapter.reviewGeometry).toHaveBeenCalledWith("job-a", {
      source_mesh_sha256: source,
      island_ids: [first, second],
      orientation,
      review_note: "Both pieces belong together",
      acknowledge_geometry: true,
      expected_input_revision: 1,
    });
    expect(state.targetStatus.status).toBe("reviewed");
    expect(state.targetStatus.referenceReady).toBe(false);
    await expect(state.process()).rejects.toThrow("reference correspondence");
    await state.saveReviewed({
      orientation,
      sizing,
      mass_kg: properties.mass_kg,
      sliding_friction: null,
    });
    expect(adapter.saveOrientation).not.toHaveBeenCalled();
    expect(adapter.save).toHaveBeenCalledWith("job-a", {
      ...properties,
      geometry_context_sha256: context,
    });
    expect(state.targetStatus.canProcess).toBe(true);
    await state.process();
    expect(adapter.process).toHaveBeenCalledOnce();
  });

  it("requires saving changed orientation before target review and does not silently rotate during property save", async () => {
    const rotated = { x_deg: 90, y_deg: 0, z_deg: 0 };
    const adapter = api({
      saveOrientation: vi.fn(async () =>
        job({
          orientation: rotated,
          properties: { ...properties, geometry_context_sha256: null },
        }),
      ),
    });
    const state = session(adapter);
    await state.restore("job-a");
    const epoch = state.referenceEpoch;
    await state.saveOrientation(orientation);
    expect(adapter.saveOrientation).not.toHaveBeenCalled();
    expect(state.referenceEpoch).toBe(epoch);
    await expect(
      state.saveReviewed({
        orientation: rotated,
        sizing: { ...sizing, reviewed_orientation: rotated },
        mass_kg: properties.mass_kg,
        sliding_friction: null,
      }),
    ).rejects.toThrow("Save orientation");
    expect(adapter.save).not.toHaveBeenCalled();
    await state.saveOrientation(rotated);
    expect(state.referenceEpoch).toBeGreaterThan(epoch);
    expect(state.target.draft.acknowledged).toBe(false);
    expect(state.targetStatus.status).toBe("stale");
    await expect(
      state.previewSizing(
        { ...sizing, reviewed_orientation: rotated },
        rotated,
      ),
    ).rejects.toThrow("changed");
  });

  it("retains unsaved target selection and notes across metadata refresh while invalidating reference selection", async () => {
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    await state.previewSizing(sizing, orientation);
    const epoch = state.referenceEpoch;
    state.markDirty();
    state.setTargetDraft({
      selectedIslandIds: [second],
      reviewNote: "Inspect this other piece",
      acknowledged: false,
    });
    expect(state.referenceEpoch).toBeGreaterThan(epoch);
    state.setTargetDraft({ ...state.target.draft, acknowledged: true });
    adapter.get = vi.fn(async () => job({ input_revision: 7 }));
    await state.refresh();
    expect(state.target.draft).toEqual({
      selectedIslandIds: [second],
      reviewNote: "Inspect this other piece",
      acknowledged: true,
    });
    expect(state.dirty).toBe(true);
    expect(state.sizingPreview).toBeNull();
    expect(state.targetStatus.status).toBe("unsaved");
    await expect(state.process()).rejects.toThrow("Save your changes");
  });

  it.each(["stale-first", "fresh-first"])(
    "forced geometry revalidation wins in %s completion order",
    async (order) => {
      const old = deferred<TargetInventory>(),
        fresh = deferred<TargetInventory>(),
        metadata = deferred<Job>();
      const adapter = api();
      const state = session(adapter);
      await state.restore("job-a");
      state.markDirty();
      const epoch = state.referenceEpoch;
      adapter.geometry = vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(fresh.promise);
      const abandoned = state.loadGeometry(true);
      adapter.get = vi.fn(() => metadata.promise);
      const refreshed = state.refresh();
      expect(adapter.geometry).toHaveBeenCalledTimes(2);
      expect(state.target.loading).toBe(true);
      expect(state.targetStatus.canProcess).toBe(false);
      const newInventory = { ...inventory, source_mesh_sha256: "e".repeat(64) };
      if (order === "stale-first") {
        old.resolve(inventory);
        await abandoned;
        expect(state.target.loading).toBe(true);
        fresh.resolve(newInventory);
      } else {
        fresh.resolve(newInventory);
        await vi.waitFor(() => expect(state.target.loading).toBe(false));
        old.resolve(inventory);
        await abandoned;
      }
      metadata.resolve(job());
      await refreshed;
      expect(state.target.inventory?.source_mesh_sha256).toBe(
        newInventory.source_mesh_sha256,
      );
      expect(state.target.draft.selectedIslandIds).toEqual([]);
      expect(state.target.draft.acknowledged).toBe(false);
      expect(state.referenceEpoch).toBeGreaterThan(epoch);
      expect(state.dirty).toBe(true);
      expect(state.targetStatus.canProcess).toBe(false);
    },
  );

  it("keeps the latest inventory failure blocked despite an abandoned successful response", async () => {
    const old = deferred<TargetInventory>(),
      fresh = deferred<TargetInventory>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    adapter.geometry = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const abandoned = state.loadGeometry(true),
      latest = state.loadGeometry(true);
    fresh.reject(new Error("Fresh inventory failed"));
    await latest;
    old.resolve(inventory);
    await abandoned;
    expect(state.target.error).toBe("Fresh inventory failed");
    expect(state.target.loading).toBe(false);
    await expect(state.process()).rejects.toThrow("Fresh inventory failed");
    adapter.geometry = vi.fn(async () => inventory);
    await state.loadGeometry(true);
    expect(state.target.error).toBeNull();
    expect(state.targetStatus.canProcess).toBe(true);
  });

  it("reloads the returned mesh path and does not let the old path finish its request", async () => {
    const old = deferred<TargetInventory>(),
      fresh = deferred<TargetInventory>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    adapter.geometry = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    adapter.get = vi.fn(async () =>
      job({ mesh_path: "reconstruction/replaced.obj" }),
    );
    await state.refresh();
    expect(adapter.geometry).toHaveBeenCalledTimes(2);
    old.resolve(inventory);
    await Promise.resolve();
    expect(state.target.loading).toBe(true);
    fresh.resolve({ ...inventory, source_mesh_sha256: "e".repeat(64) });
    await vi.waitFor(() => expect(state.target.loading).toBe(false));
    expect(state.target.draft.selectedIslandIds).toEqual([]);
    expect(state.targetStatus.canProcess).toBe(false);
  });

  it("keeps target edits made while a review save is pending unsaved after its response", async () => {
    const saving = deferred<Job>();
    const adapter = api({ reviewGeometry: vi.fn(() => saving.promise) });
    const state = session(adapter);
    await state.restore("job-a");
    const request = state.saveTargetReview();
    state.setTargetDraft({
      ...state.target.draft,
      reviewNote: "Newer note kept",
    });
    saving.resolve(job({ input_revision: 2 }));
    await request;
    expect(state.target.draft.reviewNote).toBe("Newer note kept");
    expect(state.targetStatus.status).toBe("unsaved");
    await expect(state.process()).rejects.toThrow("unsaved");
  });

  it("rejects a sizing response whose geometry binding is different", async () => {
    const adapter = api({
      previewSizing: vi.fn(async () => ({
        ...preview,
        geometry_context_sha256: "e".repeat(64),
      })),
    });
    const state = session(adapter);
    await state.restore("job-a");
    await expect(state.previewSizing(sizing, orientation)).rejects.toThrow(
      "Target context changed",
    );
    expect(state.sizingPreview).toBeNull();
    await expect(
      state.saveReviewed({
        orientation,
        sizing,
        mass_kg: properties.mass_kg,
        sliding_friction: null,
      }),
    ).rejects.toThrow("Target context changed");
    expect(adapter.save).not.toHaveBeenCalled();
  });
  it("invalidates preview immediately and blocks processing until a refresh finishes", async () => {
    const read = deferred<Job>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    await state.previewSizing(sizing, orientation);
    expect(state.sizingPreview).toBe(preview);
    adapter.get = vi.fn(() => read.promise);
    const changed = vi.fn();
    state.subscribe(changed);
    const refreshing = state.refresh();
    expect(state.refreshing).toBe(true);
    expect(state.busy).toBe(false);
    expect(state.sizingPreview).toBeNull();
    expect(changed).toHaveBeenCalled();
    await expect(state.process()).rejects.toThrow("current job refresh");
    expect(adapter.process).not.toHaveBeenCalled();
    read.resolve(job());
    await refreshing;
    expect(state.refreshing).toBe(false);
    await state.process();
    expect(adapter.process).toHaveBeenCalledOnce();
  });

  it("unlocks failed refreshes without losing drafts and clears the flag on cancellation", async () => {
    const read = deferred<Job>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    state.markDirty();
    adapter.get = vi.fn(() => read.promise);
    const refreshing = state.refresh();
    read.reject(new ApiError("Offline"));
    await expect(refreshing).rejects.toThrow("Offline");
    expect(state.refreshing).toBe(false);
    expect(state.dirty).toBe(true);
    const late = deferred<Job>();
    adapter.get = vi.fn(() => late.promise);
    const cancelled = state.refresh().catch((error) => error);
    expect(state.refreshing).toBe(true);
    state.cancel();
    expect(state.refreshing).toBe(false);
    late.resolve(job());
    expect(await cancelled).toBeInstanceOf(SessionCancelledError);
    expect(state.dirty).toBe(true);
  });

  it("does not treat a missing optional suggestion cache as a job failure", async () => {
    const missing = new ApiError("No suggestions yet", 404);
    const adapter = api({
      cachedSuggestions: vi.fn(async () => {
        throw missing;
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    await expect(state.cachedSuggestions()).rejects.toBe(missing);
    expect(state.error).toBeNull();
    expect(state.suggestionValues).toBeNull();
    await state.process();
    expect(adapter.process).toHaveBeenCalledOnce();
  });
  it("keeps an existing dirty draft unsaved when reopening the same job for token access", async () => {
    const state = session(api());
    await state.restore("job-a");
    state.markDirty();
    await state.restore("job-a");
    expect(state.dirty).toBe(true);
    await expect(state.process()).rejects.toThrow("Save your changes");
  });

  it.each(["job-a", "job-b"])(
    "preserves newer draft edits during restore of %s",
    async (id) => {
      const pending = deferred<Job>();
      const adapter = api();
      const state = session(adapter);
      await state.restore("job-a");
      adapter.get = vi.fn(() => pending.promise);
      const restoring = state.restore(id);
      state.markDirty();
      pending.resolve(job({ id }));
      await restoring;
      expect(state.job?.id).toBe(id);
      expect(state.dirty).toBe(true);
      expect(state.sizingPreview).toBeNull();
      expect(state.suggestionValues).toBeNull();
      await expect(state.process()).rejects.toThrow("Save your changes");
    },
  );

  it.each(["file", "report", "downloadBundle"] as const)(
    "rejects late %s results from a replaced job",
    async (method) => {
      const blob = deferred<Blob>();
      const report = deferred<{ passed: boolean }>();
      const adapter = api({
        get: vi.fn(async () =>
          job({
            status: "completed",
            bundle_path: "attempts/a/simulation.zip",
            validation_path: "attempts/a/report.json",
          }),
        ),
        file: vi.fn(() => blob.promise),
        report: vi.fn(() => report.promise),
      });
      const state = session(adapter);
      await state.restore("job-a");
      const artifact = (
        method === "file"
          ? state.file("reconstruction/mesh.glb")
          : method === "report"
            ? state.report()
            : state.downloadBundle()
      ).catch((error) => error);
      adapter.get = vi.fn(async () => job({ id: "job-b" }));
      await state.restore("job-b");
      blob.resolve(new Blob(["job-a bytes"]));
      report.resolve({ passed: true });
      expect(await artifact).toBeInstanceOf(SessionCancelledError);
      expect(state.job?.id).toBe("job-b");
    },
  );

  it("resumes the retained running job after a failed replacement upload", async () => {
    vi.useFakeTimers();
    const adapter = api({
      get: vi.fn(async () => job({ status: "reconstructing" })),
      create: vi.fn(async () => {
        throw new ApiError("Replacement rejected", 422);
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    await expect(state.upload([])).rejects.toThrow("Replacement rejected");
    expect(state.polling).toBe(true);
    adapter.get = vi.fn(async () => job());
    await vi.advanceTimersByTimeAsync(25);
    expect(state.job?.status).toBe("awaiting_properties");
    expect(state.polling).toBe(false);
  });

  it("uploads the actual files, follows server status and stops polling at input", async () => {
    vi.useFakeTimers();
    const adapter = api({
      create: vi.fn(async () =>
        job({ status: "queued", progress: 0, mesh_path: null }),
      ),
      get: vi.fn(async () => job()),
    });
    const state = session(adapter);
    const files = [new File(["photo"], "photo.png", { type: "image/png" })];
    expect((await state.upload(files)).status).toBe("queued");
    expect(adapter.create).toHaveBeenCalledWith(files);
    expect(state.polling).toBe(true);
    await vi.advanceTimersByTimeAsync(25);
    expect(state.job?.status).toBe("awaiting_properties");
    expect(state.polling).toBe(false);
    await vi.advanceTimersByTimeAsync(250);
    expect(adapter.get).toHaveBeenCalledTimes(1);
  });

  it("retains the previous job when replacement upload fails", async () => {
    const error = new ApiError("Upload rejected", 422);
    const adapter = api({
      create: vi.fn(async () => {
        throw error;
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    state.markDirty();
    await expect(state.upload([])).rejects.toBe(error);
    expect(state.job?.id).toBe("job-a");
    expect(state.dirty).toBe(true);
    expect(state.error).toBe(error);
  });

  it("ignores an old refresh arriving after a successful save", async () => {
    const read = deferred<Job>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    adapter.get = vi.fn(() => read.promise);
    const refreshing = state.refresh();
    const caught = refreshing.catch((error) => error);
    await vi.waitFor(() => expect(state.target.loading).toBe(false));
    adapter.save = vi.fn(async () => job({ input_revision: 2 }));
    await state.saveProperties(properties);
    expect(state.refreshing).toBe(true);
    read.resolve(job({ input_revision: 1 }));
    expect(await caught).toBeInstanceOf(SessionCancelledError);
    expect(state.job?.input_revision).toBe(2);
    expect(state.refreshing).toBe(false);
  });

  it("binds server-derived dimensions to the reviewed target without a redundant orientation PATCH", async () => {
    const order: string[] = [];
    const rotated = orientation;
    const actualSizing = { ...sizing, reviewed_orientation: rotated };
    const adapter = api({
      saveOrientation: vi.fn(async () => {
        order.push("orientation");
        return job({ orientation: rotated });
      }),
      previewSizing: vi.fn(async () => {
        order.push("preview");
        return preview;
      }),
      save: vi.fn(async () => {
        order.push("properties");
        return job({ orientation: rotated });
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    state.markDirty();
    await state.saveReviewed({
      orientation: rotated,
      sizing: actualSizing,
      mass_kg: properties.mass_kg,
      sliding_friction: null,
    });
    expect(order).toEqual(["preview", "properties"]);
    expect(adapter.saveOrientation).not.toHaveBeenCalled();
    expect(adapter.previewSizing).toHaveBeenCalledWith("job-a", {
      sizing: actualSizing,
      orientation: rotated,
      geometry_context_sha256: context,
    });
    expect(adapter.save).toHaveBeenCalledWith("job-a", {
      ...properties,
      sizing: actualSizing,
    });
    expect(state.dirty).toBe(false);
  });

  it("keeps edits during save dirty and blocks generation", async () => {
    const saving = deferred<Job>();
    const adapter = api({ save: vi.fn(() => saving.promise) });
    const state = session(adapter);
    await state.restore("job-a");
    state.markDirty();
    const request = state.saveProperties(properties);
    state.markDirty();
    saving.resolve(job());
    await request;
    expect(state.dirty).toBe(true);
    await expect(state.process()).rejects.toThrow("Save your changes");
    expect(adapter.process).not.toHaveBeenCalled();
  });

  it("rejects a preview response for an older draft", async () => {
    const waiting = deferred<SizingPreview>();
    const state = session(api({ previewSizing: vi.fn(() => waiting.promise) }));
    await state.restore("job-a");
    const request = state
      .previewSizing(sizing, orientation)
      .catch((error) => error);
    state.markDirty();
    waiting.resolve(preview);
    expect(await request).toBeInstanceOf(SessionCancelledError);
    expect(state.sizingPreview).toBeNull();
  });

  it("does not overwrite the reopened job with a cancelled upload", async () => {
    const creating = deferred<Job>();
    const adapter = api({ create: vi.fn(() => creating.promise) });
    const state = session(adapter);
    const upload = state.upload([]).catch((error) => error);
    adapter.get = vi.fn(async () => job({ id: "job-b" }));
    await state.restore("job-b");
    creating.resolve(job());
    expect(await upload).toBeInstanceOf(SessionCancelledError);
    expect(state.job?.id).toBe("job-b");
  });

  it("reads suggestions without saving and preserves structured failures and prior estimates", async () => {
    const values = {
      dimensions_m: null,
      mass_kg: { value: 0.08, source: "estimated" as const },
      sliding_friction: null,
      notes: ["Unverified"],
      clarifying_questions: [],
    };
    const error = Object.assign(new ApiError("Quota", 503), {
      category: "quota",
      retryable: true,
      manual_entry_available: true,
    });
    const adapter = api({
      cachedSuggestions: vi.fn(async () => values),
      suggestions: vi.fn(async () => {
        throw error;
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    state.markDirty();
    await state.cachedSuggestions();
    await expect(state.requestSuggestions({ refresh: true })).rejects.toBe(
      error,
    );
    expect(state.suggestionValues).toBe(values);
    expect(state.dirty).toBe(true);
    expect(state.job?.properties).toBe(properties);
    expect(state.error).toBe(error);
    expect(adapter.save).not.toHaveBeenCalled();
  });

  it("downloads only completed bundles while preserving historical attempts", async () => {
    const adapter = api({
      get: vi.fn(async () =>
        job({
          status: "failed",
          attempts: [
            {
              id: "earlier",
              status: "completed",
              inputs_path: "attempts/a/inputs.json",
              inputs: { input_revision: 1, properties, orientation },
              export_path: "attempts/a/bundle/scene.xml",
              validation_path: "attempts/a/report.json",
              bundle_path: "attempts/a/simulation.zip",
            },
          ],
        }),
      ),
    });
    const state = session(adapter);
    await state.restore("job-a");
    expect(() => state.downloadBundle()).toThrow("validated");
    await state.downloadBundle("earlier");
    expect(adapter.file).toHaveBeenCalledWith(
      "job-a",
      "attempts/a/simulation.zip",
    );
    expect(adapter.fileUrl).not.toHaveBeenCalled();
  });

  it("keeps failed reviewed saves dirty without starting simulation", async () => {
    const error = new ApiError("Source changed", 409);
    const adapter = api({
      previewSizing: vi.fn(async () => {
        throw error;
      }),
    });
    const state = session(adapter);
    await state.restore("job-a");
    await expect(
      state.saveReviewed({
        orientation,
        sizing,
        mass_kg: properties.mass_kg,
        sliding_friction: null,
      }),
    ).rejects.toBe(error);
    expect(state.dirty).toBe(true);
    expect(adapter.save).not.toHaveBeenCalled();
    expect(adapter.process).not.toHaveBeenCalled();
    await expect(state.process()).rejects.toThrow("Save your changes");
  });

  it("does not replace newer suggestions with a late cached response", async () => {
    const waiting = deferred<Awaited<ReturnType<Api["cachedSuggestions"]>>>();
    const fresh = {
      dimensions_m: null,
      mass_kg: null,
      sliding_friction: null,
      clarifying_questions: [],
      notes: ["Newer server response"],
    };
    const adapter = api({
      cachedSuggestions: vi.fn(() => waiting.promise),
      suggestions: vi.fn(async () => fresh),
    });
    const state = session(adapter);
    await state.restore("job-a");
    const old = state.cachedSuggestions().catch((error) => error);
    await state.requestSuggestions({ refresh: true });
    waiting.resolve({ ...fresh, notes: ["Old cache"] });
    expect(await old).toBeInstanceOf(SessionCancelledError);
    expect(state.suggestionValues).toBe(fresh);
  });

  it("keeps the newer result when overlapping refreshes arrive backwards", async () => {
    const old = deferred<Job>(),
      newer = deferred<Job>();
    const adapter = api();
    const state = session(adapter);
    await state.restore("job-a");
    adapter.get = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(newer.promise);
    const earlier = state.refresh().catch((error) => error);
    const latest = state.refresh();
    expect(state.refreshing).toBe(true);
    newer.resolve(job({ input_revision: 3 }));
    await latest;
    expect(state.refreshing).toBe(false);
    old.resolve(job({ input_revision: 2 }));
    expect(await earlier).toBeInstanceOf(SessionCancelledError);
    expect(state.job?.input_revision).toBe(3);
  });

  it("stops automatic polling after a network error and permits explicit retry", async () => {
    vi.useFakeTimers();
    const adapter = api({
      create: vi.fn(async () => job({ status: "reconstructing" })),
      get: vi.fn(async () => {
        throw new ApiError("Offline");
      }),
    });
    const state = session(adapter);
    await state.upload([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(adapter.get).toHaveBeenCalledTimes(1);
    expect(state.polling).toBe(false);
    adapter.get = vi.fn(async () =>
      job({ status: "completed", bundle_path: "attempts/b/simulation.zip" }),
    );
    await state.refresh();
    expect(state.error).toBeNull();
    await state.downloadBundle();
    expect(adapter.file).toHaveBeenLastCalledWith(
      "job-a",
      "attempts/b/simulation.zip",
    );
  });
});
