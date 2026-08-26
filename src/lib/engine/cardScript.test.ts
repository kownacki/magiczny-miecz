import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { FIELDS } from "./board";
import {
  SCRIPTS,
  describeDisposition,
  fieldsNamedBy,
  scriptFor,
  type Effect,
} from "./cardScript";

const EVENTS = events as EventCard[];
const BY_ID = new Map<string, EventCard>(EVENTS.map((card) => [card.id, card]));

describe("the script registry against the real deck", () => {
  it("only scripts cards that are actually in the box", () => {
    // A mistyped key is otherwise silent: the card simply stays unscripted and
    // falls back to its text, which looks exactly like not having encoded it.
    for (const cardId of Object.keys(SCRIPTS)) {
      expect(BY_ID.has(cardId), cardId).toBe(true);
    }
  });

  it("only sends characters to fields that exist", () => {
    for (const [cardId, script] of Object.entries(SCRIPTS)) {
      for (const fieldId of fieldsNamedBy(script.effect)) {
        expect(FIELDS.get(fieldId), `${cardId} -> ${fieldId}`).toBeDefined();
      }
    }
  });

  it("gives every die table all six faces", () => {
    // A table missing a face is a card that cannot be resolved on that roll,
    // which is worse than not encoding it at all.
    const check = (cardId: string, effect: Effect): void => {
      if (effect.op === "rzut") {
        expect(Object.keys(effect.faces).map(Number).sort(), cardId).toEqual([
          1, 2, 3, 4, 5, 6,
        ]);
      }
      if (effect.op === "po-kolei") effect.steps.forEach((step) => check(cardId, step));
      if (effect.op === "wybor") effect.options.forEach((o) => check(cardId, o.effect));
      if (effect.op === "gdy") {
        check(cardId, effect.to);
        if (effect.inaczej) check(cardId, effect.inaczej);
      }
      if (effect.op === "rzut") Object.values(effect.faces).forEach((f) => check(cardId, f));
    };
    for (const [cardId, script] of Object.entries(SCRIPTS)) check(cardId, script.effect);
  });

  it("describes every disposition it can hold", () => {
    for (const script of Object.values(SCRIPTS)) {
      expect(describeDisposition(script.disposition).length).toBeGreaterThan(0);
    }
  });

  it("keeps a fixture's disposition consistent with its text", () => {
    // Every card whose printed text promises to stay must be encoded as
    // staying, and the reverse. These are the two phrasings the deck uses.
    for (const [cardId, script] of Object.entries(SCRIPTS)) {
      const text = BY_ID.get(cardId)!.text.toLowerCase();
      const saysStays = /pozostanie (?:na tym obszarze|tu)|będzie mieszka|zostanie twoim/.test(text);
      const stays =
        script.disposition.kind === "zostaje" ||
        script.disposition.kind === "zostaje-z-pula" ||
        script.disposition.kind === "do-pierwszej";
      if (saysStays) expect(stays, `${cardId} says it stays`).toBe(true);
    }
  });
});

describe("the card that prompted the vocabulary", () => {
  it("carries you anywhere in your own Krąg, and then leaves", () => {
    // "Jednorożec może natychmiast przewieźć cię do dowolnego Obszaru w tym
    // Kręgu. Bez względu na to, czy skorzystasz z propozycji, Jednorożec
    // oddala się - odłóż jego Kartę."
    const script = scriptFor("jednorozec")!;
    expect(script.effect).toEqual({ op: "przenies", to: { kind: "dowolne-w-kregu" } });
    // The ride is a choice; his leaving is not.
    expect(script.optional).toBe(true);
    expect(script.disposition).toEqual({ kind: "odloz" });
  });
});

describe("fixtures that hold a pool", () => {
  it("gives each of the three its own stat and four points", () => {
    for (const [cardId, stat] of [
      ["drzewo-zycia", "life"],
      ["jezioro-magiczne", "sword"],
      ["zaklete-zrodlo", "magic"],
    ] as const) {
      expect(scriptFor(cardId)!.disposition, cardId).toEqual({
        kind: "zostaje-z-pula",
        stat,
        points: 4,
      });
    }
  });

  it("says out loud that the card leaves when the pool runs dry", () => {
    expect(describeDisposition(scriptFor("drzewo-zycia")!.disposition)).toContain("4 punktami");
  });
});

describe("cards that turn on Nature", () => {
  it("rewards the Evil and converts everyone else at the Sabat", () => {
    const effect = scriptFor("sabat-czarownic")!.effect;
    if (effect.op !== "gdy") throw new Error("expected a condition");
    expect(effect.warunek).toEqual({ is: "natura", jedna_z: ["evil"] });
    expect(effect.inaczej).toEqual({ op: "natura", na: "evil" });
  });

  it("leaves Chaotic characters alone where the card says it does", () => {
    // "Zapach Ziół nie działa na Chaotyczne Postacie" — encoded as the absence
    // of a branch rather than a no-op, so nothing is offered for them at all.
    const effect = scriptFor("zatrute-ziola")!.effect;
    if (effect.op !== "gdy" || !effect.inaczej) throw new Error("expected a fallthrough");
    const otherwise = effect.inaczej;
    if (otherwise.op !== "gdy") throw new Error("expected a second condition");
    expect(otherwise.warunek).toEqual({ is: "natura", jedna_z: ["good"] });
    expect(otherwise.inaczej).toBeUndefined();
  });
});
