import { describe, expect, it } from "vitest";
import { goesToAField } from "./cardScript";
import { resolutionOrder } from "./state";
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
});
