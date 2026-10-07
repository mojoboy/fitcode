// Swipe warm-up: every real piece plus a few samples, like or pass. Each swipe is saved in the
// browser (store.js) and the taste bars are recalculated from all the swipes so far (taste.js).
import { tick } from '../sound.js';
import * as store from '../store.js';
import { tasteFromSwipes } from '../taste.js';

const PER_SLOT = 2;   // samples top each slot up to two cards; real pieces always get a card
const DEAL_ORDER = ['shoes', 'top', 'eyewear', 'hat', 'jewelry', 'bottom'];
const SLOT_NAMES = { hat: 'Hat', eyewear: 'Eyewear', jewelry: 'Jewelry', top: 'Top', bottom: 'Bottoms', shoes: 'Shoes' };
const DECIDE_AT = 110;   // px of drag that counts as a swipe
const ICON_PASS = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_LIKE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mount(root, { data, setNote }) {
  const items = data.closet.items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const deck = buildDeck(items);
  const real = deck.filter((item) => item.own).length;
  setNote(`${real ? 'Real closet + samples' : 'Sample closet'} · ${deck.length} pieces to swipe`);
  const deckIds = new Set(deck.map((item) => item.id));
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.innerHTML = `
    <section class="swipe" aria-labelledby="swipe-title">
      <div class="swipe-intro">
        <p class="eyebrow">Step 1 of 4 · Warm-up</p>
        <h1 id="swipe-title">Swipe what you'd <span class="serif">actually</span> wear.</h1>
        <p class="swipe-lede">${deck.length} pieces, ${real} of them from a real closet and the rest samples. Every like and pass teaches the site a little more about your taste.</p>
        <p class="swipe-count" data-count></p>
      </div>

      <div class="deck-area">
        <div class="deck" data-deck>
          <div class="deck-back back-2" aria-hidden="true"></div>
          <div class="deck-back back-1" aria-hidden="true"></div>
          <div class="swipe-done" data-done hidden>
            <p class="eyebrow">Warm-up done</p>
            <p class="done-title">Taste <span class="serif">mapped.</span></p>
            <p data-done-text></p>
            <a class="pill pill-dark" href="#/questions">Keep going <span class="arrow" aria-hidden="true">→</span></a>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="act act-pass" data-pass>${ICON_PASS} Pass</button>
          <button type="button" class="act act-like" data-like>${ICON_LIKE} I'd wear it</button>
        </div>
        <div class="deck-tools">
          <span class="eyebrow">Drag the card, or press ← →</span>
          <button type="button" class="link-button" data-undo>Undo</button>
          <button type="button" class="link-button" data-restart>Start over</button>
        </div>
        <p class="visually-hidden" aria-live="polite" data-announce></p>
      </div>

      <aside class="taste" aria-labelledby="taste-title">
        <p class="eyebrow" id="taste-title">Your taste so far</p>
        <ol class="taste-bars" data-bars></ol>
        <p class="taste-note">Each like adds a point to that piece's styles. Each pass takes away half a point. The bars show each style's share.</p>
        <p class="taste-note">Saved in this browser only. Nothing is sent anywhere.</p>
        <a class="taste-skip" href="#/questions">Skip to the questions →</a>
      </aside>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const ui = {
    count: $('[data-count]'), deck: $('[data-deck]'), done: $('[data-done]'), doneText: $('[data-done-text]'),
    pass: $('[data-pass]'), like: $('[data-like]'), undo: $('[data-undo]'), restart: $('[data-restart]'),
    announce: $('[data-announce]'), bars: $('[data-bars]'),
  };

  let card = null;       // { node, item } for the card on top
  let busy = false;      // true while a card is flying away
  let timer = 0;
  const rows = new Map();  // style key -> its <li> in the taste bars

  const swipes = () => store.get().swipes.filter((s) => deckIds.has(s.id));

  // The next card is the first piece in the deck that hasn't been swiped yet
  function showCard() {
    if (card) card.node.remove();
    card = null;
    const done = swipes();
    const swiped = new Set(done.map((s) => s.id));
    const item = deck.find((piece) => !swiped.has(piece.id));
    const number = done.length + 1;

    ui.undo.disabled = ui.restart.disabled = done.length === 0;
    ui.like.disabled = ui.pass.disabled = !item;
    ui.done.hidden = Boolean(item);
    if (!item) {
      ui.count.textContent = `Done · ${deck.length} / ${deck.length}`;
      showDone();
      return;
    }

    ui.count.textContent = `${String(number).padStart(2, '0')} / ${deck.length}`;
    const node = makeCard(item);
    ui.deck.append(node);
    card = { node, item };
    enableDrag(node);
    ui.announce.textContent = `Card ${number} of ${deck.length}: ${item.name}, ${SLOT_NAMES[item.slot]}.`;

    const next = deck.find((piece) => piece !== item && !swiped.has(piece.id));
    if (next) new Image().src = next.img;   // start loading the next photo now, so it's ready
  }

  function decide(vote) {
    if (!card || busy) return;
    busy = true;
    const { node, item } = card;
    // Save the swipe (replacing any older vote on the same piece), then refresh the bars
    store.set({ swipes: [...store.get().swipes.filter((s) => s.id !== item.id), { id: item.id, vote }] });
    tick(vote > 0 ? 1320 : 620);
    renderTaste();

    // Throw the card off the side it was swiped to (first stop its entrance animation,
    // which would otherwise override the throw if you swipe the moment a card appears)
    node.getAnimations().forEach((animation) => animation.cancel());
    setStamps(node, vote * DECIDE_AT);
    node.style.transition = calm ? 'none' : 'transform .42s var(--ease), opacity .42s ease';
    node.style.transform = `translate(${vote * 130}%, 0) rotate(${vote * 24}deg)`;
    node.style.opacity = '0';
    timer = setTimeout(() => { busy = false; showCard(); }, calm ? 0 : 380);
  }

  function undo() {
    const done = swipes();
    if (!done.length || busy) return;
    const last = done[done.length - 1];
    store.set({ swipes: store.get().swipes.filter((s) => s.id !== last.id) });
    tick(900);
    renderTaste();
    showCard();
  }

  function restart() {
    if (busy) return;
    store.set({ swipes: store.get().swipes.filter((s) => !deckIds.has(s.id)) });
    tick(700);
    renderTaste();
    showCard();
  }

  function showDone() {
    const top = tasteFromSwipes(swipes(), byId)[0];
    ui.doneText.textContent = top && top.share > 0
      ? `Your strongest style so far: ${top.name} (${Math.round(top.share * 100)}%). Next, a few quick questions about where you live and what you already wear.`
      : 'No likes yet, and that tells us something too. Next, a few quick questions about where you live and what you already wear.';
  }

  // Style bars, biggest share on top. When the order changes, the rows glide to their new
  // places ("FLIP": note where each row was, move it, then animate from the old spot to the new one).
  function renderTaste() {
    const taste = tasteFromSwipes(swipes(), byId);
    const before = new Map([...rows].map(([key, li]) => [key, li.getBoundingClientRect().top]));
    for (const style of taste) {
      if (!rows.has(style.key)) rows.set(style.key, makeRow(style.name));
      const li = rows.get(style.key);
      li.querySelector('.taste-pct').textContent = `${Math.round(style.share * 100)}%`;
      li.querySelector('.taste-fill').style.width = `${(style.share * 100).toFixed(1)}%`;
      ui.bars.append(li);   // appending in sorted order moves each row to its new place
    }
    if (calm) return;
    for (const [key, li] of rows) {
      const shift = before.has(key) ? before.get(key) - li.getBoundingClientRect().top : 0;
      if (shift) {
        li.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }],
          { duration: 500, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
    }
  }

  // Dragging: the card follows the pointer and tilts; let go past DECIDE_AT px to swipe
  function enableDrag(node) {
    let start = null;
    node.addEventListener('pointerdown', (e) => {
      if (busy || e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      node.getAnimations().forEach((animation) => animation.cancel());
      try { node.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ }
      node.style.transition = 'none';
      node.classList.add('dragging');
    });
    node.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      node.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx * 0.05}deg)`;
      setStamps(node, dx);
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      start = null;
      node.classList.remove('dragging');
      if (e.type === 'pointerup' && Math.abs(dx) > DECIDE_AT) {
        decide(dx > 0 ? 1 : -1);
        return;
      }
      node.style.transition = 'transform .45s var(--ease)';   // not far enough: spring back
      node.style.transform = '';
      setStamps(node, 0);
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);   // e.g. the phone decided you were scrolling
  }

  // Keyboard: right arrow = like, left arrow = pass
  const onKey = (e) => {
    const typing = e.target instanceof Element && e.target.closest('input, textarea, select');
    if (e.altKey || e.ctrlKey || e.metaKey || typing) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); decide(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); decide(-1); }
  };

  ui.like.addEventListener('click', () => decide(1));
  ui.pass.addEventListener('click', () => decide(-1));
  ui.undo.addEventListener('click', undo);
  ui.restart.addEventListener('click', restart);
  window.addEventListener('keydown', onKey);

  renderTaste();
  showCard();

  return {
    unmount() {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    },
  };
}

