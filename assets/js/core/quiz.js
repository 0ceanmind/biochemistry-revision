// MCQ engine: practice (instant feedback) or exam (review at end), keyboard-first.
import { h, icon, initTheme, setTheme, getTheme, store } from './util.js';
import { LECTURES, byId } from './catalog.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const BEST_KEY = 'biochem.quiz.best';

export async function bootQuiz() {
  initTheme();
  const params = new URLSearchParams(location.search);
  const id = params.get('l') || 'all';
  const meta = byId(id);
  const lecs = meta ? [meta] : LECTURES;
  const accent = meta ? meta.accent : ['#0a84ff', '#bf5af2'];
  document.documentElement.style.setProperty('--a1', accent[0]);
  document.documentElement.style.setProperty('--a2', accent[1]);
  document.title = `${meta ? meta.title : 'Mixed exam'} · Questions`;

  const banks = await Promise.all(lecs.map((l) => fetch(`assets/data/quiz/${l.id}.json`).then((r) => r.json()).catch(() => null)));
  const pool = [];
  banks.forEach((b, i) => b?.questions?.forEach((q) => pool.push({ ...q, lec: lecs[i].id, lecTitle: lecs[i].short || lecs[i].title })));

  const app = new Quiz({ id, meta, pool, provenance: banks.find(Boolean)?.provenance });
  app.mount();
}

class Quiz {
  constructor({ id, meta, pool, provenance }) {
    this.id = id; this.meta = meta; this.pool = pool; this.provenance = provenance;
    this.opts = { mode: 'practice', count: 20, type: 'all' };
  }

