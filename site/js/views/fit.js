// Your fit: the final outfit, its name, and why it works. It uses the same model (model.js) and
// the same swaps as Try it on, so both pages always show the same outfit.
import * as store from '../store.js';
import { h } from '../dom.js';
import { buildProfile, buildOutfit, explain, outfitName, leftOut, SLOT_NAMES } from '../model.js';

export function mount(root, { data, setNote }) {
  setNote('Your fit');
  const saved = store.get();
  const profile = buildProfile(saved, data);
  const outfit = buildOutfit(data, profile, saved.overrides);

  root.innerHTML = `
    <section class="fit" aria-labelledby="fit-title">
      <div class="fit-intro">
        <p class="eyebrow">Step 4 of 4 · Your fit</p>
        <h1 id="fit-title" class="fit-name serif" data-name></h1>
        <p class="fit-lede" data-lede></p>
        <div class="fit-mix">
          <p class="eyebrow">Your style mix</p>
          <ol class="read-bars" data-mix></ol>
        </div>
        <div class="fit-actions">
          <a class="pill pill-dark" href="#/try-on"><span class="arrow" aria-hidden="true">←</span> Back to try it on</a>
          <button type="button" class="link-button" data-restart>Start over</button>
        </div>
      </div>
      <div class="fit-grid" role="group" aria-label="Your outfit" data-grid></div>
      <aside class="fit-why" aria-labelledby="why-title">
        <h2 id="why-title">Why it <span class="serif">works</span></h2>
        <div class="why-list" data-why></div>
        <p class="fit-used" data-used></p>
        <p class="q-source">Sample pieces, not for sale. Photos: Burst by Shopify. Trends: Google Trends, interest by US state.</p>
      </aside>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  $('[data-name]').textContent = outfitName(profile);
  $('[data-lede]').textContent = describe(profile);

  const mix = profile.mix.filter((m) => m.share > 0).slice(0, 3);
  $('[data-mix]').replaceChildren(...(mix.length ? mix.map((m) => h('li', { class: 'read-row' },
    h('span', { class: 'read-head' }, h('span', null, m.name), h('span', { class: 'read-pct' }, `${Math.round(m.share * 100)}%`)),
    h('span', { class: 'read-track' }, h('span', { class: 'read-fill', style: `width: ${(m.share * 100).toFixed(1)}%` }))))
    : [h('li', { class: 'read-empty' }, 'No style data yet. Swipe a few pieces to fill this in.')]));

  // The outfit, head to toe
  $('[data-grid]').replaceChildren(...outfit.pieces.map((piece, i) => h('figure', { class: `fit-piece fit-${piece.slot}`, style: `animation-delay: ${(0.05 + i * 0.09).toFixed(2)}s` },
    h('img', { src: piece.pick.item.img, alt: piece.pick.item.name }),
    h('figcaption', null, h('span', { class: 'eyebrow' }, `${String(i + 1).padStart(2, '0')} · ${SLOT_NAMES[piece.slot]}`), h('span', null, piece.pick.item.name)))));

  // Why it works: each piece's two strongest reasons, then what the score used
  const reasons = outfit.pieces
    .map((piece) => ({ piece, top: explain(piece.pick, profile).slice(0, 2) }))
    .filter((entry) => entry.top.length);
  $('[data-why]').replaceChildren(...(reasons.length ? reasons.map(({ piece, top }) => h('div', { class: 'why-item' },
    h('span', { class: 'eyebrow' }, `${SLOT_NAMES[piece.slot]} · ${top.map((r) => r.label.replace(' · real data', '')).join(' + ')}`),
    h('p', null, h('strong', null, `${piece.pick.item.name}. `), top.map((r) => r.text).join(' '))))
    : [h('p', { class: 'why-empty' }, "These are neutral picks: there's nothing to explain yet. Swipe and answer a few questions and every piece gets a reason.")]));

  const weightSum = outfit.pieces.length ? outfit.pieces[0].pick.weightSum : 0;
  const used = outfit.used.map((w) => `${w.name} ${Math.round((100 * w.pct) / weightSum)}%`);
  $('[data-used]').textContent = `${used.length ? `What the score used: ${used.join(' · ')}. ` : ''}${leftOut(profile)}`;

  $('[data-restart]').addEventListener('click', () => {
    if (!window.confirm('Clear your swipes, answers and brands, and start over?')) return;
    store.set({ swipes: [], answers: {}, brands: [], customBrands: [], overrides: {} });
    location.hash = '#/swipe';
  });
}

// "Built from your 12 swipes, 6 answers and 3 brands."
function describe(profile) {
  const { swipes, answered, brands } = profile.counts;
  const parts = [];
  if (swipes) parts.push(`${swipes} ${swipes === 1 ? 'swipe' : 'swipes'}`);
  if (answered) parts.push(`${answered} ${answered === 1 ? 'answer' : 'answers'}`);
  if (brands) parts.push(`${brands} ${brands === 1 ? 'brand' : 'brands'}`);
  if (!parts.length) return 'Built from nothing yet: swipe a few pieces and answer the questions, and this becomes yours.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `Built from your ${list}${profile.place ? `, for ${profile.place.name}` : ''}.`;
}
