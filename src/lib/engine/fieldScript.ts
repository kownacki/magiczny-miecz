/** What the fields that offer something actually offer, in the same language the cards use. */

import type { Effect } from "./cardScript";
import type { FieldId } from "./board";

/**
 * Ten of the board's fields are not events but establishments. They print a
 * price list, a service, or a die table, and until now the app read them out
 * and left the table to do the arithmetic — which is the exact chore this
 * project exists to take away. Standing on the Osada with six gold and being
 * told, in prose, that a Miecz costs two is not refereeing.
 *
 * Written in `Effect`, the same vocabulary the card scripts use, so a field's
 * offer renders through the same controls as a card's and a shop is one thing
 * in this codebase rather than two. `kup` was already in that vocabulary for
 * the Targowisko card; the Osada's Płatnerz is the same shop nailed to the
 * board.
 *
 * What is *not* here: the fields whose whole text is a fight, a draw, or a
 * move. Those already work. This is only the ones that trade.
 */
export interface FieldScript {
  /**
   * Named services a character picks between — "MOŻESZ TU ODWIEDZIĆ:" lists
   * three of them at the Osada and two at the Gród, and visiting one is not
   * visiting the others.
   */
  offers: FieldOffer[];
  /**
   * Set where the field gives no choice: the Karczma's "MUSISZ RZUCIĆ KOSTKĄ"
   * and the Strażnik's toll happen whether or not anybody wanted them.
   */
  obowiazkowe?: boolean;
}

export interface FieldOffer {
  /** Who or what is being visited, as the board names them. */
  name: string;
  effect: Effect;
}

/**
 * The Osada's Czarownica table is printed with an overlap: "1-2 - tracisz 1
 * punkt Miecza; 2 - zyskujesz 1 punkt Miecza lub 1 punkt Magii". A 2 cannot be
 * both. Every other die table in the box assigns each face once, and the rest
 * of this one reads as a ladder from bad to good, so a 1 is the loss and the 2
 * is the first of the gains. It is a house reading of a misprint, and the only
 * one in this file.
 */
const CZAROWNICA: Effect = {
  op: "rzut",
  faces: {
    1: { op: "punkty", stat: "miecz", delta: -1 },
    2: {
      op: "wybor",
      options: [
        { label: "+1 Miecza", effect: { op: "punkty", stat: "miecz", delta: 1 } },
        { label: "+1 Magii", effect: { op: "punkty", stat: "magia", delta: 1 } },
      ],
    },
    3: {
      op: "wybor",
      options: [
        { label: "+1 Magii", effect: { op: "punkty", stat: "magia", delta: 1 } },
        { label: "+1 Miecza", effect: { op: "punkty", stat: "miecz", delta: 1 } },
      ],
    },
    4: {
      op: "wybor",
      options: [
        { label: "+1 Magii", effect: { op: "punkty", stat: "magia", delta: 1 } },
        { label: "+1 Miecza", effect: { op: "punkty", stat: "miecz", delta: 1 } },
      ],
    },
    5: { op: "zaklecie", count: 1 },
    6: { op: "nic" },
  },
};

