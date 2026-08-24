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
  // A standing shop rather than a one-off gift, which is why he stays.
  sztukmistrz: {
    optional: true,
    effect: { op: "kup", towar: [{ co: "Zaklęcie", cena: 1 }] },
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
};
