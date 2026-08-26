/** Passing the turn on: what expires, what is left lying on the Obszar, and whose turn is next (10.1, 16.8). */

import { nextSeat, startTurn } from "@/lib/engine/turn";
import { afterTurn, type Status } from "@/lib/engine/status";
import { scriptFor } from "@/lib/engine/cardScript";
import type { TurnCard } from "@/lib/engine/state";
import { apply, merge, mergeAll, type Changeset, type Snapshot } from "../change";
import { putOnPile } from "./piles";

/** What one seat is under, in the shape the engine reasons about. */
export function statusesOf(snapshot: Snapshot, seatId: string): Status[] {
  return snapshot.effects
    .filter((row) => row.seat_id === seatId)
    .map((row) => ({
      id: row.id,
      source: row.source,
      label: row.label,
      modifier: row.modifier,
      ends: row.ends,
    }));
}

/** The stored effects reduced to whatever is left of them. */
export function keepOnly(
  snapshot: Snapshot,
  seatId: string,
  left: readonly Status[],
): Changeset {
  const before = statusesOf(snapshot, seatId);
  const surviving = new Map(left.map((status) => [status.id, status]));
  const gone: string[] = [];
  const changed: { id: string; patch: { ends: Status["ends"] } }[] = [];

  for (const was of before) {
    const now = surviving.get(was.id);
    if (!now) gone.push(was.id);
    else if (JSON.stringify(now.ends) !== JSON.stringify(was.ends)) {
      changed.push({ id: was.id, patch: { ends: now.ends } });
    }
  }

  if (gone.length === 0 && changed.length === 0) return {};
  return {
    effects: {
      ...(gone.length ? { delete: gone } : {}),
      ...(changed.length ? { patch: changed } : {}),
    },
  };
}

/**
 * One turn off everything this seat is counting down.
 *
 * Counted in the holder's OWN turns, so this is the moment: "na 1 turę" on a
 * card means one of yours, and measuring it in rounds would make an Eliksir
 * last longer at a table of six than at a table of two.
 */
export function tickEffects(snapshot: Snapshot, seatId: string): Changeset {
  return keepOnly(snapshot, seatId, afterTurn(statusesOf(snapshot, seatId)));
}

/**
 * Whatever was drawn or found here and not taken stays on the Obszar (16.8).
 *
 * The exception is the cards that are used up by being read: a Spotkanie, a
 * Nieznajomy or a Miejsce whose own text ends "a następnie ją odłóż" has done
 * its work by the end of the turn, because 16.1 and 16.5 make obeying it
 * compulsory. A Przedmiot is not like that.
 */
const CONSUMED_BY_READING = new Set(["encounter", "stranger", "place"]);

export function leaveCardsBehind(
  snapshot: Snapshot,
  input: {
    fieldId: string;
    remaining: readonly TurnCard[];
    seatId: string | null;
    turn: number;
  },
): Changeset {
  const spentByReading = (card: TurnCard) =>
    CONSUMED_BY_READING.has(card.cardClass) &&
    scriptFor(card.cardId)?.disposition.kind === "odloz";
  const stays = input.remaining.filter((card) => !spentByReading(card));

  // The other half of the same sentence: a Karta whose own text says "odłóż" is
  // not left on the Obszar (16.8) and is not destroyed either — it joins the
  // stos zużytych, which is what 9.5 draws on when the deck runs dry.
  const discarded = putOnPile(
    snapshot,
    "events",
    input.remaining.filter(spentByReading).map((card) => ({
      cardId: card.cardId,
      granted: card.granted,
    })),
  );

  if (stays.length === 0) return discarded;

  return merge(discarded, {
    fieldCards: {
      // The mark travels onto the field with the card. A Wróg the test console
      // staged is one the deck never gave up, and left lying here without it it
      // becomes a real card the moment somebody picks it up — and then a
      // phantom on the used pile the moment they put it down.
      insert: stays.map((card) => ({
        field_id: input.fieldId,
        card_id: card.cardId,
        granted: card.granted === true,
      })),
    },
    // 16.8 leaves them lying face up, so what was left and where is something
    // the whole table can see — and therefore something the journal owes it.
    journal: [
      {
        seatId: input.seatId,
        turn: input.turn,
        kind: "zostawienie",
        payload: { fieldId: input.fieldId, cardIds: stays.map((card) => card.cardId) },
      },
    ],
  });
}

/**
 * Hands play to whoever is next (10.1).
 *
 * The active seat is looked up leniently rather than through `activeSeatOf`,
 * which throws: a table with nobody to play is exactly the state this has to be
 * able to work its way out of, and refusing to run is what kept it stuck.
 */
