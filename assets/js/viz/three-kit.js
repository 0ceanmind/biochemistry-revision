// Three.js scene factory tuned for slides: transparent canvas, studio lighting,
// crisp HTML labels, gentle auto-rotation, render loop only while the slide is live.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { h, getTheme, onTheme } from '../core/util.js';

export { THREE, CSS2DObject };

/**
 * createScene(host, opts) → kit
 * opts: { fov, cam:[x,y,z], target:[x,y,z], orbit:true, autoRotate:0.8, zoom:false, pan:false,
 *         exposure:1, hint:true, minPolar, maxPolar }
 * kit: { scene, camera, renderer, controls, root, label(), onFrame(fn), start(), stop(), dispose(), fit(obj) }
 */
export function createScene(host, opts = {}) {
  const o = { fov: 32, cam: [0, 0, 16], target: [0, 0, 0], orbit: true, autoRotate: 0.7, zoom: false, pan: false, exposure: 1.05, hint: true, ...opts };
  const wrap = h('div.three-host');
  host.append(wrap);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.setClearColor(0x000000, 0);
  wrap.append(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  wrap.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(o.fov, 1, 0.1, 2000);
  camera.position.set(...o.cam);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(6, 10, 8);
  const rim = new THREE.DirectionalLight(0xbcd7ff, 0.7);
  rim.position.set(-8, -2, -6);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

  const root = new THREE.Group();
  scene.add(root);

  let controls = null;
  if (o.orbit) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...o.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = o.zoom;
    controls.enablePan = o.pan;
    controls.autoRotate = !!o.autoRotate;
    controls.autoRotateSpeed = o.autoRotate || 0;
    controls.rotateSpeed = 0.7;
    if (o.minPolar !== undefined) controls.minPolarAngle = o.minPolar;
    if (o.maxPolar !== undefined) controls.maxPolarAngle = o.maxPolar;
    // Pause auto-rotation while the presenter drags, resume after.
    let resumeT;
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeT); });
    controls.addEventListener('end', () => { resumeT = setTimeout(() => { controls.autoRotate = !!o.autoRotate; }, 4000); });
  } else {
    camera.lookAt(...o.target);
  }

  if (o.hint && o.orbit) {
    wrap.append(h('div.hint3d', { html: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/></svg>Drag to rotate' }));
  }

  const frameFns = new Set();
  let tPrev = performance.now(), tElapsed = 0;
  let running = false;

  function size() {
    const w = wrap.clientWidth || host.clientWidth || 800;
    const hgt = wrap.clientHeight || host.clientHeight || 600;
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    renderer.setPixelRatio(Math.min(2, (window.devicePixelRatio || 1) * Math.max(0.5, s)));
    renderer.setSize(w, hgt, false);
    labelRenderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(size);
  ro.observe(wrap);
  window.addEventListener('resize', size);
  size();

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now; tElapsed += dt;
    const t = tElapsed;
    frameFns.forEach((fn) => fn(dt, t));
    controls?.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  const kit = {
    THREE, scene, camera, renderer, controls, root, wrap,
    /** Add an HTML label anchored to a 3D position (or object). */
    label(html, pos = [0, 0, 0], { cls = '', parent = root, tip = null } = {}) {
      const el = h('div', { class: `lbl3d ${cls}`, html });
      if (tip) { el.setAttribute('data-tip', typeof tip === 'string' ? tip : JSON.stringify(tip)); }
      const obj = new CSS2DObject(el);
      obj.position.set(...pos);
      parent.add(obj);
      return obj;
    },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    start() { if (running) return; running = true; size(); tPrev = performance.now(); renderer.setAnimationLoop(tick); },
    stop() { running = false; renderer.setAnimationLoop(null); },
    renderOnce() { tick(); },
    /** Frame an object so it fills ~`fill` of the view. */
    fit(obj = root, fill = 0.82) {
      const box = new THREE.Box3().setFromObject(obj);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const fovR = THREE.MathUtils.degToRad(camera.fov);
      const fitH = sphere.radius / Math.sin(fovR / 2);
      const fitW = fitH / camera.aspect;
      const dist = Math.max(fitH, fitW) / fill;
      const dir = camera.position.clone().sub(controls ? controls.target : new THREE.Vector3()).normalize();
      if (controls) controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(dir.multiplyScalar(dist));
      camera.near = dist / 100; camera.far = dist * 10;
      camera.updateProjectionMatrix();
    },
    theme: getTheme,
    onTheme,
    dispose() {
      this.stop();
      ro.disconnect();
      window.removeEventListener('resize', size);
      controls?.dispose();
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.();
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      wrap.remove();
    },
  };
  return kit;
}

/* ---------- Material helpers ---------- */
export function glossy(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25, ...extra });
}
export function matte(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.0, ...extra });
}
export function glass(color = 0xffffff, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, ...extra });
}
export function glow(color, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

/** Soft radial sprite texture (for glowing particles: electrons, protons, photons). */
let _spriteTex;
export function glowTexture() {
  if (_spriteTex) return _spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.6, 'rgba(255,255,255,.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _spriteTex = new THREE.CanvasTexture(c);
  _spriteTex.colorSpace = THREE.SRGBColorSpace;
  return _spriteTex;
}
export function glowSprite(color, size = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

/** Cylinder between two points. */
export function cylinderBetween(a, b, radius, material, radial = 16) {
  const va = a instanceof THREE.Vector3 ? a : new THREE.Vector3(...a);
  const vb = b instanceof THREE.Vector3 ? b : new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const geo = new THREE.CylinderGeometry(radius, radius, len, radial, 1, true);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return mesh;
}

/** Ease helpers for frame-based animation. */
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

/**
 * Standard controller for slide visuals built on a kit:
 * returns {enter, leave, destroy} that start/stop the render loop.
 */
export function kitController(kit, extra = {}) {
  return {
    enter() { kit.start(); extra.enter?.(); },
    leave() { kit.stop(); extra.leave?.(); },
    step(n, dir) { extra.step?.(n, dir); },
    destroy() { extra.destroy?.(); kit.dispose(); },
  };
}
