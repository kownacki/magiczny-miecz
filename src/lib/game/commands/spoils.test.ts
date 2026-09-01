import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFight } from "./spoils";
import { leaveCardsBehind } from "./turn";
import { asSeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * 17.9 — "Zwycięzca ma prawo zmusić pokonanego do utraty jednego punktu Życia
 * … lub zabrać mu jeden Przedmiot (również Magiczny) albo Sztukę Złota."
 *
 * Three ways to end a duel; the app could only ever do the first, so a winner
 * who wanted the Magiczny Miecz off a beaten rival had no way to say so and the
 * referee was making the choice the rulebook gives the player.
 */
const duel = (
  over: {
    eqMode?: "slots" | "classic";
    theirGold?: number;
    /** What the loser is carrying, for the one Przedmiot that pays a duel. */
    theirs?: ReturnType<typeof aHolding>[];
    /** Which way the asker's duel went. */
    outcome?: "wygrana" | "przegrana";
  } = {},
) =>
  aTable({
    game: {
      active_seat: 0,
      eq_mode: over.eqMode ?? "classic",
      turn_state: {
        phase: "fight",
        fight: {
        cardId: "seat:1",
        cardName: "Ola",
        kind: "ordinary",
        enemyTotal: 2,
        playerTotal: 9,
        playerRoll: 6,
        enemyRoll: 1,
        result: { outcome: over.outcome ?? "wygrana" },
        fieldId: "wrzosowiska",
        draw: 0,
        drawn: [],
        fought: [],
        opponentSeat: 1,
        },
      } as unknown as TurnPhase,
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"), field_id: "wrzosowiska", gold: 1 }),
      aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"), field_id: "wrzosowiska", life: 4, gold: over.theirGold ?? 2 }),
    ],
    holdings: over.theirs ?? [
      aHolding({ id: "h1", seat_id: "seat-b", card_id: "miecz", kind: "item" }),
    ],
  });

const settle = async (table: ReturnType<typeof duel>, spoils?: Parameters<typeof resolveFight>[1]) =>
  apply(table, (await resolveFight(table, spoils, ports({ random: scriptedRandom([6, 6, 6, 6]) }))).writes);

const seat = (t: ReturnType<typeof apply>, id: string) => t.seats.find((one) => one.id === id);

describe("what the winner of a duel takes (17.9)", () => {
  it("takes the Życie when nothing else is named, as it always did", async () => {
    const after = await settle(duel());
    expect(seat(after, "seat-b")?.life).toBe(3);
  });

  it("takes a Sztuka Złota instead, and no Życie with it", async () => {
    const after = await settle(duel(), { spoils: { take: "zloto" } });
    expect(seat(after, "seat-b")?.gold).toBe(1);
    expect(seat(after, "seat-a")?.gold).toBe(2);
    // "lub" — an alternative to forcing the loss, not an addition to it.
    expect(seat(after, "seat-b")?.life).toBe(4);
  });

  it("refuses the gold the loser has not got", async () => {
    await expect(settle(duel({ theirGold: 0 }), { spoils: { take: "zloto" } })).rejects.toThrow(
      /17\.9/,
    );
  });

  /** The card changes hands rather than being destroyed, so 21.2's stock holds. */
  it("takes a Przedmiot, which moves rather than vanishing", async () => {
    const after = await settle(duel(), { spoils: { take: "przedmiot", holdingId: "h1" } });
    const moved = after.holdings.find((one) => one.id === "h1");
    expect(moved?.seat_id).toBe("seat-a");
    expect(seat(after, "seat-b")?.life).toBe(4);
  });

  /** It arrives the way anything arrives: worn if there is a place for it. */
  it("puts a won Przedmiot on the arm in slotowy", async () => {
    const after = await settle(duel({ eqMode: "slots" }), {
      spoils: { take: "przedmiot", holdingId: "h1" },
    });
    expect(after.holdings.find((one) => one.id === "h1")?.slot).toBe("main-hand");
  });

  it("refuses a Przedmiot the loser is not holding", async () => {
    await expect(
      settle(duel(), { spoils: { take: "przedmiot", holdingId: "nope" } }),
    ).rejects.toThrow(/17\.9/);
  });
});

/**
 * 16.2: "Karty pokonanych Wrogów tego rodzaju można zachować" — a beaten Wróg's
 * Karta is *kept*, which is the opposite of left lying.
 *
 * Nothing took him off the Obszar. `trophiesFrom` put his Karta in the winner's
 * pack and `leaveCardsBehind` wrote the same Karta back onto the square at the
 * end of the turn, so a beaten Wilk was a trophy in a pack *and* a live
 * creature on the board, waiting for whoever stopped there next. Found at a
 * real table on Płaskowyż Mgieł: two Wrogowie beaten together under 17.5, both
 * still standing in the Obszar's window afterwards.
 */
/* ==========================================================================
 * The one Przedmiot 17.9's parenthesis is about.
 * ======================================================================= */

describe("the DIAMENT KRÓLÓW pays for a lost duel (17.9)", () => {
  const carrying = (seatId: string) => [
    aHolding({ id: "d1", seat_id: seatId, card_id: "diament-krolow", kind: "item" }),
  ];

  /**
   * "Jeżeli przegrasz walkę z inną Postacią, będzie ci musiała odebrać Diament,
   * dzięki czemu nie utracisz 1 punktu Życia."
   *
   * „Musiała" is compulsion on the winner, so the Życie is not hers to insist
   * on — and the Diament goes over rather than being destroyed, like any other
   * 17.9 Przedmiot.
   */
  it("goes to the winner instead of the punkt Życia", async () => {
    const after = await settle(duel({ theirs: carrying("seat-b") }));
    expect(seat(after, "seat-b")?.life).toBe(4);
    expect(after.holdings.find((one) => one.id === "d1")?.seat_id).toBe("seat-a");
  });

  /**
   * And without the winner asking, which is the half that makes it a rule
   * rather than an option: 17.9's choice is the winner's, and this is not one
   * of the three she chooses between.
   */
  it("fires whether or not the winner named the Życie", async () => {
    const asked = await settle(duel({ theirs: carrying("seat-b") }), {
      spoils: { take: "zycie" },
    });
    expect(seat(asked, "seat-b")?.life).toBe(4);
    expect(asked.holdings.find((one) => one.id === "d1")?.seat_id).toBe("seat-a");
  });

  /**
   * Only on the Życie spoil, which is the reading the card's own second clause
   * settles: "dzięki czemu nie utracisz 1 punktu Życia" says nothing at all if
   * a punkt Życia was not otherwise going to be lost, and a winner taking the
   * gold was never taking one.
   */
  it("leaves the Diament alone where the winner takes something else", async () => {
    const after = await settle(
      duel({ theirs: carrying("seat-b"), theirGold: 2 }),
      { spoils: { take: "zloto" } },
    );
    expect(after.holdings.find((one) => one.id === "d1")?.seat_id).toBe("seat-b");
    expect(seat(after, "seat-b")?.gold).toBe(1);
  });

  /**
   * Both directions. 17.9's choice is only offered to the asker, but the
   * Diament is not a choice — a drawer who loses their own duel while carrying
   * it pays with it just the same, and this is the first thing in the app the
   * opponent takes on somebody else's turn.
   */
  it("pays the other way too, when the asker is the one who lost", async () => {
    const after = await settle(
      duel({ theirs: carrying("seat-a"), outcome: "przegrana" }),
    );
    expect(seat(after, "seat-a")?.life).toBe(4);
    expect(after.holdings.find((one) => one.id === "d1")?.seat_id).toBe("seat-b");
  });
});

describe("a beaten Wróg leaves the Obszar (16.2)", () => {
  const won = (over: { cardId?: string; fought?: string[]; drawn?: unknown[] } = {}) =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "wrzosowiska",
          from: null,
          draw: 0,
          drawn: over.drawn ?? [
            { cardId: "wilk", cardClass: "foe" },
            { cardId: "helm", cardClass: "item" },
          ],
        },
        stack: undefined,
      } as never,
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "wrzosowiska" })],
    });

  /** Built as a fight pushed over that field, which is what an ordinary one is. */
  const fighting = (fought: string[]) => {
    const table = won();
    const field = (table.game.turn_state as { stack: unknown[] }).stack[0];
    return {
      ...table,
      game: {
        ...table.game,
        turn_state: {
          stack: [
            field,
            {
              phase: "fight",
              fight: {
                cardId: fought[0],
                cardName: fought[0].toUpperCase(),
                kind: "ordinary",
                enemyTotal: 2,
                playerTotal: 9,
                playerRoll: 6,
                enemyRoll: 1,
                result: { outcome: "wygrana" },
                fieldId: "wrzosowiska",
                draw: 0,
                drawn: (field as { drawn: unknown[] }).drawn,
                fought,
              },
            },
          ],
        },
      },
    } as typeof table;
  };

  const fieldAfter = async (fought: string[]) => {
    const table = fighting(fought);
    const { writes } = await resolveFight(table, undefined, ports({ random: scriptedRandom([]) }));
    return (apply(table, writes).game.turn_state as {
      stack: { drawn?: { cardId: string }[]; beaten?: string[] }[];
    }).stack[0];
  };

  /**
   * Written down rather than cut out of `drawn`.
   *
   * Deleting him settled the Obszar and lost the turn's own account of it, so
   * the kolejka could not show him struck through — and a row that simply drops
   * a creature the table watched die is a worse record than one that crosses
   * him out. The Karta stays in the turn; `beaten` is what says it is over.
   */
  it("writes the beaten creature down as dead", async () => {
    const state = await fieldAfter(["wilk"]);
    expect(state.beaten).toEqual(["wilk"]);
    expect(state.drawn?.map((one) => one.cardId)).toEqual(["wilk", "helm"]);
  });

  /** 17.5 settles a pack as one, so all of it dies together. */
  it("writes down the whole pack when they were fought as one (17.5)", async () => {
    expect((await fieldAfter(["wilk", "niedzwiedz"])).beaten).toEqual(["wilk", "niedzwiedz"]);
  });

  /** And the Obszar does not get him back at the end of the turn (16.2). */
  it("does not leave him lying there afterwards", () => {
    const writes = leaveCardsBehind(aTable({ seats: [aSeat({ id: "seat-a" })] }), {
      fieldId: "wrzosowiska",
      seatId: "seat-a",
      round: 3,
      remaining: [
        { cardId: "wilk", cardClass: "foe" },
        { cardId: "helm", cardClass: "item" },
      ] as never,
      beaten: ["wilk"],
    });
    expect(writes.fieldCards?.insert?.map((row) => row.card_id)).toEqual(["helm"]);
  });

  /**
   * A Wróg you ran from is not one you beat. 17.4 settles the fight either way
   * and 16.8 leaves the survivor lying there for whoever stops here next.
   */
  it("leaves one that was only fought, not beaten", () => {
    const writes = leaveCardsBehind(aTable({ seats: [aSeat({ id: "seat-a" })] }), {
      fieldId: "wrzosowiska",
      seatId: "seat-a",
      round: 3,
      remaining: [{ cardId: "wilk", cardClass: "foe" }] as never,
      beaten: [],
    });
    expect(writes.fieldCards?.insert?.map((row) => row.card_id)).toEqual(["wilk"]);
  });
});
