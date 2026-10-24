# Windows simulation bootstrap — Yash

Branch: `codex/windows-simulation-bootstrap`. Full handoff commit is available from `git rev-parse HEAD`
after checkout; the chat handoff records its full SHA and push status.

## Environment and preservation

Created project-local `.venv-sim` using standalone Python 3.12.10, separate from LeRobot.
MuJoCo 3.17.0, trimesh 5.2.0, NumPy 2.5.4; imports and `pip check` pass. Exact installed
dependency snapshot: `tools/simulation/requirements-windows.txt` (11 distributions).
No robot environment/source, calibration, recordings, camera-preview code, or servo settings changed.
The previous uncommitted camera note was preserved and is excluded from this commit.

Fetched and merged `origin/main` at `ad3b04e` into the dedicated branch, preserving the earlier
camera work. The fetched pivot already ignores `.venv-sim` and `outputs/`; no shared dependency
files or backend interfaces changed for this implementation.

## Delivered and checked

- `tools/simulation/`: fixture-specific validator, native viewer helper, dependency pins and commands.
- `examples/simulation/synthetic-box/`: primitive scene, mesh scene, relative-path OBJ, metadata,
  headless report, separate viewer reports, native-window screenshot evidence and usage guide.
- Synthetic convex box only: 80 x 60 x 40 mm; assumed mass 0.2 kg; explicit uniform-cuboid inertia.
  OBJ vertices are mm, XML scale is 0.001, scene lengths are m. Box collision is separate from
  the visual mesh; no reconstruction or real-object physics is claimed.

**Headless:** primitive and mesh each pass 25,000 steps / 5 simulated seconds, original and copied
bundle. Contact at 0.239 s; peak penetration 0.8305 mm (limit 1 mm); final centre z 0.4199998566 m
(expected 0.42 m); final-window generalized speed below 0.001; no MuJoCo/Python warnings.
Mesh is watertight and convex; mass, units and inertia validated. Temporary relocation succeeds.

**Viewer:** native Windows MuJoCo windows inspected separately for primitive, blue visual mesh,
and orange collision proxy; stable box-on-table rendering observed. Screenshots are in the fixture's
`evidence/` folder. All three viewer loops exit cleanly with zero warning counters. Mesh view
ran 60 wall seconds / 57.80 simulated seconds; primitive and collision views closed after inspection.
These visual observations are separate from the deterministic drop/contact checks.

## Commands and limitations

Exact portable PowerShell setup, validation and viewer commands are in `tools/simulation/README.md`.
Each tool resolves its default fixture relative to its own file; exported XML uses only relative assets.
No API credentials, paid jobs, cloud resources, reconstruction models, training, or deployment used.

The initial 2 ms timestep / 10 ms contact time constant produced 5.21 mm transient penetration,
despite settling. Final settings use 0.2 ms / 1 ms and satisfy the unchanged 1 mm acceptance limit.
These contact/friction settings are assumptions. One upright drop does not certify arbitrary
orientations, shapes, materials or real-world accuracy. Sandbox restrictions on venv setup and
temporary-folder cleanup required host execution; final headless, relocation and viewer runs pass.

Next integration: agree on an asset record with measured dimension/mass provenance and explicit
assumptions; pass a mocked Meshy result through scale confirmation, collision construction, and
export using this folder as a fixture. Extend validation for arbitrary assets before accepting
provider-generated geometry. Photo-to-3D generation and a second object remain future work.
