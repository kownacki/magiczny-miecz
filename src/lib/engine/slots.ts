/** The slotted equipment variant: which Przedmiot goes where on a character. */
import type { CardId } from "@/data/ids";

/**
 * Two ways to hold your things.
 *
 * **Klasyczny** is the rulebook: four Przedmioty, no distinction between what
 * you wear and what you carry, and every one of them works wherever it is
 * (5.4). This is the game as printed and stays the default.
 *
 * **Slotowy** is a house variant in the Diablo mould: what you wear goes in the
 * place it is worn, and only what is worn has any effect. It is not in the
 * book — no rule anywhere distinguishes a worn Hełm from a carried one — so it
 * is a setting on the table, chosen when the table is opened, and never a
 * silent change to how the printed rules behave.
 */
export type EqMode = "classic" | "slots";

/**
 * Every place slotowy departs from the printed rules, in one list.
 *
 * Written here rather than in a page, because the point is that a deviation
 * cannot be added without appearing where players read it: the Księga renders
 * this, so a fifth entry is a line of code away from being visible instead of a
 * paragraph somebody has to remember to write. Until now these lived only in
 * `docs/COVERAGE.md`, which is for whoever is building the thing.
 *
 * `rule` is the rule as the box has it, and every one of them is quoted rather
 * than paraphrased, so the difference is a difference between two sentences.
 */
export interface VariantChange {
  /** The rule numbers this bears on, for the Księga to link. */
  rules: readonly string[];
  title: string;
  /** What the printed game does. */
  book: string;
  /** What this table does instead. */
  here: string;
}

export const VARIANT_CHANGES: readonly VariantChange[] = [
  {
    rules: ["5.4"],
    title: "Noszone i niesione to dwie różne rzeczy",
    book: "Postać ma do czterech Przedmiotów i wszystkie działają, gdziekolwiek leżą — Instrukcja nigdzie nie odróżnia Hełmu założonego od niesionego.",
    here: "Działa tylko to, co Postać ma na sobie, a każdy Przedmiot ma swoje miejsce: głowa, tułów, ręce, palec. Reszta czeka w Plecaku i nie daje nic.",
  },
  {
    rules: ["5.3", "7.4", "5.5"],
    title: "Przedmiot zakazany przez Naturę zostaje w Plecaku",
    book: "„Przedmiot ten musi zostać natychmiast odrzucony” — Karta ląduje na Obszarze, na którym Postać stoi.",
    here: "Zostaje tam, gdzie jest — na czerwono, bez żadnego działania, i nie da się go założyć. 5.3 zakazuje posiadania dlatego, że zakazuje używania, a tu niesienie używaniem nie jest.",
  },
  {
    rules: ["8.1"],
    title: "Wyposażenie początkowe masz od razu na sobie",
    book: "Karta Postaci mówi, z czym zaczynasz — „Rozpoczynasz grę posiadając Miecz i Zbroję” — i nie ma znaczenia, gdzie te Karty leżą.",
    here: "Trafiają od razu na swoje miejsca: Miecz do ręki, Zbroja na tułów, Tarcza do drugiej ręki. Inaczej Postać zaczynałaby grę, nie mogąc użyć rzeczy, które ma z własnej Karty. Dotyczy też Postaci branej po śmierci.",
  },
  {
    rules: ["5.6"],
    title: "Nadmiar Przedmiotów nie jest wyrzucany za ciebie",
    book: "Postać, która przekroczy limit, „musi natychmiast odrzucić Przedmioty, których nie jest w stanie unieść”, wybierając które.",
    here: "Wzięcie ponad limit jest odmawiane od razu, więc nadmiar zwykle nie powstaje. Jeśli powstanie — po stracie Konia — aplikacja nie wybiera za gracza.",
  },
] as const;

/**
 * Where each of a character's starting Przedmioty goes, in slotowy.
 *
 * The variant's whole claim is that only what you wear counts, and the box
 * hands seven characters their gear before anybody rolls: the Błędny Rycerz
 * "rozpoczynasz grę posiadając Miecz i Zbroję", the Książę a Hełm and a Miecz,
 * the Krasnolud a Tarcza and a Sztylet. Dropped into the Plecak, all eleven of
 * those did nothing at all, and a Rycerz who starts the game unable to use his
 * own sword is not playing the variant, he is being penalised by it.
 *
 * Every one of the eleven has a place and no two of them want the same one, so
 * this is settled rather than negotiated. It still assigns rather than assumes:
 * the first free place a card fits, in the order the card names them, so a
 * future Przedmiot with two homes lands somewhere sensible instead of on top of
 * something else.
 *
 * `null` for anything that cannot be worn, which today is nothing.
 */
export function stowStartingKit(cardIds: readonly string[]): (Slot | null)[] {
  const taken = new Set<Slot>();
  return cardIds.map((cardId) => {
    const free = slotsFor(cardId).find((slot) => !taken.has(slot));
    if (free === undefined) return null;
    taken.add(free);
    return free;
  });
}

/**
 * The places on a character, in the order they are drawn.
 *
 * The two hands are separate places rather than one place holding two, because
 * they do not take the same things: a Tarcza only ever goes in the off hand,
 * while a Miecz goes in either. That is where the interesting decisions in this
 * variant are — everything else has at most a handful of cards competing for
 * it, and four of the places have exactly one card in the whole box.
 */
