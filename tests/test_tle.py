"""test_tle.py: CelesTrak-Dienst für das Radar (tle.py): Abruf je Gruppe, Zwischenspeicher, Fehler."""
import json, sys, tempfile, time, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import tle  # noqa: E402

ISS = "ISS (ZARYA)\n1 25544U 98067A   26322.50000000  .00016717  00000-0  30408-3 0  9993\n2 25544  51.6400 200.0000 0005000  90.0000 270.0000 15.50000000400000\n"


class TleTest(unittest.TestCase):
    def test_fetch_cache_and_errors(self):
        calls = []
        def get(url):
            calls.append(url)
            if url.endswith("last-30-days"):
                return "No GP data found"
            return ISS
        with tempfile.TemporaryDirectory() as d:
            s = tle.TleService(d, base="X?GROUP=", get=get)
            s.step(); s.last_request = 0; s.step()
            snap = s.snapshot()
            self.assertEqual(calls, ["X?GROUP=stations", "X?GROUP=last-30-days"])
            self.assertIn("25544", snap["groups"]["stations"])
            self.assertIn("last-30-days", snap["error"])
            s.last_request = 0; s.step()
            self.assertEqual(len(calls), 2, "kein erneuter Abruf vor Ablauf der Wartezeit")
            # Neustart: Cache wird geladen, stations erst nach 2 h wieder abgerufen
            s2 = tle.TleService(d, base="X?GROUP=", get=get); s2.load_cache()
            self.assertIn("stations", s2.snapshot()["groups"])
            self.assertGreater(s2.next["stations"], time.monotonic() + tle.EVERY - 60)
            self.assertTrue(json.loads((Path(d) / "tle.json").read_text())["stations"]["fetched"] > 0)

    def test_valid(self):
        self.assertTrue(tle.valid_tle(ISS)); self.assertFalse(tle.valid_tle("<html>"))


if __name__ == "__main__":
    unittest.main()
