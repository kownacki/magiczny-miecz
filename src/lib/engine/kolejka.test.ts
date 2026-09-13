import { describe, expect, it } from "vitest";
import {
  cardInFront,
  isSpent,
  kolejkaFor,
  leavesWhenResolved,
  nextFrame,
  offeredNotQueued,
  owesAFrame,
} from "./kolejka";
import { resolutionOrder, type TurnCard } from "./state";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import type { CardId } from "@/data/ids";
import { keyNamed, keyOf, type SettledKey } from "@/lib/engine/state";

const classOf = (cardId: CardId) =>
  (events as EventCard[]).find((card) => card.id === cardId)!.cardClass;

/** Built through `resolutionOrder`, because that is what the frame really gets. */
const onField = (...cardIds: CardId[]): TurnCard[] =>
  resolutionOrder(cardIds.map((cardId) => ({ cardId, cardClass: classOf(cardId) })));

const shape = (cards: TurnCard[], resolved: SettledKey[] = []) =>
  kolejkaFor(cards, resolved).map(
    (frame) => [frame.kind, frame.cards.map((c) => c.cardId), frame.done] as const,
  );

describe("owesAFrame — what the turn must stop for", () => {
  it("stops for a Spotkanie, which 16.1 makes binding", () => {
    expect(owesAFrame(onField("mgla")[0])).toBe(true);
  });

  it("stops for both kinds of Wróg", () => {
    expect(owesAFrame(onField("wilk")[0])).toBe(true);
    expect(owesAFrame(onField("demon")[0])).toBe(true);
  });

  /**
   * 19.1: a Wróg the Krąg Płomieni or the Władca Gromu has put out of reach
   * does nothing and cannot be fought, so it owes the kolejka no frame — set
   * from the card's own status at the lift, not from its class. No printed
   * Wróg's own script ever sets `optional`, so `mayWalkPast` could not have
   * answered this on its own.
   */
  it("does not stop for a Wróg out of reach, whatever its class", () => {
    expect(owesAFrame({ ...onField("wilk")[0], unattackable: true })).toBe(false);
    expect(owesAFrame({ ...onField("demon")[0], unattackable: true })).toBe(false);
  });

  /**
   * 16.6 is the one class whose own rule says "może", and 12.1 gives the taking
   * the run of the turn. Loot is offered, never queued.
   */
  it("never stops for a Przedmiot or a Przyjaciel", () => {
    expect(owesAFrame(onField("helm")[0])).toBe(false);
    expect(owesAFrame(onField("rycerz")[0])).toBe(false);
  });

  /**
   * Every Nieznajomy and every Miejsce, whatever verb it prints.
   *
   * 15.2: „rozpatrywane są **pozostałe Karty Zdarzeń** … znajdujące się lub
   * wyciągnięte na danym Obszarze. **Konieczne** jest przy tym zachowanie
   * kolejności". 16.5: „konieczne jest wykonanie zawartej w Karcie instrukcji".
   * Nothing in the box takes a Karta out of the sequence for being an offer.
   *
   * This asked `mayWalkPast` and so left fifteen Karty out of the row
   * altogether: a square with a CUDOTWÓRCA, a CZARODZIEJ and a DOBRE BÓSTWO
   * opened on the Bóstwo and the other two were simply not there. What „możesz"
   * buys is a way *past* — `skipCard` — not an exemption from the row.
   */
  it("stops for every Nieznajomy, the ones you visit included", () => {
    expect(owesAFrame(onField("urocza-diablica")[0])).toBe(true);
    expect(owesAFrame(onField("sztukmistrz")[0])).toBe(true);
  });

  it("stops for every Miejsce, the ones you may enter included", () => {
    // "Każdy, kto tu trafi o Magii mniejszej niż 5, gubi się w nim."
    expect(owesAFrame(onField("labirynt")[0])).toBe(true);
    expect(owesAFrame(onField("spalona-ziemia")[0])).toBe(true);
    // „Jeżeli chcesz do niej wejść, rzuć kostką" — a visit, and still in the
    // row: 15.2 sequences it, `skipCard` is the one press that gets past it.
    expect(owesAFrame(onField("grota")[0])).toBe(true);
    expect(owesAFrame(onField("targowisko")[0])).toBe(true);
  });

  /** 15.1 sits above the numerals; a Karta that relocates cannot be left lying. */
  it("stops for a Karta that sends itself to a named Obszar", () => {
    expect(owesAFrame(onField("eremita")[0])).toBe(true);
    expect(owesAFrame(onField("upior")[0])).toBe(true);
  });
});

