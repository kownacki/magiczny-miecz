import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { USES, USE_VERB, USE_VERB_PAST, askAbout, isUsable, usageOf } from "./uses";
import { isConsumedOnResolve } from "./cardScript";

const PRZEDMIOTY = (events as EventCard[]).filter((card) => card.cardClass === "item");
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

  it("only claims to resolve a card it has some way of resolving", () => {
    // "Aplikacja" is a promise, and there are exactly two ways to keep it: a
    // die table the app can throw, or an effect the buff system can hold.
    for (const [id, use] of Object.entries(USES)) {
      if (use.rozpatruje !== "aplikacja") continue;
      const rolls = /rzuć kostką/i.test(byId.get(id)?.text ?? "");
      expect(rolls || use.efekt !== undefined, `${id} nie ma czym rozpatrzyć`).toBe(true);
    }
  });

  it("leaves a card it cannot carry to the table", () => {
    // The Kryształ shifts a fight roll and the Jabłko a Świątynia roll, at a
    // moment nothing can be held across. Claiming those would be a lie.
    for (const id of ["krysztal-losu", "jablko-natchnienia", "rozdzka-przeznaczenia"]) {
      expect(usageOf(id)!.rozpatruje, id).toBe("stol");
    }
  });
});

describe("what the player is asked", () => {
  it("says what it buys, that the card goes, and who works it out", () => {
    const ask = askAbout("ELIKSIR SIŁY", usageOf("eliksir-sily")!);
    expect(ask).toContain("+2 Miecza");
    expect(ask).toContain("przepada");
    // The app holds this one now, so it must not tell the table to.
    expect(ask).toContain("zapamięta");
    expect(ask).not.toContain("rozpatrzcie sami");
  });

  it("still hands the table what it cannot keep", () => {
    expect(askAbout("KRYSZTAŁ LOSU", usageOf("krysztal-losu")!)).toContain("rozpatrzcie sami");
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

  it("never leaves a card without the line the question is built from", () => {
    for (const [id, use] of Object.entries(USES)) {
      expect(use.co.length, id).toBeGreaterThan(0);
    }
  });

  it("says the same word for all nine", () => {
    // One act, one verb. The cards each have their own idiom — a Szkatuła is
    // opened and an Eliksir drunk — and nine different words in the pack made
    // one thing look like nine controls.
    expect(USE_VERB).toBe("użyj");
    expect(USE_VERB_PAST).toBe("używa");
  });
});
