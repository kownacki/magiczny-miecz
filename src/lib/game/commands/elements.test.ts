import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { isMagicalItem } from "@/lib/engine/cards";
import { aHolding, aSeat, aTable, aUser, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { castSpell } from "./spells";
import { pointsOf, seatView } from "./seat";

/**
 * WOJNA ŻYWIOŁÓW, both halves at last.
 *
 * "Żaden gracz, łącznie z tobą, nie będzie mógł używać Zaklęć i **Magicznych
 * Przedmiotów** ani ciągnąć z nich żadnych korzyści, aż do początku twojej
 * następnej tury."
 *
 * The spells half has been live for a while — one status per seat, expiring in
 * each holder's own turns, enforced by `spellsHushed`. The items half could not
 * be built at all, because the deck did not record which Przedmioty are
 * Magiczne; its coverage note said exactly that. It does now, read off the
 * cards' own class band.
 *
 * The distinction the card draws is narrower than the Zaczarowane Wzgórza's,
 * which suspend *every* Przedmiot by the board's own words. Under the Wojna a
 * plain Miecz still cuts.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];

const table = (cards: string[]): Snapshot =>
  aTable({
    game: { active_seat: 0 },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, sword_own: 3, magic_own: 4, field_id: asFieldId("osada") }),
      aSeat({ id: "seat-b", seat_index: 1, sword_own: 2, magic_own: 5, field_id: asFieldId("krag-mocy") }),
    ],
    users: [
      aUser({ id: "u-a", seat_index: 0, name: "Ania" }),
      aUser({ id: "u-b", seat_index: 1, name: "Bartek", is_host: false }),
    ],
    holdings: [
      aHolding({ id: "h-war", seat_id: "seat-a", card_id: "wojna-zywiolow", kind: "spell" }),
      ...cards.map((cardId, at) =>
        aHolding({ id: `h-${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
      ),
    ] as never,
  });

const cast = async (at: Snapshot) =>
  apply(at, (await castSpell(at, { seatId: "seat-a", holdingId: "h-war", shuffle: asIs }, ports())).writes);

describe("what the Wojna Żywiołów suspends", () => {
  it("knows a Magiczny Przedmiot from an ordinary one", () => {
    expect(isMagicalItem("excalibur")).toBe(true);
    expect(isMagicalItem("miecz")).toBe(false);
  });

  it("takes the Magiczne Przedmioty out of the sum and leaves the rest in", async () => {
    // Excalibur lends 1 Miecz in a fight and is Magiczny; the plain Miecz lends
    // 1 and is not. Three of the character's own, plus two.
    const before = table(["excalibur", "miecz"]);
    expect(pointsOf(before, "seat-a", "walka").miecz).toBe(5);

    const after = await cast(before);
    expect(pointsOf(after, "seat-a", "walka").miecz).toBe(4);
  });

  /** „łącznie z tobą" — the caster is under their own spell. */
  it("catches everybody, the caster included", async () => {
    const after = await cast(table(["excalibur"]));
    for (const seatId of ["seat-a", "seat-b"]) {
      expect(seatView(after, seatId).statuses.some((s) => s.modifier.kind === "no-spells"), seatId)
        .toBe(true);
    }
  });

  /**
   * The Zaczarowane Wzgórza are the wider rule and stay wider: "Nie możesz
   * korzystać z Przedmiotów" is every Przedmiot, not only the magical ones.
   */
  it("is narrower than the Obszar that suspends everything", () => {
    const onTheHills = aTable({
      seats: [
        aSeat({
          id: "seat-a",
          sword_own: 3,
          field_id: asFieldId("zaczarowane-wzgorza"),
        }),
      ],
      holdings: [
        aHolding({ id: "h-0", seat_id: "seat-a", card_id: "excalibur", kind: "item" }),
        aHolding({ id: "h-1", seat_id: "seat-a", card_id: "miecz", kind: "item" }),
      ] as never,
    });
    expect(pointsOf(onTheHills, "seat-a", "walka").miecz).toBe(3);
  });
});
