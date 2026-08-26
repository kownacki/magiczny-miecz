/** Miejsca — cards that settle onto a field and serve whoever arrives. */

import type { CardScript } from "../cardScript";

/**
 * These are the fixtures. Their disposition is the interesting half: some stay
 * for the whole game, three hold a pool of points and dry up.
 *
 * Absent is the normal state: a card with no entry here shows its printed text
 * and the players apply it, exactly as before.
 */
export const MIEJSCA: Readonly<Record<string, CardScript>> = {
  "drzewo-zycia": {
    optional: true,
    effect: { op: "punkty", stat: "life", delta: 1, target: "kazdy-kto-tu-trafi" },
    disposition: { kind: "zostaje-z-pula", stat: "life", points: 4 },
  },
  "jezioro-magiczne": {
    optional: true,
    effect: { op: "punkty", stat: "sword", delta: 1, target: "kazdy-kto-tu-trafi" },
    disposition: { kind: "zostaje-z-pula", stat: "sword", points: 4 },
  },
  "zaklete-zrodlo": {
    optional: true,
    effect: { op: "punkty", stat: "magic", delta: 1, target: "kazdy-kto-tu-trafi" },
    disposition: { kind: "zostaje-z-pula", stat: "magic", points: 4 },
  },
  labirynt: {
    effect: {
      op: "gdy",
      warunek: { is: "prog", stat: "magic", ponizej: 5 },
      to: { op: "tura-stracona", turns: 1, target: "kazdy-kto-tu-trafi" },
    },
    disposition: { kind: "zostaje" },
  },
  "spalona-ziemia": {
    effect: {
      op: "gdy",
      warunek: { is: "prog", stat: "sword", ponizej: 5 },
      to: { op: "tura-stracona", turns: 1, target: "kazdy-kto-tu-trafi" },
    },
    disposition: { kind: "zostaje" },
  },
  grota: {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "punkty", stat: "gold", delta: 3 },
        2: { op: "punkty", stat: "gold", delta: 2 },
        3: { op: "punkty", stat: "gold", delta: 1 },
        4: { op: "tura-stracona", turns: 1 },
        5: { op: "walka", nazwa: "Hadron", miecz: 3 },
        6: { op: "walka", nazwa: "Wilkołak", miecz: 10 },
      },
    },
    disposition: { kind: "zostaje" },
  },
  sidh: {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "punkty", stat: "gold", delta: 3 },
        2: { op: "punkty", stat: "gold", delta: 2 },
        3: { op: "punkty", stat: "gold", delta: 1 },
        4: { op: "walka", nazwa: "Widmo", magia: 3 },
        5: { op: "walka", nazwa: "Zjawa", magia: 5 },
        6: { op: "walka", nazwa: "Demon", magia: 10 },
      },
    },
    disposition: { kind: "zostaje" },
  },
  "tajemne-przejscie": {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "przenies", to: { kind: "pole", fieldId: "grod" } },
        2: { op: "przenies", to: { kind: "pole", fieldId: "osada" } },
        3: { op: "przenies", to: { kind: "pole", fieldId: "twierdza-strzegaca-drog" } },
        4: { op: "przenies", to: { kind: "pole", fieldId: "swiatynia-bogini-nemed" } },
        5: { op: "przenies", to: { kind: "pole", fieldId: "wymarle-miasto" } },
        6: { op: "przenies", to: { kind: "pole", fieldId: "krypta-upiorow" } },
      },
    },
    disposition: { kind: "zostaje" },
  },
  "skalne-wrota": {
    optional: true,
    effect: { op: "wyciagnij", count: 3 },
    disposition: { kind: "odloz" },
  },
  "nieznana-swiatynia": {
    optional: true,
    effect: {
      op: "rzut",
      faces: {
        1: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
        2: { op: "punkty", stat: "life", delta: 1 },
        3: { op: "zaklecie", count: 1 },
        4: { op: "punkty", stat: "gold", delta: 2 },
        5: { op: "punkty", stat: "gold", delta: 1 },
        6: { op: "nic" },
      },
    },
    disposition: { kind: "zostaje" },
  },
  targowisko: {
    optional: true,
    effect: {
      op: "kup",
      towar: [
        { co: "Miecz", cena: 1 },
        { co: "Hełm", cena: 1 },
        { co: "Kij i Sznur", cena: 1 },
        { co: "Latarnia", cena: 2 },
        { co: "Tarcza", cena: 2 },
        { co: "Rękawice", cena: 2 },
        { co: "Koń", cena: 2 },
        { co: "Łódź", cena: 3 },
      ],
    },
    disposition: { kind: "zostaje" },
  },
  // Both Kapliczki borrow their temple's table rather than reprinting it, and
  // then close for good — which is what separates them from the temple itself.
  "kapliczka-nemed": {
    optional: true,
    effect: { op: "jak-pole", fieldId: "swiatynia-bogini-nemed" },
    disposition: { kind: "odloz" },
  },
  "kapliczka-tolimana": {
    optional: true,
    effect: { op: "jak-pole", fieldId: "swiatynia-tolimana" },
    disposition: { kind: "odloz" },
  },
};
