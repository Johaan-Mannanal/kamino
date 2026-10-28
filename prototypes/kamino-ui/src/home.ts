import { MugViewer } from "./viewer";
import { clamp, settle, chooseChapter, storyScene } from "./story-motion";

type HomeOptions = {
  brand: string;
  photos: { name: string; url: string }[];
  onDemo: () => void;
};
const titles = [
  "From photos to<br>simulation.",
  "Capture every<br>angle.",
  "Bring it<br>into 3D.",
  "Make it<br>your own.",
  "Ready for your<br>next experiment.",
];
const descriptions = [
  "Turn everyday objects into simulation-ready assets.",
  "A few clear photos. A complete view of your object.",
  "Explore the shape behind your photographs.",
  "Set a known dimension. Review scale and physical properties.",
  "Create an asset from your photos, or explore a prepared demo.",
];

export function mountHome(app: HTMLElement, options: HomeOptions) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  // Touch and narrow screens share the narrative; only an explicit motion preference opts out.
  let staticMode = reduced.matches;
  let viewerUnavailable = false;
  const actions = `<a class="primary" href="#upload"><img class="icon" src="/assets/0f26a.svg" width="16" height="16" alt="">Upload your photos</a><button class="quiet" data-demo>Try the demo <img class="icon" src="/assets/55033.svg" width="16" height="16" alt=""></button>`;
  app.innerHTML = `<main class="home home-refined"><header class="site-header">${options.brand}<div><a class="nav-example" href="/example.html">Explore example</a><a class="nav-source" href="https://github.com/Johaan-Mannanal/kamino">GitHub / Run locally</a><button class="text-button" data-guide>Quick guide</button><a class="accent nav-upload" href="#upload">Upload photos ↗</a></div></header><div id="story"><div class="story-sticky"><div class="depth-stage" aria-hidden="true"><canvas class="projected-grid" aria-hidden="true"></canvas><div class="depth-horizon"></div></div><div id="story-copy">${titles.map((title, index) => `<section class="story-panel" data-story-panel="${index}" ${index ? 'aria-hidden="true" inert' : ""}><h1>${title}</h1><p>${descriptions[index]}</p>${index === 4 ? `<div id="story-actions">${actions}</div>` : ""}</section>`).join("")}</div><div class="story-stage"><img id="hero-art" src="/assets/46613.png" alt="Cream ceramic mug"><div id="story-viewer"></div><div id="capture-phone" aria-hidden="true"><div><img src="${options.photos[0].url}" alt=""></div><span></span></div><div id="capture-thumbs" aria-label="Example capture angles">${options.photos.map((p) => `<figure><img src="${p.url}" alt="${p.name} view"><figcaption>${p.name}</figcaption></figure>`).join("")}</div><div id="dimension-peek" aria-hidden="true"><span class="muted">Known length · X</span><strong>120 → 132 <small>mm</small></strong><span>132 × 110 × 99 mm</span></div></div><div class="story-bottom"><span id="scroll-label">Scroll to explore ↓</span><div id="chapters"><div class="story-progress" role="progressbar" aria-label="Homepage progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="story-progress-fill"></span></div>${titles.map((_, i) => `<button aria-label="Go to chapter ${i + 1}" class="chapter ${i === 0 ? "active" : ""}" data-chapter="${i}"></button>`).join("")}</div></div></div></div><div class="static-chapters">${titles
    .slice(1)
    .map(
      (title, i) =>
        `<section><h2>${title.replaceAll("<br>", " ")}</h2><p>${descriptions[i + 1]}</p>${i === 0 ? `<div class="static-thumbs">${options.photos.map((p) => `<img src="${p.url}" alt="${p.name} view">`).join("")}</div>` : i === 1 ? '<p class="muted">Orbit and inspect the demo mesh in your workspace.</p>' : i === 2 ? '<div class="static-dim">Width 120 → 132 mm<br><small>Proportions preserved</small></div>' : `<div class="static-actions">${actions}</div>`}</section>`,
    )
    .join("")}</div></main>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) =>
    app.querySelector<T>(s)!;
  const progressBar = q(".story-progress");
  const progressFill = q(".story-progress-fill");
  const groundCanvas = q<HTMLCanvasElement>(".projected-grid");
  const story = q("#story");
  const stage = q("#story-viewer");
  const panels = Array.from(
    app.querySelectorAll<HTMLElement>("[data-story-panel]"),
  );
  const marks = Array.from(
    app.querySelectorAll<HTMLButtonElement>("[data-chapter]"),
  );
  const phone = q("#capture-phone"),
    thumbs = q("#capture-thumbs"),
    inspector = q("#dimension-peek"),
    scrollLabel = q("#scroll-label");
  let view: MugViewer | undefined;
  let lastHero = -1;
  let target = 0,
    current = 0,
    previousTime = 0,
    raf = 0,
    active = -1,
    disposed = false,
    step = 1,
    origin = 0;
  const stopViewer = () => {
    view?.renderer.domElement.removeEventListener("webglcontextlost", showStatic);
    view?.dispose();
    view = undefined;
  };
  const showStatic = () => {
    if (disposed || viewerUnavailable) return;
    viewerUnavailable = true;
    stopViewer();
    const notice = document.createElement("p");
    notice.className = "home-viewer-notice";
    notice.setAttribute("role", "status");
    notice.textContent = "3D preview unavailable on this browser. Showing the complete page without animation. You can still upload photos or explore the example.";
    q(".site-header").after(notice);
    resize();
  };
  const startViewer = () => {
    if (view || staticMode) return;
    try {
      view = new MugViewer(stage, true, groundCanvas);
      view.renderer.domElement.addEventListener("webglcontextlost", showStatic);
    } catch {
      showStatic();
    }
  };
  const paint = () => {
    const next = staticMode ? 0 : chooseChapter(current, active);
    if (next !== active) {
      const immediate = active < 0 || staticMode || reduced.matches;
      const direction = next >= active ? 1 : -1;
      panels.forEach((panel, i) => {
        const computed = getComputedStyle(panel);
        const opacity = Number(computed.opacity);
        const transform = computed.transform;
        panel.getAnimations().forEach((animation) => animation.cancel());
        const show = i === next;
        panel.setAttribute("aria-hidden", String(!show));
        panel.inert = !show;
        panel.style.opacity = show ? "1" : "0";
        panel.style.transform = show
          ? "translate3d(0,0,0)"
          : `translate3d(0,${-direction * 24}px,0)`;
        if (immediate) {
          panel.style.visibility = show ? "visible" : "hidden";
          return;
        }
        if (!show && opacity < 0.001) {
          panel.style.visibility = "hidden";
          return;
        }
        panel.style.visibility = "visible";
        const animation = panel.animate(
          [
            {
              opacity,
              transform:
                show && opacity < 0.001
                  ? `translate3d(0,${direction * 24}px,0)`
                  : transform,
            },
            { opacity: show ? 1 : 0, transform: panel.style.transform },
          ],
          { duration: show ? 260 : 140, easing: "cubic-bezier(.22,1,.36,1)" },
        );
        animation.onfinish = () => {
          if (panel.getAttribute("aria-hidden") === "true")
            panel.style.visibility = "hidden";
        };
      });
      const capture = next === 1 ? 1 : 0;
      const inspect = next === 3 ? 1 : 0;
      phone.style.opacity = thumbs.style.opacity = String(capture);
      phone.style.transform = `translate3d(${-12 * (1 - capture)}px,0,0)`;
      thumbs.style.transform = `translate3d(0,${12 * (1 - capture)}px,0)`;
      inspector.style.opacity = String(inspect);
      inspector.style.transform = `translate3d(0,${16 * (1 - inspect)}px,0)`;
      active = next;
      marks.forEach((m, i) => {
        m.classList.toggle("active", i === active);
        m.setAttribute("aria-current", i === active ? "step" : "false");
      });
      scrollLabel.textContent = active === 4 ? "" : "Scroll to explore ↓";
    }
    const scene = storyScene(current);
    const heroChanged = lastHero !== scene.hero;
    if (heroChanged) {
      stage.style.transform = `translate3d(${-12 * scene.hero}px,${-10 * scene.hero}px,0) scale(${1 + 0.23 * scene.hero})`;
      lastHero = scene.hero;
    }
    progressFill.style.transform = `scaleX(${current / 4})`;
    progressBar.setAttribute("aria-valuenow", String(Math.round(current * 25)));
    view?.storyProgress(current);
    if (heroChanged) view?.drawGround();
    story.dataset.progress = current.toFixed(4);
  };
  const frame = (time: number) => {
    raf = 0;
    if (disposed || staticMode) return;
    current = settle(current, target, previousTime ? time - previousTime : 16);
    previousTime = time;
    if (Math.abs(target - current) < 0.0001) current = target;
    paint();
    if (current !== target) raf = requestAnimationFrame(frame);
    else previousTime = 0;
  };
  const schedule = () => {
    if (!raf && !staticMode) raf = requestAnimationFrame(frame);
  };
  const scroll = () => {
    target = clamp((scrollY - origin) / step, 0, 4);
    schedule();
  };
  const resize = () => {
    const nextStatic = reduced.matches || viewerUnavailable;
    if (nextStatic !== staticMode) {
      staticMode = nextStatic;
      if (staticMode) {
        stopViewer();
        cancelAnimationFrame(raf);
        raf = 0;
        current = target = 0;
      } else startViewer();
    }
    story.classList.toggle("static-story", staticMode);
    q(".home").classList.toggle("static-home", staticMode);
    // Match the stable CSS viewport so collapsing mobile browser chrome cannot shift chapters.
    step = Math.max(
      320,
      q(".story-sticky").getBoundingClientRect().height * 0.62,
    );
    story.style.setProperty("--story-travel", `${step * 4}px`);
    origin = story.getBoundingClientRect().top + scrollY;
    if (staticMode) {
      current = 0;
      paint();
    } else scroll();
  };
  marks.forEach(
    (b) =>
      (b.onclick = () =>
        window.scrollTo({
          top: origin + Number(b.dataset.chapter) * step,
          behavior: reduced.matches ? "instant" : "smooth",
        })),
  );
  app
    .querySelectorAll<HTMLButtonElement>("[data-demo]")
    .forEach((b) => (b.onclick = options.onDemo));
  // Avoid capturing wheel input: native page scrolling remains reversible and unmodified.
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("resize", resize);
  reduced.addEventListener("change", resize);
  resize();
  startViewer();
  paint();
  return () => {
    disposed = true;
    panels.forEach((panel) =>
      panel.getAnimations().forEach((animation) => animation.cancel()),
    );
    cancelAnimationFrame(raf);
    stopViewer();
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("resize", resize);
    reduced.removeEventListener("change", resize);
  };
}
