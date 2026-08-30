import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { pointsAt, heldAbilities } from "@/lib/engine/abilities";
import { scriptedRandom } from "@/lib/engine/ports";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { resolveBridgeOrdeal } from "./bridge";

/**
 * CZARODZIEJSKA KOŚĆ in the two Pułapki (14.5).
 *
 * "Właściciel Kości ma prawo dodać sobie 1 punkt Miecza lub Magii w Pułapce
 * albo Magicznej Pułapce. Może również dodać 1 do każdego wyniku rzutu w
 * pozostałych Obszarach na Kamiennym Moście."
 *
 * The second sentence has always been carried, as a `modyfikator-rzutu` over
 * the seven other bridge fields with the two Pułapki deliberately left out of
 * the list. The first was written into `CARD_NOTES` and into `MANUAL` — twice,
 * in two registers — and applied nowhere: the trap read the seat's flat
 * parametr and consulted no ability at all.
 *
 * They are two different rules and this one is points, not dice. Against three
 * dice and a threshold the two are arithmetically the same, which is exactly
 * why it matters that the card says "punkt Miecza": a rule written as a die
 * shift would be wrong the moment anything else read the number.
 */

const onTheTrap = (field: "pulapka" | "magiczna-pulapka", cards: string[]) =>
  aTable({
    game: { active_seat: 0 },
    seats: [
      aSeat({
        id: "seat-a",
        sword_own: 8,
        magic_own: 8,
        field_id: asFieldId(field),
      }),
    ],
    holdings: cards.map((cardId, at) => aHolding({ id: `h-${at}`, card_id: cardId, kind: "item" })),
  });

/** Three dice, and the fall is by how much they beat the parametr. */
const ordeal = (field: "pulapka" | "magiczna-pulapka", cards: string[], dice: number[]) =>
  resolveBridgeOrdeal(
    onTheTrap(field, cards),
    undefined as never,
    ports({ random: scriptedRandom([...dice, ...Array(12).fill(1)]) }),
  );

describe("the Kość's point, in the Pułapka", () => {
  it("is read off the card, at those two Obszary and nowhere else", () => {
    const kosc = heldAbilities(["czarodziejska-kosc"]);
    expect(pointsAt(kosc, asFieldId("pulapka"))).toBe(1);
    expect(pointsAt(kosc, asFieldId("magiczna-pulapka"))).toBe(1);
    expect(pointsAt(kosc, asFieldId("zamek-bestii"))).toBe(0);
    expect(pointsAt(heldAbilities(["miecz"]), asFieldId("pulapka"))).toBe(0);
  });

  /**
   * Nine against a parametr of 8 is a fall by one. The same nine against 8+1 is
   * no fall at all, which is the whole of what the card buys.
   */
  it("turns a fall by one into no fall at all", async () => {
    // A fall says where it put you down; avoiding it says "uniknieta".
    const bare = await ordeal("pulapka", [], [3, 3, 3]);
    expect(bare.result.to).toBeTruthy();

    const armed = await ordeal("pulapka", ["czarodziejska-kosc"], [3, 3, 3]);
    expect(armed.result.outcome).toBe("uniknieta");
    expect(armed.result.to).toBeUndefined();
  });

  /** The Magiczna Pułapka reads Magia, and the point lands on that instead. */
  it("lands on whichever parametr the trap reads", async () => {
    const armed = await ordeal("magiczna-pulapka", ["czarodziejska-kosc"], [3, 3, 3]);
    expect(armed.result.outcome).toBe("uniknieta");
  });

  /** A big enough throw still throws you off. */
  it("does not make the Kość a floor", async () => {
    const armed = await ordeal("pulapka", ["czarodziejska-kosc"], [6, 6, 6]);
    expect(armed.result.to).toBeTruthy();
  });
});
