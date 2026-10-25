// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  initialTargetDraft,
  targetReviewControls,
  targetReviewStatus,
  type TargetInventory,
} from "../../../frontend/src/target-review";
import type { Job, SizingPreview, TargetReviewState } from "./backend-session";
import {
  generateGate,
  primaryViewer,
  syncTargetControls,
  targetControlsKey,
  type GenerateGateInput,
} from "./live-target-review";

const source = "a".repeat(64);
const context = "d".repeat(64);
const [body, handle, stray] = ["b", "c", "e"].map((c) => c.repeat(64));
const orientation = { x_deg: 0, y_deg: 90, z_deg: 0 };
const square = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ],
  faces: [[0, 1, 2]],
};
const inventory: TargetInventory = {
  source_mesh_sha256: source,
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
  geometry: { [body]: square, [handle]: square, [stray]: square },
};
const review = {
  source_mesh_sha256: source,
  island_ids: [body, handle],
  orientation,
  review_note: "Body and handle are one object",
  acknowledge_geometry: true,
  algorithm: inventory.algorithm,
  geometry_context_sha256: context,
  reviewed_at: "2026-10-24T00:00:00Z",
  state: "user_reviewed_not_physically_verified" as const,
};
const reviewed = {
  id: "job",
  status: "awaiting_properties",
  mesh_path: "reconstruction/mesh.glb",
  orientation,
  input_revision: 2,
  geometry_review: review,
  properties: {
    geometry_context_sha256: context,
    dimensions_m: { x: 0.1, y: 0.2, z: 0.3, source: "measured" },
    mass_kg: { value: 0.4, source: "measured" },
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
  sizing_result: { orientation, scale_factors: [0.2, 0.2, 0.2] },
} as unknown as Job;
const stateFor = (job: Job, changes: Partial<TargetReviewState> = {}) => ({
  inventory,
  loading: false,
  error: null,
  draft: initialTargetDraft(job, inventory),
  ...changes,
});
function gate(changes: Partial<GenerateGateInput> = {}, job = reviewed) {
  const target = changes.target ?? stateFor(job);
  return generateGate({
    job,
    dirty: false,
    working: false,
    invalid: false,
    orientationSaved: true,
    stageReady: true,
    target,
    targetStatus: targetReviewStatus(job, target),
    ...changes,
  });
}

describe("generate gate", () => {
  it("allows only a current reviewed target bound to the saved reference", () => {
    expect(gate().allowed).toBe(true);
  });
  it("blocks while the source is revalidating or failed to load", () => {
    const loading = stateFor(reviewed, { loading: true });
    expect(gate({ target: loading })).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/Validating/),
    });
    const failed = stateFor(reviewed, { error: "Inventory unavailable" });
    expect(gate({ target: failed }).reason).toBe("Inventory unavailable");
  });
  it("blocks unsaved selection, note or acknowledgement drafts", () => {
    const base = stateFor(reviewed);
    for (const draft of [
      { ...base.draft, selectedIslandIds: [body] },
      { ...base.draft, reviewNote: "edited" },
      { ...base.draft, acknowledged: false },
    ])
      expect(gate({ target: { ...base, draft } }).allowed).toBe(false);
  });
  it("blocks unreviewed, stale and reference-unbound targets", () => {
    const unreviewed = { ...reviewed, geometry_review: null } as Job;
    expect(gate({}, unreviewed).allowed).toBe(false);
    const stale = {
      ...reviewed,
      orientation: { x_deg: 5, y_deg: 90, z_deg: 0 },
    };
    expect(gate({}, stale).allowed).toBe(false);
    const unbound = {
      ...reviewed,
      properties: { ...reviewed.properties!, geometry_context_sha256: null },
    };
    expect(gate({}, unbound).reason).toMatch(/reference correspondence/);
  });
  it("blocks unsaved orientation, numeric drafts, active requests and stage", () => {
    expect(gate({ orientationSaved: false }).reason).toMatch(/orientation/);
    expect(gate({ dirty: true }).allowed).toBe(false);
    expect(gate({ invalid: true }).allowed).toBe(false);
    expect(gate({ working: true }).allowed).toBe(false);
    expect(gate({ stageReady: false }).allowed).toBe(false);
  });
});

