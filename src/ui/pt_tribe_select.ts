/**
 * Priston Tale tribe-first character selection UI wiring.
 *
 * Handles the #pt-tribe-select panel: tribe card clicks, back navigation,
 * and filtering #offline-select to show only the selected tribe's classes.
 * Imported by main.ts which passes callbacks for panel transitions and the
 * class-selection follow-through. No DOM globals touched at import time.
 */

import type { PtTribeId } from '../sim/content/pt_tribes';
import { PT_TRIBES } from '../sim/content/pt_tribes';

export type { PtTribeId };

export interface PtTribeSelectCallbacks {
  /**
   * Called when the user selects a tribe card.
   * `firstImplementedClassId` is the first implemented class in the tribe,
   * or null if the tribe has no implemented classes yet.
   */
  onTribeSelected(tribeId: PtTribeId, firstImplementedClassId: string | null): void;
  /** Called when the user presses Back on the tribe select screen. */
  onBack(): void;
}

/**
 * Wire the #pt-tribe-select panel.
 * Call once from wireStartScreens after the DOM is ready.
 */
export function wirePtTribeSelect(
  panel: HTMLElement | null,
  callbacks: PtTribeSelectCallbacks,
): void {
  if (!panel) return;

  panel.querySelectorAll<HTMLElement>('.pt-tribe-card[data-tribe]').forEach((card) => {
    const tribeId = card.dataset.tribe as PtTribeId | undefined;
    if (!tribeId) return;
    const tribe = PT_TRIBES.find((t) => t.id === tribeId);
    const first: string | null = tribe?.implementedClassIds[0] ?? null;
    const activate = () => callbacks.onTribeSelected(tribeId, first);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        activate();
      }
    });
  });

  panel
    .querySelector<HTMLElement>('#btn-tribe-select-back')
    ?.addEventListener('click', () => callbacks.onBack());
}

/**
 * Filter #offline-select to show only the class section for the given tribe.
 * Updates the tribe name header and hides all other tribe sections.
 * Safe to call repeatedly as the user navigates between tribes.
 */
export function filterOfflineSelectForTribe(
  offlineSelect: HTMLElement | null,
  tribeId: PtTribeId,
): void {
  if (!offlineSelect) return;
  const tribe = PT_TRIBES.find((t) => t.id === tribeId);
  const header = offlineSelect.querySelector<HTMLElement>('#offline-tribe-header');
  if (header) {
    header.textContent = tribe?.name.toUpperCase() ?? tribeId.toUpperCase();
    header.removeAttribute('hidden');
  }
  offlineSelect.querySelectorAll<HTMLElement>('.pt-tribe-section').forEach((sec) => {
    sec.toggleAttribute('hidden', (sec.dataset.tribe as PtTribeId | undefined) !== tribeId);
  });
}

/**
 * Reset #offline-select to show all tribe sections.
 * Called when the user navigates back to tribe selection so the panel
 * is in a clean state if they pick a different tribe.
 */
export function resetOfflineSelectTribeFilter(offlineSelect: HTMLElement | null): void {
  if (!offlineSelect) return;
  offlineSelect.querySelectorAll<HTMLElement>('.pt-tribe-section').forEach((sec) => {
    sec.removeAttribute('hidden');
  });
  offlineSelect.querySelector<HTMLElement>('#offline-tribe-header')?.setAttribute('hidden', '');
}
