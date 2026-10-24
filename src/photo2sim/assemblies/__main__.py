"""CLI for reviewed assembly export and repeatable motion checks."""

import argparse
import json
from pathlib import Path

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.export import export_assembly
from photo2sim.assemblies.review import ReviewProject, prepare_review, review_package
from photo2sim.assemblies.validate import validate_assembly


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser(
        "export", help="Export prepared links, then validate; retain failures"
    )
    export.add_argument("record", type=Path)
    export.add_argument("--output-dir", type=Path, required=True)
    export.add_argument("--collision-mode", choices=["box", "convex_mesh"], default="box")
    export.add_argument("--exclude-joint-pairs", action="store_true")
    validate = commands.add_parser("validate", help="Repeat motion and relocated-folder checks")
    validate.add_argument("scene", type=Path)
    validate.add_argument("--report", type=Path, required=True)
    package = commands.add_parser("package", help="Create an offline browser review package")
    package.add_argument("record", type=Path)
    package.add_argument("--output", type=Path, required=True)
    prepare = commands.add_parser("prepare", help="Group reviewed parts into local link meshes")
    prepare.add_argument("record", type=Path)
    prepare.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.command in {"package", "prepare"}:
        project = ReviewProject.model_validate_json(args.record.read_text(encoding="utf-8"))
        if args.command == "prepare":
            result = prepare_review(project, args.record.parent, args.output_dir)
        else:
            payload = review_package(project, args.record.parent)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("x", encoding="utf-8") as file:
                json.dump(payload, file, allow_nan=False)
            result = args.output
        print(json.dumps({"output": str(result)}))
        return 0
    if args.command == "export":
        record = AssemblyRecord.model_validate_json(args.record.read_text(encoding="utf-8"))
        scene = export_assembly(
            record,
            args.record.parent,
            args.output_dir,
            collision_mode=args.collision_mode,
            exclude_joint_pairs=args.exclude_joint_pairs,
        )
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
