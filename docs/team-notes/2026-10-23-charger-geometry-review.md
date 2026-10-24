# Charger geometry review and Johaan handoff

- Author: Srijan / Codex
- Date: 2026-10-23 (America/Los_Angeles)
- Branch: `codex/asset-preparation`
- Backend reviewed: `43ad99e` (fetched from `origin/codex/backend-pipeline`).
- Full backend SHA: `43ad99e39af260086405633e9ba9833d079fdd9e`.
- Merge commit: `e2a0d01753d59a2942465ed87cabdf6d775c926a`, no conflicts;
  existing feature work preserved. Production preparation, properties, source GLB,
  AssetRecord and simulation ZIP remain unchanged by this review.

## Confirmed / tested

**An axis/dimension semantic correction is needed, but a blind axis swap is not
an adequate geometry fix.** The pin extension follows raw +Y and prepared +Y.
The estimate says Z=58 mm includes pins, yet the current Y extent including pins
is 27 mm. The 58 mm value instead stretches the broad X/Z face. This follows the
existing documented API assumption (caller supplies an already aligned mesh);
it is a mismatch between this input and its property-axis meaning, not an
unrecorded rotation performed by `prepare_asset`.

[Orthographic evidence](../../examples/simulation/apple-20w-charger/review/orthographic-review.png)
shows raw and prepared XY, XZ and ZY point projections. Raw extents are
`[1.8998118043, 1.0147441030, 1.8998001218]` provider units. The prepared mesh is
centred and has exact full extents `[0.043, 0.027, 0.058]` metres. All 131,480
vertices correspond, face indices are identical, and the maximum vertex error
from the documented centring/per-axis scaling is `5.21e-18 m`. Thus preparation
faithfully transformed the supplied reconstruction; it did not introduce the
broad slab or change topology.

The raw reconstruction has a nearly square X/Z slab, with a much narrower
central rise and two pins above it along +Y. Raw-Y slices near the slab span
about `1.900 x 1.900` in X/Z; intermediate slices span `0.777 x 0.610`; near the
pin tips they span `0.295 x 0.131`. These descriptive slices are not a segmentation.
The slab may be reconstructed surroundings or a hallucinated shape, but that
cannot be determined without the source photos. No automatic cropping or repair
is justified by this audit alone.

Scale spread means `100 * (max(scale) / min(scale) - 1)`, not a percentage error
against a photograph or measured object. Exhaustively checking all axis
permutations gives the following diagnostic; signs do not change AABB extents.
An odd permutation also needs a sign flip to become a proper rigid rotation.

| Source axes assigned to output X/Y/Z | Scale-factor spread |
| --- | ---: |
| XYZ (current) | 34.8846% |
| XZY (pins become Z) | 302.1755% |
| YXZ | 198.1664% |
| YZX | 198.1646% |
| ZXY (pins become Z) | 302.1780% |
| ZYX | 34.8829% |

The almost equal source X/Z extents mean swapping them barely changes spread.
Mapping the observed pin direction to Z makes the physical meaning more
consistent but exposes much worse disagreement with the assumed dimensions.
Minimizing the spread would select the wrong pin direction. A uniform scale
cannot simultaneously fit all three requested dimensions with any axis swap.
This is evidence to revisit reconstruction and property-axis association together.

The raw hash matches the existing inspection record:
`08e476d661aacc171fdca806743b022ecee0259334452ea1d38e6b66fdfc868c`.
ZIP SHA-256:
`7965d7bbccaa11ab682ba5b5a95195a07a79525ed91db155dc6c6d655c7c4777`.
The [machine-readable audit](../../examples/simulation/apple-20w-charger/review/geometry-review.json)
records all factors, slices and comparisons.

Windows headless validation of the unchanged ZIP passed original and relocated
checks: 30,000 steps / 3 simulated seconds each, max penetration 0.4515073 mm,
no simulator warnings, and all settling/contact/resting-height checks passed.
See [Windows report](../../examples/simulation/apple-20w-charger/review/windows-validation.json).
Actual runtime: Python 3.12.10, MuJoCo 3.17.0, NumPy 2.5.4, trimesh 5.2.0,
Pillow 13.0.0. This checks the centred box-proxy scene, not real charger fidelity.
No native viewer inspection is claimed.

Merged full suite: **156 passed, 2 skipped, 1 warning in 43.26s** on Windows.
Both skips are existing tests requiring OS symlink permission. The warning is
the existing Starlette/httpx deprecation. Ruff check passed; all 66 Python files
satisfy formatting. The merged backend's required python-dotenv 1.2.4 was
installed in the existing venv; no dependency declarations were changed.

Commands from the repository root:

```powershell
git fetch origin codex/backend-pipeline
git merge --no-edit origin/codex/backend-pipeline
.\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
.\.venv-sim\Scripts\python.exe examples/simulation/apple-20w-charger/review_geometry.py --output examples/simulation/apple-20w-charger/review
Expand-Archive -Path examples/simulation/apple-20w-charger/simulation.zip -DestinationPath outputs/charger-review/bundle
.\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate outputs/charger-review/bundle/scene.xml --report outputs/charger-review/windows-validation.json
.\.venv-sim\Scripts\python.exe -m pytest -q --basetemp=outputs/pytest-merged-charger-review
.\.venv-sim\Scripts\python.exe -m ruff check .
.\.venv-sim\Scripts\python.exe -m ruff format --check .
```

## Proposed

Keep `prepare_asset` behavior unchanged for this review. Do not silently infer
orientation from bbox lengths, PCA, provider up-axis conventions, or the smallest
scale spread. A specimen-specific right-handed rotation can be recorded on a
new derivative input once the true object is identified; e.g. +90 degrees about
X maps raw +Y to output +Z, raw +Z to output -Y and preserves raw X. This is only
a candidate frame conversion, not an approved correction of this reconstruction.
Its width/thickness mapping and sign still need photo confirmation.

If the large slab is absent from the photos, reconstruct or deliberately segment
the intended object before applying confirmed-axis dimensions. Preserve the raw
GLB and record any derivative transform/crop and its provenance. Confirm which
physical face corresponds to each axis, overall pin-to-back length and the 16 mm
pin allowance. Keep dimensions/mass `estimated` until evidence changes their source.
After alignment and property reconciliation, rerun preparation, export, numerical
validation, and native viewer review; compare body and pin proportions separately.

## Questions / blockers

**Source-photo comparison is incomplete.** The reconstruction README explicitly
excludes the four original photos from Git; `data/captures/object-01/` does not
exist here. No photo was supplied in this chat. An asynchronous request for a
photo location and Johaan coordination destination was sent while the geometry
review continued. The static mesh preview cannot substitute for source images.
This blocks identifying the slab and approving the final orientation/dimensions.
No new Meshy request or credits were used.

## Next action / handoff

Johaan's computer needs the findings, image and Windows validation report on this
branch; merge `origin/codex/asset-preparation` into the backend branch without
replacing existing work. The current bundle remains a pipeline smoke-test example.
Do not use its completed/validated state as evidence of correct charger shape.

On Johaan's computer, open the four local source photos alongside the committed
orthographic image, identify the slab, mark the actual charger body and pin
extension, and confirm the intended X/Y/Z frame. Share those images through an
authorized location (they need not be committed). Then coordinate an explicit
rigid alignment and dimension mapping or replace the malformed reconstruction.
Yash can inspect the existing box proxy in the native viewer independently;
collision still fills all space between the pins and over the slab.
