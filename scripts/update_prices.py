#!/usr/bin/env python3
"""Daily price check for Gear Wrangler.

Reads the product list from index.html, asks each store for its current price,
and writes the results to prices.json, which the site loads in the browser.
Readings that look wrong are held in scripts/prices-review.json instead of going
live. See PRICE-TRACKER.md for how to run it and how to review held prices.

Uses only the Python standard library, so there is nothing to install.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE_FILE = ROOT / "index.html"
PRICES_FILE = ROOT / "prices.json"
REVIEW_FILE = ROOT / "scripts" / "prices-review.json"

# Says plainly what this is. Stores that refuse it are left alone, not worked around.
USER_AGENT = "GearWrangler-PriceCheck/1.0 (+https://gearwrangler-site.vercel.app)"
REQUEST_DELAY_SECONDS = 1.0  # Pause between requests to the same store.
REQUEST_TIMEOUT_SECONDS = 20
MAX_STORES_AT_ONCE = 8
REFUSED_STATUSES = (401, 403, 429)

HOLD_LIMIT = 0.35        # A move bigger than this needs a person to check it.
MIN_DISCOUNT = 0.05      # Smaller gaps than this don't earn a sale tag.
PEAK_WINDOW_DAYS = 90    # "Price drop" compares with the highest price in this window.

# Some store pages sell several versions at different prices. These pick the option
# that matches what the site describes, using the store's option name. If a store
# renames an option, the product is reported as unread rather than given a wrong price.
OPTION_RULES = {
    "nemo-tensor-all-season": r"^Regular Mummy$",
    "thermarest-neoair-xlite-nxt": r"^Regular$",
    "thermarest-neoair-xtherm-nxt": r"^Regular$",
    "bigagnes-rapide-sl": r'^20" x 72"$',
    "nemo-eclipse-all-season": r"^Regular$",
    "seatosummit-etherlight-xr": r"^Regular$",
    "thermarest-zlite-sol": r"/ Regular$",
    "feathered-friends-swallow-20": r"^20 Degree / Regular",
    "seatosummit-spark-15": r"^15°F / Regular$",
    "kelty-cosmic-20": r"^Regular$",
    "nemo-dagger-osmo-2p": r"^2-Person$",
    "nemo-dagger-osmo-3p": r"^3-Person$",
    "hyperlite-southwest-55": r"^55L",
    "platypus-gravityworks-4l": r"^4\.0 liter$",
    "bigagnes-rapide-sl-double": r'^40" x 72"$',
    "bigagnes-flycreek-ul-quilt": r"^Regular$",
    "seatosummit-etherlight-xr-pro": r"^Regular$",
    "seatosummit-telos-tr2": r"^TR2$",
    "thermarest-neoloft": r"^Regular$",
    "nemo-disco-15": r"15℉ / Regular$",
    "nemo-hornet-osmo-1p": r"^1-Person$",
}

# Products that shouldn't be tracked, and why.
SKIP = {
    "primus-express-spider": "store lists prices in Swedish kronor",
    "primus-primetech-1-3l": "store lists prices in Swedish kronor",
    "hoka-speedgoat5": "only out-of-stock listings at this store",
    "biolite-800": "store now sells the 800 Pro, a different model at a different price",
}

PRODUCT_PATTERN = re.compile(
    r"\{\s*id:'(?P<id>[^']+)',\s*name:(?:'(?P<name1>[^']*)'|\"(?P<name2>[^\"]*)\"),"
    r".*?\bsource:'(?P<source>\w+)'"
    r".*?\bprice:(?P<price>\d+(?:\.\d+)?)"
    r".*?\bpriceUrl:'(?P<url>[^']+)'",
    re.S,
)
JSON_LD_PATTERN = re.compile(
    r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", re.S | re.I
)


class ReadError(Exception):
    """A store didn't provide a usable price. The message says why."""


def load_products(html):
    """Returns the site's products: id, name, source, price, and store link."""
    products = []
    for m in PRODUCT_PATTERN.finditer(html):
        products.append(
            {
                "id": m["id"],
                "name": m["name1"] or m["name2"],
                "source": m["source"],
                "price": float(m["price"]),
                "url": m["url"],
            }
        )
    return products