describe("kolejkaFor", () => {
  it("is empty on an Obszar holding nothing but loot", () => {
    expect(shape(onField("helm", "rycerz", "miecz"))).toEqual([]);
  });

  /** 15.1 first, then the numerals — the order `resolutionOrder` already made. */
  it("puts a relocating Karta ahead of everything, whatever it prints", () => {
    // The Upiór is a Demon (III) and still goes before a Spotkanie (I).
    expect(shape(onField("mgla", "upior"))).toEqual([
      ["placed", ["upior"], false],
      ["spotkanie", ["mgla"], false],
    ]);
  });

  it("gives each relocating Karta its own frame, since each rolls its own Obszar", () => {
    expect(shape(onField("eremita", "lewiatan")).map(([kind]) => kind)).toEqual([
      "placed",
      "placed",
    ]);
  });

  /**
   * 17.5: "Miecze tych istot są sumowane". A Wilk and a Wilkołak are one fight
   * at Miecz 12, not two fights in some order.
   */
  it("gathers every Bestia into one frame", () => {
    expect(shape(onField("wilk", "wilkolak"))).toEqual([
      ["wrogowie-miecz", ["wilk", "wilkolak"], false],
    ]);
  });

  /**
   * And 18.2 the same for Magia — but the two stats cannot be added to each
   * other, so an Obszar holding both kinds gives exactly two fights.
   */
  it("keeps the Demony in a frame of their own, II before III", () => {
    expect(shape(onField("demon", "wilk", "widmo"))).toEqual([
      ["wrogowie-miecz", ["wilk"], false],
      ["wrogowie-magia", ["demon", "widmo"], false],
    ]);
  });

  it("gives each Nieznajomy and Miejsce a frame of its own", () => {
    expect(shape(onField("urocza-diablica", "labirynt"))).toEqual([
      ["nieznajomy", ["urocza-diablica"], false],
      ["miejsce", ["labirynt"], false],
    ]);
  });

  /**
   * An Obszar of nothing but offers is still a row to be walked.
   *
   * This used to expect `[]` — „the turn stops for none of it" — which is the
   * reading 15.2 does not support. The Karty are in the sequence; getting past
   * one is one press (`skipCard`) and costs nothing. Only the loot is outside
   * it, because 16.6 is the one class whose *rule* says „może".
   */
  it("still rows up an Obszar of nothing but offers, loot excepted", () => {
    expect(shape(onField("cudotworca", "grota", "helm", "rycerz"))).toEqual([
      ["nieznajomy", ["cudotworca"], false],
      ["miejsce", ["grota"], false],
    ]);
  });

  it("marks a frame done once its Karta has been settled", () => {
    expect(shape(onField("wilk", "labirynt"), [keyNamed("wilk")])).toEqual([
      ["wrogowie-miecz", ["wilk"], true],
      ["miejsce", ["labirynt"], false],
    ]);
  });

  /** A pack is settled together, so half of one is not done. */
  it("calls a Wrogowie frame done only when all of it is", () => {
    expect(shape(onField("wilk", "wilkolak"), [keyNamed("wilk")])[0][2]).toBe(false);
    expect(shape(onField("wilk", "wilkolak"), [keyNamed("wilk"), keyNamed("wilkolak")])[0][2]).toBe(true);
  });

  /** The whole sequence, in the order a turn walks it. */
  it("orders a full Obszar the way 15.1 and 15.2 do", () => {
    const cards = onField(
      "targowisko",
      "labirynt",
      "helm",
      "urocza-diablica",
      "demon",
      "wilk",
      "mgla",
      "upior",
    );
    /* Two Miejsca and two frames: the LABIRYNT catches you and the TARGOWISKO
       is a shop you may walk past, and 15.2 sequences both. Only the HEŁM is
       outside the row (16.6). */
    expect(shape(cards).map(([kind]) => kind)).toEqual([
      "placed",
      "spotkanie",
      "wrogowie-miecz",
      "wrogowie-magia",
      "nieznajomy",
      "miejsce",
      "miejsce",
    ]);
  });
});

