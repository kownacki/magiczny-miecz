"use client";

/**
 * What the turn is, read once for this device: whose it is, what frame is on
 * screen, whether the sheet applies, and the two Postacie a Karta is read for.
 */

/**
 * Why this is a function and not part of the component.
 *
 * These lived inside `page.tsx`, between the early returns and the JSX, as
 * three hundred lines of `const` that every block below closed over. None of
 * them is state and none of them is React: each is a reading of the table as
 * it stands — the same reading the server refuses against, in most cases —
 * and the only thing that kept them out of a test was the component around
 * them. Pulled out, they are a pure function of the table plus the four
 * things this device holds that change the reading: the die it just threw,
 * whether the deal has been looked at, whether the sheet is folded, and which
 * seat it is.
 *
 * The names are the ones the screen has always used, so the blocks that read
 * them did not have to change.
 */

import { top } from "@/lib/engine/stack";
import { panelFor } from "@/lib/view/frames";
import { momentsIn } from "@/lib/engine/spells";
import { factsIn, windowsFor } from "@/lib/engine/turnWindows";
import { nodeAt } from "@/lib/engine/resolve";
import { reachableBy } from "@/lib/engine/losses";
import { whyNotCollectHere } from "@/lib/engine/holdings";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { characterName } from "@/lib/engine/polish";
import { genderOf } from "@/lib/engine/characters";
import type { EqMode, Slot } from "@/lib/engine/slots";
import type { OwnPoints, Reader } from "@/lib/engine/abilityText";
import { asNature, type Seat } from "./table";
import {
  boardCards as allBoardCards,
  otherSeats,
  tableScreenHolder as holderOfTableScreen,
} from "./table-view";
import type { FieldCard, Game, Person } from "./use-table";

/** The table as the server said it, and what this device holds over it. */
export interface TurnViewInput {
  game: Game;
  seats: Seat[];
  fieldCards: FieldCard[];
  users: Person[];
  me: Person | null;
  mySeatIndex: number | null;
  /** Slot moves this device has made and the server has not confirmed yet. */
  moved: Record<string, Slot | null>;
  /** The die this device threw and is holding until „Dalej" — see `showDie`. */
  rolled: { cardId: string; face: number; did: string[] } | null;
  /** The deal is still being looked at, so the sheet is held back. */
  revealing: boolean;
  /** The sheet is folded away, on this device. */
  folded: boolean;
}

export type TurnView = ReturnType<typeof turnViewOf>;

