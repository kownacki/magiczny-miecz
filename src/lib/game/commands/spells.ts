/** A Zaklęcie from the moment it is spoken to the moment it lands or lapses (9.6, 9.7). */

import { immuneToSpell } from "@/lib/engine/abilities";
import { KAMIENNY_MOST, ringFields, ringOf, type FieldId } from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { refusesArms } from "@/lib/engine/cards";
import { suppressesSpells } from "@/lib/engine/holdings";
import {
  castableNow,
  momentsIn,
  spellScript,
  unattackableAfter,
  type SpellScript,
  whyNoSpells,
} from "@/lib/engine/spells";
import { SPELL_BY_ID } from "../decks";
import { cardName, fieldName } from "@/lib/engine/polish";
import { nameOfSeat } from "./lobby";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import { applyEffect, type Decisions } from "./effects";
import type { Effect } from "@/lib/engine/cardScript";
import { summariseEffect } from "@/lib/engine/effectText";
import { asReturnable, putOnPile } from "./piles";
import { replaceTop, top } from "@/lib/engine/stack";
import { allStatusesOf, refuseWhileHeld, seatView } from "./seat";
import { refuseAgainstStone } from "./stone";
import { FLOOR_MS, floorOf } from "./spellFloor";

import { storedStatuses } from "./turn";
import type { SeatRow } from "../store";
import { shutFight } from "./fight";
import { refuseWhileOverflow } from "./overflow";

/* --------------------------------------------------------------------------
 * Speaking into one.
 * ----------------------------------------------------------------------- */

export interface CastSpell {
  seatId: string;
  holdingId: string;
  target?: {
    seatIndex?: number;
    note?: string;
    fieldCardId?: string;
    fieldId?: FieldId;
    /**
     * The creature in the fight in progress — "na inną Postać lub Wroga", when
     * the Wróg is the one standing opposite rather than one lying on an Obszar.
     *
     * A flag rather than a card id, because that Wróg may be no row on the
     * board at all: a creature a Karta conjured, or 17.5's pack fighting as
     * one. What identifies it is the frame, and the frame is on the stack.
     */
    foeInFight?: true;
  };
  /** Answers a spell's own effect asks for, where it has one (`SpellScript.stosuje`). */
  decided?: Decisions;
  /** How a pile is shuffled, for the spells that draw. */
  shuffle?: Shuffle;
  /**
   * Set only by `speakCarriedSpell`, to reach a `carried` holding.
   *
   * A Zaklęcie lying with the Krzyżowiec is not in the hand and cannot be
   * spoken by the character — "Krzyżowiec ... użyje, gdy sobie tego zażyczysz",
   * and the Gnom wants paying first. Without the flag the ordinary cast would
   * reach both and the Gnom's Sztuka Złota would be optional.
   */
  viaFriend?: boolean;
}

export interface Cast {
  /** The card's printed name, for the notice the caster reads back. */
  spell: string;
  /** What the table now has to do, in the card's own words. */
  effect: string;
  /**
   * What actually happened, for the spells the app carries out.
   *
   * Empty for the ones it only announces, which is the difference a player
   * needs to see: "Fatum: −1 Miecza" is the app having thrown the die, and the
   * card's own sentence is the app handing the rule back. Printing the prose
   * for both made a spell that had been applied look like one that had not.
   */
  did?: readonly string[];
}

/**
 * The two spells the app carries out rather than reads aloud.
 *
 * Returns what it took, for the journal — a spell that says "wszystkie" needs
 * to say how many that turned out to be, or the table cannot check it.
 *
 * Both writes go to `game.deck`, so the snapshot handed in must already carry
 * the caster's own card onto the pile: two side-by-side `putOnPile` calls
 * merged rather than chained would keep only the second one's deck.
 */
