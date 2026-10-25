# Next check: operator-run software restart and one replay

Status: not executed. No new calibration is requested. This document is not an
automated motion script. Use the established operator startup/stopping workflow.

1. Preserve the dataset. Close the replay program, close/reopen its PowerShell
   window, and report exactly what was restarted. A CLI replay already starts a
   new process per invocation; a fresh terminal plus replay process makes this
   check explicit. Do not call it a robot power-cycle test unless power was
   actually cycled; no power cycle is requested here.
2. Restore the same marked A placement, charger orientation and grip location
   used in the successful runs. Take a photo of this starting placement and the
   arm's starting pose. Describe the placement; those details are not encoded
   by joint trajectory data alone. The first recorded actions/observations in
   replay-report.json are historical references, not position commands.
3. Before launch, use the operator's existing method to arrange/support the arm
   for a predictable start. Replay has no automatic verified collision-free
   approach from an arbitrary starting pose. Keep people clear of the motion.
4. Record a phone view covering the gripper, A and B. Run the established exact
   command in commands/replay-used.txt yourself once. Do not change timing code
   or calibration for this check. The --dataset.fps=15 option is present but
   does not control this installed replay timer; record the printed cadence
   summary and video duration so effective timing can be reported truthfully.
5. If a calibration prompt appears, cancel instead of accepting calibration
   writes. Normal follower connect configures servos and temporarily changes
   torque; it is not the earlier read-only capture path. The supplied command
   leaves disable_torque_on_disconnect at its default True, so exit/Ctrl+C can
   disable torque. Follow the established supported stop; do not assume hold.
6. Report success/failure for pick, lift/pause, transfer, placement, release and
   retract. Retain any failure and assistance in the outcome. Save the video
   and console summary. Report whether final rest/hold state changed.

Return: restarted components; initial arm pose/object placement and orientation;
one-run outcome and any assistance; video file; console timing summary. This
check remains operator-observed recorded command replay, not a learned policy.
