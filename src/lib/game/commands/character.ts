/** The Postać on a seat: its Natura (7.2-7.4), where its figure stands, and taking a new one after death (4.4). */

import charactersData from "@/data/characters.json";
import type { Character, EventCard, Nature } from "@/data/types";
import { requireFieldId, fieldByName, type FieldId } from "@/lib/engine/board";
import {
  abilitiesOfCharacter,
  asCharacterId,
  isRandomPick,
  startingKit,
} from "@/lib/engine/characters";
import { forbiddenNatures } from "@/lib/engine/abilityText";
import { mayHold } from "@/lib/engine/derive";
import type { RandomPort } from "@/lib/engine/ports";
import { EVENTS } from "../decks";
import {
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import type { OwedSpells } from "./movement";
import { seatById } from "./seat";

/** The 27 Karty Postaci, read the same way `turnStore` reads them. */
const CHARACTERS = charactersData as Character[];

/* --------------------------------------------------------------------------
 * Natura (7.2-7.4).
 * ----------------------------------------------------------------------- */

/**
 * Which Natures a card forbids (5.3).
 *
 * It used to read this out of the card's prose, looking for "jedynie" and
 * "tylko" — and all three cards that carry the restriction phrase it the other
 * way round, as a prohibition: "Włóczni nie mogą posiadać Złe Postacie". So the
 * search found nothing on exactly the cards the rule exists for, and a Zła
 * Postać could pick up the Święta Włócznia.
 *
 * It is data now, in the same registry as everything else a card does, so the
 * rule and the hover cannot disagree about it.
 */
function forbiddenFor(card: EventCard): Nature[] | undefined {
  const forbidden = forbiddenNatures(card.id);
  return forbidden ? [...forbidden] : undefined;
}

/**
 * Changes a character's Natura (7.2).
 *
 * Rule 7.3 allows it at most once per turn, and the once is recorded as the
 * turn number rather than as a flag — a flag would need clearing by whoever
 * happened to end the turn, and a number cannot be forgotten.
 *
 * Rule 7.4 is the consequence that bites: a Magiczny Przedmiot the new Natura
 * may not use has to be dropped at once (5.5). Which ones those are is
 * *returned* rather than acted on, because the app discarding somebody's Święta
 * Włócznia on their behalf is exactly the kind of help a referee must not give.
 */
export function changeNature(
  snapshot: Snapshot,
  /**
   * `force` is the test console's, and lifts 7.3 rather than working around it.
   *
   * The rule is a memory of which turn the Natura last changed on, so the only
   * other way to set one twice in a turn would be to clear that memory behind
   * the command's back — which is the same act with the rule out of sight. It
   * marks the journal row manual as well, because a Natura that moved because
   * somebody typed it must not read like one that moved because a card said so.
   */
  command: { seatId: string; nature: Nature; force?: boolean },
): Outcome<{ nowForbidden: string[] }> {
  const seat = seatById(snapshot, command.seatId);
  // Not a change, so not a use of 7.3's one change per turn either.
  if (seat.nature === command.nature) return { writes: {}, result: { nowForbidden: [] } };

  // 7.3: "Żadna Postać nie może zmienić swojej Natury częściej niż raz w
  // trakcie tury gry." Magog is the exception — its own card says the Natura
  // may be changed freely, and 8.2 puts a Charakterystyka above the general
  // rule. Read off the ability registry rather than matched by id, so the
  // exception lives with the other 27 characters' powers.
  const freely = abilitiesOfCharacter(asCharacterId(seat.character_id)).some(
    (ability) => ability.kind === "natura-dowolna",
  );
  if (!freely && !command.force && seat.nature_changed_turn === snapshot.game.turn) {
    throw new Error("Naturę można zmienić najwyżej raz na turę (7.3).");
  }

  const nowForbidden = snapshot.holdings
    .filter((h) => h.seat_id === seat.id)
    .filter((h) => h.kind === "item" || h.kind === "friend")
    .filter((h) => {
      const card = EVENTS.find((c) => c.id === h.card_id);
      return card ? !mayHold({ ...card, forbiddenTo: forbiddenFor(card) }, command.nature) : false;
    })
    .map((h) => h.card_id);

  return {
    writes: {
      seats: [
        {
          id: seat.id,
          patch: { nature: command.nature, nature_changed_turn: snapshot.game.turn },
        },
      ],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "nature-change",
          payload: { from: seat.nature, to: command.nature, nowForbidden },
          manual: command.force ?? false,
        },
      ],
    },
    result: { nowForbidden },
  };
}

/* --------------------------------------------------------------------------
 * Moving a figure by hand.
 * ----------------------------------------------------------------------- */

/**
 * Puts a figure on an Obszar because somebody said so.
 *
 * The manual override for position, and the one every card path that teleports
 * a character borrows. `requireFieldId` is the check that used to be spelled
 * out here by hand, and now every caller gets the narrow type.
 */
