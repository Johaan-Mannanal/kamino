# README media

The side-by-side GIFs are presentation previews, not synchronized measurement evidence.

| File | Source | Encoding |
| --- | --- | --- |
| `simulation-demo.gif` | Illustrative demo v5, `demo-preview.mp4`, 30 seconds | Full clip at 2× speed, 10 fps, 480 × 400, 128-color palette |
| `physical-arm-demo.gif` | User-supplied `Recording demo.mov`, 34.785 seconds | Full clip at 2× speed, 8 fps, 360 × 300 canvas; aspect-preserving video with padding, 96-color palette |

The simulation retains the visible “Recorded arm replay · scripted charger motion”
label and provisional-staging note. It uses recorded arm poses and authored charger
motion; it does not demonstrate a contact-driven simulated grasp or a trajectory
exported from simulation to hardware. The physical clip is the earlier recording,
not the separately reported `Video Demo final.mov`. Their frames have not been
synchronized. Both GIFs loop independently and omit audio.

Source and output hashes, frame counts and durations are in
[demo-media.json](demo-media.json). Original videos and frozen simulation packages
were not changed. GIF conversion downsamples the display frames only.

`workflow.png` is a schematic illustration of the product workflow, not a captured
reconstruction or simulation result. The README banner reuses the site's branded
sharing image from `prototypes/kamino-ui/public/social/kamino-share-v1.png`.
