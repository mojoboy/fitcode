// Sound for the site, made live in the browser with the Web Audio API, so there are no audio files
// to license or download. Two parts:
//   1. Music: a slow lo-fi groove. Jazzy chords on a soft electric piano, a round bassline, lazy
//      drums, a short melody with an echo, and a little vinyl crackle.
//   2. Ticks: a soft note whenever you tap something, always in the music's key, so it fits in.
// Nothing plays until the visitor turns the sound on: browsers block sound that starts by itself.
//
// How Web Audio works, in short: you wire up "nodes" like guitar pedals. An oscillator makes a tone,
// a gain node is a volume knob, a filter is a tone knob (a lowpass filter cuts the highs, which
// sounds warmer), and the chain ends at the speakers (ctx.destination). Every note is booked at an
// exact time on the audio clock (ctx.currentTime, in seconds). That clock never runs late, which is
// what keeps the beat steady.

const BPM = 82;               // beats per minute: slow and relaxed
const BEAT = 60 / BPM;        // one beat, in seconds (about 0.73)
const STEP = BEAT / 4;        // the rhythm grid: 16 steps per bar of 4 beats
const SWING = 0.22;           // every other step lands 22% of a step late: the lazy, "swung" feel
const VOLUME = 0.5;           // overall music volume, 0 to 1
const LOOKAHEAD = 0.3;        // how far ahead notes are booked, in seconds

// Notes are MIDI numbers: 60 is middle C, +1 is a half step up, +12 is an octave up
const hz = (note) => 440 * 2 ** ((note - 69) / 12);

// The four chords, one per bar, on a loop. Each steps down from the last (F, E, D, C), a classic
// lo-fi move. keys = the four notes the piano plays, bass = the low note underneath.
const CHORDS = [
  { name: 'Fmaj9', keys: [57, 60, 64, 67], bass: 41 },
  { name: 'Em7', keys: [55, 59, 62, 64], bass: 40 },
  { name: 'Dm9', keys: [53, 57, 60, 64], bass: 38 },
  { name: 'Cmaj9', keys: [52, 55, 59, 62], bass: 36 },
];

// Drum patterns: one character per step, 16 per bar. X = accent, x = normal, o = soft, - = rest.
const KICK = 'X------x--x-----';
const SNARE = '----X-------X---';
const HATS = 'x-o-x-o-x-o-x-oo';
const LOUDNESS = { X: 1, x: 0.75, o: 0.45 };

// The bassline, the same shape every bar: [step, notes above the chord's bass note, length in steps]
const BASSLINE = [[0, 0, 6], [10, 0, 3], [14, 12, 2]];

// The melody: [bar of the 4, step, note, length in steps]. Every note belongs to the chord under it.
// It plays in the second half of every 8 bars, so the groove has room to breathe.
const MELODY = [
  [0, 3, 79, 3], [0, 6, 81, 4], [0, 10, 76, 6],
  [1, 3, 74, 3], [1, 6, 76, 2], [1, 8, 79, 7],
  [2, 3, 69, 3], [2, 6, 72, 4], [2, 10, 74, 6],
  [3, 2, 76, 8], [3, 12, 74, 2], [3, 14, 72, 4],
];

// The notes the ticks use: C major pentatonic (C, D, E, G, A), five notes that sound good over every
// chord in the loop. The numbers are positions within an octave: C = 0, D = 2, and so on.
const PENTATONIC = [0, 2, 4, 7, 9];

let audio = null;   // the audio engine, the band and the scheduler, set up the first time sound is turned on
let on = false;

export function initSound(button, label) {
  button.style.setProperty('--beat', `${BEAT.toFixed(3)}s`);   // the button's bars bounce at the music's tempo
  button.addEventListener('click', () => {
    on = !on;
    if (on) play();
    else pause();
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    label.textContent = on ? 'Sound on' : 'Sound off';
  });
}

// A short, soft note for taps and clicks. Pages pass a rough pitch (higher for "yes", lower for
// "no"), and it's moved to the nearest note in the music's key. Silent unless the sound is on.
export function tick(freq) {
  if (!on || !audio) return;
  const { ctx } = audio;
  const t = ctx.currentTime;
  const f = hz(tickNote(freq));
  // Two sine waves: the note, and a quieter one two octaves up that fades fast. Together they
  // sound like a soft mallet.
  for (const [partial, level, fade] of [[1, 1, 0.4], [4, 0.3, 0.08]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * partial;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.06 * level, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + fade + 0.05);
  }
}

