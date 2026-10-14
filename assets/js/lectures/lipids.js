// Lipid Chemistry (L.5) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { moleculeScene } from '../viz/scenes.js';

const gsap = window.gsap;
const SRC = (p) => `Lecture slide ${p}`;
const SRCS = (p) => `Lecture slides ${p}`;
const D2R = Math.PI / 180;

/* Lipid visual language (theme-aware CSS vars) */
const C_FA = 'var(--atp)';    // acyl chains · hydrophobic
const C_HEAD = 'var(--elec)'; // polar head groups · water
const C_P = 'var(--prot)';    // phosphate
const C_GLY = 'var(--fadh)';  // glycerol
const C_SPH = 'var(--act)';   // sphingosine
const C_DB = 'var(--nadh)';   // C=C double bonds
const C_O = 'var(--o2)';      // oxygen / carboxyl
/* three.js mid-tones (work on dark and light) */
const HX = { head: 0x5ac8fa, tail: 0xf2c230, chol: 0xff4f8b, apo: 0x30d158, tg: 0xffd60a, ce: 0xff6b3d, fc: 0xff9f0a, blue: 0x2f9be0, gold: 0xffc400, purple: 0xbf5af2, green: 0x30d158, orange: 0xff8a00 };

/* Fatty acids named in the lecture (slides 6, 8, 9) */
const FAS = [
  { name: 'Propionic', n: 3, d: [], note: 'Odd-chain fatty acid', p: 6 },
  { name: 'Butyric', n: 4, d: [], note: 'Fatty acid found in milk', p: 6 },
  { name: 'Capric', n: 10, d: [], note: 'Fatty acid found in milk', p: 6 },
  { name: 'Palmitic', n: 16, d: [], note: 'Structural lipids and triglycerides', p: 6 },
  { name: 'Oleic', n: 18, d: [9], note: 'C:18:1:Δ⁹ = C:18:1:ω-9', p: 8 },
  { name: 'Linoleic', n: 18, d: [9, 12], note: 'Essential fatty acid · ω-6 family', p: '6, 9' },
  { name: 'Linolenic', n: 18, d: [9, 12, 15], note: 'Essential fatty acid · ω-3 family', p: '6, 9' },
  { name: 'Arachidonic', n: 20, d: [5, 8, 11, 14], note: 'Precursor of prostaglandins · ω-6 family', p: '6, 9' },
];
const supD = (d) => (d.length ? ` Δ<sup>${d.join(',')}</sup>` : '');

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */
function rng(seed = 1) { let x = seed >>> 0 || 1; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Zig-zag acyl chain along polyline segments [{len, ang(deg, 90 = down)}]. */
function zigPts(x0, y0, segs, amp = 7, step = 14) {
  const pts = [[x0, y0]];
  let x = x0, y = y0, k = 0;
  segs.forEach(({ len, ang }) => {
    const ux = Math.cos(ang * D2R), uy = Math.sin(ang * D2R);
    const n = Math.max(1, Math.round(len / step));
    const st = len / n;
    for (let i = 1; i <= n; i++) {
      k++;
      const off = (k % 2 ? 1 : -1) * amp;
      pts.push([x + ux * st * i - uy * off, y + uy * st * i + ux * off]);
    }
    x += ux * len; y += uy * len;
  });
  return pts;
}
const ptsD = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
const zigPath = (x0, y0, segs, amp, step) => ptsD(zigPts(x0, y0, segs, amp, step));
function zigEl(parent, x0, y0, segs, o = {}) {
  const p = s('path', { d: zigPath(x0, y0, segs, o.amp ?? 7, o.step ?? 14), style: `fill:none;stroke:${o.color || C_FA};stroke-width:${o.w ?? 6};stroke-linecap:round;stroke-linejoin:round${o.style ? ';' + o.style : ''}` });
  parent.append(p);
  return p;
}

/**
 * Skeletal carbon chain as beads; carbons numbered from the carboxyl carbon (C1).
 * o: { n, x1, y, sp, dir (+1 grows right, -1 grows left), amp, r, dbl:[Δ], dblOpacity }
 */
function beadChain(parent, o) {
  const g = s('g');
  const { n, sp } = o;
  const dir = o.dir ?? -1, amp = o.amp ?? 14, r = o.r ?? 9;
  const dbl = new Set(o.dbl || []);
  const P = (c) => [o.x1 + dir * (c - 1) * sp, o.y + (c % 2 ? -amp : amp)];
  const sp2 = (c) => dbl.has(c) || dbl.has(c - 1);
  const dlines = [];
  for (let c = 1; c < n; c++) {
    const [ax, ay] = P(c), [bx, by] = P(c + 1);
    g.append(s('line', { x1: ax, y1: ay, x2: bx, y2: by, style: `stroke:${dbl.has(c) ? C_DB : 'var(--c-carbon)'};stroke-width:${o.bw ?? 4};stroke-linecap:round` }));
    if (dbl.has(c)) {
      const L = Math.hypot(bx - ax, by - ay);
      let nx = -(by - ay) / L, ny = (bx - ax) / L;
      if (ny < 0) { nx = -nx; ny = -ny; }
      const off = o.dOff ?? 9;
      const dl = s('line', { x1: ax + (bx - ax) * 0.2 + nx * off, y1: ay + (by - ay) * 0.2 + ny * off, x2: ax + (bx - ax) * 0.8 + nx * off, y2: ay + (by - ay) * 0.8 + ny * off, style: `stroke:${C_DB};stroke-width:${o.bw ?? 4};stroke-linecap:round;opacity:${o.dblOpacity ?? 1}` });
      g.append(dl);
      dlines.push(dl);
    }
  }
  const beads = [];
  for (let c = 1; c <= n; c++) {
    const [x, y] = P(c);
    const b = s('circle', { cx: x, cy: y, r: c === 1 ? r + 2 : r, style: c === 1 ? `fill:var(--bg);stroke:${C_O};stroke-width:4` : `fill:${sp2(c) ? C_DB : 'var(--c-carbon)'}` });
    g.append(b);
    beads.push(b);
  }
  parent.append(g);
  return { g, P, beads, dlines };
}

/** Rounded SVG chip with centred text. */
function chipSvg(parent, x, y, w, text, col, o = {}) {
  const hgt = o.h ?? 50;
  const g = s('g', { transform: `translate(${x} ${y})` });
  g.append(s('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: hgt / 2, style: `fill:color-mix(in oklab, ${col} ${o.fill ?? 13}%, transparent);stroke:color-mix(in oklab, ${col} ${o.stroke ?? 50}%, transparent);stroke-width:2${o.dash ? ';stroke-dasharray:8 7' : ''}` }));
  const t = s('text', { x: 0, y: (o.size ?? 24) * 0.36, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${o.size ?? 24}px;font-weight:${o.weight ?? 620};fill:${o.text || 'var(--fg)'}` });
  setRich(t, text);
  g.append(t);
  if (o.tip) g.setAttribute('data-tip', JSON.stringify(o.tip));
  parent.append(g);
  return g;
}

/** Simple rAF loop controller for SVG animations. */
function loop(fn) {
  let raf = null, last = null;
  const t0 = performance.now();
  const tick = (now) => { const dt = last === null ? 0 : Math.min(0.25, (now - last) / 1000); last = now; fn((now - t0) / 1000, dt); raf = requestAnimationFrame(tick); };
  return { start() { if (!raf) { last = null; raf = requestAnimationFrame(tick); } }, stop() { cancelAnimationFrame(raf); raf = null; }, once() { fn((performance.now() - t0) / 1000, 0); } };
}
/** Frame-rate independent easing factor. */
const k_ = (dt, rate) => 1 - Math.exp(-dt * rate);

/** Halo sphere (normal blending so it reads on dark and light backgrounds). */
function halo(r, color, opacity = 0) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}
const fadeMat = (obj, to, d = 0.6) => gsap.to(obj.material, { opacity: to, duration: d });
const fadeLbl = (lbl, on) => { lbl.element.style.opacity = on ? 1 : 0; };

/* ------------------------------------------------------------------ */
/* Idealised fatty-acid geometry (standard bond lengths / angles)      */
/* ------------------------------------------------------------------ */
function nerf(A, B, C, len, ang, tor) {
  const bc = C.clone().sub(B).normalize();
  const nrm = B.clone().sub(A).cross(bc).normalize();
  const m = nrm.clone().cross(bc);
  const a = ang * D2R, t = tor * D2R;
  return C.clone()
    .add(bc.multiplyScalar(-len * Math.cos(a)))
    .add(m.multiplyScalar(len * Math.sin(a) * Math.cos(t)))
    .add(nrm.multiplyScalar(len * Math.sin(a) * Math.sin(t)));
}
/** n-carbon fatty acid, extended (all-anti) conformation. dbl: {9:'cis'|'trans'} = Δ9. */
function faData(n, dbl = {}) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const isD = (k) => !!dbl[k];
  const P = [null, V(0, 0, 0), V(1.52, 0, 0)];
  P[3] = P[2].clone().add(V(1.53 * Math.cos(68 * D2R), 1.53 * Math.sin(68 * D2R), 0));
  for (let i = 4; i <= n; i++) {
    const len = isD(i - 1) ? 1.34 : (isD(i - 2) || isD(i) ? 1.5 : 1.53);
    const ang = isD(i - 2) || isD(i - 1) ? 125 : 112;
    const tor = isD(i - 2) ? (dbl[i - 2] === 'cis' ? 0 : 180) : 180;
    P[i] = nerf(P[i - 3], P[i - 2], P[i - 1], len, ang, tor);
  }
  const atoms = [], bonds = [];
  const add = (el, v) => { atoms.push([el, v.x, v.y, v.z]); return atoms.length - 1; };
  for (let i = 1; i <= n; i++) add('C', P[i]);
  for (let i = 1; i < n; i++) bonds.push([i - 1, i, isD(i) ? 2 : 1]);
  const iO1 = add('O', nerf(P[3], P[2], P[1], 1.21, 123, 0));
  const O2 = nerf(P[3], P[2], P[1], 1.34, 112, 180);
  const iO2 = add('O', O2);
  const iHO = add('H', nerf(P[2], P[1], O2, 0.97, 107, 180));
  bonds.push([0, iO1, 2], [0, iO2, 1], [iO2, iHO, 1]);
  const vinylH = [];
  for (let i = 2; i < n; i++) {
    const C = P[i], a = C.clone().sub(P[i - 1]).normalize(), b = C.clone().sub(P[i + 1]).normalize();
    if (isD(i - 1) || isD(i)) {
      const k = add('H', C.clone().add(a.clone().add(b).normalize().multiplyScalar(1.09)));
      bonds.push([i - 1, k, 1]);
      vinylH.push(k);
    } else {
      const u = a.clone().add(b).normalize(), w = a.clone().cross(b).normalize(), th = 54.75 * D2R;
      [1, -1].forEach((sg) => {
        const k = add('H', C.clone().add(u.clone().multiplyScalar(Math.cos(th) * 1.09)).add(w.clone().multiplyScalar(sg * Math.sin(th) * 1.09)));
        bonds.push([i - 1, k, 1]);
      });
    }
  }
  [60, 180, 300].forEach((t) => { const k = add('H', nerf(P[n - 2], P[n - 1], P[n], 1.09, 110, t)); bonds.push([n - 1, k, 1]); });
  const dblC = Object.keys(dbl).flatMap((k) => [+k - 1, +k]);
  return { key: `fa${n}`, atoms, bonds, vinylH, dblC, P };
}

/* Cholesterol atom map (PubChem CID 5997 conformer in assets/data/mol/cholesterol.json) */
const CHOL = {
  O: 0, C3: 21, C5: 14, C6: 16, C10: 7, C13: 1, C17: 5, C18: 13, C19: 17, C25: 25,
  rings: { A: [7, 14, 18, 21, 19, 15], B: [3, 4, 7, 14, 16, 11], C: [1, 2, 3, 4, 9, 6], D: [1, 2, 8, 10, 5] },
  side: [12, 22, 20, 23, 24, 25, 26, 27], // C20–C27
};

/* ------------------------------------------------------------------ */
/* 1 · Hero: phospholipid bilayer patch with real cholesterol          */
/* ------------------------------------------------------------------ */
async function bilayerHero(el) {
  const kit = createScene(el, { cam: [0, 36, 70], fov: 30, autoRotate: 0 });
  const grp = new THREE.Group();
  kit.root.add(grp);
  const headR = 3.0, tailR = 1.1, SEG = 7.0, Y0 = 18.2, A = 8.2, RP = 46;
  const rand = rng(11);
  const sites = [];
  // disc patch with a quarter cut away (x > 0, z > 0) so the cross-section shows
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
    const x = (i + (Math.abs(j) % 2) * 0.5) * A, z = j * A * 0.866;
    if (Math.hypot(x, z) < RP && !(x > 1 && z > 1)) sites.push([x, z]);
  }
  // cholesterol sites: just behind the two cut faces, so they are visible in section
  const face = sites.map((p, i) => [p, i]).filter(([[x, z]]) => (x <= 1 && x > -A + 1 && z > 7 && z < RP - 10) || (z <= 1 && z > -A && x > 7 && x < RP - 10));
  face.sort((a, b) => Math.hypot(...a[0]) - Math.hypot(...b[0]));
  const cholTop = new Set(face.filter((_, k) => k % 2 === 0).slice(0, 4).map((f) => f[1]));
  const cholBot = new Set(face.filter((_, k) => k % 2 === 1).slice(0, 3).map((f) => f[1]));
  const lipids = [];
  [1, -1].forEach((sg) => sites.forEach(([x, z], i) => {
    if ((sg > 0 ? cholTop : cholBot).has(i)) return;
    const a = rand() * Math.PI;
    lipids.push({ x, z, sg, a, ph: rand() * 6.3, ph2: rand() * 6.3, kink: rand() < 0.6, kd: rand() * 6.3 });
  }));
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(headR, 22, 16), glossy(HX.head, { roughness: 0.28 }), lipids.length);
  const tails = new THREE.InstancedMesh(new THREE.CapsuleGeometry(tailR, SEG, 4, 10), glossy(HX.tail, { roughness: 0.45, clearcoat: 0.3 }), lipids.length * 4);
  grp.add(heads, tails);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vm = new THREE.Vector3(), vd = new THREE.Vector3(), sc = new THREE.Vector3();
  const segAt = (idx, a, b) => {
    vd.subVectors(b, a);
    const len = vd.length();
    Q.setFromUnitVectors(UP, vd.normalize());
    M.compose(vm.addVectors(a, b).multiplyScalar(0.5), Q, sc.set(1, len / SEG, 1));
    tails.setMatrixAt(idx, M);
  };
  const T = new THREE.Vector3(), Mi = new THREE.Vector3(), E = new THREE.Vector3();
  function update(t) {
    lipids.forEach((L, i) => {
      const bob = 0.45 * Math.sin(1.3 * t + L.ph);
      const hy = L.sg * (Y0 + bob);
      M.makeTranslation(L.x, hy, L.z);
      heads.setMatrixAt(i, M);
      const ox = Math.cos(L.a) * 1.5, oz = Math.sin(L.a) * 1.5;
      for (let k = 0; k < 2; k++) {
        const s2 = k ? -1 : 1;
        const swx = 0.9 * Math.sin(0.9 * t + L.ph2 + k), swz = 0.9 * Math.cos(0.7 * t + L.ph + k);
        T.set(L.x + ox * s2, hy - L.sg * headR * 0.85, L.z + oz * s2);
        Mi.set(T.x + swx * 0.5, T.y - L.sg * SEG, T.z + swz * 0.5);
        if (k === 1 && L.kink) E.set(Mi.x + Math.cos(L.kd) * SEG * 0.42, Mi.y - L.sg * SEG * 0.9, Mi.z + Math.sin(L.kd) * SEG * 0.42);
        else E.set(Mi.x + swx, Mi.y - L.sg * SEG, Mi.z + swz);
        segAt(i * 4 + k * 2, T, Mi);
        segAt(i * 4 + k * 2 + 1, Mi, E);
      }
    });
    heads.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
  }
  update(0);
  // real cholesterol (space-filling, glowing) nested between the lipids
  const data = await loadMol('cholesterol');
  const all = data.atoms.map((_, i) => i);
  const chols = [];
  [[cholTop, 1], [cholBot, -1]].forEach(([set, sg]) => set.forEach((i) => {
    const m = buildMolecule(data, { spacefill: true, hideH: 'nonpolar', highlight: { atoms: all, color: HX.chol } });
    const P = m.userData.pos;
    const axis = P[CHOL.O].clone().sub(P[CHOL.C25]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, sg, 0));
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.3);
    m.quaternion.copy(spin.multiply(q));
    const oW = P[CHOL.O].clone().applyQuaternion(m.quaternion);
    m.position.set(sites[i][0] - oW.x, sg * (Y0 - 3.4) - oW.y, sites[i][1] - oW.z);
    m.userData.base = m.position.y;
    m.userData.ph = rand() * 6.3;
    grp.add(m);
    chols.push(m);
  }));
  kit.onFrame((dt, t) => {
    update(t);
    chols.forEach((m) => { m.position.y = m.userData.base + 0.4 * Math.sin(1.1 * t + m.userData.ph); });
    grp.rotation.y = -Math.PI / 4 + 0.32 * Math.sin(t * 0.2);
  });
  grp.rotation.y = -Math.PI / 4;
  kit.fit(grp, 0.98);
  kit.camera.position.sub(kit.controls.target).multiplyScalar(0.66).add(kit.controls.target);
  const c0 = chols.reduce((a, b) => (b.position.z + b.position.x > a.position.z + a.position.x ? b : a));
  const oc = c0.position;
  kit.label('Cholesterol', [oc.x + 2, Y0 + 9, oc.z + 2], { cls: 'sm acc', parent: grp });
  kit.label('Phospholipid bilayer', [6, -Y0 - 9, 6], { cls: 'sm', parent: grp });
  return kitController(kit);
}

/* ------------------------------------------------------------------ */
/* 3 · Definition by solubility: water vs organic solvent             */
/* ------------------------------------------------------------------ */
function solubilityViz(el) {
  const D = diagram(el, 960, 860);
  const W = 380, TOP = 260, BOT = 690, SURF = 400;
  const B = [{ x: 50, solvent: false }, { x: 530, solvent: true }];
  B.forEach((b) => {
    const x0 = b.x, x1 = b.x + W;
    b.liquid = s('path', { d: `M${x0 + 6},${SURF} L${x0 + 6},${BOT - 36} Q${x0 + 6},${BOT - 6} ${x0 + 36},${BOT - 6} L${x1 - 36},${BOT - 6} Q${x1 - 6},${BOT - 6} ${x1 - 6},${BOT - 36} L${x1 - 6},${SURF} Z`, style: `fill:${b.solvent ? 'color-mix(in oklab, var(--fg) 7%, transparent)' : 'color-mix(in oklab, var(--elec) 20%, transparent)'}` });
    b.tint = s('path', { d: b.liquid.getAttribute('d'), style: 'fill:color-mix(in oklab, var(--atp) 26%, transparent);opacity:0' });
    D.layers.regions.append(b.liquid, b.tint);
    D.layers.nodes.append(s('path', { d: `M${x0 - 16},${TOP - 10} L${x0},${TOP} L${x0},${BOT - 36} Q${x0},${BOT} ${x0 + 36},${BOT} L${x1 - 36},${BOT} Q${x1},${BOT} ${x1},${BOT - 36} L${x1},${TOP} L${x1 + 16},${TOP - 10}`, style: 'fill:none;stroke:var(--line-2);stroke-width:5;stroke-linejoin:round;stroke-linecap:round' }));
    for (let k = 0; k < 4; k++) D.layers.nodes.append(s('line', { x1: x0 + 14, x2: x0 + 44, y1: 440 + k * 60, y2: 440 + k * 60, style: 'stroke:var(--line-2);stroke-width:3;stroke-linecap:round' }));
    // droplets hovering above
    b.drops = [];
    for (let i = 0; i < 6; i++) {
      const c = s('circle', { cx: x0 + 80 + (i % 3) * 110 + (i > 2 ? 55 : 0), cy: 120 + (i > 2 ? 62 : 0), r: 22 - (i % 2) * 5, style: `fill:${C_FA};stroke:color-mix(in oklab, var(--atp) 60%, var(--fg));stroke-width:2` });
      D.layers.labels.append(c);
      b.drops.push(c);
    }
  });
  // water: oil layer floats as a separate phase
  const oil = s('path', { d: `M${B[0].x + 6},${SURF} L${B[0].x + 6},${SURF - 38} Q${B[0].x + W / 2},${SURF - 46} ${B[0].x + W - 6},${SURF - 38} L${B[0].x + W - 6},${SURF} Z`, style: `fill:${C_FA};opacity:0` });
  D.layers.regions.append(oil);
  // solvent: dissolved specks
  const specks = s('g', { style: 'opacity:0' });
  const r = rng(3);
  for (let i = 0; i < 70; i++) specks.append(s('circle', { cx: B[1].x + 30 + r() * (W - 60), cy: SURF + 18 + r() * (BOT - SURF - 60), r: 3.2, style: `fill:${C_FA}` }));
  D.layers.fx.append(specks);
  D.text(B[0].x + W / 2, 760, 'Water', { anchor: 'middle', cls: 'lg', style: `fill:${C_HEAD}` });
  const solvLbl = D.text(B[1].x + W / 2, 760, 'Chloroform', { anchor: 'middle', cls: 'lg' });
  const res1 = D.text(B[0].x + W / 2, 808, 'Insoluble · separates', { anchor: 'middle', cls: 'sm', style: 'fill:var(--inh);font-weight:650;opacity:0' });
  const res2 = D.text(B[1].x + W / 2, 808, 'Soluble · dissolves', { anchor: 'middle', cls: 'sm', style: 'fill:var(--act);font-weight:650;opacity:0' });
  const cap = D.text(480, 40, 'Lipid droplets', { anchor: 'middle', cls: 'sm', style: `fill:var(--ink);font-weight:650` });

  const tl = gsap.timeline({ paused: true });
  B.forEach((b, bi) => b.drops.forEach((d, i) => tl.to(d, { attr: { cy: SURF + 70 + (i % 3) * 70 + (i > 2 ? 30 : 0) }, duration: 0.75, ease: 'power2.in' }, i * 0.07 + bi * 0.1)));
  tl.to(cap, { opacity: 0, duration: 0.4 }, 0);
  tl.to(B[0].drops, { attr: { cy: SURF - 18 }, duration: 0.9, ease: 'power2.out', stagger: 0.05 }, 1.1);
  tl.to(B[0].drops, { attr: { r: 0 }, duration: 0.5, stagger: 0.03 }, 1.9);
  tl.to(oil, { opacity: 0.9, duration: 0.7 }, 1.8);
  tl.to(B[1].drops, { attr: { r: 2 }, opacity: 0, duration: 1.3, ease: 'power1.inOut', stagger: 0.06 }, 1.1);
  tl.to(specks, { opacity: 0.8, duration: 1.2 }, 1.3);
  tl.to(B[1].tint, { opacity: 1, duration: 1.2 }, 1.4);
  tl.to([res1, res2], { opacity: 1, duration: 0.5 }, 2.3);
  tl.progress(1).progress(0);

  const sv = seg({ options: [{ v: 'Chloroform', t: 'Chloroform' }, { v: 'Ether', t: 'Ether' }, { v: 'Benzene', t: 'Benzene' }], value: 'Chloroform', onChange: (v) => { solvLbl.textContent = v; } });
  const again = h('button', { class: 'btn', style: 'font-size:22px;height:52px;padding:0 24px', text: '↻ Again', onclick: () => tl.restart() });
  ctrlBar(el, [sv, again], { right: 0, top: 70 });
  let cur = 0;
  return {
    step(n, dir) {
      if (n >= 1) { if (cur === 0 && dir > 0) tl.restart(); else tl.progress(1).pause(); } else tl.pause(0);
      cur = n;
    },
    destroy: () => { tl.kill(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 4 · The lipid family (slide 3 colour groups)                        */
/* ------------------------------------------------------------------ */
function familyViz(el) {
  const D = diagram(el, 1712, 720);
  const G = [
    { x: 0, col: 'var(--act)', cap: 'Fatty acids & fats' },
    { x: 586, col: 'var(--fadh)', cap: '+ phosphate · sugar · protein' },
    { x: 1172, col: 'var(--elec)', cap: 'Sterols' },
  ];
  const regTip = { kicker: 'Slide 3 colour groups', title: 'How the lecture groups lipids', body: 'The slide colour-codes the seven lipid types into three groups without headings. The captions here are descriptive. Textbooks often call these <b>simple, compound and derived</b> lipids — the lecture does not use those terms.', src: SRC(3) };
  G.forEach((g) => {
    D.region({ x: g.x, y: 0, w: 540, h: 620, r: 40, fill: `color-mix(in oklab, ${g.col} 8%, transparent)`, stroke: `color-mix(in oklab, ${g.col} 40%, transparent)`, tip: regTip });
    D.text(g.x + 270, 58, g.cap, { anchor: 'middle', style: `fill:${g.col};font-weight:680;font-size:27px` });
  });
  const N = [
    { id: 'fa', g: 0, y: 220, label: 'Fatty acids', sub: 'R–COOH', fa: 1, tip: { title: 'Fatty acids', body: 'Carboxylic acids with a hydrocarbon side chain. Most are <b>esterified</b> with other lipids or alcohols.', src: SRC(4) } },
    { id: 'tg', g: 0, y: 440, label: 'Triglycerides', sub: 'fats · oils', fa: 3, tip: { title: 'Triglycerides (triacylglycerols)', body: 'Esters of <b>3 fatty acids + glycerol</b>. Fats are solid, oils are liquid.', src: SRCS('4, 13') } },
    { id: 'pl', g: 1, y: 160, label: 'Phospholipids', fa: 2, tip: { title: 'Phospholipids', body: 'Fatty acids + alcohol + phosphate. Glycerophospholipids carry <b>2</b> fatty acids; sphingomyelin carries <b>1</b> (plus sphingosine’s own chain).', src: SRCS('15–16') } },
    { id: 'gl', g: 1, y: 320, label: 'Glycolipids', fa: 1, tip: { title: 'Glycolipids', body: 'Fatty acid + sphingosine + carbohydrate. <b>No phosphate.</b>', src: SRC(20) } },
    { id: 'lp', g: 1, y: 480, label: 'Lipoproteins', fa: 0, tip: { title: 'Lipoproteins', body: 'Lipid + protein particles that <b>transport lipids</b> between tissues through the circulation.', src: SRC(22) } },
    { id: 'ch', g: 2, y: 220, label: 'Cholesterol', sub: '27 C sterol', fa: 0, tip: { title: 'Cholesterol', body: 'The major sterol of animal tissues. No fatty acid in its structure.', src: SRCS('25–26') } },
    { id: 'ce', g: 2, y: 440, label: 'Cholesterol esters', fa: 1, tip: { title: 'Cholesterol esters', body: '<b>Cholesterol + fatty acid</b> = cholesterol ester.', src: SRCS('4, 25') } },
  ];
  const faEls = [];
  N.forEach((n) => {
    const col = G[n.g].col;
    const nd = D.node({ id: n.id, x: G[n.g].x + 270, y: n.y, label: n.label, sub: n.sub, kind: 'box', w: 400, h: n.sub ? 108 : 86, size: 34, color: col, tip: n.tip });
    const gy = n.y + nd.h0 / 2 + 34;
    const g = s('g', { style: 'opacity:0' });
    if (n.fa) {
      for (let k = 0; k < n.fa; k++) {
        const x = G[n.g].x + 270 + (k - (n.fa - 1) / 2) * 34;
        zigEl(g, x, gy - 20, [{ len: 40, ang: 90 }], { amp: 6, step: 8, w: 5 });
      }
    } else if (n.id === 'ch') {
      g.append(Object.assign(s('text', { x: G[n.g].x + 270, y: gy + 6, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-3)' }), { textContent: 'no fatty acid' }));
    }
    D.layers.labels.append(g);
    if (n.fa || n.id === 'ch') faEls.push(g);
  });
  const legend = s('g', { style: 'opacity:0' });
  zigEl(legend, 676, 662, [{ len: 36, ang: 90 }], { amp: 6, step: 8, w: 5 });
  legend.append(Object.assign(s('text', { x: 706, y: 690, class: 'v-label sm', style: 'fill:var(--fg-2)' }), { textContent: '= one fatty-acid chain' }));
  D.layers.labels.append(legend);
  // lipoprotein transport arrows
  const lp = D.nodes.lp;
  const arrows = [
    D.arrow({ from: [656, 470], to: [474, 452], color: 'var(--fadh)', width: 4, dash: '10 10', curve: -20 }),
    D.arrow({ from: [1056, 470], to: [1238, 452], color: 'var(--fadh)', width: 4, dash: '10 10', curve: 20 }),
    D.arrow({ from: [1056, 456], to: [1238, 250], color: 'var(--fadh)', width: 4, dash: '10 10', curve: 40 }),
  ];
  const carry = D.text(856, 576, 'Transported by lipoproteins', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fadh);font-weight:650' });
  const flows = arrows.map((a) => D.flow(a, { count: 2, color: 'var(--fadh)', speed: 140, r: 8, autoplay: false }));
  const s2 = [...arrows.map((a) => a.g), carry];
  s2.forEach((e) => (e.style.opacity = 0));
  flows.forEach((f) => f.hide());
  return {
    step(n) {
      show([...faEls, legend], n >= 1);
      show(s2, n >= 2);
      flows.forEach((f) => (n >= 2 ? f.play() : f.hide()));
      gsap.to(lp.g, { scale: n >= 2 ? 1.04 : 1, svgOrigin: `${lp.x} ${lp.y}`, duration: 0.5 });
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 5 · Fatty-acid anatomy: real 3D palmitic acid                       */
/* ------------------------------------------------------------------ */
async function palmiticViz(el) {
  const host = h('div', { style: 'position:absolute;left:0;right:0;top:0;bottom:150px' });
  el.append(host);
  const kit = createScene(host, { cam: [0, 0, 40], autoRotate: 0, hint: false });
  const data = await loadMol('palmitic');
  const mol = buildMolecule(data, { hideH: false });
  const P = mol.userData.pos;
  const chain = [17, 15, 13, 11, 9, 7, 5, 3, 2, 4, 6, 8, 10, 12, 14, 16];
  const X = new THREE.Vector3(1, 0, 0);
  const qa = new THREE.Quaternion().setFromUnitVectors(P[17].clone().sub(P[16]).normalize(), X);
  let best = 0, bestV = -1;
  for (let a = 0; a < Math.PI; a += 0.04) {
    const qr = new THREE.Quaternion().setFromAxisAngle(X, a).multiply(qa);
    let v = 0;
    chain.forEach((i) => { const p = P[i].clone().applyQuaternion(qr); v += p.y * p.y; });
    if (v > bestV) { bestV = v; best = a; }
  }
  const holder = new THREE.Group(); holder.add(mol); holder.quaternion.copy(qa);
  const roll = new THREE.Group(); roll.add(holder); roll.rotation.x = best;
  kit.root.add(roll);
  roll.updateMatrixWorld(true);
  const Wp = (i) => P[i].clone().applyMatrix4(mol.matrixWorld);
  const head = Wp(17).add(Wp(0)).add(Wp(1)).multiplyScalar(1 / 3);
  const yMid = chain.reduce((a, i) => a + Wp(i).y, 0) / chain.length;
  const x2 = Wp(15).x, xN = Wp(16).x;
  const hHalo = halo(2.5, HX.blue); hHalo.position.set(head.x + 0.3, yMid, 0);
  const tHalo = new THREE.Mesh(new THREE.CapsuleGeometry(1.75, Math.abs(x2 - xN) + 0.4, 8, 28), new THREE.MeshBasicMaterial({ color: HX.gold, transparent: true, opacity: 0, depthWrite: false }));
  tHalo.rotation.z = Math.PI / 2; tHalo.position.set((x2 + xN) / 2, yMid, 0);
  kit.root.add(hHalo, tHalo);
  kit.fit(kit.root, 0.92);
  kit.camera.position.sub(kit.controls.target).multiplyScalar(0.74).add(kit.controls.target);
  const lH = kit.label('Carboxyl head · <b>hydrophilic</b>', [head.x, yMid + 3.6, 0], { cls: 'sm' });
  lH.element.style.color = 'var(--elec)';
  const lT = kit.label('Hydrocarbon tail · <b>hydrophobic</b>', [(x2 + xN) / 2, yMid - 3.6, 0], { cls: 'sm acc' });
  [lH, lT].forEach((l) => fadeLbl(l, false));
  kit.onFrame((dt, t) => { roll.rotation.x = best + 0.5 * Math.sin(t * 0.55); });
  // slide-4 style schematic: R — COO⁻
  const pill = (txt, sub, col, flex) => h('div', { style: `flex:${flex};border-radius:24px;padding:0 30px;display:flex;flex-direction:column;justify-content:center;background:color-mix(in oklab, ${col} 12%, transparent);border:2px solid color-mix(in oklab, ${col} 45%, transparent);transition:opacity .5s` }, [
    h('div', { style: `font:700 32px var(--font);color:${col === C_FA ? 'var(--ink)' : col}`, html: txt }),
    h('div', { style: 'font-size:24px;color:var(--fg-2);margin-top:4px', html: sub }),
  ]);
  const pR = pill('R · hydrocarbon chain', 'Hydrophobic', C_FA, 3);
  const pC = pill('COO⁻', 'Hydrophilic', C_HEAD, 1.1);
  el.append(h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:120px;display:flex;gap:16px' }, [pR, pC]));
  return kitController(kit, {
    step(n) {
      fadeMat(hHalo, n >= 1 ? 0.22 : 0); fadeLbl(lH, n >= 1);
      fadeMat(tHalo, n >= 2 ? 0.16 : 0); fadeLbl(lT, n >= 2);
      pC.style.opacity = n === 0 || n >= 1 ? 1 : 0.4;
      pR.style.opacity = n === 1 ? 0.4 : 1;
    },
  });
}

/* ------------------------------------------------------------------ */
/* 6 · Classification: length · parity · saturation                   */
/* ------------------------------------------------------------------ */
function classifyViz(el) {
  const D = diagram(el, 1712, 720);
  const X = (c) => 470 + (c - 1) * 50;
  const bands = [{ a: 2, b: 4, t: 'Short', r: '2–4' }, { a: 6, b: 12, t: 'Medium', r: '6–12' }, { a: 14, b: 20, t: 'Long', r: '14–20' }, { a: 21, b: 24, t: 'Very long', r: '>20' }];
  const bandEls = bands.map((b, i) => {
    const g = s('g', { style: 'opacity:0' });
    g.append(s('rect', { x: X(b.a) - 23, y: 84, width: X(b.b) - X(b.a) + 46, height: 560, rx: 20, style: `fill:color-mix(in oklab, var(--a1) ${7 + i * 3}%, transparent);stroke:color-mix(in oklab, var(--a1) 32%, transparent);stroke-width:2` }));
    const t = s('text', { x: (X(b.a) + X(b.b)) / 2, y: 34, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--ink);font-weight:700' }); t.textContent = b.t;
    const t2 = s('text', { x: (X(b.a) + X(b.b)) / 2, y: 66, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-size:22px' }); t2.textContent = `${b.r} C`;
    g.append(t, t2);
    g.setAttribute('data-tip', JSON.stringify({ title: `${b.t} chain fatty acids`, body: `${b.r} carbons (lecture ranges: short 2–4, medium 6–12, long 14–20, very long >20).`, src: SRC(5) }));
    D.layers.regions.append(g);
    return g;
  });
  const parity = [], dbls = [];
  FAS.forEach((f, i) => {
    const y = 128 + i * 70;
    const name = D.text(16, y + 10, f.name, { style: 'font-size:30px;font-weight:620', tip: { kicker: `${f.n}:${f.d.length}${f.d.length ? ' · Δ' + f.d.join(',') : ''}`, title: `${f.name} acid`, body: f.note, src: SRC(f.p) } });
    name.style.cursor = 'help';
    D.text(420, y + 9, `${f.n}:${f.d.length}`, { anchor: 'end', style: 'font:600 26px var(--mono);fill:var(--fg-2)' });
    const ch = beadChain(D.layers.nodes, { n: f.n, x1: X(1), dir: 1, y, sp: 50, amp: 9, r: 8.5, dbl: f.d, dblOpacity: 0.3, bw: 3.5 });
    dbls.push(...ch.dlines);
    const odd = f.n % 2 === 1;
    const pb = chipSvg(D.layers.labels, X(f.n) + 62, y, 76, odd ? 'odd' : 'even', odd ? 'var(--inh)' : 'var(--fg-3)', { h: 36, size: 21, text: odd ? 'var(--inh)' : 'var(--fg-2)' });
    pb.style.opacity = 0;
    parity.push(pb);
  });
  for (let c = 1; c <= 24; c++) D.text(X(c), 702, String(c), { anchor: 'middle', style: `font-size:20px;fill:${c === 1 ? C_O : 'var(--fg-3)'};font-weight:600` });
  D.text(420, 702, 'Carbon no.', { anchor: 'end', style: 'font-size:22px;fill:var(--fg-3)' });
  const brk = (y1, y2, label, col) => {
    const g = s('g', { style: 'opacity:0' });
    g.append(s('path', { d: `M1652,${y1} L1664,${y1} L1664,${y2} L1652,${y2}`, style: `fill:none;stroke:${col};stroke-width:3;stroke-linecap:round` }));
    const t = s('text', { x: 0, y: 0, transform: `translate(1694 ${(y1 + y2) / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${col};font-weight:700` }); t.textContent = label;
    g.append(t);
    D.layers.labels.append(g);
    return g;
  };
  const bS = brk(104, 362, 'Saturated', 'var(--fg-2)');
  const bU = brk(384, 642, 'Unsaturated', C_DB);
  return {
    step(n) {
      show(bandEls, n >= 1, { stagger: 0.08 });
      show(parity, n >= 2, { stagger: 0.04 });
      show([bS, bU], n >= 3);
      gsap.to(dbls, { opacity: n >= 3 ? 1 : 0.3, duration: 0.5 });
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 7 · Nomenclature builder: Δ vs ω, α / β / ω                        */
/* ------------------------------------------------------------------ */
function builderViz(el) {
  const D = diagram(el, 1712, 720);
  let n = 16, dbl = new Set(), mode = 'delta';
  const chainG = s('g');
  D.layers.nodes.append(chainG);
  const formula = D.text(856, 600, '', { anchor: 'middle', style: 'font:600 30px var(--mono);fill:var(--fg-2)' });
  D.text(856, 640, 'Click any C–C bond to add or remove a double bond', { anchor: 'middle', style: 'font-size:22px;fill:var(--fg-3)' });
  const nameEl = h('div', { style: 'font-size:30px;color:var(--fg-2);font-weight:560' });
  const bigEl = h('div', { style: 'font:720 64px var(--font);letter-spacing:-.03em;line-height:1.05;margin-top:6px' });
  const chipsEl = h('div', { style: 'display:flex;gap:12px;margin-top:14px;font-size:26px' });
  el.append(h('div', { style: 'position:absolute;left:0;top:0;pointer-events:none' }, [nameEl, bigEl, chipsEl]));
  const sub = (k) => String(k).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');

  function formulaText() {
    const tok = [];
    for (let c = n; c >= 1; c--) {
      if (c === n) tok.push('CH₃');
      else if (c === 1) tok.push('COOH');
      else tok.push(dbl.has(c) || dbl.has(c - 1) ? 'CH' : 'CH₂');
      if (c > 1) tok.push(dbl.has(c - 1) ? '=' : '–');
    }
    let out = '', i = 0;
    while (i < tok.length) {
      if (tok[i] === 'CH₂') {
        let k = 0, j = i;
        while (tok[j] === 'CH₂' && (tok[j + 1] === '–')) { k++; j += 2; }
        if (k >= 2) { out += `(CH₂)${sub(k)}–`; i = j; continue; }
      }
      out += tok[i]; i++;
    }
    return out;
  }
  function readout() {
    const L = [...dbl].sort((a, b) => a - b), k = L.length;
    const match = FAS.find((f) => f.n === n && f.d.length === k && f.d.every((d, i) => d === L[i]));
    nameEl.textContent = match ? `${match.name} acid` : k ? 'Unsaturated fatty acid' : 'Saturated fatty acid';
    const om = k ? `ω-${n - L[k - 1]}` : '';
    bigEl.innerHTML = `${n}:${k}${supD(L)}${om ? ` <span style="color:var(--fg-3);font-weight:400">=</span> <span class="grad-text">${om}</span>` : ''}`;
    const len = n >= 2 && n <= 4 ? 'Short chain' : n >= 6 && n <= 12 ? 'Medium chain' : n >= 14 && n <= 20 ? 'Long chain' : n > 20 ? 'Very long chain' : 'Between slide classes';
    chipsEl.innerHTML = '';
    chipsEl.append(h('span.chip.acc', { text: len }), h('span', { class: `chip ${n % 2 ? 'inh' : ''}`, text: n % 2 ? 'Odd chain' : 'Even chain' }), h('span', { class: `chip ${k ? 'nadh' : ''}`, text: k === 0 ? 'Saturated' : k === 1 ? 'Unsaturated · 1 C=C' : `PUFA · ${k} C=C` }));
    formula.textContent = formulaText();
    preset.set(match ? match.name : null, false);
  }
  function toggleBond(c) {
    if (dbl.has(c)) dbl.delete(c);
    else if (c >= 2 && c <= n - 1 && !dbl.has(c - 1) && !dbl.has(c + 1)) dbl.add(c);
    else return;
    render(); readout();
  }
  function render() {
    chainG.innerHTML = '';
    const sp = Math.min(62, 1300 / Math.max(1, n - 1));
    const cx = 840, Y = 360, amp = 22;
    const X = (c) => cx + ((n - 1) / 2 - (c - 1)) * sp;
    const Yc = (c) => Y + (c % 2 ? -amp : amp);
    for (let c = 1; c < n; c++) {
      const on = dbl.has(c);
      chainG.append(s('line', { x1: X(c), y1: Yc(c), x2: X(c + 1), y2: Yc(c + 1), style: `stroke:${on ? C_DB : 'var(--c-carbon)'};stroke-width:5;stroke-linecap:round` }));
      if (on) {
        const dx = X(c + 1) - X(c), dy = Yc(c + 1) - Yc(c), L = Math.hypot(dx, dy);
        let nx = -dy / L, ny = dx / L; if (ny < 0) { nx = -nx; ny = -ny; }
        chainG.append(s('line', { x1: X(c) + dx * 0.2 + nx * 11, y1: Yc(c) + dy * 0.2 + ny * 11, x2: X(c) + dx * 0.8 + nx * 11, y2: Yc(c) + dy * 0.8 + ny * 11, style: `stroke:${C_DB};stroke-width:5;stroke-linecap:round` }));
      }
      const hit = s('line', { x1: X(c), y1: Yc(c), x2: X(c + 1), y2: Yc(c + 1), style: 'stroke:transparent;stroke-width:30;cursor:pointer;pointer-events:stroke' });
      hit.addEventListener('click', () => toggleBond(c));
      chainG.append(hit);
    }
    const nums = s('g');
    for (let c = 1; c <= n; c++) {
      const isDb = dbl.has(c) || dbl.has(c - 1);
      chainG.append(s('circle', { cx: X(c), cy: Yc(c), r: c === 1 ? 14 : 11, style: c === 1 ? `fill:var(--bg);stroke:${C_O};stroke-width:4` : `fill:${isDb ? C_DB : 'var(--c-carbon)'};pointer-events:none` }));
      const num = mode === 'delta' ? c : n - c + 1;
      const t = s('text', { x: X(c), y: Y - 74, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${sp < 50 ? 21 : 24}px;font-weight:650;fill:${isDb ? C_DB : num === 1 ? 'var(--ink)' : 'var(--fg-2)'}` });
      t.textContent = num;
      nums.append(t);
    }
    chainG.append(nums);
    if (gsap) gsap.from(nums.children, { opacity: 0, y: -10, duration: 0.4, stagger: 0.012 });
    const sys = s('text', { x: X(n) - 34, y: Y - 74, 'text-anchor': 'end', class: 'v-label', style: 'font-size:26px;font-weight:700;fill:var(--ink)' });
    sys.textContent = mode === 'delta' ? 'Δ (“C”) →' : 'ω →';
    chainG.append(sys);
    const greek = (c, txt) => { const t = s('text', { x: X(c), y: Y + 76, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:700;fill:var(--ink)' }); t.textContent = txt; chainG.append(t); };
    if (n >= 3) { greek(2, 'α'); greek(3, n === 3 ? 'β = ω' : 'β'); }
    if (n > 3) greek(n, 'ω');
    const tag = (x, txt, anchor) => { const t = s('text', { x, y: Y + 124, 'text-anchor': anchor, class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:22px' }); t.textContent = txt; chainG.append(t); };
    tag(X(1) + 16, 'Carboxyl end', 'end');
    tag(X(n) - 16, 'Methyl end', 'start');
    const co = s('text', { x: X(1) + 24, y: Yc(1) + 9, class: 'v-label', style: `font-size:26px;font-weight:700;fill:${C_O}` }); co.textContent = 'COOH';
    const me = s('text', { x: X(n) - 22, y: Yc(n) + 9, 'text-anchor': 'end', class: 'v-label', style: 'font-size:26px;font-weight:650;fill:var(--fg-2)' }); setRich(me, 'CH_{3}');
    chainG.append(co, me);
  }
  const preset = seg({ options: FAS.map((f) => ({ v: f.name, t: f.name })), value: 'Palmitic', onChange: (v) => { const f = FAS.find((x) => x.name === v); n = f.n; dbl = new Set(f.d); len.set(n, false); render(); readout(); } });
  const sys = seg({ options: [{ v: 'delta', t: 'Δ · from COOH' }, { v: 'omega', t: 'ω · from CH₃' }], value: 'delta', onChange: (v) => { mode = v; render(); } });
  const len = slider({ label: 'Carbons', min: 3, max: 24, step: 1, value: 16, width: 220, fmt: (v) => `${v}`, onInput: (v) => { n = v; [...dbl].forEach((d) => { if (d >= n) dbl.delete(d); }); render(); readout(); } });
  ctrlBar(el, [sys, len], { right: 0, top: 0 });
  ctrlBar(el, [preset], { left: 0, right: 0, bottom: 0 }).style.justifyContent = 'center';
  render(); readout();
  const PLAN = [['Palmitic', 'delta'], ['Oleic', 'delta'], ['Oleic', 'omega'], ['Linoleic', 'omega'], ['Linolenic', 'omega'], ['Arachidonic', 'omega']];
  return {
    step(k) {
      const [nm, md] = PLAN[Math.min(k, PLAN.length - 1)];
      mode = md; sys.set(md, false);
      preset.set(nm, true);
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 8 · PUFA families: align at COOH (Δ) vs at CH₃ (ω)                  */
/* ------------------------------------------------------------------ */
function pufaViz(el) {
  const D = diagram(el, 1712, 720);
  const sp = 54, XL = 560, XR = XL + 19 * sp;
  const rows = [
    { f: FAS[5], y: 170, fam: 6 },
    { f: FAS[6], y: 350, fam: 3 },
    { f: FAS[7], y: 530, fam: 6 },
  ];
  const guidesW = [], guidesD = [];
  const guide = (x, label, arr, col) => {
    const g = s('g', { style: 'opacity:0' });
    g.append(s('line', { x1: x, x2: x, y1: 88, y2: 610, style: `stroke:${col};stroke-width:3;stroke-dasharray:6 10;opacity:.75` }));
    const t = s('text', { x, y: 70, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${col};font-weight:700` }); setRich(t, label);
    g.append(t);
    D.layers.regions.append(g);
    arr.push(g);
  };
  guide(XL + 2.5 * sp, 'ω-3', guidesW, 'var(--fadh)');
  guide(XL + 5.5 * sp, 'ω-6', guidesW, 'var(--a2)');
  guide(XR - 8.5 * sp, 'Δ9', guidesD, C_DB);
  guide(XR - 11.5 * sp, 'Δ12', guidesD, C_DB);
  const groups = rows.map((r) => {
    const { n, d } = r.f;
    D.text(0, r.y - 6, r.f.name, { style: 'font-size:34px;font-weight:680', tip: { title: `${r.f.name} acid`, body: `${n}:${d.length} · Δ${d.join(',')} · ω-${r.fam} family.${r.f.name === 'Arachidonic' ? ' Precursor of prostaglandins (and all eicosanoids).' : ' Essential fatty acid.'}`, src: SRC(9) } });
    const nt = D.text(0, r.y + 34, '', { style: 'font:600 24px var(--mono);fill:var(--fg-2)' });
    setRich(nt, `${n}:${d.length} · Δ^{${d.join(',')}}`);
    const g = s('g');
    const lx = (c) => (n - c) * sp; // local x, methyl at 0
    const ly = (c) => r.y + (c % 2 ? -13 : 13);
    const dset = new Set(d);
    for (let c = 1; c < n; c++) {
      g.append(s('line', { x1: lx(c), y1: ly(c), x2: lx(c + 1), y2: ly(c + 1), style: `stroke:${dset.has(c) ? C_DB : 'var(--c-carbon)'};stroke-width:4;stroke-linecap:round` }));
      if (dset.has(c)) {
        const ax = lx(c), ay = ly(c), dx = lx(c + 1) - ax, dy = ly(c + 1) - ay, L = Math.hypot(dx, dy);
        let nx = -dy / L, ny = dx / L; if (ny < 0) { nx = -nx; ny = -ny; }
        g.append(s('line', { x1: ax + dx * 0.2 + nx * 9, y1: ay + dy * 0.2 + ny * 9, x2: ax + dx * 0.8 + nx * 9, y2: ay + dy * 0.8 + ny * 9, style: `stroke:${C_DB};stroke-width:4;stroke-linecap:round` }));
      }
    }
    for (let c = 1; c <= n; c++) g.append(s('circle', { cx: lx(c), cy: ly(c), r: c === 1 ? 10 : 8, style: c === 1 ? `fill:var(--bg);stroke:${C_O};stroke-width:4` : `fill:${dset.has(c) || dset.has(c - 1) ? C_DB : 'var(--c-carbon)'}` }));
    const dN = s('g'), wN = s('g', { style: 'opacity:0' });
    d.forEach((k) => {
      const t1 = s('text', { x: lx(k), y: r.y - 34, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${C_DB};font-weight:700` }); t1.textContent = k; dN.append(t1);
    });
    const last = d[d.length - 1];
    const t2 = s('text', { x: lx(last + 1), y: r.y - 34, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--ink);font-weight:700' }); t2.textContent = n - last; wN.append(t2);
    const one = s('text', { x: lx(n), y: r.y - 34, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:650' }); one.textContent = '1'; wN.append(one);
    const oneD = s('text', { x: lx(1), y: r.y - 34, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:650' }); oneD.textContent = '1'; dN.append(oneD);
    const co = s('text', { x: lx(1) + 18, y: r.y + 8, class: 'v-label sm', style: `fill:${C_O};font-weight:700` }); co.textContent = 'COOH';
    const me = s('text', { x: -16, y: r.y + 8, 'text-anchor': 'end', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:650' }); setRich(me, 'CH_{3}');
    const fam = s('g', { style: 'opacity:0' });
    const fb = chipSvg(fam, lx(last) + sp / 2, r.y + 52, 96, `ω-${r.fam}`, r.fam === 3 ? 'var(--fadh)' : 'var(--a2)', { h: 38, size: 24, weight: 700 });
    g.append(dN, wN, co, me, fam);
    D.layers.nodes.append(g);
    gsap.set(g, { x: XR - (n - 1) * sp });
    return { g, n, dN, wN, fam, fb };
  });
  // EFA brace
  const brace = s('g', { style: 'opacity:0' });
  brace.append(s('path', { d: 'M1636,128 Q1656,128 1656,150 L1656,236 Q1656,260 1676,260 Q1656,260 1656,284 L1656,372 Q1656,394 1636,394', style: 'fill:none;stroke:var(--act);stroke-width:4;stroke-linecap:round' }));
  const bt = s('text', { x: 0, y: 0, transform: 'translate(1700 261) rotate(-90)', 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--act);font-weight:700' }); bt.textContent = 'Essential';
  brace.append(bt);
  brace.setAttribute('data-tip', JSON.stringify({ title: 'Essential fatty acids', body: 'Only <b>linoleic</b> and <b>linolenic</b> acids are bracketed as essential. Arachidonic acid sits outside the bracket.', src: SRC(9) }));
  D.layers.labels.append(brace);
  const aaTag = chipSvg(D.layers.labels, 150, 640, 290, 'Precursor of eicosanoids', 'var(--a2)', { h: 42, size: 22 });
  aaTag.style.opacity = 0;
  return {
    step(k) {
      const om = k >= 1;
      groups.forEach((G) => {
        gsap.to(G.g, { x: om ? XL : XR - (G.n - 1) * sp, duration: 1.1, ease: 'power3.inOut' });
        gsap.to(G.dN, { opacity: om ? 0 : 1, duration: 0.4 });
        gsap.to([G.wN, G.fam], { opacity: om ? 1 : 0, duration: 0.5, delay: om ? 0.7 : 0 });
      });
      show(guidesW, om, { delay: om ? 0.8 : 0 });
      show(guidesD, !om);
      show([brace, aaTag], k >= 2);
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 9 · Saturated vs cis vs trans in 3D (idealised geometry)            */
/* ------------------------------------------------------------------ */
function cisTransViz(el) {
  const kit = createScene(el, { cam: [0, 0, 70], fov: 28, autoRotate: 0 });
  const defs = [
    { d: {}, title: 'Saturated', sub: 'Stearic · 18:0', x: -21 },
    { d: { 9: 'cis' }, title: 'Cis', sub: 'Oleic · 18:1 Δ⁹', x: -1, note: 'H atoms on the same side' },
    { d: { 9: 'trans' }, title: 'Trans', sub: 'Elaidic · 18:1 Δ⁹ (trans)', x: 19, note: 'H atoms on opposite sides' },
  ];
  const mols = [];
  let minY = Infinity;
  defs.forEach((df, i) => {
    const data = faData(18, df.d);
    const vin = new Set(data.vinylH);
    const mol = buildMolecule(data, { hideH: false, highlight: { atoms: data.dblC, color: HX.orange }, color: (a, k) => (vin.has(k) ? 0x40c8ff : undefined) });
    const P = mol.userData.pos;
    const dir = P[8].clone().sub(P[0]);
    mol.rotation.z = -Math.PI / 2 - Math.atan2(dir.y, dir.x);
    data.vinylH.forEach((k) => { const m = halo(0.62, 0x40c8ff, 0.38); m.position.copy(P[k]); mol.add(m); });
    data.dblC.forEach((k) => { const m = halo(0.78, HX.orange, 0.28); m.position.copy(P[k]); mol.add(m); });
    const holder = new THREE.Group();
    holder.add(mol);
    kit.root.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mol);
    const top = P[0].clone().applyMatrix4(mol.matrixWorld);
    holder.position.set(df.x - (box.min.x + box.max.x) / 2, 9 - top.y, 0);
    holder.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(holder);
    minY = Math.min(minY, b2.min.y);
    mols.push({ holder, df, mol, data, i });
  });
  kit.camera.position.set(0, -3, 63);
  kit.controls.target.set(0, -3, 0);
  mols.forEach(({ holder, df, mol, data }) => {
    kit.label(df.title, [df.x, minY - 1.8, 0], { cls: 'acc' });
    kit.label(df.sub, [df.x, minY - 4.6, 0], { cls: 'sm plain' });
    if (df.note) {
      const c = mol.userData.pos[data.dblC[0]].clone().add(mol.userData.pos[data.dblC[1]]).multiplyScalar(0.5).applyMatrix4(mol.matrixWorld);
      const l = kit.label(df.note, [c.x + 9, c.y + 0.6, 0], { cls: 'sm' });
      l.element.style.color = 'var(--nadh)';
    }
  });
  kit.onFrame((dt, t) => mols.forEach(({ mol, i }) => { mol.rotation.y = 0; mol.parent.rotation.y = 0.32 * Math.sin(t * 0.6 + i * 1.3); }));
  return kitController(kit);
}

/* ------------------------------------------------------------------ */
/* 10 · Packing: straight chains pack, cis kinks don't                 */
/* ------------------------------------------------------------------ */
function packingViz(el) {
  const D = diagram(el, 960, 860);
  const N = 8, HY = 250, L = 360, KF = 0.46;
  const order = [3, 6, 1, 4, 7, 0, 5, 2];
  let frac = 0, kind = 'cis';
  const ch = Array.from({ length: N }, (_, i) => {
    const path = s('path', { style: `fill:none;stroke:${C_FA};stroke-width:7;stroke-linecap:round;stroke-linejoin:round` });
    const head = s('circle', { r: 22, style: `fill:${C_HEAD};stroke:color-mix(in oklab, var(--elec) 50%, var(--fg));stroke-width:2` });
    const mark = s('circle', { r: 10, style: `fill:${C_DB};stroke:var(--bg);stroke-width:3;opacity:0` });
    D.layers.nodes.append(path, head, mark);
    return { path, head, mark, x: 480, xt: 480, k: 0, kt: 0, u: 0, ut: 0, ph: i * 1.9, side: 1, ka: [24, 34, 28, 38, 22, 32, 36, 26][i] };
  });
  D.layers.regions.append(s('rect', { x: 20, y: HY - 46, width: 920, height: 4, rx: 2, style: 'fill:color-mix(in oklab, var(--elec) 35%, transparent)' }));
  D.text(24, HY - 62, 'Water', { cls: 'sm', style: `fill:${C_HEAD};font-weight:650` });
  const state = D.text(480, 64, 'Solid', { anchor: 'middle', cls: 'xl' });
  const stateSub = D.text(480, 108, 'Tight packing · fat', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const ldl = chipSvg(D.layers.labels, 480, 708, 470, 'Trans fats: ↑ LDL · ↓ HDL', 'var(--inh)', { h: 56, size: 28, weight: 700, text: 'var(--inh)', tip: { title: 'Trans fatty acids', body: 'Double bond substituents on opposite sides → straight chain → behave like saturated fatty acids. Clinically: <b>increase LDL and decrease HDL</b>.', src: SRC(10) } });
  ldl.style.opacity = 0;
  function targets() {
    const nU = Math.round(frac * N);
    const uns = new Set(order.slice(0, nU));
    ch.forEach((c, i) => { c.ut = uns.has(i) ? 1 : 0; c.kt = uns.has(i) && kind === 'cis' ? 1 : 0; });
    let x = 0; const xs = [0];
    for (let i = 1; i < N; i++) { x += 52 + 26 * (ch[i - 1].kt + ch[i].kt); xs.push(x); }
    const lean = 120 * (ch.reduce((a, c) => a + c.kt, 0) / N);
    ch.forEach((c, i) => { c.xt = 480 - (x + lean) / 2 + xs[i]; });
    const fluid = ch.reduce((a, c) => a + c.kt, 0) / N;
    state.textContent = fluid < 0.3 ? 'Solid' : fluid < 0.7 ? 'Semi-solid' : 'Liquid';
    stateSub.textContent = fluid < 0.3 ? (nU && kind === 'trans' ? 'Straight trans chains pack like saturated' : 'Tight packing · fat') : fluid < 0.7 ? 'Kinks start to loosen the packing' : 'Loose packing · oil · fluid membrane';
    state.style.fill = fluid < 0.3 ? 'var(--fg)' : 'var(--ink)';
    gsap.to(ldl, { opacity: kind === 'trans' && nU > 0 ? 1 : 0, duration: 0.5 });
  }
  const lp = loop((t, dt) => {
    const fluid = ch.reduce((a, c) => a + c.k, 0) / N;
    const amp = 0.8 + 7 * fluid;
    const e = k_(dt, 4), e2 = k_(dt, 6);
    ch.forEach((c) => {
      c.x += (c.xt - c.x) * e; c.k += (c.kt - c.k) * e; c.u += (c.ut - c.u) * e2;
      const x = c.x + amp * Math.sin(t * 2.2 + c.ph);
      const wob = (2 + 10 * fluid) * Math.sin(t * 1.7 + c.ph);
      const a2 = 90 - c.side * c.ka * c.k + wob * 0.5;
      c.head.setAttribute('cx', x); c.head.setAttribute('cy', HY + amp * 0.4 * Math.sin(t * 1.3 + c.ph));
      c.path.setAttribute('d', zigPath(x, HY + 22, [{ len: L * KF, ang: 90 + wob * 0.15 }, { len: L * (1 - KF), ang: a2 }], 6, 13));
      const ky = HY + 22 + L * KF;
      c.mark.setAttribute('cx', x + Math.cos((90 + wob * 0.15) * D2R) * 0); c.mark.setAttribute('cy', ky);
      c.mark.style.opacity = c.u;
    });
  });
  const sl = slider({ label: 'Unsaturated', min: 0, max: 100, step: 25, value: 0, width: 220, fmt: (v) => `${v}%`, onInput: (v) => { frac = v / 100; targets(); } });
  const sk = seg({ options: [{ v: 'cis', t: 'cis' }, { v: 'trans', t: 'trans' }], value: 'cis', onChange: (v) => { kind = v; targets(); } });
  ctrlBar(el, [sl, sk], { left: 0, right: 0, bottom: 0 }).style.justifyContent = 'center';
  targets();
  ch.forEach((c) => { c.x = c.xt; });
  lp.once();
  const PLAN = [[0, 'cis'], [50, 'cis'], [100, 'cis'], [100, 'trans']];
  return {
    enter: () => lp.start(),
    leave: () => lp.stop(),
    step(n) { const [f, k] = PLAN[Math.min(n, 3)]; kind = k; sk.set(k, false); sl.set(f, true); },
    destroy: () => { lp.stop(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 11 · ω-3 vs ω-6 mini chains                                         */
/* ------------------------------------------------------------------ */
function omegaMini(el, fam) {
  const D = diagram(el, 620, 200);
  D.svg.style.height = '200px';
  const d = fam === 3 ? [9, 12, 15] : [9, 12];
  const sp = 31, x0 = 70; // methyl at left
  const X = (c) => x0 + (18 - c) * sp;
  const ch = beadChain(D.layers.nodes, { n: 18, x1: X(1), dir: -1, y: 110, sp, amp: 12, r: 7.5, dbl: d, bw: 3.5, dOff: 7 });
  const col = fam === 3 ? 'var(--fadh)' : 'var(--a2)';
  for (let p = 1; p <= fam; p++) {
    const t = s('text', { x: X(19 - p), y: 66, 'text-anchor': 'middle', class: 'v-label', style: `font-size:21px;font-weight:700;fill:${col}` });
    t.textContent = p;
    D.layers.labels.append(t);
  }
  D.layers.labels.append(s('path', { d: `M${X(18) - 10},152 L${X(18) - 10},162 L${X(19 - fam) + 10},162 L${X(19 - fam) + 10},152`, style: `fill:none;stroke:${col};stroke-width:3;stroke-linecap:round` }));
  D.text((X(18) + X(19 - fam)) / 2 + (fam === 3 ? 30 : 0), 192, `ω-${fam}: first C=C`, { anchor: 'middle', style: `font-size:21px;font-weight:650;fill:${col}` });
  D.text(X(18) - 18, 118, 'CH₃', { anchor: 'end', style: 'font-size:21px;fill:var(--fg-2);font-weight:600' });
  D.text(X(1) + 16, 118, 'COOH', { style: `font-size:21px;fill:${C_O};font-weight:700` });
  return { destroy: () => D.destroy(), ch };
}

/* ------------------------------------------------------------------ */
/* 12 · Why essential: the Δ9 desaturase limit                          */
/* ------------------------------------------------------------------ */
function essentialViz(el) {
  const D = diagram(el, 960, 860);
  const sp = 46, X = (c) => 872 - (c - 1) * sp, B = X(10);
  D.region({ x: 40, y: 150, w: B - 40, h: 590, r: 30, fill: 'color-mix(in oklab, var(--inh) 9%, transparent)', stroke: 'color-mix(in oklab, var(--inh) 35%, transparent)' });
  D.region({ x: B, y: 150, w: 920 - B, h: 590, r: 30, fill: 'color-mix(in oklab, var(--act) 9%, transparent)', stroke: 'color-mix(in oklab, var(--act) 35%, transparent)' });
  D.text((40 + B) / 2, 60, 'Beyond C9', { anchor: 'middle', cls: 'lg', style: 'fill:var(--inh)' });
  D.text((40 + B) / 2, 100, 'No human desaturase', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  D.text((B + 920) / 2, 60, 'C1 → C9', { anchor: 'middle', cls: 'lg', style: 'fill:var(--act)' });
  D.text((B + 920) / 2, 100, 'Humans can add C=C', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const rows = [
    { f: FAS[4], y: 300, ok: true },
    { f: FAS[5], y: 470, ok: false },
    { f: FAS[6], y: 640, ok: false },
  ];
  const els = rows.map((r) => {
    const g = s('g', { style: 'opacity:0' });
    D.layers.nodes.append(g);
    const t = s('text', { x: 64, y: r.y - 56, class: 'v-label', style: 'font-size:30px;font-weight:680' });
    t.innerHTML = '';
    setRich(t, `${r.f.name} · ${r.f.n}:${r.f.d.length} Δ^{${r.f.d.join(',')}}`);
    g.append(t);
    beadChain(g, { n: 18, x1: X(1), dir: -1, y: r.y, sp, amp: 11, r: 8, dbl: r.f.d, bw: 3.5, dOff: 8 });
    r.f.d.forEach((k) => {
      const bad = k > 9;
      g.append(s('circle', { cx: (X(k) + X(k + 1)) / 2, cy: r.y, r: 26, style: `fill:none;stroke:${bad ? 'var(--inh)' : 'var(--act)'};stroke-width:3.5` }));
    });
    chipSvg(g, 760, r.y - 64, 250, r.ok ? '✓ Made in body' : '✕ Must be eaten', r.ok ? 'var(--act)' : 'var(--inh)', { h: 44, size: 24, weight: 700, text: r.ok ? 'var(--act)' : 'var(--inh)' });
    return g;
  });
  for (let c = 1; c <= 18; c++) D.text(X(c), 790, String(c), { anchor: 'middle', style: `font-size:20px;font-weight:600;fill:${c === 1 ? C_O : 'var(--fg-3)'}` });
  D.text(X(1) + 30, 790, '← C', { style: 'font-size:20px;fill:var(--fg-3)' });
  D.layers.labels.append(s('line', { x1: B, x2: B, y1: 140, y2: 750, style: 'stroke:var(--fg-2);stroke-width:3;stroke-dasharray:8 8' }));
  return { step: (n) => els.forEach((g, i) => show(g, i <= n)), destroy: () => D.destroy() };
}

/* ------------------------------------------------------------------ */
/* 13 · Eicosanoids from arachidonic acid                              */
/* ------------------------------------------------------------------ */
function eicosanoidViz(el) {
  const D = diagram(el, 1712, 720);
  D.node({ id: 'efa', x: 175, y: 120, label: 'Dietary essential FAs', kind: 'box', w: 340, h: 84, size: 28, color: 'var(--act)', tip: { title: 'Dietary essential fatty acids', body: 'Linoleic (ω-6) is converted to arachidonic acid.', src: SRC(12) } });
  D.node({ id: 'aa', x: 175, y: 360, label: 'Arachidonic acid', sub: '20 C · 20:4 · ω-6', kind: 'box', w: 340, h: 116, size: 32, color: 'var(--a1)', tip: { title: 'Arachidonic acid', body: '“Eicosa” = 20: eicosanoids are 20-carbon signalling lipids made from arachidonic acid (C20:4, Δ5,8,11,14).', src: SRCS('6, 9, 12') } });
  D.arrow({ from: 'efa', to: 'aa', width: 5, color: 'var(--fg-3)' });
  const R = [
    { y: 120, name: 'Prostaglandins', sub: 'PGE · PGI₂ · PGF₂α', col: 'var(--elec)', enz: 'Cyclooxygenase', acts: [
      ['Vasodilation (PGI₂)', { title: 'Vasodilation', body: 'Slide lists vasodilation for PGs. Textbook: <b>PGI₂ (prostacyclin)</b> is the classic vasodilator; PGF₂α generally constricts.', src: `${SRC(12)} · Lippincott` }],
      ['↓ Platelet aggregation (PGI₂)', { title: 'Inhibits platelet aggregation', body: 'Prostacyclin (PGI₂) from vessel walls opposes TXA₂.', src: `${SRC(12)} · Lippincott` }],
      ['Pain sensation', { title: 'Pain', body: 'Prostaglandins (e.g. PGE₂) sensitise pain fibres.', src: SRC(12) }],
      ['Uterine contraction', { title: 'Stimulates uterine contractions', body: 'PGF₂α and PGE₂ stimulate uterine contraction.', src: `${SRC(12)} · Lippincott` }],
    ] },
    { y: 360, name: 'Thromboxanes', sub: 'TXA₂', col: 'var(--inh)', enz: 'Cyclooxygenase', acts: [
      ['Vaso- & bronchoconstriction', { title: 'Vaso- and bronchoconstriction', body: 'TXA₂ constricts vascular and bronchial smooth muscle.', src: SRC(12) }],
      ['↑ Platelet aggregation', { title: 'Promotes platelet aggregation', body: 'The classic action of TXA₂ (made by platelets).', src: SRC(12) }],
      ['Smooth-muscle contraction', { title: 'Contraction of smooth muscle', body: '', src: SRC(12) }],
    ] },
    { y: 600, name: 'Leukotrienes', sub: 'LTs', col: 'var(--fadh)', enz: 'Lipoxygenase', acts: [
      ['Vaso- & bronchoconstriction', { title: 'Vaso- and bronchoconstriction', body: 'Leukotrienes are potent bronchoconstrictors (asthma, anaphylaxis).', src: `${SRC(12)} · Lippincott` }],
      ['Platelet aggregation? → TXA₂', { kicker: 'Accuracy note', title: 'Not a leukotriene action', body: 'Slide 12 lists “promotes platelet aggregation” under leukotrienes (a copy of the TX box). Standard texts attribute platelet aggregation to <b>thromboxane A₂</b>; leukotrienes act on airway/vascular smooth muscle and in inflammation.', src: `${SRC(12)} · Lippincott` }, true],
      ['Smooth-muscle contraction', { title: 'Contraction of smooth muscle', body: '', src: SRC(12) }],
    ] },
  ];
  const rowEls = R.map((r, ri) => {
    const els = [];
    const nd = D.node({ x: 650, y: r.y, label: r.name, sub: r.sub, kind: 'box', w: 300, h: 104, size: 31, color: r.col });
    els.push(nd.g);
    const a = D.arrow({ from: [348, 360 + (ri - 1) * 30], to: [492, r.y], curve: (ri - 1) * -30, width: 4, color: r.col });
    els.push(a.g);
    const et = D.text(650, r.y + 82, `via ${r.enz.toLowerCase()}`, { anchor: 'middle', style: 'font-size:21px;font-style:italic;fill:var(--fg-2);font-weight:560', tip: { title: r.enz, body: `${r.enz === 'Cyclooxygenase' ? 'Prostaglandins and thromboxanes' : 'Leukotrienes'} are made by the ${r.enz.toLowerCase()} pathway.`, src: 'Lippincott (pathway enzymes not on the slide)' } });
    els.push(et);
    r.acts.forEach(([t, tp, flag], i) => {
      const col = flag ? 'var(--fg-3)' : r.col;
      const cx = i % 2 ? 1390 : 1000, cy = r.y + (i < 2 ? -32 : 32);
      const c = chipSvg(D.layers.labels, cx, cy, 380, t, col, { h: 52, size: 23, text: flag ? 'var(--fg-2)' : 'var(--fg)', dash: flag, tip: tp, fill: flag ? 4 : 12 });
      els.push(c);
      r[`c${i}`] = c;
    });
    els.forEach((e) => (e.style.opacity = 0));
    return els;
  });
  // platelet balance (PGI₂ vs TXA₂)
  const bal = s('g', { style: 'opacity:0' });
  bal.append(s('path', { d: 'M1600,88 C1660,88 1660,150 1660,240 C1660,300 1640,328 1600,328', style: 'fill:none;stroke:var(--fg-2);stroke-width:3.5;stroke-dasharray:2 9;stroke-linecap:round' }));
  const bt = s('text', { x: 0, y: 0, transform: 'translate(1692 208) rotate(-90)', 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:700' }); bt.textContent = 'Platelet balance';
  bal.append(bt);
  D.layers.labels.append(bal);
  return {
    step(n) {
      rowEls.forEach((els, i) => show(els, n >= i + 1, { stagger: 0.05 }));
      show(bal, n >= 4);
      [R[0].c1, R[1].c1].forEach((c) => gsap.to(c, { scale: n >= 4 ? 1.06 : 1, svgOrigin: c.getAttribute('transform').match(/translate\(([^)]+)\)/)[1], duration: 0.4 }));
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 14 · Triacylglycerol assembly                                       */
/* ------------------------------------------------------------------ */
function tagViz(el) {
  const D = diagram(el, 960, 860);
  const YS = [250, 420, 590], GX = 170, OX = 270, HX_ = 322, CF = 360, SHIFT = 120;
  D.layers.regions.append(s('rect', { x: GX - 28, y: 196, width: 56, height: 450, rx: 28, style: `fill:color-mix(in oklab, ${C_GLY} 22%, transparent);stroke:color-mix(in oklab, ${C_GLY} 60%, transparent);stroke-width:2` }));
  D.text(GX, 166, 'Glycerol', { anchor: 'middle', style: `fill:${C_GLY};font-weight:700;font-size:30px` });
  const water = [], hs = [], esters = [], fas = [];
  YS.forEach((y, i) => {
    D.text(GX, y + 11, 'C', { anchor: 'middle', style: 'font-size:32px;font-weight:700' });
    D.text(GX - 50, y + 9, `${i + 1}`, { anchor: 'end', style: 'font-size:22px;fill:var(--fg-3);font-weight:600' });
    D.layers.edges.append(s('line', { x1: GX + 20, x2: OX - 18, y1: y, y2: y, style: 'stroke:var(--fg-3);stroke-width:4;stroke-linecap:round' }));
    D.text(OX, y + 11, 'O', { anchor: 'middle', style: `font-size:32px;font-weight:750;fill:${C_O}` });
    const hg = s('g');
    hg.append(s('line', { x1: OX + 18, x2: HX_ - 14, y1: y, y2: y, style: 'stroke:var(--fg-3);stroke-width:4;stroke-linecap:round' }));
    hg.append(Object.assign(s('text', { x: HX_, y: y + 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:650' }), { textContent: 'H' }));
    D.layers.nodes.append(hg); hs.push(hg);
    const es = s('line', { x1: OX + 18, x2: CF - 18, y1: y, y2: y, style: `stroke:${C_O};stroke-width:5;stroke-linecap:round;opacity:0` });
    D.layers.edges.append(es); esters.push(es);
    // fatty acid
    const g = s('g');
    g.append(Object.assign(s('text', { x: 0, y: 11, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:32px;font-weight:700' }), { textContent: 'C' }));
    g.append(s('line', { x1: -5, x2: -5, y1: -18, y2: -42, style: `stroke:${C_O};stroke-width:4;stroke-linecap:round` }));
    g.append(s('line', { x1: 5, x2: 5, y1: -18, y2: -42, style: `stroke:${C_O};stroke-width:4;stroke-linecap:round` }));
    g.append(Object.assign(s('text', { x: 0, y: -50, 'text-anchor': 'middle', class: 'v-label', style: `font-size:30px;font-weight:750;fill:${C_O}` }), { textContent: 'O' }));
    const oh = s('g');
    oh.append(s('line', { x1: -18, x2: -40, y1: 0, y2: 0, style: `stroke:var(--fg-3);stroke-width:4;stroke-linecap:round` }));
    oh.append(Object.assign(s('text', { x: -46, y: 10, 'text-anchor': 'end', class: 'v-label', style: `font-size:30px;font-weight:750;fill:${C_O}` }), { textContent: 'HO' }));
    g.append(oh);
    zigEl(g, 18, 0, i === 1 ? [{ len: 190, ang: 0 }, { len: 170, ang: 28 }] : [{ len: 380, ang: 0 }], { amp: 12, step: 26, w: 6 });
    const lab = s('text', { x: 200, y: -36, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:600' });
    setRich(lab, `Fatty acid · R${"'".repeat(i + 1)}`);
    g.append(lab);
    D.layers.nodes.append(g);
    gsap.set(g, { x: CF + SHIFT, y });
    fas.push({ g, oh });
    const w = D.badge(0, 0, 'H_{2}O', { color: C_HEAD, size: 26 });
    gsap.set(w, { x: CF + 20, y: y - 6, opacity: 0 });
    water.push(w);
  });
  const wl = D.text(700, 56, '', { anchor: 'middle', cls: 'sm', style: `fill:${C_HEAD};font-weight:650` });
  const estLbl = D.text(318, 300, 'ester bond', { anchor: 'middle', style: `font-size:22px;font-weight:700;fill:${C_O};opacity:0`, tip: { title: 'Ester bond', body: 'Acid –OH + alcohol –H leave as water (condensation, the chemical view). In cells, fatty acids are first activated as acyl-CoA before esterification (Lippincott).', src: `${SRC(13)} · Lippincott Ch 16` } });
  const fn = ['Energy', 'Insulation', 'Thermogenesis', 'Protects organs'].map((t, i) => chipSvg(D.layers.labels, 118 + i * 241, 722, 224, t, 'var(--act)', { h: 54, size: 25, tip: { title: 'Functions of triglycerides', body: 'Provision of energy · insulation · thermogenesis · protection of internal organs.', src: SRC(14) } }));
  const cl = [['Excess lipolysis', 'Excessive lipolysis in starvation and diabetes.'], ['Obesity', 'Excess stored triglyceride.'], ['Fatty liver', 'Triglyceride accumulates in the liver.']].map(([t, b], i) => chipSvg(D.layers.labels, 160 + i * 320, 806, 300, t, 'var(--inh)', { h: 54, size: 25, text: 'var(--inh)', tip: { kicker: 'Clinical aspects', title: t, body: b, src: SRC(14) } }));
  [...fn, ...cl].forEach((c) => (c.style.opacity = 0));
  let last = 0;
  function apply(n) {
    const anim = Math.abs(n - last) === 1 && n > last;
    YS.forEach((y, i) => {
      const done = n >= i + 1;
      const now = anim && n === i + 1;
      const F = fas[i];
      if (now) {
        const tl = gsap.timeline();
        tl.to(water[i], { opacity: 1, x: (HX_ + CF + SHIFT - 46) / 2, y: y - 4, duration: 0.01 })
          .to([hs[i], F.oh], { opacity: 0, duration: 0.4 }, 0)
          .fromTo(water[i], { scale: 0.4 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' }, 0.1)
          .to(water[i], { x: 620 + i * 104, y: 100, duration: 0.9, ease: 'power2.inOut' }, 0.6)
          .to(F.g, { x: CF, duration: 0.8, ease: 'power3.inOut' }, 0.7)
          .to(esters[i], { opacity: 1, duration: 0.4 }, 1.4);
      } else {
        gsap.to([hs[i], F.oh], { opacity: done ? 0 : 1, duration: 0.3 });
        gsap.to(water[i], { opacity: done ? 1 : 0, x: done ? 620 + i * 104 : CF + 20, y: done ? 100 : y - 6, scale: 1, duration: 0.3 });
        gsap.to(F.g, { x: done ? CF : CF + SHIFT, duration: 0.5 });
        gsap.to(esters[i], { opacity: done ? 1 : 0, duration: 0.3 });
      }
    });
    const k = Math.min(3, n);
    wl.textContent = k ? `${k} H₂O released` : '';
    gsap.to(estLbl, { opacity: n >= 1 ? 1 : 0, duration: 0.5, delay: anim && n === 1 ? 1.3 : 0 });
    show(fn, n >= 4, { stagger: 0.06 });
    show(cl, n >= 5, { stagger: 0.06 });
    last = n;
  }
  return { step: apply, destroy: () => D.destroy() };
}

/* ------------------------------------------------------------------ */
/* 15 · Phospholipids: two backbones                                   */
/* ------------------------------------------------------------------ */
function backbonesViz(el) {
  const D = diagram(el, 1712, 720);
  const head = (x, y, txt, w) => { const n = D.node({ x, y, label: txt, kind: 'box', w, h: 70, size: 26, r: 35, color: C_HEAD }); return n.g; };
  const phos = (x, y) => { const g = s('g'); g.append(s('circle', { cx: x, cy: y, r: 32, style: `fill:color-mix(in oklab, ${C_P} 24%, transparent);stroke:${C_P};stroke-width:3` })); g.append(Object.assign(s('text', { x, y: y + 10, 'text-anchor': 'middle', class: 'v-label', style: `font-weight:750;fill:${C_P}` }), { textContent: 'P' })); D.layers.nodes.append(g); return g; };
  const bond = (x1, y1, x2, y2) => D.layers.edges.append(s('line', { x1, y1, x2, y2, style: 'stroke:var(--fg-3);stroke-width:5;stroke-linecap:round' }));
  const lab = (x, y, t, col = 'var(--fg-2)') => D.text(x, y, t, { style: `font-size:26px;font-weight:600;fill:${col}` });
  // glycerophospholipid
  const GXc = 290;
  D.text(GXc, 36, 'Glycerophospholipid', { anchor: 'middle', style: `font-size:32px;font-weight:720;fill:${C_GLY}` });
  bond(GXc, 150, GXc, 196); bond(GXc, 254, GXc, 290);
  head(GXc, 118, 'NB', 120); phos(GXc, 224);
  const gBar = s('rect', { x: GXc - 95, y: 290, width: 190, height: 46, rx: 23, style: `fill:color-mix(in oklab, ${C_GLY} 26%, transparent);stroke:${C_GLY};stroke-width:3` });
  D.layers.nodes.append(gBar);
  D.text(GXc, 322, 'Glycerol', { anchor: 'middle', style: 'font-size:24px;font-weight:700' });
  zigEl(D.layers.nodes, GXc - 52, 338, [{ len: 250, ang: 90 }], { amp: 9, step: 18, w: 7 });
  zigEl(D.layers.nodes, GXc + 52, 338, [{ len: 120, ang: 90 }, { len: 130, ang: 118 }], { amp: 9, step: 18, w: 7 });
  lab(GXc + 110, 126, 'Nitrogenous base');
  lab(GXc + 60, 232, 'Phosphate', C_P);
  const gAlc = lab(GXc + 120, 322, 'alcohol', C_GLY);
  D.text(GXc, 628, '2 fatty acids', { anchor: 'middle', style: 'font-size:26px;font-weight:650;fill:var(--ink)' });
  // sphingophospholipid
  const SXc = 1040;
  D.text(SXc, 36, 'Sphingophospholipid', { anchor: 'middle', style: `font-size:32px;font-weight:720;fill:${C_SPH}` });
  bond(SXc, 150, SXc, 196); bond(SXc, 254, SXc, 290);
  const sHead = D.node({ x: SXc, y: 118, label: 'NB', kind: 'box', w: 140, h: 70, size: 26, r: 35, color: C_HEAD });
  phos(SXc, 224);
  const sBar = s('rect', { x: SXc - 100, y: 290, width: 200, height: 46, rx: 23, style: `fill:color-mix(in oklab, ${C_SPH} 24%, transparent);stroke:${C_SPH};stroke-width:3` });
  D.layers.nodes.append(sBar);
  D.text(SXc, 322, 'Sphingosine', { anchor: 'middle', style: 'font-size:24px;font-weight:700' });
  zigEl(D.layers.nodes, SXc - 60, 338, [{ len: 250, ang: 90 }], { amp: 9, step: 18, w: 7, color: C_SPH });
  zigEl(D.layers.nodes, SXc + 60, 338, [{ len: 250, ang: 90 }], { amp: 9, step: 18, w: 7 });
  lab(SXc + 60, 232, 'Phosphate', C_P);
  const sAlc = lab(SXc + 120, 322, 'alcohol', C_SPH);
  lab(SXc + 110, 470, '1 fatty acid', 'var(--ink)');
  const amide = D.text(SXc + 110, 504, '(amide bond)', { style: 'font-size:22px;fill:var(--fg-3)', tip: { title: 'Amide, not ester', body: 'The fatty acid joins the amino group of sphingosine by an amide bond (Lippincott). Sphingosine’s own hydrocarbon tail is the second chain.', src: `${SRC(16)} · Lippincott` } });
  D.text(SXc - 60, 628, 'sphingosine chain', { anchor: 'middle', style: `font-size:22px;font-weight:600;fill:${C_SPH}` });
  // glows for step 1
  const glowG = gBar.cloneNode(); glowG.setAttribute('filter', `url(#${D.glowId})`); glowG.style.opacity = 0;
  const glowS = sBar.cloneNode(); glowS.setAttribute('filter', `url(#${D.glowId})`); glowS.style.opacity = 0;
  D.layers.regions.append(glowG, glowS);
  // step 2: members & sphingo build
  const mem = s('g', { style: 'opacity:0' });
  const MEM = [['PC · lecithin', 'Phosphatidylcholine (lecithin)'], ['PE', 'Phosphatidylethanolamine'], ['PS', 'Phosphatidylserine'], ['PI', 'Phosphatidylinositol'], ['Plasmalogens', 'Plasmalogens (named only)'], ['Cardiolipin', 'Cardiolipin · inner mitochondrial membrane']];
  MEM.forEach(([t, b], i) => chipSvg(mem, 600 + (i % 2) * 190, 420 + Math.floor(i / 2) * 64, 176, t, C_GLY, { h: 50, size: 22, tip: { title: b, body: 'A glycerophospholipid (alcohol = glycerol).', src: SRC(16) } }));
  D.layers.labels.append(mem);
  const cer = s('g', { style: 'opacity:0' });
  cer.append(s('path', { d: `M${SXc + 276},286 L${SXc + 290},286 L${SXc + 290},590 L${SXc + 276},590`, style: `fill:none;stroke:${C_SPH};stroke-width:3;stroke-linecap:round` }));
  chipSvg(cer, SXc + 490, 400, 320, 'Sphingosine + 1 FA', C_SPH, { h: 50, size: 24 });
  cer.append(Object.assign(s('text', { x: SXc + 490, y: 462, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:720;fill:var(--act)' }), { textContent: '= Ceramide' }));
  D.layers.labels.append(cer);
  const sm = s('g', { style: 'opacity:0' });
  chipSvg(sm, SXc + 490, 528, 340, 'Ceramide + P + choline', C_HEAD, { h: 50, size: 24 });
  sm.append(Object.assign(s('text', { x: SXc + 490, y: 592, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:720;fill:var(--elec)' }), { textContent: '= Sphingomyelin' }));
  chipSvg(sm, SXc + 250, 118, 220, 'Myelin sheath', 'var(--a1)', { h: 48, size: 24, text: 'var(--ink)', tip: { title: 'Sphingomyelin', body: 'Important component of the <b>myelin sheath</b> of nerve fibres.', src: SRC(16) } });
  D.layers.labels.append(sm);
  // step 4: functions strip
  const FN = [['Cell membranes', 'Components of cell membranes'], ['Blood coagulation', 'Take part in blood coagulation'], ['Lung surfactant', 'Pulmonary surfactant (DPPC)'], ['Fat digestion', 'Digestion and absorption of fats'], ['Choline → ACh', 'Source of choline for acetylcholine'], ['Lipoproteins', 'Component of lipoproteins']];
  const fns = FN.map(([t, b], i) => chipSvg(D.layers.labels, 143 + i * 285, 676, 262, t, 'var(--a1)', { h: 54, size: 24, tip: { kicker: 'Phospholipid functions', title: t, body: b, src: SRC(19) } }));
  fns.forEach((c) => (c.style.opacity = 0));
  return {
    step(n) {
      gsap.to([glowG, glowS], { opacity: n === 1 ? 0.9 : 0, duration: 0.5 });
      [gAlc, sAlc].forEach((t) => { t.style.fontWeight = n === 1 ? 800 : 600; t.style.fontSize = n === 1 ? '30px' : '26px'; });
      show(mem, n >= 2, {});
      show(cer, n >= 2);
      show(sm, n >= 3);
      sHead.g.querySelector('text').textContent = n >= 3 ? 'Choline' : 'NB';
      show(fns, n >= 4, { stagger: 0.05 });
      show(amide, true);
    },
    destroy: () => D.destroy(),
  };
}

/* ------------------------------------------------------------------ */
/* 16 · Head-group swapper (real 3D head groups)                       */
/* ------------------------------------------------------------------ */
const HEADS = [
  { v: 'pa', t: 'PA', key: 'glycerol-3-p', name: 'Phosphatidic acid', f: 'Diacylglycerol + PO₄', head: null, chips: [['Parent glycerophospholipid', 'acc']], cap: 'Glycerol 3-phosphate · the PA backbone' },
  { v: 'ps', t: '+ Serine', key: 'ser', name: 'Phosphatidylserine', f: 'Phosphatidic acid + serine', head: 'Serine', chips: [['PS', '']], cap: 'Serine' },
  { v: 'pe', t: '+ Ethanolamine', key: 'ethanolamine', name: 'Phosphatidyl&shy;ethanolamine', f: 'Phosphatidic acid + ethanolamine', head: 'Ethanolamine', chips: [['PE', '']], cap: 'Ethanolamine' },
  { v: 'pc', t: '+ Choline', key: 'choline', name: 'Phosphatidylcholine', f: 'Phosphatidic acid + choline', head: 'Choline', chips: [['Lecithin', 'acc'], ['DPPC → surfactant', 'nadh']], cap: 'Choline' },
  { v: 'pi', t: '+ Inositol', key: 'inositol', name: 'Phosphatidylinositol', f: 'Phosphatidic acid + inositol', head: 'Inositol', chips: [['No nitrogenous base', '']], cap: 'Inositol' },
  { v: 'cl', t: 'Cardiolipin', key: 'glycerol', name: 'Cardiolipin', f: '2 phosphatidic acid + glycerol', head: null, chips: [['Inner mitochondrial membrane', 'atp']], cap: 'Glycerol · the bridging alcohol' },
];
async function headSwapViz(el) {
  const left = h('div', { style: 'position:absolute;left:0;top:0;width:760px;height:620px' });
  el.append(left);
  const D = diagram(left, 760, 620);
  D.svg.style.width = '760px'; D.svg.style.height = '620px';
  const unit = (x, parent, o = {}) => {
    const g = s('g');
    zigEl(g, x - 50, 332, [{ len: 250, ang: 90 }], { amp: 9, step: 18, w: 7 });
    zigEl(g, x + 50, 332, o.kink === false ? [{ len: 250, ang: 90 }] : [{ len: 120, ang: 90 }, { len: 130, ang: 116 }], { amp: 9, step: 18, w: 7 });
    g.append(s('line', { x1: x, y1: 252, x2: x, y2: 286, style: 'stroke:var(--fg-3);stroke-width:5;stroke-linecap:round' }));
    g.append(s('rect', { x: x - 90, y: 284, width: 180, height: 46, rx: 23, style: `fill:color-mix(in oklab, ${C_GLY} 26%, transparent);stroke:${C_GLY};stroke-width:3` }));
    g.append(Object.assign(s('text', { x, y: 316, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:700' }), { textContent: 'Glycerol' }));
    g.append(s('circle', { cx: x, cy: 220, r: 32, style: `fill:color-mix(in oklab, ${C_P} 24%, transparent);stroke:${C_P};stroke-width:3` }));
    g.append(Object.assign(s('text', { x, y: 230, 'text-anchor': 'middle', class: 'v-label', style: `font-weight:750;fill:${C_P}` }), { textContent: 'P' }));
    parent.append(g);
    return g;
  };
  const single = s('g');
  D.layers.nodes.append(single);
  unit(300, single);
  single.append(s('line', { x1: 300, y1: 146, x2: 300, y2: 188, style: 'stroke:var(--fg-3);stroke-width:5;stroke-linecap:round' }));
  const headRect = s('rect', { x: 185, y: 76, width: 230, height: 70, rx: 35, style: `fill:color-mix(in oklab, ${C_HEAD} 20%, transparent);stroke:${C_HEAD};stroke-width:3` });
  const headTxt = s('text', { x: 300, y: 121, 'text-anchor': 'middle', class: 'v-label', style: 'font-weight:700' });
  single.append(headRect, headTxt);
  single.append(s('path', { d: 'M470,186 L486,186 L486,590 L470,590', style: 'fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round' }));
  const paLbl = s('text', { x: 506, y: 396, class: 'v-label', style: 'font-size:26px;font-weight:700;fill:var(--ink)' }); paLbl.textContent = 'Phosphatidic';
  const paLbl2 = s('text', { x: 506, y: 428, class: 'v-label', style: 'font-size:26px;font-weight:700;fill:var(--ink)' }); paLbl2.textContent = 'acid';
  single.append(paLbl, paLbl2);
  const hLab = s('text', { x: 440, y: 120, class: 'v-label', style: 'font-size:24px;fill:var(--fg-2)' }); hLab.textContent = 'head group';
  single.append(hLab);
  const cl = s('g', { style: 'opacity:0' });
  D.layers.nodes.append(cl);
  unit(190, cl, { kink: false });
  unit(560, cl);
  cl.append(s('line', { x1: 190, y1: 188, x2: 190, y2: 132, style: 'stroke:var(--fg-3);stroke-width:5;stroke-linecap:round' }));
  cl.append(s('line', { x1: 560, y1: 188, x2: 560, y2: 132, style: 'stroke:var(--fg-3);stroke-width:5;stroke-linecap:round' }));
  cl.append(s('rect', { x: 170, y: 88, width: 410, height: 46, rx: 23, style: `fill:color-mix(in oklab, ${C_GLY} 30%, transparent);stroke:${C_GLY};stroke-width:3` }));
  cl.append(Object.assign(s('text', { x: 375, y: 120, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:700' }), { textContent: 'Glycerol (bridge)' }));
  [190, 560].forEach((x) => cl.append(Object.assign(s('text', { x, y: 612, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--ink);font-weight:650' }), { textContent: 'Phosphatidic acid' })));
  // right: readout + 3D head group
  const nameEl = h('div', { style: 'font:720 52px var(--font);letter-spacing:-.025em;line-height:1.05' });
  const fEl = h('div', { style: 'font-size:30px;color:var(--fg-2);margin-top:10px' });
  const chipsEl = h('div', { style: 'display:flex;gap:12px;margin-top:16px;font-size:27px;flex-wrap:wrap' });
  el.append(h('div', { style: 'position:absolute;left:800px;right:0;top:0' }, [nameEl, fEl, chipsEl]));
  const host = h('div', { style: 'position:absolute;left:800px;right:0;top:190px;bottom:96px' });
  const capEl = h('div', { style: 'position:absolute;left:800px;right:0;bottom:104px;font-size:24px;color:var(--fg-3);text-align:center;pointer-events:none;z-index:2' });
  el.append(host, capEl);
  const viewer = await moleculeScene(host, HEADS[0].key, { fill: 0.92, mol: { hideH: false }, autoRotate: 1.4 });
  let cur = -1;
  function select(i, anim = true) {
    if (i === cur) return;
    cur = i;
    const H = HEADS[i];
    nameEl.innerHTML = H.name;
    fEl.innerHTML = H.f;
    chipsEl.innerHTML = '';
    H.chips.forEach(([t, c]) => chipsEl.append(h('span', { class: `chip ${c}`, text: t })));
    capEl.textContent = `3D · ${H.cap}`;
    const isCL = H.v === 'cl';
    gsap.to(single, { opacity: isCL ? 0 : 1, duration: 0.4 });
    gsap.to(cl, { opacity: isCL ? 1 : 0, duration: 0.4 });
    headTxt.textContent = H.head || '— OH';
    headRect.style.strokeDasharray = H.head ? 'none' : '8 8';
    headTxt.style.fill = H.head ? 'var(--fg)' : 'var(--fg-3)';
    if (anim) gsap.fromTo([headRect, headTxt], { opacity: 0.2 }, { opacity: 1, duration: 0.5 });
    if (anim) viewer.swap(H.key);
    sg.set(H.v, false);
  }
  const sg = seg({ options: HEADS.map((x) => ({ v: x.v, t: x.t })), value: 'pa', onChange: (v) => select(HEADS.findIndex((x) => x.v === v)) });
  ctrlBar(el, [sg], { left: 0, right: 0, bottom: 0 }).style.justifyContent = 'center';
  select(0, false);
  return { ...viewer, step: (n) => select(Math.min(n, HEADS.length - 1)), destroy: () => { viewer.destroy(); D.destroy(); } };
}

/* ------------------------------------------------------------------ */
/* 17 · Lung surfactant: alveolus with / without DPPC                  */
/* ------------------------------------------------------------------ */
function surfactantViz(el) {
  const D = diagram(el, 960, 860);
  const CX = 560, CY = 450;
  D.layers.regions.append(s('rect', { x: 0, y: 130, width: 960, height: 630, rx: 40, style: 'fill:color-mix(in oklab, var(--o2) 8%, transparent);stroke:color-mix(in oklab, var(--o2) 25%, transparent);stroke-width:2' }));
  const air = s('path', { style: 'fill:color-mix(in oklab, var(--bg) 82%, var(--elec))' });
  const fluid = s('path', { style: `fill:none;stroke:${C_HEAD};stroke-width:9;opacity:.45;stroke-linecap:round` });
  const wall = s('path', { style: 'fill:none;stroke:color-mix(in oklab, var(--o2) 75%, var(--fg));stroke-width:14;stroke-linejoin:round;stroke-linecap:round' });
  D.layers.regions.append(air);
  D.layers.edges.append(fluid, wall);
  const M = 34;
  const lol = Array.from({ length: M }, () => {
    const g = s('g');
    const t1 = s('line', { style: `stroke:${C_FA};stroke-width:3.5;stroke-linecap:round` });
    const t2 = s('line', { style: `stroke:${C_FA};stroke-width:3.5;stroke-linecap:round` });
    const hd = s('circle', { r: 6, style: `fill:${C_HEAD}` });
    g.append(t1, t2, hd);
    D.layers.nodes.append(g);
    return { g, t1, t2, hd };
  });
  const arrows = Array.from({ length: 7 }, () => { const a = s('path', { style: 'fill:none;stroke:var(--inh);stroke-width:5;stroke-linecap:round;stroke-linejoin:round' }); D.layers.fx.append(a); return a; });
  const cell = s('g');
  cell.append(s('rect', { x: -40, y: -6, width: 80, height: 64, rx: 22, style: 'fill:color-mix(in oklab, var(--fadh) 30%, var(--bg));stroke:var(--fadh);stroke-width:3' }));
  cell.append(s('circle', { cx: 0, cy: 28, r: 13, style: 'fill:var(--fadh);opacity:.75' }));
  D.layers.nodes.append(cell);
  const sec = Array.from({ length: 4 }, () => { const c = s('circle', { r: 5, style: `fill:${C_HEAD}` }); D.layers.fx.append(c); return c; });
  const cellLbl = D.text(0, 0, 'Type II pneumocyte', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fadh);font-weight:700', tip: { title: 'Type II pneumocytes', body: 'Secrete surfactant (DPPC) into the extracellular fluid layer lining the alveoli.', src: SRC(18) } });
  D.text(CX, CY + 8, 'Air', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3);font-weight:600' });
  const status = D.text(480, 50, '', { anchor: 'middle', cls: 'lg' });
  const status2 = D.text(480, 94, '', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const gaugeFill = h('div', { style: 'height:100%;width:20%;border-radius:99px;background:var(--act);transition:width .6s var(--ease), background .6s' });
  const gauge = h('div', { class: 'ctrl' }, [h('label', { text: 'Surface tension' }), h('div', { style: 'width:200px;height:14px;border-radius:99px;background:var(--surface-3);overflow:hidden' }, [gaugeFill])]);
  tip(gauge, { title: 'Surface tension', body: 'Surfactant (DPPC) lowers alveolar surface tension, so alveoli do not collapse at the end of expiration.', src: SRC(18) });
  let sT = 1, sCur = 1, steroid = false;
  const setStatus = () => {
    status.textContent = sT ? 'Surfactant present · alveoli stay open' : 'No surfactant · alveoli collapse';
    status.style.fill = sT ? 'var(--act)' : 'var(--inh)';
    status2.textContent = sT ? (steroid ? 'After antenatal glucocorticoids → lung maturation' : 'DPPC lowers surface tension') : 'Preterm infant · insufficient surfactant → RDS';
    gaugeFill.style.width = sT ? '22%' : '92%';
    gaugeFill.style.background = sT ? 'var(--act)' : 'var(--inh)';
  };
  const lp = loop((t, dt) => {
    sCur += (sT - sCur) * k_(dt, 2.2);
    const ph = (1 - Math.cos((2 * Math.PI * t) / 4.6)) / 2;
    const Ron = 182 + 78 * ph, Roff = 62 + 200 * Math.pow(ph, 2.6);
    const R = Roff + (Ron - Roff) * sCur;
    const cr = (1 - sCur) * Math.max(0, 1 - R / 170) * 0.28;
    const del = Math.min(0.62, Math.asin(Math.min(0.99, 40 / R)));
    const rad = (th) => R * (1 + cr * (0.6 * Math.sin(5 * th + 1.3) + 0.4 * Math.sin(9 * th - t * 0.6)));
    const pt = (th, off = 0) => { const r = rad(th) + off; return [CX + r * Math.cos(th), CY + r * Math.sin(th)]; };
    const arc = [];
    for (let i = 0; i <= 90; i++) arc.push(pt(-Math.PI + del + (i / 90) * (2 * Math.PI - 2 * del)));
    const top = [0, CY - 40], bot = [0, CY + 40];
    wall.setAttribute('d', ptsD([top, ...arc, bot]));
    air.setAttribute('d', ptsD([top, ...arc, bot]) + ' Z');
    const fl = [];
    for (let i = 0; i <= 90; i++) fl.push(pt(-Math.PI + del + 0.05 + (i / 90) * (2 * Math.PI - 2 * del - 0.1), -14));
    fluid.setAttribute('d', ptsD(fl));
    lol.forEach((l, j) => {
      const th = -Math.PI + del + ((j + 0.5) / M) * (2 * Math.PI - 2 * del);
      const [hx, hy] = pt(th, -14), c = Math.cos(th), sn = Math.sin(th);
      l.hd.setAttribute('cx', hx); l.hd.setAttribute('cy', hy);
      [[l.t1, 4], [l.t2, -4]].forEach(([ln, o]) => { ln.setAttribute('x1', hx - sn * o - c * 5); ln.setAttribute('y1', hy + c * o - sn * 5); ln.setAttribute('x2', hx - sn * o - c * 28); ln.setAttribute('y2', hy + c * o - sn * 28); });
      l.g.style.opacity = sCur;
    });
    arrows.forEach((a, k) => {
      const th = -2.6 + k * 0.86;
      const [x1, y1] = pt(th, 56), [x2, y2] = pt(th, 14);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      a.setAttribute('d', `M${x1},${y1} L${x2},${y2} M${x2 - 14 * Math.cos(ang - 0.5)},${y2 - 14 * Math.sin(ang - 0.5)} L${x2},${y2} L${x2 - 14 * Math.cos(ang + 0.5)},${y2 - 14 * Math.sin(ang + 0.5)}`);
      a.style.opacity = (1 - sCur) * (0.45 + 0.55 * (1 - ph));
    });
    const thc = -2.05, [cx, cy] = pt(thc, 6);
    cell.setAttribute('transform', `translate(${cx} ${cy}) rotate(${thc / D2R - 90})`);
    const [lx, ly] = pt(thc, 110);
    cellLbl.setAttribute('x', Math.max(130, lx)); cellLbl.setAttribute('y', Math.max(176, ly));
    sec.forEach((c, k) => {
      const f = ((t * 0.5 + k / 4) % 1);
      const [px, py] = pt(thc + (k - 1.5) * 0.06, 8 - f * 22);
      c.setAttribute('cx', px); c.setAttribute('cy', py);
      c.style.opacity = sCur * Math.sin(f * Math.PI);
    });
  });
  const tg = toggle({ label: 'Surfactant (DPPC)', on: true, onChange: (v) => { sT = v ? 1 : 0; if (!v) steroid = false; setStatus(); } });
  ctrlBar(el, [tg, gauge], { left: 0, right: 0, bottom: 0 }).style.justifyContent = 'center';
  setStatus();
  lp.once();
  return {
    enter: () => lp.start(),
    leave: () => lp.stop(),
    step(n) { steroid = n >= 2; tg.set(n !== 1, true); setStatus(); },
    destroy: () => { lp.stop(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 18 · Glycolipids (SNFG sugar symbols)                               */
/* ------------------------------------------------------------------ */
const SNFG = { Glc: '#1f8fd6', Gal: '#ffd400', GalNAc: '#ffd400', NeuAc: '#a54399' };
function sugarSym(parent, kind, x, y, sz = 28) {
  const st = `fill:${SNFG[kind]};stroke:color-mix(in oklab, var(--fg) 55%, transparent);stroke-width:2.5`;
  let e;
  if (kind === 'GalNAc') e = s('rect', { x: x - sz, y: y - sz, width: 2 * sz, height: 2 * sz, rx: 4, style: st });
  else if (kind === 'NeuAc') e = s('path', { d: `M${x},${y - sz * 1.25} L${x + sz * 1.25},${y} L${x},${y + sz * 1.25} L${x - sz * 1.25},${y} Z`, style: st });
  else e = s('circle', { cx: x, cy: y, r: sz, style: st });
  parent.append(e);
  return e;
}
function glycolipidViz(el) {
  const D = diagram(el, 1712, 720);
  const SURF = 524;
  const mem = s('g', { style: 'opacity:.28' });
  for (let x = 24; x < 1700; x += 38) {
    mem.append(s('line', { x1: x - 5, y1: SURF + 8, x2: x - 5, y2: SURF + 98, style: `stroke:${C_FA};stroke-width:3` }));
    mem.append(s('line', { x1: x + 5, y1: SURF + 8, x2: x + 5, y2: SURF + 98, style: `stroke:${C_FA};stroke-width:3` }));
    mem.append(s('circle', { cx: x, cy: SURF, r: 11, style: `fill:${C_HEAD}` }));
  }
  mem.setAttribute('data-tip', JSON.stringify({ title: 'Outer leaflet of the cell membrane', body: 'Glycolipids sit in the outer leaflet with their sugars facing outside the cell.', src: SRC(21) }));
  D.layers.regions.append(mem);
  const cols = [
    { x: 300, name: 'Cerebroside', comp: 'Ceramide + monosaccharide', loc: 'Brain · myelin sheath' },
    { x: 860, name: 'Sulfatide', comp: 'Ceramide + galactose + sulfate', loc: 'Brain · kidneys' },
    { x: 1400, name: 'Ganglioside G<tspan baseline-shift="sub" font-size="70%">M1</tspan>', comp: 'Ceramide + oligosaccharide + NANA', loc: 'Ganglion cells of the CNS' },
  ];
  const anchor = (x) => {
    const g = s('g');
    g.append(s('path', { d: `M${x - 34},${SURF - 4} L${x + 22},${SURF - 4}`, style: `stroke:${C_SPH};stroke-width:16;stroke-linecap:round` }));
    zigEl(g, x - 28, SURF + 8, [{ len: 92, ang: 90 }], { color: C_SPH, amp: 6, step: 12, w: 6 });
    zigEl(g, x + 16, SURF + 8, [{ len: 92, ang: 90 }], { amp: 6, step: 12, w: 6 });
    D.layers.nodes.append(g);
    return g;
  };
  const link = (g, x1, y1, x2, y2) => g.append(s('line', { x1, y1, x2, y2, style: 'stroke:var(--fg-2);stroke-width:4;stroke-linecap:round' }));
  const lbl = (g, x, y, t, anchorS = 'start') => { const e = s('text', { x, y: y + 8, 'text-anchor': anchorS, class: 'v-label sm', style: 'font-weight:620' }); e.textContent = t; g.append(e); return e; };
  const groups = cols.map((c, i) => {
    anchor(c.x);
    const g = s('g', { style: 'opacity:0' });
    const t = s('text', { x: c.x, y: 52, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:36px;font-weight:720' });
    t.innerHTML = c.name;
    g.append(t);
    g.append(Object.assign(s('text', { x: c.x, y: 94, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2)' }), { textContent: c.comp }));
    chipSvg(g, c.x, 146, 340, c.loc, 'var(--a1)', { h: 46, size: 23, text: 'var(--ink)' });
    D.layers.nodes.append(g);
    return g;
  });
  // cerebroside: Glc or Gal (alternates)
  const Y1 = SURF - 92, ST = 76;
  const g0 = groups[0];
  link(g0, 300, SURF - 12, 300, Y1);
  const s0 = sugarSym(g0, 'Glc', 300, Y1, 32);
  const l0 = lbl(g0, 348, Y1, 'Glc → glucocerebroside');
  // sulfatide
  const g1 = groups[1];
  link(g1, 860, SURF - 12, 860, Y1); link(g1, 880, Y1 - 22, 924, Y1 - 66);
  sugarSym(g1, 'Gal', 860, Y1, 32);
  lbl(g1, 908, Y1 + 22, 'Gal');
  g1.append(s('circle', { cx: 946, cy: Y1 - 86, r: 32, style: `fill:color-mix(in oklab, ${C_P} 30%, var(--bg));stroke:${C_P};stroke-width:3` }));
  const so = s('text', { x: 946, y: Y1 - 78, 'text-anchor': 'middle', class: 'v-label', style: `font-size:22px;font-weight:750;fill:${C_P}` }); setRich(so, 'SO_{3}^{–}');
  g1.append(so);
  lbl(g1, 990, Y1 - 86, 'sulfate');
  // GM1: Cer–Glc–Gal(–NeuAc)–GalNAc–Gal
  const g2 = groups[2];
  link(g2, 1400, SURF - 12, 1400, Y1 - 3 * ST); link(g2, 1400, Y1 - ST, 1480, Y1 - ST);
  sugarSym(g2, 'Glc', 1400, Y1, 30); lbl(g2, 1352, Y1, 'Glc', 'end');
  sugarSym(g2, 'Gal', 1400, Y1 - ST, 30); lbl(g2, 1352, Y1 - ST, 'Gal', 'end');
  sugarSym(g2, 'GalNAc', 1400, Y1 - 2 * ST, 28); lbl(g2, 1352, Y1 - 2 * ST, 'GalNAc', 'end');
  sugarSym(g2, 'Gal', 1400, Y1 - 3 * ST, 30); lbl(g2, 1352, Y1 - 3 * ST, 'Gal', 'end');
  sugarSym(g2, 'NeuAc', 1494, Y1 - ST, 28); lbl(g2, 1538, Y1 - ST, 'NeuAc (NANA)');
  g2.setAttribute('data-tip', JSON.stringify({ title: 'Ganglioside GM1', body: 'Ceramide–Glc–Gal(–NeuAc)–GalNAc–Gal. NANA = N-acetylneuraminic acid; gangliosides carry one or more.', src: SRC(20) }));
  const cerL = s('g');
  cerL.append(s('path', { d: `M${352},${SURF - 14} L${364},${SURF - 14} L${364},${SURF + 100} L${352},${SURF + 100}`, style: `fill:none;stroke:${C_SPH};stroke-width:3;stroke-linecap:round` }));
  cerL.append(Object.assign(s('text', { x: 378, y: SURF + 52, class: 'v-label sm', style: `fill:${C_SPH};font-weight:700` }), { textContent: 'Ceramide' }));
  cerL.setAttribute('data-tip', JSON.stringify({ title: 'Ceramide', body: 'Sphingosine + 1 fatty acid. Every glycolipid here is built on ceramide; none contains phosphate.', src: SRCS('16, 20') }));
  D.layers.labels.append(cerL);
  const FN = [['Myelin sheath', 'Component of the myelin sheath of nerves'], ['White matter', 'Component of the white matter of the brain'], ['Blood groups', 'Determinants of blood group (ABO)'], ['Cell membrane', 'Component of the cell membrane']];
  const fns = FN.map(([t, b], i) => chipSvg(D.layers.labels, 214 + i * 428, 686, 360, t, 'var(--a1)', { h: 52, size: 25, tip: { kicker: 'Glycolipid functions', title: t, body: b, src: SRC(21) } }));
  fns.forEach((c) => (c.style.opacity = 0));
  let gal = false;
  const swapT = setInterval(() => {
    gal = !gal;
    s0.style.fill = gal ? SNFG.Gal : SNFG.Glc;
    l0.textContent = gal ? 'Gal → galactocerebroside' : 'Glc → glucocerebroside';
  }, 2600);
  return {
    step(n) { groups.forEach((g, i) => show(g, n >= i + 1)); show(fns, n >= 4, { stagger: 0.06 }); },
    destroy: () => { clearInterval(swapT); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* 19 · Lipoprotein particle (procedural, relative sizes)              */
/* ------------------------------------------------------------------ */
const LIPO = [
  { v: 'chylo', name: 'Chylomicron', tag: 'Dietary', R: 5.4, tg: 0.9, apo: 2, note: 'Largest · least dense · TG-rich', col: 'var(--atp)' },
  { v: 'vldl', name: 'VLDL', tag: 'Liver', R: 4.1, tg: 0.72, apo: 3, note: 'Made by the liver · TG-rich', col: 'var(--prot)' },
  { v: 'ldl', name: 'LDL', tag: 'Bad', R: 3.0, tg: 0.12, apo: 1, note: 'Cholesterol-ester-rich core', col: 'var(--inh)' },
  { v: 'hdl', name: 'HDL', tag: 'Good', R: 2.2, tg: 0.15, apo: 4, note: 'Smallest · densest · protein-rich', col: 'var(--act)' },
];
function lipoParticle(cfg, seed) {
  const R = cfg.R, rand = rng(seed);
  const g = new THREE.Group();
  const cut = (v) => v.x > 0.02 && v.z > 0.02;
  const N = Math.round((4 * Math.PI * R * R) / 0.26);
  const heads = [], fcs = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), phi = i * 2.399963;
    const v = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
    if (cut(v)) continue;
    (i % 9 === 4 ? fcs : heads).push(v);
  }
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), S1 = new THREE.Vector3(1, 1, 1);
  const inst = (geo, mat, list, fn) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((v, i) => { fn(v); m.setMatrixAt(i, Mx); }); g.add(m); };
  inst(new THREE.SphereGeometry(0.21, 14, 10), glossy(HX.head, { roughness: 0.3 }), heads, (v) => Mx.makeTranslation(v.x * R, v.y * R, v.z * R));
  inst(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 6), glossy(HX.tail, { roughness: 0.5 }), heads, (v) => { Q.setFromUnitVectors(UP, v); Mx.compose(v.clone().multiplyScalar(R - 0.5), Q, S1); });
  inst(new THREE.CapsuleGeometry(0.11, 0.5, 3, 8), glossy(HX.fc, { emissive: 0x3a1a00 }), fcs, (v) => { Q.setFromUnitVectors(UP, v); Mx.compose(v.clone().multiplyScalar(R - 0.32), Q, S1); });
  const K = Math.max(16, Math.round(Math.pow(R - 0.8, 3) * 6.5));
  const tgP = [], ceP = [];
  while (tgP.length + ceP.length < K) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (v.lengthSq() > 1) continue;
    v.multiplyScalar(R - 0.85);
    (rand() < cfg.tg ? tgP : ceP).push(v);
  }
  inst(new THREE.SphereGeometry(0.27, 14, 10), glossy(HX.tg), tgP, (v) => Mx.makeTranslation(v.x, v.y, v.z));
  inst(new THREE.SphereGeometry(0.22, 14, 10), glossy(HX.ce), ceP, (v) => Mx.makeTranslation(v.x, v.y, v.z));
  const DIRS = [[-0.25, 0.5, 0.83], [-0.55, -0.45, 0.7], [-0.85, 0.35, 0.35], [-0.3, 0.9, 0.2], [-0.7, -0.6, -0.2]];
  const apoMat = glossy(HX.apo, { roughness: 0.35 });
  for (let a = 0; a < cfg.apo; a++) {
    const d = new THREE.Vector3(...DIRS[a]).normalize();
    const t0 = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(d).normalize();
    const arc = (cfg.apo === 1 ? 4.4 : 2.4) / R;
    const turns = Math.round((arc * R) / 0.5);
    const pts = [];
    for (let k = 0; k <= 200; k++) {
      const u = k / 200, ph = (u - 0.5) * arc;
      const base = d.clone().multiplyScalar(Math.cos(ph)).add(t0.clone().multiplyScalar(Math.sin(ph)));
      const tan = t0.clone().multiplyScalar(Math.cos(ph)).sub(d.clone().multiplyScalar(Math.sin(ph)));
      const bin = tan.clone().cross(base).normalize();
      const w = u * turns * 2 * Math.PI;
      pts.push(base.clone().multiplyScalar(R + 0.3).add(base.clone().multiplyScalar(Math.cos(w) * 0.18)).add(bin.multiplyScalar(Math.sin(w) * 0.18)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 500, 0.14, 8, false), apoMat));
  }
  return g;
}
function lipoproteinViz(el) {
  const host = h('div', { style: 'position:absolute;left:0;right:0;top:0;bottom:96px' });
  el.append(host);
  const kit = createScene(host, { cam: [-2.6, 4.2, 30], target: [-2.6, 0.4, 0], fov: 32, autoRotate: 0 });
  const spin = new THREE.Group();
  kit.root.add(spin);
  const cache = new Map();
  let cur = null;
  const tagEl = h('div', { style: 'font:720 46px var(--font);letter-spacing:-.02em' });
  const tagSub = h('div', { style: 'font-size:28px;color:var(--fg-2);margin-top:6px' });
  el.append(h('div', { style: 'position:absolute;left:0;top:0;pointer-events:none' }, [tagEl, tagSub]));
  const sw = (hex, t, d) => h('div', { style: 'display:flex;align-items:center;gap:12px;font-size:25px;color:var(--fg)' }, [h('i', { style: `width:20px;height:20px;border-radius:50%;background:#${hex.toString(16).padStart(6, '0')};display:inline-block;flex:none` }), h('span', { html: `${t}<span style="color:var(--fg-3)"> · ${d}</span>` })]);
  const legend = h('div', { style: 'position:absolute;left:0;bottom:118px;display:grid;gap:10px;pointer-events:none' }, [
    h('div', { style: 'font-size:22px;letter-spacing:.14em;font-weight:650;color:var(--ink);text-transform:uppercase', text: 'Shell' }),
    sw(HX.head, 'Phospholipid', 'monolayer'), sw(HX.fc, 'Free cholesterol', 'in shell'), sw(HX.apo, 'Apoprotein', 'surface'),
    h('div', { style: 'font-size:22px;letter-spacing:.14em;font-weight:650;color:var(--ink);text-transform:uppercase;margin-top:8px', text: 'Core' }),
    sw(HX.tg, 'Triglyceride', 'core'), sw(HX.ce, 'Cholesterol ester', 'core'),
  ]);
  el.append(legend);
  tip(legend, { title: 'Lipoprotein structure', body: 'Hydrophobic <b>core</b> of triglyceride + cholesterol ester inside an amphipathic <b>shell</b> of phospholipid, free cholesterol and apoproteins.', src: SRC(23) });
  function select(v) {
    const i = LIPO.findIndex((x) => x.v === v);
    const cfg = LIPO[i];
    if (!cache.has(v)) cache.set(v, lipoParticle(cfg, 7 + i));
    const next = cache.get(v);
    if (cur === next) return;
    const old = cur;
    if (old) gsap.to(old.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => spin.remove(old) });
    next.scale.setScalar(0.001);
    spin.add(next);
    gsap.to(next.scale, { x: 1, y: 1, z: 1, duration: 0.8, delay: old ? 0.25 : 0, ease: 'back.out(1.4)' });
    cur = next;
    tagEl.innerHTML = `${cfg.name} <span class="chip" style="font-size:26px;vertical-align:middle;color:${cfg.col};border-color:color-mix(in oklab, ${cfg.col} 45%, transparent)">${cfg.tag}</span>`;
    tagSub.textContent = cfg.note;
    sg.set(v, false);
  }
  kit.onFrame((dt, t) => { spin.rotation.y = -0.42 + 0.3 * Math.sin(t * 0.35); spin.rotation.x = 0.12 * Math.sin(t * 0.27); });
  const sg = seg({ options: LIPO.map((x) => ({ v: x.v, t: x.name })), value: 'chylo', onChange: select });
  const bar = ctrlBar(el, [sg, h('span', { style: 'font-size:22px;color:var(--fg-3)', text: 'size ↓ · density ↑' })], { left: 0, right: 0, bottom: 0 });
  bar.style.justifyContent = 'center';
  select('chylo');
  return kitController(kit, {
    step: (n) => select(LIPO[Math.min(n, 3)].v),
    destroy: () => cache.forEach((g) => g.traverse((o) => { o.geometry?.dispose?.(); })),
  });
}

/* ------------------------------------------------------------------ */
/* 20 · Lipid profile checker (lecture reference ranges)               */
/* ------------------------------------------------------------------ */
function profileViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 540px';
  el.style.gap = '44px';
  const AN = [
    { k: 'tl', sh: 'Total lipids', name: 'Total plasma lipids', lo: 400, hi: 600, min: 200, max: 1000, step: 10 },
    { k: 'tc', sh: 'TC', name: 'Total cholesterol', lo: 140, hi: 200, min: 60, max: 320, step: 5 },
    { k: 'hdl', sh: 'HDL', name: 'HDL cholesterol', lo: 40, hi: 60, min: 10, max: 100, step: 1, good: true },
    { k: 'ldl', sh: 'LDL', name: 'LDL cholesterol', lo: 80, hi: 130, min: 20, max: 260, step: 5, bad: true },
    { k: 'tg', sh: 'TG', name: 'Triglycerides', lo: 50, hi: 150, min: 20, max: 500, step: 5 },
  ];
  const PRE = { normal: { tl: 500, tc: 170, hdl: 52, ldl: 100, tg: 110 }, dys: { tl: 760, tc: 262, hdl: 32, ldl: 182, tg: 240 } };
  const val = { ...PRE.normal };
  const leftEl = h('div', { style: 'display:grid;align-content:space-between;padding:4px 0' });
  const rows = AN.map((a) => {
    const pct = (v) => ((v - a.min) / (a.max - a.min)) * 100;
    const input = h('input.range', { type: 'range', min: a.min, max: a.max, step: a.step, value: val[a.k], style: 'position:absolute;inset:0;width:100%;height:100%;margin:0;--a1:transparent;--surface-3:transparent' });
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); });
    const track = h('div', { style: 'position:relative;height:48px' }, [
      h('div', { style: 'position:absolute;left:0;right:0;top:20px;height:8px;border-radius:99px;background:var(--surface-3)' }),
      h('div', { style: `position:absolute;left:${pct(a.lo)}%;width:${pct(a.hi) - pct(a.lo)}%;top:12px;height:24px;border-radius:8px;background:color-mix(in oklab, var(--act) 28%, transparent);border:2px solid color-mix(in oklab, var(--act) 60%, transparent)` }),
      input,
    ]);
    const v = h('div', { style: 'font:650 36px var(--mono);text-align:right;font-variant-numeric:tabular-nums' });
    const flag = h('span.chip', { style: 'font-size:24px;justify-self:start' });
    const tag = a.good ? '<span class="chip act" style="font-size:20px;margin-left:10px">Good</span>' : a.bad ? '<span class="chip inh" style="font-size:20px;margin-left:10px">Bad</span>' : '';
    const row = h('div', { style: 'display:grid;grid-template-columns:330px 1fr 120px 170px;gap:22px;align-items:center' }, [
      h('div', {}, [h('div', { style: 'font-size:29px;font-weight:620', html: a.name + tag }), h('div', { style: 'font-size:22px;color:var(--fg-3);margin-top:4px', text: `${a.lo}–${a.hi} mg/dL` })]),
      track, v, flag,
    ]);
    leftEl.append(row);
    input.addEventListener('input', () => { val[a.k] = +input.value; update(); });
    return { a, input, v, flag };
  });
  const verdict = h('div', { style: 'font:740 54px var(--font);letter-spacing:-.03em;line-height:1.05' });
  const why = h('div', { style: 'font-size:27px;color:var(--fg-2);min-height:72px;margin-top:10px' });
  const CON = ['Atherosclerosis', 'Hypertension', 'Coronary artery disease', 'Myocardial infarction'];
  const cons = CON.map((c) => h('div', { style: 'padding:14px 18px;border-radius:20px;border:1px solid var(--line);background:var(--surface);font-size:25px;font-weight:600;transition:all .5s', text: c }));
  const pre = seg({ options: [{ v: 'normal', t: 'Normal' }, { v: 'dys', t: 'Dyslipidemic' }], value: 'normal', onChange: (k) => { Object.assign(val, PRE[k]); rows.forEach((r) => (r.input.value = val[r.a.k])); update(); } });
  const right = h('div.card', { style: 'gap:16px;justify-content:flex-start;padding:36px 38px' }, [
    pre.el,
    h('div.k', { style: 'margin-top:10px', text: 'Lecture definition' }),
    verdict, why,
    h('div', { style: 'font-size:22px;color:var(--fg-3);letter-spacing:.12em;text-transform:uppercase;font-weight:650;margin-top:6px', text: 'Leads to' }),
    h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, cons),
  ]);
  tip(verdict, { title: 'Dyslipidemia', body: 'Any change in the lipid profile: <b>decrease in HDL</b> and <b>increase in all others</b>. Values here use the lecture’s reference ranges (slide 24), not guideline cut-offs.', src: SRC(24) });
  el.append(leftEl, right);
  function update() {
    const bad = [];
    rows.forEach(({ a, input, v, flag }) => {
      const x = val[a.k];
      input.style.setProperty('--p', `${((x - a.min) / (a.max - a.min)) * 100}%`);
      v.textContent = x;
      let t, cls;
      if (x < a.lo) { t = a.good ? 'Low ↓' : 'Below range'; cls = a.good ? 'inh' : ''; if (a.good) bad.push(`↓ ${a.sh}`); }
      else if (x > a.hi) { t = a.good ? 'Above range' : 'High ↑'; cls = a.good ? 'act' : 'inh'; if (!a.good) bad.push(`↑ ${a.sh}`); }
      else { t = 'Normal'; cls = 'act'; }
      flag.className = `chip ${cls}`;
      flag.textContent = t;
    });
    const dys = bad.length > 0;
    verdict.textContent = dys ? 'Dyslipidemia' : 'Normal profile';
    verdict.style.color = dys ? 'var(--inh)' : 'var(--act)';
    why.textContent = dys ? bad.join(' · ') : 'All values within the lecture ranges.';
    cons.forEach((c) => { c.style.opacity = dys ? 1 : 0.35; c.style.borderColor = dys ? 'color-mix(in oklab, var(--inh) 50%, transparent)' : 'var(--line)'; c.style.color = dys ? 'var(--inh)' : 'var(--fg-2)'; c.style.background = dys ? 'color-mix(in oklab, var(--inh) 10%, transparent)' : 'var(--surface)'; });
  }
  update();
  return { step: (n) => pre.set(n >= 1 ? 'dys' : 'normal', true) };
}

/* ------------------------------------------------------------------ */
/* 21 · Cholesterol in 3D                                              */
/* ------------------------------------------------------------------ */
async function cholesterolViz(el) {
  const kit = createScene(el, { cam: [0, 0, 40], autoRotate: 0 });
  const data = await loadMol('cholesterol');
  const mol = buildMolecule(data, { hideH: 'nonpolar' });
  const P = mol.userData.pos;
  const X = new THREE.Vector3(1, 0, 0);
  const qa = new THREE.Quaternion().setFromUnitVectors(P[CHOL.O].clone().sub(P[CHOL.C25]).normalize().negate(), X);
  const nrm = new THREE.Vector3();
  [CHOL.rings.A, CHOL.rings.B, CHOL.rings.C].forEach((r) => { for (let i = 0; i < r.length; i++) nrm.add(P[r[i]].clone().sub(P[r[0]]).cross(P[r[(i + 1) % r.length]].clone().sub(P[r[0]]))); });
  nrm.normalize().applyQuaternion(qa);
  // roll about X so the ring-plane normal points at the camera (+Z)
  mol.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(X, Math.atan2(nrm.y, nrm.z)).multiply(qa));
  const wob = new THREE.Group(); wob.add(mol); kit.root.add(wob);
  mol.updateMatrixWorld(true);
  // ring plates
  const plates = {};
  Object.entries(CHOL.rings).forEach(([k, r]) => {
    const c = r.reduce((a, i) => a.add(P[i]), new THREE.Vector3()).multiplyScalar(1 / r.length);
    const pos = [];
    r.forEach((i, j) => { const a = P[i], b = P[r[(j + 1) % r.length]]; pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z); });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k === 'D' ? HX.orange : HX.gold, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    mol.add(m);
    plates[k] = { m, c };
  });
  const haloAt = (i, r, col) => { const m = halo(r, col); m.position.copy(P[i]); mol.add(m); return m; };
  const hOH = haloAt(CHOL.O, 0.95, HX.blue);
  const hDB = [haloAt(CHOL.C5, 0.85, HX.purple), haloAt(CHOL.C6, 0.85, HX.purple)];
  const hSide = CHOL.side.map((i) => haloAt(i, 0.72, HX.green));
  const hMe = [haloAt(CHOL.C18, 0.72, HX.orange), haloAt(CHOL.C19, 0.72, HX.orange)];
  kit.fit(wob, 0.86);
  kit.camera.position.sub(kit.controls.target).multiplyScalar(0.86).add(kit.controls.target);
  const inv = mol.quaternion.clone().invert();
  const toW = (p) => p.clone().applyQuaternion(mol.quaternion);
  const cen = P.reduce((a, p, i) => (data.atoms[i][0] === 'C' ? a.add(toW(p)) : a), new THREE.Vector3()).multiplyScalar(1 / 27);
  /** Label pushed radially away from the molecule centre (screen plane), plus an optional nudge. */
  const lab = (html, p, k, cls = 'sm', nudge = [0, 0]) => {
    const w = toW(p), d = new THREE.Vector3(w.x - cen.x, w.y - cen.y, 0).normalize();
    const pos = w.clone().add(d.multiplyScalar(k)).add(new THREE.Vector3(nudge[0], nudge[1], 1.2)).applyQuaternion(inv);
    const l = kit.label(html, [pos.x, pos.y, pos.z], { cls, parent: mol });
    fadeLbl(l, false);
    return l;
  };
  const ringL = Object.entries(plates).map(([k, p]) => lab(k, p.c, 0, 'acc'));
  const lOH = lab('3-OH', P[CHOL.O], 0, 'sm', [0.6, -2.0]);
  lOH.element.style.color = 'var(--elec)';
  const mid56 = P[CHOL.C5].clone().add(P[CHOL.C6]).multiplyScalar(0.5);
  const lDB = lab('C5 = C6', mid56, 3.2);
  lDB.element.style.color = 'var(--fadh)';
  const lSide = lab('C17 side chain · 8 C', P[23], 0, 'sm', [0, 2.8]);
  lSide.element.style.color = 'var(--act)';
  const lMe = [lab('C18', P[CHOL.C18], 1.9, 'sm plain'), lab('C19', P[CHOL.C19], 2.3, 'sm plain')];
  const big = h('div', { style: 'font:760 120px var(--font);letter-spacing:-.05em;line-height:.9;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent', text: '0' });
  const bigWrap = h('div', { style: 'position:absolute;left:0;bottom:0;display:flex;align-items:baseline;gap:16px;opacity:0;transition:opacity .5s;pointer-events:none' }, [big, h('div', { style: 'font-size:30px;color:var(--fg-2)', text: 'carbon atoms' })]);
  el.append(bigWrap);
  const nucleus = h('div', { style: 'position:absolute;left:0;top:0;font-size:26px;color:var(--fg-2);opacity:0;transition:opacity .5s;pointer-events:none', html: '<span style="color:var(--ink);font-weight:650">Cyclopentano&shy;perhydrophenanthrene</span> nucleus' });
  el.append(nucleus);
  kit.onFrame((dt, t) => { wob.rotation.y = 0.32 * Math.sin(t * 0.45); wob.rotation.x = 0.12 * Math.sin(t * 0.3); });
  let shownBig = false;
  return kitController(kit, {
    step(n) {
      Object.values(plates).forEach((p) => fadeMat(p.m, n >= 1 ? 0.3 : 0));
      ringL.forEach((l) => fadeLbl(l, n >= 1));
      nucleus.style.opacity = n >= 1 ? 1 : 0;
      fadeMat(hOH, n >= 2 ? 0.35 : 0); fadeLbl(lOH, n >= 2);
      hDB.forEach((m) => fadeMat(m, n >= 3 ? 0.4 : 0)); fadeLbl(lDB, n >= 3);
      hSide.forEach((m) => fadeMat(m, n >= 4 ? 0.3 : 0)); fadeLbl(lSide, n >= 4);
      hMe.forEach((m) => fadeMat(m, n >= 4 ? 0.35 : 0)); lMe.forEach((l) => fadeLbl(l, n >= 4));
      bigWrap.style.opacity = n >= 4 ? 1 : 0;
      if (n >= 4 && !shownBig) { countTo(big, 27, { duration: 1.2 }); shownBig = true; }
      if (n < 4) { shownBig = false; big.textContent = '0'; }
    },
  });
}

/* ------------------------------------------------------------------ */
/* 23 · Apply it: preterm infant                                       */
/* ------------------------------------------------------------------ */
function caseViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '600px 1fr';
  el.style.gap = '48px';
  const card = h('div.case', {}, [
    h('div.tag', { html: '● Apply it' }),
    h('p', { html: 'A baby born at <b>29 weeks</b> develops <b>fast, laboured breathing</b> within hours of birth.' }),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:14px;margin-top:34px' }, [
      h('span.chip.inh', { style: 'font-size:28px', text: 'Preterm' }),
      h('span.chip.inh', { style: 'font-size:28px', text: 'Alveoli collapse' }),
    ]),
    h('p', { style: 'font-size:24px;color:var(--fg-3);margin-top:34px', text: 'Practice scenario built from slide 18 — not a lecture case.' }),
  ]);
  const qs = [
    ['Which lipid is lacking?', '<b>DPPC</b> (dipalmitoyl lecithin) — the major lung surfactant.'],
    ['Which cells make it?', '<b>Type II pneumocytes</b>, into the fluid lining the alveoli.'],
    ['Why do the alveoli collapse?', 'Without surfactant, <b>surface tension</b> stays high at end-expiration.'],
    ['Why does DPPC suit the job?', 'Two <b>saturated palmitate</b> chains pack tightly at the air–water surface.'],
    ['How could it be prevented?', '<b>Glucocorticoids to the mother</b> shortly before delivery.'],
  ];
  const list = h('div', { style: 'display:grid;gap:16px;align-content:center' });
  const ans = qs.map(([q, a], i) => {
    const A = h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:8px;line-height:1.35', html: a });
    const row = h('div', { style: 'padding:16px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line)' }, [h('div', { style: 'font-size:30px;font-weight:650;letter-spacing:-.01em', html: q }), A]);
    if (i === 3) tip(row, { title: 'Structure → function', body: 'Saturated chains are straight and pack closely (slide 10). DPPC carries two palmitic acids (C16:0), so it forms a tight film that lowers surface tension.', src: `${SRCS('10, 18')} · Lippincott` });
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
    'Lippincott Illustrated Reviews: Biochemistry, 9th ed, Ch 15–18 (pp 191–256)',
    'Lecture slides: Lipid chemistry (L.5), Dr Vijaya Marakala, NUST',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.5',
      title: 'Lipid Chemistry',
      subtitle: 'Fatty acids, membranes and cholesterol.',
      meta: ['Dr. Vijaya Marakala', 'L.5.1 – L.5.4', '4 learning outcomes'],
      notes: [
        'Welcome. Lipids build our membranes, store our energy and make our hormones.',
        'The model: a patch of phospholipid bilayer — blue polar heads face water, gold fatty-acid tails face each other. A quarter is cut away: the glowing pink rods in the cut face are real cholesterol molecules (PubChem 3D, space-filling) tucked between the lipids, OH up at the head-group level.',
        'Roadmap: what a lipid is → fatty acids and how to name them → cis/trans and essential fatty acids → eicosanoids → triglycerides → phospholipids and surfactant → glycolipids → lipoproteins and the lipid profile → cholesterol.',
      ],
      visual: bilayerHero,
    },
    {
      layout: 'cards',
      class: 'cards-2x2',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      cards: [
        { big: '01', k: 'L.5.1', title: 'Lipids, fatty acids & EFAs', tip: { title: 'L.5.1', body: 'Define lipids, fatty acids, and essential fatty acids, and explain their biomedical importance in human health and disease.' } },
        { big: '02', k: 'L.5.2', title: 'Functions of lipids', tip: { title: 'L.5.2', body: 'List physiological functions of lipids.' } },
        { big: '03', k: 'L.5.3', title: 'ω-3 vs ω-6', tip: { title: 'L.5.3', body: 'Differentiate the roles of dietary omega-3 and omega-6 fatty acids in inflammation and cardiovascular health.' } },
        { big: '04', k: 'L.5.4', title: 'Structure → clinic', tip: { title: 'L.5.4', body: 'Apply knowledge of lipid structural properties to analyze clinical conditions related to lipid metabolism.' } },
      ],
      src: SRC(2),
      notes: 'Hover a card for the exact SLO wording. Every later slide maps to one of these four.',
    },
    {
      eyebrow: 'Definition',
      title: 'Defined by <em>solubility</em>',
      bullets: [
        { t: 'Insoluble in <b>water</b>', tip: { title: 'Lipids', body: 'Organic substances <b>insoluble in water</b> but soluble in organic solvents.', src: SRC(3) } },
        { t: 'Soluble in <b>organic solvents</b>', tip: { title: 'Organic solvents', body: 'Chloroform, ether and benzene.', src: SRC(3) } },
        { t: 'Many structures, one property', tip: 'Lipids share solubility, not one common structure: fatty acids, triglycerides, phospholipids, glycolipids, lipoproteins, cholesterol and cholesterol esters.' },
      ],
      steps: 1,
      src: SRC(3),
      notes: [
        'Definition (slide 3): organic substances insoluble in water but soluble in organic solvents like chloroform, ether and benzene.',
        'Press → to add the lipid: in water it stays as a separate layer; in the organic solvent it dissolves. Switch the solvent with the buttons; “Again” replays.',
        'Key idea: the class is defined by a physical property, so it contains very different structures.',
      ],
      visual: solubilityViz,
    },
    {
      layout: 'full',
      eyebrow: 'The lipid family',
      title: 'Seven types, <em>three groups</em>',
      bullets: [{ t: 'Fatty acids build most' }, { t: 'Lipoproteins carry them' }],
      steps: 2,
      src: 'Lecture slide 3 · colour groups as on the slide; captions descriptive',
      notes: [
        'Slide 3 lists seven lipid types in three colour groups (green, magenta, navy). Hover any box for a one-line definition.',
        'Build 1: the gold chains show how many fatty acids each type contains — TG 3, phospholipids 2 (sphingomyelin 1), glycolipids 1, cholesterol esters 1, cholesterol none.',
        'Build 2: lipoproteins transport the others (TG, cholesterol esters, cholesterol) through the blood.',
        'The slide gives no headings. Textbooks call these groups simple, compound and derived lipids — mention only as extra context.',
      ],
      visual: familyViz,
    },
    {
      eyebrow: 'Fatty acids',
      title: 'Head and <em>tail</em>',
      bullets: [
        { t: 'Carboxylic acid + <b>hydrocarbon chain</b>', tip: { title: 'Fatty acids', body: 'Carboxylic acids with a hydrocarbon side chain (R–COOH). At body pH the head is ionised: R–COO⁻.', src: SRC(4) } },
        { t: 'COO⁻ head: <b>hydrophilic</b>', tip: { title: 'Polar head', body: 'The carboxylate (COO⁻) end mixes with water.', src: SRC(4) } },
        { t: 'Chain: <b>hydrophobic</b>', tip: { title: 'Non-polar tail', body: 'The hydrocarbon chain avoids water. One molecule with both properties is called <b>amphipathic</b> (textbook term).', src: SRC(4) } },
        { t: 'Mostly <b>esterified</b>', tip: { title: 'Fatty acid esters', list: ['3 FA + glycerol = triglyceride', 'FA + cholesterol = cholesterol ester'], src: SRCS('4, 25') } },
      ],
      steps: 2,
      src: 'Lecture slide 4 · palmitic acid: real PubChem 3D structure',
      notes: [
        'A fatty acid is a carboxylic acid with a hydrocarbon side chain. The model is palmitic acid, C16:0, real 3D coordinates.',
        'Build 1: the carboxyl head (blue glow) is polar — at physiological pH it is COO⁻ — and faces water.',
        'Build 2: the long hydrocarbon tail (gold) is non-polar. Both in one molecule = amphipathic; this is why fatty acids line up at water surfaces and in membranes.',
        'Most fatty acids in the body are esterified: 3 FA + glycerol = triglyceride; FA + cholesterol = cholesterol ester.',
      ],
      visual: palmiticViz,
    },
    {
      layout: 'full',
      eyebrow: 'Classification',
      title: 'Three ways to <em>sort</em>',
      bullets: [{ t: 'Length · parity · saturation' }],
      steps: 3,
      src: 'Lecture slides 5–6, 8 · double bonds drawn at their Δ positions',
      notes: [
        'Each row is a fatty acid from the slides drawn bead-by-bead from C1 (the carboxyl carbon, red ring).',
        'Build 1 — chain length: short 2–4, medium 6–12, long 14–20, very long >20 carbons. Read where each chain ends.',
        'Build 2 — even vs odd: propionic (C3) is the odd-chain example; the rest are even.',
        'Build 3 — saturated (no C=C) vs unsaturated (with C=C). Milk: butyric C4:0, capric C10:0. Palmitic C16:0: structural lipids and TG. Linoleic and linolenic: essential. Arachidonic: precursor of prostaglandins.',
      ],
      visual: classifyViz,
    },
    {
      layout: 'full',
      eyebrow: 'Nomenclature · interactive',
      title: 'Count from <em>either end</em>',
      bullets: [{ t: 'Δ: from COOH' }, { t: 'ω: from CH₃' }],
      steps: 5,
      src: 'Lecture slides 7–9 · ω = number of carbons − highest Δ',
      notes: [
        'Start: palmitic acid. C1 = carboxyl carbon; C2 = α, C3 = β; the terminal methyl carbon = ω (C16 here).',
        'Build 1: oleic acid, 18:1 Δ⁹ — the double bond starts at C9 counted from COOH (slide calls this the “C” system).',
        'Build 2: same molecule, ω system — count from the methyl end: first double-bond carbon is 9 → ω-9.',
        'Builds 3–5: linoleic 18:2 Δ9,12 = ω-6; linolenic 18:3 Δ9,12,15 = ω-3; arachidonic 20:4 Δ5,8,11,14 = ω-6.',
        'Shortcut: ω = n − last Δ. Click any bond to add a double bond; use the slider to change chain length.',
      ],
      visual: builderViz,
    },
    {
      layout: 'full',
      eyebrow: 'PUFA · ω families',
      title: 'Line them up at the <em>methyl end</em>',
      bullets: [{ t: 'Same ω → same family' }],
      steps: 2,
      src: 'Lecture slide 9',
      notes: [
        'Start: the three PUFAs aligned at the carboxyl end, Δ numbers shown. Linoleic and linolenic share Δ9 and Δ12; arachidonic looks different.',
        'Build 1: slide them to align at the methyl end. Linoleic and arachidonic now share the first double bond at ω-6 — same family. Linolenic is ω-3.',
        'Build 2: only linoleic and linolenic are bracketed as essential fatty acids. Arachidonic acid (ω-6) is the precursor of prostaglandins.',
      ],
      visual: pufaViz,
    },
    {
      layout: 'full',
      eyebrow: 'Geometry of the double bond',
      title: 'Cis <em>kinks</em>, trans doesn’t',
      bullets: [{ t: 'Cis: same side → bend' }, { t: 'Trans: opposite → straight' }],
      src: 'Lecture slide 10 · idealised extended conformations from standard bond geometry (not PubChem conformers)',
      notes: [
        'Three C18 acids built from standard bond lengths and angles. Orange glow = the C=C carbons; cyan = their hydrogens.',
        'Saturated (stearic 18:0): a straight zig-zag.',
        'Cis (oleic): the two H atoms are on the same side, so the chain bends at Δ9.',
        'Trans (elaidic): H atoms on opposite sides — the chain stays straight, so it behaves like a saturated fatty acid.',
      ],
      visual: cisTransViz,
    },
    {
      eyebrow: 'Packing',
      title: 'Shape decides <em>state</em>',
      bullets: [
        { t: 'Straight chains <b>pack tightly</b>', tip: { title: 'Saturated fatty acids', body: 'Straight chains pack closely side by side (slide 10 panel c). Fats are solid.', src: SRCS('10, 13') } },
        { t: 'Cis kinks → <b>fluidity</b>', tip: { title: 'Cis fatty acids', body: 'The bend stops close packing and maintains the fluidity of the membrane. Oils are liquid.', src: SRCS('10, 13') } },
        { t: 'Trans behave like <b>saturated</b>', tip: 'Trans chains are straight, so they pack like saturated fatty acids.' },
        { t: 'Trans fats: <b>↑ LDL, ↓ HDL</b>', tip: { title: 'Clinical', body: 'Trans fatty acids increase LDL and decrease HDL.', src: SRC(10) } },
      ],
      steps: 3,
      focus: true,
      src: 'Lecture slides 10, 13 · schematic packing (chains not to scale)',
      notes: [
        'Start: all saturated — straight chains pack tightly → solid (fat).',
        'Build 1: half the chains carry a cis double bond — kinks push neighbours apart.',
        'Build 2: all cis — loose, mobile packing → liquid (oil) and a fluid membrane.',
        'Build 3: switch the double bonds to trans — chains straighten and pack like saturated ones. Clinically trans fats raise LDL and lower HDL.',
        'Use the slider and the cis/trans switch live.',
      ],
      visual: packingViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Essential fatty acids',
      title: 'ω-3 vs <em>ω-6</em>',
      cards: [
        {
          k: 'ω-3 family', title: 'Linolenic acid', list: ['18:3 · Δ<sup>9,12,15</sup>', 'Flaxseed oil · walnut (fish oil: EPA · DHA)', '↓ Plasma TAG · ↓ thrombosis'],
          viz: (v) => omegaMini(v, 3),
          tip: { kicker: 'ω-3', title: 'Linolenic acid (C18:3, Δ9,12,15)', list: ['Sources (slide): flaxseed oil, walnut, fish oil', 'Effects: reduce plasma TAG, decrease the tendency for thrombosis'], body: 'Note: flaxseed and walnut supply α-linolenic acid itself; fish oil is rich mainly in the longer ω-3 fatty acids (EPA, DHA) — Lippincott.', src: `${SRC(11)} · Lippincott` },
        },
        {
          k: 'ω-6 family', title: 'Linoleic acid', list: ['18:2 · Δ<sup>9,12</sup>', 'Nuts · avocados · olives · soybeans', 'Sunflower & corn oil', '↓ Plasma cholesterol & LDL'],
          viz: (v) => omegaMini(v, 6),
          tip: { kicker: 'ω-6', title: 'Linoleic acid (C18:2, Δ9,12)', list: ['Sources: nuts, avocados, olives, soybeans, sunflower and corn oil', 'Effect: lowers plasma cholesterol & LDL'], body: 'Linoleic acid is the parent of arachidonic acid (ω-6), the eicosanoid precursor.', src: SRCS('11–12') },
        },
      ],
      src: 'Lecture slide 11',
      notes: [
        'The two essential fatty acids differ in where the first double bond sits from the methyl end: ω-3 (linolenic) vs ω-6 (linoleic).',
        'ω-3: flaxseed oil, walnut, fish oil → reduce plasma TAG and the tendency for thrombosis (cardioprotective).',
        'ω-6: nuts, avocados, olives, soybeans, sunflower and corn oil → lower plasma cholesterol and LDL.',
        'Inflammation link (SLO L.5.3): ω-6 linoleic → arachidonic acid → prostaglandins, thromboxanes, leukotrienes (next slides). Textbook context: ω-3 eicosanoids are less pro-thrombotic.',
        'Accuracy: fish oil’s ω-3s are mainly EPA/DHA, not linolenic acid itself.',
      ],
    },
    {
      eyebrow: 'Why “essential”?',
      title: 'We stop at <em>C9</em>',
      bullets: [
        { t: 'Linoleic & linolenic: <b>from diet</b>', tip: { title: 'Essential fatty acids', body: 'Linoleic (ω-6) and linolenic (ω-3) acids must be eaten.', src: SRCS('9, 11') } },
        { t: 'No C=C beyond C9 in humans', tip: { title: 'The desaturase limit', body: 'Humans lack the enzymes that insert double bonds beyond C9 (counting from COOH), so Δ12 and Δ15 cannot be made.', src: 'Lippincott Ch 16 (not on the slide)' } },
        { t: 'Eicosanoids · cells · retina, brain', tip: { kicker: 'EFA functions', title: 'Functions', list: ['Synthesis of eicosanoids', 'Maintenance of structural integrity of cells', 'Development of retina and brain', 'Antiatherogenic effect'], src: SRC(11) } },
        { t: 'Deficiency: <b>dry, scaly dermatitis</b>', tip: { title: 'EFA deficiency', body: 'Dry, scaly dermatitis.', src: SRC(11) } },
      ],
      steps: 2,
      src: 'Lecture slides 9, 11 · desaturase limit: Lippincott Ch 16',
      notes: [
        'Carbons numbered from COOH (C1, right). Green zone: humans can insert double bonds up to Δ9. Red zone: beyond C9, no human enzyme.',
        'Oleic acid (Δ9) can be made in the body — not essential.',
        'Build 1: linoleic needs a Δ12 bond — impossible for us → essential (ω-6).',
        'Build 2: linolenic needs Δ12 and Δ15 → essential (ω-3).',
        'EFA functions: eicosanoid synthesis, cell structural integrity, retina and brain development, antiatherogenic effect. Deficiency: dry, scaly dermatitis.',
      ],
      visual: essentialViz,
    },
    {
      layout: 'full',
      eyebrow: 'Eicosanoids',
      title: 'Arachidonic acid’s <em>messengers</em>',
      bullets: [{ t: 'PGs · TXs · LTs' }, { t: 'Dashed = slide correction', tip: { kicker: 'Accuracy note', title: 'Leukotrienes and platelets', body: 'Slide 12 lists “promotes platelet aggregation” under leukotrienes. Standard texts attribute this to thromboxane A₂.', src: `${SRC(12)} · Lippincott` } }],
      steps: 4,
      src: 'Lecture slide 12 · actions corrected per Lippincott where the slide is inaccurate (see notes)',
      notes: [
        'Dietary essential fatty acids → arachidonic acid (20 C, “eicosa”) → eicosanoids.',
        'Build 1 — prostaglandins (PGE, PGI₂, PGF₂α): vasodilation and anti-platelet action belong to PGI₂ (prostacyclin); pain sensation; uterine contraction (PGF₂α, PGE₂). The slide lists vasodilation for all PGs — PGF₂α actually constricts.',
        'Build 2 — thromboxane A₂: promotes platelet aggregation, vaso- and bronchoconstriction, smooth-muscle contraction.',
        'Build 3 — leukotrienes: bronchoconstriction and smooth-muscle contraction. The slide also lists “promotes platelet aggregation” — that is TXA₂’s action, not leukotrienes’ (dashed chip).',
        'Build 4 — the platelet balance: PGI₂ from vessel wall vs TXA₂ from platelets. Pathway enzymes (cyclooxygenase, lipoxygenase) are textbook context.',
      ],
      visual: eicosanoidViz,
    },
    {
      eyebrow: 'Triacylglycerols',
      title: 'Building a <em>fat</em>',
      bullets: [
        { t: 'Glycerol + <b>3 fatty acids</b>', tip: { title: 'Triacylglycerol', body: 'Esters of 3 fatty acids and glycerol. R′, R″, R‴ may differ.', src: SRC(13) } },
        { t: 'Joined by <b>ester bonds</b>', tip: 'Each –OH of glycerol is esterified; water leaves each time (chemical view). In cells, acyl-CoA is the donor (Lippincott).' },
        { t: 'Neutral · <b>hydrophobic</b>', tip: { title: 'Properties', body: 'Uncharged and neutral; hydrophobic. Fats are solid, oils are liquid.', src: SRC(13) } },
        { t: 'Energy store · insulation', tip: { title: 'Biomedical importance', list: ['Provision of energy', 'Insulation · thermogenesis', 'Protection of internal organs', 'Clinical: excessive lipolysis (starvation, diabetes), obesity, fatty liver'], src: SRC(14) } },
      ],
      steps: 5,
      src: 'Lecture slides 13–14 · condensation shown as the chemical view',
      notes: [
        'Builds 1–3: each fatty acid’s –OH and a glycerol –H leave as water, joining the acyl group to glycerol by an ester bond. Three fatty acids → triacylglycerol + 3 H₂O.',
        'The middle chain is drawn kinked to remind that R′, R″, R‴ can differ.',
        'The result is uncharged, neutral and hydrophobic — stored as fat. Fats are solid, oils are liquid.',
        'Build 4 — functions: provision of energy, insulation, thermogenesis, protection of internal organs.',
        'Build 5 — clinical aspects: excessive lipolysis in starvation and diabetes, obesity, fatty liver.',
      ],
      visual: tagViz,
    },
    {
      layout: 'full',
      eyebrow: 'Phospholipids',
      title: 'The <em>alcohol</em> decides',
      bullets: [{ t: 'FA + alcohol + phosphate' }],
      steps: 4,
      src: 'Lecture slides 15–16, 19',
      notes: [
        'Phospholipids = fatty acids + alcohol + phosphate (+ a nitrogenous base, NB). They are sub-classified by the alcohol.',
        'Build 1: glycerol → glycerophospholipids (2 fatty acids); sphingosine → sphingophospholipids (1 fatty acid + sphingosine’s own chain).',
        'Build 2: glycerophospholipids — PC (lecithin), PE, PS, PI, plasmalogens, cardiolipin. Sphingosine + 1 fatty acid = ceramide (amide bond — textbook).',
        'Build 3: ceramide + phosphate + choline = sphingomyelin, an important component of the myelin sheath.',
        'Build 4: phospholipid functions — membranes, blood coagulation, lung surfactant, fat digestion and absorption, choline for acetylcholine, lipoproteins.',
        'Note: PI and cardiolipin have no nitrogenous base, so “NB” is a simplification.',
      ],
      visual: backbonesViz,
    },
    {
      layout: 'full',
      eyebrow: 'Glycerophospholipids · interactive',
      title: 'Swap the <em>head group</em>',
      bullets: [{ t: 'Parent: phosphatidic acid' }],
      steps: 5,
      src: 'Lecture slides 16–17 · head groups: real PubChem 3D structures',
      notes: [
        'Phosphatidic acid = diacylglycerol + PO₄ — the parent glycerophospholipid (3D shows glycerol 3-phosphate, its backbone).',
        'Builds 1–3: + serine → phosphatidylserine; + ethanolamine → phosphatidylethanolamine; + choline → phosphatidylcholine = lecithin.',
        'Build 4: + inositol → phosphatidylinositol (named on slide 16; no nitrogenous base).',
        'Build 5: cardiolipin = 2 phosphatidic acid + one more glycerol; found in the inner mitochondrial membrane.',
      ],
      visual: headSwapViz,
    },
    {
      eyebrow: 'Lung surfactant',
      title: 'Keeping alveoli <em>open</em>',
      bullets: [
        { t: '<b>DPPC</b> = dipalmitoyl lecithin', tip: { title: 'DPPC', body: 'Glycerol + 2 palmitic acid + PO₄ + choline. Major component of lung surfactant.', src: SRC(18) } },
        { t: 'From <b>type II pneumocytes</b>', tip: { title: 'Secretion', body: 'Surfactant is secreted by type II pneumocytes into the extracellular fluid layer lining the alveoli.', src: SRC(18) } },
        { t: '↓ Surface tension → <b>no collapse</b>' },
        { t: 'Preterm deficit → <b>RDS</b>', tip: { title: 'Respiratory distress syndrome', list: ['Insufficient surfactant secretion', 'Usually seen in preterm infants', 'Fetal lung maturation can be enhanced shortly before delivery by giving glucocorticoids to the mother'], src: SRC(18) } },
      ],
      steps: 2,
      src: 'Lecture slide 18 · alveolus schematic',
      notes: [
        'DPPC (dipalmitoyl lecithin) is the major lung surfactant, secreted by type II pneumocytes into the fluid lining the alveoli.',
        'Start: with surfactant, the alveolus inflates and deflates without collapsing. Blue heads sit in the fluid, gold tails face the air.',
        'Build 1: surfactant off — surface tension (red arrows) collapses the alveolus at end-expiration: respiratory distress syndrome of preterm infants.',
        'Build 2: glucocorticoids given to the mother shortly before delivery enhance fetal lung maturation → surfactant restored.',
      ],
      visual: surfactantViz,
    },
    {
      layout: 'full',
      eyebrow: 'Glycolipids',
      title: 'Ceramide + <em>sugar</em>',
      bullets: [{ t: 'Fatty acid + sphingosine + sugar' }, { t: 'No phosphate' }],
      steps: 4,
      src: 'Lecture slides 20–21 · sugars drawn as SNFG symbols (blue = Glc, yellow = Gal / GalNAc, purple = NeuAc)',
      notes: [
        'Glycolipids = fatty acid + sphingosine (i.e. ceramide) + carbohydrate. They contain no phosphate. Sugars face the outside of the cell.',
        'Build 1: cerebrosides = ceramide + one monosaccharide (glucocerebroside or galactocerebroside); brain and myelin sheath.',
        'Build 2: sulfatides = ceramide + galactose + sulfate; brain and kidneys.',
        'Build 3: gangliosides = ceramide + oligosaccharide + one or more NANA (N-acetylneuraminic acid); ganglion cells of the CNS. GM1: Cer–Glc–Gal(–NeuAc)–GalNAc–Gal.',
        'Build 4: functions — myelin sheath, white matter of brain, blood-group determinants, cell membrane.',
      ],
      visual: glycolipidViz,
    },
    {
      eyebrow: 'Lipoproteins',
      title: 'Lipid <em>carriers</em>',
      bullets: [
        { t: 'Lipid + <b>protein</b>', tip: { title: 'Lipoproteins', body: 'Transport lipids between tissues and organs through the circulation.', src: SRC(22) } },
        { t: 'Amphipathic <b>shell</b>', tip: { title: 'Surface', body: 'Phospholipid (a monolayer), free cholesterol and apoproteins.', src: SRC(23) } },
        { t: 'Hydrophobic <b>core</b>: TG + CE', tip: { title: 'Core', body: 'Triglyceride and cholesterol ester (CE).', src: SRC(23) } },
        { t: 'Chylomicron → VLDL → LDL → HDL', tip: { title: 'Classes', list: ['Chylomicron — dietary', 'VLDL — liver', 'LDL — “bad”', 'HDL — “good”'], body: 'Particle size falls and density rises from chylomicron to HDL (Lippincott).', src: `${SRC(22)} · Lippincott Ch 18` } },
      ],
      steps: 3,
      src: 'Lecture slides 22–23 · procedural model; relative sizes and compositions schematic, not to scale',
      notes: [
        'A lipoprotein: hydrophobic core (triglyceride + cholesterol ester) inside a shell of phospholipid, free cholesterol and apoprotein. A quarter is cut away.',
        'Chylomicron (dietary): largest, TG-rich. VLDL (liver): TG-rich. LDL (“bad”): cholesterol-ester-rich core. HDL (“good”): smallest, densest, protein-rich.',
        'Press → to step through the classes, or click the buttons. Sizes are relative only — a real chylomicron is many times larger than HDL.',
      ],
      visual: lipoproteinViz,
    },
    {
      layout: 'full',
      eyebrow: 'Clinical · interactive',
      title: 'Read the <em>lipid profile</em>',
      bullets: [{ t: 'Lecture reference ranges' }],
      steps: 1,
      src: 'Lecture slide 24 · ranges as taught in the lecture, not guideline cut-offs',
      notes: [
        'Lecture reference ranges (mg/dL): total plasma lipids 400–600; total cholesterol 140–200; HDL 40–60 (good); LDL 80–130 (bad); TG 50–150.',
        'Dyslipidemia (lecture definition): decrease in HDL and increase in all others.',
        'Build 1 shows a dyslipidemic profile: ↑ TC, ↑ LDL, ↑ TG, ↓ HDL → atherosclerosis, hypertension, coronary artery disease, myocardial infarction.',
        'Drag any slider live. Mention that guidelines use cut-offs (e.g. LDL <100 optimal) rather than these ranges.',
      ],
      visual: profileViz,
    },
    {
      eyebrow: 'Cholesterol',
      title: 'Four rings, <em>27 carbons</em>',
      bullets: [
        { t: 'Steroid nucleus: rings <b>A–D</b>', step: 1, tip: { title: 'Cyclopentanoperhydrophenanthrene', body: 'Rings A, B, C are six-membered; ring D is five-membered.', src: SRC(26) } },
        { t: '<b>3-OH</b>: one hydroxyl', step: 2, tip: { title: 'Hydroxyl at C3', body: 'The only polar group. Esterified with a fatty acid → cholesterol ester.', src: SRCS('25–26') } },
        { t: 'Double bond <b>C5 = C6</b>', step: 3 },
        { t: '8-C side chain at <b>C17</b>', step: 4, tip: { title: 'Side chains', body: '8-carbon hydrocarbon side chain at C17 (C20–C27); methyl groups at C10 (C19) and C13 (C18). Total 27 carbons.', src: SRC(26) } },
      ],
      steps: 4,
      src: 'Lecture slides 25–26 · real PubChem 3D structure',
      notes: [
        'Real 3D cholesterol (C–H hydrogens hidden). Builds walk through slide 26.',
        'Build 1: the cyclopentanoperhydrophenanthrene nucleus — rings A, B, C (six-membered) and D (five-membered).',
        'Build 2: one hydroxyl group at C3 — the only polar group. Cholesterol + fatty acid at this OH = cholesterol ester.',
        'Build 3: the double bond between C5 and C6.',
        'Build 4: 8-carbon side chain at C17 and methyl groups at C10 and C13 — 27 carbons in all.',
      ],
      visual: cholesterolViz,
    },
    {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'Cholesterol',
      title: 'What it does, <em>where it comes from</em>',
      cards: [
        { icon: 'layers', k: 'Structure', title: 'Membranes & lipoproteins', tip: { title: 'Structural constituent', body: 'Of cell membranes and lipoproteins.', src: SRC(27) } },
        { icon: 'flask', k: 'Precursor', title: 'Steroid hormones', tip: { title: 'Steroid hormones', list: ['Progesterone', 'Glucocorticoids', 'Mineralocorticoids', 'Androgens & estrogens'], src: SRC(27) } },
        { icon: 'drop', k: 'Digestion', title: 'Bile acids & salts', tip: { title: 'Bile acids and bile salts', body: 'Formed from cholesterol.', src: SRC(27) } },
        { icon: 'sun', k: 'Synthesis', title: 'Vitamin D', tip: { title: 'Vitamin D', body: 'Made from a cholesterol derivative (7-dehydrocholesterol) in skin exposed to sunlight — Lippincott.', src: `${SRC(27)} · Lippincott` } },
        { icon: 'leaf', k: 'Diet', title: 'Animal sterol only', tip: { title: 'No cholesterol in plants’ oils', body: 'No vegetable oil contains any cholesterol. Cholesterol is the major sterol in animal tissues.', src: SRC(25) } },
        { icon: 'cycle', k: 'Source', title: 'Mostly made in the body', tip: { title: 'Endogenous synthesis', body: 'Only a little body cholesterol comes from the diet; the bulk is synthesised in the body.', src: SRC(25) } },
      ],
      src: 'Lecture slides 25, 27',
      notes: [
        'Functions (slide 27): structural constituent of membranes and lipoproteins; precursor of steroid hormones (progesterone, glucocorticoids, mineralocorticoids, androgens and estrogens); bile acids and bile salts; vitamin D.',
        'Facts (slide 25): no vegetable oil contains cholesterol; it is the major animal sterol; only a little comes from the diet — the bulk is made in the body.',
        'Cholesterol + fatty acid = cholesterol ester.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · L.5.4',
      title: 'Put it <em>together</em>',
      steps: 5,
      src: 'Lecture slides 10, 18 · practice scenario',
      notes: 'Ask each question, then press → to reveal. Q4 links structure to function: saturated palmitate chains pack tightly (cis/trans slide).',
      visual: caseViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { big: '2', title: 'essential fatty acids', body: 'Linoleic (ω-6) · linolenic (ω-3).' },
        { big: 'ω-9', title: 'oleic acid', body: '18:1 Δ⁹ — Δ from COOH, ω from CH₃.' },
        { big: 'DPPC', title: 'lung surfactant', body: 'Lacking in preterm babies → RDS.' },
        { big: '27', title: 'carbons in cholesterol', body: '3-OH · C5=C6 · C17 side chain.' },
      ],
      notes: 'Recap the four numbers, then open the question bank.',
    },
  ],
};
