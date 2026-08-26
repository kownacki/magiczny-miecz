/** The Kamienny Most and the two river crossings: getting onto it (11.9-11.11), walking it (14.5-14.6), crossing between rings (11.1-11.8), and the ferryman's toll. */

import {
  FERRY_TOLL,
  FIELDS,
  isFerry,
  type BridgeEntrance,
} from "@/lib/engine/board";
import { crossingFrom, trzesawiskaOutcome, type Crossing } from "@/lib/engine/rings";
import {
  BRIDGE_GUARDIAN,
  BRIDGE_ORDEAL,
  BRIDGE_SIDE,
  cerberLoss,
  deathGameOutcome,
  guardianStrength,
  keptAfterFall,
  rollDice,
  trapOutcome,
} from "@/lib/engine/bridge";
import { crossingDice, tollIsWaived } from "@/lib/engine/abilities";
import type { CombatResult } from "@/lib/engine/combat";
import {
  afterMove,
  bridgeBlockUntil,
  endTurn,
  recordGuardianStrength,
  startGuardianFight,
  strengthPending,
} from "@/lib/engine/turn";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type SeatPatch,
  type Snapshot,
} from "../change";
import { cardName } from "./holdings";
import { asReturnable, putOnPile } from "./piles";
import { spendLife } from "./life";
import { activeSeat, pointsOf, seatView } from "./seat";

/* --------------------------------------------------------------------------
 * The small pure things these commands need.
 * ----------------------------------------------------------------------- */

/**
 * What a fight came to, from the character's side.
 *
 * Derived from the combat engine's own result rather than written out again,
 * because the whole point is that a guardian settled by an actual fight and one
 * settled by the table saying how it went travel through the same code — and a
 * fourth word appearing in `CombatResult` must not be able to sneak past here.
 */
export type FightOutcome = CombatResult["outcome"];

/**
 * Every standing rule this seat is under: what it carries, and what it is.
 *
 * 8.2: a character's own powers sit alongside what it is holding and override
 * the general rules where they disagree. The held half is filtered through
 * `inEffect` first, so a Przewoźnik lying unworn in the slot variant is a
 * friend you do not have.
 */

/* --------------------------------------------------------------------------
 * Settling a doorway. Shared with the fight cluster, which reaches both of
 * these once a guardian's dice have been compared.
 * ----------------------------------------------------------------------- */

/**
 * Applies the result of a bridge guardian (11.9-11.11).
 *
 * Three outcomes, not two. 11.11 gives a draw its own consequence: "Jeżeli
 * wynik walki jest remisowy Postać nie traci punktu Magii lub Miecza, lecz
 * również nie może w następnej turze podjąć kolejnej próby wejścia na Most."
 * So a draw is cheap but not free — it costs the next turn's attempt, the same
 * as a loss does, and only a loss takes the point.
 *
 * Whichever way it goes the turn ends here: on a win at the bridge entrance
 * (11.10), otherwise back on the ring at the field the attempt was made from.
 *
 * No dice: the fight has already been fought by the time this is reached.
 */
