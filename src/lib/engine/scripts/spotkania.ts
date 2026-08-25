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
  /**
   * "Nadeszła Godzina Duchów. Może je wezwać każda Zła Postać."
   *
   * Only an Evil character may call them, and calling is a choice — a one in
   * three chance of losing a turn is a real price for a spell or a point of
   * Życie. A Good or Chaotic character draws this and nothing happens, which is
   * the card working rather than the card being ignored.
   */
  "godzina-duchow": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["zla"] },
      to: {
        op: "wybor",
        options: [
          {
            label: "Wezwij duchy",
            effect: {
              op: "rzut",
              faces: {
                1: { op: "zaklecie", count: 1 },
                2: { op: "zaklecie", count: 1 },
                3: { op: "uzdrow", upTo: 1 },
                4: { op: "uzdrow", upTo: 1 },
                5: { op: "tura-stracona", turns: 1 },
                6: { op: "tura-stracona", turns: 1 },
              },
            },
          },
          { label: "Nie wzywaj", effect: { op: "nic" } },
        ],
      },
      inaczej: { op: "nic" },
    },
    disposition: { kind: "odloz" },
  },

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
  /**
   * The Beast's tax, and one of the few cards that reaches across the whole
   * board rather than at whoever drew it.
   *
   * The die does not decide what happens — it decides *who it happens to*, and
   * the six groups are three Natury and three Kręgi. "Nie posiadający złota
   * tracą 1 Życie" is not an alternative the payer chooses: it is what happens
   * to somebody with an empty purse, so it is the second step rather than a
   * `wybor`.
   */
  danina: {
    effect: {
      op: "rzut",
      faces: Object.fromEntries(
        (
          [
            [1, "dobrzy"],
            [2, "chaotyczni"],
            [3, "zli"],
            [4, "w-dolnym-kregu"],
            [5, "w-srodkowym-kregu"],
            [6, "w-gornym-kregu"],
          ] as const
        ).map(([face, target]) => [
          face,
          {
            op: "gdy",
            warunek: { is: "ma-zloto" },
            to: { op: "punkty", stat: "zloto", delta: -1, target },
            inaczej: { op: "punkty", stat: "zycie", delta: -1, target },
          },
        ]),
      ),
    },
    disposition: { kind: "odloz" },
  },

  /**
   * The flute stills the board for a turn — everyone, including the character
   * who drew it, except the five the card names. Two of those five (Czarodziejka,
   * Szczęściarz) are expansion characters and simply never match.
   */
  "zaklinacz-czasu": {
    effect: {
      op: "tura-stracona",
      turns: 1,
      target: "wszyscy",
      oprocz: ["elf", "hummit", "spryciarz", "czarodziejka", "szczesciarz"],
    },
    disposition: { kind: "po-turach", turns: 1 },
  },

  // Every Zaklęcie in the game goes, in every Krąg — not just the drawer's.
  /**
   * "Odłóż tę Kartę i **wszystkie** Karty Zaklęć, znajdujące się w posiadaniu
   * Postaci (we wszystkich Kręgach)."
   *
   * Every hand at the table, not one card from each — which is what this said
   * before, and which made the storm that ends the magic in the world cost a
   * Czarodziej one of his three.
   */
  przesilenie: {
    effect: { op: "strata", co: "wszystkie-zaklecia", target: "wszyscy" },
    disposition: { kind: "odloz" },
  },
};
