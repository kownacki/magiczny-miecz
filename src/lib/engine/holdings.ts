/** What a seat is carrying, and what that adds to its totals. */

import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { bonusOf, isMagicalItem } from "./cards";
import { ABILITIES } from "./abilities";
import { forbiddenNatures } from "./abilityText";
import { isUsable } from "./uses";
import type { EqMode } from "./slots";
import { isWearable, slotsFor, type Slot } from "./slots";
import type { Holding } from "./state";
import type { FieldId } from "./board";
import type { Nature } from "@/data/types";

const EVENTS = events as EventCard[];

export type HoldingKind = Holding["kind"];

/**
 * Which pile a drawn card joins when a character takes it.
 *
 * Rule 16.6 lets a character take Przedmioty, Przedmioty Magiczne and
 * Przyjaciele with them. A defeated Wróg's card is kept too, but as a trophy to
 * trade for Miecz points later (1.4) — a different mechanism, and one that must
 * not add its Miecz to the holder, or beating a Cyklop would make you six
 * points stronger.
 */
export function kindForCard(card: Pick<EventCard, "cardClass">): HoldingKind | null {
  switch (card.cardClass) {
    case "item":
      return "item";
    case "friend":
      return "friend";
    case "foe":
      return "trophy";
    default:
      // Spotkania, Nieznajomi and Miejsca are resolved and set aside; nobody
      // carries them.
      return null;
  }
}

/**
 * Bonuses conferred by each card that grants one, by card id.
 *
 * Two sources, and the order between them matters. A card may print its bonus
 * as a number in the corner (Excalibur, Miecz Chaosu) or state it only in its
 * text (Srebrna Strzała, Święty Graal), and the encoded `punkty` ability is the
 * one that can express both. So the ability wins where there is one, and the
 * printed number fills in for every card nobody has encoded yet.
 *
 * Taking the sum of the two instead would double every card that has both,
 * which is the natural mistake here and an invisible one — Excalibur would
 * quietly be worth two points of Miecza rather than one.
 *
 * A card you spend is the exception, and reading the corner is exactly wrong
 * for it: the Eliksir Siły prints a 2 because drinking it is worth two points
 * of Miecza *for one turn*, and carrying an unopened bottle around is worth
 * nothing at all. Left in, holding one was a permanent +2 that vanished when it
 * was finally drunk — the opposite of the card. `uses.ts` is what knows the
 * difference between a payoff and a standing rule.
 *
 * Each card is filed under both figures, because a character has two: 1.5's
 * example gives the Troll a "parametr Miecza równy 8" and "podczas walki 11
 * punktom". Only an encoded ability can tell them apart — a printed corner
 * number says how much and never when — so a card nobody has encoded counts
 * towards both, which is what it did before this existed.
 */
interface Lent {
  /** The character's parameter (1.5): what they are worth standing still. */
  parametr: HeldTotals;
  /** What they are worth in a fight, which is the same or more. */
  walka: HeldTotals;
}

const NOTHING: HeldTotals = { miecz: 0, magia: 0 };

const BONUS_BY_ID = new Map<string, Lent>();
for (const card of EVENTS) {
  if (isUsable(card.id)) continue;
  const printed = bonusOf(card);
  if (printed) BONUS_BY_ID.set(card.id, { parametr: printed, walka: printed });
}
for (const [cardId, abilities] of Object.entries(ABILITIES)) {
  const points = abilities.find((ability) => ability.kind === "punkty");
  if (points && points.kind === "punkty") {
    const lent = { miecz: points.miecz ?? 0, magia: points.magia ?? 0 };
    BONUS_BY_ID.set(cardId, {
      parametr: points.tylkoWalka ? { miecz: 0, magia: 0 } : lent,
      walka: lent,
    });
  }
}

