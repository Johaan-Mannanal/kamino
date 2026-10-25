# SO-101 trajectory-transfer demonstration

Updated October 25, 2026, from the team’s clarified account of the prototype.

Kamino connects simulation with physical robotics. We used the SO-101 leader arm to record an initial joint trajectory, brought that motion into MuJoCo, and previewed and adjusted it for the charger demonstration. We then exported the joint motion and executed it on the physical SO-101 follower arm, iterating between simulation and hardware to account for real-world differences. The prototype demonstrates corresponding, working motions side by side, powered by our software. Precise calibration and contact-rich manipulation remain ongoing work.

## How the motion was developed

1. **Record initial motion with the leader arm.** Manually moving the leader supplied the initial servo/joint trajectory.
2. **Preview and refine in simulation.** Bring that joint motion into MuJoCo, preview it, and adjust it for the charger demonstration.
3. **Export and execute.** Export the joint motion and execute it on the physical SO-101 follower arm.
4. **Iterate between simulation and hardware.** Adjust the motion through back-and-forth trials to account for variables that are difficult to predict.
5. **Demonstrate corresponding motions side by side.** Show the working simulation and physical executions, identifying recorded footage as recorded when applicable.

The leader is the source of the initial motion; the follower executes the exported trajectory after simulation refinement. The demonstrated workflow includes human adjustments and hardware feedback.

## What this demonstrates

The prototype demonstrates trajectory transfer from simulation to a physical SO-101 arm. It extends beyond replaying physical observations as a simulation animation.

Precise calibration, quantitative motion accuracy and contact-rich manipulation remain ongoing work. This account does not claim autonomous trajectory planning, exact physical equivalence, validated grasp/contact prediction, or a completed general-purpose sim-to-real system.

## Relationship to the website and earlier evidence

The hardware prototype is distinct from the controls exposed in the hosted photo-to-simulation workspace. Its demonstration does not imply that the website provides hardware execution controls.

Earlier stationary-pose comparisons, observation-only playback, synthetic motion examples and illustrative charger animations retain their original scope. Their reports describe those specific artifacts, rather than the full trajectory-transfer demonstration. Existing numerical software checks are not retroactively reclassified as physical calibration tests.
