/** Passing the turn on: what expires, what is left lying on the Obszar, and whose turn is next (10.1, 16.8). */

import { nextSeat, startTurn } from "@/lib/engine/turn";
import { afterAnyTurn, afterTurn, playsAgain, type Status } from "@/lib/engine/status";
import { scriptFor } from "@/lib/engine/cardScript";
import { abilitiesOf, entryPrice } from "@/lib/engine/abilities";
import type { TurnCard } from "@/lib/engine/state";
import { only, top, topIf } from "@/lib/engine/stack";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type Outcome,
  type Snapshot,
} from "../change";
import { holdOverflow, refuseWhileOverflow } from "./overflow";
import { refuseWhileBeastAwaits } from "./beast";
import { putOnPile } from "./piles";

/**
 * 13.2's fork: a turn is spent meeting somebody, or exploring the Obszar.
 *
 * "Postać musi dokonać wyboru między spotkaniem z inną Postacią znajdującą się
 * na tym samym Obszarze, a badaniem samego Obszaru." It is a choice the player
 * makes, and the app's job is only to stop them making it twice — which it did
 * not, so a character could attack a rival and then work through the square's
 * own instruction as well.
 *
 * What counts as exploring is 13.5's list, and the two entries that leave a
 * trace are enough to see it: a Karta drawn, or the Obszar's own offer
 * resolved. Nothing here needs to know about gold or Przyjaciele, because you
 * cannot reach either without first doing one of those two.
 */
export function hasExplored(snapshot: Snapshot): boolean {
  const state = topIf(snapshot.game.turn_state, "field");
  if (!state) return false;
  return state.drawn.length > 0 || (state.resolved?.length ?? 0) > 0;
}

/** Whether this turn has already been spent on a meeting (13.2). */
export function hasMet(snapshot: Snapshot): boolean {
  const state = top(snapshot.game.turn_state);
  return state.phase === "field" && state.met === true;
}

