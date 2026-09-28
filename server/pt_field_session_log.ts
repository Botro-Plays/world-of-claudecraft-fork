// PT field-session lifecycle log (O3): a pure differ the GameServer tick loop
// feeds once per tick, emitting one line per lifecycle edge in the same style
// as the realm's join/leave lines (`- name left ...`). The session registry
// itself lives in src/sim and stays silent (sim purity); all observability is
// host-side here, where console output is the operational surface.
//
// Cost: O(live sessions) per tick - sessions exist only while fields have
// members, so an empty realm diffs two empty maps.

import type { PtFieldSession } from '../src/sim/pt_field_sessions';

// The per-field shape the differ remembers between ticks. Copying scalars (not
// the session object) is deliberate: session records mutate in place, so a
// retained reference would never show a diff.
export interface PtFieldSessionMark {
  readonly state: string;
  readonly players: number;
  readonly entities: number;
}

export type PtFieldSessionMarks = Map<string, PtFieldSessionMark>;

/**
 * Diff `sessions` against `marks`, updating marks in place, and return the
 * lifecycle lines to print. Edges reported: activation (new session), drain
 * start (last player left), reactivation, unload, and member-count churn while
 * a session stays alive.
 */
export function ptFieldSessionLogLines(
  marks: PtFieldSessionMarks,
  sessions: readonly PtFieldSession[],
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    seen.add(s.fieldId);
    const mark: PtFieldSessionMark = {
      state: s.state,
      players: s.players.size,
      entities: s.entities.size,
    };
    const prev = marks.get(s.fieldId);
    if (prev === undefined) {
      lines.push(
        `[pt-field] +${s.fieldId} ${s.state} (players:${mark.players} entities:${mark.entities})`,
      );
    } else if (prev.state !== s.state) {
      lines.push(`[pt-field] ${s.fieldId} ${prev.state} -> ${s.state} (players:${mark.players})`);
    } else if (prev.players !== s.players.size) {
      lines.push(
        `[pt-field] ${s.fieldId} players ${prev.players} -> ${mark.players} (entities:${mark.entities})`,
      );
    }
    marks.set(s.fieldId, mark);
  }
  for (const id of marks.keys()) {
    if (!seen.has(id)) {
      marks.delete(id);
      lines.push(`[pt-field] -${id} unloaded`);
    }
  }
  return lines;
}
