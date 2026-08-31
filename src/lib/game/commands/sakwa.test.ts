/**
 * The Tajemna Sakwa: a place a Karta makes, and the one thing that can reach it.
 *
 * "W Sakwie możesz umieścić 1 Przedmiot. Przedmiot ten i Sakwę będziesz mógł
 * utracić jedynie w wypadku użycia Zaklęcia »Pan Bogactwa« (nikt nie może go
 * zażądać jako okupu za przegraną walkę, nie stracisz go na Bagnach, etc.)."
 *
 * Two rules, and they are tested apart because they answer to different halves
 * of the app: what the bag does to 5.4's count, and what it does to every rule
 * that takes a Przedmiot away.
 */

import { describe, expect, it } from "vitest";
import { aHolding, aSeat, aTable } from "../fixture";
import { carriedCount } from "@/lib/engine/derive";
import { asHolding } from "./seat";
import { equipCard } from "./holdings";
import type { EqMode } from "@/lib/engine/slots";

const table = (
  holdings: { card_id: string; slot?: string | null }[],
  eqMode: EqMode = "classic",
) =>
  aTable({
    game: { eq_mode: eqMode },
    seats: [aSeat({ id: "seat-a" })],
    holdings: holdings.map((one, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", kind: "item", ...one }),
    ) as never,
  });

const packed = (snapshot: ReturnType<typeof table>, eqMode: EqMode) =>
  carriedCount(snapshot.holdings.map(asHolding), eqMode);

describe("what the Sakwa does to 5.4's count", () => {
  const withBag = [
    { card_id: "tajemna-sakwa" },
    { card_id: "miecz", slot: "tajemna-sakwa" },
    { card_id: "helm" },
  ];

  /**
   * The point of putting it above the `eqMode` test in `carriedCount`.
   *
   * Everything below that test is the slotted variant's house rule — a card
   * counts where it is worn — and this is not that. The place is made by a
   * Karta, so it exists at a klasyczny table too, and the same Sakwa must not
   * cost a place at one table and nothing at the next.
   */
  it("keeps what is inside out of the pack in both variants", () => {
    // The bag and the Hełm; the Miecz inside is not carried.
    expect(packed(table(withBag, "classic"), "classic")).toBe(2);
    expect(packed(table(withBag, "slots"), "slots")).toBe(2);
  });

  it("still counts the Sakwa itself", () => {
    // Only the Magiczna Sakwa carries "(sama Sakwa nie jest liczona jako
    // Przedmiot)", and that note is about the bag. This one is one of your four.
    const alone = table([{ card_id: "tajemna-sakwa" }]);
    expect(packed(alone, "classic")).toBe(1);
  });

  /**
   * Which is the whole trade: using the card costs no space beyond the place
   * the protected Karta was already taking.
   */
  it("charges nothing for using it, over simply carrying the same cards", () => {
    const loose = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz" }]);
    const tucked = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz", slot: "tajemna-sakwa" }]);
    expect(packed(loose, "classic")).toBe(2);
    expect(packed(tucked, "classic")).toBe(1);
  });
});

describe("putting something in it", () => {
  it("works at a klasyczny table, where nothing else may be put anywhere", () => {
    const at = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz" }], "classic");
    const { writes } = equipCard(at, { holdingId: "h1", slot: "tajemna-sakwa" });
    expect(writes.holdings?.patch?.[0]).toMatchObject({ id: "h1", patch: { slot: "tajemna-sakwa" } });
  });

  it("still refuses an ordinary place at a klasyczny table", () => {
    const at = table([{ card_id: "helm" }], "classic");
    expect(() => equipCard(at, { holdingId: "h0", slot: "head" })).toThrow(/klasycznym/);
  });

  it("refuses when the Karta that makes the place is not held", () => {
    const at = table([{ card_id: "miecz" }], "classic");
    expect(() => equipCard(at, { holdingId: "h0", slot: "tajemna-sakwa" })).toThrow(
      /Nie masz Tajemnej Sakwy/,
    );
  });

  it("lets the one inside come back out", () => {
    const at = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz", slot: "tajemna-sakwa" }], "classic");
    const { writes } = equipCard(at, { holdingId: "h1", slot: null });
    expect(writes.holdings?.patch?.[0]).toMatchObject({ id: "h1", patch: { slot: null } });
  });
});
