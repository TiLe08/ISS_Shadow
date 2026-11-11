import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ephemeris import Ephemeris, OrbitService, epoch

BASE = epoch('2026-10-08T00:00:00Z')
R, W = 6790, math.sqrt(398600.4418 / 6790**3)
def circular(t):
    """Exakte Kreisbahn als unabhängige Vergleichslösung."""
    a = W*t
    return [R*math.cos(a), R*math.sin(a), 0, -R*W*math.sin(a), R*W*math.cos(a), 0]
def fixture():
    """Minimales OEM mit drei Stützstellen im Abstand von 4 min."""
    from datetime import datetime, timezone
    head = '''CCSDS_OEM_VERS = 2.0
CREATION_DATE = 2026-10-07T23:00:00.000
META_START
OBJECT_ID = 1998-067-A
CENTER_NAME = Earth
REF_FRAME = EME2000
TIME_SYSTEM = UTC
START_TIME = 2026-10-08T00:00:00.000
STOP_TIME = 2026-10-08T00:08:00.000
META_STOP
'''
    return head + '\n'.join(datetime.fromtimestamp(BASE+t, timezone.utc).isoformat()+' '+' '.join(map(str,circular(t))) for t in [0,240,480])

class Tests(unittest.TestCase):
    """Tests für ephemeris.py (NASA-Bahnvorhersage)."""
    def test_sample_units_and_endpoints(self):
        """Einheiten und Endpunkte werden exakt wiedergegeben."""
        e=Ephemeris(fixture())
        for t in [0,240,480]:
            for a,b in zip(e.state(BASE+t),circular(t)): self.assertAlmostEqual(a,b,places=8)
    def test_interpolation_tracks_independent_circular_solution(self):
        """Die Hermite-Interpolation folgt der Kreisbahn auf < 110 m."""
        s=Ephemeris(fixture()).state(BASE+120); expected=circular(120)
        self.assertLess(math.dist(s[:3],expected[:3]),0.11) # < 110 m bei Stützstellen alle vier Minuten
        self.assertLess(math.dist(s[3:],expected[3:]),0.002)
    def test_expiry_range_frame_and_corruption(self):
        """Abgelaufene Produkte, Zeit außerhalb, falsches Bezugssystem und beschädigte Daten werden abgelehnt.
        """
        e=Ephemeris(fixture())
        for t in [BASE-1,BASE+481,BASE+3*86400]:
            with self.assertRaises(ValueError): e.state(t)
        for bad in [fixture().replace('EME2000','ITRF'),fixture().replace('6790.0','nan'),fixture().replace('UTC','TAI')]:
            with self.assertRaises(ValueError): Ephemeris(bad)
    def test_no_interpolation_across_large_gap(self):
        """Über eine große Lücke wird nicht interpoliert."""
        text=fixture().replace('00:08:00','00:28:00')
        with self.assertRaisesRegex(ValueError,'gap'): Ephemeris(text).state(BASE+300)
    def test_stale_creation_rejected_within_coverage(self):
        """Ein zu altes Produkt wird abgelehnt, auch wenn die Zeit im Gültigkeitsbereich liegt."""
        e=Ephemeris(fixture().replace('2026-10-07T23:00:00.000','2026-10-04T23:00:00.000'))
        with self.assertRaisesRegex(ValueError,'48 hours'): e.state(BASE+120)
    def test_cached_prediction_survives_fetch_failure_but_expires(self):
        """Eine zwischengespeicherte Vorhersage übersteht einen fehlgeschlagenen Abruf, läuft aber ab.
        """
        with tempfile.TemporaryDirectory() as d:
            s=OrbitService(d); s.product=Ephemeris(fixture()); s.cached=True; s.error='network unavailable'
            snap=s.snapshot(BASE+120)
            self.assertTrue(snap['available']); self.assertTrue(snap['cached'])
            self.assertEqual(snap['kind'],'predicted'); self.assertEqual(snap['error'],'network unavailable')
            self.assertFalse(s.snapshot(BASE+1000)['available'])
    def test_bad_download_does_not_replace_cache(self):
        """Ein fehlerhafter Download ersetzt den Cache nicht."""
        with tempfile.TemporaryDirectory() as d:
            s=OrbitService(d); old=Ephemeris(fixture()); s.product=old
            class Response:
                def __enter__(self): return self
                def __exit__(self,*a): pass
                def read(self,*a): return b'<html>maintenance</html>'
            with patch('ephemeris.urllib.request.urlopen',return_value=Response()):
                with self.assertRaises(ValueError): s.refresh()
            self.assertIs(s.product,old)

if __name__=='__main__': unittest.main()
