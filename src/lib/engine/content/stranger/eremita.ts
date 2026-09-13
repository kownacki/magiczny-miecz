/** EREMITA — Nieznajomy: rolls for his Obszar when drawn, and hands the first visitor a Magiczny Miecz or a Tarcza Tolimana. */

import type { Karta } from "../../karta";

/**
 * Two sentences to two different people, which is why they are two fields.
 *
 * „Rzuć kostką i umieść Kartę Eremity na odpowiednim Obszarze: 1. Bezdroża…"
 * is said to whoever turned him over, and 15.1 then puts him beyond their
 * reach for the rest of that turn. „Pierwszej Postaci, Eremita ofiaruje do
 * wyboru: Magiczny Miecz lub Tarczę Tolimana (jeśli jeszcze są)" is said
 * where he settles, to whoever ends a move there first — see `onDraw`.
 *
 * They were one `sequence` for a while, and it was wrong twice over: the
 * player who drew him rolled for his Obszar and was handed the Magiczny
 * Miecz in the same breath, and the visitor who found him rolled for his
 * Obszar all over again and moved him on.
 *
 * Both named items are finite („jeśli jeszcze są"), which is why `receive`
 * names them rather than a generic „+1 Przedmiot".
 */
export default {
  id: "eremita",
  kind: "stranger",
  set: "base",
  onDraw: {
    op: "roll",
    faces: {
      1: { op: "place-card", where: { kind: "field", fieldId: "bezdroza" } },
      2: { op: "place-card", where: { kind: "field", fieldId: "uroczysko" } },
      3: { op: "place-card", where: { kind: "field", fieldId: "pustelnia" } },
      4: { op: "place-card", where: { kind: "field", fieldId: "wieza-przeznaczenia" } },
      5: { op: "place-card", where: { kind: "field", fieldId: "rozstajne-drogi-1" } },
      6: { op: "place-card", where: { kind: "field", fieldId: "ruiny-twierdzy" } },
    },
  },
  resolved: {
    op: "choice",
    options: [
      { label: "otrzymujesz Magiczny Miecz", effect: { op: "receive", what: "Magiczny Miecz" } },
      { label: "otrzymujesz Tarczę Tolimana", effect: { op: "receive", what: "Tarcza Tolimana" } },
    ],
  },
  disposition: { kind: "until-first-visitor" },
  examples: [
    { name: "rolls for his Obszar when turned over", dice: [3], expect: { lyingOn: "pustelnia" } },
    { name: "offers the first visitor a Magiczny Miecz", lying: true, answers: [0], expect: { items: 1 } },
  ],
} satisfies Karta;
