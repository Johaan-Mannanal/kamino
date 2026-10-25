import type {
  Job,
  Orientation,
  SizingPreview,
  TargetReviewState,
} from "./backend-session";
import type {
  TargetInventory,
  targetReviewStatus,
} from "../../../frontend/src/target-review";

// ---------------------------------------------------------------------------
// Pure target-review wiring for the live workspace. Geometry, status and the
// request body stay in frontend/src/target-review.ts; nothing here chooses a
// target, guesses dimensions or rebinds a reference automatically.
// ---------------------------------------------------------------------------

export type TargetStatus = ReturnType<typeof targetReviewStatus>;
const sameOrientation = (a: Orientation, b: Orientation) =>
  a.x_deg === b.x_deg && a.y_deg === b.y_deg && a.z_deg === b.z_deg;

export type GenerateGateInput = {
  job: Job | null;
  dirty: boolean;
  working: boolean;
  invalid: boolean;
  orientationSaved: boolean;
  /** Stage/retry/saved-sizing check from live-workspace canGenerate. */
  stageReady: boolean;
  target: TargetReviewState;
  targetStatus: TargetStatus;
};

/** Every newly generated attempt needs a current reviewed target bound to its reference. */
export function generateGate(input: GenerateGateInput): {
  allowed: boolean;
  reason: string;
} {
  const { job, target, targetStatus } = input;
  const blocked = (reason: string) => ({ allowed: false, reason });
  if (!job) return blocked("Open a reconstructed job first.");
  if (input.working) return blocked("Wait for the current request to finish.");
  if (target.loading)
    return blocked("Validating the source geometry before generation…");
  if (target.error) return blocked(target.error);
  if (!input.orientationSaved)
    return blocked("Save orientation, then review the target again.");
  if (targetStatus.status !== "reviewed" || !targetStatus.canProcess)
    return blocked(targetStatus.reason);
  if (input.dirty)
    return blocked("Save reviewed properties before generating.");
  if (input.invalid) return blocked("Complete the reviewed properties first.");
  if (!input.stageReady)
    return blocked(
      job.status === "completed"
        ? "Completed. Earlier downloads remain available; save changed inputs to generate again."
        : "Save reviewed properties for the current orientation before generating.",
    );
  return { allowed: true, reason: "Ready to generate a new attempt." };
}

export type PrimaryViewer = {
  orientation: Orientation;
  scale?: number[];
  selection?: { inventory: TargetInventory; islandIds: string[] };
  label: string;
  key: string;
};

/**
 * Primary preview: only the selected target islands, scaled only when the target
 * review is current and the scale belongs to its geometry context.
 */
export function primaryViewer(
  job: Job,
  target: TargetReviewState,
  status: TargetStatus,
  preview: SizingPreview | null,
  draftOrientation: Orientation | null,
): PrimaryViewer {
  const inventory = target.inventory;
  const ids = inventory
    ? target.draft.selectedIslandIds
        .filter((id) => inventory.islands.some((island) => island.id === id))
        .sort()
    : [];
  const selection =
    inventory && ids.length ? { inventory, islandIds: ids } : undefined;
  const reviewed = status.status === "reviewed" && !!selection;
  const context = job.geometry_review?.geometry_context_sha256 ?? null;
  let orientation = job.orientation;
  let scale: number[] | undefined;
  let sizing = "Saved orientation · unscaled";
  if (draftOrientation) {
    orientation = draftOrientation;
    sizing = "Draft orientation · unsaved · unscaled";
  } else if (
    reviewed &&
    preview &&
    !!context &&
    preview.geometry_context_sha256 === context &&
    sameOrientation(preview.sizing_result.orientation, job.orientation)
  ) {
    scale = preview.sizing_result.scale_factors;
    sizing = "Server sizing preview · unsaved";
  } else if (
    reviewed &&
    status.referenceReady &&
    job.properties?.sizing &&
    job.sizing_result &&
    sameOrientation(job.sizing_result.orientation, job.orientation)
  ) {
    scale = job.sizing_result.scale_factors;
    sizing = "Saved orientation · saved sizing";
  }
  const part = selection
    ? reviewed
      ? "Reviewed target"
      : "Selected target · review unsaved"
    : target.loading
      ? "Whole reconstruction · validating source geometry"
      : target.error
        ? "Whole reconstruction · target geometry unavailable"
        : "Whole reconstruction · no target selected";
  return {
    orientation,
    scale,
    selection,
    label: `${part} · ${sizing}`,
    key: JSON.stringify([
      job.id,
      job.mesh_path,
      inventory?.source_mesh_sha256 ?? null,
      selection?.islandIds ?? null,
      context,
      orientation,
      scale ?? null,
    ]),
  };
}

/** Structure only. Draft edits never change this, so typing is never replaced. */
export function targetControlsKey(job: Job, target: TargetReviewState) {
  return JSON.stringify([
    job.id,
    target.inventory?.source_mesh_sha256 ?? null,
    target.inventory?.islands.map((island) => [island.id, island.label]) ??
      null,
    target.error,
  ]);
}

/** Writes session draft/status into existing controls without re-rendering them. */
export function syncTargetControls(
  root: HTMLElement,
  target: TargetReviewState,
  status: TargetStatus,
  options: { locked: boolean; orientationSaved: boolean },
) {
  const { draft } = target;
  const islandLocked = options.locked || target.loading;
  root
    .querySelector<HTMLFieldSetElement>("fieldset")
    ?.removeAttribute("disabled");
  root
    .querySelectorAll<HTMLInputElement>("[data-target-island]")
    .forEach((box) => {
      const checked = draft.selectedIslandIds.includes(box.value);
      if (box.checked !== checked) box.checked = checked;
      box.disabled = islandLocked;
      box.closest("label")?.classList.toggle("target-island-selected", checked);
    });
  for (const id of ["#target-select-all", "#target-clear"])
    root
      .querySelector<HTMLButtonElement>(id)
      ?.toggleAttribute("disabled", islandLocked || !target.inventory);
  const note = root.querySelector<HTMLTextAreaElement>("#target-review-note");
  if (note && note.value !== draft.reviewNote) note.value = draft.reviewNote;
  if (note) note.disabled = options.locked;
  const ack = root.querySelector<HTMLInputElement>("#target-review-ack");
  if (ack && ack.checked !== draft.acknowledged)
    ack.checked = draft.acknowledged;
  if (ack) ack.disabled = options.locked;
  const save = root.querySelector<HTMLButtonElement>("#save-target-review");
  if (save)
    save.disabled =
      options.locked ||
      target.loading ||
      !!target.error ||
      !target.inventory ||
      !options.orientationSaved ||
      status.status === "reviewed";
  const line = root.querySelector<HTMLElement>("#target-review-status");
  if (line)
    line.textContent =
      !options.orientationSaved && !target.loading && !target.error
        ? `Save orientation before confirming this target. ${status.reason}`
        : status.reason;
  const section = root.querySelector<HTMLElement>("#target-review");
  if (section) section.dataset.targetStatus = status.status;
}
