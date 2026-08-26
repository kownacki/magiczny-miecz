/** Carrying out what a Karta says: the one place an `Effect` becomes changes to a table. */

import { FIELDS } from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { isSettled } from "@/lib/engine/resolve";
import { seatsTargeted, type TargetSeat } from "@/lib/engine/targets";
import { chooseLosses, describeLoss, goldLost, reachableBy } from "@/lib/engine/losses";
import { endTurn } from "@/lib/engine/turn";
import { plural } from "@/lib/engine/polish";
import type { Effect } from "@/lib/engine/cardScript";
import type { FieldId } from "@/lib/engine/board";
import type { Nature } from "@/data/types";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import type { SeatRow } from "../store";
import { adjustSeat } from "./adjust";
import { changeNature, pickBelow, placeSeat } from "./character";
import { drawCard, drawSpell } from "./draw";
import { beginNamedFight } from "./fight";
import { cardName } from "./holdings";
import { healSeat } from "./life";
import { putOnPile } from "./piles";
import { turnToStone } from "./stone";

/**
 * What the player has already decided, in the order the effect asks.
 *
 * The client never sends an effect — it sends *which option it picked*, and the
 * server re-walks the card it owns and takes that branch. A card cannot
 * therefore be talked into doing something it does not say, which is the whole
 * reason the decision travels as a number.
 */
export interface Decisions {
  choices?: number[];
  destination?: FieldId;
}

export interface Resolution {
  /** One line per thing that happened, for the notice and the journal. */
  did: string[];
  /**
   * The part still owed to a player's decision, if any. Null when the whole
   * effect has been carried out.
   */
  pending: Effect | null;
}

export interface ApplyEffect {
  seatId: string;
  effect: Effect;
  reason: string;
  decided?: Decisions;
  /**
   * The order a pile comes back in when a card makes somebody draw.
   *
   * Same bargain the rest of the draw path makes: the rule decides whether the
   * pile is turned over, the edge decides what order it comes back in. See
   * `FromThePile` in `./draw`.
   */
  shuffle: Shuffle;
}

