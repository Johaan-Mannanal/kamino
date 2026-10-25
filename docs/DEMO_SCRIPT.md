# Kamino demo script

Scheduling update: this remains a draft. Final recording and presentation
practice follow deployment/sponsorship integration and the final improvements
phase in [the master roadmap](handoffs/master-roadmap.md).

Prepared 2026-10-24 by the coordination chat. Target: four minutes. This is a
presenter script, not a claim that every step has been rehearsed. Same-source
charger software acceptance is delivered and the snapshot-link P2 passed master
regressions. Gemini fixes passed focused review; combined-source and Srijan's
Windows acceptance remain pending. Yash's offline comparison is complete but
does not verify physical mapping; every candidate retains a shoulder-limit conflict.
Sponsor/deployment work is deferred.

## Updated robotics account — October 25, 2026

Kamino connects simulation with physical robotics. We used the SO-101 leader arm to record an initial joint trajectory, brought that motion into MuJoCo, and previewed and adjusted it for the charger demonstration. We then exported the joint motion and executed it on the physical SO-101 follower arm, iterating between simulation and hardware to account for real-world differences. The prototype demonstrates corresponding, working motions side by side, powered by our software. Precise calibration and contact-rich manipulation remain ongoing work.

This clarification supersedes earlier descriptions of the overall demonstration as observation playback alone. Older artifact-specific results below remain historical. See [the robotics demonstration](ROBOTICS_DEMO.md).

## Choose the route before presenting

Use the main route only after the corresponding items in
[the evidence checklist](DEMO_EVIDENCE_CHECKLIST.md) pass on the selected build.
Do not discover whether a feature works during the presentation.

- **Main route:** matching charger photos → cached reconstruction → reviewed
  reference/shape → corrected export → guided SO101 → simulation-to-follower trajectory transfer.
- **If the hardware demonstration is unavailable during presentation:** show the
  recorded simulation and follower-arm executions side by side, label them as
  recordings, and explain the leader → simulation adjustment → export → follower
  workflow. Precise calibration remains ongoing.
- **Without the accepted sizing fix:** show the older cleaned charger as a
  historical photo-derived pipeline example with estimated dimensions, then use
  the synthetic hinged panel to demonstrate the already recorded correction loop.
  Do not present that charger as the new uniform-scaling result.
- **Without a working server/internet:** use retained screenshots, reports and
  portable bundles. Introduce them as recorded results. Do not present playback
  as a new live reconstruction or provider call.

## Main four-minute route

| Time | Presenter says | Operator shows |
| --- | --- | --- |
| 0:00–0:25 | “Kamino helps turn a real object into an editable simulation asset. It combines reconstruction, review of physical assumptions, and portable simulator export.” | Real charger beside its matching source photos. |
| 0:25–0:55 | “These photos produced this mesh through Meshy. We have loaded the saved reconstruction so we can focus on reviewing and improving it.” | Matching source GLB in the app; show source provenance. Keep reconstruction latency outside the live sequence. |
| 0:55–1:35 | “Geometry needs both a shape and a scale. Here we identify the housing thickness and use one reference length, preserving the mesh's proportions. This online reference is approximate; it wasn't measured on our specimen.” | Reviewed orientation and thickness correspondence; reference and source; before/after sizing preview. Only use accepted sizing controls. |
| 1:35–2:05 | “We can correct a completed asset and generate another export from the same reconstruction. Earlier results remain available.” | Explicit save/regenerate, old/new attempts and unchanged source identity. Use a rehearsed short process or identify a previously generated result if latency is too long. |
| 2:05–2:35 | “The bundle includes geometry, physical assumptions and validation results. This check shows the scene runs and survives relocation. The collision box and estimated properties remain visible.” | New validation result, authenticated ZIP download, and the exact exported scene in MuJoCo. Switch visual/collision views if rehearsed. |
| 2:35–3:10 | “The same preparation workflow supports articulated models. For this SO101 example, we use CAD components and a reviewed joint template.” | Generated SO101 saved job, link/joint structure, reviewed assumptions and simulated movement. Label CAD/template assistance. |
| 3:10–3:45 | “We recorded an initial joint trajectory with the leader arm, previewed and adjusted it in MuJoCo for the charger, then exported the motion and executed it on the follower arm. We iterated between simulation and hardware. These corresponding motions demonstrate trajectory transfer; precise calibration and contact-rich manipulation remain ongoing work.” | Show the corresponding simulation and physical follower-arm executions side by side. Identify recorded footage as recorded; describe the leader as the initial motion source and the follower as executing the exported motion. |
| 3:45–4:00 | “The result is a model you can inspect, revise and export, with its sources and assumptions retained. Our working examples cover a photo-derived rigid object and guided articulated mechanisms.” | Final output bundle and one clear limitation/next measurement. |

