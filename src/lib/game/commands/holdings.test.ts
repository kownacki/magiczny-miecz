import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { PRINTED_STOCK } from "@/lib/engine/stock";
import { EVENT_COPIES, SPELL_COPIES, decksOf } from "../decks";
import { apply, type Snapshot } from "../change";
import { aHolding, aSeat, aTable } from "../fixture";
import { only, top } from "@/lib/engine/stack";
import {
  clearField,
  dropCard,
  grantCard,
  placeCard,
  takeCard,
  takeFromField,
} from "./holdings";
import {
  equipCard,
  reorderPack,
} from "./wearing";

/** Real fields, read through the board's own guard rather than written as strings. */
const HERE = asFieldId("mroczna-polana")!;
const ELSEWHERE = asFieldId("grod")!;

/** The turn stopped on an Obszar, which is the only phase 12.1 opens. */
const onField = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: HERE,
  from: null,
  draw: 0,
  drawn: [],
  ...over,
});

const discardOf = (writes: { game?: { deck?: unknown } }, pile: "events" | "spells") =>
  decksOf({ deck: writes.game?.deck ?? null })[pile].discard;

/* ==========================================================================
 * Taking a card (12.1, 16.6, 21.1, 21.2, 5.3, 5.4)
 * ======================================================================= */

