/** Taking a Postać out of the game, and putting one back (4.4, 12.1). */

import { HEAL_CEILING } from "@/lib/engine/derive";
import { apply, merge, mergeAll, type Changeset, type Outcome, type Snapshot } from "../change";
import { asReturnable, putOnPile } from "./piles";
import { passTurn } from "./turn";

/**
 * The two things 4.4 does not have a word for.
 *
 * The rulebook removes a Postać exactly once — it dies, and its Karta goes "do
 * pozostałych nie biorących udziału w grze" — and it never puts one back. So
 * both of these contradict it in words, which is why `revive` is the console's
 * alone and why `remove` is journalled as a manual override even when the host
 * does it.
 *
 * They exist because the table has a state the rulebook does not: somebody has
 * to leave at eleven, or a Postać was dealt to a chair nobody ever sat in, or a
 * death was entered against the wrong seat. At a real table you would pick the
 * figure up and put it in the box. There is no such gesture in an app, and a
 * referee you cannot correct is worse than no referee.
 */

/* --------------------------------------------------------------------------
 * Out.
 * ----------------------------------------------------------------------- */

export interface RemoveCharacter {
  seatId: string;
  /**
   * Bars the Karta for good rather than returning it to the pool.
   *
   * Soft is the ordinary one and the one a table wants: the figure goes back in
   * the box and somebody else may play it. Hard is for the Postać that should
   * never have been dealt — it joins the dead in `characters_out`, where 4.4
   * keeps the cards that are out of this game.
   */
  hard: boolean;
  /**
   * Who is doing it, and null for the console.
   *
   * A host may withdraw a *living* Postać: the rulebook says nothing about
   * withdrawing one, so nothing is being overruled. Only the console may
   * remove a **dead** one, because that is putting a Karta back that 4.4
   * explicitly set aside — and it is journalled `manual` for exactly that
   * reason.
   */
  byId: string | null;
}

export interface Removed {
  characterId: string;
  /** What was left standing on the Obszar, in the order it was put down. */
  dropped: string[];
}

/** One coin, one card — what a Sztuka Złota is when it is lying on a field. */
const COIN = "1-sztuka-zlota";

/**
 * A Postać out of the game, and everything it was carrying onto its Obszar.
 *
 * 12.1 is why the kit is spilled rather than deleted: "Karty, które pozostały
 * na Obszarze, może wziąć każda Postać, która się na nim zatrzyma". Deleting
 * the row without this would take the Przedmioty and the Przyjaciele out of the
 * game silently, and the board would be quietly poorer for it — so they go down
 * face up where the next comer can take them, and the gold goes down as coins,
 * one card each, because that is what a Sztuka Złota is on a field.
 *
 * The Zaklęcia do not: nobody ever saw them (9.3), and a hand nobody saw
 * appearing face up on a field is the one thing a concealed hand must never do.
 * They go back to the pile they came from, which is where 4.4 sends them.
 *
 * The seat stays. It is the chair, its player is still sitting in it, and the
 * journal holds `seat_id` references to everything that Postać ever did.
 */
