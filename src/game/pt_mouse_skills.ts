// Classic PT mouse skill wells: LMB fires the left circle (primary-bar slot 10),
// RMB fires the right circle (slot 11). Those seats sit beside the vital bars
// so slots 0-9 stay the 1-0 skill row. Pure decision helper so main.ts stays a
// thin consumer and the policy unit-tests without DOM.
//
// Policy (documented for the PT chrome pass):
//   - Only deliberate world click-picks fire skills. Camera right-drag and
//     long presses never reach here (clickPickFromMouseGesture / cameraDrag
//     filters them); HUD / menu / chat clicks never reach here (Input only
//     pick-releases on the canvas).
//   - A world-UI click that already opened loot / quest / mailbox / door
//     (handlePickedEntity returned true) does NOT cast: the UI owns the click.
//   - Cast when this click hit an entity, OR a combat target is already live
//     (ground click with sticky / existing target). Digit1-Digit0 keybinds
//     on slots 0-9 are unchanged.
//   - A ground click with no target keeps clear-target / click-to-move alone
//     and does NOT cast.
//   - Slot numbers must stay in lockstep with PT_MOUSE_* in
//     src/ui/hud/action_bar/mouse_skill_picker_view.ts (pinned by
//     tests/pt_mouse_skills.test.ts). UI cores cannot import game/.

/** Which action-bar slot a world mouse button should fire, or null to skip. */
export function ptMouseSkillSlot(
  button: number,
  opts: {
    /** Entity id under the click, or null for a ground click. */
    pickedEntityId: number | null;
    /** True when handlePickedEntity opened a world UI / completed an interact. */
    worldUiConsumed: boolean;
    /** True when the player still has a target after this click's clear/target. */
    hasTarget: boolean;
  },
): number | null {
  if (opts.worldUiConsumed) return null;
  if (opts.pickedEntityId === null && !opts.hasTarget) return null;
  if (button === 0) return 10;
  if (button === 2) return 11;
  return null;
}
