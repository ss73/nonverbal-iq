/**
 * Figure-series generator ("what comes next?"), in the style of the Series subtest of Cattell's
 * Culture Fair Intelligence Test. Each frame holds an arrow and a dot on a ring; up to four parts
 * change independently by constant steps, accelerating steps, alternating steps or repeating cycles.
 */
import type { Puzzle } from '../types';
import { type Rng, chance, pick, randInt, sample, shuffle } from '../rng';
import {
  ARROW_FILL_NAMES, type ArrowFrame, DIR_NAMES, DOT_FILL_NAMES, LETTERS, NUM_WORDS, POS_NAMES,
  arrowFrameFigure, listJoin, mod8,
} from '../figures';

type SAttr = keyof ArrowFrame;
const ATTRS: SAttr[] = ['dir', 'fill', 'mpos', 'mfill'];
const SHOWN = 5;

interface Seq {
  kind: 'const' | 'step' | 'accel' | 'alt2' | 'cycle';
  start: number;
  step?: number;
  steps?: [number, number];
  cycle?: number[];
}

function valueAt(seq: Seq, i: number): number {
  switch (seq.kind) {
    case 'const': return seq.start;
    case 'step': return mod8(seq.start + seq.step! * i);
    case 'accel': return mod8(seq.start + (seq.step! * i * (i + 1)) / 2);
    case 'alt2': {
      let v = seq.start;
      for (let j = 0; j < i; j++) v += seq.steps![j % 2];
      return mod8(v);
    }
    case 'cycle': return seq.cycle![i % seq.cycle!.length];
  }
}

const ALT_PAIRS: [number, number][] = [[1, 3], [3, 1], [1, -2], [2, -1], [-1, 3], [1, 2], [2, 1], [3, -1]];

function levelSeqs(rng: Rng, level: number): Record<SAttr, Seq> {
  const sgn = () => pick(rng, [1, -1]);
  const r8 = () => randInt(rng, 0, 7);
  const c8 = (): Seq => ({ kind: 'const', start: r8() });
  const step = (k: number): Seq => ({ kind: 'step', start: r8(), step: k });
  const accel = (): Seq => ({ kind: 'accel', start: r8(), step: sgn() });
  const alt2 = (): Seq => {
    const s = sgn();
    const [p, q] = pick(rng, ALT_PAIRS);
    return { kind: 'alt2', start: r8(), steps: [p * s, q * s] };
  };
  const fillConst = (): Seq => ({ kind: 'const', start: randInt(rng, 0, 2) });
  const cycle3 = (): Seq => ({ kind: 'cycle', start: 0, cycle: shuffle(rng, [0, 1, 2]) });
  const cycle2 = (): Seq => ({ kind: 'cycle', start: 0, cycle: sample(rng, [0, 1, 2], 2) });
  const mConst = (): Seq => ({ kind: 'const', start: chance(rng, 0.8) ? 0 : 1 });
  const mCycle = (): Seq => ({ kind: 'cycle', start: 0, cycle: shuffle(rng, [0, 1]) });

  switch (level) {
    case 1: return { dir: step(sgn()), fill: fillConst(), mpos: c8(), mfill: mConst() };
    case 2: return { dir: step(2 * sgn()), fill: fillConst(), mpos: step(sgn()), mfill: mConst() };
    case 3: return { dir: step(pick(rng, [1, 3]) * sgn()), fill: cycle3(), mpos: step(2 * sgn()), mfill: mConst() };
    case 4: return { dir: step(sgn()), fill: cycle2(), mpos: accel(), mfill: mConst() };
    case 5: return { dir: step(2 * sgn()), fill: cycle3(), mpos: alt2(), mfill: mCycle() };
    default: return { dir: accel(), fill: cycle3(), mpos: alt2(), mfill: mConst() };
  }
}

const LEVEL_DIFFICULTY = [-1.6, -0.9, -0.1, 0.6, 1.3, 1.9];

// ---- explanation text ----

const turn = (k: number) => `${Math.abs(k) * 45}° ${k > 0 ? 'clockwise' : 'anticlockwise'}`;
const moves = (k: number) => `${NUM_WORDS[Math.abs(k)]} position${Math.abs(k) === 1 ? '' : 's'} ${k > 0 ? 'clockwise' : 'anticlockwise'}`;