export function settleBridge(
  snapshot: Snapshot,
  entrance: BridgeEntrance,
  outcome: FightOutcome,
): Outcome<{ at: string | null }> {
  const seat = activeSeat(snapshot);

  if (outcome === "wygrana") {
    if (!FIELDS.has(entrance.entersAt)) {
      throw new Error(`Nieznane pole: ${entrance.entersAt}`);
    }
    return {
      writes: {
        seats: [{ id: seat.id, patch: { field_id: entrance.entersAt } }],
        // 11.10: "Jeżeli próba wkroczenia na Most jest udana, tura Postaci
        // kończy się na Wejściu na Most" — the square is reached but not
        // resolved.
        game: { turn_state: endTurn() },
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "bridge-entry",
            payload: { from: entrance.from, guardian: entrance.guardian },
          },
        ],
      },
      result: { at: entrance.entersAt },
    };
  }

  // Both a loss and a draw bar the next turn's attempt (11.11). The character
  // stays on the ring at the entrance and carries on from there.
  //
  // `turn` counts rounds, not seat-turns, so a seat gets exactly one go per
  // number — see `bridgeBlockUntil` for why that is turn + 2 and not turn + 1.
  //
  // One patch and not two. The store wrote the lost point and the bar as
  // separate updates, which `apply` would fold by id and keep only the later of
  // — so a cascade reading its own work would have seen the point come back.
  const patch: SeatPatch["patch"] = {
    bridge_blocked_until_turn: bridgeBlockUntil(snapshot.game.turn),
  };
  if (outcome === "przegrana") {
    // 1.2-1.5 and 2.2-2.6: a character's own points can never fall below the
    // value printed on its Karta Postaci, which is what the floor columns are.
    if (entrance.stat === "magia") {
      patch.magia_own = Math.max(seat.magia_floor, seat.magia_own - 1);
    } else {
      patch.miecz_own = Math.max(seat.miecz_floor, seat.miecz_own - 1);
    }
  }

  return {
    writes: {
      seats: [{ id: seat.id, patch }],
      game: { turn_state: endTurn() },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "bridge-failed",
          payload: { from: entrance.from, guardian: entrance.guardian, outcome },
        },
      ],
    },
    result: { at: null },
  };
}

/**
 * Applies the result of a crossing between rings (11.4, 11.8).
 *
 * Failure costs a point of Życie and stops the journey. A draw costs nothing
 * but still stops it. Either way the character stays put and may try again next
 * turn, which 11.4 says is exactly what the next turn is for.
 *
 * No dice: whatever decided the crossing decided it before this was called.
 */
export function settleCrossing(
  snapshot: Snapshot,
  crossing: Crossing,
  outcome: FightOutcome,
  extra: Record<string, unknown> = {},
): Outcome<{ to: string | null }> {
  const seat = activeSeat(snapshot);

  if (outcome !== "wygrana") {
    // The point of Życie is taken first and the line written after, which is
    // the order the store wrote them in and therefore the order the journal
    // already reads in: a death here appears above the crossing that caused it.
    const cost = outcome === "przegrana" ? spendLife(snapshot, seat.id, 1).writes : {};
    const said: Changeset = {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "crossing-failed",
          payload: { from: crossing.from, obstacle: crossing.obstacle, outcome, ...extra },
        },
      ],
    };
    // The turn state is left where it was: still standing on the crossing
    // field, free to try again next turn.
    return { writes: merge(cost, said), result: { to: null } };
  }

  const field = FIELDS.get(crossing.to);
  if (!field) throw new Error(`Nieznane pole: ${crossing.to}`);

  return {
    writes: {
      seats: [{ id: seat.id, patch: { field_id: crossing.to } }],
      game: { turn_state: afterMove(field, crossing.from) },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "crossing",
          payload: { from: crossing.from, to: crossing.to, obstacle: crossing.obstacle, ...extra },
        },
      ],
    },
    result: { to: crossing.to },
  };
}

/* --------------------------------------------------------------------------
 * Getting onto the bridge.
 * ----------------------------------------------------------------------- */

/**
 * Squares up to whatever is guarding the way through.
 *
 * The bridge entrances and the Lodowy Las all print a creature with a strength
 * and expect a normal fight, so they get one rather than a pair of buttons
 * asking the table who won. Which creature it is comes from where the character
 * is standing and what it is trying to do.
 *
 * No dice: opening a fight throws nothing. The entrance guardians' strength is
 * `rollGuardianStrength`'s one die, and the combatants' own come later.
 */
export function fightGuardian(snapshot: Snapshot): Outcome<void> {
  const seat = activeSeat(snapshot);
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  const totals = pointsOf(snapshot, seat.id, "walka");

  if (snapshot.game.turn_state.phase === "bridge") {
    const entrance = snapshot.game.turn_state.bridge;
    return {
      writes: {
        game: {
          turn_state: startGuardianFight({ kind: "most", entrance }, totals, seat.field_id),
        },
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "guardian-start",
            payload: { guardian: entrance.guardian },
          },
        ],
      },
      result: undefined,
    };
  }

  const crossing = crossingFrom(seat.field_id);
  if (!crossing || crossing.test?.kind !== "walka") {
    throw new Error("Nie ma tu nikogo, z kim trzeba walczyć.");
  }
  return {
    writes: {
      game: {
        turn_state: startGuardianFight({ kind: "przeprawa", crossing }, totals, seat.field_id),
      },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "guardian-start",
          payload: { guardian: crossing.test.guardian },
        },
      ],
    },
    result: undefined,
  };
}

