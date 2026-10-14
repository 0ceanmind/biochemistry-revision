// Slide engine: 1920×1080 stage, step builds, lazy visuals, presenter sync.
import { h, icon, initTheme, setTheme, getTheme, store } from './util.js';
import { initTips, tip, hideTip } from './tip.js';
import { LECTURES } from './catalog.js';

const W = 1920, H = 1080;
const gsap = window.gsap;

export async function bootDeck() {
  initTheme();
  initTips();
  const params = new URLSearchParams(location.search);
  const id = params.get('l') || LECTURES[0].id;
  const presenter = params.has('presenter');
  const meta = LECTURES.find((l) => l.id === id) || LECTURES[0];

  let lec;
  try {
    lec = (await import(`../lectures/${meta.id}.js`)).default;
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<p style="padding:40px;font:20px var(--font)">Could not load lecture “${id}”.</p>`;
    return;
  }
  lec = { ...meta, ...lec };
  try {
    const q = await fetch(`assets/data/quiz/${meta.id}.json`).then((r) => r.json());
    lec.quizCount = q.questions?.length || 0;
  } catch { /* quiz optional */ }
  const root = document.documentElement;
  root.style.setProperty('--a1', lec.accent[0]);
  root.style.setProperty('--a2', lec.accent[1]);
  document.title = `${lec.title} · Biochemistry Revision`;
  if (presenter) document.body.classList.add('presenter');

  const slidesSpec = [...lec.slides, closingSlide(lec)];
  const deck = new Deck(lec, slidesSpec, { presenter });
  deck.start();
  window.__deck = deck; // handy for debugging in the console
}

/** Auto-generated closing slide: references + quiz call-to-action. */
function closingSlide(lec) {
  return {
    layout: 'split',
    eyebrow: 'Wrap-up',
    title: 'Now, <em>test yourself.</em>',
    bullets: [
      `${lec.quizCount ? `<b>${lec.quizCount}</b> exam-style MCQs` : 'Exam-style MCQs'} on this lecture`,
      'Instant feedback with explanations',
      'Review every mistake at the end',
    ],
    notes: 'Close the lecture and open the question bank.',
    visual: (el) => {
      const wrap = h('div', { style: 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:36px' });
      const cta = h('a.card', { href: `quiz.html?l=${lec.id}`, style: 'text-decoration:none;cursor:pointer;flex:0 0 auto' }, [
        h('div.k', { text: 'Question bank' }),
        h('h3', { html: `${lec.title} <span class="grad-text">MCQs →</span>` }),
        h('p', { text: 'Single best answer · practice or exam mode' }),
        h('div.glow'),
      ]);
      const refs = h('div.card', { style: 'flex:0 0 auto' }, [
        h('div.k', { text: 'References' }),
        h('ul', {}, (lec.references || []).map((r) => h('li', { html: r }))),
      ]);
      wrap.append(cta, refs);
      el.append(wrap);
    },
  };
}

class Deck {
  constructor(lec, specs, { presenter }) {
    this.lec = lec;
    this.specs = specs;
    this.presenter = presenter;
    this.cur = -1;
    this.step = 0;
    this.state = specs.map(() => ({ mounted: false, ctrl: null, pending: null }));
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(`deck-${lec.id}`) : null;
    this.remote = false;
    this.t0 = Date.now();
    this.buildDOM();
  }

  /* ---------------- DOM ---------------- */
  buildDOM() {
    document.body.classList.add('deck');
    this.viewport = h('div#viewport');
    this.viewport.id = 'viewport';
    const ambient = h('div'); ambient.id = 'ambient';
    this.stage = h('div'); this.stage.id = 'stage';
    this.viewport.append(ambient, this.stage);
    document.body.append(this.viewport);

    this.slides = this.specs.map((spec, i) => this.buildSlide(spec, i));
    this.stage.append(...this.slides);

    // Chrome
    this.progress = h('div'); this.progress.id = 'progress';
    this.toolbar = this.buildToolbar();
    const blackout = h('div'); blackout.id = 'blackout';
    this.laser = h('div'); this.laser.id = 'laser';
    this.jumpEl = h('div'); this.jumpEl.id = 'jump';
    this.overview = h('div'); this.overview.id = 'overview';
    this.help = this.buildHelp();
    document.body.append(this.progress, this.toolbar, blackout, this.laser, this.jumpEl, this.overview, this.help);
    if (this.presenter) this.buildPresenter();

    window.addEventListener('resize', () => this.fit());
    this.fit();
  }

  buildSlide(spec, i) {
    const layout = spec.layout || 'split';
    const sec = h(`section.slide.l-${layout}`, { 'data-i': i, 'aria-roledescription': 'slide' });
    if (spec.class) sec.classList.add(...spec.class.split(/\s+/));
    const inner = h('div.slide-inner');
    const text = h('div.text');

    const head = layout === 'full' || layout === 'cards' ? h('div.head-row') : text;
    const headText = layout === 'full' || layout === 'cards' ? h('div') : text;
    if (spec.eyebrow) headText.append(h('div.eyebrow.rv', { html: spec.eyebrow }));
    if (spec.title) headText.append(h(layout === 'hero' ? 'h1.title.rv' : 'h2.title.rv', { html: spec.title }));
    if (spec.subtitle) {
      const sub = h('p.subtitle', { html: spec.subtitle });
      if (spec.subtitleStep) { sub.dataset.step = spec.subtitleStep; sub.classList.add('stepped'); } else sub.classList.add('rv');
      headText.append(sub);
    }
    if (head !== text) head.append(headText);

    if (spec.bullets?.length) {
      const ul = h('ul.bullets');
      if (layout === 'full' || layout === 'cards') ul.classList.add('inline');
      spec.bullets.forEach((b) => {
        const o = typeof b === 'string' ? { t: b } : b;
        const li = h('li', { html: o.t });
        if (o.sub) li.append(h('span.sub', { html: o.sub }));
        if (o.tip) tip(li, typeof o.tip === 'string' ? { title: stripTags(o.t), body: o.tip } : o.tip);
        if (o.step !== undefined) { li.dataset.step = o.step; li.classList.add('stepped'); }
        else li.classList.add('rv');
        ul.append(li);
      });
      (head !== text ? head : text).append(ul);
    }
    if (spec.meta) text.append(h('div.meta.rv', {}, spec.meta.map((m) => h('span.pill', { html: m }))));
    if (spec.html) text.append(h('div.rv', { html: spec.html }));

    if (head !== text) text.append(head);
    inner.append(text);

    if (spec.visual || spec.cards) {
      const vis = h('div.visual');
      if (spec.cards) vis.append(this.buildCards(spec.cards));
      inner.append(vis);
      sec._visual = vis;
    }
    if (spec.src) sec.append(h('div.src', { html: spec.src }));
    sec.append(inner);
    return sec;
  }

  buildCards(cards) {
    const wrap = h('div.cards');
    cards.forEach((c) => {
      const card = h('div.card.rv-card');
      if (c.icon) { card.classList.add('has-icon'); card.append(h('div.icon', { html: icon(c.icon) })); }
      if (c.k) card.append(h('div.k', { html: c.k }));
      if (c.big) card.append(h('div.big.grad-text', { html: c.big }));
      if (c.title) card.append(h('h3', { html: c.title }));
      if (c.body) card.append(h('p', { html: c.body }));
      if (c.list) card.append(h('ul', {}, c.list.map((li) => h('li', { html: li }))));
      if (c.viz) { const v = h('div.viz'); card.append(v); card._viz = c.viz; card._vizEl = v; }
      if (c.tip) tip(card, c.tip);
      if (c.style) card.setAttribute('style', c.style);
      card.append(h('div.glow'));
      wrap.append(card);
    });
    return wrap;
  }

  buildToolbar() {
    const tb = h('div'); tb.id = 'toolbar';
    const btn = (name, title, fn) => { const b = h('button', { title, 'aria-label': title, html: icon(name), onclick: fn }); return b; };
    this.countEl = h('span.count');
    this.themeBtn = btn(getTheme() === 'dark' ? 'sun' : 'moon', 'Theme (T)', () => this.toggleTheme());
    tb.append(
      h('a', { href: './', title: 'All lectures', html: icon('home') }),
      h('span.lec', { text: this.lec.title }),
      h('span.sep'),
      btn('prev', 'Previous (←)', () => this.prev()),
      this.countEl,
      btn('next', 'Next (→)', () => this.next()),
      h('span.sep'),
      btn('grid', 'Overview (O)', () => this.toggleOverview()),
      btn('laser', 'Laser pointer (L)', () => document.body.classList.toggle('laser')),
      btn('notes', 'Presenter view (S)', () => this.openPresenter()),
      this.themeBtn,
      btn('full', 'Fullscreen (F)', () => this.toggleFullscreen()),
      btn('help', 'Shortcuts (?)', () => document.body.classList.toggle('help')),
      h('span.sep'),
      h('a', { href: `quiz.html?l=${this.lec.id}`, title: 'Quiz', html: `${icon('quiz')}<span>Quiz</span>` }),
    );
    return tb;
  }

  buildHelp() {
    const el = h('div'); el.id = 'help';
    const rows = [
      [['→', 'Space'], 'Next build / slide'], [['←'], 'Previous'], [['Home', 'End'], 'First / last slide'],
      [['O'], 'Overview of all slides'], [['S'], 'Presenter view (notes + timer)'], [['L'], 'Laser pointer'],
      [['B'], 'Black screen'], [['T'], 'Light / dark theme'], [['F'], 'Fullscreen'], [['12', '↵'], 'Jump to slide 12'],
      [['Hover'], 'Details on any marked item'],
    ];
    el.append(h('div.panel', {}, [
      h('h3', { text: 'Presenting' }),
      h('dl', {}, rows.flatMap(([keys, d]) => [h('dt', {}, keys.map((k) => h('span.kbd', { text: k }))), h('dd', { text: d })])),
    ]));
    el.addEventListener('click', () => document.body.classList.remove('help'));
    return el;
  }

  buildPresenter() {
    const pv = h('div'); pv.id = 'pv';
    this.pvNow = h('div.now');
    this.pvBody = h('div.body');
    this.pvNext = h('div.t');
    this.pvStep = h('div.stepinfo');
    this.pvClock = h('div.clock');
    this.pvTimer = h('div.clock', { title: 'Click to reset', style: 'cursor:pointer', onclick: () => { this.t0 = Date.now(); } });
    pv.append(
      h('div.notes', {}, [h('h4', { text: 'Speaker notes' }), this.pvNow, this.pvBody]),
      h('div.bottom', {}, [this.pvTimer, this.pvClock, h('div.next', {}, [h('small', { text: 'Next' }), this.pvNext, this.pvStep])]),
    );
    document.body.append(pv);
    const tick = () => {
      const e = Math.floor((Date.now() - this.t0) / 1000);
      this.pvTimer.innerHTML = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}<small>Elapsed</small>`;
      const d = new Date();
      this.pvClock.innerHTML = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}<small>Time</small>`;
    };
    tick(); setInterval(tick, 1000);
  }

  updatePresenter() {
    if (!this.presenter) return;
    const spec = this.specs[this.cur];
    const next = this.specs[this.cur + 1];
    this.pvNow.innerHTML = `${this.cur + 1}. ${spec.title || ''}`;
    const notes = spec.notes;
    this.pvBody.innerHTML = Array.isArray(notes) ? `<ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : (notes || '<span class="muted">No notes for this slide.</span>');
    this.pvNext.innerHTML = next ? `${this.cur + 2}. ${next.title || ''}` : 'End of lecture';
    this.pvStep.textContent = spec.steps ? `Build ${this.step} / ${spec.steps}` : '';
  }

  /* ---------------- Layout ---------------- */
  fit() {
    const r = this.viewport.getBoundingClientRect();
    const sc = Math.min(r.width / W, r.height / H);
    this.stage.style.setProperty('--s', sc);
    document.documentElement.style.setProperty('--s', sc);
    this.scale = sc;
  }

  /* ---------------- Lifecycle ---------------- */
  async mount(i) {
    const st = this.state[i];
    if (!st || st.mounted) return st?.pending;
    st.mounted = true;
    const spec = this.specs[i];
    const sec = this.slides[i];
    st.pending = (async () => {
      try {
        if (spec.visual && sec._visual) {
          st.ctrl = (await spec.visual(sec._visual, { sec, spec, lec: this.lec, deck: this, gsap })) || {};
        }
        // Card-level mini visuals
        const cards = sec.querySelectorAll('.card');
        st.cardCtrls = [];
        for (const c of cards) if (c._viz) st.cardCtrls.push((await c._viz(c._vizEl, { gsap })) || {});
      } catch (err) {
        console.error(`Visual failed on slide ${i + 1}`, err);
      }
    })();
    return st.pending;
  }

  unmount(i) {
    const st = this.state[i];
    if (!st?.mounted) return;
    try { st.ctrl?.destroy?.(); st.cardCtrls?.forEach((c) => c.destroy?.()); } catch (e) { console.warn(e); }
    const spec = this.specs[i];
    const sec = this.slides[i];
    if (spec.visual && sec._visual && !spec.cards) sec._visual.innerHTML = '';
    st.mounted = false; st.ctrl = null; st.pending = null;
  }

  /* ---------------- Navigation ---------------- */
  start() {
    const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
    const i = m ? Math.min(this.specs.length - 1, Math.max(0, +m[1] - 1)) : 0;
    const s = m && m[2] ? +m[2] : 0;
    this.bindInput();
    this.go(i, s, { instant: true });
    if (this.channel) this.channel.onmessage = (e) => {
      const d = e.data;
      if (d?.t === 'nav' && (d.i !== this.cur || d.s !== this.step)) { this.remote = true; this.go(d.i, d.s); this.remote = false; }
    };
  }

  next() {
    const spec = this.specs[this.cur];
    if (this.step < (spec.steps || 0)) return this.setStep(this.step + 1, 1);
    if (this.cur < this.specs.length - 1) this.go(this.cur + 1, 0);
  }

  prev() {
    if (this.step > 0) return this.setStep(this.step - 1, -1);
    if (this.cur > 0) this.go(this.cur - 1, this.specs[this.cur - 1].steps || 0);
  }

  go(i, s = 0, { instant = false } = {}) {
    if (i < 0 || i >= this.specs.length) return;
    hideTip();
    const prevI = this.cur;
    if (i === prevI) { this.setStep(s, s > this.step ? 1 : -1); return; }
    const dir = i > prevI ? 1 : -1;
    this.cur = i;
    this.step = s;

    // Keep a small window of slides alive (WebGL contexts are precious).
    for (let k = 0; k < this.specs.length; k++) if (Math.abs(k - i) > 2) this.unmount(k);

    const inEl = this.slides[i];
    const outEl = prevI >= 0 ? this.slides[prevI] : null;
    if (outEl) {
      const st = this.state[prevI];
      try { st.ctrl?.leave?.(); } catch (e) { console.warn(e); }
      outEl.classList.remove('is-current');
      outEl.classList.add('is-leaving');
      gsap.killTweensOf(outEl);
      gsap.to(outEl, {
        opacity: 0, scale: dir > 0 ? 0.985 : 1.012, duration: instant ? 0 : 0.42, ease: 'power2.inOut',
        onComplete: () => { outEl.classList.remove('is-leaving'); gsap.set(outEl, { scale: 1 }); },
      });
    }
    inEl.classList.add('is-current');
    gsap.killTweensOf(inEl);
    gsap.fromTo(inEl, { opacity: 0, scale: dir > 0 ? 1.012 : 0.988 }, { opacity: 1, scale: 1, duration: instant ? 0.3 : 0.8, ease: 'expo.out', delay: instant ? 0 : 0.12 });
    const rv = inEl.querySelectorAll('.rv, .rv-card');
    gsap.fromTo(rv, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.055, delay: instant ? 0.05 : 0.2 });
    if (inEl._visual) gsap.fromTo(inEl._visual, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power2.out', delay: instant ? 0.05 : 0.28 });

    this.applyStepDOM(inEl, s, true);
    const st = this.state[i];
    this.mount(i).then(() => {
      if (this.cur !== i) return;
      try { st.ctrl?.enter?.(); st.ctrl?.step?.(this.step, 0); } catch (e) { console.warn(e); }
    });
    // Preload neighbours a little later so the transition stays smooth.
    setTimeout(() => { if (this.cur === i) { this.mount(i + 1); this.mount(i - 1); } }, 900);

    this.afterNav();
  }

  setStep(s, dir) {
    const spec = this.specs[this.cur];
    s = Math.max(0, Math.min(spec.steps || 0, s));
    if (s === this.step && dir !== 0) return;
    this.step = s;
    this.applyStepDOM(this.slides[this.cur], s, false);
    try { this.state[this.cur].ctrl?.step?.(s, dir); } catch (e) { console.warn(e); }
    this.afterNav();
  }

  applyStepDOM(sec, s, instant) {
    sec.querySelectorAll('.stepped').forEach((li) => {
      const vis = s >= +li.dataset.step;
      gsap.to(li, { opacity: vis ? 1 : 0, y: vis ? 0 : 18, duration: instant ? 0 : 0.6, ease: 'expo.out', delay: instant ? 0 : 0.05 });
    });
    const spec = this.specs[+sec.dataset.i];
    if (spec?.focus) { // focus mode: highlight bullet == step, dim others
      sec.querySelectorAll('.bullets li').forEach((li, k) => li.classList.toggle('dim', s > 0 && k !== s - 1));
    }
  }

  afterNav() {
    const n = this.specs.length;
    this.countEl.textContent = `${this.cur + 1} / ${n}`;
    this.progress.style.transform = `scaleX(${(this.cur + 1) / n})`;
    const hash = `#${this.cur + 1}${this.step ? `.${this.step}` : ''}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    if (this.channel && !this.remote) this.channel.postMessage({ t: 'nav', i: this.cur, s: this.step });
    this.updatePresenter();
    if (document.body.classList.contains('overview')) this.renderOverview();
  }

  /* ---------------- Modes ---------------- */
  toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    this.themeBtn.innerHTML = icon(getTheme() === 'dark' ? 'sun' : 'moon');
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  openPresenter() {
    const url = new URL(location.href);
    url.searchParams.set('presenter', '1');
    url.hash = `#${this.cur + 1}`;
    window.open(url.toString(), `presenter-${this.lec.id}`, 'width=1400,height=860');
  }

  toggleOverview(force) {
    const on = force ?? !document.body.classList.contains('overview');
    document.body.classList.toggle('overview', on);
    if (on) this.renderOverview();
  }

  renderOverview() {
    const ov = this.overview;
    ov.innerHTML = '';
    ov.append(h('h2', { text: this.lec.title }), h('p.ov-sub', { text: `${this.specs.length} slides · click to jump · Esc to close` }));
    const grid = h('div.grid');
    this.specs.forEach((sp, i) => {
      const b = h('button.ov', { onclick: () => { this.toggleOverview(false); this.go(i, 0); } }, [
        h('span.n', { text: String(i + 1).padStart(2, '0') }),
        h('span.t', { html: stripTags(sp.title || '') }),
        h('span.e', { html: stripTags(sp.eyebrow || '') }),
      ]);
      if (i === this.cur) b.classList.add('cur');
      grid.append(b);
    });
    ov.append(grid);
  }

  /* ---------------- Input ---------------- */
  bindInput() {
    let jump = '', jumpT;
    const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isField(e.target) && e.target.type !== 'range') return;
      const k = e.key;
      const body = document.body;
      if (/^\d$/.test(k)) {
        jump += k; this.jumpEl.textContent = jump; this.jumpEl.classList.add('on');
        clearTimeout(jumpT); jumpT = setTimeout(() => { jump = ''; this.jumpEl.classList.remove('on'); }, 1600);
        return;
      }
      if (k === 'Enter' && jump) { this.go(+jump - 1, 0); jump = ''; this.jumpEl.classList.remove('on'); return; }
      if (e.target.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return; // let sliders work
      switch (k) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); this.next(); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': e.preventDefault(); this.prev(); break;
        case 'Home': this.go(0, 0); break;
        case 'End': this.go(this.specs.length - 1, 0); break;
        case 'o': case 'O': this.toggleOverview(); break;
        case 'Escape':
          if (body.classList.contains('overview')) this.toggleOverview(false);
          body.classList.remove('help', 'laser', 'blackout');
          break;
        case 'f': case 'F': this.toggleFullscreen(); break;
        case 't': case 'T': this.toggleTheme(); break;
        case 'b': case 'B': case '.': body.classList.toggle('blackout'); break;
        case 'l': case 'L': body.classList.toggle('laser'); break;
        case 's': case 'S': this.openPresenter(); break;
        case '?': case 'h': case 'H': body.classList.toggle('help'); break;
        default:
      }
    });

    // Idle chrome + laser
    let idleT;
    const wake = () => {
      document.body.classList.remove('idle');
      clearTimeout(idleT);
      idleT = setTimeout(() => { if (!this.toolbar.matches(':hover')) document.body.classList.add('idle'); }, 2600);
    };
    window.addEventListener('pointermove', (e) => {
      wake();
      if (document.body.classList.contains('laser')) {
        this.laser.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      }
    });
    wake();

    // Swipe
    let sx = null, sy = null;
    this.viewport.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { sx = e.clientX; sy = e.clientY; } });
    this.viewport.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? this.next() : this.prev());
      sx = sy = null;
    });
  }
}

function stripTags(s) { return String(s).replace(/<[^>]*>/g, ''); }
