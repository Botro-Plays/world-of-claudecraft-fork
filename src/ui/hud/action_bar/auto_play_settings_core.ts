// Persisted Auto Play prefs (ToA-style: mode, leash, per-pool potions,
// hunt range, assigned skill seats). DOM-free so Vitest can clamp and
// round-trip without Hud. Walk-by autoloot stays on the Interface setting.

import { safeLocalStorage } from '../../safe_local_storage';

export const AUTO_PLAY_STORE_KEY = 'woc_pt_auto_play';
export const AUTO_PLAY_SLOT_COUNT = 5;
export const AUTO_PLAY_HP_DEFAULT = 40;
export const AUTO_PLAY_MP_DEFAULT = 40;
export const AUTO_PLAY_STM_DEFAULT = 40;
export const AUTO_PLAY_RANGE_DEFAULT = 12;
export const AUTO_PLAY_LEASH_DEFAULT = 20;

export type AutoPlayTab = 'hunt' | 'loot';
export type AutoPlayGroup = 'support' | 'attack';
/** ToA Auto Mode Behavior: stay near home, or chase within leash. */
export type AutoPlayMode = 'stationary' | 'wander';

export interface AutoPlaySettings {
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
  supportIds: Array<string | null>;
  attackIds: Array<string | null>;
}

export const AUTO_PLAY_DEFAULTS: AutoPlaySettings = {
  mode: 'stationary',
  leashYd: AUTO_PLAY_LEASH_DEFAULT,
  prioritizeBoss: false,
  autoHp: true,
  autoMp: true,
  autoStm: true,
  hpBelow: AUTO_PLAY_HP_DEFAULT,
  mpBelow: AUTO_PLAY_MP_DEFAULT,
  stmBelow: AUTO_PLAY_STM_DEFAULT,
  rangeYd: AUTO_PLAY_RANGE_DEFAULT,
  supportIds: emptySlots(),
  attackIds: emptySlots(),
};

export function emptySlots(): Array<string | null> {
  return Array.from({ length: AUTO_PLAY_SLOT_COUNT }, () => null);
}

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return AUTO_PLAY_HP_DEFAULT;
  return Math.max(5, Math.min(95, Math.round(n)));
}

export function clampRangeYd(n: number): number {
  if (!Number.isFinite(n)) return AUTO_PLAY_RANGE_DEFAULT;
  return Math.max(1, Math.min(40, Math.round(n)));
}

export function clampLeashYd(n: number): number {
  if (!Number.isFinite(n)) return AUTO_PLAY_LEASH_DEFAULT;
  return Math.max(5, Math.min(40, Math.round(n)));
}

export function parseAutoPlayMode(raw: unknown): AutoPlayMode {
  return raw === 'wander' ? 'wander' : 'stationary';
}

function slotList(raw: unknown): Array<string | null> {
  const src = Array.isArray(raw) ? raw : [];
  const out = emptySlots();
  for (let i = 0; i < AUTO_PLAY_SLOT_COUNT; i++) {
    const v = src[i];
    out[i] = typeof v === 'string' && v.length > 0 ? v : null;
  }
  return out;
}

function boolOrLegacyPotion(
  o: Record<string, unknown>,
  key: 'autoHp' | 'autoMp' | 'autoStm',
): boolean {
  if (typeof o[key] === 'boolean') return o[key] as boolean;
  // Older blobs used a single autoPotion flag for all three pools.
  return o.autoPotion !== false;
}

export function parseAutoPlaySettings(raw: unknown): AutoPlaySettings {
  if (!raw || typeof raw !== 'object') {
    return {
      mode: AUTO_PLAY_DEFAULTS.mode,
      leashYd: AUTO_PLAY_DEFAULTS.leashYd,
      prioritizeBoss: AUTO_PLAY_DEFAULTS.prioritizeBoss,
      autoHp: AUTO_PLAY_DEFAULTS.autoHp,
      autoMp: AUTO_PLAY_DEFAULTS.autoMp,
      autoStm: AUTO_PLAY_DEFAULTS.autoStm,
      hpBelow: AUTO_PLAY_DEFAULTS.hpBelow,
      mpBelow: AUTO_PLAY_DEFAULTS.mpBelow,
      stmBelow: AUTO_PLAY_DEFAULTS.stmBelow,
      rangeYd: AUTO_PLAY_DEFAULTS.rangeYd,
      supportIds: emptySlots(),
      attackIds: emptySlots(),
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    mode: parseAutoPlayMode(o.mode),
    leashYd: clampLeashYd(typeof o.leashYd === 'number' ? o.leashYd : AUTO_PLAY_LEASH_DEFAULT),
    prioritizeBoss: o.prioritizeBoss === true,
    autoHp: boolOrLegacyPotion(o, 'autoHp'),
    autoMp: boolOrLegacyPotion(o, 'autoMp'),
    autoStm: boolOrLegacyPotion(o, 'autoStm'),
    hpBelow: clampPct(typeof o.hpBelow === 'number' ? o.hpBelow : AUTO_PLAY_HP_DEFAULT),
    mpBelow: clampPct(typeof o.mpBelow === 'number' ? o.mpBelow : AUTO_PLAY_MP_DEFAULT),
    stmBelow: clampPct(typeof o.stmBelow === 'number' ? o.stmBelow : AUTO_PLAY_STM_DEFAULT),
    rangeYd: clampRangeYd(typeof o.rangeYd === 'number' ? o.rangeYd : AUTO_PLAY_RANGE_DEFAULT),
    supportIds: slotList(o.supportIds),
    attackIds: slotList(o.attackIds),
  };
}

export function setAutoPlaySlot(
  settings: AutoPlaySettings,
  group: AutoPlayGroup,
  index: number,
  abilityId: string | null,
): AutoPlaySettings {
  if (index < 0 || index >= AUTO_PLAY_SLOT_COUNT) return settings;
  const next = {
    ...settings,
    supportIds: settings.supportIds.slice(),
    attackIds: settings.attackIds.slice(),
  };
  switch (group) {
    case 'support':
      next.supportIds[index] = abilityId;
      break;
    case 'attack':
      next.attackIds[index] = abilityId;
      break;
    default: {
      const _never: never = group;
      return _never;
    }
  }
  return next;
}

export function loadAutoPlaySettings(
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): AutoPlaySettings {
  if (!storage) return parseAutoPlaySettings(null);
  try {
    return parseAutoPlaySettings(JSON.parse(storage.getItem(AUTO_PLAY_STORE_KEY) ?? 'null'));
  } catch {
    return parseAutoPlaySettings(null);
  }
}

export function saveAutoPlaySettings(
  settings: AutoPlaySettings,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(AUTO_PLAY_STORE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}
