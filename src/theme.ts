/**
 * Light / dark / system colour theme. "System" follows prefers-color-scheme; light and dark set
 * data-theme on <html>, which style.css uses to force a palette. index.html applies the saved
 * choice in an inline script before first paint, so there is no flash of the wrong theme.
 */
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'nviq.theme';
// Browser UI colour (address bar on mobile), matching --bg in each palette.
const BAR = { light: '#f6f5f2', dark: '#131416' };

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  // index.html has one theme-color meta per colour scheme; a forced theme overrides both.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = BAR[t === 'system' ? scheme : t];
  });
}

function setTheme(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage unavailable: the theme still applies for this visit.
  }
  applyTheme(t);
}

const ICONS: Record<Theme, string> = {
  system: '<rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 13.5V17"/>',
  light: '<circle cx="10" cy="10" r="3.5"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/>',
  dark: '<path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z"/>',
};
const LABELS: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };
const TITLES: Record<Theme, string> = { system: 'Match your device setting', light: 'Light theme', dark: 'Dark theme' };

export function themeSwitcherHtml(): string {
  const current = getTheme();
  return `
    <div class="theme-switch" role="radiogroup" aria-label="Colour theme">
      ${(['system', 'light', 'dark'] as Theme[]).map(t => `
        <button role="radio" aria-checked="${t === current}" data-theme-choice="${t}" title="${TITLES[t]}">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">${ICONS[t]}</svg><span>${LABELS[t]}</span>
        </button>`).join('')}
    </div>`;
}

/** Wires up every theme switcher inside `root` (call after rendering one). */
export function bindThemeSwitcher(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach(btn =>
    btn.addEventListener('click', () => {
      const t = btn.dataset.themeChoice as Theme;
      setTheme(t);
      root.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
    }));
}

// Sync the meta colours with any saved choice once the module loads.
applyTheme(getTheme());
