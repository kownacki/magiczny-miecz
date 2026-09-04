/** Pins what a route answers to what its `run` actually returns — see `RepliesOf` and `Reply`. */

import { describe, expectTypeOf, it } from "vitest";
import type { TurnReplies } from "./turn";
import type { HoldingsReplies } from "./holdings";
import type { Reply } from "../requests";

/**
 * These are type-level assertions: `expectTypeOf` runs at compile time and
 * `it` never executes anything worth watching run, so each case is one line.
 * What breaks these is a `run` whose return type changed shape — which is
 * exactly the drift `RepliesOf` exists to catch, one action at a time, rather
 * than at every call site that reads a reply.
 */
describe("what an action's reply actually is", () => {
  it("friend-heal answers how much healed (17.9's cousin, 2.6)", () => {
    expectTypeOf<TurnReplies["friend-heal"]>().toEqualTypeOf<{ healed: number }>();
  });

  it("spell answers the Zaklęcie drawn, or none left to draw", () => {
    expectTypeOf<HoldingsReplies["spell"]>().toEqualTypeOf<{ spellId: string | null }>();
  });

  it("a run with nothing to say answers { ok: true } on the wire", () => {
    // `guardian` fights whatever is blocking the way and reports nothing of
    // its own — `fightGuardian`'s `run` resolves `void`, which is exactly the
    // case `RepliesOf` maps to what `handle.ts` actually answers.
    expectTypeOf<TurnReplies["guardian"]>().toEqualTypeOf<{ ok: true }>();
  });
});

describe("what a route answers, off the wire", () => {
  it("turn/holdings narrow to the one action named", () => {
    expectTypeOf<Reply<"turn", "friend-heal">>().toEqualTypeOf<{ healed: number }>();
    expectTypeOf<Reply<"holdings", "spell">>().toEqualTypeOf<{ spellId: string | null }>();
  });

  it("join answers a claim token, for the caller who reads one", () => {
    expectTypeOf<Reply<"join">>().toHaveProperty("token");
  });
});
