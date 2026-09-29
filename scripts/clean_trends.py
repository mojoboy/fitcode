"""
clean_trends.py
---------------
Turns the raw Google Trends exports in data/raw/trends/ into one tidy table and loads it into DuckDB.

    .venv\\Scripts\\python scripts\\clean_trends.py

Each raw file holds one brand: a "Region" column (the 50 states plus DC) and a column named after the
brand with Google's 0-100 interest score for the past 12 months. 100 marks the state where the brand
takes the biggest share of all searches, so scores only compare within one brand, never across brands.

Output:
    data/clean/trends_by_state.csv   one row per state per brand
    data/fitcode.duckdb              the same rows as the table trends_by_state
"""

from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "trends"
CLEAN = ROOT / "data" / "clean"
DATABASE = ROOT / "data" / "fitcode.duckdb"

# Google leaves a state out when too few people searched for the brand there. We add every missing
# state back with a blank score, because "not enough data" is not the same thing as "zero interest".
STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
    "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
    "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
    "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]


def read_export(path, start_date, end_date):
    """One raw export -> one row per state: state, brand, interest (blank when Google had too little data)."""
    raw = pd.read_csv(path, dtype=str)
    brand = raw.columns[1]
    rows = raw.rename(columns={"Region": "state", brand: "interest"})

    unknown = set(rows["state"]) - set(STATES)
    if unknown:
        raise ValueError(f"{path.name}: regions we don't recognize: {sorted(unknown)}")

    # Google writes "<1" for a tiny but nonzero share; count it as half a point
    rows["interest"] = pd.to_numeric(rows["interest"].str.replace("<1", "0.5", regex=False), errors="coerce")

    every_state = pd.DataFrame({"state": STATES})
    rows = every_state.merge(rows, on="state", how="left")
    rows.insert(1, "brand", brand)
    rows["period_start"] = start_date
    rows["period_end"] = end_date
    return rows


def main():
    manifest = pd.read_csv(RAW / "MANIFEST.csv")
    trends = pd.concat(
        [read_export(RAW / row.file, row.start_date, row.end_date) for row in manifest.itertuples()],
        ignore_index=True,
    )

    # Compare each state with the same brand's average state: 1.0 = typical, 1.5 = half again as much
    # interest, 0.5 = half as much. This is what the site uses for "trends near you".
    by_brand = trends.groupby("brand")["interest"]
    trends["avg_state_interest"] = by_brand.transform("mean").round(1)
    trends["index_vs_avg"] = (trends["interest"] / trends["avg_state_interest"]).round(2)
    trends["rank_in_brand"] = by_brand.rank(ascending=False, method="min").astype("Int64")
    trends["has_data"] = trends["interest"].notna()

    CLEAN.mkdir(parents=True, exist_ok=True)
    trends.to_csv(CLEAN / "trends_by_state.csv", index=False)

    with duckdb.connect(str(DATABASE)) as con:
        # DuckDB can read the pandas table ("trends") straight from Python's memory
        con.execute("CREATE OR REPLACE TABLE trends_by_state AS SELECT * FROM trends")
        count, brands = con.execute("SELECT COUNT(*), COUNT(DISTINCT brand) FROM trends_by_state").fetchone()

    missing = int((~trends["has_data"]).sum())
    print(f"{count} rows ({brands} brands x {len(STATES)} states); {missing} state scores Google left out (kept as blank)")
    print(f"Saved {CLEAN / 'trends_by_state.csv'} and table trends_by_state in {DATABASE}")


if __name__ == "__main__":
    main()
