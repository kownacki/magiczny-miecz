import { describe, expect, it } from "vitest";
import { overflowLines } from "./consoleLines";
import { aTable, aSeat, aUser, aHolding } from "./fixture";
import { openOverflow } from "@/lib/engine/overflow";
import { asTurnState } from "@/lib/engine/stack";

/**
 * The surplus, and the ways out of it, as the console prints them.
 *
 * The verb and the parenthetical are two different facts and were read off one
 * field: everything shed said „(na Obszar)", which is true of a Przedmiot and
 * false of the only card the rulebook is strict about. A Zaklęcie goes to the
 * stos Kart już zużytych (9.6) — 12.1 lists złoto, Przedmioty and Przyjaciół
 * and no Zaklęcia, so one left on a field would be a card nobody could take.
 */
function table(holdings: ReturnType<typeof aHolding>[], magia: number, what: "przedmioty" | "zaklecia") {
  const seat = aSeat({ id: "seat-a", seat_index: 0, magic_own: magia, sword_own: 2 });
  const base = aTable({
    seats: [seat],
    users: [aUser({ seat_index: 0, name: "Ania" })],
    holdings: holdings.map((one) => ({ ...one, seat_id: "seat-a" })),
  });
  return {
    ...base,
    game: {
      ...base.game,
      turn_state: openOverflow(asTurnState({ phase: "roll" }), {
        phase: "overflow",
        seatId: "seat-a",
        what,
      }),
    },
  };
}

describe("overflowLines", () => {
  it("says where a Zaklęcie goes, and it is not the Obszar", () => {
    const lines = overflowLines(
      table(
        [
          aHolding({ id: "h-1", card_id: "fatum", kind: "spell" }),
          aHolding({ id: "h-2", card_id: "blyskawica", kind: "spell" }),
        ],
        1,
        "zaklecia",
      ),
    );
    const ways = lines.filter((line) => line.includes("fatum") || line.includes("blyskawica"));
    expect(ways.length).toBeGreaterThan(0);
    for (const way of ways) {
      expect(way).toContain("odrzuć");
      expect(way).toContain("na stos zużytych");
      expect(way).not.toContain("na Obszar");
    }
  });

  it("says a Przedmiot is put down, in the word the hand uses", () => {
    const lines = overflowLines(
      table(
        [
          aHolding({ id: "h-1", card_id: "miecz" }),
          aHolding({ id: "h-2", card_id: "topor" }),
          aHolding({ id: "h-3", card_id: "helm" }),
          aHolding({ id: "h-4", card_id: "tarcza" }),
          aHolding({ id: "h-5", card_id: "luk" }),
        ],
        2,
        "przedmioty",
      ),
    );
    const dropped = lines.filter((line) => line.includes("upuść"));
    expect(dropped.length).toBeGreaterThan(0);
    for (const way of dropped) expect(way).toContain("na Obszar");
    // „odrzuć" is the other card's word now, and must not appear for these.
    expect(lines.some((line) => line.includes("odrzuć"))).toBe(false);
  });

  it("says nothing at all when nobody is over", () => {
    expect(overflowLines(aTable({ seats: [aSeat({ id: "seat-a", seat_index: 0 })] }))).toEqual([]);
  });
});
