import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { isArms } from "@/lib/engine/cards";
import { slotsFor } from "@/lib/engine/slots";
import { top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { aHolding, aSeat, aTable, aUser, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { beginFight, castSpell } from "./fight";
import { claimFloor } from "./spellFloor";

/**
 * PRZYBYSZ Z KRAINY CIENI, who refuses most of what you are carrying.
 *
 * "Przeciw Przybyszowi nie można używać Zaklęć, Magicznych Przedmiotów ani
 * Broni." Three refusals, and until the cards' class band was transcribed the
 * app could not tell which Przedmioty were Magiczne, so it carried none of
 * them.
 *
 * What he leaves you is your own Miecz and everything that is neither a weapon
 * nor magical — a Tarcza, a Hełm, a Zbroja, a Przyjaciel — which is rather more
 * than "you fight him bare" and is what the card actually says.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];
const PRZYBYSZ = "przybysz-z-krainy-cieni";

const totalIn = (writes: { game?: { turn_state?: unknown } }) =>
  (top(writes.game?.turn_state as TurnState) as Extract<TurnPhase, { phase: "fight" }>).fight
    .playerTotal;

const facing = (foe: string, cards: string[], spells: string[] = []): Snapshot =>
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
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, sword_own: 4, magic_own: 4, nature: "good", field_id: asFieldId("wrzosowiska") }),
      aSeat({ id: "seat-b", seat_index: 1, magic_own: 5, field_id: asFieldId("osada") }),
    ],
    users: [
      aUser({ id: "u-a", seat_index: 0, name: "Ania" }),
      aUser({ id: "u-b", seat_index: 1, name: "Bartek", is_host: false }),
    ],
    holdings: [
      ...cards.map((cardId, at) =>
        aHolding({ id: `h-${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
      ),
      ...spells.map((cardId, at) =>
        aHolding({ id: `s-${at}`, seat_id: "seat-b", card_id: cardId, kind: "spell" }),
      ),
    ] as never,
  });

describe("what counts as Broń or Magiczny", () => {
  it("is the main hand and the printed class, and nothing else", () => {
    expect(isArms("miecz", slotsFor("miecz"))).toBe(true);
    expect(isArms("sztylet", slotsFor("sztylet"))).toBe(true);
    expect(isArms("excalibur", slotsFor("excalibur"))).toBe(true);
    // A Różdżka is no weapon, but it is Magiczna, so it is barred anyway.
    expect(isArms("rozdzka-zaklec", slotsFor("rozdzka-zaklec"))).toBe(true);
    // And these are neither.
    expect(isArms("tarcza", slotsFor("tarcza"))).toBe(false);
    expect(isArms("helm", slotsFor("helm"))).toBe(false);
    expect(isArms("zbroja", slotsFor("zbroja"))).toBe(false);
  });
});

describe("fighting the Przybysz", () => {
  it("counts the Miecz and the Excalibur against anybody else", () => {
    expect(totalIn(beginFight(facing("cyklop", []), { cardIds: ["cyklop"] }).writes)).toBe(4);
    expect(
      totalIn(beginFight(facing("cyklop", ["miecz", "excalibur"]), { cardIds: ["cyklop"] }).writes),
    ).toBe(6);
  });

  it("counts neither against him", () => {
    expect(
      totalIn(beginFight(facing(PRZYBYSZ, ["miecz", "excalibur"]), { cardIds: [PRZYBYSZ] }).writes),
    ).toBe(4);
  });

  /** A Tarcza is not Broń and not Magiczna, so it is still yours. */
  it("leaves what is neither a weapon nor magical", () => {
    const withShield = facing(PRZYBYSZ, ["miecz", "tarcza", "pasterz"]);
    // The Pasterz lends 1 Miecz and 1 Magia and is a Przyjaciel, not a Przedmiot.
    expect(totalIn(beginFight(withShield, { cardIds: [PRZYBYSZ] }).writes)).toBe(5);
  });

  it("refuses a Zaklęcie spoken into his fight (9.6)", async () => {
    const table = facing(PRZYBYSZ, [], ["krag-plomieni"]);
    let at = apply(table, beginFight(table, { cardIds: [PRZYBYSZ] }).writes);
    at = apply(at, claimFloor(at, { seatId: "seat-b" }, ports()).writes);

    await expect(
      castSpell(at, { seatId: "seat-b", holdingId: "s-0", target: { foeInFight: true }, shuffle: asIs }, ports()),
    ).rejects.toThrow(/nie można tu używać Zaklęć/);
  });

  it("and allows one into anybody else's", async () => {
    const table = facing("cyklop", [], ["krag-plomieni"]);
    let at = apply(table, beginFight(table, { cardIds: ["cyklop"] }).writes);
    at = apply(at, claimFloor(at, { seatId: "seat-b" }, ports()).writes);

    await expect(
      castSpell(at, { seatId: "seat-b", holdingId: "s-0", target: { foeInFight: true }, shuffle: asIs }, ports()),
    ).resolves.toBeTruthy();
  });
});
