"""bridge.TimeBase: ISSLive-Zeitstempel werden auf die PC-Uhr abgebildet. Deckt die abweichende
Epoche vom 14.10.2026 ab (~1047 h geliefert, richtig wären ~6885 h gewesen) sowie eine PC-Uhr,
die um einige zehn Sekunden falsch geht.
"""
import ast, logging, pathlib, unittest

SRC = pathlib.Path(__file__).resolve().parents[1] / "bridge.py"
tree = ast.parse(SRC.read_text(encoding="utf-8"))
nodes = [n for n in tree.body if (isinstance(n, ast.ClassDef) and n.name == "TimeBase") or (isinstance(n, ast.FunctionDef) and n.name == "feed_lag_h")]
ns = {"log": logging.getLogger("test")}
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SRC), "exec"), ns)
TimeBase, feed_lag_h = ns["TimeBase"], ns["feed_lag_h"]
S = 1 / 3600


class TimeBaseTest(unittest.TestCase):
    """Tests der Zeitbasis der Bridge."""
    def test_dec31_epoch_is_standard(self):
        """ISSLive zählt ab 31. Dezember (24 h vor hours_of_year): wird gelernt, gilt nicht als 'foreign'.
        """
        tb = TimeBase(); now = 7044.0
        tb.observe_time(now + 24 - 3 * S, now); tb.observe_time(now + 24 - 2 * S, now + S)
        self.assertTrue(tb.learned); self.assertFalse(tb.foreign); self.assertAlmostEqual(tb.lag_s, 3.0, places=4)

    def test_frozen_feed_lag_before_learning(self):
        """21.10.2026: Die Uhr zeigte 7057,047 h (Epoche 31. Dezember) um 12:30 UTC = 7044,5 h:
        eingefroren seit 01:03 UTC, also 11,5 h, ohne einen einzigen Uhr-Tick.
        """
        self.assertAlmostEqual(feed_lag_h(7057.047, 7044.5), 11.453, places=3)
        self.assertAlmostEqual(feed_lag_h(7044.5 - 2 * S, 7044.5) * 3600, 2.0, places=3)   # Epoche 1. Januar (Mock-Server)
        self.assertNotEqual(feed_lag_h(9000.0, 7044.5), feed_lag_h(9000.0, 7044.5))       # aus der Zukunft: NaN

    def test_standard_epoch_small_lag(self):
        """Standardepoche mit kleinem Verzug."""
        tb = TimeBase(); tb.observe_time(6884.5, 6884.5 + 2 * S)
        self.assertFalse(tb.learned, "one sample proves nothing")
        tb.observe_time(6884.5 + S, 6884.5 + 3 * S)
        self.assertFalse(tb.foreign); self.assertAlmostEqual(tb.lag_s, 2.0, places=6)
        # Ein Wert vom selben Zeitpunkt wird auf die PC-Uhr abgebildet.
        self.assertAlmostEqual(tb.correct(6884.5, 6884.5 + 2 * S), 6884.5 + 2 * S, places=9)

    def test_frozen_snapshot_is_not_a_tick(self):
        """Ein eingefrorener Schnappschuss ist kein Tick."""
        tb = TimeBase(); now = 6884.0; old = now - 2.0      # Feed seit zwei Stunden eingefroren
        self.assertTrue(tb.observe_time(old, now))
        self.assertFalse(tb.observe_time(old, now + 60 * S), "reconnect snapshot repeats the frozen clock")
        self.assertFalse(tb.learned); self.assertEqual(tb.correct(old, now), old)

    def test_pc_clock_off_by_40_s_stays_fresh(self):
        """Eine um 40 s falsch gehende PC-Uhr bleibt frisch."""
        for skew in (-40, 40):
            tb = TimeBase(); now = 6884.5
            for k in range(10):
                tb.observe_time(now + k * S - skew * S, now + k * S)
            fresh = now + 9 * S - tb.correct(now + 9 * S - skew * S, now + 9 * S)
            self.assertLess(abs(fresh), 1e-9, f"skew {skew}")

    def test_foreign_epoch_corrected_and_stale_detected(self):
        """Abweichende Epoche wird korrigiert, Stillstand erkannt."""
        tb = TimeBase(); now = 6884.59
        tb.observe_time(1046.89 - S, now - S); tb.observe_time(1046.89, now)
        self.assertTrue(tb.foreign); self.assertIsNone(tb.lag_s)
        self.assertAlmostEqual(tb.correct(1046.89, now), now, places=9)
        self.assertAlmostEqual(tb.correct(1046.88, now), now - 0.01, places=9)
        # Ein Wert, der sich vor Stunden zuletzt geändert hat, wird trotzdem in dieses Jahr abgebildet.
        self.assertAlmostEqual(tb.correct(1046.89 - 5, now), now - 5, places=9)
        # Eine in Echtzeit laufende Uhr bleibt frisch; eine stehende Uhr fällt zurück.
        tb.observe_time(1046.89 + 30 * S, now + 30 * S)
        self.assertLess(now + 30 * S - tb.correct(1046.89 + 30 * S, now + 30 * S), 1e-9)
        self.assertFalse(tb.observe_time(1046.89 + 30 * S, now + 90 * S), "a frozen clock does not tick")
        self.assertGreater(now + 90 * S - tb.correct(1046.89 + 30 * S, now + 90 * S), 59 * S)
        # Fremde Werte (z. B. wiedergegebene Stunden des Jahres) werden nicht verschoben.
        self.assertEqual(tb.correct(6000.0, now), 6000.0)

    def test_frozen_clock_stays_stale_after_window(self):
        """Eine stehende Uhr bleibt auch nach dem Fenster veraltet."""
        tb = TimeBase(); now = 6884.0
        for k in range(0, 600, 1):            # die Feed-Uhr bleibt bei k = 10 s stehen
            tb.observe_time(now + min(k, 10) * S, now + k * S)
        self.assertTrue(tb.learned)
        lag = now + 599 * S - tb.correct(now + 10 * S, now + 599 * S)
        self.assertGreater(lag, 100 * S)

    def test_epoch_jump_relearns_immediately(self):
        """Ein Epochensprung wird sofort neu gelernt."""
        tb = TimeBase(); now = 6884.0
        tb.observe_time(now, now); tb.observe_time(now + S, now + S)
        tb.observe_time(now - 5838 + S, now + 2 * S)
        self.assertFalse(tb.observe_time(now - 5838 + S, now + 2.5 * S))
        tb.observe_time(now - 5838 + 2 * S, now + 3 * S)
        self.assertTrue(tb.foreign); self.assertAlmostEqual(tb.correct(now - 5838 + 2 * S, now + 3 * S), now + 3 * S, places=9)


if __name__ == "__main__":
    unittest.main()
