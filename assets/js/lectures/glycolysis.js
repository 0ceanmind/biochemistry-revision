// Glycolysis (L.11) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show, drawPath } from '../viz/diagram.js';
import { chart } from '../viz/chart.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { cellScene, rbcScene, moleculeScene } from '../viz/scenes.js';

const gsap = window.gsap;
const GLU = 'var(--elec)';
const NA = 'var(--act)';
const K = 'var(--fadh)';
const P = 'var(--prot)';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */
const SRC = (p) => `Lecture slide ${p}`;

/** Metabolite token: rounded capsule with carbon beads and phosphate tags. */
function makeToken(parent, beads, label) {
  const g = s('g', { class: 'tok' });
  const sp = 19, w = beads * sp + 18;
  g.append(s('rect', { x: -w / 2, y: -21, width: w, height: 42, rx: 21, style: 'fill:var(--bg-2);stroke:var(--line-2);stroke-width:2' }));
  for (let i = 0; i < beads; i++) g.append(s('circle', { cx: -w / 2 + 18 + i * sp, cy: 0, r: 7.5, style: 'fill:var(--c-carbon)' }));
  const tags = {};
  const tag = (key, cx) => {
    const t = s('g', { transform: `translate(${cx} -30)`, style: 'opacity:0' });
    t.append(s('circle', { r: 14, style: `fill:${P}` }));
    const tx = s('text', { y: 7, 'text-anchor': 'middle', style: 'font:800 18px var(--font);fill:#1d1d1f' });
    tx.textContent = 'P';
    t.append(tx);
    g.append(t);
    tags[key] = t;
  };
  tag('L', -w / 2 + 18);
  tag('R', w / 2 - 18);
  const lbl = s('text', { y: -54, 'text-anchor': 'middle', class: 'v-label sm', style: 'font-weight:620;fill:var(--fg)' });
  setRich(lbl, label);
  g.append(lbl);
  parent.append(g);
  return { g, tags, lbl, w };
}

/* ------------------------------------------------------------------ */
/* Slide visuals                                                       */
/* ------------------------------------------------------------------ */

// 4 · Glucose transport journey
function transportViz(el) {
  const D = diagram(el, 1712, 720);
  const reg = (o) => D.region({ r: 36, ...o });
  reg({ x: 0, y: 70, w: 330, h: 600, label: 'Intestinal lumen', fill: 'color-mix(in oklab, var(--atp) 7%, transparent)' });
  reg({ x: 350, y: 70, w: 430, h: 600, label: 'Enterocyte', fill: 'color-mix(in oklab, var(--prot) 8%, transparent)' });
  reg({ x: 800, y: 70, w: 260, h: 600, label: 'Blood', fill: 'color-mix(in oklab, var(--inh) 9%, transparent)' });
  reg({ x: 1080, y: 70, w: 632, h: 600, label: 'Peripheral tissues', fill: 'color-mix(in oklab, var(--act) 6%, transparent)' });

  // lumen glucose + Na+
  const lumenDots = s('g');
  [[70, 250], [120, 300], [180, 240], [90, 360], [160, 350], [230, 300]].forEach(([x, y], i) => lumenDots.append(s('circle', { cx: x, cy: y, r: 13, style: `fill:${GLU};opacity:.85` })));
  [[80, 470], [130, 520], [190, 470], [240, 540], [110, 580], [200, 590]].forEach(([x, y]) => lumenDots.append(s('circle', { cx: x, cy: y, r: 9, style: `fill:${NA};opacity:.85` })));
  D.layers.nodes.append(lumenDots);
  D.text(70, 205, 'Glucose', { cls: 'sm', style: `fill:${GLU};font-weight:650` });
  D.text(70, 635, 'Na⁺', { cls: 'sm', style: `fill:${NA};font-weight:650` });

  // Step 1: SGLT-1 + pump
  const s1 = [];
  const sglt = D.node({ id: 'sglt', x: 350, y: 300, label: 'SGLT-1', kind: 'enz', color: 'var(--act)', tip: { kicker: 'Secondary active transport · symport', title: 'SGLT-1 (brush border)', body: 'Moves glucose <b>against</b> its gradient into the enterocyte. Energy comes from Na⁺ moving <b>down</b> its gradient.', src: SRC('4–5') } });
  const pump = D.node({ id: 'pump', x: 780, y: 540, label: 'Na⁺/K⁺ pump', kind: 'enz', color: 'var(--fadh)', tip: { title: 'Na⁺/K⁺ pump (basolateral)', body: 'Keeps intracellular Na⁺ low, so the Na⁺ gradient that drives SGLT-1 is maintained.', src: SRC(4) } });
  const pool = s('g');
  for (let i = 0; i < 14; i++) pool.append(s('circle', { cx: 520 + (i % 5) * 34 + (Math.floor(i / 5) % 2) * 16, cy: 250 + Math.floor(i / 5) * 34, r: 12, style: `fill:${GLU};opacity:.8` }));
  D.layers.nodes.append(pool);
  const pathGlu1 = s('path', { d: 'M240,300 C290,300 310,300 360,300 L520,290', style: 'fill:none;stroke:none' });
  const pathNa1 = s('path', { d: 'M230,520 C300,470 320,330 360,312 C420,360 520,470 760,535 L960,560', style: 'fill:none;stroke:none' });
  const pathK = s('path', { d: 'M960,600 C880,600 820,575 790,550 L600,600', style: 'fill:none;stroke:none' });
  D.layers.fx.append(pathGlu1, pathNa1, pathK);
  const t1 = D.text(565, 40, 'Secondary active transport · symport', { anchor: 'middle', cls: 'sm', style: 'fill:var(--ink);font-weight:650' });
  s1.push(sglt.g, pump.g, pool, t1);

  // Step 2: GLUT-2 exit
  const s2 = [];
  const glut2e = D.node({ id: 'g2e', x: 780, y: 300, label: 'GLUT-2', kind: 'enz', color: 'var(--elec)', tip: { kicker: 'Facilitated diffusion · uniport', title: 'GLUT-2 (basolateral)', body: 'Glucose leaves the enterocyte <b>down</b> its gradient into the blood. No energy needed.', src: SRC(4) } });
  const pathGlu2 = s('path', { d: 'M640,300 L780,300 C860,300 900,300 930,300 L930,380', style: 'fill:none;stroke:none' });
  D.layers.fx.append(pathGlu2);
  const t2 = D.text(1060, 40, 'Facilitated diffusion · uniport', { anchor: 'middle', cls: 'sm', style: 'fill:var(--ink);font-weight:650' });
  s2.push(glut2e.g, t2);

  // Step 3: tissue GLUTs
  const s3 = [];
  const rows = [
    { y: 175, g: 'GLUT-1', t: 'Most tissues', d: 'Basal uptake when blood glucose is normal' },
    { y: 305, g: 'GLUT-2', t: 'Liver · pancreas', d: 'Senses high blood glucose' },
    { y: 435, g: 'GLUT-3', t: 'Brain · neurons', d: 'Uptake even when blood glucose is low' },
    { y: 565, g: 'GLUT-4', t: 'Muscle · adipose', d: 'Insulin-dependent uptake', ins: true },
  ];
  const tissuePaths = [];
  rows.forEach((r) => {
    const n = D.node({ x: 1080, y: r.y, label: r.g, kind: 'enz', color: r.ins ? 'var(--atp)' : 'var(--elec)', tip: { title: `${r.g} · ${r.t}`, body: r.d + '.', src: SRC('4, 6') } });
    const t = D.text(1160, r.y + 9, r.t, { style: 'font-weight:620' });
    s3.push(n.g, t);
    if (r.ins) { const b = D.badge(1470, r.y, 'insulin', { color: 'var(--atp)', size: 22 }); s3.push(b); }
    const p = s('path', { d: `M930,380 C980,380 990,${r.y} 1040,${r.y} L1120,${r.y}`, style: 'fill:none;stroke:none' });
    D.layers.fx.append(p);
    tissuePaths.push(p);
  });
  const gly = D.node({ x: 1610, y: 370, label: 'Glycolysis', sub: 'cytosol', kind: 'mol', color: 'var(--a1)' });
  rows.forEach((r) => s3.push(D.arrow({ from: [1400, r.y + (r.ins ? 0 : 0)], to: 'x', curve: 0, width: 3, color: 'var(--line-2)', ...(r.ins ? { from: [1530, r.y] } : {}), to: [1540, 370 + (r.y - 370) * 0.25] }).g));
  s3.push(gly.g);

  const flows = {
    g1: D.flow(pathGlu1, { count: 3, color: GLU, speed: 140, r: 10, autoplay: false }),
    n1: D.flow(pathNa1, { count: 4, color: NA, speed: 200, r: 7, autoplay: false }),
    k: D.flow(pathK, { count: 2, color: K, speed: 150, r: 7, autoplay: false }),
    g2: D.flow(pathGlu2, { count: 3, color: GLU, speed: 150, r: 10, autoplay: false }),
    t: tissuePaths.map((p) => D.flow(p, { count: 2, color: GLU, speed: 160, r: 9, autoplay: false })),
  };
  const groups = [s1, s2, s3];
  const all = () => [flows.g1, flows.n1, flows.k, flows.g2, ...flows.t];
  const apply = (n) => {
    groups.forEach((g, i) => show(g, n >= i + 1, { duration: 0.6 }));
    const want = new Set();
    if (n >= 1) want.add(flows.g1).add(flows.n1).add(flows.k);
    if (n >= 2) want.add(flows.g2);
    if (n >= 3) flows.t.forEach((f) => want.add(f));
    all().forEach((f) => (want.has(f) ? f.play() : f.hide()));
  };
  groups.flat().forEach((e) => (e.style.opacity = 0));
  all().forEach((f) => f.hide());
  return { step: apply, leave: () => all().forEach((f) => f.pause()), enter: () => {}, destroy: () => D.destroy() };
}

