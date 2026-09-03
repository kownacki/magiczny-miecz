/** What a card does, said in one line each, and when it does it. */

import type { Nature } from "@/data/types";
import { FIELDS, type FieldId } from "./board";
import { ABILITIES, CARD_NOTES, type Ability } from "./abilities";
import {
  describeDisposition,
  scriptFor,
  valenceOf,
  type Effect,
  type Valence,
} from "./cardScript";
import type { Status } from "./status";
import { classOf } from "./cards";
import { cardRows, describeEffect } from "./effectText";
import { abilitiesOfCharacter, asCharacterId } from "./characters";
import {
  NATURE_LABEL,
  NATURE_LABEL_G,
  NATURE_LABEL_M,
  cardName,
  fieldName,
  plural,
} from "./polish";
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
 * How long this Karta is here, in a phrase.
 *
 * Which is the only thing that varies between a Nieznajomy and a Miejsce worth
 * saying beside the picture. Whether the instruction is binding is not: 16.5
 * and 16.7 both say „konieczne jest wykonanie zawartej w Karcie instrukcji", so
 * every one of them is carried out at its place in the kolejka, and a label
 * repeating that on all thirty is a word that says nothing.
 *
 * What a player actually needs to know is whether the Karta will still be there
 * — the CUDOTWÓRCA for the rest of the game, the WRÓŻKA until the first Dobra
 * Postać takes her wish, the KUGLARZ not even until the end of this turn. Read
 * off the disposition, which is where that fact already lives.
 *
 * # And on a Spotkanie, where it was silent
 *
 * A Spotkanie has the same range of fates and a wider one: MGŁA sits on the
 * table for two turns capping everybody's walk, POŁUDNICA and ZŁY DUCH attach
 * themselves to you for the rest of the game. Those said it in ochre at the
 * *foot* of the rows — „Bierzesz Kartę ze sobą." — as an instruction to the
 * table, under everything the card does, while a Nieznajomy said the same kind
 * of fact first and in the terms colour. One question, two registers, decided
 * by a class the reader cannot see.
 *
 * `odloz` is the exception, and stays null. On a Nieznajomy it is worth saying,
 * because the Karta might have stayed on the Obszar and five of the seventeen
 * do not; on a Spotkanie it is what happens to fourteen of the twenty and to
 * every card nobody wonders about. Absence is the answer there: no line means
 * the Karta happens and is over, and the housekeeping sentence in the rows
 * below still says where it goes.
 */