describe("taking a card", () => {
  const table = (over: Parameters<typeof aTable>[0] = {}) =>
    aTable({ seats: [aSeat({ id: "seat-a", field_id: HERE })], ...over });

  /**
   * The wrench survives being picked up.
   *
   * `granted` used to be the caller's to pass and two of the three callers did
   * not, so a Karta conjured by `deal` and then taken arrived in the Plecak as
   * an ordinary one — with the journal saying „tryb testowy" on the line above
   * it. The mark exists so a conjured card cannot be mistaken for a real one
   * later, and being picked up is exactly when it starts looking like one.
   */
  describe("the test-mode mark", () => {
    const dealt = () =>
      table({
        game: {
          turn_state: only(onField({ drawn: [{ cardId: "eliksir-sily", cardClass: "item", granted: true }] })),
        },
      });

    it("comes off the turn's drawn list, with no caller saying so", () => {
      const { writes } = takeCard(dealt(), { seatId: "seat-a", cardId: "eliksir-sily" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ card_id: "eliksir-sily", granted: true });
    });

    it("comes off the Obszar the card is lying on", () => {
      const lying = table({
        game: { turn_state: only(onField()) },
        fieldCards: [
          { id: "fc1", field_id: HERE, card_id: "eliksir-sily", granted: true, pool: null },
        ] as never,
      });
      const { writes } = takeCard(lying, { seatId: "seat-a", cardId: "eliksir-sily" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ granted: true });
    });

    it("is not invented for a card the deck really did give up", () => {
      const real = table({
        game: {
          turn_state: only(onField({ drawn: [{ cardId: "eliksir-sily", cardClass: "item" }] })),
        },
      });
      const { writes } = takeCard(real, { seatId: "seat-a", cardId: "eliksir-sily" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ granted: false });
    });

    it("cannot be taken off by a caller that says otherwise", () => {
      // `||`, not `??`: a caller may add the mark and never remove one the
      // table is already carrying.
      const { writes } = takeCard(dealt(), {
        seatId: "seat-a",
        cardId: "eliksir-sily",
        granted: false,
      });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ granted: true });
    });
  });

  it("refuses a card it has never heard of", () => {
    expect(() => takeCard(table(), { seatId: "seat-a", cardId: "smok-z-tarnowa" })).toThrow(
      "Nieznana karta: smok-z-tarnowa",
    );
  });

  /** A Spotkanie is read and set aside; nobody carries one. */
  it("refuses a card that is not a thing you can hold", () => {
    expect(() => takeCard(table(), { seatId: "seat-a", cardId: "mgla" })).toThrow(
      "Tej Karty nie można zabrać ze sobą (16.6).",
    );
  });

  it("puts a Przedmiot in the pack and says so", () => {
    const { writes, result } = takeCard(table(), { seatId: "seat-a", cardId: "helm" });
    expect(result).toEqual({ kind: "item", resolve: null });
    expect(writes.holdings?.insert).toEqual([
      { seat_id: "seat-a", card_id: "helm", kind: "item", face: "open", granted: false },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "taken",
      payload: { cardId: "helm", kind: "item" },
    });
  });

  /**
   * Slotowy: a Przedmiot is worn the moment it arrives, whichever way it came.
   *
   * The whole claim of the variant is that only what you wear counts, so a card
   * that lands in the Plecak is a card doing nothing. See `slotOnArrival`.
   */
  describe("in slotowy", () => {
    const slotted = (over: Parameters<typeof aTable>[0] = {}) =>
      aTable({
        game: { eq_mode: "slots" },
        seats: [aSeat({ id: "seat-a", field_id: HERE })],
        ...over,
      });

    it("puts it on rather than in the pack", () => {
      const { writes } = takeCard(slotted(), { seatId: "seat-a", cardId: "helm" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ card_id: "helm", slot: "head" });
    });

    /** Never displaces: the Miecz already worn stays worn. */
    it("bags it when the place is taken", () => {
      const table = slotted({
        holdings: [aHolding({ id: "h1", seat_id: "seat-a", card_id: "miecz", slot: "main-hand" })],
      });
      const { writes } = takeCard(table, { seatId: "seat-a", cardId: "miecz" });
      expect(writes.holdings?.insert?.[0]).not.toHaveProperty("slot");
    });

    it("bags what cannot be worn at all", () => {
      // Kij i Sznur rather than the Łódź: the boat is no longer bagged at all,
      // because you cannot carry one (11.2). This is about a Przedmiot that is
      // kept and simply has nowhere on the body to go.
      const { writes } = takeCard(slotted(), { seatId: "seat-a", cardId: "kij-i-sznur" });
      expect(writes.holdings?.insert?.[0]).not.toHaveProperty("slot");
    });

    /**
     * 5.4 caps the Plecak, and wearing is not carrying.
     *
     * A full pack used to refuse a Hełm outright, because picking a card up
     * always put it in the pack. An empty head is somewhere to put it.
     */
    it("lets a full pack still put something on", () => {
      // Four things that cannot be worn, so the pack is full and the body bare.
      const full = slotted({
        holdings: ["lodz", "latarnia", "kij-i-sznur", "kij-i-sznur"].map((cardId, at) =>
          aHolding({ id: `p${at}`, seat_id: "seat-a", card_id: cardId, slot: null }),
        ),
      });
      const { writes } = takeCard(full, { seatId: "seat-a", cardId: "helm" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ slot: "head" });
      // And still refuses one that would have to go in the pack.
      expect(() => takeCard(full, { seatId: "seat-a", cardId: "kij-i-sznur" })).toThrow(/5\.4/);
    });

    /** The console conjures a card into play, not into a bag. */
    it("dresses a conjured card the same way", () => {
      const { writes } = grantCard(slotted(), { seatId: "seat-a", cardId: "helm" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ card_id: "helm", slot: "head" });
    });

    it("leaves a conjured Zaklęcie alone, face down (9.3)", () => {
      const { writes } = grantCard(slotted(), { seatId: "seat-a", cardId: "krag-plomieni" });
      expect(writes.holdings?.insert?.[0]).toMatchObject({ face: "hidden" });
      expect(writes.holdings?.insert?.[0]).not.toHaveProperty("slot");
    });
  });

  /** 1.4: a beaten Wróg is filed as a trophy, not as equipment that lends Miecz. */
  it("files a Wróg as a trophy", () => {
    expect(takeCard(table(), { seatId: "seat-a", cardId: "cyklop" }).result.kind).toBe("trophy");
  });

  it("files a Przyjaciel as a friend", () => {
    expect(takeCard(table(), { seatId: "seat-a", cardId: "gnom" }).result.kind).toBe("friend");
  });

  /**
   * Money is not luggage: the card *is* the gold, so taking one resolves it.
   *
   * Walking the script is `applyEffect`'s job and has a database inside it, so
   * the effect comes back out in the result rather than being carried out here.
   */
  it("resolves a Sztuka Złota instead of carrying it", () => {
    const { writes, result } = takeCard(table(), { seatId: "seat-a", cardId: "1-sztuka-zlota" });
    expect(result.kind).toBeNull();
    expect(result.resolve).toEqual({
      effect: { op: "punkty", stat: "gold", delta: 1 },
      reason: "1 SZTUKA ZŁOTA",
    });
    expect(writes.holdings?.insert ?? []).toEqual([]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "taken",
      // The card's own kind. It said "gold" for every consumed card, which was
      // true while the only two were money; the Łódź is the third and is not.
      // That the coin *became* gold is the `points` line the effect then writes.
      payload: { cardId: "1-sztuka-zlota", kind: "item" },
    });
  });

  /**
   * 5.3: "Kartę takiego Przedmiotu należy położyć odkrytą na Obszarze" — you
   * never take it, rather than taking it and discovering you may not.
   */
  it("refuses a Przedmiot the Natura forbids (5.3)", () => {
    const zla = table({ seats: [aSeat({ id: "seat-a", field_id: HERE, nature: "evil" })] });
    expect(() => takeCard(zla, { seatId: "seat-a", cardId: "swieta-wlocznia" })).toThrow(
      "ŚWIĘTA WŁÓCZNIA — twoja Natura nie pozwala ci tego nieść (5.3).",
    );
  });

  it("lets the same card go to a Natura that may carry it", () => {
    const dobra = table({ seats: [aSeat({ id: "seat-a", field_id: HERE, nature: "good" })] });
    expect(takeCard(dobra, { seatId: "seat-a", cardId: "swieta-wlocznia" }).result.kind).toBe(
      "item",
    );
  });

  /**
   * The Topór restricts the *third* Natura, not the usual two, and the coverage
   * note used to say the opposite outright — "Tylko dla Chaotycznych" against a
   * card reading "nie może być w posiadaniu Chaotycznych Postaci". The ability
   * was right the whole time and nothing caught the contradiction, because a
   * note is prose and prose is not typechecked. So the direction is pinned here.
   */
  it("refuses the Topór to a Chaotyczna Postać and allows it to the other two (5.3)", () => {
    const chaotyczna = table({
      seats: [aSeat({ id: "seat-a", field_id: HERE, nature: "chaotic" })],
    });
    expect(() =>
      takeCard(chaotyczna, { seatId: "seat-a", cardId: "topor-swiatla-i-ciemnosci" }),
    ).toThrow("twoja Natura nie pozwala ci tego nieść (5.3).");

    for (const nature of ["good", "evil"] as const) {
      const other = table({ seats: [aSeat({ id: "seat-a", field_id: HERE, nature })] });
      expect(
        takeCard(other, { seatId: "seat-a", cardId: "topor-swiatla-i-ciemnosci" }).result.kind,
      ).toBe("item");
    }
  });

  /** 12.1a: "należy najpierw pokonać Wrogów albo im uciec" — the loot waits. */
  it("refuses while an unfought Wróg is still on the stack", () => {
    const guarded = table({
      game: {
        turn_state: onField({
          drawn: [
            { cardId: "cyklop", cardClass: "foe" },
            { cardId: "helm", cardClass: "item" },
          ],
        }),
      },
    });
    expect(() => takeCard(guarded, { seatId: "seat-a", cardId: "helm" })).toThrow(
      "Najpierw CYKLOP — dopiero potem zbieranie (12.1a).",
    );
  });

  it("lets the Wróg itself be taken once it has been fought", () => {
    const beaten = table({
      game: {
        turn_state: onField({
          drawn: [{ cardId: "cyklop", cardClass: "foe" }],
          fought: ["cyklop"],
        }),
      },
    });
    expect(takeCard(beaten, { seatId: "seat-a", cardId: "cyklop" }).result.kind).toBe("trophy");
  });

  /** 5.4: four Przedmioty, and a Wróg or a Przyjaciel is neither. */
  it("refuses a fifth Przedmiot (5.4)", () => {
    const full = table({
      holdings: ["helm", "tarcza", "miecz", "zbroja"].map((cardId, i) =>
        aHolding({ id: `h${i}`, card_id: cardId, kind: "item" }),
      ),
    });
    expect(() => takeCard(full, { seatId: "seat-a", cardId: "sztylet" })).toThrow(
      "Postać może nieść najwyżej 4 Przedmioty (5.4). Odrzuć coś najpierw.",
    );
  });

  it("still takes a Przyjaciel with a full pack (6.3 puts no limit on them)", () => {
    const full = table({
      holdings: ["helm", "tarcza", "miecz", "zbroja"].map((cardId, i) =>
        aHolding({ id: `h${i}`, card_id: cardId, kind: "item" }),
      ),
    });
    expect(takeCard(full, { seatId: "seat-a", cardId: "gnom" }).result.kind).toBe("friend");
  });

  /**
   * 21.2: the Wyposażenie is a finite stock, and every copy in play is one that
   * is not on the pile — held by anybody, or lying on any field.
   */
  it("refuses a shop card when every printed copy is already in play (21.2)", () => {
    const printed = PRINTED_STOCK["magiczny-miecz"];
    expect(printed).toBeGreaterThan(0);
    const gone = table({
      fieldCards: Array.from({ length: printed }, (_, i) => ({
        id: `fc${i}`,
        field_id: ELSEWHERE,
        card_id: "magiczny-miecz",
        granted: false,
        pool: null,
      })),
    });
    expect(() => takeCard(gone, { seatId: "seat-a", cardId: "magiczny-miecz" })).toThrow(
      "MAGICZNY MIECZ — nie ma już ani jednej w Wyposażeniu (21.2).",
    );
  });

  /**
   * 16.6: "musi je zamienić na identyczne z Wyposażenia, a wyciągnięte odłożyć
   * na stos zużytych". The one case that runs towards the deck rather than away
   * from it — this copy did come off it.
   */
  it("puts the drawn copy of a Wyposażenie card back on the used pile (16.6)", () => {
    const { writes } = takeCard(table(), { seatId: "seat-a", cardId: "magiczny-miecz" });
    expect(discardOf(writes, "events")).toEqual([EVENT_COPIES.get("magiczny-miecz")![0]]);
  });

  it("gives nothing back for a granted copy — the deck never gave one up", () => {
    const { writes } = takeCard(table(), {
      seatId: "seat-a",
      cardId: "magiczny-miecz",
      granted: true,
    });
    expect(writes.game?.deck).toBeUndefined();
    expect(writes.holdings?.insert?.[0]).toMatchObject({ granted: true });
  });

  /** 16.8 counts what nobody took, so a taken card leaves the turn's stack. */
  it("lifts the card off the turn's own stack", () => {
    const drawn = table({
      game: {
        turn_state: onField({
          drawn: [
            { cardId: "helm", cardClass: "item" },
            { cardId: "tarcza", cardClass: "item" },
          ],
        }),
      },
    });
    const { writes } = takeCard(drawn, { seatId: "seat-a", cardId: "helm" });
    const after = top(apply(drawn, writes).game.turn_state);
    expect(after.phase === "field" && after.drawn.map((c) => c.cardId)).toEqual(["tarcza"]);
  });
});

