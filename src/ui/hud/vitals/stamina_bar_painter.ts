// Thin painter for #pf-stm / #pf-stm-text. Values come from staminaBarView;
// every write rides the host facet so a no-op frame mutates nothing.

import type { PainterHostWriters } from '../../painter_host';
import { staminaBarView } from './stamina_bar_core';

export class StaminaBarPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly fill: HTMLElement,
    private readonly text: HTMLElement,
  ) {}

  paint(sta: number): void {
    const view = staminaBarView(sta);
    this.writers.setTransform(this.fill, view.fillTransform);
    this.writers.setText(this.text, view.text);
  }
}
