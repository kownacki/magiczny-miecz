import { NextResponse } from "next/server";
import { isFailure } from "@/lib/game/failure";

/**
 * The one answer every route gives when something went wrong.
 *
 * Two different things used to come back identically — a 400 with a message —
 * and a device could not tell them apart. "To nie twoja tura" is the rules
 * working, and belongs next to the button that was pressed. `commit(moves):
 * duplicate key value violates unique constraint` is not the rules at all, is
 * not the player's fault, and belongs where the person building this can see
 * it.
 *
 * So a failure says so, and takes a 500 with it, which is what it always was.
 * Everything else keeps the 400 it had: refusing is the ordinary case, and the
 * ordinary case does not have to announce itself.
 */
export function refused(error: unknown): NextResponse {
  const message = (error as Error)?.message ?? "Coś poszło nie tak.";
  return isFailure(error)
    ? NextResponse.json({ error: message, failure: true }, { status: 500 })
    : NextResponse.json({ error: message }, { status: 400 });
}
