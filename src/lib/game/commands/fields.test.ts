import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFieldOffer } from "./effects";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";

/**
 * Obszary that do something to whoever stops on them.
 *
 * Until these were scripted the board's text was shown and the players applied
 * it themselves — so the Ruchome Skały cost nothing, the Bagna took nothing,
 * and the three cards that guard against them (Rękawice, Święty Graal, Kij i
 * Sznur) had nothing to guard against.
 */

const standing = (field: FieldId, cards: string[] = []) =>
  aTable({
    game: {
      turn_state: {
        phase: "field",
        fieldId: field,
        from: null,
        draw: 0,
        drawn: [],
        resolved: [],
      } as TurnPhase,
      active_seat: 0,
    },
    seats: [aSeat({ id: "seat-a", field_id: field, life: 4, nature: "good" })],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
    ),
  });

const arrive = async (table: ReturnType<typeof standing>, field: FieldId, choices: number[] = []) => {
  const owed = compulsoryOffer(field, []);
  if (!owed) throw new Error(`nothing owed at ${field}`);
  const out = await resolveFieldOffer(
    table,
    { offerName: owed.name, decided: { choices }, shuffle: (items) => [...items] },
    ports({ random: scriptedRandom([1, 1, 1]) }),
  );
  return { out, after: apply(table, out.writes) };
};

describe("the Ruchome Skały (Tracisz 1 Życie)", () => {
  it("takes the point from whoever stops there", async () => {
    const table = standing("ruchome-skaly-1");
    expect((await arrive(table, "ruchome-skaly-1")).after.seats[0].life).toBe(3);
  });

  /** It is compulsory: the board states it flat, with no "MOŻESZ" anywhere. */
  it("is owed on arrival rather than offered", () => {
    expect(compulsoryOffer("ruchome-skaly-1", [])).not.toBeNull();
  });

  it("is kept by the Rękawice and by the Święty Graal", async () => {
    for (const card of ["rekawice", "swiety-graal"]) {
      const table = standing("ruchome-skaly-1", [card]);
      const { after, out } = await arrive(table, "ruchome-skaly-1");
      expect(after.seats[0].life).toBe(4);
      expect(out.result.did.join(" ")).toMatch(/chroni na tym Obszarze/);
    }
  });

  it("does the same at the other one", async () => {
    const table = standing("ruchome-skaly-2");
    expect((await arrive(table, "ruchome-skaly-2")).after.seats[0].life).toBe(3);
  });
});

describe("the Bagna (Tracisz 1 Przedmiot lub Przyjaciela, wedle własnego wyboru)", () => {
  /**
   * Two decisions, in order: which kind, then which card. 5.6 makes both the
   * holder's, and until this field existed nothing in the box used that shape —
   * so a loss the holder chose could be asked and never answered.
   */
  it("takes the card the holder names", async () => {
    const table = standing("bagna-1", ["helm"]);
    const { after, out } = await arrive(table, "bagna-1", [0, 0]);
    expect(after.holdings).toHaveLength(0);
    expect(out.result.pending).toBeNull();
    expect(out.result.did.join(" ")).toMatch(/HEŁM/);
  });

  it("stays a question while nobody has answered it", async () => {
    const table = standing("bagna-1", ["helm"]);
    const { after, out } = await arrive(table, "bagna-1", [0]);
    expect(out.result.pending).not.toBeNull();
    expect(after.holdings).toHaveLength(1);
  });

  it("is kept whole by the Kij i Sznur", async () => {
    const table = standing("bagna-1", ["helm", "kij-i-sznur"]);
    const { after, out } = await arrive(table, "bagna-1", [0, 0]);
    expect(after.holdings).toHaveLength(2);
    expect(out.result.did.join(" ")).toMatch(/nic nie traci/);
  });

  it("can be paid with a Przyjaciel instead", async () => {
    const table = aTable({
      game: {
        turn_state: {
          phase: "field", fieldId: "bagna-2", from: null, draw: 0, drawn: [], resolved: [],
        } as TurnPhase,
        active_seat: 0,
      },
      seats: [aSeat({ id: "seat-a", field_id: "bagna-2", nature: "good" })],
      holdings: [
        aHolding({ id: "h0", seat_id: "seat-a", card_id: "helm", kind: "item" }),
        aHolding({ id: "h1", seat_id: "seat-a", card_id: "pasterz", kind: "friend" }),
      ],
    });
    // Option 1 is the Przyjaciel; then the first (only) candidate of that kind.
    const { after } = await arrive(table, "bagna-2", [1, 0]);
    expect(after.holdings.map((h) => h.card_id)).toEqual(["helm"]);
  });
});
