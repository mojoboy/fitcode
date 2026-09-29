"""Build the website's data pack: the JSON files and photos that the site in site/ reads.

The website never touches the raw CSVs or the DuckDB file. This script turns the
project's tables into small JSON files a browser can download, and copies the photos
next to them. Run it again whenever a source table changes:

    .venv/Scripts/python scripts/export_site_data.py
"""
import json
from pathlib import Path

import pandas as pd
from PIL import Image

from us_states import STATE_CODES

ROOT = Path(__file__).resolve().parents[1]
CLOSET = ROOT / 'assets' / 'closet'
SITE = ROOT / 'site'

# Head to toe, so the wardrobe cloud runs from hats at the top to shoes at the bottom
SLOT_ORDER = ['hat', 'eyewear', 'jewelry', 'top', 'mood', 'bottom', 'shoes']
WEARABLE = ['hat', 'eyewear', 'jewelry', 'top', 'bottom', 'shoes']   # "mood" photos are just for the cloud
STYLE_ORDER = ['streetwear', 'athleisure', 'minimal', 'smart', 'trend', 'vintage', 'workwear']

# The vocabulary for data/closet_tags.csv (site/js/quiz.js uses the same words)
PALETTE = {'black', 'white', 'grey', 'navy', 'denim', 'olive', 'forest', 'khaki', 'brown', 'cream',
           'burgundy', 'rust', 'teal', 'cobalt', 'sage', 'mustard', 'pink', 'gold', 'silver'}
FITS = {'slim', 'regular', 'relaxed', 'oversized'}
LIFESTYLE = {'comfort', 'sturdy', 'polished', 'layer', 'statement'}
ITEM_FLAGS = {'skinny', 'logo', 'shorts', 'print', 'graphic', 'cargo', 'chain', 'sandals', 'tight', 'neon'}


# Known data problems travel with the data, so the site can warn about them (see data/README.md)
FLAGS = {
    'KS': 'Kansas ranks #1 for several unrelated brands, which points to a quirk in the data, '
          "not taste. It isn't used for recommendations until that's checked.",
}


WEBP_QUALITY = 80   # WebP at 80 looks the same as the JPG at this size, and is much smaller


def save_webp(source, target):
    with Image.open(source) as image:
        image.convert('RGB').save(target, 'WEBP', quality=WEBP_QUALITY, method=6)


def split(text):
    return [part for part in text.split(';') if part]


def check_tags(closet, tags):
    """Every wearable piece needs one row of tags, and every tag must be in the vocabulary."""
    wearable = set(closet.loc[closet['slot'].isin(WEARABLE), 'id'])
    problems = []
    if missing := sorted(wearable - set(tags.index)):
        problems.append(f'no tags for: {missing}')
    if extra := sorted(set(tags.index) - wearable):
        problems.append(f"tags for pieces that don't exist or aren't wearable: {extra}")
    for piece, row in tags.iterrows():
        colors = split(row['colors'])
        if not colors or set(colors) - PALETTE:
            problems.append(f"{piece}: colors {row['colors']!r}")
        if row['warmth'] not in ('', '1', '2', '3'):
            problems.append(f"{piece}: warmth {row['warmth']!r} (use 1, 2, 3 or blank)")
        if row['formality'] not in ('1', '2', '3'):
            problems.append(f"{piece}: formality {row['formality']!r} (use 1, 2 or 3)")
        if row['fit'] and row['fit'] not in FITS:
            problems.append(f"{piece}: fit {row['fit']!r}")
        if set(split(row['lifestyle'])) - LIFESTYLE:
            problems.append(f"{piece}: lifestyle {row['lifestyle']!r}")
        if set(split(row['flags'])) - ITEM_FLAGS:
            problems.append(f"{piece}: flags {row['flags']!r}")
    if problems:
        raise SystemExit('data/closet_tags.csv has problems:\n  ' + '\n  '.join(problems))


def export_closet():
    """Photos and credits (assets/closet/CREDITS.csv) joined with each piece's tags
    (data/closet_tags.csv) -> site/data/closet.json; photos -> site/img/closet/."""
    table = pd.read_csv(CLOSET / 'CREDITS.csv')
    table['id'] = table['file'].map(lambda name: Path(name).stem)
    table['slot_rank'] = table['slot'].map(SLOT_ORDER.index)
    table = table.sort_values('slot_rank', kind='stable')
    tags = pd.read_csv(ROOT / 'data' / 'closet_tags.csv', dtype=str, keep_default_na=False).set_index('id')
    check_tags(table, tags)

    photo_dir = SITE / 'img' / 'closet'
    photo_dir.mkdir(parents=True, exist_ok=True)
    for old_copy in photo_dir.glob('*.jpg'):   # earlier exports copied JPGs here; the site now uses WebP
        old_copy.unlink()

    items = []
    before = after = 0
    for row in table.itertuples(index=False):
        target = photo_dir / f'{row.id}.webp'
        save_webp(CLOSET / row.file, target)
        before += (CLOSET / row.file).stat().st_size
        after += target.stat().st_size
        item = {
            'id': row.id,
            'name': row.name,
            'slot': row.slot,
            'styles': row.style_tags.split(';'),
            'img': f'img/closet/{row.id}.webp',
            'w': int(row.width),
            'h': int(row.height),
            'source': row.source_page,
        }
        if row.id in tags.index:   # the join: add the piece's tags by matching id
            t = tags.loc[row.id]
            item.update({
                'colors': split(t['colors']),
                'warmth': int(t['warmth']) if t['warmth'] else None,
                'formality': int(t['formality']),
                'fit': t['fit'] or None,
                'lifestyle': split(t['lifestyle']),
                'flags': split(t['flags']),
            })
        items.append(item)

    write_json('closet.json', {
        'note': 'Sample pieces from free Burst (Shopify) stock photos, not real products for sale.',
        'items': items,
    })
    print(f'photos: {before / 1024:.0f} KB of JPG -> {after / 1024:.0f} KB of WebP ({1 - after / before:.0%} smaller)')
    return len(items)


