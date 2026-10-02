import type { Figure, Prim } from './types';

export const LETTERS = 'ABCDEFGH';
export const INK = '#1c1c1c';

// Entity attributes. Fills are black, white or a black-on-white pattern — no colours or greys —
// so they are colour-blind safe and easy to tell apart even at small sizes.
export const SHAPE_NAMES = ['triangle', 'square', 'pentagon', 'hexagon', 'circle'];
export const SHAPE_PLURALS = ['triangles', 'squares', 'pentagons', 'hexagons', 'circles'];
export const SHAPE_SIDES = [3, 4, 5, 6, 0];
// Only two sizes, clearly apart: finer size steps proved too hard to tell apart on screen.
export const SIZE_SCALE = [0.55, 1];
export const SIZE_NAMES = ['small', 'large'];
export const SIZES = [0, 1];
// Four fills only: finer patterns (e.g. checkers) become unreadable on the small shapes in 3×3 grids.
export const FILLS = ['#ffffff', 'url(#pf-stripes)', 'url(#pf-dots)', INK];
export const FILL_NAMES = ['white', 'striped', 'dotted', 'black'];
export const FILL_IDS = [0, 1, 2, 3];

/**
 * Pattern definitions, inserted once per page in a hidden sprite (patterns inside display:none SVGs
 * don't render, so every figure references these). Units are the figures' 100×100 viewBox.
 */
export const PATTERN_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="pf-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="2.6" height="6" fill="${INK}"/></pattern>
<pattern id="pf-dots" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#fff"/><circle cx="1.75" cy="1.75" r="1.35" fill="${INK}"/><circle cx="5.25" cy="5.25" r="1.35" fill="${INK}"/></pattern>
</defs></svg>`;

// Per-shape radius factors so shapes of the same "size" look about equally big.
const SHAPE_K = [1.12, 1, 1, 0.97, 0.9];
// Triangles are drawn slightly lower so they look centred rather than top-heavy.
const TRI_SHIFT = 0.18;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function polygon(sides: number, cx: number, cy: number, r: number, rotDeg = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotDeg + (i * 360) / sides - 90) * Math.PI) / 180;
    pts.push([r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))]);
  }
  return pts;
}

/** Visual centre of a shape drawn at (cx, cy); differs from cy only for triangles. */
export function shapeCenterY(shape: number, cy: number, r: number): number {
  return shape === 0 ? cy + TRI_SHIFT * r * SHAPE_K[0] : cy;
}

export function shapePrim(shape: number, cx: number, cy: number, r: number, fill: string, sw = 2): Prim {
  const k = SHAPE_K[shape] * r;
  if (SHAPE_SIDES[shape] === 0) return { t: 'circle', cx, cy, r: r2(k), fill, sw };
  const sides = SHAPE_SIDES[shape];
  return { t: 'poly', pts: polygon(sides, cx, shapeCenterY(shape, cy, r), k, sides === 4 ? 45 : 0), fill, sw };
}

// ---- Arrow + dot frames (figure series and one odd-one-out type) ----

export const ARROW_FILLS = [FILLS[0], FILLS[1], FILLS[3]];
export const ARROW_FILL_NAMES = ['white', 'striped', 'black'];
export const DOT_FILLS = [INK, '#ffffff'];
export const DOT_FILL_NAMES = ['black', 'white'];
export const DIR_NAMES = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
export const POS_NAMES = ['top', 'top right', 'right', 'bottom right', 'bottom', 'bottom left', 'left', 'top left'];

export const mod8 = (n: number) => ((n % 8) + 8) % 8;

function ringPoint(pos: number, radius: number): [number, number] {
  const a = (pos * 45 * Math.PI) / 180;
  return [r2(50 + radius * Math.sin(a)), r2(50 - radius * Math.cos(a))];
}

const ARROW: [number, number][] = [
  [-4.5, 24], [4.5, 24], [4.5, -7], [13, -7], [0, -26], [-13, -7], [-4.5, -7],
];

export interface ArrowFrame {
  dir: number; // 0..7, 45° steps clockwise from up
  fill: number; // index into ARROW_FILLS
  mpos: number; // 0..7, dot position clockwise from top
  mfill: number; // index into DOT_FILLS
}

export function arrowFrameFigure(f: ArrowFrame): Figure {
  const prims: Prim[] = [];
  for (let p = 0; p < 8; p++) {
    const [x, y] = ringPoint(p, 38);
    prims.push({ t: 'circle', cx: x, cy: y, r: 1.6, fill: '#bdbdbd', stroke: 'none', sw: 0 });
  }
  const a = (f.dir * 45 * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  prims.push({
    t: 'poly',
    pts: ARROW.map(([x, y]) => [r2(50 + x * cos - y * sin), r2(50 + x * sin + y * cos)]),
    fill: ARROW_FILLS[f.fill],
    sw: 2,
  });
  const [mx, my] = ringPoint(f.mpos, 38);
  prims.push({ t: 'circle', cx: mx, cy: my, r: 6.5, fill: DOT_FILLS[f.mfill], sw: 2 });
  return prims;
}

// ---- Square cell patterns (odd-one-out symmetry/mirror types) ----

export function cellGridFigure(mask: number, n: number): Figure {
  const size = 72, x0 = 14, s = size / n;
  const prims: Prim[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    const on = (mask >> i) & 1;
    prims.push({
      t: 'rect', x: r2(x0 + c * s), y: r2(x0 + r * s), w: r2(s), h: r2(s),
      fill: on ? INK : '#ffffff', stroke: on ? INK : '#c4c4c4', sw: 1,
    });
  }
  prims.push({ t: 'rect', x: x0, y: x0, w: size, h: size, fill: 'none', stroke: INK, sw: 1.6 });
  return prims;
}

// ---- Text helpers for explanations ----

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
