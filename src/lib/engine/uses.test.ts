import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { USES, askAbout, isUsable, usageOf } from "./uses";
import { isConsumedOnResolve } from "./cardScript";

const PRZEDMIOTY = (events as EventCard[]).filter((card) => card.cardClass === "przedmiot");
const byId = new Map<string, EventCard>(PRZEDMIOTY.map((card) => [card.id, card]));

describe("which cards are spent by using them", () => {
  it("names only cards that are in the box", () => {
    for (const id of Object.keys(USES)) expect(byId.has(id)).toBe(true);
  });

  it("covers every Przedmiot whose text says the Karta goes afterwards", () => {
    // The corpus decides the list, not memory. A card printed with "odłóż" or
    // "tylko raz" is a card you spend, and if one is missing here it has no way
    // of ever leaving the pack it is doing nothing in.
    const spent = PRZEDMIOTY.filter((card) =>
      /odłóż|tylko raz|po użyciu/i.test(card.text ?? ""),
    ).map((card) => card.id);

    for (const id of new Set(spent)) {
      // Gold is the exception and is not a possession at all: the card turns
      // into Sztuki Złota as it is taken and never reaches a pack, so there is
      // nothing there to spend later.
      if (isConsumedOnResolve(id)) continue;
      expect(isUsable(id), `${id} nie ma sposobu użycia`).toBe(true);
    }
  });

  it("does not offer to spend a card you simply keep", () => {
    expect(isUsable("miecz")).toBe(false);
    expect(isUsable("swiety-graal")).toBe(false);
    // Nor one that is taken off you by someone who beats you, rather than used.
    expect(isUsable("diament-krolow")).toBe(false);
  });

  it("only claims to resolve a card it actually has a script for", () => {
    // "Aplikacja rzuci kostką" is a promise; the die table has to exist.
    for (const [id, use] of Object.entries(USES)) {
      if (use.rozpatruje !== "aplikacja") continue;
      expect(byId.get(id)?.text ?? "").toMatch(/rzuć kostką/i);
    }
  });
});

describe("what the player is asked", () => {
  it("says what it buys, that the card goes, and who works it out", () => {
    const ask = askAbout("ELIKSIR SIŁY", usageOf("eliksir-sily")!);
    expect(ask).toContain("+2 Miecza");
    expect(ask).toContain("przepada");
    expect(ask).toContain("rozpatrzcie sami");
  });

  it("names the window when the card names one, and stays quiet when it does not", () => {
    expect(askAbout("OWOC", usageOf("owoc-jarzebiny-wiedzy")!)).toContain(
      "przed ciągnięciem",
    );
    expect(askAbout("ELIKSIR", usageOf("eliksir-sily")!)).not.toContain("Karta mówi");
  });

  it("promises the die only where the app throws it", () => {
    expect(askAbout("SZKATUŁA", usageOf("tajemnicza-szkatula")!)).toContain("rzuci kostką");
  });

  it("never leaves a card without every word the question needs", () => {
    for (const [id, use] of Object.entries(USES)) {
      for (const part of [use.verb, use.dziennik, use.co]) {
        expect(part.length, id).toBeGreaterThan(0);
      }
    }
  });
});
