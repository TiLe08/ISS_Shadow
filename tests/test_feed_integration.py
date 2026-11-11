"""bridge.py gegen einen nachgebildeten ISSLive-Server und einen echten MQTT-Broker (amqtt).

Deckt die Verbindungsfehler ab, die am echten Feed beobachtet wurden: eine Sitzung, die
verbunden bleibt, während ISSLive nichts sendet; eine getrennte Verbindung mit Serverausfall;
eine falsch gehende PC-Uhr; und die abweichende Zeitstempel-Epoche. Die Watchdog-Zeiten sind
für den Test verkürzt. Wird übersprungen, wenn aiohttp, amqtt, paho-mqtt oder
lightstreamer-client-lib fehlen.
Aufruf: python -m unittest tests.test_feed_integration -v      (etwa 90 s)
"""
import asyncio, json, pathlib, socket, subprocess, sys, threading, time, types, unittest, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
try:
    import aiohttp, amqtt, paho.mqtt.client as mqtt  # noqa: F401
    from lightstreamer.client import LightstreamerClient  # noqa: F401
    DEPS = True
except ImportError:
    DEPS = False


def free_port():
    """Freien lokalen TCP-Port finden."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); return s.getsockname()[1]


@unittest.skipUnless(DEPS, "needs aiohttp, amqtt, paho-mqtt, lightstreamer-client-lib")
class FeedIntegration(unittest.TestCase):
    """Integrationstest: Mock-Server, Broker und Bridge laufen gemeinsam."""
    @classmethod
    def setUpClass(cls):
        """Mock-Server (Unterprozess), Broker (Thread) und Bridge starten und Link-Meldungen mitschneiden.
        """
        cls.ls_port, cls.mq_port = free_port(), free_port()
        cls.mock = subprocess.Popen([sys.executable, str(HERE / "mock_isslive.py"), str(cls.ls_port), str(HERE / "live_sample_20261014.json")],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Broker
        cls.loop_ready = threading.Event()
        def run_broker():
            """Broker-Thread."""
            from amqtt.broker import Broker
            async def main():
                """Broker starten und laufen lassen."""
                cls.bloop = asyncio.get_running_loop(); cls.bstop = asyncio.Event()
                b = Broker({"listeners": {"default": {"type": "tcp", "bind": f"127.0.0.1:{cls.mq_port}"}},
                            "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}}})
                await b.start(); cls.loop_ready.set(); await cls.bstop.wait(); await b.shutdown()
            asyncio.run(main())
        threading.Thread(target=run_broker, daemon=True).start()
        assert cls.loop_ready.wait(15)
        for _ in range(50):
            try: urllib.request.urlopen(f"http://127.0.0.1:{cls.ls_port}/admin/stats", timeout=1).read(); break
            except Exception: time.sleep(0.2)
        sys.path.insert(0, str(ROOT))
        import bridge
        args = types.SimpleNamespace(broker="127.0.0.1", port=cls.mq_port, user=None, password=None, root="iss",
                                     ls=f"http://127.0.0.1:{cls.ls_port}", logdir="", replay=None, speed=1.0)
        cls.br = bridge.Bridge(args)
        cls.br.orbit.start = lambda: None                      # in Tests kein NASA-Download
        cls.br.retry_base = 6.0; cls.br.retry_after = 6.0; cls.br.stale_s = 4.0
        cls.br.start()
        cls.msgs = []; cls.lock = threading.Lock()
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        def on(c, u, m):
            """Mitschnitt der MQTT-Nachrichten der Bridge."""
            if m.retain: return
            with cls.lock: cls.msgs.append((time.time(), m.topic, json.loads(m.payload)))
        c.on_message = on; c.connect("127.0.0.1", cls.mq_port); c.subscribe("iss/#"); c.loop_start(); cls.sub = c

    @classmethod
    def tearDownClass(cls):
        """Alles wieder beenden."""
        cls.sub.loop_stop(); cls.br.stop_ev.set(); cls.br.stop_ls()
        try: cls.br.m.loop_stop(); cls.br.m.disconnect()
        except Exception: pass
        cls.mock.terminate(); cls.bloop.call_soon_threadsafe(cls.bstop.set)

    def admin(self, cmd):
        """Steuerbefehl an den Mock-Server senden."""
        return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{self.ls_port}/admin/{cmd}", timeout=3).read())

    def window(self, seconds):
        """Bis zu s Sekunden warten, bis cond() wahr ist."""
        t0 = time.time(); time.sleep(seconds)
        with self.lock: got = [m for m in self.msgs if m[0] >= t0]
        tm = [m for m in got if "/tm/" in m[1]]; link = [m[2]["sig"] for m in got if m[1].endswith("/link")]
        return tm, link

    def test_link_survives_real_feed_failures(self):
        """Die Verbindung übersteht die realen Fehlerbilder des Feeds."""
        tm, link = self.window(6)
        self.assertGreater(len(tm), 10, "telemetry flows"); self.assertEqual(link[-1], "AOS")
        self.assertTrue(self.br.timebase.foreign, "non-standard epoch learned")
        # Ein frischer Wert ist nach der Epochenkorrektur auf der PC-Uhr aktuell.
        t = max((m for m in tm if m[1].endswith("USLAB000032")), key=lambda m: m[0])[2]["t"]
        from bridge import hours_of_year
        self.assertLess(abs(hours_of_year() - t) * 3600, 5)

        # 1) ISSLive verstummt bei offener Sitzung: STALE, danach wird die Sitzung neu aufgebaut.
        restarts = self.br.restarts; self.admin("freeze")
        tm, link = self.window(16)
        self.assertIn("STALE", link, "silence reported as STALE (not left at AOS)")
        self.assertGreater(self.br.restarts, restarts, "silent session rebuilt")
        self.assertEqual([m for m in tm if m[0] > time.time() - 8], [], "re-sent snapshot is not re-published as new data")
        self.admin("thaw"); tm, link = self.window(6)
        self.assertGreater(len(tm), 10); self.assertEqual(link[-1], "AOS", "recovers after the feed resumes")

        # 2) Verbindung getrennt, und der Server lehnt eine Weile Verbindungen ab.
        self.admin("down?s=8"); self.admin("drop"); self.window(10)
        tm, link = self.window(8)
        self.assertGreater(len(tm), 5, "recovers after an outage"); self.assertEqual(link[-1], "AOS")

        # 3) Standardepoche mit 40 s Abweichung der PC-Uhr vom Feed: weiter AOS, Werte aktuell.
        self.admin("epoch?h=0"); self.admin("skew?s=-40"); self.window(4)
        tm, link = self.window(5)
        self.assertEqual(link[-1], "AOS", "clock offset is compensated")
        self.assertFalse(self.br.timebase.foreign); self.assertAlmostEqual(self.br.timebase.lag_s, 40, delta=2)


if __name__ == "__main__":
    unittest.main()
