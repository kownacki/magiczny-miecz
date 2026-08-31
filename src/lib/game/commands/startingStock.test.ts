import { describe, expect, it } from "vitest";
import { aSeat, aTable, aUser, noDeck, ports } from "../fixture";
import { asSeatCharacter } from "@/lib/engine/characters";
import { startGame } from "./movement";

/**
 * 21.2 at setup: the Wyposażenie pile holds three Miecze, and five of the
 * twenty-seven Karty Postaci are printed with one. With the finite pile in
 * force, the fourth and fifth seats to ask simply do not get one — which is the
 * rule, and is meant to feel like it.
 */
const SWORDS = ["bledny-rycerz", "kat", "ksiaze", "rycerz-ciemnosci", "zdobywca"] as const;

const fiveSwords = (endless: boolean) =>
  aTable({
    game: { status: "lobby", round: 0, active_seat: null, deck: null, endless_stock: endless },
    seats: SWORDS.map((id, at) =>
      aSeat({ id: `seat-${at}`, seat_index: at, character_id: asSeatCharacter(id) }),
    ),
    users: SWORDS.map((_, at) => aUser({ id: `user-${at}`, seat_index: at, ready: true })),
  });

const swordsDealt = (writes: { holdings?: { insert?: readonly { card_id: string }[] } }) =>
  (writes.holdings?.insert ?? []).filter((held) => held.card_id === "miecz").length;

describe("wyposażenie początkowe a skończony stos (21.2)", () => {
  it("hands out only as many Miecze as the pile holds", () => {
    const { writes } = startGame(fiveSwords(false), { decks: noDeck() }, ports());
    expect(swordsDealt(writes)).toBe(3);
  });

  it("hands out all five when the table said the pile is endless", () => {
    const { writes } = startGame(fiveSwords(true), { decks: noDeck() }, ports());
    expect(swordsDealt(writes)).toBe(5);
  });

  /**
   * In seat order, so who goes without is decided by where they sit rather
   * than by whatever order the rows came back in.
   */
  it("gives them to the earliest seats", () => {
    const { writes } = startGame(fiveSwords(false), { decks: noDeck() }, ports());
    const withSword = new Set(
      (writes.holdings?.insert ?? [])
        .filter((held) => held.card_id === "miecz")
        .map((held) => held.seat_id),
    );
    expect(withSword).toEqual(new Set(["seat-0", "seat-1", "seat-2"]));
  });

  /**
   * And no line about the one that never came. 21.2 makes it "w danej chwili
   * nieosiągalny" — a fact about the box, not an event at the table.
   */
  it("journals what arrived, and nothing about what did not", () => {
    const { writes } = startGame(fiveSwords(false), { decks: noDeck() }, ports());
    const kits = (writes.journal ?? []).filter((row) => row.kind === "starting-kit");
    const named = (seatId: string) =>
      ((kits.find((row) => row.seatId === seatId)?.payload as { items?: string[] })?.items ?? []);
    // The first three were dealt their Miecz and the line says so.
    expect(named("seat-0")).toContain("miecz");
    // The last two go without. Their lines survive only because they carry
    // something else that did arrive — a Zaklęcie for the Rycerz Ciemności, a
    // Tarcza for the Zdobywca — and neither line mentions the Miecz that was
    // never handed over.
    expect(named("seat-3")).not.toContain("miecz");
    expect(named("seat-4")).toEqual(["tarcza"]);
  });
});