Optional Gemini insert, only if it helps and fits within the review segment:
“Gemini proposes properties for review. The model and uncertainty are recorded;
suggestions stay estimates until supported by evidence.” Use a cached result if
needed and label it cached. Only show fallback as demonstrated if its gate passes.

## Concrete correction story

For Atul's job `6227f66e-e78f-4a31-8d85-3fb195f2a735`, the baseline applied
relative axis scaling 3.424:1:6.327. Its numerical simulation passed despite
distorted proportions. Once fixed, show the same original GLB, the reviewed
single reference, preserved proportions, and a new export with the old ZIP
unchanged. Explain this as a corrected sizing workflow; do not claim uniform
scaling fixes errors already present in the reconstruction.

Fallback correction: follow the [hinged-panel guide](../examples/assemblies/hinged-panel/README.md).
The retained synthetic example has a failed low-gain revision and a corrected
revision using the same validation threshold. Say: “This synthetic fixture shows
how an explicit model parameter correction can be saved, regenerated and checked.”
It is not evidence of improved physical robot accuracy.

## Operator preparation

1. Select an accepted source revision, record any local patch, runtime versions,
   model configuration and exact demo artifacts. Coordinate with the implementing
   chat; the shared checkout is changing. Rehearse in an isolated data directory
   and agreed ports, not a teammate's running job store.
2. Use [DEMO.md](DEMO.md) for assembly-only local startup. Its launcher uses mock
   reconstruction; it cannot establish a new real-photo reconstruction. For the
   charger use the accepted cached real job and the implementer's supported
   startup/import procedure. Do not edit SQLite to fabricate a completed job.
3. Prepare the relevant pages, native viewer and fallback evidence before the
   timer starts. Enter the private application token through API access; keep
   credential/configuration windows out of the recording.
4. Pre-generate and hash the final portable ZIP. Rehearse download/extraction into
   a fresh directory. Use the version recorded in its requirements/report.
5. Record an uninterrupted dry run on the accepted build. Capture actual elapsed
   time separately from any edited video. Do not claim quantified time savings
   without a measured comparison.

## Existing evidence and fallback assets

- Historical cleaned charger: [API archive](../examples/simulation/apple-20w-charger-cleaned/api-acceptance/simulation.zip)
  and [backend acceptance](../examples/simulation/apple-20w-charger-cleaned/api-acceptance/README.md).
  Its job is `14ec98fd-cda0-4b0c-915f-a70e0805dc66`, different from Atul's current
  distorted job. It still uses independently fitted estimated dimensions.
- Existing charger browser screenshots: [completed](../frontend/evidence/completion/cached-charger-completed.png)
  and [orbit](../frontend/evidence/completion/cached-charger-orbit.png). Verify their
  job/artifact identity before combining them with another bundle in a demo.
- Synthetic correction: [failure](../examples/assemblies/hinged-panel/evidence/browser-failure.png),
  [completion](../examples/assemblies/hinged-panel/evidence/browser-completed.png),
  [portable ZIP](../examples/assemblies/hinged-panel/simulation.zip).
- Generated SO101: [workflow](../examples/assemblies/so101-guided/api-workflow/README.md),
  [portable ZIP](../examples/assemblies/so101-guided/api-workflow/simulation.zip),
  [simulated replay](../examples/assemblies/so101-guided/api-workflow/motion-demo/replay.gif).
  The older bundle is not a mapped-observation-replay bundle. Its recorded
  free-space mounting assumption is not the physical mount.
- Portable observation replay: [guide](../examples/assemblies/observation-replay/README.md)
  and [ZIP](../examples/assemblies/observation-replay/browser-export.zip). This is
  a synthetic hinge timeline, not Yash's moving-arm capture.

## Answers to likely questions

**Does it work from photos alone?** The charger geometry is photo-derived.
The articulated SO101 uses CAD and a joint template; automatic photo part/joint
inference is not part of the demonstrated workflow.

**How accurate is it?** Report only the accepted measurements for the shown
artifact. Numerical loading/settling, preservation of mesh proportions, physical
pose agreement and dynamics prediction are separate evaluations.

**What does AI contribute?** Meshy reconstructs geometry; Gemini proposes
reviewable properties. Kamino prepares, retains revisions, exports and checks
the model. MuJoCo supplies the simulator.

**What is approximate?** Online size references, unmeasured mass/friction,
collision/inertia approximations, and unverified robot mounting/calibration.
Show the assumptions relevant to the current example.
