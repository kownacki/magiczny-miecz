import { only } from "@/lib/engine/stack";
import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { buildDeck } from "@/lib/engine/deck";
import { resolveDrawnCard } from "./resolving";
import { attackSeat } from "./fight";
import { storedStatuses } from "./turn";
import { hasAttacked, movementCap } from "@/lib/engine/status";
import { asSeatCharacter } from "@/lib/engine/characters";
import { SPELLS as SPELL_CARDS } from "../decks";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * The last three Nieznajomi, and what each was waiting on.
 *
 * The Sztukmistrz sells a Zaklęcie and `kup` sells Wyposażenie, so the price
 * had to ride on the draw. The Eremita hands over one of two finite Karty,
 * which needed `otrzymaj` to exist. And the Dobre Bóstwo asks what you did
 * earlier in the game, which nothing had ever recorded.
 */

const asIs = <T,>(items: readonly T[]): T[] => [...items];

/** A pile with something in it, since the fixture's is empty by design. */
const someSpells = () => ({
  events: buildDeck([], asIs),
  spells: buildDeck(
    (SPELL_CARDS as { source: { index: number } }[])
      .slice(0, 5)
      .map((c) => `zaklecia#${c.source.index}`),
    asIs,
  ),
});

const meeting = (card: string, gold: number, magic = 4) =>
  aTable({
    game: {
      active_seat: 0,
      deck: someSpells() as never,
      turn_state: {
        phase: "field", fieldId: "wrzosowiska", from: null, draw: 0,
        drawn: [{ cardId: card, cardClass: "stranger" }], resolved: [],
      } as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a", seat_index: 0, character_id: asSeatCharacter("czarodziej"),
        field_id: "wrzosowiska", gold, magic_own: magic,
      }),
      aSeat({
        id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"),
        field_id: "wrzosowiska",
      }),
    ],
  });

const visit = async (
  table: ReturnType<typeof meeting>,
  card: string,
  choices: number[] = [],
  dice: number[] = [],
) => {
  const out = await resolveDrawnCard(
    table,
    { cardId: card, decided: { choices }, shuffle: asIs },
    ports({ random: scriptedRandom(dice) }),
  );
  return { after: apply(table, out.writes), said: out.result.did.join("; ") };
};

/**
 * All three of these now ask before they act — „Pomiń" is one of their answers
 * — so a visit that means "yes" picks option 0. The Czarodziej's question is
 * inside his `gdy`, which is why his choice comes after the branch rather than
 * before it: the walk spends the pick where `applyEffect` reaches it.
 */
describe("the Sztukmistrz, who sells Zaklęcia", () => {
  /** "kupić u niego 1 Zaklęcie za 1 Sztukę Złota" */
  it("takes the coin and hands over the card", async () => {
    const { after, said } = await visit(meeting("sztukmistrz", 3), "sztukmistrz", [0]);
    expect(after.seats[0].gold).toBe(2);
    expect(after.holdings.filter((h) => h.kind === "spell")).toHaveLength(1);
    expect(said).toMatch(/za 1 Sz\. Z\./);
  });

  it("refuses an empty purse before touching the pile", async () => {
    const { after, said } = await visit(meeting("sztukmistrz", 0), "sztukmistrz", [0]);
    expect(after.holdings).toHaveLength(0);
    expect(said).toMatch(/Za mało złota/);
  });

  /**
   * The order that matters: 2.6 caps the hand by Magia, and a Postać who may
   * hold no Zaklęcia must not pay to be told so.
   */
  it("charges nothing when the Magia allows no Zaklęcia (2.6)", async () => {
    const { after, said } = await visit(meeting("sztukmistrz", 3, 0), "sztukmistrz", [0]);
    expect(after.seats[0].gold).toBe(3);
    expect(said).toMatch(/2\.6/);
  });
});