export function placeSeat(
  snapshot: Snapshot,
  command: { seatId: string; target: string; reason: string | null },
): Outcome<void> {
  const seat = seatById(snapshot, command.seatId);
  const fieldId = requireFieldId(command.target, "Przestawienie");

  /**
   * The turn state carries its own copy of where the character is standing —
   * it is what the panel reads to decide which field's options to offer — so
   * moving the figure without it left the header naming one field and the
   * buttons belonging to another.
   *
   * Every phase past the roll, not just `pole`. The commonest reason to reach
   * for this override is a table that is *stuck*: mid-fight with something on
   * a field the figure is not on any more, or holding a bridge guardian that
   * should never have been met. Leaving that fight running while the figure
   * stands somewhere else is the desync, not a lesser version of it. `rzut` is
   * left alone because the character has not moved yet this turn.
   */
  const phase = snapshot.game.turn_state.phase;
  const restage: Changeset =
    seat.seat_index === snapshot.game.active_seat && phase !== "roll" && phase !== "end"
      ? {
          game: {
            // Freshly arrived: whatever was drawn belonged to the old field,
            // and the new one has not been resolved at all. `draw: 0` rather
            // than the field's printed count, because a figure put here by hand
            // did not walk here, and 15.1 makes drawing a consequence of
            // arriving.
            turn_state: { phase: "field", fieldId, from: null, draw: 0, drawn: [], fought: [] },
          },
        }
      : {};

  return {
    writes: merge(
      { seats: [{ id: seat.id, patch: { field_id: fieldId } }] },
      merge(restage, {
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "moved-by-hand",
            payload: { from: seat.field_id, to: fieldId, reason: command.reason },
            manual: true,
          },
        ],
      }),
    ),
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Taking a new Postać (4.4).
 * ----------------------------------------------------------------------- */

/**
 * An index into `n` options, thrown on the only die the game has.
 *
 * `randomInt` from `node:crypto` used to pick the replacement Postać, which is
 * a second source of randomness inside a command whose whole contract is that
 * it has exactly one — `ports.random`. A command that reaches past its ports
 * cannot be asked what it would do with a given throw, and a retried commit
 * would silently deal somebody a different character (see `replayable`).
 *
 * So the pick is built out of d6 throws instead. Each throw is a base-6 digit,
 * enough of them are taken to cover `n`, and a value landing in the ragged tail
 * past the last whole multiple of `n` is thrown away and rolled again. The
 * rejection is what keeps every Postać equally likely: two dice give 36 values
 * and 27 free characters do not divide it, so folding the remainder back would
 * make the first nine of them twice as likely as the other eighteen — a loaded
 * deal rather than a shuffle.
 */
export async function pickBelow(random: RandomPort, n: number, reason: string): Promise<number> {
  if (n <= 1) return 0;
  let range = 1;
  let digits = 0;
  while (range < n) {
    range *= 6;
    digits += 1;
  }
  const limit = range - (range % n);
  for (;;) {
    let value = 0;
    for (let i = 0; i < digits; i++) value = value * 6 + ((await random.rollD6(reason)) - 1);
    if (value < limit) return value % n;
  }
}

/**
 * The Obszar a Karta Postaci's MGR names.
 *
 * Where a name is ambiguous this takes the first in board order. Which of the
 * two identical fields a figure actually stands on is the players' to say, and
 * `placeSeat` is there for a table that wants the other one; what matters here
 * is that it is a real field.
 *
 * Throws rather than guessing. A character whose MGR is not on the board is a
 * data error, and it is better to refuse the pick than to seat somebody in a
 * place that does not exist.
 */
function startingFieldId(name: string): FieldId {
  const field = fieldByName(name);
  if (!field) throw new Error(`Karta Postaci wskazuje Obszar, którego nie ma na planszy: ${name}`);
  return field.id;
}

/**
 * Rule 4.4's second half: the player takes a new character and begins again.
 *
 * "Gracz, który kierował niefortunną Postacią, może wybrać sobie nową i
 * rozpocząć z nią grę od początku (z Obszaru oznaczonego jako MGR)." Death ends
 * a character, not a player's evening — and the app used to treat it as both,
 * which in a game this long is the difference between a bad turn and going to
 * make tea for two hours.
 *
 * The new character starts as any character starts: its own MGR, its printed
 * Miecz and Magia, four Życie, one Sztuka Złota unless its card says otherwise
 * (3.2) and whatever it owns before anybody rolls. What the dead one was
 * carrying stays where it fell — `killSeat` put it there — for whoever passes
 * that way.
 *
 * One changeset rather than three writes, which is the point of the shape: the
 * old version seated the character and then dealt the kit, so a deal that
 * failed left a half-seated Postać behind.
 *
 * The Zaklęcia of 9.5 are the one part of the kit this cannot do, on the same
 * terms as `startGame`: a spell draw checks 2.6's capacity, takes a card off
 * the pile and can reshuffle it, and a shuffle is randomness a command may not
 * reach for — `RandomPort` deals in single dice and nothing else. So it reports
 * how many are owed and the caller draws them, which is also what keeps them in
 * the journal they have always been in.
 */
