import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { castSpell, settleSpell } from "./fight";
import { asSeatCharacter } from "@/lib/engine/characters";
import { SPELLS } from "@/lib/engine/spells";
import { manualNote } from "@/lib/engine/coverage";
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
    expect(seat((await cast("fatum", { dice: [1], target: at })).after, "seat-b").stone_until_round)
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

describe("every Zaklęcie is carried out, and the halves that are not are named", () => {
  /**
   * The two that answer another spell do it in `castSpell` rather than through
   * an effect: what they do is not something that happens to anybody, it is
   * what happens to another Zaklęcie. `reactive` is how the casting knows.
   */
  it("answers a spell rather than applying one", () => {
    for (const id of ["zwierciadlo", "wladca-zaklec"]) {
      const script = (SPELLS as Record<string, { stosuje?: unknown; reactive?: boolean }>)[id];
      expect(script.stosuje, id).toBeUndefined();
      expect(script.reactive, id).toBe(true);
    }
  });

  /**
   * Nothing is left entirely to the table any more. What a card does only in
   * part says so in `MANUAL`, which marks it `czesciowe` and prints the rest
   * where a player reads the card — the danger the Ocalony's old note named,
   * answered by the register that exists for it.
   */
  it("applies every one of them, in whole or in part", () => {
    for (const [id, script] of Object.entries(
      SPELLS as Record<string, { stosuje?: unknown; applies?: string; reactive?: boolean }>,
    )) {
      const carried = Boolean(script.stosuje ?? script.applies ?? script.reactive);
      expect(carried, id).toBe(true);
    }
  });

  it("names what the table still does, for the three it only half carries", () => {
    // The WOJNA ŻYWIOŁÓW was a fourth until the cards' own class band was
    // transcribed: its note said "aplikacja nie wie, które Przedmioty są
    // Magiczne", and it does now, so both halves of the card are carried.
    const partial = ["krag-plomieni", "wladca-gromu", "ocalony"];
    for (const id of partial) expect(manualNote(id), id).toBeTruthy();
    for (const id of Object.keys(SPELLS)) {
      if (partial.includes(id)) continue;
      expect(manualNote(id), id).toBeNull();
    }
  });

  it("still says what every one of them does", () => {
    for (const [id, script] of Object.entries(SPELLS as Record<string, { effect: string }>)) {
      expect(script.effect.length, id).toBeGreaterThan(0);
    }
  });
});

/**
 * The one Zaklęcie that asks its caster a question.
 *
 * „Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym
 * Kręgu" — which Karta *and* where to. Everything else in the deck is answered
 * by naming a target; this one needs a second answer, and the engine used to
 * throw it away: `applyEffect` handed back what it could not carry out and
 * `landSpell` dropped it, so the changeset committed with the card on the used
 * pile and the Karta exactly where it had been.
 */
describe("Władca Zdarzeń, and the answer it waits for", () => {
  const HERE = "wrzosowiska";
  const lying = { id: "fc1", field_id: HERE, card_id: "cyklop", granted: false };

  const table = (over: { seats?: unknown[] } = {}) =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field", fieldId: HERE, from: null, draw: 0, drawn: [], resolved: [],
        } as TurnPhase,
      },
      seats: (over.seats as never) ?? [
        aSeat({
          id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"),
          field_id: "krag-mocy", life: 2, sword_own: 3, magic_own: 3,
        }),
      ],
      holdings: [
        aHolding({ id: "s1", seat_id: "seat-a", card_id: "wladca-zdarzen", kind: "spell" }),
      ],
      fieldCards: [lying],
    });

  const speak = (t: ReturnType<typeof aTable>, decided?: { destination: string }) =>
    castSpell(
      t,
      {
        seatId: "seat-a",
        holdingId: "s1",
        target: { fieldCardId: "fc1" },
        ...(decided ? { decided: decided as never } : {}),
      },
      ports({ random: scriptedRandom([]) }),
    );

  /**
   * Refused rather than spent. A Command writes all of its changeset or none of
   * it, so throwing is what keeps the hand intact — the caster names an Obszar
   * and casts again.
   */
  it("refuses a cast that has not said where, and spends nothing", async () => {
    const t = table();
    await expect(speak(t)).rejects.toThrow(/WŁADCA ZDARZEŃ/i);
    expect(t.holdings.map((h) => h.id)).toEqual(["s1"]);
    expect(t.fieldCards[0].field_id).toBe(HERE);
  });

  it("moves the Karta once it has", async () => {
    const t = table();
    const out = await speak(t, { destination: "mroczna-polana" });
    const after = apply(t, out.writes);
    expect(after.fieldCards.map((row) => [row.card_id, row.field_id])).toEqual([
      ["cyklop", "mroczna-polana"],
    ]);
    // 9.6 spends the card whatever comes of it.
    expect(after.holdings.some((h) => h.id === "s1")).toBe(false);
  });

  /**
   * The answer has to survive the wait.
   *
   * With somebody holding a Zwierciadło the cast hangs in the air for half a
   * minute, and what settles it later is a different call with a different
   * snapshot. The destination is the caster's and was given at the cast, so it
   * travels on the status — without it the spell settles silently, having asked
   * a question nobody is there to answer.
   */
  it("remembers where, across the window somebody could answer in", async () => {
    const t = table({
      seats: [
        aSeat({
          id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"),
          field_id: "krag-mocy", life: 2, sword_own: 3, magic_own: 3,
        }),
        aSeat({
          id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"),
          field_id: "kurhan", life: 3,
        }),
      ],
    });
    t.holdings.push(
      aHolding({ id: "s2", seat_id: "seat-b", card_id: "zwierciadlo", kind: "spell" }),
    );

    const spoken = await speak(t, { destination: "mroczna-polana" });
    const waiting = apply(t, spoken.writes);
    // Nothing has happened yet: the Karta is where it was.
    expect(waiting.fieldCards[0].field_id).toBe(HERE);

    const settled = await settleSpell(waiting, { force: true }, ports({ random: scriptedRandom([]) }));
    const after = apply(waiting, settled.writes);
    expect(after.fieldCards.map((row) => row.field_id)).toEqual(["mroczna-polana"]);
  });
});