export const FIELD_SCRIPTS: Readonly<Partial<Record<FieldId, FieldScript>>> = {
  osada: {
    offers: [
      { name: "Czarownica", effect: CZAROWNICA },
      {
        name: "Płatnerz",
        effect: {
          op: "kup",
          towar: [
            { co: "Miecz", cena: 2 },
            { co: "Sztylet", cena: 3 },
            { co: "Hełm", cena: 1 },
          ],
        },
      },
      // "za każdą Sztukę Złota przywróci ci 1 punkt Życia" — no die and no cap
      // beyond 4.7's, which is what makes it the reliable one of the three
      // healers and worth the walk.
      { name: "Medyk", effect: { op: "uzdrow", upTo: 4, cena: 1 } },
    ],
  },

  grod: {
    offers: [
      {
        name: "Wróżbita",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "zaklecie", count: 1 },
            2: { op: "kamien" },
            // "jeżeli jesteś Zły stajesz się Dobry. Jeżeli jesteś Chaotyczny
            // stajesz się Zły" — two conditions, and a character already Dobry
            // is untouched.
            3: {
              op: "gdy",
              warunek: { is: "natura", jedna_z: ["zla"] },
              to: { op: "natura", na: "dobra" },
              inaczej: {
                op: "gdy",
                warunek: { is: "natura", jedna_z: ["chaotyczna"] },
                to: { op: "natura", na: "zla" },
                inaczej: { op: "nic" },
              },
            },
            4: { op: "nic" },
            5: { op: "nic" },
            6: { op: "nic" },
          },
        },
      },
      { name: "Lichwiarz", effect: { op: "sprzedaj", cena: 1 } },
    ],
  },

  // "MUSISZ RZUCIĆ KOSTKĄ" — the one establishment nobody walks past.
  karczma: {
    obowiazkowe: true,
    offers: [
      {
        name: "Karczma",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "punkty", stat: "zloto", delta: -1 },
            2: { op: "punkty", stat: "zloto", delta: 1 },
            3: { op: "tura-stracona", turns: 1 },
            4: { op: "walka", nazwa: "Miejscowy osiłek", miecz: 4 },
            5: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
            6: { op: "przenies", to: { kind: "pole", fieldId: "swiatynia-bogini-nemed" } },
          },
        },
      },
    ],
  },

  // Paid healing that can go wrong: the gold is spent before the die, which is
  // what "po uiszczeniu opłaty rzuć kostką" says and what makes a 6 hurt twice.
  zamek: {
    offers: [
      {
        name: "Nadworny Medyk",
        effect: {
          op: "po-kolei",
          steps: [
            { op: "uzdrow", upTo: 4, cena: 1 },
            {
              op: "rzut",
              faces: {
                1: { op: "nic" },
                2: { op: "nic" },
                3: { op: "nic" },
                4: { op: "nic" },
                5: { op: "nic" },
                6: { op: "punkty", stat: "zycie", delta: -1 },
              },
            },
          ],
        },
      },
    ],
  },

  pustelnia: {
    offers: [
      // "pod warunkiem, że wyrzekniesz się bogactwa" — the price is the same
      // Sztuka Złota per wound as the Osada's Medyk; the renunciation is the
      // flavour on it.
      { name: "Pustelnik", effect: { op: "uzdrow", upTo: 4, cena: 1 } },
    ],
  },

  "magiczne-wrota": {
    offers: [
      {
        name: "Życzenie",
        effect: {
          op: "wybor",
          options: [
            { label: "+1 Miecza", effect: { op: "punkty", stat: "miecz", delta: 1 } },
            { label: "+1 Magii", effect: { op: "punkty", stat: "magia", delta: 1 } },
            { label: "+1 Zaklęcie", effect: { op: "zaklecie", count: 1 } },
            { label: "+1 Sztuka Złota", effect: { op: "punkty", stat: "zloto", delta: 1 } },
          ],
        },
      },
    ],
  },

  "straznik-magicznych-wrot": {
    obowiazkowe: true,
    offers: [
      {
        name: "Strażnik",
        effect: {
          op: "wybor",
          options: [
            { label: "Zapłać 1 Sz. Z.", effect: { op: "punkty", stat: "zloto", delta: -1 } },
            { label: "Tracisz 1 Życia", effect: { op: "punkty", stat: "zycie", delta: -1 } },
          ],
        },
      },
    ],
  },

};

export function fieldScriptFor(fieldId: FieldId): FieldScript | null {
  return FIELD_SCRIPTS[fieldId] ?? null;
}

/**
 * How a field's own offer is written into the same "resolved" list the cards
 * use.
 *
 * Prefixed so it can never collide with a card id — the Karczma is not a card,
 * and a field named the same as one would otherwise silently resolve it.
 *
 * Here rather than beside the code that writes it, because the interface needs
 * to ask the same question and `turnStore` carries the service-role database
 * handle: one import of that from a client component would put the key's client
 * in the browser bundle.
 */
export function offerKey(offerName: string): string {
  return `pole:${offerName}`;
}

/**
 * The offer this Obszar makes whether or not it is asked (16.5).
 *
 * A Karczma happens to whoever arrives; it is not a button. So the window that
 * shows it opens by itself, and `windowsFor` needs to know that this Obszar is
 * one of the ones that demands rather than offers.
 *
 * Lived in the page component, which meant the one thing that decides whether a
 * turn can be walked away from was written where nothing could test it.
 */
export function compulsoryOffer(
  fieldId: FieldId | null,
  resolved: readonly string[],
): { name: string; effect: Effect } | null {
  if (!fieldId) return null;
  const script = fieldScriptFor(fieldId);
  if (!script?.obowiazkowe) return null;
  const owed = script.offers.find((offer) => !resolved.includes(offerKey(offer.name)));
  return owed ? { name: owed.name, effect: owed.effect } : null;
}
