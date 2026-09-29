// Starts the site: wires up the sound button, loads the data pack, then hands over to the router.
import { initSound } from './sound.js';
import { loadData } from './data.js';
import { startRouter } from './router.js';

initSound(document.getElementById('sound'), document.getElementById('sound-text'));

const view = document.getElementById('view');

try {
  const data = await loadData();
  startRouter(view, { data });
} catch (error) {
  console.error(error);
  view.innerHTML = `
    <section class="soon">
      <p class="eyebrow">Couldn't start</p>
      <h1>The data didn't load.</h1>
      <p class="soon-text">Open the site through a local server (python -m http.server --directory site)
      instead of double-clicking index.html, and run scripts/export_site_data.py first.</p>
    </section>`;
}
