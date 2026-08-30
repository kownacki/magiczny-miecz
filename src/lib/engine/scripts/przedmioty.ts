/** Przedmioty whose card is an event rather than a standing rule. */

import type { CardScript } from "../cardScript";

/**
 * Most Przedmiot cards are things you pick up and keep, and what they then do
 * is a standing rule — those live in `abilities.ts`, not here. This module is
 * for the ones that resolve and go: gold you simply take, a card that must be
 * shuffled back, an item consumed on use.
 */
export const PRZEDMIOTY: Readonly<Record<string, CardScript>> = {
  // "Zamień tę Kartę na N Sztuk Złota, a następnie ją odłóż." Not a Przedmiot in
  // any sense that matters — it never reaches the character's hand, so it costs
  // nothing against the four-item limit of 5.4 and there is nothing to lose on
  // the Bagna later. The card is the gold, and then it is gone.
  "1-sztuka-zlota": {
    effect: { op: "punkty", stat: "gold", delta: 1 },
    disposition: { kind: "odloz" },
    consumed: true,
  },
  "2-sztuki-zlota": {
    effect: { op: "punkty", stat: "gold", delta: 2 },
    disposition: { kind: "odloz" },
    consumed: true,
  },

  /**
   * The two cards that are a crossing rather than a thing you own.
   *
   * "Nie możesz nieść Łodzi, zaś pozostawiona na brzegu szybko gnije" — you
   * cannot carry the boat, so it never reaches the pack: it costs nothing
   * against 5.4's four, cannot be taken off you at the Bagna, and cannot be
   * hoarded until it is convenient. The Latarnia says the same of its oil,
   * "olej w jej wnętrzu szybko się wypala". Consumed on the way in, exactly as
   * a Sztuka Złota is, because in both cases the Karta *is* the thing it does.
   *
   * "W następnej turze po znalezieniu" — the window is the turn after the one
   * you found it on, which is what `turns: 1` counts: one more of the finder's
   * own turns. And "bez względu na to, czy użyłeś… odłóż tę Kartę" is why the
   * window closes on the clock rather than on the crossing. The two spells that
   * open the same door end `on: "crossing"` instead, because a spell spent is
   * spent when it works; a boat rots whether you got in it or not.
   *
   * **Where it puts you is not yet what the card says.** "Przeprawisz się do
   * Obszaru graniczącego z tym, z którego wyruszyłeś" — the *bordering* Obszar,
   * and which Obszar borders which across the water is nowhere in this repo.
   * The rings are 14, 16 and 18 fields and do not line up, so it cannot be
   * computed: nearest-by-centre leaves four Środkowy fields unreachable and
   * makes two of the Dolny ones ambiguous. Until that adjacency is read off the
   * board, `settleCrossing` lands a granted crossing at the printed exit, which
   * is right for the two spells — they name only the Kraina — and an
   * approximation here.
   */
  lodz: {
    effect: {
      op: "efekt",
      label: "Łódź",
      modifier: { kind: "przeprawa", przez: "trzesawiska" },
      ends: { kind: "turns", turns: 1 },
    },
    disposition: { kind: "odloz" },
    consumed: true,
  },
  latarnia: {
    effect: {
      op: "efekt",
      label: "Latarnia",
      modifier: { kind: "przeprawa", przez: "lodowy-las" },
      ends: { kind: "turns", turns: 1 },
    },
    disposition: { kind: "odloz" },
    consumed: true,
  },

  /**
   * Half the faces are worth having and half are not, which is the card.
   *
   * "Możesz zabrać Szkatułę i otworzyć ją w dowolnym momencie" — so it is taken
   * like any Przedmiot and counts against 5.4 until it is opened. The app does
   * not model *when*; what it models is the roll and the six outcomes, and the
   * player opens it when they like.
   */
  "tajemnicza-szkatula": {
    effect: {
      op: "rzut",
      faces: {
        1: { op: "otrzymaj", co: "Tarcza Tolimana" },
        2: { op: "zaklecie", count: 1 },
        3: { op: "punkty", stat: "gold", delta: 2 },
        4: { op: "tura-stracona", turns: 1 },
        5: { op: "punkty", stat: "life", delta: -1 },
        6: { op: "punkty", stat: "life", delta: -2 },
      },
    },
    optional: true,
    disposition: { kind: "odloz" },
  },
};
