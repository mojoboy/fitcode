// The wardrobe: every piece in the closet floating on a slowly turning 3D ball.
//
// The math, in three steps:
//   1. Spread the pieces evenly over a sphere (a "Fibonacci sphere").
//   2. Every frame, turn the sphere a little (rotation with sine and cosine).
//   3. Project each 3D point onto the flat screen with perspective: closer means bigger.
import { tick } from '../sound.js';

const FOCAL = 1000;         // camera distance for the perspective, in px
const SPIN = 0.0018;        // radians per frame when nobody is touching it
const BASE_RADIUS = 330;    // sphere radius on a desktop screen, in px
const GROW = 0.4;           // the piece in focus zooms to 1.4 times its size...
const RECEDE = 0.08;        // ...while the rest of the cloud falls back 8%...
const SOFTEN = 3;           // ...and goes soft, like a camera focusing (blur in px, at full size)
const SLOT_NAMES = {
  hat: 'Hat', eyewear: 'Eyewear', jewelry: 'Jewelry', top: 'Top',
  bottom: 'Bottoms', shoes: 'Shoes', mood: 'Moodboard',
};

export function mount(root, { data, setNote }) {
  const items = data.closet.items;
  setNote(`Sample closet · ${items.length} pieces`);

  root.innerHTML = `
    <section class="wardrobe" aria-labelledby="wardrobe-title">
      <div class="stage" role="group" aria-label="The wardrobe. Drag to spin it. Point at or tap a piece to inspect it.">
        <div class="cloud"></div>
      </div>
      <div class="wardrobe-foot">
        <div>
          <h1 id="wardrobe-title">Your closet,<br>read like data.</h1>
          <p class="eyebrow">Drag to spin · point at a piece to inspect</p>
        </div>
        <a class="pill pill-dark" href="#/swipe">Style me <span class="arrow" aria-hidden="true">→</span></a>
        <p class="wardrobe-credit">Sample items, not for sale<br>Photos: Burst by Shopify, free license</p>
      </div>
    </section>`;

  const stage = root.querySelector('.stage');
  const cloud = root.querySelector('.cloud');

  // 1. Fibonacci sphere: step evenly from the top of the ball to the bottom, turning by the
  //    golden angle (about 137.5 degrees) each time, so no two pieces bunch up. On screens,
  //    y grows downward, so y runs from near -1 (top) to near 1 (bottom). The half-step
  //    offset (i + 0.5) keeps every piece off the exact poles, where turning the ball
  //    wouldn't move it at all. The closet comes sorted head to toe, so hats sit near the
  //    top and shoes near the bottom.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const points = items.map((item, i) => {
    const y = ((i + 0.5) / items.length) * 2 - 1;
    const ring = Math.sqrt(1 - y * y);           // radius of the horizontal circle at this height
    const theta = golden * i;
    return {
      el: makePiece(item),
      // Base width: the same area for every photo, so landscape shots come out wider, portrait narrower
      base: Math.sqrt(11000 * (item.w / item.h)),
      x: Math.cos(theta) * ring,
      y: y * 0.62,                                // squash the ball: wider than it is tall
      z: Math.sin(theta) * ring,
      focus: 0,                                   // 0..1, eases toward 1 while this piece is in focus
    };
  });
  const byElement = new Map(points.map((p) => [p.el, p]));
  cloud.append(...points.map((p) => p.el));

  // Everything that changes over time
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const autoSpeed = calm ? 0 : SPIN;
  let rotY = 0.4;           // turn around the vertical axis
  let rotX = -0.12;         // tilt toward or away from you
  let speed = autoSpeed;
  let velocity = 0;         // leftover spin after a drag, which fades out ("inertia")
  let dim = 0;              // 0..1, how much the other pieces fade while one is in focus
  let hovered = null;       // the piece under the mouse
  let pinned = null;        // the piece someone tapped or clicked
  let drag = null;
  let ignoreClick = false;
  let leaveTimer = 0;
  let radius = BASE_RADIUS;
  let sizeScale = 1;
  let k = 1;                // pieces are built k times their base size, then only scaled down
  let frame = 0;

  // Smaller screens get a smaller ball, but the pieces shrink less so they stay readable
  const fit = () => {
    const box = stage.getBoundingClientRect();
    radius = Math.max(120, Math.min(BASE_RADIUS, box.width * 0.4, box.height * 0.5));
    sizeScale = Math.max(0.55, radius / BASE_RADIUS);
    // The biggest a piece can ever get: at the very front of the ball, in focus. Building
    // every piece at that size means the browser only ever shrinks it, which stays sharp.
    k = (FOCAL / (FOCAL - radius)) * sizeScale * (1 + GROW);
    cloud.style.setProperty('--k', k.toFixed(3));
    for (const p of points) p.el.style.width = `${(p.base * k).toFixed(1)}px`;
  };
  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  fit();

  // 2 + 3. One animation frame. Every value eases a fraction of the way toward its target,
  // so nothing jumps: the spin slows to a stop while a piece is in focus, then picks back up.
  const draw = () => {
    const active = pinned || hovered;
    speed += ((active ? 0 : autoSpeed) - speed) * 0.08;
    if (active && speed < 0.00001) speed = 0;              // easing never quite reaches zero: snap it
    if (!drag) {
      rotY += speed + velocity;
      velocity *= active ? 0.85 : 0.94;
      if (Math.abs(velocity) < 0.00001) velocity = 0;
    }
    dim += ((active ? 1 : 0) - dim) * 0.1;

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    for (const p of points) {
      p.focus += ((p === active ? 1 : 0) - p.focus) * 0.1;

      // Rotate around the vertical axis, then tilt around the horizontal one
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;

      // Perspective: a point closer to you (bigger z) is drawn bigger and further out from the center
      const perspective = FOCAL / (FOCAL - z2 * radius);
      const depth = (z2 + 1) / 2;                          // 0 at the back, 1 at the front
      const fade = 0.28 + 0.72 * depth;                    // pieces at the back fade out
      const rest = 1 - p.focus;                            // 1 for pieces out of focus, 0 in focus
      const opacity = fade * (1 - 0.65 * dim * rest) + (1 - fade) * p.focus;
      const size = perspective * sizeScale * (1 + GROW * p.focus) * (1 - RECEDE * dim * rest);
      const blur = SOFTEN * dim * rest;

      p.screenY = y2 * radius * perspective;               // below the center of the cloud when > 0
      p.el.style.transform =
        `translate(-50%, -50%) translate(${(x1 * radius * perspective).toFixed(1)}px, ` +
        `${p.screenY.toFixed(1)}px) scale(${(size / k).toFixed(4)})`;
      p.el.style.opacity = opacity.toFixed(3);
      p.el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
      // While a piece is in focus, drop the "reuse the old drawing" hint, so the browser redraws it sharp
      p.el.style.willChange = p.focus > 0.5 ? 'auto' : '';
      p.el.style.zIndex = p.focus > 0.02 ? 1000 + Math.round(p.focus * 1000) : Math.round(depth * 900);
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  // Show the label on the piece in focus
  const refresh = () => {
    const active = pinned || hovered;
    if (active) active.el.classList.toggle('label-up', active.screenY > 0);
    for (const p of points) {
      p.el.classList.toggle('on', p === active);
      p.el.setAttribute('aria-pressed', String(p === pinned));
    }
  };
  const pieceAt = (target) => byElement.get(target.closest('.piece')) || null;
  // Pointing at a piece is silent (sweeping across the cloud made a run of notes); only a click plays one
  const setHovered = (p) => {
    clearTimeout(leaveTimer);
    if (p === hovered) return;
    hovered = p;
    refresh();
  };
  // A short grace period when the mouse leaves a piece, so sliding onto the next one doesn't flash
  const releaseHover = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => setHovered(null), 90);
  };

  // Mouse and pen: point at a piece to bring it forward. This listens for pointermove, not
  // pointerover: pointermove only fires when the mouse really moves, so a resting cursor
  // doesn't grab whatever piece drifts under it (that was the old flicker). One listener on
  // the cloud covers every piece, because pointer events "bubble" up from a piece to its parent.
  cloud.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || (drag && drag.moved)) return;
    const p = pieceAt(e.target);
    if (p) setHovered(p);
  });
  cloud.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const p = pieceAt(e.target);
    if (p && p === hovered && !p.el.contains(e.relatedTarget)) releaseHover();
  });

  // Keyboard: tabbing onto a piece works like pointing at it
  cloud.addEventListener('focusin', (e) => setHovered(pieceAt(e.target)));
  cloud.addEventListener('focusout', releaseHover);

  // Tap or click a piece to pin it in focus (phones have no hover); tap empty space to let go
  stage.addEventListener('click', (e) => {
    if (ignoreClick) { ignoreClick = false; return; }
    const p = pieceAt(e.target);
    pinned = p && p !== pinned ? p : null;
    refresh();
    if (pinned) tick(1320);
  });

  // Drag to spin. Small wobbles (4 px or less) still count as a click.
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ignoreClick = false;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    velocity = 0;
  });
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // The mouse button was let go outside the window, so the "up" event never came
    if (e.pointerType === 'mouse' && e.buttons === 0) { onUp(e); return; }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) <= 4) return;
      drag.moved = true;
      stage.classList.add('dragging');
      hovered = null;
      pinned = null;
      refresh();
    }
    rotY += dx * 0.006;
    rotX = Math.max(-0.6, Math.min(0.6, rotX - dy * 0.004));
    velocity = dx * 0.006;
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    ignoreClick = drag.moved;
    drag = null;
    stage.classList.remove('dragging');
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // The router calls this before showing another page
  return {
    unmount() {
      cancelAnimationFrame(frame);
      clearTimeout(leaveTimer);
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}

// One piece: a button holding a framed photo and a label that shows while it's in focus.
// fit() sets its width; the frame keeps the photo's shape (aspect ratio) even before it loads.
function makePiece(item) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'piece';
  el.setAttribute('aria-label', item.name);
  el.setAttribute('aria-pressed', 'false');

  const frame = document.createElement('span');
  frame.className = 'piece-frame';
  frame.style.aspectRatio = `${item.w} / ${item.h}`;

  const img = document.createElement('img');
  img.src = item.img;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  frame.append(img);

  const name = document.createElement('span');
  name.className = 'piece-name';
  name.textContent = item.name;
  const meta = document.createElement('span');
  meta.className = 'piece-meta';
  meta.textContent = `${SLOT_NAMES[item.slot] || item.slot} · sample`;
  const label = document.createElement('span');
  label.className = 'piece-label';
  label.append(name, meta);

  el.append(frame, label);
  return el;
}
