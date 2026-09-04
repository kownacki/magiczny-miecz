/** What a device is told about the table, and the lookups it reads that with. */

import characters from "@/data/characters.json";

import events from "@/data/events.json";

import items from "@/data/items.json";

import spells from "@/data/spells.json";

import type { Character, EventCard, Item, Nature, Spell } from "@/data/types";
import type { CardId } from "@/data/ids";
import type { Slot } from "@/lib/engine/slots";
import { forbiddenTo } from "@/lib/engine/holdings";
import type { Holding } from "@/lib/engine/state";
import type { TileCard } from "./card-tile";
import type { SlotItem } from "./slot-panel";
import type { EnvelopeCard, EnvelopeSeat } from "@/lib/game/wire";

const EVENTS = events as EventCard[];

export const CHARACTERS = characters as Character[];

/**
 * Every card a seat can hold, by id, across all four decks.
 *
 * A hand mixes them: an item from the event deck, a Zaklęcie from the spell
 * pile, a trophy that was a Wróg. Looking only in the event deck left spells
 * showing their raw id.
 */
export const CARD_NAMES = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.name] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.name] as const),
  ...(items as Item[]).map((c) => [c.id, c.name] as const),
]);

export const CARD_TEXTS = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.text] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.text] as const),
  ...(items as Item[]).map((c) => [c.id, c.text ?? ""] as const),
]);

/** A card as the wire carries it — see `wire.ts`. */
export type Held = EnvelopeCard;
/** A seat as every device sees it — see `wire.ts`. */
export type Seat = EnvelopeSeat;

/**
 * A seat's cards in the shape the engine's rules read them.
 *
 * The rules that count a pack live in `derive.ts` and are the same ones the
 * server enforces with, so this is the whole of what the browser has to do to
 * ask them. Counting the pack by hand instead is what put a Magiczny Miecz on
 * the wrong side of 5.4 — `carriedCount` leaves the two relics out (see
 * `RELICS`) and a filter written next to it did not.
 */
export function asHoldings(holdings: readonly Held[]): Holding[] {
  return holdings.map((h) => ({
    cardId: h.cardId,
    kind: h.kind,
    face: h.face,
    slot: h.slot ?? null,
  }));
}

/**
 * The reader's own Natura, narrowed once.
 *
 * The column is a plain string, and 5.3 is answered against a Nature — so this
 * is the boundary the guard belongs at, exactly like `asFieldId` elsewhere.
 */
export function asNature(value: string | null | undefined): Nature | null {
  return value === "good" || value === "evil" || value === "chaotic" ? value : null;
}

export const KIND_LABEL: Record<Held["kind"], string> = {
  item: "Przedmiot",
  friend: "Przyjaciel",
  trophy: "Trofeum",
  spell: "Zaklęcie",
  /** The Zaklęcie a Krzyżowiec or a Gnom carries — his, not the hand's (2.6). */
  carried: "Zaklęcie Przyjaciela",
};

/**
 * The one place a Karta becomes something drawable.
 *
 * Everything a tile knows that is not about *where* the card is — its name, its
 * printed text, whether the console conjured it — is decided here, so a view
 * that draws a card asks for one rather than assembling one. That is not a
 * style preference: the conjured mark went missing on an Obszar precisely
 * because `field-modal` could not call this and built the object by hand
 * instead, and dropped the flag doing it.
 *
 * It used to take a whole `Held`, which is why a card lying on a field could
 * not use it — a field row is `{ id, fieldId, cardId, granted }` and holds no
 * `kind`. So it takes the least it needs. `kindLabel` is absent for a card on
 * the board, which is right: „Przedmiot" describes a thing in somebody's pack,
 * and a Karta lying on an Obszar is not in one yet.
 *
 * Anything a tile learns next is added once, here, rather than at every call
 * site — which is the whole of the argument for it.
 */
export function tileFor(card: {
  cardId: CardId;
  kind?: Held["kind"];
  granted?: boolean;
}): TileCard {
  return {
    cardId: card.cardId,
    name: CARD_NAMES.get(card.cardId) ?? card.cardId,
    text: CARD_TEXTS.get(card.cardId),
    ...(card.kind ? { kindLabel: KIND_LABEL[card.kind] } : {}),
    granted: card.granted,
  };
}

/** What this seat is wearing, keyed by place. */
export function wornBySlot(seat: Seat): Partial<Record<Slot, SlotItem>> {
  const worn: Partial<Record<Slot, SlotItem>> = {};
  // 5.3 read against the Natura the seat has *now*: a card that was legal when
  // it went on stops counting the moment 7.2 moves the Natura under it, and the
  // same function the totals are reckoned with is what says so.
  const nature = asNature(seat.nature);
  for (const held of seat.holdings) {
    if (!held.slot) continue;
    worn[held.slot] = {
      holdingId: held.id,
      cardId: held.cardId,
      card: tileFor(held),
      granted: held.granted,
      inert: forbiddenTo(held.cardId, nature),
    };
  }
  return worn;
}