function applySpell(
  snapshot: Snapshot,
  applies: NonNullable<SpellScript["applies"]>,
  target: { seatIndex?: number; fieldCardId?: string },
): { writes: Changeset; took: string[] } {
  if (applies === "gasi-zaklecia") {
    if (target.seatIndex === undefined) throw new Error("Wskaż Postać (9.6).");
    const victim = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
    if (!victim) throw new Error("Nie ma takiej Postaci.");
    // 20.5: "Na taką Postać nie można rzucać Zaklęć."
    refuseAgainstStone(snapshot, victim.id, "spell");

    // The whole hand, "unicestwienie wszystkich posiadanych przez ofiarę
    // Zaklęć" — and then, in the card's own next breath, "należy odłożyć ich
    // Karty", which is why this is applied at all.
    const hand = snapshot.holdings.filter(
      (h) => h.seat_id === victim.id && h.kind === "spell",
    );
    if (hand.length === 0) return { writes: {}, took: [] };

    const emptied: Changeset = { holdings: { delete: hand.map((h) => h.id) } };
    const back = putOnPile(apply(snapshot, emptied), "spells", hand.map(asReturnable));
    return { writes: merge(emptied, back), took: hand.map((h) => h.card_id) };
  }

  // "zdjąć z planszy jedną odkrytą Kartę Zdarzeń." Off the board is not out of
  // the game: 16.8 put it there face up and the used pile is the only other
  // place a Karta Zdarzeń has to be.
  if (target.fieldCardId === undefined) throw new Error("Wskaż Kartę na planszy.");
  const lying = snapshot.fieldCards.find((row) => row.id === target.fieldCardId);
  if (!lying) throw new Error("Tej Karty już tam nie ma.");

  const lifted: Changeset = { fieldCards: { delete: [lying.id] } };
  const back = putOnPile(apply(snapshot, lifted), "events", [asReturnable(lying)]);
  return { writes: merge(lifted, back), took: [lying.card_id] };
}

/**
 * Speaks a Zaklęcie (9.6).
 *
 * The card leaves the caster's hand for the used pile and the table is told
 * what was cast and at whom. What the spell *does* is not applied: these are
 * the most interconnected cards in the box — Zwierciadło reflects whatever was
 * just cast, Władca Zaklęć negates it, Wojna Żywiołów switches every spell and
 * magic item off until the caster's next turn — and a referee that got one of
 * those subtly wrong would be worse than one that stayed out of it.
 *
 * Two spells are applied rather than announced, and `SpellScript.applies` says
 * which and why: both take *cards* out of play, and where a card goes when it
 * leaves is the one thing at this table only the app knows. Announcing those
 * and stepping back means the cards never reach the used pile, and 9.5 refills
 * the deck from that pile.
 *
 * 9.7 is the one hard prohibition and is enforced: nothing works on the
 * creatures of the Kamienny Most, nor on the Bestia.
 *
 * No dice — a Zaklęcie is spoken, never rolled — but it reads the clock,
 * because the claim on the floor lapses (17.3).
 */
/**
 * The Zaklęcie in the air right now, whoever spoke it.
 *
 * NOTE, for whoever builds the resolution stack: this is the `cast` frame of
 * docs/STACK.md's law 4, done in the small. A spoken spell has to wait
 * *somewhere* for an answer, and with one frame of turn state and no stack the
 * only place that survives a phase change is a status on the seat. When the
 * stack lands, a cast becomes a frame pushed above whatever it was spoken into
 * and this status should go with the old mechanism — the behaviour is the same
 * and the tests below are the specification of it.
 *
 * Read across the table rather than off one seat: the answer comes from
 * somebody else, and „rzuconego bezpośrednio przed nim" is about the last thing
 * said at the table, not about the answerer's own history. Past its window it
 * is nobody's to answer and this stops finding it.
 */
function standingSpell(
  snapshot: Snapshot,
  now: number,
): {
  seatId: string;
  id: string;
  spell: string;
  until: number;
  target: NonNullable<CastSpell["target"]>;
  decided: Decisions | undefined;
} | null {
  for (const row of snapshot.effects) {
    const modifier = row.modifier as { kind: string } & Record<string, unknown>;
    if (modifier.kind !== "spoken") continue;
    if ((modifier.until as number) <= now) continue;
    return {
      seatId: row.seat_id,
      id: row.id,
      spell: modifier.spell as string,
      until: modifier.until as number,
      target: (modifier.target ?? {}) as NonNullable<CastSpell["target"]>,
      decided: modifier.decided as Decisions | undefined,
    };
  }
  return null;
}

/**
 * Whether anybody but this seat is holding something that could answer.
 *
 * The whole reason a spell ever waits. Reactive Zaklęcia are two cards in a
 * deck of thirty, so most of the time this is false and a spell simply happens
 * — which is both faster and what a table would do.
 */
function couldAnswer(snapshot: Snapshot, casterId: string): boolean {
  return snapshot.holdings.some((one) => {
    if (one.seat_id === casterId) return false;
    if (one.kind !== "spell" && one.kind !== "carried") return false;
    const seat = snapshot.seats.find((row) => row.id === one.seat_id);
    if (!seat || seat.eliminated) return false;
    return spellScript(one.card_id)?.reactive === true;
  });
}

