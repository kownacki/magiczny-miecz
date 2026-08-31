/** A fight from the moment it opens to the moment somebody walks away from it (17.3-17.7, 19), and the Zaklęcia spoken into it (9.6, 9.7). */

import type { SpellId } from "@/data/ids";
import {
  bestShield,
  canEscapeAt,
  diesForYou,
  heldAbilities,
  rollModifier,
  insteadAgainst,
  beatsWithoutFighting,
  cannotUseSpells,
  immuneToSpell,
  raidsForYou,
  type EscapeTarget,
  stealsLife,
} from "@/lib/engine/abilities";
import {
  asFieldId,
  foeBonusAt,
  KAMIENNY_MOST,
  ringFields,
  ringOf,
  type FieldId,
} from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { RAID_RANGE, withinRaid } from "@/lib/engine/raid";
import { BRIDGE_ORDEAL, BRIDGE_SIDE } from "@/lib/engine/bridge";
import { combatValueOf, isArms, refusesArms, roundsOf } from "@/lib/engine/cards";
import {
  advanceLoop,
  closeLoopFrame,
  loopBeneath,
  openLoop,
  roundFinishes,
  roundOf,
  settleExposedLoop,
} from "@/lib/engine/loop";
import { attackAsOne, type CombatKind } from "@/lib/engine/combat";
import { abilitiesOfCharacter, asCharacterId } from "@/lib/engine/characters";
import { bonusFromHoldings, inEffect, suppressesSpells } from "@/lib/engine/holdings";
import {
  castableNow,
  momentsIn,
  spellScript,
  unattackableAfter,
  type SpellScript,
} from "@/lib/engine/spells";
import {
  endFight,
  recordFightRoll,
  setFightTotal,
  startFight,
  type Fight,
  type TurnPhase,
} from "@/lib/engine/turn";
import { EVENTS, SPELL_BY_ID } from "../decks";
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
import { liftOffField } from "./holdings";
import { applyEffect, type Decisions } from "./effects";
import { scriptFor } from "@/lib/engine/cardScript";
import type { Effect } from "@/lib/engine/cardScript";
import { summariseEffect } from "@/lib/engine/effectText";
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
import {
  activeSeat,
  eqModeOf,
  holdingsOf,
  pointsOf,
  refuseWhileHeld,
  seatById,
  seatView,
  trophyModeOf,
} from "./seat";
import { refuseAgainstStone } from "./stone";
import { slotOnArrival } from "@/lib/engine/holdings";
import { slotsFor } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import type { Slot } from "@/lib/engine/slots";
import { FLOOR_MS, floorOf } from "./spellFloor";
import { afterFight, hasAttacked, missionOf, spellsHushed } from "@/lib/engine/status";
import { addEffect, keepOnly, refuseAgainst13_2, statusesOf } from "./turn";
import type { SeatRow } from "../store";
import { settleBridge, settleCrossing } from "./bridge";
import { spendLife } from "./life";

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
function againstThese(
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
  return below.phase === "field" ? replaceTop(pop(state), endFight(fight)) : pop(state);
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
   * "Nie możesz też rzucać Zaklęć" (Zaczarowane Wzgórza), and "Nie możesz tu
   * używać Zaklęć" (Rozstajne Drogi II).
   *
   * Asked of its own list rather than of the Przedmiot one. The Wzgórza carry
   * both rules and the two Rozstajne Drogi carry one apiece, so reading the
   * item list for this banned magic on the crossroads that permits it and
   * allowed it on the one that does not.
   */
  if (suppressesSpells(caster.field_id)) {
    throw new Error(`${fieldName(caster.field_id as FieldId)}: tu nie rzuca się Zaklęć.`);
  }

  /**
   * The same prohibition arriving as a status rather than as an Obszar.
   *
   * „Żaden gracz, łącznie z tobą" — the Wojna Żywiołów puts it on every seat at
   * once, so the caster who spoke it is refused by their own spell for the rest
   * of their turn, which is what „łącznie z tobą" says.
   */
  const hushed = spellsHushed(statusesOf(snapshot, caster.id));
  if (hushed) throw new Error(`${hushed} — nikt teraz nie rzuca Zaklęć.`);

  /**
   * "Właściciel Kryształu nie może rzucać ani używać Zaklęć."
   *
   * Half of one bargain — the other half is an immunity to six named Zaklęcia
   * and to an opponent's Odrodzenie, which waits on the spell effects being
   * applied at all (see `castSpell`'s note on why they are not). This half
   * needs nothing but a refusal, and refusing is the half that can be got
   * wrong in the player's favour.
   */
  if (cannotUseSpells(seatView(snapshot, caster.id).abilities)) {
    throw new Error("Właściciel Kryształu Magów nie rzuca ani nie używa Zaklęć.");
  }

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
    const lifted = statusesOf(snapshot, caster.id).filter(
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
   * Written once: a second duel adds nothing, and a character with two marks
   * would read as twice the sinner for no reason the card gives.
   */
  const marked = hasAttacked(statusesOf(snapshot, attacker.id))
    ? {}
    : addEffect(snapshot, {
        seatId: attacker.id,
        effect: {
          source: "13.3",
          label: "Podniósł rękę na inną Postać",
          modifier: { kind: "attacker" },
          ends: { kind: "dispelled" },
        },
      });

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
            .filter((entry) => entry.cardClass === "foe")
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
      ? before.drawn.filter((entry) => entry.cardClass === "foe").map((entry) => entry.cardId)
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

/**
 * Settles a fight whose dice have been compared (17.4).
 *
 * The join between this cluster and the bridge's, which is why it is last: a
 * guardian is not a card. It charges what its doorway charges rather than the
 * usual point of Życie, and winning carries the character through instead of
 * returning it to the Obszar the fight interrupted — so the two endings share
 * only the clearing-up at the top.
 *
 * One die, and only sometimes: the Hełm/Tarcza/Zbroja save of 17.4, thrown
 * once against the widest of them rather than once per item.
 */
/**
 * What the winner of a duel takes (17.9).
 *
 * "Zwycięzca ma prawo zmusić pokonanego do utraty jednego punktu Życia (czemu
 * może zapobiec użycie odpowiednich Przedmiotów lub Zaklęć) lub zabrać mu jeden
 * Przedmiot (również Magiczny) albo Sztukę Złota."
 *
 * Three ways to end a duel and the app could only do one of them: it always
 * took the Życie, so a winner who wanted the Magiczny Miecz off a beaten rival
 * had no way to say so, and the referee was making the choice the rulebook
 * gives the player — the same fault the trophies had before the subset ruling.
 *
 * Only a duel offers it. Against a Karta there is nobody to rob: a Wróg has no
 * purse and no pack, and 1.4 already says what a beaten one is worth.
 */
export type Spoils =
  | { take: "zycie" }
  | { take: "zloto" }
  /** Which Przedmiot, because "jeden Przedmiot" is one the winner points at. */
  | { take: "przedmiot"; holdingId: string };

export async function resolveFight(
  snapshot: Snapshot,
  command: { spoils?: Spoils } | void,
  ports: CommandPorts,
): Promise<Outcome<void>> {
  const state = requireTop(snapshot.game.turn_state, "fight");

  const seat = activeSeat(snapshot);
  const { fight } = state;
  if (!fight.result) throw new Error("Walka nie jest rozstrzygnięta.");

  /**
   * Whether this fight was a round of something bigger, and whether settling
   * it settles the creature (law 3, docs/STACK.md).
   *
   * Everything a kill pays out — the trophy (1.4), the Władca's errand,
   * Excalibur's stolen point — is owed for beating the Wróg, and a head is not
   * the Wróg. What a round does cost is the ordinary one: 17.4 takes a point
   * of Życie for losing a fight, and a head is a fight.
   */
  const inLoop = loopBeneath(snapshot.game.turn_state);
  const kill = inLoop === null || roundFinishes(inLoop, fight.result.outcome);

  // 17.4 ends a fight the moment the dice are compared — win, lose or draw —
  // so anything that lasts "one fight" is spent whichever way it went.
  const cleared = keepOnly(snapshot, seat.id, afterFight(statusesOf(snapshot, seat.id)));

  if (fight.guardian) {
    const outcome = fight.result.outcome;
    const at = apply(snapshot, cleared);
    const settled =
      fight.guardian.kind === "bridge"
        ? settleBridge(at, fight.guardian.entrance, outcome).writes
        : fight.guardian.kind !== "bridge-field"
          ? settleCrossing(at, fight.guardian.crossing, outcome).writes
          : {};

    const said: Changeset = {
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "guardian-end",
          payload: { guardian: fight.cardName, outcome, enemyTotal: fight.enemyTotal },
        },
      ],
    };

    // 14.6: the Demon and the Monstrum stand in the way rather than at a door.
    // Beating one lets the character walk on next turn; losing costs a point of
    // Życie and it is still there. Either way the character does not move — the
    // bridge is one Obszar a turn and this turn was the fight. Merged after the
    // line above so the journal reads in the order it happened: beaten by the
    // creature, then dead of it.
    const soFar = mergeAll(cleared, settled, said);
    if (fight.guardian.kind !== "bridge-field" || outcome !== "przegrana") {
      return { writes: soFar, result: undefined };
    }
    const cost = spendLife(apply(snapshot, soFar), seat.id, 1);
    return { writes: merge(soFar, cost.writes), result: undefined };
  }

  // In a duel the loser may be either side; against a card only the character
  // can lose.
  const loser =
    fight.result.outcome === "przegrana"
      ? seat
      : fight.result.outcome === "wygrana" && fight.opponentSeat !== undefined
        ? snapshot.seats.find((s) => s.seat_index === fight.opponentSeat)
        : undefined;

  /**
   * 17.9's other two spoils, which end the duel without a blow being struck.
   *
   * Taken here rather than after the life machinery because they replace it:
   * "lub zabrać mu jeden Przedmiot albo Sztukę Złota" is an alternative to
   * forcing the loss, so no osłona is rolled (17.4 is about a blow landing and
   * none does), no Giermek dies in anybody's place, and Excalibur takes
   * nothing — its own clause is about a point of Życie.
   *
   * Only where the winner is the one who asked. A duel the *drawer* lost is
   * settled against them and there is nothing for them to choose.
   */
  const spoils = command && command.spoils ? command.spoils : null;
  const robbing =
    spoils !== null &&
    spoils.take !== "zycie" &&
    loser !== undefined &&
    fight.opponentSeat !== undefined &&
    fight.result.outcome === "wygrana";

  let paid: Changeset = {};
  if (robbing && loser && spoils) {
    paid = takeSpoils(snapshot, seat, loser, spoils);
  } else if (loser) {
    // Nothing is rolled for a raid: the character never stood in the fight, so
    // there is no blow for a Zbroja to turn (17.4).
    const save = fight.raid
      ? { writes: {} as Changeset, result: false }
      : await shieldSaves(apply(snapshot, cleared), { seatId: loser.id, kind: fight.kind }, ports);
    if (fight.raid) {
      /**
       * A raid the friend lost. "W przypadku porażki ty nie tracisz punktu
       * Życia, ale twój Przyjaciel ginie" — so no osłona is rolled (17.4 is
       * about a blow landing on the character, and none did) and no life is
       * spent. The Poszukiwacz is the only one who can answer here, because
       * `raiding` is what his `onlyWhenRaiding` was waiting for.
       */
      paid =
        fight.result.outcome === "przegrana" && !fight.raid.summoned
          ? (await friendDiesInstead(apply(snapshot, cleared), { seatId: seat.id, raiding: true }, ports))
              .writes
          : {};
    } else if (save.result) {
      paid = save.writes;
    } else {
      // 17.4 failed, so the point is really about to be lost — which is the
      // moment the Giermek rolls and the Rumak steps in. A friend that dies
      // here saves the point outright, so nothing is spent after it.
      const stoodIn = await friendDiesInstead(
        apply(snapshot, mergeAll(cleared, save.writes)),
        { seatId: loser.id },
        ports,
      );
      const upToNow = mergeAll(cleared, save.writes, stoodIn.writes);
      paid = stoodIn.result
        ? merge(save.writes, stoodIn.writes)
        : mergeAll(
            save.writes,
            stoodIn.writes,
            spendLife(apply(snapshot, upToNow), loser.id, 1).writes,
          );
    }
  }

  /**
   * The Władca's errand, if this fight was it.
   *
   * "1 - pokonasz Wroga; 2-3 pokonasz inną Postać (po wypełnieniu misji
   * zostaniesz natychmiast przeniesiony do Twierdzy)." Read here because this
   * is where a win becomes a fact, and marked rather than paid out: the Tarcza
   * is the Władca's to give and he is at the Twierdza. The Postać errand is the
   * one the board carries you back for, which is the difference between an
   * errand you have done and one you have delivered.
   *
   * A raid does not count. The Poszukiwacz Przygód fights on his own account —
   * it is his three points against them — and the Władca asked *you* to beat
   * somebody.
   */
  const errand = fight.raid || !kill ? {} : missionDone(snapshot, seat, fight);

  /**
   * Excalibur's point of Życie, taken after everything the loss already cost.
   *
   * Chained through `apply` rather than merged flat, because the point it takes
   * is off a Życie the lines above may already have moved — `paid` spends the
   * loser's for losing — and `merge` resolves two writes to one column as later
   * wins rather than as a sum.
   */
  const upToNow = mergeAll(cleared, paid, errand);
  const stolen = kill ? stolenLife(apply(snapshot, upToNow), seat, fight) : {};
  const cleared_ = beatenOffTheBoard(apply(snapshot, mergeAll(upToNow, stolen)), fight);

  /**
   * What the stack does with a settled round.
   *
   * The fight pops either way; what is underneath decides the rest. Under a
   * loop, a win that is not the last one puts the next head up in this same
   * commit — the player pressed the only button there was, and a loop frame is
   * never left on screen by itself — and anything else closes the attempt.
   *
   * The next head's `playerTotal` is read again rather than copied, because
   * `keepOnly(afterFight(...))` has just spent everything that lasted one
   * fight: a Zaklęcie that made the first head easy is gone by the second, and
   * carrying the old figure forward would fight three heads with one card.
   */
  const closed = ((): { state: TurnState; said: Record<string, unknown> } => {
    const popped = closeFightFrame(snapshot.game.turn_state, state);
    if (!inLoop) return { state: popped, said: {} };

    // Which round this was, for a line that says "głowa 2 z 3" rather than
    // reporting the whole creature beaten or lost three times over.
    const which = { creature: inLoop.round, round: inLoop.done + 1, times: inLoop.times };
    const step = advanceLoop(inLoop, fight.result.outcome);
    if (step.go === "again") {
      const fresh = againstThese(apply(snapshot, mergeAll(upToNow, stolen)), seat.id, [
        inLoop.of.cardId,
      ]);
      const next = roundOf(step.loop);
      return {
        state: push(replaceTop(popped, step.loop), {
          ...next,
          fight: {
            ...next.fight,
            playerTotal: inLoop.of.kind === "magical" ? fresh.magia : fresh.miecz,
          },
        }),
        said: which,
      };
    }
    return {
      state: closeLoopFrame(popped, inLoop),
      // A win on the last round is the creature dead, and the line says so
      // with no talk of heads. Anything else is the attempt ending, and what
      // it cost is the heads that grew back.
      said: step.go === "won" ? {} : { ...which, regrown: step.regrown },
    };
  })();

  /**
   * What the creature's own card takes off whoever it beat.
   *
   * Exactly one Wróg in the box has this — "Każdej pokonanej Postaci,
   * Złoczyńca zabiera do wyboru: 1 Sztukę Złota lub jeden Przedmiot" — and it
   * is on top of 17.4's point of Życie rather than instead of it.
   *
   * Run after the frame has closed, against the state that close produced, so
   * the toll's own question suspends onto the field the fight was interrupting
   * rather than onto the fight itself. A duel has no card to consult, and a
   * raid was not the character's own fight to lose.
   */
  const beaten = mergeAll(upToNow, stolen, cleared_, {
    game: { turn_state: closed.state },
  });
  const toll =
    fight.result.outcome === "przegrana" &&
    fight.opponentSeat === undefined &&
    fight.raid === undefined
      ? await tollFor(apply(snapshot, beaten), seat.id, fight, ports)
      : {};

  return {
    // `toll` comes last of all, and has to: `merge` resolves two writes to one
    // column as later-wins, and the toll's own question is a frame pushed onto
    // the state the close produced. Merged before it, the close would put the
    // state back and the question would be gone.
    writes: mergeAll(upToNow, stolen, cleared_, kill ? trophiesFrom(snapshot, seat, fight) : {}, {
      game: { turn_state: closed.state },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "fight-end",
          payload: { cardId: fight.cardId, outcome: fight.result.outcome, ...closed.said },
        },
      ],
    }, toll),
    result: undefined,
  };
}

