/** What a device is told about the table, and the lookups it reads that with. */

import characters from "@/data/characters.json";
import events from "@/data/events.json";
import items from "@/data/items.json";
import spells from "@/data/spells.json";
import type { Character, EventCard, Item, Nature, Spell } from "@/data/types";
import type { CardId } from "@/data/ids";
import type { FieldId } from "@/lib/engine/board";
import type { SeatCharacter } from "@/lib/engine/characters";
import type { Slot } from "@/lib/engine/slots";
import { forbiddenTo } from "@/lib/engine/holdings";
import type { Holding } from "@/lib/engine/state";
import type { TileCard } from "./card-tile";
import type { SlotItem } from "./slot-panel";

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

export interface Held {
  /** Where it is worn in the slotted variant; null when it is in the pack. */
  slot?: Slot | null;
  id: string;
  /** Any card in the box — 16.6 makes the event and equipment id spaces overlap. */
  cardId: CardId;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
  /** Conjured by the test shortcut — marked on the card, not just in the journal. */
  granted?: boolean;
}

export interface Seat {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: SeatCharacter | null;
  /**
   * Narrow here as well as on the server, because the server is what guarantees
   * it: `seatsFor` turns the stored column into a `FieldId` or null before it
   * ever reaches a response, so the browser is not trusting a wire value — it is
   * naming the type the API already promises.
   */
  field_id: FieldId | null;
  sword_own: number;
  magic_own: number;
  /** Own points plus everything carried (1.5, 2.5), computed server-side. */
  sword_total: number;
  magic_total: number;
  /**
   * How many Zaklęcia this hand may hold (2.6), computed server-side.
   *
   * Sent rather than worked out here so the number shown is the number the
   * server refuses a draw against — the same basis, not one that happens to
   * agree most of the time.
   */
  spell_capacity: number;
  /**
   * Why nothing in the rack may be spoken, when nothing may.
   *
   * The server's own refusal sentence, not a flag: the hand greys itself with
   * the words the route would have answered with, so a player who reads why a
   * card is dimmed has read the rule that would have stopped them. Null is the
   * ordinary case. See `whyNoSpells`.
   */
  spells_blocked: string | null;
  /** The same, reckoned for a fight — 1.5's other figure. */
  sword_in_fight: number;
  magic_in_fight: number;
  /**
   * The Przyjaciel swinging instead of the character, or null for the usual case.
   *
   * Sent rather than worked out here, and worth drawing wherever the fight
   * figure is: the Rycerz's 3 and 3 *replace* what the character has of its
   * own, so for most Postacie `sword_in_fight` goes **down** the moment he
   * joins. A number that falls when you gain a card reads as a bug in the app
   * unless something names the card doing it.
   */
  fights_for_you: CardId | null;
  /**
   * What the character is under, already worked out into marks.
   *
   * The server folds the stored effects together with the four ad-hoc columns
   * the turn engine reads, so the browser gets one list and never has to know
   * there were two halves.
   */
  effects: {
    id: string;
    /** The card that put it there, where a card did. */
    source: string;
    glyph: string;
    tone: "dobry" | "zly" | "obojetny";
    /** `label — when`, for a hover and for anywhere one line is all there is. */
    title: string;
    /** The card's own words for it, in the language the cards use. */
    label: string;
    /**
     * How long it has left, and the round it lapses in where there is one.
     *
     * Composed on the server, because working it out needs the whole turn
     * order walked forward and the browser is sent one seat at a time.
     */
    when: string;
    /** How many applications this row stands for — two Kręgi Płomieni are one row. */
    count: number;
    /** What the second and later ones did. Only worth saying when `count > 1`. */
    stacking: "sums" | "queues" | "refreshes" | "exclusive";
    /**
     * Whether the round in `when` was read off a column or worked out.
     *
     * `prognoza` means the turn order was walked to get there, and the next
     * Karta drawn can move it. Null where the effect has no round at all —
     * Fatum until somebody speaks Władca Zaklęć, a Świątynia's hold until a
     * die — which is a thing the panel must not paper over with a number.
     */
    certainty: "pewne" | "prognoza" | null;
  }[];
  life: number;
  gold: number;
  /**
   * Points of beaten Wrogowie waiting to become Miecz (1.4).
   *
   * Always a number and `0` in "cards" mode, where the Karty are the record
   * instead — so this cannot be read as "which mode is this". `game.trophy_mode`
   * says that, and nothing else does.
   */
  trophy_points?: number;
  /**
   * Everyone this Postać has beaten, in „Punkty" — the shelf, not the wallet.
   *
   * Append-only and never spent: points are fungible, so no particular corpse
   * paid for a given Miecz and no portrait can be the one that vanishes when
   * you trade. You did kill the Wilkołak; cashing seven points does not un-kill
   * him. Cleared with the seat on death, beside `trophy_points`.
   */
  trophy_beaten?: string[];
  nature: string | null;
  turns_lost: number;
  /** Turn the Kamień wears off on (20.1). Null when not petrified. */
  stone_until_round: number | null;
  eliminated: boolean;
  /**
   * Whoever is driving this chair, and null when nobody is.
   *
   * The only thing about a *person* on a seat row, and it is a pointer rather
   * than a copy: their name, whether they run the table, whether they are ready
   * and whether they have gone quiet are all on the person, in `users`, because
   * that is where they belong and a chair outlives everybody who sits in it.
   *
   * It replaces four columns that used to be here — `abandoned_at`, `ready`,
   * `no_device` and `is_host` — and the fourth is the reason the replacement
   * matters: they stopped arriving when the schema split, while staying
   * declared here, so every one of them read `undefined` and every test against
   * them silently answered the wrong way. `abandoned_at !== null` was true of
   * every seat at the table.
   */
  driver_id: string | null;
  /** The driver has not checked in recently — a closed tab, not a decision. */
  away: boolean;
  holdings: Held[];
  /** Cards this viewer is not allowed to see the faces of (9.3). */
  hidden_count: number;
}

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