/**
 * Answering the Zaklęcie in the air: negating it, or turning it round.
 *
 * WŁADCA ZAKLĘĆ „neguje działanie każdego innego (bez wyjątku) Zaklęcia,
 * rzuconego bezpośrednio przed nim" — so the spell in the air simply never
 * happens, and both cards are spent. ZWIERCIADŁO „odbije każde inne Zaklęcie
 * rzucone na Postać na tego, kto je rzucił" — it happens, to its own caster,
 * and anything it takes is taken for the one holding the mirror.
 *
 * The Zwierciadło answers only what was aimed at the seat holding it: „rzucone
 * na Postać" is the spell landing on *you*, and a mirror is not a shield for
 * the table.
 */
async function answerSpell(
  snapshot: Snapshot,
  input: {
    cast: Changeset;
    caster: SeatRow;
    answering: string;
    answerName: string;
    waiting: NonNullable<ReturnType<typeof standingSpell>>;
    shuffle?: Shuffle;
    ports: CommandPorts;
  },
): Promise<Outcome<Cast>> {
  const { cast, caster, waiting, ports } = input;
  const spentAnswer = merge(cast, { effects: { delete: [waiting.id] } });
  const said = (payload: Record<string, unknown>): Changeset => ({
    journal: [
      {
        seatId: caster.id,
        round: snapshot.game.round,
        kind: "spell",
        payload: { cardId: input.answering, name: input.answerName, ...payload },
      },
    ],
  });
  const answered = cardName(waiting.spell);

  if (input.answering === "zwierciadlo") {
    if (waiting.target.seatIndex !== caster.seat_index) {
      throw new Error(`${answered} nie zostało rzucone na ciebie — nie ma czego odbić.`);
    }
    const back = snapshot.seats.find((one) => one.id === waiting.seatId);
    if (!back) throw new Error("Nie ma takiego gracza.");
    const landed = await landSpell(
      apply(snapshot, spentAnswer),
      {
        casterId: waiting.seatId,
        cardId: waiting.spell,
        // Turned round: it lands on the one who spoke it, and what it takes is
        // taken for the one who held the mirror.
        target: { ...waiting.target, seatIndex: back.seat_index },
        ...(waiting.decided ? { decided: waiting.decided } : {}),
        toSeatId: caster.id,
        shuffle: input.shuffle,
      },
      ports,
    );
    return {
      writes: mergeAll(
        spentAnswer,
        landed.writes,
        said({ odbite: answered, target: nameOfSeat(snapshot.users, back.seat_index) }),
      ),
      result: {
        spell: input.answerName,
        effect: `${answered} wraca na tego, kto je rzucił.`,
        did: landed.did.length > 0 ? landed.did : [`${answered} odbite`],
      },
    };
  }

  /**
   * The Władca Zaklęć with nothing to negate lifts what a Zaklęcie put on you.
   *
   * „Nie może zrobić nic poza użyciem Władcy Zaklęć (co zaneguje działanie
   * Kręgu Płomieni)" — the flames end `dispelled`, and this is the only thing
   * in the box that dispels. Which is why the card is worth speaking even when
   * nothing is in the air.
   */
  return {
    writes: mergeAll(spentAnswer, said({ zanegowane: answered })),
    result: {
      spell: input.answerName,
      effect: `${answered} nie działa (9.6).`,
      did: [`${answered} zanegowane`],
    },
  };
}

/**
 * What a Zaklęcie does once it is going to happen.
 *
 * Split out of `castSpell` because there are now two moments it can be reached
 * from and they must do the same thing: a spell nobody could answer takes
 * effect as it is spoken, and one that waited out its window takes effect when
 * the window closes. A second copy of this would be two spells.
 *
 * The card is already spent by the caller — this is only the effect — and the
 * snapshot handed in is the one that already has it on the pile.
 */
