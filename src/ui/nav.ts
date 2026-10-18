/**
 * Screen transitions in the style of iOS navigation: a new screen slides in from the right ("push"),
 * going back slides the current one away to the right ("pop"). Uses the View Transitions API where
 * available (Safari 18+, Chrome); elsewhere, and with reduced motion, screens simply swap.
 */
export type NavDirection = 'push' | 'pop' | 'none';

interface ViewTransitionDocument {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
}

export function navigate(dir: NavDirection, render: () => void): void {
  const doc = document as unknown as ViewTransitionDocument;
  if (dir === 'none' || !doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    render();
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = dir;
  doc.startViewTransition(render).finished.finally(() => { delete root.dataset.nav; });
}
