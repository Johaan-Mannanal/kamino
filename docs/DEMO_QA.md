# Demo claims and answers

Prepared 2026-10-24 from retained project evidence. Update the result-specific
answers after acceptance; do not read pending results as completed work.
Sponsors and deployment are outside this document's scope.

**What did you build?**
Kamino connects reconstruction, review of size and physical assumptions,
editable simulation models, and portable MuJoCo exports. It retains the inputs
and assumptions needed to understand a result and revise it.

**Does Kamino transfer motion from simulation to the real arm?**
Yes. Kamino connects simulation with physical robotics. We used the SO-101 leader arm to record an initial joint trajectory, brought that motion into MuJoCo, and previewed and adjusted it for the charger demonstration. We then exported the joint motion and executed it on the physical SO-101 follower arm, iterating between simulation and hardware to account for real-world differences. The prototype demonstrates corresponding, working motions side by side, powered by our software. Precise calibration and contact-rich manipulation remain ongoing work.
See [the robotics demonstration](ROBOTICS_DEMO.md). The leader supplied the initial motion; the follower executed the exported trajectory after simulation adjustments and hardware iteration. This is a human-reviewed prototype, not a claim of autonomous motion planning or calibrated contact prediction.

**What does the AI do?**
Meshy produces the photo-derived geometry. Gemini proposes properties for human
review. Our workflow prepares geometry, records corrections and evidence, and
exports a model that MuJoCo can simulate. Suggested properties remain estimates.

**Is the robot inferred from photos?**
The charger is our photo-derived example. The SO101 example uses CAD components
and a joint template. We are not demonstrating automatic discovery of arbitrary
robot joints from photographs.

**How accurate is it?**
We assess separate questions: whether sizing preserves the reconstructed shape,
whether the exported scene runs, whether mapped robot readings agree with a
physical pose, and whether the dynamics predict real motion. A passing simulator
check answers only part of that. We do not yet have one overall accuracy number.

**Why did the earlier charger look squashed even though validation passed?**
The old preparation fitted three dimensions independently. That changed the
mesh's proportions while still producing a valid simulation. The new workflow
uses one reviewed reference length to preserve proportions, with independent
stretching an explicit advanced choice. Same-source charger software acceptance
passed locally, but the original reconstruction still has questionable proportions.
Uniform scaling preserves those source errors; physical accuracy remains unaccepted.

**Does uniform scaling make the reconstruction correct?**
It preserves the source shape. It cannot recover missing features or correct
shape errors already in the reconstruction. We review those separately.

**Did you measure this charger?**
The proposed approximately 27 mm housing thickness comes from a third-party
measurement of an Apple A2940 charger. It is a provisional reference, not a
measurement of our specimen. The matching mesh extent and variant uncertainty
must be reviewed. See [the dimension sources](CHARGER_DIMENSIONS_REFERENCE.md).

**What does the earlier stationary-pose evidence establish?**
The following answer concerns the earlier stationary-pose comparison only. It does not summarize the later trajectory-transfer demonstration described above.

It supplies two stationary poses, readings and operator-paired photos for an
offline comparison. The wrist, elbow and shoulder pan all changed. It is not an
isolated wrist experiment or a recorded moving trajectory. The completed offline
comparison distinguishes candidate wrist changes in a forearm-relative frame;
it does not conclusively identify sign or zero. All candidates retain a shoulder
limit conflict. Signs, offsets and gripper conversion remain unverified.

**Can you claim a physical error in millimeters from those photos?**
Not from the current evidence alone. Such a number needs a defined feature,
scale, coordinate frame, camera/alignment method and uncertainty. Until then we
can show a qualified visual comparison and describe unresolved mappings.

**Can I reproduce the export?**
For the demonstrated bundle, show its source/attempt identity, input snapshot,
hash and relocation record. A standalone load verifies portability for that
bundle and runtime; it does not prove universal compatibility or physical fidelity.

**Is this a live reconstruction?**
When using the saved charger, say: “This is the cached reconstruction from these
photos; we are demonstrating review and correction.” Describe any screenshots
or video as recorded results. Never substitute playback for an alleged live call.

**What if Gemini is unavailable?**
Manual property entry remains available. The fallback fixes passed focused
master checks on 057ea63; acceptance alongside the sizing changes remains pending.
Claim verified fallback on the demo build only after its combined checks. Existing
synthetic live-model records establish compatibility, not property accuracy.

**What remains approximate?**
The provisional size reference, unmeasured physical properties, simplified
collision/inertia, robot mounting and unsupported calibration mappings. Present
the specific assumptions for the artifact on screen rather than a blanket
“accurate digital twin” claim.

**How much time does it save?**
We have not measured an end-to-end comparison against a manual workflow. Show
the actual demonstrated steps and recorded timing without a claimed speedup.
