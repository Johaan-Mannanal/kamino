# Operator measurement/reference clarification — 2026-10-24

The intended measurement reference is the BLUE-HIGHLIGHTED CAD FACE in
`cad-reference-face.png`, supplied by Yash. The image is preserved unchanged.
The temporary measuring aid is removed and is **not part of the robot, hardware
modifications or simulation model**. No further identification of that aid is
needed. The physical base clamp shown in earlier photos is a separate item.

Reported height: **2.97 inches = approximately 75.4 mm**, intended as tabletop to
the indicated face, using the temporary aid. The original 77.8 mm report and the
clarified bottom-edge reading remain recorded as measurement history in
measurements.json. Neither decimal precision nor a known measurement uncertainty
is claimed. Exact aid-to-face transfer offset was not recorded, so this is a coarse
operator measurement, not independently verified metrology.

The selected planar face is on a rounded printed part with mounting holes next
to an upright structure. The operator's CAD screenshot identifies the intended
face visually; its precise STEP body/face identifier and model coordinates have
not yet been established. Johaan can now match that face in CAD and account for
its offset from the model origin. **75.4 mm is not automatically root Z**, and the
0.15 m simulation test placement remains an explicit assumption. No simulator or
hardware parameters were changed.

## Camera and pose provenance

Both original take-3 photographs used the REAR camera and are explicitly confirmed
by the operator to have NO left-right flip. Front-facing image is portrait;
left-side image is landscape. This confirms reported image history, not calibrated
camera intrinsics/extrinsics or joint signs/zeros. Original images are unchanged.

The original take-3 observation/photo pairing remains operator-confirmed stationary
association, not synchronization. These later measurement photographs and CAD
screenshot do not replace that pair. The operator temporarily moved the shoulder
manually to measure the gap; whether it returned exactly is unknown. No agent
motor command or fresh hardware reading was performed.

Reported jaw gap: approximately **3.18 mm (1/8 inch)** between closest opposing
inner gripping faces. The operator is **not sure** whether the jaws themselves
stayed unchanged. Keep this as a later unpaired measurement; do not fit it to
take-3 normalized gripper=0.95497954 or use it to select a conversion candidate.
No jaw-gap measurement photo or uncertainty was supplied.

## Evidence and remaining work

measurements.json holds original image hashes, camera/endpoint clarifications,
raw reported values, measurement history and the selected-face reference.
base-reference-overview.png and base-tape-reading.png preserve the measurement
context; cad-reference-face.png identifies the face to map in CAD. The removed
aid must not become geometry, a permanent mounting change or an independent robot
reference body in the model.

Still unresolved: face-to-model coordinate correspondence, full base/table
translation/orientation, camera mounting/extrinsics, joint signs/zeros and gripper
conversion. A single approximate face height does not establish these. No new
capture, trajectory, calibration or model target is requested here.
