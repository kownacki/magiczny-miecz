import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { isSettled, pendingIn } from "@/lib/engine/resolve";
import { FIELD_SCRIPTS } from "@/lib/engine/fieldScript";
import { scriptFor } from "@/lib/engine/cardScript";
import { scriptedRandom } from "@/lib/engine/ports";
import type { TurnPhase } from "@/lib/engine/turn";
import { aSeat, aTable, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { resolveDrawnCard } from "./effects";

/**
 * The two Kapliczki, which borrow a Świątynia's table (`jak-pole`).
 *
 * "Możesz modlić się na takich samych zasadach, jak w Świątyni Bogini Nemed" —
 * and the table is already encoded, two dice and eleven faces of it. So the
 * card runs *that* rather than a second copy: a Kapliczka whose prayer had
 * drifted from the Świątynia's would be the worse of the two bugs on offer.
 *
 * The op has existed since the cards were transcribed and had no executor. It
 * was also declared unsettled, which is worse than it sounds — an unsettled
 * effect is what `pendingIn` reports, and the drawn-card sheet hides "Rozpatrz"
 * whenever something is being asked, so the only thing a player could do with a
 * Kapliczka was leave it for later, for ever.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];

const facing = (cardId: string): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: "wrzosowiska",
        from: null,
        draw: 1,
        drawn: [{ cardId, cardClass: "place" }],
      } as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a", life: 2, field_id: asFieldId("wrzosowiska") })],
  });

describe("a Karta that borrows an Obszar's table", () => {
  /**
   * Exactly as settled as the table it borrows, and both of them are not:
   * each Świątynia's prayer holds a `wybor` on one face or another, so the
   * card may ask a question — just as standing on the Obszar may.
   */
  it("is as settled as the table it borrows, and no more", () => {
    for (const [id, fieldId] of [
      ["kapliczka-nemed", "swiatynia-bogini-nemed"],
      ["kapliczka-tolimana", "swiatynia-tolimana"],
    ] as const) {
      expect(isSettled(scriptFor(id)!.effect), id).toBe(
        isSettled(FIELD_SCRIPTS[fieldId]!.offers[0].effect),
      );
    }
  });

  /**
   * And the node itself is never what is *owed*, which is the half that was
   * actually broken. `pendingIn` reported the `jak-pole` node as the question,
   * the drawn-card sheet has no control for one, and it hides "Rozpatrz"
   * whenever something is being asked — so the only thing a player could ever
   * do with a Kapliczka was leave it for later.
   */
  it("is never itself the question", () => {
    for (const id of ["kapliczka-nemed", "kapliczka-tolimana"]) {
      expect(pendingIn(scriptFor(id)!.effect, []), id).toBeNull();
    }
  });

  /**
   * Two dice, and the Świątynia's own face. A 2 is "+2 Życia" on Nemed's
   * table, so a pair of ones is the cheapest thing to recognise it by — and
   * the point is that the number comes from `FIELD_SCRIPTS` rather than from
   * anything written down twice.
   */
  it("runs the Świątynia's own prayer, face for face", async () => {
    const table = facing("kapliczka-nemed");
    const done = await resolveDrawnCard(
      table,
      { cardId: "kapliczka-nemed", shuffle: asIs },
      ports({ random: scriptedRandom([1, 1]) }),
    );
    const at = apply(table, done.writes);

    expect(at.seats[0].life).toBe(4);
    expect(done.result.did.join(" ")).toMatch(/Świątyni/i);
    expect(done.result.pending).toBeNull();
  });

  it("and the Tolimana one borrows the other table", async () => {
    const table = facing("kapliczka-tolimana");
    const done = await resolveDrawnCard(
      table,
      { cardId: "kapliczka-tolimana", shuffle: asIs },
      ports({ random: scriptedRandom([1, 1]) }),
    );
    expect(done.result.pending).toBeNull();
    expect(done.result.did.join(" ")).toMatch(/Tolimana/i);
  });

  /** The borrowed offer has to be there to borrow. */
  it("names both Świątynie in a way the board recognises", () => {
    for (const fieldId of ["swiatynia-bogini-nemed", "swiatynia-tolimana"] as const) {
      expect(FIELD_SCRIPTS[fieldId]?.offers[0]?.name, fieldId).toBeTruthy();
    }
  });
});
