/** The wish three separate Nieznajomi offer in identical terms. */

import type { Effect } from "../cardScript";

/**
 * The six-way wish three separate Nieznajomi offer in identical terms.
 *
 * Labelled with what each does rather than with what it is — „zyskujesz 1 punkt
 * Miecza", not „1 punkt Miecza". These strings are read twice: as the buttons
 * a player presses and as the rows of the panel beside the picture, and the
 * panel is a list of what may happen. A noun phrase reads as an inventory
 * there; the verb is what makes it an offer.
 *
 * A function rather than a shared constant so each card owns its own object
 * tree; the alternative invites an edit meant for one card to silently change
 * three.
 */
export function WISH(): Effect {
  return {
    op: "wybor",
    options: [
      { label: "zyskujesz 1 punkt Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
      { label: "zyskujesz 1 punkt Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
      { label: "zyskujesz 1 punkt Życia", effect: { op: "punkty", stat: "life", delta: 1 } },
      { label: "zyskujesz 1 Zaklęcie", effect: { op: "zaklecie", count: 1 } },
      { label: "zyskujesz 1 Sztukę Złota", effect: { op: "punkty", stat: "gold", delta: 1 } },
      {
        label: "przenosisz się na dowolny Obszar w tym Kręgu",
        effect: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
      },
    ],
  };
}
