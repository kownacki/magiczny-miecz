/** What a Karta says, read off the box rather than off a table. */

import characters from "@/data/characters.json";
import events from "@/data/events.json";
import itemCards from "@/data/items.json";
import spellCards from "@/data/spells.json";
import type { Character } from "@/data/types";
import { fold } from "./search";

/**
 * Why this is not in `consoleStore.ts` with the rest of the console.
 *
 * Reading a Karta touches no game. It is the box, transcribed — the same
 * twenty-seven Postacie and two hundred-odd cards whatever table you are at,
 * and whether you are at one. Keeping it beside the commands that need a
 * `gameId` meant `card MAGOG` at the opening prompt answered "open a table
 * first", which is the app's plumbing showing through: a person deciding
 * whether to play wants to read what they would be playing.
 *
 * So it lives in the engine, where the rest of what a card *is* lives, and
 * anything that can render text can ask it. The browser's Księga Tolimana is
 * the same idea already built for the same reason.
 */

/** Everything with a name and something written on it, cards and Postacie alike. */
interface Named {
  id: string;
  name: string;
  text?: string;
}

/**
 * The Wyposażenie filtered against the Zdarzenia, because the box prints some
 * of it in both — the same reason `console.ts` builds its own list this way.
 */
const CARDS: Named[] = [
  ...(events as Named[]),
  ...(itemCards as Named[]).filter((item) => !events.some((card) => card.id === item.id)),
  ...(spellCards as Named[]),
];

/**
 * A name is not an identity, and this file is where that will bite first.
 *
 * Two of the box's names are carried by two different cards each: **DEMON** is
 * a Wróg („W okolicy pojawił się potężny Demon") and a Karta Postaci, and
 * **CZARODZIEJ** is a Nieznajomy („Ten Obszar do końca rozgrywki będzie
 * siedzibą dobrego Czarodzieja") and a Karta Postaci. `describeCard` asks
 * `PEOPLE` first, so in both cases the Postać wins and the Karta Zdarzeń
 * cannot be read through `card` at all. In base that is two cards out of 165
 * and it has been left as it is.
 *
 * **It does not stay that small.** Across the five expansions — surveyed
 * against their transcriptions, see docs/EXPANSIONS.md — twenty names are
 * carried by more than one card, and seven of those are two genuinely
 * different cards *printed on the same sheet*, where namespacing by set would
 * not separate them either:
 *
 * - PRZEWODNIK KRYPTY — Nieznajomy IV twice, Przyjaciel V once, three
 *   printings and two different rules (Magia, Karty Krypty)
 * - KAŻDEMU PO RÓWNO — word for word identical but for „Miecza" / „Magii"
 * - STRAŻ — MIECZ 8 and MIECZ 5, same sentence (Gród)
 * - SAKIEWKA — 6 Sz.Z. safe on 1–2, and 4 Sz.Z. safe on 1–3 (Magia)
 * - KSIĄŻĘCY PRZYWILEJ — a stay in the Wieża, and a Kredyt without interest
 * - ŁUK — „na odległość do 3 Obszarów" and „na sąsiednim polu" (Jaskinia)
 * - ŻEBRAK — a Wróg II and a Nieznajomy IV (Gród)
 *
 * So the moment an expansion is transcribed, every lookup in this file that
 * answers a name with *one* card stops being correct — `describeCard` picks
 * whichever it meets first, and `everyCardName` folds the two into one entry
 * because it dedupes by name. The fix is not an ordering: it is that a name
 * resolves to a *list*, and that what identifies a card is `source` — the
 * sheet and the square it was cut from — which is the only unique handle in
 * this data. Do that here before adding a second set, not after.
 */
const PEOPLE = characters as Character[];

/**
 * Every name that can be looked up, each once.
 *
 * The box prints real duplicates — four Magiczne Miecze, two Upiory — and they
 * share an id, so `CARDS` holds one entry per *printed* card and seventeen
 * names appear more than once. A list to offer wants the distinct names: the
 * copies are the same card, and `describeCard` reads whichever it meets first
 * because there is nothing to choose between them.
 */
export function everyCardName(): string[] {
  return [...new Set([...PEOPLE, ...CARDS].map((one) => one.name))];
}

/**
 * The id behind a printed name.
 *
 * For the one verb that names a card nobody is holding: what is on sale at an
 * Obszar is the board's list, so there is no holding to read an id off. Same
 * three answers as `describeCard`, because it is the same question.
 */
export function cardIdNamed(
  name: string,
): { id: string } | { candidates: string[] } | { missing: string } {
  const wanted = fold(name.trim());
  if (wanted === "") return { missing: name };
  const hit = CARDS.find((one) => fold(one.name) === wanted);
  if (hit) return { id: hit.id };
  const near = CARDS.filter((one) => fold(one.name).startsWith(wanted)).map((one) => one.name);
  return near.length > 0 ? { candidates: [...new Set(near)] } : { missing: name };
}

/**
 * One Karta, read out.
 *
 * Returns the lines, or the names it could have meant — a half-typed name is a
 * question rather than a mistake, and answering it with the two candidates is
 * more use than refusing.
 */
export function describeCard(
  name: string,
): { lines: string[] } | { candidates: string[] } | { missing: string } {
  const wanted = fold(name.trim());
  if (wanted === "") return { missing: name };

  // Postacie first, which shadows the two Karty Zdarzeń that share a name with
  // one — see the note above `PEOPLE`, and read it before adding an expansion.
  const person = PEOPLE.find((one) => fold(one.name) === wanted);
  if (person) {
    return {
      lines: [
        /**
         * The Natura as you would type it, not as the box prints it.
         *
         * `characterFacts` renders it Polish for the browser, which is a
         * Polish interface. This is a terminal: the sentence is English, the
         * *names* are the box's, and a Natura is neither — it is the word
         * `nature chaotic` takes, so showing "chaotyczna" here would be
         * showing something you cannot type.
         */
        `${person.name} — Sword ${person.miecz} · Magic ${person.magia} · ${person.nature}`,
        `MGR: ${person.start}`,
        ...person.abilities.map((one) => `  · ${one}`),
      ],
    };
  }

  const card = CARDS.find((one) => fold(one.name) === wanted);
  if (card) return { lines: [card.name, ...(card.text ? [card.text] : [])] };

  const near = [...PEOPLE, ...CARDS]
    .filter((one) => fold(one.name).startsWith(wanted))
    .map((one) => one.name);
  return near.length > 0 ? { candidates: near } : { missing: name };
}
