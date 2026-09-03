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
      warunek: { is: "natura", jedna_z: ["evil"] },
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
    effect: { op: "punkty", stat: "life", delta: -1, target: "wszyscy-w-kregu" },
    disposition: { kind: "odloz" },
  },
  "burza-siedmiu-slonc": {
    effect: { op: "tura-stracona", turns: 1, target: "wszyscy" },
    disposition: { kind: "odloz" },
  },
  "zacmienie-slonc": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["good", "chaotic"] },
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
      warunek: { is: "natura", jedna_z: ["evil"] },
      to: { op: "punkty", stat: "life", delta: 1 },
      inaczej: {
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["good"] },
        to: { op: "punkty", stat: "life", delta: -1 },
      },
    },
    disposition: { kind: "odloz" },
  },
  "poslancy-bogow": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["good"] },
      to: { op: "punkty", stat: "life", delta: 1 },
      inaczej: {
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["evil"] },
        to: { op: "punkty", stat: "life", delta: -1 },
      },
    },
    disposition: { kind: "odloz" },
  },
  "sabat-czarownic": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["evil"] },
      to: { op: "punkty", stat: "magic", delta: 1 },
      inaczej: { op: "natura", na: "evil" },
    },
    disposition: { kind: "odloz" },
  },
  "slup-ognia": {
    effect: {
      op: "gdy",
      warunek: { is: "natura", jedna_z: ["good"] },
      to: { op: "punkty", stat: "magic", delta: 1 },
      inaczej: { op: "natura", na: "good" },
    },
    disposition: { kind: "odloz" },
  },
  zasadzka: {
    effect: {
      op: "po-kolei",
      steps: [
        { op: "strata", co: "gold" },
        { op: "strata", co: "wszystkie-przedmioty" },
      ],
    },
    disposition: { kind: "odloz" },
  },
  /**
   * "Z Płaskowyżu zeszła gęsta Mgła, okrywając nieprzeniknioną bielą wszystkie
   * Krainy. Przez 2 tury Postacie mogą przebywać tylko 2 Obszary (1 Obszar na
   * turę). Potem Mgła rozpływa się - odłóż jej Kartę."
   *
   * The cap the console has been able to conjure since `EFFECTS.fog` was
   * written — „Mgła", `move-max` 1 — arriving from the Karta it is named after.
   * It was `{ op: "nic" }`, so the app told the table that the storm which
   * halves everybody's walk for two turns does nothing at all, and the engine
   * had every piece of it: the modifier by name, and the Południca two entries
   * down using the identical shape for one Postać.
   *
   * „Wszystkie Krainy" is `wszyscy`, the drawer included, and every seat wears
   * it through two of their own turns — which is what „przez 2 tury (1 Obszar
   * na turę)" says, without a clock. The disposition is the same two turns
   * counted at the Karta rather than at a Postać.
   */
  mgla: {
    effect: {
      op: "efekt",
      label: "Mgła — najwyżej 1 Obszar na turę",
      modifier: { kind: "move-max", fields: 1 },
      ends: { kind: "turns", turns: 2 },
      target: "wszyscy",
    },
    disposition: { kind: "po-turach", turns: 2 },
  },
  /**
   * "Przy tym szczególnym układzie planet, na czas 1 tury podwojona zostaje
   * Magia wszystkich Demonów."
   *
   * Only the clock, and the note in `coverage.ts` says why: the doubling is a
   * number that has to live on a Karta lying on an Obszar, and `seat_effects`
   * hangs every status off a seat. It is the Wampir's wall and the Krąg
   * Płomieni's, met from the other side — a Modifier with nobody to carry it.
   *
   * The entry earns its place all the same: „na czas 1 tury" is a fact the
   * table gets wrong without a referee, and the Karta being here is what says
   * so. What it must not do is claim the rest, which is what „nic się nie
   * dzieje" was doing on the panel.
   */
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
            to: { op: "punkty", stat: "gold", delta: -1, target },
            inaczej: { op: "punkty", stat: "life", delta: -1, target },
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

  /**
   * "Od pewnego czasu towarzyszy ci Południca. Musisz ją zabrać jako
   * Przyjaciela chociaż jej obecność osłabia cię, że możesz poruszać się tylko
   * o 1 Obszar na turę. Jedynym sposobem pozbycia się Południcy jest przeprawa
   * przez Trzęsawiska lub Lodowy Las. Gdy to zrobisz, odłóż jej Kartę."
   *
   * A Przyjaciel nobody wants, and the reason `Ends` has named `crossing` since
   * the day it was written — the union's own comment calls it "what sheds
   * Południca". Nothing raised that event until now, so both halves of this
   * card existed separately and neither could reach the other.
   *
   * Not optional: "Musisz ją zabrać". And a cap of one rather than a freeze —
   * she slows the walk, she does not stop the turn.
   */
  poludnica: {
    effect: {
      op: "efekt",
      label: "Południca — najwyżej 1 Obszar na turę",
      modifier: { kind: "move-max", fields: 1 },
      ends: { kind: "event", what: "crossing" },
    },
    disposition: { kind: "bierzesz" },
  },

  /**
   * "Od pewnego czasu towarzyszy ci Zły Duch. Musisz zabrać go jako
   * Przyjaciela. Natychmiast opuszczą cię wszyscy dotychczasowi Przyjaciele (z
   * wyjątkiem Południcy). Nie możesz zdobywać nowych Przyjaciół, dopóki nie
   * uwolnisz się od niego, odwiedzając Pustelnię. Po wizycie u Pustelnika odłóż
   * Kartę."
   *
   * Three things at once, in the order the card states them: everybody leaves,
   * he moves in, and nobody new may join until the Pustelnia is visited. The
   * middle one is the disposition; the other two are the effect.
   *
   * The Południca is spared by name, which is the card telling you these two
   * are meant to be met together — she is not a Przyjaciel you gained, she is
   * one you are stuck with, and the Zły Duch has no quarrel with her.
   */
  "zly-duch": {
    effect: {
      op: "po-kolei",
      steps: [
        { op: "strata", co: "wszyscy-przyjaciele-oprocz", oprocz: ["poludnica"] },
        {
          op: "efekt",
          label: "Zły Duch — nie zdobędziesz Przyjaciół, póki nie odwiedzisz Pustelni",
          modifier: { kind: "no-friends" },
          ends: { kind: "dispelled" },
        },
      ],
    },
    disposition: { kind: "bierzesz" },
  },
};
