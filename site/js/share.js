// Share links: everything that shapes an outfit, packed into the address, like #/fit/eyJ2Ijox...
// Only what the model uses goes in: your swipes, answers and brand picks, your state instead of
// your city, the month (it sets the weather), and nothing you typed yourself. There's no server,
// so the link itself is the data.
import { parsePlace } from './quiz.js';

const VERSION = 1;

export function encodeFit(saved, data, month) {
  const answers = { ...saved.answers };
  const place = parsePlace(answers.city, data.trends.states);
  answers.city = place.code ? `, ${place.code}` : '';     // keep the state, drop the city
  delete answers.custom;                                   // typed-in inspiration isn't used by the model
  const listed = new Set(data.brands.brands.map((brand) => brand.name));
  const payload = {
    v: VERSION,
    swipes: saved.swipes,
    answers,
    brands: saved.brands.filter((name) => listed.has(name)),   // typed-in brands aren't used either
    overrides: saved.overrides,
    month,
  };
  return toBase64Url(JSON.stringify(payload));
}

// Returns the saved-state shape the model expects, or null if the link is broken
export function decodeFit(code) {
  try {
    const payload = JSON.parse(fromBase64Url(code));
    if (payload.v !== VERSION) return null;
    return {
      swipes: Array.isArray(payload.swipes) ? payload.swipes : [],
      answers: payload.answers && typeof payload.answers === 'object' ? payload.answers : {},
      brands: Array.isArray(payload.brands) ? payload.brands : [],
      overrides: payload.overrides && typeof payload.overrides === 'object' ? payload.overrides : {},
      // Links made before the month was added have none, so they use the current month
      month: Number.isInteger(payload.month) && payload.month >= 0 && payload.month < 12 ? payload.month : undefined,
    };
  } catch {
    return null;
  }
}

// Base64url: base64 (text made of 64 safe characters) with the URL-unfriendly ones swapped out
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
