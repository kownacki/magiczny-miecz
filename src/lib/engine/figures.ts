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
 * So: **własne** are the żetony and nothing else (1.2 — a Przedmiot's points
 * are never marked with a token); **parametr** adds what is always on;
 * **w walce** adds what only counts when somebody swings.
 *
 * All three are read by something. `w walce` is 17.4 and every `op: "walka"`.
 * `parametr` is what the Trzęsawiska test and the six Kamienny Most ordeals
 * subtract, and what the Labirynt and the Spalona Ziemia measure — obstacles
 * rather than fights, which is the line the box actually draws. `własne` is
 * 1.3's floor and what 1.4's trophies raise.
 */

/** What a rail or a line should print, with the figures that say nothing left out. */
export interface Figures {
  /** The żetony. Always shown, because it is the one that is always true. */
  own: number;
  /** Shown only when something always-on lifts it above `own`. */
  parametr: number | null;
  /** Shown only when it differs from the parametr — and it can be *lower*. */
  walka: number | null;
  /** True when all three agree, so the number stands alone with no parentheses. */
  bare: boolean;
}

/**
 * Which of the three to show.
 *
 * The rule, once, so both surfaces read the same:
 *
 * > **Parentheses always hold własne. A bare second number is the parametr. The
 * > crossed swords mark the fight figure. A figure you cannot see equals the
 * > one to its right.**
 *
 * ```
 * 6           nothing lends anything
 * 8 (6)       always-on only        — w walce = parametr = 8
 * 9⚔ (6)      fight-only only       — parametr = własne = 6
 * 11⚔ 8 (6)   both, which is 1.5's Troll
 * 3⚔ (5)      a Rycerz standing in for you — lower, and that is not a bug
 * ```
 *
 * The last one is why nothing here assumes the numbers descend.
 * `walczy-za-ciebie` *replaces* the fight figure with the champion's rather
 * than adding to it, so a Barbarzyńca of Miecz 5 fights at the Rycerz's 3.
 */
export function figuresOf(own: number, parametr: number, walka: number): Figures {
  return {
    own,
    parametr: parametr === own ? null : parametr,
    walka: walka === parametr ? null : walka,
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
  if (figures.bare) return String(own);
  return [
    figures.walka === null ? null : `${figures.walka}${IN_FIGHT}`,
    figures.parametr === null ? null : String(figures.parametr),
    `(${own})`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}