/**
 * A printed number is not always a loan.
 *
 * The fallback above reads the corner of every card as points lent to whoever
 * holds it, which is right for the Pasterz ("doda ci 1 punkt Miecza i 1 punkt
 * Magii") and wrong for the two friends who fight on their own account. The
 * Rycerz prints 3 and 3 because *he* has 3 and 3 — "będzie walczył zamiast
 * ciebie" — and the Poszukiwacz Przygód prints 3 because that is what he raids
 * with. Read as loans they made their owner permanently stronger, a Rycerz
 * handing out +3/+3 for standing next to him, which is close to the opposite of
 * what the card says.
 *
 * So a card that fights for you lends nothing, and its number is read by
 * `fightsForYou` at the moment the fight needs it.
 */
for (const [cardId, abilities] of Object.entries(ABILITIES)) {
  if (abilities.some((ability) => ability.kind === "walczy-za-ciebie")) {
    BONUS_BY_ID.set(cardId, { parametr: NOTHING, walka: NOTHING });
  }
}

export interface HeldTotals {
  miecz: number;
  magia: number;
}

/**
 * What a seat's held cards add to its own points (1.5, 2.5).
 *
 * Trophies contribute nothing, spells contribute nothing, and a card the app
 * has no bonus recorded for contributes nothing — the referee is usable before
 * every card is transcribed, so an unknown card must be inert rather than a
 * crash.
 */
/**
 * The cards that are actually doing something.
 *
 * In klasyczny play, all of them: the rulebook has one kind of possession and
 * a Miecz in your pack is a Miecz (5.4).
 *
 * In slotowy, a card that *has* a place only works when it is in it — that is
 * the whole of the variant — while a card with no place goes on working from
 * the pack, because otherwise a quarter of the deck would fall silent. So a
 * sheathed Excalibur adds nothing and a Latarnia in the pack still lights the
 * Lodowy Las.
 *
 * Friends are never worn and always count. So are trophies, which are not
 * carried at all but kept for trading (1.4).
 */
export function inEffect<T extends { cardId: string; slot?: string | null }>(
  holdings: readonly T[],
  eqMode: EqMode,
  /**
   * The holder's Natura, when it is known.
   *
   * 5.3 forbids a Natura certain cards, and 7.2 lets a character change Natura
   * with the cards already on it — so a Święta Włócznia that was legal this
   * morning is not, on a player who has since turned Zły. What it becomes is
   * *inert*: it is still there, it is still theirs, and it does nothing at all.
   *
   * Inert rather than gone, which is this app's decision and not the
   * rulebook's: 7.4 says such a card must be dropped, and the referee's answer
   * to "you may no longer hold this" is to say so, not to reach across the
   * table and take it. Dropping it is a move a player makes — and a pack with
   * no room in it would make that move impossible if the app had already taken
   * the card off them.
   *
   * Omitted, nothing is forbidden. That is the honest answer where the caller
   * does not know the Natura, and it is what every caller did before this.
   */
  nature: Nature | null = null,
): T[] {
  const allowed = (cardId: string) => {
    if (nature === null) return true;
    const forbidden = forbiddenNatures(cardId);
    return !forbidden || !forbidden.includes(nature);
  };
  if (eqMode === "classic") return holdings.filter((held) => allowed(held.cardId));
  return holdings.filter(
    (held) => (held.slot != null || !isWearable(held.cardId)) && allowed(held.cardId),
  );
}

/**
 * Whether this card is doing nothing because of who is holding it (5.3).
 *
 * The same question `inEffect` filters on, asked about one card, because the
 * places that *draw* a card have to say so: a Topór that has gone inert looks
 * exactly like one that is working, and a character quietly worth three points
 * less than their table thinks is the sort of thing that is discovered during
 * a fight.
 */
/**
 * 5.3's refusal, written once.
 *
 * Both sides say it: the command, which is what actually refuses, and the
 * browser, which now works the same answer out for itself so the card never
 * leaves the pack. Two copies of a sentence is two sentences the day one of
 * them is reworded, and this one carries a rule number a player is meant to
 * be able to look up.
 */
export function forbiddenSaid(name: string): string {
  return `${name} — twoja Natura nie pozwala ci tego użyć (5.3).`;
}

