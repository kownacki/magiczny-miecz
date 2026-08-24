/** Attaches the instructions printed on the board to the fields the engine knows about. */

import dolnyTexts from "@/data/dolny-fields.json";
import ringTexts from "@/data/ring-fields.json";
import { FIELDS, type BoardField } from "./board";

interface FieldText {
  id: string;
  text: string;
  draw?: number;
}

// The lower ring and the other two were transcribed in separate passes, from
// different crops of the scan, and are checked by different build scripts. They
// are merged here rather than in the data so each pass keeps its own provenance.
const TEXTS = new Map(
  [...(dolnyTexts as FieldText[]), ...(ringTexts as FieldText[])].map((entry) => [
    entry.id,
    entry,
  ]),
);

/**
 * A field with whatever board text has been transcribed for it.
 *
 * Missing text is not an error and never blocks play: the referee is designed
 * to be useful before the transcription is complete, and an untranscribed field
 * simply shows its name and lets the players read the board themselves.
 */
export function fieldWithText(fieldId: string): BoardField | null {
  const field = FIELDS.get(fieldId);
  if (!field) return null;
  const extra = TEXTS.get(fieldId);
  return extra ? { ...field, text: extra.text } : field;
}
