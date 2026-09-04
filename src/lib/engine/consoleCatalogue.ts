/** The box as the console names it: every catalogue Tab offers and the parser reads names through, and the helpers every verb's grammar shares. */

/**
 * Split out of the grammar so that the vocabulary can import it.
 *
 * Each verb's parse and completion live beside its help in `consoleSpec.ts`
 * now, and they read names through these lists — so the lists cannot live in
 * the parser that used to own them without the two files importing each other.
 * Nothing here decides anything: it is what there is to name, in the order it
 * is worth offering.
 */

import characters from "@/data/characters.json";
import events from "@/data/events.json";
import itemCards from "@/data/items.json";
import spells from "@/data/spells.json";
import { CARD_CLASS, CARD_CLASS_LABEL, isFoeClass } from "@/data/types";
import type { CardClass, Character, EventCard, Item, Spell } from "@/data/types";
import {
  DOLNY_KRAG,
  FIELDS,
  GORNY_KRAG,
  KAMIENNY_MOST,
  SRODKOWY_KRAG,
} from "./board";
import type { FieldId } from "./board";
import { SLOTS } from "./slots";
import { findByName, fold } from "./search";
import type { EffectName, Nature } from "./consoleSpec";

/** Every card that can be fought: only a Wróg has a Miecz or a Magia to roll against. */
export const FOES = (events as EventCard[]).filter((card) => isFoeClass(card.cardClass));

/**
 * Everything nameable as a card.
 *
 * The 165 Karty Zdarzeń and the Wyposażenie, which is a separate file because
 * it is a separate deck — and which mostly reprints the same cards, so it is
 * merged by id rather than concatenated. The one name only it has is TARCZA
 * TOLIMANA, and it was already once the card that could not be asked for.
 */
export const CARDS: (EventCard | Item)[] = [
  ...(events as EventCard[]),
  ...(itemCards as Item[]).filter((item) => !events.some((card) => card.id === item.id)),
];

export interface Catalogue {
  title: string;
  cards: readonly { id: string; name: string }[];
}

/**
 * The six kinds a Karta comes in, in the order the numeral prints them.
 *
 * 16's own order — Spotkanie I, Wróg II and III, Nieznajomy IV, Przedmiot and
 * Przyjaciel V, Miejsce VI — turned round so the two kinds somebody actually
 * types at a console come first. A Przedmiot is what a test table is dressed
 * with and a Wróg is what it is pointed at; a Miejsce is looked up once.
 *
 * Both Wróg classes stand together under one heading, as the Księga shelves
 * them: a list is read by name, and somebody looking for the Wilkołak should
 * not have to know first whether he fights with Miecz or Magia.
 */
const KINDS: readonly { title: string; holds: (kind: string) => boolean }[] = [
  { title: "Przedmioty", holds: (kind) => kind === "item" },
  { title: "Przyjaciele", holds: (kind) => kind === "friend" },
  { title: "Wrogowie", holds: (kind) => isFoeClass(kind as CardClass) },
  { title: "Spotkania", holds: (kind) => kind === "encounter" },
  { title: "Nieznajomi", holds: (kind) => kind === "stranger" },
  { title: "Miejsca", holds: (kind) => kind === "place" },
];

/** A Karta Zdarzeń says which class it is; a Wyposażenie card is Przedmiot by being one. */
const kindOf = (card: EventCard | Item): string =>
  "cardClass" in card ? card.cardClass : "item";

/**
 * A pile of cards cut into those kinds, dropping any heading nothing fell under.
 *
 * One function rather than a catalogue per verb, because `deal`, `place`,
 * `stack` and `card` are all the same question — "which Karta do you mean?" —
 * asked of different halves of the box, and three of them used to answer it
 * with one alphabetical heap of a hundred and sixty-five names.
 */
function byKind(cards: readonly (EventCard | Item)[]): Catalogue[] {
  return KINDS.map((kind) => ({
    title: kind.title,
    cards: byName(cards.filter((card) => kind.holds(kindOf(card)))),
  })).filter((group) => group.cards.length > 0);
}

