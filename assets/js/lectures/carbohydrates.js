// Carbohydrate Chemistry (L.1 – L.2) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, glowSprite, glowTexture, cylinderBetween, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { moleculeScene } from '../viz/scenes.js';

const gsap = window.gsap;

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */
const SRC = (p) => `Lecture slide ${p}`;
// Sugar colour language used across the whole deck
const COL = { glc: 'var(--elec)', gal: 'var(--a1)', man: 'var(--fadh)', fru: 'var(--prot)', neg: 'var(--inh)', water: 'var(--nadh)', o: 'var(--o2)' };
const HX = { glc: 0x4fb3ff, gal: 0x30d158, man: 0xbf5af2, fru: 0xff9f0a, acc: 0x30d158, gold: 0xffc21a, neg: 0xff375f, red: 0xff453a, water: 0x64d2ff };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ez = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function overlay(parent, style) {
  const o = h('div', { style: `position:absolute;z-index:3;pointer-events:none;${style}` });
  parent.append(o);
  return o;
}

/** Tween an SVG <g> scale (attribute based, origin = local 0,0). */
function scaleTo(el, v, o = {}) {
  const st = el._sc || (el._sc = { v: 1 });
  gsap.killTweensOf(st);
  return gsap.to(st, { v, duration: o.duration ?? 0.45, delay: o.delay ?? 0, ease: o.ease ?? 'back.out(1.8)', onUpdate: () => el.setAttribute('transform', `scale(${Math.max(0.0001, st.v)})`) });
}
function setScale(el, v) { el._sc = { v }; el.setAttribute('transform', `scale(${Math.max(0.0001, v)})`); }

/* ---------- 3D helpers ---------- */
const hlCache = new Map();
function hlMat(hex) {
  if (!hlCache.has(hex)) hlCache.set(hex, glossy(hex, { emissive: hex, emissiveIntensity: 0.55 }));
  return hlCache.get(hex);
}
/** Re-colour atoms of a built molecule (null = restore). */
function paint(mol, idx, hex) {
  idx.forEach((i) => {
    const m = mol.userData.atomMeshes[i];
    if (!m) return;
    if (!m.userData.base) m.userData.base = m.material;
    m.material = hex == null ? m.userData.base : hlMat(hex);
  });
}
/** Rotate a pyranose so its mean ring plane is horizontal, `up` atom side on +y, `front` atom toward +x. */
function alignRing(mol, ring, up, front) {
  const pos = mol.userData.pos;
  const cen = new THREE.Vector3();
  ring.forEach((i) => cen.add(pos[i]));
  cen.multiplyScalar(1 / ring.length);
  const n = new THREE.Vector3();
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length];
    n.add(pos[a].clone().sub(cen).cross(pos[b].clone().sub(cen)));
  });
  n.normalize();
  if (pos[up].clone().sub(cen).dot(n) < 0) n.negate();
  const q1 = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
  const d = pos[front].clone().sub(cen).applyQuaternion(q1);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.z, d.x)).multiply(q1);
  mol.quaternion.copy(q);
  mol.position.copy(cen.clone().applyQuaternion(q).negate());
  return (i) => pos[i].clone().applyQuaternion(q).add(mol.position);
}
function toPx(kit, v) {
  kit.controls?.update();
  kit.camera.updateMatrixWorld();
  const p = v.clone().project(kit.camera);
  return [((p.x + 1) / 2) * kit.wrap.clientWidth, ((1 - p.y) / 2) * kit.wrap.clientHeight];
}
/** Glowing glass mirror plane (normal along x). */
function mirrorPlane(w, hgt) {
  const g = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, roughness: 0.1, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  plane.rotation.y = Math.PI / 2;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, hgt)), new THREE.LineBasicMaterial({ color: HX.acc, transparent: true, opacity: 0.9 }));
  edge.rotation.y = Math.PI / 2;
  const strip = glowSprite(HX.acc, 1);
  strip.scale.set(0.9, hgt * 1.04, 1);
  strip.material.opacity = 0.55;
  g.add(plane, edge, strip);
  return g;
}

/* ---------- Fischer projection (SVG) ---------- */
function fischer(D, x, y, o) {
  const { top, rows, bottom, dy = 44, arm = 48, fs = 24, ohCol = null, layer = 'nodes' } = o;
  const g = s('g');
  D.layers[layer].append(g);
  const n = rows.length;
  const T = (tx, ty, str, anchor, col, w = 600) => {
    const t = s('text', { x: tx, y: ty + fs * 0.36, 'text-anchor': anchor, class: 'v-label', style: `font-size:${fs}px;font-weight:${w};fill:${col}` });
    setRich(t, str);
    g.append(t);
    return t;
  };
  g.append(s('line', { x1: x, y1: y + fs * 0.75, x2: x, y2: y + (n + 1) * dy - fs * 0.75, style: 'stroke:var(--fg-3);stroke-width:3;stroke-linecap:round' }));
  const topT = T(x, y, top, 'middle', 'var(--fg)', 650);
  const L = [], R = [];
  rows.forEach((r, i) => {
    const cy = y + (i + 1) * dy;
    if (!r) {
      g.append(s('rect', { x: x - 40, y: cy - fs * 0.62, width: 80, height: fs * 1.24, rx: 8, style: 'fill:var(--bg)' }));
      L.push(T(x, cy, 'C=O', 'middle', 'var(--fg)', 700));
      R.push(null);
      return;
    }
    g.append(s('line', { x1: x - arm, y1: cy, x2: x + arm, y2: cy, style: 'stroke:var(--fg-3);stroke-width:3;stroke-linecap:round' }));
    const isOH = (t) => /OH|HO/.test(t);
    L.push(T(x - arm - 8, cy, r[0], 'end', ohCol && isOH(r[0]) ? ohCol : 'var(--fg-2)', isOH(r[0]) ? 650 : 500));
    R.push(T(x + arm + 8, cy, r[1], 'start', ohCol && isOH(r[1]) ? ohCol : 'var(--fg-2)', isOH(r[1]) ? 650 : 500));
  });
  const botT = T(x, y + (n + 1) * dy, bottom, 'middle', 'var(--fg)', 650);
  return { g, L, R, topT, botT, cy: (i) => y + (i + 1) * dy };
}
const GLC_ROWS = [['H', 'OH'], ['HO', 'H'], ['H', 'OH'], ['H', 'OH']];

/* ------------------------------------------------------------------ */
/* Slide visuals                                                       */
/* ------------------------------------------------------------------ */

// 1 · Hero: β-D-glucopyranose with glowing anomeric C1
async function heroViz(el) {
  const sc = await moleculeScene(el, 'b-glucose', { fill: 0.74, autoRotate: 1.2, mol: { hideH: false, highlight: { atoms: [10, 4, 22], color: HX.acc } } });
  const p = sc.mol.userData.pos[10];
  const halo = glowSprite(HX.acc, 2.4);
  halo.position.copy(p);
  sc.mol.add(halo);
  sc.kit.label('Anomeric C1', [p.x, p.y + 1.25, p.z], { cls: 'sm acc', parent: sc.mol });
  sc.kit.onFrame((dt, t) => halo.scale.setScalar(2.1 + Math.sin(t * 2.2) * 0.45));
  return sc;
}

// 3 · Definition: open-chain glucose (aldose) vs fructose (ketose), same C6H12O6
async function defViz(el) {
  const kit = createScene(el, { cam: [0, 2, 18], autoRotate: 0.9 });
  const SETS = [
    { key: 'glucose-open', c: 11, o: 5, lbl: 'C1 · aldehyde', col: HX.acc, name: 'Glucose', kind: 'an <b>aldose</b> · C=O at C1' },
    { key: 'fructose-open', c: 10, o: 4, lbl: 'C2 · ketone', col: HX.fru, name: 'Fructose', kind: 'a <b>ketose</b> · C=O at C2' },
  ];
  const datas = await Promise.all(SETS.map((x) => loadMol(x.key)));
  const mols = SETS.map((x, i) => {
    const m = buildMolecule(datas[i], { hideH: 'nonpolar', highlight: { atoms: [x.c, x.o], color: x.col } });
    const P = m.userData.pos;
    const halo = glowSprite(x.col, 2.1);
    halo.position.copy(P[x.o]);
    m.add(halo);
    const lp = P[x.o].clone().add(P[x.o].clone().sub(P[x.c]).normalize().multiplyScalar(0.9));
    kit.label(x.lbl, [lp.x, lp.y + 0.7, lp.z], { cls: 'sm acc', parent: m });
    m.scale.setScalar(i ? 0.001 : 1);
    m.visible = i === 0;
    kit.root.add(m);
    return m;
  });
  kit.fit(mols[0], 0.86);
  const cap = overlay(el, 'left:0;right:0;top:0;text-align:center');
  const sb = (n) => `<sub style="font-size:.5em;margin:0 .06em 0 .02em">${n}</sub>`;
  const f = h('div', { style: 'font:720 64px var(--font);letter-spacing:0', html: `C${sb(6)}H${sb(12)}O${sb(6)}` });
  const sub = h('div', { style: 'font-size:30px;color:var(--fg-2);margin-top:4px' });
  const k = h('div', { style: 'font-size:24px;color:var(--ink);margin-top:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:650', text: 'Same formula · aldose–ketose isomers' });
  cap.append(f, sub, k);
  let cur = 0;
  const set = (i) => {
    sub.innerHTML = `${SETS[i].name} — ${SETS[i].kind}`;
    if (i === cur) return;
    const a = mols[cur], b = mols[i];
    cur = i;
    gsap.killTweensOf([a.scale, b.scale]);
    gsap.to(a.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { a.visible = false; } });
    b.visible = true;
    gsap.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: 0.25, ease: 'back.out(1.6)' });
  };
  const sg = seg({ options: [{ v: 0, t: 'Glucose · aldose' }, { v: 1, t: 'Fructose · ketose' }], value: 0, onChange: set });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(0);
  return kitController(kit, { step: (n) => sg.set(n >= 1 ? 1 : 0) });
}

