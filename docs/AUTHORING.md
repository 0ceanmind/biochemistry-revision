# Authoring a lecture deck

Every lecture is one ES module: `assets/js/lectures/<id>.js` exporting `{ references, slides }`.
The engine (`assets/js/core/deck.js`) renders it on a fixed **1920 × 1080 stage** that scales to any
screen. The finished exemplar is **`assets/js/lectures/glycolysis.js`** — read it fully before writing.

Open a deck: `http://localhost:8765/deck.html?l=<id>` (python http.server on port 8765 serves the repo root).

---

## 1. The non-negotiable design rules (the user will be judged on these)

1. **Minimal on-screen text.** A slide shows a title + at most **3–4 bullets**, each **≤ 7 words**
   (a short phrase, not a sentence). No paragraphs on slides. The presenter explains verbally.
2. **Details live in hover cards** (`tip`), and the full explanation lives in **speaker `notes`**.
   Every bullet that compresses an idea should carry a `tip` with the precise detail.
3. **Every slide has a live visual** (3D model, animated diagram, interactive chart, or animated cards).
   Visuals are the star; Apple-keynote clean: generous space, one accent, no clutter, nothing decorative
   that doesn't teach.
4. **Large-screen legibility.** Stage px: body bullets 38, diagram labels ≥ 24 (prefer 26–30),
   numbers big. Never put text below 20px. Test at 1920×1080.
5. **Accuracy is critical (academic).** Every fact must come from the lecture slides (the notes file) or
   the lecture's cited reference (Lippincott unless stated). Never invent numbers. If the notes'
   "Accuracy flags" say a slide is wrong, either avoid that claim or present the textbook-correct
   version (and mention the discrepancy in the tip/notes). When a curve is schematic say so in `src`
   (e.g. "curve shapes illustrative"). Cite the slide numbers in `src`.
6. Use step builds (`steps`) to reveal complex visuals progressively so the presenter controls pacing.

## 2. Slide spec

```js
{
  layout: 'split' | 'full' | 'hero' | 'statement' | 'cards',   // default 'split'
  class: 'cards-3' | 'cards-2x2' | 'wide-text' | 'narrow-text' | 'reverse', // optional modifiers
  eyebrow: 'Section label',            // small caps line above the title
  title: 'Title with <em>accent</em>', // <em> = gradient accent word. Keep ≤ 6 words.
  subtitle: '…',                       // statement/hero only; subtitleStep: 1 reveals it on build 1
  bullets: [ 'plain', { t: 'html', tip: 'string' | {kicker,title,body,list,chips,src}, step: 1, sub: 'small line' } ],
  meta: ['pill', 'pill'],              // hero only
  cards: [ { icon, k, big, title, body, list, tip, viz:(el)=>ctrl, style } ], // layout 'cards'
  visual: (el, ctx) => controller,     // build the visual into el (may be async)
  steps: N,                            // number of → presses consumed inside this slide
  focus: true,                         // optional: highlight bullet == current step, dim others
  src: 'Lecture slide 7 · Lippincott Ch 8',
  notes: 'string' | ['bullet', 'bullet'] // presenter view (press S). Put the real explanation here.
}
```

Layout geometry (stage px): **split** visual area ≈ **960 × 860** (text column 680 on the left);
**full** visual area ≈ **1712 × 720** (title row on top; `bullets` render as small inline chips on the
right of the title row — max 2 short ones); **hero** visual ≈ 740 × 940; **statement** visual 1500 × 360.
For SVG diagrams use exactly these viewBox sizes so 1 SVG unit = 1 stage px.

### Visual controller
`visual(el)` returns (optionally async) an object with any of:
`enter()` (slide became current – start loops), `leave()` (pause), `step(n, dir)` (build n, **must be
idempotent**: set the full state for build n, forward or backward), `destroy()` (free resources).
Three.js visuals: return the `kitController(kit, extra)` result (it starts/stops the render loop).
Slides more than 2 away are destroyed automatically (WebGL contexts are limited).

## 3. Toolkit (import from `../viz/*.js`, `../core/*.js`)

| Module | What |
|---|---|
| `core/util.js` | `h(tag, attrs, children)` HTML, `s(tag, attrs)` SVG, `setRich(textEl, 'CO_{2} Fe^{2+}')`, `countTo(el, n)`, `icon(name)`, `store` |
| `core/tip.js` | `tip(el, {kicker,title,body,list,chips,src})` — hover card on any element. SVG/HTML elements may also carry `data-tip='{"title":…}'` |
| `viz/diagram.js` | `diagram(el, w, h)` → `{ region, node, arrow, flow, badge, text, nodes, edges, layers, destroy }`; `show(els, on)`, `drawPath(arrow)` |
| `viz/chart.js` | `chart(el, {w,h,pad,x:{min,max,label,ticks,fmt},y:{…}})` → `line(fn|pts, {color,width,label,labelAt,area,dash})` (handle: `update`, `draw`, `show`), `point`, `vline`, `hline` (`labelTop`), `text`, `sx/sy` |
| `viz/controls.js` | `slider({label,min,max,step,value,fmt,onInput,width})`, `seg({options:[{v,t}],value,onChange})`, `toggle({label,on,onChange,danger})`, `ctrlBar(el, items, {left,right,top,bottom})` |
| `viz/three-kit.js` | `createScene(el, {cam, fov, autoRotate, orbit, zoom})` → kit `{scene, camera, root, label(html,[x,y,z],{cls,parent,tip}), onFrame(fn), fit(obj, fill), start, stop}`; `THREE`, `glossy`, `matte`, `glass`, `glow`, `glowSprite`, `cylinderBetween`, `ease`, `kitController` |
| `viz/molecule.js` | `molecule(key, opts)` / `loadMol` + `buildMolecule(data, {hideH, highlight:{atoms,color}, scale, spacefill})` — **real PubChem 3D coordinates**; `userData.pos[i]` = atom positions |
| `viz/protein.js` | `loadPDB(id)` + `buildProtein(pdb, {chains, colorBy:'ss'|'chain'|'rainbow'|fn, hets:true|['HEM']})` cartoon ribbons from real PDB; `buildAtoms(pdb,{chain,from,to,backboneOnly})`; `proteinMorph()` real glucokinase open→closed induced fit (`setT(0..1)`) |
| `viz/scenes.js` | `moleculeScene(el, key, {fill, mol, labels:[{atom,text}]})` (+ `.swap(key)`), `rbcScene(el)` (`.morph(0..1)` biconcave → spiculated), `cellScene(el)` |

