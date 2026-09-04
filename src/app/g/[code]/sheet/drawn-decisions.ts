"use client";

/**
 * What may be done about the Karta in front of you, decided from what the
 * table knows: who fights, what is picked up, what the script asks, whether
 * this Postać fails its condition, and what the die can do.
 */

/**
 * Why a function and not part of the component.
 *
 * `DrawnActions` derived these inline, three hundred lines between its hooks
 * and its three renders, and nothing could reach them without rendering the
 * sheet. They are a pure reading of the props plus the Postać the Karty were
 * dealt to; the component keeps what is its own — which button was pressed,
 * which Obszar is picked, which card of the pack is going. The names are the
 * ones the renders have always used.
 */

import events from "@/data/events.json";
import type { EventCard, Nature } from "@/data/types";
import { classOf, combatValueOf, roundsOf } from "@/lib/engine/cards";
import { attackAsOne } from "@/lib/engine/combat";
import { listed } from "@/lib/engine/state";
import { kindForCard } from "@/lib/engine/holdings";
import { intentSaid, type Intent } from "@/lib/engine/intentText";
import { instructionIn, scriptFor } from "@/lib/engine/cardScript";
import { requirementOf, type Reader } from "@/lib/engine/abilityText";
import { fieldName, plural, sentence } from "@/lib/engine/polish";
import { mayWalkPast } from "@/lib/engine/kolejka";
import { dieGroups } from "@/lib/engine/effectText";
import { inertFor, pendingIn } from "@/lib/engine/resolve";
import type { FieldId } from "@/lib/engine/board";
import type { TurnCard } from "@/lib/engine/state";
import type { Held } from "../table";
import type { Rolled } from "./roll-result";

const EVENTS = events as EventCard[];

/** The props of `DrawnActions` that a decision is read from, and the Postać it is read for. */
export interface DrawnDecisionsInput {
  who: string;
  card: TurnCard;
  cards: TurnCard[];
  resolved: string[];
  fought: string[];
  beaten?: string[];
  mySword: number;
  nature: Nature | null;
  aggression?: string | null;
  /** Whom the Karty are being read for — see `TheReader`. */
  reader: Reader | null;
  intent?: Intent | null;
  rolled?: Rolled | null;
  losing?: { cardId: string; kind: Held["kind"]; cards: Held[] } | null;
}

export type DrawnDecisions = NonNullable<ReturnType<typeof drawnDecisionsFor>>;

