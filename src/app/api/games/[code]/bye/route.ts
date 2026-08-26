import { NextResponse } from "next/server";
import { findGame, sayGoodbye, verifyUser } from "@/lib/game/store";

/**
 * "My page is going away."
 *
 * Sent with `navigator.sendBeacon` as the tab closes, which is the only way to
 * get a request out of a page that is being discarded — `fetch` from an unload
 * handler is dropped. The browser promises to queue it and run it to
 * completion after the page is gone.
 *
 * This is not leaving. A reload fires the same event, and from out here the two
 * are identical, so all it does is start a short countdown (`GOODBYE_GRACE_MS`)
 * that the next poll cancels. Without it a closed tab is only noticed when the
 * seat falls silent, which takes minutes because a hidden tab polls at whatever
 * rate the browser feels like.
 *
 * Deliberately cheap and quiet: a beacon's response is thrown away, so there is
 * nothing to say and nobody to say it to.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // sendBeacon cannot set headers, so the body arrives as whatever Blob type
  // the caller gave it. Read it as text and parse by hand.
  const body = await request.text().catch(() => "");
  let token = "";
  try {
    token = String(JSON.parse(body).token ?? "");
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (!token) return new NextResponse(null, { status: 204 });

  const game = await findGame(code.toUpperCase());
  if (!game) return new NextResponse(null, { status: 204 });

  // Whoever holds the token, seated or not: a spectator's tab closing is a
  // person leaving the table, which is exactly what the sweep is looking for.
  const user = await verifyUser(game.id, token);
  if (user) await sayGoodbye(user.id);

  // No revision bump. Nothing has actually changed yet — the countdown may well
  // be cancelled a second later by a reload — and waking every other device to
  // tell them somebody might have left would be worse than telling them
  // nothing.
  return new NextResponse(null, { status: 204 });
}
