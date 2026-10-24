"""Offline control-path tests. No serial connections or hardware writes."""
import unittest
from unittest.mock import patch

import move_wrist_relative as helper


class SimBus(helper.WristOnlyBus):
    def __init__(self):
        motors = {n: helper.Motor(i, "sts3215", helper.MotorNormMode.DEGREES if i < 6
                                 else helper.MotorNormMode.RANGE_0_100)
                  for i, n in enumerate(helper.NAMES, 1)}
        calibration = {n: helper.MotorCalibration(id=i, drive_mode=0, homing_offset=0,
                                                 range_min=500, range_max=3500)
                       for i, n in enumerate(helper.NAMES, 1)}
        super().__init__("NEVER_OPEN", motors, calibration)
        self.positions = dict.fromkeys(helper.NAMES, 2000)
        self.goals = self.positions.copy()
        self.torque = dict.fromkeys(helper.NAMES, 1)
        self.writes = []
        self.freeze = False

    def connect(self, *args, **kwargs):
        raise AssertionError("Tests must never open a port")

    def sync_read(self, register, **kwargs):
        return {"Present_Position": self.positions, "Goal_Position": self.goals,
                "Torque_Enable": self.torque}[register].copy()


def fake_transport(bus, register, motor, value, **kwargs):
    bus.writes.append((register, motor, value, kwargs))
    bus.goals[motor] = value
    if not bus.freeze:
        bus.positions[motor] = value


class MotionTests(unittest.TestCase):
    def test_real_connect_and_disconnect_paths_only_read(self):
        template = SimBus()
        bus = helper.WristOnlyBus("NEVER_OPEN", template.motors, template.calibration)
        calls = []
        class NativeTransport:
            def read_register_with_error(self, motor_id, register, **kwargs):
                calls.append(("read", motor_id, register))
                return bus._model_number("sts3215"), 0
            def sync_read_register_with_error(self, ids, register, **kwargs):
                calls.append(("sync_read", tuple(ids), register))
                return [(1, 0) for _ in ids]
            def close(self):
                calls.append(("close",))
        with patch.object(helper.SerialMotorsBus, "_open_bus", return_value=NativeTransport()):
            bus.connect()
            self.assertTrue(bus.is_connected)
            bus.disconnect(disable_torque=False)
        self.assertFalse(bus.is_connected)
        self.assertEqual(len([c for c in calls if c[0] == "read"]), 6)
        self.assertEqual(len([c for c in calls if c[0] == "sync_read"]), 2)
        self.assertEqual(calls[-1], ("close",))

    def test_failed_handshake_releases_transport(self):
        template = SimBus()
        bus = helper.WristOnlyBus("NEVER_OPEN", template.motors, template.calibration)
        from unittest.mock import Mock
        transport = Mock()
        transport.read_register_with_error.return_value = (0, 0)
        with patch.object(helper.SerialMotorsBus, "_open_bus", return_value=transport):
            with self.assertRaises(RuntimeError):
                bus.connect()
        transport.close.assert_called_once()
        self.assertFalse(bus.is_connected)

    def run_sim(self, bus, delta=15, emit=None):
        events = []
        def record(event, **data):
            events.append((event, data))
            if emit:
                emit(event, data)
        with patch.object(helper.SerialMotorsBus, "write", fake_transport):
            helper.run_motion(bus, delta, 2, record, sleep=lambda _: None)
        return events

    def test_positive_and_negative_moves_only_write_wrist(self):
        for delta in (15, -15):
            bus = SimBus()
            events = self.run_sim(bus, delta)
            self.assertEqual(len(bus.writes), 75)
            self.assertTrue(all(r == "Goal_Position" and n == "wrist_flex"
                                for r, n, _, _ in bus.writes))
            self.assertTrue(all(v == 2000 for n, v in bus.goals.items() if n != "wrist_flex"))
            self.assertEqual(events[-1][0], "completed")
            self.assertAlmostEqual(events[-1][1]["observed_change"]["wrist_flex"], delta, delta=0.1)
            self.assertTrue(all(v == 1 for v in bus.torque.values()))

    def test_limits_and_invalid_arguments_rejected(self):
        for start, delta, speed in [(3490, 15, 2), (510, -15, 2), (2000, float("nan"), 2),
                                    (2000, 16, 2), (2000, 0, 2), (2000, 15, 3)]:
            with self.assertRaises(ValueError):
                helper.plan_targets(SimBus(), start, delta, speed)

    def test_other_writes_blocked_before_transport(self):
        bus = SimBus()
        bus.allowed_min, bus.allowed_max = 1900, 2200
        for register, name, value in [("Goal_Position", "elbow_flex", 2000),
                                      ("Torque_Enable", "wrist_flex", 0),
                                      ("Goal_Position", "wrist_flex", 3000)]:
            with self.assertRaises((ValueError, RuntimeError)):
                bus.write(register, name, value, normalize=False)
        for method in (bus.sync_write, bus.write_calibration, bus.enable_torque, bus.disable_torque):
            with self.assertRaises(RuntimeError):
                method()

    def test_torque_off_and_stale_goal_rejected_without_writes(self):
        for torque_off in (True, False):
            bus = SimBus()
            if torque_off:
                bus.torque["elbow_flex"] = 0
            else:
                bus.goals["elbow_flex"] += 100
            with self.assertRaises(RuntimeError):
                self.run_sim(bus)
            self.assertEqual(bus.writes, [])

    def test_other_joint_drift_stops_new_targets(self):
        bus = SimBus()
        def drift(event, data):
            if event == "write_acknowledged":
                bus.positions["elbow_flex"] += 100
        with self.assertRaisesRegex(RuntimeError, "drift"):
            self.run_sim(bus, emit=drift)
        self.assertEqual(len(bus.writes), 1)

    def test_unexpected_other_goal_stops_new_targets(self):
        bus = SimBus()
        def interference(event, data):
            if event == "write_acknowledged":
                bus.goals["gripper"] += 1
        with self.assertRaisesRegex(RuntimeError, "target register changed"):
            self.run_sim(bus, emit=interference)
        self.assertEqual(len(bus.writes), 1)

    def test_tracking_failure_stops_ramp(self):
        bus = SimBus()
        bus.freeze = True
        with self.assertRaisesRegex(RuntimeError, "tracking error"):
            self.run_sim(bus)
        self.assertLess(len(bus.writes), 75)

    def test_interrupt_stops_new_writes(self):
        bus = SimBus()
        def interrupt(event, data):
            if event == "write_acknowledged":
                raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.run_sim(bus, emit=interrupt)
        self.assertEqual(len(bus.writes), 1)

    def test_failed_ack_keeps_attempt_distinct_from_acknowledgment(self):
        bus = SimBus()
        events = []
        def record(event, **data):
            events.append(event)
        with patch.object(helper.SerialMotorsBus, "write", side_effect=ConnectionError("lost ack")):
            with self.assertRaises(ConnectionError):
                helper.run_motion(bus, 15, 2, record, sleep=lambda _: None)
        self.assertIn("write_attempt", events)
        self.assertNotIn("write_acknowledged", events)
        self.assertNotIn("completed", events)


if __name__ == "__main__":
    unittest.main()