/** 9.3 keeps a Zaklęcie face down even when it arrived by fiat. */
export const ZAKLECIA: Catalogue = { title: "Zaklęcia", cards: byName(spells as Spell[]) };

/**
 * Every Karta that is not a Zaklęcie, in the six kinds.
 *
 * What `place` puts on an Obszar and what `clear` takes off it — the Zaklęcia
 * are the one class that never lies on a square, being their own pile and
 * dealt into a hand (9.5).
 */
export const PLACEABLE: readonly Catalogue[] = byKind(CARDS);

/**
 * The same three words, as a set, for Tab.
 *
 * The completer has to know where a line stopped naming a Karta and started
 * naming money, and it cannot ask a regex that also strips the amount. One
 * list, so the word Tab offers is a word the parser reads.
 */
export const GOLD_WORDS: ReadonlySet<string> = new Set(["gold", "złoto", "zloto"]);

/**
 * The money form of a verb that otherwise names a Karta.
 *
 * `place` and `take` both have one, because both acts have a money half that
 * is not a card: 12.1 names „leżące złoto, Przedmioty lub Przyjaciół" in one
 * breath and the console had a word for two of the three.
 *
 * Answers null when the word is not the money word, so the caller falls
 * through to its card lookup unchanged — which is what keeps `place 2 SZTUKI
 * ZŁOTA` meaning the Karta of that name. Nothing in the box is called „gold"
 * or „złoto" on its own, and the boundary is what stops a card that merely
 * begins with the letters from being read as money.
 */
const GOLD_WORD = /^(gold|złoto|zloto)\b\s*(.*)$/i;

export function goldAsked(said: string): string | null {
  const hit = GOLD_WORD.exec(said.trim());
  return hit ? hit[2].trim() : null;
}

/**
 * A whole kind of Karta, named in one word: `clear strangers`, `clear places`.
 *
 * Sweeping a square one name at a time is what `clear` was, and dressing a test
 * table puts six Karty on one Obszar — so taking the Nieznajomi off and leaving
 * the Wrogowie meant six lines and knowing every name on the square first.
 *
 * # English, and plural
 *
 * English because the class is the *engine's* word and not the box's — the same
 * reason `spoils gold` says gold, and the same reason `CARD_CLASS`'s keys are
 * English while `CARD_CLASS_LABEL` holds what the cards actually print. Derived
 * from those keys rather than written out, so a seventh class cannot arrive
 * without its category word arriving with it.
 *
 * Plural because **DEMON is a card**. It is the one class name the box also
 * prints on a Karta, and a singular category would have made `clear demon`
 * ambiguous between the kind and the creature — with the card unreachable,
 * since a keyword is tried first. A plural is what you would say out loud
 * anyway („weź stąd Nieznajomych"), it collides with nothing in the box, and it
 * leaves every one of the hundred and sixty-five names still typeable.
 */
export const CATEGORIES: ReadonlyMap<string, readonly CardClass[]> = new Map([
  ...(Object.keys(CARD_CLASS) as CardClass[]).map(
    (one) => [`${one}s`, [one]] as [string, readonly CardClass[]],
  ),
  /**
   * And the word for both kinds of Wróg at once.
   *
   * II and III are two resolution classes and one kind of thing — 16.2 and 16.3
   * name them apart only to order them and to send one to 17.1-5 and the other
   * to 18.1-2, while 1.4's trophy, 12.1a's block and 13.5's „muszą oni
   * najpierw zostać pokonani" all say Wróg and mean both. `isFoeClass` is the
   * door the rest of the engine asks, so it is the one asked here: „take the
   * Wrogowie off this square" is one wish, and `clear foes, demons` is that
   * wish spelled with the app's filing system showing.
   */
  [
    "enemies",
    (Object.keys(CARD_CLASS) as CardClass[]).filter(isFoeClass),
  ] as [string, readonly CardClass[]],
]);

/**
 * Whether a word names a kind — or the money, which stands in the same list.
 *
 * Folded the way every other name here is, so `Strangers` and `STRANGERS`
 * answer too: nothing else in this grammar is case-sensitive and a keyword that
 * were would be the one thing you had to hold your shift key for.
 */
