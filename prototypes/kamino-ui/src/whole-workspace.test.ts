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
      setPhysicsPreview: vi.fn(),
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
  const toast = vi.fn();
  cleanups.push(
    mountLiveWorkspace(host, {
      session: state,
      brand: "",
      steps: "",
      icon: () => "",
      toast,
      onEditPhotos: vi.fn(),
      onLeave: vi.fn(),
    }),
  );
  return { api, state, host, toast };
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
  expect(vi.mocked(mountViewer).mock.lastCall?.[7]).toMatchObject({
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
  expect(host.querySelector("#live-saved")!.textContent).toBe(
    "Reference review required",
  );
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

it("labels a saved full-source job without requesting target review", async () => {
  const { host, api } = mounted();
  readyDraft(host);
  host.querySelector<HTMLButtonElement>("#live-save")!.click();
  await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  await vi.waitFor(() =>
    expect(host.querySelector("#live-saved")!.textContent).toBe("Saved"),
  );
  expect(host.querySelector("#live-save-status")!.textContent).toBe("Saved");
  expect(host.querySelector("#live-target")).toBeNull();
  fill(host, "mass", "0.3");
  expect(host.querySelector("#live-saved")!.textContent).toBe(
    "Draft · Unsaved changes",
  );
  expect(api.geometry).not.toHaveBeenCalled();
});

it("asks only for full-extent sizing after a whole-source orientation save", async () => {
  const { host, api, toast } = mounted();
  fill(host, "x", "90");
  vi.mocked(api.saveOrientation).mockResolvedValueOnce({
    ...base,
    orientation: { ...orientation, x_deg: 90 },
  });
  host.querySelector<HTMLButtonElement>("#live-save-orientation")!.click();
  await vi.waitFor(() =>
    expect(toast).toHaveBeenCalledWith(
      "Orientation saved. Confirm the full-mesh sizing reference again.",
    ),
  );
  expect(api.geometry).not.toHaveBeenCalled();
});

function physicsField(host: HTMLElement, key: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-physics="${key}"]`,
  )!;
  expect(input, `advanced physics field ${key}`).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("saves complete advanced physics and restores it when the saved whole-source job is reopened", async () => {
  const { host, api, state } = mounted();
  readyDraft(host);
  const values = {
    collision: "box",
    box_x: "0.15",
    box_y: "0.08",
    box_z: "0.12",
    offset_x: "0.01",
    offset_y: "0",
    offset_z: "0.02",
    torsional: "0.003",
    torsional_source: "measured",
    rolling: "0.0002",
    rolling_source: "sourced",
    inertia: "manual",
    com_x: "0.01",
    com_y: "-0.02",
    com_z: "0.03",
    diagonal_x: "0.001",
    diagonal_y: "0.002",
    diagonal_z: "0.0025",
    inertia_source: "measured",
    contact: "soft",
    response: "high",
    contact_source: "estimated",
    placement: "manual",
    placement_x: "1",
    placement_y: "-2",
    placement_z: "0.4",
  };
  Object.entries(values).forEach(([key, value]) =>
    physicsField(host, key, value),
  );
  host.querySelector<HTMLButtonElement>("#live-save")!.click();
  await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(state.dirty).toBe(false));
  const expected = {
    collision: {
      kind: "box",
      box_size_m: [0.15, 0.08, 0.12],
      offset_m: [0.01, 0, 0.02],
    },
    torsional_friction: { value: 0.003, source: "measured" },
    rolling_friction: { value: 0.0002, source: "sourced" },
    inertia: {
      mode: "manual",
      center_of_mass_m: [0.01, -0.02, 0.03],
      diagonal_kg_m2: [0.001, 0.002, 0.0025],
      source: "measured",
    },
    contact: { compliance: "soft", response: "high", source: "estimated" },
  };
  expect(api.save).toHaveBeenCalledWith(
    id,
    expect.objectContaining({
      geometry_scope: "whole_reconstruction",
      physics: expected,
      placement_m: [1, -2, 0.4],
    }),
  );
  expect(api.process).not.toHaveBeenCalled();

  const reopened = mounted(state.job!);
  Object.entries(values).forEach(([key, value]) => {
    expect(
      reopened.host.querySelector<HTMLInputElement>(`[data-physics="${key}"]`)!
        .value,
    ).toBe(value);
  });
  expect(
    reopened.host.querySelector<HTMLFieldSetElement>(
      '[data-physics-section="inertia"]',
    )!.disabled,
  ).toBe(false);
  expect(
    vi.mocked(mountViewer).mock.lastCall?.[7]?.physicsPreview,
  ).toMatchObject({
    metric: true,
    physics: expected,
    placement_m: [1, -2, 0.4],
  });
  fill(reopened.host, "mass", "0.3");
  reopened.host.querySelector<HTMLButtonElement>("#live-save")!.click();
  await vi.waitFor(() => expect(reopened.api.save).toHaveBeenCalledOnce());
  expect(reopened.api.save).toHaveBeenCalledWith(
    id,
    expect.objectContaining({ physics: expected, placement_m: [1, -2, 0.4] }),
  );
});

it("blocks invalid manual inertia before saving or generating and accepts a corrected triangle", async () => {
  const { host, api } = mounted();
  readyDraft(host);
  physicsField(host, "inertia", "manual");
  physicsField(host, "diagonal_x", "1");
  physicsField(host, "diagonal_y", "1");
  physicsField(host, "diagonal_z", "3");
  expect(host.querySelector("#live-form-error")!.textContent).toContain(
    "triangle inequalities",
  );
  expect(host.querySelector<HTMLButtonElement>("#live-save")!.disabled).toBe(
    true,
  );
  expect(
    host.querySelector<HTMLButtonElement>("#live-generate")!.disabled,
  ).toBe(true);
  host
    .querySelector("#live-form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await Promise.resolve();
  expect(api.save).not.toHaveBeenCalled();
  expect(api.process).not.toHaveBeenCalled();
  expect(api.previewSizing).not.toHaveBeenCalled();
  physicsField(host, "diagonal_z", "1.5");
  expect(host.querySelector("#live-form-error")!.textContent).toBe("");
  expect(host.querySelector<HTMLButtonElement>("#live-save")!.disabled).toBe(
    false,
  );
  host.querySelector<HTMLButtonElement>("#live-save")!.click();
  await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(api.save).toHaveBeenCalledWith(
    id,
    expect.objectContaining({
      physics: expect.objectContaining({
        inertia: expect.objectContaining({ diagonal_kg_m2: [1, 1, 1.5] }),
      }),
    }),
  );
});

it.each(["saved", "unsaved"] as const)(
  "updates collision and world placement immediately without reloading %s sized geometry",
  async (sizingState) => {
    const sizedJob = {
      ...base,
      properties: {
        geometry_scope: "whole_reconstruction",
        source_mesh_sha256: hash,
        geometry_context_sha256: binding,
        dimensions_m: preview.dimensions_m,
        mass_kg: { value: 0.2, source: "measured" },
        sliding_friction: null,
        sizing,
      },
      sizing_result: preview.sizing_result,
    } as Job;
    const { host, api } = mounted(sizingState === "saved" ? sizedJob : base);
    if (sizingState === "unsaved") {
      readyDraft(host);
      host.querySelector<HTMLButtonElement>("#live-preview")!.click();
    }
    await vi.waitFor(() =>
      expect(vi.mocked(mountViewer).mock.lastCall?.[5]).toEqual([
        0.1, 0.1, 0.1,
      ]),
    );
    const handle = vi.mocked(mountViewer).mock.results.at(-1)!.value;
    const changes = vi.mocked(handle.setPhysicsPreview!);
    const mounts = vi.mocked(mountViewer).mock.calls.length;
    const previews = vi.mocked(api.previewSizing).mock.calls.length;
    physicsField(host, "collision", "box");
    physicsField(host, "box_x", "0.2");
    physicsField(host, "box_y", "0.1");
    physicsField(host, "box_z", "0.3");
    physicsField(host, "offset_x", "0.04");
    physicsField(host, "placement", "manual");
    physicsField(host, "placement_x", "1");
    physicsField(host, "placement_y", "2");
    physicsField(host, "placement_z", "3");
    host.querySelector<HTMLButtonElement>("#live-collision")!.click();
    expect(changes).toHaveBeenLastCalledWith({
      physics: {
        collision: {
          kind: "box",
          box_size_m: [0.2, 0.1, 0.3],
          offset_m: [0.04, 0, 0],
        },
      },
      placement_m: [1, 2, 3],
      metric: true,
      showCollision: true,
    });
    expect(
      host.querySelector("#live-collision")!.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(vi.mocked(mountViewer).mock.calls.length).toBe(mounts);
    expect(vi.mocked(api.previewSizing).mock.calls.length).toBe(previews);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.process).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>("#live-collision")!.click();
    expect(changes.mock.lastCall?.[0].showCollision).toBe(false);
    expect(vi.mocked(mountViewer).mock.calls.length).toBe(mounts);
  },
);

it("shows collision preview errors accessibly and clears them after a successful preview", () => {
  const { host } = mounted();
  const onError =
    vi.mocked(mountViewer).mock.lastCall?.[7]?.onPhysicsPreviewError;
  expect(onError).toBeTypeOf("function");
  const status = host.querySelector<HTMLElement>(
    "#live-physics-preview-error",
  )!;
  expect(status.hidden).toBe(true);
  onError!(
    "Convex collision preview needs a nonzero-volume three-dimensional mesh.",
  );
  expect(status.hidden).toBe(false);
  expect(status.getAttribute("role")).toBe("status");
  expect(status.textContent).toContain("Collision overlay unavailable");
  expect(status.textContent).toContain("nonzero-volume");
  onError!(null);
  expect(status.hidden).toBe(true);
  expect(status.textContent).toBe("");
});

it.each([
  null,
  {
    mode: "independent_axes",
    reviewed_orientation: orientation,
    acknowledge_distortion: true,
  },
] as (Sizing | null)[])(
  "updates the saved sizing notice after whole-mesh uniform conversion from %j",
  async (sizing) => {
    const { host, state } = mounted({
      ...base,
      properties: {
        dimensions_m: preview.dimensions_m,
        mass_kg: { value: 0.2, source: "estimated" },
        sliding_friction: null,
        sizing,
      },
    });
    const notice = host.querySelector<HTMLElement>("#live-sizing-notice")!;
    expect(notice.hidden).toBe(false);
    readyDraft(host);
    expect(notice.hidden).toBe(false);
    host
      .querySelector<HTMLFormElement>("#live-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(state.job?.properties?.sizing?.mode).toBe("uniform"),
    );
    expect(notice.hidden).toBe(true);
    expect(notice.textContent).toBe("");
    expect(host.querySelector<HTMLInputElement>('[name="length"]')!.value).toBe(
      "100",
    );
  },
);
