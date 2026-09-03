/** What a card does, said in one line each, and when it does it. */

import type { Nature } from "@/data/types";
import { FIELDS, type FieldId } from "./board";
import { ABILITIES, CARD_NOTES, type Ability } from "./abilities";
import { describeDisposition, scriptFor, type Condition } from "./cardScript";
import type { Status } from "./status";
import { classOf } from "./cards";
import { describeEffect, effectRows } from "./effectText";
import { abilitiesOfCharacter, asCharacterId } from "./characters";
import { NATURE_LABEL, cardName, fieldName, plural } from "./polish";
import { slotsFor, SLOT_LABEL, isWearable, type EqMode, type Slot } from "./slots";

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
/**
 * When a bonus counts, and only one of the two is a rule.
 *
 * "Gdy założony" is slotowy's — the book draws no line between a worn Hełm and
 * a carried one, so there is nothing to cite and citing anything would be
 * inventing a rule for a house variant. "Tylko w walce" is 1.5's, which is the
 * distinction the whole app leans on: a parametr against what it becomes in a
 * fight, said on nine cards and defined nowhere they can see.
 */
export type AbilityWhen = "gdy założony" | "tylko w walce (1.5)" | "warunek";

/**
 * The conditions on one ability — none, one, or both of the two real ones.
 *
 * They are independent and neither implies the other, which is why this is a
 * list and not a choice. A MIECZ is wearable *and* fight-only and needs both
 * lines; a PIERŚCIEŃ MOCY is wearable and always on; a GIERMEK is fight-only
 * and never worn at all, because 6.3 gives a Przyjaciel no place on the body.
 *
 * ```
 * MIECZ           gdy założony, tylko w walce
 * PIERŚCIEŃ MOCY  gdy założony
 * GIERMEK         tylko w walce
 * ŁÓDŹ            —
 * ```
 */
export function whenApplies(
  ability: Ability,
  cardId: string,
  eqMode: EqMode,
): AbilityWhen[] {
  // A requirement is not something that happens at a moment; it is true or the
  // card is not yours at all.
  if (ability.kind === "tylko-natura") return ["warunek"];

  const when: AbilityWhen[] = [];

  /**
   * Where the card has to be. In klasyczny nothing has to be anywhere — 5.4
   * has one kind of possession, and a Miecz in the pack is a Miecz. "Gdy w
   * plecaku" is true of almost everything and so tells a player nothing; the
   * line is worth printing only where there is a condition to meet.
   */
  if (eqMode === "slots" && isWearable(cardId)) when.push("gdy założony");

  /**
   * And when it counts, which is a property of the card and true in both
   * variants.
   *
   * This used to be guessed from four hand-picked ability kinds and was dropped
   * for being inconsistent — a Sztylet's +1 only matters in a fight too and
   * never carried the label. It is not a guess any more: `tylkoWalka` is on the
   * ability, it is on every one of the nine cards whose text says „w walce",
   * and a test holds it to the printed words. So the label is read off the data
   * instead of chosen, which is what was wrong with it.
   *
   * It matters more than it looks. The figure it explains is the one the rail
   * now leads with, and a +1 that quietly does nothing on the Kamienny Most is
   * exactly the surprise this is here to prevent.
   */
  if (ability.kind === "punkty" && ability.tylkoWalka) when.push("tylko w walce (1.5)");

  return when;
}

/**
 * How long a Nieznajomy or a Miejsce is here, in a phrase.
 *
 * Which is the only thing that varies between them worth saying beside the
 * picture. Whether the instruction is binding is not: 16.5 and 16.7 both say
 * „konieczne jest wykonanie zawartej w Karcie instrukcji", so every one of them
 * is carried out at its place in the kolejka, and a label repeating that on all
 * thirty is a word that says nothing.
 *
 * What a player actually needs to know is whether the Karta will still be there
 * — the CUDOTWÓRCA for the rest of the game, the WRÓŻKA until the first Dobra
 * Postać takes her wish, the KUGLARZ not even until the end of this turn. Read
 * off the disposition, which is where that fact already lives.
 */
