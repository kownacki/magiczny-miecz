import { NextResponse } from "next/server";
import { findGame, journalRows, seatsFor, verifySeat } from "@/lib/game/store";
import { journalLines, type JournalEntry } from "@/lib/engine/journalText";
import { asJournalKind } from "@/lib/engine/journal";

/** How many rows to read back. A long game runs to hundreds; a feed needs the tail. */
const WINDOW = 120;

/**
 * What happened, as the table is allowed to read it.
 *
 * The rendering happens HERE and not in the browser. `moves` is the complete
 * private record — it exists so that when the app and the board disagree you can
 * see what the app thought — and some of what it holds is nobody else's
 * business (9.3). A device is sent finished sentences, never the rows, so there
 * is nothing on the wire to un-hide.
 *
 * `after` lets a client ask only for what it has not seen. It is a sequence
 * number, not a timestamp, because `seq` is what orders a game's history and
 * clocks at a table disagree.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const afterRaw = Number(url.searchParams.get("after") ?? "0");
  const after = Number.isFinite(afterRaw) ? Math.max(0, Math.trunc(afterRaw)) : 0;

  // A seat is not required: somebody watching the table sees the same public
  // record everyone at it can see. Holding one only decides whose lines could
  // ever be privileged, which today is nobody's.
  const seat = token ? await verifySeat(game.id, token) : null;
  const seats = await seatsFor(game.id);

  const data = await journalRows(game.id, { after, limit: WINDOW });

  // The one place a stored `kind` becomes a `JournalKind`, so nothing
  // downstream has to wonder. A row written by a version that knew a kind this
  // one does not is dropped rather than rendered as a blank: the journal is
  // opened to settle arguments, and a line with no sentence settles none.
  const entries: JournalEntry[] = (data ?? []).flatMap((row) => {
    const kind = asJournalKind(row.kind);
    if (!kind) return [];
    return [
      {
        seq: row.seq as number,
        seatId: (row.seat_id as string | null) ?? null,
        turn: row.turn as number,
        kind,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        manual: Boolean(row.manual),
      },
    ];
  });

  // Read newest-first so the window is the tail of a long game, then flipped:
  // the feed reads downwards like anything else written in order.
  return NextResponse.json({
    lines: journalLines(entries.reverse(), seats.map((row) => ({
      id: row.id,
      seatIndex: row.seat_index,
      playerName: row.player_name,
      characterId: row.character_id,
    })), seat?.id ?? null),
  });
}
