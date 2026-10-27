# README demo media

`demo-simulation-and-arm.gif` replaces the earlier independent loops. Both panels
share one GIF clock: 120 frames over 15.01 seconds, representing approximately
2× playback. GIF centisecond timing adds 10 ms to the intended 15-second duration.
[Static frame](demo-simulation-and-arm-poster.png).

- **Left:** recorded arm observations replayed in MuJoCo, `demo-preview.mp4`,
  30 seconds, with **scripted charger motion**. The charger follows authored
  pickup/carry/release timing; contact physics does not produce the grasp.
  This is the v5 presentation video, SHA-256
  `d2d03d465574f5097f7562ecdc696412cf19d190c99e3e04bb4cd3528de1ea64`.
- **Right:** the user-supplied **Video Demo final.mov**, replacing the earlier
  `Recording demo.mov`. Its first 4.5 seconds of idle footage are omitted. Side
  crops center the white follower and charger and exclude most of the person on
  the right; framing limits already present in the source are not reconstructed.
- **Alignment:** manually selected visual anchors match approach, pickup, carry,
  release and return. The physical footage is continuously retimed between them.
  No action order, recorded joint data, mapping or simulated arm pose is changed.
  This is presentation alignment, not synchronized replay feedback or a
  contact-driven simulated grasp.

[Exact hashes, crop rectangles and timing anchors](demo-media.json). The full-quality
composite retains 900 simulation display frames over 30 seconds. Its MP4 and
original videos remain in the team's local evidence directory. Original/frozen
packages are unchanged; earlier README GIFs remain in Git history.

The composite removed the source video's scripted-charger footer. The current
README caption and this provenance record explicitly retain that qualification.
Manual visual retiming supplies no measured synchronization or evidence that a
particular simulation export produced the filmed physical execution.

`workspace-demo.png` is an actual capture of the **procedural mug demo**, with API
requests intercepted. It illustrates the interface and Echo identity; it is not
evidence of a new reconstruction or a validated simulation export.

`workflow.png` is a product schematic. `echo-banner.png` uses the current Echo
identity; see [the brand guide](../brand-guidelines.md) for reusable artwork.