/**
 * The toll a creature's card charges whoever it beat, if its card charges one.
 *
 * `fought` rather than `cardId`, because 17.5 packs several creatures into one
 * fight and joins their ids with a "+": what beat you may be three cards, and
 * each of them may have something to say about it.
 *
 * Whatever the toll asks is asked through the ordinary suspension machinery —
 * a `wybor` becomes a `script` frame above the field the fight was
 * interrupting, answered by `answerScript` like every other card's question.
 */
async function tollFor(
  snapshot: Snapshot,
  seatId: string,
  fight: Fight,
  ports: CommandPorts,
): Promise<Changeset> {
  let writes: Changeset = {};
  for (const cardId of fight.fought ?? [fight.cardId]) {
    const owed = scriptFor(cardId)?.przegrana;
    if (!owed) continue;
    const done = await applyEffect(
      apply(snapshot, writes),
      {
        seatId,
        effect: owed,
        reason: EVENTS.find((one) => one.id === cardId)?.name ?? cardId,
        cardId,
        shuffle: (items) => [...items],
      },
      ports,
    );
    writes = merge(writes, done.writes);
  }
  return writes;
}

/**
 * A Wróg beaten where he lay, taken off the board (12.1, 16.8).
 *
 * Only a fight the character never stood in: a wyprawa or a summoned creature
 * reaches an Obszar the seat is not on, so the Karta is a row on the board
 * rather than a card in the stack in front of them, and nothing in the ordinary
 * settle knows about it. Beaten and left lying, he could be killed again every
 * turn by the same Przyjaciel — and the Golem's card says outright what happens
 * instead: „Wróg jest zdejmowany z planszy".
 *
 * To the stos zużytych rather than out of the game, like everything else that
 * leaves a hand or a field: `putOnPile` keeps a conjured card out of it and
 * knows the Wyposażenie is a stock. No trophy — `trophiesFrom` already refuses
 * a raid, because the Karta was not beaten by the character.
 */