describe("nextFrame", () => {
  it("is where the turn is stopped", () => {
    const cards = onField("wilk", "labirynt");
    expect(nextFrame(cards)?.kind).toBe("wrogowie-miecz");
    expect(nextFrame(cards, [keyNamed("wilk")])?.kind).toBe("miejsce");
    expect(nextFrame(cards, [keyNamed("wilk"), keyNamed("labirynt")])).toBeNull();
  });
});

describe("cardInFront — the one Karta the sheet holds up", () => {
  /** Numbered the way a real frame numbers them: `afterMove`/`afterDraw` do. */
  const numbered = (...cardIds: CardId[]): TurnCard[] =>
    onField(...cardIds).map((card, at) => ({ ...card, nth: at + 1 }));

  /**
   * 15.2 orders by numeral and, within one numeral, by arrival. Both of these
   * are Nieznajomi IV, so the one drawn first is the one in front — and both
   * are in the row now, which is the change: the Cudotwórca used to be absent
   * from it and the sheet opened on the Bóstwo behind him.
   */
  it("is whatever the row is stopped at, offers included", () => {
    const cards = onField("cudotworca", "dobre-bostwo");
    expect(cardInFront(cards)?.cardId).toBe("cudotworca");
    expect(cardInFront(cards, [keyNamed("cudotworca")])?.cardId).toBe("dobre-bostwo");
  });

  it("falls back to the first unsettled Karta once nothing is in the way", () => {
    // Neither earns a frame — a Nieznajomy you visit and a Przedmiot lying
    // there — so what is left is 15.2's order: IV before V.
    const cards = onField("helm", "cudotworca");
    expect(cardInFront(cards)?.cardId).toBe("cudotworca");
    expect(cardInFront(cards, [keyNamed("cudotworca")])?.cardId).toBe("helm");
    expect(cardInFront(cards, [keyNamed("cudotworca"), keyNamed("helm")])).toBeNull();
  });

  /**
   * The Eremita bug, at the layer it actually lived on.
   *
   * `resolved` names a *copy* — `eremita#5` — and the sheet was rebuilding the
   * Karty without their `nth` before asking. Every key then missed, the Karta
   * that had just settled was still "in front", and the Eremita who had rolled
   * for his Obszar and moved onto it was held up asking to roll again.
   */
  it("lets go of a Karta settled under its copy's own key", () => {
    const cards = numbered("eremita", "dobre-bostwo");
    expect(cardInFront(cards)?.cardId).toBe("eremita");
    expect(cardInFront(cards, [keyOf({ cardId: "eremita", nth: 1 })])?.cardId).toBe("dobre-bostwo");
    // And a frame written before `nth` existed still answers to a bare name.
    expect(cardInFront(onField("eremita", "dobre-bostwo"), [keyNamed("eremita")])?.cardId).toBe(
      "dobre-bostwo",
    );
  });

  /** Two of one Karta are two Karty: settling one must not settle the other. */
  it("holds the second copy up after the first is settled", () => {
    const cards = numbered("upior", "upior");
    expect(cardInFront(cards, [keyOf({ cardId: "upior", nth: 1 })])?.nth).toBe(2);
  });
});

/**
 * The guard itself, pinned — so that widening the type again fails the build.
 *
 * `@ts-expect-error` is the assertion: if `SettledKey` ever stops being a brand,
 * this line stops erroring and *that* is what breaks. It is the only kind of
 * test that can hold a compile-time rule, and this rule has been broken twice
 * at runtime by readers that looked exactly right.
 */
