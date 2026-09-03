/** A fight from the moment it opens to the moment somebody walks away from it (17.3-17.7, 19). The Zaklęcia spoken into one are ./spells. */

import { isFoeClass } from "@/data/types";
import type { SpellId } from "@/data/ids";
import {
  bestShield,
  canEscapeAt,
  diesForYou,
  heldAbilities,
  rollModifier,
  insteadAgainst,
  beatsWithoutFighting,
  raidsForYou,
  type EscapeTarget,
} from "@/lib/engine/abilities";
import {
  asFieldId,
  foeBonusAt,
  KAMIENNY_MOST,
  ringFields,
  ringOf,
  type FieldId,
} from "@/lib/engine/board";
import { RAID_RANGE, withinRaid } from "@/lib/engine/raid";
import { BRIDGE_ORDEAL, BRIDGE_SIDE } from "@/lib/engine/bridge";
import { combatValueOf, isArms, refusesArms, roundsOf } from "@/lib/engine/cards";
import { openLoop, settleExposedLoop } from "@/lib/engine/loop";
import { attackAsOne, type CombatKind } from "@/lib/engine/combat";
import { abilitiesOfCharacter, asCharacterId } from "@/lib/engine/characters";
import { bonusFromHoldings, inEffect } from "@/lib/engine/holdings";
import {
  endFight,
  recordFightRoll,
  setFightTotal,
  startFight,
  type TurnPhase,
} from "@/lib/engine/turn";
import { EVENTS, SPELL_BY_ID } from "../decks";
import { cardName } from "@/lib/engine/polish";
import { nameOfSeat } from "./lobby";
import {
  apply,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import { liftOffField } from "./holdings";
import { asReturnable, putOnPile } from "./piles";
import {
  only,
  pop,
  push,
  replaceTop,
  requireTop,
  top,
  type TurnState,
} from "@/lib/engine/stack";
import { activeSeat, eqModeOf, holdingsOf, pointsOf, seatById, seatView } from "./seat";
import { refuseAgainstStone } from "./stone";
import { slotsFor } from "@/lib/engine/slots";
import { floorOf } from "./spellFloor";
import { addEffect, refuseAgainst13_2, refuseWhileUndrawn, storedStatuses } from "./turn";

/**
 * The one Zaklęcie the rules name inside another rule.
 *
 * 19.1 does not say "a spell that lets you escape" — it says the Krąg Płomieni,
 * by name, and it is the only way in the game to slip away from another Postać.
 * So it is looked up here rather than left to the generic casting path, which
 * has nowhere to put a mechanical effect.
 */
const KRAG_PLOMIENI: SpellId = "krag-plomieni";

/* --------------------------------------------------------------------------
 * Opening one.
 * ----------------------------------------------------------------------- */

export interface BeginFight {
  /** The creatures being taken on at once, which 17.5 may make one opponent. */
  cardIds: readonly string[];
}

/**
 * Squares up to what was drawn on this field (17.4, 17.5).
 *
 * No dice. 17.3 puts the Zaklęcia before the roll, so opening a fight only sets
 * the numbers up and leaves the floor empty for whoever wants to speak into it
 * — nobody is polled and nobody is named (see `claimFloor`).
 */
/**
 * The character's fight figure, with the cards that are worth more against
 * *these* Wrogowie counted at their other value.
 *
 * Arondight and the Topór both "dodaje właścicielowi 1 punkt Miecza, a w walce
 * z Wilkołakiem - 2 punkty Miecza", and the second figure replaces the first:
 * two points against a Wilkołak, not three. So each swapped card has its
 * ordinary contribution taken back out and the other one put in, which is why
 * `bonusFromHoldings` is asked about that one card on its own.
 *
 * Everything else comes through `pointsOf` untouched — this is a correction to
 * one card's worth, not a second way of adding up a character.
 */
export function againstThese(
  snapshot: Snapshot,
  seatId: string,
  foeIds: readonly string[],
): { miecz: number; magia: number } {
  const total = pointsOf(snapshot, seatId, "walka");
  const view = seatView(snapshot, seatId);
  const mode = eqModeOf(snapshot.game);
  const inPlay = inEffect(view.holdings, mode, view.nature);

  /**
   * The Przybysz z Krainy Cieni, who refuses most of what you are holding.
   *
   * "Przeciw Przybyszowi nie można używać Zaklęć, Magicznych Przedmiotów ani
   * Broni." Two of the three are cards in the sum and come out of it here; the
   * Zaklęcia are refused where they are spoken, in `castSpell`, because a
   * Zaklęcie is not a number in this total.
   *
   * What is left is the character's own Miecz and the things that are neither
   * — a Tarcza, a Hełm, a Zbroja, a Przyjaciel — which is what the card leaves
   * you and rather more than "walczy się samym Mieczem" would have.
   */
  const bare = refusesArms(foeIds);
  const barred = bare
    ? inPlay.filter((held) => held.kind === "item" && isArms(held.cardId, slotsFor(held.cardId)))
    : [];

  const swapped = insteadAgainst(
    inPlay.map((held) => held.cardId),
    foeIds,
  );
  if (swapped.length === 0 && barred.length === 0) return total;

  let { miecz, magia } = total;
  for (const held of barred) {
    const lent = bonusFromHoldings([held], mode, "walka", view.fieldId, view.nature);
    miecz -= lent.miecz;
    magia -= lent.magia;
  }
  const gone = new Set(barred.map((held) => held.cardId));
  for (const swap of swapped) {
    // A card the creature refuses is worth nothing against it, including its
    // other figure. The two cannot meet today — only a Wilkołak swaps and only
    // the Przybysz refuses — but a card counted out and then swapped back in
    // would be worth *more* against the one Wróg that allows it least.
    if (gone.has(swap.cardId)) continue;
    const one = inPlay.filter((held) => held.cardId === swap.cardId).slice(0, 1);
    const ordinarily = bonusFromHoldings(one, mode, "walka", view.fieldId, view.nature);
    miecz += swap.miecz - ordinarily.miecz;
    magia += swap.magia - ordinarily.magia;
  }
  return { miecz, magia };
}

/**
 * Closes a fight frame, whatever it stood on.
 *
 * Over a field frame — every ordinary fight since fights became pushes — the
 * pop reveals the field as it was when the fight opened, and `endFight` merges
 * in what the fight settled: the creatures fought this turn (17.4), a meeting
 * spent (13.2). Over anything else — a summon's roll, a `walka` step's script
 * frame — the pop alone is the whole of it: nothing beneath needs telling.
 *
 * A one-frame stack is a row written before fights were pushes, still readable
 * for one release, and closes the way it always did: by rebuilding the field
 * from the Fight's own copies.
 */
export function closeFightFrame(
  state: TurnState,
  fight: Extract<TurnPhase, { phase: "fight" }>,
): TurnState {
  if (state.stack.length < 2) return only(endFight(fight));
  const below = state.stack[state.stack.length - 2];
  if (below.phase !== "field") return pop(state);

  /**
   * Merged into the Obszar as it stands, not rebuilt from the Fight's copies.
   *
   * This is what the paragraph above always said it did — "the pop reveals the
   * field as it was when the fight opened, and `endFight` merges in what the
   * fight settled" — and it was not what happened. `endFight` builds a *fresh*
   * field frame out of the five things the Fight carries (`fieldId`, `draw`,
   * `drawn`, `fought`, `met`) and that frame replaced the live one, so
   * everything else the Obszar knew was thrown away on the way out.
   *
   * `resolved` is the thing it threw away, and it is not a small one: a
   * Spotkanie settled before the Wróg was fought came back unsettled after the
   * win, offering "Rozpatrz" on a Karta whose Natura change had already
   * happened. Found at a real table on Bezdroża — SŁUP OGNIA resolved, WILK
   * beaten, SŁUP OGNIA asking again.
   *
   * Merging rather than adding `resolved` to the Fight's copies, because the
   * next field to grow a field would have gone the same way. What the *fight*
   * settled is exactly two things and they are named here; everything else on
   * the Obszar belongs to the Obszar.
   */
  const closed = endFight(fight);
  if (closed.phase !== "field") return pop(state);
  return replaceTop(pop(state), {
    ...below,
    fought: closed.fought ?? [],
    ...(closed.met ? { met: true as const } : {}),
  });
}

/**
 * A fight closed and the loop beneath it settled — the pair, as one act.
 *
 * The two always go together and were composed by hand at three sites, which
 * is one hand-composition too many for an invariant: a loop is never the top
 * of the stack at rest (docs/STACK.md, law 3), so every path that pops a fight
 * owes the question "was this a round of something". Only `resolveFight` does
 * not use this, and deliberately — a win that is not the last one pushes the
 * next head rather than settling, which is the one case that has to look at
 * the loop itself.
 */
export function shutFight(
  state: TurnState,
  fight: Extract<TurnPhase, { phase: "fight" }>,
): TurnState {
  return settleExposedLoop(closeFightFrame(state, fight));
}

export function beginFight(snapshot: Snapshot, command: BeginFight): Outcome<void> {
  const seat = activeSeat(snapshot);
  const state = requireTop(snapshot.game.turn_state, "field", "Nie czas na walkę.");
  // 13.4: the whole deal comes before any of the reading. A Wróg turned over
  // second is not fought until the third Karta is down, because that one may
  // outrank him (15.1, 15.2) or carry the character off the Obszar (16.8).
  refuseWhileUndrawn(snapshot);
  if (command.cardIds.length === 0) throw new Error("Nie ma z kim walczyć.");

  // 17.4 ends the fight when the dice are compared, whatever the result. A card
  // already rolled against this turn is settled — beaten and waiting to be
  // taken, or standing and to be walked away from — and rolling again would let
  // a character grind the same Smok until it got a six.
  const settled = state.fought ?? [];
  const again = command.cardIds.find((cardId) => settled.includes(cardId));
  if (again) {
    const card = EVENTS.find((c) => c.id === again);
    throw new Error(`Walka z ${card?.name ?? again} już się w tej turze odbyła (17.4).`);
  }

  /**
   * What the character brings (1.5, 17.4), read before the creatures rather
   * than after them.
   *
   * It used to be worked out below, once the opposition was known, which was
   * fine while every Wróg carried his own number. The Sobowtór does not — "tyle
   * punktów Miecza, ile jego przeciwnik" — so the question "how strong is he"
   * cannot be answered until this one is.
   *
   * The list of foes is what `insteadAgainst` needs, and it is the command's,
   * not the loop's.
   */
  const mine = againstThese(snapshot, seat.id, command.cardIds);

  const foes = command.cardIds.map((cardId) => {
    const card = EVENTS.find((c) => c.id === cardId);
    if (!card) throw new Error(`Nieznana karta: ${cardId}`);
    // Only a Wróg fights. The Miecz on Excalibur and the Magia on Pierścień
    // Mocy are bonuses to their holder (1.5, 2.5), not creatures to be rolled
    // against.
    const foe = combatValueOf(card, { miecz: mine.miecz });
    if (!foe) throw new Error(`${card.name} nie jest Wrogiem.`);
    return { card, foe };
  });

  /**
   * "Postać mająca Relikwiarz pokonuje wszystkie Demony, bez konieczności walki
   * z nimi."
   *
   * No fight opens at all, so there are no dice, no Zaklęcia spoken into it and
   * no osłona to roll — none of which a fight that was never fought should have.
   * The card is a trophy the same way a beaten one is (1.4), because it *was*
   * beaten; it simply cost nothing.
   *
   * Only when every Wróg on the stack is one of them. 17.5 makes a mixed pack a
   * single opponent with its Miecze summed, and there is no reading of that in
   * which half of it is skipped and the other half fought.
   */
  const relic = beatsWithoutFighting(
    inEffect(seatView(snapshot, seat.id).holdings, eqModeOf(snapshot.game), seatView(snapshot, seat.id).nature).map(
      (held) => held.cardId,
    ),
    foes[0]?.card.id ?? "",
  );
  if (relic !== null && foes.every((f) => beatsWithoutFighting([relic], f.card.id) !== null)) {
    const taken: Changeset = {
      holdings: {
        insert: foes.map((f) => ({
          seat_id: seat.id,
          card_id: f.card.id,
          kind: "trophy" as const,
          face: "open" as const,
        })),
      },
      journal: foes.map((f) => ({
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "fight-end" as const,
        payload: { cardId: f.card.id, outcome: "wygrana", bezWalki: relic },
      })),
    };
    const lifted = foes.reduce<Changeset>(
      (soFar, f) => mergeAll(soFar, liftOffField(apply(snapshot, mergeAll(taken, soFar)), f.card.id)),
      {},
    );
    return { writes: mergeAll(taken, lifted), result: undefined };
  }

  // 17.5: several creatures attacking at once are one opponent — "Miecze tych
  // istot są sumowane, a do uzyskanego rezultatu dodawany jest wynik rzutu
  // kostką". One roll for the lot of them, not one each, which is the
  // difference between hard and hopeless.
  const asOne = attackAsOne(foes.map((f) => f.foe));
  if (!asOne) {
    throw new Error(
      "Zwykli i magiczni Wrogowie nie atakują razem — rozpatrzcie osobno (18.1).",
    );
  }
  const { kind } = asOne;

  /**
   * Six Obszary make every Wróg met on them stronger: "Każdy Wróg, z którym
   * zmierzysz się w Kamiennym Lesie dodaje 3 punkty do swojej Magii lub
   * Miecza."
   *
   * "Każdy" is the word that decides how it is counted. A pack attacking as one
   * under 17.5 has its Miecze summed, and each of those is already the bigger
   * number — so the ground's bonus is added once per creature, not once to the
   * sum. The same Cyklop is worth six on most of the board and nine here.
   */
  const harder = foeBonusAt(seat.field_id);
  const total = asOne.total + harder * foes.length;

  /**
   * A creature that is several fights rather than one (law 3, docs/STACK.md).
   *
   * Only when it is fought alone. 17.5 sums the Miecze of everything attacking
   * at once and rolls one die against the sum, and there is no reading of the
   * Smok in which his three heads are added to a Wilk and beaten in a single
   * comparison — his card asks for three fights, and 17.5 offers one. So the
   * pack is refused rather than quietly flattened into an ordinary fight,
   * which would be the app dropping a rule while looking like it applied one.
   */
  const rounds = foes.length === 1 ? roundsOf(foes[0].card.id) : null;
  if (!rounds) {
    const looper = foes.find((f) => roundsOf(f.card.id));
    if (looper) {
      throw new Error(
        `${looper.card.name} walczy po kolei, jedną istotą naraz — nie da się go pokonać w grupie (17.5).`,
      );
    }
  }

  const opened = startFight(
    state,
    {
      cardId: foes.map((f) => f.card.id).join("+"),
      cardName: foes.map((f) => f.card.name).join(" + "),
      settles: foes.map((f) => f.card.id),
      // Carried through from the stack: a fight staged by a test is one
      // the deck never dealt, and the sheet says so over the card's own
      // picture.
      ...(state.drawn.some((entry) => command.cardIds.includes(entry.cardId) && entry.granted)
        ? { granted: true }
        : {}),
      ...(kind === "magical" ? { magia: total } : { miecz: total }),
    },
    mine,
  );
  if (opened.phase !== "fight") throw new Error("Nie czas na walkę.");

  return {
    writes: {
      game: {
        turn_state: rounds
          ? openLoop(snapshot.game.turn_state, {
              phase: "loop",
              seatId: seat.id,
              // The head, with the strength the card prints for one of them —
              // `startFight` has already read it and added whatever the ground
              // adds (the Kamienny Las makes every head harder, not the Smok
              // once).
              of: opened.fight,
              times: rounds.times,
              done: 0,
              round: rounds.round,
              settles: [foes[0].card.id],
            })
          : push(snapshot.game.turn_state, opened),
      },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "fight-start",
          payload: {
            cardIds: [...command.cardIds],
            enemyTotal: total,
            together: command.cardIds.length > 1,
            ...(rounds ? { times: rounds.times, round: rounds.round } : {}),
          },
        },
      ],
    },
    result: undefined,
  };
}

