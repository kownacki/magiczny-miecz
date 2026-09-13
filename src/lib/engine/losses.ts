/** What a card takes off you when it says you lose something. */

import type { CardId } from "@/data/ids";

/** The shape `lose` carries on a card's script. */
export interface Loss {
  what:
    | "item"
    | "friend"
    | "spell"
    | "gold"
    | "all-items"
    | "all-spells"
    | "all-friends-except";
  /** Cards a sweeping loss leaves alone, by id (the Zły Duch spares the Południca). */
  except?: readonly CardId[];
  count?: number;
  /** Whose choice it is. Absent means the holder's, which is the rulebook's default (5.6). */
  chosenBy?: "you" | "random";
}

export interface Losable {
  id: string;
  cardId: CardId;
  kind: "item" | "friend" | "trophy" | "spell";
}

/**
 * Which of the four kinds a loss is allowed to reach for.
 *
 * A trophy is not a Przedmiot. Rule 1.4 makes a beaten Wróg worth points of
 * Miecz, not a thing in your pack — so a card taking "1 Przedmiot" must not be
 * able to take one, however much they look alike in the holdings table.
 */
/**
 * Which pile a loss can reach into, or null when it takes no card at all.
 *
 * Exported because a caller that has to roll for the picks needs to know how
 * many it will be asked for before it asks — and that is this, counted against
 * what the seat is actually holding. Rolling a fixed number instead would spend
 * dice on picks nobody makes, which a scripted port notices.
 */
/**
 * Losses that name what goes, so there is nothing for anybody to choose.
 *
 * Two places need this and each used to keep its own list, which is how they
 * came to disagree: `chooseLosses` below knew that „wszystkie" is everything of
 * a kind and never a question, and `isSettled` in `resolve.ts` named
 * `all-items` and forgot `all-spells`. So the Przesilenie —
 * "wszystkie Karty Zaklęć, znajdujące się w posiadaniu Postaci" — was held at
 * the gate as an unanswered choice and never reached the code that knew it was
 * not one. It announced nothing and took nothing, on every table, since it was
 * written.
 *
 * An exhaustive switch rather than a set, so a new `what` cannot be added without
 * somebody saying which of the two it is.
 */
export function takesEverything(what: Loss["what"]): boolean {
  switch (what) {
    // Everything of a kind. The card has already decided.
    case "all-items":
    case "all-spells":
      return true;
    // The same, minus the ones the card names — still the card deciding. Only
    // the Zły Duch: "wszyscy dotychczasowi Przyjaciele (z wyjątkiem Południcy)".
    case "all-friends-except":
      return true;
    // A number on the seat rather than a card in the pack (3.5), so there is
    // nothing to point at.
    case "gold":
      return true;
    // The four that 5.6 leaves to the holder: "zależy wyłącznie od decyzji
    // gracza". A die answers instead where the card says `chosenBy: "random"`.
    case "item":
    case "friend":
    case "spell":
      return false;
  }
}

export function reachableBy(loss: Loss["what"]): Losable["kind"] | null {
  switch (loss) {
    case "item":
    case "all-items":
      return "item";
    case "friend":
    case "all-friends-except":
      return "friend";
    case "spell":
    case "all-spells":
      return "spell";
    case "gold":
      // Gold is a number on the seat, not a card in the pack (3.5).
      return null;
  }
}

/**
 * The holdings a loss takes, or null when the holder has to be asked.
 *
 * Null is not a failure: 5.6 gives the choice of what to give up to the player
 * ("zależy wyłącznie od decyzji gracza"), and a card that does not say
 * otherwise inherits that. The caller keeps such a loss pending and asks, the
 * same way it does with anything else it cannot finish alone.
 *
 * `pick` is how a random loss chooses, passed in rather than reached for, so
 * this stays pure and a test can say exactly which card went.
 */
