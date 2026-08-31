/** Carrying out what a Karta says: the one place an `Effect` becomes changes to a table. */

import { FIELDS } from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { isSettled } from "@/lib/engine/resolve";
import { scriptFor } from "@/lib/engine/cardScript";
import { fieldScriptFor, offerKey } from "@/lib/engine/fieldScript";
import { cardIdNamed } from "@/lib/engine/lookup";
import { takeCard } from "./holdings";
import { describeEffect } from "@/lib/engine/effectText";
import { usageOf } from "@/lib/engine/uses";
import { seatsTargeted, type TargetSeat } from "@/lib/engine/targets";
import { chooseLosses, goldLost, lossTaken, reachableBy } from "@/lib/engine/losses";
import { endTurn } from "@/lib/engine/turn";
import { cardName, fieldName, NATURE_LABEL, plural } from "@/lib/engine/polish";
import type { Effect } from "@/lib/engine/cardScript";
import { startFight, type TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";
import type { Nature } from "@/data/types";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import type { SeatRow } from "../store";
import { adjustSeat } from "./adjust";
import { changeNature, pickBelow, placeSeat } from "./character";
import { drawCard, drawSpell, peekDue, peekSpells } from "./draw";
import { FIELD_SCRIPTS } from "@/lib/engine/fieldScript";
import { summonFighter } from "./fight";
import { nameOfSeat } from "./lobby";

import { healSeat } from "./life";
import { asReturnable, putOnPile } from "./piles";
import { only, pop, push, replaceTop, top, type TurnState } from "@/lib/engine/stack";
import { keepOnly, statusesOf } from "./turn";
import { hasAttacked } from "@/lib/engine/status";
import { turnToStone } from "./stone";
import { activeSeat, pointsOf, seatView } from "./seat";
import { isSpared, skipsRollAt } from "@/lib/engine/abilities";
import { addEffect } from "./turn";
import { BY_REF, decksOf } from "../decks";
import { asFieldId, ringFields } from "@/lib/engine/board";

/**
 * What the player has already decided, in the order the effect asks.
 *
 * The client never sends an effect — it sends *which option it picked*, and the
 * server re-walks the card it owns and takes that branch. A card cannot
 * therefore be talked into doing something it does not say, which is the whole
 * reason the decision travels as a number.
 */
export interface Decisions {
  choices?: number[];
  destination?: FieldId;
}

export interface Resolution {
  /** One line per thing that happened, for the notice and the journal. */
  did: string[];
  /**
   * The part still owed to a player's decision, if any. Null when the whole
   * effect has been carried out — and null too when the walk suspended on a
   * `walka`, which asks nobody anything: it opens a fight.
   */
  pending: Effect | null;
  /**
   * Set when the walk stopped short of the end and a `script` frame carries
   * the rest — see docs/STACK.md. `cursor` is the path to the node it stopped
   * at; `opens` is what the step wants standing above the frame.
   */
  suspended?: {
    cursor: number[];
    opens?: Opens;
  };
}

/**
 * What a suspending step wants opened above its `script` frame.
 *
 * Two kinds, because two things can stop a card mid-sentence and neither of
 * them can be done inside the walk: a fight has dice, spells and other seats
 * in it, and a question owed to a Charakterystyka rather than to the card has
 * cards to lift off a pile first. Both are built by `framed`, after the script
 * frame is pushed, so that what opens sits above the card it interrupted.
 */
export type Opens =
  | { kind: "walka"; nazwa: string; miecz?: number; magia?: number }
  | { kind: "ask" };

export interface ApplyEffect {
  seatId: string;
  effect: Effect;
  reason: string;
  decided?: Decisions;
  /**
   * What to mark resolved on the field when the effect finally completes —
   * a card id or an offer key. Travels on the frame across suspensions, so a
   * card finished three commits later is still crossed off (15.2).
   */
  mark?: string;
  /** "Musisz ją zabrać jako Przyjaciela" — taken only once the card completes. */
  keep?: boolean;
  /**
   * The order a pile comes back in when a card makes somebody draw.
   *
   * Same bargain the rest of the draw path makes: the rule decides whether the
   * pile is turned over, the edge decides what order it comes back in. See
   * `FromThePile` in `./draw`.
   */
  shuffle: Shuffle;
  /**
   * Who gains, where an effect moves a card rather than destroying it.
   *
   * Only `zabierz` uses it, and only three Zaklęcia use that: `seatId` is the
   * victim the spell was aimed at, and this is the caster it changes hands to.
   * Absent everywhere else, because nothing else in the box takes a card *for*
   * somebody.
   */
  toSeatId?: string;
  /**
   * An Obszar the player pointed at as they spoke.
   *
   * Only the Władca Gromu: „na Obszar w Kręgu, po którym wędrujesz. Wszystkie
   * istoty w tym Obszarze…" — so `wszyscy-tutaj` has to mean *there* rather
   * than where the caster is standing, which is the difference between taking a
   * turn from your rivals and taking one from yourself.
   */
  fieldId?: FieldId;
  /**
   * A Karta on the board the player pointed at as they spoke.
   *
   * Only `przyzwij` uses it, and only because that effect can be aimed at
   * either a Postać or a Wróg: „atakuje wybraną Postać lub Wroga". The seat is
   * carried by `seatId` as everywhere else; this is the other half of the same
   * question, and absent when the answer was a Postać.
   */
  fieldCardId?: string;
  /**
   * The Karta being resolved, where the effect is about the card itself.
   *
   * Only `poloz-karte` uses it: the Eremita, the Upiór and the Lewiatan all
   * settle *themselves* somewhere the die chooses, so the effect needs to know
   * which card it is. Absent when an effect is not about its own card, which is
   * every other one.
   */
  cardId?: string;
}

/** How many of a thing, in Polish. */
function amountOf(stat: "sword" | "magic" | "life" | "gold", count: number): string {
  if (stat !== "gold") {
    return { sword: "Miecza", magic: "Magii", life: "Życia" }[stat];
  }
  return plural(count, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota");
}


function named(snapshot: Snapshot, row: SeatRow): string {
  return nameOfSeat(snapshot.users, row.seat_index);
}

/**
 * Applies one effect to one seat, as far as it goes.
 *
 * Pure, which it could not be until the things it reaches for were: every
 * branch below that used to be a database call is now another command, and
 * composing commands is all this does. The decision about whether an effect can
 * be applied at all is still `resolve.ts`'s, where it is tested against every
 * card in the box.
 *
 * Recursion threads the snapshot: each step reads a table that already shows
 * what the step before it wrote, which is what lets `po-kolei` spend gold it
 * just gained and a `gdy` read a Natura the branch above changed.
 */
/**
 * Whether a card the character is carrying waives what this Obszar costs.
 *
 * Nine cards do this and they are specific about both halves — which Obszar,
 * and which of its costs. The Rękawice keep the point of Życie on the Ruchome
 * Skały and nothing else; the Kij i Sznur keep the Przedmiot on the Bagna and
 * would not save a point of Życie anywhere. So the field is read off the seat
 * rather than passed in: this is asked in the middle of resolving an effect,
 * and where the character is standing is what the card is about.
 *
 * The Relikwiarz is why Natura is asked for. It spares a Dobra Postać at the
 * Czarci Młyn and a Zła one at the Studnia Wieczności, and nobody at the other.
 */
function sparedHere(
  snapshot: Snapshot,
  seatId: string,
  from: "life" | "utrata",
): boolean {
  const view = seatView(snapshot, seatId);
  return view.fieldId !== null && isSpared(view.abilities, view.fieldId, from, view.nature);
}

export async function applyEffect(
  snapshot: Snapshot,
  command: ApplyEffect,
  ports: CommandPorts,
): Promise<Outcome<Resolution>> {
  const done = await walk(snapshot, command, command.effect, command.reason, ports, [], null);
  if (!done.result.suspended) return done;
  return framed(snapshot, command, done);
}

/**
 * Writes the suspension down: a `script` frame with the cursor, and the fight
 * above it when a `walka` is what stopped the walk.
 *
 * This is where the stack earns its keep (docs/STACK.md, law 3): everything
 * the walk did before the stop has already landed in `done.writes`, the frame
 * remembers where it stood, and whatever finishes the frame above — the dice,
 * an answer — resumes it through `continueTopScript`.
 */
function framed(
  snapshot: Snapshot,
  command: ApplyEffect,
  done: Outcome<Resolution>,
): Outcome<Resolution> {
  const sus = done.result.suspended;
  if (!sus) return done;
  const after = apply(snapshot, done.writes);
  const frame: TurnPhase = {
    phase: "script",
    seatId: command.seatId,
    cardId: command.cardId ?? null,
    reason: command.reason,
    effect: command.effect,
    cursor: sus.cursor,
    ...(command.mark ? { mark: command.mark } : {}),
    ...(command.keep ? { keep: true } : {}),
  };
  const opened = openOver(
    push(after.game.turn_state, frame),
    after,
    command,
    sus.opens,
  );
  return {
    writes: mergeAll(done.writes, opened.said, { game: { turn_state: opened.state } }),
    result: done.result,
  };
}

/**
 * Puts what the step asked for on top of the script frame, whatever it was.
 *
 * One place rather than two, because `framed` and `continueTopScript` both
 * suspend and both have to open the same things the same way — the second and
 * third `walka` in a card go through the resume path, not the first one's.
 */
function openOver(
  state: TurnState,
  after: Snapshot,
  command: { seatId: string; shuffle: Shuffle },
  opens: Opens | undefined,
): { state: TurnState; said: Changeset } {
  if (!opens) return { state, said: {} };
  if (opens.kind === "walka") {
    const fight = fightOver(state, after, command.seatId, opens);
    return { state: push(state, fight.phase), said: fight.said };
  }
  // The cards come off the pile here and wait on the frame — see `peekSpells`.
  // Null would mean the pile emptied between the step deciding to ask and this
  // running, which cannot happen inside one commit; the card simply carries on
  // rather than standing on a question nobody can answer.
  const looked = peekSpells(after, command.seatId, command.shuffle);
  if (!looked) return { state, said: {} };
  return { state: push(state, looked.frame), said: looked.writes };
}

/**
 * The fight a `walka` step opens, built the way `beginNamedFight` builds one —
 * same shape, same journal line — off the field frame beneath the script, so
 * that closing it pops back to the card mid-sentence.
 */
function fightOver(
  state: TurnState,
  after: Snapshot,
  seatId: string,
  opens: { nazwa: string; miecz?: number; magia?: number },
): { phase: TurnPhase; said: Changeset } {
  const field = [...state.stack].reverse().find((one) => one.phase === "field");
  if (!field || field.phase !== "field") throw new Error("Walka poza Obszarem.");
  return {
    phase: startFight(
      field,
      {
        cardId: `pole:${opens.nazwa}`,
        cardName: opens.nazwa,
        ...(opens.magia !== undefined ? { magia: opens.magia } : { miecz: opens.miecz }),
        settles: [],
      },
      pointsOf(after, seatId, "walka"),
    ),
    said: {
      journal: [
        {
          seatId,
          round: after.game.round,
          kind: "fight-start",
          payload: { nazwa: opens.nazwa, enemyTotal: opens.miecz ?? opens.magia },
        },
      ],
    },
  };
}

/**
 * Resumes the `script` frame on top of the stack.
 *
 * The walk goes back down the cursor without executing anything — a `rzut`
 * face is read off the cursor rather than rolled again, a `gdy` takes the
 * branch it took, a `po-kolei` skips the steps whose writes already landed —
 * and picks up at the node it stopped at: a settled `walka` counts as done and
 * the steps after it run; a question runs now against `decided`.
 *
 * Completion pops the frame and pays the card's debts — `mark` onto the field
 * frame's resolved list, `keep` for the two Spotkania that stay as Przyjaciele
 * — exactly what `resolveDrawnCard` does for a card that never suspended. A
 * second suspension replaces the cursor and, for a second `walka`, opens the
 * next fight.
 */
export async function continueTopScript(
  snapshot: Snapshot,
  command: { decided?: Decisions; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<Resolution>> {
  const state = snapshot.game.turn_state;
  const frame = top(state);
  if (frame.phase !== "script") throw new Error("Nic tu nie czeka na dokończenie.");

  const carried: ApplyEffect = {
    seatId: frame.seatId,
    effect: frame.effect,
    reason: frame.reason,
    decided: command.decided,
    shuffle: command.shuffle,
    ...(frame.cardId ? { cardId: frame.cardId } : {}),
    ...(frame.mark ? { mark: frame.mark } : {}),
    ...(frame.keep ? { keep: true } : {}),
  };
  const done = await walk(snapshot, carried, frame.effect, frame.reason, ports, [], frame.cursor);

  const sus = done.result.suspended;
  if (sus) {
    // Still not finished: the frame stays, with the new cursor — and a second
    // `walka` opens its fight above it, the same way the first did.
    const after = apply(snapshot, done.writes);
    const opened = openOver(
      replaceTop(after.game.turn_state, { ...frame, cursor: sus.cursor }),
      after,
      { seatId: frame.seatId, shuffle: command.shuffle },
      sus.opens,
    );
    return {
      writes: mergeAll(done.writes, opened.said, { game: { turn_state: opened.state } }),
      result: done.result,
    };
  }

  // Complete: the frame comes off, and the card's debts are paid on what is
  // revealed beneath.
  const popped = pop(apply(snapshot, done.writes).game.turn_state);
  const settled = merge(done.writes, { game: { turn_state: popped } });
  const after = apply(snapshot, settled);
  const noted = frame.mark ? markResolved(after, frame.mark) : {};
  const kept: Changeset =
    frame.keep && frame.cardId
      ? {
          holdings: {
            insert: [
              {
                seat_id: frame.seatId,
                card_id: frame.cardId,
                kind: "friend" as const,
                face: "open" as const,
              },
            ],
          },
        }
      : {};
  return {
    writes: mergeAll(settled, noted, kept),
    result: { did: done.result.did, pending: null },
  };
}

async function walk(
  snapshot: Snapshot,
  command: ApplyEffect,
  effect: Effect,
  reason: string,
  ports: CommandPorts,
  /** The path taken to this node — one index per branching ancestor. */
  path: number[],
  /**
   * Resume mode: the remaining cursor to follow down without executing.
   * Null is the ordinary walk. An empty array means *this* node is the one the
   * walk stopped at — a settled `walka` counts as done, a question runs now.
   */
  follow: number[] | null,
): Promise<Outcome<Resolution>> {
  const { seatId, shuffle } = command;
  const decided = command.decided ?? {};
  const nothing = (did: string[]): Outcome<Resolution> => ({
    writes: {},
    result: { did, pending: null },
  });
  const owed = (): Outcome<Resolution> => ({
    writes: {},
    result: { did: [], pending: effect, suspended: { cursor: path } },
  });

  // The node the walk stopped at last time, met again on the way back down.
  // A fight was settled outside the card (that is what the frame above was
  // for), so it counts as done here; anything else is a question whose answer
  // has just arrived and runs through the ordinary branches below.
  if (
    follow !== null &&
    follow.length === 0 &&
    (effect.op === "walka" || effect.op === "zaklecie")
  ) {
    return nothing([]);
  }

  // A decision the player has already made turns an unsettled effect into a
  // settled one, so this is asked after the choices have been consumed rather
  // than before.
  if (effect.op === "wybor") {
    const pick = follow !== null && follow.length > 0 ? follow[0] : decided.choices?.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    if (!option || pick === undefined) return owed();
    const done = await walk(
      snapshot,
      command,
      option.effect,
      `${reason}: ${option.label}`,
      ports,
      [...path, pick],
      follow !== null && follow.length > 0 ? follow.slice(1) : null,
    );
    // The label only when it adds something. An option called "+1 Magii" whose
    // effect reports "+1 Magii" would otherwise be written down twice.
    const said =
      done.result.did[0] === option.label ? done.result.did : [option.label, ...done.result.did];
    return { writes: done.writes, result: { did: said, pending: done.result.pending } };
  }

  /**
   * The Władca Zdarzeń, whose two halves are both the player's to point at.
   *
   * Gated here beside `przenies` rather than inside the settled switch, for the
   * same reason: the destination arrives as a decision, and until it does the
   * effect is owed rather than done. Which Karta is the other half, and it came
   * with the casting — a Zaklęcie names its target as it is spoken.
   */
  if (effect.op === "przenies-karte") {
    const lying = snapshot.fieldCards.find((row) => row.id === command.fieldCardId);
    if (!lying) throw new Error("Wskaż odkrytą Kartę na planszy.");
    const where = decided.destination;
    if (!where) return owed();

    const from = asFieldId(lying.field_id);
    if (from === null) throw new Error("Ta Karta nie leży na Obszarze.");
    if (where === from) throw new Error("Ta Karta już tam leży.");
    // „na innym Obszarze w tym samym Kręgu" — the ring the Karta is on, not the
    // one the caster is standing on: 9.6 lets a Zaklęcie reach anywhere, and
    // what is being moved is the card.
    if (!ringFields(from).includes(where)) {
      throw new Error(`${fieldName(where)} jest w innym Kręgu (11.2).`);
    }
    // „Nowy Obszar nie może być zajęty przez inną Postać."
    const standing = snapshot.seats.find(
      (one) => !one.eliminated && one.field_id === where,
    );
    if (standing) throw new Error(`Na ${fieldName(where)} stoi Postać — wybierz inny Obszar.`);

    return {
      // Off one Obszar and onto the other, which is what the card describes —
      // „zdjąć z planszy… i położyć" — and what a `fieldCards` changeset can
      // say: rows come and go, they do not move. The mark travels with it, so a
      // conjured Karta stays conjured wherever it is put down.
      writes: {
        fieldCards: {
          delete: [lying.id],
          insert: [{ field_id: where, card_id: lying.card_id, granted: lying.granted }],
        },
      },
      result: {
        did: [`${cardName(lying.card_id)} → ${fieldName(where)}`],
        pending: null,
      },
    };
  }

  if (effect.op === "przenies" && effect.to.kind !== "pole") {
    const where = decided.destination;
    if (!where) return owed();
    const moved = placeSeat(snapshot, { seatId, target: where, reason });
    return {
      writes: moved.writes,
      result: {
        did: [`przenosisz się na: ${FIELDS.get(where)?.name ?? where}`],
        pending: null,
      },
    };
  }

  /**
   * Where a Karta settles, when the card names a list rather than one Obszar.
   *
   * "Lewiatan może pojawić się na Mokradłach, przy Przeprawie lub na Bagnach —
   * połóż jego Kartę na którymś z tych Obszarów, **nie zajętym przez inną
   * Postać** (jeśli nie ma takiego Obszaru, odłóż Kartę)."
   *
   * All three sentences are here: the list is the card's, the occupied Obszary
   * are struck off it, and an empty list is the Karta going to the used pile
   * rather than the monster appearing on somebody's head. One Obszar left is
   * not a choice and nobody is asked.
   *
   * Above the gate for the same reason `przenies` is: pointing at the board is
   * what makes this unsettled, and the gate would hand it back as a question
   * even once it had been answered. The chosen Obszar is written back into the
   * node as a `pole`, so the settled form below does the work and there is one
   * place a Karta is laid down.
   */
  if (effect.op === "poloz-karte" && effect.gdzie.kind === "jedno-z" && command.cardId) {
    const free = effect.gdzie.fieldIds.filter(
      (fieldId) => !snapshot.seats.some((one) => !one.eliminated && one.field_id === fieldId),
    );
    if (free.length === 0) {
      const shelf = top(snapshot.game.turn_state);
      const off: Changeset =
        shelf.phase === "field"
          ? {
              game: {
                turn_state: replaceTop(snapshot.game.turn_state, {
                  ...shelf,
                  drawn: shelf.drawn.filter((entry) => entry.cardId !== command.cardId),
                }),
              },
            }
          : {};
      /**
       * With its mark, because `putOnPile` reads it: a conjured Karta belongs
       * to no pile and must not join one, or 9.5 deals a copy the deck still
       * holds. Every other door to the pile passes it (`asReturnable`); this
       * one named the card and nothing else.
       */
      const granted =
        shelf.phase === "field" &&
        shelf.drawn.some((entry) => entry.cardId === command.cardId && entry.granted);
      const back = putOnPile(apply(snapshot, off), "events", [
        { cardId: command.cardId, granted },
      ]);
      return {
        writes: merge(off, back),
        result: {
          did: [`${cardName(command.cardId)}: nie ma wolnego Obszaru — Karta wraca na stos`],
          pending: null,
        },
      };
    }
    const where =
      decided.destination && free.includes(decided.destination)
        ? decided.destination
        : free.length === 1
          ? free[0]
          : null;
    if (where === null) return owed();
    return walk(
      snapshot,
      command,
      { ...effect, gdzie: { kind: "pole", fieldId: where } },
      reason,
      ports,
      path,
      follow,
    );
  }

  /**
   * A loss the holder must choose from is unsettled until they have chosen —
   * and an answer waiting in the queue is them having chosen. 5.6 makes which
   * card goes their decision, so it arrives the same way every other decision
   * does, and the branch below takes it out of the queue.
   *
   * Written here rather than inside `isSettled` because that function is the
   * browser's too and answers about an effect alone, with no decisions in hand.
   *
   * `zabierz` is the same shape from the other side — somebody has to say which
   * card changes hands — so it passes the same way once they have.
   */
  /**
   * A sequence is walked before the gate, because its settledness is its steps'
   * business and not its own.
   *
   * `isSettled` calls a `po-kolei` settled only when *every* step is, so one
   * step holding a question refused the whole card — the Eremita rolls for
   * where he settles and then offers a choice of two Karty, and that choice
   * made the roll unreachable. Each step is gated on its own merits now, and
   * the first one nobody has answered still stops the sequence: what follows
   * may depend on it, and doing the rest first would resolve the card out of
   * its own order.
   */
  if (effect.op === "po-kolei") {
    /**
     * Steps run in order and each one's writes land as it finishes — the
     * all-or-nothing gate that used to stand here died with the stack. A step
     * that suspends stops the sequence where it stands: what came before is
     * written, the cursor remembers the step, and the resume continues from
     * the step after it (or into it, for a question just answered).
     */
    const start = follow !== null && follow.length > 0 ? follow[0] : 0;
    const did: string[] = [];
    let writes: Changeset = {};
    for (let at = start; at < effect.steps.length; at += 1) {
      // Each step reads what the ones before it wrote — including, on a
      // resume, everything the suspended walk wrote in earlier commits, which
      // is already in the snapshot itself.
      const done = await walk(
        apply(snapshot, writes),
        command,
        effect.steps[at],
        reason,
        ports,
        [...path, at],
        at === start && follow !== null && follow.length > 0 ? follow.slice(1) : null,
      );
      writes = merge(writes, done.writes);
      if (done.result.suspended) {
        return {
          writes,
          result: { did, pending: done.result.pending, suspended: done.result.suspended },
        };
      }
      did.push(...done.result.did);
    }
    return { writes, result: { did, pending: null } };
  }

  /**
   * A die table is rolled before the gate, because the gate asks about the
   * whole table and a throw lands on one row of it.
   *
   * `isSettled` calls a `rzut` settled only when *every* face is, which is the
   * right answer for the browser — it cannot know the face before the die is
   * thrown — and the wrong one here. Fatum has a choice on its fifth face and
   * nothing else, and that one row made the other five unreachable: the table
   * was refused whole for a question only one of its outcomes asks.
   *
   * `resolveFieldOffer` and `resolveDrawnCard` roll a table that *is* the whole
   * effect and hand the face down; this is every other one, and it journals the
   * die the same way, because a table that rolled silently is a table nobody
   * can check.
   */
  if (effect.op === "rzut") {
    // On a resume the face is read off the cursor, not rolled again: the die
    // was thrown and journalled in the commit that suspended, and a table that
    // rolled twice for one visit would be a different table.
    const following = follow !== null && follow.length > 0;
    // Two dice are two throws and a sum, not one throw of a bigger die: the
    // distribution is the whole point of a 2-12 table.
    const face = following
      ? follow[0]
      : effect.kostki === 2
        ? (await ports.random.rollD6(`${reason}: tabela (1)`)) +
          (await ports.random.rollD6(`${reason}: tabela (2)`))
        : await ports.random.rollD6(`${reason}: tabela`);
    const rolled: Changeset = following
      ? {}
      : {
          journal: [
            {
              seatId,
              round: snapshot.game.round,
              kind: "field-table",
              payload: { offer: reason, face },
            },
          ],
        };
    const landed = effect.faces[face];
    if (!landed) return { writes: rolled, result: { did: [`${face}: nic`], pending: null } };
    const done = await walk(
      apply(snapshot, rolled),
      command,
      landed,
      `${reason} (${face})`,
      ports,
      [...path, face],
      following ? follow.slice(1) : null,
    );
    return {
      writes: merge(rolled, done.writes),
      result: {
        did: done.result.did,
        pending: done.result.pending,
        ...(done.result.suspended ? { suspended: done.result.suspended } : {}),
      },
    };
  }

  /**
   * A condition the app can test is the app's to test, and only the branch it
   * takes is anybody's to answer.
   *
   * Handled here rather than in the switch, beside `wybor` and `przenies`, for
   * the reason those are: the gate below asks `isSettled` of the whole effect,
   * and a `gdy` counts as unsettled while *either* branch holds a question. The
   * Czarci Młyn is exactly that — a Dobra Postać there simply loses a point of
   * Życie, and it was the Zły branch's "możesz wezwać Siły Ciemności" that made
   * the Obszar unanswerable for all three Natury at once.
   *
   * `resolve.ts` already draws the line here: the browser cannot test a
   * condition without a Snapshot, so it leaves the question to the server, and
   * this is the server getting there.
   */
  if (effect.op === "gdy") {
    const seat = snapshot.seats.find((s) => s.id === seatId);
    if (!seat) throw new Error("Nieznane miejsce.");
    const nature = seat.nature as Nature | null;
    const holds =
      effect.warunek.is === "natura"
        ? nature !== null && effect.warunek.jedna_z.includes(nature)
        : effect.warunek.is === "ma-zloto"
          ? seat.gold > 0
          : // What the character did earlier, which 13.3 wrote down for the one
            // card that asks.
            effect.warunek.is === "attacker"
            ? hasAttacked(statusesOf(snapshot, seat.id))
            : /**
               * `prog` reads the **parametr**, not the żetony.
               *
               * The two Obszary that ask say "każdy, kto tu trafi o Magii
               * mniejszej niż 5" (Labirynt) and "jeżeli jego Miecz jest
               * mniejszy niż 5 punktów" (Spalona Ziemia). Neither says
               * "własnej", and 1.5's worked example settles what a bare
               * "Miecz" means for a character: "Troll posiada parametr Miecza
               * równy 8 (6+1+1)" — own plus what the cards lend.
               *
               * It read `sword_own` / `magic_own`, so a character with Magia 3
               * and a Pierścień Mocy had a parametr of 5 and still got lost in
               * the Labirynt. Not `walka`: neither Obszar is a fight, which is
               * the same line the Trzęsawiska and the six Most ordeals draw.
               */
              (effect.warunek.stat === "sword"
                ? pointsOf(snapshot, seat.id, "parametr").miecz
                : pointsOf(snapshot, seat.id, "parametr").magia) < effect.warunek.ponizej;
    // On a resume the branch is the one taken, off the cursor: the fight the
    // suspension was for may itself have changed what the condition reads.
    const following = follow !== null && follow.length > 0;
    const taken = following ? follow[0] === 0 : holds;
    const branch = taken ? effect.to : effect.inaczej;
    return branch
      ? walk(
          snapshot,
          command,
          branch,
          reason,
          ports,
          [...path, taken ? 0 : 1],
          following ? follow.slice(1) : null,
        )
      : nothing(["warunek niespełniony — nic się nie dzieje"]);
  }

  /**
   * A Karta that borrows an Obszar's own table.
   *
   * "Możesz modlić się na takich samych zasadach, jak w Świątyni Bogini Nemed"
   * — the two Kapliczki, and nothing else in the box. The table is already
   * encoded, two dice and eleven faces of it, so the card runs *that* rather
   * than a second copy: a Kapliczka whose prayer had drifted from the
   * Świątynia's would be the worse of the two bugs available here.
   *
   * Handled up here beside `rzut` and `gdy`, and for the same reason they are:
   * the gate below asks `isSettled` of the whole effect, and both Świątynie's
   * prayers hold a `wybor` on one face or another — so a borrowed table is
   * never "settled" and would be owed back as a question the moment it was
   * asked for. What it actually is is a die table, which the app rolls.
   *
   * The offer is taken by position because a borrowed table has one: both
   * Świątynie offer exactly "Modlitwa", and a card that borrowed a field with
   * several would have to name which, which is a question no card asks.
   */
  if (effect.op === "jak-pole") {
    const borrowed = FIELD_SCRIPTS[effect.fieldId]?.offers[0];
    if (!borrowed) throw new Error(`${fieldName(effect.fieldId)} nie ma tabeli do pożyczenia.`);
    const done = await walk(
      snapshot,
      command,
      borrowed.effect,
      `${reason}: ${fieldName(effect.fieldId)}`,
      ports,
      [...path, 0],
      follow !== null && follow.length > 0 ? follow.slice(1) : follow,
    );
    return {
      writes: done.writes,
      result: {
        ...done.result,
        did: [`jak ${fieldName(effect.fieldId)}: ${borrowed.name}`, ...done.result.did],
      },
    };
  }

  const holderPicks =
    (effect.op === "strata" || effect.op === "zabierz") &&
    !isSettled(effect) &&
    (decided.choices?.length ?? 0) > 0;
  if (!isSettled(effect) && !holderPicks) return owed();

  switch (effect.op) {
    case "nic":
      return nothing(["nic się nie dzieje"]);

    /**
     * A Karta the Obszar hands you outright.
     *
     * "otrzymujesz Magiczny Miecz (jeżeli jeszcze jakieś są)" at the Świątynia
     * Bogini Nemed, and the Tarcza Tolimana at the other one. The parenthesis
     * is 21.2's stock rule and needs nothing here: `takeCard` already refuses
     * when the Wyposażenie has none left, along with 5.3's Natura restriction
     * and 5.4's carrying limit, and each of those is a real reason a character
     * walks away empty-handed. The refusal is reported rather than swallowed,
     * because "nie ma już ani jednej" and "twoja Natura nie pozwala" are things
     * a table will otherwise argue about.
     *
     * Declared in the vocabulary from the start and never implemented — no card
     * used it, and the two Obszary that do were not scripted until now.
     */
    /**
     * Puts the character under something that lasts.
     *
     * Delegated to `addEffect` rather than writing the row here, so a status a
     * card causes and a status the test console conjures reach `seat_effects`
     * by the same door and get the same journal line. 1.2 and 2.2 are why it is
     * a row and not an adjustment: an effect is added at read time and never
     * written into own points, or it would outlive its own expiry.
     */
    case "efekt": {
      /**
       * One seat, or everybody the card names.
       *
       * The same loop `punkty` and `tura-stracona` run, and for the same
       * reason: „żaden gracz, łącznie z tobą" is a fact about the table rather
       * than about whoever spoke it. Chained through `apply` so two seats
       * cannot be given the same row id.
       */
      const hit = effect.target
        ? targeted(snapshot, seatId, effect.target, undefined, command.fieldId)
        : null;
      const seats = hit
        ? hit
            .map(
              (one) =>
                snapshot.seats.find((row) => row.seat_index === one.seatIndex)?.id ?? null,
            )
            .filter((id): id is string => id !== null)
        : [seatId];
      let writes: Changeset = {};
      for (const id of seats) {
        writes = merge(
          writes,
          addEffect(apply(snapshot, writes), {
            seatId: id,
            effect: {
              source: reason,
              label: effect.label,
              modifier: effect.modifier,
              ends: effect.ends,
            },
          }),
        );
      }
      return { writes, result: { did: [effect.label], pending: null } };
    }

    /**
     * A die for each card of a kind, thrown for that card alone.
     *
     * Both Urwiska: "Rzuć także za każdego z Przyjaciół: 1 lub 2 oczka
     * Przyjaciel traci Życie (odłóż jego kartę)." A character with four
     * Przyjaciele throws four times and may lose all of them or none, which is
     * why this is neither a `strata` (nobody chooses) nor a `rzut` (one die
     * settling one outcome for the whole seat).
     *
     * 6.4 sends a Przyjaciel who dies to the used pile, which is where a
     * discarded Przedmiot goes too — neither is left on the Obszar, because
     * nobody put it down.
     */
    case "rzut-za-kazdego": {
      // The board names the kinds in Polish and the rows are stored in the
      // engine's own words; `reachableBy` is the one place that translation
      // lives, so a loss and a roll agree about what a Przyjaciel is.
      const kind = reachableBy(effect.co);
      const mine = snapshot.holdings.filter(
        (held) => held.seat_id === seatId && held.kind === kind,
      );
      if (mine.length === 0) {
        return nothing([`nie masz ${effect.co === "przyjaciel" ? "Przyjaciół" : "Przedmiotów"}`]);
      }

      const gone: typeof mine = [];
      const said: string[] = [];
      for (const held of mine) {
        const die = await ports.random.rollD6(`${reason}: ${held.card_id}`);
        if (die <= effect.gubiPrzy) {
          gone.push(held);
          said.push(`${cardName(held.card_id)} przepada (${die})`);
        } else {
          said.push(`${cardName(held.card_id)} zostaje (${die})`);
        }
      }
      if (gone.length === 0) return nothing(said);

      const lifted: Changeset = { holdings: { delete: gone.map((held) => held.id) } };
      const piled = putOnPile(apply(snapshot, lifted), "events", gone.map(asReturnable));
      return {
        writes: mergeAll(lifted, piled, {
          journal: gone.map((held) => ({
            seatId,
            round: snapshot.game.round,
            kind: "lost-card" as const,
            payload: { cardId: held.card_id, kind: held.kind },
          })),
        }),
        result: { did: said, pending: null },
      };
    }

    /**
     * Rid of a named card and everything it laid on you.
     *
     * "Po wizycie u Pustelnika odłóż Kartę." One act, so both halves here: the
     * statuses that card gave go, and the Karta goes to the used pile with
     * them. Statuses are matched on `source`, which `applyEffect` fills with the
     * printed name — the reason a player was given is the reason they read.
     *
     * Nothing at all when the character is not carrying it, which is a visit to
     * the Pustelnia by somebody who never met the Zły Duch.
     */
    case "uwolnij": {
      const name = cardName(effect.od);
      const held = statusesOf(snapshot, seatId);
      const left = held.filter((status) => status.source !== name);
      const card = snapshot.holdings.find(
        (h) => h.seat_id === seatId && h.card_id === effect.od,
      );
      if (left.length === held.length && !card) return nothing([`${name} — nic cię nie trzyma`]);

      const lifted: Changeset = card ? { holdings: { delete: [card.id] } } : {};
      const piled = card
        ? putOnPile(apply(snapshot, lifted), "events", [asReturnable(card)])
        : {};
      return {
        writes: mergeAll(keepOnly(snapshot, seatId, left), lifted, piled),
        result: { did: [`uwalniasz się od: ${name}`], pending: null },
      };
    }

    /**
     * A card taken off the victim and handed to the caster.
     *
     * Not a `strata`: what is taken changes hands and is still in the game,
     * which is the whole of the Pan Przyjaciół — "dołączyć go do swoich".
     *
     * Which card goes is answered the same way every other choice is, as an
     * index into the candidates. Whose answer it is differs by card and is the
     * data's business, not this function's: 5.6 gives it to the victim, and
     * Szaleństwo's own text takes it back — "obejrzeć Zaklęcia i wybrać jedno
     * z nich", the one place a hand held under 9.3 is opened to somebody else.
     */
    case "zabierz": {
      const taker = command.toSeatId;
      if (!taker) return nothing(["nie wiadomo, komu miałoby przypaść"]);
      if (taker === seatId) return nothing(["nie zabierasz Kart samemu sobie"]);

      // "jeden Przedmiot lub jedną Sztukę Złota" — the coin is the simpler half
      // and is taken when the victim has no Przedmiot to give.
      const kind = effect.co === "przedmiot-lub-zloto" ? "item" : reachableBy(effect.co);
      const mine = snapshot.holdings.filter(
        (held) => held.seat_id === seatId && held.kind === kind,
      );

      if (mine.length === 0) {
        const victim = snapshot.seats.find((one) => one.id === seatId);
        if (effect.co === "przedmiot-lub-zloto" && victim && victim.gold > 0) {
          return {
            writes: {
              seats: [
                { id: victim.id, patch: { gold: victim.gold - 1 } },
                ...snapshot.seats
                  .filter((one) => one.id === taker)
                  .map((one) => ({ id: one.id, patch: { gold: one.gold + 1 } })),
              ],
            },
            result: { did: ["zabierasz 1 Sztukę Złota"], pending: null },
          };
        }
        return nothing(["nie ma czego zabrać"]);
      }

      const picked = decided.choices?.shift();
      if (picked === undefined) return owed();
      const at = Math.min(Math.max(0, Math.trunc(picked)), mine.length - 1);
      const card = mine[at];

      return {
        writes: {
          holdings: {
            patch: [{ id: card.id, patch: { seat_id: taker, slot: null, ordinal: null } }],
          },
          journal: [
            {
              seatId: taker,
              round: snapshot.game.round,
              kind: "taken",
              payload: { cardId: card.card_id, kind: card.kind, od: seatId },
            },
          ],
        },
        result: { did: [`zabierasz: ${cardName(card.card_id)}`], pending: null },
      };
    }

    /**
     * The Karta settles somewhere the board chose rather than staying where it
     * was drawn.
     *
     * Three do it — the Eremita, the Upiór and the Lewiatan — and all three roll
     * for the Obszar, which is why the destination is a `pole` and not a
     * question. It comes off the turn's own stack, because a card that has gone
     * to live somewhere else is not one of the Karty this character still has
     * to deal with (16.8).
     */
    case "poloz-karte": {
      if (!command.cardId) return nothing(["nie wiadomo, którą Kartę położyć"]);
      // A list of Obszary is answered before the gate above and arrives here as
      // the one that was chosen — see the `jedno-z` block there.
      if (effect.gdzie.kind !== "pole") return owed();
      const chosen = effect.gdzie.fieldId;

      const state = top(snapshot.game.turn_state);
      const lifted: Changeset =
        state.phase === "field"
          ? {
              game: {
                turn_state: replaceTop(snapshot.game.turn_state, {
                  ...state,
                  drawn: state.drawn.filter((entry) => entry.cardId !== command.cardId),
                }),
              },
            }
          : {};
      const granted =
        state.phase === "field" &&
        (state.drawn.find((entry) => entry.cardId === command.cardId)?.granted ?? false);

      return {
        writes: merge(lifted, {
          fieldCards: {
            insert: [{ field_id: chosen, card_id: command.cardId, granted }],
          },
          journal: [
            {
              seatId,
              round: snapshot.game.round,
              kind: "left-behind",
              payload: { cardId: command.cardId, field: chosen },
            },
          ],
        }),
        result: {
          did: [`${cardName(command.cardId)} osiada na: ${fieldName(chosen)}`],
          pending: null,
        },
      };
    }

    case "otrzymaj": {
      const found = cardIdNamed(effect.co);
      if (!("id" in found)) {
        return nothing([`${effect.co} — nie wiadomo, o którą Kartę chodzi`]);
      }
      try {
        const taken = takeCard(snapshot, { seatId, cardId: found.id });
        return {
          writes: taken.writes,
          result: { did: [`otrzymujesz: ${cardName(found.id)}`], pending: null },
        };
      } catch (refused) {
        return nothing([(refused as Error).message]);
      }
    }

    case "punkty": {
      const hit = targeted(snapshot, seatId, effect.target, [], command.fieldId);
      // Waits for somebody to arrive, or for the holder to choose.
      if (hit === null) return owed();
      if (hit.length === 0) return nothing(["nikogo to nie dotyczy"]);

      let writes: Changeset = {};
      /** What the seats actually moved by, which the floor under own points may cut. */
      const each: number[] = [];
      /** Whoever a card carried them past it — said, or the table sees nothing happen. */
      const spared: string[] = [];
      for (const target of hit) {
        const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
        if (!row) continue;
        /**
         * "nie stracisz 1 punktu Życia na Ruchomych Skałach."
         *
         * Only a loss, and only Życie. These cards say what an Obszar will not
         * do *to* you; none of them declines a gift, and the Rękawice are no
         * help against a card that takes a point of Miecza.
         */
        if (effect.stat === "life" && effect.delta < 0 && sparedHere(snapshot, row.id, "life")) {
          spared.push(named(snapshot, row));
          continue;
        }
        const done = adjustSeat(apply(snapshot, writes), {
          seatId: row.id,
          stat: effect.stat,
          delta: effect.delta,
          reason,
          // A card doing what the card says is the opposite of somebody
          // overruling the referee, and the journal draws those differently.
          record: { kind: "points", manual: false },
        });
        writes = merge(writes, done.writes);
        each.push(done.result.moved);
      }
      const sign = effect.delta > 0 ? "+" : "−";
      const many = Math.abs(effect.delta);
      const asked = `${sign}${many} ${amountOf(effect.stat, many)}`;
      /**
       * What it did, and not what the card asked for.
       *
       * 1.3 and 2.3 put a floor under own points, so a card taking a Magia off
       * a character that has none to give does nothing — and this line, read
       * off the delta, used to say "−1 Magii" anyway. The player then holds a
       * card that plainly did not work and a message saying it did.
       */
      const stopped = each.length > 0 && each.every((moved) => moved === 0);
      const safely = spared.map((who) => `${who}: bez zmiany — Karta chroni na tym Obszarze`);
      return {
        writes,
        result: {
          did: [
            ...(each.length > 0
              ? [stopped ? `${asked} — bez zmiany, nie ma poniżej czego zejść` : asked]
              : []),
            ...safely,
          ],
          pending: null,
        },
      };
    }

    case "tura-stracona": {
      const hit = targeted(snapshot, seatId, effect.target, effect.oprocz ?? [], command.fieldId);
      if (hit === null) return owed();
      if (hit.length === 0) return nothing(["nikogo to nie dotyczy"]);

      const actor = snapshot.seats.find((s) => s.id === seatId);
      const names: string[] = [];
      const seats: { id: string; patch: { turns_lost: number } }[] = [];
      const lines: Changeset["journal"] = [];

      for (const target of hit) {
        const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
        if (!row) continue;
        /**
         * 16.1 spends the loss on the turn in progress, not on a future one.
         *
         * "Jeżeli spowodowałoby to utratę tury przez Postać, musi ona
         * powstrzymać się od podejmowania jakichkolwiek dalszych działań — TA
         * WŁAŚNIE tura liczy się jako stracona." The player who draws the
         * Karczma's 3 has already moved and already arrived; what the card
         * takes is the rest of that turn.
         *
         * Everybody else banks it, because for them it is genuinely a turn that
         * has not started: the Burza costs a turn to characters who are not
         * playing at the time.
         */
        const isPlaying = row.seat_index === snapshot.game.active_seat;
        seats.push({
          id: row.id,
          patch: { turns_lost: row.turns_lost + (isPlaying ? effect.turns - 1 : effect.turns) },
        });
        lines.push({
          seatId: row.id,
          round: snapshot.game.round,
          kind: "turn-lost",
          payload: { turns: effect.turns, reason },
        });
        names.push(named(snapshot, row));
      }

      /**
       * And the turn in progress stops here (16.1).
       *
       * "musi ona powstrzymać się od podejmowania jakichkolwiek dalszych
       * działań" — so the phase goes to `koniec`, where the only control left
       * is the one that passes play on. Without this the arithmetic above would
       * make the card do nothing at all to the player who drew it: it takes no
       * future turn from them, so it has to take this one.
       */
      const stops = hit.some((t) => t.seatIndex === snapshot.game.active_seat);
      const onlyMe = hit.length === 1 && hit[0].seatIndex === actor?.seat_index;

      return {
        writes: {
          seats,
          journal: lines,
          ...(stops ? { game: { turn_state: only(endTurn()) } } : {}),
        },
        result: {
          did: [onlyMe ? `tracisz ${effect.turns} turę` : `tracą turę: ${names.join(", ")}`],
          pending: null,
        },
      };
    }

    case "strata": {
      const hit = targeted(snapshot, seatId, effect.target, [], command.fieldId);
      if (hit === null) return owed();

      let writes: Changeset = {};
      const said: string[] = [];

      for (const target of hit) {
        const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
        if (!row) continue;

        /**
         * "Mając kij i mocny sznur możesz bezpiecznie przejść przez Bagna. Nie
         * tracisz tam Przedmiotu ani Przyjaciela."
         *
         * Read off where the character is standing, so the Kij i Sznur answer
         * for the Bagna and for nothing else. A Zaklęcie that strips a hand
         * somewhere else is untouched by it.
         */
        if (sparedHere(snapshot, row.id, "utrata")) {
          said.push(`${named(snapshot, row)}: nic nie traci — Karta chroni na tym Obszarze`);
          continue;
        }

        const at = apply(snapshot, writes);
        // A carried Zaklęcie is the Przyjaciel's, not the character's, so a
        // "strata" reaching for a Przedmiot or a Przyjaciel cannot pick it: it
        // goes when its friend goes and never on its own account. Written as a
        // flatMap so the narrowing is the compiler's too, not only the filter's.
        const mine = at.holdings.flatMap((held) =>
          held.seat_id === row.id && held.kind !== "carried"
            ? [{ id: held.id, cardId: held.card_id, kind: held.kind, granted: held.granted }]
            : [],
        );

        // Rolled before the choosing, because `chooseLosses` picks synchronously
        // and the dice are a port. Exactly as many as it can ask for — the
        // kind it reaches into, counted against what this seat actually holds —
        // so a scripted port is not charged for picks nobody makes.
        const kind = reachableBy(effect.co);
        const takesEverything =
          effect.co === "wszystkie-przedmioty" || effect.co === "wszystkie-zaklecia";
        const candidates =
          kind === null ? 0 : mine.filter((held) => held.kind === kind).length;
        const asks =
          effect.wybor === "losowo" && !takesEverything
            ? Math.min(effect.count ?? 1, candidates)
            : 0;
        // `chooseLosses` picks from a pool that shrinks by one each time, so the
        // bound of every ask is known before any of them happen — which is what
        // lets a synchronous chooser be driven by an asynchronous port without
        // guessing, and without spending a die on a pick nobody makes.
        const rolls: number[] = [];
        for (let i = 0; i < asks; i++) {
          rolls.push(await pickBelow(ports.random, candidates - i, "strata: co przepada"));
        }
        let next = 0;
        /**
         * Chance answers from the dice; the holder answers from the queue.
         *
         * 5.6 makes which card goes the holder's own decision, and the two are
         * answered the same way — an index into the candidates, clamped by
         * `chooseLosses` — so the only difference is where the number comes
         * from. A `ty` loss with nothing left in the queue gets null back and
         * stays pending, which is the question being asked rather than a card
         * being taken on the player's behalf.
         */
        const gone =
          effect.wybor === "losowo"
            ? chooseLosses(mine, effect, () => rolls[next++] ?? 0)
            : chooseLosses(mine, effect, () => decided.choices?.shift() ?? null);
        if (gone === null) return { writes, result: { did: [], pending: effect } };

        const gold = goldLost(effect, row.gold);
        if (gone.length === 0 && gold === 0) continue;

        const lost = mine.filter((held) => gone.includes(held.id));
        let step: Changeset = gone.length > 0 ? { holdings: { delete: gone } } : {};
        if (gone.length > 0) {
          // 6.4's "muszą zostać odrzuceni z innych przyczyn": a card taken by an
          // effect rather than put down by its owner is not left lying on the
          // Obszar — it is gone, and gone means the used pile. Chained, because
          // both piles write the same column.
          const spells = putOnPile(
            apply(at, step),
            "spells",
            lost.filter((h) => h.kind === "spell"),
          );
          const events = putOnPile(
            apply(at, mergeAll(step, spells)),
            "events",
            lost.filter((h) => h.kind !== "spell"),
          );
          step = mergeAll(step, spells, events);
        }
        if (gold > 0) {
          step = merge(step, { seats: [{ id: row.id, patch: { gold: row.gold - gold } }] });
        }

        const names = lost.map((held) => cardName(held.cardId));
        step = merge(step, {
          journal: [
            {
              seatId: row.id,
              round: snapshot.game.round,
              kind: "lost-card",
              payload: { co: effect.co, cardIds: lost.map((h) => h.cardId), gold: gold },
            },
          ],
        });
        writes = merge(writes, step);
        said.push(
          `${named(snapshot, row)}: ` +
            [names.join(", "), gold > 0 ? `${gold} Sz. Z.` : ""].filter(Boolean).join(", "),
        );
      }

      return {
        writes,
        result: {
          did:
            said.length > 0
              ? [`tracą ${lossTaken(effect)} — ${said.join("; ")}`]
              : ["nie ma czego stracić"],
          pending: null,
        },
      };
    }

    case "uzdrow": {
      // 4.7 refuses when there is nothing to restore, and a card offering a
      // heal to somebody already whole is not an error — it simply does nothing.
      try {
        const done = healSeat(snapshot, { seatId, amount: effect.upTo });
        return {
          writes: done.writes,
          result: { did: [`+${done.result} Życia (4.7)`], pending: null },
        };
      } catch {
        return nothing(["Życie już na poziomie początkowym"]);
      }
    }

    case "zaklecie": {
      let writes: Changeset = {};
      const names: string[] = [];

      /**
       * The Sztukmistrz's price, checked before the pile is touched.
       *
       * "za 1 Sztukę Złota" per Zaklęcie, so a purse that cannot cover the lot
       * buys none: this is a shop refusing a sale rather than a card doing half
       * of what it says. The coins are taken after the draw and only for the
       * Zaklęcia actually drawn — 2.6 or an empty pile may stop it short, and
       * nobody pays to be told their Magia is too low.
       */
      const buyer = effect.cena ? snapshot.seats.find((one) => one.id === seatId) : undefined;
      if (effect.cena && buyer && buyer.gold < effect.cena * effect.count) {
        return nothing([
          `Za mało złota: ${plural(effect.cena * effect.count, "Sztuka Złota", "Sztuki Złota", "Sztuk Złota")}.`,
        ]);
      }
      /**
       * A gift the character may not accept is reported, not thrown.
       *
       * 2.6 caps the hand by Magia and `drawSpell` refuses over it — which is
       * right, and used to abort the whole resolution: a Świątynia table whose
       * seventh row is a Zaklęcie would crash mid-prayer for a Postać with
       * Magia 0, losing the rows already applied. The same bargain `otrzymaj`
       * makes, and for the same reason: "your Magia does not allow it" is an
       * outcome a table needs told, not a stack trace.
       *
       * Anything drawn before the refusal is kept — the pile really did give
       * those up, and putting them back would need a second write nothing asked
       * for.
       */
      /**
       * The Chochlik turns this step into a question, so the card stops here.
       *
       * The draw is not made: the walk suspends and `framed` opens the `ask`
       * *above* the script frame, which is the only order that lets the card
       * carry on afterwards. Answering deals the chosen Zaklęcie and pops back
       * to this cursor, where the node counts as done.
       *
       * The price is paid before the suspension rather than after the answer.
       * A Nieznajomy selling a Zaklęcie for a Sztuka Złota is the one card with
       * both, and the coin buys the draw — which has happened by the time the
       * question is on screen, since the cards are already off the pile.
       *
       * Only for a single Zaklęcie. Every `zaklecie` in the box asks for one,
       * and a suspension part-way through a run of them would owe a second
       * question this frame has nowhere to remember.
       */
      if (effect.count === 1 && peekDue(snapshot, seatId)) {
        const paidUp: Changeset =
          effect.cena && buyer
            ? { seats: [{ id: buyer.id, patch: { gold: buyer.gold - effect.cena } }] }
            : {};
        return {
          writes: paidUp,
          result: {
            did: ["Zaklęcie: wybierasz jedną z dwóch"],
            pending: null,
            suspended: { cursor: path, opens: { kind: "ask" } },
          },
        };
      }

      for (let i = 0; i < effect.count; i++) {
        try {
          const done = drawSpell(apply(snapshot, writes), { seatId, shuffle, peek: false });
          writes = merge(writes, done.writes);
          if (done.result !== null) names.push(done.result);
        } catch (refused) {
          const said = (refused as Error).message;
          return {
            writes,
            result: {
              did: names.length > 0 ? [`Zaklęcie: ${names.join(", ")}`, said] : [said],
              pending: null,
            },
          };
        }
      }
      const paid =
        effect.cena && buyer && names.length > 0
          ? {
              seats: [
                { id: buyer.id, patch: { gold: buyer.gold - effect.cena * names.length } },
              ],
            }
          : {};
      return {
        writes: merge(writes, paid),
        result: {
          did: [
            `Zaklęcie: ${names.join(", ")}` +
              (effect.cena && names.length > 0
                ? ` (za ${effect.cena * names.length} Sz. Z.)`
                : ""),
          ],
          pending: null,
        },
      };
    }

    case "kamien":
      return {
        writes: turnToStone(snapshot, { seatId }),
        result: { did: ["Zamiana w Kamień (20.1)"], pending: null },
      };

    case "natura": {
      const done = changeNature(snapshot, { seatId, nature: effect.na });
      const name = NATURE_LABEL[effect.na] ?? effect.na;
      // Nothing written to the seat means the Natura was already the one the
      // card asks for. Saying "Natura: zła" there would report a turn of the
      // card that did not happen — see `changeNature`, which journals the
      // attempt for the same reason.
      const changed = (done.writes.seats?.length ?? 0) > 0;
      return {
        writes: done.writes,
        result: {
          did: [changed ? `Natura: ${name}` : `Natura bez zmian — już ${name}`],
          pending: null,
        },
      };
    }

    case "przenies": {
      if (effect.to.kind !== "pole") return owed();
      const moved = placeSeat(snapshot, { seatId, target: effect.to.fieldId, reason });
      return {
        writes: moved.writes,
        result: {
          did: [
            `przenosisz się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`,
          ],
          pending: null,
        },
      };
    }

    case "walka": {
      // A creature the card conjures rather than a card on the field. The walk
      // cannot fight — dice, spells and other seats live above it — so it
      // suspends here and `framed` opens the fight over the script frame.
      // Coming back down the cursor, the fight is done and this node with it.
      return {
        writes: {},
        result: {
          did: [`walka: ${effect.nazwa}`],
          pending: null,
          suspended: {
            cursor: path,
            opens: { kind: "walka", nazwa: effect.nazwa, miecz: effect.miecz, magia: effect.magia },
          },
        },
      };
    }

    case "wymien-karte": {
      /**
       * The Karta in front of the player goes back and another comes over.
       *
       * „Odrzucenie" is the used pile and not out of the game — `putOnPile`
       * knows what a conjured Karta and a Wyposażenie are — and the card that
       * replaces it is drawn by the same `drawCard` every other draw goes
       * through, so 15.5's reshuffle happens here too and says so in the
       * journal.
       *
       * Which Karta: the first one that has not been dealt with, which is what
       * 15.2's order means by "the one in front of you" and what the sheet is
       * showing when this may be spoken.
       */
      const state = top(snapshot.game.turn_state);
      if (state.phase !== "field") throw new Error("Nie ma wyciągniętej Karty do wymiany.");
      const settled = new Set([...(state.resolved ?? []), ...(state.fought ?? [])]);
      const facing = state.drawn.find((entry) => !settled.has(entry.cardId));
      if (!facing) throw new Error("Nie ma wyciągniętej Karty do wymiany.");

      const taken: Changeset = {
        game: {
          turn_state: replaceTop(snapshot.game.turn_state, {
            ...state,
            drawn: state.drawn.filter((entry) => entry !== facing),
          }),
        },
      };
      // Chained, not merged: the pile the discard writes is the same `game.deck`
      // the draw below reads and writes again.
      const back = putOnPile(apply(snapshot, taken), "events", [
        { cardId: facing.cardId, granted: facing.granted },
      ]);
      const drew = drawCard(apply(snapshot, mergeAll(taken, back)), {
        named: null,
        shuffle,
        byCard: true,
      });

      return {
        writes: mergeAll(taken, back, drew.writes),
        result: {
          did: [
            `${cardName(facing.cardId)} odrzucona, w zamian: ${
              drew.result.card?.name ?? "nowa Karta"
            }`,
          ],
          pending: null,
        },
      };
    }

    case "podejrzyj": {
      /**
       * The five that are actually next, off the same end `drawFrom` takes
       * from — a peek that showed a different five would be worse than none.
       *
       * Nothing is written: the cards stay where they are, in that order, and
       * the pile is not reshuffled to fill the count. A short pile shows what
       * it has, which is itself worth knowing at the table.
       */
      const deck = decksOf(snapshot.game).events;
      const top = deck.draw
        .slice(0, effect.count)
        .map((ref) => BY_REF.get(ref)?.name ?? ref);
      return {
        writes: {},
        result: {
          did: top.length > 0 ? [`na wierzchu: ${top.join(", ")}`] : ["stos jest pusty"],
          pending: null,
        },
      };
    }

    case "przyzwij": {
      /**
       * Sent at whoever was named as the Zaklęcie was spoken.
       *
       * `seatId` is the spell's target seat — `castSpell` puts the named Postać
       * there — and `fieldCardId` is the other kind of answer. Aimed at neither
       * it is a refusal rather than a creature turning on its caster: „wybraną
       * Postać lub Wroga" means somebody was chosen, and defaulting to the
       * caster is exactly how a Golem would end up eating its summoner.
       */
      const summoned = summonFighter(snapshot, {
        name: effect.nazwa,
        miecz: effect.miecz,
        spellId: command.reason,
        ...(command.fieldCardId !== undefined
          ? { fieldCardId: command.fieldCardId }
          : { targetSeatId: seatId }),
      });
      return {
        writes: summoned.writes,
        result: { did: [`${effect.nazwa} atakuje`], pending: null },
      };
    }

    case "ruch-dodatkowy":
      return nothing(["dodatkowy ruch — rzuć jeszcze raz"]);

    /**
     * A shop opening, which is all resolving the Karta does.
     *
     * Nothing changes hands here. The Targowisko „zostaje" — its disposition
     * lays it on the Obszar — and from then on `offerOn` finds it among the
     * Karty lying there, so `buy` and `sell` work against it exactly as they do
     * against a shop printed on the board. Buying is the player's own move,
     * made when they like and as often as the stock allows; it was never this
     * card's job to ask.
     */
    case "kup":
    case "sprzedaj":
      return {
        writes: {},
        result: {
          did: [
            effect.op === "kup"
              ? `otwarte na sprzedaż: ${effect.towar.map((one) => one.co).join(", ")}`
              : "można tu sprzedawać",
          ],
          pending: null,
        },
      };

    case "wyciagnij": {
      let writes: Changeset = {};
      for (let i = 0; i < effect.count; i++) {
        const done = drawCard(apply(snapshot, writes), { named: null, shuffle, byCard: true });
        writes = merge(writes, done.writes);
      }
      return { writes, result: { did: [`wyciągnięto ${effect.count} Kart`], pending: null } };
    }

    default:
      // `isSettled` said yes and this says how — so a new settled op that
      // forgets to be handled here is a loud failure rather than a silent one.
      throw new Error(`Nie wiem, jak wykonać: ${(effect as Effect).op}`);
  }
}

/** Who an effect lands on, read off the snapshot. */
function targeted(
  snapshot: Snapshot,
  seatId: string,
  target: Parameters<typeof seatsTargeted>[0],
  oprocz: Parameters<typeof seatsTargeted>[3],
  /** The Obszar the player pointed at, where the card lets them point at one. */
  at?: FieldId,
): TargetSeat[] | null {
  const actor = snapshot.seats.find((row) => row.id === seatId);
  const from = actor ? seatView(snapshot, actor.id).asTarget : undefined;
  return seatsTargeted(
    target,
    snapshot.seats.map((row) => seatView(snapshot, row.id).asTarget),
    // „Tutaj" is the Obszar the effect was aimed at when one was named, and the
    // actor's own square otherwise — which is every other card that says it.
    from && at !== undefined ? { ...from, fieldId: at } : from,
    oprocz,
  );
}

/* --------------------------------------------------------------------------
 * The three doors an effect comes through.
 * ----------------------------------------------------------------------- */

/** Notes a card or an offer as dealt with, so the turn stops asking about it. */
function markResolved(snapshot: Snapshot, key: string): Changeset {
  const state = top(snapshot.game.turn_state);
  if (state.phase !== "field") return {};
  const already = state.resolved ?? [];
  if (already.includes(key)) return {};
  return { game: { turn_state: replaceTop(snapshot.game.turn_state, { ...state, resolved: [...already, key] }) } };
}

export interface UseResult {
  card: string;
  face?: number;
  did: string[];
  /** The part the table has to settle itself. */
  stol: boolean;
}

/**
 * Spends a Karta that is used up by being used.
 *
 * Nine Przedmioty are an act rather than a possession, and every one of them
 * says the Karta goes whatever comes of it — the Łódź says so even if you never
 * got in it. So it is spent first and the effect is worked out afterwards.
 *
 * One die, and only for a card whose script is a table.
 */
export async function spendHolding(
  snapshot: Snapshot,
  command: { holdingId: string; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<UseResult>> {
  const held = snapshot.holdings.find((h) => h.id === command.holdingId);
  if (!held) throw new Error("Nie ma takiej Karty.");

  // Zaklęcia are spoken, not used: 9.6 has its own path, with its own window
  // and its own announcement to the table.
  if (held.kind === "spell") throw new Error("Zaklęcie się rzuca, nie używa (9.6).");

  const cardId = held.card_id;
  const use = usageOf(cardId);
  if (!use) throw new Error(`${cardName(cardId)} — tej Karty się nie zużywa.`);

  const seatId = held.seat_id;
  const script = use.rozpatruje === "aplikacja" ? scriptFor(cardId) : null;
  const face =
    script?.effect.op === "rzut" ? await ports.random.rollD6(`${cardName(cardId)}: tabela`) : undefined;

  const gone: Changeset = { holdings: { delete: [held.id] } };
  const spent = mergeAll(
    gone,
    putOnPile(apply(snapshot, gone), "events", [{ cardId, granted: held.granted }]),
    {
      journal: [
        {
          seatId,
          round: snapshot.game.round,
          kind: "used",
          payload: { cardId, ...(face !== undefined ? { face } : {}) },
        },
      ],
    },
  );

  // An effect the buff system can hold is applied here and now — the card is
  // gone, and what it bought is a thing the character is under until it runs
  // out. This is the whole of what "aplikacja" means for a card with no die.
  if (use.efekt) {
    const under = addEffect(apply(snapshot, spent), {
      seatId,
      effect: { source: cardId, ...use.efekt },
    });
    return {
      writes: merge(spent, under),
      result: { card: cardName(cardId), did: [use.efekt.label], stol: false },
    };
  }

  if (!script) {
    return { writes: spent, result: { card: cardName(cardId), did: [use.co], stol: true } };
  }

  const effect =
    face !== undefined && script.effect.op === "rzut" ? script.effect.faces[face] : script.effect;
  const done = await applyEffect(
    apply(snapshot, spent),
    {
      seatId,
      effect,
      reason: face !== undefined ? `${cardName(cardId)} (${face})` : cardName(cardId),
      shuffle: command.shuffle,
    },
    ports,
  );

  return {
    writes: merge(spent, done.writes),
    result: {
      card: cardName(cardId),
      ...(face !== undefined ? { face } : {}),
      // A face the app cannot finish — the Szkatuła's Tarcza Tolimana, which is
      // a Karta somebody has to hand over — is reported as the table's rather
      // than silently dropped.
      did: done.result.pending
        ? [...done.result.did, describeEffect(done.result.pending)]
        : done.result.did,
      stol: done.result.pending !== null,
    },
  };
}

/**
 * Rolls an Obszar's own table, or simply carries out what it offers (15.1).
 *
 * One die, and only when the offer is a table. Said here rather than left to
 * whatever the face happens to do — a face that opens a fight would otherwise
 * report "nie czas na walkę", which is true and explains nothing.
 */
export async function resolveFieldOffer(
  snapshot: Snapshot,
  command: { offerName: string; decided?: Decisions; manual?: boolean; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<{ offer: string; face?: number; did: string[]; pending: Effect | null }>> {
  const seat = activeSeat(snapshot);
  if (!seat.field_id) throw new Error("Postać nie stoi na Obszarze.");
  if (top(snapshot.game.turn_state).phase !== "field") {
    throw new Error("To rozpatruje się po wejściu na Obszar.");
  }

  const script = fieldScriptFor(seat.field_id);
  const offer = script?.offers.find((o) => o.name === command.offerName);
  if (!offer) throw new Error(`Na tym Obszarze nie ma: ${command.offerName}`);

  const table = offer.effect.op === "rzut";

  /**
   * "nie musisz wykonywać rzutów kostką w Wieży Przeznaczenia i na Urwisku.
   * Zawsze możesz tamtędy bezpiecznie przejść."
   *
   * The roll does not happen, and neither does whatever it would have found.
   * That is the whole of the promise and it has to be read that way round: some
   * of these tables give as well as take, and a character who rolled and then
   * ignored a bad face would be helping themselves to the good ones. The Opiekun
   * walks you past the Obszar, he does not read the dice for you.
   *
   * Marked resolved on the way out, so the turn does not stand there waiting for
   * an offer the character is entitled to ignore.
   */
  /**
   * Asked of the Obszar, not of the shape the offer happens to have.
   *
   * This used to require a top-level `rzut`, which held while every protected
   * Obszar was one die and one table. The Urwisko is not: it throws once for
   * the character and again for each Przyjaciel, so its offer is a `po-kolei`
   * — and the Opiekun, the Elflin and the Barbarzyńca walked straight into it,
   * because the guard was looking at the encoding rather than at the board.
   *
   * The cards say where, not how: "nie musisz wykonywać rzutów kostką w Wieży
   * Przeznaczenia i na Urwisku. Zawsze możesz tamtędy bezpiecznie przejść."
   */
  if (skipsRollAt(seatView(snapshot, seat.id).abilities, seat.field_id)) {
    const passed: Changeset = {
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "field-table",
          payload: { offer: offer.name, skipped: true },
        },
      ],
    };
    return {
      writes: merge(passed, markResolved(apply(snapshot, passed), offerKey(offer.name))),
      result: {
        offer: offer.name,
        did: ["przechodzisz bezpiecznie — bez rzutu"],
        pending: null,
      },
    };
  }

  // Two dice where the Obszar prints two — "MOŻESZ MODLIĆ SIĘ RZUCAJĄC 2
  // KOSTKAMI" — because a 2-12 table read off one die would never reach half
  // its rows and would reach the rest far too evenly.
  const pair = table && offer.effect.op === "rzut" && offer.effect.kostki === 2;
  const face = !table
    ? undefined
    : pair
      ? (await ports.random.rollD6(`${offer.name}: tabela (1)`)) +
        (await ports.random.rollD6(`${offer.name}: tabela (2)`))
      : await ports.random.rollD6(`${offer.name}: tabela`);
  const rolled: Changeset =
    face !== undefined
      ? {
          journal: [
            {
              seatId: seat.id,
              round: snapshot.game.round,
              kind: "field-table",
              payload: { offer: offer.name, face },
              manual: command.manual ?? false,
            },
          ],
        }
      : {};

  const effect =
    face !== undefined && offer.effect.op === "rzut" ? offer.effect.faces[face] : offer.effect;
  const done = await applyEffect(
    apply(snapshot, rolled),
    {
      seatId: seat.id,
      effect,
      reason: face !== undefined ? `${offer.name} (${face})` : offer.name,
      decided: command.decided,
      shuffle: command.shuffle,
      mark: offerKey(offer.name),
    },
    ports,
  );

  const soFar = merge(rolled, done.writes);
  const noted =
    done.result.pending || done.result.suspended
      ? {}
      : markResolved(apply(snapshot, soFar), offerKey(offer.name));

  return {
    writes: merge(soFar, noted),
    result: { offer: offer.name, ...(face !== undefined ? { face } : {}), ...done.result },
  };
}

/**
 * Carries out a Karta that was drawn onto this Obszar (16.1).
 *
 * One die, and only when the card's script is a table.
 */
export async function resolveDrawnCard(
  snapshot: Snapshot,
  command: { cardId: string; decided?: Decisions; manual?: boolean; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<{ card: string; face?: number; did: string[]; pending: Effect | null }>> {
  const seat = activeSeat(snapshot);
  const state = top(snapshot.game.turn_state);
  if (state.phase !== "field") throw new Error("Nie ma czego rozpatrywać.");
  if (!state.drawn.some((entry) => entry.cardId === command.cardId)) {
    throw new Error("Tej Karty tu nie ma.");
  }

  const script = scriptFor(command.cardId);
  if (!script) throw new Error(`${cardName(command.cardId)} — tę Kartę rozpatrzcie sami.`);

  const table = script.effect.op === "rzut";
  const face = table ? await ports.random.rollD6(`${cardName(command.cardId)}: tabela`) : undefined;
  const rolled: Changeset =
    face !== undefined
      ? {
          journal: [
            {
              seatId: seat.id,
              round: snapshot.game.round,
              kind: "card-table",
              payload: { cardId: command.cardId, face },
              manual: command.manual ?? false,
            },
          ],
        }
      : {};

  const effect =
    face !== undefined && script.effect.op === "rzut" ? script.effect.faces[face] : script.effect;
  const done = await applyEffect(
    apply(snapshot, rolled),
    {
      seatId: seat.id,
      effect,
      // The card is its own subject for `poloz-karte`: three Karty roll for
      // where they settle, and the effect has to know which card it is.
      cardId: command.cardId,
      // The debts a suspension carries across commits: crossing the card off
      // when it finally completes, and keeping the two Spotkania that stay.
      mark: command.cardId,
      ...(script.disposition.kind === "bierzesz" ? { keep: true } : {}),
      reason:
        face !== undefined ? `${cardName(command.cardId)} (${face})` : cardName(command.cardId),
      decided: command.decided,
      shuffle: command.shuffle,
    },
    ports,
  );

  /**
   * "Musisz ją zabrać jako Przyjaciela" — a Spotkanie that stays with you.
   *
   * Two cards do it, the Południca and the Zły Duch, and neither is a Przyjaciel
   * anybody wanted: `kindForCard` reads the printed class and says a Spotkanie
   * is carried by nobody, which is true of the other seventy. The disposition is
   * what knows otherwise, and it was described in `cardScript.ts` from the start
   * and acted on nowhere.
   *
   * Taken as a `friend` because that is the word the cards use and because it is
   * what the rest of the game then does to them: 6.3 puts no limit on how many
   * you may have, the Bagna can take one, the Urwisko rolls for each, and the
   * Zły Duch's own text has to name the Południca as the exception it spares.
   */
  const kept =
    script.disposition.kind === "bierzesz" && !done.result.pending && !done.result.suspended
      ? ({
          holdings: {
            insert: [
              {
                seat_id: seat.id,
                card_id: command.cardId,
                kind: "friend" as const,
                face: "open" as const,
              },
            ],
          },
        } satisfies Changeset)
      : {};

  const soFar = mergeAll(rolled, done.writes, kept);
  const noted =
    done.result.pending || done.result.suspended
      ? {}
      : markResolved(apply(snapshot, soFar), command.cardId);

  return {
    writes: merge(soFar, noted),
    result: {
      card: cardName(command.cardId),
      ...(face !== undefined ? { face } : {}),
      ...done.result,
    },
  };
}
