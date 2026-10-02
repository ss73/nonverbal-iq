import type { Figure, Prim } from './types';
import { INK } from './figures';

function prim(p: Prim): string {
  const stroke = p.stroke ?? INK;
  const sw = p.sw ?? 2;
  switch (p.t) {
    case 'poly':
      return `<polygon points="${p.pts.map(([x, y]) => `${x},${y}`).join(' ')}" fill="${p.fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    case 'circle':
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 'line':
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
    case 'rect':
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
}

export function figureSvg(fig: Figure): string {
  return `<svg class="fig" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${fig.map(prim).join('')}</svg>`;
}
