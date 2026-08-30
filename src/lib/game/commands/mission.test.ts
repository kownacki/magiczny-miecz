import { only } from "@/lib/engine/stack";
import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFieldOffer } from "./effects";
import { claimMission } from "./friends";
import { resolveFight } from "./fight";
import { statusesOf } from "./turn";
import { missionOf } from "@/lib/engine/status";
import { asSeatCharacter } from "@/lib/engine/characters";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";

/**
 * The Władca Twierdzy's errand — the only rule on the board that outlives the
 * turn it started in.
 *
 * Every other Obszar settles where you stand. This one sends you away, waits,
 * and pays out on a later visit: "Władca Twierdzy może wyznaczyć ci misję ...
 * Po wypełnieniu misji, Władca ofiaruje ci Tarczę Tolimana." And the Tarcza is
 * the key to the Zamek Bestii, so it is a route to winning rather than an
 * errand for its own sake.
 */

const TWIERDZA = "twierdza-strzegaca-drog" as FieldId;

const standing = (field: FieldId, gold = 0) =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field", fieldId: field, from: null, draw: 0, drawn: [], resolved: [],
      } as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a",
        character_id: asSeatCharacter("awanturnik"),
        field_id: field,
        gold,
        sword_own: 20,
      }),
    ],
  });

/** Takes the errand the given face assigns. */
const accept = async (die: number, gold = 0) => {
  const table = standing(TWIERDZA, gold);
  const out = await resolveFieldOffer(
    table,
    { offerName: "Misja", decided: {}, shuffle: (items) => [...items] },
    ports({ random: scriptedRandom([die]) }),
  );
  return { after: apply(table, out.writes), said: out.result.did.join("; ") };
};

/** A fight already won, as the dice would have left it. */
const havingWon = (table: ReturnType<typeof standing>, foe: string, opponentSeat?: number) =>
  apply(table, {
    seats: [{ id: "seat-a", patch: { field_id: "wrzosowiska" } }],
    game: {
      turn_state: only({
        phase: "fight",
        fight: {
          cardId: foe,
          cardName: foe.toUpperCase(),
          kind: "ordinary",
          enemyTotal: 3,
          playerTotal: 20,
          playerRoll: 6,
          enemyRoll: 1,
          result: { outcome: "wygrana" },
          fieldId: "wrzosowiska",
          draw: 1,
          drawn: [],
          fought: [foe],
          ...(opponentSeat !== undefined ? { opponentSeat } : {}),
        },
      } as unknown as TurnPhase),
    },
  });

const settle = async (table: ReturnType<typeof standing>) => {
  const out = await resolveFight(table, undefined as never, ports({ random: scriptedRandom([1, 1, 1, 1]) }));
  return apply(table, out.writes);
};

describe("taking the Władca's errand", () => {
  it("reads which errand off the die", async () => {
    expect((await accept(1)).said).toMatch(/pokonaj Wroga/);
    expect((await accept(2)).said).toMatch(/pokonaj inną Postać/);
    expect((await accept(3)).said).toMatch(/pokonaj inną Postać/);
    expect((await accept(4)).said).toMatch(/3 Sztuki Złota/);
    expect((await accept(5)).said).toMatch(/3 Sztuki Złota/);
    expect((await accept(6)).said).toMatch(/2 Sztuki Złota/);
  });

  /** "może wyznaczyć" and "jeżeli się zdecydowałeś" — optional twice over. */
  it("is never pressed on a passer-by", () => {
    expect(compulsoryOffer(TWIERDZA, [])).toBeNull();
  });
});

describe("finishing it, which happens somewhere else", () => {
  it("marks the Wróg errand done on a won fight, and leaves you where you are", async () => {
    const { after } = await accept(1);
    const done = await settle(havingWon(after, "cyklop"));
    expect(missionOf(statusesOf(done, "seat-a"))?.done).toBe(true);
    expect(done.seats[0].field_id).toBe("wrzosowiska");
  });

  /** "po wypełnieniu misji zostaniesz natychmiast przeniesiony do Twierdzy" */
  it("carries you back for the Postać errand, and only that one", async () => {
    const { after } = await accept(2);
    const done = await settle(havingWon(after, "seat:1", 1));
    expect(missionOf(statusesOf(done, "seat-a"))?.done).toBe(true);
    expect(done.seats[0].field_id).toBe(TWIERDZA);
  });

  it("does not count the wrong kind of victory", async () => {
    const one = await accept(1);
    const wrog = await settle(havingWon(one.after, "seat:1", 1));
    expect(missionOf(statusesOf(wrog, "seat-a"))?.done).toBe(false);

    const two = await accept(2);
    const postac = await settle(havingWon(two.after, "cyklop"));
    expect(missionOf(statusesOf(postac, "seat-a"))?.done).toBe(false);
  });
});

describe("collecting the Tarcza", () => {
  it("refuses anywhere but the Twierdza", async () => {
    const { after } = await accept(1);
    const away = apply(after, { seats: [{ id: "seat-a", patch: { field_id: "wrzosowiska" } }] });
    expect(() => claimMission(away, {})).toThrow(/Władca czeka w Twierdzy/);
  });

  it("refuses an errand that is not finished", async () => {
    const { after } = await accept(1);
    expect(() => claimMission(after, {})).toThrow(/Najpierw pokonaj Wroga/);
  });

  /**
   * "przyniesiesz 3 Sz. Z. (odłóż je)" — a delivery, so the coins leave the
   * purse at the counter rather than being merely shown.
   */
  it("takes the gold the errand named, and gives the Tarcza", async () => {
    const { after } = await accept(6, 5);
    const out = claimMission(after, {});
    const done = apply(after, out.writes);

    expect(done.seats[0].gold).toBe(3);
    expect(done.holdings.map((h) => h.card_id)).toContain("tarcza-tolimana");
    expect(missionOf(statusesOf(done, "seat-a"))).toBeNull();
  });

  it("refuses when the purse is short", async () => {
    const { after } = await accept(4, 1);
    expect(() => claimMission(after, {})).toThrow(/Władca chce 3/);
  });

  it("pays out a finished fighting errand", async () => {
    const { after } = await accept(2);
    const done = await settle(havingWon(after, "seat:1", 1));
    const out = claimMission(done, {});
    expect(apply(done, out.writes).holdings.map((h) => h.card_id)).toContain("tarcza-tolimana");
  });

  it("refuses when there is no errand at all", () => {
    expect(() => claimMission(standing(TWIERDZA), {})).toThrow(/Nie masz misji/);
  });
});
