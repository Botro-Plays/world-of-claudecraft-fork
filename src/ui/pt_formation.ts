/**
 * Tribe formation roster: pure mapping from a PT tribe to the list of
 * implemented classes and their formation slot positions.
 *
 * This module is the single source of truth for "which characters appear in
 * the 3D formation when a tribe is selected, and where do they stand". It is
 * pure (no DOM, no Three.js) so a test can verify the roster without a WebGL
 * context.
 *
 * The selected class is excluded from the formation (it presents at the
 * center via the characterGroup); the formation holds the OTHER classes so
 * the player sees the full tribe standing in the scene.
 */

import type { PlayerClass } from '../sim/types';
import { PT_TRIBES, type PtTribeId } from '../sim/content/pt_tribes';
import {
  formationSlots,
  stageRowSlots,
  type FormationSlot,
} from '../render/characters/formation';

/** A formation entry: a class and its slot position in the scene. */
export interface FormationEntry {
  readonly cls: PlayerClass;
  readonly visualKey: string;
  readonly x: number;
  readonly z: number;
}

/**
 * Build stage entries for ALL implemented classes in a tribe, each at its
 * rest position in a clean horizontal row. No class is excluded — every
 * character stands in the stage. The caller selects one to bring forward
 * (z → 0, scale up); the rest remain in the row and scale down.
 *
 * Uses stageRowSlots (a clean horizontal line at z = -2.5) rather than the
 * staggered formationSlots, so the depth separation comes from the selected
 * character moving forward, not from the row layout.
 *
 * The visual key is the default (hair 0) visual key for each class.
 */
export function tribeStageEntries(tribeId: PtTribeId): FormationEntry[] {
  const tribe = PT_TRIBES.find((t) => t.id === tribeId);
  if (!tribe) return [];
  const classes = tribe.implementedClassIds as PlayerClass[];
  const slots = stageRowSlots(classes.length);
  return classes.map((cls, i) => {
    const slot = slots[i] ?? { x: 0, z: -2.5 };
    return {
      cls,
      visualKey: `player_${cls}`,
      x: slot.x,
      z: slot.z,
    };
  });
}

/**
 * Get the rest position (stage row slot) for a specific class in a tribe.
 * This is the authoritative position the character always returns to when
 * not selected. It never changes during a character-select session.
 */
export function classHomeSlot(tribeId: PtTribeId, cls: PlayerClass): FormationSlot {
  const tribe = PT_TRIBES.find((t) => t.id === tribeId);
  if (!tribe) return { x: 0, z: -2.5 };
  const count = tribe.implementedClassIds.length;
  const slots = stageRowSlots(count);
  const idx = tribe.implementedClassIds.indexOf(cls);
  if (idx < 0 || idx >= slots.length) return { x: 0, z: -2.5 };
  return slots[idx];
}

/**
 * Build the formation entries for a tribe: one entry per IMPLEMENTED class
 * in the tribe, positioned at the formation slots. The `selectedClass` is
 * excluded (it presents at the center); the remaining classes fill the
 * formation background.
 *
 * The visual key is the default (hair 0) visual key for each class, derived
 * from the class id via the `player_<class>` convention.
 */
export function tribeFormationEntries(
  tribeId: PtTribeId,
  selectedClass: PlayerClass,
): FormationEntry[] {
  const tribe = PT_TRIBES.find((t) => t.id === tribeId);
  if (!tribe) return [];
  const others = tribe.implementedClassIds.filter(
    (id) => id !== selectedClass,
  ) as PlayerClass[];
  const slots = formationSlots(others.length + 1);
  // The selected class occupies slot 0 (closest to center); the others fill
  // slots 1..N. We re-index so the formation slots match the OTHERS array
  // (excluding the selected class which is at the center via characterGroup).
  const otherSlots = slots.slice(1);
  return others.map((cls, i) => {
    const slot: FormationSlot = otherSlots[i] ?? { x: 0, z: -2 };
    return {
      cls,
      visualKey: `player_${cls}`,
      x: slot.x,
      z: slot.z,
    };
  });
}

/**
 * Get the formation slot for the selected class within the tribe's formation.
 * The selected class walks from this slot to the presentation center (0, 0).
 */
export function selectedFormationSlot(
  tribeId: PtTribeId,
  selectedClass: PlayerClass,
): FormationSlot {
  return classHomeSlot(tribeId, selectedClass);
}
