// Thin painter for the three PT potion seats. Icon / count / empty class ride
// the host facet; click uses the item the core last resolved. Empty seats are
// a no-op. No keybinds.

import type { InvSlot } from '../../../sim/types';
import type { PainterHostWriters } from '../../painter_host';
import {
  POTION_KINDS,
  type PotionBarSlotView,
  type PotionBarView,
  type PotionKind,
  type PotionLookup,
  potionBarSignature,
  potionBarView,
} from './potion_bar_core';

const CLASS_FILLED = 'filled';
const SRC_ATTR = 'src';

export interface PotionBarSlotEls {
  btn: HTMLButtonElement;
  icon: HTMLImageElement;
  count: HTMLElement;
}

export class PotionBarPainter {
  private lastSig = '';
  private view: PotionBarView = potionBarView([], () => undefined);

  constructor(
    private readonly writers: PainterHostWriters,
    private readonly slots: Record<PotionKind, PotionBarSlotEls>,
    private readonly lookup: PotionLookup,
    private readonly formatCount: (n: number) => string,
    private readonly useItem: (itemId: string) => void,
  ) {
    for (const kind of POTION_KINDS) {
      this.slots[kind].btn.addEventListener('click', () => this.onClick(kind));
    }
  }

  paint(inventory: readonly Pick<InvSlot, 'itemId' | 'count'>[]): void {
    const next = potionBarView(inventory, this.lookup);
    const sig = potionBarSignature(next);
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.view = next;
    for (const slot of next) this.paintSlot(slot);
  }

  private paintSlot(slot: PotionBarSlotView): void {
    const els = this.slots[slot.kind];
    const filled = slot.itemId != null && slot.count > 0;
    this.writers.toggleClass(els.btn, CLASS_FILLED, filled);
    this.writers.setAttr(els.icon, SRC_ATTR, filled ? slot.iconSrc : null);
    this.writers.setText(els.count, filled ? this.formatCount(slot.count) : '');
  }

  private onClick(kind: PotionKind): void {
    const slot = slotOfKind(this.view, kind);
    if (!slot.itemId || slot.count <= 0) return;
    this.useItem(slot.itemId);
  }
}

function slotOfKind(view: PotionBarView, kind: PotionKind): PotionBarSlotView {
  switch (kind) {
    case 'hp':
      return view[0];
    case 'mp':
      return view[1];
    case 'stm':
      return view[2];
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
