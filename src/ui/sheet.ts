/**
 * Bottom sheets: the native-style replacement for centred modal dialogs. A sheet slides up from the
 * bottom, dims the page behind it, and closes on a backdrop tap, Escape, or a downward swipe on its
 * grab handle.
 */

export interface Sheet {
  el: HTMLElement;
  close: () => void;
}

interface SheetOptions {
  label: string;
  className?: string;
  onClose?: () => void;
}

export const isSheetOpen = () => !!document.querySelector('.sheet-back');

export function openSheet(html: string, o: SheetOptions): Sheet {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `
    <div class="sheet ${o.className ?? ''}" role="dialog" aria-modal="true" aria-label="${o.label}" tabindex="-1">
      <div class="sheet-grab" aria-hidden="true"><span></span></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const sheet = back.querySelector<HTMLElement>('.sheet')!;
  const previousFocus = document.activeElement as HTMLElement | null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.classList.remove('open');
    sheet.style.transform = '';
    const done = () => { back.remove(); document.body.classList.remove('sheet-lock'); previousFocus?.focus?.(); };
    sheet.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400); // in case transitions are disabled (reduced motion)
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey, true);

  // Swipe down on the grab handle to dismiss.
  const grab = back.querySelector<HTMLElement>('.sheet-grab')!;
  let startY: number | null = null;
  grab.addEventListener('pointerdown', e => { startY = e.clientY; grab.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
  grab.addEventListener('pointermove', e => {
    if (startY === null) return;
    sheet.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`;
  });
  const release = (e: PointerEvent) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.style.transition = '';
    if (dy > 80) close();
    else sheet.style.transform = '';
  };
  grab.addEventListener('pointerup', release);
  grab.addEventListener('pointercancel', release);

  document.body.appendChild(back);
  document.body.classList.add('sheet-lock');
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('open')));
  sheet.focus({ preventScroll: true });
  return { el: sheet, close };
}

export interface ConfirmOptions {
  title: string;
  body: string;
  cancel: string;
  confirm: string;
  /** Destructive action: red button, and focus starts on Cancel so Enter can't trigger it by accident. */
  danger?: boolean;
  onConfirm: () => void;
}

/** An action sheet: title, message, and stacked full-width buttons with Cancel at the bottom. */
export function confirmSheet(o: ConfirmOptions): void {
  const s = openSheet(`
    <div class="action-sheet">
      <h2>${o.title}</h2>
      <p>${o.body}</p>
      <button class="btn big block ${o.danger ? 'danger' : 'primary'}" data-act="confirm">${o.confirm}</button>
      <button class="btn big block" data-act="cancel">${o.cancel}</button>
    </div>`, { label: o.title });
  s.el.addEventListener('click', e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'confirm') { s.close(); o.onConfirm(); }
    else if (act === 'cancel') s.close();
  });
  s.el.querySelector<HTMLButtonElement>(`[data-act="${o.danger ? 'cancel' : 'confirm'}"]`)!.focus({ preventScroll: true });
}
