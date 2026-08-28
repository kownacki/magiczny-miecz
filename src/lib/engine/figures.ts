/** The three figures a character has, and which of them are worth showing (1.5, 2.5). */

/**
 * 1.5 is the only fully worked numeric example in the rulebook:
 *
 * > Troll posiada oznaczony żetonami parametr Miecza równy 6… Srebrną Strzałę…
 * > jego Miecz wynosi już 7… też Miecz (Przedmiot mający znaczenie **tylko
 * > podczas walki**)… razem otrzymujemy 8 punktów Miecza podczas walki lub 7 w
 * > każdej innej sytuacji… W efekcie Troll posiada **parametr Miecza równy 8
 * > (6+1+1), a podczas walki 11**.
 *
 * So: **bazowe** are the żetony and nothing else (1.2 — a Przedmiot's points
 * are never marked with a token); **parametr** adds what is always on;
 * **w walce** adds what only counts when somebody swings.
 *
 * All three are read by something. `w walce` is 17.4 and every `op: "walka"`.
 * `parametr` is what the Trzęsawiska test and the six Kamienny Most ordeals
 * subtract, and what the Labirynt and the Spalona Ziemia measure — obstacles
 * rather than fights, which is the line the box actually draws. `bazowe` is
 * 1.3's floor and what 1.4's trophies raise.
 */

/** What a rail or a line should print, with the figures that say nothing left out. */
export interface Figures {
  /**
   * The everyday figure, and the anchor the other two hang off.
   *
   * Always shown, because it is the one a Karta means when it says „Miecz" and
   * the one every obstacle on the board subtracts. The other two are read as
   * departures from it: „and in a fight, this instead", „and of that, this much
   * is yours".
   */
  parametr: number;
  /** Shown only when it differs from the parametr — and it can be *lower*. */
  walka: number | null;
  /** The żetony. Shown only when something has been added to them. */
  own: number | null;
  /** True when all three agree, so the number stands alone with no parentheses. */
  bare: boolean;
}

/**
 * Which of the three to show.
 *
 * The rule, once, so both surfaces read the same:
 *
 * > **The parametr leads. The crossed swords mark the fight figure, where it
 * > differs. Parentheses hold the bazowe figure, where anything has been
 * > added to it.**
 *
 * ```
 * 6              nothing lends anything
 * 8 (6)          always-on only        — w walce = parametr
 * 6, 9⚔          fight-only only       — parametr = bazowe
 * 105, 106⚔ (104)   all three
 * 5, 3⚔          a Rycerz standing in for you — lower, and that is not a bug
 * ```
 *
 * The comma appears only between the two bare numbers, which would otherwise
 * read as one run. Nothing before the parenthesis, which separates by itself.
 *
 * The parametr leads rather than the fight figure because it is the figure that
 * is true right now: a rail is read at rest far more often than in a fight, and
 * the number a player is asked for by a Karta, a Pułapka or a przeprawa is this
 * one. The fight figure is the departure, and reads as one.
 *
 * The last line is why nothing here assumes the numbers descend.
 * `walczy-za-ciebie` *replaces* the fight figure with the champion's rather
 * than adding to it, so a Barbarzyńca of Miecz 5 fights at the Rycerz's 3.
 */
export function figuresOf(own: number, parametr: number, walka: number): Figures {
  return {
    parametr,
    walka: walka === parametr ? null : walka,
    own: own === parametr ? null : own,
    bare: parametr === own && walka === parametr,
  };
}

/** The crossed swords that mark the fight figure. Named once so it cannot drift. */
export const IN_FIGHT = "⚔";

/**
 * The figures as one string, for the console and for anything else without
 * elements to nest.
 *
 * The browser draws the same thing out of `figuresOf` directly, so that the
 * glyph, the parentheses and the order live here and not in three files.
 */
export function figuresText(own: number, parametr: number, walka: number): string {
  const figures = figuresOf(own, parametr, walka);
  if (figures.bare) return String(parametr);
  return [
    // The comma only between the two bare numbers — see the note above.
    figures.walka === null ? String(parametr) : `${parametr},`,
    figures.walka === null ? null : `${figures.walka}${IN_FIGHT}`,
    figures.own === null ? null : `(${figures.own})`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}
