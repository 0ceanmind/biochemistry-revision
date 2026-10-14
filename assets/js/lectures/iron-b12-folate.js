// Iron, Vitamin B12 & Folic Acid (L.53–L.55, Dr Vijaya Marakala) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { chart } from '../viz/chart.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, matte, glowSprite, kitController, cylinderBetween } from '../viz/three-kit.js';
import { loadMol, buildMolecule, ELEMENT } from '../viz/molecule.js';
import { loadPDB, buildProtein } from '../viz/protein.js';
import { rbcScene, rbcMesh } from '../viz/scenes.js';

const gsap = window.gsap;

/* Colour language for this deck (theme-aware CSS vars) */
const FE2 = 'var(--act)';     // ferrous iron
const FE3 = 'var(--prot)';    // ferric iron
const HEME = 'var(--o2)';     // heme
const TF = 'var(--a2)';       // transferrin
const FOL = 'var(--atp)';     // folate
const B12 = 'var(--elec)';    // vitamin B12
const IFC = 'var(--fadh)';    // intrinsic factor
const TC2 = 'var(--act)';     // transcobalamin II
const ONE = 'var(--a1)';      // one-carbon unit
const CAPS = 'font-weight:700;letter-spacing:.14em;text-transform:uppercase';
const SRC = (p) => `Lecture slide${/[–,\s]/.test(String(p)) ? 's' : ''} ${p}`;
const TBK = '<br><span style="color:var(--fg-3)">Textbook detail — not on the lecture slides.</span>';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */
let _uid = 0;
const uid = (p = 'ib') => `${p}${++_uid}`;

function grad(D, horizontal = false) {
  const id = uid('gr');
  D.defs.append(s('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: horizontal ? 0 : 0.6 }, [
    s('stop', { offset: '0', style: 'stop-color:var(--a1)' }),
    s('stop', { offset: '1', style: 'stop-color:var(--a2)' }),
  ]));
  return `url(#${id})`;
}

/** D.text with an explicit pixel size. */
function txt(D, x, y, str, size, style = '', o = {}) {
  return D.text(x, y, str, { anchor: o.anchor, tip: o.tip, layer: o.layer, style: `font-size:${size}px;${style}` });
}

function hidePath(D, d) {
  const p = s('path', { d, style: 'fill:none;stroke:none' });
  D.layers.fx.append(p);
  return p;
}

function pentPath(r) {
  let d = '';
  for (let k = 0; k < 5; k++) {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    d += `${k ? 'L' : 'M'}${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Arbitrary SVG tokens (groups) that travel along a path — like D.flow but any shape. */
function tokenFlow(D, path, o = {}) {
  const el = path.path || path;
  const count = o.count ?? 3, speed = o.speed ?? 150, phase = o.phase ?? 0;
  const toks = Array.from({ length: count }, () => {
    const g = o.make();
    g.style.display = 'none';
    (o.layer || D.layers.fx).append(g);
    return g;
  });
  let total = el.getTotalLength();
  const t0 = performance.now();
  let raf = 0, running = false;
  const place = (now) => {
    const dist = ((now - t0) / 1000) * speed + phase * total;
    toks.forEach((g, i) => {
      const d = (dist + (i * total) / count) % total;
      const p = el.getPointAtLength(d);
      g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      const f = d / total;
      g.style.opacity = o.fade === false ? 1 : Math.min(1, Math.min(f, 1 - f) * (o.fadeK ?? 8));
      o.onPlace?.(g, f, p);
    });
  };
  const loop = (now) => { place(now); raf = requestAnimationFrame(loop); };
  const ctl = {
    toks,
    play() { if (running) return; running = true; total = el.getTotalLength(); toks.forEach((g) => (g.style.display = '')); raf = requestAnimationFrame(loop); },
    pause() { running = false; cancelAnimationFrame(raf); },
    hide() { ctl.pause(); toks.forEach((g) => (g.style.display = 'none')); },
    destroy() { ctl.pause(); toks.forEach((g) => g.remove()); },
  };
  return ctl;
}

/** Set of flows: run(list) plays the listed ones and hides the rest. */
function flowBank() {
  const all = new Set();
  return {
    add(f) { all.add(f); return f; },
    run(on) { all.forEach((f) => (on.includes(f) ? f.play() : f.hide())); },
    playAll() { all.forEach((f) => f.play()); },
    pause() { all.forEach((f) => f.pause()); },
    destroy() { all.forEach((f) => f.destroy()); },
  };
}

/** Token factories (each returns a fresh SVG group). */
const TOK = {
  dot: (col, r = 10) => () => { const g = s('g'); g.append(s('circle', { r, style: `fill:${col};stroke:var(--bg);stroke-width:2` })); return g; },
  heme: () => {
    const g = s('g');
    g.append(s('rect', { x: -12, y: -12, width: 24, height: 24, rx: 6, style: `fill:${HEME};stroke:var(--bg);stroke-width:2` }));
    g.append(s('circle', { r: 4.5, style: `fill:${FE2}` }));
    return g;
  },
  pent: (col = FOL, r = 14) => () => { const g = s('g'); g.append(s('path', { d: pentPath(r), style: `fill:${col};stroke:var(--bg);stroke-width:2;stroke-linejoin:round` })); return g; },
  b12: (r = 10) => () => {
    const g = s('g');
    g.append(s('circle', { r, style: `fill:${B12};stroke:var(--bg);stroke-width:2` }));
    g.append(s('circle', { r: r * 0.36, style: 'fill:#ff6ea8' }));
    return g;
  },
  cpx: () => {
    const g = s('g');
    g.append(s('path', { d: 'M2,-17 A17,17 0 1,0 2,17 A20,20 0 0,1 2,-17 Z', style: `fill:${IFC};stroke:var(--bg);stroke-width:1.5` }));
    const b = TOK.b12(9)(); b.setAttribute('transform', 'translate(5 0)'); g.append(b);
    return g;
  },
  ifc: () => { const g = s('g'); g.append(s('path', { d: 'M2,-17 A17,17 0 1,0 2,17 A20,20 0 0,1 2,-17 Z', style: `fill:${IFC};stroke:var(--bg);stroke-width:1.5` })); return g; },
  tc: () => {
    const g = s('g');
    g.append(s('ellipse', { cx: -6, cy: 3, rx: 19, ry: 13, style: `fill:${TC2};stroke:var(--bg);stroke-width:1.5` }));
    const b = TOK.b12(9)(); b.setAttribute('transform', 'translate(8 -4)'); g.append(b);
    return g;
  },
  chip: (text, col, w = 70, fs = 21) => () => {
    const g = s('g');
    g.append(s('rect', { x: -w / 2, y: -18, width: w, height: 36, rx: 18, style: `fill:color-mix(in oklab, ${col} 24%, var(--bg));stroke:${col};stroke-width:2` }));
    const t = s('text', { y: 7.5, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${fs}px;font-weight:700;fill:${col}` });
    setRich(t, text);
    g.append(t);
    return g;
  },
};

/** diagram() promoted to its own compositing layer: avoids stale-tile repaint glitches while flows animate. */
function dg(host, w, h) {
  const D = diagram(host, w, h);
  D.svg.style.willChange = 'opacity';
  return D;
}

/* ---------- 3D helpers ---------- */
/** Ball-and-stick from explicit positions. atoms: [{el, p, r?, color?, emissive?}], bonds: [[i, j, order]] */
function ballStick(atoms, bonds, o = {}) {
  const g = new THREE.Group();
  const cache = new Map();
  const m = (c, e = 0) => { const k = `${c}|${e}`; if (!cache.has(k)) cache.set(k, glossy(c, e ? { emissive: e, emissiveIntensity: 0.55 } : {})); return cache.get(k); };
  const geo = new THREE.SphereGeometry(1, 28, 20);
  const colOf = (a) => a.color ?? (ELEMENT[a.el]?.color ?? 0xff2d55);
  atoms.forEach((a) => {
    const mesh = new THREE.Mesh(geo, m(colOf(a), a.emissive || 0));
    mesh.scale.setScalar(a.r ?? (ELEMENT[a.el]?.r ?? 0.4) * (o.scale ?? 1));
    mesh.position.copy(a.p);
    g.add(mesh);
    a.mesh = mesh;
  });
  const br = o.bond ?? 0.11;
  bonds.forEach(([i, j, ord = 1]) => {
    const pa = atoms[i].p, pb = atoms[j].p;
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const offs = [];
    if (ord >= 2) {
      const dir = pb.clone().sub(pa).normalize();
      let perp = new THREE.Vector3(0, 1, 0).cross(dir);
      if (perp.lengthSq() < 1e-3) perp = new THREE.Vector3(1, 0, 0).cross(dir);
      perp.normalize().multiplyScalar(br * 1.6);
      if (ord === 2) offs.push(perp.clone(), perp.clone().negate());
      else offs.push(new THREE.Vector3(), perp.clone().multiplyScalar(1.3), perp.clone().multiplyScalar(-1.3));
    } else offs.push(new THREE.Vector3());
    const r = ord > 1 ? br * 0.62 : br;
    offs.forEach((off) => {
      g.add(cylinderBetween(pa.clone().add(off), mid.clone().add(off), r, m(colOf(atoms[i]))));
      g.add(cylinderBetween(mid.clone().add(off), pb.clone().add(off), r, m(colOf(atoms[j]))));
    });
  });
  return g;
}

/** Quaternion that lays a molecule's long (principal) axis along +x; refPoint ends up on −x. */
function principalQuat(points, refPoint) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const c = new THREE.Vector3();
  points.forEach((p) => c.add(p));
  c.multiplyScalar(1 / points.length);
  points.forEach((p) => {
    const v = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += v[i] * v[j];
  });
  const v = new THREE.Vector3(1, 0.2, 0.1).normalize();
  for (let k = 0; k < 80; k++) {
    v.set(C[0][0] * v.x + C[0][1] * v.y + C[0][2] * v.z, C[1][0] * v.x + C[1][1] * v.y + C[1][2] * v.z, C[2][0] * v.x + C[2][1] * v.y + C[2][2] * v.z).normalize();
  }
  const q = new THREE.Quaternion().setFromUnitVectors(v, new THREE.Vector3(1, 0, 0));
  if (refPoint && refPoint.clone().applyQuaternion(q).x > 0) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  return q;
}
/** Extra roll about x so that `vec` (after q) points at the camera, tilted up by alpha. */
function faceQuat(q, vec, alpha = 0.35) {
  const f = vec.clone().applyQuaternion(q);
  const psi = Math.atan2(f.y, f.z);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), psi - alpha).multiply(q);
}
const adjacency = (data) => {
  const nb = data.atoms.map(() => []);
  data.bonds.forEach(([a, b]) => { nb[a].push(b); nb[b].push(a); });
  return nb;
};

/* ------------------------------------------------------------------ */
/* Slide visuals                                                        */
/* ------------------------------------------------------------------ */

// 1 · Hero: real hemoglobin with four glowing heme irons
async function heroViz(el) {
  const kit = createScene(el, { cam: [0, 0, 90], autoRotate: 0.9, fov: 30 });
  const pdb = await loadPDB('4HHB');
  const cols = [0xff7a45, 0xa970ff, 0xff9a6b, 0x8c5cf0];
  const prot = buildProtein(pdb, { colorBy: (ci) => cols[ci % 4], hets: ['HEM'], hetScale: 1.15 });
  kit.root.add(prot);
  const glows = [];
  prot.userData.hetGroups.forEach((g) => {
    const het = pdb.het.find((x) => x.name === 'HEM' && x.chain === g.userData.chain);
    const fi = het.atoms.findIndex((a) => a[0] === 'Fe');
    const sp = glowSprite(0xffa040, 14);
    sp.material.depthTest = false;
    sp.renderOrder = 10;
    sp.position.copy(g.children[fi].position);
    g.add(sp);
    glows.push(sp);
  });
  kit.fit(prot, 1.28);
  kit.onFrame((dt, t) => glows.forEach((g, i) => g.scale.setScalar(13 + 3.5 * Math.sin(t * 2 + i * 1.6))));
  el.append(h('div', { style: 'position:absolute;left:0;bottom:0;font-size:22px;color:var(--fg-3);pointer-events:none', html: 'Hemoglobin · 4 heme irons · PDB 4HHB' }));
  return kitController(kit);
}

