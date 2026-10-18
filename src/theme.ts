/**
 * Appearance override (system / light / dark), kept for a future Settings screen. Nothing imports
 * this yet: the app follows the system appearance, as native apps do. To use it, call applyTheme(getTheme())
 * at startup — ideally from an inline script in index.html, before first paint — and setTheme() from
 * the setting. style.css already supports data-theme on <html>.
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

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  // index.html has one theme-color meta per colour scheme; a forced theme overrides both.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = BAR[t === 'system' ? scheme : t];
  });
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage unavailable: the theme still applies for this visit.
  }
  applyTheme(t);
}
