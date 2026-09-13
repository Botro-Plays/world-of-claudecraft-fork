/**
 * Character-select formation layout.
 *
 * Pure module: computes 3D positions for a tribe's character formation in
 * the CharacterPreview scene. No Three.js, no DOM, no IWorld — just math
 * so a test can verify the layout without a WebGL context.
 *
 * The formation is a shallow arc: characters stand at different X positions
 * with a slight Z offset so they don't overlap and the camera sees them all.
 * The selected character walks from its formation slot to the presentation
 * center (0, 0).
 *
 * Layout for 4 characters (Tempskron, Morion):
 *
 *      [1]           [2]
 *
 *           [0]  ← selected walks here → (0, 0)
 *
 *      [3]
 *
 * Layout for 3 characters (Atlanteon):
 *
 *      [1]       [2]
 *
 *        [0]  ← selected walks here → (0, 0)
 *
 * The first slot (index 0) is closest to the presentation center so the
 * walk-forward distance is short and the camera framing stays clean.
 */

/** A formation slot position in the preview scene (X = lateral, Z = depth). */
export interface FormationSlot {
  readonly x: number;
  readonly z: number;
}

/** The presentation center: where the selected character walks to. */
export const PRESENTATION_CENTER: FormationSlot = { x: 0, z: 0 };

/** Lateral spacing between formation slots. Tuned for the stage camera
 *  framing so 4 characters fit comfortably without overlapping the
 *  selected character at the center or each other. */
const FORMATION_SPACING = 3.2;

/** Depth offset for the back row (larger negative Z = further from camera). */
const FORMATION_Z_FRONT = -1.4;
const FORMATION_Z_BACK = -3.2;

/**
 * Compute formation slots for `count` characters.
 *
 * Returns `count` slots in a balanced arc. The slots are deterministic
 * (same count → same positions) so the test suite can pin them.
 */
export function formationSlots(count: number): FormationSlot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, z: -1.5 }];

  const slots: FormationSlot[] = [];

  if (count === 2) {
    slots.push({ x: -FORMATION_SPACING, z: -1.5 });
    slots.push({ x: FORMATION_SPACING, z: -1.5 });
  } else if (count === 3) {
    // Shallow V: two in front, one behind-center.
    slots.push({ x: 0, z: FORMATION_Z_BACK });
    slots.push({ x: -FORMATION_SPACING, z: FORMATION_Z_FRONT });
    slots.push({ x: FORMATION_SPACING, z: FORMATION_Z_FRONT });
  } else {
    // 4+ characters: two rows, staggered. The wider spacing and deeper
    // back row give clear separation between all characters.
    const half = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const offset = i - half;
      const isFront = i % 2 === 0;
      slots.push({
        x: offset * FORMATION_SPACING,
        z: isFront ? FORMATION_Z_FRONT : FORMATION_Z_BACK,
      });
    }
  }

  return slots;
}

/**
 * Get the formation slot for a specific character index.
 * Returns the slot at `index` in the formation, or the center if out of range.
 */
export function formationSlotAt(slots: FormationSlot[], index: number): FormationSlot {
  if (index < 0 || index >= slots.length) return PRESENTATION_CENTER;
  return slots[index];
}

// -------------------------------------------------------------------------
// Stage row layout: a clean horizontal row for the 3D character-select
// stage. All characters stand at the same depth (z) in a line; the selected
// character moves forward (z → 0) and scales up, while background
// characters stay in the row and scale down. This is the Jere Codes
// inspired stage model: the stage transitions as a composition, not a
// character walking between arbitrary points.
// -------------------------------------------------------------------------

/** Depth of the background row. All stage characters rest here. */
const STAGE_ROW_Z = -2.5;

/** Lateral spacing between stage row slots. Wide enough that scaled-up
 *  selected characters don't overlap scaled-down neighbors. */
const STAGE_ROW_SPACING = 3.2;

/**
 * Compute stage row slots for `count` characters: a clean horizontal
 * line at z = STAGE_ROW_Z, evenly spaced on X. Deterministic (same
 * count → same positions).
 *
 * The selected character moves forward from its row slot to the
 * presentation target (see `stagePresentationTarget`) and scales up;
 * the others remain in the row and scale down.
 */
export function stageRowSlots(count: number): FormationSlot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, z: STAGE_ROW_Z }];
  const slots: FormationSlot[] = [];
  const half = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    slots.push({
      x: (i - half) * STAGE_ROW_SPACING,
      z: STAGE_ROW_Z,
    });
  }
  return slots;
}

// -------------------------------------------------------------------------
// Stage presentation target: where the selected character walks to.
//
// The presentation point is centered on X (0) and sufficiently forward in Z
// that the selected character is physically in front of the entire formation
// row. This is critical for odd-count formations (3 characters): the middle
// character's home is at X=0, Z=STAGE_ROW_Z, so a presentation target at
// Z=0 (only 2.5 units in front) can let the middle character peek around/above
// the selected character from the camera's slightly-downward view. Moving
// the presentation Z further forward ensures clear depth separation for both
// 3- and 4-character formations.
// -------------------------------------------------------------------------

/** Z depth of the presentation position. Forward of the formation row
 *  (STAGE_ROW_Z = -2.5) so the selected character is clearly in front of
 *  every formation member, including a middle character at X=0 in a
 *  3-character tribe. Tuned against the stage camera (z=7.8, y=1.6,
 *  lookY=1.2): at z=1.0 the selected character is 3.5 units in front of
 *  the row and 6.8 units from the camera, giving clear depth separation. */
const STAGE_PRESENTATION_Z = 1.0;

/**
 * Compute the presentation target for the selected character on a stage
 * with `memberCount` members. Returns a centered X (0) and a Z that is
 * sufficiently forward of the formation row to avoid overlapping any
 * formation character — including the middle character of a 3-member
 * formation, whose home X is also 0.
 *
 * Deterministic (same count → same target). The member count is accepted
 * as a parameter so the target can be tuned per formation size if needed;
 * currently all formation sizes share the same presentation Z.
 */
export function stagePresentationTarget(memberCount: number): FormationSlot {
  // Currently all formation sizes use the same centered presentation point.
  // The memberCount parameter is retained for future per-size tuning.
  void memberCount;
  return { x: 0, z: STAGE_PRESENTATION_Z };
}
