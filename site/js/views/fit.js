// Your fit: the final outfit, its name, and why it works. It uses the same model (model.js) and
// the same swaps as Try it on, so both pages always show the same outfit. A shared link
// (#/fit/<code>) shows someone else's fit without touching your own saved answers.
import * as store from '../store.js';
import { h } from '../dom.js';
import { wholePercents } from '../format.js';
import { encodeFit, decodeFit } from '../share.js';
import { buildProfile, buildOutfit, explain, outfitName, leftOut, SLOT_NAMES, MONTH_NAMES } from '../model.js';

export function mount(root, { data, param, setNote }) {
  const shared = param ? decodeFit(param) : null;
  setNote(shared ? 'A shared fit' : 'Your fit');
  const saved = shared || store.get();
  const profile = buildProfile(saved, data);
  const outfit = buildOutfit(data, profile, saved.overrides);

  root.innerHTML = `
    <section class="fit" aria-labelledby="fit-title">
      <div class="fit-intro">
        <p class="eyebrow" data-step>Step 4 of 4 · Your fit</p>
        <p class="fit-shared" data-shared hidden>Someone shared this fit with you. <a href="#/swipe">Make your own</a>.</p>
        <h1 id="fit-title" class="fit-name serif" data-name></h1>
        <p class="fit-lede" data-lede></p>
        <div class="fit-mix">
          <p class="eyebrow">Style mix</p>
          <ol class="read-bars" data-mix></ol>
        </div>
        <div class="fit-actions" data-actions>
          <button type="button" class="pill pill-dark" data-share>Copy a link to this fit</button>
          <a class="pill pill-light" href="#/try-on"><span class="arrow" aria-hidden="true">←</span> Try it on</a>
          <button type="button" class="link-button" data-restart>Start over</button>
        </div>
        <p class="fit-share-note" data-share-note hidden></p>
      </div>
      <div class="fit-grid" role="group" aria-label="Your outfit" data-grid></div>
      <aside class="fit-why" aria-labelledby="why-title">
        <h2 id="why-title">Why it <span class="serif">works</span></h2>
        <div class="why-list" data-why></div>
        <p class="fit-used" data-used></p>
        <p class="q-source">Sample pieces, not for sale. Photos: Burst by Shopify. Weather: NOAA statewide monthly averages, 2021–2025. Trends: Google Trends, interest by US state.</p>
      </aside>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  $('[data-name]').textContent = outfitName(profile);
  $('[data-lede]').textContent = describe(profile, Boolean(shared));

  const mix = profile.mix.filter((m) => m.share > 0).slice(0, 3);
  $('[data-mix]').replaceChildren(...(mix.length ? mix.map((m) => h('li', { class: 'read-row' },
    h('span', { class: 'read-head' }, h('span', null, m.name), h('span', { class: 'read-pct' }, `${Math.round(m.share * 100)}%`)),
    h('span', { class: 'read-track' }, h('span', { class: 'read-fill', style: `width: ${(m.share * 100).toFixed(1)}%` }))))
    : [h('li', { class: 'read-empty' }, 'No style data yet. Swipe a few pieces to fill this in.')]));

  // The outfit, head to toe
  $('[data-grid]').replaceChildren(...outfit.pieces.map((piece, i) => h('figure', { class: `fit-piece fit-${piece.slot}`, style: `animation-delay: ${(0.05 + i * 0.09).toFixed(2)}s` },
    h('img', { src: piece.pick.item.img, alt: piece.pick.item.name }),
    h('figcaption', null, h('span', { class: 'eyebrow' }, `${String(i + 1).padStart(2, '0')} · ${SLOT_NAMES[piece.slot]}`), h('span', null, piece.pick.item.name)))));

  // Why it works: each piece's strongest reason, plus its next reason that hasn't already been
  // said about another piece (so the same sentence doesn't repeat down the list)
  const said = new Set();
  const reasons = outfit.pieces.map((piece) => {
    const all = explain(piece.pick, profile);
    const second = all.slice(1).find((reason) => !said.has(reason.text));
    const top = [all[0], second].filter(Boolean);
    top.forEach((reason) => said.add(reason.text));
    return { piece, top };
  }).filter((entry) => entry.top.length);
  $('[data-why]').replaceChildren(...(reasons.length ? reasons.map(({ piece, top }) => h('div', { class: 'why-item' },
    h('span', { class: 'eyebrow' }, `${SLOT_NAMES[piece.slot]} · ${top.map((r) => r.label.replace(' · real data', '')).join(' + ')}`),
    h('p', null, h('strong', null, `${piece.pick.item.name}. `), top.map((r) => r.text).join(' '))))
    : [h('p', { class: 'why-empty' }, "These are neutral picks: there's nothing to explain yet. Swipe and answer a few questions and every piece gets a reason.")]));

  // What the score used, as shares of the signals that had data. Eyewear and jewelry have no
  // warmth, so for them the weather's share goes to the other signals.
  const shares = wholePercents(outfit.used.map((w) => w.pct));
  const used = outfit.used.map((w, i) => `${w.name} ${shares[i]}%`);
  const noWeather = outfit.used.some((w) => w.key === 'climate')
    ? [...new Set(outfit.pieces.filter((p) => p.pick.parts.climate === undefined).map((p) => SLOT_NAMES[p.slot].toLowerCase()))]
    : [];
  $('[data-used]').textContent = [
    used.length ? `What the score used: ${used.join(' · ')}.` : '',
    noWeather.length ? `Weather isn't scored for the ${noWeather.join(' or ')}.` : '',
    leftOut(profile),
  ].filter(Boolean).join(' ');

  // A shared fit is read-only: no share, swap or start-over buttons, just a way to make your own
  if (shared) {
    $('[data-step]').textContent = 'A shared fit';
    $('[data-shared]').hidden = false;
    $('[data-actions]').replaceChildren(h('a', { class: 'pill pill-dark', href: '#/swipe' }, 'Make your own ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')));
    return;
  }
  if (param) $('[data-lede]').textContent = "That share link didn't work, so this is your own fit.";

  // Copy a link: the page address with everything that shapes this outfit packed after #/fit/
  $('[data-share]').addEventListener('click', async () => {
    const link = `${location.origin}${location.pathname}#/fit/${encodeFit(store.get(), data, profile.month)}`;
    const note = $('[data-share-note]');
    try {
      await navigator.clipboard.writeText(link);
      note.textContent = `Link copied. It carries your answers, your state and the month (${MONTH_NAMES[profile.month]}), not your city.`;
    } catch {
      note.textContent = `Copy this link: ${link}`;   // clipboard blocked: show it instead
    }
    note.hidden = false;
  });

  $('[data-restart]').addEventListener('click', () => {
    if (!window.confirm('Clear your swipes, answers and brands, and start over?')) return;
    store.set({ swipes: [], answers: {}, brands: [], customBrands: [], overrides: {} });
    location.hash = '#/swipe';
  });
}

// "Built from your 12 swipes, 6 answers and 3 brands, for Maryland in October." (a shared fit leaves out the "your")
function describe(profile, shared) {
  const { swipes, answered, brands } = profile.counts;
  const parts = [];
  if (swipes) parts.push(`${swipes} ${swipes === 1 ? 'swipe' : 'swipes'}`);
  if (answered) parts.push(`${answered} ${answered === 1 ? 'answer' : 'answers'}`);
  if (brands) parts.push(`${brands} ${brands === 1 ? 'brand' : 'brands'}`);
  if (!parts.length) return 'Built from nothing yet: swipe a few pieces and answer the questions, and this becomes yours.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const when = profile.weather ? ` in ${MONTH_NAMES[profile.month]}` : '';
  return `Built from ${shared ? '' : 'your '}${list}${profile.place ? `, for ${profile.place.name}${when}` : ''}.`;
}
