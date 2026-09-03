"use client";

/**
 * Telling a player their figure has moved without them asking.
 *
 * Most of what a Karta does lands on the thing it did it to and is read there —
 * a point off a rail, a Karta gone from a hand — and the running account of it
 * is the Dziennik. `use-table.ts` says so where it stopped turning the server's
 * answer into a sentence, and it is right.
 *
 * A relocation is the one exception, and it earns it by being the only outcome
 * that moves *you*. The Karta you were reading is gone, the Obszar under your
 * figure is somewhere else, and the next thing the app asks you is about a
 * square you did not choose to be on (16.8). „Nic się nie dzieje" can be found
 * out afterwards; this cannot.
 *
 * # How it is spotted
 *
 * Not off the server's answer — that door stays shut — and not off the seat's
 * own `field_id`, which changes on every ordinary move too. It is the *turn
 * frame's* Obszar: one is opened when a move ends (13.1) and a plain move
 * therefore never changes it, while a Karta that relocates you leaves the phase
 * where it is and re-seats the frame under you. A `field` to `field` change is
 * exactly the event and nothing else is.
 */

import { useEffect, useRef } from "react";
import { FIELDS, type FieldId } from "@/lib/engine/board";

export function useMovedNotice(
  /** The Obszar the turn is on, or null outside a `field` frame. */
  fieldId: FieldId | null,
  /** Whether this device is the one being moved. Watchers are told nothing. */
  mine: boolean,
  say: (moved: { from: FieldId; to: FieldId }) => void,
) {
  const before = useRef<FieldId | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = fieldId;
    // Both ends inside one field frame, or it is a move arriving rather than a
    // Karta carrying somebody off.
    if (!mine || was === null || fieldId === null || was === fieldId) return;
    if (!FIELDS.has(was) || !FIELDS.has(fieldId)) return;
    say({ from: was, to: fieldId });
  }, [fieldId, mine, say]);
}
