# fitcode

A website that builds you an outfit and shows the data behind every pick. Swipe a few pieces, answer eight quick questions, and a transparent scoring model picks a head-to-toe outfit, then explains each choice with the numbers that drove it.

**Live site:** https://mojoboy.github.io/fitcode/ · the closet is a sample of free stock photos, not a store.

## How the data flows

```
Google Trends exports (downloaded by hand)
  → scripts/import_trends.py     copy into data/raw/trends/ and log each file in MANIFEST.csv
  → scripts/clean_trends.py      pandas + DuckDB: one row per state per brand, index vs. the average state
Closet photos + tags, brand list (assets/closet/CREDITS.csv, data/closet_tags.csv, data/brands.csv)
  → scripts/export_site_data.py  validate, join, and write the site's data pack (site/data/*.json)
  → site/                        a static site: plain HTML, CSS and JavaScript, no framework
```

`scripts/build.py` runs the whole chain and the data tests in one command. The website never reads the raw files or the database; it reads the small JSON files the pipeline produces.

## The scoring model (`site/js/model.js`)

| Signal | Weight | Where it comes from |
|---|---|---|
| Your style | 50% | Your swipes, inspiration picks and brands. A piece you liked outranks any piece you didn't swipe. |
| Climate fit | 20% | NOAA 1991–2020 climate normals (not added yet) |
| Trends near you | 15% | Google Trends: how much your state searches brands in each style |
| Color match | 10% | The colors you picked |
| Lifestyle fit | 5% | Your kind of week |

- Pieces you'd never wear are removed before anything is scored.
- A signal with no data (a skipped question, or data not collected yet) is left out, and the other weights are rescaled so they still add up to 100%.
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

## Data, limits and credits

- **Search interest:** [Google Trends](https://trends.google.com), interest by US state, web search, Sep 2025 to Sep 2026, 15 brands so far. It measures searches, not sales, so it's a small nudge in the score rather than the main driver. States Google leaves out are kept as unknown, never zero.
- **A flagged state:** Kansas ranks #1 for several unrelated brands, which points to a data quirk rather than taste, so its trends aren't used until that's checked (see `data/README.md`).
- **Photos:** [Burst by Shopify](https://www.shopify.com/stock-photos), free for commercial use. The pieces are samples with generic names, not real products.
