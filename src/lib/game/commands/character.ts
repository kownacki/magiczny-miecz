/** The Postać on a seat: choosing and dealing it (0.1-0.4), its Natura (7.2-7.4), where its figure stands, and taking a new one after death (4.4). */

import charactersData from "@/data/characters.json";
import type { Character, EventCard, Nature } from "@/data/types";
import { requireFieldId, fieldByName, type FieldId } from "@/lib/engine/board";
import {
  RANDOM_CHARACTER_ID,
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
  type SeatPatch,
  type Snapshot,
} from "../change";
import type { SeatRow } from "../store";
import { driverOf } from "./lobby";
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
  /**
   * Not a change — which is not nothing to say.
   *
   * A Zdarzenie that turns a character Zły when it is already Zły has done
   * exactly what it says and had no effect, and the journal is the only place
   * anybody at the table can learn that the attempt happened at all. Silence
   * here reads as the card having been forgotten.
   *
   * Still not a use of 7.3's one change per turn: nothing is written to the
   * seat, so `nature_changed_turn` is untouched and the real change this
   * character might make later in the turn is still available. And nothing can
   * become forbidden by 7.4 when the Natura it would be forbidden by is the one
   * already in force.
   */
  if (seat.nature === command.nature) {
    return {
      writes: {
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "nature-change",
            payload: { from: seat.nature, to: command.nature, nowForbidden: [] },
            manual: command.force ?? false,
          },
        ],
      },
      result: { nowForbidden: [] },
    };
  }

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
 * What a Karta Postaci settles the moment it is put in front of somebody.
 *
 * The same seven columns whether the card was chosen (0.2), dealt (0.1) or
 * taken after a death (4.4), which is why they are written once here. They used
 * to be written out at each of the three, and the three had already drifted:
 * the poczekalnia's copy passed a `string` field id where this one passes a
 * `FieldId`.
 */
