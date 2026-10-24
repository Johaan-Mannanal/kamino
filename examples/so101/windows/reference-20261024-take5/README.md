# Take 5: operator-confirmed stationary reference

Capture: 2026-10-24 07:37:38.995–07:39:38.880 Pacific (14:37 UTC), 599 observations over 119.881 s, 4.9883 Hz. Yash supplied front/side originals after capture and confirmed “they are unchanged” in response to the arm/jaw continuity question. This is operator-confirmed stationary association, **not hardware synchronization**. Image exposure times are unknown. Original capture metadata remains unchanged; pairing.json supplements its initial unpaired status.

## Readings

| Joint | Median | Peak-to-peak variation | Change from take 3 |
|---|---:|---:|---:|
| shoulder_pan | 0.395604 degrees | 0 | +0.791209 degrees |
| shoulder_lift | -61.274725 degrees | 0 | +42.901099 degrees |
| elbow_flex | 95.472527 degrees | 0 | -0.703297 degrees |
| wrist_flex | 1.230769 degrees | 0 | -82.813187 degrees |
| wrist_roll | -4.439560 degrees | 0 | -8.615385 degrees |
| gripper | 0.613915 normalized 0–100 | 0 | -0.341064 normalized |

Zero reported variation is encoder/report resolution, not proof of zero physical motion. Timestamp ordering, complete finite observations, and normalization recomputation passed (maximum discrepancy 1.11e-16). Calibration bytes match SHA-256 17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237. LeRobot 0.6.2, Python 3.12.10, source 146d8474932c8b566717eb2738ba459337ab71c4.

## Measurement and hardware state

Yash reported the jaw gap approximately 1/8 inch (3.175 mm; approximate, uncertainty unknown). photos/jaw-ruler.png preceded capture; continuity rests on operator confirmation. It is one reference point, not a calibrated opening conversion. Keep the older unpaired 3.18 mm measurement separate from take 3. No mounting-height measurement was added here.

The operator selected this pose with existing leader teleoperation. Teleop was stopped with disable_torque_on_disconnect=false after the arm was supported. The earlier hold check records all six torque-enable registers as enabled and unchanged. Goal positions there are register **readbacks**, not a timestamped sent-action stream. The stationary capture sends no targets, performs no calibration/configuration, and disconnects without disabling torque. Motor commands occurred during the preceding authorized teleop phase, not during this capture. Servo hold was left enabled.

## Mapping conclusions and next step

The side photo clearly shows a more extended posture than folded take 3, consistent with substantial shoulder/wrist changes in readings. Multiple joints changed, so these two references alone do not verify all independent signs or offsets. No sign/offset correction, gripper conversion, clamping, or model-limit change was adopted. The earlier shoulder limit/zero discrepancy remains documented in ../zero-limit-investigation-20261024/.

Johaan can compare this pose with take 3 using simulation-only candidate conversions. Future independent single-joint reference changes and multiple paired jaw openings would reduce ambiguity. No physical-accuracy claim follows from these observations; camera perspective and mounting transform remain uncertain. Take-5 horizontal mirroring has not been separately confirmed (take-3 confirmation does not automatically cover new photos).

## Evidence and reproduction

capture.json, calibration.json and observations.jsonl are exact capture copies. summary.json contains statistics; pairing.json records association and limitations; integrity.json hashes the evidence. photos/front.png, side.png and jaw-ruler.png are unchanged supplied PNGs. hold-check-before-take5.json predates this capture.

Read-only command used from repository root with the existing LeRobot interpreter:

```powershell
& C:/Users/ypira/lerobot-env/Scripts/python.exe -u tools/so101/capture_stationary.py --port COM5 --calibration C:/Users/ypira/.cache/huggingface/lerobot/calibration/robots/so_follower/hackathon_follower.json --source C:/Users/ypira/lerobot --output-dir outputs/so101/reference-capture-20261024-take5 --seconds 120
```

Do not rerun into that existing output directory or start a further capture without coordinating photos. Local paths document this computer; all necessary take-5 evidence is committed alongside this note.
