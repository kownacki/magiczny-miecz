/** What the fields that offer something actually offer, in the same language the cards use. */

import { scriptFor, type Effect } from "./cardScript";
import { cardName } from "./polish";
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
  /**
   * The board's own sentence for *this* offer, where the Obszar prints several.
   *
   * Only three fields need it. The Osada and the Gród head their text with
   * "MOŻESZ TU ODWIEDZIĆ:" and then give a line each — "Płatnerza: możesz u
   * niego kupić: za 2 Sz. Z. miecz…" — and the Pustelnia prints a paragraph
   * about the Pustelnik and nothing at all about the Egzorcyzm, whose text is
   * on the ZŁY DUCH's Karta rather than on the square. Everywhere else the
   * Obszar has exactly one offer and its whole text *is* that offer's, which
   * `offerText` falls back to rather than copying six paragraphs into this file
   * to be kept in step by hand.
   *
   * Verbatim, and `fieldScript.test.ts` checks that it still appears inside the
   * Obszar's own transcription — a line that has drifted from the board is
   * worse than no line, because it looks like the board.
   */
  text?: string;
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
    1: { op: "punkty", stat: "sword", delta: -1 },
    2: {
      op: "wybor",
      options: [
        { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
        { label: "+1 Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
      ],
    },
    3: {
      op: "wybor",
      options: [
        { label: "+1 Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
        { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
      ],
    },
    4: {
      op: "wybor",
      options: [
        { label: "+1 Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
        { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
      ],
    },
    5: { op: "zaklecie", count: 1 },
    6: { op: "nic" },
  },
};

/**
 * The Bagna, which both Obszary print identically.
 *
 * "wedle własnego wyboru" is the holder's choice of *kind* first, and then of
 * card — 5.6 makes which one goes theirs to decide, so neither `strata` rolls
 * for it. A character with nothing of the kind they picked loses nothing, which
 * is what the rule says and not a bug to be worked around.
 */
const BAGNA: Effect = {
  op: "wybor",
  options: [
    {
      label: "Tracisz Przedmiot",
      effect: { op: "strata", co: "przedmiot", count: 1, wybor: "ty" },
    },
    {
      label: "Tracisz Przyjaciela",
      effect: { op: "strata", co: "przyjaciel", count: 1, wybor: "ty" },
    },
  ],
};

export const FIELD_SCRIPTS: Readonly<Partial<Record<FieldId, FieldScript>>> = {
  osada: {
    offers: [
      {
        name: "Czarownica",
        text: "Czarownicę: rzuć kostką 1-2 - tracisz 1 punkt Miecza; 2 - zyskujesz 1 punkt Miecza lub 1 punkt Magii, 3,4 - zyskujesz 1 punkt Magii lub 1 punkt Miecza; 5 - zyskujesz 1 Zaklęcie; 6 - zostajesz zignorowany.",
        effect: CZAROWNICA,
      },
      {
        name: "Płatnerz",
        text: "Płatnerza: możesz u niego kupić: za 2 Sz. Z. miecz; sztylet za 3 Sz. Z.; hełm - 1 Sz. Z.",
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
      {
        name: "Medyk",
        text: "Medyka: za każdą Sztukę Złota przywróci ci 1 punkt Życia.",
        effect: { op: "uzdrow", upTo: 4, cena: 1 },
      },
    ],
  },

  grod: {
    offers: [
      {
        name: "Wróżbita",
        text: "Wróżbitę: rzuć kostką 1 - zyskujesz 1 Zaklęcie; 2 - zostajesz Zaklęty w Kamień; 3 - jeżeli jesteś Zły stajesz się Dobry. Jeżeli jesteś Chaotyczny stajesz się Zły; 4-6 zostałeś zignorowany.",
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
              warunek: { is: "natura", jedna_z: ["evil"] },
              to: { op: "natura", na: "good" },
              inaczej: {
                op: "gdy",
                warunek: { is: "natura", jedna_z: ["chaotic"] },
                to: { op: "natura", na: "evil" },
                inaczej: { op: "nic" },
              },
            },
            4: { op: "nic" },
            5: { op: "nic" },
            6: { op: "nic" },
          },
        },
      },
      {
        name: "Lichwiarz",
        text: "Lichwiarza - możesz wymienić dowolne Przedmioty na złoto (odłóż ich Karty i weź po 1 Sz.Z. za każdy).",
        effect: { op: "sprzedaj", cena: 1 },
      },
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
            1: { op: "punkty", stat: "gold", delta: -1 },
            2: { op: "punkty", stat: "gold", delta: 1 },
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
                6: { op: "punkty", stat: "life", delta: -1 },
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
      {
        name: "Pustelnik",
        text: "Pustelnik może z pomocą ziół przywrócić ci punkty Życia z początku wędrówki pod warunkiem, że wyrzekniesz się bogactwa. Musisz odrzucić 1 Sz. Z. za każdą wyleczoną ranę.",
        effect: { op: "uzdrow", upTo: 4, cena: 1 },
      },
      /**
       * "Nie możesz zdobywać nowych Przyjaciół, dopóki nie uwolnisz się od
       * niego, odwiedzając Pustelnię."
       *
       * A second thing to visit the Pustelnik for, and the only cure for the
       * Zły Duch anywhere on the board. Free — the renunciation is the price of
       * the healing, and the card asks nothing for this.
       */
      { name: "Egzorcyzm", effect: { op: "uwolnij", od: "zly-duch" } },
    ],
  },

  "magiczne-wrota": {
    offers: [
      {
        name: "Życzenie",
        effect: {
          op: "wybor",
          options: [
            { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
            { label: "+1 Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
            { label: "+1 Zaklęcie", effect: { op: "zaklecie", count: 1 } },
            { label: "+1 Sztuka Złota", effect: { op: "punkty", stat: "gold", delta: 1 } },
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
            { label: "Zapłać 1 Sz. Z.", effect: { op: "punkty", stat: "gold", delta: -1 } },
            { label: "Tracisz 1 Życia", effect: { op: "punkty", stat: "life", delta: -1 } },
          ],
        },
      },
    ],
  },

  /* ------------------------------------------------------------------------
   * Obszary that simply do something to whoever stops there.
   *
   * `obowiazkowe` on all of them: the board states these flat, with no "MOŻESZ"
   * anywhere, so they are not a service anybody chooses to visit. Until these
   * existed the Ruchome Skały cost nothing and the Bagna took nothing — the
   * printed text was shown and the players applied it themselves — which also
   * left the cards that guard against them (Rękawice, Kij i Sznur, Relikwiarz)
   * with nothing to guard against.
   * --------------------------------------------------------------------- */

  // "Tracisz 1 Życie." The Rękawice and the Święty Graal both keep it.
  "ruchome-skaly-1": {
    obowiazkowe: true,
    offers: [{ name: "Ruchome Skały", effect: { op: "punkty", stat: "life", delta: -1 } }],
  },
  "ruchome-skaly-2": {
    obowiazkowe: true,
    offers: [{ name: "Ruchome Skały", effect: { op: "punkty", stat: "life", delta: -1 } }],
  },

  /**
   * "Tracisz 1 z Przedmiotów (również Magicznych) lub 1 z Przyjaciół, wedle
   * własnego wyboru."
   *
   * The choice is the holder's twice over — which kind, and then which card —
   * so it is a `wybor` between two `strata`, each picked `ty`. The Kij i Sznur
   * takes the whole thing away.
   */
  "bagna-1": {
    obowiazkowe: true,
    offers: [{ name: "Bagna", effect: BAGNA }],
  },
  "bagna-2": {
    obowiazkowe: true,
    offers: [{ name: "Bagna", effect: BAGNA }],
  },

  /* ------------------------------------------------------------------------
   * Obszary that make you roll.
   *
   * All five print "MUSISZ RZUCIĆ KOSTKĄ" or the same thing in other words, so
   * all five are `obowiazkowe`. These are what the Opiekun, the Przewodnik, the
   * Elflin and the Rusałka were written to walk past — `bezpieczny` with
   * `from: "rzut"` — and until the tables existed there was no roll for any of
   * them to skip.
   * --------------------------------------------------------------------- */

  // "1 - zyskujesz 1 punkt Miecza; 2-3 nic się nie dzieje; 4-5 zostałeś opętany
  // przez duchy, tracisz 1 turę; 6 - zostałeś zaatakowany przez Ducha (Magia 4)."
  kurhan: {
    obowiazkowe: true,
    offers: [
      {
        name: "Kurhan",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "punkty", stat: "sword", delta: 1 },
            2: { op: "nic" },
            3: { op: "nic" },
            4: { op: "tura-stracona", turns: 1 },
            5: { op: "tura-stracona", turns: 1 },
            6: { op: "walka", nazwa: "Duch", magia: 4 },
          },
        },
      },
    ],
  },

  /**
   * "1, 2, 3 - udało ci się bezpiecznie przemknąć; 4 - zaatakował cię
   * mieszkający tu Wilkołak (Miecz 4); 5 - ... (Miecz 5); 6 - ... (Miecz 6)."
   *
   * The same creature at three strengths rather than three creatures, which is
   * why the name does not change with the face. Arondight and the Topór both
   * know it by name and are worth their other figure against it.
   */
  "wilczy-parow": {
    obowiazkowe: true,
    offers: [
      {
        name: "Wilczy Parów",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "nic" },
            2: { op: "nic" },
            3: { op: "nic" },
            4: { op: "walka", nazwa: "Wilkołak", miecz: 4 },
            5: { op: "walka", nazwa: "Wilkołak", miecz: 5 },
            6: { op: "walka", nazwa: "Wilkołak", miecz: 6 },
          },
        },
      },
    ],
  },

  // The same shape as the Wilczy Parów, in Magia rather than Miecz.
  "krypta-upiorow": {
    obowiazkowe: true,
    offers: [
      {
        name: "Krypta Upiorów",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "nic" },
            2: { op: "nic" },
            3: { op: "nic" },
            4: { op: "walka", nazwa: "Upiór", magia: 4 },
            5: { op: "walka", nazwa: "Upiór", magia: 5 },
            6: { op: "walka", nazwa: "Upiór", magia: 6 },
          },
        },
      },
    ],
  },

  // "1 - Strażnik Kręgu (Miecz 5); 2, 3 - tracisz 1 turę; 4, 5 - nic się nie
  // dzieje; 6 - zyskujesz 1 punkt Magii."
  "krag-mocy": {
    obowiazkowe: true,
    offers: [
      {
        name: "Krąg Mocy",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "walka", nazwa: "Strażnik Kręgu", miecz: 5 },
            2: { op: "tura-stracona", turns: 1 },
            3: { op: "tura-stracona", turns: 1 },
            4: { op: "nic" },
            5: { op: "nic" },
            6: { op: "punkty", stat: "magic", delta: 1 },
          },
        },
      },
    ],
  },

  /**
   * "Jeżeli jesteś: Dobry - tracisz 1 Życie; Chaotyczny - rzuć kostką 1, 2, 3 -
   * zyskujesz 1 Życie; 4, 5, 6 - tracisz 1 Życie; Zły - możesz wezwać Siły
   * Ciemności: ..."
   *
   * Three Natury and three different things, which is why it is a `gdy` chain
   * rather than a table: the die is only thrown for two of them, and for the
   * Dobra Postać there is nothing to throw. Checked against the board scan
   * rather than trusted from the transcription, because a mis-split here would
   * cost the wrong Natura a point of Życie.
   *
   * The Zły branch is the only optional one — "możesz wezwać" — so it is a
   * `wybor` inside the compulsory whole. Declining is a real answer: two of the
   * six faces are bad, and calling on the Siły Ciemności is a gamble the board
   * offers rather than imposes.
   *
   * The Relikwiarz spares a Dobra Postać here, and `sparedHere` reaches it
   * because the Dobry branch is an ordinary loss of Życie.
   */
  "czarci-mlyn": {
    obowiazkowe: true,
    offers: [
      {
        name: "Czarci Młyn",
        effect: {
          op: "gdy",
          warunek: { is: "natura", jedna_z: ["good"] },
          to: { op: "punkty", stat: "life", delta: -1 },
          inaczej: {
            op: "gdy",
            warunek: { is: "natura", jedna_z: ["chaotic"] },
            to: {
              op: "rzut",
              faces: {
                1: { op: "punkty", stat: "life", delta: 1 },
                2: { op: "punkty", stat: "life", delta: 1 },
                3: { op: "punkty", stat: "life", delta: 1 },
                4: { op: "punkty", stat: "life", delta: -1 },
                5: { op: "punkty", stat: "life", delta: -1 },
                6: { op: "punkty", stat: "life", delta: -1 },
              },
            },
            inaczej: {
              op: "wybor",
              options: [
                {
                  label: "Wezwij Siły Ciemności",
                  effect: {
                    op: "rzut",
                    faces: {
                      1: { op: "punkty", stat: "sword", delta: 1 },
                      2: { op: "punkty", stat: "magic", delta: 1 },
                      3: { op: "zaklecie", count: 1 },
                      4: { op: "ruch-dodatkowy" },
                      5: { op: "tura-stracona", turns: 1 },
                      6: { op: "punkty", stat: "life", delta: -1 },
                    },
                  },
                },
                { label: "Nie wzywaj", effect: { op: "nic" } },
              ],
            },
          },
        },
      },
    ],
  },

  /**
   * "Jeżeli jesteś Dobry możesz odzyskać punkty Życia z początku gry, lub rzuć
   * kostką: 1-3 moc wody nie działa na ciebie, 4 - zyskujesz 1 punkt Życia, 5 -
   * zyskujesz 1 Zaklęcie, 6 - zyskujesz dodatkowy ruch."
   *
   * The whole sentence hangs off "Jeżeli jesteś Dobry", so a Postać of any
   * other Natura is offered nothing at all — and it is "możesz", so even a
   * Dobra one may walk on. That is why this is an offer rather than
   * `obowiazkowe`: nothing here happens to anybody against their will.
   *
   * Read off the board scan, twice, because the Relikwiarz says a Zła Postać
   * "nie traci punktu Życia przy Studni Wieczności" and the Obszar has no such
   * clause — no Natura loses anything here, and no face of the table is a loss.
   * The card's own claim is left alone rather than a rule invented to match it.
   */
  "studnia-wiecznosci": {
    offers: [
      {
        name: "Studnia Wieczności",
        effect: {
          op: "gdy",
          warunek: { is: "natura", jedna_z: ["good"] },
          to: {
            op: "wybor",
            options: [
              // 4.7 caps a restoration at what the character started with, which
              // is exactly "punkty Życia z początku gry".
              { label: "Odzyskaj Życie z początku gry", effect: { op: "uzdrow", upTo: 4 } },
              {
                label: "Rzuć kostką",
                effect: {
                  op: "rzut",
                  faces: {
                    1: { op: "nic" },
                    2: { op: "nic" },
                    3: { op: "nic" },
                    4: { op: "punkty", stat: "life", delta: 1 },
                    5: { op: "zaklecie", count: 1 },
                    6: { op: "ruch-dodatkowy" },
                  },
                },
              },
            ],
          },
          inaczej: { op: "nic" },
        },
      },
    ],
  },

  /**
   * "MOŻESZ MODLIĆ SIĘ RZUCAJĄC 2 KOSTKAMI" — the first two-die table in the
   * box, and an offer rather than a duty: nobody has to pray.
   *
   * Two dice and eleven rows, so the middle is far likelier than the ends. The
   * 2 and the 12 are the extremes for a reason and it would be wrong to flatten
   * them onto one die.
   *
   * The Jabłko Natchnienia lets its holder shift this roll by one either way,
   * and it names both Świątynie — `modyfikator-rzutu` with `dowolnyZnak`.
   */
  "swiatynia-bogini-nemed": {
    offers: [
      {
        name: "Modlitwa",
        effect: {
          op: "rzut",
          kostki: 2,
          faces: {
            2: { op: "punkty", stat: "life", delta: 2 },
            3: { op: "punkty", stat: "life", delta: -1 },
            // "tracisz do wyboru: 1 punkt Życia lub 1 z Przyjaciół" — the
            // choice is stated on the board, so it is the holder's twice: which
            // kind, and then which Przyjaciel.
            4: {
              op: "wybor",
              options: [
                { label: "Tracisz 1 Życie", effect: { op: "punkty", stat: "life", delta: -1 } },
                {
                  label: "Tracisz Przyjaciela",
                  effect: { op: "strata", co: "przyjaciel", count: 1, wybor: "ty" },
                },
              ],
            },
            5: { op: "punkty", stat: "sword", delta: 1 },
            6: { op: "punkty", stat: "magic", delta: 1 },
            7: { op: "zaklecie", count: 1 },
            8: { op: "punkty", stat: "life", delta: 1 },
            9: {
              op: "efekt",
              label: "Opętany — nie ruszysz się stąd, póki nie wyrzucisz 1, 2 lub 3",
              modifier: { kind: "move-max", fields: 0 },
              ends: { kind: "roll", upTo: 3 },
            },
            10: {
              op: "wybor",
              options: [
                { label: "Tracisz 1 Magii", effect: { op: "punkty", stat: "magic", delta: -1 } },
                { label: "Tracisz 1 Miecza", effect: { op: "punkty", stat: "sword", delta: -1 } },
              ],
            },
            // "(jeżeli jeszcze jakieś są)" is 21.2's stock rule, and `otrzymaj`
            // leaves it to `takeCard`, which already refuses an empty pile.
            11: { op: "otrzymaj", co: "MAGICZNY MIECZ" },
            12: { op: "punkty", stat: "life", delta: -2 },
          },
        },
      },
    ],
  },

  /**
   * "MOŻESZ MODLIĆ SIĘ DO GROŹNEGO BÓSTWA." The same shape as the Nemed's and
   * the opposite temper: seven of its eleven rows take something.
   */
  "swiatynia-tolimana": {
    offers: [
      {
        name: "Modlitwa",
        effect: {
          op: "rzut",
          kostki: 2,
          faces: {
            2: { op: "punkty", stat: "life", delta: -1 },
            // "tracisz po 1 punkcie Magii i Miecza" — both, not a choice.
            3: {
              op: "po-kolei",
              steps: [
                { op: "punkty", stat: "magic", delta: -1 },
                { op: "punkty", stat: "sword", delta: -1 },
              ],
            },
            4: { op: "strata", co: "zaklecie", count: 1, wybor: "ty" },
            5: { op: "strata", co: "przyjaciel", count: 1, wybor: "ty" },
            6: { op: "zaklecie", count: 1 },
            7: {
              op: "wybor",
              options: [
                { label: "+1 Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
                { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
              ],
            },
            8: { op: "ruch-dodatkowy" },
            9: {
              op: "efekt",
              label: "Opętany — nie ruszysz się stąd, póki nie wyrzucisz 1, 2 lub 3",
              modifier: { kind: "move-max", fields: 0 },
              ends: { kind: "roll", upTo: 3 },
            },
            10: { op: "otrzymaj", co: "TARCZA TOLIMANA" },
            11: { op: "punkty", stat: "life", delta: 1 },
            12: {
              op: "po-kolei",
              steps: [
                { op: "punkty", stat: "life", delta: -1 },
                { op: "punkty", stat: "magic", delta: -1 },
                { op: "punkty", stat: "sword", delta: -1 },
              ],
            },
          },
        },
      },
    ],
  },

  /**
   * "Władca Twierdzy może wyznaczyć ci misję. Jeżeli się zdecydowałeś rzuć
   * kostką: 1 - pokonasz Wroga; 2-3 pokonasz inną Postać (po wypełnieniu misji
   * zostaniesz natychmiast przeniesiony do Twierdzy); 4-5 przyniesiesz 3 Sz. Z.
   * (odłóż je); 6 - przyniesiesz 2 Sz. Z. (odłóż je). Po wypełnieniu misji,
   * Władca ofiaruje ci Tarczę Tolimana."
   *
   * The only errand on the board, and the only rule that outlives the turn it
   * started in: every other Obszar settles where you stand, and this one sends
   * you away and waits. So the offer here does one thing — takes the mission on
   * — and `claimMission` is what finishes it, because finishing happens
   * somewhere else and possibly many turns later.
   *
   * "Możesz" and "jeżeli się zdecydowałeś", so it is an offer twice over: the
   * Władca may set one and you may decline. Nobody is given an errand for
   * walking past.
   *
   * Worth knowing what it is *for*: the Tarcza Tolimana is the key to the Zamek
   * Bestii, so this is a route to winning rather than an errand for its own
   * sake. It is not the only one — the Świątynia Tolimana hands one out on a
   * ten, and the Wyposażenie has its own — but it is the only one a player can
   * set out to do on purpose.
   */
  "twierdza-strzegaca-drog": {
    offers: [
      {
        name: "Misja",
        effect: {
          op: "rzut",
          faces: {
            1: {
              op: "efekt",
              label: "Misja: pokonaj Wroga",
              modifier: { kind: "mission", what: "foe" },
              ends: { kind: "dispelled" },
            },
            2: {
              op: "efekt",
              label: "Misja: pokonaj inną Postać",
              modifier: { kind: "mission", what: "character" },
              ends: { kind: "dispelled" },
            },
            3: {
              op: "efekt",
              label: "Misja: pokonaj inną Postać",
              modifier: { kind: "mission", what: "character" },
              ends: { kind: "dispelled" },
            },
            4: {
              op: "efekt",
              label: "Misja: przynieś 3 Sztuki Złota",
              modifier: { kind: "mission", what: "gold", count: 3 },
              ends: { kind: "dispelled" },
            },
            5: {
              op: "efekt",
              label: "Misja: przynieś 3 Sztuki Złota",
              modifier: { kind: "mission", what: "gold", count: 3 },
              ends: { kind: "dispelled" },
            },
            6: {
              op: "efekt",
              label: "Misja: przynieś 2 Sztuki Złota",
              modifier: { kind: "mission", what: "gold", count: 2 },
              ends: { kind: "dispelled" },
            },
          },
        },
      },
    ],
  },

  /**
   * "Rzuć kostką: 1 lub 2 oczka oznaczają, że tracisz 1 Życie. Rzuć także za
   * każdego z Przyjaciół: 1 lub 2 oczka Przyjaciel traci Życie."
   *
   * Two separate throws and the second is per Przyjaciel, so a character
   * walking the cliff with four friends throws five times in all. The Obszary
   * print the same rule in slightly different words — the first spells out
   * "1 lub 2 oczka" where the second writes "1-2" — and mean the same thing.
   *
   * This is what the Opiekun, the Elflin and the Barbarzyńca walk past: their
   * `bezpieczny` skips the roll, and skipping the roll skips the friends' rolls
   * with it, which is what "zawsze możesz tamtędy bezpiecznie przejść" says.
   */
  "urwisko-1": {
    obowiazkowe: true,
    offers: [{ name: "Urwisko", effect: {
          op: "po-kolei",
          steps: [
            {
              op: "rzut",
              faces: {
                1: { op: "punkty", stat: "life", delta: -1 },
                2: { op: "punkty", stat: "life", delta: -1 },
                3: { op: "nic" },
                4: { op: "nic" },
                5: { op: "nic" },
                6: { op: "nic" },
              },
            },
            { op: "rzut-za-kazdego", co: "przyjaciel", gubiPrzy: 2 },
          ],
        } }],
  },
  "urwisko-2": {
    obowiazkowe: true,
    offers: [{ name: "Urwisko", effect: {
          op: "po-kolei",
          steps: [
            {
              op: "rzut",
              faces: {
                1: { op: "punkty", stat: "life", delta: -1 },
                2: { op: "punkty", stat: "life", delta: -1 },
                3: { op: "nic" },
                4: { op: "nic" },
                5: { op: "nic" },
                6: { op: "nic" },
              },
            },
            { op: "rzut-za-kazdego", co: "przyjaciel", gubiPrzy: 2 },
          ],
        } }],
  },

  // "1 - tracisz 1 turę; 2-3 zostajesz Zamieniony w Kamień; 4-5 zyskujesz
  // dodatkowy ruch; 6 - zostałeś zignorowany."
  "wieza-przeznaczenia": {
    obowiazkowe: true,
    offers: [
      {
        name: "Wieża Przeznaczenia",
        effect: {
          op: "rzut",
          faces: {
            1: { op: "tura-stracona", turns: 1 },
            2: { op: "kamien" },
            3: { op: "kamien" },
            4: { op: "ruch-dodatkowy" },
            5: { op: "ruch-dodatkowy" },
            6: { op: "nic" },
          },
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

/**
 * Whether a card is an establishment, and so belongs in the field's offers
 * beside the ones the board prints.
 *
 * The Targowisko settles on an Obszar and sells eight Przedmioty from it; it is
 * not a different kind of shop from the Osada's Płatnerz and should not be a
 * different kind of box on screen. So a card whose script trades is folded into
 * the same list.
 *
 * Deliberately shallower than `fieldsNamedBy`, which walks the whole tree. A
 * `uzdrow` buried in a die table inside a condition — the Wezwanie Duchów's
 * "3, 4 — leczysz do 1 Życia" — is an outcome you might roll, not a healer you
 * can visit, and hoisting it into "Możesz tu odwiedzić" would offer a service
 * nobody at this Obszar can actually buy.
 */
/**
 * Whether this Karta has settled on the Obszar and is a thing you may visit.
 *
 * The other half of `trades`, and the same argument one step further. A shop
 * that arrived on a Karta is not a different kind of shop from one printed on
 * the board — that was `trades`' case, and the Targowisko its example. A
 * *healer* that arrived on a Karta is not a different kind of healer either:
 * the Cudotwórca lives on his Obszar "do końca rozgrywki" and restores two
 * punkty Życia "podczas każdych odwiedzin", which is the Osada's Medyk with a
 * different price and no board printed under him.
 *
 * Two conditions, and both matter.
 *
 * **It stays.** `zostaje` and `zostaje-z-pula` are the dispositions that make a
 * Karta furniture — a fixture of the square rather than something happening to
 * the character who turned it over. A Karta that leaves when it is read is an
 * encounter and belongs in the kolejka, not in a list of what you may go and do.
 *
 * **You may walk past it.** `optional` is the verb the card itself uses:
 * "podczas każdych odwiedzin", "która tu zawita", "jeżeli chcesz". The
 * residents that do *not* say that — the Urocza Diablica's "jeżeli do niej
 * trafisz, będziesz musiał", the Labirynt, the Spalona Ziemia — happen to you
 * on arrival, so they are the kolejka's and must not also be offered here as
 * something to choose. `owesAFrame` draws that line and this is its other side.
 */
/**
 * Whether a Karta lying here puts anything in the Obszar's "Możesz tu odwiedzić".
 *
 * The two questions asked as one, because two callers need the same answer and
 * had it in different shapes: `FieldServices` built the list and the window
 * above it decided whether to draw the box the list goes in — and that decision
 * looked only at the *square*, so an Obszar whose services had all arrived on
 * Karty drew no box at all. A Czarodziej who had settled on a Płaskowyż Mgieł
 * was visitable and invisible.
 */
export function offersFromCard(cardId: string): boolean {
  const script = scriptFor(cardId);
  if (!script) return false;
  return trades(script.effect) || residesOn(cardId);
}

export function residesOn(cardId: string): boolean {
  const script = scriptFor(cardId);
  if (!script) return false;
  const stays =
    script.disposition.kind === "zostaje" || script.disposition.kind === "zostaje-z-pula";
  return stays && script.optional === true;
}

/**
 * Whether a purse is any part of what this offer does.
 *
 * Asked so a subview can say what you have to spend only where spending is on
 * the table. „Twoje Złoto: 6" above the Czarownica's die table is a number with
 * nothing to do with the decision, and a figure that is always there is a
 * figure nobody reads by the third Obszar.
 *
 * Both directions count, because both are transactions a player checks their
 * purse over: the Płatnerz takes coins, the Lichwiarz gives them, and the
 * Magiczne Wrota's wish is a Sztuka Złota you may pick. Walked all the way
 * down, unlike `trades` — a price hidden in the fourth face of a die table is
 * still a price, and the reader has no way to know it is coming.
 */
export function touchesGold(effect: Effect): boolean {
  switch (effect.op) {
    case "kup":
    case "sprzedaj":
      return true;
    case "uzdrow":
      return (effect.cena ?? 0) > 0;
    case "zaklecie":
      return (effect.cena ?? 0) > 0;
    case "punkty":
      return effect.stat === "gold";
    case "po-kolei":
      return effect.steps.some(touchesGold);
    case "wybor":
      return effect.options.some((one) => touchesGold(one.effect));
    case "rzut":
      return Object.values(effect.faces).some(touchesGold);
    case "gdy":
      return touchesGold(effect.to) || (effect.inaczej ? touchesGold(effect.inaczej) : false);
    default:
      return false;
  }
}

/**
 * Whether somebody here deals in gold — a desk you can spend at or sell to.
 *
 * Narrower than `touchesGold` on purpose, and the two answer different
 * questions. That one asks "does a purse come into this at all", which is what
 * decides whether an open offer shows you yours; the Magiczne Wrota's wish can
 * hand you a Sztuka Złota and the number is worth seeing. This one asks "is
 * there a merchant on this square", which is what a mark on the *map* claims —
 * and a wish is not a merchant. So a price is required: `kup` and `sprzedaj`
 * are trades by definition, and healing or a Zaklęcie only where one is
 * charged, which is what separates the Osada's Medyk from the CUDOTWÓRCA who
 * asks nothing.
 *
 * A die table is not walked into, unlike `touchesGold`. The Karczma can take a
 * coin off you and the Twierdza's Misja can bring you three, but neither is a
 * counter you walk up to — they are things that happen when the die lands, and
 * a satchel on the map would send somebody to a Karczma expecting to shop.
 * (The Karczma is `obowiazkowe` and never reaches here anyway; the Misja is
 * not, and would.)
 */
export function tradesForGold(effect: Effect): boolean {
  switch (effect.op) {
    case "kup":
    case "sprzedaj":
      return true;
    case "uzdrow":
    case "zaklecie":
      return (effect.cena ?? 0) > 0;
    case "po-kolei":
      return effect.steps.some(tradesForGold);
    case "wybor":
      return effect.options.some((one) => tradesForGold(one.effect));
    case "gdy":
      return (
        tradesForGold(effect.to) || (effect.inaczej ? tradesForGold(effect.inaczej) : false)
      );
    default:
      return false;
  }
}

export function trades(effect: Effect): boolean {
  if (effect.op === "kup" || effect.op === "sprzedaj" || effect.op === "uzdrow") return true;
  if (effect.op === "po-kolei") return effect.steps.some(trades);
  if (effect.op === "wybor") return effect.options.some((option) => trades(option.effect));
  return false;
}

/**
 * Who on this Obszar offers a thing of a given kind, and what they offer.
 *
 * A shop can be printed on the board or can have walked in as a Karta and
 * stayed (16.8), and 21.1 makes no distinction between them — so both are
 * walked, and a `po-kolei` or a `wybor` is walked into.
 *
 * Takes the Karty as a plain list rather than reading them, because the two
 * callers hold them in different shapes and neither shape belongs in the
 * engine: the server merges `field_cards` with the turn's own `drawn` (see
 * `offerOn`, which is where that trap is written down), and the browser has
 * already merged the same two for the window it is drawing.
 *
 * `from` is who it was: the board's own name for the offer — „Płatnerz",
 * „Lichwiarz", „Nadworny Medyk" — or the Karta's, for a shop that walked in and
 * stayed. It comes back because a journal line saying what a purse did is
 * missing the half a table argues about, which is *where*: two vendors in this
 * box sell a Miecz at different prices, and „kupuje MIECZ za 2" does not say
 * which of them was standing there.
 */
export function offerAmong<K extends Effect["op"]>(
  fieldId: FieldId,
  lying: readonly string[],
  op: K,
): { from: string; effect: Extract<Effect, { op: K }> } | null {
  const found: { from: string; effect: Effect }[] = [];
  const walk = (from: string, effect: Effect) => {
    if (effect.op === op) found.push({ from, effect });
    if (effect.op === "po-kolei") effect.steps.forEach((step) => walk(from, step));
    if (effect.op === "wybor") effect.options.forEach((one) => walk(from, one.effect));
  };

  for (const offer of fieldScriptFor(fieldId)?.offers ?? []) walk(offer.name, offer.effect);
  for (const cardId of lying) {
    const script = scriptFor(cardId);
    if (script) walk(cardName(cardId), script.effect);
  }

  const first = found[0];
  return first ? { from: first.from, effect: first.effect as Extract<Effect, { op: K }> } : null;
}