// The warm-up deck: every real piece (from David's own closet) gets a card. Then samples top up
// any slot that has fewer than two, picked so every style gets a turn.
// Greedy picking: each round, take the sample whose styles the deck has seen least so far.
// A style is worth less every time the deck already has it (1, then 1/2, then 1/3...), so
// the picks spread across styles instead of piling onto one.
function buildDeck(items) {
  const pool = items.filter((item) => DEAL_ORDER.includes(item.slot));
  const seen = {};       // style -> how many picked pieces have it
  const perSlot = {};
  const picked = [];
  const add = (item) => {
    picked.push(item);
    perSlot[item.slot] = (perSlot[item.slot] || 0) + 1;
    for (const style of item.styles) seen[style] = (seen[style] || 0) + 1;
  };
  pool.filter((item) => item.own).forEach(add);
  for (;;) {
    let best = null;
    let bestValue = -1;
    for (const item of pool) {
      if (picked.includes(item) || (perSlot[item.slot] || 0) >= PER_SLOT) continue;
      const value = item.styles.reduce((sum, style) => sum + 1 / (1 + (seen[style] || 0)), 0);
      if (value > bestValue) {
        best = item;
        bestValue = value;
      }
    }
    if (!best) break;   // every slot has its two
    add(best);
  }

  // Deal in a mixed order (shoes, top, eyewear, hat, jewelry, bottoms, then again),
  // so two hats never come in a row. A slot with more real pieces just gets more rounds.
  const deck = [];
  const rounds = Math.max(...Object.values(perSlot));
  for (let round = 0; round < rounds; round++) {
    for (const slot of DEAL_ORDER) {
      const piece = picked.filter((item) => item.slot === slot)[round];
      if (piece) deck.push(piece);
    }
  }
  return deck;
}

