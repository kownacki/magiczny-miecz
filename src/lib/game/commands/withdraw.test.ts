import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import { removeCharacter, reviveCharacter } from "./withdraw";
import { aHolding, aSeat, aTable, aUser } from "../fixture";
import { apply } from "../change";
import { only } from "@/lib/engine/stack";

/**
 * The two things 4.4 does not have a word for.
 *
 * The rulebook removes a Postać exactly once — it dies — and never puts one
 * back, so both of these contradict it in words. They exist because a table has
 * states the rulebook does not: somebody leaves at eleven, a death is entered
 * against the wrong seat, a Postać is dealt to a chair nobody ever sat in. At a
 * real table you pick the figure up and put it in the box; in an app there is
 * no such gesture, and a referee you cannot correct is worse than none.
 */

const table = (
  seat: Parameters<typeof aSeat>[0] = {},
  over: { holdings?: ReturnType<typeof aHolding>[]; charactersOut?: string[]; active?: number } = {},
) =>
  aTable({
    game: {
      status: "playing",
      active_seat: over.active ?? 1,
      characters_out: over.charactersOut ?? [],
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, character_id: asSeatCharacter("goblin"), ...seat }),
      aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("mag") }),
    ],
    users: [
      aUser({ id: "usra", name: "Michał", seat_index: 0, is_host: true }),
      aUser({ id: "usrb", name: "Ola", seat_index: 1, is_host: false }),
    ],
    holdings: over.holdings ?? [],
  });

const console_ = { hard: false, byUser: null };

describe("wycofanie Postaci z gry", () => {
  it("empties the chair without taking it away", () => {
    /**
     * The seat is the chair, its player is still sitting in it, and the journal
     * holds `seat_id` references to everything that Postać ever did. What goes
     * is the figure standing in it.
     */
    const { writes, result } = removeCharacter(table(), { seatId: "seat-a", ...console_ });
    expect(writes.seatsRemoved).toBeUndefined();
    expect(writes.seats?.[0].patch).toMatchObject({
      character_id: null,
      field_id: null,
      sword_own: 0,
      magic_own: 0,
      eliminated: false,
      nature: null,
    });
    expect(result.characterId).toBe("goblin");
  });

  it("takes the kit out of the world and back onto the pile, leaving nothing behind", () => {
    /**
     * The whole of what separates a withdrawal from a death.
     *
     * 4.4 leaves a dead character's Przedmioty and Przyjaciele "na Obszarze, na
     * którym zginęła" — it fell there and dropped them. A withdrawn Postać did
     * not fall: it walked out of the realm and took its things with it, so
     * there is nothing on the ground for 12.1 to offer anybody.
     *
     * They still go back on the pile rather than out of the game, or the deck
     * would lose a Hełm every time somebody was withdrawn with nothing saying
     * so. The gold simply goes: there is no bank to return coins to, and this
     * game never counts them out of one.
     */
    const { writes, result } = removeCharacter(
      table(
        { field_id: asFieldId("osada"), gold: 2 },
        {
          holdings: [
            aHolding({ id: "h1", seat_id: "seat-a", card_id: "helm", kind: "item" }),
            aHolding({ id: "h2", seat_id: "seat-a", card_id: "wilk", kind: "friend" }),
          ],
        },
      ),
      { seatId: "seat-a", ...console_ },
    );
    expect(writes.fieldCards).toBeUndefined();
    expect(writes.holdings?.delete).toEqual(["h1", "h2"]);
    expect(result.returned).toEqual(["helm", "wilk"]);
    expect(writes.seats?.[0].patch.gold).toBe(0);
  });

  it("does not spill the Zaklęcia, which nobody ever saw (9.3)", () => {
    // A hand nobody saw appearing face up on a field is the one thing a
    // concealed hand must never do. They go back to the pile 4.4 sends them to.
    const { writes } = removeCharacter(
      table(
        { field_id: asFieldId("osada"), gold: 0 },
        {
          holdings: [
            aHolding({
              id: "h1",
              seat_id: "seat-a",
              card_id: "blyskawica",
              kind: "spell",
              face: "hidden",
            }),
          ],
        },
      ),
      { seatId: "seat-a", ...console_ },
    );
    expect(writes.fieldCards).toBeUndefined();
    expect(writes.holdings?.delete).toEqual(["h1"]);
  });

  it("has nothing to leave behind wherever the figure was standing", () => {
    const { writes } = removeCharacter(
      table(
        { field_id: null, gold: 3 },
        { holdings: [aHolding({ id: "h1", seat_id: "seat-a", card_id: "helm" })] },
      ),
      { seatId: "seat-a", ...console_ },
    );
    expect(writes.fieldCards).toBeUndefined();
  });

  it("puts the Karta back in the pool, which is the whole of what soft means", () => {
    const { writes } = removeCharacter(table({ eliminated: true }, { charactersOut: ["goblin"] }), {
      seatId: "seat-a",
      ...console_,
    });
    expect(writes.game?.characters_out).toEqual([]);
  });

  it("bars it for good when the line said `hard`", () => {
    const { writes } = removeCharacter(table(), { seatId: "seat-a", hard: true, byUser: null });
    expect(writes.game?.characters_out).toEqual(["goblin"]);
  });

  it("does not list the same Karta twice", () => {
    const { writes } = removeCharacter(table({ eliminated: true }, { charactersOut: ["goblin"] }), {
      seatId: "seat-a",
      hard: true,
      byUser: null,
    });
    expect(writes.game).toBeUndefined();
  });

  it("moves the turn on when the chair being emptied was the one to play", () => {
    const { writes } = removeCharacter(table({}, { active: 0 }), {
      seatId: "seat-a",
      ...console_,
    });
    expect(writes.game).toMatchObject({ active_seat: 1 });
  });

  it("writes it down as the override it is", () => {
    // Every one of these is a break in the rules, whoever did it, and the
    // journal is what an argument two hours later is settled from.
    const { writes } = removeCharacter(table(), { seatId: "seat-a", ...console_ });
    expect(writes.journal?.[0]).toMatchObject({
      seatId: "seat-a",
      kind: "override",
      manual: true,
      payload: { what: "remove", character: "goblin", hard: false },
    });
  });

  describe("who may", () => {
    it("is the host, for a Postać that is still playing", () => {
      // The rulebook says nothing about withdrawing a living Postać, so nothing
      // is being overruled — but it is somebody else's figure.
      expect(() =>
        removeCharacter(table(), { seatId: "seat-a", hard: false, byUser: "usrb" }),
      ).toThrow("Tylko gospodarz");
      expect(
        removeCharacter(table(), { seatId: "seat-a", hard: false, byUser: "usra" }).result
          .characterId,
      ).toBe("goblin");
    });

    it("is the console alone, for one that is dead", () => {
      /**
       * That is putting a Karta back that 4.4 explicitly set aside — "jej Kartę
       * odłożyć do pozostałych nie biorących udziału w grze" — so it is not a
       * thing a host does from a button.
       */
      expect(() =>
        removeCharacter(table({ eliminated: true }), {
          seatId: "seat-a",
          hard: false,
          byUser: "usra",
        }),
      ).toThrow("już nie żyje");
      expect(
        removeCharacter(table({ eliminated: true }), { seatId: "seat-a", ...console_ }).result
          .characterId,
      ).toBe("goblin");
    });

    it("refuses a chair with nothing standing in it", () => {
      expect(() =>
        removeCharacter(table({ character_id: null }), { seatId: "seat-a", ...console_ }),
      ).toThrow("nie ma Postaci");
    });
  });
});

