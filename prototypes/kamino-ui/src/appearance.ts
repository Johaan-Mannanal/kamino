export function initAppearance() {
  document.documentElement.style.setProperty(
    "--font-display",
    '"Segoe UI", -apple-system, sans-serif',
  );
  document.documentElement.dataset.typography = "studio";
  try {
    sessionStorage.removeItem("kamino-font-preview");
  } catch {}
  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.append(glow);
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let x = 0,
    y = 0,
    currentX = 0,
    currentY = 0,
    frame = 0,
    visible = false;
  const paint = () => {
    frame = 0;
    currentX += (x - currentX) * 0.3;
    currentY += (y - currentY) * 0.3;
    glow.style.transform = `translate3d(${currentX - 130}px,${currentY - 130}px,0)`;
    if (visible && Math.hypot(x - currentX, y - currentY) > 0.2)
      frame = requestAnimationFrame(paint);
  };
  const hide = () => {
    visible = false;
    glow.classList.remove("visible");
    cancelAnimationFrame(frame);
    frame = 0;
  };
  document.addEventListener(
    "pointermove",
    (event) => {
      if (
        document.documentElement.dataset.page !== "home" ||
        !fine.matches ||
        reduced.matches ||
        event.pointerType !== "mouse"
      ) {
        hide();
        return;
      }
      x = event.clientX;
      y = event.clientY;
      if (!visible) {
        currentX = x;
        currentY = y;
        visible = true;
        glow.classList.add("visible");
      }
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", hide);
  window.addEventListener("blur", hide);
  window.addEventListener("hashchange", hide);
  reduced.addEventListener("change", hide);
  fine.addEventListener("change", hide);
}
