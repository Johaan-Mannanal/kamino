"""Regenerate the SYNTHETIC box fixtures in this directory.

Run: .venv-sim\\Scripts\\python.exe examples/assets/generate_fixtures.py
"""

from pathlib import Path

import trimesh

HERE = Path(__file__).resolve().parent


def main() -> None:
    # Arbitrary units and an off-origin centre so preparation has to centre and scale it.
    box = trimesh.creation.box(extents=[2.0, 3.0, 4.0])
    box.apply_translation([19.0, -7.0, 31.0])
    (HERE / "synthetic_box.obj").write_text(box.export(file_type="obj").rstrip() + "\n")
    box.export(HERE / "synthetic_box.glb")


if __name__ == "__main__":
    main()
