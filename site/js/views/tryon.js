// Try it on: the outfit the model picked (model.js), stacked head to toe. Tap a piece to see why it
// was picked, swap it for the next best, or shuffle for a different look. Swaps are saved, so
// "Your fit" shows the same outfit.
import { tick } from '../sound.js';
import * as store from '../store.js';
import { h } from '../dom.js';
import { PALETTE } from '../quiz.js';
import { STYLES } from '../taste.js';
import { buildProfile, buildOutfit, explain, bodyPart, leftOut } from '../model.js';

const SLOT_PLURALS = { hat: 'hats', eyewear: 'pieces of eyewear', jewelry: 'pieces of jewelry', top: 'tops', bottom: 'bottoms', shoes: 'pairs of shoes' };
const SWAP_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mount(root, { data, setNote }) {
  root.innerHTML = `
    <section class="tryon" aria-labelledby="tryon-title">
      <div class="tryon-intro">
        <p class="eyebrow">Step 3 of 4 · Try it on</p>
        <h1 id="tryon-title">Try it <span class="serif">on.</span></h1>
        <p class="tryon-lede">Your outfit, stacked head to toe. Tap a piece to see why it was picked, or swap it for the next best.</p>
        <p class="tryon-nudge" data-nudge hidden>You haven't swiped or answered anything yet, so these are neutral picks. <a href="#/swipe">Style me first</a>.</p>
        <div class="tryon-block">
          <p class="eyebrow">This look reads as</p>
          <ol class="read-bars" data-read></ol>
        </div>
        <div class="tryon-block">
          <p class="eyebrow">Palette</p>
          <div class="palette-dots" data-palette></div>
        </div>
        <div class="tryon-actions">
          <button type="button" class="pill pill-light" data-shuffle>Show me another</button>
          <a class="pill pill-dark" href="#/fit">See why it works <span class="arrow" aria-hidden="true">→</span></a>
          <button type="button" class="link-button" data-reset hidden>Back to the best picks</button>
        </div>
      </div>
      <div class="stack" data-stack role="group" aria-label="Your outfit, head to toe"></div>
      <aside class="tryon-why" aria-live="polite" data-why></aside>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const ui = {
    nudge: $('[data-nudge]'), read: $('[data-read]'), palette: $('[data-palette]'),
    shuffle: $('[data-shuffle]'), reset: $('[data-reset]'), stack: $('[data-stack]'), why: $('[data-why]'),
  };

  let selected = null;          // which piece the "why" panel explains
  let shown = new Map();        // piece key -> item id on screen, to animate only what changed
  let outfit = null;
  let profile = null;

  function render() {
    const saved = store.get();
    profile = buildProfile(saved, data);
    outfit = buildOutfit(data, profile, saved.overrides);
    setNote(`Try it on · ${outfit.pieces.length} pieces`);
    ui.nudge.hidden = profile.counts.swipes + profile.counts.answered + profile.counts.brands > 0;
    ui.reset.hidden = Object.keys(saved.overrides).length === 0;

    if (!outfit.pieces.some((piece) => piece.key === selected)) selected = outfit.pieces[0] ? outfit.pieces[0].key : null;
    const first = shown.size === 0;
    ui.stack.replaceChildren(...outfit.pieces.map((piece, i) => stackRow(piece, i, first, shown.get(piece.key) !== piece.pick.item.id)));
    shown = new Map(outfit.pieces.map((piece) => [piece.key, piece.pick.item.id]));

    // This look reads as: the styles of the pieces on screen
    const counts = {};
    let total = 0;
    for (const piece of outfit.pieces) {
      for (const style of piece.pick.item.styles) { counts[style] = (counts[style] || 0) + 1; total += 1; }
    }
    ui.read.replaceChildren(...Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => h('li', { class: 'read-row' },
      h('span', { class: 'read-head' }, h('span', null, STYLES[key]), h('span', { class: 'read-pct' }, `${Math.round((100 * n) / total)}%`)),
      h('span', { class: 'read-track' }, h('span', { class: 'read-fill', style: `width: ${((100 * n) / total).toFixed(1)}%` })))));
    ui.palette.replaceChildren(...outfit.pieces.map((piece) => {
      const color = PALETTE[piece.pick.item.colors[0]];
      return h('span', { class: 'palette-dot', style: `background: ${color.hex}`, title: color.label });
    }));

    renderWhy();
  }

  // One row of the stack: the label on one side (alternating), a line, then the photo
  function stackRow(piece, i, first, changed) {
    const item = piece.pick.item;
    const tile = h('button', {
      type: 'button',
      class: `tile tile-${piece.slot}${piece.key === selected ? ' on' : ''}${first ? ' drop' : changed ? ' swapped' : ''}`,
      style: first ? `animation-delay: ${(i * 0.1).toFixed(1)}s` : null,
      'aria-label': `Why ${item.name}?`,
      'aria-pressed': String(piece.key === selected),
      onclick: () => { selected = piece.key; tick(1100); render(); },
    }, h('img', { src: item.img, alt: '', draggable: 'false' }));

    const swap = h('button', { type: 'button', class: 'swap', 'aria-label': `Swap the ${item.name} for the next best`, onclick: () => swapPiece(piece) });
    swap.innerHTML = SWAP_ICON;
    const label = h('div', { class: 'stack-label' },
      h('div', { class: 'label-card' },
        h('span', { class: 'label-text' },
          h('span', { class: 'eyebrow' }, `${String(i + 1).padStart(2, '0')} · ${bodyPart(piece)}`),
          h('span', { class: 'label-name' }, item.name)),
        piece.ranked.length > 1 ? swap : null),
      h('span', { class: 'leader', 'aria-hidden': 'true' }));

    return h('div', { class: `stack-row ${i % 2 ? 'right' : 'left'}` }, label, tile);
  }

  // Swap: the next piece down this slot's ranking, skipping one already worn elsewhere
  function swapPiece(piece) {
    const list = piece.ranked;
    const at = list.indexOf(piece.pick);
    const worn = new Set(outfit.pieces.filter((p) => p !== piece).map((p) => p.pick.item.id));
    for (let step = 1; step < list.length; step++) {
      const next = list[(at + step) % list.length];
      if (!worn.has(next.item.id)) {
        store.set({ overrides: { ...store.get().overrides, [piece.key]: next.item.id } });
        break;
      }
    }
    selected = piece.key;
    tick(900);
    render();
  }

  // Show me another: for every slot, a random piece from its top three
  function shuffle() {
    const overrides = {};
    const taken = new Set();
    for (const piece of outfit.pieces) {
      const options = piece.ranked.slice(0, 3).filter((r) => r !== piece.pick && !taken.has(r.item.id));
      const choice = options.length ? options[Math.floor(Math.random() * options.length)] : piece.pick;
      overrides[piece.key] = choice.item.id;
      taken.add(choice.item.id);
    }
    store.set({ overrides });
    tick(1400);
    render();
  }

  // The "why" panel: the piece's score on each signal, in plain words, and what was left out
  function renderWhy() {
    const piece = outfit.pieces.find((p) => p.key === selected);
    if (!piece) { ui.why.replaceChildren(); return; }
    const scored = piece.pick;
    const reasons = explain(scored, profile);
    ui.why.replaceChildren(h('section', { class: 'q-panel why-panel' },
      h('p', { class: 'eyebrow' }, `Why this piece · #${piece.ranked.indexOf(scored) + 1} of ${piece.ranked.length} ${SLOT_PLURALS[piece.slot]} for you`),
      h('p', { class: 'why-name' }, scored.item.name),
      h('p', { class: 'why-match' }, h('span', { class: 'why-pct' }, `${Math.round(scored.total * 100)}%`), ' match'),
      outfit.used.length ? h('ul', { class: 'why-signals' }, outfit.used.map((w) => h('li', { class: 'why-signal' },
        h('span', { class: 'why-signal-name' }, w.name),
        h('span', { class: 'why-signal-weight' }, `${Math.round((100 * w.pct) / scored.weightSum)}% of the score`),
        h('span', { class: 'why-track' }, h('span', { class: 'why-fill', style: `width: ${Math.round(scored.parts[w.key] * 100)}%` })),
        h('span', { class: 'why-value' }, scored.parts[w.key].toFixed(2))))) : null,
      reasons.length ? h('ul', { class: 'why-reasons' }, reasons.map((reason) => h('li', null, reason.text))) : null,
      piece.note ? h('p', { class: 'why-note' }, piece.note) : null,
      piece.yours ? h('p', { class: 'why-note' }, 'You swapped this one in yourself.') : null,
      h('p', { class: 'why-note' }, leftOut(profile)),
      outfit.removed.length
        ? h('p', { class: 'why-note' }, `Removed by your hard no's: ${outfit.removed.map((r) => `${r.item.name} (${r.because})`).join(', ')}.`)
        : null));
  }

  ui.shuffle.addEventListener('click', shuffle);
  ui.reset.addEventListener('click', () => { store.set({ overrides: {} }); tick(700); render(); });
  render();
}
