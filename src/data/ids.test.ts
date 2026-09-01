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

/**
 * Two names belong to two cards each.
 *
 * A Karta Postaci and a Karta Zdarzeń can share an id — `demon` is a Postać and
 * a Wróg, `czarodziej` is a Postać and a Nieznajomy — and the pairs are nothing
 * to do with each other: different pictures, different rules, and one of each
 * pair is something the other can meet on the board.
 *
 * It is pinned here because the code that has to know lives a long way from the
 * data: `cardKey` in `card-tile.tsx`, which is what the Księga's search keys its
 * results on. Keyed on the bare id, the Postacie shelf claimed the name and the
 * Nieznajomy CZARODZIEJ never appeared at all. If a third pair ever arrives, or
 * one of these is renamed, this is where it says so.
 */
describe("the ids a Postać shares with a Karta Zdarzeń", () => {
  it("is exactly these two, and nothing here is a coincidence to be fixed", () => {
    const characterIds = new Set((characters as { id: string }[]).map((one) => one.id));
    const shared = (events as { id: string }[])
      .map((card) => card.id)
      .filter((id) => characterIds.has(id))
      .sort();
    expect(shared).toEqual(["czarodziej", "demon"]);
  });
});
