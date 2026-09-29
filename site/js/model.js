// The scoring model: turns your swipes, answers and brands into an outfit, and keeps every
// number so each pick can explain itself.
//
//   1. Hard no's first: pieces you'd never wear are removed before anything is scored.
//   2. Every remaining piece gets a score from 0 to 1 on each signal:
//        Your style 50% · Climate fit 20% · Trends near you 15% · Color match 10% · Lifestyle fit 5%
//      A signal with nothing to go on (a skipped question, or weather for a pair of sunglasses) is
//      left out, and the other weights are scaled up so they still add up to 100%.
//   3. The best piece in each slot wins, head to toe. Then the color rule: at most one strong
//      (not neutral) color per outfit.
import { WEIGHTS, WEEKS, FITS, PALETTE, INSPIRATIONS, NEVER, parsePlace } from './quiz.js';
import { STYLES } from './taste.js';

export const SLOTS = ['hat', 'eyewear', 'jewelry', 'top', 'bottom', 'shoes'];
export const SLOT_NAMES = { hat: 'Hat', eyewear: 'Eyewear', jewelry: 'Jewelry', top: 'Top', bottom: 'Bottoms', shoes: 'Shoes' };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// What the weather asks for, from your state's average high: a cold month wants warm pieces (3),
// a mild one mid-weight pieces (2), a hot one light pieces (1). Pieces carry the same 1-3 warmth tag.
export function warmthFor(high) {
  if (high < 50) return 3;
  if (high < 72) return 2;
  return 1;
}

const ACCESSORY_SLOTS = ['hat', 'eyewear', 'jewelry'];

// How many style points each source adds
const POINTS = { like: 1, pass: -0.5, inspiration: 1, brand: 0.5 };
// Your swipe on a piece is the strongest evidence there is, so it sets that piece's style score.
// Pieces you didn't swipe are judged by their styles and top out at 0.75, a clear step below a real
// like: an unseen piece only beats one you liked when the other signals strongly favor it.
const LIKED = 1;
const PASSED = 0.1;
const INFERRED_MAX = 0.75;
const FIT_STEPS = [1, 0.8, 0.55, 0.4];   // your fit vs the piece's: same, 1 step apart, 2 steps, 3 steps

