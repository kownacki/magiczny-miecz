/** What one device is sent, and everything the others are not. */

import type { TurnState } from "@/lib/engine/stack";
import { suppressesSpells, visibleTo } from "@/lib/engine/holdings";
import { fightsForYou } from "@/lib/engine/abilities";
import { spokenSpell } from "@/lib/engine/status";
import { whyNoSpells } from "@/lib/engine/spells";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import { foldStatuses } from "@/lib/engine/statusRows";
import { cardName } from "@/lib/engine/polish";
import type { Slot } from "@/lib/engine/slots";
import { shopStock } from "./commands/draw";
import { cardLending, seatView, turnQueueOf } from "./commands/seat";
import type { Snapshot } from "./change";
import {
  AWAY_AFTER_MS,
} from "./commands/presence";

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
  /** Why no Zaklęcie may be spoken at all right now — see `whyNoSpells`. */
  spells_blocked: string | null;
  sword_in_fight: number;
  magic_in_fight: number;
  effects: { id: string; source: string | null; label: string; when: string }[];
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
   * A Zaklęcie spoken and waiting to be answered (9.6), or null.
   *
   * Every device gets it, because answering it is anybody's to do and the
   * window closes on a clock: the browser has to be able to show what is
   * waiting and how long is left.
   */
  spoken: {
    spell: string;
    name: string;
    /** The seat that spoke it. */
    by: number | null;
    /** The seat it was aimed at, where it was aimed at one. */
    at: number | null;
    until: number;
  } | null;
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
  /**
   * `granted` travels because the wrench does. A Karta the test console
   * conjured is marked wherever it is drawn — in a hand, in a slot, in the
   * turn, in a fight — and a card lying on an Obszar was the one place the
   * mark could not reach, because the flag stopped at the server.
   */
  fieldCards: {
    id: string;
    fieldId: string | null;
    cardId: string;
    granted?: boolean;
    /** What is left beside a Miejsce that lays out points (16.7). */
    pool?: number;
  }[];
  /** Loose Sztuki Złota on an Obszar, by field (12.1). Public — 16.8's reasoning. */
  fieldGold: { fieldId: string; gold: number }[];
  stock: Record<string, number>;
  seats: EnvelopeSeat[];
}

/**
 * The turn state with anything one seat alone may see taken out of it.
 *
 * The third door the deck's secret could walk through, after `deck` and
 * `seed`. An `ask` frame holds the Karty it lifted off the Zaklęcia — that is
 * what makes the offer honest, since nothing drawn in between can change what
 * was offered — and those cards are the top of a pile 9.3 and `withoutDeck`
 * both keep. So the refs are emptied for everybody but the seat being asked,
 * and `count` travels in their place: the table can see two cards held up, and
 * that is all it may see.
 *
 * Everything else passes through. A `fight`, a `loop`, a suspended `script`
 * are all public — they are what is happening on the board.
 */