export function removeCharacter(
  snapshot: Snapshot,
  command: RemoveCharacter,
): Outcome<Removed> {
  const seat = snapshot.seats.find((one) => one.id === command.seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  if (!seat.character_id) throw new Error("Na tym miejscu nie ma Postaci.");

  if (command.byId !== null) {
    const by = snapshot.users.find((one) => one.id === command.byId);
    if (!by?.is_host) throw new Error("Tylko gospodarz może wycofać Postać z gry.");
    if (seat.eliminated) {
      throw new Error("Ta Postać już nie żyje — jej Kartę odkłada tylko konsola (4.4).");
    }
  }

  const character = seat.character_id;
  const mine = snapshot.holdings.filter((held) => held.seat_id === seat.id);
  const left = mine.filter((held) => held.kind === "item" || held.kind === "friend");
  const spellCards = mine.filter((held) => held.kind === "spell");
  const trophies = mine.filter((held) => held.kind === "trophy");

  /**
   * The kit, then the purse, in that order and each carrying its own flags.
   *
   * Built off the holdings rather than looked back up by `card_id`: a field can
   * hold two of the same Przedmiot and only one of them may have been conjured
   * for a test, so matching on the name would hand the wrong card the wrong
   * flag. A coin was never granted by anybody — it is a number becoming cards.
   */
  const spill = seat.field_id
    ? [
        ...left.map((held) => ({
          field_id: seat.field_id as string,
          card_id: held.card_id,
          granted: held.granted,
        })),
        ...Array.from({ length: seat.gold }, () => ({
          field_id: seat.field_id as string,
          card_id: COIN,
          granted: false,
        })),
      ]
    : [];
  const dropped = spill.map((card) => card.card_id);

  const spilled: Changeset = spill.length > 0 ? { fieldCards: { insert: spill } } : {};

  const emptied: Changeset =
    mine.length > 0 ? { holdings: { delete: mine.map((held) => held.id) } } : {};

  // Chained rather than merged: both write `deck`, and a merge would let the
  // second overwrite the first's pile instead of adding to it.
  const put = mergeAll(spilled, emptied);
  const spellsBack = putOnPile(apply(snapshot, put), "spells", spellCards.map(asReturnable));
  const trophiesBack = putOnPile(
    apply(snapshot, mergeAll(put, spellsBack)),
    "events",
    trophies.map(asReturnable),
  );

  /**
   * The chair, emptied back to what it is before anybody chooses.
   *
   * Every printed value goes with the card, or the seat would keep the Książę's
   * 4/3 and his Gród under whatever is dealt next — a Postać wearing somebody
   * else's numbers. `eliminated` is cleared too: a chair with nothing standing
   * in it is waiting, not dead.
   */
  const cleared: Changeset = {
    seats: [
      {
        id: seat.id,
        patch: {
          character_id: null,
          field_id: null,
          sword_own: 0,
          magic_own: 0,
          sword_floor: 0,
          magic_floor: 0,
          gold: 0,
          nature: null,
          eliminated: false,
          turns_lost: 0,
          stone_until_turn: null,
          bridge_blocked_until_turn: null,
          nature_changed_turn: null,
        },
      },
    ],
  };

  /**
   * Which side of 4.4's list the Karta lands on.
   *
   * Soft puts it back in the pool — including a dead one, which is the
   * console's rule-break and the reason this is journalled `manual`. Hard bars
   * it, which is the same shelf death puts a card on.
   */
  const out = snapshot.game.characters_out;
  const listed: Changeset = command.hard
    ? out.includes(character)
      ? {}
      : { game: { characters_out: [...out, character] } }
    : out.includes(character)
      ? { game: { characters_out: out.filter((id) => id !== character) } }
      : {};

  const soFar = mergeAll(put, spellsBack, trophiesBack, cleared, listed, {
    journal: [
      {
        seatId: seat.id,
        turn: snapshot.game.turn,
        kind: "override" as const,
        manual: true,
        payload: {
          what: "remove",
          character,
          hard: command.hard,
          droppedOnField: dropped,
          spellsDiscarded: spellCards.length,
          field: seat.field_id,
        },
      },
    ],
  });

  // A chair with nothing in it cannot be the one to play, so the turn moves on
  // — decided against a table that already knows the Postać is gone.
  const after = apply(snapshot, soFar);
  const moved =
    snapshot.game.active_seat === seat.seat_index ? passTurn(after) : ({} as Changeset);

  return { writes: merge(soFar, moved), result: { characterId: character, dropped } };
}

/* --------------------------------------------------------------------------
 * Back.
 * ----------------------------------------------------------------------- */

/**
 * A dead Postać standing up again, where it fell.
 *
 * Console-only, and it contradicts 4.4 in words: the rulebook has one door out
 * of a death and it leads to a *different* character. This is for the death
 * that should not have happened — a fight settled against the wrong seat, a
 * Życie taken twice — and undoing it by dealing a fresh Postać would lose the
 * one thing worth keeping, which is where the figure was standing.
 *
 * What comes back is the character and nothing else it had. Own points, because
 * 1.3 and 2.3 put a floor under them and that floor is what it started with;
 * the four points of Życie it started with (4.2); its Obszar, untouched. Not
 * the Przedmioty or the Przyjaciele — those are lying on the field where it
 * fell, under 12.1, and may have been picked up by somebody else two turns ago.
 * Not the Zaklęcia, which went back to the pile and have been reshuffled.
 */
export function reviveCharacter(
  snapshot: Snapshot,
  command: { seatId: string },
): Outcome<string> {
  const seat = snapshot.seats.find((one) => one.id === command.seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  if (!seat.character_id) throw new Error("Na tym miejscu nie ma Postaci.");
  if (!seat.eliminated) throw new Error("Ta Postać żyje.");

  const character = seat.character_id;
  const out = snapshot.game.characters_out;

  return {
    writes: {
      seats: [
        {
          id: seat.id,
          patch: {
            eliminated: false,
            // 4.2's four, and the floor 1.3 and 2.3 put under the two
            // parameters — which is exactly what the card was printed with.
            life: HEAL_CEILING,
            sword_own: seat.sword_floor,
            magic_own: seat.magic_floor,
            turns_lost: 0,
            stone_until_turn: null,
          },
        },
      ],
      // Off the list death put it on, or the Karta it is holding is one this
      // game says is not in it.
      ...(out.includes(character)
        ? { game: { characters_out: out.filter((id) => id !== character) } }
        : {}),
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "override" as const,
          manual: true,
          payload: { what: "revive", character },
        },
      ],
    },
    result: character,
  };
}
