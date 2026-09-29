"""
import_trends.py
----------------
Copies new Google Trends "Interest by subregion" downloads (by_region_US_*.csv in your Downloads folder)
into data/raw/trends/ with readable names, and records each in data/raw/trends/MANIFEST.csv.

    .venv\\Scripts\\python scripts\\import_trends.py               brands (the default)
    .venv\\Scripts\\python scripts\\import_trends.py --type item   items and styles, like "cargo pants"

Run it after each batch of downloads. Files it has already imported are skipped, and the originals in
Downloads are left alone. Then rebuild the table with scripts\\clean_trends.py.
"""

import argparse
import csv
import re
import shutil
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "trends"
MANIFEST = RAW / "MANIFEST.csv"
FIELDS = ["file", "term", "term_type", "geo", "start_date", "end_date", "states_with_data", "original_file", "source"]
SOURCE = "Google Trends, Interest by subregion, web search, past 12 months"
DOWNLOAD_NAME = re.compile(r"by_region_US_(\d{8})-\d{4}_(\d{8})-\d{4}")


def iso(date):
    return f"{date[:4]}-{date[4:6]}-{date[6:]}"


def main():
    parser = argparse.ArgumentParser(description="Import Google Trends downloads into the project.")
    parser.add_argument("--type", choices=["brand", "item"], default="brand", help="what the new downloads are")
    args = parser.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    rows = []
    if MANIFEST.exists():
        with open(MANIFEST, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
    imported = {row["original_file"] for row in rows}
    names = {row["file"] for row in rows}

    added = 0
    for path in sorted(DOWNLOADS.glob("by_region_US_*.csv")):
        match = DOWNLOAD_NAME.search(path.name)
        if path.name in imported or not match:
            continue
        with open(path, encoding="utf-8-sig", newline="") as f:
            data = list(csv.reader(f))
        term = data[0][1]
        slug = re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")
        name = f"{args.type}-{slug}.csv"
        if name in names:
            print(f"Skipped {path.name}: {name} already exists. Delete it and its MANIFEST row to replace it.")
            continue
        shutil.copy2(path, RAW / name)
        rows.append({"file": name, "term": term, "term_type": args.type, "geo": "US states",
                     "start_date": iso(match.group(1)), "end_date": iso(match.group(2)),
                     "states_with_data": len(data) - 1, "original_file": path.name, "source": SOURCE})
        names.add(name)
        added += 1
        print(f"Added {name}: {term}, {len(data) - 1} states")

    if not added:
        print("No new downloads found.")
        return
    with open(MANIFEST, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{added} added. Now run: .venv\\Scripts\\python scripts\\clean_trends.py")


if __name__ == "__main__":
    main()
