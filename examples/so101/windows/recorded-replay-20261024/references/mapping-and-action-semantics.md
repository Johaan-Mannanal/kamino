# Mapping and action semantics

The six channels are shoulder_pan.pos, shoulder_lift.pos, elbow_flex.pos,
wrist_flex.pos, wrist_roll.pos and gripper.pos. The supplied replay command uses
the installed follower default use_degrees=True: the five arm joints use degrees;
gripper uses normalized 0–100, not radians or millimetres. The metadata itself
lists channel names but does not independently certify hardware units.

This replays recorded hardware-space channels. It does not use a simulation
mapping. All model signs/offsets and gripper physical conversion remain unverified.
The prior shoulder-limit conflict is preserved; it is not corrected or clipped
in this package. Reference comparison:
https://github.com/Johaan-Mannanal/photo2sim/tree/95e317e56cf2eec4244f67b4f5dc19d5d1431195/examples/so101/comparisons/wrist-endpoints

The copied calibration is a current cached reference whose hash matches the
previously inspected follower calibration. The trajectory dataset contains no
recording-time calibration snapshot, so this is not proof of runtime EEPROM
identity during the five runs. No live calibration read/write occurred here.

Source semantics matter: lerobot_record.py stores action_values derived from
teleoperation and discards the return _sent_action from robot.send_action().
Therefore the dataset action is not an acknowledged motor-target trace.
The follower may cap each requested target relative to observed position using
max_relative_target=5.0. Its send_action performs sync_write, without individual
motor acknowledgments. The replay also discards send_action's return.

Replay reads robot.get_observation() each iteration for processing but does not
write those observations to a dataset. The packaged observation.state channel
is exclusively from the original recording. The operator confirms no separate
replay observations were recorded. Physical successes are operator-reported;
there is no saved five-run tracking-error or sent-action trace.
