/** Wrogowie — the creatures you fight, and what their cards do beyond the fight. */

import type { CardScript } from "../cardScript";

/**
 * "Pozostanie tu, aż ktoś go pokona" — the fight is the whole card, and it
 * stays until someone wins it.
 *
 * A function rather than a shared constant, following WISH: each card owns its
 * own object tree, so an edit meant for one cannot silently change eighteen.
 */
function STRAZUJE(): CardScript {
  return {
    effect: { op: "nic" },
    disposition: { kind: "zostaje" },
  };
}

/**
 * A Wróg's numbers live on the card itself (its printed Miecz or Magia) and are
 * read by `combatValueOf`, so nothing here repeats them. What belongs here is
 * everything else the card says: what beating it gives you, what losing costs
 * beyond the usual point of Życie, and above all where the card goes — most of
 * these say "pozostanie tu, aż ktoś go pokona", which is a fixture, not a
 * discard.
 */
export const WROGOWIE: Readonly<Record<string, CardScript>> = {
  /**
   * "Rzuć kostką: 1,2 lub 3 oznacza, że nie dałeś się zwieść i w porę umknąłeś
   * potworowi. Inny wynik: musisz rozpocząć walkę."
   *
   * A Wróg you might walk past. Half the time the card does nothing at all,
   * which makes it the only creature in the deck whose danger is decided before
   * the fight rather than in it. Its Miecz of 3 is printed on the card and read
   * from there, so the fight step names it and nothing else.
   */
  wedrowiec: {
    effect: {
      op: "rzut",
      faces: {
        1: { op: "nic" },
        2: { op: "nic" },
        3: { op: "nic" },
        4: { op: "walka", nazwa: "Wędrowiec", miecz: 3 },
        5: { op: "walka", nazwa: "Wędrowiec", miecz: 3 },
        6: { op: "walka", nazwa: "Wędrowiec", miecz: 3 },
      },
    },
    // "Potwór pozostanie tu, aż ktoś go pokona" — including when you slipped
    // past it, which is what makes slipping past worth doing.
    disposition: { kind: "zostaje" },
  },

  // Both of these are fixtures like the rest — "pozostanie tu, aż ktoś go
  // pokona" — with one clause each that the fight machinery cannot carry, so
  // the card keeps the clause as a note and the app keeps the fixture.
  "przybysz-z-krainy-cieni": STRAZUJE(),
  "trogglowy-smok": STRAZUJE(),
  cyklop: STRAZUJE(),
  // "Posiada zawsze tyle punktów Miecza, ile jego przeciwnik" is
  // `MIRRORS_ITS_OPPONENT` in `cards.ts`, read by `combatValueOf` — this card
  // only has to say what STRAZUJE() says of every other fixture.
  sobowtor: STRAZUJE(),
  "czarna-hybryda": STRAZUJE(),
  "czerwona-hybryda": STRAZUJE(),
  fomoraig: STRAZUJE(),
  hadron: STRAZUJE(),
  los: STRAZUJE(),
  niedzwiedz: STRAZUJE(),
  nobbin: STRAZUJE(),
  smok: STRAZUJE(),
  // "Będzie napadał na Postacie, aż któraś z nich go pokona" — same fixture,
  // different wording.
  "sniezne-monstrum": STRAZUJE(),
  wilk: STRAZUJE(),
  wilkolak: STRAZUJE(),
  // Beating him is not the only thing that matters: every Postać he beats pays
  // a Sztuka Złota or a Przedmiot on top of the usual point of Życie.
  zloczynca: {
    // Turning him over does nothing; he is a Wróg and the card is the fight.
    effect: { op: "nic" },
    /**
     * "Każdej pokonanej Postaci, Złoczyńca zabiera do wyboru: 1 Sztukę Złota
     * lub jeden Przedmiot (należy odłożyć żeton lub Kartę Przedmiotu)."
     *
     * This used to be the card's `effect`, which put it on the drawn-card
     * sheet as a free-standing choice: "Walcz (Miecz 3)" and "Oddaj 1 Sztukę
     * Złota" side by side, offered to a player who had not fought him and
     * declinable by one who had lost. It is neither — it is what a loss costs,
     * and now it says so.
     *
     * "Do wyboru" is the loser's, which is also how 5.6 reads every other
     * loss: which Przedmiot goes is theirs to pick.
     */
    przegrana: {
      op: "wybor",
      options: [
        { label: "Oddaj 1 Sztukę Złota", effect: { op: "punkty", stat: "gold", delta: -1 } },
        {
          label: "Oddaj jeden Przedmiot",
          effect: { op: "strata", co: "przedmiot", count: 1, wybor: "ty" },
        },
      ],
    },
    disposition: { kind: "zostaje" },
  },
  "duch-ciemnosci": STRAZUJE(),
  "duch-zaglady": STRAZUJE(),
  "ksiaze-demonow": STRAZUJE(),
  demon: STRAZUJE(),
  widmo: STRAZUJE(),
  zjawa: STRAZUJE(),
  /**
   * The card is rolled onto one of six fields and haunts it — the drawer stays
   * exactly where they are.
   *
   * All of him is `placed`, and his `effect` is nothing at all: what happens to
   * whoever finds him on the Obszar he chose is a fight, and a fight is his
   * *class*'s business (16.2) rather than his text's. Written out rather than
   * left off, because a Karta with no `effect` would be a second shape for
   * every reader of a script to know about, and „nic" is the honest answer to
   * "what does this card do to the Postać standing in front of it".
   */
  upior: {
    placed: {
      op: "rzut",
      faces: {
        1: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "osada" } },
        2: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "grod" } },
        3: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "dolina-cienia" } },
        4: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "mroczna-polana" } },
        5: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "krypta-upiorow" } },
        6: { op: "poloz-karte", gdzie: { kind: "pole", fieldId: "wymarle-miasto" } },
      },
    },
    effect: { op: "nic" },
    disposition: { kind: "zostaje" },
  },
  // Whichever of the three is free. Both printed copies of each are listed
  // because the card names the places, not one of their two halves.
  lewiatan: {
    placed: {
      op: "poloz-karte",
      gdzie: {
        kind: "jedno-z",
        fieldIds: [
          "mokradla-1",
          "mokradla-2",
          "przeprawa-1",
          "przeprawa-2",
          "bagna-1",
          "bagna-2",
        ],
      },
    },
    // Nothing, for the reason the Upiór's says nothing: whoever finds him in
    // the water fights him, and that is 16.2's, not the card's.
    effect: { op: "nic" },
    disposition: { kind: "zostaje" },
  },
};