function beatenOffTheBoard(snapshot: Snapshot, fight: Fight): Changeset {
  const rowId = fight.raid?.fieldCardId;
  if (!rowId || fight.result?.outcome !== "wygrana") return {};
  const lying = snapshot.fieldCards.find((row) => row.id === rowId);
  if (!lying) return {};
  const lifted: Changeset = { fieldCards: { delete: [lying.id] } };
  return merge(lifted, putOnPile(apply(snapshot, lifted), "events", [asReturnable(lying)]));
}

/**
 * A point of Życie off the beaten opponent, for whatever does that (Excalibur).
 *
 * "Po każdej zwycięskiej walce Postać zyskuje także 1 punkt Życia (zabierając
 * ten punkt pokonanemu przeciwnikowi)."
 *
 * The parenthesis is bookkeeping and not flavour, so a duel really does move
 * the point: the loser pays one for losing (17.9) and another to Excalibur, and
 * a lost duel against it costs two. That can be the second one's last, and it
 * goes through `spendLife` for exactly that reason — 4.4 is then somebody
 * else's rule to apply, not a special case here.
 *
 * A Wróg has no Życie track to take from, so the winner simply gains. The gain
 * is uncapped: 4.7's ceiling of four is about what a Uzdrowiciel restores, and
 * 4.6 says points won are not healing.
 *
 * Not on a raid. The Poszukiwacz fights on his own account — his three points
 * against theirs — and the Excalibur is in your pack, not in his hand. The same
 * reading `missionDone` and `trophiesFrom` already take.
 */