// 4 · Classification: live bead chain + ruler + homo/hetero
function classViz(el) {
  const D = diagram(el, 1712, 720);
  const TAGS = [
    { n: '1', name: 'Monosaccharide', col: 'var(--prot)', ex: 'glucose, fructose, galactose', lo: 1, hi: 1 },
    { n: '2', name: 'Disaccharide', col: 'var(--fg-2)', ex: 'maltose, lactose, sucrose', lo: 2, hi: 2 },
    { n: '3–10', name: 'Oligosaccharide', col: 'var(--atp)', ex: 'short chains of 3–10 units', lo: 3, hi: 10 },
    { n: '>10', name: 'Polysaccharide', col: 'var(--a2)', ex: 'glycogen, starch, cellulose, GAGs', lo: 11, hi: 99 },
  ];
  const segs = TAGS.map((tg, i) => {
    const x = 20 + i * 262, y = 548, w = 242, hh = 150;
    const g = s('g', { 'data-tip': JSON.stringify({ kicker: `${tg.n} sugar unit${tg.n === '1' ? '' : 's'}`, title: tg.name, body: `Examples: ${tg.ex}.${i === 3 ? '<br>Also called <b>glycans</b>.' : ''}${i === 0 ? '<br>Cannot be hydrolysed further.' : ''}`, src: SRC('5, 17, 22') }) });
    const r = s('rect', { x, y, width: w, height: hh, rx: 28, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2;transition:fill .4s,stroke .4s' });
    const pill = s('rect', { x: x + w / 2 - 56, y: y + 20, width: 112, height: 50, rx: 25, style: `fill:color-mix(in oklab, ${tg.col} 22%, transparent);stroke:${tg.col};stroke-width:2` });
    const nt = s('text', { x: x + w / 2, y: y + 56, 'text-anchor': 'middle', class: 'v-label', style: `font-size:30px;font-weight:760;fill:${tg.col}` });
    nt.textContent = tg.n;
    const nm = s('text', { x: x + w / 2, y: y + 116, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:620' });
    nm.textContent = tg.name;
    g.append(r, pill, nt, nm);
    D.layers.nodes.append(g);
    return { g, r, tg };
  });

  // live chain
  const X0 = 86, Y0 = 300, SP = 72, RB = 27;
  const bp = (i) => {
    if (i <= 9) return [X0 + i * SP, Y0];
    const a = -Math.PI / 2 + (i - 9) * (SP / 100);
    return [X0 + 9 * SP + Math.cos(a) * 100, Y0 + 100 + Math.sin(a) * 100];
  };
  const bondG = s('g'), beadG = s('g');
  D.layers.edges.append(bondG);
  D.layers.nodes.append(beadG);
  const beads = [], bonds = [];
  for (let i = 0; i < 14; i++) {
    const [x, y] = bp(i);
    if (i) {
      const [px, py] = bp(i - 1);
      const l = s('line', { x1: px, y1: py, x2: x, y2: y, style: 'stroke:var(--line-2);stroke-width:7;stroke-linecap:round;opacity:0' });
      bondG.append(l);
      bonds.push(l);
    }
    const g = s('g', { transform: `translate(${x} ${y})`, 'data-tip': JSON.stringify({ title: 'Glucose unit', body: 'Units are joined by <b>glycosidic bonds</b>.' }) });
    const inner = s('g');
    inner.append(s('circle', { r: RB, style: `fill:${COL.glc};stroke:var(--bg);stroke-width:3` }), s('circle', { cx: -8, cy: -9, r: 7, style: 'fill:#fff;opacity:.35' }));
    setScale(inner, 0);
    g.append(inner);
    beadG.append(g);
    beads.push(inner);
  }
  const lbl = D.text(40, 120, 'Monosaccharide', { style: 'font-size:64px;font-weight:720;letter-spacing:-.025em;fill:var(--ink)' });
  const cnt = D.text(44, 176, '1 unit', { style: 'font-size:28px;fill:var(--fg-2);font-weight:520' });

  // homo vs hetero
  const poly = s('g', { style: 'opacity:0' });
  D.layers.labels.append(poly);
  poly.append(s('path', { d: 'M1048,622 C1100,622 1096,200 1150,200', style: 'fill:none;stroke:var(--line-2);stroke-width:3;stroke-dasharray:8 9' }));
  poly.append(s('path', { d: 'M1048,622 C1100,622 1096,520 1150,520', style: 'fill:none;stroke:var(--line-2);stroke-width:3;stroke-dasharray:8 9' }));
  const panel = (y, title, sub, ex, pattern, tipSpec, legend) => {
    const g = s('g', { 'data-tip': JSON.stringify(tipSpec) });
    g.append(s('rect', { x: 1150, y, width: 562, height: 290, rx: 32, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' }));
    const t = s('text', { x: 1186, y: y + 56, class: 'v-label', style: 'font-size:32px;font-weight:700' });
    t.textContent = title;
    g.append(t);
    const by = y + 138;
    pattern.forEach((c, i) => { if (i) g.append(s('line', { x1: 1206 + (i - 1) * 64, y1: by, x2: 1206 + i * 64, y2: by, style: 'stroke:var(--line-2);stroke-width:6' })); });
    pattern.forEach((c, i) => g.append(s('circle', { cx: 1206 + i * 64, cy: by, r: 23, style: `fill:${c};stroke:var(--bg);stroke-width:3` })));
    (legend || []).forEach(([i, txt, c]) => { const lt = s('text', { x: 1206 + i * 64, y: by - 38, 'text-anchor': 'middle', class: 'v-label', style: `font-size:22px;font-weight:650;fill:${c}` }); lt.textContent = txt; g.append(lt); });
    const st = s('text', { x: 1186, y: y + 214, class: 'v-label', style: 'font-size:28px;fill:var(--fg-2)' });
    st.textContent = sub;
    const et = s('text', { x: 1186, y: y + 256, class: 'v-label', style: 'font-size:26px;font-weight:620;fill:var(--ink)' });
    et.textContent = ex;
    g.append(st, et);
    poly.append(g);
  };
  panel(56, 'Homopolysaccharide', 'One type of sugar unit', 'e.g. glycogen · dextran · inulin', Array(8).fill(COL.glc), { title: 'Homopolysaccharides', body: 'Made of <b>one</b> type of monosaccharide. Glycogen and dextran (D-glucose), inulin (D-fructose).', src: SRC('5, 23') });
  panel(376, 'Heteropolysaccharide', 'Two or more types', 'e.g. glycosaminoglycans', [COL.glc, COL.gal, COL.glc, COL.man, COL.glc, COL.gal, COL.glc, COL.man], { title: 'Heteropolysaccharides', body: 'Made of <b>more than one</b> type of monosaccharide (figure: galactose, glucose, mannose). GAGs are heteropolysaccharides.', src: SRC('5, 28') }, [[0, 'Glc', COL.glc], [1, 'Gal', COL.gal], [3, 'Man', COL.man]]);

  let curN = 0;
  const setN = (N) => {
    N = Math.round(N);
    beads.forEach((b, i) => scaleTo(b, i < N ? 1 : 0, { delay: i < N ? Math.max(0, i - curN) * 0.05 : 0, duration: 0.42 }));
    bonds.forEach((l, i) => gsap.to(l, { opacity: i + 1 < N ? 1 : 0, duration: 0.3, delay: i + 1 < N ? Math.max(0, i + 1 - curN) * 0.05 : 0 }));
    const k = TAGS.findIndex((tg) => N >= tg.lo && N <= tg.hi);
    lbl.textContent = TAGS[k].name;
    cnt.textContent = N === 1 ? '1 unit · simplest sugar' : N > 10 ? `${N} units · more than 10` : `${N} units`;
    segs.forEach((sg, i) => {
      sg.r.style.fill = i === k ? `color-mix(in oklab, ${sg.tg.col} 16%, transparent)` : 'var(--surface)';
      sg.r.style.stroke = i === k ? sg.tg.col : 'var(--line)';
    });
    curN = N;
  };
  const sl = slider({ label: 'Sugar units', min: 1, max: 14, step: 1, value: 1, fmt: (v) => `${v}`, onInput: setN, width: 170 });
  ctrlBar(el, [sl], { left: 560, top: 70 });
  setN(1);
  const NS = [1, 2, 6, 14, 14];
  return { step: (n) => { sl.set(NS[Math.min(4, n)]); show(poly, n >= 4); }, destroy: () => D.destroy() };
}

// 5 · Monosaccharides by carbon number
function monoViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '310px 1fr';
  el.style.gap = '56px';
  el.style.alignItems = 'center';
  const sub = (n) => `<sub style="font-size:.58em">${n}</sub>`;
  const F = (c, hh, o) => `C${sub(c)}H${sub(hh)}O${sub(o)}`;
  const DATA = [
    { n: 3, name: 'Triose', f: F(3, 6, 3), ex: 'Glyceraldehyde' },
    { n: 4, name: 'Tetrose', f: F(4, 8, 4), ex: 'Erythrose' },
    { n: 5, name: 'Pentose', f: F(5, 10, 5), ex: 'Ribose' },
    { n: 6, name: 'Hexose', f: F(6, 12, 6), ex: 'Glucose · galactose' },
    { n: 7, name: 'Heptose', f: F(7, 14, 7), ex: 'Sedoheptulose' },
    { n: 8, name: 'Octose', f: F(8, 16, 8), ex: 'D-erythro-L-galacto-octose' },
    { n: 9, name: 'Nonose', f: `C${sub(9)}H${sub(17)}NO${sub(8)}`, ex: 'Neuraminic acid', flag: true },
  ];
  const list = h('div', { style: 'display:grid;gap:12px' });
  const panel = h('div', { style: 'position:relative;display:flex;flex-direction:column;gap:10px' });
  el.append(list, panel);
  const kick = h('div', { style: 'font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);font-weight:650' });
  const name = h('div', { style: 'font:740 112px var(--font);letter-spacing:-.045em;line-height:1;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:6px' });
  const form = h('div', { style: 'font:620 56px var(--font);letter-spacing:-.01em' });
  const ex = h('div', { style: 'font-size:32px;color:var(--fg-2)' });
  const flag = h('div', { style: 'min-height:48px' });
  const chain = s('svg', { viewBox: '0 0 600 120', width: 600, height: 120, style: 'margin-top:26px;overflow:visible' });
  panel.append(kick, name, form, ex, flag, chain);
  tip(flag, { kicker: 'Accuracy note', title: 'Neuraminic acid is not (CH₂O)ₙ', body: 'The slide lists it as C₉H₁₈O₉. Neuraminic acid contains nitrogen: <b>C₉H₁₇NO₈</b>, a 9-carbon amino sugar acid (textbook).', src: `${SRC(7)} · Lippincott` });
  const chips = DATA.map((d, i) => {
    const c = h('div', { style: 'display:flex;align-items:center;gap:18px;padding:12px 22px;border-radius:999px;border:1px solid var(--line);background:var(--surface);cursor:pointer;transition:background .35s var(--ease),border-color .35s var(--ease),opacity .35s' }, [
      h('span', { style: 'font:740 34px var(--font);width:40px;text-align:center;color:var(--ink)', text: d.n }),
      h('span', { style: 'font-size:30px;font-weight:600', text: d.name }),
    ]);
    c.addEventListener('mouseenter', () => select(i));
    c.addEventListener('click', () => select(i));
    list.append(c);
    return c;
  });
  let cur = -1;
  function select(i) {
    if (i === cur) return;
    cur = i;
    const d = DATA[i];
    chips.forEach((c, k) => {
      c.style.background = k === i ? 'color-mix(in oklab, var(--a1) 16%, transparent)' : 'var(--surface)';
      c.style.borderColor = k === i ? 'color-mix(in oklab, var(--a1) 60%, transparent)' : 'var(--line)';
    });
    kick.textContent = `${d.n} carbons`;
    name.textContent = d.name;
    form.innerHTML = d.f;
    ex.innerHTML = `e.g. <b>${d.ex}</b>`;
    flag.innerHTML = d.flag ? '<span class="chip inh" style="font-size:24px">contains N · not (CH₂O)ₙ — hover</span>' : '<span class="chip acc" style="font-size:24px">(CH₂O)ₙ · n ≥ 3</span>';
    chain.innerHTML = '';
    const sp = 64;
    for (let k = 0; k < d.n; k++) {
      if (k) chain.append(s('line', { x1: 30 + (k - 1) * sp, y1: 60, x2: 30 + k * sp, y2: 60, style: 'stroke:var(--line-2);stroke-width:6' }));
    }
    for (let k = 0; k < d.n; k++) {
      const g = s('g', { transform: `translate(${30 + k * sp} 60)` });
      const inner = s('g');
      inner.append(s('circle', { r: 26, style: 'fill:color-mix(in oklab, var(--a1) 28%, var(--bg));stroke:var(--a1);stroke-width:3' }));
      const t = s('text', { y: 9, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:720' });
      t.textContent = k + 1;
      inner.append(t);
      g.append(inner);
      chain.append(g);
      setScale(inner, 0);
      scaleTo(inner, 1, { delay: k * 0.05 });
    }
    gsap.fromTo([name, form, ex], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'expo.out' });
  }
  select(3);
  return {};
}

// 6 · Chiral carbon: tetrahedron + mirror image, try to superimpose
function chiralViz(el) {
  const kit = createScene(el, { cam: [0, 2.6, 21], autoRotate: 0 });
  const COLS = [0xffd60a, 0x30d158, 0xff453a, 0xff2d92];
  const DIRS = [new THREE.Vector3(0, 1, 0), ...[0, 120, 240].map((d) => { const a = (d * Math.PI) / 180; return new THREE.Vector3(0.943 * Math.cos(a), -0.333, 0.943 * Math.sin(a)); })];
  const BL = 1.85;
  const sGeo = new THREE.SphereGeometry(1, 40, 28);
  const tetra = (ghost) => {
    const g = new THREE.Group();
    const T = ghost ? { transparent: true, depthWrite: false } : {};
    const core = new THREE.Mesh(sGeo, glossy(0x8e8e96, T));
    core.scale.setScalar(0.6);
    g.add(core);
    const bondMat = glossy(0xc7c7cc, T);
    const subs = DIRS.map((d, i) => {
      const end = d.clone().multiplyScalar(BL);
      g.add(cylinderBetween(new THREE.Vector3(), end, 0.13, bondMat));
      const m = new THREE.Mesh(sGeo, glossy(COLS[i], T));
      m.scale.setScalar(0.55);
      m.position.copy(end);
      g.add(m);
      return m;
    });
    return { g, core, subs, mats: [core.material, bondMat, ...subs.map((x) => x.material)] };
  };
  const A = tetra(false), B = tetra(true);
  const spinA = new THREE.Group();
  spinA.add(A.g);
  spinA.position.x = -3.5;
  const wrapB = new THREE.Group();
  wrapB.scale.x = -1;
  wrapB.position.x = 3.5;
  const spinB = new THREE.Group();
  spinB.add(B.g);
  wrapB.add(spinB);
  const mir = mirrorPlane(5.6, 6.2);
  kit.root.add(spinA, wrapB, mir);
  const lA = kit.label('Molecule', [-3.5, -3.2, 0], { cls: 'sm' });
  const lB = kit.label('Mirror image', [3.5, -3.2, 0], { cls: 'sm' });
  const lM = kit.label('mirror', [0, 3.5, 0], { cls: 'sm acc' });
  const marks = DIRS.map((d) => {
    const p = d.clone().multiplyScalar(BL + 0.95);
    const m = kit.label('', [p.x, p.y, p.z], { cls: 'plain', parent: A.g });
    m.element.style.cssText += ';font-size:40px;font-weight:800;opacity:0;transition:opacity .4s';
    return m;
  });
  const verdict = overlay(el, 'left:0;right:0;top:4px;text-align:center');
  const vT = h('div', { style: 'font:700 40px var(--font);letter-spacing:-.02em' });
  const vS = h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:6px' });
  verdict.append(vT, vS);
  const st = { k: 0 };
  let th = 0.6, sup = false, achiral = false;
  kit.onFrame((dt) => {
    th += dt * 0.5;
    spinA.rotation.y = th;
    spinB.rotation.y = lerp(th, Math.PI - th, st.k);
    wrapB.position.x = lerp(3.5, -3.5, st.k);
    lB.position.x = wrapB.position.x;
    lB.element.style.opacity = 1 - st.k;
    lM.element.style.opacity = 1 - st.k * 0.7;
    B.mats.forEach((m) => { m.opacity = 1 - 0.55 * st.k; });
    B.subs.forEach((m) => m.scale.setScalar(0.55 * (1 + 0.24 * st.k)));
    B.core.scale.setScalar(0.6 * (1 + 0.22 * st.k));
  });
  const render = () => {
    [A, B].forEach((T) => T.subs.forEach((m, i) => m.material.color.setHex(achiral ? 0xff453a : COLS[i])));
    marks.forEach((m) => { m.element.style.opacity = 0; });
    lA.element.innerHTML = sup ? 'Overlay' : 'Molecule';
    gsap.to(st, {
      k: sup ? 1 : 0, duration: 1.4, ease: 'power2.inOut',
      onComplete: () => {
        if (!sup) return;
        marks.forEach((m, i) => {
          const bad = !achiral && i >= 2;
          m.element.textContent = bad ? '✕' : '✓';
          m.element.style.color = bad ? 'var(--inh)' : 'var(--act)';
          m.element.style.opacity = 1;
        });
      },
    });
    if (!sup) { vT.innerHTML = achiral ? 'Four <span style="color:var(--inh)">identical</span> groups' : 'Four <span class="ink">different</span> groups'; vS.textContent = 'Its mirror image, reflected across the plane'; }
    else if (achiral) { vT.innerHTML = '<span style="color:var(--act)">✓ Superimposable</span> → achiral'; vS.textContent = 'Identical groups: the mirror image is the same molecule'; }
    else { vT.innerHTML = '<span style="color:var(--inh)">✕ Not superimposable</span> → chiral'; vS.textContent = 'Two groups always end up swapped, like left and right hands'; }
  };
  const sg = seg({ options: [{ v: false, t: 'Chiral' }, { v: true, t: 'Achiral' }], value: false, onChange: (v) => { achiral = v; render(); } });
  const tg = toggle({ label: 'Superimpose', on: false, onChange: (v) => { sup = v; render(); } });
  ctrlBar(el, [sg, tg], { left: 0, bottom: 0 });
  render();
  return kitController(kit, {
    step(n) { sup = n >= 1; achiral = n >= 2; sg.set(achiral, false); tg.set(sup, false); render(); },
  });
}

// 7 · Fischer → Haworth ring closure, anomers, equilibrium
function ringViz(el) {
  const D = diagram(el, 1712, 720);
  const Lr = D.layers;
  const PI2 = Math.PI / 2;
  const rot = ([x, y], th) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
  const l2 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
  const add = (A, B) => [A[0] + B[0], A[1] + B[1]];
  const FX = 300, FY = 112, FDY = 92;
  const PF = [FX, FY + 2.5 * FDY], PM = [560, 380];
  const Fc = (k) => [FX, FY + (k - 1) * FDY];
  const Mc = (k) => [860 - (k - 1) * 120, 380];
  const Hc = [null, [840, 380], [700, 490], [450, 490], [330, 380], [480, 270], [480, 150]];
  const cpos = (k, t) => {
    if (t <= 1) {
      const e = ez(t);
      const v = rot([0, Fc(k)[1] - PF[1]], e * PI2);
      const sc = lerp(1, 120 / 92, e);
      const p = l2(PF, PM, e);
      return [p[0] + v[0] * sc, p[1] + v[1] * sc];
    }
    return l2(Mc(k), Hc[k], ez(t - 1));
  };
  const offAt = (f, hh, t) => (t <= 1 ? rot(f, ez(t) * PI2) : l2(rot(f, PI2), hh, ez(t - 1)));

  const ringFill = s('path', { style: 'fill:color-mix(in oklab, var(--a1) 12%, transparent);stroke:none;opacity:0' });
  Lr.regions.append(ringFill);
  const mkLine = (w = 6, col = 'var(--fg-2)') => { const l = s('line', { style: `stroke:${col};stroke-width:${w};stroke-linecap:round` }); Lr.edges.append(l); return l; };
  const chainB = [1, 2, 3, 4, 5].map(() => mkLine(6));
  const glowC1 = s('circle', { r: 40, style: 'fill:var(--a1);opacity:0', filter: `url(#${D.glowId})` });
  Lr.fx.append(glowC1);
  const carbons = [null];
  for (let k = 1; k <= 6; k++) {
    const g = s('g');
    g.append(s('circle', { r: 26, style: `fill:color-mix(in oklab, var(--a1) 28%, var(--bg));stroke:var(--a1);stroke-width:${k === 1 ? 4 : 3}` }));
    const t = s('text', { y: 9, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:26px;font-weight:750' });
    t.textContent = k;
    g.append(t);
    Lr.nodes.append(g);
    carbons.push(g);
  }
  const SUBS = [
    { c: 2, f: [92, 0], hh: [0, 80], t: 'OH' },
    { c: 2, f: [-92, 0], hh: [0, -80], t: 'H' },
    { c: 3, f: [-92, 0], hh: [0, -80], t: 'HO', tH: 'OH' },
    { c: 3, f: [92, 0], hh: [0, 80], t: 'H' },
    { c: 4, f: [92, 0], hh: [0, 80], t: 'OH' },
    { c: 4, f: [-92, 0], hh: [0, -80], t: 'H' },
    { c: 5, f: [-92, 0], hh: [0, 76], t: 'H', fade: true },
    { c: 6, f: [0, 82], hh: [68, -40], t: 'OH' },
  ].map((sb) => ({ ...sb, line: mkLine(4, 'var(--line-2)'), txt: D.text(0, 0, sb.t, { anchor: 'middle', layer: 'nodes', style: `font-size:26px;font-weight:${sb.t === 'H' ? 520 : 650};fill:${sb.t === 'H' ? 'var(--fg-2)' : 'var(--fg)'}` }) }));
  const mkO = () => {
    const g = s('g');
    g.append(s('circle', { r: 22, style: 'fill:color-mix(in oklab, var(--o2) 26%, var(--bg));stroke:var(--o2);stroke-width:3' }));
    const t = s('text', { y: 9, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:25px;font-weight:760;fill:var(--o2)' });
    t.textContent = 'O';
    g.append(t);
    Lr.nodes.append(g);
    return g;
  };
  const bC1O1a = mkLine(5), bC1O1b = mkLine(5), bC1H1 = mkLine(4, 'var(--line-2)'), bC5O5 = mkLine(6), bO5C1 = mkLine(6), bO5H = mkLine(4, 'var(--line-2)'), bO1H = mkLine(4, 'var(--line-2)');
  const O1 = mkO(), O5 = mkO();
  const H1 = D.text(0, 0, 'H', { anchor: 'middle', layer: 'nodes', style: 'font-size:26px;fill:var(--fg-2)' });
  const H5 = D.text(0, 0, 'H', { anchor: 'middle', layer: 'nodes', style: 'font-size:27px;font-weight:720;fill:var(--ink)' });

  const st = { t: 0, phi: PI2 };
  const setL = (l, A, B, ra = 0, rb = 0, op = 1) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    l.setAttribute('x1', A[0] + ux * ra); l.setAttribute('y1', A[1] + uy * ra);
    l.setAttribute('x2', B[0] - ux * rb); l.setAttribute('y2', B[1] - uy * rb);
    l.style.opacity = op;
  };
  const place = (g, P) => g.setAttribute('transform', `translate(${P[0].toFixed(1)} ${P[1].toFixed(1)})`);
  const capT = D.text(300, 704, 'Fischer projection · open chain', { anchor: 'middle', style: 'font-size:26px;font-weight:600;fill:var(--fg-2);letter-spacing:.02em' });

  function render() {
    const t = st.t, u = t > 1 ? ez(t - 1) : 0;
    const CP = [null];
    for (let k = 1; k <= 6; k++) { CP.push(cpos(k, t)); place(carbons[k], CP[k]); }
    for (let k = 1; k <= 5; k++) {
      chainB[k - 1].style.strokeWidth = k <= 3 ? lerp(6, 13, u) : 6;
      setL(chainB[k - 1], CP[k], CP[k + 1], 26, 26);
    }
    SUBS.forEach((sb) => {
      const P = add(CP[sb.c], offAt(sb.f, sb.hh, t));
      const op = sb.fade && t > 1 ? Math.abs(1 - 2 * u) : 1;
      sb.txt.setAttribute('x', P[0]); sb.txt.setAttribute('y', P[1] + 9);
      sb.txt.style.opacity = op;
      if (sb.tH) sb.txt.textContent = t > 0.5 ? sb.tH : sb.t;
      setL(sb.line, CP[sb.c], P, 27, sb.t === 'H' ? 15 : 23, op);
    });
    const dp = [Math.cos(st.phi), Math.sin(st.phi)];
    const o1off = t <= 1 ? rot([78, -52], ez(t) * PI2) : l2(rot([78, -52], PI2), [86 * dp[0], 86 * dp[1]], u);
    const h1off = t <= 1 ? rot([-78, -52], ez(t) * PI2) : l2(rot([-78, -52], PI2), [-80 * dp[0], -80 * dp[1]], u);
    const PO1 = add(CP[1], o1off), PH1 = add(CP[1], h1off);
    place(O1, PO1);
    H1.setAttribute('x', PH1[0]); H1.setAttribute('y', PH1[1] + 9);
    const h1op = t > 1 ? lerp(1, Math.abs(dp[1]), u) : 1;
    H1.style.opacity = h1op;
    setL(bC1H1, CP[1], PH1, 27, 15, h1op);
    const w = clamp01((u - 0.35) / 0.5);
    const ddx = PO1[0] - CP[1][0], ddy = PO1[1] - CP[1][1], Ld = Math.hypot(ddx, ddy) || 1;
    const nx = (-ddy / Ld) * 5, ny = (ddx / Ld) * 5, dbl = 1 - w;
    setL(bC1O1a, [CP[1][0] + nx * dbl, CP[1][1] + ny * dbl], [PO1[0] + nx * dbl, PO1[1] + ny * dbl], 27, 22);
    setL(bC1O1b, [CP[1][0] - nx, CP[1][1] - ny], [PO1[0] - nx, PO1[1] - ny], 27, 22, dbl);
    const PO5 = add(CP[5], offAt([92, 0], [210, 0], t));
    place(O5, PO5);
    setL(bC5O5, CP[5], PO5, 27, 22);
    setL(bO5C1, PO5, CP[1], 22, 27, clamp01((u - 0.55) / 0.3));
    const h5home = add(PO5, t <= 1 ? rot([46, 0], ez(t) * PI2) : l2(rot([46, 0], PI2), [0, -46], u));
    const h5dock = [PO1[0] + 46 * dp[0], PO1[1] + 46 * dp[1]];
    const PH5 = l2(h5home, h5dock, ez(w));
    H5.setAttribute('x', PH5[0]); H5.setAttribute('y', PH5[1] + 9);
    setL(bO5H, PO5, PH5, 22, 14, (1 - w) ** 2);
    setL(bO1H, PO1, PH5, 22, 14, w ** 2);
    ringFill.setAttribute('d', `M${CP[1]}L${CP[2]}L${CP[3]}L${CP[4]}L${CP[5]}L${PO5}Z`);
    ringFill.style.opacity = u * 0.9;
    glowC1.setAttribute('cx', CP[1][0]); glowC1.setAttribute('cy', CP[1][1]);
    capT.setAttribute('x', lerp(300, 585, clamp01(t / 2)));
    capT.textContent = t < 1 ? 'Fischer projection · open chain' : 'Haworth projection · ring';
  }

  // annotations
  const carbLbl = s('g');
  carbLbl.append(s('path', { d: 'M222,150 L262,124', style: 'stroke:var(--ink);stroke-width:3;fill:none;stroke-linecap:round' }));
  const cl = D.text(30, 172, 'Carbonyl carbon', { style: 'font-size:26px;font-weight:650;fill:var(--ink)' });
  carbLbl.append(cl);
  Lr.labels.append(carbLbl);
  const attack = D.arrow({ d: 'M450,470 C640,420 620,140 345,112', from: [450, 470], to: [345, 112], color: 'var(--ink)', width: 4, dash: '10 10' });
  const attackT = D.text(600, 292, 'C5–OH attacks the C=O', { style: 'font-size:26px;font-weight:620;fill:var(--ink)' });
  const anoLbl = s('g', { style: 'opacity:0' });
  anoLbl.append(s('path', { d: 'M900,150 L861,350', style: 'stroke:var(--ink);stroke-width:3;fill:none;stroke-linecap:round' }));
  const al = D.text(880, 100, 'Anomeric carbon', { style: 'font-size:28px;font-weight:700;fill:var(--ink)' });
  const al2 = D.text(880, 134, 'new chiral centre', { style: 'font-size:24px;fill:var(--fg-2)' });
  anoLbl.append(al, al2);
  Lr.labels.append(anoLbl);
  const badge = D.text(600, 640, '', { anchor: 'middle', style: 'font-size:36px;font-weight:720;letter-spacing:-.01em;fill:var(--fg)' });

  // right panel: equilibrium
  const PX = 1140, PW = 560;
  D.text(PX, 50, 'IN SOLUTION', { style: 'font-size:24px;letter-spacing:.16em;font-weight:700;fill:var(--fg-3)' });
  const b1y = 84;
  const b1open = s('rect', { x: PX, y: b1y, width: 14, height: 46, rx: 7, style: 'fill:var(--fg-2)' });
  const b1ring = s('rect', { x: PX + 20, y: b1y, width: PW - 20, height: 46, rx: 14, style: 'fill:var(--a1)' });
  Lr.labels.append(b1open, b1ring);
  const t1a = D.text(PX, b1y + 86, 'Open chain ≈1%', { style: 'font-size:26px;fill:var(--fg-2);font-weight:620' });
  const t1b = D.text(PX + PW, b1y + 86, 'Ring ≈99%', { anchor: 'end', style: 'font-size:26px;fill:var(--ink);font-weight:680' });
  const g1 = s('g', { 'data-tip': JSON.stringify({ kicker: 'Slide 9 figure', title: 'Open chain vs ring', body: 'About 99% of glucose is cyclic, about 1% open-chain (the slide’s round numbers; textbooks put the open chain far below 1%).', src: SRC(9) }) });
  g1.append(s('rect', { x: PX - 10, y: b1y - 14, width: PW + 20, height: 120, style: 'fill:transparent' }));
  Lr.labels.append(g1);
  const bar2 = s('g', { style: 'opacity:0' });
  Lr.labels.append(bar2);
  const b2y = 232, aw = PW * 0.36;
  const b2a = s('rect', { x: PX, y: b2y, width: aw - 4, height: 64, rx: 16, style: 'fill:var(--a2)' });
  const b2b = s('rect', { x: PX + aw + 4, y: b2y, width: PW - aw - 4, height: 64, rx: 16, style: 'fill:var(--a1)' });
  const mkT = (x, y, str, st2) => { const t = s('text', { x, y, 'text-anchor': 'middle', class: 'v-label', style: st2 }); t.textContent = str; return t; };
  const nA = mkT(PX + aw / 2, b2y + 146, '36%', 'font-size:76px;font-weight:760;letter-spacing:-.035em;fill:var(--a2)');
  const nB = mkT(PX + aw + (PW - aw) / 2, b2y + 146, '64%', 'font-size:76px;font-weight:760;letter-spacing:-.035em;fill:var(--a1)');
  const lA = mkT(PX + aw / 2, b2y + 190, 'α-glucose', 'font-size:26px;font-weight:620;fill:var(--fg-2)');
  const lB = mkT(PX + aw + (PW - aw) / 2, b2y + 190, 'β-glucose', 'font-size:26px;font-weight:620;fill:var(--fg-2)');
  const gA = s('g', { 'data-tip': JSON.stringify({ title: 'α-D-glucose · 36%', body: 'Anomeric OH <b>down</b> in the Haworth projection (opposite side to C6).', src: SRC(9) }) });
  const gB = s('g', { 'data-tip': JSON.stringify({ title: 'β-D-glucose · 64%', body: 'Anomeric OH <b>up</b> (same side as C6). The predominant anomer.', src: SRC(9) }) });
  gA.append(b2a, nA, lA);
  gB.append(b2b, nB, lB);
  bar2.append(gA, gB);
  const mut = s('g', { style: 'opacity:0' });
  Lr.labels.append(mut);
  const mA = D.node({ id: 'mA', x: PX + 56, y: 586, label: 'α', kind: 'mol', color: 'var(--a2)', size: 32, w: 96 });
  const mO = D.node({ id: 'mO', x: PX + 280, y: 586, label: 'open chain', kind: 'mol', size: 25 });
  const mB = D.node({ id: 'mB', x: PX + 504, y: 586, label: 'β', kind: 'mol', color: 'var(--a1)', size: 32, w: 96 });
  const arrs = [
    D.arrow({ from: 'mA', to: 'mO', curve: -34, color: 'var(--a2)', width: 3, headSize: 13 }),
    D.arrow({ from: 'mO', to: 'mA', curve: -34, color: 'var(--a2)', width: 3, headSize: 13 }),
    D.arrow({ from: 'mO', to: 'mB', curve: -34, color: 'var(--a1)', width: 3, headSize: 13 }),
    D.arrow({ from: 'mB', to: 'mO', curve: -34, color: 'var(--a1)', width: 3, headSize: 13 }),
  ];
  const mutT = D.text(PX + 280, 690, 'α and β interconvert through the open chain', { anchor: 'middle', style: 'font-size:24px;fill:var(--fg-2)' });
  mut.append(...arrs.map((a) => a.g), mA.g, mO.g, mB.g, mutT);
  mut.setAttribute('data-tip', JSON.stringify({ kicker: 'Textbook context', title: 'Mutarotation', body: 'In solution the ring opens and recloses, so α and β interconvert until the 36 : 64 equilibrium is reached. (Term not used on the slides.)', src: 'Lippincott · Lecture slide 9' }));
  const flows = arrs.map((a) => D.flow(a, { count: 1, color: 'var(--fg)', speed: 110, r: 6, autoplay: false }));
  flows.forEach((f) => f.hide());

  let last = -1, tl = null;
  function apply(n) {
    tl?.kill();
    gsap.killTweensOf(st);
    const inst = last < 0;
    if (n === 0) {
      tl = gsap.to(st, { t: 0, duration: inst ? 0 : 2.2, ease: 'power1.inOut', onUpdate: render });
    } else if (n <= 3) {
      const closing = st.t < 2;
      tl = gsap.timeline({ onUpdate: render });
      if (closing) { if (n === 1 || st.t < 1.5) st.phi = PI2; tl.to(st, { t: 2, duration: inst ? 0 : 2.4, ease: 'power1.inOut' }); }
      if (n === 1) tl.fromTo(st, { phi: PI2 }, { phi: -PI2, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, immediateRender: false }, inst ? 0 : '>');
      else tl.to(st, { phi: n === 2 ? PI2 : -PI2, duration: inst ? 0 : 1.1, ease: 'power3.inOut' }, '<');
    } else {
      if (inst) { st.t = 2; st.phi = -PI2; }
      tl = gsap.timeline({ repeat: -1, onUpdate: render });
      tl.to(st, { t: 2, phi: -PI2, duration: 0.8 })
        .to(st, { t: 1.5, duration: 0.9, ease: 'power2.inOut' }).to(st, { phi: PI2, duration: 0.5 }).to(st, { t: 2, duration: 0.9, ease: 'power2.inOut' }).to({}, { duration: 1.3 })
        .to(st, { t: 1.5, duration: 0.9, ease: 'power2.inOut' }).to(st, { phi: -PI2, duration: 0.5 }).to(st, { t: 2, duration: 0.9, ease: 'power2.inOut' }).to({}, { duration: 1.3 });
    }
    const d = inst ? 0 : 0.6;
    gsap.to([carbLbl, attack.g, attackT], { opacity: n === 0 ? 1 : 0, duration: d });
    gsap.to(anoLbl, { opacity: n >= 1 ? 1 : 0, duration: d, delay: n >= 1 && !inst ? 1.6 : 0 });
    gsap.to(glowC1, { opacity: n >= 1 ? 0.55 : 0, duration: d, delay: n >= 1 && !inst ? 1.6 : 0 });
    badge.textContent = ['', 'α or β?', 'α-D-glucose · OH down', 'β-D-glucose · OH up', 'α ⇌ β via the open chain'][n] || '';
    badge.style.fill = n === 2 ? 'var(--a2)' : n === 3 ? 'var(--a1)' : 'var(--fg)';
    gsap.fromTo(badge, { opacity: 0 }, { opacity: n ? 1 : 0, duration: d, delay: n === 1 && !inst ? 2 : 0 });
    gsap.to([b1open, t1a], { opacity: n === 0 ? 1 : 0.4, duration: d });
    gsap.to([b1ring, t1b], { opacity: n >= 1 ? 1 : 0.3, duration: d });
    gsap.to(bar2, { opacity: n >= 2 ? 1 : 0, duration: d });
    gsap.to(gA, { opacity: n === 3 ? 0.35 : 1, duration: d });
    gsap.to(gB, { opacity: n === 2 ? 0.35 : 1, duration: d });
    gsap.to(mut, { opacity: n >= 4 ? 1 : 0, duration: d });
    flows.forEach((f) => (n >= 4 ? f.play() : f.hide()));
    last = n;
    render();
  }
  render();
  return { step: apply, leave: () => { tl?.pause(); D.pauseAll(); }, enter: () => tl?.resume(), destroy: () => { tl?.kill(); D.destroy(); } };
}

// 8 · α vs β glucose in 3D, ring plane horizontal, C6 up
async function anomerViz(el) {
  const kit = createScene(el, { cam: [0, 4.8, 17], autoRotate: 0.9 });
  const ds = await Promise.all(['a-glucose', 'b-glucose'].map((k) => loadMol(k)));
  const items = ds.map((d, i) => {
    const w = new THREE.Group();
    const m = buildMolecule(d, { hideH: false, highlight: { atoms: [10, 4, 22], color: HX.acc } });
    const P = alignRing(m, [0, 10, 9, 7, 6, 8], 11, 10);
    w.add(m);
    const pO = P(4), pC = P(10), pC6 = P(11);
    const halo = glowSprite(HX.acc, 1.9);
    halo.position.copy(pO);
    w.add(halo);
    kit.label('C1 · anomeric', [pC.x + 1.0, pC.y - 0.95, pC.z], { cls: 'sm acc', parent: w });
    kit.label(i ? 'OH ↑ same side as C6' : 'OH ↓ opposite C6', i ? [pO.x + 0.2, pO.y + 1.05, pO.z] : [pO.x + 0.2, pO.y - 0.95, pO.z], { cls: 'sm', parent: w });
    kit.label('C6 (CH<sub>2</sub>OH)', [pC6.x - 0.2, pC6.y + 1.25, pC6.z], { cls: 'sm', parent: w });
    w.visible = i === 0;
    w.scale.setScalar(i ? 0.001 : 1);
    kit.root.add(w);
    return { w, halo };
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshBasicMaterial({ color: HX.acc, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.RingGeometry(2.27, 2.33, 96), new THREE.MeshBasicMaterial({ color: HX.acc, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  rim.rotation.x = -Math.PI / 2;
  kit.root.add(disc, rim);
  kit.fit(items[0].w, 0.98);
  kit.onFrame((dt, t) => items.forEach((it) => it.halo.scale.setScalar(1.7 + Math.sin(t * 2.4) * 0.35)));
  const cap = overlay(el, 'left:0;right:0;top:0;text-align:center');
  const name = h('div', { style: 'font:720 48px var(--font);letter-spacing:-.02em' });
  const pct = h('div', { style: 'font:760 30px var(--font);color:var(--fg-2);margin-top:6px' });
  cap.append(name, pct);
  let cur = 0;
  const set = (i) => {
    name.innerHTML = i ? '<span style="color:var(--a1)">β</span>-D-glucose' : '<span style="color:var(--a2)">α</span>-D-glucose';
    pct.innerHTML = i ? '64% at equilibrium' : '36% at equilibrium';
    if (i === cur) return;
    const a = items[cur].w, b = items[i].w;
    cur = i;
    gsap.killTweensOf([a.scale, b.scale]);
    gsap.to(a.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { a.visible = false; } });
    b.visible = true;
    gsap.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: 0.25, ease: 'back.out(1.6)' });
  };
  const sg = seg({ options: [{ v: 0, t: 'α · OH down' }, { v: 1, t: 'β · OH up' }], value: 0, onChange: set });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(0);
  return kitController(kit, { step: (n) => sg.set(n >= 1 ? 1 : 0) });
}

// 9 · Epimers: mannose | glucose | galactose (β-pyranoses, aligned)
async function epimerViz(el) {
  const kit = createScene(el, { cam: [0, 3.4, 16.8], autoRotate: 0 });
  const DEF = [
    { key: 'mannose', name: 'D-Mannose', col: 'var(--fadh)', x: -6.3 },
    { key: 'b-glucose', name: 'D-Glucose', col: 'var(--elec)', x: 0 },
    { key: 'galactose', name: 'D-Galactose', col: 'var(--a1)', x: 6.3 },
  ];
  const ds = await Promise.all(DEF.map((d) => loadMol(d.key)));
  const G2 = [9, 3, 21], G4 = [6, 1, 19];
  const items = DEF.map((d, i) => {
    const wrap = new THREE.Group();
    wrap.position.x = d.x;
    const spin = new THREE.Group();
    wrap.add(spin);
    const m = buildMolecule(ds[i], { hideH: 'nonpolar' });
    const P = alignRing(m, [0, 10, 9, 7, 6, 8], 11, 10);
    spin.add(m);
    const mk = (oi, ci, txt) => {
      const gl = glowSprite(HX.acc, 1.7);
      gl.position.copy(P(oi));
      gl.visible = false;
      spin.add(gl);
      const c = P(ci);
      const out = new THREE.Vector3(c.x, 0, c.z).normalize();
      const lb = kit.label(txt, [c.x + out.x * 1.15, c.y + 0.25, c.z + out.z * 1.15], { cls: 'sm acc', parent: spin });
      lb.visible = false;
      return { gl, lb };
    };
    const c2 = mk(3, 9, 'C2'), c4 = mk(1, 6, 'C4');
    kit.label(`<span style="color:${d.col}">●</span> ${d.name}`, [0, -3.1, 0], { parent: wrap });
    kit.root.add(wrap);
    return { ...d, wrap, spin, m, c2, c4 };
  });
  let th = 0.4;
  kit.onFrame((dt) => { th += dt * 0.42; items.forEach((it) => { it.spin.rotation.y = th; }); });
  const br = overlay(el, 'left:0;top:10px;opacity:0;text-align:center;transition:opacity .4s');
  const brT = h('div', { style: 'font:720 34px var(--font);letter-spacing:-.01em' });
  const brS = h('div', { style: 'font-size:24px;color:var(--fg-2);margin-top:2px' });
  const brL = h('div', { style: 'margin-top:12px;height:22px;border:3px solid var(--a1);border-bottom:0;border-radius:16px 16px 0 0;transition:border-color .4s' });
  br.append(brT, brS, brL);
  const MODES = {
    c2: { on: [[0, 'c2'], [1, 'c2']], col: HX.acc, css: 'var(--a1)', span: [0, 1], t: 'C2 epimers', s: 'Mannose and glucose differ only at C2' },
    c4: { on: [[1, 'c4'], [2, 'c4']], col: HX.acc, css: 'var(--a1)', span: [1, 2], t: 'C4 epimers', s: 'Glucose and galactose differ only at C4' },
    mg: { on: [[0, 'c2'], [2, 'c4']], col: HX.gold, css: 'var(--inh)', span: [0, 2], t: '✕ Not epimers', s: 'Mannose and galactose differ at C2 <b>and</b> C4' },
  };
  let span = null;
  const V0 = new THREE.Vector3();
  kit.onFrame(() => {
    if (!span) return;
    const p = (i) => { V0.set(items[i].x, 0, 0).project(kit.camera); return ((V0.x + 1) / 2) * kit.wrap.clientWidth; };
    const a = p(span[0]), b = p(span[1]);
    br.style.left = `${a - 90}px`;
    br.style.width = `${b - a + 180}px`;
  });
  function setMode(k) {
    items.forEach((it) => {
      paint(it.m, G2, null);
      paint(it.m, G4, null);
      [it.c2, it.c4].forEach((x) => { x.gl.visible = false; x.lb.visible = false; });
    });
    if (!k) { br.style.opacity = 0; span = null; return; }
    const M = MODES[k];
    M.on.forEach(([i, c]) => {
      const it = items[i];
      paint(it.m, c === 'c2' ? G2 : G4, M.col);
      const x = c === 'c2' ? it.c2 : it.c4;
      x.gl.visible = true;
      x.gl.material.color.setHex(M.col);
      x.lb.visible = true;
      x.lb.element.style.color = M.css;
    });
    span = M.span;
    br.style.opacity = 1;
    brT.innerHTML = M.t;
    brT.style.color = M.css;
    brS.innerHTML = M.s;
    brL.style.borderColor = M.css;
  }
  const sg = seg({ options: [{ v: 'c2', t: 'C2 epimers' }, { v: 'c4', t: 'C4 epimers' }, { v: 'mg', t: 'Mannose vs galactose' }], value: null, onChange: setMode });
  ctrlBar(el, [sg], { left: '50%', bottom: 0, transform: 'translateX(-50%)' });
  return kitController(kit, { step: (n) => { const k = [null, 'c2', 'c4', 'mg'][n]; if (k) sg.set(k); else { sg.set(null, false); setMode(null); } } });
}

// 10 · D/L enantiomers: glyceraldehyde + mirror, Fischer glucose pair
async function dlViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1040px 1fr';
  el.style.gap = '40px';
  const left = h('div', { style: 'position:relative;min-height:0' });
  const right = h('div', { style: 'position:relative;min-height:0' });
  el.append(left, right);
  const kit = createScene(left, { cam: [0, -0.3, 14.8], autoRotate: 0, target: [0, -0.5, 0] });
  const data = await loadMol('glyceraldehyde');
  const LBL = [[5, 'CHO'], [0, 'OH'], [6, 'H'], [4, 'CH<sub>2</sub>OH']];
  const build = () => {
    const m = buildMolecule(data, { hideH: false, highlight: { atoms: [3], color: HX.gold } });
    const P = m.userData.pos;
    const c = P[3];
    const yv = P[5].clone().sub(P[4]).normalize();
    const xv = P[0].clone().sub(P[6]);
    xv.sub(yv.clone().multiplyScalar(xv.dot(yv))).normalize();
    const zv = new THREE.Vector3().crossVectors(xv, yv);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, zv)).invert();
    m.quaternion.copy(q);
    m.position.copy(c.clone().applyQuaternion(q).negate());
    const halo = glowSprite(HX.gold, 1.6);
    halo.position.copy(c);
    m.add(halo);
    return m;
  };
  // labels live in the (world-aligned) spin frame so offsets read left/right/up/down
  const OFF = { 5: [-0.2, 0.75, 0], 0: [0.95, 0, 0], 6: [-0.7, 0, 0], 4: [-1.05, -0.95, 0.3] };
  const addLabels = (m, parent) => {
    const P = m.userData.pos;
    LBL.forEach(([i, txt]) => {
      const w = P[i].clone().applyQuaternion(m.quaternion).add(m.position).add(new THREE.Vector3(...OFF[i]));
      const lb = kit.label(txt, [w.x, w.y, w.z], { cls: 'sm plain', parent });
      if (i === 0) lb.element.style.color = 'var(--ink)';
    });
  };
  const spinL = new THREE.Group();
  const mL = build();
  spinL.add(mL);
  addLabels(mL, spinL);
  spinL.position.x = -2.9;
  const wrapR = new THREE.Group();
  wrapR.position.x = 2.9;
  wrapR.scale.x = -1;
  const spinR = new THREE.Group();
  const mR = build();
  spinR.add(mR);
  addLabels(mR, spinR);
  wrapR.add(spinR);
  kit.root.add(spinL, wrapR, mirrorPlane(4.4, 5.4));
  kit.onFrame((dt, t) => { const a = 0.55 * Math.sin(t * 0.7); spinL.rotation.y = a; spinR.rotation.y = a; });
  kit.label('<b>D</b>-glyceraldehyde', [-2.9, -3.0, 0]);
  kit.label('<b>L</b>-glyceraldehyde', [2.9, -3.0, 0]);
  kit.label('OH on the right', [-2.9, -3.72, 0], { cls: 'sm acc' });
  kit.label('OH on the left', [2.9, -3.72, 0], { cls: 'sm acc' });
  kit.label('mirror', [0, 2.95, 0], { cls: 'sm acc' });

  const D = diagram(right, 632, 720);
  D.svg.style.width = '100%';
  D.svg.style.height = '100%';
  const glu = s('g', { style: 'opacity:0' });
  const hiRow = s('rect', { x: 30, y: 386, width: 572, height: 50, rx: 25, style: 'fill:color-mix(in oklab, var(--a1) 16%, transparent);stroke:color-mix(in oklab, var(--a1) 60%, transparent);stroke-width:2;opacity:0' });
  D.layers.regions.append(hiRow);
  const fD = fischer(D, 160, 130, { top: 'CHO', rows: GLC_ROWS, bottom: 'CH_{2}OH', dy: 70, arm: 58, fs: 28, ohCol: 'var(--ink)' });
  const fL = fischer(D, 472, 130, { top: 'CHO', rows: GLC_ROWS.map(([a, b]) => [b, a]), bottom: 'CH_{2}OH', dy: 70, arm: 58, fs: 28, ohCol: 'var(--ink)' });
  glu.append(fD.g, fL.g);
  glu.append(s('line', { x1: 316, y1: 100, x2: 316, y2: 500, style: 'stroke:var(--a1);stroke-width:3;stroke-dasharray:8 10;opacity:.8' }));
  const t1 = s('text', { x: 160, y: 66, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:32px;font-weight:720' }); t1.innerHTML = '<tspan style="fill:var(--ink)">D</tspan>-glucose';
  const t2 = s('text', { x: 472, y: 66, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:32px;font-weight:720' }); t2.innerHTML = '<tspan style="fill:var(--ink)">L</tspan>-glucose';
  glu.append(t1, t2);
  D.layers.nodes.append(glu);
  const rule = s('g', { style: 'opacity:0' });
  const r1 = D.text(316, 540, 'C5 decides: farthest chiral C from C=O', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--ink)' });
  const r2 = D.text(160, 590, 'OH right → D', { anchor: 'middle', style: 'font-size:26px;fill:var(--fg-2)' });
  const r3 = D.text(472, 590, 'OH left → L', { anchor: 'middle', style: 'font-size:26px;fill:var(--fg-2)' });
  const bd = D.badge(316, 664, 'D/L ≠ (+)/(−) rotation', { color: 'var(--prot)', size: 26, w: 360, tip: { kicker: 'Accuracy note', title: 'Configuration, not rotation', body: 'The slide labels D “dextro” and L “levo”. D/L describes <b>configuration</b> at the reference carbon (compared with glyceraldehyde). The direction light is rotated, (+) or (−), is measured separately: D-fructose is levorotatory.', src: `${SRC(10)} · Lippincott` } });
  rule.append(r1, r2, r3, bd);
  D.layers.labels.append(rule);
  return kitController(kit, {
    step(n) {
      gsap.to(glu, { opacity: n >= 1 ? 1 : 0, duration: 0.6 });
      gsap.to([rule, hiRow], { opacity: n >= 2 ? 1 : 0, duration: 0.6 });
    },
    destroy: () => D.destroy(),
  });
}

// 11 · Isomer summary minis
function isoMini(el, kind) {
  const D = diagram(el, 316, 300);
  const hl = (x, y, w) => D.layers.regions.append(s('rect', { x, y: y - 21, width: w, height: 42, rx: 21, style: 'fill:color-mix(in oklab, var(--a1) 20%, transparent);stroke:color-mix(in oklab, var(--a1) 65%, transparent);stroke-width:2' }));
  const nm = (x, str, col = 'var(--fg)') => D.text(x, 26, str, { anchor: 'middle', style: `font-size:24px;font-weight:700;fill:${col}` });
  const o = { dy: 42, arm: 28, fs: 24 };
  const X1 = 72, X2 = 244, Y = 66;
  if (kind === 'epi') {
    hl(0, Y + 42, 316);
    fischer(D, X1, Y, { ...o, top: 'CHO', rows: GLC_ROWS, bottom: 'CH_{2}OH' });
    fischer(D, X2, Y, { ...o, top: 'CHO', rows: [['HO', 'H'], ...GLC_ROWS.slice(1)], bottom: 'CH_{2}OH' });
    nm(X1, 'Glucose', COL.glc); nm(X2, 'Mannose', COL.man);
  } else if (kind === 'ak') {
    hl(X1 - 50, Y, 100); hl(X2 - 50, Y + 42, 100);
    fischer(D, X1, Y, { ...o, top: 'CHO', rows: GLC_ROWS, bottom: 'CH_{2}OH' });
    fischer(D, X2, Y, { ...o, top: 'CH_{2}OH', rows: [null, ...GLC_ROWS.slice(1)], bottom: 'CH_{2}OH' });
    nm(X1, 'Glucose', COL.glc); nm(X2, 'Fructose', COL.fru);
  } else if (kind === 'ano') {
    const hex = (cx, up) => {
      const CYH = 165;
      const P = [[-50, 0], [-25, -28], [25, -28], [50, 0], [25, 28], [-25, 28]].map(([x, y]) => [cx + x, CYH + y]);
      D.layers.nodes.append(s('polygon', { points: P.map((p) => p.join(',')).join(' '), style: 'fill:color-mix(in oklab, var(--elec) 14%, transparent);stroke:var(--elec);stroke-width:3;stroke-linejoin:round' }));
      D.text(P[2][0], P[2][1] - 9, 'O', { anchor: 'middle', style: 'font-size:22px;font-weight:750;fill:var(--o2)' });
      D.layers.nodes.append(s('line', { x1: P[1][0], y1: P[1][1], x2: P[1][0], y2: P[1][1] - 30, style: 'stroke:var(--fg-3);stroke-width:3' }));
      D.text(P[1][0], P[1][1] - 38, 'C6', { anchor: 'middle', style: 'font-size:22px;fill:var(--fg-2)' });
      const y2 = up ? CYH - 52 : CYH + 52;
      D.layers.nodes.append(s('line', { x1: P[3][0], y1: CYH, x2: P[3][0], y2, style: 'stroke:var(--a1);stroke-width:4' }));
      hl(P[3][0] - 32, up ? y2 - 18 : y2 + 18, 64);
      D.text(P[3][0], up ? y2 - 10 : y2 + 26, 'OH', { anchor: 'middle', style: 'font-size:23px;font-weight:720;fill:var(--ink)' });
    };
    hex(76, false); hex(232, true);
    nm(76, 'α · 36%', 'var(--a2)'); nm(232, 'β · 64%', 'var(--a1)');
    D.text(158, 290, 'C1–OH: down vs up', { anchor: 'middle', style: 'font-size:22px;fill:var(--fg-2)' });
  } else {
    fischer(D, X1, Y, { ...o, top: 'CHO', rows: GLC_ROWS, bottom: 'CH_{2}OH', ohCol: 'var(--ink)' });
    fischer(D, X2, Y, { ...o, top: 'CHO', rows: GLC_ROWS.map(([a, b]) => [b, a]), bottom: 'CH_{2}OH', ohCol: 'var(--ink)' });
    D.layers.labels.append(s('line', { x1: 158, y1: 44, x2: 158, y2: 296, style: 'stroke:var(--a1);stroke-width:3;stroke-dasharray:6 8' }));
    nm(X1, 'D-glucose'); nm(X2, 'L-glucose');
  }
  return { destroy: () => D.destroy() };
}

// 12 · Derivative minis (before → after)
function derivMini(el, kind) {
  const D = diagram(el, 316, 160);
  const CY = 84;
  const ring = (cx) => {
    const P = [[-38, 0], [-19, -30], [19, -30], [38, 0], [19, 30], [-19, 30]].map(([x, y]) => [cx + x, CY + y]);
    D.layers.nodes.append(s('polygon', { points: P.map((p) => p.join(',')).join(' '), style: 'fill:color-mix(in oklab, var(--elec) 14%, transparent);stroke:var(--elec);stroke-width:3;stroke-linejoin:round' }));
    D.text(P[2][0], P[2][1] - 8, 'O', { anchor: 'middle', style: 'font-size:20px;font-weight:750;fill:var(--o2)' });
    return P;
  };
  const stick = (A, B) => D.layers.edges.append(s('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], style: 'stroke:var(--fg-3);stroke-width:3' }));
  const grp = (x, y, txt, hot) => {
    const t = D.text(x, y, txt, { anchor: 'middle', style: `font-size:22px;font-weight:${hot ? 760 : 600};fill:${hot ? 'var(--ink)' : 'var(--fg-2)'}` });
    if (hot) gsap.to(t, { opacity: 0.45, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    return t;
  };
  const arrow = (x1, x2, label) => {
    D.arrow({ from: [x1, CY], to: [x2, CY], color: 'var(--a1)', width: 3, headSize: 12 });
    if (label) D.text((x1 + x2) / 2, CY - 14, label, { anchor: 'middle', style: 'font-size:20px;font-weight:650;fill:var(--ink)' });
  };
  if (kind === 'amino' || kind === 'acid') {
    const A = ring(70), B = ring(248);
    arrow(118, 196, kind === 'amino' ? 'C2' : 'oxidise');
    if (kind === 'amino') {
      [[A, 'OH', false], [B, 'NH₃⁺', true]].forEach(([P, t, hot]) => { stick(P[4], [P[4][0], P[4][1] + 22]); grp(P[4][0], P[4][1] + 46, t, hot); });
    } else {
      [[A, 'CH₂OH', false], [B, 'COO⁻', true]].forEach(([P, t, hot]) => { stick(P[1], [P[1][0], P[1][1] - 22]); grp(P[1][0], P[1][1] - 34, t, hot); });
    }
  } else if (kind === 'alc') {
    const chain = (cx, top, hot) => {
      D.layers.edges.append(s('line', { x1: cx, y1: 56, x2: cx, y2: 152, style: 'stroke:var(--fg-3);stroke-width:3' }));
      [84, 114, 144].forEach((y) => D.layers.edges.append(s('line', { x1: cx - 18, y1: y, x2: cx + 18, y2: y, style: 'stroke:var(--fg-3);stroke-width:3' })));
      grp(cx, 44, top, hot);
    };
    chain(64, 'CHO', false); chain(250, 'CH₂OH', true);
    arrow(118, 196, 'reduce');
  } else {
    const P = ring(64);
    stick(P[3], [134, CY]);
    D.text(148, CY + 8, 'O', { anchor: 'middle', style: 'font-size:24px;font-weight:760;fill:var(--o2)' });
    stick([162, CY], [184, CY]);
    D.layers.nodes.append(s('rect', { x: 186, y: CY - 30, width: 126, height: 60, rx: 16, style: 'fill:color-mix(in oklab, var(--prot) 18%, transparent);stroke:var(--prot);stroke-width:3' }));
    D.text(249, CY + 8, 'non-sugar', { anchor: 'middle', style: 'font-size:22px;font-weight:720;fill:var(--prot)' });
  }
  return { destroy: () => D.destroy() };
}

// 13 · Sorbitol → cataract mechanism
function cataractViz(el) {
  const D = diagram(el, 960, 860);
  const eye = s('g', { transform: 'translate(480 170)' });
  eye.append(s('path', { d: 'M-320,0 C-200,-150 200,-150 320,0 C200,150 -200,150 -320,0 Z', style: 'fill:var(--surface);stroke:var(--line-2);stroke-width:3' }));
  eye.append(s('circle', { r: 110, style: 'fill:color-mix(in oklab, var(--prot) 34%, var(--bg));stroke:color-mix(in oklab, var(--prot) 60%, transparent);stroke-width:3' }));
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; eye.append(s('line', { x1: Math.cos(a) * 60, y1: Math.sin(a) * 60, x2: Math.cos(a) * 104, y2: Math.sin(a) * 104, style: 'stroke:color-mix(in oklab, var(--prot) 70%, transparent);stroke-width:2' })); }
  eye.append(s('circle', { r: 56, style: 'fill:#0b0b0e' }));
  const cloud = s('g', { style: 'opacity:0' });
  cloud.append(s('circle', { r: 56, style: 'fill:#d9e1e6;opacity:.72' }));
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; cloud.append(s('path', { d: `M0,0 L${Math.cos(a - 0.16) * 56},${Math.sin(a - 0.16) * 56} L${Math.cos(a + 0.16) * 56},${Math.sin(a + 0.16) * 56} Z`, style: 'fill:#ffffff;opacity:.55' })); }
  eye.append(cloud);
  eye.append(s('ellipse', { cx: -22, cy: -24, rx: 12, ry: 8, style: 'fill:#fff;opacity:.85' }));
  D.layers.nodes.append(eye);
  const lensT = D.text(640, 92, 'Lens (seen through pupil)', { style: 'font-size:24px;fill:var(--fg-2)' });
  const lensL = s('path', { d: 'M636,100 L540,150', style: 'stroke:var(--fg-3);stroke-width:2;fill:none' });
  D.layers.labels.append(lensL);
  const catT = D.text(480, 352, 'Cataract: clouding of the lens', { anchor: 'middle', style: 'font-size:30px;font-weight:720;fill:var(--inh);opacity:0' });
  // zoom lines
  D.layers.regions.append(s('path', { d: 'M426,190 L170,388 M534,190 L820,388', style: 'stroke:var(--line-2);stroke-width:2;stroke-dasharray:6 8;fill:none' }));
  // lens cell
  const mem = s('rect', { x: 170, y: 388, width: 650, height: 412, rx: 60, style: 'fill:var(--surface);stroke:color-mix(in oklab, var(--a2) 60%, transparent);stroke-width:5' });
  D.layers.regions.append(mem);
  D.text(206, 440, 'LENS CELL', { style: 'font-size:22px;letter-spacing:.16em;font-weight:700;fill:var(--fg-3)' });
  const enz = D.node({ x: 450, y: 600, label: 'Aldose reductase', kind: 'enz', color: 'var(--a1)', size: 26, tip: { kicker: 'Mechanism · Lippincott', title: 'Glucose → sorbitol', body: 'Aldose reductase (NADPH) reduces glucose to the sugar alcohol sorbitol. When glucose is high, sorbitol accumulates.', src: `${SRC(16)} · Lippincott` } });
  const gPath = s('path', { d: 'M0,600 L310,600', style: 'fill:none;stroke:none' });
  const sPath = s('path', { d: 'M590,600 L660,600', style: 'fill:none;stroke:none' });
  D.layers.fx.append(gPath, sPath);
  const gluT = D.text(0, 560, 'Glucose ↑', { style: 'font-size:26px;font-weight:700;fill:var(--elec)' });
  const fG = D.flow(gPath, { count: 4, color: COL.glc, speed: 160, r: 11, autoplay: false });
  const fS = D.flow(sPath, { count: 2, color: COL.man, speed: 90, r: 9, autoplay: false });
  const sorb = s('g', { style: 'opacity:0' });
  let seed = 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 16; i++) {
    const x = 684 + (i % 4) * 34 + rnd() * 8, y = 540 + Math.floor(i / 4) * 38 + rnd() * 8;
    sorb.append(s('rect', { x: x - 16, y: y - 8, width: 32, height: 16, rx: 8, transform: `rotate(${rnd() * 60 - 30} ${x} ${y})`, style: `fill:${COL.man}` }));
  }
  D.layers.nodes.append(sorb);
  const sorbT = D.text(736, 508, 'Sorbitol trapped', { anchor: 'middle', style: `font-size:26px;font-weight:700;fill:${COL.man};opacity:0` });
  const wPaths = ['M480,860 L480,760', 'M958,520 L790,545', 'M958,730 L790,700', 'M300,860 L330,760'].map((d) => { const p = s('path', { d, style: 'fill:none;stroke:none' }); D.layers.fx.append(p); return p; });
  const fW = wPaths.map((p) => D.flow(p, { count: 3, color: COL.water, speed: 120, r: 8, autoplay: false }));
  const wT = D.text(560, 852, 'H₂O in by osmosis', { style: 'font-size:24px;font-weight:650;fill:var(--nadh);opacity:0' });
  const all = [fG, fS, ...fW];
  all.forEach((f) => f.hide());
  return {
    step(n) {
      n >= 1 ? fG.play() : fG.hide();
      gsap.to([enz.g, gluT], { opacity: n >= 1 ? 1 : 0.35, duration: 0.5 });
      n >= 2 ? fS.play() : fS.hide();
      gsap.to([sorb, sorbT], { opacity: n >= 2 ? 1 : 0, duration: 0.6 });
      fW.forEach((f) => (n >= 3 ? f.play() : f.hide()));
      gsap.to(wT, { opacity: n >= 3 ? 1 : 0, duration: 0.5 });
      gsap.to(mem, { attr: n >= 3 ? { x: 150, y: 372, width: 690, height: 444 } : { x: 170, y: 388, width: 650, height: 412 }, duration: 1.2, ease: 'elastic.out(1, 0.6)' });
      gsap.to([cloud, catT], { opacity: n >= 4 ? 1 : 0, duration: 1 });
      gsap.to([lensT, lensL], { opacity: n >= 4 ? 0 : 1, duration: 0.5 });
    },
    leave: () => D.pauseAll(),
    destroy: () => D.destroy(),
  };
}

// 14 · Glycosidic bond: condensation / hydrolysis
function glycoViz(el) {
  const D = diagram(el, 1712, 720);
  const CY = 320, R = 108;
  const hexPath = Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return `${(R * Math.cos(a)).toFixed(1)},${(R * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const mkRing = (col, name) => {
    const g = s('g');
    g.append(s('polygon', { points: hexPath, style: `fill:color-mix(in oklab, ${col} 20%, transparent);stroke:${col};stroke-width:5;stroke-linejoin:round` }));
    const ox = R * Math.cos(-Math.PI / 3), oy = R * Math.sin(-Math.PI / 3);
    g.append(s('circle', { cx: ox, cy: oy, r: 17, style: 'fill:color-mix(in oklab, var(--o2) 26%, var(--bg));stroke:var(--o2);stroke-width:2' }));
    const ot = s('text', { x: ox, y: oy + 7, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:20px;font-weight:760;fill:var(--o2)' });
    ot.textContent = 'O';
    g.append(ot);
    const nt = s('text', { y: R + 56, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:620;fill:var(--fg-2)' });
    nt.textContent = name;
    g.append(nt);
    D.layers.nodes.append(g);
    return { g, nt };
  };
  const RL = mkRing(COL.glc, 'Monosaccharide'), RR = mkRing(COL.fru, 'Monosaccharide');
  const mkAtom = (txt, isO) => {
    const g = s('g');
    g.append(s('circle', { r: isO ? 22 : 16, style: isO ? 'fill:color-mix(in oklab, var(--o2) 26%, var(--bg));stroke:var(--o2);stroke-width:3' : 'fill:var(--surface-3);stroke:var(--line-2);stroke-width:2' }));
    const t = s('text', { y: isO ? 9 : 8, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${isO ? 25 : 22}px;font-weight:760;fill:${isO ? 'var(--o2)' : 'var(--fg)'}` });
    t.textContent = txt;
    g.append(t);
    D.layers.nodes.append(g);
    return g;
  };
  const mkLine = (w = 5) => { const l = s('line', { style: `stroke:var(--fg-2);stroke-width:${w};stroke-linecap:round` }); D.layers.edges.append(l); return l; };
  const OL = mkAtom('O', true), HL = mkAtom('H'), OR = mkAtom('O', true), HR = mkAtom('H');
  const bLO = mkLine(), bOH = mkLine(4), bRO = mkLine(), bOHr = mkLine(4), bBr = mkLine(6);
  const glowB = s('circle', { r: 40, style: 'fill:var(--atp);opacity:0', filter: `url(#${D.glowId})` });
  D.layers.fx.append(glowB);
  const drop = s('g', { style: 'opacity:0' });
  drop.append(s('path', { d: 'M0,-58 C22,-26 44,-6 44,20 A44,44 0 1 1 -44,20 C-44,-6 -22,-26 0,-58 Z', style: 'fill:color-mix(in oklab, var(--nadh) 30%, transparent);stroke:var(--nadh);stroke-width:3' }));
  const dt = s('text', { y: 30, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:760;fill:var(--nadh)' });
  setRich(dt, 'H_{2}O');
  drop.append(dt);
  D.layers.labels.append(drop);
  const ell = s('ellipse', { cx: 856, cy: CY, rx: 290, ry: 62, style: 'fill:none;stroke:var(--inh);stroke-width:3;stroke-dasharray:10 10' });
  D.layers.regions.append(ell);
  const ellT = D.text(856, CY - 82, 'these leave as water', { anchor: 'middle', style: 'font-size:24px;font-weight:600;fill:var(--inh)' });
  const glyT = s('g', { style: 'opacity:0' });
  glyT.append(s('path', { d: 'M856,196 L856,286', style: 'stroke:var(--atp);stroke-width:3;fill:none' }));
  const gt = D.text(856, 182, 'Glycosidic bond', { anchor: 'middle', style: 'font-size:32px;font-weight:720;fill:var(--atp)' });
  glyT.append(gt);
  D.layers.labels.append(glyT);
  const diT = D.text(856, CY + 150, 'Disaccharide', { anchor: 'middle', style: 'font-size:30px;font-weight:680;fill:var(--fg);opacity:0' });
  const proc = D.text(856, 60, '', { anchor: 'middle', style: 'font-size:40px;font-weight:740;letter-spacing:-.02em;fill:var(--ink)' });
  const enz = D.node({ x: 856, y: 150, label: 'Enzyme', kind: 'enz', color: 'var(--nadh)', size: 28, tip: { title: 'Hydrolysis', body: 'Glycosidic bonds are broken by enzymes, adding water back.', src: SRC(18) } });
  enz.g.style.opacity = 0;
  const eq = D.text(856, 690, '', { anchor: 'middle', style: 'font-size:30px;font-weight:600;fill:var(--fg-2)' });
  const ringV = (cx, side) => [cx + side * R, CY];
  const st = { j: 0 };
  const P = (g, x, y) => g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  const L = (l, A, B, op, ra = 0, rb = 0) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1;
    l.setAttribute('x1', A[0] + (dx / d) * ra); l.setAttribute('y1', A[1] + (dy / d) * ra);
    l.setAttribute('x2', B[0] - (dx / d) * rb); l.setAttribute('y2', B[1] - (dy / d) * rb);
    l.style.opacity = op;
  };
  function render() {
    const j = st.j;
    const a = ez(clamp01(j / 0.42)), b = ez(clamp01((j - 0.32) / 0.68));
    const cxL = lerp(420, 672, b), cxR = lerp(1292, 1040, b);
    P(RL.g, cxL, CY); P(RR.g, cxR, CY);
    const vL = ringV(cxL, 1), vR = ringV(cxR, -1);
    const pOL = [lerp(vL[0] + 74, 856, a), lerp(CY, 452, a)];
    const pHL = [lerp(vL[0] + 74 + 50, 884, a), lerp(CY, 476, a)];
    const pHR = [lerp(vR[0] - 74 - 50, 828, a), lerp(CY, 476, a)];
    const pOR = [lerp(vR[0] - 74, 856, b), CY];
    P(OL, ...pOL); P(HL, ...pHL); P(HR, ...pHR); P(OR, ...pOR);
    const fade = 1 - clamp01((j - 0.36) / 0.08);
    [OL, HL, HR].forEach((g) => { g.style.opacity = fade; });
    L(bLO, vL, pOL, 1 - a, 4, 22);
    L(bOH, pOL, pHL, 1 - a, 22, 16);
    L(bOHr, pOR, pHR, 1 - a, 22, 16);
    L(bRO, vR, pOR, 1, 4, 22);
    L(bBr, vL, pOR, clamp01((j - 0.72) / 0.22), 4, 22);
    drop.style.opacity = clamp01((j - 0.38) / 0.08);
    P(drop, 856, lerp(470, 572, ez(clamp01((j - 0.42) / 0.58))));
    glowB.setAttribute('cx', pOR[0]); glowB.setAttribute('cy', CY);
    glowB.style.opacity = clamp01((j - 0.85) / 0.15) * 0.6;
    glyT.style.opacity = clamp01((j - 0.85) / 0.15);
    [RL.nt, RR.nt].forEach((t) => { t.style.opacity = 1 - b; });
    diT.style.opacity = clamp01((j - 0.8) / 0.2);
  }
  let mode = 0, tw = null;
  function go(n, inst) {
    tw?.kill();
    mode = n;
    tw = gsap.to(st, { j: n === 1 ? 1 : 0, duration: inst ? 0 : 2.4, ease: 'power1.inOut', onUpdate: render, onComplete: render });
    proc.textContent = ['', 'Condensation · dehydration', 'Hydrolysis'][n];
    proc.style.fill = n === 2 ? 'var(--nadh)' : 'var(--ink)';
    gsap.to(enz.g, { opacity: n === 2 ? 1 : 0, duration: 0.5 });
    gsap.to([ell, ellT], { opacity: n === 0 ? 1 : 0, duration: 0.5 });
    eq.textContent = ['–OH  +  HO–  : one OH from each sugar', 'Sugar–OH + HO–Sugar  →  Sugar–O–Sugar + H₂O', 'Sugar–O–Sugar + H₂O  →  Sugar–OH + HO–Sugar'][n];
    sg.set(n === 2 ? 2 : n === 1 ? 1 : 0, false);
    render();
  }
  const sg = seg({ options: [{ v: 1, t: 'Condense' }, { v: 2, t: 'Hydrolyse' }], value: 0, onChange: (v) => go(v) });
  ctrlBar(el, [sg], { right: 0, bottom: 0 });
  let first = true;
  go(0, true);
  return {
    step(n) { if (n === mode && !first) return; go(n, first); first = false; },
    destroy: () => { tw?.kill(); D.destroy(); },
  };
}

// 15 · Disaccharides in 3D
function splitResidues(data, glyO) {
  const nbr = data.atoms.map(() => []);
  data.bonds.forEach(([a, b]) => { nbr[a].push(b); nbr[b].push(a); });
  const grow = (start) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) { const v = stack.pop(); nbr[v].forEach((w) => { if (w !== glyO && !seen.has(w)) { seen.add(w); stack.push(w); } }); }
    return seen;
  };
  return nbr[glyO].map(grow);
}
async function disViz(el) {
  const kit = createScene(el, { cam: [0, 2.4, 18], autoRotate: 0.8 });
  const DEF = [
    { key: 'maltose', name: 'Maltose', parts: [['Glucose', 'glc'], ['Glucose', 'glc']], bond: 'α(1→4)', red: true, gly: 0, aC: 13, free: 8 },
    { key: 'lactose', name: 'Lactose', parts: [['Galactose', 'gal'], ['Glucose', 'glc']], bond: 'β(1→4)', red: true, gly: 0, aC: 13, free: 8 },
    { key: 'sucrose', name: 'Sucrose', parts: [['Glucose', 'glc'], ['Fructose', 'fru']], bond: 'α1→β2', red: false, gly: 1, aC: 15 },
  ];
  const ds = await Promise.all(DEF.map((d) => loadMol(d.key)));
  const items = DEF.map((d, i) => {
    const data = ds[i];
    const sets = splitResidues(data, d.gly);
    const A = sets.find((x) => x.has(d.aC)), B = sets.find((x) => !x.has(d.aC));
    const m = buildMolecule(data, { color: (a, k) => (a[0] === 'C' ? (A.has(k) ? HX[d.parts[0][1]] : HX[d.parts[1][1]]) : undefined), highlight: { atoms: [d.gly], color: HX.gold } });
    const P = m.userData.pos;
    const g = glowSprite(HX.gold, 1.9);
    g.position.copy(P[d.gly]);
    m.add(g);
    const cen = (set) => { const v = new THREE.Vector3(); let c = 0; set.forEach((k) => { if (data.atoms[k][0] !== 'H') { v.add(P[k]); c++; } }); return v.multiplyScalar(1 / c); };
    [[A, 0], [B, 1]].forEach(([set, k]) => { const c = cen(set); kit.label(`<span style="color:${COL[d.parts[k][1]]}">${d.parts[k][0]}</span>`, [c.x, c.y + 2.1, c.z], { cls: 'sm', parent: m }); });
    const pg = P[d.gly];
    kit.label(d.bond, [pg.x, pg.y - 1.0, pg.z], { cls: 'sm acc', parent: m });
    if (d.red) {
      const fo = P[d.free];
      const fg = glowSprite(HX.acc, 1.7);
      fg.position.copy(fo);
      m.add(fg);
      kit.label('free anomeric OH', [fo.x, fo.y - 0.9, fo.z], { cls: 'sm', parent: m });
    }
    m.visible = i === 0;
    m.scale.setScalar(i ? 0.001 : 1);
    kit.root.add(m);
    return m;
  });
  kit.fit(items[0], 0.9);
  const cap = overlay(el, 'left:0;right:0;top:0;text-align:center');
  const name = h('div', { style: 'font:720 48px var(--font);letter-spacing:-.02em' });
  const parts = h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:4px' });
  const bdg = h('div', { style: 'margin-top:12px' });
  cap.append(name, parts, bdg);
  let cur = 0;
  const set = (i) => {
    const d = DEF[i];
    name.textContent = d.name;
    parts.innerHTML = `<span style="color:${COL[d.parts[0][1]]}">${d.parts[0][0]}</span> + <span style="color:${COL[d.parts[1][1]]}">${d.parts[1][0]}</span> · <span style="color:var(--atp)">${d.bond}</span>`;
    bdg.innerHTML = d.red ? '<span class="chip act" style="font-size:26px">Reducing</span>' : '<span class="chip inh" style="font-size:26px">Non-reducing · both anomeric C in the bond</span>';
    if (i === cur) return;
    const a = items[cur], b = items[i];
    cur = i;
    gsap.killTweensOf([a.scale, b.scale]);
    gsap.to(a.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { a.visible = false; } });
    b.visible = true;
    gsap.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: 0.25, ease: 'back.out(1.6)' });
  };
  const sg = seg({ options: DEF.map((d, i) => ({ v: i, t: d.name })), value: 0, onChange: set });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(0);
  return kitController(kit, { step: (n) => sg.set(Math.min(2, n)) });
}

// 16 / 24 · Two MCQs with reveal
function mcqViz(el, qs) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '40px';
  const cards = qs.map((q) => {
    const opts = q.opts.map((o, i) => h('div', { style: 'display:flex;gap:18px;align-items:center;padding:10px 20px;border-radius:20px;font-size:30px;border:1px solid transparent;transition:background .5s var(--ease),opacity .5s var(--ease),border-color .5s' }, [
      h('span', { style: 'font:700 22px var(--mono);width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--line-2);flex:none;transition:all .4s', text: 'abcde'[i] }),
      h('span', { html: o }),
    ]));
    const ex = h('div', { style: 'font-size:26px;color:var(--fg-2);line-height:1.4;opacity:0;margin-top:10px;transition:opacity .5s', html: q.why });
    const card = h('div', { style: 'padding:38px 44px;border-radius:36px;background:var(--surface);border:1px solid var(--line);display:flex;flex-direction:column;gap:6px' }, [
      h('div', { style: 'font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);font-weight:650', html: q.k }),
      h('div', { style: 'font-size:38px;font-weight:660;letter-spacing:-.015em;line-height:1.22;margin:4px 0 14px', html: q.q }),
      ...opts, ex,
    ]);
    el.append(card);
    return { opts, ex, ans: q.ans };
  });
  const reveal = (c, on) => {
    c.opts.forEach((o, j) => {
      const ok = j === c.ans;
      o.style.background = on && ok ? 'color-mix(in oklab, var(--act) 18%, transparent)' : 'transparent';
      o.style.borderColor = on && ok ? 'color-mix(in oklab, var(--act) 55%, transparent)' : 'transparent';
      o.style.opacity = on && !ok ? 0.35 : 1;
      const b = o.firstChild;
      b.style.background = on && ok ? 'var(--act)' : 'transparent';
      b.style.color = on && ok ? 'var(--bg)' : '';
      b.style.borderColor = on && ok ? 'var(--act)' : 'var(--line-2)';
    });
    c.ex.style.opacity = on ? 1 : 0;
  };
  return { step: (n) => cards.forEach((c, i) => reveal(c, n > i)) };
}

// 17 · Polysaccharide card minis
function glycogenMini(el) {
  const D = diagram(el, 472, 290);
  const beads = [], links = [];
  const SP = 12.5;
  const grow = (x, y, ang, depth, len, parent) => {
    let prev = parent;
    for (let i = 1; i <= len; i++) {
      const nx = x + Math.cos(ang) * SP * i, ny = y + Math.sin(ang) * SP * i;
      const id = beads.push({ x: nx, y: ny, d: Math.hypot(nx - 236, ny - 145) }) - 1;
      links.push([prev, id]);
      prev = id;
      if (depth < 3 && (i === 2 || i === len)) grow(nx, ny, ang + (i === 2 ? 0.75 : -0.7), depth + 1, len - 1, id);
    }
  };
  beads.push({ x: 236, y: 145, d: 0 });
  for (let k = 0; k < 6; k++) grow(236, 145, (k * Math.PI) / 3 + 0.3, 0, 4, 0);
  const g = s('g');
  links.forEach(([a, b]) => g.append(s('line', { x1: beads[a].x, y1: beads[a].y, x2: beads[b].x, y2: beads[b].y, style: 'stroke:var(--line-2);stroke-width:2.5' })));
  const dots = beads.map((b, i) => { const c = s('circle', { cx: b.x, cy: b.y, r: i ? 6 : 10, style: `fill:${i ? COL.glc : 'var(--atp)'}` }); g.append(c); return c; });
  D.layers.nodes.append(g);
  const order = dots.map((d, i) => i).sort((a, b) => beads[a].d - beads[b].d);
  gsap.fromTo(order.map((i) => dots[i]), { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.012, delay: 0.4 });
  gsap.to(g, { rotation: 360, svgOrigin: '236 145', duration: 90, repeat: -1, ease: 'none' });
  return { destroy: () => { gsap.killTweensOf(g); D.destroy(); } };
}
function dextranMini(el) {
  const D = diagram(el, 472, 250);
  D.layers.regions.append(s('rect', { x: 0, y: 14, width: 472, height: 104, rx: 52, style: 'fill:color-mix(in oklab, var(--inh) 14%, transparent);stroke:color-mix(in oklab, var(--inh) 45%, transparent);stroke-width:2' }));
  D.layers.regions.append(s('rect', { x: 0, y: 150, width: 472, height: 96, rx: 28, style: 'fill:var(--surface-2);stroke:var(--line);stroke-width:2' }));
  D.text(28, 54, 'Vessel', { style: 'font-size:22px;font-weight:650;fill:var(--inh)' });
  D.text(28, 236, 'Interstitium', { style: 'font-size:22px;font-weight:650;fill:var(--fg-2)' });
  [[150, 64], [270, 86], [380, 58]].forEach(([x, y]) => { for (let i = 0; i < 5; i++) D.layers.nodes.append(s('circle', { cx: x + i * 13, cy: y + Math.sin(i) * 6, r: 6.5, style: `fill:${COL.glc}` })); });
  [100, 210, 320, 430].forEach((x, i) => { const p = s('path', { d: `M${x},${236 - (i % 2) * 20} L${x + 8},${80}`, style: 'fill:none;stroke:none' }); D.layers.fx.append(p); D.flow(p, { count: 2, color: COL.water, speed: 70, r: 6 }); });
  return { destroy: () => D.destroy() };
}
function inulinMini(el) {
  const D = diagram(el, 472, 250);
  D.layers.regions.append(s('path', { d: 'M120,70 A62,62 0 1 0 120,190', style: 'fill:none;stroke:var(--line-2);stroke-width:4' }));
  D.layers.regions.append(s('path', { d: 'M40,130 C60,80 100,80 100,110 C100,140 60,150 70,170 C80,190 110,170 104,150', style: 'fill:none;stroke:color-mix(in oklab, var(--inh) 70%, transparent);stroke-width:6;stroke-linecap:round' }));
  D.layers.regions.append(s('path', { d: 'M120,70 L300,70 C360,70 360,190 420,190 L470,190', style: 'fill:none;stroke:var(--line-2);stroke-width:26;stroke-linecap:round;opacity:.5' }));
  const p1 = s('path', { d: 'M0,40 C40,40 50,110 80,120', style: 'fill:none;stroke:none' });
  const p2 = s('path', { d: 'M110,120 C150,80 200,70 300,70 C360,70 360,190 420,190 L472,190', style: 'fill:none;stroke:none' });
  D.layers.fx.append(p1, p2);
  D.flow(p1, { count: 2, color: COL.man, speed: 70, r: 7 });
  D.flow(p2, { count: 4, color: COL.man, speed: 110, r: 7 });
  D.text(20, 236, 'Filtered', { style: 'font-size:22px;font-weight:650;fill:var(--fg-2)' });
  D.text(220, 40, 'Not reabsorbed', { style: 'font-size:22px;font-weight:650;fill:var(--fg-2)' });
  D.text(466, 236, 'Urine', { anchor: 'end', style: 'font-size:22px;font-weight:700;fill:var(--fadh)' });
  return { destroy: () => D.destroy() };
}

const POLY = [
  { k: 'Storage', title: 'Glycogen', body: '<b>D-glucose</b> · highly branched, compact — low osmotic pressure', viz: glycogenMini, tip: { title: 'Glycogen', body: 'Unit: D-glucose. Highly branched, compact, water-soluble yet has low osmotic pressure (unlike free glucose). Role: <b>storage</b>.', src: SRC(23) } },
  { k: 'Plasma expander', title: 'Dextran', body: '<b>D-glucose</b> · very soluble — same oncotic pressure as plasma', viz: dextranMini, tip: { title: 'Dextran', body: 'Unit: D-glucose. Non-toxic, stable, highly water-soluble, same oncotic pressure as plasma. Role: <b>plasma expander</b>.', src: SRC(23) } },
  { k: 'Measures GFR', title: 'Inulin', body: '<b>D-fructose</b> · not made or metabolised — all excreted in urine', viz: inulinMini, tip: { title: 'Inulin', body: 'Unit: D-fructose. Low MW, soluble, neither synthesised nor metabolised by the body, totally excreted in urine. Role: <b>measures GFR</b> (textbook: freely filtered, not reabsorbed or secreted).', src: `${SRC(23)} · Lippincott` } },
];
function polyViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = 'repeat(3, 1fr)';
  el.style.gap = '28px';
  const ctrls = POLY.map((c) => {
    const v = h('div.viz', { style: 'flex:1;min-height:0;display:flex;align-items:center' });
    const card = h('div.card', { style: 'padding:40px 44px' }, [h('div.k', { html: c.k }), h('h3', { html: c.title }), h('p', { html: c.body }), v, h('div.glow')]);
    tip(card, c.tip);
    el.append(card);
    return c.viz(v) || {};
  });
  return { destroy: () => ctrls.forEach((x) => x.destroy?.()) };
}

// 18 · Dextran case
function dextranCaseViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '600px 1fr';
  el.style.gap = '48px';
  const leftCol = h('div', { style: 'display:flex;flex-direction:column;gap:24px;min-height:0' });
  const card = h('div.case', { style: 'padding:44px 48px' }, [
    h('div.tag', { html: '● Clinical case' }),
    h('p', { style: 'font-size:32px', html: 'A <b>42-year-old man</b> after a severe car accident. An IV <b>dextran</b> infusion is started.' }),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;margin-top:26px' }, [
      h('span.chip.inh', { style: 'font-size:27px', text: 'BP 82/44 mmHg' }),
      h('span.chip.inh', { style: 'font-size:27px', text: 'HR 128/min' }),
    ]),
  ]);
  const mech = h('div', { style: 'position:relative;flex:1;min-height:0;opacity:0;transition:opacity .6s' });
  leftCol.append(card, mech);
  const D = diagram(mech, 600, 250);
  D.svg.style.width = '100%';
  D.svg.style.height = '100%';
  D.layers.regions.append(s('rect', { x: 0, y: 10, width: 600, height: 100, rx: 50, style: 'fill:color-mix(in oklab, var(--inh) 14%, transparent);stroke:color-mix(in oklab, var(--inh) 45%, transparent);stroke-width:2' }));
  D.layers.regions.append(s('rect', { x: 0, y: 150, width: 600, height: 92, rx: 28, style: 'fill:var(--surface-2);stroke:var(--line);stroke-width:2' }));
  D.text(28, 50, 'Vessel · dextran stays in', { style: 'font-size:24px;font-weight:650;fill:var(--inh)' });
  D.text(28, 232, 'Interstitium', { style: 'font-size:24px;font-weight:650;fill:var(--fg-2)' });
  [[330, 62], [440, 82], [520, 54]].forEach(([x, y]) => { for (let i = 0; i < 5; i++) D.layers.nodes.append(s('circle', { cx: x + i * 14, cy: y + Math.sin(i) * 6, r: 7, style: `fill:${COL.glc}` })); });
  const flows = [90, 200, 310, 420, 530].map((x, i) => { const p = s('path', { d: `M${x},${232 - (i % 2) * 22} L${x + 10},${78}`, style: 'fill:none;stroke:none' }); D.layers.fx.append(p); return D.flow(p, { count: 2, color: COL.water, speed: 80, r: 7, autoplay: false }); });
  flows.forEach((f) => f.hide());
  const opts = [
    'Triggers NO release → vasoconstriction',
    'Draws water from the interstitium into vessels',
    'Inhibits renal tubular water reabsorption',
    'Is metabolised into albumin',
    'Increases the viscosity of the blood',
  ];
  const right = h('div', { style: 'display:flex;flex-direction:column;gap:8px;min-height:0' });
  right.append(h('div', { style: 'font-size:36px;font-weight:660;letter-spacing:-.015em;line-height:1.22;margin-bottom:14px', html: 'How does dextran <b>restore intravascular volume</b>?' }));
  const rows = opts.map((o, i) => {
    const r = h('div', { style: 'display:flex;gap:18px;align-items:center;padding:12px 22px;border-radius:20px;font-size:29px;border:1px solid var(--line);background:var(--surface);transition:background .5s,opacity .5s,border-color .5s' }, [
      h('span', { style: 'font:700 22px var(--mono);width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--line-2);flex:none', text: 'abcde'[i] }),
      h('span', { html: o }),
    ]);
    right.append(r);
    return r;
  });
  const why = h('div', { style: 'font-size:26px;color:var(--fg-2);line-height:1.4;margin-top:14px;opacity:0;transition:opacity .5s', html: 'Dextran is <b>highly water-soluble</b> with the <b>same oncotic pressure as plasma</b>: a plasma expander that pulls interstitial water into the vessels.' });
  right.append(why);
  el.append(leftCol, right);
  return {
    step(n) {
      rows.forEach((r, i) => {
        const ok = i === 1;
        r.style.background = n >= 1 && ok ? 'color-mix(in oklab, var(--act) 18%, transparent)' : 'var(--surface)';
        r.style.borderColor = n >= 1 && ok ? 'color-mix(in oklab, var(--act) 55%, transparent)' : 'var(--line)';
        r.style.opacity = n >= 1 && !ok ? 0.35 : 1;
      });
      why.style.opacity = n >= 1 ? 1 : 0;
      mech.style.opacity = n >= 2 ? 1 : 0;
      flows.forEach((f) => (n >= 2 ? f.play() : f.hide()));
    },
    leave: () => D.pauseAll(),
    destroy: () => D.destroy(),
  };
}

// 20 · GAG structure & name
function gagViz(el) {
  const D = diagram(el, 1712, 720);
  const X0 = 168, BY = 290, BW = 150, BH = 76, UW = 354;
  const words = [
    { x: 600, t: 'Glycos-', m: 'sugar' },
    { x: 856, t: '-amino-', m: 'amino group' },
    { x: 1112, t: '-glycan', m: 'polysaccharide' },
  ].map((w) => ({ ...w, el: D.text(w.x, 92, w.t, { anchor: 'middle', style: 'font-size:62px;font-weight:740;letter-spacing:-.02em;fill:var(--fg-3);transition:fill .4s' }), me: D.text(w.x, 138, w.m, { anchor: 'middle', style: 'font-size:26px;font-weight:600;fill:var(--fg-2);opacity:.5;transition:opacity .4s' }) }));
  const boxes = [], aminos = [], charges = [], linkG = s('g');
  D.layers.edges.append(linkG);
  for (let u = 0; u < 4; u++) {
    const ax = X0 + u * UW, bx = ax + BW + 14;
    linkG.append(s('line', { x1: ax + BW, y1: BY + BH / 2, x2: bx, y2: BY + BH / 2, style: 'stroke:var(--fg-3);stroke-width:5' }));
    if (u < 3) {
      const sx = bx + BW + 20;
      linkG.append(s('line', { x1: bx + BW, y1: BY + BH / 2, x2: bx + BW + 40, y2: BY + BH / 2, style: 'stroke:var(--fg-3);stroke-width:5' }));
      linkG.append(s('line', { x1: sx - 9, y1: BY + BH / 2 + 18, x2: sx + 9, y2: BY + BH / 2 - 18, style: 'stroke:var(--fg);stroke-width:5;stroke-linecap:round' }));
    }
    [[ax, 'Amino sugar', 'var(--a1)'], [bx, 'Sugar acid', 'var(--a2)']].forEach(([x, t, c]) => {
      const g = s('g');
      g.append(s('rect', { x, y: BY, width: BW, height: BH, rx: 16, style: `fill:color-mix(in oklab, ${c} 20%, var(--bg));stroke:${c};stroke-width:3;transition:stroke-width .3s` }));
      const tx = s('text', { x: x + BW / 2, y: BY + BH / 2 + 8, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:23px;font-weight:650' });
      tx.textContent = t;
      g.append(tx);
      D.layers.nodes.append(g);
      boxes.push(g);
    });
    const pend = (cx, label, col, w = 50) => {
      const g = s('g');
      g.append(s('line', { x1: cx, y1: BY + BH, x2: cx, y2: 404, style: 'stroke:var(--fg-3);stroke-width:4' }));
      g.append(s('rect', { x: cx - w / 2, y: 404, width: w, height: 48, rx: 24, style: `fill:color-mix(in oklab, ${col} 26%, var(--bg));stroke:${col};stroke-width:3` }));
      const t = s('text', { x: cx, y: 436, 'text-anchor': 'middle', class: 'v-label', style: `font-size:23px;font-weight:720;fill:${col}` });
      setRich(t, label);
      g.append(t);
      D.layers.nodes.append(g);
      return g;
    };
    const chg = (cx, cy) => {
      const g = s('g', { transform: `translate(${cx} ${cy})` });
      const inner = s('g');
      inner.append(s('circle', { r: 15, style: 'fill:var(--inh)' }), s('rect', { x: -7, y: -2, width: 14, height: 4, rx: 2, style: 'fill:var(--bg)' }));
      g.append(inner);
      D.layers.labels.append(g);
      charges.push(inner);
    };
    aminos.push(pend(ax + BW / 2 - (u === 2 ? 30 : 0), 'N', 'var(--fadh)'));
    pend(bx + BW / 2 + (u === 3 ? 30 : 0), 'COO', 'var(--atp)', 76);
    chg(bx + BW / 2 + (u === 3 ? 30 : 0) + 44, 464);
    if (u === 2) { pend(ax + BW / 2 + 40, 'S', 'var(--elec)'); chg(ax + BW / 2 + 70, 464); }
    if (u === 3) { pend(bx + BW / 2 - 50, 'S', 'var(--elec)'); chg(bx + BW / 2 - 20, 464); }
  }
  const arrows = s('g', { style: 'opacity:0' });
  const ar = (d, col) => { const a = D.arrow({ d, from: [0, 0], to: [0, 0], color: col, width: 4 }); return a; };
  const A1 = [ar('M600,150 L597,280', 'var(--a1)'), ar('M612,150 C700,190 760,230 761,280', 'var(--a1)')];
  const A2 = [ar('M856,150 L856,372 Q856,428 892,428', 'var(--fadh)')];
  const A3 = [ar('M1112,150 Q1210,170 1210,250 L1210,478', 'var(--ink)')];
  const bracket = s('path', { d: `M${X0},486 L${X0},502 L${X0 + 4 * UW - 40},502 L${X0 + 4 * UW - 40},486`, style: 'fill:none;stroke:var(--ink);stroke-width:4;stroke-linecap:round;opacity:0' });
  const brT = D.text(856, 548, 'Repeating disaccharide units → long unbranched chain', { anchor: 'middle', style: 'font-size:28px;font-weight:650;fill:var(--ink);opacity:0' });
  D.layers.labels.append(bracket);
  [...A1, ...A2, ...A3].forEach((a) => { a.g.style.opacity = 0; });
  const lab = (x, t1, t2, col) => {
    const g = s('g');
    g.append(s('rect', { x, y: 600, width: 620, height: 100, rx: 24, style: `fill:var(--surface);stroke:color-mix(in oklab, ${col} 50%, transparent);stroke-width:2` }));
    const a = s('text', { x: x + 30, y: 640, class: 'v-label', style: `font-size:26px;font-weight:720;fill:${col}` }); a.textContent = t1;
    const b = s('text', { x: x + 30, y: 680, class: 'v-label', style: 'font-size:26px;fill:var(--fg-2)' }); b.textContent = t2;
    g.append(a, b);
    D.layers.labels.append(g);
    return g;
  };
  const labs = [lab(X0, 'Amino sugar', 'Glucosamine · galactosamine', 'var(--a1)'), lab(X0 + 4 * UW - 40 - 620, 'Sugar acid', 'Glucuronic · iduronic acid', 'var(--a2)')];
  const wPaths = ['M0,380 C60,420 100,440 140,440', 'M1712,420 C1660,440 1620,452 1570,452', 'M856,720 C856,640 860,560 862,500', 'M520,720 C520,620 560,560 600,500', 'M1200,720 C1200,630 1160,560 1130,500', 'M0,560 C80,520 120,480 160,470'].map((d) => { const p = s('path', { d, style: 'fill:none;stroke:none' }); D.layers.fx.append(p); return D.flow(p, { count: 3, color: COL.water, speed: 110, r: 8, autoplay: false }); });
  wPaths.forEach((f) => f.hide());
  const waterT = D.text(1708, 540, 'H₂O drawn in', { anchor: 'end', style: 'font-size:28px;font-weight:700;fill:var(--nadh);opacity:0' });
  let pulse = null;
  return {
    step(n) {
      words.forEach((w, i) => { const on = n === i + 1 || n >= 4; w.el.style.fill = on ? (i === 0 ? 'var(--a1)' : i === 1 ? 'var(--fadh)' : 'var(--ink)') : n === 0 ? 'var(--fg)' : 'var(--fg-3)'; w.me.style.opacity = on ? 1 : 0.5; });
      A1.forEach((a) => gsap.to(a.g, { opacity: n === 1 ? 1 : 0, duration: 0.4 }));
      A2.forEach((a) => gsap.to(a.g, { opacity: n === 2 ? 1 : 0, duration: 0.4 }));
      A3.forEach((a) => gsap.to(a.g, { opacity: n === 3 ? 1 : 0, duration: 0.4 }));
      boxes.forEach((b) => { b.firstChild.style.strokeWidth = n === 1 ? 6 : 3; });
      aminos.forEach((a) => gsap.to(a, { opacity: n === 2 || n === 0 || n >= 4 ? 1 : 0.55, duration: 0.4 }));
      gsap.to([bracket, brT], { opacity: n === 3 ? 1 : 0, duration: 0.4 });
      gsap.to(labs, { opacity: n >= 4 ? 0.3 : 1, duration: 0.4 });
      gsap.to(waterT, { opacity: n >= 4 ? 1 : 0, duration: 0.4 });
      wPaths.forEach((f) => (n >= 4 ? f.play() : f.hide()));
      pulse?.kill();
      charges.forEach((c) => setScale(c, 1));
      if (n >= 4) { const st = { v: 1 }; pulse = gsap.to(st, { v: 1.5, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut', onUpdate: () => charges.forEach((c) => c.setAttribute('transform', `scale(${st.v})`)) }); }
    },
    leave: () => { pulse?.pause(); D.pauseAll(); },
    destroy: () => { pulse?.kill(); D.destroy(); },
  };
}

// 21 · Four forces minis
function forceMini(el, k) {
  const D = diagram(el, 316, 260);
  const strand = (y, n = 5) => {
    const g = s('g');
    for (let i = 0; i < n; i++) g.append(s('rect', { x: 6 + i * 62, y: y - 17, width: 54, height: 34, rx: 10, style: `fill:color-mix(in oklab, ${i % 2 ? 'var(--a2)' : 'var(--a1)'} 26%, var(--bg));stroke:${i % 2 ? 'var(--a2)' : 'var(--a1)'};stroke-width:2.5` }));
    D.layers.nodes.append(g);
    return g;
  };
  const cx = (i) => 33 + i * 62;
  const neg = (g, x, y) => { g.append(s('circle', { cx: x, cy: y, r: 15, style: 'fill:var(--inh)' }), s('rect', { x: x - 7, y: y - 2, width: 14, height: 4, rx: 2, style: 'fill:var(--bg)' })); };
  const na = (g, x, y) => {
    g.append(s('circle', { cx: x, cy: y, r: 26, style: 'fill:color-mix(in oklab, var(--fadh) 28%, var(--bg));stroke:var(--fadh);stroke-width:2.5' }));
    const t = s('text', { x, y: y + 7, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:20px;font-weight:760;fill:var(--fadh)' });
    t.textContent = 'Na⁺';
    g.append(t);
  };
  const water = (g, x, y) => {
    const w = s('g', { transform: `translate(${x} ${y})` });
    w.append(s('circle', { cx: -14, cy: 11, r: 8, style: 'fill:var(--fg-2)' }), s('circle', { cx: 14, cy: 11, r: 8, style: 'fill:var(--fg-2)' }), s('circle', { r: 13, style: 'fill:var(--nadh)' }));
    g.append(w);
    return w;
  };
  if (k === 1) {
    const a = strand(56), b = strand(204);
    [0, 2, 4].forEach((i) => { neg(a, cx(i), 92); neg(b, cx(i), 168); });
    const ar = s('path', { d: 'M158,104 L158,156 M150,114 L158,104 L166,114 M150,146 L158,156 L166,146', style: 'stroke:var(--fg-3);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round' });
    D.layers.labels.append(ar);
    gsap.to(a, { y: -12, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(b, { y: 12, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  } else if (k === 2) {
    strand(214);
    const g = s('g');
    D.layers.labels.append(g);
    [0, 2, 4].forEach((i, n) => {
      const x = cx(i);
      g.append(s('circle', { cx: x, cy: 186, r: 9, style: 'fill:var(--o2)' }));
      water(g, x, 64);
      const l = s('line', { x1: x, y1: 176, x2: x, y2: 92, style: 'stroke:var(--nadh);stroke-width:3;stroke-dasharray:5 7' });
      g.append(l);
      gsap.to(l, { opacity: 0.2, duration: 0.8, yoyo: true, repeat: -1, delay: n * 0.25 });
    });
  } else if (k === 3) {
    const a = strand(170);
    [0, 2, 4].forEach((i, n) => {
      neg(a, cx(i), 136);
      const g = s('g');
      na(g, cx(i), 66);
      D.layers.labels.append(g);
      gsap.to(g, { y: 12, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: n * 0.2 });
    });
    [1, 3].forEach((i) => neg(a, cx(i), 204));
  } else {
    const g = s('g');
    D.layers.nodes.append(g);
    [[130, 108], [186, 108], [102, 156], [158, 156], [214, 156]].forEach(([x, y]) => na(g, x, y));
    ['M0,20 L84,84', 'M316,20 L232,84', 'M0,250 L76,186', 'M316,250 L240,186', 'M158,0 L158,72', 'M158,260 L158,190'].forEach((d) => { const p = s('path', { d, style: 'fill:none;stroke:none' }); D.layers.fx.append(p); D.flow(p, { count: 2, color: COL.water, speed: 55, r: 9 }); });
  }
  return { destroy: () => { gsap.killTweensOf(D.svg.querySelectorAll('*')); D.destroy(); } };
}

// 22 · Proteoglycan bottle brush, compress / release
function brushViz(el) {
  const kit = createScene(el, { cam: [0, 3.2, 28], autoRotate: 0.45 });
  const root = new THREE.Group();
  kit.root.add(root);
  const LEN = 11.2;
  const pts = [];
  for (let i = 0; i <= 14; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.8) * 0.16, -LEN / 2 + (i * LEN) / 14, Math.cos(i * 0.6) * 0.16));
  const core = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.42, 20, false), glossy(0xffb340, { emissive: 0x2a1600 }));
  root.add(core);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const LV = 8, AR = 5, NB = 8, BS = 0.46;
  const base = [], kind = [];
  for (let l = 0; l < LV; l++) {
    const y0 = -4.5 + l * (9 / (LV - 1));
    for (let a = 0; a < AR; a++) {
      const ang = (a / AR) * Math.PI * 2 + l * 0.63;
      const tilt = 0.16 + (rnd() - 0.5) * 0.2, bend = (rnd() - 0.5) * 0.7;
      for (let b = 0; b < NB; b++) {
        const r = 0.62 + b * BS;
        const aa = ang + bend * (b / NB) ** 2;
        base.push(new THREE.Vector3(Math.cos(aa) * r, y0 + tilt * b * BS + 0.1 * Math.sin(b * 1.3 + a), Math.sin(aa) * r));
        kind.push(b % 2);
      }
    }
  }
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.23, 16, 12), glossy(0xffffff), base.length);
  const cA = new THREE.Color(HX.acc), cB = new THREE.Color(0x64d2ff);
  base.forEach((p, i) => beads.setColorAt(i, kind[i] ? cB : cA));
  root.add(beads);
  const negIdx = base.map((_, i) => i).filter((i) => kind[i]);
  const negGeo = new THREE.BufferGeometry();
  negGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(negIdx.length * 3), 3));
  const negPts = new THREE.Points(negGeo, new THREE.PointsMaterial({ map: glowTexture(), color: 0xff2d55, size: 1.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(negPts);
  // water
  const NW = 150;
  const W = [];
  for (let i = 0; i < NW; i++) {
    let bi;
    do { bi = Math.floor(rnd() * base.length); } while (bi % NB < 2);
    const off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.42 + rnd() * 0.35);
    const ax = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const p0 = base[bi];
    const out = new THREE.Vector3(p0.x * 0.25 + off.x, p0.y * 0.35 + off.y, p0.z + off.z * 2 + Math.sign(p0.z || 1) * 1.2).normalize();
    W.push({ bi, off, ax, out, d: 2.4 + rnd() * 3.2, thr: rnd() * 0.45, ph: rnd() * 6.28 });
  }
  const wO = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 14, 10), glossy(HX.red), NW);
  const wH = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), glossy(0xf2f2f7), NW * 2);
  root.add(wO, wH);
  const plateMat = new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, roughness: 0.15, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const plates = [-1, 1].map((sgn) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 11, 9.5), plateMat); m.userData.s = sgn; root.add(m); return m; });
  kit.label('Core protein', [0, 6.3, 0], { cls: 'sm', parent: root });
  const tipB = base[(3 * AR + 1) * NB + NB - 1];
  kit.label('GAG chain (−)', [tipB.x + 0.4, tipB.y + 0.8, tipB.z], { cls: 'sm acc', parent: root });
  const wl = W[7];
  const wp = base[wl.bi].clone().add(wl.off);
  kit.label('H<sub>2</sub>O', [wp.x, wp.y + 0.6, wp.z], { cls: 'sm', parent: root });
  const st = { c: 0 };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), V2 = new THREE.Vector3();
  const sq = (p, out) => out.set(p.x * (1 - 0.62 * st.c), p.y * (1 - 0.05 * st.c), p.z * (1 + 0.08 * st.c));
  const hA = new THREE.Vector3(0.2, 0.06, 0), hB = new THREE.Vector3(-0.2, 0.06, 0);
  kit.onFrame((dt, t) => {
    const c = st.c;
    base.forEach((p, i) => { sq(p, V); M.compose(V, Q.identity(), S1); beads.setMatrixAt(i, M); });
    beads.instanceMatrix.needsUpdate = true;
    const arr = negGeo.attributes.position.array;
    negIdx.forEach((bi, k) => { sq(base[bi], V); arr[k * 3] = V.x; arr[k * 3 + 1] = V.y + 0.18; arr[k * 3 + 2] = V.z; });
    negGeo.attributes.position.needsUpdate = true;
    negPts.material.size = 1.2 + Math.sin(t * 3) * 0.25;
    W.forEach((w, i) => {
      sq(base[w.bi], V);
      const e = ez(clamp01((c - w.thr) / 0.4));
      V.addScaledVector(w.off, 1 - 0.5 * Math.max(0, c));
      V.addScaledVector(w.out, e * w.d);
      V.x += Math.sin(t * 2 + w.ph) * 0.05;
      V.y += Math.cos(t * 1.7 + w.ph) * 0.05;
      Q.setFromAxisAngle(w.ax, t * 0.8 + w.ph);
      M.compose(V, Q, S1);
      wO.setMatrixAt(i, M);
      V2.copy(hA).applyQuaternion(Q).add(V); M.compose(V2, Q, S1); wH.setMatrixAt(i * 2, M);
      V2.copy(hB).applyQuaternion(Q).add(V); M.compose(V2, Q, S1); wH.setMatrixAt(i * 2 + 1, M);
    });
    wO.instanceMatrix.needsUpdate = true;
    wH.instanceMatrix.needsUpdate = true;
    plates.forEach((p) => { p.position.x = p.userData.s * (5.6 - 3.2 * Math.max(0, c)); });
    plateMat.opacity = clamp01(c * 4) * 0.2;
  });
  const ro = overlay(el, 'right:0;top:0;text-align:right');
  const pct = h('div', { style: 'font:760 84px var(--font);letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums;color:var(--nadh)', text: '100%' });
  const pl = h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:6px', text: 'water held in the gel' });
  ro.append(pct, pl);
  const upd = () => { pct.textContent = `${Math.round(100 - 58 * clamp01(st.c))}%`; sl.set(Math.round(clamp01(st.c) * 100), false); };
  const sl = slider({ label: 'Squeeze', min: 0, max: 100, step: 1, value: 0, fmt: (v) => `${v}%`, onInput: (v) => { gsap.killTweensOf(st); st.c = v / 100; upd(); }, width: 220 });
  const release = () => { gsap.killTweensOf(st); gsap.to(st, { c: 0, duration: 1.8, ease: 'elastic.out(1, 0.38)', onUpdate: upd }); };
  const squeeze = () => { gsap.killTweensOf(st); gsap.to(st, { c: 1, duration: 1.2, ease: 'power2.inOut', onUpdate: upd }); };
  sl.input.addEventListener('change', () => {});
  const btn = h('button.btn', { style: 'font-size:24px;height:56px;padding:0 26px', text: 'Release', onclick: release });
  ctrlBar(el, [sl, btn], { left: 0, bottom: 0 });
  return kitController(kit, { step: (n) => (n === 1 ? squeeze() : n === 2 ? release() : (gsap.killTweensOf(st), (st.c = 0), upd())) });
}

