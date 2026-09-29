// Formatting helpers shared by the pages.

// "2025-09-28" -> "Sep 2025"
export function monthYear(isoDate) {
  const [year, month] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// For matching what people type: lowercase, no accents, no punctuation.
// "Stüssy" -> "stussy", "H&M" -> "h m", "Levi's" -> "levi s"
export function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Shares as whole percents that still add up to 100. Plain rounding can give 101 (62.5, 18.75,
// 12.5 and 6.25 round to 63, 19, 13 and 6), so everything is rounded down and the leftover
// points go to the shares that lost the most. [50, 15, 10, 5] -> [63, 19, 12, 6]
export function wholePercents(values) {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!total) return values.map(() => 0);
  const exact = values.map((v) => (100 * v) / total);
  const whole = exact.map(Math.floor);
  let spare = 100 - whole.reduce((sum, v) => sum + v, 0);
  const byLoss = exact.map((v, i) => i).sort((a, b) => (exact[b] - whole[b]) - (exact[a] - whole[a]));
  for (const i of byLoss) {
    if (spare-- <= 0) break;
    whole[i] += 1;
  }
  return whole;
}