/**
 * Opens a fight with a creature a card names rather than one lying on a field.
 *
 * The Karczma's "miejscowy osiłek (Miecz 4)" is nowhere in the deck: he is a
 * line on the board with a number after him. `beginFight` starts from a card
 * id, so it cannot be used, but everything after that — the totals, the two
 * dice, 17.4's point of Życie — is the same fight.
 *
 * No dice, for the same reason `beginFight` throws none.
 */
export function beginNamedFight(
  snapshot: Snapshot,
  command: { name: string; miecz?: number; magia?: number },
): Outcome<void> {
  const seat = activeSeat(snapshot);
  const state = requireTop(snapshot.game.turn_state, "field", "Nie czas na walkę.");

  const { name, miecz, magia } = command;
  return {
    writes: {
      game: {
        turn_state: push(snapshot.game.turn_state, startFight(
          state,
          {
            cardId: `pole:${name}`,
            cardName: name,
            ...(magia !== undefined ? { magia } : { miecz }),
            settles: [],
          },
          pointsOf(snapshot, seat.id, "walka"),
        )),
      },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "fight-start",
          payload: { nazwa: name, enemyTotal: miecz ?? magia },
        },
      ],
    },
    result: undefined,
  };
}

/**
 * A creature conjured by a Zaklęcie, sent at a Postać or a Wróg (GOLEM,
 * HOMUNCULUS).
 *
 * The wyprawa's shape with a different fighter: „atakuje wybraną Postać lub
 * Wroga (w granicach Kręgu). Ofiara musi walczyć na zwykłych zasadach." The
 * caster is not in it — the Golem's Miecz is the whole of the attacking side —
 * so the fight opens as a raid and everything a raid already knows follows:
 * no osłona for a blow that never landed on anybody's character, no trophy for
 * a kill that was not yours, and the Władca's errand not counted.
 *
 * Range is the Krąg, which is wider than the Poszukiwacz's three Obszary and
 * narrower than the board: „w granicach Kręgu", and the rings are what
 * `ringFields` knows. Crossing to another ring is a turn's work with a die
 * behind it (11.2), so a summon cannot be sent across one any more than a
 * Przyjaciel can.
 */
