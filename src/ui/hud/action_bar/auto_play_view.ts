// Pure Auto Play settings view: tab, running flag, ToA mode, assigned seats.

import {
  AUTO_PLAY_SLOT_COUNT,
  type AutoPlayGroup,
  type AutoPlayMode,
  type AutoPlaySettings,
  type AutoPlayTab,
} from './auto_play_settings_core';

export type AutoPlayPick = { group: AutoPlayGroup; index: number };

export interface AutoPlayView {
  tab: AutoPlayTab;
  running: boolean;
  mode: AutoPlayMode;
  leashYd: number;
  prioritizeBoss: boolean;
  autoHp: boolean;
  autoMp: boolean;
  autoStm: boolean;
  hpBelow: number;
  mpBelow: number;
  stmBelow: number;
  rangeYd: number;
  walkByAutoloot: boolean;
  supportIds: Array<string | null>;
  attackIds: Array<string | null>;
  pick: AutoPlayPick | null;
  pickRows: readonly string[];
}

export function buildAutoPlayView(input: {
  settings: AutoPlaySettings;
  tab: AutoPlayTab;
  running: boolean;
  walkByAutoloot: boolean;
  pick: AutoPlayPick | null;
  knownIds: readonly string[];
}): AutoPlayView {
  return {
    tab: input.tab,
    running: input.running,
    mode: input.settings.mode,
    leashYd: input.settings.leashYd,
    prioritizeBoss: input.settings.prioritizeBoss,
    autoHp: input.settings.autoHp,
    autoMp: input.settings.autoMp,
    autoStm: input.settings.autoStm,
    hpBelow: input.settings.hpBelow,
    mpBelow: input.settings.mpBelow,
    stmBelow: input.settings.stmBelow,
    rangeYd: input.settings.rangeYd,
    walkByAutoloot: input.walkByAutoloot,
    supportIds: input.settings.supportIds.slice(0, AUTO_PLAY_SLOT_COUNT),
    attackIds: input.settings.attackIds.slice(0, AUTO_PLAY_SLOT_COUNT),
    pick: input.pick,
    pickRows: input.pick ? input.knownIds.slice() : [],
  };
}

export function autoPlayViewSignature(view: AutoPlayView): string {
  const pick = view.pick ? `${view.pick.group}:${view.pick.index}` : '';
  return [
    view.tab,
    view.running ? '1' : '0',
    view.mode,
    view.leashYd,
    view.prioritizeBoss ? '1' : '0',
    view.autoHp ? '1' : '0',
    view.autoMp ? '1' : '0',
    view.autoStm ? '1' : '0',
    view.hpBelow,
    view.mpBelow,
    view.stmBelow,
    view.rangeYd,
    view.walkByAutoloot ? '1' : '0',
    view.supportIds.join(','),
    view.attackIds.join(','),
    pick,
    view.pickRows.join(','),
  ].join('|');
}
