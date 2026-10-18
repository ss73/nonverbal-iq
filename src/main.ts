import './style.css';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import type { Puzzle } from './types';
import { GEN_VERSION, ROUND_ITEMS, ROUND_MS, buildRound } from './gen/round';
import { LETTERS, PATTERN_DEFS } from './figures';
import { figureSvg } from './render';
import { newSeed } from './rng';
import { scoreRound } from './scoring';
import { makeMatrix } from './gen/matrix';
import { makeSeries } from './gen/series';
import { makeOdd } from './gen/odd';
import { mulberry32 } from './rng';
import {
  type ResultRecord, type Session, addHistory, clearHistory, getSkipIntro, loadHistory, loadSession, saveSession, setSkipIntro,
} from './storage';
import { confirmSheet, isSheetOpen, openSheet } from './ui/sheet';
import { navigate } from './ui/nav';
import * as haptics from './ui/haptics';
import { type Shot, seedShot } from './shots';

const app = document.getElementById('app')!;
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native');
document.body.insertAdjacentHTML('afterbegin', PATTERN_DEFS);

let session: Session | null = null;
let puzzles: Puzzle[] = [];
let timer: number | undefined;
let advanceTimer: number | undefined;

const KIND_LABEL = { matrix: 'Matrix', series: 'Series', odd: 'Odd one out' } as const;

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector<T>(sel)!;

function stopTimers() {
  clearInterval(timer);
  clearTimeout(advanceTimer);
  timer = advanceTimer = undefined;
}

// =============================================================================================
// Shared content

const ICON_INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.25"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>';
const ICON_CHEVRON = '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5 6.5 7l-5 5.5"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 10 18" aria-hidden="true"><path d="M8.5 1.5 1.5 9l7 7.5"/></svg>';

const RULES = `
  <ul class="rule-list">
    <li><strong>${ROUND_MS / 60000} minutes</strong> for the whole test, not per puzzle — skip around freely and come back.</li>
    <li><strong>It gets harder</strong> as you go. Most people don't finish every puzzle.</li>
    <li><strong>Guess</strong> if you're short of time: a wrong answer costs no more than a blank one.</li>
    <li><strong>Submit</strong> whenever you're done. When time runs out, the test is submitted for you.</li>
  </ul>`;

const METHOD = `
  <p><strong>Item types.</strong> Matrices follow the design of Raven's Progressive Matrices, the core of most culture-reduced IQ tests, including many Mensa admission tests. Series and odd-one-out puzzles follow the matching subtests of Cattell's Culture Fair Intelligence Test. All of them measure <em>fluid reasoning</em>: finding abstract rules in material you haven't seen before.</p>
  <p><strong>Puzzle generation.</strong> Matrices are built from the rule types Carpenter, Just &amp; Shell (1990) identified in Raven's test: constant, progression, distribution of three values, arithmetic (adding and subtracting), and set operations such as XOR, applied to shape, fill, number and position. Further matrices overlay lines (adding, subtracting or cancelling them out) or rotate and mirror a pattern. A puzzle is rejected if another sensible reading of the rows or columns would give a different answer. Following the I-RAVEN dataset (Hu et al., 2021), the eight options form a balanced tree, so every feature of the answer appears in exactly half the options. Choosing the most common features gets you nowhere.</p>
  <p><strong>Scoring.</strong> Your answers are scored with a three-parameter item response model (3PL), the method behind modern adaptive tests. Harder puzzles count for more, and the model accounts for lucky guesses. The ability estimate is converted to the IQ scale (mean 100, standard deviation 15).</p>
  <p><strong>Limitations.</strong> Puzzle difficulties are set from rule complexity, not measured on a large norm group, and a 10-minute test can only be so precise. Take the score as an informed estimate, not a clinical or official IQ result.</p>
`;

// Fixed example puzzles (same seeds every time) for the illustrations.
let examples: { matrix: Puzzle; series: Puzzle; odd: Puzzle } | undefined;
const getExamples = () => (examples ??= {
  matrix: makeMatrix(mulberry32(11), 1),
  series: makeSeries(mulberry32(5), 1),
  odd: makeOdd(mulberry32(3), 'type'),
});

