# Charger reconstruction from cleaned new photos

One real Meshy job completed from four manually masked photographs: angled pin
end, broad side, narrow side and USB-C end. The original capture had nine JPEGs;
all originals remain unchanged locally. Image numbers may differ on teammates'
computers, so identify views by content or the hashes in the input ZIP.

- Backend job: `14ec98fd-cda0-4b0c-915f-a70e0805dc66`.
- Meshy task: `01a16c9c-1679-7385-b5c3-0d755fe59d11`.
- Model: `meshy-6`; `should_texture=false`, `auto_size=false`,
  `image_enhancement=false`. No second submission was made.
- Four upload JPEGs total 425,648 bytes. The backend saved byte-identical copies.
- Provider GLB: 2,097,108 bytes; 58,234 vertices; 116,460 faces. Finite, watertight,
  consistent winding. Hash and raw bounds are in `mesh-inspection.json`.

The full-triangle orthographic inspection image shows the charger body and two
separate pins, without the old model's broad support slab. A USB-C-like recess
is visible, but its precise shape/depth is not accepted as accurate. These are
software mesh renders, not MuJoCo native-viewer evidence. The raw pins point +Y.

`mesh.glb` is the unchanged provider result. `charger-reconstruction-inputs.zip`
contains reviewed JPEGs and mask provenance; no API keys. Do not submit another
reconstruction just to reproduce this result. `properties.estimated.json` keeps
the previous 43 × 27 × 58 mm and 59 g estimates; nothing was physically measured.

The oriented, scaled simulation candidate is in
`../../simulation/apple-20w-charger-cleaned/`. Its `api-acceptance/` directory now
demonstrates the saved orientation endpoint and actual backend processing using
this cached GLB. The frontend orientation control remains outstanding.
