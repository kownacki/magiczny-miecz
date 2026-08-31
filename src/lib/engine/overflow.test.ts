import { describe, expect, it } from "vitest";
import { overflowIn, waysUnder } from "./overflow";
import { heldAbilities } from "./abilities";
import type { Holding } from "./state";

/** A pack row, with the id the store would give it. */
const held = (cardId: string, over: Partial<Holding & { id: string }> = {}) =>
  ({ id: `h-${cardId}`, cardId, kind: "item", face: "open", slot: null, ...over }) as Holding & {
    id: string;
  };

const spells = { magia: 1, atSetup: 0, abilities: [] as never[] };

describe("being over the limit", () => {
  it("counts 5.4's four, and says by how many", () => {
    const four = ["miecz", "helm", "tarcza", "zbroja"].map((id) => held(id));
    expect(overflowIn(four, "classic", spells)).toBeNull();
    expect(overflowIn([...four, held("sztylet")], "classic", spells)).toEqual({
      what: "przedmioty",
      held: 5,
      limit: 4,
      over: 1,
    });
  });

  /** "(sama Sakwa nie jest liczona jako Przedmiot)" — she is +5 and costs nothing. */
  it("does not charge the Magiczna Sakwa for herself", () => {
    const pack = ["miecz", "helm", "tarcza", "zbroja", "magiczna-sakwa"].map((id) => held(id));
    expect(overflowIn(pack, "classic", spells)).toBeNull();
  });

  it("catches a hand over 2.6's table too", () => {
    const hand = [held("krag-plomieni", { kind: "spell" }), held("fatum", { kind: "spell" })];
    expect(overflowIn(hand, "classic", { magia: 1, atSetup: 0, abilities: [] })).toMatchObject({
      what: "zaklecia",
      over: 2,
    });
  });
});

describe("the ways back under", () => {
  const pack = () => [held("miecz"), held("eliksir-sily"), held("helm")];

  /** 5.5 is always available and is the only one that reaches the ground. */
  it("offers putting any of them down", () => {
    const ways = waysUnder(pack(), "classic", "good", "przedmioty");
    expect(ways.filter((one) => one.kind === "odrzuc").map((one) => one.cardId)).toEqual([
      "miecz",
      "eliksir-sily",
      "helm",
    ]);
    expect(ways.every((one) => one.kind !== "odrzuc" || one.gdzie === "obszar")).toBe(true);
  });

  /**
   * A Przedmiot spent by using it is one you no longer carry, and you keep what
   * it bought — which makes it the best answer available to an overload.
   */
  it("offers drinking what can be drunk", () => {
    const ways = waysUnder(pack(), "classic", "good", "przedmioty");
    expect(ways.filter((one) => one.kind === "uzyj").map((one) => one.cardId)).toEqual([
      "eliksir-sily",
    ]);
  });

  /** When the moment forbids it, it is not on the list. */
  it("does not offer using a Karta the moment does not allow", () => {
    const ways = waysUnder(pack(), "classic", "good", "przedmioty", () => false);
    expect(ways.some((one) => one.kind === "uzyj")).toBe(false);
  });

  /** In klasyczny nothing is worn, so wearing frees nothing. */
  it("offers no wearing in klasyczny", () => {
    expect(waysUnder(pack(), "classic", "good", "przedmioty").some((w) => w.kind === "zaloz")).toBe(
      false,
    );
  });

  it("offers wearing in slotowy, where the pack and the body are different places", () => {
    const ways = waysUnder(pack(), "slots", "good", "przedmioty");
    expect(ways.filter((one) => one.kind === "zaloz").map((one) => one.cardId)).toEqual([
      "miecz",
      "helm",
    ]);
  });

  /** The two relics never counted, so shedding one would free nothing. */
  it("leaves the relics out of it", () => {
    const ways = waysUnder(
      [held("magiczny-miecz"), held("miecz")],
      "classic",
      "good",
      "przedmioty",
    );
    expect(ways.map((one) => one.cardId)).toEqual(["miecz"]);
  });

  /** 9.4: a Zaklęcie has one exit and it is not the ground. */
  it("offers only shedding, for a hand over 2.6", () => {
    const hand = [held("fatum", { kind: "spell" })];
    const ways = waysUnder(hand, "classic", "good", "zaklecia");
    expect(ways).toEqual([
      { kind: "odrzuc", holdingId: "h-fatum", cardId: "fatum", gdzie: "stos" },
    ]);
  });

  it("reads the Różdżka's raised ceiling through the same door", () => {
    const hand = [held("fatum", { kind: "spell" }), held("rozdzka-zaklec")];
    expect(
      overflowIn(hand, "classic", {
        magia: 1,
        atSetup: 1,
        abilities: heldAbilities(["rozdzka-zaklec"]),
      }),
    ).toBeNull();
  });
});
