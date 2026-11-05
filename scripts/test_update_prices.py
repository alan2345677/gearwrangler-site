#!/usr/bin/env python3
"""Tests for the price tracker. Run with: python3 scripts/test_update_prices.py"""

import datetime as dt
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import update_prices as up  # noqa: E402

TODAY = dt.date(2026, 11, 5)


def variant(title, price, compare=None, available=True):
    return {
        "title": title,
        "price": int(price * 100),
        "compare_at_price": int(compare * 100) if compare else None,
        "available": available,
    }


def feed(*variants):
    return json.dumps({"variants": list(variants)})


def page(data):
    return '<script type="application/ld+json">{}</script>'.format(json.dumps(data))


class ProductList(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = up.SITE_FILE.read_text(encoding="utf-8")
        cls.products = up.load_products(cls.html)
        cls.ids = {p["id"] for p in cls.products}

    def test_finds_every_product_once(self):
        expected = len(re.findall(r"\{\s*id:'[^']+',\s*name:", self.html))
        self.assertGreater(expected, 50)
        self.assertEqual(len(self.products), expected)
        self.assertEqual(len(self.ids), expected)

    def test_keeps_names_with_apostrophes(self):
        names = {p["name"] for p in self.products}
        self.assertIn("Arc'teryx Beta SL", names)

    def test_rules_and_skips_refer_to_real_products(self):
        self.assertEqual(set(up.OPTION_RULES) - self.ids, set())
        self.assertEqual(set(up.SKIP) - self.ids, set())

    def test_amazon_searches_are_not_tracked(self):
        brs = next(p for p in self.products if p["id"] == "brs-3000t")
        self.assertIsNotNone(up.skip_reason(brs))


class StoreFeed(unittest.TestCase):
    def test_uses_matching_option_only(self):
        text = feed(variant("Regular", 210), variant("Regular Short", 200))
        self.assertEqual(up.read_store_feed(text, r"^Regular$"), (210, None))

    def test_missing_option_is_an_error_not_a_guess(self):
        with self.assertRaises(up.ReadError):
            up.read_store_feed(feed(variant("Large", 240)), r"^Regular$")

    def test_lowest_price_in_stock(self):
        text = feed(
            variant("Azul", 48, 80, available=False),
            variant("Graphite", 56, 80),
            variant("Bordeaux", 60, 80, available=False),
        )
        self.assertEqual(up.read_store_feed(text), (56, 80))

    def test_sold_out_price_still_counts(self):
        self.assertEqual(
            up.read_store_feed(feed(variant("x", 400, available=False))), (400, None)
        )

    def test_equal_original_price_is_not_a_sale(self):
        self.assertEqual(up.read_store_feed(feed(variant("x", 160, 160))), (160, None))

    def test_zero_price_is_an_error(self):
        with self.assertRaises(up.ReadError):
            up.read_store_feed(feed(variant("x", 0, available=False)))


class PageData(unittest.TestCase):
    def test_single_offer(self):
        html = page({"offers": {"price": "190", "priceCurrency": "USD"}})
        self.assertEqual(up.read_page(html), (190, None))

    def test_price_range_uses_low_price(self):
        html = page(
            {"offers": {"lowPrice": "535.00", "highPrice": "570.00", "priceCurrency": "USD"}}
        )
        self.assertEqual(up.read_page(html), (535, None))

    def test_prefers_in_stock(self):
        html = page(
            {
                "offers": [
                    {"price": 100, "priceCurrency": "USD", "availability": "https://schema.org/OutOfStock"},
                    {"price": 124, "priceCurrency": "USD", "availability": "https://schema.org/InStock"},
                ]
            }
        )
        self.assertEqual(up.read_page(html), (124, None))

    def test_other_currency_is_an_error(self):
        with self.assertRaises(up.ReadError):
            up.read_page(page({"offers": {"price": 949, "priceCurrency": "SEK"}}))

    def test_ignores_related_products(self):
        html = page(
            {
                "offers": {"price": 200, "priceCurrency": "USD"},
                "isRelatedTo": [{"offers": {"price": 5, "priceCurrency": "USD"}}],
            }
        )
        self.assertEqual(up.read_page(html), (200, None))

    def test_falls_back_to_page_tags(self):
        html = '<meta itemprop="price" content="129.98" />'
        self.assertEqual(up.read_page(html), (129.98, None))

    def test_reads_regular_price_from_page_tags(self):
        html = (
            '<span class="price" id="old-price-3815">\n'
            '  <span class="price">$259.95</span> </span>'
            '<meta itemprop="price" content="129.98" />'
        )
        self.assertEqual(up.read_page(html), (129.98, 259.95))

    def test_no_price_is_an_error(self):
        with self.assertRaises(up.ReadError):
            up.read_page("<html></html>")


class Holding(unittest.TestCase):
    def test_small_change_goes_live(self):
        self.assertIsNone(up.hold_reason(319, None, None, 260))

    def test_big_jump_is_held(self):
        self.assertIn("1205", up.hold_reason(1205, None, None, 700))

    def test_big_unexplained_drop_is_held(self):
        self.assertIsNotNone(up.hold_reason(130, None, None, 240))

    def test_wrong_currency_size_jump_is_held(self):
        self.assertIsNotNone(up.hold_reason(949, None, None, 90))

    def test_store_listed_regular_price_explains_big_sale(self):
        self.assertIsNone(up.hold_reason(48, 80, None, 80))

    def test_store_listed_price_that_does_not_match_is_held(self):
        self.assertIsNotNone(up.hold_reason(48, 500, None, 80))

    def test_price_returning_after_sale_is_not_held(self):
        on_sale = up.build_entry(56, 80, None, TODAY)
        self.assertIsNone(up.hold_reason(80, None, on_sale, 80))


class Entries(unittest.TestCase):
    def test_rounds_to_whole_dollars(self):
        self.assertEqual(up.build_entry(49.95, None, None, TODAY)["price"], 50)

    def test_store_listed_sale(self):
        entry = up.build_entry(56, 80, None, TODAY)
        self.assertEqual((entry["wasPrice"], entry["saleLabel"]), (80, "On sale"))

    def test_first_reading_makes_no_sale_claim(self):
        entry = up.build_entry(190, None, None, TODAY)
        self.assertNotIn("wasPrice", entry)

    def test_drop_from_recent_peak(self):
        before = up.build_entry(200, None, None, TODAY - dt.timedelta(days=10))
        entry = up.build_entry(170, None, before, TODAY)
        self.assertEqual((entry["wasPrice"], entry["saleLabel"]), (200, "Price drop"))

    def test_tiny_drop_gets_no_tag(self):
        before = up.build_entry(200, None, None, TODAY - dt.timedelta(days=10))
        self.assertNotIn("wasPrice", up.build_entry(195, None, before, TODAY))

    def test_old_peak_expires(self):
        before = up.build_entry(200, None, None, TODAY - dt.timedelta(days=91))
        entry = up.build_entry(170, None, before, TODAY)
        self.assertNotIn("wasPrice", entry)
        self.assertEqual(entry["peak"], 170)

    def test_sale_ending_clears_the_tag(self):
        on_sale = up.build_entry(56, 80, None, TODAY - dt.timedelta(days=5))
        self.assertNotIn("wasPrice", up.build_entry(80, None, on_sale, TODAY))


class Stores(unittest.TestCase):
    PRODUCTS = [
        {"id": "a", "name": "A", "source": "brand", "price": 100, "url": "https://s.test/a"},
        {"id": "b", "name": "B", "source": "brand", "price": 100, "url": "https://s.test/b"},
        {"id": "c", "name": "C", "source": "brand", "price": 100, "url": "https://s.test/c"},
    ]
    PAGE = page({"offers": {"price": 100, "priceCurrency": "USD"}})

    def run_with(self, responses):
        calls = []

        def fake_fetch(url):
            calls.append(url)
            return responses(url)

        original, up.fetch = up.fetch, fake_fetch
        delay, up.REQUEST_DELAY_SECONDS = up.REQUEST_DELAY_SECONDS, 0
        try:
            return up.check_store(self.PRODUCTS), calls
        finally:
            up.fetch, up.REQUEST_DELAY_SECONDS = original, delay

    def test_store_that_does_not_answer_is_tried_only_once(self):
        results, calls = self.run_with(lambda url: (0, ""))
        self.assertEqual(len(calls), 1)
        self.assertEqual(str(results["c"]), "no connection")

    def test_store_that_refuses_mid_run_is_left_alone(self):
        def responses(url):
            return (200, "") if url.endswith("robots.txt") else (403, "")

        results, calls = self.run_with(responses)
        self.assertEqual(len(calls), 2)
        self.assertIn("refused", str(results["b"]))

    def test_one_missing_page_does_not_stop_the_others(self):
        def responses(url):
            if url.endswith("robots.txt"):
                return 404, ""
            return (404, "") if url.endswith("/a") else (200, self.PAGE)

        results, _ = self.run_with(responses)
        self.assertIn("error (404)", str(results["a"]))
        self.assertEqual(results["b"], (100, None))

    def test_respects_robots_txt(self):
        def responses(url):
            if url.endswith("robots.txt"):
                return 200, "User-agent: *\nDisallow: /"
            self.fail("fetched a page robots.txt rules out")

        results, _ = self.run_with(responses)
        self.assertIn("robots.txt", str(results["a"]))

    def test_one_page_without_a_price_does_not_stop_the_others(self):
        def responses(url):
            if url.endswith("robots.txt"):
                return 404, ""
            return (200, "<html></html>") if url.endswith("/a") else (200, self.PAGE)

        results, _ = self.run_with(responses)
        self.assertIsInstance(results["a"], up.ReadError)
        self.assertEqual(results["b"], (100, None))
        self.assertEqual(results["c"], (100, None))


class Applying(unittest.TestCase):
    PRODUCTS = [
        {"id": "a", "name": "A", "source": "brand", "price": 100, "url": "https://a.test/a"},
        {"id": "b", "name": "B", "source": "brand", "price": 100, "url": "https://a.test/b"},
        {"id": "c", "name": "C", "source": "brand", "price": 100, "url": "https://a.test/c"},
        {"id": "d", "name": "D", "source": "amazon", "price": 100, "url": "https://amazon.com/s?k=d"},
    ]

    def test_sorts_readings(self):
        readings = {"a": (110, None), "b": (500, None), "c": up.ReadError("blocked")}
        entries, held, not_read, not_tracked = up.apply_readings(
            self.PRODUCTS, readings, {}, TODAY
        )
        self.assertEqual(list(entries), ["a"])
        self.assertEqual([h["id"] for h in held], ["b"])
        self.assertEqual([n["id"] for n in not_read], ["c"])
        self.assertEqual([n["id"] for n in not_tracked], ["d"])

    def test_keeps_last_good_price_when_a_store_fails_or_is_held(self):
        old = up.build_entry(105, None, None, TODAY - dt.timedelta(days=1))
        readings = {"a": up.ReadError("blocked"), "b": (900, None), "c": (100, None)}
        entries, _, _, _ = up.apply_readings(
            self.PRODUCTS, readings, {"a": old, "b": old}, TODAY
        )
        self.assertEqual(entries["a"], old)
        self.assertEqual(entries["b"], old)

    def test_removed_products_drop_out(self):
        old = up.build_entry(100, None, None, TODAY)
        entries, _, _, _ = up.apply_readings(
            self.PRODUCTS, {"a": (100, None)}, {"gone": old}, TODAY
        )
        self.assertNotIn("gone", entries)


if __name__ == "__main__":
    unittest.main()
