#!/usr/bin/env python3
"""Tests for the expedition list. Run with: python3 scripts/test_update_expeditions.py"""

import datetime as dt
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import update_expeditions as ue  # noqa: E402

TODAY = dt.date(2026, 11, 5)

MBA_PAGE = """
<h2>2026-27 Venture Portfolio</h2>
<table>
  <tr><td>Venture</td><td>Location</td><td>Dates</td><td>Focus</td><td>Cost</td><td>Open To</td></tr>
  <tr><td><a href="https://apply.test/brochure?programid=1">[WLV] MBA Antarctica Expedition</a></td>
      <td>King George Island, Antarctica</td><td>Winter Break</td>
      <td>backpacking, glacier travel, and navigation</td><td>$8400</td><td>MBA / WEMBA</td></tr>
  <tr><td><a href="https://apply.test/brochure?programid=2">[WLV] MBA Small Crew Sailing Expedition</a></td>
      <td>British Virgin Islands</td><td>Spring Break</td>
      <td>Caribbean Ocean Sailing</td><td>$4,600</td><td>MBA / WEMBA 2Y</td></tr>
</table>
<table>
  <tr><td>Characteristic</td><td>Antarctica</td><td>Small Crew</td></tr>
  <tr><td>Heavy Pack</td><td>X</td><td></td></tr>
  <tr><td>Sea Sickness</td><td></td><td>X</td></tr>
</table>
<table>
  <tr><td>Venture</td><td>Fall Date</td><td>Spring Date</td><td>Focus</td><td>Cost</td></tr>
  <tr><td>[WLV] MBA FDNY Intensive</td><td>Sept. 26</td><td>TBA</td><td>Firefighting</td><td>$700</td></tr>
</table>
"""

UNDERGRAD_PAGE = """
<h2>2026-27 Venture Portfolio</h2>
<table>
  <tr><th>Venture</th><th>Type</th><th>Location</th><th>Dates</th><th>Focus</th><th>Cost</th><th>Open To</th></tr>
  <tr><td><a href="https://apply.test/brochure?programid=3">[WLV] UGR Atacama Desert Expedition</a></td>
      <td>Expedition</td><td>San Pedro de Atacama, Chile</td><td>March 6-13, 2027</td>
      <td>Backpacking, Rock Climbing</td><td>$2800</td><td>All Penn UGR Students</td></tr>
  <tr><td><a href="https://apply.test/brochure?programid=4">[WLV] UGR Wissahickon - Venture X</a></td>
      <td>Venture X</td><td>Philadelphia</td><td>Oct. 16, 2026</td><td>Hiking</td><td>Free</td><td>Wharton</td></tr>
  <tr><td>LGST:2600 Environmental Leadership</td><td>.5 Course</td><td>PHL</td><td>March 6-11, 2027</td>
      <td>Ethics</td><td>$900</td><td>All</td></tr>
</table>
<table>
  <tr><td>Venture</td><td>Heavy Pack</td><td>Altitude</td></tr>
  <tr><td>Atacama Desert</td><td>X</td><td>X</td></tr>
</table>
"""

DETAILS = {
    "expeditions": {
        "antarctica": {"match": "Antarctica", "settings": ["snow"], "gearNeeds": {"items": ["bag"]}},
        "small-crew": {"match": "Small Crew", "settings": ["ocean"], "gearNeeds": {"items": ["jacket"]}},
        "atacama": {"match": "Atacama", "settings": ["desert"], "gearNeeds": {"items": ["pack"]}},
    }
}

ROBOTS_OK = "User-agent: *\nDisallow:\n"


def site(pages):
    def get(url):
        return pages.get(url, (404, ""))

    return get


def live_pages():
    return {
        ue.SITE + "/robots.txt": (200, ROBOTS_OK),
        ue.SOURCES["mba"]: (200, MBA_PAGE),
        ue.SOURCES["undergrad"]: (200, UNDERGRAD_PAGE),
    }


def run_build(pages=None, previous=None):
    return ue.build(previous or {"expeditions": []}, DETAILS, site(pages or live_pages()), TODAY)


def trip(data, trip_id):
    return next(t for t in data["expeditions"] if t["id"] == trip_id)