export function summonFighter(
  snapshot: Snapshot,
  command: {
    name: string;
    miecz: number;
    /** The Zaklęcie that conjured it, for the journal and for `raid`. */
    spellId: string;
    targetSeatId?: string;
    fieldCardId?: string;
  },
): Outcome<void> {
  const seat = activeSeat(snapshot);
  const state = top(snapshot.game.turn_state);
  if (state.phase === "fight") throw new Error("Najpierw dokończcie tę walkę.");
  if (seat.field_id === null) throw new Error("Twoja Postać nie stoi na planszy.");

  /**
   * A fight needs an Obszar to happen on, and that is the field phase's.
   * Spoken „przed wykonaniem ruchu" there is no such phase yet — so one is
   * made out of where the character is standing, to seed the Fight, and the
   * fight is *pushed* above the running frame: the caster still owes their
   * move, and ending the fight pops back to the roll it interrupted. `resume`
   * used to carry this and is gone — docs/STACK.md.
   */
  const from: TurnPhase =
    state.phase === "field"
      ? state
      : {
          phase: "field",
          fieldId: seat.field_id as FieldId,
          from: null,
          draw: 0,
          drawn: [],
        };
  const opened = (fight: TurnPhase) =>
    state.phase === "field"
      ? replaceTop(snapshot.game.turn_state, fight)
      : push(snapshot.game.turn_state, fight);
  const ring = ringFields(seat.field_id as FieldId);
  const inRing = (fieldId: FieldId | null): boolean =>
    fieldId !== null && ring.includes(fieldId);

  const mine = { miecz: command.miecz, magia: 0 };
  const raid = { cardId: command.spellId, summoned: true } as const;

  if (command.targetSeatId !== undefined) {
    const target = snapshot.seats.find((one) => one.id === command.targetSeatId);
    if (!target) throw new Error("Nieznane miejsce.");
    if (target.id === seat.id) throw new Error("Nie możesz przyzwać go na siebie.");
    if (target.eliminated) throw new Error("Ta Postać nie żyje.");
    // 20.5, exactly as the wyprawa reads it: a creature sent at stone is still
    // an attack, and stone is not attacked.
    refuseAgainstStone(snapshot, target.id, "attack");
    if (!inRing(asFieldId(target.field_id))) {
      throw new Error(`${command.name} sięga tylko w granicach Kręgu.`);
    }
    const theirs = pointsOf(snapshot, target.id, "walka");
    return {
      writes: {
        game: {
          turn_state: opened(
            startFight(
              from,
              {
                cardId: `seat:${target.seat_index}`,
                cardName: nameOfSeat(snapshot.users, target.seat_index),
                miecz: theirs.miecz,
                opponentSeat: target.seat_index,
                raid,
              },
              mine,
            ),
          ),
        },
      },
      result: undefined,
    };
  }

  const lying = snapshot.fieldCards.find((row) => row.id === command.fieldCardId);
  if (!lying) throw new Error("Wskaż Postać albo Kartę Wroga na planszy.");
  if (!inRing(asFieldId(lying.field_id))) {
    throw new Error(`${command.name} sięga tylko w granicach Kręgu.`);
  }
  const card = EVENTS.find((one) => one.id === lying.card_id);
  // What he faces decides the Sobowtór's own strength, and here that is the
  // conjured creature rather than the caster — see `combatValueOf`.
  const foe = card ? combatValueOf(card, { miecz: command.miecz }) : null;
  if (!foe) throw new Error("Z tą Kartą się nie walczy.");

  return {
    writes: {
      game: {
        turn_state: opened(
          startFight(
            from,
            {
              cardId: lying.card_id,
              cardName: cardName(lying.card_id),
              ...(foe.kind === "magical" ? { magia: foe.total } : { miecz: foe.total }),
              granted: lying.granted,
              raid: { ...raid, fieldCardId: lying.id },
            },
            mine,
          ),
        ),
      },
    },
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * The numbers and the dice.
 * ----------------------------------------------------------------------- */

/**
 * Corrects the character's side of the sum.
 *
 * Companion mode's, and gated on it by the caller: 1.5 counts Przedmioty and
 * Przyjaciele towards the total and at a physical table those are cards lying
 * on the wood that the referee does not track. In simulation the app owns every
 * one of them and there is nothing here to correct.
 *
 * No dice, and no journal line — the store wrote none, and the fight's own
 * numbers are on every screen already.
 */
export function setFightPlayerTotal(
  snapshot: Snapshot,
  command: { total: number },
): Outcome<void> {
  return {
    writes: {
      game: {
        turn_state: replaceTop(
          snapshot.game.turn_state,
          setFightTotal(top(snapshot.game.turn_state), command.total),
        ),
      },
    },
    result: undefined,
  };
}

export interface FightRoll {
  side: "player" | "enemy";
  /**
   * True when a human read the number off a real die and typed it in.
   *
   * Provenance, not a value: the die itself comes from the port, and which
   * binding is behind it is not something a rule may ask. Same shape as
   * `RollForMove.manual`.
   */
  manual?: boolean;
}

/**
 * Throws one side's die (17.4, 17.8).
 *
 * One die, for the side the command names — and nothing validates the number,
 * because `supplied` refuses anything outside 1-6 as it takes it, which is the
 * one place that can tell a typed number from a thrown one.
 */
export async function fightRoll(
  snapshot: Snapshot,
  command: FightRoll,
  ports: CommandPorts,
): Promise<Outcome<void>> {
  const seat = activeSeat(snapshot);
  const state = requireTop(snapshot.game.turn_state, "fight");

  // 17.3 puts the spells before the dice, so the dice wait — but only while
  // somebody actually holds the floor, and only until it lapses. Checked here
  // and not only in the interface, because a claim one device can roll straight
  // through is not a claim.
  const floor = floorOf(state.fight, ports.now());
  if (floor) {
    throw new Error(`${nameOfSeat(snapshot.users, floor.seat)} rzuca Zaklęcie (17.3) — kostki czekają.`);
  }

  const thrown = await ports.random.rollD6(
    command.side === "player" ? "walka: rzut Postaci" : "walka: rzut Wroga",
  );
  const manual = command.manual ?? false;

  /**
   * The two Talizmany, which shift the die rather than the total.
   *
   * "Talizman Ognia pozwala dodać 1 do wyniku rzutu kostką podczas walki (lecz
   * nie magicznej)"; the Talizman Powietrza says the same of a magical one. So
   * it is the roll that moves, not the Miecz — and only the character's own,
   * because the Wróg is not carrying anybody's Talizman.
   *
   * Kept inside 1-6: a die that reads 7 is a die nothing else in the game knows
   * how to draw, and the modifier is a bonus to a throw rather than a seventh
   * face. The raw throw is journalled beside it so a table can see what the
   * card did rather than only what it ended up as.
   */
  const shift =
    command.side === "player"
      ? rollModifier(seatView(snapshot, seat.id).abilities, { walka: state.fight.kind }).delta
      : 0;
  const roll = shift === 0 ? thrown : Math.max(1, Math.min(6, thrown + shift));

  return {
    writes: {
      game: { turn_state: replaceTop(snapshot.game.turn_state, recordFightRoll(state, command.side, roll)) },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "fight-roll",
          payload: { side: command.side, roll, ...(shift !== 0 ? { thrown, shift } : {}) },
          manual,
        },
      ],
    },
    result: undefined,
  };
}

