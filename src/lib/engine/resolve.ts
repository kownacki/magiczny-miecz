/** Which effects the app can carry out on its own, and which are genuinely the player's to decide. */

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
    case "ruch-dodatkowy":
    case "wyciagnij":
      return true;

    // Healing with no price is capped by 4.7 and has one answer. Healing that
    // charges is a purchase, and how much to buy is the buyer's.
    case "uzdrow":
      return !effect.cena;

    // A destination the card names is settled; "dowolny Obszar w tym Kręgu" is
    // the player pointing at the board.
    case "przenies":
      return effect.to.kind === "pole";

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
      if (effect.co === "wszystkie-przedmioty" || effect.co === "gold") return true;
      return effect.wybor === "losowo";

    // A die table is settled only if every face it can land on is. Rolled
    // separately, so this asks about the table as a whole.
    case "rzut":
      return [1, 2, 3, 4, 5, 6].every((face) => isSettled(effect.faces[face]));

    // Shops, borrowed tables and named gifts are interactions rather than
    // outcomes, and putting a card somewhere is not something a seat does.
    case "kup":
    case "sprzedaj":
    case "jak-pole":
    case "otrzymaj":
    case "poloz-karte":
    case "zaklecia-do-limitu":
    case "zamien-punkty":
      return false;
  }
}