class Reading(unittest.TestCase):
    def test_keeps_only_expeditions(self):
        data, problems = run_build()
        self.assertEqual(problems, {})
        self.assertEqual(
            sorted(t["id"] for t in data["expeditions"]),
            ["mba-antarctica", "mba-small-crew-sailing", "undergrad-atacama-desert"],
        )

    def test_reads_listing_facts(self):
        data, _ = run_build()
        antarctica = trip(data, "mba-antarctica")
        self.assertEqual(antarctica["name"], "Antarctica")
        self.assertEqual(antarctica["location"], "King George Island, Antarctica")
        self.assertEqual(antarctica["cost"], 8400)
        self.assertEqual(antarctica["openTo"], "MBA / WEMBA")
        self.assertEqual(antarctica["url"], "https://apply.test/brochure?programid=1")
        self.assertEqual(antarctica["focus"], ["Backpacking", "Glacier travel", "Navigation"])
        self.assertEqual(data["portfolio"], "2026-27")

    def test_cost_with_comma_and_free(self):
        self.assertEqual(ue.parse_cost("$4,600"), 4600)
        self.assertEqual(ue.parse_cost("Free"), 0)
        self.assertIsNone(ue.parse_cost("TBA"))

    def test_cleans_names(self):
        self.assertEqual(
            ue.clean_name("[WLV] MBA Vodudahue Cloud Forest- Patagonia Expedition"),
            "Vodudahue Cloud Forest - Patagonia",
        )

    def test_only_https_links_are_kept(self):
        self.assertIsNone(ue.safe_link("javascript:alert(1)", ue.SOURCES["mba"]))
        self.assertIsNone(ue.safe_link("http://apply.test/x", ue.SOURCES["mba"]))
        self.assertEqual(ue.safe_link("/x", ue.SOURCES["mba"]), ue.SITE + "/x")

    def test_page_without_a_portfolio_heading_is_an_error(self):
        with self.assertRaises(ue.ReadError):
            ue.read_program("mba", MBA_PAGE.replace("Venture Portfolio", "Stuff"), ue.SOURCES["mba"], DETAILS)


class Dates(unittest.TestCase):
    def test_exact_dates_use_the_last_day(self):
        self.assertEqual(ue.ends_by("March 6-13, 2027", 2026), "2027-03-13")
        self.assertEqual(ue.ends_by("Dec. 28 2026 - Jan. 5, 2027", 2026), "2027-01-05")

    def test_breaks_use_the_end_of_the_usual_month(self):
        self.assertEqual(ue.ends_by("Fall Break", 2026), "2026-10-31")
        self.assertEqual(ue.ends_by("Winter Break", 2026), "2027-01-31")
        self.assertEqual(ue.ends_by("Spring Break", 2026), "2027-03-31")

    def test_unknown_dates_stay_unknown(self):
        self.assertIsNone(ue.ends_by("TBA", 2026))


class Traits(unittest.TestCase):
    def test_chart_with_one_column_per_trip(self):
        data, _ = run_build()
        self.assertEqual(trip(data, "mba-antarctica")["traits"], ["heavyPack"])
        self.assertEqual(trip(data, "mba-small-crew-sailing")["traits"], ["seaSickness"])

    def test_chart_with_one_row_per_trip(self):
        data, _ = run_build()
        self.assertEqual(trip(data, "undergrad-atacama-desert")["traits"], ["altitude", "heavyPack"])


