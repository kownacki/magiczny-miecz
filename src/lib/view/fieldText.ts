/** Attaches the instructions printed on the board to the fields the engine knows about. */

import dolnyTexts from "@/data/dolny-fields.json";
import mostTexts from "@/data/most-fields.json";
import ringTexts from "@/data/ring-fields.json";
import { FIELDS, type BoardField, type FieldId } from "@/lib/engine/board";

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
