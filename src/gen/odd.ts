/**
 * Odd-one-out (classification) generator, like the Classification subtest of Cattell's Culture
 * Fair test. Four figures share a rule and one breaks it. "Noise" attributes are spread so that
 * no other attribute singles out one figure as different from four identical others.
 */
import type { Figure, Prim, Puzzle } from '../types';
import { type Rng, chance, pick, randInt, sample, shuffle } from '../rng';
import {
  DIR_NAMES, FILLS, FILL_IDS, INK, LETTERS, NUM_WORDS, POS_NAMES, SHAPE_NAMES, SHAPE_PLURALS,
  SHAPE_SIDES, SIZE_SCALE, SIZES, arrowFrameFigure, article, cellGridFigure, mod8, shapeCenterY, shapePrim,
} from '../figures';

export type OddKind = 'type' | 'arrow' | 'inner' | 'dots' | 'symmetry' | 'mirror';

interface Built { figures: Figure[]; odd: number; difficulty: number; explanation: string[] }

const ALL5 = [0, 1, 2, 3, 4];

/** Five fills over four kinds as a 2-1-1-1 spread, so the fill never singles out one figure. */
const spreadFills = (rng: Rng) => shuffle(rng, [...FILL_IDS, pick(rng, FILL_IDS)]);

// ---- Shape type ----

function buildType(rng: Rng): Built {
  const odd = randInt(rng, 0, 4);
  const T = pick(rng, ALL5);
  const close = T < 4 && chance(rng, 0.5);
  const U = close ? pick(rng, [T - 1, T + 1].filter(v => v >= 0 && v <= 3)) : pick(rng, ALL5.filter(v => v !== T));
  // Sizes split 3–2 and fills 2-1-1-1, never with two figures sharing both, so none look identical.
  let sizes: number[], colors: number[];
  do { sizes = shuffle(rng, [...SIZES, ...SIZES, pick(rng, SIZES)]); colors = spreadFills(rng); }
  while (sizes.some((sz, i) => sizes.some((sz2, j) => j > i && sz === sz2 && colors[i] === colors[j])));
  const figures = sizes.map((s, i) => [shapePrim(i === odd ? U : T, 50, 50, 40 * SIZE_SCALE[s], FILLS[colors[i]])]);
  return {
    figures, odd, difficulty: close ? -1.0 : -1.4,
    explanation: [
      'Size and fill differ from figure to figure, so they can’t be what links four of them.',
      `What four figures share is the kind of shape: they are all ${SHAPE_PLURALS[T]}.`,
      `Figure **${LETTERS[odd]}** is ${article(SHAPE_NAMES[U])}, so it is the odd one out.`,
    ],
  };
}

// ---- Arrow points at dot ----

function buildArrow(rng: Rng): Built {
  const odd = randInt(rng, 0, 4);
  const positions = sample(rng, [0, 1, 2, 3, 4, 5, 6, 7], 5);
  const fills = shuffle(rng, [0, 0, 1, 1, 2]);
  const offset = randInt(rng, 2, 6);
  const frames = positions.map((p, i) => ({ dir: i === odd ? mod8(p + offset) : p, fill: fills[i], mpos: p, mfill: 0 }));
  const f = frames[odd];
  return {
    figures: frames.map(arrowFrameFigure),
    odd, difficulty: -0.6,
    explanation: [
      'The arrows point in different directions and the dots sit in different places, so neither matters by itself.',
      'What matters is how they relate: in four figures the arrow points straight at the dot.',
      `In figure **${LETTERS[odd]}** the arrow points ${DIR_NAMES[f.dir]} but the dot is at the ${POS_NAMES[f.mpos]}, so it is the odd one out. (The arrow’s fill is irrelevant.)`,
    ],
  };
}

// ---- Inner shape matches outer shape ----