function stolenLife(snapshot: Snapshot, seat: SeatRow, fight: Fight): Changeset {
  if (fight.result?.outcome !== "wygrana" || fight.raid) return {};

  const points = stealsLife(seatView(snapshot, seat.id).abilities);
  if (points < 1) return {};

  const winner = snapshot.seats.find((one) => one.id === seat.id);
  if (!winner) return {};

  const gained: Changeset = {
    seats: [{ id: seat.id, patch: { life: winner.life + points } }],
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "healed",
        payload: { points, stolen: true },
      },
    ],
  };

  const loser =
    fight.opponentSeat === undefined
      ? undefined
      : snapshot.seats.find((one) => one.seat_index === fight.opponentSeat);
  if (!loser || loser.eliminated) return gained;

  return merge(gained, spendLife(apply(snapshot, gained), loser.id, points).writes);
}

/**
 * 17.9's Przedmiot or Sztuka Złota, moved from the loser to the winner.
 *
 * A Przedmiot changes hands rather than being destroyed — "zabrać mu jeden
 * Przedmiot" — so the holding is reseated and not deleted, which also keeps
 * 21.2's stock right: the card never leaves play and no pile has to be told.
 * It arrives the way anything else arrives, through `slotOnArrival`, so in
 * slotowy a won Miecz goes onto the arm if the arm is free.
 *
 * The gold is a number on both seats (3.5) and moves as one.
 */
