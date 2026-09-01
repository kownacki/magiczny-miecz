import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { scriptFor } from "@/lib/engine/cardScript";
import { pendingIn } from "@/lib/engine/resolve";
import { scriptedRandom } from "@/lib/engine/ports";
import { top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { beginFight, fightRoll } from "./fight";
import { resolveFight } from "./spoils";
import { continueTopScript } from "./effects";

/**
 * ZŁOCZYŃCA, who charges for beating you.
 *
 * "Każdej pokonanej Postaci, Złoczyńca zabiera do wyboru: 1 Sztukę Złota lub
 * jeden Przedmiot (należy odłożyć żeton lub Kartę Przedmiotu)."
 *
 * The toll was encoded as the card's `effect`, which is what a Spotkanie does
 * when you turn it over — so the drawn-card sheet offered "Walcz (Miecz 3)" and
 * "Oddaj 1 Sztukę Złota" side by side, to a player who had not fought him and
 * declinable by one who had lost. It is neither of those things. It is what a
 * loss costs, and `przegrana` is where a card says so.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];
const ZLOCZYNCA = "zloczynca";

const phases = (state: TurnState) => state.stack.map((frame) => frame.phase);

const facing = (foe: string): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: "wrzosowiska",
        from: null,
        draw: 1,
        drawn: [{ cardId: foe, cardClass: "foe" }],
      } as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a", sword_own: 1, life: 4, gold: 3, field_id: asFieldId("wrzosowiska") })],
    holdings: [aHolding({ id: "h-0", card_id: "helm", kind: "item" })],
  });

/** A fight lost: the character's 1 and a 1, against the creature and a 6. */
async function lose(table: Snapshot, foe: string): Promise<Snapshot> {
  let at = apply(table, beginFight(table, { cardIds: [foe] }).writes);
  const dice = ports({ random: scriptedRandom([1, 6, 6, 6, 6, 6]) });
  at = apply(at, (await fightRoll(at, { side: "player" }, dice)).writes);
  at = apply(at, (await fightRoll(at, { side: "enemy" }, dice)).writes);
  return apply(at, (await resolveFight(at, undefined as never, dice)).writes);
}

describe("the toll a creature's card charges", () => {
  it("is not what turning the card over does", () => {
    const script = scriptFor(ZLOCZYNCA)!;
    expect(script.effect).toEqual({ op: "nic" });
    expect(script.przegrana).toBeTruthy();
    // And so the sheet has nothing free-standing to offer.
    expect(pendingIn(script.effect, [])).toBeNull();
  });

  it("asks the loser which, once the fight has closed", async () => {
    const at = await lose(facing(ZLOCZYNCA), ZLOCZYNCA);

    // 17.4's point of Życie is paid, and the question is above the field.
    expect(at.seats[0].life).toBe(3);
    expect(phases(at.game.turn_state)).toEqual(["field", "script"]);
    const frame = top(at.game.turn_state);
    expect(frame.phase === "script" && frame.cardId).toBe(ZLOCZYNCA);
  });

  it("takes the Sztuka Złota when that is what the loser picks", async () => {
    const at = await lose(facing(ZLOCZYNCA), ZLOCZYNCA);
    const done = await continueTopScript(at, { decided: { choices: [0] }, shuffle: asIs }, ports());
    const after = apply(at, done.writes);

    expect(after.seats[0].gold).toBe(2);
    expect(after.holdings).toHaveLength(1);
    expect(phases(after.game.turn_state)).toEqual(["field"]);
  });

  /**
   * Two answers, because 5.6 makes the second one the loser's too: the branch,
   * and then which Przedmiot goes.
   */
  it("takes a Przedmiot when that is", async () => {
    const at = await lose(facing(ZLOCZYNCA), ZLOCZYNCA);
    const done = await continueTopScript(at, { decided: { choices: [1, 0] }, shuffle: asIs }, ports());
    const after = apply(at, done.writes);

    expect(after.seats[0].gold).toBe(3);
    expect(after.holdings).toHaveLength(0);
  });

  /** Every other creature charges nothing beyond 17.4. */
  it("charges nothing for a creature whose card says nothing", async () => {
    const at = await lose(facing("cyklop"), "cyklop");
    expect(at.seats[0].life).toBe(3);
    expect(at.seats[0].gold).toBe(3);
    expect(phases(at.game.turn_state)).toEqual(["field"]);
  });
});
