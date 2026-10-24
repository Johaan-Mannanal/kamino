# Cleaned charger Windows findings — Yash

Merged backend `e2e8ce8ba4e99b897817952225555ccde4556658` into the existing simulation feature
branch, preserving prior fixtures/photos/camera work. Main unchanged. Final chat gives full finding SHA.
No new Meshy request, motor command, model edit or threshold/contact tuning was performed.

Result: **pass for visual and coarse-box dynamics smoke/demo scope**. Native viewer shows plausible
rounded charger body, two upward +Z pins and no old surrounding slab. USB-C underside feature is
present, but fine depth/shape remains approximate. Collision separately inspected: one full solid
bounding box, not individual pins or port contacts. Dimensions/mass remain estimates.

Python 3.12.10 / MuJoCo 3.17.0 / trimesh 5.2.0 / NumPy 2.5.4. Headless original+relocated pass:
3 simulated s, 0.0001 s timestep, peak penetration 0.451507 mm, settled, zero warnings.
Original physics-loop wall 1.128 s; overall validation with relocation 3.338 s. Native screenshots
and three separate viewer telemetry files are pushed. A labelled 9.4 s offscreen rendered demo
shows two drops, each 0.999 simulated s, with an explicit verified reset between them.

[Full findings, evidence and exact commands](../../examples/simulation/apple-20w-charger-cleaned/WINDOWS.md).
The incoming ZIP/payload remain unchanged. Helpers gained render-only floor hiding and repeat/reset
recording options. Ruff/pip checks pass; Python suite 173 passed / 3 skipped (two Windows symlink
privilege tests; optional uagents_core absent), one upstream Starlette/httpx deprecation warning.

Next for Johaan: accept this candidate for the labelled coarse-box demo; carry its explicit +90deg X
orientation and property-axis mapping into persistent job processing. The original job is still
awaiting_properties; this manually exported candidate does not prove end-to-end job completion.
Keep estimates, uniform-box inertia, approximate port detail and single-box collision limitations
visible. Real-world physical accuracy and pin insertion/manipulation remain unverified.
