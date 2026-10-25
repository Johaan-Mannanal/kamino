// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Job } from "./backend-session";
import {
  paintReconstructionBar,
  reconstructionDisplay,
} from "./reconstruction-progress";
const now = Date.parse("2026-10-25T12:01:00Z");
const job = (override: Partial<Job> = {}) =>
  ({
    provider: "meshy",
    synthetic: false,
    status: "reconstructing",
    mesh_path: null,
    created_at: "2026-10-25T12:00:00Z",
    progress: 1,
    reconstruction_progress: {
      stage: "processing",
      stage_started_at: "2026-10-25T12:00:00Z",
      provider_progress: 1,
      last_advanced_at: "2026-10-25T12:00:50Z",
    },
    ...override,
  }) as Job;

describe("truthful reconstruction progress", () => {
  it("uses reported percentages, with no elapsed-time smoothing", () => {
    expect(reconstructionDisplay(job(), now).percent).toBe(1);
    expect(reconstructionDisplay(job(), now + 5000).percent).toBe(1);
  });
  it("makes a repeated low milestone indeterminate while retaining its value and elapsed wait", () => {
    const display = reconstructionDisplay(job(), now + 45000);
    expect(display.percent).toBeNull();
    expect(display.detail).toContain("Meshy reports 1%");
    expect(display.detail).toContain("no advance for 55s");
  });
  it("does not turn unknown readings or a provider 100 into ready", () => {
    const base = job();
    expect(
      reconstructionDisplay(
        job({
          reconstruction_progress: {
            ...base.reconstruction_progress!,
            provider_progress: null,
          },
        }),
        now,
      ).percent,
    ).toBeNull();
    expect(
      reconstructionDisplay(
        job({
          reconstruction_progress: {
            ...base.reconstruction_progress!,
            provider_progress: 100,
            stage: "downloading",
          },
        }),
        now,
      ),
    ).toMatchObject({ label: "Preparing your mesh", percent: null });
    expect(
      reconstructionDisplay(job({ mesh_path: "reconstruction/mesh.glb" }), now)
        .percent,
    ).toBe(100);
  });
  it("distinguishes server queue, provider queue and submission", () => {
    expect(
      reconstructionDisplay(
        job({ status: "queued", reconstruction_progress: null }),
        now,
      ).label,
    ).toContain("server queue");
    for (const stage of ["submitting", "queued"] as const) {
      const display = reconstructionDisplay(
        job({
          reconstruction_progress: { ...job().reconstruction_progress!, stage },
        }),
        now,
      );
      expect(display.percent).toBeNull();
      expect(display.label).toContain(
        stage === "queued" ? "Meshy's queue" : "Sending photos",
      );
    }
  });
  it("preserves regressive raw observations and identifies the previous high water mark", () => {
    expect(reconstructionDisplay(job({ progress: 40 }), now).detail).toContain(
      "reports 1% · highest reported 40%",
    );
  });
  it("updates visible width and accessibility together, and clears them for waiting", () => {
    const bar = document.createElement("div");
    bar.innerHTML = "<span></span>";
    paintReconstructionBar(bar, 42);
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect((bar.firstChild as HTMLElement).style.width).toBe("42%");
    paintReconstructionBar(bar, null);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect((bar.firstChild as HTMLElement).style.width).toBe("");
  });
});
