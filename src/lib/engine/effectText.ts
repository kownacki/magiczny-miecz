/** Every card effect, said in words, so the picture of the card is never the only place a rule lives. */

import { FIELDS, type FieldId } from "./board";
import type { Condition, Destination, Effect, Target } from "./cardScript";

const STAT = {
  miecz: "Miecza",
  magia: "Magii",
  zycie: "Życia",
  zloto: "Złota",
} as const;

const WHO: Record<Target, string> = {
  ty: "ty",
  wszyscy: "wszyscy",
  "wszyscy-w-kregu": "wszyscy w tym Kręgu",
  "kazdy-kto-tu-trafi": "każdy, kto tu trafi",
  dobrzy: "Dobre Postacie",
  chaotyczni: "Chaotyczne Postacie",
  zli: "Złe Postacie",
  "w-dolnym-kregu": "wędrujący Dolnym Kręgiem",
  "w-srodkowym-kregu": "wędrujący Środkowym Kręgiem",
  "w-gornym-kregu": "wędrujący Górnym Kręgiem",
  "inna-postac": "wybrana Postać",
};

const LOST = {
  przedmiot: "Przedmiot",
  przyjaciel: "Przyjaciela",
  zaklecie: "Zaklęcie",
  zloto: "całe złoto",
  "wszystkie-przedmioty": "wszystkie Przedmioty",
} as const;

