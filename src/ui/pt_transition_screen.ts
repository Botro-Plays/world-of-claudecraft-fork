// Full-screen PT field-transition curtain ("YOU ARE ENTERING <FIELD>" plus a
// real progress bar), shown by game/pt_field_transition.ts while the
// destination field's view is not visually ready. It deliberately owns its
// own DOM instead of driving #loading-screen: the boot and arrival curtains
// keep exclusive ownership of that element, so this one sits one z-step
// beneath it and hands off seamlessly when a boot/arrival curtain lifts onto
// an already-raised PT transition. Same visual family either way: dark
// vignette, logo, the game's progress-bar grammar.
//
// Cold painter: mounts lazily on first show, repaints only when the model
// changes, and costs nothing while hidden. One element for the whole session
// (spec: no per-transition DOM churn).

import { markDialogRoot } from './dialog_root';
import { t } from './i18n';

const ROOT_ID = 'pt-transition-screen';

interface Refs {
  root: HTMLElement;
  field: HTMLElement;
  status: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
}

let refs: Refs | null = null;
let lastName = '';
let lastPercent = -1;
let lastStatus = '';

function mount(): Refs {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('role', 'presentation');

  const logo = document.createElement('img');
  logo.className = 'pts-logo';
  logo.src = '/worldofclaudecraft-logo.png';
  logo.alt = '';

  const center = document.createElement('div');
  center.className = 'pts-center';

  const entering = document.createElement('div');
  entering.className = 'pts-entering';
  entering.textContent = t('loading.ptEntering');

  const field = document.createElement('div');
  field.className = 'pts-field';

  const bar = document.createElement('div');
  bar.className = 'pts-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-label', t('loading.ptEntering'));

  const fill = document.createElement('div');
  fill.className = 'pts-fill';
  bar.appendChild(fill);

  const status = document.createElement('div');
  status.className = 'pts-status';

  center.append(entering, field, bar, status);
  markDialogRoot(center, { label: t('loading.ptEntering'), modal: true });
  root.append(logo, center);
  document.body.appendChild(root);
  return { root, field, status, bar, fill };
}

function ensure(): Refs {
  if (!refs?.root.isConnected) {
    refs = mount();
    lastName = '';
    lastPercent = -1;
    lastStatus = '';
  }
  return refs;
}

/** Raise the curtain for `fieldName`; idempotent while already showing. */
export function showPtTransition(fieldName: string): void {
  const r = ensure();
  r.root.classList.add('visible');
  if (fieldName !== lastName) {
    r.field.textContent = fieldName;
    r.status.textContent = t('loading.enteringField', { field: fieldName });
    lastName = fieldName;
    lastStatus = r.status.textContent ?? '';
  }
}

/** Drive the bar. Percent is clamped; repeated writes are elided. */
export function setPtTransitionProgress(percent: number, loading = true): void {
  if (!refs) return;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (p !== lastPercent) {
    refs.fill.style.width = `${p}%`;
    refs.bar.setAttribute('aria-valuenow', String(p));
    lastPercent = p;
  }
  if (loading) {
    const statusText = t('loading.enteringField', { field: lastName });
    if (statusText !== lastStatus) {
      refs.status.textContent = statusText;
      lastStatus = statusText;
    }
  }
}

/** Genuine failure: the bar freezes and the status reports it. The curtain
 *  stays up rather than revealing terrain that never built; the orchestrator
 *  releases movement at the same time so the player is not held forever. */
export function failPtTransition(fieldName: string): void {
  const r = ensure();
  r.root.classList.add('visible');
  if (fieldName !== lastName) {
    r.field.textContent = fieldName;
    lastName = fieldName;
  }
  const statusText = t('loading.ptFieldFailed', { field: fieldName });
  if (statusText !== lastStatus) {
    r.status.textContent = statusText;
    lastStatus = statusText;
  }
  r.root.classList.add('failed');
}

export function hidePtTransition(): void {
  if (!refs) return;
  refs.root.classList.remove('visible', 'failed');
}
