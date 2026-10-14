// Hover detail cards. Any element with data-tip (or registered via tip(el, spec))
// shows a glass card next to it. Spec: { kicker, title, body, list:[], chips:[], src }.
// data-tip accepts "Title|Body" or JSON.

import { h } from './util.js';

const registry = new WeakMap();
let card, current, showTimer, hideTimer;

function ensureCard() {
  if (card) return card;
  card = h('div.tip', { role: 'tooltip' });
  document.body.append(card);
  return card;
}

function parseSpec(el) {
  if (registry.has(el)) return registry.get(el);
  const raw = el.getAttribute('data-tip');
  if (!raw) return null;
  if (raw.trim().startsWith('{')) { try { return JSON.parse(raw); } catch { /* fallthrough */ } }
  const [title, ...rest] = raw.split('|');
  return { title, body: rest.join('|') };
}

function render(spec) {
  const c = ensureCard();
  c.innerHTML = '';
  if (spec.kicker) c.append(h('div.tip-kicker', { html: spec.kicker }));
  if (spec.title) c.append(h('div.tip-title', { html: spec.title }));
  if (spec.body) c.append(h('div.tip-body', { html: spec.body }));
  if (spec.list?.length) c.append(h('ul', {}, spec.list.map((li) => h('li', { html: li }))));
  if (spec.chips?.length) c.append(h('div.tip-row', {}, spec.chips.map((ch) => h('span', { class: `chip ${ch.cls || ''}`, html: ch.t || ch }))));
  if (spec.src) c.append(h('div.tip-src', { html: spec.src }));
}

function place(el) {
  const c = ensureCard();
  const r = el.getBoundingClientRect();
  const cw = c.offsetWidth, ch = c.offsetHeight;
  const vw = innerWidth, vh = innerHeight, gap = 18;
  let x, y, origin;
  // Prefer right, then left, then below, then above.
  if (r.right + gap + cw < vw - 12) { x = r.right + gap; y = r.top + r.height / 2 - ch / 2; origin = 'left center'; }
  else if (r.left - gap - cw > 12) { x = r.left - gap - cw; y = r.top + r.height / 2 - ch / 2; origin = 'right center'; }
  else if (r.bottom + gap + ch < vh - 12) { x = r.left + r.width / 2 - cw / 2; y = r.bottom + gap; origin = 'top center'; }
  else { x = r.left + r.width / 2 - cw / 2; y = r.top - gap - ch; origin = 'bottom center'; }
  x = Math.max(12, Math.min(vw - cw - 12, x));
  y = Math.max(12, Math.min(vh - ch - 12, y));
  c.style.setProperty('--tip-origin', origin);
  c.style.transform = '';
  c.style.left = `${x}px`;
  c.style.top = `${y}px`;
}

function show(el) {
  const spec = parseSpec(el);
  if (!spec) return;
  clearTimeout(hideTimer);
  current = el;
  render(spec);
  place(el);
  requestAnimationFrame(() => card.classList.add('on'));
  el.dispatchEvent(new CustomEvent('tipshow', { bubbles: true }));
}

function hide() {
  clearTimeout(showTimer);
  if (!card) return;
  card.classList.remove('on');
  if (current) current.dispatchEvent(new CustomEvent('tiphide', { bubbles: true }));
  current = null;
}

/** Attach a rich tip to an element programmatically. */
export function tip(el, spec) {
  registry.set(el, spec);
  el.classList.add('has-tip');
  if (!el.hasAttribute('data-tip')) el.setAttribute('data-tip', '');
  return el;
}

export function hideTip() { hide(); }

export function initTips() {
  ensureCard();
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || el === current) return;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    showTimer = setTimeout(() => show(el), current ? 0 : 110);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    const to = e.relatedTarget?.closest?.('[data-tip]');
    if (to === el) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, 90);
  });
  // Touch: tap toggles
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (el && el !== current) show(el); else hide();
  });
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', hide);
}