def skip_reason(product):
    """Returns why a product isn't tracked, or None if it is."""
    if product["source"] == "amazon" or "amazon.com" in product["url"]:
        return "links to an Amazon search, not one product"
    return SKIP.get(product["id"])


# ---------- Reading prices ----------


def read_store_feed(text, option_rule=None):
    """Reads a Shopify store's product data. Returns (price, original price or None)."""
    try:
        variants = json.loads(text).get("variants") or []
    except (ValueError, AttributeError):
        raise ReadError("store data couldn't be read")
    if option_rule:
        variants = [v for v in variants if re.search(option_rule, v.get("title") or "")]
        if not variants:
            raise ReadError("expected product option not found")
    priced = [v for v in variants if v.get("price")]
    if not priced:
        raise ReadError("store shows no price")
    # Use what someone can actually buy. If it's all sold out, the price still stands.
    candidates = [v for v in priced if v.get("available")] or priced
    best = min(candidates, key=lambda v: v["price"])
    price = best["price"] / 100
    original = (best.get("compare_at_price") or 0) / 100
    return price, original if original > price else None


def _collect_offers(node, offers):
    if isinstance(node, list):
        for item in node:
            _collect_offers(item, offers)
    elif isinstance(node, dict):
        amounts = []
        for key in ("price", "lowPrice"):
            try:
                amounts.append(float(str(node[key]).replace(",", "")))
            except (KeyError, ValueError):
                pass
        amounts = [a for a in amounts if a > 0]
        if amounts:
            offers.append(
                {
                    "price": min(amounts),
                    "currency": node.get("priceCurrency"),
                    "in_stock": "OutOfStock" not in str(node.get("availability", "")),
                }
            )
        # Only follow the product's own offers, not related products on the page.
        for key in ("offers", "@graph", "hasVariant"):
            if key in node:
                _collect_offers(node[key], offers)


def read_page(html):
    """Reads a price from a product page. Returns (price, original price or None)."""
    original = None
    offers = []
    for block in JSON_LD_PATTERN.findall(html):
        try:
            _collect_offers(json.loads(block.strip()), offers)
        except ValueError:
            continue
    if not offers:
        amount = re.search(
            r'(?:itemprop="price"|product:price:amount")[^>]*content="([\d.,]+)"', html
        )
        currency = re.search(r'product:price:currency"[^>]*content="(\w+)"', html)
        if amount:
            value = float(amount.group(1).replace(",", ""))
            if value > 0:
                offers.append(
                    {
                        "price": value,
                        "currency": currency.group(1) if currency else None,
                        "in_stock": True,
                    }
                )
        regular = re.search(
            r'id="old-price-\d+"[^>]*>\s*(?:<span[^>]*>\s*)?\$([\d.,]+)', html
        )
        if regular:
            original = float(regular.group(1).replace(",", ""))
    if not offers:
        raise ReadError("no price found on the page")
    dollars = [o for o in offers if o["currency"] in (None, "USD")]
    if not dollars:
        raise ReadError("price isn't in US dollars")
    candidates = [o for o in dollars if o["in_stock"]] or dollars
    price = min(o["price"] for o in candidates)
    return price, original if original and original > price else None


# ---------- Deciding what goes live ----------


def whole_dollars(amount):
    return int(amount + 0.5)


def _within_limit(value, baseline):
    return baseline > 0 and abs(value - baseline) / baseline <= HOLD_LIMIT


def regular_price(previous, site_price):
    """The price a new reading is compared with."""
    if not previous:
        return site_price
    return max(
        previous["price"], previous.get("wasPrice") or 0, previous.get("peak") or 0
    )


def build_entry(price, original, previous, today):
    """Builds the prices.json entry for an accepted reading."""
    price = whole_dollars(price)
    original = whole_dollars(original) if original else None

    peak, peak_on = None, None
    if previous and previous.get("peak") and previous.get("peakOn"):
        age = (today - dt.date.fromisoformat(previous["peakOn"])).days
        if age <= PEAK_WINDOW_DAYS:
            peak, peak_on = previous["peak"], previous["peakOn"]
    if peak is None or price >= peak:
        peak, peak_on = price, today.isoformat()

    entry = {
        "price": price,
        "checkedOn": today.isoformat(),
        "peak": peak,
        "peakOn": peak_on,
    }
    threshold = price * (1 + MIN_DISCOUNT)
    if original and original >= threshold:
        entry["wasPrice"], entry["saleLabel"] = original, "On sale"
    elif peak >= threshold:
        entry["wasPrice"], entry["saleLabel"] = peak, "Price drop"
    return entry


