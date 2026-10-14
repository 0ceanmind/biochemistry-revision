// PDH complex & TCA cycle (L.12 – L.13) — interactive revision deck.
import { h, s, setRich, countTo, icon } from '../core/util.js';
import { tip } from '../core/tip.js';
import { diagram, show } from '../viz/diagram.js';
import { seg, toggle, ctrlBar } from '../viz/controls.js';
import { createScene, THREE, glossy, glass, glowSprite, kitController } from '../viz/three-kit.js';
import { moleculeScene } from '../viz/scenes.js';

const gsap = window.gsap;

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */
const SRC = (p) => `Lecture slide ${p}`;
const LIP = 'Lippincott Ch 9';
const tint = (col, p = 12) => `color-mix(in oklab, ${col} ${p}%, transparent)`;
const CARBON = 'var(--c-carbon)';
const ACC = 'var(--a1)';
// Coenzyme colours (FAD/NAD follow the deck-wide FADH₂ / NADH colours)
const CO = { TPP: 'var(--o2)', LIP: 'var(--elec)', CoA: 'var(--prot)', FAD: 'var(--fadh)', NAD: 'var(--nadh)' };
const PROD = { NADH: 'var(--nadh)', CO2: 'var(--co2)', FADH2: 'var(--fadh)', GTP: 'var(--atp)', H2O: 'var(--elec)' };
const PRODTXT = { NADH: 'NADH', CO2: 'CO_{2}', FADH2: 'FADH_{2}', GTP: 'GTP', H2O: 'H_{2}O' };

/** Moves an SVG element by rewriting its transform (tween-friendly proxy). */
function mover(el, x = 0, y = 0, sc = 1) {
  const m = {
    x, y, s: sc, el,
    apply() { el.setAttribute('transform', `translate(${m.x} ${m.y}) scale(${m.s})`); },
    set(nx, ny, ns) { gsap.killTweensOf(m); m.x = nx; m.y = ny; if (ns !== undefined) m.s = ns; m.apply(); return m; },
    put(nx, ny) { m.x = nx; m.y = ny; m.apply(); return m; }, // no tween kill (safe inside timelines)
    to(nx, ny, o = {}) { return gsap.to(m, { x: nx, y: ny, s: o.s ?? m.s, duration: o.duration ?? 0.9, delay: o.delay ?? 0, ease: o.ease ?? 'power3.inOut', onUpdate: m.apply, onComplete: o.onComplete, overwrite: 'auto' }); },
  };
  m.apply();
  return m;
}

/** Carbon-bead capsule (each bead = one carbon). cols: array of bead colours. */
function beadToken(parent, cols, label, o = {}) {
  const g = s('g', { style: 'pointer-events:none' });
  const sp = 22, w = cols.length * sp + 22;
  g.append(s('rect', { x: -w / 2, y: -22, width: w, height: 44, rx: 22, style: 'fill:var(--bg-2);stroke:var(--line-2);stroke-width:2' }));
  const beads = cols.map((c, i) => { const b = s('circle', { cx: -w / 2 + 22 + i * sp, cy: 0, r: 8.5, style: `fill:${c}` }); g.append(b); return b; });
  let lbl = null;
  if (label) {
    lbl = s('text', { y: o.below ? 62 : -40, 'text-anchor': 'middle', class: 'v-label sm', style: `font-weight:640;fill:${o.labelColor || 'var(--fg)'}` });
    setRich(lbl, label);
    g.append(lbl);
  }
  parent.append(g);
  return { g, beads, lbl, w };
}

/** Product chip that pops at (x0,y0) and flies to (x1,y1). */
function flyBadge(D, x0, y0, x1, y1, key, delay = 0) {
  const b = D.badge(0, 0, PRODTXT[key], { color: PROD[key], size: 26 });
  b.style.opacity = 0;
  b.style.pointerEvents = 'none';
  const m = mover(b, x0, y0, 0.4);
  const tl = gsap.timeline({ delay, onComplete: () => b.remove() });
  tl.to(b, { opacity: 1, duration: 0.2 }, 0)
    .to(m, { s: 1.15, duration: 0.35, ease: 'back.out(2.2)', onUpdate: m.apply }, 0)
    .to(m, { x: x1, y: y1, s: 0.75, duration: 0.75, ease: 'power2.in', onUpdate: m.apply }, 0.6)
    .to(b, { opacity: 0, duration: 0.18 }, 1.2);
  return tl;
}

/** Clickable SVG chip used by the regulation panels. */
function svgChip(D, x, y, label, col, w = 230) {
  const g = s('g', { style: 'cursor:pointer' });
  const rect = s('rect', { x: x - w / 2, y: y - 30, width: w, height: 60, rx: 30, style: `fill:${tint(col, 10)};stroke:${tint(col, 50)};stroke-width:2;transition:all .3s` });
  const tx = s('text', { x, y: y + 9, 'text-anchor': 'middle', class: 'v-label', style: `fill:${col};font-weight:650;font-size:27px` });
  setRich(tx, label);
  g.append(rect, tx);
  D.layers.labels.append(g);
  const set = (on) => { rect.style.fill = tint(col, on ? 34 : 10); rect.style.strokeWidth = on ? 4 : 2; rect.style.stroke = on ? col : tint(col, 50); };
  return { g, rect, tx, set, w };
}

/** Opaque backing so lines passing behind a node don't show through its label. */
function solid(n) {
  const r = n.shape.cloneNode();
  r.removeAttribute('class');
  r.style.cssText = 'fill:var(--bg);stroke:none';
  n.g.insertBefore(r, n.shape);
  return n;
}

/** Simple organ glyphs (24×24 stroke icons). */
const GLYPH = {
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.2c-.8-1.6-3.6-2-4.9-.4-1.8-.1-3 1.6-2.5 3.2-1.5.8-1.6 3.1-.2 4 -.6 1.8.7 3.6 2.6 3.5.5 1.9 2.9 2.7 4.6 1.6.2 0 .4-.1.4-.1V5.2z"/><path d="M12 5.2c.8-1.6 3.6-2 4.9-.4 1.8-.1 3 1.6 2.5 3.2 1.5.8 1.6 3.1.2 4 .6 1.8-.7 3.6-2.6 3.5-.5 1.9-2.9 2.7-4.6 1.6"/><path d="M12 17v3.5M8.5 9.5c1 .2 1.8 1 2 2M15.5 9.5c-1 .2-1.8 1-2 2"/></svg>',
  kidney: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5c-3.6 0-6.5 3.7-6.5 8.5s2.9 8.5 6.5 8.5c2.5 0 4-1.9 4-4.3 0-1.6-.9-2.6-2-3.2a1.1 1.1 0 0 1 0-2c1.1-.6 2-1.6 2-3.2 0-2.4-1.5-4.3-4-4.3z"/><path d="M12.5 12H6.5v6.5"/></svg>',
  heart: icon('heart'),
  rbc: icon('rbc'),
};

/* ------------------------------------------------------------------ */
/* Slide visuals                                                       */
/* ------------------------------------------------------------------ */

// 1 · Hero: citric acid with its three carboxyl carbons glowing
async function heroViz(el) {
  const sc = await moleculeScene(el, 'citrate', {
    fill: 0.74, autoRotate: 1.25,
    mol: { hideH: false, highlight: { atoms: [10, 11, 12], color: 0x40c8e0 } },
  });
  el.append(h('div', { style: 'position:absolute;left:0;right:0;bottom:78px;text-align:center;font-size:27px;color:var(--fg-2);pointer-events:none', html: 'Citric acid · <span style="color:var(--ink);font-weight:650">3 carboxyl groups</span> → <b>tri</b>-carboxylic' }));
  return sc;
}

// 2 · SLOs in two parts
function sloViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '56px';
  el.style.alignContent = 'center';
  const parts = [
    { n: '1', name: 'The bridge', k: 'Part 1 · PDH complex', items: [
      ['L.12.1', 'PDH: role, site, tissues', 'Describe the role of the pyruvate dehydrogenase (PDH) complex, its reactants and products, its cellular localization, and its tissue distribution.'],
      ['L.12.2', 'PDH vs α-KG DH vs BCKD', 'Compare the general structure, regulation, and required cofactors/vitamins of the PDH complex with alpha-ketoglutarate dehydrogenase and the branched-chain alpha-keto acid dehydrogenase complexes.'],
      ['L.12.3', 'Severe thiamine deficiency', 'Describe the clinical manifestations of severe thiamin deficiency, and connect the symptoms to the biochemical role of thiamin in the PDH complex and TCA cycle.'],
      ['L.12.4', 'Thiamine before glucose — why?', 'Explain the rationale of administering thiamin along with glucose to patients with suspected hypoglycemia.'],
    ] },
    { n: '2', name: 'The inside', k: 'Part 2 · TCA cycle', items: [
      ['L.13.1', 'Steps, energetics, regulation', 'Discuss the steps, energetics and regulation of the TCA cycle.'],
      ['L.13.2', 'The hub of metabolism', 'Describe the central role of the TCA cycle in connecting glycolysis, gluconeogenesis, oxidative phosphorylation, fatty acid metabolism, and amino acid metabolism.'],
      ['L.13.3', 'Intermediates for biosynthesis', 'Describe the role of TCA cycle intermediates as sources of reactants for biosynthetic pathways.'],
    ] },
  ];
  const rows = [];
  parts.forEach((p) => {
    const col = h('div', { style: 'display:flex;flex-direction:column;gap:18px' });
    col.append(h('div', { style: 'display:flex;align-items:flex-end;gap:26px;margin-bottom:10px' }, [
      h('div.grad-text', { style: 'font:760 120px var(--font);letter-spacing:-.05em;line-height:.82', text: p.n }),
      h('div', {}, [
        h('div', { style: 'font-size:24px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:var(--ink)', text: p.k }),
        h('div', { style: 'font-size:48px;font-weight:680;letter-spacing:-.02em;line-height:1.1', text: p.name }),
      ]),
    ]));
    p.items.forEach(([code, title, full]) => {
      const r = h('div', { style: 'display:grid;grid-template-columns:150px 1fr;align-items:center;padding:24px 32px;border-radius:26px;background:var(--surface);border:1px solid var(--line)' }, [
        h('div', { style: 'font:600 25px var(--mono);color:var(--ink)', text: code }),
        h('div', { style: 'font-size:33px;font-weight:600;letter-spacing:-.01em', text: title }),
      ]);
      tip(r, { kicker: code, title, body: full, src: SRC(code.startsWith('L.12') ? 2 : 12) });
      col.append(r);
      rows.push(r);
    });
    el.append(col);
  });
  return { enter: () => gsap.fromTo(rows, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07, delay: 0.25 }) };
}

// 3 · The bridge: cytosol → carrier → PDH bridge → acetyl CoA → TCA
function bridgeViz(el) {
  const D = diagram(el, 1712, 720);
  const Y = 380;
  D.region({ x: 0, y: 20, w: 520, h: 680, r: 40, label: 'Cytosol', fill: tint('var(--o2)', 7), stroke: tint('var(--o2)', 30) });
  D.region({ x: 560, y: 20, w: 1152, h: 680, r: 40, label: 'Mitochondrial matrix', labelColor: 'var(--ink)', fill: tint(ACC, 6), stroke: tint(ACC, 40) });
  // carrier in the inner membrane
  const carrier = s('g', { 'data-tip': JSON.stringify({ title: 'Into the matrix', body: 'Pyruvate must <b>first enter the mitochondrial matrix</b> — via a specific carrier in the inner membrane (drawn as a channel on slide 14).', src: 'Lecture slides 3, 14 · Lippincott Ch 9' }) });
  carrier.append(s('rect', { x: 504, y: Y - 36, width: 72, height: 72, rx: 18, style: 'fill:var(--surface-3);stroke:var(--fg-3);stroke-width:2' }));
  carrier.append(s('rect', { x: 504, y: Y - 13, width: 72, height: 26, style: 'fill:var(--bg-2)' }));
  D.layers.nodes.append(carrier);
  D.text(540, Y + 74, 'Carrier', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  // glycolysis
  D.node({ id: 'glc', x: 260, y: 140, label: 'Glucose', sub: '6 carbons', kind: 'mol', color: 'var(--elec)', tip: { title: 'Glycolysis is cytosolic', body: 'Glucose → 2 pyruvate happens in the <b>cytosol</b> (slide 14 draws it there).<br><span style="color:var(--fg-3)">Slide 3’s wording places glycolysis enzymes in the matrix — that is a slip; only the PDH complex is mitochondrial.</span>', src: 'Lecture slides 3, 14' } });
  D.arrow({ from: [260, 196], to: [260, Y - 70], color: 'var(--fg-3)', width: 4, label: 'Glycolysis', labelSide: -1, labelOffset: 22, labelColor: 'var(--fg-2)' });
  // the bridge (PDH complex)
  const yArch = (x) => { const t = (x - 640) / 500; return (1 - t) * (1 - t) * 420 + 2 * (1 - t) * t * 170 + t * t * 420; };
  const bridge = s('g', { 'data-tip': JSON.stringify({ kicker: 'The bridge · slide 4', title: 'Pyruvate dehydrogenase complex', body: 'Links glycolysis (pyruvate) to the TCA cycle (acetyl CoA) by <b>oxidative decarboxylation</b>.', src: SRC('4–5') }) });
  for (let x = 700; x <= 1090; x += 65) bridge.append(s('line', { x1: x, y1: yArch(x), x2: x, y2: 420, style: `stroke:${ACC};stroke-width:3;opacity:.45` }));
  bridge.append(s('path', { d: 'M640,420 Q890,170 1140,420', style: `fill:none;stroke:${ACC};stroke-width:9;stroke-linecap:round` }));
  bridge.append(s('path', { d: 'M610,422 L1170,422', style: `fill:none;stroke:${ACC};stroke-width:11;stroke-linecap:round` }));
  bridge.append(s('rect', { x: 628, y: 428, width: 22, height: 58, rx: 6, style: `fill:${tint(ACC, 55)}` }));
  bridge.append(s('rect', { x: 1130, y: 428, width: 22, height: 58, rx: 6, style: `fill:${tint(ACC, 55)}` }));
  D.layers.edges.append(bridge);
  D.text(890, 478, 'Pyruvate dehydrogenase complex', { anchor: 'middle', style: 'font-size:28px;font-weight:680;fill:var(--ink)' });
  // TCA ring
  const RC = [1530, Y];
  D.layers.edges.append(s('circle', { cx: RC[0], cy: RC[1], r: 120, style: `fill:${tint(ACC, 8)};stroke:${tint(ACC, 30)};stroke-width:26` }));
  const spin = s('circle', { cx: RC[0], cy: RC[1], r: 120, style: `fill:none;stroke:${ACC};stroke-width:4;stroke-dasharray:18 22;opacity:.7` });
  D.layers.edges.append(spin);
  const ringPath = s('path', { d: `M${RC[0]},${RC[1] - 120} a120,120 0 1,1 -0.1,0`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(ringPath);
  D.text(RC[0], RC[1] + 4, 'TCA', { anchor: 'middle', style: 'font-size:44px;font-weight:720;fill:var(--fg)' });
  D.text(RC[0], RC[1] + 40, 'cycle', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  const entry = D.arrow({ from: [1330, Y], to: [1398, Y], color: ACC, width: 5 });
  // products
  const co2 = D.badge(1030, 196, 'CO_{2}', { color: 'var(--co2)', size: 28 });
  const nad = D.badge(800, 588, 'NAD^{+}', { color: 'var(--nadh)', size: 26 });
  const nadA = D.arrow({ from: [862, 588], to: [912, 588], color: 'var(--nadh)', width: 3, headSize: 12 });
  const nadh = D.badge(980, 588, 'NADH', { color: 'var(--nadh)', size: 28 });
  const prods = [co2, nad, nadA.g, nadh];
  prods.forEach((p) => (p.style.opacity = 0));
  // tokens
  const pyr = beadToken(D.layers.labels, [CARBON, CARBON, CARBON], 'Pyruvate · 3C');
  const ac = beadToken(D.layers.labels, [ACC, ACC], 'Acetyl CoA · 2C', { labelColor: 'var(--ink)' });
  const pyrM = mover(pyr.g, 260, Y), acM = mover(ac.g, 890, Y);
  ac.g.style.opacity = 0;
  const lone = s('circle', { r: 8.5, style: `fill:${CARBON};opacity:0` });
  D.layers.labels.append(lone);
  const loneM = mover(lone, 912, Y);
  // ambient flows (after the build)
  const flowPath = s('path', { d: `M260,${Y} L1398,${Y}`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(flowPath);
  const fMain = D.flow(flowPath, { count: 5, color: ACC, speed: 230, r: 8, autoplay: false });
  const fRing = D.flow(ringPath, { count: 6, color: ACC, speed: 160, r: 9, autoplay: false });
  fMain.hide(); fRing.hide();
  const spinT = gsap.to(spin, { attr: { 'stroke-dashoffset': -400 }, duration: 6, repeat: -1, ease: 'none', paused: true });

  let tl;
  function apply(n) {
    tl?.kill();
    tl = gsap.timeline();
    const P = (o) => ({ ...o, onUpdate: pyrM.apply });
    const A = (o) => ({ ...o, onUpdate: acM.apply });
    if (n === 0) {
      tl.to(pyrM, P({ x: 260, duration: 0.8, ease: 'power3.inOut' }), 0).to(pyr.g, { opacity: 1, duration: 0.3 }, 0);
      tl.to(ac.g, { opacity: 0, duration: 0.3 }, 0).to(prods, { opacity: 0, duration: 0.3 }, 0);
    } else if (n === 1) {
      tl.to(pyr.g, { opacity: 1, duration: 0.3 }, 0).to(ac.g, { opacity: 0, duration: 0.3 }, 0).to(prods, { opacity: 0, duration: 0.3 }, 0);
      tl.to(pyrM, P({ x: 540, duration: 0.8, ease: 'power2.in' }), 0).to(pyrM, P({ x: 690, duration: 0.7, ease: 'power2.out' }), 0.8);
    } else {
      // pyruvate drives onto the bridge, loses a carbon as CO2
      tl.to(pyrM, P({ x: 890, duration: n === 2 ? 0.9 : 0.3, ease: 'power2.inOut' }), 0);
      tl.set(loneM, { x: 912, y: Y, onComplete: loneM.apply }, n === 2 ? 0.9 : 0.3);
      if (n === 2) {
        tl.set(lone, { opacity: 1 }, 0.9).to(loneM, { x: 1030, y: 196, duration: 0.7, ease: 'power2.out', onUpdate: loneM.apply }, 0.95).to(lone, { opacity: 0, duration: 0.2 }, 1.55);
      }
      tl.to(pyr.g, { opacity: 0, duration: 0.25 }, n === 2 ? 0.95 : 0.3);
      tl.set(acM, { x: 890, onComplete: acM.apply }, n === 2 ? 0.95 : 0.3);
      tl.to(ac.g, { opacity: 1, duration: 0.3 }, n === 2 ? 0.95 : 0.3);
      tl.to(prods, { opacity: 1, duration: 0.45, stagger: 0.1 }, n === 2 ? 1.2 : 0.3);
      if (n === 2) tl.to(acM, A({ x: 1250, duration: 0.9 }), 1.5);
      else tl.to(acM, A({ x: 1250, duration: 0.5 }), 0.4).to(acM, A({ x: 1470, s: 0.5, duration: 0.8, ease: 'power2.in' }), 0.95).to(ac.g, { opacity: 0, duration: 0.3 }, 1.5);
    }
    if (n >= 3) { fMain.play(); fRing.play(); spinT.play(); } else { fMain.hide(); fRing.hide(); spinT.pause(); }
    gsap.to(entry.g, { opacity: n >= 2 ? 1 : 0.3, duration: 0.4 });
  }
  return { step: apply, leave: () => { fMain.pause(); fRing.pause(); spinT.pause(); }, destroy: () => { spinT.kill(); tl?.kill(); D.destroy(); } };
}

// 4 · Procedural 3D PDH complex: E2 dodecahedral core, E1 and E3 around it
function pdhComplexViz(el) {
  const kit = createScene(el, { cam: [0, 5, 30], autoRotate: 0.55, fov: 30 });
  const g = new THREE.Group();
  kit.root.add(g);
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) raw.push([x, y, z]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) { raw.push([0, a / phi, b * phi]); raw.push([a / phi, b * phi, 0]); raw.push([a * phi, 0, b / phi]); }
  const R = 4;
  const V = raw.map((v) => new THREE.Vector3(...v).normalize().multiplyScalar(R));
  let dmin = Infinity;
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) dmin = Math.min(dmin, V[i].distanceTo(V[j]));
  const EDGES = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (V[i].distanceTo(V[j]) < dmin * 1.05) EDGES.push([i, j]);
  const FACES = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) FACES.push([0, a * phi, b], [a * phi, b, 0], [b, 0, a * phi]);

  const mat = {
    e2: glossy(0x40c8e0, { transparent: true, emissive: 0x0b3a44, emissiveIntensity: 0.6 }),
    link: glossy(0x2f9db2, { transparent: true }),
    e1: glossy(0xff9f0a, { transparent: true, emissive: 0x3a1f00, emissiveIntensity: 0.5 }),
    e3: glossy(0xbf5af2, { transparent: true, emissive: 0x2a0a3a, emissiveIntensity: 0.5 }),
    arm: glossy(0xffd60a, { transparent: true, emissive: 0x6a5200, emissiveIntensity: 0.8 }),
  };
  const ball = new THREE.SphereGeometry(1, 28, 20);
  const cluster = (center, n, r, spread, m) => {
    const grp = new THREE.Group();
    const nrm = center.clone().normalize();
    const t1 = new THREE.Vector3(0, 1, 0).cross(nrm);
    if (t1.lengthSq() < 1e-3) t1.set(1, 0, 0);
    t1.normalize();
    const t2 = nrm.clone().cross(t1).normalize();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.4;
      const p = center.clone().addScaledVector(t1, Math.cos(a) * spread).addScaledVector(t2, Math.sin(a) * spread);
      if (n === 4) p.addScaledVector(nrm, k % 2 ? 0.28 : -0.28);
      const mesh = new THREE.Mesh(ball, m);
      mesh.scale.setScalar(r);
      mesh.position.copy(p);
      grp.add(mesh);
    }
    g.add(grp);
    return grp;
  };
  // E2 core: 20 trimers on the vertices + linkers on the edges
  V.forEach((v) => cluster(v, 3, 0.56, 0.5, mat.e2));
  const cyl = new THREE.CylinderGeometry(0.17, 0.17, 1, 12, 1, true);
  EDGES.forEach(([i, j]) => {
    const m = new THREE.Mesh(cyl, mat.link);
    const a = V[i], b = V[j];
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, a.distanceTo(b), 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  });
  // E1 on the edges, E3 over the faces
  const e1Pos = EDGES.map(([i, j]) => V[i].clone().add(V[j]).normalize().multiplyScalar(R * 1.55));
  e1Pos.forEach((p) => cluster(p, 4, 0.4, 0.42, mat.e1));
  FACES.forEach((f) => cluster(new THREE.Vector3(...f).normalize().multiplyScalar(R * 1.72), 2, 0.52, 0.46, mat.e3));
  // lipoyl "swinging arms": gold beads oscillating between the core and nearby E1
  const arms = [];
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.55 });
  V.forEach((v, i) => {
    const target = e1Pos.reduce((b, p) => (p.distanceTo(v) < b.distanceTo(v) ? p : b), e1Pos[0]);
    const bead = new THREE.Mesh(ball, mat.arm);
    bead.scale.setScalar(0.2);
    g.add(bead);
    const geo = new THREE.BufferGeometry().setFromPoints([v, v]);
    const line = new THREE.Line(geo, lineMat);
    g.add(line);
    arms.push({ v, target, bead, geo, ph: i * 0.9, w: 1.4 + (i % 5) * 0.18 });
  });
  const halo = glowSprite(0x40c8e0, 9);
  halo.material.opacity = 0.35;
  g.add(halo);
  kit.onFrame((dt, t) => {
    arms.forEach((a) => {
      const k = 0.5 + 0.42 * Math.sin(t * a.w + a.ph);
      a.bead.position.lerpVectors(a.v, a.target, k);
      const arr = a.geo.attributes.position.array;
      arr[0] = a.v.x; arr[1] = a.v.y; arr[2] = a.v.z;
      arr[3] = a.bead.position.x; arr[4] = a.bead.position.y; arr[5] = a.bead.position.z;
      a.geo.attributes.position.needsUpdate = true;
    });
  });
  kit.fit(g, 1.0);

  // legend (screen space)
  const LEG = [
    { k: 'e1', t: 'E1 · decarboxylase', c: '#ff9f0a', tip: { kicker: 'E1 · coenzyme TPP', title: 'Pyruvate decarboxylase', body: 'Removes CO₂ from pyruvate using <b>thiamine pyrophosphate</b>. Site of PDH regulation by phosphorylation (Lippincott).', src: `${SRC(5)} · ${LIP}` } },
    { k: 'e2', t: 'E2 · transacetylase', c: '#40c8e0', tip: { kicker: 'E2 · lipoic acid, CoA', title: 'Dihydrolipoyl transacetylase', body: 'Forms the <b>core</b> of the complex. Its lipoamide arms (gold) carry the acetyl group and hand it to CoA.', src: `${SRC(5)} · ${LIP}` } },
    { k: 'e3', t: 'E3 · dehydrogenase', c: '#bf5af2', tip: { kicker: 'E3 · FAD, NAD⁺', title: 'Dihydrolipoyl dehydrogenase', body: 'Re-oxidises the lipoamide arm: FAD → FADH₂, then NAD⁺ → <b>NADH</b>.', src: `${SRC(5)} · ${LIP}` } },
  ];
  const legend = h('div', { style: 'position:absolute;left:0;right:0;top:0;display:flex;justify-content:center;gap:34px;z-index:3' });
  const legEls = LEG.map((l) => {
    const e = h('div', { style: 'display:flex;align-items:center;gap:12px;font-size:26px;font-weight:600;transition:opacity .4s' }, [h('i', { style: `width:20px;height:20px;border-radius:50%;background:${l.c};display:inline-block;box-shadow:0 0 14px ${l.c}` }), h('span', { text: l.t })]);
    tip(e, l.tip);
    legend.append(e);
    return e;
  });
  el.append(legend);
  const step = (n) => {
    const want = { e1: n === 0 || n === 1, e2: n === 0 || n === 2, e3: n === 0 || n === 3 };
    gsap.to(mat.e1, { opacity: want.e1 ? 1 : 0.1, duration: 0.6 });
    gsap.to(mat.e2, { opacity: want.e2 ? 1 : 0.1, duration: 0.6 });
    gsap.to(mat.link, { opacity: want.e2 ? 1 : 0.1, duration: 0.6 });
    gsap.to(mat.e3, { opacity: want.e3 ? 1 : 0.1, duration: 0.6 });
    gsap.to([mat.arm, lineMat], { opacity: n === 0 || n === 2 ? 1 : 0.15, duration: 0.6 });
    gsap.to(mat.e1, { emissiveIntensity: n === 1 ? 1.6 : 0.5, duration: 0.6 });
    gsap.to(mat.e2, { emissiveIntensity: n === 2 ? 1.6 : 0.6, duration: 0.6 });
    gsap.to(mat.e3, { emissiveIntensity: n === 3 ? 1.6 : 0.5, duration: 0.6 });
    legEls.forEach((e, i) => (e.style.opacity = n === 0 || n === i + 1 ? 1 : 0.35));
  };
  return kitController(kit, { step });
}

