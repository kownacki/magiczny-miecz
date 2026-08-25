import { describe, expect, it } from "vitest";
import characters from "./characters.json";
import events from "./events.json";
import items from "./items.json";
import spells from "./spells.json";
import { CHARACTER_IDS, EVENT_IDS, ITEM_IDS, SPELL_IDS } from "./ids";

/**
 * `ids.ts` is generated, and a generated file that has gone stale is worse than
 * no file at all: the compiler would keep cheerfully accepting an id for a card
 * that has been renamed out from under it, and rejecting the one that replaced
 * it. So the generator's output is checked against its input on every run.
 *
 * If this fails: `node scripts/generate-ids.mjs`.
 */
const distinctSorted = (ids: string[]) => [...new Set(ids)].sort();

describe("the generated id types match the transcription", () => {
  it.each([
    ["characters", CHARACTER_IDS, (characters as { id: string }[]).map((c) => c.id)],
    ["events", EVENT_IDS, (events as { id: string }[]).map((c) => c.id)],
    ["items", ITEM_IDS, (items as { id: string }[]).map((i) => i.id)],
    ["spells", SPELL_IDS, (spells as { id: string }[]).map((s) => s.id)],
  ])("%s", (_what, generated, source) => {
    expect([...generated]).toEqual(distinctSorted(source));
  });
});
