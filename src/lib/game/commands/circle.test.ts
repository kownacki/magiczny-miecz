import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { unattackableAfter, spellScript } from "@/lib/engine/spells";
import { immuneToSpell, heldAbilities } from "@/lib/engine/abilities";
import { top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { aHolding, aSeat, aTable, aUser, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { beginFight, castSpell } from "./fight";
import { claimFloor } from "./spellFloor";

/**
 * A cast that reaches the fight beneath it — law 4's cash-in (docs/STACK.md).
 *
 * "To Zaklęcie możesz rzucić w dowolnej chwili na inną Postać lub Wroga. Ofiara
 * zostaje otoczona płomieniami... Ofiary nie można zaatakować, jednak można się
 * jej wymknąć."
 *
 * The half that had nowhere to go before the stack: a fight one of whose sides
 * cannot be attacked is over, and the frame beneath — a field, or a `loop`
 * counting heads — has to be told. What is *not* built is the other half, the
 * creature left burning on an Obszar: `seat_effects.seat_id` is `not null`, so
 * a Karta lying on the board cannot carry a status, and its `MANUAL` note says
 * so.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];
const KRAG = "krag-plomieni";
const SMOK = "trogglowy-smok";

const phases = (state: TurnState) => state.stack.map((frame) => frame.phase);

/**
 * 17.3's floor, claimed before speaking into a fight.
 *
 * Not a detail of the test: the floor is how a bystander gets a word in at all
 * — "nobody is polled and nobody is named in advance" — and casting without it
 * is refused. Every one of these is that claim followed by the Zaklęcie.
 */
const withFloor = (at: Snapshot, seatId: string): Snapshot =>
  apply(at, claimFloor(at, { seatId }, ports()).writes);

const fieldOn = (state: TurnState) => {
  const frame = top(state);
  if (frame.phase !== "field") throw new Error(`na wierzchu jest ${frame.phase}`);
  return frame;
};

/** Ania fighting, Bartek two fields away with the Krąg in hand. */
const table = (foe: string, holdings = [] as unknown[]): Snapshot =>
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
      aSeat({ id: "seat-a", seat_index: 0, sword_own: 5, life: 4, field_id: asFieldId("wrzosowiska") }),
      aSeat({ id: "seat-b", seat_index: 1, magic_own: 5, field_id: asFieldId("osada") }),
    ],
    users: [
      aUser({ id: "u-a", seat_index: 0, name: "Ania" }),
      aUser({ id: "u-b", seat_index: 1, name: "Bartek", is_host: false }),
    ],
    holdings: [
      aHolding({ id: "h-krag", seat_id: "seat-b", card_id: KRAG, kind: "spell" }),
      ...holdings,
    ] as never,
  });

describe("the rule, read off the card rather than declared twice", () => {
  it("a Zaklęcie that freezes its victim leaves them unattackable", () => {
    expect(unattackableAfter(spellScript(KRAG))).toBe(true);
  });

  /** Every other Zaklęcie leaves the fight where it was. */
  it("nothing else does", () => {
    for (const id of ["odrodzenie", "siedem-wichrow", "magia-i-miecz"]) {
      expect(unattackableAfter(spellScript(id)), id).toBe(false);
    }
  });
});

