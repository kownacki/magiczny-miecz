/** Which effects the app can carry out on its own, and which are genuinely the player's to decide. */

import { FIELD_SCRIPTS } from "./fieldScript";
import type { Effect } from "./cardScript";
import type { Nature } from "@/data/types";
import { wordOf, type Child } from "./words";

/**
 * The nodes under an effect, borrowed tables included.
 *
 * `WORDS` says what a word's own children are. The one word that borrows —
 * `as-field`, „Możesz modlić się na takich samych zasadach, jak w Świątyni
 * Bogini Nemed" — names an Obszar whose table lives in `FIELD_SCRIPTS`, and
 * that registry cannot be read from the vocabulary without an import cycle
 * through `state.ts`. So the borrowing happens here, once, and every walk in
 * this file takes its children from this rather than from the table. The
 * borrowed table's index is `0`, which is what the walk in
 * `commands/effects.ts` writes into the cursor.
 */
export function childrenOf(effect: Effect): readonly Child[] {
  const word = wordOf(effect);
  const own = word.children(effect);
  const borrowed = word.borrows?.(effect);
  if (borrowed === undefined) return own;
  const table = FIELD_SCRIPTS[borrowed]?.offers[0];
  return table ? [...own, [0, table.effect]] : own;
}

/** Every node of an effect tree, the effect itself first, borrowed tables entered. */
export function everyNode(effect: Effect): Effect[] {
  return [effect, ...childrenOf(effect).flatMap(([, child]) => everyNode(child))];
}

/**
 * An effect is *settled* when nothing about it is left for a person to say.
 *
 * This is the line between a simulation doing the work and a simulation asking
 * somebody to do it for it. "Tracisz 1 Sz. Z." is settled: there is one thing
 * that happens and the app can do it. "Wybierz jedno: +1 Miecza albo +1 Magii"
 * is not, and never will be — the rulebook says *wedle własnego wyboru*, and a
 * referee that chose for you would be playing your character.
 *
 * So the rule is not "automate everything", it is **automate everything that is
 * not a decision**. What is left on screen after a roll is exactly the set of
 * choices the rules actually give you.
 *
 * Each word answers for itself in `words.ts` (`settled`); this only
 * hands it its children and the recursion. The history worth keeping from
 * when the answers were a switch here: four times a word sat among the
 * unsettled ones only because it had no implementation yet — `receive`,
 * `buy`/`sell`, `spells-to-limit`, `swap-points` — and the symptom
 * was always the same, a Karta reported `full` that no surface could
 * resolve, or a turn deadlocked on a question nobody had been asked.
 * `coverage.test.ts` now asks that of every card, which is why the fifth time
 * will fail a build instead of a table.
 */
export function isSettled(effect: Effect): boolean {
  return wordOf(effect).settled(
    effect,
    childrenOf(effect).map(([, child]) => child),
    isSettled,
  );
}

/**
 * The first thing an effect still needs a person for, given what has already
 * been decided.
 *
 * `isSettled` asks a yes/no about a whole card. This asks *which node* is still
 * owed, after walking down the branch the player has already stepped into —
 * the difference between "this card will want you at some point" and "this card
 * is waiting on you for exactly this".
 *
 * It is a prediction of `applyEffect`'s own walk, which is where the answer
 * really comes from: the server re-walks the card it owns and reports what is
 * left `pending`. The two cannot be one function, because that walk is async
 * and reads a Snapshot the browser is never sent (9.3). So this is a second
 * walk of the same tree, and it diverges from the first at exactly two ops,
 * both marked below. Anywhere else the two disagree is a bug in this one.
 *
 * `choices` is a queue read in the order the effect asks, the same order
 * `Decisions` travels in. The copy is taken here so that asking a question does
 * not consume the caller's answers.
 */
export function pendingIn(
  effect: Effect,
  choices: readonly number[],
  /**
   * The Natura of the character the card is being resolved for, when known.
   *
   * Narrows divergence one below. Everything else a `when` can test lives in a
   * Snapshot the browser is never sent; a Natura is on the seat and on the
   * screen, so the one condition that gates three of the Nieznajomi need not be
   * a blind spot.
   */
  natura?: Nature | null,
): Effect | null {
  return owedIn(effect, [...choices], natura ?? null);
}

/**
 * Whether the Karta has nothing at all for this character.
 *
 * Three Nieznajomi are a `when` on `nature` with no `else`: the WRÓŻKA serves „the
 * first Dobra Postać", the KOSZMAR a Zła one, the CZARODZIEJ a Dobra one. Meet
 * one as the wrong Natura and the card does not merely do less — it does
 * nothing, and it stays lying there for whoever it was written for.
 *
 * The sheet needs to know, because the button it draws otherwise says "Rozpatrz,
 * co się da" over a card that will visibly do nothing when pressed.
 *
 * # Why the condition arrives as an answer rather than as a Natura
 *
 * This used to read the `when` itself — `condition.is === "nature"`, and is the
 * Postać's one of `oneOf`. That is narrower than the rule: a `when` can test
 * things that are not a Natura, and the DOBRE BÓSTWO tests whether you have
 * raised a hand against anybody. It fell straight through to a button promising
 * to do what it could, which was nothing.
 *
 * So the question is asked once, by `requirementOf`, which knows every form the
 * condition takes and reads it for a particular Postać — and what comes back
 * here is the verdict. The shape stays this function's business; who fails it is
 * the caller's. `else.op === "nothing"` counts as no branch at all, because a
 * card that says "otherwise nothing" and a card that says nothing are the same
 * card to the player in front of it.
 */
