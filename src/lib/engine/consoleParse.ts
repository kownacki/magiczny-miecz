/** The grammar: one typed line read against the vocabulary, and the lookups it reads names through. */

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
  type FieldId,
} from "./board";
import { SLOTS } from "./slots";
import { findByName, fold } from "./search";
import { RANDOM_CHARACTER_ID, RANDOM_CHARACTER_NAME } from "./characters";
import {
  COMMANDS,
  STATS,
  type Command,
  type EffectName,
  type Nature,
  type StatName,
} from "./consoleSpec";

export const VERBS = new Set(COMMANDS.flatMap((spec) => [spec.name, ...spec.aliases]));

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
const ZAKLECIA: Catalogue = { title: "Zaklęcia", cards: byName(spells as Spell[]) };

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

function goldAsked(said: string): string | null {
  const hit = GOLD_WORD.exec(said.trim());
  return hit ? hit[2].trim() : null;
}

/** A whole number of coins, or the reason it is not one. */
function coins(said: string, verb: string): { gold: number } | { error: string } {
  const asked = Number(said);
  if (!Number.isInteger(asked) || asked < 1) {
    return { error: `\`${verb} gold\` wants a whole number of Sztuki Złota — \`${verb} gold 5\`.` };
  }
  return { gold: asked };
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
const AT = /\s+at\s+/i;

/**
 * And `to`, for the one Zaklęcie that names two places.
 *
 * „Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym
 * Kręgu" — `cast WŁADCA ZDARZEŃ at CYKLOP to Mroczna Polana`, which is the
 * whole card in one line.
 */
const TO = /\s+to\s+/i;

/**
 * And `as`, which does the same for `revive Ola as MAGOG`.
 *
 * Allowed at the very start as well, because the player is optional: `revive as
 * MAGOG` is your own seat, and requiring a space before the word would have
 * read that whole line as somebody's name.
 */
const AS = /(^|\s+)as\s+/i;

/**
 * Reads one line.
 *
 * A leading slash is allowed and ignored — it is what a person types out of
 * habit, and refusing it would be pedantry. Everything is case-insensitive and
 * the rest of the line after the verb is one argument, so a card can be named
 * with the spaces it is printed with: `give magiczny miecz`.
 */

export function parseCommand(line: string): { ok: Command } | { error: string } {
  const trimmed = line.trim().replace(/^\//, "");
  if (trimmed === "") return { error: "Type a command, or `help`." };

  const [first, ...rest] = trimmed.split(/\s+/);
  /**
   * `sword+1` and `gold-2`, split where a person forgot the space.
   *
   * Only where the sign or the digit begins, so it can never break a name: no
   * command has a number in it, and a card that does is one argument later.
   */
  const glued = /^([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)([+-]?\d.*)$/.exec(first);
  const verb = glued ? glued[1] : first;
  const word = verb.toLowerCase();
  const tail = [...(glued ? [glued[2]] : []), ...rest].join(" ").trim();

  if (!VERBS.has(word)) return { error: `No command \`${word}\`. Type \`help\` for the list.` };

  if (word === "help" || word === "?") {
    // Refused here rather than reported as an empty list, because `help go`
    // typed at a console that has no `go` is a question, and "there is no such
    // command" is the answer to it.
    const asked = tail.toLowerCase().split(/\s+/)[0];
    // `all` is not a command and is the one word this takes that is not one:
    // it asks for the whole list rather than about anything.
    if (tail !== "" && asked !== "all" && !VERBS.has(asked)) {
      return { error: `No command \`${tail}\`. Type \`help\` for the list.` };
    }
    return { ok: { kind: "help", about: tail.toLowerCase().split(/\s+/)[0] || null } };
  }

  if (word in STATS) {
    let [amount, ...rest2] = tail.split(/\s+/).filter(Boolean);
    if (!amount) return needs("gold", "How much?");
    // `= 12` as readily as `=12`, since one is what a person types and the
    // other is what they type when they are being careful.
    if (amount === "=" && rest2.length > 0) {
      amount = `=${rest2[0]}`;
      rest2 = rest2.slice(1);
    }

    /**
     * `=12` puts the number where you want it; `+5` and `-1` move it.
     *
     * A bare number stays a gain — "gold 5" plainly means five more of it, and
     * has meant that for as long as there has been a console. What it is not is
     * a way to *set* one, which is what somebody wants about as often: reaching
     * a Miecz of 8 from 3 should not be arithmetic done by the person typing.
     */
    const assigning = amount.startsWith("=");
    const number = Number(assigning ? amount.slice(1) : amount.startsWith("+") ? amount.slice(1) : amount);
    if (!Number.isInteger(number) || (!assigning && number === 0)) {
      return { error: `\`${amount}\` is not a whole number of points.` };
    }
    if (assigning && number < 0) {
      return { error: `\`${amount}\`: nothing goes below zero.` };
    }
    const delta = assigning ? 0 : number;
    const set = assigning ? number : null;
    /**
     * `force` last, after the player, because it is about the change and not
     * about who it lands on: `magic -1 Ola force`. A word rather than a flag,
     * so it reads as the sentence it is and Tab finishes it like everything
     * else — and last, so the common line never has to step over it.
     */
    const force = rest2.length > 0 && rest2[rest2.length - 1].toLowerCase() === "force";
    const who = (force ? rest2.slice(0, -1) : rest2).join(" ");
    return { ok: { kind: "stat", stat: STATS[word], delta, set, who: who || null, force } };
  }

  if (word === "kill") return { ok: { kind: "kill", who: tail || null } };
  /**
   * The one command here that will not default to you.
   *
   * Everything else takes `[player]` and means yourself when it is left off,
   * which is right when the worst case is a Życie you can put back. This one
   * takes the seat away from whoever it names and cannot be undone by typing it
   * again, and a bare `kick` meaning "kick me" is a way to lose your own table
   * to a fumbled line.
   */
  if (word === "kick") {
    return tail ? { ok: { kind: "kick", who: tail } } : needs("kick", "Kick whom?");
  }
  if (word === "spell") {
    // `wand` last and bare, the way `force` and `hard` are.
    const parts = tail.split(/\s+/).filter(Boolean);
    const wand = parts.length > 0 && parts[parts.length - 1].toLowerCase() === "wand";
    const who = (wand ? parts.slice(0, -1) : parts).join(" ");
    return { ok: { kind: "spell", who: who || null, wand } };
  }
  // Spelled out, because `win` alone is two different things: the fight in
  // front of you, and the game.
  if (word === "settle") {
    const said = tail.toLowerCase();
    const outcome = OUTCOMES[said];
    if (!outcome) return needs("settle", `Won, lost or drawn — \`${said || "?"}\`?`);
    return { ok: { kind: "settle", outcome } };
  }
  if (word === "endgame") {
    const said = tail.toLowerCase();
    if (said !== "won" && said !== "lost") {
      return needs("endgame", `Won or lost — \`${said || "?"}\`?`);
    }
    return { ok: { kind: "endgame", won: said === "won" } };
  }
  if (word === "spoils") {
    const said = tail.trim();
    if (said === "") return { ok: { kind: "spoils", take: "zycie", card: null } };
    /**
     * `gold`, because the vocabulary is the engine's and the engine is English.
     * The two Polish spellings still answer — nobody's fingers should have to
     * relearn a word — but the printed line says the one that belongs to the
     * app rather than to the box.
     */
    const spoil = said.toLowerCase();
    if (spoil === "gold" || spoil === "zloto" || spoil === "złoto") {
      return { ok: { kind: "spoils", take: "zloto", card: null } };
    }
    // Anything else is a Przedmiot by name, matched the way every card name is.
    return { ok: { kind: "spoils", take: "zycie", card: said } };
  }
  if (word === "endfight") return { ok: { kind: "endfight" } };

  if (word === "deal") {
    // Bare, it is a question rather than a mistake: "what can I ask for?" is
    // the thing somebody dressing a test table wants, and Tab's grid cannot
    // carry the headings that answer it.
    if (tail === "") return { ok: { kind: "deal", cardIds: [] } };
    /**
     * Several Karty, separated by commas.
     *
     * A comma because no card in the box has one in its name and every card has
     * spaces in it, so nothing else can tell TOPÓR ŚWIATŁA I CIEMNOŚCI from two
     * cards. It is also what you would write on paper listing what came up.
     *
     * The list is the point rather than a convenience: 13.4 settles how many
     * Karty an Obszar is worth at the moment you arrive and `drawAll` deals
     * them in one act, so a verb that stands in for a draw and could only ever
     * produce one card could not reproduce the thing the game actually does.
     * The order typed is the order they arrive in, which is all 15.2 needs —
     * `resolutionOrder` does the rest.
     *
     * A trailing comma is not an error. `deal SMOK,` is a line halfway through
     * being typed, and refusing it teaches nothing the next keystroke would not
     * have fixed.
     */
    const said = tail.split(",").map((one) => one.trim()).filter(Boolean);
    if (said.length === 0) return { ok: { kind: "deal", cardIds: [] } };

    const cardIds: string[] = [];
    for (const one of said) {
      // Every Karta in the box, because every Karta can be drawn. The two verbs
      // this replaced each matched a slice of the deck, which is why asking for
      // the wrong slice answered "No card called `SMOK`" about a card that is
      // printed twice.
      const hit = findByName(READABLE, (card) => card.name, one);
      if ("ambiguous" in hit) {
        return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
      }
      // Named rather than "one of them": with several on the line, "No card
      // called ``" would leave you counting commas to find which.
      if ("missing" in hit) return { error: `No card called \`${one}\`.` };
      cardIds.push(hit.found.id);
    }
    return { ok: { kind: "deal", cardIds } };
  }

  /**
   * A card left lying on a field, rather than put in a hand.
   *
   * Two names in one line, which nothing else here takes, so they are separated
   * by the word that reads as English and appears in no card and no Obszar:
   * `place MIECZ at Karczma`. Without it, the Obszar is the one you are
   * standing on — which is what a tester wants most of the time, and the only
   * reason the field is optional.
   */
  if (word === "clear") {
    if (tail === "") {
      return { ok: { kind: "clear", fieldId: null, cardIds: [], gold: null, classes: [] } };
    }
    /**
     * `place`'s grammar backwards, and the same `at` between the two names.
     *
     * `clear` takes the lot off the Obszar you stand on, `clear Karczma` the
     * lot off a named one, `clear TARGOWISKO` one Karta off yours, and
     * `clear TARGOWISKO at Karczma` one off a named one. A bare word is tried
     * as an Obszar first and as a Karta second, which is unambiguous in
     * practice and settled by `at` when it is not.
     */
    const cut = tail.search(AT);
    const said = cut === -1 ? tail : tail.slice(0, cut);
    const place = cut === -1 ? "" : tail.slice(cut).replace(AT, "");

    let fieldId: FieldId | null = null;
    if (place !== "") {
      const where = findByName(PLACES, (field) => field.name, place);
      if ("ambiguous" in where) return { error: `Which one — ${where.ambiguous.join(", ")}?` };
      if ("missing" in where) return { error: `No Obszar called \`${place}\`.` };
      fieldId = where.found.id;
    }

    /**
     * The money, named on its own.
     *
     * Bare `clear` takes it along with everything else and `clear MIECZ` leaves
     * it, so there was no way to say "just the coins" — and none to say how
     * many. Bare `clear gold` means the lot, the way bare `take gold` does.
     *
     * Before the Obszar lookup as well as the card one: nothing on the board is
     * called Złoto either, and a keyword that loses to a place name is a
     * keyword you cannot rely on.
     */
    const words = said.split(",").map((one) => one.trim()).filter(Boolean);

    /**
     * A single bare word is still tried as an Obszar first.
     *
     * `clear Karczma` means the square, and has since before any of this. Only
     * for one word: two Obszary cannot both be swept — `at` takes one — so in a
     * list the same word can only be a Karta or a kind, and trying the board
     * there would let a place name shadow one.
     */
    if (cut === -1 && words.length === 1 && !isCategory(words[0])) {
      const where = findByName(PLACES, (field) => field.name, said);
      if ("found" in where) {
        return {
          ok: { kind: "clear", fieldId: where.found.id, cardIds: [], gold: null, classes: [] },
        };
      }
    }

    /**
     * One list, three kinds of thing in it: `clear MIECZ, strangers, gold`.
     *
     * `deal`'s grammar, and the same reason — one act at a table is one line
     * here. What is new against `deal` is that the words are not all of one
     * sort, and they do not have to be: a Karta by name, a whole kind, and the
     * money are three ways of pointing at what is lying on a square, and „take
     * the Miecz, the Nieznajomych and the money" is one wish. Each is tried as
     * a kind first — the words are English and nothing in the box is called
     * `places` — then as a Karta.
     *
     * A named Karta takes **one copy**, as it always has, and a kind takes
     * every one of its class; `clear MIECZ, MIECZ` therefore takes two, which
     * is the only way to say it.
     *
     * All or nothing. A list with one word the console does not know is a typo
     * rather than a smaller sweep, and half-obeying it would take Karty off a
     * square the typist meant to keep — so a miss is an error naming the word,
     * the way `deal` names the card it could not find.
     */
    const classes: CardClass[] = [];
    const cardIds: string[] = [];
    let money: number | "all" | null = null;
    for (const one of words) {
      /**
       * The money, with or without an amount, and in the list like everything
       * else.
       *
       * `clear gold`, `clear gold all` and `clear gold 3` were a branch of
       * their own above this, which is one path too many the moment the rest of
       * the line became a list: `clear gold all` stopped being read at all,
       * because the branch only caught a number and the list did not know the
       * word. One reader for one word, and an amount is simply what may follow
       * it — `clear MIECZ, gold 3` costs nothing extra and refusing it would
       * have been arbitrary.
       */
      const asked = goldAsked(one);
      if (asked !== null) {
        if (asked === "" || asked.toLowerCase() === "all") {
          money = "all";
          continue;
        }
        const amount = coins(asked, "clear");
        if ("error" in amount) return amount;
        money = amount.gold;
        continue;
      }
      const word = one.toLowerCase();
      const kind = CATEGORIES.get(word);
      if (kind) {
        for (const cardClass of kind) if (!classes.includes(cardClass)) classes.push(cardClass);
        continue;
      }
      const hit = findByName(CARDS, (card) => card.name, one);
      if ("ambiguous" in hit) {
        return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
      }
      // Named rather than "one of them": with several on the line, "No card
      // called ``" would leave you counting commas to find which.
      if ("missing" in hit) {
        return words.length === 1
          ? { error: `No card called \`${one}\`.` }
          : { error: `No card or kind called \`${one}\`.` };
      }
      cardIds.push(hit.found.id);
    }

    return {
      ok:
        money !== null
          ? { kind: "clear", fieldId, cardIds, gold: money, classes }
          : { kind: "clear", fieldId, cardIds, gold: null, classes },
    };
  }

  if (word === "place" || word === "put") {
    const cut = tail.search(AT);
    const cardPart = cut === -1 ? tail : tail.slice(0, cut);
    const fieldPart = cut === -1 ? "" : tail.slice(cut).replace(AT, "");
    let fieldId: FieldId | null = null;
    if (fieldPart !== "") {
      const where = findByName(PLACES, (field) => field.name, fieldPart);
      if ("ambiguous" in where) return { error: `Which one — ${where.ambiguous.join(", ")}?` };
      if ("missing" in where) return { error: `No Obszar called \`${fieldPart}\`.` };
      fieldId = where.found.id;
    }
    // Money before Karty, because there is no Karta it could be: nothing in the
    // box is called „gold" or „złoto" on its own, and the two that come close —
    // „1 SZTUKA ZŁOTA", „2 SZTUKI ZŁOTA" — start with a numeral.
    const asked = goldAsked(cardPart);
    if (asked !== null) {
      if (asked === "") return needs("place", "How much gold?");
      const amount = coins(asked, "place");
      if ("error" in amount) return amount;
      return { ok: { kind: "place", cardId: null, gold: amount.gold, fieldId } };
    }
    // Bare, it is a question rather than a mistake — the same reading bare
    // `deal` has, and the same catalogue behind it.
    if (cardPart.trim() === "") return { ok: { kind: "place", cardId: null, gold: null, fieldId } };
    return name(CARDS, (c) => c.name, cardPart, "card", (c) => ({
      kind: "place",
      cardId: c.id,
      gold: null,
      fieldId,
    }), "place");
  }

  if (word === "nature") {
    const [said, ...rest3] = tail.split(/\s+/).filter(Boolean);
    const nature = NATURES[(said ?? "").toLowerCase()];
    if (!nature) {
      return { error: `Which Natura — ${Object.keys(NATURES).join(", ")}?` };
    }
    // `force` last, after the player, the way `gold` takes it.
    const forced = rest3.length > 0 && rest3[rest3.length - 1].toLowerCase() === "force";
    const who = (forced ? rest3.slice(0, -1) : rest3).join(" ");
    return { ok: { kind: "nature", nature, who: who || null, force: forced } };
  }

  if (word === "rule") return { ok: { kind: "rule", about: tail.trim() || null } };

  if (word === "who") return { ok: { kind: "who" } };
  if (word === "leave") return { ok: { kind: "leave" } };
  if (word === "unseat") return { ok: { kind: "unseat", who: tail || null } };

  /**
   * The one command here that will not default to you.
   *
   * Everything else that takes `[player]` means yourself when it is left off,
   * which is right when the worst case is a Życie you can put back. This puts
   * somebody out of the table and a bare `kick` meaning "kick me" is a way to
   * lose your own seat to a fumbled line.
   */
  if (word === "kick") {
    return tail ? { ok: { kind: "kick", who: tail } } : needs("kick", "Kick whom?");
  }
  if (word === "host") {
    return tail ? { ok: { kind: "host", who: tail } } : needs("host", "Hand it to whom?");
  }

  /**
   * `rename Ola as Basia` — two names in one line, split by the word that reads
   * as English and appears in no Postać and no Obszar, exactly as `place` uses
   * `at`. Without the split there is no telling where one name ends.
   */
  if (word === "rename") {
    const cut = tail.search(AS);
    if (cut === -1) return needs("rename", "Rename them to what?");
    const who = tail.slice(0, cut).trim();
    const name = tail.slice(cut).replace(AS, "").trim();
    if (!who) return needs("rename", "Rename whom?");
    if (!name) return needs("rename", "Rename them to what?");
    return { ok: { kind: "rename", who, name } };
  }

  /**
   * `seat Ola 3` — the seat is the number on the end.
   *
   * No keyword between them, unlike `rename`, because the two arguments are not
   * the same kind of thing: a seat is a bare number and no name here begins
   * with a digit, so the line reads itself.
   */
  if (word === "seat") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (!/^\d+$/.test(last)) return needs("seat", "Into which seat?");
    const who = parts.slice(0, -1).join(" ");
    if (!who) return needs("seat", "Seat whom?");
    return { ok: { kind: "seat", who, seat: Number(last) } };
  }

  /**
   * A Postać into a seat: 4.4's "moze wybrac sobie nowa", and a latecomer's
   * first one, which are the same act for different reasons.
   *
   * Both arguments optional and told apart by shape. A trailing bare number is
   * the seat — yours when it is left off — and whatever is in front of it is
   * the Postać, drawn when that is left off too, which is what 4.4 describes.
   */
  if (word === "pick") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const numbered = parts.length > 0 && /^\d+$/.test(parts[parts.length - 1]);
    const seat = numbered ? Number(parts[parts.length - 1]) : null;
    const said = (numbered ? parts.slice(0, -1) : parts).join(" ");
    if (said === "") return { ok: { kind: "pick", characterId: null, seat } };
    // The surprise, by the name on its own Karta. `null` already means it — a
    // bare `pick` takes it — and this is the same answer said out loud, so
    // typing what Tab offered does what Tab implied.
    if (said.toUpperCase() === RANDOM_CHARACTER_NAME) {
      return { ok: { kind: "pick", characterId: RANDOM_CHARACTER_ID, seat } };
    }
    const hit = findByName(PEOPLE, (person) => person.name, said);
    if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
    if ("missing" in hit) return { error: `No Postać called \`${said}\`.` };
    return { ok: { kind: "pick", characterId: hit.found.id, seat } };
  }

  /**
   * A Postać out of the game, or back into it.
   *
   * Named by seat or by its own name, and the two are not interchangeable: a
   * seat is where a Postać is standing, so only a living one has one, while a
   * name reaches the dead as well. Which is the line between what a host may do
   * and what only this console may — the rulebook says nothing at all about
   * withdrawing a living Postać, and says exactly what happens to a dead one
   * (4.4), so putting that Karta back is the break.
   *
   * `hard` last, the way `force` is, and for the same reason: it is about the
   * removal rather than about who it lands on, and the common line never has to
   * step over it.
   */
  if (word === "remove" || word === "erase" || word === "revive") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const hard = parts.length > 0 && parts[parts.length - 1].toLowerCase() === "hard";
    const said = (hard ? parts.slice(0, -1) : parts).join(" ");
    if (said === "") return needs(word === "revive" ? "revive" : "remove", "Which Postać?");

    let seat: number | null = null;
    let characterId: string | null = null;
    if (/^\d+$/.test(said)) {
      seat = Number(said);
    } else {
      const hit = findByName(PEOPLE, (person) => person.name, said);
      if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
      if ("missing" in hit) return { error: `No Postać called \`${said}\`.` };
      characterId = hit.found.id;
    }
    if (word === "revive") {
      if (hard) return { error: "`hard` is a removal's word, not a revival's." };
      return { ok: { kind: "revive", seat, characterId } };
    }
    return { ok: { kind: "remove", seat, characterId, hard } };
  }

  /**
   * One noun and the three things done to it.
   *
   * Bare is `end`, because handing the turn on is the line somebody types
   * twenty times a session and it kept its own word for years — `pass` and
   * `endturn` still say it, and now they say it as this. Anything else in the
   * first position is a person: `turn reset` and `turn Ola` are told apart by
   * the one word that is not a name.
   *
   * A player really called „reset" is out of luck and can use their seat
   * number. That is the whole cost of the subword, and it is worth it: the
   * alternative is a fourth verb nobody would find.
   */
  if (word === "turn" || word === "pass" || word === "endturn") {
    const parts = tail.split(/\s+/).filter(Boolean);
    // `force` last and bare, the way `gold`'s and `nature`'s are.
    const forced = parts.length > 0 && parts[parts.length - 1].toLowerCase() === "force";
    const said = (forced ? parts.slice(0, -1) : parts).join(" ");
    const act = said.toLowerCase();

    if (act === "reset") {
      if (forced) return { error: "`turn reset` takes no `force` — it refuses nothing." };
      return { ok: { kind: "turn", act: "reset" } };
    }
    if (act === "" || act === "end") return { ok: { kind: "turn", act: "end", force: forced } };
    // A name, which is the one act that cannot default to you: a bare `turn`
    // is handing yours on, and walking play round to yourself is a no-op
    // nobody types.
    if (forced) return { error: "`force` belongs to `turn end`, not to a name." };
    return { ok: { kind: "turn", act: "reach", who: said } };
  }
  /**
   * Two words, one act and its undo — the shape `ready`/`unready` already has.
   *
   * The lift is a word rather than a flag on the same one because that is what
   * a person types when they mean it: `stone Ola off` reads as an argument to
   * `stone` and `unstone Ola` reads as the opposite of `stone Ola`, which it is.
   */
  if (word === "stone" || word === "unstone") {
    return { ok: { kind: "stone", who: tail || null, stone: word === "stone" } };
  }

  if (word === "effect") {
    const [said, ...who] = tail.split(/\s+/).filter(Boolean);
    const effect = EFFECTS[(said ?? "").toLowerCase()];
    if (!effect) return { error: `Which effect — ${Object.keys(EFFECTS).join(", ")}?` };
    return { ok: { kind: "effect", effect, who: who.join(" ") || null } };
  }

  if (word === "stack") {
    /**
     * A number is a position in the draw order, not a name.
     *
     * No card in the box is called a number, so the two forms cannot collide.
     * A bare number means the Karty Zdarzeń: they are *the* deck, and the
     * Zaklęcia are always called by their own name.
     */
    const spot = /^(?:(events|spells|zdarzenia|zaklecia|zaklęcia)\s+)?(\d+)$/i.exec(tail.trim());
    if (spot) {
      const said = (spot[1] ?? "events").toLowerCase();
      const pile = said.startsWith("s") || said.startsWith("zak") ? "spells" : "events";
      return { ok: { kind: "stack", cardId: null, pile, at: Number(spot[2]) } };
    }
    return name(STACKABLE, (card) => card.name, tail, "card", (card) => ({
      kind: "stack",
      cardId: card.id,
      pile: null,
      at: null,
    }), "stack");
  }

  if (word === "pile" || word === "deck") {
    const said = tail.trim().toLowerCase();
    if (said === "") return { ok: { kind: "pile", pile: null } };
    if (said.startsWith("e") || said.startsWith("zd")) return { ok: { kind: "pile", pile: "events" } };
    if (said.startsWith("s") || said.startsWith("zak")) return { ok: { kind: "pile", pile: "spells" } };
    return { error: "Which pile — `events` or `spells`?" };
  }

  if (word === "answer") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const numbers = parts.filter((one) => /^\d+$/.test(one)).map(Number);
    const named = parts.filter((one) => !/^\d+$/.test(one)).join(" ");
    // No number is a real answer. A compulsory Obszar comes in two shapes —
    // one that asks (`wybor`) and one that only rolls (`rzut`, the Karczma) —
    // and the second has nothing to choose. `answer` alone means "get on with
    // it"; `answer 2` means "and I pick the second".
    return { ok: { kind: "answer", card: named || null, choices: numbers } };
  }

  if (word === "ready" || word === "unready") {
    return { ok: { kind: "ready", who: tail || null, ready: word === "ready" } };
  }
  if (word === "start") return { ok: { kind: "start" } };
  if (word === "card" || word === "read" || word === "x") {
    if (!tail) return needs("card", "Which card?");
    return { ok: { kind: "card", name: tail } };
  }

  if (word === "take" || word === "get") {
    /**
     * `take gold` scoops up the lot, which is what a hand does at a table and
     * what the Obszar's own „weź wszystko" does on screen. A number takes that
     * many — 12.1 puts the amount in the player's gift, and Talisman's 12:1,
     * the sentence it is adapted from, says *any* Gold Counters may be taken.
     */
    const asked = goldAsked(tail);
    if (asked !== null) {
      if (asked === "" || asked.toLowerCase() === "all") {
        return { ok: { kind: "take", name: null, gold: null } };
      }
      const amount = coins(asked, "take");
      if ("error" in amount) return amount;
      return { ok: { kind: "take", name: null, gold: amount.gold } };
    }
    return tail ? { ok: { kind: "take", name: tail } } : needs("take", "Take what?");
  }
  // `drop` is the lawful one: `place` conjures a card onto a field and this puts
  // down one you are holding. The kind is `putdown` because `place` had the
  // obvious name first.
  if (word === "drop") {
    return tail ? { ok: { kind: "putdown", name: tail } } : needs("drop", "Drop what?");
  }
  if (word === "use") {
    return tail ? { ok: { kind: "use", name: tail } } : needs("use", "Use what?");
  }
  if (word === "equip" || word === "wear") {
    if (!tail) return needs("equip", "Wear what?");
    // The slot last, the way `force` and `hard` are: it is about where the
    // card goes rather than which card it is, and most cards fit one place.
    const parts = tail.split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    const slot = parts.length > 1 && SLOT_WORDS.has(last) ? last : null;
    const named = (slot === null ? parts : parts.slice(0, -1)).join(" ");
    if (!named) return needs("equip", "Wear what?");
    return { ok: { kind: "equip", name: named, slot } };
  }

  if (word === "buy") {
    return tail ? { ok: { kind: "buy", name: tail } } : needs("buy", "Buy what?");
  }
  if (word === "sell") {
    return tail ? { ok: { kind: "sell", name: tail } } : needs("sell", "Sell what?");
  }
  if (word === "trophies") {
    if (!tail) return { ok: { kind: "trophies", mode: null } };
    const asked = tail.trim().toLowerCase();
    if (asked === "points" || asked === "cards") {
      return { ok: { kind: "trophies", mode: asked } };
    }
    return needs("trophies", "`points` (score them) or `cards` (keep the Karty, as printed)?");
  }
  if (word === "trade") {
    /**
     * A bare number is a count of Miecze, not a card.
     *
     * Unambiguous because no Karta is called "2", and it is the thing somebody
     * actually wants: you know how much Miecz you are short, not which of your
     * four Wrogowie add up to it. Working that out is `offerFor`'s.
     */
    if (tail && /^\d+$/.test(tail)) {
      const swords = Number(tail);
      if (swords < 1) return needs("trade", "How many Miecze — at least one?");
      return { ok: { kind: "trade", cards: [], swords } };
    }
    // Commas or spaces: "trade CYKLOP, NOBBIN" and "trade CYKLOP NOBBIN" are the
    // same list, because a player typing two card names will use either.
    const named = tail
      ? tail
          .split(",")
          .flatMap((part) => part.trim())
          .filter((part) => part.length > 0)
      : [];
    return { ok: { kind: "trade", cards: named, swords: null } };
  }
  if (word === "heal") {
    if (!tail) return { ok: { kind: "heal", points: null } };
    if (!/^\d+$/.test(tail)) return needs("heal", `How many — \`${tail}\`?`);
    return { ok: { kind: "heal", points: Number(tail) } };
  }
  if (word === "cast") {
    if (!tail) return needs("cast", "Cast what?");
    // `at` joins the two names, the way `place MIECZ at Karczma` does, and
    // `to` adds the third for the card that moves what it points at.
    const [named, rest] = tail.split(AT);
    if (!named?.trim()) return needs("cast", "Cast what?");
    const [at, to] = (rest ?? "").split(TO);
    return {
      ok: {
        kind: "cast",
        name: named.trim(),
        who: at?.trim() || null,
        to: to?.trim() || null,
      },
    };
  }

  if (word === "endcast") return { ok: { kind: "endcast" } };

  if (word === "beast") return { ok: { kind: "beast" } };
  if (word === "bridge" || word === "most") return { ok: { kind: "bridge" } };
  if (word === "cross") {
    if (tail === "") return { ok: { kind: "cross", to: null } };
    const where = findByName(PLACES, (field) => field.name, tail);
    if ("ambiguous" in where) return { error: `Which one — ${where.ambiguous.join(", ")}?` };
    if ("missing" in where) return { error: `No Obszar called \`${tail}\`.` };
    return { ok: { kind: "cross", to: where.found.id } };
  }
  if (word === "guardian") return { ok: { kind: "guardian" } };
  if (word === "ferry") {
    // `pay` last and bare, the way `force` and `hard` are.
    return { ok: { kind: "ferry", pay: tail.toLowerCase() === "pay" } };
  }

  if (word === "escape" || word === "flee") return { ok: { kind: "escape" } };
  if (word === "attack") {
    return tail ? { ok: { kind: "attack", who: tail } } : needs("attack", "Attack whom?");
  }
  if (word === "pay") return { ok: { kind: "pay" } };
  if (word === "ask") return { ok: { kind: "ask" } };
  if (word === "free") return { ok: { kind: "free" } };
  if (word === "claim") return { ok: { kind: "claim" } };
  if (word === "raid") {
    return tail
      ? { ok: { kind: "raid", who: tail } }
      : needs("raid", "Send your Przyjaciel against whom?");
  }
  if (word === "fight") {
    // Nothing named takes whatever is waiting, which is the usual case: a Wróg
    // attacks the character who drew him (16.2), and there is only one of him.
    if (!tail) return { ok: { kind: "fight", cardId: null } };
    return name(FOES, (card) => card.name, tail, "Wróg", (card) => ({
      kind: "fight",
      cardId: card.id,
    }), "fight");
  }

  if (word === "roll") return { ok: { kind: "roll" } };
  if (word === "draw") return { ok: { kind: "draw" } };
  if (word === "look" || word === "l") return { ok: { kind: "look" } };
  if (word === "me" || word === "sheet" || word === "i") {
    return { ok: { kind: "me", who: tail || null } };
  }

  if (word === "move" || word === "walk") {
    return name(PLACES, (field) => field.name, tail, "Obszar", (field) => ({
      kind: "move",
      fieldId: field.id,
    }), "move");
  }

  if (word === "teleport") {
    return name(PLACES, (field) => field.name, tail, "Obszar", (field) => ({
      kind: "teleport",
      fieldId: field.id,
    }), "teleport");
  }

  // Only reachable if something is advertised and then not read, which the
  // tests type every line of `help` to prevent.
  return { error: `\`${word}\` is listed but does nothing yet.` };
}

