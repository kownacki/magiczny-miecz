/** Carrying out what a Karta says: the walk down an `Effect` tree, and the frame it suspends into. The leaf ops are ./ops; the doors in are ./resolving. */

import { FIELDS } from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { isSettled } from "@/lib/engine/resolve";
import { cardName, fieldName } from "@/lib/engine/polish";
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
import { placeSeat } from "./character";
import { peekSpells } from "./draw";
import { FIELD_SCRIPTS } from "@/lib/engine/fieldScript";
import { putOnPile } from "./piles";
import {
  pop,
  push,
  replaceTop,
  requireTop,
  top,
  topIf,
  type TurnState,
} from "@/lib/engine/stack";
import { statusesOf } from "./turn";
import { hasAttacked } from "@/lib/engine/status";
import { pointsOf } from "./seat";
import { asFieldId, ringFields } from "@/lib/engine/board";
import { nothing, owedAt, runOp, type Decisions, type Opens, type Resolution } from "./ops";

export type { Decisions, Opens, Resolution } from "./ops";

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
  const frame = requireTop(state, "script");

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
  const owed = () => owedAt(effect, path);

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
    // A Karta moving somebody, as 13.1 has it — the same as the settled
    // destination above, and read the same way in the journal.
    const moved = placeSeat(snapshot, { seatId, target: where, reason, by: "karta" });
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

  return runOp(
    {
      snapshot,
      seatId,
      reason,
      shuffle,
      ports,
      decided,
      path,
      fieldId: command.fieldId,
      fieldCardId: command.fieldCardId,
      toSeatId: command.toSeatId,
      cardId: command.cardId,
    },
    effect,
  );
}

/**
 * Writes a card down as dealt with for this turn.
 *
 * Not the same as taking it off the field: 16.8 leaves a resolved Spotkanie
 * lying there face up until the turn ends, so "still on the field" cannot mean
 * "still to be resolved". The same distinction `fought` makes for a Wróg.
 */
export function markResolved(snapshot: Snapshot, key: string): Changeset {
  const state = topIf(snapshot.game.turn_state, "field");
  if (!state) return {};
  const already = state.resolved ?? [];
  if (already.includes(key)) return {};
  return { game: { turn_state: replaceTop(snapshot.game.turn_state, { ...state, resolved: [...already, key] }) } };
}
