/** Getting a character onto the board and around it: the setup deal, the movement die, and the walk (3.2, 9.5, 10.2, 11.10, 13.4, 16.8). */

import { FIELDS, requireFieldId } from "@/lib/engine/board";
import type { FieldId } from "@/lib/engine/board";
import { heldAbilities, opensTheWayTo } from "@/lib/engine/abilities";
import { movementCap, moveMultiplier } from "@/lib/engine/status";
import { statusesOf } from "./turn";
import { asCharacterId, startingKit, withoutItems } from "@/lib/engine/characters";
import { type EqMode, type Slot } from "@/lib/engine/slots";
import { slotsOnArrival } from "@/lib/engine/holdings";
import type { Nature } from "@/data/types";
import { fromTheShop, stockLeft } from "@/lib/engine/stock";
import {
  afterMove,
  afterRoll,
  atBridge,
  bridgeBlocked,
  startTurn,
} from "@/lib/engine/turn";
import type { TurnCard } from "@/lib/engine/state";
import { only, replaceTop, top } from "@/lib/engine/stack";
import { EVENTS, type Decks } from "../decks";
import {
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import type { GameRow, SeatRow } from "../store";
import { activeSeat, eqModeOf, refuseWhileHeld, refuseWhileOverLimit } from "./seat";
import { refuseWhileBeastAwaits } from "./beast";
import { driverOf, nameOfSeat } from "./lobby";

/* --------------------------------------------------------------------------
 * Starting the game.
 * ----------------------------------------------------------------------- */

/**
 * How many Zaklęcia a seat is still owed from setup, once the game is open.
 *
 * See `startGame`: the spell deal is the one part of setup this cannot do.
 */
export interface OwedSpells {
  seatId: string;
  spells: number;
}

export interface StartGame {
  /**
   * The two piles, already shuffled.
   *
   * A shuffle is randomness, and the only randomness a command may reach for is
   * `RandomPort`, which deals in single dice and nothing else. Rather than
   * inventing a second port for one call, the caller shuffles — `freshDecks()`
   * — and hands the result in, which is the same bargain the dice make: the
   * rule decides *whether* there is a deck, the edge decides what order it is
   * in. A companion table's piles are thrown away here, which costs one shuffle
   * nobody sees and keeps "only a simulation owns a deck" a rule rather than a
   * caller's habit.
   */
  decks: Decks;
}

/**
 * Opens the table (3.2, 9.5).
 *
 * Two things happen before this and cannot happen inside it.
 * `dealCharacters({ to: "surprises" })` turns every "surprise me" into a real
 * Karta Postaci, and takes its own commit so that the snapshot read here is one
 * where everybody is holding a card — a seat still holding the sentinel would
 * be dealt no kit at all. And the Zaklęcia of 9.5 are drawn afterwards: a spell
 * draw checks 2.6's capacity, takes a card off the pile and can reshuffle it,
 * all of which lives in the store's `drawSpell` and would have to be copied to
 * be done here.
 * So this reports who is owed how many and lets the caller draw them, which is
 * also what puts them in the same journal they have always been in.
 *
 * No dice: setup rolls nothing.
 */
export function startGame(
  snapshot: Snapshot,
  command: StartGame,
  ports: CommandPorts,
): Outcome<OwedSpells[]> {
  // `chosen`, not `ready`: having picked a character and having said you are
  // ready are two different things, and conflating them is what let a game
  // start while somebody was still deciding.
  /**
   * Once, and only once.
   *
   * Nothing refused a second `start`, so it dealt the opening Zaklęcia again on
   * top of the ones already held — and the second deal ran until 2.6's cap
   * refused it, leaving a hand made of two deals and an error nobody could act
   * on. A MAG shows it fastest: Magia 5 allows three, it starts with three, and
   * the very first extra card is one too many.
   */
  if (snapshot.game.status === "playing") throw new Error("Gra już się zaczęła.");

  const chosen = snapshot.seats.filter((seat) => seat.character_id);
  // One is enough. The box says 2-6 and the rulebook never states a count at
  // all: the only rule that assumes company is 17.4, where "jeden z pozostałych
  // graczy" throws the enemy's die — and in a simulation the app throws it. The
  // victory condition is beating the Bestia, which one character can do alone.
  if (chosen.length < 1) throw new Error("Do gry potrzeba przynajmniej jednej postaci.");

  // Everybody with a character has to have said so (docs/LOBBY.md). A seat
  // nobody is behind cannot say anything, so it is not asked.
  const dithering = chosen.filter((seat) => {
    const driver = driverOf(snapshot.users, seat.seat_index);
    return driver !== null && !driver.ready;
  });
  if (dithering.length > 0) {
    throw new Error(
      `Nie wszyscy są gotowi: ${dithering
        .map((seat) => nameOfSeat(snapshot.users, seat.seat_index))
        .join(", ")}.`,
    );
  }

  const opened: Changeset = {
    game: {
      status: "playing",
      round: 1,
      active_seat: chosen[0].seat_index,
      turn_state: only(startTurn()),
      // Only a simulation needs a deck. In companion mode the deck is the
      // physical one on the table and the app must not pretend to own it.
      deck: snapshot.game.mode === "simulation" ? command.decks : null,
      ...startedAt(ports.now()),
    },
  };

  // Ten of the twenty-seven characters own something before anyone rolls: the
  // Książę his purse of five and a Hełm, the Mag two Zaklęcia, the Zdobywca a
  // Miecz and a Tarcza. Dealing everyone one Sztuka Złota and nothing else is
  // wrong from the first turn, and wrong in the direction that flattens the
  // characters into each other.
  // `map` handed the index as a second argument, which would have been read as
  // the mode the moment one was added. Named, so it cannot.
  //
  // And only to a seat that has not been dealt already. The console's `pick`
  // goes through `takeNewCharacter` — 4.4's door, which deals the kit because
  // mid-game it has to — so starting a table from the console handed the
  // Błędny Rycerz a second Miecz and a second Zbroja, and two Miecze are two
  // points of Miecz in a fight. Nobody saw it because in klasyczny they were
  // four cards in a pack of four; in slotowy they are two cards in one place.
  //
  // In seat order, and the order matters where 21.2 is in force: the pile holds
  // three Miecze and five characters can be printed with one, so the fourth
  // Karta Postaci to ask simply does not get it. That is the rule and it is
  // meant to feel like the rule — the alternative is conjuring a card the box
  // does not contain.
  const taken: Record<string, number> = {};
  const kits = [...chosen]
    .sort((a, b) => a.seat_index - b.seat_index)
    .map((seat) =>
      snapshot.holdings.some((held) => held.seat_id === seat.id)
        ? {}
        : startingGear(seat, eqModeOf(snapshot.game), snapshot, taken),
    );

  const started: Changeset = {
    journal: [
      { seatId: null, round: FIRST_TURN, kind: "start", payload: { seats: chosen.length } },
      /**
       * Who is playing what, said once, here.
       *
       * Choosing in the poczekalnia writes nothing on purpose: a pick is not a
       * decision until the game starts — it can be changed, handed to somebody
       * else, or taken back — and a journal of everybody's second thoughts is a
       * journal nobody reads. At the start they stop being reversible, which is
       * the moment worth writing down.
       *
       * In seat order, which is turn order, so the opening lines read as the
       * round about to be played rather than as the order people happened to
       * make up their minds in.
       */
      ...[...chosen]
        .sort((a, b) => a.seat_index - b.seat_index)
        .map((seat) => ({
          seatId: seat.id,
          round: FIRST_TURN,
          kind: "joined" as const,
          // `opening` is what makes the sentence "siada" rather than "dosiada
          // się": nobody is joining a game in progress here, they are the
          // reason it is about to be one.
          payload: { characterId: seat.character_id, opening: true },
        })),
    ],
  };

  return {
    writes: mergeAll(opened, ...kits, started),
    result: chosen
      .map((seat) => ({
        seatId: seat.id,
        spells: startingKit(asCharacterId(seat.character_id)).spells ?? 0,
      }))
      .filter((owed) => owed.spells > 0),
  };
}

/**
 * The turn setup is journalled under.
 *
 * A lobby's `turn` is 0 and the game's first is 1, so the lines written here
 * belong to the turn this change creates rather than to the one it read.
 */
const FIRST_TURN = 1;

/**
 * When the table actually began.
 *
 * `started_at` is a real column that nothing reads, so it is not in
 * `GAME_COLUMNS` and therefore not in `GameRow` — which is the shape a
 * changeset's `game` patch is typed by. Said out loud here rather than widening
 * a read list for a column no read wants.
 */
function startedAt(now: number): Partial<Omit<GameRow, "turn_state">> {
  return { started_at: new Date(now).toISOString() } as Partial<Omit<GameRow, "turn_state">>;
}

/** What one character owns before anybody rolls, minus the Zaklęcia. */
function startingGear(
  seat: SeatRow,
  eqMode: EqMode,
  snapshot: Snapshot,
  /** What earlier seats in this same deal have already taken off the pile. */
  taken: Record<string, number>,
): Changeset {
  // `asCharacterId` answers null for both "nothing chosen" and "the surprise",
  // and `startingKit` gives an empty kit for either — so an unresolved seat
  // that reached here is dealt nothing rather than crashing the start.
  const kit = startingKit(asCharacterId(seat.character_id));

  // What the pile can actually supply. With `endless_stock` on — which is how
  // this app opens a table — every one of them; with 21.2 in force, only while
  // there is a Karta left to take.
  const dealt = (kit.items ?? []).filter((cardId) => onTheShelf(snapshot, cardId, taken));

  // Worn from the start where there are places to wear them, through the same
  // function every arriving Przedmiot goes through — see `slotOnArrival`. In
  // klasyczny there is nowhere to put them and nothing to gain: a card counts
  // wherever it lies.
  const stowed = slotsOnArrival(
    dealt.map((cardId) => ({ cardId, kind: "item" })),
    {
      eqMode,
      nature: (seat.nature ?? null) as Nature | null,
      worn: snapshot.holdings
        .filter((one) => one.seat_id === seat.id)
        .map((one) => one.slot as Slot | null),
    },
  );
  const items: Changeset = dealt.length
    ? {
        holdings: {
          insert: dealt.map((cardId, at) => ({
            seat_id: seat.id,
            card_id: cardId,
            kind: "item" as const,
            face: "open" as const,
            ...(stowed[at] ? { slot: stowed[at] } : {}),
          })),
        },
      }
    : {};

  // 3.2: everyone starts on one "chyba, że jej Karta daje w tym względzie inne
  // instrukcje" — so the column default stands unless the character overrides.
  const purse: Changeset =
    kit.gold !== undefined ? { seats: [{ id: seat.id, patch: { gold: kit.gold } }] } : {};

  if (!dealt.length && kit.gold === undefined && !kit.spells) return {};

  // The line says what arrived, not what the Karta promised. An item the pile
  // could not supply leaves no trace at all: 21.2 makes it "w danej chwili
  // nieosiągalny", which is a fact about the box rather than an event at the
  // table, and a journal that reported it would be reporting the absence of
  // something nobody ever held.
  return mergeAll(items, purse, {
    journal: [
      {
        seatId: seat.id,
        round: FIRST_TURN,
        kind: "starting-kit",
        // The promised list is dropped out of the spread: `...kit` would put
          // back the Miecz that never came, which is the one thing this
          // line must not say.
          payload: { character: seat.character_id, ...withoutItems(kit), ...(dealt.length ? { items: dealt } : {}) },
      },
    ],
  });
}

/**
 * Whether the Wyposażenie pile can still supply this card, counting what this
 * deal has already handed out.
 *
 * The tally is needed because a whole table is dealt in one Changeset: without
 * it, five characters asking for a Miecz would each look at the same untouched
 * pile of three and all five would get one.
 */
function onTheShelf(snapshot: Snapshot, cardId: string, taken: Record<string, number>): boolean {
  if (!fromTheShop(cardId)) return true;
  const inPlay =
    snapshot.holdings.filter((held) => held.card_id === cardId).length +
    snapshot.fieldCards.filter((card) => card.card_id === cardId).length +
    (taken[cardId] ?? 0);
  if (stockLeft(cardId, inPlay, snapshot.game.endless_stock) <= 0) return false;
  taken[cardId] = (taken[cardId] ?? 0) + 1;
  return true;
}

/* --------------------------------------------------------------------------
 * The movement roll.
 * ----------------------------------------------------------------------- */

export interface RollForMove {
  /**
   * True when a human read the number off a real die and typed it in.
   *
   * Provenance, not a value: the die itself comes from the port, and which
   * binding is behind it is not something a rule may ask. But the journal has
   * always recorded whether the app or the table produced the number — that is
   * what its `manual` column is for — and only the edge that chose the binding
   * knows. Same shape as `Adjustment.record`.
   */
  manual?: boolean;
}

/**
 * Rolls for the move (10.2).
 *
 * One die, and it is the only one: "ruch: rzut kostką".
 *
 * The die is thrown after the phase check and before the "is the figure
 * anywhere" check, which is where the store threw it, so a table that types a 7
 * still hears about the 7 first. Nothing here validates the number — `supplied`
 * refuses anything outside 1-6 as it takes it, which is the same refusal in the
 * one place that can tell a typed number from a thrown one.
 */
export async function rollForMove(
  snapshot: Snapshot,
  command: RollForMove,
  ports: CommandPorts,
): Promise<Outcome<number>> {
  const seat = activeSeat(snapshot);
  if (top(snapshot.game.turn_state).phase !== "roll") throw new Error("Nie czas na rzut.");
  // 5.6: "musi natychmiast odrzucić". The turn does not begin until it has.
  refuseWhileOverLimit(snapshot, seat.id);
  // Held where they stand — the Krąg Płomieni. Everything else in a turn hangs
  // off having rolled, which is why this is the door it is asked at.
  refuseWhileHeld(snapshot, seat.id);
  // 10.5: and a character standing in the Zamek with the Tarcza is not going
  // anywhere either — the fight is the only thing left to do.
  refuseWhileBeastAwaits(snapshot, seat.id);

  const thrown = await ports.random.rollD6("ruch: rzut kostką");
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  /**
   * Formuła Przestrzeni doubles the die, not the distance.
   *
   * "wynik rzutu kostką przy wykonywaniu ruchu należy pomnożyć przez 2" — the
   * same distinction the Talizmany make in a fight, and it matters because the
   * cap below is read against the result: a character under both the Formuła
   * and an Mgła walks the smaller of the two, which is the Mgła.
   */
  const roll = thrown * moveMultiplier(statusesOf(snapshot, seat.id));

  // 11.10 offers the bridge as part of the move, so whether it is on the table
  // has to be settled before the destinations are drawn: a Magiczny Miecz is
  // required, and 11.11 bars anyone who failed there on their last turn.
  const mine = snapshot.holdings.filter((h) => h.seat_id === seat.id);
  // The card says so itself — `{ kind: "wymagany", place: "most" }` is printed
  // on the Magiczny Miecz in the ability registry — rather than the id being
  // named a second time here.
  const hasSword = opensTheWayTo(heldAbilities(mine.map((h) => h.card_id)), "most");
  const blocked = bridgeBlocked(seat.bridge_blocked_until_round, snapshot.game.round);

  // Mgła caps the walk (`move-max`). Read here rather than in `afterRoll`,
  // which is given facts about the seat already decided — the same shape as
  // `bridgeOffered` beside it. Nothing consulted it before: the status could be
  // put on a seat and the character walked the full roll anyway.
  const cap = movementCap(statusesOf(snapshot, seat.id));

  const manual = command.manual ?? false;
  return {
    writes: {
      game: {
        // replaceTop: the roll frame advancing into the move, mid-turn.
        turn_state: replaceTop(
          snapshot.game.turn_state,
          afterRoll(seat.field_id, roll, {
            bridgeOffered: hasSword && !blocked,
            cap,
            /**
             * 14.7's other half. "Postać, która wejdzie na Most nie posiadając
             * tej Tarczy, musi ominąć Zamek" — so without one the Zamek is not a
             * square this character can be offered, and the step goes over it.
             *
             * The same ability that closes the door once you are inside (10.5)
             * is the one that opens it: `opensTheWayTo(…, "zamek-bestii")`, which
             * had never been read anywhere until this week.
             */
            mayEnterCastle: opensTheWayTo(
              heldAbilities(mine.map((held) => held.card_id)),
              "zamek-bestii",
            ),
          }),
        ),
      },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "roll",
          // The cap goes in the payload even though `roll` lines are UNSPOKEN,
          // because the row is the record of what the app decided and "why was
          // a 5 only worth one field" is exactly what it would be read for.
          payload: { roll, manual, ...(cap === null ? {} : { cap }) },
          manual,
        },
      ],
    },
    result: roll,
  };
}

