import { describe, expect, it } from "vitest";
import { INTENT_KINDS, intentSaid, isIntentKind, type IntentKind } from "./intentText";

describe("intentText", () => {
  it("says every kind it knows about", () => {
    // `SAYS` is a `Record<IntentKind, string>`, so a new kind cannot be added
    // without the compiler asking how to say it. This is the other half: that
    // none of the answers is a placeholder.
    for (const kind of INTENT_KINDS) {
      const line = intentSaid("Test (WIEDŹMA)", kind);
      expect(line.startsWith("Test (WIEDŹMA) ")).toBe(true);
      expect(line.endsWith("…")).toBe(true);
      expect(line.length).toBeGreaterThan("Test (WIEDŹMA) …".length);
    }
  });

  it("quotes the option in the words the list is already showing", () => {
    expect(intentSaid("Test (WIEDŹMA)", "wybiera", "Tracisz 1 Sztukę Złota")).toBe(
      "Test (WIEDŹMA) wybiera: Tracisz 1 Sztukę Złota…",
    );
  });

  it("says the act alone when there is no list to point into", () => {
    expect(intentSaid("Test (BARBARZYŃCA)", "pomija")).toBe("Test (BARBARZYŃCA) pomija…");
    expect(intentSaid("Ania (KARZEŁ)", "walczy")).toBe("Ania (KARZEŁ) walczy…");
  });

  it("is a thing in progress rather than a report", () => {
    // The ellipsis is the whole difference. Three seconds later this is either
    // the journal or it never was, and the sentence has to be able to be both.
    expect(intentSaid("Ania", "bierze-przedmiot")).toMatch(/…$/);
  });

  it("does not take a kind off the wire that it cannot say", () => {
    expect(isIntentKind("wybiera")).toBe(true);
    expect(isIntentKind("rozpatruje")).toBe(true);
    expect(isIntentKind("wygrywa")).toBe(false);
    expect(isIntentKind("")).toBe(false);
    expect(isIntentKind(3)).toBe(false);
    expect(isIntentKind(null)).toBe(false);
    // Not a property inherited from Object — `in` would say yes to this.
    expect(isIntentKind("toString")).toBe(false);
  });

  it("carries no rule numbers, because none of it is in the Instrukcja", () => {
    // A button held down, a mind changed, a cancel: things that happen to a
    // browser, not events in Magiczny Miecz. `WithRules` would turn a number
    // here into a link to a rule about something else.
    for (const kind of INTENT_KINDS) {
      expect(intentSaid("Test", kind, "Tracisz 1 Sztukę Złota")).not.toMatch(/\d+\.\d+/);
    }
  });

  it("knows the kinds the panels actually send", () => {
    const used: IntentKind[] = [
      "walczy",
      "wymyka-sie",
      "bierze-przedmiot",
      "bierze-przyjaciela",
      "zostawia-przedmiot",
      "zostawia-przyjaciela",
      "wybiera",
      "przenosi-sie",
      "kladzie",
      "pomija",
      "rozpatruje",
      "traci",
    ];
    expect([...INTENT_KINDS].sort()).toEqual([...used].sort());
  });
});