export function forbiddenTo(cardId: string, nature: Nature | null): boolean {
  if (nature === null) return false;
  const forbidden = forbiddenNatures(cardId);
  return Boolean(forbidden?.includes(nature));
}

/**
 * Which of the two figures is being asked for.
 *
 * Named at every call site rather than defaulted, because both defaults are
 * wrong in one direction: assume `parametr` and a forgotten fight leaves a
 * character weaker than their cards make them; assume `walka` and everything
 * that is not a fight — the Pułapka of 14.5, the number on their card — reads
 * high. The compiler asking is cheaper than either.
 */
export type Reckoning = keyof Lent;

/**
 * The Obszary where a Przedmiot lends nothing.
 *
 * "Nie możesz liczyć na Magię i Miecz czerpane z Przedmiotów i Przedmiotów
 * Magicznych" — note that it is every Przedmiot rather than only the magical
 * ones: the sentence names the magical ones as well as, not instead of.
 *
 * Przyjaciele are not Przedmioty and keep lending what they lend. A character
 * standing here is worth its own points plus its friends', and nothing else.
 */
export const NO_ITEM_BONUS: ReadonlySet<FieldId> = new Set<FieldId>([
  "zaczarowane-wzgorza",
  "rozstajne-drogi-1",
]);

/**
 * The Obszary where no Zaklęcie may be spoken.
 *
 * A separate list, because the board does not pair the two rules the way one
 * set implied. The Zaczarowane Wzgórza carry both — "nie możesz liczyć na Miecz
 * i Magię ... Nie możesz też rzucać Zaklęć" — but the Rozstajne Drogi split
 * them one apiece: the first Obszar suspends the Przedmioty and says nothing
 * about Zaklęcia, and the second forbids Zaklęcia and leaves the Przedmioty
 * alone. Reading one set for both would have banned magic on a crossroads that
 * permits it and allowed it on the one that does not.
 */
export const NO_SPELLS: ReadonlySet<FieldId> = new Set<FieldId>([
  "zaczarowane-wzgorza",
  "rozstajne-drogi-2",
]);

/** Whether this Obszar suspends what a Przedmiot is worth. */
export function suppressesItems(fieldId: FieldId | null): boolean {
  return fieldId !== null && NO_ITEM_BONUS.has(fieldId);
}

/** Whether this Obszar forbids speaking a Zaklęcie at all. */
export function suppressesSpells(fieldId: FieldId | null): boolean {
  return fieldId !== null && NO_SPELLS.has(fieldId);
}

export function bonusFromHoldings(
  holdings: readonly Holding[],
  eqMode: EqMode,
  as: Reckoning,
  /** Where the character is standing, when that changes what its cards are worth. */
  standingOn: FieldId | null = null,
  /** Whose they are, since 5.3 makes some of them inert on some Natury. */
  nature: Nature | null = null,
  /**
   * The Wojna Żywiołów, which suspends Magiczne Przedmioty and nothing else.
   *
   * "Żaden gracz, łącznie z tobą, nie będzie mógł używać Zaklęć i **Magicznych
   * Przedmiotów** ani ciągnąć z nich żadnych korzyści." Narrower than the
   * Zaczarowane Wzgórza above, which suspend every Przedmiot by the board's own
   * words — a Miecz still cuts under the Wojna, and an Excalibur does not.
   */
  noMagical = false,
): HeldTotals {
  const noItems = suppressesItems(standingOn);
  let miecz = 0;
  let magia = 0;
  for (const holding of inEffect(holdings, eqMode, nature)) {
    if (holding.kind !== "item" && holding.kind !== "friend") continue;
    if (noItems && holding.kind === "item") continue;
    if (noMagical && isMagicalItem(holding.cardId)) continue;
    const bonus = BONUS_BY_ID.get(holding.cardId);
    if (!bonus) continue;
    miecz += bonus[as].miecz;
    magia += bonus[as].magia;
  }
  return { miecz, magia };
}

