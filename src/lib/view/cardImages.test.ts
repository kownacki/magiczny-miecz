import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STONE_CARD, cardImageUrl, figureUrl } from "./cardImages";
import events from "@/data/events.json";
import manifest from "@/data/card-images.json";
import type { EventCard } from "@/data/types";

const EVENTS = events as EventCard[];
const REFS = manifest as string[];

/**
 * These assert against the actual files on disk, not just the manifest.
 * The manifest and the filenames are produced by the same script but use
 * different conventions for the index — bare in one, zero-padded in the other —
 * and a mismatch is invisible until a card with a low index is drawn.
 */
describe("card images resolve to files that exist", () => {
  it("resolves a single-digit slice, which is where the padding bites", () => {
    const url = cardImageUrl("przewodnik");
    expect(url).toMatch(/zdarzenia-8-0\d\.jpg$/);
  });

  it("resolves a double-digit slice too", () => {
    const jednorozec = EVENTS.find((c) => c.name === "JEDNOROŻEC")!;
    expect(cardImageUrl(jednorozec.id)).toMatch(/-\d\d\.jpg$/);
  });

  it("points every event card at a file that is really there", () => {
    const missing: string[] = [];
    for (const card of EVENTS) {
      const url = cardImageUrl(card.id);
      if (!url) {
        missing.push(`${card.name}: no image`);
        continue;
      }
      if (!existsSync(join("public", url))) missing.push(`${card.name}: ${url}`);
    }
    expect(missing).toEqual([]);
  });

  it("has a file behind every manifest entry", () => {
    const missing = REFS.filter((ref) => {
      const [sheet, index] = ref.split("#");
      return !existsSync(join("public/cards", `${sheet}-${index.padStart(2, "0")}.jpg`));
    });
    expect(missing).toEqual([]);
  });
});

/**
 * 20.1's swap, which is the one rule in chapter 20 that is a picture.
 *
 * The card is not in any of the three decks — `markers.json` holds it, because
 * it is a component and not something the deck ever deals — so nothing else in
 * this file's lookups would notice if the slice went stale.
 */
describe("the Kamień card that stands in for a figure (20.1)", () => {
  it("names the printed card and a slice that is really there", () => {
    expect(STONE_CARD.name).toBe("ZAKLĘTY W KAMIEŃ");
    const url = cardImageUrl(STONE_CARD.cardId, STONE_CARD.ref);
    expect(url).not.toBeNull();
    expect(existsSync(join("public", url!))).toBe(true);
  });

  it("stands the Kamień card where the figure was, whoever the figure is", () => {
    const flesh = figureUrl("krasnolud", false);
    const stone = figureUrl("krasnolud", true);
    expect(flesh).not.toBeNull();
    expect(stone).not.toBe(flesh);
    // The same card for everybody: four are printed and they are identical, so
    // two statues on one Obszar are two of the same picture and not a tell
    // about which character is under which.
    expect(figureUrl("czarodziej", true)).toBe(stone);
  });

  it("has no figure for a seat with no Postać, and a statue even so", () => {
    // A seat that has not chosen is not on the board at all — but the swap is
    // about the square, so it does not depend on the character being known.
    expect(figureUrl(null, false)).toBeNull();
    expect(figureUrl(null, true)).not.toBeNull();
  });
});
