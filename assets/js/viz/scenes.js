// Reusable 3D scenes shared by several lectures.
import { createScene, THREE, glossy, glowSprite, kitController, ease } from './three-kit.js';
import { molecule, loadMol, buildMolecule } from './molecule.js';
import { h } from '../core/util.js';

/* ------------------------------------------------------------------ */
/* Single rotating molecule with optional HTML labels on atoms.        */
/* ------------------------------------------------------------------ */
export async function moleculeScene(host, key, o = {}) {
  const kit = createScene(host, { cam: [0, 0, 18], autoRotate: o.autoRotate ?? 1.1, ...o.scene });
  const data = await loadMol(key);
  const mol = buildMolecule(data, o.mol || {});
  kit.root.add(mol);
  if (o.tilt) mol.rotation.set(...o.tilt);
  kit.fit(mol, o.fill ?? 0.8);
  (o.labels || []).forEach((l) => {
    const p = mol.userData.pos[l.atom];
    kit.label(l.text, [p.x + (l.dx || 0), p.y + (l.dy || 0.9), p.z], { cls: l.cls || 'sm', parent: mol, tip: l.tip });
  });
  let swapping = null;
  const api = kitController(kit, o);
  api.kit = kit;
  api.mol = mol;
  /** Cross-fade to another molecule. */
  api.swap = async (nextKey, mo = {}) => {
    const token = {};
    swapping = token;
    const d2 = await loadMol(nextKey);
    if (swapping !== token) return;
    const next = buildMolecule(d2, { ...(o.mol || {}), ...mo });
    // drop any molecules still animating from earlier rapid swaps
    kit.root.children.filter((c) => c !== api.mol && c.userData?.data).forEach((c) => { window.gsap.killTweensOf(c.scale); kit.root.remove(c); });
    const old = api.mol;
    window.gsap.killTweensOf(old.scale);
    const box = new THREE.Box3().setFromObject(next);
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    next.scale.setScalar(0.001);
    kit.root.add(next);
    api.mol = next;
    const g = window.gsap;
    g.to(old.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', onComplete: () => { kit.root.remove(old); old.traverse((c) => c.geometry?.dispose?.()); } });
    g.to(next.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: 0.25, ease: 'back.out(1.6)' });
    // keep framing stable-ish
    const want = r / Math.sin(THREE.MathUtils.degToRad(kit.camera.fov) / 2) / (o.fill ?? 0.8);
    const dir = kit.camera.position.clone().sub(kit.controls.target).normalize();
    g.to(kit.camera.position, { x: dir.x * want, y: dir.y * want, z: dir.z * want, duration: 0.8, ease: 'power2.inOut' });
    kit.controls.target.set(0, 0, 0);
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Red blood cell: biconcave disc (Evans–Fung) ↔ spiculated echinocyte */
/* ------------------------------------------------------------------ */
export function rbcMesh({ radius = 3.9, color = 0xb3121f } = {}) {
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const base = geo.attributes.position.array.slice();
  const N = base.length / 3;
  const disc = new Float32Array(base.length);
  const echino = new Float32Array(base.length);
  const R = radius;
  const C0 = 0.207, C1 = 2.003, C2 = -1.123;
  // spike directions (Fibonacci sphere)
  const spikes = [];
  const S = 46;
  for (let i = 0; i < S; i++) {
    const y = 1 - (i / (S - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    spikes.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
  }
  const d = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    d.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).normalize();
    // disc
    const rr = Math.sqrt(d.x * d.x + d.z * d.z); // 0..1
    const x2 = rr * rr;
    const half = 0.5 * R * Math.sqrt(Math.max(0, 1 - x2)) * (C0 + C1 * x2 + C2 * x2 * x2);
    disc[i * 3] = d.x * R; disc[i * 3 + 2] = d.z * R;
    disc[i * 3 + 1] = Math.sign(d.y || 1) * half;
    // echinocyte: shrunken oblate sphere + spicules
    let sp = 0;
    for (const s of spikes) { const c = d.dot(s); if (c > 0.955) sp += Math.pow((c - 0.955) / 0.045, 2.2); }
    const rad = R * 0.66 * (1 + 0.42 * Math.min(1, sp));
    echino[i * 3] = d.x * rad; echino[i * 3 + 1] = d.y * rad * 0.82; echino[i * 3 + 2] = d.z * rad;
  }
  geo.attributes.position.array.set(disc);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color(0xff5a5a), emissive: 0x1a0002 });
  const mesh = new THREE.Mesh(geo, mat);
  let cur = 0;
  mesh.userData.morph = (t) => {
    if (Math.abs(t - cur) < 1e-4) return;
    cur = t;
    const arr = geo.attributes.position.array;
    const k = ease.inOut(Math.max(0, Math.min(1, t)));
    for (let i = 0; i < arr.length; i++) arr[i] = disc[i] + (echino[i] - disc[i]) * k;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return mesh;
}

export function rbcScene(host, o = {}) {
  const kit = createScene(host, { cam: [0, 6, 19], autoRotate: o.autoRotate ?? 0.9, exposure: 0.9, ...o.scene });
  const cell = rbcMesh(o);
  cell.rotation.x = 0.35;
  kit.root.add(cell);
  if (o.count > 1) {
    for (let i = 1; i < o.count; i++) {
      const c = rbcMesh(o);
      const a = (i / (o.count - 1)) * Math.PI * 2;
      c.position.set(Math.cos(a) * 8.5, Math.sin(a) * 3.4, -14 - (i % 3) * 3);
      c.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      c.scale.setScalar(0.62);
      kit.root.add(c);
      kit.onFrame((dt) => { c.rotation.y += dt * 0.2; c.rotation.x += dt * 0.07; });
    }
  }
  kit.onFrame((dt) => { cell.rotation.z += dt * 0.12; });
  const api = kitController(kit, o);
  api.kit = kit;
  api.cell = cell;
  api.morph = (to, dur = 1.6) => {
    const st = { t: cell.userData._t ?? 0 };
    window.gsap.to(st, { t: to, duration: dur, ease: 'power2.inOut', onUpdate: () => { cell.userData._t = st.t; cell.userData.morph(st.t); } });
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Eukaryotic cell cut-away: membrane, nucleus, mitochondria, flows.  */
/* ------------------------------------------------------------------ */
export function cellScene(host, o = {}) {
  const kit = createScene(host, { cam: [0, 4.5, 27], autoRotate: o.autoRotate ?? 0.35, ...o.scene });
  const g = new THREE.Group();
  kit.root.add(g);
  // membrane (fresnel-ish double shell)
  const mem = new THREE.Mesh(new THREE.SphereGeometry(6, 96, 64), new THREE.MeshPhysicalMaterial({ color: 0x9fd4ff, roughness: 0.2, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 }));
  const rim = new THREE.Mesh(new THREE.SphereGeometry(6.06, 96, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(o.rim ?? 0x64d2ff) } },
    vertexShader: 'varying float f; void main(){ vec3 n=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); f=pow(1.-abs(dot(n,normalize(-mv.xyz))),2.2); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; varying float f; void main(){ gl_FragColor=vec4(c, f*0.9); }',
  }));
  g.add(mem, rim);
  // nucleus
  const nuc = new THREE.Mesh(new THREE.SphereGeometry(1.7, 64, 48), glossy(0x7d5cff, { transparent: true, opacity: 0.85 }));
  nuc.position.set(-1.6, 0.6, -1.2);
  g.add(nuc);
  // mitochondria
  const mitos = [];
  const mitoMat = glossy(0xff9f0a, { emissive: 0x3a1a00 });
  [[2.6, -1.4, 1.2, 0.6], [1.8, 2.4, -1.8, -0.9], [-2.6, -2.6, 1.6, 1.2], [3.2, 1.2, -2.6, 0.3]].forEach(([x, y, z, r]) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.5, 12, 28), mitoMat);
    m.position.set(x, y, z);
    m.rotation.set(r, r * 1.7, r * 0.6);
    g.add(m);
    mitos.push(m);
  });
  // ER-ish ribbons
  // ribosome-like specks scattered in the cytosol
  const speckGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const speckMat = glossy(0x9e9eff, { transparent: true, opacity: 0.55 });
  for (let i = 0; i < 160; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2.2 + Math.random() * 3.4);
    const m = new THREE.Mesh(speckGeo, speckMat); m.position.copy(v); g.add(m);
  }

  // glucose → 2 pyruvate particle system
  const parts = [];
  const gl = o.glucoseColor ?? 0x64d2ff, py = o.pyruvateColor ?? 0xff9f0a;
  function spawn() {
    const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * 1.2;
    const start = new THREE.Vector3(Math.cos(a) * 9, b * 4, Math.sin(a) * 9);
    const mid = new THREE.Vector3(Math.cos(a) * 3.2, b * 1.5, Math.sin(a) * 3.2);
    const s = glowSprite(gl, 1.25);
    s.position.copy(start);
    g.add(s);
    parts.push({ s, start, mid, t: 0, phase: 0 });
  }
  let acc = 0;
  kit.onFrame((dt) => {
    if (!api.flowOn) return;
    acc += dt;
    if (acc > 0.35) { acc = 0; spawn(); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt * 0.45;
      if (p.phase === 0) {
        p.s.position.lerpVectors(p.start, p.mid, ease.out(Math.min(1, p.t)));
        if (p.t >= 1) {
          // split into two pyruvate heading to a mitochondrion
          p.phase = 1; p.t = 0;
          const m = mitos[Math.floor(Math.random() * mitos.length)];
          p.target = m.position.clone();
          p.s.material.color.set(py); p.s.scale.setScalar(0.95);
          const twin = glowSprite(py, 0.95);
          twin.position.copy(p.s.position);
          g.add(twin);
          parts.push({ s: twin, start: p.mid.clone(), mid: p.mid, t: 0, phase: 1, target: m.position.clone().add(new THREE.Vector3(0.3, 0.2, 0)) });
          p.start = p.mid.clone();
        }
      } else {
        p.s.position.lerpVectors(p.start, p.target, ease.inOut(Math.min(1, p.t)));
        p.s.material.opacity = 1 - Math.max(0, p.t - 0.8) * 5;
        if (p.t >= 1) { g.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); }
      }
    }
  });
  kit.onFrame((dt) => { mitos.forEach((m, i) => { m.rotation.y += dt * 0.2 * (i % 2 ? 1 : -1); }); });

  const api = kitController(kit, o);
  api.kit = kit; api.group = g; api.mitos = mitos; api.nucleus = nuc; api.membrane = mem;
  api.flowOn = o.flow !== false;
  return api;
}
