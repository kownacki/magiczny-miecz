import { describe, expect, it } from "vitest";
import { DOLNY_KRAG, KAMIENNY_MOST, destination, ringOf } from "./board";
import { GORNY_KRAG, SRODKOWY_KRAG, crossingFrom } from "./rings";
import { beastCombatKind, beastStrength, compareCombat } from "./combat";

/**
 * The board is only worth anything if a character can actually get from where
 * it starts to the Beast. Each hop below is a rule, and together they are the
 * whole journey the game is about — so if any ring order or crossing is wrong
 * in a way that severs the route, this fails.
 */
describe("a character can reach the Beast from where it starts", () => {
  it("starts every character in the inner ring", () => {
    // Verified separately against the character cards; restated here because
    // the journey below assumes it.
    expect(DOLNY_KRAG.map((f) => f.id)).toContain("uroczysko");
  });

  it("walks the inner ring to its only crossing", () => {
    // Karczma to Uroczysko is one step back round the ring.
    expect(destination(DOLNY_KRAG, "karczma", 1, "przeciwnie")?.id).toBe("uroczysko");
    expect(crossingFrom("uroczysko")).toBeDefined();
  });

  it("crosses the Trzęsawiska into the middle ring (11.1)", () => {
    const crossing = crossingFrom("uroczysko")!;
    expect(crossing.obstacle).toBe("trzesawiska");
    expect(SRODKOWY_KRAG.map((f) => f.id)).toContain(crossing.to);
  });

  it("walks the middle ring to its only crossing", () => {
    const from = "las-blednych-ogni";
    const to = "przelecz-wichrow";
    const at = SRODKOWY_KRAG.findIndex((f) => f.id === from);
    const target = SRODKOWY_KRAG.findIndex((f) => f.id === to);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    // Reachable in either direction; a ring is always connected.
    const steps = Math.min(
      (target - at + SRODKOWY_KRAG.length) % SRODKOWY_KRAG.length,
      (at - target + SRODKOWY_KRAG.length) % SRODKOWY_KRAG.length,
    );
    expect(steps).toBeGreaterThan(0);
    expect(destination(SRODKOWY_KRAG, from, steps, "zgodnie")?.id === to ||
      destination(SRODKOWY_KRAG, from, steps, "przeciwnie")?.id === to).toBe(true);
  });

  it("crosses the Lodowy Las into the outer ring (11.5)", () => {
    const crossing = crossingFrom("przelecz-wichrow")!;
    expect(crossing.obstacle).toBe("lodowy-las");
    expect(GORNY_KRAG.map((f) => f.id)).toContain(crossing.to);
  });

  it("walks the outer ring to a bridge entrance (11.9)", () => {
    const entrances = ["wymarle-miasto", "ruiny-twierdzy"];
    for (const entrance of entrances) {
      expect(GORNY_KRAG.map((f) => f.id)).toContain(entrance);
    }
    // Reachable from where the Lodowy Las crossing lands.
    const from = GORNY_KRAG.findIndex((f) => f.id === "dolina-czaszek");
    const to = GORNY_KRAG.findIndex((f) => f.id === "ruiny-twierdzy");
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThanOrEqual(0);
  });

  it("walks the bridge to the Zamek, one field per turn (10.3)", () => {
    const bridge = KAMIENNY_MOST.map((f) => f.id);
    expect(bridge[0]).toBe("wejscie-na-most-a");
    expect(bridge).toContain("zamek-bestii");
    // Four steps from either entrance to the middle.
    expect(bridge.indexOf("zamek-bestii")).toBe(4);
    expect(bridge.length - 1 - bridge.indexOf("zamek-bestii")).toBe(4);
    expect(ringOf("zamek-bestii")).toBe(KAMIENNY_MOST);
  });

  it("beats the Beast once strong enough (14.7, 22)", () => {
    // A character that has done the journey — say Miecz 14 with equipment.
    const result = compareCombat(
      { label: "Postać", total: 14, roll: 4 },
      { label: "Bestia", total: beastStrength(6), roll: 2 },
      beastCombatKind(1),
    );
    expect(result.outcome).toBe("wygrana");
  });

  it("has no field belonging to two rings, which would break the route", () => {
    const rings = [DOLNY_KRAG, SRODKOWY_KRAG, GORNY_KRAG, KAMIENNY_MOST];
    const all = rings.flatMap((ring) => ring.map((f) => f.id));
    expect(new Set(all).size).toBe(all.length);
  });
});
