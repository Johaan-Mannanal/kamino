"""Camera-only DirectShow preview; never imports or connects to robot hardware."""

import argparse
import json
import time
import tkinter as tk
from datetime import datetime
from pathlib import Path

import cv2
from PIL import Image, ImageTk


def read_controls(camera):
    """Read reported values only; zero does not prove a control is supported."""
    properties = {
        "focus": cv2.CAP_PROP_FOCUS,
        "autofocus": cv2.CAP_PROP_AUTOFOCUS,
        "exposure": cv2.CAP_PROP_EXPOSURE,
        "auto_exposure": cv2.CAP_PROP_AUTO_EXPOSURE,
        "brightness": cv2.CAP_PROP_BRIGHTNESS,
        "gain": cv2.CAP_PROP_GAIN,
    }
    return {name: camera.get(prop) for name, prop in properties.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--camera-name", default="camera")
    parser.add_argument("--pickup-distance-mm", type=float)
    parser.add_argument("--placement-distance-mm", type=float)
    args = parser.parse_args()
    output = args.output_dir / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    output.mkdir(parents=True, exist_ok=False)
    report = {
        "camera_index": args.index,
        "camera_name": args.camera_name,
        "lens_to_target_mm": {
            "pickup": args.pickup_distance_mm,
            "placement": args.placement_distance_mm,
        },
        "requested": {"width": 640, "height": 480, "fps": 30},
        "opencv_version": cv2.__version__,
        "images": [],
    }
    camera = cv2.VideoCapture(args.index, cv2.CAP_DSHOW)
    window = f"{args.camera_name} [{args.index}]: P=pickup L=placement S=sample Q/ESC=close"
    attempts = successes = failures = consecutive_failures = 0
    dimensions = set()
    capture_times = []
    started = None
    root = None
    controls = {"key": None, "closed": False}
    try:
        if not camera.isOpened():
            raise RuntimeError(f"Cannot open camera {args.index} with DirectShow")
        report["backend"] = camera.getBackendName()
        report["setting_accepted"] = {
            "width": camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640),
            "height": camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480),
            "fps": camera.set(cv2.CAP_PROP_FPS, 30),
        }
        report["driver_reported_fps"] = camera.get(cv2.CAP_PROP_FPS)
        report["controls_before"] = read_controls(camera)
        report["control_note"] = "Reported values do not prove support or writable ranges."
        report["driver_dialog_requests"] = []
        # Warm up without including startup time in the measurement.
        warmup_end = time.perf_counter() + 2
        while time.perf_counter() < warmup_end:
            camera.read()
        root = tk.Tk()
        root.title(window)
        label_widget = tk.Label(root)
        label_widget.pack()
        tk.Label(
            root, text="P: pickup photo | L: placement photo | S: sample | Q/Esc: close"
        ).pack()

        def show_driver_controls():
            # DirectShow opens its property dialog. It does not set focus/exposure here.
            accepted = camera.set(cv2.CAP_PROP_SETTINGS, 1)
            report["driver_dialog_requests"].append(
                {"accepted": accepted, "controls_after_dialog": read_controls(camera)}
            )
            print(
                f"Driver dialog returned: {accepted}; controls: {read_controls(camera)}", flush=True
            )

        tk.Button(
            root,
            text="Inspect driver controls (Cancel to preserve settings)",
            command=show_driver_controls,
        ).pack()
        root.bind("<Key>", lambda event: controls.update(key=event.keysym.lower()))
        root.protocol("WM_DELETE_WINDOW", lambda: controls.update(closed=True))
        print(f"Saving to: {output}", flush=True)
        print(f"Reported controls (not proof of support): {report['controls_before']}", flush=True)
        print("P: save pickup; L: save placement; S: save sample; Q/ESC: close.", flush=True)
        started = time.perf_counter()
        while True:
            ok, frame = camera.read()
            now = time.perf_counter()
            attempts += 1
            if not ok or frame is None or frame.size == 0:
                failures += 1
                consecutive_failures += 1
                if consecutive_failures >= 30:
                    raise RuntimeError("30 consecutive frame read failures")
                root.update()
                key = controls.pop("key", None)
            else:
                consecutive_failures = 0
                successes += 1
                capture_times.append(now)
                height, width = frame.shape[:2]
                dimensions.add((width, height))
                elapsed = now - started
                displayed = frame.copy()
                rate = successes / elapsed if elapsed else 0
                cv2.putText(
                    displayed,
                    f"{width}x{height}  {rate:.1f} successful FPS  failures={failures}",
                    (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    1,
                )
                photo = ImageTk.PhotoImage(
                    Image.fromarray(cv2.cvtColor(displayed, cv2.COLOR_BGR2RGB))
                )
                label_widget.configure(image=photo)
                label_widget.image = photo
                root.update()
                key = controls.pop("key", None)
                if key in ("p", "l", "s"):
                    label = {"p": "pickup", "l": "placement", "s": "sample"}[key]
                    path = output / f"{label}-{successes:06d}.png"
                    if not cv2.imwrite(str(path), frame):
                        raise RuntimeError(f"Failed to save {path}")
                    report["images"].append(
                        {
                            "label": label,
                            "file": path.name,
                            "elapsed_s": elapsed,
                            "width": width,
                            "height": height,
                            "controls": read_controls(camera),
                        }
                    )
                    print(f"Saved {path}", flush=True)
            if key in ("q", "escape") or controls["closed"]:
                break
    except KeyboardInterrupt:
        report["interrupted"] = True
    except Exception as exc:
        report["error"] = str(exc)
        raise
    finally:
        elapsed = time.perf_counter() - started if started is not None else 0
        if camera.isOpened():
            report["controls_at_exit"] = read_controls(camera)
        camera.release()
        if root is not None:
            root.destroy()
        report.update(
            {
                "elapsed_s": elapsed,
                "read_attempts": attempts,
                "successful_frames": successes,
                "failed_reads": failures,
                "actual_dimensions": [list(size) for size in sorted(dimensions)],
                "successful_frames_per_elapsed_second": successes / elapsed if elapsed else 0,
                "successful_interarrival_fps": (
                    (len(capture_times) - 1) / (capture_times[-1] - capture_times[0])
                )
                if len(capture_times) > 1 and capture_times[-1] > capture_times[0]
                else None,
                "camera_released": not camera.isOpened(),
            }
        )
        (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
