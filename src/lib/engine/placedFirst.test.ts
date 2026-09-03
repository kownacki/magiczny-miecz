import { describe, expect, it } from "vitest";
import { goesToAField, instructionIn, reopensTheDrawing, scriptFor } from "./cardScript";
import { placedFirst, resolutionOrder } from "./state";
import type { TurnCard } from "./state";

/**
 * 15.1, which sits above 15.2's numerals.
 *
 * "Karty, które zgodnie z ich instrukcją powinny zostać położone na konkretnym
 * Obszarze, niezależnie od tego, gdzie zostały wyciągnięte, rozpatrywane są w
 * pierwszej kolejności."
 *
 * The point of the rule is that it overrides the printed class: the Upiór is a
 * Wróg and the Eremita a Spotkanie, and neither waits its turn.
 */
const card = (cardId: string, cardClass: TurnCard["cardClass"]): TurnCard =>
  ({ cardId, cardClass }) as TurnCard;

describe("a card that sends itself to a named Obszar", () => {
  it("is recognised from its script, not from a list", () => {
    expect(goesToAField("upior")).toBe(true);
    expect(goesToAField("eremita")).toBe(true);
    expect(goesToAField("lewiatan")).toBe(true);
    expect(goesToAField("cyklop")).toBe(false);
    expect(goesToAField("nie-ma-takiej")).toBe(false);
  });

  /** Even reached through a die table, which is how all three reach it. */
  it("is found inside a rzut table", () => {
    // The Upiór's destination is a face of its own roll, not a top-level op.
    expect(goesToAField("upior")).toBe(true);
  });

  it("goes before a card of a lower class (15.1 over 15.2)", () => {
    // A Spotkanie prints I and a Wróg II, so ordinarily the Spotkanie is first.
    const order = resolutionOrder([card("mgla", "encounter"), card("upior", "foe")]);
    expect(order.map((one) => one.cardId)).toEqual(["upior", "mgla"]);
  });

  it("still orders the rest by class underneath it (15.2)", () => {
    const order = resolutionOrder([
      card("miecz", "item"),
      card("cyklop", "foe"),
      card("mgla", "encounter"),
      card("upior", "foe"),
    ]);
    expect(order.map((one) => one.cardId)).toEqual(["upior", "mgla", "cyklop", "miecz"]);
  });

  it("keeps draw order between two that both place themselves", () => {
    const order = resolutionOrder([card("eremita", "encounter"), card("upior", "foe")]);
    expect(order.map((one) => one.cardId)).toEqual(["eremita", "upior"]);
  });

  /**
   * Only on the way there. 15.1's parenthesis — „oczywiście tylko podczas
   * aktualnej tury" — scopes the whole rule to the turn the Karta was turned
   * over; once it has landed it is an ordinary Karta of its own class on its
   * new square, and an Eremita jumping the kolejka a second time would go
   * ahead of a Spotkanie that 16.4 says is dealt with first.
   */
  it("stops jumping the queue once it is lying there", () => {
    const found = { ...card("eremita", "encounter"), lying: true };
    expect(placedFirst(card("eremita", "encounter"))).toBe(true);
    expect(placedFirst(found)).toBe(false);

    const order = resolutionOrder([card("mgla", "encounter"), found]);
    expect(order.map((one) => one.cardId)).toEqual(["mgla", "eremita"]);
  });

  /**
   * And the sentence it is read changes with it. The die is thrown by whoever
   * turned him over; the Magiczny Miecz is offered to whoever finds him.
   */
  it("reads its placement when drawn and its own text where it lies", () => {
    const eremita = scriptFor("eremita")!;
    expect(instructionIn(eremita, undefined).op).toBe("rzut");
    expect(instructionIn(eremita, true).op).toBe("wybor");

    // A Karta with one sentence says it to everybody, drawn or found.
    const krol = scriptFor("krol-lasu")!;
    expect(instructionIn(krol, undefined)).toBe(krol.effect);
    expect(instructionIn(krol, true)).toBe(krol.effect);
  });
});

/**
 * And the other end of the sort: a card that draws more Karty goes last.
 *
 * The Skalne Wrota's three join this same kolejka, and the community reading of
 * the card — forum.magiaimiecz.eu t=3660 — is that they are a fresh badanie,
 * which they are exactly when the Wrota is resolved after everything else.
 * See `reopensTheDrawing`.
 */
describe("a card that re-opens the badanie", () => {
  it("is recognised from its script, not from a list", () => {
    expect(reopensTheDrawing("skalne-wrota")).toBe(true);
    // The other Miejsce that moves you about does not draw anything.
    expect(reopensTheDrawing("tajemne-przejscie")).toBe(false);
    expect(reopensTheDrawing("targowisko")).toBe(false);
    expect(reopensTheDrawing("nie-ma-takiej")).toBe(false);
  });

  /**
   * The case the key exists for. Both are Miejsca (VI), so class cannot
   * separate them and a stable sort would keep the order they arrived in — the
   * Wrota first, and its three would then land in front of the Targowisko.
   */
  it("goes behind another Miejsce however it was drawn", () => {
    const wrotaFirst = resolutionOrder([
      card("skalne-wrota", "place"),
      card("targowisko", "place"),
    ]);
    expect(wrotaFirst.map((one) => one.cardId)).toEqual(["targowisko", "skalne-wrota"]);

    // And it does not disturb the order when it was drawn last anyway.
    const wrotaLast = resolutionOrder([
      card("targowisko", "place"),
      card("skalne-wrota", "place"),
    ]);
    expect(wrotaLast.map((one) => one.cardId)).toEqual(["targowisko", "skalne-wrota"]);
  });

  /**
   * Below its own class only. A Miejsce that draws is still a Miejsce, so it
   * does not overtake anything and nothing of a lower numeral falls behind it —
   * 15.2 is untouched, and 15.1 still sits above both.
   */
  it("does not disturb 15.1 or 15.2 around it", () => {
    const order = resolutionOrder([
      card("skalne-wrota", "place"),
      card("miecz", "item"),
      card("cyklop", "foe"),
      card("upior", "foe"),
    ]);
    expect(order.map((one) => one.cardId)).toEqual([
      "upior",
      "cyklop",
      "miecz",
      "skalne-wrota",
    ]);
  });
});