def hold_reason(price, original, previous, site_price):
    """Returns why a reading should wait for a person to check it, or None if it's fine."""
    baseline = regular_price(previous, site_price)
    # A store's own "regular price" that matches ours explains a big discount.
    if original and _within_limit(whole_dollars(original), baseline):
        return None
    if _within_limit(whole_dollars(price), baseline):
        return None
    return "read ${} but expected about ${:.0f}".format(whole_dollars(price), baseline)


# ---------- Talking to stores ----------


def fetch(url):
    """Returns (HTTP status, page text). Status 0 means no connection."""
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US"}
    )
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as res:
                return res.status, res.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == 2:
                return err.code, ""
        except Exception:
            if attempt == 2:
                return 0, ""
        time.sleep(REQUEST_DELAY_SECONDS * 2)
    return 0, ""


def read_product(product, get, allowed):
    """Returns (price, original) for a product. Raises ReadError if it can't."""
    url = product["url"]
    parts = urlsplit(url)
    if "/products/" in parts.path:
        feed_url = "{}://{}{}.js".format(
            parts.scheme, parts.netloc, parts.path.rstrip("/")
        )
        if allowed(feed_url):
            status, text = get(feed_url)
            if status == 200:
                return read_store_feed(text, OPTION_RULES.get(product["id"]))
    if not allowed(url):
        raise ReadError("store's robots.txt asks automated checks to stay out")
    status, text = get(url)
    if status == 0:
        raise ReadError("no connection")
    if status in REFUSED_STATUSES:
        raise ReadError("store refused the check ({})".format(status))
    if status != 200:
        raise ReadError("page returned an error ({})".format(status))
    return read_page(text)


def check_store(products):
    """Reads every product at one store, one request at a time."""
    cache = {}
    first = [True]

    def get(url):
        if url not in cache:
            if not first[0]:
                time.sleep(REQUEST_DELAY_SECONDS)
            first[0] = False
            cache[url] = fetch(url)
        return cache[url]

    parts = urlsplit(products[0]["url"])
    robots = urllib.robotparser.RobotFileParser()
    status, text = get("{}://{}/robots.txt".format(parts.scheme, parts.netloc))
    # A store that won't answer or refuses us gets left alone for the rest of this run.
    if status == 0 or status in REFUSED_STATUSES:
        reason = "store refused the check ({})".format(status) if status else "no connection"
        return {product["id"]: ReadError(reason) for product in products}
    if status == 200:
        robots.parse(text.splitlines())
    else:
        robots.allow_all = True

    def allowed(url):
        return robots.can_fetch(USER_AGENT, url)

    results = {}
    gave_up = None
    for product in products:
        if gave_up:
            results[product["id"]] = gave_up
            continue
        try:
            results[product["id"]] = read_product(product, get, allowed)
        except ReadError as err:
            results[product["id"]] = err
            if str(err) == "no connection" or "refused" in str(err):
                gave_up = err
    return results


def check_all(products):
    stores = {}
    for product in products:
        stores.setdefault(urlsplit(product["url"]).netloc, []).append(product)
    results = {}
    with ThreadPoolExecutor(MAX_STORES_AT_ONCE) as pool:
        for store_results in pool.map(check_store, stores.values()):
            results.update(store_results)
    return results


# ---------- Files and reports ----------


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path, data):
    temp = path.with_suffix(".tmp")
    temp.write_text(
        json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)


