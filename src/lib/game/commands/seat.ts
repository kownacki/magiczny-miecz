/** One seat, read off a snapshot: everything a rule asks about a character, worked out once. */

import { abilitiesOfCharacter, asCharacterId, startingKit } from "@/lib/engine/characters";
import { heldAbilities, type Ability } from "@/lib/engine/abilities";
import { bonusFromHoldings, inEffect, type Reckoning } from "@/lib/engine/holdings";
import { carriedCount, carryLimit, spellAllowance } from "@/lib/engine/derive";
import { allStatuses, type Status } from "@/lib/engine/status";
import type { TargetSeat } from "@/lib/engine/targets";
import type { Holding } from "@/lib/engine/state";
import type { EqMode, Slot } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import type { HoldingRow, SeatRow } from "../store";
import type { Snapshot } from "../change";

export function eqModeOf(game: { eq_mode: string }): EqMode {
  return game.eq_mode === "slotowy" ? "slotowy" : "klasyczny";
}

export function asHolding(row: HoldingRow): Holding {
  return {
    cardId: row.card_id,
    kind: row.kind,
    face: row.face,
    slot: (row.slot ?? null) as Slot | null,
  };
}

export function seatById(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  return seat;
}

export function activeSeat(snapshot: Snapshot): SeatRow {
  const seat = snapshot.seats.find((s) => s.seat_index === snapshot.game.active_seat);
  if (!seat) throw new Error("Brak aktywnego gracza.");
  return seat;
}

export function holdingsOf(snapshot: Snapshot, seatId: string): Holding[] {
  return snapshot.holdings.filter((h) => h.seat_id === seatId).map(asHolding);
}

/**
 * Everything a rule asks about one character, worked out once.
 *
 * The store answered these questions wherever they came up, which meant the sum
 * of own points and lent points was written out eleven times and the abilities
 * a character has were assembled seven ways. Assembled here instead, so a rule
 * asks rather than derives.
 *
 * Only the character's own Miecz and Magia are stored (1.2, 2.2); everything on
 * this object except `row` is computed at read time and never written back,
 * which is the whole of why a total cannot drift from the cards actually held.
 */
export interface SeatView {
  /** The stored row, for the columns nothing has a better name for yet. */
  row: SeatRow;
  id: string;
  index: number;
  characterId: string | null;
  fieldId: SeatRow["field_id"];
  nature: Nature | null;
  eliminated: boolean;

  holdings: Holding[];

  /**
   * The abilities a card lends where it is, plus the character's own.
   *
   * In slotowy a card works where it is worn and nowhere else, which is what
   * `inEffect` reads. This is the one to ask for anything happening *to* the
   * character now — a fight, a crossing, a toll.
   */
  abilities: Ability[];
  /**
   * What the cards owned lend, worn or packed, trophies aside — and nothing the
   * character is by itself.
   *
   * A narrower question with a wider answer, and both halves of the difference
   * are deliberate. Wider, because the Różdżka Zaklęć says "Właściciel": owning
   * it is the whole condition, so a wand in the pack raises the limit exactly
   * as one on the body does. Narrower, because this answers what a character
   * *has*, and what it *is* is not a card.
   */
  fromCards: Ability[];

  /** Own points plus what the cards lend (1.5, 2.5), as a parameter. */
  parametr: { miecz: number; magia: number };
  /** The same, reckoned for a fight — 1.5's other figure. */
  walka: { miecz: number; magia: number };

  /** How many Przedmioty count against 5.4, and how many are allowed. */
  carried: number;
  carryLimit: number;
  /** How many Zaklęcia this hand may hold (2.6, 9.2). */
  spellCapacity: number;

  /** Everything the character is under, from both halves of the model. */
  statuses: Status[];

  /** The seat as the targeting rules see it. */
  asTarget: TargetSeat;
}

function natureOf(row: SeatRow): Nature | null {
  return row.nature === "dobra" || row.nature === "zla" || row.nature === "chaotyczna"
    ? row.nature
    : null;
}

export function seatView(snapshot: Snapshot, seatId: string): SeatView {
  const row = seatById(snapshot, seatId);
  const mode = eqModeOf(snapshot.game);
  const holdings = holdingsOf(snapshot, seatId);
  const mine = abilitiesOfCharacter(asCharacterId(row.character_id));

  const parametr = bonusFromHoldings(holdings, mode, "parametr");
  const walka = bonusFromHoldings(holdings, mode, "walka");
  const fromCards = heldAbilities(
    holdings.filter((h) => h.kind !== "trophy").map((h) => h.cardId),
  );

  return {
    row,
    id: row.id,
    index: row.seat_index,
    characterId: row.character_id,
    fieldId: row.field_id,
    nature: natureOf(row),
    eliminated: row.eliminated,
    holdings,
    abilities: [...heldAbilities(inEffect(holdings, mode).map((h) => h.cardId)), ...mine],
    fromCards,
    parametr: { miecz: row.miecz_own + parametr.miecz, magia: row.magia_own + parametr.magia },
    walka: { miecz: row.miecz_own + walka.miecz, magia: row.magia_own + walka.magia },
    carried: carriedCount(holdings, mode),
    carryLimit: carryLimit(holdings, mode),
    spellCapacity: spellAllowance(
      row.magia_own + parametr.magia,
      startingKit(asCharacterId(row.character_id)).spells ?? 0,
      fromCards,
    ),
    statuses: allStatuses(
      snapshot.effects
        .filter((e) => e.seat_id === row.id)
        .map((e) => ({
          id: e.id,
          source: e.source,
          label: e.label,
          modifier: e.modifier,
          ends: e.ends,
        })),
      {
        turnsLost: row.turns_lost,
        stoneUntilTurn: row.stone_until_turn,
        bridgeBlockedUntilTurn: row.bridge_blocked_until_turn,
        natureChangedTurn: row.nature_changed_turn,
      },
      snapshot.game.turn,
    ),
    asTarget: {
      seatIndex: row.seat_index,
      characterId: row.character_id,
      fieldId: row.field_id,
      nature: natureOf(row),
      eliminated: row.eliminated,
    },
  };
}

/** The active seat, as a view. */
export function activeView(snapshot: Snapshot): SeatView {
  return seatView(snapshot, activeSeat(snapshot).id);
}

/**
 * Own points plus what the cards lend (1.5, 2.5).
 *
 * Kept as a function of its own because most callers want one reckoning and
 * not a whole view; it is `seatView`'s two totals under one name.
 */
export function pointsOf(
  snapshot: Snapshot,
  seatId: string,
  as: Reckoning,
): { miecz: number; magia: number } {
  const view = seatView(snapshot, seatId);
  return as === "walka" ? view.walka : view.parametr;
}
