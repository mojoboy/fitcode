"""
clean_climate.py
----------------
Turns NOAA's statewide climate files (data/raw/climate/) into one tidy table and loads it into DuckDB.
It prints every step with an example, so you can watch the data change shape.

    .venv\\Scripts\\python scripts\\clean_climate.py

Output:
    data/clean/climate_by_state.csv   one row per state per month (51 x 12 = 612 rows)
    data/fitcode.duckdb               the same rows as the table climate_by_state
"""
from pathlib import Path

import duckdb
import pandas as pd

from us_states import STATE_CODES

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw' / 'climate'
CLEAN = ROOT / 'data' / 'clean'
DATABASE = ROOT / 'data' / 'fitcode.duckdb'

RECENT = (2021, 2025)   # the last five full years: what the weather is like now
NORMAL = (1991, 2020)   # NOAA's official 30-year "normal", for comparison
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

# NOAA numbers the states its own way: alphabetical for the lower 48, then Hawaii (049) and Alaska (050).
# These are NOT the common FIPS codes (Maryland is 018 here but 24 in FIPS), so they get their own lookup.
NOAA_ORDER = [
    'Alabama', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida',
    'Georgia', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
    'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
    'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
    'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
    'Wisconsin', 'Wyoming', 'Hawaii', 'Alaska',
]
NOAA_CODES = {f'{number:03d}': name for number, name in enumerate(NOAA_ORDER, start=1)}

MEASURES = {'tmaxst': 'high', 'tminst': 'low', 'pcpnst': 'precip'}
MISSING = {'high': -99.9, 'low': -99.9, 'precip': -9.99}   # NOAA's markers for "no value yet"

# Every line is fixed-width text: state (3 characters), division (1), element (2), year (4),
# then 12 monthly values of 7 characters each
COLUMNS = [(0, 3), (3, 4), (4, 6), (6, 10)] + [(10 + 7 * m, 17 + 7 * m) for m in range(12)]
NAMES = ['noaa_code', 'division', 'element', 'year'] + MONTHS
KEYS = ['state', 'state_name', 'year', 'month']


def step(number, title):
    print(f'\n--- Step {number}: {title}')


def newest(measure):
    files = sorted(RAW.glob(f'climdiv-{measure}-*'))
    if not files:
        raise SystemExit(f'No {measure} file in {RAW}. Run scripts/import_climate.py first.')
    return files[-1]