describe("primary viewer", () => {
  const status = (job: Job, state: TargetReviewState) =>
    targetReviewStatus(job, state);
  it("shows the whole reconstruction unscaled until a target is selected", () => {
    const job = { ...reviewed, geometry_review: null } as Job;
    const state = stateFor(job);
    const spec = primaryViewer(job, state, status(job, state), null, null);
    expect(spec.selection).toBeUndefined();
    expect(spec.scale).toBeUndefined();
    expect(spec.label).toMatch(/no target selected/);
  });
  it("shows an unsaved selection without stale sizing", () => {
    const state = stateFor(reviewed);
    state.draft = { ...state.draft, selectedIslandIds: [handle] };
    const spec = primaryViewer(
      reviewed,
      state,
      status(reviewed, state),
      null,
      null,
    );
    expect(spec.selection?.islandIds).toEqual([handle]);
    expect(spec.scale).toBeUndefined();
    expect(spec.label).toMatch(/review unsaved/);
  });
  it("applies saved sizing only to the reviewed, reference-bound target", () => {
    const state = stateFor(reviewed);
    const spec = primaryViewer(
      reviewed,
      state,
      status(reviewed, state),
      null,
      null,
    );
    expect(spec.selection?.islandIds).toEqual([body, handle].sort());
    expect(spec.scale).toEqual([0.2, 0.2, 0.2]);
    expect(spec.key).toContain(source);
    expect(spec.key).toContain(context);
    const loading = { ...state, loading: true };
    expect(
      primaryViewer(reviewed, loading, status(reviewed, loading), null, null)
        .scale,
    ).toBeUndefined();
  });
  it("ignores a sizing preview bound to another geometry context", () => {
    const state = stateFor(reviewed);
    const preview = {
      geometry_context_sha256: "f".repeat(64),
      sizing_result: { orientation, scale_factors: [9, 9, 9] },
    } as unknown as SizingPreview;
    const spec = primaryViewer(
      reviewed,
      state,
      status(reviewed, state),
      preview,
      null,
    );
    expect(spec.scale).toEqual([0.2, 0.2, 0.2]);
    const missing = { ...preview, geometry_context_sha256: undefined };
    expect(
      primaryViewer(reviewed, state, status(reviewed, state), missing, null)
        .scale,
    ).toEqual([0.2, 0.2, 0.2]);
    const current = { ...preview, geometry_context_sha256: context };
    expect(
      primaryViewer(reviewed, state, status(reviewed, state), current, null)
        .scale,
    ).toEqual([9, 9, 9]);
  });
});

describe("target controls sync", () => {
  it("updates drafts in place and keys structure only on source changes", () => {
    const state = stateFor(reviewed);
    const host = document.createElement("div");
    host.innerHTML = targetReviewControls(reviewed, state);
    const note = host.querySelector<HTMLTextAreaElement>(
      "#target-review-note",
    )!;
    const before = targetControlsKey(reviewed, state);
    const edited = {
      ...state,
      draft: { ...state.draft, reviewNote: "typing", acknowledged: false },
    };
    expect(targetControlsKey(reviewed, edited)).toBe(before);
    expect(targetControlsKey(reviewed, { ...state, loading: true })).toBe(
      before,
    );
    syncTargetControls(host, edited, targetReviewStatus(reviewed, edited), {
      locked: false,
      orientationSaved: true,
    });
    expect(host.querySelector("#target-review-note")).toBe(note);
    expect(note.value).toBe("typing");
    expect(
      host.querySelector<HTMLInputElement>("#target-review-ack")!.checked,
    ).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>("#save-target-review")!.disabled,
    ).toBe(false);
    expect(
      targetControlsKey(reviewed, {
        ...state,
        inventory: { ...inventory, source_mesh_sha256: "9".repeat(64) },
      }),
    ).not.toBe(before);
  });
  it("blocks Save target until orientation is saved", () => {
    const state = stateFor({ ...reviewed, geometry_review: null } as Job);
    const host = document.createElement("div");
    host.innerHTML = targetReviewControls(reviewed, state);
    syncTargetControls(host, state, targetReviewStatus(reviewed, state), {
      locked: false,
      orientationSaved: false,
    });
    expect(
      host.querySelector<HTMLButtonElement>("#save-target-review")!.disabled,
    ).toBe(true);
    expect(host.querySelector("#target-review-status")!.textContent).toMatch(
      /Save orientation/,
    );
  });
});
