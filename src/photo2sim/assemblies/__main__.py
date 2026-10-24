"""CLI for reviewed assembly export and repeatable motion checks."""

import argparse
import json
from pathlib import Path

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.export import export_assembly
from photo2sim.assemblies.validate import validate_assembly


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser(
        "export", help="Export prepared links, then validate; retain failures"
    )
    export.add_argument("record", type=Path)
    export.add_argument("--output-dir", type=Path, required=True)
    validate = commands.add_parser("validate", help="Repeat motion and relocated-folder checks")
    validate.add_argument("scene", type=Path)
    validate.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "export":
        record = AssemblyRecord.model_validate_json(args.record.read_text(encoding="utf-8"))
        scene = export_assembly(record, args.record.parent, args.output_dir)
        destination = scene.parent / "validation.json"
    else:
        scene = args.scene
        destination = args.report
        if destination.exists() or destination.is_symlink():
            raise FileExistsError("Report already exists; choose a new file")
    report = validate_assembly(scene)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("x", encoding="utf-8") as file:
        json.dump(report, file, indent=2, allow_nan=False)
        file.write("\n")
    print(json.dumps({"passed": report["passed"], "scene": str(scene), "report": str(destination)}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