/**
 * The roll an item gives you against losing the point of Życie (17.4).
 *
 * A Hełm saves on a 1, a Tarcza on 1-2, a Zbroja on 1-3, and wearing all three
 * is one roll against the widest of them rather than three chances. 18.2b takes
 * the possibility away entirely in a magical fight, which is why the kind is
 * asked for.
 *
 * One die, and only when there is something to roll for: a magical fight and a
 * character with nothing on it both answer no without touching the port, so a
 * companion table is never asked to type a number nothing reads.
 *
 * Rolled automatically because there is nothing to decide — the card grants
 * "the right to roll" and no reason has ever existed to decline. Journalled
 * either way, since a save is the difference between a death and a scratch and
 * the table will want to see the die.
 */
export async function shieldSaves(
  snapshot: Snapshot,
  command: { seatId: string; kind: CombatKind },
  ports: CommandPorts,
): Promise<Outcome<boolean>> {
  // 18.2b: nothing prevents the loss in a magical fight.
  if (command.kind === "magical") return { writes: {}, result: false };

  const seat = seatById(snapshot, command.seatId);
  const abilities = seatView(snapshot, seat.id).abilities;
  const upTo = bestShield(abilities);
  if (upTo === 0) return { writes: {}, result: false };

  const die = await ports.random.rollD6("osłona: rzut");
  const saved = die <= upTo;
  return {
    writes: {
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "shielded",
          payload: { die, upTo, saved },
        },
      ],
    },
    result: saved,
  };
}

