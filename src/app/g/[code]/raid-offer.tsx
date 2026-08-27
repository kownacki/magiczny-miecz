"use client";

import { Rules } from "./rule-ref";

/** The Poszukiwacz Przygód, sent out at something up to three Obszary off. */

import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import type { CardId } from "@/data/ids";
import type { FieldId } from "@/lib/engine/board";
import { fieldWithText } from "@/lib/view/fieldText";
import { combatValueOf } from "@/lib/engine/cards";
import { RAID_RANGE, withinRaid } from "@/lib/engine/raid";
import { raidsForYou } from "@/lib/engine/abilities";
import { CARD_NAMES, type Seat } from "./table";

const EVENTS = events as EventCard[];

/**
 * One thing a raid can be sent at.
 *
 * A Postać and a Wróg lying on the board are one choice to a player and two
 * fields on the wire — `targetSeatId` or `raidFieldCardId`, exactly one — so
 * the difference is carried here and flattened at the point of posting rather
 * than making the caller keep two lists in step.
 */
export type RaidTarget =
  | { kind: "seat"; id: string; name: string; where: FieldId; apart: string }
  | { kind: "card"; id: string; name: string; where: FieldId; apart: string };

/**
 * What is inside the Poszukiwacz Przygód's reach, worked out the server's way.
 *
 * Every test here is one `sendRaider` will repeat, and deliberately: this list
 * decides what to *offer*, and an offer the command then refuses is worse than
 * no offer at all. The range test itself is imported rather than re-derived —
 * `withinRaid` is the same function the command calls — so the two cannot come
 * apart on the one number a player would notice.
 *
 * What is not repeated is the check for the raider himself, which the caller
 * does: without a Poszukiwacz there is no section, not an empty one.
 */
export function raidTargets(
  from: FieldId | null,
  mySeatId: string,
  seats: readonly Seat[],
  fieldCards: readonly { id: string; fieldId: string | null; cardId: string }[],
): RaidTarget[] {
  if (from === null) return [];

  const targets: RaidTarget[] = [];

  for (const seat of seats) {
    // "Postać nie walczy sama ze sobą", and 15.4's dead are not a target
    // either. A chair with nobody in it is not a Postać at all.
    if (seat.id === mySeatId || seat.eliminated || seat.character_id === null) continue;
    if (!withinRaid(from, seat.field_id)) continue;
    targets.push({
      kind: "seat",
      id: seat.id,
      name: seat.player_name ?? "gracz",
      where: seat.field_id as FieldId,
      apart: whereFrom(seat.field_id as FieldId),
    });
  }

  for (const lying of fieldCards) {
    if (!withinRaid(from, lying.fieldId as FieldId | null)) continue;
    // 16.8 leaves all sorts of things lying on an Obszar and only some of them
    // are fought. A Przedmiot on the ground is not a raid target, and offering
    // it would be a button whose only outcome is "Z tą Kartą się nie walczy".
    const card = EVENTS.find((one) => one.id === lying.cardId);
    if (!card || !combatValueOf(card)) continue;
    targets.push({
      kind: "card",
      id: lying.id,
      name: CARD_NAMES.get(lying.cardId) ?? lying.cardId,
      where: lying.fieldId as FieldId,
      apart: whereFrom(lying.fieldId as FieldId),
    });
  }

  return targets;
}

/** The Obszar's own name, which is what a player is picking between. */
function whereFrom(fieldId: FieldId): string {
  return fieldWithText(fieldId)?.name ?? fieldId;
}

/**
 * Sending the friend out (6.2, and the card's own text).
 *
 * "Po zakończeniu ruchu możesz zlecić temu Przyjacielowi, by zaatakował Postać
 * lub Wroga, oddalonego najwyżej o 3 Obszary." So it belongs after the move, on
 * the Obszar the move ended on, which is where this window already is — and it
 * is the one action in the game that reaches off the field the character is
 * standing on, which is why it needs a list of somewhere else to point at.
 *
 * The whole of the bargain is worth saying out loud, because it is unusually
 * good and a player who has not read the card will not risk it: the friend
 * fights with his own three points, and losing costs a Życie of nobody's — he
 * dies instead of you (6.4). A raid that goes wrong takes nothing from the
 * character at all.
 */
export function RaidOffer({
  seat,
  seats,
  fieldCards,
  busy,
  onRaid,
}: {
  /** The character doing the sending — their field is where the range is measured from. */
  seat: Seat;
  seats: readonly Seat[];
  fieldCards: readonly { id: string; fieldId: string | null; cardId: string }[];
  busy: boolean;
  onRaid: (target: RaidTarget) => void;
}) {
  const raider = raidsForYou(seat.holdings.map((held) => held.cardId));
  // No Poszukiwacz, no section. This is not a rule the character is failing to
  // meet, it is a card they have not got.
  if (!raider) return null;

  const targets = raidTargets(seat.field_id, seat.id, seats, fieldCards);
  const name = CARD_NAMES.get(raider.cardId as CardId) ?? raider.cardId;

  return (
    <section className="border-t border-edge pt-3">
      {/* No rule number: 6.2 is "Karty Przyjaciół są układane odkryte", and a
          wyprawa is not in chapter 6 at all — it is printed on the Karta of the
          Przyjaciel who can go on one, which 8.2 puts above the general rules. */}
      <h3 className="text-[11px] uppercase tracking-widest text-muted">Wyprawa</h3>

      {targets.length === 0 ? (
        // Said rather than left blank. An empty list under a heading reads as
        // something still loading; the reason it is empty is the rule.
        <p className="mt-2 text-xs text-muted">
          {name} nie ma na kogo ruszyć — w zasięgu {RAID_RANGE} Obszarów nie ma ani Postaci,
          ani Wroga. Wyprawa nie przekracza Przeprawy.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted">
            <Rules>
              {name} walczy swoimi {raider.miecz} punktami Miecza. Przegrana wyprawa nie
              kosztuje cię punktu Życia — Przyjaciel ginie zamiast ciebie (6.4).
            </Rules>
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {targets.map((target) => (
              <li key={`${target.kind}:${target.id}`}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRaid(target)}
                  className="w-full rounded border border-edge px-2 py-1.5 text-left text-xs text-ink transition hover:border-vermilion disabled:opacity-50"
                >
                  <span className={target.kind === "seat" ? "text-ochre" : "text-vermilion"}>
                    {target.name}
                  </span>
                  <span className="text-muted"> — {target.apart}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
