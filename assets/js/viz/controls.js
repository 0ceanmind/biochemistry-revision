// Large, presentation-friendly controls (sliders, segmented buttons, toggles).
import { h } from '../core/util.js';

/** slider({label, min, max, step, value, fmt, onInput, width}) → { el, input, set(v), get() } */
export function slider(o) {
  const input = h('input.range', { type: 'range', min: o.min, max: o.max, step: o.step ?? 'any', value: o.value });
  if (o.width) input.style.width = `${o.width}px`;
  const out = h('output');
  const el = h('div.ctrl', {}, [h('label', { html: o.label }), input, out]);
  const paint = () => {
    const v = +input.value;
    input.style.setProperty('--p', `${((v - o.min) / (o.max - o.min)) * 100}%`);
    out.innerHTML = o.fmt ? o.fmt(v) : v;
  };
  input.addEventListener('input', () => { paint(); o.onInput?.(+input.value); });
  // keep arrow keys for the slider, not the deck
  input.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); });
  paint();
  return {
    el, input,
    set(v, fire = true) { input.value = v; paint(); if (fire) o.onInput?.(+input.value); },
    get: () => +input.value,
  };
}

/** seg({options:[{v,t}], value, onChange}) → { el, set(v), get() } */
export function seg(o) {
  let cur = o.value ?? o.options[0].v;
  const btns = o.options.map((op) => h('button', { html: op.t, onclick: () => api.set(op.v) }));
  const el = h('div.seg', {}, btns);
  const api = {
    el,
    set(v, fire = true) {
      cur = v;
      btns.forEach((b, i) => b.classList.toggle('on', o.options[i].v === v));
      if (fire) o.onChange?.(v);
    },
    get: () => cur,
  };
  api.set(cur, false);
  return api;
}

/** toggle({label, on, onChange, danger}) → { el, set(on), get() } */
export function toggle(o) {
  let on = !!o.on;
  const el = h('div', { class: `toggle${o.danger ? ' danger' : ''}`, role: 'switch', tabindex: 0 }, [h('span.sw'), h('span', { html: o.label })]);
  const api = {
    el,
    set(v, fire = true) { on = !!v; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); if (fire) o.onChange?.(on); },
    get: () => on,
  };
  el.addEventListener('click', () => api.set(!on));
  el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); api.set(!on); } });
  api.set(on, false);
  return api;
}

/** Glass control bar positioned inside a visual. pos: {left, right, top, bottom} in stage px. */
export function ctrlBar(host, items, pos = { left: 0, bottom: 0 }) {
  const bar = h('div.ctrls', {}, items.map((i) => i.el || i));
  Object.entries(pos).forEach(([k, v]) => { bar.style[k] = typeof v === 'number' ? `${v}px` : v; });
  host.append(bar);
  return bar;
}
