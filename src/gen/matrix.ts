/**
 * Progressive-matrix generator.
 *
 * Modelled on the rule taxonomy Carpenter, Just & Shell (1990) found behind Raven's Advanced
 * Progressive Matrices, as formalised by the RAVEN / I-RAVEN datasets: every row of a 3×3 matrix
 * applies the same rules (constant, progression, distribution of three values, arithmetic, and
 * set operations on positions) to the attributes of its shapes.
 *
 * Answer options follow I-RAVEN's attribute-bisection tree: three attributes are each given one
 * wrong alternative value, and the 2³ = 8 combinations form the options. Every attribute value
 * therefore appears in exactly half the options, so the answer can't be found by
 * "pick the most common features" — only by working out the rules.
 */
import type { Figure, Prim, Puzzle } from '../types';
import { type Rng, chance, pick, randInt, sample, shuffle } from '../rng';
import {
  FILLS, FILL_IDS, FILL_NAMES, INK, LETTERS, NUM_WORDS, SHAPE_NAMES, SHAPE_PLURALS, SIZE_NAMES, SIZE_SCALE, SIZES,
  cap, listJoin, shapeCenterY, shapePrim,
} from '../figures';

type ScalarAttr = 'shape' | 'size' | 'color';
type Attr = ScalarAttr | 'pos';
type RuleKind = 'constant' | 'progression' | 'distribute' | 'arithmetic' | 'xor' | 'or' | 'and' | 'sub' | 'rotate';
type Layout = 'single' | 'grid2' | 'grid3';
type Config = 'center' | 'grid' | 'leftRight' | 'inOut';
type Grid = number[][];

interface Rule {
  kind: RuleKind;
  step?: number;
  minus?: boolean;
  uniform?: boolean; // constant across the whole matrix, not just within each row
}

interface Comp {
  label: string;
  layout: Layout;
  slots: [number, number][];
  R: number;
  domains: Record<ScalarAttr, number[]>;
  rules: Record<Attr, Rule>;
  insideOf?: number;
}

interface State { pos: number; shape: number; size: number; color: number }
type CompGrids = Record<Attr, Grid>;

const SCALARS: ScalarAttr[] = ['shape', 'size', 'color'];
const ALL5 = [0, 1, 2, 3, 4];
const POLYGONS = [0, 1, 2, 3];

const SLOTS: Record<'grid2' | 'grid3', [number, number][]> = {
  grid2: [[29, 29], [71, 29], [29, 71], [71, 71]],
  grid3: [[20, 20], [50, 20], [80, 20], [20, 50], [50, 50], [80, 50], [20, 80], [50, 80], [80, 80]],
};
// Clockwise rings of slot indices; used by the rotate rule.
const RINGS: Record<'grid2' | 'grid3', number[]> = {
  grid2: [0, 1, 3, 2],
  grid3: [0, 1, 2, 5, 8, 7, 6, 3],
};

const COUNT_RULES: RuleKind[] = ['progression', 'distribute', 'arithmetic'];
const isCountRule = (r: Rule) => COUNT_RULES.includes(r.kind);

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const uniq = (xs: number[]) => [...new Set(xs)];
const popcount = (m: number) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const transpose = (g: Grid): Grid => g[0].map((_, c) => g.map(row => row[c]));
const slotCount = (layout: Layout) => (layout === 'single' ? 1 : SLOTS[layout].length);

function randMask(rng: Rng, n: number, k: number): number {
  return sample(rng, range(0, n - 1), k).reduce((m, i) => m | (1 << i), 0);
}

