# Correct, revise, and re-export a generic assembly

This acceptance uses the synthetic two-link fixture, the real application API,
and real MuJoCo processing. It does not depend on SO101 calibration, a reconstruction
provider, or hardware. The input geometry stays unchanged throughout.

## Demonstrated loop

1. Import `input-weak-drive.json` with `meshes/base.obj` and `meshes/arm.obj` from
   `../two-link-hinge/input/`. These are explicitly synthetic inputs.
2. Process revision 1. Its deliberately weak position gain (0.000001 Nm/rad)
   generates an export but fails motion tracking: maximum error is about 0.4 rad,
   above the unchanged 0.03 rad threshold. The export and report remain available.
3. Correct the hinge gain to 5 Nm/rad, limits to [-0.6, 0.6] rad, arm pivot Z to
   0.32 m, and arm mass to 0.12 kg. Keep the physical-property sources estimated
   and friction unknown. The complete corrected input is `corrected-project.json`.
4. Acknowledge the revised links/joint, save revision 2, and process again.
   The updated export passes both original and relocated motion checks.
5. Download/extract its ZIP outside the job folder and validate again. This also
   passes, including another relocation. Revision 1's failed report remains
   byte-for-byte unchanged and both attempts remain accessible.

The exported record was checked for the new limits, 0.07 m relative joint offset,
and 0.12 kg estimated arm mass. The source hashes/part poses, synthetic label and
unknown friction were preserved. Requests using the old revision return 409.
Pivot editing changes a joint frame; it is not a whole-scene placement control.

## Evidence and reproduction

- `acceptance.json`: attempt history, archive hash and verified export values.
- `failed-validation.json`: actual failed weak-drive simulation.
- `corrected-validation.json`: corrected original and relocated checks.
- `download-validation.json`: checks on the extracted downloaded archive.
- `browser-history.png`: authenticated browser opened revision 2 and visibly
  showed both the retained failure and successful corrected attempt.

The processing/edit loop was executed through FastAPI TestClient, not browser
clicks. Browser inspection separately confirmed the retained attempts, new
provenance/friction controls and disabled completed-job processing button.
Frontend DOM tests exercise provenance editing and unknown-friction preservation.

Reproduce the real correction regression from the repository root:

```sh
python -m pytest -q tests/test_assembly_jobs_api.py::test_real_motion_failure_corrected_revision_preserves_history
```

For a live presentation, follow steps 1–5 in `/assembly.html`, downloading the
failed report before correction and the successful ZIP afterward. Explain that
this demonstrates editable engineering assumptions and repeatable exports;
passing these motion checks does not certify real-world dynamics.

Runtime: Python 3.13.7, MuJoCo 3.3.7, NumPy 2.5.4 on Intel macOS. Windows native
acceptance of this particular corrected two-link run has not been performed.

Verification: 309 Python tests passed, 2 optional skips; 43 frontend tests passed;
TypeScript/production build, scoped Ruff and diff checks passed. Existing warnings:
Starlette/httpx deprecation and the shared Three.js bundle size. Temporary local
acceptance servers were stopped after inspection.
