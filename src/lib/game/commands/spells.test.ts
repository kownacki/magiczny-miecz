import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { castSpell } from "./fight";
import { asSeatCharacter } from "@/lib/engine/characters";
import { SPELLS } from "@/lib/engine/spells";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * Zaklęcia that the app carries out rather than announces.
 *
 * All thirty used to be announced: the card left the hand, reached the used
 * pile and the table was told, and what the spell *did* was the players'. That
 * is still true of the ones the model cannot hold — a Zwierciadło reflects the
 * spell cast a moment ago and nothing here is pending — and `SpellScript`
 * marks the difference in the data rather than in a branch.
 */

const table = (spell: string, victimCards: string[] = [], mine: string[] = []) =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [], resolved: [],
      } as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"),
        field_id: "wrzosowiska", life: 2, gold: 4, sword_own: 3, magic_own: 3,
      }),
      aSeat({
        id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"),
        field_id: "kurhan", life: 3, gold: 2,
      }),
    ],
    holdings: [
      aHolding({ id: "s1", seat_id: "seat-a", card_id: spell, kind: "spell" }),
      ...mine.map((c, i) => aHolding({ id: `m${i}`, seat_id: "seat-a", card_id: c, kind: "item" })),
      ...victimCards.map((c, i) =>
        aHolding({ id: `v${i}`, seat_id: "seat-b", card_id: c, kind: "item" }),
      ),
    ],
  });

const cast = async (
  spell: string,
  over: { dice?: number[]; target?: object; victim?: string[]; mine?: string[] } = {},
) => {
  const t = table(spell, over.victim ?? [], over.mine ?? []);
  const out = await castSpell(
    t,
    { seatId: "seat-a", holdingId: "s1", target: over.target as never },
    ports({ random: scriptedRandom(over.dice ?? []) }),
  );
  return { after: apply(t, out.writes), out };
};

const seat = (t: ReturnType<typeof apply>, id: string) => t.seats.find((s) => s.id === id)!;

describe("Fatum, which is a die table and nothing else", () => {
  it("reads each face off the die", async () => {
    const at = { seatIndex: 1 };
    expect(seat((await cast("fatum", { dice: [1], target: at })).after, "seat-b").stone_until_turn)
      .not.toBeNull();
    expect(seat((await cast("fatum", { dice: [2], target: at })).after, "seat-b").gold).toBe(0);
    expect(seat((await cast("fatum", { dice: [6], target: at })).after, "seat-b").life).toBe(4);
  });

  /**
   * Face 5 is a choice and the other five are not. That one row used to make
   * the whole table unreachable: `isSettled` calls a `rzut` settled only when
   * every face is, which is right for a browser that cannot know the face and
   * wrong for a throw that lands on one row.
   */
  it("is not refused whole for the one face that asks a question", async () => {
    const { out } = await cast("fatum", { dice: [1], target: { seatIndex: 1 } });
    expect(out.result.effect).toBeDefined();
  });
});

describe("Zaklęcia aimed at somebody else", () => {
  it("refuses to land on the caster when no victim was named", async () => {
    await expect(cast("siedem-wichrow", { dice: [1], mine: ["helm"] })).rejects.toThrow(
      /wskaż Postać/,
    );
  });

  /** "Rzuć raz kostką dla każdego Przedmiotu ... Jeśli wynikiem jest 1, Wichry niszczą." */
  it("throws once for each of the victim's Przedmioty", async () => {
    const { after } = await cast("siedem-wichrow", {
      dice: [1, 5],
      target: { seatIndex: 1 },
      victim: ["helm", "miecz"],
    });
    expect(after.holdings.filter((h) => h.seat_id === "seat-b" && h.kind === "item")).toHaveLength(1);
  });

  /** "zabrać wybranej Postaci jednego z Przyjaciół i dołączyć go do swoich" */
  it("moves a stolen card across rather than destroying it", async () => {
    const t = aTable({
      game: { active_seat: 0, turn_state: { phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [], resolved: [] } as TurnPhase },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, field_id: "wrzosowiska" }),
        aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"), field_id: "kurhan" }),
      ],
      holdings: [
        aHolding({ id: "s1", seat_id: "seat-a", card_id: "pan-przyjaciol", kind: "spell" }),
        aHolding({ id: "f1", seat_id: "seat-b", card_id: "pasterz", kind: "friend" }),
      ],
    });
    const out = await castSpell(
      t,
      { seatId: "seat-a", holdingId: "s1", target: { seatIndex: 1 }, decided: { choices: [0] } },
      ports(),
    );
    const after = apply(t, out.writes);
    const pasterz = after.holdings.find((h) => h.card_id === "pasterz");
    expect(pasterz?.seat_id).toBe("seat-a");
  });
});

describe("Zaklęcia that leave something behind", () => {
  /** "przywraca punkty Życia z początku rozgrywki (czyli 4 punkty)" */
  it("Odrodzenie restores the four a character started with", async () => {
    expect(seat((await cast("odrodzenie")).after, "seat-a").life).toBe(4);
  });

  /**
   * "tylko w jednej walce (lecz nie w walce magicznej)" — so it ends with the
   * fight, however the fight ends. Read off the script rather than cast, since
   * its window is before a fight and this suite stands on an ordinary Obszar.
   */
  it("Magia i Miecz lasts exactly one fight", () => {
    const script = (SPELLS as Record<string, { stosuje?: { modifier: unknown; ends: unknown } }>)[
      "magia-i-miecz"
    ];
    expect(script.stosuje?.modifier).toEqual({ kind: "magia-as-miecz" });
    expect(script.stosuje?.ends).toEqual({ kind: "fight" });
  });
});

describe("what is still announced, and why it is written down", () => {
  /**
   * The reactive ones need a spell to be *pending* rather than resolved, and
   * nothing here is. Marking that in the data beats half-applying them.
   */
  it("leaves the spells that answer other spells alone", () => {
    for (const id of ["zwierciadlo", "wladca-zaklec", "ocalony"]) {
      const script = (SPELLS as Record<string, { stosuje?: unknown }>)[id];
      expect(script.stosuje, id).toBeUndefined();
    }
  });

  it("still says what every one of them does", () => {
    for (const [id, script] of Object.entries(SPELLS as Record<string, { effect: string }>)) {
      expect(script.effect.length, id).toBeGreaterThan(0);
    }
  });
});