/* ==========================================================================
 * Putting one down (5.5, 5.6, 6.4, 9.4, 9.6, 21.3)
 * ======================================================================= */

describe("dropping a card", () => {
  const table = (holdings: ReturnType<typeof aHolding>[], seat: Partial<Snapshot["seats"][0]> = {}) =>
    aTable({ seats: [aSeat({ id: "seat-a", field_id: HERE, ...seat })], holdings });

  /** 5.5, 21.3: it is left "na Obszarze, na którym aktualnie się znajduje". */
  it("leaves a Przedmiot lying on the Obszar", () => {
    const { writes } = dropCard(table([aHolding({ id: "h1", card_id: "helm" })]), {
      holdingId: "h1",
    });
    expect(writes.holdings?.delete).toEqual(["h1"]);
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: HERE, card_id: "helm", granted: false },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      seatId: "seat-a",
      kind: "discarded",
      payload: { cardId: "helm", kind: "item", onField: HERE },
    });
  });

  /** 6.4: a dismissed Przyjaciel is left there too. */
  it("leaves a Przyjaciel there as well", () => {
    const { writes } = dropCard(
      table([aHolding({ id: "h1", card_id: "gnom", kind: "friend" })]),
      { holdingId: "h1" },
    );
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: HERE, card_id: "gnom", granted: false },
    ]);
  });

  it("keeps `granted` on the card it puts down", () => {
    const { writes } = dropCard(
      table([aHolding({ id: "h1", card_id: "helm", granted: true })]),
      { holdingId: "h1" },
    );
    expect(writes.fieldCards?.insert?.[0]).toMatchObject({ granted: true });
  });

  /**
   * 9.4: "Postać nie może odrzucać Zaklęć, chyba, że posiada ich więcej, niż
   * wynika to z jej parametru Magii." Magia 2 allows one; one held is not more.
   */
  it("refuses a Zaklęcie inside the allowance (9.4, 2.6)", () => {
    const one = table([aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" })], {
      magic_own: 2,
    });
    expect(() => dropCard(one, { holdingId: "s1" })).toThrow(
      "Zaklęć nie odrzuca się, dopóki nie masz ich więcej niż 1 (9.4, 2.6).",
    );
  });

  /** 9.6 names the pile a spent Zaklęcie goes to, and a shed one goes there too. */
  it("sends an excess Zaklęcie to the spells pile", () => {
    const two = table(
      [
        aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" }),
        aHolding({ id: "s2", card_id: "ocalony", kind: "spell" }),
      ],
      { magic_own: 2 },
    );
    const { writes } = dropCard(two, { holdingId: "s1" });
    expect(writes.fieldCards?.insert ?? []).toEqual([]);
    expect(discardOf(writes, "spells")).toEqual([SPELL_COPIES.get("krag-plomieni")![0]]);
    expect(writes.journal?.[0]).toMatchObject({
      payload: { cardId: "krag-plomieni", kind: "spell", onField: null },
    });
  });

  /** 1.4 sends a traded trophy to the used pile; a shed one goes the same way. */
  it("sends a trophy to the events pile rather than laying it on the ground", () => {
    const { writes } = dropCard(
      table([aHolding({ id: "t1", card_id: "cyklop", kind: "trophy" })]),
      { holdingId: "t1" },
    );
    expect(writes.fieldCards?.insert ?? []).toEqual([]);
    expect(discardOf(writes, "events")).toEqual([EVENT_COPIES.get("cyklop")![0]]);
  });

  /** A conjured card belongs to no pile and joins none. */
  it("gives a granted trophy back to nobody", () => {
    const { writes } = dropCard(
      table([aHolding({ id: "t1", card_id: "cyklop", kind: "trophy", granted: true })]),
      { holdingId: "t1" },
    );
    expect(writes.game?.deck).toBeUndefined();
  });

  /** Nowhere to lay it down, so it goes nowhere — but the hand is still emptied. */
  it("only empties the hand for a seat that is standing nowhere", () => {
    const nowhere = table([aHolding({ id: "h1", card_id: "helm" })], { field_id: null });
    const { writes } = dropCard(nowhere, { holdingId: "h1" });
    expect(writes.holdings?.delete).toEqual(["h1"]);
    expect(writes.fieldCards?.insert ?? []).toEqual([]);
  });
});

