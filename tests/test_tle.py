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
            self.assertEqual(len([c for c in calls if c.startswith("X")]), 1, "nach HTTP 403 keine weitere CelesTrak-Anfrage")
            self.assertIn("HTTP 403", s.snapshot()["error"])

    def test_503_short_backoff_then_satnogs(self):
        calls = []
        SAT = json.dumps([{"tle0": "0 ISS (ZARYA)", "norad_cat_id": 25544, "tle1": "1 25544U 98067A   26328.88031538  .00004718  00000-0  91905-4 0  9995",
                           "tle2": "2 25544  51.6319 224.8621 0007433  61.9046 298.2693 15.49577477596662"},
                          {"tle0": "0 TITANIA", "norad_cat_id": 100900, "tle1": "1 A0900U 26227T   26328.96579037  .00001106  00000-0  59004-4 0  9995",
                           "tle2": "2 A0900  97.4372  37.4896 0000583  91.1053 269.0247 15.17178937  8226"}])
        def get(url):
            calls.append(url)
            if url.startswith("SAT"):
                return SAT
            raise http_error(503)
        with tempfile.TemporaryDirectory() as d:
            s = tle.TleService(d, base="X?GROUP=", get=get); s.satnogs = "SAT"
            s.step()
            self.assertAlmostEqual(s.paused_until - time.monotonic(), tle.BACKOFF[0], delta=5, msg="nach 503 erster Versuch nach 15 min")
            self.assertIn("next try in 15 min", s.snapshot()["error"])
            s.last_request = 0; s.step()
            self.assertEqual(calls, ["X?GROUP=stations", "SAT"], "während der Pause springt SatNOGS ein")
            snap = s.snapshot()
            self.assertEqual(snap["source"], "SatNOGS")
            self.assertEqual([o["NORAD_CAT_ID"] for o in snap["groups"]["satnogs"]], [25544, 100900])
            self.assertEqual(snap["groups"]["satnogs"][0]["OBJECT_NAME"], "ISS (ZARYA)")
            s.last_request = 0; s.step()
            self.assertEqual(len(calls), 2, "SatNOGS höchstens alle 2 h")
            # zweiter und dritter 503: 30 und 60 min, dann 2 h
            for want in tle.BACKOFF[1:] + [tle.HTTP_PAUSE]:
                s.paused_until = 0; s.next = {g: 0 for g in s.next}; s.next["satnogs"] = time.monotonic() + 1e6; s.last_request = 0; s.step()
                self.assertAlmostEqual(s.paused_until - time.monotonic(), want, delta=5)

    def test_network_errors_back_off(self):
        s = tle.TleService(tempfile.gettempdir(), base="X?GROUP=", get=lambda u: (_ for _ in ()).throw(OSError("timed out")))
        s.satnogs = None
        for _ in range(4):
            s.paused_until = 0; s.next = {g: 0 for g in s.next}; s.last_request = 0; s.step()
        self.assertGreater(s.paused_until, time.monotonic() + tle.HTTP_PAUSE - 60, "nach drei Netzfehlern 2 h Pause")

    def test_invalid(self):
        self.assertEqual(tle.parse_omm(""), [])
        with self.assertRaises(ValueError):
            tle.parse_omm("<html>blocked</html>")


if __name__ == "__main__":
    unittest.main()
