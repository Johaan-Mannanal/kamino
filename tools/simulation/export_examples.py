"""Export and validate the three prepared synthetic AssetRecord examples."""

import argparse
import json
from pathlib import Path

from photo2sim.contracts import AssetRecord
from photo2sim.simulation.export import export_asset
from photo2sim.simulation.validate import validate_export


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "examples/simulation/asset-export/prepared",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="New directory; never overwrites existing bundles",
    )
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.error("Choose a new output directory; existing examples are preserved")
    records = sorted(args.fixtures.glob("*/asset.json"))
    if not records:
        parser.error("No prepared AssetRecord examples found")
    reports = {}
    for record in records:
        asset = AssetRecord.model_validate_json(record.read_text(encoding="utf-8"))
        scene = export_asset(asset, record.parent, args.output_dir / record.parent.name)
        report = validate_export(scene)
        (scene.parent / "validation-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        reports[record.parent.name] = report
        first = report["original"]
        print(
            f"{record.parent.name}: passed={report['passed']} simulated={first.get('simulated_duration_s')}s dt={first.get('timestep_s')}s wall={report['total_wall_clock_s']:.3f}s",
            flush=True,
        )
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "report.json").write_text(
        json.dumps(reports, indent=2) + "\n", encoding="utf-8"
    )
    if not all(report["passed"] for report in reports.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
