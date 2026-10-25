import {
  ApiError,
  liveApi,
  setApiToken,
  type Api,
} from "../../../frontend/src/api";
import type {
  Job,
  Orientation,
  Properties,
  Sizing,
  SizingPreview,
  Suggestions,
} from "../../../frontend/src/types";
import {
  initialTargetDraft,
  targetReviewRequest,
  targetReviewStatus,
  type TargetDraft,
  type TargetReviewState,
} from "../../../frontend/src/target-review";

export type {
  Job,
  Orientation,
  Properties,
  Sizing,
  SizingPreview,
  Suggestions,
  TargetDraft,
  TargetReviewState,
};
export type ReviewedInputs = {
  orientation: Orientation;
  sizing: Sizing;
  mass_kg: Properties["mass_kg"];
  sliding_friction: Properties["sliding_friction"];
};

export class SessionCancelledError extends Error {
  constructor() {
    super("The job or draft changed while the request was running.");
    this.name = "AbortError";
  }
}

const running = (job: Job | null) =>
  !!job &&
  ["queued", "reconstructing", "preparing", "validating"].includes(job.status);
const clone = <T>(value: T): T => structuredClone(value);
const sameOrientation = (a: Orientation, b: Orientation) =>
  a.x_deg === b.x_deg && a.y_deg === b.y_deg && a.z_deg === b.z_deg;
const sameIds = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const emptyTarget = (): TargetReviewState => ({
  inventory: null,
  loading: false,
  error: null,
  draft: { selectedIslandIds: [], reviewNote: "", acknowledged: false },
});

/** Owns saved server state only. Forms own their drafts and call markDirty on edits. */
export class BackendSession {
  job: Job | null = null;
  error: Error | null = null;
  busy = false;
  refreshing = false;
  dirty = false;
  suggestionValues: Suggestions | null = null;
  sizingPreview: SizingPreview | null = null;
  target: TargetReviewState = emptyTarget();
  referenceEpoch = 0;
  private targetRequest = 0;
  private targetDraftVersion = 0;
  private metadataFailure: Error | null = null;
  private metadataVersion = 0;
  private generation = 0;
  private revision = 0;
  private draft = 0;
  private readRequest = 0;
  private suggestionRequest = 0;
  private automaticAttempts = new Set<string>();
  private initialRead?: {
    generation: number;
    id: string;
    promise: Promise<Suggestions>;
  };
  private previewRequest = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private listeners = new Set<() => void>();
  readonly pollIntervalMs: number;

  constructor(
    readonly api: Api = liveApi,
    options: { onChange?: () => void; pollIntervalMs?: number } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    if (options.onChange) this.listeners.add(options.onChange);
  }