const miniCell = (f: Puzzle['stem'][number]) => f ? `<span class="mini-cell">${figureSvg(f)}</span>` : '<span class="mini-cell missing">?</span>';
const miniMatrix = (p: Puzzle) => `<span class="mini mini-matrix" aria-hidden="true">${p.stem.map(miniCell).join('')}</span>`;
const miniSeries = (p: Puzzle) => `<span class="mini mini-series" aria-hidden="true">${[...p.stem.slice(1, 4), null].map(miniCell).join('')}</span>`;
const miniOdd = (p: Puzzle) => `<span class="mini mini-odd" aria-hidden="true">${p.options.map(f => miniCell(f)).join('')}</span>`;

function puzzleTypes(): string {
  const ex = getExamples();
  return `
    <ul class="type-list">
      <li>${miniMatrix(ex.matrix)}<div><strong>Matrices</strong><span>Find the panel that completes the grid. Every row follows the same hidden rules.</span></div></li>
      <li>${miniSeries(ex.series)}<div><strong>Series</strong><span>Work out how each part changes, and pick the next frame.</span></div></li>
      <li>${miniOdd(ex.odd)}<div><strong>Odd one out</strong><span>Four figures share a rule. Find the one that breaks it.</span></div></li>
    </ul>`;
}

const fmtDate = (t: number) => {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
};

// =============================================================================================
// Home

function sparkline(values: number[]): string {
  const lo = Math.min(...values) - 4, hi = Math.max(...values) + 4;
  const x = (i: number) => (values.length === 1 ? 50 : (i / (values.length - 1)) * 100);
  const y = (v: number) => 26 - ((v - lo) / (hi - lo)) * 22;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return `
    <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" vector-effect="non-scaling-stroke"/>
    </svg>
    <span class="spark-dot" style="left:${x(last)}%;top:${(y(values[last]) / 30) * 100}%"></span>`;
}

function showHome() {
  stopTimers();
  window.scrollTo(0, 0);
  const history = loadHistory();
  const latest = history[0];
  const best = history.length ? Math.max(...history.map(r => r.iq)) : 0;
  const trend = history.slice(0, 10).map(r => r.iq).reverse();

  const summary = latest ? `
    <section class="card summary" aria-label="Your scores">
      <dl class="summary-stats">
        <div><dt>Latest</dt><dd>${latest.iq}</dd></div>
        <div><dt>Best</dt><dd>${best}</dd></div>
        <div><dt>Tests</dt><dd>${history.length}</dd></div>
      </dl>
      ${trend.length > 1 ? `<div class="spark-wrap">${sparkline(trend)}</div><p class="summary-note">Last ${trend.length} tests</p>` : ''}
    </section>` : `
    <section class="card summary empty">
      ${miniMatrix(getExamples().matrix)}
      <div>
        <h2>Test your pattern reasoning</h2>
        <p>${ROUND_ITEMS} puzzles · ${ROUND_MS / 60000} minutes · no words or numbers</p>
      </div>
    </section>`;

  app.innerHTML = `
  <main class="wrap home">
    <header class="large-title">
      <h1>Nonverbal IQ</h1>
      <button class="icon-btn" id="info" aria-label="About and settings">${ICON_INFO}</button>
    </header>
    ${summary}
    ${history.length ? `
    <h2 class="list-title">Previous results</h2>
    <ul class="list">
      ${history.map((r, i) => `
        <li><button class="list-row" data-i="${i}">
          <span class="row-main"><span>${fmtDate(r.finishedAt)}</span><small>${r.correct} of ${r.total} correct</small></span>
          <span class="row-value">${r.iq}</span>${ICON_CHEVRON}
        </button></li>`).join('')}
    </ul>` : ''}
  </main>
  <div class="actionbar"><div class="actionbar-in"><button class="btn primary big block" id="start">Start test</button></div></div>`;

  $('#start').addEventListener('click', requestStart);
  $('#info').addEventListener('click', showInfo);
  app.querySelectorAll<HTMLButtonElement>('.list-row').forEach(b =>
    b.addEventListener('click', () => navigate('push', () => showResults(history[Number(b.dataset.i)]))));
}

