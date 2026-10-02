import type { Puzzle } from '../types';
import { mulberry32, pick } from '../rng';
import { makeMatrix } from './matrix';
import { makeSeries } from './series';
import { type OddKind, makeOdd } from './odd';
import { makeOverlay, makeTransform } from './figural';

/** Bump when generators change, so stored seeds aren't replayed into different puzzles. */
export const GEN_VERSION = 5;

export const ROUND_ITEMS = 16;
export const ROUND_MS = 10 * 60 * 1000;

/** Builds a full round deterministically from a seed, ordered from easiest to hardest. */
export function buildRound(seed: number): Puzzle[] {
  const rng = mulberry32(seed);
  const items: Puzzle[] = [];
  for (const level of [1, 2, 3, pick(rng, [4, 5]), pick(rng, [6, 7]), 8]) items.push(makeMatrix(rng, level));
  items.push(makeOverlay(rng), makeTransform(rng));
  for (const level of [pick(rng, [1, 2]), 3, 4, pick(rng, [5, 6])]) items.push(makeSeries(rng, level));
  const odd: OddKind[] = [pick(rng, ['type', 'arrow'] as const), pick(rng, ['inner', 'dots'] as const), 'symmetry', 'mirror'];
  for (const kind of odd) items.push(makeOdd(rng, kind));
  return items
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.difficulty - b.p.difficulty || a.i - b.i)
    .map(x => x.p);
}