/** Resolves one name, or says why it could not. */
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
function needs(verb: string, question: string): { error: string } {
  return { error: `${question} ${usageOf(verb)}` };
}

function name<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  what: string,
  build: (item: T) => Command,
  /** Whose usage to show when nothing was named. */
  verb: string,
): { ok: Command } | { error: string } {
  if (query === "") return needs(verb, `Which ${what}?`);
  const hit = findByName(items, nameOf, query);
  if ("found" in hit) return { ok: build(hit.found) };
  if ("ambiguous" in hit) {
    return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
  }
  return { error: `No ${what} called \`${query}\`.` };
}

function usageOf(command: string): string {
  return COMMANDS.find((spec) => spec.name === command)?.usage ?? command;
}

/**
 * What to say about a parameter that was asked to move.
 *
 * Written against what actually moved, never against what was asked for. The
 * store clamps — 1.3 and 2.3 hold own Miecz and Magia at or above the values
 * the character started with, Życie and Złoto at nothing, and everything at
 * `CEILING` — and it clamps silently, which is right, because the rule is the
 * rule. The console then printed the resulting value, so asking to take a point
 * off a Magia already at its floor answered "magia -1 → 3" and read exactly
 * like it had worked. Twice in a row, identically, which is how it was found.
 *
 * Here rather than beside the database, because that is where the mistake was:
 * a sentence assembled where nothing could ask it what it would say.
 */