function buildInner(rng: Rng): Built {
  const odd = randInt(rng, 0, 4);
  const outers = shuffle(rng, ALL5);
  const colors = spreadFills(rng);
  const oddInner = pick(rng, ALL5.filter(v => v !== outers[odd]));
  const figures = outers.map((o, i) => {
    const inner = i === odd ? oddInner : o;
    return [
      shapePrim(o, 50, 50, 42, FILLS[0]),
      shapePrim(inner, 50, shapeCenterY(o, 50, 42), 15, FILLS[colors[i]]),
    ];
  });
  return {
    figures, odd, difficulty: -0.3,
    explanation: [
      'Each figure is a large shape with a small shape inside it. The outer shapes are all different, and the inner fills vary.',
      'In four figures the inner shape is the same kind as the outer one (a circle in a circle, a square in a square, …).',
      `Figure **${LETTERS[odd]}** has ${article(SHAPE_NAMES[oddInner])} inside ${article(SHAPE_NAMES[outers[odd]])}, so it is the odd one out.`,
    ],
  };
}

// ---- Number of dots equals number of sides ----

const DOT_LAYOUTS: [number, number][][] = [
  [],
  [[0, 0]],
  [[-5, 0], [5, 0]],
  [[0, -5], [-5.5, 4], [5.5, 4]],
  [[-5, -5], [5, -5], [-5, 5], [5, 5]],
  [[-6, -6], [6, -6], [0, 0], [-6, 6], [6, 6]],
  [[-8, -5], [0, -5], [8, -5], [-8, 5], [0, 5], [8, 5]],
  [[0, 0], [0, -9], [7.8, -4.5], [7.8, 4.5], [0, 9], [-7.8, 4.5], [-7.8, -4.5]],
];

function buildDots(rng: Rng): Built {
  const odd = randInt(rng, 0, 4);
  const types = shuffle(rng, [0, 1, 2, 3, randInt(rng, 0, 3)]);
  const counts = types.map((t, i) => (i === odd ? SHAPE_SIDES[t] + pick(rng, [-1, 1]) : SHAPE_SIDES[t]));
  // Dots need a plain white background, so figures of the same type are told apart by a 3–2 size split.
  let scales: number[];
  do scales = shuffle(rng, [1, 1, 1, 0.85, 0.85]);
  while (types.some((t, i) => types.some((u, j) => j > i && u === t && counts[i] === counts[j] && scales[i] === scales[j])));
  const figures = types.map((t, i) => {
    const cy = shapeCenterY(t, 50, 40 * scales[i]);
    const prims: Prim[] = [shapePrim(t, 50, 50, 40 * scales[i], FILLS[0])];
    for (const [dx, dy] of DOT_LAYOUTS[counts[i]]) prims.push({ t: 'circle', cx: 50 + dx, cy: cy + dy, r: 2.7, fill: INK, sw: 0 });
    return prims;
  });
  const t = types[odd];
  return {
    figures, odd, difficulty: 0.4,
    explanation: [
      'The shapes differ and so does the number of dots — look for a link between the two. (The size doesn’t matter.)',
      'In four figures the number of dots equals the number of sides of the shape: three dots in a triangle, four in a square, and so on.',
      `Figure **${LETTERS[odd]}** is ${article(SHAPE_NAMES[t])} (${NUM_WORDS[SHAPE_SIDES[t]]} sides) holding ${NUM_WORDS[counts[odd]]} dots, so it is the odd one out.`,
    ],
  };
}

// ---- Cell-pattern symmetries ----

export type CellOp = (r: number, c: number, n: number) => [number, number];
export const OPS: Record<string, CellOp> = {
  rot90: (r, c, n) => [c, n - 1 - r],
  rot180: (r, c, n) => [n - 1 - r, n - 1 - c],
  rot270: (r, c, n) => [n - 1 - c, r],
  mirrorV: (r, c, n) => [r, n - 1 - c], // left–right mirror (vertical axis)
  mirrorH: (r, c, n) => [n - 1 - r, c], // top–bottom mirror (horizontal axis)
  diag: (r, c) => [c, r],
  anti: (r, c, n) => [n - 1 - c, n - 1 - r],
};

export function apply(mask: number, n: number, op: CellOp): number {
  let out = 0;
  for (let i = 0; i < n * n; i++) {
    if (!((mask >> i) & 1)) continue;
    const [r, c] = op(Math.floor(i / n), i % n, n);
    out |= 1 << (r * n + c);
  }
  return out;
}

