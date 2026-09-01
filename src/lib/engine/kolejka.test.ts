import { describe, expect, it } from "vitest";
import { isSpent, kolejkaFor, leavesWhenResolved, nextFrame, offeredNotQueued, owesAFrame } from "./kolejka";
import { resolutionOrder, type TurnCard } from "./state";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

const classOf = (cardId: string) =>
  (events as EventCard[]).find((card) => card.id === cardId)!.cardClass;

/** Built through `resolutionOrder`, because that is what the frame really gets. */
const onField = (...cardIds: string[]): TurnCard[] =>
  resolutionOrder(cardIds.map((cardId) => ({ cardId, cardClass: classOf(cardId) })));

const shape = (cards: TurnCard[], resolved: string[] = []) =>
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
   * 16.6 is the one class whose own rule says "może", and 12.1 gives the taking
   * the run of the turn. Loot is offered, never queued.
   */
  it("never stops for a Przedmiot or a Przyjaciel", () => {
    expect(owesAFrame(onField("helm")[0])).toBe(false);
    expect(owesAFrame(onField("rycerz")[0])).toBe(false);
  });

  /**
   * The verb the card itself uses. "Jeżeli do niej trafisz, będziesz musiał
   * rzucić kostką" against "podczas każdej wizyty kupić".
   */
  it("stops for a Nieznajomy who happens to you, not one you visit", () => {
    expect(owesAFrame(onField("urocza-diablica")[0])).toBe(true);
    expect(owesAFrame(onField("sztukmistrz")[0])).toBe(false);
  });

  it("stops for a Miejsce that catches you, not one you may enter", () => {
    // "Każdy, kto tu trafi o Magii mniejszej niż 5, gubi się w nim."
    expect(owesAFrame(onField("labirynt")[0])).toBe(true);
    expect(owesAFrame(onField("spalona-ziemia")[0])).toBe(true);
    // "Jeżeli chcesz do niej wejść, rzuć kostką."
    expect(owesAFrame(onField("grota")[0])).toBe(false);
    expect(owesAFrame(onField("targowisko")[0])).toBe(false);
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

  it("gives each compulsory Nieznajomy and Miejsce a frame of its own", () => {
    expect(shape(onField("urocza-diablica", "labirynt"))).toEqual([
      ["nieznajomy", ["urocza-diablica"], false],
      ["miejsce", ["labirynt"], false],
    ]);
  });

  /**
   * The case that prompted the design: everything on the Obszar is optional, so
   * the turn stops for none of it and it is all offered together instead.
   */
  it("stops for nothing when every Karta here is one you may walk past", () => {
    expect(shape(onField("cudotworca", "grota", "helm", "rycerz"))).toEqual([]);
  });

  it("marks a frame done once its Karta has been settled", () => {
    expect(shape(onField("wilk", "labirynt"), ["wilk"])).toEqual([
      ["wrogowie-miecz", ["wilk"], true],
      ["miejsce", ["labirynt"], false],
    ]);
  });

  /** A pack is settled together, so half of one is not done. */
  it("calls a Wrogowie frame done only when all of it is", () => {
    expect(shape(onField("wilk", "wilkolak"), ["wilk"])[0][2]).toBe(false);
    expect(shape(onField("wilk", "wilkolak"), ["wilk", "wilkolak"])[0][2]).toBe(true);
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
    expect(shape(cards).map(([kind]) => kind)).toEqual([
      "placed",
      "spotkanie",
      "wrogowie-miecz",
      "wrogowie-magia",
      "nieznajomy",
      "miejsce",
    ]);
  });
});

describe("nextFrame", () => {
  it("is where the turn is stopped", () => {
    const cards = onField("wilk", "labirynt");
    expect(nextFrame(cards)?.kind).toBe("wrogowie-miecz");
    expect(nextFrame(cards, ["wilk"])?.kind).toBe("miejsce");
    expect(nextFrame(cards, ["wilk", "labirynt"])).toBeNull();
  });
});

describe("offeredNotQueued", () => {
  /**
   * The other half of `owesAFrame`, so the two cannot drift into either
   * queueing a Karta twice or losing it between them.
   */
  it("is exactly what the kolejka did not take", () => {
    const cards = onField("wilk", "helm", "cudotworca", "labirynt", "rycerz", "grota");
    const queued = kolejkaFor(cards).flatMap((frame) => frame.cards.map((c) => c.cardId));
    const offered = offeredNotQueued(cards).map((c) => c.cardId);
    expect([...queued, ...offered].sort()).toEqual(cards.map((c) => c.cardId).sort());
    expect(offered).toEqual(["cudotworca", "helm", "rycerz", "grota"]);
  });
});

describe("what is spent by being read (16.1, 16.5, 16.7)", () => {
  const one = (cardId: string) => onField(cardId)[0];

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
    expect(isSpent(one("dobre-bostwo"), ["dobre-bostwo"])).toBe(true);
    expect(isSpent(one("czarodziej"), ["czarodziej"])).toBe(false);
  });
});