// A pitch in hertz -> the nearest note of the pentatonic scale, as a MIDI number
export function tickNote(freq) {
  const exact = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(exact);
  for (const shift of [0, -1, 1, -2, 2]) {
    const note = nearest + shift;
    if (PENTATONIC.includes(((note % 12) + 12) % 12)) return note;
  }
  return nearest;
}

function play() {
  if (!audio) audio = setUp();
  if (!audio) return;   // a very old browser without Web Audio: stay silent
  const { ctx, master } = audio;
  clearTimeout(audio.sleepTimer);
  ctx.resume();
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(VOLUME, now, 0.6);   // fade in
  if (!audio.timer) {
    // Start from the top of the next bar, with the intro
    audio.step = Math.ceil(audio.step / 16) * 16;
    audio.nextTime = now + 0.1;
    audio.band.warmUp(audio.nextTime, audio.step);
    audio.timer = setInterval(schedule, 50);
    schedule();
  }
}

function pause() {
  if (!audio) return;
  const { ctx, master } = audio;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);   // quick fade out
  // Once it's quiet, stop booking notes and let the audio engine sleep
  audio.sleepTimer = setTimeout(() => {
    clearInterval(audio.timer);
    audio.timer = null;
    ctx.suspend();
  }, 800);
}

// The scheduler: every 50 ms, book every step that starts in the next 0.3 seconds. JavaScript timers
// can fire late (a busy page, a background tab), but notes booked on the audio clock can't, so
// booking a little ahead keeps the beat steady.
function schedule() {
  const { ctx, band } = audio;
  while (audio.nextTime < ctx.currentTime + LOOKAHEAD) {
    band.playStep(audio.step, audio.nextTime);
    audio.nextTime += STEP;
    audio.step += 1;
  }
}

function setUp() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();   // the on/off volume knob, faded rather than switched
  master.gain.value = 0;
  master.connect(ctx.destination);
  return { ctx, master, band: makeBand(ctx, master), step: 0, nextTime: 0, timer: null, sleepTimer: 0 };
}

// Plays the first `bars` bars into a silent, offline audio context and returns the recording.
// The tests use it to check that the music is never silent and never too loud.
export async function renderMusic(bars) {
  const rate = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil((bars * 16 * STEP + 3) * rate), rate);
  const band = makeBand(ctx, ctx.destination);
  for (let step = 0; step < bars * 16; step++) band.playStep(step, 0.1 + step * STEP);
  const recording = await ctx.startRendering();
  return { samples: recording.getChannelData(0), rate, barSeconds: 16 * STEP };
}

