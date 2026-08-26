/** One typed line from the test console, carried out against a real table. */

import characters from "@/data/characters.json";
import type { Character } from "@/data/types";
import { FIELDS } from "@/lib/engine/board";
import { RANDOM_CHARACTER_ID } from "@/lib/engine/characters";
import {
  helpLines,
  pickPlayer,
  statReply,
  type Command,
  type EffectName,
} from "@/lib/engine/console";
import { cardName } from "@/lib/engine/polish";
import type { Modifier } from "@/lib/engine/status";
import { change } from "./change";
import { ADJUSTABLE, type Adjustable } from "./commands/adjust";
import { STONE_TURNS } from "./commands/stone";
import { leaveGame } from "./lobbyStore";
import { gameById, seatsFor } from "./store";
import {
  abandonFight,
  addEffect,
  adjust,
  changeNature,
  drawSpell,
  finishTurn,
  grantCard,
  placeCard,
  placeSeat,
  resolveFight,
  stageFight,
  takeNewCharacter,
  turnToStone,
} from "./turnStore";

/**
 * The third edge, beside `turnStore.ts` and `lobbyStore.ts`.
 *
 * The grammar this carries out is `engine/console.ts`'s and is pure; this is
 * the half with the database in it, and it does almost nothing of its own —
 * every branch calls the function the game itself calls, so a tested Życie is
 * lost the way a real one is and a staged fight rolls the dice real combat
 * rolls. Nothing here can quietly disagree with the rules by keeping its own
 * copy of them.
 *
 * It lived in `turnStore.ts`, which made that file the largest in the repo and
 * made two unrelated things one: the turn, and the shortcut for testing the
 * turn. They are not read together and they are not changed together, and only
 * one of them ships to a table that is actually playing.
 */

/**
 * What each of the console's three effect words writes.
 *
 * The label is what a player is shown, so it names the card the state comes
 * from rather than the word that was typed — a chip reading "frozen" would be
 * the only English on anybody's screen, and the point of the state is to look
 * exactly like the card's.
 */
const EFFECTS: Record<EffectName, { label: string; modifier: Modifier }> = {
  fog: { label: "Mgła (tryb testowy)", modifier: { kind: "move-max", pola: 1 } },
  frozen: { label: "Bez ruchu (tryb testowy)", modifier: { kind: "frozen" } },
  barred: {
    label: "Most zamknięty (tryb testowy)",
    modifier: { kind: "barred", place: "most" },
  },
};

/**
 * Carries out one line from the test console.
 *
 * The grammar is in `console.ts` and is pure; this is the half with the
 * database in it, and it does almost nothing of its own — every command calls
 * the function the game itself calls, so a tested Życie is lost the way a real
 * one is, a staged fight rolls the dice the real combat rolls, and nothing here
 * can quietly disagree with the rules by having its own copy of them.
 *
 * Returns the line to print back. Refusals come up as thrown errors, which the
 * route turns into the same message any other refusal gets.
 */