/* ==========================================================================
 * Arranging what is already held.
 * ======================================================================= */

describe("arranging the pack", () => {
  const table = () =>
    aTable({
      seats: [aSeat({ id: "seat-a" }), aSeat({ id: "seat-b", seat_index: 1 })],
      holdings: [
        aHolding({ id: "h1", card_id: "helm" }),
        aHolding({ id: "h2", card_id: "tarcza" }),
        aHolding({ id: "h3", card_id: "miecz", seat_id: "seat-b" }),
      ],
    });

  /** One-based, so an unarranged card — null, and sorting last — cannot collide. */
  it("numbers the pack from one", () => {
    const { writes } = reorderPack(table(), { seatId: "seat-a", holdingIds: ["h2", "h1"] });
    expect(writes.holdings?.patch).toEqual([
      { id: "h2", patch: { ordinal: 1 } },
      { id: "h1", patch: { ordinal: 2 } },
    ]);
  });

  it("renumbers nothing of somebody else's, rather than reaching into their pack", () => {
    const { writes } = reorderPack(table(), { seatId: "seat-a", holdingIds: ["h3", "h1"] });
    expect(writes.holdings?.patch).toEqual([{ id: "h1", patch: { ordinal: 1 } }]);
  });

  it("writes nothing when none of the ids are the seat's", () => {
    expect(reorderPack(table(), { seatId: "seat-a", holdingIds: ["h3"] }).writes).toEqual({});
  });

  /** Not journalled: the order of your own pack is nobody else's business. */
  it("says nothing to the journal", () => {
    expect(
      reorderPack(table(), { seatId: "seat-a", holdingIds: ["h1"] }).writes.journal,
    ).toBeUndefined();
  });
});