function makeCard(item) {
  const node = document.createElement('article');
  node.className = 'swipe-card';
  node.innerHTML = `
    <div class="swipe-photo"><img alt="" draggable="false"></div>
    <span class="stamp stamp-like" aria-hidden="true">Wear it</span>
    <span class="stamp stamp-pass" aria-hidden="true">Pass</span>
    <div class="swipe-caption"><span class="eyebrow"></span><span class="swipe-name"></span></div>`;
  node.querySelector('img').src = item.img;
  node.querySelector('.eyebrow').textContent = `${SLOT_NAMES[item.slot]} · ${item.own ? 'real closet' : 'sample'}`;
  node.querySelector('.swipe-name').textContent = item.name;
  return node;
}

function makeRow(name) {
  const li = document.createElement('li');
  li.className = 'taste-row';
  li.innerHTML = `
    <div class="taste-head"><span class="taste-name"></span><span class="taste-pct"></span></div>
    <div class="taste-track"><div class="taste-fill"></div></div>`;
  li.querySelector('.taste-name').textContent = name;
  return li;
}

// The "Wear it" / "Pass" stamps fade in as the card is dragged toward that side
function setStamps(node, dx) {
  const clamp = (v) => Math.max(0, Math.min(1, v)).toFixed(2);
  node.querySelector('.stamp-like').style.opacity = clamp(dx / DECIDE_AT);
  node.querySelector('.stamp-pass').style.opacity = clamp(-dx / DECIDE_AT);
}
