import { describe, expect, it } from "vitest";
import { scriptedRandom } from "@/lib/engine/ports";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { friendDiesInstead, sendRaider } from "./fight";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";
import { pointsOf, seatView } from "./seat";

/**
 * Przyjaciele, which the rulebook barely describes.
 *
 * Chapter 6 is four rules about custody — how you gain a friend, that it lies
 * face up, that you may hold any number, and where a dead one goes. It never
 * says a friend fights, adds points, or takes a hit for you. Every one of those
 * is printed on the individual card, so this is where the cards are checked
 * rather than the chapter.
 */

const withCards = (...cards: { id: string; kind?: "item" | "friend" }[]) =>
  aTable({
    seats: [aSeat({ id: "seat-a", sword_own: 2, magic_own: 1 })],
    holdings: cards.map((card, at) =>
      aHolding({
        id: `held-${at}`,
        seat_id: "seat-a",
        card_id: card.id,
        kind: card.kind ?? "friend",
      }),
    ),
  });

describe("a friend who fights in your place (Rycerz)", () => {
  /**
   * The bug this pins: the Rycerz prints 3 and 3 because *he* has them, and
   * reading a printed corner as a loan made him a permanent +3/+3 to whoever
   * held him — a statue buff instead of a champion.
   */
  it("lends nothing at all while merely being held", () => {
    expect(pointsOf(withCards({ id: "rycerz" }), "seat-a", "parametr")).toEqual({
      miecz: 2,
      magia: 1,
    });
  });

  /** "będzie walczył zamiast ciebie" — his points, not yours plus his. */
  it("replaces the whole combat figure with his own", () => {
    expect(pointsOf(withCards({ id: "rycerz" }), "seat-a", "walka")).toEqual({
      miecz: 3,
      magia: 3,
    });
  });

  /**
   * "Nie może jednak używać twoich Zaklęć ani Przedmiotów." An Excalibur in the
   * pack is the character's, and the character is not the one swinging.
   */
  it("fights with none of your gear", () => {
    const armed = withCards({ id: "rycerz" }, { id: "excalibur", kind: "item" });
    expect(pointsOf(armed, "seat-a", "walka")).toEqual({ miecz: 3, magia: 3 });
    // The Excalibur still counts for the character's own parameter (1.5).
    expect(pointsOf(armed, "seat-a", "parametr").miecz).toBe(3);
  });
});

/**
 * Two cards carry `walczy-za-ciebie` and they mean different things by it. The
 * Rycerz stands in front of you; the Poszukiwacz Przygód only ever fights at
 * the far end of a raid you send him on. Reading them alike dropped a
 * Barbarzyńca from his own Miecz 5 to the 3 his friend raids with, in fights
 * the friend was not even in.
 */
describe("a friend who raids is not a friend who stands in (Poszukiwacz Przygód)", () => {
  it("leaves your own fights entirely alone", () => {
    const table = withCards({ id: "poszukiwacz-przygod" });
    expect(pointsOf(table, "seat-a", "parametr")).toEqual({ miecz: 2, magia: 1 });
    expect(pointsOf(table, "seat-a", "walka")).toEqual({ miecz: 2, magia: 1 });
  });

  it("is still not a bonus, either standing or fighting", () => {
    const armed = withCards({ id: "poszukiwacz-przygod" }, { id: "excalibur", kind: "item" });
    // The Excalibur's point, and nothing of the Poszukiwacz's three.
    expect(pointsOf(armed, "seat-a", "walka").miecz).toBe(3);
  });
});

