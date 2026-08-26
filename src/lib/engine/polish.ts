/**
 * The grammar the descriptions are written in, and the words they agree on.
 *
 * Polish counts three ways — 1 tura, 2 tury, 5 tur — with an exception at
 * 12–14 that reads like a typo until you hit it. That rule had been written out
 * verbatim four times (`effectText`, `abilityText`, `journalText`,
 * `card-library`) plus a fifth, shorter copy in the turn queue that had dropped
 * the exception and got away with it only because a Kamień never lasts
 * twenty-two turns. Five copies of one sentence is five chances for four of
 * them to stay right.
 *
 * `abilityText.ts` already warns about exactly this hazard one level up:
 * `describeAbility` lives in the engine "because three different places want to
 * say the same thing about the same rule, and saying it three ways is how a
 * description stops matching what the code does". The same is true of the
 * grammar those descriptions are built out of, and of the label tables below —
 * an exhaustive `Record<Target, string>` written once in the engine and once in
 * a component is two lists the compiler keeps *complete* and nothing keeps
 * *equal*.
 */

import { FIELDS, type FieldId } from "./board";
import type { Effect, Target } from "./cardScript";

/** Polish counts three ways, and the game deals in small numbers. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = n % 10;
  const tens = n % 100;
  return last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? few : many;
}

/**
 * What the board calls a field.
 *
 * Falls back to the id, which is a slug of the printed name and therefore
 * legible enough to debug with — a field the board does not know is a bug to
 * see, not one to hide behind "?".
 */
export function fieldName(fieldId: FieldId): string {
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/** The four tracked numbers, in the case they are read in ("+2 Miecza"). */
export type Stat = Extract<Effect, { op: "punkty" }>["stat"];

export const STAT_LABEL: Record<Stat, string> = {
  sword: "Miecza",
  magic: "Magii",
  life: "Życia",
  gold: "Złota",
};

/**
 * A Natura, as the character card prints it.
 *
 * Stored in English like every other key and shown in Polish like every other
 * word on the screen. Three copies of this map appeared within an hour of the
 * rename — the journal's, an ability's condition, and the panel under the card,
 * which did not get one and printed "natura: good" at a table.
 */
export const NATURE_LABEL: Record<string, string> = {
  good: "dobra",
  evil: "zła",
  chaotic: "chaotyczna",
  // A Kat's card, which prints no Natura and lets its player pick one (8.2).
  any: "dowolna",
};

/** What a `strata` takes off you. */
export type Loss = Extract<Effect, { op: "strata" }>["co"];

export const LOST_LABEL: Record<Loss, string> = {
  przedmiot: "Przedmiot",
  przyjaciel: "Przyjaciela",
  zaklecie: "Zaklęcie",
  gold: "całe złoto",
  "wszystkie-przedmioty": "wszystkie Przedmioty",
  "wszystkie-zaklecia": "wszystkie Zaklęcia",
};

/**
 * Who an effect lands on, in the card's own shorthand.
 *
 * Read hanging off the end of an effect that has already named itself — "+2
 * Miecza — Dobre Postacie" — where the long form would be three quarters of the
 * line.
 */
export const TARGET_SHORT: Record<Target, string> = {
  ty: "ty",
  wszyscy: "wszyscy",
  "wszyscy-w-kregu": "wszyscy w tym Kręgu",
  "kazdy-kto-tu-trafi": "każdy, kto tu trafi",
  dobrzy: "Dobre Postacie",
  chaotyczni: "Chaotyczne Postacie",
  zli: "Złe Postacie",
  "w-dolnym-kregu": "wędrujący Dolnym Kręgiem",
  "w-srodkowym-kregu": "wędrujący Środkowym Kręgiem",
  "w-gornym-kregu": "wędrujący Górnym Kręgiem",
  "inna-postac": "wybrana Postać",
};

/**
 * The same eleven, spelled out.
 *
 * Deliberately a second wording rather than a second copy. The turn panel is
 * telling somebody to go and do a thing, with no card in front of them to read
 * it against, so "Postacie o Naturze dobrej" earns its length there in a way it
 * does not in a one-line summary. Two voices, one union — and the compiler
 * makes sure the union stays covered by both.
 */
export const TARGET_FULL: Record<Target, string> = {
  ty: "ty",
  wszyscy: "wszystkie Postacie",
  "wszyscy-w-kregu": "wszystkie Postacie w tym Kręgu",
  "kazdy-kto-tu-trafi": "każdy, kto tu trafi",
  dobrzy: "Postacie o Naturze dobrej",
  chaotyczni: "Postacie o Naturze chaotycznej",
  zli: "Postacie o Naturze złej",
  "w-dolnym-kregu": "wędrujący po Dolnym Kręgu",
  "w-srodkowym-kregu": "wędrujący po Środkowym Kręgu",
  "w-gornym-kregu": "wędrujący po Górnym Kręgu",
  "inna-postac": "wybrana inna Postać",
};
