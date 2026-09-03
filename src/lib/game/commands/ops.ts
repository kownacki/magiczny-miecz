/**
 * The card vocabulary's leaf words, one executor per op. `walk` (./effects)
 * owns the cursor and the composing ops and dispatches everything that neither
 * branches nor recurses here — one `Record` over the whole leaf union, so an
 * op the compiler has not been told how to run fails the build at this table
 * rather than at a table.
 */

import { STORAGE, makerOf, type Slot } from "@/lib/engine/slots";
import { FIELDS } from "@/lib/engine/board";
import type { FieldId } from "@/lib/engine/board";
import type { Shuffle } from "@/lib/engine/deck";
import { cardIdNamed } from "@/lib/engine/lookup";
import { takeCard } from "./holdings";
import { seatsTargeted, type TargetSeat } from "@/lib/engine/targets";
import { chooseLosses, goldLost, lossTaken, reachableBy } from "@/lib/engine/losses";
import { endTurn } from "@/lib/engine/turn";
import { cardName, fieldName, NATURE_LABEL, plural } from "@/lib/engine/polish";
import type { Effect } from "@/lib/engine/cardScript";
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
import { drawCard, drawSpell, peekDue } from "./draw";
import { summonFighter } from "./fight";
import { nameOfSeat } from "./lobby";
import { healSeat } from "./life";
import { asReturnable, putOnPile } from "./piles";
import { only, replaceTop, requireTop, top } from "@/lib/engine/stack";
import { keepOnly, storedStatuses, addEffect } from "./turn";
import { turnToStone } from "./stone";
import { seatView } from "./seat";
import { isSpared } from "@/lib/engine/abilities";
import { BY_REF, decksOf } from "../decks";

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
   * effect has been carried out — and null too when the walk suspended on a
   * `walka`, which asks nobody anything: it opens a fight.
   */
  pending: Effect | null;
  /**
   * Set when the walk stopped short of the end and a `script` frame carries
   * the rest — see docs/STACK.md. `cursor` is the path to the node it stopped
   * at; `opens` is what the step wants standing above the frame.
   */
  suspended?: {
    cursor: number[];
    opens?: Opens;
  };
}

/**
 * What a suspending step wants opened above its `script` frame.
 *
 * Two kinds, because two things can stop a card mid-sentence and neither of
 * them can be done inside the walk: a fight has dice, spells and other seats
 * in it, and a question owed to a Charakterystyka rather than to the card has
 * cards to lift off a pile first. Both are built by `framed`, after the script
 * frame is pushed, so that what opens sits above the card it interrupted.
 */
export type Opens =
  | { kind: "walka"; nazwa: string; miecz?: number; magia?: number }
  | { kind: "ask" };

/**
 * Everything a leaf op may read. The walk builds one per dispatch off the
 * `ApplyEffect` it was handed — the four optional fields are that command's,
 * each present for the one op its doc names.
 */
export interface OpContext {
  snapshot: Snapshot;
  seatId: string;
  reason: string;
  shuffle: Shuffle;
  ports: CommandPorts;
  /** The same queue the walk consumes — `choices.shift()` here is seen there. */
  decided: Decisions;
  /** The path to this node, which is what a suspension writes down. */
  path: number[];
  fieldId?: FieldId;
  fieldCardId?: string;
  toSeatId?: string;
  cardId?: string;
}

/** Nothing left to do: what was done, and no question owed. */
export const nothing = (did: string[]): Outcome<Resolution> => ({
  writes: {},
  result: { did, pending: null },
});

/** The walk stopped here: the whole node back as pending, the cursor to it. */
export const owedAt = (effect: Effect, path: number[]): Outcome<Resolution> => ({
  writes: {},
  result: { did: [], pending: effect, suspended: { cursor: path } },
});

/**
 * How many of a thing, in Polish.
 *
 * Miecz, Magia and Życie take the same form whatever the number — "+2 Życia" —
 * but Złoto declines: one Sztukę, two to four Sztuki, five and up Sztuk. The
 * deltas in this game are almost always one, which is exactly the case a single
 * fixed form gets wrong.
 */
