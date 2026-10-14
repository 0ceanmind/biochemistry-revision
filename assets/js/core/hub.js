// Landing page: live 3D hero + lecture grid + quiz entry points.
import { h, icon, initTheme, setTheme, getTheme, store } from './util.js';
import { LECTURES } from './catalog.js';

export async function bootHub() {
  initTheme();
  document.body.classList.add('hub');
  const counts = await fetch('assets/data/quiz/index.json').then((r) => r.json()).catch(() => ({}));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const bests = store.getJSON('biochem.quiz.best', {});

  const themeBtn = h('button.icon-btn', { title: 'Light / dark', html: icon(getTheme() === 'dark' ? 'sun' : 'moon'), onclick: () => { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); themeBtn.innerHTML = icon(getTheme() === 'dark' ? 'sun' : 'moon'); } });
  const nav = h('nav.h-nav', {}, [
    h('a.brand', { href: './' }, [h('img', { src: 'assets/img/icon.svg', alt: '' }), h('span', { text: 'Biochemistry' })]),
    h('span.sp'),
    h('a.lnk', { href: '#lectures', text: 'Lectures' }),
    h('a.lnk', { href: 'quiz.html?l=all', text: 'Mixed exam' }),
    h('a.lnk', { href: '#present', text: 'Presenting' }),
    themeBtn,
  ]);

  const stage = h('div.stage3d');
  const hero = h('header.h-hero', {}, [
    h('div.glow'),
    h('div', {}, [
      h('div.eyebrow', { text: 'MD Programme · Biochemistry revision' }),
      h('h1', { html: 'Biochemistry,<br><em>alive.</em>' }),
      h('p.lead', { text: 'Eleven lectures rebuilt as interactive keynotes — real 3D molecules and proteins, live pathways and charts you can drive — plus an exam-style question bank for every chapter.' }),
      h('div.cta', {}, [
        h('a.btn.primary', { href: '#lectures', html: `${icon('play')}<span>Choose a lecture</span>` }),
        h('a.btn', { href: 'quiz.html?l=all', html: `${icon('quiz')}<span>Mixed exam</span>` }),
      ]),
    ]),
    stage,
  ]);

  const stats = h('section.h-stats', {}, [
    stat(LECTURES.length, 'lectures'),
    stat(total || '—', 'exam-style MCQs'),
    stat('30+', 'live 3D models'),
    stat('100%', 'sourced from the lectures'),
  ]);

  const grid = h('div.h-grid');
  LECTURES.forEach((l) => {
    const q = counts[l.id] || 0;
    const words = l.title.split(' ');
    const lastWord = words.pop();
    const card = h('article.h-card', { style: `--c1:${l.accent[0]};--c2:${l.accent[1]}` }, [
      h('div.orb'),
      h('div.num', { text: `${String(l.n).padStart(2, '0')} · ${l.codes}` }),
      h('h3', { html: `${words.join(' ')} <span>${lastWord}</span>` }),
      h('p', { text: l.tagline }),
      h('div.meta', {}, [
        l.lecturer ? h('span', { text: l.lecturer }) : null,
        h('span', { text: `${q} questions` }),
        bests[l.id] !== undefined ? h('span', { text: `best ${bests[l.id]}%` }) : null,
      ]),
      h('div.acts', {}, [
        h('a.btn.go', { href: `deck.html?l=${l.id}`, html: `${icon('play')}<span>Present</span>` }),
        h('a.btn', { href: `quiz.html?l=${l.id}`, html: `${icon('quiz')}<span>Quiz</span>` }),
      ]),
    ]);
    grid.append(card);
  });
  grid.append(h('article.h-card.h-card-all', { style: '--c1:#0a84ff;--c2:#bf5af2' }, [
    h('div.orb'),
    h('div.num', { text: 'ALL · L.1 – L.55' }),
    h('h3', { html: 'Mixed <span>exam</span>' }),
    h('p', { text: `Every lecture, shuffled into one paper — ${total || 490} questions.` }),
    h('div.meta', {}, [h('span', { text: 'practice or exam mode' })]),
    h('div.acts', {}, [h('a.btn.go', { href: 'quiz.html?l=all', html: `${icon('quiz')}<span>Start</span>` })]),
  ]));
  const lectures = h('section.h-sec', { id: 'lectures' }, [
    h('h2', { text: 'Eleven lectures.' }),
    h('p.sub', { text: 'In curriculum order. Each deck runs full-screen on any display — hover marked items for detail, press → to build, S for speaker notes.' }),
    grid,
  ]);

  const keys = [[['→', 'Space'], 'Next build / slide'], [['S'], 'Presenter view: notes, timer, next slide'], [['O'], 'Overview of every slide'], [['L'], 'Laser pointer'], [['B'], 'Black screen'], [['T'], 'Light / dark theme'], [['F'], 'Fullscreen']];
  const present = h('section.h-sec', { id: 'present' }, [
    h('div.h-exam', {}, [
      h('div.h-panel', {}, [
        h('h3', { html: 'Built for the <span class="grad-text" style="--grad:linear-gradient(110deg,#ff9f0a,#ff375f)">big screen.</span>' }),
        h('p', { text: 'A fixed 16:9 stage scales crisply to any projector. Text stays minimal on screen; the detail lives in hover cards and in your speaker notes.' }),
        h('div.h-keys', {}, keys.flatMap(([k, d]) => [h('div.k', {}, k.map((x) => h('span.kbd', { text: x }))), h('div', { text: d })])),
      ]),
      h('div.h-panel', {}, [
        h('h3', { text: 'Test the whole course.' }),
        h('p', { text: `${total || 'All'} single-best-answer questions across all eleven lectures, shuffled into one exam. Practice mode explains every answer; exam mode marks at the end.` }),
        h('a.btn.accent', { href: 'quiz.html?l=all', style: '--grad:linear-gradient(110deg,#0a84ff,#bf5af2)', html: `${icon('quiz')}<span>Start mixed exam</span>` }),
      ]),
    ]),
  ]);

  const foot = h('footer.h-foot', {}, [
    h('div', { html: '<b>Sources.</b> Content follows the NUST College of Medicine & Health Sciences lecture slides and their cited references (Lippincott Illustrated Reviews: Biochemistry; Marks’ Basic Medical Biochemistry). Where a slide disagreed with the textbook, the textbook version is shown and the difference is noted.' }),
    h('div', { html: '<b>Questions.</b> Original exam-style items written from the lectures in the NUST/OMC single-best-answer format — no official past papers were publicly available.' }),
    h('div', { html: '<b>3D data.</b> Molecular coordinates from PubChem (NCBI); protein structures from the RCSB Protein Data Bank (4HHB, 1A6M, 1PGA, 1CAG, 4INS, 1HRC, 1V4T, 1V4S, 1DGF, 1CRN). Rendered with three.js.' }),
  ]);

  document.body.append(nav, hero, stats, lectures, present, foot);

  // 3D hero: hemoglobin with its four hemes
  try {
    const [{ createScene }, { loadPDB, buildProtein }] = await Promise.all([import('../viz/three-kit.js'), import('../viz/protein.js')]);
    const kit = createScene(stage, { autoRotate: 0.9, cam: [0, 10, 120], hint: false });
    const p = buildProtein(await loadPDB('4HHB'), { colorBy: 'chain', chainColors: [0xff375f, 0xff9f0a, 0xbf5af2, 0x0a84ff], hets: ['HEM'], hetScale: 1.15 });
    kit.root.add(p);
    kit.fit(p, 0.98);
    kit.start();
    stage.append(h('div.cap', { text: 'Haemoglobin · PDB 4HHB · drag to rotate' }));
  } catch (e) { console.warn(e); }
}

function stat(v, k) { return h('div.s', {}, [h('div.v', { text: String(v) }), h('div.k', { text: k })]); }
