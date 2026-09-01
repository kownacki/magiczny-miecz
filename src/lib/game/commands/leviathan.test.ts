import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { isSettled, pendingIn } from "@/lib/engine/resolve";
import { scriptFor } from "@/lib/engine/cardScript";
import type { TurnPhase } from "@/lib/engine/turn";
import { aSeat, aTable, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { resolveDrawnCard } from "./resolving";

/**
 * LEWIATAN, who has to be put down somewhere nobody is standing.
 *
 * "Lewiatan może pojawić się na Mokradłach, przy Przeprawie lub na Bagnach —
 * połóż jego Kartę na którymś z tych Obszarów, nie zajętym przez inną Postać
 * (jeśli nie ma takiego Obszaru, odłóż Kartę). Potwór pozostanie tam, aż ktoś
 * go pokona."
 *
 * Three sentences, none of them carried. The op was declared settled on the
 * reading that "the Obszar is rolled for, not chosen, on all three cards that
 * do this" — which is true of the Upiór and the Eremita and false of this one.
 * The executor knew better and suspended, so the two disagreed: `pendingIn`
 * reported nothing to ask while the server asked, and the sheet showed no
 * control either way.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];
const LEWIATAN = "lewiatan";
const WHERE = ["mokradla-1", "mokradla-2", "przeprawa-1", "przeprawa-2", "bagna-1", "bagna-2"];

const drawnBy = (occupied: string[]): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: "wrzosowiska",
        from: null,
        draw: 0,
        drawn: [{ cardId: LEWIATAN, cardClass: "foe" }],
      } as TurnPhase,
      deck: { events: { draw: [], discard: [] }, spells: { draw: [], discard: [] } },
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: asFieldId("wrzosowiska") }),
      ...occupied.map((fieldId, at) =>
        aSeat({ id: `seat-${at + 1}`, seat_index: at + 1, field_id: asFieldId(fieldId) }),
      ),
    ],
  });

const settle = (at: Snapshot, destination?: string) =>
  resolveDrawnCard(
    at,
    {
      cardId: LEWIATAN,
      shuffle: asIs,
      ...(destination ? { decided: { destination: asFieldId(destination)! } } : {}),
    },
    ports(),
  );

describe("where the Lewiatan settles", () => {
  it("is a question, and the two registers now agree it is one", () => {
    const effect = scriptFor(LEWIATAN)!.effect;
    expect(isSettled(effect)).toBe(false);
    expect(pendingIn(effect, [])).toMatchObject({ op: "poloz-karte" });
  });

  it("waits to be told which Obszar, when several are free", async () => {
    const done = await settle(drawnBy([]));
    expect(done.result.pending).toMatchObject({ op: "poloz-karte" });
    expect(done.writes.fieldCards).toBeUndefined();
  });

  it("settles where it is pointed", async () => {
    const table = drawnBy([]);
    const at = apply(table, (await settle(table, "bagna-1")).writes);
    expect(at.fieldCards).toHaveLength(1);
    expect(at.fieldCards[0]).toMatchObject({ card_id: LEWIATAN, field_id: "bagna-1" });
  });

  /** "nie zajętym przez inną Postać" — a pointed-at Obszar with somebody on it is not free. */
  it("will not be put down on top of somebody", async () => {
    const done = await settle(drawnBy(["bagna-1"]), "bagna-1");
    expect(done.result.pending).toMatchObject({ op: "poloz-karte" });
  });

  /** One left free is not a choice, so nobody is asked. */
  it("takes the last free Obszar without asking", async () => {
    const table = drawnBy(WHERE.filter((f) => f !== "przeprawa-2"));
    const at = apply(table, (await settle(table)).writes);
    expect(at.fieldCards[0]).toMatchObject({ field_id: "przeprawa-2" });
  });

  /** "Jeśli nie ma takiego Obszaru, odłóż Kartę." */
  it("goes to the used pile when every Obszar is taken", async () => {
    const table = drawnBy(WHERE);
    const done = await settle(table);
    const at = apply(table, done.writes);

    expect(at.fieldCards).toHaveLength(0);
    expect(done.result.did.join(" ")).toMatch(/wolnego Obszaru/);
    const state = at.game.turn_state.stack.at(-1)!;
    expect(state.phase === "field" && state.drawn).toHaveLength(0);
  });
});
