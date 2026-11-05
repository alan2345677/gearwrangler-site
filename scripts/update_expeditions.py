#!/usr/bin/env python3
"""Weekly refresh of the Wharton Leadership Ventures expedition list.

Reads the public undergraduate and MBA pages, keeps the outdoor expeditions, adds
Gear Wrangler's own setting tags and gear estimates from scripts/expedition_details.json,
and writes expeditions.json, which the site loads in the browser.

If a page can't be read, or suddenly lists far fewer trips, the last good list for that
program stays in place and the problem is reported. See EXPEDITIONS.md.

Uses only the Python standard library, so there is nothing to install.
"""

import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FILE = ROOT / "expeditions.json"
DETAILS_FILE = ROOT / "scripts" / "expedition_details.json"
REVIEW_FILE = ROOT / "scripts" / "expeditions-review.json"

SITE = "https://leadership.wharton.upenn.edu"
SOURCES = {
    "undergrad": SITE + "/undergrad-ventures/",
    "mba": SITE + "/mba-leadership-ventures/",
}

USER_AGENT = "GearWrangler-ExpeditionCheck/1.0 (+https://gearwrangler-site.vercel.app)"
REQUEST_DELAY_SECONDS = 1.0
REQUEST_TIMEOUT_SECONDS = 25

# A program losing more than half its trips at once is more likely a page redesign
# than a real change, so it needs a person to look before the site changes.
MIN_SHARE_OF_PREVIOUS = 0.5

TRAITS = {
    "heavy pack": "heavyPack",
    "12+ hour day": "longDays",
    "altitude": "altitude",
    "irregular sleep": "irregularSleep",
    "sea sickness": "seaSickness",
    "cold weather": "coldWeather",
    "long trek": "longTrek",
}

# Used only for a trip that has no entry in expedition_details.json yet.
SETTING_WORDS = {
    "mountains": ("mountain", "summit", "alps", "andes", "climb", "trek", "altitude"),
    "ocean": ("sail", "ocean", "sea", "kayak", "coast", "island"),
    "desert": ("desert", "atacama", "canyon"),
    "forest": ("forest", "river", "raft", "jungle"),
    "snow": ("snow", "glacier", "ice", "antarctic", "ski"),
}

MONTHS = {
    name: number
    for number, names in enumerate(
        (
            ("jan", "january"),
            ("feb", "february"),
            ("mar", "march"),
            ("apr", "april"),
            ("may",),
            ("jun", "june"),
            ("jul", "july"),
            ("aug", "august"),
            ("sep", "sept", "september"),
            ("oct", "october"),
            ("nov", "november"),
            ("dec", "december"),
        ),
        start=1,
    )
    for name in names
}


class ReadError(Exception):
    """A page couldn't be read, or didn't contain what we expected."""


