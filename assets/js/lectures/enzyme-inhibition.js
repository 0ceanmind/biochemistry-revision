// Enzyme Inhibition & Regulation (L.8–L.9) — interactive revision deck.
import { h, s, setRich, countTo, icon } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show, drawPath } from '../viz/diagram.js';
import { chart } from '../viz/chart.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { moleculeScene, cellScene } from '../viz/scenes.js';

const gsap = window.gsap;
const SUB = 'var(--elec)'; // substrate
const COMP = 'var(--a2)'; // competitive inhibitor
const NONC = 'var(--prot)'; // noncompetitive inhibitor
const SUIC = 'var(--fadh)'; // suicide inhibitor
const PROD = 'var(--act)'; // product
const SRC = (p) => `Lecture slide ${p}`;
const LIPP = 'Lippincott Ch 5';
const TYPE = {
  comp: { t: 'Competitive', c: COMP },
  nonc: { t: 'Noncompetitive', c: NONC },
  suic: { t: 'Suicide', c: SUIC },
};

/* ------------------------------------------------------------------ */
/* Shared drawing kit: a 2D enzyme with an active-site pocket and an   */
/* allosteric notch, plus molecule tokens. Enzyme space ≈ 380 × 280.   */
/* ------------------------------------------------------------------ */
// pocket = [leftX, c1x, c1y, c2x, c2y, rightX] of the cubic that forms the active site
const POCKET = {
  normal: [-60, -60, -50, 60, -50, 60],
  distorted: [-36, -14, -106, 46, -88, 64],
  wide: [-86, -66, -100, 66, -100, 86],
};
const mixArr = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function enzymeD(p, notch) {
  const [pl, c1x, c1y, c2x, c2y, pr] = p;
  return `M-186,-24 C-200,-100 -150,-140 -92,-132 L${pl},-130 C${c1x},${c1y} ${c2x},${c2y} ${pr},-130 L92,-133 C150,-142 206,-104 198,-30 C192,20 216,72 186,116 C168,146 146,154 126,150 ${notch ? 'L122,150 C122,104 58,104 58,150 ' : ''}L-60,156 C-100,162 -132,160 -158,146 C-198,124 -206,78 -194,38 C-186,12 -182,0 -186,-24 Z`;
}
let gradN = 0;
function enzGrad(D, col = 'var(--a1)') {
  const id = `ei-g${++gradN}`;
  D.defs.append(s('radialGradient', { id, cx: '36%', cy: '28%', r: '90%' }, [
    s('stop', { offset: '0%', style: `stop-color:color-mix(in oklab, ${col} 58%, var(--bg))` }),
    s('stop', { offset: '100%', style: `stop-color:color-mix(in oklab, ${col} 22%, var(--bg))` }),
  ]));
  return `url(#${id})`;
}
function makeEnzyme(parent, D, { notch = true, pocket = POCKET.normal, col = 'var(--a1)' } = {}) {
  const g = s('g', { style: 'transition:filter .6s var(--ease)' });
  let cur = pocket.slice();
  const body = s('path', { d: enzymeD(cur, notch), style: `fill:${enzGrad(D, col)};stroke:color-mix(in oklab, ${col} 70%, var(--fg));stroke-width:3;stroke-linejoin:round` });
  g.append(body);
  parent.append(g);
  const st = { t: 0 };
  return {
    g, body,
    set(p) { gsap.killTweensOf(st); cur = p.slice(); body.setAttribute('d', enzymeD(cur, notch)); },
    to(p, duration = 0.8) {
      const from = cur.slice();
      gsap.killTweensOf(st);
      st.t = 0;
      gsap.to(st, { t: 1, duration, ease: 'power2.inOut', onUpdate: () => { cur = mixArr(from, p, st.t); body.setAttribute('d', enzymeD(cur, notch)); } });
    },
    destroy() { gsap.killTweensOf(st); },
  };
}
/** Molecule token centred on (0,0). kind: circle | look (substrate look-alike) | tri (3 lobes) | triangle */
function token(parent, { r = 46, color, label = '', kind = 'circle', textCol = 'var(--bg)' }) {
  const g = s('g', { style: 'opacity:0' });
  const shapes = [];
  if (kind === 'tri') {
    [[0, -0.34], [-0.46, 0.3], [0.46, 0.3]].forEach(([x, y]) => shapes.push(s('circle', { cx: x * r, cy: y * r, r: r * 0.54, style: `fill:${color}` })));
    shapes.push(s('circle', { r: r * 0.44, style: `fill:${color}` }));
  } else if (kind === 'look') {
    shapes.push(s('circle', { r, style: `fill:${color}` }));
    shapes.push(s('rect', { x: r * 0.42, y: -r * 1.02, width: r * 0.62, height: r * 0.62, rx: r * 0.16, style: `fill:${color}` }));
  } else if (kind === 'triangle') {
    shapes.push(s('path', { d: `M0,${-r} L${r * 0.95},${r * 0.68} L${-r * 0.95},${r * 0.68} Z`, style: `fill:${color};stroke:${color};stroke-width:${r * 0.3};stroke-linejoin:round` }));
  } else shapes.push(s('circle', { r, style: `fill:${color}` }));
  g.append(...shapes);
  if (kind !== 'triangle') g.append(s('circle', { cx: -r * 0.32, cy: -r * 0.34, r: r * 0.26, style: 'fill:#fff;opacity:.28;pointer-events:none' }));
  if (label) {
    const t = s('text', { y: kind === 'triangle' ? r * 0.36 : r * 0.3, 'text-anchor': 'middle', style: `font:780 ${Math.round(r * (kind === 'triangle' ? 0.9 : 0.82))}px var(--font);fill:${textCol};pointer-events:none` });
    t.textContent = label;
    g.append(t);
  }
  g._shapes = shapes;
  parent.append(g);
  return g;
}
function recolor(tok, col) { tok._shapes.forEach((sh) => { sh.style.fill = col; if (sh.style.stroke) sh.style.stroke = col; }); }
/** Red "✕" disc. */
function xMark(parent, x, y, r = 22) {
  const g = s('g', { transform: `translate(${x} ${y})`, style: 'opacity:0' });
  g.append(s('circle', { r, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:4' }));
  const k = r * 0.45;
  g.append(s('path', { d: `M${-k},${-k} L${k},${k} M${k},${-k} L${-k},${k}`, style: 'stroke:var(--inh);stroke-width:5;stroke-linecap:round' }));
  parent.append(g);
  return g;
}
/** Padlock glyph. */
function padlock(parent, x, y, sc = 1) {
  const g = s('g', { transform: `translate(${x} ${y}) scale(${sc})`, style: 'opacity:0' });
  g.append(s('path', { d: 'M-18,-6 L-18,-22 A18,18 0 0 1 18,-22 L18,-6', style: 'fill:none;stroke:var(--fg-2);stroke-width:7;stroke-linecap:round' }));
  g.append(s('rect', { x: -28, y: -8, width: 56, height: 46, rx: 9, style: 'fill:var(--fg-2)' }));
  g.append(s('circle', { cx: 0, cy: 12, r: 6, style: 'fill:var(--bg)' }));
  g.append(s('rect', { x: -2.5, y: 14, width: 5, height: 12, rx: 2, style: 'fill:var(--bg)' }));
  parent.append(g);
  return g;
}
/** Vertical activity meter (SVG, stage px). */
function vMeter(parent, { x, y, w = 48, h, label }) {
  const g = s('g');
  g.append(s('rect', { x, y, width: w, height: h, rx: w / 2, style: 'fill:var(--surface-2);stroke:var(--line);stroke-width:2' }));
  const fill = s('rect', { x: x + 7, y: y + h - 7, width: w - 14, height: 0, rx: (w - 14) / 2, style: 'fill:var(--act);transition:fill .5s' });
  g.append(fill);
  const t = s('text', { x: x + w / 2, y: y - 24, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:650' });
  t.textContent = label;
  const v = s('text', { x: x + w / 2, y: y + h + 42, 'text-anchor': 'middle', class: 'v-label sm', style: 'font-weight:700' });
  g.append(t, v);
  parent.append(g);
  return {
    g,
    set(val, txt, col = 'var(--act)') {
      const H = (h - 14) * Math.max(0.03, val);
      gsap.to(fill, { attr: { height: H, y: y + h - 7 - H }, opacity: val < 0.02 ? 0 : 1, duration: 0.9, ease: 'power3.out' });
      fill.style.fill = col;
      v.textContent = txt;
      v.style.fill = col;
    },
  };
}
function leader(D, x1, y1, x2, y2, text, o = {}) {
  const g = s('g', { style: o.hidden ? 'opacity:0' : '' });
  g.append(s('path', { d: `M${x1},${y1} L${x2},${y2}`, style: 'stroke:var(--fg-3);stroke-width:2;fill:none' }));
  g.append(s('circle', { cx: x1, cy: y1, r: 5, style: 'fill:var(--fg-2)' }));
  const t = s('text', { x: x2 + (o.anchor === 'end' ? -10 : 10), y: y2 + 9, 'text-anchor': o.anchor || 'start', class: 'v-label sm', style: `fill:${o.color || 'var(--fg-2)'};font-weight:620` });
  setRich(t, text);
  g.append(t);
  if (o.tip) g.setAttribute('data-tip', JSON.stringify(o.tip));
  D.layers.labels.append(g);
  return g;
}
/** Animate tokens floating gently. Returns kill(). */
function floatAll(list) {
  const tw = list.map((t, i) => gsap.to(t, { y: '+=12', duration: 1.5 + (i % 5) * 0.21, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: (i % 3) * 0.3 }));
  return () => tw.forEach((x) => x.kill());
}

/* ------------------------------------------------------------------ */
/* 3 · Opening case                                                     */
/* ------------------------------------------------------------------ */
function caseIntroViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '590px 1fr 520px';
  el.style.gap = '44px';
  el.style.alignItems = 'center';
  const follow = h('p', { style: 'opacity:0', html: 'Follow-up: <b style="color:var(--act)">135/85 mmHg</b>.' });
  const card = h('div.case', {}, [
    h('div.tag', { html: '● Clinical case' }),
    h('p', { html: 'A <b>52-year-old man</b> has repeated BP readings of <b style="color:var(--inh)">160/98 mmHg</b>.' }),
    h('p', { html: 'Diagnosed with <b>hypertension</b>; prescribed <b>enalapril</b>, an ACE inhibitor.' }),
    follow,
  ]);
  // BP monitor
  const num = h('div', { style: 'font:760 118px var(--font);letter-spacing:-.045em;line-height:1;font-variant-numeric:tabular-nums;color:var(--inh);transition:color .8s' });
  const drug = h('div', { style: 'display:inline-flex;align-items:center;gap:12px;font-size:26px;font-weight:650;color:var(--ink);padding:10px 20px;border-radius:999px;border:1px solid color-mix(in oklab, var(--a1) 50%, transparent);background:color-mix(in oklab, var(--a1) 14%, transparent);opacity:0;align-self:flex-start', html: `${icon('pill', 28)} Enalapril · ACE inhibitor` });
  const svg = s('svg', { viewBox: '0 0 420 250', style: 'width:100%;height:250px;overflow:visible;margin-top:auto' });
  const Y = (p) => 240 - ((p - 70) / 100) * 228;
  const lineSys = s('line', { x1: 0, x2: 420, style: 'stroke:var(--fg-3);stroke-width:2;stroke-dasharray:6 10' });
  const lineDia = s('line', { x1: 0, x2: 420, style: 'stroke:var(--fg-3);stroke-width:2;stroke-dasharray:6 10' });
  const wave = s('path', { style: 'fill:none;stroke:var(--inh);stroke-width:5;stroke-linejoin:round;stroke-linecap:round;transition:stroke .8s' });
  svg.append(lineSys, lineDia, wave);
  const monitor = h('div', { style: 'height:620px;border-radius:40px;background:var(--surface);border:1px solid var(--line);padding:42px 44px;display:flex;flex-direction:column;gap:14px;overflow:hidden;position:relative' }, [
    h('div', { style: 'font-size:24px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--fg-2)', text: 'Blood pressure' }),
    num,
    h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:-4px', text: 'mmHg' }),
    drug,
    svg,
  ]);
  // questions
  const qs = ['What type of inhibition does enalapril cause?', 'How are apparent K<sub>m</sub> and V<sub>max</sub> affected?', 'How does ACE inhibition lower BP?'];
  const qList = h('div', { style: 'display:grid;gap:18px' }, [
    h('div', { style: 'font-size:24px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--ink);margin-bottom:6px', text: 'Solve as we learn' }),
    ...qs.map((q, i) => h('div', { style: 'display:flex;gap:20px;align-items:flex-start;padding:22px 26px;border-radius:26px;background:var(--surface);border:1px solid var(--line)' }, [
      h('div', { style: 'flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font:700 24px var(--font);background:var(--grad);color:#fff', text: i + 1 }),
      h('div', { style: 'font-size:30px;line-height:1.3;font-weight:560', html: q }),
    ])),
  ]);
  el.append(card, monitor, qList);
  const bp = { sys: 160, dia: 98 };
  const paint = () => { num.textContent = `${Math.round(bp.sys)}/${Math.round(bp.dia)}`; };
  paint();
  const f = (ph) => {
    if (ph < 0.12) return Math.sin((ph / 0.12) * Math.PI / 2);
    if (ph < 0.3) return 1 - 0.42 * ((ph - 0.12) / 0.18);
    if (ph < 0.34) return 0.58 - 0.08 * ((ph - 0.3) / 0.04);
    if (ph < 0.4) return 0.5 + 0.08 * Math.sin(((ph - 0.34) / 0.06) * Math.PI);
    return 0.5 * Math.exp(-((ph - 0.4) / 0.6) * 3.2);
  };
  let raf = 0, t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    let d = '';
    for (let x = 0; x <= 420; x += 3) {
      const ph = (((x / 150) - t * 1.1) % 1 + 1) % 1;
      const p = bp.dia + (bp.sys - bp.dia) * f(ph);
      d += `${x ? 'L' : 'M'}${x},${Y(p).toFixed(1)}`;
    }
    wave.setAttribute('d', d);
    lineSys.setAttribute('y1', Y(bp.sys)); lineSys.setAttribute('y2', Y(bp.sys));
    lineDia.setAttribute('y1', Y(bp.dia)); lineDia.setAttribute('y2', Y(bp.dia));
    raf = requestAnimationFrame(draw);
  };
  draw();
  cancelAnimationFrame(raf);
  return {
    enter() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); },
    leave() { cancelAnimationFrame(raf); },
    destroy() { cancelAnimationFrame(raf); gsap.killTweensOf(bp); },
    step(n) {
      const on = n >= 1;
      gsap.to(bp, { sys: on ? 135 : 160, dia: on ? 85 : 98, duration: on ? 2.2 : 0.4, ease: 'power2.inOut', onUpdate: paint });
      gsap.to([drug, follow], { opacity: on ? 1 : 0, duration: 0.6 });
      num.style.color = on ? 'var(--fg)' : 'var(--inh)';
      wave.style.stroke = on ? 'var(--ink)' : 'var(--inh)';
    },
  };
}

/* ------------------------------------------------------------------ */
/* 4 · Three types — mini cartoon for each card                        */
/* ------------------------------------------------------------------ */
function typeMini(el, kind) {
  const D = diagram(el, 480, 250);
  const W = s('g', { transform: 'translate(250 146) scale(0.6)' });
  D.layers.nodes.append(W);
  makeEnzyme(W, D, { notch: kind === 'nonc' });
  const kill = [];
  if (kind === 'comp') {
    const I = token(W, { r: 46, color: COMP, label: 'I', kind: 'look' });
    gsap.set(I, { x: 0, y: -118, opacity: 1 });
    const S = token(W, { r: 40, color: SUB, label: 'S' });
    gsap.set(S, { x: -300, y: -150, opacity: 1 });
    kill.push(gsap.to(S, { x: -250, y: -175, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    const t = s('text', { x: -310, y: -60, 'text-anchor': 'middle', style: 'font:700 40px var(--font);fill:var(--fg-3)' });
    t.textContent = '⇄';
    W.append(t);
  } else if (kind === 'nonc') {
    const S = token(W, { r: 46, color: SUB, label: 'S' });
    gsap.set(S, { x: 0, y: -118, opacity: 1 });
    const I = token(W, { r: 30, color: NONC, label: 'I' });
    gsap.set(I, { x: 90, y: 136, opacity: 1 });
    kill.push(gsap.to(I, { scale: 1.12, transformOrigin: '50% 50%', duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  } else {
    W.append(s('path', { d: 'M22,-110 L58,-88', style: 'stroke:var(--inh);stroke-width:14;stroke-linecap:round' }));
    const I = token(W, { r: 52, color: 'var(--inh)', label: 'I*', kind: 'tri' });
    gsap.set(I, { x: 0, y: -132, opacity: 1 });
    const L = padlock(D.layers.labels, 420, 180, 1);
    L.style.opacity = 1;
    kill.push(gsap.to(L, { y: '-=8', duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  }
  return { destroy: () => { kill.forEach((k) => k.kill()); D.destroy(); } };
}

/* ------------------------------------------------------------------ */
/* 5 & 6 · Binding animations (competitive / noncompetitive)            */
/* ------------------------------------------------------------------ */
function bindingViz(el, mode) {
  const nonc = mode === 'nonc';
  const D = diagram(el, 960, 860);
  const EX = 410, EY = 560, SC = 1.25;
  const W = s('g', { transform: `translate(${EX} ${EY}) scale(${SC})` });
  D.layers.nodes.append(W);
  const enz = makeEnzyme(W, D, { notch: nonc });
  const eLbl = s('text', { x: -10, y: 60, 'text-anchor': 'middle', style: 'font:650 26px var(--font);fill:color-mix(in oklab, var(--a1) 35%, var(--fg));letter-spacing:.06em' });
  eLbl.textContent = 'ENZYME';
  W.append(eLbl);
  const spark = s('circle', { cx: 0, cy: -84, r: 30, style: 'fill:var(--atp);opacity:0', filter: `url(#${D.glowId})` });
  W.append(spark);
  // pool slots (enzyme space)
  const slots = [];
  [-330, -205, -80, 45, 170, 295].forEach((x, i) => slots.push([x + (i % 2 ? 14 : -10), -340 + (i % 3) * 10]));
  [-270, -145, -20, 105, 230, 330].forEach((x, i) => slots.push([x + (i % 2 ? -8 : 10), -252 - (i % 2) * 12]));
  const iSlots = [1, 8, 4];
  const sSlots = slots.map((_, i) => i).filter((i) => !iSlots.includes(i));
  const poolS = sSlots.map((i) => { const t = token(W, { r: 30, color: SUB, label: 'S' }); gsap.set(t, { x: slots[i][0], y: slots[i][1] }); return t; });
  const poolI = iSlots.slice(0, 2).map((i) => { const t = nonc ? token(W, { r: 22, color: NONC, label: 'I' }) : token(W, { r: 30, color: COMP, label: 'I', kind: 'look' }); gsap.set(t, { x: slots[i][0], y: slots[i][1] }); return t; });
  const killFloat = floatAll([...poolS, ...poolI]);
  // actors
  const S = token(W, { r: 46, color: SUB, label: 'S' });
  const I = nonc ? token(W, { r: 30, color: NONC, label: 'I' }) : token(W, { r: 46, color: COMP, label: 'I', kind: 'look' });
  const P1 = token(W, { r: 26, color: PROD, label: 'P' });
  const P2 = token(W, { r: 26, color: PROD, label: 'P' });
  const X = xMark(W, 0, nonc ? -30 : -186, 24);
  const IB = nonc ? { x: 90, y: 136 } : { x: 0, y: -118 };
  gsap.set(I, { x: slots[iSlots[2]][0], y: slots[iSlots[2]][1], transformOrigin: '50% 50%' });
  // labels & equations
  leader(D, EX + 62 * SC, EY - 128 * SC, 570, 352, 'Active site');
  if (nonc) leader(D, EX + 112 * SC, EY + 128 * SC, 600, 792, 'Allosteric site', { color: NONC });
  const eq1 = D.text(0, 40, 'E + S ⇌ ES → E + P', { style: 'font-size:34px;font-weight:650;fill:var(--fg)' });
  const eq2 = D.text(960, 40, nonc ? 'E + S + I ⇌ ESI' : 'E + I ⇌ EI', { anchor: 'end', style: `font-size:34px;font-weight:650;fill:${nonc ? NONC : COMP}` });
  const note = D.text(0, 84, '', { style: 'font-size:26px;font-weight:520;fill:var(--fg-2)' });
  const meter = vMeter(D.layers.labels, { x: 872, y: 330, h: 400, label: 'Rate' });

  let tl = null, live = false, state = -1, inh = false, flood = false, k = 0;
  const from = () => slots[sSlots[3 + ((k++) % 6)]];
  const catalysis = (L, slow = 1) => {
    const f = from();
    L.set(S, { x: f[0], y: f[1], scale: 0.65, opacity: 0, transformOrigin: '50% 50%' })
      .to(S, { opacity: 1, duration: 0.25 })
      .to(S, { x: 0, y: -118, scale: 1, duration: 0.85 * slow, ease: 'power2.inOut' })
      .to(spark, { opacity: 0.95, duration: 0.18 }, `+=${0.12 * slow}`)
      .set(S, { opacity: 0 })
      .set(P1, { x: -20, y: -118, opacity: 1, scale: 1 })
      .set(P2, { x: 20, y: -118, opacity: 1, scale: 1 })
      .to(spark, { opacity: 0, duration: 0.35 })
      .to(P1, { x: 210, y: -290, opacity: 0, duration: 1.0, ease: 'power1.out' }, '<')
      .to(P2, { x: 300, y: -220, opacity: 0, duration: 1.0, ease: 'power1.out' }, '<0.08');
  };
  const bounce = (L) => {
    const f = from();
    L.set(S, { x: f[0], y: f[1], scale: 0.65, opacity: 0, transformOrigin: '50% 50%' })
      .to(S, { opacity: 1, duration: 0.25 })
      .to(S, { x: f[0] * 0.12, y: -226, scale: 0.95, duration: 0.75, ease: 'power2.in' })
      .to(X, { opacity: 1, duration: 0.12 })
      .to(S, { x: f[0] * 0.6 + 70, y: -330, scale: 0.7, duration: 0.7, ease: 'power2.out' })
      .to(X, { opacity: 0, duration: 0.3 }, '<')
      .to(S, { opacity: 0, duration: 0.25 });
  };
  const stall = (L) => {
    const f = from();
    L.set(S, { x: f[0], y: f[1], scale: 0.65, opacity: 0, transformOrigin: '50% 50%' })
      .to(S, { opacity: 1, duration: 0.25 })
      .to(S, { x: 0, y: -118, scale: 1, duration: 0.85, ease: 'power2.inOut' })
      .to(X, { opacity: 1, duration: 0.15 }, '+=0.45')
      .to(X, { opacity: 0, duration: 0.3 }, '+=0.5')
      .to(S, { x: f[0] * 0.5, y: -320, scale: 0.7, duration: 0.8, ease: 'power2.inOut' })
      .to(S, { opacity: 0, duration: 0.25 });
  };
  const iHome = () => slots[iSlots[2]];
  function build() {
    tl?.kill();
    gsap.killTweensOf([S, I, P1, P2, spark, X]);
    gsap.set([P1, P2, X, spark], { opacity: 0 });
    tl = gsap.timeline();
    const L = gsap.timeline({ repeat: -1 });
    if (state === 0) {
      tl.to(I, { x: iHome()[0], y: iHome()[1], opacity: 0, scale: 0.7, duration: 0.6, ease: 'power2.inOut' }, 0);
      if (nonc) enz.to(POCKET.normal, 0.6);
      catalysis(L); catalysis(L);
    } else if (!nonc && state === 1) {
      tl.set(I, { opacity: 1 }).to(I, { x: IB.x, y: IB.y, scale: 1, duration: 0.9, ease: 'power2.inOut' });
      bounce(L); bounce(L);
    } else if (!nonc && state === 2) {
      tl.to(I, { x: 150, y: -300, scale: 0.7, opacity: 0, duration: 0.8, ease: 'power2.inOut' });
      catalysis(L, 0.8); catalysis(L, 0.8);
      L.set(I, { x: iHome()[0], y: iHome()[1], scale: 0.7, opacity: 0 })
        .to(I, { opacity: 1, duration: 0.2 })
        .to(I, { x: IB.x, y: IB.y, scale: 1, duration: 0.7, ease: 'power2.inOut' })
        .to(I, { x: 150, y: -300, scale: 0.7, duration: 0.7, ease: 'power2.inOut' }, '+=0.5')
        .to(I, { opacity: 0, duration: 0.2 });
    } else if (nonc) {
      tl.set(I, { opacity: 1 }).to(I, { x: IB.x, y: IB.y, scale: 1, duration: 0.9, ease: 'power2.inOut' });
      enz.to(mixArr(POCKET.normal, POCKET.distorted, 0.16), 0.9);
      stall(L); stall(L);
    }
    tl.add(L);
    if (!live) tl.pause();
  }
  const NOTES = nonc
    ? ['Normal catalysis', 'Substrate still binds · catalysis blocked', 'More substrate cannot rescue it']
    : ['Normal catalysis', 'Inhibitor holds the active site', 'Excess substrate wins the site back'];
  const RATE = nonc ? [[1, 'High'], [0.34, 'Low'], [0.36, 'Still low']] : [[1, 'High'], [0.12, 'Low'], [0.92, 'High']];
  function apply() {
    const st = inh ? (flood ? 2 : 1) : 0;
    poolS.forEach((t, i) => gsap.to(t, { opacity: i < 3 || flood ? 0.9 : 0, duration: 0.5, delay: i * 0.03 }));
    poolI.forEach((t) => gsap.to(t, { opacity: inh ? 0.9 : 0, duration: 0.5 }));
    if (st === state) return;
    state = st;
    build();
    note.textContent = NOTES[st];
    meter.set(RATE[st][0], RATE[st][1], st && RATE[st][0] < 0.5 ? 'var(--inh)' : 'var(--act)');
    eq1.style.opacity = st === 1 ? 0.35 : 1;
    eq2.style.opacity = st === 0 ? 0.3 : 1;
  }
  const tI = toggle({ label: 'Inhibitor', danger: true, onChange: (v) => { inh = v; apply(); } });
  const tF = toggle({ label: 'Excess substrate', onChange: (v) => { flood = v; apply(); } });
  ctrlBar(el, [tI, tF], { left: 0, bottom: 0 });
  apply();
  return {
    enter() { live = true; tl?.resume(); },
    leave() { live = false; tl?.pause(); },
    step(n) { inh = n >= 1; flood = n >= 2; tI.set(inh, false); tF.set(flood, false); apply(); },
    destroy() { tl?.kill(); killFloat(); enz.destroy(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 7 · Kinetics lab (showpiece)                                         */
/* ------------------------------------------------------------------ */
function kineticsLab(el) {
  const VM = 100, KM = 2, KI = 1;
  let mode = 'none', I = 2;
  const CW = 828, CH = 590, TOP = 120;
  const mmHost = h('div', { style: `position:absolute;left:0;top:${TOP}px;width:${CW}px;height:${CH}px` });
  const lbHost = h('div', { style: `position:absolute;right:0;top:${TOP}px;width:${CW}px;height:${CH}px` });
  el.append(mmHost, lbHost);
  const panelTitle = (host, t) => host.append(h('div', { style: 'position:absolute;left:150px;top:-8px;font-size:22px;letter-spacing:.14em;text-transform:uppercase;font-weight:680;color:var(--fg-3)', text: t }));

  // Michaelis–Menten panel
  const A = chart(mmHost, { w: CW, h: CH, grid: false, pad: { l: 130, r: 70, t: 50, b: 110 }, x: { min: 0, max: 25, ticks: false }, y: { min: 0, max: 118, ticks: false } });
  { const t = s('text', { x: A.sx(0) + 14, y: A.sy(118) + 6, class: 'v-label', style: 'fill:var(--fg-2);font-size:28px' }); setRich(t, 'v_{0}'); A.top.append(t); }
  panelTitle(mmHost, 'Michaelis–Menten');
  const tS = s('text', { x: A.sx(25) + 12, y: A.sy(0) + 9, class: 'v-label v-muted' }); tS.textContent = '[S]'; A.top.append(tS);
  const mm = (V, K) => (x) => (V * x) / (K + x);
  const refA = A.line(mm(VM, KM), { color: SUB, width: 5, dash: '12 12', opacity: 0.85 });
  const mainA = A.line(mm(VM, KM), { color: SUB, width: 7 });
  const hV = A.hline(VM, { label: 'V_{max}', color: SUB, dash: '6 10', width: 2 });
  const hVapp = A.hline(VM, { label: 'V_{max}', color: NONC, dash: '6 10', width: 2 });
  const hHalf = A.hline(VM / 2, { label: '½', color: 'var(--fg-3)', dash: '4 10', width: 2 });
  const vK = A.vline(KM, { label: 'K_{m}', color: SUB, labelDy: 44, dash: '6 8', width: 2 });
  const vKapp = A.vline(KM, { label: 'K_{m} app', color: COMP, labelDy: 82, dash: '6 8', width: 2 });
  const pK = A.point(KM, VM / 2, { color: SUB, r: 11 });

  // Lineweaver–Burk panel
  const XMIN = -0.6, XMAX = 1.0, YMAX = 0.16;
  const B = chart(lbHost, { w: CW, h: CH, grid: false, pad: { l: 60, r: 80, t: 50, b: 110 }, x: { min: XMIN, max: XMAX, ticks: false }, y: { min: 0, max: YMAX, ticks: false } });
  panelTitle(lbHost, 'Lineweaver–Burk');
  const yAxis = B.svg.children[2].children[1];
  yAxis.setAttribute('x1', B.sx(0)); yAxis.setAttribute('x2', B.sx(0));
  const lbl = (x, y, str, a = {}) => { const t = s('text', { x, y, class: 'v-label sm', ...a }); setRich(t, str); B.top.append(t); return t; };
  lbl(B.sx(0) + 14, B.sy(YMAX) + 6, '1/v_{0}', { style: 'fill:var(--fg-2);font-size:28px' });
  lbl(B.sx(XMAX) + 12, B.sy(0) + 9, '1/[S]', { style: 'fill:var(--fg-2);font-size:28px' });
  const lb = (V, K) => [[-1 / K, 0], [XMAX, (K / V) * XMAX + 1 / V]];
  const refB = B.line(lb(VM, KM), { color: SUB, width: 5, dash: '12 12', opacity: 0.85 });
  const mainB = B.line(lb(VM, KM), { color: SUB, width: 7 });
  const yInt = B.point(0, 1 / VM, { color: SUB, r: 11 });
  const xInt = B.point(-1 / KM, 0, { color: SUB, r: 11 });
  const xIntRef = B.point(-1 / KM, 0, { color: SUB, r: 9 });
  const yIntRef = B.point(0, 1 / VM, { color: SUB, r: 9 });
  const tYi = lbl(0, 0, '1/V_{max}', { 'text-anchor': 'end', style: 'font-weight:650' });
  const tXi = lbl(0, 0, '−1/K_{m}', { 'text-anchor': 'middle', style: 'font-weight:650' });
  const ring = s('circle', { r: 30, style: 'fill:none;stroke-width:4;stroke-dasharray:6 7;opacity:0' });
  B.top.append(ring);
  const callout = lbl(B.sx(XMAX), B.pad.t + 30, '', { 'text-anchor': 'end', style: 'font-size:30px;font-weight:700' });

  // controls & readouts
  const sg = seg({ options: [{ v: 'none', t: 'None' }, { v: 'comp', t: 'Competitive' }, { v: 'nonc', t: 'Noncompetitive' }], value: 'none', onChange: (v) => { mode = v; update(); } });
  const sl = slider({ label: '[Inhibitor]', min: 0, max: 4, step: 0.1, value: I, width: 210, fmt: (v) => (v < 0.05 ? 'none' : v < 1.4 ? 'low' : v < 2.8 ? 'medium' : 'high'), onInput: (v) => { I = v; update(); } });
  ctrlBar(el, [sg, sl], { left: 0, top: 0 });
  const stat = (k) => {
    const v = h('div', { style: 'font:740 50px var(--font);letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums' });
    const d = h('div', { style: 'font-size:22px;font-weight:650;margin-top:6px;min-height:26px' });
    const box = h('div', { style: 'min-width:220px' }, [h('div', { style: 'font-size:24px;letter-spacing:.02em;font-weight:650;color:var(--fg-3);margin-bottom:8px', html: k }), v, d]);
    return { box, v, d };
  };
  const rK = stat('Apparent K<sub>m</sub>');
  const rV = stat('V<sub>max</sub>');
  el.append(h('div', { style: 'position:absolute;right:0;top:-40px;display:flex;gap:46px' }, [rK.box, rV.box]));
  tip(rK.box, { title: 'Apparent K<sub>m</sub>', body: 'Shown relative to the uninhibited enzyme (×1). Competitive inhibitors raise it; noncompetitive inhibitors leave it unchanged.', src: SRC('6, 9') });
  tip(rV.box, { title: 'V<sub>max</sub>', body: 'Shown relative to the uninhibited enzyme (×1). Noncompetitive inhibitors lower it; competitive inhibitors leave it unchanged.', src: SRC('6, 9') });

  function update() {
    const iEff = mode === 'none' ? 0 : I;
    const Kapp = mode === 'comp' ? KM * (1 + iEff / KI) : KM;
    const Vapp = mode === 'nonc' ? VM / (1 + iEff / KI) : VM;
    const col = mode === 'comp' ? COMP : mode === 'nonc' ? NONC : SUB;
    const inhOn = mode !== 'none';
    // MM
    mainA.update(mm(Vapp, Kapp)); mainA.el.setAttribute('stroke', col);
    refA.show(inhOn);
    hVapp.move(Vapp, 'V_{max} app'); hVapp.el.style.opacity = mode === 'nonc' && iEff > 0.05 ? 1 : 0;
    hV.el.style.opacity = mode === 'nonc' && iEff > 0.05 ? 0.55 : 1;
    hHalf.move(Vapp / 2, `½ V_{max}`);
    vK.move(KM, 'K_{m}', VM / 2 * (mode === 'nonc' ? Vapp / VM : 1));
    vKapp.move(Kapp, 'K_{m} app', Vapp / 2); vKapp.el.style.opacity = mode === 'comp' && iEff > 0.05 ? 1 : 0;
    pK.move(Kapp, Vapp / 2); pK.el.querySelector('circle').setAttribute('fill', col);
    // LB
    mainB.update(lb(Vapp, Kapp)); mainB.el.setAttribute('stroke', col);
    refB.show(inhOn);
    yInt.move(0, 1 / Vapp); xInt.move(-1 / Kapp, 0);
    yInt.el.querySelector('circle').setAttribute('fill', col); xInt.el.querySelector('circle').setAttribute('fill', col);
    xIntRef.el.style.opacity = inhOn ? 1 : 0; yIntRef.el.style.opacity = inhOn ? 1 : 0;
    tYi.setAttribute('x', B.sx(0) - 26); tYi.setAttribute('y', B.sy(1 / Vapp) - 34); tYi.style.fill = col;
    tXi.setAttribute('x', B.sx(-1 / Kapp)); tXi.setAttribute('y', B.sy(0) + 62); tXi.style.fill = col;
    setRich(tYi, mode === 'nonc' ? '1/V_{max} app' : '1/V_{max}');
    setRich(tXi, mode === 'comp' ? '−1/K_{m} app' : '−1/K_{m}');
    const meet = mode === 'comp' ? [B.sx(0), B.sy(1 / VM)] : mode === 'nonc' ? [B.sx(-1 / KM), B.sy(0)] : null;
    if (meet && iEff > 0.05) {
      ring.setAttribute('cx', meet[0]); ring.setAttribute('cy', meet[1]); ring.style.stroke = col; ring.style.opacity = 1;
      setRich(callout, mode === 'comp' ? 'Lines meet on the y-axis' : 'Lines meet on the x-axis'); callout.style.fill = col;
    } else { ring.style.opacity = 0; setRich(callout, mode === 'none' ? 'No inhibitor' : ''); callout.style.fill = 'var(--fg-2)'; }
    // readouts
    rK.v.textContent = `×${(Kapp / KM).toFixed(1)}`; rV.v.textContent = `×${(Vapp / VM).toFixed(2).replace(/0$/, '')}`;
    rK.v.style.color = Kapp > KM * 1.02 ? COMP : 'var(--fg)';
    rV.v.style.color = Vapp < VM * 0.98 ? NONC : 'var(--fg)';
    rK.d.innerHTML = Kapp > KM * 1.02 ? '↑ increased' : '<span style="color:var(--fg-3)">unchanged</span>';
    rV.d.innerHTML = Vapp < VM * 0.98 ? '↓ decreased' : '<span style="color:var(--fg-3)">unchanged</span>';
    rK.d.style.color = COMP; rV.d.style.color = NONC;
    sl.el.style.opacity = inhOn ? 1 : 0.4;
  }
  update();
  return {
    step(n) { mode = ['none', 'comp', 'nonc'][Math.min(2, n)]; sg.set(mode, false); if (n >= 1) { I = 2; sl.set(2, false); } update(); if (n >= 1) { mainA.draw(1); mainB.draw(1); } },
  };
}

/* ------------------------------------------------------------------ */
/* 8 · Suicide (mechanism-based) inhibition                             */
/* ------------------------------------------------------------------ */
function suicideViz(el) {
  const D = diagram(el, 960, 860);
  const EX = 420, EY = 560, SC = 1.25;
  const W = s('g', { transform: `translate(${EX} ${EY}) scale(${SC})` });
  D.layers.nodes.append(W);
  const enz = makeEnzyme(W, D, { notch: false });
  const spark = s('circle', { cx: 0, cy: -84, r: 30, style: 'fill:var(--atp);opacity:0', filter: `url(#${D.glowId})` });
  W.append(spark);
  const bond = s('path', { d: 'M22,-104 L58,-84', style: 'stroke:var(--inh);stroke-width:13;stroke-linecap:round;opacity:0' });
  W.append(bond);
  const halo = s('circle', { cx: 0, cy: -132, r: 74, style: 'fill:none;stroke:var(--inh);stroke-width:5;stroke-dasharray:8 10;opacity:0' });
  W.append(halo);
  const S = token(W, { r: 46, color: SUB, label: 'S' });
  const P1 = token(W, { r: 26, color: PROD, label: 'P' });
  const P2 = token(W, { r: 26, color: PROD, label: 'P' });
  const I = token(W, { r: 54, color: SUIC, label: 'I', kind: 'tri' });
  const ILbl = I.querySelector('text');
  const X = xMark(W, 0, -200, 24);
  gsap.set(I, { x: -250, y: -300, transformOrigin: '50% 50%' });
  const lock = padlock(D.layers.labels, EX + 158 * SC, EY + 88 * SC, 1.5);
  const meter = vMeter(D.layers.labels, { x: 872, y: 330, h: 400, label: 'Activity' });
  leader(D, EX + 62 * SC, EY - 128 * SC, 590, 352, 'Active site');
  // equation with highlightable parts
  const eq = s('text', { x: 480, y: 44, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:38px;font-weight:700' });
  const parts = ['E + I', ' ⇌ ', 'EI', ' → ', 'E–I*', ' (inactive)'].map((p) => { const t = s('tspan'); t.textContent = p; eq.append(t); return t; });
  D.layers.labels.append(eq);
  const cap = D.text(480, 96, '', { anchor: 'middle', style: 'font-size:28px;font-weight:600;fill:var(--fg-2)' });
  const CAP = ['Enzyme + suicide inhibitor', 'Recognized as a substrate', 'Reactive intermediate formed', 'Irreversibly inactivated · no product'];
  const LIT = [[0], [0, 1, 2], [3, 4], [5]];
  let tl = null, live = false, cur = -1;
  const floatI = gsap.to(I, { y: '+=14', duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut', paused: true });
  function apply(n) {
    if (n === cur) return;
    cur = n;
    tl?.kill();
    gsap.killTweensOf([S, P1, P2, spark, X, bond, halo, lock]);
    gsap.set([P1, P2, spark, X], { opacity: 0 });
    tl = gsap.timeline();
    const L = gsap.timeline({ repeat: -1 });
    parts.forEach((p, i) => { p.style.fill = LIT[n].includes(i) || (n >= 1 && i < 3) || (n >= 2 && i < 5) || n >= 3 ? (n >= 2 && i >= 3 ? 'var(--inh)' : 'var(--fg)') : 'var(--fg-3)'; });
    cap.textContent = CAP[n];
    cap.style.fill = n >= 3 ? 'var(--inh)' : 'var(--fg-2)';
    if (n === 0) {
      floatI.play();
      gsap.to(I, { x: -250, opacity: 1, scale: 0.8, duration: 0.6 });
      recolor(I, SUIC); ILbl.textContent = 'I';
      enz.g.style.filter = '';
      gsap.to(lock, { opacity: 0, duration: 0.3 });
      // the enzyme still works at this stage
      L.set(S, { x: 260, y: -330, scale: 0.65, opacity: 0, transformOrigin: '50% 50%' })
        .to(S, { opacity: 1, duration: 0.25 })
        .to(S, { x: 0, y: -118, scale: 1, duration: 0.9, ease: 'power2.inOut' })
        .to(spark, { opacity: 0.95, duration: 0.18 }, '+=0.1')
        .set(S, { opacity: 0 })
        .set(P1, { x: -20, y: -118, opacity: 1 }).set(P2, { x: 20, y: -118, opacity: 1 })
        .to(spark, { opacity: 0, duration: 0.35 })
        .to(P1, { x: 220, y: -290, opacity: 0, duration: 1 }, '<')
        .to(P2, { x: 310, y: -220, opacity: 0, duration: 1 }, '<0.08')
        .to({}, { duration: 0.4 });
      meter.set(1, 'Active');
    } else {
      floatI.pause();
      gsap.set(S, { opacity: 0 });
      tl.to(I, { x: 0, y: -132, scale: 1, opacity: 1, duration: 1, ease: 'power2.inOut' });
      if (n >= 2) { recolor(I, 'var(--inh)'); ILbl.textContent = 'I*'; tl.fromTo(spark, { opacity: 0 }, { opacity: 1, duration: 0.2, yoyo: true, repeat: 3 }, 0.6); }
      else { recolor(I, SUIC); ILbl.textContent = 'I'; }
      gsap.to(halo, { opacity: n === 2 ? 1 : 0, duration: 0.4 });
      if (n === 2) gsap.fromTo(halo, { attr: { r: 64 } }, { attr: { r: 82 }, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to(bond, { opacity: n >= 3 ? 1 : 0, duration: 0.5 });
      gsap.to(lock, { opacity: n >= 3 ? 1 : 0, duration: 0.5, delay: n >= 3 ? 0.4 : 0 });
      enz.g.style.filter = n >= 3 ? 'saturate(.2) brightness(.85)' : '';
      if (n >= 3) {
        L.set(S, { x: 270, y: -330, scale: 0.65, opacity: 0, transformOrigin: '50% 50%' })
          .to(S, { opacity: 1, duration: 0.25 })
          .to(S, { x: 60, y: -250, scale: 0.95, duration: 0.8, ease: 'power2.in' })
          .to(X, { opacity: 1, duration: 0.12 })
          .to(S, { x: 290, y: -330, scale: 0.7, duration: 0.7, ease: 'power2.out' })
          .to(X, { opacity: 0, duration: 0.3 }, '<')
          .to(S, { opacity: 0, duration: 0.25 })
          .to({}, { duration: 0.5 });
      }
      meter.set(n === 1 ? 0.45 : n === 2 ? 0.15 : 0.0, n === 1 ? 'Occupied' : n === 2 ? 'Falling' : 'Dead', n >= 2 ? 'var(--inh)' : 'var(--atp)');
    }
    tl.add(L);
    if (!live) tl.pause();
  }
  apply(0);
  return {
    enter() { live = true; tl?.resume(); },
    leave() { live = false; tl?.pause(); },
    step: (n) => apply(n),
    destroy() { tl?.kill(); floatI.kill(); gsap.killTweensOf(halo); enz.destroy(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 9 · Drug → target matching grid with real 3D molecules               */
/* ------------------------------------------------------------------ */
const FLUORIDE = { key: 'fluoride', name: 'fluoride ion', atoms: [['F', 0, 0, 0]], bonds: [] };
const DRUGS = [
  { g: 'comp', name: 'Statins', key: 'atorvastatin', eg: 'atorvastatin', target: 'HMG-CoA reductase', use: 'Lower cholesterol' },
  { g: 'comp', name: 'ACE inhibitors', key: 'enalapril', eg: 'enalapril', target: 'Angiotensin-converting enzyme', use: 'Treat hypertension · vasodilation, ↓ BP' },
  { g: 'comp', name: 'Methotrexate', key: 'methotrexate', pair: 'folic', pairName: 'Folic acid · look-alike', target: 'Dihydrofolate reductase', use: 'Anticancer drug' },
  { g: 'comp', name: 'Ethanol', key: 'ethanol', pair: 'methanol', pairName: 'Methanol · the poison', target: 'Alcohol dehydrogenase', use: 'Antidote for methanol poisoning' },
  { g: 'comp', name: 'Malonate', key: 'malonate', pair: 'succinate', pairName: 'Succinate · substrate', target: 'Succinate dehydrogenase', use: 'Classical experimental example · TCA cycle' },
  { g: 'nonc', name: 'Cyanide', key: 'cyanide', eg: 'shown as HCN', target: 'Cytochrome c oxidase', use: 'Blocks the ETC and ATP production' },
  { g: 'nonc', name: 'Fluoride', data: FLUORIDE, eg: 'F⁻ ion', target: 'Enolase', use: 'Inhibits glycolysis · preserves glucose in blood samples' },
  { g: 'suic', name: 'Allopurinol', key: 'allopurinol', pair: 'hypoxanthine', pairName: 'Hypoxanthine · substrate', target: 'Xanthine oxidase', use: '↓ Uric acid production · gout' },
  { g: 'suic', name: 'β-Lactam antibiotics', key: 'penicillin', eg: 'penicillin G', target: 'Bacterial transpeptidases', use: 'Block bacterial cell-wall synthesis' },
];
const TARGETS = ['Enolase', 'HMG-CoA reductase', 'Xanthine oxidase', 'Alcohol dehydrogenase', 'Cytochrome c oxidase', 'Angiotensin-converting enzyme', 'Bacterial transpeptidases', 'Succinate dehydrogenase', 'Dihydrofolate reductase'];

async function drugGridViz(el) {
  const EW = el.clientWidth || 1712, EH = el.clientHeight || 726;
  const left = h('div', { style: 'position:absolute;left:0;top:0;width:420px;display:flex;flex-direction:column;gap:4px;z-index:3' });
  const right = h('div', { style: 'position:absolute;right:0;top:0;width:430px;display:flex;flex-direction:column;gap:8px;z-index:3' });
  const host = h('div', { style: 'position:absolute;left:470px;right:480px;top:0;height:540px;z-index:1' });
  const capName = h('div', { style: 'font-size:38px;font-weight:700;letter-spacing:-.02em;display:flex;align-items:center;gap:18px;justify-content:center' });
  const capUse = h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:10px;text-align:center' });
  const cap = h('div', { style: 'position:absolute;left:470px;right:480px;top:560px;z-index:2' }, [capName, capUse]);
  const ov = s('svg', { viewBox: `0 0 ${EW} ${EH}`, style: 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible' });
  el.append(host, ov, cap, left, right);
  const rowStyle = 'display:flex;align-items:center;gap:14px;padding:7px 18px;border-radius:16px;font-size:28px;font-weight:600;letter-spacing:-.01em;cursor:pointer;border:1.5px solid transparent;transition:background .3s,border-color .3s,opacity .3s';
  const rows = [];
  let lastG = null;
  DRUGS.forEach((d, i) => {
    if (d.g !== lastG) { lastG = d.g; left.append(h('div', { style: `font-size:20px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${TYPE[d.g].c};margin:${i ? 10 : 0}px 0 2px 18px`, text: TYPE[d.g].t })); }
    const r = h('div', { style: rowStyle }, [h('span', { style: `width:14px;height:14px;border-radius:50%;background:${TYPE[d.g].c};flex:none` }), h('span', { html: d.name })]);
    r.addEventListener('click', () => select(i, true));
    left.append(r);
    rows.push(r);
  });
  right.append(h('div', { style: 'font-size:20px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--fg-3);margin:0 0 2px 18px', text: 'Target enzyme' }));
  const tRows = TARGETS.map((t) => {
    const r = h('div', { style: 'padding:11px 18px;border-radius:16px;font-size:25px;font-weight:560;color:var(--fg-2);background:var(--surface);border:1.5px solid var(--line);transition:all .35s var(--ease);cursor:pointer', html: t });
    r.addEventListener('click', () => guess(t, r));
    right.append(r);
    return r;
  });
  let quiz = false;
  const tq = toggle({ label: 'Quiz me', onChange: (v) => { quiz = v; select(cur, true); } });
  ctrlBar(el, [tq], { left: 0, bottom: 0 });
  tip(tq.el, { title: 'Quiz mode', body: 'Pick a drug, then click the enzyme you think it targets.' });

  // connectors
  const c1 = s('path', { style: 'fill:none;stroke-width:4;stroke-dasharray:6 12;stroke-linecap:round;opacity:0' });
  const c2 = s('path', { style: 'fill:none;stroke-width:4;stroke-dasharray:6 12;stroke-linecap:round;opacity:0' });
  ov.append(c1, c2);
  const march = gsap.to([c1, c2], { strokeDashoffset: -36, duration: 0.7, repeat: -1, ease: 'none', paused: true });

  // 3D
  const kit = createScene(host, { cam: [0, 0, 24], autoRotate: 0, fov: 30 });
  let current = null, token = 0, cur = 0;
  kit.onFrame((dt) => { if (current) current.mols.forEach((m) => { m.rotation.y += dt * 0.55; }); });
  const clearSet = (set) => {
    set.labels.forEach((l) => { l.element.remove(); l.removeFromParent(); });
    gsap.to(set.grp.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { kit.root.remove(set.grp); set.grp.traverse((c) => c.geometry?.dispose?.()); } });
  };
  async function showMol(d) {
    const my = ++token;
    const items = [{ key: d.key, data: d.data, label: d.pair ? `${d.name} · ${TYPE[d.g].t.toLowerCase()}` : null }];
    if (d.pair) items.push({ key: d.pair, label: d.pairName });
    const datas = await Promise.all(items.map((it) => (it.data ? Promise.resolve(it.data) : loadMol(it.key))));
    if (my !== token) return;
    const grp = new THREE.Group();
    const mols = datas.map((dd) => buildMolecule(dd, { hideH: dd.atoms.length > 30 ? 'nonpolar' : false, spacefill: dd === FLUORIDE }));
    const radii = mols.map((m) => new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere()).radius);
    if (mols.length === 2) { mols[0].position.x = -(radii[0] + 0.9); mols[1].position.x = radii[1] + 0.9; }
    mols.forEach((m) => grp.add(m));
    const labels = [];
    if (mols.length === 2) mols.forEach((m, i) => labels.push(kit.label(items[i].label, [m.position.x, -Math.max(...radii) - 1.1, 0], { cls: i ? 'sm' : 'sm acc', parent: grp })));
    if (current) clearSet(current);
    grp.scale.setScalar(0.001);
    kit.root.add(grp);
    current = { grp, mols, labels };
    gsap.to(grp.scale, { x: 1, y: 1, z: 1, duration: 0.75, delay: 0.2, ease: 'back.out(1.5)' });
    const tanH = Math.tan(THREE.MathUtils.degToRad(kit.camera.fov) / 2);
    const halfH = Math.max(2.6, ...radii) + (mols.length === 2 ? 1.6 : 0);
    const halfW = Math.max(2.6, mols.length === 2 ? radii[0] + radii[1] + 0.9 : radii[0]);
    const dist = Math.max(halfH / tanH, halfW / (tanH * kit.camera.aspect)) / 0.86;
    kit.controls.target.set(0, 0, 0);
    gsap.to(kit.camera.position, { x: 0, y: 0, z: dist, duration: 0.8, ease: 'power2.inOut' });
  }
  function connect(i, reveal) {
    const d = DRUGS[i];
    const col = TYPE[d.g].c;
    const r = rows[i];
    const y1 = r.offsetTop + r.offsetHeight / 2;
    const xm1 = 470 + 60, xm2 = EW - 480 - 60, ym = 270;
    c1.setAttribute('d', `M${r.offsetLeft + r.offsetWidth + 8},${y1} C${xm1 - 20},${y1} ${xm1 - 40},${ym} ${xm1},${ym}`);
    c1.style.stroke = col;
    gsap.to(c1, { opacity: 1, duration: 0.4 });
    const tr = tRows[TARGETS.indexOf(d.target)];
    tRows.forEach((t) => { const on = reveal && t === tr; t.style.background = on ? `color-mix(in oklab, ${col} 20%, transparent)` : 'var(--surface)'; t.style.borderColor = on ? col : 'var(--line)'; t.style.color = on ? 'var(--fg)' : 'var(--fg-2)'; t.style.opacity = reveal && !on ? 0.5 : 1; });
    if (reveal) {
      const y2 = tr.offsetTop + tr.offsetHeight / 2;
      const x2 = EW - 430 - 8;
      c2.setAttribute('d', `M${xm2},${ym} C${xm2 + 40},${ym} ${x2 - 30},${y2} ${x2},${y2}`);
      c2.style.stroke = col;
      gsap.to(c2, { opacity: 1, duration: 0.4, delay: 0.2 });
    } else gsap.to(c2, { opacity: 0, duration: 0.2 });
  }
  function select(i, fromClick) {
    cur = i;
    const d = DRUGS[i];
    rows.forEach((r, k) => { const on = k === i; r.style.background = on ? `color-mix(in oklab, ${TYPE[d.g].c} 18%, transparent)` : ''; r.style.borderColor = on ? TYPE[d.g].c : 'transparent'; r.style.opacity = on ? 1 : 0.62; });
    const reveal = !(quiz && fromClick);
    capName.innerHTML = `${d.name}${d.eg ? `<span style="font-size:26px;font-weight:500;color:var(--fg-2)">${d.eg}</span>` : ''}<span style="font-size:22px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:6px 14px;border-radius:999px;color:${TYPE[d.g].c};border:1.5px solid ${TYPE[d.g].c}">${TYPE[d.g].t}</span>`;
    capUse.innerHTML = reveal ? d.use : '<span style="color:var(--fg-3)">Which enzyme does it target? Click one →</span>';
    connect(i, reveal);
    showMol(d);
  }
  function guess(t, r) {
    if (!quiz) return;
    const d = DRUGS[cur];
    if (t === d.target) { capUse.innerHTML = `✓ ${d.use}`; connect(cur, true); }
    else { gsap.fromTo(r, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1,.3)' }); r.style.borderColor = 'var(--inh)'; setTimeout(() => { r.style.borderColor = 'var(--line)'; }, 700); }
  }
  select(0);
  const api = kitController(kit, {
    enter: () => { march.play(); connect(cur, !quiz); },
    leave: () => march.pause(),
    step: (n) => { if (n !== cur || quiz) select(n, false); },
    destroy: () => march.kill(),
  });
  api.kit = kit;
  return api;
}

/* ------------------------------------------------------------------ */
/* 10 · Allopurinol & xanthine oxidase (real 3D)                        */
/* ------------------------------------------------------------------ */
async function allopurinolViz(el) {
  const EW = el.clientWidth || 1712, EH = el.clientHeight || 726;
  const host = h('div', { style: 'position:absolute;inset:0' });
  el.append(host);
  const kit = createScene(host, { orbit: false, fov: 26, cam: [0, 0, 40], autoRotate: 0, hint: false });
  const k = EH / (2 * 40 * Math.tan(THREE.MathUtils.degToRad(13)));
  const wpos = (x, y) => new THREE.Vector3((x - EW / 2) / k, (EH / 2 - y) / k, 0);
  const D = diagram(el, EW, EH);
  D.svg.style.position = 'relative';
  D.svg.style.zIndex = 1;
  const P = { hx: [190, 200], xa: [680, 200], ur: [1170, 200], al: [190, 540], ox: [680, 540] };
  const mols = {};
  const keys = { hx: 'hypoxanthine', xa: 'xanthine', ur: 'uric', al: 'allopurinol' };
  const datas = await Promise.all(Object.values(keys).map((key) => loadMol(key)));
  Object.keys(keys).forEach((id, i) => {
    const m = buildMolecule(datas[i], {});
    const r = new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere()).radius;
    m.scale.setScalar(3.1 / r);
    const g = new THREE.Group();
    g.add(m);
    g.position.copy(wpos(...P[id]));
    g.rotation.x = 0.35;
    kit.root.add(g);
    mols[id] = { g, m };
  });
  mols.al.g.scale.setScalar(0.001);
  kit.onFrame((dt) => Object.values(mols).forEach(({ m }, i) => { m.rotation.y += dt * (0.45 + i * 0.05); }));
  const name = (x, y, t, col = 'var(--fg)') => D.text(x, y, t, { anchor: 'middle', style: `font-size:30px;font-weight:650;fill:${col}` });
  name(P.hx[0], 372, 'Hypoxanthine');
  name(P.xa[0], 372, 'Xanthine');
  const urName = name(P.ur[0], 372, 'Uric acid', 'var(--inh)');
  const alName = name(P.al[0], 712, 'Allopurinol', SUIC);
  alName.style.opacity = 0;
  const XO = (x1, x2, y) => D.arrow({ from: [x1, y], to: [x2, y], color: 'var(--fg-3)', width: 5, label: 'Xanthine oxidase', labelSide: -1, labelOffset: 34, labelColor: 'var(--ink)', labelWeight: 650 });
  const a1 = XO(330, 540, 200), a2 = XO(820, 1030, 200);
  const a3 = XO(330, 548, 540);
  a3.g.style.opacity = 0;
  const ox = D.node({ id: 'ox', x: P.ox[0], y: P.ox[1], label: 'Oxypurinol', sub: '(alloxanthine)', kind: 'mol', color: 'var(--inh)', size: 30, tip: { kicker: 'Reactive intermediate', title: 'Oxypurinol (alloxanthine)', body: 'Formed <b>by xanthine oxidase itself</b> from allopurinol. It inhibits the same enzyme and reduces uric acid formation.', src: SRC(13) } });
  ox.g.style.opacity = 0;
  const inh1 = D.arrow({ d: `M640,492 C600,380 470,330 435,228`, from: [640, 492], to: [435, 228], kind: 'inh', color: 'var(--inh)', width: 5, headSize: 26 });
  const inh2 = D.arrow({ d: `M720,492 C760,380 890,330 925,228`, from: [720, 492], to: [925, 228], kind: 'inh', color: 'var(--inh)', width: 5, headSize: 26 });
  const inhT = D.text(520, 400, 'inhibits', { anchor: 'end', style: 'font-size:26px;font-weight:700;fill:var(--inh)' });
  const inhT2 = D.text(840, 400, 'inhibits', { style: 'font-size:26px;font-weight:700;fill:var(--inh)' });
  [inh1.g, inh2.g, inhT, inhT2].forEach((e) => (e.style.opacity = 0));
  const x1 = xMark(D.layers.labels, 435, 200, 24), x2 = xMark(D.layers.labels, 925, 200, 24);
  // uric acid gauge + gout joint
  const GX = 1370, GY = 120, GH = 400;
  D.text(GX + 30, GY - 30, 'Uric acid', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--fg-2)' });
  D.layers.labels.append(s('rect', { x: GX, y: GY, width: 60, height: GH, rx: 30, style: 'fill:var(--surface-2);stroke:var(--line);stroke-width:2' }));
  const gfill = s('rect', { x: GX + 8, y: GY + GH - 8, width: 44, height: 0, rx: 22, style: 'fill:var(--inh)' });
  D.layers.labels.append(gfill);
  const gval = D.text(GX + 30, GY + GH + 46, 'High', { anchor: 'middle', style: 'font-size:26px;font-weight:700;fill:var(--inh)' });
  const J = s('g', { transform: 'translate(1590 330)' });
  const jGlow = s('circle', { r: 92, style: 'fill:var(--inh);opacity:.22', filter: `url(#${D.glowId})` });
  J.append(jGlow);
  const boneSt = 'fill:color-mix(in oklab, #e8dfc8 70%, var(--bg));stroke:color-mix(in oklab, var(--fg) 35%, transparent);stroke-width:2';
  J.append(s('path', { d: 'M-130,-22 L-48,-22 C-34,-40 -6,-40 -8,-12 C-8,-4 -8,4 -8,12 C-6,40 -34,40 -48,22 L-130,22 Z', style: boneSt }));
  J.append(s('path', { d: 'M118,-20 L46,-20 C32,-36 8,-34 10,-10 L10,10 C8,34 32,36 46,20 L118,20 Z', style: boneSt }));
  const crystals = s('g');
  [[-6, -54, 30], [12, -46, -40], [-24, 46, -25], [20, 52, 35], [0, -2, 80], [-40, -44, 60], [40, 40, -60], [34, -54, 10], [-40, 50, 15]].forEach(([x, y, a]) => crystals.append(s('rect', { x: -16, y: -2.5, width: 32, height: 5, rx: 2.5, transform: `translate(${x} ${y}) rotate(${a})`, style: 'fill:var(--atp)' })));
  J.append(crystals);
  D.layers.labels.append(J);
  D.text(1590, 476, 'Gout', { anchor: 'middle', style: 'font-size:32px;font-weight:700;fill:var(--fg)' });
  D.text(1590, 514, 'urate crystals', { anchor: 'middle', style: 'font-size:24px;fill:var(--fg-2)' });
  D.text(1590, 544, 'in joints', { anchor: 'middle', style: 'font-size:24px;fill:var(--fg-2)' });
  J.setAttribute('data-tip', JSON.stringify({ title: 'Gout', body: '<b>Urate crystal</b> deposition in <b>joints</b> causes gout (the slide shows the swollen big-toe joint). Allopurinol lowers uric acid production.', src: SRC(13) }));
  const f1 = D.flow(a1, { count: 3, color: SUB, speed: 120, r: 9, autoplay: false });
  const f2 = D.flow(a2, { count: 3, color: SUB, speed: 120, r: 9, autoplay: false });
  const f3 = D.flow(a3, { count: 2, color: SUIC, speed: 110, r: 9, autoplay: false });
  let live = false, cur = 0;
  const level = (v) => { const H = (GH - 16) * v; gsap.to(gfill, { attr: { height: H, y: GY + GH - 8 - H }, duration: 1.2, ease: 'power3.inOut' }); };
  function apply(n) {
    cur = n;
    gsap.to(mols.al.g.scale, { x: n >= 1 ? 1 : 0.001, y: n >= 1 ? 1 : 0.001, z: n >= 1 ? 1 : 0.001, duration: 0.8, ease: n >= 1 ? 'back.out(1.4)' : 'power2.in' });
    show([alName, a3.g], n >= 1);
    show(ox.g, n >= 1, { delay: n >= 1 ? 0.5 : 0 });
    show([inh1.g, inh2.g, inhT, inhT2, x1, x2], n >= 2);
    if (n >= 2) { drawPath(inh1, { duration: 0.8 }); drawPath(inh2, { duration: 0.8, delay: 0.1 }); }
    gsap.to([a1.g, a2.g], { opacity: n >= 2 ? 0.35 : 1, duration: 0.5 });
    gsap.to(urName, { opacity: n >= 2 ? 0.45 : 1, duration: 0.5 });
    gsap.to(crystals, { opacity: n >= 2 ? 0.1 : 1, duration: 1 });
    gsap.to(jGlow, { opacity: n >= 2 ? 0.04 : 0.22, duration: 1 });
    level(n >= 2 ? 0.3 : 0.86);
    gval.textContent = n >= 2 ? 'Lower' : 'High';
    gval.style.fill = n >= 2 ? 'var(--act)' : 'var(--inh)';
    gfill.style.fill = n >= 2 ? 'var(--act)' : 'var(--inh)';
    flows(live);
  }
  function flows(on) {
    if (!on) { [f1, f2, f3].forEach((f) => f.pause()); return; }
    cur >= 2 ? (f1.hide(), f2.hide()) : (f1.play(), f2.play());
    cur >= 1 && cur < 2 ? f3.play() : f3.hide();
  }
  [f1, f2, f3].forEach((f) => f.hide());
  apply(0);
  return kitController(kit, {
    enter: () => { live = true; flows(true); },
    leave: () => { live = false; flows(false); },
    step: (n) => apply(n),
    destroy: () => D.destroy(),
  });
}

/* ------------------------------------------------------------------ */
/* 11 · Learning check: identify curves (slide 16)                      */
/* ------------------------------------------------------------------ */
function curveIdViz(el) {
  const top = h('div', { style: 'position:absolute;left:0;right:0;top:0;height:560px' });
  const bot = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:270px;display:grid;grid-template-columns:1fr 1fr;gap:30px' });
  el.append(top, bot);
  const C = chart(top, { w: 960, h: 560, grid: false, pad: { l: 190, r: 30, t: 50, b: 90 }, x: { min: 0, max: 30, label: 'Substrate concentration [S]', ticks: false }, y: { min: 0, max: 112, ticks: false } });
  { const t = s('text', { x: C.sx(0) + 14, y: C.sy(112) + 4, class: 'v-label v-muted' }); setRich(t, 'v_{0}'); C.top.append(t); }
  const mm = (V, K) => (x) => (V * x) / (K + x);
  C.hline(100, { label: 'V_{max}', color: 'var(--fg-3)', dash: '6 10', width: 2 });
  const lowV = C.hline(40, { label: 'Lower V_{max}', color: 'var(--atp)', dash: '6 10', width: 2 });
  const k1 = C.vline(2, { label: 'K_{m1}', color: 'var(--fg-2)', labelDy: 40, dash: '6 8', width: 2, extent: 50 });
  const k2 = C.vline(6, { label: 'K_{m2}', color: 'var(--nadh)', labelDy: 40, dash: '6 8', width: 2, extent: 50 });
  const L0 = C.line(mm(100, 2), { color: 'var(--fg)', width: 6, label: 'Without inhibitor', labelAt: 30, labelAnchor: 'end', labelDx: -4, labelDy: -42 });
  const LA = C.line(mm(100, 6), { color: 'var(--nadh)', width: 6, label: 'Curve A', labelAt: 30, labelAnchor: 'end', labelDx: -4, labelDy: 60 });
  const LB = C.line(mm(40, 2), { color: 'var(--atp)', width: 6, label: 'Curve B', labelAt: 30, labelAnchor: 'end', labelDx: -4, labelDy: 42 });
  // LB thumbnails
  const mini = (host, kind) => {
    const card = h('div', { style: 'position:relative;border-radius:28px;background:var(--surface);border:1px solid var(--line);overflow:hidden;opacity:0' });
    host.append(card);
    const sv = s('svg', { viewBox: '0 0 465 270', style: 'width:100%;height:100%;display:block' });
    card.append(sv);
    const ox = 170, oy = 200;
    sv.append(s('line', { x1: 30, x2: 440, y1: oy, y2: oy, style: 'stroke:var(--fg-3);stroke-width:3' }));
    sv.append(s('line', { x1: ox, x2: ox, y1: 30, y2: oy, style: 'stroke:var(--fg-3);stroke-width:3' }));
    const ln = (x0, y0, x1, y1, col) => sv.append(s('line', { x1: x0, y1: y0, x2: x1, y2: y1, style: `stroke:${col};stroke-width:5;stroke-linecap:round` }));
    const col = kind === 'A' ? 'var(--nadh)' : 'var(--atp)';
    if (kind === 'A') { ln(70, oy, 420, 120, 'var(--fg)'); ln(125, oy, 330, 40, col); sv.append(s('circle', { cx: ox, cy: 165, r: 12, style: `fill:none;stroke:${col};stroke-width:4` })); }
    else { ln(80, oy, 420, 132, 'var(--fg)'); ln(80, oy, 400, 52, col); sv.append(s('circle', { cx: 80, cy: oy, r: 12, style: `fill:none;stroke:${col};stroke-width:4` })); }
    const t = s('text', { x: 440, y: 248, 'text-anchor': 'end', class: 'v-label sm', style: `fill:${col};font-weight:700` });
    setRich(t, kind === 'A' ? 'K_{m} ↑ · V_{max} same' : 'K_{m} same · V_{max} ↓');
    const t2 = s('text', { x: 30, y: 46, class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:650' });
    t2.textContent = kind === 'A' ? 'A · meet on y-axis' : 'B · meet on x-axis';
    sv.append(t, t2);
    return card;
  };
  const mA = mini(bot, 'A'), mB = mini(bot, 'B');
  return {
    step(n) {
      [k2.el].forEach((e) => gsap.to(e, { opacity: n >= 1 ? 1 : 0, duration: 0.5 }));
      gsap.to(lowV.el, { opacity: n >= 2 ? 1 : 0, duration: 0.5 });
      gsap.to(mA, { opacity: n >= 1 ? 1 : 0, y: n >= 1 ? 0 : 20, duration: 0.6 });
      gsap.to(mB, { opacity: n >= 2 ? 1 : 0, y: n >= 2 ? 0 : 20, duration: 0.6 });
      LA.setLabel(n >= 1 ? 'Curve A · competitive' : 'Curve A');
      LB.setLabel(n >= 2 ? 'Curve B · noncompetitive' : 'Curve B');
      gsap.to(k1.el, { opacity: 1 });
    },
  };
}

/* ------------------------------------------------------------------ */
/* MCQ card (learning checks)                                           */
/* ------------------------------------------------------------------ */
function mcqCard({ kicker, q, opts, ans, why, letters = 'ABCDE' }) {
  const optEls = opts.map((o, i) => h('div', { style: 'display:flex;gap:16px;align-items:baseline;padding:9px 16px;border-radius:16px;font-size:26px;line-height:1.28;color:var(--fg);border:1.5px solid transparent;transition:background .4s,border-color .4s,opacity .4s' }, [
    h('span', { style: 'font:700 22px var(--mono);color:var(--fg-3);min-width:24px;flex:none', text: letters[i] }),
    h('span', { html: o }),
  ]));
  const whyEl = h('div', { style: 'font-size:24px;color:var(--fg-2);line-height:1.35;opacity:0;margin-top:auto;padding-top:10px', html: why });
  const el = h('div.card', { style: 'padding:30px 34px 32px;gap:8px;justify-content:flex-start' }, [
    h('div.k', { html: kicker }),
    h('div', { style: 'font-size:29px;font-weight:620;line-height:1.3;letter-spacing:-.01em;margin:4px 0 8px', html: q }),
    ...optEls,
    whyEl,
    h('div.glow'),
  ]);
  return {
    el,
    reveal(on) {
      optEls.forEach((o, i) => {
        const ok = i === ans;
        o.style.background = on && ok ? 'color-mix(in oklab, var(--act) 16%, transparent)' : '';
        o.style.borderColor = on && ok ? 'var(--act)' : 'transparent';
        o.style.opacity = on && !ok ? 0.42 : 1;
      });
      gsap.to(whyEl, { opacity: on ? 1 : 0, duration: 0.5 });
    },
  };
}
function mcqViz(el, items) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = `repeat(${items.length}, 1fr)`;
  el.style.gap = '28px';
  const cards = items.map((it) => { const c = it.custom ? it.custom() : mcqCard(it); el.append(c.el); return c; });
  return {
    enter() { gsap.fromTo(cards.map((c) => c.el), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'expo.out' }); },
    step(n) { cards.forEach((c, i) => c.reveal(n > i)); },
  };
}

/* ------------------------------------------------------------------ */
/* 13 · Matching (slide 15)                                             */
/* ------------------------------------------------------------------ */
function matchViz(el) {
  const ITEMS = [
    ['Malonate inhibits succinate dehydrogenase', 'Malonate', 'comp'],
    ['Cyanide inhibits cytochrome c oxidase', 'Cyanide', 'nonc'],
    ['Allopurinol is converted to an inhibitor of xanthine oxidase', 'Allopurinol', 'suic'],
    ['β-Lactam antibiotics inactivate bacterial transpeptidases', 'β-Lactams', 'suic'],
    ['Enalapril inhibits angiotensin-converting enzyme', 'Enalapril', 'comp'],
  ];
  const BINS = [['A', 'comp'], ['B', 'nonc'], ['C', 'suic']];
  const BX = (b) => 840 + b * 296, BW = 276;
  BINS.forEach(([L, k], b) => {
    const box = h('div', { style: `position:absolute;left:${BX(b)}px;top:0;width:${BW}px;height:690px;border-radius:30px;background:color-mix(in oklab, ${TYPE[k].c} 7%, transparent);border:1.5px dashed color-mix(in oklab, ${TYPE[k].c} 45%, transparent)` }, [
      h('div', { style: 'display:flex;align-items:center;gap:12px;padding:24px 16px 0' }, [
        h('span', { style: `width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font:750 24px var(--font);background:${TYPE[k].c};color:var(--bg);flex:none`, text: L }),
        h('span', { style: `font-size:25px;font-weight:700;color:${TYPE[k].c}`, text: TYPE[k].t }),
      ]),
    ]);
    el.append(box);
  });
  el.append(h('div', { style: 'position:absolute;left:0;top:-4px;font-size:22px;color:var(--fg-3);font-style:italic', text: 'Each option may be used once, more than once, or not at all.' }));
  const rows = ITEMS.map(([full], i) => {
    const badge = h('span', { style: 'flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font:750 24px var(--font);border:2px dashed var(--line-2);color:var(--fg-3);transition:all .4s', text: '?' });
    const r = h('div', { style: `position:absolute;left:0;top:${46 + i * 128}px;width:790px;height:108px;display:flex;align-items:center;gap:22px;padding:0 26px;border-radius:26px;background:var(--surface);border:1px solid var(--line);font-size:29px;line-height:1.25;font-weight:540;transition:opacity .4s` }, [h('span', { style: 'flex:1', html: full }), badge]);
    el.append(r);
    return { r, badge };
  });
  const chips = ITEMS.map(([, short, k]) => {
    const c = h('div', { style: `position:absolute;left:0;top:0;width:${BW - 36}px;height:76px;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:650;background:color-mix(in oklab, ${TYPE[k].c} 22%, var(--bg));border:1.5px solid ${TYPE[k].c};opacity:0;z-index:3`, text: short });
    el.append(c);
    return c;
  });
  let last = 0;
  return {
    step(n) {
      const counts = [0, 0, 0];
      ITEMS.forEach(([, , k], i) => {
        const b = BINS.findIndex(([, kk]) => kk === k);
        const slot = counts[b]++;
        const placed = i < n;
        const tx = BX(b) + 18, ty = 110 + slot * 92;
        const sx = 520, sy = 46 + i * 128 + 16;
        if (placed) {
          if (i >= last) gsap.fromTo(chips[i], { x: sx, y: sy, opacity: 0, scale: 0.9 }, { x: tx, y: ty, opacity: 1, scale: 1, duration: 0.9, ease: 'power3.inOut' });
          else gsap.set(chips[i], { x: tx, y: ty, opacity: 1, scale: 1 });
        } else gsap.to(chips[i], { opacity: 0, duration: 0.3 });
        const bd = rows[i].badge;
        bd.textContent = placed ? BINS[b][0] : '?';
        bd.style.background = placed ? TYPE[k].c : 'transparent';
        bd.style.color = placed ? 'var(--bg)' : 'var(--fg-3)';
        bd.style.borderStyle = placed ? 'solid' : 'dashed';
        bd.style.borderColor = placed ? TYPE[k].c : 'var(--line-2)';
        rows[i].r.style.opacity = placed || i === n ? 1 : 0.55;
      });
      last = n;
    },
  };
}

/* ------------------------------------------------------------------ */
/* 14 · Case answers                                                    */
/* ------------------------------------------------------------------ */
function caseRevealViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '560px 1fr';
  el.style.gap = '48px';
  const chartHost = h('div', { style: 'position:relative;height:360px;margin-top:24px;opacity:0' });
  const card = h('div.case', { style: 'display:flex;flex-direction:column;padding:44px 44px' }, [
    h('div.tag', { html: '● Case revisited' }),
    h('p', { html: '52-year-old man · BP <b style="color:var(--inh)">160/98</b> → enalapril → <b style="color:var(--act)">135/85 mmHg</b>' }),
    chartHost,
  ]);
  const C = chart(chartHost, { w: 470, h: 360, grid: false, pad: { l: 50, r: 20, t: 24, b: 96 }, x: { min: 0, max: 25, ticks: false }, y: { min: 0, max: 112, ticks: false } });
  const c0 = C.line((x) => (100 * x) / (2 + x), { color: SUB, width: 5, dash: '10 10' });
  const c1 = C.line((x) => (100 * x) / (7 + x), { color: COMP, width: 6, label: '+ enalapril', labelAt: 25, labelAnchor: 'end', labelDy: 36 });
  C.hline(100, { color: 'var(--fg-3)', dash: '6 10', width: 2 });
  C.vline(2, { label: 'K_{m}', color: SUB, labelDy: 40, dash: '5 8', width: 2, extent: 50 });
  C.vline(7, { label: 'K_{m} app', color: COMP, labelDy: 40, dash: '5 8', width: 2, extent: 50 });
  const qs = [
    ['What type of inhibition?', '<b>Competitive</b> — ACE inhibitors (enalapril) are in the lecture’s competitive list.', { title: 'Why competitive?', body: 'ACE inhibitors appear in the competitive-inhibitor table (slide 7), and “Enalapril inhibits ACE” is answered “competitive” in the matching check (slide 15).', src: SRC('7, 15') }],
    ['Effect on K<sub>m</sub> and V<sub>max</sub>?', '<b>Apparent K<sub>m</sub> ↑</b> · <b>V<sub>max</sub> unchanged</b>. Lines meet on the y-axis.', { title: 'Competitive kinetics', body: 'Apparent Km increases while Vmax remains unchanged; excess substrate overcomes the inhibition.', src: SRC(6) }],
    ['How does BP fall?', 'ACE inhibition causes <b>vasodilation</b> → ↓ blood pressure.', { kicker: 'Beyond the slide · Lippincott', title: 'Mechanism', body: '[textbook] ACE converts angiotensin I to angiotensin II, a potent vasoconstrictor. Blocking ACE lowers angiotensin II. Enalapril is a prodrug converted to enalaprilat.', src: `${SRC(7)} · textbook context` }],
  ];
  const list = h('div', { style: 'display:grid;gap:22px;align-content:center' });
  const ans = qs.map(([q, a, tp]) => {
    const A = h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:10px;line-height:1.35;opacity:0', html: a });
    const row = h('div', { style: 'padding:24px 30px;border-radius:28px;background:var(--surface);border:1px solid var(--line)' }, [h('div', { style: 'font-size:32px;font-weight:650;letter-spacing:-.01em', html: q }), A]);
    tip(row, tp);
    list.append(row);
    return A;
  });
  el.append(card, list);
  return {
    step(n) {
      ans.forEach((a, i) => gsap.to(a, { opacity: i < n ? 1 : 0, duration: 0.5 }));
      gsap.to(chartHost, { opacity: n >= 2 ? 1 : 0, duration: 0.5 });
      if (n === 2) { c0.draw(0.8); c1.draw(1.1, 0.2); }
    },
  };
}

/* ------------------------------------------------------------------ */
/* 15 · Five types of regulation                                        */
/* ------------------------------------------------------------------ */
function regTypesViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = 'repeat(5, 1fr)';
  el.style.gap = '24px';
  const T = [
    { icon: 'target', name: 'Allosteric regulation', chips: [['Noncovalent', 'var(--act)'], ['Reversible', 'var(--act)']], tip: { title: 'Allosteric regulation', body: 'Effectors bind a regulatory site distinct from the active site and change conformation and activity. Includes feedback inhibition and feed-forward activation.', src: SRC('19–23') } },
    { icon: 'scissors', name: 'Proteolytic activation', chips: [['Irreversible', 'var(--inh)']], tip: { title: 'Proteolytic activation', body: 'Inactive zymogens are activated when cleavage removes a peptide segment — irreversibly.', src: SRC(24) } },
    { icon: 'layers', name: 'Compart&shy;mentalization', chips: [['Separate locations', 'var(--elec)']], tip: { title: 'Compartmentalization', body: 'Opposing pathways run in different compartments — prevents futile cycling, permits independent regulation.', src: SRC(25) } },
    { icon: 'clock', name: 'Induction & repression', chips: [['Long-term', 'var(--atp)'], ['Enzyme amount', 'var(--atp)']], tip: { title: 'Induction & repression', body: 'Long-term regulation of enzyme <b>synthesis</b>: more (induction) or less (repression) enzyme.', src: SRC(26) } },
    { icon: 'cycle', name: 'Covalent modification', chips: [['Rapid', 'var(--act)'], ['Reversible', 'var(--act)']], tip: { title: 'Reversible covalent modification', body: 'A chemical group (mostly phosphate) is added or removed; hormones regulate this rapid switch.', src: SRC('27–28') } },
  ];
  const glyphs = [];
  const tiles = T.map((t, i) => {
    const gl = h('div', { style: 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center' });
    const c = h('div.card', { style: 'padding:30px 28px 34px;gap:10px;justify-content:space-between' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' }, [
        h('div.icon', { style: 'width:64px;height:64px', html: icon(t.icon) }),
        h('div', { style: 'font:600 26px var(--mono);color:var(--fg-3)', text: `0${i + 1}` }),
      ]),
      gl,
      h('div', {}, [
        h('h3', { style: 'font-size:34px;line-height:1.12;margin:0 0 18px;hyphens:manual', html: t.name }),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, t.chips.map(([c2, col]) => h('span', { style: `font-size:21px;font-weight:650;padding:7px 14px;border-radius:999px;color:${col};border:1.5px solid color-mix(in oklab, ${col} 55%, transparent);background:color-mix(in oklab, ${col} 10%, transparent)`, text: c2 }))),
      ]),
      h('div.glow'),
    ]);
    tip(c, t.tip);
    el.append(c);
    glyphs.push(regGlyph(gl, ['allo', 'prot', 'comp', 'ind', 'cov'][i]));
    return c;
  });
  return {
    enter() {
      gsap.fromTo(tiles, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'expo.out' });
      glyphs.forEach((g) => g.tl.play());
    },
    leave() { glyphs.forEach((g) => g.tl.pause()); },
    destroy() { glyphs.forEach((g) => { g.tl.kill(); g.D.destroy(); }); },
  };
}
/** Tiny looping illustration for each regulation tile (260 × 210). */
function regGlyph(host, kind) {
  const D = diagram(host, 260, 210);
  D.svg.style.width = '100%';
  D.svg.style.height = 'auto';
  D.svg.style.maxHeight = '100%';
  const tl = gsap.timeline({ repeat: -1, paused: true });
  const st = { t: 0 };
  if (kind === 'allo') {
    const W = s('g', { transform: 'translate(122 104) scale(0.44)' });
    D.layers.nodes.append(W);
    const enz = makeEnzyme(W, D, { notch: true, pocket: POCKET.wide });
    const E = token(W, { r: 34, color: 'var(--act)', label: '+', kind: 'triangle' });
    gsap.set(E, { x: 250, y: 190, opacity: 1 });
    const morph = () => enz.set(mixArr(POCKET.wide, POCKET.normal, st.t));
    tl.to(E, { x: 90, y: 128, duration: 0.9, ease: 'power2.inOut' })
      .to(st, { t: 1, duration: 0.6, onUpdate: morph }, '-=0.3')
      .to({}, { duration: 1.1 })
      .to(E, { x: 250, y: 190, duration: 0.8, ease: 'power2.inOut' })
      .to(st, { t: 0, duration: 0.6, onUpdate: morph }, '<')
      .to({}, { duration: 0.5 });
  } else if (kind === 'prot') {
    const beads = Array.from({ length: 8 }, (_, i) => { const c = s('circle', { cx: 30 + i * 29, cy: 110 + Math.sin(i * 0.9) * 14, r: 12, style: `fill:${i < 2 ? 'var(--a2)' : 'var(--a1)'};stroke:var(--bg);stroke-width:2` }); D.layers.nodes.append(c); return c; });
    const cut = s('path', { d: 'M74,72 L74,148', style: 'stroke:var(--inh);stroke-width:3;stroke-dasharray:6 6;opacity:0' });
    D.layers.labels.append(cut);
    const paint = (c) => () => beads.slice(2).forEach((b) => { b.style.fill = c; });
    tl.to(cut, { opacity: 1, duration: 0.3 }, 0.5)
      .to(beads.slice(0, 2), { x: -16, y: -40, opacity: 0, duration: 0.8 }, '+=0.3')
      .to(cut, { opacity: 0, duration: 0.3 }, '<')
      .call(paint('var(--act)'))
      .to({}, { duration: 1.4 })
      .set(beads.slice(0, 2), { x: 0, y: 0, opacity: 1 })
      .call(paint('var(--a1)'))
      .to({}, { duration: 0.4 });
  } else if (kind === 'comp') {
    D.layers.regions.append(s('rect', { x: 14, y: 26, width: 232, height: 166, rx: 50, style: 'fill:color-mix(in oklab, var(--act) 7%, transparent);stroke:color-mix(in oklab, var(--act) 50%, transparent);stroke-width:2.5' }));
    D.layers.regions.append(s('ellipse', { cx: 172, cy: 110, rx: 54, ry: 34, style: 'fill:color-mix(in oklab, var(--prot) 16%, transparent);stroke:var(--prot);stroke-width:2.5' }));
    const A = Array.from({ length: 4 }, () => { const c = s('circle', { r: 7, style: 'fill:var(--act)' }); D.layers.nodes.append(c); return c; });
    const B = Array.from({ length: 3 }, () => { const c = s('circle', { r: 7, style: 'fill:var(--prot)' }); D.layers.nodes.append(c); return c; });
    const upd = () => {
      A.forEach((c, i) => { const a = st.t * Math.PI * 2 + (i * Math.PI) / 2; c.setAttribute('cx', 68 + Math.cos(a) * 34); c.setAttribute('cy', 110 + Math.sin(a) * 52); });
      B.forEach((c, i) => { const a = -st.t * Math.PI * 2 + (i * Math.PI * 2) / 3; c.setAttribute('cx', 172 + Math.cos(a) * 34); c.setAttribute('cy', 110 + Math.sin(a) * 18); });
    };
    upd();
    tl.to(st, { t: 1, duration: 4, ease: 'none', onUpdate: upd });
  } else if (kind === 'ind') {
    const icons = Array.from({ length: 8 }, (_, i) => {
      const g = s('g', { transform: `translate(${48 + (i % 4) * 54} ${76 + Math.floor(i / 4) * 64})` });
      const inner = s('path', { d: 'M0,0 L20,-12 A23,23 0 1 0 20,12 Z', style: 'fill:var(--a1)' });
      g.append(inner);
      D.layers.nodes.append(g);
      gsap.set(inner, { scale: i < 2 ? 1 : 0, transformOrigin: '50% 50%' });
      return inner;
    });
    tl.to(icons.slice(2), { scale: 1, duration: 0.4, stagger: 0.15, ease: 'back.out(2)' }, 0.3)
      .to({}, { duration: 1.2 })
      .to(icons.slice(2).reverse(), { scale: 0, duration: 0.3, stagger: 0.1, ease: 'power2.in' })
      .to({}, { duration: 0.6 });
  } else {
    const W = s('g', { transform: 'translate(118 116) scale(0.42)' });
    D.layers.nodes.append(W);
    const enz = makeEnzyme(W, D, { notch: false });
    const P = s('g', { transform: 'translate(206 62)' });
    P.append(s('circle', { r: 22, style: `fill:${SUIC}` }));
    const pt = s('text', { y: 8, 'text-anchor': 'middle', style: 'font:800 24px var(--font);fill:var(--bg)' });
    pt.textContent = 'P';
    P.append(pt);
    D.layers.labels.append(P);
    gsap.set(P, { scale: 0, transformOrigin: '50% 50%' });
    tl.to(P, { scale: 1, duration: 0.45, ease: 'back.out(2.2)' }, 0.4)
      .call(() => { enz.g.style.filter = 'hue-rotate(-60deg) saturate(1.4)'; })
      .to({}, { duration: 1.2 })
      .to(P, { scale: 0, duration: 0.35, ease: 'power2.in' })
      .call(() => { enz.g.style.filter = ''; })
      .to({}, { duration: 1 });
  }
  return { tl, D };
}

/* ------------------------------------------------------------------ */
/* 16 · Allosteric effectors                                            */
/* ------------------------------------------------------------------ */
function effectorViz(el) {
  const D = diagram(el, 960, 860);
  const EX = 410, EY = 540, SC = 1.25;
  const W = s('g', { transform: `translate(${EX} ${EY}) scale(${SC})` });
  D.layers.nodes.append(W);
  const BASE = mixArr(POCKET.normal, POCKET.wide, 0.6);
  const enz = makeEnzyme(W, D, { notch: true, pocket: BASE });
  const spark = s('circle', { cx: 0, cy: -90, r: 30, style: 'fill:var(--atp);opacity:0', filter: `url(#${D.glowId})` });
  W.append(spark);
  const poolS = [[-290, -262], [-60, -292], [250, -272]].map(([x, y]) => { const t = token(W, { r: 30, color: SUB, label: 'S' }); gsap.set(t, { x, y, opacity: 0.85 }); return t; });
  const killF = floatAll(poolS);
  const S = token(W, { r: 46, color: SUB, label: 'S' });
  const P1 = token(W, { r: 26, color: PROD, label: 'P' }), P2 = token(W, { r: 26, color: PROD, label: 'P' });
  const NEG = token(W, { r: 30, color: 'var(--inh)', label: '−' });
  const POS = token(W, { r: 36, color: 'var(--act)', label: '+', kind: 'triangle' });
  const X = xMark(W, 0, -200, 24);
  gsap.set(NEG, { x: 330, y: 230, transformOrigin: '50% 50%' });
  gsap.set(POS, { x: 330, y: 230, transformOrigin: '50% 50%' });
  leader(D, EX + 70 * SC, EY - 128 * SC, 580, 330, 'Active site');
  leader(D, EX + 112 * SC, EY + 128 * SC, 610, 778, 'Allosteric site');
  const status = D.text(0, 48, '', { style: 'font-size:34px;font-weight:680' });
  const sub = D.text(0, 92, '', { style: 'font-size:26px;fill:var(--fg-2)' });
  const meter = vMeter(D.layers.labels, { x: 872, y: 300, h: 400, label: 'Activity' });
  let tl = null, live = false, cur = -1, k = 0;
  const FROM = [[-290, -262], [-60, -292], [250, -272]];
  const from = () => FROM[(k++) % 3];
  const cat = (L, hold = 0.1) => {
    const f = from();
    L.set(S, { x: f[0], y: f[1], scale: 0.65, opacity: 0, transformOrigin: '50% 50%' }).to(S, { opacity: 1, duration: 0.25 })
      .to(S, { x: 0, y: -122, scale: 1, duration: 0.85, ease: 'power2.inOut' })
      .to(spark, { opacity: 0.95, duration: 0.18 }, `+=${hold}`).set(S, { opacity: 0 })
      .set(P1, { x: -20, y: -118, opacity: 1 }).set(P2, { x: 20, y: -118, opacity: 1 })
      .to(spark, { opacity: 0, duration: 0.35 })
      .to(P1, { x: 210, y: -290, opacity: 0, duration: 1 }, '<').to(P2, { x: 300, y: -220, opacity: 0, duration: 1 }, '<0.08');
  };
  const bnc = (L) => {
    const f = from();
    L.set(S, { x: f[0], y: f[1], scale: 0.65, opacity: 0, transformOrigin: '50% 50%' }).to(S, { opacity: 1, duration: 0.25 })
      .to(S, { x: f[0] * 0.12, y: -228, scale: 0.95, duration: 0.75, ease: 'power2.in' })
      .to(X, { opacity: 1, duration: 0.12 })
      .to(S, { x: f[0] * 0.6 + 80, y: -330, scale: 0.7, duration: 0.7, ease: 'power2.out' })
      .to(X, { opacity: 0, duration: 0.3 }, '<').to(S, { opacity: 0, duration: 0.25 });
  };
  const STAT = [
    ['No effector', 'Active site only partly shaped', 'var(--fg)'],
    ['Negative effector (inhibitor)', 'Active site distorted · substrate rejected', 'var(--inh)'],
    ['Positive effector (activator)', 'Active site assumes the correct shape', 'var(--act)'],
  ];
  function apply(n) {
    if (n === cur) return;
    cur = n;
    tl?.kill();
    gsap.killTweensOf([S, P1, P2, spark, X, NEG, POS]);
    gsap.set([P1, P2, spark, X, S], { opacity: 0 });
    tl = gsap.timeline();
    const L = gsap.timeline({ repeat: -1 });
    tl.to(NEG, n === 1 ? { x: 90, y: 136, opacity: 1, duration: 0.9, ease: 'power2.inOut' } : { x: 330, y: 230, opacity: 0, duration: 0.6 }, 0);
    tl.to(POS, n === 2 ? { x: 90, y: 128, opacity: 1, duration: 0.9, ease: 'power2.inOut' } : { x: 330, y: 230, opacity: 0, duration: 0.6 }, 0);
    enz.to(n === 1 ? POCKET.distorted : n === 2 ? POCKET.normal : BASE, 0.9);
    if (n === 0) { cat(L, 0.9); bnc(L); }
    else if (n === 1) { bnc(L); bnc(L); }
    else { cat(L); cat(L); }
    tl.add(L, 0.9);
    if (!live) tl.pause();
    status.textContent = STAT[n][0]; status.style.fill = STAT[n][2];
    sub.textContent = STAT[n][1];
    meter.set([0.5, 0.08, 1][n], ['Partial', 'Low', 'High'][n], ['var(--atp)', 'var(--inh)', 'var(--act)'][n]);
  }
  const sg = seg({ options: [{ v: 1, t: '− Negative' }, { v: 0, t: 'None' }, { v: 2, t: '+ Positive' }], value: 0, onChange: (v) => apply(v) });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  apply(0);
  return {
    enter() { live = true; tl?.resume(); },
    leave() { live = false; tl?.pause(); },
    step(n) { sg.set(n, false); apply(n); },
    destroy() { tl?.kill(); killF(); enz.destroy(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 17 · Allosteric kinetics                                             */
/* ------------------------------------------------------------------ */
function alloKinViz(el) {
  const C = chart(el, { w: 960, h: 740, grid: false, pad: { l: 130, r: 40, t: 40, b: 110 }, x: { min: 0, max: 30, label: '[Substrate] →', ticks: false }, y: { min: 0, max: 152, label: 'Reaction velocity (v_{0})', ticks: false } });
  C.svg.style.height = '740px';
  const hill = (V, K, n = 2.8) => (x) => (V * Math.pow(x, n)) / (Math.pow(K, n) + Math.pow(x, n));
  const mmL = C.line((x) => (100 * x) / (8 + x), { color: 'var(--fg-3)', width: 4, dash: '10 10', label: 'Michaelis–Menten', labelAt: 30, labelDx: -4, labelAnchor: 'end', labelDy: 72 });
  const baseSt = { color: 'var(--fg)', width: 7, label: 'Sigmoidal', labelAt: 30, labelAnchor: 'end', labelDx: -6, labelDy: 40 };
  const base = C.line(hill(100, 8), baseSt);
  const plus = C.line(hill(100, 8), { color: 'var(--act)', width: 7 });
  const minus = C.line(hill(100, 8), { color: 'var(--inh)', width: 7 });
  const marker = (col, sign) => {
    const g = s('g', { style: 'opacity:0' });
    g.append(s('circle', { r: 22, style: `fill:${col};stroke:var(--bg);stroke-width:4` }));
    const t = s('text', { y: 10, 'text-anchor': 'middle', style: 'font:800 30px var(--font);fill:var(--bg)' });
    t.textContent = sign; g.append(t);
    C.top.append(g);
    return { g, at(x, y) { g.setAttribute('transform', `translate(${C.sx(x)} ${C.sy(y)})`); } };
  };
  const mP = marker('var(--act)', '+'), mM = marker('var(--inh)', '−');
  const hV = [C.hline(100, { label: 'V_{max}', color: 'var(--fg-2)', dash: '6 10', width: 2 }), C.hline(140, { label: 'V_{max}', color: 'var(--act)', dash: '6 10', width: 2 }), C.hline(60, { label: 'V_{max}', color: 'var(--inh)', dash: '6 10', width: 2 })];
  const hHalf = C.hline(50, { color: 'var(--fg-3)', dash: '4 10', width: 2 });
  const vK = [C.vline(8, { label: 'K_{0.5}', color: 'var(--fg-2)', labelDy: 44, dash: '6 8', width: 2, extent: 50 }), C.vline(4, { label: 'K_{0.5}', color: 'var(--act)', labelDy: 44, dash: '6 8', width: 2, extent: 50 }), C.vline(16, { label: 'K_{0.5}', color: 'var(--inh)', labelDy: 44, dash: '6 8', width: 2, extent: 50 })];
  const panelT = s('text', { x: C.pad.l + 24, y: C.pad.t + 30, class: 'v-label', style: 'font-size:30px;font-weight:700;fill:var(--ink)' });
  C.top.append(panelT);
  let mode = 'base', showMM = true;
  function update(anim) {
    const K = mode === 'K', V = mode === 'V';
    plus.update(hill(V ? 140 : 100, K ? 4 : 8)); minus.update(hill(V ? 60 : 100, K ? 16 : 8));
    plus.show(K || V); minus.show(K || V);
    mmL.show(showMM);
    Object.assign(baseSt, mode === 'base' ? { labelAt: 13.5, labelDx: -22, labelDy: -6 } : { labelAt: 30, labelDx: -6, labelDy: 40 });
    base.update();
    base.setLabel(mode === 'base' ? 'Sigmoidal · allosteric' : 'No effector');
    mP.g.style.opacity = K || V ? 1 : 0; mM.g.style.opacity = K || V ? 1 : 0;
    if (K) { mP.at(4.9, hill(100, 4)(4.9)); mM.at(19, hill(100, 16)(19)); }
    if (V) { mP.at(11, hill(140, 8)(11)); mM.at(13, hill(60, 8)(13)); }
    hV[0].el.style.opacity = 1; hV[1].el.style.opacity = V ? 1 : 0; hV[2].el.style.opacity = V ? 1 : 0;
    hHalf.el.style.opacity = V ? 0 : 1;
    vK[0].move(8, 'K_{0.5}', V ? 70 : 50);
    vK[1].el.style.opacity = K ? 1 : 0; vK[2].el.style.opacity = K ? 1 : 0;
    setRich(panelT, K ? 'Effectors alter K_{0.5}' : V ? 'Effectors alter V_{max}' : '');
    if (anim && (K || V)) { plus.draw(1); minus.draw(1, 0.15); }
  }
  const sg = seg({ options: [{ v: 'K', t: 'K<sub>0.5</sub> altered' }, { v: 'V', t: 'V<sub>max</sub> altered' }], value: 'K', onChange: (v) => { mode = v; update(true); } });
  const tm = toggle({ label: 'Michaelis–Menten', on: true, onChange: (v) => { showMM = v; update(); } });
  ctrlBar(el, [sg, tm], { left: 0, bottom: 0 });
  return {
    step(n) {
      mode = ['base', 'K', 'V'][Math.min(2, n)];
      showMM = n === 0;
      tm.set(showMM, false);
      if (n === 0) sg.set('none', false); else sg.set(mode, false);
      update(true);
      if (n === 0) base.draw(1.2);
    },
  };
}

/* ------------------------------------------------------------------ */
/* 18 · Feedback inhibition vs feed-forward activation                  */
/* ------------------------------------------------------------------ */
function feedViz(el) {
  const D = diagram(el, 1712, 720);
  D.region({ x: 0, y: 0, w: 820, h: 720, r: 36, label: 'Feedback inhibition', labelColor: 'var(--inh)' });
  const rR = D.region({ x: 892, y: 0, w: 820, h: 720, r: 36, label: 'Feed-forward activation', labelColor: 'var(--act)' });
  // ---- feedback ----
  const Y = 240, XS = [100, 306, 512, 718];
  const rail = s('path', { d: [0, 1, 2].map((i) => `M${XS[i] + 56},${Y} L${XS[i + 1] - 56},${Y}`).join(' '), style: 'fill:none;stroke:none' });
  D.layers.fx.append(rail);
  ['A', 'B', 'C', 'D'].forEach((n, i) => D.node({ id: n, x: XS[i], y: Y, label: n, kind: 'mol', w: 104, size: 36, color: i === 3 ? 'var(--a2)' : undefined }));
  const eA = ['Enzyme 1', 'Enzyme 2', 'Enzyme 3'].map((t, i) => D.arrow({ from: ['A', 'B', 'C'][i], to: ['B', 'C', 'D'][i], width: 4, color: 'var(--fg-3)', label: t, labelSide: -1, labelOffset: 58, labelColor: i === 0 ? 'var(--ink)' : 'var(--fg-3)', labelWeight: i === 0 ? 750 : 560 }));
  D.text(XS[3], 150, 'End product', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--a2)' });
  const fb = D.arrow({ d: `M${XS[3]},282 C${XS[3]},450 203,450 203,262`, from: [XS[3], 282], to: [203, 262], kind: 'inh', color: 'var(--inh)', width: 5, headSize: 30 });
  const fbT = D.text(410, 470, 'End product inhibits the early regulatory enzyme', { anchor: 'middle', style: 'font-size:25px;font-weight:620;fill:var(--inh)' });
  const ex = [
    ['Heme  ⊣  ALA synthase', 'Heme synthesis', { kicker: 'Feedback inhibition', title: 'Heme ⊣ ALA synthase', body: 'End product heme inhibits ALA synthase, the regulatory enzyme of heme synthesis.<br><span style="color:var(--fg-3)">[textbook] Heme acts mainly by repressing ALA synthase synthesis — keep the lecture framing for exams.</span>', src: SRC(23) }],
    ['Cholesterol  ⊣  HMG-CoA reductase', 'Cholesterol synthesis', { kicker: 'Feedback inhibition', title: 'Cholesterol ⊣ HMG-CoA reductase', body: 'End product cholesterol inhibits HMG-CoA reductase — the same enzyme statins inhibit competitively.<br><span style="color:var(--fg-3)">[textbook] Mainly via transcription (SREBP) and enzyme degradation.</span>', src: SRC('7, 23') }],
  ].map(([t, p, tp], i) => {
    const n = D.node({ x: 410, y: 565 + i * 82, label: t, kind: 'box', w: 740, h: 66, size: 27, tip: tp });
    n.g.querySelector('text').setAttribute('x', -340); n.g.querySelector('text').setAttribute('text-anchor', 'start');
    const pt = s('text', { x: 340, y: 9, 'text-anchor': 'end', class: 'v-label sm', style: 'fill:var(--fg-3)' }); pt.textContent = p; n.g.append(pt);
    return n.g;
  });
  const fFlow = { cur: D.flow(rail, { count: 5, color: 'var(--a1)', speed: 150, r: 10, autoplay: false }) };
  // ---- feed-forward ----
  const FX = 1130;
  const F = D.node({ id: 'F', x: FX, y: 140, label: 'Fructose\n1,6-bisphosphate', kind: 'mol', size: 26, color: 'var(--atp)', tip: { title: 'Fructose 1,6-bisphosphate', body: 'An early glycolytic metabolite — it activates pyruvate kinase, an enzyme later in the pathway.', src: SRC(22) } });
  const PEP = D.node({ id: 'PEP', x: FX, y: 370, label: 'Phosphoenolpyruvate', kind: 'mol', size: 26 });
  const PYR = D.node({ id: 'PYR', x: FX, y: 590, label: 'Pyruvate', kind: 'mol', size: 26 });
  D.arrow({ from: 'F', to: 'PEP', width: 4, dash: '10 10', color: 'var(--fg-3)', label: 'several steps', labelSide: 1, labelOffset: 26 });
  const toPyr = D.arrow({ from: 'PEP', to: 'PYR', width: 5, color: 'var(--fg-3)' });
  const PK = D.node({ id: 'PK', x: FX + 200, y: 480, label: 'Pyruvate kinase', kind: 'enz', size: 26, color: 'var(--act)' });
  const ff = D.arrow({ d: `M${FX + 150},140 C1600,150 1640,480 ${FX + 330},480`, from: [FX + 150, 140], to: [FX + 330, 480], color: 'var(--act)', width: 5 });
  const plusB = s('g', { transform: 'translate(1554 300)' });
  plusB.append(s('circle', { r: 26, style: 'fill:var(--act)' }));
  const pt = s('text', { y: 11, 'text-anchor': 'middle', style: 'font:800 32px var(--font);fill:var(--bg)' }); pt.textContent = '+'; plusB.append(pt);
  D.layers.labels.append(plusB);
  const ffT1 = D.text(1395, 260, 'Activates a', { anchor: 'middle', style: 'font-size:25px;font-weight:620;fill:var(--act)' });
  const ffT2 = D.text(1395, 292, 'later enzyme', { anchor: 'middle', style: 'font-size:25px;font-weight:620;fill:var(--act)' });
  const rail2 = s('path', { d: `M${FX},196 L${FX},330 M${FX},410 L${FX},552`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(rail2);
  const ffFlow = { cur: D.flow(rail2, { count: 3, color: 'var(--atp)', speed: 110, r: 10, autoplay: false }) };
  const rightEls = [F.g, PEP.g, PYR.g, PK.g, ff.g, plusB, ffT1, ffT2, toPyr.g];
  const ffGroup = [ff.g, plusB, ffT1, ffT2];
  let endHigh = false, f16High = false, live = false, n0 = 0;
  const tE = toggle({ label: 'End product high', danger: true, onChange: (v) => { endHigh = v; refresh(); } });
  const tF = toggle({ label: 'F-1,6-BP high', onChange: (v) => { f16High = v; refresh(); } });
  ctrlBar(el, [tE], { left: 470, top: 14 });
  ctrlBar(el, [tF], { right: 18, top: 14 });
  function refresh() {
    fFlow.cur.destroy();
    fFlow.cur = D.flow(rail, endHigh ? { count: 2, color: 'var(--inh)', speed: 40, r: 10, autoplay: live } : { count: 5, color: 'var(--a1)', speed: 150, r: 10, autoplay: live });
    gsap.to(fb.g, { opacity: endHigh ? 1 : 0.18, duration: 0.5 });
    gsap.to(fbT, { opacity: endHigh ? 1 : 0.3, duration: 0.5 });
    gsap.to(eA[0].g, { opacity: endHigh ? 0.35 : 1, duration: 0.5 });
    ffFlow.cur.destroy();
    ffFlow.cur = D.flow(rail2, f16High ? { count: 6, color: 'var(--act)', speed: 220, r: 10, autoplay: live } : { count: 3, color: 'var(--atp)', speed: 110, r: 10, autoplay: live });
    gsap.to(ffGroup, { opacity: f16High ? 1 : 0.18, duration: 0.5 });
    PK.shape.style.strokeWidth = f16High ? 5 : 2;
    PK.shape.style.fill = f16High ? 'color-mix(in oklab, var(--act) 32%, transparent)' : '';
  }
  return {
    enter() { live = true; fFlow.cur.play(); if (n0 >= 3) ffFlow.cur.play(); },
    leave() { live = false; fFlow.cur.pause(); ffFlow.cur.pause(); },
    step(n) {
      endHigh = n >= 1; tE.set(endHigh, false);
      f16High = n >= 3; tF.set(f16High, false);
      refresh();
      if (n < 3) ffFlow.cur.hide();
      if (n === 1 && n0 < 1) drawPath(fb, { duration: 1 });
      if (n === 3 && n0 < 3) drawPath(ff, { duration: 1 });
      show(ex, n >= 2, { stagger: 0.12 });
      gsap.to([rR, ...rightEls.filter((e) => !ffGroup.includes(e))], { opacity: n >= 3 ? 1 : 0.3, duration: 0.6 });
      n0 = n;
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 19 · Proteolytic activation (zymogens)                               */
/* ------------------------------------------------------------------ */
function zymogenViz(el) {
  const D = diagram(el, 960, 860);
  const PAIRS = [['Stomach', 'Pepsinogen', 'Pepsin'], ['Pancreas', 'Trypsinogen', 'Trypsin'], ['Pancreas', 'Chymotrypsinogen', 'Chymotrypsin'], ['Coagulation', 'Prothrombin', 'Thrombin'], ['Fibrinolysis', 'Plasminogen', 'Plasmin']];
  let sel = 1, cur = 0;
  const N = 16, NP = 4;
  const chainPos = Array.from({ length: N }, (_, i) => [80 + i * 53, 270 + Math.sin(i * 0.85) * 34]);
  const fold = Array.from({ length: N - NP }, (_, i) => { const a = (-60 + (i / (N - NP - 1)) * 300) * Math.PI / 180; return [560 + Math.sin(a) * 140, 280 - Math.cos(a) * 140]; });
  const peptAway = Array.from({ length: NP }, (_, i) => [70 + i * 46, 170 + (i % 2) * 18]);
  const bondPath = s('path', { style: 'fill:none;stroke:var(--line-2);stroke-width:6;stroke-linecap:round;stroke-linejoin:round' });
  const pepBond = s('path', { style: 'fill:none;stroke:color-mix(in oklab, var(--a2) 60%, transparent);stroke-width:6;stroke-linecap:round' });
  D.layers.edges.append(bondPath, pepBond);
  const site = s('circle', { cx: 560, cy: 140, r: 44, style: 'fill:var(--act);opacity:0', filter: `url(#${D.glowId})` });
  D.layers.fx.append(site);
  const beads = chainPos.map((p, i) => { const c = s('circle', { cx: p[0], cy: p[1], r: 21, style: `fill:${i < NP ? 'var(--a2)' : 'var(--a1)'};stroke:var(--bg);stroke-width:3` }); D.layers.nodes.append(c); return c; });
  const redraw = () => {
    const pts = beads.map((b) => [+b.getAttribute('cx'), +b.getAttribute('cy')]);
    bondPath.setAttribute('d', pts.slice(NP).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(''));
    pepBond.setAttribute('d', pts.slice(0, NP + (cur === 0 ? 1 : 0)).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(''));
  };
  redraw();
  const cutX = (chainPos[NP - 1][0] + chainPos[NP][0]) / 2;
  const cut = s('path', { d: `M${cutX},200 L${cutX},350`, style: 'stroke:var(--inh);stroke-width:4;stroke-dasharray:8 8;opacity:.9' });
  D.layers.labels.append(cut);
  const sc = s('g', { transform: `translate(${cutX - 36} 96) scale(3)`, style: 'fill:none;stroke:var(--inh);stroke-width:1.8;stroke-linecap:round' });
  sc.innerHTML = '<g transform="rotate(90 12 12)"><circle cx="6.5" cy="7" r="2.6"/><circle cx="6.5" cy="17" r="2.6"/><path d="M8.6 8.5 20 17M8.6 15.5 20 7"/></g>';
  D.layers.labels.append(sc);
  const pepLbl = D.text(150, 214, 'Activation peptide', { anchor: 'middle', style: 'font-size:23px;font-weight:620;fill:var(--a2)' });
  const zName = D.text(0, 52, '', { style: 'font-size:40px;font-weight:720' });
  const zTag = D.badge(0, 0, 'INACTIVE', { color: 'var(--inh)', size: 22, w: 150 });
  const lockG = padlock(D.layers.labels, 860, 300, 1.2);
  const irr = D.text(860, 380, 'Irreversible', { anchor: 'middle', style: 'font-size:24px;font-weight:650;fill:var(--fg-2);opacity:0' });
  // pair list
  const rows = PAIRS.map(([site2, z, a], i) => {
    const g = s('g', { style: 'cursor:pointer' });
    const y = 520 + i * 66;
    const bg = s('rect', { x: 0, y: y - 30, width: 960, height: 58, rx: 18, style: 'fill:transparent;transition:fill .3s' });
    const t1 = s('text', { x: 28, y: y + 8, class: 'v-label sm', style: 'fill:var(--fg-3);font-weight:650;letter-spacing:.08em;text-transform:uppercase' }); t1.textContent = site2;
    const t2 = s('text', { x: 300, y: y + 10, class: 'v-label', style: 'fill:var(--fg)' }); t2.textContent = z;
    const t3 = s('text', { x: 590, y: y + 10, class: 'v-label', style: 'fill:var(--fg-3)' }); t3.textContent = '→';
    const t4 = s('text', { x: 640, y: y + 10, class: 'v-label', style: 'fill:var(--ink);font-weight:650' }); t4.textContent = a;
    g.append(bg, t1, t2, t3, t4);
    g.addEventListener('click', () => { sel = i; paintRows(); setName(); });
    D.layers.labels.append(g);
    return { g, bg };
  });
  D.text(28, 476, 'Click a pair', { style: 'font-size:22px;fill:var(--fg-3);font-style:italic' });
  function paintRows() { rows.forEach((r, i) => { r.bg.style.fill = i === sel ? 'color-mix(in oklab, var(--a1) 16%, transparent)' : 'transparent'; }); }
  function setName() {
    zName.textContent = cur >= 2 ? PAIRS[sel][2] : PAIRS[sel][1];
    const w = zName.getComputedTextLength ? zName.getComputedTextLength() : 300;
    zTag.setAttribute('transform', `translate(${w + 110} 38)`);
    zTag.querySelector('text').textContent = cur >= 2 ? 'ACTIVE' : 'INACTIVE';
    const col = cur >= 2 ? 'var(--act)' : 'var(--inh)';
    zTag.querySelector('text').style.fill = col;
    zTag.querySelector('rect').style.fill = `color-mix(in oklab, ${col} 18%, transparent)`;
    zTag.querySelector('rect').style.stroke = `color-mix(in oklab, ${col} 60%, transparent)`;
  }
  paintRows();
  function apply(n) {
    cur = n;
    setName();
    beads.forEach((b, i) => {
      let p;
      if (i < NP) p = n >= 1 ? peptAway[i] : chainPos[i];
      else p = n >= 2 ? fold[i - NP] : chainPos[i];
      gsap.to(b, { attr: { cx: p[0], cy: p[1] }, duration: 1.1, ease: 'power3.inOut', delay: i < NP ? 0 : (i - NP) * 0.02, onUpdate: redraw });
      if (i < NP) gsap.to(b, { opacity: n >= 1 ? 0.35 : 1, duration: 1 });
    });
    gsap.to(pepBond, { opacity: n >= 1 ? 0.3 : 1, duration: 0.8 });
    gsap.to([cut, sc], { opacity: n === 1 ? 1 : n === 0 ? 0.9 : 0, duration: 0.5 });
    if (n === 1) gsap.fromTo(sc, { rotation: 0 }, { rotation: 0, duration: 0.01 });
    gsap.to(pepLbl, { attr: { x: n >= 1 ? 140 : 150, y: n >= 1 ? 128 : 214 }, opacity: n >= 2 ? 0.4 : 1, duration: 1 });
    gsap.to(site, { opacity: n >= 2 ? 0.55 : 0, duration: 0.8, delay: n >= 2 ? 0.8 : 0 });
    gsap.to([lockG, irr], { opacity: n >= 2 ? 1 : 0, duration: 0.6, delay: n >= 2 ? 0.9 : 0 });
    setTimeout(redraw, 1200);
  }
  apply(0);
  return { step: apply, destroy: () => D.destroy() };
}

/* ------------------------------------------------------------------ */
/* 20 · Compartmentalization (3D cell)                                  */
/* ------------------------------------------------------------------ */
function compartViz(el) {
  const sc = cellScene(el, { autoRotate: 0.3 });
  const lyMat = glossy(0x30d158, { emissive: 0x0a3a14 });
  const lys = [[-3.5, 1.4, 2.4], [0.6, -3.8, 2.2], [-0.4, 3.6, 2.6]].map((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), lyMat); m.position.set(...p); sc.group.add(m); return m; });
  const L = (html, pos, tp, cls = 'sm') => sc.kit.label(html, pos, { cls, tip: tp });
  const mito = L('Mitochondria', [2.8, -2.6, 1.4], { title: 'Mitochondria', list: ['TCA cycle', 'Fatty acid oxidation', 'Oxidation of pyruvate'], src: SRC(25) });
  const cyto = L('Cytosol', [-3.4, -4.3, 2.8], { title: 'Cytosol', list: ['Glycolysis', 'Pentose phosphate pathway', 'Fatty acid synthesis'], src: SRC(25) });
  const nucl = L('Nucleus', [-1.6, 2.7, -1.2], { title: 'Nucleus', list: ['DNA and RNA synthesis'], src: SRC(25) });
  const lyso = L('Lysosome', [-3.5, 2.3, 2.4], { title: 'Lysosome', list: ['Degradation of complex macromolecules'], src: SRC(25) });
  return {
    ...sc,
    step(n) {
      const on = n >= 1;
      mito.element.innerHTML = on ? 'Mitochondria · <b style="color:var(--prot)">FA oxidation</b>' : 'Mitochondria';
      cyto.element.innerHTML = on ? 'Cytosol · <b style="color:var(--act)">FA synthesis</b>' : 'Cytosol';
      [mito, cyto].forEach((l) => l.element.classList.toggle('acc', on));
      [nucl, lyso].forEach((l) => { l.element.style.opacity = on ? 0.35 : 1; });
      lys.forEach((m) => { m.visible = true; });
    },
  };
}

/* ------------------------------------------------------------------ */
/* 21 · Induction & repression                                          */
/* ------------------------------------------------------------------ */
function inductionViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 20, y: 120, w: 920, h: 620, r: 80, label: 'Hepatocyte', fill: 'color-mix(in oklab, var(--prot) 6%, transparent)', stroke: 'color-mix(in oklab, var(--prot) 45%, transparent)', lx: 60, ly: 66, labelColor: 'var(--prot)' });
  const nuc = s('circle', { cx: 230, cy: 450, r: 150, style: 'fill:color-mix(in oklab, var(--a1) 12%, transparent);stroke:color-mix(in oklab, var(--a1) 60%, transparent);stroke-width:3' });
  D.layers.regions.append(nuc);
  D.text(230, 352, 'Nucleus', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--ink)' });
  let d1 = '', d2 = '';
  for (let x = 120; x <= 340; x += 4) { d1 += `${x === 120 ? 'M' : 'L'}${x},${436 + Math.sin((x - 120) / 16) * 18}`; d2 += `${x === 120 ? 'M' : 'L'}${x},${436 - Math.sin((x - 120) / 16) * 18}`; }
  const gene = s('g');
  gene.append(s('path', { d: d1, style: 'fill:none;stroke:var(--a1);stroke-width:5' }), s('path', { d: d2, style: 'fill:none;stroke:var(--a2);stroke-width:5' }));
  D.layers.nodes.append(gene);
  D.text(230, 500, 'Glycolytic enzyme genes', { anchor: 'middle', style: 'font-size:22px;font-weight:600;fill:var(--fg-2)' });
  // hormone + receptor
  D.layers.nodes.append(s('rect', { x: 400, y: 100, width: 60, height: 40, rx: 12, style: 'fill:var(--surface-3);stroke:var(--line-2);stroke-width:2' }));
  const hormone = D.badge(430, 56, 'Insulin', { color: 'var(--act)', size: 28, w: 190 });
  const sig = D.arrow({ d: 'M430,146 C430,250 360,300 310,326', from: [430, 146], to: [310, 326], color: 'var(--act)', width: 4, dash: '10 9' });
  const sigB = D.badge(290, 244, '↑ synthesis', { color: 'var(--act)', size: 22, w: 160 });
  // mRNA flow
  const mrna = s('path', { d: 'M380,450 C450,450 470,450 520,450', style: 'fill:none;stroke:none' });
  D.layers.fx.append(mrna);
  const fl = { cur: D.flow(mrna, { count: 4, color: 'var(--a2)', speed: 120, r: 8, autoplay: false }) };
  D.text(452, 425, 'mRNA', { anchor: 'middle', style: 'font-size:22px;fill:var(--a2);font-weight:650' });
  // enzyme field
  D.text(705, 236, 'Glycolytic enzymes', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--fg-2)' });
  const slots = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) slots.push([575 + c * 88 + (r % 2) * 18, 300 + r * 92]);
  const order = [5, 10, 0, 15, 6, 9, 3, 12, 1, 14, 2, 13, 4, 11, 7, 8];
  const enz = slots.map(([x, y]) => {
    const g = s('g', { transform: `translate(${x} ${y})` });
    const inner = s('g');
    inner.append(s('path', { d: 'M0,0 L30,-17 A34,34 0 1 0 30,17 Z', style: 'fill:var(--a1);opacity:.9' }));
    g.append(inner);
    D.layers.nodes.append(g);
    return inner;
  });
  const out = D.text(480, 800, '', { anchor: 'middle', style: 'font-size:30px;font-weight:650' });
  const LT = D.badge(800, 690, '⏱ Long-term', { color: 'var(--atp)', size: 22, w: 190, tip: { title: 'Long-term regulation', body: 'Induction and repression change the <b>amount</b> of enzyme by altering gene expression — slow compared with the rapid switch of covalent modification.', src: SRC(26) } });
  let live = false, curN = -1;
  function apply(n) {
    if (n === curN) return;
    curN = n;
    const fed = n === 0;
    const col = fed ? 'var(--act)' : 'var(--inh)';
    hormone.querySelector('text').textContent = fed ? 'Insulin' : 'Glucagon';
    hormone.querySelector('text').style.fill = col;
    hormone.querySelector('rect').style.fill = `color-mix(in oklab, ${col} 18%, transparent)`;
    hormone.querySelector('rect').style.stroke = `color-mix(in oklab, ${col} 60%, transparent)`;
    sig.path.style.stroke = col; sig.head.style.fill = col; sig.head.style.stroke = col;
    sigB.querySelector('text').textContent = fed ? '↑ synthesis' : '↓ synthesis';
    sigB.querySelector('text').style.fill = col;
    sigB.querySelector('rect').style.stroke = `color-mix(in oklab, ${col} 60%, transparent)`;
    sigB.querySelector('rect').style.fill = `color-mix(in oklab, ${col} 18%, transparent)`;
    const want = fed ? 16 : 5;
    order.forEach((idx, k) => gsap.to(enz[idx], { scale: k < want ? 1 : 0, opacity: k < want ? 1 : 0, transformOrigin: '50% 50%', duration: 0.6, delay: k * 0.04, ease: k < want ? 'back.out(2)' : 'power2.in' }));
    fl.cur.destroy();
    fl.cur = D.flow(mrna, { count: fed ? 4 : 1, color: 'var(--a2)', speed: fed ? 120 : 60, r: 8, autoplay: live });
    out.textContent = fed ? 'Fed: more enzyme → ↑ glucose utilization' : 'Fasting: less enzyme → glucose spared for other tissues';
    out.style.fill = col;
  }
  const sg = seg({ options: [{ v: 0, t: 'Fed' }, { v: 1, t: 'Fasting' }], value: 0, onChange: (v) => apply(v) });
  ctrlBar(el, [sg], { right: 0, top: 0 });
  apply(0);
  return {
    enter() { live = true; fl.cur.play(); },
    leave() { live = false; fl.cur.pause(); },
    step(n) { sg.set(n, false); apply(n); },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 22 · Reversible covalent modification                                */
/* ------------------------------------------------------------------ */
function covalentViz(el) {
  const D = diagram(el, 1712, 720);
  D.region({ x: 0, y: 0, w: 780, h: 720, r: 36, label: 'Phosphorylation cycle' });
  D.region({ x: 830, y: 0, w: 882, h: 720, r: 36, label: 'Glycogen enzymes' });
  D.node({ id: 'oh', x: 160, y: 400, label: 'Enzyme–OH', kind: 'mol', size: 30 });
  const op = D.node({ id: 'op', x: 612, y: 400, label: 'Enzyme–OPO_{3}^{2−}', kind: 'mol', size: 30, color: SUIC });
  const kin = D.arrow({ d: 'M230,350 C290,170 480,170 552,350', from: [230, 350], to: [552, 350], color: 'var(--prot)', width: 5 });
  const pho = D.arrow({ d: 'M552,452 C480,632 290,632 230,452', from: [552, 452], to: [230, 452], color: 'var(--act)', width: 5 });
  D.node({ x: 391, y: 140, label: 'Protein kinase', kind: 'enz', size: 27, color: 'var(--prot)', tip: { title: 'Protein kinases', body: 'Add phosphate groups using ATP.', src: SRC(27) } });
  D.text(391, 276, 'ATP → ADP', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--atp)' });
  D.node({ x: 391, y: 666, label: 'Phosphoprotein phosphatase', kind: 'enz', size: 26, color: 'var(--act)', tip: { title: 'Protein phosphatases', body: 'Remove phosphate groups (hydrolysis).', src: SRC(27) } });
  D.text(391, 524, 'H_{2}O → HPO_{4}^{2−}', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--fg-2)' });
  const fK = D.flow(kin, { count: 2, color: 'var(--prot)', speed: 140, r: 9, autoplay: false });
  const fP = D.flow(pho, { count: 2, color: 'var(--act)', speed: 140, r: 9, autoplay: false });
  // glycogen enzymes
  const ROWS = [
    { y: 230, name: 'Glycogen synthase', L: ['Synthase a', 'dephosphorylated', 'ACTIVE', 'var(--act)'], R: ['Synthase b', 'phosphorylated', 'INACTIVE', 'var(--inh)'], out: 'Glycogen synthesis ↑', outOn: 'L', tip: { title: 'Glycogen synthase', body: 'Active form <b>a</b> is dephosphorylated; phosphorylation (protein kinase) inactivates it → <b>b</b>. Insulin favours the active form: [textbook] it activates protein phosphatase-1, which dephosphorylates the synthase.', src: `${SRC(28)} · Lippincott` } },
    { y: 520, name: 'Glycogen phosphorylase', L: ['Phosphorylase b', 'dephosphorylated', 'INACTIVE', 'var(--inh)'], R: ['Phosphorylase a', 'phosphorylated', 'ACTIVE', 'var(--act)'], out: 'Glycogen breakdown ↑', outOn: 'R', tip: { title: 'Glycogen phosphorylase', body: 'Active form <b>a</b> is phosphorylated (by phosphorylase kinase); phosphorylase phosphatase inactivates it → <b>b</b>. Glucagon and epinephrine favour the active form ([textbook] via cAMP → protein kinase A → phosphorylase kinase).', src: `${SRC(28)} · Lippincott` } },
  ];
  const LX = 1085, RX = 1475;
  const rowEls = ROWS.map((r) => {
    const nm = D.text(870, r.y - 70, r.name, { style: 'font-size:30px;font-weight:700;fill:var(--fg)', tip: r.tip });
    const mk = (x, d, phos) => {
      const n = D.node({ x, y: r.y, label: d[0], sub: d[1], kind: 'box', w: 300, h: 100, size: 28, color: d[3] });
      if (phos) [0, 1].forEach((i) => { const b = s('g', { transform: `translate(${130 - i * 40} -50)` }); b.append(s('circle', { r: 17, style: `fill:${SUIC}` })); const t = s('text', { y: 7, 'text-anchor': 'middle', style: 'font:800 19px var(--font);fill:var(--bg)' }); t.textContent = 'P'; b.append(t); n.g.append(b); });
      const st = D.text(x, r.y + 86, d[2], { anchor: 'middle', style: `font-size:22px;font-weight:760;letter-spacing:.14em;fill:${d[3]}` });
      return { n, st };
    };
    const a = mk(LX, r.L, false), b = mk(RX, r.R, true);
    D.arrow({ from: [LX + 160, r.y - 18], to: [RX - 160, r.y - 18], width: 3, color: 'var(--prot)', headSize: 14 });
    D.arrow({ from: [RX - 160, r.y + 18], to: [LX + 160, r.y + 18], width: 3, color: 'var(--act)', headSize: 14 });
    const ring = s('rect', { x: -162, y: -62, width: 324, height: 124, rx: 30, style: 'fill:none;stroke:var(--ink);stroke-width:4;opacity:0', filter: `url(#${D.glowId})` });
    ring.setAttribute('transform', `translate(${LX} ${r.y})`);
    D.layers.labels.append(ring);
    const out = D.badge(1280, r.y + 142, r.out, { color: 'var(--act)', size: 24, w: 300 });
    return { a, b, ring, out, r, nm };
  });
  let live = false;
  function apply(n) {
    const hm = n === 1 ? 'ins' : n === 2 ? 'glu' : null;
    rowEls.forEach(({ ring, out, r }) => {
      const side = hm === 'ins' ? 'L' : 'R';
      gsap.to(ring, { opacity: hm ? 1 : 0, duration: 0.4 });
      if (hm) gsap.to(ring, { attr: { transform: `translate(${side === 'L' ? LX : RX} ${r.y})` }, duration: 0.7, ease: 'power3.inOut' });
      const active = hm && side === r.outOn;
      gsap.to(out, { opacity: active ? 1 : 0.22, duration: 0.5 });
    });
    gsap.to(kin.g, { opacity: hm === 'ins' ? 0.3 : 1, duration: 0.5 });
    gsap.to(pho.g, { opacity: hm === 'glu' ? 0.3 : 1, duration: 0.5 });
    if (live) { hm === 'ins' ? fK.hide() : fK.play(); hm === 'glu' ? fP.hide() : fP.play(); }
  }
  let curN = 0;
  const sg = seg({ options: [{ v: 1, t: 'Insulin' }, { v: 2, t: 'Glucagon · epinephrine' }], value: 1, onChange: (v) => { curN = v; apply(v); } });
  sg.set('none', false);
  ctrlBar(el, [sg], { right: 22, top: 16 });
  apply(0);
  return {
    enter() { live = true; apply(curN); },
    leave() { live = false; fK.pause(); fP.pause(); },
    step(n) { curN = n; sg.set(n || 'none', false); apply(n); },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 24 · Plasma enzymes: how injured cells leak                          */
/* ------------------------------------------------------------------ */
function leakViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 0, y: 100, w: 960, h: 150, r: 75, fill: 'color-mix(in oklab, var(--inh) 9%, transparent)', stroke: 'color-mix(in oklab, var(--inh) 40%, transparent)' });
  D.text(20, 76, 'Capillary · plasma', { style: 'font-size:24px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;fill:var(--inh)' });
  D.text(34, 330, 'Tissue cells', { style: 'font-size:24px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;fill:var(--fg-2)' });
  const CX = [110, 300, 490, 680, 870];
  const DAMAGED = [1, 2, 3];
  const cells = CX.map((x, i) => {
    const g = s('g', { transform: `translate(${x} 560)` });
    const body = s('rect', { x: -82, y: -110, width: 164, height: 220, rx: 46, style: 'fill:color-mix(in oklab, var(--a2) 14%, transparent);stroke:color-mix(in oklab, var(--a2) 55%, transparent);stroke-width:3;transition:all .6s' });
    g.append(body);
    g.append(s('circle', { cx: 0, cy: 30, r: 28, style: 'fill:color-mix(in oklab, var(--a1) 30%, transparent)' }));
    const dots = s('g');
    [[-40, -60], [10, -74], [44, -40], [-50, -14], [30, -10], [-30, 80], [46, 70], [-6, -36]].forEach(([dx, dy]) => dots.append(s('circle', { cx: dx, cy: dy, r: 9, style: 'fill:var(--atp)' })));
    g.append(dots);
    D.layers.nodes.append(g);
    return { g, body, dots, x, dmg: DAMAGED.includes(i) };
  });
  const fx = D.layers.fx;
  const mBg = s('rect', { x: 0, y: 770, width: 960, height: 36, rx: 18, style: 'fill:var(--surface-2);stroke:var(--line);stroke-width:2' });
  const mFill = s('rect', { x: 4, y: 774, width: 0, height: 28, rx: 14, style: 'fill:var(--atp)' });
  D.layers.labels.append(mBg, mFill);
  const mT = D.text(0, 750, 'Plasma enzyme activity', { style: 'font-size:26px;font-weight:650;fill:var(--fg-2)' });
  const mV = D.text(960, 750, 'Low', { anchor: 'end', style: 'font-size:26px;font-weight:700;fill:var(--act)' });
  let necro = false, raf = 0, last = 0, acc = 0;
  const plasma = [], moving = [];
  const spawn = (cell) => {
    const c = s('circle', { r: 9, style: 'fill:var(--atp)' });
    fx.append(c);
    moving.push({ c, x0: cell.x + (Math.random() - 0.5) * 60, y0: 460, x1: cell.x + 40 + Math.random() * 60, y1: 130 + Math.random() * 90, t: 0 });
  };
  const tick = (now) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    acc += dt;
    const every = necro ? 0.04 : 1.3;
    while (acc > every) { acc -= every; const pool = necro ? cells.filter((c) => c.dmg) : cells; spawn(pool[Math.floor(Math.random() * pool.length)]); }
    for (let i = moving.length - 1; i >= 0; i--) {
      const m = moving[i];
      m.t += dt / 1.3;
      const e = 1 - Math.pow(1 - Math.min(1, m.t), 3);
      m.c.setAttribute('cx', m.x0 + (m.x1 - m.x0) * e);
      m.c.setAttribute('cy', m.y0 + (m.y1 - m.y0) * e);
      if (m.t >= 1) { moving.splice(i, 1); plasma.push({ c: m.c, x: m.x1, y: m.y1, v: 60 + Math.random() * 40 }); }
    }
    const cap = necro ? 70 : 7;
    while (plasma.length > cap) { const p = plasma.shift(); gsap.to(p.c, { opacity: 0, duration: 0.6, onComplete: () => p.c.remove() }); }
    plasma.forEach((p) => { p.x += p.v * dt; if (p.x > 950) p.x = 10; p.c.setAttribute('cx', p.x); p.c.setAttribute('cy', p.y); });
    const lvl = Math.min(1, (plasma.length + moving.length * 0.6) / 70);
    mFill.setAttribute('width', Math.max(10, 952 * lvl));
    raf = requestAnimationFrame(tick);
  };
  function apply(n) {
    necro = n >= 1;
    cells.forEach((c) => {
      const d = necro && c.dmg;
      c.body.style.strokeDasharray = d ? '14 12' : '';
      c.body.style.fill = d ? 'color-mix(in oklab, var(--inh) 16%, transparent)' : 'color-mix(in oklab, var(--a2) 14%, transparent)';
      c.body.style.stroke = d ? 'var(--inh)' : 'color-mix(in oklab, var(--a2) 55%, transparent)';
      gsap.to(c.dots, { opacity: d ? 0.35 : 1, duration: 0.8 });
    });
    mV.textContent = necro ? 'High' : 'Low';
    mV.style.fill = necro ? 'var(--inh)' : 'var(--act)';
  }
  const sg = seg({ options: [{ v: 0, t: 'Normal turnover' }, { v: 1, t: 'Cell necrosis' }], value: 0, onChange: (v) => apply(v) });
  ctrlBar(el, [sg], { right: 0, top: 0 });
  apply(0);
  return {
    enter() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(tick); },
    leave() { cancelAnimationFrame(raf); },
    step(n) { sg.set(n, false); apply(n); },
    destroy() { cancelAnimationFrame(raf); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 25 · Plasma enzyme organ map (showpiece)                             */
/* ------------------------------------------------------------------ */
const ENZ = [
  { id: 'ALT', ab: 'ALT', name: 'Alanine aminotransferase', src: 'Liver', sig: 'Liver damage or disease', org: ['liver'] },
  { id: 'AST', ab: 'AST', name: 'Aspartate aminotransferase', src: 'Liver & muscle', sig: 'Liver & muscle diseases', org: ['liver', 'muscle'], extra: '[textbook] AST is also abundant in heart and RBCs.' },
  { id: 'ALP', ab: 'ALP', name: 'Alkaline phosphatase', src: 'Liver, bile ducts & bone', sig: 'Liver & bone diseases', org: ['liver', 'bile', 'bone'] },
  { id: 'GGT', ab: 'GGT', name: 'γ-Glutamyl transferase', src: 'Liver & bile ducts', sig: 'Hepatobiliary disease (obstructive jaundice)', org: ['liver', 'bile'] },
  { id: 'NT', ab: '5′-NT', name: '5′-Nucleotidase', src: 'Liver', sig: 'Hepatobiliary disease (obstructive jaundice)', org: ['liver', 'bile'] },
  { id: 'AML', ab: 'Amylase<br>Lipase', name: 'Amylase and lipase', src: 'Pancreas', sig: 'Pancreatic diseases', org: ['pancreas'], extra: '[textbook] Lipase is the more pancreas-specific; amylase also comes from salivary glands.', small: true },
  { id: 'CK', ab: 'CK', name: 'Creatine kinase', src: 'Muscle', sig: 'Muscle damage or injury', org: ['muscle'] },
  { id: 'LDH', ab: 'LDH', name: 'Lactate dehydrogenase', src: 'RBCs, liver, muscle — most cells', sig: 'General marker of cell death; especially hemolysis, hepatic or muscle diseases', org: ['rbc', 'liver', 'muscle'] },
];
const ORGANS = {
  liver: { name: 'Liver', strong: ['ALT'], weak: ['AST', 'ALP', 'LDH', 'GGT', 'NT'], text: '<b>ALT</b> points to the liver (liver damage or disease). AST, ALP and LDH also rise in liver disease.' },
  bile: { name: 'Bile ducts', strong: ['GGT', 'NT', 'ALP'], weak: [], text: '<b>GGT</b> and <b>5′-NT</b> (with <b>ALP</b>): hepatobiliary disease — obstructive jaundice.' },
  bone: { name: 'Bone', strong: ['ALP'], weak: [], text: '<b>ALP</b> — its sources include bone: liver & bone diseases.' },
  pancreas: { name: 'Pancreas', strong: ['AML'], weak: [], text: '<b>Amylase and lipase</b>: pancreatic diseases (e.g. acute pancreatitis).', note: '[textbook] Lipase is the more specific marker.' },
  muscle: { name: 'Muscle', strong: ['CK'], weak: ['AST', 'LDH'], text: '<b>CK</b>: muscle damage or injury. AST and LDH also come from muscle.' },
  rbc: { name: 'Red blood cells', strong: ['LDH'], weak: [], text: '<b>LDH</b>: general marker of cell death — particularly <b>hemolysis</b>.' },
  heart: { name: 'Heart', strong: [], weak: ['CK', 'AST', 'LDH'], text: 'Not separated in this lecture — heart is muscle tissue.', note: '[textbook] Cardiac muscle injury also releases CK, AST and LDH.' },
};
function organMapViz(el) {
  const EH = el.clientHeight || 726;
  // body
  const bodyHost = h('div', { style: 'position:absolute;left:0;top:0;width:640px;bottom:0' });
  el.append(bodyHost);
  const D = diagram(bodyHost, 640, 726);
  D.svg.style.height = '100%';
  const skin = 'color-mix(in oklab, var(--fg) 17%, var(--bg))';
  const B = s('g', { transform: 'translate(10 4)' });
  D.layers.regions.append(B);
  B.append(s('circle', { cx: 280, cy: 62, r: 46, style: `fill:${skin}` }));
  B.append(s('rect', { x: 262, y: 100, width: 36, height: 40, rx: 10, style: `fill:${skin}` }));
  ['M190,166 C150,240 140,330 132,440', 'M370,166 C410,240 420,330 428,440'].forEach((d) => B.append(s('path', { d, style: `fill:none;stroke:${skin};stroke-width:44;stroke-linecap:round` })));
  ['M238,430 C234,520 230,610 228,700', 'M322,430 C326,520 330,610 332,700'].forEach((d) => B.append(s('path', { d, style: `fill:none;stroke:${skin};stroke-width:66;stroke-linecap:round` })));
  B.append(s('path', { d: 'M196,146 C232,134 328,134 364,146 C386,154 394,174 394,200 L390,300 C388,360 376,410 364,446 L196,446 C184,410 172,360 170,300 L166,200 C166,174 174,154 196,146 Z', style: `fill:${skin}` }));
  const OG = {};
  const organ = (id, els, lbl) => {
    const g = s('g', { style: 'cursor:pointer;transition:opacity .4s' });
    els.forEach((e) => g.append(e));
    B.append(g);
    g.addEventListener('click', () => select(id));
    OG[id] = { g, lbl };
    return g;
  };
  const sty = (c) => `fill:${c};stroke:color-mix(in oklab, ${c} 60%, var(--fg));stroke-width:2`;
  organ('heart', [s('path', { d: 'M320,240 C298,226 286,214 286,200 C286,188 296,180 306,180 C313,180 318,184 320,190 C322,184 327,180 334,180 C344,180 354,188 354,200 C354,214 342,226 320,240 Z', style: sty('#e5484d') })]);
  organ('liver', [s('path', { d: 'M180,266 C214,248 290,246 318,258 C328,264 322,276 306,284 C270,302 220,314 196,308 C180,302 174,284 180,266 Z', style: sty('#b5523b') })]);
  organ('bile', [s('path', { d: 'M222,312 C214,326 220,340 232,340 C244,340 246,326 240,312 Z', style: sty('#3fae6a') }), s('path', { d: 'M236,316 C252,334 266,346 286,356', style: 'fill:none;stroke:#3fae6a;stroke-width:6;stroke-linecap:round' })]);
  organ('pancreas', [s('path', { d: 'M266,352 C294,340 344,338 370,346 C378,352 372,362 356,364 C324,370 294,370 270,368 C258,366 256,358 266,352 Z', style: sty('#e0a458') })]);
  organ('muscle', [s('ellipse', { cx: 236, cy: 530, rx: 26, ry: 74, style: sty('#d4646a') }), s('ellipse', { cx: 150, cy: 290, rx: 18, ry: 50, transform: 'rotate(12 150 290)', style: sty('#d4646a') })]);
  organ('bone', [s('path', { d: 'M326,462 L332,660', style: 'stroke:#d9d2bf;stroke-width:16;stroke-linecap:round' }), s('circle', { cx: 326, cy: 462, r: 13, style: 'fill:#d9d2bf' }), s('circle', { cx: 332, cy: 660, r: 13, style: 'fill:#d9d2bf' }), s('path', { d: 'M326,462 L332,660', style: 'stroke:color-mix(in oklab, var(--fg) 30%, transparent);stroke-width:2;fill:none' })]);
  organ('rbc', [s('circle', { cx: 486, cy: 470, r: 34, style: sty('#e5484d') }), s('circle', { cx: 486, cy: 470, r: 14, style: 'fill:color-mix(in oklab, #e5484d 55%, var(--bg))' })]);
  // labels with leader lines
  const LBL = [['liver', 'Liver', 10, 250, 196, 276], ['bile', 'Bile ducts', 10, 380, 232, 334], ['muscle', 'Muscle', 10, 560, 222, 540], ['heart', 'Heart', 450, 170, 352, 200], ['pancreas', 'Pancreas', 450, 330, 376, 352], ['bone', 'Bone', 450, 590, 342, 590], ['rbc', 'RBCs', 450, 540, 486, 506]];
  LBL.forEach(([id, t, x, y, px, py]) => {
    const g = s('g', { style: 'cursor:pointer' });
    const w = t.length * 15 + 34;
    g.append(s('path', { d: `M${px + 10},${py + 4} L${x + (x < 200 ? w : 0) + 10},${y + 4}`, style: 'stroke:var(--fg-3);stroke-width:2' }));
    const r = s('rect', { x: x + 10, y: y - 20, width: w, height: 46, rx: 23, style: 'fill:var(--bg-2);stroke:var(--line-2);stroke-width:2;transition:all .3s' });
    const tx = s('text', { x: x + 10 + w / 2, y: y + 12, 'text-anchor': 'middle', class: 'v-label sm', style: 'font-weight:650' });
    tx.textContent = t;
    g.append(r, tx);
    g.addEventListener('click', () => select(id));
    D.layers.labels.append(g);
    OG[id].lbl = { r, tx };
  });
  // enzyme tiles
  const grid = h('div', { style: 'position:absolute;left:670px;right:0;top:0;display:grid;grid-template-columns:repeat(4,1fr);gap:18px' });
  el.append(grid);
  const tiles = {};
  ENZ.forEach((e) => {
    const t = h('div', { style: 'height:148px;border-radius:26px;padding:20px 22px;background:var(--surface);border:1.5px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;transition:all .4s var(--ease)' }, [
      h('div', { style: `font:740 ${e.small ? 30 : 44}px var(--font);letter-spacing:-.02em;line-height:${e.small ? 1.05 : 1}`, html: e.ab }),
      h('div', { style: 'font-size:20px;line-height:1.25;color:var(--fg-2)', html: e.src }),
    ]);
    tip(t, { kicker: e.src, title: e.name, body: `${e.sig}.${e.extra ? `<br><span style="color:var(--fg-3)">${e.extra}</span>` : ''}`, src: SRC(e.id === 'CK' || e.id === 'LDH' || e.id === 'AML' ? 33 : 32) });
    t.addEventListener('click', () => selectEnz(e));
    grid.append(t);
    tiles[e.id] = t;
  });
  // info panel
  const infoT = h('div', { style: 'font-size:46px;font-weight:720;letter-spacing:-.02em' });
  const infoChips = h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;min-height:44px' });
  const infoB = h('div', { style: 'font-size:30px;line-height:1.35;color:var(--fg-2);max-width:1040px' });
  const infoN = h('div', { style: 'font-size:23px;color:var(--fg-3);margin-top:auto' });
  const info = h('div', { style: 'position:absolute;left:670px;right:0;top:350px;bottom:0;border-radius:32px;padding:30px 36px;background:var(--surface);border:1px solid var(--line);display:flex;flex-direction:column;gap:14px' }, [infoT, infoChips, infoB, infoN]);
  el.append(info);
  const paintTiles = (strong, weak) => {
    ENZ.forEach((e) => {
      const t = tiles[e.id];
      const st = strong.includes(e.id), wk = weak.includes(e.id), none = !strong.length && !weak.length;
      t.style.background = st ? 'color-mix(in oklab, var(--a1) 24%, transparent)' : 'var(--surface)';
      t.style.borderColor = st ? 'var(--a1)' : wk ? 'color-mix(in oklab, var(--a1) 55%, transparent)' : 'var(--line)';
      t.style.boxShadow = st ? '0 0 34px color-mix(in oklab, var(--a1) 40%, transparent)' : 'none';
      t.style.opacity = none || st || wk ? 1 : 0.3;
      t.style.transform = st ? 'translateY(-4px)' : '';
    });
  };
  const paintOrgans = (ids) => {
    Object.entries(OG).forEach(([id, o]) => {
      const on = ids.includes(id), none = !ids.length;
      o.g.style.opacity = none || on ? 1 : 0.35;
      o.g.style.filter = on ? `drop-shadow(0 0 12px color-mix(in oklab, var(--a1) 80%, transparent))` : '';
      o.lbl.r.style.stroke = on ? 'var(--a1)' : 'var(--line-2)';
      o.lbl.r.style.fill = on ? 'color-mix(in oklab, var(--a1) 22%, var(--bg-2))' : 'var(--bg-2)';
    });
  };
  function select(id) {
    const o = ORGANS[id];
    paintOrgans([id]);
    paintTiles(o.strong, o.weak);
    infoT.textContent = o.name;
    infoChips.innerHTML = '';
    [...o.strong.map((x) => [x, true]), ...o.weak.map((x) => [x, false])].forEach(([x, st]) => infoChips.append(h('span', { style: `font-size:24px;font-weight:700;padding:8px 18px;border-radius:999px;${st ? 'background:var(--a1);color:#fff' : 'border:1.5px solid color-mix(in oklab, var(--a1) 55%, transparent);color:var(--ink)'}`, html: `↑ ${ENZ.find((e) => e.id === x).ab.replace('<br>', ' · ')}` })));
    infoB.innerHTML = o.text;
    infoN.innerHTML = `${o.note ? `${o.note} · ` : ''}Lecture slides 32–33`;
  }
  function selectEnz(e) {
    paintOrgans(e.org);
    paintTiles([e.id], []);
    infoT.textContent = e.name;
    infoChips.innerHTML = '';
    e.org.forEach((id) => infoChips.append(h('span', { style: 'font-size:24px;font-weight:700;padding:8px 18px;border-radius:999px;border:1.5px solid color-mix(in oklab, var(--a1) 55%, transparent);color:var(--ink)', text: ORGANS[id].name })));
    infoB.innerHTML = `${e.sig}.`;
    infoN.innerHTML = `${e.extra ? `${e.extra} · ` : ''}Source: ${e.src}`;
  }
  function overview() {
    paintOrgans([]); paintTiles([], []);
    infoT.textContent = 'Which tissue is injured?';
    infoChips.innerHTML = '';
    infoB.innerHTML = 'Click an <b>organ</b> to see which plasma enzymes rise — or an <b>enzyme</b> to see where it comes from.';
    infoN.textContent = 'Pattern + degree of elevation → affected tissue';
  }
  overview();
  const SEQ = [null, 'liver', 'bile', 'bone', 'pancreas', 'muscle', 'rbc'];
  return {
    step(n) { SEQ[n] ? select(SEQ[n]) : overview(); },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 23 · Regulation learning checks (custom match card)                  */
/* ------------------------------------------------------------------ */
function matchCard() {
  const rows = [['Trypsinogen → trypsin', 'Proteolytic activation', 3], ['FA synthesis in cytosol; oxidation in mitochondria', 'Compartmentalization', 1], ['Insulin increases glucokinase synthesis', 'Enzyme induction', 2]];
  const opts = h('div', { style: 'font-size:22px;color:var(--fg-3);line-height:1.5;margin-bottom:6px', html: '1. Compartmentalization · 2. Enzyme induction · 3. Proteolytic activation' });
  const ans = [];
  const list = rows.map(([q, a, num], i) => {
    const A = h('div', { style: 'font-size:24px;font-weight:700;color:var(--act);margin-top:6px;opacity:0', text: `→ ${num}. ${a}` });
    ans.push(A);
    return h('div', { style: 'padding:12px 16px;border-radius:16px;background:var(--surface);border:1px solid var(--line)' }, [h('div', { style: 'font-size:25px;line-height:1.28', html: `<b style="color:var(--ink)">${'ABC'[i]}.</b> ${q}` }), A]);
  });
  const el = h('div.card', { style: 'padding:30px 34px 32px;gap:12px;justify-content:flex-start' }, [h('div.k', { text: 'Match the following' }), h('div', { style: 'font-size:29px;font-weight:620;line-height:1.3;margin:4px 0 4px', text: 'Which regulatory mechanism?' }), opts, ...list, h('div.glow')]);
  return { el, reveal(on) { ans.forEach((a, i) => gsap.to(a, { opacity: on ? 1 : 0, duration: 0.5, delay: on ? i * 0.15 : 0 })); } };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                 */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry, 8th/9th ed., Ch 5 — Enzymes',
    'Lecture slides: Enzyme inhibition &amp; regulation (L.8–L.9), Dr Gulam Saidunnisa, NUST',
  ],
  slides: [
    /* 1 */ {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.8 – L.9',
      title: 'Enzyme<br>Inhibition &amp;<br><em>Regulation</em>',
      subtitle: 'Switching enzymes off — and on.',
      meta: ['Dr. Gulam Saidunnisa', 'Two sessions', '8 learning outcomes'],
      notes: [
        'Two sessions in one deck: Session A — enzyme inhibition (L.8.1–8.3); Session B — enzyme regulation and diagnostic plasma enzymes (L.9.1–9.5).',
        'The molecule is a real 3D structure of enalapril (PubChem coordinates) — the ACE inhibitor from today’s clinical case. Drag to rotate.',
        'Roadmap: case → three inhibition types → kinetics lab → drugs → allopurinol → checks → five regulation mechanisms → plasma enzymes.',
      ],
      visual: async (el) => {
        const sc = await moleculeScene(el, 'enalapril', { fill: 0.94, autoRotate: 1.2 });
        const box = new THREE.Box3().setFromObject(sc.mol);
        sc.kit.label('Enalapril · ACE inhibitor', [0, box.min.y - 1.6, 0], { cls: 'acc' });
        return sc;
      },
    },
    /* 2 */ {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      cards: [
        { big: '01', k: 'L.8.1 · Inhibition', title: 'Classify inhibition types', tip: { title: 'L.8.1', body: 'Classify the selected types of enzyme inhibition.', src: SRC(2) } },
        { big: '02', k: 'L.8.2 · Inhibition', title: 'Compare their kinetics', tip: { title: 'L.8.2', body: 'Compare their effects on enzyme kinetics.', src: SRC(2) } },
        { big: '03', k: 'L.8.3 · Inhibition', title: 'Link to drugs & clinic', tip: { title: 'L.8.3', body: 'Relate selected types of enzyme inhibition to relevant clinical and pharmacological examples.', src: SRC(2) } },
        { big: '04', k: 'L.9.1–9.2 · Regulation', title: 'Mechanisms · allosteric kinetics', tip: { title: 'L.9.1 · L.9.2', list: ['Describe the major mechanisms of enzyme regulation.', 'Explain allosteric regulation and the kinetics of allosteric enzymes.'], src: SRC(17) } },
        { big: '05', k: 'L.9.3–9.4 · Regulation', title: 'Feedback · cleavage · covalent', tip: { title: 'L.9.3 · L.9.4', list: ['Compare feedback inhibition with feed-forward activation.', 'Explain regulation by proteolytic cleavage, compartmentalization, induction or repression, and covalent modification.'], src: SRC(17) } },
        { big: '06', k: 'L.9.5 · Plasma enzymes', title: 'Read enzyme patterns', tip: { title: 'L.9.5', body: 'Interpret abnormal plasma enzyme patterns in relation to specific tissue injury.', src: SRC(17) } },
      ],
      notes: [
        'Hover a card for the verbatim SLO wording. Session A (L.8.x) is inhibition; Session B (L.9.x) is regulation and plasma enzymes.',
        'Cards 4 and 5 group two outcomes each to keep the slide uncluttered.',
      ],
    },
    /* 3 */ {
      layout: 'full',
      eyebrow: 'Clinical case',
      title: 'Lowering BP by <em>inhibiting</em> an enzyme',
      steps: 1,
      src: SRC(3),
      notes: [
        'Read the case: a 52-year-old man, repeated BP 160/98 mmHg, diagnosed with hypertension and started on enalapril, an ACE inhibitor.',
        'Press → : at follow-up his BP has fallen to 135/85 mmHg.',
        'Leave the three questions open — we answer them after the inhibition section (slide 14).',
      ],
      visual: caseIntroViz,
    },
    /* 4 */ {
      layout: 'cards',
      eyebrow: 'Enzyme inhibition',
      title: 'Three <em>selected</em> types',
      bullets: [{ t: 'Inhibitor = ↓ reaction rate', tip: { title: 'Definition', body: 'An inhibitor is a substance that decreases the rate of an enzyme-catalysed reaction.', src: SRC(4) } }],
      cards: [
        { k: 'Reversible · active site', title: 'Competitive', list: ['Substrate look-alike', '↑[S] overcomes it'], viz: (v) => typeMini(v, 'comp'), tip: { title: 'Competitive inhibition', body: 'Resembles the substrate and binds <b>reversibly</b> at the <b>active site</b> (E + I ⇌ EI). Increasing substrate concentration can overcome it.', src: SRC(5) } },
        { k: 'Reversible · other site', title: 'Noncompetitive', list: ['Binds the allosteric site', '↑[S] cannot overcome'], viz: (v) => typeMini(v, 'nonc'), tip: { title: 'Noncompetitive inhibition', body: 'Binds <b>reversibly</b> at an <b>allosteric site</b> (not the active site) and reduces activity. Substrate and inhibitor can bind together (ESI).', src: SRC(8) } },
        { k: 'Irreversible · active site', title: 'Suicide', list: ['Enzyme activates it', 'Permanently inactivated'], viz: (v) => typeMini(v, 'suic'), tip: { title: 'Suicide inhibition', body: 'The enzyme converts the inhibitor into a <b>reactive intermediate</b> that binds <b>irreversibly</b> and inactivates it — mechanism-based inhibition.', src: SRC(11) } },
      ],
      notes: [
        'Definition: an inhibitor decreases the rate of an enzyme-catalysed reaction.',
        'The lecture teaches three selected types only: competitive, noncompetitive and suicide (mechanism-based). (The slide joins them with arrows — that is layout only, not a sequence.)',
        'Where the inhibitor binds and whether the binding is reversible are the two questions that classify it.',
      ],
    },
    /* 5 */ {
      eyebrow: 'Competitive inhibition',
      title: 'Same <em>pocket</em>, wrong key',
      bullets: [
        { t: 'Looks like the <b>substrate</b>', tip: 'Competitive inhibitors resemble the substrate.' },
        { t: 'Binds the <b>active site</b> · reversibly', tip: { title: 'E + I ⇌ EI', body: 'Reversible binding at the active site forms an EI complex — while the inhibitor sits there, ES cannot form, so no product is made.', src: SRC(5) } },
        { t: '↑[S] <b>overcomes</b> it', tip: 'Increasing substrate concentration out-competes the inhibitor for the active site.' },
      ],
      steps: 2,
      src: SRC(5),
      notes: [
        'Build 0: normal catalysis, E + S ⇌ ES → E + P.',
        'Build 1: switch the inhibitor on — the look-alike occupies the active site (EI). Substrate bounces off; rate collapses.',
        'Build 2: excess substrate — because binding is reversible, substrate wins the site back most of the time and the rate returns toward Vmax.',
        'Toggles at the bottom let you replay any combination.',
      ],
      visual: (el) => bindingViz(el, 'comp'),
    },
    /* 6 */ {
      eyebrow: 'Noncompetitive inhibition',
      title: 'A <em>second</em> site',
      bullets: [
        { t: 'Binds the <b>allosteric site</b>', tip: { title: 'A different site', body: 'The inhibitor binds reversibly at an allosteric site — a site other than the active site. Substrate and inhibitor bind at the same time, giving ESI.', src: SRC(8) } },
        { t: 'Substrate still binds · <b>K<sub>m</sub> same</b>', tip: '“Substrate affinity unchanged (Km unchanged).”' },
        { t: '↑[S] <b>cannot</b> overcome it', tip: { title: 'Vmax decreased', body: 'Extra substrate cannot displace an inhibitor that is not in the active site, so the reaction rate stays reduced.<br><span style="color:var(--fg-3)">Not the same as an allosteric enzyme: noncompetitive inhibition does not make the curve sigmoidal.</span>', src: SRC('8, 14') } },
      ],
      steps: 2,
      src: SRC(8),
      notes: [
        'Build 1: the inhibitor docks at the allosteric (regulatory) site. The substrate still binds — affinity and Km unchanged — but catalysis fails: ESI makes no product.',
        'Build 2: flooding with substrate does not help — the inhibitor is not competing for the active site. Vmax is decreased.',
        'Caution: the slide calls this site “allosteric”. Do not confuse with allosteric enzymes, which give sigmoidal curves (a distractor in the slide 14 MCQ).',
      ],
      visual: (el) => bindingViz(el, 'nonc'),
    },
    /* 7 */ {
      layout: 'full',
      eyebrow: 'Kinetics lab',
      title: 'Read the <em>plots</em>',
      steps: 2,
      src: 'Lecture slides 6, 9 · after Lippincott Figs 5.12 & 5.14 · values illustrative',
      notes: [
        'Build 0: no inhibitor — a hyperbola (Michaelis–Menten) and a straight Lineweaver–Burk line. y-intercept = 1/Vmax; x-intercept = −1/Km.',
        'Build 1: competitive — the curve reaches the same Vmax but more slowly: apparent Km ↑, Vmax unchanged. LB lines are steeper and meet on the y-axis.',
        'Build 2: noncompetitive — lower plateau, same Km: Vmax ↓, Km unchanged. LB lines meet on the x-axis (same −1/Km), y-intercept rises.',
        'Drag the [Inhibitor] slider to show the effect grows with inhibitor concentration. Readouts are relative to the uninhibited enzyme (×1).',
        '[textbook] Equations behind the curves: v = Vmax[S]/(Km + [S]); 1/v = (Km/Vmax)(1/[S]) + 1/Vmax.',
      ],
      visual: kineticsLab,
    },
    /* 8 */ {
      eyebrow: 'Suicide inhibition',
      title: 'The enzyme <em>arms</em> its killer',
      bullets: [
        { t: 'Recognized as a <b>substrate</b>', step: 1, tip: 'The enzyme binds the suicide inhibitor as if it were its substrate: E + I ⇌ EI.' },
        { t: 'Converted to a <b>reactive</b> form', step: 2, tip: 'The enzyme’s own catalysis turns the inhibitor into a reactive intermediate (E–I*).' },
        { t: '<b>Irreversibly</b> inactivated', step: 3, tip: { title: 'Mechanism-based inhibition', body: 'The intermediate binds irreversibly and inactivates the enzyme — no product formation. Extra substrate cannot rescue it.', src: SRC(11) } },
      ],
      steps: 3,
      src: SRC(11),
      notes: [
        'Build 0: the enzyme is working normally; the suicide inhibitor floats nearby.',
        'Build 1: recognized as a substrate — reversible binding (E + I ⇌ EI).',
        'Build 2: the enzyme converts it into a reactive intermediate (glows red, I*).',
        'Build 3: covalent, irreversible inactivation (padlock) — E–I* (inactive). Substrate is now turned away; activity is permanently lost.',
        'Also called mechanism-based inhibition. Examples next: allopurinol (xanthine oxidase) and β-lactam antibiotics (bacterial transpeptidases).',
      ],
      visual: suicideViz,
    },
    /* 9 */ {
      layout: 'full',
      eyebrow: 'Clinical & pharmacological examples',
      title: 'Drug → <em>target</em>',
      bullets: [{ t: 'Click a drug · or quiz yourself' }],
      steps: 8,
      src: 'Lecture slides 7, 10, 12 · real 3D structures (PubChem)',
      notes: [
        'Press → to walk through all nine agents; each shows its real 3D structure and connects to its target enzyme.',
        'Competitive: statins → HMG-CoA reductase (lower cholesterol); ACE inhibitors → ACE (hypertension: vasodilation, ↓BP); methotrexate → dihydrofolate reductase (anticancer); ethanol → alcohol dehydrogenase (antidote for methanol poisoning); malonate → succinate dehydrogenase (classic TCA experiment).',
        'Look-alikes shown side by side: malonate vs succinate, ethanol vs methanol, methotrexate vs folate, allopurinol vs hypoxanthine — the resemblance is why they compete for the active site.',
        'Noncompetitive: cyanide → cytochrome c oxidase (blocks ETC & ATP); fluoride → enolase (blocks glycolysis; preserves glucose in blood samples). [textbook] Some texts classify cyanide/fluoride differently — follow the lecture.',
        'Suicide: allopurinol → xanthine oxidase (gout); β-lactams → bacterial transpeptidases (cell wall).',
        'Turn on “Quiz me” to let students click the target enzyme themselves.',
      ],
      visual: drugGridViz,
    },
    /* 10 */ {
      layout: 'full',
      eyebrow: 'Suicide inhibition in the clinic',
      title: 'Allopurinol &amp; <em>gout</em>',
      bullets: [{ t: 'Xanthine oxidase makes its own inhibitor' }],
      steps: 2,
      src: 'Lecture slide 13 · real 3D structures (PubChem)',
      notes: [
        'Gout: urate crystal deposition in joints (the slide photo shows the big-toe joint).',
        'Build 0: xanthine oxidase catalyses both steps — hypoxanthine → xanthine → uric acid.',
        'Build 1: allopurinol (a look-alike of hypoxanthine) is converted BY xanthine oxidase into oxypurinol (alloxanthine), a reactive intermediate.',
        'Build 2: oxypurinol inhibits the same enzyme — both steps blocked, uric acid formation falls, crystals stop forming.',
        '[textbook] Oxypurinol binds very tightly to the reduced molybdenum centre of xanthine oxidase; the “suicide” label follows Lippincott.',
      ],
      visual: allopurinolViz,
    },
    /* 11 */ {
      eyebrow: 'Learning check · image-based',
      title: 'Identify curves <em>A</em> and <em>B</em>',
      bullets: [
        { t: 'Read K<sub>m</sub> at ½ V<sub>max</sub>', tip: 'Km is the substrate concentration that gives half-maximal velocity.' },
        { t: 'A: <b>competitive</b>', sub: 'K<sub>m</sub> ↑ · V<sub>max</sub> same', step: 1 },
        { t: 'B: <b>noncompetitive</b>', sub: 'V<sub>max</sub> ↓ · K<sub>m</sub> same', step: 2 },
      ],
      steps: 2,
      src: 'Lecture slide 16 · redrawn',
      notes: [
        'Ask the room first: “State the effect of each inhibitor on Km and Vmax.”',
        'Build 1: Curve A reaches the same Vmax but its half-maximal point is at Km₂ (> Km₁) → competitive. LB: lines meet on the y-axis.',
        'Build 2: Curve B plateaus at a lower Vmax with the same Km₁ → noncompetitive. LB: lines meet on the x-axis.',
        'Redrawn so that “Lower Vmax” is clearly distinct from the uninhibited half-maximal level (the original slide places them almost at the same height).',
      ],
      visual: curveIdViz,
    },
    /* 12 */ {
      layout: 'full',
      eyebrow: 'Learning check',
      title: 'Two quick <em>MCQs</em>',
      steps: 2,
      src: SRC(14),
      notes: [
        'Q1 — methanol poisoning treated with ethanol: A. Ethanol competitively inhibits alcohol dehydrogenase (it is in the competitive list).',
        'Q2 — noncompetitive inhibitor: C. inhibitor and substrate bind different sites. Distractors: substrate cannot overcome it; Km is unchanged; sigmoidal curves belong to allosteric enzymes; Vmax decreases.',
      ],
      visual: (el) => mcqViz(el, [
        { kicker: 'Question 1', q: 'A patient with methanol poisoning is treated with ethanol. What is the biochemical basis?', opts: ['Ethanol competitively inhibits alcohol dehydrogenase', 'Ethanol irreversibly inhibits methanol absorption', 'Ethanol increases renal excretion of formic acid', 'Ethanol noncompetitively inhibits aldehyde dehydrogenase', 'Ethanol converts methanol into a nontoxic metabolite'], ans: 0, why: 'Ethanol competes with methanol for <b>alcohol dehydrogenase</b> — a competitive inhibitor (slide 7).' },
        { kicker: 'Question 2', q: 'A noncompetitive inhibitor is added to an enzyme and its substrate. Then:', opts: ['Enough substrate will overcome the inhibition', 'K<sub>m</sub> decreases (reduced affinity)', 'Inhibitor and substrate bind different sites', 'The v vs [S] curve becomes sigmoidal', 'V<sub>max</sub> stays the same'], ans: 2, why: 'It binds the allosteric site → ESI. K<sub>m</sub> unchanged, V<sub>max</sub> ↓; sigmoidal curves belong to allosteric enzymes.' },
      ]),
    },
    /* 13 */ {
      layout: 'full',
      eyebrow: 'Learning check · matching',
      title: 'Which <em>type</em>?',
      steps: 5,
      src: SRC(15),
      notes: [
        'Each option may be used once, more than once, or not at all. Ask before each press.',
        'Malonate → A competitive · Cyanide → B noncompetitive · Allopurinol → C suicide · β-Lactams → C suicide · Enalapril → A competitive.',
      ],
      visual: matchViz,
    },
    /* 14 */ {
      layout: 'full',
      eyebrow: 'Clinical case · answers',
      title: 'Back to <em>enalapril</em>',
      steps: 3,
      src: 'Lecture slides 3, 6, 7, 15',
      notes: [
        'Q1: competitive inhibition (ACE inhibitors are in the competitive table; slide 15 matching confirms).',
        'Q2: apparent Km increases, Vmax unchanged — the mini plot shows the curve shifting right but reaching the same plateau.',
        'Q3: the slide says ACE inhibitors cause vasodilation and lower BP. [textbook] Mechanism: less angiotensin II (a vasoconstrictor) is formed; enalapril is a prodrug of enalaprilat.',
      ],
      visual: caseRevealViz,
    },
    /* 15 */ {
      layout: 'full',
      eyebrow: 'Session B · Enzyme regulation',
      title: 'Five ways to <em>regulate</em>',
      bullets: [{ t: 'Match activity to cellular needs', tip: { title: 'Enzyme regulation', body: 'Enzyme regulation coordinates metabolic pathways according to cellular needs.', src: SRC(18) } }],
      src: SRC('18, 26–27'),
      notes: [
        '“Enzyme regulation coordinates metabolic pathways according to cellular needs.”',
        'Five types: allosteric regulation, proteolytic activation, compartmentalization, induction & repression, covalent modification. (The slide joins them with arrows — layout only, not a sequence.)',
        'Tags summarise speed and reversibility from the slides: allosteric effectors bind noncovalently; proteolysis is irreversible; induction/repression is long-term; covalent modification is a rapid, reversible switch.',
        'Feedback inhibition and feed-forward activation are forms of allosteric regulation.',
      ],
      visual: regTypesViz,
    },
    /* 16 */ {
      eyebrow: 'Allosteric regulation',
      title: 'Effectors <em>reshape</em> the site',
      bullets: [
        { t: 'Separate <b>regulatory site</b>', tip: 'Allosteric enzymes contain a regulatory (allosteric) site distinct from the active site.' },
        { t: 'Effectors bind <b>noncovalently</b>', tip: 'Regulatory molecules (effectors) bind by noncovalent bonds and change the enzyme’s conformation and activity.' },
        { t: '<b>−</b> distorts · <b>+</b> shapes the site', tip: { title: 'Negative vs positive effectors', body: 'A negative effector inhibits: the active site does not assume the correct conformation. A positive effector increases activity: the active site assumes the correct conformation.<br><span style="color:var(--fg-3)">The slide calls these “negative/positive cooperativity”. Strictly (Lippincott), <b>cooperativity</b> is how substrate binding at one site changes affinity at other sites — the cause of the sigmoidal curve. Effector actions are better called allosteric inhibition/activation.</span>', src: `${SRC('19–20')} · Lippincott Ch 5` } },
      ],
      steps: 2,
      src: SRC('19–20'),
      notes: [
        'Build 0: no effector — the active site is only partly shaped.',
        'Build 1: a negative effector (allosteric inhibitor) binds the regulatory site; the active site distorts and substrate is turned away.',
        'Build 2: a positive effector (allosteric activator) binds; the active site assumes the correct conformation and catalysis runs fast.',
        'Wording caution: the slide labels these “negative/positive cooperativity”. Cooperativity properly describes substrate binding at one subunit affecting the others (it produces the sigmoidal curve on the next slide). Say “negative/positive effector”.',
      ],
      visual: effectorViz,
    },
    /* 17 */ {
      eyebrow: 'Allosteric kinetics',
      title: 'An <em>S-shaped</em> curve',
      bullets: [
        { t: '<b>Sigmoidal</b> v vs [S]', tip: 'Allosteric enzymes show a sigmoidal velocity–substrate curve due to cooperativity.' },
        { t: '<b>Not</b> Michaelis–Menten', tip: 'They do not follow classical Michaelis–Menten (hyperbolic) kinetics.' },
        { t: 'Effectors shift <b>K<sub>0.5</sub></b> or <b>V<sub>max</sub></b>', tip: { title: 'K₀.₅', body: 'K₀.₅ is the substrate concentration giving half-maximal velocity (it replaces Km). Positive effectors lower K₀.₅ or raise Vmax; negative effectors do the opposite.', src: SRC(21) } },
      ],
      steps: 2,
      src: 'Lecture slide 21 · curve shapes illustrative',
      notes: [
        'Build 0: the sigmoidal allosteric curve vs a hyperbolic Michaelis–Menten curve with the same half-maximal point.',
        'Build 1 (panel B of the slide): effectors alter K₀.₅ — the + effector shifts the curve left (lower K₀.₅), the − effector shifts it right; Vmax unchanged.',
        'Build 2 (panel A): effectors alter Vmax — + raises the plateau, − lowers it; K₀.₅ unchanged.',
        '[textbook] These two patterns are sometimes called K-series and V-series allosteric enzymes — terms not used on the slides.',
      ],
      visual: alloKinViz,
    },
    /* 18 */ {
      layout: 'full',
      eyebrow: 'Allosteric control of pathways',
      title: 'Feedback vs <em>feed-forward</em>',
      steps: 3,
      src: SRC('22–23'),
      notes: [
        'Build 1: feedback (end-product) inhibition — end product D inhibits Enzyme 1, the early regulatory enzyme, preventing unnecessary product formation. Flux slows.',
        'Build 2: lecture examples — heme ⊣ ALA synthase (heme synthesis); cholesterol ⊣ HMG-CoA reductase (cholesterol synthesis; the statin target too).',
        'Build 3: feed-forward activation — an early metabolite activates a later enzyme: fructose 1,6-bisphosphate activates pyruvate kinase in glycolysis.',
        '[textbook] Heme and cholesterol act largely through enzyme synthesis/degradation; keep the lecture’s framing for exam questions.',
      ],
      visual: feedViz,
    },
    /* 19 */ {
      eyebrow: 'Proteolytic activation',
      title: 'Cut to <em>switch on</em>',
      bullets: [
        { t: 'Made as inactive <b>zymogens</b>', tip: 'Some enzymes are synthesized as inactive zymogens (proenzymes).' },
        { t: 'Cleavage removes a <b>peptide</b>', step: 1, tip: 'Proteolytic cleavage removes a peptide segment.' },
        { t: 'Activation is <b>irreversible</b>', step: 2 },
      ],
      steps: 2,
      src: 'Lecture slide 24 · chain schematic',
      notes: [
        'Build 1: proteolytic cleavage removes the activation peptide.',
        'Build 2: the remaining chain refolds into the active enzyme — irreversibly.',
        'Five pairs to learn (click to relabel): stomach pepsinogen → pepsin; pancreas trypsinogen → trypsin and chymotrypsinogen → chymotrypsin; coagulation prothrombin → thrombin; fibrinolysis plasminogen → plasmin.',
        'The slide’s trypsinogen diagram numbers residues (1–15 removed, 16–245 kept); those numbers match chymotrypsinogen rather than trypsinogen — treat the drawing as schematic and do not memorise the numbers.',
      ],
      visual: zymogenViz,
    },
    /* 20 */ {
      eyebrow: 'Compartmentalization',
      title: 'Opposites in <em>separate</em> rooms',
      bullets: [
        { t: 'Opposing pathways, <b>different compartments</b>' },
        { t: 'Prevents <b>futile cycling</b>', tip: 'Separating synthesis from breakdown stops the two running against each other at the same time.' },
        { t: 'Allows <b>independent</b> regulation', step: 1, tip: { title: 'Lecture example', list: ['Anabolic: fatty acid synthesis — cytosol', 'Catabolic: fatty acid oxidation — mitochondria'], src: SRC(25) } },
      ],
      steps: 1,
      src: SRC(25),
      notes: [
        'Hover the labels: mitochondria (TCA cycle, fatty acid oxidation, oxidation of pyruvate); cytosol (glycolysis, PP pathway, fatty acid synthesis); nucleus (DNA and RNA synthesis); lysosome (degradation of complex macromolecules).',
        'Build 1: the classic pair — fatty acid synthesis (anabolic) in the cytosol vs fatty acid oxidation (catabolic) in mitochondria.',
        'The glowing particles show glucose → pyruvate in the cytosol, then pyruvate entering mitochondria.',
      ],
      visual: compartViz,
    },
    /* 21 */ {
      eyebrow: 'Induction & repression',
      title: 'Change the <em>amount</em>',
      bullets: [
        { t: '<b>Induction</b>: ↑ gene expression', tip: 'Increased gene expression → more enzyme is synthesized.' },
        { t: '<b>Repression</b>: ↓ gene expression', tip: 'Decreased gene expression → less enzyme is synthesized.' },
        { t: '<b>Long-term</b> regulation', tip: 'Regulation of enzyme synthesis — slower than allosteric or covalent switches.' },
      ],
      steps: 1,
      src: SRC('26, 30'),
      notes: [
        'Build 0 — fed state: after a carbohydrate-rich meal, insulin increases synthesis of hepatic glycolytic enzymes (e.g. glucokinase — slide 30), promoting glucose utilization.',
        'Build 1 — fasting: glucagon decreases synthesis of hepatic glycolytic enzymes, reducing hepatic glycolysis and conserving glucose for other tissues.',
        'Contrast with covalent modification (next): that changes activity of existing enzyme in seconds; induction changes the amount of enzyme over the long term.',
      ],
      visual: inductionViz,
    },
    /* 22 */ {
      layout: 'full',
      eyebrow: 'Reversible covalent modification',
      title: 'The <em>phosphate</em> switch',
      bullets: [{ t: 'Kinase adds · phosphatase removes', tip: { title: 'Two enzymes', body: 'One enzyme adds the group (protein kinase, using ATP), another removes it (phosphatase). Whether phosphorylation activates or inactivates depends on the target enzyme.', src: `${SRC(27)} · wording clarified` } }],
      steps: 2,
      src: SRC('27–28'),
      notes: [
        'A chemical group is reversibly added or removed; the most common is phosphorylation/dephosphorylation. Protein kinases add phosphate from ATP; phosphatases remove it. Hormones regulate this rapid switch.',
        'The slide says “one enzyme for activation and another for inactivation” — more precisely, one enzyme adds the phosphate and another removes it; the effect depends on the target.',
        'Build 1 — insulin: both glycogen enzymes dephosphorylated → synthase a ACTIVE, phosphorylase b INACTIVE → glycogenesis.',
        'Build 2 — glucagon/epinephrine: both phosphorylated → synthase b INACTIVE, phosphorylase a ACTIVE → glycogenolysis.',
        'Remember: “a” = active for both enzymes; phosphorylation inactivates synthase but activates phosphorylase.',
      ],
      visual: covalentViz,
    },
    /* 23 */ {
      layout: 'full',
      eyebrow: 'Learning check · regulation',
      title: 'Check your <em>regulation</em>',
      steps: 3,
      src: SRC('29–30'),
      notes: [
        'Q1: a sigmoidal velocity–substrate curve → C. allosteric regulation.',
        'Q2: glycogen phosphorylase is activated by phosphorylation → True (phosphorylase a is phosphorylated and active).',
        'Match: A trypsinogen → trypsin = 3 proteolytic activation; B FA synthesis in cytosol / oxidation in mitochondria = 1 compartmentalization; C insulin ↑ glucokinase synthesis = 2 enzyme induction.',
      ],
      visual: (el) => mcqViz(el, [
        { kicker: 'Question 1', q: 'Which regulatory mechanism typically produces a sigmoidal velocity–substrate curve?', opts: ['Proteolytic activation', 'Compartmentalization', 'Allosteric regulation', 'Enzyme induction', 'Covalent modification'], ans: 2, why: 'Sigmoidal kinetics is the hallmark of <b>allosteric</b> enzymes (slide 21).' },
        { kicker: 'Question 2 · true or false', q: 'Glycogen phosphorylase is activated by phosphorylation.', opts: ['True', 'False'], letters: 'TF', ans: 0, why: 'Phosphorylase <b>a</b> is the phosphorylated, active form (slide 28).' },
        { custom: matchCard },
      ]),
    },
    /* 24 */ {
      eyebrow: 'Clinically important plasma enzymes',
      title: 'Injured cells <em>leak</em>',
      bullets: [
        { t: 'Injury → enzymes into <b>plasma</b>', tip: 'Tissue injury releases intracellular enzymes into the circulation, increasing their plasma activity.' },
        { t: '<b>Pattern</b> & degree → which tissue', tip: 'The pattern and degree of enzyme elevation help identify the affected tissue.' },
        { t: '<b>Serial</b> levels track the disease', tip: 'Serial measurements help assess disease progression and response to treatment.' },
      ],
      steps: 1,
      src: 'Lecture slide 31 · schematic',
      notes: [
        'Build 0 — normal cell turnover: a few intracellular enzymes reach the capillary; plasma activity stays low.',
        'Build 1 — cell necrosis from disease or trauma: damaged cells release many enzymes; plasma activity rises.',
        'The pattern of which enzymes rise (and how much) points to the tissue; repeated measurements follow progression and treatment.',
      ],
      visual: leakViz,
    },
    /* 25 */ {
      layout: 'full',
      eyebrow: 'Plasma enzymes as diagnostic markers',
      title: 'Read the <em>pattern</em>',
      bullets: [{ t: 'Click an organ or an enzyme' }],
      steps: 6,
      src: 'Lecture slides 32–33 · heart shown for context [textbook]',
      notes: [
        'Press → to step through: liver → bile ducts → bone → pancreas → muscle → red cells. Or click any organ / enzyme tile.',
        'Liver: ALT (liver damage or disease); AST (liver & muscle), ALP, LDH also rise.',
        'Bile ducts: GGT and 5′-nucleotidase — hepatobiliary disease (obstructive jaundice); ALP too.',
        'Bone: ALP (liver & bone diseases). Pancreas: amylase and lipase. Muscle: CK (muscle damage); AST, LDH. RBCs: LDH — general marker of cell death, particularly hemolysis.',
        '[textbook] Lipase is more pancreas-specific than amylase; AST is also abundant in heart and RBCs. The heart is clickable for context only — the lecture lists these sources as “muscle”.',
      ],
      visual: organMapViz,
    },
    /* 26 */ {
      layout: 'full',
      eyebrow: 'Learning check · plasma enzymes',
      title: 'Two <em>patients</em>',
      steps: 2,
      src: SRC('34–35'),
      notes: [
        'Case 1: severe epigastric pain radiating to the back → acute pancreatitis → C. lipase (the pancreatic enzyme among the options).',
        'Case 2: bone pain, suspected bone disease → B. alkaline phosphatase (sources include bone).',
      ],
      visual: (el) => mcqViz(el, [
        { kicker: 'Case 1', q: 'A 55-year-old man has severe epigastric pain radiating to the back, vomiting and tenderness. Acute pancreatitis is suspected. Which plasma enzyme is more specific for pancreatic injury?', opts: ['Alanine aminotransferase', 'Alkaline phosphatase', 'Lipase', 'Creatine kinase', 'Lactate dehydrogenase'], ans: 2, why: '<b>Lipase</b> — a pancreatic enzyme (slide 33). [textbook] More specific than amylase.' },
        { kicker: 'Case 2', q: 'A patient presents with bone pain and suspected bone disease. Which plasma enzyme is most likely to be elevated?', opts: ['Alanine aminotransferase', 'Alkaline phosphatase', 'Amylase', 'Creatine kinase', 'Gamma-glutamyl transferase'], ans: 1, why: '<b>Alkaline phosphatase</b> — its sources include bone (slide 32).' },
      ]),
    },
    /* 27 */ {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { big: '3', title: 'inhibition types', body: 'Competitive · noncompetitive · suicide.' },
        { big: 'K<sub>m</sub>↑', title: 'competitive', body: 'V<sub>max</sub> same · lines meet on y-axis.' },
        { big: 'V<sub>max</sub>↓', title: 'noncompetitive', body: 'K<sub>m</sub> same · lines meet on x-axis.' },
        { big: 'S', title: 'allosteric curve', body: 'Effectors shift K<sub>0.5</sub> or V<sub>max</sub>.' },
        { big: '5', title: 'regulation types', body: '<span style="font-size:27px">Allosteric · proteolytic · compartments · induction · covalent.</span>' },
        { big: 'ALT', title: 'enzyme → tissue', body: 'CK muscle · lipase pancreas · ALP bone.' },
      ],
      notes: 'Recap the six key ideas, then open the question bank.',
    },
  ],
};