function rotateMask(mask: number, layout: 'grid2' | 'grid3', step: number): number {
  const ring = RINGS[layout];
  let out = 0;
  for (let i = 0; i < slotCount(layout); i++) {
    if (!((mask >> i) & 1)) continue;
    const k = ring.indexOf(i);
    out |= 1 << (k < 0 ? i : ring[(k + step + ring.length) % ring.length]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Configuration per difficulty level

const constRule = (rng: Rng): Rule => ({ kind: 'constant', uniform: chance(rng, 0.5) });
const UNIFORM: Rule = { kind: 'constant', uniform: true };

// Size has only two values, so it can't progress or be distributed over three; it stays constant
// within a row and is varied only among the answer options.
const CHANGEABLE: ScalarAttr[] = ['shape', 'color'];

function changingRule(rng: Rng, attr: ScalarAttr): Rule {
  // Fills are categories with no order, so they can't progress — only be distributed.
  if (attr === 'color' || chance(rng, 0.5)) return { kind: 'distribute' };
  return { kind: 'progression', step: pick(rng, [1, -1]) };
}

function scalarRules(rng: Rng, changing: ScalarAttr[], opts: { uniform?: boolean } = {}) {
  const r = {} as Record<ScalarAttr, Rule>;
  for (const a of SCALARS) {
    r[a] = changing.includes(a) ? changingRule(rng, a) : opts.uniform ? UNIFORM : constRule(rng);
  }
  return r;
}

function single(label: string, cx: number, cy: number, R: number, domains: Comp['domains'], rules: Record<ScalarAttr, Rule>): Comp {
  return { label, layout: 'single', slots: [[cx, cy]], R, domains, rules: { ...rules, pos: UNIFORM } };
}

function grid(layout: 'grid2' | 'grid3', pos: Rule, rules: Record<ScalarAttr, Rule>): Comp {
  return {
    label: 'shapes',
    layout,
    slots: SLOTS[layout],
    R: layout === 'grid2' ? 18 : 13.5,
    domains: { shape: ALL5, size: SIZES, color: FILL_IDS },
    rules: { ...rules, pos },
  };
}

const D_FULL = { shape: ALL5, size: SIZES, color: FILL_IDS };

function setRule(rng: Rng, kinds: RuleKind[]): Rule {
  const kind = pick(rng, kinds);
  return kind === 'rotate' ? { kind, step: pick(rng, [1, -1]) } : { kind };
}

function buildConfig(rng: Rng, level: number): { config: Config; comps: Comp[] } {
  const center = (changing: ScalarAttr[], opts: { uniform?: boolean } = {}) => ({
    config: 'center' as Config,
    comps: [single('shape', 50, 50, 40, D_FULL, scalarRules(rng, changing, opts))],
  });
  const leftRight = (left: ScalarAttr[], right: ScalarAttr[]) => ({
    config: 'leftRight' as Config,
    comps: [
      single('left shape', 27, 50, 21, D_FULL, scalarRules(rng, left)),
      single('right shape', 73, 50, 21, D_FULL, scalarRules(rng, right)),
    ],
  });
  const gridCfg = (layout: 'grid2' | 'grid3', pos: Rule, changing: ScalarAttr[]) => ({
    config: 'grid' as Config,
    comps: [grid(layout, pos, scalarRules(rng, changing))],
  });

  switch (level) {
    case 1:
      return center(sample(rng, CHANGEABLE, 1), { uniform: true });
    case 2:
      return center(CHANGEABLE);
    case 3:
      return gridCfg('grid2', { kind: 'progression', step: pick(rng, [1, -1]) }, sample(rng, CHANGEABLE, 1));
    case 4: {
      const layout = pick(rng, ['grid2', 'grid3'] as const);
      return gridCfg(layout, setRule(rng, ['xor', 'or', 'sub', 'rotate']), layout === 'grid2' ? sample(rng, CHANGEABLE, 1) : []);
    }
    case 5: {
      const [a, b] = shuffle(rng, [2, 1]);
      return leftRight(sample(rng, CHANGEABLE, a), sample(rng, CHANGEABLE, b));
    }
    case 6:
      return gridCfg('grid3', setRule(rng, ['xor', 'and', 'or', 'sub', 'rotate']), sample(rng, CHANGEABLE, 1));
    case 7: {
      const outer = single('outer shape', 50, 50, 42, { shape: ALL5, size: [1], color: [0] },
        { shape: changingRule(rng, 'shape'), size: UNIFORM, color: UNIFORM });
      const inner = single('inner shape', 50, 50, 15, { shape: ALL5, size: SIZES, color: FILL_IDS },
        scalarRules(rng, CHANGEABLE));
      inner.insideOf = 0;
      return { config: 'inOut', comps: [outer, inner] };
    }
    default: {
      const variant = randInt(rng, 0, 2);
      if (variant === 0) return gridCfg('grid3', { kind: 'arithmetic', minus: chance(rng, 0.4) }, CHANGEABLE);
      if (variant === 1) return leftRight(CHANGEABLE, CHANGEABLE);
      return gridCfg('grid2', setRule(rng, ['xor', 'and', 'sub']), CHANGEABLE);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Value generation

function rows3(f: () => number[] | null): Grid | null {
  const out: Grid = [];
  for (let r = 0; r < 3; r++) {
    const row = f();
    if (!row) return null;
    out.push(row);
  }
  return out;
}

function genScalar(rng: Rng, rule: Rule, domain: number[]): Grid | null {
  switch (rule.kind) {
    case 'constant': {
      if (rule.uniform) {
        const v = pick(rng, domain);
        return rows3(() => [v, v, v]);
      }
      return rows3(() => { const v = pick(rng, domain); return [v, v, v]; });
    }
    case 'progression': {
      const s = rule.step!;
      const starts = domain.filter(v => domain.includes(v + s) && domain.includes(v + 2 * s));
      if (!starts.length) return null;
      return rows3(() => { const v = pick(rng, starts); return [v, v + s, v + 2 * s]; });
    }
    case 'distribute': {
      if (domain.length < 3) return null;
      const vals = sample(rng, domain, 3);
      const d = pick(rng, [1, 2]);
      return [0, 1, 2].map(r => [0, 1, 2].map(c => vals[(c + r * d) % 3]));
    }
    case 'arithmetic':
      return rows3(() => {
        for (let t = 0; t < 60; t++) {
          const a = pick(rng, domain), b = pick(rng, domain);
          const c = rule.minus ? a - b : a + b;
          if (domain.includes(c) && (!rule.minus || b < a)) return [a, b, c];
        }
        return null;
      });
    default:
      return null;
  }
}

function genPos(rng: Rng, comp: Comp): Grid | null {
  const { layout } = comp;
  const rule = comp.rules.pos;
  if (layout === 'single') return rows3(() => [1, 1, 1]);
  const n = slotCount(layout);
  const maxK = layout === 'grid2' ? 3 : 5;

  if (rule.kind === 'constant') {
    const mk = () => randMask(rng, n, randInt(rng, 1, maxK));
    if (rule.uniform) { const m = mk(); return rows3(() => [m, m, m]); }
    return rows3(() => { const m = mk(); return [m, m, m]; });
  }
  if (isCountRule(rule)) {
    const counts = genScalar(rng, rule, range(1, n));
    return counts && counts.map(row => row.map(k => randMask(rng, n, k)));
  }
  return rows3(() => {
    for (let t = 0; t < 200; t++) {
      if (rule.kind === 'rotate') {
        const a = randMask(rng, n, randInt(rng, 1, maxK));
        const b = rotateMask(a, layout, rule.step!);
        const c = rotateMask(b, layout, rule.step!);
        if (b !== a && c !== a) return [a, b, c];
        continue;
      }
      const a = randMask(rng, n, randInt(rng, 2, maxK));
      const b = randMask(rng, n, randInt(rng, 2, maxK));
      // Require overlap and differences, so XOR, OR, AND and subtraction all give different results.
      if (!(a & b) || !(a & ~b) || !(b & ~a)) continue;
      const c = rule.kind === 'xor' ? a ^ b : rule.kind === 'or' ? a | b : rule.kind === 'sub' ? a & ~b : a & b;
      if (c) return [a, b, c];
    }
    return null;
  });
}

function genComp(rng: Rng, comp: Comp): CompGrids | null {
  const out = {} as CompGrids;
  for (const a of SCALARS) {
    const rule = comp.rules[a];
    const domain = a === 'shape' && rule.kind === 'progression' ? POLYGONS : comp.domains[a];
    const g = genScalar(rng, rule, domain);
    if (!g) return null;
    out[a] = g;
  }
  const pos = genPos(rng, comp);
  if (!pos) return null;
  out.pos = pos;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Ambiguity check: every rule a solver could plausibly see (row- or column-wise) must predict
// the same answer. Puzzles where two readings disagree are rejected and regenerated.

/** `numeric` enables step/arithmetic readings; off for position masks, where only identity matters. */
function rowPreds(g: Grid, numeric: boolean, isCount = false): number[] {
  const [r0, r1, r2] = g;
  const preds: number[] = [];
  const isConst = (r: number[]) => r[0] === r[1] && r[1] === r[2];
  if (isConst(r0) && isConst(r1) && r2[0] === r2[1]) preds.push(r2[0]);

  const d = r0[1] - r0[0];
  const hasStep = (r: number[]) => r[1] - r[0] === d && r[2] - r[1] === d;
  if (numeric && d !== 0 && hasStep(r0) && hasStep(r1) && r2[1] - r2[0] === d) preds.push(r2[1] + d);

  const s0 = new Set(r0);
  const sameSet = (r: number[]) => new Set(r).size === 3 && r.every(v => s0.has(v));
  if (s0.size === 3 && sameSet(r1) && r2[0] !== r2[1] && s0.has(r2[0]) && s0.has(r2[1])) {
    preds.push([...s0].find(v => v !== r2[0] && v !== r2[1])!);
  }
  if (isCount) {
    if (r0[2] === r0[0] + r0[1] && r1[2] === r1[0] + r1[1]) preds.push(r2[0] + r2[1]);
    if (r0[2] === r0[0] - r0[1] && r1[2] === r1[0] - r1[1]) preds.push(r2[0] - r2[1]);
  }
  return preds;
}

function setRowPreds(g: Grid, layout: 'grid2' | 'grid3'): number[] {
  const [r0, r1, r2] = g;
  const preds: number[] = [];
  const ops: [(a: number, b: number) => number][] = [
    [(a, b) => a ^ b], [(a, b) => a | b], [(a, b) => a & b], [(a, b) => a & ~b], [(a, b) => b & ~a],
  ];
  for (const [op] of ops) {
    if (r0[2] === op(r0[0], r0[1]) && r1[2] === op(r1[0], r1[1])) preds.push(op(r2[0], r2[1]));
  }
  for (const s of [1, -1]) {
    const rot = (m: number) => rotateMask(m, layout, s);
    const fits = (r: number[]) => r[1] === rot(r[0]) && r[2] === rot(r[1]);
    if (fits(r0) && fits(r1) && r2[1] === rot(r2[0])) preds.push(rot(r2[1]));
  }
  return preds;
}

function validScalar(g: Grid): boolean {
  const preds = [...rowPreds(g, true), ...rowPreds(transpose(g), true)];
  return preds.length > 0 && preds.every(v => v === g[2][2]);
}

function validPos(g: Grid, layout: Layout): boolean {
  if (layout === 'single') return true;
  const setPreds = [
    ...setRowPreds(g, layout), ...setRowPreds(transpose(g), layout),
    ...rowPreds(g, false), ...rowPreds(transpose(g), false),
  ];
  const counts = g.map(r => r.map(popcount));
  const countPreds = [...rowPreds(counts, true, true), ...rowPreds(transpose(counts), true, true)];
  if (setPreds.length + countPreds.length === 0) return false;
  return setPreds.every(m => m === g[2][2]) && countPreds.every(k => k === counts[2][2]);
}

const validComp = (comp: Comp, g: CompGrids) =>
  SCALARS.every(a => validScalar(g[a])) && validPos(g.pos, comp.layout);

// ---------------------------------------------------------------------------------------------
// Distractors

interface Mod { ci: number; attr: Attr; alt: number }

function altScalar(rng: Rng, comp: Comp, attr: ScalarAttr, g: Grid, v: number): number {
  const others = comp.domains[attr].filter(x => x !== v);
  const seen = others.filter(x => g.flat().slice(0, 8).includes(x));
  const near = others.filter(x => Math.abs(x - v) === 1);
  const r = rng();
  if (seen.length && r < 0.6) return pick(rng, seen);
  if (near.length && r < 0.85) return pick(rng, near);
  return pick(rng, others);
}

function altPos(rng: Rng, comp: Comp, g: Grid, ans: number): number {
  const n = slotCount(comp.layout);
  const bits = range(0, n - 1);
  const rule = comp.rules.pos;
  if (isCountRule(rule)) {
    // Must change the count: positions are free under a count rule.
    const k = popcount(ans);
    const add = k === 1 || (k < n && chance(rng, 0.5));
    const i = pick(rng, bits.filter(b => (((ans >> b) & 1) === 0) === add));
    return ans ^ (1 << i);
  }
  const [a, b] = g[2];
  const plausible = [a | b, a & b, a ^ b, a & ~b, b & ~a, a, b, g[0][2], g[1][2]];
  if (rule.kind === 'rotate') plausible.push(rotateMask(ans, comp.layout as 'grid2' | 'grid3', rule.step!));
  const cands = uniq(plausible).filter(m => m && m !== ans);
  const toggles = bits.map(i => ans ^ (1 << i)).filter(m => m && m !== ans);
  return cands.length && chance(rng, 0.6) ? pick(rng, cands) : pick(rng, toggles);
}

function chooseMods(rng: Rng, comps: Comp[], grids: CompGrids[], answer: State[]): Mod[] {
  const cands: { ci: number; attr: Attr; changing: boolean }[] = [];
  comps.forEach((c, ci) => {
    for (const a of SCALARS) if (c.domains[a].length > 1) cands.push({ ci, attr: a, changing: c.rules[a].kind !== 'constant' });
    if (c.layout !== 'single') cands.push({ ci, attr: 'pos', changing: c.rules.pos.kind !== 'constant' });
  });
  // Always vary the attributes that carry the rules, otherwise the hard part could be skipped.
  const chosen = [
    ...shuffle(rng, cands.filter(c => c.changing)),
    ...shuffle(rng, cands.filter(c => !c.changing)),
  ].slice(0, 3);
  return chosen.map(({ ci, attr }) => ({
    ci,
    attr,
    alt: attr === 'pos'
      ? altPos(rng, comps[ci], grids[ci].pos, answer[ci].pos)
      : altScalar(rng, comps[ci], attr, grids[ci][attr], answer[ci][attr]),
  }));
}

// ---------------------------------------------------------------------------------------------
// Rendering

function renderPanel(comps: Comp[], st: State[], divider: boolean): Figure {
  const prims: Prim[] = [];
  if (divider) prims.push({ t: 'line', x1: 50, y1: 12, x2: 50, y2: 88, stroke: INK, sw: 1.5 });
  comps.forEach((c, i) => {
    const s = st[i];
    const r = c.R * SIZE_SCALE[s.size];
    c.slots.forEach(([x, y], k) => {
      if (!((s.pos >> k) & 1)) return;
      if (c.insideOf !== undefined) {
        const o = comps[c.insideOf], os = st[c.insideOf];
        y = shapeCenterY(os.shape, o.slots[0][1], o.R * SIZE_SCALE[os.size]);
      }
      prims.push(shapePrim(s.shape, x, y, r, FILLS[s.color], c.layout === 'grid3' ? 1.6 : 2));
    });
  });
  return prims;
}

// ---------------------------------------------------------------------------------------------
// Explanations

const valueName = (attr: ScalarAttr, v: number) =>
  attr === 'shape' ? SHAPE_NAMES[v] : attr === 'size' ? SIZE_NAMES[v] : FILL_NAMES[v];

function scalarText(attr: ScalarAttr, rule: Rule, g: Grid): string {
  const nm = (v: number) => valueName(attr, v);
  if (rule.kind === 'constant') {
    const u = uniq(g.flat());
    return u.length === 1 ? `always ${nm(u[0])}.` : 'stays the same within each row (it may differ between rows).';
  }
  if (rule.kind === 'progression') {
    const s = rule.step!, n = Math.abs(s);
    if (attr === 'shape') return `${s > 0 ? 'gains' : 'loses'} one side at each step along a row (triangle → square → pentagon → hexagon).`;
    return `gets ${n === 1 ? 'one size' : 'two sizes'} ${s > 0 ? 'bigger' : 'smaller'} at each step along a row.`;
  }
  const vals = uniq(g[0]).sort((a, b) => a - b).map(nm);
  if (attr === 'shape') return `each row contains ${listJoin(vals.map(v => `a ${v}`))} — once each, in a different order.`;
  return `each row uses the ${attr === 'size' ? 'sizes' : 'fills'} ${listJoin(vals)} exactly once each.`;
}

function posText(comp: Comp, g: Grid): string {
  const r = comp.rules.pos;
  switch (r.kind) {
    case 'constant':
      return r.uniform ? 'the arrangement of the shapes never changes.' : 'the arrangement of the shapes stays the same within each row.';
    case 'progression': {
      const n = Math.abs(r.step!);
      return `each panel has ${NUM_WORDS[n]} ${r.step! > 0 ? 'more' : 'fewer'} shape${n === 1 ? '' : 's'} than the one to its left.`;
    }
    case 'distribute': {
      const counts = uniq(g[0].map(popcount)).sort((a, b) => a - b);
      return `each row has one panel each with ${listJoin(counts.map(String))} shapes, in a different order.`;
    }
    case 'arithmetic':
      return r.minus
        ? 'the third panel has as many shapes as the first panel minus the second.'
        : 'the third panel has as many shapes as the first two panels put together.';
    case 'xor':
      return 'a position is filled in the third panel only if it is filled in exactly one of the first two — positions filled in both cancel out.';
    case 'or':
      return 'the third panel combines the first two: every position filled in either of them is filled.';
    case 'and':
      return 'the third panel keeps only the positions that are filled in both of the first two panels.';
    case 'sub':
      return 'the third panel is the first panel with the second one taken away: positions filled in the second panel are emptied.';
    case 'rotate':
      return `the pattern moves one step ${r.step! > 0 ? 'clockwise' : 'anticlockwise'} around the ${comp.layout === 'grid3' ? 'outer ring of the grid (the centre stays put)' : 'grid'} from each panel to the next.`;
  }
}

function attrTitle(comp: Comp, attr: Attr, multi: boolean): string {
  const base = attr === 'shape' ? 'shape' : attr === 'size' ? 'size' : attr === 'color' ? 'fill'
    : isCountRule(comp.rules.pos) ? 'number of shapes' : 'positions';
  return multi ? `${cap(comp.label)} – ${base}` : cap(base);
}

function describeComp(c: Comp, s: State): string {
  const parts: string[] = [];
  if (c.domains.size.length > 1) parts.push(SIZE_NAMES[s.size]);
  parts.push(FILL_NAMES[s.color]);
  if (c.layout === 'single') return `a ${parts.join(' ')} ${SHAPE_NAMES[s.shape]}`;
  const k = popcount(s.pos);
  const what = `${NUM_WORDS[k]} ${parts.join(' ')} ${k === 1 ? SHAPE_NAMES[s.shape] : SHAPE_PLURALS[s.shape]}`;
  return isCountRule(c.rules.pos) ? what : `${what}, placed where the position rule puts them`;
}

function describeAnswer(config: Config, comps: Comp[], st: State[]): string {
  if (config === 'leftRight') return `${describeComp(comps[0], st[0])} on the left and ${describeComp(comps[1], st[1])} on the right`;
  if (config === 'inOut') return `${describeComp(comps[0], st[0])} containing ${describeComp(comps[1], st[1])}`;
  return describeComp(comps[0], st[0]);
}

function modLabel(comp: Comp, attr: Attr, multi: boolean): string {
  const t = attrTitle(comp, attr, false).toLowerCase();
  return multi ? `${t} of the ${comp.label}` : t;
}

// ---------------------------------------------------------------------------------------------

const RULE_WEIGHT: Record<RuleKind, number> = {
  constant: 0, progression: 0.5, distribute: 0.7, arithmetic: 1, xor: 1, or: 0.8, and: 0.9, sub: 0.9, rotate: 0.7,
};

function complexity(config: Config, comps: Comp[], grids: CompGrids[]): number {
  let c = config === 'grid' ? (comps[0].layout === 'grid2' ? 0.2 : 0.4) : config === 'center' ? 0 : 0.5;
  comps.forEach((comp, i) => {
    for (const a of [...SCALARS, 'pos'] as Attr[]) {
      const r = comp.rules[a];
      c += RULE_WEIGHT[r.kind];
      if (r.kind === 'constant' && uniq(grids[i][a].flat()).length > 1) c += 0.1;
    }
  });
  return c;
}

export function makeMatrix(rng: Rng, level: number): Puzzle {
  for (let attempt = 0; attempt < 500; attempt++) {
    const { config, comps } = buildConfig(rng, level);
    const grids: CompGrids[] = [];
    let ok = true;
    for (const c of comps) {
      const g = genComp(rng, c);
      if (!g || !validComp(c, g)) { ok = false; break; }
      grids.push(g);
    }
    if (!ok) continue;

    const stateAt = (r: number, col: number): State[] =>
      grids.map(g => ({ pos: g.pos[r][col], shape: g.shape[r][col], size: g.size[r][col], color: g.color[r][col] }));
    const divider = config === 'leftRight';
    const answer = stateAt(2, 2);

    const mods = chooseMods(rng, comps, grids, answer);
    const variants: State[][] = [];
    for (let m = 0; m < 1 << mods.length; m++) {
      const s = answer.map(x => ({ ...x }));
      mods.forEach((md, bit) => { if (m & (1 << bit)) s[md.ci][md.attr] = md.alt; });
      variants.push(s);
    }
    const order = shuffle(rng, variants.map((_, i) => i));
    const answerIdx = order.indexOf(0);

    const stem: (Figure | null)[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) stem.push(r === 2 && c === 2 ? null : renderPanel(comps, stateAt(r, c), divider));

    const multi = comps.length > 1;
    const explanation = ['Read the matrix row by row: the same rules apply in every row, and the bottom row is missing its last panel.'];
    comps.forEach((comp, i) => {
      for (const a of SCALARS) {
        if (comp.domains[a].length === 1) continue;
        explanation.push(`**${attrTitle(comp, a, multi)}:** ${scalarText(a, comp.rules[a], grids[i][a])}`);
      }
      if (comp.layout !== 'single') explanation.push(`**${attrTitle(comp, 'pos', multi)}:** ${posText(comp, grids[i].pos)}`);
    });
    explanation.push(`Applying these rules to the bottom row, the missing panel must show ${describeAnswer(config, comps, answer)}.`);
    explanation.push(`That is option **${LETTERS[answerIdx]}**. Every other option gets at least one of these wrong: ${listJoin(mods.map(m => modLabel(comps[m.ci], m.attr, multi)))}.`);

    return {
      kind: 'matrix',
      prompt: 'Which option completes the matrix?',
      difficulty: Math.min(2.6, -2.4 + 1.6 * complexity(config, comps, grids)),
      stem,
      options: order.map(i => renderPanel(comps, variants[i], divider)),
      answer: answerIdx,
      explanation,
    };
  }
  throw new Error(`Could not generate matrix for level ${level}`);
}
