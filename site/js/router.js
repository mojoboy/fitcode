// A tiny "hash router". The part of the address after the # (like #/swipe) decides which page shows.
// Hash addresses work on any static host, GitHub Pages included: the server only ever sends
// index.html, and the browser swaps the page content itself, so the music never cuts out.
// An address can carry one extra part, a "parameter": #/questions/3 is the questions page, question 3.
import * as wardrobe from './views/wardrobe.js';
import * as swipe from './views/swipe.js';
import * as questions from './views/questions.js';
import * as brands from './views/brands.js';
import * as tryon from './views/tryon.js';
import * as fit from './views/fit.js';
import * as soon from './views/soon.js';

const ROUTES = {
  '/': { view: wardrobe, nav: 'wardrobe', title: 'Your closet, read like data' },
  '/swipe': { view: swipe, nav: 'style', title: 'Swipe warm-up' },
  '/questions': { view: questions, nav: 'style', title: 'A few questions' },
  '/brands': { view: brands, nav: 'style', title: 'Your brands' },
  '/try-on': { view: tryon, nav: 'style', title: 'Try it on' },
  '/fit': { view: fit, nav: 'style', title: 'Your fit' },
  '/atlas': { view: soon, nav: 'atlas', title: 'Atlas' },
};

export function startRouter(root, context) {
  const note = document.getElementById('top-note');
  const setNote = (text) => { note.textContent = text; };
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = null;
  let currentRoute = null;
  let firstLoad = true;

  function show() {
    // "#/questions/3" -> path "/questions", param "3"
    const [, first = '', param] = (location.hash.slice(1) || '/').split('/');
    const path = `/${first}`;
    const route = ROUTES[path] || ROUTES['/'];

    // Same page, new parameter (question 2 -> 3): let the page swap its own content
    if (route === currentRoute && current && current.update) {
      current.update(param);
      return;
    }

    // Let the old page clean up (stop animations, remove listeners) before the new one mounts
    if (current && current.unmount) current.unmount();
    root.replaceChildren();
    current = route.view.mount(root, { ...context, path, param, setNote }) || null;
    currentRoute = route;

    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === route.nav) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = `${route.title} · fitcode`;

    if (!calm) {
      root.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 600, easing: 'cubic-bezier(.16, 1, .3, 1)' }
      );
    }
    if (!firstLoad) {
      window.scrollTo(0, 0);
      root.focus({ preventScroll: true });   // screen readers start reading the new page
    }
    firstLoad = false;
  }

  window.addEventListener('hashchange', show);
  show();
}