/**
 * Throws the die that gives a bridge guardian its Miecz or Magia (5 to 10).
 *
 * One die, and it is the only one: "straznik: siła". The range check the store
 * did by hand belongs to the `supplied` binding now, which is the whole reason
 * a die is a port — a rule that validated its own dice was a rule that knew a
 * human had typed them.
 *
 * `manual` is the journal's flag and nothing else: whether the number came off
 * a real die on a real table. The command cannot tell, so it is told.
 */
export async function rollGuardianStrength(
  snapshot: Snapshot,
  command: { manual?: boolean },
  ports: CommandPorts,
): Promise<Outcome<{ strength: number }>> {
  const seat = activeSeat(snapshot);
  const phase = snapshot.game.turn_state;
  if (phase.phase !== "fight") throw new Error("Nie ma walki.");
  if (!strengthPending(phase.fight)) {
    throw new Error("Siła przeciwnika jest już znana.");
  }

  const roll = await ports.random.rollD6("straznik: siła");
  const next = recordGuardianStrength(phase, roll);
  const manual = command.manual ?? false;

  return {
    writes: {
      game: { turn_state: next },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "guardian-strength",
          payload: { roll },
          manual,
        },
      ],
    },
    result: { strength: next.phase === "fight" ? next.fight.enemyTotal : 0 },
  };
}

/**
 * The table reporting how a bridge guardian went, where it is not being fought
 * through the app — companion mode with the creature resolved on the table.
 */
export type BridgeOutcome = "wygrana" | "remis" | "porazka";

/** No dice: the table already threw them and is reporting the answer. */
export function enterBridge(
  snapshot: Snapshot,
  command: { outcome: BridgeOutcome },
): Outcome<{ at: string | null }> {
  if (snapshot.game.turn_state.phase !== "bridge") {
    throw new Error("Nie ma teraz próby wejścia na Most.");
  }
  return settleBridge(
    snapshot,
    snapshot.game.turn_state.bridge,
    command.outcome === "porazka" ? "przegrana" : command.outcome,
  );
}

/* --------------------------------------------------------------------------
 * The river, and the boundary between rings.
 * ----------------------------------------------------------------------- */

/**
 * The ferryman at a Przeprawa.
 *
 * "Musisz przeprawić się przez rzekę płacąc przewoźnikowi 1 Sz. Z. lub wracasz
 * na Obszar, z którego rozpocząłeś ruch." Landing here is a toll, not a stop:
 * pay it and the turn goes on as normal, or the whole move is undone and the
 * character finishes the turn where it began.
 *
 * A character with no gold has no choice, which is why refusing is always
 * available and paying is not.
 *
 * No dice.
 */
