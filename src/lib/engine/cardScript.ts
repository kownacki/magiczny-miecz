/** What a one-shot or fixture card does, and — just as importantly — where the card goes afterwards. */

import type { Nature } from "@/data/types";

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
  | { kind: "poczatek-ruchu" };

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
  /** Only happens to some characters (Posłańcy Bogów, Sabat Czarownic). */
  | { op: "gdy"; warunek: Condition; to: Effect; inaczej?: Effect };

/** A test a card applies before doing anything. */
export type Condition =
  | { is: "natura"; jedna_z: Nature[] }
  | { is: "prog"; stat: "miecz" | "magia"; ponizej: number }
  | { is: "ma-zloto" };

/**
 * The cards encoded so far, keyed by card id.
 *
 * Absent is the normal state and always will be for some of the deck. A card
 * with no script shows its text, exactly as before — the same
 * progressive-enhancement bargain the rest of the card data makes.
 */
export const SCRIPTS: Readonly<Record<string, CardScript>> = {
  // --- Nieznajomi who grant something and leave ------------------------------

  // The card that prompted all of this: a ride anywhere in your own Krąg, and
  // then he is gone whether or not you took it.
  jednorozec: {
    optional: true,
    effect: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
    disposition: { kind: "odloz" },
  },
  "dziki-rumak": {
    optional: true,
    effect: { op: "ruch-dodatkowy" },
    disposition: { kind: "odloz" },
  },
  polbog: {
    effect: { op: "zaklecie", count: 1 },
    disposition: { kind: "odloz" },
  },
  // Three cards word the same wish differently and mean the same six things.
  "krol-lasu": {
    effect: WISH(),
    disposition: { kind: "do-pierwszej" },
  },
  wrozka: {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra"] },
      to: WISH(),
    },
    disposition: { kind: "do-pierwszej" },
  },
  koszmar: {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["zla"] },
      to: WISH(),
    },
    disposition: { kind: "do-pierwszej" },
  },
  "zlodziej-dobroczynca": {
    effect: {
      op: "gdy",
      warunek: { is: "ma-zloto" },
      to: { op: "punkty", stat: "zloto", delta: -1 },
      inaczej: { op: "punkty", stat: "zloto", delta: 1 },
    },
    disposition: { kind: "odloz" },
  },
  wielkolud: {
    effect: {
      op: "rzut",
      faces: {
        1: { op: "nic" },
        2: { op: "nic" },
        3: { op: "strata", co: "przedmiot", count: 1, wybor: "losowo" },
        4: { op: "strata", co: "przedmiot", count: 1, wybor: "losowo" },
        5: { op: "strata", co: "przyjaciel", count: 1, wybor: "losowo" },
        6: { op: "strata", co: "przyjaciel", count: 1, wybor: "losowo" },
      },
    },
    disposition: { kind: "odloz" },
  },
  "urocza-diablica": {
    effect: {
      op: "rzut",
      faces: {
        1: { op: "zaklecie", count: 1 },
        2: { op: "punkty", stat: "magia", delta: 1 },
        3: { op: "punkty", stat: "miecz", delta: 1 },
        4: { op: "strata", co: "przedmiot", count: 1 },
        5: { op: "punkty", stat: "zycie", delta: -1 },
        6: { op: "kamien" },
      },
    },
    disposition: { kind: "zostaje" },
  },
  cudotworca: {
    effect: { op: "uzdrow", upTo: 2 },
    disposition: { kind: "zostaje" },
  },
  czarodziej: {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra"] },
      to: { op: "zaklecie", count: 1 },
    },
    disposition: { kind: "zostaje" },
  },

  // --- Miejsca: fixtures that serve whoever arrives --------------------------

  "drzewo-zycia": {
    optional: true,
    effect: { op: "punkty", stat: "zycie", delta: 1, target: "kazdy-kto-tu-trafi" },
    disposition: { kind: "zostaje-z-pula", stat: "zycie", points: 4 },
  },
  "jezioro-magiczne": {
    optional: true,
    effect: { op: "punkty", stat: "miecz", delta: 1, target: "kazdy-kto-tu-trafi" },
    disposition: { kind: "zostaje-z-pula", stat: "miecz", points: 4 },
  },
  "zaklete-zrodlo": {
    optional: true,
    effect: { op: "punkty", stat: "magia", delta: 1, target: "kazdy-kto-tu-trafi" },
    disposition: { kind: "zostaje-z-pula", stat: "magia", points: 4 },
  },
  labirynt: {
    effect: {
      op: "gdy",
      warunek: { is: "prog", stat: "magia", ponizej: 5 },
      to: { op: "tura-stracona", turns: 1, target: "kazdy-kto-tu-trafi" },
    },
    disposition: { kind: "zostaje" },
  },
  "spalona-ziemia": {
    effect: {
      op: "gdy",
      warunek: { is: "prog", stat: "miecz", ponizej: 5 },
      to: { op: "tura-stracona", turns: 1, target: "kazdy-kto-tu-trafi" },
    },
    disposition: { kind: "zostaje" },
  },
  grota: {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "punkty", stat: "zloto", delta: 3 },
        2: { op: "punkty", stat: "zloto", delta: 2 },
        3: { op: "punkty", stat: "zloto", delta: 1 },
        4: { op: "tura-stracona", turns: 1 },
        5: { op: "walka", nazwa: "Hadron", miecz: 3 },
        6: { op: "walka", nazwa: "Wilkołak", miecz: 10 },
      },
    },
    disposition: { kind: "zostaje" },
  },
  sidh: {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "punkty", stat: "zloto", delta: 3 },
        2: { op: "punkty", stat: "zloto", delta: 2 },
        3: { op: "punkty", stat: "zloto", delta: 1 },
        4: { op: "walka", nazwa: "Widmo", magia: 3 },
        5: { op: "walka", nazwa: "Zjawa", magia: 5 },
        6: { op: "walka", nazwa: "Demon", magia: 10 },
      },
    },
    disposition: { kind: "zostaje" },
  },
  "tajemne-przejscie": {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "przenies", to: { kind: "pole", fieldId: "grod" } },
        2: { op: "przenies", to: { kind: "pole", fieldId: "osada" } },
        3: { op: "przenies", to: { kind: "pole", fieldId: "twierdza-strzegaca-drog" } },
        4: { op: "przenies", to: { kind: "pole", fieldId: "swiatynia-bogini-nemed" } },
        5: { op: "przenies", to: { kind: "pole", fieldId: "wymarle-miasto" } },
        6: { op: "przenies", to: { kind: "pole", fieldId: "krypta-upiorow" } },
      },
    },
    disposition: { kind: "zostaje" },
  },
  "skalne-wrota": {
    optional: true,
    effect: { op: "wyciagnij", count: 3 },
    disposition: { kind: "odloz" },
  },

  // --- Spotkania: one-shot events -------------------------------------------

  "zakleta-sciezka": {
    effect: {
      op: "rzut",
      faces: {
        1: { op: "przenies", to: { kind: "pole", fieldId: "rownina-snu" } },
        2: { op: "przenies", to: { kind: "pole", fieldId: "rownina-traw" } },
        3: { op: "przenies", to: { kind: "pole", fieldId: "dolina-cienia" } },
        4: { op: "przenies", to: { kind: "pole", fieldId: "mroczna-polana" } },
        5: { op: "przenies", to: { kind: "pole", fieldId: "osada" } },
        6: { op: "przenies", to: { kind: "pole", fieldId: "karczma" } },
      },
    },
    disposition: { kind: "odloz" },
  },
  straz: {
    effect: { op: "przenies", to: { kind: "poczatek-ruchu" } },
    disposition: { kind: "odloz" },
  },
  zaraza: {
    effect: { op: "punkty", stat: "zycie", delta: -1, target: "wszyscy-w-kregu" },
    disposition: { kind: "odloz" },
  },
  "burza-siedmiu-slonc": {
    effect: { op: "tura-stracona", turns: 1, target: "wszyscy" },
    disposition: { kind: "odloz" },
  },
  "zacmienie-slonc": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra", "chaotyczna"] },
      to: { op: "tura-stracona", turns: 1, target: "wszyscy" },
    },
    disposition: { kind: "odloz" },
  },
  "magiczna-tablica": {
    effect: { op: "zaklecia-do-limitu" },
    disposition: { kind: "odloz" },
  },
  "zatrute-ziola": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["zla"] },
      to: { op: "punkty", stat: "zycie", delta: 1 },
      inaczej: {
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["dobra"] },
        to: { op: "punkty", stat: "zycie", delta: -1 },
      },
    },
    disposition: { kind: "odloz" },
  },
  "poslancy-bogow": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra"] },
      to: { op: "punkty", stat: "zycie", delta: 1 },
      inaczej: {
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["zla"] },
        to: { op: "punkty", stat: "zycie", delta: -1 },
      },
    },
    disposition: { kind: "odloz" },
  },
  "sabat-czarownic": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["zla"] },
      to: { op: "punkty", stat: "magia", delta: 1 },
      inaczej: { op: "natura", na: "zla" },
    },
    disposition: { kind: "odloz" },
  },
  "slup-ognia": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra"] },
      to: { op: "punkty", stat: "magia", delta: 1 },
      inaczej: { op: "natura", na: "dobra" },
    },
    disposition: { kind: "odloz" },
  },
  zasadzka: {
    effect: {
      op: "po-kolei",
      steps: [
        { op: "strata", co: "zloto" },
        { op: "strata", co: "wszystkie-przedmioty" },
      ],
    },
    disposition: { kind: "odloz" },
  },
  mgla: {
    effect: { op: "nic" },
    disposition: { kind: "po-turach", turns: 2 },
  },
  "uklad-planet": {
    effect: { op: "nic" },
    disposition: { kind: "po-turach", turns: 1 },
  },
};

/**
 * The six-way wish three separate Nieznajomi offer in identical terms.
 *
 * A function rather than a shared constant so each card owns its own object
 * tree; the alternative invites an edit meant for one card to silently change
 * three.
 */
function WISH(): Effect {
  return {
    op: "wybor",
    options: [
      { label: "1 punkt Miecza", effect: { op: "punkty", stat: "miecz", delta: 1 } },
      { label: "1 punkt Magii", effect: { op: "punkty", stat: "magia", delta: 1 } },
      { label: "1 punkt Życia", effect: { op: "punkty", stat: "zycie", delta: 1 } },
      { label: "1 Zaklęcie", effect: { op: "zaklecie", count: 1 } },
      { label: "1 Sztuka Złota", effect: { op: "punkty", stat: "zloto", delta: 1 } },
      {
        label: "przeniesienie w tym Kręgu",
        effect: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
      },
    ],
  };
}

export function scriptFor(cardId: string): CardScript | null {
  return SCRIPTS[cardId] ?? null;
}

/** Every field id a script names, for checking against the board. */
export function fieldsNamedBy(effect: Effect): string[] {
  switch (effect.op) {
    case "przenies":
      return effect.to.kind === "pole" ? [effect.to.fieldId] : [];
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
