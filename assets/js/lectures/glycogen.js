// Glycogen Metabolism (L.15) — interactive revision deck.
import { h, s, setRich, countTo, onTheme, icon } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { chart } from '../viz/chart.js';
import { seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, glowSprite, kitController } from '../viz/three-kit.js';
import { moleculeScene } from '../viz/scenes.js';

const gsap = window.gsap;
const SRC = (p) => `Lecture slide ${p}`;
const LIP = 'Lippincott Ch 11';
const B14 = 'var(--elec)'; // α(1→4) bonds / glucose
const B16 = 'var(--a1)'; // α(1→6) branch points
const END = 'var(--a2)'; // non-reducing ends / branch residues
const P = 'var(--prot)'; // phosphate
const isDark = () => document.documentElement.dataset.theme !== 'light';

/* ================================================================== */
/* Procedural glycogen particle (reusable)                              */
/* ================================================================== */
// 3D palette (hex, mid-tones that read on black and white)
const HEX = { res: 0x2a6fe8, resOut: 0x58b4ff, b14: 0x5ac8fa, b16: 0xff375f, end: 0xc77dff, core: 0xffb52e, red: 0xff9f0a, bond: 0x7ea9e6 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centroid + principal axis (power iteration) of a set of unit vectors. */
function centroidAxis(vs) {
  const c = new THREE.Vector3();
  vs.forEach((v) => c.add(v));
  c.multiplyScalar(1 / vs.length);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  vs.forEach((v) => {
    const x = v.x - c.x, y = v.y - c.y, z = v.z - c.z;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  });
  const a = new THREE.Vector3(0.6, 0.7, 0.4).normalize();
  for (let k = 0; k < 30; k++) {
    const x = xx * a.x + xy * a.y + xz * a.z, y = xy * a.x + yy * a.y + yz * a.z, z = xz * a.x + yz * a.y + zz * a.z;
    a.set(x, y, z);
    const L = a.length();
    if (L < 1e-9) { a.set(1, 0, 0); break; }
    a.multiplyScalar(1 / L);
  }
  return { c, a };
}

/**
 * glycogenModel(opts) → tree of glucose residues growing from a glycogenin core.
 * Each chain carries 2 branches spaced `branchAt` residues apart (lecture: a branch every 8–10
 * residues). Chain directions are a hierarchical split of a Fibonacci sphere, so tiers radiate
 * outward evenly. Residues are kept ≥ ~1 unit apart (simple collision steering).
 */
const MODELS = new Map();
function glycogenModel(o = {}) {
  const key = JSON.stringify(o);
  if (MODELS.has(key)) return MODELS.get(key);
  const T = o.tiers ?? 6, L = o.len ?? 12, BR = o.branchAt ?? [2, 10], coreR = o.coreR ?? 2.4;
  const rnd = rng(o.seed ?? 7);
  const N = 2 ** T - 1;
  const off = rnd() * Math.PI * 2;
  const dirs = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2;
    const r = Math.sqrt(1 - y * y);
    const ph = i * Math.PI * (3 - Math.sqrt(5)) + off;
    dirs.push(new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r));
  }
  const rootDir = new THREE.Vector3(...(o.rootDir || [0, 0, 1])).normalize();
  const chains = [];
  (function split(set, depth, parent, at) {
    const { c } = centroidAxis(set);
    const ref = parent ? c : rootDir;
    let gi = 0, best = -9;
    set.forEach((v, i) => { const d = v.dot(ref); if (d > best) { best = d; gi = i; } });
    const ch = { id: chains.length, depth, parent, at, goal: set[gi].clone(), res: [], children: [] };
    chains.push(ch);
    if (parent) parent.children.push(ch);
    const rest = set.filter((_, i) => i !== gi);
    if (rest.length >= 2) {
      const { c: c2, a } = centroidAxis(rest);
      rest.sort((p, q) => p.clone().sub(c2).dot(a) - q.clone().sub(c2).dot(a));
      const half = rest.length >> 1;
      let A = rest.slice(0, half), B = rest.slice(half);
      const ca = centroidAxis(A).c.normalize(), cb = centroidAxis(B).c.normalize();
      if (ca.dot(ch.goal) > cb.dot(ch.goal)) [A, B] = [B, A]; // the half that diverges more branches nearer the start
      split(A, depth + 1, ch, BR[0]);
      split(B, depth + 1, ch, BR[1]);
    }
  })(dirs, 0, null, 0);

  // Geometry: every chain is a gentle helix (≈6.5 residues per turn, 1 unit between residues)
  // running from its branch point out to its tier shell, so tiers stack into a dense granule.
  const res = [], links = [];
  const RPT = 6.5, chordK = 2 * Math.sin(Math.PI / RPT);
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const tierR = (t) => coreR + (o.r0 ?? 3.4) + t * (o.dr ?? 2.75);
  const minR = coreR + 0.5;
  for (const ch of chains) {
    let S, prev = -1;
    if (!ch.parent) S = ch.goal.clone().multiplyScalar(coreR * 0.98);
    else { prev = ch.parent.res[ch.at]; S = res[prev].p.clone(); res[prev].branch = true; }
    let E = ch.goal.clone().multiplyScalar(tierR(ch.depth));
    if (E.distanceTo(S) < 2) E = S.clone().add(ch.goal.clone().multiplyScalar(2));
    const A = E.clone().sub(S);
    const d = Math.min(A.length(), L * 0.92);
    A.normalize();
    const st = d / L;
    const rho = Math.sqrt(Math.max(0, 1 - st * st)) / chordK;
    const u = new THREE.Vector3().crossVectors(A, Math.abs(A.y) < 0.9 ? Y : X).normalize();
    const v = new THREE.Vector3().crossVectors(A, u);
    const ph0 = rnd() * Math.PI * 2;
    for (let i = 1; i <= L; i++) {
      const th = ph0 + (2 * Math.PI * i) / RPT;
      const p = S.clone().addScaledVector(A, st * i).addScaledVector(u, rho * (Math.cos(th) - Math.cos(ph0))).addScaledVector(v, rho * (Math.sin(th) - Math.sin(ph0)));
      if (p.length() < minR) p.setLength(minR);
      const idx = res.length;
      res.push({ p, chain: ch.id, i: i - 1, depth: prev >= 0 ? res[prev].depth + 1 : 1, prev, tier: ch.depth });
      if (prev >= 0) links.push({ a: prev, b: idx, t: i === 1 ? 6 : 4 });
      ch.res.push(idx);
      prev = idx;
    }
    res[ch.res[L - 1]].end = true;
  }
  // relax: push apart non-bonded residues that overlap (keeps beads from interpenetrating)
  const bonded = new Set(links.map((l) => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`));
  for (let it = 0; it < 6; it++) {
    const grid = new Map();
    res.forEach((r, i) => { const k = `${Math.floor(r.p.x)},${Math.floor(r.p.y)},${Math.floor(r.p.z)}`; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); });
    let moved = 0;
    res.forEach((r, i) => {
      const fx = Math.floor(r.p.x), fy = Math.floor(r.p.y), fz = Math.floor(r.p.z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const a = grid.get(`${fx + dx},${fy + dy},${fz + dz}`);
        if (!a) continue;
        for (const j of a) {
          if (j <= i || bonded.has(`${i}-${j}`)) continue;
          const q = res[j].p, dd = r.p.distanceTo(q);
          if (dd < 0.9 && dd > 1e-4) {
            const push = r.p.clone().sub(q).multiplyScalar((0.9 - dd) / dd / 2);
            r.p.add(push); q.sub(push); moved++;
          }
        }
      }
    });
    res.forEach((r) => { if (r.p.length() < minR) r.p.setLength(minR); });
    if (!moved) break;
  }
  let radius = 0, maxDepth = 0;
  res.forEach((r) => { radius = Math.max(radius, r.p.length()); maxDepth = Math.max(maxDepth, r.depth); });
  const model = {
    res, links, chains, coreR, radius: radius + 0.5, maxDepth,
    ends: res.map((r, i) => (r.end ? i : -1)).filter((i) => i >= 0),
    branches: res.map((r, i) => (r.branch ? i : -1)).filter((i) => i >= 0),
  };
  MODELS.set(key, model);
  return model;
}

/** Lumpy glossy protein blob (glycogenin). */
function blobMesh(r, color, seed = 1.3) {
  const geo = new THREE.SphereGeometry(r, 96, 72);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const d = 1 + 0.085 * Math.sin(v.x * 4.2 + seed) * Math.sin(v.y * 3.7 + 2 * seed) + 0.07 * Math.sin(v.z * 6.1 + v.x * 2.3) + 0.045 * Math.sin(v.y * 9.3 - v.z * 7.1 + seed);
    v.multiplyScalar(r * d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let e = map.get(k);
    if (!e) map.set(k, (e = { n: new THREE.Vector3(), ids: [] }));
    e.n.x += nrm.getX(i); e.n.y += nrm.getY(i); e.n.z += nrm.getZ(i);
    e.ids.push(i);
  }
  map.forEach((e) => { e.n.normalize(); e.ids.forEach((i) => nrm.setXYZ(i, e.n.x, e.n.y, e.n.z)); });
  return new THREE.Mesh(geo, glossy(color, { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2, emissive: 0x3a1800, emissiveIntensity: 0.5 }));
}

/**
 * glycogenParticle(model, opts) → instanced spheres (residues) + cylinders (bonds) + glycogenin.
 * api: setMode('default'|'a14'|'a16'|'ends'|'reducing'), setGrowth(depth, instant), update(dt).
 */
function glycogenParticle(model, o = {}) {
  const n = model.res.length, m = model.links.length;
  const bead = o.bead ?? 0.42, bondR = o.bondR ?? 0.1;
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const sg = o.seg ?? 16;
  const resMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, sg, Math.round(sg * 0.75)), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.05 }), n);
  const bondMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), Math.max(1, m));
  [resMesh, bondMesh].forEach((x) => { x.instanceMatrix.setUsage(THREE.DynamicDrawUsage); x.frustumCulled = false; });
  inner.add(bondMesh, resMesh);
  const core = blobMesh(model.coreR * 0.92, HEX.core);
  inner.add(core);
  const UP = new THREE.Vector3(0, 1, 0);
  const bonds = model.links.map((l) => {
    const a = model.res[l.a].p, b = model.res[l.b].p, d = b.clone().sub(a);
    return { ...l, mid: a.clone().add(b).multiplyScalar(0.5), q: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), len: d.length() };
  });
  const endSprites = model.ends.map((i) => {
    const sp = glowSprite(HEX.end, 1);
    sp.position.copy(model.res[i].p);
    sp.material.opacity = 0;
    inner.add(sp);
    return { sp, i };
  });

  const st = { G: Infinity, GT: Infinity, speed: 14, glow: 0, glowT: 0, coreK: 1, coreKT: 1, mode: 'default', dirty: true };
  const sc = new Float32Array(n).fill(1), scT = new Float32Array(n).fill(1);
  const col = new Float32Array(n * 3), colT = new Float32Array(n * 3);
  const bs = new Float32Array(m).fill(1), bsT = new Float32Array(m).fill(1);
  const bcol = new Float32Array(m * 3), bcolT = new Float32Array(m * 3);
  const C = new THREE.Color(), C2 = new THREE.Color();
  const put = (arr, i, c) => { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; };

  function targets(mode) {
    const DIM = isDark() ? 0x262b36 : 0xd3d7de;
    const DIMB = isDark() ? 0x1e222b : 0xdfe2e7;
    for (let i = 0; i < n; i++) {
      const r = model.res[i];
      let c = null, k = 1;
      if (mode === 'a14') { c = DIM; k = 0.6; }
      else if (mode === 'a16') { if (r.branch) { c = HEX.b16; k = 1.5; } else { c = DIM; k = 0.75; } }
      else if (mode === 'ends') { if (r.end) { c = HEX.end; k = 1.55; } else { c = DIM; k = 0.75; } }
      else if (mode === 'reducing') { if (r.chain === 0) { c = r.i === 0 ? HEX.red : HEX.res; k = r.i === 0 ? 1.8 : 1.05; } else { c = DIM; k = 0.42; } }
      if (c === null) {
        if (r.branch && o.accentBranches !== false) C.set(HEX.b16);
        else C.set(HEX.res).lerp(C2.set(HEX.resOut), Math.min(1, r.depth / model.maxDepth));
      } else C.set(c);
      put(colT, i, C);
      scT[i] = k;
    }
    bonds.forEach((b, j) => {
      let c = b.t === 6 ? 0xff7a95 : HEX.bond, k = 1;
      if (mode === 'a14') { if (b.t === 4) { c = HEX.b14; k = 1.9; } else { c = DIMB; k = 0.8; } }
      else if (mode === 'a16') { if (b.t === 6) { c = HEX.b16; k = 2.4; } else { c = DIMB; k = 0.7; } }
      else if (mode === 'ends') { c = DIMB; k = 0.7; }
      else if (mode === 'reducing') { if (model.res[b.a].chain === 0 && model.res[b.b].chain === 0) { c = HEX.b14; k = 1.5; } else { c = DIMB; k = 0.4; } }
      put(bcolT, j, C.set(c));
      bsT[j] = k;
    });
    st.glowT = mode === 'ends' ? 1 : mode === 'default' ? (o.endGlow ?? 0.45) : 0;
    st.coreKT = mode === 'reducing' ? 1.12 : 1;
  }

  const smooth = (x) => x * x * (3 - 2 * x);
  const gf = (i) => (Number.isFinite(st.G) ? smooth(Math.max(0, Math.min(1, st.G - model.res[i].depth + 1))) : 1);
  const M = new THREE.Matrix4(), SV = new THREE.Vector3();

  function write() {
    for (let i = 0; i < n; i++) {
      const s0 = bead * sc[i] * gf(i);
      M.makeScale(s0, s0, s0).setPosition(model.res[i].p);
      resMesh.setMatrixAt(i, M);
      resMesh.setColorAt(i, C.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]));
    }
    bonds.forEach((b, j) => {
      const g = Math.min(gf(b.a), gf(b.b));
      const r = bondR * bs[j] * g;
      SV.set(r, g > 0.001 ? b.len : 0.0001, r);
      M.compose(b.mid, b.q, SV);
      bondMesh.setMatrixAt(j, M);
      bondMesh.setColorAt(j, C.setRGB(bcol[j * 3], bcol[j * 3 + 1], bcol[j * 3 + 2]));
    });
    resMesh.instanceMatrix.needsUpdate = true;
    bondMesh.instanceMatrix.needsUpdate = true;
    if (resMesh.instanceColor) resMesh.instanceColor.needsUpdate = true;
    if (bondMesh.instanceColor) bondMesh.instanceColor.needsUpdate = true;
    endSprites.forEach(({ sp, i }) => { const g = gf(i); sp.scale.setScalar(2.2 * g * (0.4 + st.glow)); sp.material.opacity = st.glow * g; });
    core.scale.setScalar(st.coreK);
  }

  let lastT = performance.now();
  function update(_dt, force) {
    // wall-clock dt so growth runs at the intended speed even at low frame rates
    const now = performance.now();
    const dt = Math.min(0.5, (now - lastT) / 1000);
    lastT = now;
    let dirty = force || st.dirty;
    st.dirty = false;
    const k = 1 - Math.exp(-dt * 6);
    if (st.G !== st.GT) {
      if (!Number.isFinite(st.GT) || !Number.isFinite(st.G)) st.G = st.GT;
      else { const d = st.GT - st.G; st.G += Math.sign(d) * Math.min(Math.abs(d), st.speed * dt); }
      dirty = true;
    }
    const lerpArr = (a, t) => { let ch = false; for (let i = 0; i < a.length; i++) { const d = t[i] - a[i]; if (Math.abs(d) > 1e-3) { a[i] += d * k; ch = true; } else if (d) { a[i] = t[i]; ch = true; } } return ch; };
    if (lerpArr(sc, scT)) dirty = true;
    if (lerpArr(col, colT)) dirty = true;
    if (lerpArr(bs, bsT)) dirty = true;
    if (lerpArr(bcol, bcolT)) dirty = true;
    if (Math.abs(st.glow - st.glowT) > 1e-3) { st.glow += (st.glowT - st.glow) * k; dirty = true; }
    if (Math.abs(st.coreK - st.coreKT) > 1e-3) { st.coreK += (st.coreKT - st.coreK) * k; dirty = true; }
    if (dirty) write();
  }

  targets('default');
  col.set(colT); bcol.set(bcolT); sc.set(scT); bs.set(bsT); st.glow = st.glowT;
  if (o.growth !== undefined) { st.G = st.GT = o.growth; }
  update(0, true);

  return {
    group, inner, core, model,
    update,
    setMode(mode, instant) {
      st.mode = mode;
      targets(mode);
      if (instant) { col.set(colT); bcol.set(bcolT); sc.set(scT); bs.set(bsT); st.glow = st.glowT; st.coreK = st.coreKT; }
      st.dirty = true;
    },
    refreshTheme() { targets(st.mode); st.dirty = true; },
    setGrowth(g, instant, speed) { st.GT = g; if (speed) st.speed = speed; if (instant) st.G = g; st.dirty = true; lastT = performance.now(); },
    get growth() { return st.G; },
    world(i) { return model.res[i].p.clone().applyMatrix4(inner.matrixWorld); },
  };
}

/** Put the camera at distance so a sphere of radius R fills `fill` of the view. */
function frameSphere(kit, R, fill = 0.85, target = [0, 0, 0], dir = null) {
  const fovR = THREE.MathUtils.degToRad(kit.camera.fov);
  const fitH = R / Math.sin(fovR / 2);
  const dist = Math.max(fitH, fitH / kit.camera.aspect) / fill;
  const t = new THREE.Vector3(...target);
  const d = (dir ? new THREE.Vector3(...dir) : kit.camera.position.clone().sub(kit.controls ? kit.controls.target : new THREE.Vector3())).normalize();
  return { pos: t.clone().add(d.multiplyScalar(dist)), target: t, dist };
}

/* ================================================================== */
/* Small SVG helpers                                                   */
/* ================================================================== */
/** Glucose bead (circle) with optional phosphate tag. */
function bead(parent, x, y, r, fill, o = {}) {
  const g = s('g', { transform: `translate(${x} ${y})` });
  g.append(s('circle', { r, style: `fill:${fill};stroke:color-mix(in oklab, ${fill} 60%, var(--fg));stroke-width:2` }));
  const tag = s('g', { transform: `translate(${r * 0.78} ${-r * 0.78})`, style: `opacity:${o.tag ? 1 : 0}` });
  tag.append(s('circle', { r: r * 0.58, style: `fill:${P}` }));
  const t = s('text', { y: r * 0.22, 'text-anchor': 'middle', style: `font:800 ${Math.round(r * 0.72)}px var(--font);fill:#1d1d1f` });
  t.textContent = 'P';
  tag.append(t);
  g.append(tag);
  parent.append(g);
  return { g, tag, x, y };
}

const ORGAN = {
  liver: '<path d="M2.8 9.6C2.8 6.4 6.2 4.8 10.5 4.8c4.6 0 10.7 1.3 10.7 4.4 0 3.8-5.6 10-10.2 10-2.6 0-3.5-2.3-5.1-3.6C4.3 14.3 2.8 12.4 2.8 9.6z"/><path d="M11 5.2c-.6 2.6-.2 5.4 1.4 7.6"/>',
  kidney: '<path d="M15.2 3.6c-3.4 0-6 2.5-6 5.6 0 1.4.9 1.9.9 2.8s-.9 1.4-.9 2.8c0 3.1 2.6 5.6 6 5.6s5.6-3.7 5.6-8.4-2.2-8.4-5.6-8.4z"/><path d="M10 12H4.5M4.5 12l-1.5 3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  muscle: '<path d="M2.5 12c3-5 6.2-7.2 9.5-7.2s6.5 2.2 9.5 7.2c-3 5-6.2 7.2-9.5 7.2S5.5 17 2.5 12z"/><path d="M6.5 9.4c3.4 1.6 7.6 1.6 11 0M6 12h12M6.5 14.6c3.4-1.6 7.6-1.6 11 0"/>',
};
const organIcon = (k, size = 44) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ORGAN[k]}</svg>`;

/* ================================================================== */
/* 1 · Hero: glycogen particle                                         */
/* ================================================================== */
function heroViz(el) {
  const kit = createScene(el, { cam: [0, 5, 30], autoRotate: 0.45, fov: 30 });
  const model = glycogenModel({ tiers: 7, seed: 3 });
  const Pt = glycogenParticle(model, { bead: 0.44, growth: 0 });
  kit.root.add(Pt.group);
  const halo = glowSprite(0xff375f, model.radius * 3.2);
  halo.material.opacity = 0.3;
  halo.renderOrder = -1;
  kit.root.add(halo);
  const halo2 = glowSprite(0xffb52e, model.coreR * 9);
  halo2.material.opacity = 0.45;
  kit.root.add(halo2);
  const f = frameSphere(kit, model.radius, 0.98);
  kit.camera.position.copy(f.pos);
  kit.onFrame((dt, t) => {
    Pt.group.rotation.y += dt * 0.07;
    Pt.update(dt);
    halo.material.opacity = isDark() ? 0.26 + 0.05 * Math.sin(t * 1.2) : 0;
    halo2.material.opacity = isDark() ? 0.35 : 0.15;
  });
  let grown = false;
  const off = onTheme(() => Pt.refreshTheme());
  return kitController(kit, {
    enter() { if (!grown) { grown = true; Pt.setGrowth(0, true); Pt.setGrowth(model.maxDepth + 2, false, (model.maxDepth + 2) / 2.0); } },
    destroy: off,
  });
}

/* ================================================================== */
/* 3 · Blood glucose homeostasis (fed ↔ fasting)                       */
/* ================================================================== */
function homeostasisViz(el) {
  const D = diagram(el, 960, 860);
  D.node({ id: 'blood', x: 500, y: 470, label: 'Blood glucose', kind: 'box', w: 360, h: 128, size: 40, color: 'var(--a1)', fill: 'color-mix(in oklab, var(--a1) 14%, transparent)', strokeW: 3, tip: { title: 'Blood glucose', body: 'Kept within a narrow range. Glycogen metabolism is one of the mechanisms of <b>blood glucose homeostasis</b>.', src: SRC(3) } });
  D.node({ id: 'diet', x: 170, y: 150, label: 'Diet', kind: 'box', w: 220, h: 100, size: 36, color: 'var(--act)', fill: 'color-mix(in oklab, var(--act) 12%, transparent)', tip: { title: 'Diet', body: 'After a meal, absorbed glucose raises blood glucose (fed state).', src: SRC(3) } });
  D.node({ id: 'gly', x: 800, y: 150, label: 'Glycogen', kind: 'box', w: 250, h: 100, size: 36, color: 'var(--a2)', fill: 'color-mix(in oklab, var(--a2) 12%, transparent)', tip: { title: 'Glycogen', body: 'Stored when glucose is plentiful (glycogenesis); broken down when it is scarce (glycogenolysis).', src: SRC(3) } });
  D.node({ id: 'gng', x: 760, y: 770, label: 'Gluconeogenesis', kind: 'box', w: 330, h: 100, size: 32, color: 'var(--prot)', fill: 'color-mix(in oklab, var(--prot) 12%, transparent)', tip: { title: 'Gluconeogenesis', body: 'New glucose made from non-carbohydrate sources — a source of blood glucose in the fasting state.', src: SRC(3) } });
  const aDiet = D.arrow({ from: 'diet', to: 'blood', curve: 30, color: 'var(--act)', width: 6 });
  const aGen = D.arrow({ from: [590, 400], to: [730, 205], curve: -50, color: 'var(--a2)', width: 6, label: 'Glycogenesis', labelSide: -1, labelOffset: 40, labelColor: 'var(--a2)', labelWeight: 680 });
  const aLys = D.arrow({ from: [860, 205], to: [680, 400], curve: -50, color: 'var(--a2)', width: 6, label: 'Glycogenolysis', labelSide: -1, labelOffset: 40, labelColor: 'var(--a2)', labelWeight: 680 });
  const aGng = D.arrow({ from: 'gng', to: 'blood', curve: -30, color: 'var(--prot)', width: 6 });
  [aGen.label, aLys.label].forEach((l) => (l.style.fontSize = '28px'));
  // state readout
  const stTitle = D.text(486, 132, 'Homeostasis', { anchor: 'middle', style: 'font-size:40px;font-weight:700;letter-spacing:-.02em' });
  const stSub = D.text(486, 176, 'Three sources', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const arrowG = s('g', { transform: 'translate(150 470)', style: 'opacity:0' });
  const UPD = 'M0,64 L0,-66 M-34,-32 L0,-68 L34,-32', DND = 'M0,-64 L0,66 M-34,32 L0,68 L34,32';
  const arrowPath = s('path', { d: UPD, style: 'fill:none;stroke-width:12;stroke-linecap:round;stroke-linejoin:round' });
  arrowG.append(arrowPath);
  D.layers.labels.append(arrowG);
  const fl = {
    diet: D.flow(aDiet, { count: 3, color: 'var(--act)', speed: 150, r: 11, autoplay: false }),
    gen: D.flow(aGen, { count: 3, color: 'var(--a2)', speed: 150, r: 11, autoplay: false }),
    lys: D.flow(aLys, { count: 3, color: 'var(--a2)', speed: 150, r: 11, autoplay: false }),
    gng: D.flow(aGng, { count: 3, color: 'var(--prot)', speed: 150, r: 11, autoplay: false }),
  };
  const set = (mode) => {
    const fed = mode === 'fed', fast = mode === 'fasting';
    const on = { diet: fed, gen: fed, lys: fast, gng: fast };
    const arr = { diet: aDiet, gen: aGen, lys: aLys, gng: aGng };
    Object.keys(on).forEach((k) => {
      gsap.to(arr[k].g, { opacity: mode ? (on[k] ? 1 : 0.14) : 0.45, duration: 0.5 });
      on[k] ? fl[k].play() : fl[k].hide();
    });
    gsap.to(D.nodes.diet.g, { opacity: !mode || fed ? 1 : 0.35, duration: 0.5 });
    gsap.to(D.nodes.gng.g, { opacity: !mode || fast ? 1 : 0.35, duration: 0.5 });
    stTitle.textContent = fed ? 'Fed state' : fast ? 'Fasting state' : 'Homeostasis';
    stSub.textContent = fed ? 'Glucose ↑ → stored' : fast ? 'Glucose ↓ → released' : 'Three sources';
    stTitle.style.fill = fed ? 'var(--act)' : fast ? 'var(--inh)' : 'var(--fg)';
    arrowPath.style.stroke = fed ? 'var(--act)' : 'var(--inh)';
    arrowPath.setAttribute('d', fast ? DND : UPD);
    gsap.fromTo(arrowG, { opacity: 0 }, { opacity: mode ? 1 : 0, duration: 0.6 });
  };
  const sg = seg({ options: [{ v: 'fed', t: 'Fed' }, { v: 'fasting', t: 'Fasting' }], value: null, onChange: set });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(null);
  return {
    step: (n) => { if (n === 0) { sg.set(null, false); set(null); } else sg.set(n === 1 ? 'fed' : 'fasting'); },
    leave: () => Object.values(fl).forEach((f) => f.pause()),
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* 4 · Two pathways: mini chain animations for the cards               */
/* ================================================================== */
function chainMini(el, mode) {
  const D = diagram(el, 740, 250);
  D.svg.style.height = '100%';
  const Y = 150, R = 20, SP = 50, X0 = 118;
  D.layers.nodes.append(s('circle', { cx: 58, cy: Y, r: 38, style: 'fill:color-mix(in oklab, #ffb52e 72%, transparent)' }));
  D.text(20, Y + 76, 'glycogenin', { cls: 'sm', style: 'font-size:21px;fill:var(--fg-3)' });
  const base = mode === 'gen' ? 7 : 12;
  const conn = s('line', { x1: 90, y1: Y, x2: X0 + (base - 1) * SP, y2: Y, style: 'stroke:var(--line-2);stroke-width:5' });
  D.layers.edges.append(conn);
  const beads = [];
  for (let i = 0; i < 12; i++) {
    const outer = s('g', { transform: `translate(${X0 + i * SP} ${Y})` });
    D.layers.nodes.append(outer);
    const b = bead(outer, 0, 0, R, i < base ? 'color-mix(in oklab, var(--elec) 72%, var(--bg))' : 'var(--elec)');
    if (i >= base) gsap.set(b.g, { opacity: 0 });
    beads.push(b);
  }
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
  if (mode === 'gen') {
    for (let i = base; i < 12; i++) {
      tl.fromTo(beads[i].g, { opacity: 0, x: 90, y: -80 }, { opacity: 1, x: 0, y: 0, duration: 0.55, ease: 'power2.out' });
      tl.to(conn, { attr: { x2: X0 + i * SP }, duration: 0.15 }, '>-0.1');
    }
    tl.to(beads.slice(base).map((b) => b.g), { opacity: 0, duration: 0.5, delay: 1 });
    tl.set(conn, { attr: { x2: X0 + (base - 1) * SP } });
    D.text(730, 40, 'UDP-glucose → new α(1→4) at the end', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2)' });
  } else {
    for (let i = 11; i >= 6; i--) {
      tl.to(beads[i].tag, { opacity: 1, duration: 0.2 });
      tl.to(beads[i].g, { x: 90, y: -80, opacity: 0, duration: 0.55, ease: 'power2.in' }, '>');
      tl.to(conn, { attr: { x2: X0 + (i - 1) * SP }, duration: 0.15 }, '<');
    }
    tl.set(beads.slice(6).map((b) => b.g), { x: 0, y: 0, opacity: 1, delay: 1 });
    tl.set(beads.slice(6).map((b) => b.tag), { opacity: 0 });
    tl.set(conn, { attr: { x2: X0 + 11 * SP } });
    const t = D.text(730, 40, 'P_{i} → glucose-1-P leaves the end', { anchor: 'end', cls: 'sm', style: 'font-size:22px;fill:var(--fg-2)' });
  }
  return { destroy: () => { tl.kill(); D.destroy(); } };
}

/* ================================================================== */
/* 5 · Liver vs muscle card visuals                                    */
/* ================================================================== */
function organCardViz(el, kind) {
  const D = diagram(el, 470, 240);
  D.svg.style.height = '100%';
  const rnd = rng(kind === 'liver' ? 4 : 8);
  if (kind === 'liver' || kind === 'muscle') {
    const path = kind === 'liver'
      ? 'M24,96 C30,40 130,26 250,34 C340,40 392,58 384,96 C374,136 300,170 226,190 C164,206 110,208 80,186 C40,158 20,130 24,96 Z'
      : 'M18,120 C70,52 150,38 200,38 C250,38 330,52 382,120 C330,188 250,202 200,202 C150,202 70,188 18,120 Z';
    const col = kind === 'liver' ? 'var(--a1)' : 'var(--elec)';
    D.layers.regions.append(s('path', { d: path, style: `fill:color-mix(in oklab, ${col} 16%, transparent);stroke:color-mix(in oklab, ${col} 55%, transparent);stroke-width:3` }));
    if (kind === 'muscle') [90, 120, 150].forEach((y) => D.layers.regions.append(s('path', { d: `M60,${y} C140,${y - 10 + (y - 120) * 0.3} 260,${y - 10 + (y - 120) * 0.3} 340,${y}`, style: `fill:none;stroke:color-mix(in oklab, ${col} 30%, transparent);stroke-width:2` })));
    // glycogen granules: dense in liver (10%), sparse in muscle (1–2%)
    const count = kind === 'liver' ? 46 : 9;
    const probe = s('path', { d: path });
    D.layers.regions.append(probe);
    probe.style.visibility = 'hidden';
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 2000) {
      const x = 40 + rnd() * 340, y = 40 + rnd() * 160;
      const pt = D.svg.createSVGPoint(); pt.x = x; pt.y = y;
      if (!probe.isPointInFill(pt)) continue;
      const c = s('circle', { cx: x, cy: y, r: 7, style: `fill:${END};opacity:.85` });
      D.layers.nodes.append(c);
      gsap.fromTo(c, { scale: 0.6, transformOrigin: '50% 50%' }, { scale: 1.15, duration: 1.2 + rnd(), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: rnd() });
      placed++;
    }
    if (kind === 'liver') {
      const out = s('path', { d: 'M330,140 C390,150 420,180 456,214', style: 'fill:none;stroke:none' });
      D.layers.fx.append(out);
      D.arrow({ d: 'M330,140 C390,150 420,180 456,214', from: [330, 140], to: [456, 214], color: 'var(--act)', width: 4 });
      D.flow(out, { count: 2, color: 'var(--elec)', speed: 70, r: 8 });
      D.text(452, 30, 'glucose → blood', { anchor: 'end', cls: 'sm', style: 'font-size:21px;fill:var(--act);font-weight:650' });
    } else {
      const loop = D.arrow({ d: 'M250,92 C320,92 320,152 250,152', from: [250, 92], to: [250, 152], color: 'var(--prot)', width: 4 });
      D.flow(loop, { count: 2, color: 'var(--prot)', speed: 60, r: 7 });
      D.text(452, 30, 'G6P stays inside', { anchor: 'end', cls: 'sm', style: 'font-size:21px;fill:var(--prot);font-weight:650' });
    }
  } else {
    // body totals: 100 g vs 400 g
    const rows = [{ k: 'Liver', v: 100, c: 'var(--a1)' }, { k: 'Muscle', v: 400, c: 'var(--elec)' }];
    rows.forEach((r, i) => {
      const y = 60 + i * 100;
      D.text(0, y - 16, r.k, { cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
      D.layers.regions.append(s('rect', { x: 0, y, width: 460, height: 34, rx: 17, style: 'fill:var(--surface-2)' }));
      const bar = s('rect', { x: 0, y, width: 0, height: 34, rx: 17, style: `fill:${r.c}` });
      D.layers.nodes.append(bar);
      gsap.to(bar, { attr: { width: (r.v / 400) * 460 }, duration: 1.4, delay: 0.5 + i * 0.25, ease: 'power3.out' });
      D.text(460, y - 16, `≈ ${r.v} g`, { anchor: 'end', cls: 'sm', style: `fill:${r.c};font-weight:700` });
    });
  }
  return { destroy: () => { D.svg.querySelectorAll('*').forEach((n) => gsap.killTweensOf(n)); D.destroy(); } };
}

/* ================================================================== */
/* 6 · Liver vs muscle roles in fed / fasting states                   */
/* ================================================================== */
function rolesViz(el) {
  const D = diagram(el, 1712, 720);
  const liverPath = 'M40,250 C50,120 220,80 420,96 C560,108 640,140 626,240 C612,330 500,420 380,470 C280,512 190,520 140,480 C80,430 34,360 40,250 Z';
  const musclePath = 'M1090,330 C1180,170 1340,120 1420,120 C1500,120 1640,170 1700,330 C1640,490 1500,560 1420,560 C1340,560 1180,490 1090,330 Z';
  D.layers.regions.append(s('path', { d: liverPath, style: 'fill:color-mix(in oklab, var(--a1) 12%, transparent);stroke:color-mix(in oklab, var(--a1) 50%, transparent);stroke-width:3' }));
  D.layers.regions.append(s('path', { d: musclePath, style: 'fill:color-mix(in oklab, var(--elec) 10%, transparent);stroke:color-mix(in oklab, var(--elec) 50%, transparent);stroke-width:3' }));
  [280, 330, 380].forEach((y) => D.layers.regions.append(s('path', { d: `M1150,${y} C1300,${y - 14 + (y - 330) * 0.25} 1540,${y - 14 + (y - 330) * 0.25} 1650,${y}`, style: 'fill:none;stroke:color-mix(in oklab, var(--elec) 22%, transparent);stroke-width:3' })));
  // blood vessel
  D.layers.regions.append(s('rect', { x: 760, y: 40, width: 200, height: 620, rx: 100, style: 'fill:color-mix(in oklab, var(--inh) 13%, transparent);stroke:color-mix(in oklab, var(--inh) 45%, transparent);stroke-width:3' }));
  D.text(330, 60, 'LIVER', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--a1)' });
  D.text(860, 30, 'BLOOD', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--inh)' });
  D.text(1400, 90, 'MUSCLE', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--elec)' });
  const node = (id, x, y, label, col, tipo) => D.node({ id, x, y, label, kind: 'box', size: 30, color: col, fill: `color-mix(in oklab, ${col} 14%, var(--bg))`, tip: tipo });
  node('lgly', 250, 210, 'Glycogen', 'var(--a2)', { title: 'Liver glycogen', body: '10% of fresh weight · ≈ 100 g. Broken down to <b>free glucose</b>, which is exported to blood.', src: SRC(4) });
  node('lglc', 400, 380, 'Glucose', 'var(--elec)', { title: 'Free glucose', body: 'Liver has <b>glucose-6-phosphatase</b>, so G6P → glucose, which can leave the cell.', src: SRC('4, 15') });
  node('bglc', 860, 350, 'Glucose', 'var(--elec)', { title: 'Blood glucose', body: 'Fed: supplies both stores. Fasting: maintained by liver glycogen (and gluconeogenesis).', src: SRC('3, 4') });
  node('mgly', 1300, 250, 'Glycogen', 'var(--a2)', { title: 'Muscle glycogen', body: '1–2% of fresh weight · ≈ 400 g. Most of the body’s glycogen.', src: SRC(4) });
  node('mg6p', 1520, 420, 'Glucose-6-P', 'var(--prot)', { title: 'Glucose-6-P stays in muscle', body: 'Muscle glycogen is broken down only as far as glucose-6-P, used for the muscle’s own glycolysis. <span style="color:var(--fg-3)">Textbook: muscle lacks glucose-6-phosphatase.</span>', src: `${SRC('4, 15')} · ${LIP}` });
  const fedA = [
    D.arrow({ from: [770, 300], to: 'lgly', curve: 60, color: 'var(--act)', width: 5 }),
    D.arrow({ from: [950, 300], to: 'mgly', curve: -50, color: 'var(--act)', width: 5 }),
  ];
  const fastA = [
    D.arrow({ from: 'lgly', to: 'lglc', curve: -30, color: 'var(--a2)', width: 5 }),
    D.arrow({ from: 'lglc', to: 'bglc', curve: -20, color: 'var(--elec)', width: 5 }),
    D.arrow({ from: 'mgly', to: 'mg6p', curve: -30, color: 'var(--a2)', width: 5 }),
  ];
  const gly = D.node({ x: 1540, y: 600, label: 'Glycolysis · energy', kind: 'enz', size: 26, color: 'var(--atp)' });
  const toGly = D.arrow({ from: 'mg6p', to: [1540, 568], color: 'var(--atp)', width: 4 });
  // blocked exit from muscle
  const ghost = D.arrow({ from: [1180, 420], to: [975, 420], color: 'var(--inh)', width: 4, dash: '10 10' });
  const xg = s('g', { transform: 'translate(1078 420)' });
  xg.append(s('circle', { r: 26, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:4' }), s('path', { d: 'M-11,-11 L11,11 M11,-11 L-11,11', style: 'stroke:var(--inh);stroke-width:5;stroke-linecap:round' }));
  xg.setAttribute('data-tip', JSON.stringify({ title: 'No glucose release from muscle', body: 'Muscle cannot release glucose to blood — its glycogen serves the muscle only.', src: `${SRC(4)} · ${LIP}` }));
  D.layers.labels.append(xg);
  const capL = D.text(330, 570, '', { anchor: 'middle', style: 'font-size:30px;font-weight:650' });
  const capM = D.text(1400, 660, '', { anchor: 'middle', style: 'font-size:30px;font-weight:650' });
  const fl = [
    ...fedA.map((a) => D.flow(a, { count: 3, color: 'var(--elec)', speed: 130, r: 10, autoplay: false })),
    ...fastA.map((a) => D.flow(a, { count: 3, color: 'var(--elec)', speed: 120, r: 10, autoplay: false })),
    D.flow(toGly, { count: 2, color: 'var(--atp)', speed: 90, r: 8, autoplay: false }),
  ];
  const set = (mode) => {
    const fed = mode === 'fed', fast = mode === 'fasting';
    fedA.forEach((a, i) => { gsap.to(a.g, { opacity: !mode ? 0.4 : fed ? 1 : 0.1, duration: 0.5 }); fed ? fl[i].play() : fl[i].hide(); });
    fastA.forEach((a, i) => { gsap.to(a.g, { opacity: !mode ? 0.4 : fast ? 1 : 0.1, duration: 0.5 }); fast ? fl[2 + i].play() : fl[2 + i].hide(); });
    gsap.to([toGly.g, gly.g], { opacity: fast ? 1 : 0.25, duration: 0.5 });
    fast ? fl[5].play() : fl[5].hide();
    gsap.to([ghost.g, xg], { opacity: fast ? 1 : 0, duration: 0.5 });
    capL.textContent = fed ? 'Stores glucose' : fast ? 'Releases glucose to blood' : 'Liver';
    capM.textContent = fed ? 'Stores glucose' : fast ? 'Uses it for itself' : 'Muscle';
    capL.style.fill = fast ? 'var(--act)' : 'var(--fg)';
    capM.style.fill = fast ? 'var(--prot)' : 'var(--fg)';
    gsap.fromTo([capL, capM], { opacity: 0 }, { opacity: 1, duration: 0.5 });
  };
  const sg = seg({ options: [{ v: 'fed', t: 'Fed' }, { v: 'fasting', t: 'Fasting' }], value: null, onChange: set });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(null);
  return {
    step: (n) => { if (n === 0) { sg.set(null, false); set(null); } else sg.set(n === 1 ? 'fed' : 'fasting'); },
    leave: () => fl.forEach((f) => f.pause()),
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* 7 · Structure: highlight modes on the 3D particle                   */
/* ================================================================== */
function structureViz(el) {
  const kit = createScene(el, { cam: [0, 4, 30], autoRotate: 0.5, fov: 30 });
  const model = glycogenModel({ tiers: 7, seed: 3 });
  const Pt = glycogenParticle(model, { bead: 0.44 });
  kit.root.add(Pt.group);
  const f = frameSphere(kit, model.radius, 0.9);
  kit.camera.position.copy(f.pos);
  // anchor residues for labels (front-facing at start)
  const front = (list) => list.reduce((b, i) => (model.res[i].p.z + model.res[i].p.y * 0.4 > model.res[b].p.z + model.res[b].p.y * 0.4 ? i : b), list[0]);
  const midBranches = model.branches.filter((i) => model.res[i].tier >= 3 && model.res[i].tier <= 4);
  const iB = front(midBranches);
  const iE = front(model.ends);
  const lab = (html, i, cls, dy = 1.2) => { const p = model.res[i].p; const o = kit.label(html, [p.x, p.y + dy, p.z], { cls, parent: Pt.inner }); o.element.style.opacity = 0; return o; };
  const L = {
    a14: lab('α(1→4) · linear chains', model.chains[3].res[6], 'acc'),
    a16: lab('α(1→6) · branch point', iB, 'acc'),
    end: lab('Non-reducing end', iE, 'acc'),
    red: lab('Reducing end → glycogenin', model.chains[0].res[0], 'acc', 4.6),
  };
  L.a14.element.style.color = 'var(--elec)';
  L.a16.element.style.color = 'var(--a1)';
  L.end.element.style.color = 'var(--a2)';
  L.red.element.style.color = 'var(--prot)';
  const modes = ['default', 'a14', 'a16', 'ends', 'reducing'];
  kit.onFrame((dt) => Pt.update(dt));
  const off = onTheme(() => Pt.refreshTheme());
  return kitController(kit, {
    step(n) {
      Pt.setMode(modes[n] || 'default');
      L.a14.element.style.opacity = n === 1 ? 1 : 0;
      L.a16.element.style.opacity = n === 2 ? 1 : 0;
      L.end.element.style.opacity = n === 3 ? 1 : 0;
      L.red.element.style.opacity = n === 4 ? 1 : 0;
    },
    destroy: off,
  });
}

/* ================================================================== */
/* 8 · Zoom into a branch point (Haworth rings)                        */
/* ================================================================== */
function branchPointViz(el) {
  const D = diagram(el, 960, 860);
  // context strip: chain with a branch every 8–10 residues
  const ctx = s('g');
  D.layers.nodes.append(ctx);
  const cy = 120, x0 = 60, sp = 34;
  const ctxBeads = [];
  for (let i = 0; i < 25; i++) {
    const isB = i === 4 || i === 13 || i === 22;
    const c = s('circle', { cx: x0 + i * sp, cy, r: 12, style: `fill:${isB ? B16 : 'color-mix(in oklab, var(--elec) 70%, transparent)'}` });
    ctx.append(c);
    ctxBeads.push(c);
  }
  [4, 13, 22].forEach((b) => { for (let k = 1; k <= 4; k++) ctx.append(s('circle', { cx: x0 + b * sp + k * 22, cy: cy - k * 26, r: 11, style: 'fill:color-mix(in oklab, var(--a2) 70%, transparent)' })); });
  const brace = s('g', { style: 'opacity:0' });
  brace.append(s('path', { d: `M${x0 + 4 * sp},${cy + 26} L${x0 + 4 * sp},${cy + 38} L${x0 + 13 * sp},${cy + 38} L${x0 + 13 * sp},${cy + 26}`, style: 'fill:none;stroke:var(--ink);stroke-width:3' }));
  const bt = s('text', { x: x0 + 8.5 * sp, y: cy + 74, 'text-anchor': 'middle', class: 'v-label', style: 'fill:var(--ink);font-weight:700' });
  bt.textContent = 'a branch every 8–10 residues';
  brace.append(bt);
  D.layers.labels.append(brace);
  // zoom cone from residue 13 to the ring drawing
  const zx = x0 + 13 * sp;
  D.layers.regions.append(s('path', { d: `M${zx - 18},${cy + 14} L60,330 L940,330 L${zx + 18},${cy + 14} Z`, style: 'fill:color-mix(in oklab, var(--a1) 6%, transparent);stroke:none' }));
  D.layers.regions.append(s('rect', { x: 20, y: 330, width: 920, height: 520, rx: 40, style: 'fill:var(--surface);stroke:var(--line);stroke-width:2' }));
  D.layers.regions.append(s('circle', { cx: zx, cy, r: 22, style: 'fill:none;stroke:var(--ink);stroke-width:3' }));

  // Haworth ring helper
  const ring = (cx, cy0, label, o = {}) => {
    const g = s('g');
    const pts = { C4: [cx - 72, cy0], C3: [cx - 38, cy0 + 30], C2: [cx + 38, cy0 + 30], C1: [cx + 72, cy0], O5: [cx + 38, cy0 - 26], C5: [cx - 38, cy0 - 26] };
    const poly = ['C5', 'O5', 'C1', 'C2', 'C3', 'C4'].map((k) => pts[k].join(',')).join(' ');
    g.append(s('polygon', { points: poly, style: 'fill:color-mix(in oklab, var(--elec) 12%, transparent);stroke:var(--fg-2);stroke-width:3;stroke-linejoin:round' }));
    g.append(s('path', { d: `M${pts.C1} L${pts.C2} L${pts.C3} L${pts.C4}`, style: 'fill:none;stroke:var(--fg);stroke-width:7;stroke-linejoin:round;stroke-linecap:round' }));
    const ot = s('text', { x: pts.O5[0] + 2, y: pts.O5[1] + 9, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--inh);font-weight:700;paint-order:stroke;stroke:var(--bg);stroke-width:8px' });
    ot.textContent = 'O';
    g.append(ot);
    // C5 → C6
    g.append(s('line', { x1: pts.C5[0], y1: pts.C5[1], x2: pts.C5[0], y2: pts.C5[1] - 44, style: 'stroke:var(--fg-2);stroke-width:3' }));
    if (!o.c6linked) { const t = s('text', { x: pts.C5[0], y: pts.C5[1] - 52, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2)' }); setRich(t, 'CH_{2}OH'); g.append(t); }
    const num = (k, txt, dx, dy) => { const t = s('text', { x: pts[k][0] + dx, y: pts[k][1] + dy, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:20px;fill:var(--fg-3);font-weight:650' }); t.textContent = txt; g.append(t); };
    num('C1', '1', 16, -10); num('C4', '4', -16, -10);
    if (o.c6linked) num('C5', '6', -16, -30);
    D.layers.nodes.append(g);
    if (label) D.text(cx, cy0 + 72, label, { anchor: 'middle', cls: 'sm', style: 'font-size:20px;fill:var(--fg-3)' });
    return pts;
  };
  const CY = 690;
  const r1 = ring(180, CY), r2 = ring(480, CY, '', { c6linked: true }), r3 = ring(780, CY);
  const br1 = ring(405, 520, ''), br0 = ring(105, 520, '');
  // bonds
  const bondPath = (d, cls) => { const p = s('path', { d, style: 'fill:none;stroke:var(--fg-2);stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round' }); D.layers.edges.append(p); return p; };
  const O = (x, y, col) => { const g = s('g', { transform: `translate(${x} ${y})` }); const c = s('circle', { r: 20, style: 'fill:var(--bg);stroke:var(--fg-3);stroke-width:2' }); const t = s('text', { y: 9, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--inh);font-weight:700' }); t.textContent = 'O'; g.append(c, t); D.layers.labels.append(g); return { g, c, col }; };
  // α(1→4): C1 (down) → O → C4 of next ring
  const o14 = [];
  [[r1, r2], [r2, r3], [br0, br1]].forEach(([a, b]) => {
    const ox = (a.C1[0] + b.C4[0]) / 2, oy = a.C1[1] + 40;
    bondPath(`M${a.C1[0]},${a.C1[1]} L${ox},${oy} L${b.C4[0]},${b.C4[1]}`);
    o14.push(O(ox, oy, B14));
  });
  // α(1→6): branch ring C1 (down) → O6 → C6 (CH2) of r2
  const c6 = [r2.C5[0], r2.C5[1] - 44];
  bondPath(`M${br1.C1[0]},${br1.C1[1]} L${br1.C1[0]},${br1.C1[1] + 30} L${c6[0]},${c6[1]}`);
  const o16 = O(br1.C1[0] + 0.5 * (c6[0] - br1.C1[0]), (br1.C1[1] + 30 + c6[1]) / 2, B16);
  const ch2 = s('text', { x: c6[0] + 16, y: c6[1] + 8, class: 'v-label sm', style: 'fill:var(--fg-2)' }); setRich(ch2, 'CH_{2}'); D.layers.labels.append(ch2);
  // tails
  bondPath(`M${r3.C1[0]},${r3.C1[1]} L${r3.C1[0] + 40},${r3.C1[1] + 40} L${r3.C1[0] + 70},${r3.C1[1] + 40}`);
  bondPath(`M${r1.C4[0]},${r1.C4[1]} L${r1.C4[0] - 40},${r1.C4[1] + 20}`);
  bondPath(`M${br0.C4[0]},${br0.C4[1]} L${br0.C4[0] - 30},${br0.C4[1] + 20}`);
  // callouts
  const call14 = D.badge(280, 800, 'α(1→4) · C1–O–C4', { color: B14, size: 26, w: 280 });
  const call16 = D.badge(720, 470, 'α(1→6) · C1–O–C6', { color: B16, size: 26, w: 280 });
  const leader16 = D.arrow({ from: [600, 476], to: [c6[0] + 26, o16.g.transform.baseVal[0].matrix.f], color: B16, width: 3, headSize: 12 });
  [call14, call16, leader16.g].forEach((e) => (e.style.opacity = 0));
  D.text(480, 380, 'Zoom: one branch point', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3);letter-spacing:.12em;text-transform:uppercase;font-weight:650' });
  const hi = (o, on) => { o.c.style.stroke = on ? o.col : 'var(--fg-3)'; o.c.style.strokeWidth = on ? 5 : 2; o.c.style.fill = on ? `color-mix(in oklab, ${o.col} 22%, var(--bg))` : 'var(--bg)'; };
  return {
    step(n) {
      o14.forEach((o) => hi(o, n === 1 || n === 3));
      hi(o16, n === 2 || n === 3);
      gsap.to(call14, { opacity: n === 1 || n === 3 ? 1 : 0, duration: 0.5 });
      gsap.to([call16, leader16.g], { opacity: n >= 2 ? 1 : 0, duration: 0.5 });
      gsap.to(brace, { opacity: n === 3 ? 1 : 0, duration: 0.5 });
    },
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* 9 · Activating glucose: reaction ladder + real 3D molecules         */
/* ================================================================== */
async function activationViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1040px 1fr';
  el.style.gap = '28px';
  const left = h('div', { style: 'position:relative' });
  const right = h('div', { style: 'position:relative' });
  el.append(left, right);
  const D = diagram(left, 1040, 720);
  const MX = 520, Y = [52, 202, 352, 502, 652];
  const names = ['Glucose', 'Glucose-6-P', 'Glucose-1-P', 'UDP-glucose', 'Glycogen (n+1)'];
  const cols = ['var(--elec)', 'var(--prot)', 'var(--prot)', 'var(--fadh)', 'var(--a1)'];
  const nodeTips = [
    { title: 'α-D-Glucose', body: 'Requirement for glycogenesis (with glycogenin, ATP, UTP and enzymes).', src: SRC(6) },
    { title: 'Glucose-6-phosphate', body: 'Phosphate on C6. Also a key allosteric signal: it activates glycogen synthase.', src: SRC('8, 18') },
    { title: 'Glucose-1-phosphate', body: 'Phosphate moved from C6 to C1 by phosphoglucomutase (reversible).', src: SRC(8) },
    { title: 'UDP-glucose', body: 'The activated glucose donor (“UDP-●”) used by glycogenin and glycogen synthase.', src: SRC('8, 10') },
    { title: 'Glycogen (n + 1 residues)', body: 'Glycogen synthase adds the glucose to a <b>non-reducing end</b> with an α(1→4) bond, releasing UDP.', src: SRC('8, 10') },
  ];
  const nodes = names.map((t, i) => D.node({ id: `n${i}`, x: MX, y: Y[i], label: t, kind: 'mol', size: 30, color: cols[i], tip: nodeTips[i] }));
  const enz = [
    { t: 'Glucokinase (liver)', tip: { title: 'Glucokinase', body: 'Glucose + ATP → glucose-6-P + ADP. The slide shows glucokinase (liver).', list: ['Textbook: hexokinase does this step in muscle and most tissues'], src: `${SRC(8)} · ${LIP}` } },
    { t: 'Phosphoglucomutase', tip: { title: 'Phosphoglucomutase', body: 'Glucose-6-P ⇄ glucose-1-P. <b>Reversible</b> (double arrow).', src: SRC('8, 10') } },
    { t: 'UDP-glucose pyrophosphorylase', tip: { title: 'UDP-glucose pyrophosphorylase', body: 'Glucose-1-P + UTP → UDP-glucose + PPᵢ. Pyrophosphatase then hydrolyses PPᵢ → 2 Pᵢ (+ H₂O), making the step irreversible.', src: SRC('8, 10') } },
    { t: 'Glycogen synthase', tip: { title: 'Glycogen synthase', body: 'Transfers glucose from UDP-glucose to a non-reducing end (α(1→4)). Needs a pre-existing primer. <b>Rate-limiting enzyme</b> of glycogenesis.', src: SRC('8, 10, 11') } },
  ];
  const arrows = [], enzT = [], side = [];
  for (let i = 0; i < 4; i++) {
    const y0 = Y[i] + 38, y1 = Y[i + 1] - 38;
    const grp = s('g');
    let a;
    if (i === 1) {
      const a1 = D.arrow({ from: [MX - 16, y0], to: [MX - 16, y1], color: 'var(--fg-3)', width: 5 });
      const a2 = D.arrow({ from: [MX + 16, y1], to: [MX + 16, y0], color: 'var(--fg-3)', width: 5 });
      a = a1; arrows.push([a1, a2]);
    } else { a = D.arrow({ from: [MX, y0], to: [MX, y1], color: 'var(--fg-3)', width: 5 }); arrows.push([a]); }
    const t = D.text(MX + 96, (y0 + y1) / 2 + 9, enz[i].t, { cls: '', style: 'font-size:26px;font-weight:620;fill:var(--ink)', tip: enz[i].tip });
    enzT.push(t);
    side.push(grp);
    D.layers.labels.append(grp);
  }
  // side cofactors
  const sideCurve = (i, inT, outT, inCol, outCol) => {
    const y0 = Y[i] + 46, y1 = Y[i + 1] - 46;
    const g = side[i];
    if (inT) { const b = D.badge(330, y0, inT, { color: inCol, size: 24 }); g.append(b); }
    const long = outT && outT.length > 8;
    const ox = long ? 290 : 330, oEdge = long ? 290 + 95 + 8 : 378;
    if (outT) { const b = D.badge(ox, y1, outT, { color: outCol, size: 24, w: long ? 190 : undefined }); g.append(b); }
    const d = inT ? `M378,${y0} C${MX - 20},${y0 + 4} ${MX - 20},${y1 - 4} ${oEdge},${y1}` : `M${MX - 14},${(y0 + y1) / 2 - 10} C${MX - 30},${y1 - 4} 430,${y1} ${oEdge + 6},${y1}`;
    const a = D.arrow({ d, from: [378, y0], to: [oEdge, y1], color: outCol, width: 3.5, headSize: 13 });
    g.append(a.g);
    return a;
  };
  sideCurve(0, 'ATP', 'ADP', 'var(--atp)', 'var(--atp)');
  sideCurve(2, 'UTP', 'PP_{i} → 2 P_{i}', 'var(--atp)', 'var(--prot)');
  const udpA = sideCurve(3, null, 'UDP', null, 'var(--fadh)');
  // UDP → UTP recycling loop
  const loop = s('g');
  const lp = D.arrow({ d: `M290,${Y[3] + 104} C40,${Y[3] + 104} 40,${Y[2] + 46} 290,${Y[2] + 46}`, from: [290, Y[3] + 104], to: [290, Y[2] + 46], color: 'var(--atp)', width: 3.5, dash: '10 9', headSize: 13 });
  loop.append(lp.g);
  const lt = D.badge(102, (Y[2] + Y[3]) / 2 + 76, 'ATP → ADP', { color: 'var(--atp)', size: 21, w: 140, tip: { title: 'UDP recycled to UTP', body: 'UDP + ATP → UTP + ADP. Enzyme not named on the slide (textbook: nucleoside diphosphate kinase).', src: `${SRC(8)} · ${LIP}` } });
  lt.querySelector('rect').style.fill = 'color-mix(in oklab, var(--atp) 18%, var(--bg))';
  loop.append(lt);
  D.layers.labels.append(loop);
  side[3].append(loop);
  const flows = arrows.map(([a]) => D.flow(a, { count: 2, color: cols[arrows.indexOf(arrows.find((x) => x[0] === a)) + 1], speed: 90, r: 9, autoplay: false }));

  // 3D molecule
  const capName = h('div', { style: 'font-size:40px;font-weight:700;letter-spacing:-.02em;text-align:center' });
  const capSub = h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:6px;text-align:center' });
  right.append(h('div', { style: 'position:absolute;left:0;right:0;top:0;z-index:2;pointer-events:none' }, [capName, capSub]));
  const host = h('div', { style: 'position:absolute;inset:100px 0 10px 0' });
  right.append(host);
  const MOL = [
    ['a-glucose', 'α-D-Glucose', 'Real 3D structure · drag to rotate'],
    ['g6p', 'Glucose-6-phosphate', 'Phosphate on C6 · ATP spent'],
    ['g1p', 'Glucose-1-phosphate', 'Phosphate moved to C1'],
    ['udp-glucose', 'UDP-glucose', 'Activated donor · UTP spent'],
    ['maltose', 'New α(1→4) link', 'Two glucoses joined (as in maltose)'],
  ];
  const viewer = await moleculeScene(host, MOL[0][0], { fill: 0.86, mol: { hideH: false }, autoRotate: 1.2 });
  let cur = 0;
  const apply = (n) => {
    nodes.forEach((nd, i) => gsap.to(nd.g, { opacity: i <= n ? 1 : 0.18, duration: 0.5 }));
    arrows.forEach((as, i) => { as.forEach((a) => gsap.to(a.g, { opacity: i < n ? 1 : 0.15, duration: 0.5 })); gsap.to(enzT[i], { opacity: i < n ? 1 : 0.2, duration: 0.5 }); gsap.to(side[i], { opacity: i < n ? 1 : 0, duration: 0.5 }); i === n - 1 ? flows[i].play() : flows[i].hide(); });
    gsap.to(loop, { opacity: n >= 4 ? 1 : 0, duration: 0.5 });
    capName.innerHTML = MOL[n][1];
    capSub.innerHTML = MOL[n][2];
    if (n !== cur) { cur = n; viewer.swap(MOL[n][0], n === 3 ? { hideH: 'nonpolar' } : {}); }
  };
  return { ...viewer, step: apply, destroy: () => { D.destroy(); viewer.destroy(); } };
}

/* ================================================================== */
/* 10 · Glycogenesis showpiece: glycogenin → primer → elongate → branch → granule */
/* ================================================================== */
function growViz(el) {
  const kit = createScene(el, { cam: [0, 0, 20], autoRotate: 0, fov: 30 });
  const model = glycogenModel({ tiers: 6, seed: 9 });
  const Pt = glycogenParticle(model, { bead: 0.42, growth: 0, endGlow: 0.6 });
  kit.root.add(Pt.group);
  Pt.inner.quaternion.setFromUnitVectors(model.res[0].p.clone().normalize(), new THREE.Vector3(1, 0, 0));
  const halo = glowSprite(0xffb52e, 9);
  halo.material.opacity = 0.35;
  kit.root.add(halo);
  // close-up chain a…o
  const CG = new THREE.Group();
  kit.root.add(CG);
  const UP = new THREE.Vector3(0, 1, 0);
  const sph = new THREE.SphereGeometry(0.42, 32, 22);
  const mats = { primer: glossy(0x8fd0ff), neo: glossy(HEX.res), block: glossy(HEX.end, { emissive: 0x2a0a40 }), bp: glossy(HEX.b16, { emissive: 0x3a0010 }) };
  const x0 = model.coreR * 1.05 + 0.5;
  const LET = 'abcdefghijklmno';
  const gI = 6;
  const linePos = (i) => new THREE.Vector3(x0 + i, 0, 0);
  const brPos = (i) => linePos(gI).add(new THREE.Vector3(Math.cos(0.92) * (i - 8), Math.sin(0.92) * (i - 8), 0));
  const beads = [...LET].map((L, i) => {
    const m = new THREE.Mesh(sph, i < 4 ? mats.primer : mats.neo);
    m.position.copy(linePos(i));
    m.scale.setScalar(0.001);
    CG.add(m);
    const lb = kit.label(L, [0, -0.95, 0], { cls: 'sm plain', parent: m });
    lb.element.style.opacity = 0;
    lb.element.style.fontWeight = '650';
    lb.element.style.color = i >= 9 ? 'var(--a2)' : 'var(--fg-2)';
    return { m, lb, k: { s: 0 } };
  });
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  const bMat = glossy(HEX.bond), pMat = glossy(HEX.b16, { emissive: 0x400010 }), tMat = glossy(HEX.core);
  const links = [];
  for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(cyl, bMat); CG.add(b); links.push(b); }
  const link16 = new THREE.Mesh(cyl, pMat); CG.add(link16);
  const tyr = new THREE.Mesh(cyl, tMat); CG.add(tyr);
  const setBond = (b, A, B, r, vis) => {
    b.visible = vis;
    if (!vis) return;
    const d = B.clone().sub(A);
    b.position.copy(A).add(B).multiplyScalar(0.5);
    b.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    b.scale.set(r, d.length(), r);
  };
  // end glows
  const glowI = glowSprite(HEX.end, 2.2), glowO = glowSprite(HEX.end, 2.2);
  CG.add(glowI, glowO);
  // labels
  const lab = (html, pos, cls = 'acc') => { const o = kit.label(html, pos, { cls, parent: CG }); o.element.style.opacity = 0; return o; };
  const Lg = lab('Glycogenin', [-1.4, model.coreR + 1.0, 0], '');
  const Lt = lab('Tyr-194 –OH', [x0 - 0.9, 1.4, 0], 'sm');
  const L16 = lab('α(1→6)', [0, 0, 0], 'sm');
  L16.element.style.color = 'var(--a1)';
  const Lend = lab('non-reducing end', [0, 0, 0], 'sm');
  Lend.element.style.color = 'var(--a2)';
  // HTML caption + counters
  const capT = h('div', { style: 'font-size:38px;font-weight:700;letter-spacing:-.02em' });
  const capS = h('div', { style: 'font-size:25px;color:var(--fg-2);margin-top:6px' });
  el.append(h('div', { style: 'position:absolute;left:0;right:0;top:0;text-align:center;z-index:3;pointer-events:none' }, [capT, capS]));
  const stat = (k, col) => { const v = h('div', { style: `font:720 56px var(--font);letter-spacing:-.03em;line-height:1;color:${col};font-variant-numeric:tabular-nums`, text: '0' }); const w = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, [v, h('div', { style: 'font-size:22px;color:var(--fg-2);font-weight:560', html: k })]); return { v, w }; };
  const sEnd = stat('non-reducing ends', 'var(--a2)'), sBr = stat('α(1→6) branches', 'var(--a1)');
  const stats = h('div', { style: 'position:absolute;left:0;bottom:0;display:flex;gap:44px;z-index:3;pointer-events:none' }, [sEnd.w, sBr.w]);
  el.append(stats);

  const tb = { t: 0 };
  const bez = (S, E, t) => { const Cc = S.clone().add(E).multiplyScalar(0.5).add(new THREE.Vector3(1.6, 3.2, 0)); const u = 1 - t; return S.clone().multiplyScalar(u * u).add(Cc.multiplyScalar(2 * u * t)).add(E.clone().multiplyScalar(t * t)); };
  const layout = () => {
    const t = tb.t;
    beads.forEach((b, i) => {
      b.m.scale.setScalar(Math.max(0.001, b.k.s));
      if (i >= 9) {
        b.m.position.copy(bez(linePos(i), brPos(i), gsap.parseEase('power2.inOut')(t)));
        b.m.material = t > 0.02 && t < 0.98 ? mats.block : mats.neo;
        b.lb.position.set(-0.8 * t, -0.95 * (1 - t) + 0.2 * t, 0);
      }
    });
    beads[gI].m.material = t > 0.98 ? mats.bp : mats.neo;
    const vis = (i) => beads[i].k.s > 0.5;
    for (let i = 0; i < 14; i++) setBond(links[i], beads[i].m.position, beads[i + 1].m.position, 0.1, vis(i) && vis(i + 1) && !(i === 8 && t > 0.02));
    setBond(link16, beads[gI].m.position, beads[9].m.position, 0.15, t > 0.98 && vis(9));
    setBond(tyr, new THREE.Vector3(model.coreR * 0.95, 0, 0), beads[0].m.position, 0.12, vis(0));
    const e1 = t > 0.98 ? 8 : -1;
    let last = -1;
    for (let i = 14; i >= 0; i--) if (vis(i)) { last = i; break; }
    glowO.visible = last >= 0; if (last >= 0) glowO.position.copy(beads[last].m.position);
    glowI.visible = e1 >= 0; if (e1 >= 0) glowI.position.copy(beads[e1].m.position);
    L16.position.copy(beads[gI].m.position).add(new THREE.Vector3(-0.9, 1.0, 0));
    if (last >= 0) Lend.position.copy(beads[last].m.position).add(new THREE.Vector3(-1.6, 1.15, 0));
  };
  kit.onFrame((dt) => { Pt.update(dt); layout(); Pt.group.rotation.y += dt * spin.v; });
  const spin = { v: 0 };
  const camTo = (target, dist, dur = 1.5) => {
    const pos = new THREE.Vector3(...target).add(new THREE.Vector3(0, 0.1, 1).normalize().multiplyScalar(dist));
    gsap.to(kit.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: dur, ease: 'power2.inOut', overwrite: true });
    gsap.to(kit.controls.target, { x: target[0], y: target[1], z: target[2], duration: dur, ease: 'power2.inOut', overwrite: true });
  };
  const CAPS = [
    ['Glycogenin', 'The primer protein · glycogen grows on it'],
    ['Primer on Tyr-194', 'Glycogenin glucosylates itself from UDP-glucose'],
    ['Glycogen synthase', 'Adds glucose to the non-reducing end · α(1→4)'],
    ['Branching enzyme · 4:6 transferase', 'Moves a terminal block → new α(1→6) branch'],
    ['Elongate, branch, repeat', 'Every branch adds a new non-reducing end'],
    ['A glycogen granule', 'Branched tiers around one glycogenin'],
  ];
  const fitTree = frameSphere(kit, model.radius, 0.86, [0, 0, 0], [0, 0.1, 1]).dist;
  let last = -1;
  const apply = (n) => {
    const dur = last < 0 ? 0 : 1;
    const want = (i) => (n >= 4 ? 0 : n >= 2 ? 1 : n === 1 ? (i < 4 ? 1 : 0) : 0);
    beads.forEach((b, i) => {
      gsap.to(b.k, { s: want(i), duration: dur ? 0.45 : 0, delay: dur && n <= 2 && want(i) ? 0.15 + (n === 2 ? (i - 4) : i) * 0.11 : 0, ease: 'back.out(2)', overwrite: true });
      gsap.to(b.lb.element, { opacity: n >= 1 && n <= 3 && want(i) ? 1 : 0, duration: 0.4, delay: dur && want(i) ? 0.3 + i * 0.05 : 0, overwrite: true });
    });
    gsap.to(tb, { t: n >= 3 ? 1 : 0, duration: dur ? 1.8 : 0, delay: n === 3 && dur ? 0.2 : 0, ease: 'none', overwrite: true });
    const ow = { duration: 0.4, overwrite: true };
    gsap.to(Lg.element, { opacity: n <= 1 ? 1 : 0, ...ow });
    gsap.to(Lt.element, { opacity: n === 1 ? 1 : 0, ...ow });
    gsap.to(L16.element, { opacity: n === 3 ? 1 : 0, ...ow, delay: n === 3 && dur ? 1.8 : 0 });
    gsap.to(Lend.element, { opacity: n === 2 ? 1 : 0, ...ow });
    gsap.to([glowI.material, glowO.material], { opacity: n >= 2 && n <= 3 ? 0.9 : 0, ...ow });
    // tree
    if (n >= 4) {
      Pt.setGrowth(n === 4 ? 24 : model.maxDepth + 2, !dur, n === 4 ? 16 : 24);
      spin.v = 0.12;
      camTo([0, 2.2, 0], n === 4 ? fitTree * 0.72 : fitTree, dur ? 2 : 0);
      gsap.to(stats, { opacity: 0, duration: 0.4, overwrite: true });
    } else {
      Pt.setGrowth(0, true);
      spin.v = 0;
      gsap.to(Pt.group.rotation, { y: 0, duration: dur ? 0.8 : 0 });
      if (n === 0) camTo([0.6, 0, 0], 15, dur ? 1.2 : 0);
      else if (n === 1) camTo([2.6, 0.4, 0], 19, dur ? 1.2 : 0);
      else camTo([7.6, 1.5, 0], 35, dur ? 1.4 : 0);
      gsap.to(stats, { opacity: n >= 1 ? 1 : 0, duration: 0.4, overwrite: true });
    }
    const ends = n >= 3 ? 2 : n >= 1 ? 1 : 0, brs = n >= 3 ? 1 : 0;
    countTo(sEnd.v, ends, { from: +sEnd.v.textContent, duration: 0.6 });
    countTo(sBr.v, brs, { from: +sBr.v.textContent, duration: 0.6 });
    capT.innerHTML = CAPS[n][0];
    capS.innerHTML = CAPS[n][1];
    last = n;
  };
  layout();
  const off = onTheme(() => Pt.refreshTheme());
  return kitController(kit, { step: apply, destroy: off });
}

/* ================================================================== */
/* 11 · Glycogenolysis showpiece (2D, stepped)                         */
/* ================================================================== */
function lysisViz(el) {
  const D = diagram(el, 1712, 720);
  const R = 23, SP = 56, Y = 540, X0 = 210, BPI = 4;
  const ang = -Math.PI / 3;
  const mainPos = (k) => [X0 + k * SP, Y];
  const brPos = (m) => [X0 + BPI * SP + (m + 1) * SP * Math.cos(ang), Y + (m + 1) * SP * Math.sin(ang)];
  // glycogenin
  D.layers.nodes.append(s('circle', { cx: 120, cy: Y, r: 44, style: 'fill:color-mix(in oklab, #ffb52e 75%, transparent)' }));
  D.text(120, Y + 82, 'glycogenin', { anchor: 'middle', cls: 'sm', style: 'font-size:22px;fill:var(--fg-3)' });
  // connectors
  const cMain = s('path', { style: 'fill:none;stroke:var(--line-2);stroke-width:5;stroke-linecap:round' });
  const cBr = s('path', { style: 'fill:none;stroke:var(--line-2);stroke-width:5;stroke-linecap:round' });
  const c16 = s('path', { style: `fill:none;stroke:${B16};stroke-width:6;stroke-linecap:round` });
  D.layers.edges.append(cMain, cBr, c16);
  const mainCol = 'color-mix(in oklab, var(--elec) 80%, var(--bg))';
  const brCol = 'color-mix(in oklab, var(--a2) 85%, var(--bg))';
  const M = Array.from({ length: 12 }, (_, k) => ({ ...bead(D.layers.nodes, ...mainPos(k), R, mainCol), k, home: mainPos(k), kind: 'm' }));
  const Bb = Array.from({ length: 6 }, (_, m) => ({ ...bead(D.layers.nodes, ...brPos(m), R, brCol), m, home: brPos(m), kind: 'b' }));
  [...M, ...Bb].forEach((b) => { b.p = { x: b.home[0], y: b.home[1], t: 0 }; });
  const setPos = (b) => { b.g.setAttribute('transform', `translate(${b.p.x} ${b.p.y})`); b.tag.style.opacity = b.p.t; };
  // the branch-point bead gets a pink ring
  M[BPI].g.querySelector('circle').style.stroke = B16;
  M[BPI].g.querySelector('circle').style.strokeWidth = 5;
  // product trays
  D.region({ x: 1060, y: 170, w: 640, h: 470, r: 36, label: 'Products', fill: 'var(--surface)' });
  D.text(1100, 270, 'Glucose-1-P', { style: `font-size:28px;font-weight:650;fill:${P}` });
  D.text(1100, 460, 'Free glucose', { style: 'font-size:28px;font-weight:650;fill:var(--elec)' });
  const g1pN = D.text(1660, 270, '0', { anchor: 'end', style: `font-size:44px;font-weight:720;fill:${P}` });
  const glcN = D.text(1660, 460, '0', { anchor: 'end', style: 'font-size:44px;font-weight:720;fill:var(--elec)' });
  const ratio = D.text(1380, 610, 'G1P : glucose ≈ 8 : 1', { anchor: 'middle', style: 'font-size:34px;font-weight:720;fill:var(--ink);opacity:0', tip: { title: 'Ratio ≈ 8 : 1', body: 'Repeating steps 1–3 over the whole molecule releases glucose-1-P (phosphorolysis) and free glucose (α-1,6 hydrolysis) in a ratio of about <b>8 : 1</b>.', src: SRC(16) } });
  const g1pSlot = (k) => [1120 + k * 70, 340];
  const glcSlot = [1120, 530];
  // stepper
  const STEPS = [
    { t: 'Glycogen phosphorylase', d: 'P_{i} + PLP · releases glucose-1-P', col: P },
    { t: 'Glucan transferase (4:4)', d: 'moves 3 residues to another end', col: 'var(--a2)' },
    { t: 'α-1,6-glucosidase', d: 'H_{2}O · releases 1 free glucose', col: 'var(--elec)' },
    { t: 'Repeat 1 → 2 → 3', d: 'until the granule shrinks', col: 'var(--ink)' },
  ];
  const stepEls = STEPS.map((st, i) => {
    const x = 40 + i * 420;
    const g = s('g', { style: 'opacity:.3' });
    const c = s('circle', { cx: x + 24, cy: 46, r: 24, style: `fill:none;stroke:${st.col};stroke-width:3` });
    const n = s('text', { x: x + 24, y: 55, 'text-anchor': 'middle', class: 'v-label', style: `font-size:26px;font-weight:700;fill:${st.col}` });
    n.textContent = i + 1;
    const t = s('text', { x: x + 62, y: 46, class: 'v-label', style: 'font-size:27px;font-weight:650' });
    t.textContent = st.t;
    const d = s('text', { x: x + 62, y: 80, class: 'v-label sm', style: 'font-size:22px;fill:var(--fg-2)' });
    setRich(d, st.d);
    g.append(c, n, t, d);
    D.layers.labels.append(g);
    return g;
  });
  const debr = s('g', { style: 'opacity:.3' });
  debr.append(s('path', { d: 'M460,104 L460,116 L1240,116 L1240,104', style: 'fill:none;stroke:var(--fg-3);stroke-width:2.5' }));
  const dt = s('text', { x: 850, y: 146, 'text-anchor': 'middle', class: 'v-label sm', style: 'font-size:22px;fill:var(--fg-2);letter-spacing:.12em;text-transform:uppercase;font-weight:650' });
  dt.textContent = 'Debranching enzyme (bifunctional)';
  debr.append(dt);
  D.layers.labels.append(debr);
  // limit dextrin annotations
  const ld = s('g', { style: 'opacity:0' });
  const brk = (x1, y1, x2, y2, label, lx, ly) => {
    ld.append(s('path', { d: `M${x1},${y1} L${x2},${y2}`, style: 'fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round' }));
    const t = s('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--ink);font-weight:700' });
    t.textContent = label;
    ld.append(t);
  };
  brk(mainPos(5)[0] - 20, Y + 44, mainPos(8)[0] + 20, Y + 44, '4 residues', (mainPos(5)[0] + mainPos(8)[0]) / 2, Y + 78);
  const b0 = brPos(0), b3 = brPos(3);
  brk(b0[0] - 40, b0[1] - 20, b3[0] - 40, b3[1] - 20, '4', (b0[0] + b3[0]) / 2 - 70, (b0[1] + b3[1]) / 2 - 18);
  const ldT = s('text', { x: 300, y: 300, 'text-anchor': 'middle', class: 'v-label lg', style: 'fill:var(--ink)' });
  ldT.textContent = 'Limit dextrin';
  ld.append(ldT);
  D.layers.labels.append(ld);
  const h2o = D.badge(brPos(0)[0] - 90, brPos(0)[1] - 10, 'H_{2}O', { color: 'var(--elec)', size: 24 });
  h2o.style.opacity = 0;

  // targets per build
  const target = (n) => {
    const T = new Map();
    [...M, ...Bb].forEach((b) => T.set(b, { x: b.home[0], y: b.home[1], t: 0, o: 1 }));
    let g1p = 0, glc = 0;
    if (n >= 1) { [11, 10, 9].forEach((k) => T.set(M[k], { x: g1pSlot(g1p)[0], y: g1pSlot(g1p++)[1], t: 1, o: 1 })); [5, 4].forEach((m) => T.set(Bb[m], { x: g1pSlot(g1p)[0], y: g1pSlot(g1p++)[1], t: 1, o: 1 })); }
    if (n >= 2) [1, 2, 3].forEach((m) => { const p = mainPos(8 + m); T.set(Bb[m], { x: p[0], y: p[1], t: 0, o: 1 }); });
    if (n >= 3) { T.set(Bb[0], { x: glcSlot[0], y: glcSlot[1], t: 0, o: 1 }); glc = 1; }
    if (n >= 4) [3, 2, 1].forEach((m) => T.set(Bb[m], { x: g1pSlot(g1p)[0], y: g1pSlot(g1p++)[1], t: 1, o: 1 }));
    return { T, g1p, glc };
  };
  const redraw = () => {
    const inChain = (b) => b.p.x < 1000;
    const mainSeq = [...M, ...Bb.slice(1)].filter((b) => inChain(b) && Math.abs(b.p.y - Y) < 2).sort((a, b) => a.p.x - b.p.x);
    let d = `M164,${Y}`;
    mainSeq.forEach((b, i) => { if (i === 0 || Math.abs(b.p.x - mainSeq[i - 1].p.x - SP) < 3) d += ` L${b.p.x},${b.p.y}`; });
    cMain.setAttribute('d', d);
    const brSeq = Bb.filter((b) => inChain(b) && Math.abs(b.p.y - Y) >= 2 && Math.abs(b.p.x - b.home[0]) < 1 && Math.abs(b.p.y - b.home[1]) < 1);
    cBr.setAttribute('d', brSeq.length > 1 ? `M${brSeq.map((b) => `${b.p.x},${b.p.y}`).join(' L')}` : '');
    const b0in = inChain(Bb[0]) && Math.abs(Bb[0].p.x - Bb[0].home[0]) < 1;
    c16.setAttribute('d', b0in ? `M${M[BPI].p.x},${M[BPI].p.y} L${Bb[0].p.x},${Bb[0].p.y}` : '');
  };
  [...M, ...Bb].forEach(setPos);
  redraw();
  let last = -1;
  const apply = (n) => {
    const { T, g1p, glc } = target(n);
    const dur = last < 0 ? 0 : 1.1;
    let k = 0;
    T.forEach((tg, b) => {
      const moving = Math.abs(tg.x - b.p.x) > 1 || Math.abs(tg.y - b.p.y) > 1;
      gsap.to(b.p, { x: tg.x, y: tg.y, t: tg.t, duration: dur, delay: dur && moving ? (k++) * 0.12 : 0, ease: 'power2.inOut', overwrite: true, onUpdate: () => { setPos(b); redraw(); } });
    });
    if (!dur) { [...M, ...Bb].forEach((b) => { const tg = T.get(b); Object.assign(b.p, { x: tg.x, y: tg.y, t: tg.t }); setPos(b); }); redraw(); }
    const ow = { overwrite: true };
    stepEls.forEach((g, i) => gsap.to(g, { opacity: i === n - 1 ? 1 : n === 0 ? 0.55 : 0.28, duration: 0.4, ...ow }));
    gsap.to(debr, { opacity: n === 2 || n === 3 ? 1 : 0.3, duration: 0.4, ...ow });
    gsap.to(ld, { opacity: n === 1 ? 1 : 0, duration: 0.5, delay: n === 1 && dur ? 1.2 : 0, ...ow });
    gsap.to(h2o, { opacity: n === 3 ? 1 : 0, duration: 0.4, ...ow });
    gsap.to(ratio, { opacity: n >= 4 ? 1 : 0, duration: 0.5, delay: n >= 4 && dur ? 1.4 : 0, ...ow });
    countTo(g1pN, g1p, { from: +g1pN.textContent, duration: 0.8 });
    countTo(glcN, glc, { from: +glcN.textContent, duration: 0.8 });
    last = n;
  };
  return { step: apply, destroy: () => { [...M, ...Bb].forEach((b) => gsap.killTweensOf(b.p)); D.destroy(); } };
}

/* ================================================================== */
/* 12 · Fate of the products: liver vs muscle + lysosomal route        */
/* ================================================================== */
function fateViz(el) {
  const D = diagram(el, 1712, 720);
  const regL = D.region({ x: 990, y: 20, w: 722, h: 270, r: 36, label: 'Liver', labelColor: 'var(--a1)', fill: 'color-mix(in oklab, var(--a1) 6%, transparent)' });
  const regM = D.region({ x: 990, y: 330, w: 722, h: 240, r: 36, label: 'Muscle', labelColor: 'var(--elec)', fill: 'color-mix(in oklab, var(--elec) 6%, transparent)' });
  const nd = (id, x, y, label, col, tp, o = {}) => D.node({ id, x, y, label, kind: 'mol', size: o.size ?? 30, color: col, tip: tp });
  nd('gly', 110, 300, 'Glycogen', 'var(--a1)', { title: 'Glycogen', body: 'Phosphorylase + debranching enzyme release glucose-1-P and a little free glucose (≈ 8 : 1).', src: SRC(16) });
  nd('g1p', 480, 300, 'Glucose-1-P', P, { title: 'Glucose-1-phosphate', body: 'Main product of phosphorolysis.', src: SRC('15, 16') });
  nd('g6p', 850, 300, 'Glucose-6-P', P, { title: 'Glucose-6-phosphate', body: 'The branch point between liver and muscle fates.', src: SRC('15, 16') });
  const a1 = D.arrow({ from: 'gly', to: 'g1p', color: 'var(--fg-3)', width: 5, label: 'Phosphorylase', labelSide: -1, labelOffset: 36, labelColor: 'var(--ink)' });
  D.badge(295, 352, 'P_{i}', { color: P, size: 22 });
  const a2 = D.arrow({ from: [610, 288], to: [722, 288], color: 'var(--fg-3)', width: 4, headSize: 14 });
  D.arrow({ from: [722, 314], to: [610, 314], color: 'var(--fg-3)', width: 4, headSize: 14 });
  D.text(666, 246, 'Phosphoglucomutase', { anchor: 'middle', cls: 'sm', style: 'font-size:22px;fill:var(--ink);font-weight:600' });
  // liver lane
  const g6pase = D.node({ id: 'gpase', x: 1130, y: 160, label: 'Glucose-6-\nphosphatase', kind: 'enz', size: 24, color: 'var(--a1)', tip: { title: 'Glucose-6-phosphatase', body: 'G6P + H₂O → glucose + Pᵢ. Present in liver — so liver can release free glucose. Deficient in von Gierke disease.', list: ['Textbook: absent from muscle'], src: `${SRC('15, 16, 20')} · ${LIP}` } });
  nd('glc', 1370, 160, 'Glucose', 'var(--elec)', { title: 'Free glucose (liver)', body: 'Exported to the blood to maintain blood glucose.', src: SRC('4, 15, 16') });
  D.node({ id: 'blood', x: 1605, y: 160, label: 'Blood', kind: 'box', w: 170, h: 84, size: 30, color: 'var(--inh)', fill: 'color-mix(in oklab, var(--inh) 14%, var(--bg))' });
  const aL = D.arrow({ from: 'g6p', to: 'gpase', curve: 40, color: 'var(--a1)', width: 5 });
  const aL2 = D.arrow({ from: 'gpase', to: 'glc', color: 'var(--a1)', width: 5 });
  const aB = D.arrow({ from: 'glc', to: 'blood', color: 'var(--inh)', width: 5 });
  // muscle lane
  nd('glys', 1240, 460, 'Glycolysis', 'var(--atp)', { title: 'Glycolysis (muscle)', body: 'Muscle uses glucose-6-P for its own energy.', src: SRC(16) });
  const aM = D.arrow({ from: 'g6p', to: 'glys', curve: -40, color: 'var(--atp)', width: 5 });
  const noX = D.badge(1545, 460, '✕ no glucose-6-phosphatase', { color: 'var(--inh)', size: 22, w: 310, tip: { title: 'Muscle keeps its glucose-6-P', body: 'No free glucose is released from muscle glycogen to blood.', src: `${SRC(4)} · ${LIP}` } });
  // free glucose and lysosome
  nd('free', 480, 480, 'Free glucose', 'var(--elec)', { title: 'Free glucose from debranching', body: 'α-1,6-glucosidase hydrolyses the last residue at each branch → a small amount of free glucose (G1P : glucose ≈ 8 : 1).', src: SRC(16) }, { size: 26 });
  const aF = D.arrow({ from: [170, 340], to: [380, 466], curve: 30, color: 'var(--elec)', width: 3.5, dash: '10 9' });
  const lys = s('g');
  lys.append(s('circle', { cx: 300, cy: 640, r: 70, style: 'fill:color-mix(in oklab, var(--a2) 12%, transparent);stroke:color-mix(in oklab, var(--a2) 55%, transparent);stroke-width:3' }));
  const lt = s('text', { x: 300, y: 648, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--a2);font-weight:700' });
  lt.textContent = 'Lysosome';
  lys.append(lt);
  lys.setAttribute('data-tip', JSON.stringify({ title: 'Lysosomal route', body: '<b>Lysosomal α(1→4)-glucosidase</b> hydrolyses glycogen to free glucose (+ H₂O). A minor route — its deficiency is Pompe disease (type II).', src: SRC('16, 21') }));
  D.layers.nodes.append(lys);
  const aLy = D.arrow({ from: [100, 345], to: [240, 600], curve: 40, color: 'var(--a2)', width: 4 });
  const lyT = D.text(390, 650, 'α(1→4)-glucosidase → glucose', { cls: 'sm', style: 'fill:var(--a2);font-weight:650' });
  const fl = {
    main: [D.flow(a1, { count: 3, color: P, speed: 130, r: 9 }), D.flow(a2, { count: 2, color: P, speed: 100, r: 8 })],
    L: [D.flow(aL, { count: 3, color: P, speed: 130, r: 9, autoplay: false }), D.flow(aL2, { count: 2, color: 'var(--elec)', speed: 90, r: 9, autoplay: false }), D.flow(aB, { count: 2, color: 'var(--elec)', speed: 110, r: 9, autoplay: false })],
    M: [D.flow(aM, { count: 3, color: 'var(--atp)', speed: 130, r: 9, autoplay: false })],
    Y: [D.flow(aLy, { count: 2, color: 'var(--a2)', speed: 90, r: 8, autoplay: false })],
  };
  const liverEls = [aL.g, aL2.g, g6pase.g, D.nodes.glc.g, aB.g, D.nodes.blood.g, regL];
  const muscleEls = [aM.g, D.nodes.glys.g, noX, regM];
  const lysEls = [lys, aLy.g, lyT];
  const set = (n) => {
    gsap.to(liverEls, { opacity: n === 0 || n === 1 ? 1 : 0.2, duration: 0.5 });
    gsap.to(muscleEls, { opacity: n === 0 || n === 2 ? 1 : 0.2, duration: 0.5 });
    gsap.to(lysEls, { opacity: n === 3 ? 1 : n === 0 ? 0.6 : 0.2, duration: 0.5 });
    gsap.to([aF.g, D.nodes.free.g], { opacity: n === 3 ? 0.25 : 1, duration: 0.5 });
    fl.L.forEach((f) => (n === 1 || n === 0 ? f.play() : f.hide()));
    fl.M.forEach((f) => (n === 2 || n === 0 ? f.play() : f.hide()));
    fl.Y.forEach((f) => (n === 3 ? f.play() : f.hide()));
  };
  return { step: set, leave: () => D.pauseAll(), destroy: () => D.destroy() };
}

/* ================================================================== */
/* 13 · One phosphate, two switches                                    */
/* ================================================================== */
function switchViz(el) {
  const D = diagram(el, 960, 860);
  const enzyme = (y, name, col) => {
    const g = s('g', { transform: `translate(470 ${y})` });
    const body = s('g');
    const b1 = s('ellipse', { cx: -58, cy: 0, rx: 92, ry: 80, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:3;transition:all .5s' });
    const b2 = s('ellipse', { cx: 58, cy: 0, rx: 92, ry: 80, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:3;transition:all .5s' });
    body.append(b1, b2);
    const t = s('text', { y: 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:30px;font-weight:700;paint-order:stroke;stroke:var(--bg);stroke-width:7px;stroke-linejoin:round' });
    t.textContent = name;
    const ptag = s('g', { transform: 'translate(118 -78)', style: 'opacity:0' });
    ptag.append(s('circle', { r: 30, style: `fill:${P}` }));
    const pt = s('text', { y: 11, 'text-anchor': 'middle', style: 'font:800 32px var(--font);fill:#1d1d1f' });
    pt.textContent = 'P';
    ptag.append(pt);
    const state = s('text', { y: 130, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:34px;font-weight:700' });
    g.append(body, t, ptag, state);
    D.layers.nodes.append(g);
    return { g, b1, b2, ptag, state, col };
  };
  const ph = enzyme(220, 'Phosphorylase', 'var(--act)');
  const sy = enzyme(600, 'Synthase', 'var(--act)');
  D.text(470, 60, 'GLYCOGEN PHOSPHORYLASE', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--fg-3)' });
  D.text(470, 440, 'GLYCOGEN SYNTHASE', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--fg-3)' });
  const out1 = D.badge(820, 220, '', { color: 'var(--act)', size: 26, w: 230 });
  const out2 = D.badge(820, 600, '', { color: 'var(--act)', size: 26, w: 230 });
  const kin1 = D.text(10, 228, 'Phosphorylase kinase', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-2)', tip: { title: 'Phosphorylase kinase', body: 'Activated by PKA; phosphorylates phosphorylase b → a.', src: SRC(17) } });
  const kin2 = D.text(10, 608, 'Protein kinase A', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-2)', tip: { title: 'cAMP-dependent protein kinase', body: 'Phosphorylates glycogen synthase a → b directly.', src: SRC(12) } });
  const kA = [D.arrow({ from: [240, 220], to: [306, 220], color: 'var(--fg-3)', width: 3, headSize: 12 }), D.arrow({ from: [200, 600], to: [306, 600], color: 'var(--fg-3)', width: 3, headSize: 12 })];
  [kin1, kin2].forEach((k) => (k.style.opacity = 0));
  const fly = [0, 1].map(() => s('circle', { cx: 250, cy: 0, r: 16, style: `fill:${P};opacity:0` }));
  fly.forEach((c) => D.layers.fx.append(c));
  const set = (on, animate = true) => {
    const items = [
      [ph, on, on ? 'a · active' : 'b · inactive', on ? 'Breakdown ON' : 'Breakdown OFF', out1, 160],
      [sy, !on, on ? 'b · inactive' : 'a · active', on ? 'Synthesis OFF' : 'Synthesis ON', out2, 540],
    ];
    items.forEach(([e, act, st, outT, badge, ky], i) => {
      const col = act ? 'var(--act)' : 'var(--fg-3)';
      [e.b1, e.b2].forEach((b) => { b.style.fill = act ? 'color-mix(in oklab, var(--act) 20%, var(--bg))' : 'var(--surface-2)'; b.style.stroke = act ? 'var(--act)' : 'var(--line-2)'; });
      gsap.to(e.b1, { attr: { cx: act ? -58 : -48 }, duration: 0.6 });
      gsap.to(e.b2, { attr: { cx: act ? 58 : 48 }, duration: 0.6 });
      e.state.textContent = st;
      e.state.style.fill = col;
      gsap.to(e.ptag, { opacity: on ? 1 : 0, scale: on ? 1 : 0.4, svgOrigin: '0 0', duration: 0.5, delay: on && animate ? 0.6 : 0 });
      const bt = badge.querySelector('text');
      bt.textContent = outT;
      const bc = act ? 'var(--act)' : 'var(--inh)';
      bt.style.fill = bc;
      badge.querySelector('rect').style.fill = `color-mix(in oklab, ${bc} 16%, transparent)`;
      badge.querySelector('rect').style.stroke = `color-mix(in oklab, ${bc} 55%, transparent)`;
      if (on && animate) gsap.fromTo(fly[i], { attr: { cx: 250, cy: ky + 60 }, opacity: 1 }, { attr: { cx: 588, cy: ky - 18 }, opacity: 0, duration: 0.7, ease: 'power2.in' });
    });
    gsap.to([kin1, kin2, ...kA.map((a) => a.g)], { opacity: on ? 1 : 0.35, duration: 0.4 });
  };
  const sg = seg({ options: [{ v: false, t: 'Dephosphorylated' }, { v: true, t: 'Phosphorylated' }], value: false, onChange: (v) => set(v) });
  ctrlBar(el, [sg], { left: 0, bottom: 0 });
  set(false, false);
  return { step: (n) => sg.set(n >= 1), destroy: () => D.destroy() };
}

/* ================================================================== */
/* 14 · Hormone cascade with amplification                             */
/* ================================================================== */
function cascadeViz(el) {
  const D = diagram(el, 1712, 720);
  const MY = 320;
  D.layers.regions.append(s('path', { d: `M380,${MY - 22} L1070,${MY - 120} L1070,${MY + 120} L380,${MY + 22} Z`, style: 'fill:color-mix(in oklab, var(--a1) 8%, transparent);stroke:none' }));
  const ampT = D.text(700, MY - 150, 'Amplification · each tier activates many molecules (schematic)', { anchor: 'middle', cls: 'sm', style: 'font-size:22px;fill:var(--fg-3)' });
  D.layers.regions.append(s('rect', { x: 332, y: 80, width: 44, height: 470, rx: 22, style: 'fill:color-mix(in oklab, var(--prot) 16%, transparent);stroke:color-mix(in oklab, var(--prot) 45%, transparent);stroke-width:2' }));
  D.text(354, 60, 'MEMBRANE', { anchor: 'middle', cls: 'sm', style: 'font-size:20px;letter-spacing:.14em;font-weight:700;fill:var(--prot)' });
  const hT = (t, b) => ({ kicker: 'Hormone', title: t, body: b, src: SRC('12, 17') });
  const glg = D.node({ id: 'glg', x: 96, y: 210, label: 'Glucagon', sub: 'liver', kind: 'box', w: 200, h: 100, size: 30, color: 'var(--a1)', fill: 'color-mix(in oklab, var(--a1) 14%, var(--bg))', tip: hT('Glucagon', 'Acts on the <b>liver</b> (fasting signal).') });
  const epi = D.node({ id: 'epi', x: 96, y: 430, label: 'Epinephrine', sub: 'muscle · liver', kind: 'box', w: 200, h: 100, size: 28, color: 'var(--a1)', fill: 'color-mix(in oklab, var(--a1) 14%, var(--bg))', tip: hT('Epinephrine', 'Acts on <b>muscle and liver</b>.') });
  const rec = D.node({ id: 'rec', x: 354, y: MY, label: 'Receptor', kind: 'enz', size: 24, color: 'var(--prot)', tip: { title: 'Receptor', body: 'Hormone binding on the cell surface. <span style="color:var(--fg-3)">Receptor and G-protein are textbook detail; the slide starts at adenylate cyclase.</span>', src: LIP } });
  const gp = D.node({ id: 'gp', x: 524, y: MY, label: 'G-protein', kind: 'enz', size: 24, color: 'var(--fg-2)', tip: { title: 'G-protein (Gs)', body: 'Couples the receptor to adenylate cyclase.', src: `${LIP} (textbook)` } });
  const ac = D.node({ id: 'ac', x: 696, y: MY, label: 'Adenylate\ncyclase', kind: 'enz', size: 24, color: 'var(--elec)', tip: { title: 'Adenylate cyclase', body: 'Inactive → active. Converts ATP → cAMP.', src: SRC('12, 17') } });
  const camp = D.node({ id: 'camp', x: 866, y: MY, label: 'cAMP', kind: 'mol', size: 30, color: 'var(--elec)', tip: { title: 'cAMP', body: 'Second messenger. Insulin lowers it by activating phosphodiesterase (cAMP → 5′-AMP, inactive).', src: SRC('12, 17') } });
  const atp = D.badge(778, 228, 'ATP', { color: 'var(--atp)', size: 22 });
  const atpA = D.arrow({ from: [796, 246], to: [834, 282], color: 'var(--atp)', width: 3, headSize: 11 });
  const pka = D.node({ id: 'pka', x: 1040, y: MY, label: 'Protein\nkinase A', kind: 'enz', size: 24, color: 'var(--elec)', tip: { title: 'cAMP-dependent protein kinase (PKA)', body: 'Inactive → active when cAMP binds. Phosphorylates phosphorylase kinase and glycogen synthase.', src: SRC('12, 17') } });
  const phk = D.node({ id: 'phk', x: 1210, y: 150, label: 'Phosphorylase\nkinase', kind: 'enz', size: 24, color: 'var(--elec)', tip: { title: 'Phosphorylase kinase', body: 'Inactive → active (phosphorylated by PKA). It phosphorylates glycogen phosphorylase b → a.', list: ['The slide places it beside the b → a arrow without connecting them — the link is drawn here'], src: SRC(17) } });
  const phos = D.node({ id: 'phos', x: 1490, y: 150, label: 'Phosphorylase', kind: 'box', w: 250, h: 84, size: 30, color: 'var(--act)', fill: 'color-mix(in oklab, var(--act) 10%, var(--bg))', tip: { title: 'Glycogen phosphorylase', body: '<b>b</b> = dephosphorylated, inactive · <b>a</b> = phosphorylated, active.', src: SRC(17) } });
  const syn = D.node({ id: 'syn', x: 1380, y: 540, label: 'Glycogen synthase', kind: 'box', w: 300, h: 84, size: 30, color: 'var(--inh)', fill: 'color-mix(in oklab, var(--inh) 10%, var(--bg))', tip: { title: 'Glycogen synthase', body: '<b>a</b> = dephosphorylated, active · <b>b</b> = phosphorylated, inactive. Rate-limiting enzyme of glycogenesis.', src: SRC('11, 12') } });
  const phosSt = D.text(1490, 228, '', { anchor: 'middle', cls: 'sm', style: 'font-weight:650' });
  const synSt = D.text(1380, 618, '', { anchor: 'middle', cls: 'sm', style: 'font-weight:650' });
  const outL = D.text(1490, 60, '', { anchor: 'middle', style: 'font-size:30px;font-weight:720' });
  const outS = D.text(1380, 678, '', { anchor: 'middle', style: 'font-size:30px;font-weight:720' });
  const ptag = (x, y) => { const g = s('g', { transform: `translate(${x} ${y})`, style: 'opacity:0' }); g.append(s('circle', { r: 20, style: `fill:${P}` })); const t = s('text', { y: 8, 'text-anchor': 'middle', style: 'font:800 22px var(--font);fill:#1d1d1f' }); t.textContent = 'P'; g.append(t); D.layers.labels.append(g); return g; };
  const pPhos = ptag(1610, 112), pSyn = ptag(1525, 502);
  const g1p = D.badge(1660, 290, 'G1P', { color: P, size: 24 });
  // insulin arm
  const ins = D.node({ id: 'ins', x: 620, y: 600, label: 'Insulin', kind: 'box', w: 180, h: 84, size: 30, color: 'var(--act)', fill: 'color-mix(in oklab, var(--act) 14%, var(--bg))', tip: { title: 'Insulin', body: 'Activates <b>phosphodiesterase</b>: cAMP → 5′-AMP (inactive). Stimulates glycogenesis, inhibits glycogenolysis.', src: SRC('12, 17') } });
  const pde = D.node({ id: 'pde', x: 870, y: 600, label: 'Phosphodiesterase', kind: 'enz', size: 24, color: 'var(--act)', tip: { title: 'Phosphodiesterase', body: 'cAMP → 5′-AMP (inactive), switching the cascade off.', src: SRC('12, 17') } });
  const amp5 = D.badge(1100, 600, '5′-AMP', { color: 'var(--fg-3)', size: 22, w: 120 });
  const pp1 = D.node({ id: 'pp1', x: 1620, y: 360, label: 'PP-1', kind: 'enz', size: 24, color: 'var(--act)', tip: { kicker: 'Textbook (Lippincott)', title: 'Protein phosphatase-1', body: 'Insulin also activates PP-1, which removes the phosphates: phosphorylase a → b (off), synthase b → a (on). Not shown on the lecture slides.', src: LIP } });
  // arrows
  const A = (from, to, o = {}) => D.arrow({ from, to, color: 'var(--fg-3)', width: 4, ...o });
  const aG = A('glg', 'rec'), aE = A('epi', 'rec');
  const chain = [A('rec', 'gp'), A('gp', 'ac'), A('ac', 'camp'), A('camp', 'pka'), A('pka', 'phk', { curve: 40 }), A('phk', 'phos'), A('phos', [1660, 266], { curve: -30 })];
  const aSyn = A('pka', 'syn', { curve: -60, color: 'var(--inh)' });
  const aIns = A('ins', 'pde', { color: 'var(--act)' });
  const aPde = A('camp', 'pde', { color: 'var(--act)', dash: '8 8' });
  const aAmp = A('pde', [1036, 600], { color: 'var(--act)' });
  const pp1a = [A('pp1', [1560, 196], { color: 'var(--act)', dash: '6 8', width: 3 }), A('pp1', [1450, 498], { color: 'var(--act)', dash: '6 8', width: 3 })];
  const counts = [2, 3, 4, 6, 8, 10, 14];
  const fl = chain.map((a, i) => D.flow(a, { count: counts[i], color: i < 4 ? 'var(--elec)' : i < 6 ? 'var(--a1)' : P, speed: 120, r: Math.max(5, 10 - i), autoplay: false }));
  const fH = [D.flow(aG, { count: 1, color: 'var(--a1)', speed: 90, r: 11, autoplay: false }), D.flow(aE, { count: 1, color: 'var(--a1)', speed: 90, r: 11, autoplay: false })];
  const fS = D.flow(aSyn, { count: 8, color: 'var(--inh)', speed: 120, r: 6, autoplay: false });
  const fI = [D.flow(aIns, { count: 2, color: 'var(--act)', speed: 110, r: 9, autoplay: false }), D.flow(aPde, { count: 3, color: 'var(--elec)', speed: 90, r: 8, autoplay: false }), D.flow(aAmp, { count: 2, color: 'var(--fg-3)', speed: 90, r: 7, autoplay: false })];
  let level = 0, insulin = false, tissue = 'liver';
  const render = () => {
    const muscle = tissue === 'muscle';
    const lit = (on) => (on ? 1 : 0.18);
    gsap.to(glg.g, { opacity: muscle ? 0.18 : 1, duration: 0.4 });
    gsap.to(aG.g, { opacity: muscle ? 0.08 : level >= 1 ? 1 : 0.3, duration: 0.4 });
    gsap.to(aE.g, { opacity: level >= 1 ? 1 : 0.3, duration: 0.4 });
    const on1 = level >= 1 && !insulin, on2 = level >= 2 && !insulin, on3 = level >= 3 && !insulin;
    [rec.g, gp.g, ac.g, chain[0].g, chain[1].g, chain[2].g, atp, atpA.g].forEach((e) => gsap.to(e, { opacity: lit(level >= 1), duration: 0.4 }));
    gsap.to(camp.g, { opacity: insulin ? 0.35 : lit(level >= 1), duration: 0.4 });
    [chain[3].g, pka.g, chain[4].g, phk.g, chain[5].g, phos.g, chain[6].g, g1p].forEach((e) => gsap.to(e, { opacity: lit(level >= 2) * (insulin && e !== phos.g ? 0.5 : 1), duration: 0.4 }));
    [aSyn.g, syn.g].forEach((e) => gsap.to(e, { opacity: lit(level >= 3) * (insulin && e === aSyn.g ? 0.5 : 1), duration: 0.4 }));
    [ins.g, pde.g, amp5, aIns.g, aPde.g, aAmp.g, pp1.g, ...pp1a.map((a) => a.g)].forEach((e) => gsap.to(e, { opacity: insulin ? 1 : 0.12, duration: 0.4 }));
    gsap.to(ampT, { opacity: on2 ? 1 : 0.3, duration: 0.4 });
    fH[0][on1 && !muscle ? 'play' : 'hide']();
    fH[1][on1 ? 'play' : 'hide']();
    fl.forEach((f, i) => ((i < 3 ? on1 : on2) ? f.play() : f.hide()));
    fl[3][on2 ? 'play' : 'hide']();
    on3 ? fS.play() : fS.hide();
    fI.forEach((f) => (insulin ? f.play() : f.hide()));
    // enzyme states
    const phosA = on2, synB = on3;
    gsap.to(pPhos, { opacity: phosA ? 1 : 0, duration: 0.4 });
    gsap.to(pSyn, { opacity: synB ? 1 : 0, duration: 0.4 });
    phosSt.textContent = level >= 2 ? (phosA ? 'b → a · active' : 'b · inactive') : '';
    phosSt.style.fill = phosA ? 'var(--act)' : 'var(--fg-2)';
    synSt.textContent = level >= 3 ? (synB ? 'a → b · inactive' : 'a · active') : '';
    synSt.style.fill = synB ? 'var(--inh)' : 'var(--act)';
    phos.shape.style.stroke = phosA ? 'var(--act)' : 'var(--line-2)';
    syn.shape.style.stroke = synB ? 'var(--inh)' : level >= 3 ? 'var(--act)' : 'var(--line-2)';
    outL.textContent = level >= 2 ? (phosA ? 'Glycogenolysis ON' : 'Glycogenolysis OFF') : '';
    outL.style.fill = phosA ? 'var(--act)' : 'var(--inh)';
    outS.textContent = level >= 3 ? (synB ? 'Glycogenesis OFF' : 'Glycogenesis ON') : '';
    outS.style.fill = synB ? 'var(--inh)' : 'var(--act)';
  };
  const sT = seg({ options: [{ v: 'liver', t: 'Liver' }, { v: 'muscle', t: 'Muscle' }], value: 'liver', onChange: (v) => { tissue = v; render(); } });
  const tI = toggle({ label: 'Insulin', on: false, onChange: (v) => { insulin = v; if (v && level < 3) level = 3; render(); } });
  tip(sT.el, { title: 'Which hormone?', body: 'Glucagon acts in <b>liver</b>; epinephrine in <b>muscle and liver</b>.', src: SRC('12, 17') });
  ctrlBar(el, [sT, tI], { left: 0, bottom: 0 });
  render();
  return {
    step(n) { level = Math.min(3, n); insulin = n >= 4; tI.set(insulin, false); render(); },
    leave: () => D.pauseAll(),
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* 15 · Allosteric control panel                                       */
/* ================================================================== */
function allostericViz(el) {
  const D = diagram(el, 1712, 720);
  const CX = 900;
  D.node({ id: 'gly', x: CX, y: 90, label: 'Glycogen', kind: 'mol', size: 34, color: 'var(--a1)' });
  D.node({ id: 'g1p', x: CX, y: 630, label: 'Glucose-1-phosphate', kind: 'mol', size: 30, color: P });
  const left = D.arrow({ d: `M${CX - 110},120 C${CX - 380},170 ${CX - 380},560 ${CX - 140},604`, from: [CX - 110, 120], to: [CX - 140, 604], color: 'var(--fg-3)', width: 6 });
  const right = D.arrow({ d: `M${CX + 140},604 C${CX + 380},560 ${CX + 380},170 ${CX + 110},120`, from: [CX + 140, 604], to: [CX + 110, 120], color: 'var(--fg-3)', width: 6 });
  const phos = D.node({ id: 'phos', x: CX - 300, y: 360, label: 'Glycogen\nphosphorylase', kind: 'box', w: 270, h: 110, size: 30, fill: 'var(--bg)', tip: { title: 'Glycogen phosphorylase', body: 'Inhibited by glucose-6-P and ATP; activated by Ca²⁺ and AMP.', src: SRC(18) } });
  const syn = D.node({ id: 'syn', x: CX + 300, y: 360, label: 'Glycogen\nsynthase', kind: 'box', w: 250, h: 110, size: 30, fill: 'var(--bg)', tip: { title: 'Glycogen synthase', body: 'Activated by glucose-6-P.', list: ['Slide 11 also lists Ca²⁺ and AMP for synthase — slide 18 (and textbooks) show they act on phosphorylase instead'], src: SRC('11, 18') } });
  const fP = D.flow(left, { count: 3, color: P, speed: 110, r: 10 });
  const fS = D.flow(right, { count: 3, color: 'var(--a1)', speed: 110, r: 10 });
  const flows = { phos: fP, syn: fS };
  const REG = [
    { id: 'g6p', t: 'Glucose-6-P', x: CX, y: 360, on: [['phos', -1], ['syn', 1]], body: 'Inhibits <b>phosphorylase</b>, activates <b>synthase</b> — a “glucose is plentiful” signal.', src: SRC(18) },
    { id: 'atp', t: 'ATP', x: 220, y: 200, on: [['phos', -1]], body: 'High energy → less breakdown.', src: SRC(18) },
    { id: 'glc', t: 'Glucose (liver)', x: 220, y: 300, on: [['phos', -1]], body: 'Free glucose inhibits liver phosphorylase a.', src: `${LIP} · not on slide 18`, textbook: true },
    { id: 'amp', t: 'AMP', x: 220, y: 440, on: [['phos', 1]], body: 'Energy is low → more breakdown (textbook: AMP activates muscle phosphorylase b).', src: `${SRC(18)} · ${LIP}` },
    { id: 'ca', t: 'Ca²⁺', x: 220, y: 540, on: [['phos', 1]], body: 'Contracting muscle → more breakdown (textbook: Ca²⁺–calmodulin activates phosphorylase kinase).', src: `${SRC(18)} · ${LIP}` },
  ];
  const active = new Set();
  const chips = REG.map((r) => {
    const g = s('g', { style: 'cursor:pointer' });
    const w = r.t.length * 16 + 64;
    const rect = s('rect', { x: r.x - w / 2, y: r.y - 30, width: w, height: 60, rx: 30, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2;transition:all .3s' });
    const tx = s('text', { x: r.x, y: r.y + 10, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:28px;font-weight:650' });
    tx.textContent = r.t;
    g.append(rect, tx);
    const lines = r.on.map(([tgt, eff]) => {
      const n = D.nodes[tgt];
      const fromX = r.x + (n.x > r.x ? w / 2 + 6 : -w / 2 - 6);
      const toX = n.x + (n.x > r.x ? -n.w0 / 2 - 8 : n.w0 / 2 + 8);
      const col = eff > 0 ? 'var(--act)' : 'var(--inh)';
      const a = D.arrow({ from: [fromX, r.y], to: [toX, n.y + (r.y - n.y) * 0.25], color: col, width: 4, kind: eff > 0 ? undefined : 'inh', headSize: 14 });
      a.g.style.opacity = 0.15;
      const sign = D.text((fromX + toX) / 2, (r.y + n.y + (r.y - n.y) * 0.25) / 2 - 12, eff > 0 ? '+' : '−', { anchor: 'middle', style: `font-size:34px;font-weight:800;fill:${col};opacity:0` });
      return { a, sign, tgt, eff };
    });
    D.layers.labels.append(g);
    g.setAttribute('data-tip', JSON.stringify({ kicker: r.textbook ? 'Textbook addition' : 'Allosteric effector', title: r.t, body: `${r.body}<br><span style="color:var(--fg-3)">Click to toggle</span>`, src: r.src }));
    g.addEventListener('click', () => { active.has(r.id) ? active.delete(r.id) : active.add(r.id); recompute(); });
    return { r, g, rect, tx, lines };
  });
  // meters
  const meter = (y, label, col) => {
    D.text(1340, y - 22, label, { cls: 'sm', style: 'fill:var(--fg-2);font-weight:600' });
    D.layers.regions.append(s('rect', { x: 1340, y, width: 340, height: 30, rx: 15, style: 'fill:var(--surface-2)' }));
    const bar = s('rect', { x: 1340, y, width: 113, height: 30, rx: 15, style: `fill:${col};transition:width .6s cubic-bezier(.22,1,.36,1)` });
    D.layers.nodes.append(bar);
    return bar;
  };
  const mP = meter(160, 'Breakdown (phosphorylase)', P);
  const mS = meter(260, 'Synthesis (synthase)', 'var(--a1)');
  const verdict = D.text(1510, 380, '', { anchor: 'middle', style: 'font-size:34px;font-weight:720' });
  D.text(220, 120, 'EFFECTORS', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--fg-3)' });
  function recompute() {
    const v = { phos: 1, syn: 1 };
    chips.forEach((c) => {
      const on = active.has(c.r.id);
      c.rect.style.fill = on ? 'color-mix(in oklab, var(--ink) 22%, var(--bg))' : 'var(--surface-2)';
      c.rect.style.stroke = on ? 'var(--ink)' : 'var(--line-2)';
      c.rect.style.strokeWidth = on ? 4 : 2;
      c.lines.forEach((l) => {
        l.a.g.style.opacity = on ? 1 : 0.15;
        l.sign.style.opacity = on ? 1 : 0;
        if (on) v[l.tgt] *= l.eff > 0 ? 1.9 : 0.42;
      });
    });
    const paint = (node, val, key) => {
      const col = val > 1.05 ? 'var(--act)' : val < 0.95 ? 'var(--inh)' : 'var(--line-2)';
      node.shape.style.stroke = col;
      node.shape.style.strokeWidth = val > 1.05 || val < 0.95 ? 4 : 2;
      const f = flows[key];
      f.destroy();
      flows[key] = D.flow(key === 'phos' ? left : right, { count: Math.max(1, Math.min(7, Math.round(3 * val))), color: key === 'phos' ? P : 'var(--a1)', speed: Math.max(30, Math.min(260, 110 * val)), r: 10 });
    };
    paint(phos, v.phos, 'phos');
    paint(syn, v.syn, 'syn');
    mP.setAttribute('width', Math.max(20, Math.min(340, 113 * v.phos)));
    mS.setAttribute('width', Math.max(20, Math.min(340, 113 * v.syn)));
    const net = v.phos / v.syn;
    verdict.textContent = active.size === 0 ? 'Balanced' : net > 1.3 ? 'Net: breakdown' : net < 0.77 ? 'Net: storage' : 'Balanced';
    verdict.style.fill = net > 1.3 ? P : net < 0.77 ? 'var(--a1)' : 'var(--fg-2)';
  }
  const reset = h('button.btn', { style: 'position:absolute;right:0;bottom:0;font-size:22px;height:56px;padding:0 26px', text: 'Reset', onclick: () => { active.clear(); recompute(); } });
  el.append(reset);
  recompute();
  return {
    step(n) {
      active.clear();
      if (n === 1) ['g6p', 'atp'].forEach((k) => active.add(k));
      if (n === 2) ['amp', 'ca'].forEach((k) => active.add(k));
      recompute();
    },
    leave: () => Object.values(flows).forEach((f) => f.pause()),
    enter: () => Object.values(flows).forEach((f) => f.play()),
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* 16 · Glycogen storage disease explorer                              */
/* ================================================================== */
const GSD = [
  {
    id: 'vg', name: 'Von Gierke', type: 'Type I', typeNote: 'textbook', enzyme: 'Glucose-6-phosphatase', organs: ['liver', 'kidney'],
    feats: ['Fasting hypoglycemia', 'Hepatomegaly', 'Lactic acidosis', 'Hyperlipemia · hyperuricemia'],
    note: 'Liver can’t release free glucose',
    block: ['g6pase'], lanes: ['L'],
    tip: { kicker: 'Von Gierke disease', title: 'Glucose-6-phosphatase deficiency', list: ['Organs: liver and kidney', 'Fasting hypoglycemia', 'Slide lists “hepatosplenomegaly”; textbooks describe hepatomegaly (with enlarged kidneys)', 'Lactic acidosis; slide also lists ketosis', 'Hyperlipemia, hyperuricemia', 'Type number not on the slides (textbook: type I)'], src: `${SRC(20)} · ${LIP}` },
  },
  {
    id: 'po', name: 'Pompe', type: 'Type II', enzyme: 'Lysosomal α(1→4)-glucosidase', organs: ['heart', 'liver', 'muscle'],
    feats: ['Massive cardiomegaly', 'Normal blood sugar', 'Hypotonia · muscle weakness', 'Infant: heart failure, early death'],
    note: 'Treatment: enzyme replacement therapy',
    block: ['lyso'], lanes: ['Y'],
    tip: { kicker: 'Type II · Pompe disease', title: 'Lysosomal α(1→4)-glucosidase deficiency', list: ['Only GSD that is a lysosomal storage disease', 'All organs with lysosomes (mainly heart, liver, muscle)', 'Excess glycogen in lysosomes · normal structure', 'Normal blood sugar', 'Enzyme replacement therapy available'], src: SRC('16, 21') },
  },
  {
    id: 'co', name: 'Cori', type: 'Type III', enzyme: 'Debranching enzyme', organs: ['liver', 'muscle', 'heart'],
    feats: ['Fasting hypoglycemia', 'Hepatomegaly', 'Muscle weakness', 'Abnormal glycogen structure'],
    note: 'Short outer branches (4 or 1 residues at branch points)',
    block: ['debL', 'debM'], lanes: ['L', 'M'],
    tip: { kicker: 'Type III · Cori disease', title: 'Debranching enzyme deficiency', list: ['4:4 transferase and/or amylo-α(1→6)-glucosidase', 'Liver, skeletal muscle, heart', 'Abnormal glycogen: four or one glucosyl residues at branch points'], src: SRC('16, 22') },
  },
  {
    id: 'mc', name: 'McArdle', type: 'Type V', enzyme: 'Muscle glycogen phosphorylase', organs: ['muscle'],
    feats: ['Exercise intolerance', 'Muscle cramps', 'No rise in blood lactate', 'Myoglobinuria'],
    note: 'Liver enzyme normal · relatively benign',
    block: ['phosM'], lanes: ['M'],
    tip: { kicker: 'Type V · McArdle syndrome', title: 'Myophosphorylase deficiency', list: ['Skeletal muscle only; liver enzyme normal', 'Weakness and cramping after exercise', 'No rise in blood lactate during strenuous exercise', 'Myoglobinemia, myoglobinuria', 'High muscle glycogen, normal structure'], src: SRC('16, 23') },
  },
  {
    id: 'he', name: 'Hers', type: 'Type VI', enzyme: 'Liver glycogen phosphorylase', organs: ['liver'],
    feats: ['Hepatomegaly', 'Mild fasting hypoglycemia'],
    note: 'Deficiency of the liver isozyme',
    block: ['phosL'], lanes: ['L'],
    tip: { kicker: 'Type VI · Hers disease', title: 'Liver phosphorylase deficiency', list: ['Liver only', 'Hepatomegaly', 'Mild fasting hypoglycemia'], src: SRC('16, 24') },
  },
];
function gsdViz(el) {
  // tabs
  const tabs = h('div', { style: 'position:absolute;left:0;right:0;top:0;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;z-index:3' });
  const tabEls = GSD.map((d, i) => {
    const b = h('button', { style: 'all:unset;cursor:pointer;padding:12px 22px;border-radius:22px;border:1px solid var(--line);background:var(--surface);transition:all .35s var(--ease);display:flex;align-items:baseline;justify-content:space-between;gap:12px' }, [
      h('span', { style: 'font-size:30px;font-weight:680;letter-spacing:-.01em', text: d.name }),
      h('span', { style: 'font-size:22px;color:var(--fg-3);font-weight:600', text: d.type }),
    ]);
    b.addEventListener('click', () => select(i));
    tabs.append(b);
    return b;
  });
  el.append(tabs);
  const mapHost = h('div', { style: 'position:absolute;left:0;top:96px;width:1060px;height:624px' });
  el.append(mapHost);
  const D = diagram(mapHost, 1060, 624);
  const XL = 210, XM = 850, R = [70, 170, 270, 370, 470, 570];
  D.region({ x: 10, y: 0, w: 400, h: 624, r: 36, label: 'Liver', labelColor: 'var(--a1)', fill: 'color-mix(in oklab, var(--a1) 5%, transparent)', lx: 30, ly: 40 });
  D.region({ x: 650, y: 0, w: 400, h: 624, r: 36, label: 'Muscle', labelColor: 'var(--elec)', fill: 'color-mix(in oklab, var(--elec) 5%, transparent)', lx: 30, ly: 40 });
  const N = {};
  const node = (id, x, y, label, col) => (N[id] = D.node({ id, x, y, label, kind: 'mol', size: 26, color: col }));
  const gate = (id, x, y, label) => (N[id] = D.node({ id, x, y, label, kind: 'enz', size: 24, color: 'var(--fg-2)' }));
  node('glyL', XL, R[0] + 20, 'Glycogen', 'var(--a1)');
  gate('phosL', XL, R[1] + 10, 'Phosphorylase');
  gate('debL', XL, R[2] + 10, 'Debranching enzyme');
  node('g6pL', XL, R[3] + 10, 'Glucose-6-P', P);
  gate('g6pase', XL, R[4] + 10, 'Glucose-6-phosphatase');
  node('outL', XL, R[5] + 10, 'Glucose → blood', 'var(--elec)');
  node('glyM', XM, R[0] + 20, 'Glycogen', 'var(--a1)');
  gate('phosM', XM, R[1] + 10, 'Phosphorylase');
  gate('debM', XM, R[2] + 10, 'Debranching enzyme');
  node('g6pM', XM, R[3] + 10, 'Glucose-6-P', P);
  node('glysM', XM, R[4] + 10, 'Glycolysis', 'var(--atp)');
  node('outM', XM, R[5] + 10, 'Lactate', 'var(--fg-2)');
  const seqL = ['glyL', 'phosL', 'debL', 'g6pL', 'g6pase', 'outL'], seqM = ['glyM', 'phosM', 'debM', 'g6pM', 'glysM', 'outM'];
  const arrL = [], arrM = [];
  for (let i = 0; i < 5; i++) {
    arrL.push(D.arrow({ from: seqL[i], to: seqL[i + 1], color: 'var(--fg-3)', width: 4, headSize: 13, gapStart: 4, gapEnd: 4 }));
    arrM.push(D.arrow({ from: seqM[i], to: seqM[i + 1], color: 'var(--fg-3)', width: 4, headSize: 13, gapStart: 4, gapEnd: 4 }));
  }
  D.text(XL + 44, R[3] - 34, 'via G1P', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3)' });
  D.text(XM + 44, R[3] - 34, 'via G1P', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3)' });
  // lysosome between lanes
  const lyso = s('g');
  const lyC = s('circle', { cx: 530, cy: 200, r: 84, style: 'fill:color-mix(in oklab, var(--a2) 12%, transparent);stroke:color-mix(in oklab, var(--a2) 55%, transparent);stroke-width:3' });
  lyso.append(lyC);
  const lyT = s('text', { x: 530, y: 192, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--a2);font-weight:700' }); lyT.textContent = 'Lysosome';
  const lyT2 = s('text', { x: 530, y: 222, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:19px;fill:var(--fg-2)' }); lyT2.textContent = 'α(1→4)-glucosidase';
  lyso.append(lyT, lyT2);
  D.layers.nodes.append(lyso);
  const aLy1 = D.arrow({ from: [XL + 90, R[0] + 36], to: [452, 160], curve: -20, color: 'var(--a2)', width: 3.5, dash: '8 8' });
  const aLy2 = D.arrow({ from: [XM - 90, R[0] + 36], to: [608, 160], curve: 20, color: 'var(--a2)', width: 3.5, dash: '8 8' });
  // block marker
  // block marker: a bar across the outgoing arrow (as in Lippincott) + ✕ beside the enzyme
  const blockG = (x, y, half, barDy = 46) => {
    const g = s('g', { transform: `translate(${x} ${y})`, style: 'opacity:0' });
    if (barDy !== null) g.append(s('rect', { x: -32, y: barDy - 8, width: 64, height: 16, rx: 6, style: 'fill:var(--inh)' }));
    g.append(s('circle', { cx: half + 28, cy: 0, r: 20, style: 'fill:var(--inh)' }));
    g.append(s('path', { d: `M${half + 20},-8 L${half + 36},8 M${half + 36},-8 L${half + 20},8`, style: 'stroke:#fff;stroke-width:4;stroke-linecap:round' }));
    D.layers.labels.append(g);
    return g;
  };
  const bk = (id, x) => blockG(x, N[id].y, N[id].w0 / 2);
  const blocks = {
    g6pase: bk('g6pase', XL), debL: bk('debL', XL), debM: bk('debM', XM), phosL: bk('phosL', XL), phosM: bk('phosM', XM),
    lyso: blockG(530, 200, 84, null),
  };
  const pile = (x, y) => { const t = D.badge(x, y, '↑ glycogen', { color: 'var(--inh)', size: 22, w: 150 }); t.style.opacity = 0; return t; };
  const piles = { L: pile(XL + 120, 30), M: pile(XM + 120, 30), Y: pile(530, 316) };
  // panel
  const panel = h('div', { style: 'position:absolute;left:1100px;top:96px;right:0;bottom:0;border-radius:36px;background:var(--surface);border:1px solid var(--line);padding:34px 40px;display:flex;flex-direction:column;gap:18px' });
  const pName = h('div', { style: 'font-size:52px;font-weight:720;letter-spacing:-.03em;line-height:1' });
  const pType = h('span', { class: 'chip acc', style: 'font-size:22px;margin-left:14px;vertical-align:middle' });
  const pEnz = h('div', { style: 'font-size:28px;color:var(--fg-2);line-height:1.3' });
  const pOrg = h('div', { style: 'display:flex;gap:10px;flex-wrap:nowrap' });
  const pFeat = h('ul', { style: 'margin:0;padding:0;list-style:none;display:grid;gap:10px' });
  const pNote = h('div', { style: 'font-size:23px;color:var(--fg-3);margin-top:auto' });
  panel.append(h('div', {}, [pName]), pEnz, pOrg, pFeat, pNote);
  el.append(panel);
  const ORG = { liver: 'Liver', kidney: 'Kidney', heart: 'Heart', muscle: 'Muscle' };
  let cur = -1;
  function select(i) {
    cur = i;
    const d = GSD[i];
    tabEls.forEach((t, k) => { t.style.borderColor = k === i ? 'var(--a1)' : 'var(--line)'; t.style.background = k === i ? 'color-mix(in oklab, var(--a1) 14%, var(--bg))' : 'var(--surface)'; t.style.boxShadow = k === i ? '0 0 0 2px color-mix(in oklab, var(--a1) 35%, transparent)' : 'none'; });
    pName.textContent = d.name;
    pType.textContent = d.type + (d.typeNote ? ' · textbook' : '');
    pName.append(pType);
    pEnz.innerHTML = `Deficient: <b>${d.enzyme}</b>`;
    pOrg.innerHTML = '';
    Object.keys(ORG).forEach((k) => {
      const on = d.organs.includes(k);
      pOrg.append(h('div', { style: `display:flex;align-items:center;gap:6px;padding:6px 14px 6px 8px;border-radius:999px;border:1px solid ${on ? 'color-mix(in oklab, var(--a1) 55%, transparent)' : 'var(--line)'};background:${on ? 'color-mix(in oklab, var(--a1) 12%, transparent)' : 'transparent'};color:${on ? 'var(--ink)' : 'var(--fg-3)'};opacity:${on ? 1 : 0.5};font-size:21px;font-weight:620`, html: `${organIcon(k, 30)}${ORG[k]}` }));
    });
    pFeat.innerHTML = '';
    d.feats.forEach((f) => pFeat.append(h('li', { style: 'font-size:29px;line-height:1.25;padding-left:30px;position:relative', html: `<span style="position:absolute;left:4px;top:.45em;width:12px;height:12px;border-radius:50%;background:var(--grad)"></span>${f}` })));
    pNote.textContent = d.note;
    tip(panel, d.tip);
    gsap.fromTo([pName, pEnz, pOrg, pFeat, pNote], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 });
    // map
    Object.entries(blocks).forEach(([k, g]) => gsap.to(g, { opacity: d.block.includes(k) ? 1 : 0, duration: 0.4 }));
    Object.entries(N).forEach(([k, n]) => { if (n.kind === 'enz') { const hit = d.block.includes(k); n.shape.style.stroke = hit ? 'var(--inh)' : ''; n.shape.style.fill = hit ? 'color-mix(in oklab, var(--inh) 18%, var(--bg))' : ''; } });
    const dimAfter = (seq, arr, blockId) => {
      const bi = seq.indexOf(blockId);
      seq.forEach((id, k) => gsap.to(N[id].g, { opacity: bi >= 0 && k > bi ? 0.25 : 1, duration: 0.4 }));
      arr.forEach((a, k) => gsap.to(a.g, { opacity: bi >= 0 && k >= bi ? 0.2 : 1, duration: 0.4 }));
    };
    dimAfter(seqL, arrL, d.block.find((b) => seqL.includes(b)));
    dimAfter(seqM, arrM, d.block.find((b) => seqM.includes(b)));
    Object.entries(piles).forEach(([k, p]) => gsap.to(p, { opacity: d.lanes.includes(k) && (k !== 'L' || d.id !== 'vg') ? 1 : 0, duration: 0.4 }));
    if (d.id === 'vg') gsap.to(piles.L, { opacity: 1, duration: 0.4 });
    gsap.to([aLy1.g, aLy2.g, lyso], { opacity: d.id === 'po' ? 1 : 0.45, duration: 0.4 });
    lyC.style.stroke = d.id === 'po' ? 'var(--inh)' : '';
    lyC.style.strokeWidth = d.id === 'po' ? 5 : '';
  }
  select(0);
  return { step: (n) => select(Math.min(4, n)), destroy: () => D.destroy() };
}

/* ================================================================== */
/* 17 · Pompe: why is blood sugar normal?                              */
/* ================================================================== */
function pompeViz(el) {
  const D = diagram(el, 1500, 360);
  const lane = (y, label, col) => {
    D.text(0, y + 10, label, { style: `font-size:28px;font-weight:700;fill:${col}` });
    D.node({ x: 330, y, label: 'Glycogen', kind: 'mol', size: 28, color: 'var(--a1)' });
  };
  lane(90, 'Cytosol', 'var(--elec)');
  lane(270, 'Lysosome', 'var(--a2)');
  const a1 = D.arrow({ from: [430, 90], to: [1010, 90], color: 'var(--act)', width: 6, label: 'phosphorylase + debranching enzyme', labelSide: -1, labelOffset: 30, labelColor: 'var(--fg-2)' });
  D.node({ x: 1120, y: 90, label: 'Glucose', kind: 'mol', size: 28, color: 'var(--elec)' });
  const ok = D.badge(1350, 90, '✓ normal blood sugar', { color: 'var(--act)', size: 24, w: 270 });
  const a2 = D.arrow({ from: [430, 270], to: [1010, 270], color: 'var(--a2)', width: 6, label: 'lysosomal α(1→4)-glucosidase', labelSide: -1, labelOffset: 30, labelColor: 'var(--fg-2)' });
  const x = s('g', { transform: 'translate(940 270)', style: 'opacity:0' });
  x.append(s('circle', { r: 30, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:5' }), s('path', { d: 'M-13,-13 L13,13 M13,-13 L-13,13', style: 'stroke:var(--inh);stroke-width:6;stroke-linecap:round' }));
  D.layers.labels.append(x);
  const pileT = D.badge(1240, 270, 'glycogen piles up → cardiomegaly', { color: 'var(--inh)', size: 24, w: 420 });
  const f1 = D.flow(a1, { count: 3, color: 'var(--elec)', speed: 160, r: 10 });
  const f2 = D.flow(a2, { count: 3, color: 'var(--a2)', speed: 160, r: 10 });
  [ok, pileT].forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      gsap.to(x, { opacity: n >= 1 ? 1 : 0, duration: 0.4 });
      gsap.to([ok, pileT], { opacity: n >= 1 ? 1 : 0, duration: 0.5, stagger: 0.1 });
      n >= 1 ? f2.hide() : f2.play();
    },
    leave: () => { f1.pause(); f2.pause(); },
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* 18 · McArdle: no lactate rise                                       */
/* ================================================================== */
function mcardleViz(el) {
  const C = chart(el, { w: 1500, h: 360, pad: { l: 120, b: 64, t: 24, r: 420 }, x: { min: 0, max: 10, label: 'Strenuous exercise →', ticks: false }, y: { min: 0, max: 1.1, label: 'Blood lactate', ticks: false } });
  const normal = C.line((t) => 0.12 + 0.82 * (1 - Math.exp(-t / 2.8)), { color: 'var(--act)', width: 7, label: 'Normal: lactate rises', labelAt: 10, labelDy: 8 });
  const mc = C.line(() => 0.12, { color: 'var(--inh)', width: 7, label: 'McArdle: no rise', labelAt: 10, labelDy: 8 });
  mc.show(false);
  return { enter: () => normal.draw(1.4), step: (n) => { mc.show(n >= 1); if (n === 1) mc.draw(1.2); } };
}

/* ================================================================== */
/* 19 · Spot the disease (Q&A reveal)                                  */
/* ================================================================== */
function spotViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '560px 1fr';
  el.style.gap = '44px';
  const card = h('div.case', { style: 'display:flex;flex-direction:column;justify-content:center' }, [
    h('div.tag', { html: '● Interpret' }),
    h('p', { html: 'Name the <b>disease</b> and the <b>deficient enzyme</b> for each pattern.' }),
    h('p', { style: 'font-size:26px;color:var(--fg-2)', html: 'Clues come straight from the lecture’s disease slides.' }),
  ]);
  const qs = [
    ['Infant · massive cardiomegaly · <b>normal</b> blood sugar', '<b>Pompe (II)</b> — lysosomal α(1→4)-glucosidase. Cytosolic breakdown still works.'],
    ['Cramps on exercise · lactate does <b>not</b> rise · dark urine', '<b>McArdle (V)</b> — muscle phosphorylase. Myoglobinuria; liver enzyme normal.'],
    ['Fasting hypoglycemia · lactic acidosis · hyperuricemia', '<b>Von Gierke</b> — glucose-6-phosphatase (liver & kidney).'],
    ['Hepatomegaly · muscle weakness · <b>abnormal</b> glycogen', '<b>Cori (III)</b> — debranching enzyme. Short outer branches.'],
    ['Hepatomegaly · <b>mild</b> fasting hypoglycemia only', '<b>Hers (VI)</b> — liver glycogen phosphorylase.'],
  ];
  const list = h('div', { style: 'display:grid;gap:16px;align-content:center' });
  const ans = qs.map(([q, a]) => {
    const A = h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:8px;line-height:1.3;overflow:hidden', html: a });
    list.append(h('div', { style: 'padding:16px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line)' }, [h('div', { style: 'font-size:29px;font-weight:620;letter-spacing:-.01em', html: q }), A]));
    return A;
  });
  el.append(card, list);
  return { step: (n) => ans.forEach((a, i) => gsap.to(a, { opacity: i < n ? 1 : 0, height: i < n ? 'auto' : 0, marginTop: i < n ? 8 : 0, duration: 0.5 })) };
}

/* ================================================================== */
/* Deck                                                                */
/* ================================================================== */
export default {
  references: [
    'Lippincott’s Biochemistry, 9th ed., Ch 11 (pp 145–156)',
    'Lecture slides: Glycogen metabolism (L.15), Dr Vijaya Marakala, NUST',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.15',
      title: 'Glycogen Metabolism',
      subtitle: 'Building and breaking the body’s glucose bank.',
      meta: ['Cytoplasm', 'Liver & muscle', '5 learning outcomes'],
      src: '3D model: procedural glycogen granule (schematic) · lecture slides 5, 9',
      notes: [
        'Welcome. Glycogen is the body’s branched store of glucose — built when glucose is plentiful, broken down when it is scarce.',
        'The model on the right is a procedural glycogen granule: a gold glycogenin protein at the core, chains of glucose (blue) joined α(1→4), branch points (pink) joined α(1→6), and glowing non-reducing ends (purple). It grows outward tier by tier, as glycogen does.',
        'Roadmap: why glycogen matters (blood glucose) → liver vs muscle → structure → synthesis → breakdown → regulation → storage diseases.',
      ],
      visual: heroViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      class: 'cards-3',
      cards: [
        { big: '01', k: 'L.15.1', title: 'Define both pathways', tip: { title: 'L.15.1', body: 'Define glycogenesis and glycogenolysis.' } },
        { big: '02', k: 'L.15.2', title: 'Liver vs muscle roles', tip: { title: 'L.15.2', body: 'Describe the functions of glycogen in liver and muscle during fed and fasting conditions.' } },
        { big: '03', k: 'L.15.3', title: 'Steps of each pathway', tip: { title: 'L.15.3', body: 'Explain the steps involved in glycogenesis and glycogenolysis.' } },
        { big: '04', k: 'L.15.4', title: 'Regulation', tip: { title: 'L.15.4', body: 'Describe the mechanisms of regulation of glycogenesis and glycogenolysis.' } },
        { big: '05', k: 'L.15.5', title: 'Glycogen storage diseases', tip: { title: 'L.15.5', body: 'Interpret glycogen storage diseases.' }, style: 'grid-column: span 2' },
      ],
      notes: 'Five outcomes. Hover any card for the full SLO wording from slide 2.',
    },
    {
      eyebrow: 'Why glycogen matters',
      title: 'Keeping blood glucose <em>steady</em>',
      bullets: [
        { t: 'Three sources of blood glucose', tip: { title: 'Sources', list: ['Diet', 'Glycogenolysis (stored glycogen)', 'Gluconeogenesis'], src: SRC(3) } },
        { t: '<b>Fed</b>: excess stored as glycogen', step: 1, tip: 'After a meal blood glucose rises; the excess is stored by glycogenesis.' },
        { t: '<b>Fasting</b>: glycogen broken down', step: 2, tip: 'Between meals blood glucose falls; glycogenolysis and gluconeogenesis supply glucose.' },
      ],
      steps: 2,
      src: SRC(3),
      notes: [
        'Slide 3: blood glucose sits at the centre with three inputs — diet, glycogenolysis and gluconeogenesis.',
        'Build 1 (fed): diet raises blood glucose; glycogenesis stores the excess as glycogen.',
        'Build 2 (fasting): blood glucose falls; glycogenolysis and gluconeogenesis refill it.',
        'Glycogen metabolism is therefore one mechanism of blood glucose homeostasis. The Fed/Fasting control can be clicked at any time.',
      ],
      visual: homeostasisViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Definitions · L.15.1',
      title: 'Two opposite <em>pathways</em>',
      cards: [
        {
          k: 'Glycogenesis', title: 'Glycogen synthesis', list: ['Site: cytoplasm', 'Needs a glycogenin primer', 'Costs ATP and UTP'],
          viz: (v) => chainMini(v, 'gen'),
          tip: { title: 'Glycogenesis', body: 'Process of glycogen synthesis · site: cytoplasm.', list: ['Requirements: α-D-glucose, glycogenin, ATP, UTP and enzymes'], src: SRC(6) },
        },
        {
          k: 'Glycogenolysis', title: 'Glycogen degradation', list: ['Site: cytoplasm', 'Phosphorylase + debranching enzyme', 'Coenzyme: PLP'],
          viz: (v) => chainMini(v, 'lys'),
          tip: { title: 'Glycogenolysis', body: 'Process of glycogen degradation · site: cytoplasm.', list: ['Requirements: glycogen phosphorylase, debranching enzyme, PLP (pyridoxal phosphate)', 'Pᵢ is also used (slides 15–16)'], src: SRC('13, 15') },
        },
      ],
      notes: [
        'Glycogenesis = glycogen synthesis; glycogenolysis = glycogen degradation. Both happen in the cytoplasm (slides 6, 13).',
        'Glycogenesis requirements: α-D-glucose, glycogenin, ATP, UTP and enzymes.',
        'Glycogenolysis requirements: glycogen phosphorylase, debranching enzyme and PLP — the vitamin B6 coenzyme of phosphorylase (textbook).',
        'The mini animations: synthesis adds residues to the chain end; breakdown removes them as glucose-1-phosphate.',
      ],
    },
    {
      layout: 'cards',
      eyebrow: 'Liver vs muscle · L.15.2',
      title: 'Where glycogen is <em>stored</em>',
      class: 'cards-3',
      cards: [
        { k: 'Liver', big: '10%', title: 'of fresh weight', body: '≈ 100 g in total', viz: (v) => organCardViz(v, 'liver'), tip: { title: 'Liver glycogen', body: '10% of the fresh weight · 100 g. Broken down to free glucose that is exported to blood.', src: SRC(4) } },
        { k: 'Muscle', big: '1–2%', title: 'of fresh weight', body: '≈ 400 g in total', viz: (v) => organCardViz(v, 'muscle'), tip: { title: 'Muscle glycogen', body: '1–2% of the fresh weight · 400 g. Broken down only to glucose-6-P, used by the muscle itself.', src: SRC(4) } },
        { k: 'Whole body', big: '400 g', title: 'sits in muscle', body: 'Most of the body’s glycogen', viz: (v) => organCardViz(v, 'total'), tip: { title: 'Concentration vs total', body: 'Liver is richer per gram (10% vs 1–2%), but muscle mass is so large that muscle holds most of the body’s glycogen (400 g vs 100 g).', src: SRC(4) } },
      ],
      notes: [
        'Slide 4 numbers: liver 10% of fresh weight ≈ 100 g; muscle 1–2% ≈ 400 g.',
        'Classic exam trap: liver has the higher concentration, muscle has the larger total — “Most of the body’s glycogen is found in muscle.”',
        'The organ drawings show dense vs sparse granules; liver exports glucose, muscle keeps its glucose-6-P.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Fed vs fasting · L.15.2',
      title: 'Same store, different <em>jobs</em>',
      bullets: [{ t: 'Liver feeds the blood' }, { t: 'Muscle feeds itself' }],
      steps: 2,
      src: 'Lecture slides 3–4, 15 · muscle lacks glucose-6-phosphatase per Lippincott Ch 11',
      notes: [
        'Build 1 — Fed: blood glucose is taken up and stored as glycogen in both liver and muscle.',
        'Build 2 — Fasting: liver glycogen → glucose → blood, maintaining blood glucose for the whole body.',
        'Muscle glycogen goes only to glucose-6-P, which feeds the muscle’s own glycolysis. There is no arrow back to blood on slide 4.',
        'Why? Textbook: muscle lacks glucose-6-phosphatase, so G6P cannot be converted to free glucose.',
      ],
      visual: rolesViz,
    },
    {
      eyebrow: 'Structure',
      title: 'A branched <em>glucose tree</em>',
      bullets: [
        { t: '<b>α(1→4)</b> links the chains', tip: { title: 'α(1→4) glycosidic bonds', body: 'Join glucose residues in straight chains (C1 of one residue to C4 of the next).', src: SRC(5) } },
        { t: '<b>α(1→6)</b> at branch points', tip: { title: 'α(1→6) glycosidic bond', body: 'Joins a new chain to C6 of a residue in another chain. “Every 8 to 10 glucose, there is a branch.”', src: SRC(5) } },
        { t: 'Many <b>non-reducing</b> ends', tip: { title: 'Non-reducing ends', body: 'Each chain tip is a non-reducing end — where synthase adds and phosphorylase removes glucose. More branches → more ends → faster synthesis and breakdown.', src: `${SRC('5, 10')} · ${LIP}` } },
        { t: 'One reducing end → <b>glycogenin</b>', tip: { title: 'Reducing end', body: 'The single reducing end is attached to the primer protein glycogenin at the core.', src: SRC('5, 10, 16') } },
      ],
      steps: 4,
      focus: true,
      src: 'Lecture slides 5, 9, 10 · procedural 3D model (schematic, not to scale)',
      notes: [
        'Glycogen is a branched homopolymer of glucose.',
        'Build 1: α(1→4) bonds (blue) make the straight chains.',
        'Build 2: α(1→6) bonds (pink) create branch points — about every 8–10 residues.',
        'Build 3: every chain ends in a non-reducing end (purple). Branching multiplies them, so enzymes can work on many ends at once.',
        'Build 4: only one reducing end, attached to glycogenin (gold) at the centre.',
      ],
      visual: structureViz,
    },
    {
      eyebrow: 'Zoom in',
      title: 'Inside a <em>branch point</em>',
      bullets: [
        { t: 'C1 → C4: chain continues', step: 1, tip: 'α(1→4): the anomeric C1 of one glucose bonds through O to C4 of the next.' },
        { t: 'C1 → C6: branch starts', step: 2, tip: 'α(1→6): C1 of the first branch residue bonds through O to C6 (the CH₂) of a chain residue.' },
        { t: 'A branch every <b>8–10</b> residues', step: 3, tip: '“Every 8 to 10 glucose, there is a branch.”' },
      ],
      steps: 3,
      src: 'Lecture slide 5 · Haworth projections (OH groups omitted for clarity)',
      notes: [
        'This is the chemical close-up from slide 5: the bottom chain is α(1→4)-linked; the upper chain joins through C6 of the middle ring.',
        'Point out the CH₂ at C6 of the branch residue (instead of CH₂OH).',
        'Branch every 8–10 residues on average.',
      ],
      visual: branchPointViz,
    },
    {
      layout: 'full',
      eyebrow: 'Glycogenesis · L.15.3',
      title: 'Activating <em>glucose</em>',
      bullets: [{ t: 'Donor: UDP-glucose' }, { t: 'Costs ATP + UTP' }],
      steps: 4,
      src: 'Lecture slides 8, 10 · real PubChem 3D structures',
      notes: [
        'Press → to walk through each step; the 3D model shows the real molecule.',
        '1 · Glucose + ATP → glucose-6-P + ADP (glucokinase in liver; hexokinase in muscle — textbook).',
        '2 · Glucose-6-P ⇄ glucose-1-P (phosphoglucomutase, reversible).',
        '3 · Glucose-1-P + UTP → UDP-glucose + PPᵢ (UDP-glucose pyrophosphorylase). Pyrophosphatase: PPᵢ + H₂O → 2 Pᵢ — pulls the reaction forward.',
        '4 · Glycogen synthase transfers glucose from UDP-glucose to a non-reducing end (α(1→4)), releasing UDP. UDP + ATP → UTP + ADP recycles it.',
      ],
      visual: activationViz,
    },
    {
      eyebrow: 'Glycogenesis · L.15.3',
      title: 'Building the <em>tree</em>',
      bullets: [
        { t: 'Glycogenin primes on <b>Tyr-194</b>', tip: { title: 'Glycogenin', body: 'UDP-glucose glucosylates the –OH of tyrosine-194 on glycogenin; glycogenin extends a short chain on itself (4 residues drawn in the figure).', src: SRC(10) } },
        { t: '<b>Synthase</b> adds α(1→4)', tip: { title: 'Glycogen synthase', body: 'Extends chains at the non-reducing end with α(1→4) bonds. It cannot start a chain de novo — it needs the primer.', src: SRC('8, 10') } },
        { t: '<b>Branching enzyme</b> adds α(1→6)', tip: { title: 'Branching enzyme (4:6 transferase)', body: 'Cuts a block from a chain end (breaks α(1→4)) and re-attaches it to an interior residue by α(1→6).', list: ['Figures show 6–7 residues moved; Lippincott: a chain of 6–8 residues', 'Lippincott: new branch ≥ 4 residues from an existing one'], src: `${SRC('7, 9, 10')} · ${LIP}` } },
        { t: 'Repeat → spherical <b>granule</b>', tip: 'Further elongation (α(1→4)) and branching (α(1→6)) build tiers around one glycogenin.' },
      ],
      steps: 5,
      focus: true,
      src: 'Lecture slides 7, 9, 10 · residues a–o as in the Lippincott figure · 3D schematic',
      notes: [
        'Build 1: glycogenin (gold) uses UDP-glucose to attach glucose to Tyr-194, then makes a short primer (a–d).',
        'Build 2: glycogen synthase adds residues to the non-reducing end — 15 residues, a–o, all α(1→4).',
        'Build 3: branching enzyme (4:6 transferase) moves the terminal block j–o and attaches it to g with an α(1→6) bond. Now there are two non-reducing ends. Don’t quote one exact block size — figures show 6–7; Lippincott says 6–8.',
        'Build 4–5: elongation + branching repeat; the granule grows in tiers around glycogenin.',
      ],
      visual: growViz,
    },
    {
      layout: 'full',
      eyebrow: 'Glycogenolysis · L.15.3',
      title: 'Taking it <em>apart</em>',
      bullets: [{ t: 'Phosphorolysis, then debranching' }, { t: 'G1P : glucose ≈ 8 : 1' }],
      steps: 4,
      src: 'Lecture slides 13–16 (Lippincott Fig 11.8)',
      notes: [
        'Start: a main chain (blue) with a branch (purple) attached by α(1→6) at the pink-ringed residue.',
        'Build 1 — Glycogen phosphorylase (Pᵢ, PLP) removes glucose-1-P from non-reducing ends and stops 4 residues from the branch point → limit dextrin.',
        'Build 2 — Debranching enzyme, glucan transferase (4:4) activity: moves the outer 3 residues onto another chain end. One α(1→6)-linked glucose remains. (“4:4” describes bond types, not the residue count.)',
        'Build 3 — Amylo-α(1→6)-glucosidase activity: hydrolyses that last residue (H₂O) → one free glucose.',
        'Build 4 — Repeat 1→2→3: overall glucose-1-P : free glucose ≈ 8 : 1.',
      ],
      visual: lysisViz,
    },
    {
      layout: 'full',
      eyebrow: 'Glycogenolysis · fate of products',
      title: 'Where the glucose <em>goes</em>',
      bullets: [{ t: 'Liver → blood' }, { t: 'Muscle → glycolysis' }],
      steps: 3,
      src: 'Lecture slides 15–16, 21 · G6Pase absent in muscle per Lippincott Ch 11',
      notes: [
        'Glucose-1-P ⇄ glucose-6-P via phosphoglucomutase.',
        'Build 1 — Liver: glucose-6-phosphatase (+H₂O, −Pᵢ) → free glucose → blood. This is how liver maintains blood glucose in fasting.',
        'Build 2 — Muscle: glucose-6-P goes straight into glycolysis for the muscle’s own energy.',
        'Build 3 — A minor lysosomal route: lysosomal α(1→4)-glucosidase hydrolyses glycogen to glucose. Its deficiency = Pompe disease.',
      ],
      visual: fateViz,
    },
    {
      eyebrow: 'Regulation · L.15.4',
      title: 'One phosphate, <em>two switches</em>',
      bullets: [
        { t: 'Phosphorylase + P = <b>active (a)</b>', tip: { title: 'Glycogen phosphorylase', body: '<b>b</b>: dephosphorylated, inactive. <b>a</b>: phosphorylated, active.', src: SRC(17) } },
        { t: 'Synthase + P = <b>inactive (b)</b>', tip: { title: 'Glycogen synthase', body: '<b>a</b>: dephosphorylated, active. <b>b</b>: phosphorylated, inactive. Synthase is the rate-limiting enzyme of glycogenesis.', src: SRC('11, 12') } },
        { t: 'Never both at full speed', step: 1, tip: 'One phosphorylation signal switches breakdown on and synthesis off at the same time (reciprocal regulation).' },
      ],
      steps: 1,
      src: 'Lecture slides 11, 12, 17',
      notes: [
        'The single most testable rule of this lecture: phosphorylation ACTIVATES phosphorylase (b → a) but INACTIVATES synthase (a → b).',
        'Mnemonic: phosphorylation = fasting mode — breakdown ON, synthesis OFF.',
        'Build 1 (or the control) adds the phosphates: phosphorylase kinase phosphorylates phosphorylase; PKA phosphorylates synthase directly.',
        'Ask: why regulate reciprocally? So glycogen is not made and broken at the same time, wasting UTP/ATP.',
      ],
      visual: switchViz,
    },
    {
      layout: 'full',
      eyebrow: 'Hormonal regulation · L.15.4',
      title: 'The cAMP <em>cascade</em>',
      bullets: [{ t: 'Glucagon · epinephrine → breakdown' }, { t: 'Insulin → storage' }],
      steps: 4,
      src: 'Lecture slides 12, 17 · receptor, G-protein and PP-1 per Lippincott Ch 11 · amplification schematic',
      notes: [
        'Build 1: glucagon (liver) or epinephrine (muscle & liver) → receptor → G-protein → adenylate cyclase → ATP → cAMP. Toggle Liver/Muscle: no glucagon arm in muscle.',
        'Build 2: cAMP activates protein kinase A → phosphorylase kinase → phosphorylase b → a (active): glycogenolysis ON. Each tier activates many molecules — amplification.',
        'Build 3: PKA also phosphorylates glycogen synthase a → b (inactive): glycogenesis OFF.',
        'Build 4: insulin activates phosphodiesterase (cAMP → 5′-AMP, inactive), so the cascade stops: glycogenesis stimulated, glycogenolysis inhibited. Textbook adds protein phosphatase-1, which removes the phosphates.',
      ],
      visual: cascadeViz,
    },
    {
      layout: 'full',
      eyebrow: 'Allosteric regulation · L.15.4',
      title: 'Fine-tuning by <em>metabolites</em>',
      bullets: [{ t: 'Click any effector' }, { t: 'Fed signals vs energy-need signals' }],
      steps: 2,
      src: 'Lecture slide 18 · glucose (liver) effect per Lippincott Ch 11 · slide 11’s Ca²⁺/AMP-on-synthase entry not used',
      notes: [
        'Slide 18 cycle: glycogen → (phosphorylase) → glucose-1-P → (synthase) → glycogen.',
        'Build 1 — fed / energy-rich: glucose-6-P and ATP inhibit phosphorylase; glucose-6-P activates synthase → net storage.',
        'Build 2 — energy need / contracting muscle: AMP and Ca²⁺ activate phosphorylase → net breakdown.',
        'Textbook: in liver, free glucose inhibits phosphorylase a; in muscle Ca²⁺ acts via calmodulin on phosphorylase kinase and AMP activates phosphorylase b.',
        'Note: slide 11 lists Ca²⁺ and AMP under synthase — that conflicts with slide 18; use slide 18.',
      ],
      visual: allostericViz,
    },
    {
      layout: 'full',
      eyebrow: 'Glycogen storage diseases · L.15.5',
      title: 'Break the <em>pathway</em>',
      bullets: [{ t: 'Click a disease' }, { t: 'Find the block' }],
      steps: 4,
      src: 'Lecture slides 16, 19–24 · von Gierke type number per Lippincott (not on slides)',
      notes: [
        'Five GSDs from slide 19. Press → or click a tab; the red bar marks the blocked enzyme and ↑ glycogen shows where it piles up.',
        'Von Gierke: glucose-6-phosphatase (liver, kidney) → fasting hypoglycemia, hepatomegaly, lactic acidosis, hyperlipemia, hyperuricemia. The slide prints “hepatosplenomegaly” and “ketosis”; textbooks describe hepatomegaly (+ enlarged kidneys) and only mild ketosis.',
        'Pompe (II): lysosomal α(1→4)-glucosidase; normal blood sugar; massive cardiomegaly; ERT available.',
        'Cori (III): debranching enzyme; fasting hypoglycemia, hepatomegaly, muscle weakness, abnormal glycogen.',
        'McArdle (V): muscle phosphorylase; exercise intolerance, cramps, no lactate rise, myoglobinuria. Hers (VI): liver phosphorylase; hepatomegaly, mild fasting hypoglycemia.',
      ],
      visual: gsdViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Interpret',
      title: 'Why is blood sugar <em>normal</em> in Pompe disease?',
      subtitle: 'Only the lysosomal route is blocked — cytosolic glycogenolysis still releases glucose.',
      subtitleStep: 1,
      steps: 1,
      src: 'Lecture slides 16, 21',
      notes: 'Ask first. Then reveal: Pompe lacks lysosomal α(1→4)-glucosidase. Phosphorylase and debranching enzyme in the cytosol are normal, so blood sugar is normal — but glycogen accumulates inside lysosomes (heart, liver, muscle) → cardiomegaly, heart failure.',
      visual: pompeViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Interpret',
      title: 'Why doesn’t lactate rise in <em>McArdle</em>?',
      subtitle: 'No muscle phosphorylase → no glucose-6-P for glycolysis → no lactate.',
      subtitleStep: 1,
      steps: 1,
      src: 'Lecture slides 16, 23 · curves illustrative',
      notes: 'During strenuous exercise, normal muscle breaks down glycogen → G6P → anaerobic glycolysis → lactate rises. In McArdle the muscle phosphorylase is missing, so glycogen cannot be mobilised: exercise intolerance, cramps, and no rise in blood lactate.',
      visual: mcardleViz,
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking',
      title: 'Spot the <em>disease</em>',
      steps: 5,
      src: 'Lecture slides 16, 20–24',
      notes: 'Read each pattern aloud, let the room answer, then press → to reveal. Emphasise the discriminators: normal sugar (Pompe), no lactate rise (McArdle), severe vs mild hypoglycemia (von Gierke vs Hers), abnormal structure (Cori).',
      visual: spotViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { icon: 'bolt', big: '400 g', title: 'in muscle', body: 'Liver: 10% but ≈ 100 g — and only liver feeds the blood.' },
        { icon: 'chain', big: '8–10', title: 'residues per branch', body: 'α(1→4) chains · α(1→6) branches.' },
        { icon: 'scissors', big: '8 : 1', title: 'G1P : glucose', body: 'Phosphorylase vs debranching enzyme.' },
        { icon: 'cycle', big: '+P', title: 'flips both', body: 'Phosphorylase ON (a) · synthase OFF (b).' },
      ],
      notes: 'Recap the four numbers, then open the question bank.',
    },
  ],
};
