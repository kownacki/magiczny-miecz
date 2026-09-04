import { describe, expect, it } from "vitest";
import { FIELDS } from "@/lib/engine/board";
import { BRIDGE_ORDEAL } from "@/lib/engine/bridge";
import { fieldScriptFor } from "@/lib/engine/fieldScript";
import { parseRollTable } from "@/lib/engine/rollTable";
import { fieldWithText } from "./fieldText";

/**
 * Every printed die table has a typed reading, so nobody computes one by hand.
 *
 * `parseRollTable` is a detector, not a renderer: it reads an Obszar's
 * transcribed text and says whether it reads as a six-face "rzuć kostką"
 * table. Nothing shows a player that reading any more — a prose-parsed
 * `RollTable` component used to, and was deleted once every table it could
 * find already had a typed one: `fieldScript`'s `rzut` `Effect`, resolved on
 * the server and rendered through `FieldService`, or the Kamienny Most's own
 * ordeal logic for the two fields that are dice-and-arithmetic rather than a
 * flat table.
 *
 * The check stays because the fact it guards outlived the renderer: a table
 * left untyped is a table a player has to read and add up themselves, which is
 * the exact chore this project exists to remove. Twelve parse, and all twelve
 * have a typed reading: ten through `fieldScript`, and the Pułapka and Cerber
 * as Kamienny Most ordeals. This says so, so a thirteenth cannot arrive
 * unnoticed.
 */
describe("an Obszar whose printed text is a die table", () => {
  const tabled = [...FIELDS.keys()]
    .map((id) => ({ id, field: fieldWithText(id) }))
    .filter(({ field }) => {
      const text = (field as { text?: string } | null)?.text;
      return text !== undefined && parseRollTable(text) !== null;
    });

  it("has a typed FieldOffer — fieldScript's, or a Kamienny Most ordeal's", () => {
    const stranded = tabled
      .filter(({ id }) => !fieldScriptFor(id) && !BRIDGE_ORDEAL.has(id))
      .map(({ id }) => id);
    expect(stranded).toEqual([]);
  });

  /**
   * A count, so that adding a table to a field nobody scripted fails here
   * rather than silently leaving that table only in prose, for a player to
   * read and add up by hand.
   */
  it("is one of the twelve, and they are all accounted for", () => {
    expect(tabled).toHaveLength(12);
  });
});
