// Oxidative Phosphorylation & ETC (L.10) — interactive revision deck.
import { h, s, setRich, countTo } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { slider, seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, matte, glowSprite, cylinderBetween, kitController } from '../viz/three-kit.js';
import { loadMol, buildMolecule } from '../viz/molecule.js';
import { loadPDB, buildProtein } from '../viz/protein.js';

const gsap = window.gsap;
const SRC = (p) => `Lecture slide ${p}`;
const LIPP = (t) => `<br><span style="color:var(--fg-3)">Lippincott · beyond the slides:</span> ${t}`;
const EL = 'var(--elec)';
const HP = 'var(--prot)';
const AT = 'var(--atp)';
const ND = 'var(--nadh)';
const FD = 'var(--fadh)';
const IN = 'var(--inh)';
const AC = 'var(--act)';

/* ------------------------------------------------------------------ */
/* Shared facts (single source for tips, cards, 3D labels)             */
/* ------------------------------------------------------------------ */
const CX = {
  I: { title: 'Complex I · NADH dehydrogenase', body: 'NADH dehydrogenase complex. Contains <b>FMN</b> and <b>Fe-S</b>. NADH + H⁺ → NAD⁺; its 2 e⁻ pass to CoQ. Pumps <b>4 H⁺</b> into the intermembrane space.', src: SRC('8, 10') },
  II: { title: 'Complex II · Succinate dehydrogenase', body: 'Succinate dehydrogenase complex. Contains <b>FAD</b> and <b>Fe-S</b>. FADH₂ → FAD; its 2 e⁻ pass to CoQ. Pumps <b>no</b> protons.' + LIPP('it is also an enzyme of the TCA cycle.'), src: SRC('8, 10') },
  III: { title: 'Complex III · Cytochrome bc₁', body: 'Cytochrome bc₁ complex. Contains <b>cytochrome b</b>, <b>cytochrome c₁</b> and <b>Fe-S</b>. Takes e⁻ from CoQ, hands them to cytochrome c. Pumps <b>4 H⁺</b>.', src: SRC('8, 10') },
  IV: { title: 'Complex IV · Cytochrome c oxidase', body: 'Cytochrome c oxidase. Contains <b>cytochromes a and a₃</b> and <b>Cu<sub>A</sub>, Cu<sub>B</sub></b>. Gives the electrons to oxygen: ½O₂ + 2H⁺ → H₂O. Pumps <b>2 H⁺</b>.', src: SRC('6, 8, 10') },
  Q: { title: 'Coenzyme Q (ubiquinone)', body: 'Mobile electron carrier. Collects electrons from Complexes I <b>and</b> II and carries them to Complex III.' + LIPP('lipid-soluble, so it diffuses within the inner membrane.'), src: SRC(8) },
  c: { title: 'Cytochrome c', body: 'Mobile electron carrier. Carries electrons from Complex III to Complex IV.' + LIPP('a small water-soluble heme protein on the intermembrane face of the inner membrane.'), src: SRC(8) },
  V: { title: 'ATP synthase · Complex V', body: '<b>F₁F₀-ATPase</b>, a multisubunit enzyme. <b>F₀</b> (inner membrane) is the H⁺ channel with the c-ring. <b>F₁</b> (matrix) has α, β, γ, δ, ε subunits and the catalytic activity: ADP + P<sub>i</sub> → ATP.', src: SRC(13) },
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t) => t * t * (3 - 2 * t);

