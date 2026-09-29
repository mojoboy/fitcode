// Tests for the site's logic, run in the browser: open /tests.html while the local server runs.
// They use the real data pack, so they also catch data changes that would break a rule.
import { loadData } from './data.js';
import { buildProfile, buildOutfit, isStrong, SLOTS } from './model.js';
import { tasteFromSwipes } from './taste.js';
import { parsePlace } from './quiz.js';
import { normalize } from './format.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function same(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

const data = await loadData();
const states = data.trends.states;
const run = (saved, overrides = {}) => {
  const profile = buildProfile(saved, data);
  return { profile, outfit: buildOutfit(data, profile, overrides) };
};
const idsOf = (outfit) => outfit.pieces.map((piece) => piece.pick.item.id);

// A realistic visitor: likes quiet, rugged pieces, lives in Baltimore, works in an office
const SAMPLE = {
  swipes: [
    { id: 'top-denim-jacket', vote: 1 }, { id: 'bottom-folded-jeans', vote: 1 }, { id: 'eyewear-tortoiseshell', vote: 1 },
    { id: 'jewelry-leather-watch', vote: 1 }, { id: 'shoes-penny-loafers', vote: 1 }, { id: 'hat-grey-beanie', vote: 1 },
    { id: 'shoes-chunky-sneakers', vote: -1 }, { id: 'jewelry-gold-chain', vote: -1 }, { id: 'eyewear-mirrored-round', vote: -1 },
    { id: 'hat-mustard-cap', vote: -1 }, { id: 'top-teal-tee', vote: -1 }, { id: 'bottom-light-jeans', vote: -1 },
  ],
  answers: { city: 'Baltimore, MD', week: 'office', fit: 'regular', colors: ['navy', 'brown', 'cream'], inspo: ['quiet', 'workwear'], acc: 'few', nos: ['chains'] },
  brands: ['COS', 'Carhartt', 'Uniqlo'],
};
const withAnswers = (patch) => ({ ...SAMPLE, answers: { ...SAMPLE.answers, ...patch } });

// ---------- Reading what people type ----------

test('parsePlace reads "City, ST"', () => same(parsePlace('Baltimore, MD', states).code, 'MD', 'state code'));
test('parsePlace reads full state names', () => same(parsePlace('Wichita, Kansas', states).code, 'KS', 'state code'));
test('parsePlace reads "D.C." with dots', () => same(parsePlace('Washington, D.C.', states).code, 'DC', 'state code'));
test('parsePlace without a state gives no code', () => same(parsePlace('Baltimore', states).code, null, 'state code'));
test('normalize ignores accents and punctuation', () => {
  same(normalize('Stüssy'), 'stussy', 'Stüssy');
  same(normalize('H&M'), 'h m', 'H&M');
});

// ---------- Taste ----------

test('a like adds 1 point per style and a pass takes away half', () => {
  const byId = new Map(data.closet.items.map((item) => [item.id, item]));
  const taste = tasteFromSwipes([{ id: 'shoes-work-boots', vote: 1 }, { id: 'hat-mustard-cap', vote: -1 }], byId);
  const points = Object.fromEntries(taste.map((t) => [t.key, t.points]));
  same(points.workwear, 1, 'workwear points');
  same(points.streetwear, -0.5, 'streetwear points');
});

// ---------- The model ----------