class TableReader(HTMLParser):
    """Collects each table as a list of rows. Each cell is (text, first link)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.text = []
        self._row = None
        self._cell = None
        self._link = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append([])
        elif tag == "tr" and self.tables:
            self._row = []
            self.tables[-1].append(self._row)
        elif tag in ("td", "th") and self._row is not None:
            self._close_cell()
            self._cell = []
            self._link = None
        elif tag == "a" and self._cell is not None and self._link is None:
            self._link = dict(attrs).get("href")

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self._close_cell()
        elif tag == "tr":
            self._close_cell()
            self._row = None

    def handle_data(self, data):
        self.text.append(data)
        if self._cell is not None:
            self._cell.append(data)

    def _close_cell(self):
        if self._cell is not None and self._row is not None:
            self._row.append((" ".join("".join(self._cell).split()), self._link))
        self._cell = None
        self._link = None


def read_tables(html):
    reader = TableReader()
    reader.feed(html)
    return [table for table in reader.tables if table], " ".join(" ".join(reader.text).split())


def header_of(table):
    return [cell[0].lower() for cell in table[0]]


def portfolio_years(page_text):
    """Returns (2026, "2026-27") from a heading such as "2026-27 Venture Portfolio"."""
    found = re.search(r"\b(20\d{2})\s*[-–]\s*(\d{2})\s+Venture Portfolio", page_text)
    if not found:
        raise ReadError('no "Venture Portfolio" heading')
    return int(found.group(1)), "{}-{}".format(found.group(1), found.group(2))


def clean_name(raw):
    name = re.sub(r"\[WLV\]", "", raw)
    name = re.sub(r"^\s*(MBA|UGR)\b", "", name)
    name = re.sub(r"\s*-\s*", " - ", name)
    name = re.sub(r"\s+Expedition\s*$", "", name)
    return " ".join(name.split())


def parse_cost(raw):
    if raw.strip().lower() == "free":
        return 0
    found = re.search(r"\$\s*([\d,]+)", raw)
    return int(found.group(1).replace(",", "")) if found else None


def split_focus(raw):
    parts = [part.strip() for part in re.split(r",| and ", raw) if part.strip()]
    return [part[0].upper() + part[1:] for part in parts]


def ends_by(raw, start_year):
    """The date after which a trip is over, or None if the listing doesn't say.

    A break with no exact dates gets the end of the month it usually falls in.
    """
    lowered = raw.lower()
    if "fall break" in lowered:
        return dt.date(start_year, 10, 31).isoformat()
    if "winter break" in lowered:
        return dt.date(start_year + 1, 1, 31).isoformat()
    if "spring break" in lowered:
        return dt.date(start_year + 1, 3, 31).isoformat()
    pattern = r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?(?:st|nd|rd|th)?,?\s+(20\d{2})"
    matches = [m for m in re.finditer(pattern, raw) if m.group(1).lower() in MONTHS]
    if not matches:
        return None
    last = matches[-1]
    day = int(last.group(3) or last.group(2))
    try:
        return dt.date(int(last.group(4)), MONTHS[last.group(1).lower()], day).isoformat()
    except ValueError:
        return None


def safe_link(href, page_url):
    if not href:
        return None
    url = urljoin(page_url, href)
    return url if urlsplit(url).scheme == "https" else None


def read_trips(tables, page_url):
    """Finds expedition rows. Intensives, courses, and one-day events are left out."""
    trips = []
    for table in tables:
        columns = header_of(table)
        if not {"venture", "location", "dates", "cost"} <= set(columns):
            continue
        at = {name: index for index, name in enumerate(columns)}
        for row in table[1:]:
            if len(row) < len(columns):
                continue
            cell = lambda name: row[at[name]][0] if name in at else ""
            if "type" in at and cell("type").lower() != "expedition":
                continue
            raw_name = cell("venture")
            if "expedition" not in raw_name.lower() and "type" not in at:
                continue
            trips.append(
                {
                    "rawName": raw_name,
                    "name": clean_name(raw_name),
                    "location": cell("location"),
                    "when": cell("dates"),
                    "focus": split_focus(cell("focus")),
                    "cost": parse_cost(cell("cost")),
                    "openTo": cell("open to"),
                    "url": safe_link(row[at["venture"]][1], page_url),
                }
            )
    return trips


def read_trait_chart(tables):
    """Returns {column or row label: set of traits} from Wharton's characteristics chart.

    The MBA chart has one column per trip. The undergraduate chart has one row per trip.
    """
    chart = {}
    for table in tables:
        columns = header_of(table)
        if columns and columns[0] == "characteristic":
            labels = [cell[0] for cell in table[0]]
            for row in table[1:]:
                trait = TRAITS.get(row[0][0].lower())
                for index, cell in enumerate(row[1:], start=1):
                    if trait and cell[0].strip() and index < len(labels):
                        chart.setdefault(labels[index], set()).add(trait)
                for label in labels[1:]:
                    chart.setdefault(label, set())
        elif columns and columns[0] == "venture" and any(c in TRAITS for c in columns):
            for row in table[1:]:
                traits = chart.setdefault(row[0][0], set())
                for index, cell in enumerate(row[1:], start=1):
                    trait = TRAITS.get(columns[index]) if index < len(columns) else None
                    if trait and cell[0].strip():
                        traits.add(trait)
    return chart


def words(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def traits_for(name, chart):
    trip_words = set(words(name))
    for label, traits in chart.items():
        label_words = words(label)
        if label_words and set(label_words) <= trip_words:
            return sorted(traits)
    return None


def details_for(trip, details):
    haystack = set(words(trip["name"] + " " + trip["location"]))
    for entry in details["expeditions"].values():
        if set(words(entry["match"])) <= haystack:
            return entry
    return None


def infer_settings(trip):
    text = " ".join([trip["name"], trip["location"]] + trip["focus"]).lower()
    return [s for s, hints in SETTING_WORDS.items() if any(hint in text for hint in hints)]


def slug(text):
    return "-".join(words(text))


def read_program(program, html, page_url, details):
    tables, page_text = read_tables(html)
    start_year, portfolio = portfolio_years(page_text)
    chart = read_trait_chart(tables)
    trips = read_trips(tables, page_url)
    if not trips:
        raise ReadError("no expedition rows found")
    finished = []
    for trip in trips:
        entry = details_for(trip, details)
        traits = traits_for(trip["name"], chart)
        finished.append(
            {
                "id": "{}-{}".format(program, slug(trip["name"])),
                "program": program,
                "name": trip["name"],
                "location": trip["location"],
                "when": trip["when"],
                "endsBy": ends_by(trip["when"], start_year),
                "focus": trip["focus"],
                "cost": trip["cost"],
                "openTo": trip["openTo"],
                "url": trip["url"] or page_url,
                "traits": traits or [],
                "settings": entry["settings"] if entry else infer_settings(trip),
                "gearNeeds": entry["gearNeeds"] if entry else None,
                "needsReview": entry is None or traits is None,
            }
        )
    return portfolio, finished


def fetch(url):
    """Returns (HTTP status, page text). Status 0 means no connection."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, ""
    except Exception:
        return 0, ""


