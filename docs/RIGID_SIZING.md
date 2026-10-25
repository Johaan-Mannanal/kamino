# Rigid object sizing and correction

Use the photo workflow with a live backend and its simulation dependencies.
No new reconstruction is needed to change the sizing of an existing job.

1. Open the saved job; review the original mesh and labeled XYZ axes. Save the
   intended rotation first. Rotation follows fixed X, then Y, then Z.
2. Inspect the surface-island preview and source photos. Explicitly select every
   surface belonging to the target (multiple allowed), exclude distractors, record
   the review and save it. A new selection starts empty. Fused or unfaithful
   geometry remains unresolved; selection performs no reconstruction repair.
3. Choose **Uniform: preserve proportions**. Select the corresponding **full
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

**Advanced: stretch each axis** requires a separate acknowledgement and three
full dimensions. It may distort proportions. Existing pre-upgrade jobs without
sizing metadata retain **Legacy three-axis sizing**, so reopening/reprocessing
does not silently change their sizing behavior. New attempts still require explicit
target review and re-bound reference correspondence; existing ZIPs remain accessible. Once a legacy job chooses explicit sizing,
it cannot drop the metadata to silently return to legacy stretching.

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

First GET `/api/jobs/{id}/geometry?preview=true`, save the explicit review via
PATCH `/geometry-review` (source hash, island IDs, saved orientation, note,
acknowledgement and expected input revision), and add its
`geometry_context_sha256` to this example. POST to `/api/jobs/{id}/sizing-preview`. Save the returned `dimensions_m`
alongside the same context hash, `sizing`, mass and friction to PATCH `/properties`.
The backend computes uniform dimensions authoritatively rather than trusting
stale submitted estimates. POST `/process` separately. All routes use the usual
application Bearer token when configured.

Numerical validation and geometry review are separate outcomes. Passing box-drop
or relocation checks does not establish proportions, material properties,
collision accuracy, or a calibrated physical match.
