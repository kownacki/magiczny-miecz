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
  /**
   * The three that ask before they act, and the "nie" is inside the Karta.
   *
   * „Jednorożec może natychmiast przewieźć cię do dowolnego Obszaru w tym
   * Kręgu. **Bez względu na to, czy skorzystasz z propozycji**, Jednorożec
   * oddala się - odłóż jego Kartę." The Rumak and the Kuglarz say the same in
   * their own words. That sentence is doing two things at once: it contemplates
   * refusing, and it says refusing costs the card anyway.
   *
   * So they are not `optional`. Refusing is not walking past the Karta — 16.5
   * binds every Nieznajomy and these are resolved at their place in the kolejka
   * like the rest. It is one of the two answers the instruction offers, and
   * either answer discards the card, which is exactly what `odloz` already did.
   */
  jednorozec: {
    effect: {
      op: "wybor",
      options: [
        {
          label: "Przenieś się na dowolny Obszar w tym Kręgu",
          effect: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
        },
        { label: "Pomiń", effect: { op: "nic" } },
      ],
    },
    disposition: { kind: "odloz" },
  },
  "dziki-rumak": {
    effect: {
      op: "wybor",
      options: [
        { label: "Weź dodatkowy ruch", effect: { op: "ruch-dodatkowy" } },
        { label: "Pomiń", effect: { op: "nic" } },
      ],
    },
    disposition: { kind: "odloz" },
  },
  // „Półbóg ofiaruje ci 1 Zaklęcie. Możesz je wybrać ze stosu."
  polbog: {
    effect: { op: "zaklecie", count: 1, zeStosu: true },
    disposition: { kind: "odloz" },
  },
  /**
   * Three cards word the same wish differently and mean the same six things.
   *
   * None of them is `optional`, and no Nieznajomy is: 16.5 is flat — „konieczne
   * jest wykonanie zawartej w Karcie instrukcji" — and a wish is carried out by
   * being granted. The choice the card gives is *among the six*, not between
   * taking it and not; there is nothing here anybody would refuse.
   */
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
  /**
   * "Każdej Postaci przywróci 2 punkty Życia, podczas każdych **odwiedzin**."
   *
   * `optional`, on the verb. The box draws one distinction across all thirty
   * Nieznajomi and Miejsca and draws it consistently: "kto tu **trafi**"
   * happens because you landed — the Urocza Diablica below, the Labirynt, the
   * Spalona Ziemia — and "**odwiedzin**", "**zawita**", "**wizyty**", "jeżeli
   * **chcesz**" happen because you went to them.
   *
   * This and the Czarodziej were the two residents missing the flag while the
   * Sztukmistrz, worded identically, had it. Nothing read `optional` at all
   * until the kolejka did, so being wrong cost nothing and showed nothing; it
   * costs a frame now, and a healer who heals you whether or not you asked.
   */
  cudotworca: {
    optional: true,
    effect: { op: "uzdrow", upTo: 2 },
    disposition: { kind: "zostaje" },
  },
  /** "Każda Dobra Postać, która tu **zawita**, otrzyma 1 Zaklęcie." */
  czarodziej: {
    optional: true,
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
  /**
   * „Jeśli chcesz, Kuglarz może zamienić twoje punkty Miecza na punkty Magii
   * lub odwrotnie."
   *
   * Three offers and not two. „Lub odwrotnie" is a whole second option, and the
   * card used to read „Zamień punkty · Pomiń" — which put the one decision the
   * Kuglarz actually asks for, *which way round*, behind a label that did not
   * mention it. A player weighing this is choosing between two quite different
   * characters, and the panel was showing them one.
   *
   * The labels name both sides in the card's own order rather than saying
   * „Miecz" and „Magia" alone: what is being chosen is a trade, and half a
   * trade named on a button is the half you are giving up or the half you are
   * getting depending on how you read it.
   */
  kuglarz: {
    effect: {
      op: "wybor",
      options: [
        {
          label: "Zamień punkty Miecza na punkty Magii",
          effect: { op: "zamien-punkty", z: "sword" },
        },
        {
          label: "Zamień punkty Magii na punkty Miecza",
          effect: { op: "zamien-punkty", z: "magic" },
        },
        // Bare, like every other declining option in the box. The two above
        // are long because each names a trade and the trade is the decision;
        // declining is the same act on every card that offers one, and saying
        // what it does not do adds a clause to the one option nobody has to
        // read.
        { label: "Pomiń", effect: { op: "nic" } },
      ],
    },
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
