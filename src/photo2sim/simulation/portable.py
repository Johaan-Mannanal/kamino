"""Self-contained usage files shared by both simulator exporters."""

import json
import platform
from pathlib import Path

import mujoco
import numpy as np

RUNNER = '''"""Run the adjacent scene.xml with MuJoCo; no Kamino installation needed."""
import argparse
import json
import math
from pathlib import Path
import time

import mujoco
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--seconds", type=float, default=3.0)
    parser.add_argument("--collision", action="store_true", help="Show collision geoms instead of visual meshes")
    parser.add_argument("--both", action="store_true", help="Show visual and collision geoms together")
    args = parser.parse_args()
    if not math.isfinite(args.seconds) or not 0 < args.seconds <= 60:
        parser.error("--seconds must be finite, greater than zero, and at most 60")
    model = mujoco.MjModel.from_xml_path(str(Path(__file__).resolve().parent / "scene.xml"))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    if args.headless:
        finite = True
        for _ in range(math.ceil(args.seconds / model.opt.timestep)):
            mujoco.mj_step(model, data)
            finite = bool(np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all() and np.isfinite(data.qacc).all())
            if not finite:
                break
        warning_count = sum(int(w.number) for w in data.warning)
        print(json.dumps({
            "scope": "standalone zero-control smoke check; not full validation",
            "mujoco": mujoco.__version__, "finite_state": finite,
            "simulated_time_s": float(data.time), "warning_count": warning_count,
        }, allow_nan=False))
        return 0 if finite and warning_count == 0 else 1
    from mujoco import viewer as native_viewer
    with native_viewer.launch_passive(model, data) as viewer:
        viewer.opt.geomgroup[2] = int(not args.collision or args.both)
        viewer.opt.geomgroup[3] = int(args.collision or args.both)
        viewer.opt.flags[mujoco.mjtVisFlag.mjVIS_CONVEXHULL] = int(args.collision or args.both)
        while viewer.is_running():
            start = time.perf_counter()
            mujoco.mj_step(model, data)
            viewer.sync()
            time.sleep(max(0, model.opt.timestep - (time.perf_counter() - start)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''

README = """# Kamino portable MuJoCo export

This folder runs without the Kamino repository. Keep `scene.xml` and its mesh
folders together. All scene lengths are metres, angles radians, masses kilograms.

## Install in a separate environment

Use a Python version compatible with the recorded MuJoCo wheel. See
`environment.json` for the exporting environment; it is an observation, not a
cross-platform lockfile. `requirements.txt` pins the exported MuJoCo version.
If a wheel is unavailable for your OS/Python, choose a supported Python version
or explicitly record and revalidate any simulator version change.

macOS/Linux:
```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python run_simulation.py --headless --seconds 3
```

Windows PowerShell:
```powershell
py -3.12 -m venv .venv
.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt
.\\.venv\\Scripts\\python.exe run_simulation.py --headless --seconds 3
```

## View the scene

On Windows/Linux: `python run_simulation.py` (use the environment's interpreter).
On macOS: `mjpython run_simulation.py` (MuJoCo's GUI launcher in the same environment).
Add `--collision` to inspect collision geometry, or `--both` for both layers.
The MuJoCo viewer's Controls panel can adjust any exported position actuators.
Close the viewer to stop; rerunning starts from the saved initial state.

The runner resolves `scene.xml` beside itself, even from another working directory.
It starts with zero control targets. The headless mode only checks finite state
and simulator warnings; it does not repeat Kamino's tracking/contact/relocation
validation. It does not issue hardware commands.

## Interpret the result

- `ASSUMPTIONS.md`: readable property provenance and simulation approximations.
- `asset.json` (rigid) or `assembly.json` (articulated): editable source record.
- `simulation.json`: applied collision, inertia, contact and placement assumptions.
- `validation.json` (assembly) or `validation-report.json` (rigid), when present:
  saved pipeline validation evidence. Check its
  `passed` field and scope; creating an export alone does not establish a pass.
- Additional `prepared/`, `sources/` and `originals/` folders, when present, retain
  input/review history. They are not required by the standalone scene runner.

Record edits as a new experiment. Changing metadata JSON alone does not regenerate
`scene.xml`; re-export through Kamino or deliberately edit the simulator scene.
Existing reports apply only to the original exported files. Simulation acceptance
is not measured physical accuracy, hardware calibration or successful sim-to-real.
"""


def _cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")


def write_portable_files(folder: Path, record: dict, assumptions: dict):
    """Write static runner and readable provenance; never infer missing properties."""
    assembly = "links" in record
    lines = [
        "# Assumptions and provenance",
        "",
        f"Synthetic: {record['synthetic']}",
        "",
        "Source labels describe the supplied evidence; review does not turn estimates into measurements.",
        "",
        f"- Collision: {_cell(assumptions['collision'])}.",
        "- Inertia: uniform solid cuboid approximation; not measured inertia.",
        f"- Gravity (m/s²): {assumptions['gravity_m_s2']}; timestep (s): {assumptions['timestep_s']}.",
        f"- Contact solref: {assumptions['contact_solref']} (numerical assumption).",
    ]
    if assembly:
        lines.extend(
            [
                f"- Root: {_cell(assumptions['root'])}.",
                f"- Parent/child contact policy: {_cell(assumptions['parent_child_collision'])}.",
                f"- Explicit excluded pairs: {_cell(assumptions['excluded_joint_pairs'])}.",
            ]
        )
    else:
        lines.append(f"- Initial object bottom height: {assumptions['initial_bottom_height_m']} m.")
    lines.extend(["", "| Item | Value | Source | Note |", "| --- | --- | --- | --- |"])

    def row(label, value, source, note=""):
        lines.append("| " + " | ".join(_cell(v) for v in (label, value, source, note or "")) + " |")

    def scalar(label, prop):
        row(label, prop["value"], prop["source"], prop.get("note"))

    members = record["links"] if assembly else [{"name": "object", **record["properties"]}]
    for member in members:
        name = member["name"]
        scalar(name + " mass (kg)", member["mass_kg"])
        if member.get("sliding_friction") is None:
            value = (
                assumptions["links"][name]["friction"][0]
                if assembly
                else assumptions["friction"][0]
            )
            row(
                name + " sliding friction",
                f"unknown; simulator uses {value}",
                "simulation default",
                "not measured",
            )
        else:
            scalar(name + " sliding friction", member["sliding_friction"])
        if assembly:
            row(
                name + " geometry",
                member["visual_mesh"],
                member["geometry_source"],
                member["geometry_note"],
            )
    if assembly:
        for joint in record["joints"]:
            row(
                joint["name"] + " connection",
                f"{joint['parent']} → {joint['child']} ({joint['kind']})",
                joint["source"],
                joint.get("note"),
            )
            if joint["kind"] == "revolute":
                scalar(joint["name"] + " damping", joint["damping"])
                drive = joint["drive"]
                row(
                    joint["name"] + " drive",
                    f"kp={drive['kp']} Nm/rad; torque limit={drive['force_limit_nm']} Nm",
                    drive["source"],
                    drive.get("note"),
                )
    else:
        dimensions = record["properties"]["dimensions_m"]
        row(
            "Dimensions (m)",
            [dimensions[k] for k in ("x", "y", "z")],
            dimensions["source"],
            dimensions.get("note"),
        )
    lines.extend(
        [
            "",
            "Torsional/rolling friction, contact settings and box inertia are simulation assumptions.",
            "Read the full JSON records for frames, limits, notes and retained provenance.",
            "",
            "No measured physical accuracy or calibrated hardware response is established.",
        ]
    )
    environment = {
        "python": platform.python_version(),
        "platform": platform.system(),
        "machine": platform.machine(),
        "mujoco": mujoco.__version__,
        "numpy": np.__version__,
        "scope": "export environment; transitive dependencies are not locked",
    }
    for filename, content in {
        "README.md": README,
        "ASSUMPTIONS.md": "\n".join(lines) + "\n",
        "run_simulation.py": RUNNER,
        "requirements.txt": f"mujoco=={mujoco.__version__}\n",
        "environment.json": json.dumps(environment, indent=2) + "\n",
    }.items():
        (folder / filename).write_text(content, encoding="utf-8")
