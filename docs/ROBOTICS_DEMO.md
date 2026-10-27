# SO-101 demonstration and reproduction scope

Updated October 27, 2026. The team-reported hardware workflow and the public
presentation video have different evidence and reproduction boundaries.

## Team-reported hardware workflow

The team reports recording initial motion with the SO-101 leader, reviewing and
adjusting motion in MuJoCo, exporting joint motion, then executing it on the
physical follower with human iteration. This account records the team's report;
it is not a complete public reproduction of that hardware execution.

The public repository provides SO-101 reference-model inspection, capture mapping
review and observation replay. It does not yet publish a complete hardware runner
or a traceable simulation-export-to-measured-execution receipt. The hosted photo
workspace exports simulation assets and has no robot execution controls.

## What the README video shows

The left panel replays recorded arm observations in MuJoCo with **scripted charger
motion**. Authored pickup/carry/release moves the charger; contact physics does not
produce that grasp. The source is the preserved v5 presentation video, SHA-256
`d2d03d465574f5097f7562ecdc696412cf19d190c99e3e04bb4cd3528de1ea64`.
The right panel is the supplied physical follower-arm recording,
`Video Demo final.mov`.

Visual approach, pickup, carry, release and return events were manually aligned.
The physical video is retimed between those anchors. Same-run association and
visual alignment do not establish synchronized measured joint telemetry. The
recorded observations driving the left panel are from the original recording;
they are not verified measurements from the execution filmed on the right.

[Media provenance, hashes and timing](images/README.md) retain the exact source
identities. The caption identifies the recorded arm replay and scripted object
motion. This video illustrates the demonstration; it is not acceptance of a
physics-driven simulated pickup or quantitative real-world accuracy.

## Public offline tools

- [SO-101 reference workspace](../examples/so101/WORKSPACE.md): model and scene inspection.
- [Capture mapping review](MAPPING_REVIEW.md): explicit units, signs, offsets,
  normalized conversions and limit findings across recorded stationary poses.
- [Observation replay](../examples/assemblies/observation-replay/README.md):
  retained inputs, kinematic replay and repeatable software checks.

Follow each guide's own input format and scope. These tools do not provide a
turnkey hardware execution workflow. No robot movement is needed to run the
retained offline examples.

## Evidence needed for reproducible simulation-to-hardware execution

A future public hardware reproduction needs all of the following together:

1. The exact exported motion file, hash, schema, joint names, units and timestamps.
2. The simulation model and reviewed mapping/calibration identities, including
   directions, zero offsets, gripper conversion and unresolved limit findings.
3. The executable hardware runner, pinned dependencies and invocation, with the
   commanded motion kept distinct from measured follower observations.
4. A run receipt identifying the exported file actually executed and the measured
   observations for that same run. Video event correspondence needs an explicit
   association with those observations; a fitted visual time offset is insufficient.
5. A stated acceptance scope and separate results for motion reproduction,
   calibration, contact/grasp behavior and physical accuracy.

These items remain publication/reproduction gaps, not instructions to run hardware
or alter the recorded trajectory. Earlier stationary-pose comparisons, synthetic
examples, observation playback and illustrative animations retain their original
results. Numerical simulation checks do not retroactively establish calibration
or grasp accuracy.