export function payFerry(
  snapshot: Snapshot,
  command: { pay: boolean },
): Outcome<{ at: string }> {
  const seat = activeSeat(snapshot);
  const phase = snapshot.game.turn_state;
  if (phase.phase !== "field" || !isFerry(phase.fieldId)) {
    throw new Error("Nie stoisz na Przeprawie.");
  }
  const here = phase.fieldId;

  if (command.pay) {
    // The Przewoźnik among your Przyjaciele is the ferryman's colleague: "nie
    // będziesz musiał płacić 1 Sztuki Złota za Przeprawę".
    const toll = tollIsWaived(seatView(snapshot, seat.id).abilities, here)
      ? 0
      : FERRY_TOLL;
    if (seat.zloto < toll) {
      throw new Error("Nie masz czym zapłacić przewoźnikowi.");
    }
    return {
      writes: {
        // A waived toll writes no seat row at all: there is nothing to charge,
        // and a patch setting a column to what it already holds is a lie in the
        // changeset a test would have to read past.
        ...(toll > 0 ? { seats: [{ id: seat.id, patch: { zloto: seat.zloto - toll } }] } : {}),
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "ferry",
            payload: { field: here, paid: toll },
          },
        ],
      },
      result: { at: here },
    };
  }

  // Sent back to where the move started. The turn ends there rather than
  // resolving that field again — the character never left it in the first place.
  const back = phase.from;
  if (!back) throw new Error("Nie wiadomo, skąd zaczął się ten ruch.");
  return {
    writes: {
      seats: [{ id: seat.id, patch: { field_id: back } }],
      game: { turn_state: endTurn() },
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "ferry-refused",
          payload: { field: here, back },
        },
      ],
    },
    result: { at: back },
  };
}

/**
 * Crosses between rings (11.1-11.8).
 *
 * Only two places on the whole board allow it, only one direction of each is
 * defended, and the two obstacles are different in kind. The Trzęsawiska are a
 * threshold — two dice against the character's Magia — so the app settles them
 * outright. The Lodowy Las is a fight with the Rycerz Wiecznych Śniegów, which
 * normally goes through `fightGuardian` and the combat engine; this route is
 * what remains for a table resolving that fight themselves.
 */
export type CrossOutcome = "udana" | "remis" | "nieudana";

/**
 * Rolls, in this order: the Trzęsawiska dice, two of them, or one for a
 * character walking with the Rusałka.
 *
 * Nothing at all at the Lodowy Las or coming back down (11.3, 11.7): an
 * undefended crossing is simply walked, and a defended fight is reported rather
 * than thrown here.
 */
export async function crossRing(
  snapshot: Snapshot,
  command: { outcome?: CrossOutcome } = {},
  ports: CommandPorts,
): Promise<Outcome<{ to: string | null; outcome: CrossOutcome; dice?: number[]; magia?: number }>> {
  const seat = activeSeat(snapshot);
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  const crossing = crossingFrom(seat.field_id);
  if (!crossing) {
    throw new Error("Z tego Obszaru nie można przejść do innego Kręgu (11.1, 11.5).");
  }

  let outcome: CrossOutcome = "udana";
  let dice: number[] | undefined;
  let magia: number | undefined;

  if (crossing.test?.kind === "magia") {
    // The app owns this one: it is a threshold against a number it already
    // knows, so there is nothing for a player to adjudicate. A physical die
    // still overrides, through the port rather than through a branch in here.
    //
    // Rusałka's friendship is exactly this: one die at the Trzęsawiska instead
    // of two, which is the difference between a hard crossing and a likely one.
    const count = crossingDice(
      seatView(snapshot, seat.id).abilities,
      crossing.obstacle,
      crossing.test.dice,
    );
    dice = await rollDice(ports.random, count, "trzęsawiska");
    // `parametr`, not `walka`: the Trzęsawiska are a threshold and not a fight,
    // so a Krzyżowiec's fight-only points have no business in the number.
    magia = pointsOf(snapshot, seat.id, "parametr").magia;
    outcome = trzesawiskaOutcome(dice, magia);
  } else if (crossing.test) {
    outcome = command.outcome ?? "udana";
  }

  const extra = dice ? { dice, magia } : {};
  const settled = settleCrossing(
    snapshot,
    crossing,
    outcome === "udana" ? "wygrana" : outcome === "remis" ? "remis" : "przegrana",
    extra,
  );
  return { writes: settled.writes, result: { to: settled.result.to, outcome, ...extra } };
}

/* --------------------------------------------------------------------------
 * Walking the bridge itself.
 * ----------------------------------------------------------------------- */

/**
 * What the Kamienny Most does to a character standing on one of its fields.
 *
 * The bridge is where the game ends, and until now the app went quiet on it:
 * the seven fields between an entrance and the Zamek existed on the board and
 * did nothing. Each has a printed procedure (14.5-14.6 and the boxed field text
 * at the end of the rulebook) and this is all six of them — the Zamek itself
 * already had its own fight.
 */
