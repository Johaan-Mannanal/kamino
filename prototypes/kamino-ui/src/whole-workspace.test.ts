// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../../../frontend/src/api";
import type {
  Job,
  Properties,
  Sizing,
  SizingPreview,
} from "../../../frontend/src/types";
import { mountViewer } from "../../../frontend/src/viewer";
import { BackendSession } from "./backend-session";
import { mountLiveWorkspace } from "./live-workspace";
vi.mock("../../../frontend/src/viewer", () => ({
  mountViewer: vi.fn(() =>
    Object.assign(vi.fn(), {
      setMode: vi.fn(),
      resetCamera: vi.fn(),
      getViewState: () => ({
        direction: [0, 0, 1],
        targetOffset: [0.1, 0, 0],
        distanceRatio: 2,
      }),
    }),
  ),
}));
vi.mock("../../../frontend/src/target-review", async (original) => ({
  ...(await original<typeof import("../../../frontend/src/target-review")>()),
  mountTargetGeometry: vi.fn(() => vi.fn()),
}));
const id = "33333333-3333-4333-8333-333333333333";
const orientation = { x_deg: 0, y_deg: 0, z_deg: 0 };
const hash = "a".repeat(64),
  binding = "b".repeat(64);
const base: Job = {
  schema_version: "1.0",
  id,
  status: "awaiting_properties",
  provider: "mock",
  synthetic: true,
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
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
  input_revision: 1,
};
const preview = {
  geometry_context_sha256: binding,
  source_mesh_sha256: hash,
  dimensions_m: { x: 0.2, y: 0.05, z: 0.1, source: "estimated" },
  sizing_result: {
    mode: "uniform",
    orientation,
    source_extents_input_units: [2, 0.5, 1],
    scale_factors: [0.1, 0.1, 0.1],
    resulting_dimensions_m: { x: 0.2, y: 0.05, z: 0.1, source: "estimated" },
    reference_extent_input_units: 1,
    geometry_review: "reference_correspondence_user_supplied_not_verified",
  },
};
const sessions: BackendSession[] = [];
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  sessions.splice(0).forEach((s) => s.dispose());
  document.body.replaceChildren();
  vi.clearAllMocks();
  sessionStorage.clear();
});
function mounted(current: Job = base) {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:whole"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  const api = {
    get: vi.fn(async () => current),
    file: vi.fn(async () => new Blob(["mesh"])),
    geometry: vi.fn(async () => {
      throw Error("Whole mode must not inventory islands");
    }),
    reviewGeometry: vi.fn(),
    cachedSuggestions: vi.fn(async () => {
      throw new ApiError("None", 404);
    }),
    suggestions: vi.fn(async () => {
      throw new ApiError("Offline", 503);
    }),
    previewSizing: vi.fn(async () => preview),
    save: vi.fn(async (_id: string, properties: Properties) => ({
      ...current,
      properties,
      sizing_result: preview.sizing_result,
      geometry_review: null,
      input_revision: 2,
    })),
    process: vi.fn(async () => ({ ...current, status: "preparing" })),
    saveOrientation: vi.fn(),
    report: vi.fn(async () => ({ passed: true })),
  } as unknown as Api;
  const state = new BackendSession(api, {
    geometryScope: "whole_reconstruction",
  });
  state.job = current;
  sessions.push(state);
  const host = document.createElement("div");
  document.body.append(host);
  cleanups.push(
    mountLiveWorkspace(host, {
      session: state,
      brand: "",
      steps: "",
      icon: () => "",
      toast: vi.fn(),
      onEditPhotos: vi.fn(),
      onLeave: vi.fn(),
    }),
  );
  return { api, state, host };
}
function fill(host: HTMLElement, name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function readyDraft(host: HTMLElement) {
  fill(host, "axis", "z");
  fill(host, "length", "100");
  fill(host, "description", "Full reconstructed extent, all pieces");
  fill(host, "mass", "0.2");
  const ack = host.querySelector<HTMLInputElement>('[name="acknowledged"]')!;
  ack.checked = true;
  ack.dispatchEvent(new Event("input", { bubbles: true }));
}

it("removes the target review panel and never inventories or selects surfaces", async () => {
  const { host, api } = mounted();
  await vi.waitFor(() =>
    expect(host.querySelector("#live-photos img")).not.toBeNull(),
  );
  expect(host.querySelector("#live-target")).toBeNull();
  expect(host.textContent).not.toContain("Target geometry & review");
  expect(vi.mocked(mountViewer).mock.lastCall?.[6]).toBeUndefined();
  expect(api.geometry).not.toHaveBeenCalled();
  expect(api.reviewGeometry).not.toHaveBeenCalled();
  expect(host.querySelector(".live-workspace > .sources")).not.toBeNull();
  expect(host.querySelector("#live-viewer-label")!.textContent).toContain(
    "Entire reconstruction",
  );
});

it("saves and generates the entire mesh without any selection acknowledgement", async () => {
  const { host, api, state } = mounted();
  readyDraft(host);
  const generate = host.querySelector<HTMLButtonElement>("#live-generate")!;
  expect(generate.disabled).toBe(false);
  generate.click();
  await vi.waitFor(() => expect(api.process).toHaveBeenCalledOnce());
  expect(api.previewSizing).toHaveBeenCalledWith(
    id,
    expect.objectContaining({ geometry_scope: "whole_reconstruction" }),
  );
  expect(api.save).toHaveBeenCalledWith(
    id,
    expect.objectContaining({
      geometry_scope: "whole_reconstruction",
      source_mesh_sha256: hash,
      geometry_context_sha256: binding,
    }),
  );
  expect(api.reviewGeometry).not.toHaveBeenCalled();
  expect(api.geometry).not.toHaveBeenCalled();
  expect(state.job?.status).toBe("preparing");
});

it("preserves the restored camera across the first full-source sizing preview", async () => {
  const { host } = mounted();
  readyDraft(host);
  host.querySelector<HTMLButtonElement>("#live-view-mesh")!.click();
  host.querySelector<HTMLButtonElement>("#live-preview")!.click();
  await vi.waitFor(() =>
    expect(vi.mocked(mountViewer).mock.lastCall?.[5]).toEqual([0.1, 0.1, 0.1]),
  );
  expect(vi.mocked(mountViewer).mock.lastCall?.[7]).toEqual({
    mode: "mesh",
    initialViewState: {
      direction: [0, 0, 1],
      targetOffset: [0.1, 0, 0],
      distanceRatio: 2,
    },
  });
});

it("does not apply a historical subset scale to the whole source on reopening", () => {
  const old = {
    ...base,
    status: "completed",
    bundle_path: "old.zip",
    geometry_review: {
      source_mesh_sha256: hash,
      island_ids: ["c".repeat(64)],
      orientation,
      review_note: "Old selected object",
      acknowledge_geometry: true,
      algorithm: "surface-islands-exact-seams-v1",
      geometry_context_sha256: binding,
      reviewed_at: "2026-10-25T00:00:00Z",
      state: "user_reviewed_not_physically_verified",
    },
    properties: {
      dimensions_m: preview.dimensions_m,
      mass_kg: { value: 0.2, source: "estimated" },
      sliding_friction: null,
      geometry_context_sha256: binding,
      sizing: {
        mode: "uniform",
        reviewed_orientation: orientation,
        reference: {
          axis: "z",
          length: 100,
          unit: "mm",
          source: "estimated",
          correspondence: "full_mesh_extent",
          description: "Old selected object",
        },
      },
    },
    sizing_result: preview.sizing_result,
  } as Job;
  const { host } = mounted(old);
  expect(vi.mocked(mountViewer).mock.lastCall?.[5]).toBeUndefined();
  expect(vi.mocked(mountViewer).mock.lastCall?.[6]).toBeUndefined();
  expect(
    host.querySelector<HTMLInputElement>('[name="acknowledged"]')!.checked,
  ).toBe(false);
  expect(host.querySelector<HTMLButtonElement>("#live-bundle")!.hidden).toBe(
    false,
  );
});

const sizing: Sizing = {
  mode: "uniform",
  reviewed_orientation: orientation,
  reference: {
    axis: "z",
    length: 100,
    unit: "mm",
    source: "estimated",
    correspondence: "full_mesh_extent",
    description: "Entire reconstructed extent",
  },
};

it("refuses a whole-source preview without its source identity", async () => {
  const { api, state } = mounted();
  vi.mocked(api.previewSizing).mockResolvedValueOnce({
    ...preview,
    source_mesh_sha256: null,
  } as SizingPreview);
  await expect(
    state.saveReviewed({
      orientation,
      sizing,
      mass_kg: { value: 0.2, source: "estimated" },
    }),
  ).rejects.toThrow();
  expect(api.save).not.toHaveBeenCalled();
  expect(api.process).not.toHaveBeenCalled();
});

it("discards a pending whole-source preview after orientation refresh", async () => {
  const { api, state } = mounted();
  let finish!: (value: SizingPreview) => void;
  vi.mocked(api.previewSizing).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = state.previewSizing(sizing, orientation);
  vi.mocked(api.get).mockResolvedValueOnce({
    ...base,
    input_revision: 2,
    orientation: { ...orientation, x_deg: 90 },
  });
  await state.refresh();
  const rejected = expect(pending).rejects.toThrow();
  finish(preview as SizingPreview);
  await rejected;
  expect(state.sizingPreview).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});
