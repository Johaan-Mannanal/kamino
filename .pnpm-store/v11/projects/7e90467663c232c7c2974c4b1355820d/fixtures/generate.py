"""Regenerate small synthetic browser-test fixtures (requires Pillow)."""

from pathlib import Path
from zipfile import ZipFile

from PIL import Image

root = Path(__file__).resolve().parent.parent
Image.new("RGB", (16, 16), (150, 150, 150)).save(root / "fixtures/synthetic-test.png")
target = root / "public/mock/simulation.zip"
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, "w") as archive:
    archive.writestr(
        "scene.xml",
        "<!-- Synthetic UI fixture; not validated -->\n"
        '<mujoco model="synthetic_ui_fixture"><worldbody>'
        '<geom type="box" size="0.02 0.025 0.03"/>'
        "</worldbody></mujoco>\n",
    )
    archive.writestr(
        "README.txt", "SYNTHETIC UI FIXTURE. No reconstruction or validation was run.\n"
    )
