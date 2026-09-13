/** Miejsca — cards that settle onto a field and serve whoever arrives. */

import type { CardScript } from "../cardScript";

/**
 * These are the fixtures. Their disposition is the interesting half: some stay
 * for the whole game, three hold a pool of points and dry up.
 *
 * Absent is the normal state: a card with no entry here shows its printed text
 * and the players apply it, exactly as before.
 *
 * # `zostaje` is the printed rule, and the printed rule silts the board up
 *
 * A Miejsce with `disposition: { kind: "stays" }` never leaves its Obszar, and
 * 13.4 counts every Karta lying on an Obszar against what that Obszar draws. So
 * a Krąg the table walks round for an hour fills with Miejsca and stops dealing
 * anything — not by anyone's doing, just by the deck running.
 *
 * That is the box's rule and it stays. It is also the one thing the Polish
 * community wrote a house rule for, on magiaimiecz.eu's *Magiczny Miecz —
 * Modyfikacje Zasad*:
 *
 * > „Standardowe zasady mówią, że kiedy na badanym obszarze wylosuje się kartę
 * > Miejsca, to pozostaje tam ona do końca gry. Moje doświadczenie jednak mówi,
 * > że tego typu zapis jest kompletnie niepraktyczny, ponieważ gracze często
 * > chodzą długo po jednym kręgu, który szybko zapełnia się Miejscami i blokuje
 * > możliwość losowania dalszych kart zdarzeń."
 *
 * Their fix is a d6 rolled when the Miejsce appears: 1 it goes at once, 2-3
 * after one visit, 4-5 after a tracked number of visits, 6 permanent. **Worth
 * building as a variant** — and cheap, because `disposition` already carries
 * „po N turach" alongside „zostaje", so it is a data change over the seven
 * `zostaje` Miejsca plus a roll, not an engine one. Not taken now because the
 * box is what this plays by default; see the same shape as `eq_mode` and
 * `trophy_mode`, both of which default away from the book only where a table
 * asked them to.
 */
export const MIEJSCA: Readonly<Record<string, CardScript>> = {
  "drzewo-zycia": {
    optional: true,
    effect: { op: "points", stat: "life", delta: 1, target: "whoever-lands-here" },
    disposition: { kind: "stays-with-pool", stat: "life", points: 4 },
  },
  "jezioro-magiczne": {
    optional: true,
    effect: { op: "points", stat: "sword", delta: 1, target: "whoever-lands-here" },
    disposition: { kind: "stays-with-pool", stat: "sword", points: 4 },
  },
  "zaklete-zrodlo": {
    optional: true,
    effect: { op: "points", stat: "magic", delta: 1, target: "whoever-lands-here" },
    disposition: { kind: "stays-with-pool", stat: "magic", points: 4 },
  },
  labirynt: {
    effect: {
      op: "when",
      condition: { is: "threshold", stat: "magic", below: 5 },
      then: { op: "lose-turn", turns: 1, target: "whoever-lands-here" },
    },
    disposition: { kind: "stays" },
  },
  "spalona-ziemia": {
    effect: {
      op: "when",
      condition: { is: "threshold", stat: "sword", below: 5 },
      then: { op: "lose-turn", turns: 1, target: "whoever-lands-here" },
    },
    disposition: { kind: "stays" },
  },
  grota: {
    optional: true,
    effect: {
      op: "roll",
      faces: {
        1: { op: "points", stat: "gold", delta: 3 },
        2: { op: "points", stat: "gold", delta: 2 },
        3: { op: "points", stat: "gold", delta: 1 },
        4: { op: "lose-turn", turns: 1 },
        5: { op: "fight", name: "Hadron", sword: 3 },
        6: { op: "fight", name: "Wilkołak", sword: 10 },
      },
    },
    disposition: { kind: "stays" },
  },
  sidh: {
    optional: true,
    effect: {
      op: "roll",
      faces: {
        1: { op: "points", stat: "gold", delta: 3 },
        2: { op: "points", stat: "gold", delta: 2 },
        3: { op: "points", stat: "gold", delta: 1 },
        4: { op: "fight", name: "Widmo", magic: 3 },
        5: { op: "fight", name: "Zjawa", magic: 5 },
        6: { op: "fight", name: "Demon", magic: 10 },
      },
    },
    disposition: { kind: "stays" },
  },
  "tajemne-przejscie": {
    optional: true,
    effect: {
      op: "roll",
      faces: {
        1: { op: "move", to: { kind: "field", fieldId: "grod" } },
        2: { op: "move", to: { kind: "field", fieldId: "osada" } },
        3: { op: "move", to: { kind: "field", fieldId: "twierdza-strzegaca-drog" } },
        4: { op: "move", to: { kind: "field", fieldId: "swiatynia-bogini-nemed" } },
        5: { op: "move", to: { kind: "field", fieldId: "wymarle-miasto" } },
        6: { op: "move", to: { kind: "field", fieldId: "krypta-upiorow" } },
      },
    },
    disposition: { kind: "stays" },
  },
  "skalne-wrota": {
    optional: true,
    effect: { op: "draw-cards", count: 3 },
    disposition: { kind: "discard" },
  },
  "nieznana-swiatynia": {
    optional: true,
    effect: {
      op: "roll",
      faces: {
        1: { op: "move", to: { kind: "anywhere-in-ring" } },
        2: { op: "points", stat: "life", delta: 1 },
        3: { op: "gain-spell", count: 1 },
        4: { op: "points", stat: "gold", delta: 2 },
        5: { op: "points", stat: "gold", delta: 1 },
        6: { op: "nothing" },
      },
    },
    disposition: { kind: "stays" },
  },
  targowisko: {
    optional: true,
    effect: {
      op: "buy",
      goods: [
        { name: "Miecz", price: 1 },
        { name: "Hełm", price: 1 },
        { name: "Kij i Sznur", price: 1 },
        { name: "Latarnia", price: 2 },
        { name: "Tarcza", price: 2 },
        { name: "Rękawice", price: 2 },
        { name: "Koń", price: 2 },
        { name: "Łódź", price: 3 },
      ],
    },
    disposition: { kind: "stays" },
  },
  // Both Kapliczki borrow their temple's table rather than reprinting it, and
  // then close for good — which is what separates them from the temple itself.
  "kapliczka-nemed": {
    optional: true,
    effect: { op: "as-field", fieldId: "swiatynia-bogini-nemed" },
    disposition: { kind: "discard" },
  },
  "kapliczka-tolimana": {
    optional: true,
    effect: { op: "as-field", fieldId: "swiatynia-tolimana" },
    disposition: { kind: "discard" },
  },
};
