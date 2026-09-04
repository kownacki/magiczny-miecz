import { describe, expect, it } from "vitest";
import { HOLDINGS } from "./holdings";
import { HOLDINGS_ACTIONS } from "../requests";
import type { ActionContext } from "./shape";

const ctx = (over: Partial<ActionContext> = {}): ActionContext =>
  ({ game: { id: "g1" }, user: { id: "u1" }, seat: { id: "mine" }, tableScreen: false, ...over }) as ActionContext;

describe("the holdings vocabulary", () => {
  it("has an entry for every action the client may name, and no other", () => {
    expect(Object.keys(HOLDINGS).sort()).toEqual([...HOLDINGS_ACTIONS].sort());
  });
});

describe("whose pile", () => {
  it("is the seat named, or the presser's own", () => {
    expect(HOLDINGS.take.from({ cardId: "miecz" }, ctx())).toEqual({ seatId: "mine", cardId: "miecz" });
    expect(HOLDINGS.take.from({ seatId: "theirs", cardId: "miecz" }, ctx())).toEqual({ seatId: "theirs", cardId: "miecz" });
    expect(HOLDINGS.spell.from({}, ctx())).toBe("mine");
  });
});

describe("what is read off the body", () => {
  it("refuses a Natura the box does not have, before anything runs", () => {
    expect(() => HOLDINGS.nature.from({ nature: "neutralna" }, ctx())).toThrow("Nieznana Natura.");
    expect(HOLDINGS.nature.from({ nature: "evil" }, ctx())).toEqual({ seatId: "mine", nature: "evil" });
  });

  it("narrows a Zaklęcie's Obszar at the door, like every other field id", () => {
    const cast = HOLDINGS.cast.from({ holdingId: "h1", fieldId: "karczma", destination: "osada" }, ctx());
    expect(cast).toEqual({
      seatId: "mine",
      holdingId: "h1",
      target: { fieldId: "karczma" },
      decided: { destination: "osada" },
    });
    expect(() => HOLDINGS.cast.from({ holdingId: "h1", fieldId: "nigdzie" }, ctx())).toThrow();
  });

  it("keeps an empty list of trofea apart from no list at all (1.4)", () => {
    expect(HOLDINGS.trade.from({ cardIds: [] }, ctx()).deal).toEqual({ cardIds: [] });
    expect(HOLDINGS.trade.from({ swords: 2 }, ctx()).deal).toEqual({ swords: 2 });
    expect(HOLDINGS.trade.from({}, ctx()).deal).toEqual({});
  });

  it("takes a slot off with null, and only turns the stock endless, never back", () => {
    expect(HOLDINGS.equip.from({ holdingId: "h1", slot: null }, ctx())).toEqual({ holdingId: "h1", slot: null });
    expect(HOLDINGS["endless-stock"].from({}, ctx())).toBe(true);
    expect(HOLDINGS["endless-stock"].from({ on: false }, ctx())).toBe(false);
  });
});
