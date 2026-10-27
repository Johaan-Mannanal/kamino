// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { promptForToken } from "./live-workspace";
import { BackendSession } from "./backend-session";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps rejected sign-in open and clears the code only after a successful exchange", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (value = "") {
    this.returnValue = value;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Wrong team code" }), {
        status: 401,
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true })),
    );
  vi.stubGlobal("fetch", fetch);
  const session = new BackendSession();
  const token = vi.spyOn(session, "setToken");
  const result = promptForToken(session, "Sign in before uploading.");
  expect(
    document.querySelector<HTMLAnchorElement>('dialog a[href="/example.html"]')
      ?.href,
  ).toContain("/example.html");
  const input = document.querySelector<HTMLInputElement>("input")!;
  const form = document.querySelector("form")!;
  input.value = "wrong";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Wrong team code",
    ),
  );
  expect(document.querySelector("dialog")?.open).toBe(true);
  expect(token).not.toHaveBeenCalled();
  input.value = "private-team-code";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await expect(result).resolves.toBe(true);
  expect(input.value).toBe("");
  expect(token).toHaveBeenCalledWith("");
  expect(document.querySelector("dialog")).toBeNull();
});
