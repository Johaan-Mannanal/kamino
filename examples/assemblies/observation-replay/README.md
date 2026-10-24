# Retained mapping and portable observation replay

This is a **synthetic two-link hinge** acceptance example. Its 41 prescribed
samples span four seconds (0 → 30 → 0 degrees). They are not robot measurements.
The retained candidate adds a 0.05 rad offset and remains unverified.

## Evidence

- `browser-replay.png`: live browser controls after reopening the retained job.
- `browser-export.zip`: actual authenticated browser download, byte-identical to
  server attempt 3 / assembly revision 1 / mapping version 3.
- `synthetic-captures.json`: input timeline and explicit synthetic labels.
- `replay-report.json`: standalone MuJoCo replay after extraction outside the
  backend data directory. All 41 frames have finite state; no limit conflicts.
- `acceptance.json`: hashes and environment. Python 3.13.7, MuJoCo 3.3.7 on Intel
  macOS. Windows acceptance of this new replay path is still pending.

The browser exercised load, play, pause, reset, scrub, save mapping, reopen,
change offset, save another version, process and download. A temporary 1 rad
offset visibly produced an unclipped joint-limit warning, then was changed to
0.05 before final retention. The first ZIP's SHA-256 remained unchanged after
subsequent mapping versions and exports. A stale process version is separately
covered by the API regression test.

## Run independently

Extract `browser-export.zip` into a new folder. From that folder:

```sh
python -m pip install -r requirements.txt
python replay_observations.py --capture synthetic-hinge-motion --report my-replay.json
python replay_observations.py --capture synthetic-hinge-motion --view
```

Use `mjpython` for the native viewer on macOS. Space pauses; R resets. The report
was verified headlessly here; native viewer acceptance is not claimed.

The original simulation validation in `validation.json` is separate from replay.
Replay applies the recorded poses with `mj_forward`, never `mj_step`. It cannot
establish tracking accuracy, actuator dynamics, collision feasibility, or a
physical-to-simulation match. No physical hardware or paid provider was used.
