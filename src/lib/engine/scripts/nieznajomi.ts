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
      op: "choice",
      options: [
        {
          label: "przenosisz się na dowolny Obszar w tym Kręgu",
          effect: { op: "move", to: { kind: "anywhere-in-ring" } },
        },
        { label: "Pomiń", effect: { op: "nothing" } },
      ],
    },
    disposition: { kind: "discard" },
    examples: [
      { name: "carries you anywhere in your own Krąg", answers: [0], destination: "pustelnia", expect: { standingOn: "pustelnia" } },
      { name: "leaves whether or not you ride", answers: [1], expect: { standingOn: "wrzosowiska" } },
    ],
  },
  "dziki-rumak": {
    effect: {
      op: "choice",
      options: [
        { label: "zyskujesz dodatkowy ruch", effect: { op: "extra-move" } },
        { label: "Pomiń", effect: { op: "nothing" } },
      ],
    },
    disposition: { kind: "discard" },
    examples: [{ name: "offers an extra move", answers: [0], expect: { says: "dodatkowy ruch" } }],
  },
  // „Półbóg ofiaruje ci 1 Zaklęcie. Możesz je wybrać ze stosu."
  polbog: {
    effect: { op: "gain-spell", count: 1, fromPile: true },
    disposition: { kind: "discard" },
    examples: [{ name: "hands over one Zaklęcie", given: { magic: 4 }, expect: { spells: 1 } }],
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
    disposition: { kind: "until-first-visitor" },
    examples: [
      { name: "a point of Miecz on the first wish", answers: [0], expect: { sword: 3 } },
      { name: "a Sztuka Złota on the fifth", answers: [4], expect: { gold: 2 } },
    ],
  },
  wrozka: {
    effect: {
      op: "when",
      condition: { is: "nature", oneOf: ["good"] },
      then: WISH(),
    },
    disposition: { kind: "until-first-visitor" },
    examples: [
      { name: "grants a Dobra Postać her wish", given: { nature: "good" }, answers: [0], expect: { sword: 3 } },
      { name: "has nothing for a Zła Postać", given: { nature: "evil" }, expect: { sword: 2, says: "nic" } },
    ],
  },
  koszmar: {
    effect: {
      op: "when",
      condition: { is: "nature", oneOf: ["evil"] },
      then: WISH(),
    },
    disposition: { kind: "until-first-visitor" },
    examples: [{ name: "grants a Zła Postać its wish", given: { nature: "evil" }, answers: [1], expect: { magic: 2 } }],
  },
  "zlodziej-dobroczynca": {
    effect: {
      op: "when",
      condition: { is: "has-gold" },
      then: { op: "points", stat: "gold", delta: -1 },
      else: { op: "points", stat: "gold", delta: 1 },
    },
    disposition: { kind: "discard" },
    examples: [
      { name: "takes a coin from whoever has one", given: { gold: 1 }, expect: { gold: 0 } },
      { name: "gives a coin to whoever has none", given: { gold: 0 }, expect: { gold: 1 } },
    ],
  },
  wielkolud: {
    effect: {
      op: "roll",
      faces: {
        1: { op: "nothing" },
        2: { op: "nothing" },
        3: { op: "lose", what: "item", count: 1, chosenBy: "random" },
        4: { op: "lose", what: "item", count: 1, chosenBy: "random" },
        5: { op: "lose", what: "friend", count: 1, chosenBy: "random" },
        6: { op: "lose", what: "friend", count: 1, chosenBy: "random" },
      },
    },
    disposition: { kind: "discard" },
    examples: [
      { name: "ignores you on a low throw", given: { items: ["miecz"] }, dice: [1], expect: { items: 1 } },
      { name: "takes a Przedmiot on a 3", given: { items: ["miecz"] }, dice: [3], expect: { items: 0 } },
    ],
  },
  "urocza-diablica": {
    effect: {
      op: "roll",
      faces: {
        1: { op: "gain-spell", count: 1 },
        2: { op: "points", stat: "magic", delta: 1 },
        3: { op: "points", stat: "sword", delta: 1 },
        4: { op: "lose", what: "item", count: 1 },
        5: { op: "points", stat: "life", delta: -1 },
        6: { op: "stone" },
      },
    },
    disposition: { kind: "stays" },
    examples: [
      { name: "a point of Magia on a 2", dice: [2], expect: { magic: 2 } },
      { name: "a point of Życie on a 5", dice: [5], expect: { life: 3 } },
      { name: "stone on a 6", dice: [6], expect: { says: "Kamie" } },
    ],
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
  /**
   * The three that offer rather than happen, each asked as a question.
   *
   * `optional` said so and nothing on the sheet did: their whole effect was one
   * node, so the only control was „Rozpatrz" and a player who did not want what
   * was on offer had no way to say so. Wrapped in a `choice` they read like the
   * Jednorożec and the Kuglarz, which is what they are — „Pomiń" is one of the
   * answers, not a way out of the Karta.
   */
  /**
   * No „Pomiń" among his options, and that is the rule rather than a trim.
   *
   * Declining a Karta that stays is not one of the things the Karta offers —
   * it is 15.2's pass being walked („rozpatrzenie" of an offer is reading it
   * and saying no) and 12.1 keeping it open afterwards. It has its own door,
   * `skipCard`, which writes `declined` rather than `resolved`; as an option
   * here it wrote `resolved` and spent the Cudotwórca for the rest of the turn,
   * which is exactly what „w każdej chwili, aż do końca swojej tury" forbids.
   *
   * The JEDNOROŻEC and the KUGLARZ keep theirs, and the line between them is
   * the cards' own text: „Bez względu na to, czy skorzystasz z propozycji,
   * Jednorożec oddala się" — that Karta goes either way, so refusing it is
   * something the Karta does, not something the pass does.
   */
  cudotworca: {
    optional: true,
    effect: {
      op: "choice",
      options: [
        { label: "odzyskujesz 2 punkty Życia (najwyżej do 4)", effect: { op: "heal", upTo: 2 } },
      ],
    },
    disposition: { kind: "stays" },
    examples: [{ name: "heals two, and no higher than four", given: { life: 2 }, answers: [0], expect: { life: 4 } }],
  },
  /** "Każda Dobra Postać, która tu **zawita**, otrzyma 1 Zaklęcie." */
  czarodziej: {
    optional: true,
    effect: {
      op: "when",
      condition: { is: "nature", oneOf: ["good"] },
      then: {
        op: "choice",
        options: [{ label: "zyskujesz 1 Zaklęcie", effect: { op: "gain-spell", count: 1 } }],
      },
    },
    disposition: { kind: "stays" },
    examples: [{ name: "a Zaklęcie for a Dobra Postać", given: { nature: "good", magic: 4 }, answers: [0], expect: { spells: 1 } }],
  },
  // A standing shop rather than a one-off gift, which is why he stays.
  /**
   * "Postacie, którym pozwala na to ich Magia, mogą podczas każdej wizyty kupić
   * u niego 1 Zaklęcie za 1 Sztukę Złota."
   *
   * Not a `buy`, though it reads like one: `buy` sells Wyposażenie and a
   * Zaklęcie is not on that sheet. It comes off the pile, under 2.6's limit and
   * 9.5's reshuffle, and only the drawing knows whether either refused — which
   * is why the price rides on the draw.
   *
   * "Podczas każdej wizyty" is the disposition: he lives there to the end of
   * the game and sells again to whoever comes back.
   */
  sztukmistrz: {
    optional: true,
    effect: {
      op: "choice",
      options: [
        {
          label: "kupujesz 1 Zaklęcie za 1 Sztukę Złota",
          effect: { op: "gain-spell", count: 1, price: 1 },
        },
      ],
    },
    disposition: { kind: "stays" },
    examples: [
      { name: "takes the coin and hands over the card", given: { gold: 3, magic: 4 }, answers: [0], expect: { gold: 2, spells: 1 } },
      { name: "refuses an empty purse before touching the pile", given: { gold: 0, magic: 4 }, answers: [0], expect: { gold: 0, spells: 0, says: "Za mało złota" } },
      { name: "charges nothing when the Magia allows no Zaklęcia (2.6)", given: { gold: 3, magic: 0 }, answers: [0], expect: { gold: 3, says: "2.6" } },
    ],
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
      op: "choice",
      options: [
        {
          label: "ustawiasz bazowy Miecz na wartość bazową Magii",
          effect: { op: "swap-points", from: "sword" },
        },
        {
          label: "ustawiasz bazową Magię na wartość bazową Miecza",
          effect: { op: "swap-points", from: "magic" },
        },
        // Bare, like every other declining option in the box. The two above
        // are long because each names a trade and the trade is the decision;
        // declining is the same act on every card that offers one, and saying
        // what it does not do adds a clause to the one option nobody has to
        // read.
        { label: "Pomiń", effect: { op: "nothing" } },
      ],
    },
    disposition: { kind: "discard" },
    examples: [
      { name: "sets the base Miecz to the base Magia", given: { sword: 2, magic: 4 }, answers: [0], expect: { sword: 4 } },
      { name: "sets the base Magia to the base Miecz", given: { sword: 4, magic: 1 }, answers: [1], expect: { magic: 4 } },
      { name: "may be declined", answers: [2], expect: { sword: 2, magic: 1 } },
    ],
  },

  /**
   * "Wybierz cyfrę od 1 do 6 (musisz ją głośno powiedzieć), a następnie rzuć."
   *
   * Said aloud, because the whole card is that the table hears the guess before
   * the die lands. One in six for a Zaklęcie, and nothing at all the other five
   * times — which a six-faced table would give away by showing five blanks.
   */
  medrzec: {
    effect: { op: "guess", prize: { op: "gain-spell", count: 1 } },
    disposition: { kind: "discard" },
    examples: [
      { name: "a Zaklęcie when the die matches the guess", given: { magic: 4 }, answers: [2], dice: [2], expect: { spells: 1 } },
      { name: "nothing when it does not", given: { magic: 4 }, answers: [2], dice: [5], expect: { spells: 0 } },
    ],
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
      op: "when",
      condition: { is: "attacker" },
      then: {
        op: "choice",
        options: [
          { label: "tracisz 1 Sztukę Złota", effect: { op: "points", stat: "gold", delta: -1 } },
          {
            label: "nie ruszysz się stąd przez 1 turę",
            effect: {
              op: "status",
              label: "Osądzony — nie ruszysz się stąd przez turę",
              modifier: { kind: "move-max", fields: 0 },
              ends: { kind: "turns", turns: 1 },
            },
          },
        ],
      },
      else: { op: "nothing" },
    },
    disposition: { kind: "discard" },
  },
};
