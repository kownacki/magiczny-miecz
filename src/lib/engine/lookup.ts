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
