/** Which effects the app can carry out on its own, and which are genuinely the player's to decide. */

import { takesEverything } from "./losses";
import { FIELD_SCRIPTS } from "./fieldScript";
import type { Effect } from "./cardScript";
import type { Nature } from "@/data/types";

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
    /**
     * A shop is a standing offer, not a question — and treating it as one
     * wedged the game.
     *
     * These sat below with the unsettled ops on the reading that somebody has
     * to say which card changes hands. Somebody does, but not *here*: a
     * Targowisko is a Miejsce that „zostaje", and resolving the Karta is what
     * puts it on the Obszar. The buying is `buy` afterwards, against
     * `offerOn`, which reads the Obszar's own offers and the Karty lying on
     * it — exactly how every printed shop on the board already works.
     *
     * Unsettled, it deadlocked instead. `resolveDrawnCard` suspended into a
     * `script` frame; `buy` could not see the shop because the card was still
     * in the turn's `drawn` and not yet in `fieldCards`; and the card could
     * only reach `fieldCards` by resolving. „Nic się nie stało. Wciąż czeka"
     * for ever, and `endturn` refused too — „Najpierw dokończ: TARGOWISKO".
     * Drawing one Karta ended the game.
     *
     * This is `otrzymaj`'s bug in another coat; see the note below it, which
     * describes the same shape and the same symptom.
     */
    case "kup":
    case "sprzedaj":
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
    case "zaklecia-do-limitu":
      return false;

    /**
     * The Kuglarz, which used to sit above with the unsettled ones.
     *
     * His two offers *are* the question, and answering one leaves nothing for
     * anybody to decide: the parameter takes the other's value and `adjustSeat`
     * puts 1.3 and 2.3's floor under it. While it was unsettled the walk handed
     * it straight back as `pending`, so a player picked an option and watched
     * nothing happen — the same shape as `otrzymaj`'s and the Targowisko's
     * deadlocks above, and the third time this file has had it.
     */
    case "zamien-punkty":
      return true;

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
export function pendingIn(
  effect: Effect,
  choices: readonly number[],
  /**
   * The Natura of the character the card is being resolved for, when known.
   *
   * Narrows divergence one below. Everything else a `gdy` can test lives in a
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
 * Three Nieznajomi are a `gdy natura` with no `inaczej`: the WRÓŻKA serves „the
 * first Dobra Postać", the KOSZMAR a Zła one, the CZARODZIEJ a Dobra one. Meet
 * one as the wrong Natura and the card does not merely do less — it does
 * nothing, and it stays lying there for whoever it was written for.
 *
 * The sheet needs to know, because the button it draws otherwise says "Rozpatrz,
 * co się da" over a card that will visibly do nothing when pressed.
 *
 * # Why the condition arrives as an answer rather than as a Natura
 *
 * This used to read the `gdy` itself — `warunek.is === "natura"`, and is the
 * Postać's one of `jedna_z`. That is narrower than the rule: a `gdy` can test
 * things that are not a Natura, and the DOBRE BÓSTWO tests whether you have
 * raised a hand against anybody. It fell straight through to a button promising
 * to do what it could, which was nothing.
 *
 * So the question is asked once, by `requirementOf`, which knows every form the
 * condition takes and reads it for a particular Postać — and what comes back
 * here is the verdict. The shape stays this function's business; who fails it is
 * the caller's. `inaczej.op === "nic"` counts as no branch at all, because a
 * card that says "otherwise nothing" and a card that says nothing are the same
 * card to the player in front of it.
 */
export function inertFor(effect: Effect | undefined, failsCondition: boolean): boolean {
  if (!effect || effect.op !== "gdy") return false;
  return failsCondition && (effect.inaczej === undefined || effect.inaczej.op === "nic");
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
/**
 * The die face a suspended walk came through, out of the cursor itself.
 *
 * A `rzut`'s step in a cursor *is* its face — `nodeAt` indexes `faces[index]`
 * with it — so a frame that stopped somewhere below a die table is still
 * carrying what came up, and nothing has to be stored or sent to know it.
 *
 * Which is what lets the rest of the table read a roll they did not press. The
 * face reaches the player who threw it on the reply to their own request and is
 * theirs alone; this is the same number, on the frame everybody can see, for as
 * long as the Karta is waiting on an answer.
 *
 * The last one, where a card rolls twice: the face that decided the question
 * being asked is the one at the bottom of the walk, not the one that got it
 * started.
 */
export function faceAt(effect: Effect, cursor: readonly number[]): number | null {
  let at: Effect = effect;
  let face: number | null = null;
  for (const index of cursor) {
    if (at.op === "rzut") face = index;
    const next = nodeAt(at, [index]);
    if (!next) return face;
    at = next;
  }
  return face;
}

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

function owedIn(effect: Effect, queue: number[], natura: Nature | null = null): Effect | null {
  if (effect.op === "wybor") {
    const pick = queue.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    // Nothing picked yet, or a pick that names no option: the choice itself is
    // what is owed. Otherwise the branch already taken is where to look.
    return option ? owedIn(option.effect, queue, natura) : effect;
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
   * branch and spends a decision on the `wybor` there; stopping here spent
   * none, so any card with something after a `gdy` counted its own answers
   * differently on the two sides.
   *
   * Every other condition still stops here. If either branch needs asking, the
   * server says so when it gets there.
   */
  if (effect.op === "gdy") {
    if (effect.warunek.is !== "natura" || !natura) return null;
    const branch = effect.warunek.jedna_z.includes(natura) ? effect.to : effect.inaczej;
    return branch ? owedIn(branch, queue, natura) : null;
  }

  // Divergence two: a die table is not a question — the app rolls it — so what
  // it lands on is asked about after the roll, from the server's answer.
  if (effect.op === "rzut") return null;

  // A borrowed table is the table it borrows, and both of them are dice. The
  // node itself is never the question — reported as one, it was a question the
  // sheet had no control for, which is how the two Kapliczki became cards a
  // player could only ever leave for later.
  if (effect.op === "jak-pole") {
    const borrowed = FIELD_SCRIPTS[effect.fieldId]?.offers[0];
    return borrowed ? owedIn(borrowed.effect, queue, natura) : null;
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
