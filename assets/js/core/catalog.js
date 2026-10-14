// Lecture catalogue, in curriculum order (session codes from each lecture's SLO slide).
// Lecturer names appear only where printed on the original slides.
export const LECTURES = [
  {
    id: 'carbohydrates', n: 1, codes: 'L.1 – L.2',
    title: 'Carbohydrate Chemistry', short: 'Carbohydrates',
    tagline: 'Sugars, isomers and the gel that cushions joints.',
    accent: ['#30d158', '#64d2ff'],
    lecturer: null,
  },
  {
    id: 'amino-acids', n: 2, codes: 'L.3 – L.4',
    title: 'Amino Acids & Proteins', short: 'Amino acids',
    tagline: 'Twenty building blocks. Four levels of shape.',
    accent: ['#bf5af2', '#5e5ce6'],
    lecturer: null,
  },
  {
    id: 'lipids', n: 3, codes: 'L.5',
    title: 'Lipid Chemistry', short: 'Lipids',
    tagline: 'Fatty acids, membranes and cholesterol.',
    accent: ['#ffd60a', '#ff9f0a'],
    lecturer: 'Dr. Vijaya Marakala',
  },
  {
    id: 'enzyme-kinetics', n: 4, codes: 'L.6 – L.7',
    title: 'Enzyme Classification & Kinetics', short: 'Enzyme kinetics',
    tagline: 'How enzymes are named, how they work, how fast they go.',
    accent: ['#64d2ff', '#0a84ff'],
    lecturer: 'Dr. Gulam Saidunnisa',
  },
  {
    id: 'enzyme-inhibition', n: 5, codes: 'L.8 – L.9',
    title: 'Enzyme Inhibition & Regulation', short: 'Inhibition',
    tagline: 'Switching enzymes off — and on.',
    accent: ['#5e5ce6', '#ff375f'],
    lecturer: 'Dr. Gulam Saidunnisa',
  },
  {
    id: 'oxphos', n: 6, codes: 'L.10',
    title: 'Oxidative Phosphorylation & ETC', short: 'OxPhos',
    tagline: 'Electrons fall. Protons climb. ATP spins out.',
    accent: ['#0a84ff', '#bf5af2'],
    lecturer: 'Dr. Vijaya Marakala',
  },
  {
    id: 'glycolysis', n: 7, codes: 'L.11',
    title: 'Glycolysis', short: 'Glycolysis',
    tagline: 'One glucose. Two pyruvate. A net of two ATP.',
    accent: ['#ff9f0a', '#ff375f'],
    lecturer: null,
  },
  {
    id: 'tca', n: 8, codes: 'L.12 – L.13',
    title: 'PDH Complex & TCA Cycle', short: 'TCA cycle',
    tagline: 'The bridge, and the hub of metabolism.',
    accent: ['#40c8e0', '#30d158'],
    lecturer: null,
  },
  {
    id: 'glycogen', n: 9, codes: 'L.15',
    title: 'Glycogen Metabolism', short: 'Glycogen',
    tagline: 'Building and breaking the body’s glucose bank.',
    accent: ['#ff375f', '#bf5af2'],
    lecturer: 'Dr. Vijaya Marakala',
  },
  {
    id: 'heme', n: 10, codes: 'L.26 – L.27',
    title: 'Heme Metabolism', short: 'Heme',
    tagline: 'Synthesis, porphyrias, bilirubin and jaundice.',
    accent: ['#ff453a', '#ff9f0a'],
    lecturer: 'Dr. Gulam Saidunnisa',
  },
  {
    id: 'iron-b12-folate', n: 11, codes: 'L.53 – L.55',
    title: 'Iron, Vitamin B₁₂ & Folic Acid', short: 'Iron · B₁₂ · Folate',
    tagline: 'Three nutrients every red cell depends on.',
    accent: ['#ff7a45', '#bf5af2'],
    lecturer: 'Dr. Vijaya Marakala',
  },
];

export const byId = (id) => LECTURES.find((l) => l.id === id);
