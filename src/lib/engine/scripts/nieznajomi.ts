/** Nieznajomi — the people you meet, who grant something and then leave. */

import type { CardScript } from "../cardScript";
import { WISH } from "./wish";

/**
 * Most of them wait on a field for one character and then go, which is why
 * `do-pierwszej` exists as a disposition of its own.
 *
 * Absent is the normal state: a card with no entry here shows its printed text
 * and the players apply it, exactly as before.
 */
export const NIEZNAJOMI: Readonly<Record<string, CardScript>> = {
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
      warunek: { is: "natura", jedna_z: ["good"] },
      to: WISH(),
    },
    disposition: { kind: "do-pierwszej" },
  },
  koszmar: {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["evil"] },
      to: WISH(),
    },
    disposition: { kind: "do-pierwszej" },
  },
  "zlodziej-dobroczynca": {
    effect: {
      op: "gdy",
      warunek: { is: "ma-zloto" },
      to: { op: "punkty", stat: "gold", delta: -1 },
      inaczej: { op: "punkty", stat: "gold", delta: 1 },
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
        2: { op: "punkty", stat: "magic", delta: 1 },
        3: { op: "punkty", stat: "sword", delta: 1 },
        4: { op: "strata", co: "przedmiot", count: 1 },
        5: { op: "punkty", stat: "life", delta: -1 },
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
      warunek: { is: "natura", jedna_z: ["good"] },
      to: { op: "zaklecie", count: 1 },
    },
    disposition: { kind: "zostaje" },
  },
  // A standing shop rather than a one-off gift, which is why he stays.
  /**
   * "Postacie, którym pozwala na to ich Magia, mogą podczas każdej wizyty kupić
   * u niego 1 Zaklęcie za 1 Sztukę Złota."
   *
   * Not a `kup`, though it reads like one: `kup` sells Wyposażenie and a
   * Zaklęcie is not on that sheet. It comes off the pile, under 2.6's limit and
   * 9.5's reshuffle, and only the drawing knows whether either refused — which
   * is why the price rides on the draw.
   *
   * "Podczas każdej wizyty" is the disposition: he lives there to the end of
   * the game and sells again to whoever comes back.
   */
  sztukmistrz: {
    optional: true,
    effect: { op: "zaklecie", count: 1, cena: 1 },
    disposition: { kind: "zostaje" },
  },
  // Two rolls' worth of card in one: where he settles, and what he hands the
  // first Postać to find him. Both named items are finite ("jeśli jeszcze są").
  eremita: {
    effect: {
      op: "po-kolei",
      steps: [
        {
          op: "rzut",
          faces: {
            1: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "bezdroza" } },
            2: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "uroczysko" } },
            3: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "pustelnia" } },
            4: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "wieza-przeznaczenia" } },
            5: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "rozstajne-drogi-1" } },
            6: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "ruiny-twierdzy" } },
          },
        },
        {
          op: "wybor",
          options: [
            { label: "Magiczny Miecz", effect: { op: "otrzymaj", co: "Magiczny Miecz" } },
            { label: "Tarcza Tolimana", effect: { op: "otrzymaj", co: "Tarcza Tolimana" } },
          ],
        },
      ],
    },
    disposition: { kind: "do-pierwszej" },
  },

  /**
   * "Może zamienić twoje punkty Miecza na punkty Magii lub odwrotnie."
   *
   * How many is not stated, which reads as all of them: this is the card that
   * turns a Wojownik into a Mag. Either way the two halves move together, which
   * is why it is one operation and not a gain beside a loss. Rules 1.3 and 2.3
   * still hold — neither can go below where the character started — and that is
   * what makes the trade a real decision rather than free.
   */
  kuglarz: {
    effect: { op: "zamien-punkty" },
    optional: true,
    disposition: { kind: "odloz" },
  },

  /**
   * "Wybierz cyfrę od 1 do 6 (musisz ją głośno powiedzieć), a następnie rzuć."
   *
   * Said aloud, because the whole card is that the table hears the guess before
   * the die lands. One in six for a Zaklęcie, and nothing at all the other five
   * times — which a six-faced table would give away by showing five blanks.
   */
  medrzec: {
    effect: { op: "zgadnij", nagroda: { op: "zaklecie", count: 1 } },
    disposition: { kind: "odloz" },
  },

  /**
   * "Dobre Bóstwo osądza twoje uczynki. Jeśli podczas tej rozgrywki
   * zaatakowałeś inną Postać lub użyłeś swoich zdolności na jej niekorzyść,
   * musisz złożyć w ofierze 1 Sz.Z. Jeśli nie chcesz będziesz uwięziony na tym
   * Obszarze przez 1 turę. Po osądzeniu cię, Bóstwo znika."
   *
   * The only card that asks what you did earlier in the game, which is why 13.3
   * leaves a mark and this reads it. An innocent walks on: the judgement
   * happens either way and finds nothing.
   *
   * The offering is a choice and the card says so — "jeśli nie chcesz" — so a
   * guilty Postać picks between the coin and a turn pinned here. Being held is
   * `move-max: 0` for one turn, the same shape the Świątynie's opętanie uses,
   * and it is not a lost turn: you may still do everything but leave.
   */
  "dobre-bostwo": {
    effect: {
      op: "gdy",
      warunek: { is: "attacker" },
      to: {
        op: "wybor",
        options: [
          { label: "Złóż 1 Sz. Z. w ofierze", effect: { op: "punkty", stat: "gold", delta: -1 } },
          {
            label: "Odmów — zostajesz tu na 1 turę",
            effect: {
              op: "efekt",
              label: "Osądzony — nie ruszysz się stąd przez turę",
              modifier: { kind: "move-max", fields: 0 },
              ends: { kind: "turns", turns: 1 },
            },
          },
        ],
      },
      inaczej: { op: "nic" },
    },
    disposition: { kind: "odloz" },
  },
};
