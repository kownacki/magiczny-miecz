import { describe, expect, it } from "vitest";
import {
  BASE_CARRY_LIMIT,
  SLOTTED_PACK_LIMIT,
  carriedCount,
  carryLimit,
  heal,
  HEAL_CEILING,
  wandRefills,
} from "./derive";
import type { Holding } from "./state";
import type { CardId } from "@/data/ids";

const item = (cardId: string, slot: string | null = null): Holding =>
  ({ cardId, kind: "item", face: "open", slot } as unknown as Holding);

const of = (kind: Holding["kind"], cardId: string): Holding =>
  ({ cardId, kind, face: "open", slot: null } as unknown as Holding);

describe("what counts against the pack (5.4)", () => {
  it("counts ordinary Przedmioty", () => {
    expect(carriedCount([item("helm"), item("miecz")], "classic")).toBe(2);
  });

  it("does not count a Zaklęcie, a Przyjaciel or a trofeum", () => {
    const hand = [of("spell", "krag-plomieni"), of("friend", "wilk"), of("trophy", "goblin")];
    expect(carriedCount(hand, "classic")).toBe(0);
  });

  /**
   * The house rule that the browser used to miss.
   *
   * `RELICS` keeps the Magiczny Miecz and the two Tarcze off the count in
   * either variant — neither is a thing anybody chooses to carry. The pack
   * counter in the interface filtered `kind === "item"` by hand instead, so a
   * character holding the Magiczny Miecz and three Przedmioty read "4 / 4",
   * lost their free square, and was refused a take the server would have
   * allowed.
   */
  it("never counts the relics, in either variant", () => {
    const hand = [
      item("magiczny-miecz"),
      item("tarcza-tolimana"),
      item("tarcza-boga-tolimana"),
      item("helm"),
    ];
    expect(carriedCount(hand, "classic")).toBe(1);
    expect(carriedCount(hand, "slots")).toBe(1);
  });

  it("counts only the pack in the slotted variant", () => {
    const hand = [item("helm", "head"), item("miecz")];
    expect(carriedCount(hand, "classic")).toBe(2);
    expect(carriedCount(hand, "slots")).toBe(1);
  });
});

describe("how much a character can carry (5.4)", () => {
  it("is four without a means of transport", () => {
    expect(carryLimit([], "classic")).toBe(BASE_CARRY_LIMIT);
  });

  it("is the pack's own number in the slotted variant", () => {
    expect(carryLimit([], "slots")).toBe(SLOTTED_PACK_LIMIT);
  });

  it("takes the number off the card rather than assuming unlimited", () => {
    expect(carryLimit([of("friend", "kon" as CardId)], "classic")).toBe(12);
    expect(carryLimit([of("friend", "mul" as CardId)], "classic")).toBe(8);
  });

  it("adds them up when a character has two", () => {
    const hand = [of("friend", "mul"), of("friend", "tragarz")];
    expect(carryLimit(hand, "classic")).toBe(BASE_CARRY_LIMIT + 4 + 4);
  });

  /** Only the Zaprzęg says "dowolną liczbę". */
  it("is unlimited only for the card that says so", () => {
    expect(carryLimit([of("friend", "zaprzeg")], "classic")).toBe(Infinity);
  });

  it("ignores a means of transport won as a trophy (1.4)", () => {
    expect(carryLimit([of("trophy", "kon")], "classic")).toBe(BASE_CARRY_LIMIT);
  });

  /** In slotowy a Koń in the pack pulls nothing; it works where it is worn. */
  it("only lends its carrying in the slotted variant when it is worn", () => {
    expect(carryLimit([item("kon")], "slots")).toBe(SLOTTED_PACK_LIMIT);
    expect(carryLimit([item("kon", "mount")], "slots")).toBe(SLOTTED_PACK_LIMIT + 8);
  });
});

describe("uzdrowienie (4.7)", () => {
  it("stops at the starting level", () => {
    expect(heal({ life: 3 }, 4).life).toBe(HEAL_CEILING);
  });

  /** 4.6 leaves gains uncapped, so healing must never take life away. */
  it("does not drain a character who is already above it", () => {
    expect(heal({ life: 6 }, 1).life).toBe(6);
  });
});

describe("the Różdżka Zaklęć's refill", () => {
  /** "gdy ma tyle Zaklęć, ile na początku gry lub mniej" — at, not below. */
  it("gives one at exactly the setup hand", () => {
    expect(wandRefills(2, 2)).toBe(true);
  });

  it("gives one below it", () => {
    expect(wandRefills(0, 2)).toBe(true);
  });

  it("gives nothing above it", () => {
    expect(wandRefills(3, 2)).toBe(false);
  });

  /** A Barbarzyńca starts with none, so the wand is worth one card to them. */
  it("works for a character who started with no Zaklęcia", () => {
    expect(wandRefills(0, 0)).toBe(true);
    expect(wandRefills(1, 0)).toBe(false);
  });
});
