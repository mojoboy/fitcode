# Data

| Folder | What's in it |
|---|---|
| `raw/` | Files exactly as downloaded. Never edited; each folder's `MANIFEST.csv` records where each file came from. |
| `clean/` | Tables produced by the scripts in `scripts/`. Safe to delete and rebuild. |
| `fitcode.duckdb` | The DuckDB database the scripts load (rebuilt by the scripts). |

## Google Trends: brand interest by state

- Source: Google Trends, "Interest by subregion", United States, web search, past 12 months (Sep 28, 2025 to Sep 28, 2026), downloaded by hand on Sep 28, 2026.
- Scores run 0 to 100 within each brand: 100 is the state where that brand takes the biggest share of all searches. Scores are not comparable across brands.
- Search interest measures curiosity, not purchases.
- Built by `scripts/clean_trends.py` into `trends_by_state` (one row per state per brand).

## NOAA climate: monthly weather by state

- Source: NOAA NCEI, nClimDiv statewide monthly averages: average daily high, average daily low and total precipitation, every month since 1895. `scripts/import_climate.py` downloads the newest files from https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/ (the names carry the issue date, like `20260904`) and logs them in `raw/climate/MANIFEST.csv`.
- Fixed-width text, one line per state per year: NOAA's own state number, then 12 monthly values. The numbers are alphabetical for the lower 48 (Maryland is 018), then Hawaii 049 and Alaska 050. They are not FIPS codes (FIPS 18 is Indiana). Codes above 100 are regions and national averages, and are dropped.
- `-99.90` (temperatures) and `-9.99` (precipitation) mean "no value yet" (the months after the issue date). They become blanks, never numbers.
- Built by `scripts/clean_climate.py` into `climate_by_state` (one row per state per month): the 2021–2025 average, the 1991–2020 normal, and the change between them.

## Known issues

- **States with too little search volume are missing** for smaller brands (Nude Project has 32 of 51, Scuffers 45, Supreme 48, COS 49, Kith 50). They are kept as blank, not zero, and give no boost either way.
- **Kansas ranks #1 for Nike, adidas, Bershka and ASOS.** A repeat across unrelated brands suggests something about Kansas's data rather than fashion. Possible causes, none checked yet: sampling noise (Google Trends works from a sample of searches); a one-off local event; or location defaults (when a location service can't place a U.S. user, for example behind a VPN, it has historically put them at the country's center, in Kansas; whether Google does this is unknown). To test: re-download a few brands and compare, and check whether Kansas also tops unrelated, non-fashion searches.
- **Statewide weather hides the range inside a state.** A Texas average mixes the Panhandle and the Gulf coast. It's fine for "warm, mild or cold this month", not for a forecast.
- **Washington, D.C. has no NOAA statewide series.** It uses Maryland's numbers (marked `proxy_for = MD`), and the site says so.