function takeSpoils(
  snapshot: Snapshot,
  winner: SeatRow,
  loser: SeatRow,
  spoils: Spoils,
): Changeset {
  const said = (what: string): Changeset => ({
    journal: [
      {
        seatId: winner.id,
        round: snapshot.game.round,
        kind: "duel",
        payload: { spoils: spoils.take, what, from: loser.seat_index },
      },
    ],
  });

  if (spoils.take === "zycie") return {};

  if (spoils.take === "zloto") {
    if (loser.gold < 1) throw new Error("Pokonany nie ma Sztuki Złota (17.9).");
    return merge(
      {
        seats: [
          { id: loser.id, patch: { gold: loser.gold - 1 } },
          { id: winner.id, patch: { gold: winner.gold + 1 } },
        ],
      },
      said("1 Sz. Z."),
    );
  }

  const held = snapshot.holdings.find(
    (one) => one.id === spoils.holdingId && one.seat_id === loser.id && one.kind === "item",
  );
  if (!held) throw new Error("Pokonany nie ma takiego Przedmiotu (17.9).");

  const slot = slotOnArrival({
    cardId: held.card_id,
    kind: "item",
    eqMode: eqModeOf(snapshot.game),
    nature: (winner.nature ?? null) as Nature | null,
    worn: holdingsOf(snapshot, winner.id).map((one) => one.slot as Slot | null),
  });

  return merge(
    {
      holdings: {
        patch: [{ id: held.id, patch: { seat_id: winner.id, slot, ordinal: null } }],
      },
    },
    said(cardName(held.card_id)),
  );
}