def apply_readings(products, readings, previous_entries, today):
    """Turns store readings into the new prices and the review list."""
    entries, held, not_read, not_tracked = {}, [], [], []
    for product in products:
        pid = product["id"]
        previous = previous_entries.get(pid)
        if previous:
            entries[pid] = previous  # Keep the last good price unless replaced below.
        reason = skip_reason(product)
        if reason:
            not_tracked.append({"id": pid, "name": product["name"], "reason": reason})
            entries.pop(pid, None)
            continue
        reading = readings.get(pid, ReadError("not checked"))
        if isinstance(reading, ReadError):
            not_read.append({"id": pid, "name": product["name"], "reason": str(reading)})
            continue
        price, original = reading
        reason = hold_reason(price, original, previous, product["price"])
        if reason:
            held.append(
                {
                    "id": pid,
                    "name": product["name"],
                    "price": price,
                    "original": original,
                    "reason": reason,
                    "url": product["url"],
                }
            )
            continue
        entries[pid] = build_entry(price, original, previous, today)
    return entries, held, not_read, not_tracked


def review_markdown(review):
    lines = ["Price check on {}.".format(review["checkedOn"]), ""]
    summary = review["summary"]
    lines.append(
        "{updated} prices updated, {held} held for review, {not_read} couldn't be read, "
        "{not_tracked} not tracked.".format(**summary)
    )
    if review["held"]:
        lines += ["", "## Held for review", ""]
        lines.append("These stay at their previous price until someone checks them.")
        lines.append("")
        for item in review["held"]:
            lines.append(
                "- `{id}` **{name}**: {reason}. [Check the store]({url})".format(**item)
            )
        lines += [
            "",
            "To accept any that are correct, run this workflow by hand and enter their "
            "IDs, separated by commas, in the approve box.",
        ]
    if review["notRead"]:
        lines += ["", "## Couldn't be read", ""]
        for item in review["notRead"]:
            lines.append("- {name}: {reason}".format(**item))
    return "\n".join(lines) + "\n"


def approve(ids, today):
    """Accepts held readings a person has checked."""
    review = load_json(REVIEW_FILE, None)
    if not review:
        sys.exit("There's no review list yet. Run a price check first.")
    data = load_json(PRICES_FILE, {"products": {}})
    held = {item["id"]: item for item in review["held"]}
    for pid in ids:
        if pid not in held:
            sys.exit("{} isn't on the review list.".format(pid))
        item = held.pop(pid)
        data["products"][pid] = build_entry(
            item["price"], item["original"], data["products"].get(pid), today
        )
        print("Accepted {}: ${}".format(item["name"], data["products"][pid]["price"]))
    review["held"] = list(held.values())
    review["summary"]["held"] = len(review["held"])
    data["updatedOn"] = today.isoformat()
    write_json(PRICES_FILE, data)
    write_json(REVIEW_FILE, review)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--approve", help="comma-separated product IDs to accept from the review list"
    )
    parser.add_argument(
        "--review", action="store_true", help="print the latest review list and stop"
    )
    args = parser.parse_args()
    today = dt.datetime.now(dt.timezone.utc).date()

    if args.review:
        review = load_json(REVIEW_FILE, None)
        if not review:
            sys.exit("There's no review list yet. Run a price check first.")
        print(review_markdown(review), end="")
        return
    if args.approve:
        approve([i.strip() for i in args.approve.split(",") if i.strip()], today)
        return

    products = load_products(SITE_FILE.read_text(encoding="utf-8"))
    if not products:
        sys.exit("No products found in index.html, so nothing was changed.")
    previous = load_json(PRICES_FILE, {"products": {}})["products"]
    readings = check_all([p for p in products if not skip_reason(p)])

    if not any(isinstance(r, tuple) for r in readings.values()):
        sys.exit("No store could be read, so nothing was changed.")

    entries, held, not_read, not_tracked = apply_readings(
        products, readings, previous, today
    )
    review = {
        "checkedOn": today.isoformat(),
        "held": held,
        "notRead": not_read,
        "notTracked": not_tracked,
        "summary": {
            "updated": sum(
                1 for e in entries.values() if e["checkedOn"] == today.isoformat()
            ),
            "held": len(held),
            "not_read": len(not_read),
            "not_tracked": len(not_tracked),
        },
    }
    write_json(PRICES_FILE, {"updatedOn": today.isoformat(), "products": entries})
    write_json(REVIEW_FILE, review)

    report = review_markdown(review)
    print(report, end="")
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a", encoding="utf-8") as handle:
            handle.write(report)


if __name__ == "__main__":
    main()
