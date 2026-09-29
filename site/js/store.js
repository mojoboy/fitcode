// The visitor's answers, saved in their own browser (localStorage) so they survive page changes
// and reloads. Nothing is sent anywhere: the site has no server and no accounts.
const KEY = 'fitcode:v1';
const DEFAULTS = {
  swipes: [],    // [{ id, vote }] in the order they happened; vote 1 = like, -1 = pass
  answers: {},   // the questions: city, week, fit, colors, inspo, custom, acc, nos (see quiz.js)
  brands: [],    // names of the brands picked on the brands page (question 8)
  customBrands: [],   // brands the visitor typed in that aren't in our list
  overrides: {},      // pieces swapped in on Try it on: { slot: piece id }
};

let state = load();

export function get() {
  return state;
}

export function set(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked (private windows, strict settings). The site still works, it just won't remember.
  }
}

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}
