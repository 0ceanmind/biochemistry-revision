// Enzyme Classification & Kinetics (L.6 – L.7) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { chart } from '../viz/chart.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glowSprite, glossy, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { loadPDB, buildProtein, proteinMorph } from '../viz/protein.js';

const gsap = window.gsap;

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */
const SRC = (p) => `Lecture slide ${p}`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const avg3 = (pts) => { const c = [0, 0, 0]; pts.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return c.map((v) => v / pts.length); };

// 1-based slide numbers (for SLO links and the factor strip)
const SL = { holo: 5, ec: 6, ea: 9, mech: 11, spec: 13, coenz: 16, vit: 17, fE: 19, fS: 20, fT: 21, fpH: 22, fP: 23, mm: 24, km: 25, lb: 26 };

// IUBMB classes — one colour each, used everywhere the class appears
const EC = [
  {
    n: 1, L: 'O', name: 'Oxidoreductases', type: 'Oxidation–reduction', col: 'var(--nadh)',
    tip: { kicker: 'EC 1', title: 'Oxidoreductases', body: 'Catalyse coupled oxidation–reduction: one substrate is <b>oxidised</b> while another is <b>reduced</b>. Common coenzymes: NAD⁺, NADP⁺, FAD, FMN.', list: ['Lactate dehydrogenase (NAD⁺)', 'Succinate dehydrogenase (FAD)', 'L-Malate dehydrogenase (NAD⁺)'], src: SRC('6–7, 27') },
  },
  {
    n: 2, L: 'T', name: 'Transferases', type: 'Transfer of functional groups', col: 'var(--prot)',
    tip: { kicker: 'EC 2', title: 'Transferases', body: 'Transfer a functional group — <b>phosphate, amino, methyl or acyl</b> — from one molecule to another.', list: ['Kinases: glucose + ATP → glucose-6-P + ADP', 'Aminotransferases move amino groups (with PLP)', 'DNA methyltransferases: methyl from SAM'], src: `${SRC('8, 27, 33')} · slide 8’s “Aminotransferases” panel actually shows serine hydroxymethyltransferase (a one-carbon transfer)` },
  },
  {
    n: 3, L: 'H', name: 'Hydrolases', type: 'Hydrolytic bond cleavage', col: 'var(--fadh)',
    tip: { kicker: 'EC 3', title: 'Hydrolases', body: 'Use <b>water</b> to cleave bonds in a substrate.', list: ['Glycosidic: amylase, lactase, maltase', 'Peptide: pepsin, trypsin', 'Ester: pancreatic lipase', 'Urease · acetylcholinesterase'], src: SRC('9, 27') },
  },
  {
    n: 4, L: 'L', name: 'Lyases', type: 'Non-hydrolytic bond cleavage', col: 'var(--inh)',
    tip: { kicker: 'EC 4', title: 'Lyases', body: '<b>Non-hydrolytic</b> cleavage of C–C, C–S, C–N or C–O bonds. One substrate commonly forms two products.', list: ['Histidine decarboxylase: histidine → histamine + CO₂', 'Pyruvate decarboxylase: pyruvate → acetaldehyde + CO₂ (a yeast / microbial enzyme)'], src: SRC(10) },
  },
  {
    n: 5, L: 'I', name: 'Isomerases', type: 'Intramolecular rearrangement', col: 'var(--act)',
    tip: { kicker: 'EC 5', title: 'Isomerases', body: 'Convert <b>one isomer into another</b> by intramolecular rearrangement.', list: ['Phosphoglucomutase: glucose-1-P ⇌ glucose-6-P', 'Methylmalonyl-CoA mutase: methylmalonyl-CoA ⇌ succinyl-CoA'], src: SRC(11) },
  },
  {
    n: 6, L: 'L', name: 'Ligases', type: 'Joining molecules using ATP', col: 'var(--atp)',
    tip: { kicker: 'EC 6', title: 'Ligases', body: '<i>Ligare</i> = “to bind”. Join two molecules with a new bond; energy usually from <b>ATP hydrolysis</b>.', list: ['Pyruvate carboxylase: pyruvate + CO₂ + ATP → oxaloacetate (biotin)'], src: SRC('12, 33') },
  },
];

// Reactions animated for each class (lecture examples)
const RX = [
  { enzyme: 'Lactate dehydrogenase', rule: 'One substrate oxidised · another reduced', left: ['Lactate', 'NAD^{+}'], right: ['Pyruvate', 'NADH + H^{+}'], rev: true, mover: { t: '2H', from: 0, to: 1, below: true, arc: 70 } },
  { enzyme: 'Kinase', rule: 'A phosphate group moves from ATP to glucose', left: ['Glucose', 'ATP'], right: ['Glucose-6-P', 'ADP'], mover: { t: 'P', from: 1, to: 0 } },
  { enzyme: 'Urease', rule: 'Water splits the bond', left: ['Urea', 'H_{2}O'], right: ['CO_{2}', '2 NH_{3}'], mover: { t: 'H_{2}O', from: 1, to: 'mid' } },
  { enzyme: 'Histidine decarboxylase', rule: 'Bond broken without water · one substrate → two products', left: ['Histidine'], right: ['Histamine', 'CO_{2}'], mover: { t: 'CO_{2}', from: 0, to: 1, arc: 40 } },
  { enzyme: 'Phosphoglucomutase', rule: 'Same atoms, rearranged within one molecule', iso: ['Glucose-1-phosphate', 'Glucose-6-phosphate'] },
  { enzyme: 'Pyruvate carboxylase', rule: 'Two molecules joined · ATP spent', left: ['Pyruvate', 'CO_{2}', 'ATP'], right: ['Oxaloacetate', 'ADP + P_{i}'], mover: { t: 'CO_{2}', from: 1, to: 0 } },
];

/** SVG capsule with a centred label. Positioned with gsap x/y. */
function pill(parent, label, o = {}) {
  const fs = o.size ?? 28;
  const plain = String(label).replace(/[_^]\{([^}]*)\}/g, '$1');
  const w = o.w ?? Math.max(o.minW ?? 90, plain.length * fs * 0.56 + fs * 1.5);
  const hh = o.h ?? Math.round(fs * 1.9);
  const col = o.color;
  const g = s('g');
  const rect = s('rect', { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: hh / 2, style: `fill:${col ? `color-mix(in oklab, ${col} 15%, var(--bg))` : 'var(--bg-2)'};stroke:${col ? `color-mix(in oklab, ${col} 62%, transparent)` : 'var(--line-2)'};stroke-width:2.5` });
  const t = s('text', { y: fs * 0.36, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${fs}px;font-weight:${o.weight ?? 620};fill:${o.textColor || 'var(--fg)'}` });
  setRich(t, label);
  g.append(rect, t);
  parent.append(g);
  gsap.set(g, { x: o.x ?? 0, y: o.y ?? 0 });
  Object.assign(g, { _w: w, _h: hh, _x: o.x ?? 0, _y: o.y ?? 0, _rect: rect, _text: t });
  if (o.tip) tip(g, o.tip);
  return g;
}

/** Plain SVG text helper. */
function txt(parent, x, y, str, style = '', anchor = 'start', cls = 'v-label') {
  const t = s('text', { x, y, 'text-anchor': anchor, class: cls, style });
  setRich(t, str);
  parent.append(t);
  return t;
}

/** Horizontal arrow with a solid head. */
function hArrow(parent, x1, x2, y, o = {}) {
  const col = o.color || 'var(--fg-3)', w = o.width ?? 4, hs = o.head ?? 16;
  const dir = Math.sign(x2 - x1) || 1;
  const g = s('g');
  g.append(s('path', { d: `M${x1},${y} L${x2 - dir * hs * 0.7},${y}`, style: `stroke:${col};stroke-width:${w};stroke-linecap:round;fill:none${o.dash ? `;stroke-dasharray:${o.dash}` : ''}` }));
  g.append(s('path', { d: `M${x2},${y} L${x2 - dir * hs},${y - hs * 0.55} L${x2 - dir * hs},${y + hs * 0.55} Z`, style: `fill:${col}` }));
  parent.append(g);
  return g;
}

/** Scissors glyph, blades pointing down, centred at 0,0. */
function scissors(parent, col = 'var(--inh)', sc = 2.1) {
  const outer = s('g');
  const g = s('g', { transform: `scale(${sc}) rotate(90) translate(-13 -12)`, style: `fill:none;stroke:${col};stroke-width:${2.4};stroke-linecap:round` });
  g.append(s('circle', { cx: 6.5, cy: 7, r: 2.6 }), s('circle', { cx: 6.5, cy: 17, r: 2.6 }), s('path', { d: 'M8.6 8.5 20 17M8.6 15.5 20 7' }));
  outer.append(g);
  parent.append(outer);
  return outer;
}

/**
 * Animated reaction: reactant pills → arrow (enzyme) → product pills, with a coloured
 * "moving part" travelling across. L: {lx, rx, cy, gap, size, ax1, ax2, arc, enzSize}
 */
function reactionScene(parent, spec, L, color) {
  const g = s('g');
  parent.append(g);
  const col = color || 'var(--a1)';
  if (spec.iso) return isoScene(g, spec, L, col);
  const mk = (arr, x) => arr.map((lab, i) => pill(g, lab, { size: L.size, x, y: L.cy + (i - (arr.length - 1) / 2) * L.gap }));
  const left = mk(spec.left, L.lx), right = mk(spec.right, L.rx);
  if (spec.rev) {
    hArrow(g, L.ax1, L.ax2, L.cy - 9, { width: 3.5, head: 14 });
    hArrow(g, L.ax2, L.ax1, L.cy + 9, { width: 3.5, head: 14 });
  } else hArrow(g, L.ax1, L.ax2, L.cy, { width: 4 });
  if (spec.enzyme) txt(g, (L.ax1 + L.ax2) / 2, L.cy - (spec.rev ? 30 : 24), spec.enzyme, `font-size:${L.enzSize ?? L.size}px;font-weight:680;fill:${col}`, 'middle');
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, paused: true });
  tl.set(left, { opacity: 1 }, 0).set(right, { opacity: 0.16 }, 0);
  if (spec.mover) {
    const m = spec.mover;
    const src = left[m.from];
    const p0 = [src._x + src._w / 2 - 8, src._y];
    const dst = m.to === 'mid' ? null : right[m.to];
    const p1 = dst ? [dst._x - dst._w / 2 + 8, dst._y] : [(L.ax1 + L.ax2) / 2, L.cy];
    const top = m.below ? Math.max(p0[1], p1[1]) + (m.arc ?? L.arc ?? 70) : Math.min(p0[1], p1[1]) - (m.arc ?? L.arc ?? 70);
    const d = `M${p0[0]},${p0[1]} Q${(p0[0] + p1[0]) / 2},${top} ${p1[0]},${p1[1]}`;
    const trail = s('path', { d, style: `fill:none;stroke:${col};stroke-width:3;stroke-dasharray:3 11;stroke-linecap:round;opacity:0` });
    g.prepend(trail);
    const path = s('path', { d, style: 'fill:none;stroke:none' });
    g.append(path);
    const mover = pill(g, m.t, { size: Math.round(L.size * 0.86), color: col, textColor: col, weight: 760 });
    const len = path.getTotalLength();
    const prog = { t: 0 };
    const place = () => { const p = path.getPointAtLength(prog.t * len); gsap.set(mover, { x: p.x, y: p.y }); };
    place();
    gsap.set(mover, { opacity: 0 });
    tl.call(() => { prog.t = 0; place(); }, null, 0)
      .set(mover, { opacity: 0 }, 0)
      .set(trail, { opacity: 0 }, 0)
      .to(mover, { opacity: 1, duration: 0.3 }, 0.25)
      .to(trail, { opacity: 0.55, duration: 0.4 }, 0.4)
      .to(prog, { t: 1, duration: 1.5, ease: 'power1.inOut', onUpdate: place }, 0.55)
      .to(left, { opacity: 0.32, duration: 0.5 }, 1.8)
      .to(right, { opacity: 1, duration: 0.5 }, 1.85)
      .to(mover, { opacity: 0, duration: 0.35 }, 2.1)
      .to(trail, { opacity: 0, duration: 0.5 }, 2.4)
      .to({}, { duration: 1.3 });
  } else {
    tl.to(left, { opacity: 0.32, duration: 0.5 }, 1).to(right, { opacity: 1, duration: 0.5 }, 1.1).to({}, { duration: 1.6 });
  }
  return { g, tl, left, right };
}

/** Isomerase: one 6-carbon token; the phosphate hops C1 → C6 within the same molecule. */
function isoScene(g, spec, L, col) {
  const cx = (L.ax1 + L.ax2) / 2, cy = L.cy + (L.isoDy ?? 0);
  const fs = L.size;
  const sp = fs * 1.25;
  const w = sp * 7, hh = fs * 1.9;
  g.append(s('rect', { x: cx - w / 2, y: cy - hh / 2, width: w, height: hh, rx: hh / 2, style: `fill:color-mix(in oklab, ${col} 12%, var(--bg));stroke:color-mix(in oklab, ${col} 60%, transparent);stroke-width:2.5` }));
  const bx = (i) => cx - sp * 2.5 + i * sp;
  for (let i = 0; i < 6; i++) g.append(s('circle', { cx: bx(i), cy, r: fs * 0.34, style: 'fill:var(--c-carbon)' }));
  txt(g, bx(0), cy + hh / 2 + fs * 0.95, 'C1', `font-size:${Math.max(22, fs * 0.8)}px;fill:var(--fg-3);font-weight:650`, 'middle');
  txt(g, bx(5), cy + hh / 2 + fs * 0.95, 'C6', `font-size:${Math.max(22, fs * 0.8)}px;fill:var(--fg-3);font-weight:650`, 'middle');
  const lblA = txt(g, cx, cy + hh / 2 + fs * 2.3, spec.iso[0], `font-size:${fs}px;font-weight:650`, 'middle');
  const lblB = txt(g, cx, cy + hh / 2 + fs * 2.3, spec.iso[1], `font-size:${fs}px;font-weight:650;fill:${col}`, 'middle');
  lblB.style.opacity = 0;
  if (spec.enzyme) { if (L.isoLabel === 'left') txt(g, cx - w / 2 - 22, cy + fs * 0.36, spec.enzyme, `font-size:${L.enzSize ?? fs}px;font-weight:680;fill:${col}`, 'end'); else txt(g, cx, cy - fs * 4.3, spec.enzyme, `font-size:${L.enzSize ?? fs}px;font-weight:680;fill:${col}`, 'middle'); }
  const P = s('g');
  P.append(s('circle', { r: fs * 0.66, style: 'fill:var(--prot)' }));
  txt(P, 0, fs * 0.3, 'P', `font-size:${fs * 0.85}px;font-weight:800;fill:#1d1d1f`, 'middle');
  g.append(P);
  const y0 = cy - hh / 2 - fs * 0.75;
  const path = s('path', { d: `M${bx(0)},${y0} Q${cx},${cy - fs * 4.6} ${bx(5)},${y0}`, style: `fill:none;stroke:${col};stroke-width:3;stroke-dasharray:3 11;stroke-linecap:round;opacity:.5` });
  g.prepend(path);
  const len = path.getTotalLength();
  const prog = { t: 0 };
  const place = () => { const p = path.getPointAtLength(prog.t * len); gsap.set(P, { x: p.x, y: p.y }); };
  place();
  const tl = gsap.timeline({ repeat: -1, paused: true });
  tl.to(prog, { t: 1, duration: 1.4, ease: 'power2.inOut', onUpdate: place }, 0.5)
    .to(lblA, { opacity: 0, duration: 0.3 }, 1.6).to(lblB, { opacity: 1, duration: 0.4 }, 1.8)
    .to(prog, { t: 0, duration: 1.4, ease: 'power2.inOut', onUpdate: place }, 3.6)
    .to(lblB, { opacity: 0, duration: 0.3 }, 4.7).to(lblA, { opacity: 1, duration: 0.4 }, 4.9)
    .to({}, { duration: 0.6 });
  return { g, tl, left: [], right: [] };
}

/** Learning-check card: question, a live mini-visual and options that reveal the answer. */
function qCard({ n, q, opts, correct, why, list = false, kicker }) {
  const card = h('div', { style: 'position:relative;display:flex;flex-direction:column;gap:18px;padding:32px 38px;border-radius:36px;background:var(--surface);border:1px solid var(--line);overflow:hidden;min-height:0' });
  card.append(h('div', { style: 'font-size:22px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--ink)', text: kicker || `Question ${n}` }));
  card.append(h('div', { style: 'font-size:31px;line-height:1.28;font-weight:620;letter-spacing:-.012em', html: q }));
  const viz = h('div', { style: 'position:relative;flex:1;min-height:0' });
  card.append(viz);
  const box = h('div', { style: list ? 'display:grid;gap:10px' : 'display:flex;flex-wrap:wrap;gap:12px' });
  const items = opts.map((o, i) => {
    const it = h('div', { style: `display:flex;align-items:center;gap:14px;padding:${list ? '11px 18px 11px 10px' : '8px 22px 8px 8px'};border-radius:${list ? '20px' : '999px'};background:var(--surface-2);border:2px solid transparent;font-size:${list ? 25 : 26}px;line-height:1.25;transition:opacity .45s var(--ease), border-color .45s var(--ease), background .45s var(--ease)` }, [
      h('span', { style: 'width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;font:700 20px var(--font);background:var(--bg);border:1px solid var(--line-2)', text: 'ABCDE'[i] }),
      h('span', { html: o }),
    ]);
    box.append(it);
    return it;
  });
  card.append(box);
  const ans = h('div', { style: 'font-size:26px;line-height:1.35;color:var(--fg-2);opacity:0;transform:translateY(10px);transition:opacity .5s var(--ease), transform .5s var(--ease)', html: why });
  card.append(ans);
  return {
    el: card, viz,
    reveal(on) {
      items.forEach((it, i) => {
        const ok = i === correct;
        it.style.opacity = on && !ok ? 0.35 : 1;
        it.style.borderColor = on && ok ? 'var(--act)' : 'transparent';
        it.style.background = on && ok ? 'color-mix(in oklab, var(--act) 16%, transparent)' : 'var(--surface-2)';
        it.firstChild.style.background = on && ok ? 'var(--act)' : 'var(--bg)';
        it.firstChild.style.color = on && ok ? '#fff' : '';
      });
      ans.style.opacity = on ? 1 : 0;
      ans.style.transform = on ? 'none' : 'translateY(10px)';
    },
  };
}

/** Row of factor pills shown on every "factors affecting velocity" slide. */
const FACTORS = [
  { t: 'Enzyme', full: 'Enzyme concentration', go: SL.fE },
  { t: 'Substrate', full: 'Substrate concentration', go: SL.fS },
  { t: 'Temp', full: 'Temperature', go: SL.fT },
  { t: 'pH', full: 'pH', go: SL.fpH },
  { t: 'Product', full: 'Product concentration', go: SL.fP },
];
function factorStrip(el, active, ctx, pos = 'left:0;top:0', extraPill = true, compact = false) {
  const bar = h('div', { style: `position:absolute;${pos};display:flex;gap:8px;align-items:center;z-index:4` });
  FACTORS.forEach((f, i) => {
    const on = i === active;
    const p = h('div', { style: `font-size:${compact ? 20 : 22}px;font-weight:${on ? 680 : 560};padding:${compact ? '7px 12px' : '8px 16px'};border-radius:999px;cursor:pointer;white-space:nowrap;border:1px solid ${on ? 'color-mix(in oklab, var(--a1) 60%, transparent)' : 'var(--line)'};background:${on ? 'color-mix(in oklab, var(--a1) 18%, transparent)' : 'var(--surface)'};color:${on ? 'var(--ink)' : 'var(--fg-2)'}`, html: `<span style="font-family:var(--mono);opacity:.55;margin-right:8px">${i + 1}</span>${f.t}` });
    tip(p, { kicker: 'Factors affecting velocity', title: f.full, body: on ? 'You are here.' : 'Click to jump to this factor.', src: SRC(36) });
    p.addEventListener('click', () => ctx?.deck?.go(f.go - 1, 0));
    bar.append(p);
  });
  const extra = h('div', { style: 'font-size:22px;padding:8px 14px;border-radius:999px;border:1px dashed var(--line-2);color:var(--fg-3);white-space:nowrap', text: '+ inhibitors' });
  tip(extra, { title: 'Activators & inhibitors', body: 'Listed as the fifth factor on slide 36, but not taught in this lecture — see the next lecture (enzyme inhibition).', src: SRC(36) });
  if (extraPill) bar.append(extra);
  el.append(bar);
  return bar;
}

/* ------------------------------------------------------------------ */
/* Slide visuals                                                       */
/* ------------------------------------------------------------------ */

// 1 · Hero: real glucokinase ribbon with glucose in the active site
async function heroViz(el) {
  const kit = createScene(el, { cam: [50, 18, 140], fov: 30, autoRotate: 0.5 });
  const pdb = await loadPDB('1V4S');
  const SS = { H: 0x0a84ff, E: 0x64d2ff, C: 0xb4bcc8 };
  const prot = buildProtein(pdb, { colorBy: (ci, i, ss) => SS[ss] ?? SS.C, hets: ['GLC'], hetScale: 1.6, hetColor: 0xffd60a });
  kit.root.add(prot);
  const c = prot.userData.center;
  const glc = pdb.het.find((x) => x.name === 'GLC');
  const gc = avg3(glc.atoms.map((a) => [a[2], a[3], a[4]]));
  const gp = new THREE.Vector3(gc[0] - c.x, gc[1] - c.y, gc[2] - c.z);
  const halo = glowSprite(0xffd60a, 20);
  halo.position.copy(gp);
  prot.add(halo);
  kit.onFrame((dt, t) => { halo.material.opacity = 0.45 + 0.35 * Math.sin(t * 2); });
  kit.fit(prot, 1.42);
  kit.label('Glucose', [gp.x, gp.y + 7, gp.z], { cls: 'acc', parent: prot });
  el.append(h('div', { style: 'position:absolute;left:0;right:0;top:6px;text-align:center;font-size:22px;color:var(--fg-3);pointer-events:none', text: 'Human glucokinase · real crystal structure (PDB 1V4S)' }));
  return kitController(kit);
}

// 2 · Learning outcomes board (click to jump)
const SLOS = [
  { code: 'L.6.1', t: 'Enzyme & active site', full: 'Define enzyme and its active site.', go: SL.holo, p: 2 },
  { code: 'L.6.2', t: 'IUBMB classification', full: 'Classify enzymes according to IUBMB nomenclature, with examples.', go: SL.ec, p: 2 },
  { code: 'L.6.3', t: 'Activation energy', full: 'Define activation energy.', go: SL.ea, p: 2 },
  { code: 'L.6.4', t: 'Mechanism of action', full: 'Explain the mechanism of enzyme action.', go: SL.mech, p: 2 },
  { code: 'L.6.5', t: 'Types of specificity', full: 'Describe the major types of enzyme specificity.', go: SL.spec, p: 2 },
  { code: 'L.7.1', t: 'Cofactors & coenzymes', full: 'Define cofactors and coenzymes and explain their mechanism of action.', go: SL.coenz, p: 29 },
  { code: 'L.7.2', t: 'Classify coenzymes', full: 'Classify coenzymes.', go: SL.vit, p: 29 },
  { code: 'L.7.3', t: 'Factors affecting velocity', full: 'List and discuss the factors affecting enzyme-catalysed reactions, with the help of suitable graphs.', go: SL.fE, p: 29 },
  { code: 'L.7.4', t: 'Michaelis–Menten equation', full: 'Explain the salient features of the Michaelis–Menten equation.', go: SL.mm, p: 29 },
  { code: 'L.7.5', t: 'Lineweaver–Burk plot', full: 'Describe the importance of Lineweaver–Burk plots.', go: SL.lb, p: 29 },
];
function sloViz(el, ctx) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '40px';
  const rows = [];
  const col = (head, sub, items) => {
    const c = h('div', { style: 'display:flex;flex-direction:column;gap:16px;min-width:0' });
    c.append(h('div', { style: 'display:flex;align-items:baseline;gap:18px;margin:0 0 6px 6px' }, [
      h('div', { style: 'font-size:32px;font-weight:700;letter-spacing:-.015em', text: head }),
      h('div', { style: 'font-size:24px;color:var(--fg-3)', text: sub }),
    ]));
    items.forEach((r) => {
      const row = h('div', { style: 'display:grid;grid-template-columns:110px 1fr auto;align-items:center;gap:20px;padding:25px 28px;border-radius:26px;background:var(--surface);border:1px solid var(--line);cursor:pointer;transition:background .3s var(--ease), transform .3s var(--ease)' }, [
        h('div', { style: 'font:600 24px var(--mono);color:var(--ink)', text: r.code }),
        h('div', { style: 'font-size:33px;font-weight:620;letter-spacing:-.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', html: r.t }),
        h('div', { style: 'font:600 22px var(--mono);color:var(--fg-3)', text: `→ ${r.go}` }),
      ]);
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--surface-2)'; row.style.transform = 'translateX(6px)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'var(--surface)'; row.style.transform = ''; });
      row.addEventListener('click', () => ctx.deck.go(r.go - 1, 0));
      tip(row, { kicker: `${r.code} · slide ${r.p}`, title: r.t, body: r.full, src: `Covered on slide ${r.go} — click to jump` });
      c.append(row);
      rows.push(row);
    });
    return c;
  };
  el.append(col('Session 6', 'Classification', SLOS.slice(0, 5)), col('Session 7', 'Kinetics', SLOS.slice(5)));
  return { enter: () => gsap.fromTo(rows, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out', stagger: 0.05, delay: 0.25 }) };
}

// 5 · Apoenzyme + cofactor → holoenzyme (animated assembly)
function holoViz(el) {
  const D = diagram(el, 960, 860);
  const L = D.layers;
  // Equation row
  const eq = [
    { t: 'Apoenzyme', x: 165, col: 'var(--fg)' },
    { t: '+', x: 320, col: 'var(--fg-3)' },
    { t: 'Cofactor', x: 455, col: 'var(--fadh)' },
    { t: '=', x: 600, col: 'var(--fg-3)' },
    { t: 'Holoenzyme', x: 775, col: 'var(--act)' },
  ].map((e) => txt(L.labels, e.x, 70, e.t, `font-size:40px;font-weight:700;letter-spacing:-.02em;fill:${e.col}`, 'middle'));
  const eqSub = txt(L.labels, 455, 112, 'coenzyme or metal ion', 'font-size:24px;fill:var(--fg-3);font-weight:560', 'middle');
  // Apoenzyme
  const APO = 'M250,540 C245,390 320,320 392,336 C428,344 440,376 442,408 C444,450 518,450 520,408 C522,376 534,344 570,336 C642,320 717,390 712,540 C707,688 606,758 481,758 C356,758 255,688 250,540 Z';
  const apo = s('path', { d: APO, style: 'fill:color-mix(in oklab, var(--a2) 30%, var(--bg));stroke:color-mix(in oklab, var(--a2) 75%, transparent);stroke-width:3' });
  L.nodes.append(apo);
  tip(apo, { title: 'Apoenzyme', body: 'The <b>protein</b> component. On its own it is inactive when it needs a cofactor.', src: SRC(5) });
  txt(L.labels, 760, 690, 'Apoenzyme', 'font-size:30px;font-weight:680', 'start');
  txt(L.labels, 760, 724, 'protein part', 'font-size:24px;fill:var(--fg-2)', 'start');
  L.labels.append(s('path', { d: 'M752,680 L700,650', style: 'stroke:var(--fg-3);stroke-width:2' }));
  // status chip inside apoenzyme
  const status = pill(L.labels, 'inactive', { size: 26, x: 481, y: 610, color: 'var(--fg-3)', textColor: 'var(--fg-2)' });
  // Coenzyme (organic, lilac, two-lobed)
  const coOuter = s('g'); const coInner = s('g');
  coInner.append(s('path', { d: 'M-34,-40 C-10,-52 10,-52 34,-40 C50,-30 46,-6 30,0 C46,6 50,30 34,40 C10,52 -10,52 -34,40 C-50,30 -46,6 -30,0 C-46,-6 -50,-30 -34,-40 Z', style: 'fill:color-mix(in oklab, var(--fadh) 55%, var(--bg));stroke:var(--fadh);stroke-width:3' }));
  const coLbl = txt(coInner, 0, -72, 'Coenzyme', 'font-size:28px;font-weight:680;fill:var(--fadh)', 'middle');
  const coSub = txt(coInner, 0, 88, 'organic · from vitamins', 'font-size:24px;fill:var(--fg-2)', 'middle');
  coOuter.append(coInner);
  L.nodes.append(coOuter);
  tip(coOuter, { title: 'Coenzyme', body: 'Small, <b>heat-stable organic</b> molecule, usually derived from vitamins. Acts as a <b>cosubstrate</b>.', src: SRC(30) });
  // Metal cofactor
  const meOuter = s('g'); const meInner = s('g');
  meInner.append(s('circle', { r: 24, style: 'fill:color-mix(in oklab, var(--o2) 60%, var(--bg));stroke:var(--o2);stroke-width:3' }));
  const meLbl = txt(meInner, 0, -44, 'Metal ion', 'font-size:28px;font-weight:680;fill:var(--o2)', 'middle');
  const meSub = txt(meInner, 0, 58, 'Mg²⁺ · Zn²⁺ · Fe²⁺ · Cu²⁺', 'font-size:24px;fill:var(--fg-2)', 'middle');
  meOuter.append(meInner);
  L.nodes.append(meOuter);
  tip(meOuter, { title: 'Metal cofactor', body: '<b>Inorganic ions</b> required for enzyme activity — e.g. Mg²⁺, Zn²⁺, Fe²⁺, Cu²⁺.', src: SRC(30) });
  // Catalytic site glow + holoenzyme bracket
  const site = s('g', { style: 'opacity:0' });
  const ring = s('circle', { cx: 446, cy: 352, r: 20, filter: `url(#${D.glowId})`, style: 'fill:color-mix(in oklab, var(--atp) 60%, transparent);stroke:var(--atp);stroke-width:3' });
  site.append(ring);
  txt(site, 650, 250, 'Catalytic site', 'font-size:26px;font-weight:650;fill:var(--atp)', 'middle');
  site.append(s('path', { d: 'M612,262 L466,344', style: 'stroke:var(--atp);stroke-width:2' }));
  L.fx.append(site);
  const bracket = s('g', { style: 'opacity:0' });
  bracket.append(s('path', { d: 'M250,780 L250,800 L712,800 L712,780 M481,800 L481,816', style: 'fill:none;stroke:var(--act);stroke-width:3;stroke-linecap:round' }));
  txt(bracket, 481, 850, 'Holoenzyme · active', 'font-size:30px;font-weight:700;fill:var(--act)', 'middle');
  L.labels.append(bracket);

  const CO_START = [150, 250], CO_DOCK = [481, 398];
  const ME_START = [820, 250], ME_DOCK = [404, 318];
  gsap.set(coOuter, { x: CO_START[0], y: CO_START[1] });
  gsap.set(meOuter, { x: ME_START[0], y: ME_START[1] });
  const bobCo = gsap.to(coInner, { y: -12, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  const bobMe = gsap.to(meInner, { y: 10, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.4 });
  const pulse = gsap.to(ring, { attr: { r: 30 }, opacity: 0.55, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true });
  const eqLights = (n) => {
    gsap.to(eq[0], { opacity: 1, duration: 0.4 });
    gsap.to([eq[1], eq[2], eqSub], { opacity: n >= 1 ? 1 : 0.25, duration: 0.4 });
    gsap.to([eq[3], eq[4]], { opacity: n >= 3 ? 1 : 0.25, duration: 0.4 });
  };
  return {
    step(n) {
      const co = n >= 1, me = n >= 2, holo = n >= 3;
      gsap.to(coOuter, { x: co ? CO_DOCK[0] : CO_START[0], y: co ? CO_DOCK[1] : CO_START[1], duration: 1, ease: 'power3.inOut' });
      co ? bobCo.pause() : bobCo.play();
      gsap.to(coInner, { y: 0, duration: co ? 0.5 : 0 });
      gsap.to([coLbl, coSub], { opacity: co ? 0 : 1, duration: 0.4 });
      gsap.to(meOuter, { x: me ? ME_DOCK[0] : ME_START[0], y: me ? ME_DOCK[1] : ME_START[1], duration: 1, ease: 'power3.inOut' });
      me ? bobMe.pause() : bobMe.play();
      gsap.to(meInner, { y: 0, duration: me ? 0.5 : 0 });
      gsap.to([meLbl, meSub], { opacity: me ? 0 : 1, duration: 0.4 });
      gsap.to(site, { opacity: holo ? 1 : 0, duration: 0.6, delay: holo ? 0.3 : 0 });
      holo ? pulse.play() : pulse.pause();
      gsap.to(bracket, { opacity: holo ? 1 : 0, duration: 0.6, delay: holo ? 0.5 : 0 });
      setRich(status._text, holo ? 'active' : 'inactive');
      status._text.style.fill = holo ? 'var(--act)' : 'var(--fg-2)';
      status._rect.style.stroke = holo ? 'var(--act)' : 'color-mix(in oklab, var(--fg-3) 62%, transparent)';
      eqLights(n);
    },
    leave: () => { bobCo.pause(); bobMe.pause(); pulse.pause(); },
    destroy: () => { [bobCo, bobMe, pulse].forEach((t) => t.kill()); D.destroy(); },
  };
}

// 6 · IUBMB: six interactive class cards + animated reaction stage
function ecViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateRows = '226px 1fr';
  el.style.gap = '22px';
  const row = h('div', { style: 'display:grid;grid-template-columns:repeat(6,1fr);gap:18px' });
  const cards = EC.map((c, i) => {
    const card = h('div', { style: 'position:relative;border-radius:28px;padding:20px 24px;background:var(--surface);border:2px solid var(--line);cursor:pointer;display:flex;flex-direction:column;gap:4px;transition:transform .45s var(--ease), border-color .35s var(--ease), background .35s var(--ease), opacity .35s var(--ease);overflow:hidden' }, [
      h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between' }, [
        h('div', { style: `font:780 80px/0.95 var(--font);letter-spacing:-.04em;color:${c.col}`, text: c.L }),
        h('div', { style: 'font:600 22px var(--mono);color:var(--fg-3)', text: `EC ${c.n}` }),
      ]),
      h('div', { style: 'font-size:28px;font-weight:680;letter-spacing:-.015em;margin-top:6px', text: c.name }),
      h('div', { style: 'font-size:22px;line-height:1.25;color:var(--fg-2)', text: c.type }),
    ]);
    card.addEventListener('click', () => select(i + 1));
    tip(card, c.tip);
    row.append(card);
    return card;
  });
  const stage = h('div', { style: 'position:relative;border-radius:36px;background:var(--surface);border:1px solid var(--line);overflow:hidden' });
  el.append(row, stage);
  const D = diagram(stage, 1712, 470);
  let cur = -1, tl = null, sceneG = null, live = false;
  const overview = (g) => {
    const letters = EC.map((c, i) => txt(g, 856 + (i - 2.5) * 180, 236, c.L, `font-size:160px;font-weight:780;letter-spacing:-.04em;fill:${c.col}`, 'middle', ''));
    txt(g, 856, 330, 'Six classes · named by the reaction catalysed', 'font-size:36px;font-weight:620;fill:var(--fg)', 'middle');
    txt(g, 856, 392, 'Mnemonic OTHLIL · click a class or press →', 'font-size:26px;fill:var(--fg-3)', 'middle');
    gsap.from(letters, { opacity: 0, y: 30, duration: 0.8, ease: 'expo.out', stagger: 0.07 });
  };
  function select(i) {
    if (i === cur) return;
    cur = i;
    cards.forEach((c, k) => {
      const on = k === i - 1;
      c.style.borderColor = on ? EC[k].col : 'var(--line)';
      c.style.background = on ? `color-mix(in oklab, ${EC[k].col} 14%, transparent)` : 'var(--surface)';
      c.style.transform = on ? 'translateY(-6px)' : '';
      c.style.opacity = i === 0 || on ? 1 : 0.5;
    });
    if (tl) tl.kill();
    tl = null;
    const old = sceneG;
    if (old) gsap.to(old, { opacity: 0, duration: 0.25, onComplete: () => old.remove() });
    sceneG = s('g');
    D.layers.nodes.append(sceneG);
    gsap.fromTo(sceneG, { opacity: 0 }, { opacity: 1, duration: 0.45, delay: 0.15 });
    if (i === 0) { overview(sceneG); return; }
    const c = EC[i - 1], spec = RX[i - 1];
    const r = reactionScene(sceneG, spec, { lx: 330, rx: 1380, cy: 236, gap: 96, size: 30, ax1: 600, ax2: 1110, arc: 80, enzSize: 32, isoDy: 26 }, c.col);
    txt(sceneG, 856, 436, `${c.name} · ${spec.rule}`, 'font-size:28px;fill:var(--fg-2);font-weight:560', 'middle');
    tl = r.tl;
    if (live) tl.play(0);
  }
  select(0);
  return {
    enter() { live = true; tl?.play(); },
    leave() { live = false; tl?.pause(); },
    step(n) { select(n); },
    destroy() { tl?.kill(); D.destroy(); },
  };
}

