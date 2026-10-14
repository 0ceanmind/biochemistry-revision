// Amino Acids & Proteins (L.3 – L.4) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { chart } from '../viz/chart.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, glowSprite, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { loadPDB, buildProtein } from '../viz/protein.js';
import { moleculeScene } from '../viz/scenes.js';

const gsap = window.gsap;
// Slide colour code (lecture): amino/basic = blue, carboxyl/acidic = red, H on Cα = green, R = magenta.
const AM = 'var(--elec)';
const AC = 'var(--inh)';
const HC = 'var(--act)';
const RC = 'var(--a1)';
const PEP = 'var(--nadh)';
const SRC = (p) => `Lecture slide ${p}`;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth SVG path through points (Catmull-Rom → cubic Bézier). */
function smooth(pts, closed = false) {
  if (pts.length < 2) return '';
  const P = closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
/** SVG atom circle with element letter. */
function atomG(parent, x, y, lab, col, r = 34, o = {}) {
  const g = s('g', { transform: `translate(${x} ${y})` });
  g.append(s('circle', { r, style: `fill:color-mix(in oklab, ${col} ${o.fill ?? 20}%, var(--bg));stroke:${col};stroke-width:3` }));
  const t = s('text', { y: r * 0.35, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${o.fs ?? Math.round(r * 0.82)}px;font-weight:700;fill:var(--fg)` });
  setRich(t, lab);
  g.append(t);
  parent.append(g);
  g._t = t;
  return g;
}
function lineEl(parent, a, b, style) {
  const l = s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], style: style || 'stroke:var(--line-2);stroke-width:6;stroke-linecap:round' });
  parent.append(l);
  return l;
}
/** Collection of repeating tweens that pause with the slide. */
function loops() {
  const list = [];
  return {
    add(t) { list.push(t); return t; },
    pause() { list.forEach((t) => t.pause()); },
    play() { list.forEach((t) => t.play()); },
    kill() { list.forEach((t) => t.kill()); list.length = 0; },
  };
}

/* ---------- 3D helpers ---------- */
const V3 = (a) => new THREE.Vector3(...a);
const BALL = new THREE.SphereGeometry(1, 22, 16);
const STICK = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
const ELC = { C: 0x9a9aa2, N: 0x3a82ff, O: 0xff453a, S: 0xffd60a };

/** Clone every material in a subtree (molecule.js shares materials globally). */
function ownMats(obj) {
  const map = new Map();
  obj.traverse((o) => {
    if (!o.material) return;
    if (!map.has(o.material)) map.set(o.material, o.material.clone());
    o.material = map.get(o.material);
  });
  return [...map.values()];
}
function setAlpha(obj, a, dur = 0.6) {
  const mats = new Set();
  obj.traverse((o) => o.material && mats.add(o.material));
  mats.forEach((m) => {
    m.transparent = true;
    gsap.to(m, { opacity: a, duration: dur, overwrite: true, onUpdate: () => { m.depthWrite = m.opacity > 0.8; } });
  });
}
/**
 * Fischer orientation: Cα at origin, iUp group up & away, iDown group down & away,
 * the other two substituents point toward the viewer (left / right).
 */
function fischer(mol, iC, iUp, iDown) {
  const P = mol.userData.pos;
  const c = P[iC];
  const a = P[iUp].clone().sub(c).normalize();
  const b = P[iDown].clone().sub(c).normalize();
  const Y = a.clone().sub(b).normalize();
  const Z = a.clone().add(b).normalize().negate();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).transpose();
  mol.quaternion.setFromRotationMatrix(m);
  mol.position.copy(c).applyQuaternion(mol.quaternion).negate();
  const g = new THREE.Group();
  g.add(mol);
  return g;
}
/** Atom position in the Fischer wrapper's frame. */
const wpos = (mol, i) => mol.userData.pos[i].clone().applyQuaternion(mol.quaternion).add(mol.position);
const outward = (p, k) => p.clone().add(p.clone().normalize().multiplyScalar(k));
const centroid = (pts) => pts.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);

/** Frame an object by its mesh bounding box (tighter than the kit's sphere fit). spin: allow for rotation about y. */
function fitBox(kit, obj, fill = 0.85, { spin = false, lift = 0 } = {}) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const w = spin ? Math.max(size.x, size.z) : size.x;
  const t = Math.tan(THREE.MathUtils.degToRad(kit.camera.fov) / 2);
  const dist = Math.max(size.y / 2 / t, w / 2 / (t * kit.camera.aspect)) / fill + (spin ? w : size.z) / 2;
  const target = kit.controls ? kit.controls.target : new THREE.Vector3();
  const dir = kit.camera.position.clone().sub(target).normalize();
  c.y += lift;
  target.copy(c);
  kit.camera.position.copy(c).add(dir.multiplyScalar(dist));
  kit.camera.near = dist / 100; kit.camera.far = dist * 10;
  kit.camera.updateProjectionMatrix();
  return dist;
}
function hideHint(el) { const e = el.querySelector('.hint3d'); if (e) e.style.display = 'none'; }
const rainbow = (n) => (ci, i) => new THREE.Color().setHSL(0.68 * (1 - i / Math.max(1, n - 1)), 0.85, 0.5).getHex();

function tag(kit, html, pos, parent, { color, cls = 'sm', size, weight } = {}) {
  const o = kit.label(html, pos instanceof THREE.Vector3 ? pos.toArray() : pos, { cls, parent });
  const e = o.element;
  if (color) { e.style.color = color; e.style.borderColor = `color-mix(in oklab, ${color} 55%, transparent)`; }
  if (size) e.style.fontSize = `${size}px`;
  if (weight) e.style.fontWeight = weight;
  return o;
}
function showLbl(o, on) { o.element.style.opacity = on ? 1 : 0; o.element.style.pointerEvents = on ? '' : 'none'; }

/** Ball-and-stick from PDB atom records [chain, resSeq, resName, name, element, x, y, z]. */
function pdbAtoms(atoms, center, { r = 0.42, stick = 0.15, color } = {}) {
  const g = new THREE.Group();
  const mats = {};
  const mat = (hex) => (mats[hex] ||= glossy(hex));
  const pos = atoms.map((a) => new THREE.Vector3(a[5], a[6], a[7]).sub(center));
  const meshes = atoms.map((a, i) => {
    const m = new THREE.Mesh(BALL, mat(color?.(a) ?? ELC[a[4]] ?? 0xff2d55));
    m.scale.setScalar(r);
    m.position.copy(pos[i]);
    g.add(m);
    return m;
  });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    if (pos[i].distanceTo(pos[j]) > 1.75) continue;
    const mid = pos[i].clone().add(pos[j]).multiplyScalar(0.5);
    [[pos[i], meshes[i]], [pos[j], meshes[j]]].forEach(([p, am]) => {
      const st = new THREE.Mesh(STICK, am.material);
      st.position.copy(p).add(mid).multiplyScalar(0.5);
      st.scale.set(stick, p.distanceTo(mid), stick);
      st.quaternion.setFromUnitVectors(up, mid.clone().sub(p).normalize());
      g.add(st);
    });
  }
  g.userData = { pos, meshes, atoms, mats };
  return g;
}
/** Dashed bond (hydrogen bond) as short cylinders. */
function dashes(a, b, mat, { r = 0.09, dash = 0.34, gap = 0.24 } = {}) {
  const g = new THREE.Group();
  const L = a.distanceTo(b), dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  for (let s0 = 0.18; s0 < L - 0.18; s0 += dash + gap) {
    const len = Math.min(dash, L - 0.18 - s0);
    const m = new THREE.Mesh(STICK, mat);
    m.position.copy(a).addScaledVector(dir, s0 + len / 2);
    m.scale.set(r, len, r);
    m.quaternion.copy(q);
    g.add(m);
  }
  return g;
}
function subChains(pdb, ranges, ssOverride) {
  const c = pdb.chains[0];
  return {
    het: [],
    chains: ranges.map(([a, b], k) => {
      const idx = [];
      c.res.forEach((r, i) => { if (r[0] >= a && r[0] <= b) idx.push(i); });
      return { id: 'ABCDEFGH'[k], res: idx.map((i) => c.res[i]), ss: idx.map((i) => ssOverride || c.ss[i]).join('') };
    }),
  };
}
function feGlows(pdb, prot, color = 0xff6b3d, size = 7) {
  const c = prot.userData.center;
  const out = [];
  pdb.het.forEach((het) => {
    if (het.name !== 'HEM') return;
    het.atoms.forEach((a) => {
      if (a[0] !== 'Fe') return;
      const sp = glowSprite(color, size);
      sp.position.set(a[2] - c.x, a[3] - c.y, a[4] - c.z);
      prot.add(sp);
      out.push(sp);
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
const SLOS = [
  { c: 'L.3.1', t: 'Define & draw an amino acid', full: 'Define amino acids including their general structure.' },
  { c: 'L.3.2', t: 'The 20 common amino acids', full: 'List and name the 20 amino acids that commonly occur in proteins.', flag: 'textbook', src: 'The slides never list the 20 — see the explorer (members from Lippincott)' },
  { c: 'L.3.3', t: 'Classify amino acids', full: 'Classify amino acids based on side-chain structure, polarity, metabolic fate, and nutritional value.' },
  { c: 'L.3.4', t: 'Amphoteric · zwitterion · pI', full: 'Define key terms related to amino acid chemistry, including essential amino acids, amphoteric nature, zwitterions, and isoelectric pH.' },
  { c: 'L.3.5', t: 'Biologically important peptides', full: 'Discuss biologically important peptides.', flag: 'not on slides', src: 'No slide content for this outcome — revise it from the textbook' },
  { c: 'L.4.1', t: 'Define proteins', full: 'Define proteins.' },
  { c: 'L.4.2', t: 'Properties · denaturation', full: 'Distinguish proteins based on their physical and chemical properties.' },
  { c: 'L.4.3', t: 'Structure & disease', full: 'Explain the clinical importance of structural organization of proteins (Globular Proteins).' },
  { c: 'L.4.4', t: 'Chaperones & folding', full: 'Define chaperones and their role in protein folding.' },
];

// The 20 standard amino acids. Classes per the lecture's schemes (slides 11–13); membership,
// essential and metabolic fate from Lippincott (the slides list the classes only).
const AA = [
  { key: 'glycine', k3: 'Gly', k1: 'G', name: 'Glycine', str: 'ali', pol: 'np', ab: 'n', ess: 'no', fate: 'g', note: 'Achiral, smallest (slide 4) · helix breaker (slide 22)' },
  { key: 'ala', k3: 'Ala', k1: 'A', name: 'Alanine', str: 'ali', pol: 'np', ab: 'n', ess: 'no', fate: 'g', note: 'The slides’ worked example (slide 3)' },
  { key: 'val', k3: 'Val', k1: 'V', name: 'Valine', str: 'ali', pol: 'np', ab: 'n', ess: 'yes', fate: 'g', note: 'β-branched helix breaker (slide 22)' },
  { key: 'leu', k3: 'Leu', k1: 'L', name: 'Leucine', str: 'ali', pol: 'np', ab: 'n', ess: 'yes', fate: 'k' },
  { key: 'ile', k3: 'Ile', k1: 'I', name: 'Isoleucine', str: 'ali', pol: 'np', ab: 'n', ess: 'yes', fate: 'b', note: 'β-branched helix breaker (slide 22)' },
  { key: 'pro', k3: 'Pro', k1: 'P', name: 'Proline', str: 'imino', pol: 'np', ab: 'n', ess: 'no', fate: 'g', note: 'Imino acid (slide 4) · helix breaker (slide 22)' },
  { key: 'phe', k3: 'Phe', k1: 'F', name: 'Phenylalanine', str: 'aro', pol: 'np', ab: 'n', ess: 'yes', fate: 'b' },
  { key: 'tyr', k3: 'Tyr', k1: 'Y', name: 'Tyrosine', str: 'aro', pol: 'pu', ab: 'n', ess: 'no', fate: 'b', note: 'Aromatic with –OH: Lippincott calls it polar uncharged, although slide 12 calls aromatics non-polar' },
  { key: 'trp', k3: 'Trp', k1: 'W', name: 'Tryptophan', str: 'aro', pol: 'np', ab: 'n', ess: 'yes', fate: 'b' },
  { key: 'ser', k3: 'Ser', k1: 'S', name: 'Serine', str: 'oh', pol: 'pu', ab: 'n', ess: 'no', fate: 'g', note: 'Polar helix breaker (slide 22)' },
  { key: 'thr', k3: 'Thr', k1: 'T', name: 'Threonine', str: 'oh', pol: 'pu', ab: 'n', ess: 'yes', fate: 'b', note: 'β-branched helix breaker (slide 22)' },
  { key: 'cys', k3: 'Cys', k1: 'C', name: 'Cysteine', str: 's', pol: 'pu', ab: 'n', ess: 'no', fate: 'g', note: 'Two Cys form a disulfide bond (slide 23)' },
  { key: 'met', k3: 'Met', k1: 'M', name: 'Methionine', str: 's', pol: 'np', ab: 'n', ess: 'yes', fate: 'g' },
  { key: 'asp', k3: 'Asp', k1: 'D', name: 'Aspartate', str: 'cooh', pol: 'neg', ab: 'a', ess: 'no', fate: 'g', note: 'Polar helix breaker (slide 22)' },
  { key: 'glu', k3: 'Glu', k1: 'E', name: 'Glutamate', str: 'cooh', pol: 'neg', ab: 'a', ess: 'no', fate: 'g' },
  { key: 'asn', k3: 'Asn', k1: 'N', name: 'Asparagine', str: 'amide', pol: 'pu', ab: 'n', ess: 'no', fate: 'g', note: 'Polar helix breaker (slide 22)' },
  { key: 'gln', k3: 'Gln', k1: 'Q', name: 'Glutamine', str: 'amide', pol: 'pu', ab: 'n', ess: 'no', fate: 'g' },
  { key: 'lys', k3: 'Lys', k1: 'K', name: 'Lysine', str: 'nh2', pol: 'pos', ab: 'b', ess: 'yes', fate: 'k' },
  { key: 'arg', k3: 'Arg', k1: 'R', name: 'Arginine', str: 'nh2', pol: 'pos', ab: 'b', ess: 'cond', fate: 'g', note: 'Guanidino group — basic, though not strictly an “amino” group' },
  { key: 'his', k3: 'His', k1: 'H', name: 'Histidine', str: 'nh2', pol: 'pos', ab: 'b', ess: 'yes', fate: 'g', note: 'Imidazole group; only weakly basic (textbook)' },
];
const SCHEMES = {
  str: { t: 'Side chain', note: 'Classes: slide 11 · members: Lippincott (the slides list no amino acids)', cls: {
    ali: ['Aliphatic', '#ff9f0a', '“Classic (aliphatic)”: R has only C and H in an open chain. Generally hydrophobic — more carbons, more hydrophobic.'],
    aro: ['Aromatic', '#bf5af2', 'R contains an aromatic ring.'],
    s: ['Sulfur', '#e6c200', 'Sulfur-containing R group.'],
    oh: ['Hydroxyl', '#40c8e0', 'Hydroxyl (–OH)-containing R group.'],
    cooh: ['Carboxyl', '#ff453a', 'Carboxyl-containing R group (acidic).'],
    nh2: ['Amino', '#0a84ff', 'Amino-containing (basic) R group.'],
    amide: ['Amide', '#30d158', '“Amidic neutral”: R ends in an amide, –CO–NH₂ (written “CO=NH2” on slide 11).'],
    imino: ['Imino', '#c9a26b', 'Proline is not placed in slide 11’s seven classes; slide 4 calls it an imino acid (N in a ring).'],
  } },
  pol: { t: 'Polarity', note: 'Rule: slide 12 · members: Lippincott', cls: {
    np: ['Non-polar', '#ff9f0a', 'R has only C–H bonds (slide: aliphatic and aromatic). Lippincott also places Met here.'],
    pu: ['Polar, uncharged', '#30d158', 'R has O or N bonded to H → partial charges, interacts with water. Lippincott also places Tyr and Cys here.'],
    neg: ['Charged −', '#ff453a', 'R carries a formal negative charge.'],
    pos: ['Charged +', '#0a84ff', 'R carries a formal positive charge.'],
  } },
  ab: { t: 'Acid–base', note: 'Rule: slide 13 · members: Lippincott', cls: {
    a: ['Acidic', '#ff453a', 'Extra carboxyl group in R → donates protons.'],
    b: ['Basic', '#0a84ff', 'Extra amino (nitrogen) group in R → accepts protons.'],
    n: ['Neutral', '#8e8e93', 'No extra acidic or basic group in R.'],
  } },
  ess: { t: 'Essential*', note: '*Only a heading on slide 13 — list from Lippincott', cls: {
    yes: ['Essential', '#30d158', 'Cannot be made in the body → must come from the diet.'],
    cond: ['Conditionally', '#ff9f0a', 'Arginine: needed from the diet during growth (textbook).'],
    no: ['Non-essential', '#8e8e93', 'Made in the body.'],
  } },
  fate: { t: 'Fate*', note: '*Only a heading on slide 13 — groups from Lippincott', cls: {
    g: ['Glucogenic', '#5ac8fa', 'Carbon skeleton can be used to make glucose.'],
    b: ['Both', '#bf5af2', 'Glucogenic and ketogenic.'],
    k: ['Ketogenic only', '#ff9f0a', 'Leucine and lysine.'],
  } },
};
const strCol = (k3) => { const a = AA.find((x) => x.k3 === k3); return SCHEMES.str.cls[a.str][1]; };
const darkText = (hex) => { const n = parseInt(hex.slice(1), 16); const L = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return L > 150; };

/* ------------------------------------------------------------------ */
/* Slide visuals                                                       */
/* ------------------------------------------------------------------ */

// 1 · Hero: real hemoglobin
async function heroViz(el) {
  const kit = createScene(el, { cam: [0, 0, 150], autoRotate: 0.55, fov: 30 });
  const pdb = await loadPDB('4HHB');
  const prot = buildProtein(pdb, { colorBy: (ci) => (ci % 2 ? 0x4f4ce8 : 0xa23ee0), hets: ['HEM'], hetColor: 0xff2d55, hetScale: 1.2 });
  prot.rotation.x = 0.35;
  kit.root.add(prot);
  const glows = feGlows(pdb, prot, 0xff6b3d, 9);
  kit.onFrame((dt, t) => glows.forEach((g, i) => g.scale.setScalar(8 + 2.4 * Math.sin(t * 1.6 + i * 1.4))));
  fitBox(kit, prot, 0.9, { spin: true });
  kit.label('Hemoglobin · α<sub>2</sub>β<sub>2</sub> · PDB 4HHB', [0, -37, 0], { cls: 'sm plain' });
  return kitController(kit);
}

// 2 · SLOs
function sloViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '44px';
  el.style.alignContent = 'center';
  const rows = [];
  const col = (head, list, off) => {
    const c = h('div', { style: 'display:flex;flex-direction:column;gap:14px' });
    c.append(h('div', { style: 'font-size:24px;font-weight:650;letter-spacing:.16em;text-transform:uppercase;color:var(--fg-3);margin:0 0 4px 8px', html: head }));
    list.forEach((o, i) => {
      const flag = o.flag ? h('span', { style: 'font-size:21px;font-weight:600;color:var(--fg-2);padding:6px 14px;border-radius:999px;border:1.5px dashed var(--line-2);white-space:nowrap', text: o.flag }) : h('span');
      const row = h('div', { style: 'display:grid;grid-template-columns:92px 1fr auto;align-items:center;gap:20px;padding:15px 26px;border-radius:26px;background:var(--surface);border:1px solid var(--line);cursor:help' }, [
        h('div.grad-text', { style: 'font-size:50px;font-weight:720;letter-spacing:-.04em;line-height:1', text: String(off + i + 1).padStart(2, '0') }),
        h('div', {}, [
          h('div', { style: 'font-size:21px;font-weight:650;letter-spacing:.12em;color:var(--ink);margin-bottom:2px', text: o.c }),
          h('div', { style: 'font-size:33px;font-weight:620;letter-spacing:-.015em;line-height:1.15', html: o.t }),
        ]),
        flag,
      ]);
      tip(row, { kicker: `SLO ${o.c}`, title: o.t, body: o.full, src: o.src || 'Lecture slides 2, 16' });
      c.append(row);
      rows.push(row);
    });
    return c;
  };
  el.append(col('L.3 · Amino acids', SLOS.slice(0, 5), 0), col('L.4 · Proteins', SLOS.slice(5), 5));
  return { enter() { gsap.fromTo(rows, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.05, delay: 0.25 }); } };
}

// 3 · General structure: L-alanine with its four groups
async function structureViz(el) {
  const kit = createScene(el, { cam: [0, 1.2, 18], autoRotate: 0, fov: 30 });
  const data = await loadMol('ala');
  const mol = buildMolecule(data, { hideH: false, scale: 1.12 });
  const g = fischer(mol, 3, 5, 4);
  kit.root.add(g);
  mol.userData.atomMeshes.forEach((m) => { if (m) m.material = m.material.clone(); });
  const G = [
    { atoms: [3], hex: 0xbf5af2, css: 'var(--ink)', html: 'C<sub>α</sub>', step: 0 },
    { atoms: [2, 10, 11], hex: 0x3a82ff, css: AM, html: '–NH<sub>2</sub> · amino', step: 1 },
    { atoms: [5, 0, 1, 12], hex: 0xff453a, css: AC, html: '–COOH · carboxyl', step: 2 },
    { atoms: [6], hex: 0x30d158, css: HC, html: '–H', step: 3 },
    { atoms: [4, 7, 8, 9], hex: 0xbf5af2, css: RC, html: 'R = –CH<sub>3</sub>', step: 4 },
  ];
  G.forEach((grp) => {
    const pts = grp.atoms.map((i) => wpos(mol, i));
    const c = centroid(pts);
    const lp = grp.step ? outward(c, grp.step === 3 ? 1.0 : 1.5) : new THREE.Vector3(0.15, -0.55, 1.6);
    grp.lbl = tag(kit, grp.html, lp, g, { color: grp.css, cls: '', size: 28 });
    grp.halo = glowSprite(grp.hex, grp.atoms.length > 1 ? 3.4 : 2.2);
    grp.halo.position.copy(c);
    grp.halo.material.opacity = 0;
    g.add(grp.halo);
  });
  kit.onFrame((dt, t) => { g.rotation.y = 0.5 * Math.sin(t * 0.45); });
  fitBox(kit, g, 0.6, { spin: true });
  const apply = (n) => {
    G.forEach((grp) => {
      const on = n >= grp.step;
      const cur = grp.step === n && n > 0;
      showLbl(grp.lbl, on);
      gsap.to(grp.halo.material, { opacity: cur ? 0.8 : on && grp.step ? 0.3 : 0, duration: 0.6 });
      grp.atoms.forEach((i) => {
        const m = mol.userData.atomMeshes[i];
        if (!m) return;
        m.material.emissive.setHex(grp.hex);
        gsap.to(m.material, { emissiveIntensity: cur ? 0.6 : 0, duration: 0.6 });
      });
    });
  };
  apply(0);
  return kitController(kit, { step: apply });
}

// 4 · Chirality: L vs D mirror pair, glycine superimposes
async function chiralViz(el) {
  const kit = createScene(el, { cam: [0, 3.2, 30], autoRotate: 0, fov: 27 });
  const [dAla, dGly] = await Promise.all([loadMol('ala'), loadMol('glycine')]);
  const X = 3.5;
  const make = (data, iC, iU, iD, mirror, labels) => {
    const mol = buildMolecule(data, { hideH: false, scale: 1.1 });
    const fg = fischer(mol, iC, iU, iD);
    const mg = new THREE.Group();
    mg.add(fg);
    if (mirror) mg.scale.x = -1; // exact mirror image through a vertical plane
    const outer = new THREE.Group();
    outer.add(mg);
    outer.position.x = mirror ? X : -X;
    ownMats(outer);
    kit.root.add(outer);
    const lbls = labels.map(([i, html, css]) => tag(kit, html, outward(wpos(mol, i), 1.05), fg, { color: css, size: 24 }));
    return { outer, lbls };
  };
  const L = make(dAla, 3, 5, 4, false, [[2, 'NH<sub>2</sub>', AM], [6, 'H', HC]]);
  const Dd = make(dAla, 3, 5, 4, true, [[2, 'NH<sub>2</sub>', AM], [6, 'H', HC]]);
  const G1 = make(dGly, 3, 4, 2, false, [[5, 'H', HC], [6, 'H', HC]]);
  const G2 = make(dGly, 3, 4, 2, true, [[5, 'H', HC], [6, 'H', HC]]);
  [G1, G2].forEach((m) => m.outer.scale.setScalar(0.001));

  // Glowing mirror plane
  const mirror = new THREE.Group();
  const pg = new THREE.PlaneGeometry(7.2, 7.6);
  const plane = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xbf5af2, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(pg), new THREE.LineBasicMaterial({ color: 0xd9a6ff, transparent: true, opacity: 0.85 }));
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.7), new THREE.MeshBasicMaterial({ color: 0xe0b3ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mirror.add(plane, edges, sweep);
  mirror.rotation.y = Math.PI / 2;
  kit.root.add(mirror);
  const mLbl = tag(kit, 'mirror plane', [0, 4.3, 0], kit.root, { cls: 'sm plain', color: 'var(--ink)' });
  const nameL = tag(kit, 'L-alanine', [-X, -3.9, 0], kit.root, { cls: '', size: 30, weight: 680 });
  const nameR = tag(kit, 'D-alanine', [X, -3.9, 0], kit.root, { cls: '', size: 30, weight: 680 });
  const verdict = tag(kit, '', [-X, 3.7, 0], kit.root, { cls: '', size: 28, weight: 680 });
  kit.root.rotation.y = -0.5;
  fitBox(kit, kit.root, 0.8);
  kit.onFrame((dt, t) => {
    sweep.position.y = ((t * 1.5) % 7.2) - 3.6;
    kit.root.rotation.y = -0.5 + 0.16 * Math.sin(t * 0.4);
  });

  const pop = (m, on) => gsap.to(m.outer.scale, { x: on ? 1 : 0.001, y: on ? 1 : 0.001, z: on ? 1 : 0.001, duration: on ? 0.7 : 0.4, ease: on ? 'back.out(1.5)' : 'power2.in' });
  const apply = (n) => {
    const ala = n < 2;
    pop(L, ala); pop(Dd, ala); pop(G1, !ala); pop(G2, !ala);
    gsap.to(Dd.outer.position, { x: n === 1 ? -X : X, duration: 1.4, ease: 'power3.inOut' });
    gsap.to(G2.outer.position, { x: n === 3 ? -X : X, duration: 1.4, ease: 'power3.inOut' });
    setAlpha(Dd.outer, n === 1 ? 0.55 : 1);
    setAlpha(G2.outer, n === 3 ? 0.5 : 1);
    L.lbls.forEach((l) => showLbl(l, ala));
    Dd.lbls.forEach((l, k) => showLbl(l, ala && (n === 0 || k === 0)));
    L.lbls[1] && showLbl(L.lbls[1], n === 0);
    G1.lbls.forEach((l) => showLbl(l, !ala));
    G2.lbls.forEach((l) => showLbl(l, n === 2));
    nameL.element.innerHTML = ala ? 'L-alanine' : 'Glycine';
    nameR.element.innerHTML = ala ? 'D-alanine' : 'Its mirror image';
    showLbl(nameR, n === 0 || n === 2);
    const over = n === 1 || n === 3;
    showLbl(verdict, over);
    verdict.element.innerHTML = n === 1 ? '✕ NH<sub>2</sub> and H swap — never superimposable' : '✓ Superimposable · achiral';
    verdict.element.style.color = n === 1 ? 'var(--inh)' : 'var(--act)';
    verdict.element.style.borderColor = `color-mix(in oklab, ${n === 1 ? 'var(--inh)' : 'var(--act)'} 55%, transparent)`;
    showLbl(mLbl, !over);
  };
  apply(0);

  const chips = h('div', { style: 'position:absolute;left:0;bottom:0;display:flex;gap:14px;z-index:3' });
  [
    ['Proteins use L-forms', 'acc', { title: 'Why L?', body: 'Amino acids in proteins are almost always <b>L</b>: the enzymes of protein synthesis evolved to use only L-enantiomers.', src: SRC(5) }],
    ['D-forms → stable drugs', 'acc', { title: 'D-amino acids in drugs', body: 'Less susceptible to enzymatic processing → more stable → built into <b>peptide drugs</b> to increase their stability.', src: SRC(5) }],
    ['D/L ≠ direction of rotation', 'inh', { kicker: 'Accuracy note', title: 'D/L is configuration, not rotation', body: 'Slide 4 says D and L rotate polarised light right and left. Textbooks define D/L as the configuration relative to glyceraldehyde; the sign of rotation (+/−) is measured separately — L-alanine is actually (+).', src: 'Slide 4 · standard textbooks' }],
  ].forEach(([t, c, sp]) => { const e = h(`span.chip.${c}`, { style: 'font-size:24px;padding:10px 20px;cursor:help', text: t }); tip(e, sp); chips.append(e); });
  el.append(chips);
  return kitController(kit, { step: apply });
}

// 5 · α- vs β-alanine and proline
async function variantsViz(el) {
  const kit = createScene(el, { cam: [0, 0.6, 36], autoRotate: 0, fov: 26 });
  const defs = [
    { key: 'ala', iC: 3, iU: 5, iD: 4, x: -9.5, name: 'α-Alanine', sub: 'NH₂ on C<sub>α</sub>', labels: [[3, 'C<sub>α</sub>', 'var(--ink)', 1], [4, 'C<sub>β</sub>', 'var(--prot)', 1], [2, 'NH<sub>2</sub>', AM, 1]], hl: [2, 10, 11], hex: 0x3a82ff },
    { key: 'beta-ala', iC: 3, iU: 5, iD: 4, x: 0, name: 'β-Alanine', sub: 'NH₂ on C<sub>β</sub>', labels: [[3, 'C<sub>α</sub>', 'var(--ink)', 1], [4, 'C<sub>β</sub>', 'var(--prot)', 1], [2, 'NH<sub>2</sub>', AM, 1, [1.9, 0.2, 0]]], hl: [2, 10, 11], hex: 0x3a82ff },
    { key: 'pro', iC: 3, iU: 7, iD: 4, x: 9.5, name: 'Proline', sub: 'Imino acid · N in a ring', labels: [[3, 'C<sub>α</sub>', 'var(--ink)', 2], [2, 'N–H', AM, 2]], hl: [2, 3, 4, 5, 6], hex: 0xbf5af2 },
  ];
  const items = await Promise.all(defs.map(async (d) => {
    const data = await loadMol(d.key);
    const mol = buildMolecule(data, { hideH: false, scale: 1.08 });
    const fg = fischer(mol, d.iC, d.iU, d.iD);
    const wrap = new THREE.Group();
    wrap.add(fg);
    wrap.position.x = d.x;
    kit.root.add(wrap);
    const name = tag(kit, `${d.name}<div style="font-size:24px;color:var(--fg-2);font-weight:520;margin-top:4px">${d.sub}</div>`, [d.x, -4.3, 0], kit.root, { cls: 'plain', size: 34, weight: 700 });
    name.element.style.textAlign = 'center';
    const lbls = d.labels.map(([i, html, css, st, off]) => { const o = tag(kit, html, off ? wpos(mol, i).add(V3(off)) : outward(wpos(mol, i), 1.25), fg, { color: css, size: 24 }); o._st = st; return o; });
    const halo = glowSprite(d.hex, d.hl.length > 3 ? 4.6 : 3);
    halo.position.copy(centroid(d.hl.map((i) => wpos(mol, i))));
    halo.material.opacity = 0;
    fg.add(halo);
    return { fg, lbls, halo, d };
  }));
  kit.onFrame((dt, t) => items.forEach((it, k) => { it.fg.rotation.y = 0.55 * Math.sin(t * 0.5 + k * 1.2); }));
  fitBox(kit, kit.root, 0.78, { lift: -0.6 });
  const apply = (n) => items.forEach((it, k) => {
    const st = k < 2 ? 1 : 2;
    it.lbls.forEach((l) => showLbl(l, n >= l._st));
    gsap.to(it.halo.material, { opacity: n >= st ? 0.7 : 0, duration: 0.6 });
  });
  apply(0);
  return kitController(kit, { step: apply });
}

// 6 · Amphoteric → zwitterion (intramolecular proton hop, schematic)
function amphoViz(el) {
  const D = diagram(el, 960, 860);
  const B = D.layers.edges, A = D.layers.nodes;
  const bond = (a, b) => lineEl(B, a, b);
  const P = { ca: [480, 380], ha: [480, 250], r: [480, 510], n: [320, 380], h1: [232, 318], h2: [232, 442], h3: [320, 250], c: [640, 380], o1: [722, 478], o2: [722, 282], hx: [806, 228] };
  bond(P.ca, P.ha); bond(P.ca, P.r); bond(P.ca, P.n); bond(P.n, P.h1); bond(P.n, P.h2); bond(P.ca, P.c); bond(P.c, P.o2);
  lineEl(B, [P.c[0] + 8, P.c[1] - 6], [P.o1[0] + 8, P.o1[1] - 6]); lineEl(B, [P.c[0] - 8, P.c[1] + 6], [P.o1[0] - 8, P.o1[1] + 6]);
  const bOH = bond(P.o2, P.hx);
  const bNH = bond(P.n, P.h3);
  bNH.style.opacity = 0;
  atomG(A, ...P.ca, 'C_{α}', RC, 42, { fs: 32 });
  atomG(A, ...P.ha, 'H', HC, 28);
  atomG(A, ...P.r, 'R', RC, 38);
  atomG(A, ...P.n, 'N', AM, 40);
  atomG(A, ...P.h1, 'H', AM, 28);
  atomG(A, ...P.h2, 'H', AM, 28);
  atomG(A, ...P.c, 'C', AC, 38);
  atomG(A, ...P.o1, 'O', AC, 36);
  atomG(A, ...P.o2, 'O', AC, 36);
  // charges
  const chg = (x, y, t, col) => { const g = s('g', { transform: `translate(${x} ${y})`, style: 'opacity:0' }); g.append(s('circle', { r: 24, style: `fill:${col}` })); const tx = s('text', { y: 11, 'text-anchor': 'middle', style: 'font:800 32px var(--font);fill:#fff' }); tx.textContent = t; g.append(tx); D.layers.labels.append(g); return g; };
  const plus = chg(180, 380, '+', AM);
  const minus = chg(792, 336, '−', AC);
  // proton
  const path = s('path', { d: 'M806,228 C760,40 380,40 320,250', style: 'fill:none;stroke:var(--prot);stroke-width:3;stroke-dasharray:4 12;opacity:0' });
  D.layers.fx.append(path);
  const PL = path.getTotalLength();
  const proton = s('g');
  const pc = s('circle', { r: 28, filter: `url(#${D.glowId})`, style: 'stroke-width:3' });
  const pt = s('text', { y: 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:800;fill:var(--fg)' });
  proton.append(pc, pt);
  D.layers.labels.append(proton);
  const pr = { t: 0 };
  const place = () => {
    const p = path.getPointAtLength(pr.t * PL);
    proton.setAttribute('transform', `translate(${p.x} ${p.y})`);
    const mid = pr.t > 0.03 && pr.t < 0.97;
    const col = pr.t >= 0.97 ? AM : mid ? 'var(--prot)' : AC;
    pc.setAttribute('style', `fill:color-mix(in oklab, ${col} ${mid ? 60 : 20}%, var(--bg));stroke:${col};stroke-width:3`);
    setRich(pt, mid ? 'H^{+}' : 'H');
    bOH.style.opacity = Math.max(0, 1 - pr.t * 8);
    bNH.style.opacity = Math.max(0, pr.t * 8 - 7);
  };
  place();
  // captions
  const capB = D.text(250, 610, 'basic · accepts H⁺', { anchor: 'middle', style: `fill:${AM};font-weight:650` });
  const capA = D.text(722, 610, 'acidic · donates H⁺', { anchor: 'middle', style: `fill:${AC};font-weight:650` });
  const formula = D.text(480, 690, 'H_{2}N–CH(R)–COOH', { anchor: 'middle', style: 'font-size:40px;font-weight:650;fill:var(--fg)' });
  // definition cards
  const card = (x, k, line, col) => {
    const g = s('g');
    const r = s('rect', { x, y: 740, width: 445, height: 116, rx: 28, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2;transition:all .5s' });
    g.append(r);
    const t1 = s('text', { x: x + 30, y: 784, class: 'v-label sm', style: `fill:${col};font-weight:700;letter-spacing:.14em` }); t1.textContent = k;
    const t2 = s('text', { x: x + 30, y: 828, class: 'v-label', style: 'font-size:27px;fill:var(--fg-2)' }); setRich(t2, line);
    g.append(t1, t2);
    D.layers.labels.append(g);
    return r;
  };
  const cA = card(10, 'AMPHOTERIC', 'Greek “both” · acid or base', 'var(--ink)');
  const cZ = card(505, 'ZWITTERION', 'German “hybrid ion” · net 0', 'var(--ink)');
  return {
    step(n) {
      const z = n >= 1;
      gsap.to(pr, { t: z ? 1 : 0, duration: z ? 1.6 : 0.8, ease: 'power2.inOut', onUpdate: place });
      gsap.to(path, { opacity: z ? 0.6 : 0, duration: 0.5 });
      gsap.to([plus, minus], { opacity: z ? 1 : 0, duration: 0.5, delay: z ? 1.3 : 0 });
      gsap.to([capA, capB], { opacity: z ? 0.35 : 1, duration: 0.5 });
      setRich(formula, z ? '^{+}H_{3}N–CH(R)–COO^{−}' : 'H_{2}N–CH(R)–COOH');
      cA.style.stroke = z ? 'var(--line)' : 'var(--a1)';
      cZ.style.stroke = z ? 'var(--a1)' : 'var(--line)';
    },
    destroy: () => D.destroy(),
  };
}

// 7 · pH slider → ionic form, net charge, titration curve (glycine)
function phViz(el) {
  const pK1 = 2.34, pK2 = 9.6, pI = (pK1 + pK2) / 2;
  const f1 = (pH) => 1 / (1 + Math.pow(10, pK1 - pH));
  const f2 = (pH) => 1 / (1 + Math.pow(10, pK2 - pH));
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '620px 1fr';
  el.style.gap = '44px';
  const Lc = h('div', { style: 'position:relative;display:flex;flex-direction:column;gap:22px;padding-bottom:110px' });
  const Rc = h('div', { style: 'position:relative' });
  el.append(Lc, Rc);
  // species boxes
  const spRow = h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:14px' });
  const SP = [['Cation', 'net +1', AC], ['Zwitterion', 'net 0', 'var(--a1)'], ['Anion', 'net −1', AM]];
  const sp = SP.map(([n, q, c]) => {
    const bar = h('div', { style: `height:100%;width:0;background:${c};border-radius:8px` });
    const pct = h('span', { style: 'font:600 21px var(--mono);color:var(--fg-2)' });
    const box = h('div', { style: 'padding:14px 18px;border-radius:22px;border:2px solid var(--line);background:var(--surface);transition:border-color .3s, opacity .3s' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:6px' }, [h('span', { style: `font-size:25px;font-weight:680;color:${c}`, text: n }), pct]),
      h('div', { style: 'font-size:22px;color:var(--fg-2);margin:2px 0 10px', text: q }),
      h('div', { style: 'height:12px;border-radius:8px;background:var(--surface-2);overflow:hidden' }, [bar]),
    ]);
    spRow.append(box);
    return { box, bar, pct, c };
  });
  // structure
  const svHost = h('div', { style: 'position:relative;height:230px' });
  const D = diagram(svHost, 620, 230);
  const gbox = (cx, col) => {
    const g = s('g', { transform: `translate(${cx} 120)` });
    g.append(s('rect', { x: -98, y: -44, width: 196, height: 88, rx: 24, style: `fill:color-mix(in oklab, ${col} 15%, transparent);stroke:color-mix(in oklab, ${col} 60%, transparent);stroke-width:2.5` }));
    const t = s('text', { y: 14, 'text-anchor': 'middle', class: 'v-label', style: `font-size:40px;font-weight:700;fill:${col}` });
    g.append(t);
    D.layers.nodes.append(g);
    return t;
  };
  const tAm = gbox(105, AM);
  const tAc = gbox(515, AC);
  D.text(310, 134, '–CH_{2}–', { anchor: 'middle', style: 'font-size:40px;font-weight:650;fill:var(--fg)' });
  D.text(310, 214, 'glycine · R = H', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3)' });
  const chg = (x, t, col) => { const g = s('g', { transform: `translate(${x} 38)` }); g.append(s('circle', { r: 24, style: `fill:${col}` })); const tx = s('text', { y: 11, 'text-anchor': 'middle', style: 'font:800 32px var(--font);fill:#fff' }); tx.textContent = t; g.append(tx); D.layers.labels.append(g); return g; };
  const cPlus = chg(105, '+', AM);
  const cMinus = chg(515, '−', AC);
  // net charge
  const net = h('div', { style: 'font:740 112px var(--font);letter-spacing:-.05em;line-height:.9;font-variant-numeric:tabular-nums;min-width:330px' });
  const zone = h('div', { style: 'font-size:27px;font-weight:650;padding:10px 22px;border-radius:999px;border:2px solid;align-self:flex-start' });
  const netRow = h('div', { style: 'display:flex;align-items:center;gap:30px' }, [h('div', {}, [net, h('div', { style: 'font-size:24px;color:var(--fg-2);margin-top:8px', text: 'net charge' })]), zone]);
  Lc.append(spRow, svHost, netRow);

  // titration curve
  const C = chart(Rc, { w: 1048, h: 720, pad: { l: 120, b: 100, t: 30, r: 40 }, x: { min: 0, max: 2, label: 'OH⁻ added (equivalents)', ticks: [0, 0.5, 1, 1.5, 2] }, y: { min: 0, max: 14, label: 'pH', ticks: [0, 2, 4, 6, 8, 10, 12, 14] } });
  const eq = (pH) => f1(pH) + f2(pH);
  const band = (pk) => { const r = s('rect', { x: C.sx(0), y: C.sy(pk + 1), width: C.sx(2) - C.sx(0), height: C.sy(pk - 1) - C.sy(pk + 1), style: 'fill:color-mix(in oklab, var(--a1) 13%, transparent)' }); C.plot.prepend(r); return r; };
  band(pK1); band(pK2);
  C.text(1.08, pK1, 'pK₁ 2.3 · buffers: COOH ⇌ COO⁻', { dy: 9, class: 'v-label sm', style: 'fill:var(--ink);font-weight:650' });
  C.text(0.06, pK2, 'pK₂ 9.6 · buffers: NH₃⁺ ⇌ NH₂', { dy: 9, class: 'v-label sm', style: 'fill:var(--ink);font-weight:650' });
  C.hline(pI, { color: 'var(--a1)', dash: '10 10', width: 3 });
  C.text(1.1, pI, 'pI ≈ 6.0 · net charge 0', { dy: -14, class: 'v-label sm', style: 'fill:var(--fg);font-weight:650' });
  const pts = [];
  for (let p = 0.3; p <= 13.7; p += 0.05) pts.push([eq(p), p]);
  const curve = C.line(pts, { color: 'var(--fg)', width: 6 });
  const guide = C.hline(7, { color: 'var(--fg-3)', dash: '4 10', width: 2 });
  const dot = C.point(eq(7), 7, { color: 'var(--a1)', r: 15 });

  const update = (pH) => {
    const a = f1(pH), b = f2(pH);
    const fr = [(1 - a) * (1 - b), a * (1 - b), a * b];
    const tot = fr[0] + fr[1] + fr[2];
    const k = fr.indexOf(Math.max(...fr));
    sp.forEach((o, i) => {
      const v = fr[i] / tot;
      o.bar.style.width = `${(v * 100).toFixed(1)}%`;
      o.pct.textContent = `${Math.round(v * 100)}%`;
      o.box.style.borderColor = i === k ? o.c : 'var(--line)';
      o.box.style.opacity = i === k ? 1 : 0.55;
    });
    tAm.textContent = '';
    setRich(tAm, 1 - b > 0.5 ? 'H_{3}N^{+}' : 'H_{2}N');
    setRich(tAc, a > 0.5 ? 'COO^{−}' : 'COOH');
    cPlus.style.opacity = (1 - b).toFixed(2);
    cMinus.style.opacity = a.toFixed(2);
    const q = (1 - b) - a;
    net.textContent = Math.abs(q) < 0.005 ? '0' : `${q > 0 ? '+' : '−'}${Math.abs(q).toFixed(2)}`;
    net.style.color = q > 0.05 ? AC : q < -0.05 ? AM : 'var(--ink)';
    const nearPI = Math.abs(pH - pI) < 0.3;
    const zc = k === 0 ? AC : k === 2 ? AM : 'var(--a1)';
    zone.textContent = k === 0 ? 'Low pH · acidic' : k === 2 ? 'High pH · basic' : nearPI ? 'pH = pI' : 'Zwitterion range';
    zone.style.color = k === 1 ? 'var(--ink)' : zc;
    zone.style.borderColor = `color-mix(in oklab, ${zc} 55%, transparent)`;
    zone.style.background = `color-mix(in oklab, ${zc} 12%, transparent)`;
    dot.move(eq(pH), pH);
    guide.move(pH);
  };
  const st = { pH: 7 };
  const sl = slider({ label: 'pH', min: 0, max: 14, step: 0.1, value: 7, fmt: (v) => v.toFixed(1), onInput: (v) => { gsap.killTweensOf(st); st.pH = v; update(v); }, width: 380 });
  ctrlBar(Lc, [sl], { left: 0, bottom: 0 });
  update(7);
  const targets = [7, 1, pI, 12];
  return {
    enter() { curve.draw(1.4); },
    step(n) { gsap.to(st, { pH: targets[n] ?? 7, duration: 1.3, ease: 'power2.inOut', onUpdate: () => { sl.set(st.pH, false); update(st.pH); } }); },
    destroy: () => D.destroy(),
  };
}

/* ---------- MCQ reveal (slides 10, 29, 31) ---------- */
function mcqViz(el, { q, sub, opts, ans, why, side }) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 540px';
  el.style.gap = '60px';
  const left = h('div', { style: 'display:flex;flex-direction:column;gap:14px;justify-content:center' });
  left.append(h('div', { style: 'font-size:37px;font-weight:640;letter-spacing:-.015em;line-height:1.24;margin-bottom:6px', html: q }));
  if (sub) left.append(h('div', { style: 'font-size:25px;color:var(--fg-3);margin:-4px 0 6px', html: sub }));
  const rows = opts.map((o, i) => {
    const badge = h('div', { style: 'width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font:700 26px var(--font);border:2px solid var(--line-2);flex:none;transition:all .45s var(--ease)', text: 'abcde'[i] });
    const row = h('div', { style: 'display:flex;align-items:center;gap:22px;padding:13px 24px;border-radius:24px;background:var(--surface);border:2px solid transparent;transition:all .45s var(--ease)' }, [badge, h('div', { style: 'font-size:30px;line-height:1.25', html: o })]);
    left.append(row);
    return { row, badge };
  });
  const expl = h('div', { style: 'font-size:27px;line-height:1.38;color:var(--fg-2);opacity:0;transform:translateY(10px);transition:all .6s var(--ease);padding-left:6px', html: why });
  left.append(expl);
  const right = h('div', { style: 'position:relative' });
  el.append(left, right);
  const sv = side ? side(right) : null;
  return {
    step(n) {
      const on = n >= 1;
      rows.forEach(({ row, badge }, i) => {
        const ok = i === ans;
        row.style.opacity = on && !ok ? 0.38 : 1;
        row.style.borderColor = on && ok ? 'var(--act)' : 'transparent';
        row.style.background = on && ok ? 'color-mix(in oklab, var(--act) 12%, transparent)' : 'var(--surface)';
        badge.style.background = on && ok ? 'var(--act)' : 'transparent';
        badge.style.borderColor = on && ok ? 'var(--act)' : 'var(--line-2)';
        badge.style.color = on && ok ? '#fff' : 'var(--fg)';
        badge.textContent = on && ok ? '✓' : 'abcde'[i];
      });
      expl.style.opacity = on ? 1 : 0;
      expl.style.transform = on ? 'none' : 'translateY(10px)';
      sv?.reveal(on);
    },
    destroy() { sv?.destroy?.(); },
  };
}
function sideTitration(el) {
  const pK1 = 2.34, pK2 = 9.6;
  const f = (pk, p) => 1 / (1 + Math.pow(10, pk - p));
  const C = chart(el, { w: 540, h: 640, pad: { l: 96, b: 90, t: 40, r: 20 }, x: { min: 0, max: 2, label: 'OH⁻ added', ticks: false }, y: { min: 0, max: 14, label: 'pH', ticks: [0, 7, 14] } });
  const bands = [pK1, pK2].map((pk) => { const r = s('rect', { x: C.sx(0), y: C.sy(pk + 1), width: C.sx(2) - C.sx(0), height: C.sy(pk - 1) - C.sy(pk + 1), style: 'fill:var(--act);opacity:.06;transition:opacity .6s' }); C.plot.prepend(r); return r; });
  const pts = [];
  for (let p = 0.3; p <= 13.7; p += 0.05) pts.push([f(pK1, p) + f(pK2, p), p]);
  C.line(pts, { color: 'var(--fg)', width: 6 });
  const l1 = C.text(1.0, pK1, '–COOH buffers', { dy: 9, class: 'v-label sm', style: 'fill:var(--act);font-weight:650;opacity:0;transition:opacity .6s' });
  const l2 = C.text(0.05, pK2, '–NH₃⁺ buffers', { dy: 9, class: 'v-label sm', style: 'fill:var(--act);font-weight:650;opacity:0;transition:opacity .6s' });
  return { reveal(on) { bands.forEach((b) => (b.style.opacity = on ? 0.3 : 0.06)); [l1, l2].forEach((l) => (l.style.opacity = on ? 1 : 0)); } };
}
function sideHelix(el) {
  const D = diagram(el, 540, 640);
  const N = 15, pts = [];
  for (let i = 0; i < N; i++) { const a = i * 100 * DEG; pts.push({ x: 270 + 130 * Math.cos(a), y: 590 - i * 36, z: Math.sin(a) }); }
  D.layers.edges.append(s('path', { d: smooth(pts.map((p) => [p.x, p.y])), style: 'fill:none;stroke:var(--line-2);stroke-width:8;stroke-linecap:round' }));
  const hb = [];
  for (let i = 0; i + 4 < N; i++) {
    const a = pts[i], b = pts[i + 4];
    const l = s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, style: 'stroke:var(--fg-3);stroke-width:3;stroke-dasharray:6 8;opacity:.35;transition:all .6s' });
    D.layers.fx.append(l);
    hb.push(l);
  }
  pts.forEach((p) => D.layers.nodes.append(s('circle', { cx: p.x, cy: p.y, r: 14 + 4 * p.z, style: `fill:var(--a1);opacity:${0.55 + 0.45 * (p.z + 1) / 2}` })));
  const lab = D.text(270, 40, 'C=O ··· H–N · i → i+4', { anchor: 'middle', style: 'fill:var(--ink);font-weight:700;opacity:0;transition:opacity .6s' });
  return { reveal(on) { hb.forEach((l) => { l.style.stroke = on ? 'var(--act)' : 'var(--fg-3)'; l.style.opacity = on ? 1 : 0.35; l.style.strokeWidth = on ? 4 : 3; }); lab.style.opacity = on ? 1 : 0; }, destroy: () => D.destroy() };
}
function sideDenature(el) {
  const D = diagram(el, 540, 640);
  const N = 12;
  const fold = [], open = [];
  for (let i = 0; i < N; i++) {
    const a = i * 100 * DEG;
    fold.push([270 + 90 * Math.cos(a), 470 - i * 26 + 40 * Math.sin(a) * 0.3]);
    open.push([50 + i * 40, 330 + 40 * Math.sin(i * 1.1)]);
  }
  const link = s('path', { style: `fill:none;stroke:${PEP};stroke-width:7;stroke-linecap:round;stroke-linejoin:round` });
  D.layers.edges.append(link);
  const hb = [];
  for (let i = 0; i + 4 < N; i++) { const l = s('line', { style: 'stroke:var(--fg-3);stroke-width:3;stroke-dasharray:6 8' }); D.layers.fx.append(l); hb.push([l, i]); }
  const beads = fold.map(() => { const c = s('circle', { r: 16, style: 'fill:var(--a1)' }); D.layers.nodes.append(c); return c; });
  const lab = D.text(270, 70, 'Peptide bonds intact', { anchor: 'middle', style: `fill:${PEP};font-weight:700;opacity:0` });
  const lab2 = D.text(270, 110, '→ primary structure remains', { anchor: 'middle', style: 'fill:var(--fg-2);font-weight:600;opacity:0' });
  const st = { t: 0 };
  const draw = () => {
    const P = fold.map((p, i) => [p[0] + (open[i][0] - p[0]) * st.t, p[1] + (open[i][1] - p[1]) * st.t]);
    link.setAttribute('d', smooth(P));
    beads.forEach((b, i) => { b.setAttribute('cx', P[i][0]); b.setAttribute('cy', P[i][1]); });
    hb.forEach(([l, i]) => { l.setAttribute('x1', P[i][0]); l.setAttribute('y1', P[i][1]); l.setAttribute('x2', P[i + 4][0]); l.setAttribute('y2', P[i + 4][1]); l.style.opacity = Math.max(0, 0.6 - st.t * 1.5); });
  };
  draw();
  return {
    reveal(on) {
      gsap.to(st, { t: on ? 1 : 0, duration: on ? 1.6 : 0.6, ease: 'power2.inOut', onUpdate: draw });
      gsap.to([lab, lab2], { opacity: on ? 1 : 0, duration: 0.6, delay: on ? 1 : 0 });
    },
    destroy: () => D.destroy(),
  };
}

// 9 · Polarity & acid–base side chains
function polarityViz(el) {
  const D = diagram(el, 960, 860);
  const lp = loops();
  const panels = [];
  const panel = (x, y, w, hh, title, col) => {
    const g = s('g', { style: 'opacity:.12' });
    g.append(s('rect', { x, y, width: w, height: hh, rx: 34, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' }));
    const t = s('text', { x: x + 30, y: y + 50, class: 'v-label sm', style: `fill:${col};font-weight:700;letter-spacing:.12em;text-transform:uppercase` });
    t.textContent = title;
    g.append(t);
    D.layers.regions.append(g);
    panels.push(g);
    return g;
  };
  const defs = s('defs');
  defs.innerHTML = '<radialGradient id="aaN" cx="25%" cy="50%" r="75%"><stop offset="0%" stop-color="#3a82ff" stop-opacity=".75"/><stop offset="100%" stop-color="#3a82ff" stop-opacity=".08"/></radialGradient><radialGradient id="aaH" cx="80%" cy="50%" r="75%"><stop offset="0%" stop-color="#ff453a" stop-opacity=".6"/><stop offset="100%" stop-color="#ff453a" stop-opacity=".06"/></radialGradient>';
  D.svg.prepend(defs);
  // C–H
  const p1 = panel(0, 0, 460, 400, 'C–H · non-polar', 'var(--fg-2)');
  p1.append(s('ellipse', { cx: 170, cy: 210, rx: 110, ry: 80, style: 'fill:color-mix(in oklab, var(--a1) 22%, transparent);stroke:var(--a1);stroke-width:2' }));
  p1.append(s('ellipse', { cx: 300, cy: 210, rx: 88, ry: 66, style: 'fill:color-mix(in oklab, var(--nadh) 22%, transparent);stroke:var(--nadh);stroke-width:2' }));
  const t = (g, x, y, str, st) => { const e = s('text', { x, y, 'text-anchor': 'middle', class: 'v-label', style: st }); setRich(e, str); g.append(e); return e; };
  t(p1, 130, 224, 'C', 'font-size:42px;font-weight:700');
  t(p1, 335, 224, 'H', 'font-size:42px;font-weight:700');
  const e1 = s('g'); e1.append(s('circle', { cx: 0, cy: -11, r: 9, style: 'fill:#ff453a' }), s('circle', { cx: 0, cy: 11, r: 9, style: 'fill:#0a84ff' })); e1.setAttribute('transform', 'translate(236 210)'); p1.append(e1);
  t(p1, 230, 350, 'Shared equally', 'font-size:28px;font-weight:600;fill:var(--fg-2)');
  // N–H
  const p2 = panel(500, 0, 460, 400, 'N–H · polar', 'var(--act)');
  p2.append(s('ellipse', { cx: 670, cy: 210, rx: 110, ry: 80, style: 'fill:url(#aaN);stroke:#3a82ff;stroke-width:2' }));
  p2.append(s('ellipse', { cx: 800, cy: 210, rx: 88, ry: 66, style: 'fill:url(#aaH);stroke:#ff453a;stroke-width:2' }));
  t(p2, 640, 224, 'N', 'font-size:42px;font-weight:700');
  t(p2, 835, 224, 'H', 'font-size:42px;font-weight:700');
  t(p2, 640, 120, 'δ−', `font-size:32px;font-weight:700;fill:${AM}`);
  t(p2, 835, 130, 'δ+', `font-size:32px;font-weight:700;fill:${AC}`);
  const e2 = s('g'); e2.append(s('circle', { cx: 0, cy: -11, r: 9, style: 'fill:#ff453a' }), s('circle', { cx: 0, cy: 11, r: 9, style: 'fill:#0a84ff' })); e2.setAttribute('transform', 'translate(700 210)'); p2.append(e2);
  t(p2, 730, 350, 'Pulled toward N', 'font-size:28px;font-weight:600;fill:var(--fg-2)');
  lp.add(gsap.to(e1, { x: '+=6', duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  lp.add(gsap.to(e2, { x: '-=14', duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  // Acidic side chain
  const p3 = panel(0, 440, 460, 420, 'Acidic R · e.g. Asp', AC);
  const fa = t(p3, 210, 640, '–CH_{2}–COOH', `font-size:40px;font-weight:700;fill:${AC}`);
  const hA = s('g'); hA.append(s('circle', { r: 26, style: 'fill:var(--prot)', filter: `url(#${D.glowId})` }), (() => { const x = s('text', { y: 9, 'text-anchor': 'middle', style: 'font:800 24px var(--font);fill:#1d1d1f' }); x.textContent = 'H⁺'; return x; })()); p3.append(hA);
  t(p3, 230, 790, 'Donates H⁺', 'font-size:30px;font-weight:650;fill:var(--fg)');
  // Basic side chain
  const p4 = panel(500, 440, 460, 420, 'Basic R · e.g. Lys', AM);
  const fb = t(p4, 720, 640, '–(CH_{2})_{4}–NH_{2}', `font-size:40px;font-weight:700;fill:${AM}`);
  const hB = s('g'); hB.append(s('circle', { r: 26, style: 'fill:var(--prot)', filter: `url(#${D.glowId})` }), (() => { const x = s('text', { y: 9, 'text-anchor': 'middle', style: 'font:800 24px var(--font);fill:#1d1d1f' }); x.textContent = 'H⁺'; return x; })()); p4.append(hB);
  t(p4, 730, 790, 'Accepts H⁺', 'font-size:30px;font-weight:650;fill:var(--fg)');
  const tlA = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
  tlA.set(hA, { x: 372, y: 630, opacity: 1 }).call(() => setRich(fa, '–CH_{2}–COOH')).to(hA, { x: 400, y: 520, opacity: 1, duration: 1.2, ease: 'power2.out', delay: 0.6 }).call(() => setRich(fa, '–CH_{2}–COO^{−}'), null, '<0.1').to(hA, { opacity: 0, duration: 0.5, delay: 0.5 });
  const tlB = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
  tlB.set(hB, { x: 900, y: 520, opacity: 0 }).call(() => setRich(fb, '–(CH_{2})_{4}–NH_{2}')).to(hB, { opacity: 1, duration: 0.4 }).to(hB, { x: 890, y: 630, duration: 1.2, ease: 'power2.in' }).call(() => setRich(fb, '–(CH_{2})_{4}–NH_{3}^{+}')).to(hB, { opacity: 0, duration: 0.3 }).to({}, { duration: 1.2 });
  lp.add(tlA); lp.add(tlB);
  return {
    step(n) { panels.forEach((p, i) => gsap.to(p, { opacity: n === 0 ? 0.3 : i < n ? (i === n - 1 ? 1 : 0.55) : 0.12, duration: 0.6 })); },
    enter: () => lp.play(), leave: () => lp.pause(),
    destroy() { lp.kill(); D.destroy(); },
  };
}

// 10 · Classification explorer
function sideChainSet(data) {
  const at = data.atoms, nb = at.map(() => []);
  data.bonds.forEach(([a, b]) => { nb[a].push(b); nb[b].push(a); });
  let cc = -1, ca = -1, n = -1;
  for (let i = 0; i < at.length; i++) {
    if (at[i][0] !== 'C') continue;
    if (nb[i].filter((j) => at[j][0] === 'O').length !== 2) continue;
    const cand = nb[i].find((j) => at[j][0] === 'C' && nb[j].some((k) => at[k][0] === 'N'));
    if (cand !== undefined) { cc = i; ca = cand; n = nb[cand].find((k) => at[k][0] === 'N'); break; }
  }
  const bb = new Set([cc, ca, n]);
  nb[cc].forEach((o) => { if (at[o][0] === 'O') { bb.add(o); nb[o].forEach((x) => at[x][0] === 'H' && bb.add(x)); } });
  nb[n].forEach((x) => at[x][0] === 'H' && bb.add(x));
  const hs = nb[ca].filter((x) => at[x][0] === 'H');
  hs.forEach((x) => bb.add(x));
  const sc = new Set(at.map((_, i) => i).filter((i) => !bb.has(i)));
  if (!sc.size && hs.length === 2) sc.add(hs[1]); // glycine: R = H
  return sc;
}
async function explorerViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1040px 1fr';
  el.style.gap = '44px';
  const left = h('div', { style: 'display:flex;flex-direction:column;gap:16px;min-height:0' });
  const right = h('div', { style: 'position:relative' });
  el.append(left, right);
  let scheme = 'str', sel = 1;
  const legend = h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px 12px;align-content:flex-start' });
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:108px;gap:12px' });
  const note = h('div', { style: 'font-size:22px;color:var(--fg-3);margin-top:auto' });
  const sg = seg({ options: Object.entries(SCHEMES).map(([v, o]) => ({ v, t: o.t })), value: 'str', onChange: (v) => { scheme = v; paint(); select(sel); } });
  sg.el.style.alignSelf = 'flex-start';
  left.append(sg.el, legend, grid, note);
  const tiles = AA.map((a, i) => {
    const tl = h('div', { style: 'border-radius:22px;padding:10px 18px;display:flex;flex-direction:column;justify-content:center;cursor:pointer;border:2px solid var(--line);transition:background .5s, border-color .5s, box-shadow .3s, transform .3s' }, [
      h('div', { style: 'font-size:36px;font-weight:720;letter-spacing:-.02em;line-height:1.05', html: `${a.k3}<span style="font-size:24px;color:var(--fg-3);font-weight:600;margin-left:10px">${a.k1}</span>` }),
      h('div', { style: 'font-size:22px;color:var(--fg-2);margin-top:4px;white-space:nowrap', text: a.name }),
    ]);
    tl.addEventListener('click', () => select(i));
    const c = (k) => SCHEMES[k].cls[a[k]][0];
    tip(tl, { kicker: `${a.k3} · ${a.k1}`, title: a.name, list: [`Side chain: <b>${c('str')}</b>`, `Polarity: <b>${c('pol')}</b>`, `Acid–base: <b>${c('ab')}</b>`, `Essential*: <b>${c('ess')}</b>`, `Fate*: <b>${c('fate')}</b>`, ...(a.note ? [a.note] : [])], src: 'Classes: slides 11–13 · members, *essential and fate: Lippincott' });
    grid.append(tl);
    return tl;
  });
  const capName = h('div', { style: 'font-size:46px;font-weight:720;letter-spacing:-.02em;text-align:center' });
  const capCls = h('div', { style: 'font-size:27px;font-weight:620;text-align:center;margin-top:6px' });
  const cap = h('div', { style: 'position:absolute;left:0;right:0;top:0;z-index:2;pointer-events:none' }, [capName, capCls]);
  const foot = h('div', { style: 'position:absolute;left:0;bottom:0;font-size:22px;color:var(--fg-3);z-index:2', text: 'Side-chain carbons coloured by class · PubChem 3D' });
  const host = h('div', { style: 'position:absolute;inset:110px 0 40px 0' });
  right.append(cap, host, foot);
  const hexOf = (a) => parseInt(SCHEMES[scheme].cls[a[scheme]][1].slice(1), 16);
  const colorFn = async (a) => { const sc = sideChainSet(await loadMol(a.key)); const hex = hexOf(a); return (atom, i) => (sc.has(i) && (atom[0] === 'C' || (a.key === 'glycine' && atom[0] === 'H')) ? hex : undefined); };
  const viewer = await moleculeScene(host, AA[sel].key, { fill: 0.82, mol: { hideH: false, color: await colorFn(AA[sel]) }, autoRotate: 1.3 });
  function paint() {
    const S = SCHEMES[scheme];
    tiles.forEach((tl, i) => {
      const col = S.cls[AA[i][scheme]][1];
      tl.style.background = `color-mix(in oklab, ${col} 16%, transparent)`;
      tl.style.borderColor = `color-mix(in oklab, ${col} 55%, transparent)`;
    });
    legend.innerHTML = '';
    Object.values(S.cls).forEach(([name, col, body]) => {
      const chip = h('span', { style: `display:inline-flex;align-items:center;gap:10px;font-size:23px;font-weight:600;padding:7px 16px;border-radius:999px;cursor:help;background:color-mix(in oklab, ${col} 14%, transparent);border:1px solid color-mix(in oklab, ${col} 55%, transparent)` }, [h('i', { style: `width:14px;height:14px;border-radius:50%;background:${col};display:inline-block` }), name]);
      tip(chip, { kicker: S.t.replace('*', ''), title: name, body, src: S.note });
      legend.append(chip);
    });
    note.textContent = S.note;
  }
  async function select(i) {
    sel = i;
    const a = AA[i];
    tiles.forEach((tl, k) => { tl.style.boxShadow = k === i ? '0 0 0 3px var(--fg)' : 'none'; tl.style.transform = k === i ? 'translateY(-3px)' : ''; });
    const [name, col] = SCHEMES[scheme].cls[a[scheme]];
    capName.textContent = a.name;
    capCls.innerHTML = `<span style="color:${col}">●</span> ${name}${a.note ? '' : ''}`;
    viewer.swap(a.key, { color: await colorFn(a) });
  }
  paint();
  tiles.forEach((tl, k) => { tl.style.boxShadow = k === sel ? '0 0 0 3px var(--fg)' : 'none'; });
  capName.textContent = AA[sel].name;
  capCls.innerHTML = `<span style="color:${SCHEMES.str.cls.ali[1]}">●</span> Aliphatic`;
  return { ...viewer, step(n) { const v = ['str', 'pol', 'ab'][n] ?? 'str'; if (v !== scheme) sg.set(v); } };
}

// 11 · Peptide bond formation
function peptideFormViz(el) {
  const D = diagram(el, 1712, 720);
  const g1 = s('g'), g2 = s('g', { style: 'opacity:0' });
  D.layers.nodes.append(g1, g2);
  const eg = s('g'); g1.append(eg);
  const ag = s('g'); g1.append(ag);
  const Y = 290;
  const bl = (p, a, b, st) => lineEl(p, a, b, st);
  // AA1
  const aa1 = s('g'); ag.append(aa1);
  const A1 = { n: [330, Y], ca: [450, Y], c: [570, Y], h1: [262, Y - 58], h2: [262, Y + 58], ha: [450, Y - 112], r: [450, Y + 112], o: [570, Y - 112] };
  bl(aa1, A1.n, A1.ca); bl(aa1, A1.ca, A1.c); bl(aa1, A1.n, A1.h1); bl(aa1, A1.n, A1.h2); bl(aa1, A1.ca, A1.ha); bl(aa1, A1.ca, A1.r);
  bl(aa1, [A1.c[0] - 9, Y], [A1.o[0] - 9, A1.o[1]]); bl(aa1, [A1.c[0] + 9, Y], [A1.o[0] + 9, A1.o[1]]);
  const bCO = bl(aa1, A1.c, [680, Y]);
  atomG(aa1, ...A1.n, 'N', AM); atomG(aa1, ...A1.h1, 'H', AM, 24); atomG(aa1, ...A1.h2, 'H', AM, 24);
  atomG(aa1, ...A1.ca, 'C_{α}', RC, 36, { fs: 28 }); atomG(aa1, ...A1.ha, 'H', HC, 24); atomG(aa1, ...A1.r, 'R_{1}', RC, 34, { fs: 28 });
  atomG(aa1, ...A1.c, 'C', AC); atomG(aa1, ...A1.o, 'O', AC);
  // AA2 (moves)
  const aa2 = s('g'); ag.append(aa2);
  const A2 = { n: [1060, Y], ca: [1180, Y], c: [1300, Y], h2: [1060, Y + 112], ha: [1180, Y + 112], r: [1180, Y - 112], o: [1300, Y + 112], oh: [1410, Y], hh: [1490, Y] };
  bl(aa2, A2.n, A2.ca); bl(aa2, A2.ca, A2.c); bl(aa2, A2.n, A2.h2); bl(aa2, A2.ca, A2.ha); bl(aa2, A2.ca, A2.r); bl(aa2, A2.c, A2.oh); bl(aa2, A2.oh, A2.hh);
  bl(aa2, [A2.c[0] - 9, Y], [A2.o[0] - 9, A2.o[1]]); bl(aa2, [A2.c[0] + 9, Y], [A2.o[0] + 9, A2.o[1]]);
  const bNH = bl(aa2, A2.n, [980, Y]);
  atomG(aa2, ...A2.n, 'N', AM); atomG(aa2, ...A2.h2, 'H', AM, 24);
  atomG(aa2, ...A2.ca, 'C_{α}', RC, 36, { fs: 28 }); atomG(aa2, ...A2.ha, 'H', HC, 24); atomG(aa2, ...A2.r, 'R_{2}', RC, 34, { fs: 28 });
  atomG(aa2, ...A2.c, 'C', AC); atomG(aa2, ...A2.o, 'O', AC); atomG(aa2, ...A2.oh, 'O', AC); atomG(aa2, ...A2.hh, 'H', AC, 24);
  const plus = D.text(870, Y + 18, '+', { anchor: 'middle', style: 'font-size:60px;font-weight:300;fill:var(--fg-2)' });
  g1.append(plus);
  // leaving atoms (become water)
  const oval = s('ellipse', { cx: 830, cy: Y, rx: 205, ry: 66, style: 'fill:color-mix(in oklab, var(--nadh) 10%, transparent);stroke:var(--nadh);stroke-width:3;stroke-dasharray:10 10;opacity:0' });
  eg.append(oval);
  const wO = atomG(ag, 680, Y, 'O', AC);
  const wH1 = atomG(ag, 760, Y, 'H', AC, 24);
  const wH2 = atomG(ag, 980, Y, 'H', AM, 24);
  const bOH = bl(eg, [680, Y], [760, Y]);
  const water = s('g', { style: 'opacity:0' });
  lineEl(water, [1000, 100], [952, 132]); lineEl(water, [1000, 100], [1048, 132]);
  const wl = s('text', { x: 1000, y: 46, 'text-anchor': 'middle', class: 'v-label', style: `font-size:30px;font-weight:700;fill:${PEP}` }); wl.textContent = 'H₂O released';
  water.append(wl);
  eg.prepend(water);
  const pep = s('g', { style: 'opacity:0' });
  lineEl(pep, [570, Y], [690, Y], `stroke:${PEP};stroke-width:30;stroke-linecap:round;opacity:.28`);
  lineEl(pep, [570, Y], [690, Y], `stroke:${PEP};stroke-width:12;stroke-linecap:round`);
  ag.insertBefore(pep, aa1);
  const pepLbl = s('g', { style: 'opacity:0' });
  pepLbl.append(s('path', { d: 'M630,440 L630,318', style: `stroke:${PEP};stroke-width:3;fill:none` }));
  const pl = s('text', { x: 630, y: 478, 'text-anchor': 'middle', class: 'v-label', style: `font-size:30px;font-weight:700;fill:${PEP}` }); pl.textContent = 'Peptide bond · –CO–NH–';
  pepLbl.append(pl);
  g1.append(pepLbl);

  // Tetrapeptide (compact, as on slide 14)
  const parts = [];
  let x = 0;
  const push = (kind, w) => { parts.push({ kind, x, w }); x += w; };
  push('n', 116); for (let k = 0; k < 4; k++) { push('l', 34); push('ca', 76); if (k < 3) { push('l', 34); push('pb', 168); } } push('l', 34); push('cooh', 132);
  const X0 = (1712 - x) / 2;
  let res = 0;
  parts.forEach((p) => {
    const cx = X0 + p.x + p.w / 2;
    if (p.kind === 'l') { lineEl(g2, [X0 + p.x - 4, Y], [X0 + p.x + p.w + 4, Y]); return; }
    if (p.kind === 'ca') {
      const up = res % 2 === 1;
      lineEl(g2, [cx, Y], [cx, Y + (up ? -1 : 1) * 108]);
      lineEl(g2, [cx, Y], [cx, Y + (up ? 1 : -1) * 92]);
      atomG(g2, cx, Y + (up ? -1 : 1) * 112, `R_{${res + 1}}`, RC, 32, { fs: 26 });
      atomG(g2, cx, Y + (up ? 1 : -1) * 94, 'H', HC, 22);
      atomG(g2, cx, Y, 'C_{α}', RC, 38, { fs: 28 });
      res++;
      return;
    }
    const col = p.kind === 'pb' ? PEP : p.kind === 'n' ? AM : AC;
    g2.append(s('rect', { x: X0 + p.x, y: Y - 34, width: p.w, height: 68, rx: 20, style: `fill:color-mix(in oklab, ${col} ${p.kind === 'pb' ? 26 : 16}%, var(--bg));stroke:${col};stroke-width:2.5` }));
    const tx = s('text', { x: cx, y: Y + 11, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:700' });
    setRich(tx, p.kind === 'pb' ? 'CO–NH' : p.kind === 'n' ? 'H_{2}N' : 'COOH');
    g2.append(tx);
    if (p.kind === 'pb') {
      const wb = s('g');
      wb.append(s('rect', { x: cx - 50, y: 40, width: 100, height: 42, rx: 21, style: `fill:color-mix(in oklab, ${PEP} 14%, transparent);stroke:color-mix(in oklab, ${PEP} 50%, transparent);stroke-width:2` }));
      const wt = s('text', { x: cx, y: 70, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${PEP};font-weight:700` }); wt.textContent = '− H₂O';
      wb.append(wt);
      g2.append(wb);
    }
    if (p.kind === 'n' || p.kind === 'cooh') {
      const tt = s('text', { x: cx, y: Y - 60, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:650' });
      tt.textContent = p.kind === 'n' ? 'N-terminus' : 'C-terminus';
      g2.append(tt);
    }
  });
  g2.append(s('path', { d: `M${X0},470 L${X0},486 L${X0 + x},486 L${X0 + x},470`, style: 'fill:none;stroke:var(--fg-3);stroke-width:3;stroke-linecap:round' }));
  const bt = s('text', { x: X0 + x / 2, y: 528, 'text-anchor': 'middle', class: 'v-label', style: 'fill:var(--fg-2);font-weight:600' }); bt.textContent = 'Backbone: repeating N–Cα–C units';
  g2.append(bt);

  // counters
  const counters = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:70px;pointer-events:none' });
  const mk = (label, col) => {
    const v = h('div', { style: `font:720 56px var(--font);letter-spacing:-.03em;color:${col};font-variant-numeric:tabular-nums;line-height:1`, text: '0' });
    counters.append(h('div', { style: 'display:flex;align-items:baseline;gap:14px' }, [v, h('div', { style: 'font-size:25px;color:var(--fg-2);font-weight:560', text: label })]));
    return v;
  };
  const cA = mk('amino acids', 'var(--fg)');
  const cB = mk('peptide bonds', PEP);
  const cW = mk('H₂O released', 'var(--fg-2)');
  el.append(counters);
  const vals = [[2, 0, 0], [2, 0, 0], [2, 1, 1], [4, 3, 3]];
  return {
    step(n) {
      const d = 1.1;
      gsap.to(oval, { opacity: n === 1 ? 1 : 0, duration: 0.5 });
      [wO, wH1, wH2].forEach((a) => a.querySelector('circle').setAttribute('filter', n === 1 ? `url(#${D.glowId})` : ''));
      const w = n >= 2;
      gsap.to(wO, { x: w ? 1000 : 680, y: w ? 100 : Y, duration: d, ease: 'power2.inOut' });
      gsap.to(wH1, { x: w ? 952 : 760, y: w ? 132 : Y, duration: d, ease: 'power2.inOut' });
      gsap.to(wH2, { x: w ? 1048 : 980, y: w ? 132 : Y, duration: d, ease: 'power2.inOut' });
      gsap.to([bCO, bNH, bOH], { opacity: w ? 0 : 1, duration: 0.4 });
      gsap.to(water, { opacity: w ? 1 : 0, duration: 0.5, delay: w ? d * 0.8 : 0 });
      gsap.to(aa2, { x: w ? -370 : 0, duration: d, ease: 'power3.inOut', delay: w ? 0.3 : 0 });
      gsap.to(plus, { opacity: w ? 0 : 1, duration: 0.4 });
      gsap.to(pep, { opacity: w ? 1 : 0, duration: 0.5, delay: w ? d + 0.2 : 0 });
      gsap.to(pepLbl, { opacity: w ? 1 : 0, duration: 0.5, delay: w ? d + 0.4 : 0 });
      gsap.to(g1, { opacity: n >= 3 ? 0 : 1, duration: 0.5 });
      gsap.to(g2, { opacity: n >= 3 ? 1 : 0, duration: 0.7, delay: n >= 3 ? 0.3 : 0 });
      const [a, b, c] = vals[n] || vals[0];
      countTo(cA, a, { from: +cA.textContent, duration: 0.8 });
      countTo(cB, b, { from: +cB.textContent, duration: 0.8 });
      countTo(cW, c, { from: +cW.textContent, duration: 0.8 });
    },
    destroy: () => D.destroy(),
  };
}

// 12 · Peptide bond in 3D (glycylalanine, PubChem conformer — already trans)
async function peptide3DViz(el) {
  const kit = createScene(el, { cam: [0, 2, 22], autoRotate: 0, fov: 30 });
  const data = await loadMol('gly-ala');
  const mol = buildMolecule(data, { hideH: false, scale: 1.05 });
  const P = mol.userData.pos;
  // Orient: C→N along x, plane normal toward the viewer
  const cC = P[7], cN = P[3], O = P[1];
  const Xa = cN.clone().sub(cC).normalize();
  const Zn = O.clone().sub(cC).cross(cN.clone().sub(cC)).normalize();
  const Ya = new THREE.Vector3().crossVectors(Zn, Xa).normalize();
  mol.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xa, Ya, Zn).transpose());
  const mid = cC.clone().add(cN).multiplyScalar(0.5);
  mol.position.copy(mid).applyQuaternion(mol.quaternion).negate();
  const g = new THREE.Group();
  g.add(mol);
  kit.root.add(g);
  const W = (i) => wpos(mol, i);
  // peptide plane: Cα(Gly) C O N H Cα(Ala)
  const ring = [9, 7, 1, 3, 11, 5].map(W);
  const c0 = centroid(ring);
  ring.sort((a, b) => Math.atan2(a.y - c0.y, a.x - c0.x) - Math.atan2(b.y - c0.y, b.x - c0.x));
  const ex = ring.map((p) => { const d = p.clone().sub(c0); return c0.clone().add(d.multiplyScalar(1 + 0.75 / d.length())); });
  const verts = [];
  ex.forEach((p, i) => { const q = ex[(i + 1) % ex.length]; verts.push(c0.x, c0.y, c0.z, p.x, p.y, p.z, q.x, q.y, q.z); });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const planeMat = new THREE.MeshBasicMaterial({ color: 0xbf5af2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const plane = new THREE.Mesh(pg, planeMat);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xd9a6ff, transparent: true, opacity: 0 });
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ex), edgeMat);
  g.add(plane, edge);
  // glowing C–N bond
  const bondMat = new THREE.MeshBasicMaterial({ color: 0x64d2ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const a = W(7), b = W(3);
  const bond = new THREE.Mesh(STICK, bondMat);
  bond.position.copy(a).add(b).multiplyScalar(0.5);
  bond.scale.set(0.26, a.distanceTo(b), 0.26);
  bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.add(bond);
  const L = {
    pb: tag(kit, 'Peptide bond', new THREE.Vector3(0, 0, 0).add(W(1).clone().add(W(5)).multiplyScalar(0.5).setLength(2.6)), g, { color: PEP, cls: '', size: 26 }),
    co: tag(kit, 'C=O', outward(W(1), 1.0), g, { color: AC }),
    nh: tag(kit, 'N–H', outward(W(11), 1.0), g, { color: AM }),
    plane: tag(kit, 'One rigid plane', W(9).clone().add(W(11)).multiplyScalar(0.5).setLength(3.4), g, { color: 'var(--ink)', cls: 'acc', size: 26 }),
    ca1: tag(kit, 'C<sub>α</sub> · Gly', outward(W(9), 1.4), g, { color: 'var(--ink)' }),
    ca2: tag(kit, 'C<sub>α</sub> · Ala', outward(W(5), 1.4), g, { color: 'var(--ink)' }),
    trans: tag(kit, 'trans: the two Cα on opposite sides', new THREE.Vector3(0, -4.6, 0), g, { color: 'var(--fg)', cls: '', size: 24 }),
  };
  kit.onFrame((dt, t) => { g.rotation.y = 0.75 * Math.sin(t * 0.38); bondMat.opacity = 0.4 + 0.25 * Math.sin(t * 3); });
  fitBox(kit, g, 0.62, { spin: true });
  const apply = (n) => {
    gsap.to(planeMat, { opacity: n >= 1 ? 0.24 : 0, duration: 0.7 });
    gsap.to(edgeMat, { opacity: n >= 1 ? 0.9 : 0, duration: 0.7 });
    showLbl(L.plane, n >= 1); showLbl(L.co, n >= 1); showLbl(L.nh, n >= 1);
    showLbl(L.ca1, n >= 2); showLbl(L.ca2, n >= 2); showLbl(L.trans, n >= 2);
  };
  apply(0);
  return kitController(kit, { step: apply });
}

// 13 · Four levels staircase
function stairsViz(el) {
  const D = diagram(el, 1500, 360);
  const LV = [['1°', 'Primary', 'sequence'], ['2°', 'Secondary', 'helix · sheet'], ['3°', 'Tertiary', 'one folded chain'], ['4°', 'Quaternary', 'several chains']];
  const W = 340, G = 26, X0 = 15;
  const glyph = (i, cx, y) => {
    const g = s('g', { transform: `translate(${cx} ${y})` });
    const st = 'fill:none;stroke:var(--a1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round';
    if (i === 0) { for (let k = 0; k < 5; k++) g.append(s('circle', { cx: -80 + k * 40, cy: 0, r: 13, style: 'fill:var(--a1)' })); g.prepend(s('path', { d: 'M-80,0 L80,0', style: 'stroke:var(--line-2);stroke-width:5' })); }
    if (i === 1) { const pts = []; for (let k = 0; k <= 40; k++) pts.push([-90 + k * 4.5, 22 * Math.sin(k * 0.62)]); g.append(s('path', { d: smooth(pts), style: st })); }
    if (i === 2) { const pts = []; const R = rng(7); for (let k = 0; k < 16; k++) { const a = k * 2.3; pts.push([40 * Math.cos(a) * (0.5 + R() * 0.6), 26 * Math.sin(a) * (0.5 + R() * 0.6)]); } g.append(s('path', { d: smooth(pts), style: st })); }
    if (i === 3) { [[-26, -20], [26, -20], [-26, 20], [26, 20]].forEach(([x, y2], k) => g.append(s('circle', { cx: x, cy: y2, r: 21, style: `fill:${k % 2 ? 'var(--a2)' : 'var(--a1)'};opacity:.9` }))); }
    return g;
  };
  const items = LV.map(([k, t, d], i) => {
    const x = X0 + i * (W + G), hh = 58 + i * 58, y = 360 - hh;
    const g = s('g', { style: 'opacity:.18' });
    g.append(s('rect', { x, y, width: W, height: hh, rx: 22, style: 'fill:color-mix(in oklab, var(--a1) 14%, transparent);stroke:color-mix(in oklab, var(--a1) 55%, transparent);stroke-width:2' }));
    const kt = s('text', { x: x + 26, y: y + 48, class: 'v-label', style: 'font-size:40px;font-weight:760;fill:var(--ink)' }); kt.textContent = k;
    const tt = s('text', { x: x + 96, y: y + 46, class: 'v-label', style: 'font-size:32px;font-weight:680' }); tt.textContent = t;
    g.append(kt, tt);
    const dd = s('text', { x: x + W / 2, y: y - 18, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2)' }); dd.textContent = d;
    g.append(dd, glyph(i, x + W / 2, y - 88));
    D.layers.nodes.append(g);
    return { g, top: [x + W / 2, y] };
  });
  return {
    step(n) {
      items.forEach((it, i) => gsap.to(it.g, { opacity: i < n ? 1 : 0.18, y: i < n ? 0 : 10, duration: 0.6, ease: 'expo.out' }));
    },
    destroy: () => D.destroy(),
  };
}

// 14 · Primary structure + sickle-cell hook
function primaryViz(el) {
  const D = diagram(el, 960, 860);
  const SEQ = ['Pro', 'Met', 'Ala', 'Arg', 'Cys', 'Lys', 'Leu', 'Ser', 'Met'];
  const xs = SEQ.map((_, i) => 104 + i * 94);
  const ys = SEQ.map((_, i) => 300 + 22 * Math.sin(i * 1.1));
  const bead = (parent, x, y, k3, r = 40) => {
    const col = strCol(k3);
    const g = s('g', { transform: `translate(${x} ${y})` });
    const c = s('circle', { r, style: `fill:${col};stroke:var(--bg);stroke-width:3` });
    const t = s('text', { y: 8, 'text-anchor': 'middle', style: `font:700 23px var(--font);fill:${darkText(col) ? '#1d1d1f' : '#fff'}` });
    t.textContent = k3;
    g.append(c, t);
    parent.append(g);
    return { g, c, t };
  };
  for (let i = 0; i < 8; i++) lineEl(D.layers.edges, [xs[i], ys[i]], [xs[i + 1], ys[i + 1]], `stroke:${PEP};stroke-width:9;stroke-linecap:round`);
  SEQ.forEach((k, i) => bead(D.layers.nodes, xs[i], ys[i], k));
  D.text(xs[0], 222, 'N-terminus', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
  D.text(xs[8], 222, 'C-terminus', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
  const mx = (xs[0] + xs[1]) / 2, my = (ys[0] + ys[1]) / 2;
  D.layers.labels.append(s('path', { d: `M${mx + 40},420 L${mx},${my + 12}`, style: `stroke:${PEP};stroke-width:2.5;fill:none` }));
  D.text(mx + 40, 450, 'Peptide bond', { anchor: 'middle', style: `fill:${PEP};font-weight:650` });
  D.layers.labels.append(s('path', { d: `M${xs[5] + 60},420 L${xs[5] + 8},${ys[5] + 42}`, style: 'stroke:var(--fg-2);stroke-width:2.5;fill:none' }));
  D.text(xs[5] + 60, 450, 'Amino acid residue', { anchor: 'middle', style: 'fill:var(--fg-2);font-weight:650' });
  // gene (step 1)
  const gene = s('g', { style: 'opacity:0' });
  const s1 = [], s2 = [];
  for (let k = 0; k <= 60; k++) { const x = 70 + k * 13.7; s1.push([x, 92 + 18 * Math.sin(k * 0.45)]); s2.push([x, 92 - 18 * Math.sin(k * 0.45)]); }
  for (let k = 0; k <= 60; k += 3) gene.append(s('line', { x1: s1[k][0], y1: s1[k][1], x2: s2[k][0], y2: s2[k][1], style: 'stroke:var(--line-2);stroke-width:3' }));
  gene.append(s('path', { d: smooth(s1), style: 'fill:none;stroke:var(--a1);stroke-width:5' }), s('path', { d: smooth(s2), style: 'fill:none;stroke:var(--a2);stroke-width:5' }));
  const gl = s('text', { x: 480, y: 40, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--ink);font-weight:700;letter-spacing:.1em' }); gl.textContent = 'GENE · NUCLEOTIDE SEQUENCE';
  gene.append(gl);
  gene.append(s('path', { d: 'M480,130 L480,232', style: 'stroke:var(--fg-3);stroke-width:4;fill:none;stroke-dasharray:4 9' }), s('path', { d: 'M466,218 L480,240 L494,218', style: 'stroke:var(--fg-3);stroke-width:4;fill:none;stroke-linecap:round' }));
  D.layers.labels.append(gene);
  // sickle panel (step 2)
  const sk = s('g', { style: 'opacity:0' });
  sk.append(s('rect', { x: 0, y: 510, width: 960, height: 350, rx: 34, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' }));
  const hd = s('text', { x: 34, y: 562, class: 'v-label sm', style: 'fill:var(--inh);font-weight:700;letter-spacing:.12em' }); hd.textContent = 'CLINICAL HOOK · β-GLOBIN, RESIDUES 1–8';
  sk.append(hd);
  const BG = ['Val', 'His', 'Leu', 'Thr', 'Pro', 'Glu', 'Glu', 'Lys'];
  const bx = BG.map((_, i) => 80 + i * 90);
  for (let i = 0; i < 7; i++) lineEl(sk, [bx[i], 680], [bx[i + 1], 680], `stroke:${PEP};stroke-width:8`);
  const bb = BG.map((k, i) => bead(sk, bx[i], 680, k, 36));
  BG.forEach((_, i) => { const n = s('text', { x: bx[i], y: 748, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-3)' }); n.textContent = i + 1; sk.append(n); });
  const ringM = s('circle', { cx: bx[5], cy: 680, r: 48, style: 'fill:none;stroke:var(--inh);stroke-width:4;stroke-dasharray:8 8' });
  sk.append(ringM);
  const codon = s('text', { x: bx[5], y: 616, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg);font-weight:650' }); codon.textContent = 'GAG → GTG';
  sk.append(codon);
  const hbT = s('text', { x: 860, y: 694, 'text-anchor': 'middle', class: 'v-label xl', style: 'fill:var(--fg)' }); hbT.textContent = 'HbA';
  sk.append(hbT);
  const cap = s('text', { x: 480, y: 818, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:27px;fill:var(--fg-2)' }); setRich(cap, 'β6 Glu (charged) → Val (non-polar) · sickle-cell disease');
  sk.append(cap);
  D.layers.labels.append(sk);
  const glu = strCol('Glu'), val = strCol('Val');
  return {
    step(n) {
      gsap.to(gene, { opacity: n >= 1 ? 1 : 0, duration: 0.6 });
      gsap.to(sk, { opacity: n >= 2 ? 1 : 0, duration: 0.6 });
      const m = bb[5];
      gsap.killTweensOf([m.c, m.g]);
      if (n >= 2) {
        m.c.style.fill = glu; m.t.textContent = 'Glu'; m.t.style.fill = darkText(glu) ? '#1d1d1f' : '#fff'; hbT.textContent = 'HbA'; hbT.style.fill = 'var(--fg)';
        gsap.delayedCall(1.2, () => { m.c.style.fill = val; m.t.textContent = 'Val'; m.t.style.fill = '#1d1d1f'; hbT.textContent = 'HbS'; hbT.style.fill = 'var(--inh)'; gsap.fromTo(m.g, { scale: 1.35, svgOrigin: `${bx[5]} 680` }, { scale: 1, duration: 0.7, ease: 'back.out(2)' }); });
      } else { m.c.style.fill = glu; m.t.textContent = 'Glu'; m.t.style.fill = darkText(glu) ? '#1d1d1f' : '#fff'; hbT.textContent = 'HbA'; }
    },
    destroy: () => D.destroy(),
  };
}

// 15 · α-helix from protein G (1PGA 22–37): backbone + Cβ, i→i+4 H-bonds
async function helixViz(el) {
  const kit = createScene(el, { cam: [0, 0, 70], autoRotate: 0.9, fov: 30 });
  const pdb = await loadPDB('1PGA');
  const F = 22, T = 37;
  const atoms = pdb.atoms.filter((a) => a[1] >= F && a[1] <= T && ['N', 'CA', 'C', 'O', 'CB'].includes(a[3]));
  const center = centroid(atoms.map((a) => new THREE.Vector3(a[5], a[6], a[7])));
  const box = new THREE.Group();
  kit.root.add(box);
  const balls = pdbAtoms(atoms, center, { r: 0.42, color: (a) => (a[3] === 'CB' ? 0xbf5af2 : undefined) });
  box.add(balls);
  const posOf = (r, n) => { const i = atoms.findIndex((x) => x[1] === r && x[3] === n); return i < 0 ? null : balls.userData.pos[i]; };
  const avg = (rs) => centroid(rs.map((r) => posOf(r, 'CA').clone()));
  const axis = avg([33, 34, 35, 36]).sub(avg([23, 24, 25, 26])).normalize();
  box.quaternion.setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
  const hbs = [];
  for (let r = F; r + 4 <= T; r++) {
    const o = posOf(r, 'O'), n = posOf(r + 4, 'N');
    if (!o || !n || o.distanceTo(n) > 3.5) continue;
    const mat = new THREE.MeshBasicMaterial({ color: 0x64d2ff, transparent: true, opacity: 0.95 });
    balls.add(dashes(o, n, mat, { r: 0.11 }));
    const glow = glowSprite(0x64d2ff, 1.2);
    glow.position.copy(o).add(n).multiplyScalar(0.5);
    balls.add(glow);
    hbs.push({ r, mat, glow, o, n });
  }
  // ribbon "spring"
  const sub = subChains(pdb, [[F, T]]);
  const ribbon = buildProtein(sub, { colorBy: () => 0xbf5af2, center: center.toArray(), helixW: 1.7 });
  ribbon.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0; o.material.depthWrite = false; } });
  box.add(ribbon);
  const rib = ribbon.children[0].material;
  // highlighted pair
  const HL = 26;
  const radial = (p) => { const q = p.clone().sub(axis.clone().multiplyScalar(p.dot(axis))); return p.clone().add(q.normalize().multiplyScalar(2.2)); };
  const hp = hbs.find((x) => x.r === HL) || hbs[2];
  const lO = tag(kit, `C=O · residue <i>i</i>`, radial(hp.o), balls, { color: AC, size: 24 });
  const lN = tag(kit, `N–H · residue <i>i</i>+4`, radial(hp.n), balls, { color: AM, size: 24 });
  const lS = tag(kit, 'the “spring”', new THREE.Vector3(0, 0, 0).addScaledVector(axis, 13), balls, { color: 'var(--ink)', cls: 'acc' });
  kit.onFrame((dt, t) => hbs.forEach((x, k) => x.glow.scale.setScalar(1 + 0.45 * Math.sin(t * 2.4 - k * 0.6))));
  fitBox(kit, box, 0.82, { spin: true });
  const legend = h('div', { style: 'position:absolute;left:0;bottom:0;display:flex;gap:28px;font-size:23px;color:var(--fg-2);z-index:3' }, [
    ['#3a82ff', 'N'], ['#ff453a', 'O'], ['#9a9aa2', 'C'], ['#bf5af2', 'Cβ (start of R)'],
  ].map(([c, t]) => h('span', { style: 'display:flex;align-items:center;gap:8px' }, [h('i', { style: `width:16px;height:16px;border-radius:50%;background:${c};display:inline-block` }), t])).concat([h('span', { style: `color:${PEP}`, text: '┅ H-bond' })]));
  el.append(legend);
  const apply = (n) => {
    hbs.forEach((x) => {
      const on = n !== 1 || x === hp;
      x.mat.color.setHex(n === 1 && x === hp ? 0xffd60a : 0x64d2ff);
      gsap.to(x.mat, { opacity: on ? 0.95 : 0.12, duration: 0.5 });
      x.glow.visible = on;
    });
    showLbl(lO, n === 1); showLbl(lN, n === 1); showLbl(lS, n >= 2);
    gsap.to(rib, { opacity: n >= 2 ? 0.38 : 0, duration: 0.8 });
  };
  apply(0);
  return kitController(kit, { step: apply });
}

// 16 · β-sheet from protein G: antiparallel (β1·β2) vs parallel (β1·β4)
async function sheetViz(el) {
  const kit = createScene(el, { cam: [0, 0, 70], autoRotate: 0, fov: 30 });
  const pdb = await loadPDB('1PGA');
  const STR = [
    { id: 'β1', a: 1, b: 9, col: 0xbf5af2 },
    { id: 'β2', a: 12, b: 20, col: 0x7d7bff },
    { id: 'β3', a: 42, b: 46, col: 0x8e8e96 },
    { id: 'β4', a: 50, b: 56, col: 0x40c8e0 },
  ];
  const inS = (r) => STR.findIndex((x) => r >= x.a && r <= x.b);
  const atoms = pdb.atoms.filter((a) => inS(a[1]) >= 0 && ['N', 'CA', 'C', 'O'].includes(a[3]));
  const center = centroid(atoms.map((a) => new THREE.Vector3(a[5], a[6], a[7])));
  const box = new THREE.Group();
  kit.root.add(box);
  const strands = STR.map((st, k) => {
    const at = atoms.filter((a) => inS(a[1]) === k);
    const g = new THREE.Group();
    g.add(pdbAtoms(at, center, { r: 0.36, stick: 0.13 }));
    const rib = buildProtein(subChains(pdb, [[st.a, st.b]], 'E'), { colorBy: () => st.col, center: center.toArray(), sheetW: 1.45 });
    rib.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.6; o.material.depthWrite = false; } });
    g.add(rib);
    ownMats(g);
    box.add(g);
    const cas = at.filter((a) => a[3] === 'CA').map((a) => new THREE.Vector3(a[5], a[6], a[7]).sub(center));
    return { g, st, cas, c: centroid(cas.map((v) => v.clone())) };
  });
  // H-bonds between strands
  const P = atoms.map((a) => new THREE.Vector3(a[5], a[6], a[7]).sub(center));
  const hb = [];
  atoms.forEach((o, i) => {
    if (o[3] !== 'O') return;
    atoms.forEach((n, j) => {
      if (n[3] !== 'N') return;
      const si = inS(o[1]), sj = inS(n[1]);
      if (si === sj || P[i].distanceTo(P[j]) > 3.45) return;
      const pair = [si, sj].sort().join('');
      const mat = new THREE.MeshBasicMaterial({ color: 0x64d2ff, transparent: true, opacity: 0.95 });
      const d = dashes(P[i], P[j], mat, { r: 0.12 });
      box.add(d);
      hb.push({ pair, mat });
    });
  });
  // orient: strand direction → y, sheet normal → z
  const dir = strands[0].cas.at(-1).clone().sub(strands[0].cas[0]).normalize();
  let across = strands[1].c.clone().sub(strands[3].c);
  across.sub(dir.clone().multiplyScalar(across.dot(dir))).normalize();
  const Zn = new THREE.Vector3().crossVectors(across, dir).normalize();
  box.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, dir, Zn).transpose());
  const sLbl = strands.map((x) => tag(kit, x.st.id, x.cas[0].clone().sub(dir.clone().multiplyScalar(2.6)), box, { cls: 'sm', color: `#${x.st.col.toString(16).padStart(6, '0')}` }));
  const mode = tag(kit, '', new THREE.Vector3(0, 0, 0).addScaledVector(dir, 15), box, { cls: 'acc', size: 26 });
  fitBox(kit, box, 0.78, { spin: true, lift: -2.5 });
  kit.onFrame((dt, t) => { kit.root.rotation.y = 0.55 * Math.sin(t * 0.35); });
  hideHint(el);
  const MODES = [
    { on: [0, 1, 2, 3], pairs: null, t: 'Four strands · one sheet' },
    { on: [0, 1], pairs: ['01'], t: 'Antiparallel · strands run opposite ways' },
    { on: [0, 3], pairs: ['03'], t: 'Parallel · strands run the same way' },
  ];
  let cur = -1;
  const setMode = (k) => {
    if (k === cur) return;
    cur = k;
    const m = MODES[k];
    strands.forEach((x, i) => setAlpha(x.g, m.on.includes(i) ? 1 : 0.1, 0.6));
    hb.forEach((x) => gsap.to(x.mat, { opacity: !m.pairs || m.pairs.includes(x.pair) ? 0.95 : 0.04, duration: 0.6 }));
    sLbl.forEach((l, i) => showLbl(l, m.on.includes(i)));
    mode.element.innerHTML = m.t;
    sg.set(k, false);
  };
  const sg = seg({ options: [{ v: 0, t: 'Whole sheet' }, { v: 1, t: 'Antiparallel' }, { v: 2, t: 'Parallel' }], value: 0, onChange: (v) => setMode(v) });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  setMode(0);
  // ribbon materials keep partial opacity
  return kitController(kit, { step: (n) => setMode(Math.min(2, n)) });
}

// 17 · Helix-breaker mini visuals
function miniSvg(el, w = 320, hh = 230) {
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  const D = diagram(el, w, hh);
  D.svg.style.height = `${hh}px`;
  return D;
}
function vProline(el) {
  const D = miniSvg(el);
  const lp = loops();
  const pts = [0, 1, 2, 3, 4].map((k) => { const a = (-90 + k * 72) * DEG; return [160 + 54 * Math.cos(a), 150 + 54 * Math.sin(a)]; });
  D.layers.edges.append(s('path', { d: `M${pts.map((p) => p.join(',')).join(' L')} Z`, style: 'fill:color-mix(in oklab, var(--a1) 12%, transparent);stroke:var(--fg-3);stroke-width:5;stroke-linejoin:round' }));
  pts.slice(1).forEach((p) => D.layers.nodes.append(s('circle', { cx: p[0], cy: p[1], r: 13, style: 'fill:#9a9aa2' })));
  atomG(D.layers.nodes, pts[0][0], pts[0][1], 'N', AM, 22, { fs: 22 });
  atomG(D.layers.nodes, 160, 26, 'O', AC, 18, { fs: 18 });
  D.layers.fx.append(s('line', { x1: 160, y1: 46, x2: 160, y2: 76, style: 'stroke:var(--atp);stroke-width:4;stroke-dasharray:5 5' }));
  const x = D.text(160, 70, '✕', { anchor: 'middle', style: 'font-size:34px;font-weight:800;fill:var(--inh)' });
  D.text(196, 72, 'no H on N', { cls: 'sm', style: 'fill:var(--inh);font-weight:650' });
  D.text(160, 160, 'ring', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3)' });
  lp.add(gsap.to(x, { opacity: 0.25, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  return { destroy() { lp.kill(); D.destroy(); } };
}
function vGlycine(el) {
  const D = miniSvg(el);
  const lp = loops();
  const piv = [160, 92];
  const leftPts = [[24, 148], [70, 132], [116, 112]];
  const rightPts = [[204, 112], [250, 132], [296, 148]];
  const draw = (g, ptsArr) => { lineEl(g, piv, ptsArr[0], 'stroke:var(--line-2);stroke-width:6'); for (let i = 0; i < ptsArr.length - 1; i++) lineEl(g, ptsArr[i], ptsArr[i + 1], 'stroke:var(--line-2);stroke-width:6'); ptsArr.forEach((p) => g.append(s('circle', { cx: p[0], cy: p[1], r: 16, style: 'fill:var(--a1)' }))); };
  const L = s('g'), R = s('g');
  draw(L, leftPts.slice().reverse()); draw(R, rightPts);
  D.layers.nodes.append(L, R);
  D.layers.nodes.append(s('circle', { cx: piv[0], cy: piv[1], r: 9, style: 'fill:var(--act)' }));
  D.text(160, 62, 'Gly', { anchor: 'middle', cls: 'sm', style: 'fill:var(--act);font-weight:700' });
  lp.add(gsap.fromTo(R, { rotation: -18, svgOrigin: `${piv[0]} ${piv[1]}` }, { rotation: 16, svgOrigin: `${piv[0]} ${piv[1]}`, duration: 1.3, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  lp.add(gsap.fromTo(L, { rotation: 12, svgOrigin: `${piv[0]} ${piv[1]}` }, { rotation: -18, svgOrigin: `${piv[0]} ${piv[1]}`, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  return { destroy() { lp.kill(); D.destroy(); } };
}
function vPolar(el) {
  const D = miniSvg(el);
  const lp = loops();
  lineEl(D.layers.edges, [16, 180], [304, 180], 'stroke:var(--line-2);stroke-width:6');
  lineEl(D.layers.edges, [88, 180], [88, 128], 'stroke:var(--line-2);stroke-width:5');
  atomG(D.layers.nodes, 88, 112, 'O', AC, 18, { fs: 18 });
  D.layers.nodes.append(s('circle', { cx: 88, cy: 180, r: 11, style: 'fill:#9a9aa2' }));
  lineEl(D.layers.edges, [236, 180], [236, 120], 'stroke:var(--line-2);stroke-width:5');
  lineEl(D.layers.edges, [236, 120], [204, 74], 'stroke:var(--line-2);stroke-width:5');
  D.layers.nodes.append(s('circle', { cx: 236, cy: 180, r: 11, style: 'fill:#9a9aa2' }), s('circle', { cx: 236, cy: 120, r: 11, style: 'fill:var(--a1)' }));
  atomG(D.layers.nodes, 204, 66, 'OH', AC, 22, { fs: 17 });
  const hbp = s('path', { d: 'M184,74 Q140,70 104,104', style: 'fill:none;stroke:var(--atp);stroke-width:4;stroke-dasharray:6 7' });
  D.layers.fx.append(hbp);
  D.text(160, 222, 'R steals the C=O', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
  lp.add(gsap.to(hbp, { strokeDashoffset: -26, duration: 0.8, repeat: -1, ease: 'none' }));
  return { destroy() { lp.kill(); D.destroy(); } };
}
function vBranched(el) {
  const D = miniSvg(el);
  const lp = loops();
  const pts = []; for (let k = 0; k <= 40; k++) pts.push([16 + k * 7.2, 60 + 26 * Math.sin(k * 0.45)]);
  D.layers.edges.append(s('path', { d: smooth(pts), style: 'fill:none;stroke:var(--line-2);stroke-width:7;stroke-linecap:round' }));
  lineEl(D.layers.edges, [16, 196], [304, 196], 'stroke:var(--line-2);stroke-width:6');
  lineEl(D.layers.edges, [160, 196], [160, 148], 'stroke:var(--line-2);stroke-width:5');
  lineEl(D.layers.edges, [160, 148], [120, 108], 'stroke:var(--line-2);stroke-width:5');
  lineEl(D.layers.edges, [160, 148], [200, 108], 'stroke:var(--line-2);stroke-width:5');
  D.layers.nodes.append(s('circle', { cx: 160, cy: 196, r: 11, style: 'fill:#9a9aa2' }), s('circle', { cx: 160, cy: 148, r: 14, style: 'fill:var(--a1)' }), s('circle', { cx: 120, cy: 106, r: 15, style: 'fill:var(--a1)' }), s('circle', { cx: 200, cy: 106, r: 15, style: 'fill:var(--a1)' }));
  D.text(182, 160, 'Cβ', { cls: 'sm', style: 'fill:var(--fg-2);font-weight:650' });
  const b1 = D.text(108, 86, '✱', { anchor: 'middle', style: 'font-size:30px;fill:var(--inh)' });
  const b2 = D.text(212, 86, '✱', { anchor: 'middle', style: 'font-size:30px;fill:var(--inh)' });
  lp.add(gsap.to([b1, b2], { opacity: 0.15, scale: 0.7, transformOrigin: '50% 50%', duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  return { destroy() { lp.kill(); D.destroy(); } };
}

// 18 · Tertiary: myoglobin
async function tertiaryViz(el) {
  const kit = createScene(el, { cam: [0, 0, 90], autoRotate: 0.7, fov: 30 });
  const pdb = await loadPDB('1A6M');
  const prot = buildProtein(pdb, { colorBy: rainbow(pdb.chains[0].res.length), hets: ['HEM', 'OXY'], hetScale: 1.2, hetColor: 0xff2d55 });
  kit.root.add(prot);
  const glows = feGlows(pdb, prot, 0xff6b3d, 7);
  kit.onFrame((dt, t) => glows.forEach((g) => g.scale.setScalar(6.5 + 1.8 * Math.sin(t * 1.6))));
  const c = prot.userData.center, res = pdb.chains[0].res;
  const at = (r) => new THREE.Vector3(r[2] - c.x, r[3] - c.y, r[4] - c.z);
  const fe = pdb.het.find((x) => x.name === 'HEM').atoms.find((a) => a[0] === 'Fe');
  const fv = new THREE.Vector3(fe[2] - c.x, fe[3] - c.y, fe[4] - c.z);
  tag(kit, 'Heme + O<sub>2</sub>', fv.clone().add(fv.clone().normalize().multiplyScalar(9)), prot, { color: 'var(--inh)', cls: '' });
  tag(kit, 'N-terminus', outward(at(res[0]), 4), prot, { color: '#3d6bff' });
  tag(kit, 'C-terminus', outward(at(res.at(-1)), 4), prot, { color: '#ff4d3a' });
  fitBox(kit, prot, 0.8, { spin: true });
  return kitController(kit);
}

// 19 · Quaternary: hemoglobin / catalase / collagen
async function quatViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '520px 1fr';
  el.style.gap = '30px';
  const info = h('div', { style: 'display:flex;flex-direction:column;justify-content:center;gap:14px' });
  const stage = h('div', { style: 'position:relative' });
  el.append(info, stage);
  const kit = createScene(stage, { cam: [0, 0, 160], autoRotate: 0.6, fov: 30 });
  const [hbP, catP, colP] = await Promise.all(['4HHB', '1DGF', '1CAG'].map(loadPDB));
  const hb = buildProtein(hbP, { colorBy: (ci) => (ci % 2 ? 0x1f6fff : 0xff2d55), hets: ['HEM'], hetColor: 0xffd60a });
  const hbG = feGlows(hbP, hb, 0xff9f0a, 8);
  const cat = buildProtein(catP, { colorBy: (ci) => [0x1fbf4f, 0x52d67c, 0x1fbf4f, 0x52d67c][ci], hets: ['HEM'], hetColor: 0xff2d55 });
  const colMod = { het: [], chains: colP.chains.map((c) => ({ ...c, ss: 'C'.repeat(c.res.length) })) };
  const col = buildProtein(colMod, { colorBy: (ci) => [0xffd60a, 0xff9f0a, 0xff6b3d][ci], coil: 1.1 });
  const colWrap = new THREE.Group();
  col.rotation.z = 0;
  colWrap.add(col);
  // align collagen axis with x
  const cr = colP.chains[0].res;
  const cax = new THREE.Vector3(cr.at(-1)[2] - cr[0][2], cr.at(-1)[3] - cr[0][3], cr.at(-1)[4] - cr[0][4]).normalize();
  col.quaternion.setFromUnitVectors(cax, new THREE.Vector3(1, 0, 0));
  const models = [hb, cat, colWrap];
  models.forEach((m) => { m.scale.setScalar(0.001); m.visible = false; kit.root.add(m); });
  kit.onFrame((dt, t) => { hbG.forEach((g) => g.scale.setScalar(7 + 2 * Math.sin(t * 1.6))); colWrap.rotation.x += dt * 0.5; });
  const Q = [
    { n: 4, type: 'Heterotetramer', sub: '2 α (red) + 2 β (blue) chains', body: 'Different subunits, each with a heme.', model: 'Hemoglobin · PDB 4HHB' },
    { n: 4, type: 'Homotetramer', sub: '4 identical subunits', body: 'Catalase: structurally identical chains.', model: 'Human catalase · PDB 1DGF' },
    { n: 3, type: 'Heterotrimer', sub: 'Collagen (type I: 2 α1 + 1 α2)', body: 'Three chains wound into a triple helix.', model: 'Model: collagen-like peptide (PDB 1CAG) — shows the triple-helix shape only; its chains are identical' },
  ];
  const big = h('div.grad-text', { style: 'font:760 170px var(--font);letter-spacing:-.06em;line-height:.85' });
  const bigK = h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:-4px', text: 'subunits' });
  const type = h('div', { style: 'font-size:48px;font-weight:700;letter-spacing:-.02em;margin-top:10px' });
  const subT = h('div', { style: 'font-size:29px;color:var(--fg-2);line-height:1.3' });
  const modelT = h('div', { style: 'font-size:22px;color:var(--fg-3);line-height:1.35;min-height:60px' });
  const sg = seg({ options: [{ v: 0, t: 'Hemoglobin' }, { v: 1, t: 'Catalase' }, { v: 2, t: 'Collagen' }], value: 0, onChange: (v) => pick(v) });
  sg.el.style.alignSelf = 'flex-start';
  const more = h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;margin-top:6px' });
  [
    ['Antibodies · heterotetramer', { title: 'Antibodies', body: 'Heterotetramer (slide 24). Textbook: 2 heavy + 2 light chains held by disulfide bonds.', src: `${SRC(24)} · textbook` }],
    ['Ferritin · 24 subunits', { title: 'Ferritin', body: '24 subunits — a heteropolymer (slide 24).', src: SRC(24) }],
    ['Dimer · trimer · tetramer', { title: 'Named by subunit count', body: 'More than one subunit = quaternary level: dimer (2), trimer (3), tetramer (4)… <b>Homo</b>multimer: identical subunits; <b>hetero</b>multimer: different subunits.', src: SRC(24) }],
  ].forEach(([t, sp]) => { const e = h('span.chip.acc', { style: 'font-size:23px;padding:8px 16px;cursor:help', text: t }); tip(e, sp); more.append(e); });
  info.append(sg.el, h('div', { style: 'height:8px' }), big, bigK, type, subT, modelT, more);
  let cur = -1;
  const fitTo = (m, k) => {
    const was = m.scale.x;
    m.scale.setScalar(1);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3();
    m.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    m.scale.setScalar(was);
    const sz = box.getSize(new THREE.Vector3());
    const t = Math.tan(THREE.MathUtils.degToRad(kit.camera.fov) / 2);
    const w = k === 2 ? sz.x : Math.max(sz.x, sz.z), hh = k === 2 ? Math.max(sz.y, sz.z) : sz.y;
    const dist = Math.max(hh / 2 / t, w / 2 / (t * kit.camera.aspect)) / (k === 2 ? 0.92 : 0.86) + (k === 2 ? hh : w) / 2;
    const dir = k === 2 ? new THREE.Vector3(0, 0.12, 1).normalize() : kit.camera.position.clone().sub(kit.controls.target).normalize();
    gsap.to(kit.camera.position, { x: dir.x * dist, y: dir.y * dist, z: dir.z * dist, duration: 1, ease: 'power2.inOut' });
    kit.controls.target.set(0, 0, 0);
    kit.camera.far = dist * 10; kit.camera.updateProjectionMatrix();
  };
  function pick(k) {
    if (k === cur) return;
    const prev = cur;
    cur = k;
    sg.set(k, false);
    models.forEach((m, i) => {
      gsap.killTweensOf(m.scale);
      if (i === k) { m.visible = true; gsap.to(m.scale, { x: 1, y: 1, z: 1, duration: 0.9, delay: prev < 0 ? 0 : 0.3, ease: 'back.out(1.3)' }); }
      else gsap.to(m.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { if (cur !== i) m.visible = false; } });
    });
    kit.controls.autoRotate = k !== 2;
    fitTo(models[k], k);
    const q = Q[k];
    countTo(big, q.n, { from: +big.textContent || 0, duration: 0.8 });
    type.textContent = q.type;
    subT.textContent = q.sub;
    modelT.textContent = q.model;
  }
  pick(0);
  return kitController(kit, { step: (n) => pick(Math.min(2, n)) });
}

// 20 · Bonds per level matrix
const BONDS = [
  { g: 'Covalent', t: 'Peptide bonds', lv: [1, 0, 0, 0], added: true, art: 'pep', body: 'Covalent –CO–NH– links between amino acids. They hold the primary sequence and survive denaturation.' },
  { g: 'Covalent', t: 'Disulfide bonds', lv: [0, 0, 1, 1], art: 'ss', body: 'Covalent S–S bridge between two cysteine side chains (textbook: forms cystine). Slide 28 says denaturation breaks them; textbooks: a reducing agent is needed.' },
  { g: 'Non-covalent', t: 'Hydrogen bonds', lv: [0, 1, 1, 1], art: 'hb', body: 'An H shared between O/N atoms. Backbone C=O···H–N bonds build helices and sheets; side-chain H-bonds help hold the fold.' },
  { g: 'Non-covalent', t: 'Ionic bonds', lv: [0, 0, 1, 1], art: 'ion', body: 'Attraction between opposite charges — textbook example: –COO⁻ (Asp, Glu) with –NH₃⁺ (Lys, Arg).' },
  { g: 'Non-covalent', t: 'Hydrophobic interactions', lv: [0, 0, 1, 1], art: 'hyd', body: 'Non-polar side chains cluster together, away from water, in the core of the fold.' },
  { g: 'Non-covalent', t: 'Van der Waals forces', lv: [0, 0, 1, 1], art: 'vdw', body: 'Weak attractions between atoms in close contact — individually tiny, collectively large.' },
];
function bondArt(host, kind) {
  host.innerHTML = '';
  const D = diagram(host, 480, 260);
  D.svg.style.height = '260px';
  const lp = loops();
  const L = D.layers;
  if (kind === 'pep') {
    lineEl(L.edges, [70, 140], [190, 140]); lineEl(L.edges, [290, 140], [410, 140]);
    lineEl(L.edges, [182, 140], [182, 60]); lineEl(L.edges, [198, 140], [198, 60]); lineEl(L.edges, [290, 140], [290, 216]);
    lineEl(L.fx, [190, 140], [290, 140], `stroke:${PEP};stroke-width:28;stroke-linecap:round;opacity:.25`);
    const pb = lineEl(L.fx, [190, 140], [290, 140], `stroke:${PEP};stroke-width:12;stroke-linecap:round`);
    atomG(L.nodes, 70, 140, 'C_{α}', RC, 32, { fs: 24 }); atomG(L.nodes, 190, 140, 'C', AC, 30); atomG(L.nodes, 190, 52, 'O', AC, 28);
    atomG(L.nodes, 290, 140, 'N', AM, 30); atomG(L.nodes, 290, 220, 'H', AM, 22); atomG(L.nodes, 410, 140, 'C_{α}', RC, 32, { fs: 24 });
    lp.add(gsap.to(pb, { opacity: 0.45, duration: 0.8, yoyo: true, repeat: -1 }));
  } else if (kind === 'ss') {
    lineEl(L.edges, [50, 160], [130, 110]); lineEl(L.edges, [130, 110], [200, 140]); lineEl(L.edges, [280, 140], [350, 110]); lineEl(L.edges, [350, 110], [430, 160]);
    lineEl(L.fx, [200, 140], [280, 140], 'stroke:var(--atp);stroke-width:28;stroke-linecap:round;opacity:.25');
    const b = lineEl(L.fx, [200, 140], [280, 140], 'stroke:var(--atp);stroke-width:12;stroke-linecap:round');
    atomG(L.nodes, 50, 160, 'C_{α}', RC, 30, { fs: 22 }); atomG(L.nodes, 130, 110, 'C', 'var(--co2)', 24); atomG(L.nodes, 200, 140, 'S', 'var(--atp)', 32);
    atomG(L.nodes, 280, 140, 'S', 'var(--atp)', 32); atomG(L.nodes, 350, 110, 'C', 'var(--co2)', 24); atomG(L.nodes, 430, 160, 'C_{α}', RC, 30, { fs: 22 });
    D.text(240, 230, 'Cys — S–S — Cys', { anchor: 'middle', style: 'fill:var(--fg-2);font-weight:650' });
    lp.add(gsap.to(b, { opacity: 0.5, duration: 0.8, yoyo: true, repeat: -1 }));
  } else if (kind === 'hb') {
    lineEl(L.edges, [110, 60], [110, 110]); lineEl(L.edges, [370, 200], [370, 150]);
    atomG(L.nodes, 110, 60, 'C', AC, 28); atomG(L.nodes, 110, 120, 'O', AC, 30); atomG(L.nodes, 370, 200, 'N', AM, 30); atomG(L.nodes, 370, 140, 'H', AM, 24);
    const d = s('path', { d: 'M138,124 Q250,150 344,140', style: `fill:none;stroke:${PEP};stroke-width:5;stroke-dasharray:8 9` });
    L.fx.append(d);
    D.text(240, 236, 'C=O ··· H–N', { anchor: 'middle', style: `fill:${PEP};font-weight:700` });
    lp.add(gsap.to(d, { strokeDashoffset: -34, duration: 0.9, repeat: -1, ease: 'none' }));
  } else if (kind === 'ion') {
    const a = s('g'); a.append(s('rect', { x: 40, y: 100, width: 150, height: 70, rx: 22, style: `fill:color-mix(in oklab, ${AC} 16%, transparent);stroke:${AC};stroke-width:2.5` })); const ta = s('text', { x: 115, y: 146, 'text-anchor': 'middle', class: 'v-label', style: `font-size:32px;font-weight:700;fill:${AC}` }); setRich(ta, '–COO^{−}'); a.append(ta);
    const b = s('g'); b.append(s('rect', { x: 290, y: 100, width: 150, height: 70, rx: 22, style: `fill:color-mix(in oklab, ${AM} 16%, transparent);stroke:${AM};stroke-width:2.5` })); const tb = s('text', { x: 365, y: 146, 'text-anchor': 'middle', class: 'v-label', style: `font-size:32px;font-weight:700;fill:${AM}` }); setRich(tb, '^{+}H_{3}N–'); b.append(tb);
    L.nodes.append(a, b);
    const d = s('path', { d: 'M196,135 L284,135', style: 'stroke:var(--fg-2);stroke-width:4;stroke-dasharray:3 9;stroke-linecap:round' });
    L.fx.append(d);
    D.text(240, 230, 'e.g. Asp/Glu ··· Lys/Arg', { anchor: 'middle', style: 'fill:var(--fg-2);font-weight:600' });
    lp.add(gsap.to(a, { x: 14, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    lp.add(gsap.to(b, { x: -14, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  } else if (kind === 'hyd') {
    const R = rng(3);
    for (let k = 0; k < 26; k++) { const a = R() * Math.PI * 2, r = 110 + R() * 30; const w = s('circle', { cx: 240 + r * Math.cos(a) * 1.6, cy: 130 + r * Math.sin(a) * 0.85, r: 7, style: 'fill:var(--elec);opacity:.6' }); L.fx.append(w); lp.add(gsap.to(w, { x: (R() - 0.5) * 20, y: (R() - 0.5) * 20, duration: 1 + R(), yoyo: true, repeat: -1, ease: 'sine.inOut' })); }
    const core = [[200, 110], [260, 100], [290, 150], [230, 165], [180, 155]];
    core.forEach(([x, y]) => { const c = s('circle', { cx: x, cy: y, r: 30, style: 'fill:color-mix(in oklab, var(--prot) 55%, var(--bg));stroke:var(--prot);stroke-width:2' }); L.nodes.append(c); lp.add(gsap.to(c, { attr: { cx: 240 + (x - 240) * 0.78, cy: 132 + (y - 132) * 0.78 }, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' })); });
    D.text(240, 250, 'non-polar R groups hide from water', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
  } else {
    const a = s('circle', { cx: 190, cy: 130, r: 62, style: 'fill:color-mix(in oklab, var(--a1) 25%, transparent);stroke:var(--a1);stroke-width:2' });
    const b = s('circle', { cx: 300, cy: 130, r: 62, style: 'fill:color-mix(in oklab, var(--a2) 25%, transparent);stroke:var(--a2);stroke-width:2' });
    L.nodes.append(a, b);
    D.text(190, 142, 'C', { anchor: 'middle', style: 'font-size:34px;font-weight:700' });
    D.text(300, 142, 'C', { anchor: 'middle', style: 'font-size:34px;font-weight:700' });
    D.text(245, 236, 'close contact · weak attraction', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
    lp.add(gsap.to(a, { attr: { r: 56 }, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    lp.add(gsap.to(b, { attr: { r: 68 }, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  }
  return { kill() { lp.kill(); D.destroy(); } };
}
function bondsViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1130px 1fr';
  el.style.gap = '44px';
  const table = h('div', { style: 'display:grid;grid-template-columns:190px 340px repeat(4,150px);grid-template-rows:70px repeat(6,90px);align-items:stretch;align-self:center' });
  const LVL = ['Primary', 'Secondary', 'Tertiary', 'Quaternary'];
  ['', 'Stabilising bond', ...LVL].forEach((t, i) => table.append(h('div', { style: `display:flex;align-items:center;${i > 1 ? 'justify-content:center;' : ''}font-size:${i > 1 ? 27 : 24}px;font-weight:680;color:${i > 1 ? 'var(--fg)' : 'var(--fg-3)'};border-bottom:2px solid var(--line-2);${i === 1 ? 'letter-spacing:.08em;text-transform:uppercase;font-size:22px;' : ''}`, text: t })));
  const ticks = [[], [], [], []];
  const rowCells = [];
  BONDS.forEach((b, r) => {
    const cells = [];
    if (r === 0 || r === 2) {
      const gc = h('div', { style: `grid-row:span ${r === 0 ? 2 : 4};display:flex;align-items:center;font-size:28px;font-weight:700;color:var(--ink);border-bottom:2px solid var(--line-2)`, text: b.g });
      table.append(gc);
    }
    const name = h('div', { style: 'display:flex;align-items:center;font-size:30px;font-weight:560;border-bottom:1px solid var(--line);padding-left:6px;border-radius:14px;transition:background .3s', text: b.t });
    table.append(name);
    cells.push(name);
    b.lv.forEach((on, c) => {
      const cell = h('div', { style: 'display:grid;place-items:center;border-bottom:1px solid var(--line);border-radius:14px;transition:background .3s;position:relative' });
      if (on) {
        const added = b.added && c === 0;
        const tk = h('div', { style: `width:${added ? 46 : 56}px;height:${added ? 46 : 56}px;border-radius:50%;display:grid;place-items:center;${added ? 'border:3px dashed var(--a1);color:var(--ink);background:transparent;margin-top:-18px' : 'background:var(--grad);color:#fff'};transform:scale(0);transition:transform .5s cubic-bezier(.34,1.56,.64,1)`, html: `<svg viewBox="0 0 24 24" width="${added ? 26 : 32}" height="${added ? 26 : 32}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` });
        cell.append(tk);
        if (added) {
          const ad = h('div', { style: 'position:absolute;bottom:4px;font-size:20px;font-weight:650;color:var(--ink);opacity:0;transition:opacity .5s', text: 'added*' });
          cell.append(ad);
          tk._extra = ad;
          tip(cell, { kicker: 'Accuracy note', title: 'Missing tick on slide 25', body: 'Slide 25 leaves the peptide-bond row empty. Peptide bonds are the bonds of the primary structure (slides 17–18), so the tick is added here.', src: 'Slides 17, 18, 25' });
        }
        ticks[c].push(tk);
      }
      table.append(cell);
      cells.push(cell);
    });
    cells.forEach((c) => c.addEventListener('pointerenter', () => sel(r)));
    rowCells.push(cells);
  });
  // detail panel
  const panel = h('div.card', { style: 'align-self:center;gap:14px;padding:36px 36px 34px' });
  const kk = h('div.k');
  const tt = h('h3', { style: 'font-size:42px' });
  const art = h('div', { style: 'position:relative;height:260px;margin:4px 0' });
  const body = h('p', { style: 'font-size:26px;line-height:1.36' });
  panel.append(kk, tt, art, body, h('div', { style: 'font-size:21px;color:var(--fg-3)', text: 'Hover a row to switch' }));
  el.append(table, panel);
  let cur = -1, artCtl = null;
  function sel(r) {
    if (r === cur) return;
    cur = r;
    rowCells.forEach((cells, k) => cells.forEach((c) => (c.style.background = k === r ? 'color-mix(in oklab, var(--a1) 10%, transparent)' : '')));
    const b = BONDS[r];
    kk.textContent = b.g;
    tt.textContent = b.t;
    body.textContent = b.body;
    artCtl?.kill();
    artCtl = bondArt(art, b.art);
  }
  sel(0);
  return {
    step(n) { ticks.forEach((list, c) => list.forEach((tk, i) => { tk.style.transitionDelay = `${i * 0.07}s`; tk.style.transform = n > c ? 'scale(1)' : 'scale(0)'; if (tk._extra) tk._extra.style.opacity = n > c ? 1 : 0; })); if (n >= 1 && n <= 4) sel(n === 1 ? 0 : 2); },
    destroy() { artCtl?.kill(); },
  };
}

// 22 · Protein quality control: chaperones, ubiquitin, proteasome
function qcViz(el) {
  const D = diagram(el, 1712, 720);
  const Lr = D.layers;
  const grp = (layer = Lr.nodes) => { const g = s('g'); layer.append(g); return g; };
  const txt = (g, x, y, str, col = 'var(--fg)', size = 28, w = 680) => { const t = s('text', { x, y, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${size}px;font-weight:${w};fill:${col}` }); setRich(t, str); g.append(t); return t; };
  const blob = (g, cx, cy, r, col, seed, tangled) => {
    const R = rng(seed), pts = [];
    const n = tangled ? 22 : 18;
    for (let k = 0; k < n; k++) { const a = k * (tangled ? 2.6 : 2.15); const rr = r * (tangled ? 0.25 + 0.75 * R() : 0.45 + 0.4 * Math.abs(Math.sin(k * 0.9))); pts.push([cx + rr * Math.cos(a) * 1.1, cy + rr * Math.sin(a)]); }
    g.append(s('path', { d: smooth(pts), style: `fill:none;stroke:${col};stroke-width:7;stroke-linecap:round;stroke-linejoin:round` }));
  };
  const arrow = (d, col, from, to) => D.arrow({ d, from, to, color: col, width: 4 });
  // ribosome + chain
  const g0 = grp();
  g0.append(s('ellipse', { cx: 120, cy: 340, rx: 72, ry: 46, style: 'fill:color-mix(in oklab, var(--co2) 28%, transparent);stroke:var(--co2);stroke-width:2.5' }));
  g0.append(s('ellipse', { cx: 120, cy: 404, rx: 52, ry: 28, style: 'fill:color-mix(in oklab, var(--co2) 28%, transparent);stroke:var(--co2);stroke-width:2.5' }));
  txt(g0, 120, 476, 'Ribosome', 'var(--fg-2)', 25, 600);
  const nat = grp();
  blob(nat, 560, 150, 62, 'var(--act)', 5, false);
  txt(nat, 560, 252, 'Native fold · active', 'var(--act)', 28);
  const aFold = arrow('M200,320 C300,240 380,160 470,150', 'var(--act)', [200, 320], [470, 150]);
  const aFoldL = D.text(300, 200, 'folds', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  // step 1: misfold
  const s1 = grp();
  blob(s1, 560, 470, 62, 'var(--inh)', 11, true);
  txt(s1, 560, 568, 'Misfolded', 'var(--inh)', 28);
  const aMis = arrow('M200,370 C300,420 380,470 470,470', 'var(--inh)', [200, 370], [470, 470]);
  const causes = grp();
  txt(causes, 270, 622, 'CAUSES', 'var(--fg-3)', 21, 700).style.letterSpacing = '.14em';
  [['Mutations', 60, 650], ['Translation errors', 250, 650], ['Stress', 60, 700], ['Aging', 210, 700]].forEach(([t, x, y]) => {
    const w = t.length * 13.5 + 36;
    causes.append(s('rect', { x, y: y - 20, width: w, height: 40, rx: 20, style: 'fill:color-mix(in oklab, var(--inh) 12%, transparent);stroke:color-mix(in oklab, var(--inh) 45%, transparent);stroke-width:1.5' }));
    const tx = s('text', { x: x + w / 2, y: y + 8, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--inh);font-weight:600' }); tx.textContent = t; causes.append(tx);
  });
  // step 2: chaperone
  const s2 = grp();
  s2.append(s('path', { d: 'M840,420 Q800,470 840,520', style: 'fill:none;stroke:var(--nadh);stroke-width:16;stroke-linecap:round' }), s('path', { d: 'M920,420 Q960,470 920,520', style: 'fill:none;stroke:var(--nadh);stroke-width:16;stroke-linecap:round' }));
  blob(s2, 880, 470, 30, 'var(--inh)', 13, true);
  txt(s2, 880, 568, 'Chaperone', 'var(--nadh)', 28);
  const aCh = arrow('M640,470 L790,470', 'var(--fg-3)', [640, 470], [790, 470]);
  const aRe = arrow('M880,400 C880,230 760,160 650,150', 'var(--act)', [880, 400], [650, 150]);
  const reL = D.text(860, 250, 'refolds', { cls: 'sm', style: 'fill:var(--act);font-weight:650' });
  // step 3: ubiquitin → proteasome
  const s3 = grp();
  blob(s3, 1170, 470, 40, 'var(--inh)', 17, true);
  [[1218, 420], [1246, 396], [1274, 372], [1302, 348]].forEach(([x, y]) => { s3.append(s('circle', { cx: x, cy: y, r: 16, style: 'fill:var(--atp)' })); const t = s('text', { x, y: y + 7, 'text-anchor': 'middle', style: 'font:800 16px var(--font);fill:#1d1d1f' }); t.textContent = 'Ub'; s3.append(t); });
  txt(s3, 1170, 568, 'Ubiquitin tags', 'var(--atp)', 28);
  const aUb = arrow('M960,470 L1110,470', 'var(--fg-3)', [960, 470], [1110, 470]);
  const failL = D.text(1035, 446, 'if refolding fails', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const prot = grp();
  [0, 1, 2, 3].forEach((k) => prot.append(s('rect', { x: 1400, y: 404 + k * 34, width: 90, height: 30, rx: 12, style: 'fill:color-mix(in oklab, var(--a1) 30%, transparent);stroke:var(--a1);stroke-width:2' })));
  txt(prot, 1445, 568, 'Proteasome', 'var(--ink)', 28);
  [[1580, 440, 20], [1620, 470, -15], [1570, 500, 30], [1640, 510, 5], [1605, 420, -25]].forEach(([x, y, a]) => prot.append(s('path', { d: `M${x - 16},${y} L${x + 16},${y}`, transform: `rotate(${a} ${x} ${y})`, style: 'stroke:var(--fg-2);stroke-width:7;stroke-linecap:round' })));
  txt(prot, 1610, 400, 'peptides', 'var(--fg-2)', 23, 600);
  const aPr = arrow('M1230,470 L1390,470', 'var(--fg-3)', [1230, 470], [1390, 470]);
  // step 4: aggregation
  const s4 = grp();
  [[860, 660], [900, 640], [940, 668], [985, 648]].forEach(([x, y], k) => blob(s4, x, y, 26, 'var(--inh)', 21 + k, true));
  const aggT = txt(s4, 1030, 666, 'Toxic aggregates · fibrils · plaques', 'var(--inh)', 26);
  aggT.setAttribute('text-anchor', 'start');
  const aAg = arrow('M630,590 C680,640 740,656 815,656', 'var(--inh)', [630, 590], [815, 656]);
  const groups = [[s1, aMis.g, causes], [s2, aCh.g, aRe.g, reL], [s3, aUb.g, failL, prot, aPr.g], [s4, aAg.g]];
  groups.flat().forEach((e) => (e.style.opacity = 0));
  const flows = [
    [D.flow(aFold, { count: 2, color: 'var(--act)', speed: 140, r: 8, autoplay: false })],
    [D.flow(aMis, { count: 2, color: 'var(--inh)', speed: 140, r: 8, autoplay: false })],
    [D.flow(aCh, { count: 2, color: 'var(--inh)', speed: 120, r: 8, autoplay: false }), D.flow(aRe, { count: 2, color: 'var(--act)', speed: 150, r: 8, autoplay: false })],
    [D.flow(aUb, { count: 2, color: 'var(--atp)', speed: 120, r: 8, autoplay: false }), D.flow(aPr, { count: 2, color: 'var(--atp)', speed: 120, r: 8, autoplay: false })],
    [D.flow(aAg, { count: 2, color: 'var(--inh)', speed: 120, r: 8, autoplay: false })],
  ];
  flows.flat().forEach((f) => f.hide());
  let cur = 0;
  const apply = (n) => {
    cur = n;
    groups.forEach((g, i) => show(g, n >= i + 1, { duration: 0.6 }));
    gsap.to([nat, aFold.g, aFoldL], { opacity: n === 0 || n === 2 ? 1 : 0.45, duration: 0.6 });
    flows.forEach((fs, i) => fs.forEach((f) => (i === n ? f.play() : f.hide())));
  };
  return { step: apply, enter: () => flows[cur]?.forEach((f) => f.play()), leave: () => D.pauseAll(), destroy: () => D.destroy() };
}

// 23 · Disease mini visuals
function vAmyloid(el) {
  const D = miniSvg(el, 320, 220);
  const lp = loops();
  const R = rng(9);
  for (let k = 0; k < 18; k++) {
    const x = 30 + R() * 260, y = 30 + R() * 160;
    const c = s('circle', { cx: x, cy: y, r: 8, style: 'fill:var(--inh);opacity:.85' });
    D.layers.nodes.append(c);
    lp.add(gsap.to(c, { attr: { cx: 160 + (R() - 0.5) * 50, cy: 110 + (R() - 0.5) * 40 }, duration: 2.2, delay: R() * 0.6, yoyo: true, repeat: -1, repeatDelay: 0.8, ease: 'power2.inOut' }));
  }
  return { destroy() { lp.kill(); D.destroy(); } };
}
function vPrion(el) {
  const D = miniSvg(el, 320, 220);
  const lp = loops();
  const path = s('path', { style: 'fill:none;stroke:var(--a1);stroke-width:7;stroke-linecap:round;stroke-linejoin:round' });
  D.layers.nodes.append(path);
  const lab = D.text(160, 200, '', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:650' });
  const st = { t: 0 };
  const draw = () => {
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const x = 30 + i * 8.1;
      const hy = 95 + 34 * Math.sin(i * 0.95);
      const sy = 95 + ((i % 8) < 4 ? -1 : 1) * 30 * (((i % 4) + 0.5) / 4.5);
      pts.push([x, hy + (sy - hy) * st.t]);
    }
    path.setAttribute('d', st.t > 0.5 ? `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L')}` : smooth(pts));
    path.style.stroke = st.t > 0.5 ? 'var(--inh)' : 'var(--a1)';
    setRich(lab, st.t > 0.5 ? 'PrP^{Sc} · β-sheet rich (infectious)' : 'PrP^{C} · α-helix rich (normal)');
  };
  draw();
  lp.add(gsap.to(st, { t: 1, duration: 1.4, yoyo: true, repeat: -1, repeatDelay: 1.4, ease: 'power2.inOut', onUpdate: draw }));
  return { destroy() { lp.kill(); D.destroy(); } };
}
function vCFTR(el) {
  const D = miniSvg(el, 320, 220);
  const lp = loops();
  D.layers.regions.append(s('rect', { x: 0, y: 64, width: 320, height: 44, rx: 10, style: 'fill:color-mix(in oklab, var(--prot) 22%, transparent);stroke:color-mix(in oklab, var(--prot) 55%, transparent);stroke-width:2' }));
  D.layers.regions.append(s('rect', { x: 132, y: 58, width: 56, height: 56, rx: 12, style: 'fill:var(--bg);stroke:var(--fg-3);stroke-width:2;stroke-dasharray:6 6' }));
  D.text(160, 98, '✕', { anchor: 'middle', style: 'font-size:34px;font-weight:800;fill:var(--inh)' });
  D.text(160, 40, 'no CFTR channel', { anchor: 'middle', cls: 'sm', style: 'fill:var(--inh);font-weight:650' });
  const R = rng(4);
  for (let k = 0; k < 7; k++) {
    const x = 40 + k * 40;
    const c = s('circle', { cx: x, cy: 170, r: 13, style: 'fill:var(--act);opacity:.85' });
    const t = s('text', { x, y: 176, 'text-anchor': 'middle', style: 'font:800 14px var(--font);fill:#1d1d1f' }); t.textContent = 'Cl';
    D.layers.nodes.append(c, t);
    lp.add(gsap.to([c, t], { y: -36, duration: 0.8 + R() * 0.5, yoyo: true, repeat: -1, ease: 'power1.inOut', delay: R() }));
  }
  return { destroy() { lp.kill(); D.destroy(); } };
}
function vSynuclein(el) {
  const D = miniSvg(el, 320, 220);
  const lp = loops();
  D.layers.regions.append(s('ellipse', { cx: 150, cy: 110, rx: 84, ry: 70, style: 'fill:color-mix(in oklab, var(--a2) 12%, transparent);stroke:var(--a2);stroke-width:3' }));
  [[230, 80, 300, 40], [232, 130, 306, 170], [70, 90, 14, 50], [80, 150, 20, 196]].forEach(([a, b, c, d]) => lineEl(D.layers.regions, [a, b], [c, d], 'stroke:var(--a2);stroke-width:4;stroke-linecap:round'));
  const g = s('g');
  const R = rng(12);
  for (let k = 0; k < 12; k++) g.append(s('circle', { cx: 160 + (R() - 0.5) * 34, cy: 112 + (R() - 0.5) * 30, r: 8 + R() * 5, style: 'fill:var(--inh);opacity:.8' }));
  D.layers.nodes.append(g);
  lp.add(gsap.fromTo(g, { scale: 0.5, svgOrigin: '160 112' }, { scale: 1.15, svgOrigin: '160 112', duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  return { destroy() { lp.kill(); D.destroy(); } };
}

// 24 · Denaturation lab: heat unfolds, peptide bonds stay, S–S needs a reducing agent
function denatViz(el) {
  const kit = createScene(el, { cam: [0, 6, 70], autoRotate: 0.4, fov: 30 });
  kit.root.position.y = -4.5;
  const N = 30, CY1 = 6, CY2 = 23;
  const nat = [], uss = [], ured = [];
  for (let i = 0; i < 13; i++) { const th = (i * 100 + 120) * DEG; nat.push(new THREE.Vector3(-5 + 2.3 * Math.cos(th), -9 + 1.5 * i, 2.3 * Math.sin(th))); }
  for (let k = 0; k < 4; k++) { const a = Math.PI * (1 - (k + 1) / 5); nat.push(new THREE.Vector3(5 * Math.cos(a), 10 + 3.2 * Math.sin(a), 0)); }
  for (let j = 0; j < 13; j++) { const th = (j * 100 - 60) * DEG; nat.push(new THREE.Vector3(5 + 2.3 * Math.cos(th), 9 - 1.5 * j, 2.3 * Math.sin(th))); }
  const R = rng(42);
  // denatured, disulfide intact: residues 6..23 form a floppy loop
  const loopN = CY2 - CY1;
  for (let i = 0; i < N; i++) uss.push(new THREE.Vector3());
  for (let k = 0; k <= loopN; k++) {
    const a = (-100 + (k / loopN) * 340) * DEG;
    const rr = 10.5 + (R() - 0.5) * 2.4;
    uss[CY1 + k].set(rr * Math.cos(a), -1 + rr * Math.sin(a), 3.2 * Math.sin(k * 0.9) + (R() - 0.5) * 2);
  }
  const walk = (arr, from, to, stepDir, bias) => {
    const p = arr[from].clone();
    for (let i = to; stepDir < 0 ? i >= 0 : i < N; i += stepDir) {
      p.add(new THREE.Vector3(bias[0] + (R() - 0.5) * 2.2, bias[1] + (R() - 0.5) * 2.2, bias[2] + (R() - 0.5) * 2.2).setLength(3.6));
      arr[i].copy(p);
      if (i === (stepDir < 0 ? 0 : N - 1)) break;
    }
  };
  walk(uss, CY1, CY1 - 1, -1, [-0.9, -0.25, 0.3]);
  walk(uss, CY2, CY2 + 1, 1, [0.9, -0.25, -0.3]);
  { const cc = centroid(uss.map((v) => v.clone())); uss.forEach((v) => v.sub(cc).add(new THREE.Vector3(0, 4.5, 0))); }
  { const p = new THREE.Vector3(); for (let i = 0; i < N; i++) { ured.push(p.clone()); p.add(new THREE.Vector3(0.95 + (R() - 0.5) * 1.2, Math.sin(i * 0.8) * 2.2 + (R() - 0.5) * 2.4, (R() - 0.5) * 4.5).setLength(3.5)); } const cc = centroid(ured.map((v) => v.clone())); ured.forEach((v) => v.sub(cc).add(new THREE.Vector3(0, 4.5, 0))); }
  // meshes
  const beadMats = Array.from({ length: N }, (_, i) => glossy(new THREE.Color().setHSL(0.78 - 0.12 * (i / N), 0.6, 0.62).getHex()));
  const cysMat = glossy(0xffd60a, { emissive: 0x403000 });
  const beads = nat.map((p, i) => { const m = new THREE.Mesh(BALL, i === CY1 || i === CY2 ? cysMat : beadMats[i]); m.scale.setScalar(i === CY1 || i === CY2 ? 1.05 : 0.85); kit.root.add(m); return m; });
  const linkMat = new THREE.MeshPhysicalMaterial({ color: 0x64d2ff, emissive: 0x0a5a80, emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 0.5 });
  const links = Array.from({ length: N - 1 }, () => { const m = new THREE.Mesh(STICK, linkMat); kit.root.add(m); return m; });
  const hbPairs = [];
  for (let i = 0; i + 4 <= 12; i++) hbPairs.push([i, i + 4]);
  for (let i = 17; i + 4 <= 29; i++) hbPairs.push([i, i + 4]);
  const hbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const hbSeg = hbPairs.map(() => Array.from({ length: 5 }, () => { const m = new THREE.Mesh(STICK, hbMat); kit.root.add(m); return m; }));
  const ssMat = new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 1 });
  const ss = new THREE.Mesh(STICK, ssMat);
  kit.root.add(ss);
  const ssGlow = glowSprite(0xffd60a, 4);
  kit.root.add(ssGlow);
  const ssL = tag(kit, 'S–S', [0, 0, 0], kit.root, { color: 'var(--atp)', cls: '', size: 24 });
  const sh1 = tag(kit, '–SH', [0, 0, 0], kit.root, { color: 'var(--atp)' });
  const sh2 = tag(kit, '–SH', [0, 0, 0], kit.root, { color: 'var(--atp)' });
  const up = new THREE.Vector3(0, 1, 0);
  const place = (m, a, b, r) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(r, Math.max(0.001, a.distanceTo(b)), r); m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); };
  const st = { t: 0, r: 0 };
  const P = nat.map((p) => p.clone());
  const tmp = new THREE.Vector3();
  kit.onFrame(() => {
    for (let i = 0; i < N; i++) { tmp.copy(uss[i]).lerp(ured[i], st.r); P[i].copy(nat[i]).lerp(tmp, st.t); beads[i].position.copy(P[i]); }
    for (let i = 0; i < N - 1; i++) place(links[i], P[i], P[i + 1], 0.34);
    hbPairs.forEach(([a, b], k) => {
      const d = P[b].clone().sub(P[a]);
      hbSeg[k].forEach((m, j) => { const s0 = P[a].clone().addScaledVector(d, 0.15 + j * 0.15), s1 = P[a].clone().addScaledVector(d, 0.15 + j * 0.15 + 0.08); place(m, s0, s1, 0.12); });
    });
    hbMat.opacity = Math.max(0, 0.8 * (1 - st.t * 1.8));
    place(ss, P[CY1], P[CY2], 0.42);
    ssMat.opacity = 1 - st.r;
    ss.visible = st.r < 0.98;
    ssGlow.position.copy(P[CY1]).add(P[CY2]).multiplyScalar(0.5);
    ssGlow.material.opacity = 0.8 * (1 - st.r);
    ssL.position.copy(ssGlow.position).add(new THREE.Vector3(0, 2.4, 0));
    sh1.position.copy(P[CY1]).add(new THREE.Vector3(-1.5, 2.2, 0));
    sh2.position.copy(P[CY2]).add(new THREE.Vector3(1.5, 2.2, 0));
    showLbl(ssL, st.r < 0.5); showLbl(sh1, st.r >= 0.5); showLbl(sh2, st.r >= 0.5);
    kit.camera.position.setLength(70 + 26 * st.t);
  });
  // status panel
  const row = (name) => { const v = h('span', { style: 'font-weight:700' }); const r = h('div', { style: 'display:flex;justify-content:space-between;gap:24px;font-size:25px;padding:8px 0;border-bottom:1px solid var(--line)' }, [h('span', { style: 'color:var(--fg-2)', html: name }), v]); return { r, v }; };
  const rPep = row('Peptide bonds');
  const rNon = row('Non-covalent bonds');
  const rSS = row('Disulfide S–S');
  const left = h('div', { style: 'font-size:26px;font-weight:700;margin-top:12px' });
  const panel = h('div', { style: 'position:absolute;left:0;top:0;width:440px;padding:20px 26px;border-radius:26px;background:var(--glass);border:1px solid var(--line);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);z-index:3' }, [rPep.r, rNon.r, rSS.r, left]);
  el.append(panel);
  const setV = (o, ok, a, b) => { o.v.textContent = ok ? a : b; o.v.style.color = ok ? 'var(--act)' : 'var(--inh)'; };
  const status = () => {
    setV(rPep, true, '✓ intact', '');
    setV(rNon, st.t < 0.5, '✓ intact', '✕ broken');
    setV(rSS, st.r < 0.5, '✓ intact', '✕ reduced');
    left.innerHTML = st.t >= 0.5 ? 'Left: <span style="color:var(--nadh)">primary structure</span>' : 'Native: 1° · 2° · 3° intact';
  };
  const tOf = (T) => Math.max(0, Math.min(1, (T - 50) / 30));
  const sl = slider({ label: 'Heat', min: 37, max: 100, step: 1, value: 37, fmt: (v) => `${Math.round(v)} °C`, width: 300, onInput: (v) => { gsap.to(st, { t: tOf(v), duration: 0.6, onUpdate: status }); } });
  const tg = toggle({ label: 'Reducing agent', on: false, onChange: (on) => gsap.to(st, { r: on ? 1 : 0, duration: 1.4, ease: 'power2.inOut', onUpdate: status }) });
  tip(tg.el, { kicker: 'Accuracy note', title: 'Disulfides need a reducing agent', body: 'Slide 28 says denaturation breaks disulfide bonds. Urea, guanidine, SDS, heat or ethanol alone do not; a reducing agent (e.g. β-mercaptoethanol) is required (textbook).', src: 'Slide 28 · Lippincott Ch 2' });
  ctrlBar(el, [sl, tg], { left: 0, bottom: 0 });
  hideHint(el);
  status();
  return kitController(kit, {
    step(n) {
      const T = n >= 1 ? 100 : 37;
      sl.set(T, false);
      gsap.to(st, { t: tOf(T), duration: 2, ease: 'power2.inOut', onUpdate: status });
      tg.set(n >= 2, false);
      gsap.to(st, { r: n >= 2 ? 1 : 0, duration: 1.4, ease: 'power2.inOut', onUpdate: status, delay: n >= 2 ? 0.3 : 0 });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry — Ch 1 Amino Acids; Ch 2 Structure of Proteins',
    'Lecture slides: Amino acids & proteins (L.3–L.4), NUST College of Medicine',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.3 – L.4',
      title: 'Amino Acids<br>&amp; <em>Proteins</em>',
      subtitle: 'Twenty building blocks. Four levels of shape.',
      meta: ['L.3 · Amino acids', 'L.4 · Protein structure', '9 learning outcomes'],
      notes: [
        'Two linked sessions: L.3 amino acids (lecture slides 2–14) and L.4 protein structure (slides 16–31).',
        'On the right: real human hemoglobin (PDB 4HHB). Two α chains (purple), two β chains (indigo), each holding a glowing heme. Drag to rotate.',
        'Hemoglobin is today’s thread: a sequence of amino acids (primary), coiled into helices (secondary), each chain folded (tertiary), four chains assembled (quaternary).',
        'Roadmap: structure & chirality → acid–base & pI → classification → peptide bond → four levels → misfolding & denaturation.',
      ],
      visual: heroViz,
    },
    {
      layout: 'full',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      bullets: [{ t: 'Hover a row for the full wording' }],
      src: 'Lecture slides 2, 16',
      notes: [
        'Hover any row for the verbatim SLO.',
        'L.3.2 (list the 20) and L.3.5 (biologically important peptides) have no content on the slides. The 20 appear later in the classification explorer, with membership from Lippincott.',
        'Essential amino acids and metabolic fate (L.3.3–L.3.4) are only headings on slide 13; they are in the explorer’s “Essential*” and “Fate*” tabs.',
      ],
      visual: sloViz,
    },
    {
      eyebrow: 'L.3.1 · Definition',
      title: 'One carbon, <em>four groups</em>',
      subtitle: 'Bonded to the central α-carbon:',
      bullets: [
        { t: '<b style="color:var(--elec)">Amino</b> group · basic', step: 1, tip: { title: 'Amino group (–NH₂)', body: 'The <b>basic</b> group: it can accept a proton (H⁺).', src: SRC(3) } },
        { t: '<b style="color:var(--inh)">Carboxyl</b> group · acidic', step: 2, tip: { title: 'Carboxyl group (–COOH)', body: 'The <b>acidic</b> group: it can donate a proton (H⁺).', src: SRC(3) } },
        { t: 'A <b style="color:var(--act)">hydrogen</b> atom', step: 3 },
        { t: '<b>R group</b> · sets identity', step: 4, tip: { title: 'Side chain (R group)', body: 'A variable side chain that <b>uniquely determines the identity and properties</b> of each amino acid. In alanine R = –CH₃.', src: SRC(3) } },
      ],
      steps: 4,
      src: 'Lecture slides 1, 3 · 3D: L-alanine (PubChem), non-ionised as drawn on the slide',
      notes: [
        'Definition (slide 3): an organic molecule with a central carbon (Cα) carrying four groups.',
        'Press → to light each group in the slide’s colour code: amino (basic, blue) → carboxyl (acidic, red) → H (green) → R (magenta).',
        'The R group alone decides which amino acid it is. Alanine, the slide’s example: R = CH₃.',
        'Drawn non-ionised, as on the slide. In water at physiological pH it is really a zwitterion — two slides from now.',
      ],
      visual: structureViz,
    },
    {
      layout: 'full',
      eyebrow: 'Stereochemistry · D and L',
      title: 'Mirror images that <em>never</em> match',
      bullets: [
        { t: 'Four different groups → chiral', tip: { title: 'Chiral centre', body: 'Cα of most amino acids carries <b>4 different groups</b>, so all amino acids except glycine are chiral and exist as two mirror-image forms, D and L.', src: SRC(4) } },
        { t: 'Glycine: the exception', tip: { title: 'Glycine', body: 'R = H, so Cα carries two identical H atoms → <b>not chiral</b>. It is also the smallest amino acid.', src: SRC(4) } },
      ],
      steps: 3,
      src: 'Lecture slides 4–5 · 3D: L-alanine (PubChem) and its exact mirror image, Fischer view (COOH up, R down, both pointing away)',
      notes: [
        'Cα with four different groups is a chiral centre. All amino acids except glycine are chiral: two mirror-image forms, D and L — enantiomers, like left and right hands (slide 5).',
        'Fischer view: COOH up and R down, both pointing away; NH₂ on the left = L.',
        'Build 1: slide the mirror image onto the original. COOH and CH₃ line up, but NH₂ and H swap. They can never be superimposed.',
        'Builds 2–3: glycine has two H on Cα, so its mirror image is itself → it superimposes → achiral.',
        'Proteins almost always use L-amino acids: the enzymes of protein synthesis use only L-enantiomers. D-amino acids resist enzymes, so they are built into peptide drugs to make them more stable (slide 5).',
        'Caution: slide 4 says D and L rotate light right and left. In textbooks D/L is the configuration relative to glyceraldehyde, not the direction of rotation (L-alanine is +). Avoid “L = rotates left”.',
      ],
      visual: chiralViz,
    },
    {
      layout: 'full',
      eyebrow: 'Structural variants',
      title: 'α, β and <em>imino</em>',
      bullets: [
        { t: 'Protein amino acids are α', tip: { title: 'α vs β', body: 'α: amino group on Cα, the carbon next to COOH. β: amino group on Cβ, as in β-alanine (textbook: a non-protein amino acid found in coenzyme A and carnosine).', src: `${SRC(6)} · textbook` } },
        { t: 'Proline: N in a ring', tip: { title: 'Proline · imino acid', body: 'Its side chain bonds back to the α-nitrogen, closing a five-membered ring. The N keeps only one H.', src: SRC(4) } },
      ],
      steps: 2,
      src: 'Lecture slides 4, 6 · 3D: PubChem structures, all H shown (slide 6 omits some)',
      notes: [
        'α-amino acid: NH₂ on the α-carbon, next to COOH. All 20 protein amino acids are α.',
        'Build 1: β-alanine moves NH₂ to the β-carbon. Textbook: it is non-protein — part of pantothenic acid/coenzyme A and of carnosine.',
        'Build 2: proline (slide 4). Its side chain loops back to the α-nitrogen → a five-membered ring, and N keeps a single H → “imino acid”. This is why it breaks α-helices later.',
        'Slide 6 leaves out some H atoms; the 3D models show them all.',
      ],
      visual: variantsViz,
    },
    {
      eyebrow: 'L.3.4 · Acid–base',
      title: 'Acid <em>and</em> base in one',
      bullets: [
        { t: '<b>Amphoteric</b>: acts as acid or base', tip: { title: 'Amphoteric (Greek “both”)', body: 'Has both a <b>basic</b> group (–NH₂) and an <b>acidic</b> group (–COOH), so it can act as either an acid or a base.', src: SRC(7) } },
        { t: '<b>Zwitterion</b>: + and − together', tip: { title: 'Zwitterion (German “hybrid ion”)', body: 'A dipolar ion. Amino acids exist like this in the solid state and largely in aqueous solution.', src: SRC(7) } },
        { t: 'Net charge: <b>zero</b>', tip: { title: 'Why zero?', body: 'An <b>equal</b> number of positive and negative groups: –NH₃⁺ and –COO⁻.', src: SRC(7) } },
      ],
      steps: 1,
      src: 'Lecture slide 7 · proton hop drawn as one step for clarity',
      notes: [
        'Amphoteric (Greek “both”): one molecule with a basic NH₂ and an acidic COOH, so it can accept or donate H⁺.',
        'Press →: COOH loses H⁺ and NH₂ gains H⁺ → ⁺H₃N–CH(R)–COO⁻, the zwitterion (German “hybrid ion”). Drawn as a single hop for clarity; in water the protons exchange with the solvent.',
        'Zwitterion: equal numbers of + and − groups → net charge zero. This is the form in the solid state and largely in aqueous solution.',
        'Note: slide 7’s drawing puts “+” on an NH₂ and “−” on an O that still holds H⁺. The correct charged groups are –NH₃⁺ and –COO⁻.',
      ],
      visual: amphoViz,
    },
    {
      layout: 'full',
      eyebrow: 'Isoelectric point',
      title: 'Charge follows <em>pH</em>',
      bullets: [
        { t: 'pI = pH of zero net charge', tip: { title: 'Isoelectric point (pI)', body: 'The pH at which the net charge is zero. For a neutral R group, pI = (pK₁ + pK₂)/2 — about 6.0 for glycine (textbook). It is <b>not</b> necessarily pH 7.', src: 'Slide 8 · textbook' } },
        { t: 'pI depends on the R group', tip: { title: 'pI varies with R', body: 'Slide 8. Textbook: acidic amino acids have a low pI (Asp ≈ 2.8), basic ones a high pI (Lys ≈ 9.7).', src: 'Slide 8 · textbook' } },
      ],
      steps: 3,
      src: 'Lecture slides 8, 10 · glycine pK₁ 2.3 / pK₂ 9.6 are standard textbook values (not on the slides) · idealised curve',
      notes: [
        'Drag the pH slider or press →: pH 1 → cation (⁺H₃N … COOH, +1); pH ≈ 6 → zwitterion (0); pH 12 → anion (H₂N … COO⁻, −1). Same order as slide 8.',
        'Isoelectric point (pI) = the pH at which the net charge is zero. For glycine: (2.3 + 9.6)/2 ≈ 6.0.',
        'The zwitterion dominates over a broad range (roughly pH 3–9). Slide 8’s label “Neutral pH (pI)” means net-neutral, not pH 7. pI shifts with the R group: textbook Asp ≈ 2.8, Lys ≈ 9.7.',
        'Titration curve (right): the flat shaded zones around each pK are where the amino acid buffers. This answers the next question.',
      ],
      visual: phViz,
    },
    {
      layout: 'full',
      eyebrow: 'Learning check · slide 10',
      title: 'Why can amino acids <em>buffer</em>?',
      bullets: [{ t: 'Press → to reveal' }],
      steps: 1,
      src: 'Lecture slide 10 (option b grammar tidied) · slide 7',
      notes: [
        'Ask the room first, then press →.',
        'Answer b: both a weakly acidic (–COOH) and a weakly basic (–NH₂) group. Each buffers near its own pK (the shaded zones), so amino acids buffer in distinct pH ranges.',
        'a, c, d and e describe nothing that can give or take H⁺.',
      ],
      visual: (el) => mcqViz(el, {
        q: 'Which chemical characteristic accounts for the ability of amino acids to function as effective buffers across distinct pH ranges?',
        opts: ['The hydrophobic nature of their aliphatic side chains.', 'The presence of both weakly acidic and basic groups.', 'The continuous hydrolysis of internal peptide bonds.', 'Their capacity to form rigid, inflexible cyclic structures.', 'The presence of a permanent central carbon atom.'],
        ans: 1,
        why: 'Amphoteric: the weakly acidic –COOH and weakly basic –NH₂ each buffer near their own pK — two distinct pH ranges.',
        side: sideTitration,
      }),
    },
    {
      eyebrow: 'L.3.3 · Classification rules',
      title: 'Polar, non-polar, <em>charged</em>',
      bullets: [
        { t: '<b>Non-polar</b>: only C and H', step: 1, tip: { title: 'Non-polar side chains', body: 'C–H bonds share electrons equally. Slide 12: aliphatic and aromatic amino acids are non-polar; aliphatic ones get more hydrophobic as carbons increase (slide 11). Note: Tyr (–OH) is aromatic but polar uncharged in Lippincott.', src: 'Slides 11–12 · Lippincott' } },
        { t: '<b>Polar</b>: O–H or N–H in R', step: 2, tip: { title: 'Polar, uncharged', body: 'O or N bonded to H pulls electrons → partial charges (δ−/δ+) that interact with water. The slide labels them “N−/H+”, but they are partial, not full, charges.', src: SRC(12) } },
        { t: '<b>Acidic</b>: extra COOH, gives H⁺', step: 3, tip: { title: 'Acidic amino acids', body: 'An extra carboxyl group in the side chain → donates protons. Textbook examples: aspartate, glutamate.', src: `${SRC(13)} · Lippincott` } },
        { t: '<b>Basic</b>: extra NH₂, takes H⁺', step: 4, tip: { title: 'Basic amino acids', body: 'An extra amino group in the side chain → accepts protons. Textbook examples: lysine, arginine, histidine (Arg and His carry other basic N groups).', src: `${SRC(13)} · Lippincott` } },
      ],
      steps: 4,
      focus: true,
      src: 'Lecture slides 11–13 · Asp and Lys examples from Lippincott',
      notes: [
        'Build 1: C–H bond — electrons shared equally → non-polar (aliphatic, aromatic per slide 12).',
        'Build 2: N–H (or O–H) — electrons pulled toward N/O → partial charges δ−/δ+ → polar, can H-bond with water.',
        'Build 3: an extra carboxyl in R gives H⁺ away → acidic (Asp, Glu).',
        'Build 4: an extra amino group in R takes H⁺ → basic (Lys, Arg, His).',
        'Flag: slide 12 calls all aromatics non-polar, but by its own O–H rule tyrosine is polar; Lippincott lists Tyr as polar uncharged.',
      ],
      visual: polarityViz,
    },
    {
      layout: 'full',
      eyebrow: 'L.3.2 – L.3.3 · The twenty',
      title: 'Twenty side chains, <em>sorted</em>',
      bullets: [{ t: 'Click a tile for 3D' }, { t: 'Hover for every class' }],
      steps: 2,
      src: 'Class names: lecture slides 11–13 · members, essential and fate: Lippincott (the slides list no amino acids) · 3D: PubChem',
      notes: [
        'The slides name classes but never list the 20 amino acids — membership here is from Lippincott.',
        'Side chain (slide 11): aliphatic, aromatic, sulfur, hydroxyl, carboxyl, amino, amide. Proline is not in the seven classes; slide 4 calls it the imino acid.',
        '→ Polarity (slide 12): non-polar, polar uncharged, charged − (Asp, Glu), charged + (Lys, Arg, His). → Acid–base (slide 13).',
        'Essential* and Fate* tabs: slide 13 gives these only as headings. Essential (Lippincott): His, Ile, Leu, Lys, Met, Phe, Thr, Trp, Val; Arg conditionally. Ketogenic only: Leu, Lys; both: Ile, Phe, Thr, Trp, Tyr.',
        'Flags: Tyr is polar uncharged in Lippincott (slide: aromatics non-polar). Arg (guanidino) and His (imidazole) are basic but not strictly “amino” groups.',
      ],
      visual: explorerViz,
    },
    {
      layout: 'full',
      eyebrow: 'Peptide bond',
      title: 'Joining amino <em>acids</em>',
      bullets: [{ t: 'COOH + NH₂ → CO–NH' }, { t: 'One H₂O lost per bond' }],
      steps: 3,
      src: 'Lecture slide 14 · water loss is implied on the slide (circled OH + H)',
      notes: [
        'Build 1: the OH of the first amino acid’s COOH and one H of the next amino acid’s NH₂ are circled (as on slide 14).',
        'Build 2: they leave as water (a condensation reaction) and the C–N peptide bond forms: –CO–NH–.',
        'Build 3: a tetrapeptide — 4 amino acids, 3 peptide bonds, 3 H₂O. n residues → n − 1 peptide bonds.',
        'The repeating N–Cα–C units are the backbone; R groups point alternately up and down. Free H₂N = N-terminus, free COOH = C-terminus.',
      ],
      visual: peptideFormViz,
    },
    {
      eyebrow: 'Up close · Lippincott Ch 2',
      title: 'A flat, <em>rigid</em> link',
      bullets: [
        { t: '<b>Partial double bond</b> · no rotation', tip: { title: 'Partial double-bond character', body: 'Electrons are shared between C=O and C–N, so the C–N peptide bond cannot rotate freely.', src: 'Lippincott Ch 2' } },
        { t: 'Six atoms in one <b>plane</b>' },
        { t: 'Usually <b>trans</b>', tip: { title: 'Trans', body: 'The two α-carbons sit on opposite sides of the peptide bond — this avoids crowding of the side chains.', src: 'Lippincott Ch 2' } },
        { t: '<b>Survives</b> denaturation', tip: { title: 'Hard to break', body: 'Denaturing agents leave peptide bonds intact; hydrolysis needs strong acid/base at high temperature or enzymes (textbook).', src: 'Lippincott Ch 2' } },
      ],
      steps: 2,
      src: 'Lippincott Ch 2 (not on the lecture slides) · 3D: glycylalanine (PubChem conformer, trans peptide bond)',
      notes: [
        'Detail beyond slide 14, from Lippincott: the C–N peptide bond has partial double-bond character, so it does not rotate.',
        'Build 1: the six atoms Cα–C(=O)–N(H)–Cα lie in one rigid plane (purple).',
        'Build 2: trans — the two Cα atoms sit on opposite sides of the C–N bond, the usual form in proteins.',
        'Peptide bonds are not broken by denaturing agents — remember this for denaturation.',
      ],
      visual: peptide3DViz,
    },
    {
      layout: 'statement',
      eyebrow: 'L.4 · Protein levels',
      title: 'Four levels of <em>shape</em>',
      subtitle: 'Proteins are amino acids joined by peptide bonds. Each level builds on the one below.',
      steps: 4,
      src: 'Lecture slides 15–17',
      notes: [
        'L.4.1: a protein is an organic compound of amino acids covalently joined by peptide bonds.',
        'Press → to climb: primary → secondary → tertiary → quaternary. Each level builds on the previous one (slide 17’s tractor ramp).',
      ],
      visual: stairsViz,
    },
    {
      eyebrow: 'Primary structure',
      title: 'The <em>sequence</em>',
      bullets: [
        { t: '<b>Linear sequence</b> of residues', tip: { title: 'Primary structure', body: 'The linear sequence of amino acid residues, joined by peptide bonds.', src: SRC(18) } },
        { t: 'Set by the <b>gene</b>', step: 1, tip: { title: 'Gene → sequence', body: 'Each sequence is determined by the nucleotide sequence of the specific gene coding for that protein.', src: SRC(18) } },
        { t: 'One swap → <b>sickle cell</b>', step: 2, tip: { kicker: 'Clinical hook · textbook', title: 'Sickle-cell hemoglobin (HbS)', body: 'A single base change in the β-globin gene replaces glutamate (charged) with valine (non-polar) at position 6 of the β chain. One residue, one disease.', src: 'Lippincott (hemoglobinopathies) — not on the slides' } },
      ],
      steps: 2,
      src: 'Lecture slide 18 (sequence as drawn) · sickle-cell example: Lippincott',
      notes: [
        'Primary structure = the linear order of amino acid residues (slide 18 shows Pro-Met-Ala-Arg-Cys-Lys-Leu-Ser-Met). Links = peptide bonds; beads = residues. Bead colours = side-chain class, as in the explorer.',
        'Build 1: the order is dictated by the gene’s nucleotide sequence.',
        'Build 2 (textbook hook): in sickle-cell disease a single base change (GAG → GTG) swaps glutamate for valine at β6. A charged residue becomes non-polar — enough to change how hemoglobin behaves.',
      ],
      visual: primaryViz,
    },
    {
      eyebrow: 'Secondary structure',
      title: 'The <em>α-helix</em>',
      bullets: [
        { t: 'Local fold held by <b>H-bonds</b>', tip: { title: 'Secondary structure', body: 'Local folding patterns made by hydrogen bonds along the backbone. Slide 19 says “adjacent” amino acids, but its own figure (and slide 20) show partners four residues apart.', src: 'Slides 19–20' } },
        { t: '<b>C=O ··· H–N</b>, four residues on', tip: { title: 'i → i+4', body: 'Hydrogen bonds between backbone C=O groups and backbone N–H groups four residues away.', src: SRC(20) } },
        { t: 'R groups point <b>outward</b>', tip: { title: 'Side chains outward', body: 'Textbook: ~3.6 residues per turn; side chains extend outward from the helix (purple Cβ atoms).', src: 'Lippincott Ch 2' } },
        { t: 'Rich in <b>α-keratin, myoglobin, Hb</b>', tip: { title: 'Mostly α-helix (slide 22 table)', body: 'α-keratin, myoglobin, hemoglobin, GPCRs.', src: SRC(22) } },
      ],
      steps: 2,
      src: 'Lecture slides 19–20, 22 · 3D: protein G helix, PDB 1PGA residues 22–37 (backbone + Cβ, real H-bond geometry)',
      notes: [
        'Secondary structure = local backbone folding held by hydrogen bonds (slide 19). Its “adjacent” really means nearby — the figure shows i → i+4.',
        'α-helix: each backbone C=O bonds to the N–H four residues further on (slide 20). The dashed bonds are real O···N distances (2.8–3.3 Å) from the crystal structure.',
        'Build 1: one bond highlighted, residue i → residue i+4. Build 2: the ribbon “spring” — slide 20’s coil.',
        'Purple balls are Cβ, the start of each side chain: they point outward.',
        'Slide 22 table: α-helix mostly in α-keratin, myoglobin, hemoglobin and GPCRs.',
      ],
      visual: helixViz,
    },
    {
      eyebrow: 'Secondary structure',
      title: 'The <em>β-pleated</em> sheet',
      bullets: [
        { t: 'Extended strands <b>side by side</b>' },
        { t: 'H-bonds <b>between</b> strands', tip: { title: 'Inter-strand H-bonds', body: 'Backbone C=O and N–H of neighbouring strands bond to each other. Textbook: the strands can come from one chain or from different chains.', src: 'Slides 20–21 · Lippincott Ch 2' } },
        { t: '<b>Antiparallel</b> or <b>parallel</b>', tip: { title: 'Strand direction', body: 'Antiparallel: neighbours run in opposite directions. Parallel: same direction. Slide 21 draws both but does not name them (labels are textbook).', src: 'Slide 21 · Lippincott Ch 2' } },
        { t: 'Rich in <b>silk fibroin, β-keratin</b>', tip: { title: 'Mostly β-sheet (slide 22 table)', body: 'β-keratin, fibroin (silk), porins, antibodies.', src: SRC(22) } },
      ],
      steps: 2,
      src: 'Lecture slides 20–22 · 3D: protein G β-sheet, PDB 1PGA (arrows point N → C; dashes = real H-bonds)',
      notes: [
        'β-sheet: extended strands lie side by side, joined by backbone H-bonds — pleated like slide 20’s folded paper fan.',
        'Build 1: β1 and β2 run in opposite directions → antiparallel (slide 21: straight H-bonds between the top two strands).',
        'Build 2: β1 and β4 run the same way → parallel (slide 21: slanted H-bonds).',
        'Arrowheads show the N → C direction. The seg control at the bottom switches views.',
        'Slide 22 table: β-sheet mostly in β-keratin, fibroin/silk, porins and antibodies.',
      ],
      visual: sheetViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Slide 22 · Important',
      title: 'Helix <em>breakers</em>',
      cards: [
        { k: 'Ring · no N–H', title: 'Proline', body: 'Found at a helix start', viz: vProline, tip: { title: 'Proline', body: 'Its ring structure means it lacks the H needed for the helix H-bond. Usually found at the beginning of a helix.', src: SRC(22) } },
        { k: 'Tiny R group', title: 'Glycine', body: 'Flexible · bends and kinks', viz: vGlycine, tip: { title: 'Glycine', body: 'Its tiny R group makes it highly flexible; usually found at sharp bends or kinks.', src: SRC(22) } },
        { k: 'Highly polar R', title: '<span style="font-size:40px">Ser · Asp · Asn</span>', body: 'R grabs the backbone', viz: vPolar, tip: { title: 'Highly polar R groups', body: 'Their R groups H-bond with the backbone, so the backbone can no longer bond with its partner four residues away. (Lippincott instead stresses charge repulsion/attraction for charged residues.)', src: `${SRC(22)} · Lippincott Ch 2` } },
        { k: 'Branched R group', title: '<span style="font-size:40px">Thr · Val · Ile</span>', body: 'Crowded next to backbone', viz: vBranched, tip: { title: 'β-branched amino acids', body: 'Named on slide 22 without a reason. Textbook: the branch at Cβ is bulky and clashes with the helix backbone.', src: `${SRC(22)} · textbook` } },
      ],
      notes: [
        'Slide 22 says these “can not be found” in the α-helix — more precisely they are disfavoured; proline is common in the first turn (the slide itself says so).',
        'Proline: ring → no N–H hydrogen for the helix H-bond.',
        'Glycine: tiny R → too flexible; sits at bends and kinks.',
        'Ser, Asp, Asn: their polar R groups H-bond to the backbone and steal the i+4 partner. Lippincott frames charged residues as electrostatic repulsion instead.',
        'Thr, Val, Ile: β-branched — textbook reason is steric clash at Cβ (not given on the slide).',
      ],
    },
    {
      eyebrow: 'Tertiary structure',
      title: 'One chain, <em>folded</em>',
      bullets: [
        { t: '3D fold of one chain = <b>subunit</b>', tip: { title: 'Tertiary level', body: 'Further folding of the polypeptide chain into a three-dimensional arrangement. A single folded polypeptide is called a subunit.', src: SRC(23) } },
        { t: '<b>Covalent</b>: disulfide bonds', tip: { title: 'Disulfide bonds', body: 'S–S bridges between two cysteine side chains (textbook: forming cystine).', src: `${SRC(23)} · textbook` } },
        { t: '<b>Non-covalent</b>: ionic, H, hydrophobic, vdW', tip: { title: 'Non-covalent forces', list: ['Ionic bonds', 'Hydrogen bonds', 'Hydrophobic interactions', 'Van der Waals forces'], src: SRC(23) } },
        { t: 'e.g. <b>myoglobin</b>, albumin, enzymes', tip: { title: 'Examples (slide 23)', body: 'Albumin, myoglobin and “most enzymes”. Note: many enzymes are multi-subunit — catalase (next slide) is a tetramer.', src: SRC(23) } },
      ],
      src: 'Lecture slide 23 · 3D: oxymyoglobin (PDB 1A6M), coloured blue (N-terminus) → red (C-terminus)',
      notes: [
        'Tertiary structure: the whole chain folds further into a 3D shape. One folded polypeptide = a subunit.',
        'Held by covalent disulfide bonds plus four non-covalent forces: ionic, H-bonds, hydrophobic, van der Waals.',
        'Myoglobin (on screen) is one chain folded around a heme with bound O₂ — the rainbow traces it from N- to C-terminus.',
        'Slide 23 calls the tertiary level “the most thermodynamically stable”; textbooks say the native conformation is the lowest-energy state (for multi-subunit proteins, that includes quaternary assembly).',
      ],
      visual: tertiaryViz,
    },
    {
      layout: 'full',
      eyebrow: 'Quaternary structure',
      title: 'More than <em>one subunit</em>',
      bullets: [
        { t: 'Homo: identical subunits', tip: { title: 'Homomultimer', body: 'Structurally identical subunits — e.g. catalase (homotetramer).', src: SRC(24) } },
        { t: 'Hetero: different subunits', tip: { title: 'Heteromultimer', body: 'Different subunits — hemoglobin and antibodies (heterotetramers), collagen (heterotrimer), ferritin (24, heteropolymer).', src: SRC(24) } },
      ],
      steps: 2,
      src: 'Lecture slide 24 · 3D: hemoglobin 4HHB, human catalase 1DGF, collagen-like peptide 1CAG',
      notes: [
        'Quaternary level = proteins with more than one subunit: dimer, trimer, tetramer…',
        'Hemoglobin: heterotetramer, α₂β₂ (red α, blue β), each chain with a heme.',
        'Build 1 — catalase: homotetramer, four identical chains.',
        'Build 2 — collagen: slide 24 says heterotrimer (true for type I: two α1 + one α2; textbook: types II and III are homotrimers). The 3D model is a collagen-like peptide showing the triple-helix shape only.',
        'Also on slide 24: antibodies (heterotetramer) and ferritin (24 subunits) — hover the chips.',
      ],
      visual: quatViz,
    },
    {
      layout: 'full',
      eyebrow: 'Slide 25 · Stabilising bonds',
      title: 'Which bonds hold <em>each level</em>?',
      bullets: [{ t: '→ fills one column at a time' }, { t: 'Hover a row' }],
      steps: 4,
      src: 'Lecture slides 23, 25 · peptide-bond tick added (missing on slide 25)',
      notes: [
        'Ask the room to fill each column, then press →.',
        'Primary: peptide bonds. Slide 25 shows no tick in this row at all — it is added here (dashed) because peptide bonds are the bonds of the primary structure (slides 17–18).',
        'Secondary: hydrogen bonds only (backbone C=O···H–N).',
        'Tertiary and quaternary: disulfide bonds plus ionic, H-bonds, hydrophobic and van der Waals.',
        'Hover a row to see each bond drawn.',
      ],
      visual: bondsViz,
    },
    {
      layout: 'full',
      eyebrow: 'Quiz time · slide 29',
      title: 'What holds <em>secondary</em> structure?',
      bullets: [{ t: 'Press → to reveal' }],
      steps: 1,
      src: 'Lecture slides 19, 25, 29',
      notes: [
        'Answer a: hydrogen bonds — the only bond ticked for secondary structure (slide 25).',
        'Disulfide, ionic and hydrophobic bonds belong to tertiary/quaternary; peptide bonds belong to primary.',
      ],
      visual: (el) => mcqViz(el, {
        q: 'Which one of the following chemical bonds stabilizes the secondary protein structure?',
        opts: ['Hydrogen bonds.', 'Disulfide bridges.', 'Ionic bonds.', 'Hydrophobic interactions.', 'Peptide bonds.'],
        ans: 0,
        why: 'Backbone C=O ··· H–N hydrogen bonds build the α-helix (i → i+4) and the β-sheet.',
        side: sideHelix,
      }),
    },
    {
      layout: 'full',
      eyebrow: 'L.4.4 · Quality control',
      title: 'When folding <em>fails</em>',
      bullets: [
        { t: 'Chaperones help refold', tip: { title: 'Chaperones', body: 'Proteins that bind unfolded or misfolded proteins and help them refold correctly — the cell’s quality-control system. Textbook: they also help new chains fold (e.g. heat-shock proteins).', src: `${SRC(26)} · Lippincott Ch 2` } },
        { t: 'Else: ubiquitin → proteasome', tip: { title: 'Ubiquitin–proteasome', body: 'If chaperones fail, the misfolded protein is tagged with ubiquitin and sent to the proteasome for degradation (slide 26’s “YOU ARE A DEAD MAN” tag).', src: SRC(26) } },
      ],
      steps: 4,
      src: 'Lecture slide 26',
      notes: [
        'Normal: the new chain folds into its native, biologically active shape.',
        'Build 1 — misfolding: the chain fails to reach its native shape. Causes: genetic mutations, translation errors, environmental stress, aging.',
        'Build 2 — chaperones bind the misfolded protein and help it refold.',
        'Build 3 — if they fail: ubiquitin tags (the slide’s “you are a dead man” meme) send it to the proteasome, which chops it into peptides.',
        'Build 4 — misfolded proteins can form toxic aggregates, fibrils or plaques. Slide 26 says they become “completely non-functional” — an overstatement; some keep partial function (textbook).',
      ],
      visual: qcViz,
    },
    {
      layout: 'cards',
      eyebrow: 'L.4.3 · Clinical correlation',
      title: 'Misfolding <em>diseases</em>',
      cards: [
        { k: 'Alzheimer’s', title: 'β-Amyloid', body: 'Aggregates into plaques', viz: vAmyloid, tip: { title: 'Alzheimer’s disease · β-amyloid', body: 'Misfolded β-amyloid aggregates into extracellular plaques (textbook; tau tangles are also involved).', src: `${SRC(27)} · textbook` } },
        { k: 'CJD', title: 'Prion protein', body: 'Creutzfeldt–Jakob disease', viz: vPrion, tip: { title: 'Creutzfeldt–Jakob disease · PrP', body: 'Textbook: the normal α-helix-rich PrP converts to an infectious β-sheet-rich form that recruits more PrP to misfold.', src: `${SRC(27)} · Lippincott Ch 2` } },
        { k: 'Cystic fibrosis', title: 'CFTR', body: 'Misfolded channel is degraded', viz: vCFTR, tip: { kicker: 'Name corrected', title: 'Cystic fibrosis · CFTR', body: '<b>C</b>ystic <b>F</b>ibrosis <b>T</b>ransmembrane Conductance <b>R</b>egulator — slide 27 omits “Conductance”. Textbook: the common ΔF508 protein misfolds and is degraded before reaching the membrane, so the chloride channel is missing.', src: `${SRC(27)} · textbook` } },
        { k: 'Parkinson’s', title: 'α-Synuclein', body: 'Aggregates inside neurons', viz: vSynuclein, tip: { title: 'Parkinson’s disease · α-synuclein', body: 'Textbook: aggregated α-synuclein forms Lewy bodies inside neurons.', src: `${SRC(27)} · textbook` } },
      ],
      notes: [
        'Slide 27’s four pairs — learn them as disease → misfolded protein.',
        'Alzheimer’s: β-amyloid (plaques). CJD: prion protein (PrP). Cystic fibrosis: CFTR. Parkinson’s: α-synuclein.',
        'CFTR = Cystic Fibrosis Transmembrane Conductance Regulator (slide 27 drops “Conductance”).',
        'Card animations and the extra detail in each hover card are textbook additions.',
      ],
    },
    {
      eyebrow: 'L.4.2 · Denaturation',
      title: 'Unfold it, <em>keep</em> the chain',
      bullets: [
        { t: 'Breaks <b>non-covalent</b> bonds', tip: { title: 'Denaturation', body: 'Unfolding of the protein’s higher-order structure by breaking the weak non-covalent interactions — without hydrolysing peptide bonds.', src: `${SRC(28)} · Lippincott Ch 2` } },
        { t: '<b>Peptide bonds</b> stay intact', tip: { title: 'Only primary remains', body: 'Peptide bonds are left intact, so the primary structure survives.', src: SRC(28) } },
        { t: 'Urea · SDS · heat · pH · ethanol', tip: { title: 'Denaturing agents (slide 28)', list: ['Chaotropic agents: urea, guanidine hydrochloride', 'Detergents: sodium dodecyl sulfate (SDS)', 'Physical factors: extreme heat, changes in pH', 'Organic solvents: alcohols such as ethanol'], src: SRC(28) } },
        { t: 'S–S needs a <b>reducing agent</b>', tip: { kicker: 'Accuracy note', title: 'Disulfide bonds', body: 'Slide 28 says denaturation breaks disulfide bonds. The agents it lists do not; a reducing agent (e.g. β-mercaptoethanol) is needed (textbook).', src: 'Slide 28 · textbook' } },
      ],
      steps: 2,
      src: 'Lecture slide 28 · schematic chain, temperatures illustrative · disulfide rule: textbook',
      notes: [
        'Drag the heat slider (or press →): H-bonds, ionic and hydrophobic interactions break, the helices unravel — but every peptide bond (cyan) stays. Only the primary structure remains.',
        'Agents (slide 28): chaotropes (urea, guanidine HCl), detergent (SDS), extreme heat and pH changes, organic solvents (ethanol).',
        'Build 2 — reducing agent: the yellow disulfide only breaks now. Slide 28 claims denaturation itself breaks disulfides; standard texts need a reducing agent such as β-mercaptoethanol.',
        'Contrast with misfolding: misfolding is a failure to reach the native fold; denaturation is the loss of an existing fold.',
      ],
      visual: denatViz,
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · slide 31',
      title: 'After denaturation, what’s <em>left</em>?',
      bullets: [{ t: 'Press → to reveal' }],
      steps: 1,
      src: 'Lecture slides 28, 31',
      notes: [
        'The stem is loosely worded — it means “which level of structure is still present?”.',
        'Answer d: primary structure. Peptide bonds are left intact (slide 28).',
        'e (free amino acids) would need hydrolysis of the peptide bonds.',
      ],
      visual: (el) => mcqViz(el, {
        q: 'Which one of the following results from the denaturation of a protein?',
        sub: 'i.e. which level of structure is still present?',
        opts: ['Quaternary structure.', 'Tertiary structure.', 'Secondary structure.', 'Primary structure.', 'Free amino acids.'],
        ans: 3,
        why: 'Denaturation leaves peptide bonds intact, so only the primary structure remains. Free amino acids would need hydrolysis.',
        side: sideDenature,
      }),
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { icon: 'atom', big: '20', title: 'α-amino acids', body: 'L-forms in proteins; glycine is achiral.' },
        { icon: 'gauge', big: 'pI', title: 'net charge zero', body: 'Cation → zwitterion → anion as pH rises.' },
        { icon: 'layers', big: '4', title: 'levels of structure', body: 'Each level builds on the one below.' },
        { icon: 'chain', big: '1°', title: 'survives denaturation', body: 'Peptide bonds stay; S–S needs a reducer.' },
      ],
      notes: 'Recap the four numbers, then open the question bank.',
    },
  ],
};