describe("wearing a Przedmiot (slotowy)", () => {
  const slotted = (holdings: ReturnType<typeof aHolding>[]) =>
    aTable({
      game: { eq_mode: "slots" },
      seats: [aSeat({ id: "seat-a" })],
      holdings,
    });

  it("refuses at a table playing classic equipment", () => {
    const classic = aTable({ holdings: [aHolding({ id: "h1" })] });
    expect(() => equipCard(classic, { holdingId: "h1", slot: "head" })).toThrow(
      "Ten stół gra klasycznym ekwipunkiem — nie ma miejsc na przedmioty.",
    );
  });

  it("refuses a card nobody holds", () => {
    expect(() => equipCard(slotted([]), { holdingId: "nope", slot: "head" })).toThrow(
      "Nie ma takiej karty.",
    );
  });

  it("refuses anything that is not a Przedmiot", () => {
    const friend = slotted([aHolding({ id: "f1", card_id: "gnom", kind: "friend" })]);
    expect(() => equipCard(friend, { holdingId: "f1", slot: "head" })).toThrow(
      "Zakładać można tylko Przedmioty.",
    );
  });

  /**
   * 5.3, at the moment of putting it on.
   *
   * `takeCard` already refuses a card a Natura may not hold, so play alone
   * cannot reach this — but the console hands cards out by fiat and 7.2 moves a
   * Natura under cards already held, and a card that would do nothing must not
   * go on silently: a click that appears to work and changes no number is worse
   * than a refusal that says why.
   */
  it("refuses a card the wearer's Natura forbids (5.3)", () => {
    const good = aTable({
      game: { eq_mode: "slots" },
      seats: [aSeat({ id: "seat-a", nature: "good" })],
      holdings: [aHolding({ id: "h1", card_id: "miecz-chaosu" })],
    });
    expect(() => equipCard(good, { holdingId: "h1", slot: "main-hand" })).toThrow(
      /Natura nie pozwala/,
    );
  });

  it("lets the Natura that may hold it put it on", () => {
    const evil = aTable({
      game: { eq_mode: "slots" },
      seats: [aSeat({ id: "seat-a", nature: "evil" })],
      holdings: [aHolding({ id: "h1", card_id: "miecz-chaosu" })],
    });
    expect(
      equipCard(evil, { holdingId: "h1", slot: "main-hand" }).writes.holdings?.patch,
    ).toEqual([{ id: "h1", patch: { slot: "main-hand" } }]);
  });

  it("puts a Hełm on the head", () => {
    const { writes } = equipCard(slotted([aHolding({ id: "h1", card_id: "helm" })]), {
      holdingId: "h1",
      slot: "head",
    });
    expect(writes.holdings?.patch).toEqual([{ id: "h1", patch: { slot: "head" } }]);
  });

  /** Somewhere it does go, so the refusal names the place it does not. */
  it("refuses a wearable card in the wrong place", () => {
    const { holdingId, table } = {
      holdingId: "h1",
      table: slotted([aHolding({ id: "h1", card_id: "helm" })]),
    };
    expect(() => equipCard(table, { holdingId, slot: "body" })).toThrow(
      "HEŁM nie pasuje w to miejsce (Tułów).",
    );
  });

  /** Nowhere at all, so the refusal says that instead of posing a puzzle. */
  it("refuses a card that is not a thing to wear", () => {
    const carried = slotted([aHolding({ id: "h1", card_id: "latarnia" })]);
    expect(() => equipCard(carried, { holdingId: "h1", slot: "head" })).toThrow(
      "LATARNIA to nie jest rzecz do noszenia — zostaje w plecaku.",
    );
  });

  /** The two change places, rather than the old one landing at the back. */
  it("swaps the occupant into the square the new one is leaving", () => {
    const table = slotted([
      aHolding({ id: "worn", card_id: "miecz", slot: "main-hand", ordinal: null }),
      aHolding({ id: "new", card_id: "excalibur", slot: null, ordinal: 3 }),
    ]);
    const { writes } = equipCard(table, { holdingId: "new", slot: "main-hand" });
    expect(writes.holdings?.patch).toEqual([
      { id: "worn", patch: { slot: null, ordinal: 3 } },
      { id: "new", patch: { slot: "main-hand" } },
    ]);
  });

  it("takes a card off into the pack", () => {
    const table = slotted([aHolding({ id: "h1", card_id: "helm", slot: "head" })]);
    expect(equipCard(table, { holdingId: "h1", slot: null }).writes.holdings?.patch).toEqual([
      { id: "h1", patch: { slot: null } },
    ]);
  });

  /** The client sends this whenever a card is dropped, including where it was. */
  it("writes nothing when the card is already in the pack", () => {
    const table = slotted([aHolding({ id: "h1", card_id: "helm", slot: null })]);
    expect(equipCard(table, { holdingId: "h1", slot: null }).writes).toEqual({});
  });

  /** 5.6's answer to being over the limit is to drop something, so it says so. */
  it("refuses to unequip into a full pack (5.4, 5.6)", () => {
    const pack = Array.from({ length: 16 }, (_, i) =>
      aHolding({ id: `p${i}`, card_id: "sztylet", slot: null }),
    );
    const table = slotted([...pack, aHolding({ id: "h1", card_id: "helm", slot: "head" })]);
    expect(() => equipCard(table, { holdingId: "h1", slot: null })).toThrow(
      "Plecak jest pełny — najpierw coś odrzuć (5.4, 5.6).",
    );
  });
});

/* ==========================================================================
 * Reaching for what is lying on the Obszar (12.1)
 * ======================================================================= */