export function statReply(said: {
  who: string;
  stat: StatName;
  /** What the line asked for. */
  asked: number;
  /** What the parameter moved by, which a floor or the ceiling may have cut. */
  moved: number;
  /** Where it ended up. */
  now: number;
  /** What the rule puts under it: the starting value, or nothing. */
  floor?: number;
  /** Whether the line said `force`, which lifts the floor under own points. */
  forced?: boolean;
}): string {
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const mark = said.forced ? " (forced)" : "";
  if (said.moved === said.asked) {
    return `${said.who}: ${said.stat} ${signed(said.moved)} → ${said.now}${mark}`;
  }

  const floor = said.floor ?? 0;
  /**
   * One sentence for the floor, whether the number is sitting on it or under
   * it.
   *
   * Under it is a state only `force` can arrange, and it does behave a little
   * differently — the number is held where it is rather than at the rule's
   * value — but saying so took a second sentence to explain a distinction
   * nobody typing into a test console needs drawn. What both cases need is the
   * same: it did not move, here is the rule, here is the word that gets past
   * it.
   */
  const limit =
    said.asked > 0
      ? // Nothing can be above the ceiling to begin with, so this is the only
        // way up that is ever refused.
        `${said.stat} stops at ${said.now}`
      : said.forced || floor === 0
        ? `${said.stat} cannot go below ${said.now}`
        : `${said.stat} cannot go below the ${floor} this character started with (1.3, 2.3) — say \`force\` to`;
  return said.moved === 0
    ? `${said.who}: ${said.stat} stays at ${said.now} — ${limit}.`
    : `${said.who}: ${said.stat} ${signed(said.moved)} → ${said.now}, not ${signed(said.asked)} — ${limit}.`;
}

