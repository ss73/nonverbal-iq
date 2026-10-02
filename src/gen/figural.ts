/**
 * Two further matrix families from Raven's Advanced Progressive Matrices:
 *
 * - Line overlays: each panel is a set of line segments, and the third panel of a row is built from
 *   the first two by addition (OR), subtraction, XOR (lines in both cancel out) or intersection.
 * - Orientation: a pattern is rotated or mirrored from panel to panel along each row.
 *
 * Distractors stay balanced as in matrix.ts: overlay options toggle three chosen lines in every
 * combination, so each of those lines is present in exactly half the options; orientation options
 * are the pattern's eight possible orientations, so the shape itself gives nothing away.
 */
import type { Figure, Prim, Puzzle } from '../types';
import { type Rng, pick, randInt, sample, shuffle } from '../rng';
import { INK, LETTERS, cellGridFigure } from '../figures';
import { OPS, apply, randCells } from './odd';

type Grid = number[][];
const popcount = (m: number) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const transpose = (g: Grid): Grid => g[0].map((_, c) => g.map(row => row[c]));
const bitsOf = (m: number, n: number) => Array.from({ length: n }, (_, i) => i).filter(i => (m >> i) & 1);

// ---------------------------------------------------------------------------------------------
// Line overlays

const LATTICE = [18, 50, 82];
const pt = (i: number): [number, number] => [LATTICE[i % 3], LATTICE[Math.floor(i / 3)]];
// Segments between points of a 3×3 lattice (indices in reading order).
const SEGMENTS: [number, number][] = [
  [0, 2], [2, 8], [6, 8], [0, 6], // outer square
  [1, 7], [3, 5], // centre cross
  [0, 8], [2, 6], // diagonals
  [1, 5], [5, 7], [7, 3], [3, 1], // inner diamond
];
const NSEG = SEGMENTS.length;

function linesFigure(mask: number): Figure {
  const prims: Prim[] = [];
  for (let i = 0; i < 9; i++) {
    const [x, y] = pt(i);
    prims.push({ t: 'circle', cx: x, cy: y, r: 1.8, fill: '#c4c4c4', stroke: 'none', sw: 0 });
  }
  for (const i of bitsOf(mask, NSEG)) {
    const [[x1, y1], [x2, y2]] = SEGMENTS[i].map(pt);
    prims.push({ t: 'line', x1, y1, x2, y2, stroke: INK, sw: 3.4 });
  }
  return prims;
}

type OverlayOp = 'or' | 'sub' | 'xor' | 'and';
const OP_FN: Record<OverlayOp, (a: number, b: number) => number> = {
  or: (a, b) => a | b,
  sub: (a, b) => a & ~b,
  xor: (a, b) => a ^ b,
  and: (a, b) => a & b,
};
const OP_TEXT: Record<OverlayOp, string> = {
  or: '**Add:** the third panel combines the first two — every line from either panel appears in it.',
  sub: '**Subtract:** the third panel is the first panel minus the second — any line that appears in the second panel is removed.',
  xor: '**Cancel out:** lines that appear in only one of the first two panels are kept; lines that appear in both disappear.',
  and: '**Keep the common lines:** only the lines that appear in both of the first two panels are kept.',
};
const OP_DIFFICULTY: Record<OverlayOp, number> = { or: -0.8, and: 0, sub: 0.3, xor: 0.9 };

/** Every reading a solver might try; all of them that fit rows 1–2 must agree on the answer. */
function overlayPreds(g: Grid): number[] {
  const preds: number[] = [];
  const fns = [...Object.values(OP_FN), (a: number, b: number) => b & ~a];
  for (const t of [g, transpose(g)]) {
    const [r0, r1, r2] = t;
    for (const f of fns) if (r0[2] === f(r0[0], r0[1]) && r1[2] === f(r1[0], r1[1])) preds.push(f(r2[0], r2[1]));
    if (r0[0] === r0[1] && r0[1] === r0[2] && r1[0] === r1[1] && r1[1] === r1[2] && r2[0] === r2[1]) preds.push(r2[0]);
  }
  return preds;
}

