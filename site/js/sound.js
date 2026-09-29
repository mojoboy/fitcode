// Ambient sound, made live in the browser with the Web Audio API, so there are no audio files to license.
// Four soft tones (A, E, B, E) whose volumes swell slowly, through a low-pass filter that drifts.
// It stays off until the visitor turns it on: browsers block sound that starts by itself.

let audio = null;   // { ctx, master } once the sound has been started
let on = false;

export function initSound(button, label) {
  button.addEventListener('click', () => {
    on = !on;
    if (on && !audio) audio = start();
    if (audio) {
      const { ctx, master } = audio;
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(on ? 0.4 : 0, ctx.currentTime, on ? 1.2 : 0.25);   // slow fade in, quick fade out
    }
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    label.textContent = on ? 'Sound on' : 'Sound off';
  });
}

// A short, soft "tick" for interactions. Silent unless the sound is on.
export function tick(freq) {
  if (!on || !audio) return;
  const { ctx } = audio;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.09);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.04, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}

function start() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 850;
  filter.Q.value = 0.3;
  filter.connect(master);

  [110, 164.81, 246.94, 329.63].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (i - 1.5) * 5;      // a few cents apart, so the tones shimmer

    const voice = ctx.createGain();
    voice.gain.value = 0.05;

    // An LFO ("low-frequency oscillator") slowly swells this tone's volume up and down
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.04 + i * 0.017;
    const depth = ctx.createGain();
    depth.gain.value = 0.04;
    lfo.connect(depth);
    depth.connect(voice.gain);

    osc.connect(voice);
    voice.connect(filter);
    osc.start();
    lfo.start();
  });

  // Another slow LFO moves the filter, so the sound gets a little brighter and darker over time
  const drift = ctx.createOscillator();
  drift.frequency.value = 0.03;
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = 260;
  drift.connect(driftDepth);
  driftDepth.connect(filter.frequency);
  drift.start();

  return { ctx, master };
}
