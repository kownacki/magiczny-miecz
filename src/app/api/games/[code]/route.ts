import { NextResponse } from "next/server";
import {
  AWAY_AFTER_MS,
  deleteGame,
  fieldCardsFor,
  findGame,
  holdingsFor,
  markSeen,
  seatsFor,
  sweepLobby,
  verifySeat,
} from "@/lib/game/store";
import { visibleTo } from "@/lib/engine/holdings";
import { seatView } from "@/lib/game/commands/seat";
import type { GameRow } from "@/lib/game/store";
import type { TurnPhase } from "@/lib/engine/turn";
import { bonusFrom, markOf } from "@/lib/engine/status";
import { effectsFor, shopStock } from "@/lib/game/turnStore";
import type { Slot } from "@/lib/engine/slots";

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
function withoutDeck(game: { deck: unknown }) {
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
 * The table view's state.
 *
 * Deliberately carries no claim tokens and no holdings: this is rendered on a
 * screen every player can see, and spells are held concealed under 9.3.
 *
 * A device may pass its own token to be told which seat it owns. That answer
 * comes from the server rather than being worked out in the browser, because
 * the browser is never sent anyone's token — including, in the seat list, its
 * own — so it has nothing to compare against.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  // Everybody in the poczekalnia is polling, so this is where a table finds out
  // that somebody closed their tab — and clears their seat, or itself if there
  // is nobody left.
  if (await sweepLobby(game.id, game.status)) {
    return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get("token");

  // Fetched together rather than one after another. This is the busiest request
  // in the app — every device asks for it every couple of seconds — and these
  // four do not depend on each other, so running them in sequence spent four
  // round trips to make one answer.
  const [mine, seats, holdings, fieldCards, effects] = await Promise.all([
    token ? verifySeat(game.id, token) : Promise.resolve(null),
    seatsFor(game.id),
    holdingsFor(game.id),
    // Face up on the board by rule 16.8, so there is nothing to conceal and
    // every seat is sent the same list.
    fieldCardsFor(game.id),
    // Public too: what somebody is under is exactly what you weigh before
    // deciding whether to attack them.
    effectsFor(game.id),
  ]);

  // Everything the seat views are read off, in the shape a command reads. Not
  // a `loadSnapshot` call: the five lists are already in hand from the fetch
  // above, and this request is the busiest in the app. `journalSeq` is nothing
  // to a reader, which is why it is the only field made up.
  const table = {
    game: game as GameRow & { turn_state: TurnPhase },
    seats,
    holdings,
    fieldCards,
    effects,
    journalSeq: 0,
  };

  // The poll is the heartbeat. A device asking for the state is a device still
  // at the table, so no separate ping is needed — and a seat that stops asking
  // goes quiet by itself, which is the difference between somebody who left and
  // somebody whose tab was closed.
  //
  // Not written on every poll. Presence is judged against AWAY_AFTER_MS, so a
  // timestamp refreshed several times inside that window says nothing new — and
  // writing it anyway meant a row update per device per poll, forever, for a
  // table sitting still. It is also written whenever the page said goodbye, so
  // that a reload cancels it.
  if (mine) {
    const row = seats.find((seat) => seat.id === mine.id);
    const lastSeen = row?.seen_at ? Date.parse(row.seen_at) : 0;
    if (row?.left_at || Date.now() - lastSeen > AWAY_AFTER_MS / 3) await markSeen(mine.id);
  }

  return NextResponse.json({
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
    stock: await shopStock(game.id, { holdings, fieldCards }),
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
        away:
          seat.abandoned_at === null && lastSeen > 0 && Date.now() - lastSeen > AWAY_AFTER_MS,
        holdings: seen.cards,
        hidden_count: seen.hiddenCount,
        miecz_total: view.parametr.miecz + spell.miecz,
        magia_total: view.parametr.magia + spell.magia,
        // 2.6, worked out here for the same reason the totals are: this is the
        // number the server refuses a draw against, so it is the number to
        // show. Deliberately *not* off `magia_total` — a spell's own bonus is
        // not in the basis the enforcement uses, and a cap that moved when a
        // Zaklęcie landed would be a cap nothing honoured.
        // Deliberately *not* off `magia_total` — a spell's own bonus is not in
        // the basis the enforcement uses, and a cap that moved when a Zaklęcie
        // landed would be a cap nothing honoured. See `fromCards` for why a
        // wand in the pack counts as much as one on the body.
        spell_capacity: view.spellCapacity,
        miecz_walka: view.walka.miecz + spell.miecz,
        magia_walka: view.walka.magia + spell.magia,
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
  });
}

/**
 * Removes a table for good.
 *
 * See `deleteGame`: unguarded on purpose, because every table here is public
 * and the code is the only lock. The confirmation lives in the interface, where
 * the person doing it can read what it says.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  try {
    await deleteGame(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