/** Start button: show the "Before you start" sheet unless the user has turned it off. */
function requestStart() {
  if (getSkipIntro()) { beginTest(); return; }
  const s = openSheet(`
    <div class="sheet-head">
      <h2>Before you start</h2>
      <p>${ROUND_ITEMS} puzzles · ${ROUND_MS / 60000} minutes</p>
    </div>
    ${puzzleTypes()}
    ${RULES}
    <label class="check"><input type="checkbox" id="skip-intro"> Don't show this again</label>
    <button class="btn primary big block" id="begin">Begin</button>`, { label: 'Before you start', className: 'intro' });
  s.el.querySelector('#begin')!.addEventListener('click', () => {
    if (s.el.querySelector<HTMLInputElement>('#skip-intro')!.checked) setSkipIntro(true);
    s.close();
    beginTest();
  });
}

function showInfo() {
  const history = loadHistory();
  const s = openSheet(`
    <div class="sheet-head"><h2>About</h2></div>

    <h3 class="group-title">Settings</h3>
    <div class="group">
      <label class="group-row">
        <span>Show tips before each test</span>
        <input type="checkbox" class="switch" id="tips" ${getSkipIntro() ? '' : 'checked'}>
      </label>
      <button class="group-row danger" id="clear" ${history.length ? '' : 'disabled'}>Clear all results</button>
    </div>
    <p class="group-note">Your results are stored only on this device. Nothing is sent anywhere.</p>

    <h3 class="group-title">How the test works</h3>
    <div class="group pad">${puzzleTypes()}${RULES}</div>

    <h3 class="group-title">The method</h3>
    <div class="group pad prose">${METHOD}</div>`, { label: 'About and settings', className: 'tall' });

  s.el.querySelector<HTMLInputElement>('#tips')!.addEventListener('change', e => setSkipIntro(!(e.target as HTMLInputElement).checked));
  s.el.querySelector('#clear')!.addEventListener('click', () => confirmSheet({
    title: 'Clear all results?',
    body: `This permanently deletes ${history.length === 1 ? 'your saved result' : `all <strong>${history.length}</strong> saved results`} from this device, including their solutions. It can't be undone.`,
    cancel: 'Keep them',
    confirm: 'Clear all',
    danger: true,
    onConfirm: () => { clearHistory(); s.close(); showHome(); },
  }));
}

// =============================================================================================
// Test

function beginTest() {
  session = { v: GEN_VERSION, seed: newSeed(), startedAt: Date.now(), durationMs: ROUND_MS, answers: Array(ROUND_ITEMS).fill(null), current: 0 };
  saveSession(session);
  navigate('push', showTest);
}

const remaining = () => (session ? session.startedAt + session.durationMs - Date.now() : 0);

function showTest() {
  const s = session!;
  puzzles = buildRound(s.seed);
  window.scrollTo(0, 0);
  app.innerHTML = `
  <div class="test">
    <header class="bar">
      <div class="bar-in">
        <span class="qcount" id="qcount"></span>
        <span class="timer" id="timer" role="timer"></span>
        <button class="btn submit" id="submit">Submit</button>
      </div>
      <div class="timebar" aria-hidden="true"><div id="timebar-fill"></div></div>
    </header>
    <nav class="qnav" id="qnav" aria-label="Jump to puzzle">
      ${puzzles.map((_, i) => `<button class="qdot" data-q="${i}" aria-label="Puzzle ${i + 1}">${i + 1}</button>`).join('')}
    </nav>
    <main class="wrap qwrap" id="question"></main>
    <footer class="navbar">
      <div class="navbar-in">
        <button class="btn" id="prev">← Previous</button>
        <button class="btn primary" id="next">Next →</button>
      </div>
    </footer>
  </div>`;

  $('#submit').addEventListener('click', confirmSubmit);
  $('#prev').addEventListener('click', () => goTo(s.current - 1));
  $('#next').addEventListener('click', () => (s.current === puzzles.length - 1 ? confirmSubmit() : goTo(s.current + 1)));
  app.querySelectorAll<HTMLButtonElement>('.qdot').forEach(b => b.addEventListener('click', () => goTo(Number(b.dataset.q))));
  $('#question').addEventListener('click', e => {
    const opt = (e.target as HTMLElement).closest<HTMLButtonElement>('.opt');
    if (opt) choose(Number(opt.dataset.o));
  });

  renderQuestion();
  tick();
  timer = window.setInterval(tick, 250);
}