function printedOn(character: Character): SeatPatch["patch"] {
  return {
    character_id: character.id,
    // 0.4: the Obszar the card marks MGR, and a real one — see `startingFieldId`.
    field_id: startingFieldId(character.start),
    // The starting Miecz and Magia become both the current value and the
    // floor, because 1.3 and 2.3 forbid a character ever dropping below what
    // it began with.
    sword_own: character.miecz,
    magic_own: character.magia,
    sword_floor: character.miecz,
    magic_floor: character.magia,
    // Kat prints "any" and picks at setup, so it is left unset here
    // for the player to choose rather than being silently defaulted.
    nature: character.nature === "any" ? null : character.nature,
  };
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
  command: { seatId: string; characterId: string; bySeat: string },
  ports: CommandPorts,
): Promise<Outcome<OwedSpells>> {
  // 4.4 is a choice the dead character's own player makes. It had the same hole
  // `chooseCharacter` did, with a narrower blast radius only because the seat
  // has to be eliminated or empty for this to get any further at all.
  refuseUnlessMine(snapshot, command.seatId, command.bySeat);
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

  /**
   * What is not available: what somebody is holding, and what is out of the game.
   *
   * The second half is 4.4 — "jej Kartę odłożyć do pozostałych nie biorących
   * udziału w grze" — and it is a list on the games row rather than a fact
   * about a seat, because the seat that held the dead card is the very seat
   * about to overwrite it with the new one. Without `characters_out` a
   * character died and was back in the pool one pick later.
   *
   * The surprise sentinel is in this set too and harmlessly matches no Karta.
   */
  const spent = new Set([
    ...snapshot.seats.filter((s) => s.character_id).map((s) => s.character_id as string),
    ...snapshot.game.characters_out,
  ]);

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

  if (snapshot.game.characters_out.includes(wanted)) {
    // Said apart from the one below it: "already in the game" is wrong about a
    // card nobody is holding, and sends somebody looking round the table for a
    // figure that is lying in the box.
    throw new Error("Ta Postać wypadła już z gry (4.4).");
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
          ...printedOn(character),
          eliminated: false,
          life: 4,
          gold: kit.gold ?? 1,
          turns_lost: 0,
          stone_until_turn: null,
          bridge_blocked_until_turn: null,
          nature_changed_turn: null,
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
          /**
           * A death and a latecomer are not the same event, and the journal
           * says which: one is a Postać starting over under 4.4, the other
           * somebody joining a table already running.
           *
           * Told apart by the Karta on the seat, not by `eliminated`. That flag
           * means "out of play", which a newcomer's seat is too — it is created
           * that way and joins the round when they pick — so on its own it
           * called every arrival a replacement, and the journal said "Ola gra
           * dalej jako AWANTURNIK" about somebody who had not played yet. Only
           * a death leaves a Postać sitting there to be replaced.
           */
          kind: seat.eliminated && seat.character_id ? "new-character" : "joined",
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

/* --------------------------------------------------------------------------
 * Setting up the table: choosing and dealing the Karty Postaci (0.1-0.4).
 * ----------------------------------------------------------------------- */

export interface ChooseCharacter {
  seatId: string;
  characterId: string;
  /** The seat whose device is asking. See `mayChooseFor`. */
  bySeat: string;
}

/**
 * Whose Karta Postaci a device may choose.
 *
 * Your own, and a seat that has no device of its own. That second door is the
 * ordinary case at a physical table rather than an edge case — one laptop in
 * the middle and somebody who is sitting there but not holding anything — and
 * it is why choosing for another seat is allowed at all.
 *
 * It was allowed for *every* seat, which is a different thing. The route took
 * `body.seatId` and used it, with the comment above it explaining the
 * device-less case as though that were what the code said. Any seated player
 * could post another player's `seatId` and overwrite their Postać — and not
 * merely overwrite it: choosing resets the seat's points, its MGR, its Natura
 * and its ready flag, so a stranger could take a Książę off a table and leave
 * a blank seat behind. Nobody would have to be malicious for it to happen once,
 * either; a stale `seatId` on a re-sent request does it by accident.
 *
 * Enforced here rather than in the route because it is a rule, and because the
 * browser has always had its own copy of it — the character strip refuses to
 * aim at anybody else's slot. A rule the client keeps and the server does not
 * is not a rule.
 */
export function mayChooseFor(snapshot: Snapshot, seatId: string, bySeat: string): boolean {
  if (seatId === bySeat) return true;
  // A seat nobody is driving is one the host may act for: that is what
  // `no_device` used to mark, and it needs no flag now that people and seats
  // are different rows.
  const target = snapshot.seats.find((seat) => seat.id === seatId);
  return target !== undefined && !snapshot.users.some((one) => one.seat_index === target.seat_index);
}

/**
 * Changing your mind un-readies you (docs/LOBBY.md).
 *
 * Otherwise somebody who said they were ready and then swapped their Postać is
 * still counted, and the host starts a game somebody was still deciding about.
 *
 * On the *person*, because that is where readiness lives now — a chair cannot
 * be ready — which also means a seat the host is choosing for on somebody's
 * behalf has nobody to un-ready, and nothing is written.
 */
function unready(snapshot: Snapshot, seat: SeatRow): Changeset {
  const driver = driverOf(snapshot.users, seat.seat_index);
  return driver && driver.ready ? { users: [{ id: driver.id, patch: { ready: false } }] } : {};
}

/** The refusal both choosing paths share, so they cannot drift apart. */
function refuseUnlessMine(snapshot: Snapshot, seatId: string, bySeat: string): void {
  if (!mayChooseFor(snapshot, seatId, bySeat)) {
    throw new Error("Postać wybiera się sobie — albo komuś, kto nie ma swojego urządzenia.");
  }
}

/**
 * Gives a seat its Karta Postaci — or the sentinel that says "surprise me".
 *
 * 0.3: no two seats may hold the same one. The box has 27 Karty Postaci and one
 * plastic figure per card, and setup deals *one* to each player — there is no
 * second Kapłanka to hand out. The character strip greys a taken card out; this
 * is the rule itself, because two devices can reach for the same one in the
 * same second and only the server sees both.
 *
 * No dice: a choice is a choice. The surprise is drawn by `dealCharacters`
 * later, which is the only part of this that needs a die.
 */
export function chooseCharacter(snapshot: Snapshot, command: ChooseCharacter): Outcome<void> {
  refuseUnlessMine(snapshot, command.seatId, command.bySeat);
  const seat = seatById(snapshot, command.seatId);

  /**
   * "Surprise me" is a choice, and several people can make it at once — there
   * is only one Kapłanka, but no limit on wanting whatever comes. Nothing else
   * is decided now: the points, the MGR and the kit all wait for the deal at
   * the start of the game, which is exactly what makes it a surprise.
   *
   * What it does settle is that whatever this seat was holding is gone. A
   * player changing their mind out of the Książę and into the surprise would
   * otherwise keep his 4/3 and his Gród sitting on the seat, and would keep
   * them for good if the deal never ran — a Postać wearing somebody else's
   * numbers. Życie and Złoto are not in the list because the poczekalnia never
   * writes them: 3.2's purse is dealt at the start of the game, by `startGame`,
   * off the character that is holding the seat *then*.
   */
  if (isRandomPick(command.characterId)) {
    return {
      writes: merge(unready(snapshot, seat), {
        seats: [
          {
            id: seat.id,
            patch: {
              character_id: RANDOM_CHARACTER_ID,
              field_id: null,
              sword_own: 0,
              magic_own: 0,
              sword_floor: 0,
              magic_floor: 0,
              nature: null,
            },
          },
        ],
      }),
      result: undefined,
    };
  }

  const character = CHARACTERS.find((c) => c.id === command.characterId);
  if (!character) throw new Error(`Nieznana postać: ${command.characterId}`);

  // Named, not counted: "ta postać jest zajęta" sends somebody back to a strip
  // of 27 to work out which one they meant.
  const rival = snapshot.seats.find(
    (other) => other.id !== seat.id && other.character_id === character.id,
  );
  if (rival) throw new Error(`${character.name} jest już wybrana przez kogoś innego.`);
  // Only reachable at a table that has been played on and reopened — the
  // poczekalnia has no dead characters — but the rule is the deal's, not the
  // moment's.
  if (snapshot.game.characters_out.includes(character.id)) {
    throw new Error(`${character.name} wypadła już z gry (4.4).`);
  }

  return {
    writes: merge(unready(snapshot, seat), {
      seats: [{ id: seat.id, patch: printedOn(character) }],
    }),
    result: undefined,
  };
}

export interface DealCharacters {
  /**
   * Which seats the deal fills, which is the whole of the difference between
   * the rulebook's setup and the moment the game starts.
   *
   * `unchosen` is 0.1 in the poczekalnia: everybody who has not got a card gets
   * one. `surprises` is the start of the game, and fills *only* the seats
   * holding the sentinel — a seat that never picked anything has not agreed to
   * play, and dealing it a character at the moment somebody presses start would
   * put a stranger in the game.
   */
  to: "unchosen" | "surprises";
}

/**
 * Shuffles the Karty Postaci and deals one out, which is what the rulebook
 * actually says to do:
 *
 * > Przed rozpoczęciem rozgrywki należy potasować Karty Postaci, a następnie
 * > rozłożyć losowo, po jednej przed każdym z graczy. Jeżeli zgodzą się na to
 * > wszyscy uczestnicy, można zrezygnować z losowego podziału […]
 *
 * Free choice (0.2) is the variant, agreed to by everybody; the random deal
 * (0.1) is the default, and the app had only ever offered the variant.
 *
 * **One command with a parameter, not two.** These were two functions —
 * `dealCharacters` and `resolveRandomPicks` — over one private helper, because
 * each had to be its own little script of reads and writes. As a command
 * there is nothing left to differ about: the same pool of unheld cards, the
 * same draw, the same seven columns per seat, one changeset. Splitting them
 * again would put the pool rule ("never a card somebody is holding") in two
 * places, which is the one thing here that must never be written twice. What is
 * genuinely different is *which seats are dealt to and why*, and a named
 * parameter says that out loud at the call site, where the reason for it is.
 *
 * `ready` is deliberately absent from the patch. The old deal called
 * `chooseCharacter`, which un-readies a seat because changing your mind about a
 * character should — and then had to put the flag back, because being dealt the
 * card you asked to be surprised by is not changing your mind, and un-readying
 * here would make the start button refuse the very table that just pressed it.
 * Building the patch directly means there is nothing to put back: what the deal
 * does not write, it does not disturb.
 */
export async function dealCharacters(
  snapshot: Snapshot,
  command: DealCharacters,
  ports: CommandPorts,
): Promise<Outcome<void>> {
  /**
   * Every chair that is waiting for one, driven or not.
   *
   * It used to skip a seat whose player had walked away, and there is no such
   * seat to skip any more: a chair nobody is driving is either one the host set
   * up for somebody in the room — which `mayChooseFor` lets them choose for, so
   * the deal must fill it too — or one the sweep is about to take away. The two
   * used to be told apart by `no_device`, which the split retired.
   */
  const toFill = snapshot.seats.filter((seat) =>
    command.to === "surprises" ? isRandomPick(seat.character_id) : !seat.character_id,
  );
  if (toFill.length === 0) return { writes: {}, result: undefined };

  // The sentinel is not a character and cannot be "taken" — several seats may
  // be holding it, and none of them is holding a card. `asCharacterId` is the
  // whole filter: it answers null both for "nothing chosen" and for "the
  // surprise", which are exactly the two that hold no card.
  const taken = new Set([
    ...snapshot.seats.map((seat) => asCharacterId(seat.character_id)).filter((id) => id !== null),
    // 4.4's, and dealt around for the same reason it is chosen around.
    ...snapshot.game.characters_out,
  ]);
  const pool = CHARACTERS.filter((character) => !taken.has(character.id));

  /**
   * Dealt off the top one at a time rather than shuffled and then dealt.
   *
   * The old version ran Fisher–Yates over all 27 cards with `randomInt` from
   * `node:crypto` and took the first few — a second source of randomness inside
   * something whose whole contract is that it has exactly one, and one a
   * retried commit could not reproduce (see `replayable`). Drawing each seat's
   * card out of what is left is the same deal by another name, on the only die
   * the game has, and costs six picks rather than twenty-six.
   */
  const seats: SeatPatch[] = [];
  for (const seat of toFill) {
    // 27 cards against at most 6 seats, so unreachable — but not assumed.
    if (pool.length === 0) break;
    const drawn = await pickBelow(ports.random, pool.length, "rozdanie Postaci");
    const [character] = pool.splice(drawn, 1);
    seats.push({ id: seat.id, patch: printedOn(character) });
  }

  return { writes: { seats }, result: undefined };
}
