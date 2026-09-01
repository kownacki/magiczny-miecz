import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { scriptedRandom } from "@/lib/engine/ports";
import { top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { EVENT_COPIES } from "../decks";
import { aHolding, aSeat, aTable, at as driving, aUser, ports, rolling } from "../fixture";
import { apply, type Snapshot } from "../change";
import { drawCard } from "./draw";
import { beginFight, fightRoll } from "./fight";
import { resolveFight } from "./spoils";
import { castSpell } from "./spells";
import { claimFloor } from "./spellFloor";
import { resolveDrawnCard } from "./effects";
import { moveTo, rollForMove } from "./movement";
import { finishTurn } from "./turn";

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
      round: 3,
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
      /**
       * Three Obszary widdershins of the Płaskowyż, for the same reason Ania
       * is four: moment 10 is a real walk. She was on Uroczysko, which is in
       * the Dolny Krąg and cannot reach a Środkowy Obszar at all.
       */
      aSeat({
        id: "seat-c",
        seat_index: 2,
        character_id: "elf",
        nature: "evil",
        field_id: asFieldId("wieza-przeznaczenia"),
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
  const play = driving(theTable());
  await play.run(rollForMove, {}, rolling(4));
  await play.run(moveTo, { destination: "plaskowyz-mgiel" });
  for (let n = 0; n < 3; n++) {
    await play.run(drawCard, { named: null, shuffle: asIs });
  }
  return play.snapshot;
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

  /**
   * 7 and 8, run together, because under the narrowing Michał took on law 4
   * they are one commit rather than two frames.
   *
   * The page asked for `[field, loop, fight, cast(B), ask(A)]` — four deep, with
   * a frame asking Ania whether she wants to use a Władca Zaklęć. That `ask` is
   * the thing the spell floor was designed not to do: naming who might answer
   * announces who is holding one, every fight, which is 9.3. So the cast stays
   * the `spoken` status it already was, anybody may answer it by casting, and
   * what step 3 built is the half no card could do — a Zaklęcie that reaches
   * *down* and ends the fight beneath it. See "Law 4" in docs/STACK.md.
   *
   * What the moments actually assert is unchanged: Bartek speaks into somebody
   * else's fight, and the Smok's attempt ends with the heads regrown.
   */
  it("7-8. Bartek's Krąg Płomieni stops the head, and the loop goes with it (laws 3, 4, 5)", async () => {
    const drawn = await throughTheDraw();
    let at = apply(drawn, beginFight(drawn, { cardIds: [SMOK] }).writes);
    at = await head(at, 6, 1);
    expect(phases(at.game.turn_state)).toEqual(["field", "loop", "fight"]);
    expect(at.game.turn_state.stack[1]).toMatchObject({ done: 1 });

    // 17.3: the floor is claimed and not polled — which is the whole reason
    // there is no `ask(A)` frame above this.
    at = apply(at, claimFloor(at, { seatId: "seat-b" }, ports()).writes);
    const cast = await castSpell(
      at,
      { seatId: "seat-b", holdingId: "h-krag", target: { foeInFight: true }, shuffle: asIs },
      ports(),
    );
    at = apply(at, cast.writes);

    expect(phases(at.game.turn_state)).toEqual(["field"]);
    const field = fieldOn(at.game.turn_state);
    // Fought (17.4), still lying on the Obszar for whoever comes next (16.8),
    // and with nothing cut: no trophy, no point of Życie, and the loop gone.
    expect(field.fought).toEqual([SMOK]);
    expect(field.drawn.map((one) => one.cardId)).toContain(SMOK);
    expect(at.holdings.filter((one) => one.seat_id === "seat-a")).toHaveLength(0);
    expect(at.seats[0].life).toBe(drawn.seats[0].life);
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

  /**
   * The turn Ania actually played, ended, and handed on twice — the whole of
   * moments 1 to 9 and then some, which is what moment 10 needs standing
   * behind it. `finishTurn` refuses while the Smok's attempt is still open
   * (17.4), so the Krąg of moments 7-8 is what lets the turn close at all.
   */
  async function untilCelinaArrives() {
    const play = driving(await throughTheDraw());
    // Moment 3: Bartek's Odmiana Losu swaps the Ścieżka out for the Koszmar,
    // which is the Karta moment 10 turns on.
    await play.run(castSpell, { seatId: "seat-b", holdingId: "h-odmiana", shuffle: asIs });
    await play.run(resolveDrawnCard, { cardId: KOSZMAR, shuffle: asIs });
    await play.run(beginFight, { cardIds: [SMOK] });
    const dice = rolling(6, 1, 1, 1, 1, 1);
    await play.run(fightRoll, { side: "player" }, dice);
    await play.run(fightRoll, { side: "enemy" }, dice);
    await play.run(resolveFight, undefined as never, dice);
    await play.run(claimFloor, { seatId: "seat-b" });
    await play.run(castSpell, {
      seatId: "seat-b",
      holdingId: "h-krag",
      target: { foeInFight: true },
      shuffle: asIs,
    });
    // Ania's turn ends; Bartek's passes; Celina walks three Obszary onto the
    // Płaskowyż the three Karty are lying on.
    await play.run(finishTurn);
    await play.run(finishTurn);
    await play.run(rollForMove, {}, rolling(3));
    await play.run(moveTo, { destination: "plaskowyz-mgiel" });
    return play;
  }

  it("10. Celina arrives and draws zero — the Karty are already lying there (15.1)", async () => {
    const play = await untilCelinaArrives();

    expect(play.snapshot.game.active_seat).toBe(2);
    const field = play.frame("field");
    // 15.1 draws on arrival; these Karty were drawn by Ania and left face up
    // (16.8), so there is nothing to draw and everything to deal with.
    expect(field.draw).toBe(0);
    expect(field.drawn.map((one) => one.cardId)).toEqual([SMOK, KOSZMAR, GROTA]);
  });

  it("10. Koszmar grants the Zła Postać her wish, and the teleport is a cut (laws 2, 5)", async () => {
    const play = await untilCelinaArrives();

    /**
     * „Jeżeli jesteś Złą Postacią, spełni jedno z twoich życzeń" — Celina is,
     * and the sixth wish is „przeniesienie w tym Kręgu". The choice and the
     * Obszar travel together in one commit, which is the batching docs/STACK.md
     * kept: an own `wybor` the player can answer up front never needs a frame.
     */
    await play.run(resolveDrawnCard, {
      cardId: KOSZMAR,
      decided: { choices: [5], destination: "las-blednych-ogni" },
      shuffle: asIs,
    });

    // Law 2: what was above the field frame is abandoned, not queued, and a
    // fresh field opens at the destination — "tak, jakby jego ruch zakończył
    // się" there. `draw: 0`, because 15.1 makes drawing a consequence of
    // arriving and she did not walk here.
    expect(play.phases).toEqual(["field"]);
    const landed = play.frame("field");
    expect(landed.fieldId).toBe("las-blednych-ogni");
    expect(landed.draw).toBe(0);
    expect(landed.drawn).toEqual([]);
    expect(play.snapshot.seats[2].field_id).toBe("las-blednych-ogni");
  });

  /**
   * The last assertion docs/STACK.md makes about moment 10, and the one the
   * scenario was written before the code to catch.
   *
   * 15.2's worked example is explicit — Obbol is moved off the Płaskowyż by the
   * Zaklęta Ścieżka, does *not* fight the Niedźwiedź and does *not* take the
   * gold, and they "stay face up for the next character". They did not: arriving
   * lifts every Karta lying on an Obszar into the turn's frame and deletes the
   * `fieldCards` rows, and the cut then threw that frame away, so the Smok and
   * the Grota left the game altogether.
   */
  it("10. the Smok and the Grota stay on the Płaskowyż for whoever comes next (15.2, 16.8)", async () => {
    const play = await untilCelinaArrives();
    await play.run(resolveDrawnCard, {
      cardId: KOSZMAR,
      decided: { choices: [5], destination: "las-blednych-ogni" },
      shuffle: asIs,
    });

    const left = play.snapshot.fieldCards
      .filter((one) => one.field_id === "plaskowyz-mgiel")
      .map((one) => one.card_id);
    // The Smok unfought and the Grota beside him, which is the sentence
    // docs/STACK.md has always ended moment 10 with.
    expect(left).toContain(SMOK);
    expect(left).toContain(GROTA);

    /**
     * And exactly what an ordinary turn ending here would have left, which is
     * the property worth pinning rather than the list.
     *
     * `leaveCardsBehind` is one door and both walk through it, so a Karta whose
     * own text sends it to the pile goes there either way and a Karta that waits
     * stays either way. The Koszmar waits — his disposition is `do-pierwszej`,
     * "czeka tu na pierwszą Postać" — so he is still lying there, exactly as he
     * is when a turn simply ends on this Obszar.
     */
    expect(left.sort()).toEqual([GROTA, KOSZMAR, SMOK].sort());
  });

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
  const dice = rolling(mine, its, 1, 1, 1, 1);
  const play = driving(table);
  await play.run(fightRoll, { side: "player" }, dice);
  await play.run(fightRoll, { side: "enemy" }, dice);
  await play.run(resolveFight, undefined as never, dice);
  return play.snapshot;
}
