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
