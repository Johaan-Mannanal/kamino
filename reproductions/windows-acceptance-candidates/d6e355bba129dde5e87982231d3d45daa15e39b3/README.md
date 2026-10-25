# Exact-SHA Windows acceptance evidence

Application: `d6e355bba129dde5e87982231d3d45daa15e39b3`. Start with [REPORT.md](REPORT.md) and [final-summary.json](final-summary.json).

This directory contains a byte-verified readable subset and corrected screenshots. `MANIFEST.json` describes the **complete sealed ZIP**, not just the readable subset. Extract `windows-acceptance-d6e355b-evidence.zip` into a new directory to obtain every referenced log, JSON snapshot, script, raw capture, replay ledger and supplemental review record.

ZIP SHA-256: `6e889f0c2e72a53e16c2e25d683e3cbc2a0e6c2a3dfd323918082162d9e18fb7`; 14,344,353 bytes; 227 payloads plus manifest. CRC and every payload hash verified. No original a834763 evidence is overwritten.

Corrected angle images are under `ui/native-*-corrected.png`. The screenshot persistence error and independent re-review are explained in [visual-review.md](visual-review.md). The invalid provisional frames are preserved only inside the archive under `capture-errors/`; they do not count toward the manual result.

The complete backend suite and full acceptance checklist were not rerun, prior native backend failures are not waived, and physical/contact/grasp accuracy remains unverified. No application source changes, deployment or real application-provider calls occurred.
