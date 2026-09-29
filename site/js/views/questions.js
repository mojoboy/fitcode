// The questions: seven quick ones, one at a time, each at its own address (#/questions/1 to 7).
// Answers are saved in the browser as you go (store.js). The sidebar lists every answer, the
// side panel shows which part of the score the question feeds, and question 1 shows real
// Google Trends data for the state you type.
import { tick } from '../sound.js';
import * as store from '../store.js';
import { h, setPressed } from '../dom.js';
import { monthYear } from '../format.js';
import { STYLES } from '../taste.js';
import {
  WEIGHTS, CITIES, WEEKS, FITS, COLORS, MAX_COLORS, INSPIRATIONS, ACCESSORIES, NEVER, QUESTIONS, parsePlace,
} from '../quiz.js';

const TOTAL = QUESTIONS.length + 1;   // question 8, your brands, has its own page

const labelOf = (options, key) => options.find((o) => o.key === key)?.label ?? null;

// One line per question for the sidebar; null means "not answered yet"
const SUMMARIES = {
  where: (a) => a.city?.trim() || null,
  week: (a) => labelOf(WEEKS, a.week),
  fit: (a) => labelOf(FITS, a.fit),
  colors: (a) => (a.colors || []).map((key) => labelOf(COLORS, key)).join(', ') || null,
  inspiration: (a) => [...(a.inspo || []).map((key) => labelOf(INSPIRATIONS, key)), ...(a.custom || [])].join(', ') || null,
  accessories: (a) => labelOf(ACCESSORIES, a.acc),
  never: (a) => (a.nos === undefined ? null : a.nos.map((key) => labelOf(NEVER, key)).join(', ') || 'Nothing ruled out'),
};

