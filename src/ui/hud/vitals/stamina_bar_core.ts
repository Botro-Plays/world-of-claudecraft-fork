// Pure STM readout for the player vitals cluster. Stamina is a paper-doll
// stat, not a spent pool: the bar shows the same HP-from-STA contribution
// recalcPlayerStats uses (first 20 STA = 1 HP each, the rest 10 HP each),
// shared with the character sheet via healthFromStamina.

import { unitFrameCurrentMaxText } from '../../hud_frames';
import { healthFromStamina } from '../../stat_tooltip';

export interface StaminaBarView {
  pool: number;
  fillFrac: number;
  text: string;
  fillTransform: string;
}

export function staminaBarView(sta: number): StaminaBarView {
  const pool = healthFromStamina(sta);
  const fillFrac = pool > 0 ? 1 : 0;
  return {
    pool,
    fillFrac,
    text: unitFrameCurrentMaxText(pool, pool),
    fillTransform: `scaleX(${fillFrac})`,
  };
}
