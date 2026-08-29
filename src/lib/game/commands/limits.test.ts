import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { asFieldId } from "@/lib/engine/board";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { overCarried, overSpelled, refuseWhileOverLimit } from "./seat";
import { rollForMove } from "./movement";
import { dropCard } from "./holdings";

/**
 * 5.6, in the direction nothing watched.
 *
 * Taking a fifth Przedmiot is refused, so the limit holds where it would be
 * broken. The other way round it was not: lose the transport and the limit
 * falls under what is already in the pack. "Postać, która zdobyła więcej niż 4
 * Przedmioty i nie dysponuje żadnym środkiem transportu musi natychmiast
 * odrzucić Przedmioty, których nie jest w stanie unieść."
 *
 * The app does not choose which — 5.4 gives that to the player, "zależy
 * wyłącznie od decyzji gracza" — so it stops the game instead and says how many
 * have to go.
 */
const PACK = ["helm", "zbroja", "miecz", "sztylet", "tarcza"];

const carrying = (cards: readonly string[]) =>
  aTable({
    game: { active_seat: 0, turn_state: { phase: "roll" } },
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "mokradla-1" })],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
    ),
  });

describe("carrying more than you can", () => {
  it("is not over the limit while the Koń is in the pack", () => {
    // Base four plus the Koń's eight is twelve, and six is under it.
    expect(overCarried(carrying([...PACK, "kon"]), "seat-a")).toBeNull();
  });

  it("is over it the moment the Koń goes", () => {
    expect(overCarried(carrying(PACK), "seat-a")).toEqual({ carried: 5, limit: 4 });
  });

  it("says how many have to go, and whose choice it is", () => {
    expect(() => refuseWhileOverLimit(carrying(PACK), "seat-a")).toThrow(/odrzuć 1/);
    expect(() => refuseWhileOverLimit(carrying(PACK), "seat-a")).toThrow(/5\.6/);
    // Polish counts: five takes the genitive plural.
    expect(() => refuseWhileOverLimit(carrying(PACK), "seat-a")).toThrow(/5 Przedmiotów/);
  });

  /** The turn does not begin until the rule has been obeyed. */
  it("will not let the turn start", async () => {
    await expect(
      rollForMove(carrying(PACK), {} as never, ports({ random: scriptedRandom([4]) })),
    ).rejects.toThrow(/5\.6/);
  });

  it("lets the turn start once the pack is legal again", async () => {
    const table = carrying(PACK);
    const after = apply(table, dropCard(table, { holdingId: "h4" }).writes);
    expect(overCarried(after, "seat-a")).toBeNull();
    await expect(
      rollForMove(after, {} as never, ports({ random: scriptedRandom([4]) })),
    ).resolves.toBeTruthy();
  });

  /**
   * Dropping is the way out and must never be the thing refused, or a seat over
   * the limit would have no move that fixes it.
   */
  it("never blocks the one thing that resolves it", () => {
    const table = carrying(PACK);
    expect(() => dropCard(table, { holdingId: "h0" })).not.toThrow();
  });
});

/**
 * 2.6, which is the same rule about a different hand — and positional, which
 * the pack is not.
 *
 * "Jeżeli w jakimkolwiek momencie gry, Postać posiada więcej Zaklęć niż wynosi
 * limit ustalony przez jej Magię, musi tę nadwyżkę natychmiast zlikwidować."
 * The worked example is the Mag walking onto the Zaczarowane Wzgórza, losing
 * the Pierścień's two points of Magia and with them the right to a third
 * Zaklęcie.
 */
describe("holding more Zaklęcia than your Magia allows", () => {
  const magician = (magic: number, spells: number, fieldId = "mokradla-1") =>
    aTable({
      game: { active_seat: 0, turn_state: { phase: "roll" } },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, magic_own: magic, field_id: asFieldId(fieldId) }),
      ],
      holdings: Array.from({ length: spells }, (_unused, at) =>
        aHolding({ id: `s${at}`, seat_id: "seat-a", card_id: "golem", kind: "spell" }),
      ),
    });

  it("is fine while the Magia carries them", () => {
    expect(overSpelled(magician(5, 2), "seat-a")).toBeNull();
  });

  /**
   * 2.6's own example: Magia 5 allows three, and losing the Pierścień's two
   * points drops it to 3, which allows two. One Zaklęcie has to go.
   */
  it("is over the limit when the Magia falls under the hand", () => {
    expect(overSpelled(magician(5, 3), "seat-a")).toBeNull();
    expect(overSpelled(magician(3, 3), "seat-a")).toEqual({ held: 3, limit: 2 });
  });

  it("stops the turn, naming 2.6", () => {
    expect(() => refuseWhileOverLimit(magician(3, 3), "seat-a")).toThrow(/2\.6/);
    expect(() => refuseWhileOverLimit(magician(3, 3), "seat-a")).toThrow(/odrzuć 1/);
  });

  /** 9.4 forbids shedding a Zaklęcie — except from a hand that is over 2.6. */
  it("lets the one thing that resolves it through", () => {
    const table = magician(3, 3);
    expect(() => dropCard(table, { holdingId: "s0" })).not.toThrow();
    const after = apply(table, dropCard(table, { holdingId: "s0" }).writes);
    expect(overSpelled(after, "seat-a")).toBeNull();
  });

  /**
   * The rulebook's example, played out: the Mag holds three on a Pierścień
   * Mocy's two points of Magia, walks onto the Zaczarowane Wzgórza where a
   * Przedmiot Magiczny lends nothing, and is over the limit by standing there.
   */
  it("goes over by walking onto the Zaczarowane Wzgórza", () => {
    const withRing = (fieldId: string) =>
      aTable({
        game: { active_seat: 0, turn_state: { phase: "roll" } },
        seats: [aSeat({ id: "seat-a", seat_index: 0, magic_own: 3, field_id: asFieldId(fieldId) })],
        holdings: [
          aHolding({ id: "r", seat_id: "seat-a", card_id: "pierscien-mocy", kind: "item" }),
          ...Array.from({ length: 3 }, (_unused, at) =>
            aHolding({ id: `s${at}`, seat_id: "seat-a", card_id: "golem", kind: "spell" }),
          ),
        ],
      });

    // Magia 3 + the Pierścień's 2 is 5, which carries three Zaklęcia.
    expect(overSpelled(withRing("mokradla-1"), "seat-a")).toBeNull();
    // On the Wzgórza the ring lends nothing, so it is 3, which carries two.
    expect(overSpelled(withRing("zaczarowane-wzgorza"), "seat-a")).toEqual({
      held: 3,
      limit: 2,
    });
  });

  it("still refuses to shed one from a legal hand (9.4)", () => {
    expect(() => dropCard(magician(5, 2), { holdingId: "s0" })).toThrow(/9\.4/);
  });
});