export function staysAs(cardId: string): string | null {
  const cardClass = classOf(cardId);
  if (cardClass !== "stranger" && cardClass !== "place") return null;
  const disposition = scriptFor(cardId)?.disposition;
  if (!disposition) return null;
  switch (disposition.kind) {
    case "odloz":
      return "jednorazowa — potem wraca na stos";
    case "do-pierwszej":
      return "czeka na Obszarze na pierwszą Postać — potem wraca na stos";
    case "zostaje":
      return "zostaje na Obszarze do końca gry";
    case "zostaje-z-pula":
      return "zostaje na Obszarze, dopóki się nie wyczerpie";
    case "po-turach":
      return `działa przez ${disposition.turns} ${disposition.turns === 1 ? "turę" : "tury"}`;
    case "wraca-do-stosu":
      return "wraca do stosu";
    case "bierzesz":
      return "bierzesz ją ze sobą";
  }
}

/** One formalised line: what it gives, and when it gives it. */
export interface AbilityFact {
  kind: Ability["kind"];
  what: string;
  /** Empty when the card simply has to be on you, which is not worth a line. */
  when: AbilityWhen[];
}

/** Everything the app carries about one card, ready to be shown. */
export interface ItemProfile {
  /**
   * How long this Karta is here — see `staysAs`. Null for every class but a
   * Nieznajomy and a Miejsce, which is most of the box.
   */
  visit: string | null;
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

/**
 * Kinds that say what a card IS rather than what it gives you.
 *
 * Where a card can be found is a fact about the game, not something the card
 * does for you — listing "nie do zdobycia w Dolnym Kręgu" beside "+1 Miecza"
 * invites reading it as a benefit, which is the opposite of what it says.
 *
 * Needing the card to walk somewhere is NOT one of these. That is exactly what
 * a Magiczny Miecz gives its owner, and the only thing it gives them.
 */
const IS_SPECIAL = new Set<Ability["kind"]>(["niedostepny"]);

export function itemProfile(cardId: string, eqMode: EqMode = "classic"): ItemProfile {
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
    visit: staysAs(cardId),
    slots,
    slotLabel: slots.length > 0 ? slots.map((slot) => SLOT_LABEL[slot]).join(" / ") : null,
    facts: lines
      .filter((l) => !IS_A_REQUIREMENT.has(l.ability.kind) && !IS_SPECIAL.has(l.ability.kind))
      .map((l) => l.fact),
    requirements: lines.filter((l) => IS_A_REQUIREMENT.has(l.ability.kind)).map((l) => l.fact),
    special: [
      ...lines.filter((l) => IS_SPECIAL.has(l.ability.kind)).map((l) => l.fact.what),
      ...specialOf(cardId),
    ],
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
  /**
   * The Natura gate is not described here, because the requirement line above
   * has just said it. „Tylko Postać: dobra" with „Jeśli dobra: do wyboru…"
   * under it is the same condition twice, and the second copy pushes the six
   * gifts a clause further from the eye. `servedNatures` reads exactly this
   * shape — a `gdy natura` with no `inaczej` — so the two cannot come apart.
   */
  const body =
    script.effect.op === "gdy" &&
    script.effect.warunek.is === "natura" &&
    script.effect.inaczej === undefined
      ? script.effect.to
      : script.effect;
  const lines = effectRows(body) ?? [describeEffect(body)];
  /**
   * Only worth saying when the card does not simply stay with you — and not at
   * all where `staysAs` has already said it. On a Nieznajomy the two ran one
   * under the other: „Czeka tu na pierwszą Dobrą Postać" and then „Karta czeka
   * tu na pierwszą Postać, potem ją odłóż", the second being the first with
   * the Natura dropped and an instruction to the table added.
   */
  if (script.disposition.kind !== "zostaje" && staysAs(cardId) === null) {
    lines.push(describeDisposition(script.disposition));
  }
  return lines;
}

/**
 * Which Natures may not hold this card (5.3), or nothing when anyone may.
 *
 * The one place that question is answered, so the rule and the hover cannot
 * disagree about it.
 */
export function forbiddenNatures(cardId: string): readonly Nature[] | undefined {
  // 5.3 only, so this stays on the abilities: whom a card may be *held* by is a
  // different question from whom a Nieznajomy serves, and `servedNatures`
  // deliberately answers both for the sheet.
  const abilities = ABILITIES[cardId as keyof typeof ABILITIES] ?? [];
  const only = abilities.find((ability) => ability.kind === "tylko-natura");
  if (!only || only.kind !== "tylko-natura") return undefined;
  return (["good", "evil", "chaotic"] as const).filter(
    (nature) => !only.natury.includes(nature),
  );
}

/**
 * The Natury a card is for, from either place one can be written.
 *
 * A Przedmiot says it as a `tylko-natura` ability, which is 5.3: you may not
 * even hold the card. Three Nieznajomi say it as the condition on their own
 * script — „Pierwszej **Dobrej** Postaci, która do niej zawita" — which is not
 * 5.3 at all: the WRÓŻKA is happily met by a Zła Postać, she simply does
 * nothing and waits for somebody else.
 *
 * Different rules, same question for the person reading the card, and the
 * answer has to come from one place or the sheet says „tylko Dobra Postać" for
 * the Talizman and nothing for the Wróżka.
 */
function servedNatures(cardId: string): readonly Nature[] | undefined {
  const abilities = ABILITIES[cardId as keyof typeof ABILITIES] ?? [];
  const only = abilities.find((ability) => ability.kind === "tylko-natura");
  if (only && only.kind === "tylko-natura") return only.natury;
  const gate = scriptFor(cardId)?.effect;
  if (gate?.op === "gdy" && gate.warunek.is === "natura" && gate.inaczej === undefined) {
    return gate.warunek.jedna_z;
  }
  return undefined;
}

/**
 * What the Karta asks of the character before it does anything, or null.
 *
 * The same line a Przedmiot prints, in the same words and read the same way —
 * green where the reader passes, red where they do not. On a Nieznajomy it
 * answers the question the sheet was silent about: a Zła Postać standing in
 * front of the WRÓŻKA saw six gift buttons she could not press.
 */
export interface Reader {
  /** The Natura of the Postać the Karta is being read for. */
  nature: Nature | null;
  /** Their last act of aggression, in words, or null — see `describeAggression`. */
  aggression?: string | null;
  /** What that Postać is called, for a sentence about them rather than about you. */
  name?: string;
  /** Whether they are the reader's own Postać, which changes only the pronoun. */
  mine?: boolean;
}

/**
 * The subject of a sentence about the Postać a Karta is being read for.
 *
 * „Postać" is the head word in both, and that is the point: it is feminine, so
 * „nie zaatakowała" and „użyła" agree whoever it is. Put a player's name there
 * instead and Polish wants a gender the box does not print and the app has
 * never been told.
 */
function whose(reader: Reader): string {
  return reader.mine === false && reader.name ? `Postać ${reader.name}` : "Twoja Postać";
}

export function requirementOf(
  cardId: string,
  reader: Nature | null | Reader,
): { label: string; value: string; met: boolean | null; detail?: string } | null {
  const who: Reader = typeof reader === "object" && reader !== null ? reader : { nature: reader };
  const only = servedNatures(cardId);
  if (only) {
    const met = who.nature === null ? null : only.includes(who.nature);
    return {
      label: "tylko Postać",
      value: only.map((one) => NATURE_LABEL[one] ?? one).join(" lub "),
      met,
      /**
       * Their Natura, said outright.
       *
       * The colour says whether they pass and nothing said why, which on a red
       * line is the half a player wants: „tylko Postać: dobra" in red is a
       * refusal, and „Twoja Postać jest zła" is its reason.
       */
      ...(who.nature === null
        ? {}
        : { detail: `${whose(who)} jest ${NATURE_LABEL[who.nature] ?? who.nature}` }),
    };
  }
  /**
   * The Dobre Bóstwo, which asks what the reader has done rather than what they
   * are — and is the only card in the box that does.
   *
   * Said as a requirement because that is what it is: the Karta has nothing for
   * an innocent Postać and everything for a guilty one, which is the same shape
   * as „tylko Postać: dobra" and reads better in the same place. The detail is
   * the accusation's evidence — or, where there is none, the acquittal, in the
   * card's own two limbs: „zaatakowałeś inną Postać lub użyłeś swoich zdolności
   * na jej niekorzyść".
   */
  if (conditionOf(cardId) === "attacker") {
    const line = { label: "tylko Postać", value: "uznany agresor" };
    if (who.aggression === undefined) return { ...line, met: null };
    return {
      ...line,
      met: who.aggression !== null,
      detail: who.aggression
        ? `${whose(who)}: ${who.aggression}`
        : `${whose(who)} jeszcze nigdy nie zaatakowała innej Postaci ani nie użyła swoich zdolności na jej niekorzyść`,
    };
  }
  return null;
}

/** The kind of test a Karta's own `gdy` applies, when its whole effect is one. */
function conditionOf(cardId: string): Condition["is"] | null {
  const effect = scriptFor(cardId)?.effect;
  return effect?.op === "gdy" ? effect.warunek.is : null;
}

/**
 * One act of aggression, in the words a player can check against the journal.
 *
 * „Runda 3 — atak na Postać WIEDŹMA, Obszar Osada" — a record rather than a
 * sentence, so it has no person and no gender to get wrong. Whoever prints it
 * says whose in front of it („Twoja Postać:"), and that half is a sentence with
 * „Postać" as its subject, which is feminine whoever it is.
 *
 * Where the victim stood somewhere else it says both, which no base-game act
 * does — 13.3 puts the two Postacie on one Obszar — and a Przyjaciel sent three
 * Obszary out (POSZUKIWACZ PRZYGÓD) or a Zaklęcie cast across a Kraina would.
 */
export function describeAggression(
  act: Extract<Status["modifier"], { kind: "attacker" }>,
): string {
  const ability = act.how === "zdolnosc";
  const when = act.round === undefined ? "" : `Runda ${act.round} — `;
  // Naming the class before the name — „na Postać WIEDŹMA" — is what lets the
  // name stay in the nominative it is printed in.
  const whom = act.victim
    ? `${ability ? "zdolność użyta przeciw Postaci" : "atak na Postać"} ${act.victim}`
    : ability
      ? "zdolność użyta przeciw innej Postaci"
      : "atak na inną Postać";
  const where =
    act.where === undefined
      ? ""
      : act.victimWhere !== undefined && act.victimWhere !== act.where
        ? `, Obszar ${fieldName(act.where as FieldId)} → ${fieldName(act.victimWhere as FieldId)}`
        : `, Obszar ${fieldName(act.where as FieldId)}`;
  return `${when}${whom}${where}`;
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
    // A Postać is not a Karta lying on an Obszar.
    visit: null,
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
      when: whenApplies(ability, characterId, "classic"),
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
        ? ` — jeśli ${ability.natura.map((n: string) => NATURE_LABEL[n] ?? n).join(" lub ")}`
        : "";
      if (ability.from === "rzut") return `bez rzutu: ${where}${onlyFor}`;
      if (ability.from === "life") return `bez straty Życia: ${where}${onlyFor}`;
      return `bez straty Przedmiotu: ${where}${onlyFor}`;
    }
    case "ucieczka": {
      // Said out loud because it is the whole restriction: an escape printed on
      // a character or a friend is about Wrogowie, and a player who reads it as
      // "you can run away here" will try it on another Postać and be told no.
      const przed = (ability.przed ?? ["wrog"]).map((what) =>
        what === "postac" ? "Postacią" : "Wrogiem",
      );
      // 19.1 is the rule this is an instance of: "Używając specjalnych
      // zdolności opisanych w charakterystyce […] Postać może wymknąć się".
      return `ucieczka przed ${przed.join(" lub ")} (19.1): ${fieldNames(ability.fields)}`;
    }
    case "udzwig": {
      if (ability.items === "bez-limitu") return "niesiesz bez ograniczeń (5.4)";
      // Added to the four of 5.4, not a cap replacing them — which is what
      // carryLimit does, and what the card says: the Koń carries eight of your
      // Przedmioty, and losing it makes you leave whatever you cannot carry
      // yourself. "Do 8" said the opposite of both.
      const many = ability.items;
      return `+${many} ${plural(many, "Przedmiot", "Przedmioty", "Przedmiotów")} ponad limit (5.4)`;
    }
    case "ruch-bonus":
      return ability.min === ability.max
        ? `+${ability.min} do ruchu`
        : `+${ability.min}–${ability.max} do ruchu`;
    case "magia-do-miecza":
      return "do punktów Miecza dodajesz swoje punkty Magii";
    case "zabiera-zycie":
      return ability.zycie === 1
        ? "po każdej wygranej walce zabierasz pokonanemu 1 punkt Życia"
        : `po każdej wygranej walce zabierasz pokonanemu ${ability.zycie} punkty Życia`;
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
    // Colon rather than a preposition, exactly as `bez-oplaty` two cases up:
    // an Obszar's name is printed on the board and goes in verbatim, so nothing
    // here can decline it and „w Zamek" is what asking would produce.
    case "placi-za-przegrana":
      return "przegraną walkę z Postacią płacisz tą Kartą, nie punktem Życia";
    case "sprzedaj-w":
      return `sprzedasz za ${ability.cena} Sz. Z.: ${fieldNames(ability.fields)}`;
    case "przeprawa-wszedzie":
      return ability.obstacle === "trzesawiska"
        // Both are the rulebook's own sentences: 11.2 "Trzęsawiska można
        // przebyć w dowolnym miejscu przy pomocy Łodzi", 11.6 "Postać
        // posiadająca Latarnię może przeprawić się przez Lodowy Las w dowolnym
        // miejscu". The card restates a rule, so the rule is worth naming.
        ? "przeprawa przez Trzęsawiska w dowolnym miejscu (11.2)"
        : "przeprawa przez Lodowy Las w dowolnym miejscu (11.6)";
    case "uzdrowienie":
      return `do ${ability.upTo} Życia w: ${fieldName(ability.field)}`;
    case "oddaj-w":
      return `oddaj Kartę w: ${fieldName(ability.field)} za ${ability.cena} Sz. Z.`;
    case "cena-przyjecia": {
      const price = [
        ability.zloto ? `${ability.zloto} Sz. Z.` : null,
        ability.zycie ? `${ability.zycie} Życia` : null,
      ]
        .filter(Boolean)
        .join(" i ");
      return ability.bezZaplaty === "odchodzi"
        ? `przyjęcie kosztuje ${price}; bez zapłaty odchodzi na stos`
        : `przyjęcie kosztuje ${price}; bez zapłaty czeka na Obszarze`;
    }
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
          ? ability.gdzie.rodzaj === "magical"
            ? "w walce magicznej"
            : "w walce zwykłej"
          : `na: ${ability.gdzie.fields.map(fieldName).join(", ")}`;
      return `${sign} do rzutu ${where}${ability.jednorazowy ? " (raz)" : ""}`;
    }
    case "tylko-natura": {
      const natury = ability.natury.map((n: string) => NATURE_LABEL[n] ?? n).join(" lub ");
      return `tylko Postać: ${natury} (5.3)`;
    }
    case "nosi-zaklecie": {
      const price =
        ability.cena === undefined || ability.cena === 0
          ? "wypowie je, gdy zechcesz"
          : `wypowie je za ${plural(ability.cena, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota")}`;
      const after = ability.znika ? ", po czym odchodzi z zapłatą" : "";
      const look = ability.mozeszObejrzec ? " (wolno ci je obejrzeć)" : "";
      return `nosi przy sobie 1 Zaklęcie${look} — ${price}${after}`;
    }
    case "za-oplata": {
      const gives = [
        ability.miecz ? `+${ability.miecz} Miecza` : null,
        ability.magia ? `+${ability.magia} Magii` : null,
      ]
        .filter(Boolean)
        .join(" i ");
      const often = ability.razNaTure ? ", raz na turę" : "";
      return `za ${plural(ability.cena, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota")}: ${gives} na jedną turę${often}`;
    }
    case "przeciw": {
      const gives = [
        ability.miecz !== undefined && `+${ability.miecz} Miecza`,
        ability.magia !== undefined && `+${ability.magia} Magii`,
      ]
        .filter(Boolean)
        .join(", ");
      return `przeciw: ${ability.komu.join(", ")} — ${gives} zamiast zwykłego bonusu`;
    }
    case "pokonuje-bez-walki":
      return "pokonujesz wszystkie Demony bez walki";
    case "zaklecia-ponad-limit":
      return `+${ability.count} Zaklęcie ponad limit (2.6)`;
    case "podglad-zaklec":
      return `biorąc Zaklęcie, oglądasz ${ability.count} pierwsze Karty i wybierasz jedną`;
    case "punkty-na-polach":
      return `+${ability.punkty} Miecza lub Magii: ${fieldNames(ability.fields)}`;
    case "odporny-na-zaklecie":
      return `odporność na: ${ability.zaklecia.map((id) => cardName(id)).join(", ")}`;
  }
}