/**
 * The friend who dies rather than let you lose the point (6.4).
 *
 * Chapter 6 says only that a killed friend goes "na stos zużytych Kart
 * Zdarzeń"; that any friend would step in front of you at all is printed on the
 * two cards that do it, and they do not do it alike. The Bojowy Rumak is
 * certain — "zginie tylko twój Rumak, ty zaś nie utracisz punktu Życia" — and
 * the Giermek is a one-in-six that has to be rolled for. `diesForYou` puts the
 * rolled offers first and says why.
 *
 * Asked only once the osłona has already failed, because 17.4's roll costs
 * nothing and this costs a friend: offering the Giermek's neck against a point
 * a Zbroja was about to save would be spending the better card first.
 *
 * Stops at the first friend who actually dies. Two friends never die for one
 * point — each card buys the same single point, and the second is still there
 * for the next fight.
 */
export async function friendDiesInstead(
  snapshot: Snapshot,
  command: { seatId: string; raiding?: boolean },
  ports: CommandPorts,
): Promise<Outcome<boolean>> {
  const seat = seatById(snapshot, command.seatId);
  const mode = eqModeOf(snapshot.game);
  const view = seatView(snapshot, seat.id);
  const held = inEffect(view.holdings, mode, view.nature);
  const offers = diesForYou(
    held.map((h) => h.cardId),
    { raiding: command.raiding ?? false },
  );

  for (const offer of offers) {
    // Back to the stored row: the engine's `Holding` is what the rules read and
    // carries no id, and it is the row that has to be deleted.
    const row = snapshot.holdings.find(
      (h) => h.seat_id === seat.id && h.card_id === offer.cardId,
    );
    if (!row) continue;

    let die: number | null = null;
    if (offer.onRollUpTo !== undefined) {
      die = await ports.random.rollD6(`${offer.cardId}: rzut za ciebie`);
      if (die > offer.onRollUpTo) continue;
    }

    // 6.4: a killed friend goes to the used pile, not to the ground. Only the
    // owner may leave one lying on an Obszar, and that is a choice they make.
    const gone: Changeset = { holdings: { delete: [row.id] } };
    const pile = putOnPile(apply(snapshot, gone), "events", [asReturnable(row)]);
    return {
      writes: mergeAll(gone, pile, {
        journal: [
          {
            seatId: seat.id,
            round: snapshot.game.round,
            kind: "died-for-you",
            payload: { cardId: row.card_id, die },
          },
        ],
      }),
      result: true,
    };
  }

  return { writes: {}, result: false };
}

/**
 * How far the Poszukiwacz Przygód will travel, and the reach test itself.
 *
 * Both moved to `engine/raid.ts` when the browser needed them: a client
 * component cannot import the command layer, and a UI that works out which
 * targets to offer from its own copy of the number offers buttons the server
 * then refuses. Re-exported here so nothing that already had it has to move.
 */
export { RAID_RANGE } from "@/lib/engine/raid";

