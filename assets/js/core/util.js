// Small DOM / SVG / theme helpers shared by every page.

export const SVGNS = 'http://www.w3.org/2000/svg';

/** Create an HTML element. h('div.card.big', {style:'..', onclick}, [children]) */
export function h(tag, attrs = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

/** Create an SVG element. s('circle', {cx, cy, r, class:'x'}) */
export function s(tag, attrs = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElementNS(SVGNS, name);
  if (classes.length) el.setAttribute('class', classes.join(' '));
  applyAttrs(el, attrs, true);
  append(el, children);
  return el;
}

function applyAttrs(el, attrs, isSvg) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class' && isSvg) el.setAttribute('class', v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function append(el, children) {
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Build a root <svg> sized in stage pixels (viewBox == pixel size → font-size = stage px). */
export function svgRoot(host, w, h, attrs = {}) {
  const root = s('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, preserveAspectRatio: 'xMidYMid meet', ...attrs });
  host.append(root);
  return root;
}

/** Multi-line / rich SVG text. Supports <tspan>-style sub/sup via _x and ^x tokens inside {}. */
export function svgText(parent, x, y, str, attrs = {}) {
  const t = s('text', { x, y, ...attrs });
  setRich(t, str);
  parent.append(t);
  return t;
}

/** Converts "CO_{2}" / "Fe^{2+}" / plain text into tspans inside an SVG text node. */
export function setRich(textEl, str) {
  textEl.textContent = '';
  const re = /([_^])\{([^}]*)\}/g;
  let last = 0, m;
  const push = (txt, kind) => {
    if (!txt) return;
    const ts = s('tspan');
    ts.textContent = txt;
    if (kind) {
      ts.setAttribute('baseline-shift', kind === '_' ? 'sub' : 'super');
      ts.setAttribute('font-size', '70%');
    }
    textEl.append(ts);
  };
  while ((m = re.exec(str))) { push(str.slice(last, m.index)); push(m[2], m[1]); last = re.lastIndex; }
  push(str.slice(last));
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Theme ---------- */
const THEME_KEY = 'biochem.theme';
export function getTheme() { return document.documentElement.dataset.theme || 'dark'; }
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set(THEME_KEY, t);
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}
export function initTheme() {
  const saved = store.get(THEME_KEY);
  document.documentElement.dataset.theme = saved || 'dark';
}
export function onTheme(fn) {
  const handler = (e) => fn(e.detail);
  window.addEventListener('themechange', handler);
  return () => window.removeEventListener('themechange', handler);
}
/** Read a CSS custom property as a string (resolved on :root). */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/* ---------- Safe storage (private windows can throw) ---------- */
export const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  getJSON(k, fallback = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/* ---------- Icons (SF-Symbols-like strokes) ---------- */
const ICONS = {
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  home: '<path d="M4 11.5L12 4l8 7.5"/><path d="M6.5 9.5V20h11V9.5"/>',
  quiz: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>',
  notes: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/>',
  laser: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  // biology / clinical glyphs for cards
  rbc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  alert: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.9" r=".5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  drop: '<path d="M12 3.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  pill: '<g transform="rotate(-35 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>',
  flask: '<path d="M9 3.5h6M10 3.5V9l-5.2 9.2a1.6 1.6 0 0 0 1.4 2.3h11.6a1.6 1.6 0 0 0 1.4-2.3L14 9V3.5"/><path d="M7.4 14.5h9.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-4.3 4.2-6.4 4.2-10.3 2.6 1.6 4.2 4 4.2 6.3 1-.6 1.6-1.8 1.7-3 1.9 1.6 2.9 4.2 2.9 6.9C18.5 18.4 15.9 21 12 21z"/>',
  leaf: '<path d="M5 19c0-8.5 5.5-14 14.5-14.5C19 13.5 13.5 19 5 19z"/><path d="M5 19l8-8"/>',
  bone: '<path d="M7 4.5a2 2 0 0 0-2.8 2.8A2 2 0 0 0 7 10.1l6.9 6.9a2 2 0 0 0 2.8 2.8 2 2 0 0 0 2.8-2.8 2 2 0 0 0-2.8-2.8L9.8 7.3A2 2 0 0 0 7 4.5z"/>',
  scissors: '<circle cx="6.5" cy="7" r="2.6"/><circle cx="6.5" cy="17" r="2.6"/><path d="M8.6 8.5 20 17M8.6 15.5 20 7"/>',
  layers: '<path d="M12 3.5 3 8l9 4.5L21 8z"/><path d="M3 12.5l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
  cycle: '<path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M4 12A8 8 0 0 1 17.7 6.4"/><path d="M18 2.8v3.8h-3.8M6 21.2v-3.8h3.8"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/>',
  chain: '<circle cx="5" cy="12" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="19" cy="12" r="2.4"/><path d="M7.4 12h2.2M14.4 12h2.2"/>',
  hex: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  gauge: '<path d="M3.5 16a8.5 8.5 0 1 1 17 0"/><path d="M12 16l4.5-5"/>',
  baby: '<circle cx="12" cy="8" r="4"/><path d="M5 21c.8-4 3.6-6.5 7-6.5s6.2 2.5 7 6.5"/>',
  person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21c.6-4.6 3.4-7.5 7-7.5s6.4 2.9 7 7.5"/>',
  stomach: '<path d="M9 3v4c0 2-3 3-3 7a6 6 0 0 0 6 6c4.5 0 7-3 7-6.5 0-2.6-1.8-4-4-4-1.7 0-2.6 1.2-4 1.2-.9 0-1.5-.7-1.5-1.7V3"/>',
  fish: '<path d="M3 12c3-4.5 8.5-6 13-3l4.5-3v12L16 15c-4.5 3-10 1.5-13-3z"/><circle cx="8" cy="11" r=".8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
};
export function icon(name, size) {
  const sz = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${sz} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Linear-ish number tween on an element's text. */
export function countTo(el, to, { from = 0, duration = 1.2, decimals = 0, suffix = '' } = {}) {
  const g = window.gsap;
  const o = { v: from };
  if (!g) { el.textContent = to.toFixed(decimals) + suffix; return; }
  return g.to(o, { v: to, duration, ease: 'power3.out', onUpdate: () => { el.textContent = o.v.toFixed(decimals) + suffix; } });
}
