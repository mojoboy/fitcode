// Placeholder for pages that aren't built yet: says what's coming and when on the build plan.
const PAGES = {
  '/atlas': { title: 'Atlas', step: 'After launch', text: 'A map of what each state searches for.' },
};

export function mount(root, { path, setNote }) {
  const page = PAGES[path];
  setNote('Being built');
  root.innerHTML = `
    <section class="soon">
      <p class="eyebrow">${page.step} · coming soon</p>
      <h1>${page.title}</h1>
      <p class="soon-text">${page.text}</p>
      <a class="pill pill-light" href="#/"><span class="arrow" aria-hidden="true">←</span> Back to the wardrobe</a>
    </section>`;
}
