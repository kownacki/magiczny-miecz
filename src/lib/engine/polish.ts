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

import characters from "@/data/characters.json";
import events from "@/data/events.json";
import items from "@/data/items.json";
import spells from "@/data/spells.json";
import type { Character, EventCard, Item, Spell } from "@/data/types";
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

/**
 * What a Karta Postaci calls a character.
 *
 * The cards that name exceptions name characters — the Zaklinacz Czasu's flute
 * stills everyone "z wyjątkiem Elfa, Hummita, Spryciarza" — and an id is not a
 * name. `describeEffect` was printing the slug, so the same exemption read
 * "oprócz: elf" in a summary and "oprócz: ELF" under the button beside it.
 *
 * Two of the five that card names are expansion characters and are in no box
 * here (see `oprocz` in `cardScript.ts`), so a miss is expected rather than a
 * fault and falls back to the id like the other two lookups.
 */
export function characterName(characterId: string): string {
  return (
    (characters as Character[]).find((one) => one.id === characterId)?.name ??
    NOT_IN_THIS_BOX[characterId] ??
    characterId
  );
}

/**
 * Postacie a base-game card names that are not in the base game.
 *
 * Two of them, both on the Zaklinacz Czasu, and the slug cannot be turned back
 * into the name — „szczesciarz" has no way of becoming „SZCZĘŚCIARZ". Without
 * this the exemption list read „ELF, HUMMIT, SPRYCIARZ, czarodziejka,
 * szczesciarz": three names and two file names, which looks like a bug in the
 * app rather than a fact about the box.
 *
 * `isInThisBox` is the other half — the sentence has to say they are missing,
 * not merely spell them properly.
 */
const NOT_IN_THIS_BOX: Record<string, string> = {
  czarodziejka: "CZARODZIEJKA",
  szczesciarz: "SZCZĘŚCIARZ",
};

/** Whether the box this app plays actually contains this Postać. */
export function isInThisBox(characterId: string): boolean {
  return (characters as Character[]).some((one) => one.id === characterId);
}

/**
 * What is printed at the top of a card, whichever pile it came from.
 *
 * All three, because a holding is a card and the pile it came from is not
 * something the sentence saying its name should have to know: the Lichwiarz
 * buys Przedmioty, 12.5 has a Zaklęcie spoken out loud, and both arrive as a
 * bare id.
 *
 * Both the copies this note used to name — in `turnStore.ts` and
 * `commands/holdings.ts` — are gone, and their callers import this one.
 *
 * What remains elsewhere is not a copy of this and should not be folded into
 * it. `journalText.ts` takes `unknown` off a stored payload and answers
 * "kartę" for a row that has none, and `consoleStore.ts` takes `string | null`
 * off a column and answers "—" for an empty one. Those fallbacks are the
 * surfaces' own sentences, not this lookup wearing a guard.
 */
export function cardName(cardId: string): string {
  return (
    (events as EventCard[]).find((card) => card.id === cardId)?.name ??
    (items as Item[]).find((item) => item.id === cardId)?.name ??
    (spells as Spell[]).find((spell) => spell.id === cardId)?.name ??
    cardId
  );
}

/**
 * The round as a person counts it.
 *
 * `games.round` counts circuits *completed*: it starts at 0 and advances only
 * when play comes back round to or past the first seat, so the whole first time
 * round the table is stored as 0 — which on screen reads as an unset field
 * rather than as a count. Nobody at a table says „runda zero".
 *
 * So every surface adds one, and adds it here. Five of them print this number —
 * the bar, the Teraz box, the queue's boundary labels, the Dziennik's headings
 * and the marker line `passTurn` writes when play wraps — and a convention
 * applied to four of the five is worse than either convention applied to all
 * of them. The column is untouched: 20.1's Kamień and 11.11's Most compare
 * against absolute round numbers and none of that arithmetic moves.
 */
