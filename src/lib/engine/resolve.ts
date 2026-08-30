/** Which effects the app can carry out on its own, and which are genuinely the player's to decide. */

import { takesEverything } from "./losses";
import { FIELD_SCRIPTS } from "./fieldScript";
import type { Effect } from "./cardScript";

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
 */
export function isSettled(effect: Effect): boolean {
  switch (effect.op) {
    // Nothing to decide.
    case "nic":
    case "punkty":
    case "tura-stracona":
    case "zaklecie":
    case "kamien":
    case "natura":
    case "walka":
    // Whom it is sent at was named as the Zaklęcie was spoken, which is the
    // only choice it holds — see `przyzwij`.
    case "przyzwij":
    // Nothing to choose: the pile has a top and the count is on the card.
    case "podejrzyj":
    // 15.2 has already said which Karta is in front of you.
    case "wymien-karte":
    case "ruch-dodatkowy":
    case "wyciagnij":
    // What it does and how long it lasts are both written on the card.
    case "efekt":
    // The card is named and the stock is the app's to count.
    case "otrzymaj":

    // A die per card, and nobody picks which — 5.6 is not engaged.
    case "rzut-za-kazdego":
    // The card is named by the effect; there is nothing to ask.
    case "uwolnij":
      return true;

    // Somebody has to say which card changes hands (5.6, or Szaleństwo's own
    // text handing the choice to the caster).
    case "zabierz":
      return false;

    // Healing with no price is capped by 4.7 and has one answer. Healing that
    // charges is a purchase, and how much to buy is the buyer's.
    case "uzdrow":
      return !effect.cena;

    // A destination the card names is settled; "dowolny Obszar w tym Kręgu" is
    // the player pointing at the board.
    case "przenies":
      return effect.to.kind === "pole";

    /**
     * The same question, about a Karta rather than a Postać.
     *
     * Two of the three cards that put a Karta down name one Obszar and ask
     * nothing. The Lewiatan names six — "połóż jego Kartę na którymś z tych
     * Obszarów, nie zajętym przez inną Postać" — and that is the player
     * pointing at the board.
     *
     * This case used to say all three were settled, on the reading that the
     * Obszar is rolled for. It is not, for the Lewiatan, and the executor knew:
     * it suspended on `jedno-z` while this said there was nothing to ask, which
     * is the divergence the comment on `pendingIn` calls a bug in this file.
     */
    case "poloz-karte":
      return effect.gdzie.kind === "pole";

    // Both ends of it are the player's: which Karta, and which Obszar.
    case "przenies-karte":
      return false;

    // Every step has to be settled for the whole to be.
    case "po-kolei":
      return effect.steps.every(isSettled);

    // A condition the app can test, on branches it can carry out.
    case "gdy":
      return isSettled(effect.to) && (!effect.inaczej || isSettled(effect.inaczej));

    // The decision *is* the effect.
    case "wybor":
    case "zgadnij":
      return false;

    // "Tracisz 1 z Przedmiotów wedle własnego wyboru" — which one is yours.
    /**
     * A loss is a decision only when there is something to decide.
     *
     * 5.6 gives the choice of what to give up to the player, so the default is
     * to ask — but three of the shapes leave nothing to ask about. Everything
     * going is not a choice, gold is a number rather than a card to pick, and a
     * loss the card assigns to chance is chance's to make. Saying no to all of
     * them meant the app announced "tracisz 1 Przedmiot" and then left the
     * player to remember to do it, which is the hand-entry simulation is
     * supposed to be free of.
     */
    case "strata":
      // Which losses name what goes is `takesEverything`'s, not this file's.
      // Both used to keep the list and they disagreed about one value, so the
      // Przesilenie was held here as an unanswered choice and never reached
      // `chooseLosses`, which knew perfectly well it was not one.
      if (takesEverything(effect.co)) return true;
      return effect.wybor === "losowo";

    // A die table is settled only if every face it can land on is. Rolled
    // separately, so this asks about the table as a whole.
    // Every face it can land on, which is 2-12 for a two-die table and 1-6 for
    // the usual one. Reading the wrong range asked about faces that cannot come
    // up and skipped the ones that can — and `isSettled(undefined)` throws.
    case "rzut": {
      const faces =
        effect.kostki === 2 ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
      return faces.every((face) => isSettled(effect.faces[face]));
    }

    // Shops and borrowed tables are interactions rather than outcomes, and
    // putting a card somewhere is not something a seat does.
    //
    // `otrzymaj` used to be counted among them and is not one: the card is
    // named by the effect, the Wyposażenie's stock is checked by `takeCard`,
    // and there is nothing left for anybody to answer. It sat here because it
    // had no implementation at all, and while it was unsettled the two rows
    // that hand out a Magiczny Miecz and a Tarcza Tolimana came back pending
    // and empty — a prayer that appeared to do nothing and left the turn
    // waiting on a question nobody had been asked.
    case "kup":
    case "sprzedaj":
    case "zaklecia-do-limitu":
    case "zamien-punkty":
      return false;

    /**
     * A borrowed table is exactly as settled as the table it borrows.
     *
     * It used to sit above with the shops, on the reading that "dzieje się to,
     * co na Obszarze" is an interaction rather than an outcome. That made the
     * two Kapliczki permanently unsettled, which is worse than it sounds: an
     * unsettled effect is `pendingIn`'s answer, and the sheet hides the
     * "Rozpatrz" button whenever something is being asked — so the one thing a
     * player could do with a Kapliczka was leave it for later, for ever.
     *
     * Both Świątynie's prayers are a `rzut` whose every face is settled, so
     * both Kapliczki are settled, and the recursion says so for the right
     * reason rather than by assertion.
     */
    case "jak-pole": {
      const borrowed = FIELD_SCRIPTS[effect.fieldId]?.offers[0];
      return borrowed ? isSettled(borrowed.effect) : false;
    }
  }
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
export function pendingIn(effect: Effect, choices: readonly number[]): Effect | null {
  return owedIn(effect, [...choices]);
}

/**
 * The node a `script` frame's cursor stands on (docs/STACK.md).
 *
 * Not `pendingIn`: that walks by *choices*, skipping every node that asks
 * nothing. A cursor records the whole path — a `po-kolei` step, a `wybor`
 * pick, a `rzut` face as rolled, a `gdy` branch as taken — so following it is
 * plain indexing, and what it lands on is the question the frame is suspended
 * over. Null for a path the effect does not have, which is a frame written by
 * different code than is reading it and worth showing as nothing rather than
 * as the wrong question.
 */
export function nodeAt(effect: Effect, cursor: readonly number[]): Effect | null {
  let at: Effect = effect;
  for (const index of cursor) {
    switch (at.op) {
      case "po-kolei":
        if (!at.steps[index]) return null;
        at = at.steps[index];
        break;
      case "wybor":
        if (!at.options[index]) return null;
        at = at.options[index].effect;
        break;
      case "rzut":
        if (!at.faces[index]) return null;
        at = at.faces[index];
        break;
      case "gdy": {
        const branch = index === 0 ? at.to : at.inaczej;
        if (!branch) return null;
        at = branch;
        break;
      }
      default:
        return null;
    }
  }
  return at;
}

function owedIn(effect: Effect, queue: number[]): Effect | null {
  if (effect.op === "wybor") {
    const pick = queue.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    // Nothing picked yet, or a pick that names no option: the choice itself is
    // what is owed. Otherwise the branch already taken is where to look.
    return option ? owedIn(option.effect, queue) : effect;
  }

  // A destination the card names needs nobody. "dowolny Obszar w tym Kręgu" is
  // the player pointing at the board, and is a question even when everything
  // around it is settled.
  if (effect.op === "przenies") return effect.to.kind === "pole" ? null : effect;

  // The first owed step stops the sequence, as it does on the server: what
  // follows may depend on it, and doing the rest first would resolve the card
  // out of its own order.
  if (effect.op === "po-kolei") {
    for (const step of effect.steps) {
      const owed = owedIn(step, queue);
      if (owed) return owed;
    }
    return null;
  }

  // Divergence one: the condition is the seat's, and the browser has no
  // Snapshot to test it against. If either branch needs asking, the server says
  // so when it gets there.
  if (effect.op === "gdy") return null;

  // Divergence two: a die table is not a question — the app rolls it — so what
  // it lands on is asked about after the roll, from the server's answer.
  if (effect.op === "rzut") return null;

  // A borrowed table is the table it borrows, and both of them are dice. The
  // node itself is never the question — reported as one, it was a question the
  // sheet had no control for, which is how the two Kapliczki became cards a
  // player could only ever leave for later.
  if (effect.op === "jak-pole") {
    const borrowed = FIELD_SCRIPTS[effect.fieldId]?.offers[0];
    return borrowed ? owedIn(borrowed.effect, queue) : null;
  }

  /**
   * A loss the holder chooses from takes one answer per card it will cost, the
   * same as any other decision — so the queue is drawn down here too, or a
   * `po-kolei` after one would read the wrong answers for itself.
   */
  if (effect.op === "strata" && !isSettled(effect)) {
    const wanted = effect.count ?? 1;
    for (let i = 0; i < wanted; i++) {
      if (queue.shift() === undefined) return effect;
    }
    return null;
  }

  return isSettled(effect) ? null : effect;
}
