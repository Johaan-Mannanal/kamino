export type CropRect = { x: number; y: number; width: number; height: number };
export type ReviewedPhoto = { file: File; crop: CropRect };

export function validateCrop(crop: CropRect, width: number, height: number): string | null {
  const { x, y, width: w, height: h } = crop;
  if (![x, y, w, h].every(Number.isSafeInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height)
    return "Keep the crop inside the photo, with a positive whole-pixel width and height.";
  return null;
}

export async function cropFile(original: File, image: HTMLImageElement, crop: CropRect): Promise<File> {
  const error = validateCrop(crop, image.naturalWidth, image.naturalHeight);
  if (error) throw new Error(error);
  const { x, y, width, height } = crop;
  if (x === 0 && y === 0 && width === image.naturalWidth && height === image.naturalHeight) return original;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo cropping is unavailable in this browser. Keep the full image or try another browser.");
  // Source and destination rectangles have equal dimensions: never stretch or downsample.
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode this crop. Your original photo is unchanged.");
  if (blob.size > 10 * 1024 * 1024) throw new Error("This lossless crop exceeds 10 MiB. Choose a smaller crop or keep the original photo.");
  return new File([blob], `${original.name.replace(/\.[^.]+$/, "")}-crop.png`, { type: "image/png", lastModified: original.lastModified });
}

/** Review always starts from the original, so repeated edits never crop an earlier crop. */
export function reviewPhoto(original: File, previous?: CropRect): Promise<ReviewedPhoto | null> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "photo-review-dialog";
    dialog.setAttribute("aria-labelledby", "photo-review-title");
    dialog.innerHTML = `<h2 id="photo-review-title">Review photo framing</h2><p class="muted">Keep the whole object, including pins and protrusions. Exclude nearby objects where possible. Drag a rectangle or enter pixel bounds; use Full photo to reset.</p><p class="small">Original stays in this tab. Only the confirmed image is submitted. Cropping cannot reveal hidden faces.</p><canvas aria-label="Original photo with selected crop" tabindex="0"></canvas><form><fieldset class="crop-fields"><legend>Crop bounds in oriented photo pixels</legend>${[["x", "Left"], ["y", "Top"], ["width", "Width"], ["height", "Height"]].map(([key, label]) => `<label>${label}<input type="number" name="${key}" min="${key === "x" || key === "y" ? 0 : 1}" step="1" required></label>`).join("")}</fieldset><label class="crop-confirm"><input type="checkbox" name="confirmed"> The frame includes the entire intended object.</label><p class="error" role="alert"></p><div class="crop-actions"><button type="button" class="secondary" data-full>Full photo</button><button type="button" class="secondary" data-cancel>Cancel</button><button type="submit" class="primary" disabled>Use this framing</button></div></form>`;
    document.body.append(dialog);
    const canvas = dialog.querySelector("canvas")!;
    const form = dialog.querySelector("form")!;
    const confirm = form.elements.namedItem("confirmed") as HTMLInputElement;
    const submit = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!;
    const error = dialog.querySelector<HTMLElement>('[role="alert"]')!;
    const image = new Image();
    const url = URL.createObjectURL(original);
    let crop: CropRect;
    let loaded = false, encoding = false, closed = false;
    let answer: ReviewedPhoto | null = null;
    const input = (key: keyof CropRect) => form.elements.namedItem(key) as HTMLInputElement;
    const update = () => {
      if (!loaded) return;
      const invalid = validateCrop(crop, image.naturalWidth, image.naturalHeight);
      error.textContent = invalid ?? "";
      submit.disabled = !!invalid || !confirm.checked || encoding;
      const ctx = canvas.getContext("2d");
      if (!ctx) { error.textContent = "Photo preview unavailable. Try another browser."; submit.disabled = true; return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (invalid) return;
      const sx = canvas.width / image.naturalWidth, sy = canvas.height / image.naturalHeight;
      const { x, y, width, height } = crop;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, canvas.width, y * sy);
      ctx.fillRect(0, (y + height) * sy, canvas.width, canvas.height - (y + height) * sy);
      ctx.fillRect(0, y * sy, x * sx, height * sy);
      ctx.fillRect((x + width) * sx, y * sy, canvas.width - (x + width) * sx, height * sy);
      ctx.strokeStyle = "#83b6ff"; ctx.lineWidth = 3;
      ctx.strokeRect(x * sx, y * sy, width * sx, height * sy);
    };
    const fill = () => { for (const key of ["x", "y", "width", "height"] as const) input(key).value = String(crop[key]); update(); };
    image.onload = () => {
      if (closed) return;
      loaded = true;
      const ratio = Math.min(1, 900 / image.naturalWidth, 600 / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      crop = previous && !validateCrop(previous, image.naturalWidth, image.naturalHeight) ? { ...previous } : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      fill();
    };
    image.onerror = () => { if (!closed) error.textContent = "Could not read this photo. Cancel and choose another supported image."; };
    image.src = url; // Browser decodes EXIF orientation for both preview and crop.
    form.addEventListener("input", event => {
      if (!loaded || encoding) return;
      if (event.target !== confirm) {
        crop = { x: input("x").valueAsNumber, y: input("y").valueAsNumber, width: input("width").valueAsNumber, height: input("height").valueAsNumber };
        confirm.checked = false;
      }
      update();
    });
    let start: [number, number] | undefined;
    const point = (event: PointerEvent): [number, number] => {
      const bounds = canvas.getBoundingClientRect();
      return [Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * image.naturalWidth), Math.round(Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) * image.naturalHeight)];
    };
    canvas.onpointerdown = event => {
      if (!loaded || encoding || event.button !== 0) return;
      event.preventDefault(); start = point(event); canvas.setPointerCapture(event.pointerId);
    };
    const drag = (event: PointerEvent) => {
      if (!start) return;
      const end = point(event);
      crop = { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), width: Math.abs(start[0] - end[0]), height: Math.abs(start[1] - end[1]) };
      confirm.checked = false; fill();
    };
    canvas.onpointermove = drag;
    canvas.onpointerup = event => { drag(event); start = undefined; };
    canvas.onpointercancel = () => { start = undefined; };
    dialog.querySelector<HTMLButtonElement>("[data-full]")!.onclick = () => {
      if (!loaded || encoding) return;
      crop = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }; confirm.checked = false; fill();
    };
    dialog.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = () => dialog.close();
    form.onsubmit = async event => {
      event.preventDefault();
      if (!loaded || !confirm.checked || encoding || validateCrop(crop, image.naturalWidth, image.naturalHeight)) return;
      encoding = true;
      const selected = { ...crop };
      form.querySelectorAll<HTMLInputElement>("input").forEach(el => el.disabled = true);
      update(); submit.textContent = "Preparing photo…";
      try {
        const file = await cropFile(original, image, selected);
        if (!closed) { answer = { file, crop: selected }; dialog.close(); }
      } catch (reason) {
        if (!closed) { encoding = false; form.querySelectorAll<HTMLInputElement>("input").forEach(el => el.disabled = false); update(); error.textContent = reason instanceof Error ? reason.message : "Could not prepare this photo."; submit.textContent = "Use this framing"; }
      }
    };
    dialog.addEventListener("close", () => { closed = true; URL.revokeObjectURL(url); dialog.remove(); resolve(answer); }, { once: true });
    dialog.showModal();
  });
}
