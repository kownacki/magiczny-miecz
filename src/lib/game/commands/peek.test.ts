import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { askOnTop } from "@/lib/engine/ask";
import { only, top, type TurnState } from "@/lib/engine/stack";
import type { Effect } from "@/lib/engine/cardScript";
import type { TurnPhase } from "@/lib/engine/turn";
import { SPELL_COPIES } from "../decks";
import { aHolding, aSeat, aTable, aUser, ports } from "../fixture";
import { asSeenBy } from "../envelope";
import { apply, type Snapshot } from "../change";
import { drawSpell } from "./draw";
import { answerAsk } from "./ask";
import { applyEffect, continueTopScript } from "./effects";
import { passTurn } from "./turn";

/**
 * The CHOCHLIK: the first question in the box that belongs to no card script.
 *
 * "gdy będziesz chciał wziąć Zaklęcie, Przyjaciel pozwoli ci obejrzeć pierwsze
 * 2 Karty ze stosu i wybrać tę, która najbardziej ci odpowiada."
 *
 * A `wybor` inside a Karta's own effect is asked by the `script` frame
 * standing on it. This one is printed on a Charakterystyka, has no script and
 * no cursor, and is what the `ask` frame was sketched for in docs/STACK.md.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];

/** Two named Zaklęcia on top of the pile, so the choice is between known cards. */
const refOf = (spellId: string) => SPELL_COPIES.get(spellId)![0];
const OGIEN = refOf("krag-plomieni");
const ZWIERCIADLO = refOf("zwierciadlo");

const withChochlik = (over: { turn_state?: TurnPhase; holdings?: unknown[] } = {}): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: over.turn_state ?? { phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [] },
      deck: {
        events: { draw: [], discard: [] },
        spells: { draw: [OGIEN, ZWIERCIADLO, refOf("wojna-zywiolow")], discard: [] },
      },
    },
    // Magia 4 so 2.6 allows a hand at all, and the Chochlik already accepted:
    // his price is a point of Życie and `takeCard` charges it, so a holding
    // here is a Przyjaciel who has been paid for.
    seats: [aSeat({ id: "seat-a", sword_own: 5, magic_own: 4, life: 4, field_id: asFieldId("wrzosowiska") })],
    users: [aUser({ id: "u-a", seat_index: 0, name: "Michał" })],
    holdings: (over.holdings ?? [aHolding({ id: "h-1", card_id: "chochlik", kind: "friend" })]) as never,
  });

const spellsOf = (snapshot: Snapshot) => (snapshot.game.deck as never as {
  spells: { draw: string[]; discard: string[] };
}).spells;

