import type { Job } from "./backend-session";

export type ReconstructionDisplay = {
  label: string;
  detail: string;
  percent: number | null;
};
const elapsed = (since: string | undefined, now: number) => {
  const parsed = since ? Date.parse(since) : now;
  const seconds = Math.max(
    0,
    Math.floor((now - (Number.isFinite(parsed) ? parsed : now)) / 1000),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** Percentages are provider observations, never time-based estimates. */
export function reconstructionDisplay(
  job: Job | null,
  now = Date.now(),
): ReconstructionDisplay {
  if (!job)
    return {
      label: "Loading job status…",
      detail: "Waiting for the server.",
      percent: null,
    };
  const provider = job.synthetic
    ? "Synthetic mock"
    : job.provider === "meshy"
      ? "Meshy"
      : "Provider";
  const progress = job.reconstruction_progress;
  const stage =
    progress?.stage ?? (job.status === "queued" ? "queued" : "processing");
  const duration = elapsed(job.created_at, now);
  if (job.status === "failed")
    return {
      label: "Reconstruction stopped",
      detail: `${duration} elapsed · task and inputs retained.`,
      percent: null,
    };
  if (job.status === "preparing" || job.status === "validating")
    return {
      label:
        job.status === "preparing"
          ? "Preparing simulation"
          : "Validating simulation",
      detail: `${duration} elapsed · local processing.`,
      percent: null,
    };
  if (job.mesh_path)
    return {
      label: "Mesh ready",
      detail: `${duration} elapsed · downloaded and verified.`,
      percent: 100,
    };
  if (stage === "submitting")
    return {
      label: `Sending photos to ${provider}`,
      detail: `${duration} elapsed · waiting for task acceptance.`,
      percent: null,
    };
  if (stage === "queued" || job.status === "queued")
    return {
      label: `Waiting in ${progress ? `${provider}'s` : "the server"} queue`,
      detail: `${duration} elapsed · processing has not started.`,
      percent: null,
    };
  if (stage === "downloading")
    return {
      label: "Preparing your mesh",
      detail: `${provider} generation finished · downloading and verifying the GLB · ${duration} elapsed.`,
      percent: null,
    };
  const reported = progress ? progress.provider_progress : job.progress;
  const stageStarted = progress?.stage_started_at ?? job.created_at;
  const lastAdvanced = progress?.last_advanced_at ?? stageStarted;
  const advanced =
    Date.parse(lastAdvanced) > Date.parse(stageStarted)
      ? lastAdvanced
      : stageStarted;
  const stalled = now - Date.parse(advanced) >= 30000;
  const known =
    typeof reported === "number" &&
    Number.isFinite(reported) &&
    reported >= 0 &&
    reported <= 100;
  // A live provider may repeat a low milestone for minutes; animate waiting,
  // retaining its exact observation in text, instead of inventing a completion curve.
  const percent = known && reported < 100 && !stalled ? reported : null;
  const milestone = known
    ? `${provider} reports ${reported}%`
    : `${provider} did not include a percentage in its latest update`;
  const regression =
    known && reported < Math.min(job.progress, 99)
      ? ` · highest reported ${job.progress}%`
      : "";
  return {
    label: `${provider} is creating your mesh`,
    detail: `${milestone}${regression} · ${duration} elapsed${stalled ? ` · no advance for ${elapsed(advanced, now)}; still waiting for ${provider}` : ""}.`,
    percent,
  };
}

/** Apply determinate/indeterminate semantics and the visible fill together. */
export function paintReconstructionBar(
  bar: HTMLElement,
  percent: number | null,
) {
  const fill = bar.firstElementChild as HTMLElement | null;
  bar.dataset.progressMode = percent === null ? "indeterminate" : "determinate";
  if (percent === null) bar.removeAttribute("aria-valuenow");
  else bar.setAttribute("aria-valuenow", String(percent));
  if (fill) {
    fill.style.width = percent === null ? "" : `${percent}%`;
    fill.style.animation = percent === null ? "" : "none";
    fill.style.translate = percent === null ? "" : "0 0";
  }
}
