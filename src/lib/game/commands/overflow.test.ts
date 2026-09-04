/** 5.6's "natychmiast" as a frame: who it names, what ends it, and who waits. */

import { describe, expect, it } from "vitest";
import { aHolding, aSeat, aTable } from "../fixture";
import { only, top } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { overflowSaid } from "@/lib/engine/overflow";
import { apply, merge, type Changeset, type Snapshot } from "../change";
import { EVENT_COPIES, decksOf } from "../decks";
import { dropCard as dropCardOn } from "./holdings";
import {
  holdOverflow,
  overflowOf,
  refuseWhileOverflow,
  releaseOverflow,
  waysOut,
  whoIsOver,
} from "./overflow";

/** Klasyczny, where 5.4 counts everything and the limit is four. */
const table = (cards: readonly string[], over: Record<string, unknown> = {}) =>
  aTable({
    game: { eq_mode: "classic", turn_state: only({ phase: "roll" }), ...over },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, character_id: "goblin" }),
      aSeat({ id: "seat-b", seat_index: 1, character_id: "elf" }),
    ],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId }),
    ),
  });

const FOUR = ["helm", "zbroja", "lina", "kij"];
const FIVE = [...FOUR, "lodz"];

describe("who is over, and by how much", () => {
  it("says nothing while the pack is inside 5.4's four", () => {
    expect(overflowOf(table(FOUR), "seat-a")).toBeNull();
    expect(whoIsOver(table(FOUR))).toBeNull();
  });

  it("counts the surplus, not the pack", () => {
    expect(overflowOf(table(FIVE), "seat-a")).toMatchObject({
      what: "przedmioty",
      held: 5,
      limit: 4,
      over: 1,
    });
  });

  it("names the first seat in seat order, so a second surfaces after the first", () => {
    expect(whoIsOver(table(FIVE))?.seatId).toBe("seat-a");
  });
});

describe("the frame", () => {
  it("opens on top of whatever was running, and leaves it underneath", () => {
    const at = table(FIVE);
    const writes = holdOverflow(at);
    const after = apply(at, writes);
    expect(after.game.turn_state.stack).toEqual([
      { phase: "roll" },
      { phase: "overflow", seatId: "seat-a", what: "przedmioty" },
    ]);
  });

  it("does not open when nobody is over", () => {
    expect(holdOverflow(table(FOUR))).toEqual({});
  });

  it("does not stack a copy of itself on a table that is already waiting", () => {
    const waiting = apply(table(FIVE), holdOverflow(table(FIVE)));
    expect(holdOverflow(waiting)).toEqual({});
  });

  it("reads the writes rather than the stored table, so the Karta that caused it counts", () => {
    // The fifth card arrives in this very change. Asked of the snapshot alone
    // the answer would be "nobody is over", which is the state before the card.
    const at = table(FOUR);
    const arriving = {
      holdings: { insert: [{ seat_id: "seat-a", card_id: "lodz", kind: "item" as const }] },
    };
    expect(holdOverflow(at, arriving).game).toBeDefined();
  });

  it("closes when the seat it names is back under", () => {
    const waiting = apply(table(FIVE), holdOverflow(table(FIVE)));
    const dropped = { holdings: { delete: ["h4"] } };
    const after = apply(waiting, releaseOverflow(waiting, dropped));
    expect(after.game.turn_state.stack).toEqual([{ phase: "roll" }]);
  });

  it("keeps waiting while the seat is still over, so four over is answered four times", () => {
    const at = table([...FIVE, "sznur", "namiot"]);
    const waiting = apply(at, holdOverflow(at));
    const one = releaseOverflow(waiting, { holdings: { delete: ["h6"] } });
    expect(one).toEqual({});
  });
});

describe("the ways out", () => {
  it("offers every Przedmiot in the pack, to be put down", () => {
    const ways = waysOut(table(FIVE), "seat-a");
    expect(ways.filter((way) => way.kind === "odrzuc")).toHaveLength(5);
    expect(ways.every((way) => way.kind !== "zaloz")).toBe(true);
  });

  it("offers a card that can be spent as a way to be carrying one fewer", () => {
    // Drinking the Eliksir to make room is a perfectly good answer, and a
    // better one than most: you keep what it bought.
    const ways = waysOut(table([...FOUR, "eliksir-sily"]), "seat-a");
    expect(ways.some((way) => way.kind === "uzyj" && way.cardId === "eliksir-sily")).toBe(true);
  });

  it("says nothing at all about a seat that is inside its limit", () => {
    expect(waysOut(table(FOUR), "seat-a")).toEqual([]);
  });
});

describe("who waits", () => {
  const waiting = () => apply(table(FIVE), holdOverflow(table(FIVE)));

  it("lets nobody through, including whoever's turn it is", () => {
    expect(() => refuseWhileOverflow(waiting(), "seat-b")).toThrow(/Miejsce 1 ma o 1 Przedmiot za dużo/);
    expect(() => refuseWhileOverflow(waiting(), "seat-b")).toThrow(/5\.6/);
  });

  it("tells the seat it names how far over it is and what would help", () => {
    expect(() => refuseWhileOverflow(waiting(), "seat-a")).toThrow(/Gra czeka: masz o 1 Przedmiot za dużo \(5\.6\)/);
    expect(() => refuseWhileOverflow(waiting(), "seat-a")).toThrow(/odrzucić.*użyć.*założyć/);
  });

  it("stops nobody when there is no frame", () => {
    expect(() => refuseWhileOverflow(table(FOUR), "seat-a")).not.toThrow();
  });
});

