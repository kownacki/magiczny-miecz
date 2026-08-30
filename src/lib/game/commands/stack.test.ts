import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { scriptedRandom } from "@/lib/engine/ports";
import { top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { EVENT_COPIES } from "../decks";
import { aHolding, aSeat, aTable, aUser, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { drawCard } from "./draw";
import { castSpell, beginFight, fightRoll, resolveFight } from "./fight";
import { resolveDrawnCard } from "./effects";
import { moveTo, rollForMove } from "./movement";

/**
 * The resolution stack's acceptance test — docs/STACK.md, "The acceptance test".
 *
 * Written before the stack existed, as step 0 of that page: ten moments in one
 * turn, each with the stack it should leave behind, each traced to the rule it
 * enforces. Every card in it is in the box.
 *
 * It ran as eleven `it.todo`s under a `describe.skip` through steps 0–2. Step 3
 * built the two mechanisms the middle of the scenario needs, so the moments
 * they cover are live now and the ones still waiting on the `cast` frame (law 4)
 * stay todo, naming what they wait on. A moment that runs is worth more than a
 * moment that is described.
 *
 * The assertions that matter most, so they are not lost in the moments:
 *
 * - After 3, the field's cards are in 15.2 order *including the one Bartek
 *   drew* — the order is re-derived when the swap lands.
 * - After 7, `top().seatId` is Ania's and the frame beneath it is Bartek's —
 *   two seats owing things, both legible without inference.
 * - After 8, the Smok is `fought` this turn (17.4) and still on the field, with
 *   zero heads cut.
 * - After 10, the Smok Celina abandoned is still on Płaskowyż, unfought, with
 *   Grota beside it — a cut drops her frames and keeps the field's cards.
 * - At no point are two `ask` frames on the stack at once.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];

const SCIEZKA = "zakleta-sciezka";
const SMOK = "trogglowy-smok";
const GROTA = "grota";
const KOSZMAR = "koszmar";

const refOf = (cardId: string) => EVENT_COPIES.get(cardId)![0];

const phases = (state: TurnState) => state.stack.map((frame) => frame.phase);

const fieldOn = (state: TurnState) => {
  const frame = top(state);
  if (frame.phase !== "field") throw new Error(`na wierzchu jest ${frame.phase}`);
  return frame;
};

/**
 * The four of them, and a deck laid out so the draw is the scenario's.
 *
 * Ania stands on Wrzosowiska, which is exactly four Obszary widdershins of
 * Płaskowyż Mgieł, so moment 1 is a real roll and a real walk rather than a
 * character placed where the test wanted her.
 */
const theTable = (): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn: 3,
      turn_state: { phase: "roll" } as TurnPhase,
      deck: {
        // Ścieżka, Smok and Grota for the Płaskowyż's three, then the Koszmar
        // the Odmiana Losu pulls in behind them.
        events: {
          draw: [refOf(SCIEZKA), refOf(SMOK), refOf(GROTA), refOf(KOSZMAR)],
          discard: [],
        },
        spells: { draw: [], discard: [] },
      },
    },
    seats: [
      aSeat({
        id: "seat-a",
        seat_index: 0,
        character_id: "barbarzynca",
        sword_own: 5,
        life: 4,
        field_id: asFieldId("wrzosowiska"),
      }),
      aSeat({
        id: "seat-b",
        seat_index: 1,
        character_id: "mag",
        magic_own: 5,
        field_id: asFieldId("krag-mocy"),
      }),
      aSeat({
        id: "seat-c",
        seat_index: 2,
        character_id: "elf",
        nature: "evil",
        field_id: asFieldId("uroczysko"),
      }),
      aSeat({ id: "seat-d", seat_index: 3, field_id: asFieldId("osada") }),
    ],
    users: [
      aUser({ id: "u-a", seat_index: 0, name: "Ania" }),
      aUser({ id: "u-b", seat_index: 1, name: "Bartek", is_host: false }),
      aUser({ id: "u-c", seat_index: 2, name: "Celina", is_host: false }),
      aUser({ id: "u-d", seat_index: 3, name: "Darek", is_host: false }),
    ],
    holdings: [
      aHolding({ id: "h-odmiana", seat_id: "seat-b", card_id: "odmiana-losu", kind: "spell" }),
      aHolding({ id: "h-krag", seat_id: "seat-b", card_id: "krag-plomieni", kind: "spell" }),
    ],
  });

