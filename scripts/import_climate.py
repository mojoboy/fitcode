"""
import_climate.py
-----------------
Downloads NOAA's statewide monthly climate files into data/raw/climate/ and logs them in MANIFEST.csv.

    .venv\\Scripts\\python scripts\\import_climate.py

NOAA's nClimDiv dataset keeps one file per measure, covering every state and every month since 1895.
NOAA re-issues the files every month with the date in the name (climdiv-tmaxst-v1.0.0-20260904), so
this script reads NOAA's folder listing to find the newest names. Files are saved exactly as downloaded;
all cleaning happens in clean_climate.py.
"""
import csv
import re
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw' / 'climate'
SOURCE = 'https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/'
MEASURES = {
    'tmaxst': 'average daily high (F)',
    'tminst': 'average daily low (F)',
    'pcpnst': 'precipitation (inches)',
}
# Say who's asking: an honest name and where to find the project
HEADERS = {'User-Agent': 'fitcode-data-pipeline (https://github.com/mojoboy/fitcode)'}


def fetch(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    listing = fetch(SOURCE).decode('utf-8', errors='replace')

    rows = []
    for measure, meaning in MEASURES.items():
        issues = sorted(set(re.findall(rf'climdiv-{measure}-v[\d.]+-\d{{8}}', listing)))
        if not issues:
            raise SystemExit(f'No {measure} file at {SOURCE}. NOAA may have renamed it.')
        name = issues[-1]   # the newest issue
        target = RAW / name
        if target.exists():
            print(f'{name}: already downloaded')
        else:
            target.write_bytes(fetch(SOURCE + name))
            print(f'{name}: downloaded {target.stat().st_size / 1024:,.0f} KB')
        rows.append({
            'file': name, 'measure': measure, 'meaning': meaning, 'issued': name[-8:],
            'downloaded': date.today().isoformat(), 'bytes': target.stat().st_size, 'source': SOURCE + name,
        })

    with open(RAW / 'MANIFEST.csv', 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f'Logged {len(rows)} files in {RAW / "MANIFEST.csv"}')


if __name__ == '__main__':
    main()