describe("taking a Zaklęcie with the Chochlik", () => {
  it("asks instead of dealing, and the cards are off the pile while it asks", () => {
    const table = withChochlik();
    const { writes, result } = drawSpell(table, { seatId: "seat-a", shuffle: asIs });

    // Nothing dealt: the seat has been asked, not given.
    expect(result).toBeNull();
    expect(writes.holdings).toBeUndefined();

    const state = writes.game!.turn_state!;
    expect(state.stack.map((frame) => frame.phase)).toEqual(["field", "ask"]);
    const asked = askOnTop(state)!;
    expect(asked).toMatchObject({ seatId: "seat-a", cardId: "chochlik", reason: "CHOCHLIK" });
    expect(asked.question.refs).toEqual([OGIEN, ZWIERCIADLO]);

    // Committed to: both are out of the pile, so nothing drawn in between can
    // change what was offered.
    const after = apply(table, writes);
    expect(spellsOf(after).draw).toEqual([refOf("wojna-zywiolow")]);
  });

  it("hands over the one picked and puts the other back on top", () => {
    const table = apply(withChochlik(), drawSpell(withChochlik(), { seatId: "seat-a", shuffle: asIs }).writes);

    const { writes, result } = answerAsk(table, { seatId: "seat-a", choice: 1 });
    expect(result).toBe("zwierciadlo");

    const after = apply(table, writes);
    // In hand, face down (9.3).
    expect(after.holdings).toHaveLength(2);
    expect(after.holdings.at(-1)).toMatchObject({
      card_id: "zwierciadlo",
      kind: "spell",
      face: "hidden",
    });
    // The unchosen one is still the next Zaklęcie anybody draws — looked at,
    // not spent, so it does not reach the used pile.
    expect(spellsOf(after).draw[0]).toBe(OGIEN);
    expect(spellsOf(after).discard).toEqual([]);
    expect(top(after.game.turn_state).phase).toBe("field");
  });

  it("names the Przyjaciel on the line the Zaklęcie writes", () => {
    const table = apply(withChochlik(), drawSpell(withChochlik(), { seatId: "seat-a", shuffle: asIs }).writes);
    const { writes } = answerAsk(table, { seatId: "seat-a", choice: 0 });
    expect(writes.journal?.at(-1)).toMatchObject({
      kind: "spell",
      payload: { spellId: "krag-plomieni", via: "chochlik" },
    });
  });

  /** The server re-walks the answer against what it offered. */
  it("refuses an option that was never offered", () => {
    const table = apply(withChochlik(), drawSpell(withChochlik(), { seatId: "seat-a", shuffle: asIs }).writes);
    expect(() => answerAsk(table, { seatId: "seat-a", choice: 2 })).toThrow("Nie ma takiej Karty");
  });

  /** Law 5: the frame says whose answer it is, and a hidden hand makes that bite. */
  it("refuses a seat the question is not for", () => {
    const table = apply(withChochlik(), drawSpell(withChochlik(), { seatId: "seat-a", shuffle: asIs }).writes);
    expect(() => answerAsk(table, { seatId: "seat-b", choice: 0 })).toThrow("nie twoja");
  });

  it("deals straight when nobody at the seat has the Karta", () => {
    const plain = withChochlik({ holdings: [] });
    const { result } = drawSpell(plain, { seatId: "seat-a", shuffle: asIs });
    expect(result).toBe("krag-plomieni");
  });

  /** One card is not a choice. */
  it("deals straight when the pile cannot show two", () => {
    const thin = aTable({
      game: {
        active_seat: 0,
        turn_state: { phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [] },
        deck: { events: { draw: [], discard: [] }, spells: { draw: [OGIEN], discard: [] } },
      },
      seats: [aSeat({ id: "seat-a", magic_own: 4, life: 4, field_id: asFieldId("wrzosowiska") })],
      holdings: [aHolding({ id: "h-1", card_id: "chochlik", kind: "friend" })],
    });
    expect(drawSpell(thin, { seatId: "seat-a", shuffle: asIs }).result).toBe("krag-plomieni");
  });
});

describe("what the other devices are told", () => {
  it("keeps the two Karty to the one seat (9.3)", () => {
    const table = apply(withChochlik(), drawSpell(withChochlik(), { seatId: "seat-a", shuffle: asIs }).writes);

    const mine = asSeenBy(table.game.turn_state, "seat-a");
    expect(askOnTop(mine)!.question.refs).toEqual([OGIEN, ZWIERCIADLO]);

    // Everybody else is told that two Karty are being looked at, and no more —
    // these are the top of a pile the deck itself never travels.
    for (const other of ["seat-b", null]) {
      const theirs = askOnTop(asSeenBy(table.game.turn_state, other))!;
      expect(theirs.question.refs, String(other)).toEqual([]);
      expect(theirs.question.count, String(other)).toBe(2);
    }
  });

  it("leaves every other frame alone", () => {
    const field: TurnPhase = { phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [] };
    const state: TurnState = only(field);
    expect(asSeenBy(state, "seat-b")).toBe(state);
  });
});

