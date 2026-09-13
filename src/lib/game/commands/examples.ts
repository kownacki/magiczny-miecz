/** Plays a Karta's own example against a table built from it: the one harness behind `examples.test.ts` and `npm run card -- try`. */

import type { CardId } from "@/data/ids";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import { asFieldId, type FieldId } from "@/lib/engine/board";
import { classOf } from "@/lib/engine/cards";
import { type Effect, type Example, scriptFor } from "@/lib/engine/cardScript";
import { buildDeck } from "@/lib/engine/deck";
import { scriptedRandom } from "@/lib/engine/ports";
import { nodeAt } from "@/lib/engine/resolve";
import { topIf } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { wordOf } from "@/lib/engine/words";
import { apply, type Snapshot } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { continueTopScript } from "./effects";
import { resolveDrawnCard } from "./resolving";

/** The Obszar every example starts on unless it says otherwise: a plain field in the lower Krąg. */
export const HOME: FieldId = asFieldId("wrzosowiska")!;
const SEAT = "seat-a";

const asIs = <T,>(items: readonly T[]): T[] => [...items];

/**
 * A pile of Zaklęcia to draw from, since the fixture's is empty by design.
 *
 * The first five in the box, by ref, the way `strangers.test.ts` builds one:
 * enough for any Karta that hands some out, and in a fixed order so an example
 * that names what was drawn can. A hand the example starts with is dealt from
 * the next five, so nothing in it is also on the pile.
 */
function somePile() {
  const refs = (spells as Spell[]).slice(0, 5).map((spell) => `zaklecia#${spell.source.index}`);
  return { events: buildDeck([], asIs), spells: buildDeck(refs, asIs) };
}

/** The table an example describes, with the Karta already turned over on the Obszar. */
export function tableFor(cardId: CardId, example: Example): Snapshot {
  const given = example.given ?? {};
  const cardClass = classOf(cardId);
  if (!cardClass) throw new Error(`${cardId} is not a Karta Zdarzeń.`);
  const seat = aSeat({
    id: SEAT,
    seat_index: 0,
    field_id: HOME,
    ...(given.gold !== undefined ? { gold: given.gold } : {}),
    ...(given.life !== undefined ? { life: given.life } : {}),
    ...(given.sword !== undefined ? { sword_own: given.sword, sword_floor: given.sword } : {}),
    ...(given.magic !== undefined ? { magic_own: given.magic, magic_floor: given.magic } : {}),
    ...(given.nature !== undefined ? { nature: given.nature } : {}),
  });
  const holdings = [
    ...(given.items ?? []).map((id, at) =>
      aHolding({ id: `item-${at}`, seat_id: SEAT, card_id: id, kind: "item" }),
    ),
    ...(given.friends ?? []).map((id, at) =>
      aHolding({ id: `friend-${at}`, seat_id: SEAT, card_id: id, kind: "friend" }),
    ),
    ...(spells as Spell[]).slice(5, 5 + (given.spells ?? 0)).map((spell, at) =>
      aHolding({ id: `spell-${at}`, seat_id: SEAT, card_id: spell.id, kind: "spell", face: "hidden" }),
    ),
  ];
  return aTable({
    game: {
      active_seat: 0,
      deck: somePile() as never,
      turn_state: {
        phase: "field",
        fieldId: HOME,
        from: null,
        draw: 0,
        drawn: [{ cardId, cardClass, ...(example.lying ? { lying: true } : {}) }],
        resolved: [],
      } as TurnPhase,
    },
    seats: [seat],
    holdings,
  });
}

export interface Played {
  before: Snapshot;
  after: Snapshot;
  /** Everything the play reported, in order. */
  said: string[];
  /** The op still waiting on the player at the end, or null. */
  waitingOn: Effect["op"] | null;
  /** Answers the example gave that the Karta never asked for. */
  unused: number[];
}