export function makeOverlay(rng: Rng, op: OverlayOp = pick(rng, ['or', 'sub', 'xor', 'and'] as const)): Puzzle {
  const f = OP_FN[op];
  for (let attempt = 0; attempt < 500; attempt++) {
    const g: Grid = [];
    for (let r = 0; r < 3; r++) {
      for (let t = 0; t < 200; t++) {
        const a = randCellsN(rng, NSEG, randInt(rng, 3, 6));
        const b = randCellsN(rng, NSEG, randInt(rng, 3, 6));
        if (!(a & b) || !(a & ~b) || !(b & ~a)) continue;
        const c = f(a, b);
        if (popcount(c) >= 2) { g.push([a, b, c]); break; }
      }
    }
    if (g.length < 3) continue;
    const ans = g[2][2];
    const preds = overlayPreds(g);
    if (!preds.length || preds.some(p => p !== ans)) continue;

    // Toggle one line from each region where the possible operations disagree.
    const [a, b] = g[2];
    const regions = [a & b, a & ~b, b & ~a].filter(Boolean);
    const toggles = regions.map(m => pick(rng, bitsOf(m, NSEG)));
    while (toggles.length < 3) {
      const free = bitsOf(~(a | b) & ((1 << NSEG) - 1), NSEG).filter(i => !toggles.includes(i));
      toggles.push(pick(rng, free.length ? free : bitsOf(a | b, NSEG).filter(i => !toggles.includes(i))));
    }
    const variants = Array.from({ length: 8 }, (_, m) =>
      toggles.reduce((acc, bit, k) => ((m >> k) & 1 ? acc ^ (1 << bit) : acc), ans));
    if (variants.some(v => popcount(v) === 0)) continue;

    const order = shuffle(rng, variants.map((_, i) => i));
    const answer = order.indexOf(0);
    return {
      kind: 'matrix',
      prompt: 'Which option completes the matrix?',
      difficulty: OP_DIFFICULTY[op],
      stem: g.flat().map((m, i) => (i === 8 ? null : linesFigure(m))),
      options: order.map(i => linesFigure(variants[i])),
      answer,
      explanation: [
        'Each row works the same way: the third panel is made by combining the lines of the first two panels.',
        `${OP_TEXT[op]} Check this against the top two rows.`,
        `Doing the same with the first two panels of the bottom row gives option **${LETTERS[answer]}**.`,
        'The other options add or remove a line in exactly the places where a different rule — such as adding instead of cancelling out — would give a different picture.',
      ],
    };
  }
  throw new Error(`Could not generate overlay matrix (${op})`);
}

function randCellsN(rng: Rng, n: number, k: number): number {
  return sample(rng, Array.from({ length: n }, (_, i) => i), k).reduce((m, i) => m | (1 << i), 0);
}

// ---------------------------------------------------------------------------------------------
// Orientation: rotate and mirror

const N = 3;
const DIHEDRAL = ['id', 'rot90', 'rot180', 'rot270', 'mirrorV', 'mirrorH', 'diag', 'anti'] as const;
type Dihedral = (typeof DIHEDRAL)[number];
const transform = (m: number, t: Dihedral) => (t === 'id' ? m : apply(m, N, OPS[t]));
const orbit = (m: number) => DIHEDRAL.map(t => transform(m, t));

const STEP_TEXT: Partial<Record<Dihedral, string>> = {
  rot90: 'turned a quarter turn clockwise',
  rot270: 'turned a quarter turn anticlockwise',
  mirrorV: 'flipped left to right, as in a mirror standing beside it',
  mirrorH: 'flipped upside down, as in a mirror lying below it',
};

const PLANS: { steps: [Dihedral, Dihedral]; difficulty: number }[] = [
  { steps: ['rot90', 'rot90'], difficulty: -0.3 },
  { steps: ['rot270', 'rot270'], difficulty: -0.3 },
  { steps: ['mirrorV', 'mirrorH'], difficulty: 0.5 },
  { steps: ['mirrorH', 'mirrorV'], difficulty: 0.5 },
  { steps: ['rot90', 'mirrorV'], difficulty: 1.0 },
  { steps: ['mirrorV', 'rot270'], difficulty: 1.0 },
];

export function makeTransform(rng: Rng): Puzzle {
  const plan = pick(rng, PLANS);
  const [t1, t2] = plan.steps;
  const bases: number[] = [];
  while (bases.length < 3) {
    const m = randCells(rng, N, randInt(rng, 4, 5));
    // The pattern must look different in all eight orientations, and rows must use unrelated patterns.
    if (new Set(orbit(m)).size !== 8) continue;
    if (bases.some(b => orbit(b).includes(m))) continue;
    bases.push(m);
  }
  const g = bases.map(m => { const b = transform(m, t1); return [m, b, transform(b, t2)]; });
  const variants = shuffle(rng, orbit(bases[2]));
  const answer = variants.indexOf(g[2][2]);
  const same = t1 === t2;
  return {
    kind: 'matrix',
    prompt: 'Which option completes the matrix?',
    difficulty: plan.difficulty,
    stem: g.flat().map((m, i) => (i === 8 ? null : cellGridFigure(m, N))),
    options: variants.map(m => cellGridFigure(m, N)),
    answer,
    explanation: [
      'Each row shows a single pattern that changes its orientation. Compare neighbouring panels in a row.',
      same
        ? `At each step the pattern is ${STEP_TEXT[t1]}.`
        : `From the first panel to the second, the pattern is ${STEP_TEXT[t1]}. From the second to the third, it is ${STEP_TEXT[t2]}.`,
      `Doing the same to the bottom row gives option **${LETTERS[answer]}**.`,
      'All eight options are the same pattern in each of its eight possible orientations (four turns, each with or without a flip), so only tracking the orientation step by step finds the answer.',
    ],
  };
}
