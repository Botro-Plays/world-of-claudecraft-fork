// Thin Auto Play adapter: toggle + per-frame tick. Applies pure-core decisions
// through injected IWorld/HUD deps. Owns the running flag and home anchor
// (ToA stationary/wander). Hud paints the AUTO button chrome. Never imports Hud.

import { ITEMS, MOBS } from '../../../sim/data';
import type { Entity } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { potionBarView } from '../vitals/potion_bar_core';
import {
  type AutoPlayHostileCandidate,
  decideAutoPlayTick,
  pickNearestHostile,
  poolPct,
} from './auto_play_core';
import { type AutoPlaySettings, loadAutoPlaySettings } from './auto_play_settings_core';

const GCD_BUSY_EPS = 0.05;

function isBossOrElite(e: Entity): boolean {
  const template = MOBS[e.templateId];
  return !!(template?.elite || template?.boss || template?.rare || template?.worldBoss);
}

export interface AutoPlayControllerDeps {
  world: () => IWorld;
  /** True when the ability is known and may be cast right now. */
  abilityReady: (abilityId: string) => boolean;
  useItem: (itemId: string) => void;
  /** Paint the AUTO medallion pressed/glow state. */
  setRunningUi: (running: boolean) => void;
}

export class AutoPlayController {
  private running = false;
  private homeX = 0;
  private homeZ = 0;

  constructor(private readonly deps: AutoPlayControllerDeps) {}

  get isRunning(): boolean {
    return this.running;
  }

  toggle(): void {
    if (this.running) this.stop();
    else this.start();
  }

  start(): void {
    if (this.running) return;
    const p = this.deps.world().player;
    this.homeX = p.pos.x;
    this.homeZ = p.pos.z;
    this.running = true;
    this.deps.setRunningUi(true);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.deps.setRunningUi(false);
    const world = this.deps.world();
    if (world.player.autoAttack) world.stopAutoAttack();
  }

  /** Drive from Hud.update (medium band). One action per call. */
  tick(): void {
    if (!this.running) return;
    const world = this.deps.world();
    const p = world.player;
    if (p.dead) {
      this.stop();
      return;
    }

    const settings = loadAutoPlaySettings();
    const potions = potionBarView(world.inventory, (id) => ITEMS[id]);
    const nearest = this.nearestInRange(world, p, settings);
    const target = p.targetId === null ? null : world.entities.get(p.targetId);
    const currentTargetValid = this.targetValid(p, target, settings);
    const busy = p.castingAbility !== null || p.gcdRemaining > GCD_BUSY_EPS;
    const manaPct = p.resourceType === 'mana' ? poolPct(p.resource, p.maxResource) : null;

    const action = decideAutoPlayTick({
      dead: false,
      hpPct: poolPct(p.hp, p.maxHp),
      manaPct,
      settings,
      hpPotionId: potions[0]?.itemId ?? null,
      mpPotionId: potions[1]?.itemId ?? null,
      readySupportIds: this.readyIds(settings.supportIds),
      readyAttackIds: this.readyIds(settings.attackIds),
      currentTargetId: p.targetId,
      currentTargetValid,
      nearestHostile: nearest,
      autoAttack: p.autoAttack,
      busy,
    });

    switch (action.kind) {
      case 'none':
        break;
      case 'useItem':
        this.deps.useItem(action.itemId);
        break;
      case 'target':
        world.targetEntity(action.entityId);
        break;
      case 'startAutoAttack':
        world.startAutoAttack();
        break;
      case 'stopAutoAttack':
        world.stopAutoAttack();
        break;
      case 'cast':
        world.castAbility(action.abilityId);
        break;
      default: {
        const _never: never = action;
        void _never;
      }
    }
  }

  private readyIds(ids: AutoPlaySettings['supportIds']): string[] {
    const out: string[] = [];
    for (const id of ids) {
      if (!id) continue;
      if (!this.deps.abilityReady(id)) continue;
      out.push(id);
    }
    return out;
  }

  private nearestInRange(
    world: IWorld,
    player: Entity,
    settings: AutoPlaySettings,
  ): AutoPlayHostileCandidate | null {
    const candidates: AutoPlayHostileCandidate[] = [];
    for (const e of world.entities.values()) {
      if (e.id === player.id || e.dead || !e.hostile) continue;
      if (!this.withinLeash(e.pos.x, e.pos.z, settings)) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const distFromPlayer = Math.hypot(dx, dz);
      const distFromHome = Math.hypot(e.pos.x - this.homeX, e.pos.z - this.homeZ);
      // Stationary: only pull targets still near the home anchor.
      // Wander: pull anything near the player (leash already filtered).
      const engageDist = settings.mode === 'stationary' ? distFromHome : distFromPlayer;
      if (engageDist > settings.rangeYd) continue;
      candidates.push({
        id: e.id,
        distYd: engageDist,
        boss: isBossOrElite(e),
      });
    }
    return pickNearestHostile(candidates, settings.rangeYd, settings.prioritizeBoss);
  }

  private targetValid(
    player: Entity,
    target: Entity | null | undefined,
    settings: AutoPlaySettings,
  ): boolean {
    if (!target || target.dead || !target.hostile) return false;
    if (!this.withinLeash(target.pos.x, target.pos.z, settings)) return false;
    const dx = target.pos.x - player.pos.x;
    const dz = target.pos.z - player.pos.z;
    const distFromPlayer = Math.hypot(dx, dz);
    const distFromHome = Math.hypot(target.pos.x - this.homeX, target.pos.z - this.homeZ);
    const engageDist = settings.mode === 'stationary' ? distFromHome : distFromPlayer;
    return engageDist <= settings.rangeYd;
  }

  private withinLeash(x: number, z: number, settings: AutoPlaySettings): boolean {
    return Math.hypot(x - this.homeX, z - this.homeZ) <= settings.leashYd;
  }
}