// 7 · Learning check (slide 26): D→L-alanine (3D mirror pair) + ester hydrolysis
async function lc1Viz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '36px';
  const q1 = qCard({ n: 1, q: 'D-Alanine is converted to L-alanine. Which enzyme class catalyses this?', opts: ['Lyase', 'Oxidoreductase', 'Hydrolase', 'Isomerase', 'Transferase'], correct: 3, why: '<b>Isomerase</b> — one isomer becomes another; same atoms, rearranged.' });
  const q2 = qCard({ n: 2, q: 'Ethyl acetate + H₂O → ethanol + acetic acid. Which enzyme class?', opts: ['Lyase', 'Oxidoreductase', 'Hydrolase', 'Transferase', 'Isomerase'], correct: 2, why: '<b>Hydrolase</b> — water cleaves an <b>ester</b> bond (like lipases).' });
  el.append(q1.el, q2.el);
  // Q1: real 3D L-alanine and its exact mirror image (D-alanine)
  const kit = createScene(q1.viz, { cam: [0, 0, 13], fov: 32, orbit: false, autoRotate: 0, hint: false });
  const data = await loadMol('ala');
  const Lm = buildMolecule(data, { hideH: false, scale: 1.05 });
  const Dm = buildMolecule({ ...data, atoms: data.atoms.map((a) => [a[0], -a[1], a[2], a[3]]) }, { hideH: false, scale: 1.05 });
  Lm.position.x = 3.4; Dm.position.x = -3.4;
  kit.root.add(Lm, Dm);
  kit.onFrame((dt, t) => { Lm.rotation.y = 0.9 * Math.sin(t * 0.7); Dm.rotation.y = -Lm.rotation.y; });
  const lab = (x, t, col) => h('div', { style: `position:absolute;bottom:0;${x};font-size:24px;font-weight:650;color:${col}`, html: t });
  q1.viz.append(lab('left:16%', 'D-Alanine', 'var(--fg-2)'), lab('right:16%', 'L-Alanine', 'var(--ink)'),
    h('div', { style: 'position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:44px;color:var(--fg-3)', text: '→' }),
    h('div', { style: 'position:absolute;left:50%;bottom:0;transform:translateX(-50%);font-size:22px;color:var(--fg-3)', text: 'mirror images' }));
  // Q2: ester hydrolysis animation
  const D = diagram(q2.viz, 760, 230);
  D.svg.style.height = '100%';
  const r = reactionScene(D.layers.nodes, { enzyme: 'Esterase', left: ['Ethyl acetate', 'H_{2}O'], right: ['Ethanol', 'Acetic acid'], mover: { t: 'H_{2}O', from: 1, to: 'mid' } }, { lx: 135, rx: 630, cy: 130, gap: 70, size: 24, ax1: 290, ax2: 470, arc: 60, enzSize: 24 }, 'var(--fadh)');
  return {
    ...kitController(kit, { enter: () => r.tl.play(), leave: () => r.tl.pause(), destroy: () => { r.tl.kill(); D.destroy(); } }),
    step(n) { q1.reveal(n >= 1); q2.reveal(n >= 2); },
  };
}

// 8 · Learning check (slide 27): identify the class of four reactions
function lc2Viz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gridTemplateRows = '1fr 1fr';
  el.style.gap = '24px';
  const T = [
    { spec: { enzyme: 'Maltase', left: ['Maltose', 'H_{2}O'], right: ['Glucose', 'Glucose'], mover: { t: 'H_{2}O', from: 1, to: 'mid' } }, ec: 3, why: 'Water cleaves the glycosidic bond.' },
    { spec: { enzyme: 'DNMTs', left: ['Cytosine', 'SAM'], right: ['5-Methylcytosine', 'SAH'], mover: { t: 'CH_{3}', from: 1, to: 0 } }, ec: 2, why: 'A methyl group moves from SAM to cytosine.' },
    { spec: { enzyme: 'no enzyme shown', iso: ['Glucose-1-P', 'Glucose-6-P'] }, ec: 5, why: 'Phosphate shifts within one molecule (a mutase).' },
    { spec: { enzyme: 'L-Malate dehydrogenase', left: ['L-Malate', 'NAD^{+}'], right: ['Oxaloacetate', 'NADH + H^{+}'], rev: true, mover: { t: '2H', from: 0, to: 1, below: true, arc: 40 } }, ec: 1, why: 'Malate is oxidised; NAD⁺ is reduced.' },
  ];
  const tiles = T.map((t, i) => {
    const c = EC[t.ec - 1];
    const tile = h('div', { style: 'position:relative;border-radius:32px;background:var(--surface);border:2px solid var(--line);overflow:hidden;transition:border-color .5s var(--ease)' });
    const host = h('div', { style: 'position:absolute;left:24px;right:24px;top:6px;height:236px' });
    tile.append(host);
    const D = diagram(host, 790, 236);
    D.svg.style.height = '100%';
    const r = reactionScene(D.layers.nodes, t.spec, { lx: 140, rx: 645, cy: 116, gap: 64, size: 24, ax1: 268, ax2: 516, arc: 46, enzSize: 23, isoDy: 10, isoLabel: t.spec.iso ? 'left' : null }, c.col);
    const num = h('div', { style: 'position:absolute;left:26px;bottom:22px;font:700 24px var(--mono);color:var(--fg-3)', text: `${i + 1}` });
    const q = h('div', { style: 'position:absolute;right:26px;bottom:18px;font-size:26px;font-weight:650;color:var(--fg-3);padding:6px 20px;border-radius:999px;border:2px dashed var(--line-2)', text: 'Class?' });
    const ans = h('div', { style: 'position:absolute;left:70px;right:24px;bottom:16px;display:flex;align-items:center;gap:18px;opacity:0;transform:translateY(10px);transition:opacity .5s var(--ease), transform .5s var(--ease)' }, [
      h('span', { style: `font-size:28px;font-weight:720;padding:6px 18px;border-radius:999px;color:${c.col};background:color-mix(in oklab, ${c.col} 16%, transparent);border:2px solid color-mix(in oklab, ${c.col} 55%, transparent);white-space:nowrap`, text: `EC ${c.n} · ${c.name.replace(/s$/, '')}` }),
      h('span', { style: 'font-size:24px;color:var(--fg-2);line-height:1.25', text: t.why }),
    ]);
    tile.append(num, q, ans);
    el.append(tile);
    return { tile, r, q, ans, D, c };
  });
  let live = false;
  return {
    step(n) {
      tiles.forEach((t, i) => {
        const on = n > i;
        t.q.style.opacity = on ? 0 : 1;
        t.ans.style.opacity = on ? 1 : 0;
        t.ans.style.transform = on ? 'none' : 'translateY(10px)';
        t.tile.style.borderColor = on ? `color-mix(in oklab, ${t.c.col} 55%, transparent)` : 'var(--line)';
        if (on && live) t.r.tl.play(); else { t.r.tl.pause(0); gsap.set([...t.r.left, ...t.r.right], { opacity: 1 }); }
        t.on = on;
      });
    },
    enter() { live = true; tiles.forEach((t) => t.on && t.r.tl.play()); },
    leave() { live = false; tiles.forEach((t) => t.r.tl.pause()); },
    destroy() { tiles.forEach((t) => { t.r.tl.kill(); t.D.destroy(); }); },
  };
}

// 9 · Activation energy: energy profile, enzyme toggle
function eaViz(el) {
  const C = chart(el, { w: 960, h: 760, pad: { l: 110, b: 80, t: 60, r: 30 }, x: { min: 0, max: 1, label: 'Progress of reaction →', ticks: false }, y: { min: 0, max: 120, label: 'Free energy (G)', ticks: false }, grid: false });
  C.svg.style.height = '760px';
  const A = 55, B = 22, HU = 66, HC = 36;
  const base = (x) => A + (B - A) / (1 + Math.exp(-(x - 0.5) / 0.06));
  const prof = (Hh) => (x) => base(x) + Hh * Math.exp(-Math.pow((x - 0.5) / 0.12, 2));
  const st = { H: HU };
  const peakOf = (Hh) => { let m = 0, mx = 0.5; for (let x = 0.35; x <= 0.65; x += 0.002) { const v = prof(Hh)(x); if (v > m) { m = v; mx = x; } } return [mx, m]; };
  C.hline(A, { extent: 0.9, dash: '6 10', width: 2, color: 'var(--line-2)' });
  C.hline(B, { extent: 0.97, dash: '6 10', width: 2, color: 'var(--line-2)' });
  C.text(0.015, A - 6, 'Reactants', { class: 'v-label sm', fill: 'var(--fg-2)', dy: 22 });
  C.text(0.985, B - 6, 'Products', { class: 'v-label sm', fill: 'var(--fg-2)', 'text-anchor': 'end', dy: 22 });
  const ghost = C.line(prof(HU), { color: 'var(--fg-3)', width: 4, dash: '8 12', samples: 300 });
  ghost.show(false);
  const main = C.line(prof(HU), { color: 'var(--fg-2)', width: 7, samples: 300 });
  const tsLbl = C.text(0.5, 0, 'Transition state', { class: 'v-label sm', 'text-anchor': 'middle', fill: 'var(--fg)', 'font-weight': 650 });
  const peakLine = s('line', { style: 'stroke:var(--line-2);stroke-width:2;stroke-dasharray:4 8' });
  const ghostPeakLine = s('line', { style: 'stroke:var(--line-2);stroke-width:2;stroke-dasharray:4 8' });
  C.top.append(peakLine, ghostPeakLine);
  const dbl = (col) => {
    const g = s('g');
    const ln = s('line', { style: `stroke:${col};stroke-width:4;stroke-linecap:round` });
    const h1 = s('path', { style: `fill:${col}` }), h2 = s('path', { style: `fill:${col}` });
    const lb = s('text', { class: 'v-label', 'text-anchor': 'end', style: `font-size:32px;font-weight:700;fill:${col}` });
    setRich(lb, 'E_{a}');
    g.append(ln, h1, h2, lb);
    C.top.append(g);
    return {
      g,
      set(x, ya, yb) {
        const X = C.sx(x), Y1 = C.sy(ya), Y2 = C.sy(yb), d = Math.sign(Y2 - Y1) || 1;
        ln.setAttribute('x1', X); ln.setAttribute('x2', X); ln.setAttribute('y1', Y1 + d * 14); ln.setAttribute('y2', Y2 - d * 14);
        h1.setAttribute('d', `M${X},${Y1} L${X - 10},${Y1 + d * 18} L${X + 10},${Y1 + d * 18} Z`);
        h2.setAttribute('d', `M${X},${Y2} L${X - 10},${Y2 - d * 18} L${X + 10},${Y2 - d * 18} Z`);
        lb.setAttribute('x', X - 16); lb.setAttribute('y', (Y1 + Y2) / 2 + 12);
      },
    };
  };
  const eaGhost = dbl('var(--fg-3)');
  const eaMain = dbl('var(--fg-2)');
  eaGhost.g.style.opacity = 0;
  // ΔG
  const dG = dbl('var(--atp)');
  dG.set(0.8, A, B);
  const dGt = dG.g.querySelector('text');
  dGt.textContent = 'ΔG';
  dGt.setAttribute('text-anchor', 'start');
  dGt.setAttribute('x', C.sx(0.8) + 18);
  const dGnote = s('text', { x: C.sx(0.8) + 18, y: C.sy((A + B) / 2) + 46, class: 'v-label sm', style: 'fill:var(--atp);font-weight:650;opacity:0' });
  dGnote.textContent = 'unchanged';
  C.top.append(dGnote);
  // Molecule ball crossing the barrier
  const ball = s('circle', { r: 13, style: 'fill:var(--a1);stroke:var(--bg);stroke-width:4' });
  C.top.append(ball);
  const bt = { x: 0 };
  const ballTw = gsap.to(bt, { x: 1, duration: 4.2, ease: 'none', repeat: -1, paused: true, onUpdate: () => { ball.setAttribute('cx', C.sx(bt.x)); ball.setAttribute('cy', C.sy(prof(st.H)(bt.x)) - 15); } });
  const rate = h('div', { style: 'position:absolute;right:20px;top:4px;display:flex;align-items:center;gap:14px;font-size:26px;color:var(--fg-2);padding:10px 20px;border-radius:999px;background:var(--surface);border:1px solid var(--line)' }, [h('span', { text: 'Rate' }), h('b', { style: 'font-weight:700;color:var(--fg)', text: 'slow' })]);
  el.append(rate);
  const redraw = () => {
    main.update(prof(st.H));
    const [px, pv] = peakOf(st.H);
    eaMain.set(0.2, A, pv);
    peakLine.setAttribute('x1', C.sx(0.2)); peakLine.setAttribute('x2', C.sx(px)); peakLine.setAttribute('y1', C.sy(pv)); peakLine.setAttribute('y2', C.sy(pv));
  };
  const [gx, gv] = peakOf(HU);
  tsLbl.setAttribute('x', C.sx(gx)); tsLbl.setAttribute('y', C.sy(gv) - 24);
  eaGhost.set(0.1, A, gv);
  ghostPeakLine.setAttribute('x1', C.sx(0.1)); ghostPeakLine.setAttribute('x2', C.sx(gx)); ghostPeakLine.setAttribute('y1', C.sy(gv)); ghostPeakLine.setAttribute('y2', C.sy(gv));
  ghostPeakLine.style.opacity = 0;
  redraw();
  let on = false;
  const setEnz = (v) => {
    on = v;
    gsap.to(st, { H: v ? HC : HU, duration: 1.2, ease: 'power3.inOut', onUpdate: redraw });
    ghost.show(v);
    gsap.to([eaGhost.g, ghostPeakLine], { opacity: v ? 1 : 0, duration: 0.5 });
    main.el.setAttribute('stroke', v ? 'var(--a1)' : 'var(--fg-2)');
    eaMain.g.querySelectorAll('line,path').forEach((e) => { e.style.stroke = v ? 'var(--ink)' : 'var(--fg-2)'; if (e.tagName === 'path') e.style.fill = v ? 'var(--ink)' : 'var(--fg-2)'; });
    eaMain.g.querySelector('text').style.fill = v ? 'var(--ink)' : 'var(--fg-2)';
    ballTw.timeScale(v ? 2.6 : 1);
    rate.lastChild.textContent = v ? 'fast ↑' : 'slow';
    rate.lastChild.style.color = v ? 'var(--act)' : 'var(--fg)';
  };
  const t = toggle({ label: 'Add enzyme', on: false, onChange: setEnz });
  tip(t.el, { title: 'Enzyme on', body: 'The enzyme provides a path with a <b>lower activation energy</b>. Start and end levels — and so ΔG and the equilibrium — do not move.', src: SRC(14) });
  ctrlBar(el, [t], { left: 110, bottom: 0 });
  return {
    enter: () => ballTw.play(),
    leave: () => ballTw.pause(),
    step(n) { if (t.get() !== n >= 1) t.set(n >= 1); gsap.to(dGnote, { opacity: n >= 2 ? 1 : 0, duration: 0.5 }); gsap.to(dG.g, { opacity: n >= 2 ? 1 : 0.7, duration: 0.5 }); },
    destroy: () => ballTw.kill(),
  };
}

