// The questions and their options, written as plain data. The questions page draws them, and
// the scoring model (build step 5) reads the same definitions, so the two can never disagree.

// How much each signal counts in an outfit's score. They add up to 100.
export const WEIGHTS = [
  { key: 'taste', name: 'Your style', pct: 50 },
  { key: 'climate', name: 'Climate fit', pct: 20 },
  { key: 'trends', name: 'Trends near you', pct: 15 },
  { key: 'color', name: 'Color match', pct: 10 },
  { key: 'life', name: 'Lifestyle fit', pct: 5 },
];

export const CITIES = ['Baltimore, MD', 'Washington, DC', 'Atlanta, GA', 'Los Angeles, CA', 'Chicago, IL', 'New York, NY'];

// wants = the lifestyle tags (data/closet_tags.csv) that suit that kind of week
export const WEEKS = [
  { key: 'office', label: 'Office or hybrid', sub: 'Desk days, a few meetings', wants: ['polished'], reason: 'Polished enough for the office' },
  { key: 'campus', label: 'Campus', sub: 'Classes, walking, layers', wants: ['comfort', 'layer'], reason: 'Easy to wear through a day of classes' },
  { key: 'feet', label: 'On my feet all day', sub: 'Retail, service, trades', wants: ['sturdy', 'comfort'], reason: 'Built for days on your feet' },
  { key: 'home', label: 'Mostly at home', sub: 'Comfort comes first', wants: ['comfort'], reason: 'Comfortable for days at home' },
  { key: 'creative', label: 'Creative work', sub: 'Studios, shoots, events', wants: ['statement'], reason: 'A bit of personality for creative work' },
  { key: 'move', label: 'Always on the move', sub: 'Commutes and travel', wants: ['comfort', 'layer'], reason: 'Easy to wear on the move' },
];

// Each fit has a small T-shirt outline (an SVG path) that gets wider from slim to oversized
export const FITS = [
  { key: 'slim', label: 'Slim', sub: 'Close to the body', path: 'M26 12 C29 16 35 16 38 12 L42 14 L49 24 L44 28 L42 24 L42 54 L22 54 L22 24 L20 28 L15 24 L22 14 Z' },
  { key: 'regular', label: 'Regular', sub: 'True to size', path: 'M26 12 C29 16 35 16 38 12 L44 14 L51 24 L46 28 L44 24 L44 54 L20 54 L20 24 L18 28 L13 24 L20 14 Z' },
  { key: 'relaxed', label: 'Relaxed', sub: 'A little room', path: 'M26 12 C29 16 35 16 38 12 L46 14 L54 25 L49 29 L46 25 L46 55 L18 55 L18 25 L15 29 L10 25 L18 14 Z' },
  { key: 'oversized', label: 'Oversized', sub: 'Big on purpose', path: 'M25 12 C29 16 35 16 39 12 L49 15 L57 28 L52 32 L49 28 L49 56 L15 56 L15 28 L12 32 L7 28 L15 15 Z' },
];

export const MAX_COLORS = 3;
export const COLORS = [
  { key: 'black', label: 'Black', hex: '#151515' },
  { key: 'white', label: 'White', hex: '#F4F3EF' },
  { key: 'grey', label: 'Grey', hex: '#9C9C98' },
  { key: 'navy', label: 'Navy', hex: '#26314A' },
  { key: 'denim', label: 'Denim', hex: '#5B7BA3' },
  { key: 'olive', label: 'Olive', hex: '#5E6344' },
  { key: 'forest', label: 'Forest', hex: '#2F4A3A' },
  { key: 'khaki', label: 'Khaki', hex: '#B89F77' },
  { key: 'brown', label: 'Brown', hex: '#6B4A32' },
  { key: 'cream', label: 'Cream', hex: '#EAE1CD' },
  { key: 'burgundy', label: 'Burgundy', hex: '#6E2430' },
  { key: 'rust', label: 'Rust', hex: '#B5552E' },
];

