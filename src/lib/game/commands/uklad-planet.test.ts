import { describe, expect, it } from "vitest";
import { aSeat, aTable, ports } from "../fixture";
import { asSeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";
import { resolveDrawnCard } from "./resolving";

/**
 * UKŁAD PLANET: "Przy tym szczególnym układzie planet, na czas 1 tury
 * podwojona zostaje Magia wszystkich Demonów."
 *
 * The card's own script is `{ op: "nothing" }` — the doubling reaches every Demon
 * on the board rather than a seat, which is nowhere in `cardScript.ts`'s op
 * tree, so `resolveDrawnCard` applies it bespoke to this one card id (`
 * doubleDemons`), the way `landSpell` special-cases the Władca Gromu.
 */
const drawnAt = () =>
  aTable({
    game: {
      active_seat: 0,
      round: 4,
      turn_state: {
        phase: "field",
        fieldId: "wrzosowiska",
        from: null,
        draw: 0,
        drawn: [{ cardId: "uklad-planet", cardClass: "encounter" as const }],
      } as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a",
        seat_index: 0,
        character_id: asSeatCharacter("krasnolud"),
        field_id: "wrzosowiska",
      }),
    ],
    fieldCards: [
      { id: "fc-wampir", field_id: "mroczna-polana", card_id: "wampir", granted: false, pool: null },
      { id: "fc-demon", field_id: "wrzosowiska", card_id: "demon", granted: false, pool: null },
      // A Przedmiot lying beside them: not a Demon, and not touched.
      { id: "fc-helm", field_id: "wrzosowiska", card_id: "helm", granted: false, pool: null },
    ],
  });

const asIs = <T,>(items: readonly T[]): T[] => [...items];

describe("UKŁAD PLANET doubles every Demon on the board", () => {
  it("puts magic-x2 on every Demon's row, wherever it is lying", async () => {
    const { writes } = await resolveDrawnCard(
      drawnAt(),
      { cardId: "uklad-planet", shuffle: asIs },
      ports(),
    );
    const rows = writes.effects?.insert ?? [];
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field_card_id: "fc-wampir", modifier: { kind: "magic-x2" } }),
        expect.objectContaining({ field_card_id: "fc-demon", modifier: { kind: "magic-x2" } }),
      ]),
    );
    // The Hełm is not a Demon and gets nothing.
    expect(rows.some((row) => (row as { field_card_id: string }).field_card_id === "fc-helm")).toBe(
      false,
    );
  });

  it("ends the doubling one round out, on the round clock", async () => {
    const { writes } = await resolveDrawnCard(
      drawnAt(),
      { cardId: "uklad-planet", shuffle: asIs },
      ports(),
    );
    for (const row of writes.effects?.insert ?? []) {
      expect(row.ends).toEqual({ kind: "round", round: 5 });
    }
  });

  it("says what it did", async () => {
    const { result } = await resolveDrawnCard(
      drawnAt(),
      { cardId: "uklad-planet", shuffle: asIs },
      ports(),
    );
    expect(result.did.join(" ")).toMatch(/Magia podwojona/);
  });

  it("does not double a Demon already doubled this round", async () => {
    const already = drawnAt();
    const twice = {
      ...already,
      effects: [
        {
          id: "eff-already",
          seat_id: null,
          field_card_id: "fc-demon",
          source: "uklad-planet",
          label: "Układ Planet — Magia podwojona",
          modifier: { kind: "magic-x2" as const },
          ends: { kind: "round" as const, round: 5 },
        },
      ],
    };
    const { writes } = await resolveDrawnCard(
      twice,
      { cardId: "uklad-planet", shuffle: asIs },
      ports(),
    );
    const rows = writes.effects?.insert ?? [];
    expect(rows.some((row) => (row as { field_card_id: string }).field_card_id === "fc-demon")).toBe(
      false,
    );
    // The other Demon still gets it.
    expect(rows.some((row) => (row as { field_card_id: string }).field_card_id === "fc-wampir")).toBe(
      true,
    );
  });
});
