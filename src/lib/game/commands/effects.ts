/** Carrying out what a Karta says: the one place an `Effect` becomes changes to a table. */

import { FIELDS } from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { isSettled } from "@/lib/engine/resolve";
import { scriptFor } from "@/lib/engine/cardScript";
import { fieldScriptFor, offerKey } from "@/lib/engine/fieldScript";
import { describeEffect } from "@/lib/engine/effectText";
import { usageOf } from "@/lib/engine/uses";
import { seatsTargeted, type TargetSeat } from "@/lib/engine/targets";
import { chooseLosses, goldLost, lossTaken, reachableBy } from "@/lib/engine/losses";
import { endTurn } from "@/lib/engine/turn";
import { cardName, NATURE_LABEL, plural } from "@/lib/engine/polish";
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
import { nameOfSeat } from "./lobby";

import { healSeat } from "./life";
import { putOnPile } from "./piles";
import { turnToStone } from "./stone";
import { activeSeat, seatView } from "./seat";
import { addEffect } from "./turn";

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
function amountOf(stat: "sword" | "magic" | "life" | "gold", count: number): string {
  if (stat !== "gold") {
    return { sword: "Miecza", magic: "Magii", life: "Życia" }[stat];
  }
  return plural(count, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota");
}


function named(snapshot: Snapshot, row: SeatRow): string {
  return nameOfSeat(snapshot, row.seat_index);
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
            ? seat.gold > 0
            : (effect.warunek.stat === "sword" ? seat.sword_own : seat.magic_own) <
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
      /** What the seats actually moved by, which the floor under own points may cut. */
      const each: number[] = [];
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
          record: { kind: "points", manual: false },
        });
        writes = merge(writes, done.writes);
        each.push(done.result.moved);
      }
      const sign = effect.delta > 0 ? "+" : "−";
      const many = Math.abs(effect.delta);
      const asked = `${sign}${many} ${amountOf(effect.stat, many)}`;
      /**
       * What it did, and not what the card asked for.
       *
       * 1.3 and 2.3 put a floor under own points, so a card taking a Magia off
       * a character that has none to give does nothing — and this line, read
       * off the delta, used to say "−1 Magii" anyway. The player then holds a
       * card that plainly did not work and a message saying it did.
       */
      const stopped = each.length > 0 && each.every((moved) => moved === 0);
      return {
        writes,
        result: {
          did: [stopped ? `${asked} — bez zmiany, nie ma poniżej czego zejść` : asked],
          pending: null,
        },
      };
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
          kind: "turn-lost",
          payload: { turns: effect.turns, reason },
        });
        names.push(named(snapshot, row));
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

        const gold = goldLost(effect, row.gold);
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
          step = merge(step, { seats: [{ id: row.id, patch: { gold: row.gold - gold } }] });
        }

        const names = lost.map((held) => cardName(held.cardId));
        step = merge(step, {
          journal: [
            {
              seatId: row.id,
              turn: snapshot.game.turn,
              kind: "lost-card",
              payload: { co: effect.co, cardIds: lost.map((h) => h.cardId), gold: gold },
            },
          ],
        });
        writes = merge(writes, step);
        said.push(
          `${named(snapshot, row)}: ` +
            [names.join(", "), gold > 0 ? `${gold} Sz. Z.` : ""].filter(Boolean).join(", "),
        );
      }

      return {
        writes,
        result: {
          did:
            said.length > 0
              ? [`tracą ${lossTaken(effect)} — ${said.join("; ")}`]
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
      const name = NATURE_LABEL[effect.na] ?? effect.na;
      // Nothing written to the seat means the Natura was already the one the
      // card asks for. Saying "Natura: zła" there would report a turn of the
      // card that did not happen — see `changeNature`, which journals the
      // attempt for the same reason.
      const changed = (done.writes.seats?.length ?? 0) > 0;
      return {
        writes: done.writes,
        result: {
          did: [changed ? `Natura: ${name}` : `Natura bez zmian — już ${name}`],
          pending: null,
        },
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
    snapshot.seats.map((row) => seatView(snapshot, row.id).asTarget),
    actor ? seatView(snapshot, actor.id).asTarget : undefined,
    oprocz,
  );
}

/* --------------------------------------------------------------------------
 * The three doors an effect comes through.
 * ----------------------------------------------------------------------- */

/** Notes a card or an offer as dealt with, so the turn stops asking about it. */
function markResolved(snapshot: Snapshot, key: string): Changeset {
  const state = snapshot.game.turn_state;
  if (state.phase !== "field") return {};
  const already = state.resolved ?? [];
  if (already.includes(key)) return {};
  return { game: { turn_state: { ...state, resolved: [...already, key] } } };
}

export interface UseResult {
  card: string;
  face?: number;
  did: string[];
  /** The part the table has to settle itself. */
  stol: boolean;
}

/**
 * Spends a Karta that is used up by being used.
 *
 * Nine Przedmioty are an act rather than a possession, and every one of them
 * says the Karta goes whatever comes of it — the Łódź says so even if you never
 * got in it. So it is spent first and the effect is worked out afterwards.
 *
 * One die, and only for a card whose script is a table.
 */
export async function spendHolding(
  snapshot: Snapshot,
  command: { holdingId: string; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<UseResult>> {
  const held = snapshot.holdings.find((h) => h.id === command.holdingId);
  if (!held) throw new Error("Nie ma takiej Karty.");

  // Zaklęcia are spoken, not used: 9.6 has its own path, with its own window
  // and its own announcement to the table.
  if (held.kind === "spell") throw new Error("Zaklęcie się rzuca, nie używa (9.6).");

  const cardId = held.card_id;
  const use = usageOf(cardId);
  if (!use) throw new Error(`${cardName(cardId)} — tej Karty się nie zużywa.`);

  const seatId = held.seat_id;
  const script = use.rozpatruje === "aplikacja" ? scriptFor(cardId) : null;
  const face =
    script?.effect.op === "rzut" ? await ports.random.rollD6(`${cardName(cardId)}: tabela`) : undefined;

  const gone: Changeset = { holdings: { delete: [held.id] } };
  const spent = mergeAll(
    gone,
    putOnPile(apply(snapshot, gone), "events", [{ cardId, granted: held.granted }]),
    {
      journal: [
        {
          seatId,
          turn: snapshot.game.turn,
          kind: "used",
          payload: { cardId, ...(face !== undefined ? { face } : {}) },
        },
      ],
    },
  );

  // An effect the buff system can hold is applied here and now — the card is
  // gone, and what it bought is a thing the character is under until it runs
  // out. This is the whole of what "aplikacja" means for a card with no die.
  if (use.efekt) {
    const under = addEffect(apply(snapshot, spent), {
      seatId,
      effect: { source: cardId, ...use.efekt },
    });
    return {
      writes: merge(spent, under),
      result: { card: cardName(cardId), did: [use.efekt.label], stol: false },
    };
  }

  if (!script) {
    return { writes: spent, result: { card: cardName(cardId), did: [use.co], stol: true } };
  }

  const effect =
    face !== undefined && script.effect.op === "rzut" ? script.effect.faces[face] : script.effect;
  const done = await applyEffect(
    apply(snapshot, spent),
    {
      seatId,
      effect,
      reason: face !== undefined ? `${cardName(cardId)} (${face})` : cardName(cardId),
      shuffle: command.shuffle,
    },
    ports,
  );

  return {
    writes: merge(spent, done.writes),
    result: {
      card: cardName(cardId),
      ...(face !== undefined ? { face } : {}),
      // A face the app cannot finish — the Szkatuła's Tarcza Tolimana, which is
      // a Karta somebody has to hand over — is reported as the table's rather
      // than silently dropped.
      did: done.result.pending
        ? [...done.result.did, describeEffect(done.result.pending)]
        : done.result.did,
      stol: done.result.pending !== null,
    },
  };
}

/**
 * Rolls an Obszar's own table, or simply carries out what it offers (15.1).
 *
 * One die, and only when the offer is a table. Said here rather than left to
 * whatever the face happens to do — a face that opens a fight would otherwise
 * report "nie czas na walkę", which is true and explains nothing.
 */
export async function resolveFieldOffer(
  snapshot: Snapshot,
  command: { offerName: string; decided?: Decisions; manual?: boolean; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<{ offer: string; face?: number; did: string[]; pending: Effect | null }>> {
  const seat = activeSeat(snapshot);
  if (!seat.field_id) throw new Error("Postać nie stoi na Obszarze.");
  if (snapshot.game.turn_state.phase !== "field") {
    throw new Error("To rozpatruje się po wejściu na Obszar.");
  }

  const script = fieldScriptFor(seat.field_id);
  const offer = script?.offers.find((o) => o.name === command.offerName);
  if (!offer) throw new Error(`Na tym Obszarze nie ma: ${command.offerName}`);

  const table = offer.effect.op === "rzut";
  const face = table ? await ports.random.rollD6(`${offer.name}: tabela`) : undefined;
  const rolled: Changeset =
    face !== undefined
      ? {
          journal: [
            {
              seatId: seat.id,
              turn: snapshot.game.turn,
              kind: "field-table",
              payload: { offer: offer.name, face },
              manual: command.manual ?? false,
            },
          ],
        }
      : {};

  const effect =
    face !== undefined && offer.effect.op === "rzut" ? offer.effect.faces[face] : offer.effect;
  const done = await applyEffect(
    apply(snapshot, rolled),
    {
      seatId: seat.id,
      effect,
      reason: face !== undefined ? `${offer.name} (${face})` : offer.name,
      decided: command.decided,
      shuffle: command.shuffle,
    },
    ports,
  );

  const soFar = merge(rolled, done.writes);
  const noted = done.result.pending
    ? {}
    : markResolved(apply(snapshot, soFar), offerKey(offer.name));

  return {
    writes: merge(soFar, noted),
    result: { offer: offer.name, ...(face !== undefined ? { face } : {}), ...done.result },
  };
}

/**
 * Carries out a Karta that was drawn onto this Obszar (16.1).
 *
 * One die, and only when the card's script is a table.
 */
export async function resolveDrawnCard(
  snapshot: Snapshot,
  command: { cardId: string; decided?: Decisions; manual?: boolean; shuffle: Shuffle },
  ports: CommandPorts,
): Promise<Outcome<{ card: string; face?: number; did: string[]; pending: Effect | null }>> {
  const seat = activeSeat(snapshot);
  const state = snapshot.game.turn_state;
  if (state.phase !== "field") throw new Error("Nie ma czego rozpatrywać.");
  if (!state.drawn.some((entry) => entry.cardId === command.cardId)) {
    throw new Error("Tej Karty tu nie ma.");
  }

  const script = scriptFor(command.cardId);
  if (!script) throw new Error(`${cardName(command.cardId)} — tę Kartę rozpatrzcie sami.`);

  const table = script.effect.op === "rzut";
  const face = table ? await ports.random.rollD6(`${cardName(command.cardId)}: tabela`) : undefined;
  const rolled: Changeset =
    face !== undefined
      ? {
          journal: [
            {
              seatId: seat.id,
              turn: snapshot.game.turn,
              kind: "card-table",
              payload: { cardId: command.cardId, face },
              manual: command.manual ?? false,
            },
          ],
        }
      : {};

  const effect =
    face !== undefined && script.effect.op === "rzut" ? script.effect.faces[face] : script.effect;
  const done = await applyEffect(
    apply(snapshot, rolled),
    {
      seatId: seat.id,
      effect,
      reason:
        face !== undefined ? `${cardName(command.cardId)} (${face})` : cardName(command.cardId),
      decided: command.decided,
      shuffle: command.shuffle,
    },
    ports,
  );

  const soFar = merge(rolled, done.writes);
  const noted = done.result.pending ? {} : markResolved(apply(snapshot, soFar), command.cardId);

  return {
    writes: merge(soFar, noted),
    result: {
      card: cardName(command.cardId),
      ...(face !== undefined ? { face } : {}),
      ...done.result,
    },
  };
}