function seqText(attr: SAttr, seq: Seq): string {
  const names = attr === 'fill' ? ARROW_FILL_NAMES : attr === 'mfill' ? DOT_FILL_NAMES : attr === 'dir' ? DIR_NAMES : POS_NAMES;
  const title = { dir: 'Arrow', fill: 'Arrow fill', mpos: 'Dot', mfill: 'Dot colour' }[attr];
  const body = (() => {
    if (seq.kind === 'const') {
      return attr === 'dir' ? `always points ${names[seq.start]}.`
        : attr === 'mpos' ? `stays at the ${names[seq.start]}.`
        : `always ${names[seq.start]}.`;
    }
    if (seq.kind === 'cycle') {
      const c = seq.cycle!.map(v => names[v]);
      return c.length === 2 ? `alternates between ${c[0]} and ${c[1]}.` : `repeats the cycle ${c.join(' → ')}.`;
    }
    const s = seq.step!;
    if (attr === 'dir') {
      if (seq.kind === 'step') return `turns ${turn(s)} at every step.`;
      if (seq.kind === 'accel') return `turns 45°, then 90°, then 135°, then 180° ${s > 0 ? 'clockwise' : 'anticlockwise'} — 45° more each time, so next it turns 225°.`;
      const [p, q] = seq.steps!;
      return `turns ${turn(p)}, then ${turn(q)}, alternating — so next it turns ${turn(p)}.`;
    }
    if (seq.kind === 'step') return `moves ${moves(s)} around the ring at every step.`;
    if (seq.kind === 'accel') return `moves one, then two, then three, then four positions ${s > 0 ? 'clockwise' : 'anticlockwise'} — one more each time, so next it moves five.`;
    const [p, q] = seq.steps!;
    return `moves ${moves(p)}, then ${moves(q)}, alternating — so next it moves ${moves(p)}.`;
  })();
  return `**${title}:** ${body}`;
}

const MOD_LABELS: Record<SAttr, string> = { dir: 'arrow direction', fill: 'arrow fill', mpos: 'dot position', mfill: 'dot colour' };

function altValue(rng: Rng, attr: SAttr, seq: Seq, frames: ArrowFrame[], ans: number): number {
  if (attr === 'mfill') return 1 - ans;
  const last = frames[SHOWN - 1][attr];
  if (attr === 'fill') {
    const others = [0, 1, 2].filter(v => v !== ans);
    return others.includes(last) && chance(rng, 0.6) ? last : pick(rng, others);
  }
  // Positions and directions: plausible slips first — no change, wrong step size, off by one.
  const prev = frames[SHOWN - 2][attr];
  const plausible = [last, mod8(2 * last - prev), mod8(ans + 1), mod8(ans - 1)];
  if (seq.kind === 'step') plausible.push(mod8(last - seq.step!));
  const cands = [...new Set(plausible)].filter(v => v !== ans);
  return pick(rng, cands);
}

export function makeSeries(rng: Rng, level: number): Puzzle {
  const seqs = levelSeqs(rng, level);
  const frames: ArrowFrame[] = [];
  for (let i = 0; i <= SHOWN; i++) {
    frames.push({ dir: valueAt(seqs.dir, i), fill: valueAt(seqs.fill, i), mpos: valueAt(seqs.mpos, i), mfill: valueAt(seqs.mfill, i) });
  }
  const answer = frames[SHOWN];

  const changing = ATTRS.filter(a => seqs[a].kind !== 'const');
  const fixed = ATTRS.filter(a => seqs[a].kind === 'const');
  const modAttrs = [...shuffle(rng, changing), ...shuffle(rng, fixed)].slice(0, 3);
  const mods = modAttrs.map(attr => ({ attr, alt: altValue(rng, attr, seqs[attr], frames, answer[attr]) }));

  const variants: ArrowFrame[] = [];
  for (let m = 0; m < 1 << mods.length; m++) {
    const f = { ...answer };
    mods.forEach((md, bit) => { if (m & (1 << bit)) f[md.attr] = md.alt; });
    variants.push(f);
  }
  const order = shuffle(rng, variants.map((_, i) => i));
  const answerIdx = order.indexOf(0);

  const explanation = [
    'Follow each part of the figure separately from frame to frame — they change independently.',
    ...ATTRS.map(a => seqText(a, seqs[a])),
    `So frame six shows a ${ARROW_FILL_NAMES[answer.fill]} arrow pointing ${DIR_NAMES[answer.dir]}, with a ${DOT_FILL_NAMES[answer.mfill]} dot at the ${POS_NAMES[answer.mpos]}.`,
    `That is option **${LETTERS[answerIdx]}**. The other options get the ${listJoin(mods.map(m => MOD_LABELS[m.attr]))} wrong in some combination.`,
  ];

  return {
    kind: 'series',
    prompt: 'Which figure comes next in the series?',
    difficulty: LEVEL_DIFFICULTY[Math.min(level, 6) - 1],
    stem: [...frames.slice(0, SHOWN).map(arrowFrameFigure), null],
    options: order.map(i => arrowFrameFigure(variants[i])),
    answer: answerIdx,
    explanation,
  };
}