export function chooseLosses(
  holdings: readonly Losable[],
  loss: Loss,
  /**
   * Which of the candidates goes. Null means it has not been answered yet.
   *
   * Defaulting to null rather than to the first card is the point: an
   * unanswered choice must stay a question. A caller that means chance hands in
   * a die, and a caller that means the holder hands in what they picked.
   */
  pick: (upTo: number) => number | null = () => null,
): string[] | null {
  const kind = reachableBy(loss.what);
  if (kind === null) return [];

  const candidates = holdings.filter((held) => held.kind === kind);
  if (candidates.length === 0) return [];

  /**
   * "Wszystkie" is not a count, it is everything of that kind — and it is not a
   * choice either, so it never comes back as null asking which. The Przesilenie
   * says it of a whole table at once ("wszystkie Karty Zaklęć, znajdujące się w
   * posiadaniu Postaci") and the Władca Czarów of one victim.
   *
   * The Zły Duch spares the ones his card names and takes the rest, which is
   * still the card deciding rather than the holder: "wszyscy dotychczasowi
   * Przyjaciele (z wyjątkiem Południcy)". A character whose only Przyjaciel is
   * the Południca loses nobody.
   */
  if (takesEverything(loss.what)) {
    const spared = new Set(loss.what === "all-friends-except" ? (loss.except ?? []) : []);
    return candidates.filter((held) => !spared.has(held.cardId)).map((held) => held.id);
  }

  const wanted = Math.min(loss.count ?? 1, candidates.length);

  /**
   * 5.6 gives the choice of what to give up to the holder, so a loss the card
   * does not assign to chance is asked rather than taken — and `pick` is how it
   * is answered, exactly as it answers a roll. Null back means nobody has
   * answered yet, which is what keeps the effect pending instead of quietly
   * costing the first card in the pack.
   *
   * Before this, a holder's choice returned null unconditionally and nothing
   * could ever answer it. No card in the box used the shape, so it went
   * unnoticed until the Bagna needed it — and a field that can never be settled
   * is a turn that cannot end.
   */
  const left = [...candidates];
  const taken: string[] = [];
  for (let i = 0; i < wanted; i++) {
    // Clamped rather than trusted: a port that hands back nonsense should cost
    // a predictable card, not throw in the middle of resolving one. NaN needs
    // saying out loud — it survives Math.max and Math.min untouched, and then
    // indexes the array to undefined.
    /**
     * The two kinds of unanswered are not the same.
     *
     * A loss the card gives to chance always has an answer — a caller with no
     * die falls back to the first candidate, as it always did. A loss the
     * holder chooses stays a question until they answer it, which is what keeps
     * the effect pending rather than costing them a card they never picked.
     */
    const asked = pick(left.length) ?? (loss.chosenBy === "random" ? 0 : null);
    if (asked === null) return null;
    const at = Number.isFinite(asked)
      ? Math.min(Math.max(0, Math.trunc(asked)), left.length - 1)
      : 0;
    taken.push(left[at].id);
    left.splice(at, 1);
  }
  return taken;
}

/** How much gold a loss takes, given what the seat has. */
export function goldLost(loss: Loss, held: number): number {
  if (loss.what !== "gold") return 0;
  // "Tracisz całe złoto" is the common case and carries no count.
  return loss.count === undefined ? held : Math.min(loss.count, held);
}

/**
 * What the journal says was taken — a noun phrase, not a sentence.
 *
 * Named apart from `effectText.ts`'s `describeLoss`, which the two of them
 * were not. That one answers "tracisz wszystkie Zaklęcia" for a panel telling
 * you what a card is about to do; this one answers "wszystkie Zaklęcia" for a
 * line already reading "Michał traci …". Different types, different voices,
 * different halves of the app — and one name, in one directory, so a session
 * grepping for it got two functions with two contracts and no way to tell from
 * the call which had been meant.
 */
export function lossTaken(loss: Loss): string {
  const noun = {
    item: "Przedmiot",
    friend: "Przyjaciela",
    "all-friends-except": "wszystkich Przyjaciół",
    spell: "Zaklęcie",
    gold: "złoto",
    "all-items": "wszystkie Przedmioty",
    "all-spells": "wszystkie Zaklęcia",
  }[loss.what];
  const many = loss.count && loss.count > 1 ? `${loss.count} ` : "";
  const how = loss.chosenBy === "random" ? " (losowo)" : "";
  return `${many}${noun}${how}`;
}
