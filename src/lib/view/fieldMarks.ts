/** What a square is, at a glance: the small marks under its name on the map and beside it in the drawer. */

import { FIELDS, isFerry, type FieldId } from "@/lib/engine/board";
import { crossingFrom } from "@/lib/engine/rings";
import { scriptFor } from "@/lib/engine/cardScript";
import {
  changesYou,
  fieldScriptFor,
  movesYou,
  offersFromCard,
  rollsHere,
  tradesForGold,
} from "@/lib/engine/fieldScript";

/**
 * The marks, in the order they are drawn.
 *
 * An order and not a set: a square with four of them has to read the same way
 * every time or the row stops being scannable, and the one that decides where
 * you go should come first. Roughly by how much it changes a decision —
 * somebody to trade with is a reason to walk here, a way across is a reason to
 * walk *through*, a die is a risk, a boon is a bonus, and the Karty are what
 * will happen once you arrive rather than why you came.
 */
export type FieldMark = "sakwa" | "przeprawa" | "kostka" | "gwiazda" | "karty";

/**
 * The four that are a silhouette. „karty" is the fifth mark and is not one of
 * these: it is a *count*, drawn as that many card backs, so it has a number
 * where the others have only a yes.
 */
export type IconMark = Exclude<FieldMark, "karty">;

/** The drawing for each, vendored from game-icons.net — see `public/marks/CREDITS.md`. */
export const MARK_ICON: Record<IconMark, string> = {
  sakwa: "/marks/sakwa.svg",
  przeprawa: "/marks/przeprawa.svg",
  kostka: "/marks/kostka.svg",
  gwiazda: "/marks/gwiazda.svg",
};

/** What each one claims, for the hover that has to justify it. */
export const MARK_TITLE: Record<FieldMark, string> = {
  sakwa: "Można tu handlować za złoto",
  przeprawa: "Stąd można się przeprawić",
  kostka: "Rzuca się tu kostką",
  gwiazda: "Obszar zmienia parametry Postaci",
  karty: "Tyle Kart Zdarzeń ciągnie się na tym Obszarze (13.4)",
};

/**
 * What a Karta lying here is, as far as the marks are concerned.
 *
 * Only the ones that *stay* — `offersFromCard` is the same question the offer
 * list asks — because a mark on the map is a claim about the square that will
 * still be true when somebody walks there, and a Spotkanie is spent by the
 * first person to read it.
 */
function marksFromCard(cardId: string): IconMark[] {
  if (!offersFromCard(cardId)) return [];
  const script = scriptFor(cardId);
  if (!script) return [];
  const found: IconMark[] = [];
  if (tradesForGold(script.effect)) found.push("sakwa");
  if (movesYou(script.effect)) found.push("przeprawa");
  if (rollsHere(script.effect)) found.push("kostka");
  if (changesYou(script.effect)) found.push("gwiazda");
  return found;
}

/**
 * Every mark this Obszar earns, in drawing order, without the deal.
 *
 * The deal is separate because it is a *count* rather than a flag and is drawn
 * as that many Karty — see the callers. Everything else is here so the map and
 * the Obszar's own drawer cannot come to disagree about what a square is, which
 * is the whole reason this is not two lists.
 *
 * # Which offers are asked, and why it differs per mark
 *
 * The sakwa, the boat and the star go through the *optional* offers only: they
 * claim there is something here you may walk up to and do, and „MUSISZ RZUCIĆ
 * KOSTKĄ" is not that. The die is asked of the compulsory ones too — a table
 * you cannot refuse is precisely the thing a player wants warning about, and
 * the Karczma is the clearest case on the board.
 */
export function marksFor(
  fieldId: FieldId,
  /** What has settled here (16.8), because a square's services are not all printed on it. */
  lying: readonly { cardId: string }[] = [],
): IconMark[] {
  const script = fieldScriptFor(fieldId);
  const chosen = script?.obowiazkowe ? [] : (script?.offers ?? []);
  const fromCards = lying.flatMap((card) => marksFromCard(card.cardId));

  const found = new Set<IconMark>(fromCards);

  if (chosen.some((offer) => tradesForGold(offer.effect))) found.add("sakwa");

  /**
   * 11.2's ferry and 11.3-11.6's crossings are the board's own, and are not
   * effects at all — a Przeprawa is a toll printed on a river and a crossing is
   * a boundary between rings. Both are "you can get somewhere else from here",
   * which is what the mark says, so they join whatever a Karta contributed.
   */
  if (isFerry(fieldId) || crossingFrom(fieldId) !== undefined) found.add("przeprawa");
  if (chosen.some((offer) => movesYou(offer.effect))) found.add("przeprawa");

  // Every offer, compulsory included — see above.
  if ((script?.offers ?? []).some((offer) => rollsHere(offer.effect))) found.add("kostka");
  // A crossing that is rolled for is a die on this square too (11.3): the
  // Trzęsawiska are two dice against your Magia, and only going up.
  if (crossingFrom(fieldId)?.test?.kind === "magic") found.add("kostka");

  if (chosen.some((offer) => changesYou(offer.effect))) found.add("gwiazda");

  const order: IconMark[] = ["sakwa", "przeprawa", "kostka", "gwiazda"];
  return order.filter((mark) => found.has(mark));
}

/** 13.4's count, which is drawn as that many Karty rather than as a flag. */
export function dealtOn(fieldId: FieldId): number {
  return FIELDS.get(fieldId)?.draw ?? 0;
}