// 10 · Active site: real glucokinase pocket, residues coloured by chemistry
const RES_CLASS = (n) => (['ASP', 'GLU'].includes(n) ? 'acid' : ['ARG', 'LYS', 'HIS'].includes(n) ? 'basic' : ['SER', 'THR', 'ASN', 'GLN', 'TYR', 'CYS'].includes(n) ? 'polar' : 'np');
const RES_COL = { acid: 0xff453a, basic: 0x3d8bff, polar: 0x30d158, np: 0xffb340, far: 0x454b55 };
async function activeSiteViz(el) {
  const kit = createScene(el, { cam: [0, 0, 60], fov: 30, autoRotate: 0 });
  const pdb = await loadPDB('1V4S');
  const glc = pdb.het.find((x) => x.name === 'GLC');
  const gc = avg3(glc.atoms.map((a) => [a[2], a[3], a[4]]));
  const res = pdb.chains[0].res;
  const dist = res.map((r) => Math.hypot(r[2] - gc[0], r[3] - gc[1], r[4] - gc[2]));
  const prot = buildProtein(pdb, { center: gc, colorBy: (ci, i) => (dist[i] < 9.5 ? RES_COL[RES_CLASS(res[i][1])] : RES_COL.far), hets: ['GLC'], hetScale: 1.4, hetColor: 0xffd60a, coil: 0.28 });
  kit.root.add(prot);
  const ball = new THREE.SphereGeometry(1, 24, 16);
  res.forEach((r, i) => {
    if (dist[i] >= 8.8) return;
    const m = new THREE.Mesh(ball, glossy(RES_COL[RES_CLASS(r[1])]));
    m.scale.setScalar(0.95);
    m.position.set(r[2] - gc[0], r[3] - gc[1], r[4] - gc[2]);
    prot.add(m);
  });
  const halo = glowSprite(0xffd60a, 10);
  prot.add(halo);
  kit.onFrame((dt, t) => { halo.material.opacity = 0.45 + 0.3 * Math.sin(t * 2.2); prot.rotation.y = 0.55 * Math.sin(t * 0.32); });
  const KEY = { 169: 'Lys169', 205: 'Asp205', 231: 'Asn231', 256: 'Glu256', 152: 'Phe152' };
  res.forEach((r) => {
    if (!KEY[r[0]]) return;
    const v = new THREE.Vector3(r[2] - gc[0], r[3] - gc[1], r[4] - gc[2]);
    const p = v.clone().add(v.clone().normalize().multiplyScalar(2.6));
    const lb = kit.label(KEY[r[0]], [p.x, p.y, p.z], { cls: 'sm', parent: prot });
    const c = RES_CLASS(r[1]);
    lb.element.style.color = { acid: 'var(--inh)', basic: '#3d8bff', polar: 'var(--act)', np: '#e09422' }[c];
  });
  kit.label('Glucose', [0, -3.4, 0], { cls: 'acc', parent: prot });
  // Look into the pocket along the least-occluded line of sight (fewest Cα atoms in the way).
  const rel = res.map((r) => new THREE.Vector3(r[2] - gc[0], r[3] - gc[1], r[4] - gc[2]));
  let best = null, bestN = 1e9;
  for (let i = 0; i < 300; i++) {
    const y = 1 - (i / 299) * 2, rr = Math.sqrt(1 - y * y), ph = i * Math.PI * (3 - Math.sqrt(5));
    const d = new THREE.Vector3(Math.cos(ph) * rr, y, Math.sin(ph) * rr);
    let n = 0;
    rel.forEach((v) => { const tt = v.dot(d); if (tt > 3 && tt < 80 && v.clone().sub(d.clone().multiplyScalar(tt)).length() < 7 + tt * 0.08) n++; });
    n += Math.abs(y) * 2;
    if (n < bestN) { bestN = n; best = d; }
  }
  kit.camera.position.copy(best.multiplyScalar(74));
  kit.controls.target.set(0, 0, 0);
  kit.camera.near = 1; kit.camera.far = 600; kit.camera.updateProjectionMatrix();
  const chip = (col, t) => h('span', { style: 'display:inline-flex;align-items:center;gap:10px' }, [h('i', { style: `width:18px;height:18px;border-radius:50%;background:${col};display:inline-block` }), t]);
  el.append(h('div', { style: 'position:absolute;left:0;bottom:0;display:flex;flex-wrap:wrap;gap:24px;font-size:24px;color:var(--fg);pointer-events:none;padding:12px 22px;border-radius:999px;background:var(--glass);border:1px solid var(--line);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)' }, [
    chip('#ff453a', 'Acidic'), chip('#3d8bff', 'Basic'), chip('#30d158', 'Polar'), chip('#ffb340', 'Nonpolar'), chip('#ffd60a', 'Glucose'),
  ]));
  el.append(h('div', { style: 'position:absolute;left:0;top:0;font-size:22px;color:var(--fg-2);pointer-events:none;padding:8px 18px;border-radius:999px;background:var(--glass);border:1px solid var(--line)', text: 'Glucokinase · residues within ~9 Å of glucose (PDB 1V4S)' }));
  return kitController(kit);
}

// 11 · Lock-and-key vs induced fit (2D, looping)
function modelsViz(el) {
  const D = diagram(el, 1712, 720);
  const panels = [0, 882].map((x0, k) => {
    const g = s('g', { transform: `translate(${x0} 0)` });
    D.layers.nodes.append(g);
    g.append(s('rect', { x: 0, y: 0, width: 830, height: 720, rx: 40, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' }));
    txt(g, 40, 58, k ? 'INDUCED FIT · KOSHLAND' : 'LOCK & KEY · FISCHER', 'font-size:24px;letter-spacing:.14em;font-weight:650;fill:var(--fg-2)');
    txt(g, 40, 112, k ? 'Flexible site reshapes' : 'Rigid, pre-formed site', 'font-size:38px;font-weight:700;letter-spacing:-.02em');
    return g;
  });
  const ENZ = 'fill:color-mix(in oklab, var(--a2) 20%, var(--bg));stroke:color-mix(in oklab, var(--a2) 70%, transparent);stroke-width:3;stroke-linejoin:round';
  const SUB = 'fill:color-mix(in oklab, var(--atp) 35%, var(--bg));stroke:var(--atp);stroke-width:3;stroke-linejoin:round';
  const PRO = 'fill:color-mix(in oklab, var(--act) 35%, var(--bg));stroke:var(--act);stroke-width:3;stroke-linejoin:round';
  const RIM = 'L575,400 Q615,400 615,440 L615,600 Q615,640 575,640 L255,640 Q215,640 215,600 L215,440 Q215,400 255,400 L355,400';
  const build = (g, kind) => {
    let body;
    if (kind === 'lock') body = s('path', { d: `M355,400 L375,470 L395,430 L415,470 L435,430 L455,470 L475,400 ${RIM} Z`, style: ENZ });
    else body = s('path', { d: '', style: ENZ });
    g.append(body);
    txt(g, 415, 560, 'Enzyme', 'font-size:30px;font-weight:650;fill:var(--fg-2)', 'middle');
    const sub = s('g');
    const lh = s('path', { d: kind === 'lock' ? 'M355,300 L415,300 L415,470 L395,430 L375,470 L355,400 Z' : 'M355,300 L415,300 L415,470 L375,470 L375,400 L355,400 Z', style: SUB });
    const rh = s('path', { d: kind === 'lock' ? 'M415,300 L475,300 L475,400 L455,470 L435,430 L415,470 Z' : 'M415,300 L475,300 L475,400 L455,400 L455,470 L415,470 Z', style: SUB });
    const lhg = s('g'), rhg = s('g');
    lhg.append(lh); rhg.append(rh);
    sub.append(lhg, rhg);
    g.append(sub);
    const sLbl = txt(g, 600, 262, 'Substrate', 'font-size:28px;font-weight:650;fill:var(--atp)', 'middle');
    const phase = txt(g, 415, 700, 'E + S', 'font-size:32px;font-weight:700;fill:var(--fg)', 'middle');
    return { body, sub, lh, rh, lhg, rhg, sLbl, phase };
  };
  const A = build(panels[0], 'lock');
  const B = build(panels[1], 'fit');
  const ROUND = `M355,400 C355,440 362,462 378,470 C398,480 432,480 452,470 C468,462 475,440 475,400 ${RIM} Z`;
  const SQUARE = `M355,400 C375,400 375,400 375,470 C402,470 428,470 455,470 C455,400 455,400 475,400 ${RIM} Z`;
  B.body.setAttribute('d', ROUND);
  const ccLbl = txt(panels[1], 700, 440, 'Conformational', 'font-size:24px;font-weight:650;fill:var(--ink)', 'middle');
  const ccLbl2 = txt(panels[1], 700, 470, 'change', 'font-size:24px;font-weight:650;fill:var(--ink)', 'middle');
  gsap.set([ccLbl, ccLbl2], { opacity: 0 });
  // footers
  const foot = (g, col, t, tipSpec) => { const p = pill(g, t, { size: 24, x: 415, y: 170, color: col, textColor: col }); tip(p, tipSpec); return p; };
  foot(panels[0], 'var(--inh)', 'Limitation: no flexibility, no allostery', { title: 'Lock-and-key (Fischer / template) model', body: 'The active site has a rigid, pre-formed shape; a complementary substrate fits as a key fits a lock. <b>Limitation:</b> does not explain enzyme flexibility, conformational change or allosteric regulation.', src: SRC(24) });
  foot(panels[1], 'var(--act)', 'Better explains regulation', { title: 'Induced-fit (Koshland) model', body: 'The active site is <b>flexible</b>: substrate binding induces a conformational change that improves catalytic alignment. Because of this flexibility it better explains enzyme regulation.', src: SRC(25) });
  const setPhase = (P, t) => () => { setRich(P.phase, t); gsap.fromTo(P.phase, { opacity: 0.2 }, { opacity: 1, duration: 0.4 }); };
  const reset = (P) => { gsap.set(P.sub, { y: -92 }); gsap.set([P.lhg, P.rhg], { x: 0, y: 0, rotation: 0, opacity: 1 }); gsap.set([P.lh, P.rh], { attr: { style: SUB } }); setRich(P.phase, 'E + S'); };
  const tlA = gsap.timeline({ repeat: -1, paused: true, repeatDelay: 0.3 });
  tlA.call(() => reset(A), null, 0)
    .to(A.sLbl, { opacity: 1, duration: 0.3 }, 0)
    .to(A.sub, { y: 0, duration: 1.3, ease: 'power2.inOut' }, 0.6)
    .to(A.sLbl, { opacity: 0, duration: 0.3 }, 0.6)
    .call(setPhase(A, 'ES complex · exact fit'), null, 1.9)
    .to([A.lh, A.rh], { attr: { style: PRO }, duration: 0.01 }, 3.1)
    .call(setPhase(A, 'E + P · site unchanged'), null, 3.1)
    .to(A.lhg, { x: -230, y: -40, rotation: -24, transformOrigin: '50% 50%', duration: 1.1, ease: 'power2.out' }, 3.1)
    .to(A.rhg, { x: 230, y: -40, rotation: 24, transformOrigin: '50% 50%', duration: 1.1, ease: 'power2.out' }, 3.1)
    .to([A.lhg, A.rhg], { opacity: 0, duration: 0.4 }, 4.4)
    .to({}, { duration: 0.6 });
  const tlB = gsap.timeline({ repeat: -1, paused: true, repeatDelay: 0.3 });
  tlB.call(() => { reset(B); B.body.setAttribute('d', ROUND); }, null, 0)
    .to(B.sLbl, { opacity: 1, duration: 0.3 }, 0)
    .to(B.sub, { y: -70, duration: 1.0, ease: 'power2.inOut' }, 0.6)
    .to(B.sLbl, { opacity: 0, duration: 0.3 }, 0.6)
    .call(setPhase(B, 'Binding induces a change…'), null, 1.6)
    .to([ccLbl, ccLbl2], { opacity: 1, duration: 0.3 }, 1.6)
    .to(B.body, { attr: { d: SQUARE }, duration: 0.9, ease: 'power2.inOut' }, 1.7)
    .to(B.sub, { y: 0, duration: 0.6, ease: 'power2.inOut' }, 2.5)
    .to([ccLbl, ccLbl2], { opacity: 0, duration: 0.3 }, 3.0)
    .call(setPhase(B, 'ES complex · aligned'), null, 3.1)
    .to([B.lh, B.rh], { attr: { style: PRO }, duration: 0.01 }, 4.2)
    .call(setPhase(B, 'E + P · site relaxes'), null, 4.2)
    .to(B.lhg, { x: -230, y: -40, rotation: -24, transformOrigin: '50% 50%', duration: 1.1, ease: 'power2.out' }, 4.2)
    .to(B.rhg, { x: 230, y: -40, rotation: 24, transformOrigin: '50% 50%', duration: 1.1, ease: 'power2.out' }, 4.2)
    .to(B.body, { attr: { d: ROUND }, duration: 0.9, ease: 'power2.inOut' }, 4.6)
    .to([B.lhg, B.rhg], { opacity: 0, duration: 0.4 }, 5.4)
    .to({}, { duration: 0.5 });
  reset(A); reset(B);
  let n0 = 0, live = false;
  const apply = () => {
    (live && n0 >= 1) ? tlA.play() : tlA.pause();
    (live && n0 >= 2) ? tlB.play() : tlB.pause();
    gsap.to(panels[1], { opacity: n0 >= 1 && n0 < 2 ? 0.45 : 1, duration: 0.5 });
  };
  return {
    step(n) { n0 = n; apply(); },
    enter() { live = true; apply(); },
    leave() { live = false; apply(); },
    destroy() { tlA.kill(); tlB.kill(); D.destroy(); },
  };
}

// 12 · Induced fit for real: glucokinase super-open (1V4T) → closed (1V4S)
async function morphViz(el) {
  const kit = createScene(el, { cam: [0, 0, 130], fov: 30, autoRotate: 0 });
  const [M, data] = await Promise.all([
    proteinMorph({ smallColor: 0x64d2ff, largeColor: 0x8f96a3 }),
    fetch(new URL('../../data/pdb/GK-morph.json', import.meta.url)).then((r) => r.json()),
  ]);
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const pick = (small, key) => { const pts = []; data.segments.forEach((sg) => sg.res.forEach((r, i) => { if (!!sg.small[i] === small) pts.push(sg[key][i]); })); return V(avg3(pts)); };
  const sO = pick(true, 'open'), sC = pick(true, 'closed'), lC = pick(false, 'closed');
  const site = V(avg3(data.glucose[0].atoms.map((a) => [a[2], a[3], a[4]])));
  // Orient so the hinge motion happens in the screen plane: large domain below, small above.
  const up = sO.clone().add(sC).multiplyScalar(0.5).sub(lC).normalize();
  let nrm = sO.clone().sub(lC).cross(sC.clone().sub(lC)).normalize();
  const right = up.clone().cross(nrm).normalize();
  nrm = right.clone().cross(up).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, nrm);
  M.group.quaternion.setFromRotationMatrix(basis.clone().transpose());
  const pivot = new THREE.Group();
  pivot.add(M.group);
  kit.root.add(pivot);
  const offset = right.clone().multiplyScalar(-15).add(up.clone().multiplyScalar(6)).add(nrm.clone().multiplyScalar(12));
  const halo = glowSprite(0xffd60a, 11);
  M.glucose.add(halo);
  halo.position.copy(site);
  const lbSmall = kit.label('Small domain', [0, 0, 0], { cls: 'acc', parent: M.group });
  const lbLarge = kit.label('Large domain', [0, 0, 0], { cls: 'sm', parent: M.group });
  const lbGlc = kit.label('Glucose', [0, 0, 0], { cls: 'sm', parent: M.group });
  lbGlc.element.style.color = '#e0a800';
  kit.fit(pivot, 1.55);
  kit.onFrame((dt, t) => { pivot.rotation.y = 0.32 * Math.sin(t * 0.28); halo.material.opacity = 0.4 + 0.3 * Math.sin(t * 2.4); });
  const st = { u: 0 };
  const status = h('div', { style: 'position:absolute;left:0;top:0;font-size:30px;font-weight:700;letter-spacing:-.01em;pointer-events:none' });
  const status2 = h('div', { style: 'position:absolute;left:0;top:42px;font-size:24px;color:var(--fg-2);pointer-events:none' });
  el.append(status, status2);
  const apply = (u) => {
    st.u = u;
    const gIn = smooth(clamp01(u / 0.45));
    const t = smooth(clamp01((u - 0.35) / 0.65));
    M.setT(t);
    M.glucose.position.copy(offset).multiplyScalar(1 - gIn);
    lbSmall.position.copy(sO.clone().lerp(sC, t).add(up.clone().multiplyScalar(14)));
    lbLarge.position.copy(lC.clone().sub(up.clone().multiplyScalar(22)));
    lbGlc.position.copy(site.clone().add(offset.clone().multiplyScalar(1 - gIn)).add(right.clone().multiplyScalar(-9)));
    status.textContent = t > 0.95 ? 'Closed' : t > 0.02 ? 'Closing…' : gIn > 0.98 ? 'Glucose bound · still open' : 'Super-open';
    status.style.color = t > 0.95 ? 'var(--act)' : 'var(--fg)';
    status2.textContent = t > 0.95 ? 'Cleft shut around glucose (PDB 1V4S)' : t > 0.02 ? 'Small domain swinging over the cleft' : 'No glucose bound (PDB 1V4T)';
  };
  const sl = slider({ label: 'Conformation', min: 0, max: 1, step: 0.005, value: 0, width: 300, fmt: (v) => (v < 0.36 ? 'open' : v > 0.97 ? 'closed' : 'closing'), onInput: (v) => { gsap.killTweensOf(st); apply(v); } });
  tip(sl.el, { title: 'Real structures, interpolated', body: 'Endpoints are the crystal structures of human glucokinase: super-open without glucose (1V4T) and closed with glucose (1V4S), superposed on the large domain. The frames in between are a straight-line interpolation (illustrative path).', src: 'RCSB PDB 1V4T, 1V4S · lecture slide 25' });
  ctrlBar(el, [sl], { left: 0, bottom: 0 });
  apply(0);
  return kitController(kit, {
    step(n) {
      const to = n >= 1 ? 1 : 0;
      gsap.to(st, { u: to, duration: n >= 1 ? 3.6 : 0.8, ease: 'power1.inOut', onUpdate: () => { apply(st.u); sl.set(st.u, false); } });
    },
  });
}

// 13 · Five kinds of specificity (stepped panels)
const SPEC = [
  { t: 'Reaction', d: 'Same substrate · different enzymes', col: 'var(--a1)', tip: 'The same substrate can undergo different reactions, each catalysed by a different enzyme (pyruvate → acetyl-CoA, lactate, oxaloacetate, alanine).', p: 18 },
  { t: 'Stereo', d: 'One stereoisomer only', col: 'var(--fadh)', tip: 'Enzymes recognise a particular stereoisomer: human enzymes generally act on L-amino acids and D-sugars. SDH forms fumarate, not maleate; LDH forms L-lactate, not D-lactate.', p: 19 },
  { t: 'Group', d: 'A shared structural feature', col: 'var(--prot)', tip: 'Group-specific enzymes act on substrates that share a related structural feature — e.g. proteases that cut next to aromatic or basic residues.', p: 20 },
  { t: 'Bond', d: 'One kind of bond', col: 'var(--atp)', tip: 'Some enzymes act on certain types of bond: proteolytic enzymes → peptide bonds; glycosidases → glycosidic bonds; lipases → ester bonds.', p: 21 },
  { t: 'Absolute', d: 'One substrate · one reaction', col: 'var(--act)', tip: 'Catalyse one reaction with one specific substrate: urease acts on urea; glucose oxidase acts on β-D-glucose.', p: 21 },
  { t: 'Why it matters', d: 'Order · efficiency · lab · therapy', col: 'var(--fg-2)', tip: 'Metabolic order, efficiency, diagnosis (glucose oxidase measures glucose) and therapy (lactase supplements).', p: 22 },
];
function specViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '430px 1fr';
  el.style.gap = '40px';
  const rail = h('div', { style: 'display:flex;flex-direction:column;justify-content:space-between;gap:10px' });
  const rows = SPEC.map((sp, i) => {
    const r = h('div', { style: 'display:grid;grid-template-columns:48px 1fr;gap:18px;align-items:center;padding:14px 20px;border-radius:24px;cursor:pointer;border:2px solid transparent;transition:opacity .35s var(--ease), background .35s var(--ease), border-color .35s var(--ease)' }, [
      h('div', { style: `width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font:700 22px var(--font);color:${sp.col};border:2px solid ${sp.col}`, text: i < 5 ? i + 1 : '★' }),
      h('div', {}, [h('div', { style: 'font-size:32px;font-weight:680;letter-spacing:-.015em', text: sp.t }), h('div', { style: 'font-size:22px;color:var(--fg-2);margin-top:2px', text: sp.d })]),
    ]);
    r.addEventListener('click', () => select(i + 1));
    tip(r, { kicker: i < 5 ? `Specificity type ${i + 1}` : 'Importance', title: sp.t, body: sp.tip, src: SRC(sp.p) });
    rail.append(r);
    return r;
  });
  const panel = h('div', { style: 'position:relative;border-radius:36px;background:var(--surface);border:1px solid var(--line);overflow:hidden' });
  el.append(rail, panel);
  const D = diagram(panel, 1242, 720);
  const scenes = [];
  const flows = [];
  const mkScene = () => { const g = s('g', { style: 'opacity:0' }); D.layers.nodes.append(g); g._flows = []; scenes.push(g); return g; };
  const mv = (g, ...recs) => recs.forEach((r) => g.append(r.g || r));

  // 0 · overview
  const s0 = mkScene();
  txt(s0, 621, 250, 'How choosy is an enzyme?', 'font-size:54px;font-weight:720;letter-spacing:-.025em', 'middle');
  SPEC.slice(0, 5).forEach((sp, i) => pill(s0, sp.t, { size: 30, x: 621 + (i - 2) * 220, y: 390, color: sp.col, textColor: sp.col, weight: 680, w: 196 }));
  txt(s0, 621, 520, 'Five types · press → or pick one', 'font-size:28px;fill:var(--fg-3)', 'middle');

  // 1 · reaction specificity hub
  const s1 = mkScene();
  txt(s1, 621, 52, 'Pyruvate: one substrate, four reactions, four enzymes', 'font-size:28px;fill:var(--fg-2)', 'middle');
  const ctr = D.node({ id: 's1c', x: 621, y: 380, label: 'Pyruvate', kind: 'mol', color: 'var(--a1)', size: 36 });
  const HUB = [
    { lab: 'Acetyl-CoA', enz: 'Pyruvate dehydrogenase', x: 200, y: 140 },
    { lab: 'Lactate', enz: 'Lactate dehydrogenase', x: 1042, y: 140 },
    { lab: 'Oxaloacetate', enz: 'Pyruvate carboxylase', x: 200, y: 630 },
    { lab: 'Alanine', enz: 'Transaminase', x: 1042, y: 630 },
  ];
  const hubE = [], hubN = [ctr];
  HUB.forEach((t, i) => {
    const n = D.node({ id: `s1t${i}`, x: t.x, y: t.y, label: t.lab, kind: 'mol', size: 30 });
    const a = D.arrow({ from: 's1c', to: `s1t${i}`, width: 4, color: 'var(--line-2)' });
    const z = D.node({ x: (621 + t.x) / 2, y: (380 + t.y) / 2, label: t.enz, kind: 'enz', size: 24, color: 'var(--a1)' });
    z.g.prepend(s('rect', { x: -z.w0 / 2, y: -z.h0 / 2, width: z.w0, height: z.h0, rx: 16, style: 'fill:var(--bg-2);stroke:none' }));
    hubE.push(a); hubN.push(n, z);
    s1._flows.push(D.flow(a, { count: 2, color: 'var(--a1)', speed: 140, r: 8, autoplay: false }));
  });
  mv(s1, ...hubE, ...hubN);

  // 2 · stereospecificity
  const s2 = mkScene();
  txt(s2, 621, 52, 'Human enzymes: L-amino acids · D-sugars', 'font-size:28px;fill:var(--fg-2)', 'middle');
  const alkene = (x, y, cis, ok) => {
    const g = s('g', { transform: `translate(${x} ${y})`, style: `opacity:${ok ? 1 : 0.45}` });
    const L = (x1, y1, x2, y2) => g.append(s('line', { x1, y1, x2, y2, style: 'stroke:var(--fg-2);stroke-width:4;stroke-linecap:round' }));
    L(-32, -7, 32, -7); L(-32, 7, 32, 7);
    L(-32, 0, -62, -44); L(-32, 0, -58, 42); L(32, 0, 62, -44); L(32, 0, 58, 42);
    const T = (tx, ty, str, a) => txt(g, tx, ty, str, 'font-size:26px;font-weight:640', a);
    T(-66, -50, '^{−}OOC', 'end'); T(-62, 66, 'H', 'end');
    if (cis) { T(66, -50, 'COO^{−}', 'start'); T(62, 66, 'H', 'start'); } else { T(66, -50, 'H', 'start'); T(62, 66, 'COO^{−}', 'start'); }
    s2.append(g);
    return g;
  };
  const fischer = (x, y, isL, ok) => {
    const g = s('g', { transform: `translate(${x} ${y})`, style: `opacity:${ok ? 1 : 0.45}` });
    g.append(s('line', { x1: 0, y1: -44, x2: 0, y2: 44, style: 'stroke:var(--fg-2);stroke-width:4;stroke-linecap:round' }));
    g.append(s('line', { x1: -44, y1: 0, x2: 44, y2: 0, style: 'stroke:var(--fg-2);stroke-width:4;stroke-linecap:round' }));
    txt(g, 0, -56, 'COO^{−}', 'font-size:26px;font-weight:640', 'middle');
    txt(g, 0, 80, 'CH_{3}', 'font-size:26px;font-weight:640', 'middle');
    txt(g, -52, 9, isL ? 'HO' : 'H', 'font-size:26px;font-weight:640', 'end');
    txt(g, 52, 9, isL ? 'H' : 'OH', 'font-size:26px;font-weight:640', 'start');
    s2.append(g);
    return g;
  };
  const verdict = (x, y, t, ok, tp) => { const p = pill(s2, `${ok ? '✓' : '✗'}  ${t}`, { size: 26, x, y, color: ok ? 'var(--act)' : 'var(--inh)', textColor: ok ? 'var(--act)' : 'var(--inh)', weight: 680 }); if (tp) tip(p, tp); return p; };
  pill(s2, 'Succinate', { size: 28, x: 140, y: 205 });
  hArrow(s2, 250, 420, 205, { width: 4 });
  txt(s2, 335, 180, 'SDH', 'font-size:26px;font-weight:680;fill:var(--fadh)', 'middle');
  alkene(620, 200, false, true);
  alkene(990, 200, true, false);
  const geo = { title: 'Fumarate vs maleate', body: 'These are <b>geometric (cis/trans)</b> isomers. The slide lists them under stereospecificity; the L- vs D-lactate pair below is the true optical example.', src: `${SRC(19)} · textbook note` };
  verdict(620, 318, 'Fumarate · trans', true, geo);
  verdict(990, 318, 'Maleate · cis', false, geo);
  pill(s2, 'Pyruvate', { size: 28, x: 140, y: 520 });
  hArrow(s2, 250, 420, 520, { width: 4 });
  txt(s2, 335, 495, 'LDH', 'font-size:26px;font-weight:680;fill:var(--fadh)', 'middle');
  fischer(620, 500, true, true);
  fischer(990, 500, false, false);
  verdict(620, 650, 'L-Lactate', true);
  verdict(990, 650, 'D-Lactate', false);

  // 3 · group specificity
  const s3 = mkScene();
  txt(s3, 621, 52, 'Same feature · different substrates', 'font-size:28px;fill:var(--fg-2)', 'middle');
  const seq = ['Ala', 'Phe', 'Gly', 'Tyr', 'Ser', 'Trp', 'Gly'];
  const AR = ['Phe', 'Tyr', 'Trp'];
  const rx = (i) => 201 + i * 140;
  seq.forEach((r, i) => { if (i < seq.length - 1) s3.append(s('line', { x1: rx(i) + 44, y1: 330, x2: rx(i + 1) - 44, y2: 330, style: 'stroke:var(--fg-3);stroke-width:5' })); });
  seq.forEach((r, i) => {
    const ar = AR.includes(r);
    s3.append(s('circle', { cx: rx(i), cy: 330, r: 44, style: `fill:${ar ? 'color-mix(in oklab, var(--prot) 30%, var(--bg))' : 'var(--bg-2)'};stroke:${ar ? 'var(--prot)' : 'var(--line-2)'};stroke-width:3` }));
    txt(s3, rx(i), 339, r, `font-size:26px;font-weight:680;fill:${ar ? 'var(--prot)' : 'var(--fg)'}`, 'middle');
    if (ar) { const sc = scissors(s3); gsap.set(sc, { x: rx(i) + 70, y: 250 }); s3.append(s('line', { x1: rx(i) + 70, y1: 280, x2: rx(i) + 70, y2: 380, style: 'stroke:var(--inh);stroke-width:3;stroke-dasharray:6 6' })); }
  });
  pill(s3, 'Chymotrypsin', { size: 28, x: 621, y: 150, color: 'var(--prot)', textColor: 'var(--prot)', weight: 700 });
  txt(s3, 621, 470, 'Cuts after any aromatic residue', 'font-size:36px;font-weight:680', 'middle');
  txt(s3, 621, 520, 'Phe · Tyr · Trp share an aromatic ring', 'font-size:28px;fill:var(--prot);font-weight:620', 'middle');
  txt(s3, 621, 640, 'All five proteases → next slide', 'font-size:26px;fill:var(--fg-3)', 'middle');

  // 4 · bond specificity
  const s4 = mkScene();
  txt(s4, 621, 52, 'Each family recognises one type of bond', 'font-size:28px;fill:var(--fg-2)', 'middle');
  [
    { fam: 'Proteases', parts: ['R–', 'CO–NH', '–R′'], name: 'Peptide bond', ex: 'pepsin, trypsin', y: 190 },
    { fam: 'Glycosidases', parts: ['Sugar', '–O–', 'Sugar'], name: 'Glycosidic bond', ex: 'amylase, lactase', y: 380 },
    { fam: 'Lipases', parts: ['R–', 'CO–O', '–R′'], name: 'Ester bond', ex: 'pancreatic lipase', y: 570 },
  ].forEach((b) => {
    pill(s4, b.fam, { size: 28, x: 170, y: b.y, color: 'var(--atp)', textColor: 'var(--atp)', weight: 680, w: 250 });
    hArrow(s4, 310, 420, b.y, { width: 4 });
    const t = s('text', { x: 620, y: b.y + 14, 'text-anchor': 'middle', style: 'font:600 40px var(--mono)' });
    b.parts.forEach((p, k) => { const sp = s('tspan', { style: k === 1 ? 'fill:var(--atp);font-weight:800' : 'fill:var(--fg)' }); sp.textContent = p; t.append(sp); });
    s4.append(t);
    const sc = scissors(s4, 'var(--inh)', 1.7);
    gsap.set(sc, { x: 620, y: b.y - 54 });
    txt(s4, 860, b.y - 4, b.name, 'font-size:32px;font-weight:700', 'start');
    txt(s4, 860, b.y + 32, b.ex, 'font-size:24px;fill:var(--fg-2)', 'start');
  });

  // 5 · absolute specificity
  const s5 = mkScene();
  txt(s5, 621, 52, 'One substrate, one reaction', 'font-size:28px;fill:var(--fg-2)', 'middle');
  const ur = D.node({ id: 's5u', x: 210, y: 200, label: 'Urea', kind: 'mol', color: 'var(--act)', size: 32 });
  const ue = D.node({ id: 's5e', x: 690, y: 200, label: 'Urease', kind: 'enz', color: 'var(--act)', size: 32 });
  const ua = D.arrow({ from: 's5u', to: 's5e', width: 4, color: 'var(--act)' });
  const gl = D.node({ id: 's5g', x: 210, y: 430, label: 'β-D-Glucose', kind: 'mol', color: 'var(--act)', size: 32 });
  const ge = D.node({ id: 's5o', x: 690, y: 430, label: 'Glucose oxidase', kind: 'enz', color: 'var(--act)', size: 32 });
  const ga = D.arrow({ from: 's5g', to: 's5o', width: 4, color: 'var(--act)' });
  const fr = D.node({ id: 's5f', x: 210, y: 560, label: 'Fructose', kind: 'mol', size: 26 });
  const ga2 = D.node({ id: 's5a', x: 210, y: 650, label: 'Galactose', kind: 'mol', size: 26 });
  const b1 = D.arrow({ from: 's5f', to: [470, 480], width: 3, color: 'var(--inh)', kind: 'inh', dash: '6 8' });
  const b2 = D.arrow({ from: 's5a', to: [470, 500], width: 3, color: 'var(--inh)', kind: 'inh', dash: '6 8' });
  mv(s5, ua, ga, b1, b2, ur, ue, gl, ge, fr, ga2);
  [fr, ga2].forEach((n) => (n.g.style.opacity = 0.5));
  s5._flows.push(D.flow(ua, { count: 3, color: 'var(--act)', speed: 150, r: 9, autoplay: false }), D.flow(ga, { count: 3, color: 'var(--act)', speed: 150, r: 9, autoplay: false }));
  txt(s5, 900, 194, 'urea only', 'font-size:32px;font-weight:700', 'start');
  txt(s5, 900, 230, 'urea + H₂O → CO₂ + 2 NH₃', 'font-size:24px;fill:var(--fg-2)', 'start');
  txt(s5, 900, 424, 'β-D-glucose only', 'font-size:32px;font-weight:700', 'start');
  txt(s5, 900, 460, '→ blood-glucose testing', 'font-size:24px;fill:var(--fg-2)', 'start');
  tip(ge.g, { title: 'Glucose oxidase', body: 'Acts on <b>β-D-glucose</b> — used to measure blood glucose selectively. (Other sugars such as fructose or galactose are not substrates — textbook.)', src: `${SRC('21–22')}` });

  // 6 · why it matters (HTML tiles)
  const why = h('div', { style: 'position:absolute;inset:40px;display:grid;grid-template-columns:1fr 1fr;gap:24px;opacity:0;pointer-events:none' });
  [
    { icon: 'cycle', t: 'Metabolic order', b: 'Prevents inappropriate reactions; keeps pathways organised.' },
    { icon: 'bolt', t: 'Efficiency', b: 'Fast, efficient reactions — no wasted energy (ATP).' },
    { icon: 'flask', t: 'Diagnosis', b: 'Glucose oxidase selectively measures glucose.' },
    { icon: 'pill', t: 'Therapy', b: 'Lactase supplements specifically digest lactose.' },
  ].forEach((w) => why.append(h('div', { style: 'border-radius:30px;background:var(--surface-2);border:1px solid var(--line);padding:30px 34px;display:flex;flex-direction:column;gap:12px' }, [
    h('div', { style: 'width:64px;height:64px;color:var(--ink)', html: iconSvg(w.icon) }),
    h('div', { style: 'font-size:36px;font-weight:700;letter-spacing:-.02em', text: w.t }),
    h('div', { style: 'font-size:27px;line-height:1.3;color:var(--fg-2)', text: w.b }),
  ])));
  panel.append(why);

  let cur = -1, live = false;
  function select(i) {
    if (i === cur) return;
    cur = i;
    rows.forEach((r, k) => {
      const on = k === i - 1;
      r.style.background = on ? 'var(--surface-2)' : 'transparent';
      r.style.borderColor = on ? `color-mix(in oklab, ${SPEC[k].col} 55%, transparent)` : 'transparent';
      r.style.opacity = i === 0 || on ? 1 : 0.45;
    });
    scenes.forEach((g, k) => {
      gsap.to(g, { opacity: k === i ? 1 : 0, duration: 0.45, delay: k === i ? 0.15 : 0 });
      g.style.pointerEvents = k === i ? 'auto' : 'none';
      g._flows.forEach((f) => (k === i && live ? f.play() : f.hide()));
    });
    gsap.to(why, { opacity: i === 6 ? 1 : 0, duration: 0.45 });
  }
  select(0);
  scenes.forEach((g, k) => k && g._flows.forEach((f) => f.hide()));
  return {
    step: (n) => select(n),
    enter() { live = true; scenes[cur]?._flows.forEach((f) => f.play()); },
    leave() { live = false; D.pauseAll(); },
    destroy: () => D.destroy(),
  };
}
function iconSvg(name) {
  const P = {
    cycle: '<path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M4 12A8 8 0 0 1 17.7 6.4"/><path d="M18 2.8v3.8h-3.8M6 21.2v-3.8h3.8"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    flask: '<path d="M9 3.5h6M10 3.5V9l-5.2 9.2a1.6 1.6 0 0 0 1.4 2.3h11.6a1.6 1.6 0 0 0 1.4-2.3L14 9V3.5"/><path d="M7.4 14.5h9.2"/>',
    pill: '<g transform="rotate(-35 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>',
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
}

// 14 · Proteases: pick an enzyme, watch where it cuts
const PEP = ['Gly', 'Ala', 'Phe', 'Glu', 'Lys', 'Tyr', 'Gly', 'His', 'Arg', 'Met', 'Trp', 'Gly'];
const AROM = ['Phe', 'Tyr', 'Trp'], BASIC = ['Lys', 'Arg', 'His'];
const PROT = [
  { name: 'Pepsin', type: 'Endopeptidase', rule: 'Cuts on the <b>amino side</b> of aromatic residues · Phe, Tyr, Trp', cuts: (q) => q.map((r, i) => (i < q.length - 1 && AROM.includes(q[i + 1]) ? i : -1)).filter((i) => i >= 0), note: 'Per slide 20 / Lippincott. Pepsin is in fact fairly broad; aromatic residues are its preferred sites.' },
  { name: 'Chymotrypsin', type: 'Endopeptidase', rule: 'Cuts on the <b>carboxyl side</b> of aromatic residues · Phe, Tyr, Trp', cuts: (q) => q.map((r, i) => (i < q.length - 1 && AROM.includes(r) ? i : -1)).filter((i) => i >= 0), note: '' },
  { name: 'Trypsin', type: 'Endopeptidase', rule: 'Cuts on the <b>carboxyl side</b> of basic residues · Lys, Arg', cuts: (q) => q.map((r, i) => (i < q.length - 1 && ['Lys', 'Arg'].includes(r) ? i : -1)).filter((i) => i >= 0), note: 'Slide 20 also lists His — textbooks: trypsin cuts after Lys and Arg only (no cut after His here).' },
  { name: 'Carboxypeptidase', type: 'Exopeptidase', rule: 'Removes amino acids <b>one at a time</b> from the <b>C-terminus</b>', exo: 'C', note: '' },
  { name: 'Aminopeptidase', type: 'Exopeptidase', rule: 'Removes amino acids <b>one at a time</b> from the <b>N-terminus</b>', exo: 'N', note: '' },
];
function proteaseViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateRows = 'auto 1fr auto';
  el.style.gap = '10px';
  const top = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:24px' });
  const sg = seg({ options: PROT.map((p, i) => ({ v: i + 1, t: p.name })), value: 0, onChange: (v) => select(v) });
  const leg = (col, t) => h('span', { style: 'display:inline-flex;align-items:center;gap:10px' }, [h('i', { style: `width:22px;height:22px;border-radius:50%;display:inline-block;background:color-mix(in oklab, ${col} 35%, var(--bg));border:2px solid ${col}` }), t]);
  top.append(sg.el, h('div', { style: 'display:flex;gap:28px;font-size:24px;color:var(--fg-2)' }, [leg('var(--prot)', 'Aromatic'), leg('var(--a2)', 'Basic')]));
  const host = h('div', { style: 'position:relative' });
  const info = h('div', { style: 'display:grid;grid-template-columns:auto 1fr;gap:6px 30px;align-items:baseline;padding:24px 34px;border-radius:32px;background:var(--surface);border:1px solid var(--line);min-height:150px' });
  const iName = h('div', { style: 'font-size:46px;font-weight:720;letter-spacing:-.025em;color:var(--ink)' });
  const iRule = h('div', { style: 'font-size:32px;line-height:1.3' });
  const iType = h('div', { style: 'font-size:24px;color:var(--fg-3);letter-spacing:.12em;text-transform:uppercase;font-weight:650' });
  const iNote = h('div', { style: 'font-size:24px;color:var(--fg-2)' });
  info.append(iName, iRule, iType, iNote);
  el.append(top, host, info);
  const D = diagram(host, 1712, 380);
  D.svg.style.height = '100%';
  const X = (i) => 160 + i * 127, Y = 180;
  const resG = PEP.map((r, i) => {
    const g = s('g');
    const ar = AROM.includes(r), ba = BASIC.includes(r);
    const col = ar ? 'var(--prot)' : ba ? 'var(--a2)' : null;
    const bond = i < PEP.length - 1 ? s('line', { x1: 46, y1: 0, x2: 127 - 46, y2: 0, style: 'stroke:var(--fg-3);stroke-width:6;stroke-linecap:round' }) : null;
    if (bond) g.append(bond);
    g.append(s('circle', { r: 46, style: `fill:${col ? `color-mix(in oklab, ${col} 30%, var(--bg))` : 'var(--bg-2)'};stroke:${col || 'var(--line-2)'};stroke-width:3` }));
    txt(g, 0, 9, r, `font-size:26px;font-weight:680;fill:${col || 'var(--fg)'}`, 'middle');
    D.layers.nodes.append(g);
    gsap.set(g, { x: X(i), y: Y });
    g._bond = bond;
    return g;
  });
  const nT = txt(D.layers.labels, 0, 0, 'N', 'font-size:34px;font-weight:700;fill:var(--fg-3)', 'middle');
  const cT = txt(D.layers.labels, 0, 0, 'C', 'font-size:34px;font-weight:700;fill:var(--fg-3)', 'middle');
  gsap.set(nT, { x: X(0) - 92, y: Y + 12 }); gsap.set(cT, { x: X(PEP.length - 1) + 92, y: Y + 12 });
  const cutM = PEP.slice(0, -1).map((r, i) => {
    const g = s('g', { style: 'opacity:0' });
    const sc = scissors(g, 'var(--inh)', 2.2);
    gsap.set(sc, { y: -112 });
    g.append(s('line', { x1: 0, y1: -76, x2: 0, y2: 66, style: 'stroke:var(--inh);stroke-width:3;stroke-dasharray:7 7' }));
    D.layers.labels.append(g);
    gsap.set(g, { x: X(i) + 63.5, y: Y });
    return g;
  });
  let cur = -1, exoTl = null, live = false;
  const restore = (dur = 0.5) => {
    resG.forEach((g, i) => { gsap.to(g, { x: X(i), y: Y, opacity: 1, duration: dur, ease: 'power3.out' }); if (g._bond) gsap.to(g._bond, { opacity: 1, duration: dur }); });
    gsap.to(nT, { x: X(0) - 92, opacity: 1, duration: dur }); gsap.to(cT, { x: X(PEP.length - 1) + 92, opacity: 1, duration: dur });
    cutM.forEach((m) => gsap.to(m, { opacity: 0, duration: 0.3 }));
  };
  function select(i) {
    if (i === cur) return;
    cur = i;
    sg.set(i, false);
    exoTl?.kill(); exoTl = null;
    gsap.killTweensOf([...resG, ...resG.map((g) => g._bond).filter(Boolean), ...cutM, nT, cT]);
    restore(0.4);
    if (!i) {
      iName.textContent = 'Pick a protease'; iRule.innerHTML = 'Each one recognises a <b>group</b> of residues — not one exact substrate.'; iType.textContent = 'Group specificity'; iNote.textContent = 'Press → or click an enzyme above.';
      return;
    }
    const p = PROT[i - 1];
    iName.textContent = p.name; iRule.innerHTML = p.rule; iType.textContent = `${p.type}`; iNote.textContent = p.note || (p.exo ? 'Exopeptidase — works inward from one end of the chain (textbook term).' : 'Endopeptidase — cuts inside the chain (textbook term).');
    if (!p.exo) {
      const cuts = p.cuts(PEP);
      const frag = PEP.map((r, k) => cuts.filter((c) => c < k).length);
      const off = (k) => (frag[k] - cuts.length / 2) * 30;
      cuts.forEach((c, j) => gsap.fromTo(cutM[c], { opacity: 0, y: Y - 30 }, { opacity: 1, y: Y, duration: 0.5, delay: 0.3 + j * 0.15, ease: 'back.out(2)' }));
      resG.forEach((g, k) => {
        gsap.to(g, { x: X(k) + off(k), duration: 0.9, delay: 0.9, ease: 'power3.inOut' });
        if (g._bond && cuts.includes(k)) gsap.to(g._bond, { opacity: 0, duration: 0.3, delay: 0.8 });
      });
      cutM.forEach((m, c) => cuts.includes(c) && gsap.to(m, { x: X(c) + 63.5 + (off(c) + off(c + 1)) / 2, duration: 0.9, delay: 0.9, ease: 'power3.inOut' }));
      gsap.to(nT, { x: X(0) - 92 + off(0), duration: 0.9, delay: 0.9 });
      gsap.to(cT, { x: X(PEP.length - 1) + 92 + off(PEP.length - 1), duration: 0.9, delay: 0.9 });
    } else {
      const C = p.exo === 'C';
      exoTl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: !live, delay: 0.4 });
      for (let k = 0; k < 3; k++) {
        const ri = C ? PEP.length - 1 - k : k;
        const bi = C ? ri - 1 : ri;
        const t0 = k * 1.6;
        exoTl.to(cutM[bi], { opacity: 1, duration: 0.3 }, t0)
          .to(resG[C ? bi : ri]._bond, { opacity: 0, duration: 0.2 }, t0 + 0.5)
          .to(resG[ri], { x: X(ri) + (C ? 30 : -30), y: Y + 130, opacity: 0.5, duration: 0.8, ease: 'power2.out' }, t0 + 0.5)
          .to(cutM[bi], { opacity: 0, duration: 0.3 }, t0 + 0.9)
          .to(C ? cT : nT, { opacity: 0, duration: 0.2 }, t0 + 0.4);
      }
      exoTl.to({}, { duration: 1 }).call(() => restore(0.4));
      if (live) exoTl.play();
    }
  }
  select(0);
  return {
    step: (n) => select(n),
    enter() { live = true; exoTl?.play(); },
    leave() { live = false; exoTl?.pause(); },
    destroy() { exoTl?.kill(); D.destroy(); },
  };
}

