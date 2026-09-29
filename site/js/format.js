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
