// Minimal, crisp SVG charts in stage pixels. Built for live, slider-driven curves.
import { s, svgRoot, setRich } from '../core/util.js';

let uid = 0;

/**
 * chart(host, { w, h, pad, x:{min,max,label,ticks,fmt}, y:{...}, grid })
 * Returns an API with scale fns and primitives that can be updated live.
 */
export function chart(host, o) {
  const w = o.w ?? host.clientWidth ?? 1000;
  const hgt = o.h ?? host.clientHeight ?? 700;
  const pad = { l: 120, r: 40, t: 40, b: 110, ...(o.pad || {}) };
  const svg = svgRoot(host, w, hgt);
  const id = `cl${++uid}`;
  const pw = w - pad.l - pad.r, ph = hgt - pad.t - pad.b;
  const X = { min: 0, max: 1, ...o.x }, Y = { min: 0, max: 1, ...o.y };
  const sx = (v) => pad.l + ((v - X.min) / (X.max - X.min)) * pw;
  const sy = (v) => pad.t + ph - ((v - Y.min) / (Y.max - Y.min)) * ph;
  const ix = (px) => X.min + ((px - pad.l) / pw) * (X.max - X.min);

  const defs = s('defs');
  defs.append(s('clipPath', { id }, [s('rect', { x: pad.l, y: pad.t - 4, width: pw + 2, height: ph + 8 })]));
  svg.append(defs);

  const gGrid = s('g'), gAxes = s('g'), gPlot = s('g', { 'clip-path': `url(#${id})` }), gTop = s('g');
  svg.append(gGrid, gAxes, gPlot, gTop);

  const ticks = (A) => A.ticks || Array.from({ length: 5 }, (_, i) => A.min + ((A.max - A.min) * i) / 4);
  if (o.grid !== false) {
    ticks(Y).forEach((t) => gGrid.append(s('line', { x1: pad.l, x2: pad.l + pw, y1: sy(t), y2: sy(t), stroke: 'var(--line)', 'stroke-width': 1.5 })));
  }
  // Axes
  const axisColor = 'var(--fg-3)';
  gAxes.append(
    s('line', { x1: pad.l, x2: pad.l + pw + 10, y1: sy(Y.min), y2: sy(Y.min), stroke: axisColor, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    s('line', { x1: sx(X.min), x2: sx(X.min), y1: pad.t - 10, y2: pad.t + ph, stroke: axisColor, 'stroke-width': 3, 'stroke-linecap': 'round' }),
  );
  if (X.ticks !== false) ticks(X).forEach((t) => {
    const tx = s('text', { x: sx(t), y: sy(Y.min) + 40, 'text-anchor': 'middle', class: 'v-label sm v-muted' });
    tx.textContent = X.fmt ? X.fmt(t) : t;
    gAxes.append(tx);
  });
  if (Y.ticks !== false) ticks(Y).forEach((t) => {
    const ty = s('text', { x: sx(X.min) - 18, y: sy(t) + 8, 'text-anchor': 'end', class: 'v-label sm v-muted' });
    ty.textContent = Y.fmt ? Y.fmt(t) : t;
    gAxes.append(ty);
  });
  if (X.label) { const t = s('text', { x: pad.l + pw / 2, y: hgt - 22, 'text-anchor': 'middle', class: 'v-label v-muted' }); setRich(t, X.label); gAxes.append(t); }
  if (Y.label) { const t = s('text', { x: 0, y: 0, transform: `translate(${pad.l - 82} ${pad.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'v-label v-muted' }); setRich(t, Y.label); gAxes.append(t); }

  function sample(fn, n = 240, x0 = X.min, x1 = X.max) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = fn(x);
      if (Number.isFinite(y)) pts.push([x, y]);
    }
    return pts;
  }
  const toPath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.max(Y.min - (Y.max - Y.min), Math.min(Y.max * 3, y))).toFixed(1)}`).join('');

  const api = {
    svg, w, h: hgt, pad, pw, ph, sx, sy, ix, X, Y, plot: gPlot, top: gTop,
    /** Line from a function or [[x,y]] points. */
    line(src, st = {}) {
      const path = s('path', {
        fill: 'none', stroke: st.color || 'var(--a1)', 'stroke-width': st.width ?? 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'stroke-dasharray': st.dash || null, opacity: st.opacity ?? 1,
      });
      let area;
      if (st.area) { area = s('path', { fill: st.area, opacity: st.areaOpacity ?? 0.16, stroke: 'none' }); gPlot.append(area); }
      gPlot.append(path);
      let label;
      if (st.label) { label = s('text', { class: 'v-label', fill: st.color || 'var(--a1)', 'font-weight': 650 }); gTop.append(label); }
      const handle = {
        el: path,
        pts: [],
        update(next = src, range) {
          src = next;
          const pts = typeof src === 'function' ? sample(src, st.samples, ...(range || st.range || [])) : src;
          handle.pts = pts;
          path.setAttribute('d', toPath(pts));
          if (area && pts.length) area.setAttribute('d', `${toPath(pts)}L${sx(pts.at(-1)[0])},${sy(Y.min)}L${sx(pts[0][0])},${sy(Y.min)}Z`);
          if (label && pts.length) {
            const at = st.labelAt ?? pts.at(-1)[0];
            const p = pts.reduce((b, q) => (Math.abs(q[0] - at) < Math.abs(b[0] - at) ? q : b), pts[0]);
            label.setAttribute('x', sx(p[0]) + (st.labelDx ?? 14));
            label.setAttribute('y', sy(Math.min(Y.max, p[1])) + (st.labelDy ?? -16));
            label.setAttribute('text-anchor', st.labelAnchor || 'start');
            setRich(label, st.label);
          }
          return handle;
        },
        draw(duration = 1.4, delay = 0) {
          const g = window.gsap;
          const len = path.getTotalLength();
          if (!g || !len) return;
          g.fromTo(path, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDashoffset: 0, duration, delay, ease: 'power2.inOut', onComplete: () => { path.style.strokeDasharray = st.dash || ''; } });
          if (area) g.fromTo(area, { opacity: 0 }, { opacity: st.areaOpacity ?? 0.16, duration, delay: delay + duration * 0.4 });
          if (label) g.fromTo(label, { opacity: 0 }, { opacity: 1, duration: 0.6, delay: delay + duration * 0.8 });
        },
        setLabel(t) { if (label) setRich(label, t); },
        show(on) { [path, area, label].forEach((e) => e && (e.style.opacity = on ? '' : 0)); },
      };
      return handle.update(src);
    },
    point(x, y, st = {}) {
      const g = s('g');
      const c = s('circle', { r: st.r ?? 12, fill: st.color || 'var(--a1)', stroke: 'var(--bg)', 'stroke-width': 4 });
      g.append(c);
      let t;
      if (st.label) { t = s('text', { class: 'v-label sm', 'text-anchor': st.anchor || 'start', fill: st.labelColor || 'var(--fg)' }); g.append(t); }
      gTop.append(g);
      const handle = {
        el: g,
        move(nx, ny, label) {
          c.setAttribute('cx', sx(nx)); c.setAttribute('cy', sy(ny));
          if (t) { t.setAttribute('x', sx(nx) + (st.dx ?? 20)); t.setAttribute('y', sy(ny) + (st.dy ?? -18)); setRich(t, label ?? st.label); }
          return handle;
        },
      };
      return handle.move(x, y);
    },
    vline(x, st = {}) { return guide('v', x, st); },
    hline(y, st = {}) { return guide('h', y, st); },
    text(x, y, str, attrs = {}) {
      const t = s('text', { x: sx(x), y: sy(y), class: 'v-label', ...attrs });
      setRich(t, str);
      gTop.append(t);
      return t;
    },
  };

  function guide(kind, v, st) {
    const g = s('g');
    const ln = s('line', { stroke: st.color || 'var(--fg-3)', 'stroke-width': st.width ?? 3, 'stroke-dasharray': st.dash ?? '10 10' });
    const t = st.label ? s('text', { class: 'v-label sm', fill: st.labelColor || st.color || 'var(--fg-2)', 'text-anchor': kind === 'v' ? 'middle' : 'end' }) : null;
    g.append(ln); if (t) g.append(t);
    gTop.append(g);
    const handle = {
      el: g,
      move(nv, label, extent) {
        if (kind === 'v') {
          const y1 = extent !== undefined ? sy(extent) : pad.t;
          ln.setAttribute('x1', sx(nv)); ln.setAttribute('x2', sx(nv)); ln.setAttribute('y1', y1); ln.setAttribute('y2', sy(Y.min));
          if (t) { t.setAttribute('x', sx(nv)); t.setAttribute('y', st.labelTop ? y1 - 16 : sy(Y.min) + (st.labelDy ?? 78)); setRich(t, label ?? st.label); }
        } else {
          const x2 = extent !== undefined ? sx(extent) : pad.l + pw;
          ln.setAttribute('y1', sy(nv)); ln.setAttribute('y2', sy(nv)); ln.setAttribute('x1', sx(X.min)); ln.setAttribute('x2', x2);
          if (t) { t.setAttribute('x', sx(X.min) - (st.labelDx ?? 18)); t.setAttribute('y', sy(nv) + 8); setRich(t, label ?? st.label); }
        }
        return handle;
      },
    };
    return handle.move(v, st.label, st.extent);
  }

  return api;
}