export function mount(root, { data, param, setNote }) {
  const { states, flags = {}, period, brands } = data.trends;
  const answers = () => store.get().answers;
  let index = toIndex(param, answers());
  let current = null;   // the question on screen: { el, refresh }

  root.innerHTML = `
    <section class="quiz" aria-labelledby="quiz-heading">
      <div class="quiz-progress" aria-hidden="true"><span data-progress></span></div>

      <nav class="quiz-nav" aria-label="Questions">
        <p class="eyebrow">Step 2 of 4 · About you</p>
        <ol class="quiz-steps" data-steps></ol>
        <p class="quiz-privacy">Your answers stay in this browser.</p>
      </nav>

      <div class="quiz-main">
        <div data-question></div>
        <div class="quiz-footer">
          <span class="eyebrow" data-hint></span>
          <div class="quiz-buttons">
            <a class="pill pill-light" data-back>Back</a>
            <a class="pill pill-dark" data-next></a>
          </div>
        </div>
      </div>

      <aside class="quiz-side" aria-label="How your answers are used">
        <section class="q-panel">
          <p class="eyebrow">What this answer feeds</p>
          <div class="q-weights" aria-hidden="true" data-segments></div>
          <ul class="q-legend" data-legend></ul>
          <div class="q-filters">
            <span class="eyebrow">Not scored</span>
            <span class="q-flt" data-flt="slots">Outfit slots</span>
            <span class="q-flt" data-flt="nos">Hard no's</span>
          </div>
          <p class="q-note" data-note></p>
        </section>
        <section class="q-panel" data-near hidden>
          <p class="eyebrow">Near you · real data</p>
          <p class="q-near-title" data-near-title></p>
          <div class="q-near-rows" data-near-rows></div>
          <p class="q-flag" data-near-flag hidden></p>
          <p class="q-source">Google Trends, interest by state, ${monthYear(period[0])} to ${monthYear(period[1])},
            the ${brands.length} brands we track so far. Orange line = the average state (1.0×). Small brands are noisier.</p>
        </section>
      </aside>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const ui = {
    progress: $('[data-progress]'), steps: $('[data-steps]'), question: $('[data-question]'),
    hint: $('[data-hint]'), back: $('[data-back]'), next: $('[data-next]'), note: $('[data-note]'),
    near: $('[data-near]'), nearTitle: $('[data-near-title]'), nearRows: $('[data-near-rows]'), nearFlag: $('[data-near-flag]'),
  };

  // Saving: merge the change into the stored answers, then refresh everything that shows it
  const save = (patch, sound) => {
    store.set({ answers: { ...answers(), ...patch } });
    if (sound) tick(sound);
    refresh();
  };
  const ctx = { answers, save, states };

  // The step list, built once: one link per question, plus question 8 (the brands page)
  const steps = QUESTIONS.map((q, i) => {
    const answer = h('span', { class: 'q-step-answer' });
    const link = h('a', { class: 'q-step', href: `#/questions/${i + 1}` },
      h('span', { class: 'q-step-num' }, pad(i + 1)),
      h('span', { class: 'q-step-text' }, h('span', { class: 'q-step-title' }, q.title), answer));
    return { q, link, answer };
  });
  ui.steps.append(
    ...steps.map((s) => h('li', null, s.link)),
    h('li', null, h('a', { class: 'q-step', href: '#/brands' },
      h('span', { class: 'q-step-num' }, pad(TOTAL)),
      h('span', { class: 'q-step-text' }, h('span', { class: 'q-step-title' }, 'Your brands'), h('span', { class: 'q-step-answer' }, 'Next page')))),
  );

  // The weights bar and its legend, built once; show() lights up the parts each question feeds
  const segments = WEIGHTS.map((w) => h('span', { class: 'q-seg', style: `flex: ${w.pct} 1 0px` }));
  const legend = WEIGHTS.map((w) => h('li', { class: 'q-lg' }, h('span', { class: 'q-sq' }), h('span', null, w.name), h('span', { class: 'q-lg-pct' }, `${w.pct}%`)));
  $('[data-segments]').append(...segments);
  $('[data-legend]').append(...legend);
  const filters = [...root.querySelectorAll('[data-flt]')];

  // Draw the current question
  function show() {
    const q = QUESTIONS[index];
    setNote(`Question ${index + 1} of ${TOTAL}`);
    current = BUILDERS[q.key](ctx);
    const heading = h('h1', { id: 'quiz-heading', tabindex: '-1' }, `${q.lead} `, h('span', { class: 'serif' }, q.accent));
    ui.question.replaceChildren(h('div', { class: 'q-enter' },
      h('p', { class: 'eyebrow' }, `Question ${index + 1} of ${TOTAL} · ${q.title}`),
      heading,
      h('p', { class: 'q-help' }, q.help),
      current.el));

    WEIGHTS.forEach((w, i) => {
      const fed = q.feeds.includes(w.key);
      segments[i].classList.toggle('fed', fed);
      legend[i].classList.toggle('fed', fed);
    });
    filters.forEach((el) => el.classList.toggle('fed', el.dataset.flt === q.filter));
    ui.note.textContent = q.note;
    ui.progress.style.width = `${((index + 1) / TOTAL) * 100}%`;
    ui.back.href = index === 0 ? '#/swipe' : `#/questions/${index}`;
    refresh();
    return heading;
  }

  // Everything that depends on the answers
  function refresh() {
    const q = QUESTIONS[index];
    const a = answers();
    current.refresh();

    steps.forEach((s, i) => {
      s.answer.textContent = SUMMARIES[s.q.key](a) ?? 'Not answered yet';
      s.link.classList.toggle('on', i === index);
      if (i === index) s.link.setAttribute('aria-current', 'step');
      else s.link.removeAttribute('aria-current');
    });

    const last = index === QUESTIONS.length - 1;
    const answered = SUMMARIES[q.key](a) !== null;
    ui.next.href = last ? '#/brands' : `#/questions/${index + 2}`;
    ui.next.replaceChildren(last ? 'Next: your brands ' : answered ? 'Next ' : 'Skip ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
    ui.hint.textContent = q.key === 'colors' ? `${(a.colors || []).length} of ${MAX_COLORS} picked` : q.hint;

    showNear(q, a);
  }

  // Question 1's side card: the three brands your state searches for most, from the real data
  function showNear(q, a) {
    ui.near.hidden = q.key !== 'where';
    if (q.key !== 'where') return;
    const place = parsePlace(a.city, states);
    const state = place.code && states[place.code];
    ui.nearRows.replaceChildren();
    ui.nearFlag.hidden = true;
    if (!state) {
      ui.nearTitle.textContent = place.typed
        ? `We don't know “${place.typed}” yet. Try a state name or its two-letter code, like MD.`
        : 'Add your state, like “Baltimore, MD”, to see what people near you search for.';
      return;
    }
    const top = Object.entries(state.index)
      .filter(([, value]) => value !== null)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3);
    const scale = Math.max(2, top.length ? top[0][1] : 0);   // bars share one scale; the orange line marks 1.0
    const where = place.code === 'DC' ? 'Washington, D.C.' : state.name;
    ui.nearTitle.textContent = `The brands people in ${where} search for most, compared with the average state.`;
    ui.nearRows.append(...top.map(([brand, value]) => h('div', { class: 'q-near-row' },
      h('span', { class: 'q-near-brand' }, brand),
      h('span', { class: 'q-near-track' },
        h('span', { class: 'q-near-fill', style: `width: ${((100 * value) / scale).toFixed(1)}%` }),
        h('span', { class: 'q-near-base', style: `left: ${(100 / scale).toFixed(1)}%` })),
      h('span', { class: 'q-near-value' }, `${value.toFixed(2)}×`))));
    if (flags[place.code]) {
      ui.nearFlag.textContent = `Flagged: ${flags[place.code]}`;
      ui.nearFlag.hidden = false;
    }
  }

  show();

  return {
    // The router calls this when only the question number in the address changes
    update(nextParam) {
      index = toIndex(nextParam, answers());
      tick(980 + index * 60);
      const heading = show();
      window.scrollTo(0, 0);
      heading.focus({ preventScroll: true });
    },
  };
}