/* --------------------------------------------------------------------------
 * The walk.
 * ----------------------------------------------------------------------- */

export interface MoveTo {
  /** Straight off the request body, so it is checked before it is a field. */
  destination: string;
  /**
   * True when this is an attempt to turn off the ring onto the Kamienny Most.
   *
   * A bridge attempt shares its `fieldId` with the entrance it stops at, so the
   * two are told apart by intent rather than by destination (11.10).
   */
  viaBridge?: boolean;
}

/**
 * Walks the roll out and lands on a field (10.2, 13.4).
 *
 * No dice: the number was thrown in `rollForMove` and is already in the turn
 * state.
 */
export function moveTo(snapshot: Snapshot, command: MoveTo): Outcome<void> {
  const fieldId = requireFieldId(command.destination, "Ruch");
  const viaBridge = command.viaBridge ?? false;
  const seat = activeSeat(snapshot);
  const phase = top(snapshot.game.turn_state);
  if (phase.phase !== "move") throw new Error("Nie czas na ruch.");

  // Only the squares the roll actually reaches are accepted, so a stale page
  // cannot post a destination from a previous roll.
  const chosen = phase.options.find(
    (option) => option.fieldId === fieldId && !!option.bridge === viaBridge,
  );
  if (!chosen) throw new Error("To pole nie jest w zasięgu tego rzutu (10.2).");

  const field = FIELDS.get(fieldId);
  if (!field) throw new Error(`Nieznane pole: ${fieldId}`);

  // Turning off the ring onto the bridge stops the walk at the entrance with
  // the guardian still to be faced (11.10); the field itself is not resolved,
  // and its card is not drawn ("nie ciągnij Karty ... gdy wchodzisz na Most").
  const lifted = chosen.bridge ? null : liftFieldCards(snapshot, field.id);

  return {
    writes: mergeAll(lifted?.writes ?? {}, {
      seats: [{ id: seat.id, patch: { field_id: fieldId } }],
      game: {
        // replaceTop: the move frame advancing into the field (or the bridge
        // attempt), mid-turn.
        turn_state: replaceTop(
          snapshot.game.turn_state,
          chosen.bridge
            ? atBridge(chosen.bridge)
            : afterMove(field, seat.field_id, lifted?.cards ?? []),
        ),
      },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: chosen.bridge ? "bridge-attempt" : "move",
          payload: {
            from: seat.field_id,
            to: fieldId,
            direction: chosen.direction,
            ...(chosen.bridge ? { guardian: chosen.bridge.guardian } : {}),
          },
        },
      ],
    }),
    result: undefined,
  };
}

/**
 * Picks up whatever is lying face up on a field, into the arriving character's
 * turn (12.1, 13.4, 16.8).
 *
 * They leave the board here and come back in `passTurn` if they are still
 * unclaimed then, which is what makes a field accumulate: a Wróg nobody beat
 * and a Przedmiot nobody could carry are both waiting for the next character
 * to stop there.
 *
 * A row naming a card the app does not know is still lifted off the board — it
 * would otherwise be picked up again by everyone who ever stopped here — but it
 * has no class to be resolved in 15.2 order, so it cannot join the turn.
 */
function liftFieldCards(
  snapshot: Snapshot,
  fieldId: FieldId,
): { writes: Changeset; cards: TurnCard[] } {
  const waiting = snapshot.fieldCards.filter((row) => row.field_id === fieldId);
  if (waiting.length === 0) return { writes: {}, cards: [] };

  return {
    writes: { fieldCards: { delete: waiting.map((row) => row.id) } },
    cards: waiting.flatMap((row) => {
      const card = EVENTS.find((c) => c.id === row.card_id);
      return card ? [{ cardId: card.id, cardClass: card.cardClass }] : [];
    }),
  };
}
