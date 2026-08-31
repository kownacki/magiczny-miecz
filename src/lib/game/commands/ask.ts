/** Answering a question no card script asked: the `ask` frame's one door back in (docs/STACK.md). */

import { askOnTop, closeAsk, pickFrom } from "@/lib/engine/ask";
import { putBackOnTop } from "@/lib/engine/deck";
import { SPELL_BY_REF, decksOf } from "../decks";
import type { Outcome, Snapshot } from "../change";
import { seatById } from "./seat";

export interface AnswerAsk {
  /** Who is answering. The frame says whose answer it is, and refuses anyone else. */
  seatId?: string;
  /** Which of the offered options, by position. */
  choice: number;
}

/**
 * Takes one of the Karty the frame is holding out, and puts the rest back.
 *
 * The Chochlik's whole rule, once the looking is done: "wybrać tę, która
 * najbardziej ci odpowiada". The card that is not chosen goes back on top of
 * the stos rather than to the used pile — it was looked at, not spent, and it
 * is still the next Zaklęcie anybody draws.
 *
 * The choice is re-walked against what the frame actually offered, the same
 * discipline `Decisions` follows: a number arriving from a browser can only
 * reach a card the server itself put on the table.
 *
 * Law 5 enforced rather than assumed: the frame names the seat it is waiting
 * on, so a second device cannot answer somebody else's question — which for a
 * hidden hand (9.3) would be reading it as well as answering it.
 */
export function answerAsk(snapshot: Snapshot, command: AnswerAsk): Outcome<string> {
  const frame = askOnTop(snapshot.game.turn_state);
  if (!frame) throw new Error("Nic tu nie czeka na odpowiedź.");

  if (command.seatId && command.seatId !== frame.seatId) {
    throw new Error("To nie twoja decyzja.");
  }
  const seat = seatById(snapshot, frame.seatId);

  const picked = pickFrom(frame.question, command.choice);
  if (!picked) throw new Error("Nie ma takiej Karty do wyboru.");

  const spell = SPELL_BY_REF.get(picked.kept);
  if (!spell) throw new Error(`Nieznane Zaklęcie: ${picked.kept}`);

  const decks = decksOf(snapshot.game);
  return {
    writes: {
      game: {
        deck: { ...decks, spells: putBackOnTop(decks.spells, picked.back) },
        turn_state: closeAsk(snapshot.game.turn_state),
      },
      holdings: {
        insert: [
          {
            seat_id: seat.id,
            card_id: spell.id,
            kind: "spell",
            // Concealed from the other players (9.3), exactly as a dealt one is.
            face: "hidden",
          },
        ],
      },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "spell",
          // The ordinary line a drawn Zaklęcie writes, with the Przyjaciel who
          // made it a choice named on it — a new kind would have cost a
          // migration for a sentence that already had a home.
          payload: { spellId: spell.id, ...(frame.cardId ? { via: frame.cardId } : {}) },
        },
      ],
    },
    result: spell.id,
  };
}