// 5 · Pyruvate → acetyl CoA (reaction tags as on slide 6) + tissue distribution
function reactionViz(el) {
  const D = diagram(el, 960, 540);
  D.svg.style.height = '540px';
  const Y = 270;
  D.node({ id: 'pyr', x: 100, y: Y, label: 'Pyruvate', kind: 'mol', size: 30 });
  D.node({ id: 'pdh', x: 455, y: Y, label: 'PDH complex', kind: 'box', w: 300, h: 84, size: 32, color: ACC, fill: tint(ACC, 12) });
  D.node({ id: 'ac', x: 858, y: Y, label: 'Acetyl CoA', kind: 'mol', size: 30, color: ACC });
  const beadsRow = (x, n, col, lbl) => {
    const g = s('g');
    for (let i = 0; i < n; i++) g.append(s('circle', { cx: x - ((n - 1) * 26) / 2 + i * 26, cy: Y - 82, r: 10, style: `fill:${col}` }));
    D.layers.labels.append(g);
    D.text(x, Y - 112, lbl, { anchor: 'middle', style: `font-size:26px;font-weight:700;fill:${col === ACC ? 'var(--ink)' : 'var(--fg-2)'}` });
  };
  beadsRow(100, 3, CARBON, '3C');
  beadsRow(858, 2, ACC, '2C');
  const tag = (x, y, t, col, tp) => D.badge(x, y, t, { color: col, size: 24, tip: tp });
  tag(372, Y - 78, 'TPP', CO.TPP, { title: 'Thiamine pyrophosphate', body: 'E1 coenzyme · from vitamin B₁.', src: SRC('5–6') });
  tag(508, Y - 78, 'Lipoic acid', CO.LIP, { title: 'Lipoic acid', body: 'E2 coenzyme (as lipoamide) · not a vitamin.', src: SRC('5–6') });
  tag(358, Y + 76, 'CoA', CO.CoA, { title: 'Coenzyme A', body: 'E2 · accepts the acetyl group · from vitamin B₅.', src: SRC('5–6') });
  tag(455, Y + 76, 'FAD', CO.FAD, { title: 'FAD', body: 'E3 · from vitamin B₂.', src: SRC('5–6') });
  tag(556, Y + 76, 'NAD^{+}', CO.NAD, { title: 'NAD⁺', body: 'E3 · reduced to NADH · from vitamin B₃.', src: SRC('5–6') });
  const a1 = D.arrow({ from: [190, Y], to: [300, Y], width: 4, color: 'var(--fg-3)' });
  const main = D.arrow({ from: [610, Y], to: [752, Y], width: 4, color: ACC });
  const up = D.arrow({ d: `M650,${Y} C672,${Y - 70} 690,${Y - 140} 712,${Y - 170}`, from: [650, Y], to: [712, Y - 170], color: 'var(--co2)', width: 4 });
  const dn = D.arrow({ d: `M650,${Y} C672,${Y + 70} 690,${Y + 140} 712,${Y + 170}`, from: [650, Y], to: [712, Y + 170], color: 'var(--nadh)', width: 4 });
  D.badge(745, Y - 200, 'CO_{2}', { color: 'var(--co2)', size: 30 });
  D.badge(750, Y + 200, 'NADH', { color: 'var(--nadh)', size: 30 });
  D.text(30, 40, 'OXIDATIVE DECARBOXYLATION', { cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--fg-3)' });
  [a1, main].forEach((a) => D.flow(a, { count: 2, color: ACC, speed: 120, r: 8 }));
  D.flow(up, { count: 1, color: 'var(--co2)', speed: 110, r: 8 });
  D.flow(dn, { count: 1, color: 'var(--nadh)', speed: 110, r: 8 });

  // tissue tiles
  const tiles = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:290px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px' });
  const T = [
    { g: 'brain', t: 'Brain', s: 'especially' },
    { g: 'heart', t: 'Heart', s: 'especially' },
    { g: 'kidney', t: 'Kidneys', s: 'especially' },
    { g: 'rbc', t: 'Red cells', s: 'no mitochondria → no PDH', bad: true },
  ];
  T.forEach((x) => {
    const c = x.bad ? 'var(--inh)' : 'var(--ink)';
    const tile = h('div', { style: `position:relative;border-radius:28px;padding:26px 24px;background:var(--surface);border:1px solid ${x.bad ? tint('var(--inh)', 40) : 'var(--line)'};display:flex;flex-direction:column;justify-content:flex-end;gap:8px;overflow:hidden` }, [
      h('div', { style: `width:70px;height:70px;color:${c};margin-bottom:auto`, html: GLYPH[x.g] }),
      h('div', { style: 'font-size:32px;font-weight:660;letter-spacing:-.01em', text: x.t }),
      h('div', { style: `font-size:22px;color:${x.bad ? 'var(--inh)' : 'var(--fg-2)'};line-height:1.25`, text: x.s }),
    ]);
    if (!x.bad) tile.append(h('div', { style: `position:absolute;inset:auto -30% -55% -30%;height:70%;background:radial-gradient(50% 60% at 50% 0%, ${tint(ACC, 30)}, transparent 70%);pointer-events:none` }));
    tip(tile, x.bad
      ? { title: 'Red blood cells', body: 'Mature RBCs have no mitochondria, so no PDH complex — pyruvate is reduced to lactate instead.', src: 'Lippincott Ch 8–9' }
      : { title: x.t, body: '“All mammalian tissues that contain mitochondria, especially kidneys, brain and heart; have PDH complex.”', src: SRC(6) });
    tiles.append(tile);
  });
  el.append(tiles);
  return { destroy: () => D.destroy() };
}

// 6 · cards mini-viz: which enzyme carries the coenzyme
function enzymeDots(v, which, col) {
  const D = diagram(v, 250, 112);
  v.style.minHeight = '112px';
  v.style.display = 'flex';
  v.style.alignItems = 'flex-end';
  D.layers.edges.append(s('path', { d: 'M45,56 L205,56', style: 'stroke:var(--line-2);stroke-width:3' }));
  const rings = [];
  ['E1', 'E2', 'E3'].forEach((e, i) => {
    const x = 45 + i * 80, on = which.includes(e);
    const c = s('circle', { cx: x, cy: 56, r: 30, style: `fill:${on ? tint(col, 26) : 'var(--bg-2)'};stroke:${on ? col : 'var(--line-2)'};stroke-width:${on ? 3 : 2}` });
    const t = s('text', { x, y: 64, 'text-anchor': 'middle', class: 'v-label', style: `font-size:23px;font-weight:700;fill:${on ? col : 'var(--fg-3)'}` });
    t.textContent = e;
    D.layers.nodes.append(c, t);
    if (on) rings.push(c);
  });
  const tw = gsap.to(rings, { attr: { r: 35 }, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  return { destroy: () => { tw.kill(); D.destroy(); } };
}

// 7 · The swinging lipoamide arm, E1 → E2 → E3
function armViz(el) {
  const D = diagram(el, 1712, 720);
  const E = {
    e1: { x: 300, y: 290, r: 150, col: 'var(--prot)', name: 'E1 · decarboxylase', ly: 110 },
    e2: { x: 856, y: 360, r: 160, col: ACC, name: 'E2 · transacetylase', ly: 564 },
    e3: { x: 1412, y: 290, r: 150, col: 'var(--fadh)', name: 'E3 · dehydrogenase', ly: 110 },
  };
  Object.values(E).forEach((e) => {
    D.layers.regions.append(s('circle', { cx: e.x, cy: e.y, r: e.r, style: `fill:${tint(e.col, 10)};stroke:${tint(e.col, 45)};stroke-width:3` }));
    D.layers.regions.append(s('circle', { cx: e.x, cy: e.y, r: e.r - 26, style: `fill:${tint(e.col, 6)};stroke:none` }));
    D.text(e.x, e.ly, e.name, { anchor: 'middle', style: `font-size:30px;font-weight:680;fill:${e.col}` });
  });
  // coenzyme chips
  const tpp = D.badge(300, 384, 'TPP', { color: CO.TPP, size: 26, tip: { title: 'TPP on E1', body: 'Decarboxylates pyruvate, holding the remaining 2C unit (hydroxyethyl-TPP).', src: LIP } });
  const coa = D.badge(856, 452, 'CoA', { color: CO.CoA, size: 26, tip: { title: 'CoA on E2', body: 'Receives the acetyl group from lipoamide → acetyl CoA.', src: LIP } });
  const fad = D.badge(1412, 262, 'FAD', { color: CO.FAD, size: 26 });
  const fadh = D.badge(1412, 262, 'FADH_{2}', { color: CO.FAD, size: 26 });
  const nad = D.badge(1412, 352, 'NAD^{+}', { color: CO.NAD, size: 26 });
  fadh.style.opacity = 0;
  // the arm
  const A = [856, 214];
  D.layers.nodes.append(s('circle', { cx: A[0], cy: A[1], r: 11, style: `fill:${ACC}` }));
  D.text(A[0] + 22, A[1] + 34, 'Lys', { cls: 'sm', style: 'font-size:22px;fill:var(--fg-3)' });
  const armPath = s('path', { style: `fill:none;stroke:${ACC};stroke-width:8;stroke-linecap:round` });
  D.layers.nodes.append(armPath);
  const head = s('g', { 'data-tip': JSON.stringify({ title: 'Lipoamide', body: 'Lipoic acid bound to a lysine of E2 — a long flexible arm that visits E1, E2 and E3 in turn, so intermediates never leave the complex.', src: LIP }) });
  const headRect = s('rect', { x: -66, y: -25, width: 132, height: 50, rx: 25, style: `fill:var(--bg);stroke:${ACC};stroke-width:3` });
  const headTx = s('text', { y: 9, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:700;fill:var(--ink)' });
  head.append(headRect, headTx);
  D.layers.labels.append(head);
  const SITES = {
    home: { tx: 856, ty: 70, c1: [856, 140], c2: [856, 100] },
    e1: { tx: 405, ty: 290, c1: [856, 40], c2: [430, 80] },
    e2: { tx: 856, ty: 360, c1: [980, 250], c2: [980, 360] },
    e3: { tx: 1300, ty: 290, c1: [856, 40], c2: [1280, 80] },
  };
  const arm = { tx: 856, ty: 70, c1x: 856, c1y: 140, c2x: 856, c2y: 100, carry: false };
  // tokens
  const pyr = beadToken(D.layers.labels, [CARBON, CARBON, CARBON], 'Pyruvate');
  const pyrM = mover(pyr.g, 90, 290);
  const he = beadToken(D.layers.labels, [ACC, ACC], '');
  const heM = mover(he.g, 300, 290);
  he.g.style.opacity = 0;
  const acoa = beadToken(D.layers.labels, [ACC, ACC], 'Acetyl CoA', { below: true, labelColor: 'var(--ink)' });
  const acM = mover(acoa.g, 856, 410);
  acoa.g.style.opacity = 0;
  const co2 = D.badge(120, 430, 'CO_{2}', { color: 'var(--co2)', size: 28 });
  const nadh = D.badge(1620, 500, 'NADH', { color: 'var(--nadh)', size: 30 });
  co2.style.opacity = 0; nadh.style.opacity = 0;
  const renderArm = () => {
    armPath.setAttribute('d', `M${A[0]},${A[1]} C${arm.c1x},${arm.c1y} ${arm.c2x},${arm.c2y} ${arm.tx},${arm.ty}`);
    head.setAttribute('transform', `translate(${arm.tx} ${arm.ty})`);
    if (arm.carry) heM.set(arm.tx + 112, arm.ty);
  };
  const setHead = (t) => { headTx.textContent = t; };
  const caption = D.text(856, 690, '', { anchor: 'middle', style: 'font-size:30px;font-weight:600;fill:var(--fg)' });
  const CAP = [
    'Lipoamide arm on E2 visits all three enzymes',
    'E1 + TPP: pyruvate loses CO₂',
    'The arm collects the acetyl group',
    'E2 hands acetyl to CoA → acetyl CoA',
    'E3 re-oxidises the arm: FAD → NAD⁺ → NADH',
  ];
  let tl;
  const swing = (site, dur = 0.9) => ({ tx: SITES[site].tx, ty: SITES[site].ty, c1x: SITES[site].c1[0], c1y: SITES[site].c1[1], c2x: SITES[site].c2[0], c2y: SITES[site].c2[1], duration: dur, ease: 'power2.inOut', onUpdate: renderArm });
  function apply(n) {
    tl?.kill();
    tl = gsap.timeline();
    caption.textContent = CAP[n];
    gsap.fromTo(caption, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    // defaults per state
    const vis = (e, on, at = 0) => tl.to(e, { opacity: on ? 1 : 0, duration: 0.4 }, at);
    if (n === 0) {
      arm.carry = false;
      tl.to(arm, swing('home', 0.7), 0);
      tl.to(pyrM, { x: 90, duration: 0.6, onUpdate: pyrM.apply }, 0);
      vis(pyr.g, true); vis(he.g, false); vis(acoa.g, false); vis(co2, false); vis(nadh, false); vis(fadh, false); vis(fad, true);
      setHead('S–S');
    } else if (n === 1) {
      arm.carry = false;
      tl.to(arm, swing('home', 0.6), 0);
      tl.to(pyrM, { x: 300, duration: 0.8, ease: 'power3.out', onUpdate: pyrM.apply }, 0);
      tl.call(() => heM.set(300, 290), null, 0.8);
      vis(pyr.g, true, 0); tl.to(pyr.g, { opacity: 0, duration: 0.3 }, 0.9); vis(he.g, true, 0.9);
      vis(co2, true, 1.0); vis(acoa.g, false); vis(nadh, false); vis(fadh, false); vis(fad, true);
      setHead('S–S');
    } else if (n === 2) {
      vis(pyr.g, false); vis(co2, true); vis(acoa.g, false); vis(nadh, false); vis(fadh, false); vis(fad, true); vis(he.g, true);
      arm.carry = false;
      tl.call(() => { arm.carry = false; heM.set(300, 290); setHead('S–S'); }, null, 0);
      tl.to(arm, swing('e1', 1.0), 0);
      tl.call(() => { arm.carry = true; setHead('S–acetyl'); renderArm(); }, null, 1.0);
      tl.to(arm, swing('e2', 1.1), 1.25);
    } else if (n === 3) {
      vis(pyr.g, false); vis(co2, true); vis(nadh, false); vis(fadh, false); vis(fad, true);
      tl.call(() => { arm.carry = true; setHead('S–acetyl'); }, null, 0);
      tl.to(arm, swing('e2', 0.5), 0);
      tl.call(() => { arm.carry = false; setHead('SH  SH'); acM.put(856, 410); }, null, 0.55);
      tl.to(he.g, { opacity: 0, duration: 0.3 }, 0.55);
      tl.to(acoa.g, { opacity: 1, duration: 0.3 }, 0.55);
      tl.to(acM, { x: 1100, y: 540, duration: 0.9, ease: 'power2.inOut', onUpdate: acM.apply }, 0.75);
    } else {
      vis(pyr.g, false); vis(co2, true); vis(he.g, false); vis(acoa.g, true);
      tl.call(() => { arm.carry = false; acM.set(1100, 540); setHead('SH  SH'); }, null, 0);
      tl.to(arm, swing('e3', 1.0), 0);
      tl.to(fad, { opacity: 0, duration: 0.3 }, 1.0).to(fadh, { opacity: 1, duration: 0.3 }, 1.0);
      tl.call(() => setHead('S–S'), null, 1.1);
      tl.to(fadh, { opacity: 0, duration: 0.3 }, 1.6).to(fad, { opacity: 1, duration: 0.3 }, 1.6);
      tl.to(nadh, { opacity: 1, duration: 0.4 }, 1.6);
      tl.fromTo(nad, { opacity: 0.3 }, { opacity: 1, duration: 0.4 }, 1.6);
    }
  }
  renderArm();
  setHead('S–S');
  return { step: apply, destroy: () => { tl?.kill(); D.destroy(); } };
}

// 8 · PDH regulation (Lippincott): kinase OFF, phosphatase ON
function pdhRegViz(el) {
  const D = diagram(el, 1712, 720);
  const ACT = [600, 370], INA = [1120, 370];
  const nAct = D.node({ x: ACT[0], y: ACT[1], label: 'PDH', sub: 'active', kind: 'box', w: 280, h: 120, size: 40, color: 'var(--act)', fill: tint('var(--act)', 14) });
  const nIna = D.node({ x: INA[0], y: INA[1], label: 'PDH–P', sub: 'inactive', kind: 'box', w: 280, h: 120, size: 40, color: 'var(--inh)', fill: tint('var(--inh)', 12) });
  const pTag = s('g', { transform: `translate(${INA[0] + 136} ${INA[1] - 60})` });
  pTag.append(s('circle', { r: 22, style: 'fill:var(--prot)' }));
  const pt = s('text', { y: 9, 'text-anchor': 'middle', style: 'font:800 24px var(--font);fill:#1d1d1f' }); pt.textContent = 'P';
  pTag.append(pt);
  D.layers.labels.append(pTag);
  const kinArc = D.arrow({ d: `M650,302 C720,140 1000,140 1070,302`, from: [650, 302], to: [1070, 302], color: 'var(--inh)', width: 5 });
  const phoArc = D.arrow({ d: `M1070,438 C1000,600 720,600 650,438`, from: [1070, 438], to: [650, 438], color: 'var(--act)', width: 5 });
  const kin = solid(D.node({ id: 'kin', x: 860, y: 182, label: 'PDH kinase', kind: 'enz', size: 28, color: 'var(--inh)', tip: { title: 'PDH kinase', body: 'Phosphorylates E1 → <b>inactivates</b> the complex. ATP → ADP.', src: LIP } }));
  const pho = solid(D.node({ id: 'pho', x: 860, y: 560, label: 'PDH phosphatase', kind: 'enz', size: 28, color: 'var(--act)', tip: { title: 'PDH phosphatase', body: 'Removes the phosphate → <b>activates</b> the complex.', src: LIP } }));
  D.text(860, 120, 'ATP → ADP', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  D.text(860, 640, 'releases P_{i}', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)' });
  // signals
  D.text(190, 64, 'SWITCH PDH OFF', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--inh)' });
  D.text(190, 448, 'SWITCH PDH ON', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--act)' });
  const SIG = [
    { id: 'atp', t: 'ATP', y: 120, col: 'var(--inh)', to: 'kin', kind: 'act', body: 'High-energy signal: <b>activates PDH kinase</b> → PDH off.' },
    { id: 'nadh', t: 'NADH', y: 218, col: 'var(--inh)', to: 'kin', kind: 'act', body: '<b>Activates PDH kinase</b>; NADH is also a product that inhibits PDH directly.' },
    { id: 'acoa', t: 'Acetyl CoA', y: 316, col: 'var(--inh)', to: 'kin', kind: 'act', body: '<b>Activates PDH kinase</b>; acetyl CoA also inhibits PDH directly (product inhibition).' },
    { id: 'pyr', t: 'Pyruvate', y: 504, col: 'var(--act)', to: 'kin', kind: 'inh', body: 'Potent <b>inhibitor of PDH kinase</b> → when pyruvate is high, E1 stays active.' },
    { id: 'ca', t: 'Ca^{2+}', y: 602, col: 'var(--act)', to: 'pho', kind: 'act', body: 'Strong <b>activator of PDH phosphatase</b> — important in contracting skeletal muscle.' },
  ];
  const on = new Set();
  const sigEls = SIG.map((sg) => {
    const chip = svgChip(D, 190, sg.y, sg.t, sg.col, 240);
    const tgt = sg.to === 'kin' ? [860 - kin.w0 / 2 - 12, 182] : [860 - pho.w0 / 2 - 12, 560];
    const x0 = 190 + 120 + 8;
    const line = D.arrow({ d: `M${x0},${sg.y} C${x0 + 170},${sg.y} ${tgt[0] - 170},${tgt[1]} ${tgt[0]},${tgt[1]}`, from: [x0, sg.y], to: tgt, color: sg.kind === 'inh' ? 'var(--inh)' : 'var(--act)', width: 3.5, kind: sg.kind === 'inh' ? 'inh' : undefined, headSize: 14 });
    line.g.style.opacity = 0.12;
    chip.g.setAttribute('data-tip', JSON.stringify({ kicker: sg.to === 'kin' ? 'Acts on PDH kinase' : 'Acts on PDH phosphatase', title: sg.t.replace('^{2+}', '²⁺'), body: sg.body + '<br><span style="color:var(--fg-3)">Click to toggle</span>', src: LIP }));
    chip.g.addEventListener('click', () => { on.has(sg.id) ? on.delete(sg.id) : on.add(sg.id); recompute(); });
    return { sg, chip, line };
  });
  // gauge
  D.text(1520, 214, 'PDH ACTIVITY', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--fg-3)' });
  const big = D.text(1520, 340, '50%', { anchor: 'middle', style: 'font-size:120px;font-weight:740;letter-spacing:-.04em;fill:var(--fg)' });
  D.layers.labels.append(s('rect', { x: 1370, y: 380, width: 300, height: 26, rx: 13, style: 'fill:var(--surface-3)' }));
  const bar = s('rect', { x: 1370, y: 380, width: 150, height: 26, rx: 13, style: 'fill:var(--act);transition:width .7s var(--ease), fill .5s' });
  D.layers.labels.append(bar);
  D.text(1520, 452, 'schematic', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3);font-size:22px' });
  let fK, fP;
  const val = { v: 50 };
  function recompute() {
    let kinR = 1 + ['atp', 'nadh', 'acoa'].filter((k) => on.has(k)).length * 1.3;
    if (on.has('pyr')) kinR *= 0.22;
    const phoR = on.has('ca') ? 4 : 1;
    let f = phoR / (kinR + phoR);
    if (on.has('nadh')) f *= 0.8;
    if (on.has('acoa')) f *= 0.8;
    const pct = Math.round(f * 100);
    sigEls.forEach(({ sg, chip, line }) => { const o = on.has(sg.id); chip.set(o); gsap.to(line.g, { opacity: o ? 1 : 0.12, duration: 0.4 }); });
    gsap.to(nAct.g, { opacity: 0.35 + 0.65 * f, duration: 0.6 });
    gsap.to(nIna.g, { opacity: 0.35 + 0.65 * (1 - f), duration: 0.6 });
    gsap.to(pTag, { opacity: 0.3 + 0.7 * (1 - f), duration: 0.6 });
    kin.shape.style.strokeWidth = kinR > 1.5 ? 5 : 2;
    pho.shape.style.strokeWidth = phoR > 1 ? 5 : 2;
    gsap.to(val, { v: pct, duration: 0.8, ease: 'power3.out', onUpdate: () => { big.textContent = `${Math.round(val.v)}%`; } });
    bar.setAttribute('width', Math.max(8, 3 * pct));
    bar.style.fill = pct >= 55 ? 'var(--act)' : pct <= 45 ? 'var(--inh)' : 'var(--a1)';
    fK?.destroy(); fP?.destroy();
    fK = D.flow(kinArc, { count: Math.max(1, Math.round(kinR * 1.4)), color: 'var(--inh)', speed: 70 + 45 * kinR, r: 9 });
    fP = D.flow(phoArc, { count: Math.max(1, Math.round(phoR * 1.4)), color: 'var(--act)', speed: 70 + 45 * phoR, r: 9 });
  }
  const preset = seg({ options: [{ v: 'base', t: 'Baseline' }, { v: 'rich', t: 'Energy-rich' }, { v: 'ex', t: 'Contracting muscle' }], value: 'base', onChange: (v) => { on.clear(); if (v === 'rich') ['atp', 'nadh', 'acoa'].forEach((k) => on.add(k)); if (v === 'ex') ['ca', 'pyr'].forEach((k) => on.add(k)); recompute(); } });
  ctrlBar(el, [preset], { right: 0, bottom: 0 });
  recompute();
  return { leave: () => { fK?.pause(); fP?.pause(); }, enter: () => { fK?.play(); fP?.play(); }, destroy: () => { fK?.destroy(); fP?.destroy(); D.destroy(); } };
}

// 9 · cards mini-viz: α-keto acid DH family vs single-enzyme ICDH
function complexMini(v, kind) {
  const D = diagram(v, 320, 250);
  v.style.minHeight = '230px';
  v.style.display = 'flex';
  v.style.alignItems = 'flex-end';
  const pulses = [];
  const foot = (txt, col) => {
    const t = s('text', { x: 160, y: 236, 'text-anchor': 'middle', class: 'v-label', style: `font-size:23px;font-weight:650;fill:${col}` });
    setRich(t, txt);
    D.layers.labels.append(t);
  };
  if (kind === 'icdh') {
    D.layers.nodes.append(s('circle', { cx: 160, cy: 62, r: 50, style: `fill:${tint('var(--elec)', 22)};stroke:var(--elec);stroke-width:3` }));
    const t = s('text', { x: 160, y: 71, 'text-anchor': 'middle', class: 'v-label', style: 'font-size:24px;font-weight:700;fill:var(--elec)' }); t.textContent = 'ICDH';
    D.layers.nodes.append(t);
    const b = D.badge(160, 160, 'NAD^{+} / NADP^{+}', { color: CO.NAD, size: 24 });
    pulses.push(b);
    foot('No TPP · B_{1}-independent', 'var(--fg-3)');
  } else {
    foot('Needs TPP · B_{1}-dependent', 'var(--o2)');
    D.layers.edges.append(s('path', { d: 'M62,58 L258,58', style: 'stroke:var(--line-2);stroke-width:3' }));
    [['E1', 'var(--prot)'], ['E2', ACC], ['E3', 'var(--fadh)']].forEach(([e, c], i) => {
      const x = 62 + i * 98;
      D.layers.nodes.append(s('circle', { cx: x, cy: 58, r: 34, style: `fill:${tint(c, 22)};stroke:${c};stroke-width:3` }));
      const t = s('text', { x, y: 66, 'text-anchor': 'middle', class: 'v-label', style: `font-size:23px;font-weight:700;fill:${c}` }); t.textContent = e;
      D.layers.nodes.append(t);
    });
    [['T', CO.TPP], ['L', CO.LIP], ['C', CO.CoA], ['F', CO.FAD], ['N', CO.NAD]].forEach(([l, c], i) => {
      const x = 40 + i * 60;
      const g = s('g');
      g.append(s('circle', { cx: x, cy: 158, r: 23, style: `fill:${tint(c, 24)};stroke:${c};stroke-width:2.5` }));
      const t = s('text', { x, y: 166, 'text-anchor': 'middle', class: 'v-label', style: `font-size:23px;font-weight:760;fill:${c}` }); t.textContent = l;
      g.append(t);
      D.layers.nodes.append(g);
      pulses.push(g);
    });
  }
  const tw = gsap.fromTo(pulses, { opacity: 0.45 }, { opacity: 1, duration: 0.5, stagger: { each: 0.22, repeat: -1, yoyo: true }, ease: 'sine.inOut' });
  return { destroy: () => { tw.kill(); D.destroy(); } };
}

// 10 · TPP in 3D
async function tppViz(el) {
  el.append(h('div', { style: 'position:absolute;left:0;right:0;top:0;text-align:center;z-index:2;pointer-events:none' }, [
    h('div', { style: 'font-size:38px;font-weight:700;letter-spacing:-.02em', text: 'Thiamine pyrophosphate (TPP)' }),
    h('div', { style: 'font-size:26px;color:var(--fg-2);margin-top:6px', html: 'Active coenzyme form of <b>vitamin B₁</b>' }),
  ]));
  const host = h('div', { style: 'position:absolute;inset:100px 0 120px 0' });
  el.append(host);
  const sc = await moleculeScene(host, 'tpp', {
    fill: 1.02, autoRotate: 0.9,
    mol: { hideH: 'nonpolar', highlight: { atoms: [0, 10, 14, 15, 18], color: 0xffd60a } },
    labels: [
      { atom: 18, text: 'Thiazolium ring', dy: 1.2, cls: 'sm acc', tip: { title: 'Thiazolium ring', body: 'The reactive C2 (between N and S) attacks pyruvate’s carbonyl — the basis of decarboxylation on E1.', src: LIP } },
      { atom: 4, text: 'Pyrophosphate', dy: 1.3, cls: 'sm' },
      { atom: 24, text: 'Pyrimidine ring', dy: 1.2, cls: 'sm' },
    ],
  });
  const chips = h('div', { style: 'position:absolute;left:0;right:0;bottom:4px;display:flex;justify-content:center;gap:14px;align-items:center;font-size:26px;color:var(--fg-2)' }, [
    h('span', { text: 'Needed by' }),
    ...['PDH', 'α-KG DH', 'BCKD'].map((t) => h('span.chip.acc', { style: 'font-size:26px', text: t })),
  ]);
  tip(chips, { title: 'TPP-dependent α-keto acid dehydrogenases', body: '“Thiamin deficiency affects PDH and α-keto acid dehydrogenase complexes.” α-KG DH and the branched-chain α-keto acid DH use the same five coenzymes as PDH.', src: SRC('7, 9') });
  el.append(chips);
  return sc;
}

// 11 · Thiamine before glucose (statement)
function thiamineGlucoseViz(el) {
  const D = diagram(el, 1500, 360);
  const Y = 140;
  D.node({ id: 'glc', x: 95, y: Y, label: 'IV glucose', kind: 'mol', color: 'var(--elec)', size: 28 });
  D.node({ id: 'pyr', x: 395, y: Y, label: 'Pyruvate', kind: 'mol', size: 28 });
  const pdh = D.node({ id: 'pdh', x: 700, y: Y, label: 'PDH complex', kind: 'enz', size: 28, color: ACC });
  D.node({ id: 'ac', x: 1000, y: Y, label: 'Acetyl CoA', kind: 'mol', size: 28 });
  const atp = D.node({ id: 'atp', x: 1320, y: Y, label: 'TCA → ATP', kind: 'mol', size: 28, color: 'var(--atp)' });
  const lac = D.node({ id: 'lac', x: 620, y: 300, label: 'Lactate', kind: 'mol', size: 28, color: 'var(--inh)' });
  const a = [
    D.arrow({ from: 'glc', to: 'pyr', width: 4 }),
    D.arrow({ from: 'pyr', to: 'pdh', width: 4 }),
    D.arrow({ from: 'pdh', to: 'ac', width: 4 }),
    D.arrow({ from: 'ac', to: 'atp', width: 4 }),
  ];
  const toLac = D.arrow({ d: `M430,${Y + 34} C460,250 500,300 545,300`, from: [430, Y + 34], to: [545, 300], width: 4, color: 'var(--inh)' });
  const tpp = D.badge(700, 54, 'TPP', { color: CO.TPP, size: 26 });
  const tppOk = D.text(752, 63, '✓', { style: 'font-size:30px;font-weight:800;fill:var(--act);opacity:0' });
  const tppNo = D.text(752, 63, '✕', { style: 'font-size:30px;font-weight:800;fill:var(--inh);opacity:0' });
  const block = s('g', { style: 'opacity:0' });
  block.append(s('circle', { cx: 852, cy: Y, r: 34, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:5' }));
  block.append(s('path', { d: `M828,${Y - 24} L876,${Y + 24}`, style: 'stroke:var(--inh);stroke-width:6;stroke-linecap:round' }));
  D.layers.labels.append(block);
  const warn = D.badge(1320, 232, 'Brain ATP ↓ · Wernicke’s', { color: 'var(--inh)', size: 24 });
  const acid = D.badge(860, 300, 'Lactic acidosis', { color: 'var(--inh)', size: 24 });
  warn.style.opacity = 0; acid.style.opacity = 0;
  const fl = {
    g: D.flow(a[0], { count: 3, color: 'var(--elec)', speed: 160, r: 9, autoplay: false }),
    p: D.flow(a[1], { count: 2, color: ACC, speed: 160, r: 9, autoplay: false }),
    d: [a[2], a[3]].map((x) => D.flow(x, { count: 2, color: ACC, speed: 160, r: 9, autoplay: false })),
    l: D.flow(toLac, { count: 3, color: 'var(--inh)', speed: 150, r: 9, autoplay: false }),
  };
  const all = () => [fl.g, fl.p, ...fl.d, fl.l];
  let mode = 0;
  const set = (m) => {
    mode = m;
    all().forEach((f) => f.hide());
    if (m >= 1) fl.g.play();
    if (m === 1) { fl.l.play(); }
    if (m === 2) { fl.p.play(); fl.d.forEach((f) => f.play()); }
    gsap.to(block, { opacity: m === 1 ? 1 : 0, duration: 0.4 });
    gsap.to(tppNo, { opacity: m === 1 ? 1 : 0, duration: 0.4 });
    gsap.to(tppOk, { opacity: m === 2 ? 1 : 0, duration: 0.4 });
    gsap.to([warn, acid], { opacity: m === 1 ? 1 : 0, duration: 0.5 });
    gsap.to([lac.g, toLac.g], { opacity: m === 1 ? 1 : 0.3, duration: 0.5 });
    gsap.to([pdh.g, a[2].g, a[3].g, D.nodes.ac.g], { opacity: m === 1 ? 0.35 : 1, duration: 0.5 });
    atp.shape.style.stroke = m === 1 ? 'var(--inh)' : m === 2 ? 'var(--act)' : '';
  };
  const t = toggle({ label: 'Thiamine given first', on: false, onChange: (v) => set(v ? 2 : mode === 0 ? 0 : 1) });
  ctrlBar(el, [t], { left: 0, bottom: 0 });
  set(0);
  return { step: (n) => { t.set(n >= 2, false); set(n); }, leave: () => all().forEach((f) => f.pause()), enter: () => set(mode), destroy: () => D.destroy() };
}

// 12 · PDH deficiency: pyruvate backs up into lactate and alanine
function pdhDefViz(el) {
  const D = diagram(el, 960, 860);
  D.region({ x: 150, y: 10, w: 660, h: 220, r: 110, label: 'Mitochondrion', lx: 120, ly: 56, fill: tint(ACC, 8), stroke: tint(ACC, 40), labelColor: 'var(--ink)' });
  D.node({ id: 'ac', x: 410, y: 140, label: 'Acetyl CoA', kind: 'mol', size: 28 });
  D.node({ id: 'tca', x: 650, y: 140, label: 'TCA', kind: 'box', size: 28, color: ACC });
  const toTca = D.arrow({ from: 'ac', to: 'tca', width: 4, color: ACC });
  D.node({ id: 'pyr', x: 480, y: 400, label: 'Pyruvate', kind: 'mol', size: 34 });
  D.node({ id: 'glc', x: 480, y: 530, label: 'Glucose', kind: 'mol', size: 28, color: 'var(--elec)' });
  const lacN = D.node({ id: 'lac', x: 115, y: 400, label: 'Lactate', kind: 'mol', size: 30, color: 'var(--inh)' });
  const alaN = D.node({ id: 'ala', x: 845, y: 400, label: 'Alanine', kind: 'mol', size: 30, color: 'var(--inh)' });
  const gly = D.arrow({ from: 'glc', to: 'pyr', width: 4, color: 'var(--fg-3)' });
  const pdhA = D.arrow({ from: [462, 364], to: [425, 180], width: 5, color: ACC });
  const pdhN = D.node({ x: 600, y: 272, label: 'PDH complex', kind: 'enz', size: 26, color: ACC });
  const ldh = D.arrow({ from: 'pyr', to: 'lac', width: 4, color: 'var(--inh)', label: 'LDH', labelSide: -1, labelColor: 'var(--fg-2)' });
  const alt = D.arrow({ from: 'pyr', to: 'ala', width: 4, color: 'var(--inh)', label: 'ALT', labelSide: 1, labelColor: 'var(--fg-2)', tip: { title: 'Ala transaminase (ALT)', body: 'Pyruvate ⇄ alanine (enzyme 5 on slide 17) — why alanine rises when pyruvate cannot be oxidised.', src: SRC(17) } });
  const block = s('g', { style: 'opacity:0' });
  block.append(s('circle', { cx: 443, cy: 272, r: 34, style: 'fill:var(--bg);stroke:var(--inh);stroke-width:5' }));
  block.append(s('path', { d: 'M421,250 L465,294 M465,250 L421,294', style: 'stroke:var(--inh);stroke-width:6;stroke-linecap:round' }));
  D.layers.labels.append(block);
  const ph = D.badge(115, 482, 'pH ↓', { color: 'var(--inh)', size: 26 });
  ph.style.opacity = 0;
  // level bars
  const bars = [['Pyruvate', 618], ['Lactate', 676], ['Alanine', 734]].map(([t, y]) => {
    D.text(0, y + 10, t, { style: 'font-size:28px;font-weight:600;fill:var(--fg)' });
    D.layers.labels.append(s('rect', { x: 190, y: y - 15, width: 600, height: 30, rx: 15, style: 'fill:var(--surface-3)' }));
    const f = s('rect', { x: 190, y: y - 15, width: 150, height: 30, rx: 15, style: 'fill:var(--a1);transition:width .9s var(--ease), fill .5s' });
    D.layers.labels.append(f);
    D.layers.labels.append(s('line', { x1: 340, x2: 340, y1: y - 24, y2: y + 24, style: 'stroke:var(--fg-3);stroke-width:2;stroke-dasharray:4 5' }));
    const v = D.text(812, y + 10, 'normal', { style: 'font-size:26px;font-weight:700;fill:var(--fg-2)' });
    return { f, v };
  });
  const fl = {
    gly: D.flow(gly, { count: 2, color: 'var(--elec)', speed: 110, r: 8 }),
    pdh: D.flow(pdhA, { count: 3, color: ACC, speed: 130, r: 9, autoplay: false }),
    tca: D.flow(toTca, { count: 2, color: ACC, speed: 110, r: 8, autoplay: false }),
    ldh: D.flow(ldh, { count: 3, color: 'var(--inh)', speed: 150, r: 9, autoplay: false }),
    alt: D.flow(alt, { count: 3, color: 'var(--inh)', speed: 150, r: 9, autoplay: false }),
  };
  const set = (def) => {
    gsap.to(block, { opacity: def ? 1 : 0, duration: 0.4 });
    gsap.to([pdhN.g, pdhA.g], { opacity: def ? 0.35 : 1, duration: 0.4 });
    gsap.to([lacN.g, alaN.g, ldh.g, alt.g], { opacity: def ? 1 : 0.45, duration: 0.4 });
    gsap.to(ph, { opacity: def ? 1 : 0, duration: 0.4 });
    if (def) { fl.pdh.hide(); fl.tca.hide(); fl.ldh.play(); fl.alt.play(); } else { fl.pdh.play(); fl.tca.play(); fl.ldh.hide(); fl.alt.hide(); }
    bars.forEach((b, i) => {
      b.f.setAttribute('width', def ? [480, 560, 520][i] : 150);
      b.f.style.fill = def ? 'var(--inh)' : 'var(--a1)';
      b.v.textContent = def ? '↑' : 'normal';
      b.v.style.fill = def ? 'var(--inh)' : 'var(--fg-2)';
      b.v.style.fontSize = def ? '40px' : '26px';
    });
  };
  const t = toggle({ label: 'PDH deficiency', danger: true, onChange: set });
  ctrlBar(el, [t], { left: 0, bottom: 0 });
  D.text(940, 840, 'levels schematic', { anchor: 'end', cls: 'sm', style: 'fill:var(--fg-3);font-size:22px' });
  set(false);
  return { step: (n) => t.set(n >= 1), leave: () => Object.values(fl).forEach((f) => f.pause()), destroy: () => D.destroy() };
}

// 13 · 3D mitochondrion with the glowing cycle in the matrix
function mitoViz(el) {
  const kit = createScene(el, { cam: [0, 7.5, 26], autoRotate: 0, fov: 30 });
  const g = new THREE.Group();
  kit.root.add(g);
  g.rotation.y = 0.5;
  const outer = new THREE.Mesh(new THREE.CapsuleGeometry(3.3, 7.6, 16, 72), glass(0xffc27a, { opacity: 0.13 }));
  outer.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CapsuleGeometry(3.36, 7.6, 16, 72), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(0xff9f0a) } },
    vertexShader: 'varying float f; void main(){ vec3 n=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); f=pow(1.-abs(dot(n,normalize(-mv.xyz))),2.4); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; varying float f; void main(){ gl_FragColor=vec4(c, f*0.85); }',
  }));
  rim.rotation.z = Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(2.95, 7.0, 16, 72), new THREE.MeshPhysicalMaterial({ color: 0xff9f0a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, roughness: 0.4 }));
  inner.rotation.z = Math.PI / 2;
  g.add(outer, rim, inner);
  const crMat = glossy(0xff9f0a, { transparent: true, opacity: 0.5, emissive: 0x3a1a00 });
  const crGeo = new THREE.SphereGeometry(1, 36, 18);
  for (let i = -3; i <= 3; i++) {
    const cr = new THREE.Mesh(crGeo, crMat);
    cr.scale.set(0.14, 1.12, 1.7);
    cr.position.set(i * 1.22, i % 2 ? 1.88 : -1.88, 0);
    g.add(cr);
  }
  // the cycle
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.15, 24, 140), new THREE.MeshStandardMaterial({ color: 0x40c8e0, emissive: 0x40c8e0, emissiveIntensity: 1.3, roughness: 0.3 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const halo = glowSprite(0x40c8e0, 6.5);
  halo.material.opacity = 0.45;
  g.add(halo);
  const beads = Array.from({ length: 8 }, (_, i) => {
    const b = glowSprite(i === 0 ? 0xffffff : 0x9be8f5, 0.65);
    g.add(b);
    return b;
  });
  // fuel streams → acetyl CoA → cycle; CO2 out; NADH down to the inner membrane
  const SRCS = [new THREE.Vector3(-6.3, 4.9, 2.5), new THREE.Vector3(0, 6.6, -4.5), new THREE.Vector3(6.3, 4.9, 2.5)];
  const parts = [];
  const spawn = (kind, from, to, ctrl, color, size, dur) => {
    const sp = glowSprite(color, size);
    sp.position.copy(from);
    g.add(sp);
    parts.push({ sp, curve: new THREE.QuadraticBezierCurve3(from.clone(), ctrl, to.clone()), t: 0, dur, kind });
  };
  let acc = 0, k = 0;
  kit.onFrame((dt, t) => {
    ring.rotation.z += dt * 0.25;
    beads.forEach((b, i) => { const a = t * 0.7 + (i / 8) * Math.PI * 2; b.position.set(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75); });
    g.rotation.y = 0.5 + Math.sin(t * 0.18) * 0.22;
    acc += dt;
    if (acc > 0.55) {
      acc = 0;
      const s0 = SRCS[k++ % 3];
      const a = Math.random() * Math.PI * 2;
      const entry = new THREE.Vector3(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75);
      spawn('fuel', s0, entry, s0.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, 2.6, 0)), 0xffd60a, 0.95, 2.4);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt / p.dur;
      p.sp.position.copy(p.curve.getPoint(Math.min(1, p.t)));
      p.sp.material.opacity = Math.min(1, p.t * 6, (1 - p.t) * 6);
      if (p.t >= 1) {
        g.remove(p.sp); p.sp.material.dispose(); parts.splice(i, 1);
        if (p.kind === 'fuel') {
          const at = p.curve.v2;
          spawn('co2', at, at.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 6.5, 0)), at.clone().add(new THREE.Vector3(0, 2.5, 0)), 0xb0b0b8, 0.75, 2.2);
          spawn('nadh', at, new THREE.Vector3(at.x * 1.2, -2.9, at.z * 0.8), at.clone().add(new THREE.Vector3(0, -0.6, 0)), 0x64d2ff, 0.7, 1.6);
        }
      }
    }
  });
  kit.label('Carbohydrates', [-6.3, 6.1, 2.5], { cls: 'sm', parent: g });
  kit.label('Fatty acids', [0, 7.8, -4.5], { cls: 'sm', parent: g });
  kit.label('Amino acids', [6.3, 6.1, 2.5], { cls: 'sm', parent: g });
  kit.label('TCA cycle · matrix', [0, -0.95, 2.6], { cls: 'acc', parent: g });
  kit.label('CO₂ out', [3.4, 7.0, 0], { cls: 'sm plain', parent: g });
  kit.label('NADH → ETC', [0, -4.4, 1.8], { cls: 'sm plain', parent: g, tip: { title: 'Reduced coenzymes', body: 'NADH and FADH₂ from the cycle feed the electron transport chain in the inner membrane.', src: SRC(17) } });
  const box = new THREE.Group();
  [[-9.6, 6.4, 2.5], [9.6, 6.4, 2.5], [0, -6.6, 0]].forEach((p) => { const o = new THREE.Object3D(); o.position.set(...p); box.add(o); });
  g.add(box);
  kit.fit(g, 1.1);
  // pre-warm the streams so the first frame is already alive
  for (let i = 0; i < 9; i++) {
    const s0 = SRCS[i % 3], a = i * 2.1;
    const entry = new THREE.Vector3(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75);
    spawn('fuel', s0, entry, s0.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, 2.6, 0)), 0xffd60a, 0.95, 2.4);
    parts[parts.length - 1].t = (i / 9) * 0.95;
  }
  return kitController(kit);
}