// Everything the model knows about you, built from what's saved in the browser
export function buildProfile(saved, data) {
  const swipes = saved.swipes || [];
  const answers = saved.answers || {};
  const picks = saved.brands || [];
  const itemsById = new Map(data.closet.items.map((item) => [item.id, item]));
  const brandStyle = new Map(data.brands.brands.map((brand) => [brand.name, brand.style]));

  // Style points from three sources: your swipes, your inspiration picks and your brands
  const points = Object.fromEntries(Object.keys(STYLES).map((style) => [style, 0]));
  const add = (style, amount) => { if (style in points) points[style] += amount; };
  for (const { id, vote } of swipes) {
    const item = itemsById.get(id);
    if (item) item.styles.forEach((style) => add(style, vote > 0 ? POINTS.like : POINTS.pass));
  }
  for (const key of answers.inspo || []) {
    const idea = INSPIRATIONS.find((option) => option.key === key);
    if (idea) idea.styles.forEach((style) => add(style, POINTS.inspiration));
  }
  for (const name of picks) add(brandStyle.get(name), POINTS.brand);   // brands you typed in have no style, so they add nothing

  // Each style's score compared with your top style (your top style = 1), and each style's share for display
  const top = Math.max(0, ...Object.values(points));
  const positive = Object.values(points).reduce((sum, p) => sum + Math.max(0, p), 0);
  const styleScore = {};
  for (const [style, p] of Object.entries(points)) styleScore[style] = top > 0 ? Math.max(0, p) / top : 0;
  const mix = Object.entries(points)
    .map(([key, p]) => ({ key, name: STYLES[key], share: positive ? Math.max(0, p) / positive : 0 }))
    .sort((a, b) => b.share - a.share);

  // Trends near you: in your state, the average index of the brands we track in each style.
  // A flagged state (Kansas) is left out until its data is checked.
  const place = parsePlace(answers.city, data.trends.states);
  const state = place.code ? data.trends.states[place.code] : null;
  const flagged = Boolean(state && data.trends.flags && data.trends.flags[place.code]);
  let styleTrends = null;
  if (state && !flagged) {
    const byStyle = {};
    for (const brand of data.brands.brands) {
      const value = state.index[brand.name];
      if (value === null || value === undefined) continue;
      (byStyle[brand.style] = byStyle[brand.style] || []).push(value);
    }
    styleTrends = {};
    for (const [style, values] of Object.entries(byStyle)) styleTrends[style] = mean(values);
  }

  // Weather: your state's 2021-2025 average for the month you're dressing for (this month, or the month
  // saved in a shared link). NOAA's statewide files leave out Washington, D.C., so it uses Maryland's.
  const month = Number.isInteger(saved.month) ? saved.month : new Date().getMonth();
  const climate = state && data.climate.states[place.code];
  const weather = climate ? climate.months[month] : null;

  const answered = ['city', 'week', 'fit', 'colors', 'inspo', 'acc', 'nos'].filter((key) => {
    const value = answers[key];
    return key === 'nos' ? value !== undefined : Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;

  return {
    points, styleScore, mix,
    hasStyle: top > 0,
    liked: new Set(swipes.filter((s) => s.vote > 0).map((s) => s.id)),
    passed: new Set(swipes.filter((s) => s.vote < 0).map((s) => s.id)),
    fit: answers.fit || null,
    colors: answers.colors || [],
    week: WEEKS.find((week) => week.key === answers.week) || null,
    nos: answers.nos || [],
    accessories: answers.acc || 'few',
    place: state ? { code: place.code, name: place.code === 'DC' ? 'Washington, D.C.' : state.name, flagged } : null,
    styleTrends,
    month,
    weather,
    need: weather ? warmthFor(weather.high) : null,
    weatherProxy: climate ? climate.proxyFor : null,
    counts: { swipes: swipes.length, answered, brands: picks.length },
  };
}

// One piece's score on every signal we have, plus the weighted total
export function scorePiece(item, profile) {
  const parts = {};

  // Your style (50%): your swipe on this exact piece if you made one, otherwise how much you like
  // its styles; then adjusted for fit
  if (profile.hasStyle || profile.fit || profile.liked.size || profile.passed.size) {
    let style;
    if (profile.liked.has(item.id)) style = LIKED;
    else if (profile.passed.has(item.id)) style = PASSED;
    else style = profile.hasStyle ? INFERRED_MAX * mean(item.styles.map((s) => profile.styleScore[s] || 0)) : 0.5;
    if (profile.fit && item.fit) style *= FIT_STEPS[Math.abs(fitStep(profile.fit) - fitStep(item.fit))];
    parts.taste = clamp(style);
  }

  // Climate fit (20%): how close the piece's warmth is to what this month asks for. Same warmth 1,
  // one step off 0.5, two steps off 0. Eyewear and jewelry have no warmth, so weather doesn't touch them.
  if (profile.need && item.warmth) parts.climate = 1 - Math.abs(profile.need - item.warmth) / 2;

  // Trends near you (15%): 1.0x (the average state) scores 0.5, 2x or more scores 1
  if (profile.styleTrends) {
    const values = item.styles.map((s) => profile.styleTrends[s]).filter((v) => v !== undefined);
    parts.trends = values.length ? clamp(mean(values) / 2) : 0.5;
  }

  // Color match (10%): one of your colors 1, close to one 0.7, a neutral 0.5, anything else 0.15
  if (profile.colors.length) parts.color = colorMatch(item.colors, profile.colors);

  // Lifestyle fit (5%): suits your kind of week, or not
  if (profile.week) parts.life = item.lifestyle.some((tag) => profile.week.wants.includes(tag)) ? 1 : 0.35;

  // The total: a weighted average of the signals we have. If, say, climate is missing, the rest add
  // up to 80, so "your style" counts 50/80 = 62.5% of the total.
  const used = WEIGHTS.filter((w) => parts[w.key] !== undefined);
  const weightSum = used.reduce((sum, w) => sum + w.pct, 0);
  const total = weightSum ? used.reduce((sum, w) => sum + w.pct * parts[w.key], 0) / weightSum : 0.5;
  return { item, parts, total, weightSum };
}

// Plain-language reasons for a pick, strongest first
export function explain(scored, profile) {
  const { item, parts } = scored;
  const weightOf = (key) => WEIGHTS.find((w) => w.key === key).pct;
  const reasons = [];

  if (parts.taste !== undefined) {
    if (profile.liked.has(item.id)) {
      reasons.push({ key: 'taste', label: 'Your swipes', text: 'You liked it in the warm-up.' });
    } else {
      const best = item.styles
        .map((style) => ({ style, share: (profile.mix.find((m) => m.key === style) || {}).share || 0 }))
        .sort((a, b) => b.share - a.share)[0];
      if (best && best.share > 0) {
        reasons.push({ key: 'taste', label: 'Your style', text: `${STYLES[best.style]} makes up ${percent(best.share)} of your style mix.` });
      }
    }
    if (profile.fit && item.fit === profile.fit) {
      reasons.push({ key: 'fit', label: 'Your fit', text: `A ${profile.fit} fit, the way you like it.` });
    }
  }
  if (parts.climate === 1) {
    const where = profile.weatherProxy ? `${profile.place.name} (using Maryland's statewide numbers)` : profile.place.name;
    const fits = { 1: 'lighter pieces fit', 2: 'a mid-weight piece fits', 3: 'something warm fits' }[profile.need];
    reasons.push({
      key: 'climate', label: 'Weather near you · real data',
      text: `${where} averages a ${Math.round(profile.weather.high)}°F high in ${MONTH_NAMES[profile.month]} (2021–2025), so ${fits}.`,
    });
  }
  if (parts.trends !== undefined) {
    const best = item.styles
      .filter((style) => profile.styleTrends[style] !== undefined)
      .map((style) => ({ style, value: profile.styleTrends[style] }))
      .sort((a, b) => b.value - a.value)[0];
    if (best && best.value >= 1.05) {
      reasons.push({
        key: 'trends', label: 'Trends near you · real data',
        text: `People in ${profile.place.name} search ${STYLES[best.style].toLowerCase()} brands ${best.value.toFixed(2)}× as much as the average state.`,
      });
    }
  }
  if (parts.color !== undefined) {
    const exact = item.colors.find((c) => profile.colors.includes(c));
    const near = item.colors.find((c) => (PALETTE[c].near || []).some((n) => profile.colors.includes(n)));
    if (exact) reasons.push({ key: 'color', label: 'Your colors', text: `${PALETTE[exact].label} is one of your colors.` });
    else if (near) {
      const yours = PALETTE[near].near.find((n) => profile.colors.includes(n));
      reasons.push({ key: 'color', label: 'Your colors', text: `${PALETTE[near].label} reads close to your ${PALETTE[yours].label.toLowerCase()}.` });
    } else if (item.colors.every((c) => PALETTE[c].neutral)) {
      reasons.push({ key: 'color', label: 'Your colors', text: 'A neutral, so it works with your colors.' });
    }
  }
  if (parts.life === 1) reasons.push({ key: 'life', label: 'Your week', text: `${profile.week.reason}.` });

  // Strongest first: the signal's weight times how well the piece scored on it
  const strength = (reason) => (reason.key === 'fit' ? 1 : weightOf(reason.key) * parts[reason.key]);
  return reasons.sort((a, b) => strength(b) - strength(a));
}

// The outfit: which slots to fill, the best piece for each, and everything that was ranked
export function buildOutfit(data, profile, overrides = {}) {
  // 1. Hard no's: remove what you'd never wear, before any scoring
  const removed = [];
  const allowed = data.closet.items.filter((item) => {
    if (!SLOTS.includes(item.slot)) return false;   // moodboard photos aren't wearable
    const rule = NEVER.find((never) => profile.nos.includes(never.key)
      && (never.removes.slot === item.slot || item.flags.includes(never.removes.flag)));
    if (rule) removed.push({ item, because: rule.label });
    return !rule;
  });

  // 2. Score every piece and rank each slot, best first
  const ranked = {};
  for (const slot of SLOTS) {
    ranked[slot] = allowed
      .filter((item) => item.slot === slot)
      .map((item) => scorePiece(item, profile))
      .sort((a, b) => b.total - a.total);
  }

  // 3. Which slots to fill: always top, bottoms and shoes; accessories depend on question 6
  const fill = ['top', 'bottom', 'shoes'];
  if (profile.accessories === 'one') {
    const best = ACCESSORY_SLOTS
      .filter((slot) => ranked[slot].length)
      .sort((a, b) => ranked[b][0].total - ranked[a][0].total)[0];
    if (best) fill.push(best);
  } else if (profile.accessories !== 'none') {
    fill.push(...ACCESSORY_SLOTS);
  }

  // 4. The best piece in each slot wins, unless you swapped in another one yourself
  const pieces = SLOTS.filter((slot) => fill.includes(slot) && ranked[slot].length).map((slot) => {
    const chosen = overrides[slot] && ranked[slot].find((r) => r.item.id === overrides[slot]);
    return { slot, key: slot, pick: chosen || ranked[slot][0], ranked: ranked[slot], yours: Boolean(chosen), note: null };
  });
  const jewelry = pieces.findIndex((p) => p.slot === 'jewelry');
  if (profile.accessories === 'stack' && jewelry !== -1 && ranked.jewelry.length > 1) {
    const main = pieces[jewelry].pick;
    const chosen = overrides.jewelry2 && ranked.jewelry.find((r) => r.item.id === overrides.jewelry2 && r !== main);
    pieces.splice(jewelry + 1, 0, {
      slot: 'jewelry', key: 'jewelry2', pick: chosen || ranked.jewelry.find((r) => r !== main),
      ranked: ranked.jewelry, yours: Boolean(chosen), note: null,
    });
  }

  // 5. The color rule: keep one strong color (one you chose yourself wins, otherwise the best-scoring),
  //    and swap any other strong piece for the best neutral one in its slot. Your own swaps are never undone.
  const strong = pieces
    .filter((p) => isStrong(p.pick.item))
    .sort((a, b) => Number(b.yours) - Number(a.yours) || b.pick.total - a.pick.total);
  for (const piece of strong.slice(1)) {
    if (piece.yours) continue;
    const neutral = piece.ranked.find((r) => !isStrong(r.item) && !pieces.some((other) => other.pick === r));
    if (neutral) {
      piece.note = `${piece.pick.item.name} was swapped for a neutral: one strong color per outfit.`;
      piece.pick = neutral;
    }
  }

  // The signals at least one piece used (eyewear and jewelry skip the weather, for example)
  const used = WEIGHTS.filter((w) => pieces.some((p) => p.pick.parts[w.key] !== undefined));
  return { pieces, removed, ranked, used };
}

// A two-word name for the outfit from your top two styles: minimal + workwear = "Quiet utility."
const ADJECTIVES = { minimal: 'Quiet', workwear: 'Rugged', streetwear: 'Street', athleisure: 'Easy', smart: 'Sharp', vintage: 'Worn-in', trend: 'Fresh' };
const NOUNS = { minimal: 'basics', workwear: 'utility', streetwear: 'edge', athleisure: 'sport', smart: 'tailoring', vintage: 'classics', trend: 'edge' };
export function outfitName(profile) {
  const [first, second] = profile.mix.filter((m) => m.share > 0);
  if (!first) return 'Your fit.';
  return `${ADJECTIVES[first.key]} ${NOUNS[(second || first).key]}.`;
}

// Which signals had nothing to go on, and why. Their weight is shared by the other signals.
export function leftOut(profile) {
  const name = (key) => WEIGHTS.find((w) => w.key === key).name;
  const missing = [];
  if (!(profile.hasStyle || profile.fit || profile.liked.size || profile.passed.size)) missing.push(`${name('taste')} (nothing swiped or picked yet)`);
  if (!profile.weather) missing.push(`${name('climate')} (no state from question 1)`);
  if (!profile.styleTrends) {
    missing.push(`${name('trends')} (${profile.place && profile.place.flagged ? `${profile.place.name}'s data is flagged` : 'no state from question 1'})`);
  }
  if (!profile.colors.length) missing.push(`${name('color')} (no colors picked)`);
  if (!profile.week) missing.push(`${name('life')} (question 2 skipped)`);
  if (!missing.length) return 'Every signal had data for this outfit.';
  return `Not in this score: ${missing.join(', ')}. Their weight is shared by the other signals.`;
}

// Which body part each piece sits on, for the head-to-toe labels
export function bodyPart(piece) {
  if (piece.slot === 'jewelry') return piece.pick.item.flags.includes('chain') ? 'Neck' : 'Wrist';
  return { hat: 'Head', eyewear: 'Eyes', top: 'Torso', bottom: 'Legs', shoes: 'Feet' }[piece.slot];
}

export function isStrong(item) {
  return item.colors.some((color) => !PALETTE[color].neutral);
}

function colorMatch(itemColors, yours) {
  if (itemColors.some((c) => yours.includes(c))) return 1;
  if (itemColors.some((c) => (PALETTE[c].near || []).some((n) => yours.includes(n)))) return 0.7;
  if (itemColors.every((c) => PALETTE[c].neutral)) return 0.5;
  return 0.15;
}

function fitStep(key) {
  return FITS.findIndex((fit) => fit.key === key);
}

function mean(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function percent(share) {
  return `${Math.round(share * 100)}%`;
}