// 15 · Learning check (slide 28): three recall questions
function lc3Viz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = 'repeat(3, 1fr)';
  el.style.gap = '28px';
  const chips = (arr, col) => h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' }, arr.map((t) => h('span', { style: `font-size:26px;font-weight:680;padding:6px 18px;border-radius:999px;color:${col};background:color-mix(in oklab, ${col} 16%, transparent);border:2px solid color-mix(in oklab, ${col} 50%, transparent)`, text: t })));
  const Q = [
    { q: 'Pepsin cleaves peptide bonds involving which residues?', a: 'Aromatic residues', c: chips(['Phe', 'Tyr', 'Trp'], 'var(--prot)'), d: 'On their <b>amino side</b>.' },
    { q: 'Trypsin preferentially cleaves bonds involving which residues?', a: 'Basic residues', c: chips(['Lys', 'Arg'], 'var(--a2)'), d: 'On their <b>carboxyl side</b>. The slide also lists His; textbooks give Lys and Arg only.' },
    { q: 'Glucose oxidase in blood-glucose testing shows which specificity?', a: 'Absolute specificity', c: chips(['β-D-glucose only'], 'var(--act)'), d: 'One substrate, one reaction — so it measures glucose selectively.' },
  ];
  const cards = Q.map((x, i) => {
    const ans = h('div', { style: 'display:flex;flex-direction:column;gap:18px;opacity:0;transform:translateY(14px);transition:opacity .55s var(--ease), transform .55s var(--ease)' }, [
      h('div', { style: 'font-size:40px;font-weight:720;letter-spacing:-.02em;color:var(--ink)', text: x.a }), x.c,
      h('div', { style: 'font-size:26px;line-height:1.35;color:var(--fg-2)', html: x.d }),
    ]);
    const qm = h('div', { style: 'position:absolute;left:38px;right:38px;bottom:40px;height:200px;border-radius:26px;border:2px dashed var(--line-2);display:grid;place-items:center;font-size:72px;font-weight:700;color:var(--fg-3);transition:opacity .4s var(--ease)', text: '?' });
    const c = h('div', { style: 'position:relative;display:flex;flex-direction:column;gap:22px;padding:36px 38px;border-radius:36px;background:var(--surface);border:1px solid var(--line)' }, [
      h('div', { style: 'font:760 80px/1 var(--font);letter-spacing:-.04em;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent', text: `0${i + 1}` }),
      h('div', { style: 'font-size:32px;line-height:1.28;font-weight:620;letter-spacing:-.012em', text: x.q }),
      h('div', { style: 'flex:1' }), ans, qm,
    ]);
    el.append(c);
    return { ans, qm };
  });
  return { step: (n) => cards.forEach((c, i) => { const on = n > i; c.ans.style.opacity = on ? 1 : 0; c.ans.style.transform = on ? 'none' : 'translateY(14px)'; c.qm.style.opacity = on ? 0 : 1; }) };
}