describe("picking something up off the Obszar (12.1)", () => {
  const lying = { id: "fc1", field_id: HERE, card_id: "helm", granted: false, pool: null };

  const table = (over: Parameters<typeof aTable>[0] = {}) =>
    aTable({
      game: { active_seat: 0, turn_state: onField(), ...(over.game ?? {}) },
      seats: over.seats ?? [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE })],
      fieldCards: over.fieldCards ?? [lying],
      holdings: over.holdings ?? [],
    });

  it("takes the card off the field and into the pack", () => {
    const { writes, result } = takeFromField(table(), {
      seatId: "seat-a",
      fieldCardId: "fc1",
    });
    expect(writes.fieldCards?.delete).toEqual(["fc1"]);
    expect(writes.holdings?.insert).toEqual([
      { seat_id: "seat-a", card_id: "helm", kind: "item", face: "open", granted: false },
    ]);
    expect(result.kind).toBe("item");
  });

  it("carries `granted` across so a conjured card stays conjured", () => {
    const conjured = table({ fieldCards: [{ ...lying, granted: true }] });
    const { writes } = takeFromField(conjured, { seatId: "seat-a", fieldCardId: "fc1" });
    expect(writes.holdings?.insert?.[0]).toMatchObject({ granted: true });
  });

  it("refuses somebody whose turn it is not", () => {
    const other = table({ game: { active_seat: 1 } });
    expect(() => takeFromField(other, { seatId: "seat-a", fieldCardId: "fc1" })).toThrow(
      "To nie twoja tura (10.1).",
    );
  });

  it("refuses an unknown seat", () => {
    expect(() => takeFromField(table(), { seatId: "seat-z", fieldCardId: "fc1" })).toThrow(
      "Nieznane miejsce.",
    );
  });

  it("refuses a card that has already gone", () => {
    expect(() => takeFromField(table(), { seatId: "seat-a", fieldCardId: "fc9" })).toThrow(
      "Tej Karty już tam nie ma.",
    );
  });

  it("refuses a card lying somewhere else", () => {
    const far = table({ fieldCards: [{ ...lying, field_id: ELSEWHERE }] });
    expect(() => takeFromField(far, { seatId: "seat-a", fieldCardId: "fc1" })).toThrow(
      "Można zabierać tylko z Obszaru, na którym się stoi (12.1).",
    );
  });

  /** 13.1 from the other side: nothing happens on the Obszar you start on. */
  it("refuses before the move has ended here", () => {
    const rolling = table({ game: { turn_state: { phase: "roll" } } });
    expect(() => takeFromField(rolling, { seatId: "seat-a", fieldCardId: "fc1" })).toThrow(
      "Zabierać można tylko po zakończeniu ruchu na tym Obszarze (12.1).",
    );
  });

  /** 12.1 a): "należy najpierw pokonać Wrogów albo im uciec". */
  it("refuses while an unfought Wróg lies on the same Obszar", () => {
    const guarded = table({
      fieldCards: [lying, { id: "fc2", field_id: HERE, card_id: "cyklop", granted: false, pool: null }],
    });
    expect(() => takeFromField(guarded, { seatId: "seat-a", fieldCardId: "fc1" })).toThrow(
      "Najpierw CYKLOP — dopiero potem zbieranie (12.1a).",
    );
  });

  it("lets it through once that Wróg has been fought", () => {
    const beaten = table({
      game: { turn_state: onField({ fought: ["cyklop"] }) },
      fieldCards: [lying, { id: "fc2", field_id: HERE, card_id: "cyklop", granted: false, pool: null }],
    });
    expect(takeFromField(beaten, { seatId: "seat-a", fieldCardId: "fc1" }).result.kind).toBe(
      "item",
    );
  });

  /** 12.1 b): "lub rozpatrzeć treść wyciągniętych Kart". */
  it("refuses while the Obszar still owes Karty", () => {
    const owing = table({ game: { turn_state: onField({ draw: 2, drawn: [] }) } });
    expect(() => takeFromField(owing, { seatId: "seat-a", fieldCardId: "fc1" })).toThrow(
      "Najpierw wyciągnij Karty, które ten Obszar każe ciągnąć (12.1b).",
    );
  });

  /**
   * A card that cannot be picked up is a card still on the field (5.3).
   *
   * The store had to delete the row and put it back by hand when `takeCard`
   * refused; a command that throws writes nothing at all, so the rollback is
   * the absence of a changeset.
   */
  it("writes nothing at all when the card may not be held", () => {
    const forbidden = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, nature: "evil" })],
      fieldCards: [{ ...lying, card_id: "swieta-wlocznia" }],
    });
    expect(() => takeFromField(forbidden, { seatId: "seat-a", fieldCardId: "fc1" })).toThrow(
      /Natura nie pozwala/,
    );
  });

  /** The field card goes first, so 21.2's stock does not count it twice. */
  it("counts the copy it is lifting as gone before checking the stock (21.2)", () => {
    const printed = PRINTED_STOCK["tarcza-tolimana"];
    const all = Array.from({ length: printed }, (_, i) => ({
      id: `fc${i}`,
      field_id: HERE,
      card_id: "tarcza-tolimana",
      granted: false,
      pool: null,
    }));
    const table_ = table({ fieldCards: all });
    expect(takeFromField(table_, { seatId: "seat-a", fieldCardId: "fc0" }).result.kind).toBe(
      "item",
    );
  });
});

/* ==========================================================================
 * The test console's two shortcuts.
 * ======================================================================= */

describe("placing a card by fiat", () => {
  const table = () => aTable({ seats: [aSeat({ id: "seat-a", field_id: HERE })] });

  it("lays it on the Obszar the seat is standing on", () => {
    const { writes, result } = placeCard(table(), {
      seatId: "seat-a",
      cardId: "helm",
      target: null,
    });
    expect(result).toBe(HERE);
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: HERE, card_id: "helm", granted: true },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "test-card-field",
      payload: { cardId: "helm", fieldId: HERE },
      manual: true,
    });
  });

  it("lays it wherever it is told to instead", () => {
    expect(
      placeCard(table(), { seatId: "seat-a", cardId: "helm", target: ELSEWHERE }).result,
    ).toBe(ELSEWHERE);
  });

  /** 9.6 sends a spent spell to the pile; nothing in the box puts one on a field. */
  it("refuses a Zaklęcie", () => {
    expect(() =>
      placeCard(table(), { seatId: "seat-a", cardId: "krag-plomieni", target: null }),
    ).toThrow("Zaklęcia nie leżą na Obszarze (9.6).");
  });

  it("refuses a card it has never heard of", () => {
    expect(() => placeCard(table(), { seatId: "seat-a", cardId: "gruszka", target: null })).toThrow(
      "Nie wiem, czym jest: gruszka",
    );
  });

  it("refuses an unknown seat", () => {
    expect(() => placeCard(table(), { seatId: "seat-z", cardId: "helm", target: null })).toThrow(
      "Nieznane miejsce.",
    );
  });

  it("asks for an Obszar when nobody is standing anywhere", () => {
    const nowhere = aTable({ seats: [aSeat({ id: "seat-a", field_id: null })] });
    expect(() => placeCard(nowhere, { seatId: "seat-a", cardId: "helm", target: null })).toThrow(
      "Ta Postać nigdzie nie stoi — podaj Obszar.",
    );
  });
});

