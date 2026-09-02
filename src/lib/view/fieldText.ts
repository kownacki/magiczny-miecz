/** Attaches the instructions printed on the board to the fields the engine knows about. */

import dolnyTexts from "@/data/dolny-fields.json";
import mostTexts from "@/data/most-fields.json";
import ringTexts from "@/data/ring-fields.json";
import { FIELDS, type BoardField, type FieldId } from "@/lib/engine/board";
import { fieldScriptFor, type FieldOffer } from "@/lib/engine/fieldScript";

interface FieldText {
  id: string;
  text: string;
  draw?: number;
}

// The three rings and the bridge were transcribed in separate passes, from
// different sources — the rings off the board scan, the bridge off the back of
// the rulebook. They are merged here rather than in the data so each pass keeps
// its own provenance.
const TEXTS = new Map(
  [
    ...(dolnyTexts as FieldText[]),
    ...(ringTexts as FieldText[]),
    // The Kamienny Most's nine fields are printed at the back of the rulebook
    // rather than on the board's face, which is why they were transcribed with
    // the rules and then never loaded — nine fields, including the Zamek
    // Bestii, that the app knew the name of and nothing else.
    ...(mostTexts as FieldText[]),
  ].map((entry) => [entry.id, entry]),
);

/**
 * A field with whatever board text has been transcribed for it.
 *
 * Missing text is not an error and never blocks play: the referee is designed
 * to be useful before the transcription is complete, and an untranscribed field
 * simply shows its name and lets the players read the board themselves.
 */
export function fieldWithText(fieldId: FieldId): BoardField | null {
  const field = FIELDS.get(fieldId);
  if (!field) return null;
  const extra = TEXTS.get(fieldId);
  return extra ? { ...field, text: extra.text } : field;
}

/**
 * The board's own words for one offer, or null where the board has none.
 *
 * Two shapes on the printed board and this reconciles them. The Osada and the
 * Gród head their text "MOŻESZ TU ODWIEDZIĆ:" and then print a line each, so
 * each offer carries its own; everywhere else the Obszar makes exactly one
 * offer and its whole text is that offer's, which is taken rather than copied
 * into `fieldScript.ts` — six paragraphs transcribed twice is six chances for
 * the two to disagree, and the one on screen would look like the board.
 *
 * Null is a real answer and the Pustelnia's Egzorcyzm is why: freeing yourself
 * of the ZŁY DUCH is something you come to the Pustelnia to do, but the words
 * for it are printed on his Karta and not on the square. Falling back to the
 * field's text there would put the Pustelnik's herbs above a button that has
 * nothing to do with them.
 */
export function offerText(fieldId: FieldId, offer: FieldOffer): string | null {
  if (offer.text) return offer.text;
  const script = fieldScriptFor(fieldId);
  if (script && script.offers.length === 1) return fieldWithText(fieldId)?.text ?? null;
  return null;
}

/**
 * The heading the two itemised Obszary print above their list.
 *
 * `OfferList` draws its own, so leaving this in the paragraph above it prints
 * the same three words twice, a finger apart.
 */
const VISITING_HEADING = "MOŻESZ TU ODWIEDZIĆ:";

/**
 * What the Obszar's text still says once its offers have taken their own lines.
 *
 * The Osada prints „MOŻESZ TU ODWIEDZIĆ:" and then a line each for the
 * Czarownica, the Płatnerz and the Medyk — and the window was showing all
 * three at the top *and* a button for each underneath, so the die table you
 * were deciding about sat in a paragraph three inches above the button that
 * throws it. The lines belong to their offers; each one goes on its own button
 * and into its own subview, and what is left up here is whatever the board says
 * about the Obszar itself.
 *
 * For the Osada and the Gród that is nothing at all, and this answers null —
 * the whole of their text is the list. Everywhere else the Obszar makes one
 * offer, `offerText` falls back to the entire paragraph, and taking it away
 * would leave the square with no description and a button holding a twelve-row
 * die table. So the fallback is deliberately not stripped: only a line the
 * board itself itemised moves.
 */
export function fieldTextBesidesOffers(fieldId: FieldId): string | null {
  const printed = fieldWithText(fieldId)?.text;
  if (!printed) return null;
  const taken = new Set(
    (fieldScriptFor(fieldId)?.offers ?? [])
      .map((offer) => offer.text)
      .filter((text): text is string => text !== undefined),
  );
  if (taken.size === 0) return printed;

  const left = printed
    .split("\n")
    .filter((line) => !taken.has(line.trim()) && line.trim() !== VISITING_HEADING)
    .join("\n")
    .trim();
  return left.length > 0 ? left : null;
}