// 14 · THE wheel
const TCA = [
  { key: 'oaa', name: 'Oxaloacetate', label: 'Oxaloacetate', c: 4 },
  { key: 'citrate', name: 'Citrate', label: 'Citrate', c: 6 },
  { key: 'isocitrate', name: 'Isocitrate', label: 'Isocitrate', c: 6 },
  { key: 'akg', name: 'α-Ketoglutarate', label: 'α-Keto-\nglutarate', c: 5 },
  { key: null, name: 'Succinyl CoA', label: 'Succinyl CoA', c: 4 },
  { key: 'succinate', name: 'Succinate', label: 'Succinate', c: 4 },
  { key: 'fumarate', name: 'Fumarate', label: 'Fumarate', c: 4 },
  { key: 'malate', name: 'Malate', label: 'Malate', c: 4 },
];
const RXN = [
  { enz: ['Citrate synthase'], full: 'Citrate synthase', type: ['Condensation'], outs: [], reg: true, tipx: 'Acetyl CoA (2C) + oxaloacetate (4C) → citrate (6C). Regulated.' },
  { enz: ['Aconitase'], full: 'Aconitase', type: ['Isomerization'], outs: [], tipx: 'Via cis-aconitate. Unlabelled clamp on slide 14 (name per Lippincott).' },
  { enz: ['Isocitrate', 'dehydrogenase'], full: 'Isocitrate dehydrogenase', type: ['Oxidative decarboxylation'], outs: ['NADH', 'CO2'], reg: true, tipx: 'Regulated · rate-limiting step (Lippincott).' },
  { enz: ['α-KG dehydrogenase', 'complex'], full: 'α-Ketoglutarate dehydrogenase complex', type: ['Oxidative decarboxylation'], outs: ['NADH', 'CO2'], reg: true, tipx: 'PDH look-alike: E1–E2–E3 and the same 5 coenzymes. Regulated.' },
  { enz: ['Succinyl CoA', 'synthetase'], full: 'Succinyl CoA synthetase (thiokinase)', type: ['Substrate-level', 'phosphorylation'], outs: ['GTP'], tipx: '“Synthetase” on slide 14, “thiokinase” on slide 16 — same enzyme.' },
  { enz: ['Succinate', 'dehydrogenase'], full: 'Succinate dehydrogenase', type: ['Oxidation (FAD)'], outs: ['FADH2'], tipx: 'FAD-linked (Lippincott: bound to the inner membrane).' },
  { enz: ['Fumarase'], full: 'Fumarase', type: ['Hydration'], outs: [], ins: ['H2O'], tipx: 'Adds water across the double bond.' },
  { enz: ['Malate', 'dehydrogenase'], full: 'Malate dehydrogenase', type: ['Oxidation'], outs: ['NADH'], tipx: 'Regenerates oxaloacetate — the cycle closes.' },
];
async function wheelViz(el) {
  const D = diagram(el, 1712, 720);
  const CX = 470, CY = 362, R = 278;
  const ang = (i) => ((-90 + 45 * i) * Math.PI) / 180;
  const pt = (a, r = R) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const arcD = (i, r = R) => { const [x0, y0] = pt(ang(i), r), [x1, y1] = pt(ang(i + 1), r); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };
  // track
  D.layers.edges.append(s('circle', { cx: CX, cy: CY, r: R, style: `fill:none;stroke:${tint(ACC, 11)};stroke-width:42` }));
  [R + 21, R - 21].forEach((r) => D.layers.edges.append(s('circle', { cx: CX, cy: CY, r, style: 'fill:none;stroke:var(--line);stroke-width:1.5' })));
  const arcs = RXN.map((_, i) => {
    const p = s('path', { d: arcD(i), style: `fill:none;stroke:${ACC};stroke-width:42;opacity:0` });
    const gl = s('path', { d: arcD(i), style: `fill:none;stroke:${ACC};stroke-width:12;opacity:0;stroke-linecap:round`, filter: `url(#${D.glowId})` });
    D.layers.edges.append(p);
    D.layers.fx.append(gl);
    return { p, gl };
  });
  // direction chevrons on the track
  RXN.forEach((_, i) => {
    const a = ang(i) + (0.74 * Math.PI) / 4;
    const [x, y] = pt(a);
    const deg = (a * 180) / Math.PI + 90;
    D.layers.edges.append(s('path', { d: 'M-7,-11 L5,0 L-7,11', transform: `translate(${x} ${y}) rotate(${deg})`, style: 'fill:none;stroke:var(--fg-3);stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round' }));
  });
  // step markers (inside the ring)
  const markers = RXN.map((r, i) => {
    const a = (ang(i) + ang(i + 1)) / 2;
    const [x, y] = pt(a, R - 70);
    const g = s('g', { transform: `translate(${x} ${y})`, 'data-tip': JSON.stringify({ kicker: `Step ${i + 1}${r.reg ? ' · regulated' : ''}`, title: r.full, body: `${r.type.join(' ')}${r.outs.length ? ` → <b>${r.outs.map((o) => PRODTXT[o].replace('_{2}', '₂')).join(' + ')}</b>` : ''}.<br>${r.tipx}`, src: `${SRC('14, 16, 18')} · ${LIP}` }) });
    const c = s('circle', { r: 23, style: 'fill:var(--bg);stroke:var(--line-2);stroke-width:2.5;transition:stroke .4s, fill .4s' });
    const t = s('text', { y: 8, 'text-anchor': 'middle', style: 'font:700 22px var(--font);fill:var(--fg-2)' });
    t.textContent = i + 1;
    const regRing = s('circle', { r: 34, style: 'fill:none;stroke:var(--inh);stroke-width:4;stroke-dasharray:6 6;opacity:0' });
    g.append(regRing, c, t);
    D.layers.nodes.append(g);
    return { g, c, t, regRing, x, y };
  });
  // intermediates
  const nodes = TCA.map((m, i) => {
    const [x, y] = pt(ang(i));
    const n = solid(D.node({ x, y, label: m.label, kind: 'mol', size: 25, tip: { title: m.name, body: `${m.c} carbons${m.key ? ' · click to view in 3D' : ' · high-energy thioester (CoA)'}`, src: SRC(14) } }));
    n.g.style.cursor = 'pointer';
    n.g.addEventListener('click', () => view(i, true));
    return n;
  });
  // inputs
  const acetyl = solid(D.node({ x: 800, y: 50, label: 'Acetyl CoA · 2C', kind: 'mol', size: 24, color: ACC, tip: { title: 'Acetyl CoA', body: 'The entry point of the cycle (slide 3): 2 carbons join oxaloacetate.', src: SRC('3, 14') } }));
  D.arrow({ d: 'M680,62 C640,66 616,78 600,96', from: [680, 62], to: [600, 96], color: ACC, width: 4, headSize: 14 });
  const [hx, hy] = pt(ang(6.5), R + 72);
  const water = D.badge(hx, hy, 'H_{2}O', { color: 'var(--elec)', size: 24 });
  water.style.opacity = 0;
  // centre readout
  const rEy = D.text(CX, 258, '', { anchor: 'middle', style: 'font-size:22px;font-weight:700;letter-spacing:.14em;fill:var(--ink)' });
  const rL1 = D.text(CX, 304, '', { anchor: 'middle', style: 'font-size:31px;font-weight:690;fill:var(--fg);letter-spacing:-.01em' });
  const rL2 = D.text(CX, 342, '', { anchor: 'middle', style: 'font-size:31px;font-weight:690;fill:var(--fg);letter-spacing:-.01em' });
  const rT1 = D.text(CX, 384, '', { anchor: 'middle', style: 'font-size:24px;font-weight:560;fill:var(--fg-2)' });
  const rT2 = D.text(CX, 414, '', { anchor: 'middle', style: 'font-size:24px;font-weight:560;fill:var(--fg-2)' });
  const beadG = s('g');
  D.layers.labels.append(beadG);
  const rCn = D.text(CX, 494, '', { anchor: 'middle', style: 'font-size:24px;font-weight:650;fill:var(--fg-2)' });
  tip(rCn, { title: 'Carbon tracking', body: '2 C enter as acetyl CoA, 2 C leave as CO₂ — balanced every turn. (Labelling studies show the CO₂ released in one turn comes from the oxaloacetate part; the acetyl carbons (teal) leave in later turns.)', src: 'Lecture slides 6, 14, 16 · textbook' });
  const BEADS = [
    'CCCCAA', 'CCCCAA', 'CCCCAA', 'CCCAA', 'CCAA', 'CCAA', 'CCAA', 'CCAA', 'CCAA', 'CCAA',
  ];
  const setBeads = (code, lost) => {
    beadG.innerHTML = '';
    const n = code.length, sp = 32, x0 = CX - ((n - 1) * sp) / 2;
    code.split('').forEach((ch, i) => beadG.append(s('circle', { cx: x0 + i * sp, cy: 452, r: 12, style: `fill:${ch === 'A' ? ACC : CARBON}` })));
    if (lost) {
      const b = s('circle', { cx: x0 - sp, cy: 452, r: 12, style: `fill:${CARBON}` });
      beadG.append(b);
      gsap.to(b, { attr: { cy: 400 }, opacity: 0, duration: 0.9, ease: 'power2.out' });
    }
  };
  // right panel: caption, 3D viewer, counters
  const cap = h('div', { style: 'position:absolute;left:1010px;top:0;width:700px;text-align:center;z-index:2;pointer-events:none' });
  const capName = h('div', { style: 'font-size:42px;font-weight:700;letter-spacing:-.02em' });
  const capSub = h('div', { style: 'font-size:25px;color:var(--fg-2);margin-top:6px' });
  cap.append(capName, capSub);
  const host = h('div', { style: 'position:absolute;left:1010px;top:96px;width:700px;height:450px' });
  const ph = h('div', { style: 'position:absolute;left:1010px;top:96px;width:700px;height:450px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;opacity:0;pointer-events:none;transition:opacity .4s' }, [
    h('div', { style: 'font-size:46px;font-weight:700;letter-spacing:-.02em', html: 'Succinyl–S–CoA' }),
    h('div', { style: 'font-size:26px;color:var(--fg-2)', html: '4C succinyl group on CoA · <b>thioester</b>' }),
    h('div', { style: 'font-size:22px;color:var(--fg-3)', text: '(large CoA molecule — 3D not shown)' }),
  ]);
  el.append(cap, host, ph);
  const viewer = await moleculeScene(host, 'oaa', { fill: 0.8, mol: { hideH: false }, autoRotate: 1.2 });
  viewer.kit.wrap.style.transition = 'opacity .4s';
  // counters (SVG)
  const CNT = [['NADH', 'NADH'], ['CO2', 'CO₂'], ['FADH2', 'FADH₂'], ['GTP', 'GTP']];
  const cX = (k) => 1080 + k * 175;
  const cnt = {};
  CNT.forEach(([key, lbl], k) => {
    cnt[key] = D.text(cX(k), 650, '0', { anchor: 'middle', style: `font-size:68px;font-weight:740;letter-spacing:-.03em;fill:${PROD[key]};font-variant-numeric:tabular-nums` });
    D.text(cX(k), 692, lbl, { anchor: 'middle', style: 'font-size:24px;font-weight:600;fill:var(--fg-2)' });
  });
  D.layers.labels.append(s('line', { x1: 1010, x2: 1710, y1: 576, y2: 576, style: 'stroke:var(--line);stroke-width:1.5' }));
  const VALS = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 0, 0], [2, 2, 0, 0], [2, 2, 0, 1], [2, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1], [3, 2, 1, 1]];
  const MOL = ['oaa', 'citrate', 'isocitrate', 'akg', null, 'succinate', 'fumarate', 'malate', 'oaa', 'oaa'];
  let curView = -1, timer = null, cur = -1;
  function view(i, user) {
    clearTimeout(timer);
    const key = TCA[i].key;
    capName.textContent = TCA[i].name;
    capSub.innerHTML = user ? `${TCA[i].c} carbons · drag to rotate` : capSub.innerHTML;
    ph.style.opacity = key ? 0 : 1;
    viewer.kit.wrap.style.opacity = key ? 1 : 0.06;
    if (key && curView !== i) viewer.swap(key);
    curView = i;
    nodes.forEach((n, k) => { n.shape.style.stroke = k === i ? ACC : ''; n.shape.style.strokeWidth = k === i ? 4 : ''; });
  }
  function readout(n) {
    const els = [rEy, rL1, rL2, rT1, rT2];
    let L;
    if (n === 0) L = ['START', 'Acetyl CoA', '+ oxaloacetate', '2 C + 4 C', ''];
    else if (n === 9) L = ['PER TURN', '3 NADH · FADH₂', 'GTP · 2 CO₂', '3 regulated steps', '(red rings)'];
    else { const r = RXN[n - 1]; L = [`STEP ${n}${r.reg ? ' · REGULATED' : ''}`, r.enz[0], r.enz[1] || '', r.type[0], r.type[1] || '']; }
    if (L[2] === '') { rL1.setAttribute('y', 322); } else rL1.setAttribute('y', 304);
    els.forEach((e, k) => setRich(e, L[k]));
    rEy.style.fill = n > 0 && n < 9 && RXN[n - 1].reg ? 'var(--inh)' : 'var(--ink)';
    gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.45, stagger: 0.04 });
    const code = BEADS[n];
    setBeads(code, n === 3 || n === 4);
    setRich(rCn, n === 0 ? '6 carbons · 2 enter' : `${code.length} carbons${n === 3 || n === 4 ? ' · 1 lost as CO_{2}' : ''}`);
  }
  function step(n, dir) {
    const fwd = dir > 0 && n === cur + 1;
    cur = n;
    readout(n);
    arcs.forEach((a, i) => {
      const done = i < Math.min(n, 8);
      const now = n >= 1 && n <= 8 && i === n - 1;
      gsap.to(a.p, { opacity: now ? 0.9 : done ? 0.28 : 0, duration: 0.6 });
      gsap.to(a.gl, { opacity: now ? 1 : 0, duration: 0.6 });
      if (now && fwd) gsap.fromTo(a.gl, { strokeDasharray: '0 2000' }, { strokeDasharray: '420 2000', duration: 0.9, ease: 'power2.inOut' });
      else a.gl.style.strokeDasharray = '';
    });
    markers.forEach((m, i) => {
      const now = n >= 1 && n <= 8 && i === n - 1;
      const done = i < Math.min(n, 8);
      m.c.style.stroke = now ? ACC : done ? tint(ACC, 70) : 'var(--line-2)';
      m.c.style.fill = now ? tint(ACC, 30) : 'var(--bg)';
      m.t.style.fill = now || done ? 'var(--fg)' : 'var(--fg-2)';
      gsap.to(m.regRing, { opacity: n === 9 && RXN[i].reg ? 1 : 0, duration: 0.5 });
    });
    gsap.to(acetyl.g, { opacity: n === 0 || n === 1 || n === 9 ? 1 : 0.4, duration: 0.5 });
    gsap.to(water, { opacity: n === 7 ? 1 : 0, duration: 0.4 });
    // products fly to the counters
    if (fwd && n >= 1 && n <= 8) {
      const r = RXN[n - 1];
      const a = (ang(n - 1) + ang(n)) / 2;
      r.outs.forEach((o, k) => {
        const [x0, y0] = pt(a, R + 62 + k * 18);
        const ci = CNT.findIndex((c) => c[0] === o);
        flyBadge(D, x0, y0, cX(ci), 630, o, 0.35 + k * 0.25);
      });
    }
    const v = VALS[n];
    CNT.forEach(([key], k) => countTo(cnt[key], v[k], { from: +cnt[key].textContent || 0, duration: 0.8, ...(fwd ? { } : {}) }));
    // molecule
    clearTimeout(timer);
    const mi = n === 9 ? 0 : n % 8;
    const sub = n === 0 ? 'Acceptor · 4 carbons' : n === 9 ? 'Regenerated · ready for the next turn' : `made by ${RXN[n - 1].full}`;
    if (n === 2 && fwd) {
      capName.textContent = 'cis-Aconitate';
      capSub.textContent = 'intermediate on aconitase';
      ph.style.opacity = 0; viewer.kit.wrap.style.opacity = 1;
      viewer.swap('cis-aconitate'); curView = -2;
      timer = setTimeout(() => { view(mi, false); capSub.textContent = sub; }, 1300);
    } else {
      view(mi, false);
      capSub.textContent = sub;
    }
  }
  setBeads(BEADS[0]);
  return {
    enter: () => viewer.enter(), leave: () => viewer.leave(), step,
    destroy: () => { clearTimeout(timer); D.destroy(); viewer.destroy(); },
  };
}

