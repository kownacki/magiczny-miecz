/** What one device is sent, and everything the others are not. */

import { visibleTo } from "@/lib/engine/holdings";
import { bonusFrom, markOf } from "@/lib/engine/status";
import type { Slot } from "@/lib/engine/slots";
import { shopStock } from "./commands/draw";
import { seatView } from "./commands/seat";
import type { Snapshot } from "./change";
import { AWAY_AFTER_MS } from "./store";

/**
 * The read model, and the counterpart to `Changeset`.
 *
 * A Command reads a `Snapshot` and returns a `Changeset`: what the table
 * becomes. This reads the same `Snapshot` and returns an Envelope: what one
 * seat is allowed to be told about it. Both are pure functions of a snapshot,
 * and that is the point of writing this one down separately at all.
 *
 * It lived in the GET handler until now — ninety lines of mapping inside a
 * route — and it is the only thing standing between a player's concealed hand
 * (9.3) and every other device at the table. `visibleTo` has tests; the wiring
 * around it, `mine?.id === seat.id`, did not, because there was nowhere to call
 * it from without a database and a Next.js request. One inverted comparison
 * there sends every hand to everybody, the game keeps working, and nothing
 * fails. That is the specific accident this file exists to make testable.
 *
 * Pure, so `now` is passed rather than read: presence is a comparison against
 * the clock, and a test that cannot fix the clock cannot check it.
 */

/** A card as the wire carries it — the row id travels, because two can be alike. */
export interface EnvelopeCard {
  id: string;
  cardId: string;
  kind: string;
  face: string | null;
  slot: Slot | null;
  granted: boolean;
}

export interface EnvelopeSeat {
  id: string;
  seat_index: number;
  /** True only of a seat heard from once and then silent. See `away` below. */
  away: boolean;
  holdings: EnvelopeCard[];
  hidden_count: number;
  sword_total: number;
  magic_total: number;
  spell_capacity: number;
  sword_in_fight: number;
  magic_in_fight: number;
  effects: { id: string; source: string | null }[];
  [column: string]: unknown;
}

export interface Envelope {
  game: Record<string, unknown>;
  mySeatIndex: number | null;
  fieldCards: { id: string; fieldId: string | null; cardId: string }[];
  stock: Record<string, number>;
  seats: EnvelopeSeat[];
}

/**
 * The table minus its decks.
 *
 * The stored `deck` is the shuffled draw pile in order, and sending it is
 * handing every player the rest of the game: what the next Zdarzenie is, which
 * Zaklęcie is coming, whether the Wróg ahead is a Smok or a Wilk. Nobody in the
 * browser reads it — drawing happens on the server — so it is simply removed
 * rather than trimmed.
 *
 * What is left is the two counts, which are public at a physical table: the
 * pile in front of everybody is visibly thick or nearly gone, and 15.5's
 * reshuffle is something the whole table watches happen.
 */
export function withoutDeck<T extends { deck: unknown }>(game: T) {
  const { deck, ...rest } = game;
  const decks = (deck ?? null) as {
    events?: { draw?: unknown[]; discard?: unknown[] };
    spells?: { draw?: unknown[]; discard?: unknown[] };
  } | null;
  /**
   * The used pile travels; the one waiting to be drawn from never does.
   *
   * Setup puts the Karty Zdarzeń "koszulkami do góry (w formie zakrytej)" and
   * says the same of the Zaklęcia, so what is next off the top is the one thing
   * at this table nobody may know — sending it would hand every device the
   * whole game in order.
   *
   * The stos zużytych is the opposite, by the manual's own silence. It names
   * that pile six times and never once calls it concealed, in a rulebook that
   * says "w formie odkrytej" of a card left on an Obszar (16.8) and hides a
   * spell hand outright (9.3). And 9.5 shuffles it before it comes back, so
   * knowing what is in it tells nobody what is coming.
   *
   * Only the top card, though. Reading back through a used pile is a thing a
   * table can do and this one does not offer yet, so sending the rest would be
   * shipping the whole history of a game to every device for a feature nobody
   * has asked for — and the count beside it already says how deep it goes.
   *
   * A slice ref rather than an id, so the pile shows the copy that was actually
   * spent — the box prints four Magiczne Miecze and they are not interchangeable
   * to a `DeckState` (see `deck.ts`).
   */
  const spent = (pile?: { discard?: unknown[] }) => {
    const top = (pile?.discard ?? []).at(-1);
    return typeof top === "string" ? top : null;
  };

  return {
    ...rest,
    deckCounts: decks
      ? {
          events: {
            draw: decks.events?.draw?.length ?? 0,
            discard: decks.events?.discard?.length ?? 0,
          },
          spells: {
            draw: decks.spells?.draw?.length ?? 0,
            discard: decks.spells?.discard?.length ?? 0,
          },
        }
      : null,
    used: decks
      ? { events: spent(decks.events), spells: spent(decks.spells) }
      : null,
  };
}