export const randCells = (rng: Rng, n: number, k: number) =>
  sample(rng, Array.from({ length: n * n }, (_, i) => i), k).reduce((m, i) => m | (1 << i), 0);

const AXIS_NAMES: Record<string, string> = { mirrorV: 'a vertical line', mirrorH: 'a horizontal line', diag: 'a diagonal', anti: 'a diagonal' };

function buildSymmetry(rng: Rng): Built {
  const n = 4, k = 6;
  const odd = randInt(rng, 0, 4);
  const axes = shuffle(rng, ['mirrorV', 'mirrorH', 'diag', 'anti']);
  const masks: number[] = [];
  for (const axis of axes) {
    for (;;) {
      let m = 0;
      while (m === 0 || bits(m) < k) {
        const i = randInt(rng, 0, n * n - 1);
        m |= (1 << i) | apply(1 << i, n, OPS[axis]);
      }
      if (bits(m) === k && !masks.includes(m)) { masks.push(m); break; }
    }
  }
  let asym: number;
  do asym = randCells(rng, n, k);
  while (Object.values(OPS).some(op => apply(asym, n, op) === asym));
  masks.splice(odd, 0, asym);
  return {
    figures: masks.map(m => cellGridFigure(m, n)),
    odd, difficulty: 0.9,
    explanation: [
      'Every pattern has six filled squares, so counting won’t help. Look at the shape of each pattern as a whole.',
      'Four patterns are mirror-symmetric: you could fold each one along a line — vertical, horizontal or diagonal — and the two halves would match exactly.',
      ...masks.map((_, i) => i === odd ? '' : `Figure ${LETTERS[i]} folds along ${AXIS_NAMES[axes[i < odd ? i : i - 1]]}.`).filter(Boolean),
      `Figure **${LETTERS[odd]}** has no line of symmetry at all, so it is the odd one out.`,
    ],
  };
}

function bits(m: number): number { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

function buildMirror(rng: Rng): Built {
  const n = 3, k = pick(rng, [4, 5]);
  let base: number;
  let rots: number[];
  for (;;) {
    base = randCells(rng, n, k);
    rots = [base, apply(base, n, OPS.rot90), apply(base, n, OPS.rot180), apply(base, n, OPS.rot270)];
    const mirror = apply(base, n, OPS.mirrorV);
    // Need four distinct rotations, and the mirror image must not be reachable by rotation.
    if (new Set(rots).size === 4 && !rots.includes(mirror)) break;
  }
  const odd = randInt(rng, 0, 4);
  const mirrored = pick(rng, [OPS.rot90, OPS.rot180, OPS.rot270, (r: number, c: number) => [r, c] as [number, number]]);
  const oddMask = apply(apply(base, n, OPS.mirrorV), n, mirrored);
  const masks = shuffle(rng, rots);
  masks.splice(odd, 0, oddMask);
  return {
    figures: masks.map(m => cellGridFigure(m, n)),
    odd, difficulty: 1.5,
    explanation: [
      `All five patterns have ${NUM_WORDS[k]} filled squares arranged the same way relative to each other — but turned to different angles.`,
      'Four of them are the same pattern simply rotated by 90°, 180° or 270°: you can turn any of them on the table until it matches another.',
      `Figure **${LETTERS[odd]}** is the mirror image of that pattern. No amount of turning makes it match the others — you would have to flip it over — so it is the odd one out.`,
    ],
  };
}

const BUILDERS: Record<OddKind, (rng: Rng) => Built> = {
  type: buildType, arrow: buildArrow, inner: buildInner, dots: buildDots, symmetry: buildSymmetry, mirror: buildMirror,
};

export function makeOdd(rng: Rng, kind: OddKind): Puzzle {
  const b = BUILDERS[kind](rng);
  return {
    kind: 'odd',
    prompt: 'Which figure is the odd one out?',
    difficulty: b.difficulty,
    stem: [],
    options: b.figures,
    answer: b.odd,
    explanation: b.explanation,
  };
}
