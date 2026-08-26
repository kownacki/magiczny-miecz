/** The wish three separate Nieznajomi offer in identical terms. */

import type { Effect } from "../cardScript";

/**
 * The six-way wish three separate Nieznajomi offer in identical terms.
 *
 * A function rather than a shared constant so each card owns its own object
 * tree; the alternative invites an edit meant for one card to silently change
 * three.
 */
export function WISH(): Effect {
  return {
    op: "wybor",
    options: [
      { label: "1 punkt Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
      { label: "1 punkt Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
      { label: "1 punkt Życia", effect: { op: "punkty", stat: "life", delta: 1 } },
      { label: "1 Zaklęcie", effect: { op: "zaklecie", count: 1 } },
      { label: "1 Sztuka Złota", effect: { op: "punkty", stat: "gold", delta: 1 } },
      {
        label: "przeniesienie w tym Kręgu",
        effect: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
      },
    ],
  };
}
