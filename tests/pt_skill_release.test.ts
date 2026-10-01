// PT EventFrame release timing (src/sim/combat/casting_lifecycle.ts
// deferPtSkillRelease + generated/pt-maps pt_skill_anims PT_SKILL_RELEASE_SEC).
//
// In PT the skill's effect fires at a frame authored inside the gesture clip
// (the INX EventFrame), not at button press: the rig starts its SKILL motion
// on a 'windup' cue at cast, and the projectile/damage outcome lands on the
// release tick. These tests pin that split so the bolt cannot outrun the
// animation again.

import { describe, expect, it } from 'vitest';
import { createMob } from '../src/sim/entity';
import { MOBS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { PT_SKILL_RELEASE_SEC } from '../src/sim/content/pt_skill_anims';
import { PT_ABILITIES } from '../src/sim/content/pt_abilities';
import type { PlayerClass, SimEvent } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

const TICKS_PER_SEC = 20;

function shaman(level: number): Sim {
  const sim = new Sim({ seed: 7, playerClass: 'atlanteon_shaman' as PlayerClass, world: EMPTY_TEST_WORLD });
  sim.setPlayerLevel(level);
  return sim;
}

function hostileAt(sim: Sim, dist: number) {
  const p = sim.player as any;
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, 5, {
    x: p.pos.x + dist,
    y: p.pos.y,
    z: p.pos.z,
  }) as any;
  mob.hostile = true;
  mob.maxHp = 5000;
  mob.hp = 5000;
  sim.addEntity(mob);
  return mob;
}

const fx = (evs: SimEvent[], name: string, ability?: string) =>
  evs.filter(
    (e) => e.type === 'spellfx' && (e as any).fx === name && (!ability || (e as any).ability === ability),
  );

describe('PT skill EventFrame release timing', () => {
  it('emits windup at cast and defers the projectile to the authored frame', () => {
    const release = PT_SKILL_RELEASE_SEC['pt_dark_bolt'];
    expect(release).toBeGreaterThan(0.2);
    expect(PT_ABILITIES['pt_dark_bolt'].school).not.toBe('physical'); // projectile path

    const sim = shaman(20);
    expect(sim.investPtSkill('pt_dark_bolt')).toBe(true);
    const mob = hostileAt(sim, 10);
    sim.drainEvents();
    const p = sim.player as any;
    if (p.mana < 50) p.mana = 500;

    sim.targetEntity(mob.id);
    sim.castAbility('pt_dark_bolt');

    // Cast tick: the gesture cue fires, but NOTHING releases yet.
    const castTick = sim.drainEvents();
    expect(fx(castTick, 'windup', 'pt_dark_bolt')).toHaveLength(1);
    expect(fx(castTick, 'projectile', 'pt_dark_bolt')).toHaveLength(0);
    expect(mob.hp).toBe(5000);

    // Mid-windup: still no projectile, still no damage.
    let projectileAt = -1;
    for (let i = 1; i <= Math.ceil(release * TICKS_PER_SEC) + 2; i++) {
      const evs = sim.tick();
      if (projectileAt < 0 && fx(evs, 'projectile', 'pt_dark_bolt').length > 0) {
        projectileAt = i;
      }
      if (projectileAt < 0) {
        expect(fx(evs, 'projectile', 'pt_dark_bolt')).toHaveLength(0);
      }
    }
    // The bolt left the hand around the authored frame (~release * 20 ticks),
    // never at cast time.
    expect(projectileAt).toBeGreaterThan(Math.floor(release * TICKS_PER_SEC) - 2);
    expect(projectileAt).toBeLessThanOrEqual(Math.ceil(release * TICKS_PER_SEC) + 2);

    // And the damage still lands on projectile impact, not the press.
    for (let i = 0; i < 200 && mob.hp >= 5000; i++) sim.tick();
    expect(mob.hp).toBeLessThan(5000);
  });

  it('defers a melee weaponStrike to its strike frame too', () => {
    const release = PT_SKILL_RELEASE_SEC['pt_triple_impact'];
    expect(release).toBeGreaterThan(0.2);
    expect(PT_ABILITIES['pt_triple_impact'].effects[0]?.type).toBe('weaponStrike');

    const sim = new Sim({ seed: 11, playerClass: 'tempskron_fighter' as PlayerClass, world: EMPTY_TEST_WORLD });
    sim.setPlayerLevel(30);
    // Triple Impact sits 5th in the fighter chain: fill the chain first.
    for (const id of ['pt_melee_mastery', 'pt_fire_attribute', 'pt_raving', 'pt_impact', 'pt_triple_impact']) {
      expect(sim.investPtSkill(id), id).toBe(true);
    }

    const mob = hostileAt(sim, 2);
    sim.drainEvents();
    const p = sim.player as any;
    p.mana = 500;
    p.resource = 200; // the fighter's bar is rage; PT mana cost bills it
    sim.targetEntity(mob.id);
    sim.castAbility('pt_triple_impact');

    const castTick = sim.drainEvents();
    expect(fx(castTick, 'windup', 'pt_triple_impact')).toHaveLength(1);
    expect(mob.hp).toBe(5000);
    for (let i = 0; i < Math.floor(release * TICKS_PER_SEC) - 2; i++) {
      sim.tick();
      expect(mob.hp).toBe(5000);
    }
    for (let i = 0; i < 60 && mob.hp >= 5000; i++) sim.tick();
    expect(mob.hp).toBeLessThan(5000);
  });

  it('non-PT casts are untouched (resolve without the PT windup)', () => {
    const sim = new Sim({ seed: 13, playerClass: 'warrior' as PlayerClass, world: EMPTY_TEST_WORLD });
    sim.setPlayerLevel(10);
    const mob = hostileAt(sim, 2);
    sim.drainEvents();
    sim.targetEntity(mob.id);
    // heroic_strike is instant: no PT windup machinery may attach.
    sim.castAbility('heroic_strike');
    for (let i = 0; i < 40; i++) {
      const evs = sim.tick();
      expect(fx(evs, 'windup').filter((e) => (e as any).ability === 'heroic_strike')).toHaveLength(0);
    }
  });
});
