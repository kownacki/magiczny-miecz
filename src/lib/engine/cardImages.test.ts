import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardImageUrl } from "./cardImages";
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