function fieldName(fieldId: FieldId): string {
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/** Anyone but you is worth naming; "ty" is the default and saying it is noise. */
function forWhom(target: Target | undefined): string {
  return !target || target === "ty" ? "" : ` — ${WHO[target]}`;
}

function where(destination: Destination): string {
  switch (destination.kind) {
    case "pole":
      return fieldName(destination.fieldId);
    case "dowolne-w-kregu":
      return "dowolny Obszar w Kręgu";
    case "poczatek-ruchu":
      return "tam, gdzie zaczynasz ruch";
    case "jedno-z":
      return destination.fieldIds.map(fieldName).join(" lub ");
  }
}

function ifWhen(condition: Condition): string {
  switch (condition.is) {
    case "natura":
      return `jeśli ${condition.jedna_z.map((n) => (n === "zla" ? "zła" : n)).join(" lub ")}`;
    case "prog":
      return `jeśli ${condition.stat === "miecz" ? "Miecz" : "Magia"} < ${condition.ponizej}`;
    case "ma-zloto":
      return "jeśli masz złoto";
  }
}

/** Polish counts three ways, and cards deal in small numbers. */
function count(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = n % 10;
  const tens = n % 100;
  return last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? few : many;
}

/**
 * Groups a die table by outcome, so six faces read as the two or three things
 * that actually happen.
 *
 * "1, 2, 3 — przemykasz; 4 — Upiór (Magia 4)" is the card. Six separate lines
 * for six faces is the same information arranged so nobody reads it.
 */
function dieTable(faces: Record<number, Effect>): string {
  const order: { said: string; on: number[] }[] = [];
  for (const face of Object.keys(faces).map(Number).sort((a, b) => a - b)) {
    const said = describeEffect(faces[face]);
    const existing = order.find((entry) => entry.said === said);
    if (existing) existing.on.push(face);
    else order.push({ said, on: [face] });
  }
  return order.map((entry) => `${runs(entry.on)} — ${entry.said}`).join("; ");
}

/** "1, 2, 3" becomes "1-3"; scattered faces stay listed. */
function runs(faces: number[]): string {
  const parts: string[] = [];
  let start = faces[0];
  let last = faces[0];
  for (const face of faces.slice(1)) {
    if (face === last + 1) {
      last = face;
      continue;
    }
    parts.push(start === last ? `${start}` : `${start}-${last}`);
    start = face;
    last = face;
  }
  parts.push(start === last ? `${start}` : `${start}-${last}`);
  return parts.join(", ");
}

/**
 * One effect, in words.
 *
 * The point of it is that the scan stops being load-bearing. A card's picture is
 * the nicest way to read it and it will not always be there — a fresh checkout
 * has no scans at all — so every rule the app carries has to be sayable without
 * one. Recursive, because half the vocabulary is built out of other effects.
 *
 * Second person present throughout, and gender-neutral, for the same reason the
 * journal is: a player's name carries no gender and Polish past tense does.
 */
export function describeEffect(effect: Effect): string {
  switch (effect.op) {
    case "nic":
      return "nic się nie dzieje";

    case "po-kolei":
      return effect.steps.map(describeEffect).join("; ");

    case "wybor":
      return `wybierasz — ${effect.options
        .map((option) => `${option.label}: ${describeEffect(option.effect)}`)
        .join(" / ")}`;

    case "rzut":
      return `rzut kostką: ${dieTable(effect.faces)}`;

    case "gdy":
      return (
        `${ifWhen(effect.warunek)}: ${describeEffect(effect.to)}` +
        (effect.inaczej ? `; w przeciwnym razie: ${describeEffect(effect.inaczej)}` : "")
      );

    case "punkty": {
      const many = Math.abs(effect.delta);
      return `${effect.delta > 0 ? "+" : "−"}${many} ${STAT[effect.stat]}${forWhom(effect.target)}`;
    }

    case "uzdrow":
      return (
        `leczysz do ${effect.upTo} ${count(effect.upTo, "Życia", "Życia", "Żyć")} (4.7)` +
        (effect.cena ? ` za ${effect.cena} Sz. Z.` : "")
      );

    case "sprzedaj":
      return `sprzedajesz Przedmiot za ${effect.cena} Sz. Z.`;

    case "tura-stracona": {
      const turns = `${effect.turns} ${count(effect.turns, "turę", "tury", "tur")}`;
      const spared = effect.oprocz?.length ? ` (oprócz: ${effect.oprocz.join(", ")})` : "";
      return `tracisz ${turns}${forWhom(effect.target)}${spared}`;
    }

    case "ruch-dodatkowy":
      return "dodatkowy ruch";

    case "zaklecie":
      return `bierzesz ${effect.count} ${count(effect.count, "Zaklęcie", "Zaklęcia", "Zaklęć")}`;

    case "zaklecia-do-limitu":
      return "dobierasz Zaklęcia do swojego limitu (2.6)";

    case "przenies":
      return `przenosisz się: ${where(effect.to)}`;

    case "wyciagnij":
      return `ciągniesz ${effect.count} ${count(effect.count, "Kartę", "Karty", "Kart")}`;

    case "walka": {
      const strength =
        effect.miecz !== undefined
          ? `Miecz ${effect.miecz}`
          : effect.magia !== undefined
            ? `Magia ${effect.magia}`
            : "";
      return `walka: ${effect.nazwa}${strength ? ` (${strength})` : ""}`;
    }

    case "strata": {
      const how = effect.wybor === "losowo" ? " (losowo)" : "";
      const many = effect.count && effect.count > 1 ? `${effect.count} ` : "";
      return `tracisz ${many}${LOST[effect.co]}${how}${forWhom(effect.target)}`;
    }

    case "kamien":
      return "zamiana w Kamień na 3 tury (20.1)";

    case "zamien-punkty":
      return "zamieniasz punkty Miecza i Magii";

    case "zgadnij":
      return `zgadujesz — jeśli trafisz: ${describeEffect(effect.nagroda)}`;

    case "natura":
      return `Natura: ${effect.na === "zla" ? "zła" : effect.na}`;

    case "kup":
      return `kupujesz — ${effect.towar
        .map((item) => `${item.co} za ${item.cena} Sz. Z.`)
        .join(", ")}`;

    case "jak-pole":
      return `dzieje się to, co na Obszarze: ${fieldName(effect.fieldId)}`;

    case "poloz-karte":
      return `kładziesz Kartę: ${where(effect.gdzie)}`;

    case "otrzymaj":
      return `otrzymujesz: ${effect.co}`;
  }
}
