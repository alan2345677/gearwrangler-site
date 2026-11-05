# Expedition list

Once a week, Gear Wrangler reads the Wharton Leadership Ventures pages for [undergraduates](https://leadership.wharton.upenn.edu/undergrad-ventures/) and [MBA students](https://leadership.wharton.upenn.edu/mba-leadership-ventures/) and updates the trips in the expedition finder and in Gear Check.

## How it works

| File | What it does |
|---|---|
| `scripts/update_expeditions.py` | Reads both pages. It needs nothing installed except Python. |
| `scripts/expedition_details.json` | Gear Wrangler's own tags and gear estimates for each trip, kept by hand. |
| `expeditions.json` | The finished list. The site loads this file in the browser. |
| `.github/workflows/update-expeditions.yml` | Runs the check every Monday on GitHub and saves the results. |

Only expeditions are listed. Intensives, courses, and one-day events are left out. Trips that have already happened are hidden on the site automatically.

## What comes from Wharton, and what's an estimate

- **From Wharton's pages:** trip names, locations, dates, focus, cost, who can apply, the link to each trip, and Wharton's chart of trip characteristics (such as cold weather, altitude, and heavy packs).
- **Gear Wrangler's estimates:** the setting tags (mountains, ocean, and so on) and each trip's gear needs: coldest night, number of nights, terrain, rain, and headlamp use.

Wharton's pages don't publish gear lists or temperatures. Its public gear-list page links to lists from about 2018 to 2020, and nearly all of those links are broken. Wharton sends each trip's required gear list to confirmed participants, so the site tells people that list is the final word.

If you have a trip's real gear list, update that trip in `scripts/expedition_details.json`, then run the update by hand (see below).

## When something needs a person

GitHub opens an issue called "Expeditions to review" when:

- **A page can't be read,** or suddenly lists far fewer trips. The last good list stays on the site until it's fixed.
- **A new trip appears** that has no entry in `scripts/expedition_details.json`. It still shows on the site, with guessed settings and no gear estimate. Add an entry for it to fix that.

## Running it by hand

From this folder:

```bash
python3 scripts/update_expeditions.py
```

```bash
python3 scripts/test_update_expeditions.py
```

Or in GitHub, go to **Actions > Update expeditions > Run workflow**.
