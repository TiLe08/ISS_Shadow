"""test_tle.py: CelesTrak-Dienst für das Radar (tle.py): Abruf je Gruppe (OMM/JSON), Zwischenspeicher,
Abrufregeln bei Fehlern."""
import io, json, sys, tempfile, time, unittest, urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import tle  # noqa: E402

ISS = [{"OBJECT_NAME": "ISS (ZARYA)", "NORAD_CAT_ID": 25544, "EPOCH": "2026-11-18T12:00:00.000000", "MEAN_MOTION": 15.5,
        "ECCENTRICITY": 0.0005, "INCLINATION": 51.64, "RA_OF_ASC_NODE": 200, "ARG_OF_PERICENTER": 90, "MEAN_ANOMALY": 270,
        "BSTAR": 0.0003, "MEAN_MOTION_DOT": 0.00016, "MEAN_MOTION_DDOT": 0}]
NEW = [dict(ISS[0], OBJECT_NAME="DRAGON CRS-36", NORAD_CAT_ID=100123)]


def http_error(code):
    return urllib.error.HTTPError("u", code, "Forbidden", {}, io.BytesIO(b""))


class TleTest(unittest.TestCase):
    def test_fetch_cache_and_empty_group(self):
        calls = []
        def get(url):
            calls.append(url)
            return "No GP data found" if url.endswith("last-30-days") else json.dumps(ISS)
        with tempfile.TemporaryDirectory() as d:
            s = tle.TleService(d, base="X?GROUP=", get=get)
            s.step(); s.last_request = 0; s.step()
            snap = s.snapshot()
            self.assertEqual(calls, ["X?GROUP=stations", "X?GROUP=last-30-days"])
            self.assertEqual(snap["groups"]["stations"][0]["NORAD_CAT_ID"], 25544)
            self.assertEqual(snap["groups"]["last-30-days"], [], "leere Gruppe ist kein Fehler")
            self.assertIsNone(snap["error"])
            s.last_request = 0; s.step()
            self.assertEqual(len(calls), 2, "kein erneuter Abruf vor Ablauf der Wartezeit")
            s2 = tle.TleService(d, base="X?GROUP=", get=get); s2.load_cache()
            self.assertIn("stations", s2.snapshot()["groups"])
            self.assertGreater(s2.next["stations"], time.monotonic() + tle.EVERY - 60)

    def test_six_digit_ids(self):
        self.assertEqual(tle.parse_omm(json.dumps(NEW))[0]["NORAD_CAT_ID"], 100123)

    def test_http_error_pauses_everything(self):
        calls = []
        def get(url):
            calls.append(url); raise http_error(403)
        with tempfile.TemporaryDirectory() as d:
            s = tle.TleService(d, base="X?GROUP=", get=get)
            s.step()
            for _ in range(5):
                s.last_request = 0; s.step()
            self.assertEqual(len(calls), 1, "nach HTTP 403 keine weitere Anfrage")
            self.assertIn("HTTP 403", s.snapshot()["error"])

    def test_network_errors_back_off(self):
        s = tle.TleService(tempfile.gettempdir(), base="X?GROUP=", get=lambda u: (_ for _ in ()).throw(OSError("timed out")))
        for _ in range(3):
            s.next = {g: 0 for g in tle.GROUPS}; s.last_request = 0; s.step()
        self.assertGreater(max(s.next.values()), time.monotonic() + tle.HTTP_PAUSE - 60, "nach drei Netzfehlern 2 h Pause")

    def test_invalid(self):
        self.assertEqual(tle.parse_omm(""), [])
        with self.assertRaises(ValueError):
            tle.parse_omm("<html>blocked</html>")


if __name__ == "__main__":
    unittest.main()