/** Horizontal meter: label + value text + bar. */
function meter(label, color, w, big) {
  const fill = h('div', { style: `position:absolute;left:0;top:0;bottom:0;width:0;border-radius:99px;background:${color};transition:width .6s var(--ease)` });
  const val = h('span', { style: `font-size:${big ? 25 : 20}px;font-weight:650;color:var(--fg-2)` });
  const el = h('div', { style: `display:grid;gap:${big ? 10 : 7}px;${w ? `width:${w}px` : ''}` }, [
    h('div', { style: `display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:${big ? 26 : 21}px;color:var(--fg-2);font-weight:560;white-space:nowrap` }, [h('span', { html: label }), val]),
    h('div', { style: `position:relative;height:${big ? 16 : 12}px;border-radius:99px;background:var(--surface-3);overflow:hidden` }, [fill]),
  ]);
  return { el, set(v, txt) { fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`; if (txt !== undefined) val.innerHTML = txt; } };
}

/** Card mini-visuals use the card's .viz box; card controllers never get enter/leave,
 *  so a 3D kit there is started/stopped by watching the slide's class (engine workaround). */
function autoRun(kit, el) {
  const sec = el.closest('.slide');
  const sync = () => {
    const live = sec && (sec.classList.contains('is-current') || sec.classList.contains('is-leaving'));
    if (live) kit.start(); else kit.stop();
  };
  const mo = new MutationObserver(sync);
  if (sec) mo.observe(sec, { attributes: true, attributeFilter: ['class'] });
  kit.renderOnce();
  sync();
  return { destroy() { mo.disconnect(); kit.dispose(); } };
}

/* ------------------------------------------------------------------ */
/* 3D building blocks                                                  */
/* ------------------------------------------------------------------ */
function mergeByPosition(geo) {
  const pos = geo.attributes.position;
  const map = new Map();
  const verts = [];
  const idx = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = map.get(key);
    if (j === undefined) { j = verts.length / 3; map.set(key, j); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  return g;
}

/** Smooth organic blob (unit radius) for stylised protein domains. */
function blobGeo(seed, amp = 0.075) {
  const geo = mergeByPosition(new THREE.IcosahedronGeometry(1, 9));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 2.3 + seed) * Math.sin(v.y * 2.9 + seed * 1.3) * Math.sin(v.z * 2.1 + seed * 0.7)
      + 0.5 * Math.sin(v.x * 5.1 + seed * 2.3) * Math.sin(v.y * 4.7 + seed * 0.4) * Math.sin(v.z * 5.3 + seed * 1.9);
    v.multiplyScalar(1 + amp * 2 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function proteinMat(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.22,
    emissive: new THREE.Color(color), emissiveIntensity: 0, ...extra,
  });
}

/** A protein = several glossy blobs sharing one material. parts: [x,y,z,sx,sy,sz,rz] */
function protein(parts, color, seed = 1) {
  const g = new THREE.Group();
  const mat = proteinMat(color);
  parts.forEach(([x, y, z, sx, sy, sz, rz = 0], i) => {
    const m = new THREE.Mesh(blobGeo(seed * 7.3 + i * 2.1), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.z = rz;
    g.add(m);
  });
  g.userData.mat = mat;
  g.userData.base = color;
  return g;
}

/** Lipid bilayer slab: instanced heads (two leaflets) + tails, tapered edges, holes for proteins. */
function membrane(o) {
  const { x0, x1, z0, z1, half = 1.05, sp = 0.44, holes = [], head = 0x7f9cf0, head2 = 0xa6b8f6, tail = 0xd9c48c, taper = 1.5, r = 0.2, seed = 3 } = o;
  const rnd = rng(seed);
  const pts = [];
  let row = 0;
  for (let z = z0; z <= z1 + 1e-6; z += sp * 0.866, row++) {
    for (let x = x0 + (row % 2) * sp * 0.5; x <= x1 + 1e-6; x += sp) {
      const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      const k = Math.max(0, Math.min(1, d / taper));
      if (k < 0.12) continue;
      pts.push([x + (rnd() - 0.5) * 0.07, z + (rnd() - 0.5) * 0.07, smooth(k)]);
    }
  }
  const inHole = (x, z, leaf) => holes.some((hh) => (!hh.leaf || hh.leaf === leaf) && ((x - hh.x) / hh.rx) ** 2 + ((z - hh.z) / hh.rz) ** 2 < 1);
  const list = [];
  pts.forEach(([x, z, k]) => [1, -1].forEach((sg) => { if (!inHole(x, z, sg > 0 ? 'upper' : 'lower')) list.push([x, z, k, sg]); }));
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, emissive: new THREE.Color(0x000000) });
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 10, 7), headMat, list.length);
  const tails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.03, half * 0.78, 5), matte(tail, { roughness: 0.8 }), list.length * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const ps = new THREE.Vector3();
  const c1 = new THREE.Color(head), c2 = new THREE.Color(head2), cc = new THREE.Color();
  list.forEach(([x, z, k, sg], i) => {
    ps.set(x, sg * half, z);
    sc.setScalar(k);
    heads.setMatrixAt(i, m4.compose(ps, q, sc));
    heads.setColorAt(i, cc.copy(c1).lerp(c2, rnd()));
    for (let t = 0; t < 2; t++) {
      ps.set(x + (t ? 0.07 : -0.07), sg * (half - r * 0.6 - half * 0.39), z);
      sc.set(k, k, k);
      tails.setMatrixAt(i * 2 + t, m4.compose(ps, q, sc));
    }
  });
  const g = new THREE.Group();
  g.add(heads, tails);
  g.userData = { heads, headMat };
  return g;
}

/** Glowing particle: additive halo + normal-blended core (stays visible on the light theme). */
function particle(color, size = 1) {
  const g = new THREE.Group();
  const glow = glowSprite(color, size);
  glow.material.depthTest = false;
  glow.renderOrder = 20;
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow.material.map, color, transparent: true, depthWrite: false, depthTest: false }));
  core.scale.setScalar(size * 0.42);
  core.renderOrder = 21;
  g.add(glow, core);
  g.setOpacity = (o) => { glow.material.opacity = o; core.material.opacity = o; };
  return g;
}

/* ================================================================== */
/* Mitochondrion (hero + anatomy)                                      */
/* ================================================================== */
function stadium(R, L, fingers = [], w = 0.2, depth = 1.7) {
  // closed outline in the z=0 plane, counter-clockwise; fingers = [{x, top}]
  const pts = [];
  const add = (x, y) => pts.push(new THREE.Vector3(x, y, 0));
  const arc = (cx, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; add(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
  const line = (xa, ya, xb, yb, n) => { for (let i = 1; i < n; i++) add(xa + ((xb - xa) * i) / n, ya + ((yb - ya) * i) / n); };
  const bottom = fingers.filter((f) => !f.top).sort((a, b) => a.x - b.x);
  const top = fingers.filter((f) => f.top).sort((a, b) => b.x - a.x);
  // bottom edge, left → right
  let x = -L / 2;
  add(x, -R);
  bottom.forEach((f) => {
    line(x, -R, f.x - w, -R, 6);
    add(f.x - w, -R);
    line(f.x - w, -R, f.x - w, -R + depth - w, 5);
    arc(f.x, -R + depth - w, w, Math.PI, 0, 8);
    line(f.x + w, -R + depth - w, f.x + w, -R, 5);
    add(f.x + w, -R);
    x = f.x + w;
  });
  line(x, -R, L / 2, -R, 6);
  arc(L / 2, 0, R, -Math.PI / 2, Math.PI / 2, 40);
  x = L / 2;
  top.forEach((f) => {
    line(x, R, f.x + w, R, 6);
    add(f.x + w, R);
    line(f.x + w, R, f.x + w, R - depth + w, 5);
    arc(f.x, R - depth + w, w, 0, -Math.PI, 8);
    line(f.x - w, R - depth + w, f.x - w, R, 5);
    add(f.x - w, R);
    x = f.x - w;
  });
  line(x, R, -L / 2, R, 6);
  arc(-L / 2, 0, R, Math.PI / 2, (3 * Math.PI) / 2, 40);
  pts.pop();
  return pts;
}

function rimTube(points, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(1400, points.length * 3), radius, 10, true), mat);
}

/** Crista lamella in the back half (z ≤ 0), bounded by the inner membrane. */
function cristaGeo(Ri, depth, w, top) {
  const zmax = Ri * 0.93;
  const shape = new THREE.Shape();
  const N = 28;
  const wall = (sx) => Math.sqrt(Math.max(0, Ri * Ri - sx * sx)) - 0.04;
  const dep = (sx) => depth * Math.sqrt(Math.max(0, 1 - Math.pow(sx / zmax, 4)));
  const sg = top ? 1 : -1;
  shape.moveTo(0, sg * wall(0));
  for (let i = 1; i <= N; i++) { const sx = (zmax * i) / N; shape.lineTo(sx, sg * wall(sx)); }
  for (let i = N; i >= 0; i--) { const sx = (zmax * i) / N; shape.lineTo(sx, sg * (wall(sx) - dep(sx))); }
  shape.closePath();
  const bev = 0.07;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.02, 2 * w - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 8 });
  geo.translate(0, 0, -(2 * w - 2 * bev) / 2);
  geo.rotateY(Math.PI / 2); // shape-x → −z (back half), extrusion → x
  geo.computeVertexNormals();
  return geo;
}

function mitoModel(o = {}) {
  const R = 2.95, Ri = 2.55, L = 7.6, w = 0.17, depth = 1.85;
  const outerGroup = new THREE.Group();
  const g = new THREE.Group();
  outerGroup.add(g);
  const local = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const clip = [local.clone()];
  const outerMat = new THREE.MeshPhysicalMaterial({ color: 0x4f86ff, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide, clippingPlanes: clip, emissive: new THREE.Color(0x4f86ff), emissiveIntensity: 0.06 });
  const outer = new THREE.Mesh(new THREE.CapsuleGeometry(R, L, 24, 80), outerMat);
  outer.rotation.z = Math.PI / 2;
  const innerMat = new THREE.MeshPhysicalMaterial({ color: 0x4b32b8, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4, side: THREE.DoubleSide, clippingPlanes: clip, emissive: new THREE.Color(0x4b32b8), emissiveIntensity: 0.1 });
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(Ri, L, 24, 80), innerMat);
  inner.rotation.z = Math.PI / 2;
  g.add(outer, inner);

  const cristaMat = new THREE.MeshPhysicalMaterial({ color: 0xd2a6ff, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: new THREE.Color(0xb27cff), emissiveIntensity: 0.12 });
  const N = 9;
  const fingers = [];
  const geoTop = cristaGeo(Ri, depth, w, true), geoBot = cristaGeo(Ri, depth, w, false);
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + 0.45 + (i * (L - 0.9)) / (N - 1);
    const top = i % 2 === 0;
    const m = new THREE.Mesh(top ? geoTop : geoBot, cristaMat);
    m.position.x = x;
    g.add(m);
    fingers.push({ x, top });
  }
  // cut-face rims (double membrane outlines)
  const outerRimMat = proteinMat(0x8fb3ff, { emissiveIntensity: 0.25 });
  const innerRimMat = proteinMat(0xd2a6ff, { emissiveIntensity: 0.25 });
  g.add(rimTube(stadium(R, L), 0.085, outerRimMat));
  g.add(rimTube(stadium(Ri, L, fingers, w + 0.02, depth + 0.02), 0.075, innerRimMat));

  // IMS fill on the cut face (shown when highlighted)
  const shp = new THREE.Shape(stadium(R - 0.05, L).map((p) => new THREE.Vector2(p.x, p.y)));
  shp.holes.push(new THREE.Path(stadium(Ri + 0.05, L).map((p) => new THREE.Vector2(p.x, p.y))));
  const imsMat = new THREE.MeshBasicMaterial({ color: 0xff8fc7, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const ims = new THREE.Mesh(new THREE.ShapeGeometry(shp, 24), imsMat);
  ims.position.z = 0.01;
  g.add(ims);

  // matrix glow + drifting granules
  const glowA = glowSprite(0x64d2ff, 1);
  glowA.scale.set(L + 2 * Ri, 2 * Ri * 1.4, 1);
  glowA.position.set(0, 0, -2.0);
  glowA.material.opacity = o.glow ?? 0.32;
  const glowB = glowSprite(0xbf5af2, 1);
  glowB.scale.set(L, 2 * Ri, 1);
  glowB.position.set(1.5, -0.4, -1.8);
  glowB.material.opacity = (o.glow ?? 0.32) * 0.7;
  g.add(glowA, glowB);
  const rnd = rng(11);
  const granules = [];
  for (let i = 0; i < 46; i++) {
    const p = glowSprite(i % 3 ? 0x9fe3ff : 0xd9b8ff, 0.16 + rnd() * 0.14);
    p.position.set((rnd() - 0.5) * (L + Ri), (rnd() - 0.5) * Ri * 1.3, -0.3 - rnd() * 1.6);
    p.userData = { base: p.position.clone(), ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.5 };
    g.add(p);
    granules.push(p);
  }

  const tick = (dt, t) => {
    outerGroup.updateMatrixWorld(true);
    clip[0].copy(local).applyMatrix4(g.matrixWorld);
    granules.forEach((p) => {
      const u = p.userData;
      p.position.set(u.base.x + Math.sin(t * u.sp + u.ph) * 0.25, u.base.y + Math.cos(t * u.sp * 0.8 + u.ph) * 0.18, u.base.z);
      p.material.opacity = 0.5 + 0.5 * Math.sin(t * u.sp * 2 + u.ph);
    });
  };
  return { root: outerGroup, g, tick, R, Ri, L, depth, fingers, mats: { outer: [outerMat, outerRimMat], inner: [innerMat, innerRimMat, cristaMat], cristae: [cristaMat] }, imsMat, glows: [glowA, glowB] };
}

function mitoScene(el, o = {}) {
  const kit = createScene(el, { cam: [0, 0, 30], fov: 30, autoRotate: 0, hint: !o.hero, ...o.scene });
  kit.renderer.localClippingEnabled = true;
  const M = mitoModel({ glow: o.hero ? 0.16 : 0.12 });
  kit.root.add(M.root);
  M.root.rotation.z = o.tilt ?? 0;
  const baseX = o.rx ?? 0.32;
  kit.onFrame((dt, t) => {
    M.g.rotation.y = -0.18 + Math.sin(t * 0.33) * (o.rock ?? 0.3);
    M.g.rotation.x = baseX + Math.sin(t * 0.21) * 0.06;
    M.tick(dt, t);
  });
  kit.fit(M.root, o.fill ?? 0.86);
  if (o.zoom) kit.camera.position.sub(kit.controls.target).multiplyScalar(o.zoom).add(kit.controls.target);
  return { kit, M };
}

// 1 · Hero
function heroViz(el) {
  const { kit, M } = mitoScene(el, { hero: true, tilt: 0.92, fill: 0.95, rock: 0.34, zoom: 0.66 });
  const halo = glowSprite(0x0a84ff, 14);
  halo.material.opacity = 0.22;
  halo.position.set(0, 0, -4);
  M.root.add(halo);
  return kitController(kit);
}

// 3 · Anatomy with leader-line labels
function anatomyViz(el) {
  const { kit, M } = mitoScene(el, { tilt: 0.0, fill: 0.97, rock: 0.22, rx: 0.36 });
  const { R, Ri, depth } = M;
  const botF = M.fingers.filter((f) => !f.top);
  const ANAT = [
    { key: 'outer', text: 'Outer membrane', anchor: [-2.0, R + 0.02, 0], at: [-3.9, 4.9, 0], tip: { title: 'Outer mitochondrial membrane', body: 'Smooth outer boundary of the mitochondrion.' + LIPP('freely permeable to most small molecules and ions.'), src: SRC('3, 10') } },
    { key: 'ims', text: 'Intermembrane space', anchor: [1.9, (R + Ri) / 2, 0], at: [3.7, 4.9, 0], tip: { title: 'Intermembrane space', body: 'Between the two membranes. Protons pumped by Complexes I, III and IV collect here → <b>low pH</b>, <b>positive</b> side.', src: SRC(10) } },
    { key: 'inner', text: 'Inner membrane', anchor: [3.4, -Ri - 0.02, 0], at: [4.6, -4.9, 0], tip: { title: 'Inner mitochondrial membrane', body: 'Holds the ETC complexes and ATP synthase (F₀ in the membrane).' + LIPP('impermeable to most ions, including H⁺ — that is what lets a gradient build.'), src: SRC('3, 13') } },
    { key: 'cristae', text: 'Cristae', anchor: [botF[1].x, -Ri + depth - 0.1, 0], at: [-0.4, -4.9, 0], tip: { title: 'Cristae', body: 'Folds of the inner membrane projecting into the matrix.' + LIPP('they greatly increase the surface area for the ETC and ATP synthase.'), src: SRC(3) } },
    { key: 'matrix', text: 'Matrix', anchor: [-3.0, -0.4, -0.6], at: [-5.4, -4.9, 0], tip: { title: 'Matrix', body: 'Interior of the mitochondrion: pyruvate → acetyl-CoA and the <b>TCA cycle</b> happen here. F₁ of ATP synthase faces the matrix. <b>High pH</b>, <b>negative</b> side.', src: SRC('6, 10, 13') } },
  ];
  const lineMat = new THREE.LineBasicMaterial({ color: 0x8e8e93, transparent: true, opacity: 0.85 });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lbl = {};
  ANAT.forEach((a) => {
    const A = new THREE.Vector3(...a.anchor), B = new THREE.Vector3(...a.at);
    const end = B.clone().sub(B.clone().sub(A).normalize().multiplyScalar(0.36));
    const geo = new THREE.BufferGeometry().setFromPoints([A, end]);
    const line = new THREE.Line(geo, lineMat);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), dotMat);
    dot.position.set(...a.anchor);
    M.g.add(line, dot);
    lbl[a.key] = kit.label(a.text, a.at, { parent: M.g, tip: a.tip });
  });
  const focusKeys = [null, 'outer', 'inner', 'ims', 'matrix'];
  const apply = (n) => {
    const k = focusKeys[n] || null;
    Object.entries(lbl).forEach(([key, o]) => {
      const on = !k || key === k || (k === 'inner' && key === 'cristae');
      o.element.style.opacity = on ? 1 : 0.35;
      o.element.classList.toggle('acc', !!k && on);
    });
    const hl = (mats, on, base) => mats.forEach((m) => gsap.to(m, { emissiveIntensity: on ? 0.55 : base, duration: 0.6 }));
    hl(M.mats.outer, k === 'outer', 0.08);
    hl(M.mats.inner, k === 'inner', 0.1);
    gsap.to(M.imsMat, { opacity: k === 'ims' ? 0.6 : 0, duration: 0.6 });
    M.glows.forEach((gl, i) => gsap.to(gl.material, { opacity: (k === 'matrix' ? 0.3 : 0.12) * (i ? 0.7 : 1), duration: 0.6 }));
  };
  return kitController(kit, { step: apply });
}

/* ================================================================== */
/* Shared 2D: electron staircase (slide 4)                             */
/* ================================================================== */
function stairViz(el) {
  const D = diagram(el, 960, 860);
  const N = [
    { id: 'nadh', t: 'NADH', x: 120, y: 60, col: ND },
    { id: 'fmn', t: 'FMN', x: 215, y: 147 },
    { id: 'fes', t: 'Fe-S', x: 310, y: 234 },
    { id: 'q', t: 'CoQ', x: 405, y: 321, mobile: true, col: 'var(--act)' },
    { id: 'b', t: 'cyt b', x: 500, y: 408 },
    { id: 'c1', t: 'cyt c_{1}', x: 595, y: 495 },
    { id: 'c', t: 'cyt c', x: 690, y: 582, mobile: true, col: 'var(--o2)' },
    { id: 'aa3', t: 'cyt a·a_{3}', x: 785, y: 669 },
    { id: 'o2', t: 'O_{2}', x: 875, y: 756, col: 'var(--o2)' },
  ];
  // energy axis (schematic)
  D.layers.edges.append(s('path', { d: 'M28,120 L28,800', style: 'stroke:var(--line-2);stroke-width:3;stroke-linecap:round' }));
  D.layers.edges.append(s('path', { d: 'M16,782 L28,804 L40,782', style: 'fill:none;stroke:var(--line-2);stroke-width:3;stroke-linecap:round;stroke-linejoin:round' }));
  const ax = s('text', { x: 0, y: 0, transform: 'translate(58 470) rotate(-90)', 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-3);font-weight:600' });
  ax.textContent = 'Electron energy falls (schematic)';
  D.layers.labels.append(ax);

  // group boxes (step 1)
  const box = (x1, y1, x2, y2, col, label, lx, ly, anchor, tipSpec) => {
    const g = s('g', { 'data-tip': JSON.stringify(tipSpec) });
    g.append(s('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 30, style: `fill:color-mix(in oklab, ${col} 12%, transparent);stroke:color-mix(in oklab, ${col} 55%, transparent);stroke-width:2.5` }));
    const t = s('text', { x: lx, y: ly, 'text-anchor': anchor, class: 'v-label', style: `fill:${col};font-weight:700` });
    t.textContent = label;
    g.append(t);
    D.layers.regions.append(g);
    return g;
  };
  const groups = [
    box(140, 106, 385, 276, 'var(--a1)', 'Complex I', 405, 150, 'start', CX.I),
    box(420, 366, 690, 538, 'var(--elec)', 'Complex III', 712, 412, 'start', CX.III),
    box(676, 627, 896, 712, 'var(--act)', 'Complex IV', 662, 684, 'end', CX.IV),
  ];
  N.forEach((n, i) => {
    const rec = D.node({ id: n.id, x: n.x, y: n.y, label: n.t, kind: 'mol', size: 26, color: n.col, tip: n.id === 'q' ? CX.Q : n.id === 'c' ? CX.c : undefined });
    if (n.mobile) rec.shape.style.strokeDasharray = '9 7';
    if (i) D.arrow({ from: N[i - 1].id, to: n.id, width: 3, color: 'var(--line-2)', headSize: 12, gapStart: 4, gapEnd: 6 });
  });
  const mob1 = D.text(482, 330, 'mobile', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3);font-weight:600' });
  const mob2 = D.text(766, 591, 'mobile', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3);font-weight:600' });
  const water = D.text(875, 822, '½O₂ + 2H⁺ → H₂O', { anchor: 'end', cls: 'sm', style: 'fill:var(--o2);font-weight:650' });
  // electron flow
  const pathD = 'M' + N.map((n) => `${n.x},${n.y}`).join(' L');
  const path = s('path', { d: pathD, style: 'fill:none;stroke:none' });
  D.layers.fx.append(path);
  const fl = D.flow(path, { count: 5, color: EL, speed: 190, r: 10 });
  fl.dots.forEach((d) => D.layers.labels.append(d));
  // FADH2 entry via Complex II (step 2)
  const fad = [];
  const fb = D.node({ id: 'fadh', x: 190, y: 640, label: 'FADH_{2}', kind: 'mol', size: 26, color: FD });
  const c2 = D.node({ id: 'cII', x: 262, y: 478, label: 'Complex II', sub: 'FAD · Fe-S', kind: 'enz', size: 24, color: FD, tip: CX.II });
  const a1 = D.arrow({ from: 'fadh', to: 'cII', width: 3, color: FD, headSize: 12 });
  const a2 = D.arrow({ from: 'cII', to: 'q', width: 3, color: FD, headSize: 12 });
  const p2 = s('path', { d: 'M190,640 L262,478 L405,321', style: 'fill:none;stroke:none' });
  D.layers.fx.append(p2);
  const fl2 = D.flow(p2, { count: 2, color: FD, speed: 150, r: 9, autoplay: false });
  fl2.dots.forEach((d) => D.layers.labels.append(d));
  fad.push(fb.g, c2.g, a1.g, a2.g);
  const g1 = [...groups, mob1, mob2];
  [...g1, ...fad].forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      show(g1, n >= 1);
      show(fad, n >= 2);
      n >= 2 ? fl2.play() : fl2.hide();
      water.style.opacity = 1;
    },
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* Definitions (slide 5)                                               */
/* ================================================================== */
function phosGlyph(D, x, y, nP, label, glowOn) {
  const g = s('g', { transform: `translate(${x} ${y})` });
  g.append(s('rect', { x: -82, y: -34, width: 164, height: 68, rx: 22, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2' }));
  const t = s('text', { x: 0, y: 9, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:26px;font-weight:650' });
  t.textContent = 'Adenosine';
  g.append(t);
  for (let i = 0; i < nP; i++) {
    const c = s('g', { transform: `translate(${108 + i * 56} 0)` });
    c.append(s('circle', { r: 24, style: `fill:${HP};${glowOn && i === nP - 1 ? '' : 'opacity:.9'}` }));
    const pt = s('text', { y: 9, 'text-anchor': 'middle', style: 'font:800 24px var(--font);fill:#1d1d1f' });
    pt.textContent = 'P';
    c.append(pt);
    g.append(c);
  }
  const lb = s('text', { x: 40, y: 78, 'text-anchor': 'middle', class: 'v-label sm', style: `fill:${glowOn ? AT : 'var(--fg-2)'};font-weight:700;font-size:26px` });
  lb.textContent = label;
  g.append(lb);
  D.layers.nodes.append(g);
  return g;
}

function defsViz(el) {
  const D = diagram(el, 960, 860);
  // --- redox row
  const ox = [], red = [], arc = [], phos = [], cpl = [];
  const donor = D.node({ id: 'nadh', x: 180, y: 190, label: 'NADH', kind: 'mol', size: 34, color: ND });
  const donor2 = D.node({ id: 'nad', x: 180, y: 330, label: 'NAD⁺', kind: 'mol', size: 30 });
  const dA = D.arrow({ from: 'nadh', to: 'nad', width: 3, color: 'var(--fg-3)', headSize: 12 });
  const acc = D.node({ id: 'o2', x: 780, y: 190, label: '½O_{2} + 2H⁺', kind: 'mol', size: 30, color: 'var(--o2)' });
  const acc2 = D.node({ id: 'h2o', x: 780, y: 330, label: 'H_{2}O', kind: 'mol', size: 30 });
  const aA = D.arrow({ from: 'o2', to: 'h2o', width: 3, color: 'var(--fg-3)', headSize: 12 });
  const eArc = D.arrow({ d: 'M280,170 C400,40 560,40 650,170', from: [280, 170], to: [650, 170], color: EL, width: 4, dash: '2 12' });
  const eB = D.badge(465, 26, '2e⁻', { color: EL, size: 26 });
  const fl = D.flow(eArc, { count: 4, color: EL, speed: 220, r: 10 });
  const oxT = D.badge(180, 420, 'Oxidised · lost e⁻', { color: ND, size: 24, w: 250 });
  const rdT = D.badge(780, 420, 'Reduced · gained e⁻', { color: AC, size: 24, w: 270 });
  ox.push(donor.g, donor2.g, dA.g, oxT);
  red.push(acc.g, acc2.g, aA.g, rdT);
  arc.push(eArc.g, eB);
  // --- coupling
  const cArrow = D.arrow({ from: [480, 140], to: [480, 566], color: 'var(--a2)', width: 6, dash: '12 12' });
  const cB = D.badge(480, 612, 'coupled = oxidative phosphorylation', { color: 'var(--a2)', size: 24, w: 470 });
  const fc = D.flow(cArrow, { count: 3, color: 'var(--a2)', speed: 160, r: 9, autoplay: false });
  cpl.push(cArrow.g, cB);
  // --- phosphorylation row
  const adp = phosGlyph(D, 100, 700, 2, 'ADP', false);
  const pi = s('g', { transform: 'translate(400 700)' });
  pi.append(s('circle', { r: 24, style: `fill:${HP}` }));
  const pit = s('text', { y: 9, 'text-anchor': 'middle', style: 'font:800 24px var(--font);fill:#1d1d1f' });
  pit.textContent = 'P';
  pi.append(pit);
  const pil = s('text', { y: 78, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:700;font-size:26px' });
  pil.textContent = 'Pᵢ';
  pi.append(pil);
  D.layers.nodes.append(pi);
  const plus = D.text(336, 712, '+', { anchor: 'middle', cls: 'lg', style: 'fill:var(--fg-3)' });
  const pA = D.arrow({ from: [448, 700], to: [552, 700], color: AT, width: 5 });
  const atp = phosGlyph(D, 660, 700, 3, 'ATP', true);
  const halo = s('circle', { cx: 880, cy: 700, r: 44, style: `fill:none;stroke:${AT};stroke-width:4;opacity:.0` });
  D.layers.fx.append(halo);
  phos.push(adp, pi, plus, pA.g, atp, halo);
  const all = { ox, red, arc, phos, cpl };
  const want = [null, ['phos'], ['ox', 'arc'], ['red', 'arc'], ['ox', 'red', 'arc', 'cpl', 'phos']];
  gsap.to(halo, { opacity: 0.9, scale: 1.25, svgOrigin: '880 700', duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  return {
    step(n) {
      const on = want[n];
      Object.entries(all).forEach(([k, els]) => gsap.to(els, { opacity: !on ? (k === 'cpl' ? 0.25 : 1) : on.includes(k) ? 1 : 0.18, duration: 0.5 }));
      n === 4 ? fc.play() : fc.hide();
      if (on && !on.includes('arc')) fl.hide(); else fl.play();
    },
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* Oxidative vs substrate-level (slide 6)                              */
/* ================================================================== */
function slpOxViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 0, y: 0, w: 960, h: 330, r: 36, label: 'Substrate-level', fill: 'var(--surface)' });
  D.region({ x: 0, y: 360, w: 960, h: 500, r: 36, label: 'Oxidative', fill: 'var(--surface)' });
  // lane A
  D.node({ id: 'sub', x: 180, y: 175, label: 'Substrate~P', kind: 'mol', size: 28 });
  D.node({ id: 'atpA', x: 520, y: 175, label: 'ATP', kind: 'mol', size: 32, color: AT });
  const aA = D.arrow({ from: 'sub', to: 'atpA', width: 4, color: HP, label: 'P → ADP', labelColor: HP, labelSide: -1 });
  D.badge(140, 280, 'No ETC', { color: 'var(--fg-3)', size: 22 });
  D.badge(285, 280, 'No O₂', { color: 'var(--fg-3)', size: 22 });
  D.text(520, 280, 'glycolysis · TCA cycle', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3);font-weight:600', tip: { title: 'Where SLP happens (slide 7)', body: 'ATP made directly in glycolysis (cytoplasm) and in the TCA cycle (matrix).' + LIPP('the TCA step (succinyl-CoA synthetase) makes GTP in many tissues.'), src: SRC('4, 6, 7') } });
  const fA = D.flow(aA, { count: 3, color: HP, speed: 130, r: 9 });
  // lane B
  D.node({ id: 'red', x: 160, y: 555, label: 'NADH · FADH_{2}', kind: 'mol', size: 26, color: ND });
  D.node({ id: 'etc', x: 430, y: 555, label: 'ETC', kind: 'box', size: 32, w: 150, h: 84, color: 'var(--a1)' });
  const o2 = D.node({ id: 'o2', x: 700, y: 555, label: 'O_{2} → H_{2}O', kind: 'mol', size: 26, color: 'var(--o2)' });
  D.node({ id: 'syn', x: 430, y: 755, label: 'ATP synthase', kind: 'enz', size: 26, color: AT });
  D.node({ id: 'atpB', x: 700, y: 755, label: 'ATP', kind: 'mol', size: 32, color: AT });
  const b1 = D.arrow({ from: 'red', to: 'etc', width: 4, color: EL, label: 'e⁻', labelColor: EL, labelSide: -1 });
  const b2 = D.arrow({ from: 'etc', to: 'o2', width: 4, color: EL, label: 'e⁻', labelColor: EL, labelSide: -1 });
  const b3 = D.arrow({ from: 'etc', to: 'syn', width: 4, color: HP, label: 'H⁺ gradient', labelColor: HP, labelSide: -1, labelOffset: 26 });
  const b4 = D.arrow({ from: 'syn', to: 'atpB', width: 4, color: AT });
  const fB = [D.flow(b1, { count: 2, color: EL, speed: 150, r: 9 }), D.flow(b2, { count: 2, color: EL, speed: 150, r: 9 }), D.flow(b3, { count: 2, color: HP, speed: 120, r: 9 }), D.flow(b4, { count: 2, color: AT, speed: 120, r: 9 })];
  const cross = s('g', { style: 'opacity:0' });
  cross.append(s('path', { d: 'M620,515 L780,595 M780,515 L620,595', style: `stroke:${IN};stroke-width:7;stroke-linecap:round` }));
  D.layers.labels.append(cross);
  // counters
  const ctr = (y, label) => {
    const v = D.text(880, y, '0', { anchor: 'end', cls: 'xl', style: `fill:${AT};font-size:64px;font-variant-numeric:tabular-nums` });
    D.text(880, y + 40, label, { anchor: 'end', cls: 'sm', style: 'fill:var(--fg-2)' });
    return v;
  };
  const vA = ctr(190, 'ATP made');
  const vB = ctr(660, 'ATP made');
  let nA = 0, nB = 0, accA = 0, accB = 0, raf = null, last = 0, o2on = true;
  const loop = (t) => {
    const dt = Math.min(0.1, (t - (last || t)) / 1000);
    last = t;
    accA += dt; if (accA > 1.2) { accA = 0; vA.textContent = ++nA; }
    if (o2on) { accB += dt; if (accB > 0.42) { accB = 0; vB.textContent = ++nB; } }
    raf = requestAnimationFrame(loop);
  };
  const set = (on) => {
    o2on = on;
    gsap.to(cross, { opacity: on ? 0 : 1, duration: 0.4 });
    gsap.to([b1.g, b2.g, b3.g, b4.g, D.nodes.syn.g, D.nodes.atpB.g, D.nodes.etc.g], { opacity: on ? 1 : 0.3, duration: 0.5 });
    gsap.to(o2.g, { opacity: on ? 1 : 0.5, duration: 0.5 });
    fB.forEach((f) => (on ? f.play() : f.hide()));
  };
  const t = toggle({ label: 'Oxygen available', on: true, onChange: set });
  tip(t.el, { title: 'No oxygen?', body: 'O₂ is the final electron acceptor. Without it electron transport — and ATP synthase — stop. Substrate-level phosphorylation carries on.', src: SRC('4, 6') });
  ctrlBar(el, [t], { right: 22, top: 380 });
  return {
    enter() { last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
    leave() { cancelAnimationFrame(raf); },
    step: (n) => t.set(n === 0),
    destroy() { cancelAnimationFrame(raf); fA.destroy(); D.destroy(); },
  };
}

/* ================================================================== */
/* Nutrients → reduced coenzymes → ETC (slide 7)                       */
/* ================================================================== */
function nutrientsViz(el) {
  const D = diagram(el, 1712, 720);
  D.svg.setAttribute('viewBox', '0 66 1712 720');
  const s1 = [], s2 = [], s3 = [];
  const fuels = [['Glucose', 150], ['Fatty acids', 360], ['Amino acids', 570]];
  fuels.forEach(([t, y], i) => D.node({ id: `f${i}`, x: 150, y, label: t, kind: 'mol', size: 30 }));
  D.node({ id: 'cat', x: 450, y: 360, label: 'Catabolism', kind: 'enz', size: 28, color: 'var(--a2)' });
  fuels.forEach((_, i) => s1.push(D.arrow({ from: `f${i}`, to: 'cat', width: 3, color: 'var(--line-2)', curve: i === 1 ? 0 : i ? -40 : 40, headSize: 12 }).g));
  const nadh = D.node({ id: 'nadh', x: 700, y: 230, label: 'NADH + H⁺', kind: 'mol', size: 30, color: ND });
  const fadh = D.node({ id: 'fadh', x: 700, y: 490, label: 'FADH_{2}', kind: 'mol', size: 30, color: FD });
  s1.push(D.arrow({ from: 'cat', to: 'nadh', width: 4, color: ND }).g, D.arrow({ from: 'cat', to: 'fadh', width: 4, color: FD }).g, nadh.g, fadh.g, D.nodes.cat.g);
  s1.push(D.text(700, 140, 'Reduced coenzymes', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3);font-weight:700;letter-spacing:.12em;text-transform:uppercase' }));
  // ETC cylinder
  const etc = s('g');
  etc.append(s('rect', { x: 880, y: 300, width: 520, height: 120, rx: 60, style: 'fill:var(--surface-2);stroke:var(--line-2);stroke-width:2' }));
  const shapes = [
    { x: 960, col: 'var(--act)', n: 6 }, { x: 1080, col: 'var(--a2)', n: 5 }, { x: 1200, col: 'var(--a1)', n: 6 }, { x: 1320, col: 'var(--elec)', n: 5 },
  ];
  shapes.forEach((sh) => {
    const pts = Array.from({ length: sh.n }, (_, k) => { const a = (k / sh.n) * Math.PI * 2 - Math.PI / 2; return `${sh.x + Math.cos(a) * 40},${360 + Math.sin(a) * 40}`; }).join(' ');
    etc.append(s('polygon', { points: pts, style: `fill:color-mix(in oklab, ${sh.col} 30%, transparent);stroke:${sh.col};stroke-width:3;stroke-linejoin:round` }));
  });
  D.layers.nodes.append(etc);
  const etcT = D.text(1000, 282, 'ETC  ·  respiratory chain', { anchor: 'start', cls: 'sm', style: 'fill:var(--fg-2);font-weight:650' });
  const eN = D.arrow({ d: 'M790,250 C880,250 940,250 960,312', from: [790, 250], to: [960, 312], color: ND, width: 4 });
  const eF = D.arrow({ d: 'M780,470 C900,470 1060,470 1080,408', from: [780, 470], to: [1080, 408], color: FD, width: 4 });
  const bN = D.badge(880, 215, '2e⁻', { color: ND, size: 24 });
  const bF = D.badge(940, 505, '2e⁻', { color: FD, size: 24 });
  const wave = s('path', { d: 'M960,360 q30,-34 60,0 t60,0 t60,0 t60,0 t60,0 t60,0 L1480,360', style: `fill:none;stroke:${EL};stroke-width:3;stroke-dasharray:6 9;opacity:.8` });
  D.layers.edges.append(wave);
  D.node({ id: 'o2', x: 1590, y: 250, label: '½O_{2} + 2H⁺', kind: 'mol', size: 28, color: 'var(--o2)' });
  D.node({ id: 'h2o', x: 1590, y: 420, label: 'H_{2}O', kind: 'mol', size: 30 });
  const eO = D.arrow({ d: 'M1400,360 C1460,360 1480,300 1500,270', from: [1400, 360], to: [1500, 270], color: EL, width: 4 });
  const bO = D.badge(1460, 395, '2e⁻', { color: EL, size: 24 });
  const aw = D.arrow({ from: 'o2', to: 'h2o', width: 4, color: 'var(--o2)' });
  s2.push(etc, etcT, eN.g, eF.g, bN, bF, wave, D.nodes.o2.g, D.nodes.h2o.g, eO.g, bO, aw.g);
  const fl = [D.flow(eN, { count: 2, color: ND, speed: 160, r: 9, autoplay: false }), D.flow(eF, { count: 2, color: FD, speed: 160, r: 9, autoplay: false }), D.flow(wave, { count: 4, color: EL, speed: 170, r: 9, autoplay: false }), D.flow(eO, { count: 2, color: EL, speed: 150, r: 9, autoplay: false })];
  // phosphorylation
  D.node({ id: 'adp', x: 1000, y: 560, label: 'ADP + P_{i}', kind: 'mol', size: 28 });
  D.node({ id: 'atp', x: 1410, y: 560, label: 'ATP', kind: 'mol', size: 34, color: AT });
  const pa = D.arrow({ from: 'adp', to: 'atp', width: 5, color: AT, label: 'Phosphorylation', labelColor: AT, labelSide: 1, labelOffset: 22 });
  const en = D.arrow({ from: [1205, 425], to: [1205, 535], color: 'var(--a2)', width: 4, dash: '8 8', headSize: 12 });
  const brace = s('path', { d: 'M880,640 q0,26 26,26 L1114,666 q26,0 36,26 q10,-26 36,-26 L1384,666 q26,0 26,-26', style: 'fill:none;stroke:var(--a2);stroke-width:4;stroke-linecap:round' });
  D.layers.edges.append(brace);
  const bt = D.text(1145, 716, 'Oxidative phosphorylation = coupling of the two', { anchor: 'middle', cls: 'sm', style: 'fill:var(--ink);font-weight:700' });
  s3.push(D.nodes.adp.g, D.nodes.atp.g, pa.g, en.g, brace, bt);
  const fp = D.flow(pa, { count: 2, color: AT, speed: 120, r: 9, autoplay: false });
  [...s1, ...s2, ...s3].forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      show(s1, n >= 1);
      show(s2, n >= 2);
      show(s3, n >= 3);
      fl.forEach((f) => (n >= 2 ? f.play() : f.hide()));
      n >= 3 ? fp.play() : fp.hide();
    },
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* Cellular respiration map (slide 8)                                  */
/* ================================================================== */
function respirationViz(el) {
  const D = diagram(el, 1712, 720);
  D.region({ x: 0, y: 0, w: 1712, h: 720, r: 40, label: 'Cytoplasm', fill: 'color-mix(in oklab, var(--atp) 4%, transparent)' });
  // mitochondrion: outer + inner membranes; IMS strip along the bottom
  D.layers.regions.append(s('rect', { x: 640, y: 24, width: 1050, height: 676, rx: 70, style: 'fill:color-mix(in oklab, var(--a2) 7%, transparent);stroke:color-mix(in oklab, var(--a2) 55%, transparent);stroke-width:3' }));
  D.layers.regions.append(s('rect', { x: 662, y: 46, width: 1006, height: 590, rx: 54, style: 'fill:color-mix(in oklab, var(--a1) 8%, transparent);stroke:color-mix(in oklab, var(--a1) 60%, transparent);stroke-width:3' }));
  D.text(700, 96, 'MITOCHONDRION · MATRIX', { cls: 'sm', style: 'fill:var(--fg-2);font-weight:650;letter-spacing:.14em' });
  D.text(690, 624, 'Inner membrane', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3);font-weight:650' });
  D.text(690, 678, 'Intermembrane space', { cls: 'sm', style: 'font-size:20px;fill:var(--fg-3);font-weight:650' });
  const st = [[], [], [], []];
  const slpBadge = (x, y, tipBody) => {
    const b = D.badge(x, y, 'ATP', { color: AT, size: 26, tip: { title: 'Substrate-level phosphorylation', body: tipBody, src: SRC('6, 7') } });
    b.querySelector('rect').style.strokeDasharray = '6 5';
    b.querySelector('rect').style.fill = 'transparent';
    return b;
  };
  // glycolysis
  D.node({ id: 'glc', x: 300, y: 110, label: 'Glucose', kind: 'mol', size: 30 });
  D.node({ id: 'gly', x: 300, y: 300, label: 'Glycolysis', kind: 'enz', size: 28, color: 'var(--a2)' });
  D.node({ id: 'pyr', x: 300, y: 500, label: 'Pyruvate', kind: 'mol', size: 30 });
  const g1 = D.arrow({ from: 'glc', to: 'gly', width: 4, color: 'var(--a2)' });
  const g2 = D.arrow({ from: 'gly', to: 'pyr', width: 4, color: 'var(--a2)' });
  const gA = slpBadge(110, 300, 'Glycolysis makes ATP directly in the cytoplasm.');
  const gN = D.badge(490, 300, 'NADH + H⁺', { color: ND, size: 24 });
  const gaA = D.arrow({ from: [220, 300], to: [160, 300], color: AT, width: 3, headSize: 11 });
  const gaN = D.arrow({ from: [384, 300], to: [412, 300], color: ND, width: 3, headSize: 11 });
  // shuttle gate on the membranes
  const gate = s('g', { 'data-tip': JSON.stringify({ kicker: 'Accuracy note', title: 'Cytosolic NADH needs a shuttle', body: 'The inner membrane is impermeable to NADH, so its electrons enter via the <b>glycerol-3-phosphate</b> or <b>malate–aspartate</b> shuttle. (Slide 7 draws a direct arrow — a simplification; shuttles are not covered in this lecture.)', src: 'Lippincott · slide 7' }) });
  gate.append(s('rect', { x: 628, y: 274, width: 46, height: 52, rx: 14, style: 'fill:var(--bg);stroke:var(--fg-3);stroke-width:2.5;stroke-dasharray:5 5' }));
  const gq = s('text', { x: 651, y: 309, 'text-anchor': 'middle', style: 'font:800 26px var(--font);fill:var(--fg-2)' });
  gq.textContent = '?';
  gate.append(gq);
  D.layers.labels.append(gate);
  const sh = D.arrow({ from: [572, 300], to: [622, 300], color: ND, width: 3, dash: '6 6', headSize: 11 });
  const shT = D.text(560, 360, 'via shuttles', { anchor: 'middle', cls: 'sm', style: 'font-size:21px;fill:var(--fg-3);font-weight:600' });
  st[0].push(D.nodes.gly.g, D.nodes.pyr.g, g1.g, g2.g, gA, gN, gaA.g, gaN.g, gate, sh.g, shT);
  // pyruvate → acetyl-CoA
  D.node({ id: 'aca', x: 800, y: 500, label: 'Acetyl-CoA', kind: 'mol', size: 28 });
  const pa = D.arrow({ from: 'pyr', to: 'aca', width: 4, color: 'var(--fg-3)' });
  st[1].push(D.nodes.aca.g, pa.g);
  // TCA cycle
  const tca = s('g', { transform: 'translate(1010 270)' });
  tca.append(s('circle', { r: 112, style: 'fill:color-mix(in oklab, var(--act) 10%, transparent);stroke:var(--act);stroke-width:4;stroke-dasharray:22 10' }));
  const tt = s('text', { y: 11, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:32px;font-weight:700;fill:var(--act)' });
  tt.textContent = 'TCA cycle';
  tca.append(tt);
  D.layers.nodes.append(tca);
  const spin = gsap.to(tca.querySelector('circle'), { rotation: 360, transformOrigin: '50% 50%', duration: 16, repeat: -1, ease: 'none' });
  const ta = D.arrow({ from: 'aca', to: [920, 350], width: 4, color: 'var(--act)' });
  const tN = D.badge(940, 450, 'NADH + H⁺', { color: ND, size: 24 });
  const tF = D.badge(1110, 450, 'FADH₂', { color: FD, size: 24 });
  const tA = slpBadge(1215, 230, 'The TCA cycle makes one high-energy phosphate per turn (shown on slide 7 as ATP).' + LIPP('it is GTP in many tissues.'));
  const tAa = D.arrow({ from: [1124, 250], to: [1170, 236], color: AT, width: 3, headSize: 11 });
  st[2].push(tca, ta.g, tN, tF, tA, tAa.g);
  // inner membrane complexes on the bottom edge (y = 636)
  const Y = 636;
  const cx = [
    { k: 'I', x: 940, col: 'var(--a1)' }, { k: 'II', x: 1100, col: FD, dy: -14 }, { k: 'III', x: 1250, col: 'var(--elec)' }, { k: 'IV', x: 1390, col: 'var(--act)' },
  ];
  cx.forEach((c) => {
    const g = s('g', { transform: `translate(${c.x} ${Y + (c.dy || 0)})`, 'data-tip': JSON.stringify(CX[c.k]) });
    g.append(s('rect', { x: -40, y: -34, width: 80, height: 68, rx: 20, style: `fill:color-mix(in oklab, ${c.col} 26%, var(--bg));stroke:${c.col};stroke-width:3` }));
    const t = s('text', { y: 10, 'text-anchor': 'middle', style: `font:750 28px var(--font);fill:var(--fg)` });
    t.textContent = c.k;
    g.append(t);
    D.layers.nodes.append(g);
    st[3].push(g);
  });
  const syn = s('g', { transform: `translate(1560 ${Y})`, 'data-tip': JSON.stringify(CX.V) });
  syn.append(s('rect', { x: -26, y: -30, width: 52, height: 60, rx: 12, style: 'fill:color-mix(in oklab, var(--atp) 22%, var(--bg));stroke:var(--atp);stroke-width:3' }));
  syn.append(s('rect', { x: -8, y: -86, width: 16, height: 58, style: 'fill:var(--atp);opacity:.7' }));
  syn.append(s('circle', { cy: -118, r: 40, style: 'fill:color-mix(in oklab, var(--atp) 26%, var(--bg));stroke:var(--atp);stroke-width:3' }));
  const f1 = s('text', { y: -108, 'text-anchor': 'middle', style: 'font:750 26px var(--font);fill:var(--fg)' });
  f1.textContent = 'F₁';
  syn.append(f1);
  D.layers.nodes.append(syn);
  const nI = D.arrow({ from: [940, 478], to: [940, 594], width: 3, color: ND, headSize: 11 });
  const fII = D.arrow({ from: [1105, 478], to: [1102, 580], width: 3, color: FD, headSize: 11 });
  const ePath = s('path', { d: `M940,${Y} L1250,${Y} L1390,${Y}`, style: 'fill:none;stroke:none' });
  const e2Path = s('path', { d: `M1100,${Y - 14} L1250,${Y}`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(ePath, e2Path);
  const o2 = D.text(1390, 520, '½O₂ + 2H⁺ → H₂O', { anchor: 'middle', cls: 'sm', style: 'fill:var(--o2);font-weight:700' });
  const o2a = D.arrow({ from: [1390, 596], to: [1390, 540], width: 3, color: 'var(--o2)', headSize: 11 });
  const atpOx = D.badge(1560, 400, 'ATP', { color: AT, size: 30, tip: { title: 'Oxidative phosphorylation', body: 'ATP made by ATP synthase, driven by the H⁺ gradient that electron transport creates. Needs the ETC and O₂.', src: SRC('4, 7') } });
  const adp = D.text(1560, 345, 'ADP + Pᵢ', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:650' });
  const synA = D.arrow({ from: [1560, 470], to: [1560, 424], width: 4, color: AT, headSize: 12 });
  st[3].push(syn, nI.g, fII.g, o2, o2a.g, atpOx, adp, synA.g);
  const flows = [
    D.flow(ePath, { count: 4, color: EL, speed: 150, r: 9, autoplay: false }),
    D.flow(e2Path, { count: 1, color: FD, speed: 120, r: 8, autoplay: false }),
    D.flow(nI, { count: 2, color: ND, speed: 120, r: 8, autoplay: false }),
    D.flow(fII, { count: 1, color: FD, speed: 110, r: 8, autoplay: false }),
    D.flow(synA, { count: 1, color: AT, speed: 70, r: 9, autoplay: false }),
  ];
  const pf = [D.flow(pa, { count: 2, color: 'var(--fg-2)', speed: 140, r: 8, autoplay: false }), D.flow(g2, { count: 2, color: 'var(--a2)', speed: 120, r: 8, autoplay: false })];
  // legend
  const leg = s('g', { transform: 'translate(40 660)' });
  const l1 = s('rect', { x: 0, y: -18, width: 70, height: 36, rx: 18, style: `fill:transparent;stroke:${AT};stroke-width:2;stroke-dasharray:6 5` });
  const l2 = s('rect', { x: 290, y: -18, width: 70, height: 36, rx: 18, style: `fill:color-mix(in oklab, ${AT} 18%, transparent);stroke:color-mix(in oklab, ${AT} 60%, transparent);stroke-width:2` });
  const t1 = s('text', { x: 84, y: 8, class: 'v-label sm', style: 'font-size:22px;fill:var(--fg-2)' }); t1.textContent = 'substrate-level';
  const t2 = s('text', { x: 374, y: 8, class: 'v-label sm', style: 'font-size:22px;fill:var(--fg-2)' }); t2.textContent = 'oxidative';
  leg.append(l1, t1, l2, t2);
  D.layers.labels.append(leg);
  st.flat().forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      st.forEach((g, i) => show(g, n >= i + 1));
      pf.forEach((f, i) => ((i === 0 ? n >= 2 : n >= 1) ? f.play() : f.hide()));
      flows.forEach((f) => (n >= 4 ? f.play() : f.hide()));
    },
    destroy() { spin.kill(); D.destroy(); },
  };
}

/* ================================================================== */
/* Component cards minis (slide 9)                                     */
/* ================================================================== */
function pumpMini(el, n) {
  el.style.minHeight = '0';
  const D = diagram(el, 470, 96);
  D.svg.style.height = '96px';
  D.layers.regions.append(s('rect', { x: 0, y: 34, width: 300, height: 30, rx: 15, style: 'fill:var(--surface-3)' }));
  D.layers.regions.append(s('rect', { x: 95, y: 10, width: 110, height: 78, rx: 22, style: `fill:color-mix(in oklab, var(--a1) 18%, transparent);stroke:color-mix(in oklab, var(--a1) 50%, transparent);stroke-width:2` }));
  for (let i = 0; i < n; i++) {
    const x = 112 + (i * 76) / Math.max(1, n - 1);
    const p = s('path', { d: `M${n === 1 ? 150 : x},96 L${n === 1 ? 150 : x},0`, style: 'fill:none;stroke:none' });
    D.layers.fx.append(p);
    D.flow(p, { count: 1, color: HP, speed: 55 + i * 6, r: 8 });
  }
  D.text(330, 64, `${n} H⁺`, { cls: 'xl', style: `fill:${n ? HP : 'var(--fg-3)'};font-size:44px` });
  if (!n) D.text(150, 58, '—', { anchor: 'middle', cls: 'lg', style: 'fill:var(--fg-3)' });
  return { destroy: () => D.destroy() };
}

async function carrierMini(el, kind) {
  el.style.cssText += ';position:absolute;right:0;top:0;bottom:0;width:46%;min-height:0;flex:none';
  const kit = createScene(el, { cam: [0, 0, 18], autoRotate: 2.2, hint: false });
  let obj;
  if (kind === 'q') {
    obj = buildMolecule(await loadMol('ubiquinone'), { hideH: 'nonpolar' });
  } else {
    obj = buildProtein(await loadPDB('1HRC'), { colorBy: 'ss', hets: ['HEC'], hetScale: 1.3 });
  }
  kit.root.add(obj);
  kit.fit(obj, kind === 'q' ? 0.96 : 1.02);
  return autoRun(kit, el);
}

/* ================================================================== */
/* ETC live — the showpiece (slides 10 & 20)                           */
/* ================================================================== */
const XS = 7.8; // ATP synthase x position
const V3 = (a) => new THREE.Vector3(...a);

function etcModel() {
  const root = new THREE.Group();
  const holes = [
    { x: -8.55, z: 0, rx: 2.05, rz: 1.35 },
    { x: -4.85, z: 0.15, rx: 0.95, rz: 0.95, leaf: 'lower' },
    { x: -2.45, z: 0, rx: 1.6, rz: 1.25 },
    { x: 2.4, z: 0, rx: 1.6, rz: 1.25 },
    { x: XS + 0.45, z: 0, rx: 1.8, rz: 1.25 },
  ];
  const mem = membrane({ x0: -12.6, x1: 12.6, z0: -3.8, z1: 1.55, holes });
  root.add(mem);
  const cx = {
    I: protein([[-9.9, 0, 0, 0.8, 1.05, 1.15], [-9.0, 0.05, 0.05, 0.85, 1.1, 1.2], [-8.1, 0, 0, 0.85, 1.08, 1.15], [-7.25, -0.1, 0, 0.75, 1.05, 1.1], [-6.95, -1.55, 0.1, 0.78, 0.95, 0.95], [-6.75, -2.6, 0.15, 0.95, 0.85, 1.0], [-6.55, -3.45, 0.2, 0.7, 0.55, 0.75]], 0x6f6cff, 1),
    II: protein([[-4.85, -1.25, 0.2, 0.85, 0.72, 0.9], [-4.7, -2.0, 0.25, 0.75, 0.6, 0.8]], 0xc77dff, 2),
    III: protein([[-2.95, 0.1, 0, 0.82, 2.0, 1.05], [-1.95, 0.2, -0.05, 0.82, 2.05, 1.0], [-2.45, 1.85, 0, 1.2, 0.5, 0.85], [-2.45, -1.7, 0, 1.35, 0.62, 1.0]], 0x2cc4d8, 3),
    IV: protein([[1.95, 0.05, 0, 0.9, 1.9, 1.05], [2.85, 0, 0.05, 0.85, 1.8, 1.0], [2.4, 1.55, 0, 1.05, 0.5, 0.8], [2.4, -1.6, 0, 1.15, 0.55, 0.9]], 0x3ccf6e, 4),
  };
  Object.values(cx).forEach((g) => root.add(g));
  // ATP synthase
  const V = new THREE.Group();
  V.position.set(XS, 0, 0);
  root.add(V);
  const syn = synthaseParts(V);
  const coq = protein([[0, 0, 0, 0.42, 0.36, 0.42]], 0xc9f25e, 8);
  coq.position.set(-7.05, 0, 1.0);
  const cytc = protein([[0, 0, 0, 0.5, 0.48, 0.5]], 0xff5a5f, 9);
  cytc.position.set(-1.75, 1.95, 0.8);
  root.add(coq, cytc);
  const pore = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.3, 28, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xff7a3d, emissive: new THREE.Color(0xff4a10), emissiveIntensity: 0.7, roughness: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  pore.position.set(5.0, 0, 1.0);
  pore.visible = false;
  root.add(pore);
  const plug = protein([[0, 0, 0, 0.5, 0.4, 0.5]], 0xff3b30, 11);
  plug.position.set(XS + 1.05, 1.45, 0.55);
  plug.userData.mat.emissiveIntensity = 0.45;
  plug.visible = false;
  root.add(plug);
  return { root, mem, cx, V, ...syn, coq, cytc, pore, plug };
}

/** ATP synthase parts into group V (local origin = c-ring centre, membrane mid-plane). IMS = +y, matrix = −y. */
function synthaseParts(V) {
  const rotor = new THREE.Group();
  V.add(rotor);
  const cMat = proteinMat(0xf7a65e);
  const ring = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.05, 20), cMat);
    m.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82);
    rotor.add(m);
    ring.push(m);
  }
  const gMat = proteinMat(0x34b866);
  const gamma = cylinderBetween([0, -0.35, 0], [0, -3.2, 0], 0.2, gMat, 20);
  rotor.add(gamma);
  const epsMat = proteinMat(0x9be7b0);
  const eps = new THREE.Mesh(blobGeo(9), epsMat);
  eps.position.set(0.34, -1.3, 0.3);
  eps.scale.setScalar(0.3);
  rotor.add(eps);
  const a = protein([[1.32, 0, 0, 0.42, 1.05, 0.62]], 0xff6ea8, 5);
  V.add(a);
  const bMat = proteinMat(0xb07cff);
  const b2 = new THREE.Group();
  b2.add(cylinderBetween([1.4, -0.9, 0], [1.42, -4.55, 0], 0.13, bMat, 14), cylinderBetween([1.42, -4.55, 0], [0.62, -5.08, 0], 0.13, bMat, 14));
  V.add(b2);
  const delta = protein([[0.45, -5.08, 0, 0.42, 0.3, 0.42]], 0xff5470, 6);
  V.add(delta);
  const head = new THREE.Group();
  head.position.set(0, -3.75, 0);
  V.add(head);
  const aMat = proteinMat(0x7b6cf6), bbMat = proteinMat(0xa9d2ff);
  const alpha = [], beta = [];
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const isA = k % 2 === 0;
    const m = new THREE.Mesh(blobGeo(10 + k, 0.05), isA ? aMat : bbMat);
    m.position.set(Math.cos(ang) * 0.64, 0, Math.sin(ang) * 0.64);
    m.scale.set(0.5, 1.06, 0.5);
    head.add(m);
    (isA ? alpha : beta).push(m);
  }
  return { rotor, ring, gamma, eps, a, b2, delta, head, alpha, beta, mats: { c: cMat, g: gMat, e: epsMat, a: a.userData.mat, b: bMat, d: delta.userData.mat, al: aMat, be: bbMat } };
}

const SEG = {
  I: { pts: [[-6.5, -3.85, 1.45], [-6.75, -2.7, 1.5], [-6.95, -1.55, 1.5], [-7.3, -0.45, 1.45], [-7.05, 0, 1.45]], dur: 1.15, pump: [-9.75, -9.05, -8.35, -7.65], site: 'I' },
  Q: { pts: [[-7.05, 0, 1.45], [-5.0, 0.05, 1.45], [-3.15, 0, 1.45]], dur: 1.0, carrier: 'q' },
  II: { pts: [[-4.6, -2.7, 1.45], [-4.75, -1.9, 1.5], [-4.85, -1.0, 1.5], [-4.85, -0.05, 1.45]], dur: 0.9, site: 'II' },
  Qf: { pts: [[-4.85, -0.05, 1.45], [-3.15, 0, 1.45]], dur: 0.6, carrier: 'q' },
  III: { pts: [[-3.15, 0, 1.45], [-2.75, 0.75, 1.55], [-2.3, 1.45, 1.55], [-1.75, 1.95, 1.4]], dur: 0.75, pump: [-3.1, -2.7, -2.25, -1.85], site: 'III' },
  c: { pts: [[-1.75, 1.95, 1.4], [0, 2.1, 1.4], [1.75, 1.95, 1.4]], dur: 0.9, carrier: 'c' },
  IV: { pts: [[1.75, 1.95, 1.4], [2.2, 1.15, 1.55], [2.4, 0, 1.55], [2.5, -1.2, 1.55], [2.6, -2.35, 1.45]], dur: 0.85, pump: [2.05, 2.75], water: true, site: 'IV' },
};
Object.values(SEG).forEach((sg) => { sg.curve = new THREE.CatmullRomCurve3(sg.pts.map(V3), false, 'centripetal'); });
const ROUTE = { NADH: ['I', 'Q', 'III', 'c', 'IV'], FADH2: ['II', 'Qf', 'III', 'c', 'IV'] };
const INHIB = {
  I: { html: 'Rotenone · amobarbital · piericidin', at: [-8.55, 3.5, 0.5] },
  III: { html: 'Antimycin A · dimercaprol (BAL)', at: [-2.45, 3.5, 0.5] },
  IV: { html: 'Cyanide · CO · H₂S', at: [2.4, 3.5, 0.5] },
  F0: { html: 'Oligomycin', at: [XS + 0.6, 3.5, 0.5] },
};

function etcScene(el, mode = 'tour') {
  el.style.overflow = 'hidden';
  const WIDE = { p: [0, 2.2, 26.5], t: [0, -0.35, 0] };
  const kit = createScene(el, { cam: WIDE.p, target: WIDE.t, fov: 30, autoRotate: 0, hint: false });
  kit.wrap.style.overflow = 'hidden';
  const ctl = kit.controls;
  ctl.minAzimuthAngle = -0.75; ctl.maxAzimuthAngle = 0.75; ctl.minPolarAngle = 0.95; ctl.maxPolarAngle = 1.85;
  const M = etcModel();
  kit.root.add(M.root);
  const rnd = rng(7);

  /* ---------- labels ---------- */
  const cxLabel = (name, n) => `${name}<span class="pp" style="display:inline-block;margin-left:10px;color:var(--prot);font-weight:750">${n} H⁺</span>`;
  const L = {
    I: kit.label(cxLabel('Complex I', 4), [-8.55, 4.4, 0], { tip: CX.I }),
    III: kit.label(cxLabel('Complex III', 4), [-2.45, 4.4, 0], { tip: CX.III }),
    IV: kit.label(cxLabel('Complex IV', 2), [2.4, 4.4, 0], { tip: CX.IV }),
    V: kit.label('ATP synthase', [XS + 0.45, 4.4, 0], { tip: CX.V }),
    II: kit.label(cxLabel('Complex II', 0), [-3.75, -3.3, 1], { tip: CX.II }),
    Q: kit.label('CoQ', [0, 1.35, 0.3], { cls: 'sm', parent: M.coq, tip: CX.Q }),
    c: kit.label('Cyt c', [0, 1.0, 0], { cls: 'sm', parent: M.cytc, tip: CX.c }),
    nadh: kit.label('NADH → NAD⁺', [-7.9, -4.55, 1], { cls: 'sm plain' }),
    fadh: kit.label('FADH₂ → FAD', [-4.25, -4.55, 1], { cls: 'sm plain' }),
    o2: kit.label('½O₂ + 2H⁺ → H₂O', [2.95, -3.2, 1.2], { cls: 'sm plain' }),
    atp: kit.label('ADP + P<sub>i</sub> → ATP', [XS - 3.3, -4.5, 1.2], { cls: 'sm plain' }),
    ims: kit.label('Intermembrane space · <b style="color:var(--prot)">↓pH +</b>', [-11.4, 2.15, 0], { cls: 'sm plain' }),
    mx: kit.label('Matrix · <b style="color:var(--nadh)">↑pH −</b>', [-11.6, -2.3, 0], { cls: 'sm plain' }),
  };
  const block = kit.label('', [0, 0, 0], { cls: 'sm' });
  block.element.style.color = 'var(--inh)';
  block.element.style.borderColor = 'color-mix(in oklab, var(--inh) 60%, transparent)';
  block.visible = false;
  const leakL = kit.label('Uncoupler · H⁺ leak', [5.0, 3.3, 1.2], { cls: 'sm', tip: { title: 'Uncouplers', body: 'Make the inner membrane abnormally permeable to H⁺, so protons leak back to the matrix without passing ATP synthase. Electron flow continues; energy is released as heat.', list: ['2,4-Dinitrophenol (DNP)', 'Dicoumarol', 'Salicylate', 'Uncoupling proteins (channel)'], src: SRC('17–18') } });
  leakL.element.style.color = 'var(--inh)';
  leakL.visible = false;

  /* ---------- HUD ---------- */
  const hud = h('div', { style: 'position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:4' });
  const ctr = (k, col) => {
    const v = h('div', { style: `font:720 52px var(--font);letter-spacing:-.03em;line-height:1;color:${col};font-variant-numeric:tabular-nums`, text: '0' });
    const kk = h('div', { style: 'font-size:21px;color:var(--fg-2);font-weight:560;margin-top:6px;white-space:nowrap', html: k });
    return { el: h('div', {}, [v, kk]), v, k: kk };
  };
  const cOx = ctr('NADH oxidised', ND), cH = ctr('H⁺ pumped', HP), cA = ctr('ATP made', AT);
  const ctrBox = h('div', { style: 'display:flex;gap:46px' }, [cOx.el, cH.el, cA.el]);
  hud.append(ctrBox);
  const mE = meter('e⁻ flow', EL), mG = meter('H⁺ gradient', HP), mA = meter('ATP synthesis', AT), mQ = meter('Heat', IN);
  hud.append(h('div', { style: 'display:grid;grid-template-columns:repeat(4,222px);gap:12px 24px;padding-top:14px' }, [mE.el, mG.el, mA.el, mQ.el]));
  el.append(hud);

  /* ---------- controls / caption ---------- */
  const st = { src: 'NADH', inh: null, unc: false };
  const sSrc = seg({ options: [{ v: 'NADH', t: 'NADH' }, { v: 'FADH2', t: 'FADH₂' }], value: 'NADH', onChange: (v) => { st.src = v; applyState(); } });
  const INH = [{ v: null, t: 'No inhibitor' }, { v: 'I', t: 'Rotenone' }, { v: 'III', t: 'Antimycin A' }, { v: 'IV', t: 'Cyanide' }, { v: 'F0', t: 'Oligomycin' }];
  const sInh = seg({ options: INH, value: null, onChange: (v) => { st.inh = v; applyState(); } });
  const inhTips = [
    { title: 'No inhibitor', body: 'Normal coupled flow.' },
    { kicker: 'Complex I', title: 'Rotenone', body: 'Also <b>amobarbital</b> and <b>piericidin</b>. Electrons from NADH stop at Complex I; FADH₂ electrons still enter via Complex II.', src: SRC(15) },
    { kicker: 'Complex III', title: 'Antimycin A', body: 'Also <b>dimercaprol (BAL)</b> — two names for one drug. Blocks between cyt b and cyt c₁.', src: SRC(15) },
    { kicker: 'Complex IV', title: 'Cyanide', body: 'Also <b>CO</b> and <b>H₂S</b>. Electrons cannot reach O₂.', src: SRC(15) },
    { kicker: 'ATP synthase', title: 'Oligomycin', body: 'Binds F₀ and stops H⁺ re-entry → no ATP.' + LIPP('the gradient builds until pumping, and so electron flow, stalls.'), src: SRC(16) },
  ];
  [...sInh.el.children].forEach((b, i) => tip(b, inhTips[i]));
  const tUnc = toggle({ label: 'Uncoupler', danger: true, onChange: (v) => { st.unc = v; applyState(); } });
  tip(tUnc.el, { title: 'Uncoupler (e.g. 2,4-DNP)', body: 'H⁺ leak back through the membrane: electrons keep flowing, ATP synthesis collapses, heat is released.' + LIPP('electron flow and O₂ use actually speed up.'), src: SRC('17–18') });
  const bar = ctrlBar(el, [sSrc, sInh, tUnc], { left: '50%', bottom: 0 });
  bar.style.transform = 'translateX(-50%)';
  bar.style.flexWrap = 'nowrap';
  bar.style.whiteSpace = 'nowrap';
  bar.style.padding = '14px 22px';
  bar.style.transition = 'opacity .4s var(--ease)';
  const capT = h('div', { style: 'font-size:30px;font-weight:680;letter-spacing:-.01em;color:var(--fg)' });
  const capB = h('div', { style: 'font-size:24px;color:var(--fg-2);margin-top:6px' });
  const cap = h('div', { style: 'position:absolute;left:50%;bottom:8px;transform:translateX(-50%);padding:16px 34px;border-radius:26px;background:var(--glass);border:1px solid var(--line);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);text-align:center;opacity:0;pointer-events:none;z-index:6;white-space:nowrap;transition:opacity .4s var(--ease)' }, [capT, capB]);
  el.append(cap);

  /* ---------- simulation state ---------- */
  const GMAX = 44, KD = 0.27, KL = 2.4, P_NORM = 1.7, P_UNC = 1.2;
  let G = 0, inflight = 0, spawnAcc = 1.0, drainAcc = 0, leakAcc = 0, ringTarget = 0, ringAngle = 0, synthH = 0, heat = 0, now = 0;
  let nOx = 0, nH = 0, nATP = 0;
  const rate = { e: 1 / P_NORM, atp: 2.5 / P_NORM, leak: 0 };
  const evCount = { e: 0, atp: 0, leak: 0 };
  const packets = [], protons = [], pumpQ = [], fx = [], freeP = [], freePairs = [];
  const qHome = new THREE.Vector3(-7.05, 0, 1.0), cHome = new THREE.Vector3(-1.75, 1.95, 0.8);

  const getProton = () => { const o = freeP.pop() || particle(0xff9f0a, 0.85); o.visible = true; o.setOpacity(1); o.scale.setScalar(1); M.root.add(o); return o; };
  const dropProton = (o) => { o.visible = false; freeP.push(o); };
  const getPair = () => freePairs.pop() || [particle(0x2f8cff, 1.2), particle(0x2f8cff, 1.2)].map((p) => { M.root.add(p); return p; });
  const dropPair = (pr) => { pr.forEach((p) => (p.visible = false)); freePairs.push(pr); };
  const poolPt = () => new THREE.Vector3(-11 + rnd() * 22, 2.45 + rnd() * 1.25, -2.4 + rnd() * 3.2);
  function addPool(pos) {
    const o = getProton();
    o.position.copy(pos);
    protons.push({ o, state: 'pool', v: new THREE.Vector3((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.6) });
    G++;
  }
  for (let i = 0; i < 24; i++) addPool(poolPt());

  const mover = (o, pts, dur, state, extra = {}) => ({ o, state, curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), t: 0, dur, ...extra });
  function launchPump(x) {
    const o = getProton();
    const end = new THREE.Vector3(x + (rnd() - 0.5) * 2.4, 2.5 + rnd() * 1.1, -0.6 + rnd() * 1.6);
    protons.push(mover(o, [V3([x, -2.6, 1.25]), V3([x, -1.2, 1.3]), V3([x, 1.2, 1.3]), end], 1.0, 'pump'));
    inflight++;
    nH++;
  }
  function takePool() {
    const i = protons.findIndex((p) => p.state === 'pool');
    if (i < 0) return null;
    const p = protons[i];
    protons.splice(i, 1);
    G--;
    return p.o;
  }
  function startDrain() {
    const o = takePool();
    if (!o) return;
    protons.push(mover(o, [o.position.clone(), V3([XS + 1.05, 2.0, 1.0]), V3([XS + 0.95, 0.6, 1.0]), V3([XS + 0.85, -0.6, 1.0]), V3([XS + 1.05, -1.7, 1.15]), V3([XS + 1.7, -2.5, 1.25])], 1.35, 'drain', { turned: false }));
  }
  function startLeak() {
    const o = takePool();
    if (!o) return;
    protons.push(mover(o, [o.position.clone(), V3([5.0, 2.0, 1.1]), V3([5.0, 0, 1.1]), V3([5.0, -1.9, 1.1]), V3([5.4, -2.8, 1.2])], 1.0, 'leak', { turned: false }));
  }
  function popATP() {
    const side = nATP % 2 ? 1 : -1;
    const o = particle(0xffd60a, 1.05);
    o.position.set(XS + side * 0.95, -3.6, 0.9);
    M.root.add(o);
    fx.push({ o, a: o.position.clone(), b: V3([XS + side * 2.3, -4.9, 1.3]), t: 0, dur: 1.6 });
    nATP++;
    evCount.atp++;
    const bm = M.beta[nATP % 3];
    gsap.fromTo(bm.material, { emissiveIntensity: 0.6 }, { emissiveIntensity: 0, duration: 0.6 });
  }
  function makeWater() {
    const o = particle(0x9fd9ff, 0.75);
    o.position.set(2.6, -2.4, 1.45);
    M.root.add(o);
    fx.push({ o, a: o.position.clone(), b: V3([3.4, -3.5, 1.3]), t: 0, dur: 1.4 });
    pulse(L.o2);
  }
  const pulse = (lab) => gsap.fromTo(lab.element, { scale: 1.12 }, { scale: 1, duration: 0.5, ease: 'power2.out' });
  function flashPump(k) {
    const sp = L[k]?.element.querySelector('.pp');
    if (sp) gsap.fromTo(sp, { scale: 1.5 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
  }

  const blockSite = () => {
    if (st.inh === 'I' && ROUTE[st.src].includes('I')) return 'I';
    if (st.inh === 'III' || st.inh === 'IV') return st.inh;
    return null;
  };
  const BLOCK_PT = { I: SEG.I.curve.getPointAt(0.86), III: SEG.III.curve.getPointAt(0.45), IV: SEG.IV.curve.getPointAt(0.9) };
  const stuck = [particle(0xff453a, 0.95), particle(0xff453a, 0.95)];
  stuck.forEach((p) => { p.visible = false; M.root.add(p); });
  const heatGlow = glowSprite(0xff5a1f, 1);
  heatGlow.position.set(4.6, 0, 0.5);
  heatGlow.material.opacity = 0;
  M.root.add(heatGlow);

  function spawnPacket() {
    const pair = getPair();
    pair.forEach((p) => { p.visible = true; p.setOpacity(1); });
    packets.push({ route: ROUTE[st.src], i: 0, t: 0, entered: false, pair, ph: rnd() * 6 });
    evCount.e++;
  }
  function enterSeg(pk, sg) {
    if (pk.i === 0) { nOx++; pulse(st.src === 'NADH' ? L.nadh : L.fadh); }
    if (sg.pump) { sg.pump.forEach((x, i) => pumpQ.push({ at: now + i * 0.17, x })); flashPump(sg.site); }
  }
  const placePair = (pair, p, a) => {
    pair[0].position.set(p.x + Math.cos(a) * 0.17, p.y + Math.sin(a) * 0.17, p.z);
    pair[1].position.set(p.x - Math.cos(a) * 0.17, p.y - Math.sin(a) * 0.17, p.z);
  };

  function applyState() {
    packets.splice(0).forEach((pk) => dropPair(pk.pair));
    pumpQ.length = 0;
    nOx = 0; nH = 0; nATP = 0; synthH = 0;
    spawnAcc = 1.0;
    const b = blockSite();
    stuck.forEach((p) => (p.visible = !!b));
    if (b) placePair(stuck, BLOCK_PT[b], 0.6);
    block.visible = !!st.inh;
    if (st.inh) { block.element.innerHTML = `✕ ${INHIB[st.inh].html}`; block.position.set(...INHIB[st.inh].at); }
    M.plug.visible = st.inh === 'F0';
    M.pore.visible = st.unc;
    leakL.visible = st.unc;
    ['I', 'III', 'IV'].forEach((k) => {
      const mat = M.cx[k].userData.mat;
      const on = b === k;
      mat.emissive.set(on ? 0xff2d2d : M.cx[k].userData.base);
      if (on) mat.emissiveIntensity = 0.35; else if (mat.emissive.getHex() !== 0) mat.emissiveIntensity = focusK === k ? 0.28 : 0;
    });
    cOx.k.innerHTML = st.src === 'NADH' ? 'NADH oxidised' : 'FADH₂ oxidised';
    cOx.v.style.color = st.src === 'NADH' ? ND : FD;
    L.nadh.element.style.opacity = st.src === 'NADH' ? 1 : 0.35;
    L.fadh.element.style.opacity = st.src === 'FADH2' ? 1 : 0.35;
    qHome.set(st.src === 'NADH' ? -7.05 : -4.85, 0, 1.0);
    updHud(1);
  }

  /* ---------- frame loop ---------- */
  const tmp = new THREE.Vector3();
  let hudT = 0;
  function updHud(force) {
    hudT += force ? 1 : 0;
    if (!force && hudT < 0.12) return;
    hudT = 0;
    cOx.v.textContent = nOx;
    cH.v.textContent = nH;
    cA.v.textContent = nATP;
    const e = rate.e * P_NORM, a = rate.atp / (2.5 / P_NORM), q = rate.leak / 5, g = G / GMAX;
    mE.set(e / 1.4, e < 0.12 ? '<b style="color:var(--inh)">stopped</b>' : e > 1.15 ? '↑ fast' : 'flowing');
    mG.set(g, g > 0.8 ? 'maximal' : g < 0.15 ? 'collapsed' : 'built up');
    mA.set(a, a < 0.12 ? '<b style="color:var(--inh)">stopped</b>' : a < 0.5 ? 'low' : 'running');
    mQ.set(q, q > 0.25 ? '<b style="color:var(--inh)">↑ heat</b>' : '—');
  }

  function frame(dt) {
    now += dt;
    // spawn
    const b = blockSite();
    if (!b) {
      spawnAcc += dt;
      const P = st.unc ? P_UNC : P_NORM;
      if (spawnAcc >= P) {
        if (G + inflight < GMAX - 10) { spawnAcc = 0; spawnPacket(); } else spawnAcc = P;
      }
    }
    // packets
    const busy = { q: false, c: false };
    for (let k = packets.length - 1; k >= 0; k--) {
      const pk = packets[k];
      let sg = SEG[pk.route[pk.i]];
      if (!pk.entered) { pk.entered = true; enterSeg(pk, sg); }
      pk.t += dt / sg.dur;
      if (pk.t >= 1) {
        if (sg.water) makeWater();
        pk.i++; pk.t = 0; pk.entered = false;
        if (pk.i >= pk.route.length) { dropPair(pk.pair); packets.splice(k, 1); continue; }
        sg = SEG[pk.route[pk.i]];
        enterSeg(pk, sg); pk.entered = true;
      }
      const p = sg.curve.getPointAt(smooth(pk.t));
      placePair(pk.pair, p, now * 7 + pk.ph);
      if (sg.carrier === 'q') { busy.q = true; M.coq.position.lerp(tmp.set(p.x, p.y, 1.0), 1 - Math.exp(-dt * 16)); }
      if (sg.carrier === 'c') { busy.c = true; M.cytc.position.lerp(tmp.set(p.x, p.y + 0.02, 0.8), 1 - Math.exp(-dt * 16)); }
    }
    if (!busy.q) M.coq.position.lerp(qHome, 1 - Math.exp(-dt * 2.6));
    if (!busy.c) M.cytc.position.lerp(cHome, 1 - Math.exp(-dt * 2.6));
    M.coq.rotation.y += dt * 1.5;
    M.cytc.rotation.y -= dt * 1.2;
    // queued pumps
    for (let i = pumpQ.length - 1; i >= 0; i--) if (pumpQ[i].at <= now) { launchPump(pumpQ[i].x); pumpQ.splice(i, 1); }
    // drains & leaks
    if (st.inh !== 'F0') { drainAcc += KD * G * dt; while (drainAcc >= 1 && G > 0) { drainAcc -= 1; startDrain(); } } else drainAcc = 0;
    if (st.unc) { leakAcc += KL * G * dt; while (leakAcc >= 1 && G > 0) { leakAcc -= 1; startLeak(); } } else leakAcc = 0;
    // protons
    for (let i = protons.length - 1; i >= 0; i--) {
      const pr = protons[i];
      if (pr.state === 'pool') {
        pr.o.position.addScaledVector(pr.v, dt);
        const P = pr.o.position;
        if (P.x < -11.2 || P.x > 11.4) pr.v.x *= -1;
        if (P.y < 2.35 || P.y > 3.85) pr.v.y *= -1;
        if (P.z < -2.6 || P.z > 1.1) pr.v.z *= -1;
        continue;
      }
      pr.t += dt / pr.dur;
      if (pr.t >= 1) {
        if (pr.state === 'pump') { pr.state = 'pool'; pr.v = new THREE.Vector3((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.6); inflight--; G++; continue; }
        dropProton(pr.o);
        protons.splice(i, 1);
        continue;
      }
      pr.o.position.copy(pr.curve.getPointAt(pr.t));
      if ((pr.state === 'drain' || pr.state === 'leak') && pr.t > 0.8) pr.o.setOpacity((1 - pr.t) * 5);
      if (pr.state === 'drain' && !pr.turned && pr.t > 0.5) {
        pr.turned = true;
        ringTarget += (Math.PI * 2) / 10;
        synthH++;
        if (synthH % 4 === 0) popATP();
      }
      if (pr.state === 'leak' && !pr.turned && pr.t > 0.5) { pr.turned = true; evCount.leak++; }
    }
    // rotor
    ringAngle += (ringTarget - ringAngle) * (1 - Math.exp(-dt * 3));
    M.rotor.rotation.y = -ringAngle;
    // fx (ATP, water)
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt / f.dur;
      if (f.t >= 1) { M.root.remove(f.o); f.o.children.forEach((c) => c.material.dispose()); fx.splice(i, 1); continue; }
      f.o.position.lerpVectors(f.a, f.b, 1 - Math.pow(1 - f.t, 2));
      f.o.setOpacity(Math.min(1, (1 - f.t) * 2.5));
      f.o.scale.setScalar(0.7 + Math.min(1, f.t * 4) * 0.3);
    }
    // stuck electrons pulse
    if (stuck[0].visible) { const s2 = 1 + 0.25 * Math.sin(now * 6); stuck.forEach((p) => p.scale.setScalar(s2)); }
    // rates (EMA) + heat
    const k = 1 - Math.exp(-dt / 2.2);
    ['e', 'atp', 'leak'].forEach((key) => { rate[key] += (evCount[key] / Math.max(dt, 1e-3) - rate[key]) * k; evCount[key] = 0; });
    heat += (Math.min(1, rate.leak / 5) - heat) * (1 - Math.exp(-dt / 1.5));
    heatGlow.material.opacity = heat * 0.75;
    heatGlow.scale.setScalar(5 + heat * 9);
    M.mem.userData.headMat.emissive.setRGB(heat * 0.32, heat * 0.07, 0);
    M.pore.material.emissiveIntensity = 0.5 + 0.4 * Math.sin(now * 5);
    updHud(0);
    hudT += dt;
  }
  kit.onFrame(frame);

  /* ---------- tour / sandbox steps ---------- */
  const CAM = {
    wide: WIDE,
    I: { p: [-7.6, 1.1, 12.5], t: [-8.0, -1.0, 0] },
    Q: { p: [-5.2, 1.6, 11.5], t: [-5.2, -0.1, 0] },
    II: { p: [-4.6, 0.5, 11.0], t: [-4.8, -1.5, 0] },
    III: { p: [-2.2, 1.6, 12.0], t: [-2.4, 0.1, 0] },
    c: { p: [0, 2.8, 11.5], t: [0, 1.5, 0] },
    IV: { p: [2.6, 1.0, 12.0], t: [2.4, -0.4, 0] },
    V: { p: [7.3, -0.2, 16.0], t: [7.8, -2.8, 0] },
  };
  let focusK = null;
  function camTo(key, instant) {
    const c = CAM[key];
    gsap.killTweensOf(kit.camera.position);
    gsap.killTweensOf(ctl.target);
    if (instant) { kit.camera.position.set(...c.p); ctl.target.set(...c.t); return; }
    gsap.to(kit.camera.position, { x: c.p[0], y: c.p[1], z: c.p[2], duration: 1.5, ease: 'power2.inOut' });
    gsap.to(ctl.target, { x: c.t[0], y: c.t[1], z: c.t[2], duration: 1.5, ease: 'power2.inOut' });
  }
  const FOCUS_MATS = () => ({ I: [M.cx.I.userData.mat], II: [M.cx.II.userData.mat], III: [M.cx.III.userData.mat], IV: [M.cx.IV.userData.mat], Q: [M.coq.userData.mat], c: [M.cytc.userData.mat], V: Object.values(M.mats) });
  function focus(k) {
    focusK = k;
    const F = FOCUS_MATS();
    Object.entries(F).forEach(([key, mats]) => mats.forEach((m) => { if (m.emissive.getHex() === 0xff2d2d) return; gsap.to(m, { emissiveIntensity: key === k ? 0.3 : 0, duration: 0.6 }); }));
    Object.entries(L).forEach(([key, lab]) => {
      if (['nadh', 'fadh'].includes(key)) return;
      lab.element.style.opacity = !k || key === k || (k === 'IV' && key === 'o2') || (k === 'V' && key === 'atp') ? 1 : 0.3;
    });
  }
  const TOUR = [
    null,
    { k: 'I', src: 'NADH', t: 'Complex I · NADH dehydrogenase', b: 'FMN, Fe-S · NADH → NAD⁺ · pumps 4 H⁺' },
    { k: 'Q', src: 'NADH', t: 'Coenzyme Q · ubiquinone', b: 'Mobile in the membrane · carries e⁻ from I and II to III' },
    { k: 'II', src: 'FADH2', t: 'Complex II · succinate dehydrogenase', b: 'FAD, Fe-S · FADH₂ → FAD · pumps no H⁺' },
    { k: 'III', src: 'NADH', t: 'Complex III · cytochrome bc₁', b: 'Cyt b, cyt c₁, Fe-S · pumps 4 H⁺' },
    { k: 'c', src: 'NADH', t: 'Cytochrome c', b: 'Mobile on the intermembrane face · carries e⁻ from III to IV' },
    { k: 'IV', src: 'NADH', t: 'Complex IV · cytochrome c oxidase', b: 'Cyt a, a₃, Cu<sub>A</sub>, Cu<sub>B</sub> · ½O₂ + 2H⁺ → H₂O · pumps 2 H⁺' },
    { k: 'V', src: 'NADH', t: 'ATP synthase · Complex V', b: 'H⁺ return through F₀ and turn the rotor · F₁ makes ATP' },
    null,
  ];
  const SANDBOX = [
    { src: 'NADH', inh: null, unc: false, t: 'Normal coupling', b: 'NADH → O₂ · 10 H⁺ pumped · ATP made' },
    { src: 'NADH', inh: 'I', unc: false, t: 'Rotenone · Complex I blocked', b: 'NADH electrons stop · pumping stops · ATP fades' },
    { src: 'FADH2', inh: 'I', unc: false, t: 'Same block — now feed FADH₂', b: 'Enters via Complex II → CoQ · flow resumes (6 H⁺)' },
    { src: 'NADH', inh: 'III', unc: false, t: 'Antimycin A · Complex III blocked', b: 'All electron flow stops — NADH and FADH₂ alike' },
    { src: 'NADH', inh: 'IV', unc: false, t: 'Cyanide · Complex IV blocked', b: 'Electrons cannot reach O₂ · no pumping, no ATP' },
    { src: 'NADH', inh: 'F0', unc: false, t: 'Oligomycin · F₀ blocked', b: 'No H⁺ re-entry → no ATP · gradient maxes, flow stalls' },
    { src: 'NADH', inh: null, unc: true, t: 'Uncoupler · 2,4-DNP', b: 'H⁺ leak back · electrons race on · little ATP · heat' },
  ];
  const setCtl = (o) => {
    const changed = st.src !== o.src || st.inh !== o.inh || st.unc !== o.unc;
    st.src = o.src; st.inh = o.inh; st.unc = o.unc;
    sSrc.set(o.src, false); sInh.set(o.inh, false); tUnc.set(o.unc, false);
    if (changed) applyState();
  };
  let lastN = -1;
  function stepTour(n, dir) {
    const T = TOUR[n];
    const instant = dir === 0 && lastN < 0;
    lastN = n;
    if (T) {
      if (st.src !== T.src || st.inh || st.unc) setCtl({ src: T.src, inh: null, unc: false });
      camTo(T.k, instant);
      focus(T.k);
      capT.innerHTML = T.t; capB.innerHTML = T.b;
      cap.style.opacity = 1; bar.style.opacity = 0; bar.style.pointerEvents = 'none';
      hud.style.opacity = 0;
    } else {
      if (dir !== 0 || st.src !== 'NADH') setCtl({ src: 'NADH', inh: null, unc: false });
      camTo('wide', instant);
      focus(null);
      cap.style.opacity = 0; bar.style.opacity = 1; bar.style.pointerEvents = '';
      hud.style.opacity = 1;
    }
  }
  function stepSandbox(n) {
    const S = SANDBOX[n];
    setCtl(S);
    capT.innerHTML = `${n ? `${n} · ` : ''}${S.t}`; capB.innerHTML = S.b;
    cap.style.opacity = 1;
  }
  if (mode === 'sandbox') {
    ctrBox.style.visibility = 'hidden';
    Object.assign(cap.style, { left: '0', top: '0', bottom: 'auto', transform: 'none', textAlign: 'left', whiteSpace: 'nowrap', padding: '0', background: 'none', border: '0', backdropFilter: 'none', webkitBackdropFilter: 'none' });
    capT.style.fontSize = '32px';
    capT.style.color = 'var(--ink)';
    capB.style.fontSize = '24px';
  }
  hud.style.transition = 'opacity .4s var(--ease)';
  applyState();
  for (let i = 0; i < 140; i++) frame(0.05); // pre-roll to a running steady state
  kit.renderOnce();
  return kitController(kit, { step: (n, dir) => (mode === 'sandbox' ? stepSandbox(n) : stepTour(n, dir)) });
}

/* ================================================================== */
/* Chemiosmotic theory (slide 11)                                      */
/* ================================================================== */
function chemiosmoticViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 0, y: 0, w: 960, h: 300, r: 36, label: 'Intermembrane space', fill: 'color-mix(in oklab, var(--prot) 7%, transparent)' });
  D.region({ x: 0, y: 432, w: 960, h: 428, r: 36, label: 'Matrix', ly: 400, fill: 'color-mix(in oklab, var(--nadh) 6%, transparent)' });
  // bilayer
  const mem = s('g');
  for (let x = 14; x < 950; x += 24) {
    mem.append(s('circle', { cx: x, cy: 318, r: 10, style: 'fill:color-mix(in oklab, var(--a1) 45%, var(--surface-3))' }));
    mem.append(s('circle', { cx: x, cy: 414, r: 10, style: 'fill:color-mix(in oklab, var(--a1) 45%, var(--surface-3))' }));
    mem.append(s('path', { d: `M${x - 3},328 L${x - 3},362 M${x + 3},328 L${x + 3},362 M${x - 3},370 L${x - 3},404 M${x + 3},370 L${x + 3},404`, style: 'stroke:var(--line-2);stroke-width:2' }));
  }
  D.layers.regions.append(mem);
  // pumps
  const pumps = [{ k: 'I', x: 160, n: 4, col: 'var(--a1)' }, { k: 'III', x: 370, n: 4, col: 'var(--elec)' }, { k: 'IV', x: 570, n: 2, col: 'var(--act)' }];
  const flows = [];
  pumps.forEach((p) => {
    const g = s('g', { 'data-tip': JSON.stringify(CX[p.k]) });
    g.append(s('rect', { x: p.x - 52, y: 262, width: 104, height: 210, rx: 30, style: `fill:color-mix(in oklab, ${p.col} 26%, var(--bg));stroke:${p.col};stroke-width:3` }));
    const t = s('text', { x: p.x, y: 378, 'text-anchor': 'middle', style: 'font:750 32px var(--font);fill:var(--fg)' });
    t.textContent = p.k;
    g.append(t);
    D.layers.nodes.append(g);
    D.badge(p.x, 512, `${p.n} H⁺`, { color: HP, size: 24 });
    const path = s('path', { d: `M${p.x + 30},560 L${p.x + 30},150`, style: 'fill:none;stroke:none' });
    D.layers.fx.append(path);
    const ar = s('path', { d: `M${p.x + 30},250 L${p.x + 30},200 M${p.x + 18},214 L${p.x + 30},198 L${p.x + 42},214`, style: `fill:none;stroke:${HP};stroke-width:4;stroke-linecap:round;stroke-linejoin:round` });
    D.layers.labels.append(ar);
    flows.push(D.flow(path, { count: p.n === 4 ? 3 : 2, color: HP, speed: 150, r: 9 }));
  });
  // ATP synthase
  const syn = s('g', { 'data-tip': JSON.stringify(CX.V) });
  syn.append(s('rect', { x: 760, y: 282, width: 96, height: 170, rx: 24, style: 'fill:color-mix(in oklab, var(--atp) 22%, var(--bg));stroke:var(--atp);stroke-width:3' }));
  syn.append(s('rect', { x: 799, y: 452, width: 18, height: 50, style: 'fill:var(--atp);opacity:.7' }));
  syn.append(s('circle', { cx: 808, cy: 568, r: 72, style: 'fill:color-mix(in oklab, var(--atp) 24%, var(--bg));stroke:var(--atp);stroke-width:3' }));
  const f0 = s('text', { x: 808, y: 378, 'text-anchor': 'middle', style: 'font:750 28px var(--font);fill:var(--fg)' }); f0.textContent = 'F₀';
  const f1 = s('text', { x: 808, y: 578, 'text-anchor': 'middle', style: 'font:750 28px var(--font);fill:var(--fg)' }); f1.textContent = 'F₁';
  syn.append(f0, f1);
  D.layers.nodes.append(syn);
  // IMS proton pool (builds with step 1)
  const rnd = rng(5);
  const pool = [];
  const spots = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 10; c++) spots.push([52 + c * 62 + (r % 2) * 28 + (rnd() - 0.5) * 18, 98 + r * 62 + (rnd() - 0.5) * 16]);
  for (let i = 0; i < spots.length; i++) {
    const [x, y] = spots[i];
    const g = s('g', { transform: `translate(${x} ${y})`, style: 'opacity:0' });
    g.append(s('circle', { r: 15, style: `fill:color-mix(in oklab, ${HP} 85%, transparent)` }));
    const t = s('text', { y: 7, 'text-anchor': 'middle', style: 'font:800 17px var(--font);fill:#1d1d1f' }); t.textContent = 'H⁺';
    g.append(t);
    D.layers.labels.append(g);
    pool.push(g);
  }
  const few = [];
  [[280, 610], [470, 650], [640, 600], [100, 780]].forEach(([x, y]) => {
    const g = s('g', { transform: `translate(${x} ${y})` });
    g.append(s('circle', { r: 15, style: `fill:color-mix(in oklab, ${HP} 85%, transparent)` }));
    const t = s('text', { y: 7, 'text-anchor': 'middle', style: 'font:800 17px var(--font);fill:#1d1d1f' }); t.textContent = 'H⁺';
    g.append(t);
    D.layers.labels.append(g);
    few.push(g);
  });
  // charges (step 2)
  const charges = s('g', { style: 'opacity:0' });
  const busy = (x) => pumps.some((p) => Math.abs(x - p.x) < 68) || (x > 744 && x < 872);
  for (let x = 24; x < 950; x += 38) {
    if (busy(x)) continue;
    const p = s('text', { x, y: 290, 'text-anchor': 'middle', style: `font:800 30px var(--font);fill:${HP}` }); p.textContent = '+';
    const m = s('text', { x, y: 462, 'text-anchor': 'middle', style: `font:800 30px var(--font);fill:${ND}` }); m.textContent = '−';
    charges.append(p, m);
  }
  D.layers.labels.append(charges);
  // pH tags (step 3)
  const ph1 = D.badge(808, 58, '↓ pH · acidic · +', { color: HP, size: 26, w: 270, tip: { title: 'Intermembrane space', body: 'More H⁺ → <b>lower pH</b>; excess positive charge.', src: SRC(10) } });
  const ph2 = D.badge(190, 700, '↑ pH · alkaline · −', { color: ND, size: 26, w: 290, tip: { title: 'Matrix', body: 'Fewer H⁺ → <b>higher pH</b>; negative side.', src: SRC(10) } });
  // PMF (step 4)
  const pmfA = D.arrow({ from: [808, 150], to: [808, 276], color: HP, width: 6 });
  const thr = s('path', { d: 'M808,290 L808,500', style: 'fill:none;stroke:none' });
  D.layers.fx.append(thr);
  const pmfF = D.flow(thr, { count: 3, color: HP, speed: 140, r: 10, autoplay: false });
  const pmfT = D.text(808, 126, 'Proton-motive force', { anchor: 'middle', cls: 'sm', style: `fill:${HP};font-weight:750;font-size:27px` });
  const atpB = D.badge(808, 690, 'ADP + Pᵢ → ATP', { color: AT, size: 26, w: 240 });
  const eq = D.text(480, 820, 'pH gradient + electrical gradient', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2);font-weight:650', tip: { title: 'Proton-motive force', body: 'Slide 10 names the <b>electrical gradient</b> and shows the pH difference. Together they make the proton-motive force that drives H⁺ back through F₀ (term used on slide 17).', src: 'Lecture slides 10, 17 · Lippincott Ch 5' } });
  const s4 = [pmfA.g, pmfT, atpB, eq];
  s4.forEach((e) => (e.style.opacity = 0));
  [ph1, ph2].forEach((e) => (e.style.opacity = 0));
  return {
    step(n) {
      pool.forEach((g, i) => gsap.to(g, { opacity: n >= 1 ? 1 : i < 6 ? 1 : 0, duration: 0.4, delay: n >= 1 ? i * 0.03 : 0 }));
      gsap.to(charges, { opacity: n >= 2 ? 1 : 0, duration: 0.6 });
      show([ph1, ph2], n >= 3);
      show(s4, n >= 4);
      n >= 4 ? pmfF.play() : pmfF.hide();
      flows.forEach((f) => f.play());
    },
    destroy: () => D.destroy(),
  };
}

/* ================================================================== */
/* ATP yield calculator (slide 12)                                     */
/* ================================================================== */
function yieldViz(el) {
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.justifyContent = 'center';
  el.style.gap = '30px';
  let src = 'NADH', older = false, nN = 2, nF = 1;
  const DATA = {
    NADH: { cx: [4, null, 4, 2], H: 10, atp: 2.5, old: 3 },
    FADH2: { cx: [null, null, 4, 2], H: 6, atp: 1.5, old: 2 },
  };
  const sSrc = seg({ options: [{ v: 'NADH', t: 'NADH + H⁺' }, { v: 'FADH2', t: 'FADH₂' }], value: 'NADH', onChange: (v) => { src = v; update(); } });
  const tOld = toggle({ label: 'Older concept', onChange: (v) => { older = v; update(); } });
  tip(tOld.el, { kicker: 'Slide 11 footnote', title: 'Older values', body: '“Please note that Lippincott’s Biochemistry states that NADH+H⁺ yields 3 ATP and FADH₂ yields 2 ATP. This is older concept.” Use <b>2.5 / 1.5</b> for this course.', src: SRC(11) });
  el.append(h('div', { style: 'display:flex;gap:22px;align-items:center' }, [sSrc.el, tOld.el]));
  // tiles
  const tiles = h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px' });
  const T = ['I', 'II', 'III', 'IV'].map((k) => {
    const dots = h('div', { style: 'display:flex;gap:8px;height:30px;align-items:center;justify-content:center' });
    const val = h('div', { style: 'font:700 30px var(--font);color:var(--atp);font-variant-numeric:tabular-nums' });
    const sub = h('div', { style: 'font-size:22px;color:var(--fg-2);font-weight:560' });
    const tile = h('div', { style: 'padding:22px 16px;border-radius:26px;background:var(--surface);border:1px solid var(--line);display:grid;gap:10px;justify-items:center;transition:opacity .4s var(--ease),background .4s' }, [h('div', { style: 'font-size:24px;font-weight:650;color:var(--fg-2)', text: `Complex ${k}` }), dots, sub, val]);
    tip(tile, CX[k]);
    tiles.append(tile);
    return { tile, dots, val, sub };
  });
  el.append(tiles);
  // result
  const big = h('div', { style: 'font:760 170px var(--font);letter-spacing:-.06em;line-height:.9;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums', text: '2.5' });
  const bigK = h('div', { style: 'font-size:30px;color:var(--fg-2)' });
  const bigS = h('div', { style: 'font-size:24px;color:var(--fg-3);margin-top:6px' });
  el.append(h('div', { style: 'display:flex;align-items:flex-end;gap:30px' }, [big, h('div', { style: 'padding-bottom:12px' }, [bigK, bigS])]));
  // calculator
  const tot = h('div', { style: 'font:720 64px var(--font);letter-spacing:-.03em;color:var(--atp);font-variant-numeric:tabular-nums;min-width:200px;text-align:right' });
  const slN = slider({ label: 'NADH', min: 0, max: 10, step: 1, value: nN, fmt: (v) => `×${v}`, onInput: (v) => { nN = v; update(); }, width: 230 });
  const slF = slider({ label: 'FADH₂', min: 0, max: 10, step: 1, value: nF, fmt: (v) => `×${v}`, onInput: (v) => { nF = v; update(); }, width: 230 });
  slN.el.querySelector('output').style.minWidth = '2.4em';
  slF.el.querySelector('output').style.minWidth = '2.4em';
  const calc = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 28px;border-radius:30px;background:var(--surface);border:1px solid var(--line)' }, [
    h('div', { style: 'display:grid;gap:10px;font-size:26px' }, [slN.el, slF.el]),
    h('div', { style: 'text-align:right' }, [tot, h('div', { style: 'font-size:22px;color:var(--fg-2)', text: 'total ATP' })]),
  ]);
  el.append(calc);
  let shown = 2.5;
  function update() {
    const d = DATA[src];
    d.cx.forEach((hh, i) => {
      const t = T[i];
      t.dots.innerHTML = '';
      if (hh) {
        for (let k = 0; k < hh; k++) { const dd = h('i', { style: `width:22px;height:22px;border-radius:50%;background:${HP};display:inline-block;box-shadow:0 0 12px color-mix(in oklab, ${HP} 60%, transparent)` }); t.dots.append(dd); }
        gsap.fromTo(t.dots.children, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.06, duration: 0.4, ease: 'back.out(2)' });
        t.sub.textContent = `${hh} H⁺`;
        t.val.textContent = hh === 4 ? '= 1 ATP' : '= ½ ATP';
        t.tile.style.opacity = 1;
        t.tile.style.background = 'var(--surface-2)';
      } else {
        t.sub.textContent = i === 1 ? 'no H⁺ pumped' : 'not used';
        t.val.textContent = '—';
        t.tile.style.opacity = 0.4;
        t.tile.style.background = 'var(--surface)';
      }
    });
    const v = older ? d.old : d.atp;
    countTo(big, v, { from: shown, duration: 0.8, decimals: v % 1 ? 1 : 0 });
    shown = v;
    bigK.innerHTML = `ATP per ${src === 'NADH' ? 'NADH + H⁺' : 'FADH₂'}`;
    bigS.innerHTML = older ? 'older concept (slide 11 footnote)' : `${d.H} H⁺ pumped ÷ 4 H⁺ per ATP`;
    const total = older ? nN * 3 + nF * 2 : nN * 2.5 + nF * 1.5;
    tot.textContent = total % 1 ? total.toFixed(1) : String(total);
  }
  update();
  return { step: () => {} };
}

// 13 · FADH2 vs NADH proton bars (statement)
function fadhStatViz(el) {
  const D = diagram(el, 1500, 360);
  const rows = [];
  const mkRow = (y, label, col, cells, res) => {
    const g = s('g');
    const lt = s('text', { x: 0, y: y + 12, class: 'v-label lg', style: `fill:${col}` });
    setRich(lt, label);
    g.append(lt);
    cells.forEach((c) => {
      const r = s('rect', { x: c.x, y: y - 40, width: c.w, height: 80, rx: 26, style: c.skip ? 'fill:none;stroke:var(--line-2);stroke-width:2.5;stroke-dasharray:8 8' : `fill:color-mix(in oklab, ${c.col} 18%, transparent);stroke:color-mix(in oklab, ${c.col} 60%, transparent);stroke-width:2` });
      g.append(r);
      const t = s('text', { x: c.x + 22, y: y - 52, class: 'v-label sm', style: 'fill:var(--fg-2);font-weight:700' });
      t.textContent = c.k;
      g.append(t);
      for (let i = 0; i < c.n; i++) g.append(s('circle', { cx: c.x + 34 + i * 46, cy: y, r: 16, style: `fill:${HP}` }));
      if (c.note) { const nt = s('text', { x: c.x + c.w / 2, y: y + 9, 'text-anchor': 'middle', class: 'v-label sm', style: 'fill:var(--fg-3);font-weight:600' }); nt.textContent = c.note; g.append(nt); }
    });
    const rt = s('text', { x: 1500, y: y + 14, 'text-anchor': 'end', class: 'v-label xl', style: 'fill:var(--fg)' });
    rt.innerHTML = res;
    g.append(rt);
    D.layers.nodes.append(g);
    rows.push(g);
    return g;
  };
  mkRow(100, 'NADH', ND, [
    { k: 'I', x: 200, w: 210, n: 4, col: 'var(--a1)' }, { k: 'II', x: 430, w: 120, n: 0, col: FD, note: '—' }, { k: 'III', x: 570, w: 210, n: 4, col: 'var(--elec)' }, { k: 'IV', x: 800, w: 120, n: 2, col: 'var(--act)' },
  ], '10 H⁺ → <tspan fill="var(--atp)">2.5 ATP</tspan>');
  const fr = mkRow(270, 'FADH_{2}', FD, [
    { k: 'I · skipped', x: 200, w: 210, n: 0, skip: true }, { k: 'II', x: 430, w: 120, n: 0, col: FD, note: '0 H⁺' }, { k: 'III', x: 570, w: 210, n: 4, col: 'var(--elec)' }, { k: 'IV', x: 800, w: 120, n: 2, col: 'var(--act)' },
  ], '6 H⁺ → <tspan fill="var(--atp)">1.5 ATP</tspan>');
  fr.style.opacity = 0;
  return { step: (n) => show(fr, n >= 1), destroy: () => D.destroy() };
}

/* ================================================================== */
/* ATP synthase scene (slides 14 & 17)                                 */
/* ================================================================== */
function synthaseScene(el, o = {}) {
  const cx0 = o.oligo ? -0.4 : 0.4;
  const kit = createScene(el, { cam: [cx0, 2.0, 18.6], target: [cx0, -1.15, 0], fov: 30, autoRotate: 0, hint: true });
  const root = new THREE.Group();
  kit.root.add(root);
  // cut-away bilayer: only the half behind the enzyme, so the c-ring stays visible
  root.add(membrane({ x0: -4.4, x1: 4.6, z0: -3.4, z1: 0.15, holes: [{ x: 0.45, z: 0, rx: 1.85, rz: 1.35 }], taper: 1.2, seed: 9 }));
  const V = new THREE.Group();
  root.add(V);
  const P = synthaseParts(V);
  const plug = protein([[0, 0, 0, 0.5, 0.4, 0.5]], 0xff3b30, 11);
  plug.position.set(1.05, 1.45, 0.55);
  plug.userData.mat.emissiveIntensity = 0.45;
  plug.visible = false;
  root.add(plug);
  const plugGlow = glowSprite(0xff3b30, 3);
  plugGlow.position.copy(plug.position);
  plugGlow.material.opacity = 0;
  root.add(plugGlow);
  kit.onFrame((dt, t) => { root.rotation.y = -0.32 + Math.sin(t * 0.35) * 0.3; });

  // labels
  const lab = (html, pos, tipSpec, cls = '') => kit.label(html, pos, { parent: root, tip: tipSpec, cls });
  const main = [
    lab('F₀', [-2.3, 0.2, 1.6], { title: 'F₀ · membrane domain', body: 'In the inner mitochondrial membrane. Contains the <b>H⁺ channel</b> and the <b>c-ring</b>. Oligomycin binds here.', src: SRC('13, 16') }, 'acc'),
    lab('F₁', o.oligo ? [2.35, -2.9, 0.6] : [-2.0, -3.75, 0.8], { title: 'F₁ · extramembranous domain', body: 'In the mitochondrial matrix. Subunits <b>α, β, γ, δ, ε</b>; contains the <b>catalytic activity</b> (ADP + Pᵢ → ATP).', src: SRC(13) }, 'acc'),
    lab('Intermembrane space', [-3.6, 2.9, 0], null, 'sm plain'),
    lab('Matrix', [-3.9, -1.9, 0], null, 'sm plain'),
  ];
  const f0Parts = [
    lab('c-ring', [-0.2, 1.75, 1.0], { title: 'c-ring', body: 'Ring of <b>c</b> subunits in the membrane; H⁺ flow makes it rotate.', src: SRC(13) }, 'sm'),
    lab('a', [1.55, 1.75, 0.6], { title: 'Subunit a', body: 'Sits beside the c-ring; the H⁺ path runs through it (the H⁺ channel).', src: SRC(13) }, 'sm'),
    lab('b₂', [2.1, -2.6, 0.2], { title: 'b₂ · peripheral stalk', body: 'Connects subunit a to δ on the head — holds the α₃β₃ head still while the rotor turns.', src: 'Lecture slide 13 figure' }, 'sm'),
  ];
  const f1Parts = [
    lab('α', [-0.75, -3.4, 1.05], { title: 'α subunits ×3', body: 'Alternate with β around the head.', src: SRC(13) }, 'sm'),
    lab('β', [0.65, -4.25, 1.05], { title: 'β subunits ×3', body: 'Carry the catalytic sites: ADP + Pᵢ → ATP.', src: SRC(13) }, 'sm'),
    lab('γ', [-0.55, -1.95, 0.6], { title: 'γ · central stalk', body: 'Turns with the c-ring inside the α₃β₃ head.', src: SRC(13) }, 'sm'),
    lab('ε', [0.95, -1.35, 0.6], { title: 'ε', body: 'Small subunit at the base of γ, on the c-ring.', src: SRC(13) }, 'sm'),
    lab('δ', [1.15, -5.45, 0.4], { title: 'δ', body: 'Cap on the head where the b₂ stalk attaches.', src: SRC(13) }, 'sm'),
  ];
  const oligoL = lab('Oligomycin', [2.4, 2.0, 0.6], { title: 'Oligomycin', body: 'Binds the F₀ domain and prevents re-entry of H⁺ into the matrix → ATP synthase stops → phosphorylation stops.', src: SRC(16) }, 'sm');
  oligoL.element.style.color = 'var(--inh)';
  oligoL.visible = false;
  if (o.oligo) [...f0Parts, ...f1Parts].forEach((l) => (l.visible = false));
  const atpL = lab('ADP + P<sub>i</sub> → ATP', [2.6, -4.3, 0.6], null, 'sm plain');

  // protons + ATP
  const rnd = rng(3);
  const pool = [];
  const addP = () => {
    const pp = particle(0xff9f0a, 0.6);
    pp.position.set(-4 + rnd() * 8, 1.7 + rnd() * 1.6, -2.4 + rnd() * 4.4);
    pp.userData.v = new THREE.Vector3((rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.6);
    root.add(pp);
    pool.push(pp);
  };
  for (let i = 0; i < 14; i++) addP();
  const moving = [], fx = [];
  let blocked = false, omega = 1.9, entryAcc = 0, atpAcc = 0, betaI = 0, nATP = 0, pileAcc = 0;
  const atpRate = { v: 1 };
  let clock = 0;
  const frame = (dt) => {
    clock += dt;
    const t = clock;
    omega += ((blocked ? 0 : 1.9) - omega) * (1 - Math.exp(-dt * 1.6));
    P.rotor.rotation.y -= omega * dt;
    pool.forEach((pp) => {
      pp.position.addScaledVector(pp.userData.v, dt);
      if (Math.abs(pp.position.x) > 4.2) pp.userData.v.x *= -1;
      if (pp.position.y < 1.55 || pp.position.y > 3.4) pp.userData.v.y *= -1;
      if (Math.abs(pp.position.z) > 2.6) pp.userData.v.z *= -1;
    });
    if (!blocked) {
      entryAcc += dt;
      if (entryAcc > 0.42 && pool.length) {
        entryAcc = 0;
        const pp = pool.shift();
        moving.push({ o: pp, c: new THREE.CatmullRomCurve3([pp.position.clone(), V3([1.25, 1.45, 0.75]), V3([1.12, 0.2, 0.8]), V3([1.0, -1.1, 0.8]), V3([1.6, -2.0, 1.0])]), t: 0 });
        addP();
      }
      atpAcc += dt * omega / 1.9;
      if (atpAcc > 0.9) {
        atpAcc = 0;
        const b = P.beta[betaI++ % 3];
        const wp = new THREE.Vector3();
        b.getWorldPosition(wp);
        root.worldToLocal(wp);
        const dir = new THREE.Vector3(wp.x, 0, wp.z).normalize();
        const a0 = wp.clone().addScaledVector(dir, 0.4);
        const pa = particle(0xffd60a, 1.0);
        pa.position.copy(a0);
        root.add(pa);
        fx.push({ o: pa, a: a0, b: a0.clone().addScaledVector(dir, 2.0).add(V3([0, -0.9, 0])), t: 0 });
        gsap.fromTo(b.material, { emissiveIntensity: 0.6 }, { emissiveIntensity: 0, duration: 0.6 });
        nATP++;
      }
    } else if (pool.length < 40) {
      pileAcc += dt;
      if (pileAcc > 0.3) { pileAcc = 0; addP(); }
    }
    for (let i = moving.length - 1; i >= 0; i--) {
      const m = moving[i];
      m.t += dt / 1.3;
      if (m.t >= 1) { root.remove(m.o); m.o.children.forEach((c) => c.material.dispose()); moving.splice(i, 1); continue; }
      m.o.position.copy(m.c.getPointAt(m.t));
      if (m.t > 0.8) m.o.setOpacity((1 - m.t) * 5);
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt / 1.5;
      if (f.t >= 1) { root.remove(f.o); f.o.children.forEach((c) => c.material.dispose()); fx.splice(i, 1); continue; }
      f.o.position.lerpVectors(f.a, f.b, 1 - Math.pow(1 - f.t, 2));
      f.o.setOpacity(Math.min(1, (1 - f.t) * 2.5));
    }
    plugGlow.material.opacity = blocked ? 0.55 + 0.25 * Math.sin(t * 4) : 0;
    atpRate.v += ((blocked ? 0 : omega / 1.9) - atpRate.v) * (1 - Math.exp(-dt * 2));
    if (o.onTick) o.onTick({ pool: pool.length, atp: atpRate.v, nATP });
  };
  kit.onFrame(frame);
  for (let i = 0; i < 60; i++) frame(0.05);
  const hl = (mats, on) => mats.forEach((m) => gsap.to(m, { emissiveIntensity: on ? 0.32 : 0, duration: 0.6 }));
  const api = kitController(kit, {
    step(n) {
      if (o.oligo) return;
      f0Parts.forEach((l) => { l.visible = n >= 1; });
      f1Parts.forEach((l) => { l.visible = n >= 2; });
      hl([P.mats.c, P.mats.a], n === 1);
      hl([P.mats.al, P.mats.be, P.mats.g, P.mats.e, P.mats.d], n === 2);
      main[0].element.style.opacity = n === 2 ? 0.4 : 1;
      main[1].element.style.opacity = n === 1 ? 0.4 : 1;
    },
  });
  api.setBlocked = (on) => {
    blocked = on;
    plug.visible = on;
    oligoL.visible = on;
    gsap.to(atpL.element, { opacity: on ? 0.3 : 1, duration: 0.4 });
  };
  api.kit = kit;
  return api;
}

function oligoViz(el) {
  const mPool = meter('H⁺ in intermembrane space', HP, 330);
  const mAtp = meter('ATP synthesis', AT, 330);
  const api = synthaseScene(el, {
    oligo: true,
    onTick: ({ pool, atp }) => {
      mPool.set((pool - 8) / 32, pool > 28 ? '<b style="color:var(--prot)">piling up</b>' : 'steady');
      mAtp.set(atp, atp < 0.1 ? '<b style="color:var(--inh)">stopped</b>' : 'running');
    },
  });
  const t = toggle({ label: 'Oligomycin', danger: true, onChange: (v) => api.setBlocked(v) });
  tip(t.el, { title: 'Oligomycin', body: 'Binds F₀ → H⁺ cannot re-enter the matrix → no ATP.', src: SRC(16) });
  const bar = ctrlBar(el, [h('div', { style: 'display:grid;gap:16px' }, [mPool.el, mAtp.el, t.el])], { left: 0, bottom: 0 });
  bar.style.padding = '22px 26px';
  return { ...api, step: (n) => t.set(n >= 1) };
}

/* ================================================================== */
/* Class cards minis (slide 15)                                        */
/* ================================================================== */
function classMini(el, kind) {
  el.style.minHeight = '0';
  const D = diagram(el, 470, 300);
  D.svg.style.height = '100%';
  const band = (y = 150) => {
    D.layers.regions.append(s('rect', { x: 0, y: y - 22, width: 470, height: 44, rx: 22, style: 'fill:var(--surface-3)' }));
  };
  if (kind === 'etc') {
    const xs = [50, 170, 290, 410];
    const lbs = ['I', 'III', 'IV', 'O₂'];
    const path = s('path', { d: 'M50,150 L232,150', style: 'fill:none;stroke:none' });
    D.layers.edges.append(s('path', { d: 'M50,150 L410,150', style: 'stroke:var(--line-2);stroke-width:4;stroke-dasharray:4 10;stroke-linecap:round' }));
    D.layers.fx.append(path);
    xs.forEach((x, i) => {
      const g = s('g', { transform: `translate(${x} 150)`, style: i >= 2 ? 'opacity:.35' : '' });
      g.append(s('circle', { r: 36, style: 'fill:var(--bg);stroke:var(--a1);stroke-width:3' }));
      const t = s('text', { y: 10, 'text-anchor': 'middle', style: 'font:750 26px var(--font);fill:var(--fg)' }); t.textContent = lbs[i];
      g.append(t);
      D.layers.nodes.append(g);
    });
    D.layers.labels.append(s('path', { d: 'M232,104 L232,196', style: `stroke:${IN};stroke-width:9;stroke-linecap:round` }));
    D.flow(path, { count: 3, color: EL, speed: 90, r: 10 });
    D.text(235, 262, 'e⁻ flow stops here', { anchor: 'middle', cls: 'sm', style: `fill:${IN};font-weight:650` });
  } else if (kind === 'oligo') {
    band(170);
    D.layers.nodes.append(s('rect', { x: 200, y: 128, width: 70, height: 84, rx: 18, style: 'fill:color-mix(in oklab, var(--atp) 22%, var(--bg));stroke:var(--atp);stroke-width:3' }));
    D.layers.nodes.append(s('circle', { cx: 235, cy: 262, r: 34, style: 'fill:color-mix(in oklab, var(--atp) 22%, var(--bg));stroke:var(--atp);stroke-width:3;opacity:.5' }));
    D.layers.nodes.append(s('rect', { x: 226, y: 212, width: 18, height: 18, style: 'fill:var(--atp);opacity:.5' }));
    D.layers.labels.append(s('circle', { cx: 262, cy: 124, r: 18, style: `fill:${IN}` }));
    const rnd = rng(4);
    for (let i = 0; i < 16; i++) {
      const c = s('circle', { cx: 40 + rnd() * 390, cy: 30 + rnd() * 70, r: 11, style: `fill:${HP}` });
      D.layers.fx.append(c);
      gsap.to(c, { attr: { cy: `+=${6 + rnd() * 8}` }, duration: 0.8 + rnd(), repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
    D.text(330, 270, 'no ATP', { cls: 'sm', style: `fill:${IN};font-weight:700` });
  } else {
    band(150);
    for (const x of [90, 200]) {
      const p = s('path', { d: `M${x},270 L${x},20`, style: 'fill:none;stroke:none' });
      D.layers.fx.append(p);
      D.flow(p, { count: 2, color: HP, speed: 110, r: 10 });
      D.layers.nodes.append(s('rect', { x: x - 30, y: 116, width: 60, height: 68, rx: 18, style: 'fill:color-mix(in oklab, var(--a1) 24%, var(--bg));stroke:var(--a1);stroke-width:3' }));
    }
    D.layers.regions.append(s('ellipse', { cx: 350, cy: 150, rx: 110, ry: 100, style: `fill:color-mix(in oklab, ${IN} 22%, transparent);filter:blur(18px)` }));
    D.layers.nodes.append(s('rect', { x: 330, y: 126, width: 40, height: 48, rx: 12, style: `fill:var(--bg);stroke:${IN};stroke-width:3;stroke-dasharray:6 5` }));
    const lp = s('path', { d: 'M350,20 L350,280', style: 'fill:none;stroke:none' });
    D.layers.fx.append(lp);
    D.flow(lp, { count: 3, color: HP, speed: 130, r: 10 });
    D.text(400, 60, 'leak', { cls: 'sm', style: `fill:${IN};font-weight:700` });
    D.text(400, 260, 'heat', { cls: 'sm', style: `fill:${IN};font-weight:700` });
  }
  return { destroy: () => D.destroy() };
}

/* ================================================================== */
/* Site-specific inhibitors (slide 16)                                 */
/* ================================================================== */
function inhibitorsViz(el) {
  const D = diagram(el, 960, 860);
  const X = 360;
  const N = [
    ['nad', 'NADH', 40], ['fmn', 'FMN', 135], ['fes', 'Fe-S', 225], ['q', 'CoQ', 325], ['b', 'cyt b', 420], ['c1', 'cyt c_{1}', 510], ['c', 'cyt c', 605], ['aa3', 'cyt aa_{3}', 700], ['o2', 'O_{2}', 805],
  ];
  // complex boxes
  const cbox = (y1, y2, col, label, ly, t) => {
    D.region({ x: X - 95, y: y1, w: 190, h: y2 - y1, r: 26, fill: `color-mix(in oklab, ${col} 12%, transparent)`, stroke: `color-mix(in oklab, ${col} 55%, transparent)`, tip: t });
    D.text(X - 115, ly, label, { anchor: 'end', cls: 'sm', style: `fill:${col};font-weight:700` });
  };
  cbox(95, 265, 'var(--a1)', 'Complex I', 188, CX.I);
  cbox(380, 550, 'var(--elec)', 'Complex III', 473, CX.III);
  cbox(662, 740, 'var(--act)', 'Complex IV', 709, CX.IV);
  N.forEach(([id, t, y]) => D.node({ id, x: X, y, label: t, kind: 'mol', size: 26, color: id === 'o2' ? 'var(--o2)' : id === 'nad' ? ND : undefined, tip: id === 'q' ? CX.Q : id === 'c' ? CX.c : undefined }));
  const segs = [];
  for (let i = 0; i < N.length - 1; i++) {
    const a = D.arrow({ from: N[i][0], to: N[i + 1][0], width: 3, color: 'var(--line-2)', headSize: 11, gapStart: 2, gapEnd: 4 });
    segs.push({ a, f: D.flow(a, { count: 1, color: EL, speed: 70, r: 9, autoplay: false }) });
  }
  segs.forEach((sg) => sg.f.dots.forEach((d) => D.layers.labels.append(d)));
  // FADH2 entry
  D.node({ id: 'c2', x: 135, y: 325, label: 'Complex II', sub: 'FADH₂', kind: 'enz', size: 24, color: FD, tip: { ...CX.II, body: CX.II.body + LIPP('Complex I inhibitors do not stop electrons from FADH₂, which enter at CoQ.') } });
  const a2 = D.arrow({ from: 'c2', to: 'q', width: 3, color: FD, headSize: 11 });
  const f2 = D.flow(a2, { count: 1, color: FD, speed: 70, r: 9, autoplay: false });
  // block sites (seg index after which block sits)
  const SITES = [
    { seg: 2, y: 275, drugs: ['Rotenone', 'Amobarbital', 'Piericidin'], note: 'Slide figure draws the bar between FMN and Fe-S; many textbooks place the block at Fe-S → CoQ (piericidin competes with CoQ). Exam answer: <b>Complex I</b>.' },
    { seg: 4, y: 465, drugs: ['Antimycin A', 'Dimercaprol (BAL)'], note: 'Blocks between cytochrome b and cytochrome c₁. Dimercaprol and BAL (British anti-Lewisite) are the <b>same drug</b> — the slide lists both names.' },
    { seg: 7, y: 752, drugs: ['Cyanide', 'CO', 'H₂S'], note: 'Blocks cytochrome aa₃ → O₂: oxygen cannot be reduced to water.' },
  ];
  const marks = SITES.map((st, i) => {
    const g = s('g', { style: 'opacity:0' });
    g.append(s('path', { d: `M${X - 46},${st.y} L${X + 46},${st.y}`, style: `stroke:${IN};stroke-width:10;stroke-linecap:round` }));
    const glow = s('circle', { cx: X, cy: st.y, r: 30, style: `fill:${IN};opacity:.25;filter:blur(8px)` });
    g.prepend(glow);
    const n = st.drugs.length;
    g.append(s('path', { d: `M${X + 56},${st.y} L${600},${st.y}`, style: `stroke:${IN};stroke-width:2.5;stroke-dasharray:5 6;opacity:.7` }));
    st.drugs.forEach((d, k) => {
      const w = d.length * 14 + 44;
      const b = D.badge(610 + w / 2, st.y + (k - (n - 1) / 2) * 46, d, { color: IN, size: 23, w, tip: { kicker: ['Complex I', 'Complex III', 'Complex IV'][i], title: d, body: st.note, src: SRC(15) } });
      g.append(b);
    });
    D.layers.labels.append(g);
    return g;
  });
  const set = (n) => {
    const site = n ? SITES[n - 1] : null;
    marks.forEach((m, i) => gsap.to(m, { opacity: n === i + 1 ? 1 : 0, duration: 0.5 }));
    const blockSeg = site ? site.seg : 99;
    segs.forEach((sg, i) => {
      const below = i >= blockSeg;
      // Complex I block: FADH2 electrons still feed CoQ → downstream keeps running (textbook)
      const run = !below || (n === 1 && i >= 3);
      run ? sg.f.play() : sg.f.hide();
      gsap.to(sg.a.g, { opacity: below && !run ? 0.25 : 1, duration: 0.4 });
    });
    N.forEach(([id], k) => gsap.to(D.nodes[id].g, { opacity: site && k > blockSeg && !(n === 1 && k >= 3) ? 0.35 : 1, duration: 0.4 }));
    f2.play();
  };
  return { step: set, destroy: () => D.destroy() };
}

/* ================================================================== */
/* Uncouplers (slide 18)                                               */
/* ================================================================== */
function uncouplerViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 0, y: 96, w: 960, h: 234, r: 36, label: 'Intermembrane space', fill: 'color-mix(in oklab, var(--prot) 6%, transparent)' });
  D.region({ x: 0, y: 440, w: 960, h: 270, r: 36, label: 'Matrix', ly: 246, fill: 'color-mix(in oklab, var(--nadh) 6%, transparent)' });
  D.layers.regions.append(s('rect', { x: 0, y: 342, width: 960, height: 86, rx: 43, style: 'fill:color-mix(in oklab, var(--a1) 22%, var(--surface-3))' }));
  // heat glow
  const heat = s('ellipse', { cx: 640, cy: 385, rx: 210, ry: 190, style: `fill:${IN};opacity:0;filter:blur(40px)` });
  D.layers.regions.append(heat);
  // complexes
  const cxs = [{ k: 'I', x: 110 }, { k: 'III', x: 290 }, { k: 'IV', x: 460 }];
  cxs.forEach((c) => {
    const g = s('g', { 'data-tip': JSON.stringify(CX[c.k]) });
    g.append(s('rect', { x: c.x - 46, y: 316, width: 92, height: 138, rx: 26, style: 'fill:color-mix(in oklab, var(--a1) 26%, var(--bg));stroke:var(--a1);stroke-width:3' }));
    const t = s('text', { x: c.x, y: 396, 'text-anchor': 'middle', style: 'font:750 28px var(--font);fill:var(--fg)' }); t.textContent = c.k;
    g.append(t);
    D.layers.nodes.append(g);
    const p = s('path', { d: `M${c.x + 26},520 L${c.x + 26},150`, style: 'fill:none;stroke:none' });
    D.layers.fx.append(p);
    D.flow(p, { count: 2, color: HP, speed: 120, r: 9 });
  });
  // electron path
  const ep = D.arrow({ d: 'M70,500 C140,550 230,550 300,500 S430,460 470,500 L520,550', from: [70, 500], to: [520, 550], color: EL, width: 4 });
  const fE = D.flow(ep, { count: 4, color: EL, speed: 150, r: 9 });
  D.text(540, 578, 'O₂ → H₂O', { cls: 'sm', style: 'fill:var(--o2);font-weight:700' });
  D.text(40, 550, 'e⁻', { cls: 'lg', style: `fill:${EL}` });
  // ATP synthase
  const syn = s('g', { 'data-tip': JSON.stringify(CX.V) });
  const synR = s('rect', { x: 810, y: 326, width: 80, height: 120, rx: 22, style: 'fill:color-mix(in oklab, var(--atp) 22%, var(--bg));stroke:var(--atp);stroke-width:3' });
  const synC = s('circle', { cx: 850, cy: 520, r: 56, style: 'fill:color-mix(in oklab, var(--atp) 22%, var(--bg));stroke:var(--atp);stroke-width:3' });
  syn.append(synR, s('rect', { x: 842, y: 446, width: 16, height: 22, style: 'fill:var(--atp);opacity:.7' }), synC);
  const ft = s('text', { x: 850, y: 529, 'text-anchor': 'middle', style: 'font:750 24px var(--font);fill:var(--fg)' }); ft.textContent = 'F₁';
  syn.append(ft);
  D.layers.nodes.append(syn);
  const sp = s('path', { d: 'M850,170 L850,510', style: 'fill:none;stroke:none' });
  D.layers.fx.append(sp);
  const fS = D.flow(sp, { count: 3, color: HP, speed: 120, r: 9 });
  const ap = s('path', { d: 'M890,550 L930,640', style: 'fill:none;stroke:none' });
  D.layers.fx.append(ap);
  const fATP = D.flow(ap, { count: 1, color: AT, speed: 50, r: 14 });
  const atpT = D.text(850, 690, 'ATP', { anchor: 'middle', cls: 'lg', style: `fill:${AT}` });
  // leak site
  const leakG = s('g', { style: 'opacity:0' });
  const chan = s('rect', { x: 618, y: 320, width: 64, height: 132, rx: 26, style: `fill:color-mix(in oklab, ${AC} 30%, var(--bg));stroke:${AC};stroke-width:3` });
  const mol = s('g');
  const hex = (cx, cy) => s('polygon', { points: Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2; return `${cx + Math.cos(a) * 24},${cy + Math.sin(a) * 24}`; }).join(' '), style: `fill:color-mix(in oklab, ${IN} 25%, var(--bg));stroke:${IN};stroke-width:3` });
  const h1 = hex(0, 0);
  mol.append(h1);
  const molG = s('g', { transform: 'translate(650 310)' }, [mol]);
  leakG.append(chan, molG);
  D.layers.nodes.append(leakG);
  const lp = s('path', { d: 'M650,160 L650,550', style: 'fill:none;stroke:none' });
  D.layers.fx.append(lp);
  const fL = D.flow(lp, { count: 4, color: HP, speed: 170, r: 10, autoplay: false });
  const leakT = D.text(700, 230, 'H⁺ leak', { cls: 'lg', style: `fill:${IN};opacity:0` });
  const molT = D.text(650, 620, '', { anchor: 'middle', cls: 'sm', style: `fill:${IN};font-weight:700;opacity:0` });
  // standing H⁺ pool in the IMS (the gradient) — drains when uncoupled
  const rp = rng(21);
  const poolG = s('g');
  for (let i = 0; i < 22; i++) {
    const x = 40 + (i % 11) * 52 + rp() * 20, y = 196 + Math.floor(i / 11) * 62 + rp() * 22;
    const g = s('g', { transform: `translate(${x} ${y})` });
    g.append(s('circle', { r: 14, style: `fill:color-mix(in oklab, ${HP} 80%, transparent)` }));
    const tx = s('text', { y: 6, 'text-anchor': 'middle', style: 'font:800 15px var(--font);fill:#1d1d1f' }); tx.textContent = 'H⁺';
    g.append(tx);
    poolG.append(g);
  }
  D.layers.labels.append(poolG);
  // meters
  const mE = meter('Electron flow', EL), mG = meter('H⁺ gradient', HP), mA = meter('ATP', AT), mQ = meter('Heat', IN);
  const grid = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(2,1fr);gap:14px 44px;padding:20px 30px;border-radius:30px;background:var(--surface);border:1px solid var(--line)' }, [mE.el, mG.el, mA.el, mQ.el]);
  el.append(grid);
  let on = false, agent = 'dnp';
  const AG = {
    dnp: { t: '2,4-DNP', chan: false }, dic: { t: 'Dicoumarol', chan: false }, sal: { t: 'Salicylate', chan: false }, ucp: { t: 'UCP · thermogenin', chan: true },
  };
  let shuttle = null;
  const set = () => {
    const A = AG[agent];
    gsap.to(leakG, { opacity: on ? 1 : 0, duration: 0.4 });
    chan.style.display = A.chan ? '' : 'none';
    molG.style.display = A.chan ? 'none' : '';
    shuttle?.kill();
    if (on && !A.chan) shuttle = gsap.fromTo(molG, { attr: { transform: 'translate(650 290)' } }, { attr: { transform: 'translate(650 480)' }, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    molT.textContent = A.chan ? 'uncoupling protein' : `${A.t} carries H⁺ across`;
    gsap.to([leakT, molT], { opacity: on ? 1 : 0, duration: 0.4 });
    on ? fL.play() : fL.hide();
    on ? (fS.hide(), fATP.hide()) : (fS.play(), fATP.play());
    synR.style.strokeDasharray = on ? '7 7' : '';
    synC.style.strokeDasharray = on ? '7 7' : '';
    gsap.to([syn, atpT], { opacity: on ? 0.4 : 1, duration: 0.4 });
    gsap.to(heat, { opacity: on ? 0.42 : 0, duration: 1.2 });
    gsap.to([...poolG.children], { opacity: (i) => (on ? (i % 4 === 0 ? 0.9 : 0.08) : 1), duration: 0.9, stagger: 0.02 });
    mE.set(on ? 1 : 0.8, on ? 'continues ↑' : 'flowing');
    mG.set(on ? 0.1 : 0.8, on ? 'dissipated' : 'built up');
    mA.set(on ? 0.06 : 0.85, on ? '<b style="color:var(--inh)">little / none</b>' : 'running');
    mQ.set(on ? 0.95 : 0.06, on ? '<b style="color:var(--inh)">thermogenesis</b>' : '—');
    fE.play();
  };
  const t = toggle({ label: 'Uncoupler', danger: true, onChange: (v) => { on = v; set(); } });
  const sAg = seg({ options: [{ v: 'dnp', t: '2,4-DNP' }, { v: 'dic', t: 'Dicoumarol' }, { v: 'sal', t: 'Salicylate' }, { v: 'ucp', t: 'UCP' }], value: 'dnp', onChange: (v) => { agent = v; if (!on) t.set(true); else set(); } });
  const agTips = [
    { title: '2,4-Dinitrophenol (DNP)', body: 'Chemical uncoupler.' + LIPP('a lipid-soluble weak acid that ferries H⁺ across the inner membrane; once sold as a slimming drug — fatal hyperthermia.'), src: SRC(18) },
    { title: 'Dicoumarol', body: 'Chemical uncoupler (spelled “Dicuomarol” on the slide).', src: SRC(18) },
    { title: 'Salicylate', body: 'Chemical uncoupler.' + LIPP('high-dose aspirin (salicylate) poisoning causes fever / hyperthermia through uncoupling.'), src: SRC(18) },
    { title: 'Uncoupling proteins', body: 'Create a channel that lets H⁺ re-enter the matrix without capturing energy as ATP.' + LIPP('UCP1 = thermogenin in brown fat → non-shivering thermogenesis in newborns.'), src: SRC(18) },
  ];
  [...sAg.el.children].forEach((b, i) => tip(b, agTips[i]));
  ctrlBar(el, [t, sAg], { left: 0, top: 0 });
  set();
  return { step: (n) => t.set(n >= 1), leave: () => shuttle?.pause(), enter: () => shuttle?.play(), destroy() { shuttle?.kill(); D.destroy(); } };
}

/* ================================================================== */
/* Compare cards meters (slide 19)                                     */
/* ================================================================== */
function compareMini(el, vals, verdict) {
  el.style.minHeight = '0';
  el.style.display = 'grid';
  el.style.alignContent = 'space-between';
  el.style.gap = '22px';
  el.append(h('div', { style: 'font-size:34px;line-height:1.25;font-weight:620;letter-spacing:-.01em;color:var(--fg-2);margin:14px 0 18px', html: verdict }));
  const box = h('div', { style: 'display:grid;gap:30px' });
  const rows = [
    ['Electron flow', EL], ['H⁺ gradient', HP], ['ATP synthesis', AT], ['Heat', IN],
  ].map(([l, c], i) => { const m = meter(l, c, 0, true); box.append(m.el); m.set(0, vals[i][1]); return m; });
  el.append(box);
  const go = () => rows.forEach((m, i) => m.set(vals[i][0], vals[i][1]));
  const sec = el.closest('.slide');
  const mo = new MutationObserver(() => { if (sec.classList.contains('is-current')) { rows.forEach((m, i) => m.set(0, vals[i][1])); setTimeout(go, 450); } });
  if (sec) mo.observe(sec, { attributes: true, attributeFilter: ['class'] });
  setTimeout(go, 600);
  return { destroy: () => mo.disconnect() };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry, 9th ed. (Abali, Cline, Franklin, Viselli; Wolters Kluwer) — Chapter 5, <span style="white-space:nowrap">pages 85–94</span>',
    'Lecture slides: Oxidative phosphorylation &amp; ETC (L.10), Dr Vijaya Marakala, NUST',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.10 · Dr Vijaya Marakala',
      title: '<span style="display:block;font-size:104px;letter-spacing:-.035em">Oxidative <em>phosphorylation</em></span>',
      subtitle: 'Electrons fall. Protons climb. ATP spins out.',
      meta: ['Inner membrane', 'Chemiosmotic coupling', '4 learning outcomes'],
      notes: [
        'Welcome. Today: how the cell turns the electrons carried by NADH and FADH₂ into ATP — the biggest ATP source in the body.',
        'On the right: a cut-away mitochondrion. Blue outer membrane, violet inner membrane folded into cristae, glowing matrix. Drag it to rotate.',
        'Roadmap: definitions → mitochondrion → the chain and its components → cellular respiration → chemiosmotic theory → ATP yield → ATP synthase → inhibitors and uncouplers.',
      ],
      visual: heroViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      class: 'cards-2x2',
      cards: [
        { icon: 'bolt', k: 'L.10.1', title: 'Define oxidative phosphorylation', tip: { title: 'L.10.1', body: 'Define oxidative phosphorylation.', src: SRC(2) } },
        { icon: 'chain', k: 'L.10.2', title: 'List the ETC components', tip: { title: 'L.10.2', body: 'List components of electron transport chain [ETC].', src: SRC(2) } },
        { icon: 'cycle', k: 'L.10.3', title: 'Explain cellular respiration', tip: { title: 'L.10.3', body: 'Explain the mechanism of cellular respiration.', src: SRC(2) } },
        { icon: 'alert', k: 'L.10.4', title: 'Explain inhibitors & uncouplers', tip: { title: 'L.10.4', body: 'Explain the mechanism of action of inhibitors and uncouplers of ETC.', src: SRC(2) } },
      ],
      notes: 'Four examinable outcomes. Hover a card for the exact SLO wording from slide 2. There is no clinical case in this lecture — the inhibitor / uncoupler section is where the clinical relevance lives (cyanide, CO, salicylate).',
    },
    {
      eyebrow: 'Where it happens',
      title: 'Inside a <em>mitochondrion</em>',
      bullets: [
        { t: '<b>Outer</b> membrane · smooth', tip: { title: 'Outer mitochondrial membrane', body: 'The smooth outer boundary.' + LIPP('freely permeable to most small molecules and ions.'), src: SRC(3) } },
        { t: '<b>Inner</b> membrane · folded into <b>cristae</b>', tip: { title: 'Inner mitochondrial membrane', body: 'Folded into cristae. Holds the ETC complexes and ATP synthase.' + LIPP('impermeable to most ions, including H⁺ — essential for the gradient.'), src: SRC('3, 10') } },
        { t: '<b>Intermembrane space</b> · H⁺ collect', tip: { title: 'Intermembrane space', body: 'Between the membranes. Protons pumped out of the matrix accumulate here.', src: SRC(10) } },
        { t: '<b>Matrix</b> · TCA cycle inside', tip: { title: 'Matrix', body: 'Pyruvate → acetyl-CoA and the TCA cycle run here; F₁ of ATP synthase projects into it.', src: SRC('6, 13') } },
      ],
      steps: 4,
      focus: true,
      src: 'Lecture slides 3, 10 · procedural 3D model, not to scale',
      notes: [
        'Press → to highlight each compartment; hover the 3D labels for detail.',
        'Outer membrane: smooth outer boundary.',
        'Inner membrane: folded into cristae — this is where the ETC and ATP synthase sit. Its impermeability to H⁺ (Lippincott) is what allows a proton gradient.',
        'Intermembrane space: where pumped protons collect (low pH, positive).',
        'Matrix: TCA cycle; F₁ of ATP synthase faces it (high pH, negative).',
      ],
      visual: anatomyViz,
    },
    {
      eyebrow: 'L.10.2 · Definition',
      title: 'The electron <em>transport chain</em>',
      bullets: [
        { t: '<b>Protein complexes</b> in the inner membrane', tip: { title: 'ETC (slide 3)', body: '“A series of protein complexes located in the inner mitochondrial membrane that transfer electrons from NADH and FADH₂ to oxygen, releasing energy that is used to produce ATP.”', src: SRC(3) } },
        { t: 'Pass e⁻ from <b>NADH</b>, <b>FADH₂</b> → O₂' },
        { t: 'Energy released → <b>ATP</b>' },
        { t: 'Also called the <b>respiratory chain</b>', tip: 'Slide 5: “Electron transport chain OR Respiratory chain”.' },
      ],
      steps: 2,
      src: 'Lecture slides 3, 5, 15 · energy levels schematic',
      notes: [
        'Definition from slide 3 (hover the first bullet for the verbatim wording).',
        'The relay order (slide 15 figure): NADH → FMN → Fe-S → CoQ → cyt b → cyt c₁ → cyt c → cyt aa₃ → O₂. Electrons lose energy at each hand-off (Lippincott: increasing redox potential — not on the slides).',
        'Build 1: group the carriers into Complexes I, III and IV; CoQ and cytochrome c are the mobile carriers (dashed).',
        'Build 2: FADH₂ enters through Complex II straight to CoQ — it skips Complex I.',
      ],
      visual: stairViz,
    },
    {
      eyebrow: 'L.10.1 · Definitions',
      title: 'Four words to <em>own</em>',
      bullets: [
        { t: '<b>Phosphorylation</b>: ADP + P<sub>i</sub> → ATP', tip: { title: 'Phosphorylation', body: '“The formation of ATP from ADP and Pi is termed phosphorylation.”', src: SRC(4) } },
        { t: '<b>Oxidation</b>: loss of electrons', tip: { title: 'Oxidation', body: '“Oxidation: loss of electrons.” NADH is oxidised to NAD⁺ when it hands 2 e⁻ to the chain.', src: SRC('4, 5') } },
        { t: '<b>Reduction</b>: gain of electrons', tip: { title: 'Reduction', body: '“Reduction: gain in electrons.” O₂ is reduced: ½O₂ + 2H⁺ → H₂O.', src: SRC('4, 6') } },
        { t: '<b>Oxidative phosphorylation</b> = coupling', tip: { title: 'Oxidative phosphorylation', body: '“Coupling of electron transport with ATP synthesis.”', src: SRC('4, 5') } },
      ],
      steps: 4,
      focus: true,
      src: 'Lecture slides 4–6',
      notes: [
        'Step through the four definitions from slide 4.',
        'Phosphorylation = making ATP from ADP + Pi.',
        'Oxidation = losing electrons (NADH → NAD⁺). Reduction = gaining electrons (O₂ → H₂O).',
        'Oxidative phosphorylation = the coupling of electron transport (redox) with ATP synthesis. That word “coupling” is the definition examiners want.',
      ],
      visual: defsViz,
    },
    {
      eyebrow: 'L.10.1 · Contrast',
      title: 'Two ways to make <em>ATP</em>',
      bullets: [
        { t: '<b>Oxidative</b>: needs ETC + O₂', tip: { title: 'Oxidative phosphorylation', body: 'Coupling of electron transport with ATP synthesis — requires the ETC and molecular O₂.', src: SRC(4) } },
        { t: '<b>Substrate-level</b>: needs neither', tip: { title: 'Substrate-level phosphorylation', body: '“Formation of ATP without involvement of electron transport chain and molecular O₂.”', src: SRC(4) } },
        { t: 'SLP in glycolysis & TCA cycle', tip: { title: 'Where SLP happens', body: 'Slide 7 labels the ATP from glycolysis and from the TCA cycle as substrate-level.' + LIPP('the TCA step gives GTP in many tissues.'), src: SRC('6, 7') } },
      ],
      steps: 1,
      src: 'Lecture slides 4, 6, 7',
      notes: [
        'Substrate-level: a high-energy substrate passes its phosphate directly to ADP — no ETC, no O₂.',
        'Oxidative: electrons from NADH/FADH₂ flow through the ETC to O₂; the energy drives ATP synthase.',
        'Press → (or flip the toggle) to remove oxygen: the oxidative lane stops, substrate-level carries on.',
      ],
      visual: slpOxViz,
    },
    {
      layout: 'full',
      eyebrow: 'The big picture',
      title: 'All fuels feed the <em>chain</em>',
      bullets: [{ t: 'Each coenzyme gives 2 e⁻' }, { t: 'O₂ is the final acceptor' }],
      steps: 3,
      src: 'Lecture slide 5',
      notes: [
        'Build 1: glucose, fatty acids and amino acids are catabolised to the reduced coenzymes NADH + H⁺ and FADH₂.',
        'Build 2: each gives 2 electrons to the ETC (“respiratory chain”). NADH enters at the first carrier, FADH₂ further down. Electrons finally reduce ½O₂ + 2H⁺ → H₂O.',
        'Build 3: the energy released drives phosphorylation (ADP + Pi → ATP). Electron transport + phosphorylation, coupled = oxidative phosphorylation.',
      ],
      visual: nutrientsViz,
    },
    {
      layout: 'full',
      eyebrow: 'L.10.3 · Cellular respiration',
      title: 'From glucose to <em>ATP</em>',
      bullets: [{ t: 'Cytoplasm → matrix → inner membrane' }, { t: 'Hover the “?” gate' }],
      steps: 4,
      src: 'Lecture slides 6–7 · shuttle note: Lippincott',
      notes: [
        'Build 1 — cytoplasm: glucose → glycolysis → pyruvate, with ATP by substrate-level phosphorylation and NADH + H⁺.',
        'Accuracy note: slide 7 draws cytosolic NADH going straight into the matrix. The inner membrane is impermeable to NADH; its electrons enter via shuttles (glycerol-3-phosphate or malate–aspartate; Lippincott). Hover the “?” gate.',
        'Build 2 — pyruvate enters the mitochondrion and becomes acetyl-CoA.',
        'Build 3 — matrix: TCA cycle → NADH + H⁺, FADH₂ and ATP (substrate-level; GTP in many tissues).',
        'Build 4 — inner membrane: NADH → Complex I, FADH₂ → Complex II; electrons to O₂ (½O₂ + 2H⁺ → H₂O); proton pumping drives ATP synthase → oxidative ATP.',
      ],
      visual: respirationViz,
    },
    {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'L.10.2 · Components',
      title: 'Four complexes, two <em>carriers</em>',
      cards: [
        { k: 'Complex I', title: '<span style="font-size:37px">NADH dehydrogenase</span>', body: 'FMN · Fe-S', viz: (v) => pumpMini(v, 4), tip: CX.I },
        { k: 'Complex II', title: '<span style="font-size:37px">Succinate dehydrogenase</span>', body: 'FAD · Fe-S', viz: (v) => pumpMini(v, 0), tip: CX.II },
        { k: 'Complex III', title: '<span style="font-size:37px">Cytochrome bc₁</span>', body: 'Cyt b · cyt c₁ · Fe-S', viz: (v) => pumpMini(v, 4), tip: CX.III },
        { k: 'Complex IV', title: '<span style="font-size:37px">Cytochrome c oxidase</span>', body: 'Cyt a · a₃ · Cu<sub>A</sub> · Cu<sub>B</sub>', viz: (v) => pumpMini(v, 2), tip: CX.IV },
        { k: 'Mobile carrier', title: '<span style="font-size:37px">Coenzyme Q</span>', body: 'Ubiquinone · in the membrane', style: 'padding-right:46%', viz: (v) => carrierMini(v, 'q'), tip: { ...CX.Q, body: CX.Q.body + '<br><span style="color:var(--fg-3)">3D: real PubChem structure (short-tailed ubiquinone).</span>' } },
        { k: 'Mobile carrier', title: '<span style="font-size:37px">Cytochrome c</span>', body: 'Heme protein · IMS face', style: 'padding-right:46%', viz: (v) => carrierMini(v, 'c'), tip: { ...CX.c, body: CX.c.body + '<br><span style="color:var(--fg-3)">3D: real crystal structure (PDB 1HRC) with its heme.</span>' } },
      ],
      src: 'Lecture slides 8, 10',
      notes: [
        'Slide 8 table. Complex I = NADH dehydrogenase (FMN, Fe-S). Complex II = succinate dehydrogenase (FAD, Fe-S). Complex III = cytochrome bc₁ (cyt b, c₁, Fe-S). Complex IV = cytochrome c oxidase (cyt a, a₃, CuA, CuB).',
        'Mobile carriers: coenzyme Q (ubiquinone) and cytochrome c.',
        'Proton pumping from slide 10: I = 4, II = 0, III = 4, IV = 2. Complex II is the odd one out.',
        'The two 3D models are real structures: ubiquinone (PubChem) and cytochrome c (PDB 1HRC) with its heme.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Live model · press → to tour',
      title: 'The chain, <em>running</em>',
      bullets: [{ t: 'NADH → O₂' }, { t: '4 + 4 + 2 = 10 H⁺' }],
      steps: 8,
      src: 'Lecture slides 7, 8, 10, 13 · stylised 3D, not to scale',
      notes: [
        'Live, stylised model of the inner membrane: intermembrane space on top, matrix below. Electrons are blue pairs (2e⁻), protons orange, ATP gold.',
        'Builds 1–7 fly to each component: Complex I (NADH → NAD⁺, FMN, Fe-S, 4 H⁺) → CoQ (mobile, in the membrane) → Complex II (FADH₂ → FAD, 0 H⁺) → Complex III (4 H⁺) → cytochrome c (mobile, IMS face) → Complex IV (½O₂ + 2H⁺ → H₂O, 2 H⁺) → ATP synthase (H⁺ back through F₀ turns the rotor; F₁ makes ATP).',
        'Build 8: back to the wide view — now use the controls. Switch NADH ↔ FADH₂ and watch the counters: about 10 H⁺ and 2.5 ATP per NADH, 6 H⁺ and 1.5 ATP per FADH₂.',
        'Try an inhibitor or the uncoupler. Hover any label or control for detail.',
      ],
      visual: (el) => etcScene(el, 'tour'),
    },
    {
      eyebrow: 'L.10.3 · Peter Mitchell',
      title: 'Chemiosmotic <em>theory</em>',
      bullets: [
        { t: 'Complexes <b>pump H⁺</b> outward', tip: { title: 'Proton pumping', body: 'Complex I: 4 H⁺ · Complex III: 4 H⁺ · Complex IV: 2 H⁺ · Complex II: none. From matrix to intermembrane space.', src: SRC(10) } },
        { t: 'Outside: <b>↓pH</b>, positive' },
        { t: 'Matrix: <b>↑pH</b>, negative' },
        { t: '<b>Proton-motive force</b> → ATP synthase', tip: { title: 'Proton-motive force', body: 'H⁺ flow back into the matrix through the F₀ channel of ATP synthase; F₁ makes ATP.', src: 'Lecture slides 10, 13, 17' } },
      ],
      steps: 4,
      focus: true,
      src: 'Lecture slides 9–10, 17',
      notes: [
        'Peter Mitchell’s chemiosmotic theory explains how electron transport is coupled to ATP synthesis (slide 9). Background only (not on the slides): Mitchell received the 1978 Nobel Prize in Chemistry for it.',
        'Build 1: complexes I, III, IV pump protons into the intermembrane space (4, 4, 2).',
        'Build 2: that separates charge — intermembrane space positive, matrix negative (slide 10’s “electrical gradient”).',
        'Build 3: and a pH gradient — intermembrane space acidic (↓pH), matrix alkaline (↑pH).',
        'Build 4: both together = proton-motive force; H⁺ re-enter through F₀ and F₁ makes ATP.',
      ],
      visual: chemiosmoticViz,
    },
    {
      eyebrow: 'Energy yield',
      title: '<em>4 H⁺</em> buy one ATP',
      bullets: [
        { t: 'NADH: 10 H⁺ → <b>2.5 ATP</b>', tip: 'Complex I (4 H⁺ = 1 ATP) + Complex III (4 H⁺ = 1 ATP) + Complex IV (2 H⁺ = ½ ATP).' },
        { t: 'FADH₂: 6 H⁺ → <b>1.5 ATP</b>', tip: 'Enters at Complex II (no H⁺), so only Complex III (1 ATP) + Complex IV (½ ATP).' },
        { t: 'Older values: <b>3</b> and <b>2</b>', tip: { kicker: 'Slide 11 footnote', title: 'Older concept', body: '“Lippincott’s Biochemistry states that NADH+H⁺ yields 3 ATP and FADH₂ yields 2 ATP. This is older concept.” Use 2.5 / 1.5 in this course.', src: SRC(11) } },
      ],
      src: 'Lecture slide 11 · H⁺ totals derived from slide 10',
      notes: [
        'The course rule from slide 11: 4 H⁺ = 1 ATP.',
        'NADH + H⁺: 4 (I) + 4 (III) + 2 (IV) = 10 H⁺ → 2.5 ATP. FADH₂: 4 (III) + 2 (IV) = 6 H⁺ → 1.5 ATP.',
        'Toggle “Older concept” to show 3 and 2 — the slide calls these the older values (attributed to Lippincott).',
        'Use the sliders to total any mix of NADH and FADH₂.',
        'Lippincott nuance (not for the exam): ~3 H⁺ pass through ATP synthase plus ~1 H⁺ for transport per ATP — hence “4”.',
      ],
      visual: yieldViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Critical thinking',
      title: 'Why does FADH₂ make <em>less</em> ATP?',
      subtitle: 'It enters at Complex II — skipping Complex I — and Complex II pumps no H⁺.',
      subtitleStep: 1,
      steps: 1,
      src: 'Lecture slides 10–11',
      notes: 'Ask the room first. Press → to reveal: FADH₂ bypasses Complex I and Complex II pumps nothing, so only III (4) and IV (2) pump → 6 H⁺ → 1.5 ATP, versus 10 H⁺ → 2.5 ATP for NADH.',
      visual: fadhStatViz,
    },
    {
      eyebrow: 'Complex V',
      title: 'ATP <em>synthase</em>',
      bullets: [
        { t: '<b>F₁F₀-ATPase</b> · multisubunit enzyme', tip: { title: 'ATP synthase [F₁F₀-ATPase] [complex V]', body: 'It is a multisubunit enzyme.', src: SRC(13) } },
        { t: '<b>F₀</b> in membrane · H⁺ channel', tip: { title: 'F₀', body: 'Membrane domain. Contains the H⁺ channel and the “C” rings. In the inner mitochondrial membrane.', src: SRC(13) } },
        { t: '<b>F₁</b> in matrix · α β γ δ ε', tip: { title: 'F₁', body: 'Extra-membranous domain in the mitochondrial matrix. Contains α, β, γ, δ, ε subunits.', src: SRC(13) } },
        { t: 'F₁ holds the <b>catalytic</b> activity', tip: { title: 'Catalysis', body: 'F₁ in the mitochondrial matrix contains the catalytic activity: ADP + Pᵢ → ATP.' + LIPP('rotation of γ drives the β subunits through binding changes — not on the slides.'), src: SRC(13) } },
      ],
      steps: 2,
      src: 'Lecture slide 13 · stylised 3D after the slide figure; matrix shown below (flipped vs slide 13)',
      notes: [
        'ATP synthase = complex V = F₁F₀-ATPase. Here the intermembrane space is on top and the matrix below, matching the ETC model (slide 13’s figure is drawn upside-down relative to slide 10).',
        'Build 1 — F₀: c-ring in the membrane, subunit a beside it carrying the H⁺ path, b₂ peripheral stalk.',
        'Build 2 — F₁: α₃β₃ head (alternating), γ central stalk with ε at its base, δ cap where b₂ attaches.',
        'H⁺ flowing down through F₀ turns the c-ring and γ; ATP leaves from the β subunits (gold).',
      ],
      visual: (el) => synthaseScene(el),
    },
    {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'L.10.4 · Three classes',
      title: 'Three ways to <em>disrupt</em> it',
      cards: [
        { k: 'Class 1', title: 'ETC inhibitors', body: 'Block a complex · site-specific', list: ['rotenone · antimycin A · cyanide'], viz: (v) => classMini(v, 'etc'), tip: { title: 'Inhibitors of the ETC proper', body: 'Site-specific: Complex I (rotenone, amobarbital, piericidin), Complex III (antimycin A, dimercaprol/BAL), Complex IV (cyanide, CO, H₂S).', src: SRC('14–15') } },
        { k: 'Class 2', title: 'ATP synthase inhibitor', body: 'Blocks the F₀ H⁺ channel', list: ['oligomycin'], viz: (v) => classMini(v, 'oligo'), tip: { title: 'Inhibitors of oxidative phosphorylation', body: 'Oligomycin binds F₀ and prevents H⁺ re-entry into the matrix.', src: SRC('14, 16') } },
        { k: 'Class 3', title: 'Uncouplers', body: 'H⁺ leak · flow continues', list: ['2,4-DNP · dicoumarol · salicylate'], viz: (v) => classMini(v, 'unc'), tip: { kicker: 'Note on wording', title: 'Uncouplers', body: 'Slide 14 lists them under “Inhibitors of ETC”, but uncouplers do <b>not</b> stop electron transport — they stop its <b>coupling</b> to ATP synthesis (slide 17).', src: SRC('14, 17') } },
      ],
      src: 'Lecture slide 14',
      notes: [
        'Slide 14 classification: (1) inhibitors of the ETC proper, (2) inhibitors of oxidative phosphorylation (F₀F₁-ATPase), (3) uncouplers.',
        'Careful with the wording: uncouplers are grouped under “inhibitors” on the slide, but they do not stop electron flow — they disconnect it from ATP synthesis.',
      ],
    },
    {
      eyebrow: 'L.10.4 · Site-specific inhibitors',
      title: 'Block the <em>relay</em>',
      bullets: [
        { t: '<b>Complex I</b> blockers', sub: 'rotenone · amobarbital · piericidin', tip: { title: 'Complex I inhibitors', body: 'Rotenone, amobarbital, piericidin.' + LIPP('electrons from FADH₂ still enter via Complex II → CoQ.'), src: SRC(15) } },
        { t: '<b>Complex III</b> blockers', sub: 'antimycin A · dimercaprol (BAL)', tip: { title: 'Complex III inhibitors', body: 'Antimycin A and dimercaprol. The slide also lists “BAL” — British anti-Lewisite is dimercaprol, i.e. the same drug.', src: SRC(15) } },
        { t: '<b>Complex IV</b> blockers', sub: 'cyanide · CO · H₂S', tip: { title: 'Complex IV inhibitors', body: 'Cyanide, carbon monoxide, hydrogen sulphide — block cyt aa₃ → O₂.', src: SRC(15) } },
      ],
      steps: 3,
      focus: true,
      src: 'Lecture slide 15 · Complex I bar placed per textbook (see tip)',
      notes: [
        'Build 1 — Complex I: rotenone, amobarbital, piericidin. The slide figure draws the bar between FMN and Fe-S; many texts put it at Fe-S → CoQ. Exam answer: “Complex I”. Electrons from FADH₂ (Complex II → CoQ) still get through (Lippincott).',
        'Build 2 — Complex III: antimycin A and dimercaprol (= BAL; one drug, two names). Block between cyt b and cyt c₁.',
        'Build 3 — Complex IV: cyanide, CO, H₂S. Block cyt aa₃ → O₂.',
        'Downstream of any block, carriers stay oxidised and electron flow, pumping and ATP synthesis stop (Lippincott).',
      ],
      visual: inhibitorsViz,
    },
    {
      eyebrow: 'L.10.4 · ATP synthase inhibitor',
      title: '<em>Oligomycin</em> jams F₀',
      bullets: [
        { t: 'Binds the <b>F₀</b> domain', tip: { title: 'Oligomycin', body: '“Oligomycin binds to the F₀ domain of ATP synthase and prevents re-entry of H⁺ into the mitochondrial matrix.”', src: SRC(16) } },
        { t: 'H⁺ cannot re-enter the matrix' },
        { t: '<b>ATP synthesis stops</b>', tip: { title: 'Consequence', body: '“So oligomycin inhibits ATP synthase thereby inhibits phosphorylation.”' + LIPP('the gradient then builds until pumping — and electron flow / O₂ use — also stall.'), src: SRC(16) } },
      ],
      steps: 1,
      src: 'Lecture slide 16 · stylised 3D',
      notes: [
        'Press → (or the toggle) to add oligomycin. A red plug sits on F₀.',
        'The rotor slows to a stop, ATP release stops, and protons pile up in the intermembrane space.',
        'Lippincott (beyond the slides): with the gradient maxed out, the pumps cannot push more H⁺, so electron transport and O₂ consumption also stop — that is why oligomycin indirectly halts the ETC.',
      ],
      visual: oligoViz,
    },
    {
      eyebrow: 'L.10.4 · Uncouplers',
      title: 'Burn, don’t <em>build</em>',
      bullets: [
        { t: 'e⁻ still flow to O₂', tip: { title: 'Electron flow', body: '“Uncouplers allow transfer of electrons through ETC without synthesis of ATP or phosphorylation.”', src: SRC(17) } },
        { t: 'Membrane <b>leaks H⁺</b>', tip: { title: 'Mechanism', body: 'They make the inner mitochondrial membrane abnormally permeable to protons, so H⁺ leak back to the matrix.', src: SRC(17) } },
        { t: 'Gradient lost → little ATP', tip: { kicker: 'Accuracy note', title: '“No proton motive force … NO ATP”', body: 'Slide 17 wording. More precisely the gradient is dissipated, so little or no ATP comes from oxidative phosphorylation; substrate-level ATP (glycolysis, TCA) continues.', src: SRC(17) } },
        { t: 'Energy released as <b>heat</b>', tip: { title: 'Thermogenesis', body: 'Proton leak generates heat.' + LIPP('UCP1 (thermogenin) in brown fat keeps newborns warm; salicylate overdose causes hyperthermia.'), src: SRC('17–18') } },
      ],
      steps: 1,
      src: 'Lecture slides 17–18',
      notes: [
        'Press → or flip the toggle. Choose the agent: 2,4-DNP, dicoumarol (slide spells it “Dicuomarol”), salicylate — chemical uncouplers — or an uncoupling protein, which forms a channel (slide 18 figure).',
        'Electrons keep flowing to O₂ (Lippincott: faster, with more O₂ consumed), but protons return through the leak instead of ATP synthase → gradient dissipated → little/no oxidative ATP → energy released as heat (thermogenesis).',
        'Slide 17 says “no proton motive force … NO ATP”: true for OxPhos ATP at high dose; substrate-level ATP continues.',
      ],
      visual: uncouplerViz,
    },
    {
      layout: 'cards',
      class: 'cards-3',
      eyebrow: 'Compare',
      title: 'Inhibitor vs <em>uncoupler</em>',
      cards: [
        { k: 'e.g. cyanide', title: 'ETC inhibitor', viz: (v) => compareMini(v, [[0, '<b style="color:var(--inh)">stops</b>'], [0.05, 'not made'], [0, '<b style="color:var(--inh)">stops</b>'], [0.04, '—']], 'Electrons stop → <b>everything</b> stops'), tip: { title: 'Site-specific ETC inhibitor', body: 'Electron transport stops at the blocked complex, so pumping and ATP synthesis stop.', src: SRC(15) + ' · Lippincott' } },
        { k: 'e.g. oligomycin', title: 'ATP synthase inhibitor', viz: (v) => compareMini(v, [[0.1, 'slows → stops*'], [1, 'maximal*'], [0, '<b style="color:var(--inh)">stops</b>'], [0.04, '—']], 'H⁺ trapped outside → <b>ATP</b> stops first'), tip: { title: 'Oligomycin', body: 'ATP synthesis stops (slide 16).' + LIPP('gradient builds to its maximum, then electron flow stalls.'), src: SRC(16) } },
        { k: 'e.g. 2,4-DNP', title: 'Uncoupler', viz: (v) => compareMini(v, [[1, 'continues'], [0.08, 'lost'], [0.06, 'little / none'], [1, '<b style="color:var(--inh)">↑ heat</b>']], 'Electrons race on → energy lost as <b>heat</b>'), tip: { title: 'Uncouplers', body: 'Electrons flow, gradient lost, little/no OxPhos ATP, heat (thermogenesis).', src: SRC('17–18') } },
      ],
      src: 'Lecture slides 15–18 · * Lippincott (not stated on the slides)',
      notes: [
        'The single most examined contrast. Inhibitor: electron flow stops → no gradient → no ATP.',
        'Oligomycin: ATP stops first; the gradient climbs to maximum and then electron flow stalls (Lippincott).',
        'Uncoupler: electron flow continues (Lippincott: even faster, with more O₂ used), gradient dissipated, little/no OxPhos ATP, energy lost as heat.',
        'Starred entries and O₂-consumption effects are textbook extensions, not on the slides.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Revision · predict, then press →',
      title: 'Break the <em>chain</em>',
      bullets: [{ t: 'Predict each outcome first' }, { t: 'Watch the meters' }],
      steps: 6,
      src: 'Lecture slides 15–18 · FADH₂ bypass & stalls: Lippincott',
      notes: [
        'Ask the audience to predict before every build; meters top-right show electron flow, H⁺ gradient, ATP synthesis and heat.',
        '1 · Rotenone (Complex I) with NADH → electrons stop; ATP fades as the existing gradient runs down.',
        '2 · Same rotenone but feed FADH₂ → electrons bypass Complex I via Complex II → flow resumes, ~6 H⁺ per FADH₂ (Lippincott).',
        '3 · Antimycin A (Complex III) → all flow stops.  4 · Cyanide (Complex IV) → O₂ cannot be reduced; everything stops.',
        '5 · Oligomycin (F₀) → no ATP; gradient climbs to maximum and electron flow stalls (Lippincott).',
        '6 · 2,4-DNP uncoupler → protons leak, electrons race, little ATP, heat.',
      ],
      visual: (el) => etcScene(el, 'sandbox'),
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      class: 'cards-2x2',
      cards: [
        { big: '10 · 6', title: 'H⁺ pumped', body: 'per NADH · per FADH₂ — I 4 · III 4 · IV 2 · II 0', tip: { title: 'Proton pumping', body: 'Complex I 4, III 4, IV 2, II none.', src: SRC(10) } },
        { big: '2.5 · 1.5', title: 'ATP', body: 'per NADH · per FADH₂ at 4 H⁺ per ATP (older: 3 · 2)', tip: { title: 'ATP yield', body: '4 H⁺ = 1 ATP. NADH 2.5, FADH₂ 1.5. Older concept 3 and 2.', src: SRC(11) } },
        { big: '4 + 2', title: 'components', body: 'Complexes I–IV + mobile CoQ & cytochrome c', tip: { title: 'ETC components', body: 'I NADH DH (FMN, Fe-S) · II succinate DH (FAD, Fe-S) · III cyt bc₁ (b, c₁, Fe-S) · IV cyt c oxidase (a, a₃, CuA, CuB) · mobile: CoQ, cyt c.', src: SRC(8) } },
        { big: '3', title: 'classes of agents', body: 'ETC inhibitors · oligomycin · uncouplers', tip: { title: 'Agents', body: 'Site-specific ETC inhibitors; ATP synthase inhibitor (oligomycin, F₀); uncouplers (2,4-DNP, dicoumarol, salicylate, UCPs).', src: SRC('14–18') } },
      ],
      notes: 'Recap the four numbers, then open the question bank.',
    },
  ],
};