function tick() {
  const left = remaining();
  if (left <= 0) { finish(true); return; }
  const t = $('#timer');
  t.textContent = fmtTime(left);
  t.classList.toggle('low', left < 60_000);
  $('#timebar-fill').style.width = `${(left / session!.durationMs) * 100}%`;
}

function goTo(i: number) {
  const s = session!;
  if (i < 0 || i >= puzzles.length) return;
  clearTimeout(advanceTimer);
  s.current = i;
  saveSession(s);
  renderQuestion();
  window.scrollTo({ top: 0 });
}

function choose(o: number) {
  const s = session!;
  const first = s.answers[s.current] === null;
  if (s.answers[s.current] !== o) haptics.tap();
  s.answers[s.current] = o;
  saveSession(s);
  renderQuestion();
  // On a first answer, move on automatically; on a changed answer, stay put.
  if (first && s.current < puzzles.length - 1) {
    clearTimeout(advanceTimer);
    advanceTimer = window.setTimeout(() => goTo(s.current + 1), 450);
  }
}

function puzzleStem(p: Puzzle): string {
  if (p.kind === 'odd') return '';
  const cells = p.stem.map(f => f ? `<div class="cell">${figureSvg(f)}</div>` : `<div class="cell missing"><span>?</span></div>`).join('');
  return `<div class="stem ${p.kind}">${cells}</div>`;
}

