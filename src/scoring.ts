/**
 * Ability estimate with a three-parameter logistic IRT model (3PL):
 *   P(correct | θ) = c + (1 − c) / (1 + e^(−D·a·(θ − b)))
 * where b is the item difficulty, c the chance of guessing right (1 / number of options), and θ is
 * estimated as the posterior mean (EAP) under a standard-normal population prior. IQ = 100 + 15θ.
 *
 * Item difficulties come from the generators' rule complexity, not from a normed sample, so the
 * score is an informed estimate rather than a clinically valid IQ.
 */
import type { Puzzle } from './types';

const D = 1.7;
const DISCRIMINATION = 1.3;

export interface Score {
  iq: number;
  low: number;
  high: number;
  percentile: number;
  correct: number;
  answered: number;
  total: number;
}

export function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function scoreRound(puzzles: Puzzle[], answers: (number | null)[]): Score {
  const results = puzzles.map((p, i) => ({ b: p.difficulty, c: 1 / p.options.length, ok: answers[i] === p.answer }));
  let sw = 0, swt = 0, swt2 = 0;
  for (let theta = -4; theta <= 4.0001; theta += 0.01) {
    let logL = -(theta * theta) / 2;
    for (const r of results) {
      const p = r.c + (1 - r.c) / (1 + Math.exp(-D * DISCRIMINATION * (theta - r.b)));
      logL += Math.log(r.ok ? p : 1 - p);
    }
    const w = Math.exp(logL);
    sw += w; swt += w * theta; swt2 += w * theta * theta;
  }
  const mean = swt / sw;
  const sd = Math.sqrt(Math.max(0, swt2 / sw - mean * mean));
  const iq = Math.round(100 + 15 * mean);
  return {
    iq,
    low: Math.round(100 + 15 * (mean - sd)),
    high: Math.round(100 + 15 * (mean + sd)),
    percentile: Math.round(normalCdf(mean) * 1000) / 10,
    correct: results.filter(r => r.ok).length,
    answered: answers.filter(a => a !== null).length,
    total: puzzles.length,
  };
}
