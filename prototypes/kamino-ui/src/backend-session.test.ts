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

const orientation: Orientation = { x_deg: 0, y_deg: 0, z_deg: 0 };
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
  dimensions_m: { x: 0.12, y: 0.08, z: 0.06, source: "estimated" },
  mass_kg: { value: 0.34, source: "user_supplied" },
  sliding_friction: null,
  sizing,
};
const preview: SizingPreview = {
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
    expect(changed).toHaveBeenCalledOnce();
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
    adapter.save = vi.fn(async () => job({ input_revision: 2 }));
    await state.saveProperties(properties);
    expect(state.refreshing).toBe(true);
    read.resolve(job({ input_revision: 1 }));
    expect(await caught).toBeInstanceOf(SessionCancelledError);
    expect(state.job?.input_revision).toBe(2);
    expect(state.refreshing).toBe(false);
  });

  it("saves orientation then server-derived dimensions, with no local bounds guess", async () => {
    const order: string[] = [];
    const rotated = { x_deg: 90, y_deg: 0, z_deg: 0 };
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
    expect(order).toEqual(["orientation", "preview", "properties"]);
    expect(adapter.previewSizing).toHaveBeenCalledWith("job-a", {
      sizing: actualSizing,
      orientation: rotated,
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
