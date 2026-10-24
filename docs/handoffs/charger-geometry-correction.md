# Charger geometry correction

## What is established

Srijan's `561a36f` geometry review and Yash's `fb6f860` native viewer report independently flag the pin/dimension mismatch: pins extend along the current Y axis, while the estimated 58 mm Z extent was described as including the pins.

Johaan's computer compared the original source photos with Srijan's orthographic views. The broad slab in the raw mesh represents the iPad/case beneath the charger. It is background geometry included by reconstruction. Preparation faithfully scaled the wrong combined object; a rotation alone cannot fix it.

The original bundle remains useful as a labelled pipeline/physics smoke test. It is not accepted as an accurate charger asset. Keep its raw mesh, ZIP and reports intact.

## Ordered correction

1. Give Srijan the four source photos. A private, ignored transfer archive is prepared on Johaan's laptop at `outputs/geometry-review/charger-source-photos.zip`; it includes the approved 1024-pixel JPEG copies, hashes and estimated properties. It has not been sent or published automatically.
2. Produce charger-only reconstruction inputs using documented crops/masks, or preferably capture four clearer views on a plain contrasting background with the charger filling most of the frame. Include the USB-C side and the pin side; current views omit important surfaces. Preserve originals and record preprocessing.
3. Generate a replacement reconstruction only after inspecting those inputs. Inspect the raw result for the full charger body and pins and verify that the support is absent **before** fitting dimensions. Do not silently crop the 3D slab away: it may be connected to or occlude the reconstructed charger body.
4. Srijan records an explicit proper rigid rotation and axis-to-physical-dimension mapping. A +90-degree X rotation is a candidate for mapping raw +Y pins to +Z, not a universal fix. Reconcile width, thickness and pin-to-back length with the selected model. Preserve estimated provenance unless measurements are actually supplied.
5. Johaan runs the replacement through preparation/export/validation. Review per-axis scale factors; do not use independent fitting to disguise a wrong shape or axis assignment.
6. Yash inspects body, pins, orientation and collision separately in the native viewer and reruns the drop/portability checks. Accept the object only after visual review as well as numerical validation.

## Work division

- **Johaan:** transfer source-photo archive, coordinate replacement input/reconstruction, integrate the accepted derivative.
- **Srijan:** input isolation, geometry comparison, explicit alignment/dimension association and documented changes.
- **Yash:** native visual/collision acceptance and final numerical checks of the replacement bundle.
- **Atul:** continue frontend integration independently; a completed physics smoke test must not be presented as a fidelity guarantee.