describe("granting a card by fiat", () => {
  const table = () => aTable({ seats: [aSeat({ id: "seat-a" })] });

  it("hands over a Przedmiot face up, marked as conjured", () => {
    const { writes } = grantCard(table(), { seatId: "seat-a", cardId: "helm" });
    expect(writes.holdings?.insert).toEqual([
      {
        seat_id: "seat-a",
        card_id: "helm",
        kind: "item",
        face: "open",
        granted: true,
      },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "test-card",
      payload: { cardId: "helm", kind: "item" },
      manual: true,
    });
  });

  /** 9.3 keeps a Zaklęcie face down even when it arrived by fiat. */
  it("hands over a Zaklęcie face down", () => {
    const { writes } = grantCard(table(), { seatId: "seat-a", cardId: "krag-plomieni" });
    expect(writes.holdings?.insert?.[0]).toMatchObject({ kind: "spell", face: "hidden" });
  });

  it("hands over a Przyjaciel", () => {
    const { writes } = grantCard(table(), { seatId: "seat-a", cardId: "gnom" });
    expect(writes.holdings?.insert?.[0]).toMatchObject({ kind: "friend" });
  });

  /** A trophy is a memory of a fight, so there is nothing to conjure. */
  it("refuses a Wróg", () => {
    expect(() => grantCard(table(), { seatId: "seat-a", cardId: "cyklop" })).toThrow(
      "Wroga trzeba pokonać, nie wziąć (16.2).",
    );
  });

  /**
   * And says what it is, and where it goes instead.
   *
   * This used to share "Nie wiem, czym jest" with a card the app has genuinely
   * never heard of, which was a small lie: it knows exactly what MGŁA is. The
   * two are separate now, and the one the app knows names the door.
   */
  it("refuses a Spotkanie, which is nobody's to hold", () => {
    expect(() => grantCard(table(), { seatId: "seat-a", cardId: "mgla" })).toThrow(/Spotkanie/);
    expect(() => grantCard(table(), { seatId: "seat-a", cardId: "mgla" })).toThrow(/stack/);
  });

  it("refuses a card it has never heard of", () => {
    expect(() => grantCard(table(), { seatId: "seat-a", cardId: "gruszka" })).toThrow(
      "Nie wiem, czym jest: gruszka",
    );
  });
});

/**
 * Sweeping an Obszar clear — `place`'s inverse, and the one act the game has
 * no lawful version of.
 *
 * A Karta leaves a field by being taken (16.6), beaten (16.2) or lifted into
 * an arriving turn. A test table that dressed a field had no way to undress it.
 */
