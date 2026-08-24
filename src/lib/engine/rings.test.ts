import { describe, expect, it } from "vitest";
import {
  CROSSINGS,
  GORNY_KRAG,
  SRODKOWY_KRAG,
  crossingFrom,
  crossingIsDefended,
} from "./rings";
import { DOLNY_KRAG, KAMIENNY_MOST } from "./board";

/**
 * Every constraint the rulebook places on these two rings, as a test.
 *
 * The ring order was read off the scan and has not been checked against the
 * physical board, so these encode what CAN be checked: a mistake in a position
 * the rules constrain fails here. A mistake between two unconstrained
 * neighbours would not, which is the residual risk this file cannot cover.
 */
describe("ring composition", () => {
  it("has unique ids despite repeated names", () => {
    for (const ring of [SRODKOWY_KRAG, GORNY_KRAG]) {
      const ids = ring.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("repeats exactly the four names the board prints twice", () => {
    const counts = new Map<string, number>();
    for (const field of GORNY_KRAG) counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
    const twice = [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name).sort();
    expect(twice).toEqual(["Bagna", "Rozstajne Drogi", "Ruchome Skały", "Urwisko"]);
  });

  it("makes the outer ring the longest, as concentric rings must be", () => {
    // The earlier reading had the outer ring SHORTER than the middle one, which
    // is geometrically impossible and is what exposed it as wrong.
    expect(GORNY_KRAG.length).toBeGreaterThan(SRODKOWY_KRAG.length);
    expect(SRODKOWY_KRAG.length).toBeGreaterThan(DOLNY_KRAG.length);
  });

  it("shares no field id with another ring or the bridge", () => {
    const all = [...DOLNY_KRAG, ...SRODKOWY_KRAG, ...GORNY_KRAG, ...KAMIENNY_MOST];
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  });
});

describe("what the rulebook fixes about these rings", () => {
  const srodkowy = SRODKOWY_KRAG.map((f) => f.id);
  const gorny = GORNY_KRAG.map((f) => f.id);

  it("puts the bridge's middle-ring crossings in the middle ring (p3)", () => {
    expect(srodkowy).toContain("swiatynia-bogini-nemed");
    expect(srodkowy).toContain("twierdza-strzegaca-drog");
  });

  it("puts both bridge entrances in the outer ring (11.9)", () => {
    expect(gorny).toContain("wymarle-miasto");
    expect(gorny).toContain("ruiny-twierdzy");
  });

  it("places the two bridge entrances opposite each other", () => {
    // The bridge is a straight line across the whole board, so its two ends
    // must be roughly half a ring apart.
    const a = gorny.indexOf("wymarle-miasto");
    const b = gorny.indexOf("ruiny-twierdzy");
    const gap = Math.abs(a - b);
    const separation = Math.min(gap, gorny.length - gap);
    expect(separation).toBeGreaterThanOrEqual(Math.floor(gorny.length / 2) - 2);
  });

  it("puts Las Błędnych Ogni in the middle ring, opposite Uroczysko (11.1)", () => {
    expect(srodkowy).toContain("las-blednych-ogni");
    expect(DOLNY_KRAG.map((f) => f.id)).toContain("uroczysko");
  });

  it("puts Przełęcz Wichrów in the middle and Dolina Czaszek in the outer (11.5, 11.7)", () => {
    expect(srodkowy).toContain("przelecz-wichrow");
    expect(gorny).toContain("dolina-czaszek");
  });
});

describe("crossings (11.1, 11.5)", () => {
  it("allows only the two the rules name, in both directions", () => {
    expect(CROSSINGS).toHaveLength(4);
    expect(crossingFrom("uroczysko")?.to).toBe("las-blednych-ogni");
    expect(crossingFrom("przelecz-wichrow")?.to).toBe("dolina-czaszek");
  });

  it("refuses anywhere else on the boundary", () => {
    expect(crossingFrom("karczma")).toBeUndefined();
    expect(crossingFrom("pustelnia")).toBeUndefined();
    expect(crossingFrom("zamek")).toBeUndefined();
  });

  it("connects fields that really exist, in the rings they claim", () => {
    const byId = new Map(
      [...DOLNY_KRAG, ...SRODKOWY_KRAG, ...GORNY_KRAG].map((f) => [f.id, f]),
    );
    for (const crossing of CROSSINGS) {
      expect(byId.get(crossing.from), crossing.from).toBeDefined();
      expect(byId.get(crossing.to), crossing.to).toBeDefined();
      // A crossing must move between adjacent rings, never within one.
      expect(byId.get(crossing.from)!.region).not.toBe(byId.get(crossing.to)!.region);
    }
  });
});

describe("which way a crossing is defended (11.3, 11.7)", () => {
  it("makes a character earn the way up, into the next ring out", () => {
    // Trzęsawiska are rolled for at Uroczysko; the Rycerz waits at Przełęcz
    // Wichrów. Both are the inward-facing side of their crossing.
    expect(crossingIsDefended(crossingFrom("uroczysko")!)).toBe(true);
    expect(crossingIsDefended(crossingFrom("przelecz-wichrow")!)).toBe(true);
  });

  it("lets a character walk back down for nothing", () => {
    // "nie rzucając kostką" on Las Błędnych Ogni; "nie atakuje jeżeli
    // przechodzisz z Doliny Czaszek" on Przełęcz Wichrów.
    expect(crossingIsDefended(crossingFrom("las-blednych-ogni")!)).toBe(false);
    expect(crossingIsDefended(crossingFrom("dolina-czaszek")!)).toBe(false);
  });

  it("defends exactly one direction of each crossing", () => {
    const defended = CROSSINGS.filter(crossingIsDefended);
    expect(defended).toHaveLength(CROSSINGS.length / 2);
    // No crossing may be defended both ways, or free both ways.
    for (const crossing of defended) {
      const back = CROSSINGS.find(
        (other) => other.from === crossing.to && other.to === crossing.from,
      );
      expect(back, `no way back from ${crossing.to}`).toBeDefined();
      expect(crossingIsDefended(back!)).toBe(false);
    }
  });
});