// 15 · The slide-16 table as a reveal drill
function tableViz(el) {
  const chip = (k) => `<span style="display:inline-block;font-size:20px;font-weight:700;padding:2px 10px;border-radius:99px;margin-left:8px;vertical-align:2px;color:${PROD[k]};background:${tint(PROD[k], 14)};border:1px solid ${tint(PROD[k], 45)}">${PRODTXT[k].replace('_{2}', '₂')}</span>`;
  // cell: string = given on slide · {a, g} = blank on slide (answer, reveal group)
  const ROWS = [
    { red: 1, c: ['Oxaloacetate + acetyl CoA', 'Citrate', { a: 'Condensation', g: 1 }, { a: 'Citrate synthase', g: 2 }, '6'] },
    { c: ['Citrate', 'Isocitrate', { a: 'Isomerization', g: 1 }, { a: 'Aconitase', g: 2 }, '6'] },
    { red: 1, c: ['Isocitrate', { a: `α-Ketoglutarate${chip('NADH')}${chip('CO2')}`, g: 2 }, 'Oxidative decarboxylation', { a: 'Isocitrate DH', g: 2 }, { a: '5', g: 3 }] },
    { red: 1, c: ['α-Ketoglutarate', `Succinyl CoA${chip('NADH')}${chip('CO2')}`, { a: 'Oxidative decarboxylation', g: 1 }, 'Dehydrogenase <span style="color:var(--fg-3);font-size:22px">(α-KG DH complex)</span>', { a: '4', g: 3 }] },
    { c: ['Succinyl CoA', `Succinate${chip('GTP')}`, { a: 'Substrate-level phosph.', g: 1 }, 'Thiokinase', { a: '4', g: 3 }] },
    { c: ['Succinate', `Fumarate${chip('FADH2')}`, { a: 'Oxidation (FAD)', g: 1 }, 'Dehydrogenase', { a: '4', g: 3 }] },
    { c: ['Fumarate', 'Malate', 'Hydration', 'Fumarase', { a: '4', g: 3 }] },
    { c: [{ a: 'Malate', g: 2 }, `Oxaloacetate${chip('NADH')}`, 'Oxidation', { a: 'Malate DH', g: 2 }, { a: '4', g: 3 }] },
  ];
  const grid = h('div', { style: 'display:grid;grid-template-columns:72px 310px 370px 370px 410px 90px;gap:9px 12px;align-content:center;height:100%' });
  ['No', 'Substrate', 'Product', 'Reaction type', 'Enzyme', 'C<sub style="text-transform:none">n</sub>'].forEach((t) => grid.append(h('div', { style: 'font-size:22px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--fg-3);padding:0 16px', html: t })));
  const blanks = [];
  ROWS.forEach((r, i) => {
    const bg = r.red ? tint('var(--inh)', 10) : 'var(--surface)';
    const bd = r.red ? tint('var(--inh)', 35) : 'var(--line)';
    const no = h('div', { style: `display:grid;place-items:center;border-radius:16px;font:700 26px var(--font);background:${r.red ? 'var(--inh)' : 'var(--surface-2)'};color:${r.red ? '#fff' : 'var(--fg)'}`, text: i + 1 });
    if (r.red) tip(no, { title: 'Red rows', body: 'Rows 1, 3 and 4 are red on slide 16 (no legend) — they are the <b>three regulated steps</b> of slide 18: citrate synthase, isocitrate DH, α-KG DH complex.', src: SRC('16, 18') });
    grid.append(no);
    r.c.forEach((cell) => {
      const box = h('div', { style: `padding:12px 16px;border-radius:16px;background:${bg};border:1px solid ${bd};font-size:26px;font-weight:540;line-height:1.25;display:flex;align-items:center;flex-wrap:wrap;min-height:62px` });
      if (typeof cell === 'string') box.innerHTML = cell;
      else {
        const q = h('span', { style: `display:inline-grid;place-items:center;min-width:52px;height:40px;padding:0 14px;border-radius:99px;font-weight:800;color:var(--ink);background:${tint(ACC, 16)};border:1px dashed ${tint(ACC, 70)};cursor:pointer`, text: '?' });
        const ans = h('span', { style: 'color:var(--ink);font-weight:650;display:none', html: cell.a });
        box.append(q, ans);
        tip(box, { kicker: 'Answer key', title: 'Blank on slide 16', body: 'Filled from the textbook (Lippincott Ch 9); consistent with slides 14 and 18.', src: SRC(16) });
        const b = { q, ans, g: cell.g, open: false };
        const set = (on) => { b.open = on; q.style.display = on ? 'none' : ''; ans.style.display = on ? 'inline' : 'none'; if (on) gsap.fromTo(ans, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45 }); };
        b.set = set;
        box.addEventListener('click', () => set(!b.open));
        blanks.push(b);
      }
      grid.append(box);
    });
  });
  el.append(grid);
  return { step: (n) => blanks.forEach((b) => { const want = n >= b.g; if (want !== b.open) b.set(want); }) };
}

