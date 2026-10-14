// Ball-and-stick molecules from real PubChem 3D coordinates (assets/data/mol/*.json).
import { THREE, glossy, cylinderBetween } from './three-kit.js';

const BASE = new URL('../../data/mol/', import.meta.url);
const cache = new Map();

export async function loadMol(key) {
  if (!cache.has(key)) cache.set(key, fetch(new URL(`${key}.json`, BASE)).then((r) => r.json()));
  return cache.get(key);
}

export const ELEMENT = {
  H: { color: 0xf2f2f7, r: 0.24 },
  C: { color: 0x8e8e96, r: 0.38 },
  N: { color: 0x3a82ff, r: 0.37 },
  O: { color: 0xff453a, r: 0.36 },
  P: { color: 0xff9f0a, r: 0.46 },
  S: { color: 0xffd60a, r: 0.46 },
  Fe: { color: 0xd9822b, r: 0.56 },
  Co: { color: 0xff6ea8, r: 0.54 },
  Zn: { color: 0x8e9cff, r: 0.5 },
  Cl: { color: 0x30d158, r: 0.44 },
  F: { color: 0x63e6be, r: 0.32 },
  Na: { color: 0xbf5af2, r: 0.5 },
  As: { color: 0xbf5af2, r: 0.5 },
  Mg: { color: 0x5ac8fa, r: 0.5 },
};
const elOf = (e) => ELEMENT[e] || { color: 0xff2d55, r: 0.4 };

const sphereGeo = new THREE.SphereGeometry(1, 40, 28);
const matCache = new Map();
function elMat(color, emissive = 0) {
  const k = `${color}-${emissive}`;
  if (!matCache.has(k)) matCache.set(k, glossy(color, { emissive, emissiveIntensity: emissive ? 0.55 : 0 }));
  return matCache.get(k);
}

/**
 * buildMolecule(data, opts) → THREE.Group
 * opts: hideH: false | 'nonpolar' | true   (default 'nonpolar' for >30 atoms, else false)
 *       scale: atom radius multiplier (1)      bond: bond radius (0.11)
 *       spacefill: boolean                     color: (atom, i) => hex | undefined
 *       highlight: { atoms:[i], color: hex }   center: true
 */
export function buildMolecule(data, opts = {}) {
  const atoms = data.atoms;
  const n = atoms.length;
  const hideH = opts.hideH ?? (n > 30 ? 'nonpolar' : false);
  const scale = opts.scale ?? 1;
  const bondR = opts.bond ?? 0.11;
  const group = new THREE.Group();
  group.name = data.key || 'molecule';

  // Neighbour lists
  const nbr = atoms.map(() => []);
  data.bonds.forEach(([a, b]) => { nbr[a].push(b); nbr[b].push(a); });
  const hidden = new Set();
  if (hideH) {
    atoms.forEach((a, i) => {
      if (a[0] !== 'H') return;
      if (hideH === true) hidden.add(i);
      else if (nbr[i].some((j) => atoms[j][0] === 'C')) hidden.add(i);
    });
  }

  const pos = atoms.map((a) => new THREE.Vector3(a[1], a[2], a[3]));
  const center = new THREE.Vector3();
  if (opts.center !== false) {
    let c = 0;
    pos.forEach((p, i) => { if (!hidden.has(i)) { center.add(p); c++; } });
    center.multiplyScalar(1 / Math.max(1, c));
    pos.forEach((p) => p.sub(center));
  }

  const hl = new Set(opts.highlight?.atoms || []);
  const atomMeshes = [];
  atoms.forEach((a, i) => {
    if (hidden.has(i)) { atomMeshes.push(null); return; }
    const el = elOf(a[0]);
    const col = opts.color?.(a, i) ?? el.color;
    const m = new THREE.Mesh(sphereGeo, elMat(hl.has(i) ? (opts.highlight.color ?? col) : col, hl.has(i) ? (opts.highlight.color ?? col) : 0));
    const r = opts.spacefill ? el.r * 2.6 : el.r * scale;
    m.scale.setScalar(r);
    m.position.copy(pos[i]);
    m.userData = { index: i, element: a[0] };
    group.add(m);
    atomMeshes.push(m);
  });

  if (!opts.spacefill) {
    data.bonds.forEach(([a, b, order]) => {
      if (hidden.has(a) || hidden.has(b)) return;
      const pa = pos[a], pb = pos[b];
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const ca = opts.color?.(atoms[a], a) ?? elOf(atoms[a][0]).color;
      const cb = opts.color?.(atoms[b], b) ?? elOf(atoms[b][0]).color;
      const offsets = [];
      if (order === 2 || order === 3) {
        // offset perpendicular to the bond, in the plane of a neighbour
        const dir = pb.clone().sub(pa).normalize();
        const other = nbr[a].find((x) => x !== b && !hidden.has(x)) ?? nbr[b].find((x) => x !== a && !hidden.has(x));
        let perp = other !== undefined ? pos[other].clone().sub(pa) : new THREE.Vector3(0, 0, 1);
        perp.sub(dir.clone().multiplyScalar(perp.dot(dir)));
        if (perp.lengthSq() < 1e-4) perp = new THREE.Vector3(0, 1, 0).cross(dir);
        perp.normalize().multiplyScalar(bondR * 1.6);
        if (order === 2) offsets.push(perp.clone(), perp.clone().negate());
        else offsets.push(new THREE.Vector3(), perp.clone().multiplyScalar(1.3), perp.clone().multiplyScalar(-1.3));
      } else offsets.push(new THREE.Vector3());
      const r = order > 1 ? bondR * 0.62 : bondR;
      offsets.forEach((off) => {
        group.add(cylinderBetween(pa.clone().add(off), mid.clone().add(off), r, elMat(ca)));
        group.add(cylinderBetween(mid.clone().add(off), pb.clone().add(off), r, elMat(cb)));
      });
    });
  }

  group.userData = { pos, atomMeshes, hidden, data, center };
  return group;
}

/** Convenience: load + build. */
export async function molecule(key, opts) {
  return buildMolecule(await loadMol(key), opts);
}

/** Indices of atoms matching an element symbol. */
export function atomsOf(data, el) {
  return data.atoms.map((a, i) => (a[0] === el ? i : -1)).filter((i) => i >= 0);
}
