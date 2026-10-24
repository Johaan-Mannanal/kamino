# Generated SO101 scripted simulation replay

Eight simulated seconds: shoulder pan +0.45 rad, then -0.45 rad; shoulder lift
-0.35 rad; return to zero targets. Each phase lasts two seconds; all unspecified
motion axes are explicitly commanded to zero in actions.json. These are simulator
inputs only. Do not send them to the physical arm; hardware mapping is unverified.

Uses the parent collision-revision/bundle.zip unchanged. The export is generated
from CAD/template-assisted grouping, with convex collision and adjacent-body
exclusions. Root height 0.15 m is an assumed free-space scene setup. There is no
physical support stand in this scene: the root is fixed to world. Inertia, drive
parameters and mounting remain assumptions; omitted servo/fastener/camera geometry
is unchanged. This does not demonstrate photo-only robot reconstruction or real
arm accuracy. Neither Yash's unpaired take nor a guessed hardware mapping is used.

## Results
MuJoCo 3.3.7 on Mac. All four phase endpoints pass the unchanged 0.03 rad tolerance;
maximum final error is 0.000500117 rad. No MuJoCo/Python warnings. Maximum joint-limit excursion was
0 rad, within the 0.03 rad acceptance tolerance. trace.json records actual mj_step positions and named control targets;
this is actuator-driven motion, not pose teleportation. preflight.json contains
the existing full assembly motion/model checks. A synthetic regression separately
verifies exact deterministic traces across fresh runs.

replay.gif is offscreen graphics evidence, not native Windows viewer acceptance.
Its timing is approximate; JSON timestamps are authoritative. The GIF loops the
recorded sequence from the initial simulation state. contact-sheet.jpg samples
four frames for quick inspection. Camera reframing produced an identical trace.
files.sha256.json records hashes of the saved evidence files.

## Reproduce
Extract the parent bundle.zip into a new directory, install existing simulation
extras, then from repo root (replace NEW with the extracted directory):

```sh
python -m photo2sim.assemblies.motion NEW/scene.xml examples/assemblies/so101-guided/collision-revision/demo-actions.json --output-dir outputs/assemblies/new-motion --render
```

Omit --render for headless numeric checks. A new output directory is mandatory.
Graphics access is required for GIFs; the first sandboxed Mac render failed with
invalid CoreGraphics connection and retained its failure report locally. The
successful run used graphics access; no simulator settings were changed.

Recorder/export tests: 40 passed. After final camera-only adjustment, the 10
recorder tests passed again. Lint/format checks and independent code review passed;
reviewer did not independently inspect graphics. Parent chat inspected these four
frames. Failed endpoints/renderer errors retain reports; targets are never clipped.