// 16 · Energy per acetyl CoA
function energyViz(el) {
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.justifyContent = 'center';
  el.style.gap = '34px';
  let po = 'cur';
  const big = h('div', { style: 'font:760 230px var(--font);letter-spacing:-.06em;line-height:.9;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent', text: '10' });
  const bigK = h('div', { style: 'font-size:32px;color:var(--fg-2);margin-top:4px', html: 'ATP per acetyl CoA · one turn' });
  const bars = h('div', { style: 'display:grid;gap:18px' });
  const row = (label, col) => {
    const fill = h('div', { style: `height:100%;width:0;border-radius:14px;background:${col};transition:width .8s var(--ease)` });
    const val = h('div', { style: 'font:700 32px var(--font);text-align:right;font-variant-numeric:tabular-nums' });
    bars.append(h('div', { style: 'display:grid;grid-template-columns:270px 1fr 90px;align-items:center;gap:20px' }, [h('div', { style: 'font-size:28px;color:var(--fg-2)', html: label }), h('div', { style: 'height:44px;border-radius:14px;background:var(--surface-2);overflow:hidden' }, [fill]), val]));
    return { fill, val };
  };
  const rN = row('3 NADH', 'var(--nadh)');
  const rF = row('1 FADH₂', 'var(--fadh)');
  const rG = row('1 GTP (SLP)', 'var(--atp)');
  const note = h('div', { style: 'font-size:24px;color:var(--fg-3)' });
  const update = () => {
    const n = po === 'cur' ? 2.5 : 3, f = po === 'cur' ? 1.5 : 2;
    const tot = 3 * n + f + 1;
    countTo(big, tot, { from: +big.textContent || 0, duration: 0.9 });
    rN.fill.style.width = `${(3 * n / 9) * 100}%`; rN.val.textContent = String(3 * n);
    rF.fill.style.width = `${(f / 9) * 100}%`; rF.val.textContent = String(f);
    rG.fill.style.width = `${(1 / 9) * 100}%`; rG.val.textContent = '1';
    note.innerHTML = `Each NADH ≈ ${n} ATP · each FADH₂ ≈ ${f} ATP (oxidative phosphorylation). GTP ≈ 1 ATP.`;
  };
  const sP = seg({ options: [{ v: 'cur', t: 'Current values (2.5 / 1.5)' }, { v: 'old', t: 'Older values (3 / 2)' }], value: 'cur', onChange: (v) => { po = v; update(); } });
  tip(sP.el, { title: 'Which numbers?', body: 'The TCA slides give no ATP numbers. Current P/O values are 2.5 per NADH and 1.5 per FADH₂ (→ 10); the older values 3 and 2 (→ 12) were quoted in L.11 (glycolysis, slide 10). State the convention you use.', src: 'Lippincott · L.11 slide 10' });
  el.append(h('div', { style: 'display:flex' }, [sP.el]), h('div', {}, [big, bigK]), bars, note);
  update();
  return {};
}