function renderQuestion() {
  const s = session!;
  const p = puzzles[s.current];
  const chosen = s.answers[s.current];
  $('#qcount').innerHTML = `Puzzle <strong>${s.current + 1}</strong> / ${puzzles.length}`;
  app.querySelectorAll<HTMLButtonElement>('.qdot').forEach((b, i) => {
    b.classList.toggle('done', s.answers[i] !== null);
    b.classList.toggle('current', i === s.current);
    if (i === s.current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  $('#qnav').querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  ($('#prev') as HTMLButtonElement).disabled = s.current === 0;
  $('#next').textContent = s.current === puzzles.length - 1 ? 'Finish' : 'Next →';

  $('#question').innerHTML = `
    <p class="prompt"><span class="kind-tag">${KIND_LABEL[p.kind]}</span>${p.prompt}</p>
    <div class="qbody ${p.kind}">
      ${puzzleStem(p)}
      <div class="options ${p.kind}" role="radiogroup" aria-label="Answer options">
        ${p.options.map((f, i) => `
          <button class="opt" role="radio" data-o="${i}" aria-checked="${chosen === i}" aria-label="Option ${LETTERS[i]}">
            ${figureSvg(f)}<span class="lbl">${LETTERS[i]}</span>
          </button>`).join('')}
      </div>
    </div>`;
}

function confirmSubmit() {
  const answered = session!.answers.filter(a => a !== null).length;
  confirmSheet({
    title: 'Submit your answers?',
    body: `You've answered <strong>${answered} of ${puzzles.length}</strong> puzzles and have <strong>${fmtTime(remaining())}</strong> left.
      ${answered < puzzles.length ? 'Unanswered puzzles count as wrong.' : ''}`,
    cancel: 'Keep going',
    confirm: 'Submit',
    onConfirm: () => finish(false),
  });
}

function finish(timedOut: boolean) {
  const s = session!;
  stopTimers();
  document.querySelectorAll('.sheet-back').forEach(el => el.remove());
  document.body.classList.remove('sheet-lock');
  haptics.done();
  const score = scoreRound(puzzles, s.answers);
  const record: ResultRecord = {
    v: GEN_VERSION,
    seed: s.seed,
    finishedAt: Date.now(),
    elapsedMs: Math.min(s.durationMs, Date.now() - s.startedAt),
    answers: s.answers,
    iq: score.iq,
    correct: score.correct,
    total: score.total,
    timedOut,
  };
  addHistory(record);
  session = null;
  saveSession(null);
  navigate('push', () => showResults(record));
}

// =============================================================================================
// Results

function bellCurve(iq: number): string {
  const W = 320, H = 110, lo = 55, hi = 145;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;
  const y = (v: number) => H - 8 - Math.exp(-(((v - 100) / 15) ** 2) / 2) * (H - 24);
  const pts: string[] = [];
  for (let v = lo; v <= hi; v += 1) pts.push(`${x(v).toFixed(1)},${y(v).toFixed(1)}`);
  const clamped = Math.max(lo, Math.min(hi, iq));
  const filled = pts.filter((_, i) => lo + i <= clamped);
  const area = `M0,${H - 8} L${filled.join(' L')} L${x(clamped).toFixed(1)},${H - 8} Z`;
  const ticks = [70, 85, 100, 115, 130].map(v =>
    `<line x1="${x(v)}" y1="${H - 8}" x2="${x(v)}" y2="${H - 4}" class="bc-axis"/><text x="${x(v)}" y="${H + 8}" class="bc-tick">${v}</text>`).join('');
  return `
    <svg class="bell" viewBox="0 -4 ${W} ${H + 16}" role="img" aria-label="Your score on the population distribution">
      <path d="${area}" class="bc-fill"/>
      <polyline points="${pts.join(' ')}" class="bc-line"/>
      <line x1="0" y1="${H - 8}" x2="${W}" y2="${H - 8}" class="bc-axis"/>
      ${ticks}
      <line x1="${x(clamped)}" y1="4" x2="${x(clamped)}" y2="${H - 8}" class="bc-you"/>
      <circle cx="${x(clamped)}" cy="${y(clamped)}" r="4" class="bc-dot"/>
    </svg>`;
}

function band(iq: number): string {
  if (iq >= 130) return 'Very superior';
  if (iq >= 120) return 'Superior';
  if (iq >= 110) return 'High average';
  if (iq >= 90) return 'Average';
  if (iq >= 80) return 'Low average';
  return 'Below average';
}

function showResults(record: ResultRecord) {
  stopTimers();
  window.scrollTo(0, 0);
  puzzles = buildRound(record.seed);
  const score = scoreRound(puzzles, record.answers);
  const pct = score.percentile;
  const pctText = pct >= 99.9 ? 'more than 99.9%' : pct < 1 ? 'less than 1%' : `about ${Math.round(pct)}%`;

  app.innerHTML = `
  <header class="topnav">
    <div class="topnav-in">
      <button class="nav-back" id="home">${ICON_BACK}<span>Home</span></button>
      <span class="topnav-title">Result</span>
    </div>
  </header>
  <main class="wrap results under-nav">
    <section class="card score-card">
      <p class="eyebrow">${record.timedOut ? 'Time’s up — your result' : 'Your result'}</p>
      <div class="score-main">
        <div>
          <div class="iq-label">Estimated IQ</div>
          <div class="iq">${score.iq}</div>
          <div class="iq-band">${band(score.iq)}</div>
        </div>
        ${bellCurve(score.iq)}
      </div>
      <p class="score-text">Likely range <strong>${score.low}–${score.high}</strong>. That scores higher than ${pctText} of the population.</p>
      <dl class="stats">
        <div><dt>Correct</dt><dd>${score.correct} / ${score.total}</dd></div>
        <div><dt>Answered</dt><dd>${score.answered} / ${score.total}</dd></div>
        <div><dt>Time used</dt><dd>${fmtTime(record.elapsedMs)}</dd></div>
      </dl>
      <button class="btn primary big block" id="again">Take a new test</button>
      <p class="fine">An estimate from a short, unnormed test — not an official IQ assessment. See ⓘ on the home screen for how it works.</p>
    </section>

    <h2 class="review-title">Review</h2>
    <ol class="review">
      ${puzzles.map((p, i) => {
        const a = record.answers[i];
        const st = a === null ? 'skip' : a === p.answer ? 'ok' : 'bad';
        const label = { ok: '✓ Correct', bad: '✗ Wrong', skip: '— Not answered' }[st];
        const stars = Math.max(1, Math.min(5, Math.round((p.difficulty + 2) / 4.5 * 4) + 1));
        return `
        <li class="rv ${st}">
          <button class="rv-head" aria-expanded="false" data-i="${i}">
            <span class="rv-num">${i + 1}</span>
            <span class="rv-kind">${KIND_LABEL[p.kind]}<span class="rv-diff" aria-label="Difficulty ${stars} of 5">${'●'.repeat(stars)}${'○'.repeat(5 - stars)}</span></span>
            <span class="rv-status">${label}</span>
            <span class="rv-chev" aria-hidden="true"></span>
          </button>
          <div class="rv-body" hidden></div>
        </li>`;
      }).join('')}
    </ol>
  </main>`;

  $('#again').addEventListener('click', requestStart);
  $('#home').addEventListener('click', () => navigate('pop', showHome));
  app.querySelectorAll<HTMLButtonElement>('.rv-head').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.i);
    const body = btn.nextElementSibling as HTMLElement;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    if (open && !body.innerHTML) body.innerHTML = reviewBody(puzzles[i], record.answers[i]);
    body.hidden = !open;
  }));
}