async function landSpell(
  snapshot: Snapshot,
  input: {
    casterId: string;
    cardId: string;
    target: NonNullable<CastSpell["target"]>;
    decided?: CastSpell["decided"];
    shuffle?: Shuffle;
    /**
     * Who gains, where a Zaklęcie takes a card rather than destroying it.
     *
     * The caster, except when the spell was turned round: a Zwierciadło sends
     * the Szaleństwo back, and what it takes is taken *for the one holding the
     * mirror*.
     */
    toSeatId?: string;
  },
  ports: CommandPorts,
): Promise<{ writes: Changeset; did: string[]; took?: string[]; pending?: Effect; stopped?: true }> {
  const { target } = input;
  const caster = snapshot.seats.find((one) => one.id === input.casterId);
  if (!caster) throw new Error("Nie ma takiego gracza.");
  const script = spellScript(input.cardId);
  const spell = SPELL_BY_ID.get(input.cardId);
  if (!script) return { writes: {}, did: [] };

  // Chained, not merged: a Władca Czarów puts a whole second hand on the same
  // `game.deck` the card itself was just put on, and side by side one of the
  // two would be dropped without a word.
  const applied = script.applies ? applySpell(snapshot, script.applies, target) : null;

  const named =
    target.seatIndex !== undefined
      ? snapshot.seats.find((one) => one.seat_index === target.seatIndex)
      : undefined;
  const onSeat = named?.id ?? caster.id;

  /**
   * Aimed at a Karta, by an effect that lands on a seat.
   *
   * „Na inną Postać lub Wroga" is two targets and the app can hold one of them:
   * a creature lying on an Obszar has no seat to carry a status. Left to fall
   * through, `onSeat` would default to the caster — so the Krąg Płomieni thrown
   * at a Cyklop would have set the caster alight.
   *
   * So the effect is skipped and the card is announced, which is what every
   * untranscribed Zaklęcie already does: the sentence goes back to the table
   * and the players apply it. Two ops read the Karta themselves and are the
   * exception — one sends a creature at it, the other moves it.
   */
  const aimedAtCard =
    target.fieldCardId !== undefined &&
    script.stosuje !== undefined &&
    script.stosuje.op !== "przyzwij" &&
    script.stosuje.op !== "przenies-karte";

  /**
   * A victim the Zaklęcie does nothing to (the two Talizmany).
   *
   * "Talizman Ognia daje odporność na Zaklęcie Krąg Płomieni", and the Talizman
   * Powietrza says the same of the Siedem Wichrów and the Władca Gromu. Read
   * off the *victim* — the caster's own Talizman is no defence against their
   * own spell, which is the only reading of "daje odporność" that means
   * anything.
   *
   * The card is still spent. 9.6 puts it on the used pile as it is spoken, and
   * a Zaklęcie that bounced is still a Zaklęcie you no longer have — the same
   * bargain a negated one makes.
   */
  const shielded =
    named !== undefined &&
    immuneToSpell(seatView(snapshot, named.id).abilities, input.cardId);
  if (shielded) {
    return {
      writes: applied?.writes ?? {},
      did: [`${nameOfSeat(snapshot.users, named.seat_index)}: odporność — Zaklęcie nie działa.`],
      ...(applied ? { took: applied.took } : {}),
    };
  }

  const worked =
    !aimedAtCard && script.stosuje
      ? await applyEffect(
          apply(snapshot, applied?.writes ?? {}),
          {
            seatId: onSeat,
            toSeatId: input.toSeatId ?? caster.id,
            ...(target.fieldCardId !== undefined ? { fieldCardId: target.fieldCardId } : {}),
            ...(target.fieldId !== undefined ? { fieldId: target.fieldId } : {}),
            effect: script.stosuje,
            reason: spell?.name ?? input.cardId,
            decided: input.decided,
            shuffle: input.shuffle ?? ((items) => [...items]),
          },
          ports,
        )
      : null;

  /**
   * A Zaklęcie that ends the fight it was spoken into (law 4, docs/STACK.md).
   *
   * "Ofiary nie można zaatakować, jednak można się jej wymknąć" — so a fight
   * against somebody the Krąg has just closed round cannot go on, and the
   * comparison 17.4 is waiting for will never happen. Either side counts: the
   * victim may be the creature standing opposite or the character fighting it,
   * and a fight one of whose two sides cannot be attacked is over either way.
   *
   * What it leaves behind is what walking away leaves behind. The frame pops
   * and `endFight` writes the creature into the field's `fought`, so this turn
   * is done with it (17.4) and it is still lying there for whoever comes next
   * (16.8) — no dice, no point of Życie, no trophy. A `loop` beneath closes
   * with it and its heads grow back, which is law 3 meeting law 4, and is
   * moment 8 of the acceptance test.
   *
   * Here rather than in `castSpell` for the reason at the top of this function:
   * a spell nobody could answer lands as it is spoken and one that waited out
   * its window lands through `settleSpell`, and a second copy of this rule
   * would be two Kręgi Płomieni.
   */
  const running = apply(snapshot, mergeAll(applied?.writes ?? {}, worked?.writes ?? {}));
  const frame = top(running.game.turn_state);
  const stopped =
    frame.phase === "fight" &&
    unattackableAfter(script) &&
    (target.foeInFight === true ||
      (named !== undefined &&
        (named.seat_index === frame.fight.opponentSeat ||
          named.seat_index === snapshot.game.active_seat)));

  const broke: Changeset = stopped
    ? { game: { turn_state: shutFight(running.game.turn_state, frame) } }
    : {};

  return {
    writes: mergeAll(applied?.writes ?? {}, worked?.writes ?? {}, broke),
    did: [
      ...(worked?.result.did ?? []),
      ...(stopped ? [`walka przerwana — ${frame.fight.cardName} nie da się zaatakować (19.1)`] : []),
    ],
    ...(applied ? { took: applied.took } : {}),
    ...(stopped ? { stopped: true as const } : {}),
    // What the effect still wants answered. The caller decides what to do with
    // it, and for a cast the answer is "nothing yet" — see `castSpell`.
    ...(worked?.result.pending ? { pending: worked.result.pending } : {}),
  };
}