// The band: every instrument and effect, wired together. playStep() plays one step of the loop.
// It works with any audio context, so the tests can record it silently (renderMusic above).
function makeBand(ctx, output) {
  // ---------- The mixing desk: each instrument gets its own channel, and they all meet in mix ----------
  const mix = ctx.createGain();

  // The "tape": a lowpass filter that rounds off the highs, then a compressor that evens out the loud
  // and quiet moments so everything sits together, then the band's overall level
  const BRIGHT = 9000;   // how much of the highs the tape lets through, in hertz
  const tape = filter('lowpass', BRIGHT, 0.5);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.ratio.value = 3;
  glue.attack.value = 0.01;
  glue.release.value = 0.25;
  const level = ctx.createGain();
  level.gain.value = 0.7;
  mix.connect(tape).connect(glue).connect(level).connect(output);

  // Piano channel: a gentle, fast wobble in volume (tremolo, like a vintage electric piano), a dip on
  // every kick drum (ducking, so the beat breathes), and a tiny delay that drifts, bending the pitch a
  // hair like a worn cassette
  const keys = ctx.createGain();
  const tremolo = ctx.createGain();
  const duck = ctx.createGain();
  const wobble = ctx.createDelay();
  wobble.delayTime.value = 0.012;
  keys.connect(tremolo).connect(duck).connect(wobble).connect(mix);
  lfo(ctx, tremolo.gain, 4.2, 0.12);
  lfo(ctx, wobble.delayTime, 0.35, 0.0015);

  // Melody channel: the same cassette wobble, plus an echo that repeats each note a dotted eighth
  // later, softer and darker every time around
  const lead = ctx.createGain();
  lead.connect(wobble);
  const echo = ctx.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const darker = filter('lowpass', 2000);
  const again = ctx.createGain();   // how much of each echo comes back for another round
  again.gain.value = 0.35;
  const echoLevel = ctx.createGain();
  echoLevel.gain.value = 0.5;
  lead.connect(echo).connect(darker).connect(again).connect(echo);
  darker.connect(echoLevel).connect(mix);

  // Bass, drums and vinyl channels. The drums lose their brightest highs, for a dusty sound.
  const bass = ctx.createGain();
  bass.connect(filter('lowpass', 700)).connect(mix);
  const drums = ctx.createGain();
  drums.connect(filter('lowpass', 9000)).connect(mix);
  const vinyl = ctx.createGain();
  vinyl.connect(mix);

  // White noise (random values) is the raw material for the snare, hi-hats and vinyl sounds.
  // Two seconds of it, made once and reused.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  // Vinyl hiss: the noise on a loop, filtered and very quiet
  const hiss = ctx.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  const hissLevel = ctx.createGain();
  hissLevel.gain.value = 0.004;
  hiss.connect(filter('bandpass', 3000, 0.5)).connect(hissLevel).connect(vinyl);
  hiss.start();

  let startBar = 0;   // the bar the music was turned on at, for the intro

  // ---------- Building blocks ----------

  function filter(type, frequency, q = 0.7) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  // An oscillator that plays from t to end
  function tone(type, frequency, t, end) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.start(t);
    osc.stop(end);
    return osc;
  }

  // A volume envelope: silent, up to `peak` in `attack` seconds, then fading away until `end`.
  // (Fades aim for 0.0001, not 0, because this kind of curve can never quite reach zero.)
  function envelope(t, peak, attack, end) {
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    return amp;
  }

  // A short slice of the noise, from a random spot so no two hits sound exactly alike
  function noiseBurst(t, length) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.start(t, Math.random() * 1.5, length);
    return source;
  }

  // ---------- The instruments ----------

  // Electric piano, by FM synthesis: a second, silent oscillator shakes the note's pitch very fast,
  // which adds bright overtones at the start (the bell-like "bark"). The shaking calms down, so each
  // note fades out round and warm.
  function piano(t, note, strength) {
    const f = hz(note);
    const end = t + 2.6;
    const carrier = tone('sine', f, t, end);
    const modulator = tone('sine', f, t, end);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * 1.4 * strength, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.7);
    modulator.connect(depth).connect(carrier.frequency);
    carrier.connect(envelope(t, 0.2 * strength, 0.006, end)).connect(keys);
  }

  function bassNote(t, note, length) {
    const f = hz(note);
    const end = t + length + 0.1;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.24, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.15, t + length);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.connect(bass);
    tone('sine', f, t, end).connect(amp);
    // A quiet triangle wave an octave up, so the bass still comes through on phone and laptop speakers
    const upper = ctx.createGain();
    upper.gain.value = 0.35;
    tone('triangle', f * 2, t, end).connect(upper).connect(amp);
  }

  function kick(t, strength) {
    const osc = tone('sine', 140, t, t + 0.45);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);   // the pitch drops fast: that's the "boom"
    osc.connect(envelope(t, 0.65 * strength, 0.004, t + 0.42)).connect(drums);
    // Duck the piano: down to 70% on the kick, back up over 0.3 seconds
    duck.gain.setValueAtTime(0.7, t);
    duck.gain.linearRampToValueAtTime(1, t + 0.3);
  }

  function snare(t, strength) {
    // The "crack": noise through a filter that keeps the middle frequencies...
    noiseBurst(t, 0.25)
      .connect(filter('bandpass', 1800, 0.8))
      .connect(envelope(t, 0.28 * strength, 0.003, t + 0.2))
      .connect(drums);
    // ...and a short low tone for the body of the drum
    const body = tone('triangle', 190, t, t + 0.12);
    body.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    body.connect(envelope(t, 0.1 * strength, 0.003, t + 0.1)).connect(drums);
  }

  // Hi-hat: a tick of very high noise. Open hats ring longer.
  function hat(t, strength, open) {
    const length = open ? 0.5 : 0.14;
    noiseBurst(t, length + 0.02)
      .connect(filter('highpass', 6000))
      .connect(envelope(t, 0.2 * strength, 0.002, t + length))
      .connect(drums);
  }

  // One vinyl click: a few thousandths of a second of noise
  function crackle(t) {
    noiseBurst(t, 0.004)
      .connect(filter('highpass', 2500))
      .connect(envelope(t, 0.02 + Math.random() * 0.035, 0.0005, t + 0.004))
      .connect(vinyl);
  }

  function melodyNote(t, note, length) {
    const f = hz(note);
    const end = t + length + 0.35;
    const osc = tone('triangle', f, t, end);
    // Vibrato: after a moment the pitch starts to sway a little, like a singer holding a note
    const vibrato = tone('sine', 5, t, end);
    const sway = ctx.createGain();
    sway.gain.setValueAtTime(0, t);
    sway.gain.linearRampToValueAtTime(14, t + 0.35);   // in cents (hundredths of a half step)
    vibrato.connect(sway).connect(osc.detune);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.13, t + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.08, t + length);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(filter('lowpass', f * 3)).connect(amp).connect(lead);
  }

  // ---------- Playing the loop ----------

  // One step of the loop, at `time` on the audio clock. step counts up forever: step 0 is the first
  // sixteenth of bar 0, step 16 the first of bar 1, and so on.
  function playStep(step, time) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const t = time + (s % 2 ? SWING * STEP : 0);   // swing: odd steps land a little late
    const since = bar - startBar;                   // bars since the music was turned on
    const chord = CHORDS[bar % 4];
    const turnaround = bar % 8 === 7;               // the last bar of every 8 changes up the drums

    // Piano: the chord on beat 1, strummed (each note a moment after the last), and a softer repeat
    // on the "and" of beat 3
    if (s === 0 || s === 10) {
      chord.keys.forEach((note, i) => piano(t + 0.012 + i * 0.018, note, s === 0 ? 1 : 0.45));
    }

    // The intro: the piano alone, then the bass joins on the second bar and the drums on the third
    if (since >= 1) {
      for (const [at, up, length] of BASSLINE) {
        if (at === s) bassNote(t, chord.bass + up, length * STEP);
      }
    }
    if (since >= 2) {
      const kickLoud = LOUDNESS[KICK[s]];
      if (kickLoud && !(turnaround && s === 10)) kick(t, kickLoud);
      const snareLoud = LOUDNESS[SNARE[s]];
      if (snareLoud) snare(t + 0.008, snareLoud);   // a hair behind the beat: laid back
      const hatLoud = LOUDNESS[HATS[s]];
      // Hi-hats get tiny random changes in timing and loudness, like a real drummer's
      if (hatLoud) hat(t + (Math.random() - 0.5) * 0.008, hatLoud * (0.85 + Math.random() * 0.3), turnaround && s === 14);
    }

    // The melody, in the second half of every 8 bars, once the groove is going
    if (since >= 4 && bar % 8 >= 4) {
      for (const [b, at, note, length] of MELODY) {
        if (b === bar % 4 && at === s) melodyNote(t, note, length * STEP);
      }
    }

    // Vinyl crackle: a few random clicks per beat
    if (Math.random() < 0.35) crackle(time + Math.random() * STEP);
  }

  // Called when the sound is turned on: the intro starts again, and the "tape" filter opens up over
  // about 6 seconds, like the music coming into focus
  function warmUp(time, step) {
    startBar = Math.floor(step / 16);
    tape.frequency.cancelScheduledValues(time);
    tape.frequency.setValueAtTime(600, time);
    tape.frequency.exponentialRampToValueAtTime(BRIGHT, time + 6);
  }

  return { playStep, warmUp };
}

// An LFO ("low-frequency oscillator"): a slow, silent wave that turns a knob back and forth
function lfo(ctx, param, rate, depth) {
  const wave = ctx.createOscillator();
  wave.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  wave.connect(amount).connect(param);
  wave.start();
}
