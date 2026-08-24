/** Przedmioty whose card is an event rather than a standing rule. */

import type { CardScript } from "../cardScript";

/**
 * Most Przedmiot cards are things you pick up and keep, and what they then do
 * is a standing rule — those live in `abilities.ts`, not here. This module is
 * for the ones that resolve and go: gold you simply take, a card that must be
 * shuffled back, an item consumed on use.
 */
export const PRZEDMIOTY: Readonly<Record<string, CardScript>> = {
  // "Zamień tę Kartę na N Sztuk Złota, a następnie ją odłóż." Not a Przedmiot in
  // any sense that matters — it never reaches the character's hand, so it costs
  // nothing against the four-item limit of 5.4 and there is nothing to lose on
  // the Bagna later. The card is the gold, and then it is gone.
  "1-sztuka-zlota": {
    effect: { op: "punkty", stat: "zloto", delta: 1 },
    disposition: { kind: "odloz" },
  },
  "2-sztuki-zlota": {
    effect: { op: "punkty", stat: "zloto", delta: 2 },
    disposition: { kind: "odloz" },
  },
};
