// Cartoon ribbons from real PDB Cα traces (assets/data/pdb/*.json):
// helices as wide spiralling ribbons, β-strands as flat arrows, loops as thin tubes.
import { THREE, glossy } from './three-kit.js';
import { ELEMENT } from './molecule.js';

const BASE = new URL('../../data/pdb/', import.meta.url);
const cache = new Map();
export async function loadPDB(id) {
  if (!cache.has(id)) cache.set(id, fetch(new URL(`${id}.json`, BASE)).then((r) => r.json()));
  return cache.get(id);
}

export const SS_COLORS = { H: 0xff375f, E: 0xffd60a, C: 0xb0b0b8 };
export const CHAIN_COLORS = [0xff375f, 0x0a84ff, 0xff9f0a, 0x30d158, 0xbf5af2, 0x64d2ff];

const SPR = 10; // samples per residue
const RING = 14; // vertices per cross-section

/**
 * buildProtein(pdb, opts) → THREE.Group (centred, in Å)
 * opts: chains: ['A',...]  colorBy: 'ss' | 'chain' | 'rainbow' | (chainIdx, resIdx, ss) => hex
 *       hets: true | ['HEM']  hetScale: 1   coil: 0.32   helixW: 1.5  sheetW: 1.7
 */
export function buildProtein(pdb, opts = {}) {
  const group = new THREE.Group();
  const chains = pdb.chains.filter((c) => !opts.chains || opts.chains.includes(c.id));
  const allCA = [];
  chains.forEach((c) => c.res.forEach((r) => allCA.push(new THREE.Vector3(r[2], r[3], r[4]))));
  const center = allCA.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / allCA.length);
  if (opts.center) center.set(...opts.center);

  const mat = glossy(0xffffff, { vertexColors: true, roughness: 0.38, clearcoat: 0.4, side: THREE.DoubleSide });
  const chainMeshes = [];
  chains.forEach((c, ci) => {
    const chainIndex = pdb.chains.indexOf(c);
    const mesh = new THREE.Mesh(chainGeometry(c, chainIndex, center, opts), mat);
    mesh.userData = { chain: c.id };
    group.add(mesh);
    chainMeshes.push(mesh);
  });

  const hetGroups = [];
  if (opts.hets) {
    const want = Array.isArray(opts.hets) ? opts.hets : null;
    pdb.het.forEach((het) => {
      if (want && !want.includes(het.name)) return;
      if (opts.chains && !opts.chains.includes(het.chain)) return;
      const g = hetStick(het, center, opts.hetScale ?? 1, opts.hetColor);
      g.userData = { het: het.name, chain: het.chain };
      group.add(g);
      hetGroups.push(g);
    });
  }
  group.userData = { center, chainMeshes, hetGroups };
  return group;
}

function colorFor(opts, chainIndex, i, n, ss) {
  const cb = opts.colorBy || 'ss';
  if (typeof cb === 'function') return new THREE.Color(cb(chainIndex, i, ss));
  if (cb === 'chain') return new THREE.Color((opts.chainColors || CHAIN_COLORS)[chainIndex % 6]);
  if (cb === 'rainbow') return new THREE.Color().setHSL(0.66 * (1 - i / Math.max(1, n - 1)), 0.75, 0.58);
  return new THREE.Color((opts.ssColors || SS_COLORS)[ss] ?? 0xb0b0b8);
}