// 23 · Six GAGs grid
const GAGS = [
  { id: 'HA', name: 'Hyaluronic acid', am: 'Glucosamine', ac: 'Glucuronic acid', sulf: 'Non-sulfated', sc: 'inh', fn: 'Lubricant · shock absorber · wound healing', where: 'Synovial fluid · vitreous †', tags: ['non'], extra: ['<b>Not attached</b> to a core protein', '<b>Longest</b> polysaccharide chain'] },
  { id: 'CS', name: 'Chondroitin sulfate', am: 'Galactosamine', ac: 'Glucuronic acid', sulf: 'Sulfated', fn: 'Strength · cartilage compressibility', where: 'Cartilage', tags: ['galn', 'most'], extra: ['<b>Most abundant</b> GAG in the body', 'SLO names chondroitin <b>4- and 6-sulfate</b> (sulfate position, textbook); the slides treat them together'] },
  { id: 'DS', name: 'Dermatan sulfate', am: 'Galactosamine', ac: 'Iduronic acid', sulf: 'Sulfated', fn: 'Maintains shape of skin and eye', where: 'Skin · eye', tags: ['galn', 'ido'], extra: [] },
  { id: 'KS', name: 'Keratan sulfate', am: 'Glucosamine', ac: 'Galactose', acBold: true, sulf: 'Sulfated', fn: 'Transparency of the cornea', where: 'Cornea', tags: [], extra: ['Has <b>galactose</b> instead of a sugar acid — the exception'] },
  { id: 'Hep', name: 'Heparin', am: 'Glucosamine', ac: 'Glucuronic / iduronic', sulf: 'Richest in sulfate', sc: 'atp', fn: 'Anticoagulant', where: 'Mast cells (primary GAG)', tags: ['ido', 'rich'], extra: ['Iduronic acid predominates (textbook)'] },
  { id: 'HS', name: 'Heparan sulfate', am: 'Glucosamine', ac: 'Glucuronic / iduronic', sulf: 'Fewer sulfates than heparin', fn: 'Basement membrane · cell surfaces', where: 'Basement membrane', tags: ['ido'], extra: ['Resembles heparin, with fewer sulfates'] },
];
function gagGridViz(el) {
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '22px';
  const grid = h('div', { style: 'flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:22px;min-height:0' });
  const tiles = GAGS.map((g) => {
    const chip = (t, col, bold) => h('span', { class: 'chip', style: `font-size:23px;color:${col};border-color:color-mix(in oklab, ${col} 45%, transparent);background:color-mix(in oklab, ${col} 12%, transparent);${bold ? 'font-weight:760' : ''}`, text: t });
    const sCol = g.sc ? `var(--${g.sc})` : 'var(--fg-2)';
    const t = h('div', { style: 'position:relative;border-radius:30px;padding:24px 30px;background:var(--surface);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px;transition:opacity .45s var(--ease),transform .45s var(--ease),border-color .45s' }, [
      h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;gap:12px' }, [
        h('div', { style: 'font-size:36px;font-weight:700;letter-spacing:-.02em', text: g.name }),
        h('div', { style: 'font:700 24px var(--mono);color:var(--ink)', text: g.id }),
      ]),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, [chip(g.am, 'var(--a1)'), chip(g.ac, g.acBold ? 'var(--prot)' : 'var(--a2)', g.acBold), chip(g.sulf, sCol, !!g.sc)]),
      h('div', { style: 'font-size:27px;line-height:1.3', html: g.fn }),
      h('div', { style: 'margin-top:auto;font-size:24px;color:var(--ink);font-weight:620', html: `◉ ${g.where}` }),
    ]);
    tip(t, { kicker: `${g.id} · ${g.sulf}`, title: g.name, list: [`Amino sugar: <b>${g.am}</b>`, `Sugar acid: <b>${g.ac}</b>`, ...g.extra, `Function: ${g.fn}`], src: `${SRC(33)}${g.id === 'HA' ? ' · † location per Lippincott' : ''}` });
    grid.append(t);
    return { t, g };
  });
  const FIL = [
    { v: 'all', t: 'All six', f: () => true },
    { v: 'non', t: 'Non-sulfated', f: (g) => g.tags.includes('non') },
    { v: 'galn', t: 'Galactosamine', f: (g) => g.tags.includes('galn') },
    { v: 'ido', t: 'Iduronic acid', f: (g) => g.tags.includes('ido') },
    { v: 'rich', t: 'Most sulfate', f: (g) => g.tags.includes('rich') },
    { v: 'most', t: 'Most abundant', f: (g) => g.tags.includes('most') },
  ];
  const apply = (v) => {
    const F = FIL.find((x) => x.v === v);
    tiles.forEach(({ t, g }) => {
      const on = F.f(g);
      t.style.opacity = on ? 1 : 0.22;
      t.style.transform = on && v !== 'all' ? 'translateY(-6px)' : 'none';
      t.style.borderColor = on && v !== 'all' ? 'color-mix(in oklab, var(--a1) 60%, transparent)' : 'var(--line)';
    });
  };
  const sg = seg({ options: FIL.map((x) => ({ v: x.v, t: x.t })), value: 'all', onChange: apply });
  el.append(h('div', { style: 'display:flex;justify-content:flex-start' }, [sg.el]), grid);
  apply('all');
  return { step: (n) => sg.set(['all', 'non', 'galn', 'ido', 'rich', 'most'][n] || 'all') };
}

