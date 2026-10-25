# Kamino Figma workflow stage log

These are retrospective time ranges, not timer records. They describe the visible Figma file, archived UI screenshot, commit history, and handoff notes. Do not count a tool as used merely because it appears in the competition brief. The Figma screens are design evidence; the hosted synthetic demo is implementation evidence, not a real reconstruction or simulation validation.

## 1. Ideation — approximately 1–3 hours (retrospective estimate)

**Tools used:** Existing Photo2Sim browser UI, Figma Design, project notes. **Why:** The first implementation placed upload, object data, process status, validation, and downloads in one long page. The redesign organized the journey into Home, Upload, Creating mesh, and Workspace, with a single ceramic mug example carrying the story. **Usefulness:** 4/5; the earlier UI exposed the actual workflow but made review and orientation harder to understand. **Connection to code:** The staged route and story became `prototypes/kamino-ui/src/home.ts`, `workflow.ts`, and `main.ts`. Evidence: `before-completed-desktop.jpg`, `home.png`, `upload.png`, and the original UI commit `9600d529756b9e7294d323c39230bdfb901fe46e`.

## 2. Prototyping — approximately 2–5 hours (retrospective estimate)

**Tools used:** Figma Design frames, reusable button/field/status components, prototype reactions and motion annotations. **Why:** Test the scroll story, upload path, mesh transition, and editable workspace before matching them in code. The Figma file has named prototype flows and transitions; its mug artwork is illustrative. **Usefulness:** 5/5; the screens made the progression and main actions concrete. **Connection to code:** The implemented Home story, upload screen, and 3D Workspace follow the frames, while the running site uses a real 3D viewer rather than Figma artwork. Evidence: `design-system.png`, `handoff-notes.png`, `creating-mesh.png`, `workspace.png`, and the Figma frame IDs in `README.md`.

## 3. Handoff — approximately 1–2 hours (retrospective estimate)

**Tools used:** Figma annotations, exported screen views, Git and the UI handoff document. **Why:** Explain which effects were illustrative and where implementation behavior needed backend events, retained camera state, accessible reduced-motion handling, and explicit review. **Usefulness:** 4/5; the notes prevented static prototype timing from being mistaken for reconstruction progress. **Connection to code:** The portable UI delivery was committed as `9600d529756b9e7294d323c39230bdfb901fe46e`; later Workspace integration appears in `2cdc3824a58b4da273d30bd61893828c6962b243`. Evidence: `handoff-notes.png` and `prototypes/kamino-ui/HANDOFF.md` in the public repository.

## 4. Code generation and iteration — several hours across October 24–25 (retrospective estimate)

**Tools used:** Codex-assisted TypeScript editing, Vite, Three.js, browser checks, tests, and Git. **Why:** Turn the Figma sequence into a working app, then connect the Workspace to shared API/viewer modules and refine mobile behavior. **Usefulness:** 5/5 for implementation and verification. **Connection to code:** `prototypes/kamino-ui/src/` contains the current UI; `frontend/src/viewer.ts` supplies shared viewer logic. The original prototype delivery, subsequent integration commit, and current public `main` document the progression. The hosted demo captured in `after-live-*.png` is explicitly synthetic and session-only; it does not prove live reconstruction, physical accuracy, or simulation validation. No Figma Make artifact or Figma-generated application code is claimed.
