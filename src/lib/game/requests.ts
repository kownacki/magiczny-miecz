/** What each route is sent, written once so both ends of the wire agree about it. */

/**
 * Why this exists at all.
 *
 * A route reads `body.userId` off a parsed JSON blob and a browser writes
 * `{ seatId }` into one, and nothing anywhere compares the two. That is not a
 * gap you can reason your way past: it is the same shape as `db` taking any
 * object at all, one layer further out, and it failed the same way.
 *
 * Twice, silently. The roster's "usuń gracza" sent `{ seatId }` to a route that
 * had stopped reading `seatId` — and because `leave` falls back to the caller
 * when nobody is named, **the host pressing it on somebody else kicked
 * themselves**. "Przekaż gospodarza" did the same and handed the role back to
 * whoever already had it. Both compiled. Both ran. Both were wrong in a way
 * only pressing them would show.
 *
 * So the field names live here, once, and both sides are checked against them:
 * the client through `post`, which will not take a body this file does not
 * describe, and the route through `bodyOf`, which will not let it read a field
 * the client cannot send. Rename one and the compiler names every place that
 * has to change.
 *
 * # What this is not
 *
 * Not validation. Every value here is optional and every route still checks
 * what it got, because a body arrives from a browser and a browser is not to be
 * trusted — `String(body.token ?? "")` stays exactly as it was. What is being
 * checked is the *vocabulary*: that both ends are talking about the same
 * fields. A hostile client can still send nonsense; it just cannot be nonsense
 * this app quietly agreed to.
 */

/** The token is added by `post` and read by every route, so it is not written per route. */
export interface Requests {
  adjust: { seatId: string; stat: string; delta: number; fieldId: string; reason: string };
  bye: Record<never, never>;
  character: { seatId: string; characterId: string; again: boolean; deal: boolean };
  debug: { action: string; seatId: string; cardId: string; fieldId: string; line: string };
  holdings: {
    action: string;
    seatId: string;
    cardId: string;
    fieldCardId: string;
    holdingId: string;
    holdingIds: string[];
    slot: string | null;
    nature: string;
    note: string;
    points: number;
    targetSeat: number;
    /** `endless-stock`: which way. Only `true` is accepted — see the command. */
    on: boolean;
  };
  host: { userId: string };
  join: { name: string; deviceId: string | null; seatId: string; resume: boolean };
  /**
   * `standing` is the difference between the two ways out, and the reason this
   * one route serves both: out of the chair, or out of the table. Naming
   * somebody else makes it a kick, which only the host may do.
   */
  leave: { userId: string; standing: boolean };
  seat: { ready: boolean; name: string };
  /**
   * The table's own house rules, while it is still the poczekalnia.
   *
   * Both are answered in the dialog that opens a table today and neither has to
   * be: nobody else has arrived yet, so the fastest clicker settles the variant
   * for everybody. Sent one at a time — each switch posts the one it moved —
   * because a body carrying both would let a stale lobby page put back a
   * setting somebody else had just changed.
   */
  settings: { eqMode: string; endlessStock: boolean };
  start: Record<never, never>;
  turn: {
    action: string;
    beastRoll: number;
    cardClass: string;
    cardId: string;
    cardIds: string[];
    choices: unknown;
    destination: string;
    dice: number[];
    fieldId: string;
    itemRolls: unknown;
    kindRoll: number;
    offer: unknown;
    outcome: string;
    pay: boolean;
    playerRoll: number;
    side: string;
    strengthRoll: number;
    succeeded: boolean;
    targetSeatId: string;
    /** A Wróg left lying on an Obszar, when a raid goes at one of those instead. */
    raidFieldCardId: string;
    /** How much Życie to take back from a friend who mends (KSIĘŻNICZKA, WŁADCA). */
    points: number;
    /** The friend's Karta being given up where she belongs, for gold. */
    holdingId: string;
    total: number;
    value: number;
    viaBridge: boolean;
  };
  /** `hard` bars the Karta for good; without it, it goes back in the pool. */
  withdraw: { seatId: string; hard: boolean };
}

export type Route = keyof Requests;

/**
 * What a route may read.
 *
 * Everything optional, because everything on the wire is: a field the client
 * did not set is missing rather than wrong, and the route decides what to do
 * about that. The token is here because every route reads it and no caller
 * writes it — `post` adds it on the way out.
 */
export type Body<R extends Route> = Partial<Requests[R]> & { token?: string };

/**
 * The body of a request, named by the route it arrived at.
 *
 * The route name is a value rather than a type argument so that reading it is
 * one word and mistyping it is an error rather than a silent `any`.
 */
export async function bodyOf<R extends Route>(request: Request, route: R): Promise<Body<R>> {
  // `route` is read for nothing but its type — it is what picks the shape out
  // of `Requests`, and passing it as a value rather than a type argument is
  // what makes a mistyped route name an error instead of a silent `any`.
  void route;
  return (await request.json().catch(() => ({}))) as Body<R>;
}
