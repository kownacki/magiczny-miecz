/** What a card does, said in one line each, and when it does it. */

import type { Nature } from "@/data/types";
import { FIELDS, type FieldId } from "./board";
import { ABILITIES, CARD_NOTES, type Ability } from "./abilities";
import { describeDisposition, scriptFor } from "./cardScript";
import { describeEffect } from "./effectText";
import { abilitiesOfCharacter, asCharacterId } from "./characters";
import { slotsFor, SLOT_LABEL, isWearable, type EqMode, type Slot } from "./slots";

function fieldName(fieldId: FieldId): string {
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

function fieldNames(fieldIds: readonly FieldId[]): string {
  // Board order, so a pair of numbered fields reads the way you walk them. The
  // ability data lists ids in whatever order the card's prose does, which put
  // the Hobgoblin's escape at "Step II, Step I".
  const order = [...FIELDS.keys()];
  const sorted = [...new Set(fieldIds)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...new Set(sorted.map(fieldName))].join(", ");
}

/**
 * When an ability is actually doing anything.
 *
 * Derived, never stored. Four of the kinds only ever matter while a fight is
 * being resolved, and that is a property of the rule rather than of the card —
 * so putting a `when` on every entry would be writing down the same fact forty
 * times and inviting it to drift. Whether an item must be worn is likewise a
 * question with an existing answer: `slotsFor` knows if it has a place, and the
 * variant decides whether being in that place is required.
 */
export type AbilityWhen =
  | "w plecaku"
  | "gdy założony"
  | "w walce"
  | "w walce, gdy założony"
  | "warunek";

/** Kinds that only ever apply while a fight is being resolved. */
const ONLY_IN_A_FIGHT = new Set<Ability["kind"]>([
  "oslona",
  "magia-do-miecza",
  "walczy-za-ciebie",
  "ginie-zamiast-ciebie",
]);

export function whenApplies(ability: Ability, cardId: string, eqMode: EqMode): AbilityWhen {
  // A requirement is not something that happens at a moment; it is true or the
  // card is not yours at all.
  if (ability.kind === "tylko-natura") return "warunek";

  /**
   * Two separate questions, and "zawsze" answered neither.
   *
   * Where it has to be, and when it does anything, are independent: a Tarcza
   * must be worn AND only matters in a fight, while a Koń must be worn and
   * helps all the time. Saying "zawsze" for the second told a player nothing
   * about the first — which is the half they act on when deciding what to put
   * on before stepping onto the Most.
   *
   * In klasyczny there is nowhere to put anything, so everything works from the
   * pack: 5.4 has one kind of possession, and a Miecz in the pack is a Miecz.
   */
  const mustBeWorn = eqMode === "slotowy" && isWearable(cardId);
  const onlyFighting = ONLY_IN_A_FIGHT.has(ability.kind);

  if (onlyFighting) return mustBeWorn ? "w walce, gdy założony" : "w walce";
  return mustBeWorn ? "gdy założony" : "w plecaku";
}

/** One formalised line: what it gives, and when it gives it. */
export interface AbilityFact {
  kind: Ability["kind"];
  what: string;
  when: AbilityWhen;
}

/** Everything the app carries about one card, ready to be shown. */
export interface ItemProfile {
  /** Where it may be worn. Empty when it is only ever carried. */
  slots: readonly Slot[];
  slotLabel: string | null;
  /** What it gives. */
  facts: AbilityFact[];
  /**
   * What using it does, once, as opposed to what holding it gives.
   *
   * A Przedmiot with a script is not a standing bonus — it is a thing that
   * happens and is then over, and the two belong in different sentences.
   */
  special: string[];
  /**
   * Rules the app states but does not enforce.
   *
   * Kept apart from the rest because the difference matters at a table: these
   * are the ones somebody has to remember.
   */
  notes: readonly string[];
  /**
   * What it asks of you before it gives anything.
   *
   * Kept apart from the bonuses because they answer different questions — one
   * is "what do I get", the other "may I even pick this up" — and a player
   * scanning a card for the second should not have to read past the first.
   */
  requirements: AbilityFact[];
}

/** Kinds that state a condition on holding the card at all, rather than a benefit. */
const IS_A_REQUIREMENT = new Set<Ability["kind"]>(["tylko-natura"]);

export function itemProfile(cardId: string, eqMode: EqMode = "klasyczny"): ItemProfile {
  const abilities = ABILITIES[cardId as keyof typeof ABILITIES] ?? [];
  const slots = slotsFor(cardId);
  const lines = abilities.map((ability) => ({
    ability,
    fact: {
      kind: ability.kind,
      what: describeAbility(ability),
      when: whenApplies(ability, cardId, eqMode),
    },
  }));
  return {
    slots,
    slotLabel: slots.length > 0 ? slots.map((slot) => SLOT_LABEL[slot]).join(" / ") : null,
    facts: lines.filter((l) => !IS_A_REQUIREMENT.has(l.ability.kind)).map((l) => l.fact),
    requirements: lines.filter((l) => IS_A_REQUIREMENT.has(l.ability.kind)).map((l) => l.fact),
    special: specialOf(cardId),
    notes: CARD_NOTES[cardId as keyof typeof CARD_NOTES] ?? [],
  };
}

/**
 * What using the card does, said briefly.
 *
 * Deliberately partial. The turn panel already describes every effect in full,
 * because it has to — it is asking the player to act on one. This is a summary
 * beside a picture of the card, so anything it cannot say in a phrase it does
 * not say at all: the prose is right there, and a half-rendered rule reads as
 * the app claiming to know more than it does.
 */
function specialOf(cardId: string): string[] {
  const script = scriptFor(cardId);
  if (!script) return [];
  const lines = [describeEffect(script.effect)];
  // Only worth saying when the card does not simply stay with you.
  if (script.disposition.kind !== "zostaje") lines.push(describeDisposition(script.disposition));
  return lines;
}

/**
 * Which Natures may not hold this card (5.3), or nothing when anyone may.
 *
 * The one place that question is answered, so the rule and the hover cannot
 * disagree about it.
 */
export function forbiddenNatures(cardId: string): readonly Nature[] | undefined {
  const abilities = ABILITIES[cardId as keyof typeof ABILITIES] ?? [];
  const only = abilities.find((ability) => ability.kind === "tylko-natura");
  if (!only || only.kind !== "tylko-natura") return undefined;
  return (["dobra", "zla", "chaotyczna"] as const).filter(
    (nature) => !only.natury.includes(nature),
  );
}

/**
 * The same profile for a Postać.
 *
 * Characters keep their powers in their own registry, and their ids live in
 * their own space — two of them, `demon` and `czarodziej`, are also the ids of
 * event cards. Asking the card registry about a character therefore does not
 * merely come back empty: for those two it comes back with somebody else's
 * rules. Which is why this is a separate door rather than a fallback.
 */
export function characterProfile(characterId: string): ItemProfile {
  const known = asCharacterId(characterId);
  const abilities = known ? abilitiesOfCharacter(known) : [];
  return {
    slots: [],
    slotLabel: null,
    requirements: [],
    special: [],
    notes: [],
    facts: abilities.map((ability) => ({
      kind: ability.kind,
      what: describeAbility(ability),
      // A character wears nothing and carries nothing: klasyczny keeps this to
      // the plain answer, and only the combat-only rules narrow it.
      when: whenApplies(ability, characterId, "klasyczny"),
    })),
  };
}

/**
 * One ability, in the language the cards use.
 *
 * Lives in the engine rather than beside a component because three different
 * places want to say the same thing about the same rule, and saying it three
 * ways is how a description stops matching what the code does.
 */
export function describeAbility(ability: Ability): string {
  switch (ability.kind) {
    case "punkty": {
      const parts = [];
      if (ability.miecz) parts.push(`+${ability.miecz} Miecza`);
      if (ability.magia) parts.push(`+${ability.magia} Magii`);
      return parts.join(", ");
    }
    case "oslona":
      return `osłona przy przegranej (rzut ≤ ${ability.upTo})`;
    case "bezpieczny": {
      const where = fieldNames(ability.fields);
      // The condition is half the rule. The Relikwiarz spares a Dobra Postać at
      // the Czarci Młyn and a Zła one at the Studnia Wieczności, and dropping
      // that read as sparing everyone at both.
      const onlyFor = ability.natura?.length
        ? ` — jeśli ${ability.natura.map((n) => (n === "zla" ? "zła" : n)).join(" lub ")}`
        : "";
      if (ability.from === "rzut") return `bez rzutu: ${where}${onlyFor}`;
      if (ability.from === "zycie") return `bez straty Życia: ${where}${onlyFor}`;
      return `bez straty Przedmiotu: ${where}${onlyFor}`;
    }
    case "ucieczka":
      return `ucieczka przed Wrogiem: ${fieldNames(ability.fields)}`;
    case "udzwig":
      return ability.items === "bez-limitu"
        ? "niesiesz bez ograniczeń (5.4)"
        : `niesiesz do ${ability.items} Przedmiotów (5.4)`;
    case "ruch-bonus":
      return ability.min === ability.max
        ? `+${ability.min} do ruchu`
        : `+${ability.min}–${ability.max} do ruchu`;
    case "magia-do-miecza":
      return "do punktów Miecza dodajesz swoje punkty Magii";
    case "ginie-zamiast-ciebie":
      return ability.onRollUpTo
        ? `ginie zamiast ciebie (rzut ≤ ${ability.onRollUpTo})`
        : "ginie zamiast ciebie";
    case "wymagany":
      return ability.place === "most"
        ? "bez tego nie wejdziesz na Kamienny Most (14.2)"
        : "bez tego nie wejdziesz do Zamku Bestii (14.7)";
    case "bez-oplaty":
      return `bez opłaty: ${fieldNames(ability.fields)}`;
    case "zakazane":
      return "nie wolno ci nosić niektórych Przedmiotów";
    case "bez-zaklec":
      return "nie rzucasz Zaklęć; odporność na wybrane Zaklęcia";
    case "przeprawa-kostki":
      return `przeprawa przez Trzęsawiska: ${ability.dice} kostki`;
    case "skup":
      return `zamienia Przedmiot na złoto (${ability.cena} Sz. Z. za sztukę)`;
    case "przeprawa-wszedzie":
      return ability.obstacle === "trzesawiska"
        ? "przeprawa przez Trzęsawiska w dowolnym miejscu"
        : "przeprawa przez Lodowy Las w dowolnym miejscu";
    case "uzdrowienie":
      return `do ${ability.upTo} Życia w: ${fieldName(ability.field)}`;
    case "walczy-za-ciebie":
      return `walczy za ciebie (Miecz ${ability.miecz}, Magia ${ability.magia})`;
    case "niedostepny":
      return "nie do zdobycia w Dolnym Kręgu";
    case "natura-dowolna":
      return "Naturę zmieniasz dowolnie (raz na turę)";
    case "modyfikator-rzutu": {
      const sign = ability.dowolnyZnak
        ? `±${Math.abs(ability.delta)}`
        : `${ability.delta > 0 ? "+" : "−"}${Math.abs(ability.delta)}`;
      const where =
        ability.gdzie.na === "walke"
          ? ability.gdzie.rodzaj === "magiczna"
            ? "w walce magicznej"
            : "w walce zwykłej"
          : `na: ${ability.gdzie.fields.map(fieldName).join(", ")}`;
      return `${sign} do rzutu ${where}${ability.jednorazowy ? " (raz)" : ""}`;
    }
    case "tylko-natura": {
      const natury = ability.natury.map((n) => (n === "zla" ? "zła" : n)).join(" lub ");
      return `tylko Postać: ${natury} (5.3)`;
    }
    case "pokonuje-bez-walki":
      return "pokonujesz wszystkie Demony bez walki";
    case "zaklecia-ponad-limit":
      return `+${ability.count} Zaklęcie ponad limit (2.6)`;
  }
}