// 5 · GLUT vs SGLT mini diagram for a card
function gradientMini(el, kind) {
  const D = diagram(el, 560, 230);
  D.svg.style.height = '230px';
  // membrane
  D.layers.regions.append(s('rect', { x: 268, y: 10, width: 24, height: 210, rx: 12, style: 'fill:var(--surface-3)' }));
  const hiSide = kind === 'glut' ? 0 : 1; // glucose high side: GLUT left, SGLT right (inside)
  const dots = (x0, n, col, r) => { for (let i = 0; i < n; i++) D.layers.nodes.append(s('circle', { cx: x0 + (i % 4) * 46 + 20, cy: 62 + Math.floor(i / 4) * 40, r, style: `fill:${col};opacity:.8` })); };
  dots(hiSide === 0 ? 30 : 330, 12, GLU, 11);
  dots(hiSide === 0 ? 330 : 30, 3, GLU, 11);
  const path = s('path', { d: kind === 'glut' ? 'M60,115 L500,115' : 'M60,115 L500,115', style: 'fill:none;stroke:none' });
  D.layers.fx.append(path);
  D.flow(path, { count: 3, color: GLU, speed: 160, r: 10 });
  if (kind === 'sglt') {
    const p2 = s('path', { d: 'M60,175 L500,175', style: 'fill:none;stroke:none' });
    D.layers.fx.append(p2);
    D.flow(p2, { count: 3, color: NA, speed: 200, r: 7 });
    D.text(280, 222, 'Na⁺ moves down its gradient', { anchor: 'middle', cls: 'sm', style: `font-size:20px;fill:${NA};font-weight:600` });
  }
  D.text(30, 22, kind === 'glut' ? 'high glucose' : 'low glucose', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3)' });
  D.text(530, 22, kind === 'glut' ? 'low glucose' : 'high glucose', { anchor: 'end', cls: 'sm', style: 'font-size:20px;fill:var(--fg-3)' });
  return { destroy: () => D.destroy() };
}

// 6 · GLUT Km ladder chart
function glutKmViz(el) {
  const C = chart(el, { w: 960, h: 700, pad: { l: 130, b: 120, t: 30, r: 160 }, x: { min: 0, max: 20, label: 'Blood glucose →', ticks: false }, y: { min: 0, max: 1.05, label: 'Transporter saturation', ticks: [0, 0.5, 1], fmt: (v) => `${Math.round(v * 100)}%` } });
  const defs = [
    { k: 1, name: 'GLUT-3', rank: 'lowest K_{m}', col: 'var(--a2)' },
    { k: 2.2, name: 'GLUT-1', rank: 'low K_{m}', col: 'var(--elec)' },
    { k: 5, name: 'GLUT-4', rank: 'medium K_{m}', col: 'var(--atp)' },
    { k: 16, name: 'GLUT-2', rank: 'highest K_{m}', col: 'var(--a1)' },
  ];
  const lines = defs.map((d) => C.line((x) => x / (d.k + x), { color: d.col, width: 7, label: `${d.name}`, labelAt: 20, labelDy: 8 }));
  const pts = defs.map((d) => C.point(0, 0, { color: d.col, r: 13 }));
  const vl = C.vline(4, { label: '', color: 'var(--fg-2)' });
  const slot = h('div', { style: 'position:absolute;left:130px;bottom:0;right:0;display:flex;justify-content:space-between;font-size:24px;color:var(--fg-3);padding:0 160px 70px 0;pointer-events:none' }, [h('span', { text: 'low' }), h('span', { text: 'normal' }), h('span', { text: 'high' })]);
  el.append(slot);
  const update = (g) => { vl.move(g); defs.forEach((d, i) => pts[i].move(g, g / (d.k + g))); };
  const sl = slider({ label: 'Blood glucose', min: 0.3, max: 20, step: 0.1, value: 4, fmt: (v) => (v < 3 ? 'low' : v < 8 ? 'normal' : 'high'), onInput: update, width: 320 });
  ctrlBar(el, [sl], { left: 130, top: 0 });
  update(4);
  return {
    step(n) {
      lines.forEach((l, i) => { const on = n === 0 || i < n; l.show(on); pts[i].el.style.opacity = on ? 1 : 0; });
      if (n > 0 && n <= 4) lines[n - 1].draw(1.1);
    },
  };
}