// 17 · Critical thinking: ATP from one glucose
function glucoseYieldViz(el) {
  el.style.display = 'grid';
  el.style.gridTemplateRows = '1fr auto';
  el.style.gap = '26px';
  let po = 'cur', sh = 'mas';
  const row = h('div', { style: 'display:grid;grid-template-columns:1fr 44px 1fr 44px 1fr 44px 1.08fr;align-items:stretch' });
  const op = (t) => h('div', { style: 'display:grid;place-items:center;font:300 60px var(--font);color:var(--fg-3)', text: t });
  const card = (k, title, chips, total) => {
    const val = h('div', { style: `font:760 ${total ? 140 : 100}px var(--font);letter-spacing:-.05em;line-height:.9;${total ? 'background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent' : 'color:var(--fg)'}`, text: '0' });
    const chipBox = h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
    const c = h('div', { style: `position:relative;border-radius:32px;padding:32px 30px;background:var(--surface);border:1px solid ${total ? tint(ACC, 50) : 'var(--line)'};display:flex;flex-direction:column;gap:16px;overflow:hidden` }, [
      h('div', { style: 'font-size:22px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--ink)', html: k }),
      h('div', { style: 'font-size:38px;font-weight:680;letter-spacing:-.02em', html: title }),
      chipBox,
      h('div', { style: 'margin-top:auto;display:flex;align-items:baseline;gap:14px' }, [val, h('div', { style: 'font-size:28px;color:var(--fg-2);font-weight:600', text: 'ATP' })]),
    ]);
    chips.forEach((ch) => chipBox.append(h('span', { style: `font-size:24px;font-weight:650;padding:6px 14px;border-radius:99px;color:${ch[1]};background:${tint(ch[1], 14)};border:1px solid ${tint(ch[1], 45)}`, html: ch[0] })));
    return { c, val };
  };
  const cG = card('Cytosol', 'Glycolysis', [['2 ATP (net)', 'var(--atp)'], ['2 NADH', 'var(--nadh)']]);
  const cP = card('Matrix · ×2', 'PDH', [['2 NADH', 'var(--nadh)'], ['2 CO₂', 'var(--co2)']]);
  const cT = card('Matrix · 2 turns', 'TCA cycle', [['6 NADH', 'var(--nadh)'], ['2 FADH₂', 'var(--fadh)'], ['2 GTP', 'var(--atp)'], ['4 CO₂', 'var(--co2)']]);
  const cS = card('Total', 'Per glucose', [['10 NADH', 'var(--nadh)'], ['2 FADH₂', 'var(--fadh)'], ['4 ATP/GTP', 'var(--atp)']], true);
  const ops = [op('+'), op('+'), op('=')];
  row.append(cG.c, ops[0], cP.c, ops[1], cT.c, ops[2], cS.c);
  tip(cG.c, { title: 'Cytosolic NADH', body: 'Its value depends on the shuttle into mitochondria: malate–aspartate keeps it as NADH (2.5), glycerol-3-phosphate delivers it as FADH₂ (1.5).', src: 'Lippincott · L.11' });
  const note = h('div', { style: 'font-size:24px;color:var(--fg-3);margin-top:-6px' });
  const update = () => {
    const n = po === 'cur' ? 2.5 : 3, f = po === 'cur' ? 1.5 : 2;
    const gly = 2 + 2 * (sh === 'mas' ? n : f), pdh = 2 * n, tca = 2 * (3 * n + f + 1);
    [[cG, gly], [cP, pdh], [cT, tca], [cS, gly + pdh + tca]].forEach(([c, v]) => countTo(c.val, v, { from: +c.val.textContent || 0, duration: 0.8 }));
    note.innerHTML = `Assumes NADH ≈ ${n}, FADH₂ ≈ ${f} ATP · ${sh === 'mas' ? 'malate–aspartate' : 'glycerol-3-phosphate'} shuttle for the 2 cytosolic NADH.`;
  };
  const sP = seg({ options: [{ v: 'cur', t: 'NADH 2.5 · FADH₂ 1.5' }, { v: 'old', t: 'NADH 3 · FADH₂ 2' }], value: 'cur', onChange: (v) => { po = v; update(); } });
  const sS = seg({ options: [{ v: 'mas', t: 'Malate–aspartate' }, { v: 'g3p', t: 'Glycerol-3-P shuttle' }], value: 'mas', onChange: (v) => { sh = v; update(); } });
  const bottom = h('div', { style: 'display:flex;align-items:center;gap:22px;flex-wrap:wrap' }, [sP.el, sS.el, note]);
  el.append(row, bottom);
  update();
  const parts = [cG.c, cP.c, cT.c, cS.c];
  return {
    step: (n) => {
      parts.forEach((p, i) => gsap.to(p, { opacity: n > i ? 1 : 0.12, y: n > i ? 0 : 14, duration: 0.6, ease: 'expo.out' }));
      ops.forEach((o, i) => gsap.to(o, { opacity: n > i + 1 ? 1 : 0.15, duration: 0.5 }));
    },
  };
}

