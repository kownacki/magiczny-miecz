/** The four steps every route takes before it does anything: find the table, read the body, prove the seat, and answer a refusal properly. */

import { NextResponse } from "next/server";
import { bodyOf, type Body, type Route } from "@/lib/game/requests";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import type { GameRow, SeatRow, UserRow } from "@/lib/game/store";

/** Whoever is holding the token: the person, and the seat they drive if any. */
export interface Actor {
  user: UserRow;
  seat: SeatRow | null;
}

export interface RouteContext<R extends Route> {
  game: GameRow;
  actor: Actor;
  body: Body<R>;
}

/**
 * CONTEXT.md says what a route handler is: "does the I/O and nothing else —
 * find the game, prove the seat, ask for a **Permission**, run a **Command** or
 * build an **Envelope**." That was a description of fourteen files rather than
 * a module, and each of them wrote the first two steps out again — "Nie ma
 * takiego stołu." appears sixteen times in the tree and "Nieznane miejsce."
 * ten.
 *
 * The repetition was cheap; the divergence was not, and it was invisible. Only
 * `turn` asks `mayAct`, `start` hand-rolls its own `is_host` check, `host`
 * catches the throw and maps it to a 403 itself instead of using `refused`, and
 * `debug` invented a `mustBeSeated()`. Nothing made a new route ask a
 * Permission at all, because there was no shape for one to be missing from.
 *
 * What is shared is the skeleton and the refusal, not the Permission: which
 * one a verb needs is the verb's own business and stays written in its own
 * file, where a reader can see it. This makes it the *only* thing left in a
 * route that is not plumbing.
 *
 * Two routes are deliberately not built on this. `join` runs before anybody has
 * a token — proving a seat is what it is for — and `journal` is a GET that
 * reads its token off the query string and works perfectly well for somebody
 * watching with no seat at all.
 */
export async function handle<R extends Route>(
  request: Request,
  params: Promise<{ code: string }>,
  route: R,
  run: (ctx: RouteContext<R>) => Promise<unknown>,
): Promise<NextResponse> {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, route);
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    const said = await run({ game, actor, body });
    // A route that answers nothing has succeeded, which is what `{ ok: true }`
    // meant at each of these by hand. One that answers a NextResponse has
    // something particular to say and says it.
    if (said instanceof NextResponse) return said;
    return NextResponse.json(said ?? { ok: true });
  } catch (error) {
    return refused(error);
  }
}