export function roundShown(round: number): number {
  return round + 1;
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

/**
 * The same four for a masculine subject.
 *
 * `NATURE_LABEL` agrees with „Postać", which is feminine whoever it is, and is
 * right wherever the sentence says „Postać". A sentence that names the Postać
 * instead — „Marcin (MAG) jest zły" — agrees with the name, and twenty-five of
 * the twenty-seven Karty Postaci are masculine.
 */
export const NATURE_LABEL_M: Record<string, string> = {
  good: "dobry",
  evil: "zły",
  chaotic: "chaotyczny",
  any: "dowolny",
};

/**
 * The same four in the genitive, for „dotyczy Postaci: dobrej lub chaotycznej".
 *
 * A Karta whose condition names who it *hits* rather than who may hold it reads
 * „dotyczy Postaci", which the Instrukcja's own „dotyczy" governs with a
 * genitive; the nominative that fits „tylko Postać" gives „dotyczy Postaci:
 * dobra", which is the word in the wrong shape.
 */
export const NATURE_LABEL_G: Record<string, string> = {
  good: "dobrej",
  evil: "złej",
  chaotic: "chaotycznej",
  any: "dowolnej",
};

/** What a `strata` takes off you. */
export type Loss = Extract<Effect, { op: "strata" }>["co"];

export const LOST_LABEL: Record<Loss, string> = {
  przedmiot: "Przedmiot",
  przyjaciel: "Przyjaciela",
  "wszyscy-przyjaciele-oprocz": "wszystkich Przyjaciół",
  zaklecie: "Zaklęcie",
  gold: "całe złoto",
  "wszystkie-przedmioty": "wszystkie Przedmioty",
  "wszystkie-zaklecia": "wszystkie Zaklęcia",
};

/**
 * The three forms a counted loss needs, for the three ways Polish counts.
 *
 * `LOST_LABEL` above is the accusative singular — "tracisz Przyjaciela" — and
 * putting a numeral in front of it gives "tracisz 5 Przyjaciela", which is not
 * a sentence. It went unnoticed because nothing in the corpus takes more than
 * one of anything: every `strata` in the box either has no count or has a count
 * of one, and the two `wszystkie-` entries are already plural by construction.
 *
 * So this is here before the card that needs it rather than after. Only the
 * three countable losses are listed; złoto and the two `wszystkie-` forms are
 * never counted, and a `Partial` says so rather than inventing forms nothing
 * will ask for.
 *
 * Masculine personal nouns take the genitive plural for 2-4 as well as for 5+,
 * which is why Przyjaciel has the same word twice and Przedmiot does not.
 */
export const LOST_COUNTED: Partial<Record<Loss, readonly [string, string, string]>> = {
  przedmiot: ["Przedmiot", "Przedmioty", "Przedmiotów"],
  przyjaciel: ["Przyjaciela", "Przyjaciół", "Przyjaciół"],
  zaklecie: ["Zaklęcie", "Zaklęcia", "Zaklęć"],
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
  "wszyscy-tutaj": "wszyscy na tym Obszarze",
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
 * The two targets `TARGET_SHORT` names in the singular.
 *
 * Polish conjugates, so a sentence built round one of these takes „traci" and
 * the rest take „tracą" — „każdy, kto tu trafi **traci** 1 turę" against
 * „wszyscy **tracą** 1 turę". Two entries and a default is the whole of it, and
 * it lives here beside the words it is about.
 */
export const TARGET_SINGULAR = new Set<Target>(["kazdy-kto-tu-trafi", "inna-postac"]);

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
  "wszyscy-tutaj": "wszystkie Postacie na tym Obszarze",
  "kazdy-kto-tu-trafi": "każdy, kto tu trafi",
  dobrzy: "Postacie o Naturze dobrej",
  chaotyczni: "Postacie o Naturze chaotycznej",
  zli: "Postacie o Naturze złej",
  "w-dolnym-kregu": "wędrujący po Dolnym Kręgu",
  "w-srodkowym-kregu": "wędrujący po Środkowym Kręgu",
  "w-gornym-kregu": "wędrujący po Górnym Kręgu",
  "inna-postac": "wybrana inna Postać",
};

/**
 * The four facts that identify a character, written once.
 *
 * Who this is, what it fights and casts with, and what Natura it is of — the
 * line over a Karta Postaci when it is opened, and the hover on the same card
 * when it is being chosen. It had been written out five times between the
 * roster, the lookup, the seat card, the lobby's picker and the rebirth
 * picker, and all five of them printed the Natura as `good`, `evil` or
 * `chaotic`: the stored key, in English, at a Polish table.
 *
 * Which is the hazard `NATURE_LABEL` was put here to end, arriving by the one
 * route a map cannot close — five places each formatting the same sentence,
 * none of them wrong about the Natura so much as never asking.
 */
export function characterFacts(character: {
  miecz: number;
  magia: number;
  nature: string;
}): string {
  return `Miecz ${character.miecz} · Magia ${character.magia} · ${
    NATURE_LABEL[character.nature] ?? character.nature
  }`;
}

/** The same four, as the kind-line a Karta Postaci is opened under. */
export function characterKind(character: { miecz: number; magia: number; nature: string }): string {
  return `Postać · ${characterFacts(character)}`;
}

/** And as a hover on a card being picked, where the starting Obszar matters too. */
export function characterTitle(character: {
  name: string;
  miecz: number;
  magia: number;
  nature: string;
  start: string;
}): string {
  return `${character.name} — ${characterFacts(character)} · start: ${character.start}`;
}

/**
 * A number of Sztuki Złota, declined the way Polish declines it.
 *
 * In the accusative, which is the case every sentence that uses it wants:
 * „kładzie 1 Sztukę Złota", „zabiera 5 Sztuk Złota". „Złota" is the genitive of
 * „Złoto" and stays put whatever the count does, which is why the plural rule
 * applies to the first word alone.
 *
 * Out of `journalText.ts`, where it was written for the journal and then wanted
 * by the console the moment `place gold` existed.
 */
export function sztuki(n: number): string {
  return `${n} ${plural(n, "Sztukę", "Sztuki", "Sztuk")} Złota`;
}

/**
 * A line that stands on its own, starting the way a line does.
 *
 * The formalised lines beside a Karta are *composed*, not written: `abilityText`
 * builds them out of fragments that nest — „jeśli zła: +1 Magii; w przeciwnym
 * razie: Natura: zła" is four pieces, and three of them appear mid-sentence
 * inside other lines. So the fragments stay lowercase, which is what they are,
 * and the capital goes on at the moment one of them becomes the *first* thing
 * on a line. Capitalising at the source would have put one in the middle of
 * every line that quotes another.
 *
 * Only the first character, and only where there is a letter to change: a line
 * that opens „+1 Złota" or „−1 Życia" is left exactly as it is. `toUpperCase`
 * is safe on Polish here because every letter these lines can begin with —
 * ł, ś, ż, ź, ć, ń, ó, ą, ę — has a single-character upper case.
 *
 * Not for a value that follows a label. „Kiedy: w dowolnej chwili" and „Slot:
 * ręka główna" are one sentence with a colon in the middle, and the half after
 * it does not start again.
 *
 * A caller joining several of these has to decide what its separator means
 * before deciding where the capitals go, and the two in `CardFacts` mean
 * different things: a middot stands between independent labels and each of them
 * starts, a comma is punctuation inside one clause and only the first does.
 * Capitalising the joined string is right for the second and wrong for the
 * first — „Do wyboru (13.5) · teraz albo wcale" was how that showed.
 */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