/**
 * Plays one example through to the end, the way a player would.
 *
 * The Karta is resolved with no decisions in hand; every time it suspends, the
 * harness does what the surface would: presses „Dalej" over a held die, or
 * gives the next answer — a number for a choice, the named Obszar for „gdzie".
 * It stops when the Karta is done, or when it asks something the example did
 * not answer, which `waitingOn` then reports.
 */
export async function playExample(cardId: CardId, example: Example): Promise<Played> {
  if (!scriptFor(cardId)) throw new Error(`${cardId} has no script to play.`);
  const before = tableFor(cardId, example);
  const port = ports({ random: scriptedRandom([...(example.dice ?? [])]) });
  const answers = [...(example.answers ?? [])];
  const said: string[] = [];
  const stopped = (after: Snapshot, waitingOn: Effect["op"] | null): Played => ({
    before,
    after,
    said,
    waitingOn,
    unused: answers,
  });

  const first = await resolveDrawnCard(before, { cardId, shuffle: asIs }, port);
  said.push(...first.result.did);
  let table = apply(before, first.writes);

  for (let guard = 0; guard < 32; guard += 1) {
    const frame = topIf(table.game.turn_state, "script");
    if (!frame) return stopped(table, null);

    let decided: { choices?: number[]; destination?: FieldId } | undefined;
    if (!frame.held) {
      const asking = nodeAt(frame.effect, frame.cursor);
      const ask = asking ? wordOf(asking).asks(asking) : null;
      if (!asking || !ask || ask.kind === "nieobslugiwane") return stopped(table, asking?.op ?? null);
      if (ask.kind === "gdzie") {
        if (!example.destination) return stopped(table, asking.op);
        decided = { destination: example.destination };
      } else {
        const next = answers.shift();
        if (next === undefined) return stopped(table, asking.op);
        decided = { choices: [next] };
      }
    }
    const more = await continueTopScript(table, { decided, shuffle: asIs }, port);
    said.push(...more.result.did);
    table = apply(table, more.writes);
  }
  throw new Error(`${cardId}: the example did not finish in 32 steps — a Karta that never ends?`);
}

/** What the example expected against what the play gave, one line per mismatch; empty when it held. */
export function mismatches(played: Played, example: Example): string[] {
  const { after } = played;
  const seat = after.seats.find((one) => one.id === SEAT);
  if (!seat) return ["the seat is gone from the table"];
  const held = (kind: "item" | "friend" | "spell") =>
    after.holdings.filter((row) => row.seat_id === SEAT && row.kind === kind).length;
  const want = example.expect;
  const out: string[] = [];
  const check = (name: string, expected: unknown, actual: unknown) => {
    if (expected !== undefined && expected !== actual) {
      out.push(`${name}: expected ${String(expected)}, got ${String(actual)}`);
    }
  };
  check("gold", want.gold, seat.gold);
  check("life", want.life, seat.life);
  check("sword", want.sword, seat.sword_own);
  check("magic", want.magic, seat.magic_own);
  check("items", want.items, held("item"));
  check("friends", want.friends, held("friend"));
  check("spells", want.spells, held("spell"));
  check("standingOn", want.standingOn, seat.field_id);
  if (want.lyingOn !== undefined && !after.fieldCards.some((row) => row.field_id === want.lyingOn)) {
    const where = after.fieldCards.map((row) => row.field_id).join(", ") || "no Obszar";
    out.push(`lyingOn: expected the Karta on ${want.lyingOn}, it is on ${where}`);
  }
  if (want.says !== undefined && !played.said.some((line) => line.includes(want.says!))) {
    out.push(`says: expected „${want.says}" in: ${played.said.join(" | ") || "(nothing said)"}`);
  }
  if (want.waitingOn !== undefined) check("waitingOn", want.waitingOn, played.waitingOn);
  else if (played.waitingOn) {
    out.push(`waitingOn: the Karta still waits on ${played.waitingOn} and the example did not say so`);
  }
  if (played.unused.length > 0) out.push(`answers: ${played.unused.join(", ")} never asked for`);
  return out;
}
