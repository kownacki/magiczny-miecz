import { describe, expect, it } from "vitest";
import { aSeat, aTable } from "../fixture";
import { asFieldId } from "@/lib/engine/board";
import { takeCard } from "./holdings";
import type { TurnPhase } from "@/lib/engine/turn";

/** Picking the Łódź up: it resolves rather than joining the pack (11.2). */
const HERE = asFieldId("mokradla-1")!;

const standing = () =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: { phase: "field", fieldId: HERE, from: null, draw: 0, drawn: [] } as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE })],
  });

describe("taking the Łódź", () => {
  it("puts nothing in the pack", () => {
    const { writes, result } = takeCard(standing(), { seatId: "seat-a", cardId: "lodz" });
    expect(writes.holdings).toBeUndefined();
    expect(result.kind).toBeNull();
  });

  /** The crossing it opens comes back for the caller to apply. */
  it("hands back the crossing it opens", () => {
    const { result } = takeCard(standing(), { seatId: "seat-a", cardId: "lodz" });
    expect(result.resolve?.effect).toMatchObject({
      op: "efekt",
      modifier: { kind: "przeprawa", przez: "trzesawiska" },
      ends: { kind: "turns", turns: 1 },
    });
    expect(result.resolve?.reason).toBe("ŁÓDŹ");
  });

  /**
   * The journal used to call every consumed card gold, which was true of the
   * only two there were. Three now, and one of them is a boat.
   */
  it("is not recorded as money", () => {
    const { writes } = takeCard(standing(), { seatId: "seat-a", cardId: "lodz" });
    expect(writes.journal?.[0]).toMatchObject({ kind: "taken", payload: { kind: "item" } });
  });

  it("still calls a Sztuka Złota gold", () => {
    const { writes } = takeCard(standing(), { seatId: "seat-a", cardId: "1-sztuka-zlota" });
    expect(writes.journal?.[0]).toMatchObject({ payload: { cardId: "1-sztuka-zlota" } });
  });

  /** An ordinary Przedmiot is unaffected and still joins the pack (5.4). */
  it("leaves an ordinary Przedmiot alone", () => {
    const { writes } = takeCard(standing(), { seatId: "seat-a", cardId: "helm" });
    expect(writes.holdings?.insert?.[0]).toMatchObject({ card_id: "helm" });
  });
});