export function isCategory(said: string): boolean {
  const word = said.trim().toLowerCase();
  return CATEGORIES.has(word) || GOLD_WORDS.has(word);
}

/**
 * The same words for Tab, with the money at their head and under one heading.
 *
 * **One shelf, not two.** `gold` reads as a kind here even though it is not a
 * class: it stands in the same comma list, it is swept by the same sweep, and
 * the only thing separating it from `items` on the line you type is that one of
 * them is a Karta. Two headings over nine words was the app's filing system on
 * screen rather than the player's question, which is "what can I name instead
 * of a card?"
 *
 * **And the heading is English**, unlike every other one on this grid. Those
 * name what the *box* prints — Przedmioty, Wrogowie, Nieznajomi — and are
 * Polish because the cards are. These are the engine's own words, which is the
 * whole reason they are English to type; a Polish label over them would be
 * naming them in a language you cannot type them in.
 */
export const BY_TYPE: Catalogue = {
  // Money first, the way 12.1 lists it — „zabrać leżące złoto, Przedmioty lub
  // Przyjaciół".
  title: "By type",
  cards: ["gold", ...CATEGORIES.keys()].map((word) => ({ id: word, name: word })),
};

/** What a category is called in the box, for a line reporting what it swept. */
export function categoryName(one: CardClass): string {
  return CARD_CLASS_LABEL[one];
}

/** What Tab offers where the money word goes. The English one, which is the verb's own. */
export const GOLD_OFFERED: Catalogue = {
  title: "Złoto",
  cards: [{ id: "gold", name: "gold" }],
};


/**
 * Every Karta `deal` can make happen, in the six kinds a player thinks in.
 *
 * All of them, which is the change: `give` listed what a hand could hold and
 * `summon` what could be fought, so ninety of the hundred and sixty-five were
 * on a list somewhere and the other seventy-five were on neither. A card is
 * dealt the way drawing it would deal it, and every class can be drawn.
 *
 * Grouped rather than merely sorted because `deal` is how a test table is
 * dressed, and "what can I ask for?" is a question about kinds before it is a
 * question about names. Tab cannot draw the headings — readline owns that grid
 * — so the order clusters them there, and bare `deal` prints the catalogue.
 *
 * The Zaklęcia are last and are the one class that does not reach the turn:
 * they are their own pile, and 9.5 deals one into a hand rather than onto an
 * Obszar.
 */
export const DEALABLE: readonly Catalogue[] = [...PLACEABLE, ZAKLECIA];

/**
 * One entry per card, alphabetically.
 *
 * These files are the *deck* — fifteen rows of 1 SZTUKA ZŁOTA, four of the
 * Tarcza Tolimana, two Miecze — and a catalogue of what you may ask for wants
 * each name once, because you type a name and not a copy. Polish order, so ŁÓDŹ
 * sits after LATARNIA rather than past Z where nobody looks.
 */
