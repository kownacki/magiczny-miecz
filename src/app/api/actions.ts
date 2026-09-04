/** One POST handler for a route whose body names an action: the gate, then the table's entry for it. */

import { NextResponse } from "next/server";
import { handle } from "@/app/api/handle";
import type { Route } from "@/lib/game/requests";
import type { Actions } from "@/lib/game/actions/shape";
import type { Permission } from "@/lib/game/permission";
import type { GameRow, UserRow } from "@/lib/game/store";

/**
 * The Permission a route asks before any of its actions, named where the
 * route is declared so a reader sees it beside the table it guards.
 */
export type Gate<Name extends string> = (
  game: GameRow,
  who: UserRow,
  action: Name,
) => Permission;

/**
 * What every action route did by hand, once.
 *
 * Watching is not acting: a spectator holds a perfectly good token and drives
 * no Postać, which every action is about. Then the route's own gate — `mayAct`
 * for the turn, anybody seated for the holdings — and then the entry, which
 * reads the body and runs. A name the table does not know is refused with the
 * same „Nieznana akcja" the switches used to fall through to.
 */
export function actions<R extends Route, Name extends string>(
  route: R,
  table: Actions<R, Name>,
  gate: Gate<Name>,
) {
  return async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
    return handle(request, params, route, async ({ game, actor, body }) => {
      const seat = actor.seat;
      if (!seat) {
        return NextResponse.json({ error: "Nie prowadzisz żadnej Postaci." }, { status: 403 });
      }
      const name = (body as { action?: unknown }).action;
      // The gate first, and the unknown-action 400 behind it: a seat that may
      // not act must not learn which actions exist. `mayAct` copes with a name
      // off the wire it has never heard of — that is what the wire is.
      const { allowed, tableScreen } = gate(game, actor.user, name as Name);
      if (!allowed) return NextResponse.json({ error: "To nie twoja tura." }, { status: 409 });
      const one = typeof name === "string" ? table[name as Name] : undefined;
      if (!one) return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
      return one.run(game.id, one.from(body, { game, user: actor.user, seat, tableScreen }));
    });
  };
}
