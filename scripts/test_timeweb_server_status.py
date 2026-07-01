from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from timeweb_server_status import format_mib, primary_ipv4, system_disk, unwrap_backups


class TimewebServerStatusHelpersTest(unittest.TestCase):
    def test_format_mib_small(self) -> None:
        self.assertEqual(format_mib(512), "512 MiB")

    def test_format_mib_gib(self) -> None:
        self.assertEqual(format_mib(8192), "8.0 GiB")

    def test_primary_ipv4(self) -> None:
        server = {
            "networks": [
                {
                    "ips": [
                        {"ip": "2a03::1", "type": "ipv6", "is_main": True},
                        {"ip": "72.56.237.97", "type": "ipv4", "is_main": True},
                    ]
                }
            ]
        }
        self.assertEqual(primary_ipv4(server), "72.56.237.97")

    def test_system_disk_prefers_is_system(self) -> None:
        server = {
            "disks": [
                {"id": 1, "is_system": False},
                {"id": 2, "is_system": True, "size": 100},
            ]
        }
        self.assertEqual(system_disk(server)["id"], 2)

    def test_unwrap_backups(self) -> None:
        data = {"backups": [{"id": 1, "status": "done"}]}
        self.assertEqual(len(unwrap_backups(data)), 1)


if __name__ == "__main__":
    unittest.main()