export interface BridgeOrdealResult {
  field: string;
  kind: string;
  dice?: number[];
  /** Where a fall put the character down, when it fell. */
  to?: string;
  /** Cards lost off the bridge, by name (14.5). */
  lost?: string[];
  kept?: string[];
  lifeLost?: number;
  outcome?: string;
  enemyTotal?: number;
}

/**
 * Rolls, in this order — which is the order a companion table types them in,
 * and depends on which of the six fields the character is standing on:
 *
 * - **Pułapka / Magiczna Pułapka**: three for the trap (14.5), then, only if it
 *   caught, one per Przedmiot and Przyjaciel carried, in the order they are
 *   held.
 * - **Gra ze Śmiercią**: two for the character, then two for Death.
 * - **Cerber**: one.
 * - **Demon Zagłady / Monstrum**: two for the creature's strength (14.6). Its
 *   fight is then thrown through the ordinary combat path.
 *
 * Death's own two used to be beyond a companion table's reach — the store rolled
 * them with `Math.random` no matter what was supplied — and now they are simply
 * the third and fourth dice.
 */
export async function resolveBridgeOrdeal(
  snapshot: Snapshot,
  _command: void,
  ports: CommandPorts,
): Promise<Outcome<BridgeOrdealResult>> {
  const seat = activeSeat(snapshot);
  const here = seat.field_id;
  if (!here || !BRIDGE_ORDEAL.has(here)) {
    throw new Error("Na tym Obszarze nie ma czego rozpatrywać.");
  }

  const turn = snapshot.game.turn;
  // `parametr` and not `walka`: none of the six is a fight. The two creatures
  // open one, and the numbers this seeds it with are the character's standing
  // Miecz and Magia, which is what `startGuardianFight` expects.
  const totals = pointsOf(snapshot, seat.id, "parametr");
  /** Every ordeal but the two creatures' ends the turn where it stands. */
  const closed: Changeset = { game: { turn_state: endTurn() } };

  // --- Pułapka / Magiczna Pułapka (14.5)
  if (here === "pulapka" || here === "magiczna-pulapka") {
    // Only the eight bridge fields have a side, and this is one of the two
    // traps, so it has one — but the table says so rather than the code
    // assuming it.
    const side = BRIDGE_SIDE[here] ?? "miecz";
    const dice = await rollDice(ports.random, 3, "pulapka");
    const fall = trapOutcome(dice, side === "magia" ? totals.magia : totals.miecz, side);

    if (!fall.fell) {
      return {
        writes: mergeAll(
          {
            journal: [
              { seatId: seat.id, turn, kind: "bridge-trap", payload: { dice, result: 0 } },
            ],
          },
          closed,
        ),
        result: { field: here, kind: "pulapka", dice, outcome: "uniknieta" },
      };
    }

    // Everything carried is rolled for, Przedmioty and Przyjaciele alike; a 1
    // or a 2 keeps it and anything else is gone.
    const carried = snapshot.holdings.filter(
      (h) => h.seat_id === seat.id && (h.kind === "item" || h.kind === "friend"),
    );
    const rolls = await rollDice(ports.random, carried.length, "pulapka: co zostaje w rękach");
    const { kept, lost } = keptAfterFall(carried, rolls);

    // 14.5: "Postać traci Przedmiot lub Przyjaciela (należy odłożyć ich Karty)".
    // Odłożyć, which everywhere else in the book is the stos zużytych — 1.4,
    // 4.4 and 9.6 all say so in as many words, and nothing in this game removes
    // a card from it for good. Chained through `apply` because `putOnPile`
    // reads the deck the shed cards are being added to.
    const shed: Changeset =
      lost.length > 0 ? { holdings: { delete: lost.map((h) => h.id) } } : {};
    const shelved = putOnPile(apply(snapshot, shed), "events", lost.map(asReturnable));

    return {
      writes: mergeAll(
        shed,
        shelved,
        { seats: [{ id: seat.id, patch: { field_id: fall.fieldId } }] },
        {
          journal: [
            {
              seatId: seat.id,
              turn,
              kind: "bridge-trap",
              payload: {
                dice,
                result: fall.result,
                to: fall.fieldId,
                lost: lost.map((h) => h.card_id),
              },
            },
          ],
        },
        closed,
      ),
      result: {
        field: here,
        kind: "pulapka",
        dice,
        to: fall.fieldId,
        lost: lost.map((h) => cardName(h.card_id)),
        kept: kept.map((h) => cardName(h.card_id)),
      },
    };
  }

  // --- Gra ze Śmiercią
  if (here === "gra-ze-smiercia") {
    const mine = await rollDice(ports.random, 2, "gra-ze-smiercia");
    const deaths = await rollDice(ports.random, 2, "gra-ze-smiercia: rzut Śmierci");
    const outcome = deathGameOutcome(mine, deaths);

    const played = mergeAll(
      {
        journal: [
          { seatId: seat.id, turn, kind: "bridge-death-game", payload: { mine, deaths, outcome } },
        ],
      },
      closed,
    );

    // The store had to close the turn state in the database *before* spending
    // the point, because a death hands play on and a later write of `endTurn()`
    // would have landed on top of the pass and put the table back inside a turn
    // belonging to somebody who is no longer in the game.
    //
    // As one changeset that ordering stops being a rule about writes and
    // becomes what it always meant: the pass has to be *decided* against a
    // table that already knows the turn is over and the character is out.
    // `apply` is what says so — `spendLife` sees the closed turn, `killSeat`
    // sees the elimination it has just written, and `passTurn` reads both. The
    // merge order still matters, because two writes to `game.turn_state` are
    // "later wins" and not a sum: the pass must come second, as it does here.
    const cost =
      outcome === "strata" ? spendLife(apply(snapshot, played), seat.id, 1).writes : {};

    return {
      writes: merge(played, cost),
      result: {
        field: here,
        kind: "gra-ze-smiercia",
        dice: [...mine, ...deaths],
        outcome,
        lifeLost: outcome === "strata" ? 1 : 0,
      },
    };
  }

  // --- Cerber
  if (here === "cerber") {
    const [die] = await rollDice(ports.random, 1, "cerber");
    const loss = cerberLoss(die);
    const bitten = mergeAll(
      { journal: [{ seatId: seat.id, turn, kind: "bridge-cerberus", payload: { die, loss } }] },
      closed,
    );
    // Same chain as the Gra ze Śmiercią above, and for the same reason: the dog
    // can kill, and the pass that follows must see a turn already closed.
    const cost = spendLife(apply(snapshot, bitten), seat.id, loss).writes;
    return {
      writes: merge(bitten, cost),
      result: { field: here, kind: "cerber", dice: [die], lifeLost: loss },
    };
  }

  // --- Demon Zagłady / Monstrum (14.6): a fight, not a table.
  // Everything else on the bridge was handled above, so what is left is one of
  // the two creatures. Checked rather than assumed: this used to index a
  // Record<string, …> and would have read `undefined.name` off any field that
  // slipped through, which is a crash in the middle of somebody's turn.
  const creature = BRIDGE_GUARDIAN[here];
  if (!creature) throw new Error(`Na tym polu Mostu nie ma nic do rozpatrzenia: ${here}`);

  const dice = await rollDice(ports.random, 2, "straznik-mostu");
  const strength = guardianStrength(dice);
  const phase = recordGuardianStrength(
    startGuardianFight(
      { kind: "most-pole", fieldId: here, name: creature.name, combat: creature.kind },
      totals,
      here,
    ),
    strength,
  );

  return {
    writes: {
      // The turn does not end: the fight is the turn, and it is still open.
      game: { turn_state: phase },
      journal: [
        {
          seatId: seat.id,
          turn,
          kind: "bridge-guardian",
          payload: { guardian: creature.name, dice, strength },
        },
      ],
    },
    result: { field: here, kind: "straznik", dice, enemyTotal: strength, outcome: creature.name },
  };
}