export const SLOTS = [
  "head",
  "amulet",
  "body",
  "main-hand",
  "off-hand",
  "gloves",
  "ring",
  "mount",
  "pouch",
  // The two that only have to be found. See RELICS.
  "magiczny-miecz",
  "tarcza-tolimana",
] as const;

export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  head: "Głowa",
  amulet: "Amulet",
  body: "Tułów",
  "main-hand": "Ręka główna",
  "magiczny-miecz": "Magiczny Miecz",
  "tarcza-tolimana": "Tarcza Tolimana",
  "off-hand": "Ręka pomocnicza",
  gloves: "Rękawice",
  ring: "Pierścień",
  mount: "Wierzchowiec",
  pouch: "Sakwa",
};

/**
 * Where each Przedmiot is worn.
 *
 * A list rather than a single place so a card can name more than one, but in
 * the base game none does: a weapon goes in the main hand, a shield in the off
 * hand, and that is that. Two weapons at once is a character ability — a
 * Barbarzyńca who fights with a sword in each hand — and no character in this
 * box has one, so the rule waits until one does rather than being invented for
 * nobody.
 *
 * **Nothing here is two-handed.** The two candidates by weapon type are the
 * Święta Włócznia and the Topór Światła i Ciemności, and the art on both cards
 * shows a single gauntleted hand on the haft. No card text mentions hands.
 *
 * Anything absent has no place on the body, lives in the pack — and, unlike the
 * worn things, goes on working from there. That is most of the box: the
 * Latarnia, the Kij i sznur, the Łódź, the Tabliczka and the Manuskrypt, the
 * one-use fruits and potions, the Diament and the Szkatuła, and the relics and
 * crystals whose whole effect is having them about you: the Graal, the
 * Relikwiarz, the Kryształ Magów, the Kryształ Losu, the Zwierciadło
 * Zniszczenia and the Srebrna Strzała.
 */
export const SLOT_OF: Partial<Record<CardId, readonly Slot[]>> = {
  // Głowa, tułów, ręce, palec — the four the box has exactly one card for.
  helm: ["head"],
  zbroja: ["body"],
  rekawice: ["gloves"],
  "pierscien-mocy": ["ring"],

  // Amulet: the two talizmany, the only things in the box worn round a neck.
  "talizman-ognia": ["amulet"],
  "talizman-powietrza": ["amulet"],

  // Broń i różdżki — ręka główna.
  miecz: ["main-hand"],
  sztylet: ["main-hand"],
  "magiczny-miecz": ["magiczny-miecz"],
  arondight: ["main-hand"],
  excalibur: ["main-hand"],
  "miecz-chaosu": ["main-hand"],
  "swieta-wlocznia": ["main-hand"],
  "topor-swiatla-i-ciemnosci": ["main-hand"],
  "rozdzka-przeznaczenia": ["main-hand"],
  "rozdzka-zaklec": ["main-hand"],

  // Tarcze — ręka pomocnicza.
  tarcza: ["off-hand"],
  "tarcza-tolimana": ["tarcza-tolimana"],
  "tarcza-boga-tolimana": ["tarcza-tolimana"],

  // Wierzchowce i sakwy.
  kon: ["mount"],
  mul: ["mount"],
  zaprzeg: ["mount"],
  wierzchowiec: ["mount"],
  "bojowy-rumak": ["mount"],
  "magiczna-sakwa": ["pouch"],
  "tajemna-sakwa": ["pouch"],
};

/**
 * The two that only have to be found.
 *
 * Neither adds anything to a fight. p3: "Magiczne Miecze i Tarcze Tolimana są
 * przedmiotami wyjątkowymi" — one lets a character onto the Kamienny Most and
 * the other into the Zamek, and that is the whole of what they do. Carrying
 * them is not a choice anybody makes, so they get places of their own instead
 * of competing with a real weapon for a hand.
 *
 * DELIBERATE DEVIATION, documented per CLAUDE.md: they also stop counting
 * against 5.4. The rulebook exempts only Sztuki Złota from the four-item limit
 * and says nothing about these — so this is a house rule, not the book. It
 * exists because spending two of your four places on things you cannot use is
 * a tax on attempting to win at all.
 */
export const RELICS: ReadonlySet<string> = new Set([
  "magiczny-miecz",
  "tarcza-tolimana",
  "tarcza-boga-tolimana",
]);

/** The places this Przedmiot may be worn; empty when it is only ever carried. */
export function slotsFor(cardId: string): readonly Slot[] {
  return SLOT_OF[cardId as CardId] ?? [];
}

/** Whether this card may be worn in this place. */
export function fitsIn(cardId: string, slot: Slot): boolean {
  return slotsFor(cardId).includes(slot);
}

/** Whether this card has any place on the body at all. */
export function isWearable(cardId: string): boolean {
  return slotsFor(cardId).length > 0;
}

/**
 * Places the base game has no card for: there are none.
 *
 * There were two — a belt and boots — and neither has a card anywhere in the
 * box: not among the 63 Przedmiot cards, not in the Wyposażenie, and not in the
 * text of any of the 165 Karty Zdarzeń. They were dropped rather than drawn
 * empty for the whole game.
 *
 * The five expansions are out of scope (see CLAUDE.md) and their scans are
 * untouched, so if a Pas or a pair of Butów turns up in one of them, this is
 * where the places come back: add them to `SLOTS`, a label, and the cards.
 */
export const EMPTY_IN_BASE_GAME: readonly Slot[] = [];
