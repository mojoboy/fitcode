# Data

| Folder | What's in it |
|---|---|
| `raw/` | Files exactly as downloaded. Never edited; `raw/trends/MANIFEST.csv` records where each came from. |
| `clean/` | Tables produced by the scripts in `scripts/`. Safe to delete and rebuild. |
| `fitcode.duckdb` | The DuckDB database the scripts load (rebuilt by the scripts). |

## Google Trends: brand interest by state

- Source: Google Trends, "Interest by subregion", United States, web search, past 12 months (Sep 28, 2025 to Sep 28, 2026), downloaded by hand on Sep 28, 2026.
- Scores run 0 to 100 within each brand: 100 is the state where that brand takes the biggest share of all searches. Scores are not comparable across brands.
- Search interest measures curiosity, not purchases.
- Built by `scripts/clean_trends.py` into `trends_by_state` (one row per state per brand).

## Known issues

- **States with too little search volume are missing** for smaller brands (Nude Project has 32 of 51, Scuffers 45, Supreme 48, COS 49, Kith 50). They are kept as blank, not zero, and give no boost either way.
- **Kansas ranks #1 for Nike, adidas, Bershka and ASOS.** A repeat across unrelated brands suggests something about Kansas's data rather than fashion. Possible causes, none checked yet: sampling noise (Google Trends works from a sample of searches); a one-off local event; or location defaults (when a location service can't place a U.S. user, for example behind a VPN, it has historically put them at the country's center, in Kansas; whether Google does this is unknown). To test: re-download a few brands and compare, and check whether Kansas also tops unrelated, non-fashion searches.