def export_trends():
    """data/clean/trends_by_state.csv -> site/data/trends.json: every brand's index in every state.

    The index is the state's search interest divided by the brand's average state (1.0 = typical).
    States Google left out stay null (unknown), never 0.
    """
    table = pd.read_csv(ROOT / 'data' / 'clean' / 'trends_by_state.csv')
    brands = sorted(table['brand'].unique(), key=str.lower)

    states = {}
    for state, rows in table.groupby('state'):
        index = {
            row.brand: round(float(row.index_vs_avg), 2) if row.has_data else None
            for row in rows.itertuples(index=False)
        }
        states[STATE_CODES[state]] = {'name': state, 'index': index}

    write_json('trends.json', {
        'source': 'Google Trends, interest by US state, web search',
        'period': [table['period_start'].min(), table['period_end'].max()],
        'brands': brands,
        'states': dict(sorted(states.items())),
        'flags': FLAGS,
    })
    return len(brands), len(states)


def export_brands():
    """data/brands.csv -> site/data/brands.json, marking which brands have Trends data.

    Two checks stop the export instead of shipping bad data: every brand in the Trends table
    must be in the brand list (the names have to match exactly), and every style must be one
    of the seven the site knows.
    """
    catalog = pd.read_csv(ROOT / 'data' / 'brands.csv', keep_default_na=False)
    trends = pd.read_csv(ROOT / 'data' / 'clean' / 'trends_by_state.csv')
    tracked = set(trends['brand'])

    missing = sorted(tracked - set(catalog['name']))
    if missing:
        raise SystemExit(f'Trends brands missing from data/brands.csv (names must match exactly): {missing}')
    unknown = sorted(set(catalog['style']) - set(STYLE_ORDER))
    if unknown:
        raise SystemExit(f'Unknown styles in data/brands.csv: {unknown}')

    brands = [
        {
            'name': row.name,
            'style': row.style,
            'aliases': [alias for alias in row.aliases.split(';') if alias],
            'trends': row.name in tracked,
        }
        for row in catalog.itertuples(index=False)
    ]
    write_json('brands.json', {'styles': STYLE_ORDER, 'brands': brands})
    return len(brands), sum(brand['trends'] for brand in brands)


def export_climate():
    """data/clean/climate_by_state.csv -> site/data/climate.json: 12 months of weather per state.

    Stops if a state is missing months or a month looks impossible (a high below its low, or a
    temperature outside -40..130 F).
    """
    table = pd.read_csv(ROOT / 'data' / 'clean' / 'climate_by_state.csv', keep_default_na=False)
    manifest = pd.read_csv(ROOT / 'data' / 'raw' / 'climate' / 'MANIFEST.csv', dtype=str)
    problems = []
    states = {}
    for code, rows in table.groupby('state'):
        rows = rows.sort_values('month')
        if list(rows['month']) != list(range(1, 13)):
            problems.append(f'{code}: months {list(rows["month"])}')
        for row in rows.itertuples(index=False):
            if not -40 <= row.low_recent < row.high_recent <= 130:
                problems.append(f'{code} month {row.month}: low {row.low_recent}, high {row.high_recent}')
        states[code] = {
            'name': rows['state_name'].iloc[0],
            'proxyFor': rows['proxy_for'].iloc[0] or None,
            'months': [
                {'high': row.high_recent, 'low': row.low_recent, 'precip': row.precip_recent,
                 'highNormal': row.high_normal, 'change': row.high_change}
                for row in rows.itertuples(index=False)
            ],
        }
    if set(states) != set(STATE_CODES.values()):
        problems.append(f'states missing: {sorted(set(STATE_CODES.values()) - set(states))}')
    if problems:
        raise SystemExit('climate_by_state.csv has problems:\n  ' + '\n  '.join(problems))

    write_json('climate.json', {
        'source': 'NOAA nClimDiv statewide monthly averages',
        'issued': manifest['issued'].max(),
        'recent': [2021, 2025],
        'normal': [1991, 2020],
        'states': dict(sorted(states.items())),
    })
    return len(states)


def write_json(name, payload):
    out = SITE / 'data' / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'wrote {out.relative_to(ROOT)}')


if __name__ == '__main__':
    count = export_closet()
    print(f'{count} closet pieces exported, photos saved to site/img/closet/')
    brand_count, state_count = export_trends()
    print(f'Trends: {brand_count} brands x {state_count} states exported')
    listed, with_data = export_brands()
    print(f'Brands: {listed} listed, {with_data} with Trends data')
    print(f'Climate: {export_climate()} states x 12 months exported')
