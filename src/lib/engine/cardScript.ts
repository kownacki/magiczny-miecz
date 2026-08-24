/** What a one-shot or fixture card does, and — just as importantly — where the card goes afterwards. */

import type { Nature } from "@/data/types";
import { MIEJSCA } from "./scripts/miejsca";
import { NIEZNAJOMI } from "./scripts/nieznajomi";
import { PRZEDMIOTY } from "./scripts/przedmioty";
import { SPOTKANIA } from "./scripts/spotkania";
import { WROGOWIE } from "./scripts/wrogowie";

/**
 * The second of the three card shapes.
 *
 * `abilities.ts` covers the standing rules a character carries around. This
 * covers the cards that *happen*: a Spotkanie that resolves once, a Nieznajomy
 * who grants a wish and leaves, a Miejsce that settles onto a field and serves
 * everyone who passes.
 *
 * Disposition is a field of its own rather than an afterthought because the
 * corpus makes it one. Twenty-five cards say some version of "pozostanie tu, aż
 * ktoś go..." and eighteen say "a następnie ją odłóż"; where the card ends up
 * is frequently the *only* thing distinguishing two otherwise identical
 * effects, and it is the part a table gets wrong without a referee. Knowing
 * that Jednorożec carries you anywhere in your Krąg is half the card; knowing
 * that he then leaves, whether or not you took the ride, is the other half.
 */
export interface CardScript {
  /** What resolving the card does. */
  effect: Effect;
  /** Where the card goes once it has been resolved. */
  disposition: Disposition;
  /**
   * Set when a character may simply decline — "Jeżeli chcesz", "Możesz". The
   * disposition still applies: the Jednorożec leaves either way.
   */
  optional?: boolean;
}

/**
 * Where a card ends up. Every variant is a phrasing the deck actually uses.
 */
export type Disposition =
  /** "odłóż jego Kartę" — onto the used pile, gone. */
  | { kind: "odloz" }
  /** "pozostanie na tym Obszarze do końca rozgrywki" — a permanent fixture. */
  | { kind: "zostaje" }
  /**
   * Stays with a pool of points that visitors draw down, and is discarded when
   * they run out: Drzewo Życia with four Życie, Jezioro Magiczne with four
   * Miecza, Zaklęte Źródło with four Magii.
   */
  | { kind: "zostaje-z-pula"; stat: "zycie" | "miecz" | "magia"; points: number }
  /**
   * Waits for one character and then leaves — "Pierwszej Postaci ... Następnie
   * odłóż jego Kartę". Distinct from `odloz` because the card sits on the board
   * in the meantime, and from `zostaje` because it does not stay.
   */
  | { kind: "do-pierwszej" }
  /** Taken into the character's keeping, like any Przedmiot or Przyjaciel. */
  | { kind: "bierzesz" }
  /** Lasts a stated number of turns and is then discarded (Mgła, Układ Planet). */
  | { kind: "po-turach"; turns: number }
  /** Shuffled back in rather than discarded (a Magiczny Miecz found too low). */
  | { kind: "wraca-do-stosu" };

/** Who an effect lands on. */
export type Target =
  | "ty"
  /** Every character on the board, the drawer included (Burza Siedmiu Słońc). */
  | "wszyscy"
  /** Everyone in the drawer's own Krąg (Zaraza). */
  | "wszyscy-w-kregu"
  /** Whoever later stops on the field the card is lying on. */
  | "kazdy-kto-tu-trafi";

/**
 * Where a card can send a character.
 *
 * "dowolny Obszar w tym Kręgu" is the commonest and is a genuine choice, not a
 * destination, which is why it is a variant rather than a field id.
 */
export type Destination =
  | { kind: "pole"; fieldId: string }
  | { kind: "dowolne-w-kregu" }
  /** Straight back where the move began (Straż). */
  | { kind: "poczatek-ruchu" }
  /**
   * One of a listed set, whichever is free — the Lewiatan settles on whichever
   * of the Mokradła, Przeprawa or Bagna is unoccupied. The choice among them is
   * the players'; what matters is that it is these fields and no others.
   */
  | { kind: "jedno-z"; fieldIds: readonly string[] };

/**
 * What a card does, as an ordered list of operations.
 *
 * The operations are the ones the corpus needs and no more. Anything a card
 * asks for that is not here keeps working the way it always has: the text is
 * shown and the players apply it.
 */
