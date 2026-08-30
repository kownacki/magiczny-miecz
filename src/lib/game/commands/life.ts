/** Życie: healing it (4.7), spending it, and what happens to everything a character was carrying when it runs out (4.4). */

import { HEAL_CEILING, heal } from "@/lib/engine/derive";
import { apply, merge, mergeAll, type Changeset, type Outcome, type Snapshot } from "../change";
import { savedFromLoss } from "@/lib/engine/status";
import { asReturnable, putOnPile, trophiesToPile } from "./piles";
import { passTurn } from "./turn";
import { isStone } from "./stone";

/**
 * Uzdrowienie, up to the starting level and never past it (4.7).
 *
 * Refuses rather than doing nothing when there is nothing to restore, because
 * the offer is always paid for: a Znachor's shilling should not buy a character
 * already at four a fifth point they cannot have.
 */
export function healSeat(
  snapshot: Snapshot,
  command: { seatId: string; amount?: number },
): Outcome<number> {
  const seat = snapshot.seats.find((s) => s.id === command.seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const healed = heal({ life: seat.life }, command.amount ?? 1).life;
  if (healed === seat.life) {
    throw new Error(`Uzdrowienie przywraca punkty tylko do ${HEAL_CEILING} (4.7).`);
  }

  return {
    writes: {
      seats: [{ id: seat.id, patch: { life: healed } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "healed",
          payload: { from: seat.life, to: healed },
        },
      ],
    },
    result: healed,
  };
}

/**
 * Takes points of Życie off a seat, and kills it if they run out.
 *
 * Returns what is left as well as the writes, because most callers say
 * something about the number afterwards.
 */
export function spendLife(
  snapshot: Snapshot,
  seatId: string,
  points: number,
): Outcome<number> {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  /**
   * 20.5: "Postaci Zamienionej w Kamień nie można odebrać punktu Życia."
   *
   * Here rather than at each caller, because this is the one door every loss
   * comes through — a lost fight, a Karta, an Obszar, a fall off the Most —
   * and a rule stated as "cannot be taken" is about the point leaving, not
   * about who reached for it. The two places that *aim* at a character refuse
   * out loud instead (`refuseAgainstStone`); a sweeping card that catches a
   * stone character in passing simply does not move that seat, which is what
   * the Zaraza should do to a statue.
   *
   * Nothing is written and nothing is said. `result` is the Życie the seat
   * still has, which is what it had, so a caller reading it for a death check
   * sees a living character and is right.
   */
  if (isStone(snapshot, seatId)) return { writes: {}, result: seat.life };

  /**
   * The Ocalony, spent by being needed.
   *
   * „Ocalenie przed stratą punktu Życia jeżeli taka strata ma nastąpić" — so it
   * waits, and this is the door every loss comes through, which is what lets
   * one spoken in advance answer whatever the loss turns out to be.
   *
   * The whole loss and not one point of it: nothing in the box takes two at
   * once except the Bestia, and „ocalenie przed stratą" reads as the loss not
   * happening rather than as it happening by less.
   */
  const saved = savedFromLoss(
    snapshot.effects
      .filter((row) => row.seat_id === seatId)
      .map((row) => ({
        id: row.id,
        source: row.source,
        label: row.label,
        modifier: row.modifier,
        ends: row.ends,
      })),
  );
  if (saved) {
    return {
      writes: {
        effects: { delete: [saved.id] },
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "healed",
            payload: { saved: saved.label, points },
          },
        ],
      },
      result: seat.life,
    };
  }

  const left = Math.max(0, seat.life - points);
  const spent: Changeset = { seats: [{ id: seat.id, patch: { life: left } }] };

  if (left > 0 || seat.eliminated) return { writes: spent, result: left };

  const dead = killSeat(apply(snapshot, spent), seat.id);
  return { writes: merge(spent, dead), result: left };
}

/**
 * Death (4.4).
 *
 * "Karty Zaklęć umieszczane są wśród tych, które zostały już użyte" — so the
 * hand goes back to the pile it was dealt from, where 9.5 can shuffle it in
 * again. A trophy has nowhere else to be either. The gear and the friends stay
 * on the Obszar where the character fell, face up for whoever comes next.
 *
 * With the character gone, play must move on if it was their turn — and the
 * pass is decided against a table that already knows they are out, which is the
 * whole reason it is folded in here rather than run afterwards.
 */
