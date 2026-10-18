/**
 * App Store screenshot scenes. Only reachable when built with VITE_SHOT=<scene> (see
 * scripts/screenshots.sh); production builds tree-shake this module away.
 *
 * `seedShot` replaces local storage with a believable history (and, for the test scenes, a round in
 * progress) before the app boots. main.ts then opens the screen the scene needs.
 */
import type { Puzzle } from './types';
import { GEN_VERSION, ROUND_ITEMS, ROUND_MS, buildRound } from './gen/round';
import { scoreRound } from './scoring';
import type { ResultRecord, Session } from './storage';

export type Shot = 'home' | 'matrix' | 'series' | 'results' | 'review';

const DAY = 86_400_000;

/** Answers with the `correct` easiest puzzles right (rounds are sorted by difficulty), the rest wrong. */
function answersFor(puzzles: Puzzle[], correct: number): number[] {
  return puzzles.map((p, i) => (i < correct ? p.answer : (p.answer + 1) % p.options.length));
}

function record(seed: number, correct: number, daysAgo: number, elapsedMin: number): ResultRecord {
  const puzzles = buildRound(seed);
  const answers = answersFor(puzzles, correct);
  const score = scoreRound(puzzles, answers);
  return {
    v: GEN_VERSION, seed, answers, iq: score.iq, correct: score.correct, total: score.total,
    finishedAt: Date.now() - daysAgo * DAY - 3_600_000, elapsedMs: elapsedMin * 60_000, timedOut: false,
  };
}

/** Index of the hardest puzzle of a kind, optionally skipping the very hardest ones. */
function hardest(puzzles: Puzzle[], kind: Puzzle['kind'], skip = 0): number {
  const idx = puzzles.map((p, i) => [p, i] as const).filter(([p]) => p.kind === kind).map(([, i]) => i);
  return idx[Math.max(0, idx.length - 1 - skip)];
}

export function seedShot(shot: Shot): void {
  localStorage.clear();
  localStorage.setItem('nviq.skipIntro', '1');
  // Newest first; a gently rising trend for the sparkline.
  const history = [
    record(4021, 13, 0, 8.7), record(3310, 12, 3, 9.4), record(2875, 12, 6, 9.9),
    record(1966, 10, 11, 10), record(1542, 11, 15, 9.1), record(1207, 9, 21, 10),
  ];
  localStorage.setItem('nviq.history', JSON.stringify(history));

  if (shot === 'matrix' || shot === 'series') {
    const seed = 777;
    const puzzles = buildRound(seed);
    const current = shot === 'matrix' ? hardest(puzzles, 'matrix', 1) : hardest(puzzles, 'series');
    const answers: (number | null)[] = Array(ROUND_ITEMS).fill(null);
    for (let i = 0; i < current; i++) if (i % 5 !== 3) answers[i] = puzzles[i].answer;
    if (shot === 'series') answers[current] = puzzles[current].answer;
    const session: Session = {
      v: GEN_VERSION, seed, startedAt: Date.now() - (ROUND_MS - 372_000), durationMs: ROUND_MS, answers, current,
    };
    localStorage.setItem('nviq.session', JSON.stringify(session));
  }
}