describe("the Bojowy Rumak's Magia (magia-do-miecza)", () => {
  it("adds your Magia to your Miecz in a fight, and only in a fight", () => {
    const mounted = withCards({ id: "bojowy-rumak", kind: "item" });
    expect(pointsOf(mounted, "seat-a", "parametr")).toEqual({ miecz: 2, magia: 1 });
    expect(pointsOf(mounted, "seat-a", "walka")).toEqual({ miecz: 3, magia: 1 });
  });

  /**
   * Both at once. The Rycerz is swinging with his own gear, so a Rumak the
   * character is sitting on cannot improve the blow — the card forbids it in as
   * many words.
   */
  it("does nothing while the Rycerz is the one fighting", () => {
    const both = withCards({ id: "rycerz" }, { id: "bojowy-rumak", kind: "item" });
    expect(pointsOf(both, "seat-a", "walka")).toEqual({ miecz: 3, magia: 3 });
  });
});

describe("a friend who dies in your place (6.4)", () => {
  /** "Jeżeli zostaniesz pokonany zginie tylko twój Rumak" — no roll, no escape. */
  it("spends the Rumak without rolling for it", async () => {
    const table = withCards({ id: "bojowy-rumak", kind: "item" });
    const out = await friendDiesInstead(table, { seatId: "seat-a" }, ports());

    expect(out.result).toBe(true);
    expect(out.writes.holdings?.delete).toEqual(["held-0"]);
    expect(out.writes.journal?.[0]).toMatchObject({
      kind: "died-for-you",
      payload: { cardId: "bojowy-rumak", die: null },
    });
  });

  /** "rzuć kostką. Wynik równy 1 oznacza, że zginął Giermek." */
  it("keeps the Giermek on anything but a one", async () => {
    const table = withCards({ id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([4]) }),
    );

    expect(out.result).toBe(false);
    expect(out.writes.holdings).toBeUndefined();
  });

  it("spends the Giermek on a one", async () => {
    const table = withCards({ id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([1]) }),
    );

    expect(out.result).toBe(true);
    expect(out.writes.journal?.[0]).toMatchObject({
      kind: "died-for-you",
      payload: { cardId: "giermek", die: 1 },
    });
  });

  /**
   * Holding both, the Giermek is asked first — the only order under which he
   * can ever be the one to go, since the Rumak is certain and would always
   * answer before him.
   */
  it("asks the one who rolls before the one who is certain", async () => {
    const table = withCards({ id: "bojowy-rumak", kind: "item" }, { id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([1]) }),
    );

    expect(out.writes.journal?.[0]).toMatchObject({ payload: { cardId: "giermek" } });
  });

  /** And the Rumak catches it when the Giermek's roll misses. Only one dies. */
  it("falls through to the Rumak when the roll misses, and stops there", async () => {
    const table = withCards({ id: "bojowy-rumak", kind: "item" }, { id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([5]) }),
    );

    expect(out.result).toBe(true);
    expect(out.writes.holdings?.delete).toEqual(["held-0"]);
    expect(out.writes.journal).toHaveLength(1);
  });

  /**
   * The Poszukiwacz Przygód is spent on the raid you send him out on and stands
   * in for nothing at home. Without the flag he would offer his life every time
   * anybody lost anything.
   */
  it("does not offer the Poszukiwacz Przygód in your own fights", async () => {
    const table = withCards({ id: "poszukiwacz-przygod" });
    const out = await friendDiesInstead(table, { seatId: "seat-a" }, ports());
    expect(out.result).toBe(false);
  });

  it("offers nobody when there is nobody to offer", async () => {
    const out = await friendDiesInstead(
      withCards({ id: "pasterz" }),
      { seatId: "seat-a" },
      ports(),
    );
    expect(out.result).toBe(false);
    expect(out.writes).toEqual({});
  });
});

describe("the friends that were working all along", () => {
  it("still lets the Pasterz lend his point of each (1.5, 2.5)", () => {
    expect(pointsOf(withCards({ id: "pasterz" }), "seat-a", "parametr")).toEqual({
      miecz: 3,
      magia: 2,
    });
  });

  /** "dodawał ci 2 punkty Miecza podczas każdej walki" — in a fight and nowhere else. */
  it("still counts the Krzyżowiec only in a fight", () => {
    const table = withCards({ id: "krzyzowiec" });
    expect(pointsOf(table, "seat-a", "parametr").miecz).toBe(2);
    expect(pointsOf(table, "seat-a", "walka").miecz).toBe(4);
  });

  it("keeps a friend visible in the seat's own reckoning of what it holds", () => {
    const view = seatView(withCards({ id: "rycerz" }), "seat-a");
    expect(view.holdings.map((h) => h.cardId)).toContain("rycerz");
  });
});


