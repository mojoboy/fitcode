"""One command to rebuild everything from the raw data and check it:

    .venv/Scripts/python scripts/build.py

1. clean_trends.py       raw Google Trends exports -> data/clean/ and the DuckDB table
2. clean_climate.py      raw NOAA climate files -> data/clean/ and the DuckDB table
3. export_site_data.py   project tables -> the website's data pack (site/data/, site/img/)
4. data tests            tests/test_data_pack.py checks the data pack

(Downloading new data is separate: scripts/import_trends.py and scripts/import_climate.py.)

Each step only runs if the one before it worked. Then, with the local server running,
open http://localhost:8000/tests.html for the logic tests.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEPS = [
    ('Clean the Trends exports', [sys.executable, 'scripts/clean_trends.py']),
    ('Clean the NOAA climate files', [sys.executable, 'scripts/clean_climate.py']),
    ('Export the site data pack', [sys.executable, 'scripts/export_site_data.py']),
    ('Test the data pack', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests']),
]


def main():
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}   # so accents like the u in Stussy print on Windows
    for number, (title, command) in enumerate(STEPS, start=1):
        print(f'\n[{number}/{len(STEPS)}] {title}', flush=True)
        if subprocess.run(command, cwd=ROOT, env=env).returncode != 0:
            print(f'\nStopped: "{title}" failed, so nothing after it ran.')
            sys.exit(1)
    print('\nAll done. For the logic tests, run the site and open http://localhost:8000/tests.html')


if __name__ == '__main__':
    main()
