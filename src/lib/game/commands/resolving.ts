/** The three doors an effect comes through: a Przedmiot used up, an Obszar's own offer, and a Karta just drawn. */

import type { Shuffle } from "@/lib/engine/deck";
import { scriptFor } from "@/lib/engine/cardScript";
import { fieldScriptFor, offerKey } from "@/lib/engine/fieldScript";
import { describeEffect } from "@/lib/engine/effectText";
import { usageOf } from "@/lib/engine/uses";
import { afterVisit } from "@/lib/engine/pools";
import { cardName } from "@/lib/engine/polish";
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
import { putOnPile } from "./piles";
import { replaceTop, requireTop, topIf } from "@/lib/engine/stack";
import { activeSeat, seatView } from "./seat";
import { skipsRollAt } from "@/lib/engine/abilities";
import { addEffect, refuseWhileQueuedFor, refuseWhileUndrawn } from "./turn";
import { keyOf, listed } from "@/lib/engine/state";
import type { Decisions } from "./ops";
import { applyEffect, markResolved } from "./effects";

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
          round: snapshot.game.round,
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
 * Rolls an Obszar's own table, or simply carries out what it offers (13.5).
 *
 * 13.5 and not 15.1. That rule is about a Karta Zdarzeń whose instruction sends
 * it to a named Obszar — the Upiór, the Eremita, the Lewiatan — and has nothing
 * to say about a square's own printed text. What governs this is "Postać stosuje
 * się do instrukcji wydrukowanej na Obszarze, na którym się znalazła [...] Do
 * niektórych instrukcji Postać musi się zastosować, do innych może, jeśli ma
 * ochotę", which is also where `obowiazkowe` comes from.
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
  requireTop(
    snapshot.game.turn_state,
    "field",
    "To rozpatruje się po wejściu na Obszar.",
  );

  const script = fieldScriptFor(seat.field_id);
  const offer = script?.offers.find((o) => o.name === command.offerName);
  if (!offer) throw new Error(`Na tym Obszarze nie ma: ${command.offerName}`);

  const table = offer.effect.op === "rzut";

  /**
   * "nie musisz wykonywać rzutów kostką w Wieży Przeznaczenia i na Urwisku.
   * Zawsze możesz tamtędy bezpiecznie przejść."
   *
   * The roll does not happen, and neither does whatever it would have found.
   * That is the whole of the promise and it has to be read that way round: some
   * of these tables give as well as take, and a character who rolled and then
   * ignored a bad face would be helping themselves to the good ones. The Opiekun
   * walks you past the Obszar, he does not read the dice for you.
   *
   * Marked resolved on the way out, so the turn does not stand there waiting for
   * an offer the character is entitled to ignore.
   */
  /**
   * Asked of the Obszar, not of the shape the offer happens to have.
   *
   * This used to require a top-level `rzut`, which held while every protected
   * Obszar was one die and one table. The Urwisko is not: it throws once for
   * the character and again for each Przyjaciel, so its offer is a `po-kolei`
   * — and the Opiekun, the Elflin and the Barbarzyńca walked straight into it,
   * because the guard was looking at the encoding rather than at the board.
   *
   * The cards say where, not how: "nie musisz wykonywać rzutów kostką w Wieży
   * Przeznaczenia i na Urwisku. Zawsze możesz tamtędy bezpiecznie przejść."
   */
  if (skipsRollAt(seatView(snapshot, seat.id).abilities, seat.field_id)) {
    const passed: Changeset = {
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "field-table",
          payload: { offer: offer.name, skipped: true },
        },
      ],
    };
    return {
      writes: merge(passed, markResolved(apply(snapshot, passed), offerKey(offer.name))),
      result: {
        offer: offer.name,
        did: ["przechodzisz bezpiecznie — bez rzutu"],
        pending: null,
      },
    };
  }

  // Two dice where the Obszar prints two — "MOŻESZ MODLIĆ SIĘ RZUCAJĄC 2
  // KOSTKAMI" — because a 2-12 table read off one die would never reach half
  // its rows and would reach the rest far too evenly.
  const pair = table && offer.effect.op === "rzut" && offer.effect.kostki === 2;
  const face = !table
    ? undefined
    : pair
      ? (await ports.random.rollD6(`${offer.name}: tabela (1)`)) +
        (await ports.random.rollD6(`${offer.name}: tabela (2)`))
      : await ports.random.rollD6(`${offer.name}: tabela`);
  const rolled: Changeset =
    face !== undefined
      ? {
          journal: [
            {
              seatId: seat.id,
              round: snapshot.game.round,
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
      mark: offerKey(offer.name),
    },
    ports,
  );

  const soFar = merge(rolled, done.writes);
  const noted =
    done.result.pending || done.result.suspended
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
  const state = requireTop(snapshot.game.turn_state, "field");
  // The whole deal before any of the reading (13.4) — see `refuseWhileUndrawn`.
  refuseWhileUndrawn(snapshot);
  /**
   * Which copy is being resolved, when the square holds two of one card.
   *
   * The first that is not settled already, which is the only reading that makes
   * "resolve the Targowisko" mean anything on a square with two: the second one
   * is still there afterwards and the next call reaches it. Named rather than
   * left to `markResolved` because both halves have to agree — the copy that is
   * struck through must be the copy whose script just ran.
   */
  const being =
    state.drawn.find((entry) => entry.cardId === command.cardId && !listed(state.resolved ?? [], entry)) ??
    state.drawn.find((entry) => entry.cardId === command.cardId);
  if (!being) throw new Error("Tej Karty tu nie ma.");

  /**
   * 12.1's window, for a Karta that offers itself rather than stopping the turn.
   *
   * Silent for everything the kolejka holds — see `refuseWhileQueuedFor`, which
   * asks `mayWalkPast` first, because a Karta that *is* the kolejka must not be
   * gated on it. This is what keeps the SKALNE WROTA last, and with it the one
   * reading of the card that makes its three a fresh badanie.
   */
  refuseWhileQueuedFor(snapshot, seat.id, command.cardId);

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
              round: snapshot.game.round,
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
      // The card is its own subject for `poloz-karte`: three Karty roll for
      // where they settle, and the effect has to know which card it is.
      cardId: command.cardId,
      // The debts a suspension carries across commits: crossing the card off
      // when it finally completes, and keeping the two Spotkania that stay.
      // The copy, not the name — the same key `markResolved` gets below, so a
      // Karta that suspends and finishes two commits later strikes through the
      // one that ran rather than every card of its name.
      mark: keyOf(being),
      ...(script.disposition.kind === "bierzesz" ? { keep: true } : {}),
      reason:
        face !== undefined ? `${cardName(command.cardId)} (${face})` : cardName(command.cardId),
      decided: command.decided,
      shuffle: command.shuffle,
    },
    ports,
  );

  /**
   * "Musisz ją zabrać jako Przyjaciela" — a Spotkanie that stays with you.
   *
   * Two cards do it, the Południca and the Zły Duch, and neither is a Przyjaciel
   * anybody wanted: `kindForCard` reads the printed class and says a Spotkanie
   * is carried by nobody, which is true of the other seventy. The disposition is
   * what knows otherwise, and it was described in `cardScript.ts` from the start
   * and acted on nowhere.
   *
   * Taken as a `friend` because that is the word the cards use and because it is
   * what the rest of the game then does to them: 6.3 puts no limit on how many
   * you may have, the Bagna can take one, the Urwisko rolls for each, and the
   * Zły Duch's own text has to name the Południca as the exception it spares.
   */
  const kept =
    script.disposition.kind === "bierzesz" && !done.result.pending && !done.result.suspended
      ? ({
          holdings: {
            insert: [
              {
                seat_id: seat.id,
                card_id: command.cardId,
                kind: "friend" as const,
                face: "open" as const,
              },
            ],
          },
        } satisfies Changeset)
      : {};

  /**
   * One point off the well, for a Karta that lies there with a pool (16.7).
   *
   * "Każdy, kto tu trafi, będzie mógł zjeść owoc odzyskując 1 punkt Życia i
   * zmniejszając tym samym liczbę punktów przy Drzewie." Only when the effect
   * actually ran: a `pending` or `suspended` resolution has not fed anybody, and
   * these three are `optional`, so somebody who walks past a Zaklęte Źródło with
   * full Magia must not empty it by looking at it.
   *
   * Written onto the turn's own card rather than onto a row, because there is
   * no row — `liftFieldCards` deleted it on arrival. `leaveCardsBehind` puts
   * back what is left, or nothing at all when the well has run dry.
   */
  const drunk = ((): Changeset => {
    if (done.result.pending || done.result.suspended) return {};
    const state = topIf(snapshot.game.turn_state, "field");
    if (!state) return {};
    const at = state.drawn.findIndex((entry) => entry.cardId === command.cardId);
    if (at === -1) return {};
    const left = afterVisit(command.cardId, state.drawn[at].pool ?? null);
    if (!left) return {};
    const drawn = state.drawn.map((entry, index) =>
      index === at ? { ...entry, pool: left.left } : entry,
    );
    return {
      game: { turn_state: replaceTop(snapshot.game.turn_state, { ...state, drawn }) },
    };
  })();

  const soFar = mergeAll(rolled, done.writes, kept, drunk);
  const noted =
    done.result.pending || done.result.suspended
      ? {}
      : markResolved(apply(snapshot, soFar), keyOf(being));

  return {
    writes: merge(soFar, noted),
    result: {
      card: cardName(command.cardId),
      ...(face !== undefined ? { face } : {}),
      ...done.result,
    },
  };
}