  get attempts() {
    return this.job?.attempts ?? [];
  }
  get targetStatus() {
    if (this.metadataFailure)
      return {
        status: "error" as const,
        referenceReady: false,
        canProcess: false,
        reason: `Job status could not be refreshed: ${this.metadataFailure.message} Retry status before generating.`,
      };
    return this.job
      ? targetReviewStatus(this.job, this.target)
      : {
          status: "unreviewed" as const,
          referenceReady: false,
          canProcess: false,
          reason: "Open a reconstructed job before target review.",
        };
  }
  private invalidateReference() {
    this.referenceEpoch++;
    this.sizingPreview = null;
    this.previewRequest++;
  }
  setTargetDraft(draft: TargetDraft) {
    const changedSelection = !sameIds(
      draft.selectedIslandIds,
      this.target.draft.selectedIslandIds,
    );
    this.target.draft = clone(draft);
    if (changedSelection) {
      this.target.draft.acknowledged = false;
      this.invalidateReference();
    }
    this.targetDraftVersion++;
    this.changed();
  }
  private reviewedContext(orientation?: Orientation) {
    const job = this.requireJob();
    if (orientation && !sameOrientation(orientation, job.orientation))
      throw new Error(
        "Save orientation before reviewing target geometry and reference sizing.",
      );
    if (this.targetStatus.status !== "reviewed" || !job.geometry_review)
      throw new Error(this.targetStatus.reason);
    return job.geometry_review.geometry_context_sha256;
  }
  get polling() {
    return this.timer !== undefined;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private changed() {
    this.listeners.forEach((listener) => listener());
  }
  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private check(generation: number) {
    if (this.disposed || generation !== this.generation)
      throw new SessionCancelledError();
  }
  private requireJob() {
    if (!this.job) throw new Error("Open or upload a job first.");
    return this.job;
  }
  private setJob(job: Job) {
    this.metadataFailure = null;
    this.metadataVersion++;
    const previous = this.job;
    const targetDirty =
      previous &&
      targetReviewStatus(previous, {
        ...this.target,
        loading: false,
        error: null,
      }).status === "unsaved";
    if (previous?.id !== job.id) {
      this.targetRequest++;
      this.targetDraftVersion++;
      this.target = emptyTarget();
      this.invalidateReference();
    } else if (previous.mesh_path !== job.mesh_path) {
      this.targetRequest++;
      this.targetDraftVersion++;
      this.target = {
        ...emptyTarget(),
        draft: {
          selectedIslandIds: [],
          reviewNote: this.target.draft.reviewNote,
          acknowledged: false,
        },
      };
      this.invalidateReference();
    } else if (
      !sameOrientation(previous.orientation, job.orientation) ||
      previous.geometry_review?.geometry_context_sha256 !==
        job.geometry_review?.geometry_context_sha256
    ) {
      this.invalidateReference();
      if (!targetDirty && this.target.inventory)
        this.target.draft = initialTargetDraft(job, this.target.inventory);
      else this.target.draft.acknowledged = false;
      this.targetDraftVersion++;
    }
    this.job = job;
    this.changed();
  }
  async loadGeometry(force = true) {
    const job = this.job;
    if (
      !job?.mesh_path ||
      (!force &&
        (this.target.loading || this.target.inventory || this.target.error))
    )
      return;
    const id = job.id,
      path = job.mesh_path,
      generation = this.generation;
    const sequence = ++this.targetRequest,
      version = this.targetDraftVersion;
    this.target.loading = true;
    this.target.error = null;
    this.sizingPreview = null;
    this.previewRequest++;
    this.changed();
    const current = () =>
      !this.disposed &&
      generation === this.generation &&
      this.job?.id === id &&
      this.job.mesh_path === path &&
      sequence === this.targetRequest;
    try {
      const inventory = await this.api.geometry(id, true);
      if (!current()) return;
      if (
        !inventory ||
        !Array.isArray(inventory.islands) ||
        !inventory.source_mesh_sha256
      )
        throw new Error(
          "Source inventory is unavailable. Reload geometry before review.",
        );
      const previous = this.target.inventory;
      const sourceChanged =
        !!previous &&
        previous.source_mesh_sha256 !== inventory.source_mesh_sha256;
      const staleReview =
        !!this.job?.geometry_review &&
        this.job.geometry_review.source_mesh_sha256 !==
          inventory.source_mesh_sha256;
      if (sourceChanged || staleReview) this.invalidateReference();
      if (sourceChanged) {
        this.target.draft = {
          selectedIslandIds: [],
          reviewNote: this.target.draft.reviewNote,
          acknowledged: false,
        };
        this.targetDraftVersion++;
      } else if (!previous) {
        const restored = initialTargetDraft(this.requireJob(), inventory);
        this.target.draft =
          version === this.targetDraftVersion
            ? restored
            : {
                ...restored,
                reviewNote: this.target.draft.reviewNote,
                acknowledged: false,
              };
        this.targetDraftVersion++;
      }
      this.target.inventory = inventory;
      return inventory;
    } catch (error) {
      if (current())
        this.target.error =
          error instanceof Error ? error.message : String(error);
    } finally {
      if (current()) {
        this.target.loading = false;
        this.changed();
      }
    }
  }
  async saveTargetReview() {
    const current = this.requireJob();
    if (this.target.loading || this.target.error)
      throw new Error(this.targetStatus.reason);
    const request = targetReviewRequest(current, this.target);
    const version = this.targetDraftVersion;
    return this.mutation(async (generation) => {
      const saved = await this.api.reviewGeometry(current.id, request);
      this.check(generation);
      const unchanged = version === this.targetDraftVersion;
      this.setJob(saved);
      if (
        unchanged &&
        this.target.inventory &&
        this.target.inventory.source_mesh_sha256 === request.source_mesh_sha256
      )
        this.target.draft = initialTargetDraft(saved, this.target.inventory);
      this.changed();
      return saved;
    });
  }
  private schedule() {
    this.clearTimer();
    if (
      !this.disposed &&
      !this.busy &&
      !this.refreshing &&
      !this.error &&
      running(this.job)
    ) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.readStatus(false).catch(() => {
          /* error retained for explicit retry */
        });
      }, this.pollIntervalMs);
    }
  }
  markDirty() {
    this.draft++;
    this.dirty = true;
    this.sizingPreview = null;
    this.changed();
  }
  setToken(value: string) {
    setApiToken(value);
  }
  cancel() {
    this.generation++;
    this.revision++;
    this.clearTimer();
    this.busy = false;
    this.refreshing = false;
    this.targetRequest++;
    this.target.loading = false;
    this.changed();
  }
  dispose() {
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }

  private async mutation<T>(
    operation: (generation: number, draft: number) => Promise<T>,
  ) {
    if (this.disposed) throw new SessionCancelledError();
    if (this.busy) throw new Error("Wait for the current operation to finish.");
    const generation = this.generation;
    const draft = this.draft;
    this.revision++;
    this.busy = true;
    this.error = null;
    this.clearTimer();
    this.changed();
    try {
      const result = await operation(generation, draft);
      this.check(generation);
      return result;
    } catch (error) {
      this.check(generation);
      if (
        generation === this.generation &&
        !this.disposed &&
        !(error instanceof SessionCancelledError)
      ) {
        this.error = error instanceof Error ? error : new Error(String(error));
      }
      throw error;
    } finally {
      if (generation === this.generation && !this.disposed) {
        this.busy = false;
        this.changed();
        // Failed replacement uploads retain a running previous job.
        if (running(this.job) && this.error) {
          const failure = this.error;
          this.error = null;
          this.schedule();
          this.error = failure;
        } else this.schedule();
      }
    }
  }

  async upload(files: File[]) {
    if (this.busy) throw new Error("Wait for the current operation to finish.");
    this.cancel();
    return this.mutation(async (generation) => {
      const job = await this.api.create(files);
      this.check(generation);
      this.setJob(job);
      this.dirty = false;
      this.suggestionValues = null;
      this.sizingPreview = null;
      this.changed();
      if (job.mesh_path) void this.loadGeometry(true);
      return job;
    });
  }

  async restore(id: string) {
    const retainedDirty = this.job?.id === id && this.dirty;
    this.cancel();
    return this.mutation(async (generation, draft) => {
      let job: Job;
      try {
        job = await this.api.get(id);
      } catch (error) {
        this.check(generation);
        this.metadataFailure =
          error instanceof Error ? error : new Error(String(error));
        throw error;
      }
      this.check(generation);
      if (draft === this.draft) this.dirty = retainedDirty;
      this.suggestionValues = null;
      this.sizingPreview = null;
      this.setJob(job);
      if (job.mesh_path) void this.loadGeometry(true);
      return job;
    });
  }

  refresh() {
    return this.readStatus(true);
  }

  private async readStatus(revalidateGeometry: boolean) {
    const current = this.requireJob();
    if (this.busy) return current;
    const generation = this.generation,
      revision = this.revision;
    const metadataVersion = this.metadataVersion;
    const request = ++this.readRequest;
    this.clearTimer();
    this.refreshing = true;
    this.sizingPreview = null;
    this.previewRequest++;
    this.changed();
    // Start source revalidation synchronously, before waiting for metadata GET.
    if (revalidateGeometry && current.mesh_path) void this.loadGeometry(true);
    try {
      const job = await this.api.get(current.id);
      this.check(generation);
      if (revision !== this.revision || request !== this.readRequest)
        throw new SessionCancelledError();
      this.error = null;
      this.setJob(job);
      // Polling a running simulation must not repeatedly parse the entire mesh.
      // Revalidate before returning to editable state; explicit Refresh above
      // still supersedes inventory reads immediately, even before metadata GET.
      if (
        job.mesh_path &&
        (job.mesh_path !== current.mesh_path ||
          (!revalidateGeometry && running(current) && !running(job)))
      )
        void this.loadGeometry(true);
      return job;
    } catch (error) {
      if (
        generation === this.generation &&
        request === this.readRequest &&
        metadataVersion === this.metadataVersion &&
        !(error instanceof SessionCancelledError)
      ) {
        this.metadataFailure =
          error instanceof Error ? error : new Error(String(error));
        this.changed();
      }
      if (
        generation === this.generation &&
        revision === this.revision &&
        request === this.readRequest &&
        !(error instanceof SessionCancelledError)
      ) {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.changed();
      }
      throw error;
    } finally {
      if (generation === this.generation && request === this.readRequest) {
        this.refreshing = false;
        this.changed();
        this.schedule();
      }
    }
  }

  async saveOrientation(orientation: Orientation) {
    const id = this.requireJob().id,
      value = clone(orientation);
    if (sameOrientation(value, this.requireJob().orientation))
      return this.requireJob();
    return this.mutation(async (generation) => {
      this.dirty = true;
      const job = await this.api.saveOrientation(id, value);
      this.check(generation);
      this.sizingPreview = null;
      this.setJob(job);
      return job;
    });
  }

  async previewSizing(sizing: Sizing, orientation: Orientation) {
    const context = this.reviewedContext(orientation);
    const id = this.requireJob().id,
      generation = this.generation;
    const draft = this.draft,
      revision = this.revision;
    const request = ++this.previewRequest;
    const targetVersion = this.targetDraftVersion;
    const result = await this.api.previewSizing(id, {
      sizing: clone(sizing),
      orientation: clone(orientation),
      geometry_context_sha256: context,
    });
    this.check(generation);
    if (result.geometry_context_sha256 !== context)
      throw new Error(
        "Target context changed; preview the reviewed geometry again.",
      );
    if (
      draft !== this.draft ||
      revision !== this.revision ||
      request !== this.previewRequest ||
      targetVersion !== this.targetDraftVersion ||
      this.reviewedContext(orientation) !== context
    )
      throw new SessionCancelledError();
    this.sizingPreview = result;
    this.changed();
    return result;
  }

  async saveProperties(properties: Properties) {
    const context = this.reviewedContext(
      properties.sizing?.reviewed_orientation,
    );
    const id = this.requireJob().id,
      value = clone(properties);
    if (
      value.geometry_context_sha256 &&
      value.geometry_context_sha256 !== context
    )
      throw new Error(
        "Target changed; review and save reference correspondence again.",
      );
    value.geometry_context_sha256 = context;
    return this.mutation(async (generation, draft) => {
      this.dirty = true;
      const job = await this.api.save(id, value);
      this.check(generation);
      if (draft === this.draft) this.dirty = false;
      this.setJob(job);
      return job;
    });
  }

  async saveReviewed(inputs: ReviewedInputs) {
    const context = this.reviewedContext(inputs.orientation);
    const id = this.requireJob().id,
      values = clone(inputs);
    const targetVersion = this.targetDraftVersion;
    return this.mutation(async (generation, draft) => {
      this.dirty = true;
      this.sizingPreview = null;
      const preview = await this.api.previewSizing(id, {
        sizing: values.sizing,
        orientation: values.orientation,
        geometry_context_sha256: context,
      });
      this.check(generation);
      if (preview.geometry_context_sha256 !== context)
        throw new Error(
          "Target context changed; preview the reviewed geometry again.",
        );
      if (
        targetVersion !== this.targetDraftVersion ||
        this.reviewedContext(values.orientation) !== context
      )
        throw new SessionCancelledError();
      const job = await this.api.save(id, {
        dimensions_m: preview.dimensions_m,
        mass_kg: values.mass_kg,
        sliding_friction: values.sliding_friction,
        sizing: values.sizing,
        geometry_context_sha256: context,
      });
      this.check(generation);
      if (draft === this.draft && targetVersion === this.targetDraftVersion) {
        this.dirty = false;
        // The saved job now owns this sizing; a preview is always unsaved.
        this.sizingPreview = null;
      }
      this.setJob(job);
      return job;
    });
  }

  async saveAndProcess(inputs: ReviewedInputs) {
    if (this.refreshing)
      throw new Error("Wait for the current job refresh before saving.");
    const generation = this.generation,
      draft = this.draft,
      target = this.targetDraftVersion;
    await this.saveReviewed(inputs);
    this.check(generation);
    if (
      this.dirty ||
      draft !== this.draft ||
      target !== this.targetDraftVersion
    )
      throw new SessionCancelledError();
    return this.process();
  }

  async process() {
    const id = this.requireJob().id;
    if (this.refreshing)
      throw new Error(
        "Wait for the current job refresh before generating a simulation.",
      );
    if (this.dirty)
      throw new Error("Save your changes before generating a simulation.");
    if (!this.targetStatus.canProcess)
      throw new Error(this.targetStatus.reason);
    return this.mutation(async (generation) => {
      const job = await this.api.process(id);
      this.check(generation);
      this.setJob(job);
      return job;
    });
  }

  private async readSuggestions(
    request: () => Promise<Suggestions>,
    missingCache = false,
  ) {
    const generation = this.generation;
    const serial = ++this.suggestionRequest;
    try {
      const values = await request();
      this.check(generation);
      if (serial !== this.suggestionRequest) throw new SessionCancelledError();
      this.suggestionValues = values;
      this.error = null;
      this.changed();
      return values;
    } catch (error) {
      if (
        generation === this.generation &&
        serial === this.suggestionRequest &&
        !(missingCache && error instanceof ApiError && error.status === 404) &&
        !(error instanceof SessionCancelledError)
      ) {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.changed();
      }
      throw error;
    }
  }
  cachedSuggestions() {
    const id = this.requireJob().id;
    return this.readSuggestions(() => this.api.cachedSuggestions(id), true);
  }
  /** Cache first; at most one automatic attempt per job/session. Manual retry remains explicit. */
  initialSuggestions(): Promise<Suggestions> {
    const id = this.requireJob().id,
      generation = this.generation;
    if (
      this.initialRead?.generation === generation &&
      this.initialRead.id === id
    )
      return this.initialRead.promise;
    const promise = this.readInitialSuggestions(id, generation);
    this.initialRead = { id, generation, promise };
    const clear = () => {
      if (this.initialRead?.promise === promise) this.initialRead = undefined;
    };
    void promise.then(clear, clear);
    return promise;
  }
  private async readInitialSuggestions(id: string, generation: number) {
    const serial = this.suggestionRequest + 1;
    try {
      return await this.cachedSuggestions();
    } catch (error) {
      this.check(generation);
      if (serial !== this.suggestionRequest) throw new SessionCancelledError();
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      // An optional estimate must not start a provider request during processing or a save.
      if (this.busy || this.refreshing || running(this.job)) throw error;
      const key = `kamino:gemini-auto:${id}`;
      let attempted = this.automaticAttempts.has(id);
      try {
        attempted ||= sessionStorage.getItem(key) === "attempted";
      } catch {
        /* optional storage */
      }
      if (attempted) throw error;
      this.automaticAttempts.add(id);
      try {
        sessionStorage.setItem(key, "attempted");
      } catch {
        /* retain in-memory guard */
      }
      return this.requestSuggestions({ refresh: false });
    }
  }
  requestSuggestions(
    request: { object_hint?: string; refresh?: boolean } = {},
  ) {
    const id = this.requireJob().id;
    return this.readSuggestions(() => this.api.suggestions(id, clone(request)));
  }
  private async guardedArtifact<T>(generation: number, request: Promise<T>) {
    try {
      const result = await request;
      this.check(generation);
      return result;
    } catch (error) {
      this.check(generation);
      throw error;
    }
  }
  file(path: string) {
    return this.guardedArtifact(
      this.generation,
      this.api.file(this.requireJob().id, path),
    );
  }
  report(path?: string) {
    const job = this.requireJob();
    const reportPath = path ?? job.validation_path;
    if (!reportPath) throw new Error("No validation report is available yet.");
    return this.guardedArtifact(
      this.generation,
      this.api.report(job.id, reportPath),
    );
  }
  downloadBundle(attemptId?: string) {
    const job = this.requireJob();
    const source = attemptId
      ? this.attempts.find((attempt) => attempt.id === attemptId)
      : job;
    if (!source || source.status !== "completed" || !source.bundle_path) {
      throw new Error(
        "A validated simulation bundle is not available for this attempt.",
      );
    }
    return this.guardedArtifact(
      this.generation,
      this.api.file(job.id, source.bundle_path),
    );
  }
}
