// Small helpers for building page elements, shared by the pages.

// h('a', { href: '#/' }, 'Home') builds <a href="#/">Home</a>. Props starting with "on" become
// event listeners. Text is always added as text, never as HTML, so nothing a visitor types
// can inject code into the page.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return el;
}

// Marks a toggle button as on or off, for the eye (the "on" class) and for screen readers (aria-pressed)
export function setPressed(button, on) {
  button.classList.toggle('on', on);
  button.setAttribute('aria-pressed', String(on));
}
