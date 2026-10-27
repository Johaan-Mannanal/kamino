# Rigid object sizing and correction

Use the photo workflow with a live backend and its simulation dependencies.
No new reconstruction is needed to change the sizing of an existing job.

1. Open the saved job; review the original mesh and labeled XYZ axes. Save the
   intended rotation first. Rotation follows fixed X, then Y, then Z.
2. Compare the source photos with the **entire reconstruction**. The current
   hosted Workspace includes every reconstructed surface and has no island-selection
   panel. Distractors, fused objects and unfaithful shape remain in the export;
   uniform sizing cannot repair them. Selected-target review remains available
   through the API for compatible clients (see below).
3. The hosted Workspace uses **uniform sizing**. Select the corresponding **full
   mesh extent**, enter one length in millimetres or metres, record its source,
   and describe exactly what it includes. Confirm the correspondence explicitly.
4. A body-only measurement cannot be assigned to an extent that also includes
   pins. Choose an axis whose complete extent represents the actual measured
   span, or obtain a matching full-object measurement. Arbitrary endpoints and
   automatic product identification are outside this version.
5. **Preview resulting dimensions**. Inspect the rotated mesh, oriented raw
   extents, uniform scalar and resulting XYZ full dimensions. These dimensions
   are derived from the reconstruction, not three independent measurements.
6. Enter/review mass and friction; unknown friction may remain blank. **Save
   properties**, then **Generate simulation**. Save/reopen retains the reference,
   units, source, correspondence, orientation, scale and resulting dimensions.

The reference controls start blank for a new job. Applying Gemini suggestions
does not select a physical reference or prove its correspondence to the mesh.
All reference descriptions remain user-supplied evidence, not automatic
verification of geometry or physical accuracy.

## Advanced stretching and old jobs

The API retains `independent_axes` sizing with explicit distortion acknowledgement
and three full dimensions, plus legacy three-axis compatibility where previously
allowed. Those API modes can distort proportions. The current hosted Workspace
edits uniform sizing only: it identifies saved stretched/legacy properties and
requires a reviewed full-extent reference before replacing them with whole-source
uniform sizing. Existing ZIPs remain accessible; old geometry is not rewritten.
Once a legacy job chooses explicit sizing, it cannot drop that metadata to return
silently to legacy stretching.

## Correcting a completed result

A completed job retains editable sizing/orientation controls. Save a correction,
then explicitly regenerate. The original reconstruction and provider task stay
the same. A changed orientation invalidates the old reference review; save sizing
again against the new orientation before processing. Source or surface-selection
changes also invalidate correspondence. Review approval is user judgement, not a
verified physical shape or measurement.

**Prior processing attempts** exposes earlier ZIPs, numerical reports and available
input snapshots. Each new attempt retains its properties, orientation, sizing
result, target review/selection, reconstruction path/hash and input revision in `inputs.json`. Older ZIPs
and source geometry are not rewritten. A failed regeneration retains its
diagnostics and the earlier successful download. Busy/conflicting processing
requests return 409 instead of starting another attempt.

Input snapshots are published atomically before the worker validates the source
file. A source that disappears or changes after claim still leaves downloadable
claimed inputs. If the snapshot itself cannot be published, its download pointer
stays null, the failure message says the inputs remain in job history, and the
simulation can be retried after restoring storage. Prior exports remain intact.

## HTTP example (synthetic reference, not a charger measurement)

```json
{
  "geometry_scope": "whole_reconstruction",
  "sizing": {
    "mode": "uniform",
    "reviewed_orientation": {"x_deg": 0, "y_deg": 0, "z_deg": 0},
    "reference": {
      "axis": "y",
      "length": 60,
      "unit": "mm",
      "source": "user_supplied",
      "correspondence": "full_mesh_extent",
      "description": "Full Y span of a synthetic box; assumed test length"
    }
  },
  "orientation": {"x_deg": 0, "y_deg": 0, "z_deg": 0}
}
```

This example matches the current whole-reconstruction workflow. POST it to
`/api/jobs/{id}/sizing-preview`. Save the returned `dimensions_m`,
`source_mesh_sha256` and `geometry_context_sha256` alongside the same
`geometry_scope`, `sizing`, mass and friction to PATCH `/properties`. Orientation
must already be saved on the job. The backend computes uniform dimensions
rather than trusting stale submitted estimates. POST `/process` separately.
Browser clients use signed sessions; scripts may use an application Bearer code.

For the retained selected-target API, use `geometry_scope: "reviewed_target"`
(the API default), GET `/geometry?preview=true`, then PATCH `/geometry-review`
with the source hash, explicit island IDs, saved orientation, note, acknowledgement
and expected input revision. Use that review's `geometry_context_sha256` in the
preview and property save. Multiple islands are allowed; selection starts empty.
Selection/source/orientation changes invalidate correspondence. These controls
are not exposed in the current hosted Workspace.

Numerical validation and geometry review are separate outcomes. Passing box-drop
or relocation checks does not establish proportions, material properties,
collision accuracy, or a calibrated physical match.