// 18 · TCA regulation control panel
function tcaRegViz(el) {
  const D = diagram(el, 1712, 720);
  const X = 760;
  const ST = [
    { id: 'in', y: 40, label: 'Acetyl CoA + oxaloacetate' },
    { id: 'cs', y: 135, label: 'Citrate synthase', enz: true, regs: 'Inhibited: ATP, NADH, succinyl CoA, citrate · Activated: ADP' },
    { id: 'cit', y: 230, label: 'Citrate → isocitrate' },
    { id: 'icdh', y: 325, label: 'Isocitrate dehydrogenase', sub: 'rate-limiting', enz: true, regs: 'Inhibited: NADH, ATP · Activated: Ca²⁺, ADP · rate-limiting (Lippincott)' },
    { id: 'akg', y: 420, label: 'α-Ketoglutarate' },
    { id: 'akgdh', y: 515, label: 'α-KG dehydrogenase complex', enz: true, regs: 'Inhibited: NADH, ATP, succinyl CoA · Activated: Ca²⁺' },
    { id: 'sca', y: 610, label: 'Succinyl CoA → … → OAA' },
  ];
  D.layers.edges.append(s('path', { d: `M${X},40 L${X},610`, style: 'fill:none;stroke:var(--line-2);stroke-width:5;stroke-linecap:round' }));
  const nodes = {};
  ST.forEach((st) => {
    nodes[st.id] = solid(D.node({ id: st.id, x: X, y: st.y, label: st.label, sub: st.sub, kind: st.enz ? 'enz' : 'mol', size: st.enz ? 28 : 25, color: st.enz ? ACC : undefined, tip: st.enz ? { kicker: 'Regulated step', title: st.label, body: st.regs, src: `${SRC(18)} · ${LIP}` } : undefined }));
  });
  const flowPath = s('path', { d: `M${X},40 L${X},610`, style: 'fill:none;stroke:none' });
  D.layers.fx.append(flowPath);
  D.text(330, 72, 'INHIBITORS', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--inh)' });
  D.text(1190, 72, 'ACTIVATORS', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.16em;font-weight:700;fill:var(--act)' });
  const EFF = [
    { id: 'atp', t: 'ATP', eff: -1, x: 330, y: 160, targets: ['cs', 'icdh', 'akgdh'] },
    { id: 'nadh', t: 'NADH', eff: -1, x: 330, y: 280, targets: ['cs', 'icdh', 'akgdh'] },
    { id: 'sca', t: 'Succinyl CoA', eff: -1, x: 330, y: 400, targets: ['cs', 'akgdh'] },
    { id: 'cit', t: 'Citrate', eff: -1, x: 330, y: 520, targets: ['cs'] },
    { id: 'adp', t: 'ADP', eff: 1, x: 1190, y: 200, targets: ['cs', 'icdh'] },
    { id: 'ca', t: 'Ca^{2+}', eff: 1, x: 1190, y: 460, targets: ['icdh', 'akgdh'] },
  ];
  const on = new Set();
  const effEls = EFF.map((e) => {
    const col = e.eff > 0 ? 'var(--act)' : 'var(--inh)';
    const chip = svgChip(D, e.x, e.y, `${e.eff > 0 ? '+' : '−'} ${e.t}`, col, 250);
    const lines = e.targets.map((tid) => {
      const n = nodes[tid];
      const tx = X + (e.eff > 0 ? 1 : -1) * (n.w0 / 2 + 12);
      const x0 = e.x + (e.eff > 0 ? -1 : 1) * (125 + 6);
      const dx = (tx - x0) * 0.45;
      const a = D.arrow({ d: `M${x0},${e.y} C${x0 + dx},${e.y} ${tx - dx},${n.y} ${tx},${n.y}`, from: [x0, e.y], to: [tx, n.y], color: col, width: 3.5, kind: e.eff < 0 ? 'inh' : undefined, headSize: 14 });
      a.g.style.opacity = 0.1;
      return a;
    });
    const names = e.targets.map((tid) => ({ cs: 'citrate synthase', icdh: 'isocitrate DH', akgdh: 'α-KG DH complex' })[tid]);
    chip.g.setAttribute('data-tip', JSON.stringify({ title: `${e.eff > 0 ? 'Activates' : 'Inhibits'}`, body: `<b>${names.join(', ')}</b><br><span style="color:var(--fg-3)">Click to toggle</span>`, src: SRC(18) }));
    chip.g.addEventListener('click', () => { on.has(e.id) ? on.delete(e.id) : on.add(e.id); recompute(); });
    return { e, chip, lines };
  });
  // flux gauge
  D.text(1555, 214, 'CYCLE FLUX', { anchor: 'middle', cls: 'sm', style: 'letter-spacing:.14em;font-weight:700;fill:var(--fg-3)' });
  const big = D.text(1555, 334, '100%', { anchor: 'middle', style: 'font-size:104px;font-weight:740;letter-spacing:-.04em;fill:var(--fg)' });
  D.layers.labels.append(s('rect', { x: 1425, y: 372, width: 260, height: 24, rx: 12, style: 'fill:var(--surface-3)' }));
  const bar = s('rect', { x: 1425, y: 372, width: 130, height: 24, rx: 12, style: 'fill:var(--a1);transition:width .7s var(--ease), fill .5s' });
  D.layers.labels.append(bar);
  D.text(1555, 438, 'schematic', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-3);font-size:22px' });
  let fl = D.flow(flowPath, { count: 6, color: ACC, speed: 110, r: 10 });
  const val = { v: 100 };
  function recompute() {
    const act = { cs: 1, icdh: 1, akgdh: 1 };
    effEls.forEach(({ e, chip, lines }) => {
      const o = on.has(e.id);
      chip.set(o);
      lines.forEach((l) => gsap.to(l.g, { opacity: o ? 1 : 0.1, duration: 0.4 }));
      if (o) e.targets.forEach((t) => (act[t] *= e.eff > 0 ? 1.6 : 0.45));
    });
    ['cs', 'icdh', 'akgdh'].forEach((k) => {
      const f = act[k];
      const col = f > 1.05 ? 'var(--act)' : f < 0.95 ? 'var(--inh)' : ACC;
      nodes[k].shape.style.stroke = col;
      nodes[k].shape.style.fill = tint(col, f > 1.05 || f < 0.95 ? 26 : 16);
    });
    const flux = Math.max(0.08, Math.min(2, Math.min(act.cs, act.icdh, act.akgdh)));
    const pct = Math.round(flux * 100);
    gsap.to(val, { v: pct, duration: 0.8, ease: 'power3.out', onUpdate: () => { big.textContent = `${Math.round(val.v)}%`; } });
    bar.setAttribute('width', Math.max(8, 1.3 * pct));
    bar.style.fill = pct > 105 ? 'var(--act)' : pct < 95 ? 'var(--inh)' : 'var(--a1)';
    fl.destroy();
    fl = D.flow(flowPath, { count: Math.max(2, Math.round(6 * Math.min(1.6, flux))), color: pct < 95 ? 'var(--inh)' : pct > 105 ? 'var(--act)' : ACC, speed: Math.max(22, 110 * flux), r: 10 });
  }
  const preset = seg({ options: [{ v: 'base', t: 'Reset' }, { v: 'rest', t: 'Energy-rich' }, { v: 'ex', t: 'Exercise' }], value: 'base', onChange: (v) => { on.clear(); if (v === 'rest') ['atp', 'nadh'].forEach((k) => on.add(k)); if (v === 'ex') ['adp', 'ca'].forEach((k) => on.add(k)); recompute(); } });
  ctrlBar(el, [preset], { right: 0, bottom: 0 });
  tip(preset.el, { title: 'Scenarios', body: '<b>Energy-rich</b>: ATP and NADH high → all three valves close.<br><b>Exercise</b>: ADP and Ca²⁺ rise in contracting muscle → valves open.', src: `${SRC(18)} · ${LIP}` });
  recompute();
  return { leave: () => fl.pause(), enter: () => fl.play(), destroy: () => { fl.destroy(); D.destroy(); } };
}

// 19, 21 · MCQ reveal
function mcqViz(el, q) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = q.wide ? '760px 1fr' : '660px 1fr';
  el.style.gap = '48px';
  const card = h('div.case', { style: 'display:flex;flex-direction:column;justify-content:center;padding:48px 52px' }, [
    h('div.tag', { html: `● ${q.tag}` }),
    h('p', { style: `font-size:${q.fs || 36}px`, html: q.stem }),
  ]);
  if (q.labs) card.append(h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;margin-top:26px' }, q.labs.map((l) => h('span.chip.inh', { style: 'font-size:27px', text: l }))));
  const list = h('div', { style: 'display:grid;gap:14px;align-content:center' });
  const rows = q.options.map((op, i) => {
    const ok = i === q.answer;
    const badge = h('div', { style: 'width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font:700 26px var(--font);border:2px solid var(--line-2);flex:none;transition:all .4s', text: 'abcde'[i] });
    const why = h('div', { style: 'font-size:25px;color:var(--fg-2);line-height:1.3;opacity:0;height:0;overflow:hidden', html: op.why });
    const r = h('div', { style: 'display:flex;gap:22px;align-items:flex-start;padding:16px 26px;border-radius:24px;background:var(--surface);border:1px solid var(--line);cursor:pointer;transition:background .4s, border-color .4s, opacity .4s' }, [badge, h('div', { style: 'padding-top:6px' }, [h('div', { style: 'font-size:31px;font-weight:620;letter-spacing:-.01em', html: op.t }), why])]);
    r.addEventListener('click', () => reveal(!revealed));
    list.append(r);
    return { r, badge, why, ok };
  });
  let revealed = false;
  function reveal(on) {
    revealed = on;
    rows.forEach(({ r, badge, why, ok }) => {
      r.style.background = on && ok ? tint('var(--act)', 14) : 'var(--surface)';
      r.style.borderColor = on && ok ? tint('var(--act)', 60) : 'var(--line)';
      r.style.opacity = on && !ok ? 0.72 : 1;
      badge.style.background = on && ok ? 'var(--act)' : 'transparent';
      badge.style.borderColor = on ? (ok ? 'var(--act)' : tint('var(--inh)', 50)) : 'var(--line-2)';
      badge.style.color = on && ok ? '#fff' : on ? 'var(--inh)' : 'var(--fg)';
      badge.textContent = on ? (ok ? '✓' : '✕') : badge.dataset.l || badge.textContent;
      gsap.to(why, { opacity: on ? 1 : 0, height: on ? 'auto' : 0, marginTop: on ? 6 : 0, duration: 0.5, ease: 'power2.out' });
    });
  }
  rows.forEach(({ badge }, i) => (badge.dataset.l = 'abcde'[i]));
  el.append(card, list);
  return { step: (n) => reveal(n >= 1) };
}

// 20 · Amphibolic hub: drain (biosynthesis) and refill (anaplerosis)
function hubViz(el) {
  const D = diagram(el, 1712, 720);
  const CX = 890, CY = 405, RX = 285, RY = 195;
  const DR = ACC, RF = 'var(--act)';
  D.layers.edges.append(s('ellipse', { cx: CX, cy: CY, rx: RX, ry: RY, style: `fill:${tint('var(--atp)', 6)};stroke:${tint('var(--atp)', 28)};stroke-width:38` }));
  const spin = s('ellipse', { cx: CX, cy: CY, rx: RX, ry: RY, style: 'fill:none;stroke:var(--atp);stroke-width:3;stroke-dasharray:14 26;opacity:.55' });
  D.layers.edges.append(spin);
  const spinT = gsap.to(spin, { attr: { 'stroke-dashoffset': -400 }, duration: 9, repeat: -1, ease: 'none' });
  const IM = ['Oxaloacetate', 'Citrate', 'Isocitrate', 'α-Ketoglutarate', 'Succinyl CoA', 'Succinate', 'Fumarate', 'Malate'];
  const IDS = ['oaa', 'cit', 'iso', 'akg', 'sca', 'suc', 'fum', 'mal'];
  IM.forEach((t, i) => {
    const a = ((-90 + 45 * i) * Math.PI) / 180;
    D.node({ id: IDS[i], x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a), label: t, kind: 'mol', size: 24, fill: 'var(--bg-2)' });
  });
  // centre: ATP via ETC
  D.layers.nodes.append(s('circle', { cx: CX, cy: CY - 12, r: 60, style: `fill:${tint('var(--atp)', 22)};stroke:var(--atp);stroke-width:3` }));
  D.text(CX, CY, 'ATP', { anchor: 'middle', style: 'font-size:38px;font-weight:760;fill:var(--atp)' });
  D.text(CX, CY + 86, 'via NADH, FADH₂ → ETC', { anchor: 'middle', cls: 'sm', style: 'fill:var(--fg-2)', tip: { title: 'Catabolic role', body: 'Reduced coenzymes from the cycle feed the ETC (slide 17: cycle → ETC) — the final common pathway for oxidising fuels.', src: SRC('13, 17') } });
  // outer nodes
  const N = (id, x, y, label, col, tp) => D.node({ id, x, y, label, kind: 'box', size: 25, color: col, tip: tp });
  N('glc', 140, 56, 'Glucose', 'var(--elec)');
  N('pyr', 470, 56, 'Pyruvate', 'var(--fg-2)');
  N('acoa', CX, 56, 'Acetyl CoA', ACC);
  N('ala', 210, 196, 'Alanine', 'var(--fg-2)', { title: 'Alanine', body: 'Pyruvate ⇄ alanine by Ala transaminase (5). Explains ↑ alanine in PDH deficiency.', src: SRC('8, 17') });
  N('gng', 205, 340, 'Gluconeogenesis', DR, { title: 'Gluconeogenesis', body: 'Oxaloacetate is the starting point for making new glucose.', src: SRC(17) });
  N('asp', 1300, 118, 'Aspartate', DR);
  N('prot1', 1575, 118, 'Proteins', DR);
  N('lip', 1480, 272, 'Fatty acids', DR, { title: 'Lipid synthesis', body: 'Citrate leaves the mitochondrion to supply acetyl CoA for fatty acid synthesis. (Slide 17 also links acetyl CoA ⇄ lipid synthesis.)', src: SRC(17) });
  N('glu', 1408, 543, 'Glutamate', DR);
  N('prot2', 1622, 392, 'Proteins', DR);
  N('heme', 640, 686, 'Heme', DR, { title: 'Heme synthesis', body: 'Succinyl CoA (+ glycine) is the starting point of heme synthesis (spelled “Heam” on slide 17).', src: SRC(17) });
  N('prop', 1075, 686, 'Propionyl CoA', RF, { title: 'Propionyl CoA → succinyl CoA', body: 'From odd-chain fatty acids and some amino acids. Physiologically one-way into the cycle (via methylmalonyl CoA); slide 17 draws ⇄.', src: `${SRC(17)} · textbook` });
  // base arrows
  D.arrow({ from: 'glc', to: 'pyr', width: 3.5, color: 'var(--fg-3)', label: 'glycolysis', labelSide: -1, labelOffset: 24, labelColor: 'var(--fg-3)' });
  D.arrow({ from: 'pyr', to: 'acoa', width: 3.5, color: 'var(--fg-3)', label: 'PDH', labelSide: -1, labelOffset: 24, labelColor: 'var(--fg-3)' });
  D.arrow({ from: 'acoa', to: 'oaa', width: 4, color: ACC });
  D.arrow({ from: 'pyr', to: 'ala', width: 3, color: 'var(--fg-3)', curve: 14 });
  D.arrow({ from: 'ala', to: 'pyr', width: 3, color: 'var(--fg-3)', curve: 14 });
  // mode arrows
  const mk = (from, to, col, o = {}) => D.arrow({ from, to, width: 5, color: col, ...o });
  const drain = [
    mk('oaa', 'gng', DR, { curve: 125 }),
    mk('cit', 'lip', DR),
    mk('oaa', 'asp', DR, { curve: 16 }),
    mk('asp', 'prot1', DR),
    mk('akg', 'glu', DR, { curve: 14 }),
    mk('glu', 'prot2', DR),
    mk('sca', 'heme', DR),
  ];
  const refill = [
    mk('pyr', 'oaa', RF),
    mk('pyr', 'mal', RF),
    mk('asp', 'oaa', RF, { curve: 16 }),
    mk('glu', 'akg', RF, { curve: 14 }),
    mk('prop', 'sca', RF),
  ];
  const M = [
    { n: 1, x: 655, y: 120, set: 'refill', t: 'Pyruvate carboxylase', b: 'Pyruvate → oxaloacetate. The major anaplerotic reaction (Lippincott: biotin-dependent, activated by acetyl CoA).' },
    { n: 2, x: 548, y: 168, set: 'refill', t: 'Malic enzyme', b: 'Pyruvate ⇄ malate. Drawn as a refill on slide 17; in many tissues it mainly runs malate → pyruvate (making NADPH).' },
    { n: 3, x: 1100, y: 120, set: 'both', t: 'Asp transaminase (AST)', b: 'Oxaloacetate ⇄ aspartate — out for protein synthesis, back in as a refill.' },
    { n: 4, x: 1268, y: 500, set: 'both', t: 'Glu dehydrogenase', b: 'α-Ketoglutarate ⇄ glutamate — out for protein synthesis, back in as a refill.' },
    { n: 5, x: 380, y: 140, set: 'base', t: 'Ala transaminase (ALT)', b: 'Pyruvate ⇄ alanine (reversible; slide 17 draws pyruvate → alanine).' },
  ];
  const marks = M.map((m) => {
    const g = s('g', { transform: `translate(${m.x} ${m.y})`, 'data-tip': JSON.stringify({ kicker: `Enzyme ${m.n} · slide 17`, title: m.t, body: m.b, src: SRC(17) }) });
    g.append(s('circle', { r: 21, style: 'fill:var(--fg);stroke:var(--bg);stroke-width:3' }));
    const t = s('text', { y: 8, 'text-anchor': 'middle', style: 'font:800 22px var(--font);fill:var(--bg)' });
    t.textContent = m.n;
    g.append(t);
    D.layers.labels.append(g);
    return { g, m };
  });
  const flows = { drain: drain.map((a) => D.flow(a, { count: 2, color: DR, speed: 130, r: 8, autoplay: false })), refill: refill.map((a) => D.flow(a, { count: 2, color: RF, speed: 130, r: 8, autoplay: false })) };
  const legend = D.text(20, 712, '', { style: 'font-size:25px;font-weight:620;fill:var(--fg-2)' });
  function set(mode) {
    const dOn = mode === 'drain' || mode === 'both', rOn = mode === 'refill' || mode === 'both';
    drain.forEach((a) => gsap.to(a.g, { opacity: dOn ? 1 : 0.06, duration: 0.5 }));
    refill.forEach((a) => gsap.to(a.g, { opacity: rOn ? 1 : 0.06, duration: 0.5 }));
    ['lip', 'prot1', 'prot2', 'heme', 'gng'].forEach((id) => gsap.to(D.nodes[id].g, { opacity: dOn ? 1 : 0.3, duration: 0.5 }));
    ['asp', 'glu'].forEach((id) => gsap.to(D.nodes[id].g, { opacity: dOn || rOn ? 1 : 0.3, duration: 0.5 }));
    gsap.to(D.nodes.prop.g, { opacity: rOn ? 1 : 0.3, duration: 0.5 });
    marks.forEach(({ g, m }) => gsap.to(g, { opacity: m.set === 'base' ? 1 : m.set === 'both' ? (dOn || rOn ? 1 : 0.3) : rOn ? 1 : 0.2, duration: 0.5 }));
    flows.drain.forEach((f) => (dOn ? f.play() : f.hide()));
    flows.refill.forEach((f) => (rOn ? f.play() : f.hide()));
    setRich(legend, mode === 'drain' ? 'Drain: intermediates leave for biosynthesis' : mode === 'refill' ? 'Refill: anaplerotic reactions top the cycle up' : mode === 'both' ? 'Amphibolic: catabolic and anabolic at once' : 'The cycle: final common pathway → ATP');
    legend.style.fill = mode === 'refill' ? 'var(--act)' : mode === 'cycle' ? 'var(--fg-2)' : 'var(--ink)';
  }
  const sg = seg({ options: [{ v: 'cycle', t: 'Cycle' }, { v: 'drain', t: 'Drain' }, { v: 'refill', t: 'Refill' }, { v: 'both', t: 'Both' }], value: 'cycle', onChange: set });
  ctrlBar(el, [sg], { right: 0, bottom: 0 });
  set('cycle');
  return {
    step: (n) => sg.set(['cycle', 'drain', 'refill', 'both'][n]),
    leave: () => { spinT.pause(); flows.drain.concat(flows.refill).forEach((f) => f.pause()); },
    enter: () => spinT.play(),
    destroy: () => { spinT.kill(); D.destroy(); },
  };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */
export default {
  references: [
    'Lippincott Illustrated Reviews: Biochemistry — Ch 9 Tricarboxylic Acid Cycle and Pyruvate Dehydrogenase Complex',
    'Lecture slides: PDH complex & TCA cycle (L.12–L.13), NUST College of Medicine',
  ],
  slides: [
    {
      layout: 'hero',
      eyebrow: 'Biochemistry · L.12 – L.13',
      title: 'Citric acid <em>cycle</em>',
      subtitle: 'The bridge from glycolysis — and the hub of metabolism.',
      meta: ['TCA · Krebs cycle', 'PDH complex', 'Mitochondrial matrix'],
      src: 'Lecture slide 1 · real 3D structure (PubChem)',
      notes: [
        'Three names, one pathway: citric acid cycle = tricarboxylic acid (TCA) cycle = Krebs cycle (after Hans Krebs; the slide writes “Kreb’s”).',
        'The model is a real 3D structure of citric acid. The three glowing carbons are its three carboxyl groups — hence “tri-carboxylic”.',
        'Two parts today: Part 1 “The bridge” (PDH complex) and Part 2 “The inside” (the cycle: reactions, regulation, energetics).',
      ],
      visual: heroViz,
    },
    {
      layout: 'full',
      eyebrow: 'Session learning outcomes',
      title: 'By the end, you can…',
      src: 'Lecture slides 2, 12 · hover for the full wording',
      notes: [
        'Part 1 (L.12.1–12.4): PDH complex — role, location, tissues; comparison with α-KG DH and branched-chain α-keto acid DH; thiamine deficiency; thiamine before glucose.',
        'Part 2 (L.13.1–13.3): TCA steps, energetics and regulation; its central role linking pathways; intermediates as biosynthetic precursors.',
        'Note: PDH regulation and the vitamin sources are named in SLO L.12.2 but not shown on the slides — this deck adds them from Lippincott and labels them as such.',
      ],
      visual: sloViz,
    },
    {
      layout: 'full',
      eyebrow: 'Part 1 · The bridge',
      title: 'The <em>bridge</em> into the cycle',
      bullets: [{ t: 'Glycolysis · cytosol' }, { t: 'PDH & TCA · matrix' }],
      steps: 3,
      src: 'Lecture slides 3–4, 14 · slide 3 wording corrected: glycolysis is cytosolic',
      notes: [
        'With oxygen, pyruvate goes on to the second stage of cellular respiration — the citric acid cycle. Its entry point is acetyl CoA (slide 3).',
        'Build 1 — pyruvate made in the cytosol must first enter the mitochondrial matrix (carrier drawn as a channel on slide 14).',
        'Build 2 — the PDH complex is the bridge (slide 4): pyruvate (3C) → acetyl CoA (2C); one carbon leaves as CO₂, NAD⁺ is reduced to NADH.',
        'Build 3 — acetyl CoA enters the TCA cycle.',
        'Accuracy: slide 3 says glycolysis enzymes occur in the matrix — glycolysis is cytosolic (as slide 14 itself shows); only PDH is in the matrix.',
      ],
      visual: bridgeViz,
    },
    {
      eyebrow: 'Part 1 · PDH complex',
      title: '<em>3</em> enzymes, <em>5</em> coenzymes',
      bullets: [
        { t: '<b>E1</b> · decarboxylase', tip: { kicker: 'E1 · TPP', title: 'Pyruvate decarboxylase', body: 'Removes CO₂ from pyruvate using thiamine pyrophosphate.', src: `${SRC(5)} · ${LIP}` } },
        { t: '<b>E2</b> · transacetylase', tip: { kicker: 'E2 · lipoic acid, CoA', title: 'Dihydrolipoyl transacetylase', body: 'Core of the complex. Moves the acetyl group onto CoA.', src: `${SRC(5)} · ${LIP}` } },
        { t: '<b>E3</b> · dehydrogenase', tip: { kicker: 'E3 · FAD, NAD⁺', title: 'Dihydrolipoyl dehydrogenase', body: 'Re-oxidises lipoamide; electrons go FAD → NAD⁺ → NADH.', src: `${SRC(5)} · ${LIP}` } },
        { t: 'Catalyzes <b>oxidative decarboxylation</b>', tip: 'Pyruvate loses CO₂ (decarboxylation) and is oxidised; NAD⁺ is reduced to NADH.' },
      ],
      steps: 3,
      focus: true,
      src: 'Lecture slide 5 · schematic 3D model (E2 core, E1/E3 around it, gold = lipoyl arms), not to scale',
      notes: [
        'PDH is a multi-enzyme complex: 3 enzymes and 5 coenzymes (the slide mascot has 3 heads and 5 limbs).',
        'Build 1 — E1, pyruvate decarboxylase (orange), uses TPP.',
        'Build 2 — E2, dihydrolipoyl transacetylase (teal), forms the core; its lipoyl arms (gold) swing between the enzymes.',
        'Build 3 — E3, dihydrolipoyl dehydrogenase (purple), uses FAD and NAD⁺.',
        'Physical association means intermediates pass from enzyme to enzyme without being released (Lippincott).',
      ],
      visual: pdhComplexViz,
    },
    {
      eyebrow: 'Part 1 · Reactants & products',
      title: 'Pyruvate → <em>acetyl CoA</em>',
      bullets: [
        { t: '<b>3C</b> in → <b>2C</b> out + CO₂', tip: 'Pyruvate (3C) → acetyl CoA (2C); the third carbon leaves as CO₂.' },
        { t: 'NAD⁺ reduced to <b>NADH</b>' },
        { t: 'In the mitochondrial <b>matrix</b>' },
        { t: 'All tissues with <b>mitochondria</b>', tip: 'Especially kidneys, brain and heart (slide 6). RBCs, which lack mitochondria, have no PDH.' },
      ],
      src: 'Lecture slides 3, 5–6 · RBC point: Lippincott',
      notes: [
        'Slide 6 diagram: pyruvate (3C) → PDH complex (with TPP, lipoic acid, CoA, FAD, NAD) → acetyl CoA (2C) + CO₂ + NADH.',
        'Reaction type: oxidative decarboxylation. Irreversible (Lippincott) — so acetyl CoA cannot be turned back into pyruvate.',
        'Location: mitochondrial matrix. Tissues: all mammalian tissues that contain mitochondria, especially kidneys, brain and heart.',
        'Hover each coenzyme tag for its enzyme and vitamin.',
      ],
      visual: reactionViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Part 1 · Five coenzymes · mnemonic',
      title: '<em>T</em>ender <em>L</em>oving <em>C</em>are <em>F</em>or <em>N</em>obody',
      cards: [
        { k: 'Tender', big: 'T', title: 'TPP', body: 'Vitamin B₁ · thiamine', list: ['Decarboxylates pyruvate'], viz: (v) => enzymeDots(v, ['E1'], CO.TPP), style: 'padding:36px 32px', tip: { kicker: 'E1', title: 'Thiamine pyrophosphate', body: 'From <b>thiamine (B₁)</b>. On E1: decarboxylates pyruvate.', src: `${SRC(5)} · vitamin per ${LIP}` } },
        { k: 'Loving', big: 'L', title: 'Lipoic acid', body: 'Not a vitamin', list: ['Swinging arm carries acetyl'], viz: (v) => enzymeDots(v, ['E2'], CO.LIP), style: 'padding:36px 32px', tip: { kicker: 'E2', title: 'Lipoic acid (lipoamide)', body: 'Bound to a lysine of E2 — the swinging arm that carries the acetyl group. The only PDH coenzyme <b>not</b> derived from a vitamin.', src: `${SRC(5)} · ${LIP}` } },
        { k: 'Care', big: 'C', title: 'CoA', body: 'Vitamin B₅ · pantothenic acid', list: ['Accepts acetyl group'], viz: (v) => enzymeDots(v, ['E2'], CO.CoA), style: 'padding:36px 32px', tip: { kicker: 'E2', title: 'Coenzyme A', body: 'From <b>pantothenic acid (B₅)</b>. Accepts the acetyl group → acetyl CoA.', src: `${SRC(5)} · vitamin per ${LIP}` } },
        { k: 'For', big: 'F', title: 'FAD', body: 'Vitamin B₂ · riboflavin', list: ['Re-oxidises lipoamide'], viz: (v) => enzymeDots(v, ['E3'], CO.FAD), style: 'padding:36px 32px', tip: { kicker: 'E3', title: 'FAD', body: 'From <b>riboflavin (B₂)</b>. Re-oxidises lipoamide (FAD → FADH₂).', src: `${SRC(5)} · vitamin per ${LIP}` } },
        { k: 'Nobody', big: 'N', title: 'NAD⁺', body: 'Vitamin B₃ · niacin', list: ['Ends as NADH'], viz: (v) => enzymeDots(v, ['E3'], CO.NAD), style: 'padding:36px 32px', tip: { kicker: 'E3', title: 'NAD⁺', body: 'From <b>niacin (B₃)</b>. Takes the electrons from FADH₂ → <b>NADH</b>.', src: `${SRC(5)} · vitamin per ${LIP}` } },
      ],
      src: 'Lecture slide 5 · vitamin sources: Lippincott Ch 9 (not on the slides)',
      notes: [
        'Mnemonic from slide 5: tender loving care for nobody = TPP, Lipoic acid, CoA, FAD, NAD⁺.',
        'Vitamins (Lippincott, needed for SLO L.12.2): TPP ← thiamine B₁; CoA ← pantothenic acid B₅; FAD ← riboflavin B₂; NAD⁺ ← niacin B₃. Lipoic acid is not a vitamin.',
        'Enzyme pairing: E1–TPP; E2–lipoic acid + CoA; E3–FAD + NAD⁺.',
        'Clinical hook: thiamine (B₁) deficiency cripples this complex — coming up.',
      ],
    },
    {
      layout: 'full',
      eyebrow: 'Part 1 · How the complex works',
      title: 'The swinging <em>lipoamide</em> arm',
      bullets: [{ t: 'E1 → E2 → E3' }, { t: 'Intermediates never leave' }],
      steps: 4,
      src: 'Mechanism per Lippincott Ch 9 (not detailed on the slides) · schematic',
      notes: [
        'Build 1 — E1 with TPP decarboxylates pyruvate: CO₂ leaves, the 2C unit stays on TPP (hydroxyethyl-TPP).',
        'Build 2 — the lipoamide arm of E2 (lipoic acid on a lysine) swings over, oxidises the 2C unit and carries it as an acetyl group.',
        'Build 3 — E2 transfers the acetyl group to CoA → acetyl CoA leaves; lipoamide is now reduced (SH SH).',
        'Build 4 — E3 re-oxidises the arm: FAD → FADH₂, then FADH₂ passes the electrons to NAD⁺ → NADH. The arm is ready again.',
        'Because the arm visits all three active sites, no intermediate is released — fast and efficient.',
      ],
      visual: armViz,
    },
    {
      layout: 'full',
      eyebrow: 'Part 1 · Regulation (Lippincott)',
      title: 'Switching PDH <em>on</em> and <em>off</em>',
      bullets: [{ t: 'Click any signal' }, { t: 'Kinase off · phosphatase on' }],
      src: 'Lippincott Ch 9 — PDH regulation is not on the lecture slides (SLO L.12.2) · activity schematic',
      notes: [
        'Covalent control: PDH kinase phosphorylates E1 → inactive; PDH phosphatase dephosphorylates → active.',
        'Kinase is activated by ATP, NADH and acetyl CoA (energy-rich, product-rich) → PDH switched off.',
        'Pyruvate inhibits the kinase → PDH stays on when substrate is plentiful.',
        'Ca²⁺ activates the phosphatase — in contracting skeletal muscle this switches PDH on for energy.',
        'Products NADH and acetyl CoA also inhibit PDH directly (product inhibition).',
        'Compare: α-KG DH is regulated allosterically (slide 18), not by phosphorylation.',
      ],
      visual: pdhRegViz,
    },
    {
      layout: 'cards',
      eyebrow: 'Part 1 · PDH look-alikes',
      title: 'PDH complex <em>analogues</em>',
      cards: [
        { k: 'The bridge', title: 'PDH complex', body: 'Pyruvate → acetyl CoA', viz: (v) => complexMini(v, 'pdh'), style: 'padding:36px 34px', tip: { kicker: 'E1 · E2 · E3 · TPP, lipoic acid, CoA, FAD, NAD⁺', title: 'PDH complex', body: 'Regulation: PDH kinase / phosphatase, product inhibition (Lippincott). Deficiency → lactic acidosis (slide 8).', src: SRC('5, 7') } },
        { k: 'TCA cycle', title: 'α-KG DH complex', body: 'α-KG → succinyl CoA', viz: (v) => complexMini(v, 'akg'), style: 'padding:36px 34px', tip: { kicker: 'E1 · E2 · E3 · same 5 coenzymes', title: 'α-Ketoglutarate dehydrogenase complex', body: 'Regulation (slide 18): inhibited by NADH, ATP, succinyl CoA; activated by Ca²⁺. Not regulated by phosphorylation (Lippincott).', src: SRC('7, 18') } },
        { k: 'Amino acid catabolism', title: 'BCKD complex', body: 'Branched-chain α-keto acids', viz: (v) => complexMini(v, 'bckd'), style: 'padding:36px 34px', tip: { kicker: 'E1 · E2 · E3 · same 5 coenzymes', title: 'Branched-chain α-keto acid DH', body: 'Breaks down the α-keto acids of leucine, isoleucine and valine. Its deficiency is maple syrup urine disease (textbook; not on the slides).', src: SRC(7) } },
        { k: 'TCA cycle · contrast', title: 'Isocitrate DH', body: 'Single enzyme · no TPP', viz: (v) => complexMini(v, 'icdh'), style: `padding:36px 34px;border-color:${tint('var(--elec)', 45)}`, tip: { kicker: 'Single enzyme · NAD⁺/NADP⁺', title: 'Isocitrate dehydrogenase', body: 'Also an oxidative decarboxylation, but one enzyme without TPP or lipoate — so not affected by thiamine deficiency. Regulation (slide 18): NADH, ATP ⊖; Ca²⁺, ADP ⊕. The cycle’s isoform uses NAD⁺.', src: `${SRC('7, 18')} · ${LIP}` } },
      ],
      src: 'Lecture slide 7 · regulation from slide 18 and Lippincott',
      notes: [
        'Slide 7 table: α-KG DH complex (TCA cycle) and branched-chain α-keto acid DH complex (branched-chain amino acid catabolism) share PDH’s E1–E2–E3 architecture and all five coenzymes.',
        'Isocitrate DH is listed for contrast: a single enzyme using NAD⁺/NADP⁺ — no TPP, no lipoate.',
        'So thiamine deficiency hits PDH, α-KG DH and BCKD together (slide 9).',
        'Regulation comparison (SLO L.12.2): PDH by kinase/phosphatase (Lippincott); α-KG DH allosterically (NADH, ATP, succinyl CoA ⊖; Ca²⁺ ⊕); BCKD not covered on the slides.',
      ],
    },
    {
      eyebrow: 'Part 1 · Clinical',
      title: 'Thiamine <em>deficiency</em>',
      bullets: [
        { t: 'TPP-dependent <b>α-keto acid DHs</b> fail', tip: { title: 'Which enzymes?', body: '“Thiamin deficiency affects PDH and α-keto acid dehydrogenase complexes” — PDH, α-KG DH and BCKD.', src: SRC(9) } },
        { t: 'Energy failure: <b>heart</b> & <b>brain</b>', tip: 'Catastrophic energy failure that selectively damages tissues with the highest metabolic and glucose demands.' },
        { t: 'Heart → <b>wet beriberi</b>', tip: { title: 'Wet beriberi', body: 'Congestive heart failure (cardiac form of thiamine deficiency).', src: SRC(9) } },
        { t: 'Brain → <b>Wernicke–Korsakoff</b>', tip: { title: 'Wernicke–Korsakoff syndrome', body: 'CNS presentation, mostly in chronic alcoholics: confusion, ataxia, eye signs → memory loss. Slide 9 labels it “dry beriberi”; textbooks define <b>dry beriberi as peripheral neuropathy</b> and list Wernicke–Korsakoff separately.', src: `${SRC(9)} · Lippincott` } },
      ],
      src: 'Lecture slide 9 · beriberi definitions per Lippincott (see hover note)',
      notes: [
        'TPP is the active form of thiamine (B₁). It is the E1 coenzyme of PDH, α-KG DH and BCKD.',
        'Without TPP, pyruvate and α-ketoglutarate cannot be oxidised → energy failure in tissues with the highest metabolic and glucose demand: heart and brain.',
        'Heart → wet beriberi = congestive heart failure.',
        'Brain → Wernicke–Korsakoff syndrome. Accuracy note: the slide calls this “dry beriberi”; standard texts use dry beriberi for peripheral neuropathy and treat Wernicke–Korsakoff as the separate CNS form (classically in alcoholics). For this lecture’s exam, know the slide’s pairing, but understand the textbook distinction.',
        '3D model: real TPP. Gold atoms = thiazolium ring, whose C2 does the chemistry.',
      ],
      visual: tppViz,
    },
    {
      layout: 'statement',
      eyebrow: 'Critical thinking · L.12.4',
      title: 'Why thiamine <em>before</em> glucose?',
      subtitle: 'Glucose loads TPP-dependent PDH. Without thiamine, pyruvate turns to lactate and the brain runs out of ATP.',
      subtitleStep: 1,
      steps: 2,
      src: 'Lecture slide 10 (question) · answer: Lippincott',
      notes: [
        'Slide 10: in chronic alcoholics and malnourished patients, thiamine must be given immediately — with or right before glucose. Ask why before revealing.',
        'Build 1 — glucose alone: glycolysis makes more pyruvate, but PDH (and α-KG DH) lack TPP → pyruvate is diverted to lactate (lactic acidosis); brain and heart cannot make ATP; the last thiamine is used up → Wernicke encephalopathy can be precipitated or worsened.',
        'Build 2 — thiamine first: PDH works again, pyruvate → acetyl CoA → TCA → ATP.',
        'Links SLO L.12.3 to L.12.4.',
      ],
      visual: thiamineGlucoseViz,
    },
    {
      eyebrow: 'Part 1 · Clinical',
      title: 'PDH <em>deficiency</em>',
      bullets: [
        { t: '↑ <b>pyruvate</b>, <b>lactate</b>, <b>alanine</b>', tip: 'Pyruvate backs up and spills into lactate (LDH) and alanine (ALT, enzyme 5 on slide 17).' },
        { t: 'Congenital <b>lactic acidosis</b>', tip: 'A major cause of congenital lactic acidosis in infants and young children (slide 8). Lippincott: most often an X-linked E1 defect.' },
        { t: 'Progressive <b>neurological</b> signs', tip: { title: 'Neurological symptoms', list: ['Developmental delay', 'Hypotonia', 'Poor coordination', 'Seizures'], src: SRC(8) } },
      ],
      steps: 1,
      src: 'Lecture slides 8, 17 · E1 / X-linked detail: Lippincott',
      notes: [
        'Toggle (or press →) to switch PDH off.',
        'Pyruvate cannot cross the bridge → it accumulates and is converted to lactate (LDH) and alanine (Ala transaminase).',
        'Result: elevated blood pyruvate, lactate and alanine; congenital lactic acidosis in infants and young children.',
        'Progressive neurological symptoms — developmental delay, hypotonia, poor coordination, seizures — because the brain depends on glucose oxidation.',
        'Lippincott: most commonly a defect of the E1α subunit (X-linked).',
      ],
      visual: pdhDefViz,
    },
    {
      eyebrow: 'Part 2 · The inside',
      title: 'The final <em>common</em> pathway',
      bullets: [
        { t: 'Oxidizes <b>acetyl CoA → CO₂</b>' },
        { t: 'Second stage of aerobic respiration' },
        { t: 'In the mitochondrial <b>matrix</b>', tip: 'Lippincott: all cycle enzymes are in the matrix except succinate dehydrogenase, which sits in the inner membrane.' },
        { t: '<b>Amphibolic</b>: catabolic and anabolic', tip: 'Dual function: breaks fuels down (catabolic) and supplies precursors for synthesis (anabolic).' },
      ],
      src: 'Lecture slide 13 · 3D schematic',
      notes: [
        'Definition (slide 13): a metabolic pathway that oxidizes acetyl CoA into CO₂ — the second stage of aerobic cellular respiration.',
        'Location: mitochondrial matrix (glowing ring).',
        'Central role: the common pathway for the final oxidation of all metabolic fuels — carbohydrates, fatty acids, amino acids (gold particles).',
        'Grey particles = CO₂ leaving; blue = NADH heading to the electron transport chain in the inner membrane.',
        'Amphibolic: catabolic and anabolic at the same time — we return to this with the hub map.',
      ],
      visual: mitoViz,
    },
    {
      layout: 'full',
      eyebrow: 'Part 2 · Reactions',
      title: 'One turn of the <em>wheel</em>',
      bullets: [{ t: 'Press → to turn' }, { t: 'Click a molecule' }],
      steps: 9,
      src: 'Lecture slides 14, 16 · enzyme names completed per Lippincott (aconitase is unlabelled on slide 14)',
      notes: [
        'Start: acetyl CoA (2C) + oxaloacetate (4C). Each → turns one reaction; products fly into the counters; the right panel shows the real 3D molecule.',
        '1 Citrate synthase — condensation → citrate (6C). 2 Aconitase — isomerization via cis-aconitate → isocitrate.',
        '3 Isocitrate DH — oxidative decarboxylation → α-ketoglutarate (5C) + NADH + CO₂. 4 α-KG DH complex → succinyl CoA (4C) + NADH + CO₂.',
        '5 Succinyl CoA synthetase (= thiokinase) → succinate + GTP (substrate-level). 6 Succinate DH → fumarate + FADH₂.',
        '7 Fumarase — hydration → malate. 8 Malate DH → oxaloacetate + NADH. Totals: 3 NADH, 1 FADH₂, 1 GTP, 2 CO₂.',
        'Build 9: the three regulated steps (red rings) — citrate synthase, isocitrate DH, α-KG DH (= red rows of slide 16). Carbon note: 2 C in, 2 C out per turn.',
      ],
      visual: wheelViz,
    },
    {
      layout: 'full',
      eyebrow: 'Part 2 · Slide 16 drill',
      title: 'Complete the <em>table</em>',
      bullets: [{ t: 'Click any ? to reveal' }, { t: 'Red rows = regulated' }],
      steps: 3,
      src: 'Lecture slide 16 · blanks filled from Lippincott (answer key)',
      notes: [
        'This is slide 16’s exercise. Ask the room for each “?” before revealing (click a cell, or press →).',
        'Build 1 — reaction types: condensation, isomerization, oxidative decarboxylation, substrate-level phosphorylation, oxidation.',
        'Build 2 — enzymes and missing metabolites: citrate synthase, aconitase, isocitrate DH (→ α-ketoglutarate), malate (→ malate DH).',
        'Build 3 — carbon numbers: 6, 6, 5, 4, 4, 4, 4, 4.',
        'Rows 1, 3, 4 are red on the slide = the three regulated (irreversible) steps of slide 18.',
      ],
      visual: tableViz,
    },
    {
      eyebrow: 'Part 2 · Energetics',
      title: 'Energy per <em>acetyl CoA</em>',
      bullets: [
        { t: '<b>3 NADH</b> → ETC', tip: 'From isocitrate DH, α-KG DH and malate DH (slide 14).' },
        { t: '<b>1 FADH₂</b> → ETC', tip: 'From succinate DH (slide 14).' },
        { t: '<b>1 GTP</b> · substrate level', tip: 'From succinyl CoA synthetase (thiokinase).' },
        { t: '<b>2 CO₂</b> released', tip: 'At isocitrate DH and α-KG DH.' },
      ],
      src: 'Lecture slide 14 (products) · ATP values: Lippincott; older values from L.11 slide 10',
      notes: [
        'Per turn (slide 14 dots): 3 NADH + 1 FADH₂ + 1 GTP + 2 CO₂.',
        'Current values: 3 × 2.5 + 1 × 1.5 + 1 = 10 ATP per acetyl CoA.',
        'Older values used in L.11 (NADH = 3, FADH₂ = 2): 9 + 2 + 1 = 12 ATP. The TCA slides give no numbers — state your convention in exams.',
        'GTP is made by substrate-level phosphorylation — the only direct “ATP” of the cycle.',
      ],
      visual: energyViz,
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · slide 15',
      title: 'ATP from one <em>glucose</em>?',
      bullets: [{ t: 'Build it stage by stage' }, { t: 'State your assumptions' }],
      steps: 4,
      src: 'Lecture slide 15 (question only) · answer key: textbook values (Lippincott; L.11 slide 10)',
      notes: [
        'Slide 15 asks: total energy from complete oxidation of one glucose? Let the room answer first.',
        'Build 1 — glycolysis: 2 ATP (net) + 2 cytosolic NADH. Build 2 — PDH ×2: 2 NADH, 2 CO₂.',
        'Build 3 — TCA ×2: 6 NADH, 2 FADH₂, 2 GTP, 4 CO₂. Build 4 — total: 10 NADH, 2 FADH₂, 4 ATP/GTP.',
        'With 2.5 / 1.5: 32 ATP (malate–aspartate shuttle) or 30 (glycerol-3-phosphate shuttle).',
        'With the older 3 / 2 values: 38 or 36. Use the toggles to show how the answer depends on assumptions.',
      ],
      visual: glucoseYieldViz,
    },
    {
      layout: 'full',
      eyebrow: 'Part 2 · Regulation',
      title: 'Three control <em>points</em>',
      bullets: [{ t: 'Click any signal' }, { t: 'Red inhibits · green activates' }],
      src: 'Lecture slide 18 (slide prints “Ca⁺” — calcium is Ca²⁺) · rate-limiting: Lippincott · flux schematic',
      notes: [
        'Slide 18 — three regulated enzymes (= red rows of slide 16):',
        'Citrate synthase: inhibited by ATP, NADH, succinyl CoA and citrate (its product); activated by ADP.',
        'Isocitrate dehydrogenase (rate-limiting): inhibited by NADH and ATP; activated by Ca²⁺ and ADP.',
        'α-KG dehydrogenase complex: inhibited by NADH, ATP and succinyl CoA (its product); activated by Ca²⁺.',
        'Logic: high energy charge (ATP, NADH) slows the cycle; low energy (ADP) and muscle contraction (Ca²⁺) speed it up. Try the two presets.',
      ],
      visual: tcaRegViz,
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · slide 19',
      title: 'Which inhibit <em>isocitrate DH</em>?',
      steps: 1,
      src: 'Lecture slides 18–19',
      notes: [
        'Read the stem; poll the room; press → (or click) to reveal.',
        'Answer a: NADH and ATP (slide 18).',
        'b — calcium is an activator of ICDH. c — citrate inhibits citrate synthase, not ICDH. d — succinyl CoA inhibits citrate synthase and α-KG DH. e — ADP is an activator.',
      ],
      visual: (el) => mcqViz(el, {
        tag: 'Single best answer',
        stem: 'The citric acid cycle is regulated at <b>3</b> distinct points. One regulatory enzyme is <b>isocitrate dehydrogenase</b>. Which of the following are <b>inhibitors</b> of this enzyme?',
        answer: 0,
        options: [
          { t: 'NADH and ATP', why: 'High-energy signals inhibit ICDH (slide 18).' },
          { t: 'Calcium and NADH', why: 'Ca²⁺ <b>activates</b> ICDH.' },
          { t: 'ATP and citrate', why: 'Citrate inhibits citrate synthase, not ICDH.' },
          { t: 'Succinyl CoA and NADH', why: 'Succinyl CoA inhibits citrate synthase and α-KG DH.' },
          { t: 'ADP and NADH', why: 'ADP <b>activates</b> ICDH.' },
        ],
      }),
    },
    {
      layout: 'full',
      eyebrow: 'Part 2 · The amphibolic hub',
      title: 'Drain and <em>refill</em>',
      bullets: [{ t: 'Drain → biosynthesis' }, { t: 'Refill → anaplerosis' }],
      steps: 3,
      src: 'Lecture slide 17 · enzymes 1–5 as on the slide · arrow directions per textbook where slide 17 differs',
      notes: [
        'Build 1 — drain (anabolic): oxaloacetate → glucose (gluconeogenesis) and → aspartate; citrate → fatty acids (lipid synthesis); α-ketoglutarate → glutamate; aspartate and glutamate → proteins; succinyl CoA → heme.',
        'Build 2 — refill (anaplerotic): 1 pyruvate carboxylase (pyruvate → OAA); 2 malic enzyme (pyruvate → malate); 3 AST (aspartate → OAA); 4 glutamate DH (glutamate → α-KG); propionyl CoA → succinyl CoA.',
        'Build 3 — both at once: that is what amphibolic means (slide 13).',
        'Enzyme 5, ALT, links pyruvate and alanine — why alanine rises in PDH deficiency.',
        'Arrow notes: propionyl CoA → succinyl CoA is drawn one-way (slide shows ⇄); ALT is reversible; malic enzyme often runs malate → pyruvate (hover each number).',
      ],
      visual: hubViz,
    },
    {
      layout: 'full',
      eyebrow: 'Critical thinking · case (slide 20)',
      title: 'Which enzyme is <em>impaired</em>?',
      steps: 1,
      src: 'Lecture slides 8, 17, 20',
      notes: [
        'Read the case; ask which lab value is the giveaway (↑ alanine with ↑ lactate). Press → to reveal.',
        'Answer b — pyruvate dehydrogenase complex. Pyruvate cannot enter the cycle → converted to lactate (LDH) and alanine (ALT).',
        'Hypotonia and developmental delay = progressive neurological signs of PDH deficiency (slide 8). Rapid breathing = respiratory compensation for lactic acidosis.',
        'The other options are cycle enzymes — they do not explain pyruvate spilling into lactate and alanine.',
      ],
      visual: (el) => mcqViz(el, {
        tag: 'Clinical case',
        wide: true,
        fs: 33,
        stem: 'A <b>6-month-old</b> boy has progressive <b>lethargy</b>, poor feeding and <b>rapid breathing</b>. Examination: generalized <b>hypotonia</b> and severe <b>developmental delay</b>.',
        labs: ['↑ Plasma lactate', '↑↑ Plasma alanine'],
        answer: 1,
        options: [
          { t: 'Citrate synthase', why: 'A cycle enzyme — does not explain pyruvate spilling into lactate and alanine.' },
          { t: 'Pyruvate dehydrogenase complex', why: 'Pyruvate backs up → lactate + alanine; neurological signs; acidosis → fast breathing.' },
          { t: 'α-Ketoglutarate dehydrogenase', why: 'Inside the cycle — not the ↑ alanine picture of slide 8.' },
          { t: 'Isocitrate dehydrogenase', why: 'Inside the cycle — not the ↑ alanine picture of slide 8.' },
          { t: 'Malate dehydrogenase', why: 'Inside the cycle — not the ↑ alanine picture of slide 8.' },
        ],
      }),
    },
    {
      layout: 'cards',
      eyebrow: 'Summary',
      title: 'Remember these',
      cards: [
        { icon: 'layers', big: '3 · 5', title: 'enzymes · coenzymes', body: 'TPP, lipoic acid, CoA, FAD, NAD⁺.' },
        { icon: 'cycle', big: '3 · 1 · 1', title: 'NADH · FADH₂ · GTP', body: 'Per turn, plus 2 CO₂ out.' },
        { icon: 'bolt', big: '10', title: 'ATP per acetyl CoA', body: '2.5 per NADH · 1.5 per FADH₂ · 1 GTP.' },
        { icon: 'pill', big: 'B₁', title: 'before glucose', body: 'Thiamine first — protects PDH, heart and brain.' },
      ],
      notes: [
        'PDH complex: 3 enzymes, 5 coenzymes (tender loving care for nobody); the bridge from glycolysis.',
        'Each turn: 3 NADH, 1 FADH₂, 1 GTP, 2 CO₂ → 10 ATP (12 with older values).',
        'Three control points: citrate synthase, isocitrate DH (rate-limiting), α-KG DH.',
        'Thiamine before glucose in alcoholics and the malnourished. Then open the question bank.',
      ],
    },
  ],
};
