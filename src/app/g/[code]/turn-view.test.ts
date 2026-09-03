import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { turnViewOf, type TurnViewInput } from "./turn-view";
import type { Seat } from "./table";
import type { Game } from "./use-table";

const FIELD = asFieldId("mroczna-polana")!;

const seat = (over: Partial<Seat> = {}) =>
  ({
    id: "seat-a",
    seat_index: 0,
    player_name: "Ania",
    character_id: "goblin",
    driver_id: "u-a",
    eliminated: false,
    field_id: FIELD,
    nature: "dobry",
    aggression: null,
    sword_own: 3,
    magic_own: 2,
    life: 4,
    gold: 1,
    sword_floor: 3,
    magic_floor: 2,
    hidden_count: 0,
    holdings: [],
    ...over,
  }) as unknown as Seat;

const game = (top: TurnPhase, ...beneath: TurnPhase[]): Game =>
  ({
    id: "g",
    eq_mode: "classic",
    endless_stock: false,
    join_code: "ABCD",
    mode: "simulation",
    status: "playing",
    active_seat: 0,
    characters_out: [],
    round: 1,
    revision: 1,
    die_source: "app",
    turn_state: { stack: [...beneath, top] },
  }) as unknown as Game;

const field = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: FIELD,
  from: null,
  draw: 0,
  drawn: [],
  ...over,
});

const card = (cardId: string) => ({ cardId }) as never;

const input = (over: Partial<TurnViewInput> = {}): TurnViewInput => ({
  game: game(field()),
  seats: [seat()],
  fieldCards: [],
  users: [],
  me: null,
  mySeatIndex: 0,
  moved: {},
  rolled: null,
  revealing: false,
  folded: false,
  ...over,
});

describe("whether the sheet applies", () => {
  it("holds back while the Obszar still owes Karty (13.4)", () => {
    const view = turnViewOf(input({ game: game(field({ draw: 1, drawn: [card("wilk")] })) }));
    expect(view.sheetApplies).toBe(false);
  });

  it("applies once the deal is complete and something was dealt", () => {
    const view = turnViewOf(input({ game: game(field({ draw: 0, drawn: [card("wilk")] })) }));
    expect(view.sheetApplies).toBe(true);
    expect(view.turnWindowOpen).toBe(true);
  });

  it("waits while the deal is still being looked at", () => {
    const view = turnViewOf(
      input({ game: game(field({ draw: 0, drawn: [card("wilk")] })), revealing: true }),
    );
    expect(view.sheetApplies).toBe(false);
  });

  it("is on screen only while it is not folded away", () => {
    const view = turnViewOf(
      input({ game: game(field({ draw: 0, drawn: [card("wilk")] })), folded: true }),
    );
    expect(view.sheetApplies).toBe(true);
    expect(view.turnWindowOpen).toBe(false);
  });

  it("keeps the Karta up while a thrown die waits for „Dalej\"", () => {
    const held = { phase: "script", held: true, cardId: "wilk", seatId: "seat-a" } as never;
    const view = turnViewOf(
      input({
        game: game(held, field({ drawn: [card("wilk")], rolled: { cardId: "wilk", face: 4 } as never })),
      }),
    );
    expect(view.shownRoll).toMatchObject({ cardId: "wilk", face: 4, held: true, did: [] });
    expect(view.sheetApplies).toBe(true);
    expect(view.losing).toBeNull();
  });
});

describe("what the die on the frame carries", () => {
  it("adds this device's own lines only for the same throw of the same Karta", () => {
    const beneath = field({ drawn: [card("wilk")], rolled: { cardId: "wilk", face: 4 } as never });
    const same = turnViewOf(
      input({ game: game(beneath), rolled: { cardId: "wilk", face: 4, did: ["Zaklęcie"] } }),
    );
    const other = turnViewOf(
      input({ game: game(beneath), rolled: { cardId: "wilk", face: 2, did: ["Zaklęcie"] } }),
    );
    expect(same.shownRoll?.did).toEqual(["Zaklęcie"]);
    expect(other.shownRoll?.did).toEqual([]);
  });
});

describe("what the Obszar still owes", () => {
  it("counts fought beside resolved as settled (17.4)", () => {
    const view = turnViewOf(
      input({
        game: game(field({ drawn: [card("wilk"), card("grota")], resolved: ["grota"], fought: ["wilk"] })),
      }),
    );
    expect(view.owedHere?.settled).toEqual(["grota", "wilk"]);
  });

  it("is nothing off the field frame", () => {
    const view = turnViewOf(input({ game: game({ phase: "roll" }) }));
    expect(view.owedHere).toBeNull();
    expect(view.onField).toBeNull();
  });
});

describe("this seat", () => {
  it("lays this device's unconfirmed slot moves over its holdings", () => {
    const mine = seat({
      holdings: [{ id: "h-1", cardId: "miecz", kind: "item", face: "open", slot: null }] as never,
    });
    const view = turnViewOf(input({ seats: [mine], moved: { "h-1": "prawa-dlon" as never } }));
    expect(view.mine?.holdings[0].slot).toBe("prawa-dlon");
  });

  it("reads a Karta for the viewer and for the Postać it was dealt to", () => {
    const seats = [seat(), seat({ id: "seat-b", seat_index: 1, player_name: "Bartek", nature: "zly" })];
    const view = turnViewOf(input({ seats, mySeatIndex: 1, game: game(field()) }));
    expect(view.viewer?.name).toBe("Bartek (GOBLIN)");
    expect(view.viewer?.mine).toBe(true);
    expect(view.dealt?.name).toBe("Ania (GOBLIN)");
    expect(view.dealt?.mine).toBe(false);
  });
});
