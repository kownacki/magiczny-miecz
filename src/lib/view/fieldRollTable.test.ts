import { describe, expect, it } from "vitest";
import { FIELDS } from "@/lib/engine/board";
import { BRIDGE_ORDEAL } from "@/lib/engine/bridge";
import { fieldScriptFor } from "@/lib/engine/fieldScript";
import { parseRollTable } from "@/lib/engine/rollTable";
import { fieldWithText } from "./fieldText";

/**
 * The prose die table, and why the simulation may hide its buttons.
 *
 * `RollTable` reads an Obszar's printed text and, where it parses as a die
 * table, offers to roll it. In a simulation those buttons are gone: the die was
 * the browser's `Math.random`, so it reached neither the server nor the journal,
 * and the outcome was applied through `/adjust` — the manual override — on a
 * board where nothing is supposed to be entered by hand.
 *
 * That is only safe if every Obszar with such a table is one the server already
 * resolves, so the player has a real way to roll it. Twelve parse, and all
 * twelve do: ten through `fieldScript`, and the Pułapka and Cerber as Kamienny
 * Most ordeals. This says so, so a thirteenth cannot arrive unnoticed.
 */
describe("an Obszar whose printed text is a die table", () => {
  const tabled = [...FIELDS.keys()]
    .map((id) => ({ id, field: fieldWithText(id) }))
    .filter(({ field }) => {
      const text = (field as { text?: string } | null)?.text;
      return text !== undefined && parseRollTable(text) !== null;
    });

  it("is one the app can roll for itself", () => {
    const stranded = tabled
      .filter(({ id }) => !fieldScriptFor(id) && !BRIDGE_ORDEAL.has(id))
      .map(({ id }) => id);
    expect(stranded).toEqual([]);
  });

  /**
   * A count, so that adding a table to a field nobody scripted fails here
   * rather than silently leaving a simulation with nothing to press.
   */
  it("is one of the twelve, and they are all accounted for", () => {
    expect(tabled).toHaveLength(12);
  });
});
