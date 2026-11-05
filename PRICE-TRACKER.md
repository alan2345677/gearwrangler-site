# Price tracker

Once a day, the tracker checks store prices and updates the site. It adds an "On sale" or "Price drop" tag where one applies, and shows the date of each check. Budget rankings use the new prices automatically.

## How it works

| File | What it does |
|---|---|
| `scripts/update_prices.py` | Checks the stores. It needs nothing installed except Python. |
| `prices.json` | The current prices. The site loads this file in the browser. |
| `scripts/prices-review.json` | Prices held for review, and products it couldn't read. |
| `.github/workflows/update-prices.yml` | Runs the check every day on GitHub and saves the results. |

If `prices.json` is missing or won't load, the site uses the prices written in `index.html`.

Each store is asked one product at a time, with a pause between requests. The tracker names itself plainly and follows each store's `robots.txt`. If a store refuses or doesn't answer, it's left alone until the next day.

## What the tags mean

- **On sale:** the store itself lists a higher regular price.
- **Price drop:** the price is at least 5% below the highest price seen in the last 90 days.

The first time a product is checked, it only gets a tag if the store lists a regular price, so the site never invents a discount.

## What isn't tracked

- **Amazon picks:** these link to a search, not one product, so there's no single price to read.
- **Stores that refuse or don't answer:** as of November 2026, this includes REI, Marmot, Osprey, Mountain Hardwear, Helly Hansen, Snow Peak, Coleman, and Soto. That also covers products linked through REI, like the Exped Ultra 6.5R.
- **Pages with no readable price:** as of November 2026, this includes Gregory, Montbell, Patagonia, Merrell, Danner, Exped, Mammut, Ledlenser, Nitecore, Petzl, Sawyer, Katadyn, and Jetboil.
- **Skipped on purpose:** see `SKIP` in `scripts/update_prices.py`.

These keep the price written in `index.html` and show the month it was last updated, so update them by hand from time to time. The full list from the latest check is in `scripts/prices-review.json`.

## Reviewing held prices

A price is held if it moved more than 35% and the store's own regular price doesn't explain it. It stays at its old price on the site until someone checks it.

When something is held, GitHub opens an issue called "Prices to review" and emails you.

1. Open each store link in the issue and check the price.
2. In GitHub, go to **Actions > Update prices > Run workflow**.
3. Enter the product IDs that are correct, separated by commas, and run it.

If a reading is wrong, leave it alone. It stays on the list and the site keeps the old price.

## Running it by hand

From this folder:

```bash
python3 scripts/update_prices.py
```

```bash
python3 scripts/update_prices.py --review
```

```bash
python3 scripts/update_prices.py --approve product-id-1,product-id-2
```

```bash
python3 scripts/test_update_prices.py
```

## Adding or changing a product

Add it to `index.html` as usual, and the tracker picks it up on the next run. If its store page sells several versions at different prices, such as sizes or temperature ratings, add a rule to `OPTION_RULES` in `scripts/update_prices.py` so it reads the right one.

## Publishing setup

The tracker needs this folder in a GitHub repository connected to the Vercel project, so each saved price update publishes the site.

**Private repositories:** Vercel's free Hobby plan can refuse to publish commits from anyone except the account owner, and that would likely include this automated commit. A public repository avoids that check. Everything in this folder is safe to make public: the site's code is already visible to visitors, and there are no passwords or keys here.

After connecting it, run **Actions > Update prices > Run workflow** once. Then check that the run succeeded, that Vercel published the update, and how many prices it could read. GitHub's servers may get different answers from stores than a home connection does.
