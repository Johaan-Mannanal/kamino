// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { promptForToken } from "./live-workspace";
import { BackendSession } from "./backend-session";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("recovers public access after expiry without displaying a code dialog", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: false, public_student_access: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, role: "student", session_seconds: 1800 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: true, public_student_access: true, role: "student", session_seconds: 1800 }))));
  const pending = promptForToken(new BackendSession(), "Session expired", true);
  await vi.waitFor(() => expect(document.querySelector("dialog")).toBeNull());
  await expect(pending).resolves.toBe(true);
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