// 16 · Coenzymes as carriers: H/e⁻ transfer vs group transfer
function coenzViz(el) {
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '18px';
  const sg = seg({ options: [{ v: 0, t: 'H / e⁻ carriers' }, { v: 1, t: 'Group carriers' }], value: 0, onChange: (v) => setMode(v) });
  el.append(h('div', { style: 'display:flex;align-items:center;gap:22px' }, [sg.el, h('div', { style: 'font-size:24px;color:var(--fg-3)', text: 'Functional classification' })]));
  const host = h('div', { style: 'position:relative;flex:1' });
  el.append(host);
  const D = diagram(host, 960, 770);
  D.svg.style.height = '100%';
  const groups = [s('g'), s('g')];
  groups.forEach((g) => D.layers.nodes.append(g));
  const flows = [[], []];
  const row = (m, y0, o) => {
    const g = groups[m];
    g.append(s('rect', { x: 0, y: y0, width: 960, height: 360, rx: 36, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' }));
    txt(g, 34, y0 + 50, o.title, 'font-size:24px;letter-spacing:.12em;font-weight:650;fill:var(--fg-2)');
    const ty = y0 + 135, by = y0 + 275;
    pill(g, o.top[0], { size: 28, x: 170, y: ty });
    pill(g, o.top[1], { size: 28, x: 800, y: ty });
    hArrow(g, 320, 640, ty, { width: 4 });
    txt(g, 480, ty - 24, o.enzyme, 'font-size:26px;font-weight:680;fill:var(--fg)', 'middle');
    pill(g, o.bot[0], { size: 26, x: 170, y: by, color: o.col, textColor: o.col, weight: 680 });
    pill(g, o.bot[1], { size: 26, x: 800, y: by, color: o.col, textColor: o.col, weight: 680 });
    hArrow(g, 320, 640, by, { width: 4, color: o.col });
    if (o.carrier) pill(g, o.carrier, { size: 26, x: 480, y: by, color: o.col, textColor: 'var(--fg)', weight: 720, tip: o.carrierTip });
    const d = o.up ? `M330,${by - 26} C470,${by - 26} 490,${ty + 26} 630,${ty + 26}` : `M330,${ty + 26} C470,${ty + 26} 490,${by - 26} 630,${by - 26}`;
    const p = s('path', { d, style: `fill:none;stroke:${o.col};stroke-width:2;stroke-dasharray:4 10;opacity:.6` });
    g.prepend(p);
    flows[m].push(D.flow(p, { count: 3, color: o.col, speed: 120, r: 10, autoplay: false }));
    txt(g, 560, (ty + by) / 2 + 8, o.particle, `font-size:26px;font-weight:720;fill:${o.col}`, 'start');
  };
  row(0, 0, { title: 'NAD⁺ · ACCEPTS HYDROGEN + ELECTRONS', top: ['Malate', 'Oxaloacetate'], enzyme: 'Malate dehydrogenase', bot: ['NAD^{+}', 'NADH + H^{+}'], col: 'var(--nadh)', particle: '2H' });
  row(0, 400, { title: 'FAD · ACCEPTS TWO HYDROGEN ATOMS', top: ['Succinate', 'Fumarate'], enzyme: 'Succinate dehydrogenase', bot: ['FAD', 'FADH_{2}'], col: 'var(--fadh)', particle: '2H' });
  row(1, 0, { title: 'PLP (B6) · TRANSAMINATION', top: ['α-Amino acid', 'α-Keto acid'], enzyme: 'Aminotransferase', bot: ['α-Ketoglutarate', 'Glutamate'], col: 'var(--act)', carrier: 'PLP', particle: 'NH_{2}', carrierTip: { title: 'Pyridoxal phosphate (PLP)', body: 'Vitamin B6-derived coenzyme that carries the amino group during transamination.', src: SRC(33) } });
  row(1, 400, { title: 'BIOTIN · CARRIES CO₂ (CARBOXYLATION)', top: ['Pyruvate', 'Oxaloacetate'], enzyme: 'Pyruvate carboxylase', bot: ['HCO_{3}^{−} + ATP', 'ADP + P_{i}'], col: 'var(--atp)', carrier: 'Biotin', particle: 'CO_{2}', up: true, carrierTip: { title: 'Biotin', body: 'Carries CO₂ in ATP-dependent carboxylation. Pyruvate carboxylase is a ligase (EC 6).', src: SRC(33) } });
  let mode = -1, live = false;
  function setMode(m) {
    mode = m;
    sg.set(m, false);
    groups.forEach((g, k) => { gsap.to(g, { opacity: k === m ? 1 : 0, duration: 0.45 }); g.style.pointerEvents = k === m ? 'auto' : 'none'; });
    flows.forEach((fs, k) => fs.forEach((f) => (k === m && live ? f.play() : f.hide())));
  }
  setMode(0);
  return {
    step: (n) => setMode(n >= 1 ? 1 : 0),
    enter() { live = true; setMode(mode); },
    leave() { live = false; D.pauseAll(); },
    destroy: () => D.destroy(),
  };
}

// 17 · Vitamins → coenzymes → functions (interactive chips) + metal cofactors
const VIT = [
  { v: 'B1 · Thiamine', co: 'TPP', coFull: 'Thiamine pyrophosphate (TPP)', fn: 0, col: 'var(--prot)' },
  { v: 'B2 · Riboflavin', co: 'FMN · FAD', coFull: 'Flavin mononucleotide / flavin adenine dinucleotide', fn: 1, col: 'var(--fadh)' },
  { v: 'B3 · Niacin', co: 'NAD · NADP', coFull: 'Nicotinamide adenine dinucleotide (phosphate)', fn: 1, col: 'var(--nadh)' },
  { v: 'B6 · Pyridoxine', co: 'PLP', coFull: 'Pyridoxal phosphate (PLP)', fn: 2, col: 'var(--act)' },
  { v: 'Biotin', co: 'Biotin', coFull: 'Biotin (textbooks: vitamin B7)', fn: 3, col: 'var(--atp)' },
];
const FN = [
  { t: 'Decarboxylation', y: 140 },
  { t: 'Oxidation–reduction', y: 320 },
  { t: 'Amino-group transfer', y: 500 },
  { t: 'Carboxylation', y: 620 },
];
function vitViz(el) {
  const D = diagram(el, 1712, 720);
  const ys = [140, 260, 380, 500, 620];
  const XV = 160, XC = 520, XF = 880;
  [['VITAMIN', XV], ['COENZYME', XC], ['FUNCTION', XF]].forEach(([t, x]) => txt(D.layers.labels, x, 50, t, 'font-size:24px;letter-spacing:.16em;font-weight:650;fill:var(--fg-3)', 'middle'));
  const fnP = FN.map((f) => pill(D.layers.nodes, f.t, { size: 27, x: XF, y: f.y, w: 330 }));
  const rowsV = VIT.map((r, i) => {
    const y = ys[i];
    const vp = pill(D.layers.nodes, r.v, { size: 28, x: XV, y, w: 270, color: r.col, textColor: 'var(--fg)', weight: 680 });
    const cp = pill(D.layers.nodes, r.co, { size: 28, x: XC, y, w: 220, color: r.col, textColor: r.col, weight: 720, tip: { title: r.coFull, body: r.v.includes(' · ') ? `Derived from vitamin ${r.v.replace(' · ', ' (')})` : 'Derived from the vitamin biotin.', src: SRC(34) } });
    const fy = FN[r.fn].y;
    const p1 = s('path', { d: `M${XV + 135},${y} C${XV + 200},${y} ${XC - 170},${y} ${XC - 110},${y}`, style: 'fill:none;stroke-width:4;stroke-linecap:round' });
    const p2 = s('path', { d: `M${XC + 110},${y} C${XC + 190},${y} ${XF - 245},${fy} ${XF - 165},${fy}`, style: 'fill:none;stroke-width:4;stroke-linecap:round' });
    D.layers.edges.append(p1, p2);
    const f1 = D.flow(p1, { count: 1, color: r.col, speed: 90, r: 8, autoplay: false });
    const f2 = D.flow(p2, { count: 2, color: r.col, speed: 140, r: 8, autoplay: false });
    vp.style.cursor = 'pointer';
    vp.addEventListener('click', () => select(i + 1));
    return { vp, cp, p1, p2, f1, f2, r };
  });
  // Metal cofactors panel
  const MX = 1120, MW = 592;
  const mg = s('g');
  D.layers.nodes.append(mg);
  const box = (y, hgt, label) => { mg.append(s('rect', { x: MX, y, width: MW, height: hgt, rx: 34, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' })); txt(mg, MX + 32, y + 48, label, 'font-size:24px;letter-spacing:.14em;font-weight:650;fill:var(--fg-2)'); };
  box(0, 340, 'METAL-ACTIVATED');
  box(370, 350, 'METALLOENZYME');
  txt(mg, MX + 32, 92, 'Binds loosely · may dissociate', 'font-size:28px;font-weight:640');
  txt(mg, MX + 32, 462, 'Binds tightly · integral part', 'font-size:28px;font-weight:640');
  const enzBlob = (cx, cy) => mg.append(s('path', { d: `M${cx - 130},${cy + 10} C${cx - 130},${cy - 60} ${cx - 70},${cy - 70} ${cx - 34},${cy - 60} C${cx - 20},${cy - 30} ${cx + 20},${cy - 30} ${cx + 34},${cy - 60} C${cx + 70},${cy - 70} ${cx + 130},${cy - 60} ${cx + 130},${cy + 10} C${cx + 130},${cy + 70} ${cx + 60},${cy + 80} ${cx},${cy + 80} C${cx - 60},${cy + 80} ${cx - 130},${cy + 70} ${cx - 130},${cy + 10} Z`, style: 'fill:color-mix(in oklab, var(--a2) 20%, var(--bg));stroke:color-mix(in oklab, var(--a2) 70%, transparent);stroke-width:3' }));
  const c1x = MX + 175, c1y = 238, c2x = MX + 175, c2y = 608;
  enzBlob(c1x, c1y);
  enzBlob(c2x, c2y);
  const mgIon = s('g');
  mgIon.append(s('circle', { r: 26, style: 'fill:color-mix(in oklab, var(--nadh) 55%, var(--bg));stroke:var(--nadh);stroke-width:3' }));
  txt(mgIon, 0, 8, 'Mg', 'font-size:22px;font-weight:760;fill:var(--fg)', 'middle');
  mg.append(mgIon);
  gsap.set(mgIon, { x: c1x, y: c1y - 46 });
  const znIon = s('g');
  znIon.append(s('circle', { r: 34, filter: `url(#${D.glowId})`, style: 'fill:color-mix(in oklab, var(--o2) 40%, transparent)' }));
  [[-44, 34], [44, 34], [0, 58]].forEach(([dx, dy]) => znIon.append(s('line', { x1: 0, y1: 0, x2: dx, y2: dy, style: 'stroke:var(--o2);stroke-width:3;opacity:.7' })));
  znIon.append(s('circle', { r: 26, style: 'fill:color-mix(in oklab, var(--o2) 60%, var(--bg));stroke:var(--o2);stroke-width:3' }));
  txt(znIon, 0, 8, 'Zn', 'font-size:22px;font-weight:760;fill:var(--fg)', 'middle');
  mg.append(znIon);
  gsap.set(znIon, { x: c2x, y: c2y - 6 });
  txt(mg, MX + 345, 222, 'Mg²⁺', 'font-size:40px;font-weight:720;fill:var(--nadh)', 'start');
  txt(mg, MX + 345, 260, 'in kinase reactions', 'font-size:24px;fill:var(--fg-2)', 'start');
  txt(mg, MX + 345, 588, 'Zn²⁺', 'font-size:40px;font-weight:720;fill:var(--o2)', 'start');
  txt(mg, MX + 345, 626, 'carbonic anhydrase', 'font-size:24px;fill:var(--fg-2)', 'start');
  txt(mg, MX + 345, 660, 'also Fe²⁺ · Cu²⁺ · Mo', 'font-size:24px;fill:var(--fg-3)', 'start');
  tip(mg, { title: 'Metal cofactors', list: ['<b>Metal-activated enzymes</b>: the metal binds loosely and may dissociate readily — e.g. Mg²⁺ in kinase reactions.', '<b>Metalloenzymes</b>: the metal binds tightly as an integral part — Zn²⁺, Fe²⁺, Cu²⁺, molybdenum; e.g. Zn²⁺ in carbonic anhydrase.'], src: SRC(35) });
  const hop = gsap.timeline({ repeat: -1, paused: true });
  hop.to(mgIon, { x: c1x - 80, y: c1y - 100, duration: 1.1, ease: 'power2.out' }, 0.9)
    .to(mgIon, { x: c1x - 125, y: c1y - 70, duration: 0.8, ease: 'sine.inOut' })
    .to(mgIon, { x: c1x, y: c1y - 46, duration: 1.0, ease: 'power2.in' })
    .to({}, { duration: 0.8 });
  const jiggle = gsap.to(znIon, { scale: 1.06, transformOrigin: '50% 50%', duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut', paused: true });
  let cur = -1, live = false;
  function select(i) {
    cur = i;
    rowsV.forEach((o, k) => {
      const on = i === 0 || i === 6 || k === i - 1;
      const hot = k === i - 1;
      [o.p1, o.p2].forEach((p) => { p.style.stroke = hot ? o.r.col : 'var(--line-2)'; p.style.strokeWidth = hot ? 5 : 3; p.style.opacity = on ? 1 : 0.35; });
      [o.vp, o.cp].forEach((p) => gsap.to(p, { opacity: i === 6 ? 0.4 : on ? 1 : 0.35, duration: 0.4 }));
      [o.f1, o.f2].forEach((f) => (hot && live ? f.play() : f.hide()));
    });
    fnP.forEach((p, f) => {
      const hot = i >= 1 && i <= 5 && VIT[i - 1].fn === f;
      gsap.to(p, { opacity: i === 6 ? 0.4 : i === 0 || hot ? 1 : 0.35, duration: 0.4 });
      p._rect.style.stroke = hot ? VIT[i - 1].col : 'var(--line-2)';
      p._rect.style.strokeWidth = hot ? 4 : 2.5;
    });
    gsap.to(mg, { opacity: i >= 1 && i <= 5 ? 0.45 : 1, duration: 0.4 });
  }
  select(0);
  return {
    step: (n) => select(n),
    enter() { live = true; hop.play(); jiggle.play(); select(cur); },
    leave() { live = false; hop.pause(); jiggle.pause(); D.pauseAll(); },
    destroy() { hop.kill(); jiggle.kill(); D.destroy(); },
  };
}

// 18 · Learning check (slide 50): complete the vitamin table
function lc4Viz(el) {
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.justifyContent = 'center';
  const R = [
    { co: 'NAD⁺ / NADP⁺', vit: 'B3 · Niacin', fn: 'Oxidation–reduction', given: true, col: 'var(--nadh)' },
    { co: 'FMN / FAD', vit: 'B2 · Riboflavin', fn: 'Oxidation–reduction', given: true, col: 'var(--fadh)' },
    { co: 'PLP', vit: 'B6 · Pyridoxine', fn: 'Transfer of amino groups', col: 'var(--act)' },
    { co: 'Biotin', vit: 'Biotin', fn: 'Carboxylation · carries CO₂', col: 'var(--atp)' },
  ];
  const grid = h('div', { style: 'display:grid;grid-template-columns:400px 480px 1fr;gap:14px 18px;align-items:stretch' });
  ['Coenzyme', 'Vitamin source', 'Function'].forEach((t) => grid.append(h('div', { style: 'font-size:24px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--fg-3);padding:0 28px 6px', text: t })));
  const cell = (html, style = '') => h('div', { style: `position:relative;min-height:112px;border-radius:26px;padding:0 28px;display:flex;align-items:center;font-size:36px;font-weight:650;letter-spacing:-.015em;background:var(--surface);border:1px solid var(--line);${style}`, html });
  const flips = [];
  R.forEach((r) => {
    grid.append(cell(r.co, `color:${r.col}`));
    const mk = (ans) => {
      const front = h('div', { style: 'position:absolute;inset:0;display:flex;align-items:center;padding:0 28px;font-size:44px;color:var(--fg-3);border-radius:26px;border:2px dashed var(--line-2);background:var(--bg-2);transition:opacity .45s var(--ease)', text: '?' });
      const back = h('div', { style: 'opacity:0;transform:rotateX(80deg);transition:opacity .5s var(--ease), transform .6s var(--ease);color:var(--ink)', html: ans });
      const c = cell('', 'perspective:600px');
      c.append(back, front);
      return { c, front, back };
    };
    const v = mk(r.vit);
    grid.append(v.c);
    let f = null;
    if (r.given) grid.append(cell(r.fn, 'color:var(--fg-2);font-weight:560'));
    else { f = mk(r.fn); grid.append(f.c); }
    flips.push([v, f].filter(Boolean));
  });
  el.append(grid);
  return {
    step: (n) => flips.forEach((row, i) => row.forEach((x, k) => {
      const on = n > i;
      x.front.style.opacity = on ? 0 : 1;
      x.back.style.opacity = on ? 1 : 0;
      x.back.style.transform = on ? 'none' : 'rotateX(80deg)';
      x.back.style.transitionDelay = on ? `${k * 0.15}s` : '0s';
    })),
  };
}

// 19 · Enzyme concentration: linear v vs [E]; Vmax scales, Km fixed
function enzConcViz(el, ctx) {
  factorStrip(el, 0, ctx);
  const KM = 1.6;
  const topH = h('div', { style: 'position:absolute;left:0;top:64px' });
  const botH = h('div', { style: 'position:absolute;left:0;top:432px' });
  el.append(topH, botH);
  const C1 = chart(topH, { w: 960, h: 360, pad: { l: 90, b: 64, t: 36, r: 40 }, x: { min: 0, max: 10, label: '[Enzyme] →', ticks: false }, y: { min: 0, max: 1.12, ticks: false }, grid: false });
  const C2 = chart(botH, { w: 960, h: 340, pad: { l: 90, b: 64, t: 40, r: 40 }, x: { min: 0, max: 10, label: '[Substrate] →', ticks: false }, y: { min: 0, max: 1.12, ticks: false }, grid: false });
  [C1, C2].forEach((C) => C.top.append(Object.assign(s('text', { x: C.pad.l - 16, y: C.pad.t + 6, 'text-anchor': 'end', class: 'v-label', style: 'fill:var(--fg-2)' }), { textContent: 'v₀' })));
  txt(C1.top, 110, 46, 'substrate in excess', 'font-size:24px;fill:var(--fg-3)', 'start');
  C1.line((x) => 0.1 * x, { color: 'var(--ink)', width: 7, label: 'v ∝ [E]', labelAt: 6, labelDx: -16, labelDy: -26, labelAnchor: 'end' });
  const p1 = C1.point(4, 0.4, { color: 'var(--ink)', r: 14 });
  const g1 = C1.vline(4, { color: 'var(--fg-3)', width: 2, dash: '4 8' });
  const ghost = C2.line((x) => x / (KM + x), { color: 'var(--fg-3)', width: 3, dash: '8 10' });
  let E = 4;
  const cur = C2.line((x) => 0.1 * E * x / (KM + x), { color: 'var(--ink)', width: 7 });
  const hl = C2.hline(0.2, { extent: KM, color: 'var(--atp)', width: 2, dash: '6 8' });
  const vl = C2.vline(KM, { color: 'var(--atp)', width: 3, dash: '6 8', label: 'K_{m} (fixed)', labelDy: 36, labelColor: 'var(--atp)' });
  const half = C2.point(KM, 0.2, { color: 'var(--atp)', r: 11 });
  const vmaxL = C2.hline(0.4, { color: 'var(--a1)', width: 2, dash: '10 10' });
  const vmaxT = txt(C2.top, 940, 0, 'V_{max}', 'font-size:24px;font-weight:650;fill:var(--ink)', 'end');
  const update = (v) => {
    E = v;
    const vm = 0.1 * E;
    p1.move(E, vm); g1.move(E, undefined, vm);
    cur.update((x) => vm * x / (KM + x));
    hl.move(vm / 2, undefined, KM);
    vl.move(KM, 'K_{m} (fixed)', vm / 2);
    half.move(KM, vm / 2);
    vmaxL.move(vm);
    vmaxT.setAttribute('y', C2.sy(vm) - 10);
  };
  const sl = slider({ label: '[Enzyme]', min: 1, max: 10, step: 0.1, value: 4, width: 360, fmt: (v) => `${v.toFixed(1)}×`, onInput: update });
  ctrlBar(el, [sl], { left: 90, bottom: 0 });
  update(4);
  const st = { e: 4 };
  return {
    step(n) { gsap.to(st, { e: n >= 1 ? 9 : 4, duration: 1.4, ease: 'power2.inOut', onUpdate: () => { update(st.e); sl.set(st.e, false); } }); },
  };
}

// 20 · Substrate concentration: hyperbola, regions A/B/C, active-site occupancy
function satViz(el, ctx) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1060px 1fr';
  el.style.gap = '32px';
  const left = h('div', { style: 'position:relative' });
  const right = h('div', { style: 'position:relative;border-radius:36px;background:var(--surface);border:1px solid var(--line)' });
  el.append(left, right);
  const KM = 2.5, XM = 14;
  const C = chart(left, { w: 1060, h: 720, pad: { l: 100, b: 80, t: 40, r: 30 }, x: { min: 0, max: XM, label: '[Substrate] →', ticks: false }, y: { min: 0, max: 1.18, ticks: false }, grid: false });
  C.top.append(Object.assign(s('text', { x: 84, y: 52, 'text-anchor': 'end', class: 'v-label', style: 'fill:var(--fg-2)' }), { textContent: 'v₀' }));
  const zone = (x0, x1, col, letter, name) => {
    C.plot.append(s('rect', { x: C.sx(x0), y: C.pad.t, width: C.sx(x1) - C.sx(x0), height: C.ph, style: `fill:${col};opacity:.09` }));
    txt(C.top, (C.sx(x0) + C.sx(x1)) / 2, C.pad.t + C.ph - 20, letter, `font-size:40px;font-weight:760;fill:${col};opacity:.9`, 'middle');
    if (name) txt(C.top, (C.sx(x0) + C.sx(x1)) / 2, C.pad.t + C.ph - 70, name, `font-size:24px;font-weight:650;fill:${col}`, 'middle');
  };
  zone(0, 1.2, 'var(--act)', 'A');
  zone(1.2, 6, 'var(--atp)', 'B', 'slowing');
  zone(6, XM, 'var(--inh)', 'C', 'zero-order');
  C.hline(1, { color: 'var(--fg-3)', width: 2, dash: '10 10' });
  txt(C.top, C.sx(XM) - 6, C.sy(1) - 14, 'V_{max}', 'font-size:26px;font-weight:650;fill:var(--fg-2)', 'end');
  C.hline(0.5, { extent: KM, color: 'var(--fg-3)', width: 2, dash: '4 8' });
  C.vline(KM, { extent: 0.5, color: 'var(--fg-3)', width: 2, dash: '4 8', label: 'K_{m}', labelDy: 44 });
  txt(C.top, C.sx(0) - 12, C.sy(0.5) + 8, '½V_{max}', 'font-size:24px;fill:var(--fg-2)', 'end');
  const tang = C.line((x) => x / KM, { color: 'var(--act)', width: 3, dash: '6 8', range: [0, 2.3] });
  txt(C.top, C.sx(2.35) + 10, C.sy(0.92) + 6, 'first-order: v ∝ [S]', 'font-size:24px;font-weight:650;fill:var(--act)', 'start');
  const allo = C.line((x) => Math.pow(x, 2.6) / (Math.pow(3.6, 2.6) + Math.pow(x, 2.6)), { color: 'var(--fadh)', width: 5, dash: '12 10', label: 'Allosteric · sigmoidal', labelAt: 4.4, labelDx: 14, labelDy: 18 });
  allo.show(false);
  C.line((x) => x / (KM + x), { color: 'var(--ink)', width: 7, samples: 300 });
  const pt = C.point(0.6, 0.6 / (KM + 0.6), { color: 'var(--ink)', r: 14 });
  // occupancy panel
  factorStrip(right, 1, ctx, 'left:16px;right:16px;top:22px;justify-content:center;gap:6px', false, true);
  const P = diagram(right, 620, 720);
  P.svg.style.position = 'absolute'; P.svg.style.inset = '0';
  const busy = txt(P.layers.labels, 310, 122, '', 'font-size:32px;font-weight:700', 'middle');
  const pos = [[130, 222], [310, 222], [490, 222], [130, 368], [310, 368], [490, 368]];
  const R = 56, a = Math.PI / 6;
  const pac = `M0,0 L${R * Math.cos(a)},${-R * Math.sin(a)} A${R},${R} 0 1 0 ${R * Math.cos(a)},${R * Math.sin(a)} Z`;
  const enz = pos.map(([x, y]) => {
    const g = s('g', { transform: `translate(${x} ${y})` });
    g.append(s('path', { d: pac, style: 'fill:color-mix(in oklab, var(--a2) 70%, var(--bg));stroke:var(--a2);stroke-width:3' }));
    const dot = s('circle', { cx: R * 0.62, cy: 0, r: 15, style: 'fill:var(--inh);opacity:0' });
    g.append(dot);
    P.layers.nodes.append(g);
    return dot;
  });
  const freeDots = Array.from({ length: 22 }, (_, i) => {
    const c = s('circle', { r: 13, style: 'fill:var(--inh);opacity:0' });
    P.layers.fx.append(c);
    const fx = 70 + ((i * 97) % 480), fy = 160 + ((i * 53) % 290);
    gsap.set(c, { attr: { cx: fx, cy: fy } });
    c._tw = gsap.to(c, { attr: { cx: fx + 18 * Math.sin(i), cy: fy + 16 * Math.cos(i * 1.7) }, duration: 1.3 + (i % 5) * 0.3, yoyo: true, repeat: -1, ease: 'sine.inOut', paused: true });
    return c;
  });
  txt(P.layers.labels, 60, 478, 'v / V_{max}', 'font-size:26px;font-weight:620;fill:var(--fg-2)', 'start');
  P.layers.labels.append(s('rect', { x: 60, y: 494, width: 500, height: 24, rx: 12, style: 'fill:var(--surface-3)' }));
  const bar = s('rect', { x: 60, y: 494, width: 0, height: 24, rx: 12, style: 'fill:var(--a1)' });
  P.layers.labels.append(bar);
  const pct = txt(P.layers.labels, 560, 478, '', 'font-size:26px;font-weight:700;font-family:var(--mono)', 'end');
  const update = (S) => {
    const f = S / (KM + S);
    pt.move(S, f);
    const nb = Math.round(6 * f);
    enz.forEach((d, i) => gsap.to(d, { opacity: i < nb ? 1 : 0, duration: 0.3 }));
    const nf = Math.min(22, Math.round(S * 1.6));
    freeDots.forEach((d, i) => gsap.to(d, { opacity: i < nf ? 0.85 : 0, duration: 0.3 }));
    busy.textContent = `${nb} of 6 active sites busy`;
    bar.setAttribute('width', 500 * f);
    pct.textContent = `${Math.round(f * 100)}%`;
  };
  const sl = slider({ label: '[S]', min: 0.1, max: XM, step: 0.05, value: 0.6, width: 230, fmt: (v) => `${(v / KM).toFixed(1)}·K<sub>m</sub>`, onInput: update });
  const tg = toggle({ label: 'Allosteric', on: false, onChange: (v) => allo.show(v) });
  tip(tg.el, { title: 'Allosteric enzymes', body: 'Show a <b>sigmoidal</b> curve instead of the Michaelis–Menten hyperbola (slide 37 figure). Curve illustrative.', src: SRC(37) });
  ctrlBar(right, [sl, tg], { left: 24, right: 24, bottom: 24 });
  update(0.6);
  const st = { s: 0.6 };
  let live = false;
  return {
    step(n) { const to = [0.6, KM, 13][Math.min(n, 2)]; gsap.to(st, { s: to, duration: 1.2, ease: 'power2.inOut', onUpdate: () => { update(st.s); sl.set(st.s, false); } }); },
    enter() { live = true; freeDots.forEach((d) => d._tw.play()); },
    leave() { live = false; freeDots.forEach((d) => d._tw.pause()); },
    destroy() { freeDots.forEach((d) => d._tw.kill()); tang && null; },
  };
}

// 21 · Temperature: bell curve, denaturation zone, human vs thermophile
function tempViz(el, ctx) {
  factorStrip(el, 2, ctx);
  const host = h('div', { style: 'position:absolute;left:0;top:60px' });
  el.append(host);
  const C = chart(host, { w: 960, h: 700, pad: { l: 100, b: 96, t: 110, r: 30 }, x: { min: 0, max: 90, label: 'Temperature (°C)', ticks: [0, 20, 40, 60, 80] }, y: { min: 0, max: 1.12, label: 'Reaction velocity (v₀)', ticks: false }, grid: false });
  const curve = (opt) => { const w = 2.5, a = 0.07, Td = opt + 3.9; const f = (T) => Math.exp(a * T) / (1 + Math.exp((T - Td) / w)); const m = f(opt); return (T) => f(T) / m; };
  const defs = s('defs');
  defs.innerHTML = '<linearGradient id="ek-heat" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--inh);stop-opacity:0"/><stop offset="1" style="stop-color:var(--inh);stop-opacity:.32"/></linearGradient>';
  C.svg.prepend(defs);
  const heat = s('rect', { y: C.pad.t, height: C.ph, style: 'fill:url(#ek-heat)' });
  C.plot.prepend(heat);
  const heatLbl = txt(C.top, 0, C.pad.t + C.ph - 16, 'Heat inactivation', 'font-size:24px;font-weight:650;fill:var(--inh)', 'middle');
  const hum = C.line(curve(37), { color: 'var(--ink)', width: 7, samples: 400, label: 'Human enzyme', labelAt: 29, labelDx: -18, labelDy: 0, labelAnchor: 'end' });
  const thermo = C.line(curve(70), { color: 'var(--prot)', width: 6, samples: 400, label: 'Thermophile', labelAt: 62, labelDx: -18, labelDy: 0, labelAnchor: 'end' });
  thermo.show(false);
  const v37 = C.vline(37, { color: 'var(--a1)', width: 2, dash: '6 8', label: '≈ 37 °C', labelTop: true, extent: 1.02, labelColor: 'var(--ink)' });
  const v70 = C.vline(70, { color: 'var(--prot)', width: 2, dash: '6 8', label: '≈ 70 °C', labelTop: true, extent: 1.02, labelColor: 'var(--prot)' });
  v70.el.style.opacity = 0;
  const pt = C.point(25, curve(37)(25), { color: 'var(--ink)', r: 14 });
  const state = h('div', { style: 'position:absolute;right:30px;top:22px;display:flex;align-items:center;gap:16px;padding:12px 22px;border-radius:24px;background:var(--glass);border:1px solid var(--line);font-size:26px;font-weight:620' });
  const glyph = s('svg', { viewBox: '0 0 80 50', width: 80, height: 50 });
  const folded = s('path', { d: 'M12,30 C8,10 30,4 38,18 C44,6 70,8 66,26 C64,42 44,46 40,34 C34,46 14,44 12,30 Z', style: 'fill:color-mix(in oklab, var(--a1) 40%, transparent);stroke:var(--a1);stroke-width:3' });
  const unfolded = s('path', { d: 'M4,25 C14,8 20,42 30,25 C40,8 46,42 56,25 C64,12 70,34 76,25', style: 'fill:none;stroke:var(--inh);stroke-width:4;stroke-linecap:round;opacity:0' });
  glyph.append(folded, unfolded);
  const stTxt = h('span');
  state.append(glyph, stTxt);
  host.append(state);
  let thermoOn = false, T = 25;
  const update = () => {
    const opt = thermoOn ? 70 : 37;
    const f = curve(opt);
    pt.move(T, f(T));
    const x0 = opt + 1.5;
    heat.setAttribute('x', C.sx(x0)); heat.setAttribute('width', C.sx(90) - C.sx(x0));
    heatLbl.setAttribute('x', (C.sx(x0) + C.sx(90)) / 2);
    const den = T > opt + 2, near = Math.abs(T - opt) <= 2;
    stTxt.innerHTML = den ? '<span style="color:var(--inh)">Denaturing · activity falls</span>' : near ? '<span style="color:var(--act)">Optimum</span>' : 'Warmer → more collisions';
    gsap.to(folded, { opacity: den ? 0 : 1, duration: 0.3 });
    gsap.to(unfolded, { opacity: den ? 1 : 0, duration: 0.3 });
    pt.el.firstChild.setAttribute('fill', thermoOn ? 'var(--prot)' : 'var(--a1)');
  };
  const sl = slider({ label: 'Temperature', min: 0, max: 90, step: 0.5, value: 25, width: 340, fmt: (v) => `${Math.round(v)} °C`, onInput: (v) => { T = v; update(); } });
  const tg = toggle({ label: 'Thermophile', on: false, onChange: (v) => { thermoOn = v; thermo.show(v); if (v) thermo.draw(1.2); v70.el.style.opacity = v ? 1 : 0; gsap.to([hum.el, v37.el], { opacity: v ? 0.35 : 1, duration: 0.4 }); update(); } });
  tip(tg.el, { title: 'Thermophilic bacteria', body: 'Enzymes from thermophiles may remain active at around <b>70 °C</b>.', src: SRC(47) });
  ctrlBar(el, [sl, tg], { left: 0, bottom: 0 });
  update();
  return { step(n) { if (tg.get() !== n >= 1) tg.set(n >= 1); } };
}

// 22 · pH: optimum curves (pepsin acidic vs others), pH slider with live activities
function phViz(el, ctx) {
  factorStrip(el, 3, ctx);
  const host = h('div', { style: 'position:absolute;left:0;top:60px' });
  el.append(host);
  const C = chart(host, { w: 960, h: 640, pad: { l: 100, b: 100, t: 60, r: 30 }, x: { min: 0, max: 14, label: 'pH', ticks: [0, 7, 14] }, y: { min: 0, max: 1.18, label: 'Reaction velocity (v₀)', ticks: false }, grid: false });
  txt(C.top, C.sx(2.2), C.sy(0) + 72, 'acidic', 'font-size:24px;fill:var(--fg-3)', 'middle');
  txt(C.top, C.sx(11.8), C.sy(0) + 72, 'alkaline', 'font-size:24px;fill:var(--fg-3)', 'middle');
  const E = [
    { n: 'Pepsin', c: 2, w: 1.0, col: 'var(--inh)', anchor: 'middle', dx: 0 },
    { n: 'Trypsin', c: 7.9, w: 1.15, col: 'var(--a1)', anchor: 'end', dx: -14 },
    { n: 'Alk. phosphatase', c: 10.2, w: 1.0, col: 'var(--fadh)', anchor: 'start', dx: 14 },
  ];
  const f = (e) => (x) => Math.exp(-Math.pow((x - e.c) / e.w, 2) / 2) * 0.98;
  E.forEach((e) => { e.line = C.line(f(e), { color: e.col, width: 6, samples: 300, label: e.n, labelAt: e.c, labelDx: e.dx, labelDy: -22, labelAnchor: e.anchor }); });
  const vl = C.vline(4, { color: 'var(--fg-3)', width: 2, dash: '5 8' });
  const pts = E.map((e) => C.point(4, f(e)(4), { color: e.col, r: 11 }));
  const meters = E.map((e) => {
    const v = h('b', { style: 'font:700 24px var(--mono);min-width:66px;text-align:right', text: '0%' });
    const fill = h('i', { style: `display:block;height:100%;width:0;border-radius:8px;background:${e.col};transition:width .25s` });
    const m = h('div', { style: 'display:grid;grid-template-columns:200px 150px 70px;align-items:center;gap:12px;font-size:24px;color:var(--fg-2)' }, [h('span', { style: `color:${e.col};font-weight:650`, text: e.n }), h('span', { style: 'width:150px;height:14px;border-radius:8px;background:var(--surface-3);overflow:hidden;display:inline-block' }, [fill]), v]);
    return { m, v, fill };
  });
  const update = (p) => {
    vl.move(p);
    E.forEach((e, i) => { const y = f(e)(p); pts[i].move(p, y); meters[i].v.textContent = `${Math.round(y / 0.98 * 100)}%`; meters[i].fill.style.width = `${(y / 0.98) * 100}%`; });
  };
  const sl = slider({ label: 'pH', min: 0, max: 14, step: 0.05, value: 4, width: 200, fmt: (v) => v.toFixed(1), onInput: update });
  const mbox = h('div', { style: 'display:grid;gap:4px' }, meters.map((m) => m.m));
  const sbox = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, [sl.el]);
  ctrlBar(el, [sbox, mbox], { left: 0, right: 0, bottom: 0 }).style.flexWrap = 'nowrap';
  update(4);
  const st = { p: 4 };
  return { step(n) { const to = [4, 2, 8][Math.min(n, 2)]; gsap.to(st, { p: to, duration: 1.1, ease: 'power2.inOut', onUpdate: () => { update(st.p); sl.set(st.p, false); } }); } };
}

// 23 · Product concentration & enzyme deficiency: pathway simulator
function productViz(el, ctx) {
  factorStrip(el, 4, ctx);
  const host = h('div', { style: 'position:absolute;left:0;right:0;top:66px;bottom:0' });
  el.append(host);
  const D = diagram(host, 960, 794);
  D.svg.style.height = '100%';
  const MX = 222, ys = [80, 280, 480, 680];
  const names = ['Start', 'Intermediate 1', 'Intermediate 2', 'Product'];
  txt(D.layers.labels, 580, 30, 'AMOUNT', 'font-size:22px;letter-spacing:.16em;font-weight:650;fill:var(--fg-3)', 'start');
  const mets = names.map((n, i) => D.node({ id: `m${i}`, x: MX, y: ys[i], label: n, kind: 'mol', size: 28, w: 300, color: i === 3 ? 'var(--a1)' : undefined }));
  const bars = ys.map((y) => {
    D.layers.nodes.append(s('rect', { x: 580, y: y - 18, width: 360, height: 36, rx: 18, style: 'fill:var(--surface-2)' }));
    const b = s('rect', { x: 580, y: y - 18, width: 0, height: 36, rx: 18, style: 'fill:var(--a1)' });
    D.layers.nodes.append(b);
    return b;
  });
  const arrows = [0, 1, 2].map((i) => D.arrow({ from: `m${i}`, to: `m${i + 1}`, width: 5, color: 'var(--line-2)' }));
  const flows = arrows.map((a) => D.flow(a, { count: 2, color: 'var(--a1)', speed: 110, r: 9, autoplay: false }));
  const rev = D.arrow({ d: `M${MX - 70},${ys[3] - 40} C${MX - 100},${ys[3] - 110} ${MX - 100},${ys[2] + 110} ${MX - 70},${ys[2] + 40}`, from: [MX - 70, ys[3] - 40], to: [MX - 70, ys[2] + 40], width: 4, color: 'var(--prot)', dash: '8 8' });
  rev.g.style.opacity = 0;
  const revLbl = txt(D.layers.labels, MX - 112, (ys[2] + ys[3]) / 2 + 8, 'reverse', 'font-size:24px;font-weight:650;fill:var(--prot);opacity:0', 'end');
  const enz = [0, 1, 2].map((i) => {
    const y = (ys[i] + ys[i + 1]) / 2;
    const n = D.node({ x: MX + 228, y, label: `Enzyme ${i + 1}`, kind: 'enz', size: 26, color: 'var(--act)' });
    n.g.style.cursor = 'pointer';
    const x = s('path', { d: `M${MX + 168},${y - 24} L${MX + 288},${y + 24} M${MX + 288},${y - 24} L${MX + 168},${y + 24}`, style: 'stroke:var(--inh);stroke-width:7;stroke-linecap:round;opacity:0' });
    D.layers.labels.append(x);
    n.g.setAttribute('data-tip', JSON.stringify({ title: `Enzyme ${i + 1}`, body: 'Click to make this enzyme deficient (and again to restore it).' }));
    n.g.addEventListener('click', () => { st.block = st.block === i + 1 ? 0 : i + 1; st.prod = false; apply(); });
    return { n, x };
  });
  const banner = pill(D.layers.labels, 'Inborn error of metabolism', { size: 28, x: 700, y: 760, color: 'var(--inh)', textColor: 'var(--inh)', weight: 700 });
  banner.style.opacity = 0;
  const pbanner = pill(D.layers.labels, 'Product build-up slows the step', { size: 26, x: 700, y: 760, color: 'var(--prot)', textColor: 'var(--prot)', weight: 700 });
  pbanner.style.opacity = 0;
  const st = { block: 0, prod: false };
  let live = false;
  function apply() {
    let amt = [0.45, 0.4, 0.4, 0.4];
    if (st.prod) amt = [0.45, 0.45, 0.62, 1];
    if (st.block) amt = amt.map((v, i) => (i < st.block - 1 ? 0.72 : i === st.block - 1 ? 1 : 0.04));
    bars.forEach((b, i) => {
      gsap.to(b, { attr: { width: 360 * amt[i] }, duration: 0.9, ease: 'power3.out' });
      b.style.fill = amt[i] >= 0.95 && (st.block || st.prod) ? (st.block ? 'var(--inh)' : 'var(--prot)') : 'var(--a1)';
    });
    flows.forEach((f, i) => {
      const off = st.block && i >= st.block - 1;
      if (off || !live) f.hide(); else f.play();
      arrows[i].g.style.opacity = off ? 0.3 : 1;
    });
    enz.forEach((e, i) => { e.x.style.opacity = st.block === i + 1 ? 1 : 0; e.n.g.style.opacity = st.block === i + 1 ? 0.55 : 1; });
    gsap.to([rev.g, revLbl], { opacity: st.prod ? 1 : 0, duration: 0.4 });
    if (st.prod && live) { flows[2].pause(); flows[2].dots.forEach((d) => (d.style.display = 'none')); }
    gsap.to(banner, { opacity: st.block ? 1 : 0, duration: 0.4 });
    gsap.to(pbanner, { opacity: st.prod && !st.block ? 1 : 0, duration: 0.4 });
  }
  apply();
  return {
    step(n) { st.prod = n === 1; st.block = n >= 2 ? 3 : 0; apply(); },
    enter() { live = true; apply(); },
    leave() { live = false; D.pauseAll(); },
    destroy: () => D.destroy(),
  };
}

// Shared kinetics state so MM and LB slides stay linked
const KIN = { km: 4, vmax: 80, s: 8 };

// 24 · Michaelis–Menten showpiece
function mmViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '580px 1fr';
  el.style.gap = '44px';
  const left = h('div', { style: 'display:flex;flex-direction:column;gap:22px;justify-content:center' });
  const eq = h('div', { style: 'display:flex;align-items:center;gap:22px;font-size:60px;font-weight:650;letter-spacing:-.02em;padding:26px 34px;border-radius:32px;background:var(--surface);border:1px solid var(--line)', html: '<span>v<sub style="font-size:.55em">0</sub> =</span><span style="display:inline-flex;flex-direction:column;align-items:center;line-height:1.15"><span style="padding:0 10px 8px;border-bottom:4px solid var(--fg)"><span style="color:var(--ink)">V<sub style="font-size:.55em">max</sub></span> <span style="color:var(--atp)">[S]</span></span><span style="padding-top:6px"><span style="color:var(--prot)">K<sub style="font-size:.55em">m</sub></span> + <span style="color:var(--atp)">[S]</span></span></span>' });
  tip(eq, { title: 'Michaelis–Menten equation', list: ['<b>v₀</b> — initial reaction velocity', '<b>V<sub>max</sub></b> — maximum reaction velocity', '<b>K<sub>m</sub></b> — Michaelis constant', '<b>[S]</b> — substrate concentration'], src: SRC(41) });
  const legend = h('div', { style: 'display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:24px;color:var(--fg-2);padding:0 8px' }, [
    h('b', { style: 'color:var(--ink)', html: 'V<sub>max</sub>' }), h('span', { text: 'maximum velocity' }),
    h('b', { style: 'color:var(--prot)', html: 'K<sub>m</sub>' }), h('span', { html: 'Michaelis constant · [S] at ½V<sub>max</sub>' }),
  ]);
  const vBig = h('div', { style: 'font:740 76px/1 var(--font);letter-spacing:-.04em;font-variant-numeric:tabular-nums', text: '0' });
  const vPct = h('div', { style: 'font-size:26px;color:var(--fg-2)' });
  const regime = h('div', { style: 'display:inline-flex;align-self:flex-start;font-size:26px;font-weight:650;padding:8px 20px;border-radius:999px;border:2px solid var(--line-2)' });
  const read = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:0 8px' }, [h('div', { style: 'display:flex;align-items:baseline;gap:18px' }, [h('div', { style: 'font-size:28px;color:var(--fg-2)', html: 'v<sub>0</sub> =' }), vBig, vPct]), regime]);
  const ctr = h('div.ctrls', { style: 'position:relative;flex-direction:column;align-items:stretch;gap:6px;padding:18px 26px' });
  left.append(eq, legend, read, ctr);
  const right = h('div', { style: 'position:relative' });
  el.append(left, right);
  const XM = 40;
  const C = chart(right, { w: 1088, h: 720, pad: { l: 110, b: 92, t: 40, r: 30 }, x: { min: 0, max: XM, ticks: [0, 10, 20, 30] }, y: { min: 0, max: 112, ticks: false }, grid: false });
  C.top.append(Object.assign(s('text', { x: 94, y: 52, 'text-anchor': 'end', class: 'v-label', style: 'fill:var(--fg-2)' }), { textContent: 'v₀' }));
  txt(C.top, C.sx(XM), C.sy(0) + 40, '[S] →', 'font-size:28px;fill:var(--fg-2)', 'end');
  const zFirstG = s('g'), zZeroG = s('g');
  const zFirst = s('rect', { y: C.pad.t, height: C.ph, style: 'fill:var(--act);opacity:.12' });
  const zZero = s('rect', { y: C.pad.t, height: C.ph, style: 'fill:var(--inh);opacity:.09' });
  zFirstG.append(zFirst); zZeroG.append(zZero);
  C.plot.prepend(zFirstG, zZeroG);
  const zZeroT = txt(C.top, 0, C.pad.t + C.ph - 24, 'zero-order · v ≈ V_{max}', 'font-size:24px;font-weight:650;fill:var(--inh)', 'start');
  const tang = C.line(() => 0, { color: 'var(--act)', width: 3, dash: '6 8' });
  const tangT = txt(C.top, 0, 0, 'first-order · v ≈ (V_{max}/K_{m})[S]', 'font-size:24px;font-weight:650;fill:var(--act)', 'start');
  const vmaxL = C.hline(80, { color: 'var(--ink)', width: 2, dash: '10 10' });
  const vmaxT = txt(C.top, 1088 - 34, 0, 'V_{max}', 'font-size:28px;font-weight:700;fill:var(--ink)', 'end');
  const halfL = C.hline(40, { color: 'var(--prot)', width: 2, dash: '5 8' });
  const halfT = txt(C.top, 98, 0, '½V_{max}', 'font-size:24px;font-weight:650;fill:var(--prot)', 'end');
  const kmL = C.vline(4, { color: 'var(--prot)', width: 3, dash: '5 8', label: 'K_{m}', labelDy: 72, labelColor: 'var(--prot)' });
  const kmPt = C.point(4, 40, { color: 'var(--prot)', r: 11 });
  const curve = C.line((x) => (80 * x) / (4 + x), { color: 'var(--ink)', width: 8, samples: 400 });
  const sL = C.vline(8, { color: 'var(--fg-3)', width: 2, dash: '4 8' });
  const pt = C.point(8, 53, { color: 'var(--ink)', r: 15 });
  const guides = [halfL.el, halfT, kmL.el, kmPt.el];
  const firsts = [zFirstG, tang.el, tangT];
  const zeros = [zZeroG, zZeroT];
  const update = () => {
    const { km, vmax, s: S } = KIN;
    const v = (x) => (vmax * x) / (km + x);
    curve.update(v);
    vmaxL.move(vmax); vmaxT.setAttribute('y', C.sy(vmax) - 12);
    halfL.move(vmax / 2, undefined, km); halfT.setAttribute('y', C.sy(vmax / 2) + 8);
    kmL.move(km, 'K_{m}', vmax / 2); kmPt.move(km, vmax / 2);
    sL.move(S, undefined, v(S)); pt.move(S, v(S));
    const x1 = Math.min(XM, 0.25 * km);
    zFirst.setAttribute('x', C.sx(0)); zFirst.setAttribute('width', C.sx(x1) - C.sx(0));
    tang.update((x) => (vmax / km) * x, [0, Math.min(XM, km * 0.92)]);
    tangT.setAttribute('x', C.sx(Math.min(XM, km * 0.92)) + 12); tangT.setAttribute('y', C.sy(Math.min(106, vmax * 0.92)) + 10);
    const x2 = Math.min(XM, 5 * km);
    zZero.setAttribute('x', C.sx(x2)); zZero.setAttribute('width', Math.max(0, C.sx(XM) - C.sx(x2)));
    zZeroT.setAttribute('x', C.sx(x2) + 14); zZeroT.style.display = x2 < XM - 8 ? '' : 'none';
    const vv = v(S);
    vBig.textContent = vv.toFixed(1);
    vPct.innerHTML = `= ${Math.round((vv / vmax) * 100)}% of V<sub>max</sub>`;
    const r = S < 0.25 * km ? ['≈ first-order · v ∝ [S]', 'var(--act)'] : S > 5 * km ? ['≈ zero-order · v ≈ V<sub>max</sub>', 'var(--inh)'] : [Math.abs(S - km) < 0.06 * km ? '[S] = K<sub>m</sub> → v = ½V<sub>max</sub>' : 'In between · rising, slowing', Math.abs(S - km) < 0.06 * km ? 'var(--prot)' : 'var(--fg-2)'];
    regime.innerHTML = r[0]; regime.style.color = r[1]; regime.style.borderColor = `color-mix(in oklab, ${r[1]} 50%, transparent)`;
  };
  const sK = slider({ label: 'K<sub>m</sub>', min: 1, max: 15, step: 0.1, value: KIN.km, width: 250, fmt: (v) => v.toFixed(1), onInput: (v) => { KIN.km = v; update(); } });
  const sV = slider({ label: 'V<sub>max</sub>', min: 20, max: 100, step: 1, value: KIN.vmax, width: 250, fmt: (v) => v.toFixed(0), onInput: (v) => { KIN.vmax = v; update(); } });
  const sS = slider({ label: '[S]', min: 0.2, max: XM, step: 0.1, value: KIN.s, width: 250, fmt: (v) => v.toFixed(1), onInput: (v) => { KIN.s = v; update(); } });
  [sK, sV, sS].forEach((x) => { x.el.style.justifyContent = 'space-between'; x.el.querySelector('label').style.minWidth = '80px'; ctr.append(x.el); });
  update();
  return {
    enter() { sK.set(KIN.km, false); sV.set(KIN.vmax, false); sS.set(KIN.s, false); update(); curve.draw(1.2); },
    step(n) {
      gsap.to(guides, { opacity: n >= 1 ? 1 : 0, duration: 0.5 });
      gsap.to(firsts, { opacity: n >= 2 ? 1 : 0, duration: 0.5 });
      gsap.to(zeros, { opacity: n >= 3 ? 1 : 0, duration: 0.5 });
    },
  };
}

// 25 · Km & affinity: hexokinase vs glucokinase, magnet analogy
function kmViz(el) {
  const host = h('div', { style: 'position:absolute;left:0;top:0' });
  el.append(host);
  const C = chart(host, { w: 960, h: 560, pad: { l: 112, b: 96, t: 40, r: 70 }, x: { min: 0, max: 20, ticks: [0, 5, 10, 15, 20], fmt: (v) => (v === 20 ? '20 mM' : v) }, y: { min: 0, max: 1.12, ticks: false }, grid: false });
  C.top.append(Object.assign(s('text', { x: 96, y: 50, 'text-anchor': 'end', class: 'v-label', style: 'fill:var(--fg-2)' }), { textContent: 'v₀' }));
  const band = s('rect', { x: C.sx(3.6), width: C.sx(5.6) - C.sx(3.6), y: C.pad.t, height: C.ph, style: 'fill:var(--atp);opacity:.12' });
  C.plot.prepend(band);
  txt(C.top, C.sx(4.6), C.pad.t + 30, 'fasting', 'font-size:24px;font-weight:650;fill:var(--atp)', 'middle');
  let actual = false;
  const hkF = (x) => x / (0.15 + x);
  const hk = (x) => (actual ? 0.36 : 1) * hkF(x);
  const gk = (x) => Math.pow(x, 1.7) / (Math.pow(10, 1.7) + Math.pow(x, 1.7));
  C.hline(1, { color: 'var(--fg-3)', width: 2, dash: '10 10' });
  const vmaxT = txt(C.top, C.pad.l - 12, C.sy(1) + 8, 'V_{max}', 'font-size:24px;font-weight:650;fill:var(--fg-2)', 'end');
  const vmaxHK = C.hline(0.36, { color: 'var(--a2)', width: 2, dash: '10 10' });
  const vmaxHKT = txt(C.top, C.sx(20), C.sy(0.36) + 32, 'V_{max} hexokinase', 'font-size:24px;font-weight:650;fill:var(--a2)', 'end');
  vmaxHK.el.style.opacity = 0; vmaxHKT.style.opacity = 0;
  const half = C.hline(0.5, { color: 'var(--fg-3)', width: 2, dash: '4 8', extent: 10 });
  const halfT = txt(C.top, C.pad.l - 12, C.sy(0.5) + 8, '½V_{max}', 'font-size:24px;fill:var(--fg-2)', 'end');
  const lhk = C.line(hk, { color: 'var(--a2)', width: 7, samples: 500, label: 'Hexokinase', labelAt: 12.5, labelDy: -18, labelAnchor: 'middle', labelDx: 0 });
  const lgk = C.line(gk, { color: 'var(--prot)', width: 7, samples: 300, label: 'Glucokinase', labelAt: 16.5, labelDy: 46, labelAnchor: 'middle', labelDx: 0 });
  C.vline(0.15, { color: 'var(--a2)', width: 3, dash: '5 6', extent: 0.5, label: 'low K_{m}', labelDy: 76, labelColor: 'var(--a2)' });
  C.vline(10, { color: 'var(--prot)', width: 3, dash: '5 6', extent: 0.5, label: 'K_{m} ≈ 10 mM', labelDy: 76, labelColor: 'var(--prot)' });
  const pHK = C.point(5, hk(5), { color: 'var(--a2)', r: 12 });
  const pGK = C.point(5, gk(5), { color: 'var(--prot)', r: 12 });
  const vg = C.vline(5, { color: 'var(--fg-3)', width: 2, dash: '4 8' });
  // magnet analogy (slide 45)
  const strip = h('div', { style: 'position:absolute;left:0;right:0;top:572px;display:grid;grid-template-columns:1fr 1fr;gap:20px' });
  el.append(strip);
  const magnets = [{ n: 'Hexokinase', k: 'strong magnet', col: 'var(--a2)', f: hkF, w: 7 }, { n: 'Glucokinase', k: 'weak magnet', col: 'var(--prot)', f: gk, w: 3.5 }].map((m) => {
    const box = h('div', { style: 'position:relative;height:150px;border-radius:28px;background:var(--surface);border:1px solid var(--line);overflow:hidden' });
    const D = diagram(box, 470, 150);
    D.svg.style.height = '100%';
    D.layers.nodes.append(s('path', { d: 'M60,44 L60,94 A40,40 0 0 0 140,94 L140,44', style: `fill:none;stroke:${m.col};stroke-width:${m.w * 2.6};stroke-linecap:butt;opacity:${m.w > 5 ? 1 : 0.55}` }));
    D.layers.nodes.append(s('rect', { x: 60 - m.w * 1.3, y: 32, width: m.w * 2.6, height: 16, style: 'fill:var(--inh)' }), s('rect', { x: 140 - m.w * 1.3, y: 32, width: m.w * 2.6, height: 16, style: 'fill:var(--inh)' }));
    txt(D.layers.labels, 186, 54, m.n, `font-size:28px;font-weight:700;fill:${m.col}`, 'start');
    txt(D.layers.labels, 186, 88, m.k, 'font-size:24px;fill:var(--fg-2)', 'start');
    const pct = txt(D.layers.labels, 448, 58, '', 'font-size:34px;font-weight:740;font-family:var(--mono)', 'end');
    txt(D.layers.labels, 448, 88, 'of V_{max}', 'font-size:22px;fill:var(--fg-3)', 'end');
    const dots = Array.from({ length: 10 }, () => {
      const c = s('g');
      c.append(s('circle', { r: 11, style: 'fill:var(--atp)' }));
      D.layers.fx.append(c);
      return c;
    });
    return { m, D, dots, pct, box };
  });
  magnets.forEach((x) => strip.append(x.box));
  tip(strip, { title: 'K<sub>m</sub> analogy', body: 'Low K<sub>m</sub> = <b>strong magnet</b>: hexokinase captures glucose even when it is scarce (fasting, most tissues). High K<sub>m</sub> = <b>weak magnet</b>: glucokinase binds well only when glucose is abundant (after a meal; liver and pancreatic β cells).', src: SRC(45) });
  let G = 5;
  const update = () => {
    lhk.update(hk); lgk.update(gk);
    pHK.move(G, hk(G)); pGK.move(G, gk(G)); vg.move(G);
    const nAll = Math.max(1, Math.min(10, Math.round(G / 2)));
    magnets.forEach((mg) => {
      const f = mg.m.f(G);
      mg.pct.textContent = `${Math.round(f * 100)}%`;
      const caught = Math.min(nAll, f > 0.8 ? 2 : f > 0.3 ? 1 : 0);
      mg.dots.forEach((d, i) => {
        const cap = i < caught;
        gsap.to(d, { x: cap ? (i === 0 ? 60 : 140) : 186 + (i - caught) * 26, y: cap ? 18 : 126, opacity: i < nAll ? 1 : 0, duration: 0.5, ease: 'power2.out' });
      });
    });
  };
  const sl = slider({ label: '[Glucose]', min: 0.5, max: 20, step: 0.1, value: 5, width: 300, fmt: (v) => `${v.toFixed(1)} mM`, onInput: (v) => { G = v; update(); } });
  const tg = toggle({ label: 'Actual V<sub>max</sub>', on: false, onChange: (v) => { actual = v; vmaxHK.el.style.opacity = v ? 1 : 0; vmaxHKT.style.opacity = v ? 1 : 0; half.el.style.opacity = v ? 0 : 1; halfT.style.opacity = v ? 0 : 1; update(); } });
  tip(tg.el, { title: 'Two views of the same data', body: 'Off: each curve as % of its own V<sub>max</sub> (slide 43). On: real activities — glucokinase has the higher V<sub>max</sub> (slide 44 graph).', src: SRC('43–44') });
  ctrlBar(el, [sl, tg], { left: 0, bottom: 0 });
  update();
  const st = { g: 5 };
  return { step(n) { gsap.to(st, { g: n >= 1 ? 12 : 5, duration: 1.4, ease: 'power2.inOut', onUpdate: () => { G = st.g; update(); sl.set(G, false); } }); }, destroy: () => magnets.forEach((m) => m.D.destroy()) };
}

// 26 · Lineweaver–Burk: linked double-reciprocal plot
function lbViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '620px 1fr';
  el.style.gap = '40px';
  const left = h('div', { style: 'position:relative' });
  const right = h('div', { style: 'position:relative' });
  el.append(left, right);
  const SP = [1, 1.5, 2.5, 4, 7, 12, 20];
  const KM0 = Math.min(8, Math.max(1, KIN.km)), VM0 = Math.min(100, Math.max(50, KIN.vmax));
  KIN.km = KM0; KIN.vmax = VM0;
  // MM mini chart
  const C = chart(left, { w: 620, h: 430, pad: { l: 80, b: 60, t: 50, r: 20 }, x: { min: 0, max: 22, ticks: [0, 10, 20] }, y: { min: 0, max: 110, ticks: false }, grid: false });
  C.svg.style.height = '430px';
  txt(C.top, 64, 54, 'v₀', 'font-size:28px;fill:var(--fg-2)', 'end');
  txt(C.top, 600, C.sy(0) - 14, '[S] →', 'font-size:26px;fill:var(--fg-2)', 'end');
  txt(C.top, 600, 30, 'Michaelis–Menten · a curve', 'font-size:24px;fill:var(--fg-3);font-weight:600', 'end');
  const mmLine = C.line(() => 0, { color: 'var(--ink)', width: 6 });
  const mmPts = SP.map(() => { const c = s('circle', { r: 10, style: 'fill:var(--atp);stroke:var(--bg);stroke-width:3' }); C.top.append(c); return c; });
  const vmaxL = C.hline(80, { color: 'var(--fg-3)', width: 2, dash: '8 8' });
  const vmaxLT = txt(C.top, 64, 0, 'V_{max}', 'font-size:24px;font-weight:650;fill:var(--fg-2)', 'end');
  // LB custom plot (axes through the origin)
  const W = 1052, H = 720;
  const D = diagram(right, W, H);
  const X0 = -1.15, X1 = 1.05, Y0 = -0.012, Y1 = 0.16;
  const px = (x) => 40 + ((x - X0) / (X1 - X0)) * (W - 80), py = (y) => 120 + (1 - (y - Y0) / (Y1 - Y0)) * (H - 210);
  const ax = D.layers.edges;
  ax.append(s('line', { x1: px(X0), x2: px(X1), y1: py(0), y2: py(0), style: 'stroke:var(--fg-3);stroke-width:3' }));
  ax.append(s('line', { x1: px(0), x2: px(0), y1: py(Y0), y2: py(Y1), style: 'stroke:var(--fg-3);stroke-width:3' }));
  [-1, -0.5, 0.5].forEach((t) => { ax.append(s('line', { x1: px(t), x2: px(t), y1: py(0) - 8, y2: py(0) + 8, style: 'stroke:var(--fg-3);stroke-width:2' })); txt(ax, px(t), py(0) + 40, String(t).replace('-', '−'), 'font-size:24px;fill:var(--fg-3)', 'middle'); });
  [0.05, 0.1, 0.15].forEach((t) => { ax.append(s('line', { x1: px(0) - 8, x2: px(0) + 8, y1: py(t), y2: py(t), style: 'stroke:var(--fg-3);stroke-width:2' })); txt(ax, px(0) - 14, py(t) + 8, String(t), 'font-size:24px;fill:var(--fg-3)', 'end'); });
  txt(ax, px(X1), py(0) + 40, '1/[S] →', 'font-size:28px;font-weight:650;fill:var(--fg-2)', 'end');
  txt(ax, px(0) + 16, py(Y1) + 6, '1/v_{0}', 'font-size:28px;font-weight:650;fill:var(--fg-2)', 'start');
  const extra = s('path', { style: 'fill:none;stroke:var(--ink);stroke-width:4;stroke-dasharray:8 10' });
  const line = s('path', { style: 'fill:none;stroke:var(--ink);stroke-width:6;stroke-linecap:round' });
  D.layers.edges.append(extra, line);
  const lbPts = SP.map(() => { const c = s('circle', { r: 11, style: 'fill:var(--atp);stroke:var(--bg);stroke-width:3' }); D.layers.nodes.append(c); return c; });
  const yInt = s('circle', { r: 13, style: 'fill:var(--ink);stroke:var(--bg);stroke-width:4' });
  const xInt = s('circle', { r: 13, style: 'fill:var(--prot);stroke:var(--bg);stroke-width:4' });
  D.layers.labels.append(yInt, xInt);
  const yIntT = txt(D.layers.labels, 0, 0, '1/V_{max}', 'font-size:28px;font-weight:700;fill:var(--ink)', 'end');
  const xIntT = txt(D.layers.labels, 0, 0, '−1/K_{m}', 'font-size:28px;font-weight:700;fill:var(--prot)', 'middle');
  const tri = s('path', { style: 'fill:none;stroke:var(--fadh);stroke-width:3;stroke-dasharray:5 6' });
  const triT = txt(D.layers.labels, 0, 0, 'slope = K_{m}/V_{max}', 'font-size:26px;font-weight:700;fill:var(--fadh)', 'start');
  D.layers.labels.append(tri);
  const eqBox = h('div', { style: 'position:absolute;left:40px;top:0;font-size:36px;font-weight:650;letter-spacing:-.01em;padding:14px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line)', html: '<sup>1</sup>&frasl;<sub>v₀</sub> = <span style="color:var(--fadh)">(K<sub>m</sub>/V<sub>max</sub>)</span> · <sup>1</sup>&frasl;<sub>[S]</sub> + <span style="color:var(--ink)">1/V<sub>max</sub></span>' });
  tip(eqBox, { title: 'Lineweaver–Burk (double-reciprocal) plot', body: 'Taking reciprocals of the Michaelis–Menten equation turns the hyperbola into a <b>straight line</b>: y-intercept = 1/V<sub>max</sub>, x-intercept = −1/K<sub>m</sub>, slope = K<sub>m</sub>/V<sub>max</sub>.', src: `${SRC(46)} · Lippincott Fig. 5.11` });
  right.append(eqBox);
  const read = h('div', { style: 'position:absolute;right:0;top:110px;display:grid;gap:6px;padding:14px 22px;border-radius:22px;background:var(--glass);border:1px solid var(--line);font-size:24px;font-family:var(--mono)' });
  right.append(read);
  const sK = slider({ label: 'K<sub>m</sub>', min: 1, max: 8, step: 0.1, value: KM0, width: 250, fmt: (v) => v.toFixed(1), onInput: (v) => { KIN.km = v; update(); } });
  const sV = slider({ label: 'V<sub>max</sub>', min: 50, max: 100, step: 1, value: VM0, width: 250, fmt: (v) => v.toFixed(0), onInput: (v) => { KIN.vmax = v; update(); } });
  const bar = ctrlBar(left, [sK, sV], { left: 0, right: 0, top: 446 });
  bar.style.flexDirection = 'column'; bar.style.alignItems = 'stretch'; bar.style.gap = '6px';
  [sK, sV].forEach((x) => { x.el.style.justifyContent = 'space-between'; x.el.querySelector('label').style.minWidth = '80px'; });
  const imp = h('div', { style: 'position:absolute;left:0;right:0;top:612px;font-size:24px;color:var(--fg-2);line-height:1.35', html: 'Why bother? A straight line gives K<sub>m</sub> and V<sub>max</sub> from its intercepts — no guessing an asymptote.' });
  tip(imp, { title: 'Importance (textbook)', body: 'V<sub>max</sub> is only approached, never reached, on the hyperbola — the straight line lets you read V<sub>max</sub> and K<sub>m</sub> accurately from the intercepts. It is also used to tell inhibitor types apart (next lecture).', src: 'Lippincott Ch 5 · lecture slide 46' });
  left.append(imp);
  let n0 = 0;
  const update = () => {
    const { km, vmax } = KIN;
    const v = (x) => (vmax * x) / (km + x);
    mmLine.update(v);
    vmaxL.move(vmax); vmaxLT.setAttribute('y', C.sy(vmax) + 8);
    SP.forEach((S, i) => { mmPts[i].setAttribute('cx', C.sx(S)); mmPts[i].setAttribute('cy', C.sy(v(S))); });
    const m = km / vmax, b = 1 / vmax;
    const yl = (x) => m * x + b;
    const xi = -1 / km;
    const xe = Math.min(X1, (Y1 - b) / m);
    line.setAttribute('d', `M${px(0)},${py(b)} L${px(xe)},${py(yl(xe))}`);
    extra.setAttribute('d', `M${px(Math.max(X0, xi - 0.08))},${py(yl(Math.max(X0, xi - 0.08)))} L${px(0)},${py(b)}`);
    SP.forEach((S, i) => { lbPts[i].setAttribute('cx', px(1 / S)); lbPts[i].setAttribute('cy', py(Math.min(Y1, 1 / v(S)))); lbPts[i].style.visibility = 1 / v(S) > Y1 ? 'hidden' : ''; });
    yInt.setAttribute('cx', px(0)); yInt.setAttribute('cy', py(b));
    yIntT.setAttribute('x', px(0) - 22); yIntT.setAttribute('y', py(b) - 20);
    xInt.setAttribute('cx', px(xi)); xInt.setAttribute('cy', py(0));
    xIntT.setAttribute('x', px(xi)); xIntT.setAttribute('y', py(0) + 50);
    const a1 = 0.3, a2 = 0.65;
    tri.setAttribute('d', `M${px(a1)},${py(yl(a1))} L${px(a2)},${py(yl(a1))} L${px(a2)},${py(yl(a2))}`);
    triT.setAttribute('x', (px(a1) + px(a2)) / 2); triT.setAttribute('y', py(yl(a1)) + 36); triT.setAttribute('text-anchor', 'middle');
    read.innerHTML = `<div><span style="color:var(--ink)">1/V<sub>max</sub></span> = ${b.toFixed(4)}</div><div><span style="color:var(--prot)">−1/K<sub>m</sub></span> = −${(1 / km).toFixed(3)}</div><div><span style="color:var(--fadh)">slope</span> = ${m.toFixed(3)}</div>`;
  };
  const vis = () => {
    gsap.to(lbPts, { opacity: n0 >= 1 ? 1 : 0, duration: 0.4, stagger: n0 >= 1 ? 0.08 : 0 });
    gsap.to([line], { opacity: n0 >= 1 ? 1 : 0, duration: 0.5 });
    gsap.to([extra, yInt, yIntT], { opacity: n0 >= 2 ? 1 : 0, duration: 0.5 });
    gsap.to([xInt, xIntT, tri, triT, read], { opacity: n0 >= 3 ? 1 : 0, duration: 0.5 });
  };
  update();
  return {
    enter() { const km = Math.min(8, Math.max(1, KIN.km)), vm = Math.min(100, Math.max(50, KIN.vmax)); KIN.km = km; KIN.vmax = vm; sK.set(km, false); sV.set(vm, false); update(); },
    step(n) { n0 = n; vis(); },
    destroy: () => D.destroy(),
  };
}

// 27 · Learning checks (slides 51–52): Km/affinity and Vmax MCQs
function lc5Viz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '36px';
  const q1 = qCard({ kicker: 'Slide 51', q: 'Which statement correctly interprets hexokinase and glucokinase?', list: true, correct: 2, opts: ['Glucokinase has a lower K<sub>m</sub> and higher affinity.', 'Hexokinase has a higher K<sub>m</sub> and lower affinity.', 'Hexokinase has a lower K<sub>m</sub> and higher affinity.', 'Both enzymes have the same K<sub>m</sub>.', 'Affinity increases as K<sub>m</sub> increases.'], why: '<b>C</b> — low K<sub>m</sub> = high affinity; glucokinase’s K<sub>m</sub> is high (≈ 10 mmol/L).' });
  const q2 = qCard({ kicker: 'Slide 52', q: 'Why does more substrate barely change velocity at V<sub>max</sub>?', list: true, correct: 2, opts: ['The substrate has been completely depleted.', 'The enzyme has been denatured.', 'All active sites are nearly saturated.', 'The enzyme concentration has increased.', 'Product formation has completely stopped.'], why: '<b>C</b> — every active site is busy: zero-order kinetics. Only more enzyme raises V<sub>max</sub>.' });
  el.append(q1.el, q2.el);
  q1.viz.style.display = 'none';
  q2.viz.style.display = 'none';
  return { step(n) { q1.reveal(n >= 1); q2.reveal(n >= 2); } };
}

// 28 · Summary card mini-visuals
function sumEC(el) {
  const D = diagram(el, 320, 120);
  D.svg.style.height = '120px';
  EC.forEach((c, i) => txt(D.layers.labels, 26 + i * 54, 92, c.L, `font-size:64px;font-weight:780;letter-spacing:-.03em;fill:${c.col}`, 'middle'));
  return { destroy: () => D.destroy() };
}
function sumSpec(el) {
  const D = diagram(el, 320, 120);
  D.svg.style.height = '120px';
  SPEC.slice(0, 5).forEach((sp, i) => {
    D.layers.nodes.append(s('circle', { cx: 30 + i * 62, cy: 62, r: 24, style: `fill:color-mix(in oklab, ${sp.col} 22%, transparent);stroke:${sp.col};stroke-width:3` }));
    txt(D.layers.labels, 30 + i * 62, 71, String(i + 1), `font-size:24px;font-weight:720;fill:${sp.col}`, 'middle');
  });
  return { destroy: () => D.destroy() };
}
function sumKm(el) {
  const C = chart(el, { w: 320, h: 130, pad: { l: 10, b: 10, t: 12, r: 10 }, x: { min: 0, max: 10, ticks: false }, y: { min: 0, max: 1.1, ticks: false }, grid: false });
  C.svg.style.height = '130px';
  C.hline(0.5, { extent: 1.4, color: 'var(--prot)', width: 2, dash: '4 6' });
  C.vline(1.4, { extent: 0.5, color: 'var(--prot)', width: 2, dash: '4 6' });
  const l = C.line((x) => x / (1.4 + x), { color: 'var(--a1)', width: 5 });
  C.point(1.4, 0.5, { color: 'var(--prot)', r: 8 });
  return { enter: () => l.draw(1.2) };
}
function sumLB(el) {
  const D = diagram(el, 320, 130);
  D.svg.style.height = '130px';
  const ax = D.layers.edges;
  ax.append(s('line', { x1: 10, x2: 310, y1: 110, y2: 110, style: 'stroke:var(--fg-3);stroke-width:2' }));
  ax.append(s('line', { x1: 130, x2: 130, y1: 10, y2: 120, style: 'stroke:var(--fg-3);stroke-width:2' }));
  ax.append(s('path', { d: 'M60,110 L130,82', style: 'stroke:var(--a1);stroke-width:4;stroke-dasharray:6 6' }));
  ax.append(s('path', { d: 'M130,82 L305,12', style: 'stroke:var(--a1);stroke-width:5;stroke-linecap:round' }));
  D.layers.nodes.append(s('circle', { cx: 130, cy: 82, r: 8, style: 'fill:var(--ink)' }), s('circle', { cx: 60, cy: 110, r: 8, style: 'fill:var(--prot)' }));
  return { destroy: () => D.destroy() };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry, 8th/9th ed., Ch 5 — Enzymes',
    'Lecture slides: Enzyme classification &amp; kinetics (L.6–L.7), Dr Gulam Saidunnisa, NUST',
  ],
  slides: [
    // 1
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.6 – L.7',
      title: 'Enzymes',
      subtitle: 'How they’re named, how they work, how fast they go.',
      meta: ['Dr. Gulam Saidunnisa', 'Classification · Kinetics', '10 learning outcomes'],
      notes: [
        'Two sessions in one deck: Session 6 classification (L.6.1–6.5) and Session 7 kinetics (L.7.1–7.5).',
        'On the right: a real crystal structure of human glucokinase (PDB 1V4S) with glucose glowing in its active site. Drag to rotate.',
        'We will come back to this exact enzyme three times: active site, induced fit, and K<sub>m</sub> (glucokinase vs hexokinase).',
      ],
      visual: heroViz,
    },
    // 2
    {
      layout: 'full',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      bullets: [{ t: 'Hover for full wording' }, { t: 'Click to jump' }],
      src: 'Lecture slides 2, 29',
      notes: [
        'Session 6 (slide 2): define enzyme & active site, IUBMB classes, activation energy, mechanism, specificity.',
        'Session 7 (slide 29): cofactors & coenzymes, classify coenzymes, factors affecting velocity with graphs, Michaelis–Menten, Lineweaver–Burk.',
        'Each row links to the slide that covers it.',
      ],
      visual: sloViz,
    },
    // 3
    {
      layout: 'cards',
      eyebrow: 'Clinical significance',
      title: 'Why enzymes <em>matter</em>',
      cards: [
        { icon: 'baby', k: 'Inherited defects', title: 'Inborn errors', body: 'A missing enzyme blocks a pathway.', tip: { title: 'Inborn errors of metabolism', body: 'Inherited enzyme defects cause inborn errors of metabolism: the substrate or an upstream intermediate accumulates and the pathway is disrupted.', src: SRC('3, 49') } },
        { icon: 'drop', k: 'Cell injury', title: 'Leak into plasma', body: 'Damaged cells release their enzymes.', tip: { title: 'Plasma enzymes', body: 'Cell injury may release intracellular enzymes into plasma — the basis of plasma enzyme tests.', src: SRC(3) } },
        { icon: 'gauge', k: 'Lab medicine', title: 'Diagnosis & monitoring', body: 'Enzyme activity tracks disease.', tip: { title: 'Diagnosis & monitoring', body: 'Enzyme activity supports diagnosis and disease monitoring. Example from the lecture: <b>glucose oxidase</b> selectively measures glucose.', src: SRC('3, 22') } },
        { icon: 'pill', k: 'Treatment', title: 'Substitution therapy', body: 'Enzymes given as medicines.', tip: { title: 'Therapeutic enzymes', body: 'Enzymes are used therapeutically — e.g. substitution therapy. <b>Lactase</b> supplements specifically digest lactose.', src: SRC('3, 22') } },
      ],
      src: SRC(3),
      notes: [
        'Inherited defects → inborn errors of metabolism (we will see the mechanism on the product-concentration slide).',
        'Cell injury releases intracellular enzymes into plasma — their activity supports diagnosis and monitoring.',
        'Therapy: substitution therapy; lactase supplements for lactose intolerance.',
      ],
    },
    // 4
    {
      layout: 'cards',
      eyebrow: 'Intracellular localisation',
      title: 'Every pathway has an <em>address</em>',
      cards: [
        { icon: 'cycle', k: 'Mitochondria', title: 'Oxidation', list: ['TCA cycle', 'Fatty acid oxidation', 'Pyruvate oxidation'], tip: { title: 'Mitochondria', list: ['TCA cycle', 'Fatty acid oxidation', 'Oxidation of pyruvate'], src: SRC(4) } },
        { icon: 'layers', k: 'Cytosol', title: 'Breakdown & build', list: ['Glycolysis', 'PP pathway', 'Fatty acid synthesis'], tip: { title: 'Cytosol', list: ['Glycolysis', 'Pentose phosphate (PP) pathway', 'Fatty acid synthesis'], src: SRC(4) } },
        { icon: 'chain', k: 'Nucleus', title: 'Copying', list: ['DNA synthesis', 'RNA synthesis'], tip: { title: 'Nucleus', body: 'DNA and RNA synthesis.', src: SRC(4) } },
        { icon: 'scissors', k: 'Lysosome', title: 'Recycling', list: ['Degrades complex macromolecules'], tip: { title: 'Lysosome', body: 'Degradation of complex macromolecules.', src: SRC(4) } },
      ],
      src: SRC(4),
      notes: [
        'Enzymes are compartmentalised, so each pathway runs in a defined organelle.',
        'Mitochondria: TCA, fatty acid oxidation, pyruvate oxidation. Cytosol: glycolysis, PP pathway, fatty acid synthesis.',
        'Nucleus: DNA & RNA synthesis. Lysosome: degradation of complex macromolecules.',
        'Useful link: synthesis and breakdown of fatty acids are kept apart (cytosol vs mitochondria).',
      ],
    },
    // 5
    {
      eyebrow: 'What is an enzyme?',
      title: 'Building a <em>holoenzyme</em>',
      bullets: [
        { t: '<b>Protein</b> catalysts · speed reactions', tip: { title: 'Definition', body: 'Enzymes are protein catalysts, usually within cells, that increase the rate of reactions.', src: SRC(5) } },
        { t: '<b>Apoenzyme</b> = the protein part', tip: { title: 'Apoenzyme', body: 'The protein component of the enzyme.', src: SRC(5) } },
        { t: '+ <b>cofactor</b> → active holoenzyme', tip: { title: 'Holoenzyme — two wordings', body: 'Slide 5: “Apoenzyme + <b>coenzyme</b> = holoenzyme”. Slide 30: “Apoenzyme + <b>cofactor</b> = holoenzyme”. Cofactor is the umbrella term: organic coenzymes <i>and</i> metal ions — the slide’s own diagram shows both.', src: `${SRC('5, 30')} · Lippincott Ch 5` } },
        { t: 'Coenzyme organic · metal inorganic', tip: { title: 'Two kinds of cofactor', list: ['<b>Coenzymes</b>: small, heat-stable organic molecules, usually from vitamins; act as cosubstrates', '<b>Metal cofactors</b>: inorganic ions — Mg²⁺, Zn²⁺, Fe²⁺, Cu²⁺'], src: SRC(30) } },
      ],
      steps: 3,
      src: 'Lecture slides 5, 30 · schematic after the lecture figure',
      notes: [
        'Enzymes: protein catalysts, usually within cells, that increase reaction rates.',
        'Build 1: the coenzyme (organic, vitamin-derived, heat-stable) docks into the apoenzyme cleft.',
        'Build 2: a metal ion cofactor docks at the rim. Build 3: catalytic site forms — holoenzyme, active.',
        'Wording: slide 5 says apoenzyme + coenzyme; slide 30 says apoenzyme + cofactor. Cofactor is the general term (coenzymes + metal ions).',
      ],
      visual: holoViz,
    },
    // 6
    {
      layout: 'full',
      eyebrow: 'IUBMB classification',
      title: 'Six classes: <em>OTHLIL</em>',
      bullets: [{ t: 'Named by the reaction' }, { t: 'Click any class' }],
      steps: 6,
      src: 'Lecture slides 6–12 · examples from the lecture',
      notes: [
        'Classification is based on the reaction catalysed. Mnemonic OTHLIL.',
        'EC 1 Oxidoreductases — LDH: lactate + NAD⁺ ⇌ pyruvate + NADH + H⁺ (2H transferred).',
        'EC 2 Transferases — kinase: phosphate from ATP to glucose. (Slide 8’s “Aminotransferases” panel actually shows serine hydroxymethyltransferase; real transamination is on slide 33.)',
        'EC 3 Hydrolases — urease uses water: urea + H₂O → CO₂ + 2NH₃. EC 4 Lyases — histidine decarboxylase, no water, 1 → 2 products.',
        'EC 5 Isomerases — phosphoglucomutase moves P from C1 to C6. EC 6 Ligases — pyruvate carboxylase joins CO₂ to pyruvate using ATP (biotin).',
        'Textbook aside: IUBMB added EC 7 Translocases in 2018 — the lecture uses the classic six.',
      ],
      visual: ecViz,
    },
    // 7
    {
      layout: 'full',
      eyebrow: 'Learning check · slide 26',
      title: 'Name the <em>class</em>',
      bullets: [{ t: 'Answer, then press →' }],
      steps: 2,
      src: 'Lecture slide 26 · 3D: real L-alanine and its mirror image',
      notes: [
        'Q1: D-alanine → L-alanine. One isomer to another → Isomerase (D). (Textbook: alanine racemase.)',
        'The 3D models are exact mirror images — same atoms, same bonds, different handedness.',
        'Q2: ester + water → alcohol + acid. Water cleaves an ester bond → Hydrolase (C).',
        'Note the option letters differ between the two questions on the original slide.',
      ],
      visual: lc1Viz,
    },
    // 8
    {
      layout: 'full',
      eyebrow: 'Learning check · slide 27',
      title: 'Identify each <em>class</em>',
      bullets: [{ t: 'Four reactions' }, { t: 'Press → to reveal' }],
      steps: 4,
      src: 'Lecture slide 27',
      notes: [
        '1 · Maltase: maltose + H₂O → 2 glucose → EC 3 Hydrolase.',
        '2 · DNMTs: cytosine + SAM → 5-methylcytosine + SAH → EC 2 Transferase (methyl group).',
        '3 · Glucose-1-P ⇌ glucose-6-P (no enzyme drawn) → EC 5 Isomerase (phosphoglucomutase).',
        '4 · L-Malate dehydrogenase: malate + NAD⁺ ⇌ oxaloacetate + NADH + H⁺ → EC 1 Oxidoreductase.',
      ],
      visual: lc2Viz,
    },
    // 9
    {
      eyebrow: 'How enzymes work',
      title: 'Lowering the <em>barrier</em>',
      bullets: [
        { t: 'E + S ⇌ ES → E + P', tip: { title: 'Enzyme action', body: 'A temporary enzyme–substrate complex forms; the enzyme is released unchanged.', src: SRC('13, 23') } },
        { t: '<b>E<sub>a</sub></b>: ground → transition state', tip: { title: 'Activation energy (Eₐ)', body: 'A substrate must reach the transition state before it can form product. Eₐ is the energy difference between the ground state and the transition state.', src: SRC(13) } },
        { t: 'Enzymes <b>lower E<sub>a</sub></b> → faster', tip: { title: 'Why it matters', body: 'Reactions can then proceed at normal body temperature, compatible with life.', src: SRC(14) } },
        { t: '<b>ΔG</b> & equilibrium unchanged', tip: { title: 'No change in equilibrium', body: 'Same start and end free energies with or without enzyme — so the same ΔG and the same equilibrium position. The enzyme changes the <b>rate</b>, not the final amount of product.', src: `${SRC(14)} · slide wording “i.e. product formation” means the equilibrium yield` } },
      ],
      steps: 2,
      src: 'Lecture slides 13–14 · after Lippincott Fig. 5 · curve illustrative',
      notes: [
        'Uncatalysed: substrate must climb to the transition state T* — high Eₐ.',
        'Build 1 (or toggle): add the enzyme — the hump drops (lower Eₐ) and molecules cross faster.',
        'Build 2: the start (reactants) and end (products) levels never move — ΔG and equilibrium are identical.',
        'Common exam trap: enzymes do not change ΔG, Keq or the final yield; they only speed up reaching equilibrium.',
      ],
      visual: eaViz,
    },
    // 10
    {
      eyebrow: 'The active site',
      title: 'A pocket built to <em>fit</em>',
      bullets: [
        { t: 'Small part of the enzyme', tip: { title: 'Active site', body: 'The region that specifically binds the substrate and catalyses the reaction. Occupies a small part of the enzyme.', src: SRC(15) } },
        { t: 'A three-dimensional <b>pocket</b>' },
        { t: 'Weak, <b>non-covalent</b> binding', tip: { title: 'Binding', body: 'Substrate binds through weak, non-covalent interactions. The pocket recognises complementary chemical and structural features of the substrate while excluding others.', src: SRC('15–16') } },
        { t: 'Acidic · basic · polar · nonpolar', tip: { title: 'Active-site groups', list: ['Acidic groups (e.g. Asp, Glu — textbook)', 'Basic groups (Arg, Lys)', 'Polar groups', 'Nonpolar side chains'], src: SRC(16) } },
      ],
      src: 'Lecture slides 15–16 · real structure: human glucokinase + glucose (PDB 1V4S)',
      notes: [
        'This is the real glucokinase active site. Glucose (gold) sits in a small pocket; residues within ~9 Å are coloured by chemistry.',
        'Red acidic (Asp205, Glu256), blue basic (Lys169), green polar (Asn204), amber nonpolar.',
        'Binding is by weak non-covalent forces — hydrogen bonds, ionic and hydrophobic contacts.',
        'Shape + chemistry together give specificity: complementary substrates fit, others are excluded.',
      ],
      visual: activeSiteViz,
    },
    // 11
    {
      layout: 'full',
      eyebrow: 'Mechanism of action',
      title: 'Two models of <em>binding</em>',
      bullets: [{ t: 'Fischer · rigid' }, { t: 'Koshland · flexible' }],
      steps: 2,
      src: 'Lecture slides 23–25 · schematic',
      notes: [
        'E + S ⇌ ES → E + P: a temporary ES complex forms through weak non-covalent interactions.',
        'Build 1 — Lock & key (Fischer / template): rigid, pre-formed site; substrate fits like a key. Limitation: no flexibility, no conformational change, no allosteric regulation.',
        'Build 2 — Induced fit (Koshland): flexible site; binding induces a conformational change that improves catalytic alignment. Better explains regulation.',
        'Next slide: induced fit in a real enzyme.',
      ],
      visual: modelsViz,
    },
    // 12
    {
      eyebrow: 'Induced fit · real structures',
      title: 'Glucokinase <em>closes</em> on glucose',
      bullets: [
        { t: 'Two real crystal structures', tip: { title: 'The data', body: 'Human glucokinase without glucose (super-open, PDB 1V4T) and with glucose (closed, PDB 1V4S), superposed on the large domain. In-between frames are interpolated.', src: 'RCSB PDB · Kamata et al. 2004' } },
        { t: 'Glucose enters the open cleft' },
        { t: 'Small domain <b>swings shut</b>', tip: { title: 'Conformational change', body: 'Substrate binding induces a conformational change that improves catalytic alignment.', src: SRC(25) } },
        { t: 'Flexibility → <b>regulation</b>', tip: { title: 'Significance', body: 'Because enzymes are flexible, the induced-fit model better explains enzyme regulation.', src: SRC(25) } },
      ],
      steps: 1,
      src: 'Lecture slide 25 · PDB 1V4T → 1V4S (morph interpolated)',
      notes: [
        'This is induced fit for real — not a cartoon. Grey = large domain, blue = small domain, gold = glucose.',
        'Press → (or drag the slider): glucose moves into the cleft, then the small domain swings over it and the cleft closes.',
        'Point out that the site is not pre-formed: the closed pocket only exists after glucose binds.',
        'Glucokinase is the liver/β-cell glucose sensor — we meet it again with K<sub>m</sub>.',
      ],
      visual: morphViz,
    },
    // 13
    {
      layout: 'full',
      eyebrow: 'Enzyme specificity',
      title: 'Five kinds of <em>specificity</em>',
      bullets: [{ t: 'Press → for each' }, { t: 'Hover for definitions' }],
      steps: 6,
      src: 'Lecture slides 17–22',
      notes: [
        '1 Reaction: pyruvate → acetyl-CoA (PDH), lactate (LDH), oxaloacetate (pyruvate carboxylase), alanine (transaminase).',
        '2 Stereo: human enzymes use L-amino acids and D-sugars. SDH makes fumarate (trans), not maleate (cis) — strictly geometric isomers; LDH makes L-lactate, not D-lactate (true optical example).',
        '3 Group: proteases recognise a residue type (aromatic, basic). 4 Bond: peptide, glycosidic, ester bonds.',
        '5 Absolute: urease → urea only; glucose oxidase → β-D-glucose only.',
        '6 Importance: metabolic order, efficiency, diagnosis (glucose oxidase), therapy (lactase).',
      ],
      visual: specViz,
    },
    // 14
    {
      layout: 'full',
      eyebrow: 'Group specificity · proteases',
      title: 'Where each protease <em>cuts</em>',
      bullets: [{ t: 'Pick an enzyme' }],
      steps: 5,
      src: 'Lecture slide 20 · trypsin per textbook (Lys, Arg) · endo/exo terms textbook',
      notes: [
        'Pepsin: amino side of aromatic residues (Phe, Tyr, Trp). In reality pepsin is fairly broad; aromatic residues are preferred.',
        'Chymotrypsin: carboxyl side of aromatic residues.',
        'Trypsin: carboxyl side of basic residues. Slide 20 lists His, Lys, Arg, and its drawing puts the cuts on the wrong side — textbooks: after Lys and Arg only. The chain here contains His to show it is not cut.',
        'Carboxypeptidase and aminopeptidase remove residues one at a time from the C- and N-terminus.',
      ],
      visual: proteaseViz,
    },
    // 15
    {
      layout: 'full',
      eyebrow: 'Learning check · slide 28',
      title: 'Quick <em>recall</em>',
      bullets: [{ t: 'Three questions' }],
      steps: 3,
      src: 'Lecture slide 28',
      notes: [
        'Pepsin: aromatic residues Phe, Tyr, Trp (amino side).',
        'Trypsin: basic residues — slide says His, Lys, Arg; textbook-correct answer Lys and Arg.',
        'Glucose oxidase: absolute specificity (acts only on β-D-glucose). Textbook nuance: it is also stereospecific.',
      ],
      visual: lc3Viz,
    },
    // 16
    {
      eyebrow: 'Coenzymes',
      title: 'Coenzymes are <em>carriers</em>',
      bullets: [
        { t: 'Small, heat-stable, organic', tip: { title: 'Coenzymes', body: 'Small, heat-stable organic molecules, usually derived from vitamins.', src: SRC(30) } },
        { t: 'Act as <b>cosubstrates</b>', tip: { title: 'Mechanism', body: 'They take part in the reaction like a second substrate: NAD⁺ leaves as NADH + H⁺, FAD as FADH₂, and must be regenerated.', src: SRC('30, 32') } },
        { t: 'Carry <b>H/e⁻</b> or <b>groups</b>', tip: { title: 'Functional classification', list: ['<b>Hydrogen / electron transfer</b> — mainly oxidoreductases: NAD⁺/NADH, FAD/FADH₂', '<b>Transfer of other groups</b> — amino, carbon or one-carbon groups: PLP, biotin, TPP'], src: SRC(31) } },
      ],
      steps: 1,
      src: 'Lecture slides 30–33',
      notes: [
        'H/e⁻ carriers: NAD⁺ accepts hydrogen and electrons → NADH + H⁺ (malate DH). FAD accepts two H atoms → FADH₂ (succinate DH).',
        'Textbook detail: NAD⁺ actually takes a hydride ion (H⁻); the second proton is released as H⁺.',
        'Build 1 — group carriers: PLP carries the amino group in transamination; biotin carries CO₂ in carboxylation (pyruvate carboxylase, ATP-dependent).',
      ],
      visual: coenzViz,
    },
    // 17
    {
      layout: 'full',
      eyebrow: 'Coenzymes from vitamins · metal cofactors',
      title: 'Vitamins become <em>coenzymes</em>',
      bullets: [{ t: 'Press → for each vitamin' }],
      steps: 6,
      src: 'Lecture slides 34–35',
      notes: [
        'B1 thiamine → TPP → decarboxylation. B2 riboflavin → FMN/FAD → oxidation–reduction.',
        'B3 niacin → NAD/NADP → oxidation–reduction. B6 pyridoxine → PLP → transfer of amino groups.',
        'Biotin → biotin → carboxylation (textbooks call it B7).',
        'Build 6 — metals: metal-activated enzymes bind the metal loosely (Mg²⁺ in kinases); metalloenzymes bind it tightly as an integral part (Zn²⁺ in carbonic anhydrase; also Fe²⁺, Cu²⁺, Mo).',
      ],
      visual: vitViz,
    },
    // 18
    {
      layout: 'full',
      eyebrow: 'Learning check · slide 50',
      title: 'Complete the <em>table</em>',
      bullets: [{ t: 'Vitamin & function' }],
      steps: 4,
      src: 'Lecture slide 50 · answers from slide 34',
      notes: [
        'NAD⁺/NADP⁺ ← B3 niacin. FMN/FAD ← B2 riboflavin.',
        'PLP ← B6 pyridoxine: transfer of amino groups (transamination).',
        'Biotin ← biotin: carboxylation reactions (carries CO₂).',
      ],
      visual: lc4Viz,
    },
    // 19
    {
      eyebrow: 'Factors · enzyme concentration',
      title: 'More enzyme, more <em>speed</em>',
      bullets: [
        { t: 'Substrate in excess', tip: { title: 'Condition', body: 'When substrate is abundant, reaction velocity is directly proportional to enzyme concentration.', src: SRC(37) } },
        { t: 'v ∝ [E] · a straight line' },
        { t: 'V<sub>max</sub> rises · K<sub>m</sub> unchanged', tip: { title: 'K<sub>m</sub> is independent of [E]', body: 'K<sub>m</sub> does not change when enzyme concentration changes; V<sub>max</sub> rises in proportion to [E] (textbook).', src: SRC(42) } },
      ],
      steps: 1,
      src: 'Lecture slides 36–37, 42 · curves illustrative',
      notes: [
        'Five factors (slide 36): enzyme concentration, substrate concentration, temperature & pH, product concentration, activators & inhibitors (next lecture).',
        'With substrate in excess, doubling enzyme doubles velocity — the straight red line of slide 37.',
        'Drag [Enzyme] (or press →): the lower panel shows the hyperbola grows taller (V<sub>max</sub> ∝ [E]) but K<sub>m</sub> stays at the same [S].',
        'Note: the top-left figure on slide 37 (hyperbolic vs sigmoidal) belongs to substrate concentration — next slide.',
      ],
      visual: enzConcViz,
    },
    // 20
    {
      layout: 'full',
      eyebrow: 'Factors · substrate concentration',
      title: 'Filling the <em>active sites</em>',
      bullets: [{ t: 'Hyperbola → V<sub>max</sub>' }, { t: 'First-order → zero-order' }],
      steps: 2,
      src: 'Lecture slides 37–40 · curves illustrative',
      notes: [
        'Increasing [S] raises initial velocity until the enzyme becomes saturated — hyperbolic Michaelis–Menten shape.',
        'Region A: v rises almost proportionally with [S] — first-order. Region B: rises less than proportionally as sites fill.',
        'Region C: approaches V<sub>max</sub> — zero-order with respect to [S]. Builds step through A → K<sub>m</sub> (3 of 6 sites busy) → C.',
        'Right panel = slide 40 analogy: at low [S] many sites are free; at V<sub>max</sub> nearly all are occupied — the plateau is saturation, not substrate running out.',
        'Toggle “Allosteric” for the sigmoidal curve of slide 37.',
      ],
      visual: satViz,
    },
    // 21
    {
      eyebrow: 'Factors · temperature',
      title: 'Warmer helps — <em>until it hurts</em>',
      bullets: [
        { t: 'Heat → more collisions → faster', tip: { title: 'Rising limb', body: 'Rising temperature increases molecular collisions and reaction velocity up to the optimum.', src: SRC(47) } },
        { t: 'Past the optimum: <b>denaturation</b>', tip: { title: 'Falling limb', body: 'Above the optimum, heat disrupts enzyme structure and activity falls rapidly.', src: SRC(47) } },
        { t: 'Human enzymes: best near <b>37 °C</b>', tip: { title: 'Clinical relevance', body: 'Human enzymes work best near 37 °C and lose activity at higher temperatures; enzymes from thermophilic bacteria may remain active at around 70 °C.', src: SRC(47) } },
      ],
      steps: 1,
      src: 'Lecture slide 47 · curve illustrative, optimum per the slide text (the reproduced graph peaks nearer 50 °C)',
      notes: [
        'Drag the temperature: the rising limb is more collisions; past the optimum the enzyme unfolds (icon) and activity collapses.',
        'Slide text: human enzymes work best near 37 °C. The reproduced textbook graph peaks higher — it is a generic enzyme, so we plot the 37 °C optimum.',
        'Build 1 / toggle: thermophilic bacteria — enzymes still active around 70 °C.',
      ],
      visual: tempViz,
    },
    // 22
    {
      eyebrow: 'Factors · pH',
      title: 'Each enzyme has its <em>pH</em>',
      bullets: [
        { t: 'One <b>optimum pH</b> each', tip: { title: 'Optimum pH', body: 'Each enzyme has an optimum pH at which catalytic activity is highest.', src: SRC(48) } },
        { t: 'pH changes <b>ionisation</b>', tip: { title: 'Why activity falls', body: 'Marked changes in pH alter ionisation and may disrupt enzyme structure, reducing activity.', src: SRC(48) } },
        { t: 'Pepsin acidic · others higher', tip: { title: 'The three curves', body: 'Pepsin works in acid (stomach); trypsin and alkaline phosphatase work at higher pH.', src: `${SRC(48)} · positions illustrative (textbook order) — the slide’s graph draws trypsin and ALP lower` } },
      ],
      steps: 2,
      src: 'Lecture slide 48 · curve positions illustrative',
      notes: [
        'Drag pH: each enzyme’s activity read-out updates live.',
        'Build 1: acidic pH — pepsin active, trypsin and ALP silent. Build 2: alkaline side — the reverse.',
        'Mechanism: ionisation of active-site groups and the substrate changes; extremes denature the protein.',
        'The slide graph shows trypsin peaking near pH 6; textbooks place trypsin nearer pH 8 and ALP higher still — we avoid quoting exact optima.',
      ],
      visual: phViz,
    },
    // 23
    {
      eyebrow: 'Factors · product concentration',
      title: 'When product <em>piles up</em>',
      bullets: [
        { t: 'Product slows <b>reversible</b> steps', tip: { title: 'Product accumulation', body: 'Accumulating product can slow a reversible reaction and reduce net product formation.', src: SRC(49) } },
        { t: 'Missing enzyme → <b>upstream build-up</b>', tip: { title: 'Enzyme deficiency', body: 'If an enzyme is deficient, its substrate or an upstream intermediate may accumulate, disrupting the pathway.', src: SRC(49) } },
        { t: 'Basis of <b>inborn errors</b>', tip: { title: 'Inborn error of metabolism', body: 'Upstream accumulation + missing product = the biochemical basis of inborn errors of metabolism.', src: SRC('3, 49') } },
      ],
      steps: 2,
      src: 'Lecture slide 49 · amounts schematic',
      notes: [
        'Build 1: product accumulates — the last (reversible) step slows and runs partly backwards.',
        'Build 2: Enzyme 3 deficient (the slide’s figure) — intermediate 2 piles up, product disappears: an inborn error of metabolism.',
        'Click any enzyme to knock it out yourself.',
      ],
      visual: productViz,
    },
    // 24
    {
      layout: 'full',
      eyebrow: 'Michaelis–Menten',
      title: 'One equation, one <em>curve</em>',
      bullets: [{ t: 'Drag K<sub>m</sub>, V<sub>max</sub>, [S]' }, { t: 'Press → for guides' }],
      steps: 3,
      src: 'Lecture slides 38–42 · first/zero-order limits per Lippincott Ch 5 · units arbitrary',
      notes: [
        'v₀ = V<sub>max</sub>[S]/(K<sub>m</sub> + [S]). v₀ initial velocity, V<sub>max</sub> maximum velocity, K<sub>m</sub> Michaelis constant, [S] substrate concentration.',
        'Build 1: set [S] = K<sub>m</sub> → v = ½V<sub>max</sub>. That is the definition of K<sub>m</sub>.',
        'Build 2: [S] ≪ K<sub>m</sub> → v ≈ (V<sub>max</sub>/K<sub>m</sub>)[S]: first-order, proportional to [S].',
        'Build 3: [S] ≫ K<sub>m</sub> → v ≈ V<sub>max</sub>: zero-order, independent of [S].',
        'Sliders are shared with the Lineweaver–Burk slide.',
      ],
      visual: mmViz,
    },
    // 25
    {
      eyebrow: 'Michaelis constant & affinity',
      title: 'Low K<sub>m</sub>, <em>high affinity</em>',
      bullets: [
        { t: 'K<sub>m</sub> = [S] at ½V<sub>max</sub>', tip: { title: 'Definition', body: 'K<sub>m</sub> is the substrate concentration at which v₀ equals ½V<sub>max</sub>.', src: SRC(42) } },
        { t: '≈ 50% of sites occupied', tip: { title: 'At K<sub>m</sub>', body: 'Approximately 50% of active sites are occupied.', src: SRC(42) } },
        { t: 'Not changed by [enzyme]', tip: { title: 'Constant', body: 'K<sub>m</sub> does not change when enzyme concentration changes.', src: SRC(42) } },
        { t: 'Low K<sub>m</sub> = <b>high affinity</b>', tip: { title: 'Hexokinase vs glucokinase', list: ['<b>Hexokinase</b>: low K<sub>m</sub>, higher affinity; most tissues; active even at fasting glucose', '<b>Glucokinase</b>: high K<sub>m</sub> (≈ 10 mmol/L), lower affinity; liver & pancreatic β cells; active when glucose is high'], src: `${SRC('42–45')} · glucokinase is sigmoidal (textbook), so its “K<sub>m</sub>” is strictly S<sub>0.5</sub>` } },
      ],
      steps: 1,
      src: 'Lecture slides 42–45 · curves illustrative (hexokinase K<sub>m</sub> drawn low, not to scale)',
      notes: [
        'Four K<sub>m</sub> conclusions from slide 42 (bullets).',
        'Hexokinase: low K<sub>m</sub> → nearly saturated even at fasting glucose — the strong magnet that captures scarce glucose.',
        'Glucokinase: high K<sub>m</sub> (≈ 10 mmol/L) → responds in proportion as glucose rises after a meal — the weak magnet (slide 45).',
        'Build 1: glucose rises to a fed level — glucokinase activity climbs, hexokinase barely changes. Toggle “Actual V<sub>max</sub>” for slide 44: glucokinase has the higher V<sub>max</sub>.',
        'The slide quotes hexokinase K<sub>m</sub> ≈ 0.5 mmol/L; many textbooks give < 0.1 mmol/L — learn it as “low”.',
      ],
      visual: kmViz,
    },
    // 26
    {
      layout: 'full',
      eyebrow: 'Lineweaver–Burk',
      title: 'The curve, <em>straightened</em>',
      bullets: [{ t: 'Same K<sub>m</sub>, V<sub>max</sub>' }, { t: 'Intercepts give both' }],
      steps: 3,
      src: 'Lecture slide 46 · Lippincott Fig. 5.11 · units arbitrary',
      notes: [
        '1/v₀ = (K<sub>m</sub>/V<sub>max</sub>)(1/[S]) + 1/V<sub>max</sub> — a straight line.',
        'Build 1: the same seven measurements, re-plotted as reciprocals, fall on a line.',
        'Build 2: y-intercept = 1/V<sub>max</sub>. Build 3: x-intercept = −1/K<sub>m</sub>; slope = K<sub>m</sub>/V<sub>max</sub>.',
        'Importance (textbook): precise K<sub>m</sub> and V<sub>max</sub> without guessing the plateau; also used to identify inhibitor types (next lecture).',
      ],
      visual: lbViz,
    },
    // 27
    {
      layout: 'full',
      eyebrow: 'Learning check · slides 51–52',
      title: 'K<sub>m</sub> & V<sub>max</sub> <em>check</em>',
      bullets: [{ t: 'Two MCQs' }],
      steps: 2,
      src: 'Lecture slides 51–52',
      notes: [
        'Slide 51 → C: hexokinase has the lower K<sub>m</sub> and higher affinity. E is the classic trap (affinity falls as K<sub>m</sub> rises).',
        'Slide 52 → C: at V<sub>max</sub> nearly all active sites are saturated. A is wrong — substrate is in excess (cluster D on slide 40); D would raise V<sub>max</sub>.',
      ],
      visual: lc5Viz,
    },
    // 28
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { big: '6', title: 'IUBMB classes', body: 'OTHLIL — named by the reaction.', viz: sumEC, tip: { title: 'OTHLIL', body: 'Oxidoreductases · Transferases · Hydrolases · Lyases · Isomerases · Ligases.', src: SRC(6) } },
        { big: '5', title: 'Specificity types', body: 'Reaction · stereo · group · bond · absolute.', viz: sumSpec, tip: { title: 'Specificity', body: 'Reaction, stereo (optical), group, bond and absolute.', src: SRC(17) } },
        { big: '½', title: 'V<sub>max</sub> at K<sub>m</sub>', body: 'Low K<sub>m</sub> = high affinity.', viz: sumKm, tip: { title: 'K<sub>m</sub>', body: 'K<sub>m</sub> = [S] at ½V<sub>max</sub>; unchanged by [E]; low K<sub>m</sub> means high affinity (hexokinase vs glucokinase).', src: SRC('42–44') } },
        { big: '1/V<sub>max</sub>', title: 'LB y-intercept', body: 'x-intercept = −1/K<sub>m</sub>.', viz: sumLB, tip: { title: 'Lineweaver–Burk', body: 'y-intercept 1/V<sub>max</sub> · x-intercept −1/K<sub>m</sub> · slope K<sub>m</sub>/V<sub>max</sub>.', src: SRC(46) } },
      ],
      notes: 'Recap the four numbers: 6 classes, 5 specificity types, ½V<sub>max</sub> at K<sub>m</sub>, LB intercepts. Then open the question bank.',
    },
  ],
};