export function inertFor(effect: Effect | undefined, failsCondition: boolean): boolean {
  if (!effect || effect.op !== "when") return false;
  return failsCondition && (effect.else === undefined || effect.else.op === "nothing");
}

/**
 * The node a `script` frame's cursor stands on (docs/STACK.md).
 *
 * Not `pendingIn`: that walks by *choices*, skipping every node that asks
 * nothing. A cursor records the whole path — a `sequence` step, a `choice`
 * pick, a `roll` face as rolled, a `when` branch as taken, a borrowed table's
 * `0`, the MĘDRZEC's guessed face — so following it is plain indexing into
 * `childrenOf`, and what it lands on is the question the frame is suspended
 * over. Null for a path the effect does not have, which is a frame written by
 * different code than is reading it and worth showing as nothing rather than
 * as the wrong question.
 *
 * It used to know four shapes and answer null for the other two, so a frame
 * suspended inside a Kapliczka's borrowed prayer or a riddle's reward had no
 * question on screen. The table knows all of them.
 */
export function nodeAt(effect: Effect, cursor: readonly number[]): Effect | null {
  let at: Effect = effect;
  for (const index of cursor) {
    const next =
      wordOf(at).childAt?.(at, index) ??
      childrenOf(at).find(([reached]) => reached === index)?.[1] ??
      null;
    if (!next) return null;
    at = next;
  }
  return at;
}

function owedIn(effect: Effect, queue: number[], natura: Nature | null = null): Effect | null {
  if (effect.op === "choice") {
    const pick = queue.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    // Nothing picked yet, or a pick that names no option: the choice itself is
    // what is owed. Otherwise the branch already taken is where to look.
    return option ? owedIn(option.effect, queue, natura) : effect;
  }

  // A destination the card names needs nobody — a `pole`, or the STRAŻ's
  // „Obszar, z którego rozpocząłeś wędrówkę", which is as exact as one and read
  // off the frame. „Dowolny Obszar w tym Kręgu" is the player pointing at the
  // board, and is a question even when everything around it is settled.
  if (effect.op === "move") {
    return effect.to.kind === "field" || effect.to.kind === "move-start" ? null : effect;
  }

  // The first owed step stops the sequence, as it does on the server: what
  // follows may depend on it, and doing the rest first would resolve the card
  // out of its own order.
  if (effect.op === "sequence") {
    for (const step of effect.steps) {
      const owed = owedIn(step, queue, natura);
      if (owed) return owed;
    }
    return null;
  }

  /**
   * Divergence one, and it is narrower than it was.
   *
   * The condition is the seat's and the browser has no Snapshot — except for a
   * Natura, which is on the seat row and already on the screen. Three
   * Nieznajomi are a `gdy natura` wrapped round a six-way wish (the WRÓŻKA, the
   * KOSZMAR), and with the branch untaken the sheet could not see the choice
   * inside: it offered "Rozpatrz, co się da" and the six options only appeared
   * after a round trip, on a card whose whole content is the choice.
   *
   * Descending also keeps the answer queue honest. `applyEffect` walks into the
   * branch and spends a decision on the `choice` there; stopping here spent
   * none, so any card with something after a `when` counted its own answers
   * differently on the two sides.
   *
   * Every other condition still stops here. If either branch needs asking, the
   * server says so when it gets there.
   */
  if (effect.op === "when") {
    if (effect.condition.is !== "nature" || !natura) return null;
    const branch = effect.condition.oneOf.includes(natura) ? effect.then : effect.else;
    return branch ? owedIn(branch, queue, natura) : null;
  }

  // Divergence two: a die table is not a question — the app rolls it — so what
  // it lands on is asked about after the roll, from the server's answer.
  if (effect.op === "roll") return null;

  // A borrowed table is the table it borrows, and both of them are dice. The
  // node itself is never the question — reported as one, it was a question the
  // sheet had no control for, which is how the two Kapliczki became cards a
  // player could only ever leave for later.
  if (effect.op === "as-field") {
    const borrowed = childrenOf(effect)[0]?.[1];
    return borrowed ? owedIn(borrowed, queue, natura) : null;
  }

  /**
   * A loss the holder chooses from takes one answer per card it will cost, the
   * same as any other decision — so the queue is drawn down here too, or a
   * `sequence` after one would read the wrong answers for itself.
   */
  if (effect.op === "lose" && !isSettled(effect)) {
    const wanted = effect.count ?? 1;
    for (let i = 0; i < wanted; i++) {
      if (queue.shift() === undefined) return effect;
    }
    return null;
  }

  return isSettled(effect) ? null : effect;
}