describe("a card that stops mid-sentence to ask", () => {
  /**
   * The reason the ask is a frame rather than a prompt: a `zaklecie` step
   * inside a `po-kolei` has to carry on afterwards, and before the stack there
   * was nowhere to keep "the card is here" while somebody chose.
   */
  const card: Effect = {
    op: "po-kolei",
    steps: [
      { op: "punkty", stat: "sword", delta: 1, target: "ty" },
      { op: "zaklecie", count: 1 },
      { op: "punkty", stat: "gold", delta: 2, target: "ty" },
    ],
  };

  const run = (table: Snapshot) =>
    applyEffect(
      table,
      { seatId: "seat-a", effect: card, reason: "KARTA", cardId: "poludnica", shuffle: asIs },
      ports(),
    );

  it("frames the card and puts the question above it", async () => {
    const table = withChochlik();
    const { writes } = await run(table);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { sword_own: 6 } }]);

    const state = writes.game!.turn_state!;
    // [field, script, ask] — the card mid-sentence, the question on screen.
    expect(state.stack.map((frame) => frame.phase)).toEqual(["field", "script", "ask"]);
    expect(state.stack[1]).toMatchObject({ phase: "script", cursor: [1] });
  });

  it("answering deals the Zaklęcie and the card carries on", async () => {
    const table = withChochlik();
    const first = await run(table);
    const mid = apply(table, first.writes);

    const answered = answerAsk(mid, { seatId: "seat-a", choice: 0 });
    const afterAsk = apply(mid, answered.writes);
    expect(top(afterAsk.game.turn_state).phase).toBe("script");

    // The chain the stores run: the revealed card continues by itself.
    const rest = await continueTopScript(afterAsk, { shuffle: asIs }, ports());
    const done = apply(afterAsk, rest.writes);

    // The Zaklęcie landed once…
    expect(done.holdings.filter((h) => h.kind === "spell")).toHaveLength(1);
    // …the step after it ran…
    expect(done.seats[0].gold).toBe(table.seats[0].gold + 2);
    // …the step before it was not re-applied…
    expect(done.seats[0].sword_own).toBe(6);
    // …and the frame is gone.
    expect(done.game.turn_state.stack.map((f) => f.phase)).toEqual(["field"]);
  });

  it("charges the Nieznajomy's price once, before the question", async () => {
    const table = withChochlik();
    const gold = table.seats[0].gold;
    const { writes } = await applyEffect(
      table,
      {
        seatId: "seat-a",
        effect: { op: "zaklecie", count: 1, cena: 1 },
        reason: "NIEZNAJOMY",
        shuffle: asIs,
      },
      ports(),
    );
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: gold - 1 } }]);

    const mid = apply(table, writes);
    const done = apply(mid, answerAsk(mid, { seatId: "seat-a", choice: 0 }).writes);
    expect(done.seats[0].gold).toBe(gold - 1);
    expect(done.holdings.filter((h) => h.kind === "spell")).toHaveLength(1);
  });
});

/**
 * A question owed stops the turn, the way a suspended Karta does.
 *
 * `passTurn` writes `only(startTurn())` over the whole stack, so a turn handed
 * on with an `ask` still up would delete the very thing the table was waiting
 * for. It refused a `fight` and a `script` and not this, and the browser's
 * "end turn" button agreed with it — both were wrong the same way.
 *
 * The seat being asked need not be the seat playing (docs/STACK.md, law 5),
 * which is exactly the case where nobody at the table would notice.
 */
describe("a turn cannot be handed on mid-question", () => {
  it("refuses to pass while an ask frame is on the stack", () => {
    const table = withChochlik();
    const asked = apply(table, drawSpell(table, { seatId: "seat-a", shuffle: asIs }).writes);
    expect(top(asked.game.turn_state).phase).toBe("ask");

    expect(() => passTurn(asked)).toThrow(/Najpierw odpowiedz/);
  });

  it("passes once the question has been answered", () => {
    const table = withChochlik();
    const asked = apply(table, drawSpell(table, { seatId: "seat-a", shuffle: asIs }).writes);
    const answered = apply(asked, answerAsk(asked, { seatId: "seat-a", choice: 0 }).writes);

    expect(top(answered.game.turn_state).phase).not.toBe("ask");
    expect(() => passTurn(answered)).not.toThrow();
  });
});