export function turnViewOf({
  game,
  seats,
  fieldCards,
  users,
  me,
  mySeatIndex,
  moved,
  rolled,
  revealing,
  folded,
}: TurnViewInput) {
  const mySeat = seats.find((seat) => seat.seat_index === mySeatIndex);
  const amHost = me?.isHost === true;

  // The shared screen in the middle of the table. Whoever's turn it is reaches
  // over and taps it, so it drives the active player rather than sitting idle
  // saying "waiting".
  const isTableScreen = amHost && game.mode === "companion";
  const tableScreenHolder = holderOfTableScreen(users);

  // Cards in play this turn. A fight keeps the stack it interrupted, so the
  // panel does not empty out mid-combat.
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const playing = game.status === "playing";

  /**
   * The windows the turn is open for, for the spell hand (9.6, 17.3).
   *
   * Read off the whole turn state rather than the phase alone: a fight before
   * the dice and a fight after the first one are the same phase and are not
   * the same moment, and neither is a field with a card just turned over.
   */
  // The same reading the server refuses a cast against (9.1), not a second one
  // that agrees with it most of the time.
  const now = game ? momentsIn(top(game.turn_state)) : ["dowolna-chwila" as const];

  const mine = mySeat
    ? {
        ...mySeat,
        holdings: mySeat.holdings.map((held) =>
          held.id in moved ? { ...held, slot: moved[held.id] } : held,
        ),
      }
    : mySeat;
  const others = otherSeats(seats, mine?.id);
  const boardCards = allBoardCards(fieldCards, seats);

  /**
   * What this turn is offering, as a short list of windows.
   *
   * The reading of the rules is `windowsFor`'s — 16.4's order, and which of
   * these are not offers at all. What is left here is turning the turn state
   * into the plain facts it asks about.
   */
  /**
   * The frame on screen, bound once. Everything below reads the top of the
   * stack through this one name — the narrowing needs a single binding, and a
   * page that asked `top()` at every use would be that many chances to mix
   * frames after a poll.
   */
  const turnState = top(game.turn_state);
  const turnWindows = active ? windowsFor(factsIn(turnState, active.field_id)) : [];

  /**
   * The die on the Obszar's frame, which every device holds its sheet on.
   *
   * The face used to reach the player who threw it on the reply to their own
   * request and nobody else at all — see `rolled` on the field frame, which is
   * where it lives now. Read from under whatever is on top: a Karta suspended
   * mid-walk has pushed a `script` frame over the Obszar, and that Karta's die
   * is exactly the one worth showing.
   *
   * The lines under it stay the reply's, and only for the device that got one:
   * „Zaklęcie: KAMIEŃ FILOZOFICZNY" is the card a 1 turned out to be, which no
   * frame carries. Matched on the face as well as the Karta, so a second throw
   * of the same card cannot wear the first one's outcome.
   */
  const onTheFrame = [...game.turn_state.stack]
    .reverse()
    .find((frame) => frame.phase === "field");
  const beneath = onTheFrame?.phase === "field" ? onTheFrame : null;
  const shownRoll =
    beneath?.rolled
      ? {
          ...beneath.rolled,
          /**
           * Whether the throw is still waiting to be read.
           *
           * The mark stands until the Karta finishes, which is longer than the
           * wait: „Dalej" runs the row, and a row that opens a fight or asks
           * which Przedmiot goes leaves the face standing over the question it
           * raised. `held` on the frame is the narrower fact — nothing has run
           * yet — and it is what decides whether the sheet holds this Karta up
           * and offers the button, rather than merely showing the number above
           * whatever came next.
           */
          held: turnState.phase === "script" && turnState.held === true,
          did:
            rolled?.cardId === beneath.rolled.cardId && rolled.face === beneath.rolled.face
              ? rolled.did
              : [],
        }
      : null;

  /**
   * A loss the Karta is waiting on, asked on the Karta rather than over it.
   *
   * „Tracisz 1 Przedmiot" leaves which one to the holder, so the walk stops and
   * the turn suspends into a `script` frame — and `ScriptFramePanel` had no
   * control for it, which is a modal saying „answer this in the console" over a
   * sheet that has the pack right there. It goes where the die that caused it
   * went: in the Karta's own panel, in the place „Rzuć kostką" was standing.
   *
   * Built here because this is where the seats are, and built on *every*
   * device: an index into a pack is only an answer if both ends count the same
   * cards in the same order, and the watchers need the same list to read what
   * was chosen off the announcement. The three ways it can fail to be that
   * list are all refusals rather than guesses.
   *
   * - **A hand this device cannot see in full** (9.3). Only Zaklęcia are ever
   *   concealed, so only a loss of one can be short — and a short list numbers
   *   differently from the server's.
   * - **More than one card at a time.** `chooseLosses` takes its picks against
   *   a pool that shrinks between them, so two answers are two indices into two
   *   different lists; no card in the box asks it, and guessing at the shape
   *   would be worse than the console.
   * - **Nothing of that kind to lose**, which the server settles by itself.
   */
  const losing = (() => {
    /* Not while the frame is *held*: the cursor then points at a row the die
       chose and nothing has run yet, so the question it will ask is not being
       asked. „Dalej" is what turns one into the other — see `held`. */
    if (turnState.phase !== "script" || turnState.held || !turnState.cardId) return null;
    const asking = nodeAt(turnState.effect, turnState.cursor);
    if (asking?.op !== "strata" || (asking.count ?? 1) !== 1) return null;
    const kind = reachableBy(asking.co);
    if (!kind) return null;
    const seat = seats.find((one) => one.id === turnState.seatId);
    if (!seat || (kind === "spell" && seat.hidden_count > 0)) return null;
    const cards = seat.holdings.filter((held) => held.kind === kind);
    return cards.length > 0 ? { cardId: turnState.cardId, kind, cards } : null;
  })();

  /**
   * Whether the turn's own sheet has anything to show.
   *
   * A fight, a direction to choose, the Most, or an Obszar with cards on it —
   * and a field nobody may walk past, which opens it with nothing drawn because
   * the Karczma happens to you the moment you arrive.
   */
  const panel = panelFor(turnState);
  const sheetApplies =
    active !== undefined &&
    active !== null &&
    (panel.sheet === "always" ||
      /**
       * Or the sheet is holding a Karta, whatever frame is on top of it.
       *
       * A `script` frame draws no sheet — that is what the panel over it was
       * for — and both of these are the sheet standing in for that panel: a die
       * whose face has not been read, and a loss being chosen against the pack.
       * Both belong on the Karta they happened to, so the Karta stays up.
       */
      shownRoll?.held === true ||
      losing !== null ||
      (panel.sheet === "when-drawn" &&
        turnState.phase === "field" &&
        /**
         * Not while the Obszar still owes Karty (13.4).
         *
         * The sheet opened on `drawn.length > 0`, which is true from the moment
         * a character stops on a square that already had something lying on it
         * — so Płaskowyż Mgieł with two Karty on it and a third still owed put
         * the Wilk up with "Walcz" under him before the deal was finished.
         * `refuseWhileUndrawn` refuses that on the server; this is so the
         * button is not there to be pressed.
         *
         * What the player sees instead is the Obszar's own window, which is
         * where the count and the deal are. The sheet takes over the moment
         * there is nothing left to turn over.
         */
        turnState.draw <= 0 &&
        // And not while the deal is still being looked at — see `revealing`.
        !revealing &&
        (turnState.drawn.length > 0 ||
          compulsoryOffer(active.field_id, turnState.resolved ?? []) !== null)));

  /**
   * Whether anything of the turn is on screen at all.
   *
   * What the FAB is the absence of: while a window is open there is no need for
   * a way back into one, and while none is, there has to be — on a quiet Obszar
   * nothing opens by itself and ending the turn is inside the Obszar's window.
   *
   * The Obszar used to count, and stopped when it became a drawer. A modal over
   * the table really is the turn being on screen; a drawer beside the board is
   * one panel among three, and it can be showing any square on the map rather
   * than the one the turn is on. So the pill went away exactly when a player
   * wandered off to read about somewhere else — the moment it is most useful,
   * because pressing it is what brings them back (`openField(active.field_id)`).
   */
  const turnWindowOpen = sheetApplies && !folded;
  // Only the "pole" phase has a stack of drawn cards. Narrowed once here for
  // the controls further down that ask how much of the draw is left; what the
  // turn is *offering* is `factsIn`'s reading, not this one.
  const onField = turnState.phase === "field" ? turnState : null;

  /**
   * What this Obszar still owes, in the shape `dutiesBeforeEnding` asks for.
   *
   * The same reading the kolejka strip is drawn from and the same one
   * `finishTurn` refuses on, so the queue, the disabled button and the server's
   * refusal cannot tell a player three different things. Fought counts as
   * settled beside resolved: 17.4 ends a Wróg the moment the dice are compared,
   * won or lost.
   */
  const owedHere = onField
    ? {
        drawn: onField.drawn,
        settled: [...(onField.resolved ?? []), ...(onField.fought ?? [])],
      }
    : null;

  /**
   * Which equipment variant the table plays, named once.
   *
   * Written out as a ternary in four places, because `games.eq_mode` is a
   * database column and so a `string`. Narrowed here, at the one boundary it
   * crosses, the way every other id in this codebase is.
   */
  const eqMode: EqMode = game?.eq_mode === "slots" ? "slots" : "classic";


  /**
   * The two Postacie a card can be read for, built once.
   *
   * `viewer` is whoever is at this device and covers the whole table: a hover
   * in the Księga, on a tile, on a figure. `dealt` is the Postać the Karty on
   * the Obszar were dealt to, and covers the sheet alone — a WRÓŻKA in their
   * kolejka is a WRÓŻKA for *them*, and asking the viewer's Natura about it
   * answers a question nobody asked. They are usually the same Postać and
   * differ exactly when you are watching somebody else's turn.
   */
  /**
   * How the table refers to somebody: „Marcin (MAG)".
   *
   * Both halves, because either alone is ambiguous — two players may have taken
   * the same kind of Postać in different games, and one player may be running
   * two seats on a table screen. The name says whom to look at and the Karta
   * says what they are.
   */
  const reads = (seat: { player_name?: string | null; seat_index: number; character_id?: string | null }) =>
    `${seat.player_name ?? `Miejsce ${seat.seat_index + 1}`} (${characterName(seat.character_id ?? "")})`;

  /** The four numbers an offer can move, plus the two floors it may not cross. */
  const pointsOf = (seat: {
    sword_own: number;
    magic_own: number;
    life: number;
    gold: number;
    sword_floor: number;
    magic_floor: number;
  }): OwnPoints => ({
    sword: seat.sword_own,
    magic: seat.magic_own,
    life: seat.life,
    gold: seat.gold,
    swordFloor: seat.sword_floor,
    magicFloor: seat.magic_floor,
  });

  const viewer: Reader | null = mySeat
    ? {
        nature: asNature(mySeat.nature),
        aggression: mySeat.aggression,
        name: reads(mySeat),
        gender: genderOf(mySeat.character_id),
        mine: true,
        points: pointsOf(mySeat),
      }
    : null;
  const dealt: Reader | null = active
    ? {
        nature: asNature(active.nature),
        aggression: active.aggression,
        name: reads(active),
        gender: genderOf(active.character_id),
        mine: active.id === mySeat?.id,
        points: pointsOf(active),
      }
    : null;

  /**
   * 12.1's two exceptions, for the Obszar the active character is standing on.
   *
   * Computed here rather than in the window because both lists live here, and
   * reading one of them is how this rule has been got wrong four times: a Karta
   * on the square you are standing on is lifted out of `field_cards` into the
   * turn's own `drawn` for the length of that turn, and which of the two it is
   * in is nothing a player can see. `whyNotCollectHere` counts; this merges.
   *
   * The sentence is the engine's, so the greyed shop says exactly what the
   * server would have refused with.
   */
  const blockedHere =
    active && onField
      ? whyNotCollectHere(
          [
            ...fieldCards
              .filter((card) => card.fieldId === active.field_id)
              .map((card) => ({ cardId: card.cardId })),
            ...onField.drawn.map((card) => ({ cardId: card.cardId })),
          ],
          [...(onField.resolved ?? []), ...(onField.fought ?? []), ...(onField.beaten ?? [])],
          onField.draw,
        )
      : null;

  return {
    mySeat,
    amHost,
    isTableScreen,
    tableScreenHolder,
    active,
    playing,
    now,
    mine,
    others,
    boardCards,
    turnState,
    turnWindows,
    beneath,
    shownRoll,
    losing,
    panel,
    sheetApplies,
    turnWindowOpen,
    onField,
    owedHere,
    eqMode,
    viewer,
    dealt,
    blockedHere,
  };
}