describe("clearing an Obszar", () => {
  const table = (cards: { id: string; card_id: string; granted?: boolean }[]) =>
    aTable({
      seats: [aSeat({ id: "seat-a", field_id: HERE })],
      fieldCards: cards.map((one) => ({
        id: one.id,
        field_id: HERE,
        card_id: one.card_id,
        granted: one.granted ?? false,
        pool: null,
      })),
      game: { deck: { events: { draw: [], discard: [] }, spells: { draw: [], discard: [] } } },
    });

  it("takes everything off and says how much", () => {
    const { writes, result } = clearField(table([
      { id: "fc-1", card_id: "cyklop" },
      { id: "fc-2", card_id: "helm" },
    ]), { seatId: "seat-a", fieldId: HERE });
    expect(result.cards).toEqual(["cyklop", "helm"]);
    expect(writes.fieldCards?.delete).toEqual(["fc-1", "fc-2"]);
  });

  /** 16.8's leftovers go where leftovers go, so 9.5 can deal them again. */
  it("sends the Karty to the stos zużytych rather than out of the box", () => {
    const { writes } = clearField(table([{ id: "fc-1", card_id: "cyklop" }]), {
      seatId: "seat-a",
      fieldId: HERE,
    });
    expect(discardOf(writes, "events")).toEqual([EVENT_COPIES.get("cyklop")![0]]);
  });

  /**
   * Except a conjured one, which no pile ever gave up.
   *
   * `putOnPile` is what knows this, and it is why sweeping is routed through it
   * rather than through a bare delete: a `deal`-ed Cyklop reaching the used
   * pile would hand the deck a second one.
   */
  it("leaves a conjured Karta out of the pile", () => {
    const { writes } = clearField(table([{ id: "fc-1", card_id: "cyklop", granted: true }]), {
      seatId: "seat-a",
      fieldId: HERE,
    });
    expect(writes.fieldCards?.delete).toEqual(["fc-1"]);
    expect(discardOf(writes, "events")).toEqual([]);
  });

  /** One row, not every copy: a field can hold two Targowiska. */
  it("takes one named Karta and leaves its twin", () => {
    const { writes, result } = clearField(
      table([
        { id: "fc-1", card_id: "targowisko" },
        { id: "fc-2", card_id: "targowisko" },
        { id: "fc-3", card_id: "cyklop" },
      ]),
      { seatId: "seat-a", fieldId: HERE, cardIds: ["targowisko"] },
    );
    expect(result.cards).toEqual(["targowisko"]);
    expect(writes.fieldCards?.delete).toEqual(["fc-1"]);
  });

  it("says so when the named Karta is not lying there", () => {
    expect(() =>
      clearField(table([{ id: "fc-1", card_id: "cyklop" }]), {
        seatId: "seat-a",
        fieldId: HERE,
        cardIds: ["targowisko"],
      }),
    ).toThrow(/nie leży na tym Obszarze/);
  });

  it("says so rather than sweeping nothing", () => {
    expect(() => clearField(table([]), { seatId: "seat-a", fieldId: HERE })).toThrow(
      "Na tym Obszarze nic nie leży.",
    );
  });

  /**
   * The half the board does not hold: what the turn standing here lifted.
   *
   * Arriving takes every row off the Obszar and into the frame (16.8), so on
   * the square somebody is standing on there are usually no rows at all — and
   * `clear SIDH` answered „Na tym Obszarze nic nie leży" with the Obszar's own
   * window listing SIDH. One Karta, one square, two places to keep it, and
   * only the app knows which.
   */
  describe("and the Karty the turn is holding face up", () => {
    const standing = (drawn: { cardId: string; granted?: boolean }[], over: Record<string, unknown> = {}) =>
      aTable({
        seats: [aSeat({ id: "seat-a", field_id: HERE })],
        game: {
          deck: { events: { draw: [], discard: [] }, spells: { draw: [], discard: [] } },
          turn_state: only({
            phase: "field",
            fieldId: HERE,
            from: null,
            draw: 0,
            drawn: drawn.map((one) => ({ cardId: one.cardId, cardClass: "place" as const, ...(one.granted ? { granted: true } : {}) })),
            ...over,
          }),
        },
      });

    it("sweeps a named Karta out of the turn when no row holds it", () => {
      const at = standing([{ cardId: "sidh" }, { cardId: "grota" }]);
      const { writes, result } = clearField(at, { seatId: "seat-a", fieldId: HERE, cardIds: ["sidh"] });
      expect(result.cards).toEqual(["sidh"]);
      expect(top(writes.game!.turn_state!)).toMatchObject({
        phase: "field",
        drawn: [{ cardId: "grota" }],
      });
      // And to the used pile, like any other leftover.
      expect(discardOf(writes, "events")).toEqual([EVENT_COPIES.get("sidh")![0]]);
    });

    it("sweeps the lot when nothing is named", () => {
      const at = standing([{ cardId: "sidh" }, { cardId: "grota" }]);
      const { result, writes } = clearField(at, { seatId: "seat-a", fieldId: HERE });
      expect(result.cards).toEqual(["sidh", "grota"]);
      expect(top(writes.game!.turn_state!)).toMatchObject({ drawn: [] });
    });

    /**
     * A card gone from `drawn` has to go from the lists that name it, or the
     * turn holds an id with no Karta behind it.
     */
    it("takes the swept Karta out of `resolved` with it", () => {
      const at = standing([{ cardId: "sidh" }, { cardId: "grota" }], {
        resolved: ["sidh", "grota"],
      });
      const { writes } = clearField(at, { seatId: "seat-a", fieldId: HERE, cardIds: ["sidh"] });
      expect(top(writes.game!.turn_state!)).toMatchObject({ resolved: ["grota"] });
    });

    /** The board's copy goes first, so the two halves are ordered, not raced. */
    it("prefers a row on the board to the same Karta in the turn", () => {
      const at = aTable({
        seats: [aSeat({ id: "seat-a", field_id: HERE })],
        fieldCards: [{ id: "fc-1", field_id: HERE, card_id: "sidh", granted: false, pool: null }],
        game: {
          deck: { events: { draw: [], discard: [] }, spells: { draw: [], discard: [] } },
          turn_state: only({
            phase: "field",
            fieldId: HERE,
            from: null,
            draw: 0,
            drawn: [{ cardId: "sidh", cardClass: "place" as const }],
          }),
        },
      });
      const { writes } = clearField(at, { seatId: "seat-a", fieldId: HERE, cardIds: ["sidh"] });
      expect(writes.fieldCards?.delete).toEqual(["fc-1"]);
      expect(writes.game?.turn_state).toBeUndefined();
    });

    /** Somebody else's turn, on another Obszar, is none of this Obszar's business. */
    it("leaves a frame standing on a different Obszar alone", () => {
      const at = aTable({
        seats: [aSeat({ id: "seat-a", field_id: HERE })],
        game: {
          deck: { events: { draw: [], discard: [] }, spells: { draw: [], discard: [] } },
          turn_state: only({
            phase: "field",
            fieldId: asFieldId("karczma")!,
            from: null,
            draw: 0,
            drawn: [{ cardId: "sidh", cardClass: "place" as const }],
          }),
        },
      });
      expect(() => clearField(at, { seatId: "seat-a", fieldId: HERE })).toThrow(
        "Na tym Obszarze nic nie leży.",
      );
    });
  });

  /** Marked manual, and it names what was swept — 16.8 made that public. */
  it("writes down what it took", () => {
    const { writes } = clearField(table([{ id: "fc-1", card_id: "cyklop" }]), {
      seatId: "seat-a",
      fieldId: HERE,
    });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "override",
      manual: true,
      payload: { what: "clear-field", fieldId: HERE, cards: ["cyklop"] },
    });
  });
});