// ---------- One builder per question: each returns { el, refresh } ----------

const BUILDERS = {
  where: buildWhere,
  week: (ctx) => buildChoice(ctx, { field: 'week', options: WEEKS, layout: 'cols-3', label: 'Your week' }),
  fit: (ctx) => buildChoice(ctx, { field: 'fit', options: FITS, layout: 'cols-4', label: 'Fit', icon: fitIcon }),
  colors: buildColors,
  inspiration: buildInspiration,
  accessories: (ctx) => buildChoice(ctx, {
    field: 'acc', options: ACCESSORIES, layout: 'cols-2', label: 'Accessories', icon: pips,
    readout: { title: "Slots we'll fill", text: (key) => ACCESSORIES.find((o) => o.key === key)?.slots ?? 'Pick one above' },
  }),
  never: buildNever,
};

function buildWhere(ctx) {
  const input = h('input', { class: 'q-input', type: 'text', placeholder: 'Like Baltimore, MD', autocomplete: 'off', spellcheck: 'false' });
  input.value = ctx.answers().city || '';
  input.addEventListener('input', () => ctx.save({ city: input.value }));
  const chips = CITIES.map((city) => h('button', {
    type: 'button', class: 'q-opt',
    onclick: () => { input.value = city; ctx.save({ city }, 1240); },
  }, city));
  const cityOut = h('span', { class: 'q-readout-value' });
  const stateOut = h('span', { class: 'q-readout-value' });

  return {
    el: h('div', { class: 'q-body' },
      h('label', { class: 'q-field' }, h('span', { class: 'eyebrow' }, 'City, state'), input),
      h('div', { class: 'q-chips', role: 'group', 'aria-label': 'Suggested cities' }, chips),
      h('div', { class: 'q-readouts' },
        h('div', { class: 'q-readout' }, h('span', { class: 'eyebrow' }, 'City → climate'), cityOut),
        h('div', { class: 'q-readout' }, h('span', { class: 'eyebrow' }, 'State → trends'), stateOut))),
    refresh() {
      const text = ctx.answers().city || '';
      const place = parsePlace(text, ctx.states);
      cityOut.textContent = place.city || '—';
      stateOut.textContent = place.code ? ctx.states[place.code].name : place.typed ? `“${place.typed}”?` : '—';
      chips.forEach((chip) => setPressed(chip, chip.textContent === text));
    },
  };
}

