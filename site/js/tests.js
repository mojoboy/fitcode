// Tests for the site's logic, run in the browser: open /tests.html while the local server runs.
// They use the real data pack, so they also catch data changes that would break a rule.
import { loadData } from './data.js';
import { buildProfile, buildOutfit, isStrong, warmthFor, leftOut, SLOTS } from './model.js';
import { tasteFromSwipes } from './taste.js';
import { parsePlace, WEIGHTS } from './quiz.js';
import { normalize, wholePercents } from './format.js';
import { encodeFit, decodeFit } from './share.js';
import { renderMusic, tickNote } from './sound.js';

const results = [];
const waiting = [];   // tests that take a while (like recording the music) finish in the background
function test(name, fn) {
  const pass = () => results.push({ name, ok: true });
  const fail = (error) => results.push({ name, ok: false, error: error.message });
  try {
    const outcome = fn();
    if (outcome instanceof Promise) waiting.push(outcome.then(pass, fail));
    else pass();
  } catch (error) {
    fail(error);
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

// A realistic visitor: likes quiet, rugged pieces, lives in Baltimore, works in an office.
// month 9 = October (months count from 0), a mild 69°F month in Maryland, so every test gets the
// same weather no matter when it runs.
const SAMPLE = {
  swipes: [
    { id: 'top-carhartt-jacket', vote: 1 }, { id: 'bottom-blue-baggy-jeans', vote: 1 }, { id: 'eyewear-tortoiseshell', vote: 1 },
    { id: 'jewelry-leather-watch', vote: 1 }, { id: 'shoes-penny-loafers', vote: 1 }, { id: 'hat-grey-beanie', vote: 1 },
    { id: 'shoes-chunky-sneakers', vote: -1 }, { id: 'jewelry-gold-chain', vote: -1 }, { id: 'eyewear-mirrored-round', vote: -1 },
    { id: 'hat-mustard-cap', vote: -1 }, { id: 'top-teal-tee', vote: -1 }, { id: 'bottom-star-patch-jeans', vote: -1 },
  ],
  answers: { city: 'Baltimore, MD', week: 'office', fit: 'regular', colors: ['navy', 'brown', 'cream'], inspo: ['quiet', 'workwear'], acc: 'few', nos: ['chains'] },
  brands: ['COS', 'Carhartt', 'Uniqlo'],
  month: 9,
};
const withAnswers = (patch) => ({ ...SAMPLE, answers: { ...SAMPLE.answers, ...patch } });

// ---------- Reading what people type ----------

test('parsePlace reads "City, ST"', () => same(parsePlace('Baltimore, MD', states).code, 'MD', 'state code'));
test('parsePlace reads full state names', () => same(parsePlace('Wichita, Kansas', states).code, 'KS', 'state code'));
test('parsePlace reads "D.C." with dots', () => same(parsePlace('Washington, D.C.', states).code, 'DC', 'state code'));
test('parsePlace without a state gives no code', () => same(parsePlace('Baltimore', states).code, null, 'state code'));
test('parsePlace reads a state on its own ("Maryland", "MD")', () => {
  same(parsePlace('Maryland', states).code, 'MD', 'Maryland');
  same(parsePlace('MD', states).code, 'MD', 'MD');
});
test('parsePlace ignores two lowercase letters, so typing "Al" for Albany isn\'t Alabama', () => {
  same(parsePlace('Al', states).code, null, 'Al');
});
test('wholePercents adds up to exactly 100 (plain rounding gives 101 here)', () => {
  same(wholePercents([50, 15, 10, 5]), [63, 19, 12, 6], 'no weather');
  same(wholePercents([50, 20, 15, 10, 5]), [50, 20, 15, 10, 5], 'every signal');
  same(wholePercents([]), [], 'nothing');
});
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
  for (const liked of ['top-carhartt-jacket', 'bottom-blue-baggy-jeans', 'shoes-penny-loafers', 'jewelry-leather-watch']) {
    check(ids.includes(liked), `${liked} should be in ${ids.join(', ')}`);
  }
});
// Two swipes, and an unseen cobalt tee that trends better in Maryland and sits close to navy
const LIKED_VS_UNSEEN = {
  swipes: [{ id: 'top-carhartt-jacket', vote: 1 }, { id: 'shoes-penny-loafers', vote: 1 }],
  answers: { city: 'Baltimore, MD', colors: ['navy'], acc: 'none' },
  brands: ['COS'],
};
test('a liked piece beats an unseen one even when trends and color lean the other way', () => {
  // Found by testing: the unseen cobalt tee used to beat the jacket the visitor had liked.
  // The weather is switched off here to test just that; the next test adds it back.
  const profile = buildProfile(LIKED_VS_UNSEEN, data);
  profile.need = null;
  check(idsOf(buildOutfit(data, profile)).includes('top-carhartt-jacket'), 'the liked work jacket should be the top');
});
test('the weather can outvote a like: a Maryland September picks the tee, a January the jacket', () => {
  // A trade-off, on purpose: weather is 20% of the score. In a 79°F September the light tee gets the
  // full climate score and the warm work jacket none, and with trends and color that's enough to win.
  const top = (month) => idsOf(run({ ...LIKED_VS_UNSEEN, month }).outfit).find((id) => id.startsWith('top-'));
  same(top(8), 'top-cobalt-tee', 'September');
  same(top(0), 'top-carhartt-jacket', 'January');
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
    swipes: ['hat-mustard-cap', 'eyewear-rose-aviators', 'top-teal-tee', 'top-pink-sweater', 'jewelry-gold-chain']
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
test('trends: a flagged state (Kansas) adds nothing, but still gets its weather', () => {
  const { profile, outfit } = run(withAnswers({ city: 'Wichita, KS' }));
  same(profile.styleTrends, null, 'styleTrends');
  check(!outfit.used.some((w) => w.key === 'trends'), 'trends not used');
  check(profile.weather !== null, 'the flag is about Trends only, so Kansas weather is used');
});
test("every piece's weights add up to 100%, whatever was left out", () => {
  const skipped = { swipes: [], answers: {}, brands: [] };
  for (const saved of [SAMPLE, withAnswers({ colors: [], week: undefined }), withAnswers({ nos: ['hats'] }), skipped]) {
    for (const { pick } of run(saved).outfit.pieces) {
      const share = WEIGHTS.filter((w) => pick.parts[w.key] !== undefined).reduce((sum, w) => sum + w.pct / pick.weightSum, 0);
      check(Object.keys(pick.parts).length === 0 || Math.abs(share - 1) < 1e-9, `${pick.item.id}: shares add to ${share}`);
    }
  }
});

// ---------- Weather ----------

const inState = (city, month) => run({ swipes: [], answers: { city }, brands: [], month });
test('weather: under 50°F asks for warm pieces, under 72°F mid-weight, then light', () => {
  same([warmthFor(21), warmthFor(49.9), warmthFor(50), warmthFor(71.9), warmthFor(72), warmthFor(95)], [3, 3, 2, 2, 1, 1], 'warmth');
});
test('weather: a Minnesota January (21°F) wants the beanie, not the cap', () => {
  const { profile, outfit } = inState('Minneapolis, MN', 0);
  same(profile.need, 3, 'need');
  const hat = (id) => outfit.ranked.hat.find((r) => r.item.id === id).parts.climate;
  same([hat('hat-grey-beanie'), hat('hat-mustard-cap')], [1, 0], 'beanie, cap');
});
test('weather: a Texas July (95°F) wants a tee over a jacket', () => {
  const { profile, outfit } = inState('Austin, TX', 6);
  same(profile.need, 1, 'need');
  const top = (id) => outfit.ranked.top.find((r) => r.item.id === id).parts.climate;
  same([top('top-sage-tee'), top('top-brown-leather-jacket')], [1, 0.5], 'tee, jacket');
});
test("weather: Washington, D.C. uses Maryland's numbers and says so", () => {
  const { profile } = inState('Washington, DC', 6);
  same(profile.weather, data.climate.states.MD.months[6], 'July weather');
  same(profile.weatherProxy, 'MD', 'proxy');
});
test('weather: eyewear and jewelry are never scored on it', () => {
  const { outfit } = run(SAMPLE);
  check(outfit.used.some((w) => w.key === 'climate'), 'climate used by the outfit');
  for (const slot of ['eyewear', 'jewelry']) {
    check(outfit.ranked[slot].every((r) => r.parts.climate === undefined), `${slot} has a climate score`);
  }
});
test('weather: no state means no climate score, and the page says why', () => {
  const { profile, outfit } = run({ swipes: [], answers: { city: 'Baltimore' }, brands: [], month: 0 });
  check(!outfit.used.some((w) => w.key === 'climate'), 'climate not used');
  check(leftOut(profile).includes('no state from question 1'), leftOut(profile));
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

// ---------- Share links ----------

test('a share link rebuilds the same outfit, without the city or typed-in brands', () => {
  const saved = { ...SAMPLE, brands: [...SAMPLE.brands, 'zzbrand'], customBrands: ['zzbrand'], overrides: { top: 'top-sage-tee' } };
  const decoded = decodeFit(encodeFit(saved, data, saved.month));
  same(idsOf(run(decoded, decoded.overrides).outfit), idsOf(run(saved, saved.overrides).outfit), 'outfit');
  check(!JSON.stringify(decoded).includes('Baltimore'), 'the city should be left out');
  same(parsePlace(decoded.answers.city, states).code, 'MD', 'state kept');
  check(!decoded.brands.includes('zzbrand'), 'typed-in brand should be left out');
});
test('a share link keeps the month, so the weather matches', () => same(decodeFit(encodeFit(SAMPLE, data, 9)).month, 9, 'month'));
test('an older share link without a month still opens, using this month', () => {
  const old = btoa(JSON.stringify({ v: 1, swipes: [], answers: {}, brands: [], overrides: {} }));
  const decoded = decodeFit(old);
  check(decoded !== null, 'decoded');
  same(decoded.month, undefined, 'month');
});
test('a broken share link is rejected, not half-read', () => same(decodeFit('not-a-real-link'), null, 'decoded'));

// ---------- Sound ----------

test('tap sounds snap to the music\'s key: 620 Hz -> D, 880 Hz -> A, 1320 Hz -> E', () => {
  same([620, 880, 1320].map(tickNote), [74, 81, 88], 'notes');
});
test('the music plays 8 bars without going silent or distorting', async () => {
  // Records the music silently, then measures it. Sound distorts ("clips") at 1.0.
  const { samples } = await renderMusic(8);
  let peak = 0;
  let sum = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples.length);   // the average loudness
  check(Number.isFinite(peak), 'the recording has broken values');
  check(peak < 0.95, `peak ${peak.toFixed(2)}: too close to distorting`);
  check(rms > 0.05, `average loudness ${rms.toFixed(3)}: too quiet`);
});

// ---------- Show the results ----------

await Promise.all(waiting);

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
