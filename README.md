# Biochemistry, alive.

Eleven MD-programme biochemistry lectures rebuilt as interactive, keynote-style revision presentations — real 3D molecules (PubChem) and proteins (RCSB PDB), live animated pathways and slider-driven charts — plus an exam-style single-best-answer question bank for every lecture.

**Live site:** https://0ceanmind.github.io/biochemistry-revision/

## Lectures
Carbohydrates · Amino acids & proteins · Lipids · Enzyme classification & kinetics · Enzyme inhibition & regulation · Oxidative phosphorylation & ETC · Glycolysis · PDH complex & TCA cycle · Glycogen metabolism · Heme metabolism · Iron, vitamin B₁₂ & folic acid

## Presenting
Open a lecture and use the keyboard (or a presentation clicker):

| Key | Action |
|---|---|
| → / Space / PageDown | next build or slide |
| ← / PageUp | previous |
| S | presenter view (speaker notes, timer, next slide) — synced across windows |
| O | overview of all slides |
| L | laser pointer · B black screen · T light/dark · F fullscreen |
| 12 ↵ | jump to slide 12 |

Hover any underlined bullet, node or chip to reveal the detail card.

## Question bank
490 original single-best-answer items (5 options, clinical vignettes) written from the lecture slides and their cited references, in the NUST/OMC MD exam format. No official past papers were publicly available, so none are reproduced. Each item was independently audited for accuracy.

## Sources
Content follows the NUST College of Medicine & Health Sciences lecture slides and their references (Lippincott Illustrated Reviews: Biochemistry; Marks’ Basic Medical Biochemistry). Where a slide disagreed with the textbook, the textbook version is used and the difference noted. 3D data: PubChem (NCBI) and RCSB PDB (4HHB, 1A6M, 1PGA, 1CAG, 4INS, 1HRC, 1V4T, 1V4S, 1DGF, 1CRN).

## Tech
Static site, no build step: vanilla ES modules, three.js, GSAP, Inter. Serve the folder with any static server, e.g. `python -m http.server`.
