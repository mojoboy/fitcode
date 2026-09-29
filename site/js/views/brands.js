// Question 8: which brands are already in your closet. 52 brands from data/brands.csv, with
// search, style filters and "add your own". Every pick is compared with Google Trends for the
// state you gave in question 1. Picks are saved in the browser, like the other answers.
import { tick } from '../sound.js';
import * as store from '../store.js';
import { h, setPressed } from '../dom.js';
import { monthYear, normalize } from '../format.js';
import { STYLES } from '../taste.js';
import { parsePlace } from '../quiz.js';

const MAX_ROWS = 10;   // picks listed in the side panel before "+N more"

export function mount(root, { data, setNote }) {
  setNote('Question 8 of 8');
  const { states, flags = {}, period } = data.trends;
  const { styles: styleKeys, brands: catalog } = data.brands;
  const tracked = catalog.filter((brand) => brand.trends).length;

  // Your state comes from question 1 (it doesn't change on this page)
  const place = parsePlace(store.get().answers.city, states);
  const state = place.code ? states[place.code] : null;
  const stateName = place.code === 'DC' ? 'Washington, D.C.' : state?.name;

  let filter = 'all';
  let query = '';

  root.innerHTML = `
    <section class="brands" aria-labelledby="brands-title">
      <div class="quiz-progress" aria-hidden="true"><span style="width: 100%"></span></div>

      <div class="brands-main">
        <p class="eyebrow">Step 2 of 4 · About you · Question 8 of 8</p>
        <h1 id="brands-title">Which brands are <span class="serif">already</span> in your closet?</h1>
        <p class="brands-lede">Pick as many as you like. Can't find one? Type it in and add it.</p>
        <label class="brands-search">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12.8 12.8 17 17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          <input type="search" data-search placeholder="Search ${catalog.length} brands" aria-label="Search brands" autocomplete="off" spellcheck="false">
          <span class="brands-shown" data-shown></span>
        </label>
        <div class="brands-filters" role="group" aria-label="Filter by style" data-filters></div>
        <div class="brands-scroll">
          <div class="brands-grid" role="group" aria-label="Brands" data-grid></div>
          <div class="brands-empty" data-empty hidden>
            <p data-empty-text></p>
            <button type="button" class="pill pill-dark" data-add></button>
          </div>
        </div>
        <div class="brands-footer">
          <span class="brands-coverage"><span class="brands-dot" aria-hidden="true"></span>Trends data so far: ${tracked} of ${catalog.length} brands</span>
          <div class="quiz-buttons">
            <a class="pill pill-light" href="#/questions/7">Back</a>
            <a class="pill pill-dark" href="#/try-on">Try it on <span class="arrow" aria-hidden="true">→</span></a>
          </div>
        </div>
      </div>

      <aside class="brands-side" aria-labelledby="picks-title">
        <section class="q-panel">
          <div class="picks-head">
            <span class="eyebrow" id="picks-title" data-picks-title></span>
            <span class="eyebrow picks-count" data-count></span>
          </div>
          <p class="picks-question" data-question></p>
          <div class="picks-rows" data-rows></div>
          <p class="picks-more" data-more hidden></p>
          <p class="picks-empty" data-none hidden>Pick a brand and it shows up here.</p>
          <p class="q-flag" data-flag hidden></p>
          <div class="picks-legend">
            <span><span class="picks-base" aria-hidden="true"></span>= the average state (1.0×)</span>
            <span><span class="picks-dash" aria-hidden="true"></span>= no data, so no boost (not zero)</span>
          </div>
          <p class="q-source">Source: Google Trends, web search, interest by state, ${monthYear(period[0])} to ${monthYear(period[1])}. Search interest, not sales.</p>
        </section>
      </aside>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const ui = {
    search: $('[data-search]'), shown: $('[data-shown]'), filters: $('[data-filters]'), grid: $('[data-grid]'),
    empty: $('[data-empty]'), emptyText: $('[data-empty-text]'), add: $('[data-add]'),
    picksTitle: $('[data-picks-title]'), count: $('[data-count]'), question: $('[data-question]'),
    rows: $('[data-rows]'), more: $('[data-more]'), none: $('[data-none]'), flag: $('[data-flag]'),
  };

  // One button per brand, built once. Filtering just hides and shows them.
  const tiles = new Map();   // brand name -> { brand, button, text }
  const addTile = (brand) => {
    const button = h('button', { type: 'button', class: 'brand', onclick: () => toggle(brand.name) },
      h('span', { class: 'brand-name' }, brand.name),
      h('span', { class: 'brand-tag' },
        h('span', { class: 'brand-style' }, brand.custom ? 'Added by you' : STYLES[brand.style]),
        brand.trends ? h('span', { class: 'brands-dot', title: 'Has Google Trends data' }) : null));
    tiles.set(brand.name, { brand, button, text: normalize([brand.name, ...brand.aliases].join(' ')) });
    ui.grid.append(button);
  };
  catalog.forEach(addTile);
  store.get().customBrands.forEach((name) => addTile({ name, style: 'custom', aliases: [], custom: true }));

  function toggle(name) {
    const picks = store.get().brands;
    const picked = picks.includes(name);
    store.set({ brands: picked ? picks.filter((n) => n !== name) : [...picks, name] });
    tick(picked ? 700 : 1320);
    refresh();
  }

  // "Add your own": a typed brand that isn't in the list gets its own tile (tagged "Added by you")
  function addCustom() {
    const name = query.trim();
    if (!name) return;
    const known = [...tiles.values()].find((tile) => normalize(tile.brand.name) === normalize(name));
    if (known) {
      if (!store.get().brands.includes(known.brand.name)) toggle(known.brand.name);
    } else {
      store.set({
        customBrands: [...store.get().customBrands, name],
        brands: [...store.get().brands, name],
      });
      addTile({ name, style: 'custom', aliases: [], custom: true });
      tick(1320);
    }
    query = '';
    ui.search.value = '';
    renderFilters();
    refresh();
  }

  function renderFilters() {
    const all = [...tiles.values()];
    const keys = ['all', ...styleKeys, ...(all.some((tile) => tile.brand.custom) ? ['custom'] : [])];
    ui.filters.replaceChildren(...keys.map((key) => {
      const count = key === 'all' ? all.length : all.filter((tile) => tile.brand.style === key).length;
      const label = key === 'all' ? 'All' : key === 'custom' ? 'Added by you' : STYLES[key];
      const chip = h('button', {
        type: 'button', class: 'brands-chip',
        onclick: () => { filter = key; tick(1000); renderFilters(); refresh(); },
      }, label, h('span', { class: 'brands-chip-count' }, String(count)));
      setPressed(chip, key === filter);
      return chip;
    }));
  }

  function refresh() {
    const picks = store.get().brands;

    // The grid: show the brands that match the filter and the search, mark the picked ones
    const q = normalize(query);
    let shown = 0;
    for (const { brand, button, text } of tiles.values()) {
      const visible = (filter === 'all' || brand.style === filter) && (!q || text.includes(q));
      button.hidden = !visible;
      if (visible) shown += 1;
      setPressed(button, picks.includes(brand.name));
    }
    ui.shown.textContent = `${shown} shown`;
    ui.empty.hidden = shown > 0;
    if (!shown) {
      ui.emptyText.textContent = q ? `No brand called “${query.trim()}” in our list yet.` : 'Nothing here yet.';
      ui.add.hidden = !q;
      ui.add.textContent = `Add “${query.trim()}” to your picks`;
    }

    // The side panel: your picks against your state's search interest
    ui.picksTitle.textContent = `Your picks · near you · ${state ? stateName : 'your state'}`;
    ui.count.textContent = `${picks.length} picked`;
    ui.question.replaceChildren(...(state
      ? [`How much more people in ${stateName} search your brands than the average state does`]
      : ['Add your city and state in ', h('a', { href: '#/questions/1' }, 'question 1'), ' to see how people near you search these brands.']));

    const rows = picks.map((name) => ({
      name,
      value: state?.index[name] ?? null,
      tracked: tiles.get(name)?.brand.trends ?? false,
    }));
    const ordered = [
      ...rows.filter((row) => row.value !== null).sort((a, b) => b.value - a.value),   // with data, biggest first
      ...rows.filter((row) => row.value === null),                                      // then the rest, in the order picked
    ];
    const scale = Math.max(2, ...ordered.filter((row) => row.value !== null).map((row) => row.value));
    ui.rows.replaceChildren(...ordered.slice(0, MAX_ROWS).map((row) => pickRow(row, scale)));
    ui.more.hidden = ordered.length <= MAX_ROWS;
    ui.more.textContent = `+${ordered.length - MAX_ROWS} more picks`;
    ui.none.hidden = picks.length > 0;
    ui.flag.hidden = !(state && flags[place.code]);
    if (!ui.flag.hidden) ui.flag.textContent = `Flagged: ${flags[place.code]}`;
  }

  // One row in the side panel. Why a brand has no number matters, so the label says which:
  // "no data yet" = we haven't exported it from Trends; "too few searches" = Google left your state out.
  function pickRow(row, scale) {
    const hasValue = row.value !== null;
    const reason = !state ? '—' : row.tracked ? 'too few searches' : 'no data yet';
    return h('div', { class: 'pick-row' },
      h('span', { class: 'pick-name' }, row.name),
      hasValue
        ? h('span', { class: 'q-near-track' },
          h('span', { class: 'q-near-fill', style: `width: ${((100 * row.value) / scale).toFixed(1)}%` }),
          h('span', { class: 'q-near-base', style: `left: ${(100 / scale).toFixed(1)}%` }))
        : h('span', { class: 'picks-dash', 'aria-hidden': 'true' }),
      h('span', { class: hasValue ? 'pick-value' : 'pick-value muted' }, hasValue ? `${row.value.toFixed(2)}×` : reason),
      h('button', { type: 'button', class: 'pick-x', 'aria-label': `Remove ${row.name}`, onclick: () => toggle(row.name) }, '×'));
  }

  // Search as you type. Enter picks the only match, or adds what you typed if nothing matches.
  ui.search.addEventListener('input', () => { query = ui.search.value; refresh(); });
  ui.search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const visible = [...tiles.values()].filter((tile) => !tile.button.hidden);
    if (visible.length === 1) toggle(visible[0].brand.name);
    else if (!visible.length) addCustom();
  });
  ui.add.addEventListener('click', addCustom);

  renderFilters();
  refresh();
}