export async function castSpell(
  snapshot: Snapshot,
  command: CastSpell,
  ports: CommandPorts,
): Promise<Outcome<Cast>> {
  const target = command.target ?? {};
  const caster = snapshot.seats.find((s) => s.id === command.seatId);
  if (!caster) throw new Error("Nie ma takiego gracza.");

  /**
   * A surplus on the stack stops this too, and it was the one verb it did not.
   *
   * Every other act in the game already owes the frame this sentence — `deal`,
   * a move, anything in `holdings` — and casting was left out, so a hand over
   * 2.6 could go on speaking Zaklęcia while the whole table sat on „Gra czeka".
   * That was an omission rather than a decision: nothing in 9.4 or 2.6 carves
   * casting out.
   *
   * It reads as a rule too, and the right one. 2.6 says the nadwyżka goes
   * *natychmiast* — before anything else happens — and a Zaklęcie is not
   * housekeeping. It lands on another player wherever they are standing (9.6),
   * so allowing it here would let somebody over the limit take an act against
   * the table while the table is stopped waiting for them. Putting a Karta on
   * the stos is not an act in the game; speaking one is.
   *
   * Which leaves exactly one way back under, and `waysUnder` has always said so
   * — it offers `odrzuc` for a spell and nothing else. The refusal's own
   * sentence used to offer both and now agrees with the list.
   */
  refuseWhileOverflow(snapshot, command.seatId);

  const held = snapshot.holdings.find(
    (h) =>
      h.id === command.holdingId &&
      h.seat_id === command.seatId &&
      (h.kind === "spell" || (command.viaFriend === true && h.kind === "carried")),
  );
  if (!held) throw new Error("Ta Postać nie ma tego Zaklęcia.");

  const script = spellScript(held.card_id);
  const spell = SPELL_BY_ID.get(held.card_id);

  // 9.7: "Żadne Zaklęcie nie działa na istoty napotkane na Kamiennym Moście ani
  // na samą Bestię." Where the caster stands is what decides it.
  /**
   * The four bans that stop *every* Zaklęcie, asked in one place.
   *
   * "Nie możesz też rzucać Zaklęć" (Zaczarowane Wzgórza) and "Nie możesz tu
   * używać Zaklęć" (Rozstajne Drogi II) — asked of the Obszar's own list rather
   * than of the Przedmiot one, since the Wzgórza carry both rules and the two
   * Rozstajne Drogi carry one apiece. The Wojna Żywiołów's „żaden gracz, łącznie
   * z tobą", which refuses even the caster who spoke it. The Kryształ Magów's
   * half of its own bargain. And a freeze with no exemption printed on it —
   * 20.5's Kamień, which is the one of the four the rack could not see.
   *
   * Moved into `whyNoSpells` because the spell hand has to ask the same
   * question to grey itself, and two lists of four bans would be four chances
   * to disagree about whether a card is castable.
   */
  const noSpells = whyNoSpells({
    fieldName: suppressesSpells(caster.field_id)
      ? fieldName(caster.field_id as FieldId)
      : null,
    statuses: allStatusesOf(snapshot, caster.id),
    abilities: seatView(snapshot, caster.id).abilities,
  });
  if (noSpells) throw new Error(noSpells);

  const onTheBridge = caster.field_id ? ringOf(caster.field_id) === KAMIENNY_MOST : false;
  const aimedAtSomethingThere =
    script?.target === "wrog" || script?.target === "postac-lub-wrog";
  if (onTheBridge && aimedAtSomethingThere) {
    throw new Error("Na Kamiennym Moście Zaklęcia nie działają na tutejsze istoty (9.7).");
  }

  /**
   * In a fight, the floor is asked for first and then spoken into.
   *
   * Two things fall out of that. Nobody speaks over anybody — the claim is
   * exclusive, so a spell cannot land while somebody else is choosing one — and
   * there is no need to guess who might want to answer, because answering is
   * itself a claim. WŁADCA ZAKLĘĆ negates "każdego innego (bez wyjątku)
   * Zaklęcia, rzuconego bezpośrednio przed nim" and ZWIERCIADŁO reflects one
   * back at whoever spoke it, so an answer to an answer has to be possible, and
   * a single window before the dice could never hold that.
   */
  const state = top(snapshot.game.turn_state);
  const inAFight = state.phase === "fight";

  /**
   * "Przeciw Przybyszowi nie można używać Zaklęć" — the third of his three
   * refusals, and the one that is not a number in anybody's total.
   *
   * Refused where the Zaklęcie is spoken rather than where it lands, because
   * what the card bars is the *using*: a spell spoken into his fight is barred
   * whatever it would have done, and 9.6 would otherwise have spent the Karta
   * on the way to doing nothing.
   */
  if (state.phase === "fight" && refusesArms(state.fight.fought ?? [state.fight.cardId])) {
    throw new Error(`${state.fight.cardName}: nie można tu używać Zaklęć.`);
  }

  // 9.1: a Zaklęcie has a moment it may be spoken in. The interface greys the
  // card out, which stops an honest player and nobody else — a request that
  // simply arrives was carried out whatever the turn was doing.
  //
  // An untranscribed Zaklęcie has no script and is not refused: card data is a
  // progressive enhancement, so a card the app cannot read is one the table
  // rules on, not one the app forbids.
  if (script && !castableNow(script, momentsIn(state))) {
    throw new Error("Nie ta chwila na to Zaklęcie (9.1).");
  }

  /**
   * Held, and speaking the one thing that lets you out.
   *
   * „Nie może zrobić nic poza użyciem Władcy Zaklęć (co zaneguje działanie
   * Kręgu Płomieni)" — so this door takes the card being spoken and the status
   * decides, rather than a branch here knowing which Zaklęcie is the key.
   */
  refuseWhileHeld(snapshot, caster.id, held.card_id);

  /**
   * The Władca Zaklęć with nothing in the air: it lifts what a Zaklęcie left.
   *
   * „Co zaneguje działanie Kręgu Płomieni" — the flames end `dispelled`, and
   * this card is the only thing in the box that dispels anything. Without it
   * the one way out of the Krąg was a status nothing could lift, which is a
   * character nothing could move.
   */
  if (held.card_id === "wladca-zaklec" && !standingSpell(snapshot, ports.now())) {
    const lifted = storedStatuses(snapshot, caster.id).filter(
      (status) => status.ends.kind === "dispelled",
    );
    if (lifted.length > 0) {
      const spentCard: Changeset = { holdings: { delete: [held.id] } };
      const back = putOnPile(apply(snapshot, spentCard), "spells", [asReturnable(held)]);
      return {
        writes: mergeAll(spentCard, back, {
          effects: { delete: lifted.map((status) => status.id) },
          journal: [
            {
              seatId: caster.id,
              round: snapshot.game.round,
              kind: "spell",
              payload: {
                cardId: held.card_id,
                name: spell?.name ?? held.card_id,
                zanegowane: lifted.map((status) => status.label).join(", "),
              },
            },
          ],
        }),
        result: {
          spell: spell?.name ?? held.card_id,
          effect: `${lifted.map((status) => status.label).join(", ")} — zdjęte.`,
          did: lifted.map((status) => `${status.label} zdjęte`),
        },
      };
    }
  }

  if (state.phase === "fight") {
    const floor = floorOf(state.fight, ports.now());
    if (!floor || floor.seat !== caster.seat_index) {
      throw new Error(
        floor
          ? "Teraz rzuca kto inny — poczekaj na swoją kolej."
          : "Najpierw zgłoś, że chcesz rzucić Zaklęcie (17.3).",
      );
    }
  }

  // Back to the used pile, so the spell deck can be reshuffled honestly (9.5).
  // 9.6: "reprezentująca je Karta jest odkładana na stos Kart już zużytych."
  const spent: Changeset = { holdings: { delete: [held.id] } };
  const returned = putOnPile(apply(snapshot, spent), "spells", [asReturnable(held)]);
  const cast = merge(spent, returned);

  /**
   * A Zaklęcie already spoken and still in the air, if there is one.
   *
   * Two cards answer one — the Władca Zaklęć negates „każdego innego (bez
   * wyjątku) Zaklęcia, rzuconego bezpośrednio przed nim", the Zwierciadło sends
   * one „na tego, kto je rzucił" — and both need the spell to be *pending*,
   * which nothing in this engine was until now.
   */
  const waiting = standingSpell(snapshot, ports.now());

  if (waiting && script?.reactive) {
    return answerSpell(snapshot, {
      cast,
      caster,
      answering: held.card_id,
      answerName: spell?.name ?? held.card_id,
      waiting,
      shuffle: command.shuffle,
      ports,
    });
  }

  /**
   * Two things about the aim, asked where the aiming happens.
   *
   * A spell whose target is somebody else — „na wybraną Postać", „na inną
   * Postać" — reaching nobody must not quietly land on the caster instead: that
   * is the difference between a Siedem Wichrów and a Siedem Wichrów aimed at
   * your own pack. And „na Obszar w Kręgu, po którym wędrujesz" is the Władca
   * Gromu's own range — 9.6 lets a Zaklęcie reach anywhere on the board, and
   * that one card narrows it.
   */
  const named =
    target.seatIndex !== undefined
      ? snapshot.seats.find((one) => one.seat_index === target.seatIndex)
      : undefined;
  if (script?.stosuje && !named && script.target === "postac") {
    throw new Error(`${spell?.name ?? held.card_id} — wskaż Postać, na którą rzucasz.`);
  }
  if (target.fieldId !== undefined) {
    if (!ringFields(caster.field_id as FieldId).includes(target.fieldId)) {
      throw new Error(`${fieldName(target.fieldId)} jest poza twoim Kręgiem.`);
    }
  }

  /**
   * Spoken, and left in the air for as long as anybody can answer it.
   *
   * Only when they can: with no reactive Zaklęcie in another hand there is
   * nothing to wait for, and holding every cast for half a minute would make
   * the common case — which is almost every cast in almost every game — worse
   * for nothing. The window is the fight floor's, because it is the same
   * question asked at a different moment: how long is long enough to read a
   * hand and decide.
   *
   * The card is spent either way. 9.6 puts it on the used pile as it is spoken,
   * and a Zaklęcie negated is still a Zaklęcie you no longer have.
   */
  if (!script?.reactive && couldAnswer(snapshot, caster.id)) {
    const heldBack: Changeset = {
      effects: {
        insert: [
          {
            seat_id: caster.id,
            source: spell?.name ?? held.card_id,
            label: `${spell?.name ?? held.card_id} — w powietrzu`,
            modifier: {
              kind: "spoken",
              spell: held.card_id,
              until: ports.now() + FLOOR_MS,
              ...(Object.keys(target).length > 0 ? { target } : {}),
              // Everything the caster has already answered travels with it —
              // see the modifier's own note.
              ...(command.decided ? { decided: command.decided } : {}),
            },
            ends: { kind: "dispelled" },
          },
        ],
      },
    };
    return {
      writes: mergeAll(cast, heldBack, {
        journal: [
          {
            seatId: caster.id,
            round: snapshot.game.round,
            kind: "spell",
            payload: {
              cardId: held.card_id,
              name: spell?.name ?? held.card_id,
              ...(target.seatIndex !== undefined
                ? { target: nameOfSeat(snapshot.users, target.seatIndex) }
                : {}),
              ...(target.note ? { note: target.note } : {}),
              pending: true,
            },
          },
        ],
      }),
      result: {
        spell: spell?.name ?? held.card_id,
        effect: script?.effect ?? spell?.text ?? "",
        did: ["wypowiedziane — czekamy, czy ktoś odpowie"],
      },
    };
  }

  const landed = await landSpell(
    apply(snapshot, cast),
    {
      casterId: caster.id,
      cardId: held.card_id,
      target,
      decided: command.decided,
      shuffle: command.shuffle,
    },
    ports,
  );
  /**
   * An answer the card still wants, and the card not yet spent.
   *
   * `applyEffect` hands back what it could not carry out — the Władca Zdarzeń
   * asks where the Karta goes — and `landSpell` used to drop it on the floor:
   * the changeset would commit with the Zaklęcie on the used pile and nothing
   * having happened. Throwing writes nothing at all, which is the one property
   * of a Command that makes this safe to get wrong: the hand is untouched and
   * the caster casts again with the answer.
   */
  if (landed.pending) {
    throw new Error(
      `${spell?.name ?? held.card_id} — ${summariseEffect(landed.pending)}: wskaż to i rzuć jeszcze raz.`,
    );
  }

  const applied = landed.took !== undefined ? { took: landed.took } : null;
  const worked = landed.did.length > 0 ? { result: { did: landed.did } } : null;

  const victim =
    target.seatIndex !== undefined
      ? nameOfSeat(snapshot.users, target.seatIndex)
      : null;

  const said: Changeset = {
    journal: [
      {
        seatId: caster.id,
        round: snapshot.game.round,
        kind: "spell",
        payload: {
          cardId: held.card_id,
          name: spell?.name ?? held.card_id,
          ...(victim ? { target: victim } : {}),
          ...(target.note ? { note: target.note } : {}),
          ...(applied ? { took: applied.took } : {}),
        },
      },
    ],
  };

  const soFar = mergeAll(cast, landed.writes, said);

  /**
   * A spell spoken puts the fight back where it started, and hands the floor
   * back to the table.
   *
   * 17.3 has the spells before the roll, so a fight that has been spoken into
   * has not been rolled yet — and if it had been, the spell would be arriving
   * after the thing it was meant to change. Clearing the dice is what makes the
   * next claim mean something: whoever wants to answer this can, and the
   * fighting player rolls into the fight as it now stands rather than as it
   * stood before anybody spoke.
   *
   * This is where the store read the games row a second time, because
   * `returnToPile` had written it underneath: it re-read to avoid clobbering
   * the deck it had just put a card on. As one changeset the two writes are
   * different keys of one `game` patch, so the second read collapses into
   * `apply` and the whole command is decided against a single snapshot.
   */
  const afterState = apply(snapshot, soFar).game.turn_state;
  const after = top(afterState);

  /**
   * A fight spoken into goes back to before the dice, and the floor is handed
   * back to the table — unless the Zaklęcie ended the fight outright, in which
   * case `landSpell` has already popped the frame and there is nothing here to
   * put back. See its note on why that decision lives there.
   */
  const cleared: Changeset =
    inAFight && !landed.stopped && after.phase === "fight"
      ? {
          game: {
            turn_state: replaceTop(afterState, {
              ...after,
              fight: {
                ...after.fight,
                caster: null,
                playerRoll: null,
                enemyRoll: null,
                result: null,
              },
            }),
          },
        }
      : {};

  return {
    writes: merge(soFar, cleared),
    result: {
      spell: spell?.name ?? held.card_id,
      ...(worked && worked.result.did.length > 0 ? { did: worked.result.did } : {}),
      effect: script?.effect ?? spell?.text ?? "",
    },
  };
}