**Molecules available** (`assets/data/mol/<key>.json`): glycine ala d-ala ser cys pro phe tyr trp his lys
arg asp glu val leu ile met thr asn gln beta-ala gly-ala cystine · glyceraldehyde dha glucose-open
a-glucose b-glucose fructose fructose-open galactose mannose ribose deoxyribose maltose lactose sucrose
cellobiose glucuronic sorbitol glucosamine · palmitic stearic(2d) oleic elaidic linoleic linolenic
arachidonic butyric propionic capric cholesterol glycerol glycerol-3-p sphingosine choline ethanolamine
inositol epa dha-fa · g6p f6p f16bp g3p dhap 13bpg 3pg 2pg pep pyruvate lactate 23bpg atp adp amp nad
nadh g1p udp-glucose camp citrate isocitrate akg succinate fumarate maleate malate oaa cis-aconitate tpp
lipoic thiamine malonate fluoroacetate · ubiquinone dnp rotenone antimycin cyanide dicoumarol salicylate
amobarbital · ala-delta pbg protoporphyrin bilirubin biliverdin urobilinogen stercobilin
coproporphyrinogen (heme, uroporphyrinogen, hmb are 2D/planar) · folic thf methotrexate homocysteine mma
paba (b12 is 2D only — draw it schematically instead) · allopurinol hypoxanthine xanthine uric enalapril
lovastatin atorvastatin mevalonate penicillin ethanol methanol aspirin urea.
**Proteins** (`assets/data/pdb`): 1PGA (protein G: helix + 4-strand sheet, full atoms), 4HHB
(hemoglobin + HEM), 1A6M (myoglobin + HEM), 1CAG (collagen triple helix, full atoms), 4INS (insulin,
full atoms), 1HRC (cytochrome c + HEC), 1V4T/1V4S (glucokinase open/closed), GK-morph, 1DGF (catalase
tetramer), 1CRN (crambin, full atoms). Heme 3D coordinates: use `pdb.het` HEM of 4HHB/1A6M.

**Icons for cards** (`icon:` on a card): rbc eye bolt alert heart drop sun pill flask clock shield lock
flame leaf bone scissors layers cycle atom chain hex target gauge baby person stomach fish plus minus.

**Semantic colours** (CSS vars, theme-aware — use them consistently): `--atp` gold, `--nadh` cyan,
`--fadh` purple, `--elec` electrons/glucose blue, `--prot` protons/orange, `--act` activator green,
`--inh` inhibitor/deficiency red, `--co2` grey, `--a1/--a2` lecture accent, `--ink` accent text,
`--fg/--fg-2/--fg-3` text tiers, `--surface/--surface-2/--line` surfaces. Never hard-code white/black
text — the deck has a light theme (press T) and everything must stay legible in both.
For three.js materials use hex numbers (they don't follow the theme — choose mid-tones that work on
black and white backgrounds).

## 4. Quality bar & process

1. Plan the deck from the notes: typically **18–24 slides** covering every SLO. Suggested arc:
   hero → SLOs (cards-3) → (clinical case teaser if the lecture has one) → concept slides →
   interactive showpieces → clinical correlations → case/critical-thinking reveal slides → summary
   cards (big numbers). The engine appends the closing "test yourself + references" slide.
2. At least **3 genuine 3D scenes** per deck and **2+ interactive** (slider/toggle) visuals, plus
   animated diagrams elsewhere. Prefer real molecules/proteins where they teach something.
3. Speaker `notes` for every slide (3–6 points, the detail the presenter will say).
4. **Render & inspect your work**: from the screenshot-tool folder
   run `node shoot.mjs <id> all` (final build of every slide) or `node shoot.mjs <id> 3,7.2,9`
   (slide.build). PNGs land in `shots/<id>/sNN_<build>.png` at 1920×1080 — open them with
   the Read tool and fix overlaps, clipping, tiny text, empty space, ugly 3D framing. Console errors are
   printed. Also check the light theme for a few slides: `node shoot.mjs <id> 1,5 --theme light`.
   Iterate until every slide looks keynote-quality.
5. Do **not** edit shared files (`assets/js/core/*`, `assets/js/viz/*`, `assets/css/*`, `deck.html`,
   other lectures). If you need a helper, write it inside your lecture file. If you hit an engine bug,
   work around it locally and report it in your final message.
