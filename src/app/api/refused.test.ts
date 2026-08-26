import { describe, expect, it } from "vitest";
import { refused } from "./refused";
import { Failure } from "@/lib/game/failure";

/**
 * The two kinds of "no", which used to be one.
 *
 * A device has to be able to tell them apart, because they belong in different
 * places: a refusal next to the button that was pressed, in the language the
 * rest of the game speaks, and a failure in the console, which opens itself for
 * it. When both came back as a 400 with a message, neither could go where it
 * belonged.
 */
describe("what a route says when it says no", () => {
  it("keeps the rules' own refusals at 400, unannounced", async () => {
    const answer = refused(new Error("To nie twoja tura."));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: "To nie twoja tura." });
  });

  it("gives a failure the 500 it always was, and says which it is", async () => {
    const answer = refused(new Failure("commit(moves): duplicate key"));
    expect(answer.status).toBe(500);
    expect(await answer.json()).toEqual({
      error: "commit(moves): duplicate key",
      failure: true,
    });
  });

  it("treats anything unrecognisable as a refusal", async () => {
    // The ordinary case, and the safe one: a stray throw shown to a player as
    // a rule they broke is wrong, but a stray throw shown as a broken game is
    // worse — it says the app is untrustworthy when it may only be strict.
    const answer = refused("something that is not an Error at all");
    expect(answer.status).toBe(400);
    expect((await answer.json()).error).toBe("Coś poszło nie tak.");
  });

  it("recognises a Failure that has crossed a module boundary", async () => {
    // `instanceof` fails across bundles; the name survives.
    const impostor = Object.assign(new Error("loadGame: no such row"), { name: "Failure" });
    expect(refused(impostor).status).toBe(500);
  });
});
