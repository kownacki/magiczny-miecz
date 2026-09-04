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

// Type-only: erased at build, so none of these pull `turnStore`, the
// commands or Supabase into a bundle that imports this file — see `Reply`.
import type { TurnReplies } from "./actions/turn";
import type { HoldingsReplies } from "./actions/holdings";
import type { LeaveResult } from "./commands/lobby";
import type { Removed } from "./commands/withdraw";

/**
 * Every action the turn route runs — the keys of `actions/turn.ts`.
 *
 * A list rather than a union written out, so the table is a `Record` over it:
 * a name here with no entry there is a compile error, and so is an entry the
 * list does not name. The client's `post` is typed against it too.
 */
export const TURN_ACTIONS = [
  "roll",
  "move",
  "draw",
  "fight",
  "fight-total",
  "fight-roll",
  "attack",
  "claim",
  "free",
  "ask",
  "pay",
  "friend-heal",
  "friend-part",
  "raid",
  "cross",
  "bridge",
  "guardian",
  "guardian-strength",
  "ferry",
  "escape",
  "most-pole",
  "beast",
  "spell-claim",
  "spell-release",
  "fight-done",
  "pole-tabela",
  "karta-efekt",
  "answer",
  "end",
] as const;
export type TurnAction = (typeof TURN_ACTIONS)[number];

/** Every action the holdings route runs — the keys of `actions/holdings.ts`. */
export const HOLDINGS_ACTIONS = [
  "take",
  "take-field",
  "take-gold",
  "drop",
  "use",
  "order",
  "buy",
  "sell",
  "heal-paid",
  "equip",
  "cast",
  "settle-spell",
  "spell",
  "wand-spell",
  "endless-stock",
  "nature",
  "heal",
  "stone",
  "trade",
] as const;
export type HoldingsAction = (typeof HOLDINGS_ACTIONS)[number];

/** The token is added by `post` and read by every route, so it is not written per route. */
export interface Requests {
  adjust: { seatId: string; stat: string; delta: number; fieldId: string; reason: string };
  bye: Record<never, never>;
  character: { seatId: string; characterId: string; again: boolean; deal: boolean };
  debug: { action: string; seatId: string; cardId: string; fieldId: string; line: string };
  holdings: {
    action: HoldingsAction;
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
   * „I am about to do this" — the three seconds before a decision is sent.
   *
   * Nothing is written and nothing is read back: the route repeats it to the
   * table over Realtime and forgets it (`tellTable`). An empty `kind` is the
   * cancel, which has to travel too — a watcher who was shown a decision has to
   * be shown it being taken back, and at the same moment rather than after a
   * timeout of its own.
   *
   * `option` is only ever an index into a list every device is already drawing.
   * See `intentText.ts` for why it is a number and not the words.
   */
  intent: { kind: string; option: number };
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
    action: TurnAction;
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
    /** A die the table reports, or null where the app is to throw it. */
    value: number | null;
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

/**
 * Which action name a route's body carries, for the two routes dispatched by
 * one — see `actions/shape.ts`. Everything else does one thing per route, so
 * there is nothing here to narrow.
 */
export type ActionOf<R extends Route> = R extends "turn"
  ? TurnAction
  : R extends "holdings"
    ? HoldingsAction
    : never;

/**
 * `join`'s reply, flattened rather than the three-way discriminated union
 * `join/route.ts` actually sends.
 *
 * Which fields are set depends on whether `resume` was asked and whether it
 * found anybody: `resumed`/`live` only answer a resume, and a resume that
 * found nobody stops there — no `userId`, no `token`. Modelling the three
 * shapes precisely would buy nothing here, because nothing on the client reads
 * this beyond the token a seated caller gets, so every field is optional and
 * `token` is the one to trust when it is there.
 */
type JoinReply = {
  resumed?: boolean;
  live?: boolean;
  userId?: string;
  name?: string | null;
  seatIndex?: number | null;
  token?: string;
};

/**
 * What a route answers, read off what it actually sends rather than
 * hand-copied.
 *
 * `turn` and `holdings` are dispatched by action name (`actions/shape.ts`), so
 * their replies come from `TurnReplies`/`HoldingsReplies` — type-only imports
 * of the action tables, which vanish at build and never pull `turnStore` or
 * the commands into a client bundle (verify with `npm run build` after
 * touching this). `A` narrows the reply to the one action named; left off, it
 * is every reply the route can give.
 *
 * Every other route does one thing, so its whole reply is named here by hand
 * against the route file that answers it. `bye` and `intent` are not among
 * them for the reason `use-table.ts` never spends this on them: both go
 * around `post` entirely — `bye` on `navigator.sendBeacon`, `intent` on a bare
 * `fetch` — and both answer an empty 204 rather than JSON, so there is
 * nothing here worth being honest about beyond the harmless default.
 */
export type Reply<R extends Route, A extends ActionOf<R> = ActionOf<R>> = R extends "turn"
  ? TurnReplies[A & TurnAction]
  : R extends "holdings"
    ? HoldingsReplies[A & HoldingsAction]
    : R extends "join"
      ? JoinReply
      : R extends "leave"
        ? LeaveResult
        : R extends "withdraw"
          ? Removed
          : R extends "debug"
            ? { ok: true } | { said: string }
            : { ok: true };
