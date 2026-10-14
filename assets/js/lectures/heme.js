// Heme metabolism: synthesis, porphyrias, degradation (L.26 – L.27) — interactive revision deck.
import { h, s, setRich, icon } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show, drawPath } from '../viz/diagram.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, glowSprite, cylinderBetween, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { loadPDB, buildProtein } from '../viz/protein.js';

const gsap = window.gsap;

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                   */
/* ------------------------------------------------------------------ */
const SRC = (p) => `Lecture slide ${p}`;
const MITO = 'var(--fadh)';          // mitochondria (purple, as on the lecture's compartment slide)
const CYTO = 'var(--prot)';          // cytosol (orange)
const HEME = 'var(--a1)';            // heme red
const PORPH = '#e0447c';             // coloured porphyrins (magenta-red)
const BV = 'var(--act)';             // biliverdin green
const UCB = 'var(--a2)';             // unconjugated bilirubin (yellow-orange)
const CB = 'var(--atp)';             // conjugated bilirubin (gold)
const UBG = 'var(--fg-2)';           // urobilinogen
const STER = '#a8693a';              // stercobilin brown
const URO = '#e2bd2c';               // urobilin yellow
const SIDE = { A: '#5ed38a', P: '#4aa3ff', M: '#ff6fae', V: '#ff9f0a' };
const SIDE3 = { A: 0x5ed38a, P: 0x4aa3ff, M: 0xff6fae, V: 0xff9f0a };
const GLOBIN = [0xff5a64, 0xffa94d, 0xff5a64, 0xffa94d];
const ENZ_SHORT = ['ALA synthase', 'ALA dehydratase', 'HMB synthase', 'UROgen III synthase', 'UROgen decarboxylase', 'CPgen oxidase', 'PPgen oxidase', 'Ferrochelatase'];
const ENZ_FULL = [
  'δ-Aminolevulinic acid (ALA) synthase · needs pyridoxal phosphate (B6) · rate-limiting',
  'ALA dehydratase',
  'Hydroxymethylbilane synthase (= porphobilinogen deaminase)',
  'Uroporphyrinogen III synthase (= cosynthase)',
  'Uroporphyrinogen decarboxylase',
  'Coproporphyrinogen oxidase',
  'Protoporphyrinogen oxidase',
  'Ferrochelatase (inserts Fe²⁺)',
];
const COMP = ['m', 'c', 'c', 'c', 'c', 'm', 'm', 'm'];
const compCol = (i) => (COMP[i] === 'm' ? MITO : CYTO);

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const T = (o) => JSON.stringify(o);

/** Particles along a path with live-adjustable speed and density. */
function varFlow(D, path, o = {}) {
  const el = path.path || path;
  const count = o.count ?? 4;
  const dots = Array.from({ length: count }, () => {
    const c = s('circle', { r: o.r ?? 9, style: `fill:${o.color || 'var(--a1)'};display:none`, filter: o.glow === false ? null : `url(#${D.glowId})` });
    (o.layer || D.layers.fx).append(c);
    return c;
  });
  let total = el.getTotalLength(), dist = 0, last = null, raf = null, running = false, rate = 1, dens = 1;
  const loop = (now) => {
    if (last !== null) dist += ((now - last) / 1000) * (o.speed ?? 150) * rate;
    last = now;
    dots.forEach((c, i) => {
      const d = (dist + (i * total) / count) % total;
      const p = el.getPointAtLength(d);
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      const f = d / total;
      c.style.opacity = i < Math.round(count * dens) ? Math.min(1, Math.min(f, 1 - f) * 8) : 0;
    });
    raf = requestAnimationFrame(loop);
  };
  const api = {
    dots, on: false,
    play() { api.on = true; if (running) return; running = true; last = null; total = el.getTotalLength(); dots.forEach((c) => (c.style.display = '')); raf = requestAnimationFrame(loop); },
    pause() { running = false; cancelAnimationFrame(raf); },
    hide() { api.on = false; api.pause(); dots.forEach((c) => (c.style.display = 'none')); },
    set(on) { on ? api.play() : api.hide(); },
    rate(v) { rate = v; },
    density(v) { dens = v; },
    color(c) { dots.forEach((d) => (d.style.fill = c)); },
    destroy() { api.pause(); dots.forEach((c) => c.remove()); },
  };
  if (o.autoplay) api.play();
  return api;
}

