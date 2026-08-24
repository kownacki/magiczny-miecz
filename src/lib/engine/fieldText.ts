/** Attaches the instructions printed on the board to the fields the engine knows about. */

import fieldTexts from "@/data/dolny-fields.json";
import { FIELDS, type BoardField } from "./board";

interface FieldText {
  id: string;
  text: string;
  draw?: number;
}

const TEXTS = new Map((fieldTexts as FieldText[]).map((entry) => [entry.id, entry]));

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
