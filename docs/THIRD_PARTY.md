# Attribution and redistribution inventory

This is a focused release inventory, not a claim that all redistribution rights
have been cleared. Existing license files and frozen evidence are unchanged.

| Material | Source / existing notice | Release status |
| --- | --- | --- |
| Original Kamino code/docs and original synthetic examples | Kamino contributors; root [Apache-2.0 license](../LICENSE) and [NOTICE](../NOTICE) | Covered by the root license only to the extent Kamino holds the relevant rights |
| Imported SO-101 simulation model/meshes | [MuJoCo Menagerie pinned source](https://github.com/google-deepmind/mujoco_menagerie/tree/f3b6013629c7b94f8ee93fd977b161fa8350f9bc/robotstudio_so101), derived from The Robot Studio; [retained Apache-2.0 license](../third_party/robotstudio_so101/LICENSE) and [attribution](../third_party/robotstudio_so101/README.md) | Preserve upstream license/notices; do not present as Kamino reconstruction |
| SO-101 hardware/control tooling | [The Robot Studio](https://github.com/TheRobotStudio/SO-ARM100), [LeRobot](https://github.com/huggingface/lerobot) | Credit upstream; this release does not newly bundle their control software |
| Hinged-panel example | Original generated boxes and assumed properties; [provenance](../examples/assemblies/hinged-panel/README.md) | Existing artifact reused byte-for-byte; original Kamino material is covered by Apache-2.0 |
| Photo-derived charger meshes and provider outputs | Meshy output and retained example provenance | Confirm applicable provider/account output and redistribution terms before expanding release assets; no blanket clearance claimed |
| Robot CAD/component source files | Per-example provenance and supplier handoffs | Confirm permission for each supplied source before adding to a release download |
| UI icons, reference photos, Figma/design and brand media | Existing UI assets and [design record](FIGMA_EVIDENCE.md) | Confirm authorship/source licenses and distribution permission; no blanket grant from the root code license |
| Runtime/build dependencies | Python constraints and pnpm lockfiles | Dependencies keep their own licenses; preserve required notices if distributing dependencies rather than installing them |
| User photos, recordings and private artifacts | User/provider-specific | Excluded from new release assets; no rights granted by the root code license |

The experimental release should contain only deliberately selected assets whose
provenance and licensing are resolved. The root Apache-2.0 license does not grant
trademark rights or make every file in the repository original Kamino work.
