// Turns swipes into a taste profile: how much each style is liked.
// A like adds 1 point to each of the piece's styles; a pass takes away half a point.
// A pass counts for less than a like because you might pass on a piece for its color or fit,
// not its style. Only swipes are stored; the profile is always recalculated from them.
export const STYLES = {
  minimal: 'Clean minimal',
  workwear: 'Workwear',
  streetwear: 'Streetwear',
  athleisure: 'Athleisure',
  smart: 'Smart casual',
  vintage: 'Vintage / indie',
  trend: 'Trend-led',
};

const LIKE = 1;
const PASS = -0.5;

// Returns every style with its points and its share of all the positive points, biggest first
export function tasteFromSwipes(swipes, itemsById) {
  const points = Object.fromEntries(Object.keys(STYLES).map((style) => [style, 0]));
  for (const { id, vote } of swipes) {
    const item = itemsById.get(id);
    if (!item) continue;
    for (const style of item.styles) points[style] += vote > 0 ? LIKE : PASS;
  }
  const positive = Object.values(points).reduce((sum, p) => sum + Math.max(0, p), 0);
  return Object.entries(points)
    .map(([key, p]) => ({ key, name: STYLES[key], points: p, share: positive ? Math.max(0, p) / positive : 0 }))
    .sort((a, b) => b.share - a.share || b.points - a.points);
}
