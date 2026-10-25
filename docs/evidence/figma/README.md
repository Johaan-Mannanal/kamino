# Kamino before, after, and workflow images

**Before:** `before-completed-desktop.jpg` is an archived Photo2Sim browser capture from `frontend/evidence/completed-desktop.jpg` in public `main`. It shows the early synthetic single-page workflow. `before-completed-mobile.jpg` preserves its mobile counterpart.

**After design:** `home-opening.png` (Figma opening frame `4:99`), `home.png` (capture chapter `23:349`), `upload.png` (`8:1022`), `creating-mesh.png` (`8:1109`), and `workspace.png` (`4:170`) are actual PNG renders from [Kamino · Product](https://www.figma.com/design/rSOvF7zmhYyGwLxGqLRgAo/Untitled?node-id=0-1). `comparison-upload.png` and `comparison-workspace.png` place cropped portions of the early capture beside the Figma design; captions identify their different sources. Run `make_comparisons.py` to reproduce those two composites.

**After implementation:** `after-live-home.png`, `after-live-upload.png`, `after-live-upload-demo.png`, and `after-live-workspace.png` are browser captures from [kamino.design](https://kamino.design) on October 25, 2026. The demo path uses procedural geometry and is session-only. Use the Figma `creating-mesh.png` as the transition image.

**Behind the scenes:** `design-system.png` is the Figma reusable component section (`4:619`). `handoff-notes.png` is the Figma scroll and loading implementation annotation (`23:527`). See [WORKFLOW_STAGE_LOG.md](WORKFLOW_STAGE_LOG.md) for the actual stages, tools, time estimates, usefulness, and code connection.

The [Figma Slides story](https://www.figma.com/slides/wqDC8D4N5ycsDvkgEisqoS) opened in a signed-out browser, but the design and prototype URLs still show a sign-in gate. The deck links the prototype and repository; an interactive prototype embed still requires editor access. These PNGs do not substitute for a public prototype.