describe("przywrócenie Postaci (konsola)", () => {
  const dead = (over: Parameters<typeof aSeat>[0] = {}) =>
    table({ eliminated: true, life: 0, sword_own: 5, turns_lost: 2, ...over }, {
      charactersOut: ["goblin"],
    });

  it("stands it up where it fell, on its own points and its starting Życie", () => {
    /**
     * Not a fresh deal: the one thing worth keeping about an undone death is
     * where the figure was standing. Own points come back to the floor 1.3 and
     * 2.3 put under them, which is what the card was printed with.
     */
    const { writes, result } = reviveCharacter(dead(), { seatId: "seat-a" });
    expect(result).toBe("goblin");
    expect(writes.seats?.[0].patch).toEqual({
      eliminated: false,
      life: 4,
      sword_own: 2,
      magic_own: 1,
      turns_lost: 0,
      stone_until_round: null,
    });
    // Where it fell: the Obszar is not in the patch at all.
    expect(writes.seats?.[0].patch).not.toHaveProperty("field_id");
  });

  it("takes the Karta off the list death put it on", () => {
    const before = dead();
    const after = apply(before, reviveCharacter(before, { seatId: "seat-a" }).writes);
    expect(after.game.characters_out).toEqual([]);
  });

  it("brings nothing back that was left on the field (12.1)", () => {
    // The Przedmioty are lying where it fell and may have been picked up two
    // turns ago; the Zaklęcia went back to the pile and have been reshuffled.
    const { writes } = reviveCharacter(dead(), { seatId: "seat-a" });
    expect(writes.holdings).toBeUndefined();
    expect(writes.fieldCards).toBeUndefined();
  });

  it("refuses a Postać that is alive", () => {
    expect(() => reviveCharacter(table(), { seatId: "seat-a" })).toThrow("żyje");
  });

  /**
   * A table with nobody in it to play is what the last death leaves behind:
   * `passTurn` looks round, finds no living seat and sets `active_seat` to
   * null. Standing a Postać up in a game where no turn can be taken is not
   * standing it up.
   */
  it("starts the table again when the pass had found nobody", () => {
    const stopped = aTable({
      game: { status: "playing", active_seat: null, characters_out: ["goblin"] },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, character_id: asSeatCharacter("goblin"), eliminated: true }),
      ],
    });
    const { writes } = reviveCharacter(stopped, { seatId: "seat-a" });
    expect(writes.game).toMatchObject({ active_seat: 0, turn_state: only({ phase: "roll" }) });
    // And the Karta is still taken off the out list, which shares the column.
    expect(writes.game?.characters_out).toEqual([]);
  });

  it("leaves the turn where it is when somebody is playing", () => {
    const { writes } = reviveCharacter(dead(), { seatId: "seat-a" });
    expect(writes.game?.active_seat).toBeUndefined();
  });

  it("writes it down as the override it is", () => {
    const { writes } = reviveCharacter(dead(), { seatId: "seat-a" });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "override",
      manual: true,
      payload: { what: "revive", character: "goblin" },
    });
  });
});
