/** One action as the wire names it: how its arguments are read off the body, and what it runs. */

/**
 * Why a table and not a switch.
 *
 * Each route was a `switch (body.action)` of `String()` and `Number()` coercion
 * around one store call, and `turnStore.ts` was seventy functions of which
 * forty-three were one line of `change()`. Adding a verb touched the request
 * shape, the switch, the store and the client, and nothing said which of the
 * four had been forgotten — a verb the switch did not know fell through to
 * „Nieznana akcja" at runtime.
 *
 * Declared once, an action is its coercion and what it runs, side by side, in
 * a `Record` over the route's action list. A name on the list with no entry is
 * a compile error; an entry the list does not name is one too. The client's
 * `post` is typed against the same list, so a button naming an action nobody
 * runs fails the build rather than the table.
 *
 * `from` is the only place a body is read. It coerces and never decides: a
 * seat id off the wire is a string, and whether that seat may do the thing is
 * the command's to refuse. `run` is what the store does today, unchanged.
 */

import type { Body, Route } from "../requests";
import type { GameRow, SeatRow, UserRow } from "../store";

/** What every action may know besides its body: the table, who is pressing, and the seat they drive. */
export interface ActionContext {
  game: GameRow;
  user: UserRow;
  seat: SeatRow;
  /** The shared screen of a companion table, acting for whoever is playing — see `Permission`. */
  tableScreen: boolean;
}

export interface Action<R extends Route, Args, Reply> {
  /** The arguments, off the wire. Throws to refuse a body the route cannot read. */
  from: (body: Body<R>, ctx: ActionContext) => Args;
  /** What it does to the table; the reply is answered as JSON, `undefined` as `{ ok: true }`. */
  run: (gameId: string, args: Args) => Promise<Reply>;
}

/**
 * A route's whole vocabulary, one entry per name on its action list.
 *
 * `any` for the arguments on purpose: each entry's `from` and `run` are checked
 * against each other by the `action` helper below, and the table only has to
 * hold them. Naming the type here would restate every entry's shape twice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Actions<R extends Route, Name extends string> = Record<Name, Action<R, any, unknown>>;

/** Pins one entry's `run` to what its `from` returns, so the two cannot drift. */
export function action<R extends Route>() {
  return <Args, Reply>(one: Action<R, Args, Reply>): Action<R, Args, Reply> => one;
}