// Every color a piece can have. neutral = goes with anything. near = the quiz colors it reads close to.
export const PALETTE = {
  black: { label: 'Black', hex: '#151515', neutral: true },
  white: { label: 'White', hex: '#F4F3EF', neutral: true },
  grey: { label: 'Grey', hex: '#9C9C98', neutral: true },
  navy: { label: 'Navy', hex: '#26314A', neutral: true },
  denim: { label: 'Denim', hex: '#5B7BA3', neutral: true },
  olive: { label: 'Olive', hex: '#5E6344', neutral: true },
  khaki: { label: 'Khaki', hex: '#B89F77', neutral: true },
  brown: { label: 'Brown', hex: '#6B4A32', neutral: true },
  cream: { label: 'Cream', hex: '#EAE1CD', neutral: true },
  gold: { label: 'Gold', hex: '#C9A24A', neutral: true },
  silver: { label: 'Silver', hex: '#B8BCC2', neutral: true },
  forest: { label: 'Forest', hex: '#2F4A3A' },
  burgundy: { label: 'Burgundy', hex: '#6E2430' },
  rust: { label: 'Rust', hex: '#B5552E' },
  teal: { label: 'Teal', hex: '#2E8A7A', near: ['forest', 'denim'] },
  cobalt: { label: 'Cobalt', hex: '#3E5E9A', near: ['denim', 'navy'] },
  sage: { label: 'Sage', hex: '#9CAF88', near: ['olive', 'grey'] },
  mustard: { label: 'Mustard', hex: '#C29A3A', near: ['khaki', 'rust'] },
  pink: { label: 'Pink', hex: '#E3A6B4', near: ['burgundy'] },
};

// Each idea maps to one or two of the seven styles in taste.js
export const INSPIRATIONS = [
  { key: 'scandi', label: 'Scandi minimal', styles: ['minimal'] },
  { key: 'workwear', label: 'Workwear', styles: ['workwear'] },
  { key: 'skate', label: '90s skate', styles: ['streetwear', 'vintage'] },
  { key: 'quiet', label: 'Quiet luxury', styles: ['smart', 'minimal'] },
  { key: 'gorp', label: 'Gorpcore', styles: ['workwear', 'athleisure'] },
  { key: 'tokyo', label: 'Tokyo street', styles: ['streetwear', 'trend'] },
  { key: 'oldmoney', label: 'Old money', styles: ['smart'] },
  { key: 'y2k', label: 'Y2K', styles: ['trend'] },
  { key: 'tech', label: 'Techwear', styles: ['athleisure', 'streetwear'] },
  { key: 'thrift', label: 'Vintage thrift', styles: ['vintage'] },
];

// dots = how many accessory slots get filled (hat, eyewear, jewelry, plus extra jewelry)
export const ACCESSORIES = [
  { key: 'none', label: 'None', sub: 'Just the clothes', dots: 0, slots: 'None: no hat, eyewear or jewelry' },
  { key: 'one', label: 'One good piece', sub: 'One accessory that matters', dots: 1, slots: 'One: whichever accessory scores best' },
  { key: 'few', label: 'A few', sub: 'Hat, glasses, one piece of jewelry', dots: 3, slots: 'Hat · Eyewear · Jewelry' },
  { key: 'stack', label: 'Stack it', sub: 'Layered jewelry, the works', dots: 4, slots: 'Hat · Eyewear · Jewelry, layered' },
];