/**
 * Which of the people at the table a `[player]` names.
 *
 * By player, by character, or by seat number — whichever is on the screen when
 * somebody types, because a tester driving four seats reads them off four
 * different parts of it. The character is matched on its *printed* name and not
 * on its id: `bledny-rycerz` is what the row holds, and nobody types the hyphen
 * or knows it is there.
 *
 * Everybody seated is searchable, including a seat with no character on it. It
 * used to be only those with one, which quietly made `revive` unable to name
 * the seat it exists for — a latecomer's, whose character has not been dealt.
 *
 * Asked about a *person* rather than a seat, the same three handles work and a
 * fourth arrives: the id off the roster, for somebody who drives no seat at all
 * and can therefore be named by nothing that is printed on the board. So
 * `seat` is nullable here, and null is a spectator rather than a missing value.
 *
 * Pure, and it answers with an index rather than a row, so the caller keeps
 * whatever kind of row it started with.
 */
export function pickPlayer(
  people: readonly {
    /** The seat they drive; null for somebody watching. */
    seat: number | null;
    name: string | null;
    character: string | null;
    /** Four characters off the roster — see `makeUserId`. A seat has none. */
    id?: string;
  }[],
  who: string,
): { at: number } | { error: string } {
  const asked = who.trim();
  if (asked === "") return { error: "Who?" };

  // The number printed beside a seat is one-based; `seat` is the stored index.
  if (/^\d+$/.test(asked)) {
    const at = people.findIndex((one) => one.seat === Number(asked) - 1);
    if (at !== -1) return { at };
  }

  /**
   * The id, whole and exact, and ahead of the names.
   *
   * Four characters with no meaning in them: a prefix of one is a coincidence
   * rather than an abbreviation, so it is matched outright or not at all. It
   * goes first because it is the one handle that is guaranteed to name exactly
   * one person — which is what `who` prints it for.
   */
  const byId = people.findIndex((one) => one.id !== undefined && fold(one.id) === fold(asked));
  if (byId !== -1) return { at: byId };

  const named = people.map((one, index) => ({
    index,
    name:
      one.name ??
      nameOfCharacter(one.character) ??
      // A seat with neither is named by the number printed beside it. A person
      // always has a name, so for them this is unreachable — and an empty
      // string matches nothing, which is the honest answer if it ever is.
      (one.seat === null ? "" : `${one.seat + 1}`),
    also: one.name ? nameOfCharacter(one.character) : null,
  }));
  // A character's name is as good a handle as its player's, so both are in the
  // pool and either one finds the seat.
  const pool = named.flatMap((one) =>
    one.also ? [one, { ...one, name: one.also }] : [one],
  );

  const hit = findByName(pool, (one) => one.name, asked);
  if ("found" in hit) return { at: hit.found.index };
  if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
  return { error: `Nobody called \`${asked}\` is at this table.` };
}

function nameOfCharacter(id: string | null): string | null {
  if (!id) return null;
  return PEOPLE.find((one) => one.id === id)?.name ?? null;
}

/**
 * What a Tab should finish, given a half-typed line.
 *
 * Names in this box are long, printed in capitals and full of Polish letters —
 * ZWIERCIADŁO ZNISZCZENIA, ŚWIĄTYNIA BOGINI NEMED — and a console whose
 * arguments have to be typed exactly is a console that is slower than the
 * buttons it replaced. So the same vocabulary the parser matches against is the
 * vocabulary Tab completes from, and the same folded comparison decides what
 * counts as a start: `swi` finds ŚWIĘTY GRAAL.
 *
 * Given several, it fills in as far as they agree and hands back the list, the
 * way a shell does. Pure, and the players are passed in rather than looked up,
 * because who is at the table is not something the grammar knows.
 */
