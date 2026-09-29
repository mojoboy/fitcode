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


if __name__ == '__main__':
    unittest.main()
