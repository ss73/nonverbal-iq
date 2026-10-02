/** Drawing primitives in a 100×100 viewBox. Generators emit these; the renderer turns them into SVG. */
export type Prim =
  | { t: 'poly'; pts: [number, number][]; fill: string; stroke?: string; sw?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke?: string; sw?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string; sw?: number };

export type Figure = Prim[];

export type PuzzleKind = 'matrix' | 'series' | 'odd';

export interface Puzzle {
  kind: PuzzleKind;
  prompt: string;
  /** Item difficulty on the IRT logit scale (b parameter). */
  difficulty: number;
  /** Figures shown above the options; `null` marks the missing cell. Empty for odd-one-out. */
  stem: (Figure | null)[];
  options: Figure[];
  answer: number;
  /** Solution steps. `**text**` is rendered bold. */
  explanation: string[];
}