def can_read(url, get):
    status, text = get(SITE + "/robots.txt")
    robots = urllib.robotparser.RobotFileParser()
    if status == 200:
        robots.parse(text.splitlines())
    else:
        robots.allow_all = True
    return robots.can_fetch(USER_AGENT, url)


def check_program(program, url, get, details, previous_trips):
    """Returns (portfolio or None, trips, problem or None)."""
    try:
        if not can_read(url, get):
            raise ReadError("robots.txt asks us not to read this page")
        status, html = get(url)
        if status != 200:
            raise ReadError("page returned {}".format(status or "no connection"))
        portfolio, trips = read_program(program, html, url, details)
    except ReadError as err:
        return None, previous_trips, str(err)
    if len(trips) < len(previous_trips) * MIN_SHARE_OF_PREVIOUS:
        problem = "found {} trips, down from {}".format(len(trips), len(previous_trips))
        return None, previous_trips, problem
    return portfolio, trips, None


def build(previous, details, get, today):
    """Returns (data for expeditions.json, problems by program)."""
    old_trips = previous.get("expeditions", [])
    trips = []
    problems = {}
    portfolio = previous.get("portfolio")
    for program, url in SOURCES.items():
        old = [trip for trip in old_trips if trip["program"] == program]
        found_portfolio, found, problem = check_program(program, url, get, details, old)
        trips.extend(found)
        if problem:
            problems[program] = problem
        if found_portfolio:
            portfolio = found_portfolio

    data = {
        "updated": previous.get("updated"),
        "portfolio": portfolio,
        "source": {name: url for name, url in SOURCES.items()},
        "expeditions": trips,
    }
    without_date = lambda d: {k: v for k, v in d.items() if k != "updated"}
    if without_date(data) != without_date(previous):
        data["updated"] = today.isoformat()
    return data, problems


def review_markdown(data, problems):
    unknown = [trip for trip in data["expeditions"] if trip.get("needsReview")]
    if not unknown and not problems:
        return ""
    lines = []
    if problems:
        lines.append("## Pages that couldn't be read\n")
        lines.append("The last good list for these programs is still on the site.\n")
        for program, problem in problems.items():
            lines.append("- `{}`: {} ({})".format(program, problem, SOURCES[program]))
        lines.append("")
    if unknown:
        lines.append("## Trips to review\n")
        lines.append(
            "These are listed on the site, but need an entry in "
            "`scripts/expedition_details.json` or a match in Wharton's characteristics chart.\n"
        )
        for trip in unknown:
            lines.append("- `{}`: {} ({})".format(trip["id"], trip["name"], trip["url"]))
    return "\n".join(lines) + "\n"


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--review", action="store_true", help="Print what needs a person to look.")
    args = parser.parse_args()

    if args.review:
        saved = read_json(REVIEW_FILE, {})
        print(review_markdown(read_json(OUTPUT_FILE, {"expeditions": []}), saved.get("problems", {})))
        return 0

    first = [True]

    def polite_get(url):
        if not first[0]:
            time.sleep(REQUEST_DELAY_SECONDS)
        first[0] = False
        return fetch(url)

    details = read_json(DETAILS_FILE, None)
    if details is None:
        print("Can't read {}".format(DETAILS_FILE), file=sys.stderr)
        return 1
    previous = read_json(OUTPUT_FILE, {"expeditions": []})
    data, problems = build(previous, details, polite_get, dt.date.today())
    write_json(OUTPUT_FILE, data)
    write_json(REVIEW_FILE, {"problems": problems})

    trips = data["expeditions"]
    print("{} expeditions: {} undergraduate, {} MBA".format(
        len(trips),
        sum(trip["program"] == "undergrad" for trip in trips),
        sum(trip["program"] == "mba" for trip in trips),
    ))
    print("{} need review, {} pages couldn't be read".format(
        sum(bool(trip["needsReview"]) for trip in trips), len(problems)
    ))
    for program, problem in problems.items():
        print("  {}: {}".format(program, problem))
    return 0


if __name__ == "__main__":
    sys.exit(main())