function reviewBody(p: Puzzle, a: number | null): string {
  return `
    <p class="prompt small">${p.prompt}</p>
    <div class="qbody ${p.kind} review-q">
      ${puzzleStem(p)}
      <div class="options ${p.kind}">
        ${p.options.map((f, i) => {
          const cls = i === p.answer ? 'correct' : i === a ? 'wrong' : '';
          const tag = i === p.answer ? (i === a ? 'Your answer ✓' : 'Correct') : i === a ? 'Your answer' : '';
          return `<div class="opt static ${cls}">${figureSvg(f)}<span class="lbl">${LETTERS[i]}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</div>`;
        }).join('')}
      </div>
    </div>
    <h3 class="expl-title">Solution</h3>
    <ol class="expl">${p.explanation.map(e => `<li>${bold(e)}</li>`).join('')}</ol>`;
}

// =============================================================================================
// Keyboard

document.addEventListener('keydown', e => {
  if (!session || isSheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  const p = puzzles[session.current];
  const k = e.key.toUpperCase();
  const idx = LETTERS.indexOf(k);
  if (k.length === 1 && idx >= 0 && idx < p.options.length) { e.preventDefault(); choose(idx); }
  else if (/^[1-8]$/.test(k) && Number(k) <= p.options.length) { e.preventDefault(); choose(Number(k) - 1); }
  else if (e.key === 'ArrowRight') goTo(session.current + 1);
  else if (e.key === 'ArrowLeft') goTo(session.current - 1);
});

// =============================================================================================
// Boot: resume a round in progress (the clock keeps running across reloads).

// Offline support for the hosted web version. Skipped in development, and inside a native app shell
// (which serves the files from the device and doesn't use an https: origin).
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
}

// App Store screenshot builds only (VITE_SHOT=<scene>); compiled out of normal builds.
const shot = import.meta.env.VITE_SHOT as Shot | undefined;
if (shot) seedShot(shot);

session = loadSession();
if (shot === 'results' || shot === 'review') {
  showResults(loadHistory()[0]);
  if (shot === 'review') {
    const heads = app.querySelectorAll<HTMLButtonElement>('.rv-head');
    const pick = heads[heads.length - 4];
    pick.click();
    pick.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -64);
  }
} else if (session) {
  if (remaining() > 0) showTest();
  else { puzzles = buildRound(session.seed); finish(true); }
} else {
  showHome();
}

// Native app: the launch screen stays up until now (launchAutoHide is off), then fades out once the
// first screen has painted.
if (Capacitor.isNativePlatform()) requestAnimationFrame(() => requestAnimationFrame(() => SplashScreen.hide()));