export function asSeenBy(state: TurnState, mySeatId: string | null): TurnState {
  const at = state.stack.length - 1;
  const frame = state.stack[at];
  if (!frame || frame.phase !== "ask" || frame.seatId === mySeatId) return state;
  const shut = { ...frame, question: { ...frame.question, refs: [] } };
  return { stack: [...state.stack.slice(0, at), shut] };
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
  const { game, seats, users, holdings, fieldCards, fieldGold } = table;
  const me = users.find((one) => one.id === myUserId) ?? null;
  // The seat *they are driving*, which is what decides whose hidden cards they
  // may see (9.3). A spectator drives none and sees none.
  const mine =
    me?.seat_index === null || me === null
      ? null
      : (seats.find((seat) => seat.seat_index === me.seat_index) ?? null);

  /**
   * The turn order walked once, for the whole envelope.
   *
   * Every seat's countdowns are dated against the same walk, so two cards on
   * screen at the same moment cannot disagree about which round it is.
   */
  const queue = turnQueueOf(table);

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

  /**
   * The Zaklęcie in the air, if one is.
   *
   * A table-level fact and not a mark on a seat: what everybody needs to know
   * is that something was spoken, by whom, and how long is left to answer it —
   * and 12.5 makes it public anyway („cały stół dowiaduje się, co zostało
   * wypowiedziane"), so there is nothing here 9.3 would hide.
   *
   * Read off the same status the engine settles, so the banner and the command
   * cannot disagree about whether anything is waiting.
   */
  const spoken = table.effects
    .map((row) => ({ row, said: spokenSpell([row]) }))
    .find((one) => one.said !== null && one.said.until > now);

  return {
    game: { ...withoutDeck(game), turn_state: asSeenBy(game.turn_state, mine?.id ?? null) },
    spoken: spoken?.said
      ? {
          spell: spoken.said.spell,
          name: cardName(spoken.said.spell),
          by: seats.find((seat) => seat.id === spoken.row.seat_id)?.seat_index ?? null,
          at: spoken.said.target?.seatIndex ?? null,
          until: spoken.said.until,
        }
      : null,
    me: me ? seenOf(me) : null,
    users: users.map(seenOf),
    mySeatIndex: mine?.seat_index ?? null,
    // The row id travels too: picking a card up names *which* card, and a
    // field can hold two of the same Przedmiot.
    fieldCards: fieldCards.map((row) => ({
      id: row.id,
      fieldId: row.field_id,
      cardId: row.card_id,
      ...(row.granted ? { granted: true as const } : {}),
      // Sent only where there is one, so every other Karta stays three fields
      // wide on the wire. What is left beside a Drzewo Życia is public — 16.8
      // makes what lies on an Obszar visible to everybody, and a well with one
      // fruit on it is exactly the sort of thing a table plans around.
      ...(row.pool !== null ? { pool: row.pool } : {}),
    })),
    fieldGold: fieldGold.map((row) => ({ fieldId: row.field_id, gold: row.gold })),
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
        /**
         * Why the whole rack is shut, when it is — the sentence `castSpell`
         * would refuse with, worked out here for the same reason
         * `spell_capacity` is: the greying and the refusal have to rest on one
         * basis rather than two that usually agree.
         *
         * A Postać Zamieniona w Kamień was the case that showed it missing.
         * Every Zaklęcie in its hand was drawn live with „rzuć" under it, and
         * 20.5 only came out when somebody pressed one.
         */
        spells_blocked: whyNoSpells({
          fieldName: suppressesSpells(seat.field_id)
            ? (FIELDS.get(seat.field_id as FieldId)?.name ?? seat.field_id)
            : null,
          statuses: view.statuses,
          abilities: view.abilities,
        }),
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
            : cardLending(view, (held) => fightsForYou(held) !== null),
        /**
         * What a player is shown beside their name, already worked out: the
         * browser gets rows, not a modelling problem.
         *
         * Folded here rather than in the browser because both halves of the
         * answer need things a device does not have. Stacking is a rule — what
         * a second Krąg Płomieni did is `stackingOf`'s to say, not a panel's —
         * and the round an effect lapses in needs the whole turn order walked,
         * while a device is sent one seat at a time. So the words arrive
         * finished and the panel draws them.
         *
         * `mine` is the seat this device is driving, and it decides one word:
         * a countdown lapsing after its holder's turn reads "po twojej turze"
         * on your own card and "po turze Postaci" on everybody else's.
         */
        effects: foldStatuses(view.statuses, {
          queue,
          seatIndex: seat.seat_index,
          mine: mine?.id === seat.id,
        }).map((row) => ({
          id: row.key,
          // The card that put it there, so the browser can draw its picture
          // rather than a shape standing in for it.
          source: row.from[0].source,
          glyph: row.mark.glyph,
          tone: row.mark.tone,
          // Not `markOf`'s own title: that one ends at `describeEnd`, which
          // knows the duration and not the round it falls in.
          title: `${row.label} — ${row.when}`,
          label: row.label,
          when: row.when,
          count: row.count,
          stacking: row.stacking,
          certainty: row.lapse?.certainty ?? null,
        })),
      };
    }),
  };
}
