/** The manual override, and the card paths that borrow it: moving one tracked number and saying so. */

import { apply, merge, type Outcome, type Snapshot } from "../change";
import type { JournalKind } from "@/lib/engine/journal";
import { killSeat } from "./life";
import { seatById } from "./seat";

export const ADJUSTABLE = {
  miecz: "miecz_own",
  magia: "magia_own",
  zycie: "zycie",
  zloto: "zloto",
  // Turns owed. Spent one per pass in `passTurn`, so "tracisz 1 turę" costs
  // exactly one trip round the table.
  tury: "turns_lost",
} as const;

export type Adjustable = keyof typeof ADJUSTABLE;

/**
 * The hard ceiling on every tracked number, `force` included.
 *
 * Nothing in the box comes within two orders of magnitude of it: the strongest
 * Wróg has a Miecz of 10, the richest field pays a few Sztuk Złota, and a
 * character walks the whole board on four points of Życie. So this can only
 * ever catch a typo — `gold +50000` where `+5` was meant — or a test reaching
 * for a number to see what the interface does with it. `force` lifts the rule
 * under own points; it does not lift arithmetic.
 */
export const CEILING = 999;

export interface Adjustment {
  seatId: string;
  stat: Adjustable;
  delta: number;
  reason: string | null;
  /**
   * How to file it.
   *
   * The default is what this was built for: a human overruling the referee, and
   * the journal draws those differently and says "korekta". A card doing what
   * the card says is the opposite of that, so the card paths pass their own
   * kind and leave the manual flag alone.
   */
  record?: { kind: JournalKind; manual: boolean };
  /**
   * Push past the floor 1.3 and 2.3 put under own points.
   *
   * The test console's, and nobody else's. Reaching a character weaker than the
   * one on the card is otherwise impossible by design — the floor is the
   * starting value, and no card in the box lowers it — so testing what a Miecz
   * of 1 does meant picking a different Postać and playing it up to the state
   * you wanted. Zero is still the bottom: a negative Miecz is not a weaker
   * character, it is a number nothing in the game knows how to read. And
   * `CEILING` is still the top — this lifts a rule, not arithmetic.
   */
  force?: boolean;
}

/** What a `korekta` or a card's points actually did, which the floor may cut. */
export interface Adjusted {
  /** What the number moved by. Zero when the floor swallowed the whole of it. */
  moved: number;
  /** Where it ended up. */
  to: number;
  /**
   * The floor the rule puts under this parameter — the character's starting
   * Miecz or Magia (1.3, 2.3), or nothing for Życie and Złoto.
   *
   * Handed back because whoever reports the change cannot work out from `to`
   * alone whether the number stopped at the rule's floor or at where it already
   * was, and those are two different sentences.
   */
  floor: number;
}

export function adjustSeat(snapshot: Snapshot, command: Adjustment): Outcome<Adjusted> {
  const seat = seatById(snapshot, command.seatId);
  const record = command.record ?? { kind: "override", manual: true };

  const column = ADJUSTABLE[command.stat];
  // An unrecognised stat used to update a column called `undefined`, which
  // PostgREST accepts as an empty patch — so a typo in a correction returned
  // ok and changed nothing, which is the worst possible answer for a manual
  // override.
  if (!column) throw new Error(`Nie ma takiej wartości do korekty: ${command.stat}`);

  const current = seat[column] as number;
  // Rules 1.3 and 2.3: own Miecz and Magia can never be pushed below the value
  // the character started with. Życie and Złoto simply floor at zero.
  const floor =
    command.stat === "miecz"
      ? seat.miecz_floor
      : command.stat === "magia"
        ? seat.magia_floor
        : 0;

  /**
   * A bound stops movement in one direction. It does not move the value.
   *
   * "Magia nie spada poniżej 3" is a rule about going down, not a statement
   * that the number is at least 3 — and the difference only shows once
   * something has put it below, which only `force` can. Clamping to the range
   * then dragged it back *up*: at 1, an ordinary +1 landed on 3, reported as
   * "+2, not +1 — magia stops at 3", which is a floor being described as a
   * ceiling while adding two points nobody asked for.
   *
   * So the floor that applies is whichever is lower, the rule's or where the
   * number already is. Below the rule's floor you may climb freely and may not
   * sink further; the moment you reach it, it latches and behaves as it always
   * did. `force` takes it down to zero, and zero is the bottom either way.
   *
   * The ceiling is the same arrangement upside down, and never bites, because
   * nothing can be above it to begin with.
   */
  const low = command.force ? 0 : Math.min(floor, current);
  const high = Math.max(CEILING, current);
  const next = Math.min(high, Math.max(low, current + command.delta));
  const moved = next - current;

  const writes = {
    seats: [{ id: seat.id, patch: { [column]: next } }],
    journal: [
      {
        seatId: seat.id,
        turn: snapshot.game.turn,
        kind: record.kind,
        // `from` and `to` alongside `delta`, so a reader can see that what was
        // asked for and what happened are not the same number. The journal is
        // the record of a game, and a point the floor refused is still an event
        // — a card that took a Magia off a character that had none to give
        // happened, and reads as nothing at all if only the delta is kept.
        payload: {
          stat: command.stat,
          delta: command.delta,
          from: current,
          to: next,
          reason: command.reason,
          ...(command.force ? { forced: true } : {}),
          // Only where something was cut, and only then, because it is the
          // one fact the sentence cannot work out for itself: whether the
          // number stopped at the rule's floor or at where it already was.
          ...(moved === command.delta ? {} : { floor }),
        },
        manual: record.manual,
      },
    ],
  };

  if (command.stat !== "zycie" || next !== 0 || seat.eliminated) {
    return { writes, result: { moved, to: next, floor } };
  }
  // Correcting somebody down to nothing kills them, exactly as losing the last
  // point in a fight does — and the death is decided against a table that
  // already shows the zero.
  return {
    writes: merge(writes, killSeat(apply(snapshot, writes), seat.id)),
    result: { moved, to: next, floor },
  };
}
