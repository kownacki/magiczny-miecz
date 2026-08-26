import { describe, expect, it } from "vitest";
import { scriptedRandom } from "@/lib/engine/ports";
import { aSeat, aTable, ports } from "../fixture";
import { fightBeast } from "./beast";

/** The four dice, in the order the command asks for them. */
const dice = (kind: number, strength: number, mine: number, its: number) =>
  ports({ random: scriptedRandom([kind, strength, mine, its]) });

const table = (over: Parameters<typeof aSeat>[0] = {}) =>
  aTable({ game: { active_seat: 0 }, seats: [aSeat({ seat_index: 0, ...over })] });

describe("Bestia (14.7, 22)", () => {
  it("ends the game when the character wins", async () => {
    const { writes } = await fightBeast(table({ miecz_own: 15 }), undefined, dice(1, 1, 6, 1));
    expect(writes.game).toMatchObject({ status: "finished", turn_state: { phase: "koniec" } });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "zwyciestwo",
      payload: { kind: "zwykla", beastTotal: 10, rolls: { kindDie: 1, strengthDie: 1 } },
    });
  });

  it("costs two Życia to lose, not one", async () => {
    const { writes } = await fightBeast(table({ miecz_own: 2, zycie: 4 }), undefined, dice(1, 1, 1, 6));
    expect(writes.journal?.[0]).toMatchObject({ kind: "bestia-porazka" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { zycie: 2 } }]);
  });

  it("kills a character who cannot afford the two", async () => {
    const { writes } = await fightBeast(table({ miecz_own: 2, zycie: 2 }), undefined, dice(1, 1, 1, 6));
    expect(writes.journal?.map((line) => line.kind)).toContain("smierc");
  });

  it("costs nothing on a draw, and does not end the game", async () => {
    const { writes } = await fightBeast(table({ miecz_own: 10 }), undefined, dice(1, 1, 3, 3));
    expect(writes.journal).toEqual([
      expect.objectContaining({ kind: "bestia-remis", payload: { kind: "zwykla", beastTotal: 10 } }),
    ]);
    expect(writes.seats).toBeUndefined();
    expect(writes.game).toBeUndefined();
  });

  /** 4-6 on the first die makes it a magical fight, which reads Magia (18.2a). */
  it("weighs Magia when the first die makes it magical", async () => {
    const magical = table({ miecz_own: 99, magia_own: 15 });
    const { writes } = await fightBeast(magical, undefined, dice(4, 1, 6, 1));
    expect(writes.journal?.[0]).toMatchObject({ kind: "zwyciestwo", payload: { kind: "magiczna" } });

    // The same dice with the Magia too low lose it, which is what proves Miecz
    // was not the number being read.
    const weak = table({ miecz_own: 99, magia_own: 1 });
    const lost = await fightBeast(weak, undefined, dice(4, 1, 6, 1));
    expect(lost.writes.journal?.[0]).toMatchObject({ kind: "bestia-porazka" });
  });

  it("asks for exactly four dice", async () => {
    const random = scriptedRandom([1, 1, 3, 3]);
    await fightBeast(table({ miecz_own: 10 }), undefined, ports({ random }));
    await expect(random.rollD6("a fifth")).rejects.toThrow(/exhausted/);
  });
});
