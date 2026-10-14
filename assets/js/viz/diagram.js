// SVG diagram kit: metabolite pills, enzyme tags, compartments, curved arrows with
// hand-built arrowheads, and glowing particles that flow along any path.
import { s, svgRoot, setRich } from '../core/util.js';

let uid = 0;

export function diagram(host, w, h, attrs = {}) {
  const svg = svgRoot(host, w, h, attrs);
  const defs = s('defs');
  const gid = `g${++uid}`;
  defs.append(
    s('filter', { id: `${gid}-glow`, x: '-50%', y: '-50%', width: '200%', height: '200%' }, [
      s('feGaussianBlur', { stdDeviation: 6, result: 'b' }),
      s('feMerge', {}, [s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' })]),
    ]),
    s('filter', { id: `${gid}-soft`, x: '-20%', y: '-20%', width: '140%', height: '140%' }, [
      s('feDropShadow', { dx: 0, dy: 10, stdDeviation: 16, 'flood-color': '#000', 'flood-opacity': 0.25 }),
    ]),
  );
  svg.append(defs);
  const layers = {};
  ['regions', 'edges', 'fx', 'nodes', 'labels'].forEach((n) => { layers[n] = s('g', { class: `layer-${n}` }); svg.append(layers[n]); });
  const nodes = {};
  const edges = {};
  const flows = new Set();

  const api = {
    svg, defs, layers, nodes, edges, w, h,
    glowId: `${gid}-glow`,
    /** Compartment / region */
    region(o) {
      const g = s('g', { class: 'v-region' });
      g.append(s('rect', {
        x: o.x, y: o.y, width: o.w, height: o.h, rx: o.r ?? 44,
        style: `fill:${o.fill || 'var(--surface)'};stroke:${o.stroke || 'var(--line)'};stroke-width:2;${o.dash ? `stroke-dasharray:${o.dash}` : ''}`,
      }));
      if (o.label) {
        const t = s('text', { x: o.x + (o.lx ?? 34), y: o.y + (o.ly ?? 52), class: 'v-label sm', style: `fill:${o.labelColor || 'var(--fg-2)'};letter-spacing:.14em;font-weight:650;text-transform:uppercase` });
        setRich(t, o.label);
        g.append(t);
      }
      if (o.tip) g.setAttribute('data-tip', JSON.stringify(o.tip));
      layers.regions.append(g);
      if (o.id) nodes[o.id] = { g, ...o };
      return g;
    },

    /**
     * Node. kind: 'mol' (pill) | 'enz' (accent tag) | 'box' | 'dot' | 'ghost'
     * o: {id, x, y (centre), w, h, label, sub, kind, color, tip, size}
     */
    node(o) {
      const kind = o.kind || 'mol';
      const fs = o.size ?? (kind === 'enz' ? 25 : 30);
      const lines = String(o.label ?? '').split('\n');
      const plain = (t) => String(t).replace(/[_^]\{([^}]*)\}/g, '$1').length;
      const estW = Math.max(...lines.map(plain) .map((n) => n * fs * 0.56), o.sub ? plain(o.sub) * fs * 0.74 * 0.55 : 0) + (kind === 'enz' ? 40 : 56);
      const w0 = o.w ?? Math.max(kind === 'enz' ? 90 : 140, estW);
      const h0 = o.h ?? (lines.length * fs * 1.2 + (o.sub ? fs * 0.95 : 0) + (kind === 'enz' ? 22 : 34));
      const g = s('g', { class: `v-node v-${kind}`, transform: `translate(${o.x} ${o.y})` });
      const col = o.color;
      let shape;
      if (kind === 'dot') {
        shape = s('circle', { r: o.r ?? 14, class: 'shape', style: `fill:${col || 'var(--a1)'};stroke:none` });
      } else {
        const rx = o.r ?? (kind === 'mol' ? h0 / 2 : kind === 'enz' ? 16 : 26);
        const fill = kind === 'enz'
          ? `color-mix(in oklab, ${col || 'var(--a1)'} 16%, transparent)`
          : kind === 'ghost' ? 'transparent' : (o.fill || 'var(--surface-2)');
        const stroke = kind === 'enz' ? `color-mix(in oklab, ${col || 'var(--a1)'} 55%, transparent)` : (o.stroke || (col ? `color-mix(in oklab, ${col} 70%, transparent)` : 'var(--line-2)'));
        if (kind !== 'ghost' && o.opaque !== false) g.append(s('rect', { x: -w0 / 2, y: -h0 / 2, width: w0, height: h0, rx, style: 'fill:var(--bg);stroke:none' }));
        shape = s('rect', { x: -w0 / 2, y: -h0 / 2, width: w0, height: h0, rx, class: 'shape', style: `fill:${fill};stroke:${stroke};stroke-width:${o.strokeW ?? 2}${kind === 'ghost' ? ';stroke-dasharray:8 8' : ''}` });
      }
      g.append(shape);
      const textCol = kind === 'enz' ? (col ? `color-mix(in oklab, ${col} 80%, var(--fg))` : 'var(--ink)') : (o.textColor || 'var(--fg)');
      const startY = -((lines.length - 1) * fs * 1.15) / 2 - (o.sub ? fs * 0.45 : 0) + fs * 0.36;
      lines.forEach((ln, i) => {
        const t = s('text', { x: 0, y: startY + i * fs * 1.15, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${fs}px;fill:${textCol};font-weight:${o.weight ?? (kind === 'enz' ? 620 : 600)}` });
        setRich(t, ln);
        g.append(t);
      });
      if (o.sub) {
        const t = s('text', { x: 0, y: startY + (lines.length - 1) * fs * 1.15 + fs * 1.05, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${Math.round(fs * 0.74)}px;fill:var(--fg-2);font-weight:500` });
        setRich(t, o.sub);
        g.append(t);
      }
      if (o.tip) g.setAttribute('data-tip', JSON.stringify(o.tip));
      (o.layer ? layers[o.layer] : layers.nodes).append(g);
      const rec = { g, shape, x: o.x, y: o.y, w: w0, h: h0, kind, ...o, w0, h0 };
      if (o.id) nodes[o.id] = rec;
      return rec;
    },

    /**
     * Arrow between points or node ids. o: {from, to, curve (px bulge), color, width, dash,
     *   label, labelSide, labelColor, id, head:true, gapStart, gapEnd, kind:'inh'|'act'}
     */
    arrow(o) {
      const A = resolve(o.from, o.to, o.gapStart);
      const B = resolve(o.to, o.from, o.gapEnd);
      const color = o.color || 'var(--fg-3)';
      const width = o.width ?? 4;
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const bulge = o.curve ?? 0;
      const cx = mx + nx * bulge, cy = my + ny * bulge;
      const d = o.d || (bulge ? `M${A[0]},${A[1]} Q${cx},${cy} ${B[0]},${B[1]}` : `M${A[0]},${A[1]} L${B[0]},${B[1]}`);
      const g = s('g', { class: 'v-edge' });
      const path = s('path', { d, class: 'line', style: `stroke:${color};stroke-width:${width};fill:none;stroke-linecap:round${o.dash ? `;stroke-dasharray:${o.dash}` : ''}` });
      g.append(path);
      // arrowhead (or T-bar for inhibition)
      let head = null;
      if (o.head !== false) {
        const L = path.getTotalLength ? null : null; // computed lazily after insertion
        head = s('path', { style: `fill:${o.kind === 'inh' ? 'none' : color};stroke:${color};stroke-width:${o.kind === 'inh' ? width + 1 : 0};stroke-linecap:round;stroke-linejoin:round` });
        g.append(head);
      }
      let label = null;
      if (o.label) {
        const side = o.labelSide ?? 1;
        const lx = (bulge ? (mx + cx) / 2 : mx) + nx * (o.labelOffset ?? 30) * side;
        const ly = (bulge ? (my + cy) / 2 : my) + ny * (o.labelOffset ?? 30) * side;
        label = s('text', { x: lx, y: ly + 9, 'text-anchor': o.labelAnchor || (Math.abs(nx) > 0.5 ? (nx * side > 0 ? 'start' : 'end') : 'middle'), class: 'v-label sm', style: `fill:${o.labelColor || 'var(--fg-2)'};font-weight:${o.labelWeight ?? 560}` });
        setRich(label, o.label);
        g.append(label);
      }
      if (o.tip) { g.setAttribute('data-tip', JSON.stringify(o.tip)); g.prepend(s('path', { d, class: 'v-hit', style: 'stroke-width:34;stroke:transparent;fill:none' })); }
      (o.layer ? layers[o.layer] : layers.edges).append(g);
      // place head now that path is in the DOM
      if (head) {
        const total = path.getTotalLength();
        const p1 = path.getPointAtLength(total);
        const p0 = path.getPointAtLength(Math.max(0, total - 6));
        const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const hs = o.headSize ?? (width * 3.4 + 6);
        if (o.kind === 'inh') {
          const px = -Math.sin(ang), py = Math.cos(ang);
          head.setAttribute('d', `M${p1.x + px * hs * 0.7},${p1.y + py * hs * 0.7} L${p1.x - px * hs * 0.7},${p1.y - py * hs * 0.7}`);
        } else {
          const tip = [p1.x + Math.cos(ang) * 2, p1.y + Math.sin(ang) * 2];
          const l = [tip[0] - Math.cos(ang - 0.42) * hs, tip[1] - Math.sin(ang - 0.42) * hs];
          const r = [tip[0] - Math.cos(ang + 0.42) * hs, tip[1] - Math.sin(ang + 0.42) * hs];
          head.setAttribute('d', `M${tip[0]},${tip[1]} L${l[0]},${l[1]} Q${tip[0] - Math.cos(ang) * hs * 0.55},${tip[1] - Math.sin(ang) * hs * 0.55} ${r[0]},${r[1]} Z`);
        }
        // shorten line so it doesn't poke through the head
        if (o.kind !== 'inh') path.style.strokeDasharray = o.dash || `${Math.max(0, total - hs * 0.6)} ${total + 10}`;
      }
      const rec = { g, path, head, label, d, A, B, o };
      if (o.id) edges[o.id] = rec;
      return rec;
    },

    /** Glowing particles flowing along a path element. */
    flow(path, o = {}) {
      const el = path.path || path;
      const count = o.count ?? 3;
      const speed = o.speed ?? 220; // px per second
      const color = o.color || 'var(--a1)';
      const r = o.r ?? 9;
      const dots = Array.from({ length: count }, () => {
        const c = s('circle', { r, style: `fill:${color}`, filter: o.glow === false ? null : `url(#${gid}-glow)` });
        layers.fx.append(c);
        return c;
      });
      let total = el.getTotalLength();
      let t0 = performance.now(), raf = null, running = false;
      const loop = (now) => {
        const dist = ((now - t0) / 1000) * speed;
        dots.forEach((c, i) => {
          const d = (dist + (i * total) / count) % total;
          const p = el.getPointAtLength(d);
          c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
          const f = d / total;
          c.style.opacity = o.fade === false ? 1 : Math.min(1, Math.min(f, 1 - f) * 8);
        });
        raf = requestAnimationFrame(loop);
      };
      const ctl = {
        dots,
        play() { if (running) return; running = true; total = el.getTotalLength(); raf = requestAnimationFrame(loop); dots.forEach((c) => (c.style.display = '')); },
        pause() { running = false; cancelAnimationFrame(raf); },
        hide() { ctl.pause(); dots.forEach((c) => (c.style.display = 'none')); },
        destroy() { ctl.pause(); dots.forEach((c) => c.remove()); flows.delete(ctl); },
      };
      flows.add(ctl);
      if (o.autoplay !== false) ctl.play();
      return ctl;
    },

    /** Small chip (ATP, NADH, CO2…) */
    badge(x, y, text, o = {}) {
      const fs = o.size ?? 24;
      const w0 = o.w ?? text.replace(/[_^]\{([^}]*)\}/g, '$1').length * fs * 0.6 + 34;
      const h0 = fs * 1.55;
      const col = o.color || 'var(--atp)';
      const g = s('g', { class: 'v-badge', transform: `translate(${x} ${y})` });
      g.append(s('rect', { x: -w0 / 2, y: -h0 / 2, width: w0, height: h0, rx: h0 / 2, style: `fill:color-mix(in oklab, ${col} 18%, transparent);stroke:color-mix(in oklab, ${col} 60%, transparent);stroke-width:2` }));
      const t = s('text', { x: 0, y: fs * 0.36, 'text-anchor': 'middle', class: 'v-label', style: `font-size:${fs}px;font-weight:700;fill:${col}` });
      setRich(t, text);
      g.append(t);
      if (o.tip) g.setAttribute('data-tip', JSON.stringify(o.tip));
      (o.layer ? layers[o.layer] : layers.labels).append(g);
      return g;
    },

    text(x, y, str, o = {}) {
      const t = s('text', { x, y, class: `v-label ${o.cls || ''}`, 'text-anchor': o.anchor || 'start', style: o.style || '' });
      setRich(t, str);
      if (o.tip) t.setAttribute('data-tip', JSON.stringify(o.tip));
      (o.layer ? layers[o.layer] : layers.labels).append(t);
      return t;
    },

    pauseAll() { flows.forEach((f) => f.pause()); },
    playAll() { flows.forEach((f) => f.play()); },
    destroy() { flows.forEach((f) => f.destroy()); },
  };

  function resolve(ref, other, gap = 10) {
    if (Array.isArray(ref)) return ref;
    const n = nodes[ref];
    if (!n) throw new Error(`diagram: unknown node ${ref}`);
    const o = Array.isArray(other) ? other : [nodes[other].x, nodes[other].y];
    // intersect ray centre→other with node box
    const dx = o[0] - n.x, dy = o[1] - n.y;
    const hw = (n.w0 ?? n.w ?? 0) / 2 + gap, hh = (n.h0 ?? n.h ?? 0) / 2 + gap;
    if (n.kind === 'dot') { const L = Math.hypot(dx, dy) || 1; const rr = (n.r ?? 14) + gap; return [n.x + (dx / L) * rr, n.y + (dy / L) * rr]; }
    const tx = dx ? hw / Math.abs(dx) : Infinity, ty = dy ? hh / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return [n.x + dx * t, n.y + dy * t];
  }

  return api;
}

/** Fade/slide helper for step builds. */
export function show(els, on = true, o = {}) {
  const g = window.gsap;
  const list = [].concat(els).filter(Boolean);
  if (!g) { list.forEach((e) => (e.style.opacity = on ? 1 : 0)); return; }
  return g.to(list, { opacity: on ? 1 : (o.dimTo ?? 0), duration: o.duration ?? 0.6, ease: 'power2.out', stagger: o.stagger ?? 0, delay: o.delay ?? 0 });
}

/** Animate a path drawing itself. */
export function drawPath(path, { duration = 1, delay = 0 } = {}) {
  const g = window.gsap;
  const el = path.path || path;
  const len = el.getTotalLength();
  const orig = el.style.strokeDasharray;
  if (!g) return;
  g.fromTo(el, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDashoffset: 0, duration, delay, ease: 'power2.inOut', onComplete: () => { el.style.strokeDasharray = orig; } });
  if (path.head) g.fromTo(path.head, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: delay + duration * 0.85 });
}
