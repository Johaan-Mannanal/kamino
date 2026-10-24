# Windows camera verification — Yash

Operator: Yash. Source: camera-only tests on the Windows hardware host, 2026-10-23.
No motors were commanded and no packages, calibration, servo settings, or existing datasets changed.

## Confirmed capture baseline

- Python 3.12.10; LeRobot 0.6.2 from source commit
  `146d8474932c8b566717eb2738ba459337ab71c4`; OpenCV 4.13.0.
- USB HD Camera wrist feed: DirectShow index **1**, confirmed by covering its lens.
  NexiGo HD Webcam is external; its index still needs confirmation. Recheck indices after reconnecting USB.
- Requested 640x480 at 30 FPS. Actual images: 640x480. Measured 4,889 successful reads in
  206.312 seconds (**23.697 FPS**), zero failed reads, and clean camera release.
  Rate includes display/snapshot overhead; camera-only throughput and robot synchronization
  were not measured. Driver FPS was initially 0, then reported approximately 30.
- OpenCV window display is unavailable. `tools/camera_preview.py` uses existing Tk/Pillow
  for display and OpenCV DirectShow for capture, without installing packages.
- Initial photos show fingertips and targets, but are soft; small printed text is unreadable.
  Fingers occupy much of the left side, with the gap visible. Distances were not measured.

## Reproduce in PowerShell

From the repository root, set `$robotPython` to the existing LeRobot interpreter and
`$captureDir` to a local directory **outside the repository**:

```powershell
& $robotPython .\tools\camera_preview.py --index 1 --camera-name wrist --output-dir $captureDir
```

For measured runs, add `--pickup-distance-mm` and `--placement-distance-mm` with actual
lens-front-to-target measurements. Click the preview: P saves pickup, L placement, S another
sample, Q/Esc closes. Each run creates original PNGs and `report.json` in a new folder.
Generated images and private machine-specific paths are excluded from Git.

The script reads focus/exposure values without changing them; zero does not establish support.
The driver-controls button opens DirectShow's property dialog. Inspect then Cancel to preserve
settings. Record any intentional adjustments. Mechanical focus support is unconfirmed;
do not force or unglue the lens.

## Optical comparison pending operator setup

Use the same stationary peg/ring or representative target, diffuse lighting, lens-to-target
distance, angle, and 640x480 resolution for both cameras. Inspect fingertips, hole edge, and
peg edge at both intended task positions. Keep focus/exposure unchanged for the baseline.
Distances, NexiGo index, mechanical focus support, and comparative edge quality await confirmation.
No synchronized camera/joint dataset or learned policy was produced by these tests.
