"""Prüft das Auslesen laufender Livestreams aus YouTube-Stream-Seiten (streams.py) an nachgebildeten Seiten."""
import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import streams


def page(items, channel="UCLA_DiR1FfKNvjuUpBHmylQ"):
    data = {"metadata": {"channelMetadataRenderer": {"externalId": channel}}, "contents": {"tabs": [{"richGrid": {"contents": items}}]}}
    return "<html><script>var ytInitialData = " + json.dumps(data) + ";</script></html>"


def video(vid, title, live=False, upcoming=False):
    r = {"videoId": vid, "title": {"runs": [{"text": title}]},
         "thumbnailOverlays": [{"thumbnailOverlayTimeStatusRenderer": {"style": "LIVE" if live or upcoming else "DEFAULT"}}]}
    if upcoming:
        r["upcomingEventData"] = {"startTime": "1799999999"}
    return {"richItemRenderer": {"content": {"videoRenderer": r}}}


def lockup(vid, title, live=False):
    badge = [{"thumbnailBadgeViewModel": {"badgeStyle": "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE" if live else "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT"}}]
    return {"lockupViewModel": {"contentId": vid, "contentType": "LOCKUP_CONTENT_TYPE_VIDEO", "contentImage": {"badges": badge},
                                "metadata": {"lockupMetadataViewModel": {"title": {"content": title}}}}}


def sen_api(vid="fO9e9jnhYK8"):
    """Aufbau der Antwort von api.sen.com/content/public/live (gekürzt, Stand 11.11.2026)."""
    return json.dumps({"success": True, "metadata": {"nextCursor": None, "count": 0},
                       "data": {"metadata": {"tags": {"og:title": "Livestream from Space - ISS"}, "ttl": 5, "templateId": "videos"},
                                "nodes": [{"id": "x-embed", "type": "VideoEmbed",
                                           "content": {"video": {"url": "https://www.youtube-nocookie.com/embed/" + vid, "youtubeId": vid}}},
                                          {"id": "x-details", "type": "VideoDetails", "content": {}}]}})


class StreamsTest(unittest.TestCase):
    def test_sen_api(self):
        self.assertEqual(streams.sen_live(sen_api()), [("fO9e9jnhYK8", "Livestream from Space - ISS")])
        with self.assertRaises(ValueError):
            streams.sen_live(json.dumps({"success": True, "data": {"nodes": []}}))

    def test_sen_api_first_then_youtube_page(self):
        calls = []

        def get(url):
            calls.append(url)
            if url == streams.SEN_API:
                return sen_api()
            raise OSError("offline")
        sv = streams.StreamService(get=get); sv.refresh(); snap = sv.snapshot()
        sen = [s for s in snap["streams"] if s["channelName"] == "sen"]
        self.assertEqual([(s["id"], s["channelId"]) for s in sen], [("fO9e9jnhYK8", "UCkvW_7kp9LJrztmgA4q4bJQ")])
        self.assertNotIn("sen", snap["errors"])
        self.assertNotIn(streams.CHANNELS["sen"][1], calls)

        # Schnittstelle gestört: dann die YouTube-Stream-Seite des Kanals.
        def get2(url):
            if url == streams.SEN_API:
                return "<html>Bad gateway</html>"
            if "@sen" in url:
                return page([lockup("eeeeeeeeeee", "Live 4K video of Earth and space", live=True)], channel="UCkvW_7kp9LJrztmgA4q4bJQ")
            raise OSError("offline")
        sv = streams.StreamService(get=get2); sv.refresh()
        self.assertEqual([s["id"] for s in sv.snapshot()["streams"]], ["eeeeeeeeeee"])


    def test_live_only(self):
        html = page([video("aaaaaaaaaaa", "Old spacewalk"), video("bbbbbbbbbbb", "Live Video from the International Space Station (Official NASA Stream)", live=True),
                     video("ccccccccccc", "Moon Base Update", upcoming=True), lockup("ddddddddddd", "Live High-Definition Views from the ISS", live=True)])
        found, cid = streams.live_streams(html)
        self.assertEqual([v for v, _ in found], ["bbbbbbbbbbb", "ddddddddddd"])
        self.assertEqual(cid, "UCLA_DiR1FfKNvjuUpBHmylQ")
        self.assertIn("International Space Station", found[0][1])

    def test_service_orders_station_streams_first_and_survives_errors(self):
        pages = {"NASA": page([video("xxxxxxxxxxx", "Launch coverage", live=True), video("yyyyyyyyyyy", "Live Video from the International Space Station", live=True)])}

        def get(url):
            if "@NASA" in url:
                return pages["NASA"]
            raise OSError("offline")
        sv = streams.StreamService(get=get)
        self.assertFalse(sv.refresh())
        snap = sv.snapshot()
        self.assertEqual([s["id"] for s in snap["streams"]], ["yyyyyyyyyyy", "xxxxxxxxxxx"])
        self.assertIn("sen", snap["errors"])
        # Ein späterer Fehlschlag verwirft die letzte gute Liste nicht.
        pages["NASA"] = "<html>consent wall</html>"
        sv.refresh()
        self.assertEqual(len(sv.snapshot()["streams"]), 2)


if __name__ == "__main__":
    unittest.main()