describe("the Dobre Bóstwo, which judges what you did", () => {
  /** 13.3 leaves the mark; this is the only card that reads it. */
  it("finds nothing against a character who has attacked nobody", async () => {
    const { after, said } = await visit(meeting("dobre-bostwo", 3), "dobre-bostwo");
    expect(after.seats[0].gold).toBe(3);
    expect(said).toMatch(/nic się nie dzieje/);
  });

  const guilty = () => {
    const table = meeting("dobre-bostwo", 3);
    const duelling = apply(table, {
      game: {
        turn_state: only({
          phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [], resolved: [],
        } as TurnPhase),
      },
    });
    // Only the mark, not the fight the attack also opens.
    return apply(table, {
      effects: attackSeat(duelling, { targetSeatId: "seat-b" }).writes.effects,
    });
  };

  it("marks whoever raised a hand, at the moment of attacking", () => {
    expect(hasAttacked(storedStatuses(guilty(), "seat-a"))).toBe(true);
  });

  /** "musisz złożyć w ofierze 1 Sz.Z. Jeśli nie chcesz będziesz uwięziony..." */
  it("takes the offering from a guilty character who pays", async () => {
    const { after } = await visit(guilty(), "dobre-bostwo", [0]);
    expect(after.seats[0].gold).toBe(2);
  });

  /**
   * Refusing is a real answer and costs a turn's walking rather than a turn:
   * "uwięziony na tym Obszarze" pins you where you stand, it does not skip you.
   */
  it("pins a guilty character who refuses, and keeps their gold", async () => {
    const { after } = await visit(guilty(), "dobre-bostwo", [1]);
    expect(after.seats[0].gold).toBe(3);
    expect(movementCap(storedStatuses(after, "seat-a"))).toBe(0);
  });
});

describe("the Eremita, who was waiting on `otrzymaj`", () => {
  /**
   * "Pierwszej Postaci, Eremita ofiaruje do wyboru: Magiczny Miecz lub Tarczę
   * Tolimana (jeśli jeszcze są)." The parenthesis is 21.2's stock, which
   * `takeCard` counts — which is why the note about it could go.
   */
  it("hands over whichever of the two was chosen", async () => {
    const { after } = await visit(meeting("eremita", 0), "eremita", [0], [1]);
    expect(after.holdings.map((h) => h.card_id)).toContain("magiczny-miecz");

    const other = await visit(meeting("eremita", 0), "eremita", [1], [1]);
    expect(other.after.holdings.map((h) => h.card_id)).toContain("tarcza-tolimana");
  });
});

/**
 * „Może zamienić twoje punkty Miecza na punkty Magii lub odwrotnie" — not a
 * swap. One parameter takes the other's value and the other stands, which is
 * what makes „lub odwrotnie" two different offers rather than one said twice.
 */
describe("the Kuglarz, who reads one parameter off the other", () => {
  const juggler = (sword: number, magic: number) =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "osada",
          from: null,
          draw: 0,
          drawn: [{ cardId: "kuglarz", cardClass: "stranger" as const }],
          resolved: [],
        } as TurnPhase,
      },
      seats: [
        aSeat({
          id: "seat-a",
          character_id: asSeatCharacter("awanturnik"),
          field_id: "osada",
          sword_own: sword,
          magic_own: magic,
          sword_floor: 2,
          magic_floor: 2,
        }),
      ],
    });

  it("gives the Miecz the Magia's value and leaves the Magia", async () => {
    const { after } = await visit(juggler(3, 9), "kuglarz", [0]);
    expect(after.seats[0].sword_own).toBe(9);
    expect(after.seats[0].magic_own).toBe(9);
  });

  it("does the other one the other way", async () => {
    const { after } = await visit(juggler(3, 9), "kuglarz", [1]);
    expect(after.seats[0].magic_own).toBe(3);
    expect(after.seats[0].sword_own).toBe(3);
  });

  /** Through `adjustSeat`, so the floor and the journal line come with it. */
  it("writes a points line and stops at the floor (1.3, 2.3)", async () => {
    const out = await resolveDrawnCard(
      juggler(9, 3),
      { cardId: "kuglarz", decided: { choices: [0] }, shuffle: asIs },
      ports(),
    );
    // Miecz would take the Magia's 3, which is above the floor of 2.
    expect(out.writes.journal?.some((line) => line.kind === "points")).toBe(true);
  });

  it("does nothing, loudly, when the value is already there", async () => {
    const { after, said } = await visit(juggler(5, 5), "kuglarz", [0]);
    expect(after.seats[0].sword_own).toBe(5);
    expect(said).toMatch(/bez zmian/);
  });
});