/**
 * The Karty of the Wrogowie just beaten, kept to be cashed in later (1.4, 16.2).
 *
 * "Karty pokonanych Wrogów należy zatrzymać, ponieważ w dowolnym momencie mogą
 * zostać wymienione na dodatkowe punkty Miecza." A beaten Wróg is not spent
 * when it is beaten — that is what makes it a trophy — and `tradeTrophies` is
 * where it finally reaches the used pile.
 *
 * Only the ones with a printed Miecz. 1.4 says so twice over: the walks are
 * "z napotkanymi Wrogami (mającymi określony parametr Miecza)" and 16.2 keeps
 * "Karty pokonanych Wrogów **tego rodzaju**". A Demon is fought magically and
 * carries a Magia, so it is beaten and gone, and the seven-point arithmetic
 * never has to decide what a Magia is worth in Miecze.
 *
 * Nothing for a duel — 17.9 gives the winner a Życie, a Przedmiot or a Sztuka
 * Złota, and the loser is a Postać rather than a Karta — and nothing for a
 * guardian, who is not a drawn card and stays at his door either way.
 *
 * 17.5's pack is settled as one and every creature in it becomes its own
 * trophy, which is what `fought` already lists.
 */
function trophiesFrom(snapshot: Snapshot, seat: SeatRow, fight: Fight): Changeset {
  if (fight.result?.outcome !== "wygrana") return {};
  if (fight.opponentSeat !== undefined || fight.guardian || fight.raid) return {};

  // Carrying the points rather than the card: what a trophy is worth is the
  // only thing either mode wants from it, and `punkty` keeps nothing else.
  const won = (fight.fought ?? [fight.cardId]).flatMap((cardId) => {
    const card = EVENTS.find((one) => one.id === cardId);
    /**
     * `playerTotal` and not `enemyTotal`, for the one card that mirrors.
     *
     * The Sobowtór is worth what he fought at, and what he fought at is his
     * opponent's Miecz — which is this, and stays this whether he came alone or
     * in a pack under 17.5, where `enemyTotal` is the whole pack's sum and his
     * share of it is not separable.
     */
    const foe = card ? combatValueOf(card, { miecz: fight.playerTotal }) : null;
    return foe && foe.kind === "ordinary" ? [{ cardId, points: foe.total }] : [];
  });
  if (won.length === 0) return {};

  // The mark travels onto the holding: a conjured Cyklop must not reach a pile
  // the deck still holds its own copy of. See `granted` in db/schema.sql.
  const staged = new Set(
    (fight.drawn ?? []).filter((entry) => entry.granted === true).map((entry) => entry.cardId),
  );

  const said: Changeset = {
    journal: won.map(({ cardId }) => ({
      seatId: seat.id,
      round: snapshot.game.round,
      kind: "taken" as const,
      payload: { cardId, kind: "trophy" },
    })),
  };

  /**
   * In `punkty` the Karta does not stay: it goes to the used pile at once and
   * the seat keeps the number that was printed on it.
   *
   * Which is the whole of the variant. 9.5 refills the deck from that pile, so
   * a Wróg beaten here is a Wróg somebody can meet again — where in `karty` he
   * sits in a pack until traded, and an eighth of the Karty Zdarzeń can end up
   * doing that at once. See docs/TROFEA.md.
   *
   * A conjured Wróg is worth his points and reaches no pile, because the deck
   * never gave that copy up. Both halves of `granted` matter here and they pull
   * different ways, which is why the pile is asked separately from the score.
   */
  /**
   * The one thing the two modes disagree about: when the cardboard goes back.
   *
   * Both hoard the trophy, both let you choose when and what to hand in, and
   * both lose the points above a multiple of seven — 1.4 entire, in either
   * variant. „Punkty" differs by returning the Wróg's Karta the moment he dies
   * rather than when he is cashed in, so what the seat keeps is a copy of him.
   *
   * Which is the whole of the variant, and it is mechanical: 9.5 refills the
   * deck from that pile, so a Wróg beaten here is a Wróg somebody can meet
   * again — where in „Karty pokonanych" he sits in a pack until traded, and an
   * eighth of the Karty Zdarzeń can be doing that at once. See docs/TROFEA.md.
   *
   * A conjured Wróg is worth his points and reaches no pile, because the deck
   * never gave that copy up. Both halves of `granted` matter and they pull
   * different ways, which is why the pile is asked separately from the trophy.
   */
  const returned =
    trophyModeOf(snapshot.game) === "points"
      ? putOnPile(
          snapshot,
          "events",
          won
            .filter(({ cardId }) => !staged.has(cardId))
            .map(({ cardId }) => ({ cardId, granted: false })),
        )
      : {};

  return mergeAll(
    said,
    {
      holdings: {
        insert: won.map(({ cardId }) => ({
          seat_id: seat.id,
          card_id: cardId,
          kind: "trophy" as const,
          face: "open" as const,
          granted: staged.has(cardId),
        })),
      },
      seats: [
        {
          id: seat.id,
          patch: {
            /**
             * The shelf, in both modes, beside the trophy rather than instead
             * of it — because the trophy stops saying who you beat the moment
             * 1.4 is used on it. A cashed trophy is deleted, so the holdings
             * alone can only ever show who you *still* have.
             *
             * Display only: no rule reads it, and 1.4's arithmetic runs off the
             * holdings in either mode. A conjured Wróg is on it too — he was
             * still beaten, and the shelf is about that rather than about which
             * pile his Karta belongs to.
             *
             * # Reading the two lists together
             *
             * Beaten minus held is the Wrogowie whose trophies have gone, which
             * is what a shelf wants to draw greyed and last. Two things to know
             * before deriving it:
             *
             * - **It is a multiset.** Two Nobbiny are two entries here and two
             *   holdings, and set subtraction would call the second one gone.
             * - **„Sold" is not quite the word.** `dropCard` also lets a trophy
             *   go, and the difference between selling and discarding one is
             *   not recorded. What the list means is "beaten, and no longer
             *   held".
             */
            trophy_beaten: [...seat.trophy_beaten, ...won.map(({ cardId }) => cardId)],
          },
        },
      ],
    },
    returned,
  );
}

