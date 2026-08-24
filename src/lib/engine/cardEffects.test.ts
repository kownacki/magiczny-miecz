import { describe, expect, it } from "vitest";
import { suggestActions } from "./cardEffects";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

const EVENTS = events as EventCard[];

describe("suggested actions", () => {
  it("reads the gold pickup, the deck's commonest card", () => {
    expect(
      suggestActions({ text: "Zamień tę Kartę na 1 Sztukę Złota, a następnie ją odłóż." }),
    ).toEqual([{ label: "+1 Złota", stat: "zloto", delta: 1 }]);
  });

  it("handles the plural form", () => {
    expect(
      suggestActions({ text: "Zamień tę Kartę na 2 Sztuki Złota, a następnie ją odłóż." }),
    ).toEqual([{ label: "+2 Złota", stat: "zloto", delta: 2 }]);
  });

  it("suggests nothing when the outcome depends on Nature", () => {
    // Both a gain and a loss of one Życie appear in this sentence; any pattern
    // match lands on the wrong one half the time.
    expect(
      suggestActions({
        text: "Jeśli jesteś Zły, ich zapach pozwoli ci zyskać 1 Życie, jeśli jesteś Dobry - tracisz 1 Życie.",
      }),
    ).toEqual([]);
  });

  it("suggests nothing when the card asks for a die roll", () => {
    expect(
      suggestActions({ text: "Rzuć kostką: 1-2 tracisz 1 Życie, 3-6 nic się nie dzieje." }),
    ).toEqual([]);
  });

  it("suggests nothing when the card offers a choice", () => {
    expect(
      suggestActions({ text: "Upiór spełni do wyboru jedno życzenie: 1 punkt Miecza." }),
    ).toEqual([]);
  });

  it("suggests nothing when the effect hits every player", () => {
    expect(
      suggestActions({ text: "Wszystkie Postacie tracą 1 turę." }),
    ).toEqual([]);
  });

  it("reads an unconditional loss", () => {
    expect(suggestActions({ text: "Zasadzka. Tracisz 2 Życia." })).toEqual([
      { label: "−2 Życia", stat: "zycie", delta: -2 },
    ]);
  });

  describe("against the real deck", () => {
    const suggested = EVENTS.map((card) => ({ card, actions: suggestActions(card) }));
    const withActions = suggested.filter((entry) => entry.actions.length > 0);

    it("covers a useful slice of the deck without overreaching", () => {
      // Mostly the gold cards. If this number ever jumps, a new pattern has
      // started matching conditional text and needs checking by hand.
      expect(withActions.length).toBeGreaterThan(10);
      expect(withActions.length).toBeLessThan(45);
    });

    it("never suggests anything for a card whose text branches", () => {
      for (const { card, actions } of withActions) {
        expect(
          /je[żś]eli|je[śs]li|rzuć kostk|do wyboru/i.test(card.text),
          `${card.name} got ${actions.length} suggestion(s) despite branching text`,
        ).toBe(false);
      }
    });

    it("never proposes moving a stat by an absurd amount", () => {
      for (const { card, actions } of withActions) {
        for (const action of actions) {
          expect(Math.abs(action.delta), `${card.name}`).toBeLessThanOrEqual(5);
        }
      }
    });
  });
});

describe("board die-table outcomes", () => {
  it("reads the Karczma abbreviation for winning gold", () => {
    expect(suggestActions({ text: "wygrałeś 1 Sz. Z." })).toEqual([
      { label: "+1 Złota", stat: "zloto", delta: 1 },
    ]);
  });

  it("reads losing at dice", () => {
    expect(suggestActions({ text: "przegrałeś w kości 1 Sz. Z." })).toEqual([
      { label: "−1 Złota", stat: "zloto", delta: -1 },
    ]);
  });

  it("reads a lost turn, which is a tracked value too", () => {
    expect(suggestActions({ text: "musisz tu nocować, tracisz 1 turę" })).toEqual([
      { label: "−1 tura", stat: "tury", delta: 1 },
    ]);
  });

  it("still refuses an outcome that leaves a choice open", () => {
    // Karczma face 5 offers a free move — a decision, not bookkeeping.
    expect(
      suggestActions({
        text: "poczęstowano cię eliksirem, dzięki któremu możesz przenieść się do dowolnego miejsca w tym Kręgu",
      }),
    ).toEqual([]);
  });

  it("suggests nothing for an outcome that starts a fight", () => {
    expect(
      suggestActions({ text: "musisz stawić czoła miejscowemu osiłkowi (Miecz 4)" }),
    ).toEqual([]);
  });
});