  mount() {
    document.body.classList.add('quiz');
    document.body.append(h('div.q-ambient'));
    this.timerEl = h('span.timer');
    this.themeBtn = h('button.icon-btn', { title: 'Theme', html: icon(getTheme() === 'dark' ? 'sun' : 'moon'), onclick: () => { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); this.themeBtn.innerHTML = icon(getTheme() === 'dark' ? 'sun' : 'moon'); } });
    const top = h('header.q-top', {}, [
      h('a.crumb', { href: './', html: `${icon('prev')}<span>Lectures</span>` }),
      h('span', { style: 'color:var(--line-2)', text: '/' }),
      h('span.title', { text: this.meta ? this.meta.title : 'Mixed exam · all lectures' }),
      h('span.spacer'),
      this.timerEl,
      this.meta ? h('a.btn', { href: `deck.html?l=${this.meta.id}`, style: 'height:40px;font-size:14px', html: `${icon('play')}<span>Lecture</span>` }) : null,
      this.themeBtn,
    ]);
    this.main = h('main.q-wrap');
    document.body.append(top, this.main);
    document.addEventListener('keydown', (e) => this.onKey(e));
    setInterval(() => this.tick(), 1000);
    this.renderStart();
  }

  tick() {
    if (!this.t0 || this.finished) { this.timerEl.textContent = ''; return; }
    const s = Math.floor((Date.now() - this.t0) / 1000);
    this.timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /* ---------------- Start ---------------- */
  renderStart() {
    this.t0 = null; this.finished = false;
    const best = store.getJSON(BEST_KEY, {})[this.id];
    const types = ['clinical', 'application', 'recall'];
    const count = (t) => this.pool.filter((q) => t === 'all' || q.type === t).length;
    const seg = (key, options) => {
      const wrap = h('div.q-seg');
      options.forEach(([v, t]) => {
        const b = h('button', { html: t, onclick: () => { this.opts[key] = v; [...wrap.children].forEach((c) => c.classList.toggle('on', c === b)); } });
        if (this.opts[key] === v) b.classList.add('on');
        wrap.append(b);
      });
      return wrap;
    };
    const titleHTML = this.meta ? `${this.meta.title.replace(/(\S+)$/, '<em>$1</em>')}` : 'Mixed <em>exam</em>';
    this.main.innerHTML = '';
    this.main.append(
      h('section.q-hero', {}, [
        h('div.eyebrow', { text: this.meta ? `Question bank · ${this.meta.codes}` : 'Question bank · all 11 lectures' }),
        h('h1', { html: titleHTML }),
        h('p', { text: 'Single-best-answer questions in the NUST MD exam style — clinical vignettes, mechanisms and core recall. Every answer comes with an explanation and its lecture source.' }),
        h('div.q-stats', {}, [
          stat(this.pool.length, 'questions'),
          stat(count('clinical'), 'clinical vignettes'),
          stat(best !== undefined ? `${best}%` : '—', 'your best'),
        ]),
      ]),
      h('section.q-setup', {}, [
        h('div.q-row', {}, [h('span.lab', { text: 'Mode' }), seg('mode', [['practice', 'Practice · instant feedback'], ['exam', 'Exam · review at end']])]),
        h('div.q-row', {}, [h('span.lab', { text: 'Questions' }), seg('count', [[10, '10'], [20, '20'], [40, '40'], ['all', `All ${this.pool.length}`]])]),
        h('div.q-row', {}, [h('span.lab', { text: 'Type' }), seg('type', [['all', 'All types'], ...types.map((t) => [t, `${t[0].toUpperCase()}${t.slice(1)} (${count(t)})`])])]),
      ]),
      h('div.q-start', {}, [
        h('button.btn.accent', { html: `${icon('play')}<span>Start</span>`, onclick: () => this.start() }),
        this.meta ? h('a.btn', { href: `deck.html?l=${this.meta.id}`, text: 'Revise the lecture first' }) : null,
      ]),
      h('p.q-note', { text: this.provenance || '' }),
    );
    this.focusable = null;
  }

  start(fromSet) {
    let set = fromSet;
    if (!set) {
      set = this.pool.filter((q) => this.opts.type === 'all' || q.type === this.opts.type);
      set = shuffle(set.slice());
      if (this.opts.count !== 'all') set = set.slice(0, this.opts.count);
    }
    this.set = set.map((q) => {
      const perm = shuffle([0, 1, 2, 3, 4].slice(0, q.options.length));
      return { q, perm, correct: perm.indexOf(q.answer), choice: null, flagged: false };
    });
    this.idx = 0; this.t0 = Date.now(); this.finished = false;
    this.renderQuestion();
  }

  /* ---------------- Question ---------------- */
  renderQuestion() {
    const it = this.set[this.idx];
    const q = it.q;
    const practice = this.opts.mode === 'practice';
    const answered = it.choice !== null;
    this.main.innerHTML = '';
    const prog = h('div.q-progress', {}, this.set.map((s, i) => {
      const cls = i === this.idx ? 'cur' : s.choice === null ? '' : practice ? (s.choice === s.correct ? 'ok' : 'bad') : 'done';
      return h('i', { class: `${cls}${s.flagged ? ' flag' : ''}` });
    }));
    const meta = h('div.q-meta', {}, [
      h('span.n', { text: `${String(this.idx + 1).padStart(2, '0')} / ${this.set.length}` }),
      q.type ? h('span', { class: `tag type-${q.type}`, text: q.type }) : null,
      q.topic ? h('span.tag', { text: q.topic }) : null,
      this.id === 'all' ? h('span.tag', { text: q.lecTitle }) : null,
    ]);
    const stem = h('p.q-stem', { text: q.stem });
    const opts = h('div.q-opts');
    this.optEls = it.perm.map((orig, k) => {
      const b = h('button.q-opt', { onclick: () => this.choose(k) }, [
        h('span.L', { text: LETTERS[k] }),
        h('span', { text: q.options[orig] }),
        h('span.mark', { html: '' }),
      ]);
      opts.append(b);
      return b;
    });
    this.explainEl = h('div.q-explain');
    const isLast = this.idx === this.set.length - 1;
    this.nextBtn = h('button.btn.primary', { html: `<span>${isLast ? 'Finish' : 'Next'}</span>${icon('arrow')}`, onclick: () => this.next() });
    const actions = h('div.q-actions', {}, [
      !practice && this.idx > 0 ? h('button.btn', { html: `${icon('prev')}<span>Back</span>`, onclick: () => { this.idx--; this.renderQuestion(); } }) : null,
      this.nextBtn,
      !practice ? h('button.btn', { class: `btn${it.flagged ? ' flagged' : ''}`, text: it.flagged ? 'Flagged' : 'Flag', onclick: (e) => { it.flagged = !it.flagged; e.currentTarget.classList.toggle('flagged', it.flagged); e.currentTarget.textContent = it.flagged ? 'Flagged' : 'Flag'; } }) : null,
      h('span.hint', { html: '<span class="kbd">A</span>–<span class="kbd">E</span> choose · <span class="kbd">↵</span> next' }),
    ]);
    this.main.append(prog, meta, stem, opts, this.explainEl, actions);
    if (answered) this.paint(false);
    else if (practice) this.nextBtn.disabled = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  choose(k) {
    const it = this.set[this.idx];
    const practice = this.opts.mode === 'practice';
    if (practice && it.choice !== null) return;
    it.choice = k;
    this.paint(true);
  }

  paint(fresh) {
    const it = this.set[this.idx];
    const practice = this.opts.mode === 'practice';
    this.optEls.forEach((b, k) => {
      b.classList.remove('sel', 'ok', 'bad', 'dim');
      if (!practice) { b.classList.toggle('sel', k === it.choice); return; }
      b.disabled = true;
      const mark = b.querySelector('.mark');
      if (k === it.correct) { b.classList.add('ok'); mark.innerHTML = icon('check'); }
      else if (k === it.choice) { b.classList.add('bad'); mark.innerHTML = icon('x'); }
      else b.classList.add('dim');
    });
    if (practice) {
      this.nextBtn.disabled = false;
      this.showExplain(it, this.explainEl);
      if (fresh) requestAnimationFrame(() => this.explainEl.classList.add('on'));
      else this.explainEl.classList.add('on');
      const segs = this.main.querySelectorAll('.q-progress i');
      segs[this.idx].className = it.choice === it.correct ? 'ok' : 'bad';
    }
  }

  showExplain(it, el) {
    const q = it.q;
    const ok = it.choice === it.correct;
    el.innerHTML = '';
    el.append(
      h('div', { class: `verdict ${ok ? 'ok' : 'bad'}`, html: `${icon(ok ? 'check' : 'x')}<span>${ok ? 'Correct' : `Answer: ${LETTERS[it.correct]}`}</span>` }),
      h('p', { text: q.explain || '' }),
      q.distractors ? h('p', { html: `<b>Why not the others?</b> ${escapeHTML(q.distractors)}` }) : null,
      q.source ? h('div.src', { text: `Source · ${q.source}` }) : null,
    );
  }

  next() {
    const it = this.set[this.idx];
    if (this.opts.mode === 'practice' && it.choice === null) return;
    if (this.idx < this.set.length - 1) { this.idx++; this.renderQuestion(); }
    else this.finish();
  }

  /* ---------------- Results ---------------- */
  finish() {
    const unanswered = this.set.filter((s) => s.choice === null).length;
    if (unanswered && this.opts.mode === 'exam' && !confirm(`${unanswered} question(s) unanswered. Finish anyway?`)) return;
    this.finished = true;
    const total = this.set.length;
    const right = this.set.filter((s) => s.choice === s.correct).length;
    const pct = Math.round((right / total) * 100);
    const secs = Math.floor((Date.now() - this.t0) / 1000);
    const bests = store.getJSON(BEST_KEY, {});
    if (bests[this.id] === undefined || pct > bests[this.id]) { bests[this.id] = pct; store.setJSON(BEST_KEY, bests); }

    const R = 120, C = 2 * Math.PI * R;
    const ring = h('div.q-ring', { html: `<svg viewBox="0 0 280 280"><defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient></defs><circle cx="140" cy="140" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="18"/><circle id="qarc" cx="140" cy="140" r="${R}" fill="none" stroke="url(#qg)" stroke-width="18" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)"/></svg>` }, []);
    const pctEl = h('div.pct', { text: '0%' });
    ring.append(h('div.center', {}, [pctEl, h('div.sub', { text: `${right} of ${total} correct` })]));
    const verdict = pct >= 85 ? 'Excellent.' : pct >= 70 ? 'Solid work.' : pct >= 50 ? 'Getting there.' : 'Time to revise.';
    const mm = `${Math.floor(secs / 60)} min ${secs % 60} s`;

    // topic breakdown
    const topics = {};
    this.set.forEach((s) => { const t = this.id === 'all' ? s.q.lecTitle : (s.q.topic || 'General'); (topics[t] ||= [0, 0]); topics[t][1]++; if (s.choice === s.correct) topics[t][0]++; });
    const rows = Object.entries(topics).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 10);
    const topicEls = rows.map(([t, [r, n]]) => {
      const bar = h('i');
      setTimeout(() => (bar.style.width = `${(r / n) * 100}%`), 200);
      return h('div.q-topic', {}, [h('span', { text: t }), h('div.bar', {}, [bar]), h('span.v', { text: `${r}/${n}` })]);
    });

    const missed = this.set.filter((s) => s.choice !== s.correct);
    this.main.innerHTML = '';
    this.main.append(
      h('div.q-result', {}, [
        ring,
        h('div.q-verdict', {}, [
          h('h2', { text: verdict }),
          h('p', { text: `${this.opts.mode === 'exam' ? 'Exam' : 'Practice'} · ${mm}${unanswered ? ` · ${unanswered} unanswered` : ''}` }),
          h('div.q-topics', {}, topicEls),
          h('div.q-actions', {}, [
            missed.length ? h('button.btn.accent', { text: `Retry ${missed.length} missed`, onclick: () => this.start(missed.map((s) => s.q)) }) : null,
            h('button.btn', { text: 'New set', onclick: () => this.start() }),
            h('button.btn', { text: 'Settings', onclick: () => this.renderStart() }),
          ]),
        ]),
      ]),
      this.reviewList(missed.length ? missed : this.set, missed.length ? 'Review your mistakes' : 'Review all answers'),
    );
    requestAnimationFrame(() => {
      setTimeout(() => {
        const arc = this.main.querySelector('#qarc');
        if (arc) arc.style.strokeDashoffset = String(C * (1 - pct / 100));
        const g = window.gsap; const o = { v: 0 };
        if (g) g.to(o, { v: pct, duration: 1.6, ease: 'expo.out', onUpdate: () => (pctEl.textContent = `${Math.round(o.v)}%`) });
        else pctEl.textContent = `${pct}%`;
      }, 120);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  reviewList(items, title) {
    const sec = h('section.q-review', {}, [h('h3', { text: title })]);
    items.forEach((it) => {
      const q = it.q;
      const ok = it.choice === it.correct;
      const det = h('details.q-item', {}, [
        h('summary', {}, [h('span.st', { html: icon(ok ? 'check' : 'x'), style: `color:${ok ? 'var(--ok)' : 'var(--bad)'}` }), h('span', { text: q.stem })]),
        h('div.body', {}, [
          h('p', { html: `<span class="ans">Correct: ${LETTERS[it.correct]}. ${escapeHTML(q.options[q.answer])}</span>` }),
          it.choice !== null && !ok ? h('p', { html: `<span class="yours">Your answer: ${LETTERS[it.choice]}. ${escapeHTML(q.options[it.perm[it.choice]])}</span>` }) : null,
          h('p', { text: q.explain || '' }),
          q.distractors ? h('p', { html: `<b>Why not the others?</b> ${escapeHTML(q.distractors)}` }) : null,
          q.source ? h('p', { style: 'font-size:13px;color:var(--fg-3)', text: `Source · ${q.source}` }) : null,
        ]),
      ]);
      sec.append(det);
    });
    return sec;
  }

  /* ---------------- Keys ---------------- */
  onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.set || this.finished || !this.optEls) return;
    const k = e.key.toLowerCase();
    const map = { a: 0, b: 1, c: 2, d: 3, e: 4, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
    if (k in map && map[k] < this.optEls.length) { e.preventDefault(); this.choose(map[k]); }
    else if (k === 'enter' || k === 'arrowright') { e.preventDefault(); this.next(); }
    else if (k === 'arrowleft' && this.opts.mode === 'exam' && this.idx > 0) { this.idx--; this.renderQuestion(); }
  }
}

function stat(v, k) { return h('div', {}, [h('div.v', { text: String(v) }), h('div.k', { text: k })]); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