/**
 * Everything the device holding `mySeatId` may be told.
 *
 * `mySeatId` is null for a device that has not proved which seat it is — the
 * table screen, or a browser watching a game it has not joined. Null is the
 * strictest case rather than a missing one: nothing is its own, so every hand
 * at the table conceals.
 */
export function envelopeFor(
  table: Snapshot,
  mySeatId: string | null,
  now: number,
): Envelope {
  const { game, seats, holdings, fieldCards } = table;
  const mine = seats.find((seat) => seat.id === mySeatId) ?? null;

  return {
    game: withoutDeck(game),
    mySeatIndex: mine?.seat_index ?? null,
    // The row id travels too: picking a card up names *which* card, and a
    // field can hold two of the same Przedmiot.
    fieldCards: fieldCards.map((row) => ({
      id: row.id,
      fieldId: row.field_id,
      cardId: row.card_id,
    })),
    // What the Wyposażenie pile still holds (21.2), so a shop shows what it has
    // rather than offering what will be refused.
    stock: shopStock({ holdings, fieldCards }),
    seats: seats.map((seat) => {
      const own = holdings
        .filter((holding) => holding.seat_id === seat.id)
        .map((holding) => ({
          id: holding.id,
          cardId: holding.card_id,
          kind: holding.kind,
          face: holding.face,
          // Where it is worn, in the slotted variant. Public like the card
          // itself (5.2): what somebody has on is exactly what you look at
          // before deciding whether to attack them.
          slot: (holding.slot ?? null) as Slot | null,
          // Public, and deliberately so: a card conjured for a test is the one
          // thing at this table that is not part of the game, and hiding that
          // from the other players would be the wrong secret to keep.
          granted: holding.granted,
        }));

      // Concealment is applied HERE, on the server, and not by hiding things in
      // the browser: a player's spells (9.3) must never be sent to another
      // player's device at all. Totals are still reported in full, because a
      // character's strength is public even when the source of it is not.
      const seen = visibleTo(own, { own: mine?.id === seat.id, mode: game.mode });
      // Asked of the same reading the commands enforce against, rather than
      // worked out again here. In slotowy a card only counts where it is worn,
      // so the totals every device sees come from what is on the character and
      // not from the pack (see `inEffect`) — and `parametr` is the character's
      // number rather than their fight strength. 1.5's example is exactly that
      // distinction: the Troll's "parametr Miecza" is 8 and he is worth 11
      // "podczas walki", and it is the 8 that belongs on his card. Both are
      // sent, because the rulebook quotes both and a player about to pick a
      // fight is asking about the other one.
      //
      // `statuses` folds the stored effects together with the four ad-hoc
      // columns the turn engine reads, so the browser gets one list and never
      // has to know there were two halves.
      const view = seatView(table, seat.id);
      // 1.2 and 2.2 keep these off the żetony, exactly as they keep a
      // Przedmiot's points off them: an effect is added at read time and never
      // written into own points, or it would outlive its own expiry.
      const spell = bonusFrom(view.statuses);

      const lastSeen = seat.seen_at ? Date.parse(seat.seen_at) : 0;
      return {
        ...seat,
        // Worked out here rather than in the browser so every device agrees on
        // who is present, whatever its own clock says.
        // Only a seat that has been heard from and then went quiet is away. A
        // seat that never checked in has no device behind it by design — the
        // host added it in companion mode — and calling that "nieobecny" made
        // a fresh lobby look like a room everybody had walked out of.
        away: seat.abandoned_at === null && lastSeen > 0 && now - lastSeen > AWAY_AFTER_MS,
        holdings: seen.cards,
        hidden_count: seen.hiddenCount,
        sword_total: view.parametr.miecz + spell.miecz,
        magic_total: view.parametr.magia + spell.magia,
        // 2.6, worked out here for the same reason the totals are: this is the
        // number the server refuses a draw against, so it is the number to
        // show. Deliberately *not* off `magic_total` — a spell's own bonus is
        // not in the basis the enforcement uses, and a cap that moved when a
        // Zaklęcie landed would be a cap nothing honoured. See `fromCards` for
        // why a wand in the pack counts as much as one on the body.
        spell_capacity: view.spellCapacity,
        sword_in_fight: view.walka.miecz + spell.miecz,
        magic_in_fight: view.walka.magia + spell.magia,
        // What a player is shown beside their name, already worked out: the
        // browser gets marks, not a modelling problem.
        effects: view.statuses.map((status) => ({
          id: status.id,
          // The card that put it there, so the browser can draw its picture
          // rather than a shape standing in for it.
          source: status.source,
          ...markOf(status),
        })),
      };
    }),
  };
}
