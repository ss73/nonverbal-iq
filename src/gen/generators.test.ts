import { describe, expect, it } from 'vitest';
import { figureSvg } from '../render';
import { mulberry32 } from '../rng';
import { buildRound, ROUND_ITEMS } from './round';
import { makeMatrix } from './matrix';
import { makeSeries } from './series';
import { makeOdd, type OddKind } from './odd';
import { makeOverlay, makeTransform } from './figural';
import type { Puzzle } from '../types';
import { scoreRound } from '../scoring';

function checkPuzzle(p: Puzzle) {
  const svgs = p.options.map(figureSvg);
  expect(new Set(svgs).size, 'options must look different').toBe(svgs.length);
  expect(p.answer).toBeGreaterThanOrEqual(0);
  expect(p.answer).toBeLessThan(p.options.length);
  expect(p.explanation.length).toBeGreaterThan(1);
  expect(p.explanation.join(' ')).not.toMatch(/undefined|NaN/);
  expect(Number.isFinite(p.difficulty)).toBe(true);
  if (p.kind === 'matrix') {
    expect(p.options).toHaveLength(8);
    expect(p.stem).toHaveLength(9);
    expect(p.stem[8]).toBeNull();
  }
}

describe('generators', () => {
  it('matrices at every level are well-formed', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (let level = 1; level <= 8; level++) checkPuzzle(makeMatrix(mulberry32(seed * 31 + level), level));
    }
  });

  it('series at every level are well-formed', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (let level = 1; level <= 6; level++) checkPuzzle(makeSeries(mulberry32(seed * 17 + level), level));
    }
  });

  it('line-overlay and orientation matrices are well-formed', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const op of ['or', 'sub', 'xor', 'and'] as const) checkPuzzle(makeOverlay(mulberry32(seed), op));
      checkPuzzle(makeTransform(mulberry32(seed)));
    }
  });

  it('odd-one-out puzzles are well-formed', () => {
    const kinds: OddKind[] = ['type', 'arrow', 'inner', 'dots', 'symmetry', 'mirror'];
    for (let seed = 1; seed <= 200; seed++) {
      for (const k of kinds) {
        const p = makeOdd(mulberry32(seed), k);
        checkPuzzle(p);
        expect(p.options).toHaveLength(5);
      }
    }
  });

  it('a round is deterministic for a seed and sorted by difficulty', () => {
    const a = buildRound(12345), b = buildRound(12345);
    expect(a).toHaveLength(ROUND_ITEMS);
    expect(a.map(p => p.options.map(figureSvg).join())).toEqual(b.map(p => p.options.map(figureSvg).join()));
    for (let i = 1; i < a.length; i++) expect(a[i].difficulty).toBeGreaterThanOrEqual(a[i - 1].difficulty);
  });
});

describe('scoring', () => {
  const round = buildRound(42);
  it('more correct answers never lowers the score', () => {
    let prev = -Infinity;
    for (let k = 0; k <= round.length; k++) {
      // Solve the k easiest items.
      const s = scoreRound(round, round.map((p, i) => (i < k ? p.answer : null)));
      expect(s.iq).toBeGreaterThanOrEqual(prev);
      prev = s.iq;
    }
  });
});