export function passTurn(snapshot: Snapshot): Changeset {
  const game = snapshot.game;
  const seat = snapshot.seats.find((row) => row.seat_index === game.active_seat) ?? null;

  const expired = seat ? tickEffects(snapshot, seat.id) : {};

  const left =
    game.turn_state.phase === "pole" && game.turn_state.drawn.length > 0
      ? leaveCardsBehind(apply(snapshot, expired), {
          fieldId: game.turn_state.fieldId,
          remaining: game.turn_state.drawn,
          seatId: seat?.id ?? null,
          turn: game.turn,
        })
      : {};

  const order = snapshot.seats
    .filter((s) => s.character_id)
    .map((s) => ({
      index: s.seat_index,
      eliminated: s.eliminated,
      turnsLost: s.turns_lost,
      stoneUntilTurn: s.stone_until_turn,
    }));

  /**
   * Keep passing until somebody can actually play.
   *
   * `nextSeat` walks the table once. If every seat that is left owes a lost
   * turn — which Burza Siedmiu Słońc causes outright, "Wszystkie Postacie tracą
   * 1 turę" — it comes back with nobody, and the game used to stop there for
   * good: `active_seat` went null, and every way of moving the game on needs an
   * active seat to press it, including the one that spends those lost turns.
   *
   * So the pass repeats. Each one spends a turn from everybody it skips, so it
   * cannot run forever. Stone is not spent this way and does not need to be:
   * 20.1 measures it in turn numbers, so it comes back on its own as the
   * counter moves.
   */
  const spent = new Map<number, number>();
  const owedBy = (index: number) =>
    (order.find((row) => row.index === index)?.turnsLost ?? 0) - (spent.get(index) ?? 0);

  let next: number | null = null;
  let skipped: number[] = [];
  let asOfTurn = game.turn;

  // The guard is a backstop, not the exit: each pass spends a turn from
  // everybody it skips, so the loop is bounded by the largest `turns_lost` at
  // the table. It is here so a future bug cannot hang a request.
  for (let pass = 0; pass < 64; pass++) {
    const attempt = nextSeat(
      order.map((row) => ({ ...row, turnsLost: owedBy(row.index) })),
      pass === 0 ? game.active_seat : next,
      asOfTurn,
    );
    next = attempt.seat;
    skipped = attempt.skipped;

    // Everybody passed over on this round spends one, whether or not the round
    // found somebody after them.
    let anySpent = false;
    for (const index of skipped) {
      if (owedBy(index) > 0) {
        spent.set(index, (spent.get(index) ?? 0) + 1);
        anySpent = true;
      }
    }

    if (next !== null) break;
    // Nobody, and nobody is merely waiting either: what is left is stone or
    // eliminated. 20.1 measures stone in turn numbers, so it comes back on its
    // own as the counter moves, and passing again would achieve nothing.
    if (!anySpent) break;
    asOfTurn += 1;
  }

  const spentTurns: Changeset = {
    seats: [...spent]
      .map(([index, count]) => {
        const row = snapshot.seats.find((s) => s.seat_index === index);
        return row
          ? { id: row.id, patch: { turns_lost: Math.max(0, row.turns_lost - count) } }
          : null;
      })
      .filter((one): one is NonNullable<typeof one> => one !== null),
  };

  // The turn counter advances when play comes back round to or past the first
  // seat, which is what the three-turn Stone timer in 20.1 counts.
  const wrapped = next !== null && next <= (game.active_seat ?? 0);

  return mergeAll(expired, left, spentTurns, {
    game: {
      active_seat: next,
      turn: wrapped ? game.turn + 1 : game.turn,
      turn_state: startTurn(),
    },
    // `wrapped` and the number it wrapped to, because the round counter is not
    // derivable from the row: the journal reads entries in order and has no way
    // to know that this particular pass was the one that came back round.
    // `seat` is absent when the table had nobody to play — the pass still
    // happened and is still worth recording.
    journal: [
      {
        seatId: seat?.id ?? null,
        turn: game.turn,
        kind: "koniec-tury",
        payload: {
          next,
          skipped,
          wrapped,
          turnAfter: wrapped ? game.turn + 1 : game.turn,
        },
      },
    ],
  });
}

/**
 * Puts a character under something for a while.
 *
 * The journal line is what makes it visible: an effect that appeared beside a
 * name with nothing saying where it came from is the sort of thing players
 * argue about two turns later.
 */
export function addEffect(
  snapshot: Snapshot,
  command: {
    seatId: string;
    effect: { source: string; label: string; modifier: Status["modifier"]; ends: Status["ends"] };
  },
): Changeset {
  const { source, label, modifier, ends } = command.effect;
  return {
    effects: { insert: [{ seat_id: command.seatId, source, label, modifier, ends }] },
    journal: [
      {
        seatId: command.seatId,
        turn: snapshot.game.turn,
        kind: "efekt",
        payload: { source, label, ends },
      },
    ],
  };
}