// removes = what each "never" takes out: a whole slot, or pieces carrying a flag in data/closet_tags.csv
export const NEVER = [
  { key: 'skinny', label: 'Skinny jeans', removes: { flag: 'skinny' } },
  { key: 'logos', label: 'Big logos', removes: { flag: 'logo' } },
  { key: 'shorts', label: 'Shorts', removes: { flag: 'shorts' } },
  { key: 'prints', label: 'Loud prints', removes: { flag: 'print' } },
  { key: 'graphic', label: 'Graphic tees', removes: { flag: 'graphic' } },
  { key: 'cargo', label: 'Cargo pants', removes: { flag: 'cargo' } },
  { key: 'hats', label: 'Hats', removes: { slot: 'hat' } },
  { key: 'shades', label: 'Sunglasses', removes: { slot: 'eyewear' } },
  { key: 'chains', label: 'Chains', removes: { flag: 'chain' } },
  { key: 'sandals', label: 'Sandals', removes: { flag: 'sandals' } },
  { key: 'tight', label: 'Anything tight', removes: { flag: 'tight' } },
  { key: 'neon', label: 'Neon colors', removes: { flag: 'neon' } },
];

// feeds = which weights an answer changes; filter = the two things that aren't scored at all
export const QUESTIONS = [
  {
    key: 'where', title: 'Where you live', lead: 'Where do you', accent: 'live?', feeds: ['climate', 'trends'],
    help: 'Your city sets the weather we dress you for. Your state tells us what people near you are searching for.',
    hint: 'Type a city and state, or pick one',
    note: 'Your city picks the weather we dress you for (NOAA 30-year climate normals, added in a later step). Your state picks the search trends we check (Google Trends).',
  },
  {
    key: 'week', title: 'Your week', lead: 'What does a normal week', accent: 'look like?', feeds: ['life'],
    help: 'Pick the one closest to most of your days. It tells us what your clothes have to put up with.',
    hint: 'Pick one',
    note: 'A week on your feet boosts sturdy, supportive shoes. An office week nudges toward smart casual.',
  },
  {
    key: 'fit', title: 'Fit', lead: 'How do you like things to', accent: 'fit?', feeds: ['taste'],
    help: "Think of your favorite shirt, the one you'd buy again.",
    hint: 'Pick one',
    note: 'Fit filters silhouettes inside your style. Relaxed drops slim cuts and favors pieces with a little room.',
  },
  {
    key: 'colors', title: 'Colors', lead: 'Which colors do you', accent: 'reach for?', feeds: ['color'],
    help: 'Pick up to three. Picking a fourth swaps out your first.',
    hint: 'Pick up to 3',
    note: 'Pieces in or near your colors score higher. Neutrals go with anything, and we keep to one strong color per fit.',
  },
  {
    key: 'inspiration', title: 'Inspiration', lead: 'Who or what', accent: 'inspires you?', feeds: ['taste'],
    help: 'A person, a brand, a movie, a vibe. Pick from these or add your own.',
    hint: 'Pick any, or add your own',
    note: 'Each idea maps to style tags, which add to what your swipes already taught us.',
  },
  {
    key: 'accessories', title: 'Accessories', lead: 'How much do you', accent: 'accessorize?', feeds: [], filter: 'slots',
    help: "Hats, glasses and jewelry. The dots show how many we'll add to your fit.",
    hint: 'Pick one',
    note: "This isn't scored. It decides how many accessory slots we fill: hat, eyewear and jewelry.",
  },
  {
    key: 'never', title: 'Never wear', lead: "Anything you'd", accent: 'never wear?', feeds: [], filter: 'nos',
    help: "Pick any, or none. We'll never show you these, no matter how well they score.",
    hint: 'Pick any, or none',
    note: 'Anything here is removed before scoring, so no amount of points can bring it back.',
  },
];

// "Baltimore, MD", "Baltimore, Maryland" or "Washington, D.C." -> { city, code, typed }
// code is the two-letter state code if we recognize the state, otherwise null.
export function parsePlace(text, states) {
  const parts = String(text || '').split(',');
  if (parts.length < 2) return { city: parts[0].trim(), code: null, typed: '' };
  const city = parts.slice(0, -1).join(',').trim();
  const typed = parts[parts.length - 1].trim();
  const short = typed.replace(/\./g, '').toUpperCase();
  if (states[short]) return { city, code: short, typed };
  const code = Object.keys(states).find((key) => states[key].name.toLowerCase() === typed.toLowerCase());
  return { city, code: code || null, typed };
}