// A set of cards where you pick one (week, fit, accessories)
function buildChoice(ctx, { field, options, layout, label, icon, readout }) {
  const cards = options.map((o) => h('button', { type: 'button', class: 'q-card', onclick: () => ctx.save({ [field]: o.key }, 1240) },
    icon ? icon(o) : null,
    h('span', { class: 'q-card-text' }, h('span', { class: 'q-card-title' }, o.label), h('span', { class: 'q-card-sub' }, o.sub))));
  const out = h('span', { class: 'q-readout-value' });
  return {
    el: h('div', { class: 'q-body' },
      h('div', { class: `q-choices ${layout}`, role: 'group', 'aria-label': label }, cards),
      readout ? h('div', { class: 'q-readout' }, h('span', { class: 'eyebrow' }, readout.title), out) : null),
    refresh() {
      const value = ctx.answers()[field];
      options.forEach((o, i) => setPressed(cards[i], value === o.key));
      if (readout) out.textContent = readout.text(value);
    },
  };
}

function buildColors(ctx) {
  const pick = (key) => {
    const list = ctx.answers().colors || [];
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key].slice(-MAX_COLORS);   // a 4th pick drops the oldest
    ctx.save({ colors: next }, 1240);
  };
  const swatches = COLORS.map((c) => {
    const badge = h('span', { class: 'q-badge', 'aria-hidden': 'true' });
    const button = h('button', { type: 'button', class: 'q-sw', onclick: () => pick(c.key) },
      h('span', { class: 'q-dot', style: `background: ${c.hex}` }, badge),
      h('span', { class: 'q-sw-name' }, c.label));
    return { c, button, badge };
  });
  const strip = h('div', { class: 'q-palette', 'aria-hidden': 'true' });
  return {
    el: h('div', { class: 'q-body' },
      h('div', { class: 'q-swatches', role: 'group', 'aria-label': 'Colors' }, swatches.map((s) => s.button)),
      h('div', { class: 'q-palette-row' }, h('span', { class: 'eyebrow' }, 'Your palette'), strip)),
    refresh() {
      const list = ctx.answers().colors || [];
      for (const { c, button, badge } of swatches) {
        const at = list.indexOf(c.key);
        setPressed(button, at !== -1);
        badge.textContent = at === -1 ? '' : String(at + 1);
        button.setAttribute('aria-label', at === -1 ? c.label : `${c.label}, pick ${at + 1} of ${MAX_COLORS}`);
      }
      strip.replaceChildren(...list.map((key) => h('span', { style: `background: ${COLORS.find((c) => c.key === key).hex}` })));
    },
  };
}

