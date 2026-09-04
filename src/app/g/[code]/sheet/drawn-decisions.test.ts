import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import type { TurnCard } from "@/lib/engine/state";
import { drawnDecisionsFor, type DrawnDecisionsInput } from "./drawn-decisions";

const card = (cardId: string, over: Partial<TurnCard> = {}): TurnCard =>
  ({ cardId, ...over }) as TurnCard;

const input = (over: Partial<DrawnDecisionsInput> = {}): DrawnDecisionsInput => ({
  who: "Ania",
  card: card("cyklop"),
  cards: [card("cyklop")],
  resolved: [],
  fought: [],
  mySword: 4,
  nature: "dobry" as never,
  reader: null,
  ...over,
});

describe("a Wróg", () => {
  it("is fought at his printed Miecz, and cannot be walked past", () => {
    const d = drawnDecisionsFor(input())!;
    expect(d.foe).toMatchObject({ kind: "ordinary", total: 6 });
    expect(d.skippable).toBe(false);
    expect(d.nothingLeftToAsk).toBe(false);
  });

  it("attacks as one with the others still standing (17.5), and not with one already fought", () => {
    const cards = [card("cyklop"), card("fomoraig")];
    const together = drawnDecisionsFor(input({ cards }))!;
    expect(together.standing.map((c) => c.id)).toEqual(["cyklop", "fomoraig"]);
    expect(together.asOne?.total).toBe(9);
    const after = drawnDecisionsFor(input({ cards, fought: ["fomoraig"] }))!;
    expect(after.standing.map((c) => c.id)).toEqual(["cyklop"]);
    expect(after.asOne).toBeNull();
  });
});

describe("a Przedmiot", () => {
  it("is picked up rather than fought", () => {
    const d = drawnDecisionsFor(input({ card: card("1-sztuka-zlota"), cards: [card("1-sztuka-zlota")] }))!;
    expect(d.foe).toBeNull();
    expect(d.keep).toBe("item");
  });
});

describe("a Miejsce that asks first", () => {
  const grota = input({ card: card("grota"), cards: [card("grota")] });

  it("may be walked past, and otherwise throws a die whose six faces are listed", () => {
    const d = drawnDecisionsFor(grota)!;
    expect(d.skippable).toBe(true);
    expect(d.rolls).toBe(true);
    expect(d.faces.flatMap((group) => group.on).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.saidByFace(4)).toBeTruthy();
  });

  it("holds only its own die, and only its own loss", () => {
    const mine = drawnDecisionsFor(input({ ...grota, rolled: { cardId: "grota", face: 4, did: [], held: true } }))!;
    const other = drawnDecisionsFor(input({ ...grota, rolled: { cardId: "wilk", face: 4, did: [], held: true } }))!;
    expect(mine.said6?.face).toBe(4);
    expect(other.said6).toBeNull();
    const loss = { cardId: "wilk", kind: "item" as const, cards: [] };
    expect(drawnDecisionsFor(input({ ...grota, losing: loss }))!.owing).toBeNull();
    expect(drawnDecisionsFor(input({ ...grota, losing: { ...loss, cardId: "grota" } }))!.owing).toEqual({
      ...loss,
      cardId: "grota",
    });
  });
});

describe("who is deciding", () => {
  it("is the Postać the Karty were dealt to when the reader says so, else the player", () => {
    expect(drawnDecisionsFor(input())!.actor).toBe("Ania");
    expect(
      drawnDecisionsFor(input({ reader: { nature: null, name: "Bartek (MAG)" } }))!.actor,
    ).toBe("Bartek (MAG)");
  });

  it("says what leaving would forfeit, counting only the Karty not yet dealt with", () => {
    const d = drawnDecisionsFor(
      input({ cards: [card("cyklop"), card("wilk"), card("grota")], resolved: ["grota"] }),
    )!;
    const said = d.leavingHere(asFieldId("karczma")!);
    expect(said).toContain("Obszar: Karczma");
    expect(said).toContain("1 Kartę");
  });

  it("is nothing for a Karta the box does not have", () => {
    expect(drawnDecisionsFor(input({ card: card("nie-ma-takiej") }))).toBeNull();
  });
});
