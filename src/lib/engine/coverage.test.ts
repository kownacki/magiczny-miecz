import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import spells from "@/data/spells.json";
import type { EventCard, Item, Spell } from "@/data/types";
import { ABILITIES } from "./abilities";
import { SCRIPTS } from "./cardScript";
import { coverageOf, manualNote } from "./coverage";
import { SPELLS } from "./spells";
import { USES } from "./uses";

/**
 * Every card the app will ever be asked about — the Zaklęcia included.
 *
 * They were missing, and that is why nobody noticed `coverageOf` consulting
 * two of the four registries: a test that never asks about a spell cannot
 * catch the app disclaiming one. The Księga opens on that shelf.
 */
const KNOWN = new Set([
  ...(events as EventCard[]).map((c) => c.id),
  ...(items as Item[]).map((i) => i.id),
  ...(spells as Spell[]).map((s) => s.id),
]);

/** Encoded anywhere at all, which is the only sense the player cares about. */
const encodedSomewhere = (card: string) =>
  card in SCRIPTS || card in ABILITIES || card in USES || card in SPELLS;

describe("what the app claims about itself", () => {
  it("only annotates cards that exist", () => {
    for (const card of KNOWN) {
      expect(["pelne", "czesciowe", "brak"]).toContain(coverageOf(card));
    }
  });

  it("never attaches a manual note to a card it does not handle at all", () => {
    // A note says "the app does this much, and you do the rest". On a card the
    // app does nothing for, that is a lie in the more dangerous direction.
    for (const card of KNOWN) {
      if (coverageOf(card) === "brak") {
        expect(manualNote(card), card).toBeNull();
      }
    }
  });

  it("gives every partially-handled card something to act on", () => {
    for (const card of KNOWN) {
      if (coverageOf(card) !== "czesciowe") continue;
      expect(manualNote(card)?.length ?? 0, card).toBeGreaterThan(0);
    }
  });

  it("calls a card fully handled only when nothing was left to the players", () => {
    for (const card of KNOWN) {
      const encoded = encodedSomewhere(card);
      expect(coverageOf(card) === "brak", card).toBe(!encoded);
      if (coverageOf(card) === "pelne") {
        expect(encoded, card).toBe(true);
        expect(manualNote(card), card).toBeNull();
      }
    }
  });

  it("reports an unencoded card as unhandled rather than staying quiet", () => {
    // Wampir is one of the cards deliberately left alone; if it ever becomes
    // encoded this test should be updated rather than deleted.
    expect(coverageOf("wampir")).toBe("brak");
    expect(coverageOf("jednorozec")).toBe("pelne");
    // Excalibur was the example here until its Życie-stealing clause was
    // encoded; Czarodziejska Kość still carries a note nothing acts on.
    expect(coverageOf("czarodziejska-kosc")).toBe("czesciowe");
  });

  it("does not disclaim a card it carries in one of the other two registries", () => {
    // The bug this pins down: `coverageOf` asked SCRIPTS and ABILITIES only, so
    // a Przedmiot whose whole rule is one act — Eliksir Siły, spent and
    // discarded — and every Zaklęcie encoded in SPELLS came back "brak", and
    // the card printed "rozpatrzcie sami" under a card the app resolves.
    expect(coverageOf("eliksir-sily")).not.toBe("brak");
    expect(coverageOf("krysztal-losu")).not.toBe("brak");
    expect(coverageOf("krag-plomieni")).not.toBe("brak");

    // And the general form, so a fifth registry cannot reopen it quietly.
    for (const card of [...Object.keys(USES), ...Object.keys(SPELLS)]) {
      expect(coverageOf(card), card).not.toBe("brak");
    }
  });
});