// 7 · The seven chemical events (centrepiece)
function pathwayViz(el) {
  const D = diagram(el, 1712, 720);
  const Y = 360, TOP = 205, BOT = 515;
  const E = [
    { n: 1, x: 280, y: Y, name: 'Phosphorylation', enz: 'Hexokinase / Glucokinase', enzShort: 'HK / GK', ctrl: true, in: 'ATP' },
    { n: 2, x: 480, y: Y, name: 'Phosphorylation', enz: 'Phosphofructokinase-1', enzShort: 'PFK-1', ctrl: true, in: 'ATP' },
    { n: 3, x: 680, y: Y, name: 'Splitting', enz: 'Aldolase' },
    { n: 4, x: 900, lane: true, name: 'Oxidation', enz: 'G3P dehydrogenase (NAD⁺)', enzShort: 'G3P DH', out: 'NADH', in: 'P_{i}', poison: 'Arsenate' },
    { n: 5, x: 1100, lane: true, name: 'Dephosphorylation', enz: 'Phosphoglycerate kinase', enzShort: 'PG kinase', out: 'ATP', slp: true },
    { n: 6, x: 1300, lane: true, name: 'Dehydration', enz: 'Enolase', out: 'H_{2}O', poison: 'Fluoride' },
    { n: 7, x: 1500, lane: true, name: 'Dephosphorylation', enz: 'Pyruvate kinase', out: 'ATP', slp: true, ctrl: true },
  ];
  // Phase brackets
  const bracket = (x1, x2, label, col) => {
    const g = s('g');
    g.append(s('path', { d: `M${x1},70 L${x1},58 L${x2},58 L${x2},70`, style: `fill:none;stroke:${col};stroke-width:3;stroke-linecap:round` }));
    const t = s('text', { x: (x1 + x2) / 2, y: 40, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${col};font-weight:700;letter-spacing:.12em;text-transform:uppercase` });
    t.textContent = label;
    g.append(t);
    D.layers.labels.append(g);
    return g;
  };
  const brInv = bracket(110, 720, 'Investment', 'var(--fg-2)');
  const brPay = bracket(780, 1660, 'Payoff · ×2', 'var(--ink)');

  // rails
  const rail = (d) => { const p = s('path', { d, style: 'fill:none;stroke:var(--line-2);stroke-width:4;stroke-linecap:round' }); D.layers.edges.append(p); return p; };
  rail(`M110,${Y} L680,${Y}`);
  rail(`M680,${Y} C740,${Y} 740,${TOP} 800,${TOP} L1660,${TOP}`);
  rail(`M680,${Y} C740,${Y} 740,${BOT} 800,${BOT} L1660,${BOT}`);

  // event nodes
  const ev = {};
  const tipFor = (e) => ({ kicker: `Event ${e.n}${e.ctrl ? ' · control enzyme' : ''}`, title: e.name, body: `<b>${e.enz}</b>${e.slp ? ' · substrate-level phosphorylation' : ''}${e.poison ? `<br>Poisoned by <b>${e.poison.toLowerCase()}</b>` : ''}`, src: SRC('7–8') });
  E.forEach((e) => {
    const ys = e.lane ? [TOP, BOT] : [Y];
    ev[e.n] = { circles: [], badges: [], enzTags: [], rings: [] };
    ys.forEach((y) => {
      const g = s('g', { transform: `translate(${e.x} ${y})`, 'data-tip': JSON.stringify(tipFor(e)) });
      g.append(s('circle', { r: 30, style: 'fill:var(--bg);stroke:var(--a1);stroke-width:3' }));
      const t = s('text', { y: 10, 'text-anchor': 'middle', style: 'font:700 28px var(--font);fill:var(--fg)' });
      t.textContent = e.n;
      g.append(t);
      D.layers.nodes.append(g);
      ev[e.n].circles.push(g);
      const ring = s('circle', { cx: e.x, cy: y, r: 42, style: 'fill:none;stroke:var(--atp);stroke-width:4;stroke-dasharray:6 8;opacity:0' });
      D.layers.fx.append(ring);
      ev[e.n].rings.push(ring);
      // side products
      const up = y === BOT ? 1 : -1;
      const by = y + up * 92;
      if (e.in && !e.lane) {
        const b = D.badge(e.x, by, e.in, { color: 'var(--atp)' });
        const a = D.arrow({ from: [e.x, by - up * 24], to: [e.x, y + up * 36], color: 'var(--atp)', width: 3, headSize: 13 });
        ev[e.n].badges.push(b, a.g);
      }
      if (e.lane && e.in) {
        const b = D.badge(e.x - 52, by, e.in, { color: P, size: 22 });
        const a = D.arrow({ from: [e.x - 52, by - up * 20], to: [e.x - 18, y + up * 30], color: P, width: 3, headSize: 12 });
        ev[e.n].badges.push(b, a.g);
      }
      if (e.out) {
        const ox = e.lane && e.in ? e.x + 56 : e.x;
        const col = e.out === 'NADH' ? 'var(--nadh)' : e.out === 'ATP' ? 'var(--atp)' : 'var(--elec)';
        const a = D.arrow({ from: [e.x + (ox - e.x) * 0.3, y + up * 34], to: [ox, by - up * 22], color: col, width: 3, headSize: 12 });
        const b = D.badge(ox, by, e.out, { color: col });
        ev[e.n].badges.push(a.g, b);
        if (e.slp) { const left = e.n === 7; const t = D.text(ox + (left ? -58 : 58), by + 8, 'SLP', { anchor: left ? 'end' : 'start', cls: 'sm', style: 'font-size:20px;fill:var(--fg-3);font-weight:700;letter-spacing:.1em' }); ev[e.n].badges.push(t); }
      }
    });
    // event name
    const ny = e.lane ? Y + 2 : Y + 74;
    const name = D.text(e.x, ny, e.name, { anchor: 'middle', cls: 'sm', style: 'font-size:22px;font-weight:650;fill:var(--fg-2)' });
    const enz = D.text(e.x, ny + 34, e.enzShort || e.enz, { anchor: 'middle', cls: 'sm', style: 'font-size:20px;font-weight:620;fill:var(--ink);opacity:0' });
    ev[e.n].name = name; ev[e.n].enz = enz;
    if (e.poison) {
      const pz = D.badge(e.x, ny + 40, `☠ ${e.poison}`, { color: 'var(--inh)', size: 20, w: 170 });
      pz.style.opacity = 0;
      ev[e.n].poison = pz;
    }
  });

  // tokens
  const main = makeToken(D.layers.labels, 6, 'Glucose');
  const top = makeToken(D.layers.labels, 3, 'Glyceraldehyde-3-P');
  const bot = makeToken(D.layers.labels, 3, 'Glyceraldehyde-3-P');
  bot.lbl.setAttribute('y', 62);
  const STATES = [
    { x: 110, label: 'Glucose', tags: [] },
    { x: 380, label: 'Glucose-6-P', tags: ['R'] },
    { x: 580, label: 'Fructose-1,6-bisP', tags: ['L', 'R'] },
    { x: 790, label: 'Glyceraldehyde-3-P', tags: ['R'] },
    { x: 1000, label: '1,3-Bisphosphoglycerate', tags: ['L', 'R'] },
    { x: 1200, label: '3-Phosphoglycerate', tags: ['R'] },
    { x: 1400, label: 'Phosphoenolpyruvate', tags: ['R'] },
    { x: 1610, label: 'Pyruvate', tags: [] },
  ];

  // counters
  const counters = h('div', { style: 'position:absolute;left:0;right:0;bottom:-6px;display:flex;justify-content:center;gap:56px;pointer-events:none' });
  const mk = (label, col) => {
    const v = h('div', { style: `font:720 52px var(--font);letter-spacing:-.03em;color:${col};font-variant-numeric:tabular-nums;line-height:1`, text: '0' });
    counters.append(h('div', { style: 'display:flex;align-items:baseline;gap:14px' }, [v, h('div', { style: 'font-size:22px;color:var(--fg-2);font-weight:560', html: label })]));
    return v;
  };
  const cUsed = mk('ATP invested', 'var(--fg)');
  const cMade = mk('ATP made', 'var(--atp)');
  const cNadh = mk('NADH', 'var(--nadh)');
  const cNet = mk('net ATP', 'var(--ink)');
  el.append(counters);
  el.style.paddingBottom = '0';

  const setTok = (tk, st, y, dur) => {
    gsap.to(tk.g, { x: st.x, y, duration: dur, ease: 'power3.inOut' });
    ['L', 'R'].forEach((k) => gsap.to(tk.tags[k], { opacity: st.tags.includes(k) ? 1 : 0, duration: dur * 0.6, delay: dur * 0.4 }));
    if (tk.lbl.textContent !== st.label) { gsap.to(tk.lbl, { opacity: 0, duration: dur * 0.3, onComplete: () => { setRich(tk.lbl, st.label); gsap.to(tk.lbl, { opacity: 1, duration: dur * 0.5 }); } }); }
  };
  const vals = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 0], [2, 0, 2], [2, 2, 2], [2, 2, 2], [2, 4, 2]];
  let last = -1;
  function apply(n, dir) {
    const dur = last < 0 ? 0 : 0.9;
    const ps = Math.min(n, 7);
    // tokens
    if (ps < 3) {
      setTok(main, STATES[ps], Y, dur);
      gsap.to(main.g, { opacity: 1, duration: 0.3 });
      gsap.to([top.g, bot.g], { opacity: 0, duration: 0.3 });
      gsap.set(top.g, { x: 680, y: Y }); gsap.set(bot.g, { x: 680, y: Y });
    } else {
      gsap.to(main.g, { opacity: 0, duration: 0.3 });
      if (last < 3 && dur) { gsap.set(top.g, { x: 600, y: Y }); gsap.set(bot.g, { x: 600, y: Y }); }
      gsap.to([top.g, bot.g], { opacity: 1, duration: 0.4 });
      setTok(top, STATES[ps], TOP, dur);
      setTok(bot, STATES[ps], BOT, dur);
    }
    // events
    E.forEach((e) => {
      const done = ps >= e.n;
      const r = ev[e.n];
      r.circles.forEach((c) => gsap.to(c, { opacity: n === 0 ? 0.55 : done ? 1 : 0.4, duration: 0.5 }));
      gsap.to(r.badges, { opacity: done ? 1 : 0, duration: 0.5, delay: done && e.n === ps ? dur * 0.7 : 0, stagger: 0.05 });
      gsap.to(r.enz, { opacity: n >= 8 && n < 9 ? 1 : 0, duration: 0.5 });
      gsap.to(r.rings, { opacity: n === 8 && e.ctrl ? 1 : 0, duration: 0.5 });
      if (r.poison) gsap.to(r.poison, { opacity: n >= 9 ? 1 : 0, duration: 0.5 });
      gsap.to(r.name, { opacity: n >= 9 && !e.poison ? 0.25 : 1, duration: 0.5 });
    });
    gsap.to(brInv, { opacity: ps >= 1 ? 1 : 0.35, duration: 0.5 });
    gsap.to(brPay, { opacity: ps >= 4 ? 1 : 0.35, duration: 0.5 });
    // counters
    const [u, m, nd] = vals[ps];
    countTo(cUsed, u, { from: +cUsed.textContent, duration: 0.8 });
    countTo(cMade, m, { from: +cMade.textContent, duration: 0.8 });
    countTo(cNadh, nd, { from: +cNadh.textContent, duration: 0.8 });
    countTo(cNet, m - u, { from: +cNet.textContent, duration: 0.8 });
    last = n;
  }
  return { step: apply, destroy: () => D.destroy() };
}

// 8 · Ten reactions explorer with real 3D intermediates
const TEN = [
  { key: 'b-glucose', name: 'Glucose', enz: null },
  { key: 'g6p', name: 'Glucose-6-phosphate', enz: 'Hexokinase / Glucokinase', irr: true, note: 'ATP → ADP' },
  { key: 'f6p', name: 'Fructose-6-phosphate', enz: 'Phosphoglucose isomerase' },
  { key: 'f16bp', name: 'Fructose-1,6-bisphosphate', enz: 'Phosphofructokinase-1', irr: true, note: 'ATP → ADP · committed step' },
  { key: 'g3p', name: 'Glyceraldehyde-3-P  +  DHAP', enz: 'Aldolase · triose-P isomerase', note: '6C → 2 × 3C' },
  { key: '13bpg', name: '1,3-Bisphosphoglycerate', enz: 'G3P dehydrogenase', note: 'NAD⁺ → NADH' },
  { key: '3pg', name: '3-Phosphoglycerate', enz: 'Phosphoglycerate kinase', note: 'ADP → ATP (SLP)' },
  { key: '2pg', name: '2-Phosphoglycerate', enz: 'Phosphoglycerate mutase' },
  { key: 'pep', name: 'Phosphoenolpyruvate', enz: 'Enolase', note: '− H₂O' },
  { key: 'pyruvate', name: 'Pyruvate', enz: 'Pyruvate kinase', irr: true, note: 'ADP → ATP (SLP)' },
];
async function tenStepViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '600px 1fr';
  el.style.gap = '40px';
  const rail = h('div', { style: 'position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:6px 0' });
  const items = TEN.map((t, i) => {
    const row = h('div', { style: 'display:flex;align-items:center;gap:18px;cursor:pointer;transition:opacity .4s' }, [
      h('div', { style: `width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font:700 20px var(--font);border:2px solid ${t.irr ? 'var(--atp)' : 'var(--line-2)'};background:var(--bg);flex:none`, text: i === 0 ? '·' : i }),
      h('div', { style: 'font-size:27px;font-weight:600;letter-spacing:-.01em', html: t.name }),
    ]);
    row.addEventListener('click', () => select(i));
    tip(row, { kicker: i ? `Reaction ${i}${t.irr ? ' · irreversible' : ''}` : 'Start', title: t.name, body: t.enz ? `Made by <b>${t.enz}</b>${t.note ? ` · ${t.note}` : ''}` : 'Six-carbon start molecule.', src: 'Lippincott Ch 8 · lecture slides 7–8' });
    rail.append(row);
    return row;
  });
  const right = h('div', { style: 'position:relative' });
  el.append(rail, right);
  const caption = h('div', { style: 'position:absolute;left:0;right:0;top:0;text-align:center;z-index:2;pointer-events:none' }, []);
  const capName = h('div', { style: 'font-size:44px;font-weight:700;letter-spacing:-.02em' });
  const capEnz = h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:8px' });
  caption.append(capName, capEnz);
  const legend = h('div', { style: 'position:absolute;left:0;bottom:0;display:flex;gap:26px;font-size:22px;color:var(--fg-2);z-index:2' }, [
    ['C', '#8e8e96'], ['O', '#ff453a'], ['P', '#ff9f0a'], ['H', '#f2f2f7'],
  ].map(([e, c]) => h('span', { style: 'display:flex;align-items:center;gap:8px' }, [h('i', { style: `width:16px;height:16px;border-radius:50%;background:${c};display:inline-block` }), e])));
  right.append(caption, legend);
  const host = h('div', { style: 'position:absolute;inset:90px 0 40px 0' });
  right.append(host);
  const viewer = await moleculeScene(host, TEN[0].key, { fill: 0.88, mol: { hideH: false } });
  let cur = 0;
  function select(i) {
    cur = i;
    items.forEach((r, k) => { r.style.opacity = k === i ? 1 : k < i ? 0.55 : 0.3; });
    capName.innerHTML = TEN[i].name;
    capEnz.innerHTML = TEN[i].enz ? `${TEN[i].enz}${TEN[i].irr ? ' · <span style="color:var(--atp)">irreversible</span>' : ''}` : 'Real 3D structure · drag to rotate';
    viewer.swap(TEN[i].key);
  }
  select(0);
  viewer.kit.renderOnce();
  return { ...viewer, step: (n) => { if (n !== cur) select(n); } };
}

// 9 · Hexokinase vs glucokinase
function hkgkViz(el) {
  const C = chart(el, { w: 960, h: 690, pad: { l: 120, b: 110, t: 40, r: 60 }, x: { min: 0, max: 20, label: '[Glucose] (mM)', ticks: [0, 5, 10, 15, 20] }, y: { min: 0, max: 1.1, label: 'Rate of phosphorylation', ticks: false } });
  let g6p = false, insulin = true;
  const hk = (x) => (g6p ? 0.17 : 0.42) * x / (0.1 + x);
  const gk = (x) => (insulin ? 1 : 0.55) * Math.pow(x, 1.7) / (Math.pow(10, 1.7) + Math.pow(x, 1.7));
  const lhk = C.line(hk, { color: 'var(--elec)', width: 7, label: 'Hexokinase', labelAt: 16, labelDy: -22, samples: 400 });
  const lgk = C.line(gk, { color: 'var(--a1)', width: 7, label: 'Glucokinase', labelAt: 15, labelDy: 40 });
  C.vline(0.1, { label: 'K_{m} ≈ 0.1 mM', color: 'var(--elec)', labelTop: true, extent: 0.62 });
  C.vline(10, { label: 'K_{m} ≈ 10 mM', color: 'var(--a1)', labelTop: true, extent: 1.02 });
  const pHK = C.point(5, hk(5), { color: 'var(--elec)' });
  const pGK = C.point(5, gk(5), { color: 'var(--a1)' });
  const vg = C.vline(5, { color: 'var(--fg-3)', dash: '4 10', width: 2 });
  let gx = 5;
  const redraw = () => { lhk.update(hk); lgk.update(gk); pHK.move(gx, hk(gx)); pGK.move(gx, gk(gx)); vg.move(gx); };
  const sl = slider({ label: '[Glucose]', min: 0.2, max: 20, step: 0.1, value: 5, fmt: (v) => `${v.toFixed(1)} mM`, onInput: (v) => { gx = v; redraw(); }, width: 190 });
  const tG = toggle({ label: '↑ G6P', on: false, danger: true, onChange: (v) => { g6p = v; redraw(); } });
  const tI = toggle({ label: 'Insulin', on: true, onChange: (v) => { insulin = v; redraw(); } });
  tip(tG.el, { title: 'Product inhibition', body: 'Glucose-6-P inhibits <b>hexokinase</b> only. Glucokinase is unaffected.', src: SRC(9) });
  tip(tI.el, { title: 'Induction', body: 'Insulin <b>induces</b> glucokinase synthesis. No effect on hexokinase.', src: SRC(9) });
  ctrlBar(el, [sl, tG, tI], { left: 0, right: 0, bottom: 0 });
  return { enter: () => { lhk.draw(1.2); lgk.draw(1.4, 0.3); } };
}

// 10 · SLP vs oxidative phosphorylation
function slpViz(el) {
  const D = diagram(el, 960, 860);
  // columns
  D.region({ x: 0, y: 0, w: 455, h: 860, r: 40, label: 'Substrate-level', fill: 'var(--surface)' });
  D.region({ x: 505, y: 0, w: 455, h: 860, r: 40, label: 'Oxidative', fill: 'var(--surface)' });
  // SLP: substrate~P → product, P → ADP → ATP
  D.node({ id: 'sub', x: 228, y: 640, label: 'Substrate~P', kind: 'mol', size: 28 });
  D.node({ id: 'prod', x: 228, y: 790, label: 'Product', kind: 'mol', size: 28 });
  D.arrow({ from: 'sub', to: 'prod', width: 4, color: 'var(--fg-3)' });
  D.node({ id: 'adp1', x: 228, y: 420, label: 'ADP + P_{i}', kind: 'box', size: 27 });
  const a1 = D.arrow({ from: 'sub', to: 'adp1', color: P, width: 4, label: 'P_{i}', labelColor: P, labelSide: -1 });
  D.node({ id: 'atp1', x: 228, y: 220, label: 'ATP', kind: 'mol', color: 'var(--atp)', size: 40 });
  const a2 = D.arrow({ from: 'adp1', to: 'atp1', color: 'var(--atp)', width: 5 });
  D.text(228, 120, 'In the pathway · no O₂ needed', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  // OxPhos: NADH/FADH2 → mitochondrion → ATP
  D.node({ id: 'nadh', x: 640, y: 720, label: 'NADH', kind: 'mol', color: 'var(--nadh)' });
  D.node({ id: 'fadh', x: 830, y: 720, label: 'FADH_{2}', kind: 'mol', color: 'var(--fadh)' });
  const mito = s('g', { transform: 'translate(733 470)' });
  mito.append(s('rect', { x: -170, y: -90, width: 340, height: 180, rx: 90, style: 'fill:color-mix(in oklab, var(--prot) 18%, transparent);stroke:var(--prot);stroke-width:3' }));
  mito.append(s('path', { d: 'M-120,0 q20,50 40,0 q20,-50 40,0 q20,50 40,0 q20,-50 40,0 q20,50 40,0 q20,-50 40,0', style: 'fill:none;stroke:var(--prot);stroke-width:3;opacity:.6', transform: 'translate(0 28)' }));
  const mt = s('text', { y: -28, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--prot);font-weight:650' }); mt.textContent = 'Mitochondrion';
  mito.append(mt);
  D.layers.nodes.append(mito);
  D.arrow({ from: 'nadh', to: [690, 572], color: 'var(--nadh)', width: 4 });
  D.arrow({ from: 'fadh', to: [790, 572], color: 'var(--fadh)', width: 4 });
  D.node({ id: 'atp2', x: 733, y: 220, label: 'ATP', kind: 'mol', color: 'var(--atp)', size: 40 });
  const a3 = D.arrow({ from: [733, 385], to: 'atp2', color: 'var(--atp)', width: 5, label: 'ADP + P_{i}', labelSide: 1, labelOffset: 34 });
  D.text(733, 120, 'In mitochondria · needs O₂', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  D.badge(640, 800, '3 / 2.5 ATP', { color: 'var(--nadh)', size: 22, tip: { title: 'NADH → ATP', body: '3 ATP (older value) or 2.5 ATP (current value) per NADH.', src: SRC(10) } });
  D.badge(830, 800, '2 / 1.5 ATP', { color: 'var(--fadh)', size: 22, tip: { title: 'FADH₂ → ATP', body: '2 ATP (older value) or 1.5 ATP (current value) per FADH₂.', src: SRC(10) } });
  [a1, a2, a3].forEach((a) => D.flow(a, { count: 2, color: 'var(--atp)', speed: 120, r: 8 }));
  return { destroy: () => D.destroy() };
}

// 11 · Energy yield calculator
function yieldViz(el) {
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '34px';
  el.style.justifyContent = 'center';
  let aerobic = true, po = 3;
  const big = h('div', { style: 'font:760 220px var(--font);letter-spacing:-.06em;line-height:.9;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent', text: '8' });
  const bigK = h('div', { style: 'font-size:30px;color:var(--fg-2);margin-top:6px', text: 'ATP per glucose → 2 pyruvate' });
  const bars = h('div', { style: 'display:grid;gap:16px' });
  const row = (label, col) => {
    const fill = h('div', { style: `height:100%;width:0;border-radius:14px;background:${col};transition:width .8s var(--ease)` });
    const val = h('div', { style: 'font:700 30px var(--font);min-width:110px;text-align:right;font-variant-numeric:tabular-nums' });
    const r = h('div', { style: 'display:grid;grid-template-columns:300px 1fr 110px;align-items:center;gap:20px' }, [h('div', { style: 'font-size:27px;color:var(--fg-2)', html: label }), h('div', { style: 'height:42px;border-radius:14px;background:var(--surface-2);overflow:hidden' }, [fill]), val]);
    bars.append(r);
    return { fill, val, r };
  };
  const rSLP = row('ATP by SLP', 'var(--atp)');
  const rInv = row('ATP invested', 'var(--fg-3)');
  const rNad = row('2 NADH → ATP', 'var(--nadh)');
  const note = h('div', { style: 'font-size:24px;color:var(--fg-3)' });
  el.append(h('div', {}, [big, bigK]), bars, note);
  const update = () => {
    const nad = aerobic ? 2 * po : 0;
    const net = 4 - 2 + nad;
    countTo(big, net, { from: +big.textContent || 0, duration: 0.9, decimals: po === 2.5 && aerobic ? 0 : 0 });
    rSLP.fill.style.width = `${(4 / 10) * 100}%`; rSLP.val.textContent = '+4';
    rInv.fill.style.width = `${(2 / 10) * 100}%`; rInv.val.textContent = '−2';
    rNad.fill.style.width = `${(nad / 10) * 100}%`; rNad.val.textContent = aerobic ? `+${nad}` : '0';
    rNad.r.style.opacity = aerobic ? 1 : 0.4;
    note.innerHTML = aerobic
      ? `Aerobic · each cytosolic NADH counted as ${po} ATP via oxidative phosphorylation.`
      : 'Anaerobic · NADH is re-oxidised by lactate dehydrogenase, so it yields no ATP.';
  };
  const sO = seg({ options: [{ v: true, t: 'Aerobic' }, { v: false, t: 'Anaerobic' }], value: true, onChange: (v) => { aerobic = v; update(); } });
  const sP = seg({ options: [{ v: 3, t: 'NADH = 3' }, { v: 2.5, t: 'NADH = 2.5' }], value: 3, onChange: (v) => { po = v; update(); } });
  const bar = h('div', { style: 'display:flex;gap:20px' }, [sO.el, sP.el]);
  el.prepend(bar);
  tip(note, { title: 'Why answers differ', body: 'The total depends on the ATP value used for NADH (3 vs 2.5) and on how cytosolic NADH enters mitochondria (the glycerol-phosphate shuttle gives 2 / 1.5 per NADH).', src: 'Lecture slides 10–11 · Lippincott' });
  update();
  return {};
}

// 12 · Fate of pyruvate (O2 switch)
function fateViz(el) {
  const D = diagram(el, 960, 860);
  const mito = D.region({ x: 120, y: 20, w: 400, h: 230, r: 115, label: 'Mitochondrion', lx: 110, ly: 62, fill: 'color-mix(in oklab, var(--prot) 14%, transparent)', stroke: 'color-mix(in oklab, var(--prot) 60%, transparent)' });
  D.node({ id: 'tca', x: 320, y: 160, label: 'TCA cycle', kind: 'mol', color: 'var(--prot)' });
  D.node({ id: 'pyr', x: 320, y: 450, label: 'Pyruvate', kind: 'mol', color: 'var(--a1)', size: 34 });
  D.node({ id: 'lac', x: 790, y: 450, label: 'Lactate', kind: 'mol', color: 'var(--a2)', size: 34 });
  const toTCA = D.arrow({ from: 'pyr', to: 'tca', color: 'var(--prot)', width: 5 });
  const o2 = D.badge(400, 320, 'O₂', { color: 'var(--act)', size: 28, w: 80 });
  const fwd = D.arrow({ from: [440, 430], to: [680, 430], color: 'var(--a2)', width: 5 });
  const rev = D.arrow({ from: [680, 474], to: [440, 474], color: 'var(--line-2)', width: 3, dash: '8 10', headSize: 12 });
  D.node({ id: 'ldh', x: 560, y: 370, label: 'Lactate dehydrogenase', kind: 'enz', size: 24, tip: { title: 'Lactate dehydrogenase (LDH)', body: '<b>Reversible.</b> Pyruvate + NADH ⇌ lactate + NAD⁺.', src: SRC(13) } });
  // NAD⁺ / NADH recycling loop between LDH and step 4
  D.node({ id: 'gapdh', x: 560, y: 760, label: 'Step 4 · G3P dehydrogenase', kind: 'enz', color: 'var(--nadh)', size: 24, tip: { title: 'Why recycle NAD⁺?', body: 'Step 4 (oxidation) needs NAD⁺. Without O₂, LDH regenerates NAD⁺ so glycolysis keeps running.', src: SRC('7, 13') } });
  const up = D.arrow({ d: 'M640,730 C700,650 700,560 640,505', from: [640, 730], to: [640, 505], color: 'var(--nadh)', width: 4, label: 'NADH', labelColor: 'var(--nadh)', labelSide: -1, labelOffset: 70, labelAnchor: 'start' });
  const down = D.arrow({ d: 'M480,505 C420,560 420,650 480,730', from: [480, 505], to: [480, 730], color: 'var(--act)', width: 4, label: 'NAD⁺', labelColor: 'var(--act)', labelSide: -1, labelOffset: 70, labelAnchor: 'end' });
  const fTCA = D.flow(toTCA, { count: 3, color: 'var(--prot)', speed: 150, r: 10 });
  const fL = D.flow(fwd, { count: 3, color: 'var(--a2)', speed: 150, r: 10 });
  const fN1 = D.flow(up, { count: 2, color: 'var(--nadh)', speed: 130, r: 8 });
  const fN2 = D.flow(down, { count: 2, color: 'var(--act)', speed: 130, r: 8 });
  const set = (aer) => {
    [toTCA.g, mito, D.nodes.tca.g].forEach((g) => gsap.to(g, { opacity: aer ? 1 : 0.22, duration: 0.6 }));
    [fwd.g, rev.g, up.g, down.g, D.nodes.lac.g, D.nodes.ldh.g, D.nodes.gapdh.g].forEach((g) => gsap.to(g, { opacity: aer ? 0.22 : 1, duration: 0.6 }));
    gsap.to(o2, { opacity: aer ? 1 : 0.15, duration: 0.6 });
    aer ? fTCA.play() : fTCA.hide();
    [fL, fN1, fN2].forEach((f) => (aer ? f.hide() : f.play()));
  };
  const t = toggle({ label: 'Oxygen available', on: true, onChange: set });
  ctrlBar(el, [t], { left: 0, bottom: 0 });
  set(true);
  return { step: (n) => t.set(n === 0), destroy: () => D.destroy() };
}

// 14 · RBC: two pathways (Sankey ribbons)
function rbcSankeyViz(el) {
  const D = diagram(el, 960, 860);
  const ribbon = (x0, y0, h0, x1, y1, h1, col) => {
    const xm = (x0 + x1) / 2;
    const d = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h1} C${xm},${y1 + h1} ${xm},${y0 + h0} ${x0},${y0 + h0} Z`;
    D.layers.edges.append(s('path', { d, style: `fill:${col};opacity:.22` }));
    D.layers.edges.append(s('path', { d: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1}`, style: `fill:none;stroke:${col};stroke-width:2;opacity:.6` }));
    D.layers.edges.append(s('path', { d: `M${x0},${y0 + h0} C${xm},${y0 + h0} ${xm},${y1 + h1} ${x1},${y1 + h1}`, style: `fill:none;stroke:${col};stroke-width:2;opacity:.6` }));
    const c = s('path', { d: `M${x0},${y0 + h0 / 2} C${xm},${y0 + h0 / 2} ${xm},${y1 + h1 / 2} ${x1},${y1 + h1 / 2}`, style: 'fill:none;stroke:none' });
    D.layers.fx.append(c);
    return c;
  };
  // source bar
  D.layers.nodes.append(s('rect', { x: 150, y: 330, width: 22, height: 200, rx: 11, style: `fill:${GLU}` }));
  D.text(160, 300, 'Glucose', { anchor: 'middle', cls: 'lg', style: `fill:${GLU}` });
  const big = ribbon(172, 330, 160, 640, 150, 160, 'var(--a1)');
  const small = ribbon(172, 490, 40, 640, 650, 40, 'var(--a2)');
  D.node({ id: 'lac', x: 790, y: 230, label: 'Lactate', sub: 'Embden–Meyerhof', kind: 'mol', color: 'var(--a1)', size: 32, tip: { title: 'Embden–Meyerhof pathway', body: '75–85% of RBC glucose → lactate. Anaerobic glycolysis is the RBC’s only ATP source.', src: SRC(14) } });
  D.node({ id: 'bpg', x: 790, y: 670, label: '2,3-BPG', sub: 'Luebering–Rapoport', kind: 'mol', color: 'var(--a2)', size: 32, tip: { title: 'Luebering–Rapoport shunt', body: '15–25% of glucose → 2,3-BPG, which <b>lowers haemoglobin’s O₂ affinity</b> and helps O₂ release.', src: SRC(14) } });
  D.text(330, 432, '75–85%', { anchor: 'middle', cls: 'xl', style: 'fill:var(--a1)' });
  D.text(300, 640, '15–25%', { anchor: 'middle', cls: 'lg', style: 'fill:var(--a2)' });
  D.badge(790, 90, 'ATP → shape · ion pumps', { color: 'var(--atp)', size: 22, w: 320 });
  D.badge(790, 790, '↓ Hb O₂ affinity → O₂ release', { color: 'var(--a2)', size: 22, w: 380 });
  D.flow(big, { count: 8, color: 'var(--atp)', speed: 170, r: 10 });
  D.flow(small, { count: 2, color: 'var(--a2)', speed: 170, r: 8 });
  return { destroy: () => D.destroy() };
}

// 15 · Regulation control panel
function regulationViz(el) {
  const D = diagram(el, 1712, 720);
  const X = 560;
  const steps = [
    { id: 'glc', y: 40, label: 'Glucose' },
    { id: 'v1', y: 150, label: 'Hexokinase · Glucokinase', enz: true },
    { id: 'g6p', y: 255, label: 'Glucose-6-P' },
    { id: 'v2', y: 360, label: 'Phosphofructokinase-1', enz: true },
    { id: 'f16', y: 465, label: 'Fructose-1,6-bisP' },
    { id: 'v3', y: 570, label: 'Pyruvate kinase', enz: true },
    { id: 'pyr', y: 680, label: 'Pyruvate' },
  ];
  const rail = s('path', { d: `M${X},40 L${X},680`, style: 'fill:none;stroke:var(--line-2);stroke-width:5;stroke-linecap:round' });
  D.layers.edges.append(rail);
  const nodes = {};
  steps.forEach((st) => { nodes[st.id] = D.node({ id: st.id, x: X, y: st.y, label: st.label, kind: st.enz ? 'enz' : 'mol', size: st.enz ? 27 : 26, color: st.enz ? 'var(--elec)' : undefined }); });
  const flowPath = s('path', { d: `M${X},40 L${X},680`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(flowPath);
  const fl = D.flow(flowPath, { count: 6, color: 'var(--a1)', speed: 110, r: 11 });

  // regulator chips
  const REG = [
    { v: 'v1', side: -1, t: 'Glucose-6-P', eff: -1, only: 'Inhibits <b>hexokinase</b> only (not glucokinase).' },
    { v: 'v2', side: -1, t: 'ATP · citrate', eff: -1, only: 'Energy-rich signals slow PFK-1.' },
    { v: 'v2', side: 1, t: 'AMP · ADP', eff: 1, only: 'Energy-poor signals speed PFK-1.' },
    { v: 'v2', side: 1, t: 'Fructose-2,6-BP', eff: 1, dy: 60, only: 'Potent activator of PFK-1.' },
    { v: 'v3', side: -1, t: 'ATP · alanine', eff: -1, only: 'Inhibit pyruvate kinase.' },
    { v: 'v3', side: 1, t: 'Fructose-1,6-BP', eff: 1, ff: true, only: '<b>Feed-forward</b> activation: an earlier product switches on a later enzyme.' },
  ];
  const state = { v1: 1, v2: 1, v3: 1 };
  const active = new Set();
  const chipEls = [];
  REG.forEach((r, i) => {
    const base = nodes[r.v];
    const y = base.y + (r.dy || 0) - (r.v === 'v2' && r.side === 1 && !r.dy ? 30 : 0) + (r.v === 'v2' && r.side === -1 ? 0 : 0);
    const x = X + r.side * 330;
    const col = r.eff > 0 ? 'var(--act)' : 'var(--inh)';
    const g = s('g', { style: 'cursor:pointer' });
    const w = r.t.length * 15 + 70;
    const rect = s('rect', { x: x - w / 2, y: y - 28, width: w, height: 56, rx: 28, style: `fill:color-mix(in oklab, ${col} 10%, transparent);stroke:color-mix(in oklab, ${col} 50%, transparent);stroke-width:2;transition:all .3s` });
    const tx = s('text', { x, y: y + 9, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${col};font-weight:650` });
    tx.textContent = `${r.eff > 0 ? '+' : '−'} ${r.t}`;
    g.append(rect, tx);
    const line = s('path', { d: `M${x - r.side * (w / 2 + 6)},${y} L${X + r.side * (base.w0 / 2 + 10)},${base.y}`, style: `fill:none;stroke:${col};stroke-width:3;stroke-dasharray:6 8;opacity:.35` });
    D.layers.edges.append(line);
    D.layers.labels.append(g);
    g.setAttribute('data-tip', JSON.stringify({ title: `${r.eff > 0 ? 'Activator' : 'Inhibitor'} · ${r.t}`, body: r.only + '<br><span style="color:var(--fg-3)">Click to toggle</span>', src: SRC(15) }));
    g.addEventListener('click', () => { active.has(i) ? active.delete(i) : active.add(i); recompute(); });
    chipEls.push({ g, rect, line, r, col });
  });
  // feed-forward arc
  const ff = D.arrow({ d: `M${X + 120},465 C${X + 230},480 ${X + 230},555 ${X + 140},568`, from: [X + 120, 465], to: [X + 140, 568], color: 'var(--act)', width: 4 });
  ff.g.style.opacity = 0;

  // hormones
  const H = [
    { id: 'ins', x: 1330, y: 230, t: 'Insulin', col: 'var(--act)', eff: 1, body: 'Acts on glucokinase, PFK-1 and pyruvate kinase. Insulin <b>induces</b> these enzymes (transcription) and favours their active, dephosphorylated forms.' },
    { id: 'glg', x: 1330, y: 500, t: 'Glucagon', col: 'var(--inh)', eff: -1, body: 'Acts on glucokinase, PFK-1 and pyruvate kinase. Glucagon <b>represses</b> them; via cAMP it phosphorylates (inactivates) liver pyruvate kinase and lowers fructose-2,6-BP.' },
  ];
  const hState = { ins: false, glg: false };
  const hEls = H.map((hm) => {
    const n = D.node({ x: hm.x, y: hm.y, label: hm.t, kind: 'box', w: 260, h: 84, size: 32, color: hm.col, tip: { kicker: 'Hormonal · transcription & covalent', title: hm.t, body: hm.body + '<br><span style="color:var(--fg-3)">Arrows on the slide carry no signs — direction per Lippincott. Click to toggle.</span>', src: `${SRC(15)} · Lippincott Ch 8` } });
    n.g.style.cursor = 'pointer';
    const lines = ['v1', 'v2', 'v3'].map((v) => {
      const p = s('path', { d: `M${hm.x - 130},${hm.y} C${hm.x - 330},${hm.y} ${X + 360},${nodes[v].y} ${X + nodes[v].w0 / 2 + 14},${nodes[v].y}`, style: `fill:none;stroke:${hm.col};stroke-width:3;opacity:.12` });
      D.layers.edges.append(p);
      return p;
    });
    n.g.addEventListener('click', () => { hState[hm.id] = !hState[hm.id]; recompute(); });
    return { n, lines, hm };
  });
  D.text(1330, 110, 'HORMONES', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--fg-3)' });
  D.text(X - 330, 40, 'INHIBITORS', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--inh)' });
  D.text(X + 330, 40, 'ACTIVATORS', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--act)' });

  function recompute() {
    state.v1 = state.v2 = state.v3 = 1;
    chipEls.forEach((c, i) => {
      const on = active.has(i);
      c.rect.style.fill = on ? `color-mix(in oklab, ${c.col} 32%, transparent)` : `color-mix(in oklab, ${c.col} 10%, transparent)`;
      c.rect.style.strokeWidth = on ? 4 : 2;
      c.line.style.opacity = on ? 1 : 0.35;
      c.line.style.strokeDasharray = on ? 'none' : '6 8';
      if (on) state[c.r.v] *= c.r.eff > 0 ? 1.7 : 0.35;
    });
    ff.g.style.opacity = [...active].some((i) => REG[i].ff) ? 1 : 0;
    hEls.forEach(({ n, lines, hm }) => {
      const on = hState[hm.id];
      n.shape.style.strokeWidth = on ? 5 : 2;
      lines.forEach((p) => { p.style.opacity = on ? 0.9 : 0.12; });
      if (on) ['v1', 'v2', 'v3'].forEach((v) => (state[v] *= hm.eff > 0 ? 1.5 : 0.45));
    });
    ['v1', 'v2', 'v3'].forEach((v) => {
      const f = state[v];
      const col = f > 1.05 ? 'var(--act)' : f < 0.95 ? 'var(--inh)' : 'var(--elec)';
      nodes[v].shape.style.stroke = col;
      nodes[v].shape.style.fill = `color-mix(in oklab, ${col} ${f > 1.05 || f < 0.95 ? 24 : 14}%, transparent)`;
    });
    const flux = Math.min(state.v1, state.v2, state.v3);
    fl.dots.forEach((d) => (d.style.display = ''));
    fl.pause();
    const speed = Math.max(25, Math.min(260, 110 * flux));
    fl.destroy();
    flRef.cur = D.flow(flowPath, { count: Math.max(2, Math.round(6 * Math.min(1.6, flux))), color: flux < 0.95 ? 'var(--inh)' : flux > 1.05 ? 'var(--act)' : 'var(--a1)', speed, r: 11 });
  }
  const flRef = { cur: fl };
  const reset = h('button.btn', { style: 'position:absolute;right:0;bottom:0;font-size:22px;height:56px;padding:0 26px', text: 'Reset', onclick: () => { active.clear(); hState.ins = hState.glg = false; recompute(); } });
  el.append(reset);
  return { leave: () => flRef.cur.pause(), enter: () => flRef.cur.play(), destroy: () => D.destroy() };
}

// 16 · Arsenate & fluoride
function poisonViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 0, y: 0, w: 960, h: 470, r: 36, label: 'Arsenate · step 4', labelColor: 'var(--inh)' });
  D.region({ x: 0, y: 500, w: 960, h: 360, r: 36, label: 'Fluoride · step 6', labelColor: 'var(--inh)' });
  D.node({ id: 'g3p', x: 130, y: 250, label: 'G3P', kind: 'mol' });
  D.node({ id: 'bpg', x: 480, y: 250, label: '1,3-BPG', kind: 'mol' });
  D.node({ id: 'pg3', x: 830, y: 250, label: '3-PG', kind: 'mol' });
  D.arrow({ from: 'g3p', to: 'bpg', width: 4, label: 'G3P dehydrogenase', labelSide: -1, labelColor: 'var(--ink)' });
  const toPG = D.arrow({ from: 'bpg', to: 'pg3', width: 4 });
  const piBadge = D.badge(300, 360, 'P_{i}', { color: P });
  const asBadge = D.badge(300, 360, 'Arsenate', { color: 'var(--inh)', w: 150 });
  asBadge.style.opacity = 0;
  const atp = D.badge(655, 150, 'ATP', { color: 'var(--atp)' });
  const atpX = D.text(655, 96, '✕ lost', { anchor: 'middle', cls: 'sm', style: 'fill:var(--inh);font-weight:700;opacity:0' });
  const atpA = D.arrow({ from: [655, 235], to: [655, 162], color: 'var(--atp)', width: 3, headSize: 12 });
  const bypass = D.arrow({ d: 'M480,300 C560,420 760,420 830,300', from: [480, 300], to: [830, 300], color: 'var(--inh)', width: 4, dash: '10 10', label: 'spontaneous hydrolysis', labelColor: 'var(--inh)', labelSide: 1, labelOffset: 60 });
  bypass.g.style.opacity = 0;
  const net = D.text(130, 420, 'Net ATP from glycolysis: 2', { cls: 'sm', style: 'font-weight:650;fill:var(--fg-2)' });
  // fluoride
  D.node({ id: 'pg2', x: 200, y: 700, label: '2-PG', kind: 'mol' });
  D.node({ id: 'pep', x: 760, y: 700, label: 'PEP', kind: 'mol' });
  const eno = D.arrow({ from: 'pg2', to: 'pep', width: 4, label: 'Enolase', labelSide: -1, labelOffset: 58, labelColor: 'var(--ink)' });
  const block = s('g', { style: 'opacity:0' });
  block.append(s('circle', { cx: 480, cy: 700, r: 34, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:5' }));
  block.append(s('path', { d: 'M458,678 L502,722 M502,678 L458,722', style: 'stroke:var(--inh);stroke-width:6;stroke-linecap:round' }));
  D.layers.labels.append(block);
  const fE = D.flow(eno, { count: 3, color: 'var(--a1)', speed: 160, r: 9 });
  const fA = D.flow(toPG, { count: 2, color: 'var(--a1)', speed: 140, r: 9 });
  const setAs = (on) => {
    gsap.to(piBadge, { opacity: on ? 0 : 1, duration: 0.4 });
    gsap.to(asBadge, { opacity: on ? 1 : 0, duration: 0.4 });
    gsap.to([atp, atpA.g, toPG.g], { opacity: on ? 0.2 : 1, duration: 0.5 });
    gsap.to(atpX, { opacity: on ? 1 : 0, duration: 0.5 });
    gsap.to(bypass.g, { opacity: on ? 1 : 0, duration: 0.5 });
    on ? fA.hide() : fA.play();
    net.textContent = `Net ATP from glycolysis: ${on ? 0 : 2}`;
    net.style.fill = on ? 'var(--inh)' : 'var(--fg-2)';
  };
  const setF = (on) => { gsap.to(block, { opacity: on ? 1 : 0, duration: 0.4 }); on ? fE.hide() : fE.play(); gsap.to(eno.g, { opacity: on ? 0.3 : 1, duration: 0.4 }); };
  const tA = toggle({ label: 'Arsenate', danger: true, onChange: setAs });
  const tF = toggle({ label: 'Fluoride', danger: true, onChange: setF });
  ctrlBar(el, [tA], { right: 24, top: 24 });
  ctrlBar(el, [tF], { right: 24, top: 524 });
  return { step: (n) => { tA.set(n >= 1); tF.set(n >= 2); }, destroy: () => D.destroy() };
}

// 17 · Fluoride tube (illustrative)
function tubeViz(el) {
  const C = chart(el, { w: 1500, h: 360, pad: { l: 60, b: 70, t: 20, r: 300 }, x: { min: 0, max: 4, label: 'Time after collection →', ticks: false }, y: { min: 0, max: 1.1, ticks: false } });
  const plain = C.line((t) => 1 - 0.12 * t, { color: 'var(--inh)', width: 6, label: 'No fluoride: glucose falls', labelAt: 4, labelDy: 10 });
  const naf = C.line(() => 1, { color: 'var(--act)', width: 6, label: 'Fluoride: glucose preserved', labelAt: 4, labelDy: 10 });
  plain.show(false); naf.show(false);
  return { step: (n) => { plain.show(n >= 1); naf.show(n >= 1); if (n === 1) { plain.draw(1.2); naf.draw(1.2, 0.3); } } };
}

// 18 · PK deficiency: RBC morph
function pkdViz(el) {
  const sc = rbcScene(el, { count: 6 });
  const lbl = sc.kit.label('Biconcave · flexible', [0, 3.6, 0], { cls: 'acc' });
  return {
    ...sc,
    step(n) {
      sc.morph(n >= 3 ? 1 : n >= 2 ? 0.25 : 0, 1.8);
      lbl.element.innerHTML = n >= 3 ? 'Spiculated · rigid' : n >= 2 ? 'Losing K⁺ and water' : n >= 1 ? 'ATP ↓' : 'Biconcave · flexible';
      lbl.element.style.color = n >= 1 ? 'var(--inh)' : '';
      gsap.to(sc.cell.scale, { x: n >= 4 ? 0.85 : 1, y: n >= 4 ? 0.85 : 1, z: n >= 4 ? 0.85 : 1, duration: 1 });
    },
  };
}

// 19 · Clinical case
function caseViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '620px 1fr';
  el.style.gap = '48px';
  const card = h('div.case', {}, [
    h('div.tag', { html: '● Clinical case' }),
    h('p', { html: 'An <b>18-year-old boy</b> with <b>hemolytic anemia</b> and prominent <b>spiculated cells</b> on the blood film.' }),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:14px;margin-top:34px' }, [
      h('span.chip.inh', { style: 'font-size:28px', text: '↓ Pyruvate' }),
      h('span.chip.inh', { style: 'font-size:28px', text: '↑ Phosphoenolpyruvate' }),
    ]),
  ]);
  const qs = [
    ['Which enzyme is affected?', '<b>Pyruvate kinase</b> — substrate (PEP) high, product (pyruvate) low.'],
    ['Why RBCs, not muscle?', 'RBCs lack mitochondria: glycolysis is their <b>only</b> ATP source.'],
    ['Why spiculated cells & splenomegaly?', '↓ATP → Na⁺/K⁺ pump fails → cells shrink, become rigid → spleen destroys them.'],
    ['Why is 2,3-BPG high?', 'Block at PK backs up intermediates → more 1,3-BPG diverted to the <b>Luebering–Rapoport shunt</b>.'],
    ['Why is the anemia tolerated?', 'High 2,3-BPG ↓ Hb O₂ affinity → O₂ still delivered efficiently.'],
  ];
  const list = h('div', { style: 'display:grid;gap:18px;align-content:center' });
  const ans = qs.map(([q, a]) => {
    const A = h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:8px;line-height:1.35', html: a });
    const row = h('div', { style: 'padding:18px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line)' }, [h('div', { style: 'font-size:30px;font-weight:650;letter-spacing:-.01em', html: q }), A]);
    list.append(row);
    return A;
  });
  el.append(card, list);
  return { step: (n) => ans.forEach((a, i) => gsap.to(a, { opacity: i < n ? 1 : 0, height: i < n ? 'auto' : 0, marginTop: i < n ? 8 : 0, duration: 0.5 })) };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry, Ch 8 — Glycolysis',
    'Lecture slides: Glycolysis (L.11), NUST College of Medicine',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.11',
      title: 'Glycolysis',
      subtitle: 'One glucose. Two pyruvate. A net of two ATP.',
      meta: ['Cytosol', 'Aerobic & anaerobic', '6 learning outcomes'],
      notes: [
        'Welcome. Glycolysis is the first pathway every cell uses to extract energy from glucose.',
        'The model on the right is a real 3D structure of β-D-glucose (PubChem coordinates). Drag it to rotate.',
        'Roadmap: transport → the 7 events → energy → fate of pyruvate → RBCs → regulation → poisons → PK deficiency.',
      ],
      visual: (el) => moleculeScene(el, 'b-glucose', { fill: 0.86, mol: { hideH: false }, autoRotate: 1.4 }),
    },
    {
      layout: 'cards',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      class: 'cards-3',
      cards: [
        { big: '01', k: 'L.11.1', title: 'Purpose & transport', tip: { title: 'L.11.1', body: 'Describe the overall purpose of glycolysis, its cellular localization, its tissue distribution, and its transport into cells.' } },
        { big: '02', k: 'L.11.2', title: 'Steps & regulation', tip: { title: 'L.11.2', body: 'Discuss the steps in glycolysis, with energetics and regulation.' } },
        { big: '03', k: 'L.11.3', title: 'Fate of NADH', tip: { title: 'L.11.3', body: 'Describe the role and fate of the cytosolic NADH produced in glycolysis.' } },
        { big: '04', k: 'L.11.4', title: 'Substrate-level P', tip: { title: 'L.11.4', body: 'Explain the concept of substrate level phosphorylation and why it is important.' } },
        { big: '05', k: 'L.11.5', title: 'Hexokinase vs glucokinase', tip: { title: 'L.11.5', body: 'Differentiate the roles of hexokinase and glucokinase in blood glucose regulation.' } },
        { big: '06', k: 'L.11.6', title: 'PK deficiency', tip: { title: 'L.11.6', body: 'Explain the biochemical basis of the hemolytic anemia observed in deficiency of erythrocyte pyruvate kinase.' } },
      ],
      notes: 'Hover any card to show the full SLO wording from the slide.',
    },
    {
      eyebrow: 'Background',
      title: 'Glucose → <em>pyruvate</em>',
      bullets: [
        { t: '<b>Oxidative</b> breakdown of glucose', tip: 'Glycolysis is the oxidative breakdown of glucose into pyruvate.' },
        { t: 'First step of <b>aerobic respiration</b>', tip: 'Aerobic glycolysis is the first step of aerobic cellular respiration: glucose is completely used to make energy, CO₂ and water.' },
        { t: 'Happens in the <b>cytosol</b>', tip: 'All glycolytic enzymes are cytosolic. Pyruvate then enters mitochondria (aerobic).' },
      ],
      src: SRC(3),
      notes: ['Glycolysis = oxidative breakdown of glucose to pyruvate.', 'Aerobic glycolysis is step 1 of cellular respiration → CO₂ + H₂O + energy.', 'Location: cytosol. Watch the glowing glucose (blue) split into two pyruvate (orange) that head into mitochondria.'],
      visual: (el) => {
        const sc = cellScene(el);
        sc.kit.label('Cytosol · glycolysis', [-3.2, -4.2, 3], { cls: 'acc' });
        sc.kit.label('Mitochondrion', [3.4, -2.4, 1.6], { cls: 'sm' });
        sc.kit.label('Nucleus', [-1.6, 2.6, -1.2], { cls: 'sm plain' });
        return sc;
      },
    },
    {
      layout: 'full',
      eyebrow: 'Transport into cells',
      title: 'Getting glucose <em>inside</em>',
      bullets: [{ t: 'SGLT · active, with Na⁺' }, { t: 'GLUT · facilitated, down gradient' }],
      steps: 3,
      src: SRC('4–6'),
      notes: [
        'Build 1 — Intestine: SGLT-1 on the brush border co-transports glucose with Na⁺ (secondary active, symport). Glucose accumulates against its gradient.',
        'The basolateral Na⁺/K⁺ pump keeps cell Na⁺ low, maintaining the gradient.',
        'Build 2 — GLUT-2 lets glucose leave into blood by facilitated diffusion (uniport).',
        'Build 3 — Tissues take it up through tissue-specific GLUTs; GLUT-4 (muscle, fat) is insulin-dependent. Then glycolysis in the cytosol.',
      ],
      visual: transportViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Two kinds of door',
      title: 'GLUT vs SGLT',
      cards: [
        { k: 'Facilitated diffusion', title: 'GLUT', list: ['Down the gradient', 'Bidirectional', 'Affinity differs by type'], viz: (v) => gradientMini(v, 'glut'), tip: { title: 'Glucose transporters (GLUT)', body: 'Allow facilitated diffusion of glucose down its concentration gradient. Bidirectional. Different GLUT classes show different affinities for glucose.', src: SRC(5) } },
        { k: 'Secondary active', title: 'SGLT', list: ['Against the gradient', 'Powered by Na⁺ moving down', 'SGLT1 gut · SGLT2 kidney'], viz: (v) => gradientMini(v, 'sglt'), tip: { title: 'Sodium–glucose transporters (SGLT)', body: 'Transport glucose actively against its gradient; energy from Na⁺ moving down its gradient. SGLT1: small intestine. SGLT2: proximal renal tubule.', src: SRC(5) } },
      ],
      notes: 'GLUT = passive; SGLT = secondary active using the Na⁺ gradient. SGLT1 small intestine, SGLT2 proximal tubule.',
    },
    {
      eyebrow: 'GLUT isoforms',
      title: 'Different K<sub>m</sub>, different job',
      bullets: [
        { t: '<b>GLUT-3</b> · brain — lowest K<sub>m</sub>', step: 1, tip: 'Uptake by brain and neurons even when blood glucose is low → highest affinity (lowest Km).' },
        { t: '<b>GLUT-1</b> · most tissues — low K<sub>m</sub>', step: 2, tip: 'Basal uptake by almost all tissues when blood glucose is normal.' },
        { t: '<b>GLUT-4</b> · muscle, fat — insulin', step: 3, tip: 'Insulin-dependent uptake by skeletal muscle and adipose tissue. Km: medium.' },
        { t: '<b>GLUT-2</b> · liver, pancreas — highest K<sub>m</sub>', step: 4, tip: 'Lets liver and pancreas sense high blood glucose and respond. Lowest affinity (highest Km).' },
      ],
      steps: 4,
      src: 'Lecture slide 6 · curve shapes illustrative; K<sub>m</sub> order from the lecture',
      notes: [
        'Puzzle from slide 6: only GLUT-4 is given (medium). Ask the room to rank the others before revealing.',
        'Lower Km = higher affinity. GLUT-3 stays saturated even in hypoglycaemia — protects the brain.',
        'GLUT-2 barely works at low glucose — a perfect glucose sensor for liver and β-cells.',
        'Drag the blood-glucose slider to show saturation of each transporter.',
      ],
      visual: glutKmViz,
    },
    {
      layout: 'full',
      eyebrow: 'The pathway',
      title: 'Seven chemical <em>events</em>',
      bullets: [{ t: 'Invest 2 ATP' }, { t: 'Harvest 4 ATP + 2 NADH' }],
      steps: 9,
      src: 'Lecture slides 7–8',
      notes: [
        'Press → to walk the molecule through each event. Counters update live.',
        '1 · Phosphorylation (hexokinase/glucokinase): ATP spent → glucose-6-P.',
        '2 · Phosphorylation (PFK-1): second ATP → fructose-1,6-bisP.',
        '3 · Splitting (aldolase): 6C → two 3C molecules. Everything after happens twice.',
        '4 · Oxidation (G3P dehydrogenase + NAD⁺): Pi added, NADH made.',
        '5 · Dephosphorylation (phosphoglycerate kinase): ATP by SLP.',
        '6 · Dehydration (enolase): water removed → PEP.',
        '7 · Dephosphorylation (pyruvate kinase): ATP by SLP → pyruvate.',
        'Build 8: enzyme names + the 3 control enzymes (1, 2, 7). Build 9: poisons — arsenate at 4, fluoride at 6.',
      ],
      visual: pathwayViz,
    },
    {
      layout: 'full',
      eyebrow: 'Up close · canonical 10 reactions',
      title: 'Every intermediate, in 3D',
      bullets: [{ t: '3 irreversible steps' }, { t: 'Real molecular structures' }],
      steps: 9,
      src: 'Lippincott Ch 8 (adds the 3 isomerase/mutase steps not drawn on slide 7)',
      notes: [
        'The textbook splits the 7 events into 10 reactions by adding phosphoglucose isomerase, triose-phosphate isomerase and phosphoglycerate mutase.',
        'Irreversible (gold rings): hexokinase/glucokinase, PFK-1, pyruvate kinase — the same 3 control enzymes.',
        'Each structure is a real PubChem 3D conformer. Click any row or press →.',
      ],
      visual: tenStepViz,
    },
    {
      eyebrow: 'Glucose sensing',
      title: 'Hexokinase vs <em>glucokinase</em>',
      bullets: [
        { t: '<b>Hexokinase</b> · all tissues · low K<sub>m</sub>', tip: { title: 'Hexokinase', list: ['Substrate: all hexoses', 'Site: all tissues', 'High affinity · low Km (0.1 mM)', 'Not induced by insulin', 'Inhibited by glucose-6-P', 'Role: glycolysis for energy'], src: SRC(9) } },
        { t: '<b>Glucokinase</b> · liver, β-cells · high K<sub>m</sub>', tip: { title: 'Glucokinase', list: ['Substrate: glucose only', 'Site: liver and pancreatic β-cells', 'Low affinity · high Km (10 mM)', 'Induced by insulin', 'Not inhibited by glucose-6-P', 'Role: storage / glucose sensing'], src: SRC(9) } },
        { t: 'Low K<sub>m</sub> = <b>high affinity</b>', tip: 'Affinity is inversely related to Km.' },
      ],
      src: 'Lecture slide 9 · curve shapes after Lippincott Fig. 8',
      notes: [
        'Hexokinase saturates at very low glucose — every tissue gets glucose for energy.',
        'Glucokinase only works hard when glucose is high (after meals) — liver stores it, β-cells sense it.',
        'Toggle ↑G6P: hexokinase drops (product inhibition); glucokinase does not.',
        'Toggle insulin off: less glucokinase (it is insulin-induced).',
      ],
      visual: hkgkViz,
    },
    {
      eyebrow: 'Energy currencies',
      title: 'Two ways to make <em>ATP</em>',
      bullets: [
        { t: '<b>SLP</b>: ATP made directly in the pathway', tip: 'Substrate-level phosphorylation: a high-energy substrate hands its phosphate to ADP.' },
        { t: '<b>OxPhos</b>: NADH, FADH₂ → ATP in mitochondria' },
        { t: 'Only SLP works without O₂', tip: 'Why SLP matters: it is the only ATP source in cells without mitochondria (RBCs) or without oxygen.' },
      ],
      src: SRC(10),
      notes: ['NADH = 3 (older) / 2.5 (current) ATP; FADH₂ = 2 / 1.5 ATP.', 'Glycolysis makes 4 ATP by SLP (steps 5 and 7, twice each).'],
      visual: slpViz,
    },
    {
      eyebrow: 'Critical thinking',
      title: 'Net energy per glucose?',
      bullets: [
        { t: 'Net <b>2 ATP + 2 NADH</b>' },
        { t: 'Anaerobic: <b>2 ATP</b>' },
        { t: 'Aerobic: NADH adds <b>6 or 5</b>', tip: 'With NADH = 3 ATP: 2 + 6 = 8. With NADH = 2.5: 2 + 5 = 7.' },
      ],
      src: 'Lecture slides 10–11',
      notes: [
        'Slide 11 asks: net energy when glucose → pyruvate? Options 2/4/6/8/10.',
        'Using the lecture’s value NADH = 3: 2 ATP + 2×3 = 8 (most likely intended answer).',
        'State assumptions: anaerobic → 2; glycerol-phosphate shuttle → 6; NADH = 2.5 → 7.',
      ],
      visual: yieldViz,
    },
    {
      eyebrow: 'Fate of pyruvate',
      title: 'Oxygen decides',
      bullets: [
        { t: 'O₂ present → <b>TCA cycle</b>' },
        { t: 'No O₂ → <b>lactate</b> (LDH)' },
        { t: 'LDH regenerates <b>NAD⁺</b>', tip: 'Step 4 needs NAD⁺. Re-oxidising NADH to NAD⁺ via LDH lets glycolysis keep running without oxygen.' },
      ],
      steps: 1,
      src: SRC(13),
      notes: ['Toggle oxygen (or press →).', 'Anaerobic: pyruvate + NADH → lactate + NAD⁺. The NAD⁺ loops back to step 4.', 'LDH is reversible.'],
      visual: fateViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Anaerobic glycolysis',
      title: 'Where O₂ can’t keep up',
      cards: [
        { icon: 'rbc', k: 'No mitochondria', title: 'Red cells', body: 'Anaerobic glycolysis is their only ATP source.', tip: { title: 'RBCs', body: 'Mature RBCs lack mitochondria.', src: SRC('12, 14') } },
        { icon: 'eye', k: 'Low O₂ supply', title: 'Cornea · lens · kidney medulla', body: 'Little oxygen reaches them.', tip: { title: 'Poorly oxygenated tissues', body: 'Cornea and lens are avascular; the renal medulla is poorly oxygenated.', src: SRC(12) } },
        { icon: 'bolt', k: 'High demand', title: 'Exercising muscle', body: 'O₂ demand outpaces supply.', tip: { title: 'Vigorous exercise', body: 'Skeletal muscle shifts to anaerobic glycolysis → lactate.', src: SRC(12) } },
        { icon: 'alert', k: 'When it goes wrong', title: 'Lactic acidosis', body: 'Excess lactate.', style: 'border-color:color-mix(in oklab, var(--inh) 45%, transparent)', tip: { kicker: 'Lactic acidosis', title: 'Causes & features', list: ['Causes: tissue hypoxia, organ failure, enzyme deficiencies, drugs', 'Nausea, vomiting, severe abdominal pain', 'Rapid deep breathing (hyperventilation)', 'Fatigue, weakness, cramps', 'Confusion, dizziness, lethargy'], src: SRC(12) } },
      ],
      notes: 'Sites from slide 12. Hover the lactic acidosis card for causes and clinical features.',
    },
    {
      eyebrow: 'Glycolysis in RBCs',
      title: 'One cell, <em>two</em> routes',
      bullets: [
        { t: 'No mitochondria → <b>anaerobic only</b>' },
        { t: 'ATP keeps <b>shape</b> & runs <b>ion pumps</b>' },
        { t: '2,3-BPG helps <b>release O₂</b>' },
      ],
      src: SRC(14),
      notes: ['Embden–Meyerhof: 75–85% of glucose → lactate (ATP).', 'Luebering–Rapoport shunt: 15–25% → 2,3-BPG → lowers Hb O₂ affinity → O₂ release.'],
      visual: rbcSankeyViz,
    },
    {
      layout: 'full',
      eyebrow: 'Regulation',
      title: 'Three control <em>valves</em>',
      bullets: [{ t: 'Click any regulator' }, { t: 'Allosteric · covalent · transcription' }],
      src: 'Lecture slide 15 · hormone directions per Lippincott Ch 8',
      notes: [
        'Click chips to switch regulators on; the valves change colour and the flux responds.',
        'PFK-1: inhibited by ATP, citrate; activated by AMP, ADP, fructose-2,6-BP.',
        'Pyruvate kinase: inhibited by ATP, alanine; feed-forward activated by fructose-1,6-BP.',
        'Hexokinase: inhibited by glucose-6-P (not glucokinase).',
        'Insulin and glucagon act on GK, PFK-1, PK — insulin induces, glucagon represses / phosphorylates liver PK.',
      ],
      visual: regulationViz,
    },
    {
      eyebrow: 'Poisons',
      title: 'Arsenate & <em>fluoride</em>',
      bullets: [
        { t: '<b>Arsenate</b> mimics P<sub>i</sub>', tip: { title: 'Arsenate poisoning', body: 'Targets glyceraldehyde-3-P dehydrogenase by resembling Pi. The arsenate product breaks down spontaneously, so the ATP of the next step is never made (net ATP falls to zero).', list: ['Nausea, vomiting', 'Severe diarrhea, abdominal pain', 'Signs of shock'], src: `${SRC(16)} · Lippincott` } },
        { t: '→ next ATP is <b>lost</b>' },
        { t: '<b>Fluoride</b> blocks enolase' },
      ],
      steps: 2,
      src: 'Lecture slides 8, 16',
      notes: ['Build 1: arsenate replaces Pi at step 4 → 1-arseno-3-PG hydrolyses spontaneously → no ATP at phosphoglycerate kinase.', 'Build 2: fluoride inhibits enolase (step 6).'],
      visual: poisonViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Critical thinking',
      title: 'Why are glucose samples drawn into <em>fluoride</em> tubes?',
      subtitle: 'Fluoride blocks enolase → blood cells stop using glucose → no falsely low result.',
      steps: 1,
      src: 'Lecture slides 8, 20 · curves illustrative',
      notes: 'Ask first. Then press → to reveal: fluoride inhibits enolase, halting glycolysis in the tube.',
      visual: tubeViz,
      subtitleStep: 1,
    },
    {
      eyebrow: 'Clinical correlation',
      title: 'Pyruvate kinase <em>deficiency</em>',
      bullets: [
        { t: 'PK gene mutation → <b>↓ ATP</b>', step: 1 },
        { t: 'Na⁺/K⁺ pump fails · K⁺ leaks out', step: 2, tip: 'Sodium leaks in slowly; potassium leaks out very rapidly → net loss of cations and water.' },
        { t: 'Cells shrink → <b>spiculated</b>', step: 3 },
        { t: 'Spleen destroys them → <b>hemolysis</b>', step: 4 },
        { t: '↑ 2,3-BPG → anemia <b>tolerated</b>', step: 5, tip: 'Glucose is diverted to the Luebering–Rapoport shunt → high 2,3-BPG → Hb releases O₂ more easily.' },
      ],
      steps: 5,
      src: 'Lecture slides 17–18',
      notes: [
        'Genetic disorder of the PK gene. Slide calls it the “2nd most common genetic cause of hemolytic anemia” — textbooks: 2nd most common RBC enzyme deficiency after G6PD.',
        'Chain: ↓ATP → pump failure → K⁺ out fast, Na⁺ in slow → shrink, rigid, spiculated → splenic destruction.',
        'Backlog raises 2,3-BPG → right shift → good O₂ delivery → patients tolerate the anemia.',
      ],
      visual: pkdViz,
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · case',
      title: 'Put it together',
      steps: 5,
      src: 'Lecture slide 19',
      notes: 'Ask each question to the audience, then press → to reveal the answer.',
      visual: caseViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { big: '2', title: 'net ATP', body: '+ 2 NADH per glucose (anaerobic: 2 ATP).' },
        { big: '3', title: 'control enzymes', body: 'HK/GK · PFK-1 · pyruvate kinase.' },
        { big: '2', title: 'poisons', body: 'Arsenate (step 4) · fluoride (enolase).' },
        { big: '80%', title: 'RBC → lactate', body: '75–85% lactate · 15–25% 2,3-BPG.' },
      ],
      notes: 'Recap the four numbers, then open the question bank.',
    },
  ],
};
