import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import spells from "@/data/spells.json";
import type { EventCard, Item, Spell } from "@/data/types";
import { ABILITIES } from "./abilities";
import { SCRIPTS } from "./cardScript";
import { coverageOf, manualNote, IN_COMMANDS } from "./coverage";
import { SPELLS } from "./spells";
import { USES } from "./uses";
import { isCardId } from "@/data/ids";

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

/**
 * Encoded anywhere at all, which is the only sense the player cares about.
 *
 * Five shelves, not four. The fifth is `IN_COMMANDS` — a Karta whose rule lives
 * in the command that runs it rather than in a data table — and leaving it out
 * here is why the WAMPIR went five days disclaiming a rule the app was running:
 * this test asks the same question `coverageOf` asks, so both were wrong in the
 * same direction and the suite stayed green. A test that mirrors the
 * implementation cannot falsify it, which is what the named cases below are
 * for.
 */
const encodedSomewhere = (card: string) =>
  card in SCRIPTS || card in ABILITIES || card in USES || card in SPELLS || card in IN_COMMANDS;

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
    /**
     * The WAMPIR was the example here, with a note saying „if it ever becomes
     * encoded this test should be updated rather than deleted". He became
     * encoded on 2026-09-04 — `spoils.ts` adds the point of Magia when he wins
     * and clears it when he is beaten, which is his whole printed sentence —
     * and nothing was updated, because the check above mirrored the same four
     * registries the implementation read. So he is the named case now, from the
     * other side.
     *
     * The TAJEMNA SAKWA takes his old place: „W Sakwie możesz umieścić 1
     * Przedmiot" wants a container link nothing in the model has, so she is
     * genuinely the app's to disclaim.
     */
    expect(coverageOf("wampir")).toBe("pelne");
    expect(coverageOf("tajemna-sakwa")).toBe("brak");
    expect(coverageOf("jednorozec")).toBe("pelne");
    // Excalibur was the example here until its Życie-stealing clause was
    // encoded, and the Czarodziejska Kość until its point in the two Pułapki
    // was. The Łódź is the current one: the turn's delay and the discard are
    // carried, and where the crossing puts you down is still the table's,
    // because cross-ring adjacency is nowhere in this repo.
    expect(coverageOf("lodz")).toBe("czesciowe");
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
    for (const card of [...Object.keys(USES), ...Object.keys(SPELLS)].filter(isCardId)) {
      expect(coverageOf(card), card).not.toBe("brak");
    }
  });
});