function amountOf(stat: "sword" | "magic" | "life" | "gold", count: number): string {
  if (stat !== "gold") {
    return { sword: "Miecza", magic: "Magii", life: "Życia" }[stat];
  }
  return plural(count, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota");
}

function named(snapshot: Snapshot, row: SeatRow): string {
  return nameOfSeat(snapshot.users, row.seat_index);
}

/**
 * Whether a card the character is carrying waives what this Obszar costs.
 *
 * Nine cards do this and they are specific about both halves — which Obszar,
 * and which of its costs. The Rękawice keep the point of Życie on the Ruchome
 * Skały and nothing else; the Kij i Sznur keep the Przedmiot on the Bagna and
 * would not save a point of Życie anywhere. So the field is read off the seat
 * rather than passed in: this is asked in the middle of resolving an effect,
 * and where the character is standing is what the card is about.
 *
 * The Relikwiarz is why Natura is asked for. It spares a Dobra Postać at the
 * Czarci Młyn and a Zła one at the Studnia Wieczności, and nobody at the other.
 */
function sparedHere(
  snapshot: Snapshot,
  seatId: string,
  from: "life" | "utrata",
): boolean {
  const view = seatView(snapshot, seatId);
  return view.fieldId !== null && isSpared(view.abilities, view.fieldId, from, view.nature);
}

/** Who an effect lands on, read off the snapshot. */
function targeted(
  snapshot: Snapshot,
  seatId: string,
  target: Parameters<typeof seatsTargeted>[0],
  oprocz: Parameters<typeof seatsTargeted>[3],
  /** The Obszar the player pointed at, where the card lets them point at one. */
  at?: FieldId,
): TargetSeat[] | null {
  const actor = snapshot.seats.find((row) => row.id === seatId);
  const from = actor ? seatView(snapshot, actor.id).asTarget : undefined;
  return seatsTargeted(
    target,
    snapshot.seats.map((row) => seatView(snapshot, row.id).asTarget),
    // „Tutaj" is the Obszar the effect was aimed at when one was named, and the
    // actor's own square otherwise — which is every other card that says it.
    from && at !== undefined ? { ...from, fieldId: at } : from,
    oprocz,
  );
}

/**
 * The ops the walk never dispatches: composing ops it walks itself, the
 * decision-gated shapes it settles before the gate, and the three that
 * `isSettled` owes back to the table unconditionally.
 */
type WalkedOp = "wybor" | "po-kolei" | "rzut" | "gdy" | "jak-pole" | "przenies-karte";

export type LeafOp = Exclude<Effect["op"], WalkedOp>;

type OpRun<K extends LeafOp> = (
  ctx: OpContext,
  effect: Extract<Effect, { op: K }>,
) => Outcome<Resolution> | Promise<Outcome<Resolution>>;

/**
 * `isSettled` answers false for these three unconditionally, so the gate owes
 * them back as `pending` and the table carries them out by hand — they cannot
 * reach this dispatch. Listed so the compiler counts them; implementing one
 * starts by replacing its throw.
 */
const unimplemented = (_ctx: OpContext, effect: Effect): never => {
  throw new Error(`Nie wiem, jak wykonać: ${effect.op}`);
};

const OPS: { [K in LeafOp]: OpRun<K> } = {
  nic: () => nothing(["nic się nie dzieje"]),

  /**
   * Puts the character under something that lasts.
   *
   * Delegated to `addEffect` rather than writing the row here, so a status a
   * card causes and a status the test console conjures reach `seat_effects`
   * by the same door and get the same journal line. 1.2 and 2.2 are why it is
   * a row and not an adjustment: an effect is added at read time and never
   * written into own points, or it would outlive its own expiry.
   */
  efekt: (ctx, effect) => {
    const { snapshot, seatId, reason } = ctx;
    /**
     * One seat, or everybody the card names.
     *
     * The same loop `punkty` and `tura-stracona` run, and for the same
     * reason: „żaden gracz, łącznie z tobą" is a fact about the table rather
     * than about whoever spoke it. Chained through `apply` so two seats
     * cannot be given the same row id.
     */
    const hit = effect.target
      ? targeted(snapshot, seatId, effect.target, undefined, ctx.fieldId)
      : null;
    const seats = hit
      ? hit
          .map(
            (one) =>
              snapshot.seats.find((row) => row.seat_index === one.seatIndex)?.id ?? null,
          )
          .filter((id): id is string => id !== null)
      : [seatId];
    let writes: Changeset = {};
    for (const id of seats) {
      writes = merge(
        writes,
        addEffect(apply(snapshot, writes), {
          seatId: id,
          effect: {
            source: reason,
            label: effect.label,
            modifier: effect.modifier,
            ends: effect.ends,
          },
        }),
      );
    }
    return { writes, result: { did: [effect.label], pending: null } };
  },

  /**
   * A die for each card of a kind, thrown for that card alone.
   *
   * Both Urwiska: "Rzuć także za każdego z Przyjaciół: 1 lub 2 oczka
   * Przyjaciel traci Życie (odłóż jego kartę)." A character with four
   * Przyjaciele throws four times and may lose all of them or none, which is
   * why this is neither a `strata` (nobody chooses) nor a `rzut` (one die
   * settling one outcome for the whole seat).
   *
   * 6.4 sends a Przyjaciel who dies to the used pile, which is where a
   * discarded Przedmiot goes too — neither is left on the Obszar, because
   * nobody put it down.
   */
  "rzut-za-kazdego": async (ctx, effect) => {
    const { snapshot, seatId, reason, ports } = ctx;
    // The board names the kinds in Polish and the rows are stored in the
    // engine's own words; `reachableBy` is the one place that translation
    // lives, so a loss and a roll agree about what a Przyjaciel is.
    const kind = reachableBy(effect.co);
    const mine = snapshot.holdings.filter(
      (held) => held.seat_id === seatId && held.kind === kind,
    );
    if (mine.length === 0) {
      return nothing([`nie masz ${effect.co === "przyjaciel" ? "Przyjaciół" : "Przedmiotów"}`]);
    }

    const gone: typeof mine = [];
    const said: string[] = [];
    for (const held of mine) {
      const die = await ports.random.rollD6(`${reason}: ${held.card_id}`);
      if (die <= effect.gubiPrzy) {
        gone.push(held);
        said.push(`${cardName(held.card_id)} przepada (${die})`);
      } else {
        said.push(`${cardName(held.card_id)} zostaje (${die})`);
      }
    }
    if (gone.length === 0) return nothing(said);

    const lifted: Changeset = { holdings: { delete: gone.map((held) => held.id) } };
    const piled = putOnPile(apply(snapshot, lifted), "events", gone.map(asReturnable));
    return {
      writes: mergeAll(lifted, piled, {
        journal: gone.map((held) => ({
          seatId,
          round: snapshot.game.round,
          kind: "lost-card" as const,
          payload: { cardId: held.card_id, kind: held.kind },
        })),
      }),
      result: { did: said, pending: null },
    };
  },

  /**
   * Rid of a named card and everything it laid on you.
   *
   * "Po wizycie u Pustelnika odłóż Kartę." One act, so both halves here: the
   * statuses that card gave go, and the Karta goes to the used pile with
   * them. Statuses are matched on `source`, which `applyEffect` fills with the
   * printed name — the reason a player was given is the reason they read.
   *
   * Nothing at all when the character is not carrying it, which is a visit to
   * the Pustelnia by somebody who never met the Zły Duch.
   */
  uwolnij: (ctx, effect) => {
    const { snapshot, seatId } = ctx;
    const name = cardName(effect.od);
    const held = storedStatuses(snapshot, seatId);
    const left = held.filter((status) => status.source !== name);
    const card = snapshot.holdings.find(
      (h) => h.seat_id === seatId && h.card_id === effect.od,
    );
    if (left.length === held.length && !card) return nothing([`${name} — nic cię nie trzyma`]);

    const lifted: Changeset = card ? { holdings: { delete: [card.id] } } : {};
    const piled = card
      ? putOnPile(apply(snapshot, lifted), "events", [asReturnable(card)])
      : {};
    return {
      writes: mergeAll(keepOnly(snapshot, seatId, left), lifted, piled),
      result: { did: [`uwalniasz się od: ${name}`], pending: null },
    };
  },

  /**
   * A card taken off the victim and handed to the caster.
   *
   * Not a `strata`: what is taken changes hands and is still in the game,
   * which is the whole of the Pan Przyjaciół — "dołączyć go do swoich".
   *
   * Which card goes is answered the same way every other choice is, as an
   * index into the candidates. Whose answer it is differs by card and is the
   * data's business, not this function's: 5.6 gives it to the victim, and
   * Szaleństwo's own text takes it back — "obejrzeć Zaklęcia i wybrać jedno
   * z nich", the one place a hand held under 9.3 is opened to somebody else.
   */
  zabierz: (ctx, effect) => {
    const { snapshot, seatId, decided, path } = ctx;
    const taker = ctx.toSeatId;
    if (!taker) return nothing(["nie wiadomo, komu miałoby przypaść"]);
    if (taker === seatId) return nothing(["nie zabierasz Kart samemu sobie"]);

    // "jeden Przedmiot lub jedną Sztukę Złota" — the coin is the simpler half
    // and is taken when the victim has no Przedmiot to give.
    const kind = effect.co === "przedmiot-lub-zloto" ? "item" : reachableBy(effect.co);
    const mine = snapshot.holdings.filter(
      (held) => held.seat_id === seatId && held.kind === kind,
    );

    if (mine.length === 0) {
      const victim = snapshot.seats.find((one) => one.id === seatId);
      if (effect.co === "przedmiot-lub-zloto" && victim && victim.gold > 0) {
        return {
          writes: {
            seats: [
              { id: victim.id, patch: { gold: victim.gold - 1 } },
              ...snapshot.seats
                .filter((one) => one.id === taker)
                .map((one) => ({ id: one.id, patch: { gold: one.gold + 1 } })),
            ],
          },
          result: { did: ["zabierasz 1 Sztukę Złota"], pending: null },
        };
      }
      return nothing(["nie ma czego zabrać"]);
    }

    const picked = decided.choices?.shift();
    if (picked === undefined) return owedAt(effect, path);
    const at = Math.min(Math.max(0, Math.trunc(picked)), mine.length - 1);
    const card = mine[at];

    return {
      writes: {
        holdings: {
          patch: [{ id: card.id, patch: { seat_id: taker, slot: null, ordinal: null } }],
        },
        journal: [
          {
            seatId: taker,
            round: snapshot.game.round,
            kind: "taken",
            payload: { cardId: card.card_id, kind: card.kind, od: seatId },
          },
        ],
      },
      result: { did: [`zabierasz: ${cardName(card.card_id)}`], pending: null },
    };
  },

  /**
   * The Karta settles somewhere the board chose rather than staying where it
   * was drawn.
   *
   * Three do it — the Eremita, the Upiór and the Lewiatan — and all three roll
   * for the Obszar, which is why the destination is a `pole` and not a
   * question. It comes off the turn's own stack, because a card that has gone
   * to live somewhere else is not one of the Karty this character still has
   * to deal with (16.8).
   */
  "poloz-karte": (ctx, effect) => {
    const { snapshot, seatId, path } = ctx;
    if (!ctx.cardId) return nothing(["nie wiadomo, którą Kartę położyć"]);
    // A list of Obszary is answered before the gate above and arrives here as
    // the one that was chosen — see the `jedno-z` block in the walk.
    if (effect.gdzie.kind !== "pole") return owedAt(effect, path);
    const chosen = effect.gdzie.fieldId;

    const state = top(snapshot.game.turn_state);
    const lifted: Changeset =
      state.phase === "field"
        ? {
            game: {
              turn_state: replaceTop(snapshot.game.turn_state, {
                ...state,
                drawn: state.drawn.filter((entry) => entry.cardId !== ctx.cardId),
              }),
            },
          }
        : {};
    const granted =
      state.phase === "field" &&
      (state.drawn.find((entry) => entry.cardId === ctx.cardId)?.granted ?? false);

    return {
      writes: merge(lifted, {
        fieldCards: {
          insert: [{ field_id: chosen, card_id: ctx.cardId, granted }],
        },
        journal: [
          {
            seatId,
            round: snapshot.game.round,
            kind: "placed",
            payload: { cardId: ctx.cardId, fieldId: chosen },
          },
        ],
      }),
      result: {
        did: [`${cardName(ctx.cardId)} osiada na: ${fieldName(chosen)}`],
        pending: null,
      },
    };
  },

  /**
   * A Karta the Obszar hands you outright.
   *
   * "otrzymujesz Magiczny Miecz (jeżeli jeszcze jakieś są)" at the Świątynia
   * Bogini Nemed, and the Tarcza Tolimana at the other one. The parenthesis
   * is 21.2's stock rule and needs nothing here: `takeCard` already refuses
   * when the Wyposażenie has none left, along with 5.3's Natura restriction
   * and 5.4's carrying limit, and each of those is a real reason a character
   * walks away empty-handed. The refusal is reported rather than swallowed,
   * because "nie ma już ani jednej" and "twoja Natura nie pozwala" are things
   * a table will otherwise argue about.
   *
   * Declared in the vocabulary from the start and never implemented — no card
   * used it, and the two Obszary that do were not scripted until now.
   */
  otrzymaj: (ctx, effect) => {
    const { snapshot, seatId } = ctx;
    const found = cardIdNamed(effect.co);
    if (!("id" in found)) {
      return nothing([`${effect.co} — nie wiadomo, o którą Kartę chodzi`]);
    }
    try {
      const taken = takeCard(snapshot, { seatId, cardId: found.id });
      return {
        writes: taken.writes,
        result: { did: [`otrzymujesz: ${cardName(found.id)}`], pending: null },
      };
    } catch (refused) {
      return nothing([(refused as Error).message]);
    }
  },

  punkty: (ctx, effect) => {
    const { snapshot, seatId, reason, path } = ctx;
    const hit = targeted(snapshot, seatId, effect.target, [], ctx.fieldId);
    // Waits for somebody to arrive, or for the holder to choose.
    if (hit === null) return owedAt(effect, path);
    if (hit.length === 0) return nothing(["nikogo to nie dotyczy"]);

    let writes: Changeset = {};
    /** What the seats actually moved by, which the floor under own points may cut. */
    const each: number[] = [];
    /** Whoever a card carried them past it — said, or the table sees nothing happen. */
    const spared: string[] = [];
    for (const target of hit) {
      const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
      if (!row) continue;
      /**
       * "nie stracisz 1 punktu Życia na Ruchomych Skałach."
       *
       * Only a loss, and only Życie. These cards say what an Obszar will not
       * do *to* you; none of them declines a gift, and the Rękawice are no
       * help against a card that takes a point of Miecza.
       */
      if (effect.stat === "life" && effect.delta < 0 && sparedHere(snapshot, row.id, "life")) {
        spared.push(named(snapshot, row));
        continue;
      }
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
    const safely = spared.map((who) => `${who}: bez zmiany — Karta chroni na tym Obszarze`);
    return {
      writes,
      result: {
        did: [
          ...(each.length > 0
            ? [stopped ? `${asked} — bez zmiany, nie ma poniżej czego zejść` : asked]
            : []),
          ...safely,
        ],
        pending: null,
      },
    };
  },

  "tura-stracona": (ctx, effect) => {
    const { snapshot, seatId, reason, path } = ctx;
    const hit = targeted(snapshot, seatId, effect.target, effect.oprocz ?? [], ctx.fieldId);
    if (hit === null) return owedAt(effect, path);
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
        round: snapshot.game.round,
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
        ...(stops ? { game: { turn_state: only(endTurn()) } } : {}),
      },
      result: {
        did: [onlyMe ? `tracisz ${effect.turns} turę` : `tracą turę: ${names.join(", ")}`],
        pending: null,
      },
    };
  },

  strata: async (ctx, effect) => {
    const { snapshot, seatId, decided, ports, path } = ctx;
    const hit = targeted(snapshot, seatId, effect.target, [], ctx.fieldId);
    if (hit === null) return owedAt(effect, path);

    let writes: Changeset = {};
    const said: string[] = [];

    for (const target of hit) {
      const row = snapshot.seats.find((s) => s.seat_index === target.seatIndex);
      if (!row) continue;

      /**
       * "Mając kij i mocny sznur możesz bezpiecznie przejść przez Bagna. Nie
       * tracisz tam Przedmiotu ani Przyjaciela."
       *
       * Read off where the character is standing, so the Kij i Sznur answer
       * for the Bagna and for nothing else. A Zaklęcie that strips a hand
       * somewhere else is untouched by it.
       */
      if (sparedHere(snapshot, row.id, "utrata")) {
        said.push(`${named(snapshot, row)}: nic nie traci — Karta chroni na tym Obszarze`);
        continue;
      }

      const at = apply(snapshot, writes);
      /**
       * What a loss may reach for, which is not everything a seat has.
       *
       * A carried Zaklęcie is the Przyjaciel's, not the character's: it goes
       * when its friend goes and never on its own account.
       *
       * And the Tajemna Sakwa, with whatever is in it. "Przedmiot ten i
       * Sakwę będziesz mógł utracić **jedynie** w wypadku użycia Zaklęcia
       * »Pan Bogactwa«" — so every door but that one is shut, and this is the
       * door: `strata` is what the Bagna, the Złoczyńca, the Wielkolud, the
       * Zasadzka, a lost fight's ransom and the Urocza Diablica all come
       * through. Pan Bogactwa does not; it names its target and takes it, so
       * it reaches past this on purpose.
       *
       * Both halves, because the card protects both. A rule that took the bag
       * and left its contents floating would be worse than one that took
       * neither.
       *
       * Written as a flatMap so the narrowing is the compiler's too, not only
       * the filter's.
       */
      const stored = at.holdings.filter(
        (held) => held.seat_id === row.id && STORAGE.includes(held.slot as Slot),
      );
      // The bag as well as what is in it, but only while there is something in
      // it: "Przedmiot ten i Sakwę" is a pair, and an empty bag is a bag.
      const bags = new Set(stored.map((held) => makerOf(held.slot as Slot)));
      const spared = (held: { card_id: string; slot: string | null }) =>
        STORAGE.includes(held.slot as Slot) || bags.has(held.card_id);
      const mine = at.holdings.flatMap((held) =>
        held.seat_id === row.id && held.kind !== "carried" && !spared(held)
          ? [{ id: held.id, cardId: held.card_id, kind: held.kind, granted: held.granted }]
          : [],
      );

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
      /**
       * Chance answers from the dice; the holder answers from the queue.
       *
       * 5.6 makes which card goes the holder's own decision, and the two are
       * answered the same way — an index into the candidates, clamped by
       * `chooseLosses` — so the only difference is where the number comes
       * from. A `ty` loss with nothing left in the queue gets null back and
       * stays pending, which is the question being asked rather than a card
       * being taken on the player's behalf.
       */
      const gone =
        effect.wybor === "losowo"
          ? chooseLosses(mine, effect, () => rolls[next++] ?? 0)
          : chooseLosses(mine, effect, () => decided.choices?.shift() ?? null);
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
            round: snapshot.game.round,
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
  },

  uzdrow: (ctx, effect) => {
    const { snapshot, seatId } = ctx;
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
  },

  zaklecie: (ctx, effect) => {
    const { snapshot, seatId, shuffle, path } = ctx;
    let writes: Changeset = {};
    const names: string[] = [];

    /**
     * The Sztukmistrz's price, checked before the pile is touched.
     *
     * "za 1 Sztukę Złota" per Zaklęcie, so a purse that cannot cover the lot
     * buys none: this is a shop refusing a sale rather than a card doing half
     * of what it says. The coins are taken after the draw and only for the
     * Zaklęcia actually drawn — 2.6 or an empty pile may stop it short, and
     * nobody pays to be told their Magia is too low.
     */
    const buyer = effect.cena ? snapshot.seats.find((one) => one.id === seatId) : undefined;
    if (effect.cena && buyer && buyer.gold < effect.cena * effect.count) {
      return nothing([
        `Za mało złota: ${plural(effect.cena * effect.count, "Sztuka Złota", "Sztuki Złota", "Sztuk Złota")}.`,
      ]);
    }
    /**
     * A gift the character may not accept is reported, not thrown.
     *
     * 2.6 caps the hand by Magia and `drawSpell` refuses over it — which is
     * right, and used to abort the whole resolution: a Świątynia table whose
     * seventh row is a Zaklęcie would crash mid-prayer for a Postać with
     * Magia 0, losing the rows already applied. The same bargain `otrzymaj`
     * makes, and for the same reason: "your Magia does not allow it" is an
     * outcome a table needs told, not a stack trace.
     *
     * Anything drawn before the refusal is kept — the pile really did give
     * those up, and putting them back would need a second write nothing asked
     * for.
     */
    /**
     * The Chochlik turns this step into a question, so the card stops here.
     *
     * The draw is not made: the walk suspends and `framed` opens the `ask`
     * *above* the script frame, which is the only order that lets the card
     * carry on afterwards. Answering deals the chosen Zaklęcie and pops back
     * to this cursor, where the node counts as done.
     *
     * The price is paid before the suspension rather than after the answer.
     * A Nieznajomy selling a Zaklęcie for a Sztuka Złota is the one card with
     * both, and the coin buys the draw — which has happened by the time the
     * question is on screen, since the cards are already off the pile.
     *
     * Only for a single Zaklęcie. Every `zaklecie` in the box asks for one,
     * and a suspension part-way through a run of them would owe a second
     * question this frame has nowhere to remember.
     */
    if (effect.count === 1 && peekDue(snapshot, seatId)) {
      const paidUp: Changeset =
        effect.cena && buyer
          ? { seats: [{ id: buyer.id, patch: { gold: buyer.gold - effect.cena } }] }
          : {};
      return {
        writes: paidUp,
        result: {
          did: ["Zaklęcie: wybierasz jedną z dwóch"],
          pending: null,
          suspended: { cursor: path, opens: { kind: "ask" } },
        },
      };
    }

    for (let i = 0; i < effect.count; i++) {
      try {
        const done = drawSpell(apply(snapshot, writes), { seatId, shuffle, peek: false });
        writes = merge(writes, done.writes);
        if (done.result !== null) names.push(done.result);
      } catch (refused) {
        const said = (refused as Error).message;
        return {
          writes,
          result: {
            did: names.length > 0 ? [`Zaklęcie: ${names.join(", ")}`, said] : [said],
            pending: null,
          },
        };
      }
    }
    const paid =
      effect.cena && buyer && names.length > 0
        ? {
            seats: [
              { id: buyer.id, patch: { gold: buyer.gold - effect.cena * names.length } },
            ],
          }
        : {};
    return {
      writes: merge(writes, paid),
      result: {
        did: [
          `Zaklęcie: ${names.join(", ")}` +
            (effect.cena && names.length > 0
              ? ` (za ${effect.cena * names.length} Sz. Z.)`
              : ""),
        ],
        pending: null,
      },
    };
  },

  kamien: (ctx) => ({
    writes: turnToStone(ctx.snapshot, { seatId: ctx.seatId }),
    result: { did: ["Zamiana w Kamień (20.1)"], pending: null },
  }),

  natura: (ctx, effect) => {
    const done = changeNature(ctx.snapshot, { seatId: ctx.seatId, nature: effect.na });
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
  },

  przenies: (ctx, effect) => {
    const { snapshot, seatId, reason, path } = ctx;
    if (effect.to.kind !== "pole") return owedAt(effect, path);
    // 13.1 and the Instrukcja's own example: „Obbol jednak musi kontynuować
    // turę, czyli zachować się tak, jakby jego ruch zakończył się na Równinie
    // Traw." The Obszar he lands on is his to explore, and it draws.
    const moved = placeSeat(snapshot, {
      seatId,
      target: effect.to.fieldId,
      reason,
      by: "karta",
    });
    return {
      writes: moved.writes,
      result: {
        did: [
          `przenosisz się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`,
        ],
        pending: null,
      },
    };
  },

  walka: (ctx, effect) => {
    // A creature the card conjures rather than a card on the field. The walk
    // cannot fight — dice, spells and other seats live above it — so it
    // suspends here and `framed` opens the fight over the script frame.
    // Coming back down the cursor, the fight is done and this node with it.
    return {
      writes: {},
      result: {
        did: [`walka: ${effect.nazwa}`],
        pending: null,
        suspended: {
          cursor: ctx.path,
          opens: { kind: "walka", nazwa: effect.nazwa, miecz: effect.miecz, magia: effect.magia },
        },
      },
    };
  },

  "wymien-karte": (ctx) => {
    const { snapshot, shuffle } = ctx;
    /**
     * The Karta in front of the player goes back and another comes over.
     *
     * „Odrzucenie" is the used pile and not out of the game — `putOnPile`
     * knows what a conjured Karta and a Wyposażenie are — and the card that
     * replaces it is drawn by the same `drawCard` every other draw goes
     * through, so 15.5's reshuffle happens here too and says so in the
     * journal.
     *
     * Which Karta: the first one that has not been dealt with, which is what
     * 15.2's order means by "the one in front of you" and what the sheet is
     * showing when this may be spoken.
     */
    const state = requireTop(
      snapshot.game.turn_state,
      "field",
      "Nie ma wyciągniętej Karty do wymiany.",
    );
    const settled = new Set([...(state.resolved ?? []), ...(state.fought ?? [])]);
    const facing = state.drawn.find((entry) => !settled.has(entry.cardId));
    if (!facing) throw new Error("Nie ma wyciągniętej Karty do wymiany.");

    const taken: Changeset = {
      game: {
        turn_state: replaceTop(snapshot.game.turn_state, {
          ...state,
          drawn: state.drawn.filter((entry) => entry !== facing),
        }),
      },
    };
    // Chained, not merged: the pile the discard writes is the same `game.deck`
    // the draw below reads and writes again.
    const back = putOnPile(apply(snapshot, taken), "events", [
      { cardId: facing.cardId, granted: facing.granted },
    ]);
    const drew = drawCard(apply(snapshot, mergeAll(taken, back)), {
      named: null,
      shuffle,
      byCard: true,
    });

    return {
      writes: mergeAll(taken, back, drew.writes),
      result: {
        did: [
          `${cardName(facing.cardId)} odrzucona, w zamian: ${
            drew.result.card?.name ?? "nowa Karta"
          }`,
        ],
        pending: null,
      },
    };
  },

  podejrzyj: (ctx, effect) => {
    /**
     * The five that are actually next, off the same end `drawFrom` takes
     * from — a peek that showed a different five would be worse than none.
     *
     * Nothing is written: the cards stay where they are, in that order, and
     * the pile is not reshuffled to fill the count. A short pile shows what
     * it has, which is itself worth knowing at the table.
     */
    const deck = decksOf(ctx.snapshot.game).events;
    const top = deck.draw
      .slice(0, effect.count)
      .map((ref) => BY_REF.get(ref)?.name ?? ref);
    return {
      writes: {},
      result: {
        did: top.length > 0 ? [`na wierzchu: ${top.join(", ")}`] : ["stos jest pusty"],
        pending: null,
      },
    };
  },

  przyzwij: (ctx, effect) => {
    const { snapshot, seatId } = ctx;
    /**
     * Sent at whoever was named as the Zaklęcie was spoken.
     *
     * `seatId` is the spell's target seat — `castSpell` puts the named Postać
     * there — and `fieldCardId` is the other kind of answer. Aimed at neither
     * it is a refusal rather than a creature turning on its caster: „wybraną
     * Postać lub Wroga" means somebody was chosen, and defaulting to the
     * caster is exactly how a Golem would end up eating its summoner.
     */
    const summoned = summonFighter(snapshot, {
      name: effect.nazwa,
      miecz: effect.miecz,
      spellId: ctx.reason,
      ...(ctx.fieldCardId !== undefined
        ? { fieldCardId: ctx.fieldCardId }
        : { targetSeatId: seatId }),
    });
    return {
      writes: summoned.writes,
      result: { did: [`${effect.nazwa} atakuje`], pending: null },
    };
  },

  "ruch-dodatkowy": () => nothing(["dodatkowy ruch — rzuć jeszcze raz"]),

  /**
   * A shop opening, which is all resolving the Karta does.
   *
   * Nothing changes hands here. The Targowisko „zostaje" — its disposition
   * lays it on the Obszar — and from then on `offerOn` finds it among the
   * Karty lying there, so `buy` and `sell` work against it exactly as they do
   * against a shop printed on the board. Buying is the player's own move,
   * made when they like and as often as the stock allows; it was never this
   * card's job to ask.
   */
  kup: (_ctx, effect) =>
    nothing([`otwarte na sprzedaż: ${effect.towar.map((one) => one.co).join(", ")}`]),

  sprzedaj: () => nothing(["można tu sprzedawać"]),

  wyciagnij: (ctx, effect) => {
    const { snapshot, shuffle } = ctx;
    let writes: Changeset = {};
    for (let i = 0; i < effect.count; i++) {
      const done = drawCard(apply(snapshot, writes), { named: null, shuffle, byCard: true });
      writes = merge(writes, done.writes);
    }
    return { writes, result: { did: [`wyciągnięto ${effect.count} Kart`], pending: null } };
  },

  "zaklecia-do-limitu": unimplemented,
  "zamien-punkty": unimplemented,
  zgadnij: unimplemented,
};

export type LeafEffect = Extract<Effect, { op: LeafOp }>;

/**
 * One leaf op, carried out.
 *
 * The cast is the one mapped-dispatch seam TypeScript cannot see through: the
 * table is keyed so `OPS[effect.op]` and `effect` agree by construction.
 */
export function runOp(
  ctx: OpContext,
  effect: LeafEffect,
): Outcome<Resolution> | Promise<Outcome<Resolution>> {
  return OPS[effect.op](ctx, effect as never);
}
