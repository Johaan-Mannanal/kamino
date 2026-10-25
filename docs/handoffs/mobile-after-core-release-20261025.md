# Mobile follow-up to whole-reconstruction release

Base: 8d2173fcd4a1d3680fdabb3bfd4b91feedeb0c0f. Incorporates the relevant incremental fixes from Atul's 747249a without reverting the restored viewer or full-mesh workflow.

- Viewer actions wrap within their column; principal controls and form shells have 44px minimum touch height.
- Short screens (height <=600px), including phone landscape, use the scrollable stacked layout so the viewer is reachable rather than clipped below wrapped controls.
- Saved status reflects outstanding reference confirmation; legacy selected-target status remains supported without reintroducing the removed panel.
- Whole-source orientation save asks for the full-mesh reference, not the removed target review.

Verification: 118 legacy frontend +149 Workspace tests passed, both TypeScript checks/builds passed, and diff checks passed. Backend source and deployment are unchanged; the Python suite was not repeated for this frontend-only patch. Existing large-chunk warning remains.

Actual Chromium/WebGL checks covered 320x568, 390x844, 430x932, 760x900, 761x900, 844x390, 1024x900 and 1440x900: control bounds/touch height, reset geometry projection, source-photo opening, Studio/Mesh, pointer orbit/pan/zoom preservation and estimated friction. Separate touch-emulated 390x844/844x390 acceptance used a copied local can fixture and actual backend: Save, regenerate, reopen, draft retention during download and byte-identical earlier ZIP all passed. No target inventory/review requests or provider calls. These are browser/touch emulation, not real iOS/Android hardware verification.

The stale orientation message was reproduced with a failing assertion before correction; the final suite passes. A physical phone check remains useful for virtual keyboard, pinch gestures and platform-specific behavior.

Evidence: outputs/mobile-after-core-20261025 in the primary checkout. Hosted rollout receipts and acceptance will be recorded there separately; local checks alone do not claim deployment.
