/** What a card takes off you when it says you lose something. */

/** The shape `strata` carries on a card's script. */
export interface Loss {
  co:
    | "przedmiot"
    | "przyjaciel"
    | "zaklecie"
    | "zloto"
    | "wszystkie-przedmioty"
    | "wszystkie-zaklecia";
  count?: number;
  /** Whose choice it is. Absent means the holder's, which is the rulebook's default (5.6). */
  wybor?: "ty" | "losowo";
}

export interface Losable {
  id: string;
  cardId: string;
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
export function reachableBy(loss: Loss["co"]): Losable["kind"] | null {
  switch (loss) {
    case "przedmiot":
    case "wszystkie-przedmioty":
      return "item";
    case "przyjaciel":
      return "friend";
    case "zaklecie":
    case "wszystkie-zaklecia":
      return "spell";
    case "zloto":
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
  pick: (upTo: number) => number = () => 0,
): string[] | null {
  const kind = reachableBy(loss.co);
  if (kind === null) return [];

  const candidates = holdings.filter((held) => held.kind === kind);
  if (candidates.length === 0) return [];

  // "Wszystkie" is not a count, it is everything of that kind — and it is not a
  // choice either, so it never comes back as null asking which. The Przesilenie
  // says it of a whole table at once ("wszystkie Karty Zaklęć, znajdujące się w
  // posiadaniu Postaci") and the Władca Czarów of one victim.
  if (loss.co === "wszystkie-przedmioty" || loss.co === "wszystkie-zaklecia") {
    return candidates.map((held) => held.id);
  }

  const wanted = Math.min(loss.count ?? 1, candidates.length);
  if (loss.wybor !== "losowo") return null;

  const left = [...candidates];
  const taken: string[] = [];
  for (let i = 0; i < wanted; i++) {
    // Clamped rather than trusted: a port that hands back nonsense should cost
    // a predictable card, not throw in the middle of resolving one. NaN needs
    // saying out loud — it survives Math.max and Math.min untouched, and then
    // indexes the array to undefined.
    const asked = pick(left.length);
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
  if (loss.co !== "zloto") return 0;
  // "Tracisz całe złoto" is the common case and carries no count.
  return loss.count === undefined ? held : Math.min(loss.count, held);
}

/** What the journal says was taken. */
export function describeLoss(loss: Loss): string {
  const what = {
    przedmiot: "Przedmiot",
    przyjaciel: "Przyjaciela",
    zaklecie: "Zaklęcie",
    zloto: "złoto",
    "wszystkie-przedmioty": "wszystkie Przedmioty",
    "wszystkie-zaklecia": "wszystkie Zaklęcia",
  }[loss.co];
  const many = loss.count && loss.count > 1 ? `${loss.count} ` : "";
  const how = loss.wybor === "losowo" ? " (losowo)" : "";
  return `${many}${what}${how}`;
}
