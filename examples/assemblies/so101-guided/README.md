# SO101 through guided grouping — CAD/template assisted

**Generated articulated candidate; kinematic consistency passes, dynamic motion
validation fails.** This is not a photo-only reconstruction or a calibrated arm.

The generic STEP importer tessellated 11 nominal structural components from the
supplied assembly. Their hashes, local geometry, CAD placements and 259 omitted
leaf records (including 11 empty shapes) are in `input/inventory.json`. Servo,
fastener and camera geometry is omitted from this first matched subset.

`tools/assemblies/build_so101_review.py` is an example-specific adapter. It maps
those parts to seven links and uses the pinned Menagerie SO101 reference's mesh
placements, group frames, six joint axes/limits and full-link masses. **CAD saved
assembly poses are retained in inventory but are not used for this template
placement.** The reference's full-link masses include hardware absent from the
visual subset. The +50 mm root offset is an assumed display clearance. The
exported actuator model is reduced and does not reproduce all reference motor
parameters. Photos do not supply this candidate's geometry or joints.

Source STEP SHA-256:
`f754be35708382b05ce65768ae33c612f91dca11ad19d14807dc637eb944ba3d`.
Pinned reference revision:
`f3b6013629c7b94f8ee93fd977b161fa8350f9bc`.
Existing source archive: `examples/so101/windows/cad/so101-assembly-reference.zip`.
See the reference's preserved attribution/license in `third_party/robotstudio_so101`.

## Evidence and limitations
- `template-check.json`: three joint configurations compared with the pinned
  reference; maximum body-position error 2.78e-16 m, rotation/axis element error
  below 2.0e-15. This checks conversion consistency against the **same template**,
  not independently measured physical accuracy.
- `motion-validation.json`: original motion trial fails; maximum tracking error
  0.97446 rad. Shoulder pan stays near 0.014 rad when commanded ±0.95993 rad.
  Reset repeatability, joint limits and warning checks pass. Relocation is not
  attempted by the existing validator after the original motion failure.
- `initial-contacts.json`: four base/shoulder box contacts already penetrate
  approximately 19 mm at q=0. This is a concrete collision-proxy problem to
  investigate before claiming dynamic behavior. No thresholds or contacts were
  modified to conceal the failure.
- Single bounding box per link, approximate uniform-cuboid inertia, assumed
  control parameters, unverified hardware signs/zeros/gripper conversion.
- Runtime: Python 3.13.7, MuJoCo 3.3.7, NumPy 2.5.4, trimesh 5.2.0.

## Reproduce from repository root
Install the existing `.[dev,simulation]` extras. Extract `input/meshes.zip` **into
input/**; its entries begin `meshes/`. Keep these files beside both project JSONs.
Extract `bundle.zip` into a new folder to inspect the already generated candidate.
No CAD installation is needed for review, preparation or simulator inspection.

```sh
python -m photo2sim.assemblies package examples/assemblies/so101-guided/input/project.json --output outputs/so101-review.json
# Start frontend (pnpm dev in frontend/) and open /assembly.html.
# Load outputs/so101-review.json, edit/acknowledge and download beside input meshes.
python -m photo2sim.assemblies prepare examples/assemblies/so101-guided/input/engineering-reviewed.json --output-dir outputs/so101-prepared-new
python -m photo2sim.assemblies export outputs/so101-prepared-new/assembly.json --output-dir outputs/so101-bundle-new
# Expected exit 1: motion failure is retained in the bundle's validation.json.
python tools/assemblies/check_so101_template.py outputs/so101-bundle-new/scene.xml --report outputs/so101-template-new.json
```

`project.json` is an unacknowledged proposal. `engineering-reviewed.json` records
agent engineering review of the template mapping and its semantic snapshot;
this does not mean a human confirmed dimensions, dynamics or hardware mapping.
All output paths must be new. Source/old exports remain unchanged.

To reimport STEP, use the optional isolated CAD environment and selection list:

```sh
PYTHONPATH=src CAD_PYTHON -m photo2sim.assemblies.cad SOURCE.step --output-dir outputs/so101-cad-new --names examples/assemblies/so101-guided/cad-selection.json
```

Replace `CAD_PYTHON` with that environment's interpreter. The template adapter's
`--help` describes its inventory/output arguments. Do not run generated joint
commands on hardware: this package contains no verified physical joint mapping.
