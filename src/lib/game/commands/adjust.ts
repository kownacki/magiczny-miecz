/** The manual override, and the card paths that borrow it: moving one tracked number and saying so. */

import { apply, merge, type Outcome, type Snapshot } from "../change";
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
  record?: { kind: string; manual: boolean };
}

export function adjustSeat(snapshot: Snapshot, command: Adjustment): Outcome<void> {
  const seat = seatById(snapshot, command.seatId);
  const record = command.record ?? { kind: "korekta", manual: true };

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
  const next = Math.max(floor, current + command.delta);

  const writes = {
    seats: [{ id: seat.id, patch: { [column]: next } }],
    journal: [
      {
        seatId: seat.id,
        turn: snapshot.game.turn,
        kind: record.kind,
        payload: { stat: command.stat, delta: command.delta, from: current, to: next, reason: command.reason },
        manual: record.manual,
      },
    ],
  };

  if (command.stat !== "zycie" || next !== 0 || seat.eliminated) {
    return { writes, result: undefined };
  }
  // Correcting somebody down to nothing kills them, exactly as losing the last
  // point in a fight does — and the death is decided against a table that
  // already shows the zero.
  return {
    writes: merge(writes, killSeat(apply(snapshot, writes), seat.id)),
    result: undefined,
  };
}