describe("the keyspace refuses a bare card id", () => {
  it("will not let a reader ask `resolved` by name", () => {
    const cards = onField("wilk");
    // @ts-expect-error `resolved` names a key (`keyOf`/`keyNamed`), not a CardId.
    nextFrame(cards, ["wilk"]);
    // And the two ways that do compile say which question they are asking.
    expect(nextFrame(cards, [keyNamed("wilk")])).toBeNull();
    expect(nextFrame(cards, [keyOf({ cardId: "wilk", nth: 1 })])).not.toBeNull();
  });
});

describe("offeredNotQueued", () => {
  /**
   * The other half of `owesAFrame`, so the two cannot drift into either
   * queueing a Karta twice or losing it between them.
   *
   * What is left outside the row is now only the loot. 16.6 is the one class
   * whose *rule* says „może" and 12.1 gives the taking the run of the turn;
   * every Nieznajomy and Miejsce is sequenced by 15.2 whatever it prints.
   */
  it("is exactly what the kolejka did not take — which is the loot", () => {
    const cards = onField("wilk", "helm", "cudotworca", "labirynt", "rycerz", "grota");
    const queued = kolejkaFor(cards).flatMap((frame) => frame.cards.map((c) => c.cardId));
    const offered = offeredNotQueued(cards).map((c) => c.cardId);
    expect([...queued, ...offered].sort()).toEqual(cards.map((c) => c.cardId).sort());
    expect(offered).toEqual(["helm", "rycerz"]);
  });
});

describe("what is spent by being read (16.1, 16.5, 16.7)", () => {
  const one = (cardId: CardId) => onField(cardId)[0];

  /** "Po osądzeniu cię, Bóstwo znika - odłóż jego Kartę." */
  it("is a Spotkanie, Nieznajomy or Miejsce whose own text says odłóż", () => {
    expect(leavesWhenResolved(one("dobre-bostwo"))).toBe(true);
    expect(leavesWhenResolved(one("kuglarz"))).toBe(true);
    expect(leavesWhenResolved(one("burza-siedmiu-slonc"))).toBe(true);
  });

  /**
   * A Spotkanie is not automatically spent: the MGŁA is `po-turach`, lying on
   * the table for two turns before it goes — "Potem Mgła rozpływa się - odłóż
   * jej Kartę". The disposition is what decides, not the class.
   */
  it("is not a Spotkanie that lingers", () => {
    expect(leavesWhenResolved(one("mgla"))).toBe(false);
  });

  /** A resident stays whatever you do with it — "do końca rozgrywki". */
  it("is not one that lives on the Obszar", () => {
    expect(leavesWhenResolved(one("czarodziej"))).toBe(false);
    expect(leavesWhenResolved(one("targowisko"))).toBe(false);
    expect(leavesWhenResolved(one("labirynt"))).toBe(false);
  });

  /** 16.8 leaves a Przedmiot lying there until somebody picks it up. */
  it("is never a Przedmiot, a Przyjaciel or a Wróg", () => {
    expect(leavesWhenResolved(one("helm"))).toBe(false);
    expect(leavesWhenResolved(one("rycerz"))).toBe(false);
    expect(leavesWhenResolved(one("wilk"))).toBe(false);
  });

  /**
   * Spent is the pair: gone *because* it was read. Until it is resolved it is
   * still on the Obszar, and a Karta that never leaves is never spent however
   * settled it is.
   */
  it("needs both halves", () => {
    expect(isSpent(one("dobre-bostwo"), [])).toBe(false);
    expect(isSpent(one("dobre-bostwo"), [keyNamed("dobre-bostwo")])).toBe(true);
    expect(isSpent(one("czarodziej"), [keyNamed("czarodziej")])).toBe(false);
  });
});

describe("a Wróg who died here (16.2)", () => {
  const wilk = onField("wilk")[0];

  it("is spent, so the row strikes him rather than dropping him", () => {
    expect(isSpent(wilk, [], [keyNamed("wilk")])).toBe(true);
  });

  /**
   * 17.4 settles a fight whichever way it went, so `fought` cannot stand in for
   * `beaten`: the Wróg you ran from is exactly the Karta 16.8 leaves lying
   * there for whoever stops here next.
   */
  it("is not one that was merely fought", () => {
    expect(isSpent(wilk, [keyNamed("wilk")], [])).toBe(false);
  });
});