/**
 * The Magiczna Sakwa and the Tragarz, whose own text says what they carried
 * does not wait anywhere — it perishes with them (docs/COVERAGE.md's old
 * MANUAL notes against both, now stale).
 */
describe("a container whose load perishes with it", () => {
  // Six ordinary Przedmioty besides the Sakwa: under its boosted nine, over
  // klasyczny's plain four once it is gone.
  const SIX = ["helm", "zbroja", "eliksir-sily", "kij", "sznur", "namiot"];

  const withSakwa = () =>
    aTable({
      game: { eq_mode: "classic", turn_state: only({ phase: "roll" }) },
      seats: [aSeat({ id: "seat-a", seat_index: 0, character_id: "goblin" })],
      holdings: [
        aHolding({ id: "h-sakwa", seat_id: "seat-a", card_id: "magiczna-sakwa" }),
        ...SIX.map((cardId, at) => aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId })),
      ],
    });

  const discardOf = (writes: Changeset) =>
    decksOf({ deck: writes.game?.deck ?? null }).events.discard;

  /**
   * `dropCard` here, exactly as `thenRelease` wraps it in `turnStore.ts`: the
   * raw command's writes, merged with what `releaseOverflow` makes of them.
   * The unwrapped command alone never opens or closes anything — that half
   * of the door is `thenRelease`'s, which lives beside `change()` and cannot
   * be called from a snapshot-only test.
   */
  const drop = (snapshot: Snapshot, holdingId: string): Changeset => {
    const { writes } = dropCardOn(snapshot, { holdingId });
    return merge(writes, releaseOverflow(snapshot, writes));
  };

  it("is not over while the Sakwa is still held", () => {
    expect(overflowOf(withSakwa(), "seat-a")).toBeNull();
  });

  it("opens a fresh frame off the Sakwa's own loss, naming it as the cause", () => {
    const at = withSakwa();
    const after = apply(at, drop(at, "h-sakwa"));

    expect(top(after.game.turn_state)).toMatchObject({
      phase: "overflow",
      seatId: "seat-a",
      what: "przedmioty",
      because: { kind: "container-lost", cardId: "magiczna-sakwa" },
    });
  });

  it("offers zniszcz for the surplus instead of odrzuc, once the frame is open", () => {
    const at = withSakwa();
    const waiting = apply(at, drop(at, "h-sakwa"));

    // Every Przedmiot offers `zniszcz`; the Eliksir also offers `uzyj` — being
    // spent is still a perfectly good way to be carrying one fewer — and
    // nothing offers the ordinary `odrzuc`.
    const ways = waysOut(waiting, "seat-a");
    expect(ways.filter((way) => way.kind === "zniszcz")).toHaveLength(SIX.length);
    expect(ways.filter((way) => way.kind === "uzyj")).toHaveLength(1);
    expect(ways.every((way) => way.kind !== "odrzuc")).toBe(true);
    expect(ways.filter((way) => way.kind === "zniszcz").every((way) => way.gdzie === "stos")).toBe(
      true,
    );
  });

  it("destroys what it drops — deleted, on the used pile, never on the Obszar", () => {
    const at = withSakwa();
    // Dropping the Sakwa itself is an ordinary 5.5 discard — it lies on the
    // Obszar like any other Przedmiot put down; it is only what it carried
    // that the card destroys.
    const waiting = apply(at, drop(at, "h-sakwa"));
    expect(waiting.fieldCards.map((row) => row.card_id)).toEqual(["magiczna-sakwa"]);

    const destroyWrites = drop(waiting, "h2"); // eliksir-sily
    const after = apply(waiting, destroyWrites);

    expect(after.holdings.some((h) => h.id === "h2")).toBe(false);
    // Still only the Sakwa lying there — the Eliksir never joins it.
    expect(after.fieldCards.map((row) => row.card_id)).toEqual(["magiczna-sakwa"]);
    expect(discardOf(destroyWrites)).toEqual([EVENT_COPIES.get("eliksir-sily")![0]]);
  });

  it("keeps waiting while the seat is still over, and closes once it is shed enough", () => {
    const at = withSakwa();
    let waiting = apply(at, drop(at, "h-sakwa"));
    expect(top(waiting.game.turn_state).phase).toBe("overflow");

    for (const holdingId of ["h0", "h1"]) {
      waiting = apply(waiting, drop(waiting, holdingId));
    }

    expect(overflowOf(waiting, "seat-a")).toBeNull();
    expect(top(waiting.game.turn_state)).toEqual({ phase: "roll" });
  });

  it("says the Karty are lost with the Sakwa, not left on the Obszar", () => {
    const at = withSakwa();
    const waiting = apply(at, drop(at, "h-sakwa"));
    const frame = top(waiting.game.turn_state) as Extract<TurnPhase, { phase: "overflow" }>;
    const over = overflowOf(waiting, "seat-a")!;

    const said = overflowSaid(over, null, frame.because);
    expect(said).toMatch(/MAGICZNA SAKWA/);
    expect(said).toMatch(/nic z tego nie trafi na Obszar/);
  });

  it("a plain over-limit — a fifth card taken, no container lost — still offers the ordinary drop", () => {
    const ways = waysOut(table(FIVE), "seat-a");
    expect(ways.every((way) => way.kind !== "zniszcz")).toBe(true);
    expect(ways.some((way) => way.kind === "odrzuc" && way.gdzie === "obszar")).toBe(true);
  });
});