// Section dividers: element-style tile, orbiting forms, SLO chips
function dividerViz(el, o) {
  const D = dg(el, 1500, 360);
  const g1 = grad(D);
  const bid = uid('bl');
  D.defs.append(s('filter', { id: bid, x: '-100%', y: '-100%', width: '300%', height: '300%' }, [s('feGaussianBlur', { stdDeviation: 46 })]));
  const cx = 750, cy = 118, W = 200, H = 210;
  D.layers.regions.append(s('ellipse', { cx, cy, rx: 230, ry: 120, style: 'fill:var(--a1);opacity:.22', filter: `url(#${bid})` }));
  D.layers.edges.append(s('ellipse', { cx, cy, rx: 330, ry: 108, style: 'fill:none;stroke:var(--line-2);stroke-width:2;stroke-dasharray:3 12' }));
  const op = hidePath(D, `M${cx - 330},${cy} A330,108 0 1,1 ${cx + 330},${cy} A330,108 0 1,1 ${cx - 330},${cy}`);
  const outer = s('g', { transform: `translate(${cx} ${cy})` });
  const inner = s('g');
  inner.append(s('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 34, style: `fill:var(--bg-2);stroke:${g1};stroke-width:4` }));
  const num = s('text', { x: -W / 2 + 24, y: -H / 2 + 44, class: 'v-label', style: 'font-size:28px;fill:var(--fg-2);font-weight:600' });
  num.textContent = o.num;
  const sym = s('text', { x: o.symDx || 0, y: o.symY ?? 36, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${o.symSize || 112}px;font-weight:720;letter-spacing:-.03em;fill:${g1}` });
  setRich(sym, o.sym);
  const nm = s('text', { x: 0, y: H / 2 - 22, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:25px;fill:var(--fg-2);font-weight:560' });
  nm.textContent = o.name;
  inner.append(num, sym, nm);
  outer.append(inner);
  D.layers.nodes.append(outer);
  const flows = flowBank();
  o.orbit.forEach((c, i) => flows.add(tokenFlow(D, op, {
    count: 1, speed: 110, phase: i / o.orbit.length, fade: false, layer: D.layers.labels,
    make: TOK.chip(c.t, c.col, c.w || 84, 22),
    onPlace: (g, f, p) => { g.style.opacity = 0.5 + 0.5 * ((p.y - (cy - 108)) / 216); },
  })));
  const n = o.chips.length, gap = o.gap || 1500 / n;
  o.chips.forEach((c, i) => D.badge(cx + (i - (n - 1) / 2) * gap, 326, c.t, { color: 'var(--a1)', size: o.chipSize || 24, tip: c.tip }));
  let tw = null;
  return {
    enter() { flows.playAll(); tw?.kill(); tw = gsap.to(inner, { y: -8, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }); },
    leave() { flows.pause(); tw?.kill(); },
    destroy() { flows.destroy(); tw?.kill(); D.destroy(); },
  };
}

// 4 · Body iron, compounds, RDA
function bodyIronViz(el) {
  const D = dg(el, 960, 860);
  const g1 = grad(D, true);
  txt(D, 480, 172, '3–4 g', 176, `font-weight:760;letter-spacing:-.05em;fill:${g1}`, { anchor: 'middle' });
  txt(D, 480, 282, 'total body iron · adult', 30, 'fill:var(--fg-2)', { anchor: 'middle' });
  const s1 = [];
  const col = (x, title, color, items) => {
    s1.push(txt(D, x, 352, title, 24, `fill:${color};${CAPS}`, { anchor: 'middle' }));
    items.forEach((it, i) => s1.push(D.node({ x, y: 412 + i * 74, label: it.t, kind: 'mol', color, size: 28, w: 330, tip: it.tip }).g));
  };
  col(245, 'Heme iron', HEME, [
    { t: 'Hemoglobin', tip: { kicker: 'Heme iron', title: 'Hemoglobin', body: 'Heme-containing O₂ carrier of red cells.', src: SRC(3) } },
    { t: 'Myoglobin', tip: { kicker: 'Heme iron', title: 'Myoglobin', body: 'Heme protein storing O₂ in muscle.', src: SRC(3) } },
    { t: 'Cytochromes', tip: { kicker: 'Heme iron', title: 'Cytochromes', body: 'Heme proteins of electron transport.', src: SRC(3) } },
  ]);
  col(715, 'Non-heme iron', FE2, [
    { t: 'Fe-S proteins', tip: { kicker: 'Non-heme iron', title: 'Iron–sulphur proteins', body: 'Iron bound to sulphur clusters, not heme.', src: SRC(3) } },
    { t: 'Transferrin', tip: { kicker: 'Non-heme iron', title: 'Transferrin', body: 'Plasma transport protein for Fe³⁺.', src: SRC('3, 5') } },
    { t: 'Ferritin', tip: { kicker: 'Non-heme iron', title: 'Ferritin', body: 'Storage protein — holds up to ~4500 Fe³⁺.', src: SRC('3, 5') } },
  ]);
  // RDA scale
  const s2 = [];
  const x0 = 240, x1 = 900, sx = (v) => x0 + (v / 40) * (x1 - x0);
  s2.push(txt(D, 0, 668, 'Recommended dietary allowance', 24, `fill:var(--ink);${CAPS}`));
  const bars = [];
  [['Adult', 10, 20, 720, '10–20 mg/day'], ['Pregnancy', 0, 40, 796, '40 mg/day']].forEach(([lbl, a, b, y, val], i) => {
    s2.push(txt(D, 0, y + 10, lbl, 30, 'font-weight:600;fill:var(--fg)'));
    const track = s('rect', { x: x0, y: y - 20, width: x1 - x0, height: 40, rx: 20, style: 'fill:var(--surface-2)' });
    const bar = s('rect', { x: sx(a), y: y - 20, width: 0, height: 40, rx: 20, style: `fill:${g1}` });
    D.layers.edges.append(track, bar);
    s2.push(track, bar);
    const v = i === 0 ? txt(D, sx(b) + 18, y + 10, val, 30, 'font-weight:700;fill:var(--ink)') : txt(D, sx(b) - 20, y + 10, val, 28, 'font-weight:720;fill:var(--bg)', { anchor: 'end' });
    s2.push(v);
    bars.push({ bar, w: sx(b) - sx(a) });
  });
  [0, 10, 20, 30, 40].forEach((v) => s2.push(txt(D, sx(v), 852, String(v), 22, 'fill:var(--fg-3)', { anchor: 'middle' })));
  [...s1, ...s2].forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      show(s1, n >= 1);
      show(s2, n >= 2);
      bars.forEach((b, i) => gsap.to(b.bar, { attr: { width: n >= 2 ? b.w : 0 }, duration: 1.1, delay: n >= 2 ? 0.2 + i * 0.25 : 0, ease: 'power3.out' }));
    },
    destroy: () => D.destroy(),
  };
}

// 5 · Mini absorption animation for the source cards
function sourceMini(el, kind) {
  const D = dg(el, 560, 228);
  D.svg.style.height = '250px';
  D.layers.regions.append(s('rect', { x: 300, y: 8, width: 24, height: 184, rx: 12, style: 'fill:var(--surface-3)' }));
  txt(D, 16, 30, 'gut lumen', 20, 'fill:var(--fg-3)');
  txt(D, 544, 30, 'mucosal cell', 20, 'fill:var(--fg-3)', { anchor: 'end' });
  const fl = flowBank();
  if (kind === 'heme') {
    [72, 118, 164].forEach((y, i) => fl.add(tokenFlow(D, hidePath(D, `M30,${y} L530,${y}`), { count: 2, speed: 120, phase: i * 0.21, make: TOK.heme })));
    txt(D, 544, 204, 'most cross', 20, `fill:${HEME};font-weight:650`, { anchor: 'end' });
  } else {
    fl.add(tokenFlow(D, hidePath(D, 'M30,58 L530,58'), { count: 2, speed: 120, make: TOK.dot(FE3, 9) }));
    [[104, 0.3], [156, 0.62]].forEach(([y, ph]) => {
      fl.add(tokenFlow(D, hidePath(D, `M30,${y} L196,${y}`), { count: 2, speed: 70, phase: ph, fadeK: 3, make: TOK.dot(FE3, 9) }));
      D.layers.nodes.append(s('path', { d: `M222,${y - 20} l17,10 v20 l-17,10 l-17,-10 v-20 Z`, style: 'fill:none;stroke:var(--fg-3);stroke-width:3;stroke-linejoin:round' }));
    });
    txt(D, 222, 204, 'phytate · oxalate', 20, 'fill:var(--fg-2);font-weight:600', { anchor: 'middle' });
  }
  fl.playAll();
  return { destroy: () => { fl.destroy(); D.destroy(); } };
}

// 6 · Factors that raise / lower absorption, with a schematic gauge
function factorsViz(el) {
  const D = dg(el, 1712, 720);
  const INC = [
    { t: 'Ferrous form', s: 'Fe²⁺ · taken up by DMT-1', tip: { kicker: 'Increases absorption', title: 'Ferrous form (Fe²⁺)', body: 'Only ferrous iron crosses the brush border on DMT-1.', src: SRC('4–5') } },
    { t: 'Ascorbic acid', s: 'vitamin C · Fe³⁺ → Fe²⁺', tip: { kicker: 'Increases absorption', title: 'Ascorbic acid (vitamin C)', body: 'Reduces ferric Fe³⁺ to ferrous Fe²⁺ in the lumen.', src: SRC('4–5') } },
    { t: 'Cysteine', s: 'reducing amino acid', tip: { kicker: 'Increases absorption', title: 'Cysteine', body: 'Listed on the slide. Its thiol group is reducing and helps keep iron as Fe²⁺.' + TBK, src: SRC(4) } },
    { t: 'HCl', s: 'gastric acid', tip: { kicker: 'Increases absorption', title: 'Gastric HCl', body: 'Acid keeps iron soluble and favours the ferrous form — so achlorhydria lowers absorption.', src: SRC(4) } },
  ];
  const DEC = [
    { t: 'Phytates & phosphate', s: 'bind iron · insoluble', tip: { kicker: 'Decreases absorption', title: 'Phytates and phosphate', body: 'Form insoluble complexes with non-heme iron (cereals, pulses).', src: SRC('3–4') } },
    { t: 'Oxalates', s: 'leafy plant foods', tip: { kicker: 'Decreases absorption', title: 'Oxalates', body: 'Slide 3: plant iron is “less absorbed because of phytates and oxalates”.', src: SRC(3) } },
    { t: 'Antacids · achlorhydria', s: 'no gastric acid', tip: { kicker: 'Decreases absorption', title: 'Antacids, achlorhydria', body: 'Without acid less Fe³⁺ is reduced and kept soluble.', src: SRC(4) } },
    { t: 'GI diseases', s: 'absorbing surface lost', tip: { kicker: 'Decreases absorption', title: 'Gastrointestinal diseases', body: 'Mucosal disease reduces the surface that absorbs iron.', src: SRC(4) } },
  ];
  const W = 500, Hc = 104;
  const state = new Set();
  const chips = [];
  const mkChip = (x, y, f, col, sign, key) => {
    const g = s('g', { transform: `translate(${x} ${y})`, style: 'cursor:pointer', 'data-tip': JSON.stringify(f.tip) });
    const r = s('rect', { x: 0, y: -Hc / 2, width: W, height: Hc, rx: 32, style: `fill:color-mix(in oklab, ${col} 7%, transparent);stroke:color-mix(in oklab, ${col} 38%, transparent);stroke-width:2;transition:fill .35s, stroke .35s` });
    const c = s('circle', { cx: 52, cy: 0, r: 26, style: `fill:color-mix(in oklab, ${col} 20%, transparent);stroke:${col};stroke-width:2;transition:fill .35s` });
    const sg = s('text', { x: 52, y: 12, 'text-anchor': 'middle', class: 'v-label', style: `font-size:36px;font-weight:700;fill:${col}` });
    sg.textContent = sign;
    const t1 = s('text', { x: 100, y: -4, class: 'v-label', style: 'font-size:31px;font-weight:650' });
    t1.textContent = f.t;
    const t2 = s('text', { x: 100, y: 30, class: 'v-label', style: 'font-size:23px;fill:var(--fg-2);font-weight:500' });
    setRich(t2, f.s);
    g.append(r, c, sg, t1, t2);
    D.layers.nodes.append(g);
    g.addEventListener('click', () => { state.has(key) ? state.delete(key) : state.add(key); paint(); });
    chips.push({ key, r, c, col, sign });
  };
  txt(D, 24, 86, '+ Increase absorption', 26, `fill:var(--act);${CAPS}`);
  txt(D, 1196, 86, '− Decrease absorption', 26, `fill:var(--inh);${CAPS}`);
  INC.forEach((f, i) => mkChip(20, 190 + i * 128, f, 'var(--act)', '+', `i${i}`));
  DEC.forEach((f, i) => mkChip(1192, 190 + i * 128, f, 'var(--inh)', '−', `d${i}`));
  // gauge
  const cx = 856, cy = 470, R = 250;
  const gid = uid('gg');
  D.defs.append(s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 0 }, [
    s('stop', { offset: '0', style: 'stop-color:var(--inh)' }), s('stop', { offset: '.5', style: 'stop-color:var(--atp)' }), s('stop', { offset: '1', style: 'stop-color:var(--act)' }),
  ]));
  D.layers.edges.append(s('path', { d: `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`, style: 'fill:none;stroke:var(--surface-2);stroke-width:40;stroke-linecap:round' }));
  D.layers.edges.append(s('path', { d: `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`, style: `fill:none;stroke:url(#${gid});stroke-width:26;stroke-linecap:round;opacity:.9` }));
  txt(D, cx, 170, 'Non-heme iron absorption', 24, `fill:var(--fg-2);${CAPS}`, { anchor: 'middle' });
  txt(D, cx - R, cy + 56, 'less', 26, 'fill:var(--inh);font-weight:650', { anchor: 'middle' });
  txt(D, cx + R, cy + 56, 'more', 26, 'fill:var(--act);font-weight:650', { anchor: 'middle' });
  const needle = s('line', { x1: cx, y1: cy, x2: cx, y2: cy - 210, style: 'stroke:var(--fg);stroke-width:9;stroke-linecap:round' });
  D.layers.labels.append(needle, s('circle', { cx, cy, r: 20, style: 'fill:var(--fg)' }));
  const read = txt(D, cx, cy + 120, 'Baseline', 44, 'font-weight:720;fill:var(--fg)', { anchor: 'middle' });
  txt(D, cx, cy + 166, 'click any factor · gauge schematic', 23, 'fill:var(--fg-3)', { anchor: 'middle' });
  const nv = { v: 0.5 };
  const setNeedle = () => {
    const th = Math.PI * (1 - nv.v);
    needle.setAttribute('x2', cx + 210 * Math.cos(th));
    needle.setAttribute('y2', cy - 210 * Math.sin(th));
  };
  setNeedle();
  function paint() {
    let v = 0.5;
    chips.forEach((c) => {
      const on = state.has(c.key);
      c.r.style.fill = `color-mix(in oklab, ${c.col} ${on ? 24 : 7}%, transparent)`;
      c.r.style.stroke = on ? c.col : `color-mix(in oklab, ${c.col} 38%, transparent)`;
      c.c.style.fill = on ? `color-mix(in oklab, ${c.col} 55%, transparent)` : `color-mix(in oklab, ${c.col} 20%, transparent)`;
      if (on) v += c.sign === '+' ? 0.11 : -0.11;
    });
    gsap.to(nv, { v, duration: 0.9, ease: 'elastic.out(1, .6)', onUpdate: setNeedle });
    read.textContent = v > 0.52 ? 'Increased' : v < 0.48 ? 'Decreased' : 'Baseline';
    read.style.fill = v > 0.52 ? 'var(--act)' : v < 0.48 ? 'var(--inh)' : 'var(--fg)';
  }
  return {
    step(n) {
      state.clear();
      if (n === 1) INC.forEach((_, i) => state.add(`i${i}`));
      if (n >= 2) DEC.forEach((_, i) => state.add(`d${i}`));
      paint();
    },
    destroy: () => D.destroy(),
  };
}

// 7 · Iron absorption showpiece: lumen → enterocyte → blood
function absorptionViz(el) {
  const D = dg(el, 1712, 720);
  D.region({ x: 0, y: 40, w: 400, h: 670, r: 36, label: 'SI lumen', fill: 'color-mix(in oklab, var(--atp) 6%, transparent)' });
  D.region({ x: 430, y: 40, w: 720, h: 670, r: 36, label: 'Small-intestinal mucosal cell', fill: 'color-mix(in oklab, var(--prot) 7%, transparent)' });
  D.region({ x: 1180, y: 40, w: 532, h: 670, r: 36, label: 'Blood', fill: 'color-mix(in oklab, var(--inh) 8%, transparent)' });
  // brush-border microvilli
  let mv = '';
  for (let y = 112; y < 690; y += 24) if (Math.abs(y - 240) > 64 && Math.abs(y - 520) > 64) mv += `M430,${y} q-22,2 -22,8 q0,6 22,8 `;
  D.layers.regions.append(s('path', { d: mv, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:1.5' }));
  const channel = (x, y, col, label, ly, tipSpec) => {
    const g = s('g', { 'data-tip': JSON.stringify(tipSpec) });
    const st = `fill:color-mix(in oklab, ${col} 40%, var(--bg));stroke:${col};stroke-width:2.5`;
    g.append(s('rect', { x: x - 28, y: y - 54, width: 25, height: 108, rx: 12.5, style: st }), s('rect', { x: x + 3, y: y - 54, width: 25, height: 108, rx: 12.5, style: st }));
    const t = s('text', { x, y: ly, 'text-anchor': 'middle', class: 'v-label', style: `font-size:28px;font-weight:720;fill:${col}` });
    t.textContent = label;
    g.append(t);
    D.layers.nodes.append(g);
    return g;
  };
  // static lumen contents
  const lum = s('g');
  [[60, 196], [120, 262], [170, 210], [88, 300], [190, 290]].forEach(([x, y]) => lum.append(s('circle', { cx: x, cy: y, r: 10, style: `fill:${FE3};opacity:.75` })));
  [[70, 500], [140, 560], [190, 490], [100, 620]].forEach(([x, y]) => { const t = TOK.heme(); t.setAttribute('transform', `translate(${x} ${y})`); t.style.opacity = 0.75; lum.append(t); });
  D.layers.nodes.append(lum);
  txt(D, 30, 150, 'Non-heme Fe³⁺', 25, `fill:${FE3};font-weight:680`);
  txt(D, 30, 456, 'Heme iron', 25, `fill:${HEME};font-weight:680`);
  const fl = flowBank();
  const P = (d) => hidePath(D, d);
  // Step 1: Fe3+ → Fe2+ (vit C) → DMT-1
  const s1 = [];
  const vitc = D.badge(262, 192, 'Vit C', { color: 'var(--atp)', size: 26, tip: { kicker: 'Reduction', title: 'Vitamin C reduces Fe³⁺ → Fe²⁺', body: 'Only ferrous Fe²⁺ can use DMT-1.<br><span style="color:var(--fg-3)">Textbook: a brush-border ferrireductase (duodenal cytochrome b, Dcytb) performs this reduction, helped by vitamin C.</span>', src: SRC(5) } });
  const vArr = D.arrow({ from: [244, 214], to: [244, 230], color: 'var(--atp)', width: 3, headSize: 10 });
  const dmt = channel(430, 240, FE2, 'DMT-1', 168, { kicker: 'Apical transporter', title: 'DMT-1', body: 'Divalent metal transporter 1 — carries <b>ferrous Fe²⁺</b> into the mucosal cell.', src: SRC(5) });
  const pool = s('g');
  [[660, 300], [690, 280], [700, 318], [668, 330], [720, 296], [640, 316]].forEach(([x, y]) => pool.append(s('circle', { cx: x, cy: y, r: 10, style: `fill:${FE2}` })));
  D.layers.nodes.append(pool);
  const lPool = txt(D, 680, 250, 'Fe²⁺', 28, `fill:${FE2};font-weight:720`, { anchor: 'middle' });
  const lFe2a = txt(D, 356, 222, 'Fe²⁺', 25, `fill:${FE2};font-weight:700`, { anchor: 'middle' });
  s1.push(vitc, vArr.g, dmt, pool, lPool, lFe2a);
  const f1a = fl.add(tokenFlow(D, P('M40,240 L232,240'), { count: 3, speed: 110, make: TOK.dot(FE3, 10) }));
  const f1b = fl.add(tokenFlow(D, P('M262,240 L480,240 C560,240 600,270 652,296'), { count: 3, speed: 120, make: TOK.dot(FE2, 10) }));
  // Step 2: heme via HCP
  const s2 = [];
  const hcp = channel(430, 520, HEME, 'HCP', 612, { kicker: 'Apical transporter', title: 'HCP · heme carrier protein', body: 'Heme crosses intact; <b>Fe²⁺ is released</b> from heme inside the cell.<br><span style="color:var(--fg-3)">Textbook: heme oxygenase frees the iron.</span>', src: SRC(5) });
  const lRel = txt(D, 636, 470, 'Fe²⁺ released', 23, `fill:${FE2};font-weight:650`);
  s2.push(hcp, lRel);
  const f2a = fl.add(tokenFlow(D, P('M40,520 L560,520'), { count: 4, speed: 120, make: TOK.heme }));
  const f2b = fl.add(tokenFlow(D, P('M566,516 C600,470 630,390 662,334'), { count: 2, speed: 90, make: TOK.dot(FE2, 9) }));
  // Step 3: ferritin store
  const s3 = [];
  const fer = s('g', { transform: 'translate(850 545)', 'data-tip': JSON.stringify({ kicker: 'Storage in the cell', title: 'Ferritin', body: 'Protein shell storing iron as <b>Fe³⁺</b> — up to <b>4500</b> atoms per ferritin.', src: SRC(5) }) });
  fer.append(s('circle', { r: 80, style: 'fill:color-mix(in oklab, var(--atp) 10%, transparent);stroke:var(--atp);stroke-width:9;stroke-dasharray:22 7' }));
  fer.append(s('circle', { r: 50, style: `fill:color-mix(in oklab, ${FE3} 30%, transparent)` }));
  for (let i = 0; i < 18; i++) { const a = i * 2.39996, rr = 9.6 * Math.sqrt(i + 0.5); fer.append(s('circle', { cx: Math.cos(a) * rr, cy: Math.sin(a) * rr, r: 6, style: `fill:${FE3}` })); }
  D.layers.nodes.append(fer);
  const lFer = txt(D, 850, 660, 'Ferritin', 30, 'font-weight:720;fill:var(--atp)', { anchor: 'middle' });
  const lFerN = txt(D, 850, 694, '', 24, 'fill:var(--fg-2);font-weight:560', { anchor: 'middle' });
  s3.push(fer, lFer, lFerN);
  const f3 = fl.add(tokenFlow(D, P('M700,334 C730,390 770,430 800,470'), { count: 2, speed: 80, make: TOK.dot(FE2, 9) }));
  // Step 4: ferroportin export
  const s4 = [];
  const fpn = channel(1150, 300, 'var(--fadh)', 'Ferroportin', 226, { kicker: 'Basolateral exporter', title: 'Ferroportin', body: 'Exports <b>Fe²⁺</b> from the mucosal cell into blood.<br><span style="color:var(--fg-3)">Textbook: hepcidin (from the liver) degrades ferroportin — the main regulator of iron absorption.</span>', src: SRC(5) });
  const lFe2b = txt(D, 1236, 270, 'Fe²⁺', 25, `fill:${FE2};font-weight:700`, { anchor: 'middle' });
  s4.push(fpn, lFe2b);
  const f4 = fl.add(tokenFlow(D, P('M724,300 L1300,300'), { count: 5, speed: 150, make: TOK.dot(FE2, 10) }));
  // Step 5: ceruloplasmin, transferrin
  const s5 = [];
  const cp = D.node({ x: 1370, y: 170, label: 'Ceruloplasmin', kind: 'enz', color: 'var(--nadh)', size: 26, tip: { kicker: 'Ferroxidase', title: 'Ceruloplasmin', body: 'Copper-containing plasma protein that oxidises <b>Fe²⁺ → Fe³⁺</b> so iron can bind transferrin.<br><span style="color:var(--fg-3)">Textbook: hephaestin does the same job at the enterocyte membrane.</span>', src: SRC(5) } });
  const cpA = D.arrow({ from: [1370, 196], to: [1370, 280], color: 'var(--nadh)', width: 3, headSize: 12 });
  const lFe3 = txt(D, 1498, 268, 'Fe³⁺', 25, `fill:${FE3};font-weight:700`, { anchor: 'middle' });
  const tfG = s('g', { transform: 'translate(1490 520)', 'data-tip': JSON.stringify({ kicker: 'Plasma transport', title: 'Transferrin', body: 'Carries <b>Fe³⁺</b> in blood to the tissues (and to stores).', src: SRC(5) }) });
  tfG.append(s('ellipse', { cx: -38, cy: 0, rx: 52, ry: 40, style: `fill:color-mix(in oklab, ${TF} 26%, transparent);stroke:${TF};stroke-width:3` }));
  tfG.append(s('ellipse', { cx: 38, cy: 0, rx: 52, ry: 40, style: `fill:color-mix(in oklab, ${TF} 26%, transparent);stroke:${TF};stroke-width:3` }));
  tfG.append(s('circle', { cx: -38, cy: 0, r: 11, style: `fill:${FE3}` }), s('circle', { cx: 38, cy: 0, r: 11, style: `fill:${FE3}` }));
  D.layers.nodes.append(tfG);
  const lTf = txt(D, 1490, 604, 'Transferrin · Fe³⁺', 28, `font-weight:720;fill:${TF}`, { anchor: 'middle' });
  const lTis = txt(D, 1690, 690, 'to tissues', 24, 'fill:var(--fg-2);font-weight:600', { anchor: 'end' });
  s5.push(cp.g, cpA.g, lFe3, tfG, lTf, lTis);
  const f5a = fl.add(tokenFlow(D, P('M1380,300 C1460,300 1490,380 1490,470'), { count: 3, speed: 110, make: TOK.dot(FE3, 10) }));
  const f5b = fl.add(tokenFlow(D, P('M1590,530 C1630,560 1660,600 1684,640'), { count: 2, speed: 70, fadeK: 4, make: () => { const g = s('g'); g.append(s('ellipse', { rx: 18, ry: 13, style: `fill:${TF};stroke:var(--bg);stroke-width:2` }), s('circle', { r: 5, style: `fill:${FE3}` })); return g; } }));
  const groups = [s1, s2, s3, s4, s5];
  groups.flat().forEach((e) => (e.style.opacity = 0));
  let cur = 0, counted = false;
  const apply = (n) => {
    cur = n;
    groups.forEach((g, i) => show(g, n >= i + 1, { duration: 0.6 }));
    gsap.to(lum, { opacity: n >= 1 ? 0.45 : 1, duration: 0.6 });
    const on = [];
    if (n >= 1) on.push(f1a, f1b);
    if (n >= 2) on.push(f2a, f2b);
    if (n >= 3) on.push(f3);
    if (n >= 4) on.push(f4);
    if (n >= 5) on.push(f5a, f5b);
    fl.run(on);
    if (n >= 3 && !counted) { counted = true; const o = { v: 0 }; gsap.to(o, { v: 4500, duration: 1.6, ease: 'power3.out', onUpdate: () => { lFerN.textContent = `stores up to ${Math.round(o.v)} Fe³⁺`; } }); }
    if (n < 3) { counted = false; lFerN.textContent = ''; }
  };
  return { step: apply, enter: () => {}, leave: () => fl.pause(), destroy: () => { fl.destroy(); D.destroy(); } };
}

// 8 · Storage sites/forms + "one-way element" dot matrix
function storeLossViz(el) {
  const D = dg(el, 960, 860);
  const g1 = grad(D, true);
  txt(D, 0, 30, 'Storage sites', 24, `fill:var(--ink);${CAPS}`);
  [['Liver', 92], ['Intestine', 318], ['Spleen', 548], ['Bone marrow', 800]].forEach(([t, x]) => D.node({ x, y: 88, label: t, kind: 'mol', size: 27, tip: { kicker: 'Storage site', title: t, body: 'Iron is stored in liver, intestine, spleen and bone marrow.', src: SRC(6) } }));
  D.arrow({ from: [480, 128], to: [480, 182], width: 4, color: 'var(--fg-3)' });
  D.node({ x: 235, y: 252, label: 'Ferritin', sub: 'soluble · up to 4500 Fe³⁺', kind: 'box', w: 440, h: 110, size: 34, color: 'var(--atp)', tip: { kicker: 'Storage form', title: 'Ferritin', body: 'Protein shell holding iron as Fe³⁺ — up to ~4500 atoms.<br><span style="color:var(--fg-3)">Textbook: soluble and quickly mobilised; serum ferritin reflects stores.</span>', src: SRC('5–6') } });
  D.node({ x: 725, y: 252, label: 'Hemosiderin', sub: 'insoluble · slow release', kind: 'box', w: 440, h: 110, size: 34, color: HEME, tip: { kicker: 'Storage form', title: 'Hemosiderin', body: 'The second storage form named on slide 6.<br><span style="color:var(--fg-3)">Textbook: insoluble aggregates of partly degraded ferritin; released slowly. Rises in iron overload (hemosiderosis).</span>', src: SRC(6) } });
  txt(D, 0, 392, '1 dot = 1 mg iron lost', 24, `fill:var(--ink);${CAPS}`);
  const COLS = 50, ROWS = 15, px = 960 / COLS, py = 21;
  const dots = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = s('circle', { cx: px / 2 + c * px, cy: 452 + r * py, r: 6.4, style: 'fill:var(--surface-3)' });
    D.layers.nodes.append(d);
    dots.push(d);
  }
  const big = txt(D, 0, 820, '', 64, `font-weight:760;letter-spacing:-.03em;fill:${g1}`);
  const r1 = txt(D, 960, 800, '', 27, 'fill:var(--fg);font-weight:600', { anchor: 'end' });
  const r2 = txt(D, 960, 838, '', 25, 'fill:var(--fg-2)', { anchor: 'end' });
  const STATES = [
    { n: 1, solid: 1, big: '~1 mg/day', a: 'very little iron is excreted', b: 'stool ≈ 0.7 mg/day' },
    { n: 30, solid: 20, big: '20–30 mg', a: 'per menstrual cycle', b: '≈ 20–30 days of basal loss' },
    { n: 750, solid: 750, big: '750 mg', a: 'per delivery', b: '≈ 2 years of basal loss' },
  ];
  let curN = -1;
  const prog = { v: 0 };
  const sg = seg({ options: [{ v: 0, t: 'Daily' }, { v: 1, t: 'Menstrual cycle' }, { v: 2, t: 'Delivery' }], value: 0, onChange: (v) => apply(v) });
  ctrlBar(el, [sg], { right: 0, top: 330 });
  function apply(k) {
    if (k === curN) return;
    curN = k;
    sg.set(k, false);
    const st = STATES[k];
    gsap.killTweensOf(prog);
    dots.forEach((d) => { d.style.fill = 'var(--surface-3)'; });
    prog.v = 0;
    let lit = 0;
    const soft = `color-mix(in oklab, ${FE3} 45%, transparent)`;
    gsap.to(prog, { v: st.n, duration: Math.min(1.4, 0.3 + st.n / 600), ease: 'power1.inOut', onUpdate: () => { const to = Math.round(prog.v); for (; lit < to; lit++) dots[lit].style.fill = lit < st.solid ? FE3 : soft; } });
    gsap.fromTo([big, r1, r2], { opacity: 0 }, { opacity: 1, duration: 0.5 });
    big.textContent = st.big;
    r1.textContent = st.a;
    r2.textContent = st.b;
  }
  return { step: (n) => apply(Math.min(2, n)), destroy: () => { gsap.killTweensOf(prog); D.destroy(); } };
}

// 9 · Iron deficiency: normal vs microcytic hypochromic red cell (3D)
function rbcIronViz(el) {
  const sc = rbcScene(el, { count: 1, autoRotate: 0, scene: { cam: [0, 7, 30], autoRotate: 0 } });
  const kit = sc.kit;
  const ref = sc.cell;
  ref.position.x = -4.6;
  const def = rbcMesh();
  def.rotation.x = 0.35;
  def.position.x = 4.6;
  kit.root.add(def);
  kit.onFrame((dt) => { def.rotation.z += dt * 0.12; });
  kit.label('Normal', [-4.6, 3.9, 0], { cls: 'acc' });
  const lbl = kit.label('Iron deficiency?', [4.6, 3.9, 0], { cls: '' });
  const baseCol = def.material.color.clone();
  const pale = new THREE.Color(0xf2b3b8);
  const st = { t: 0 };
  const paint = () => {
    def.scale.setScalar(1 - 0.36 * st.t);
    def.material.color.copy(baseCol).lerp(pale, st.t * 0.9);
    def.material.emissive.setHex(0x1a0002).lerp(new THREE.Color(0x3a1a1c), st.t);
  };
  const set = (on) => {
    gsap.to(st, { t: on ? 1 : 0, duration: 1.4, ease: 'power2.inOut', onUpdate: paint });
    lbl.element.innerHTML = on ? 'Small · pale' : 'Iron deficiency?';
    lbl.element.style.color = on ? 'var(--inh)' : '';
  };
  const sg = seg({ options: [{ v: false, t: 'Both normal' }, { v: true, t: 'Iron deficiency' }], value: false, onChange: set });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  el.append(h('div', { style: 'position:absolute;right:0;top:0;font-size:22px;color:var(--fg-3);pointer-events:none', html: 'microcytic = small · hypochromic = pale' }));
  return { ...sc, step: (n) => sg.set(n >= 1) };
}

// 10 · Iron overload: hemosiderosis → hemochromatosis → bronze diabetes → treatment
function overloadViz(el) {
  const D = dg(el, 960, 860);
  const base = 'fill:var(--surface);stroke:var(--line-2);stroke-width:3;transition:fill .9s';
  const skin = s('path', { d: 'M300,180 C365,180 395,192 440,204 C480,214 492,255 482,330 C468,430 432,520 426,600 C424,660 446,720 452,840 L148,840 C154,720 176,660 174,600 C168,520 132,430 118,330 C108,255 120,214 160,204 C205,192 235,180 300,180 Z', style: base });
  const neck = s('rect', { x: 272, y: 150, width: 56, height: 44, rx: 14, style: base });
  const head = s('circle', { cx: 300, cy: 104, r: 62, style: base });
  D.layers.regions.append(neck, skin, head);
  const ORG = {
    heart: { d: 'M325,345 C290,322 268,300 278,280 C288,260 313,262 325,282 C337,262 362,260 372,280 C382,300 360,322 325,345 Z', l: [325, 250, 'Heart'] },
    liver: { d: 'M150,430 C165,392 290,382 340,402 C356,410 350,436 322,452 C272,478 196,498 166,480 C150,470 144,450 150,430 Z', l: [214, 516, 'Liver'] },
    spleen: { d: 'M382,446 a30,46 0 1,0 60,0 a30,46 0 1,0 -60,0', l: [412, 384, 'Spleen'] },
    pancreas: { d: 'M232,560 C252,542 322,545 352,544 C380,542 410,536 416,548 C420,560 398,570 366,572 C320,576 268,584 244,580 C230,576 226,568 232,560 Z', l: [324, 618, 'Pancreas'] },
  };
  const org = {};
  Object.entries(ORG).forEach(([k, o]) => {
    const p = s('path', { d: o.d, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2.5;transition:fill .7s, stroke .7s' });
    D.layers.edges.append(p);
    org[k] = p;
    txt(D, o.l[0], o.l[1], o.l[2], 22, 'fill:var(--fg-2);font-weight:600', { anchor: 'middle' });
  });
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const dotsIn = (k, n) => {
    const p = org[k], bb = p.getBBox(), out = [];
    let tries = 0;
    while (out.length < n && tries++ < 5000) {
      const x = bb.x + rnd() * bb.width, y = bb.y + rnd() * bb.height;
      if (p.isPointInFill(new DOMPoint(x, y))) out.push(s('circle', { cx: x, cy: y, r: 4.6, style: `fill:${FE3}` }));
    }
    out.forEach((d) => D.layers.nodes.append(d));
    return out;
  };
  const dSid = [...dotsIn('liver', 20), ...dotsIn('spleen', 12)];
  const dChr = [...dotsIn('liver', 46), ...dotsIn('pancreas', 22), ...dotsIn('heart', 22)];
  // right panel
  const X = 780;
  const tTitle = txt(D, 600, 86, '', 44, 'font-weight:720;fill:var(--fg);letter-spacing:-.02em');
  const tSub1 = txt(D, 600, 132, '', 26, 'fill:var(--fg-2)');
  const tSub2 = txt(D, 600, 166, '', 26, 'fill:var(--fg-2)');
  const hfe = D.badge(X, 224, 'Hereditary · AR · HFE gene', { color: TF, size: 23, w: 350, tip: { kicker: 'Hereditary hemochromatosis', title: 'Autosomal recessive · HFE gene', body: 'Mutations in the <b>HFE</b> gene; inherited as autosomal recessive.', src: SRC(9) } });
  const t1 = D.node({ x: X, y: 320, label: 'Hyperpigmentation', kind: 'box', w: 350, h: 74, size: 28, color: FE3 });
  const plus = txt(D, X, 384, '+', 36, 'font-weight:700;fill:var(--fg-2)', { anchor: 'middle' });
  const t2 = D.node({ x: X, y: 440, label: 'Hyperglycemia', kind: 'box', w: 350, h: 74, size: 28, color: 'var(--elec)' });
  const eqA = D.arrow({ from: [X, 486], to: [X, 532], width: 4, color: 'var(--fg-3)' });
  const t3 = D.node({ x: X, y: 585, label: 'Bronze diabetes', kind: 'box', w: 350, h: 86, size: 34, color: 'var(--prot)', tip: { kicker: 'Hereditary hemochromatosis', title: 'Bronze diabetes', body: 'Hyperpigmentation (skin) + hyperglycemia (pancreas). Iron also damages <b>liver, pancreas and heart</b>.', src: SRC(9) } });
  const c1 = D.arrow({ d: 'M462,300 C520,300 560,320 602,320', from: [462, 300], to: [602, 320], color: FE3, width: 3, dash: '6 8', head: false });
  const c2 = D.arrow({ d: 'M420,552 C500,540 540,460 602,444', from: [420, 552], to: [602, 444], color: 'var(--elec)', width: 3, dash: '6 8', head: false });
  const rx1 = D.badge(X, 712, '✓ Phlebotomy', { color: 'var(--act)', size: 26, w: 300 });
  const rx2 = D.badge(X, 774, '✓ Iron chelators', { color: 'var(--act)', size: 26, w: 300 });
  const eq = [t1.g, plus, t2.g, eqA.g, t3.g, c1.g, c2.g];
  [hfe, ...eq, rx1, rx2, ...dChr].forEach((e) => (e.style.opacity = 0));
  const TXT = [
    ['Hemosiderosis', '↑ iron stores as hemosiderin', 'no tissue injury'],
    ['Hemochromatosis', 'iron deposited in tissues', 'with tissue injury'],
    ['Bronze diabetes', 'skin and pancreas hit', 'liver · pancreas · heart'],
    ['Treatment', 'remove the excess iron', ''],
  ];
  return {
    step(n) {
      const k = Math.min(3, n);
      [tTitle, tSub1, tSub2].forEach((t, i) => { t.textContent = TXT[k][i]; });
      gsap.fromTo([tTitle, tSub1, tSub2], { opacity: 0.2 }, { opacity: 1, duration: 0.5 });
      tTitle.style.fill = k === 1 ? 'var(--inh)' : k === 2 ? 'var(--prot)' : k === 3 ? 'var(--act)' : 'var(--fg)';
      const inj = n >= 1 && n < 3;
      ['heart', 'liver', 'pancreas'].forEach((o) => {
        org[o].style.fill = inj ? 'color-mix(in oklab, var(--inh) 24%, transparent)' : n >= 3 ? 'color-mix(in oklab, var(--inh) 10%, transparent)' : 'var(--surface-2)';
        org[o].style.stroke = inj ? 'var(--inh)' : 'var(--line-2)';
      });
      const bronze = n >= 2 ? 'color-mix(in oklab, #b0743a 42%, var(--surface))' : 'var(--surface)';
      [skin, neck, head].forEach((p) => { p.style.fill = bronze; });
      gsap.killTweensOf([...dSid, ...dChr]);
      gsap.to(dSid, { opacity: n >= 3 ? 0.12 : 1, duration: 0.8 });
      gsap.to(dChr, { opacity: n >= 3 ? 0.08 : n >= 1 ? 1 : 0, duration: 0.8, stagger: n === 1 ? 0.008 : 0 });
      show(hfe, n >= 1);
      show(eq, n >= 2);
      show([rx1, rx2], n >= 3, { stagger: 0.15 });
    },
    destroy: () => D.destroy(),
  };
}

// 11 · Iron panel interpreter + transferrin-saturation calculator
function labsViz(el) {
  const D = dg(el, 1712, 720);
  const X0 = 330, X1 = 960;
  const ROWS = [
    { k: 'fe', name: 'Serum iron', unit: 'µg/dL', min: 0, max: 300, lo: 60, hi: 180, tip: { kicker: 'Ref ≈ 60–180 µg/dL (11–32 µmol/L)', title: 'Serum iron', body: '<b>↑</b> hemochromatosis, hemolysis, sideroblastic anemia, iron poisoning, multiple transfusions, liver disease.<br><b>↓</b> iron deficiency, chronic inflammation, infection, pregnancy.<br><span style="color:var(--fg-3)">Slide 10 prints “11–32 µmol/dL”; the correct unit is µmol/L (≈ 60–180 µg/dL).</span>', src: SRC('10–11') } },
    { k: 'tibc', name: 'TIBC', unit: 'µg/dL', min: 100, max: 600, lo: 250, hi: 450, tip: { kicker: 'Ref 250–450 µg/dL', title: 'Total iron-binding capacity', body: 'Measures the blood’s capacity to bind and transport iron.<br><b>↑</b> iron deficiency, pregnancy.<br><b>↓</b> chronic disease, malnutrition, liver disease, nephrotic syndrome, iron overload.', src: SRC('10–11') } },
    { k: 'ts', name: 'Transferrin sat.', unit: '%', min: 0, max: 100, lo: 20, hi: 50, tip: { kicker: 'Ref 20–50 %', title: 'Transferrin saturation', body: 'How much serum iron is bound to transferrin, as a percentage.<br><b>↑</b> iron overload, hemolysis, sideroblastic anemia.<br><b>↓</b> iron deficiency, chronic disease, inflammation.', src: SRC('10–11') } },
    { k: 'fer', name: 'Serum ferritin', unit: 'µg/L · log scale', min: 1, max: 5000, lo: 24, hi: 336, log: true, tip: { kicker: 'Ref 24–336 µg/L', title: 'Serum ferritin', body: '<b>↓</b> iron deficiency — the <b>most specific</b> marker of depleted iron stores.<br><b>↑</b> iron overload, inflammation, infection, liver disease, malignancy.', src: SRC('10–11') } },
  ];
  const rows = ROWS.map((r, i) => {
    const y = 178 + i * 142;
    const sx = (v) => {
      if (r.log) return X0 + ((Math.log10(Math.max(r.min, v)) - Math.log10(r.min)) / (Math.log10(r.max) - Math.log10(r.min))) * (X1 - X0);
      return X0 + ((Math.min(r.max, Math.max(r.min, v)) - r.min) / (r.max - r.min)) * (X1 - X0);
    };
    txt(D, 0, y + 4, r.name, 32, 'font-weight:660;fill:var(--fg)', { tip: r.tip });
    txt(D, 0, y + 38, r.unit, 22, 'fill:var(--fg-3)');
    D.layers.edges.append(s('rect', { x: X0, y: y - 7, width: X1 - X0, height: 14, rx: 7, style: 'fill:var(--surface-3)' }));
    D.layers.edges.append(s('rect', { x: sx(r.lo), y: y - 16, width: sx(r.hi) - sx(r.lo), height: 32, rx: 16, style: 'fill:color-mix(in oklab, var(--act) 20%, transparent);stroke:color-mix(in oklab, var(--act) 55%, transparent);stroke-width:2' }));
    txt(D, sx(r.lo), y + 48, String(r.lo), 22, 'fill:var(--fg-3)', { anchor: 'middle' });
    txt(D, sx(r.hi), y + 48, String(r.hi), 22, 'fill:var(--fg-3)', { anchor: 'middle' });
    const mk = s('g');
    const dot = s('circle', { r: 17, style: 'fill:var(--fg);stroke:var(--bg);stroke-width:4' });
    const val = s('text', { y: -30, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:720' });
    mk.append(dot, val);
    D.layers.labels.append(mk);
    const arrow = txt(D, 1026, y + 21, '', 60, 'font-weight:760', { anchor: 'middle' });
    return { r, y, sx, mk, dot, val, arrow, v: r.lo };
  });
  // calculator card
  D.region({ x: 1080, y: 0, w: 632, h: 720, r: 40, fill: 'var(--surface)' });
  txt(D, 1124, 66, 'Transferrin saturation', 25, `fill:var(--ink);${CAPS}`);
  txt(D, 1124, 120, '= serum iron ÷ TIBC × 100', 32, 'font-weight:600;fill:var(--fg)');
  const bigTS = txt(D, 1396, 316, '', 176, 'font-weight:760;letter-spacing:-.05em;fill:var(--fg)', { anchor: 'middle' });
  const clsTS = txt(D, 1396, 380, '', 31, 'font-weight:650', { anchor: 'middle' });
  const calc = txt(D, 1396, 432, '', 27, 'fill:var(--fg-2)', { anchor: 'middle' });
  const PRE = [
    { fe: 110, tibc: 330, fer: 100 },
    { fe: 35, tibc: 470, fer: 8 },
    { fe: 210, tibc: 225, fer: 1500 },
  ];
  let fer = 100;
  const st = { fe: 110, tibc: 330 };
  const status = (r, v) => (v < r.lo ? -1 : v > r.hi ? 1 : 0);
  const COL = { '-1': 'var(--elec)', 0: 'var(--act)', 1: 'var(--prot)' };
  const placeRow = (row, v) => {
    row.v = v;
    row.mk.setAttribute('transform', `translate(${row.sx(v)} ${row.y})`);
    row.val.textContent = row.r.k === 'ts' ? `${Math.round(v)} %` : String(Math.round(v));
    const k = status(row.r, v);
    row.dot.style.fill = COL[k];
    row.arrow.textContent = k < 0 ? '↓' : k > 0 ? '↑' : '✓';
    row.arrow.style.fill = COL[k];
  };
  const tsOf = (fe, tibc) => Math.min(100, (fe / tibc) * 100);
  const update = (dur) => {
    const target = { fe: st.fe, tibc: st.tibc, ts: tsOf(st.fe, st.tibc), fer };
    rows.forEach((row) => {
      const o = { v: row.v };
      gsap.killTweensOf(row);
      gsap.to(o, { v: target[row.r.k], duration: dur, ease: 'power3.out', onUpdate: () => placeRow(row, o.v) });
    });
    const ts = target.ts;
    const k = ts < 20 ? -1 : ts > 50 ? 1 : 0;
    const o = { v: parseFloat(bigTS.textContent) || 0 };
    gsap.to(o, { v: ts, duration: dur, ease: 'power3.out', onUpdate: () => { bigTS.textContent = `${Math.round(o.v)}%`; } });
    bigTS.style.fill = COL[k];
    clsTS.textContent = k < 0 ? '↓ low · normal 20–50 %' : k > 0 ? '↑ high · normal 20–50 %' : 'normal · 20–50 %';
    clsTS.style.fill = COL[k];
    calc.textContent = `${st.fe} ÷ ${st.tibc} × 100 = ${ts.toFixed(0)} %`;
  };
  const sFe = slider({ label: 'Serum iron', min: 20, max: 300, step: 5, value: st.fe, width: 180, fmt: (v) => `${v} µg/dL`, onInput: (v) => { st.fe = v; sg.set(null, false); update(0.25); } });
  const sTi = slider({ label: 'TIBC', min: 150, max: 600, step: 5, value: st.tibc, width: 180, fmt: (v) => `${v} µg/dL`, onInput: (v) => { st.tibc = v; sg.set(null, false); update(0.25); } });
  const box = h('div.ctrls', { style: 'left:1108px;top:556px;width:576px;flex-direction:column;align-items:stretch;gap:14px' }, [sFe.el, sTi.el]);
  [sFe, sTi].forEach((c) => { c.el.querySelector('label').style.minWidth = '150px'; c.el.querySelector('output').style.whiteSpace = 'nowrap'; });
  el.append(box);
  const preset = (k) => { if (k === null) return; const p = PRE[k]; st.fe = p.fe; st.tibc = p.tibc; fer = p.fer; sFe.set(p.fe, false); sTi.set(p.tibc, false); update(0.9); };
  const sg = seg({ options: [{ v: 0, t: 'Normal' }, { v: 1, t: 'Iron deficiency' }, { v: 2, t: 'Iron overload' }], value: 0, onChange: preset });
  ctrlBar(el, [sg], { left: 0, top: 0 });
  rows.forEach((row) => placeRow(row, row.r.lo));
  return { step: (n) => sg.set(Math.min(2, n)), destroy: () => D.destroy() };
}

// 13 · Folic acid structure — real 3D, three parts lit in turn
async function folateStructViz(el) {
  const kit = createScene(el, { cam: [0, 0, 30], autoRotate: 0, fov: 30 });
  const data = await loadMol('folic');
  const nb = adjacency(data);
  const withH = (list) => { const set = new Set(list); list.forEach((i) => nb[i].forEach((j) => { if (data.atoms[j][0] === 'H') set.add(j); })); return set; };
  const PARTS = [
    { set: withH([5, 8, 9, 10, 11, 12, 20, 26, 27, 28, 29, 30, 31]), col: 0x5b8cff, name: 'Pteridine', css: '#5b8cff' },
    { set: withH([1, 7, 16, 17, 19, 21, 22, 23, 24]), col: 0xff9f0a, name: 'PABA', css: '#ff9f0a' },
    { set: withH([0, 2, 3, 4, 6, 13, 14, 15, 18, 25]), col: 0x30d158, name: 'Glutamate', css: '#30d158' },
  ];
  const holder = new THREE.Group();
  kit.root.add(holder);
  let q = null, mol = null, shown = -1;
  const labels = [];
  const build = (n) => {
    const m = buildMolecule(data, { hideH: 'nonpolar', color: (a, i) => { for (let k = 0; k < n; k++) if (PARTS[k].set.has(i)) return PARTS[k].col; return undefined; } });
    if (!q) {
      const pts = m.userData.pos.filter((_, i) => !m.userData.hidden.has(i));
      q = principalQuat(pts, m.userData.pos[31]);
    }
    m.quaternion.copy(q);
    if (mol) { holder.remove(mol); mol.traverse((c) => { if (c.geometry?.type === 'CylinderGeometry') c.geometry.dispose(); }); }
    holder.add(m);
    mol = m;
    return m;
  };
  build(0);
  // part labels (static, above the spinning molecule)
  const P = mol.userData.pos.map((p) => p.clone().applyQuaternion(q));
  const rMax = Math.max(...P.map((p, i) => (mol.userData.hidden.has(i) ? 0 : Math.hypot(p.y, p.z))));
  PARTS.forEach((pt, k) => {
    const heavy = [...pt.set].filter((i) => data.atoms[i][0] !== 'H');
    const x = heavy.reduce((a, i) => a + P[i].x, 0) / heavy.length;
    const l = kit.label(`<span style="color:${pt.css}">●</span> ${pt.name}`, [x, (k === 1 ? -1 : 1) * (rMax + 1.1), 0], { cls: '' });
    l.element.style.opacity = 0;
    labels.push(l);
  });
  kit.fit(holder, 1.12);
  kit.onFrame((dt) => { holder.rotation.x += dt * 0.45; });
  el.append(h('div', { style: 'position:absolute;left:0;bottom:0;font-size:22px;color:var(--fg-3);pointer-events:none', html: 'Folic acid · real 3D structure (PubChem)' }));
  return kitController(kit, {
    step(n) {
      const k = Math.min(3, n);
      if (k !== shown) { shown = k; build(k); }
      labels.forEach((l, i) => { l.element.style.opacity = i < k ? 1 : 0; });
    },
  });
}

// 14 · Folate: plate → jejunum → blood (β-globulins) → liver
function folateJourneyViz(el) {
  const D = dg(el, 960, 860);
  const LX = 120;
  const Y = [90, 300, 510, 715];
  D.layers.edges.append(s('path', { d: `M${LX},${Y[0]} L${LX},${Y[3]}`, style: 'stroke:var(--line-2);stroke-width:5;stroke-linecap:round;stroke-dasharray:2 14' }));
  const glyph = (y, col, paint) => {
    const g = s('g', { transform: `translate(${LX} ${y})` });
    g.append(s('circle', { r: 58, style: `fill:color-mix(in oklab, ${col} 16%, var(--bg));stroke:${col};stroke-width:3` }));
    paint(g);
    D.layers.nodes.append(g);
    return g;
  };
  const st = (col) => `fill:none;stroke:${col};stroke-width:4;stroke-linecap:round;stroke-linejoin:round`;
  const gs = [
    glyph(Y[0], 'var(--act)', (g) => g.append(s('path', { d: 'M-22,22 C-22,-12 2,-30 28,-28 C30,4 8,24 -22,22 Z M-22,22 L8,-6', style: st('var(--act)') }))),
    glyph(Y[1], 'var(--prot)', (g) => g.append(s('path', { d: 'M-30,24 L-30,0 a8,8 0 0 1 16,0 L-14,24 M-8,24 L-8,-10 a8,8 0 0 1 16,0 L8,24 M14,24 L14,2 a8,8 0 0 1 16,0 L30,24 M-36,26 L36,26', style: st('var(--prot)') }))),
    glyph(Y[2], 'var(--inh)', (g) => g.append(s('path', { d: 'M0,-30 C12,-14 22,-2 22,10 a22,22 0 0 1 -44,0 C-22,-2 -12,-14 0,-30 Z', style: st('var(--inh)') }))),
    glyph(Y[3], HEME, (g) => g.append(s('path', { d: 'M-32,-6 C-26,-24 14,-28 32,-18 C38,-12 30,6 16,14 C0,24 -22,26 -30,16 C-36,10 -36,2 -32,-6 Z', style: st(HEME) }))),
  ];
  const tx = 220;
  const stages = [];
  const stage = (i, title, sub, extra = []) => {
    const t = txt(D, tx, Y[i] - 6, title, 38, 'font-weight:700;fill:var(--fg);letter-spacing:-.015em');
    const u = txt(D, tx, Y[i] + 34, sub, 27, 'fill:var(--fg-2)');
    stages.push([gs[i], t, u, ...extra]);
  };
  const chips = [['Green leafy veg', 300], ['Pulses', 505], ['Eggs', 625], ['Liver', 735]].map(([t, x]) => D.badge(x, Y[0] + 88, t, { color: FOL, size: 24, tip: { kicker: 'Folate source', title: t === 'Green leafy veg' ? 'Green leafy vegetables' : t, body: 'Listed dietary source of folic acid.', src: SRC(13) } }));
  stage(0, 'Diet · RDA 400 µg/day', 'folate (vitamin B₉) sources:', chips);
  stage(1, 'Upper jejunum', 'main site of absorption');
  const carrier = s('g', { transform: `translate(640 ${Y[2] - 16})` });
  carrier.append(s('ellipse', { rx: 46, ry: 30, style: 'fill:color-mix(in oklab, var(--elec) 30%, transparent);stroke:var(--elec);stroke-width:2.5' }));
  const pc = TOK.pent(FOL, 15)(); pc.setAttribute('transform', 'translate(10 -10)'); carrier.append(pc);
  D.layers.nodes.append(carrier);
  stage(2, 'Blood', 'carried by β-globulins', [carrier]);
  stage(3, 'Liver', '→ active coenzyme forms (THF)');
  const warn = D.badge(470, 822, '⚠ Limited [no] storage → rapid deficiency', { color: 'var(--inh)', size: 26, w: 600, tip: { kicker: 'Storage', title: 'Limited stores', body: 'The slide says “Limited [No] tissue storage; deficiency can develop rapidly” — unlike B₁₂, whose liver stores last years.<br><span style="color:var(--fg-3)">Textbook: the liver holds only a few months’ supply of folate.</span>', src: SRC(14) } });
  stages.flat().forEach((e) => (e.style.opacity = 0));
  warn.style.opacity = 0;
  const fl = flowBank();
  const f1 = fl.add(tokenFlow(D, hidePath(D, `M${LX},${Y[0] + 60} L${LX},${Y[1] - 60}`), { count: 2, speed: 90, make: TOK.pent(FOL, 14) }));
  const f2 = fl.add(tokenFlow(D, hidePath(D, `M${LX},${Y[1] + 60} L${LX},${Y[2] - 60}`), { count: 2, speed: 90, make: TOK.pent(FOL, 14) }));
  const f3 = fl.add(tokenFlow(D, hidePath(D, `M${LX},${Y[2] + 60} L${LX},${Y[3] - 60}`), { count: 2, speed: 90, make: () => { const g = s('g'); g.append(s('ellipse', { rx: 22, ry: 15, style: 'fill:color-mix(in oklab, var(--elec) 50%, var(--bg));stroke:var(--elec);stroke-width:2' })); const p = TOK.pent(FOL, 11)(); p.setAttribute('transform', 'translate(6 -6)'); g.append(p); return g; } }));
  let cur = 0;
  const apply = (n) => {
    cur = n;
    stages.forEach((g, i) => show(g, n >= Math.max(0, i - (i >= 2 ? 1 : 0)), { duration: 0.6, stagger: 0.05 }));
    show(warn, n >= 3);
    const on = [f1];
    if (n >= 1) on.push(f2);
    if (n >= 2) on.push(f3);
    fl.run(on);
  };
  return { step: apply, enter: () => {}, leave: () => fl.pause(), destroy: () => { fl.destroy(); D.destroy(); } };
}

// 15 · DHFR: folic acid → DHF → THF, methotrexate toggle
function dhfrViz(el) {
  const D = dg(el, 1712, 720);
  const Y = 270;
  D.node({ id: 'diet', x: 70, y: Y, label: 'Diet', kind: 'box', w: 130, size: 28 });
  D.node({ id: 'fa', x: 330, y: Y, label: 'Folic acid', kind: 'mol', color: FOL, size: 30 });
  D.node({ id: 'dhf', x: 800, y: Y, label: 'Dihydrofolate', sub: 'DHF', kind: 'mol', color: FOL, size: 30 });
  D.node({ id: 'thf', x: 1300, y: Y, label: 'Tetrahydrofolate', sub: 'THF · active coenzyme', kind: 'mol', color: 'var(--a1)', size: 32, tip: { kicker: 'Active form', title: 'Tetrahydrofolate (THF)', body: 'The coenzyme form of folic acid — carries one-carbon units.', src: SRC(15) } });
  const a0 = D.arrow({ from: 'diet', to: 'fa', width: 4 });
  const a1 = D.arrow({ from: 'fa', to: 'dhf', width: 5, color: FOL });
  const a2 = D.arrow({ from: 'dhf', to: 'thf', width: 5, color: FOL });
  const mids = [(442 + 663) / 2 + 6, (937 + 1135) / 2];
  const dhfrTip = { kicker: 'Both reductions', title: 'Dihydrofolate reductase (DHFR)', body: 'Reduces folic acid → DHF → THF, using <b>NADPH + H⁺</b> each time.', src: SRC(15) };
  mids.forEach((m) => {
    D.arrow({ d: `M${m - 62},${Y - 26} C${m - 40},${Y - 92} ${m + 40},${Y - 92} ${m + 62},${Y - 26}`, from: [m - 62, Y - 26], to: [m + 62, Y - 26], color: 'var(--nadh)', width: 3, headSize: 12 });
    D.badge(m - 92, Y - 116, 'NADPH + H⁺', { color: 'var(--nadh)', size: 22 });
    D.badge(m + 88, Y - 116, 'NADP⁺', { color: 'var(--nadh)', size: 22 });
    D.node({ x: m, y: Y + 82, label: 'Dihydrofolate reductase', kind: 'enz', color: FOL, size: 21, tip: dhfrTip });
  });
  // functions of THF
  const FN = [
    ['One-carbon metabolism', 'THF carries single-carbon units (next slides).'],
    ['Cell division', 'THF is required for cell division (DNA synthesis).'],
    ['↓ Plasma homocysteine', 'N⁵-methyl-THF remethylates homocysteine → methionine.'],
  ];
  const outs = FN.map(([t, b], i) => D.node({ x: 1300, y: 420 + i * 92, label: t, kind: 'box', w: 380, h: 70, size: 27, color: 'var(--a1)', tip: { kicker: 'Function of THF', title: t, body: b, src: SRC(15) } }));
  const aOut = D.arrow({ from: [1300, 320], to: [1300, 378], width: 4, color: 'var(--a1)' });
  // methotrexate
  const mtx = D.node({ x: 640, y: 492, label: 'Methotrexate', sub: 'folic acid analogue', kind: 'box', w: 330, h: 104, size: 34, color: 'var(--inh)', tip: { kicker: 'Competitive inhibitor', title: 'Methotrexate', body: 'Folic acid analogue that <b>competitively inhibits DHFR</b> at both steps. Used for psoriasis, rheumatoid arthritis and neoplastic diseases.', src: SRC(15) } });
  const i1 = D.arrow({ from: [560, 438], to: [mids[0], Y + 106], color: 'var(--inh)', width: 4, dash: '8 8', kind: 'inh', headSize: 22 });
  const i2 = D.arrow({ from: [720, 438], to: [mids[1], Y + 106], color: 'var(--inh)', width: 4, dash: '8 8', kind: 'inh', headSize: 22 });
  const uses = ['Psoriasis', 'Rheumatoid arthritis', 'Neoplastic diseases'].map((t, i) => D.badge([320, 585, 910][i], 596, t, { color: 'var(--inh)', size: 24 }));
  const xMark = (x) => { const g = s('g', { transform: `translate(${x} ${Y})`, style: 'opacity:0' }); g.append(s('circle', { r: 26, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:5' }), s('path', { d: 'M-12,-12 L12,12 M12,-12 L-12,12', style: 'stroke:var(--inh);stroke-width:6;stroke-linecap:round' })); D.layers.labels.append(g); return g; };
  const xs = mids.map(xMark);
  const fl = flowBank();
  const fA = fl.add(D.flow(a0, { count: 2, color: FOL, speed: 100, r: 9, autoplay: false }));
  const fB = fl.add(D.flow(a1, { count: 2, color: FOL, speed: 110, r: 10, autoplay: false }));
  const fC = fl.add(D.flow(a2, { count: 2, color: FOL, speed: 110, r: 10, autoplay: false }));
  const fD = fl.add(D.flow(aOut, { count: 1, color: 'var(--a1)', speed: 60, r: 9, autoplay: false }));
  const mtxEls = [i1.g, i2.g, ...uses];
  mtxEls.forEach((e) => (e.style.opacity = 0));
  let on = false;
  const set = (v) => {
    on = v;
    show(mtxEls, v);
    gsap.to(mtx.g, { opacity: v ? 1 : 0.35, duration: 0.5 });
    gsap.to(xs, { opacity: v ? 1 : 0, duration: 0.4 });
    gsap.to([a1.g, a2.g, D.nodes.dhf.g, D.nodes.thf.g, aOut.g, ...outs.map((o) => o.g)], { opacity: v ? 0.3 : 1, duration: 0.5 });
    fl.run(v ? [fA] : [fA, fB, fC, fD]);
  };
  const tg = toggle({ label: 'Methotrexate', danger: true, onChange: set });
  ctrlBar(el, [tg], { left: 0, bottom: 0 });
  return { step: (n) => tg.set(n >= 1), leave: () => fl.pause(), enter: () => set(on), destroy: () => { fl.destroy(); D.destroy(); } };
}

// 16 · Methotrexate vs folic acid — real 3D side by side
async function mtxMimicViz(el) {
  const kit = createScene(el, { cam: [0, 0, 34], autoRotate: 0, fov: 30 });
  const [fd, md] = await Promise.all([loadMol('folic'), loadMol('methotrexate')]);
  const mk = (data, ref, face, hl, hlCol, y) => {
    const nb = adjacency(data);
    const set = new Set(hl);
    hl.forEach((i) => nb[i].forEach((j) => { if (data.atoms[j][0] === 'H') set.add(j); }));
    const m = buildMolecule(data, { hideH: 'nonpolar', highlight: { atoms: [...set], color: hlCol } });
    const pts = m.userData.pos.filter((_, i) => !m.userData.hidden.has(i));
    let q = principalQuat(pts, m.userData.pos[ref]);
    q = faceQuat(q, m.userData.pos[face], 0.55);
    m.quaternion.copy(q);
    const holder = new THREE.Group();
    holder.position.y = y;
    holder.add(m);
    kit.root.add(holder);
    return { m, holder, nb, pos: m.userData.pos };
  };
  const F = mk(fd, 31, 30, [5, 7], 0xffd60a, 4.6);
  const M = mk(md, 32, 31, [11, 26], 0xffd60a, -4.6);
  const dirLabel = (o, atom, _from, text, cls, world) => {
    const p = o.pos[atom];
    const d = new THREE.Vector3(...world).applyQuaternion(o.m.quaternion.clone().invert());
    return kit.label(text, [p.x + d.x, p.y + d.y, p.z + d.z], { parent: o.m, cls });
  };
  const hOf = (o, i) => o.nb[i].find((j) => o.m.userData.data.atoms[j][0] === 'H');
  dirLabel(F, 5, 30, 'C4 =O', 'sm', [-1.2, 2.0, 0]);
  dirLabel(F, hOf(F, 7), 7, 'N¹⁰–H', 'sm', [1.2, 2.0, 0]);
  dirLabel(M, 11, 31, 'C4 –NH₂', 'sm acc', [-1.2, -2.0, 0]);
  dirLabel(M, 26, 5, 'N¹⁰–CH₃', 'sm acc', [1.4, -2.0, 0]);
  kit.label('Folic acid', [-9.5, 4.6 + 2.6, 0], { cls: '' });
  kit.label('Methotrexate', [-9.5, -4.6 - 2.6, 0], { cls: 'acc' });
  kit.fit(kit.root, 1.2);
  kit.onFrame((dt, t) => { const a = 0.42 * Math.sin(t * 0.6); F.holder.rotation.x = a; M.holder.rotation.x = a; });
  el.append(h('div', { style: 'position:absolute;left:0;bottom:0;font-size:22px;color:var(--fg-3);pointer-events:none', html: 'Real 3D structures · gold atoms = the only differences' }));
  return kitController(kit);
}

// 17 · One-carbon units on THF (real 3D THF; attached units schematic)
async function oneCarbonViz(el) {
  const host = h('div', { style: 'position:absolute;left:0;top:0;width:1010px;height:606px' });
  const panel = h('div', { style: 'position:absolute;left:1050px;right:0;top:0;height:606px;display:flex;flex-direction:column;justify-content:center;gap:22px' });
  const strip = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:96px;display:flex;align-items:center;gap:14px;justify-content:center' });
  el.append(host, panel, strip);
  const kit = createScene(host, { cam: [0, 0, 30], autoRotate: 0, fov: 30 });
  const data = await loadMol('thf');
  const mol = buildMolecule(data, { hideH: 'nonpolar' });
  const P = mol.userData.pos;
  const nb = adjacency(data);
  const N5 = 6, N10 = 8;
  const H5 = nb[N5].find((j) => data.atoms[j][0] === 'H');
  const H10 = nb[N10].find((j) => data.atoms[j][0] === 'H');
  const d5 = P[H5].clone().sub(P[N5]).normalize();
  const d10 = P[H10].clone().sub(P[N10]).normalize();
  const pts = P.filter((_, i) => !mol.userData.hidden.has(i));
  let q = principalQuat(pts, P[21]);
  q = faceQuat(q, d5.clone().add(d10), 0.75);
  mol.quaternion.copy(q);
  const holder = new THREE.Group();
  holder.add(mol);
  kit.root.add(holder);
  const bondMeshes = (a, b) => {
    const pa = P[a], pb = P[b], mid = pa.clone().add(pb).multiplyScalar(0.5);
    const c1 = pa.clone().add(mid).multiplyScalar(0.5), c2 = mid.clone().add(pb).multiplyScalar(0.5);
    return mol.children.filter((c) => c.geometry?.type === 'CylinderGeometry' && (c.position.distanceTo(c1) < 0.03 || c.position.distanceTo(c2) < 0.03));
  };
  const hideH = (hIdx, nIdx, hidden) => { mol.userData.atomMeshes[hIdx].visible = !hidden; bondMeshes(nIdx, hIdx).forEach((m) => (m.visible = !hidden)); };
  const ACC = 0xff7a45;
  const accMat = glossy(ACC, { emissive: 0x5a2000, emissiveIntensity: 0.6 });
  const perp = (v) => { let p = new THREE.Vector3(0, 0, 1).cross(v); if (p.lengthSq() < 1e-3) p = new THREE.Vector3(0, 1, 0).cross(v); return p.normalize(); };
  const buildUnit = (kind) => {
    const atoms = [], bonds = [], anchors = [];
    if (kind === 0) { // formyl on N10
      const C = P[N10].clone().addScaledVector(d10, 1.38), p = perp(d10);
      atoms.push({ el: 'C', p: C, color: ACC, emissive: 0x5a2000, r: 0.5 });
      atoms.push({ el: 'O', p: C.clone().addScaledVector(d10, 0.61).addScaledVector(p, 1.06) });
      atoms.push({ el: 'H', p: C.clone().addScaledVector(d10, 0.54).addScaledVector(p, -0.94) });
      bonds.push([0, 1, 2], [0, 2, 1]);
      anchors.push([N10, C]);
    } else if (kind === 1) { // methylene bridging N5–N10
      const n = d5.clone().add(d10).normalize();
      const C = P[N5].clone().add(P[N10]).multiplyScalar(0.5).addScaledVector(n, 0.6);
      const e = P[N10].clone().sub(P[N5]).normalize(), w = n.clone().cross(e).normalize();
      atoms.push({ el: 'C', p: C, color: ACC, emissive: 0x5a2000, r: 0.5 });
      atoms.push({ el: 'H', p: C.clone().addScaledVector(n, 0.6).addScaledVector(w, 0.85) });
      atoms.push({ el: 'H', p: C.clone().addScaledVector(n, 0.6).addScaledVector(w, -0.85) });
      bonds.push([0, 1, 1], [0, 2, 1]);
      anchors.push([N5, C], [N10, C]);
    } else { // methyl on N5
      const C = P[N5].clone().addScaledVector(d5, 1.47), e1 = perp(d5), e2 = d5.clone().cross(e1).normalize();
      atoms.push({ el: 'C', p: C, color: ACC, emissive: 0x5a2000, r: 0.5 });
      for (let k = 0; k < 3; k++) { const a = (k * 2 * Math.PI) / 3; atoms.push({ el: 'H', p: C.clone().addScaledVector(d5, 0.36).addScaledVector(e1, Math.cos(a) * 0.97).addScaledVector(e2, Math.sin(a) * 0.97) }); bonds.push([0, k + 1, 1]); }
      anchors.push([N5, C]);
    }
    const g = ballStick(atoms, bonds);
    anchors.forEach(([n, C]) => g.add(cylinderBetween(P[n], C, 0.12, accMat)));
    const glow = glowSprite(ACC, 3.2);
    glow.position.copy(atoms[0].p);
    g.add(glow);
    g.userData.dir = kind === 0 ? d10 : kind === 2 ? d5 : d5.clone().add(d10).normalize();
    return g;
  };
  const units = [0, 1, 2].map(buildUnit);
  units.forEach((u) => { u.visible = false; mol.add(u); });
  const lN5 = kit.label('N⁵', P[N5].clone().addScaledVector(d5, -1.9).toArray(), { parent: mol, cls: 'acc sm' });
  const lN10 = kit.label('N¹⁰', P[N10].clone().addScaledVector(d10, -1.9).toArray(), { parent: mol, cls: 'acc sm' });
  [lN5, lN10].forEach((l) => (l.element.style.fontWeight = 750));
  kit.fit(holder, 1.35);
  kit.onFrame((dt, t) => { holder.rotation.x = 0.3 * Math.sin(t * 0.5); });
  host.append(h('div', { style: 'position:absolute;left:0;top:0;font-size:24px;color:var(--fg-2);pointer-events:none', html: 'Tetrahydrofolate · real 3D' }));
  // right panel rows
  const ROWS = [
    { name: 'N<sup>10</sup>-formyl THF', unit: '–CHO', prod: 'Purine nucleotide synthesis', tip: 'Formyl group on N¹⁰ → used to build purine nucleotides.' },
    { name: 'N<sup>5</sup>,N<sup>10</sup>-methylene THF', unit: '–CH₂–', prod: 'dTMP (thymidylate) · serine from glycine', tip: 'Methylene bridges N⁵ and N¹⁰ → thymidine monophosphate synthesis and serine synthesis from glycine.' },
    { name: 'N<sup>5</sup>-methyl THF', unit: '–CH₃', prod: 'Methionine from homocysteine', tip: 'Methyl on N⁵ → methionine synthesis from homocysteine (needs B₁₂).' },
  ];
  const rowEls = ROWS.map((r, i) => {
    const row = h('div', { style: 'padding:22px 28px;border-radius:28px;background:var(--surface);border:2px solid var(--line);cursor:pointer;transition:all .4s var(--ease)' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:16px' }, [
        h('div', { style: 'font-size:32px;font-weight:680;letter-spacing:-.015em', html: r.name }),
        h('span.chip.acc', { style: 'font-size:26px', html: r.unit }),
      ]),
      h('div', { style: 'font-size:27px;color:var(--fg-2);margin-top:10px', html: `→ ${r.prod}` }),
    ]);
    tip(row, { kicker: 'THF derivative', title: r.name, body: r.tip, src: SRC(15) });
    row.addEventListener('click', () => select(i + 1));
    panel.append(row);
    return row;
  });
  const UNITS = [
    ['–CHO', 'formyl'], ['–CH=NH', 'formimino'], ['–CH=', 'methenyl'], ['–CH₂–', 'methylene'], ['–CH₂OH', 'hydroxymethyl'], ['–CH₃', 'methyl'],
  ];
  strip.append(h('div', { style: 'font-size:23px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-3);margin-right:10px', text: 'One-carbon units' }));
  const chipEls = UNITS.map(([f, n]) => {
    const c = h('div', { style: 'padding:10px 20px;border-radius:20px;background:var(--surface);border:1.5px solid var(--line);text-align:center;transition:all .4s var(--ease)' }, [
      h('div', { style: 'font-size:27px;font-weight:700;font-family:var(--font)', text: f }),
      h('div', { style: 'font-size:20px;color:var(--fg-2)', text: n }),
    ]);
    tip(c, { kicker: 'Carried by THF', title: `${n[0].toUpperCase()}${n.slice(1)} (${f})`, body: 'Attached at N⁵, at N¹⁰, or bridging both nitrogens of THF.', src: SRC(16) });
    strip.append(c);
    return c;
  });
  const UNIT_CHIP = [0, 3, 5];
  let cur = 0;
  function select(k) {
    cur = k;
    rowEls.forEach((r, i) => {
      const on = i === k - 1;
      r.style.borderColor = on ? 'var(--a1)' : 'var(--line)';
      r.style.background = on ? 'color-mix(in oklab, var(--a1) 12%, var(--surface))' : 'var(--surface)';
      r.style.opacity = k === 0 || on ? 1 : 0.5;
    });
    chipEls.forEach((c, i) => {
      const on = k > 0 && i === UNIT_CHIP[k - 1];
      c.style.borderColor = on ? 'var(--a1)' : 'var(--line)';
      c.style.background = on ? 'color-mix(in oklab, var(--a1) 16%, var(--surface))' : 'var(--surface)';
    });
    units.forEach((u, i) => {
      gsap.killTweensOf(u.position);
      gsap.killTweensOf(u.scale);
      if (i === k - 1) {
        u.visible = true;
        const d = u.userData.dir;
        gsap.fromTo(u.position, { x: d.x * 6, y: d.y * 6, z: d.z * 6 }, { x: 0, y: 0, z: 0, duration: 1.1, ease: 'power3.out' });
        gsap.fromTo(u.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'back.out(1.4)' });
      } else u.visible = false;
    });
    hideH(H10, N10, k === 1 || k === 2);
    hideH(H5, N5, k === 2 || k === 3);
  }
  select(0);
  return kitController(kit, { step: (n) => { if (n !== cur) select(Math.min(3, n)); } });
}

// 18 · Megaloblastic anemia mechanism
function megaloViz(el) {
  const D = dg(el, 960, 860);
  // DNA ladder
  txt(D, 0, 32, 'DNA synthesis', 24, `fill:var(--ink);${CAPS}`);
  const status = txt(D, 960, 32, 'normal', 26, 'fill:var(--act);font-weight:700', { anchor: 'end' });
  const XA = 20, XB = 940, YC = 108, AMP = 30;
  const strand = (sg) => { let d = ''; for (let x = XA; x <= XB; x += 8) d += `${x === XA ? 'M' : 'L'}${x},${(YC + sg * AMP * Math.sin(x / 38)).toFixed(1)}`; return d; };
  D.layers.edges.append(s('path', { d: strand(1), style: 'fill:none;stroke:var(--elec);stroke-width:5;stroke-linecap:round' }));
  D.layers.edges.append(s('path', { d: strand(-1), style: 'fill:none;stroke:var(--fadh);stroke-width:5;stroke-linecap:round' }));
  const rungs = [];
  for (let x = XA + 10, i = 0; x < XB; x += 20, i++) {
    const y1 = YC + AMP * Math.sin(x / 38), y2 = YC - AMP * Math.sin(x / 38);
    const bad = i % 4 === 1 || i % 7 === 3;
    const r = s('line', { x1: x, y1, x2: x, y2, style: 'stroke:var(--fg-2);stroke-width:5;stroke-linecap:round;opacity:0' });
    D.layers.nodes.append(r);
    rungs.push({ r, bad });
  }
  const dtmp = D.badge(800, 180, '↓ thymidine (dTMP)', { color: 'var(--inh)', size: 24, w: 290 });
  dtmp.style.opacity = 0;
  let slow = false, prog = 0, raf = 0, last = 0;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    prog += dt * (slow ? 5 : 26);
    const n = rungs.length + 12;
    const head = prog % n;
    rungs.forEach((o, i) => {
      const vis = i < head;
      const miss = slow && o.bad;
      o.r.style.opacity = vis ? (miss ? 1 : 0.9) : 0.08;
      o.r.style.stroke = miss ? 'var(--inh)' : 'var(--fg-2)';
      o.r.style.strokeDasharray = miss ? '4 8' : 'none';
    });
    raf = requestAnimationFrame(tick);
  };
  // lanes
  const XS = [130, 360, 590, 830];
  const lane = (y, label, col) => txt(D, 0, y, label, 24, `fill:${col};${CAPS}`);
  const ln1 = lane(272, 'Normal maturation', 'var(--act)');
  const ln2 = lane(568, 'Folate deficient', 'var(--inh)');
  const CY = [384, 690];
  const cyto = ['color-mix(in oklab, var(--elec) 38%, var(--o2) 14%)', 'color-mix(in oklab, var(--elec) 22%, var(--o2) 34%)', 'color-mix(in oklab, var(--o2) 52%, transparent)', 'color-mix(in oklab, var(--o2) 70%, transparent)'];
  const mkCell = (x, y, rc, rn, stage, immature) => {
    const g = s('g', { transform: `translate(${x} ${y})` });
    const c = s('ellipse', { rx: rc, ry: rc, style: `fill:${cyto[stage]};stroke:var(--line-2);stroke-width:2` });
    const n = s('circle', { r: rn, style: `fill:${immature ? 'color-mix(in oklab, var(--fadh) 45%, transparent)' : 'color-mix(in oklab, var(--fadh) 85%, black 10%)'};stroke:var(--fadh);stroke-width:${immature ? 3 : 0};${immature ? 'stroke-dasharray:5 6' : ''}` });
    g.append(c, n);
    D.layers.nodes.append(g);
    return { g, c, n };
  };
  const normal = [[64, 44], [54, 32], [44, 18], [38, 0]].map(([rc, rn], i) => mkCell(XS[i], CY[0], rc, rn, i, i === 0));
  const pallor = s('ellipse', { cx: XS[3], cy: CY[0], rx: 15, ry: 15, style: 'fill:color-mix(in oklab, var(--o2) 35%, #ffffff 40%)' });
  D.layers.nodes.append(pallor);
  const def = [[64, 44], [64, 44], [64, 42], [64, 0]].map(([rc, rn], i) => mkCell(XS[i], CY[1], rc, rn, i, true));
  const defPallor = s('ellipse', { cx: XS[3], cy: CY[1], rx: 16, ry: 12, style: 'fill:color-mix(in oklab, var(--o2) 35%, #ffffff 40%);opacity:0' });
  D.layers.nodes.append(defPallor);
  const arrows = (y) => XS.slice(0, 3).map((x, i) => D.arrow({ from: [x + 82, y], to: [XS[i + 1] - 82, y], width: 3, color: 'var(--line-2)', headSize: 12 }).g);
  const arN = arrows(CY[0]);
  const arD = arrows(CY[1]);
  const lblN = txt(D, XS[3], CY[0] + 92, 'Normal RBC', 24, 'fill:var(--fg-2);font-weight:600', { anchor: 'middle' });
  const lblM = txt(D, XS[2], CY[1] + 128, 'Megaloblast', 26, 'fill:var(--inh);font-weight:700', { anchor: 'middle' });
  const lblC = txt(D, XS[3], CY[1] + 128, 'Macrocyte', 26, 'fill:var(--inh);font-weight:700', { anchor: 'middle' });
  const nucTag = txt(D, XS[1] + 115, CY[1] - 94, 'nucleus lags', 24, 'fill:var(--fadh);font-weight:650', { anchor: 'middle' });
  const cytTag = txt(D, XS[1] + 115, CY[1] - 94, 'cytoplasm grows', 24, 'fill:var(--o2);font-weight:650', { anchor: 'middle' });
  const defEls = [ln2, ...def.map((d) => d.g), ...arD];
  [...defEls, lblM, lblC, nucTag, cytTag].forEach((e) => (e.style.opacity = 0));
  const SIZES = [[64, 64], [64, 76], [64, 88], [64, 96]];
  return {
    enter() { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); },
    leave() { cancelAnimationFrame(raf); },
    step(n) {
      slow = n >= 1;
      status.textContent = slow ? 'slow · defective' : 'normal';
      status.style.fill = slow ? 'var(--inh)' : 'var(--act)';
      show(dtmp, n >= 1);
      show(defEls, n >= 2);
      show(nucTag, n === 2);
      show(cytTag, n === 3);
      show([lblM, lblC], n >= 4);
      def.forEach((d, i) => {
        const grow = n >= 3;
        const r = grow ? SIZES[i][1] : SIZES[i][0];
        gsap.to(d.c, { attr: { rx: i === 3 && grow ? 104 : r, ry: i === 3 && grow ? 76 : r }, duration: 1.2, ease: 'power3.out' });
        d.n.style.strokeWidth = n === 2 ? 5 : 3;
        d.n.style.stroke = n === 2 ? 'var(--a1)' : 'var(--fadh)';
      });
      gsap.to(defPallor, { opacity: n >= 3 ? 1 : 0, duration: 0.8 });
    },
    destroy: () => { cancelAnimationFrame(raf); D.destroy(); },
  };
}

// 19 · Neural tube defects: timeline + defects that "close" with supplementation
function ntdViz(el) {
  const D = dg(el, 960, 860);
  const AY = 150;
  D.layers.edges.append(s('line', { x1: 30, y1: AY, x2: 930, y2: AY, style: 'stroke:var(--line-2);stroke-width:4;stroke-linecap:round' }));
  [[30, ''], [230, 'Conception'], [460, ''], [690, ''], [930, 'Birth']].forEach(([x, t]) => {
    D.layers.edges.append(s('line', { x1: x, y1: AY - 14, x2: x, y2: AY + 14, style: 'stroke:var(--fg-3);stroke-width:3' }));
    if (t) txt(D, x, AY + 52, t, 22, 'fill:var(--fg-3);font-weight:600', { anchor: x > 900 ? 'end' : 'middle' });
  });
  [['before', 130], ['1st trimester', 345], ['2nd', 575], ['3rd', 810]].forEach(([t, x]) => txt(D, x, AY + 90, t, 24, 'fill:var(--fg-2);font-weight:600', { anchor: 'middle' }));
  const pin = s('g');
  pin.append(s('line', { x1: 285, y1: AY - 44, x2: 285, y2: AY, style: 'stroke:var(--ink);stroke-width:3' }), s('circle', { cx: 285, cy: AY, r: 9, style: 'fill:var(--ink)' }));
  D.layers.labels.append(pin);
  txt(D, 285, AY - 54, 'neural tube closes · early pregnancy', 24, 'fill:var(--ink);font-weight:650', { anchor: 'start' });
  const band = s('rect', { x: 60, y: AY - 14, width: 400, height: 28, rx: 14, style: 'fill:color-mix(in oklab, var(--atp) 55%, transparent);stroke:var(--atp);stroke-width:2' });
  D.layers.edges.append(band);
  const bandL = txt(D, 60, AY - 98, 'Folic acid supplementation window', 26, `fill:var(--atp);font-weight:720`);
  // defect cards
  D.region({ x: 0, y: 280, w: 460, h: 580, r: 36, fill: 'var(--surface)' });
  D.region({ x: 500, y: 280, w: 460, h: 580, r: 36, fill: 'var(--surface)' });
  txt(D, 230, 340, 'Spina bifida', 34, 'font-weight:720;fill:var(--fg)', { anchor: 'middle', tip: { kicker: 'Neural tube defect', title: 'Spina bifida', body: 'Birth defect where the spine and spinal canal do not close completely during early pregnancy.', src: SRC(19) } });
  txt(D, 730, 340, 'Anencephaly', 34, 'font-weight:720;fill:var(--fg)', { anchor: 'middle', tip: { kicker: 'Neural tube defect', title: 'Anencephaly', body: 'Birth defect where a baby is born without parts of the brain and skull.', src: SRC(19) } });
  txt(D, 230, 790, 'spine & spinal canal', 24, 'fill:var(--fg-2)', { anchor: 'middle' });
  txt(D, 230, 822, 'do not close completely', 24, 'fill:var(--fg-2)', { anchor: 'middle' });
  txt(D, 730, 790, 'born without parts', 24, 'fill:var(--fg-2)', { anchor: 'middle' });
  txt(D, 730, 822, 'of brain and skull', 24, 'fill:var(--fg-2)', { anchor: 'middle' });
  // spine
  const cord = s('path', { d: 'M230,380 L230,560 C230,620 300,630 300,660 C300,690 230,690 230,730', style: 'fill:none;stroke:var(--atp);stroke-width:8;stroke-linecap:round' });
  D.layers.edges.append(cord);
  const halves = [];
  for (let k = 0; k < 9; k++) {
    const y = 384 + k * 38, open = k >= 6;
    const L = s('rect', { x: 184, y, width: 46, height: 28, rx: 9, style: 'fill:var(--surface-3);stroke:var(--line-2);stroke-width:2' });
    const R = s('rect', { x: 230, y, width: 46, height: 28, rx: 9, style: 'fill:var(--surface-3);stroke:var(--line-2);stroke-width:2' });
    D.layers.nodes.append(L, R);
    halves.push({ L, R, open });
  }
  const sac = s('ellipse', { cx: 314, cy: 660, rx: 56, ry: 50, style: 'fill:color-mix(in oklab, var(--inh) 22%, transparent);stroke:var(--inh);stroke-width:3' });
  D.layers.edges.append(sac);
  // head
  const head = s('g');
  const jaw = s('path', { d: 'M610,560 A120,120 0 0 0 850,560', style: 'fill:none;stroke:var(--fg-2);stroke-width:5;stroke-linecap:round' });
  const vault = s('path', { d: 'M610,560 A120,120 0 0 1 850,560', style: 'fill:none;stroke:var(--fg-3);stroke-width:5;stroke-linecap:round;stroke-dasharray:8 12' });
  const brain = s('g', { style: 'opacity:0' });
  brain.append(s('path', { d: 'M632,548 C628,478 680,452 730,452 C780,452 832,478 828,548 Z', style: 'fill:color-mix(in oklab, var(--o2) 22%, transparent);stroke:color-mix(in oklab, var(--o2) 70%, transparent);stroke-width:2' }));
  brain.append(s('path', { d: 'M662,520 q14,-30 34,-14 q14,-26 34,-8 q16,-22 34,-4 q18,-14 30,16 M680,540 q20,-16 40,-2 q20,-14 40,0', style: 'fill:none;stroke:color-mix(in oklab, var(--o2) 60%, transparent);stroke-width:3;stroke-linecap:round' }));
  brain.append(s('line', { x1: 730, y1: 456, x2: 730, y2: 546, style: 'stroke:color-mix(in oklab, var(--o2) 50%, transparent);stroke-width:2' }));
  const cut = s('path', { d: 'M618,520 C660,540 700,526 730,536 C760,546 800,528 842,520', style: 'fill:none;stroke:var(--inh);stroke-width:4;stroke-linecap:round' });
  head.append(brain, vault, jaw, cut, s('circle', { cx: 690, cy: 584, r: 9, style: 'fill:var(--fg-2)' }), s('circle', { cx: 770, cy: 584, r: 9, style: 'fill:var(--fg-2)' }));
  D.layers.nodes.append(head);
  const ok1 = D.badge(230, 400, '↓ risk', { color: 'var(--act)', size: 26 });
  const ok2 = D.badge(730, 400, '↓ risk', { color: 'var(--act)', size: 26 });
  ok1.setAttribute('transform', 'translate(390 400)');
  ok2.setAttribute('transform', 'translate(890 400)');
  const defects = [...halves.flatMap((x) => [x.L, x.R]), sac, cord, head];
  [...defects, band, bandL, ok1, ok2].forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      show(defects, n >= 1);
      show([band, bandL, ok1, ok2], n >= 2);
      const heal = n >= 2;
      halves.forEach(({ L, R, open }) => { if (!open) return; gsap.to(L, { attr: { x: heal ? 184 : 166 }, duration: 1.2, ease: 'power3.inOut' }); gsap.to(R, { attr: { x: heal ? 230 : 248 }, duration: 1.2, ease: 'power3.inOut' }); });
      gsap.to(sac, { attr: { rx: heal ? 0.1 : 56, ry: heal ? 0.1 : 50 }, opacity: heal ? 0 : 1, duration: 1.2, ease: 'power3.inOut' });
      cord.setAttribute('d', heal ? 'M230,380 L230,560 C230,620 230,630 230,660 C230,690 230,690 230,730' : 'M230,380 L230,560 C230,620 300,630 300,660 C300,690 230,690 230,730');
      vault.style.stroke = heal ? 'var(--fg-2)' : 'var(--fg-3)';
      vault.style.strokeDasharray = heal ? 'none' : '8 12';
      gsap.to(brain, { opacity: heal ? 1 : 0, duration: 1 });
      gsap.to(cut, { opacity: heal ? 0 : 1, duration: 0.6 });
    },
    destroy: () => D.destroy(),
  };
}

// 21 · Vitamin B12 — stylised 3D corrin from the real connectivity, with switchable upper ligand
async function b12StructViz(el) {
  const kit = createScene(el, { cam: [0, 9, 25], autoRotate: 0.7, fov: 30 });
  const [bd, ad] = await Promise.all([loadMol('b12'), loadMol('amp')]);
  const A = bd.atoms;
  const RING = [16, 17, 18, 19, 30, 31, 32, 33, 34, 35, 36, 38, 45, 46, 47, 48, 52, 53, 54, 56, 57, 60, 64];
  const METH = [39, 40, 44, 58, 59, 62, 68, 69];
  const UPCH = [37, 50, 2, 20, 42, 55, 3, 21, 61, 71, 6, 24];
  const DNCH = [41, 49, 67, 5, 23, 63, 70, 74, 7, 25, 65, 72, 75, 8, 26, 43, 51, 66, 4, 22];
  const keep = [...RING, ...METH, ...UPCH, ...DNCH];
  const idx = new Map(keep.map((k, i) => [k, i]));
  const N4 = [16, 17, 18, 19];
  const cx = N4.reduce((a, n) => a + A[n][1], 0) / 4, cy = N4.reduce((a, n) => a + A[n][2], 0) / 4;
  const SC = 1.42;
  const nb = A.map(() => []);
  bd.bonds.forEach(([a, b]) => { if (idx.has(a) && idx.has(b)) { nb[a].push(b); nb[b].push(a); } });
  const depth = new Map(RING.map((r) => [r, 0]));
  const queue = [...RING];
  while (queue.length) { const a = queue.shift(); nb[a].forEach((b) => { if (!depth.has(b)) { depth.set(b, depth.get(a) + 1); queue.push(b); } }); }
  const up = new Set(UPCH), dn = new Set(DNCH), me = new Set(METH);
  const atoms = keep.map((k) => {
    const x = (A[k][1] - cx) * SC, z = -(A[k][2] - cy) * SC;
    let y = 0.22 * Math.cos(2 * Math.atan2(z, x));
    const d = depth.get(k) || 0;
    if (me.has(k)) y += k % 2 ? 0.75 : -0.75;
    if (up.has(k)) y += 0.9 * d;
    if (dn.has(k)) y -= 0.9 * d;
    const shrink = 1 - 0.05 * d;
    return { el: A[k][0], p: new THREE.Vector3(x * shrink, y, z * shrink) };
  });
  const AMIDE = new Set([50, 55, 71, 67, 74, 75, 66]);
  const bonds = bd.bonds.filter(([a, b]) => idx.has(a) && idx.has(b)).map(([a, b, o]) => {
    if (AMIDE.has(a) || AMIDE.has(b)) { const other = AMIDE.has(a) ? b : a; const e = A[other][0]; if (e === 'O') o = 2; else if (e === 'N') o = 1; }
    return [idx.get(a), idx.get(b), o];
  });
  const core = ballStick(atoms, bonds, { bond: 0.12 });
  kit.root.add(core);
  const coMat = glossy(0xff6ea8, { emissive: 0x6a1438, emissiveIntensity: 0.7 });
  const co = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), coMat);
  co.scale.setScalar(0.68);
  kit.root.add(co);
  const coGlow = glowSprite(0xff6ea8, 5.5);
  kit.root.add(coGlow);
  const coord = glossy(0xff8fbf);
  N4.forEach((n) => kit.root.add(cylinderBetween(new THREE.Vector3(), atoms[idx.get(n)].p, 0.085, coord)));
  // lower ligand: 5,6-dimethylbenzimidazole, perpendicular to the ring
  const Rp = 1.174, P0 = new THREE.Vector3(0, -2.0 - Rp, 0);
  const pv = (k) => { const a = ((90 + 72 * k) * Math.PI) / 180; return P0.clone().add(new THREE.Vector3(Math.cos(a) * Rp, Math.sin(a) * Rp, 0)); };
  const dAt = [0, 1, 2, 3, 4].map((k) => ({ el: ['N', 'C', 'N', 'C', 'C'][k], p: pv(k) }));
  const dBo = [[0, 1, 2], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 0, 1]];
  const Aa = dAt[4].p, Bb = dAt[3].p;
  const M = Aa.clone().add(Bb).multiplyScalar(0.5);
  const Hc = M.clone().add(M.clone().sub(P0).normalize().multiplyScalar((1.39 * Math.sqrt(3)) / 2));
  const angA = Math.atan2(Aa.y - Hc.y, Aa.x - Hc.x);
  const hexIdx = [];
  for (let j = 0; j < 6; j++) {
    const a = angA + (j * Math.PI) / 3;
    const p = new THREE.Vector3(Hc.x + Math.cos(a) * 1.39, Hc.y + Math.sin(a) * 1.39, 0);
    if (p.distanceTo(Aa) < 0.05) hexIdx.push(4);
    else if (p.distanceTo(Bb) < 0.05) hexIdx.push(3);
    else { dAt.push({ el: 'C', p }); hexIdx.push(dAt.length - 1); }
  }
  for (let j = 0; j < 6; j++) { const a = hexIdx[j], b = hexIdx[(j + 1) % 6]; if (!((a === 3 && b === 4) || (a === 4 && b === 3))) dBo.push([a, b, j % 2 ? 2 : 1]); }
  const far = hexIdx.filter((i) => i > 4).sort((i, j) => dAt[j].p.distanceTo(P0) - dAt[i].p.distanceTo(P0)).slice(0, 2);
  far.forEach((i) => { const p = dAt[i].p.clone().add(dAt[i].p.clone().sub(Hc).normalize().multiplyScalar(1.5)); dAt.push({ el: 'C', p }); dBo.push([i, dAt.length - 1, 1]); });
  const dmb = ballStick(dAt, dBo);
  dmb.add(cylinderBetween(new THREE.Vector3(), dAt[0].p, 0.1, coord));
  kit.root.add(dmb);
  // schematic nucleotide loop (N1 of DMB → side chain f)
  const pN1 = dAt[2].p, pN22 = atoms[idx.get(22)].p;
  const curve = new THREE.CatmullRomCurve3([pN1, pN1.clone().add(new THREE.Vector3(-1.4, -1.2, 0.8)), pN22.clone().multiplyScalar(0.6).setY(pN22.y - 1.6), pN22]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.14, 10), matte(0x9a9aa2, { transparent: true, opacity: 0.55 }));
  kit.root.add(tube);
  // upper ligands
  const ups = [];
  {
    const g = ballStick([{ el: 'C', p: new THREE.Vector3(0, 1.92, 0) }, { el: 'N', p: new THREE.Vector3(0, 3.08, 0) }], [[0, 1, 3]]);
    g.add(cylinderBetween(new THREE.Vector3(), new THREE.Vector3(0, 1.92, 0), 0.1, coord));
    ups.push({ g, top: 3.1, lbl: '–C≡N · cyanocobalamin' });
  }
  {
    const C = new THREE.Vector3(0, 2.0, 0);
    const at = [{ el: 'C', p: C, color: 0xff7a45, emissive: 0x5a2000 }], bo = [];
    for (let k = 0; k < 3; k++) { const a = (k * 2 * Math.PI) / 3; at.push({ el: 'H', p: C.clone().add(new THREE.Vector3(Math.cos(a) * 0.98, 0.36, Math.sin(a) * 0.98)) }); bo.push([0, k + 1, 1]); }
    const g = ballStick(at, bo);
    g.add(cylinderBetween(new THREE.Vector3(), C, 0.1, coord));
    ups.push({ g, top: 2.5, lbl: '–CH₃ · methylcobalamin' });
  }
  {
    const drop = new Set([0, 4, 5, 6, 7]);
    const keepA = ad.atoms.map((a, i) => i).filter((i) => !drop.has(i) && ad.atoms[i][0] !== 'H');
    const m = new Map(keepA.map((k, i) => [k, i]));
    const pts = keepA.map((k) => new THREE.Vector3(ad.atoms[k][1], ad.atoms[k][2], ad.atoms[k][3]));
    const o = pts[m.get(17)].clone();
    pts.forEach((p) => p.sub(o));
    const cen = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const qq = new THREE.Quaternion().setFromUnitVectors(cen.clone().normalize(), new THREE.Vector3(0.3, 1, 0.15).normalize());
    pts.forEach((p) => p.applyQuaternion(qq).add(new THREE.Vector3(0, 2.02, 0)));
    const at = keepA.map((k, i) => ({ el: ad.atoms[k][0], p: pts[i], ...(k === 17 ? { color: 0xff7a45, emissive: 0x5a2000 } : {}) }));
    const bo = ad.bonds.filter(([a, b]) => m.has(a) && m.has(b)).map(([a, b, ord]) => [m.get(a), m.get(b), ord]);
    const g = ballStick(at, bo);
    g.add(cylinderBetween(new THREE.Vector3(), new THREE.Vector3(0, 2.02, 0), 0.1, coord));
    ups.push({ g, top: Math.max(...pts.map((p) => p.y)), lbl: '5′-deoxyadenosyl · coenzyme' });
  }
  ups.forEach((u) => kit.root.add(u.g));
  kit.fit(kit.root, 1.15);
  ups.forEach((u) => {
    u.label = kit.label(u.lbl, [0, u.top + 1.1, 0], { cls: 'acc sm' });
    u.g.visible = false;
    u.label.element.style.opacity = 0;
  });
  const minY = Math.min(...dAt.map((a) => a.p.y));
  kit.label('Dimethylbenzimidazole', [0, minY - 1.2, 0], { cls: 'sm' });
  const ringMax = atoms.reduce((b, a) => (a.p.x > b.p.x ? a : b), atoms[0]);
  kit.label('Corrin ring', [ringMax.p.x + 1.6, ringMax.p.y + 0.8, ringMax.p.z], { cls: 'sm' });
  kit.label('Co', [1.3, 0.9, 1.3], { cls: 'sm acc' });
  let cur = -1;
  const set = (k) => {
    cur = k;
    ups.forEach((u, i) => {
      u.g.visible = i === k;
      u.label.element.style.opacity = i === k ? 1 : 0;
      if (i === k) gsap.fromTo(u.g.scale, { x: 0.4, y: 0.4, z: 0.4 }, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'back.out(1.6)' });
    });
  };
  const sg = seg({ options: [{ v: 0, t: 'Cyano-' }, { v: 1, t: 'Methyl-' }, { v: 2, t: 'Deoxyadenosyl-' }], value: 0, onChange: set });
  tip(sg.el, { kicker: 'Upper (axial) ligand on cobalt', title: 'Forms of cobalamin', list: ['<b>Cyanocobalamin</b> — the injected drug form (IM)', '<b>Methylcobalamin</b> — coenzyme of methionine synthase', '<b>Deoxyadenosylcobalamin</b> — coenzyme of methylmalonyl-CoA mutase'], src: SRC('24, 26') });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(0);
  return kitController(kit, { step: (n) => { const k = Math.min(2, n); if (k !== cur) sg.set(k); } });
}

// 22 · B12 absorption journey + pernicious anemia toggle
function b12JourneyViz(el) {
  const D = dg(el, 1712, 720);
  const R = (x, w, label, fill) => D.region({ x, y: 40, w, h: 670, r: 34, label, fill });
  R(0, 370, 'Stomach', 'color-mix(in oklab, var(--prot) 5%, transparent)');
  R(390, 370, 'Small intestine', 'color-mix(in oklab, var(--atp) 4%, transparent)');
  R(780, 350, 'Ileum', 'color-mix(in oklab, var(--act) 5%, transparent)');
  R(1150, 250, 'Blood', 'color-mix(in oklab, var(--inh) 8%, transparent)');
  R(1420, 292, 'Liver', 'color-mix(in oklab, var(--o2) 6%, transparent)');
  // stomach glyph
  D.layers.regions.append(s('path', { d: 'M140,108 L178,108 C182,160 205,200 245,230 C305,270 335,330 335,400 C335,440 348,462 370,466 L370,512 C325,516 302,522 272,544 C202,594 108,566 82,474 C56,380 78,282 118,204 C134,172 140,140 140,108 Z', style: 'fill:color-mix(in oklab, var(--prot) 14%, transparent);stroke:color-mix(in oklab, var(--prot) 55%, transparent);stroke-width:3' }));
  // parietal cells
  const pcs = [[118, 286], [104, 350], [108, 414], [134, 476]].map(([x, y]) => {
    const g = s('g', { transform: `translate(${x} ${y})`, 'data-tip': JSON.stringify({ kicker: 'Gastric mucosa', title: 'Parietal cells', body: 'Produce <b>intrinsic factor (IF)</b>, required for B₁₂ absorption.', src: SRC(26) }) });
    g.append(s('path', { d: 'M0,-17 L15,-8 L15,8 L0,17 L-15,8 L-15,-8 Z', style: `fill:color-mix(in oklab, ${IFC} 35%, var(--bg));stroke:${IFC};stroke-width:2.5` }));
    const x2 = s('path', { d: 'M-10,-10 L10,10 M10,-10 L-10,10', style: 'stroke:var(--inh);stroke-width:5;stroke-linecap:round;opacity:0' });
    g.append(x2);
    D.layers.nodes.append(g);
    return { g, x2 };
  });
  const lblPC = txt(D, 30, 640, 'Parietal cells → IF', 25, `fill:${IFC};font-weight:700`);
  const abs = [[60, 250], [52, 380], [70, 520]].map(([x, y]) => { const t = txt(D, x, y, 'Y', 30, 'fill:var(--inh);font-weight:800', { anchor: 'middle' }); t.style.opacity = 0; return t; });
  // intestine tube
  const tubeD = 'M370,490 C420,515 440,600 500,600 C570,600 560,430 630,430 C700,430 700,600 760,560 C790,540 800,440 828,412';
  D.layers.edges.append(s('path', { d: tubeD, style: 'fill:none;stroke:color-mix(in oklab, var(--prot) 16%, transparent);stroke-width:50;stroke-linecap:round' }));
  D.layers.edges.append(s('path', { d: 'M820,420 C812,500 800,590 792,690', style: 'fill:none;stroke:color-mix(in oklab, var(--prot) 10%, transparent);stroke-width:44;stroke-linecap:round' }));
  const lStool = txt(D, 820, 664, 'lost in stool', 24, 'fill:var(--inh);font-weight:700');
  // ileal enterocyte
  D.layers.regions.append(s('rect', { x: 840, y: 200, width: 262, height: 400, rx: 30, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2' }));
  let mv = '';
  for (let y = 214; y < 590; y += 22) if (Math.abs(y - 400) > 40) mv += `M840,${y} q-18,2 -18,7 q0,5 18,7 `;
  D.layers.regions.append(s('path', { d: mv, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:1.5' }));
  const rec = s('g', { 'data-tip': JSON.stringify({ kicker: 'Ileal uptake', title: 'B₁₂–IF receptor', body: 'The B₁₂–IF complex is absorbed in the ileum.<br><span style="color:var(--fg-3)">Textbook: the receptor is cubilin (cubam), in the terminal ileum.</span>', src: SRC(22) }) });
  rec.append(s('path', { d: 'M842,388 l-16,-14 M842,412 l-16,14 M842,388 L842,412', style: 'fill:none;stroke:#c8a26a;stroke-width:6;stroke-linecap:round' }));
  D.layers.nodes.append(rec);
  const lIF = txt(D, 960, 560, 'IF degraded', 22, 'fill:var(--fg-3);font-weight:600', { anchor: 'middle' });
  const lRel = txt(D, 970, 372, 'B₁₂ released', 22, `fill:${B12};font-weight:650`, { anchor: 'middle' });
  // blood + liver
  const lTC = txt(D, 1275, 356, 'TC II', 30, `fill:${TC2};font-weight:760`, { anchor: 'middle', tip: { kicker: 'Plasma transport', title: 'Transcobalamin II', body: 'In the ileal cell IF is released and B₁₂ is transferred to <b>transcobalamin II</b>, the plasma transport protein.', src: SRC(22) } });
  const liver = s('path', { d: 'M1452,300 C1472,230 1622,210 1692,250 C1712,265 1702,330 1672,380 C1622,460 1532,540 1477,520 C1442,505 1437,400 1452,300 Z', style: 'fill:color-mix(in oklab, var(--o2) 20%, transparent);stroke:color-mix(in oklab, var(--o2) 70%, transparent);stroke-width:3' });
  D.layers.regions.append(liver);
  const store = [];
  let sd = 11;
  const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const bb = { x: 1440, y: 215, w: 270, h: 320 };
  let tries = 0;
  while (store.length < 46 && tries++ < 4000) {
    const x = bb.x + rnd() * bb.w, y = bb.y + rnd() * bb.h;
    if (liver.isPointInFill(new DOMPoint(x, y))) { const c = s('circle', { cx: x, cy: y, r: 7, style: `fill:${B12};opacity:0` }); D.layers.nodes.append(c); store.push(c); }
  }
  const lStore = txt(D, 1566, 612, '2–5 mg stored', 32, 'font-weight:740;fill:var(--fg)', { anchor: 'middle', tip: { kicker: 'Storage', title: 'Liver stores of B₁₂', body: 'Unlike other water-soluble vitamins, B₁₂ is stored in the liver: about 2–5 mg, enough for 2–3 years.<br><span style="color:var(--fg-3)">Textbooks often quote 3–5 years.</span>', src: SRC(23) } });
  const lYears = txt(D, 1566, 652, 'lasts 2–3 years', 26, 'fill:var(--fg-2)', { anchor: 'middle' });
  const lFail = txt(D, 575, 170, 'No IF → B₁₂ not absorbed', 30, 'fill:var(--inh);font-weight:740', { anchor: 'middle' });
  const lCpx = txt(D, 250, 300, 'B₁₂–IF', 26, `fill:${IFC};font-weight:720`, { anchor: 'middle' });
  const lDiet = txt(D, 196, 132, 'Diet B₁₂', 25, `fill:${B12};font-weight:700`);
  // flows
  const fl = flowBank();
  const P = (d) => hidePath(D, d);
  const fDiet = fl.add(tokenFlow(D, P('M158,70 L158,140 C162,220 190,290 210,334'), { count: 2, speed: 90, make: TOK.b12(10) }));
  const fIF = fl.add(tokenFlow(D, P('M126,410 C150,390 180,366 206,352'), { count: 2, speed: 60, make: TOK.ifc }));
  const fCpx = fl.add(tokenFlow(D, P(`M216,352 C262,402 320,470 370,490 C420,515 440,600 500,600 C570,600 560,430 630,430 C700,430 700,600 760,560 C790,540 800,440 832,402`), { count: 5, speed: 150, make: TOK.cpx }));
  const fCell = fl.add(tokenFlow(D, P('M852,400 L1150,400'), { count: 3, speed: 110, make: TOK.b12(10) }));
  const fDeg = fl.add(tokenFlow(D, P('M856,404 C880,450 905,500 930,532'), { count: 2, speed: 60, fadeK: 3, make: () => { const g = s('g'); g.append(s('circle', { r: 5, cx: -4, style: `fill:${IFC}` }), s('circle', { r: 4, cx: 5, cy: 3, style: `fill:${IFC}` })); return g; } }));
  const fTC = fl.add(tokenFlow(D, P('M1150,400 L1300,400 C1360,400 1400,385 1480,385'), { count: 3, speed: 110, make: TOK.tc }));
  const fLost = fl.add(tokenFlow(D, P('M216,352 C262,402 320,470 370,490 C420,515 440,600 500,600 C570,600 560,430 630,430 C700,430 700,600 760,560 C790,540 800,440 826,420 C812,500 800,590 792,700'), { count: 6, speed: 160, make: TOK.b12(10) }));
  const g1 = [lblPC, lCpx], g2 = [lIF, lRel], g3 = [lTC], g4 = [lStore, lYears];
  [...g1, ...g2, ...g3, ...g4, lFail, lStool].forEach((e) => (e.style.opacity = 0));
  let cur = 0, pa = false, level = 0;
  const lv = { v: 0 };
  const paintStore = () => store.forEach((c, i) => { c.style.opacity = i < lv.v * store.length ? 0.9 : 0; });
  const apply = (n) => {
    cur = n;
    show(g1, n >= 1);
    show(g2, n >= 2 && !pa);
    show(g3, n >= 3 && !pa);
    show(g4, n >= 4);
    show([lFail, lStool], pa);
    pcs.forEach(({ g, x2 }) => { gsap.to(x2, { opacity: pa ? 1 : 0, duration: 0.4 }); gsap.to(g, { opacity: pa ? 0.5 : 1, duration: 0.4 }); });
    gsap.to(abs, { opacity: pa ? 1 : 0, duration: 0.5 });
    gsap.to(lCpx, { opacity: n >= 1 && !pa ? 1 : 0, duration: 0.4 });
    const on = [fDiet];
    if (!pa) {
      if (n >= 1) on.push(fIF);
      if (n >= 2) on.push(fCpx, fCell, fDeg);
      if (n >= 3) on.push(fTC);
    } else on.push(fLost);
    fl.run(on);
    const target = n >= 4 ? (pa ? 0.12 : 1) : 0;
    if (target !== level) { level = target; gsap.to(lv, { v: target, duration: pa ? 3 : 1.6, ease: 'power2.inOut', onUpdate: paintStore }); }
  };
  const tg = toggle({ label: 'Pernicious anemia', danger: true, onChange: (v) => { pa = v; apply(cur); } });
  tip(tg.el, { kicker: 'B₁₂ deficiency', title: 'Pernicious anemia', body: 'Deficiency of intrinsic factor: <b>autoimmune destruction of parietal cells</b> or partial/total gastrectomy → B₁₂ malabsorption.', src: SRC(26) });
  ctrlBar(el, [tg], { left: 400, bottom: 0 });
  return {
    step: (n) => { pa = n >= 5; tg.set(pa, false); apply(Math.min(4, n)); },
    enter: () => {}, leave: () => fl.pause(),
    destroy: () => { fl.destroy(); D.destroy(); },
  };
}

// 23 · Liver reserve: B12 lasts years, folate runs out fast
function reserveViz(el) {
  const D = dg(el, 960, 760);
  const tanks = [
    { x: 130, name: 'B₁₂', sub: '2–5 mg in liver', col: B12, life: 30, def: 24 },
    { x: 560, name: 'Folate', sub: 'limited stores', col: FOL, life: 4, def: 3 },
  ];
  const W = 270, TOP = 190, H = 440;
  tanks.forEach((t) => {
    const id = uid('cl');
    D.defs.append(s('clipPath', { id }, [s('rect', { x: t.x, y: TOP, width: W, height: H, rx: 44 })]));
    D.layers.regions.append(s('rect', { x: t.x, y: TOP, width: W, height: H, rx: 44, style: 'fill:var(--surface);stroke:var(--line-2);stroke-width:3' }));
    t.fill = s('rect', { x: t.x, y: TOP, width: W, height: H, 'clip-path': `url(#${id})`, style: `fill:color-mix(in oklab, ${t.col} 55%, transparent)` });
    t.surf = s('rect', { x: t.x, y: TOP, width: W, height: 6, 'clip-path': `url(#${id})`, style: `fill:${t.col}` });
    D.layers.edges.append(t.fill, t.surf);
    txt(D, t.x + W / 2, 92, t.name, 54, 'font-weight:740;fill:var(--fg)', { anchor: 'middle' });
    txt(D, t.x + W / 2, 140, t.sub, 27, `fill:${t.col};font-weight:650`, { anchor: 'middle' });
    t.pct = txt(D, t.x + W / 2, TOP + H / 2 + 20, '100%', 60, 'font-weight:760;fill:var(--fg)', { anchor: 'middle' });
    t.stat = txt(D, t.x + W / 2, 700, '', 32, 'font-weight:720', { anchor: 'middle' });
  });
  const m = { v: 0 };
  const fmt = (v) => (v < 12 ? `${Math.round(v)} months` : `${(v / 12).toFixed(1)} years`);
  const paint = () => {
    tanks.forEach((t) => {
      const L = Math.max(0, 1 - m.v / t.life);
      const y = TOP + H * (1 - L);
      t.fill.setAttribute('y', y);
      t.fill.setAttribute('height', H * L);
      t.surf.setAttribute('y', y);
      t.surf.style.opacity = L > 0.005 ? 1 : 0;
      t.pct.textContent = `${Math.round(L * 100)}%`;
      const bad = m.v >= t.def;
      t.stat.textContent = bad ? 'deficiency' : 'stores OK';
      t.stat.style.fill = bad ? 'var(--inh)' : 'var(--act)';
    });
  };
  const sl = slider({ label: 'Months without intake', min: 0, max: 36, step: 1, value: 0, width: 360, fmt, onInput: (v) => { gsap.killTweensOf(m); m.v = v; paint(); } });
  ctrlBar(el, [sl], { left: 0, bottom: 0 });
  paint();
  return {
    step(n) {
      const to = [0, 6, 30][Math.min(2, n)];
      gsap.killTweensOf(m);
      gsap.to(m, { v: to, duration: 1.8, ease: 'power2.inOut', onUpdate: () => { sl.set(Math.round(m.v), false); paint(); } });
    },
    destroy: () => { gsap.killTweensOf(m); D.destroy(); },
  };
}

// 24 · Two B12 coenzymes: methyl transfer + carbon-skeleton rearrangement
function coenzymeViz(el) {
  const D = dg(el, 1712, 720);
  D.region({ x: 0, y: 0, w: 820, h: 720, r: 40, label: '1 · Methylcobalamin', labelColor: 'var(--ink)' });
  D.region({ x: 880, y: 0, w: 832, h: 720, r: 40, label: '2 · Deoxyadenosylcobalamin', labelColor: 'var(--ink)' });
  // Panel A
  D.node({ x: 410, y: 140, label: 'Methionine synthase', kind: 'enz', color: B12, size: 27, tip: { kicker: 'Coenzyme: methylcobalamin', title: 'Methionine synthase', body: 'Homocysteine + CH₃ → methionine. The CH₃ is carried by B₁₂ (B₁₂•CH₃ → B₁₂).', src: SRC(24) } });
  D.node({ id: 'mthf', x: 160, y: 270, label: 'N⁵-methyl-THF', kind: 'mol', color: FOL, size: 28 });
  D.node({ id: 'thf', x: 160, y: 580, label: 'THF', kind: 'mol', color: FOL, size: 28, w: 160 });
  D.node({ id: 'hcy', x: 668, y: 270, label: 'Homocysteine', kind: 'mol', color: 'var(--o2)', size: 28 });
  D.node({ id: 'met', x: 668, y: 580, label: 'Methionine', kind: 'mol', color: 'var(--act)', size: 28 });
  const b12n = D.node({ x: 410, y: 430, label: 'B₁₂', sub: 'carries the CH₃', kind: 'mol', color: B12, size: 34, w: 220 });
  D.arrow({ from: 'mthf', to: 'thf', width: 4, color: FOL });
  D.arrow({ from: 'hcy', to: 'met', width: 4, color: 'var(--act)' });
  const pA = hidePath(D, 'M230,290 C300,330 350,380 392,412 C450,380 560,320 640,300 C668,340 672,420 668,520');
  D.layers.edges.append(s('path', { d: pA.getAttribute('d'), style: 'fill:none;stroke:color-mix(in oklab, var(--a1) 55%, transparent);stroke-width:3;stroke-dasharray:4 10;stroke-linecap:round' }));
  txt(D, 410, 680, 'CH₃: methyl-THF → B₁₂ → homocysteine', 25, 'fill:var(--fg-2);font-weight:560', { anchor: 'middle' });
  const methyl = TOK.chip('CH₃', ONE, 76, 24)();
  methyl.style.opacity = 0;
  D.layers.labels.append(methyl);
  // Panel B: methylmalonyl-CoA → succinyl-CoA (H and –CO~SCoA swap)
  const cxB = 1296;
  const title = txt(D, cxB, 130, 'Methylmalonyl-CoA', 40, 'font-weight:720;fill:var(--fg)', { anchor: 'middle' });
  const C2 = [1210, 350], C3 = [1390, 350];
  const bond = (a, b) => D.layers.edges.append(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], style: 'stroke:var(--fg-3);stroke-width:5;stroke-linecap:round' }));
  bond([1080, 350], C2); bond(C2, C3);
  bond(C2, [1210, 262]); bond(C2, [1210, 440]); bond(C3, [1390, 262]); bond(C3, [1480, 350]); bond(C3, [1390, 440]);
  txt(D, 1074, 362, '⁻OOC', 32, 'font-weight:650;fill:var(--fg)', { anchor: 'end' });
  [C2, C3].forEach(([x, y]) => { D.layers.nodes.append(s('circle', { cx: x, cy: y, r: 30, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2' })); txt(D, x, y + 11, 'C', 32, 'font-weight:700;fill:var(--fg)', { anchor: 'middle' }); });
  const hAt = (x, y) => { const g = s('g', { transform: `translate(${x} ${y})` }); g.append(s('circle', { r: 22, style: 'fill:var(--bg);stroke:var(--line-2);stroke-width:2' })); const t = s('text', { y: 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:650' }); t.textContent = 'H'; g.append(t); D.layers.labels.append(g); return g; };
  hAt(1210, 248); hAt(1390, 248); hAt(1498, 350);
  const hMove = hAt(1390, 458);
  hMove.querySelector('circle').style.stroke = 'var(--a1)';
  hMove.querySelector('circle').style.strokeDasharray = '5 5';
  const coa = s('g', { transform: 'translate(1210 472)' });
  coa.append(s('rect', { x: -96, y: -28, width: 192, height: 56, rx: 16, style: 'fill:color-mix(in oklab, var(--a2) 18%, var(--bg));stroke:var(--a2);stroke-width:2.5;stroke-dasharray:6 5' }));
  const ct = s('text', { y: 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:27px;font-weight:700;fill:var(--a2)' });
  ct.textContent = 'CO~SCoA';
  coa.append(ct);
  D.layers.labels.append(coa);
  D.node({ x: cxB, y: 610, label: 'Methylmalonyl-CoA mutase', kind: 'enz', color: 'var(--a2)', size: 27, tip: { kicker: 'Coenzyme: deoxyadenosylcobalamin', title: 'Methylmalonyl-CoA mutase', body: 'Methylmalonyl-CoA → succinyl-CoA: an H and the –CO~SCoA group swap neighbouring carbons.<br><span style="color:var(--fg-3)">Textbook: without B₁₂, methylmalonyl-CoA builds up and methylmalonic acid rises — a specific marker of B₁₂ deficiency.</span>', src: SRC(24) } });
  txt(D, cxB, 676, 'coenzyme: 5′-deoxyadenosyl-B₁₂', 24, 'fill:var(--fg-2)', { anchor: 'middle' });
  let tlA = null, tlB = null;
  const runA = () => {
    tlA?.kill();
    const L = pA.getTotalLength();
    const o = { d: 0 };
    tlA = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
    tlA.set(methyl, { opacity: 1 })
      .to(o, { d: L * 0.42, duration: 1.4, ease: 'power2.inOut', onUpdate: () => { const p = pA.getPointAtLength(o.d); methyl.setAttribute('transform', `translate(${p.x} ${p.y})`); } })
      .call(() => { b12n.shape.style.stroke = 'var(--a1)'; }).to({}, { duration: 0.5 })
      .to(o, { d: L, duration: 1.6, ease: 'power2.inOut', onUpdate: () => { const p = pA.getPointAtLength(o.d); methyl.setAttribute('transform', `translate(${p.x} ${p.y})`); } })
      .call(() => { b12n.shape.style.stroke = ''; })
      .to(methyl, { opacity: 0, duration: 0.4 });
  };
  const resetB = () => { coa.setAttribute('transform', 'translate(1210 472)'); hMove.setAttribute('transform', 'translate(1390 458)'); title.textContent = 'Methylmalonyl-CoA'; };
  const runB = () => {
    tlB?.kill();
    resetB();
    const a = { t: 0 };
    tlB = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
    tlB.to({}, { duration: 0.8 })
      .to(a, { t: 1, duration: 1.8, ease: 'power2.inOut', onUpdate: () => {
        const t = a.t, arc = Math.sin(Math.PI * t);
        coa.setAttribute('transform', `translate(${1210 + 180 * t} ${472 + 70 * arc})`);
        hMove.setAttribute('transform', `translate(${1390 - 180 * t} ${458 - 50 * arc})`);
      } })
      .call(() => { title.textContent = 'Succinyl-CoA'; })
      .to({}, { duration: 2.2 })
      .call(() => { a.t = 0; resetB(); });
  };
  return {
    step(n) {
      if (n >= 1) { if (!tlA) runA(); } else { tlA?.kill(); tlA = null; methyl.style.opacity = 0; }
      if (n >= 2) { if (!tlB) runB(); } else { tlB?.kill(); tlB = null; resetB(); }
    },
    leave() { tlA?.pause(); tlB?.pause(); },
    enter() { tlA?.resume(); tlB?.resume(); },
    destroy() { tlA?.kill(); tlB?.kill(); D.destroy(); },
  };
}

// 25 · The folate trap
function folateTrapViz(el) {
  const D = dg(el, 1712, 720);
  D.node({ id: 'dietF', x: 420, y: 48, label: 'Diet · folic acid', kind: 'box', w: 270, h: 60, size: 25, color: FOL });
  D.node({ id: 'mthf', x: 420, y: 190, label: 'N⁵-methyl-THF', kind: 'mol', color: FOL, size: 32 });
  D.node({ id: 'thf', x: 420, y: 545, label: 'THF', kind: 'mol', color: FOL, size: 32, w: 190, tip: { kicker: 'Active form of folic acid', title: 'THF', body: 'Needed for purine and thymidine monophosphate (dTMP) synthesis.', src: SRC('27–28') } });
  D.node({ id: 'dna', x: 420, y: 668, label: 'DNA synthesis', sub: 'purines · dTMP', kind: 'box', w: 280, h: 82, size: 27, color: 'var(--a1)' });
  D.node({ id: 'mb12', x: 1200, y: 190, label: 'Methyl-B₁₂', kind: 'mol', color: B12, size: 32 });
  D.node({ id: 'b12', x: 1200, y: 545, label: 'B₁₂', kind: 'mol', color: B12, size: 32, w: 170 });
  D.node({ id: 'dietB', x: 1200, y: 672, label: 'Diet · B₁₂', kind: 'box', w: 210, h: 60, size: 25, color: B12 });
  D.node({ id: 'hcy', x: 1540, y: 190, label: 'Homocysteine', kind: 'mol', color: 'var(--o2)', size: 30 });
  D.node({ id: 'met', x: 1540, y: 545, label: 'Methionine', kind: 'mol', color: 'var(--act)', size: 30 });
  D.node({ x: 810, y: 262, label: 'Methionine synthase', kind: 'enz', color: B12, size: 26, tip: { kicker: 'Couples folate and B₁₂', title: 'Methionine synthase', body: 'Methyl-THF gives its CH₃ to B₁₂ (→ THF + methyl-B₁₂); methyl-B₁₂ gives it to homocysteine (→ methionine + B₁₂).', src: SRC(27) } });
  const aF = D.arrow({ d: 'M470,226 C640,280 700,330 810,360 C700,390 640,440 480,510', from: [470, 226], to: [480, 510], color: FOL, width: 5 });
  const aB = D.arrow({ d: 'M1150,510 C980,440 920,390 810,360 C920,330 980,280 1150,226', from: [1150, 510], to: [1150, 226], color: B12, width: 5 });
  const aR = D.arrow({ d: 'M1262,226 C1340,290 1340,430 1262,510', from: [1262, 226], to: [1262, 510], color: B12, width: 4 });
  const aHM = D.arrow({ from: 'hcy', to: 'met', width: 5, color: 'var(--act)' });
  const aDF = D.arrow({ from: 'dietF', to: 'mthf', width: 4, color: FOL, dash: '8 8' });
  const aTD = D.arrow({ from: 'thf', to: 'dna', width: 4, color: 'var(--a1)' });
  const aDB = D.arrow({ from: 'dietB', to: 'b12', width: 4, color: B12 });
  const ch3P = hidePath(D, 'M470,226 C640,280 700,330 810,360 C920,330 980,280 1150,226 L1262,226 C1320,272 1336,330 1330,368 L1540,368');
  // pools
  const pool = (y, col) => {
    D.layers.edges.append(s('rect', { x: 220, y: y - 60, width: 36, height: 120, rx: 18, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2' }));
    const f = s('rect', { x: 220, y: y + 60, width: 36, height: 0, rx: 18, style: `fill:${col}` });
    D.layers.nodes.append(f);
    txt(D, 238, y + 92, 'pool', 20, 'fill:var(--fg-3)', { anchor: 'middle' });
    return (lv, dur = 1.6) => gsap.to(f, { attr: { y: y + 60 - 120 * lv, height: 120 * lv }, duration: dur, ease: 'power2.inOut' });
  };
  const poolM = pool(190, FOL), poolT = pool(545, FOL);
  // deficiency marks
  const bar = (x, y, rot) => { const g = s('g', { transform: `translate(${x} ${y}) rotate(${rot})`, style: 'opacity:0' }); g.append(s('rect', { x: -40, y: -8, width: 80, height: 16, rx: 8, style: 'fill:var(--inh)' })); D.layers.labels.append(g); return g; };
  const barHub = bar(810, 360, 90), barDiet = bar(1200, 610, 0);
  const trap = txt(D, 950, 112, 'Folate trapped as N⁵-methyl-THF', 30, 'fill:var(--inh);font-weight:740', { anchor: 'middle' });
  const hcyUp = D.badge(1540, 96, '↑ Homocysteine', { color: 'var(--inh)', size: 25 });
  const cell = s('g', { transform: 'translate(650 668)' });
  const cC = s('circle', { r: 30, style: 'fill:color-mix(in oklab, var(--o2) 60%, transparent);stroke:var(--line-2);stroke-width:2' });
  const cN = s('circle', { r: 0, style: 'fill:color-mix(in oklab, var(--fadh) 50%, transparent);stroke:var(--fadh);stroke-width:2;stroke-dasharray:4 4' });
  const cP = s('circle', { r: 11, style: 'fill:color-mix(in oklab, var(--o2) 25%, var(--bg))' });
  cell.append(cC, cP, cN);
  D.layers.nodes.append(cell);
  const cellL = txt(D, 712, 678, 'normal RBCs', 26, 'fill:var(--fg-2);font-weight:650');
  [trap, hcyUp].forEach((e) => (e.style.opacity = 0));
  const fl = flowBank();
  const fFol = fl.add(D.flow(aDF, { count: 2, color: FOL, speed: 70, r: 9, autoplay: false }));
  const fCH3 = fl.add(tokenFlow(D, ch3P, { count: 3, speed: 150, make: TOK.chip('CH₃', ONE, 66, 21), layer: D.layers.labels }));
  const fTHF = fl.add(D.flow(aTD, { count: 2, color: 'var(--a1)', speed: 60, r: 9, autoplay: false }));
  const fB = fl.add(D.flow(aDB, { count: 1, color: B12, speed: 60, r: 9, autoplay: false }));
  const fRet = fl.add(D.flow(aR, { count: 2, color: B12, speed: 110, r: 9, autoplay: false }));
  const fHM = fl.add(D.flow(aHM, { count: 2, color: 'var(--act)', speed: 110, r: 9, autoplay: false }));
  let on = true;
  const set = (v) => {
    on = v;
    fl.run(v ? [fFol, fCH3, fTHF, fB, fRet, fHM] : [fFol]);
    poolM(v ? 0.45 : 1, v ? 1.2 : 2.6);
    poolT(v ? 0.7 : 0.06, v ? 1.2 : 2.6);
    gsap.to([barHub, barDiet], { opacity: v ? 0 : 1, duration: 0.4 });
    gsap.to([D.nodes.b12.g, D.nodes.mb12.g, aB.g, aR.g, aDB.g], { opacity: v ? 1 : 0.3, duration: 0.6 });
    gsap.to([D.nodes.thf.g, D.nodes.dna.g, aTD.g, aHM.g, D.nodes.met.g], { opacity: v ? 1 : 0.35, duration: 1.2, delay: v ? 0 : 0.8 });
    show([trap, hcyUp], !v, { delay: v ? 0 : 0.8 });
    gsap.to(cC, { attr: { r: v ? 30 : 48 }, duration: 1.4, delay: v ? 0 : 1 });
    gsap.to(cN, { attr: { r: v ? 0 : 28 }, duration: 1.4, delay: v ? 0 : 1 });
    gsap.to(cP, { attr: { r: v ? 11 : 0 }, duration: 1, delay: v ? 0 : 1 });
    gsap.to(cell, { attr: { transform: v ? 'translate(650 668)' : 'translate(668 668)' }, duration: 1.4, delay: v ? 0 : 1 });
    cellL.textContent = v ? 'normal RBCs' : 'megaloblastic anemia';
    cellL.style.fill = v ? 'var(--fg-2)' : 'var(--inh)';
    cellL.setAttribute('x', v ? 712 : 732);
  };
  const tg = toggle({ label: 'Vitamin B₁₂ available', on: true, onChange: set });
  ctrlBar(el, [tg], { right: 0, bottom: 0 });
  return { step: (n) => tg.set(n === 0), enter: () => set(on), leave: () => fl.pause(), destroy: () => { fl.destroy(); D.destroy(); } };
}

// 26 · B12 vs folate deficiency Venn
function vennViz(el) {
  const D = dg(el, 960, 860);
  const L = [345, 450], Rr = [615, 450], r = 305;
  const cL = s('circle', { cx: L[0], cy: L[1], r, style: `fill:color-mix(in oklab, ${FOL} 12%, transparent);stroke:${FOL};stroke-width:3` });
  const cR = s('circle', { cx: Rr[0], cy: Rr[1], r, style: `fill:color-mix(in oklab, ${B12} 12%, transparent);stroke:${B12};stroke-width:3` });
  D.layers.regions.append(cL, cR);
  txt(D, 150, 112, 'Folate deficiency', 32, `font-weight:740;fill:${FOL}`, { anchor: 'middle' });
  txt(D, 810, 112, 'B₁₂ deficiency', 32, `font-weight:740;fill:${B12}`, { anchor: 'middle' });
  const item = (x, y, lines, col, tipSpec, size = 30) => {
    const g = s('g', { 'data-tip': JSON.stringify(tipSpec) });
    lines.forEach((ln, i) => { const t = s('text', { x, y: y + i * (size * 1.18), 'text-anchor': 'middle', class: 'v-label', style: `font-size:${size}px;font-weight:680;fill:${col}` }); setRich(t, ln); g.append(t); });
    D.layers.labels.append(g);
    g.style.opacity = 0;
    return g;
  };
  const both = [
    item(480, 380, ['Megaloblastic', 'anemia'], 'var(--fg)', { kicker: 'Both deficiencies', title: 'Megaloblastic anemia', body: 'Folate is needed for thymidine; in B₁₂ deficiency folate is trapped (folate trap) — either way DNA synthesis fails.', src: SRC('17–18, 25, 28') }),
    item(480, 530, ['↑ Homo-', 'cysteine'], 'var(--fg)', { kicker: 'Both deficiencies', title: 'Hyperhomocysteinemia', body: 'Homocysteine cannot be remethylated to methionine. A risk factor for atherosclerosis.', src: SRC('17, 25') }),
  ];
  const b12only = [
    item(802, 360, ['Neuro-', 'psychiatric', 'symptoms'], B12, { kicker: 'B₁₂ only', title: 'Neuropsychiatric symptoms', body: 'Listed for B₁₂ deficiency, not for folate deficiency — the key clinical difference.<br><span style="color:var(--fg-3)">Textbook: linked to demyelination and methylmalonyl-CoA accumulation.</span>', src: SRC('17, 25') }, 28),
    item(802, 560, ['Pernicious', 'anemia'], B12, { kicker: 'B₁₂ only · cause', title: 'Pernicious anemia', body: 'B₁₂ malabsorption due to intrinsic-factor deficiency (autoimmune destruction of parietal cells, or gastrectomy).', src: SRC('25–26') }, 28),
  ];
  const folOnly = [item(158, 440, ['Neural tube', 'defects'], FOL, { kicker: 'Folate only', title: 'Neural tube defects', body: 'Spina bifida, anencephaly — prevented by folic acid before conception and in the first trimester.', src: SRC('17, 19') })];
  return {
    step(n) {
      show(both, n >= 1, { stagger: 0.12 });
      show(b12only, n >= 2, { stagger: 0.12 });
      show(folOnly, n >= 3);
      gsap.to(cL, { opacity: n === 2 ? 0.45 : 1, duration: 0.5 });
      gsap.to(cR, { opacity: n === 3 ? 0.45 : 1, duration: 0.5 });
    },
    destroy: () => D.destroy(),
  };
}

// 27 · Treatment + the folate-masking warning (schematic)
function treatViz(el) {
  const top = h('div', { style: 'position:absolute;left:0;top:0;width:960px;height:270px' });
  const bot = h('div', { style: 'position:absolute;left:0;top:300px;width:960px;height:560px' });
  el.append(top, bot);
  const D = dg(top, 960, 270);
  const card = (y, k, a, b, col, tipSpec) => {
    D.region({ x: 0, y, w: 960, h: 120, r: 30, fill: 'var(--surface)', tip: tipSpec });
    txt(D, 34, y + 48, k, 23, `fill:${col};${CAPS}`);
    txt(D, 34, y + 92, a, 32, 'font-weight:680;fill:var(--fg)');
    if (b) txt(D, 926, y + 92, b, 26, 'fill:var(--fg-2)', { anchor: 'end' });
  };
  card(0, 'Pernicious anemia', 'Lifelong B₁₂', 'IM cyanocobalamin (or high-dose oral)', B12, { kicker: 'Treatment', title: 'Pernicious anemia', body: 'Requires lifelong treatment with high-dose B₁₂ — oral or intramuscular cyanocobalamin.', src: SRC(26) });
  card(144, 'Megaloblastic anemia', 'Vitamin B₁₂ + folic acid', 'both, as taught', 'var(--a1)', { kicker: 'Treatment', title: 'Megaloblastic anemia', body: 'Treated with both vitamin B₁₂ and folic acid.', src: SRC(28) });
  const C = chart(bot, { w: 960, h: 560, pad: { l: 110, r: 210, t: 110, b: 70 }, x: { min: 0, max: 10, label: 'time on treatment →', ticks: false }, y: { min: 0, max: 1, label: 'severity · schematic', ticks: false }, grid: false });
  const CURVES = {
    none: { an: (t) => 0.55 + 0.03 * t, ne: (t) => 0.2 + 0.055 * t },
    fol: { an: (t) => 0.6 * Math.exp(-0.38 * t) + 0.1, ne: (t) => 0.2 + 0.062 * t },
    b12: { an: (t) => 0.6 * Math.exp(-0.38 * t) + 0.08, ne: (t) => 0.2 + 0.08 * (1 - Math.exp(-0.8 * t)) - 0.012 * t },
  };
  const lAn = C.line(CURVES.none.an, { color: 'var(--o2)', width: 7 });
  const lNe = C.line(CURVES.none.ne, { color: 'var(--fadh)', width: 7 });
  const mkL = (t, col) => { const e = s('text', { class: 'v-label', style: `font-size:27px;font-weight:700;fill:${col}` }); e.textContent = t; C.svg.append(e); return e; };
  const tAn = mkL('Anemia', 'var(--o2)'), tNe = mkL('Nerve damage', 'var(--fadh)');
  const placeLabels = (c) => {
    let ya = C.sy(c.an(10)), yn = C.sy(c.ne(10));
    if (Math.abs(ya - yn) < 34) { const m = (ya + yn) / 2, up = ya < yn ? -1 : 1; ya = m + up * 17; yn = m - up * 17; }
    tAn.setAttribute('x', C.sx(10) + 16); tAn.setAttribute('y', ya + 9);
    tNe.setAttribute('x', C.sx(10) + 16); tNe.setAttribute('y', yn + 9);
  };
  const warn = s('text', { x: 130, y: 150, class: 'v-label', style: 'font-size:27px;font-weight:740;fill:var(--inh);opacity:0' });
  warn.textContent = '⚠ Folic acid alone masks B₁₂ deficiency';
  C.svg.append(warn);
  const set = (m) => {
    const c = CURVES[m];
    lAn.update(c.an); lNe.update(c.ne);
    lAn.draw(1); lNe.draw(1.1, 0.15);
    placeLabels(c);
    gsap.fromTo([tAn, tNe], { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.9 });
    gsap.to(warn, { opacity: m === 'fol' ? 1 : 0, duration: 0.5 });
  };
  placeLabels(CURVES.none);
  const sg = seg({ options: [{ v: 'none', t: 'Untreated' }, { v: 'fol', t: 'Folic acid alone' }, { v: 'b12', t: 'B₁₂ + folic acid' }], value: 'none', onChange: set });
  tip(sg.el, { kicker: 'Safety point', title: 'Masking B₁₂ deficiency', body: 'Folic acid alone can correct the megaloblastic anemia while B₁₂-related nerve damage keeps progressing. Establish B₁₂ status or give B₁₂.' + TBK });
  ctrlBar(el, [sg], { left: 0, top: 292 });
  return { step: (n) => sg.set(['none', 'fol', 'b12'][Math.min(2, n)]), enter: () => { lAn.draw(1); lNe.draw(1.1, 0.15); }, destroy: () => D.destroy() };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                 */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Biochemistry, 9th ed., Ch 29 (pp 478–479) — iron; Ch 28 (pp 449–452) — folic acid &amp; vitamin B<sub>12</sub>',
    'Lecture slides: Iron, vitamin B<sub>12</sub> &amp; folic acid (L.53–L.55), Dr Vijaya Marakala, NUST',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.53 – L.55',
      title: 'Iron, B₁₂ &amp; <em>Folic Acid</em>',
      subtitle: 'Three nutrients every red cell depends on.',
      meta: ['Dr. Vijaya Marakala', 'Iron · folate · B₁₂', '12 learning outcomes'],
      notes: [
        'Three haematinic nutrients: iron builds heme; folate and B₁₂ let red-cell precursors copy their DNA.',
        'The model is real hemoglobin (PDB 4HHB): four globin chains, each holding a heme whose iron glows. Drag to rotate.',
        'Order follows the slides: iron (L.55) → folic acid (L.54) → vitamin B₁₂ (L.53).',
        'There is no clinical case in this lecture; the showpieces are iron absorption, the iron panel, one-carbon metabolism, the B₁₂ journey and the folate trap.',
      ],
      visual: heroViz,
    },
    {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'Specific learning outcomes',
      title: 'By the end, you can…',
      cards: [
        { big: 'Fe', k: 'L.55 · 3 outcomes', title: 'Iron', list: ['Sources &amp; RDA', 'Absorption, transport, storage', 'Iron overload'], tip: { kicker: 'Iron · L.55', title: 'Learning outcomes', list: ['L.55.1 Define different sources and recommended dietary allowance (RDA) of iron.', 'L.55.2 Describe the absorption, transport and storage of iron.', 'L.55.4 Discuss the biochemical alterations and clinical features of iron overload.'], src: 'Lecture slide 2 · Lippincott 9e Ch 29, pp 478–479' } },
        { big: 'B₉', k: 'L.54 · 4 outcomes', title: 'Folic acid', list: ['Sources, RDA, coenzymes', 'Absorption', 'Reactions it supports', 'Megaloblastic anemia &amp; NTDs'], tip: { kicker: 'Folic acid · L.54', title: 'Learning outcomes', list: ['L.54.1 List the sources, RDA and coenzyme forms of folic acid.', 'L.54.2 Outline mechanism of absorption.', 'L.54.3 Describe the reactions catalyzed by folic acid.', 'L.54.4 Explain the biochemical basis of megaloblastic anemia and neural tube defects resulting from folic acid deficiency.'], src: 'Lecture slide 12 · Lippincott 9e Ch 28, pp 449–450' } },
        { big: 'B₁₂', k: 'L.53 · 5 outcomes', title: 'Vitamin B₁₂', list: ['Sources, RDA, coenzymes', 'Absorption, transport, storage', 'Functions', 'Deficiency &amp; folate trap', 'Diagnostic tests'], tip: { kicker: 'Vitamin B₁₂ · L.53', title: 'Learning outcomes', list: ['L.53.1 List the sources, RDA and coenzyme forms of B₁₂.', 'L.53.2 Outline absorption, transport and storage of vitamin B₁₂.', 'L.53.3 Explain functions of vitamin B₁₂.', 'L.53.4 Describe deficiency manifestations of vitamin B₁₂ and folate trap.', 'L.53.5 Interpret diagnostic tests for megaloblastic and pernicious anemias.'], src: 'Lecture slide 20 · Lippincott 9e Ch 28, pp 450–452' } },
      ],
      notes: [
        'Hover each card for the verbatim SLO wording.',
        'The iron list jumps from L.55.2 to L.55.4 — L.55.3 is missing on the slide, yet iron-deficiency anemia and the lab panel are still taught (slides 8, 10–11).',
        'References: Lippincott 9e Ch 29 (pp 478–479) for iron; Ch 28 (pp 449–452) for folate and B₁₂.',
      ],
    },
    {
      layout: 'statement',
      eyebrow: 'Part 1 · Iron · L.55',
      title: '<em>Iron</em>',
      subtitle: 'Taken in through the gut. Barely lost again.',
      src: 'Lecture slides 2–11',
      notes: [
        'Iron exists as ferrous Fe²⁺ and ferric Fe³⁺ — the two forms swap repeatedly during absorption and transport.',
        'Three outcomes: sources & RDA, absorption/transport/storage, iron overload (hover the chips).',
        'Big idea: the body barely excretes iron, so what is absorbed is what is kept.',
      ],
      visual: (el) => dividerViz(el, {
        num: '26', sym: 'Fe', name: 'Iron',
        orbit: [{ t: 'Fe²⁺', col: FE2, w: 80 }, { t: 'Fe³⁺', col: FE3, w: 80 }],
        gap: 480,
        chips: [
          { t: 'L.55.1 · Sources & RDA', tip: { title: 'L.55.1', body: 'Define different sources and recommended dietary allowance (RDA) of iron.' } },
          { t: 'L.55.2 · Absorption & storage', tip: { title: 'L.55.2', body: 'Describe the absorption, transport and storage of iron.' } },
          { t: 'L.55.4 · Iron overload', tip: { title: 'L.55.4', body: 'Discuss the biochemical alterations and clinical features of iron overload.' } },
        ],
      }),
    },
    {
      eyebrow: 'Body iron · RDA',
      title: 'How much <em>iron</em>?',
      bullets: [
        { t: 'Adult body: <b>3–4 g</b> iron', tip: { title: 'Adult body iron', body: '3 to 4 g in total.<br><span style="color:var(--fg-3)">The slide gives no breakdown; textbooks put roughly two-thirds in hemoglobin.</span>', src: SRC(3) } },
        { t: '<b>Heme</b>: Hb, myoglobin, cytochromes', step: 1, tip: { title: 'Heme iron compounds', body: 'Hemoglobin, myoglobin, cytochromes.', src: SRC(3) } },
        { t: '<b>Non-heme</b>: Fe-S, transferrin, ferritin', step: 1, tip: { title: 'Non-heme iron compounds', body: 'Iron–sulphur proteins, transferrin, ferritin.', src: SRC(3) } },
        { t: 'RDA <b>10–20 mg</b>/day · pregnancy <b>40</b>', step: 2, tip: { title: 'RDA (as taught)', body: 'Adult 10–20 mg/day; pregnancy 40 mg/day.<br><span style="color:var(--fg-3)">Values differ between authorities (e.g. US RDA: 8 mg men, 18 mg women, 27 mg pregnancy). Use the lecture figures for this course.</span>', src: SRC(3) } },
      ],
      steps: 2,
      src: SRC(3),
      notes: [
        'Adult body iron is 3–4 g in total.',
        'Build 1 — heme iron: hemoglobin, myoglobin, cytochromes. Non-heme iron: Fe-S proteins, transferrin, ferritin.',
        'Build 2 — RDA as taught: adult 10–20 mg/day; pregnancy 40 mg/day.',
        'RDA values vary by authority (US: 8 / 18 / 27 mg) — use the lecture values in this exam.',
      ],
      visual: bodyIronViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Dietary sources',
      title: 'Heme vs <em>non-heme</em> iron',
      cards: [
        { k: 'Animal sources', title: 'Heme iron', list: ['Liver', 'Meat'], body: '<b>Better</b> absorbed', viz: (v) => sourceMini(v, 'heme'), tip: { kicker: 'Animal sources', title: 'Heme iron', body: 'Liver, meat — heme iron is better absorbed.', list: ['The slide also lists <b>egg</b> here, but egg-yolk iron is mostly non-heme (bound to phosvitin) and poorly absorbed (textbook) — not a reliable heme example.'], src: SRC(3) } },
        { k: 'Plant sources', title: 'Non-heme iron', list: ['Green leafy vegetables', 'Cereals', 'Pulses'], body: '<b>Less</b> absorbed — phytates, oxalates', viz: (v) => sourceMini(v, 'non'), tip: { kicker: 'Plant sources', title: 'Non-heme iron', body: 'Green leafy vegetables, cereals, pulses. Less absorbed because of phytates and oxalates.', src: SRC(3) } },
      ],
      notes: [
        'Heme iron comes from animal foods (liver, meat) and is better absorbed.',
        'Non-heme iron comes from plants (green leafy vegetables, cereals, pulses); phytates and oxalates bind it, so less is absorbed.',
        'The slide also lists egg under heme iron — egg-yolk iron is mostly non-heme and poorly absorbed (textbook); avoid relying on that example.',
        'Animations: heme crosses freely; plant iron is caught by phytate/oxalate cages.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Factors affecting absorption',
      title: 'Turning absorption <em>up or down</em>',
      bullets: [{ t: 'Reduce &amp; acidify → more' }, { t: 'Bind or neutralise → less' }],
      steps: 2,
      src: 'Lecture slides 3–4 · gauge schematic (direction only)',
      notes: [
        'Build 1 — increase: ferrous form, ascorbic acid, cysteine, HCl. Common theme: keep iron reduced (Fe²⁺) and soluble.',
        'Build 2 — decrease: phytates and phosphate, oxalates (slide 3), antacids/achlorhydria, gastrointestinal diseases.',
        'Click any chip to combine factors; the gauge shows direction only.',
        'Clinical link: antacid users, achlorhydria and GI disease all predispose to iron deficiency.',
      ],
      visual: factorsViz,
    },
    {
      layout: 'full',
      eyebrow: 'Absorption · transport',
      title: 'Iron’s path into <em>blood</em>',
      bullets: [{ t: 'Fe²⁺ crosses the gut' }, { t: 'Fe³⁺ rides transferrin' }],
      steps: 5,
      src: 'Lecture slide 5 · Dcytb, hephaestin, hepcidin are textbook extras (tips only)',
      notes: [
        'Build 1 — non-heme Fe³⁺ is reduced to Fe²⁺ (vitamin C), then enters through DMT-1.',
        'Build 2 — heme enters intact through HCP (heme carrier protein); Fe²⁺ is released inside the cell.',
        'Build 3 — iron can be stored in the cell as ferritin (up to 4500 Fe³⁺)…',
        'Build 4 — …or exported into blood through ferroportin. (The slide routes everything via ferritin; in reality iron is either stored or exported.)',
        'Build 5 — ceruloplasmin oxidises Fe²⁺ → Fe³⁺; transferrin carries Fe³⁺ to tissues.',
        'Textbook extras in the tips: Dcytb reduces Fe³⁺ at the brush border, hephaestin oxidises iron at the basolateral side, hepcidin degrades ferroportin.',
      ],
      visual: absorptionViz,
    },
    {
      eyebrow: 'Storage · excretion',
      title: 'Stored well, barely <em>lost</em>',
      bullets: [
        { t: '<b>Sites</b>: liver, intestine, spleen, marrow', tip: { title: 'Storage sites', body: 'Liver, intestine, spleen, bone marrow.', src: SRC(6) } },
        { t: 'Stored as <b>ferritin</b> &amp; <b>hemosiderin</b>', tip: { title: 'Storage forms', body: 'Ferritin and hemosiderin.<br><span style="color:var(--fg-3)">Textbook: ferritin is soluble and readily released; hemosiderin is insoluble and released slowly.</span>', src: SRC(6) } },
        { t: '“One-way element”: <b>~1 mg/day</b> lost', tip: { title: 'Iron is a “one way element”', body: 'Very little iron is excreted — about 1 mg/day, of which 0.7 mg/day is in stool.', src: SRC(7) } },
        { t: 'Menses <b>20–30 mg</b> · delivery <b>750 mg</b>', step: 1, tip: { title: 'Physiological loss', body: 'Menstruation 20–30 mg per cycle; delivery 750 mg.', src: SRC(7) } },
      ],
      steps: 2,
      src: 'Lecture slides 6–7 · day-equivalents = loss ÷ ~1 mg/day',
      notes: [
        'Storage sites: liver, intestine, spleen, bone marrow. Storage forms: ferritin and hemosiderin.',
        'Iron is a “one-way element”: very little is excreted — about 1 mg/day, 0.7 mg/day of it in stool.',
        'Build 1 — a menstrual cycle costs 20–30 mg; Build 2 — a delivery costs 750 mg.',
        'Each dot is 1 mg: one delivery ≈ two years of normal daily losses — why women need more iron.',
      ],
      visual: storeLossViz,
    },
    {
      eyebrow: 'Disorders of iron',
      title: 'Too little, too <em>much</em>',
      bullets: [
        { t: 'Deficiency → <b>microcytic hypochromic</b> anemia', tip: { title: 'Iron deficiency', body: 'Microcytic hypochromic anemia.', src: SRC(8) } },
        { t: 'Red cells: <b>small</b> and <b>pale</b>', tip: { title: 'Blood smear', body: 'Slide 8 contrasts normal RBCs with small, pale RBCs.', src: SRC(8) } },
        { t: 'Excess → <b>hemosiderosis</b>, <b>hemochromatosis</b>', tip: { title: 'Iron excess', body: 'Hemosiderosis or hemochromatosis — next slide.', src: SRC(8) } },
      ],
      steps: 1,
      src: 'Lecture slide 8 · 3D cells schematic',
      notes: [
        'Iron deficiency → microcytic hypochromic anemia: small, pale red cells (slide 8 smear).',
        'Build 1 (or the switch) shrinks and pales the cells.',
        'Iron excess → hemosiderosis or hemochromatosis — next slide.',
        'On the iron panel, ↓ ferritin is the most specific marker of depleted stores.',
      ],
      visual: rbcIronViz,
    },
    {
      eyebrow: 'Iron overload · L.55.4',
      title: 'When iron <em>accumulates</em>',
      bullets: [
        { t: '<b>Hemosiderosis</b>: ↑ stores, no injury', tip: { title: 'Hemosiderosis', body: 'Increase in iron stores as hemosiderin, without associated tissue injury.', src: SRC(9) } },
        { t: '<b>Hemochromatosis</b>: tissue injury', step: 1, tip: { title: 'Hemochromatosis', body: 'Excessive deposition of iron in tissue, associated with tissue injury.<br>Hereditary form: <b>autosomal recessive</b>, mutations in the <b>HFE</b> gene.', src: SRC(9) } },
        { t: '<b>Bronze diabetes</b> · liver, pancreas, heart', step: 2, tip: { title: 'Bronze diabetes', body: 'Hyperpigmentation + hyperglycemia. Damage to liver, pancreas and heart.', src: SRC(9) } },
        { t: 'Treat: <b>phlebotomy</b>, iron chelators', step: 3, tip: { title: 'Treatment', body: 'Phlebotomy; iron chelators.', src: SRC(9) } },
      ],
      steps: 3,
      src: 'Lecture slides 8–9 · body map schematic',
      notes: [
        'Hemosiderosis: increase in iron stores as hemosiderin, without tissue injury.',
        'Build 1 — hemochromatosis: excessive iron deposited in tissues, with injury. Hereditary form: autosomal recessive, HFE gene mutations.',
        'Build 2 — bronze diabetes = hyperpigmentation + hyperglycemia; damage to liver, pancreas and heart.',
        'Build 3 — treatment: phlebotomy and iron chelators.',
      ],
      visual: overloadViz,
    },
    {
      layout: 'full',
      eyebrow: 'Lab investigations',
      title: 'Reading the <em>iron panel</em>',
      bullets: [{ t: 'Ferritin ↓ = most specific' }, { t: 'TSAT = Fe ÷ TIBC × 100' }],
      steps: 2,
      src: 'Lecture slides 10–11 · preset values illustrative · serum iron in µg/dL (slide’s “µmol/dL” should read µmol/L)',
      notes: [
        'Four tests: serum iron, ferritin, TIBC, transferrin saturation (reference ranges from slide 10).',
        'Build 1 — iron deficiency: ↓ iron, ↓ ferritin (most specific), ↑ TIBC, ↓ saturation. Build 2 — overload: the mirror image.',
        'TSAT = serum iron ÷ TIBC × 100 — drag the sliders (e.g. 100 ÷ 400 = 25 %, normal).',
        'Unit flag: the slide prints serum iron as 11–32 µmol/dL; the correct unit is µmol/L (≈ 60–180 µg/dL). The calculator uses µg/dL so both inputs share a unit.',
        'Hover each test name for the full increased-in / decreased-in lists from slide 11.',
      ],
      visual: labsViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Part 2 · Folic acid · L.54',
      title: '<em>Folic acid</em>',
      subtitle: 'Vitamin B₉ — the carrier of one-carbon units.',
      src: 'Lecture slides 12–19',
      notes: [
        'Folic acid = vitamin B₉; its active coenzyme is tetrahydrofolate (THF).',
        'Four outcomes: sources/RDA/coenzymes, absorption, reactions, deficiency (megaloblastic anemia, neural tube defects).',
        'The lecture teaches folate before B₁₂ — the folate trap needs folate first.',
      ],
      visual: (el) => dividerViz(el, {
        num: '', sym: 'B_{9}', name: 'Folic acid', symSize: 96, symY: 4, symDx: -8,
        orbit: [{ t: 'THF', col: FOL, w: 80 }, { t: '–CH₃', col: ONE, w: 86 }],
        gap: 372,
        chips: [
          { t: 'L.54.1 · Sources, RDA', tip: { title: 'L.54.1', body: 'List the sources, RDA and coenzyme forms of folic acid.' } },
          { t: 'L.54.2 · Absorption', tip: { title: 'L.54.2', body: 'Outline mechanism of absorption.' } },
          { t: 'L.54.3 · Reactions', tip: { title: 'L.54.3', body: 'Describe the reactions catalyzed by folic acid.' } },
          { t: 'L.54.4 · Deficiency', tip: { title: 'L.54.4', body: 'Explain the biochemical basis of megaloblastic anemia and neural tube defects resulting from folic acid deficiency.' } },
        ],
      }),
    },
    {
      eyebrow: 'Structure',
      title: 'Three parts, one <em>vitamin</em>',
      bullets: [
        { t: '<b>Pteridine</b> ring', tip: { title: 'Pteridine nucleus', body: 'Bicyclic ring (positions 1–8) — the part that is reduced to DHF and THF.', src: SRC(13) } },
        { t: '<b>PABA</b> · p-aminobenzoic acid', tip: { title: 'p-Aminobenzoic acid', body: 'Links the pteridine (via C9–N10) to glutamate.', src: SRC(13) } },
        { t: '<b>Glutamate</b> · one or more', tip: { title: 'Glutamate', body: 'One or more glutamate residues (polyglutamate, “n” on the slide).', src: SRC(13) } },
      ],
      focus: true,
      steps: 3,
      src: 'Lecture slide 13 · real 3D structure (PubChem)',
      notes: [
        'Folic acid = pteridine nucleus + p-aminobenzoic acid (PABA) + glutamate.',
        'Press → to light each part on the real 3D structure.',
        'The glutamate tail can repeat (polyglutamate, “n” on the slide).',
        'Methotrexate keeps this same skeleton — that is why it fits DHFR (two slides on).',
      ],
      visual: folateStructViz,
    },
    {
      eyebrow: 'Sources · RDA · absorption',
      title: 'From plate to <em>liver</em>',
      bullets: [
        { t: 'RDA <b>400 µg</b>/day — greens, pulses, eggs, liver', tip: { title: 'RDA and sources', body: 'RDA 400 µg/day. Sources: green leafy vegetables, pulses, eggs, liver.', src: SRC(13) } },
        { t: 'Absorbed in the <b>upper jejunum</b>', step: 1, tip: { title: 'Site of absorption', body: 'Absorbed mainly in the upper jejunum.<br><span style="color:var(--fg-3)">Textbook: duodenum and proximal jejunum, after polyglutamates are trimmed to monoglutamate.</span>', src: SRC(14) } },
        { t: '<b>β-globulins</b> carry it; liver activates it', step: 2, tip: { title: 'Transport and activation', body: 'Transported by β-globulins in blood; converted into active coenzyme forms in the liver.', src: SRC(14) } },
        { t: 'Limited stores → <b>rapid</b> deficiency', step: 3, tip: { title: 'Storage', body: '“Limited [No] tissue storage; deficiency can develop rapidly.”<br><span style="color:var(--fg-3)">“No storage” overstates it: the liver holds a few months’ supply (textbook).</span>', src: SRC(14) } },
      ],
      steps: 3,
      src: 'Lecture slides 13–14',
      notes: [
        'RDA 400 µg/day. Sources: green leafy vegetables, pulses, eggs, liver.',
        'Build 1 — absorbed mainly in the upper jejunum.',
        'Build 2 — carried in blood by β-globulins; converted to active coenzyme forms in the liver.',
        'Build 3 — limited tissue storage, so deficiency develops rapidly — contrast B₁₂’s years of reserve.',
      ],
      visual: folateJourneyViz,
    },
    {
      layout: 'full',
      eyebrow: 'Active form · L.54.3',
      title: 'Two reductions to <em>THF</em>',
      bullets: [{ t: 'DHFR uses NADPH' }, { t: 'Methotrexate blocks it' }],
      steps: 1,
      src: SRC(15),
      notes: [
        'Folic acid → dihydrofolate → tetrahydrofolate (THF): two reductions, both by dihydrofolate reductase, each using NADPH + H⁺.',
        'THF is the active coenzyme: one-carbon metabolism, cell division, keeping plasma homocysteine low.',
        'Build 1 / toggle — methotrexate, a folic-acid analogue, competitively inhibits DHFR at both steps → no THF → dividing cells stall.',
        'Uses: psoriasis, rheumatoid arthritis, neoplastic diseases (the low-dose tablet on the slide is taken once weekly).',
      ],
      visual: dhfrViz,
    },
    {
      eyebrow: 'Drug link · methotrexate',
      title: 'A near-perfect <em>mimic</em>',
      bullets: [
        { t: 'Methotrexate: a <b>folic acid analogue</b>', tip: { title: 'Folic acid analogue', body: 'Same pteridine–PABA–glutamate skeleton as folic acid.', src: SRC(15) } },
        { t: '<b>Competitively</b> inhibits DHFR', tip: { title: 'Competitive inhibition', body: 'Competes with folate for the active site of dihydrofolate reductase.', src: SRC(15) } },
        { t: 'Only two spots differ (gold)', tip: { title: 'The differences', body: 'C4 carries –NH₂ instead of =O, and N¹⁰ carries a methyl group.<br><span style="color:var(--fg-3)">Read from the structures; not stated on the slide.</span>' } },
        { t: 'Psoriasis · RA · cancers', tip: { title: 'Clinical uses', body: 'Psoriasis, rheumatoid arthritis and neoplastic diseases.', src: SRC(15) } },
      ],
      src: 'Lecture slide 15 · real 3D structures (PubChem)',
      notes: [
        'Top: folic acid. Bottom: methotrexate — real 3D structures.',
        'They differ at two spots (highlighted): C4 carries –NH₂ instead of =O, and N¹⁰ carries a methyl group.',
        'Same overall shape → binds the DHFR active site and competes with folate (competitive inhibition).',
        'Clinical: psoriasis, rheumatoid arthritis, cancers.',
      ],
      visual: mtxMimicViz,
    },
    {
      layout: 'full',
      eyebrow: 'One-carbon metabolism',
      title: 'THF carries single <em>carbons</em>',
      bullets: [{ t: 'On N⁵, N¹⁰ or both' }, { t: 'Click a derivative' }],
      steps: 3,
      src: 'Lecture slides 15–16 · THF real 3D; attached units schematic',
      notes: [
        'THF carries one-carbon units on N⁵, on N¹⁰, or bridged across both.',
        'Build 1 — N¹⁰-formyl THF → purine nucleotide synthesis.',
        'Build 2 — N⁵,N¹⁰-methylene THF → thymidine monophosphate (dTMP) and serine from glycine.',
        'Build 3 — N⁵-methyl THF → methionine from homocysteine (needs B₁₂ — the folate trap).',
        'Six units carried: formyl, formimino, methenyl, methylene, hydroxymethyl, methyl. Full detail in the protein-metabolism lecture.',
      ],
      visual: oneCarbonViz,
    },
    {
      eyebrow: 'Folate deficiency · macrocytic anemia',
      title: 'Why the cells grow <em>big</em>',
      bullets: [
        { t: 'DNA synthesis <b>slows</b> (no thymidine)', tip: { title: 'Folate is required for DNA synthesis', body: 'Folate is essential to form thymidine, a DNA nucleotide. Without it DNA replication becomes slow and defective.', src: SRC(18) } },
        { t: 'Nucleus matures <b>slowly</b>', tip: { title: 'Nuclear maturation delayed', body: 'RBC precursors cannot divide normally; the nucleus matures slowly and stays immature.', src: SRC(18) } },
        { t: 'Cytoplasm keeps <b>growing</b>', tip: { title: 'Cytoplasmic growth continues', body: 'RNA and protein synthesis are relatively unaffected, so the cytoplasm grows while the nucleus lags.', src: SRC(18) } },
        { t: 'Big, immature <b>megaloblasts</b>', tip: { title: 'Megaloblastic (macrocytic) anemia', body: 'Large cells with immature nuclei → large red cells.', src: SRC('17–18') } },
      ],
      focus: true,
      steps: 4,
      src: 'Lecture slides 17–18 · cells schematic',
      notes: [
        'Folate is needed to make thymidine, a DNA nucleotide.',
        'Build 1 — without it DNA replication is slow and defective.',
        'Build 2 — red-cell precursors cannot divide normally: the nucleus matures slowly and stays immature.',
        'Build 3 — RNA and protein synthesis are relatively unaffected, so the cytoplasm keeps growing.',
        'Build 4 — result: large cells with immature nuclei (megaloblasts) → macrocytic anemia. Same picture in B₁₂ deficiency via the folate trap.',
      ],
      visual: megaloViz,
    },
    {
      eyebrow: 'Folate deficiency · pregnancy',
      title: 'Closing the <em>neural tube</em>',
      bullets: [
        { t: 'Tube closes in <b>early pregnancy</b>', tip: { title: 'Neural tube development', body: 'Folate is essential for normal fetal neural tube development during early pregnancy.', src: SRC(19) } },
        { t: '<b>Spina bifida</b> · <b>anencephaly</b>', step: 1, tip: { title: 'Neural tube defects', list: ['<b>Spina bifida</b> — spine and spinal canal do not close completely.', '<b>Anencephaly</b> — born without parts of the brain and skull.'], src: SRC(19) } },
        { t: 'Supplement <b>before conception</b> → 1st trimester', step: 2, tip: { title: 'Prevention', body: 'Folic acid supplementation before conception and during the first trimester significantly reduces the risk of neural tube defects.', src: SRC(19) } },
        { t: 'Deficiency also: <b>↑ homocysteine</b>', step: 2, tip: { title: 'Hyperhomocysteinemia', body: 'Listed as the third folate-deficiency disorder: without N⁵-methyl-THF, homocysteine is not converted to methionine.', src: SRC('15, 17') } },
      ],
      steps: 2,
      src: 'Lecture slides 17, 19 · timeline schematic',
      notes: [
        'Folate is essential for normal neural tube development in early pregnancy.',
        'Build 1 — defects: spina bifida (spine and spinal canal do not close completely) and anencephaly (born without parts of brain and skull).',
        'Build 2 — folic acid before conception and through the first trimester significantly reduces the risk.',
        'Folate deficiency also raises plasma homocysteine (hyperhomocysteinemia).',
        'The slide says only “early pregnancy”; the timeline is schematic.',
      ],
      visual: ntdViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Part 3 · Vitamin B₁₂ · L.53',
      title: 'Vitamin <em>B₁₂</em>',
      subtitle: 'Cobalt at its core. Stored for years.',
      src: 'Lecture slides 20–30',
      notes: [
        'Vitamin B₁₂ (cobalamin) is built around a cobalt atom.',
        'Five outcomes: sources/RDA/coenzymes, absorption/transport/storage, functions, deficiency & folate trap, diagnostic tests.',
        'Two features set it apart: it needs intrinsic factor to be absorbed, and the liver stores years of it.',
      ],
      visual: (el) => dividerViz(el, {
        num: '27', sym: 'Co', name: 'Cobalt',
        orbit: [{ t: 'CH₃–Co', col: B12, w: 104 }, { t: 'Ado–Co', col: 'var(--a2)', w: 104 }],
        gap: 300, chipSize: 22,
        chips: [
          { t: 'L.53.1 · Sources', tip: { title: 'L.53.1', body: 'List the sources, RDA and coenzyme forms of B₁₂.' } },
          { t: 'L.53.2 · Absorption', tip: { title: 'L.53.2', body: 'Outline absorption, transport and storage of vitamin B₁₂.' } },
          { t: 'L.53.3 · Functions', tip: { title: 'L.53.3', body: 'Explain functions of vitamin B₁₂.' } },
          { t: 'L.53.4 · Deficiency', tip: { title: 'L.53.4', body: 'Describe deficiency manifestations of vitamin B₁₂ and folate trap.' } },
          { t: 'L.53.5 · Diagnosis', tip: { title: 'L.53.5', body: 'Interpret diagnostic tests for megaloblastic and pernicious anemias.' } },
        ],
      }),
    },
    {
      eyebrow: 'Structure · sources · RDA',
      title: 'A cobalt <em>corrin</em> ring',
      bullets: [
        { t: '<b>Corrin ring</b> + central <b>cobalt</b>', tip: { title: 'Structure', body: 'Corrin ring linked to a cobalt atom in the centre (Co³⁺ on the slide).', src: SRC(21) } },
        { t: '<b>Animal</b> foods only', tip: { title: 'Sources', body: 'Animal origin: liver, meat, eggs, milk, dairy products, fish. Small amounts are made by intestinal flora.<br><span style="color:var(--fg-3)">Textbook: colonic bacterial B₁₂ is made beyond the ileum and is largely not absorbed.</span>', src: SRC(21) } },
        { t: 'RDA <b>1–2 µg</b>/day', tip: { title: 'RDA (as taught)', body: '1–2 µg/day.<br><span style="color:var(--fg-3)">US RDA is 2.4 µg/day for adults.</span>', src: SRC(21) } },
        { t: 'Coenzymes: <b>methyl-</b> &amp; <b>deoxyadenosyl-</b>', tip: { title: 'Coenzyme forms', list: ['Methylcobalamin — methionine synthase', 'Deoxyadenosylcobalamin — methylmalonyl-CoA mutase'], src: SRC(24) } },
      ],
      steps: 2,
      src: 'Lecture slides 21, 24 · 3D model stylised from the real atom connectivity',
      notes: [
        'Corrin ring with a cobalt atom at the centre (Co³⁺ on the slide).',
        'Sources are animal only: liver, meat, eggs, milk, dairy, fish. Intestinal flora make small amounts — but colonic B₁₂ is largely not absorbed (textbook).',
        'RDA 1–2 µg/day as taught (US RDA 2.4 µg).',
        'Builds 1–2 — swap the upper ligand: cyano- (drug form), methyl- and 5′-deoxyadenosyl-cobalamin (the two coenzymes).',
        'The model uses the real corrin connectivity; side-chain angles are stylised; lower ligand dimethylbenzimidazole.',
      ],
      visual: b12StructViz,
    },
    {
      layout: 'full',
      eyebrow: 'Absorption · transport · storage',
      title: 'B₁₂ needs an <em>escort</em>',
      bullets: [{ t: 'IF → ileum → TC II → liver' }, { t: 'Toggle pernicious anemia' }],
      steps: 5,
      src: 'Lecture slides 22–23, 26 · haptocorrin & cubilin are textbook extras (tips)',
      notes: [
        'Build 1 — gastric parietal cells make intrinsic factor (IF); B₁₂ binds IF to form the B₁₂–IF complex.',
        'Build 2 — the complex is absorbed in the ileum; inside the cell IF is released (degraded).',
        'Build 3 — B₁₂ is handed to transcobalamin II (TC II) for plasma transport.',
        'Build 4 — the liver stores 2–5 mg (2–3 years).',
        'Build 5 — pernicious anemia: autoimmune destruction of parietal cells (or gastrectomy) → no IF → B₁₂ is lost in the stool; liver stores slowly drain.',
        'Textbook extras: in the stomach B₁₂ first binds haptocorrin (R-binder); pancreatic proteases free it to bind IF; the ileal receptor is cubilin.',
      ],
      visual: b12JourneyViz,
    },
    {
      eyebrow: 'Storage',
      title: 'Years of <em>reserve</em>',
      bullets: [
        { t: '<b>Liver</b> stores it — rare for water-soluble', tip: { title: 'Stored in the liver', body: 'Unlike other water-soluble vitamins, B₁₂ is stored in the liver.', src: SRC(23) } },
        { t: 'About <b>2–5 mg</b> in store', tip: { title: 'Liver content', body: 'About 2 mg to 5 mg of B₁₂.', src: SRC(23) } },
        { t: 'Lasts <b>2–3 years</b>', tip: { title: 'Duration', body: 'Sufficient for 2–3 years (lecture).<br><span style="color:var(--fg-3)">Textbooks often quote 3–5 years.</span>', src: SRC(23) } },
        { t: 'Folate: limited — <b>rapid</b> deficiency', tip: { title: 'Contrast with folate', body: 'Limited tissue storage — deficiency can develop rapidly.', src: SRC(14) } },
      ],
      steps: 2,
      src: 'Lecture slides 14, 23 · drain rates schematic',
      notes: [
        'Unlike other water-soluble vitamins, B₁₂ is stored in the liver: about 2–5 mg, enough for 2–3 years (textbooks often say 3–5).',
        'Folate has limited stores, so deficiency appears rapidly.',
        'Builds — after 6 months folate is gone; B₁₂ runs low only after 2–3 years. Drag the slider yourself.',
        'Clinical consequence: B₁₂ deficiency from diet or IF loss takes years to show.',
      ],
      visual: reserveViz,
    },
    {
      layout: 'full',
      eyebrow: 'Functions · coenzyme forms',
      title: 'Two <em>coenzymes</em>, two jobs',
      bullets: [{ t: 'Methyl transfer' }, { t: 'Carbon-skeleton swap' }],
      steps: 2,
      src: 'Lecture slide 24 · methyl donor N⁵-methyl-THF from slide 27',
      notes: [
        'Build 1 — methylcobalamin is the coenzyme of methionine synthase: homocysteine + CH₃ → methionine.',
        'The CH₃ comes from N⁵-methyl-THF, regenerating THF (link to the folate trap).',
        'Build 2 — deoxyadenosylcobalamin is the coenzyme of methylmalonyl-CoA mutase: methylmalonyl-CoA → succinyl-CoA.',
        'Watch the swap: an H and the –CO~SCoA group trade places on neighbouring carbons.',
        'Textbook link (not on slides): without this enzyme methylmalonic acid builds up — a specific marker of B₁₂ deficiency.',
      ],
      visual: coenzymeViz,
    },
    {
      layout: 'full',
      eyebrow: 'Deficiency · folate trap',
      title: 'The folate <em>trap</em>',
      bullets: [{ t: 'No B₁₂ → stuck as methyl-THF' }, { t: 'Toggle B₁₂' }],
      steps: 1,
      src: 'Lecture slides 27–28 · pool levels schematic',
      notes: [
        'Methionine synthase couples two transfers: N⁵-methyl-THF → B₁₂ (gives THF + methyl-B₁₂), then methyl-B₁₂ → homocysteine (gives methionine).',
        'Build 1 / switch — B₁₂ deficiency: methyl-THF cannot be converted back to THF.',
        'Folate is trapped as methyl-THF; THF runs out → purine and dTMP synthesis fail → megaloblastic anemia. Homocysteine rises.',
        'So B₁₂ deficiency causes a functional folate deficiency (textbook: serum folate can be normal or even high).',
        'Megaloblastic anemia is treated with both B₁₂ and folic acid.',
      ],
      visual: folateTrapViz,
    },
    {
      eyebrow: 'Deficiency manifestations',
      title: 'Two deficiencies <em>compared</em>',
      bullets: [
        { t: 'Both: <b>megaloblastic anemia</b>, ↑ homocysteine', step: 1, tip: { title: 'Shared features', body: 'Megaloblastic anemia; hyperhomocysteinemia (risk factor for atherosclerosis).', src: SRC('17, 25') } },
        { t: 'B₁₂ only: <b>neuropsychiatric</b> symptoms', step: 2, tip: { title: 'The distinguishing feature', body: 'Neuropsychiatric symptoms are listed for B₁₂, not folate, deficiency.', src: SRC('17, 25') } },
        { t: '<b>Pernicious anemia</b>: no IF → no B₁₂', step: 2, tip: { title: 'Pernicious anemia', body: 'IF is produced by gastric parietal cells. IF deficiency: autoimmune destruction of parietal cells; partial or total gastrectomy.<br><span style="color:var(--fg-3)">Not the only cause of B₁₂ deficiency — diet (strict vegetarians) and ileal disease also cause it (textbook).</span>', src: SRC(26) } },
        { t: 'Folate only: <b>neural tube defects</b>', step: 3, tip: { title: 'Folate-specific', body: 'Neural tube defects (spina bifida, anencephaly).', src: SRC('17, 19') } },
      ],
      steps: 3,
      src: 'Lecture slides 17, 25–26',
      notes: [
        'Both deficiencies: megaloblastic anemia and hyperhomocysteinemia (risk factor for atherosclerosis).',
        'B₁₂ only: neuropsychiatric symptoms; pernicious anemia (no IF) is the classic cause.',
        'Folate only: neural tube defects.',
        'Pernicious anemia: autoimmune destruction of parietal cells or gastrectomy removes IF. Diet can also cause B₁₂ deficiency (strict vegetarians — sources are animal only).',
      ],
      visual: vennViz,
    },
    {
      eyebrow: 'Diagnosis · treatment',
      title: 'Diagnose, then <em>treat</em>',
      bullets: [
        { t: '<b>Serum B₁₂</b> · level in blood', tip: { title: 'Serum B₁₂', body: 'Measures B₁₂ levels in the blood.', src: SRC(29) } },
        { t: '<b>Schilling test</b> · B₁₂ absorption', tip: { title: 'Schilling test', body: 'Evaluates B₁₂ absorption: an oral dose that is not absorbed for lack of IF points to pernicious anemia; one that is absorbed points to dietary deficiency.<br><span style="color:var(--fg-3)">Now largely obsolete (textbook).</span>', src: SRC('29–30') } },
        { t: '<b>Peripheral smear</b> · megaloblasts', tip: { title: 'Peripheral smear', body: 'Confirms megaloblastic anemia.', src: SRC(29) } },
        { t: '<b>Homocysteine ↑</b> · no methionine made', tip: { title: 'Homocysteine', body: 'Homocysteine cannot be converted to methionine (slide: “homocystinuria”; measured clinically as raised plasma homocysteine).<br><span style="color:var(--fg-3)">Textbook: methylmalonic acid rises in B₁₂ but not folate deficiency.</span>', src: SRC(29) } },
      ],
      steps: 2,
      src: 'Lecture slides 26, 28–30 · masking curves schematic (textbook)',
      notes: [
        'Serum B₁₂ measures the level; the Schilling test evaluates absorption; the peripheral smear confirms megaloblastic anemia; raised homocysteine shows the methionine-synthase block.',
        'The slide words the last test as “homocystinuria”; clinically it is raised plasma homocysteine.',
        'Schilling test as taught: not absorbed (no IF) → pernicious anemia; absorbed → dietary deficiency. Largely obsolete today.',
        'Treatment: pernicious anemia needs lifelong B₁₂ (IM cyanocobalamin); megaloblastic anemia is treated with B₁₂ + folic acid.',
        'Builds 1–2 — safety (textbook): folic acid alone can correct the anemia while nerve damage progresses; always check or replace B₁₂.',
      ],
      visual: treatViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { icon: 'rbc', big: '3–4<small style="font-size:.5em"> g</small>', title: 'body iron', body: 'RDA 10–20 mg/day (40 in pregnancy).' },
        { icon: 'drop', big: '~1<small style="font-size:.5em"> mg</small>', title: 'iron lost a day', body: 'One-way element · stool 0.7 mg/day.' },
        { icon: 'leaf', big: '400<small style="font-size:.5em"> µg</small>', title: 'folate RDA', body: 'Upper jejunum · limited stores.' },
        { icon: 'clock', big: '2–5<small style="font-size:.5em"> mg</small>', title: 'B₁₂ in liver', body: 'RDA 1–2 µg/day · lasts 2–3 years.' },
      ],
      notes: [
        'Iron: 3–4 g in the body, RDA 10–20 mg (40 in pregnancy), ~1 mg lost per day.',
        'Folate: 400 µg/day, absorbed in the upper jejunum, little stored.',
        'B₁₂: 1–2 µg/day, needs IF, ileum, TC II, 2–5 mg liver store for 2–3 years.',
        'Then open the question bank.',
      ],
    },
  ],
};
