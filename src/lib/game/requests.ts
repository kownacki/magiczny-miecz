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
    /** `take-gold`: how many Sztuki Złota off the Obszar (12.1). */
    gold: number;
    holdingId: string;
    holdingIds: string[];
    /**
     * `trade`: which trofea to hand in (1.4). Absent means all of them, which
     * is what a player cashing out is usually after — see `tradeTrophies`.
     */
    cardIds: string[];
    /**
     * `trade`: how many Miecze to buy, instead of naming the Karty.
     *
     * The engine picks the cheapest set that reaches it (`offersFor`), which is
     * the arithmetic 1.4 leaves to the player and nobody wants to do on paper.
     * Takes second place to `cardIds` — a named list is an explicit answer.
     */
    swords: number;
    slot: string | null;
    nature: string;
    note: string;
    /**
     * `cast`: aimed at the creature in the fight in progress.
     *
     * "Na inną Postać lub Wroga", where the Wróg is the one standing opposite
     * rather than one lying on an Obszar — which may be no row on the board at
     * all. The frame identifies it; see `CastSpell.target`.
     */
    foeInFight: boolean;
    points: number;
    targetSeat: number;
    /**
     * `cast`: the Obszar a Zaklęcie is thrown at, for the one card that is.
     *
     * „Na Obszar w Kręgu, po którym wędrujesz" — the Władca Gromu. Distinct
     * from `fieldCardId`, which names a Karta lying on a square rather than the
     * square itself.
     */
    fieldId: string;
    /**
     * `cast`: where the Karta a Zaklęcie moves is to be put down.
     *
     * „Na inny Obszar w tym samym Kręgu" — the Władca Zdarzeń, and the only
     * question any Zaklęcie in the box asks its caster. A cast that arrives
     * without it is refused rather than spent, so this is what the second
     * attempt carries.
     */
    destination: string;
    /**
     * `settle-spell`: nobody is going to answer, so let it happen now.
     *
     * A Zaklęcie waits in the air while somebody could answer it (9.6), and the
     * window closes on a clock. This is the table saying so out loud instead of
     * waiting the clock out.
     */
    force: boolean;
    /** `endless-stock`: which way. Only `true` is accepted — see the command. */
    on: boolean;
  };
  host: { userId: string };
  /**
   * `name` is nullable because sitting down without giving one is a thing to
   * do — `join/route.ts` reads it as `typeof body.name === "string" &&
   * body.name.trim() ? … : null` and has always accepted it. It was typed
   * `string` here and three call sites sent null anyway, which nothing caught
   * because all three went round `post` with a hand-written `fetch`.
   */
  join: { name: string | null; deviceId: string | null; seatId: string; resume: boolean };
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
  settings: { eqMode: string; endlessStock: boolean; trophyMode: string };
  start: Record<never, never>;
  turn: {
    action: string;
    /**
     * `fight-done`: what the winner of a duel takes (17.9) — "zycie", "zloto"
     * or "przedmiot", with `spoilsHoldingId` naming the one they point at.
     * Absent means the Życie, which is what every surface took before any of
     * them could ask.
     */
    spoils: string;
    spoilsHoldingId: string;
    beastRoll: number;
    cardClass: string;
    cardId: string;
    cardIds: string[];
    choices: unknown;
    /**
     * `answer`: which option of an `ask` frame, by position.
     *
     * What tells the two answerable frames apart — a number here is the
     * question printed on a Charakterystyka (the Chochlik's two Zaklęcia),
     * anything else is the suspended Karta's own `choices`.
     */
    choice: number;
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
