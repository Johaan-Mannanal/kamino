# Real charger Windows findings — Yash

Feature branch: `codex/windows-simulation-setup`. Safely fetched/fast-forwarded backend commit
`43ad99e`; main unchanged. Full finding commit and push status are in the final chat handoff.

Read [Windows findings](../../examples/simulation/apple-20w-charger/WINDOWS.md) for exact commands,
versions, numerical results, native screenshots, short labelled rendered demo and remaining concerns.
The original ZIP/source mesh were not changed; extracted payload hashes match the ZIP.
Python 3.12.10 / MuJoCo 3.17.0 / trimesh 5.2.0 / NumPy 2.5.4. Original and relocated headless
runs pass unchanged thresholds: 3 s, 0.0001 s timestep, peak penetration 0.451507 mm, no warnings;
total wall time 4.490 s including loading and relocation. Native appearance, body axes, side profile
and collision proxy were inspected separately; screenshots and separate viewer telemetry are pushed.

Important issue: pins protrude along horizontal Y while the estimated 58 mm Z extent was described
as including pin allowance. Raw axes were preserved and nonuniform scaling spread was 34.9%.
Confirm intended pose/dimension mapping and measurements before claiming physical fidelity.
The collision is one full box, including empty pin space, not pin-specific contact geometry.
No numeric threshold, contact parameter, scene or mesh was changed to pass a check.
No physical robot/camera operations or new provider job were needed.

Helpers gained reproducible inspection camera/axis options and an offscreen GIF replay command;
no shared contracts or backend interfaces changed. Full local versions are updated only in the
scoped Windows environment snapshot. Next: Johaan/Yash confirm properties and axes, Srijan corrects
preparation as needed, then re-export/revalidate; coordinate richer collisions if pin contacts matter.

Final repository checks on Windows: 156 passed, 2 skipped in 22.32 s; skips require unavailable
Windows symlink privileges. One upstream Starlette/httpx deprecation warning. Ruff lint/format,
package dependency check, offscreen demo and all native viewer runs pass. These test-suite results
are separate from the unchanged charger headless physics report.
