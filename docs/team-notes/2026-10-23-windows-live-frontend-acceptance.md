# Windows live frontend acceptance — Yash

Branch: `codex/windows-simulation-setup`. Integration tested:
`93e5aec87f4f8236abc57cd572092f174ed7cbe4`. Feature-branch merge retained the charger geometry
correction warning and previous Windows evidence. Main/camera/LeRobot work unchanged.
Final chat handoff contains the full finding commit and push status.

Actual browser live-mode upload → estimated properties → real mock-provider preparation/MuJoCo
validation → authenticated browser ZIP download completed. The download's hash matches the
backend bundle. Its extracted scene passes Windows validation and additional relocation, and was
inspected in the native viewer. Synthetic and property provenance labels survive end to end;
40/50/60 mm and 80 g become 0.04/0.05/0.06 m and 0.08 kg; unknown friction remains null.
No API/provider secret is committed. Loopback-only servers used fresh local data and a private
temporary token. The protected ZIP returns 401 without authentication. No real Meshy job ran.

See [portable evidence and exact commands](../../examples/simulation/frontend-live-windows/README.md).
The actual browser ZIP, completed job, validation report, frontend screenshot and native viewer
screenshot/report are pushed; local path text alone is not relied upon for transfer.

Versions: Node 24.22.1 / pnpm 11.25.0 / Vite 7.3.7 / TypeScript 5.9.3 / Vitest 3.2.7;
Python 3.12.10 / MuJoCo 3.17.0 / NumPy 2.5.4 / trimesh 5.2.0.
Headless: 3 simulated s, timestep 0.0001 s, peak penetration 0.451507 mm, settled, no warnings;
0.925 s original physics loop / 1.803 s total validation including relocation.
Native viewer: 26.292 wall s / 24.983 simulated s, zero warnings, clean close.
Frontend 11 tests and production build pass. Python 173 passed / 3 skipped (two Windows symlink
privilege skips and optional uagents_core absent); one upstream Starlette/httpx deprecation warning.
Ruff and pip check pass. No application code, physics settings or thresholds changed for acceptance.

Next for Johaan: the live synthetic browser-download path has Windows acceptance evidence.
Keep final charger acceptance pending corrected geometry; deliver the replacement ZIP, preview/source
reference, explicit axis/dimension note and validation report for separate Windows inspection.
Fetch/ASI:One and remote deployment are separate work, not certified by this local test.
