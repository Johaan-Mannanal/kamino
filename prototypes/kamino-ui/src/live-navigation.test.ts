import { describe, expect, it, vi } from "vitest";
import { UploadNavigation } from "./live-navigation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("accepted upload navigation", () => {
  it("retains the accepted job before handling navigation away from the upload page", async () => {
    const pending = deferred<{ id: string }>();
    const uploads = new UploadNavigation();
    let page = "upload";
    const events: string[] = [];
    const result = uploads.submit(() => pending.promise, {
      remember: (id) => events.push(`url:${id}`),
      isCurrent: () => page === "upload",
      openCurrent: () => events.push("open-creating"),
      acceptedInBackground: () => events.push(`resume-on:${page}`),
    });
    page = "home";
    pending.resolve({ id: "accepted-job" });
    await result;
    expect(events).toEqual(["url:accepted-job", "resume-on:home"]);
    expect(uploads.acceptedId).toBe("accepted-job");
    expect(uploads.pending).toBe(false);
  });

  it("prevents a second upload while a request from an earlier view is pending", async () => {
    const pending = deferred<{ id: string }>();
    const uploads = new UploadNavigation();
    const navigation = {
      remember: vi.fn(),
      isCurrent: () => true,
      openCurrent: vi.fn(),
      acceptedInBackground: vi.fn(),
    };
    const first = uploads.submit(() => pending.promise, navigation);
    const duplicate = vi.fn().mockResolvedValue({ id: "duplicate" });
    await expect(uploads.submit(duplicate, navigation)).rejects.toThrow(
      "already in progress",
    );
    expect(duplicate).not.toHaveBeenCalled();
    pending.resolve({ id: "accepted-job" });
    await first;
    expect(navigation.remember).toHaveBeenCalledWith("accepted-job");
    expect(navigation.openCurrent).toHaveBeenCalledOnce();
  });

  it("allows an explicit retry after failure without replacing an earlier accepted job", async () => {
    const uploads = new UploadNavigation();
    uploads.acceptedId = "earlier-job";
    const navigation = {
      remember: vi.fn(),
      isCurrent: () => true,
      openCurrent: vi.fn(),
      acceptedInBackground: vi.fn(),
    };
    await expect(
      uploads.submit(() => Promise.reject(new Error("offline")), navigation),
    ).rejects.toThrow("offline");
    expect(uploads.pending).toBe(false);
    expect(uploads.acceptedId).toBe("earlier-job");
    expect(navigation.remember).not.toHaveBeenCalled();
    await uploads.submit(
      () => Promise.resolve({ id: "retry-job" }),
      navigation,
    );
    expect(uploads.acceptedId).toBe("retry-job");
  });
});
