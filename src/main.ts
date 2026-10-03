import './style.css';
import type { Puzzle } from './types';
import { GEN_VERSION, ROUND_ITEMS, ROUND_MS, buildRound } from './gen/round';
import { LETTERS, PATTERN_DEFS } from './figures';
import { figureSvg } from './render';
import { newSeed } from './rng';
import { scoreRound } from './scoring';
import { type ResultRecord, type Session, addHistory, clearHistory, loadHistory, loadSession, saveSession } from './storage';
import { bindThemeSwitcher, themeSwitcherHtml } from './theme';

const app = document.getElementById('app')!;
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
// Home

function showHome() {
  stopTimers();
  window.scrollTo(0, 0);
  const history = loadHistory();
  app.innerHTML = `
  <main class="wrap home">
    <div class="topbar">${themeSwitcherHtml()}</div>
    <header class="hero">
      <p class="eyebrow">Nonverbal reasoning test</p>
      <h1>How well do you see patterns?</h1>
      <p class="lead">${ROUND_ITEMS} puzzles, ${ROUND_MS / 60000} minutes. Only shapes and patterns — no words, numbers or general knowledge. Every round is freshly generated.</p>
      <button class="btn primary big" id="start">Start test</button>
    </header>

    <section class="kinds" aria-label="Puzzle types">
      <article class="kind">
        <h2>Matrices</h2>
        <p>A 3×3 grid with the last panel missing. Each row follows the same hidden rules — find the panel that completes it.</p>
      </article>
      <article class="kind">
        <h2>Series</h2>
        <p>Five frames change step by step. Work out what each part is doing and pick the sixth frame.</p>
      </article>
      <article class="kind">
        <h2>Odd one out</h2>
        <p>Four figures share a rule and one breaks it. Find the one that doesn't belong.</p>
      </article>
    </section>

    <section class="card rules">
      <h2>Before you start</h2>
      <ul>
        <li>The clock runs for the whole test, not per puzzle. Skip around freely and come back later.</li>
        <li>Puzzles get harder as you go. Most people don't finish them all.</li>
        <li>A wrong answer costs no more than a blank one, so guess if you're short of time.</li>
        <li>You can submit at any time. When the time is up, the test is submitted automatically.</li>
        <li>Afterwards you'll see your score and a worked solution for every puzzle.</li>
      </ul>
    </section>

    ${history.length ? `
    <section class="card history">
      <div class="row-between">
        <h2>Your previous results</h2>
        <button class="btn ghost small" id="clear-history">Clear</button>
      </div>
      <ul class="hist-list">
        ${history.map((r, i) => `
          <li><button class="hist" data-i="${i}">
            <span class="hist-date">${new Date(r.finishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span class="hist-score">${r.correct}/${r.total}</span>
            <span class="hist-iq">IQ ${r.iq}</span>
          </button></li>`).join('')}
      </ul>
    </section>` : ''}

    <details class="card about">
      <summary>About the method</summary>
      <p><strong>Item types.</strong> Matrices follow the design of Raven's Progressive Matrices, the core of most culture-reduced IQ tests, including many Mensa admission tests. Series and odd-one-out puzzles follow the matching subtests of Cattell's Culture Fair Intelligence Test. All of them measure <em>fluid reasoning</em>: finding abstract rules in material you haven't seen before.</p>
      <p><strong>Puzzle generation.</strong> Matrices are built from the rule types Carpenter, Just &amp; Shell (1990) identified in Raven's test: constant, progression, distribution of three values, arithmetic (adding and subtracting), and set operations such as XOR, applied to shape, fill, number and position. Further matrices overlay lines (adding, subtracting or cancelling them out) or rotate and mirror a pattern. A puzzle is rejected if another sensible reading of the rows or columns would give a different answer. Following the I-RAVEN dataset (Hu et al., 2021), the eight options form a balanced tree, so every feature of the answer appears in exactly half the options. Choosing the most common features gets you nowhere.</p>
      <p><strong>Scoring.</strong> Your answers are scored with a three-parameter item response model (3PL), the method behind modern adaptive tests. Harder puzzles count for more, and the model accounts for lucky guesses. The ability estimate is converted to the IQ scale (mean 100, standard deviation 15).</p>
      <p><strong>Limitations.</strong> Puzzle difficulties are set from rule complexity, not measured on a large norm group, and a 10-minute test can only be so precise. Take the score as an informed estimate, not a clinical or official IQ result.</p>
      <p><strong>Accessibility.</strong> Figures use only black, white and black-and-white patterns, so colour vision doesn't matter. On a keyboard, press <kbd>A</kbd>–<kbd>H</kbd> to answer and <kbd>←</kbd>/<kbd>→</kbd> to move between puzzles.</p>
    </details>
  </main>`;

  $('#start').addEventListener('click', () => startTest());
  bindThemeSwitcher(app);
  app.querySelectorAll<HTMLButtonElement>('.hist').forEach(b =>
    b.addEventListener('click', () => showResults(history[Number(b.dataset.i)])));
  app.querySelector('#clear-history')?.addEventListener('click', () => confirmDialog({
    title: 'Clear all results?',
    body: `This permanently deletes ${history.length === 1 ? 'your saved result' : `all <strong>${history.length}</strong> saved results`} from this browser, including their solutions. It can't be undone.`,
    cancel: 'Keep them',
    confirm: 'Clear all',
    danger: true,
    onConfirm: () => { clearHistory(); showHome(); },
  }));
}

// =============================================================================================
// Test

function startTest() {
  session = { v: GEN_VERSION, seed: newSeed(), startedAt: Date.now(), durationMs: ROUND_MS, answers: Array(ROUND_ITEMS).fill(null), current: 0 };
  saveSession(session);
  showTest();
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

interface ConfirmOptions {
  title: string;
  body: string;
  cancel: string;
  confirm: string;
  /** Destructive action: red button, and focus starts on Cancel so Enter can't trigger it by accident. */
  danger?: boolean;
  onConfirm: () => void;
}

function confirmDialog(o: ConfirmOptions) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <h2 id="m-title">${o.title}</h2>
      <p>${o.body}</p>
      <div class="modal-actions">
        <button class="btn" data-act="cancel">${o.cancel}</button>
        <button class="btn ${o.danger ? 'danger' : 'primary'}" data-act="confirm">${o.confirm}</button>
      </div>
    </div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  back.addEventListener('click', e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'confirm') { close(); o.onConfirm(); }
    else if (act === 'cancel' || e.target === back) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  back.querySelector<HTMLButtonElement>(`[data-act="${o.danger ? 'cancel' : 'confirm'}"]`)!.focus();
}

function confirmSubmit() {
  const answered = session!.answers.filter(a => a !== null).length;
  confirmDialog({
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
  document.querySelector('.modal-back')?.remove();
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
  showResults(record);
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
  <main class="wrap results">
    <div class="topbar">${themeSwitcherHtml()}</div>
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
      <div class="actions">
        <button class="btn primary" id="again">Take a new test</button>
        <button class="btn" id="home">Home</button>
      </div>
      <p class="fine">An estimate from a short, unnormed test — not an official IQ assessment. See “About the method” on the home page.</p>
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

  $('#again').addEventListener('click', () => startTest());
  bindThemeSwitcher(app);
  $('#home').addEventListener('click', showHome);
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
  if (!session || document.querySelector('.modal-back') || e.metaKey || e.ctrlKey || e.altKey) return;
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

session = loadSession();
if (session) {
  if (remaining() > 0) showTest();
  else { puzzles = buildRound(session.seed); finish(true); }
} else {
  showHome();
}