describe("a bystander stops the fight with a Krąg Płomieni", () => {
  it("ends it with no dice, no Życie and no trophy (17.4, 19.1)", async () => {
    const opened = apply(table("cyklop"), beginFight(table("cyklop"), { cardIds: ["cyklop"] }).writes);
    expect(phases(opened.game.turn_state)).toEqual(["field", "fight"]);

    const cast = await castSpell(
      withFloor(opened, "seat-b"),
      { seatId: "seat-b", holdingId: "h-krag", target: { foeInFight: true }, shuffle: asIs },
      ports(),
    );
    const at = apply(withFloor(opened, "seat-b"), cast.writes);

    expect(phases(at.game.turn_state)).toEqual(["field"]);
    // Settled for the turn (17.4) and still lying there for whoever comes next
    // (16.8) — walked away from, not beaten.
    expect(fieldOn(at.game.turn_state).fought).toContain("cyklop");
    expect(at.seats[0].life).toBe(4);
    expect(at.holdings.filter((one) => one.kind === "trophy")).toHaveLength(0);
    // 9.6: the Karta is spent as it is spoken, whatever it did.
    expect(at.holdings.some((one) => one.id === "h-krag")).toBe(false);
  });

  /**
   * Moment 8 of the acceptance test, at last: law 3 meeting law 4. The Krąg
   * stops the head being fought, and the whole attempt goes with it.
   */
  it("a loop beneath closes with it, and the heads grow back", async () => {
    const start = table(SMOK);
    const opened = apply(start, beginFight(start, { cardIds: [SMOK] }).writes);
    expect(phases(opened.game.turn_state)).toEqual(["field", "loop", "fight"]);

    const cast = await castSpell(
      withFloor(opened, "seat-b"),
      { seatId: "seat-b", holdingId: "h-krag", target: { foeInFight: true }, shuffle: asIs },
      ports(),
    );
    const at = apply(withFloor(opened, "seat-b"), cast.writes);

    // The loop is never left on screen, and nothing it had cut is kept.
    expect(phases(at.game.turn_state)).toEqual(["field"]);
    expect(fieldOn(at.game.turn_state).fought).toEqual([SMOK]);
    expect(at.holdings.filter((one) => one.kind === "trophy")).toHaveLength(0);
    expect(at.seats[0].life).toBe(4);
  });

  it("says so out loud rather than just moving the stack", async () => {
    const opened = apply(table("cyklop"), beginFight(table("cyklop"), { cardIds: ["cyklop"] }).writes);
    const cast = await castSpell(
      withFloor(opened, "seat-b"),
      { seatId: "seat-b", holdingId: "h-krag", target: { foeInFight: true }, shuffle: asIs },
      ports(),
    );
    expect(cast.result.did?.join(" ")).toMatch(/walka przerwana/);
  });

  /**
   * A Zaklęcie aimed somewhere else leaves the fight standing — what it does
   * instead is put the fight back to before the dice and hand the floor back,
   * which is 17.3 and was already true.
   */
  it("leaves a fight it was not spoken into alone", async () => {
    const opened = apply(table("cyklop"), beginFight(table("cyklop"), { cardIds: ["cyklop"] }).writes);
    const cast = await castSpell(
      withFloor(opened, "seat-b"),
      { seatId: "seat-b", holdingId: "h-krag", target: { seatIndex: 1 }, shuffle: asIs },
      ports(),
    );
    const at = apply(withFloor(opened, "seat-b"), cast.writes);
    expect(phases(at.game.turn_state)).toEqual(["field", "fight"]);
  });
});

describe("the Talizmany's immunity", () => {
  it("is read off the card the two of them print", () => {
    expect(immuneToSpell(heldAbilities(["talizman-ognia"]), KRAG)).toBe(true);
    expect(immuneToSpell(heldAbilities(["talizman-ognia"]), "siedem-wichrow")).toBe(false);
    expect(immuneToSpell(heldAbilities(["talizman-powietrza"]), "siedem-wichrow")).toBe(true);
    expect(immuneToSpell(heldAbilities(["talizman-powietrza"]), "wladca-gromu")).toBe(true);
    expect(immuneToSpell(heldAbilities(["excalibur"]), KRAG)).toBe(false);
  });

  it("stops the Krąg landing on the Postać wearing it, and spends the card anyway (9.6)", async () => {
    const guarded = table("cyklop", [
      aHolding({ id: "h-tal", seat_id: "seat-a", card_id: "talizman-ognia", kind: "item" }),
    ]);
    const cast = await castSpell(
      guarded,
      { seatId: "seat-b", holdingId: "h-krag", target: { seatIndex: 0 }, shuffle: asIs },
      ports(),
    );
    const at = apply(guarded, cast.writes);

    expect(cast.result.did?.join(" ")).toMatch(/odporność/);
    // No status landed on her…
    expect(at.effects).toHaveLength(0);
    // …and the Zaklęcie is gone from the hand all the same.
    expect(at.holdings.some((one) => one.id === "h-krag")).toBe(false);
  });

  /** The immunity is the victim's. A caster's own Talizman defends nobody. */
  it("does not protect the caster's target when the caster is the one wearing it", async () => {
    const wrong = table("cyklop", [
      aHolding({ id: "h-tal", seat_id: "seat-b", card_id: "talizman-ognia", kind: "item" }),
    ]);
    const cast = await castSpell(
      wrong,
      { seatId: "seat-b", holdingId: "h-krag", target: { seatIndex: 0 }, shuffle: asIs },
      ports(),
    );
    const at = apply(wrong, cast.writes);
    expect(at.effects.length).toBeGreaterThan(0);
  });
});