function byName(cards: readonly { id: string; name: string }[]): { id: string; name: string }[] {
  const seen = new Map<string, { id: string; name: string }>();
  for (const card of cards) if (!seen.has(card.id)) seen.set(card.id, { id: card.id, name: card.name });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/**
 * What can be put on top of a pile, which is exactly what is *in* one.
 *
 * The 165 Karty Zdarzeń and the 27 Zaklęcia, and nothing else. The Wyposażenie
 * is a stock and not a deck (21.2), so a Hełm has no pile to sit on top of and
 * offering one would be a name the next line rejects — the same failure the
 * note above `GIVEABLE` describes. Deduped by id, because you name a card and
 * not one of its four copies.
 */
export const STACKABLE: { id: string; name: string }[] = byName([
  ...(events as EventCard[]),
  ...(spells as Spell[]),
]);

/** The same two piles, cut into kinds for the list Tab draws. */
export const STACK_KINDS: readonly Catalogue[] = [...byKind(events as EventCard[]), ZAKLECIA];

/** Everything with a Karta worth reading, which is more than a hand may hold. */
export const READABLE: { id: string; name: string }[] = [...CARDS, ...(spells as Spell[])];

export const PEOPLE = characters as Character[];

/**
 * Everything `card` will read out, in kinds — the whole box plus the Postacie.
 *
 * The one catalogue with a heading that is not a Karta Zdarzeń class, because
 * `card` is the verb for "that card I want to read" and a Karta Postaci is one
 * of those. It is last for the same reason the Zaklęcia are second to last: it
 * is the shelf you go to on purpose, not the one you browse.
 */
export const READ_KINDS: readonly Catalogue[] = [
  ...PLACEABLE,
  ZAKLECIA,
  { title: "Postacie", cards: byName(characters as Character[]) },
];

/** What each effect word means, for the answer and for Tab. */
export const EFFECTS: Record<string, EffectName> = {
  fog: "fog",
  frozen: "frozen",
  barred: "barred",
  nolimit: "nolimit",
};

/** The three Natury, under the words typed at them. English, like every verb here. */
/** How a fight ended, as you would say it. The store's words are the rulebook's. */
/**
 * The places a Przedmiot can be worn, as words you might type.
 *
 * Read off `SLOTS` rather than listed again, so a slot added there is typeable
 * here without anybody remembering to come back.
 */
export const SLOT_WORDS = new Set<string>(SLOTS);

export const OUTCOMES: Record<string, "wygrana" | "przegrana" | "remis"> = {
  won: "wygrana",
  lost: "przegrana",
  draw: "remis",
  drawn: "remis",
};

export const NATURES: Record<string, Nature> = {
  good: "good",
  evil: "evil",
  chaotic: "chaotic",
};
export const PLACES = [...FIELDS.values()];

/**
 * The board as four lists, outermost first — the order it is walked.
 *
 * Ninety-odd Obszary in one alphabetical heap made you read every name to find
 * the one you wanted, when what you actually know about an Obszar is which
 * Krąg it is on. The Księga's drawer cuts them exactly this way, and Tab now
 * answers `place ... at` and `teleport` with the same four shelves.
 *
 * Inside a Krąg they stay in **board order**, clockwise from where `rings.ts`
 * starts each one, rather than being sorted: the names come in pairs (Urwisko
 * I and II, Bagna I and II, both Przeprawy) that sit opposite each other on the
 * board, and alphabetical order files them together while board order says
 * where they are.
 */
export const FIELD_KINDS: readonly Catalogue[] = [
  { title: "Dolny Krąg", cards: DOLNY_KRAG },
  { title: "Środkowy Krąg", cards: SRODKOWY_KRAG },
  { title: "Górny Krąg", cards: GORNY_KRAG },
  { title: "Kamienny Most", cards: KAMIENNY_MOST },
];

/** Where `at` splits `place MIECZ at Karczma` into its two names. */
export const AT = /\s+at\s+/i;

/**
 * And `to`, for the one Zaklęcie that names two places.
 *
 * „Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym
 * Kręgu" — `cast WŁADCA ZDARZEŃ at CYKLOP to Mroczna Polana`, which is the
 * whole card in one line.
 */
export const TO = /\s+to\s+/i;

/**
 * And `as`, which does the same for `revive Ola as MAGOG`.
 *
 * Allowed at the very start as well, because the player is optional: `revive as
 * MAGOG` is your own seat, and requiring a space before the word would have
 * read that whole line as somebody's name.
 */
export const AS = /(^|\s+)as\s+/i;

/* --------------------------------------------------------------------------
 * What every verb's grammar shares.
 * ----------------------------------------------------------------------- */

/**
 * Something is missing, and here is the shape of the line.
 *
 * Every one of these used to be written by hand and about half of them
 * remembered the usage — so `card` taught you how to type it and `kick` did
 * not, for no reason anybody chose. Being stopped is exactly the moment the
 * shape is worth seeing.
 *
 * The usage rather than the whole of `help <command>`: you have just typed the
 * verb, so you know what it does; what you are missing is where the argument
 * goes.
 */
export function missing(usage: string, question: string): { error: string } {
  return { error: `${question} ${usage}` };
}

/** Resolves one name into a command, or says why it could not. */
export function named<T, C>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  what: string,
  build: (item: T) => C,
  /** The verb's usage, shown when nothing was named. */
  usage: string,
): { ok: C } | { error: string } {
  if (query === "") return missing(usage, `Which ${what}?`);
  const hit = findByName(items, nameOf, query);
  if ("found" in hit) return { ok: build(hit.found) };
  if ("ambiguous" in hit) {
    return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
  }
  return { error: `No ${what} called \`${query}\`.` };
}

