# Synthetic asset fixtures

**These files are SYNTHETIC test fixtures, not photo reconstructions.** They are
procedurally generated boxes for exercising `photo2sim.assets.prepare_asset`; no
photos or reconstruction provider were involved.

- `synthetic_box.obj` / `synthetic_box.glb`: a 2 x 3 x 4 box (unitless) centred at
  (19, -7, 31), so preparation has to both centre and scale it.
- `generate_fixtures.py`: regenerates both files.

Example:

```python
from pathlib import Path

from photo2sim.assets import prepare_asset
from photo2sim.contracts import AssetProperties

properties = AssetProperties.model_validate(
    {
        "dimensions_m": {"x": 0.05, "y": 0.08, "z": 0.12, "source": "measured"},
        "mass_kg": {"value": 0.3, "source": "user_supplied"},
    }
)
record = prepare_asset(Path("examples/assets/synthetic_box.obj"), Path("out/bundle"), properties)
```

When preparing an asset from a fixture, the caller should set `synthetic=True` on the
resulting record, because preparation cannot tell where a mesh came from.