export function killSeat(snapshot: Snapshot, seatId: string): Changeset {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  const mine = snapshot.holdings.filter((h) => h.seat_id === seatId);

  const left = mine.filter((h) => h.kind === "item" || h.kind === "friend");
  // A Zaklęcie carried by a Przyjaciel goes back where a spoken one goes (9.6),
  // not onto the Obszar with his card: 4.4 leaves "Przedmioty oraz Przyjaciele"
  // lying there and says nothing about what they were holding. Left out of both
  // lists it was simply deleted, which quietly took a card out of the game.
  const spellCards = mine.filter((h) => h.kind === "spell" || h.kind === "carried");
  const trophies = mine.filter((h) => h.kind === "trophy");

  const dropped: Changeset =
    left.length > 0 && seat?.field_id
      ? {
          fieldCards: {
            insert: left.map((h) => ({
              field_id: seat.field_id as string,
              card_id: h.card_id,
              granted: h.granted,
            })),
          },
        }
      : {};

  const emptied: Changeset =
    mine.length > 0 ? { holdings: { delete: mine.map((h) => h.id) } } : {};

  /**
   * Whatever was true of it stops being true (4.4).
   *
   * An effect is a row against the *seat*, and the seat is about to be somebody
   * else: 4.4's replacement writes a new Karta Postaci into the same chair, so
   * a Zaklęcie cast on the character who died was still sitting there, taking a
   * point of Miecz off a Postać it was never spoken over. The ones that end on
   * their own would have ended eventually, which is a strange kind of
   * inheritance either way.
   *
   * Cleared at the death rather than at the arrival, so it holds for both doors
   * back — 4.4's new Karta and the console's `revive` — and for the chair
   * standing empty in between, where nothing should be true of anybody.
   */
  const undone = snapshot.effects.filter((row) => row.seat_id === seatId);
  const cleared: Changeset =
    undone.length > 0 ? { effects: { delete: undone.map((row) => row.id) } } : {};

  const put = mergeAll(dropped, emptied, cleared);
  // Chained rather than merged: both write `deck`, and a merge would let the
  // second overwrite the first's pile instead of adding to it.
  const spellsBack = putOnPile(apply(snapshot, put), "spells", spellCards.map(asReturnable));
  const trophiesBack = trophiesToPile(apply(snapshot, mergeAll(put, spellsBack)), trophies);
  const returned = mergeAll(spellsBack, trophiesBack);

  const gone: Changeset = {
    /**
     * The points go with the Karty (1.4, 4.4).
     *
     * Held trophies reach the used pile a few lines above, and `punkty` mode's
     * score has to go the same way — a variant where hoarding survived death
     * would be an easier game than the printed rule, and the risk is the point:
     * a lost fight at the Bestia costs 2 Życia and 14.5 can put you off the
     * Most on the way there.
     */
    seats: [{ id: seatId, patch: { eliminated: true, trophy_points: 0, trophy_beaten: [] } }],
    /**
     * "Jej Kartę odłożyć do pozostałych nie biorących udziału w grze" (4.4).
     *
     * Written here because here is the only place that still knows which card
     * it was. The seat keeps `character_id` for now — a dead seat showing whose
     * figure fell is worth having, and `revive` needs it — but the moment its
     * player picks again under 4.4 the column is overwritten, and then nothing
     * anywhere would remember that the Kapłanka is out of this game.
     *
     * Read off the snapshot and written back whole, so two deaths in one turn
     * cannot lose one: `merge` resolves two writes to a column as *later wins*,
     * never as a sum. Nothing else writes this column in the same changeset.
     */
    ...(seat?.character_id && !snapshot.game.characters_out.includes(seat.character_id)
      ? { game: { characters_out: [...snapshot.game.characters_out, seat.character_id] } }
      : {}),
    journal: [
      {
        seatId,
        turn: snapshot.game.turn,
        kind: "death",
        payload: {
          droppedOnField: left.map((h) => h.card_id),
          spellsDiscarded: spellCards.length,
          field: seat?.field_id ?? null,
        },
      },
    ],
  };

  const soFar = mergeAll(put, returned, gone);
  if (snapshot.game.active_seat !== seat?.seat_index) return soFar;
  return merge(soFar, passTurn(apply(snapshot, soFar)));
}