/**
 * Marks the Władca's errand done, where this fight was what he asked for.
 *
 * Nothing at all when there is no errand, when it is a gold one, when it is
 * already done, or when the fight was lost — four ways of not being the thing
 * that was asked, and none of them worth a journal line.
 */
function missionDone(snapshot: Snapshot, seat: SeatRow, fight: Fight): Changeset {
  if (fight.result?.outcome !== "wygrana") return {};
  const errand = missionOf(statusesOf(snapshot, seat.id));
  if (!errand || errand.done) return {};

  const wanted = fight.opponentSeat !== undefined ? "character" : "foe";
  if (errand.what !== wanted) return {};

  return {
    effects: {
      patch: [
        {
          id: errand.id,
          patch: {
            modifier: { kind: "mission", what: errand.what, done: true },
            label: "Misja wypełniona — wróć po Tarczę",
          },
        },
      ],
    },
    // "po wypełnieniu misji zostaniesz natychmiast przeniesiony do Twierdzy" —
    // only the errand against another Postać carries you back.
    ...(errand.what === "character"
      ? { seats: [{ id: seat.id, patch: { field_id: "twierdza-strzegaca-drog" } }] }
      : {}),
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "effect",
        payload: { source: "twierdza-strzegaca-drog", label: "Misja wypełniona" },
      },
    ],
  };
}