export type Effect =
  /** Do nothing at all — a die table's "Zostałeś zignorowany" face. */
  | { op: "nic" }
  /** Several things in order. */
  | { op: "po-kolei"; steps: Effect[] }
  /** The character picks one (Król Lasu, Wróżka, Koszmar). */
  | { op: "wybor"; options: { label: string; effect: Effect }[] }
  /** One die, six outcomes (Grota, Sidh, Urocza Diablica, Nieznana Świątynia). */
  | { op: "rzut"; faces: Record<number, Effect> }
  | { op: "punkty"; stat: "miecz" | "magia" | "zycie" | "zloto"; delta: number; target?: Target }
  /**
   * Restores Życie but no higher than the four a character starts with (4.7) —
   * Cudotwórca, Księżniczka, the Zamek's Medyk.
   */
  | { op: "uzdrow"; upTo: number }
  | { op: "tura-stracona"; turns: number; target?: Target }
  | { op: "ruch-dodatkowy" }
  | { op: "zaklecie"; count: number }
  /** "taką liczbę Zaklęć, na jaką pozwala ci twoja Magia" (Magiczna Tablica). */
  | { op: "zaklecia-do-limitu" }
  | { op: "przenies"; to: Destination }
  | { op: "wyciagnij"; count: number }
  /** A creature attacks (usually from inside a die table). */
  | { op: "walka"; nazwa: string; miecz?: number; magia?: number }
  | {
      op: "strata";
      co: "przedmiot" | "przyjaciel" | "zaklecie" | "zloto" | "wszystkie-przedmioty";
      count?: number;
      /** Who picks which one goes: the holder, or chance. */
      wybor?: "ty" | "losowo";
      target?: Target;
    }
  | { op: "kamien" }
  | { op: "natura"; na: Nature }
  /**
   * A shop. Targowisko lists eight Przedmioty with prices, the Sztukmistrz
   * sells Zaklęcia at one Sztuka Złota each, and the Gród and Osada do the same
   * from the board itself — so this is a shape the game uses repeatedly rather
   * than a special case for one card.
   */
  | { op: "kup"; towar: { co: string; cena: number }[] }
  /**
   * "Możesz modlić się na takich samych zasadach, jak w Świątyni Nemed."
   *
   * Both Kapliczki borrow a temple's table wholesale rather than reprinting it.
   * Pointing at the field is more faithful than copying its outcomes, and it
   * cannot drift out of step with the field it borrows from.
   */
  | { op: "jak-pole"; fieldId: string }
  /**
   * Puts the *card* somewhere, which is not the same as moving a character.
   *
   * The Upiór rolls for which of six fields he haunts; the Eremita rolls for
   * where he settles; the Lewiatan takes whichever crossing is free. Encoding
   * any of these as `przenies` would teleport the player who drew the card,
   * which is a different and wrong game.
   */
  | { op: "poloz-karte"; gdzie: Destination }
  /**
   * A specific named thing rather than a point: the Eremita offers a Magiczny
   * Miecz or a Tarcza Tolimana, and two temples give the same two away. Both
   * are finite — "jeśli jeszcze są" — which is why the name matters and a
   * generic "+1 Przedmiot" would not do.
   */
  | { op: "otrzymaj"; co: string }
  /** Only happens to some characters (Posłańcy Bogów, Sabat Czarownic). */
  | { op: "gdy"; warunek: Condition; to: Effect; inaczej?: Effect };

/** A test a card applies before doing anything. */
export type Condition =
  | { is: "natura"; jedna_z: Nature[] }
  | { is: "prog"; stat: "miecz" | "magia"; ponizej: number }
  | { is: "ma-zloto" };

/**
 * Every encoded card, gathered from the per-class modules.
 *
 * Split by card class because the classes are genuinely different work — a
 * Miejsce is a fixture, a Spotkanie is an event, a Wróg is a fight — and
 * because it lets several people encode different parts of the deck without
 * meeting in the same file.
 *
 * Absent is the normal state and always will be for some of the deck. A card
 * with no script shows its text, exactly as before.
 */
export const SCRIPTS: Readonly<Record<string, CardScript>> = {
  ...NIEZNAJOMI,
  ...MIEJSCA,
  ...SPOTKANIA,
  ...WROGOWIE,
  ...PRZEDMIOTY,
};

export function scriptFor(cardId: string): CardScript | null {
  return SCRIPTS[cardId] ?? null;
}

/** Every field id a script names, for checking against the board. */
export function fieldsNamedBy(effect: Effect): string[] {
  switch (effect.op) {
    case "przenies":
      return effect.to.kind === "pole" ? [effect.to.fieldId] : [];
    case "jak-pole":
      return [effect.fieldId];
    case "poloz-karte":
      return effect.gdzie.kind === "pole"
        ? [effect.gdzie.fieldId]
        : effect.gdzie.kind === "jedno-z"
          ? [...effect.gdzie.fieldIds]
          : [];
    case "po-kolei":
      return effect.steps.flatMap(fieldsNamedBy);
    case "wybor":
      return effect.options.flatMap((option) => fieldsNamedBy(option.effect));
    case "rzut":
      return Object.values(effect.faces).flatMap(fieldsNamedBy);
    case "gdy":
      return [...fieldsNamedBy(effect.to), ...(effect.inaczej ? fieldsNamedBy(effect.inaczej) : [])];
    default:
      return [];
  }
}

/**
 * A short, human phrasing of where the card ends up.
 *
 * This is the line the app most needs to say out loud. A table that resolves a
 * card correctly and then leaves it in the wrong place has still got the game
 * wrong, and nothing on the card is easier to skim past.
 */
export function describeDisposition(disposition: Disposition): string {
  switch (disposition.kind) {
    case "odloz":
      return "Odłóż Kartę na stos użytych.";
    case "zostaje":
      return "Karta zostaje na tym Obszarze do końca gry.";
    case "zostaje-z-pula": {
      const stat =
        disposition.stat === "zycie" ? "Życia" : disposition.stat === "miecz" ? "Miecza" : "Magii";
      return `Karta zostaje z ${disposition.points} punktami ${stat}; odłóż ją, gdy się wyczerpią.`;
    }
    case "do-pierwszej":
      return "Karta czeka tu na pierwszą Postać, potem ją odłóż.";
    case "bierzesz":
      return "Bierzesz Kartę ze sobą.";
    case "po-turach":
      return `Karta działa przez ${disposition.turns} ${
        disposition.turns === 1 ? "turę" : "tury"
      }, potem ją odłóż.`;
    case "wraca-do-stosu":
      return "Karta wraca do stosu — potasuj.";
  }
}