/**
 * What one viewer may see of another seat's hand.
 *
 * Items and friends lie face up on the table (5.2, 6.2) and are public. Spells
 * are held concealed (9.3), so another player learns only how many there are —
 * which is itself public, since the cards are visibly in someone's hand.
 *
 * A seat always sees its own hand in full. In companion mode nothing is hidden
 * at all: the cards are physically in people's hands and the app is not the one
 * keeping the secret.
 */
export function visibleTo<T extends Holding>(
  holdings: readonly T[],
  options: { own: boolean; mode: string },
): { cards: T[]; hiddenCount: number } {
  if (options.own || options.mode === "companion") {
    return { cards: [...holdings], hiddenCount: 0 };
  }
  const cards = holdings.filter((holding) => holding.face !== "hidden");
  return { cards, hiddenCount: holdings.length - cards.length };
}

/* --------------------------------------------------------------------------
 * Where a Przedmiot goes when it arrives.
 * ----------------------------------------------------------------------- */

/**
 * The place a card arriving now should land in, or null for the Plecak.
 *
 * # Why every route asks this and none of them decides it
 *
 * A Przedmiot reaches a character three ways — picked up (12.1, 21.1), dealt
 * with the Postać (4.4 and setup), or conjured by the console — and all three
 * used to answer this differently. The starting kit was worn, because
 * `stowStartingKit` existed for exactly that; everything else went into the
 * Plecak and stayed there until somebody typed `equip`. So the Rycerz began
 * wearing his Miecz and the identical Miecz he picked up on turn three did
 * nothing, which is not a rule anybody wrote down — it is two code paths.
 *
 * In slotowy that difference is the whole variant: only what is worn counts.
 * A card in the pack is a card doing nothing.
 *
 * # What it will not do
 *
 * **It never displaces what is already worn.** A Miecz found while wearing a
 * Miecz goes in the pack, and the player may swap them with `equip` if they
 * want to. Arriving gear that quietly kicked off better gear would be a
 * referee making a decision the player did not ask it to make, and the one
 * thing worse than a card doing nothing is a card silently undoing something.
 *
 * Everything else that would refuse an `equip` refuses here too, quietly:
 * a Natura that may not use it (5.3), a card with no place on the body, a kind
 * that is not a Przedmiot at all. Quietly, because arriving is not the moment
 * to argue — the card is still yours, it is simply in the bag.
 *
 * Klasyczny has no places, so the answer there is always the Plecak.
 */
export function slotOnArrival(arriving: {
  cardId: string;
  kind: string;
  eqMode: EqMode;
  nature: Nature | null;
  /** What this seat is already wearing. Nulls — pack cards — are ignored. */
  worn: readonly (Slot | null)[];
}): Slot | null {
  if (arriving.eqMode !== "slots") return null;
  if (arriving.kind !== "item") return null;
  if (forbiddenTo(arriving.cardId, arriving.nature)) return null;

  const taken = new Set(arriving.worn.filter((one): one is Slot => one !== null));
  // In the order the card names them, so a Przedmiot with two homes lands in
  // the one it would rather have.
  return slotsFor(arriving.cardId).find((slot) => !taken.has(slot)) ?? null;
}

/**
 * The same question for several cards arriving together, which is a fold.
 *
 * Each one takes a place from what is left, so two Miecze dealt at once do not
 * both claim the main hand. Replaces `stowStartingKit`, which answered this for
 * the starting kit alone and knew nothing about what the seat already had —
 * fine at setup, where the answer is always nothing, and wrong for a Postać
 * taken mid-game (4.4).
 */
export function slotsOnArrival(
  arriving: readonly { cardId: string; kind: string }[],
  at: { eqMode: EqMode; nature: Nature | null; worn: readonly (Slot | null)[] },
): (Slot | null)[] {
  const worn = [...at.worn];
  return arriving.map((one) => {
    const slot = slotOnArrival({ ...one, ...at, worn });
    if (slot !== null) worn.push(slot);
    return slot;
  });
}