/**
 * The raid (Poszukiwacz Przygód).
 *
 * "Po zakończeniu ruchu możesz zlecić temu Przyjacielowi, by zaatakował Postać
 * lub Wroga, oddalonego najwyżej o 3 Obszary. Poszukiwacz Przygód posiada 3
 * punkty Miecza. W przypadku porażki ty nie tracisz punktu Życia, ale twój
 * Przyjaciel ginie."
 *
 * Not an encounter: 13.1 keeps the character on the field their move ended on,
 * and the whole point of this card is that the friend goes instead.
 */
const onField = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: "mroczna-polana",
  from: null,
  draw: 1,
  drawn: [],
  ...over,
});

/** Two characters, the second placed however far off the test wants. */
const twoSeats = (theirField: FieldId, cards: string[] = ["poszukiwacz-przygod"]) =>
  aTable({
    game: { turn_state: onField(), active_seat: 0 },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: "mroczna-polana", sword_own: 5 }),
      aSeat({
        id: "seat-b",
        seat_index: 1,
        character_id: "elf",
        field_id: theirField,
        sword_own: 2,
      }),
    ],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `held-${at}`, seat_id: "seat-a", card_id: cardId, kind: "friend" }),
    ),
  });

const fightOf = (writes: { game?: { turn_state?: unknown } }) =>
  (writes.game?.turn_state as Extract<TurnPhase, { phase: "fight" }>).fight;

describe("sending a Przyjaciel out (Poszukiwacz Przygód)", () => {
  it("fights with the friend's three points, not the character's five", () => {
    const out = sendRaider(twoSeats("przelecz-wichrow"), { targetSeatId: "seat-b" });
    expect(fightOf(out.writes).playerTotal).toBe(3);
  });

  it("marks the fight as the friend's, so losing it can charge him", () => {
    const out = sendRaider(twoSeats("przelecz-wichrow"), { targetSeatId: "seat-b" });
    expect(fightOf(out.writes).raid).toEqual({ cardId: "poszukiwacz-przygod" });
  });

  it("reaches exactly three Obszary", () => {
    // przeprawa-1 is 3 round the ring from mroczna-polana.
    expect(() => sendRaider(twoSeats("przeprawa-1"), { targetSeatId: "seat-b" })).not.toThrow();
  });

  it("refuses a fourth", () => {
    expect(() => sendRaider(twoSeats("dolina-cienia"), { targetSeatId: "seat-b" })).toThrow(
      /Zbyt daleko/,
    );
  });

  /**
   * A Przeprawa is a turn's work that can fail, not a step. Counting one would
   * put most of the board within three Obszary of everywhere.
   */
  it("will not count across rings at all", () => {
    expect(() => sendRaider(twoSeats("kurhan"), { targetSeatId: "seat-b" })).toThrow(
      /Zbyt daleko/,
    );
  });

  it("needs a friend who actually raids", () => {
    expect(() =>
      sendRaider(twoSeats("przelecz-wichrow", ["rycerz"]), { targetSeatId: "seat-b" }),
    ).toThrow(/Nie masz Przyjaciela/);
  });

  /** "Po zakończeniu ruchu" — not in the middle of one. */
  it("waits until the move is over", () => {
    const midMove = aTable({
      game: { turn_state: { phase: "roll" } },
      seats: [aSeat({ id: "seat-a", field_id: "mroczna-polana" })],
      holdings: [
        aHolding({ id: "h", seat_id: "seat-a", card_id: "poszukiwacz-przygod", kind: "friend" }),
      ],
    });
    expect(() => sendRaider(midMove, { targetSeatId: "seat-a" })).toThrow(/po ruchu/);
  });
});
