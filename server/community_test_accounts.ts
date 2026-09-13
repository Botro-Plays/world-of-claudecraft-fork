// Off-by-default account provisioning for community test realms. This module owns
// the immutable character templates and generated-name policy; db.ts owns the
// transaction that inserts them. The templates are built through public Sim APIs
// so level, derived stats, equipment rules, bags, and persistence stay canonical.
//
// Gear: each template wears the TRUE best-in-slot PvE kit for its class's
// primary role and carries every alternate role's kit in four best-in-game
// bags, riding trained and Nythraxis-attuned, via the shared boost kit
// (server/pbe_boost.ts applyBoostKitToPlayer). The original hand-curated
// WARFARE (honor vendor) loadouts were retired 2026-07-22: their PvP-budgeted
// stats are exactly what endgame PvE testers should not be wearing (the
// S-raid playtest ran in them), and one shared kit source cannot drift.

import { type CharacterState, Sim } from '../src/sim/sim';
import { ALL_CLASSES, ALL_EQUIP_SLOTS, MAX_LEVEL, type PlayerClass } from '../src/sim/types';
import { validCharName } from './auth';
import { applyBoostKitToPlayer } from './pbe_boost';

const TEMPLATE_SEED = 20061;
const NAME_TOKEN_LENGTH = 8;
export const GENERATED_NAME_ATTEMPTS = 32;

export interface CommunityTestCharacter {
  readonly cls: PlayerClass;
  readonly name: string;
  readonly state: CharacterState;
}

let enabled = false;
let cachedTemplates: ReadonlyMap<PlayerClass, CharacterState> | null = null;

export function configureCommunityTestAccounts(next: boolean): void {
  enabled = next;
}

export function communityTestAccountsEnabled(): boolean {
  return enabled;
}

function cloneState(state: CharacterState): CharacterState {
  return JSON.parse(JSON.stringify(state)) as CharacterState;
}

function templateStates(): ReadonlyMap<PlayerClass, CharacterState> {
  if (cachedTemplates) return cachedTemplates;
  // Wall-clock injection is load-bearing for persistence (farm_persist.ts
  // clock-base doctrine): template blobs reach Postgres, so they must be
  // written on the epoch base, never the sim-clock default.
  const sim = new Sim({
    seed: TEMPLATE_SEED,
    playerClass: 'warrior',
    noPlayer: true,
    lockoutNowMs: () => Date.now(),
  });
  const templates = new Map<PlayerClass, CharacterState>();
  for (const cls of ALL_CLASSES) {
    // bot: this throwaway template Sim's mail book is discarded, but the flag
    // keeps the no-mail-for-synthetic-players rule uniform across every
    // non-player addPlayer site (the flip itself is unchanged: templates
    // already carried mailWelcomed true into cloned characters).
    const pid = sim.addPlayer(cls, `${cls}template`, { bot: true });
    sim.setPlayerLevel(MAX_LEVEL, pid);
    // Remove starter gear before applying the kit. With live offhands and
    // dual wielding, leaving it equipped can route the intended mainhand into
    // the offhand or retain an obsolete shield beside a two-hander.
    for (const slot of ALL_EQUIP_SLOTS) sim.unequipItem(slot, pid);
    // The shared boost kit: bags, the primary role's true-BiS kit equipped,
    // every alternate role's kit in the bags, riding, and the attunement. The
    // kit-version stamp it writes also tells the world-join top-up these
    // characters are already current.
    if (!applyBoostKitToPlayer(sim, pid)) {
      throw new Error(`boost kit did not apply to community test template for ${cls}`);
    }
    // Equipment can raise maximum health and mana, so refill through the same
    // authoritative level path after the final stat recalculation.
    sim.setPlayerLevel(MAX_LEVEL, pid);
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error(`failed to build community test template for ${cls}`);
    templates.set(cls, state);
  }
  cachedTemplates = templates;
  return cachedTemplates;
}

/** Build and cache pristine templates before opening an account transaction. */
export function prepareCommunityTestCharacters(): void {
  templateStates();
}

function encodeNameToken(value: bigint): string {
  let cursor = value;
  const chars = Array<string>(NAME_TOKEN_LENGTH).fill('a');
  for (let index = NAME_TOKEN_LENGTH - 1; index >= 0; index--) {
    chars[index] = String.fromCharCode(97 + Number(cursor % 26n));
    cursor /= 26n;
  }
  return chars.join('');
}

// PT class ids contain underscores and exceed the character-name length limit
// (validCharNameShape caps at 16 chars and forbids underscores), and the 8-char
// encoded token leaves room for at most an 8-char prefix. These short, unique
// prefixes avoid collisions with the original WoC class names (e.g. `shaman`
// the class vs `atlanteon_shaman` the PT class) and stay within the budget.
const PT_NAME_PREFIXES: Partial<Record<PlayerClass, string>> = {
  tempskron_fighter: 'Fighter',
  tempskron_mechanician: 'Mech',
  tempskron_pikeman: 'Pikeman',
  tempskron_archer: 'Archer',
  morion_knight: 'Knight',
  morion_atalanta: 'Atalanta',
  morion_priestess: 'Holy',
  morion_magician: 'Magician',
  atlanteon_assassin: 'Assassin',
  atlanteon_martial_artist: 'Martial',
  atlanteon_shaman: 'Spirit',
};

export function generatedTestCharacterName(
  accountId: number,
  cls: PlayerClass,
  attempt = 0,
): string {
  const safeAccountId = Math.max(0, Math.floor(accountId));
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const encoded = BigInt(safeAccountId) * BigInt(GENERATED_NAME_ATTEMPTS) + BigInt(safeAttempt);
  const prefix = PT_NAME_PREFIXES[cls] ?? `${cls[0].toUpperCase()}${cls.slice(1)}`;
  return `${prefix}${encodeNameToken(encoded)}`;
}

function firstValidName(accountId: number, cls: PlayerClass): string {
  for (let attempt = 0; attempt < GENERATED_NAME_ATTEMPTS; attempt++) {
    const candidate = generatedTestCharacterName(accountId, cls, attempt);
    if (validCharName(candidate)) return candidate;
  }
  throw new Error(`failed to generate a valid community test name for ${cls}`);
}

export function buildCommunityTestCharacters(accountId: number): CommunityTestCharacter[] {
  const templates = templateStates();
  return ALL_CLASSES.map((cls) => {
    const state = templates.get(cls);
    if (!state) throw new Error(`missing community test template for ${cls}`);
    return { cls, name: firstValidName(accountId, cls), state: cloneState(state) };
  });
}
