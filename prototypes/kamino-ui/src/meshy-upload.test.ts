// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("scrollTo", () => {});
  history.replaceState(null, '', '/#upload');
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('URL', class extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

it('requires a masked per-user key for real photos and sends it with the upload', async () => {
  const seen: {url:string; init: RequestInit}[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    seen.push({ url, init });
    if (url.endsWith('/api/session')) return new Response(JSON.stringify({ authenticated: true, required: false }));
    return new Response(JSON.stringify({ detail: 'Intentional test rejection; no paid submission' }), { status: 422 });
  });
  await import('./main');
  const files = document.querySelector<HTMLInputElement>('#photo-input')!;
  Object.defineProperty(files, 'files', { value: [new File(['photo'], 'one.png', {type:'image/png'})] });
  files.dispatchEvent(new Event('change', { bubbles: true }));
  const button = document.querySelector<HTMLButtonElement>('#create-mesh')!;
  const key = document.querySelector<HTMLInputElement>('#meshy-api-key')!;
  expect(key.type).toBe('password');
  expect(button.disabled).toBe(true);
  key.value = 'msy_browser_private_key';
  key.dispatchEvent(new Event('input', {bubbles:true}));
  expect(button.disabled).toBe(false);
  button.click();
  await vi.waitFor(() => expect(document.querySelector('#upload-error')?.textContent).toContain('Intentional test rejection'));
  const request = seen.find(r => r.url.endsWith('/api/jobs'))!;
  expect(new Headers(request.init.headers).get('X-Meshy-Key')).toBe('msy_browser_private_key');
  expect(document.querySelectorAll('.photo-row')).toHaveLength(1);
  expect(key.value).toBe('msy_browser_private_key'); // Retained only in current form after rejection.
  expect(document.documentElement.outerHTML).not.toContain('msy_browser_private_key');
});