/** Null for a Karta the box does not have, which the sheet draws nothing for. */
export function drawnDecisionsFor({
  who,
  card,
  cards,
  resolved,
  fought,
  beaten,
  mySword,
  nature,
  aggression,
  reader,
  intent,
  rolled,
  losing,
}: DrawnDecisionsInput) {
  const known = EVENTS.find((c) => c.id === card.cardId);
  if (!known) return null;
  const script = scriptFor(known.id);

  /**
   * Which of the Karta's sentences this Postać is being read (15.1).
   *
   * The same question `resolveDrawnCard` asks and the same function, off the
   * same fact: a Karta that came off the pile is on its way to the Obszar its
   * instruction names, and one that came off the board is where it was going.
   * The EREMITA is „Rzuć i rozpatrz" to the player who turned him over and two
   * gifts to the player who finds him, and the sheet must not offer one in
   * place of the other — it did, and the Magiczny Miecz was on the table three
   * squares from where the Eremita went to live.
   */
  const instruction = script ? instructionIn(script, card.lying) : null;

  // Whose Miecz the Sobowtór borrows — see `combatValueOf`. Harmless for every
  // other creature, which carries its own number.
  const mirror = { miecz: mySword };
  const foe = combatValueOf(known, mirror);

  // 17.5: several creatures attacking at once are one opponent — their Miecze
  // added and one die thrown for the lot, which is the difference between hard
  // and hopeless. Only when they are of a kind: an ordinary Wróg and a magical
  // one cannot be summed, because the sums are of different things.
  const standing = cards
    /* The turn's own entry is kept beside the card, because `resolved` names a
       *copy* — two Wilki on one Obszar are two entries, and asking the lists
       with a bare id would settle both when one of them was dealt with. */
    .map((entry) => ({ entry, card: EVENTS.find((c) => c.id === entry.cardId) }))
    .filter(
      (one): one is { entry: (typeof cards)[number]; card: EventCard } =>
        !!one.card &&
        !!combatValueOf(one.card, mirror) &&
        !listed(fought, one.entry) &&
        !listed(resolved, one.entry),
    )
    .map((one) => one.card);
  // 17.5 asked once, of the engine, rather than restated here — the server
  // refuses a mixed fight against this same answer. A creature that is several
  // fights rather than one cannot be in the pack either: his card asks for
  // three comparisons and 17.5 offers one, so the button is not shown rather
  // than shown and refused.
  const asOne =
    standing.length > 1 && !standing.some((c) => roundsOf(c.id))
      ? attackAsOne(standing.map((c) => combatValueOf(c, mirror)!))
      : null;
  const keep = kindForCard(known);

  // What the card is asking. Null when there is nothing to ask and the app can
  // simply do it. Nothing has been decided yet by definition — an answer given
  // here is sent, and what the card asks after it is the server's frame to put
  // up, not this panel's to guess at (see `sent`).
  const asking = instruction ? pendingIn(instruction, [], nature) : null;

  /* Kept for `inert` below: the line itself is `CardFacts`'s now, drawn from
     the same `requirementOf` against the same reader. What is asked here is
     narrower — not what the condition says, only whether this Postać fails it. */
  const needs = requirementOf(known.id, reader ?? { nature, aggression });

  /**
   * Nothing here for this Postać at all.
   *
   * A `gdy` whose condition they fail and whose other branch does nothing — the
   * WRÓŻKA met by a Zła Postać, the DOBRE BÓSTWO met by somebody who has raised
   * no hand. The shape is `inertFor`'s question and the verdict is
   * `requirementOf`'s; this only puts the two together.
   */
  const inert = inertFor(instruction ?? undefined, needs?.met === false);

  /**
   * Whose decision this is, as the table knows them — „Test (WIEDŹMA)".
   *
   * Everybody at the table is looking at this sheet and only one of them can
   * press anything, so every sentence in it has a second person and a third:
   * „Nie spełniasz warunków" for the one being asked, and the name for
   * everybody watching. Falling back to the player's name alone, for a device
   * that has not been told which Postać it is.
   */
  const actor = reader?.name ?? who;

  /**
   * What going somewhere else costs, said before it is chosen.
   *
   * 16.8's own worked example is the warning: Obbol is carried off the
   * Płaskowyż mid-deal and „nie zmierzy się już z Niedźwiedziem, ani nie
   * weźmie 2 Sztuk Złota — pozostaną one w formie odkrytej… stanowiąc 2 z 3
   * Kart dla następnej Postaci". Everything still standing on this Obszar is
   * forfeited at once: the rest of the kolejka, whatever is lying there, and
   * the Obszar's own desks.
   *
   * The count is the Karty this turn has not finished with, less the one being
   * resolved — it is going either way, „bez względu na to, czy skorzystasz".
   */
  const leavingHere = (to: FieldId) => {
    /* Asked through `listed`, like the pack above — `resolved` names a *copy*
       and `fought`/`beaten` name a card, and a bare `.includes` on the id gets
       the first of those wrong. Two Wilki on one Obszar are two Karty, and one
       of them being dealt with does not leave the other behind. */
    const left = cards.filter(
      (entry) =>
        entry.cardId !== known.id &&
        !listed(resolved, entry) &&
        !listed(fought, entry) &&
        !listed(beaten ?? [], entry),
    ).length;
    const stays =
      left > 0
        ? `Zostawiasz tu ${left} ${plural(left, "Kartę", "Karty", "Kart")} i wszystko, co na tym Obszarze leży — poczekają na następną Postać (16.8).`
        : "To, co na tym Obszarze leży, zostaje tu dla następnej Postaci (16.8).";
    return (
      `Obszar: ${fieldName(to)}. ${stays} ` +
      "Tam zaczniesz tak, jakby twój ruch skończył się na nowym Obszarze."
    );
  };

  /**
   * „Test (WIEDŹMA) wybiera: Tracisz 1 Sztukę Złota…"
   *
   * The option arrives as a number and is turned back into words *here*, out of
   * this device's own copy of the card — the same discipline as `Decisions`,
   * and the reason the sentence quotes the `Do wyboru:` line above it word for
   * word rather than approximately.
   *
   * Both ends read the same list, which is what makes the number mean the same
   * thing at both: every answer this panel sends is the first question of its
   * Karta, so the watching device walks to the very node the sender was looking
   * at. A question that comes after one is asked by a `script` frame, and that
   * panel says its own piece.
   */
  const chosen =
    intent?.option !== undefined && asking?.op === "wybor"
      ? (asking.options[intent.option]?.label ?? null)
      : null;
  const said = intent
    ? intentSaid(actor, intent.kind, chosen ? sentence(chosen) : null)
    : null;

  /**
   * No Wróg standing, nothing to pick up, and no question outstanding.
   *
   * Named because it is the condition two branches share and differ on only by
   * `inert` — written out twice, a fifth term would have had to be remembered
   * in both.
   */
  const nothingLeftToAsk = !foe && !keep && !asking;

  /**
   * The Karta the app throws a die for, rather than one anybody decides.
   *
   * Three things hang off it and each is the same argument from a different
   * side: the button says „Rzuć kostką" and carries a die, because that is what
   * pressing it does; the six outcomes are listed above it, because the player
   * is about to have one of them applied to them and the buttons — which are
   * what usually says what a Karta can do — say only „throw"; and the line the
   * rest of the table reads says he is rolling rather than deciding, since
   * there is nothing here to decide.
   */
  const rolls = nothingLeftToAsk && !inert && instruction?.op === "rzut";

  /**
   * What can come up, grouped as the card groups it.
   *
   * `DrawnCard` empties `special` for the player whose turn it is, on the
   * grounds that what a Karta does is what the buttons under it are — true of a
   * `wybor`, whose options are the buttons, and false of a die: one button and
   * six outcomes, none of them written anywhere the actor could read.
   *
   * The groups rather than the rendered rows, because a table that has been
   * thrown has to know which line the face landed in — and reading „3" back out
   * of „1-3 — przemykasz" is parsing our own output. `dieGroups` is that
   * grouping before it becomes a string.
   */
  const faces =
    rolls && instruction?.op === "rzut" ? dieGroups(instruction.faces) : [];

  /** What the face that came up says it does, so the outcome need not repeat it. */
  const saidByFace = (face: number) => faces.find((group) => group.on.includes(face))?.said;

  /**
   * The loss this Karta is waiting on, if it is this Karta's.
   *
   * Asked by card id for the same reason the die is: the sheet is held on the
   * Karta the question belongs to, and a mismatch would offer one Karta's pack
   * against another one's instruction.
   */
  const owing = losing && losing.cardId === card.cardId ? losing : null;

  /**
   * The die thrown for *this* Karta, if it is still waiting to be read.
   *
   * Asked by card id rather than taken on trust: the sheet is held on the Karta
   * whose die is up (`DrawModal`), and a mismatch would put one Karta's face
   * under another one's list.
   */
  const said6 = rolled && rolled.cardId === card.cardId ? rolled : null;

  /**
   * Whether walking away is one of the answers.
   *
   * Never for a Nieznajomy: 16.5 is flat and every one of them either gives you
   * something or happens to you. A Miejsce says otherwise itself — „Jeżeli
   * chcesz do niej wejść, rzuć kostką" is the Grota's own sentence, and that
   * die costs a turn on 4 and starts a fight on 5 or 6.
   */
  const skippable = classOf(known.id) !== "stranger" && mayWalkPast(known.id);

  return {
    known,
    script,
    instruction,
    foe,
    standing,
    asOne,
    keep,
    asking,
    inert,
    actor,
    leavingHere,
    said,
    nothingLeftToAsk,
    rolls,
    faces,
    saidByFace,
    owing,
    said6,
    skippable,
  };
}
