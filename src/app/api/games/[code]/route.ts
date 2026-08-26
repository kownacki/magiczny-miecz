import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import {
  deleteGame,
  fieldCardsFor,
  findGame,
  holdingsFor,
  markSeen,
  seatsFor,
  verifySeat,
} from "@/lib/game/store";
import { AWAY_AFTER_MS } from "@/lib/game/commands/lobby";
import { sweepLobby } from "@/lib/game/lobbyStore";
import { envelopeFor } from "@/lib/game/envelope";
import type { GameRow } from "@/lib/game/store";
import type { TurnPhase } from "@/lib/engine/turn";
import { effectsFor } from "@/lib/game/turnStore";

/**
 * The table view's state.
 *
 * Deliberately carries no claim tokens and no holdings: this is rendered on a
 * screen every player can see, and spells are held concealed under 9.3.
 *
 * A device may pass its own token to be told which seat it owns. That answer
 * comes from the server rather than being worked out in the browser, because
 * the browser is never sent anyone's token — including, in the seat list, its
 * own — so it has nothing to compare against.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  // Everybody in the poczekalnia is polling, so this is where a table finds out
  // that somebody closed their tab — and clears their seat, or itself if there
  // is nobody left.
  if (await sweepLobby(game.id, game.status)) {
    return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get("token");

  // Fetched together rather than one after another. This is the busiest request
  // in the app — every device asks for it every couple of seconds — and these
  // four do not depend on each other, so running them in sequence spent four
  // round trips to make one answer.
  const [mine, seats, holdings, fieldCards, effects] = await Promise.all([
    token ? verifySeat(game.id, token) : Promise.resolve(null),
    seatsFor(game.id),
    holdingsFor(game.id),
    // Face up on the board by rule 16.8, so there is nothing to conceal and
    // every seat is sent the same list.
    fieldCardsFor(game.id),
    // Public too: what somebody is under is exactly what you weigh before
    // deciding whether to attack them.
    effectsFor(game.id),
  ]);

  // Everything the seat views are read off, in the shape a command reads. Not
  // a `loadSnapshot` call: the five lists are already in hand from the fetch
  // above, and this request is the busiest in the app. `journalSeq` is nothing
  // to a reader, which is why it is the only field made up.
  const table = {
    game: game as GameRow & { turn_state: TurnPhase },
    seats,
    holdings,
    fieldCards,
    effects,
    journalSeq: 0,
  };

  // The poll is the heartbeat. A device asking for the state is a device still
  // at the table, so no separate ping is needed — and a seat that stops asking
  // goes quiet by itself, which is the difference between somebody who left and
  // somebody whose tab was closed.
  //
  // Not written on every poll. Presence is judged against AWAY_AFTER_MS, so a
  // timestamp refreshed several times inside that window says nothing new — and
  // writing it anyway meant a row update per device per poll, forever, for a
  // table sitting still. It is also written whenever the page said goodbye, so
  // that a reload cancels it.
  if (mine) {
    const row = seats.find((seat) => seat.id === mine.id);
    const lastSeen = row?.seen_at ? Date.parse(row.seen_at) : 0;
    if (row?.left_at || Date.now() - lastSeen > AWAY_AFTER_MS / 3) await markSeen(mine.id);
  }

  return NextResponse.json(envelopeFor(table, mine?.id ?? null, Date.now()));
}

/**
 * Removes a table for good.
 *
 * See `deleteGame`: unguarded on purpose, because every table here is public
 * and the code is the only lock. The confirmation lives in the interface, where
 * the person doing it can read what it says.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  try {
    await deleteGame(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
