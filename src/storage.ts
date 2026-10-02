import { GEN_VERSION } from './gen/round';

export interface Session {
  v: number;
  seed: number;
  startedAt: number;
  durationMs: number;
  answers: (number | null)[];
  current: number;
}

export interface ResultRecord {
  v: number;
  seed: number;
  finishedAt: number;
  elapsedMs: number;
  answers: (number | null)[];
  iq: number;
  correct: number;
  total: number;
  timedOut: boolean;
}

const SESSION_KEY = 'nviq.session';
const HISTORY_KEY = 'nviq.history';
const HISTORY_MAX = 20;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode etc.) — the app still works, just without persistence.
  }
}

export function loadSession(): Session | null {
  const s = read<Session>(SESSION_KEY);
  return s && s.v === GEN_VERSION ? s : null;
}

export const saveSession = (s: Session | null) => write(SESSION_KEY, s);

export function loadHistory(): ResultRecord[] {
  return (read<ResultRecord[]>(HISTORY_KEY) ?? []).filter(r => r.v === GEN_VERSION);
}

export function addHistory(r: ResultRecord): void {
  write(HISTORY_KEY, [r, ...loadHistory()].slice(0, HISTORY_MAX));
}

export const clearHistory = () => write(HISTORY_KEY, null);