// 25 · Mucopolysaccharidoses
function mpsViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '700px 1fr';
  el.style.gap = '40px';
  const left = h('div', { style: 'position:relative;min-height:0' });
  const right = h('div', { style: 'display:flex;flex-direction:column;justify-content:center;gap:16px;min-height:0' });
  el.append(left, right);
  const D = diagram(left, 700, 720);
  D.svg.style.width = '100%';
  D.svg.style.height = '100%';
  const CX = 350, CY = 345;
  const lyso = s('circle', { cx: CX, cy: CY, r: 236, style: 'fill:color-mix(in oklab, var(--fadh) 9%, transparent);stroke:var(--fadh);stroke-width:6;transition:stroke .5s' });
  D.layers.regions.append(lyso);
  const lT = D.text(CX, 86, 'Lysosome', { anchor: 'middle', style: 'font-size:30px;font-weight:700;fill:var(--fadh)' });
  const stT = D.text(CX, 706, 'Lysosomal enzymes degrade GAGs', { anchor: 'middle', style: 'font-size:27px;font-weight:620;fill:var(--fg-2)' });
  let seed = 5;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const spots = [];
  for (let tries = 0; spots.length < 22 && tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 180;
    const p = [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
    if (spots.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 56)) spots.push(p);
  }
  const chains = spots.map((p, i) => {
    const type = i % 2 ? 'HS' : 'DS';
    const col = type === 'DS' ? 'var(--fadh)' : 'var(--prot)';
    const g = s('g', { transform: `translate(${p[0]} ${p[1]}) rotate(${rnd() * 180})`, style: 'opacity:0' });
    const beads = [];
    for (let k = 0; k < 5; k++) { const c = s('circle', { cx: -36 + k * 18, cy: Math.sin(k * 1.4) * 7, r: 8.5, style: `fill:${col}` }); g.append(c); beads.push(c); }
    D.layers.nodes.append(g);
    return { g, beads, type };
  });
  const key = s('g');
  [['DS', 'Dermatan sulfate', 'var(--fadh)', 120], ['HS', 'Heparan sulfate', 'var(--prot)', 380]].forEach(([k, t, c, x]) => {
    key.append(s('circle', { cx: x, cy: 660, r: 10, style: `fill:${c}` }));
    const tx = s('text', { x: x + 20, y: 668, class: 'v-label', style: 'font-size:24px;fill:var(--fg-2)' }); tx.textContent = t; key.append(tx);
  });
  D.layers.labels.append(key);
  const tls = [];
  const normalLoop = (ch, delay) => {
    const tl = gsap.timeline({ repeat: -1, delay, repeatDelay: 1.2 + rnd() * 2 });
    tl.set(ch.beads, { attr: { r: 8.5 } }).fromTo(ch.g, { opacity: 0 }, { opacity: 1, duration: 0.5 }).to(ch.beads, { attr: { r: 0 }, duration: 0.35, stagger: 0.22, ease: 'power2.in' }, '+=0.6').set(ch.g, { opacity: 0 });
    return tl;
  };
  const ROWS = [
    { t: 'MPS I', n: 'Hurler', st: ['DS', 'HS'], inh: 'Autosomal recessive', enz: 'α-L-iduronidase' },
    { t: 'MPS II', n: 'Hunter', st: ['DS', 'HS'], inh: 'X-linked', x: true, enz: 'Iduronate sulfatase' },
    { t: 'MPS III', n: 'Sanfilippo', st: ['HS'], inh: 'Autosomal recessive', enz: 'One of several heparan-degrading enzymes (types A–D)' },
    { t: 'MPS VII', n: 'Sly', st: ['DS', 'HS'], inh: 'Autosomal recessive', enz: 'β-glucuronidase', note: 'Lippincott also lists chondroitin sulfate for Sly syndrome.' },
  ];
  const head = h('div', { style: 'display:grid;grid-template-columns:150px 230px 210px 1fr;gap:16px;padding:0 26px;font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-3);font-weight:650' }, ['Type', 'Syndrome', 'Stored GAG', 'Inheritance'].map((t) => h('div', { text: t })));
  right.append(head);
  const gchip = (k) => h('span', { class: 'chip', style: `font-size:24px;font-weight:700;color:${k === 'DS' ? 'var(--fadh)' : 'var(--prot)'};border-color:color-mix(in oklab, ${k === 'DS' ? 'var(--fadh)' : 'var(--prot)'} 45%, transparent);background:color-mix(in oklab, ${k === 'DS' ? 'var(--fadh)' : 'var(--prot)'} 12%, transparent)`, text: k });
  const rows = ROWS.map((r, i) => {
    const row = h('div', { style: 'display:grid;grid-template-columns:150px 230px 210px 1fr;gap:16px;align-items:center;padding:28px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line);cursor:pointer;transition:background .4s,border-color .4s,opacity .4s' }, [
      h('div', { style: 'font:700 28px var(--mono);color:var(--fg-2)', text: r.t }),
      h('div', { style: 'font-size:38px;font-weight:700;letter-spacing:-.02em', text: r.n }),
      h('div', { style: 'display:flex;gap:8px' }, r.st.map(gchip)),
      h('div', { html: r.x ? '<span class="chip inh" style="font-size:25px;font-weight:760">X-linked</span>' : '<span style="font-size:26px;color:var(--fg-2)">Autosomal recessive</span>' }),
    ]);
    tip(row, { kicker: `${r.t} · ${r.inh}`, title: `${r.n} syndrome`, body: `Stored: <b>${r.st.map((k) => (k === 'DS' ? 'dermatan sulfate' : 'heparan sulfate')).join(' + ')}</b>.<br>Deficient enzyme (textbook): ${r.enz}.${r.note ? `<br>${r.note}` : ''}`, src: `${SRC(32)} · enzymes per Lippincott` });
    row.addEventListener('click', () => select(sel === i + 1 ? 0 : i + 1));
    right.append(row);
    return row;
  });
  right.append(h('div', { style: 'margin-top:14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center' }, [h('span', { style: 'font-size:26px;color:var(--fg-2);margin-right:6px', text: 'Progressive storage →' }), h('span.chip.inh', { style: 'font-size:26px', text: 'Skeletal deformities' }), h('span.chip.inh', { style: 'font-size:26px', text: 'Intellectual disability' })]));
  let sel = -1;
  function select(k) {
    if (k === sel) return;
    sel = k;
    tls.forEach((t) => t.kill());
    tls.length = 0;
    const stored = k ? ROWS[k - 1].st : [];
    chains.forEach((ch, i) => {
      gsap.killTweensOf([ch.g, ...ch.beads]);
      if (stored.includes(ch.type)) {
        gsap.set(ch.beads, { attr: { r: 8.5 } });
        gsap.to(ch.g, { opacity: 1, duration: 0.4, delay: i * 0.03 });
      } else {
        gsap.set(ch.g, { opacity: 0 });
        if (i % 3 === 0 || !k) tls.push(normalLoop(ch, rnd() * 2));
      }
    });
    gsap.to(lyso, { attr: { r: k ? 268 : 236 }, duration: 1.2, ease: 'elastic.out(1, 0.6)' });
    lyso.style.stroke = k ? 'var(--inh)' : 'var(--fadh)';
    stT.textContent = k ? `${ROWS[k - 1].n}: ${stored.join(' + ')} accumulate` : 'Lysosomal enzymes degrade GAGs';
    stT.style.fill = k ? 'var(--inh)' : 'var(--fg-2)';
    gsap.to(lT, { attr: { y: k ? 56 : 86 }, duration: 0.6 });
    rows.forEach((r, i) => {
      r.style.background = k === i + 1 ? 'color-mix(in oklab, var(--inh) 12%, transparent)' : 'var(--surface)';
      r.style.borderColor = k === i + 1 ? 'color-mix(in oklab, var(--inh) 50%, transparent)' : 'var(--line)';
      r.style.opacity = k && k !== i + 1 ? 0.5 : 1;
    });
  }
  select(0);
  return {
    step: (n) => select(n),
    leave: () => tls.forEach((t) => t.pause()),
    enter: () => tls.forEach((t) => t.resume()),
    destroy: () => { tls.forEach((t) => t.kill()); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry — Introduction to Carbohydrates; Glycosaminoglycans',
    'Lecture slides: Carbohydrate chemistry (L.1–L.2), NUST College of Medicine',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.1 – L.2',
      title: 'Carbohydrate <em>Chemistry</em>',
      subtitle: 'Sugars, isomers and the gel that cushions joints.',
      meta: ['Two sessions', 'Isomers in 3D', '10 learning outcomes'],
      notes: [
        'Two sessions in one deck: L.1 carbohydrate chemistry, L.2 glycosaminoglycans and the extracellular matrix.',
        'The model is a real 3D β-D-glucopyranose (PubChem). The glowing atom is C1, the anomeric carbon — it will matter for anomers, reducing sugars and glycosidic bonds.',
        'Roadmap: definition → classification → isomers (chiral C, anomers, epimers, enantiomers) → derivatives → disaccharides → polysaccharides → GAGs → MPS.',
      ],
      visual: heroViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Session 1 · learning outcomes',
      title: 'By the end, you can…',
      class: 'cards-3',
      cards: [
        { big: '01', k: 'L.1.1', title: 'Define carbohydrates', tip: { title: 'L.1.1', body: 'Define carbohydrates.' } },
        { big: '02', k: 'L.1.2', title: 'Classify, with examples', tip: { title: 'L.1.2', body: 'Classify carbohydrates with examples.' } },
        { big: '03', k: 'L.1.3', title: 'Epimers · anomers · enantiomers', tip: { title: 'L.1.3', body: 'Define epimers, anomers and enantiomers with examples.' } },
        { big: '04', k: 'L.1.4', title: 'Physiological functions', tip: { title: 'L.1.4', body: 'List various physiological functions of carbohydrates.' } },
        { big: '05', k: 'L.1.5', title: 'Sugar derivatives', tip: { title: 'L.1.5', body: 'Describe sugar derivatives of biological importance (sorbitol, dextran, mannitol, xylitol).' } },
        { big: '06', k: 'L.1.6', title: 'Glycosides in the clinic', tip: { title: 'L.1.6', body: 'Define glycosides and their clinical importance.' } },
      ],
      notes: [
        'Hover any card for the exact SLO wording from slide 2.',
        'Note: xylitol is named in L.1.5 but no slide covers it (textbook: a 5-carbon sugar alcohol used as a sweetener).',
      ],
    },
    {
      eyebrow: 'Background',
      title: 'Polyhydroxy <em>aldehydes</em> or ketones',
      bullets: [
        { t: 'C, H, O · (CH<sub>2</sub>O)<sub>n</sub>', tip: { title: 'Carbohydrates (saccharides)', body: 'Organic compounds made of <b>carbon, hydrogen and oxygen</b>. Monosaccharide formula: (CH₂O)ₙ, n ≥ 3.', src: SRC('3, 6') } },
        { t: 'Many –OH + one <b>C=O</b>', tip: { title: 'Polyhydroxy aldehydes or ketones', body: 'Aldoses carry an aldehyde (glucose: C1). Ketoses carry a ketone (fructose: C2). Glucose and fructose share C₆H₁₂O₆ — <b>aldose–ketose isomers</b>.', src: SRC('3, 4, 12') } },
        { t: 'Glucose: the <b>chief fuel</b>', tip: { title: 'Chief fuel in humans', body: 'Brain and erythrocytes are almost exclusively dependent on glucose (slide 3). Textbook nuance: in prolonged fasting the brain also uses ketone bodies; RBCs stay glucose-dependent.', src: `${SRC(3)} · Lippincott` } },
        { t: 'Energy · structure · signalling · defence', tip: { kicker: 'L.1.4', title: 'Physiological functions', list: ['Energy production', 'Structure', 'Cellular communication', 'Immune response', 'Protection'], src: SRC(3) } },
      ],
      steps: 1,
      src: 'Lecture slides 3–4, 12 · real 3D open-chain structures (PubChem)',
      notes: [
        'Definition: polyhydroxy aldehydes or ketones made of C, H and O.',
        'On screen: open-chain D-glucose. The glowing carbonyl is the aldehyde at C1 → an aldose. Press → for fructose: ketone at C2 → a ketose.',
        'Same formula C₆H₁₂O₆, different carbonyl → aldose–ketose isomers (slide 12).',
        'Functions (L.1.4): energy, structure, cellular communication, immune response, protection. Glucose is the chief fuel; brain and RBCs depend on it.',
      ],
      visual: defViz,
    },
    {
      layout: 'full',
      eyebrow: 'Classification',
      title: 'Count the <em>sugar units</em>',
      bullets: [{ t: '1 · 2 · 3–10 · >10' }, { t: 'Homo vs hetero' }],
      steps: 4,
      src: 'Lecture slides 5, 17, 22–23',
      notes: [
        'Drag the slider or press →: 1 unit = monosaccharide, 2 = disaccharide, 3–10 = oligosaccharide, more than 10 = polysaccharide (glycans).',
        'Hover each segment for examples.',
        'Build 4: polysaccharides split into homopolysaccharides (one kind of unit — glycogen, dextran, inulin) and heteropolysaccharides (more than one kind — GAGs).',
        'Cut-offs vary between textbooks; use the slide’s 3–10 / >10 for this course.',
      ],
      visual: classViz,
    },
    {
      eyebrow: 'Monosaccharides',
      title: 'The <em>building blocks</em>',
      bullets: [
        { t: 'Simplest — <b>cannot be hydrolysed</b>', tip: { title: 'Single sugars', body: 'Monosaccharides cannot be hydrolysed further. They are the building blocks from which all carbohydrates are made.', src: SRC(6) } },
        { t: 'Water-soluble: many <b>–OH</b> groups', tip: { title: 'Soluble', body: 'Numerous hydroxyl groups hydrogen-bond with water, so monosaccharides are completely soluble.', src: SRC(6) } },
        { t: 'All are <b>reducing</b> sugars', tip: { title: 'Reducing', body: 'A free aldehyde or ketone group can donate electrons to other compounds.', src: SRC(6) } },
        { t: 'Named by <b>carbon number</b>', tip: { title: 'Triose → nonose', body: 'Hover a chip on the right. Formula CₙH₂ₙOₙ for the simple sugars.', src: SRC(7) } },
      ],
      src: 'Lecture slides 6–7 · neuraminic acid formula corrected (textbook)',
      notes: [
        'Monosaccharides: simplest, non-hydrolysable, water-soluble, and all reducing.',
        'Hover the chips: triose glyceraldehyde, tetrose erythrose, pentose ribose, hexose glucose/galactose, heptose sedoheptulose, octose, nonose neuraminic acid.',
        'Accuracy: the slide gives the nonose formula as C₉H₁₈O₉; neuraminic acid actually contains N (C₉H₁₇NO₈).',
      ],
      visual: monoViz,
    },
    {
      eyebrow: 'Isomerism',
      title: 'The <em>chiral</em> carbon',
      bullets: [
        { t: 'Four <b>different</b> groups attached', tip: { title: 'Asymmetric (chiral) carbon', body: 'A carbon attached to <b>4 different groups</b>.', src: SRC(8) } },
        { t: 'Mirror image won’t superimpose', tip: { title: 'Like your hands', body: 'Hands are non-superimposable mirror images (chiral). Two identical bottles are superimposable (achiral).', src: SRC(8) } },
        { t: 'Needed for sugar <b>isomerism</b>', tip: { title: 'Condition for isomerism', body: 'Monosaccharides with at least one asymmetric carbon can exhibit isomerism. (Slide label “A chiral” means <b>achiral</b>.)', src: SRC(8) } },
      ],
      steps: 2,
      src: 'Lecture slide 8 · schematic 3D model',
      notes: [
        'Left: a carbon with four different groups. Right: its mirror image across the glowing plane.',
        'Build 1 — slide the mirror image onto the original: two groups always swap → not superimposable → chiral (the hands analogy).',
        'Build 2 — make all groups identical: now it superimposes → achiral (the bottles). Strictly, any two identical groups make a carbon achiral.',
      ],
      visual: chiralViz,
    },
    {
      layout: 'full',
      eyebrow: 'Cyclization · anomers',
      title: 'From chain to <em>ring</em>',
      bullets: [{ t: 'C1 becomes <b>anomeric</b>' }, { t: 'α 36% · β 64%' }],
      steps: 4,
      src: 'Lecture slide 9 · open chain “≈1%” is the slide’s approximation (textbook: far less)',
      notes: [
        'Build 0 — Fischer projection of open-chain D-glucose. C1 is the carbonyl carbon. The C5 hydroxyl will attack it.',
        'Build 1 — the chain folds into the Haworth ring: right-side groups point down, left-side groups up. The C5 oxygen becomes the ring O, its H moves to the C1 oxygen. C1 is now a new chiral centre: the anomeric carbon. ~99% ring, ~1% open chain.',
        'Build 2 — α-glucose: anomeric OH down (36%). Build 3 — β-glucose: OH up (64%), the major form.',
        'Build 4 — in solution the ring reopens and recloses, so α and β interconvert (textbook term: mutarotation).',
      ],
      visual: ringViz,
    },
    {
      eyebrow: 'Anomers in 3D',
      title: 'α or <em>β</em>?',
      bullets: [
        { t: 'Differ only at <b>C1</b>', tip: { title: 'Anomers', body: 'Differ in the orientation of the OH at the <b>anomeric carbon</b> (C1 of glucose).', src: SRC('9, 14') } },
        { t: 'α: OH <b>down</b>, away from C6', tip: { title: 'α-D-glucose · 36%', body: 'In the Haworth figure the anomeric OH points down (opposite side to C6). In the real chair it is axial.', src: `${SRC(9)} · Lippincott` } },
        { t: 'β: OH <b>up</b>, same side as C6', tip: { title: 'β-D-glucose · 64%', body: 'Anomeric OH up. In the chair it is equatorial — every substituent of β-glucose is equatorial (textbook).', src: `${SRC(9)} · Lippincott` } },
        { t: 'β dominates: <b>64%</b>' },
      ],
      steps: 1,
      src: 'Lecture slides 9, 14 · real PubChem 3D conformers, ring plane drawn horizontal',
      notes: [
        'Real α- and β-D-glucopyranose. The green disc is the mean ring plane; C6 (CH₂OH) sits above it.',
        'α: the C1–OH (glowing) points straight down, opposite C6. Press → for β: the OH swings to the same side as C6.',
        'Everything else is identical — that is the definition of anomers.',
      ],
      visual: anomerViz,
    },
    {
      layout: 'full',
      eyebrow: 'Epimers',
      title: 'One carbon makes the <em>difference</em>',
      bullets: [{ t: 'Glucose ↔ mannose: C2' }, { t: 'Glucose ↔ galactose: C4' }],
      steps: 3,
      src: 'Lecture slides 13–14 · real β-pyranose conformers (PubChem); mannose–galactose point is textbook',
      notes: [
        'Epimers differ in the orientation of the OH at one specific chiral carbon.',
        'Build 1 — mannose and glucose: C2 epimers. Build 2 — glucose and galactose: C4 epimers.',
        'Build 3 — exam trap: mannose and galactose differ at C2 and C4, so they are NOT epimers of each other.',
        'In these chairs the changed OH flips from equatorial to axial (sticking straight up) — easy to spot.',
      ],
      visual: epimerViz,
    },
    {
      layout: 'full',
      eyebrow: 'Enantiomers',
      title: 'D and L: <em>mirror images</em>',
      bullets: [{ t: 'Every chiral C inverted' }, { t: 'OH right = D' }],
      steps: 2,
      src: 'Lecture slide 10 · D/L defined by configuration (Lippincott); slide’s “dextro/levo” not used',
      notes: [
        'Enantiomers are non-superimposable mirror images. Left: real D-glyceraldehyde, oriented like a Fischer projection (CHO up, horizontal groups toward you). Right: its mirror image, L.',
        'Build 1 — D- and L-glucose: every chiral carbon is inverted, not just one.',
        'Build 2 — the D/L label comes from the chiral carbon farthest from the C=O (C5 in glucose): OH on the right = D. Most body sugars are D.',
        'Accuracy: the slide writes “D (dextro) / L (levo)”. D/L is configuration; (+)/(−) optical rotation is separate — D-fructose is levorotatory.',
        'The slide-14 summary describes enantiomers by the carbon next to the terminal carbon — that carbon assigns D/L, but enantiomers differ at every chiral centre.',
      ],
      visual: dlViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Summary · isomerism',
      title: 'Four ways to be an <em>isomer</em>',
      cards: [
        { k: 'Epimers', title: 'One chiral C', body: 'e.g. glucose vs mannose (C2)', viz: (v) => isoMini(v, 'epi'), tip: { title: 'Epimers', body: 'Orientation of the hydroxyl at a <b>specific chiral carbon</b>.', src: SRC('13–14') } },
        { k: 'Aldose–ketose', title: 'C=O position', body: 'Aldehyde vs ketone', viz: (v) => isoMini(v, 'ak'), tip: { title: 'Aldose–ketose isomers', body: 'Presence of an <b>aldehyde or ketone</b> group.', src: SRC('12, 14') } },
        { k: 'Anomers', title: 'Anomeric OH', body: 'α vs β at C1', viz: (v) => isoMini(v, 'ano'), tip: { title: 'Anomers', body: 'Orientation of the hydroxyl at the <b>anomeric carbon</b>.', src: SRC('9, 14') } },
        { k: 'Enantiomers', title: 'Mirror images', body: 'Every chiral C flipped', viz: (v) => isoMini(v, 'en'), tip: { kicker: 'Accuracy note', title: 'Enantiomers', body: 'Non-superimposable mirror images: <b>every</b> chiral carbon is inverted (slide 10 figure). The slide-14 table cites the chiral carbon next to the terminal carbon — that carbon only assigns the D/L label.', src: `${SRC('10, 14')} · Lippincott` } },
      ],
      notes: [
        'Slide 14 summary. Ask: what varies in each pair?',
        'Epimers: one specific chiral C. Aldose–ketose: aldehyde vs ketone. Anomers: OH at the anomeric C. Enantiomers: full mirror images.',
      ],
    },
    {
      layout: 'cards',
      eyebrow: 'Sugar derivatives',
      title: 'Change one group, gain a <em>use</em>',
      cards: [
        { icon: 'plus', k: 'OH → NH<sub>3</sub><sup>+</sup>', title: 'Amino sugars', body: 'Glucosamine · galactosamine', viz: (v) => derivMini(v, 'amino'), tip: { title: 'Amino sugars', list: ['A hydroxyl (C2 in hexoses) is replaced by an amino group (NH₃⁺)', 'The positive charge interacts with water', 'Glucosamine, galactosamine: essential parts of GAGs'], src: SRC(15) } },
        { icon: 'minus', k: 'OH → COOH', title: 'Acidic sugars', body: 'Glucuronic · iduronic acid', viz: (v) => derivMini(v, 'acid'), tip: { kicker: 'Accuracy note', title: 'Acidic (sugar) acids', list: ['A hydroxyl group is oxidised to a carboxyl group (COO⁻ when ionised)', 'The negative charge interacts with water', 'Examples from slides 28 and 33: glucuronic and iduronic acid (the slide-15 example cell lists amino sugars only)'], src: SRC('15, 28') } },
        { icon: 'drop', k: 'C=O → OH', title: 'Sugar alcohols', body: 'Sorbitol: laxative · Mannitol: ↓ ICP', viz: (v) => derivMini(v, 'alc'), tip: { title: 'Sugar alcohols', list: ['The carbonyl carbon is reduced to an alcohol group', 'Highly osmotic (many OH groups)', '<b>Sorbitol</b> — laxative', '<b>Mannitol</b> — reduces intracranial pressure (osmotic diuretic, textbook)'], src: SRC(15) } },
        { icon: 'chain', k: '+ non-sugar', title: 'Glycosides', body: 'Digoxin · streptomycin · gentamicin', viz: (v) => derivMini(v, 'gly'), tip: { kicker: 'L.1.6 · clinical importance', title: 'Glycosides', list: ['A sugar covalently attached to a non-sugar (aglycone)', '<b>Digoxin</b> — treats heart failure', '<b>Streptomycin, gentamicin</b> — antibiotics', 'Slide: binding a non-sugar makes it resistant to enzyme hydrolysis'], src: `${SRC(15)} · “Gentamycin” spelt gentamicin` } },
      ],
      notes: [
        'Four derivative families from slide 15. Hover each card for formation and properties.',
        'Amino sugars: OH at C2 → NH₃⁺; glucosamine and galactosamine build GAGs.',
        'Acidic sugars: OH oxidised to COOH; glucuronic and iduronic acid are the GAG sugar acids.',
        'Sugar alcohols: C=O reduced; sorbitol is a laxative, mannitol lowers intracranial pressure. Xylitol (SLO only) is a textbook sweetener.',
        'Glycosides (L.1.6): sugar + non-sugar — digoxin for heart failure, streptomycin and gentamicin as antibiotics. Note: glycosidic bonds in general are hydrolysed by glycosidases (slide 18).',
      ],
    },
    {
      eyebrow: 'Critical thinking',
      title: 'Why diabetics get <em>cataracts</em>',
      bullets: [
        { t: 'Excess glucose → <b>sorbitol</b>', step: 1, tip: { title: 'In diabetes', body: 'Excess glucose is converted into sorbitol by <b>aldose reductase</b> (enzyme named in Lippincott).', src: `${SRC(16)} · Lippincott` } },
        { t: 'Sorbitol is <b>trapped</b> in the lens', step: 2, tip: { title: 'No exit', body: 'Sorbitol does not cross cell membranes easily, and the lens has little sorbitol dehydrogenase to clear it (Lippincott).', src: 'Lippincott' } },
        { t: 'Water follows → cell <b>swells</b>', step: 3, tip: { title: 'Osmotic damage', body: 'Sugar alcohols are highly osmotic (slide 15): trapped sorbitol draws water into the lens cells.', src: `${SRC(15)} · Lippincott` } },
        { t: 'Lens clouds → <b>cataract</b>', step: 4 },
      ],
      steps: 4,
      src: 'Lecture slide 16 · mechanism per Lippincott (aldose reductase); schematic',
      notes: [
        'Ask first: diabetes plus cloudy lens — which sugar derivative links them? (Slide 16: sorbitol.)',
        'Build 1: high glucose enters the lens cell; aldose reductase reduces it to sorbitol.',
        'Build 2: sorbitol cannot leave and is not cleared (little sorbitol dehydrogenase in lens).',
        'Build 3: it is highly osmotic, so water floods in and the cell swells. Build 4: the lens becomes opaque — diabetic cataract.',
      ],
      visual: cataractViz,
    },
    {
      layout: 'full',
      eyebrow: 'The glycosidic bond',
      title: 'Lose water, <em>join</em> sugars',
      bullets: [{ t: 'Condensation: − H₂O' }, { t: 'Hydrolysis: + H₂O' }],
      steps: 2,
      src: 'Lecture slides 17–18',
      notes: [
        'A glycosidic bond forms by condensation between a hydroxyl group of each monosaccharide, releasing water (“condensation dehydration”).',
        'Build 1: the circled OH and H leave as H₂O; an oxygen bridge — the glycosidic bond — joins the rings into a disaccharide.',
        'Build 2: hydrolysis — an enzyme adds water back and the two monosaccharides separate.',
        'Use the buttons to replay either direction.',
      ],
      visual: glycoViz,
    },
    {
      eyebrow: 'Disaccharides',
      title: 'Three sugars, <em>three bonds</em>',
      bullets: [
        { t: 'Two sugars + <b>glycosidic bond</b>', tip: { title: 'Disaccharides', body: 'Two monosaccharide units joined covalently by a glycosidic bond. Water-soluble.', src: SRC(17) } },
        { t: 'Maltose, lactose: <b>reducing</b>', tip: { title: 'Free anomeric OH', body: 'One anomeric carbon stays free (glowing green) — it can open to a carbonyl and donate electrons.', src: `${SRC(17)} · Lippincott` } },
        { t: 'Sucrose: <b>non-reducing</b>', tip: { kicker: 'Accuracy note', title: 'Sucrose', body: 'Both anomeric carbons (glucose C1 and fructose C2) are locked in the bond. The slide says “except sucrose, all disaccharides are reducing” — textbooks note trehalose is non-reducing too.', src: `${SRC(17)} · Lippincott` } },
      ],
      steps: 2,
      src: 'Lecture slide 17 · bond types α(1→4), β(1→4), α1→β2 per Lippincott (not on slides) · PubChem 3D',
      notes: [
        'Real 3D structures; carbons are tinted by sugar (blue glucose, green galactose, orange fructose). Gold = glycosidic oxygen.',
        'Maltose = glucose + glucose; lactose = glucose + galactose; sucrose = glucose + fructose (slide 17).',
        'Green glow = free anomeric OH → reducing. Sucrose has none → non-reducing.',
        'Linkage labels are textbook context — the lecture does not teach linkage nomenclature.',
      ],
      visual: disViz,
    },
    {
      layout: 'full',
      eyebrow: 'Check yourself · session 1',
      title: 'Two quick <em>questions</em>',
      steps: 2,
      src: 'Lecture slides 19, 21',
      notes: [
        'Ask Q1, then press → : sucrose. All monosaccharides (glucose, fructose) are reducing; maltose and lactose have a free anomeric carbon.',
        'Ask Q2, then press → : C₁₂H₂₂O₁₁. Distractor C₁₂H₂₄O₁₂ forgets the water lost in condensation.',
      ],
      visual: (el) => mcqViz(el, [
        { k: 'Q1', q: 'Which one is a <b>non-reducing</b> sugar?', opts: ['Glucose', 'Maltose', 'Sucrose', 'Fructose', 'Lactose'], ans: 2, why: 'Sucrose: both anomeric carbons sit in the glycosidic bond. All monosaccharides are reducing.' },
        { k: 'Q2 · critical thinking', q: 'Molecular formula of <b>lactose</b>?', opts: ['C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>', 'C<sub>12</sub>H<sub>24</sub>O<sub>12</sub>', 'C<sub>12</sub>H<sub>22</sub>O<sub>11</sub>', 'C<sub>12</sub>H<sub>22</sub>O<sub>12</sub>', 'C<sub>12</sub>H<sub>24</sub>O<sub>11</sub>'], ans: 2, why: 'Glucose + galactose = C₁₂H₂₄O₁₂; condensation removes one H₂O → C₁₂H₂₂O₁₁.' },
      ]),
    },
    {
      layout: 'full',
      eyebrow: 'Homopolysaccharides',
      title: 'Three clinical <em>glycans</em>',
      bullets: [
        { t: '>10 units · non-reducing', tip: { kicker: 'Accuracy note', title: 'Polysaccharides (glycans)', body: 'More than 10 monosaccharides joined by glycosidic bonds; homo- or hetero-. The slide states all are non-reducing — a teaching simplification (a chain has one reducing end with negligible effect).', src: SRC(22) } },
        { t: 'Starch soluble · cellulose not', tip: { title: 'Wide range of solubility', body: 'Some are water-soluble (starch), others insoluble (cellulose). Textbook: starch is only partly soluble.', src: SRC(22) } },
      ],
      src: 'Lecture slides 22–23 · minis schematic',
      visual: polyViz,
      notes: [
        'Polysaccharides: >10 units, homo or hetero, variable solubility, non-reducing (slide 22).',
        'Glycogen — glucose store; branching packs many glucose units into one molecule, so osmotic pressure stays low.',
        'Dextran — glucose polymer used as a plasma expander (case next). Inulin — fructose polymer, used to measure GFR.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · case',
      title: 'Dextran in <em>shock</em>',
      steps: 2,
      src: 'Lecture slides 23, 25 · schematic',
      notes: [
        'Read the case: hypotension and tachycardia after trauma — hypovolaemia.',
        'Build 1: answer b — dextran draws water from the interstitial space into the vessels.',
        'Why: highly water-soluble, same oncotic pressure as plasma (slide 23). Not NO (that vasodilates), not converted to albumin.',
        'Build 2: the colloid stays in the vessel and pulls water in.',
      ],
      visual: dextranCaseViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Session 2 · extracellular matrix',
      title: '<em>Glycosaminoglycans</em>',
      class: 'cards-2x2',
      cards: [
        { icon: 'chain', k: 'L.2.1', title: 'Define GAGs', tip: { title: 'L.2.1', body: 'Define glycosaminoglycans.' } },
        { icon: 'layers', k: 'L.2.2', title: 'Function & tissue distribution', tip: { title: 'L.2.2', body: 'Describe the function and tissue distribution of hyaluronic acid, chondroitin 4- and 6-sulfate, heparin, dermatan sulfate and keratan sulfate.' } },
        { icon: 'cycle', k: 'L.2.3', title: 'Mechanism of resilience', tip: { title: 'L.2.3', body: 'Explain the mechanism of resilience of GAGs.' } },
        { icon: 'hex', k: 'L.2.4', title: 'Structure & clinical use', tip: { title: 'L.2.4', body: 'Discuss the structure of the GAGs (hyaluronic acid, chondroitin 4- and 6-sulfate, heparin, dermatan sulfate, keratan sulfate) and their clinical applications.' } },
      ],
      notes: ['Session 2 begins (slides 26–27). Hover for the exact SLO wording.', 'Arc: structure → water-holding forces → proteoglycans and resilience → the six GAGs → mucopolysaccharidoses.'],
    },
    {
      layout: 'full',
      eyebrow: 'Glycosaminoglycans',
      title: 'Read the <em>name</em>',
      bullets: [{ t: 'Repeating disaccharides' }, { t: 'Strongly negative' }],
      steps: 4,
      src: 'Lecture slide 28',
      notes: [
        'GAGs (mucopolysaccharides) are heteropolysaccharides of repeating disaccharide units joined by glycosidic bonds; each unit is usually two monosaccharide derivatives.',
        'Build 1 — Glycos-: sugar. Build 2 — amino: an amino sugar (glucosamine or galactosamine). Build 3 — glycan: a long polysaccharide chain.',
        'The partner is a sugar acid (glucuronic or iduronic acid). Textbook: the amino sugars are usually N-acetylated or N-sulfated.',
        'Build 4 — carboxylates and sulfates make the chain highly negative, so it strongly attracts water.',
      ],
      visual: gagViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Extracellular matrix',
      title: 'Four forces hold <em>water</em>',
      cards: [
        { k: 'Force 1', title: 'Electrostatic repulsion', body: 'Negative chains push apart', viz: (v) => forceMini(v, 1), tip: { title: '1 · Electrostatic repulsion', body: 'Like (negative) charges on GAG chains repel, keeping the chains extended.', src: SRC(30) } },
        { k: 'Force 2', title: 'Hydrogen bonding', body: 'Water binds the chains', viz: (v) => forceMini(v, 2), tip: { title: '2 · Hydrogen bonding', body: 'Water molecules hydrogen-bond to the GAG chains.', src: SRC(30) } },
        { k: 'Force 3', title: 'Ionic interaction', body: 'Na⁺ held by − charges', viz: (v) => forceMini(v, 3), tip: { title: '3 · Ionic interaction', body: 'Cations (Na⁺) bind the negative charges of the GAGs.', src: SRC(30) } },
        { k: 'Force 4', title: 'Osmotic attraction', body: 'Trapped Na⁺ pulls in water', viz: (v) => forceMini(v, 4), tip: { title: '4 · Osmotic attraction', body: 'The cations held in the matrix osmotically attract water.', src: SRC(30) } },
      ],
      notes: [
        'Slide 30 legend: 1 electrostatic repulsion, 2 hydrogen bonding, 3 ionic interaction, 4 osmotic attraction.',
        'Together they make the extracellular matrix a hydrated gel.',
      ],
    },
    {
      eyebrow: 'Proteoglycans · resilience',
      title: 'A bottle brush that <em>springs back</em>',
      bullets: [
        { t: 'GAGs + core protein = <b>proteoglycan</b>', tip: { title: 'Bottle-brush proteoglycans', body: 'GAGs usually bind a core protein, forming 3D “bottle brush” proteoglycans. This anchors them to specific locations and maximises water attraction.', src: SRC(29) } },
        { t: 'Negative charges pull in <b>water</b>', tip: { title: 'Hydration', body: 'Because of their high negative charge, GAGs strongly attract water.', src: SRC(29) } },
        { t: 'Squeeze → water <b>out</b>', tip: { title: 'Compression', body: 'Water is squeezed out and the GAGs occupy a smaller volume.', src: SRC(31) } },
        { t: 'Release → charges <b>re-expand</b>', tip: { title: 'Resilience', body: 'On release, charge repulsion springs the GAGs back to their hydrated volume. GAGs also slide past each other like magnets of the same polarity — slippery mucus and synovial fluid. Seen in cartilage, synovial fluid and vitreous humor.', src: SRC(31) } },
      ],
      steps: 2,
      src: 'Lecture slides 29, 31 · procedural model, schematic (not to scale)',
      notes: [
        'Gold rod: core protein. Green/blue bead chains: GAGs, with glowing negative charges. Red-white molecules: water held in the brush.',
        'Build 1 — compress (or drag the slider): water is squeezed out and the GAGs crowd together.',
        'Build 2 — release: repulsion of the negative charges springs the brush back and water returns — resilience of cartilage, synovial fluid and the vitreous humor.',
        'Slide 31 analogy: GAGs slide past each other like magnets with the same polarity — the slippery feel of mucus and synovial fluid.',
      ],
      visual: brushViz,
    },
    {
      layout: 'full',
      eyebrow: 'Clinically important GAGs',
      title: 'Six GAGs at a <em>glance</em>',
      bullets: [{ t: 'Hover a tile' }, { t: 'Filter by feature' }],
      steps: 5,
      src: 'Lecture slide 33 · † location per Lippincott',
      notes: [
        'Each GAG = amino sugar + sugar acid (KS is the exception: galactose instead of an acid).',
        'Build 1: non-sulfated → hyaluronic acid only; it is also the only one not attached to a core protein, and the longest chain.',
        'Build 2: galactosamine → chondroitin and dermatan sulfate. Build 3: iduronic acid → dermatan, heparin, heparan sulfate.',
        'Build 4: heparin is richest in sulfate — mast cells, anticoagulant. Build 5: chondroitin sulfate is the most abundant (cartilage).',
        'Keratan sulfate → corneal transparency; dermatan → shape of skin and eye; heparan → basement membranes and cell surfaces.',
      ],
      visual: gagGridViz,
    },
    {
      layout: 'full',
      eyebrow: 'Check yourself · session 2',
      title: 'The odd one <em>out</em>',
      steps: 2,
      src: 'Lecture slides 34, 36',
      notes: ['Q1: the non-sulfated GAG is hyaluronic acid.', 'Q2: hyaluronic acid is not attached to a core protein, so it is not usually found in a proteoglycan.'],
      visual: (el) => mcqViz(el, [
        { k: 'Q1', q: 'Which is a <b>non-sulfated</b> glycosaminoglycan?', opts: ['Hyaluronic acid', 'Dermatan sulfate', 'Chondroitin sulfate', 'Heparan sulfate', 'Heparin'], ans: 0, why: 'Hyaluronic acid is the only non-sulfated GAG.' },
        { k: 'Q2 · critical thinking', q: 'Which is <b>not usually</b> found in a proteoglycan?', opts: ['Hyaluronic acid', 'Dermatan sulfate', 'Chondroitin sulfate', 'Heparan sulfate', 'Heparin'], ans: 0, why: 'A proteoglycan is GAGs bound to a core protein — HA is not attached to one.' },
      ]),
    },
    {
      layout: 'full',
      eyebrow: 'Clinical correlation',
      title: 'Mucopolysaccharidoses',
      bullets: [{ t: 'Lysosomal enzyme deficiency' }, { t: 'All AR except Hunter' }],
      steps: 4,
      src: 'Lecture slide 32 · enzymes per Lippincott · schematic',
      notes: [
        'Hereditary deficiency of a lysosomal enzyme that degrades GAGs → progressive lysosomal accumulation → skeletal deformities, intellectual disability.',
        'Press → through the four: Hurler (MPS I), Hunter (MPS II), Sanfilippo (MPS III), Sly (MPS VII).',
        'Stored GAG: dermatan + heparan sulfate in Hurler, Hunter and Sly; heparan sulfate only in Sanfilippo.',
        'Inheritance: all autosomal recessive except Hunter, which is X-linked.',
        'Enzymes (textbook, in tips): α-L-iduronidase, iduronate sulfatase, heparan-degrading enzymes, β-glucuronidase. Lippincott also lists chondroitin sulfate for Sly.',
      ],
      visual: mpsViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { icon: 'atom', big: '4', title: 'isomer types', body: 'Epimers, anomers, enantiomers, aldose–ketose.' },
        { icon: 'cycle', big: '64%', title: 'β-glucose', body: 'α 36% at equilibrium; open chain ≈1%.' },
        { icon: 'drop', big: 'HA', title: 'the odd GAG', body: 'Non-sulfated, no core protein, longest.' },
        { icon: 'person', big: 'X', title: 'Hunter only', body: 'X-linked; other MPS types are autosomal recessive.' },
      ],
      notes: 'Recap the four anchors, then open the question bank.',
    },
  ],
};
