from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from toggle_dev_stack import (
    START_ORDER,
    STOP_ORDER,
    is_running,
    is_stopped,
    service_order,
)


class ToggleDevStackHelpersTest(unittest.TestCase):
    def test_start_order(self) -> None:
        self.assertEqual(START_ORDER, ("pocketbase", "fastapi", "frontend"))

    def test_stop_order_is_reverse(self) -> None:
        self.assertEqual(STOP_ORDER, tuple(reversed(START_ORDER)))

    def test_is_running_done(self) -> None:
        self.assertTrue(is_running("done"))

    def test_is_running_running(self) -> None:
        self.assertTrue(is_running("running"))

    def test_is_running_idle(self) -> None:
        self.assertFalse(is_running("idle"))

    def test_is_stopped_idle(self) -> None:
        self.assertTrue(is_stopped("idle"))

    def test_is_stopped_done(self) -> None:
        self.assertFalse(is_stopped("done"))

    def test_service_order_start(self) -> None:
        self.assertEqual(service_order("start"), START_ORDER)

    def test_service_order_stop(self) -> None:
        self.assertEqual(service_order("stop"), STOP_ORDER)


if __name__ == "__main__":
    unittest.main()