class Details(unittest.TestCase):
    def test_known_trip_gets_our_tags_and_estimates(self):
        data, _ = run_build()
        antarctica = trip(data, "mba-antarctica")
        self.assertEqual(antarctica["settings"], ["snow"])
        self.assertEqual(antarctica["gearNeeds"], {"items": ["bag"]})
        self.assertFalse(antarctica["needsReview"])

    def test_new_trip_is_listed_with_guessed_settings_and_flagged(self):
        pages = live_pages()
        pages[ue.SOURCES["mba"]] = (
            200,
            MBA_PAGE.replace("[WLV] MBA Antarctica Expedition", "[WLV] MBA Iceland Glacier Expedition").replace(
                "King George Island, Antarctica", "Vatnajokull, Iceland"
            ),
        )
        data, _ = run_build(pages)
        new_trip = trip(data, "mba-iceland-glacier")
        self.assertTrue(new_trip["needsReview"])
        self.assertIsNone(new_trip["gearNeeds"])
        self.assertIn("snow", new_trip["settings"])
        self.assertIn("mba-iceland-glacier", ue.review_markdown(data, {}))

    def test_real_details_file_is_valid(self):
        details = json.loads(ue.DETAILS_FILE.read_text(encoding="utf-8"))
        allowed_items = {"bag", "pad", "pack", "jacket", "shoes", "headlamp"}
        for key, entry in details["expeditions"].items():
            self.assertTrue(entry["match"], key)
            self.assertLessEqual(set(entry["settings"]), set(ue.SETTING_WORDS), key)
            needs = entry["gearNeeds"]
            self.assertLessEqual(set(needs["items"]), allowed_items, key)
            self.assertIn(needs["terrain"], ("light", "backpacking", "offtrail"), key)
            self.assertIn(needs["rainLikelihood"], ("casual", "regular", "sustained"), key)
            self.assertIn(needs["headlampUse"], ("camp", "backpacking", "technical"), key)
            self.assertIsInstance(needs["coldestTempF"], int, key)
            self.assertIsInstance(needs["tripLengthNights"], int, key)


class Safety(unittest.TestCase):
    def previous(self):
        data, _ = run_build()
        data["updated"] = "2026-11-01"
        return data

    def test_unreadable_page_keeps_the_last_good_list(self):
        pages = live_pages()
        pages[ue.SOURCES["mba"]] = (503, "")
        data, problems = run_build(pages, self.previous())
        self.assertIn("mba", problems)
        self.assertEqual(trip(data, "mba-antarctica")["cost"], 8400)

    def test_redesigned_page_keeps_the_last_good_list(self):
        pages = live_pages()
        pages[ue.SOURCES["mba"]] = (200, "<h2>2026-27 Venture Portfolio</h2><p>New look!</p>")
        data, problems = run_build(pages, self.previous())
        self.assertIn("mba", problems)
        self.assertEqual(len(data["expeditions"]), 3)

    def test_sudden_big_drop_is_held(self):
        previous = self.previous()
        for number in range(6):
            extra = dict(trip(previous, "mba-antarctica"), id="mba-extra-{}".format(number))
            previous["expeditions"].append(extra)
        data, problems = run_build(live_pages(), previous)
        self.assertIn("mba", problems)
        self.assertIn("mba-extra-0", [t["id"] for t in data["expeditions"]])

    def test_removed_trip_drops_out(self):
        previous = self.previous()
        previous["expeditions"].append(dict(trip(previous, "mba-antarctica"), id="mba-old-trip"))
        data, problems = run_build(live_pages(), previous)
        self.assertEqual(problems, {})
        self.assertNotIn("mba-old-trip", [t["id"] for t in data["expeditions"]])

    def test_robots_refusal_is_respected(self):
        pages = live_pages()
        pages[ue.SITE + "/robots.txt"] = (200, "User-agent: *\nDisallow: /")

        def get(url):
            if url in ue.SOURCES.values():
                self.fail("read a page robots.txt rules out")
            return pages.get(url, (404, ""))

        data, problems = ue.build(self.previous(), DETAILS, get, TODAY)
        self.assertEqual(set(problems), {"mba", "undergrad"})
        self.assertEqual(len(data["expeditions"]), 3)

    def test_date_only_changes_when_the_list_changes(self):
        previous = self.previous()
        data, _ = run_build(live_pages(), previous)
        self.assertEqual(data["updated"], "2026-11-01")
        pages = live_pages()
        pages[ue.SOURCES["mba"]] = (200, MBA_PAGE.replace("$8400", "$8500"))
        data, _ = run_build(pages, previous)
        self.assertEqual(data["updated"], TODAY.isoformat())

    def test_nothing_to_review_prints_nothing(self):
        data, _ = run_build()
        self.assertEqual(ue.review_markdown(data, {}), "")


if __name__ == "__main__":
    unittest.main()