export function staysAs(cardId: string): string | null {
  const cardClass = classOf(cardId);
  const resident = cardClass === "stranger" || cardClass === "place";
  if (!resident && cardClass !== "encounter") return null;
  const disposition = scriptFor(cardId)?.disposition;
  if (!disposition) return null;
  if (!resident && disposition.kind === "odloz") return null;
  switch (disposition.kind) {
    case "odloz":
      return "jednorazowa — potem wraca na stos";
    case "do-pierwszej":
      /**
       * „na pierwszą Postać" is the EREMITA, who serves anybody. The WRÓŻKA
       * does not — „Pierwszej **Dobrej** Postaci" — and a Zła Postać standing
       * in front of her, told the Karta is waiting for the first Postać, has
       * been told the wrong thing about why nothing is happening. The clause
       * goes on exactly the cards that have a condition to meet.
       */
      return servedNatures(cardId)
        ? "czeka na Obszarze na pierwszą Postać, która spełni warunki — potem wraca na stos"
        : "czeka na Obszarze na pierwszą Postać — potem wraca na stos";
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
   * How long this Karta is here — see `staysAs`. Null on a Przedmiot and a
   * Wróg, and on the Spotkania that simply happen and are over.
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
   * The condition is not described here when the requirement line above has
   * already said it — „Tylko Postać: dobra" over „Jeśli dobra: do wyboru…", or
   * „Tylko Postać: uznany agresor" over „Jeśli zaatakowałeś inną Postać…". The
   * second copy is the same test twice and pushes what the Karta actually does
   * a clause further from the eye.
   *
   * The two kinds are exactly the two `requirementOf` states, and only where
   * the other branch does nothing: a second branch that acts is content rather
   * than a gate, and dropping the condition would leave two outcomes with
   * nothing to tell them apart. An `inaczej` of „nic" is not one of those — it
   * is the shape a card takes when it simply does not apply, which is what the
   * requirement line is for.
   */
  const gate = wholeCardGate(cardId);
  const stated =
    gate !== null && (gate.warunek.is === "natura" || gate.warunek.is === "attacker");
  const body = stated && gate !== null ? gate.to : script.effect;
  // The whole Karta, which for the three of 15.1 is two occasions rather than
  // one: where it goes when it is turned over, then what it says where it lies.
  /**
   * A script that is only a disposition has nothing to say in a list of what
   * the card does, and „nic się nie dzieje" is a claim rather than a blank.
   *
   * It was on twenty-five cards. Every plain Wróg is `{ op: "nic" }`, because
   * turning a WILK over does nothing — you fight it, and the fight is not this
   * panel's — so the one formalised line under a creature's picture said the
   * card had no rules at all. And UKŁAD PLANET, whose entry is only the clock
   * because the doubling has nowhere to live, said the same words and meant
   * something quite different by them.
   *
   * Asked after `cardRows`, not instead of it: a Karta whose body is empty may
   * still have a placement to say (15.1), and that is a row.
   */
  const lines = cardRows(script, body) ?? (body.op === "nic" ? [] : [describeEffect(body)]);
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
/**
 * The `gdy` that IS the card, rather than one branch of what it does.
 *
 * Two places were asking this question with two different answers. The
 * requirement line wanted `inaczej === undefined`; `specialOf`, which drops the
 * condition from the rows *because* the requirement line is saying it, also
 * accepted an `inaczej` of „nic". The GODZINA DUCHÓW is written the second way
 * — „Może je wezwać każda **Zła** Postać", with nothing at all for anybody else
 * — so `specialOf` struck the condition out on the strength of a line that was
 * never drawn, and the one thing the card is about vanished from the sheet.
 *
 * One predicate, so the two cannot disagree again. An `inaczej` that *acts* is
 * still not a gate: two live arms are content, and the SABAT would otherwise
 * claim to be for Złe Postacie only while changing the Natura of everyone else.
 */
function wholeCardGate(cardId: string): Extract<Effect, { op: "gdy" }> | null {
  const effect = scriptFor(cardId)?.effect;
  if (effect?.op !== "gdy") return null;
  return effect.inaczej === undefined || effect.inaczej.op === "nic" ? effect : null;
}

function servedNatures(
  cardId: string,
): { natures: readonly Nature[]; rule: string | null; valence: Valence | null } | undefined {
  const abilities = ABILITIES[cardId as keyof typeof ABILITIES] ?? [];
  const only = abilities.find((ability) => ability.kind === "tylko-natura");
  // 5.3 is a rule about *holding* a card, so it is cited on the cards it is
  // about. A Nieznajomy serving one Natura is not 5.3 and cites nothing: no
  // rule in the book says the Wróżka waits for a Dobra Postać — her Karta does.
  if (only && only.kind === "tylko-natura") {
    // 5.3 is a rule about *holding* a Karta, so meeting it is by definition in
    // the reader's favour: what it gates is the card being theirs at all.
    return { natures: only.natury, rule: "(5.3)", valence: "korzysc" };
  }
  const gate = wholeCardGate(cardId);
  if (gate && gate.warunek.is === "natura") {
    return { natures: gate.warunek.jedna_z, rule: null, valence: valenceOf(gate.to) };
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
  /**
   * Who they are, as the table knows them — „Marcin (MAG)".
   *
   * The player and the Postać together, because either alone is ambiguous at a
   * table where one person may have played two: the name says whom to look at
   * and the Karta says what they are.
   */
  name?: string;
  /** Their Karta Postaci's grammatical gender, which the adjectives agree with. */
  gender?: "m" | "f";
  /** Whether this is the reader's own Postać, which is then not named. */
  mine?: boolean;
  /** What they have, for an offer that says what it would leave them with. */
  points?: OwnPoints;
}

/**
 * The subject of a sentence about the Postać a Karta is being read for, and the
 * ending its verbs and adjectives take.
 *
 * „Marcin (MAG) jest zły" agrees with the Karta Postaci, not with the player —
 * a name tells the app nothing about gender and never will, while `genderOf`
 * knows all twenty-seven. Outside a game there is no name and „Twoja Postać" is
 * the subject instead, which is feminine and takes „zła" whoever is reading.
 */
function subject(reader: Reader): { who: string; a: string; feminine: boolean } {
  // Your own Postać is not introduced to you. „Twoja Postać" is also feminine,
  // which is why the one form that needs no gender at all is the one used most.
  if (reader.mine || !reader.name) return { who: "Twoja Postać", a: "a", feminine: true };
  const feminine = reader.gender === "f";
  return { who: reader.name, a: feminine ? "a" : "", feminine };
}

export function requirementOf(
  cardId: string,
  reader: Nature | null | Reader,
): {
  label: string;
  value: string;
  /** The rule the condition comes from, where one does — „(5.3)". */
  rule?: string;
  met: boolean | null;
  /**
   * Whether meeting the condition is in the reader's favour — see `valenceOf`.
   *
   * The panel colours this line green where the reader passes, which is the
   * right answer on a Przedmiot and a Nieznajomy and backwards on a Spotkanie:
   * ZAĆMIENIE SŁOŃC told a Dobra Postać in green that she qualified, for a turn
   * taken off her. Null where the card does not settle it, and the line is then
   * drawn muted rather than guessed at.
   */
  valence: Valence | null;
  detail?: string;
} | null {
  const who: Reader = typeof reader === "object" && reader !== null ? reader : { nature: reader };
  const only = servedNatures(cardId);
  if (only) {
    const met = who.nature === null ? null : only.natures.includes(who.nature);
    /**
     * „tylko Postać: dobra" is a permission and „dotyczy Postaci: dobrej" is a
     * reach, and the difference is the card's, not the panel's. ZAĆMIENIE SŁOŃC
     * does not admit Dobre i Chaotyczne Postacie to anything — it takes a turn
     * off them, and „tylko" said the opposite of what the Karta says.
     */
    const hurts = only.valence === "strata";
    const label = hurts ? "dotyczy Postaci" : "tylko Postać";
    const words = hurts ? NATURE_LABEL_G : NATURE_LABEL;
    return {
      label,
      value: only.natures.map((one) => words[one] ?? one).join(" lub "),
      valence: only.valence,
      // Kept apart from the value, because they are two different things to
      // point at: the value has a hover saying whether the reader passes, and
      // the number is a link into the Instrukcja. Run together under one dotted
      // underline they read as one word with two behaviours.
      ...(only.rule ? { rule: only.rule } : {}),
      met,
      /**
       * Their Natura, said outright.
       *
       * The colour says whether they pass and nothing said why, which on a red
       * line is the half a player wants: „tylko Postać: dobra" in red is a
       * refusal, and „Twoja Postać jest zła" is its reason.
       */
      ...(who.nature === null ? {} : { detail: natureLine(who, who.nature) }),
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
  const gate = wholeCardGate(cardId);
  if (gate?.warunek.is === "attacker") {
    /**
     * „dotyczy Postaci", like a Spotkanie that hits a Natura, because that is
     * what the Karta does: the Bóstwo judges a guilty Postać and the judgement
     * costs a Sztuka Złota or a turn spent standing here. It was „tylko Postać:
     * uznany agresor" in green, which read as a qualification for something.
     */
    const line = {
      label: "dotyczy Postaci",
      value: "uznanej za agresora",
      valence: valenceOf(gate.to),
    };
    if (who.aggression === undefined) return { ...line, met: null };
    return {
      ...line,
      met: who.aggression !== null,
      detail: who.aggression ? `${subject(who).who}: ${who.aggression}` : acquittal(who),
    };
  }
  return null;
}

/** „Marcin (MAG) jest zły" — the Natura, agreeing with the Karta Postaci. */
function natureLine(reader: Reader, nature: Nature): string {
  const { who, feminine } = subject(reader);
  const label = feminine ? NATURE_LABEL[nature] : NATURE_LABEL_M[nature];
  return `${who} jest ${label ?? nature}`;
}

/** The Dobre Bóstwo's own two limbs, said in the negative. */
function acquittal(reader: Reader): string {
  const { who, a } = subject(reader);
  return (
    `${who} jeszcze nigdy nie zaatakował${a} innej Postaci ` +
    `ani nie użył${a} swoich zdolności na jej niekorzyść`
  );
}

/** What a Postać has, for an offer that says what it would leave them with. */
export interface OwnPoints {
  sword: number;
  magic: number;
  life: number;
  gold: number;
  /** 1.2–1.5: own points never fall below the starting values. */
  swordFloor: number;
  magicFloor: number;
}

/**
 * What one option would leave you with — „Miecz 6 → 7".
 *
 * On the button, because a choice between two numbers is not a choice until you
 * know the numbers. „Zamieniasz bazowe punkty Miecza na bazowe punkty Magii" is
 * a rule; „Miecz 6 → 2 · Magia 2 → 6" is the decision, and the second is what a
 * player is actually weighing.
 *
 * Clamped at the floor, so the sheet never promises what 1.2–1.5 would refuse:
 * a Kuglarz cannot take a Barbarzyńca's Miecz below the 6 his Karta starts him
 * on, and „6 → 2" over a swap that would land on 6 is worse than no number.
 *
 * Null for anything that does not move one of the four, which is most of the
 * box — a relocation, a Zaklęcie, a fight.
 */
export function previewOf(effect: Effect, points: OwnPoints): string | null {
  const shown = (label: string, from: number, to: number) =>
    from === to ? `${label} ${from} — bez zmian` : `${label} ${from} → ${to}`;

  if (effect.op === "punkty") {
    const now = { sword: points.sword, magic: points.magic, life: points.life, gold: points.gold }[
      effect.stat
    ];
    const floor =
      effect.stat === "sword" ? points.swordFloor : effect.stat === "magic" ? points.magicFloor : 0;
    const next = Math.max(floor, now + effect.delta);
    return shown(STAT_OF[effect.stat], now, next);
  }

  if (effect.op === "zamien-punkty") {
    /**
     * One parameter takes the other's value and the other stands — see the op.
     * `z` names the one that changes, so the two directions land on different
     * numbers and the two buttons are two different offers.
     */
    const [now, from, floor] =
      effect.z === "sword"
        ? [points.sword, points.magic, points.swordFloor]
        : [points.magic, points.sword, points.magicFloor];
    return shown(effect.z === "sword" ? "Miecz" : "Magia", now, Math.max(floor, from));
  }

  if (effect.op === "uzdrow" && effect.upTo !== undefined) {
    // „tylko do wysokości startowej — 4 punktów", which is 3.1's ceiling and the
    // same for everybody.
    const next = Math.min(4, points.life + effect.upTo);
    return shown("Życie", points.life, next);
  }

  if (effect.op === "zaklecie" && effect.cena) {
    return shown("Złoto", points.gold, Math.max(0, points.gold - effect.cena * effect.count));
  }

  return null;
}

/** The four in the nominative, for a sentence that puts them first. */
const STAT_OF: Record<"sword" | "magic" | "life" | "gold", string> = {
  sword: "Miecz",
  magic: "Magia",
  life: "Życie",
  gold: "Złoto",
};

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