export async function takeNewCharacter(
  snapshot: Snapshot,
  command: { seatId: string; characterId: string },
  ports: CommandPorts,
): Promise<Outcome<OwedSpells>> {
  const seat = seatById(snapshot, command.seatId);

  /**
   * Two ways to be sitting here without a character in play.
   *
   * 4.4's, which is what this was written for: the character died and its
   * player is taking another. And the latecomer's — somebody who sat down at a
   * table already running, whose seat has never held a character at all.
   *
   * They want exactly the same thing done to them, which is why this is one
   * command: a free character, the values it starts with, its MGR, its kit,
   * and a line in the journal saying who has arrived. What is refused is
   * swapping a living character for a better one.
   */
  if (!seat.eliminated && seat.character_id) {
    throw new Error("Ta Postać wciąż żyje.");
  }

  // The dead character's own card is out of the game — "jej Kartę odłożyć do
  // pozostałych nie biorących udziału w grze" — and so is everybody else's, so
  // the choice is from what nobody has held. The surprise sentinel is in this
  // set too and harmlessly matches no Karta Postaci.
  const spent = new Set(
    snapshot.seats.filter((s) => s.character_id).map((s) => s.character_id as string),
  );

  /**
   * The surprise, settled here and now.
   *
   * In the poczekalnia the sentinel sits on the seat until `startGame` deals a
   * real card, so nobody can see what anybody drew before the game begins.
   * There is no such moment left after a death — the game is already running —
   * so the draw happens as the button is pressed, from the same pool 4.4
   * describes: whatever nobody has held.
   */
  const asked = isRandomPick(command.characterId);
  let wanted = command.characterId;
  if (asked) {
    const left = CHARACTERS.filter((character) => !spent.has(character.id));
    if (left.length === 0) throw new Error("Nie została żadna wolna Postać.");
    wanted = left[await pickBelow(ports.random, left.length, "nowa Postać")].id;
  }

  if (spent.has(wanted)) throw new Error("Ta Postać jest już w grze.");
  const character = CHARACTERS.find((c) => c.id === wanted);
  if (!character) throw new Error(`Nieznana postać: ${wanted}`);

  const kit = startingKit(character.id);

  /**
   * One patch, where the old path wrote three.
   *
   * `chooseCharacter` seated the card and un-readied the seat, the reset put
   * the counters back and re-readied it, and `dealStartingKit` overwrote the
   * Złoto for the ten characters whose card names a different purse. Merged,
   * that is this — and `kit.gold ?? 1` is 3.2's single coin "chyba, że jej
   * Karta daje w tym względzie inne instrukcje", settled once instead of
   * written and then corrected.
   */
  const seated: Changeset = {
    seats: [
      {
        id: seat.id,
        patch: {
          character_id: character.id,
          field_id: startingFieldId(character.start),
          // The starting Miecz and Magia become both the current value and the
          // floor, because 1.3 and 2.3 forbid a character ever dropping below
          // what it began with.
          sword_own: character.miecz,
          magic_own: character.magia,
          sword_floor: character.miecz,
          magic_floor: character.magia,
          // Kat prints "any" and picks at setup, so it is left unset here
          // for the player to choose rather than being silently defaulted.
          nature: character.nature === "any" ? null : character.nature,
          eliminated: false,
          life: 4,
          gold: kit.gold ?? 1,
          turns_lost: 0,
          stone_until_turn: null,
          bridge_blocked_until_turn: null,
          nature_changed_turn: null,
          ready: true,
        },
      },
    ],
    ...(kit.items?.length
      ? {
          holdings: {
            insert: kit.items.map((cardId) => ({
              seat_id: seat.id,
              card_id: cardId,
              kind: "item" as const,
              face: "open" as const,
            })),
          },
        }
      : {}),
  };

  const dealt: Changeset =
    kit.items?.length || kit.gold !== undefined || kit.spells
      ? {
          journal: [
            {
              seatId: seat.id,
              turn: snapshot.game.turn,
              kind: "starting-kit",
              payload: { character: character.id, ...kit },
            },
          ],
        }
      : {};

  // Plainly merged, not chained: nothing here reads a column another part of
  // it writes. The deck is the one that would have needed `apply`, and the
  // draw that touches it is the caller's.
  return {
    writes: mergeAll(seated, dealt, {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          // A death and a latecomer are not the same event, and the journal
          // says which: one is a Postać starting over, the other somebody
          // joining a table already running.
          kind: seat.eliminated ? "new-character" : "joined",
          payload: {
            characterId: character.id,
            // Which card it is, is public either way; that it was drawn rather
            // than chosen is worth a word, because the two are different
            // decisions.
            ...(asked ? { losowa: true } : {}),
          },
        },
      ],
    }),
    result: { seatId: seat.id, spells: kit.spells ?? 0 },
  };
}