/** How many of a thing, in Polish. */
function amountOf(stat: "miecz" | "magia" | "zycie" | "zloto", count: number): string {
  if (stat !== "zloto") {
    return { miecz: "Miecza", magia: "Magii", zycie: "Życia" }[stat];
  }
  return plural(count, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota");
}

/** A seat row as the target rules see it. */
function asTargetSeat(row: SeatRow): TargetSeat {
  const nature =
    row.nature === "dobra" || row.nature === "zla" || row.nature === "chaotyczna"
      ? row.nature
      : null;
  return {
    seatIndex: row.seat_index,
    characterId: row.character_id,
    fieldId: row.field_id,
    nature,
    eliminated: row.eliminated,
  };
}

function named(row: SeatRow): string {
  return row.player_name ?? `miejsce ${row.seat_index + 1}`;
}

/**
 * Applies one effect to one seat, as far as it goes.
 *
 * Pure, which it could not be until the things it reaches for were: every
 * branch below that used to be a database call is now another command, and
 * composing commands is all this does. The decision about whether an effect can
 * be applied at all is still `resolve.ts`'s, where it is tested against every
 * card in the box.
 *
 * Recursion threads the snapshot: each step reads a table that already shows
 * what the step before it wrote, which is what lets `po-kolei` spend gold it
 * just gained and a `gdy` read a Natura the branch above changed.
 */
export async function applyEffect(
  snapshot: Snapshot,
  command: ApplyEffect,
  ports: CommandPorts,
): Promise<Outcome<Resolution>> {
  return walk(snapshot, command, command.effect, command.reason, ports);
}

async function walk(
  snapshot: Snapshot,
  command: ApplyEffect,
  effect: Effect,
  reason: string,
  ports: CommandPorts,
): Promise<Outcome<Resolution>> {
  const { seatId, shuffle } = command;
  const decided = command.decided ?? {};
  const nothing = (did: string[]): Outcome<Resolution> => ({
    writes: {},
    result: { did, pending: null },
  });
  const owed = (): Outcome<Resolution> => ({ writes: {}, result: { did: [], pending: effect } });

  // A decision the player has already made turns an unsettled effect into a
  // settled one, so this is asked after the choices have been consumed rather
  // than before.
  if (effect.op === "wybor") {
    const pick = decided.choices?.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    if (!option) return owed();
    const done = await walk(snapshot, command, option.effect, `${reason}: ${option.label}`, ports);
    // The label only when it adds something. An option called "+1 Magii" whose
    // effect reports "+1 Magii" would otherwise be written down twice.
    const said =
      done.result.did[0] === option.label ? done.result.did : [option.label, ...done.result.did];
    return { writes: done.writes, result: { did: said, pending: done.result.pending } };
  }

  if (effect.op === "przenies" && effect.to.kind !== "pole") {
    const where = decided.destination;
    if (!where) return owed();
    const moved = placeSeat(snapshot, { seatId, target: where, reason });
    return {
      writes: moved.writes,
      result: {
        did: [`przenosisz się na: ${FIELDS.get(where)?.name ?? where}`],
        pending: null,
      },
    };
  }

  if (!isSettled(effect)) return owed();

  switch (effect.op) {
    case "nic":
      return nothing(["nic się nie dzieje"]);

    case "po-kolei": {
      const did: string[] = [];
      let writes: Changeset = {};
      for (const step of effect.steps) {
        // Each step reads what the ones before it wrote.
        const done = await walk(apply(snapshot, writes), command, step, reason, ports);
        writes = merge(writes, done.writes);
        // A step nobody has decided yet stops the sequence: what follows it may
        // depend on it, and doing the rest first would resolve the card out of
        // its own order.
        if (done.result.pending) return { writes, result: { did, pending: done.result.pending } };
        did.push(...done.result.did);
      }
      return { writes, result: { did, pending: null } };
    }

    case "gdy": {
      const seat = snapshot.seats.find((s) => s.id === seatId);
      if (!seat) throw new Error("Nieznane miejsce.");
      const nature = seat.nature as Nature | null;
      const holds =
        effect.warunek.is === "natura"
          ? nature !== null && effect.warunek.jedna_z.includes(nature)
          : effect.warunek.is === "ma-zloto"
            ? seat.zloto > 0
            : (effect.warunek.stat === "miecz" ? seat.miecz_own : seat.magia_own) <
              effect.warunek.ponizej;
      const branch = holds ? effect.to : effect.inaczej;
      return branch
        ? walk(snapshot, command, branch, reason, ports)
        : nothing(["warunek niespełniony — nic się nie dzieje"]);
    }

    case "punkty": {
      const hit = targeted(snapshot, seatId, effect.target, []);
      // Waits for somebody to arrive, or for the holder to choose.
      if (hit === null) return owed();
      if (hit.length === 0) return nothing(["nikogo to nie dotyczy"]);

      let writes: Changeset = {};
      for (const target of hit) {
        const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
        if (!row) continue;
        const done = adjustSeat(apply(snapshot, writes), {
          seatId: row.id,
          stat: effect.stat,
          delta: effect.delta,
          reason,
          // A card doing what the card says is the opposite of somebody
          // overruling the referee, and the journal draws those differently.
          record: { kind: "punkty", manual: false },
        });
        writes = merge(writes, done.writes);
      }
      const sign = effect.delta > 0 ? "+" : "−";
      const many = Math.abs(effect.delta);
      return { writes, result: { did: [`${sign}${many} ${amountOf(effect.stat, many)}`], pending: null } };
    }

    case "tura-stracona": {
      const hit = targeted(snapshot, seatId, effect.target, effect.oprocz ?? []);
      if (hit === null) return owed();
      if (hit.length === 0) return nothing(["nikogo to nie dotyczy"]);

      const actor = snapshot.seats.find((s) => s.id === seatId);
      const names: string[] = [];
      const seats: { id: string; patch: { turns_lost: number } }[] = [];
      const lines: Changeset["journal"] = [];

      for (const target of hit) {
        const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
        if (!row) continue;
        /**
         * 16.1 spends the loss on the turn in progress, not on a future one.
         *
         * "Jeżeli spowodowałoby to utratę tury przez Postać, musi ona
         * powstrzymać się od podejmowania jakichkolwiek dalszych działań — TA
         * WŁAŚNIE tura liczy się jako stracona." The player who draws the
         * Karczma's 3 has already moved and already arrived; what the card
         * takes is the rest of that turn.
         *
         * Everybody else banks it, because for them it is genuinely a turn that
         * has not started: the Burza costs a turn to characters who are not
         * playing at the time.
         */
        const isPlaying = row.seat_index === snapshot.game.active_seat;
        seats.push({
          id: row.id,
          patch: { turns_lost: row.turns_lost + (isPlaying ? effect.turns - 1 : effect.turns) },
        });
        lines.push({
          seatId: row.id,
          turn: snapshot.game.turn,
          kind: "tura-stracona",
          payload: { turns: effect.turns, reason },
        });
        names.push(named(row));
      }

      /**
       * And the turn in progress stops here (16.1).
       *
       * "musi ona powstrzymać się od podejmowania jakichkolwiek dalszych
       * działań" — so the phase goes to `koniec`, where the only control left
       * is the one that passes play on. Without this the arithmetic above would
       * make the card do nothing at all to the player who drew it: it takes no
       * future turn from them, so it has to take this one.
       */
      const stops = hit.some((t) => t.seatIndex === snapshot.game.active_seat);
      const onlyMe = hit.length === 1 && hit[0].seatIndex === actor?.seat_index;

      return {
        writes: {
          seats,
          journal: lines,
          ...(stops ? { game: { turn_state: endTurn() } } : {}),
        },
        result: {
          did: [onlyMe ? `tracisz ${effect.turns} turę` : `tracą turę: ${names.join(", ")}`],
          pending: null,
        },
      };
    }

    case "strata": {
      const hit = targeted(snapshot, seatId, effect.target, []);
      if (hit === null) return owed();

      let writes: Changeset = {};
      const said: string[] = [];

      for (const target of hit) {
        const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
        if (!row) continue;

        const at = apply(snapshot, writes);
        const mine = at.holdings
          .filter((held) => held.seat_id === row.id)
          .map((held) => ({
            id: held.id,
            cardId: held.card_id,
            kind: held.kind,
            granted: held.granted,
          }));

        // Rolled before the choosing, because `chooseLosses` picks synchronously
        // and the dice are a port. Exactly as many as it can ask for — the
        // kind it reaches into, counted against what this seat actually holds —
        // so a scripted port is not charged for picks nobody makes.
        const kind = reachableBy(effect.co);
        const takesEverything =
          effect.co === "wszystkie-przedmioty" || effect.co === "wszystkie-zaklecia";
        const candidates =
          kind === null ? 0 : mine.filter((held) => held.kind === kind).length;
        const asks =
          effect.wybor === "losowo" && !takesEverything
            ? Math.min(effect.count ?? 1, candidates)
            : 0;
        // `chooseLosses` picks from a pool that shrinks by one each time, so the
        // bound of every ask is known before any of them happen — which is what
        // lets a synchronous chooser be driven by an asynchronous port without
        // guessing, and without spending a die on a pick nobody makes.
        const rolls: number[] = [];
        for (let i = 0; i < asks; i++) {
          rolls.push(await pickBelow(ports.random, candidates - i, "strata: co przepada"));
        }
        let next = 0;
        // Null means the holder has to pick, which 5.6 makes their right. It
        // should not reach here — `isSettled` asks first — but a card that
        // starts saying "wybierz" tomorrow should stop, not choose for somebody.
        const gone = chooseLosses(mine, effect, () => rolls[next++] ?? 0);
        if (gone === null) return { writes, result: { did: [], pending: effect } };

        const gold = goldLost(effect, row.zloto);
        if (gone.length === 0 && gold === 0) continue;

        const lost = mine.filter((held) => gone.includes(held.id));
        let step: Changeset = gone.length > 0 ? { holdings: { delete: gone } } : {};
        if (gone.length > 0) {
          // 6.4's "muszą zostać odrzuceni z innych przyczyn": a card taken by an
          // effect rather than put down by its owner is not left lying on the
          // Obszar — it is gone, and gone means the used pile. Chained, because
          // both piles write the same column.
          const spells = putOnPile(
            apply(at, step),
            "spells",
            lost.filter((h) => h.kind === "spell"),
          );
          const events = putOnPile(
            apply(at, mergeAll(step, spells)),
            "events",
            lost.filter((h) => h.kind !== "spell"),
          );
          step = mergeAll(step, spells, events);
        }
        if (gold > 0) {
          step = merge(step, { seats: [{ id: row.id, patch: { zloto: row.zloto - gold } }] });
        }

        const names = lost.map((held) => cardName(held.cardId));
        step = merge(step, {
          journal: [
            {
              seatId: row.id,
              turn: snapshot.game.turn,
              kind: "strata",
              payload: { co: effect.co, cardIds: lost.map((h) => h.cardId), zloto: gold },
            },
          ],
        });
        writes = merge(writes, step);
        said.push(
          `${named(row)}: ` +
            [names.join(", "), gold > 0 ? `${gold} Sz. Z.` : ""].filter(Boolean).join(", "),
        );
      }

      return {
        writes,
        result: {
          did:
            said.length > 0
              ? [`tracą ${describeLoss(effect)} — ${said.join("; ")}`]
              : ["nie ma czego stracić"],
          pending: null,
        },
      };
    }

    case "uzdrow": {
      // 4.7 refuses when there is nothing to restore, and a card offering a
      // heal to somebody already whole is not an error — it simply does nothing.
      try {
        const done = healSeat(snapshot, { seatId, amount: effect.upTo });
        return {
          writes: done.writes,
          result: { did: [`+${done.result} Życia (4.7)`], pending: null },
        };
      } catch {
        return nothing(["Życie już na poziomie początkowym"]);
      }
    }

    case "zaklecie": {
      let writes: Changeset = {};
      const names: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        const done = drawSpell(apply(snapshot, writes), { seatId, shuffle });
        writes = merge(writes, done.writes);
        names.push(done.result);
      }
      return { writes, result: { did: [`Zaklęcie: ${names.join(", ")}`], pending: null } };
    }

    case "kamien":
      return {
        writes: turnToStone(snapshot, { seatId }),
        result: { did: ["Zamiana w Kamień (20.1)"], pending: null },
      };

    case "natura": {
      const done = changeNature(snapshot, { seatId, nature: effect.na });
      return {
        writes: done.writes,
        result: { did: [`Natura: ${effect.na === "zla" ? "zła" : effect.na}`], pending: null },
      };
    }

    case "przenies": {
      if (effect.to.kind !== "pole") return owed();
      const moved = placeSeat(snapshot, { seatId, target: effect.to.fieldId, reason });
      return {
        writes: moved.writes,
        result: {
          did: [
            `przenosisz się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`,
          ],
          pending: null,
        },
      };
    }

    case "walka": {
      // A creature the card conjures rather than a card on the field, so the
      // fight is opened directly with its printed strength.
      const opened = beginNamedFight(snapshot, {
        name: effect.nazwa,
        miecz: effect.miecz,
        magia: effect.magia,
      });
      return {
        writes: opened.writes,
        result: { did: [`walka: ${effect.nazwa}`], pending: null },
      };
    }

    case "ruch-dodatkowy":
      return nothing(["dodatkowy ruch — rzuć jeszcze raz"]);

    case "wyciagnij": {
      let writes: Changeset = {};
      for (let i = 0; i < effect.count; i++) {
        const done = drawCard(apply(snapshot, writes), { named: null, shuffle });
        writes = merge(writes, done.writes);
      }
      return { writes, result: { did: [`wyciągnięto ${effect.count} Kart`], pending: null } };
    }

    default:
      // `isSettled` said yes and this says how — so a new settled op that
      // forgets to be handled here is a loud failure rather than a silent one.
      throw new Error(`Nie wiem, jak wykonać: ${(effect as Effect).op}`);
  }
}

/** Who an effect lands on, read off the snapshot. */
function targeted(
  snapshot: Snapshot,
  seatId: string,
  target: Parameters<typeof seatsTargeted>[0],
  oprocz: Parameters<typeof seatsTargeted>[3],
): TargetSeat[] | null {
  const actor = snapshot.seats.find((row) => row.id === seatId);
  return seatsTargeted(
    target,
    snapshot.seats.map(asTargetSeat),
    actor ? asTargetSeat(actor) : undefined,
    oprocz,
  );
}
