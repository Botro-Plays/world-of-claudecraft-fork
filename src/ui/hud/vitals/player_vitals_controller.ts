// Wires the player-frame STM bar and the three PT potion seats. Queries the
// static markup once; Hud keeps a one-line paint. Item use is injected so this
// module never imports Hud.

import { ITEMS } from '../../../sim/data';
import type { InvSlot } from '../../../sim/types';
import { formatNumber } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import { POTION_KINDS, type PotionKind } from './potion_bar_core';
import { PotionBarPainter, type PotionBarSlotEls } from './potion_bar_painter';
import { StaminaBarPainter } from './stamina_bar_painter';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

export class PlayerVitalsHud {
  constructor(
    private readonly stamina: StaminaBarPainter,
    private readonly potions: PotionBarPainter | null,
  ) {}

  paint(sta: number, inventory: readonly Pick<InvSlot, 'itemId' | 'count'>[]): void {
    this.stamina.paint(sta);
    this.potions?.paint(inventory);
  }
}

export function buildPlayerVitalsHud(
  writers: PainterHostWriters,
  useItem: (itemId: string) => void,
): PlayerVitalsHud {
  const stamina = new StaminaBarPainter(writers, $('#pf-stm'), $('#pf-stm-text'));
  const slots = potionSlotEls();
  const potions = slots
    ? new PotionBarPainter(writers, slots, (id) => ITEMS[id], formatNumber, useItem)
    : null;
  return new PlayerVitalsHud(stamina, potions);
}

function potionSlotEls(): Record<PotionKind, PotionBarSlotEls> | null {
  const out = {} as Record<PotionKind, PotionBarSlotEls>;
  for (const kind of POTION_KINDS) {
    const btn = document.querySelector<HTMLButtonElement>(`#pt-potion-${kind}`);
    if (!btn) return null;
    const icon = btn.querySelector<HTMLImageElement>('img');
    const count = btn.querySelector<HTMLElement>('.pt-potion-count');
    if (!icon || !count) return null;
    out[kind] = { btn, icon, count };
  }
  return out;
}