export interface SendRaider {
  /** A Postać to attack, by seat. */
  targetSeatId?: string;
  /** Or a Wróg left lying on an Obszar, by the row that put it there. */
  fieldCardId?: string;
}

/**
 * Sends a Przyjaciel out to attack something you are not standing next to.
 *
 * The Poszukiwacz Przygód alone does this: "Po zakończeniu ruchu możesz zlecić
 * temu Przyjacielowi, by zaatakował Postać lub Wroga, oddalonego najwyżej o 3
 * Obszary. Poszukiwacz Przygód posiada 3 punkty Miecza."
 *
 * It is not a duel and not an encounter. 13.1 restricts the character to the
 * field their move ended on, and this deliberately reaches past that — the
 * character stays where they are and the friend goes. So none of `attackSeat`'s
 * same-field checks apply, and none of the character's own points do either:
 * the friend fights with his three and nothing of yours.
 *
 * Range is measured by `fieldsApart`, which counts steps round one ring and
 * refuses to count across rings at all. A Przeprawa is a turn's work that can
 * fail, not a step, and treating one as a step would put most of the board
 * within three Obszary of everywhere.
 */
export function sendRaider(snapshot: Snapshot, command: SendRaider): Outcome<void> {
  const seat = activeSeat(snapshot);
  // "Po zakończeniu ruchu" — the friend is sent from where the move ended.
  const state = requireTop(
    snapshot.game.turn_state,
    "field",
    "Wyprawę zleca się po ruchu (16.1).",
  );

  const mode = eqModeOf(snapshot.game);
  const view = seatView(snapshot, seat.id);
  const raider = raidsForYou(inEffect(view.holdings, mode, view.nature).map((h) => h.cardId));
  if (!raider) throw new Error("Nie masz Przyjaciela, którego można wysłać na wyprawę.");
  if (seat.field_id === null) throw new Error("Twoja Postać nie stoi na planszy.");

  const within = (fieldId: FieldId | null): boolean =>
    withinRaid(seat.field_id as FieldId, fieldId);

  if (command.targetSeatId !== undefined) {
    const target = snapshot.seats.find((s) => s.id === command.targetSeatId);
    if (!target) throw new Error("Nieznane miejsce.");
    if (target.id === seat.id) throw new Error("Postać nie walczy sama ze sobą.");
    if (target.eliminated) throw new Error("Ta Postać nie żyje.");
    // Sent rather than thrown, and 20.5 does not care which: the Poszukiwacz
    // cannot take a Życie off stone either.
    refuseAgainstStone(snapshot, target.id, "attack");
    if (!within(asFieldId(target.field_id))) {
      throw new Error(`Zbyt daleko — wyprawa sięga ${RAID_RANGE} Obszary.`);
    }
    const theirs = pointsOf(snapshot, target.id, "walka");
    return {
      writes: {
        game: {
          turn_state: push(snapshot.game.turn_state, startFight(
            state,
            {
              cardId: `seat:${target.seat_index}`,
              cardName: nameOfSeat(snapshot.users, target.seat_index),
              miecz: theirs.miecz,
              opponentSeat: target.seat_index,
              raid: { cardId: raider.cardId },
            },
            { miecz: raider.miecz, magia: raider.magia },
          )),
        },
      },
      result: undefined,
    };
  }

  const lying = snapshot.fieldCards.find((row) => row.id === command.fieldCardId);
  if (!lying) throw new Error("Wskaż Postać albo Kartę Wroga na planszy.");
  if (!within(asFieldId(lying.field_id))) {
    throw new Error(`Zbyt daleko — wyprawa sięga ${RAID_RANGE} Obszary.`);
  }
  const card = EVENTS.find((one) => one.id === lying.card_id);
  // The Przyjaciel sent out is who the Sobowtór would be facing, so his is the
  // Miecz it mirrors — see `combatValueOf`.
  const foe = card ? combatValueOf(card, { miecz: raider.miecz }) : null;
  if (!foe) throw new Error("Z tą Kartą się nie walczy.");

  return {
    writes: {
      game: {
        turn_state: push(snapshot.game.turn_state, startFight(
          state,
          {
            cardId: lying.card_id,
            cardName: cardName(lying.card_id),
            ...(foe.kind === "magical" ? { magia: foe.total } : { miecz: foe.total }),
            granted: lying.granted,
            raid: { cardId: raider.cardId, fieldCardId: lying.id },
          },
          { miecz: raider.miecz, magia: raider.magia },
        )),
      },
    },
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Two characters (13.3, 17.6, 17.7).
 * ----------------------------------------------------------------------- */

/**
 * Attacks another character standing on the same Obszar (13.3).
 *
 * Rule 13.1 restricts encounters to the field a move ENDED on, so an attack is
 * only legal against someone actually standing there — passing through does not
 * count. Both sides fight with their full totals (1.5, 2.5), and rule 17.9 lets
 * the winner take a point of Życie, an item, or a Sztuka Złota, which is a
 * choice and so is left to the player.
 *
 * No dice: 17.7 word for word gives "obie Postacie" their Zaklęcia before the
 * roll, so a duel opens with an empty floor exactly as `beginFight` does. This
 * was the one fight that never opened the window — the attacker rolled the
 * moment they pressed attack.
 */
export function attackSeat(
  snapshot: Snapshot,
  command: { targetSeatId: string },
): Outcome<void> {
  const attacker = activeSeat(snapshot);
  const target = snapshot.seats.find((s) => s.id === command.targetSeatId);
  if (!target) throw new Error("Nieznane miejsce.");
  if (target.id === attacker.id) throw new Error("Postać nie walczy sama ze sobą.");
  if (target.eliminated) throw new Error("Ta Postać nie żyje.");
  // 20.5: a statue cannot be made to lose a point of Życie, so there is nothing
  // a fight with one could settle.
  refuseAgainstStone(snapshot, target.id, "attack");
  if (target.field_id !== attacker.field_id) {
    throw new Error("Spotkanie jest możliwe tylko na tym samym Obszarze (13.1).");
  }
  const state = requireTop(snapshot.game.turn_state, "field", "Nie czas na spotkanie.");
  // 13.2: "musi dokonać wyboru" — and this turn has already made it.
  refuseAgainst13_2(snapshot, "meet");

  // 14.1: on the Kamienny Most characters meet at the two Wejścia and nowhere
  // else. The bridge is a single-file line above a valley — there is no room to
  // turn and fight beside a Demon, which is what the rule is about.
  if (
    attacker.field_id &&
    attacker.field_id in BRIDGE_SIDE &&
    BRIDGE_ORDEAL.has(attacker.field_id)
  ) {
    throw new Error("Na Moście Postacie spotykają się tylko na Wejściu na Most (14.1).");
  }

  const mine = pointsOf(snapshot, attacker.id, "walka");
  const theirs = pointsOf(snapshot, target.id, "walka");

  /**
   * Remembered, because one Nieznajomy asks.
   *
   * "Jeśli podczas tej rozgrywki zaatakowałeś inną Postać ... musisz złożyć w
   * ofierze 1 Sz.Z." The Dobre Bóstwo is the only card that asks what you did
   * earlier rather than what is true of you now, and 13.3 is where the doing
   * happens — the moment of *attacking*, not of winning, which is what the card
   * says and is why this is written whatever the fight then does.
   *
   * One mark, replaced rather than added to: „Jeśli podczas tej rozgrywki
   * zaatakowałeś inną Postać" is asked once and answered yes or no, and a row
   * per duel would read as a tally the card does not keep. What the row carries
   * is the *latest* act — whom, where, when — which is what the accusation on
   * the Karta has to be checkable against. The journal holds the rest.
   */
  const previous = storedStatuses(snapshot, attacker.id).find(
    (status) => status.modifier.kind === "attacker",
  );
  const marked = mergeAll(
    previous ? { effects: { delete: [previous.id] } } : {},
    addEffect(snapshot, {
      seatId: attacker.id,
      effect: {
        source: "13.3",
        label: "Podniósł rękę na inną Postać",
        modifier: {
          kind: "attacker",
          victim: nameOfSeat(snapshot.users, target.seat_index),
          // 13.3 puts both Postacie on one Obszar, so these are the same today.
          // `victimWhere` is written anyway, because the first thing that is not
          // a duel — a Przyjaciel sent out, a Zaklęcie at range — will differ,
          // and a field that appears later reads as a change of rule.
          ...(attacker.field_id ? { where: attacker.field_id } : {}),
          ...(target.field_id ? { victimWhere: target.field_id } : {}),
          round: snapshot.game.round,
          how: "atak",
        },
        ends: { kind: "dispelled" },
      },
    }),
  );

  return {
    writes: mergeAll(marked, {
      game: {
        turn_state: push(snapshot.game.turn_state, startFight(
          state,
          {
            cardId: `seat:${target.seat_index}`,
            cardName: nameOfSeat(snapshot.users, target.seat_index),
            miecz: theirs.miecz,
            opponentSeat: target.seat_index,
          },
          mine,
        )),
      },
      journal: [
        {
          seatId: attacker.id,
          round: snapshot.game.round,
          kind: "duel",
          payload: { target: target.seat_index, field: attacker.field_id },
        },
      ],
    }),
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Leaving one.
 * ----------------------------------------------------------------------- */

export interface Escape {
  /**
   * Whether the attempt worked, or null to let the app decide.
   *
   * Null is what a simulation sends. 19.1 does not roll for this — an escape
   * works because a character's ability or the Krąg Płomieni says it does — so
   * "decide" means reading the abilities rather than throwing a die, and the
   * answer is the same one `canEscapeAt` gives the interface. A companion table
   * still says yes or no itself, because there the abilities in play include
   * whatever the players have agreed about a card nobody has transcribed.
   */
  reported: boolean | null;
  /**
   * The seat that pressed it, or null for the shared screen in companion mode.
   *
   * Checked rather than trusted, because 17.6 hands the escape to the other
   * player: this is the one action in a fight that the seat whose turn it is
   * must not be able to take for themselves.
   */
  actorSeatId?: string | null;
}

/**
 * Declines a fight (17.2, 19).
 *
 * Rule 17.2 makes fleeing a decision taken BEFORE any dice, and 19.1 says
 * whether it works depends on the character's own special abilities or the
 * Krąg Płomieni spell — never on a die. So the answer is read off what the
 * seat is holding rather than rolled for, and a companion table can still say
 * yes or no itself.
 *
 * Three things the rules keep apart and this has to as well:
 *
 * - **Who.** 17.6 gives the attempt to the character who was *attacked*. In a
 *   duel that is never the active seat, because a duel only starts when the
 *   active seat attacks somebody (13.3). It is decided against the fight in
 *   progress rather than against which button was pressed.
 * - **From what.** Every printed escape covers Wrogowie. Another Postać is the
 *   Krąg Płomieni's alone — see `EscapeTarget`.
 * - **Where.** 19.3 leaves exactly one kind of escape on the Kamienny Most.
 *
 * No dice, and that is the rule rather than an omission: 19.1 is answered, not
 * rolled, so "no" is a real result and not a low number.
 */
export function escape(
  snapshot: Snapshot,
  command: Escape,
): Outcome<{ succeeded: boolean; onBridge: boolean }> {
  const { reported } = command;
  const actorSeatId = command.actorSeatId ?? null;
  const state = top(snapshot.game.turn_state);

  if (state.phase !== "fight" && state.phase !== "field") {
    throw new Error("Nie ma przed czym uciekać.");
  }

  const duelWith = state.phase === "fight" ? state.fight.opponentSeat : undefined;

  /**
   * 17.6: "Postać, która została zaatakowana, może próbować wymknąć się
   * przeciwnikowi." The attacker has already made their choice by attacking —
   * there is no rule anywhere letting them take it back — so in a duel the
   * escape belongs to the other seat, and only to them.
   */
  const fleeing =
    duelWith === undefined
      ? activeSeat(snapshot)
      : snapshot.seats.find((s) => s.seat_index === duelWith);
  if (!fleeing) throw new Error("Nie ma kto uciekać.");
  if (actorSeatId !== null && actorSeatId !== fleeing.id) {
    throw new Error(
      duelWith === undefined
        ? "To nie twoja tura."
        : "Wymyka się Postać zaatakowana, nie atakująca (17.6).",
    );
  }

  // A duel is the only thing in the game that is fled *as a Postać*; everything
  // else on a field or in a hand of drawn cards is a Wróg.
  const przed: EscapeTarget = duelWith === undefined ? "wrog" : "postac";

  const onBridge = fleeing.field_id !== null && ringOf(fleeing.field_id) === KAMIENNY_MOST;
  if (onBridge && przed === "wrog") {
    throw new Error("Na Kamiennym Moście można wymknąć się tylko innym Postaciom (19.3).");
  }

  const held = snapshot.holdings.filter((h) => h.seat_id === fleeing.id);
  const abilities = [
    ...abilitiesOfCharacter(asCharacterId(fleeing.character_id)),
    ...heldAbilities(
      inEffect(holdingsOf(snapshot, fleeing.id), eqModeOf(snapshot.game)).map(
        (h) => h.cardId,
      ),
    ),
  ];
  const byAbility =
    fleeing.field_id !== null && canEscapeAt(abilities, fleeing.field_id, przed);

  /**
   * The other half of 19.1, and the only half that reaches another Postać.
   *
   * Looked for only once an ability has already said no, so nothing burns a
   * Karta for something a Charakterystyka does for free. Spent when it is used,
   * because 9.6 puts a spoken Zaklęcie on the used pile — and unlike the
   * abilities it gets you away from one thing, not from everything standing on
   * the Obszar.
   *
   * Only in a fight, because a Zaklęcie is spoken at something: 19.1 pins it to
   * "jednej (unieruchomionej w Kręgu Płomieni) istocie", and standing on a
   * field with three drawn Wrogowie names none of them. Refusing a card before
   * any fight begins stays what 19.2 makes it — an ability, or nothing.
   */
  const circle =
    byAbility || reported !== null || state.phase !== "fight"
      ? undefined
      : held.find((h) => h.kind === "spell" && h.card_id === KRAG_PLOMIENI);

  const succeeded = reported ?? (byAbility || circle !== undefined);

  let spoken: Changeset = {};
  if (circle && succeeded) {
    const gone: Changeset = { holdings: { delete: [circle.id] } };
    const back = putOnPile(apply(snapshot, gone), "spells", [asReturnable(circle)]);
    spoken = mergeAll(gone, back, {
      journal: [
        {
          seatId: fleeing.id,
          round: snapshot.game.round,
          kind: "spell",
          payload: {
            cardId: KRAG_PLOMIENI,
            name: SPELL_BY_ID.get(KRAG_PLOMIENI)?.name ?? KRAG_PLOMIENI,
          },
        },
      ],
    });
  }

  /**
   * What an escape leaves behind.
   *
   * 19.1 twice over: the character "nie może w żaden sposób oddziaływać" on
   * what it fled, and an escape by ability takes it away from "wszystkim
   * znajdującym się na danym Obszarze istotom" at once — not just from the one
   * it happened to be rolling against. So every Wróg on the field is settled,
   * which is `fought` rather than `resolved`: that list is the one 17.4 checks,
   * so a fled creature can be neither offered again nor fought again.
   *
   * The Krąg Płomieni is the exception the same rule names — one creature,
   * "jednej (unieruchomionej w Kręgu Płomieni) istocie" — so it ends the fight
   * in hand and nothing more.
   */
  // Chained: `spoken` has already written `game.deck`, and the turn state is
  // decided against a table that knows the card is spent.
  const beforeState = apply(snapshot, spoken).game.turn_state;
  const before = top(beforeState);
  let left: Changeset = {};
  if (succeeded && before.phase === "fight") {
    const sweep =
      byAbility && przed === "wrog"
        ? before.fight.drawn
            .filter((entry) => isFoeClass(entry.cardClass))
            .map((entry) => entry.cardId)
        : [];
    // Close the frame first; the ability's sweep then lands on whatever field
    // the close revealed. Over a script frame there is no field on top and the
    // sweep waits — the drawn Wrogowie belong to a frame deeper down.
    // 19.1 out of a round of a looping fight is out of the whole creature:
    // there is nobody left swinging at the next head, and a loop frame is
    // never left on screen. Nothing cut is kept — see the frame's own note.
    let shut = shutFight(beforeState, before);
    const revealed = top(shut);
    if (sweep.length > 0 && revealed.phase === "field") {
      shut = replaceTop(shut, {
        ...revealed,
        fought: [...new Set([...(revealed.fought ?? []), ...sweep])],
      });
    }
    left = { game: { turn_state: shut } };
  } else if (succeeded && before.phase === "field") {
    /**
     * Slipping past what is lying here, before any fight began.
     *
     * Without this the escape was invisible: it ended no fight, because there
     * was no fight yet, and left every Wróg sitting in the modal still asking
     * to be fought. Succeeding looked exactly like failing.
     */
    const fled = byAbility
      ? before.drawn.filter((entry) => isFoeClass(entry.cardClass)).map((entry) => entry.cardId)
      : [];
    if (fled.length > 0) {
      left = {
        game: {
          turn_state: replaceTop(beforeState, {
            ...before,
            fought: [...new Set([...(before.fought ?? []), ...fled])],
          }),
        },
      };
    }
  }

  return {
    writes: mergeAll(spoken, left, {
      journal: [
        {
          seatId: fleeing.id,
          round: snapshot.game.round,
          kind: succeeded ? "escape" : "escape-failed",
          payload: {
            onBridge,
            ...(circle && succeeded ? { spell: KRAG_PLOMIENI } : {}),
          },
        },
      ],
    }),
    // Said out loud. A failed attempt changes nothing on the board — 19.1 is
    // not a die roll, so there is no state for the interface to notice — which
    // meant the answer "no" was indistinguishable from the button doing
    // nothing at all.
    result: { succeeded, onBridge },
  };
}

/* --------------------------------------------------------------------------
 * Where a fight ends.
 * ----------------------------------------------------------------------- */
