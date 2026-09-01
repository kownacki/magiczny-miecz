/** How the Karty lying on an Obszar are grouped and ordered for a reader — which is not the order they resolve in. */

import events from "@/data/events.json";
import items from "@/data/items.json";
import { CARD_CLASS, type CardClass, type EventCard, type Item } from "@/data/types";

/**
 * Why this is in `view/` and not beside `resolutionOrder`.
 *
 * There are two orders and they are not the same question. `resolutionOrder`
 * in `engine/state.ts` is the rules': 15.1's placed cards, then 15.2's
 * ascending numeral, I through VI, and it decides what *happens* — a Wróg
 * before a Przedmiot because 16.4 says a Przedmiot cannot be picked up over
 * his head. That order is not negotiable and nothing here touches it.
 *
 * This is the order a **list** is read in, which serves a different need. What
 * a player wants off an inventory is "what is here, and what of it is mine to
 * take" — so the loot stands together and near the top, where the rules put it
 * fifth of six. Reading a list is not resolving a stack, and forcing one order
 * on both makes the list worse without making the stack any more correct.
 *
 * The two are deliberately far apart in the tree so that neither is edited
 * thinking it is the other.
 */

/** The four shelves an Obszar's cards are shown on, in the order they are shown. */
export type FieldGroupKey = "spotkania" | "wrogowie" | "rzeczy" | "mieszkancy" | "inne";

export interface FieldGroup<T> {
  key: FieldGroupKey;
  title: string;
  cards: T[];
}

const TITLES: Record<FieldGroupKey, string> = {
  spotkania: "Spotkania",
  wrogowie: "Wrogowie",
  rzeczy: "Przedmioty i Przyjaciele",
  mieszkancy: "Nieznajomi i Miejsca",
  inne: "Pozostałe",
};

/**
 * The shelves in the order they are drawn, each with the classes it holds and
 * the order they take *inside* it.
 *
 * The inner order is the printed numeral again — II before III, Przedmiot
 * before Przyjaciel, Nieznajomy before Miejsce — because within a group there
 * is no reason to depart from the box, and a Demon listed above a Bestia would
 * be a third order for a reader to hold in their head.
 *
 * `Spotkania` is here and will not appear in a base-game table, because all
 * twenty base Spotkania are resolved and put away: sixteen say "odłóż" outright,
 * MGŁA and UKŁAD PLANET run out after a turn or two, and POŁUDNICA and ZŁY DUCH
 * leave with the character as Przyjaciele. **The expansions are another matter**
 * — Gród's SPISEK says "Połóż tę Kartę przy Wrotach" and Magia's STRAŻNIK is
 * kept and then "połóż Strażnika na polu", both of them class I sitting on an
 * Obszar for turns. So the group exists, costs nothing while it is empty, and
 * is one less thing to remember if those boxes are ever brought in scope.
 */
const SHELVES: { key: FieldGroupKey; classes: CardClass[] }[] = [
  { key: "spotkania", classes: ["encounter"] },
  { key: "wrogowie", classes: ["foe", "demon"] },
  // Wyposażenie has no printed numeral and lands here with the Przedmioty it is
  // indistinguishable from: 12.1 lets you take "leżące złoto, Przedmioty lub
  // Przyjaciół" without asking which deck one came out of, and thirteen of the
  // sheet's cards are in the event deck under the same id anyway. So the two
  // interleave by when they arrived, and only the Przyjaciele come after.
  { key: "rzeczy", classes: ["item", "friend"] },
  { key: "mieszkancy", classes: ["stranger", "place"] },
];

const CLASS_OF = new Map<string, CardClass>([
  ...(events as EventCard[]).map((card) => [card.id, card.cardClass] as const),
  // A Wyposażenie card is a Przedmiot wherever a rule names one (5.4, 12.1,
  // 21.3), and the sheet prints no numeral for it to be anything else.
  ...(items as Item[]).map((card) => [card.id, "item" as CardClass] as const),
]);

/**
 * The class this id belongs to, or null for one neither deck has heard of.
 *
 * Null is not expected and is not swallowed — see `inne` below. Only two decks
 * can put a Karta on an Obszar, and an id from neither is a bug upstream, which
 * is worth seeing rather than hiding.
 */
export function classOnField(cardId: string): CardClass | null {
  return CLASS_OF.get(cardId) ?? null;
}

/**
 * The cards lying on an Obszar, grouped for display.
 *
 * `cards` arrives in **arrival order** — `fieldCardsFor` reads `field_cards`
 * with `.order("created_at")` — and that order is preserved inside each group,
 * because the sort below is stable and keys only on the class. So two Miecze
 * dropped on separate turns stay in the order they were dropped, and a
 * Przedmiot that arrived before a Przyjaciel still reads first within its
 * group even though the group itself has a shape.
 *
 * Empty groups are dropped rather than rendered blank: an Obszar with one Wróg
 * on it should say "Wrogowie 1" and nothing else, not three empty shelves.
 */
export function fieldGroups<T extends { cardId: string }>(
  cards: readonly T[],
): FieldGroup<T>[] {
  const groups: FieldGroup<T>[] = [];

  for (const shelf of SHELVES) {
    const rank = new Map(shelf.classes.map((name, at) => [name, at]));
    const mine = cards.filter((card) => {
      const cardClass = classOnField(card.cardId);
      return cardClass !== null && rank.has(cardClass);
    });
    if (mine.length === 0) continue;
    groups.push({
      key: shelf.key,
      title: TITLES[shelf.key],
      // Stable, and keyed on the class alone — which is what keeps arrival
      // order inside each rank. `classOnField` cannot be null here: `mine` has
      // already refused those.
      cards: mine.sort(
        (a, b) =>
          (rank.get(classOnField(a.cardId) as CardClass) ?? 0) -
          (rank.get(classOnField(b.cardId) as CardClass) ?? 0),
      ),
    });
  }

  /**
   * Anything neither deck claims, shown rather than dropped.
   *
   * Nothing should ever land here — `field_cards` is written by `dropCard` and
   * `putOnPile` from the two decks above — so this exists for the same reason
   * `requireFieldId` throws instead of returning null. A card that vanished off
   * an Obszar because its id had drifted would look exactly like a card
   * somebody else picked up, and there would be nothing on screen to tell them
   * apart. A shelf headed "Pozostałe" with one raw id in it is ugly and
   * diagnosable, which is the right trade for something that cannot happen.
   */
  const unknown = cards.filter((card) => classOnField(card.cardId) === null);
  if (unknown.length > 0) {
    groups.push({ key: "inne", title: TITLES.inne, cards: [...unknown] });
  }

  return groups;
}

/**
 * The numeral printed on a card, for a tile that wants to say which it is.
 *
 * Roman, because that is what is on the card — `Wróg II Bestia`, `Wróg III
 * Demon`, `Przedmiot V Magiczny`. Wyposażenie prints none and answers null.
 */
export function numeralOf(cardId: string): string | null {
  const cardClass = classOnField(cardId);
  if (cardClass === null) return null;
  if ((items as Item[]).some((card) => card.id === cardId)) return null;
  return ["I", "II", "III", "IV", "V", "VI"][CARD_CLASS[cardClass] - 1] ?? null;
}
