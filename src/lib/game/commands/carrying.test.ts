import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { aHolding, aSeat, aTable } from "../fixture";
import { apply } from "../change";
import { refuseWhileOverLimit, seatView } from "./seat";
import { dropCard } from "./holdings";

/**
 * Losing the transport, and what the Obszar is left holding (5.4-5.6).
 *
 * "Przedmioty te pozostaną na Obszarze, na którym utraciłeś Konia." Three
 * cards say a version of it — Koń, Muł, Zaprzęg — and all three had a MANUAL
 * note claiming the app left it to the table. It does not, and has not for a
 * long time; this is that chain written down so the claim cannot come back.
 *
 * What the app deliberately does *not* do is choose which Przedmioty go. 5.4
 * gives that to the player and 5.6 only says it must happen at once.
 */

const ITEMS = ["miecz", "sztylet", "tarcza", "helm", "zbroja", "rekawice"];

const packed = (transport: string | null) =>
  aTable({
    seats: [aSeat({ id: "seat-a", field_id: asFieldId("wrzosowiska") })],
    holdings: [
      ...ITEMS.map((cardId, at) => aHolding({ id: `h-${at}`, card_id: cardId, kind: "item" })),
      ...(transport ? [aHolding({ id: "h-t", card_id: transport, kind: "item" })] : []),
    ],
  });

describe("a pack that outgrew its limit when the transport went", () => {
  it("counts the Koń's eight and the Muł's four (5.4)", () => {
    expect(seatView(packed("kon"), "seat-a").carryLimit).toBe(12);
    expect(seatView(packed("mul"), "seat-a").carryLimit).toBe(8);
    expect(seatView(packed("zaprzeg"), "seat-a").carryLimit).toBe(Infinity);
    expect(seatView(packed(null), "seat-a").carryLimit).toBe(4);
  });

  /**
   * The Awanturnik takes your Koń at the Bagna and six Przedmioty are suddenly
   * two too many. 5.6 says "musi natychmiast odrzucić", and a turn-based
   * referee's "at once" is the next door the turn goes through.
   */
  it("stops the game until the excess is shed (5.6)", () => {
    expect(() => refuseWhileOverLimit(packed("kon"), "seat-a")).not.toThrow();
    expect(() => refuseWhileOverLimit(packed(null), "seat-a")).toThrow(/odrzuć/);
  });

  /** 5.5: what goes down goes down *here*, face up, for whoever comes next. */
  it("leaves what is dropped lying on the Obszar", () => {
    const table = packed(null);
    const after = apply(table, dropCard(table, { holdingId: "h-0" }).writes);

    expect(after.holdings.some((one) => one.id === "h-0")).toBe(false);
    expect(after.fieldCards).toHaveLength(1);
    expect(after.fieldCards[0]).toMatchObject({ card_id: "miecz", field_id: "wrzosowiska" });
  });

  it("and shedding enough lets the turn go on", () => {
    let at = packed(null);
    for (const holdingId of ["h-0", "h-1"]) at = apply(at, dropCard(at, { holdingId }).writes);
    expect(() => refuseWhileOverLimit(at, "seat-a")).not.toThrow();
    expect(at.fieldCards).toHaveLength(2);
  });
});