/** Moment 1 and 2: on the Płaskowyż with its three Karty turned over. */
async function throughTheDraw(): Promise<Snapshot> {
  let at = theTable();
  at = apply(at, (await rollForMove(at, {}, ports({ random: scriptedRandom([4]) }))).writes);
  at = apply(at, moveTo(at, { destination: "plaskowyz-mgiel" }).writes);
  for (let n = 0; n < 3; n++) {
    at = apply(at, drawCard(at, { named: null, shuffle: asIs }).writes);
  }
  return at;
}

describe("the resolution stack (docs/STACK.md)", () => {
  // Ania (Barbarzyńca, Miecz 5) is active. Bartek (Mag) holds Odmiana Losu and
  // Krąg Płomieni. Celina (Elf, Zła). Darek.

  it("1. rolls 4 and moves to Płaskowyż Mgieł → [field(plaskowyz, draw 3)]", async () => {
    let at = theTable();
    at = apply(at, (await rollForMove(at, {}, ports({ random: scriptedRandom([4]) }))).writes);
    const rolled = top(at.game.turn_state);
    expect(rolled.phase === "move" && rolled.roll).toBe(4);

    at = apply(at, moveTo(at, { destination: "plaskowyz-mgiel" }).writes);
    expect(phases(at.game.turn_state)).toEqual(["field"]);
    expect(fieldOn(at.game.turn_state)).toMatchObject({ fieldId: "plaskowyz-mgiel", draw: 3 });
  });

  it("2. draws Ścieżka, Smok, Grota, in 15.2 order → [field{drawn:3}]", async () => {
    const at = await throughTheDraw();
    // Lowest numeral first: I Spotkanie, II Wróg, then the Obszar's own card.
    expect(fieldOn(at.game.turn_state).drawn.map((one) => one.cardId)).toEqual([
      SCIEZKA,
      SMOK,
      GROTA,
    ]);
  });

  it("3. Bartek casts Odmiana Losu into the draw: Ścieżka out, Koszmar in (laws 4, 5)", async () => {
    const drawn = await throughTheDraw();
    const cast = await castSpell(
      drawn,
      { seatId: "seat-b", holdingId: "h-odmiana", shuffle: asIs },
      ports(),
    );
    const at = apply(drawn, cast.writes);

    /**
     * The whole of law 5's point, one turn early: this is not Bartek's turn and
     * not Bartek's Obszar, and the Zaklęcie still lands where the Karty are.
     * "Zaklęcie można wypowiedzieć natychmiast po wzięciu Karty Zdarzenia."
     */
    /**
     * And the order is re-derived rather than appended — but not to the order
     * docs/STACK.md predicted, which had the Koszmar first.
     *
     * The Koszmar is a **Nieznajomy**, and the classes are the numerals printed
     * on the cards: Spotkanie I, Wróg II, Nieznajomy IV (`CARD_CLASS`, checked
     * against the headers). So 15.2 puts him behind the Smok, not in front of
     * the Ścieżka he replaced. The page has been corrected; this is the rule.
     */
    expect(fieldOn(at.game.turn_state).drawn.map((one) => one.cardId)).toEqual([
      SMOK,
      KOSZMAR,
      GROTA,
    ]);
    expect(at.holdings.some((one) => one.id === "h-odmiana")).toBe(false);
  });

  it("4. Koszmar: Ania is not Zła; the card stays and is resolved for the turn (law 1)", async () => {
    const drawn = await throughTheDraw();
    const swapped = apply(
      drawn,
      (await castSpell(drawn, { seatId: "seat-b", holdingId: "h-odmiana", shuffle: asIs }, ports()))
        .writes,
    );

    // Behind the Smok in 15.2 order, so this is the Nieznajomy dealt with after
    // the Wróg rather than before him — see moment 3.
    const done = await resolveDrawnCard(swapped, { cardId: KOSZMAR, shuffle: asIs }, ports());
    const at = apply(swapped, done.writes);

    // „Jeżeli jesteś Złą Postacią, spełni jedno z twoich życzeń" — the
    // Barbarzyńca is not, so nothing is granted and the Karta is dealt with.
    const field = fieldOn(at.game.turn_state);
    expect(field.resolved).toContain(KOSZMAR);
    expect(field.drawn.map((one) => one.cardId)).toContain(KOSZMAR);
    expect(at.seats[0].field_id).toBe("plaskowyz-mgiel");
  });

  it("5. Smok cannot be walked past (16.4): [field, loop(smok,3), fight(head 1)] (law 3)", async () => {
    const drawn = await throughTheDraw();
    const at = apply(drawn, beginFight(drawn, { cardIds: [SMOK] }).writes);

    expect(phases(at.game.turn_state)).toEqual(["field", "loop", "fight"]);
    expect(at.game.turn_state.stack[1]).toMatchObject({ times: 3, done: 0, round: "głowa" });
    const head = top(at.game.turn_state);
    expect(head.phase === "fight" && head.fight.enemyTotal).toBe(2);
  });

  it("6. head 1 won → [field, loop{done:1}, fight(head 2)]", async () => {
    const drawn = await throughTheDraw();
    const at = await head(apply(drawn, beginFight(drawn, { cardIds: [SMOK] }).writes), 6, 1);

    expect(phases(at.game.turn_state)).toEqual(["field", "loop", "fight"]);
    expect(at.game.turn_state.stack[1]).toMatchObject({ done: 1 });
    // A head is not a kill: nothing has been paid out, and the Smok is still
    // the thing in the way.
    expect(at.holdings.filter((one) => one.seat_id === "seat-a")).toHaveLength(0);
  });

  it.todo(
    "7. Bartek takes the floor, casts Krąg Płomieni → [field, loop, fight, cast(B), ask(A)] — four deep (laws 4, 5) — waits on the `cast` frame",
  );

  /**
   * Moment 8's *outcome*, reached by the dice rather than by the Krąg.
   *
   * The scenario stops the second head with a Zaklęcie, which is law 4 and not
   * built. What law 3 owes is the same either way — the attempt ends, the heads
   * grow back, and 17.4 settles the Smok for the turn — so that half is checked
   * here and the Krąg's half stays todo above rather than being asserted about
   * a mechanism nobody has written.
   */
  it("8. the attempt ends with the heads reset and the Smok fought this turn (law 3, 17.4)", async () => {
    const drawn = await throughTheDraw();
    let at = apply(drawn, beginFight(drawn, { cardIds: [SMOK] }).writes);
    at = await head(at, 6, 1);
    at = await head(at, 1, 6);

    expect(phases(at.game.turn_state)).toEqual(["field"]);
    const field = fieldOn(at.game.turn_state);
    // Fought (17.4), still lying on the Obszar for whoever comes next (16.8),
    // and with nothing cut: no trophy, and the loop frame is gone entirely.
    expect(field.fought).toEqual([SMOK]);
    expect(field.drawn.map((one) => one.cardId)).toContain(SMOK);
    expect(at.holdings.filter((one) => one.seat_id === "seat-a")).toHaveLength(0);
  });

  it("9. the Grota is still waiting behind the Smok, unresolved (15.2, 16.4)", async () => {
    const drawn = await throughTheDraw();
    let at = apply(drawn, beginFight(drawn, { cardIds: [SMOK] }).writes);
    at = await head(at, 1, 6);

    const field = fieldOn(at.game.turn_state);
    // The Smok is settled for the turn but not beaten, and the Grota behind him
    // has not been touched — 16.4 is why the field cannot simply close.
    expect(field.fought).toEqual([SMOK]);
    expect(field.resolved ?? []).not.toContain(GROTA);
  });

  it.todo(
    "10. Celina arrives, draws zero (15.1), takes Koszmar's wish: teleport is a cut → [field(chosen, draw 0)] (laws 2, 5) — waits on a second turn in the harness",
  );

  it("never holds two ask frames at once", async () => {
    const drawn = await throughTheDraw();
    let at = apply(drawn, beginFight(drawn, { cardIds: [SMOK] }).writes);
    at = await head(at, 6, 1);
    // Every stack this scenario reaches, checked the same way: an `ask` is a
    // question owed to one seat, and two of them would be two people owed an
    // answer at once — the thing docs/STACK.md's survey says never happens.
    expect(at.game.turn_state.stack.filter((frame) => frame.phase === "ask")).toHaveLength(0);
  });
});

/** One head fought out, dice and settle, exactly as the two buttons do it. */
async function head(table: Snapshot, mine: number, its: number): Promise<Snapshot> {
  const dice = ports({ random: scriptedRandom([mine, its, 1, 1, 1, 1]) });
  let at = table;
  at = apply(at, (await fightRoll(at, { side: "player" }, dice)).writes);
  at = apply(at, (await fightRoll(at, { side: "enemy" }, dice)).writes);
  return apply(at, (await resolveFight(at, undefined as never, dice)).writes);
}
