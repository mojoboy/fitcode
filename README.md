# fitcode

A website that builds you an outfit and shows the data behind every pick. Swipe a few pieces, answer eight quick questions, and a transparent scoring model picks a head-to-toe outfit, then explains each choice with the numbers that drove it.

**Live site:** https://mojoboy.github.io/fitcode/ · the closet is a sample of free stock photos, not a store.

## How the data flows

```
Google Trends exports (downloaded by hand)
  → scripts/import_trends.py     copy into data/raw/trends/ and log each file in MANIFEST.csv
  → scripts/clean_trends.py      pandas + DuckDB: one row per state per brand, index vs. the average state
NOAA statewide monthly climate files (nClimDiv)
  → scripts/import_climate.py    download the newest files into data/raw/climate/ and log them in MANIFEST.csv
  → scripts/clean_climate.py     pandas + DuckDB: one row per state per month, 2021–2025 vs. the 1991–2020 normal
Closet photos + tags, brand list (assets/closet/CREDITS.csv, data/closet_tags.csv, data/brands.csv)
  → scripts/export_site_data.py  validate, join, and write the site's data pack (site/data/*.json)
  → site/                        a static site: plain HTML, CSS and JavaScript, no framework
```

`scripts/build.py` runs the whole chain and the data tests in one command. The website never reads the raw files or the database; it reads the small JSON files the pipeline produces.

## The scoring model (`site/js/model.js`)

| Signal | Weight | Where it comes from |
|---|---|---|
| Your style | 50% | Your swipes, inspiration picks and brands. A piece you liked outranks any piece you didn't swipe. |
| Climate fit | 20% | NOAA: your state's average high for this month, 2021–2025. Under 50°F favors warm pieces, under 72°F mid-weight, above that light. Eyewear and jewelry aren't scored on it. |
| Trends near you | 15% | Google Trends: how much your state searches brands in each style |
| Color match | 10% | The colors you picked |
| Lifestyle fit | 5% | Your kind of week |

- Pieces you'd never wear are removed before anything is scored.
- A signal with no data (a skipped question, or weather for a pair of sunglasses) is left out, and the other weights are rescaled so they still add up to 100%.
- At most one strong color per outfit.
- Every pick keeps its numbers, so the site can show why it was chosen.

## Run it

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python scripts\build.py
.venv\Scripts\python -m http.server 8000 --directory site
```

Then open http://localhost:8000. Logic tests: http://localhost:8000/tests.html. Data tests: `python -m unittest discover -s tests`.

New NOAA files come out every month: `.venv\Scripts\python scripts\import_climate.py`, then the build. To explore the tables with SQL: `.venv\Scripts\python scripts\run_sql.py sql\explore_climate.sql` (or `sql\explore_trends.sql`).

## Data, limits and credits

- **Search interest:** [Google Trends](https://trends.google.com), interest by US state, web search, Sep 2025 to Sep 2026, 15 brands so far. It measures searches, not sales, so it's a small nudge in the score rather than the main driver. States Google leaves out are kept as unknown, never zero.
- **Weather:** [NOAA NCEI nClimDiv](https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/), statewide monthly average highs, lows and precipitation. The site uses 2021–2025 (what the weather is like now) and shows the change from the 1991–2020 normal. It's statewide, so a big state's average hides its range. D.C. isn't in NOAA's state files, so it uses Maryland's.
- **A flagged state:** Kansas ranks #1 for several unrelated brands, which points to a data quirk rather than taste, so its trends aren't used until that's checked (see `data/README.md`).
- **Photos:** [Burst by Shopify](https://www.shopify.com/stock-photos), free for commercial use. The pieces are samples with generic names, not real products.
