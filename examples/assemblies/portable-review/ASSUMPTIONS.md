# Assumptions and provenance

Synthetic: True

Source labels describe the supplied evidence; review does not turn estimates into measurements.

- Collision: per-link convex hull of visual mesh; concavities filled.
- Inertia: uniform solid cuboid approximation; not measured inertia.
- Gravity (m/s²): [0, 0, -9.81]; timestep (s): 0.001.
- Contact solref: [0.02, 1] (numerical assumption).
- Root: fixed to world at reviewed root_pose.
- Parent/child contact policy: Explicitly exclude directly joint-connected pairs, including fixed-root children; other contacts enabled.
- Explicit excluded pairs: [['post', 'panel']].

| Item | Value | Source | Note |
| --- | --- | --- | --- |
| post mass (kg) | 0.1 | estimated | Starting assumption; review or replace before export |
| post sliding friction | unknown; simulator uses 0.8 | simulation default | not measured |
| post geometry | meshes/post.obj | user_supplied | Grouped without deformation. part_001 (user_supplied): Input post.obj; original SHA256 647b2378d44418a70bc6b12ca782d7fbafaaa1189354c4cb89f90ab54091018f; declared mm, converted to metres without centering or rotation |
| panel mass (kg) | 0.1 | estimated | Starting assumption; review or replace before export |
| panel sliding friction | unknown; simulator uses 0.8 | simulation default | not measured |
| panel geometry | meshes/panel.obj | user_supplied | Grouped without deformation. part_002 (user_supplied): Input panel.obj; original SHA256 779a05acde3a90171e652112dc87ef87e91808c9394b60f5676507ee13297a78; declared mm, converted to metres without centering or rotation |
| panel_hinge connection | post → panel (revolute) | user_supplied | Connection chosen in the guided editor; axis and limits require review Review: Reviewed synthetic Z hinge; corrected estimated gain to 5 after failed tracking. No physical calibration. |
| panel_hinge damping | 0.2 | estimated | Starting assumption; review before export |
| panel_hinge drive | kp=5.0 Nm/rad; torque limit=2.0 Nm | estimated | Starting assumption; not calibrated to hardware |

Torsional/rolling friction, contact settings and box inertia are simulation assumptions.
Read the full JSON records for frames, limits, notes and retained provenance.

No measured physical accuracy or calibrated hardware response is established.