export async function runCommand(
  gameId: string,
  actorSeatId: string,
  command: Command,
): Promise<string> {
  const seats = await seatsFor(gameId);

  /**
   * Whose seat a command is about: the one named, or your own.
   *
   * Named by player, by character, or by seat number — whichever is on screen
   * when somebody types. Any seated player may act on any seat here, as they
   * may with the corrections: at a table people fix each other's boards.
   */
  const seatOf = (who: string | null) => {
    if (!who) {
      const mine = seats.find((seat) => seat.id === actorSeatId);
      if (!mine) throw new Error("Nieznane miejsce.");
      return mine;
    }
    // The matching itself is `pickPlayer`'s, in the pure half, where a table of
    // four can be written down and asked about without a database behind it.
    const hit = pickPlayer(
      seats.map((seat) => ({
        seat: seat.seat_index,
        name: seat.player_name,
        character: seat.character_id,
      })),
      who,
    );
    if ("error" in hit) throw new Error(hit.error);
    return seats[hit.at];
  };

  const named = (seat: { player_name: string | null; seat_index: number }) =>
    seat.player_name ?? `Miejsce ${seat.seat_index + 1}`;

  switch (command.kind) {
    case "help":
      return helpLines(command.about).join("\n");

    case "stat": {
      const seat = seatOf(command.who);
      /**
       * `=12` is worked into a change here, where the current value is.
       *
       * The store has one verb for a tracked number and it is "move it by": the
       * floor, the ceiling and the journal line are all written in terms of
       * what moved, and a second verb that assigns would need its own copy of
       * every one of them. So the difference lives exactly as long as it takes
       * to subtract — and everything downstream, the clamp included, goes on
       * working the way it does for a `+1`.
       */
      const standing = (seat as unknown as Record<string, number>)[ADJUSTABLE[command.stat]];
      const delta = command.set === null ? command.delta : command.set - standing;
      if (delta === 0) return `${named(seat)}: ${command.stat} is already ${standing}.`;
      /**
       * No reason string. The journal draws every manual row with "tryb
       * testowy" beside it already, so passing the same words as the reason
       * printed them twice — three times on a forced line, which also carries
       * its own "wymuszone". What the console does is marked by the flag; the
       * sentence should say what happened, once.
       */
      const done = await adjust(
        gameId,
        seat.id,
        command.stat as Adjustable,
        delta,
        null,
        undefined,
        command.force,
      );
      // The sentence is `statReply`'s, in the pure half, and it is written
      // against `moved` rather than against the delta: a change the floor
      // swallowed used to be reported as though it had happened.
      return statReply({
        who: named(seat),
        stat: command.stat,
        asked: delta,
        moved: done.moved,
        now: done.to,
        floor: done.floor,
        forced: command.force,
      });
    }

    case "kill": {
      const seat = seatOf(command.who);
      if (seat.eliminated) return `${named(seat)} już nie żyje.`;
      // Through the same door a lost fight goes through, so what a death does
      // to a character — its cards on the field, its Zaklęcia spent, the turn
      // handed on — happens here too (4.4).
      await adjust(gameId, seat.id, "life", -seat.life, null);
      return `${named(seat)} ginie.`;
    }

    /**
     * A player out of their seat, and the character left where it stands.
     *
     * The same door `leave` goes through, which is the whole point of it being
     * that door: mid-game a seat is not deleted but *abandoned* — the character
     * keeps its Obszar, its cards and its żetony, the seat is marked as having
     * nobody behind it, and a fresh claim token is issued so the device that
     * held it stops holding it. Somebody takes it over later, or the same
     * person does from another tab. Only in the poczekalnia, where a seat is an
     * intention and not yet a character, does leaving actually delete it.
     *
     * Which also means this cannot strand the table: `leaveSeat` hands the turn
     * on when the seat it empties is the one whose turn it is.
     */
    case "kick": {
      const seat = seatOf(command.who);
      const { removed, passedTo } = await leaveGame(gameId, seat.id);
      const turn = passedTo === null ? "" : ` Turn passes to seat ${passedTo + 1}.`;
      return removed
        ? `${named(seat)} is off the table.`
        : `${named(seat)} is out of their seat; the character stays.${turn}`;
    }

    case "give": {
      const seat = seatOf(null);
      await grantCard(gameId, seat.id, command.cardId);
      return `${named(seat)} takes ${cardName(command.cardId)}.`;
    }

    case "place": {
      const seat = seatOf(null);
      const where = await placeCard(gameId, seat.id, command.cardId, command.fieldId);
      return `${cardName(command.cardId)} lies on ${FIELDS.get(where)?.name ?? where}.`;
    }

    case "nature": {
      const seat = seatOf(command.who);
      const { nowForbidden } = await changeNature(gameId, seat.id, command.nature, true);
      // 7.4 by way of 5.5: the cards the new Natura may not hold have to go,
      // and a tester who was not told which they are would find out two turns
      // later. `changeNature` works this out already; nothing was reading it.
      const dropped =
        nowForbidden.length > 0
          ? ` Now forbidden: ${nowForbidden.map((id) => cardName(id)).join(", ")}.`
          : "";
      return `${named(seat)} is ${command.nature}.${dropped}`;
    }

    /**
     * A seat that died taking a character again (4.4).
     *
     * The same door the reborn modal goes through, which is the point: the
     * modal is on the dead player's own device, and a tester driving four seats
     * from one browser cannot reach it. Naming a character is the reason this
     * is worth a command at all — a particular Charakterystyka is otherwise
     * reachable only by re-dealing the whole table.
     */
    case "revive": {
      const seat = seatOf(command.who);
      // The console acts as the seat it is naming: this is the test shortcut,
      // and refusing it on `mayChooseFor` would refuse the one caller that is
      // deliberately allowed to be anybody.
      await takeNewCharacter(
        gameId,
        seat.id,
        command.characterId ?? RANDOM_CHARACTER_ID,
        seat.id,
      );
      const after = (await seatsFor(gameId)).find((s) => s.id === seat.id);
      const now = (characters as Character[]).find((one) => one.id === after?.character_id);
      return `${named(seat)} plays ${now?.name ?? after?.character_id ?? "?"}.`;
    }

    /**
     * Hands play round until it is somebody's turn.
     *
     * By passing, not by writing `active_seat`: 10.1's order is not a number to
     * be set, and going round properly is what spends the lost turns, ticks the
     * effects, leaves the drawn cards on their field and advances the counter
     * that 20.1 measures stone in. So a seat that is stoned is reached by the
     * stone running out, which is the honest answer to asking for its turn.
     *
     * Bounded, because a seat can be unreachable — eliminated, or a table where
     * everybody owes turns. The bound is generous enough to outlast three turns
     * of stone and is a backstop rather than the exit.
     */
    case "turn": {
      const seat = seatOf(command.who);
      if (!seat.character_id) throw new Error(`${named(seat)} has no character.`);
      if (seat.eliminated) throw new Error(`${named(seat)} nie żyje — try \`revive\`.`);
      const players = seats.filter((s) => s.character_id && !s.eliminated).length;
      for (let pass = 0; pass <= players * 8; pass++) {
        const game = await gameById(gameId);
        if (game.active_seat === seat.seat_index) {
          return pass === 0
            ? `It is already ${named(seat)}'s turn.`
            : `${named(seat)} to play — ${pass} ${pass === 1 ? "turn" : "turns"} passed.`;
        }
        await finishTurn(gameId);
      }
      throw new Error(`Could not reach ${named(seat)} — stone, or turns owed all round.`);
    }

    case "stone": {
      const seat = seatOf(command.who);
      await turnToStone(gameId, seat.id);
      return `${named(seat)} is stone for ${STONE_TURNS} turns (20.1).`;
    }

    /**
     * The three states a card makes and nothing else does.
     *
     * Written through `addEffect`, so each one is the same row the card would
     * have written and is read by the same code — the cap consulted when a die
     * is rolled for a move, the freeze the turn order skips, 11.11's refusal at
     * the bridge. Ending after one of the holder's own turns, because a test
     * that has to be undone by hand is one somebody forgets to undo.
     */
    case "effect": {
      const seat = seatOf(command.who);
      const { label, modifier } = EFFECTS[command.effect];
      await addEffect(gameId, seat.id, {
        source: "tryb testowy",
        label,
        modifier,
        ends: { kind: "turns", turns: 1 },
      });
      return `${named(seat)}: ${label}.`;
    }

    case "go": {
      const seat = seatOf(null);
      await placeSeat(gameId, seat.id, command.fieldId, null);
      return `${named(seat)} stands on ${FIELDS.get(command.fieldId)?.name ?? command.fieldId}.`;
    }

    case "fight": {
      const seat = seatOf(null);
      await stageFight(gameId, seat.id, command.cardId);
      return `${named(seat)} fights ${cardName(command.cardId)}.`;
    }

    case "settle": {
      /**
       * Decides the fight you are in, without arranging dice to do it.
       *
       * Rolling until the answer comes out right is what a tester would
       * otherwise have to do, and against a Wilkołak with Miecz 10 there are
       * totals no pair of dice can reach — so the result is written and then
       * *applied* by `resolveFight`, the same function the last die calls. What
       * follows a loss follows here too: 17.4's Zbroja rolled against the point
       * of Życie, 4.4 if it was the last one, the guardian's own price on the
       * Kamienny Most.
       */
      const fightName = await change(
        gameId,
        (snapshot) => {
          const state = snapshot.game.turn_state;
          if (state.phase !== "fight") throw new Error("Nie ma walki.");
          const fight = state.fight;
          const settled =
            command.outcome === "remis"
              ? ({ outcome: "remis", kind: fight.kind } as const)
              : ({
                  outcome: command.outcome,
                  kind: fight.kind,
                  winner: command.outcome === "wygrana" ? "Postać" : fight.cardName,
                  loser: command.outcome === "wygrana" ? fight.cardName : "Postać",
                } as const);
          return {
            writes: {
              game: {
                turn_state: {
                  ...state,
                  // The dice are filled in as well, because everything
                  // downstream reads a settled fight as one that was rolled.
                  fight: {
                    ...fight,
                    playerRoll: fight.playerRoll ?? 0,
                    enemyRoll: fight.enemyRoll ?? 0,
                    result: settled,
                  },
                },
              },
            },
            result: fight.cardName,
          };
        },
        undefined,
      );
      await resolveFight(gameId);
      return command.outcome === "remis"
        ? "Fight drawn."
        : command.outcome === "wygrana"
          ? `Won against ${fightName}.`
          : `Lost to ${fightName}.`;
    }

    case "endgame": {
      /**
       * The end of the whole thing, which in this box has only one door.
       *
       * "CEL GRY" makes beating the Bestia the win and there is no other, so
       * winning is that: the game finished, the turn over, and the victory in
       * the journal — the state `fightBeast` leaves behind, without walking the
       * Kamienny Most to get there.
       *
       * Losing is not its mirror, because the rulebook has no losing condition.
       * What it has is 14.7 — the Bestia takes two points of Życie from
       * whoever loses to it, and 4.4 does the rest if that was the last of
       * them. So `losegame` loses to the Bestia rather than inventing a defeat
       * the game does not have.
       */
      const seat = seatOf(null);
      if (command.won) {
        await change(
          gameId,
          (snapshot) => ({
            writes: {
              game: { status: "finished", turn_state: { phase: "end" as const } },
              journal: [
                {
                  seatId: seat.id,
                  turn: snapshot.game.turn,
                  kind: "victory" as const,
                  payload: { kind: "ordinary", beastTotal: 0 },
                },
              ],
            },
            result: undefined,
          }),
          undefined,
        );
        return `${named(seat)} beats the Bestia. Game over.`;
      }
      await change(
        gameId,
        (snapshot) => ({
          writes: {
            journal: [
              {
                seatId: seat.id,
                turn: snapshot.game.turn,
                kind: "beast-loss" as const,
                payload: { kind: "ordinary", beastTotal: 0 },
              },
            ],
          },
          result: undefined,
        }),
        undefined,
      );
      await adjust(gameId, seat.id, "life", -2, null);
      const after = (await seatsFor(gameId)).find((s) => s.id === seat.id);
      return after?.eliminated
        ? `${named(seat)} loses to the Bestia and dies (14.7, 4.4).`
        : `${named(seat)} loses to the Bestia — 2 Życia (14.7).`;
    }

    case "endfight":
      await abandonFight(gameId);
      return "Fight dropped.";

    case "endturn":
      await finishTurn(gameId);
      return "Turn passed.";

    case "spell": {
      const seat = seatOf(command.who);
      const spellId = await drawSpell(gameId, seat.id);
      return `${named(seat)} draws ${cardName(spellId)}.`;
    }
  }
}
