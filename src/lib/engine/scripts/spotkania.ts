/** Spotkania — events that resolve once and are gone. */

import type { CardScript } from "../cardScript";

/**
 * Several land on every character at the table rather than the one who drew
 * them, which is what the `target` on an effect is for.
 *
 * Absent is the normal state: a card with no entry here shows its printed text
 * and the players apply it, exactly as before.
 */
export const SPOTKANIA: Readonly<Record<string, CardScript>> = {
  "zakleta-sciezka": {
    effect: {
      op: "rzut",
      faces: {
        1: { op: "przenies", to: { kind: "pole", fieldId: "rownina-snu" } },
        2: { op: "przenies", to: { kind: "pole", fieldId: "rownina-traw" } },
        3: { op: "przenies", to: { kind: "pole", fieldId: "dolina-cienia" } },
        4: { op: "przenies", to: { kind: "pole", fieldId: "mroczna-polana" } },
        5: { op: "przenies", to: { kind: "pole", fieldId: "osada" } },
        6: { op: "przenies", to: { kind: "pole", fieldId: "karczma" } },
      },
    },
    disposition: { kind: "odloz" },
  },
  straz: {
    effect: { op: "przenies", to: { kind: "poczatek-ruchu" } },
    disposition: { kind: "odloz" },
  },
  zaraza: {
    effect: { op: "punkty", stat: "zycie", delta: -1, target: "wszyscy-w-kregu" },
    disposition: { kind: "odloz" },
  },
  "burza-siedmiu-slonc": {
    effect: { op: "tura-stracona", turns: 1, target: "wszyscy" },
    disposition: { kind: "odloz" },
  },
  "zacmienie-slonc": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra", "chaotyczna"] },
      to: { op: "tura-stracona", turns: 1, target: "wszyscy" },
    },
    disposition: { kind: "odloz" },
  },
  "magiczna-tablica": {
    effect: { op: "zaklecia-do-limitu" },
    disposition: { kind: "odloz" },
  },
  "zatrute-ziola": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["zla"] },
      to: { op: "punkty", stat: "zycie", delta: 1 },
      inaczej: {
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["dobra"] },
        to: { op: "punkty", stat: "zycie", delta: -1 },
      },
    },
    disposition: { kind: "odloz" },
  },
  "poslancy-bogow": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra"] },
      to: { op: "punkty", stat: "zycie", delta: 1 },
      inaczej: {
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["zla"] },
        to: { op: "punkty", stat: "zycie", delta: -1 },
      },
    },
    disposition: { kind: "odloz" },
  },
  "sabat-czarownic": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["zla"] },
      to: { op: "punkty", stat: "magia", delta: 1 },
      inaczej: { op: "natura", na: "zla" },
    },
    disposition: { kind: "odloz" },
  },
  "slup-ognia": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["dobra"] },
      to: { op: "punkty", stat: "magia", delta: 1 },
      inaczej: { op: "natura", na: "dobra" },
    },
    disposition: { kind: "odloz" },
  },
  zasadzka: {
    effect: {
      op: "po-kolei",
      steps: [
        { op: "strata", co: "zloto" },
        { op: "strata", co: "wszystkie-przedmioty" },
      ],
    },
    disposition: { kind: "odloz" },
  },
  mgla: {
    effect: { op: "nic" },
    disposition: { kind: "po-turach", turns: 2 },
  },
  "uklad-planet": {
    effect: { op: "nic" },
    disposition: { kind: "po-turach", turns: 1 },
  },
  // Every Zaklęcie in the game goes, in every Krąg — not just the drawer's.
  przesilenie: {
    effect: { op: "strata", co: "zaklecie", target: "wszyscy" },
    disposition: { kind: "odloz" },
  },
};
