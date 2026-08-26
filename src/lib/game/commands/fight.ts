/** A fight from the moment it opens to the moment somebody walks away from it (17.3-17.7, 19), and the Zaklęcia spoken into it (9.6, 9.7). */

import type { SpellId } from "@/data/ids";
import {
  bestShield,
  canEscapeAt,
  heldAbilities,
  type EscapeTarget,
} from "@/lib/engine/abilities";
import { KAMIENNY_MOST, ringOf } from "@/lib/engine/board";
import { BRIDGE_ORDEAL, BRIDGE_SIDE } from "@/lib/engine/bridge";
import { combatValueOf } from "@/lib/engine/cards";
import { attackAsOne, type CombatKind } from "@/lib/engine/combat";
import { abilitiesOfCharacter, asCharacterId } from "@/lib/engine/characters";
import { inEffect, suppressesItems } from "@/lib/engine/holdings";
import {
  castableNow,
  momentsIn,
  spellScript,
  type SpellScript,
} from "@/lib/engine/spells";
import {
  endFight,
  recordFightRoll,
  setFightTotal,
  startFight,
} from "@/lib/engine/turn";
import { EVENTS, SPELL_BY_ID } from "../decks";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import { asReturnable, putOnPile } from "./piles";
import { activeSeat, eqModeOf, holdingsOf, pointsOf, seatById, seatView } from "./seat";
import { floorOf } from "./spellFloor";
import { afterFight } from "@/lib/engine/status";
import { keepOnly, statusesOf } from "./turn";
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
export function beginFight(snapshot: Snapshot, command: BeginFight): Outcome<void> {
  const seat = activeSeat(snapshot);
  const state = snapshot.game.turn_state;
  if (state.phase !== "field") throw new Error("Nie czas na walkę.");
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

  const foes = command.cardIds.map((cardId) => {
    const card = EVENTS.find((c) => c.id === cardId);
    if (!card) throw new Error(`Nieznana karta: ${cardId}`);
    // Only a Wróg fights. The Miecz on Excalibur and the Magia on Pierścień
    // Mocy are bonuses to their holder (1.5, 2.5), not creatures to be rolled
    // against.
    const foe = combatValueOf(card);
    if (!foe) throw new Error(`${card.name} nie jest Wrogiem.`);
    return { card, foe };
  });

  // 17.5: several creatures attacking at once are one opponent — "Miecze tych
  // istot są sumowane, a do uzyskanego rezultatu dodawany jest wynik rzutu
  // kostką". One roll for the lot of them, not one each, which is the
  // difference between hard and hopeless.
  const asOne = attackAsOne(foes.map((f) => f.foe));
  if (!asOne) {
    throw new Error("Zwykli i magiczni Wrogowie nie atakują razem — rozpatrzcie osobno.");
  }
  const { kind, total } = asOne;

  // The character brings everything it has (1.5, 17.4), not just its own
  // tokens: a Miecz card adds its point in the fight it was found for.
  const mine = pointsOf(snapshot, seat.id, "walka");

  return {
    writes: {
      game: {
        turn_state: startFight(
          state,
          {
            cardId: foes.map((f) => f.card.id).join("+"),
            cardName: foes.map((f) => f.card.name).join(" + "),
            settles: foes.map((f) => f.card.id),
            // Carried through from the stack: a fight staged by a test is one
            // the deck never dealt, and the sheet says so over the card's own
            // picture.
            ...(state.drawn.some(
              (entry) => command.cardIds.includes(entry.cardId) && entry.granted,
            )
              ? { granted: true }
              : {}),
            ...(kind === "magiczna" ? { magia: total } : { miecz: total }),
          },
          mine,
        ),
      },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "fight-start",
          payload: {
            cardIds: [...command.cardIds],
            enemyTotal: total,
            together: command.cardIds.length > 1,
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
  const state = snapshot.game.turn_state;
  if (state.phase !== "field") throw new Error("Nie czas na walkę.");

  const { name, miecz, magia } = command;
  return {
    writes: {
      game: {
        turn_state: startFight(
          state,
          {
            cardId: `pole:${name}`,
            cardName: name,
            ...(magia !== undefined ? { magia } : { miecz }),
            settles: [],
          },
          pointsOf(snapshot, seat.id, "walka"),
        ),
      },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "fight-start",
          payload: { nazwa: name, enemyTotal: miecz ?? magia },
        },
      ],
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
  target?: { seatIndex?: number; note?: string; fieldCardId?: string };
}

export interface Cast {
  /** The card's printed name, for the notice the caster reads back. */
  spell: string;
  /** What the table now has to do, in the card's own words. */
  effect: string;
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
export function castSpell(
  snapshot: Snapshot,
  command: CastSpell,
  ports: CommandPorts,
): Outcome<Cast> {
  const target = command.target ?? {};
  const caster = snapshot.seats.find((s) => s.id === command.seatId);
  if (!caster) throw new Error("Nie ma takiego gracza.");

  const held = snapshot.holdings.find(
    (h) => h.id === command.holdingId && h.seat_id === command.seatId && h.kind === "spell",
  );
  if (!held) throw new Error("Ta Postać nie ma tego Zaklęcia.");

  const script = spellScript(held.card_id);
  const spell = SPELL_BY_ID.get(held.card_id);

  // 9.7: "Żadne Zaklęcie nie działa na istoty napotkane na Kamiennym Moście ani
  // na samą Bestię." Where the caster stands is what decides it.
  // "Nie możesz też rzucać Zaklęć." The same sentence that suspends the
  // Przedmioty here, and the half of it that is about speaking rather than
  // carrying.
  if (suppressesItems(caster.field_id)) {
    throw new Error("Na Zaczarowanych Wzgórzach nie rzuca się Zaklęć.");
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
  const state = snapshot.game.turn_state;
  const inAFight = state.phase === "fight";

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

  // Chained, not merged: a Władca Czarów puts a whole second hand on the same
  // `game.deck` the line above just wrote, and side by side one of the two
  // would be dropped without a word.
  const applied = script?.applies
    ? applySpell(apply(snapshot, cast), script.applies, target)
    : null;

  const victim =
    target.seatIndex !== undefined
      ? (snapshot.seats.find((s) => s.seat_index === target.seatIndex)?.player_name ?? null)
      : null;

  const said: Changeset = {
    journal: [
      {
        seatId: caster.id,
        turn: snapshot.game.turn,
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

  const soFar = mergeAll(cast, applied?.writes ?? {}, said);

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
  const after = apply(snapshot, soFar).game.turn_state;
  const cleared: Changeset =
    inAFight && after.phase === "fight"
      ? {
          game: {
            turn_state: {
              ...after,
              fight: {
                ...after.fight,
                caster: null,
                playerRoll: null,
                enemyRoll: null,
                result: null,
              },
            },
          },
        }
      : {};

  return {
    writes: merge(soFar, cleared),
    result: {
      spell: spell?.name ?? held.card_id,
      effect: script?.effect ?? spell?.text ?? "",
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
    writes: { game: { turn_state: setFightTotal(snapshot.game.turn_state, command.total) } },
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
  const state = snapshot.game.turn_state;
  if (state.phase !== "fight") throw new Error("Nie ma walki.");

  // 17.3 puts the spells before the dice, so the dice wait — but only while
  // somebody actually holds the floor, and only until it lapses. Checked here
  // and not only in the interface, because a claim one device can roll straight
  // through is not a claim.
  const floor = floorOf(state.fight, ports.now());
  if (floor) {
    const who = snapshot.seats.find((s) => s.seat_index === floor.seat);
    throw new Error(
      `${who?.player_name ?? "Ktoś"} rzuca Zaklęcie (17.3) — kostki czekają.`,
    );
  }

  const roll = await ports.random.rollD6(
    command.side === "player" ? "walka: rzut Postaci" : "walka: rzut Wroga",
  );
  const manual = command.manual ?? false;

  return {
    writes: {
      game: { turn_state: recordFightRoll(state, command.side, roll) },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "fight-roll",
          payload: { side: command.side, roll },
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
  if (command.kind === "magiczna") return { writes: {}, result: false };

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
          turn: snapshot.game.turn,
          kind: "shielded",
          payload: { die, upTo, saved },
        },
      ],
    },
    result: saved,
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
  if (target.field_id !== attacker.field_id) {
    throw new Error("Spotkanie jest możliwe tylko na tym samym Obszarze (13.1).");
  }
  const state = snapshot.game.turn_state;
  if (state.phase !== "field") throw new Error("Nie czas na spotkanie.");

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

  return {
    writes: {
      game: {
        turn_state: startFight(
          state,
          {
            cardId: `seat:${target.seat_index}`,
            cardName: target.player_name ?? `Miejsce ${target.seat_index + 1}`,
            miecz: theirs.miecz,
            opponentSeat: target.seat_index,
          },
          mine,
        ),
      },
      journal: [
        {
          seatId: attacker.id,
          turn: snapshot.game.turn,
          kind: "duel",
          payload: { target: target.seat_index, field: attacker.field_id },
        },
      ],
    },
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
  const state = snapshot.game.turn_state;

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
          turn: snapshot.game.turn,
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
  const before = apply(snapshot, spoken).game.turn_state;
  let left: Changeset = {};
  if (succeeded && before.phase === "fight") {
    const next = endFight(before);
    const sweep =
      byAbility && przed === "wrog"
        ? before.fight.drawn
            .filter((entry) => entry.cardClass === "foe")
            .map((entry) => entry.cardId)
        : [];
    left = {
      game: {
        turn_state:
          next.phase === "field" && sweep.length > 0
            ? { ...next, fought: [...new Set([...(next.fought ?? []), ...sweep])] }
            : next,
      },
    };
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
          turn_state: {
            ...before,
            fought: [...new Set([...(before.fought ?? []), ...fled])],
          },
        },
      };
    }
  }

  return {
    writes: mergeAll(spoken, left, {
      journal: [
        {
          seatId: fleeing.id,
          turn: snapshot.game.turn,
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
export async function resolveFight(
  snapshot: Snapshot,
  _command: void,
  ports: CommandPorts,
): Promise<Outcome<void>> {
  const state = snapshot.game.turn_state;
  if (state.phase !== "fight") throw new Error("Nie ma walki.");

  const seat = activeSeat(snapshot);
  const { fight } = state;
  if (!fight.result) throw new Error("Walka nie jest rozstrzygnięta.");

  // 17.4 ends a fight the moment the dice are compared — win, lose or draw —
  // so anything that lasts "one fight" is spent whichever way it went.
  const cleared = keepOnly(snapshot, seat.id, afterFight(statusesOf(snapshot, seat.id)));

  if (fight.guardian) {
    const outcome = fight.result.outcome;
    const at = apply(snapshot, cleared);
    const settled =
      fight.guardian.kind === "most"
        ? settleBridge(at, fight.guardian.entrance, outcome).writes
        : fight.guardian.kind !== "most-pole"
          ? settleCrossing(at, fight.guardian.crossing, outcome).writes
          : {};

    const said: Changeset = {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
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
    if (fight.guardian.kind !== "most-pole" || outcome !== "przegrana") {
      return { writes: soFar, result: undefined };
    }
    const cost = spendLife(apply(snapshot, soFar), seat.id, 1);
    return { writes: merge(soFar, cost.writes), result: undefined };
  }

  // In a duel the loser may be either side; against a card only the character
  // can lose. Rule 17.9 gives the winner a choice of spoils, so only the life
  // is applied automatically and the rest is left to the players.
  const loser =
    fight.result.outcome === "przegrana"
      ? seat
      : fight.result.outcome === "wygrana" && fight.opponentSeat !== undefined
        ? snapshot.seats.find((s) => s.seat_index === fight.opponentSeat)
        : undefined;

  let paid: Changeset = {};
  if (loser) {
    const save = await shieldSaves(
      apply(snapshot, cleared),
      { seatId: loser.id, kind: fight.kind },
      ports,
    );
    paid = save.result
      ? save.writes
      : merge(
          save.writes,
          spendLife(apply(snapshot, mergeAll(cleared, save.writes)), loser.id, 1).writes,
        );
  }

  return {
    writes: mergeAll(cleared, paid, {
      game: { turn_state: endFight(state) },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "fight-end",
          payload: { cardId: fight.cardId, outcome: fight.result.outcome },
        },
      ],
    }),
    result: undefined,
  };
}