/** An Obszar by name, for the verbs that take one after `at`. */
export function fieldNamed(said: string): { fieldId: FieldId } | { error: string } {
  const where = findByName(PLACES, (field) => field.name, said);
  if ("ambiguous" in where) return { error: `Which one — ${where.ambiguous.join(", ")}?` };
  if ("missing" in where) return { error: `No Obszar called \`${said}\`.` };
  return { fieldId: where.found.id };
}

/**
 * Every name a position could take, and where the fragment being typed starts.
 *
 * `ordered` for a pool that has already decided what order it wants to be read
 * in; everything else is sorted alphabetically by the completer, which is right
 * for a list of names with no shape of its own.
 */
export interface Pool {
  pool: string[];
  at: number;
  ordered?: true;
  groups?: readonly { title: string; names: readonly string[] }[];
}

/**
 * A catalogue as a pool: every name in it, in its own order, with the headings
 * kept beside them for a console that can draw them.
 *
 * `ordered`, or the sort would put ALCHEMIK between 2 SZTUKI ZŁOTA and
 * ARONDIGHT and the kinds would be shuffled together — which is what happened
 * when the first of these was grouped and the sort was forgotten. Tab draws a
 * plain grid and cannot label the groups, so their order is the whole of what
 * it can carry there; the browser console draws the headings from `groups`.
 */
export function shelved(kinds: readonly Catalogue[], at: number): Pool {
  return {
    pool: kinds.flatMap((group) => group.cards.map((one) => one.name)),
    at,
    ordered: true,
    groups: kinds.map((group) => ({
      title: group.title,
      names: group.cards.map((one) => one.name),
    })),
  };
}

/** Nothing to offer at this position. */
export function nothing(parts: readonly string[]): Pool {
  return { pool: [], at: parts.length - 1 };
}

/** Where a keyword — `at`, `as` — stands in the typed parts, or -1. */
export function keywordAt(parts: readonly string[], word: string): number {
  return parts.findIndex((part, index) => index > 0 && part.toLowerCase() === word);
}

/**
 * A comma-separated list: what is being typed is whatever follows the last comma.
 *
 * Without this Tab went quiet after the first card: the fragment is the parts
 * from `at` joined, so `deal SMOK, MIE` matched against "SMOK, MIE" and no card
 * starts with that. The comma is the only boundary a name with spaces in it
 * can have — see the parser — so it is the one Tab reads too.
 */
export function afterComma(parts: readonly string[]): number {
  return parts.reduce(
    (found, part, index) => (index > 0 && part.endsWith(",") ? index : found),
    0,
  ) + 1;
}

/**
 * Whether the name in front of `at` is finished, so `at` is what comes next.
 *
 * Tab went quiet here, which is the one place it must not: `place EREMITA `
 * offered nothing, because no card name starts with "eremita " and the fragment
 * being matched still included the space. The keyword is the only thing that
 * can follow a finished name, so it is what is offered — and only when the name
 * really is finished, or `place TARCZA ` would stop offering TARCZA TOLIMANA,
 * which is a different card.
 */
export function finishedName(parts: readonly string[], names: readonly string[]): boolean {
  if (parts.length < 3 || parts[parts.length - 1] !== "") return false;
  const typed = fold(parts.slice(1, -1).join(" "));
  return (
    names.some((name) => fold(name) === typed) &&
    !names.some((name) => fold(name).startsWith(`${typed} `))
  );
}
