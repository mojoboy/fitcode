"""Checks on the website's data pack (site/data/*.json).

Standard library only, so it runs anywhere, including on GitHub:
    python -m unittest discover -s tests -v
"""
import json
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / 'site'
STYLES = {'streetwear', 'athleisure', 'minimal', 'smart', 'trend', 'vintage', 'workwear'}
WEARABLE = {'hat', 'eyewear', 'jewelry', 'top', 'bottom', 'shoes'}


def load(name):
    return json.loads((SITE / 'data' / name).read_text(encoding='utf-8'))


def webp_metadata(path):
    """A WebP file is a list of labeled chunks (RIFF). Returns the metadata chunks it has."""
    data = path.read_bytes()
    found, at = set(), 12   # skip the 12-byte header: 'RIFF', the file size, 'WEBP'
    while at + 8 <= len(data):
        label, size = data[at:at + 4], int.from_bytes(data[at + 4:at + 8], 'little')
        if label in (b'EXIF', b'XMP '):
            found.add(label.decode().strip())
        at += 8 + size + (size % 2)   # chunks are padded to an even length
    return found


class ClosetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items = load('closet.json')['items']
        cls.wearable = [item for item in cls.items if item['slot'] in WEARABLE]

    def test_ids_are_unique(self):
        ids = [item['id'] for item in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_photo_exists(self):
        for item in self.items:
            self.assertTrue((SITE / item['img']).is_file(), item['img'])

    def test_slots_and_styles_are_known(self):
        for item in self.items:
            self.assertIn(item['slot'], WEARABLE | {'mood'}, item['id'])
            self.assertTrue(item['styles'], item['id'])
            self.assertLessEqual(set(item['styles']), STYLES, item['id'])

    def test_every_wearable_piece_is_tagged(self):
        for item in self.wearable:
            self.assertTrue(item['colors'], f"{item['id']} has no colors")
            self.assertIn(item['formality'], (1, 2, 3), item['id'])
            self.assertIn(item['warmth'], (None, 1, 2, 3), item['id'])
            self.assertIsInstance(item['lifestyle'], list, item['id'])
            self.assertIsInstance(item['flags'], list, item['id'])

    def test_every_slot_has_something_to_swap_to(self):
        for slot in WEARABLE:
            count = sum(item['slot'] == slot for item in self.wearable)
            self.assertGreaterEqual(count, 2, f'only {count} piece(s) for {slot}')

    def test_no_photo_carries_hidden_data(self):
        """Phone photos hide the GPS location and camera in metadata (EXIF / XMP). Both the
        site's WebP copies and the JPGs in assets/closet/ are public, so neither may have any."""
        for item in self.items:
            self.assertEqual(webp_metadata(SITE / item['img']), set(), item['img'])
        for photo in (SITE.parent / 'assets' / 'closet').glob('*.jpg'):
            self.assertNotIn(b'Exif\x00\x00', photo.read_bytes()[:65536], photo.name)

    def test_own_pieces_are_marked(self):
        own = [item for item in self.items if item['own']]
        self.assertTrue(own, "no pieces from David's closet")
        for item in own:
            self.assertIsNone(item['source'], f"{item['id']} is David's photo, so it has no stock source")


class BrandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.brands = load('brands.json')['brands']
        cls.tracked = set(load('trends.json')['brands'])

    def test_names_are_unique(self):
        names = [brand['name'] for brand in self.brands]
        self.assertEqual(len(names), len(set(names)))

    def test_styles_are_known(self):
        for brand in self.brands:
            self.assertIn(brand['style'], STYLES, brand['name'])

    def test_trends_flag_matches_the_trends_table(self):
        listed = {brand['name'] for brand in self.brands}
        self.assertLessEqual(self.tracked, listed, 'a Trends brand is missing from the brand list')
        for brand in self.brands:
            self.assertEqual(brand['trends'], brand['name'] in self.tracked, brand['name'])


class TrendsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.trends = load('trends.json')
        cls.states = cls.trends['states']

    def test_fifty_states_and_dc(self):
        self.assertEqual(len(self.states), 51)
        self.assertIn('DC', self.states)

    def test_every_state_lists_every_brand(self):
        for code, state in self.states.items():
            self.assertEqual(set(state['index']), set(self.trends['brands']), code)

    def test_indexes_are_positive_or_missing(self):
        for code, state in self.states.items():
            for brand, value in state['index'].items():
                self.assertTrue(value is None or value > 0, f'{code} {brand}: {value}')

    def test_flags_point_at_real_states(self):
        for code in self.trends['flags']:
            self.assertIn(code, self.states)


class ClimateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.states = load('climate.json')['states']

    def test_same_places_as_the_trends_data(self):
        self.assertEqual(set(self.states), set(load('trends.json')['states']))

    def test_twelve_months_each_with_highs_above_lows(self):
        for code, state in self.states.items():
            self.assertEqual(len(state['months']), 12, code)
            for month in state['months']:
                self.assertLess(month['low'], month['high'], code)
                self.assertGreaterEqual(month['precip'], 0, code)

    def test_dc_borrows_marylands_numbers(self):
        self.assertEqual(self.states['DC']['proxyFor'], 'MD')
        self.assertEqual(self.states['DC']['months'], self.states['MD']['months'])


if __name__ == '__main__':
    unittest.main()