/** Refuses the half of 13.2 that has not been chosen. */
export function refuseAgainst13_2(snapshot: Snapshot, doing: "meet" | "explore"): void {
  if (doing === "meet" && hasExplored(snapshot)) {
    throw new Error(
      "Ten Obszar jest już zbadany — spotkanie albo badanie, nie oboje (13.2).",
    );
  }
  if (doing === "explore" && hasMet(snapshot)) {
    throw new Error(
      "Ta tura poszła na spotkanie — spotkanie albo badanie, nie oboje (13.2).",
    );
  }
}

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
/**
 * Writes back whatever an engine function decided is left.
 *
 * The engine returns the survivors rather than naming what to delete, so this
 * deletes by difference: anything that was there and is not in the answer has
 * ended. A countdown that ticked comes back as the same id with a smaller
 * number, so it is updated rather than replaced — the row is the effect, and
 * replacing it would make an Eliksir look like it had been drunk twice.
 */
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
 *
 * This is the *other* counter, and the distinction is the one CONTEXT.md's
 * "tura" entry exists for. `games.round` counts rounds and advances for
 * everybody at once; this ticks only for the seat whose go just ended, which
 * is why a skipped seat's buff does not burn away while it cannot act.
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
    /** The round to file the lines under — see CONTEXT.md, "tura". */
    round: number;
  },
): Changeset {
  const spentByReading = (card: TurnCard) =>
    CONSUMED_BY_READING.has(card.cardClass) &&
    scriptFor(card.cardId)?.disposition.kind === "odloz";
  /**
   * The one friend who does not wait to be picked up.
   *
   * 16.8 leaves what you did not take lying face up on the Obszar, and the
   * Najemnik says so himself — "będzie czekał tu na bardziej hojną Postać".
   * The Tragarz is the exception and prints it: unpaid, "odejdzie na stos
   * użytych Kart". So he leaves by the same door as a Karta whose own text
   * says `odłóż`, which is the door this function already has.
   */
  const walksOff = (card: TurnCard) => entryPrice(abilitiesOf(card.cardId))?.bezZaplaty === "odchodzi";
  const goes = (card: TurnCard) => spentByReading(card) || walksOff(card);
  const stays = input.remaining.filter((card) => !goes(card));

  // The other half of the same sentence: a Karta whose own text says "odłóż" is
  // not left on the Obszar (16.8) and is not destroyed either — it joins the
  // stos zużytych, which is what 9.5 draws on when the deck runs dry.
  const discarded = putOnPile(
    snapshot,
    "events",
    input.remaining.filter(goes).map((card) => ({
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
        round: input.round,
        kind: "left-behind",
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
export function passTurn(snapshot: Snapshot, force = false): Changeset {
  const game = snapshot.game;
  const seat = snapshot.seats.find((row) => row.seat_index === game.active_seat) ?? null;

  /**
   * The turn coming back to the same seat, before anything else is decided.
   *
   * Formuła Czasu: „wykorzystanie 3 kolejnych tur zamiast jednej". Read before
   * the tick, so the status counts the extra turns out — two of them for three
   * turns in a row, since the turn it was spoken in is the first.
   *
   * Everything else the pass does still happens: what expires expires, and what
   * was left on the Obszar is left. What does not happen is the seat changing,
   * so 16.8's cards are cleared away and the same player begins again.
   */
  const again = seat ? playsAgain(statusesOf(snapshot, seat.id)) : false;
  const expired = seat ? tickEffects(snapshot, seat.id) : {};
  /**
   * And what ends with the turn itself, wherever it is sitting.
   *
   * `tickEffects` above is the seat's own countdown and is asked of the seat
   * that just played. `Ends.this-turn` is the other shape: a moment the table
   * passes through, so it has to be asked of everybody. An Eliksir drunk in a
   * fight on somebody else's turn is held by a seat this pass would otherwise
   * never look at, and it is spent by the end of that turn — which is what "na
   * 1 turę" means when the turn is not yours.
   */
  const endedWithTurn = mergeAll(
    ...snapshot.seats.map((row) =>
      keepOnly(snapshot, row.id, afterAnyTurn(statusesOf(snapshot, row.id))),
    ),
  );

  const state = top(game.turn_state);
  // A turn cannot be put down mid-sentence: a running fight or a Karta
  // suspended half-resolved is the turn's own unfinished business, and passing
  // over it would strand a frame no future turn owns.
  //
  // `force` is the test console's way past all three, and the only way past the
  // last two: `endfight` drops a fight, but a Karta half-resolved and a
  // question owed have no verb of their own, and a table wedged in one has
  // nothing left to type. Nothing is stranded by going anyway — the pass writes
  // `only(startTurn())` over the whole stack, so a forced pass throws the frame
  // away rather than leaving it behind.
  if (state.phase === "fight" && !force) throw new Error("Najpierw dokończcie walkę (17.4).");
  if (state.phase === "script" && !force) {
    throw new Error(`Najpierw dokończ: ${state.reason} — Karta jest w trakcie rozpatrywania.`);
  }
  /**
   * A question owed is unfinished business in exactly the way a suspended
   * Karta is, and for the same reason: the frame names a seat, and passing the
   * turn writes `only(startTurn())` over the whole stack — so the thing the
   * table was waiting on would be deleted by the button it was blocking.
   *
   * It was not refused before. The window is small — an `ask` is answered in
   * the commit after it opens, and the browser's own batching means most
   * questions never become a frame at all — but the seat it is owed to may not
   * be the seat playing (law 5), and that is precisely the case where nobody
   * would notice.
   */
  if (state.phase === "ask" && !force) {
    throw new Error(`Najpierw odpowiedz: ${state.reason} — ktoś jeszcze wybiera.`);
  }
  const left =
    state.phase === "field" && state.drawn.length > 0
      ? leaveCardsBehind(apply(snapshot, expired), {
          fieldId: state.fieldId,
          remaining: state.drawn,
          seatId: seat?.id ?? null,
          round: game.round,
        })
      : {};

  const order = snapshot.seats
    .filter((s) => s.character_id)
    .map((s) => ({
      index: s.seat_index,
      eliminated: s.eliminated,
      turnsLost: s.turns_lost,
      stoneUntilRound: s.stone_until_round,
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
  // The round we are in, which is what `nextSeat` compares Stone against.
  let asOfRound = game.round;

  // The guard is a backstop, not the exit: each pass spends a turn from
  // everybody it skips, so the loop is bounded by the largest `turns_lost` at
  // the table. It is here so a future bug cannot hang a request.
  for (let pass = 0; pass < 64; pass++) {
    const attempt = nextSeat(
      order.map((row) => ({ ...row, turnsLost: owedBy(row.index) })),
      pass === 0 ? game.active_seat : next,
      asOfRound,
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
    asOfRound += 1;
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

  // `games.round` is the circuit of the table: it advances when play comes
  // back round to or past the first seat, which is what 20.1's three-turn
  // Stone timer counts. A seat's own goes are counted elsewhere and
  // separately — `tickEffects` below is the other one.
  const wrapped = !again && next !== null && next <= (game.active_seat ?? 0);

  return mergeAll(expired, endedWithTurn, left, spentTurns, {
    game: {
      active_seat: again ? game.active_seat : next,
      round: wrapped ? game.round + 1 : game.round,
      turn_state: only(startTurn()),
    },
    // `wrapped` and the number it wrapped to, because the round counter is not
    // derivable from the row: the journal reads entries in order and has no way
    // to know that this particular pass was the one that came back round.
    // `seat` is absent when the table had nobody to play — the pass still
    // happened and is still worth recording.
    journal: [
      {
        seatId: seat?.id ?? null,
        round: game.round,
        kind: "turn-end",
        payload: {
          next: again ? game.active_seat : next,
          skipped,
          wrapped,
          turnAfter: wrapped ? game.round + 1 : game.round,
          // Said, because a turn that does not move is the sort of thing a
          // table argues about two turns later.
          ...(again ? { again: true } : {}),
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
        round: snapshot.game.round,
        kind: "effect",
        payload: { source, label, ends },
      },
    ],
  };
}

/**
 * Handing the turn on, with the two rules that can refuse it (5.6, 14.7).
 *
 * The body of this lived inside a `change()` lambda in `turnStore.ts`, which
 * made "may this turn be handed on, and what happens if not" the one turn
 * question no test could ask without a database. It is four pure calls over a
 * Snapshot and it belongs here, beside the `passTurn` it guards.
 *
 * 5.6, at the other end of the turn — and now on the stack rather than in
 * somebody's face.
 *
 * Checked here and in `rollForMove` rather than everywhere, because those are
 * the two doors: you cannot begin a turn owing the rule, and you cannot hand
 * one on. An overflow that happens mid-turn — the Bagna taking your Koń — is
 * therefore settled before play moves, which is as close to "natychmiast" as a
 * turn-based referee can honestly get.
 *
 * What changed is what happens at the door. It used to throw at whoever
 * pressed the button, which told one player and left the table looking at a
 * game that had simply stopped responding. Now it opens the frame and writes
 * it: the turn does not pass, and every device is looking at the same sentence
 * about the same seat, with the ways out named.
 *
 * `passTurn` itself is left alone. Half the game passes the turn as a
 * consequence of something else — a death, a lost turn, a fall off the Most —
 * and none of those is a player choosing to walk away from a rule.
 *
 * `force` is `endturn force`, and it is the test console's alone: every guard
 * above it is a rule of the game, so the capability comes off the flag rather
 * than off a second verb (`gold +5 force` set the pattern). It exists because
 * the refusals are exactly right for a game and exactly wrong for a table being
 * set up by hand — a surplus dealt in with `deal`, a Tarcza put on with
 * `equip`, a Karta half-resolved by a script nobody wants to finish — where the
 * one thing the tester needs is the next turn, and the honest way out was to
 * undo what they had just built.
 */
export function finishTurn(
  snapshot: Snapshot,
  command: { force: boolean } = { force: false },
): Outcome<"passed" | "held"> {
  const seat = snapshot.seats.find((row) => row.seat_index === snapshot.game.active_seat);
  /**
   * A frame already up is refused, not re-opened.
   *
   * `holdOverflow` is idempotent — it will not stack a copy of itself — so on a
   * table that is already waiting it answers `{}`, and without this the pass
   * read that as "nobody is over" and went ahead. `passTurn` writes
   * `only(startTurn())`, so the turn moved on *and* the frame was thrown away
   * with the rest of the stack: the one thing the table was waiting for,
   * deleted by the button it was blocking.
   */
  if (!command.force) {
    refuseWhileOverflow(snapshot, seat?.id ?? null);

    const held = holdOverflow(snapshot);
    if (held.game) return { writes: held, result: "held" };

    if (seat) refuseWhileBeastAwaits(snapshot, seat.id);
  }
  return { writes: passTurn(snapshot, command.force), result: "passed" };
}
