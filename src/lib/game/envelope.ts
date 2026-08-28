/** What one device is sent, and everything the others are not. */

import { visibleTo } from "@/lib/engine/holdings";
import { fightsForYou, heldAbilities } from "@/lib/engine/abilities";
import { markOf } from "@/lib/engine/status";
import type { Slot } from "@/lib/engine/slots";
import { shopStock } from "./commands/draw";
import { seatView } from "./commands/seat";
import type { Snapshot } from "./change";
import { AWAY_AFTER_MS } from "./commands/lobby";

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

/**
 * Somebody at the table, as every device may see them.
 *
 * Public, all of it: who is here, what they are called, which chair they are
 * in, who runs the table and who has said they are ready are the things people
 * read off each other across a table, and none of them is a secret under 9.3.
 *
 * `device_id` is not here and never travels. It says which *browser* somebody
 * is, which is a fact about a person's machine rather than about the game, and
 * the only thing that ever needs it is the browser it belongs to.
 */
export interface EnvelopeUser {
  /** Four characters, and the only handle somebody driving no seat has. */
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  /** The chair they are driving; null is watching, which is a thing to be. */
  seatIndex: number | null;
  /** True only of somebody heard from once and then silent. See `away`. */
  away: boolean;
}

export interface Envelope {
  game: Record<string, unknown>;
  /**
   * Who this device is, as far as the table is concerned — and null when the
   * table has never heard of it.
   *
   * The difference this draws is the one the browser could not draw before and
   * kept getting wrong. A device holding a token and driving no seat used to be
   * indistinguishable from a device whose token had gone stale, because
   * `mySeatIndex` was null for both — so watching a table was rendered as
   * having been thrown off one. Null here means exactly one thing: whoever you
   * were, you are not at this table any more.
   */
  me: EnvelopeUser | null;
  /** Everybody here, seated or watching, in join order. */
  users: EnvelopeUser[];
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
export function withoutDeck<T extends { deck: unknown; seed?: string | null }>(game: T) {
  /**
   * The seed goes with the deck, and for exactly the same reason.
   *
   * Every shuffle in a game is a function of the seed and the revision it
   * happens at (`prng.ts`), so a device holding the seed can work out the order
   * of a pile it is not allowed to see — the same secret this function exists
   * to keep, arriving by a different door. It was passed straight through with
   * the rest of the row from the day the column was added.
   */
  const { deck, seed, ...rest } = game;
  void seed;
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
  /** Whoever is asking. Null is somebody watching, who is owed no secrets. */
  myUserId: string | null,
  now: number,
): Envelope {
  const { game, seats, users, holdings, fieldCards } = table;
  const me = users.find((one) => one.id === myUserId) ?? null;
  // The seat *they are driving*, which is what decides whose hidden cards they
  // may see (9.3). A spectator drives none and sees none.
  const mine =
    me?.seat_index === null || me === null
      ? null
      : (seats.find((seat) => seat.seat_index === me.seat_index) ?? null);

  /**
   * Away is judged here, once, for everybody.
   *
   * Every device compared its own clock against a timestamp before this, so a
   * laptop half a minute out disagreed with the room about who was present.
   */
  const seenOf = (one: (typeof users)[number]) => ({
    id: one.id,
    name: one.name,
    isHost: one.is_host,
    ready: one.ready,
    seatIndex: one.seat_index,
    away: one.seen_at !== null && now - Date.parse(one.seen_at) > AWAY_AFTER_MS,
  });

  return {
    game: withoutDeck(game),
    me: me ? seenOf(me) : null,
    users: users.map(seenOf),
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
    stock: shopStock({ holdings, fieldCards, game }),
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
      // The effect bonuses used to be added here, and here only — so the
      // browser showed a Miecz the rules never fought with. They are inside
      // `seatView` now, which is what every rule reads, and this is a plain
      // read of one number rather than two halves added up on the way out.

      // Presence is the driver's, not the chair's: a seat with nobody in it is
      // not "away", it is empty, and those are different things to look at.
      const driver = users.find((one) => one.seat_index === seat.seat_index) ?? null;
      return {
        ...seat,
        // Worked out here rather than in the browser, so every device agrees
        // on who is present whatever its own clock says.
        //
        // Only somebody heard from and then gone quiet is away. A chair with
        // nobody in it is not away — it is empty, and the two look nothing
        // alike to a player deciding whether to wait. This used to be a test on
        // the seat, which needed `no_device` to keep a chair the host had
        // filled in by hand from making a fresh lobby look like a room
        // everybody had walked out of. There is no flag to keep now: the
        // question is asked of a person, and where there is no person there is
        // no question.
        player_name: driver?.name ?? null,
        /** The driver's id, so a chair and a person can be matched up. */
        driver_id: driver?.id ?? null,
        away: driver !== null && seenOf(driver).away,
        holdings: seen.cards,
        hidden_count: seen.hiddenCount,
        sword_total: view.parametr.miecz,
        magic_total: view.parametr.magia,
        // 2.6, worked out here for the same reason the totals are: this is the
        // number the server refuses a draw against, so it is the number to
        // show. Deliberately *not* off `magic_total` — a spell's own bonus is
        // not in the basis the enforcement uses, and a cap that moved when a
        // Zaklęcie landed would be a cap nothing honoured. See `fromCards` for
        // why a wand in the pack counts as much as one on the body.
        spell_capacity: view.spellCapacity,
        sword_in_fight: view.walka.miecz,
        magic_in_fight: view.walka.magia,
        /**
         * The Przyjaciel doing the fighting, when it is not the character.
         *
         * Only the Rycerz, and the browser is told rather than left to work it
         * out, because the number above is the thing that needs explaining: his
         * 3 and 3 replace the character's own, which for most Postacie is a
         * figure that goes *down* when he joins. Unexplained that reads as a
         * bug in the app rather than as the card doing what it says.
         */
        fights_for_you:
          fightsForYou(view.abilities) === null
            ? null
            : (view.holdings.find((held) => fightsForYou(heldAbilities([held.cardId])))?.cardId ??
              null),
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