function chainGeometry(c, chainIndex, center, opts) {
  const P = c.res.map((r) => new THREE.Vector3(r[2], r[3], r[4]).sub(center));
  const ss = c.ss.split('');
  const n = P.length;
  // Smooth the β zig-zag for the spline, keep helices true.
  const C = P.map((p, i) => {
    if (ss[i] === 'E' && i > 0 && i < n - 1) return p.clone().multiplyScalar(0.5).add(P[i - 1].clone().add(P[i + 1]).multiplyScalar(0.25));
    return p.clone();
  });
  // Sheet normals from the pleat direction (alternating sign → made consistent).
  const G = P.map((p, i) => {
    if (i === 0 || i === n - 1) return null;
    return p.clone().multiplyScalar(2).sub(P[i - 1]).sub(P[i + 1]).normalize();
  });
  for (let i = 0; i < n; i++) if (!G[i]) G[i] = (G[i + 1] || G[i - 1] || new THREE.Vector3(0, 1, 0)).clone();
  for (let i = 1; i < n; i++) if (ss[i] === 'E' && ss[i - 1] === 'E' && G[i].dot(G[i - 1]) < 0) G[i].negate();

  const curve = new THREE.CatmullRomCurve3(C, false, 'centripetal');
  const S = (n - 1) * SPR + 1;
  const pts = curve.getSpacedPoints ? curve.getPoints(S - 1) : [];
  const tangents = pts.map((_, k) => curve.getTangent(k / (S - 1)).normalize());

  // Per-sample shape targets
  const helixW = opts.helixW ?? 1.5, sheetW = opts.sheetW ?? 1.7, coil = opts.coil ?? 0.32, thick = 0.32;
  const W = new Float32Array(S), T = new Float32Array(S);
  for (let k = 0; k < S; k++) {
    const r = Math.min(n - 1, Math.round(k / SPR));
    const s = ss[r];
    if (s === 'H') { W[k] = helixW; T[k] = thick; }
    else if (s === 'E') {
      // arrowhead on the last residue of a strand
      const last = r === n - 1 || ss[r + 1] !== 'E';
      const local = (k - (r - 0.5) * SPR) / SPR; // 0..1 across this residue
      if (last && local > 0) { const f = Math.max(0, Math.min(1, local)); W[k] = sheetW * 1.45 * (1 - f) + coil * f; T[k] = thick; }
      else { W[k] = sheetW; T[k] = thick; }
    } else { W[k] = coil; T[k] = coil; }
  }
  // Smooth transitions (but keep arrowheads crisp)
  const Ws = W.slice(), Ts = T.slice();
  for (let pass = 0; pass < 3; pass++) for (let k = 1; k < S - 1; k++) {
    const r = Math.min(n - 1, Math.round(k / SPR));
    if (ss[r] === 'E' && (r === n - 1 || ss[r + 1] !== 'E')) continue;
    Ws[k] = (Ws[k - 1] + 2 * Ws[k] + Ws[k + 1]) / 4; Ts[k] = (Ts[k - 1] + 2 * Ts[k] + Ts[k + 1]) / 4;
  }

  // Frames: helices use curvature normal; sheets use pleat normal; coils parallel-transport.
  const N = [], B = [];
  let prevN = null;
  for (let k = 0; k < S; k++) {
    const t = tangents[k];
    const r = Math.min(n - 1, Math.round(k / SPR));
    let nrm;
    if (ss[r] === 'H') {
      const a = tangents[Math.max(0, k - 2)], b = tangents[Math.min(S - 1, k + 2)];
      nrm = b.clone().sub(a);
      if (nrm.lengthSq() < 1e-8) nrm = prevN ? prevN.clone() : new THREE.Vector3(0, 1, 0);
    } else if (ss[r] === 'E') {
      const f = k / SPR - Math.floor(k / SPR);
      const r0 = Math.min(n - 1, Math.floor(k / SPR)), r1 = Math.min(n - 1, r0 + 1);
      nrm = G[r0].clone().lerp(G[r1], f);
    } else {
      nrm = prevN ? prevN.clone() : new THREE.Vector3(0, 1, 0);
    }
    nrm.sub(t.clone().multiplyScalar(nrm.dot(t)));
    if (nrm.lengthSq() < 1e-8) nrm = new THREE.Vector3(1, 0, 0).cross(t);
    nrm.normalize();
    if (prevN && nrm.dot(prevN) < 0 && ss[r] !== 'H') nrm.negate();
    if (prevN && ss[r] !== 'H') { nrm.lerp(prevN, 0.35).sub(t.clone().multiplyScalar(nrm.dot(t))).normalize(); }
    N.push(nrm);
    B.push(t.clone().cross(nrm).normalize());
    prevN = nrm;
  }

  const verts = new Float32Array(S * RING * 3);
  const norms = new Float32Array(S * RING * 3);
  const cols = new Float32Array(S * RING * 3);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let k = 0; k < S; k++) {
    const r = Math.min(n - 1, Math.round(k / SPR));
    const col = colorFor(opts, chainIndex, r, n, ss[r]);
    for (let j = 0; j < RING; j++) {
      const ang = (j / RING) * Math.PI * 2;
      const cw = Math.cos(ang), sw = Math.sin(ang);
      v.copy(pts[k]).addScaledVector(B[k], cw * Ws[k]).addScaledVector(N[k], sw * Ts[k]);
      nn.copy(B[k]).multiplyScalar(cw / Math.max(0.05, Ws[k])).addScaledVector(N[k], sw / Math.max(0.05, Ts[k])).normalize();
      const o = (k * RING + j) * 3;
      verts[o] = v.x; verts[o + 1] = v.y; verts[o + 2] = v.z;
      norms[o] = nn.x; norms[o + 1] = nn.y; norms[o + 2] = nn.z;
      cols[o] = col.r; cols[o + 1] = col.g; cols[o + 2] = col.b;
    }
  }
  const idx = [];
  for (let k = 0; k < S - 1; k++) for (let j = 0; j < RING; j++) {
    const a = k * RING + j, b = k * RING + ((j + 1) % RING), c2 = (k + 1) * RING + j, d = (k + 1) * RING + ((j + 1) % RING);
    idx.push(a, c2, b, b, c2, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.userData = { samples: pts, residues: n };
  return geo;
}

/**
 * Real conformational change: glucokinase super-open (1V4T) → closed (1V4S), superposed on the
 * large domain (assets/data/pdb/GK-morph.json). Returns { group, setT(t 0..1), glucose }.
 * opts: smallColor, largeColor, colorBy ('domain' | 'ss')
 */
export async function proteinMorph(opts = {}) {
  const data = await fetch(new URL('GK-morph.json', BASE)).then((r) => r.json());
  const group = new THREE.Group();
  const mat = glossy(0xffffff, { vertexColors: true, roughness: 0.38, clearcoat: 0.4, side: THREE.DoubleSide });
  const small = opts.smallColor ?? 0xff375f, large = opts.largeColor ?? 0x8e8e96;
  const meshes = data.segments.map((seg, si) => {
    const mk = (coords) => ({ id: 'A', res: seg.res.map((r, i) => [r, '', ...coords[i]]), ss: seg.ss });
    const colorBy = opts.colorBy === 'ss' ? 'ss' : (ci, i) => (seg.small[i] ? small : large);
    const zero = new THREE.Vector3();
    const gOpen = chainGeometry(mk(seg.open), 0, zero, { ...opts, colorBy });
    const gClosed = chainGeometry(mk(seg.closed), 0, zero, { ...opts, colorBy });
    gOpen.morphAttributes.position = [gClosed.attributes.position];
    gOpen.morphAttributes.normal = [gClosed.attributes.normal];
    gOpen.morphTargetsRelative = false;
    const m = new THREE.Mesh(gOpen, mat);
    m.updateMorphTargets();
    group.add(m);
    gClosed.dispose?.();
    return m;
  });
  let glucose = null;
  if (data.glucose?.length) {
    glucose = hetStick({ atoms: data.glucose[0].atoms, bonds: data.glucose[0].bonds }, new THREE.Vector3(), 1.25, 0xffd60a);
    group.add(glucose);
  }
  return {
    group, glucose,
    setT(t) { meshes.forEach((m) => { m.morphTargetInfluences[0] = t; }); },
  };
}

const ballGeo = new THREE.SphereGeometry(1, 20, 14);
const stickGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
function hetStick(het, center, scale = 1, colorOverride) {
  const g = new THREE.Group();
  const pos = het.atoms.map((a) => new THREE.Vector3(a[2], a[3], a[4]).sub(center));
  const mats = {};
  const matFor = (el) => (mats[el] ||= glossy(colorOverride && el !== 'Fe' ? colorOverride : (ELEMENT[el]?.color ?? 0xff2d55), { emissive: el === 'Fe' ? 0x6a2a00 : 0 }));
  het.atoms.forEach((a, i) => {
    const m = new THREE.Mesh(ballGeo, matFor(a[0]));
    m.scale.setScalar((a[0] === 'Fe' ? 0.75 : 0.3) * scale);
    m.position.copy(pos[i]);
    g.add(m);
  });
  const up = new THREE.Vector3(0, 1, 0);
  het.bonds.forEach(([i, j]) => {
    const a = pos[i], b = pos[j];
    const m = new THREE.Mesh(stickGeo, matFor(het.atoms[i][0] === 'Fe' ? het.atoms[j][0] : het.atoms[i][0]));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(0.16 * scale, a.distanceTo(b), 0.16 * scale);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.add(m);
  });
  return g;
}

/** Full-atom subset (for proteins fetched with atoms) as ball-and-stick, bonds by distance. */
export function buildAtoms(pdb, { chain, from, to, backboneOnly = false, scale = 1, center } = {}) {
  const atoms = pdb.atoms.filter((a) => (!chain || a[0] === chain) && (from === undefined || a[1] >= from) && (to === undefined || a[1] <= to) && (!backboneOnly || ['N', 'CA', 'C', 'O'].includes(a[3])));
  const pos = atoms.map((a) => new THREE.Vector3(a[5], a[6], a[7]));
  const c = center ? new THREE.Vector3(...center) : pos.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pos.length);
  pos.forEach((p) => p.sub(c));
  const g = new THREE.Group();
  const mats = {};
  const matFor = (el) => (mats[el] ||= glossy(ELEMENT[el]?.color ?? 0xff2d55));
  atoms.forEach((a, i) => {
    const m = new THREE.Mesh(ballGeo, matFor(a[4]));
    m.scale.setScalar((ELEMENT[a[4]]?.r ?? 0.4) * 0.8 * scale);
    m.position.copy(pos[i]);
    m.userData = { atom: a };
    g.add(m);
  });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    const d = pos[i].distanceTo(pos[j]);
    const lim = (atoms[i][4] === 'S' || atoms[j][4] === 'S') ? 2.15 : 1.75;
    if (d > lim) continue;
    const m = new THREE.Mesh(stickGeo, matFor(atoms[i][4]));
    m.position.copy(pos[i]).add(pos[j]).multiplyScalar(0.5);
    m.scale.set(0.13 * scale, d, 0.13 * scale);
    m.quaternion.setFromUnitVectors(up, pos[j].clone().sub(pos[i]).normalize());
    g.add(m);
  }
  g.userData = { atoms, pos, center: c };
  return g;
}
