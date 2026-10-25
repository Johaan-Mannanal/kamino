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

export type {
  Job,
  Orientation,
  Properties,
  Sizing,
  SizingPreview,
  Suggestions,
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

/** Owns saved server state only. Forms own their drafts and call markDirty on edits. */
export class BackendSession {
  job: Job | null = null;
  error: Error | null = null;
  busy = false;
  refreshing = false;
  dirty = false;
  suggestionValues: Suggestions | null = null;
  sizingPreview: SizingPreview | null = null;
  private generation = 0;
  private revision = 0;
  private draft = 0;
  private readRequest = 0;
  private suggestionRequest = 0;
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
    this.job = job;
    this.changed();
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
        void this.refresh().catch(() => {
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
      this.job = job;
      this.dirty = false;
      this.suggestionValues = null;
      this.sizingPreview = null;
      this.changed();
      return job;
    });
  }

  async restore(id: string) {
    const retainedDirty = this.job?.id === id && this.dirty;
    this.cancel();
    return this.mutation(async (generation, draft) => {
      const job = await this.api.get(id);
      this.check(generation);
      if (draft === this.draft) this.dirty = retainedDirty;
      this.suggestionValues = null;
      this.sizingPreview = null;
      this.setJob(job);
      return job;
    });
  }

  async refresh() {
    const current = this.requireJob();
    if (this.busy) return current;
    const generation = this.generation,
      revision = this.revision;
    const request = ++this.readRequest;
    this.clearTimer();
    this.refreshing = true;
    this.sizingPreview = null;
    this.previewRequest++;
    this.changed();
    try {
      const job = await this.api.get(current.id);
      this.check(generation);
      if (revision !== this.revision || request !== this.readRequest)
        throw new SessionCancelledError();
      this.error = null;
      this.setJob(job);
      return job;
    } catch (error) {
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
    const id = this.requireJob().id,
      generation = this.generation;
    const draft = this.draft,
      revision = this.revision;
    const request = ++this.previewRequest;
    const result = await this.api.previewSizing(id, {
      sizing: clone(sizing),
      orientation: clone(orientation),
    });
    this.check(generation);
    if (
      draft !== this.draft ||
      revision !== this.revision ||
      request !== this.previewRequest
    )
      throw new SessionCancelledError();
    this.sizingPreview = result;
    this.changed();
    return result;
  }

  async saveProperties(properties: Properties) {
    const id = this.requireJob().id,
      value = clone(properties);
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
    const id = this.requireJob().id,
      values = clone(inputs);
    return this.mutation(async (generation, draft) => {
      this.dirty = true;
      this.sizingPreview = null;
      const oriented = await this.api.saveOrientation(id, values.orientation);
      this.check(generation);
      this.setJob(oriented);
      const preview = await this.api.previewSizing(id, {
        sizing: values.sizing,
        orientation: values.orientation,
      });
      this.check(generation);
      const job = await this.api.save(id, {
        dimensions_m: preview.dimensions_m,
        mass_kg: values.mass_kg,
        sliding_friction: values.sliding_friction,
        sizing: values.sizing,
      });
      this.check(generation);
      if (draft === this.draft) {
        this.dirty = false;
        this.sizingPreview = preview;
      }
      this.setJob(job);
      return job;
    });
  }

  async process() {
    const id = this.requireJob().id;
    if (this.refreshing)
      throw new Error(
        "Wait for the current job refresh before generating a simulation.",
      );
    if (this.dirty)
      throw new Error("Save your changes before generating a simulation.");
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
