"""vehicles.py: Andockereignisse, Crew und Zeitplan aus Launch Library 2 (ohne Netz: ein nachgebildeter Abrufer).
"""
import json, pathlib, sys, tempfile, time, unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import vehicles  # noqa: E402

SAMPLE = json.loads((HERE / "ll2_docking_sample.json").read_text(encoding="utf-8"))
N = sum(1 for e in SAMPLE["results"] if e["docking_location"]["spacestation"]["id"] == 4)
EXTRA = json.loads((HERE / "ll2_station_sample.json").read_text(encoding="utf-8"))


class FakeLL2:
    """Ersatz für den HTTP-Abruf: liefert die Probe-Antworten aus tests/ oder wirft fail."""
    def __init__(self, fail=None):
        self.calls = []; self.fail = fail

    def __call__(self, url, timeout=20):
        self.calls.append(url)
        if self.fail: raise self.fail
        if "/docking_event/" in url: return SAMPLE
        if "/spacestation/" in url: return EXTRA["station"]
        if "/event/" in url: return EXTRA["events"]
        if "/launch/" in url: return EXTRA["launches"]
        raise AssertionError(url)


def run_all(s):
    """Alle Feeds einmal fällig machen und abrufen."""
    for _ in vehicles.FEEDS:
        s.last_request = 0; s.step()


class Vehicles(unittest.TestCase):
    """Tests für vehicles.py."""
    def test_feeds_parse_and_rate_budget(self):
        """Alle Feeds werden ausgewertet, und das Anfragebudget wird eingehalten."""
        with tempfile.TemporaryDirectory() as d:
            get = FakeLL2(); s = vehicles.VehicleService(d, base="http://ll2", get=get)
            s.step(); self.assertEqual(len(get.calls), 1, "one request per step")
            s.step(); self.assertEqual(len(get.calls), 1, f"requests are {vehicles.SPACING} s apart")
            run_all(s); snap = s.snapshot()
            self.assertEqual(len(get.calls), 4, "docking, station, events, launches")
            self.assertTrue(snap["available"]); self.assertIsNone(snap["error"])
            self.assertEqual(len(snap["events"]), N, "Tiangong event dropped (station read from docking_location)")
            self.assertIn("space_station__id=4", get.calls[0])
            st = snap["station"]; self.assertEqual(st["onboard_crew"], 7)
            crew = st["expeditions"][0]["crew"]
            self.assertEqual((crew[0]["role"], crew[0]["name"]), ("Commander", "Pyotr Dubrov"), "commander first")
            self.assertEqual(next(c for c in crew if c["name"] == "Joshua Kutryk")["agency"], "Canadian Space Agency")
            self.assertEqual(st["docked"][0]["name"], "Crew Dragon Grace")
            self.assertEqual([e["type"] for e in snap["upcoming_events"]][:2], ["Press Event", "EVA"])
            self.assertEqual(snap["upcoming_launches"][0]["status"], "TBC")
            hourly = sum(3600 / every for _, every in vehicles.FEEDS.values())
            self.assertLess(hourly, 6, "well inside 15 requests/hour")
            run_all(s); self.assertEqual(len(get.calls), 4, "nothing due before the refresh intervals")
            # der Cache übersteht einen Neustart und verzögert die nächsten Abrufe (Ratenlimit)
            s2 = vehicles.VehicleService(d, base="http://ll2", get=FakeLL2()); s2.load_cache()
            snap2 = s2.snapshot()
            self.assertEqual(len(snap2["events"]), N); self.assertEqual(snap2["station"]["onboard_crew"], 7)
            self.assertTrue(all(t > time.monotonic() + 1000 for t in s2.next.values()))

    def test_failure_keeps_cache_and_backs_off(self):
        """Nach einem Fehler bleibt der Cache erhalten, und der Dienst wartet länger."""
        with tempfile.TemporaryDirectory() as d:
            s = vehicles.VehicleService(d, base="http://ll2", get=FakeLL2()); s.step()
            s.get = FakeLL2(fail=OSError("HTTP Error 429: Too Many Requests")); s.next = {k: 0 for k in s.next}; s.last_request = 0; s.step()
            snap = s.snapshot()
            self.assertEqual(snap["error"], "rate limited"); self.assertTrue(snap["cached"]); self.assertEqual(len(snap["events"]), N)
            self.assertTrue(all(t > time.monotonic() + vehicles.RATE_LIMITED - 5 for t in s.next.values()), "429: every feed waits")
            s.get = FakeLL2(fail=OSError("timed out")); s.next = {k: 0 for k in s.next}; s.last_request = 0; s.step()
            self.assertLess(s.next["docking"], time.monotonic() + vehicles.RETRY + 5)

    def test_feed_errors_reported_and_cleared(self):
        """Ein Fehler beim Crew-Feed erscheint in feed_errors und verschwindet nach dem nächsten Erfolg."""
        with tempfile.TemporaryDirectory() as d:
            s = vehicles.VehicleService(d, base="http://ll2", get=FakeLL2()); run_all(s)
            s.get = FakeLL2(fail=OSError("timed out")); s.next = {k: (0 if k == "station" else 1e18) for k in s.next}; s.last_request = 0; s.step()
            self.assertEqual(s.snapshot()["feed_errors"], {"station": "timed out"})
            self.assertIsNone(s.snapshot()["error"], "ein Fehler beim Crew-Feed ist kein Fehler der Andockereignisse")
            s.get = FakeLL2(); s.next = {k: (0 if k == "station" else 1e18) for k in s.next}; s.last_request = 0; s.step()
            self.assertEqual(s.snapshot()["feed_errors"], {})


if __name__ == "__main__":
    unittest.main()