test('the sample visitor gets a full head-to-toe outfit', () => {
  const { outfit } = run(SAMPLE);
  same(outfit.pieces.map((p) => p.slot), SLOTS, 'slots in order');
});
test('every score is between 0 and 1', () => {
  const { outfit } = run(SAMPLE);
  for (const slot of SLOTS) {
    for (const scored of outfit.ranked[slot]) {
      check(scored.total >= 0 && scored.total <= 1, `${scored.item.id} total ${scored.total}`);
      for (const [key, value] of Object.entries(scored.parts)) check(value >= 0 && value <= 1, `${scored.item.id} ${key} ${value}`);
    }
  }
});
test('the pieces you liked win their slots', () => {
  const ids = idsOf(run(SAMPLE).outfit);
  for (const liked of ['top-denim-jacket', 'bottom-folded-jeans', 'shoes-penny-loafers', 'jewelry-leather-watch']) {
    check(ids.includes(liked), `${liked} should be in ${ids.join(', ')}`);
  }
});
test('hard no: "Chains" removes the chain before scoring', () => {
  const { outfit } = run(SAMPLE);
  check(outfit.removed.some((r) => r.item.id === 'jewelry-gold-chain'), 'chain listed as removed');
  check(!outfit.ranked.jewelry.some((r) => r.item.id === 'jewelry-gold-chain'), 'chain not ranked');
});
test('hard no: "Hats" and "Sunglasses" remove whole slots', () => {
  const slots = run(withAnswers({ nos: ['hats', 'shades'] })).outfit.pieces.map((p) => p.slot);
  check(!slots.includes('hat') && !slots.includes('eyewear'), `slots: ${slots.join(', ')}`);
});
test('accessories: "None" means no hat, eyewear or jewelry', () => {
  same(run(withAnswers({ acc: 'none' })).outfit.pieces.map((p) => p.slot), ['top', 'bottom', 'shoes'], 'slots');
});
test('accessories: "One good piece" means exactly one accessory', () => {
  const slots = run(withAnswers({ acc: 'one' })).outfit.pieces.map((p) => p.slot);
  same(slots.filter((s) => ['hat', 'eyewear', 'jewelry'].includes(s)).length, 1, 'accessory count');
});
test('accessories: "Stack it" adds a second piece of jewelry', () => {
  const pieces = run(withAnswers({ acc: 'stack', nos: [] })).outfit.pieces;
  const jewelry = pieces.filter((p) => p.slot === 'jewelry');
  same(jewelry.length, 2, 'jewelry pieces');
  check(jewelry[0].pick !== jewelry[1].pick, 'two different pieces');
});
test('color rule: at most one strong color in any outfit', () => {
  // A visitor who likes every loud piece
  const loud = {
    swipes: ['hat-mustard-cap', 'eyewear-rose-aviators', 'top-teal-tee', 'top-oxblood-overshirt', 'jewelry-gold-chain']
      .map((id) => ({ id, vote: 1 })),
    answers: { colors: ['rust', 'burgundy', 'forest'] },
    brands: [],
  };
  for (const saved of [SAMPLE, loud]) {
    const strong = run(saved).outfit.pieces.filter((p) => isStrong(p.pick.item));
    check(strong.length <= 1, `strong pieces: ${strong.map((p) => p.pick.item.id).join(', ')}`);
  }
});
test('trends: Maryland scores minimal from its minimal brands (Uniqlo 1.74, COS 1.34)', () => {
  const { profile } = run(SAMPLE);
  check(Math.abs(profile.styleTrends.minimal - 1.54) < 0.001, `minimal = ${profile.styleTrends.minimal}`);
});
test('trends: a flagged state (Kansas) adds nothing', () => {
  const { profile, outfit } = run(withAnswers({ city: 'Wichita, KS' }));
  same(profile.styleTrends, null, 'styleTrends');
  check(!outfit.used.some((w) => w.key === 'trends'), 'trends not used');
});
test('the weights that are used always add up to 100%', () => {
  for (const saved of [SAMPLE, withAnswers({ colors: [], week: undefined }), { swipes: [], answers: {}, brands: [] }]) {
    const { outfit } = run(saved);
    const piece = outfit.pieces[0].pick;
    const share = outfit.used.reduce((sum, w) => sum + w.pct / piece.weightSum, 0);
    check(Math.abs(share - 1) < 1e-9 || outfit.used.length === 0, `shares add to ${share}`);
  }
});
test('your own swap is kept', () => {
  const { outfit } = run(SAMPLE, { top: 'top-sage-tee' });
  const top = outfit.pieces.find((p) => p.slot === 'top');
  same(top.pick.item.id, 'top-sage-tee', 'top');
  check(top.yours, 'marked as yours');
});
test('same answers, same outfit (no randomness in the model)', () => {
  same(idsOf(run(SAMPLE).outfit), idsOf(run(SAMPLE).outfit), 'outfit');
});
test('a visitor who skipped everything still gets an outfit', () => {
  const { outfit } = run({ swipes: [], answers: {}, brands: [] });
  check(outfit.pieces.length >= 3, `pieces: ${outfit.pieces.length}`);
});

// ---------- Show the results ----------

const failed = results.filter((r) => !r.ok);
document.title = failed.length ? `✗ ${failed.length} failed · fitcode tests` : `✓ all ${results.length} passed · fitcode tests`;
document.getElementById('summary').textContent = failed.length
  ? `${failed.length} of ${results.length} tests failed`
  : `All ${results.length} tests passed`;
document.getElementById('results').append(...results.map((r) => {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`;
  return li;
}));
document.body.dataset.done = 'true';
document.body.dataset.failed = String(failed.length);
window.testResults = results;