def main():
    step(1, 'Read the raw files: fixed-width text, one line per state per year')
    wide = {}
    for measure, name in MEASURES.items():
        path = newest(measure)
        # dtype=str keeps "018" as text; read as a number it would become 18 and lose its meaning
        wide[name] = pd.read_fwf(path, colspecs=COLUMNS, names=NAMES,
                                 dtype={'noaa_code': str, 'division': str, 'element': str})
        print(f'  {path.name}: {len(wide[name]):,} lines')
    raw_line = newest('tmaxst').read_text().splitlines()[0]
    print(f'  A raw line, exactly as NOAA wrote it:\n    {raw_line}')
    print('  The same line split into columns:')
    print('    ' + wide['high'].head(1).to_string(index=False).replace('\n', '\n    '))

    step(2, 'Keep the 50 states; drop regions, the national average and farm belts')
    codes = sorted(set(wide['high']['noaa_code']))
    for name in wide:
        before = len(wide[name])
        wide[name] = wide[name][wide[name]['noaa_code'].isin(NOAA_CODES)]
    dropped = [code for code in codes if code not in NOAA_CODES]
    print(f"  {before:,} -> {len(wide['high']):,} lines per file. Dropped {len(dropped)} codes ({dropped[0]}-{dropped[-1]}),"
          " like 101 'Northeast Region' and 110 'National'.")

    step(3, "Translate NOAA's state numbers into names and postal codes")
    for name, table in wide.items():
        table['state_name'] = table['noaa_code'].map(NOAA_CODES)
        table['state'] = table['state_name'].map(STATE_CODES)
    unmatched = wide['high'][wide['high']['state'].isna()]
    if len(unmatched):
        raise SystemExit(f'States without a postal code: {sorted(unmatched["state_name"].unique())}')
    print("  018 -> Maryland -> MD. (In the common FIPS numbering, Maryland is 24 and 18 is Indiana,")
    print('  so a lookup table made for FIPS would quietly put every number in the wrong state.)')

    step(4, 'Reshape from wide to long: the 12 month columns become 12 rows')
    long = {}
    for name, table in wide.items():
        melted = table.melt(id_vars=['state', 'state_name', 'year'], value_vars=MONTHS,
                            var_name='month_name', value_name=name)
        melted['month'] = melted['month_name'].map(MONTHS.index) + 1
        long[name] = melted.drop(columns='month_name')
    example = wide['high'][(wide['high']['state'] == 'MD') & (wide['high']['year'] == 2025)]
    print(f"  {len(wide['high']):,} rows x 12 month columns -> {len(long['high']):,} rows x 1 value column")
    print('  Before, Maryland 2025 is one row:')
    print('    ' + example[['state', 'year'] + MONTHS[:6]].to_string(index=False).replace('\n', '\n    ') + '  ...')
    after = long['high'][(long['high']['state'] == 'MD') & (long['high']['year'] == 2025)].sort_values('month')
    print('  After, it is 12 rows (first 3 shown):')
    print('    ' + after.head(3)[['state', 'year', 'month', 'high']].to_string(index=False).replace('\n', '\n    '))

    step(5, "Turn NOAA's missing-value markers into real blanks")
    for name, table in long.items():
        marker = table[name] <= MISSING[name] + 0.001
        table.loc[marker, name] = float('nan')
        if name == 'high':
            gaps = table[marker].groupby('year')['month'].agg(lambda months: sorted(set(months)))
            print(f'  {int(marker.sum())} highs were {MISSING[name]} ("no value yet"). Months with gaps: '
                  + '; '.join(f'{year}: {MONTHS[months[0] - 1]}-{MONTHS[months[-1] - 1]}' for year, months in gaps.items()))
    print('  Left as numbers, those -99.9s would drag any average down by about 100 degrees.')

    step(6, 'Join the three measures: one row per state per year per month')
    climate = long['high'].merge(long['low'], on=KEYS).merge(long['precip'], on=KEYS)
    upside_down = climate[climate['high'] < climate['low']]
    print(f'  {len(climate):,} rows with high, low and precipitation side by side.')
    print(f'  Check: rows where the average high is below the average low: {len(upside_down)}')

    step(7, 'Average two periods: the last 5 full years, and the 30-year normal')

    def average(first, last):
        period = climate[climate['year'].between(first, last)]
        return period.groupby(['state', 'state_name', 'month']).agg(
            high=('high', 'mean'), low=('low', 'mean'), precip=('precip', 'mean'), years=('high', 'count'))

    recent = average(*RECENT)
    normal = average(*NORMAL)
    print(f"  {RECENT[0]}-{RECENT[1]}: every state-month has {sorted(int(n) for n in recent['years'].unique())} years of data")
    print(f"  {NORMAL[0]}-{NORMAL[1]}: every state-month has {sorted(int(n) for n in normal['years'].unique())} years of data")
    january = climate[(climate['state'] == 'MD') & (climate['month'] == 1) & climate['year'].between(*RECENT)]
    print('  Example, Maryland in January: ' + ', '.join(f'{row.year} {row.high:.1f}' for row in january.itertuples())
          + f" -> average {january['high'].mean():.1f}F")
    monthly = recent.join(normal, lsuffix='_recent', rsuffix='_normal').reset_index()
    monthly['high_change'] = monthly['high_recent'] - monthly['high_normal']

    step(8, "Add Washington, D.C., which NOAA's statewide files leave out")
    dc = monthly[monthly['state'] == 'MD'].copy()
    dc['state'], dc['state_name'] = 'DC', 'District of Columbia'
    monthly['proxy_for'] = ''
    dc['proxy_for'] = 'MD'
    monthly = pd.concat([monthly, dc], ignore_index=True)
    print("  D.C. isn't a state, so NOAA's statewide files skip it. It was carved out of Maryland, so it")
    print("  borrows Maryland's numbers, marked proxy_for = MD so the site can say so.")

    step(9, 'Round, sort and save')
    monthly['month_name'] = monthly['month'].map(lambda m: MONTHS[m - 1])
    for column in ['high_recent', 'low_recent', 'high_normal', 'low_normal', 'high_change']:
        monthly[column] = monthly[column].round(1)
    for column in ['precip_recent', 'precip_normal']:
        monthly[column] = monthly[column].round(2)
    monthly = monthly[['state', 'state_name', 'month', 'month_name', 'high_recent', 'low_recent', 'precip_recent',
                   'high_normal', 'low_normal', 'precip_normal', 'high_change', 'years_recent', 'years_normal',
                   'proxy_for']].sort_values(['state', 'month'])
    CLEAN.mkdir(parents=True, exist_ok=True)
    monthly.to_csv(CLEAN / 'climate_by_state.csv', index=False)
    with duckdb.connect(str(DATABASE)) as con:
        con.execute('CREATE OR REPLACE TABLE climate_by_state AS SELECT * FROM monthly')
        count, states = con.execute('SELECT COUNT(*), COUNT(DISTINCT state) FROM climate_by_state').fetchone()
    print(f'  {count} rows ({states} states x 12 months) -> {CLEAN / "climate_by_state.csv"} and table climate_by_state')

    step(10, 'Gut checks: do the extremes make sense?')
    july, jan = monthly[monthly['month'] == 7], monthly[monthly['month'] == 1]
    hottest = july.loc[july['high_recent'].idxmax()]
    coldest = jan.loc[jan['high_recent'].idxmin()]
    warming = july.loc[july['high_change'].idxmax()]
    hawaii = monthly[monthly['state'] == 'HI']
    print(f"  Hottest July highs: {hottest.state_name} ({hottest.high_recent}F)")
    print(f"  Coldest January highs: {coldest.state_name} ({coldest.high_recent}F)")
    print(f"  Most July warming vs. the normal: {warming.state_name} (+{warming.high_change}F)")
    print(f"  Hawaii's average high moves only {hawaii['high_recent'].min()}-{hawaii['high_recent'].max()}F all year")
    print('  Maryland, all 12 months (2021-2025):')
    md = monthly[monthly['state'] == 'MD'][['month_name', 'high_recent', 'low_recent', 'precip_recent', 'high_normal', 'high_change']]
    print('    ' + md.to_string(index=False).replace('\n', '\n    '))


if __name__ == '__main__':
    main()