function buildInspiration(ctx) {
  const input = h('input', { class: 'q-input', type: 'text', placeholder: 'Type one, then press Enter', autocomplete: 'off', spellcheck: 'false' });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    const a = ctx.answers();
    const preset = INSPIRATIONS.find((o) => o.label.toLowerCase() === text.toLowerCase());
    if (preset) ctx.save({ inspo: unique([...(a.inspo || []), preset.key]) }, 1320);
    else ctx.save({ custom: unique([...(a.custom || []), text]) }, 1320);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
  const toggle = (key) => {
    const list = ctx.answers().inspo || [];
    ctx.save({ inspo: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] }, 1240);
  };
  const remove = (text) => ctx.save({ custom: (ctx.answers().custom || []).filter((t) => t !== text) }, 700);
  const presets = INSPIRATIONS.map((o) => h('button', { type: 'button', class: 'q-opt', onclick: () => toggle(o.key) }, o.label));
  const customs = h('span', { class: 'q-custom' });
  const out = h('span', { class: 'q-readout-value' });

  return {
    el: h('div', { class: 'q-body' },
      h('div', { class: 'q-add' },
        h('label', { class: 'q-field' }, h('span', { class: 'eyebrow' }, 'Add your own'), input),
        h('button', { type: 'button', class: 'pill pill-dark', onclick: add }, 'Add')),
      h('div', { class: 'q-chips', role: 'group', 'aria-label': 'Ideas' }, presets, customs),
      h('div', { class: 'q-readout' }, h('span', { class: 'eyebrow' }, 'We read this as'), out)),
    refresh() {
      const a = ctx.answers();
      const picked = a.inspo || [];
      const custom = a.custom || [];
      INSPIRATIONS.forEach((o, i) => setPressed(presets[i], picked.includes(o.key)));
      customs.replaceChildren(...custom.map((text) => h('button', {
        type: 'button', class: 'q-opt on', 'aria-label': `Remove ${text}`, onclick: () => remove(text),
      }, text, h('span', { class: 'q-x', 'aria-hidden': 'true' }, '×'))));
      const styles = unique(INSPIRATIONS.filter((o) => picked.includes(o.key)).flatMap((o) => o.styles)).map((key) => STYLES[key]);
      let text = styles.length ? styles.join(' · ') : 'Nothing yet';
      if (custom.length) text += `${styles.length ? ' + ' : ': '}${custom.length === 1 ? '1 new one' : `${custom.length} new ones`} we'll learn`;
      out.textContent = text;
    },
  };
}

function buildNever(ctx) {
  const toggle = (key) => {
    const list = ctx.answers().nos || [];
    ctx.save({ nos: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] }, 1240);
  };
  const chips = NEVER.map((o) => h('button', { type: 'button', class: 'q-opt', onclick: () => toggle(o.key) }, o.label));
  const out = h('span', { class: 'q-readout-value' });
  return {
    el: h('div', { class: 'q-body' },
      h('div', { class: 'q-chips', role: 'group', 'aria-label': 'Never wear' }, chips),
      h('div', { class: 'q-readout' }, h('span', { class: 'eyebrow' }, 'Removed before scoring'), out)),
    refresh() {
      const list = ctx.answers().nos || [];
      NEVER.forEach((o, i) => setPressed(chips[i], list.includes(o.key)));
      out.textContent = list.length ? list.map((key) => labelOf(NEVER, key)).join(', ') : 'Nothing yet. Everything stays in play.';
    },
  };
}

// ---------- Small helpers ----------

function fitIcon(option) {
  const icon = h('span', { class: 'q-fit-icon', 'aria-hidden': 'true' });
  icon.innerHTML = `<svg viewBox="0 0 64 64" width="76" height="76"><path d="${option.path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  return icon;
}

// Dots for the accessories cards: filled = a slot we'll fill; the 4th only appears for "Stack it"
function pips(option) {
  return h('span', { class: 'q-pips', 'aria-hidden': 'true' },
    [0, 1, 2, 3].map((i) => h('span', { class: i < option.dots ? 'q-pip full' : i < 3 ? 'q-pip' : 'q-pip none' })));
}

// "3" in the address -> question index 2. No number: the first question not answered yet.
function toIndex(param, answers) {
  const n = Number.parseInt(param, 10);
  if (n >= 1 && n <= QUESTIONS.length) return n - 1;
  const open = QUESTIONS.findIndex((q) => SUMMARIES[q.key](answers) === null);
  return open === -1 ? 0 : open;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function unique(list) {
  return [...new Set(list)];
}