/**
 * A Zaklęcie nobody answered, taking effect.
 *
 * The other end of the window: `castSpell` leaves a spell in the air when
 * somebody at the table is holding something that could answer it, and this is
 * what happens when nobody does. Called by whoever is watching the clock — the
 * table's own device, or any player's — because a spell that waits for ever is
 * worse than one that lands too soon.
 *
 * Nothing before the window closes: answering is the whole point of the pause,
 * and settling early would take the answer away. `force` is the table saying
 * out loud that nobody is going to — the same shortcut `releaseFloor` is for a
 * claim nobody wants any more.
 */
export async function settleSpell(
  snapshot: Snapshot,
  command: { force?: boolean } = {},
  ports: CommandPorts,
): Promise<Outcome<Cast | null>> {
  // Found whatever the clock says, and *then* asked about the clock: a spell
  // whose window has closed is exactly the one this is here to settle, and
  // `standingSpell` hides those from the answering path on purpose.
  const waiting = standingSpell(snapshot, -Infinity);
  if (!waiting) {
    // Nothing in the air is not an error: two devices watching one clock will
    // both call this, and the second one has nothing to do.
    return { writes: {}, result: null };
  }
  if (!command.force && waiting.until > ports.now()) {
    return { writes: {}, result: null };
  }

  const dropped: Changeset = { effects: { delete: [waiting.id] } };
  const landed = await landSpell(
    apply(snapshot, dropped),
    {
      casterId: waiting.seatId,
      cardId: waiting.spell,
      target: waiting.target,
      ...(waiting.decided ? { decided: waiting.decided } : {}),
    },
    ports,
  );
  const spell = SPELL_BY_ID.get(waiting.spell);
  return {
    writes: mergeAll(dropped, landed.writes, {
      journal: [
        {
          seatId: waiting.seatId,
          round: snapshot.game.round,
          kind: "spell",
          payload: {
            cardId: waiting.spell,
            name: spell?.name ?? waiting.spell,
            // Told apart from the line written when it was spoken: one says it
            // was said, this says it happened.
            settled: true,
          },
        },
      ],
    }),
    result: {
      spell: spell?.name ?? waiting.spell,
      effect: spellScript(waiting.spell)?.effect ?? spell?.text ?? "",
      ...(landed.did.length > 0 ? { did: landed.did } : {}),
    },
  };
}