/** Numbered step marker (circle) for pathway diagrams. */
function stepDot(D, x, y, n, col, r = 20) {
  const g = s('g', { transform: `translate(${x} ${y})` });
  const c = s('circle', { r, style: `fill:var(--bg);stroke:${col};stroke-width:3.5;transition:fill .4s` });
  const t = s('text', { y: r * 0.36, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${Math.round(r * 1.1)}px;font-weight:720;fill:${col}` });
  t.textContent = n;
  const x1 = s('path', { d: `M${-r * 0.42},${-r * 0.42} L${r * 0.42},${r * 0.42} M${r * 0.42},${-r * 0.42} L${-r * 0.42},${r * 0.42}`, style: 'stroke:#fff;stroke-width:4.5;stroke-linecap:round;opacity:0' });
  g.append(c, t, x1);
  D.layers.labels.append(g);
  return {
    g, c, t,
    block(on) {
      c.style.fill = on ? 'var(--inh)' : 'var(--bg)';
      c.style.stroke = on ? 'var(--inh)' : col;
      t.style.opacity = on ? 0 : 1;
      x1.style.opacity = on ? 1 : 0;
    },
    fill(on) { c.style.fill = on ? `color-mix(in oklab, ${col} 30%, var(--bg))` : 'var(--bg)'; },
  };
}

/** Glowing pulse ring around a node (for accumulation). */
function pulseRing(D, node, col = 'var(--inh)') {
  const r = s('rect', { x: node.x - node.w0 / 2 - 8, y: node.y - node.h0 / 2 - 8, width: node.w0 + 16, height: node.h0 + 16, rx: (node.h0 + 16) / 2, style: `fill:color-mix(in oklab, ${col} 18%, transparent);stroke:${col};stroke-width:4;opacity:0`, filter: `url(#${D.glowId})` });
  D.layers.fx.append(r);
  let tw = null;
  return {
    el: r,
    set(on) {
      tw?.kill(); tw = null;
      if (on) { gsap.set(r, { opacity: 0.35 }); tw = gsap.to(r, { opacity: 1, duration: 0.8, repeat: -1, yoyo: true, ease: 'sine.inOut' }); }
      else gsap.to(r, { opacity: 0, duration: 0.3 });
    },
  };
}

/** Sun glyph (optionally crossed out) — SVG group. */
function sunGlyph(x, y, r = 18, crossed = false, col = 'var(--atp)') {
  const g = s('g', { transform: `translate(${x} ${y})` });
  g.append(s('circle', { r: r * 0.55, style: `fill:${col}` }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.append(s('line', { x1: Math.cos(a) * r * 0.8, y1: Math.sin(a) * r * 0.8, x2: Math.cos(a) * r * 1.15, y2: Math.sin(a) * r * 1.15, style: `stroke:${col};stroke-width:${r * 0.16};stroke-linecap:round` }));
  }
  if (crossed) g.append(s('line', { x1: -r * 1.1, y1: r * 1.1, x2: r * 1.1, y2: -r * 1.1, style: `stroke:var(--inh);stroke-width:${r * 0.2};stroke-linecap:round` }));
  return g;
}
const NOSUN = '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/><path d="M3 21 21 3" stroke="var(--inh)" stroke-width="2.4"/></svg>';
const ico = (name) => (name === 'nosun' ? NOSUN : icon(name, '1.1em'));

/** Q&A reveal list (learning checks / case). */
function qaList(qs, { cols = 1, qSize = 30, aSize = 26, gap = 18, num = true } = {}) {
  const list = h('div', { style: `display:grid;gap:${gap}px;align-content:center;${cols > 1 ? `grid-template-columns:repeat(${cols},1fr);align-items:start;` : ''}` });
  const ans = qs.map(([q, a], i) => {
    const A = h('div', { style: `font-size:${aSize}px;color:var(--fg-2);line-height:1.36;opacity:0;height:0;overflow:hidden`, html: a });
    const head = h('div', { style: `font-size:${qSize}px;font-weight:650;letter-spacing:-.01em;line-height:1.22;display:flex;gap:16px` }, [
      num ? h('span', { style: 'color:var(--ink);font-variant-numeric:tabular-nums;flex:none', text: String(i + 1) }) : null,
      h('span', { html: q }),
    ]);
    const row = h('div', { style: 'padding:18px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line)' }, [head, A]);
    list.append(row);
    return A;
  });
  const step = (n) => ans.forEach((a, i) => gsap.to(a, { opacity: i < n ? 1 : 0, height: i < n ? 'auto' : 0, marginTop: i < n ? 10 : 0, duration: 0.5 }));
  return { el: list, step };
}

/* ------------------------------------------------------------------ */
/* Real 3D heme (HEM het of 4HHB, PDB atom names)                      */
/* ------------------------------------------------------------------ */
// Lecture ring numbering (slide 4: 1M 2V | 3M 4V | 5M 6P | 7P 8M) mapped onto PDB ring letters.
const RING_NUM = { B: 'I', C: 'II', D: 'III', A: 'IV' };
const BRIDGE_GREEK = { CHC: 'α', CHD: 'β', CHA: 'γ', CHB: 'δ' };
const EL3 = { C: 0x8e8e96, N: 0x3a82ff, O: 0xff453a, Fe: 0xd9822b };
const ER = { C: 0.36, N: 0.37, O: 0.35, Fe: 0.62 };
const HEM_BONDS = (() => {
  const b = [];
  'ABCD'.split('').forEach((r) => b.push([`C1${r}`, `C2${r}`], [`C2${r}`, `C3${r}`], [`C3${r}`, `C4${r}`], [`C4${r}`, `N${r}`], [`N${r}`, `C1${r}`], [`N${r}`, 'FE']));
  b.push(['CHA', 'C1A'], ['CHA', 'C4D'], ['CHB', 'C4A'], ['CHB', 'C1B'], ['CHC', 'C4B'], ['CHC', 'C1C'], ['CHD', 'C4C'], ['CHD', 'C1D']);
  b.push(['CMA', 'C3A'], ['CMB', 'C2B'], ['CMC', 'C2C'], ['CMD', 'C2D']);
  b.push(['CAB', 'C3B'], ['CAB', 'CBB'], ['CAC', 'C3C'], ['CAC', 'CBC']);
  b.push(['CAA', 'C2A'], ['CAA', 'CBA'], ['CBA', 'CGA'], ['CGA', 'O1A'], ['CGA', 'O2A']);
  b.push(['CAD', 'C3D'], ['CAD', 'CBD'], ['CBD', 'CGD'], ['CGD', 'O1D'], ['CGD', 'O2D']);
  return b;
})();
function roleOf(n) {
  if (n === 'FE') return 'fe';
  if (/^CH[A-D]$/.test(n)) return 'bridge';
  if (/^CM[A-D]$/.test(n)) return 'methyl';
  if (/^C[AB][BC]$/.test(n)) return 'vinyl';
  if (/^(C[ABG][AD]|O[12][AD])$/.test(n)) return 'prop';
  if (/^(C[1-4]|N)[A-D]$/.test(n)) return 'ring';
  return 'other';
}
const sphGeo = new THREE.SphereGeometry(1, 32, 22);

/**
 * hemeModel(het, {orient, offset, scale, mats}) → { group, atoms, pos(name), ringCenter(L), mats, fe }
 * Bonds come from the heme b template (PDB names), not distances. orient: lay the porphyrin flat
 * facing +z with ring I on top and rings I→IV running clockwise (as on lecture slide 4).
 */
function hemeModel(het, o = {}) {
  const scale = o.scale ?? 1;
  const atoms = het.atoms.map((a) => ({ el: a[0] === 'FE' ? 'Fe' : a[0], name: a[1], role: roleOf(a[1]), ring: /^(C[1-4]|N)[A-D]$/.test(a[1]) ? a[1].slice(-1) : null, p: new THREE.Vector3(a[2], a[3], a[4]) }));
  const idx = Object.fromEntries(atoms.map((a, i) => [a.name, i]));
  const P = (n) => atoms[idx[n]].p;
  const ringCenter = (r) => atoms.filter((a) => a.ring === r).reduce((acc, a) => acc.add(a.p), new THREE.Vector3()).multiplyScalar(1 / 5);
  if (o.orient) {
    const c0 = P('FE').clone();
    atoms.forEach((a) => a.p.sub(c0));
    const nrm = new THREE.Vector3().subVectors(P('NB'), P('NA')).cross(new THREE.Vector3().subVectors(P('NC'), P('NA'))).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(nrm, new THREE.Vector3(0, 0, 1));
    atoms.forEach((a) => a.p.applyQuaternion(q));
    const ang = (r) => { const c = ringCenter(r); return Math.atan2(c.y, c.x); };
    let d = ang('C') - ang('B');
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (d > 0) atoms.forEach((a) => { a.p.x = -a.p.x; a.p.z = -a.p.z; }); // 180° about y → clockwise
    const rot = Math.PI / 2 - ang('B');
    const Z = new THREE.Vector3(0, 0, 1);
    atoms.forEach((a) => a.p.applyAxisAngle(Z, rot));
    const nc = ['NA', 'NB', 'NC', 'ND'].reduce((acc, n) => acc.add(P(n)), new THREE.Vector3()).multiplyScalar(0.25);
    atoms.forEach((a) => a.p.sub(nc));
  } else if (o.offset) atoms.forEach((a) => a.p.sub(o.offset));

  const mats = o.mats || {};
  const matFor = (key, el) => (mats[key] ||= glossy(EL3[el], { emissive: 0x000000, emissiveIntensity: 0 }));
  const g = new THREE.Group();
  atoms.forEach((a) => {
    const m = new THREE.Mesh(sphGeo, matFor(`${a.role}:${a.el}`, a.el));
    m.scale.setScalar(ER[a.el] * scale);
    m.position.copy(a.p);
    g.add(m);
    a.mesh = m;
  });
  HEM_BONDS.forEach(([n1, n2]) => {
    const a = atoms[idx[n1]], b = atoms[idx[n2]];
    if (!a || !b) return;
    const isFe = a.el === 'Fe' || b.el === 'Fe';
    const mid = a.p.clone().add(b.p).multiplyScalar(0.5);
    const r = (isFe ? 0.085 : 0.13) * scale;
    const ma = isFe ? matFor('febond', 'Fe') : matFor(`${a.role}:${a.el}`, a.el);
    const mb = isFe ? matFor('febond', 'Fe') : matFor(`${b.role}:${b.el}`, b.el);
    g.add(cylinderBetween(a.p, mid, r, ma, 12), cylinderBetween(mid, b.p, r, mb, 12));
  });
  return { group: g, atoms, idx, mats, fe: atoms[idx.FE], pos: (n) => P(n).clone(), ringCenter };
}

/** Tween a set of shared materials (keys) to a colour (+ emissive glow). hex null = element colour. */
function paint(mats, keys, hex, glow = 0, dur = 0.6) {
  keys.forEach((k) => {
    const m = mats[k];
    if (!m) return;
    const el = k.split(':')[1] || 'Fe';
    const c = new THREE.Color(hex ?? EL3[el] ?? 0x8e8e96);
    gsap.to(m.color, { r: c.r, g: c.g, b: c.b, duration: dur });
    gsap.to(m.emissive, { r: c.r, g: c.g, b: c.b, duration: dur });
    gsap.to(m, { emissiveIntensity: glow, duration: dur });
  });
}
const CARBON_KEYS = ['ring:C', 'bridge:C', 'methyl:C', 'vinyl:C', 'prop:C'];

/** Load + build any molecule key (2D PubChem layouts rescaled to Å-like bond lengths). */
async function buildKey(key, o = {}) {
  if (key === 'heme') { const pdb = await loadPDB('4HHB'); return hemeModel(pdb.het[1], { orient: true }).group; }
  const d = await loadMol(key);
  const data = d.dim === '2d' ? { ...d, atoms: d.atoms.map(([e, x, y, z]) => [e, x * 1.42, y * 1.42, z]) } : d;
  return buildMolecule(data, { hideH: 'nonpolar', ...o });
}

/** Distance needed to frame an object of radius r in a kit's camera (handles narrow aspect). */
function frameDist(kit, r, fill) {
  const fov = THREE.MathUtils.degToRad(kit.camera.fov);
  const fitH = r / Math.sin(fov / 2);
  return Math.max(fitH, fitH / Math.max(0.1, kit.camera.aspect)) / fill;
}

/** Cross-fading single-molecule viewer. show(key | null, opts). */
function molViewer(host, o = {}) {
  const kit = createScene(host, { cam: [0, 0, 20], autoRotate: o.autoRotate ?? 1.1, ...o.scene });
  let cur = null, token = 0;
  const api = kitController(kit);
  api.kit = kit;
  api.show = async (key, mo = {}) => {
    const my = ++token;
    const next = key ? await buildKey(key, mo) : null;
    if (my !== token) return;
    const old = cur;
    cur = next;
    if (old) { gsap.killTweensOf(old.scale); gsap.to(old.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { kit.root.remove(old); } }); }
    if (!next) return;
    if (mo.tilt) next.rotation.set(...mo.tilt);
    const r = new THREE.Box3().setFromObject(next).getBoundingSphere(new THREE.Sphere()).radius;
    next.scale.setScalar(0.001);
    kit.root.add(next);
    gsap.to(next.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: old ? 0.25 : 0, ease: 'back.out(1.5)' });
    const dist = frameDist(kit, r, o.fill ?? 0.84);
    const dir = kit.camera.position.clone().sub(kit.controls.target).normalize();
    kit.controls.target.set(0, 0, 0);
    gsap.to(kit.camera.position, { x: dir.x * dist, y: dir.y * dist, z: dir.z * dist, duration: old ? 0.8 : 0, ease: 'power2.inOut', onUpdate: () => kit.camera.updateProjectionMatrix() });
    kit.camera.near = dist / 100; kit.camera.far = dist * 10;
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* 1 · Hero: real hemoglobin (4HHB) with its four hemes                */
/* ------------------------------------------------------------------ */
async function heroViz(el) {
  const kit = createScene(el, { cam: [0, 16, 90], autoRotate: 0.45, fov: 28 });
  const pdb = await loadPDB('4HHB');
  const prot = buildProtein(pdb, { colorBy: 'chain', chainColors: GLOBIN });
  const mats = {};
  const glows = [];
  pdb.het.forEach((het) => {
    const m = hemeModel(het, { offset: prot.userData.center, scale: 1.35, mats });
    prot.add(m.group);
    const gl = glowSprite(0xff8a50, 12);
    gl.position.copy(m.fe.p);
    prot.add(gl);
    glows.push(gl);
  });
  paint(mats, CARBON_KEYS, 0xfff1dc, 0.15, 0);
  prot.rotation.set(0.2, 0.3, 0);
  kit.root.add(prot);
  kit.fit(prot, 1.5);
  kit.onFrame((dt, t) => glows.forEach((g, i) => g.scale.setScalar(11 + Math.sin(t * 1.6 + i) * 2)));
  return kitController(kit);
}

/* ------------------------------------------------------------------ */
/* 3 · Opening case: blistered hands and dark urine                    */
/* ------------------------------------------------------------------ */
const SKIN = '#d9a27c';
function handGlyph(parent) {
  const hand = s('g');
  hand.append(s('rect', { x: 95, y: 330, width: 150, height: 150, rx: 34, style: `fill:${SKIN}` }));
  hand.append(s('rect', { x: 66, y: 168, width: 216, height: 210, rx: 74, style: `fill:${SKIN}` }));
  [[74, 44, 50, 220], [130, 12, 52, 250], [188, 28, 50, 236], [242, 84, 44, 190]].forEach(([x, y, w, hh]) => {
    hand.append(s('rect', { x, y, width: w, height: hh, rx: w / 2, style: `fill:${SKIN}` }));
    hand.append(s('rect', { x: x + 9, y: y + 9, width: w - 18, height: 34, rx: 13, style: 'fill:#f0cbb0' }));
  });
  hand.append(s('rect', { x: 14, y: 214, width: 54, height: 178, rx: 27, transform: 'rotate(-34 41 360)', style: `fill:${SKIN}` }));
  [[99, 238], [156, 226], [213, 236], [264, 262]].forEach(([x, y]) => hand.append(s('path', { d: `M${x - 14},${y} q14,-8 28,0`, style: 'fill:none;stroke:#b98263;stroke-width:3;stroke-linecap:round' })));
  parent.append(hand);
  return hand;
}

function caseViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '800px 1fr';
  el.style.gap = '56px';
  const P = (html) => h('p', { style: 'font-size:32px;line-height:1.36;margin:20px 0 0', html });
  const card = h('div.case', { style: 'padding:46px 52px;align-self:center' }, [
    h('div.tag', { html: '● Clinical case' }),
    P('A <b>36-year-old woman</b>: recurrent, painless <b>blisters</b> and <b>fragile skin</b> on the <b>backs of both hands</b>.'),
    P('Works indoors · recently started <b>daily morning walks</b>.'),
    P('<b>No</b> abdominal pain. <b>No</b> neurological signs.'),
    P('Urine sometimes <b>reddish-brown</b>, especially after standing.'),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:14px;margin-top:30px' }, [h('span.chip.inh', { style: 'font-size:28px', text: 'Lab: ↑ urinary uroporphyrins' })]),
  ]);
  const vis = h('div', { style: 'position:relative' });
  el.append(card, vis);
  const D = diagram(vis, 856, 720);
  // hand
  const handG = s('g', { transform: 'translate(40 70)' });
  D.layers.nodes.append(handG);
  handGlyph(handG);
  const blisters = s('g', { style: 'opacity:0' });
  [[120, 270, 15], [176, 214, 11], [228, 280, 17], [150, 335, 11], [250, 340, 10], [104, 318, 9], [204, 160, 9], [152, 112, 8], [262, 176, 8]].forEach(([x, y, r]) => {
    blisters.append(s('circle', { cx: x, cy: y, r, style: 'fill:rgba(255,246,232,.82);stroke:#fff;stroke-width:2' }));
    blisters.append(s('circle', { cx: x - r * 0.35, cy: y - r * 0.35, r: r * 0.28, style: 'fill:#fff;opacity:.9' }));
  });
  [[190, 312, 9, 6], [137, 196, 7, 5], [266, 236, 8, 5], [96, 280, 6, 4]].forEach(([x, y, rx, ry]) => blisters.append(s('ellipse', { cx: x, cy: y, rx, ry, style: 'fill:#a83a2c' })));
  handG.append(blisters);
  // sun + rays
  const sun = s('g', { style: 'opacity:.35' });
  sun.append(sunGlyph(470, 104, 46));
  const rays = s('g', { style: 'opacity:0' });
  [[420, 140, 300, 220], [432, 158, 322, 300], [446, 168, 330, 372]].forEach(([x1, y1, x2, y2]) => rays.append(s('line', { x1, y1, x2, y2, style: 'stroke:var(--atp);stroke-width:6;stroke-linecap:round;stroke-dasharray:16 14;opacity:.8' })));
  D.layers.fx.append(rays);
  D.layers.labels.append(sun);
  gsap.to(rays.querySelectorAll('line'), { strokeDashoffset: -60, duration: 1.2, repeat: -1, ease: 'none' });
  const lHand = D.text(210, 610, 'Backs of both hands', { anchor: 'middle', style: 'font-weight:650' });
  const lHand2 = D.text(210, 646, 'sun-exposed skin', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);opacity:0' });
  // urine cup
  const cupG = s('g', { transform: 'translate(560 270)' });
  const clipId = `cupclip${Math.random().toString(36).slice(2, 7)}`;
  const cupD = 'M0,0 L210,0 L188,270 Q186,284 172,284 L38,284 Q24,284 22,270 Z';
  D.defs.append(s('clipPath', { id: clipId }, [s('path', { d: cupD })]));
  cupG.append(s('path', { d: cupD, style: 'fill:var(--surface);stroke:none' }));
  const liquid = s('rect', { x: -10, y: 70, width: 240, height: 230, 'clip-path': `url(#${clipId})`, style: 'fill:#f2d36b' });
  cupG.append(liquid);
  cupG.append(s('path', { d: cupD, style: 'fill:none;stroke:var(--fg-3);stroke-width:4;stroke-linejoin:round' }));
  cupG.append(s('rect', { x: 26, y: 90, width: 14, height: 150, rx: 7, style: 'fill:#fff;opacity:.28', 'clip-path': `url(#${clipId})` }));
  D.layers.nodes.append(cupG);
  const lCup = D.text(665, 610, 'Urine', { anchor: 'middle', style: 'font-weight:650' });
  const lCup2 = D.text(665, 646, 'reddish-brown on standing', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);opacity:0' });
  // the question
  const q = s('g', { style: 'opacity:0' });
  q.append(s('path', { d: 'M370,420 C410,390 450,390 476,410', style: 'fill:none;stroke:var(--fg-3);stroke-width:3;stroke-dasharray:6 10' }));
  q.append(s('path', { d: 'M520,410 C534,392 546,392 556,404', style: 'fill:none;stroke:var(--fg-3);stroke-width:3;stroke-dasharray:6 10' }));
  const qm = s('text', { x: 498, y: 450, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:96px;font-weight:760;fill:var(--ink)' });
  qm.textContent = '?';
  q.append(qm);
  const qt = s('text', { x: 428, y: 712, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:40px;font-weight:700;fill:var(--ink);letter-spacing:-.02em' });
  qt.textContent = 'What connects them?';
  q.append(qt);
  D.layers.labels.append(q);
  return {
    step(n) {
      gsap.to(blisters, { opacity: n >= 1 ? 1 : 0, duration: 0.6 });
      gsap.to(rays, { opacity: n >= 1 ? 1 : 0, duration: 0.6 });
      gsap.to(sun, { opacity: n >= 1 ? 1 : 0.35, duration: 0.6 });
      gsap.to(lHand2, { opacity: n >= 1 ? 1 : 0, duration: 0.6 });
      gsap.to(liquid, { attr: { y: n >= 2 ? 60 : 70 }, fill: n >= 2 ? '#9a3a1f' : '#f2d36b', duration: n >= 2 ? 2.2 : 0.6, ease: 'power1.inOut' });
      gsap.to(lCup2, { opacity: n >= 2 ? 1 : 0, duration: 0.6 });
      gsap.to(q, { opacity: n >= 3 ? 1 : 0, duration: 0.6 });
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 4 · Heme structure in 3D                                            */
/* ------------------------------------------------------------------ */
async function hemeStructViz(el) {
  const kit = createScene(el, { cam: [0, 0, 30], autoRotate: 0 });
  const pdb = await loadPDB('4HHB');
  const M = hemeModel(pdb.het[1], { orient: true });
  const g = M.group;
  kit.root.add(g);
  kit.fit(g, 1.02);
  let held = false;
  kit.controls.addEventListener('start', () => { held = true; });
  kit.onFrame((dt, t) => { if (!held) { g.rotation.y = Math.sin(t * 0.45) * 0.38; g.rotation.x = -0.12 + Math.sin(t * 0.31) * 0.08; } });
  const fe = glowSprite(0xff7a3d, 5.5);
  fe.position.copy(M.fe.p);
  fe.material.opacity = 0;
  g.add(fe);
  const L = (html, p, cls = 'acc') => { const o = kit.label(html, [p.x, p.y, p.z], { cls, parent: g }); o.element.style.opacity = 0; return o; };
  const out = (v, k, dz = 0.6) => { const p = v.clone(); p.x *= k; p.y *= k; p.z += dz; return p; };
  const ringL = ['B', 'C', 'D', 'A'].map((r) => { const o = L(RING_NUM[r], out(M.ringCenter(r), 1, 1.0), 'plain'); Object.assign(o.element.style, { fontSize: '34px', fontWeight: 800, color: 'var(--ink)' }); return o; });
  const greek = Object.entries(BRIDGE_GREEK).map(([n, gk]) => L(gk, out(M.pos(n), 1.32), 'sm plain'));
  const bridgeL = L('Methine bridge <span style="color:var(--fg-2)">=CH–</span>', out(M.pos('CHC'), 2.0));
  const feL = L('Fe²⁺', new THREE.Vector3(0, -0.9, 1.6));
  const midP = M.pos('CGA').add(M.pos('CGD')).multiplyScalar(0.5);
  const sideL = [
    L(`<span style="color:${SIDE.M}">●</span> Methyl ×4`, out(M.pos('CMD'), 1.42)),
    L(`<span style="color:${SIDE.V}">●</span> Vinyl ×2`, out(M.pos('CBB'), 1.32)),
    L(`<span style="color:${SIDE.P}">●</span> Propionate ×2`, out(midP, 1.3)),
  ];
  const vis = (arr, on, op = 1) => arr.forEach((o) => gsap.to(o.element, { opacity: on ? op : 0, duration: 0.5 }));
  const RING = ['ring:C', 'ring:N'];
  return kitController(kit, {
    step(n) {
      paint(M.mats, ['ring:C'], n === 1 ? 0xff6b5e : null, n === 1 ? 0.35 : 0);
      paint(M.mats, ['ring:N'], n === 1 ? 0xff6b5e : n === 3 ? 0x4aa3ff : null, n === 1 || n === 3 ? 0.45 : 0);
      paint(M.mats, ['bridge:C'], n === 2 ? 0xffd60a : null, n === 2 ? 0.6 : 0);
      paint(M.mats, ['febond'], n === 3 ? 0xffb35c : null, n === 3 ? 0.7 : 0);
      paint(M.mats, ['fe:Fe'], null, n === 3 ? 0.8 : 0);
      paint(M.mats, ['methyl:C'], n >= 4 ? SIDE3.M : null, n >= 4 ? 0.3 : 0);
      paint(M.mats, ['vinyl:C'], n >= 4 ? SIDE3.V : null, n >= 4 ? 0.3 : 0);
      paint(M.mats, ['prop:C'], n >= 4 ? SIDE3.P : null, n >= 4 ? 0.3 : 0);
      gsap.to(fe.material, { opacity: n === 3 ? 1 : n > 3 ? 0.35 : 0, duration: 0.6 });
      vis(ringL, n >= 1, n === 1 ? 1 : 0.55);
      vis(greek, n === 2);
      vis([bridgeL], n === 2);
      vis([feL], n === 3);
      vis(sideL, n >= 4);
      void RING;
    },
  });
}

/* ------------------------------------------------------------------ */
/* 5 · Sites of synthesis                                              */
/* ------------------------------------------------------------------ */
function sitesViz(el) {
  const D = diagram(el, 960, 860);
  const skin = 'color-mix(in oklab, var(--fg) 15%, var(--bg))';
  const body = s('g');
  body.append(s('circle', { cx: 300, cy: 100, r: 60, style: `fill:${skin}` }));
  body.append(s('rect', { x: 272, y: 150, width: 56, height: 50, rx: 18, style: `fill:${skin}` }));
  body.append(s('path', { d: 'M178,192 Q300,170 422,192 Q458,202 456,246 L432,470 Q442,524 418,548 L182,548 Q158,524 168,470 L144,246 Q142,202 178,192 Z', style: `fill:${skin}` }));
  [[[166, 222], [124, 400], [112, 570]], [[434, 222], [476, 400], [488, 570]], [[244, 520], [234, 690], [228, 840]], [[356, 520], [366, 690], [372, 840]]].forEach((pts, i) => {
    body.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), style: `fill:none;stroke:${skin};stroke-width:${i < 2 ? 54 : 84};stroke-linecap:round;stroke-linejoin:round` }));
  });
  D.layers.regions.append(body);
  // bone marrow (red marrow: flat bones + proximal long bones)
  const BM = HEME;
  const marrow = s('g', { style: 'opacity:.18', filter: `url(#${D.glowId})` });
  const bone = (d, w = 10) => marrow.append(s('path', { d, style: `fill:none;stroke:${BM};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round` }));
  bone('M300,212 L300,330', 16); // sternum
  [[232, 0], [256, 1], [280, 2]].forEach(([y]) => { bone(`M292,${y} Q230,${y + 6} 196,${y + 46}`, 7); bone(`M308,${y} Q370,${y + 6} 404,${y + 46}`, 7); });
  bone('M300,342 L300,470', 9); // spine (lumbar)
  marrow.append(s('path', { d: 'M298,500 C250,462 196,466 192,500 C190,530 230,548 262,552 Z', style: `fill:${BM}` }));
  marrow.append(s('path', { d: 'M302,500 C350,462 404,466 408,500 C410,530 370,548 338,552 Z', style: `fill:${BM}` }));
  bone('M246,560 L238,660', 13); bone('M354,560 L362,660', 13); // proximal femurs
  bone('M168,230 L146,320', 11); bone('M432,230 L454,320', 11); // proximal humeri
  marrow.append(s('path', { d: 'M248,64 Q300,26 352,64', style: `fill:none;stroke:${BM};stroke-width:9;stroke-linecap:round` }));
  D.layers.nodes.append(marrow);
  // liver (anatomical right = viewer's left, upper abdomen)
  const LV = UCB;
  const liver = s('path', { d: 'M178,352 Q250,318 330,330 Q392,338 410,362 Q352,420 252,432 Q196,430 184,404 Q172,380 178,352 Z', style: `fill:${LV};opacity:.18`, filter: `url(#${D.glowId})` });
  D.layers.nodes.append(liver);
  // labels + leaders
  const lead = (d, col) => { const p = s('path', { d, style: `fill:none;stroke:${col};stroke-width:3;stroke-dasharray:3 7;stroke-linecap:round;opacity:0` }); D.layers.edges.append(p); return p; };
  const lv1 = lead('M405,380 L560,380', LV);
  const bm1 = lead('M408,520 C470,560 500,600 560,600', BM);
  const tLv = D.text(580, 392, 'Liver', { cls: 'xl', style: `fill:${LV};opacity:0`, tip: { kicker: 'Lippincott Ch 21 · not on lecture slides', title: 'Liver', body: 'Most of the remaining heme synthesis happens in hepatocytes, mainly for the <b>cytochrome P450</b> enzymes.', src: `${SRC(6)} · Lippincott Ch 21` } });
  const tLv2 = D.text(580, 434, 'hepatocytes → cytochromes', { cls: 'sm', style: 'fill:var(--fg-2);opacity:0' });
  const tBm = D.text(580, 612, 'Bone marrow', { cls: 'xl', style: `fill:${BM};opacity:0`, tip: { kicker: 'Lippincott Ch 21 · not on lecture slides', title: 'Bone marrow', body: 'About 85% of heme synthesis is in <b>erythroid precursor cells</b> — for hemoglobin. The lecture lists liver and bone marrow without percentages.', src: `${SRC(6)} · Lippincott Ch 21` } });
  const tBm2 = D.text(580, 654, 'erythroid cells → hemoglobin', { cls: 'sm', style: 'fill:var(--fg-2);opacity:0' });
  let tw = [];
  const pulse = (node, on, lo, hi) => { gsap.killTweensOf(node); if (on) { gsap.fromTo(node, { opacity: lo }, { opacity: hi, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut' }); } else gsap.to(node, { opacity: 0.18, duration: 0.5 }); };
  return {
    step(n) {
      pulse(marrow, n >= 1, 0.7, 1);
      pulse(liver, n >= 2, 0.6, 0.95);
      show([bm1, tBm, tBm2], n >= 1);
      show([lv1, tLv, tLv2], n >= 2);
      void tw;
    },
    leave() { gsap.killTweensOf([marrow, liver]); },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 6 · Synthesis pathway showpiece (compartments + live 3D product)    */
/* ------------------------------------------------------------------ */
const PSTEPS = [
  { key: 'glycine', k: 'Start · mito', name: 'Glycine + succinyl-CoA', sub: '3D: glycine · succinyl-CoA is the “active” succinate' },
  { key: 'ala-delta', k: 'Step 1 · mito', name: 'δ-Aminolevulinic acid', sub: 'ALA synthase + PLP (B6) · rate-limiting' },
  { key: 'pbg', k: 'Step 2 · cytosol', name: 'Porphobilinogen', sub: 'ALA dehydratase · first pyrrole' },
  { key: 'hmb', k: 'Step 3 · cytosol', name: 'Hydroxymethylbilane', sub: 'HMB synthase · linear tetrapyrrole (2D layout)' },
  { key: 'uroporphyrinogen', k: 'Step 4 · cytosol', name: 'Uroporphyrinogen III', sub: 'UROgen III synthase · ring closed (2D layout)' },
  { key: 'coproporphyrinogen', k: 'Step 5 · cytosol', name: 'Coproporphyrinogen III', sub: 'UROgen decarboxylase · 4 acetate → methyl', badge: 'A → M' },
  { key: null, k: 'Step 6 · mito', name: 'Protoporphyrinogen IX', sub: 'Coproporphyrinogen oxidase · 2 propionate → vinyl', big: 'P → V' },
  { key: 'protoporphyrin', k: 'Step 7 · mito', name: 'Protoporphyrin IX', sub: 'Protoporphyrinogen oxidase · bridges oxidised' },
  { key: 'heme', k: 'Step 8 · mito', name: 'Heme', sub: 'Ferrochelatase inserts Fe²⁺ · real 3D (4HHB)' },
];

async function synthesisViz(el) {
  const D = diagram(el, 1712, 720);
  D.region({ x: 0, y: 0, w: 1292, h: 720, r: 36, label: 'Cytosol', lx: 1120, ly: 48, fill: `color-mix(in oklab, ${CYTO} 6%, transparent)`, stroke: `color-mix(in oklab, ${CYTO} 30%, transparent)`, labelColor: CYTO });
  const mito = s('g');
  mito.append(s('rect', { x: 22, y: 36, width: 622, height: 676, rx: 110, style: `fill:color-mix(in oklab, ${MITO} 12%, var(--bg));stroke:${MITO};stroke-width:3.5` }));
  mito.append(s('rect', { x: 38, y: 52, width: 590, height: 644, rx: 96, style: `fill:none;stroke:color-mix(in oklab, ${MITO} 55%, transparent);stroke-width:2` }));
  [330, 410].forEach((y) => mito.append(s('path', { d: `M628,${y} H566 a15,15 0 0 0 0,30 H628`, style: `fill:color-mix(in oklab, ${MITO} 16%, transparent);stroke:color-mix(in oklab, ${MITO} 55%, transparent);stroke-width:2` })));
  const ml = s('text', { x: 72, y: 100, class: 'v-label sm', style: `fill:${MITO};letter-spacing:.14em;font-weight:650;text-transform:uppercase` });
  ml.textContent = 'Mitochondrion';
  mito.append(ml);
  D.layers.regions.append(mito);

  const N = {};
  const node = (id, x, y, label, o = {}) => (N[id] = D.node({ id, x, y, label, kind: 'mol', size: 24, ...o }));
  node('start', 180, 190, 'Glycine +\nsuccinyl-CoA', { tip: { title: 'Glycine + succinyl-CoA', body: 'Succinyl-CoA is the “active” succinate. Both enter step 1 in the mitochondrion.', src: SRC(7) } });
  node('ala', 510, 190, 'δ-ALA', { size: 28 });
  node('pbg', 990, 190, 'Porphobilinogen');
  node('hmb', 990, 336, 'Hydroxymethylbilane');
  node('uro', 990, 482, 'Uroporphyrinogen III');
  node('copro', 990, 616, 'Coproporphyrinogen III');
  node('protogen', 300, 616, 'Protoporphyrinogen IX');
  node('proto', 300, 497, 'Protoporphyrin IX', { color: PORPH });
  node('heme', 300, 365, 'Heme', { size: 34, color: HEME, fill: 'color-mix(in oklab, var(--a1) 24%, transparent)' });

  const ST = [
    { from: 'start', to: 'ala', c: [362, 190], lab: [362, 146, 'middle'], by: [['PLP · B6', 362, 246, 'var(--atp)'], ['− CO₂ · CoA', 510, 252, 'var(--co2)']] },
    { from: 'ala', to: 'pbg', c: [762, 190], lab: [762, 146, 'middle'], by: [['− 2 H₂O', 762, 246, 'var(--nadh)']] },
    { from: 'pbg', to: 'hmb', c: [990, 263], lab: [1022, 271, 'start'], by: [['− 4 NH₃', 898, 263, 'var(--co2)']] },
    { from: 'hmb', to: 'uro', c: [990, 409], lab: [1022, 417, 'start'], by: [['ring closes', 888, 409, 'var(--ink)']] },
    { from: 'uro', to: 'copro', c: [990, 549], lab: [1022, 557, 'start'], by: [['− 4 CO₂', 898, 549, 'var(--co2)']] },
    { from: 'copro', to: 'protogen', c: [538, 616], lab: [538, 576, 'middle'], by: [['− 2 CO₂', 530, 664, 'var(--co2)']] },
    { from: 'protogen', to: 'proto', c: [300, 556], lab: [270, 564, 'end'], by: [] },
    { from: 'proto', to: 'heme', c: [300, 434], lab: [332, 442, 'start'], by: [['+ Fe²⁺', 150, 434, 'var(--prot)']] },
  ];
  const prodCol = { ala: 'var(--fg-2)', pbg: 'var(--fg-2)', hmb: 'var(--fg-2)', uro: 'var(--fg-2)', copro: 'var(--fg-2)', protogen: 'var(--fg-2)', proto: PORPH, heme: HEME };
  const parts = ST.map((st, i) => {
    const col = compCol(i);
    const a = D.arrow({ from: st.from, to: st.to, color: `color-mix(in oklab, ${col} 70%, var(--fg-3))`, width: 4, headSize: 15 });
    const dot = stepDot(D, st.c[0], st.c[1], i + 1, col);
    dot.g.setAttribute('data-tip', T({ kicker: `Step ${i + 1} · ${COMP[i] === 'm' ? 'mitochondria' : 'cytosol'}`, title: ENZ_SHORT[i], body: ENZ_FULL[i], src: SRC('6–7') }));
    const lab = D.text(st.lab[0], st.lab[1], ENZ_SHORT[i], { anchor: st.lab[2], cls: 'sm', style: `font-weight:650;fill:color-mix(in oklab, ${col} 75%, var(--fg))` });
    const by = st.by.map(([t, x, y, c]) => D.badge(x, y, t, { color: c, size: 22 }));
    if (i === 7) by.push(D.arrow({ from: [196, 434], to: [276, 434], color: 'var(--prot)', width: 3, headSize: 12 }).g);
    if (i === 0) {
      const ring = s('circle', { cx: st.c[0], cy: st.c[1], r: 30, style: 'fill:none;stroke:var(--atp);stroke-width:3;stroke-dasharray:5 7' });
      D.layers.fx.append(ring);
      by.push(ring);
    }
    const flow = varFlow(D, a, { count: 2, color: prodCol[st.to], speed: 110, r: 8 });
    return { els: [a.g, dot.g, lab, ...by], flow, dot, to: st.to };
  });
  [...parts.flatMap((p) => p.els), ...Object.keys(N).filter((k) => k !== 'start').map((k) => N[k].g)].forEach((e) => (e.style.opacity = 0));

  // 3D side panel
  const panel = h('div', { style: 'position:absolute;left:1322px;top:0;width:390px;height:720px;border-radius:36px;background:var(--surface);border:1px solid var(--line);overflow:hidden;display:flex;flex-direction:column' });
  const pK = h('div', { style: 'font-size:22px;font-weight:650;letter-spacing:.14em;text-transform:uppercase' });
  const pN = h('div', { style: 'font-size:34px;font-weight:720;letter-spacing:-.02em;line-height:1.08;margin-top:10px' });
  const pS = h('div', { style: 'font-size:23px;color:var(--fg-2);line-height:1.3;margin-top:10px' });
  const host = h('div', { style: 'position:relative;flex:1' });
  const big = h('div', { style: 'position:absolute;inset:0;display:grid;place-items:center;text-align:center;opacity:0;pointer-events:none;z-index:2' }, [h('div', {}, [
    h('div', { style: `font:780 120px var(--font);letter-spacing:-.04em;background:linear-gradient(120deg, ${SIDE.P}, ${SIDE.V});-webkit-background-clip:text;background-clip:text;color:transparent`, text: 'P → V' }),
    h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:8px', html: 'propionate → vinyl<br>on rings I & II · − 2 CO₂' }),
  ])]);
  const badge = h('div', { style: `position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:8px 22px;border-radius:999px;font:720 34px var(--font);color:#1d1d1f;background:linear-gradient(120deg, ${SIDE.A}, ${SIDE.M});opacity:0;z-index:2;pointer-events:none`, text: 'A → M' });
  host.append(big, badge);
  panel.append(h('div', { style: 'padding:26px 30px 0' }, [pK, pN, pS]), host);
  el.append(panel);
  const viewer = molViewer(host, { fill: 1.0, autoRotate: 1.3 });

  let cur = -1;
  const apply = (n) => {
    Object.keys(N).forEach((k, i) => { if (k !== 'start') show(N[k].g, n >= i); });
    parts.forEach((p, i) => {
      show(p.els, n >= i + 1, { duration: 0.6 });
      p.flow.set(n >= i + 1);
      p.dot.fill(n === i + 1);
    });
    if (n !== cur) {
      cur = n;
      const d = PSTEPS[n];
      const col = n === 0 || COMP[n - 1] === 'm' ? MITO : CYTO;
      pK.style.color = col;
      pK.textContent = d.k;
      pN.textContent = d.name;
      pS.innerHTML = d.sub;
      gsap.to(big, { opacity: d.big ? 1 : 0, duration: 0.5 });
      gsap.to(badge, { opacity: d.badge ? 1 : 0, duration: 0.5 });
      viewer.show(d.key, d.key === 'hmb' || d.key === 'uroporphyrinogen' ? { tilt: [-0.5, 0, 0] } : {});
    }
  };
  return {
    enter() { viewer.enter(); parts.forEach((p) => p.flow.on && p.flow.play()); },
    leave() { viewer.leave(); parts.forEach((p) => p.flow.pause()); },
    step: apply,
    destroy() { parts.forEach((p) => p.flow.destroy()); D.destroy(); viewer.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 7 · Side-chain logic: A → M, P → V, bridges, Fe²⁺                   */
/* ------------------------------------------------------------------ */
function ringLogicViz(el) {
  const D = diagram(el, 960, 860);
  const C = [480, 430], RR = 140, PR = 50;
  const ANG = [-90, 0, 90, 180];
  const rings = ANG.map((deg) => {
    const a = (deg * Math.PI) / 180;
    const cx = C[0] + Math.cos(a) * RR, cy = C[1] + Math.sin(a) * RR;
    const v = [0, 1, 2, 3, 4].map((k) => { const t = a + Math.PI + (k * 2 * Math.PI) / 5; return [cx + Math.cos(t) * PR, cy + Math.sin(t) * PR]; });
    return { a, cx, cy, v };
  });
  // macrocycle colour wash (porphyrin = coloured)
  const wash = s('circle', { cx: C[0], cy: C[1], r: 250, style: `fill:${PORPH};opacity:0`, filter: `url(#${D.glowId})` });
  D.layers.regions.append(wash);
  const ringStroke = [];
  rings.forEach((r) => {
    const p = s('path', { d: `M${r.v.map((q) => q.join(',')).join(' L')} Z`, style: 'fill:var(--surface-2);stroke:var(--fg-2);stroke-width:4;stroke-linejoin:round;transition:stroke .6s' });
    D.layers.nodes.append(p);
    ringStroke.push(p);
    const nt = s('text', { x: r.v[0][0] + (C[0] - r.v[0][0]) * 0.05, y: r.v[0][1] + 9 + (C[1] - r.v[0][1]) * 0.05, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:700;fill:var(--nadh)' });
    nt.textContent = 'N';
    D.layers.labels.append(nt);
  });
  ['I', 'II', 'III', 'IV'].forEach((k, i) => D.text(rings[i].cx, rings[i].cy + 10, k, { anchor: 'middle', style: 'font-size:28px;font-weight:720;fill:var(--fg-2)' }));
  // bridges
  const bridges = rings.map((r, i) => {
    const nx = rings[(i + 1) % 4];
    const A = r.v[4], B = nx.v[1];
    let mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const dx = mx - C[0], dy = my - C[1], L0 = Math.hypot(dx, dy);
    mx += (dx / L0) * 22; my += (dy / L0) * 22;
    const ln = s('path', { d: `M${A[0]},${A[1]} L${mx},${my} L${B[0]},${B[1]}`, style: 'fill:none;stroke:var(--fg-2);stroke-width:4;stroke-linejoin:round;transition:stroke .6s' });
    D.layers.edges.append(ln);
    const dot = s('circle', { cx: mx, cy: my, r: 9, style: 'fill:var(--fg-3);transition:fill .6s' });
    D.layers.nodes.append(dot);
    const t = s('text', { x: mx + (dx / L0) * 40, y: my + (dy / L0) * 40 + 8, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:650;fill:var(--fg-2)' });
    D.layers.labels.append(t);
    return { ln, dot, t };
  });
  // substituent chips: 8 positions, clockwise (ring I left→right, …)
  const chips = [];
  rings.forEach((r) => {
    [r.v[2], r.v[3]].forEach((q) => {
      const dx = q[0] - r.cx, dy = q[1] - r.cy, L0 = Math.hypot(dx, dy);
      const x = q[0] + (dx / L0) * 62, y = q[1] + (dy / L0) * 62;
      D.layers.edges.append(s('line', { x1: q[0], y1: q[1], x2: x, y2: y, style: 'stroke:var(--fg-2);stroke-width:4' }));
      const g = s('g', { transform: `translate(${x} ${y})` });
      const c = s('circle', { r: 30, style: 'fill:var(--fg-3);stroke:var(--bg);stroke-width:3' });
      const t = s('text', { y: 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:780;fill:#1d1d1f' });
      g.append(c, t);
      D.layers.labels.append(g);
      chips.push({ g, c, t, x, y, dx: dx / L0, dy: dy / L0, letter: null });
    });
  });
  // type III flip highlight on ring IV
  const flip = s('g', { style: 'opacity:0' });
  const r4 = rings[3];
  flip.append(s('ellipse', { cx: r4.cx - 70, cy: r4.cy, rx: 64, ry: 118, style: 'fill:none;stroke:var(--ink);stroke-width:3;stroke-dasharray:8 8' }));
  const ft = s('text', { x: r4.cx - 110, y: r4.cy + 184, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--ink);font-weight:650' });
  ft.textContent = 'ring IV flipped · type III';
  flip.append(ft);
  D.layers.labels.append(flip);
  // Fe
  const feG = s('g', { style: 'opacity:0' });
  rings.forEach((r) => feG.append(s('line', { x1: C[0], y1: C[1], x2: r.v[0][0], y2: r.v[0][1], style: 'stroke:var(--prot);stroke-width:4;stroke-dasharray:6 6' })));
  feG.append(s('circle', { cx: C[0], cy: C[1], r: 34, style: 'fill:var(--prot)', filter: `url(#${D.glowId})` }));
  const fet = s('text', { x: C[0], y: C[1] + 9, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:780;fill:#1d1d1f' });
  fet.textContent = 'Fe²⁺';
  feG.append(fet);
  D.layers.labels.append(feG);
  // headline
  const title = D.text(480, 52, '', { anchor: 'middle', style: 'font-size:40px;font-weight:720;letter-spacing:-.02em' });
  const sub = D.text(480, 94, '', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:560' });
  // legend
  const legend = s('g', { transform: 'translate(480 828)' });
  const LG = [['A', 'acetate'], ['P', 'propionate'], ['M', 'methyl'], ['V', 'vinyl']];
  const LX = [-340, -150, 70, 240];
  LG.forEach(([k, n], i) => {
    const x = LX[i];
    legend.append(s('circle', { cx: x, cy: -8, r: 16, style: `fill:${SIDE[k]}` }));
    const t1 = s('text', { x, y: -1, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:20px;font-weight:780;fill:#1d1d1f' }); t1.textContent = k;
    const t2 = s('text', { x: x + 26, y: 0, class: 'v-label sm', style: 'fill:var(--fg-2)' }); t2.textContent = n;
    legend.append(t1, t2);
  });
  D.layers.labels.append(legend);

  const STATES = [
    { name: 'Uroporphyrinogen III', sub: 'Product of step 4 · ring closed', subs: 'APAPAPPA', br: 'CH₂' },
    { name: 'Coproporphyrinogen III', sub: 'Step 5 · UROgen decarboxylase · − 4 CO₂', subs: 'MPMPMPPM', br: 'CH₂' },
    { name: 'Protoporphyrinogen IX', sub: 'Step 6 · CPgen oxidase · − 2 CO₂', subs: 'MVMVMPPM', br: 'CH₂' },
    { name: 'Protoporphyrin IX', sub: 'Step 7 · PPgen oxidase · bridges oxidised', subs: 'MVMVMPPM', br: '=CH–', color: true },
    { name: 'Heme', sub: 'Step 8 · ferrochelatase + Fe²⁺', subs: 'MVMVMPPM', br: '=CH–', color: true, fe: true },
  ];
  let last = -1;
  function apply(n, dir) {
    const st = STATES[n];
    title.textContent = st.name;
    sub.textContent = st.sub;
    chips.forEach((ch, i) => {
      const L = st.subs[i];
      if (ch.letter !== L) {
        const fwd = last >= 0 && n > last;
        if (ch.letter && fwd) {
          gsap.fromTo(ch.g, { scale: 1.35, transformOrigin: 'center' }, { scale: 1, duration: 0.6, ease: 'back.out(2)' });
          const co2 = s('text', { x: ch.x, y: ch.y, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--co2);font-weight:650' });
          co2.textContent = 'CO₂';
          D.layers.fx.append(co2);
          gsap.fromTo(co2, { attr: { x: ch.x, y: ch.y - 20 }, opacity: 1 }, { attr: { x: ch.x + ch.dx * 90, y: ch.y + ch.dy * 90 - 20 }, opacity: 0, duration: 1.6, ease: 'power1.out', onComplete: () => co2.remove() });
        }
        ch.letter = L;
        ch.t.textContent = L;
        ch.c.style.fill = SIDE[L];
        tip(ch.g, { title: `${L} = ${SIDE_NAME_FULL[L]}`, body: SIDE_BODY[L], src: SRC('4, 7') });
      }
    });
    bridges.forEach((b) => {
      b.t.textContent = st.br;
      b.ln.style.stroke = st.color ? PORPH : 'var(--fg-2)';
      b.dot.style.fill = st.color ? PORPH : 'var(--fg-3)';
    });
    ringStroke.forEach((p) => (p.style.stroke = st.color ? PORPH : 'var(--fg-2)'));
    gsap.to(wash, { opacity: st.color ? 0.13 : 0, duration: 0.8 });
    gsap.to(flip, { opacity: n === 0 ? 1 : 0, duration: 0.5 });
    gsap.to(feG, { opacity: st.fe ? 1 : 0, duration: 0.6 });
    if (st.fe && n !== last) gsap.fromTo(feG, { y: -60 }, { y: 0, duration: 0.8, ease: 'bounce.out' });
    last = n;
    void dir;
  }
  return { step: apply, destroy: () => D.destroy() };
}
const SIDE_NAME_FULL = { A: 'acetate (–CH₂–COO⁻)', P: 'propionate (–CH₂–CH₂–COO⁻)', M: 'methyl (–CH₃)', V: 'vinyl (–CH=CH₂)' };
const SIDE_BODY = {
  A: 'Decarboxylated to methyl by uroporphyrinogen decarboxylase (step 5). Slide 7 says “acetyl”; the group is acetate.',
  P: 'Two of the four (rings I and II) become vinyl at step 6. Slides 4/7 also say “propionyl”; the group is propionate.',
  M: 'Made from acetate at step 5 (A → M).',
  V: 'Made from propionate at step 6 (P → V) by coproporphyrinogen oxidase.',
};

/* ------------------------------------------------------------------ */
/* 8 · Regulation: heme feedback on ALA synthase                       */
/* ------------------------------------------------------------------ */
function regulationViz(el) {
  const D = diagram(el, 960, 860);
  const X = 590;
  const rail = s('path', { d: `M${X},100 L${X},620`, style: 'fill:none;stroke:var(--line-2);stroke-width:5;stroke-linecap:round' });
  D.layers.edges.append(rail);
  const dots = s('path', { d: `M${X},420 L${X},600`, style: 'fill:none;stroke:var(--bg);stroke-width:7;stroke-dasharray:2 14;stroke-linecap:round' });
  D.layers.edges.append(dots);
  D.node({ id: 'sub', x: X, y: 70, label: 'Glycine + succinyl-CoA', size: 26 });
  const alas = D.node({ id: 'alas', x: X, y: 222, label: 'δ-ALA synthase', sub: 'rate-limiting · needs PLP', kind: 'enz', size: 32, color: 'var(--a2)', tip: { kicker: 'First, rate-limiting enzyme', title: 'δ-ALA synthase', body: 'Mitochondrial. Coenzyme: <b>pyridoxal phosphate</b> (vitamin B6).', src: SRC('6–8') } });
  D.node({ id: 'ala', x: X, y: 372, label: 'δ-ALA', size: 28 });
  D.text(X + 34, 520, 'steps 2 – 8', { cls: 'sm', style: 'fill:var(--fg-3);font-weight:600' });
  const glow = s('circle', { cx: X, cy: 660, r: 80, style: 'fill:var(--a1);opacity:.2', filter: `url(#${D.glowId})` });
  D.layers.regions.append(glow);
  D.node({ id: 'heme', x: X, y: 660, label: 'Heme', size: 40, color: HEME, fill: 'color-mix(in oklab, var(--a1) 24%, var(--bg))', w: 200 });
  const flowPath = s('path', { d: `M${X},104 L${X},618`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(flowPath);
  const flow = varFlow(D, flowPath, { count: 7, color: HEME, speed: 150, r: 10 });
  const fbEnd = X - alas.w0 / 2 - 14;
  const fb = D.arrow({ d: `M${X - 104},660 C190,660 190,222 ${fbEnd},222`, from: [X - 104, 660], to: [fbEnd, 222], color: 'var(--inh)', width: 5, dash: '14 12', kind: 'inh', headSize: 18 });
  const fbB = s('g', { transform: 'translate(260 441)' });
  fbB.append(s('circle', { r: 30, style: 'fill:var(--inh)' }));
  fbB.append(s('path', { d: 'M-12,0 H12', style: 'stroke:#fff;stroke-width:6;stroke-linecap:round' }));
  D.layers.labels.append(fbB);
  const fbT = D.text(214, 432, 'feedback', { anchor: 'end', cls: 'sm', style: 'fill:var(--inh);font-weight:650' });
  const fbT2 = D.text(214, 462, 'inhibition', { anchor: 'end', cls: 'sm', style: 'fill:var(--inh);font-weight:650' });
  const fbEls = [fb.g, fbB, fbT, fbT2];
  // rate meter
  D.text(870, 176, 'Synthesis', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
  D.layers.regions.append(s('rect', { x: 846, y: 200, width: 48, height: 420, rx: 24, style: 'fill:var(--surface-2)' }));
  const meter = s('rect', { x: 846, y: 200, width: 48, height: 420, rx: 24, style: 'fill:var(--act)' });
  D.layers.nodes.append(meter);
  const mT = D.text(870, 664, 'fast', { anchor: 'middle', style: 'font-weight:700' });
  let L = 0.15;
  const set = (v) => {
    L = v;
    const rate = 1 - 0.8 * v;
    flow.rate(0.3 + rate);
    flow.density(0.3 + 0.7 * rate);
    fbEls.forEach((e) => gsap.to(e, { opacity: 0.12 + 0.88 * v, duration: 0.4 }));
    fb.path.style.strokeWidth = 3 + 4 * v;
    alas.shape.style.stroke = `color-mix(in oklab, var(--inh) ${Math.round(v * 100)}%, var(--a2))`;
    alas.shape.style.fill = `color-mix(in oklab, color-mix(in oklab, var(--inh) ${Math.round(v * 100)}%, var(--a2)) 16%, var(--bg))`;
    gsap.to(glow, { attr: { r: 64 + 40 * v }, opacity: 0.1 + 0.3 * v, duration: 0.4 });
    const hgt = 420 * (0.12 + 0.88 * rate);
    gsap.to(meter, { attr: { y: 620 - hgt, height: hgt }, duration: 0.4 });
    meter.style.fill = rate > 0.6 ? 'var(--act)' : rate > 0.35 ? 'var(--atp)' : 'var(--inh)';
    mT.textContent = rate > 0.6 ? 'fast' : rate > 0.35 ? 'slower' : 'slow';
  };
  const sl = slider({ label: 'Heme level', min: 0, max: 1, step: 0.01, value: L, fmt: (v) => (v < 0.34 ? 'low' : v < 0.67 ? 'normal' : 'high'), onInput: set, width: 300 });
  ctrlBar(el, [sl], { left: 0, bottom: 0 });
  set(L);
  return {
    enter: () => flow.play(),
    leave: () => flow.pause(),
    step(n) {
      sl.set([0.15, 0.55, 0.95][n]);
      if (n === 1) drawPath(fb, { duration: 1 });
    },
    destroy() { flow.destroy(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* Pathway ladder (lead poisoning)                                     */
/* ------------------------------------------------------------------ */
const LADDER = [['start', 'Glycine + succinyl-CoA'], ['ala', 'δ-ALA'], ['pbg', 'Porphobilinogen'], ['hmb', 'Hydroxymethylbilane'], ['uro', 'Uroporphyrinogen III'], ['copro', 'Coproporphyrinogen III'], ['protogen', 'Protoporphyrinogen IX'], ['proto', 'Protoporphyrin IX'], ['heme', 'Heme']];
function leadViz(el) {
  const D = diagram(el, 960, 860);
  const X = 640, Y = (i) => 44 + i * 96;
  const N = LADDER.map(([id, label], i) => D.node({ id, x: X, y: Y(i), label, size: 22, ...(id === 'heme' ? { color: HEME, fill: 'color-mix(in oklab, var(--a1) 22%, transparent)', size: 26 } : id === 'proto' ? { color: PORPH } : {}) }));
  const segs = [], dots = [], labs = [];
  for (let i = 0; i < 8; i++) {
    const a = D.arrow({ from: LADDER[i][0], to: LADDER[i + 1][0], color: 'var(--line-2)', width: 4, gapStart: 4, gapEnd: 4, headSize: 12 });
    const ym = (Y(i) + Y(i + 1)) / 2;
    const d = stepDot(D, X - 150, ym, i + 1, compCol(i), 17);
    d.g.setAttribute('data-tip', T({ kicker: `Step ${i + 1} · ${COMP[i] === 'm' ? 'mitochondria' : 'cytosol'}`, title: ENZ_SHORT[i], body: ENZ_FULL[i], src: SRC('6, 9') }));
    labs.push(D.text(X - 180, ym + 8, ENZ_SHORT[i], { anchor: 'end', cls: 'sm', style: 'font-weight:600;fill:var(--fg-2)' }));
    dots.push(d);
    segs.push(varFlow(D, a, { count: 1, color: i < 6 ? 'var(--fg-2)' : i === 6 ? PORPH : HEME, speed: 70, r: 8 }));
  }
  const ringALA = pulseRing(D, N[1]);
  const ringPP = pulseRing(D, N[7]);
  const bALA = D.badge(330, Y(1), '↑ ALA', { color: 'var(--inh)', size: 24 });
  const bPP = D.badge(300, Y(7), '↑ Protoporphyrin', { color: 'var(--inh)', size: 24 });
  const bHeme = D.badge(842, Y(8), '↓ Heme · anaemia', { color: 'var(--inh)', size: 22 });
  const pb = [1, 7].map((i) => D.badge(X - 76, (Y(i) + Y(i + 1)) / 2, 'Pb', { color: 'var(--inh)', size: 22, w: 56 }));
  [bALA, bPP, bHeme, ...pb].forEach((b) => (b.style.opacity = 0));
  // legend
  const legend = h('div', { style: 'display:flex;gap:22px;font-size:22px;color:var(--fg-2);align-items:center' }, [
    h('span', { html: `<i style="display:inline-block;width:16px;height:16px;border-radius:50%;border:3px solid ${MITO};vertical-align:-2px;margin-right:8px"></i>mito` }),
    h('span', { html: `<i style="display:inline-block;width:16px;height:16px;border-radius:50%;border:3px solid ${CYTO};vertical-align:-2px;margin-right:8px"></i>cytosol` }),
  ]);
  let lead = false;
  const set = (on) => {
    lead = on;
    [1, 7].forEach((i) => { dots[i].block(on); labs[i].style.fill = on ? 'var(--inh)' : 'var(--fg-2)'; });
    ringALA.set(on); ringPP.set(on);
    show([bALA, bPP, bHeme, ...pb], on);
    gsap.to(N[8].g, { opacity: on ? 0.35 : 1, duration: 0.5 });
    segs.forEach((f, i) => f.set(!on || i === 0 || i === 7 ? true : false));
    segs[7].density(on ? 0 : 1);
  };
  const t = toggle({ label: 'Lead (Pb)', danger: true, onChange: set });
  tip(t.el, { kicker: 'Lead poisoning', title: 'Two enzymes inhibited', body: '<b>ALA dehydratase</b> (step 2, cytosol) and <b>ferrochelatase</b> (step 8, mitochondria).', src: SRC('7, 9, 11') });
  ctrlBar(el, [t, legend], { left: 0, bottom: 0 });
  set(false);
  return {
    enter: () => segs.forEach((f) => f.on && f.play()),
    leave: () => segs.forEach((f) => f.pause()),
    step: (n) => t.set(n >= 1),
    destroy() { segs.forEach((f) => f.destroy()); D.destroy(); void lead; },
  };
}

/* ------------------------------------------------------------------ */
/* 10 · Porphyria = purple: urine darkening in light and air           */
/* ------------------------------------------------------------------ */
function purpleViz(el) {
  const D = diagram(el, 1500, 360);
  const COLS = ['#f3d36b', '#eeb057', '#df8348', '#c4553f', '#a13448', '#7a2048'];
  const sun = sunGlyph(120, 140, 48);
  D.layers.labels.append(sun);
  D.text(120, 262, 'light & air', { anchor: 'middle', style: 'font-weight:650;fill:var(--fg-2)' });
  const arr = D.arrow({ from: [200, 140], to: [300, 140], color: 'var(--fg-3)', width: 4 });
  const liq = [];
  COLS.forEach((c, i) => {
    const x = 380 + i * 182;
    const g = s('g', { transform: `translate(${x} 30)` });
    const id = `tube${i}${Math.random().toString(36).slice(2, 6)}`;
    const d = 'M0,0 H78 V200 A39,39 0 0 1 0,200 Z';
    D.defs.append(s('clipPath', { id }, [s('path', { d })]));
    g.append(s('path', { d, style: 'fill:var(--surface)' }));
    const r = s('rect', { x: -4, y: 70, width: 90, height: 200, 'clip-path': `url(#${id})`, style: `fill:${COLS[0]}` });
    g.append(r);
    g.append(s('rect', { x: 12, y: 84, width: 10, height: 130, rx: 5, style: 'fill:#fff;opacity:.3' }));
    g.append(s('path', { d, style: 'fill:none;stroke:var(--fg-3);stroke-width:3.5' }));
    g.append(s('rect', { x: -8, y: -6, width: 94, height: 12, rx: 6, style: 'fill:var(--fg-3)' }));
    D.layers.nodes.append(g);
    liq.push(r);
  });
  D.text(419, 330, 'fresh', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  D.text(1329, 330, 'red-purple · port-wine', { anchor: 'middle', cls: 'sm', style: 'fill:#c0436d;font-weight:650' });
  return {
    step(n) { liq.forEach((r, i) => gsap.to(r, { fill: n >= 1 ? COLS[i] : COLS[0], duration: 1.2, delay: n >= 1 ? i * 0.25 : 0 })); gsap.to(sun, { opacity: n >= 1 ? 1 : 0.4, duration: 0.5 }); void arr; },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 11 · Porphyria explorer                                             */
/* ------------------------------------------------------------------ */
const PORPHYRIAS = {
  aip: {
    abbr: 'AIP', name: 'Acute intermittent porphyria', type: 'Acute · neurovisceral', typeCls: 'fadh', block: 3,
    acc: { ala: '↑ ALA', pbg: '↑ PBG' }, enz: 'Hydroxymethylbilane synthase', enzAlt: '= PBG deaminase', accTxt: '↑ ALA · ↑ PBG',
    feats: [['stomach', 'Acute abdominal'], ['bolt', 'Neurological'], ['nosun', 'No photosensitivity']], zone: 'lin',
  },
  pct: {
    abbr: 'PCT', name: 'Porphyria cutanea tarda', note: 'most common', type: 'Cutaneous', typeCls: 'acc', block: 5,
    acc: { uro: '↑ Uroporphyrins' }, enz: 'Uroporphyrinogen decarboxylase', accTxt: '↑ Uroporphyrins<br><span style="color:var(--fg-3);font-size:22px">urine darkens on standing</span>',
    feats: [['sun', 'Photosensitivity'], ['drop', 'Blistering skin lesions']], zone: 'cyc',
  },
  vp: {
    abbr: 'VP', name: 'Variegate porphyria', type: 'Mixed · acute + cutaneous', typeCls: 'inh', block: 7,
    acc: { copro: '↑', protogen: '↑' }, enz: 'Protoporphyrinogen oxidase', accTxt: '↑ Porphyrin intermediates',
    feats: [['stomach', 'Abdominal'], ['bolt', 'Neurological'], ['sun', 'Photosensitivity']], zone: 'cyc',
  },
};
function explorerViz(el) {
  const D = diagram(el, 1712, 720);
  const TOP = 150, BOT = 412;
  const pos = { start: [130, TOP], ala: [462, TOP], pbg: [794, TOP], hmb: [1150, TOP], uro: [1541, BOT], copro: [1155, BOT], protogen: [757, BOT], proto: [384, BOT], heme: [90, BOT] };
  const labels = { start: 'Glycine +\nsuccinyl-CoA', ala: 'δ-ALA', pbg: 'Porphobilinogen', hmb: 'Hydroxymethyl-\nbilane', uro: 'Uroporphyrinogen\nIII', copro: 'Coproporphyrinogen\nIII', protogen: 'Protoporphyrinogen\nIX', proto: 'Protoporphyrin\nIX', heme: 'Heme' };
  const N = {};
  LADDER.forEach(([id]) => { N[id] = D.node({ id, x: pos[id][0], y: pos[id][1], label: labels[id], size: id === 'ala' || id === 'heme' ? 26 : 22, ...(id === 'heme' ? { color: HEME, fill: 'color-mix(in oklab, var(--a1) 22%, transparent)' } : id === 'proto' ? { color: PORPH } : {}) }); });
  // divider: the ring boundary
  D.layers.regions.append(s('line', { x1: 0, y1: 284, x2: 1300, y2: 284, style: 'stroke:var(--line-2);stroke-width:2;stroke-dasharray:10 10' }));
  const linG = s('g');
  linG.append(sunGlyph(30, 250, 15, true));
  const lt = s('text', { x: 62, y: 258, class: 'v-label sm', style: 'font-weight:650' });
  lt.innerHTML = '<tspan>Before the ring · linear precursors</tspan><tspan style="fill:var(--fg-2)"> → no photosensitivity</tspan>';
  linG.append(lt);
  const cycG = s('g');
  cycG.append(sunGlyph(30, 320, 15, false));
  const ct = s('text', { x: 62, y: 328, class: 'v-label sm', style: 'font-weight:650' });
  ct.innerHTML = '<tspan>After the ring · cyclic porphyrins</tspan><tspan style="fill:var(--fg-2)"> → photosensitivity</tspan>';
  cycG.append(ct);
  D.layers.labels.append(linG, cycG);
  // arrows + step markers
  const order = LADDER.map((l) => l[0]);
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = order[i], b = order[i + 1];
    const opts = { from: a, to: b, color: 'var(--line-2)', width: 4, headSize: 13 };
    if (i === 3) Object.assign(opts, { d: `M${pos.hmb[0] + 118},${TOP} C1420,${TOP} 1541,200 1541,${BOT - 54}`, from: [pos.hmb[0] + 118, TOP], to: [1541, BOT - 54] });
    const ar = D.arrow(opts);
    const L = ar.path.getTotalLength();
    const m = ar.path.getPointAtLength(L * (i === 3 ? 0.42 : 0.5));
    const dot = stepDot(D, m.x, m.y, i + 1, compCol(i), 18);
    dot.g.setAttribute('data-tip', T({ kicker: `Step ${i + 1}`, title: ENZ_SHORT[i], body: ENZ_FULL[i], src: SRC('6, 9') }));
    const top = i < 3;
    const lab = D.text(i === 3 ? m.x + 30 : m.x, i === 3 ? m.y + 8 : top ? 92 : 494, ENZ_SHORT[i], { anchor: i === 3 ? 'start' : 'middle', cls: 'sm', style: 'font-weight:600;fill:var(--fg-2)' });
    const tag = D.badge(m.x, i === 3 ? m.y - 44 : top ? m.y + 44 : m.y - 44, '', { color: 'var(--inh)', size: 22, w: 76 });
    tag.style.opacity = 0;
    parts.push({ ar, dot, lab, tag, flow: varFlow(D, ar, { count: 2, color: i >= 6 ? (i === 6 ? PORPH : HEME) : 'var(--fg-2)', speed: 100, r: 8 }) });
  }
  const rings = {}, accB = {};
  Object.keys(N).forEach((k) => {
    rings[k] = pulseRing(D, N[k]);
    const isTop = pos[k][1] === TOP;
    accB[k] = D.badge(pos[k][0], isTop ? pos[k][1] + N[k].h0 / 2 + 30 : pos[k][1] - N[k].h0 / 2 - 28, '↑', { color: 'var(--inh)', size: 24, w: 210 });
    accB[k].style.opacity = 0;
  });
  // info panel
  const panel = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:178px;border-radius:32px;background:var(--surface);border:1px solid var(--line);display:grid;grid-template-columns:470px 0.9fr 0.9fr 1.6fr;gap:32px;padding:24px 34px;align-items:start' });
  const col = () => h('div', { style: 'min-width:0' });
  const c1 = col(), c2 = col(), c3 = col(), c4 = col();
  panel.append(c1, c2, c3, c4);
  el.append(panel);
  const K = (t) => `<div style="font-size:22px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--ink);margin-bottom:10px">${t}</div>`;
  const chip = (i, t, cls = '') => `<span class="chip ${cls}" style="font-size:23px;margin:0 8px 10px 0;padding:5px 14px">${ico(i)} ${t}</span>`;
  const sg = seg({ options: [{ v: 'none', t: 'Normal' }, { v: 'aip', t: 'AIP' }, { v: 'pct', t: 'PCT' }, { v: 'vp', t: 'VP' }], value: 'none', onChange: (v) => apply(v) });
  ctrlBar(el, [sg], { right: 0, top: 0 });
  function apply(v) {
    const P = PORPHYRIAS[v];
    const blk = P ? P.block : 0;
    parts.forEach((p, i) => {
      const n = i + 1;
      p.dot.block(n === blk);
      p.tag.querySelector('text').textContent = P && n === blk ? P.abbr : '';
      gsap.to(p.tag, { opacity: P && n === blk ? 1 : 0, duration: 0.4 });
      p.lab.style.fill = P && n === blk ? 'var(--inh)' : 'var(--fg-2)';
      const down = P && n > blk;
      gsap.to(p.ar.g, { opacity: down ? 0.25 : 1, duration: 0.5 });
      p.flow.set(!P || n < blk);
    });
    order.forEach((k, i) => {
      const accLabel = P?.acc[k];
      rings[k].set(!!accLabel);
      const t = accB[k].querySelector('text');
      t.textContent = accLabel || '';
      const w = Math.max(60, (accLabel || '').length * 14 + 34);
      const r = accB[k].querySelector('rect');
      r.setAttribute('width', w); r.setAttribute('x', -w / 2);
      gsap.to(accB[k], { opacity: accLabel ? 1 : 0, duration: 0.4 });
      gsap.to(N[k].g, { opacity: P && i > blk ? 0.32 : 1, duration: 0.5 });
    });
    gsap.to(linG, { opacity: !P || P.zone === 'lin' ? 1 : 0.3, duration: 0.5 });
    gsap.to(cycG, { opacity: !P || P.zone === 'cyc' ? 1 : 0.3, duration: 0.5 });
    if (!P) {
      c1.innerHTML = `${K('Rule of thumb')}<div style="font-size:34px;font-weight:720;letter-spacing:-.02em;line-height:1.1">Where is the block?</div><div style="font-size:24px;color:var(--fg-2);margin-top:8px">Pick AIP · PCT · VP</div>`;
      c2.innerHTML = `${K('Before the ring')}<div style="font-size:27px;line-height:1.3">ALA / PBG ↑<br><span style="color:var(--fg-2)">no photosensitivity</span></div>`;
      c3.innerHTML = `${K('After the ring')}<div style="font-size:27px;line-height:1.3">Cyclic porphyrins ↑<br><span style="color:var(--fg-2)">photosensitivity</span></div>`;
      c4.innerHTML = `${K('Definition')}<div style="font-size:25px;line-height:1.32;color:var(--fg-2)">Enzyme defect in heme synthesis → that enzyme’s substrates accumulate.</div>`;
    } else {
      c1.innerHTML = `${K(`${P.abbr}${P.note ? ` · ${P.note}` : ''}`)}<div style="font-size:34px;font-weight:720;letter-spacing:-.02em;line-height:1.1">${P.name}</div><div style="margin-top:12px"><span class="chip ${P.typeCls}" style="font-size:24px;padding:6px 16px">${P.type}</span></div>`;
      c2.innerHTML = `${K('Enzyme deficient')}<div style="font-size:27px;line-height:1.28;font-weight:600">${P.enz}</div>${P.enzAlt ? `<div style="font-size:22px;color:var(--fg-3);margin-top:4px">${P.enzAlt}</div>` : ''}`;
      c3.innerHTML = `${K('Accumulates')}<div style="font-size:27px;line-height:1.3;font-weight:600;color:var(--inh)">${P.accTxt}</div>`;
      c4.innerHTML = `${K('Features')}<div>${P.feats.map(([i, t]) => chip(i, t, i === 'nosun' ? '' : i === 'sun' ? 'atp' : 'fadh')).join('')}</div>`;
    }
  }
  apply('none');
  tip(panel, { kicker: 'Textbook context (Lippincott) — not on the slides', title: 'Beyond the lecture', list: ['AIP and VP are autosomal dominant; PCT is mostly acquired', 'VP: ALA/PBG also rise during acute attacks (explains its neurovisceral features)', 'Lead is a separate case: ↑ protoporphyrin but no photosensitivity (slide 11)'], src: SRC('9–12') });
  return {
    enter: () => parts.forEach((p) => p.flow.on && p.flow.play()),
    leave: () => parts.forEach((p) => p.flow.pause()),
    step: (n) => sg.set(['none', 'aip', 'pct', 'vp'][n]),
    destroy() { parts.forEach((p) => p.flow.destroy()); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 12 · Photosensitivity: light + porphyrins → ROS → blister           */
/* ------------------------------------------------------------------ */
function photoViz(el) {
  const D = diagram(el, 960, 860);
  const EPI = '#e3b08c', DERM = '#efc3b2', INK = '#5b3326';
  const bump = (x) => 78 * Math.exp(-(((x - 560) / 108) ** 2));
  const xs = Array.from({ length: 49 }, (_, i) => i * 20);
  const yTop = (x, b) => 300 + 5 * Math.sin(x / 70) - b * bump(x);
  const yDJ = (x) => 428 + 9 * Math.sin(x / 45 + 1);
  const yEb = (x, b) => yDJ(x) - b * bump(x) * 1.02;
  const line = (f) => xs.map((x) => `${x},${f(x).toFixed(1)}`).join(' L');
  const dermis = s('path', { d: `M0,${yDJ(0)} L${line(yDJ)} L960,860 L0,860 Z`, style: `fill:${DERM}` });
  const fluid = s('path', { style: 'fill:rgba(255,247,222,.95);stroke:rgba(255,255,255,.9);stroke-width:2' });
  const epi = s('path', { style: `fill:${EPI}` });
  const corn = s('path', { style: 'fill:none;stroke:#c48a66;stroke-width:6;stroke-linecap:round' });
  D.layers.regions.append(dermis, fluid, epi, corn);
  const vessel = s('rect', { x: 0, y: 716, width: 960, height: 60, style: 'fill:#b8393f' });
  D.layers.regions.append(vessel);
  for (let i = 0; i < 9; i++) D.layers.regions.append(s('ellipse', { cx: 50 + i * 110, cy: 746, rx: 26, ry: 14, style: 'fill:#d9545a' }));
  [470, 540, 610].forEach((y, i) => D.layers.regions.append(s('path', { d: `M0,${y} C200,${y - 20} 300,${y + 24} 520,${y} S820,${y - 18} 960,${y + 8}`, style: `fill:none;stroke:#e4a998;stroke-width:${5 - i}` })));
  let B = 0;
  const draw = () => {
    epi.setAttribute('d', `M0,${yTop(0, B)} L${line((x) => yTop(x, B))} L960,${yEb(960, B)} L${xs.slice().reverse().map((x) => `${x},${yEb(x, B).toFixed(1)}`).join(' L')} Z`);
    corn.setAttribute('d', `M0,${yTop(0, B)} L${line((x) => yTop(x, B))}`);
    fluid.setAttribute('d', `M0,${yDJ(0)} L${line(yDJ)} L${xs.slice().reverse().map((x) => `${x},${yEb(x, B).toFixed(1)}`).join(' L')} Z`);
  };
  draw();
  D.text(24, 372, 'Epidermis', { style: `fill:${INK};font-weight:650` });
  D.text(24, 520, 'Dermis', { style: `fill:${INK};font-weight:650` });
  D.text(24, 702, 'Capillary', { cls: 'sm', style: `fill:${INK};font-weight:600` });
  // sun & rays
  const sun = sunGlyph(130, 120, 56);
  D.layers.labels.append(sun);
  D.text(130, 236, 'Sunlight', { anchor: 'middle', style: 'font-weight:650' });
  const P = [[300, 492], [430, 560], [560, 478], [690, 548], [820, 486], [360, 640], [620, 640]];
  const rays = s('g', { style: 'opacity:0' });
  P.slice(0, 5).forEach(([x, y]) => rays.append(s('line', { x1: 168, y1: 150, x2: x, y2: y, style: 'stroke:var(--atp);stroke-width:5;stroke-linecap:round;stroke-dasharray:18 16;opacity:.75' })));
  D.layers.fx.append(rays);
  gsap.to(rays.querySelectorAll('line'), { strokeDashoffset: -68, duration: 1.1, repeat: -1, ease: 'none' });
  // porphyrin glyphs
  const glyphs = P.map(([x, y]) => {
    const g = s('g', { transform: `translate(${x} ${y})` });
    const halo = s('circle', { r: 26, style: `fill:${PORPH};opacity:0`, filter: `url(#${D.glowId})` });
    g.append(halo, s('circle', { r: 15, style: `fill:none;stroke:${PORPH};stroke-width:4.5` }));
    [0, 1, 2, 3].forEach((k) => g.append(s('circle', { cx: Math.cos((k * Math.PI) / 2 + 0.78) * 15, cy: Math.sin((k * Math.PI) / 2 + 0.78) * 15, r: 4.5, style: `fill:${PORPH}` })));
    D.layers.nodes.append(g);
    return { g, halo, x, y };
  });
  const pl = D.text(820, 552, 'porphyrins', { anchor: 'middle', cls: 'sm', style: `fill:${INK};font-weight:650` });
  // ROS sparks
  const sparks = s('g', { style: 'opacity:0' });
  const sparkTw = [];
  glyphs.forEach((gl, i) => {
    for (let k = 0; k < 3; k++) {
      const c = s('circle', { cx: gl.x, cy: gl.y, r: 6, style: 'fill:#ff5a36', filter: `url(#${D.glowId})` });
      sparks.append(c);
      const a = Math.random() * Math.PI * 2;
      sparkTw.push(gsap.fromTo(c, { attr: { cx: gl.x, cy: gl.y }, opacity: 1 }, { attr: { cx: gl.x + Math.cos(a) * 70, cy: gl.y + Math.sin(a) * 60 - 25 }, opacity: 0, duration: 1.3, delay: (i * 0.17 + k * 0.43) % 1.3, repeat: -1, ease: 'power1.out', paused: true }));
    }
  });
  D.layers.fx.append(sparks);
  const ros = [D.badge(400, 440, 'ROS', { color: 'var(--inh)', size: 26 }), D.badge(760, 600, 'ROS', { color: 'var(--inh)', size: 26 })];
  ros.forEach((r) => (r.style.opacity = 0));
  const blL = D.text(560, 186, 'Blister · fragile skin', { anchor: 'middle', style: 'font-weight:700;fill:var(--inh);opacity:0' });
  let haloTw = null;
  return {
    step(n) {
      gsap.to(rays, { opacity: n >= 1 ? 1 : 0, duration: 0.6 });
      gsap.to(sun, { opacity: n >= 1 ? 1 : 0.45, duration: 0.6 });
      haloTw?.kill();
      if (n >= 1) haloTw = gsap.fromTo(glyphs.map((g) => g.halo), { opacity: 0.25 }, { opacity: 0.85, duration: 0.7, repeat: -1, yoyo: true, stagger: 0.1 });
      else gsap.to(glyphs.map((g) => g.halo), { opacity: 0, duration: 0.4 });
      gsap.to(sparks, { opacity: n >= 2 ? 1 : 0, duration: 0.5 });
      sparkTw.forEach((t) => (n >= 2 ? t.play() : t.pause()));
      show(ros, n >= 2);
      const o = { b: B };
      gsap.to(o, { b: n >= 3 ? 1 : 0, duration: 1.6, ease: 'power2.inOut', onUpdate: () => { B = o.b; draw(); } });
      gsap.to(blL, { opacity: n >= 3 ? 1 : 0, duration: 0.6, delay: n >= 3 ? 0.8 : 0 });
      void pl;
    },
    leave: () => sparkTw.forEach((t) => t.pause()),
    destroy: () => { sparkTw.forEach((t) => t.kill()); haloTw?.kill(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 13 · Case resolved: one defect, two signs                           */
/* ------------------------------------------------------------------ */
function caseRevealViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '900px 1fr';
  el.style.gap = '40px';
  const left = h('div', { style: 'position:relative' });
  el.append(left);
  const D = diagram(left, 900, 720);
  const g1 = [], g2 = [], g3 = [], g4 = [];
  const enz = D.node({ id: 'enz', x: 175, y: 70, label: 'UROgen decarboxylase  ✕', kind: 'enz', size: 24, color: 'var(--inh)', tip: { title: 'Uroporphyrinogen decarboxylase deficiency', body: 'Step 5 (cytosol): acetate → methyl fails, so uroporphyrin(ogen)s accumulate.', src: SRC(12) } });
  const core = D.node({ id: 'core', x: 175, y: 400, label: '↑ Uroporphyrins', sub: 'cyclic porphyrins', size: 30, color: PORPH, fill: `color-mix(in oklab, ${PORPH} 18%, transparent)` });
  const a0 = D.arrow({ from: 'enz', to: 'core', color: 'var(--inh)', width: 4 });
  const dx = s('g');
  const d1 = s('text', { x: 620, y: 86, 'text-anchor': 'middle', class: 'v-label xl', style: `fill:${PORPH}` }); d1.textContent = 'PCT';
  const d2 = s('text', { x: 620, y: 124, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:600' }); d2.textContent = 'porphyria cutanea tarda · most common';
  dx.append(d1, d2);
  D.layers.labels.append(dx);
  g1.push(enz.g, core.g, a0.g, dx);
  const row = (y, items, col) => items.map(([id, x, label]) => D.node({ id, x, y, label, size: 22, color: col, w: 160 }));
  const sk = row(290, [['s1', 430, 'Sunlight'], ['s2', 625, 'ROS'], ['s3', 815, 'Blisters']], 'var(--atp)');
  const ur = row(510, [['u1', 430, 'Standing'], ['u2', 625, 'Oxidised'], ['u3', 815, 'Red-brown']], '#c0632f');
  const arrows = (ids, col) => ids.slice(0, -1).map((id, i) => D.arrow({ from: id, to: ids[i + 1], color: col, width: 4, gapStart: 6, gapEnd: 6, headSize: 13 }).g);
  const capS = D.text(625, 352, 'skin · backs of hands', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const capU = D.text(625, 572, 'urine · coloured porphyrins', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  g2.push(...sk.map((n) => n.g), D.arrow({ from: 'core', to: 's1', color: 'var(--atp)', width: 4 }).g, ...arrows(['s1', 's2', 's3'], 'var(--atp)'), capS);
  g3.push(...ur.map((n) => n.g), D.arrow({ from: 'core', to: 'u1', color: '#c0632f', width: 4 }).g, ...arrows(['u1', 'u2', 'u3'], '#c0632f'), capU);
  const sunI = sunGlyph(430, 222, 18); D.layers.labels.append(sunI); g2.push(sunI);
  const note = s('g');
  note.append(s('rect', { x: 20, y: 630, width: 860, height: 76, rx: 38, style: 'fill:var(--surface);stroke:var(--line)' }));
  const nt = s('text', { x: 450, y: 678, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:26px;font-weight:600' });
  nt.innerHTML = '<tspan>Block after the ring → ALA, PBG not ↑</tspan><tspan style="fill:var(--fg-2)"> → no acute attacks</tspan>';
  note.append(nt);
  D.layers.labels.append(note);
  g4.push(note);
  const groups = [g1, g2, g3, g4];
  groups.flat().forEach((e) => (e.style.opacity = 0));
  const qa = qaList([
    ['Which disorder?', '<b>Porphyria cutanea tarda</b> — uroporphyrinogen decarboxylase deficiency → ↑ uroporphyrins.'],
    ['Why blisters on the backs of the hands?', 'Sun-exposed skin (new morning walks): light + porphyrins → <b>reactive oxygen species</b> → skin damage.'],
    ['Why does urine darken on standing?', 'Porphyrinogens in urine are <b>oxidised to coloured porphyrins</b> on standing or in light.'],
    ['Why no abdominal or neuro signs?', 'The block is <b>after ring formation</b>, so ALA and PBG do not accumulate.'],
  ], { qSize: 28, aSize: 25, gap: 16 });
  el.append(qa.el);
  return {
    step(n) { groups.forEach((g, i) => show(g, n >= i + 1)); qa.step(n); },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 14 · Learning check: synthesis (slide 14)                           */
/* ------------------------------------------------------------------ */
function checkSynthViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '700px 1fr';
  el.style.gap = '44px';
  const qa = qaList([
    ['Rate-limiting enzyme and its coenzyme?', '<b>δ-ALA synthase</b> · pyridoxal phosphate (vitamin B6).'],
    ['How does heme regulate its own synthesis?', 'Feedback on δ-ALA synthase: as heme rises, synthesis falls.'],
    ['Which two enzymes does lead inhibit?', '<b>ALA dehydratase</b> and <b>ferrochelatase</b>.'],
  ], { qSize: 29, aSize: 26 });
  el.append(qa.el);
  const ROWS = [
    ['Lead poisoning', 'ALA dehydratase + ferrochelatase', 'Abdominal · neuro · anaemia · no photosensitivity'],
    ['AIP', 'Hydroxymethylbilane synthase', 'Acute abdominal · neuro · no photosensitivity'],
    ['PCT', 'Uroporphyrinogen decarboxylase', 'Photosensitivity · blistering skin'],
    ['VP', 'Protoporphyrinogen oxidase', 'Abdominal · neuro · photosensitivity'],
  ];
  const tbl = h('div', { style: 'display:grid;grid-template-columns:230px 1fr 1fr;border-radius:28px;overflow:hidden;border:1px solid var(--line);align-self:center' });
  ['Disorder', 'Enzyme', 'Clinical features'].forEach((t) => tbl.append(h('div', { style: 'padding:18px 22px;font-size:22px;letter-spacing:.12em;text-transform:uppercase;font-weight:650;color:var(--ink);background:var(--surface-2)', text: t })));
  const cells = ROWS.map((r, i) => r.map((t, j) => {
    const c = h('div', { style: `padding:20px 22px;font-size:${j === 0 ? 27 : 25}px;line-height:1.3;${j === 0 ? 'font-weight:700' : 'color:var(--fg-2)'};border-top:1px solid var(--line);background:${i % 2 ? 'var(--surface)' : 'transparent'}` });
    const inner = h('span', { html: t, style: j ? 'opacity:0' : '' });
    c.append(inner);
    tbl.append(c);
    return inner;
  }));
  el.append(tbl);
  return {
    step(n) {
      qa.step(Math.min(n, 3));
      cells.forEach((r, i) => r.slice(1).forEach((c) => gsap.to(c, { opacity: n >= 4 + i ? 1 : 0, duration: 0.5 })));
    },
  };
}

/* ------------------------------------------------------------------ */
/* 15 · Bruise colours                                                 */
/* ------------------------------------------------------------------ */
function bruiseViz(el) {
  const D = diagram(el, 1500, 360);
  const blobD = (cx, cy, rx, ry, seed) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const k = 1 + 0.12 * Math.sin(i * 2.3 + seed) + 0.07 * Math.cos(i * 3.7 + seed * 2);
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    });
    let d = '';
    pts.forEach((p, i) => { const n = pts[(i + 1) % pts.length]; const m = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2]; d += i === 0 ? `M${m[0]},${m[1]}` : ''; d += ` Q${n[0]},${n[1]} ${(n[0] + pts[(i + 2) % pts.length][0]) / 2},${(n[1] + pts[(i + 2) % pts.length][1]) / 2}`; });
    return `${d} Z`;
  };
  const blur = `bl${Math.random().toString(36).slice(2, 6)}`;
  D.defs.append(s('filter', { id: blur, x: '-30%', y: '-30%', width: '160%', height: '160%' }, [s('feGaussianBlur', { stdDeviation: 9 })]));
  const SW = [
    { x: 190, cols: ['#d8333f', '#5b3a8e'], name: 'Red → blue-purple', mol: 'Hemoglobin (O₂ lost)' },
    { x: 560, cols: ['#5f9e3a'], name: 'Green', mol: 'Biliverdin' },
    { x: 930, cols: ['#e8c02a'], name: 'Yellow', mol: 'Bilirubin' },
    { x: 1300, cols: ['#8a5a32'], name: 'Brown', mol: 'Hemosiderin (in macrophages)' },
  ];
  const groups = SW.map((w, i) => {
    const g = s('g');
    g.append(s('rect', { x: w.x - 160, y: 20, width: 320, height: 230, rx: 40, style: 'fill:#e9bf9e' }));
    const b = s('path', { d: blobD(w.x, 135, 112, 78, i * 1.7 + 0.4), style: `fill:${w.cols[0]};opacity:.92`, filter: `url(#${blur})` });
    g.append(b);
    const t1 = s('text', { x: w.x, y: 296, 'text-anchor': 'middle', class: 'v-label', style: `font-size:30px;font-weight:720;fill:${i === 0 ? 'var(--a1)' : w.cols[0]}` });
    t1.textContent = w.name;
    const t2 = s('text', { x: w.x, y: 334, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2)' });
    t2.textContent = w.mol;
    g.append(t1, t2);
    D.layers.nodes.append(g);
    if (w.cols[1]) gsap.to(b, { fill: w.cols[1], duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    return g;
  });
  const arrows = [0, 1, 2].map((i) => D.arrow({ from: [SW[i].x + 168, 135], to: [SW[i + 1].x - 168, 135], color: 'var(--fg-3)', width: 4, headSize: 14 }).g);
  return {
    step(n) {
      groups.forEach((g, i) => gsap.to(g, { opacity: i <= n ? 1 : 0.08, duration: 0.6 }));
      arrows.forEach((a, i) => gsap.to(a, { opacity: i < n ? 1 : 0.08, duration: 0.6 }));
    },
    destroy: () => { gsap.killTweensOf(el.querySelectorAll('path')); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 16 · Hemoglobin recycling in 3D                                     */
/* ------------------------------------------------------------------ */
async function recycleViz(el) {
  const kit = createScene(el, { cam: [0, 14, 90], autoRotate: 0.4, fov: 28 });
  const pdb = await loadPDB('4HHB');
  const prot = buildProtein(pdb, { colorBy: 'chain', chainColors: GLOBIN });
  const center = prot.userData.center;
  const chains = prot.userData.chainMeshes.map((m, i) => {
    m.material = m.material.clone();
    m.material.transparent = true;
    const c = pdb.chains[i].res.reduce((acc, r) => acc.add(new THREE.Vector3(r[2], r[3], r[4])), new THREE.Vector3()).multiplyScalar(1 / pdb.chains[i].res.length).sub(center);
    return { m, dir: c.clone().normalize(), c };
  });
  const mats = {};
  const hemes = pdb.het.map((het) => {
    const M = hemeModel(het, { offset: center, scale: 1.45, mats });
    prot.add(M.group);
    const gl = glowSprite(0xff9a4a, 7);
    gl.position.copy(M.fe.p);
    gl.material.opacity = 0;
    prot.add(gl);
    return { M, gl, fe0: M.fe.mesh.position.clone() };
  });
  mats['fe:Fe'].transparent = true;
  mats.febond.transparent = true;
  paint(mats, CARBON_KEYS, 0xd7d7de, 0.1, 0);
  kit.root.add(prot);
  prot.rotation.set(0.2, 0.2, 0);
  kit.fit(prot, 1.3);
  const base = kit.camera.position.distanceTo(kit.controls.target);
  const zoom = { f: 1 };
  kit.onFrame(() => { const v = kit.camera.position.clone().sub(kit.controls.target); v.setLength(base * zoom.f); kit.camera.position.copy(kit.controls.target).add(v); });
  const lab = (html, v) => { const o = kit.label(html, [v.x, v.y, v.z], { cls: 'acc', parent: prot }); o.element.style.opacity = 0; return o; };
  const lGlobin = lab('Globin → amino acids', chains[1].c.clone().multiplyScalar(1.15));
  const fePos = hemes[0].fe0.clone().add(hemes[0].fe0.clone().normalize().multiplyScalar(10)).add(new THREE.Vector3(0, 6, 0));
  const lFe = lab('Fe²⁺ → recycled', fePos.clone().add(new THREE.Vector3(0, 5, 0)));
  const lBil = lab('Porphyrin → bilirubin', hemes[2].fe0.clone().multiplyScalar(1.15).add(new THREE.Vector3(0, -6, 0)));
  const vis = (o, on) => gsap.to(o.element, { opacity: on ? 1 : 0, duration: 0.5 });
  return kitController(kit, {
    step(n) {
      chains.forEach(({ m, dir }) => {
        m.visible = true;
        gsap.to(m.material, { opacity: n >= 2 ? 0 : n >= 1 ? 0.1 : 1, duration: 1.2, onComplete: () => { m.visible = m.material.opacity > 0.01; } });
        gsap.to(m.position, { x: n >= 1 ? dir.x * 14 : 0, y: n >= 1 ? dir.y * 14 : 0, z: n >= 1 ? dir.z * 14 : 0, duration: 1.4, ease: 'power2.inOut' });
      });
      hemes.forEach(({ M, gl, fe0 }) => {
        const out = fe0.clone().add(fe0.clone().normalize().multiplyScalar(10)).add(new THREE.Vector3(0, 6, 0));
        const to = n >= 2 ? out : fe0;
        gsap.to(M.fe.mesh.position, { x: to.x, y: to.y, z: to.z, duration: 1.4, ease: 'power2.inOut' });
        gsap.to(gl.position, { x: to.x, y: to.y, z: to.z, duration: 1.4, ease: 'power2.inOut' });
        gsap.to(gl.material, { opacity: n >= 2 ? 1 : 0, duration: 0.8 });
      });
      gsap.to(mats.febond, { opacity: n >= 2 ? 0 : 1, duration: 0.6 });
      paint(mats, ['fe:Fe'], n >= 2 ? 0xffa255 : null, n >= 2 ? 1 : 0, 0.8);
      gsap.killTweensOf(CARBON_KEYS.map((k) => mats[k].color));
      if (n >= 3) {
        paint(mats, CARBON_KEYS, 0x30d158, 0.35, 0.8);
        setTimeout(() => { if (cur === 3) paint(mats, CARBON_KEYS, 0xffa21f, 0.4, 0.9); }, 1300);
      } else paint(mats, CARBON_KEYS, 0xd7d7de, 0.1, 0.6);
      cur = n;
      gsap.to(zoom, { f: n >= 2 ? 0.74 : 1, duration: 1.6, ease: 'power2.inOut' });
      vis(lGlobin, n === 1);
      vis(lFe, n >= 2);
      vis(lBil, n >= 3);
    },
  });
}
let cur = 0;

/* ------------------------------------------------------------------ */
/* 17 · Heme oxygenase & biliverdin reductase (real 3D)                */
/* ------------------------------------------------------------------ */
async function hoViz(el) {
  const top = h('div', { style: 'position:absolute;left:0;right:0;top:0;height:600px' });
  const bot = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:250px' });
  el.append(top, bot);
  const kit = createScene(top, { cam: [0, 0, 30], autoRotate: 0.9 });
  const pdb = await loadPDB('4HHB');
  const heme = hemeModel(pdb.het[1], { orient: true }).group;
  const bv = buildMolecule(await loadMol('biliverdin'), { hideH: 'nonpolar', color: (a) => (a[0] === 'C' ? 0x2fbf55 : undefined) });
  const br = buildMolecule(await loadMol('bilirubin'), { hideH: 'nonpolar', color: (a) => (a[0] === 'C' ? 0xffa21f : undefined) });
  const models = [heme, bv, br];
  const radius = Math.max(...models.map((m) => new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere()).radius));
  models.forEach((m, i) => { m.scale.setScalar(i ? 0.001 : 1); kit.root.add(m); });
  const dist = frameDist(kit, radius, 0.86);
  kit.camera.position.set(0, 0, dist);
  kit.controls.target.set(0, 0, 0);
  const tag = h('div', { style: 'position:absolute;right:10px;top:10px;padding:10px 22px;border-radius:999px;font-size:24px;font-weight:650;background:var(--glass);border:1px solid var(--line-2);opacity:0;z-index:3', text: 'Unconjugated bilirubin (UCB)' });
  top.append(tag);
  // reaction strip
  const D = diagram(bot, 960, 250);
  const nH = D.node({ id: 'h', x: 110, y: 150, label: 'Heme', size: 28, color: HEME, fill: 'color-mix(in oklab, var(--a1) 22%, transparent)' });
  const nV = D.node({ id: 'v', x: 480, y: 150, label: 'Biliverdin', size: 28, color: BV });
  const nR = D.node({ id: 'r', x: 850, y: 150, label: 'Bilirubin', size: 28, color: UCB });
  const a1 = D.arrow({ from: 'h', to: 'v', color: 'var(--fg-3)', width: 4 });
  const a2 = D.arrow({ from: 'v', to: 'r', color: 'var(--fg-3)', width: 4 });
  D.text(295, 112, 'Heme oxygenase', { anchor: 'middle', cls: 'sm', style: 'font-weight:650;fill:var(--ink)', tip: { title: 'Heme oxygenase', body: 'Requires <b>NADPH and O₂</b>. Opens the porphyrin ring → green biliverdin + CO + Fe²⁺. In macrophages.', src: SRC(19) } });
  D.text(665, 112, 'Biliverdin reductase', { anchor: 'middle', cls: 'sm', style: 'font-weight:650;fill:var(--ink)', tip: { title: 'Biliverdin reductase', body: 'Uses <b>NADPH</b>. Reduces biliverdin to yellow-orange bilirubin.', src: SRC(19) } });
  const i1 = D.badge(295, 222, 'O₂ · NADPH', { color: 'var(--nadh)', size: 22 });
  const i2 = D.badge(665, 222, 'NADPH', { color: 'var(--nadh)', size: 22 });
  const o1 = D.badge(250, 40, 'CO', { color: 'var(--co2)', size: 24, w: 70, tip: { title: 'Carbon monoxide', body: 'Released when the ring opens; acts as a signalling molecule.', src: SRC(19) } });
  const o2 = D.badge(345, 40, 'Fe²⁺', { color: 'var(--prot)', size: 24, w: 86, tip: { title: 'Iron', body: 'Released and recycled.', src: SRC('17, 19') } });
  [o1, o2].forEach((o) => (o.style.opacity = 0));
  const nodes = [nH, nV, nR];
  return kitController(kit, {
    step(n) {
      models.forEach((m, i) => { gsap.killTweensOf(m.scale); const v = i === n ? 1 : 0.001; gsap.to(m.scale, { x: v, y: v, z: v, duration: i === n ? 0.8 : 0.4, delay: i === n ? 0.3 : 0, ease: i === n ? 'back.out(1.5)' : 'power2.in' }); });
      nodes.forEach((nd, i) => { gsap.to(nd.g, { opacity: i <= n ? 1 : 0.3, duration: 0.5 }); nd.shape.style.strokeWidth = i === n ? 5 : 2; });
      gsap.to([a1.g, i1], { opacity: n >= 1 ? 1 : 0.3, duration: 0.5 });
      gsap.to([a2.g, i2], { opacity: n >= 2 ? 1 : 0.3, duration: 0.5 });
      gsap.to([o1, o2], { opacity: n >= 1 ? 1 : 0, duration: 0.5 });
      if (n === 1) gsap.fromTo([o1, o2], { y: 70 }, { y: 40, duration: 0.8, ease: 'back.out(2)' });
      gsap.to(tag, { opacity: n >= 2 ? 1 : 0, duration: 0.5 });
    },
    destroy: () => D.destroy(),
  });
}

/* ------------------------------------------------------------------ */
/* 18–19 · Bilirubin journey (and defect map)                          */
/* ------------------------------------------------------------------ */
const JOURNEY = ['Heme breakdown → bilirubin', 'Plasma transport & hepatic uptake', 'Conjugation in the liver', 'Secretion into bile', 'Intestinal conversion & excretion'];
function bilirubinMap(el, mode = 'journey') {
  const D = diagram(el, 1712, 720);
  const G = [[], [], [], [], [], []]; // build groups 0..5
  const tint = (c, p = 8) => `color-mix(in oklab, ${c} ${p}%, transparent)`;
  // 1 · macrophage
  G[0].push(D.region({ x: 0, y: 0, w: 470, h: 344, r: 36, label: 'Spleen · macrophage', fill: tint(HEME, 7), stroke: tint(HEME, 35), labelColor: HEME, tip: { title: 'Where heme is broken down', body: 'Aged RBCs (~120 days) are removed by macrophages of the <b>spleen, liver and bone marrow</b>.', src: SRC(17) } }));
  const rbc = s('g');
  [[62, 108], [110, 92], [98, 136]].forEach(([x, y]) => { rbc.append(s('ellipse', { cx: x, cy: y, rx: 26, ry: 19, style: 'fill:#d33a42' })); rbc.append(s('ellipse', { cx: x, cy: y, rx: 11, ry: 7, style: 'fill:#a5242c' })); });
  D.layers.nodes.append(rbc);
  G[0].push(rbc);
  const nHeme = D.node({ id: 'heme', x: 320, y: 100, label: 'Heme', size: 22, color: HEME });
  const nBv = D.node({ id: 'bv', x: 320, y: 196, label: 'Biliverdin', size: 22, color: BV });
  const nBr = D.node({ id: 'br', x: 320, y: 292, label: 'Bilirubin (UCB)', size: 22, color: UCB });
  const aHo = D.arrow({ from: 'heme', to: 'bv', color: BV, width: 4, gapStart: 5, gapEnd: 5, headSize: 12 });
  const aBvr = D.arrow({ from: 'bv', to: 'br', color: UCB, width: 4, gapStart: 5, gapEnd: 5, headSize: 12 });
  const tHo = D.text(298, 156, 'heme oxygenase', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2);font-weight:600' });
  const tCo = D.text(345, 156, 'CO · Fe²⁺', { cls: 'sm', style: 'font-size:22px;fill:var(--prot);font-weight:650' });
  const tBvr = D.text(298, 252, 'biliverdin reductase', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2);font-weight:600' });
  G[0].push(nHeme.g, nBv.g, nBr.g, aHo.g, aBvr.g, tHo, tCo, tBvr);
  // 2 · blood + uptake
  const blood = s('rect', { x: 220, y: 384, width: 440, height: 64, rx: 32, style: `fill:${tint('#d33a42', 16)};stroke:${tint('#d33a42', 45)};stroke-width:2` });
  D.layers.regions.append(blood);
  const tBlood = D.text(206, 412, 'Blood', { anchor: 'end', style: 'fill:#e0545b;font-weight:700' });
  const tAlb = D.text(206, 442, 'on albumin', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2);font-weight:600' });
  // liver
  const liverD = 'M600,140 C610,40 800,10 1010,22 C1150,30 1215,70 1200,140 C1185,230 1100,330 1010,370 C950,398 760,398 680,372 C620,350 595,240 600,140 Z';
  const liver = s('path', { d: liverD, style: `fill:${tint('#b5523b', 16)};stroke:${tint('#b5523b', 55)};stroke-width:2.5` });
  D.layers.regions.append(liver);
  const tLiver = D.text(640, 112, 'LIVER', { cls: 'sm', style: 'fill:#c8664c;letter-spacing:.14em;font-weight:700' });
  const nLig = D.node({ id: 'lig', x: 770, y: 270, label: 'Bilirubin\n+ ligandin', size: 22, color: UCB, tip: { title: 'Hepatic uptake', body: 'Bilirubin <b>dissociates from albumin</b> at the liver; hepatocytes take it up and bind it to <b>ligandin</b> (protein).', src: SRC(20) } });
  G[1].push(blood, tBlood, tAlb, nLig.g);
  // 3 · conjugation
  const nUgt = D.node({ id: 'ugt', x: 900, y: 150, label: 'UGT1A1', kind: 'enz', size: 26, color: UCB, tip: { title: 'UDP-glucuronosyltransferase (UGT1A1)', body: 'Bilirubin + 2 UDP-glucuronic acid → <b>bilirubin diglucuronide</b> (CB) + 2 UDP. Purpose: water solubility.', src: SRC(21) } });
  const tUdp = D.text(900, 96, '+ 2 UDP-glucuronic acid', { anchor: 'middle', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2)' });
  const nCb = D.node({ id: 'cb', x: 1010, y: 262, label: 'Bilirubin\ndiglucuronide', size: 22, color: CB, tip: { title: 'Conjugated bilirubin (CB)', body: 'Water-soluble. Can enter bile.', src: SRC(21) } });
  const aL = D.arrow({ from: 'lig', to: 'ugt', color: 'var(--fg-3)', width: 3.5, headSize: 12 });
  const aU = D.arrow({ from: 'ugt', to: 'cb', color: 'var(--fg-3)', width: 3.5, headSize: 12 });
  G[2].push(nUgt.g, tUdp, nCb.g, aL.g, aU.g);
  // 4 · secretion
  const nMrp = D.node({ id: 'mrp', x: 1000, y: 366, label: 'MRP2', kind: 'enz', size: 24, color: 'var(--fadh)', tip: { title: 'MRP2 (multidrug resistance–associated protein 2)', body: '<b>ATP-dependent</b> transport of CB into bile canaliculi. Unconjugated bilirubin cannot enter bile.', src: SRC(22) } });
  const bAtp = D.badge(1082, 366, 'ATP', { color: 'var(--atp)', size: 22 });
  const duct = s('path', { d: 'M1000,392 L1000,566', style: `fill:none;stroke:${tint('#3fae6b', 60)};stroke-width:22;stroke-linecap:round` });
  D.layers.regions.append(duct);
  const tBile = D.text(978, 430, 'Bile', { anchor: 'end', style: 'font-weight:650;fill:#3fae6b' });
  G[3].push(nMrp.g, bAtp, duct, tBile);
  // 5 · intestine, kidney
  const gut = s('rect', { x: 900, y: 560, width: 640, height: 112, rx: 56, style: `fill:${tint('#e38f7a', 18)};stroke:${tint('#e38f7a', 55)};stroke-width:2.5` });
  D.layers.regions.append(gut);
  const tGut = D.text(1220, 706, 'Intestine · bacteria', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
  const bact = s('g');
  [[1040, 594, 20], [1062, 640, -30], [1092, 606, 50]].forEach(([x, y, r]) => bact.append(s('rect', { x: x - 14, y: y - 6, width: 28, height: 12, rx: 6, transform: `rotate(${r} ${x} ${y})`, style: 'fill:#7fbf6a;opacity:.85' })));
  D.layers.nodes.append(bact);
  const nUbg = D.node({ id: 'ubg', x: 1210, y: 616, label: 'Urobilinogen', size: 22, tip: { title: 'Urobilinogen', body: 'Intestinal bacteria convert CB → urobilinogen. Most → stercobilin; some reabsorbed (enterohepatic circulation); a small amount → urobilin in urine.', src: SRC(23) } });
  const nSt = D.node({ id: 'st', x: 1425, y: 616, label: 'Stercobilin', size: 22, color: STER });
  const aSt = D.arrow({ from: 'ubg', to: 'st', color: STER, width: 3.5, gapStart: 4, gapEnd: 4, headSize: 11 });
  const tMost = D.text(1318, 592, 'most', { anchor: 'middle', cls: 'sm', style: 'font-size:20px;fill:var(--fg-2);font-weight:600' });
  const faeces = D.region({ x: 1560, y: 560, w: 152, h: 112, r: 30, fill: tint(STER, 30), stroke: tint(STER, 70) });
  const tF1 = D.text(1636, 608, 'Faeces', { anchor: 'middle', style: 'font-weight:700' });
  const tF2 = D.text(1636, 642, 'brown', { anchor: 'middle', cls: 'sm', style: `fill:${STER};font-weight:650` });
  const ent = D.arrow({ d: 'M1150,584 C1130,500 1140,420 1112,338', from: [1150, 584], to: [1112, 338], color: 'var(--fg-3)', width: 3, dash: '8 8', headSize: 12 });
  const tEnt = D.text(1150, 470, 'enterohepatic', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-2);font-weight:600' });
  const kidney = s('path', { transform: 'translate(-34 0)', d: 'M1420,74 C1500,44 1560,112 1540,172 C1525,214 1492,202 1482,230 C1476,268 1500,300 1460,312 C1390,326 1360,252 1366,190 C1370,122 1380,88 1420,74 Z', style: `fill:${tint('#c86b6b', 30)};stroke:${tint('#c86b6b', 70)};stroke-width:2.5` });
  D.layers.regions.append(kidney);
  const tKid = D.text(1418, 40, 'Kidney', { anchor: 'middle', style: 'font-weight:700' });
  const kid = D.arrow({ d: 'M1262,586 C1320,500 1330,340 1366,262', from: [1262, 586], to: [1366, 262], color: 'var(--fg-3)', width: 3, dash: '8 8', headSize: 12 });
  const tSmall = D.text(1340, 430, 'small amount', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-2);font-weight:600' });
  const nUro = D.node({ id: 'uro', x: 1630, y: 196, label: 'Urobilin', size: 22, color: URO });
  const aUro = D.arrow({ from: [1516, 196], to: 'uro', color: URO, width: 3.5, headSize: 11 });
  const cup = s('g', { transform: 'translate(1600 280)' });
  cup.append(s('path', { d: 'M0,0 L64,0 L58,84 Q57,92 49,92 L15,92 Q7,92 6,84 Z', style: `fill:${URO};stroke:var(--fg-3);stroke-width:3` }));
  D.layers.nodes.append(cup);
  const tUr = D.text(1632, 410, 'Urine (yellow)', { anchor: 'middle', cls: 'sm', style: 'font-weight:650' });
  const aCup = D.arrow({ from: 'uro', to: [1632, 272], color: URO, width: 3.5, headSize: 11 });
  G[4].push(gut, tGut, bact, nUbg.g, nSt.g, aSt.g, tMost, faeces, tF1, tF2, ent.g, tEnt, kidney, tKid, kid.g, tSmall, nUro.g, aUro.g, cup, tUr, aCup.g);
  G[5].push(tLiver);

  // flows (paths)
  const P = (d) => { const p = s('path', { d, style: 'fill:none;stroke:none' }); D.layers.fx.append(p); return p; };
  const F = {
    rbc: varFlow(D, P('M140,120 C200,110 240,100 268,100'), { count: 2, color: '#e0434b', speed: 80, r: 8 }),
    ho: varFlow(D, aHo, { count: 1, color: BV, speed: 50, r: 8 }),
    bvr: varFlow(D, aBvr, { count: 1, color: UCB, speed: 50, r: 8 }),
    blood: varFlow(D, P('M320,322 L320,416 L640,416'), { count: 4, color: UCB, speed: 120, r: 7 }),
    alb: varFlow(D, P('M320,322 L320,416 L640,416'), { count: 4, color: 'color-mix(in oklab, var(--fg) 30%, transparent)', speed: 120, r: 16, glow: false, layer: D.layers.edges }),
    entry: varFlow(D, P('M640,416 C680,416 700,380 712,330 L716,320'), { count: 1, color: UCB, speed: 70, r: 7 }),
    lig: varFlow(D, aL, { count: 2, color: UCB, speed: 90, r: 7 }),
    ugt: varFlow(D, aU, { count: 2, color: CB, speed: 90, r: 7 }),
    cb: varFlow(D, P('M1010,306 L1004,350'), { count: 1, color: CB, speed: 40, r: 7 }),
    bile: varFlow(D, P('M1000,392 L1000,600 C1000,612 1010,616 1030,616 L1100,616'), { count: 3, color: CB, speed: 110, r: 7 }),
    ster: varFlow(D, P('M1320,616 L1540,616 L1600,616'), { count: 3, color: STER, speed: 90, r: 8 }),
    ent: varFlow(D, ent, { count: 2, color: UBG, speed: 80, r: 7 }),
    kid: varFlow(D, kid, { count: 2, color: UBG, speed: 90, r: 7 }),
    uro: varFlow(D, P('M1520,196 L1556,196 M1630,224 L1630,276'), { count: 2, color: URO, speed: 50, r: 7 }),
  };
  const FSTEP = { rbc: 1, ho: 1, bvr: 1, blood: 2, alb: 2, entry: 2, lig: 3, ugt: 3, cb: 4, bile: 4, ster: 5, ent: 5, kid: 5, uro: 5 };
  const all = Object.values(F);
  // blocks & extras (defect mode)
  const X = (x, y) => { const g = s('g', { transform: `translate(${x} ${y})`, style: 'opacity:0' }); g.append(s('circle', { r: 26, style: 'fill:var(--inh)' }), s('path', { d: 'M-10,-10 L10,10 M10,-10 L-10,10', style: 'stroke:#fff;stroke-width:5;stroke-linecap:round' })); D.layers.labels.append(g); return g; };
  const xUgt = X(976, 150), xMrp = X(1062, 330), xDuct = X(1000, 480);
  const leak = D.arrow({ d: 'M940,300 C860,420 760,440 660,430', from: [940, 300], to: [660, 430], color: CB, width: 4, dash: '10 9', headSize: 14 });
  leak.g.style.opacity = 0;
  const leakF = varFlow(D, leak, { count: 2, color: CB, speed: 90, r: 7 });
  const bProd = D.badge(170, 228, '↑ production', { color: 'var(--inh)', size: 22 });
  const bUbg = D.badge(1460, 470, '↑ urine urobilinogen', { color: 'var(--inh)', size: 22 });
  const bPale = D.badge(1636, 700, 'pale stools', { color: 'var(--inh)', size: 20 });
  [bProd, bUbg, bPale].forEach((b) => (b.style.opacity = 0));
  const ringUcb = pulseRing(D, nLig), ringCb = pulseRing(D, nCb);

  // bottom-left panel
  const panel = h('div', { style: 'position:absolute;left:0;top:500px;width:860px;height:220px;display:flex;flex-direction:column;justify-content:flex-end;gap:9px' });
  el.append(panel);
  let trackRows = [], bars = null, clue = null, sg = null;
  if (mode === 'journey') {
    trackRows = JOURNEY.map((t, i) => {
      const r = h('div', { style: 'display:flex;gap:14px;align-items:center;font-size:25px;color:var(--fg-3);transition:color .4s;line-height:1.1' }, [
        h('span', { style: 'width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 17px var(--font);border:2px solid currentColor;flex:none', text: String(i + 1) }),
        h('span', { text: t }),
      ]);
      panel.append(r);
      return r;
    });
  } else {
    const bar = (label, col) => {
      const fill = h('div', { style: `height:100%;width:12%;border-radius:12px;background:${col};transition:width .8s var(--ease)` });
      const row = h('div', { style: 'display:grid;grid-template-columns:270px 360px;align-items:center;gap:18px' }, [h('div', { style: 'font-size:25px;color:var(--fg-2);font-weight:560', html: label }), h('div', { style: 'height:26px;border-radius:12px;background:var(--surface-2);overflow:hidden' }, [fill])]);
      return { row, fill };
    };
    const bU = bar('Unconjugated (UCB)', UCB), bC = bar('Conjugated (CB)', CB);
    clue = h('div', { style: 'font-size:25px;color:var(--fg);font-weight:600;min-height:32px' });
    const meter = h('div', { style: 'display:grid;gap:12px;padding:0 0 6px 4px' }, [h('div', { style: 'font-size:22px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--ink)', text: 'Serum bilirubin · schematic' }), bU.row, bC.row, clue]);
    panel.append(meter);
    bars = { bU, bC };
    sg = seg({ options: [{ v: 'none', t: 'Normal' }, { v: 'hemo', t: 'Hemolysis' }, { v: 'cn', t: 'Crigler–Najjar' }, { v: 'dj', t: 'Dubin–Johnson' }, { v: 'obs', t: 'Obstruction' }], value: 'none', onChange: (v) => defect(v) });
    sg.el.querySelectorAll('button').forEach((b) => { b.style.fontSize = '22px'; b.style.padding = '9px 16px'; });
    const holder = h('div', { style: 'position:absolute;left:0;bottom:0' }, [sg.el]);
    panel.style.top = '470px';
    panel.style.height = '170px';
    el.append(holder);
  }

  const build = (n) => {
    G.slice(0, 5).forEach((g, i) => show(g, n >= i + 1, { duration: 0.6 }));
    show(G[5], true);
    all.forEach((f) => f.hide());
    Object.entries(FSTEP).forEach(([k, st]) => F[k].set(n >= st));
    trackRows.forEach((r, i) => { r.style.color = i + 1 === n ? 'var(--ink)' : i + 1 < n ? 'var(--fg-2)' : 'var(--fg-3)'; r.style.fontWeight = i + 1 === n ? 700 : 500; });
  };
  function defect(v) {
    const on = (k, d = 1, r = 1) => { F[k].set(true); F[k].density(d); F[k].rate(r); };
    all.forEach((f) => { f.set(true); f.density(0.6); f.rate(1); });
    F.ho.density(1); F.bvr.density(1); F.cb.density(1); F.uro.density(1);
    const off = (keys) => keys.forEach((k) => F[k].hide());
    [xUgt, xMrp, xDuct].forEach((x) => gsap.to(x, { opacity: 0, duration: 0.3 }));
    gsap.to(leak.g, { opacity: 0, duration: 0.3 }); leakF.hide();
    [bProd, bUbg, bPale].forEach((b) => gsap.to(b, { opacity: 0, duration: 0.3 }));
    ringUcb.set(false); ringCb.set(false);
    faeces.querySelector('rect').style.fill = tint(STER, 30);
    tF2.textContent = 'brown';
    gsap.to([nSt.g, aSt.g], { opacity: 1, duration: 0.4 });
    let u = 12, c = 6, txt = 'Normal flow: UCB → liver → CB → bile → gut.';
    if (v === 'hemo') {
      ['rbc', 'blood', 'alb', 'entry', 'lig', 'ugt', 'kid'].forEach((k) => on(k, 1, 1.6));
      show([bProd, bUbg], true);
      u = 78; c = 10; txt = 'Clue: ↑ urinary urobilinogen (slide 23).';
    } else if (v === 'cn') {
      gsap.to(xUgt, { opacity: 1, duration: 0.4 });
      off(['ugt', 'cb', 'bile', 'ster', 'ent', 'kid', 'uro']);
      ringUcb.set(true);
      u = 92; c = 4; txt = 'UGT1A1 deficiency → unconjugated bilirubin ↑.';
    } else if (v === 'dj') {
      gsap.to(xMrp, { opacity: 1, duration: 0.4 });
      off(['cb', 'bile', 'ster', 'ent', 'kid', 'uro']);
      ringCb.set(true);
      gsap.to(leak.g, { opacity: 1, duration: 0.4 }); leakF.play();
      u = 14; c = 80; txt = 'MRP2 defect → conjugated hyperbilirubinemia.';
    } else if (v === 'obs') {
      gsap.to(xDuct, { opacity: 1, duration: 0.4 });
      off(['bile', 'ster', 'ent', 'kid', 'uro']);
      gsap.to(leak.g, { opacity: 1, duration: 0.4 }); leakF.play();
      gsap.to([nSt.g, aSt.g], { opacity: 0.3, duration: 0.4 });
      faeces.querySelector('rect').style.fill = 'color-mix(in oklab, #d8c7a8 40%, transparent)';
      tF2.textContent = 'pale';
      gsap.to(bPale, { opacity: 1, duration: 0.4 });
      u = 20; c = 86; txt = 'Clue: ↓ stercobilin · pale stools (slide 23).';
    }
    if (bars) { bars.bU.fill.style.width = `${u}%`; bars.bC.fill.style.width = `${c}%`; clue.innerHTML = txt; }
  }
  const flowsPlaying = () => [...all, leakF].filter((f) => f.on);
  if (mode === 'journey') {
    all.forEach((f) => f.hide());
    return {
      step: build,
      enter: () => flowsPlaying().forEach((f) => f.play()),
      leave: () => [...all, leakF].forEach((f) => f.pause()),
      destroy() { [...all, leakF].forEach((f) => f.destroy()); D.destroy(); },
    };
  }
  build(5);
  defect('none');
  return {
    step: (n) => sg.set(['none', 'hemo', 'cn', 'dj', 'obs'][n]),
    enter: () => flowsPlaying().forEach((f) => f.play()),
    leave: () => [...all, leakF].forEach((f) => f.pause()),
    destroy() { [...all, leakF].forEach((f) => f.destroy()); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 20 · UCB vs CB mini visuals                                         */
/* ------------------------------------------------------------------ */
function ucbMini(el) {
  const D = diagram(el, 560, 220);
  D.layers.regions.append(s('rect', { x: 0, y: 10, width: 560, height: 200, rx: 30, style: 'fill:color-mix(in oklab, var(--nadh) 9%, transparent)' }));
  D.text(26, 50, 'plasma (water)', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-3)' });
  const p1 = s('path', { d: 'M40,130 L520,130', style: 'fill:none;stroke:none' });
  const p2 = s('path', { d: 'M40,112 L520,112', style: 'fill:none;stroke:none' });
  D.layers.fx.append(p1, p2);
  const a = varFlow(D, p1, { count: 2, color: 'color-mix(in oklab, var(--fg) 26%, transparent)', speed: 70, r: 40, glow: false, layer: D.layers.edges, autoplay: true });
  const b = varFlow(D, p2, { count: 2, color: UCB, speed: 70, r: 13, autoplay: true });
  D.text(540, 196, 'UCB rides on albumin', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2);font-weight:600' });
  return { destroy() { a.destroy(); b.destroy(); D.destroy(); } };
}
function cbMini(el) {
  const D = diagram(el, 560, 220);
  D.layers.regions.append(s('rect', { x: 0, y: 10, width: 270, height: 200, rx: 30, style: 'fill:color-mix(in oklab, #b5523b 12%, transparent)' }));
  D.layers.regions.append(s('rect', { x: 290, y: 10, width: 270, height: 200, rx: 30, style: 'fill:color-mix(in oklab, #3fae6b 12%, transparent)' }));
  D.text(26, 50, 'hepatocyte', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-3)' });
  D.text(534, 50, 'bile', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-3)' });
  D.layers.nodes.append(s('rect', { x: 252, y: 82, width: 56, height: 96, rx: 16, style: 'fill:color-mix(in oklab, var(--fadh) 30%, transparent);stroke:var(--fadh);stroke-width:3' }));
  D.text(280, 202, 'MRP2 · ATP', { anchor: 'middle', cls: 'sm', style: 'font-size:22px;fill:var(--fadh);font-weight:650' });
  const p = s('path', { d: 'M20,130 L540,130', style: 'fill:none;stroke:none' });
  D.layers.fx.append(p);
  const f = varFlow(D, p, { count: 3, color: CB, speed: 110, r: 12, autoplay: true });
  return { destroy() { f.destroy(); D.destroy(); } };
}

/* ------------------------------------------------------------------ */
/* 21 · Jaundice: where the pipeline breaks                            */
/* ------------------------------------------------------------------ */
function pipeMini(el, kind) {
  const D = diagram(el, 460, 280);
  const bad = 'var(--inh)';
  const Y = 120;
  const rbcG = s('g', { transform: `translate(64 ${Y})` });
  rbcG.append(s('ellipse', { rx: 52, ry: 40, style: `fill:#d33a42;${kind === 'hemo' ? `filter:url(#${D.glowId})` : ''}` }), s('ellipse', { rx: 21, ry: 13, style: 'fill:#a5242c' }));
  const liv = s('path', { transform: `translate(0 ${Y - 95})`, d: 'M176,72 Q224,48 276,60 Q302,70 296,98 Q276,136 226,142 Q184,142 174,114 Q166,90 176,72 Z', style: `fill:color-mix(in oklab, #b5523b 45%, transparent);stroke:#c8664c;stroke-width:3;${kind === 'liver' ? `filter:url(#${D.glowId})` : ''}` });
  const gut = s('rect', { x: 352, y: Y - 28, width: 104, height: 56, rx: 28, style: 'fill:color-mix(in oklab, #e38f7a 40%, transparent);stroke:#e38f7a;stroke-width:3' });
  D.layers.nodes.append(rbcG, liv, gut);
  D.arrow({ from: [120, Y], to: [166, Y], color: 'var(--fg-3)', width: 4, headSize: 13 });
  D.arrow({ from: [304, Y], to: [346, Y], color: kind === 'obs' ? bad : 'var(--fg-3)', width: 4, headSize: 13 });
  [['RBC', 64], ['Liver', 235], ['Gut', 404]].forEach(([t, x]) => D.text(x, Y + 92, t, { anchor: 'middle', cls: 'sm', style: 'font-size:24px;fill:var(--fg-2);font-weight:600' }));
  const mark = (x, y, txt) => { const g = s('g', { transform: `translate(${x} ${y})` }); g.append(s('circle', { r: 24, style: `fill:${bad}` })); const t = s('text', { y: 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:800;fill:#fff' }); t.textContent = txt; g.append(t); D.layers.labels.append(g); return g; };
  const m = kind === 'hemo' ? mark(108, Y - 46, '↑') : kind === 'liver' ? mark(235, Y + 2, '✕') : mark(326, Y, '✕');
  gsap.fromTo(m, { scale: 0.85, transformOrigin: 'center' }, { scale: 1.12, duration: 0.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  return { destroy() { gsap.killTweensOf(m); D.destroy(); } };
}

/* ------------------------------------------------------------------ */
/* 22 · Learning check: degradation                                    */
/* ------------------------------------------------------------------ */
function checkDegViz(el) {
  const qa = qaList([
    ['Where does most heme breakdown occur?', 'In <b>macrophages</b> of the spleen, liver and bone marrow.'],
    ['Which enzyme converts heme to biliverdin?', '<b>Heme oxygenase</b> (NADPH + O₂) → biliverdin + CO + Fe²⁺.'],
    ['Which proteins carry bilirubin in plasma and in hepatocytes?', '<b>Albumin</b> in plasma · <b>ligandin</b> inside hepatocytes.'],
    ['Which enzyme conjugates bilirubin?', '<b>UGT1A1</b>: + 2 UDP-glucuronic acid → bilirubin diglucuronide.'],
    ['Which transporter secretes CB into bile?', '<b>MRP2</b>, ATP-dependent, into bile canaliculi.'],
    ['UCB vs CB: solubility and transport?', 'UCB: lipid-soluble, on albumin, no entry to bile. CB: water-soluble, MRP2 → bile.'],
    ['Defect in Crigler–Najjar and Dubin–Johnson?', 'Crigler–Najjar: <b>UGT1A1</b> deficiency. Dubin–Johnson: <b>MRP2</b> defect (a transporter).'],
  ], { cols: 2, qSize: 27, aSize: 24, gap: 16 });
  qa.el.style.height = '100%';
  qa.el.style.alignContent = 'start';
  el.append(qa.el);
  return { step: qa.step };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry, 8th / 9th ed. — Chapter 21, Amino acids: Conversion to specialized products',
    'Marks Textbook of Biochemistry: A Clinical Approach — Chapter 44, The Biochemistry of the Erythrocyte and Other Blood Cells',
    'Lecture slides: Heme metabolism (L.26–L.27), Dr Gulam Saidunnisa, NUST',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.26 – L.27',
      title: 'Heme <em>Metabolism</em>',
      subtitle: 'Built in eight steps. Broken down to bilirubin.',
      meta: ['Synthesis', 'Porphyrias', 'Bilirubin & jaundice'],
      notes: [
        'Two sessions in one deck: heme synthesis and its disorders (L.26), then heme degradation and bilirubin (L.27).',
        'On screen: real hemoglobin (PDB 4HHB). Two α chains (red) and two β chains (amber); each holds one heme — the glowing iron centres.',
        'Roadmap: structure → sites → the 8 steps → regulation → lead and porphyrias → breakdown → bilirubin journey → jaundice.',
      ],
      visual: heroViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Specific learning outcomes',
      title: 'By the end, you can…',
      cards: [
        { icon: 'bone', big: '01', k: 'L.26.1', title: 'Sites of synthesis', body: 'Liver & bone marrow', tip: { title: 'L.26.1', body: 'Identify the major organs / tissues that have the highest rates of heme biosynthesis.' } },
        { icon: 'layers', big: '02', k: 'L.26.2', title: 'The eight steps', body: 'Enzymes · compartments', tip: { title: 'L.26.2', body: 'Describe the steps, enzymes, and subcellular localization of the heme biosynthesis pathway.' } },
        { icon: 'sun', big: '03', k: 'L.26.3', title: 'The porphyrias', body: 'Defects → signs', tip: { title: 'L.26.3', body: 'Explain the biochemical basis of specific porphyrias resulting from enzyme deficiency in the heme biosynthesis pathway.' } },
        { icon: 'drop', big: '04', k: 'L.27.1', title: 'Bilirubin pathway', body: 'Heme → bile', tip: { title: 'L.27.1', body: 'Describe the pathway of heme degradation (metabolism of bilirubin).' } },
      ],
      src: 'Lecture slides 2, 15',
      notes: ['Session 1 (L.26.1–3): synthesis and porphyrias. Session 2 (L.27.1): degradation.', 'Hover a card for the full SLO wording.'],
    },
    {
      layout: 'full',
      eyebrow: 'Clinical case',
      title: 'Blistered hands, <em>dark urine</em>',
      steps: 3,
      src: SRC(3),
      notes: [
        'Read the case aloud. Build 1: the blisters are on sun-exposed skin, and she has just started walking outdoors.',
        'Build 2: the urine darkens after standing.',
        'Build 3: “What connects hand blisters and dark urine?” — leave it open. We solve it after the porphyrias (slide 13).',
        'Note the negative: no abdominal pain, no neurological signs. That rules out some porphyrias.',
      ],
      visual: caseViz,
    },
    {
      eyebrow: 'Structure of heme',
      title: 'An asymmetric <em>metalloporphyrin</em>',
      bullets: [
        { t: '4 <b>pyrrole</b> rings (I – IV)', tip: { title: 'Pyrrole', body: 'A 5-membered ring of 4 C + 1 N–H. Four of them make the porphyrin ring.', src: SRC(4) } },
        { t: 'Joined by <b>methine</b> bridges', tip: { title: 'Methine (methenyl) bridges', body: '=CH– links between rings, labelled α, β, γ, δ on the lecture figure.', src: SRC(4) } },
        { t: '<b>Fe²⁺</b> held by 4 nitrogens', tip: { title: 'Heme = protoporphyrin IX + Fe²⁺', body: 'Protoporphyrin IX binds Fe²⁺ through its central nitrogen atoms.', src: SRC(4) } },
        { t: 'Methyl · vinyl · <b>propionate</b>', tip: { title: 'Why asymmetric?', body: 'Side chains around the ring: 4 methyl, 2 vinyl, 2 propionate. The two propionates sit next to each other (rings III and IV). Slide 4’s legend says “propionyl” — the group is propionate.', src: SRC(4) } },
      ],
      focus: true,
      steps: 4,
      src: 'Lecture slide 4 · real 3D heme from hemoglobin (PDB 4HHB)',
      notes: [
        'Real heme coordinates from hemoglobin, laid flat. Ring numbering follows slide 4: I top, then clockwise.',
        'Build 1: four pyrrole rings. Build 2: methine bridges (=CH–), α–δ.',
        'Build 3: Fe²⁺ in the centre, bound to the four pyrrole nitrogens. Heme = protoporphyrin IX + Fe²⁺.',
        'Build 4: side chains — 4 methyl (pink), 2 vinyl (orange), 2 propionate (blue). The adjacent propionates make heme asymmetric.',
        'Accuracy: slide 4’s formula “C₂₀H₁₄N₄” is unsubstituted porphin, not heme (heme is C₃₄H₃₂FeN₄O₄).',
      ],
      visual: hemeStructViz,
    },
    {
      eyebrow: 'L.26.1 · Sites of synthesis',
      title: 'Where heme is <em>made</em>',
      bullets: [
        { t: 'Major sites: <b>bone marrow</b> & <b>liver</b>', tip: { title: 'Major sites of synthesis', body: 'The lecture names liver and bone marrow. Lippincott adds that ~85% is in erythroid cells (for hemoglobin) and most of the rest in liver (mainly cytochrome P450).', src: `${SRC(6)} · Lippincott Ch 21` } },
        { t: '<b>Eight</b> enzymes · all <b>irreversible</b>', tip: { title: 'Eight enzymes', body: 'Eight enzymes catalyse heme synthesis. The reactions are irreversible.', src: SRC(6) } },
        { t: 'Mitochondria → cytosol → mitochondria', tip: { title: 'A round trip', body: 'Step 1 in mitochondria, steps 2–5 in the cytosol, steps 6–8 back in mitochondria.', src: SRC('5–7') } },
      ],
      steps: 2,
      src: 'Lecture slide 6 · roles of each site per Lippincott Ch 21',
      notes: [
        'Build 1: bone marrow — erythroid precursors make heme for hemoglobin (red marrow: flat bones and proximal long bones).',
        'Build 2: liver — hepatocytes make heme mainly for cytochrome P450 (textbook detail).',
        'The slides give no percentages; Lippincott: ~85% erythroid. Say it as textbook context only.',
        'Then: the pathway travels mitochondria → cytosol → mitochondria. Eight enzymes, all irreversible.',
      ],
      visual: sitesViz,
    },
    {
      layout: 'full',
      eyebrow: 'L.26.2 · Heme synthesis',
      title: 'Eight steps, two <em>compartments</em>',
      bullets: [{ t: '1 · 6 · 7 · 8 in mitochondria' }, { t: '2 – 5 in cytosol' }],
      steps: 8,
      src: 'Lecture slides 5–7 · 3D: PubChem conformers (HMB, uroporphyrinogen III as 2D layouts) · heme from 4HHB',
      notes: [
        'Press → to walk the pathway. The right panel shows each product in 3D.',
        '1 · ALA synthase (mito): glycine + succinyl-CoA → δ-ALA; needs PLP (B6); releases CO₂ + CoA. Rate-limiting.',
        '2 · ALA dehydratase (cytosol): 2 ALA → porphobilinogen (first pyrrole) + 2 H₂O. Lead-sensitive.',
        '3 · HMB synthase (= PBG deaminase): 4 PBG → hydroxymethylbilane (linear) + 4 NH₃. 4 · UROgen III synthase closes the ring (type III).',
        '5 · UROgen decarboxylase (cytosol): 4 acetate → methyl, − 4 CO₂. Product enters the mitochondrion.',
        '6 · Coproporphyrinogen oxidase: 2 propionate → vinyl. 7 · Protoporphyrinogen oxidase: bridges oxidised → protoporphyrin IX. 8 · Ferrochelatase inserts Fe²⁺.',
        'Accuracy: slide 5 lists cytosol as “steps 2–4” and omits step 5; slide 7 places step 5 in the cytoplasm, so the cytosolic steps are 2–5.',
      ],
      visual: synthesisViz,
    },
    {
      eyebrow: 'Structural changes · slide 7',
      title: 'Tailoring the <em>ring</em>',
      bullets: [
        { t: 'Step 5: <b>A → M</b>', sub: 'acetate → methyl · − 4 CO₂', tip: { title: 'Uroporphyrinogen decarboxylase', body: 'All four acetate side chains are decarboxylated to methyl groups. (Slide 7 writes “acetyl”; the groups are acetate.)', src: SRC(7) } },
        { t: 'Step 6: <b>P → V</b>', sub: 'two propionates → vinyl · − 2 CO₂', tip: { title: 'Coproporphyrinogen oxidase', body: 'The first two propionate side chains are decarboxylated and oxidised to vinyl groups. (Slide 7 writes “propionyl”.)', src: SRC(7) } },
        { t: 'Step 7: bridges <b>oxidised</b>', sub: 'colourless → coloured', tip: { title: 'Protoporphyrinogen oxidase', body: 'Methylene bridges (–CH₂–) are oxidised to methenyl (=CH–): porphyrinogen → porphyrin, which is coloured.', src: SRC('7, 13') } },
        { t: 'Step 8: <b>Fe²⁺</b> inserted', tip: { title: 'Ferrochelatase', body: 'Inserts Fe²⁺ into protoporphyrin IX → heme. Inhibited by lead.', src: SRC(7) } },
      ],
      focus: true,
      steps: 4,
      src: 'Lecture slide 7 · substituent order as slide 4 (1 M 2 V 3 M 4 V 5 M 6 P 7 P 8 M)',
      notes: [
        'Start: uroporphyrinogen III — acetate (A) and propionate (P) on every ring; ring IV is flipped (type III).',
        'Build 1: A → M. Build 2: P → V on rings I and II — mnemonics from slide 7.',
        'Build 3: methylene bridges become methenyl bridges — the ring turns coloured (porphyrinogens are colourless, porphyrins are coloured; links to urine colour later).',
        'Build 4: Fe²⁺ drops in → heme.',
        'Accuracy: slide 7 says “acetyl” and “propionyl”; the correct groups are acetate and propionate.',
      ],
      visual: ringLogicViz,
    },
    {
      eyebrow: 'Regulation',
      title: 'Heme brakes its <em>own</em> synthesis',
      bullets: [
        { t: '<b>δ-ALA synthase</b>: first, rate-limiting', tip: { title: 'The control point', body: 'Heme regulates its own synthesis by mechanisms that affect the first rate-limiting enzyme, δ-ALA synthase.', src: SRC(8) } },
        { t: 'Coenzyme: <b>PLP</b> (vitamin B6)', tip: { title: 'Pyridoxal phosphate', body: 'ALA synthase needs pyridoxal phosphate (B6).', src: SRC('6–7') } },
        { t: '↑ Heme → ↓ synthesis', tip: { kicker: 'Textbook detail (Lippincott)', title: 'How, in liver', body: 'Heme represses ALAS1 synthesis and blocks its import into mitochondria. The slide says only that heme acts on ALA synthase.', src: `${SRC(8)} · Lippincott Ch 21` } },
      ],
      steps: 2,
      src: 'Lecture slide 8 · rates schematic',
      notes: [
        'δ-ALA synthase is the first, rate-limiting, committed step.',
        'Build 1: the feedback loop appears. Build 2: heme high → ALA synthase slows → less heme. Drag the slider live.',
        'Slide 8 calls it feedback inhibition. Textbook: in liver, heme mainly represses ALAS1 synthesis and blocks its mitochondrial import.',
        'Not on slides: drugs that induce cytochrome P450 increase ALAS1 and can trigger acute porphyria attacks.',
      ],
      visual: regulationViz,
    },
    {
      eyebrow: 'Disorders of heme synthesis',
      title: 'Lead <em>poisoning</em>',
      bullets: [
        { t: 'Blocks <b>ALA dehydratase</b>', sub: 'step 2 · cytosol' },
        { t: 'Blocks <b>ferrochelatase</b>', sub: 'step 8 · mitochondria' },
        { t: '↑ ALA · ↑ protoporphyrin' },
        { t: 'Abdominal · neuro · <b>anaemia</b>', tip: { title: 'Presentation', list: ['Abdominal', 'Neurological', 'Anaemia', 'No photosensitivity'], src: SRC(11) } },
      ],
      steps: 1,
      src: 'Lecture slides 7, 9, 11',
      notes: [
        'Toggle lead (or press →): two red blocks — ALA dehydratase (step 2) and ferrochelatase (step 8).',
        'ALA builds up before step 2; protoporphyrin builds up before step 8; less heme → anaemia.',
        'Slide 11: abdominal + neurological + anaemia, no photosensitivity.',
        'Textbook nuance (if asked): the accumulated protoporphyrin is largely bound to zinc (zinc protoporphyrin), which is not significantly phototoxic.',
        'Local hook (not exam material): some traditional kohl eye cosmetics can contain lead.',
      ],
      visual: leadViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Porphyrias',
      title: '<em>Porphyra</em>: Greek for purple',
      subtitle: 'Enzyme defects in heme synthesis → specific intermediates accumulate.',
      steps: 1,
      src: 'Lecture slides 10, 13 · colours illustrative',
      notes: [
        'Porphyria comes from Greek porphyra, purple: urine can turn red-purple or port-wine when exposed to light and air.',
        'Definition: disorders caused by defects in enzymes of heme synthesis, leading to accumulation of specific intermediates.',
        'Slide 13 is more precise: colourless porphyrinogens in urine are oxidised to coloured porphyrins on standing or in light.',
      ],
      visual: purpleViz,
    },
    {
      layout: 'full',
      eyebrow: 'L.26.3 · Porphyria explorer',
      title: 'Where is the <em>block</em>?',
      bullets: [{ t: 'Pick a disorder' }, { t: 'Ring rule → skin' }],
      steps: 3,
      src: 'Lecture slides 9, 11–12 · type labels per Lippincott',
      notes: [
        'Step through AIP, PCT and VP (or click). The red block shows the deficient enzyme; glowing pills are what accumulates.',
        'AIP: HMB synthase (PBG deaminase) → ↑ ALA, ↑ PBG → acute abdominal and neurological attacks, no photosensitivity.',
        'PCT (most common): UROgen decarboxylase → ↑ uroporphyrins → photosensitivity, blistering skin.',
        'VP: protoporphyrinogen oxidase → ↑ porphyrin intermediates → abdominal + neurological + photosensitivity.',
        'The rule (slide 12): block before the ring → ALA/PBG ↑ → no photosensitivity. Cyclic porphyrins ↑ → photosensitivity.',
        'Textbook only: AIP and VP autosomal dominant; PCT mostly acquired; in VP, ALA/PBG also rise during attacks.',
      ],
      visual: explorerViz,
    },
    {
      eyebrow: 'Clinical features',
      title: 'Why light <em>hurts</em>',
      bullets: [
        { t: 'Light + porphyrins → <b>ROS</b>', step: 1, tip: { title: 'Photosensitivity', body: 'On exposure to light, porphyrins generate reactive oxygen species that damage the skin. Skin itches and burns (pruritus) in sunlight.', src: SRC(13) } },
        { t: 'ROS damage the skin', step: 2 },
        { t: '<b>Blisters</b> on sun-exposed skin', step: 3, tip: { title: 'Where lesions appear', body: 'Backs of the hands and the face: blisters, erosions, crusts, scarring, pigment changes (clinical photos on slide 13).', src: SRC(13) } },
      ],
      steps: 3,
      src: 'Lecture slide 13 · schematic skin section',
      notes: [
        'Porphyrins deposited in skin absorb light (build 1).',
        'Excited porphyrins generate reactive oxygen species (build 2).',
        'ROS damage the skin → blisters and fragility on sun-exposed areas (build 3).',
        'Only cyclic porphyrins do this — ALA and PBG do not, which is why AIP has no skin signs.',
      ],
      visual: photoViz,
    },
    {
      layout: 'full',
      eyebrow: 'Case solved',
      title: 'One defect, <em>two</em> signs',
      steps: 4,
      src: 'Lecture slides 3, 10, 12–13 · diagnosis inferred from slides 12–13',
      notes: [
        'Ask each question first, then reveal.',
        'Diagnosis: porphyria cutanea tarda — uroporphyrinogen decarboxylase deficiency, ↑ uroporphyrins. Most common porphyria.',
        'Skin: new morning walks → sunlight on the backs of the hands → porphyrins make ROS → blisters, fragility.',
        'Urine: porphyrinogens oxidise to coloured porphyrins on standing → reddish-brown.',
        'No abdominal/neuro attacks: the defect is after ring formation, so ALA/PBG are not raised.',
      ],
      visual: caseRevealViz,
    },
    {
      layout: 'full',
      eyebrow: 'Learning check · synthesis',
      title: 'Test yourself',
      steps: 7,
      src: SRC(14),
      notes: ['Builds 1–3 reveal the three questions; builds 4–7 fill the porphyria table row by row.', 'Ask the room before each reveal.'],
      visual: checkSynthViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Session 2 · L.27.1 · Clinical connection',
      title: 'A bruise is heme <em>breaking down</em>',
      subtitle: 'heme → biliverdin (green) → bilirubin (yellow-orange)',
      steps: 3,
      src: 'Lecture slide 16 · colours illustrative; timelines omitted (the slide’s two timelines disagree)',
      notes: [
        'Red/blue: hemoglobin (loses O₂ → purple). Build 1: green biliverdin. Build 2: yellow bilirubin. Build 3: brown hemosiderin in macrophages.',
        'The colour order matters, not the days. Slide 16 shows two figures with different timelines, so no day counts are given here.',
      ],
      visual: bruiseViz,
    },
    {
      eyebrow: 'Overview of heme breakdown',
      title: 'Recycle, recycle, <em>excrete</em>',
      bullets: [
        { t: 'Old RBCs (~120 d) → <b>macrophages</b>', tip: { title: 'Where', body: 'Macrophages of the spleen, liver and bone marrow.', src: SRC(17) } },
        { t: '<b>Globin</b> → amino acids, reused', step: 1 },
        { t: '<b>Fe²⁺</b> → recycled', step: 2, tip: { title: 'Iron', body: 'Iron is recycled; CO (from heme oxygenase) acts as a signalling molecule.', src: SRC('17, 19') } },
        { t: '<b>Porphyrin</b> → bilirubin → bile', step: 3, tip: { title: 'The ring', body: 'The porphyrin ring is converted to bilirubin for excretion in bile.', src: SRC(17) } },
      ],
      steps: 3,
      src: 'Lecture slide 17 · 3D: hemoglobin 4HHB · colour change schematic (ring opening on the next slide)',
      notes: [
        'Aged RBCs (~120 days) are engulfed by macrophages of spleen, liver and bone marrow.',
        'Build 1: globin chains fall away → amino acids, reused.',
        'Build 2: iron leaves the hemes → recycled.',
        'Build 3: the porphyrin is converted to biliverdin (green) then bilirubin (yellow) for excretion in bile.',
        '“Globin and iron are recycled; the porphyrin ring is converted to bilirubin for excretion.” (slide 17)',
      ],
      visual: recycleViz,
    },
    {
      eyebrow: 'Step 1 · in the macrophage',
      title: 'Opening the <em>ring</em>',
      bullets: [
        { t: '<b>Heme oxygenase</b> opens the ring', step: 1, tip: { title: 'Heme oxygenase', list: ['Requires NADPH and O₂', 'Opens the porphyrin ring', 'Produces green biliverdin, CO and Fe²⁺'], src: SRC(19) } },
        { t: '→ biliverdin + CO + Fe²⁺', step: 1, tip: { title: 'Clinical link', body: 'Iron is recycled and CO acts as a signalling molecule.', src: SRC(19) } },
        { t: '<b>Biliverdin reductase</b> → bilirubin', step: 2, tip: { title: 'Biliverdin reductase', body: 'Uses NADPH; converts biliverdin to yellow-orange bilirubin — unconjugated (UCB).', src: SRC(19) } },
      ],
      steps: 2,
      src: 'Lecture slide 19 · real 3D: heme (4HHB), biliverdin and bilirubin (PubChem)',
      notes: [
        'Start: heme (real coordinates).',
        'Build 1: heme oxygenase (NADPH + O₂) opens the ring → biliverdin (green, linear) + CO + Fe²⁺.',
        'Build 2: biliverdin reductase (NADPH) → bilirubin (yellow-orange). This is unconjugated bilirubin (UCB).',
        'CO acts as a signalling molecule; iron is recycled.',
      ],
      visual: hoViz,
    },
    {
      layout: 'full',
      eyebrow: 'L.27.1 · Bilirubin metabolism',
      title: 'The bilirubin <em>journey</em>',
      bullets: [{ t: 'Five steps' }, { t: 'Hover any stop' }],
      steps: 5,
      src: 'Lecture slides 18–23',
      notes: [
        '1 · Macrophage: heme → (heme oxygenase) biliverdin + CO + Fe²⁺ → (biliverdin reductase) bilirubin (UCB).',
        '2 · Blood: UCB is lipid-soluble, carried non-covalently on albumin. At the liver it dissociates, is taken up and binds ligandin.',
        '3 · Conjugation: UGT1A1 + 2 UDP-glucuronic acid → bilirubin diglucuronide (CB), water-soluble.',
        '4 · Secretion: MRP2 pumps CB into bile canaliculi (ATP-dependent). UCB cannot enter bile.',
        '5 · Gut: bacteria → urobilinogen. Most → stercobilin (brown faeces). Some reabsorbed (enterohepatic). A small amount → kidney → urobilin (yellow urine).',
        'Clinical link (slide 20): drugs that displace bilirubin from albumin raise the risk of kernicterus in neonates.',
      ],
      visual: (el) => bilirubinMap(el, 'journey'),
    },
    {
      layout: 'full',
      eyebrow: 'When bilirubin metabolism is disturbed',
      title: 'Break the <em>pipeline</em>',
      bullets: [{ t: 'Which bilirubin rises?' }],
      steps: 4,
      src: 'Lecture slides 21–24 · bilirubin type in hemolysis & obstruction per Lippincott · levels schematic',
      notes: [
        'Click a defect (or press →).',
        'Hemolysis: more bilirubin made → unconjugated ↑; clue: ↑ urinary urobilinogen (slide 23).',
        'Crigler–Najjar: UGT1A1 deficiency → conjugation fails → unconjugated ↑ (slide 21).',
        'Dubin–Johnson: MRP2 defect → conjugated hyperbilirubinemia (slide 22).',
        'Obstruction: bile cannot reach the gut → ↓ stercobilin, pale stools (slide 23); conjugated ↑ (textbook).',
      ],
      visual: (el) => bilirubinMap(el, 'defects'),
    },
    {
      layout: 'cards',
      eyebrow: 'Two forms of bilirubin',
      title: 'Unconjugated vs <em>conjugated</em>',
      cards: [
        { k: 'Unconjugated · UCB', title: 'Lipid-soluble', list: ['Carried on <b>albumin</b>', '<b>Ligandin</b> in hepatocytes', 'Cannot enter bile'], viz: ucbMini, tip: { title: 'Unconjugated bilirubin', body: 'Lipid-soluble; non-covalently bound to albumin. Clinical link: drugs that displace it from albumin raise the risk of <b>kernicterus</b> in neonates (it crosses the BBB).', src: SRC('20, 22') } },
        { k: 'Conjugated · CB', title: 'Water-soluble', list: ['Bilirubin <b>diglucuronide</b>', 'Made by <b>UGT1A1</b>', '<b>MRP2</b> pumps it into bile'], viz: cbMini, tip: { title: 'Conjugated bilirubin', body: 'Bilirubin + 2 UDP-glucuronic acid → bilirubin diglucuronide. Secreted into bile canaliculi by MRP2 (ATP-dependent).', src: SRC('21–22') } },
      ],
      src: 'Lecture slides 20–22, 26',
      notes: ['UCB: lipid-soluble, albumin in plasma, ligandin in hepatocytes, cannot enter bile; kernicterus risk if displaced in neonates.', 'CB: water-soluble diglucuronide, made by UGT1A1, secreted by MRP2 → intestine.'],
    },
    {
      layout: 'cards',
      eyebrow: 'Hyperbilirubinemia',
      title: 'Three roads to <em>jaundice</em>',
      bullets: [{ t: 'Yellow <b>sclera</b> & <b>skin</b>', tip: { title: 'Jaundice', body: 'Bilirubin accumulation causes yellow discoloration of the sclera and skin.', src: SRC(24) } }],
      cards: [
        { k: '1 · Production ↑', title: 'Hemolysis', body: 'More bilirubin made.', list: ['Clue: ↑ urine urobilinogen'], viz: (v) => pipeMini(v, 'hemo'), tip: { title: 'Increased production', body: 'Increased bilirubin production during hemolysis. Clue: ↑ urinary urobilinogen.', src: SRC('23–24') } },
        { k: '2 · Liver handling ↓', title: 'Hepatic', body: 'Uptake, conjugation or secretion.', list: ['e.g. Crigler–Najjar, Dubin–Johnson'], viz: (v) => pipeMini(v, 'liver'), tip: { title: 'Impaired hepatic handling', body: 'Impaired hepatic uptake, conjugation or secretion — e.g. Crigler–Najjar (UGT1A1), Dubin–Johnson (MRP2).', src: SRC('21–24') } },
        { k: '3 · Flow blocked', title: 'Obstruction', body: 'Bile cannot reach the gut.', list: ['Clue: ↓ stercobilin, pale stools'], viz: (v) => pipeMini(v, 'obs'), tip: { title: 'Obstruction of bile flow', body: 'Clue: ↓ stercobilin and pale stools.', src: SRC('23–24') } },
      ],
      src: 'Lecture slides 23–24',
      notes: ['Hyperbilirubinemia may result from: increased production (hemolysis); impaired hepatic uptake, conjugation or secretion; obstruction of bile flow.', 'Jaundice = yellow sclera and skin from bilirubin accumulation.', 'The slides give two lab clues: ↑ urine urobilinogen in hemolysis; ↓ stercobilin with pale stools in obstruction.'],
    },
    {
      layout: 'full',
      eyebrow: 'Learning check · degradation',
      title: 'Test yourself',
      steps: 7,
      src: 'Lecture slides 25–26',
      notes: ['Seven questions from slides 25–26; reveal one at a time.', 'Slide 25 Q3 (“which pigment gives bilirubin its colour?”) is omitted — bilirubin itself is the yellow-orange pigment.', 'Dubin–Johnson: the slide asks for an “enzyme”, but MRP2 is a transporter.'],
      visual: checkDegViz,
    },
    {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { big: '8', title: 'enzymes', body: 'All irreversible · 1, 6–8 mitochondrial.' },
        { big: 'B6', title: 'ALA synthase', body: 'Rate-limiting · heme feeds back.' },
        { big: '2', title: 'lead targets', body: 'ALA dehydratase · ferrochelatase.' },
        { big: '3', title: 'porphyrias', body: 'AIP · PCT (skin) · VP (both).' },
        { big: '120', title: 'days, then out', body: 'Globin + Fe²⁺ reused; ring → bilirubin.' },
        { big: '2', title: 'glucuronides', body: 'UGT1A1 → CB → MRP2 → bile.' },
      ],
      notes: 'Recap the six numbers, then open the question bank.',
    },
  ],
};
