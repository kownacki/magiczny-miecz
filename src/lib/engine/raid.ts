/** How far a Poszukiwacz Przygód reaches, and what counts as being inside it. */

import { fieldsApart, type FieldId } from "./board";

/**
 * "oddalonego najwyżej o 3 Obszary" — the Poszukiwacz Przygód's own card.
 *
 * Here rather than in `commands/fight.ts`, where it started, because two places
 * now need it and only one of them is a command. The browser has to know what
 * to *offer* — a list of targets it worked out from a different number than the
 * server refuses against is a list with buttons that fail — and a client
 * component cannot reach into the command layer to find out.
 */
export const RAID_RANGE = 3;

/**
 * Whether a raid sent from `from` can arrive at `to`.
 *
 * `fieldsApart` counts steps round one ring and returns null across rings, and
 * that null is deliberate rather than a gap to paper over: a Przeprawa is a
 * turn's work that can fail, not a step, and counting one as a step would put
 * most of the board within three Obszary of everywhere. So a raid never leaves
 * the ring it starts on.
 *
 * Nulls in, false out. A character in the poczekalnia stands on no field and a
 * card can be held rather than lying on one; neither is reachable, and saying
 * so here keeps the two callers from each inventing their own answer.
 */
export function withinRaid(from: FieldId | null, to: FieldId | null): boolean {
  if (from === null || to === null) return false;
  const apart = fieldsApart(from, to);
  return apart !== null && apart <= RAID_RANGE;
}
