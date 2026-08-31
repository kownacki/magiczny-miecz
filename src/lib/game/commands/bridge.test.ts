import { describe, expect, it } from "vitest";
import { BRIDGE_ENTRANCES } from "@/lib/engine/board";
import { CROSSINGS } from "@/lib/engine/rings";
import { recordGuardianStrength, startGuardianFight, type TurnPhase } from "@/lib/engine/turn";
import { top } from "@/lib/engine/stack";
import { scriptedRandom } from "@/lib/engine/ports";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import {
  crossRing,
  enterBridge,
  fightGuardian,
  payFerry,
  resolveBridgeOrdeal,
  rollGuardianStrength,
  settleBridge,
  settleCrossing,
} from "./bridge";
import { EVENT_COPIES } from "../decks";

/** The board's own two entrances, read off `board.ts` rather than written out. */
const RUINY = BRIDGE_ENTRANCES.find((e) => e.from === "ruiny-twierdzy")!;
const MIASTO = BRIDGE_ENTRANCES.find((e) => e.from === "wymarle-miasto")!;

/** The four crossings, likewise: two defended, two free coming back (11.3, 11.7). */
const TRZESAWISKA = CROSSINGS.find((c) => c.from === "uroczysko")!;
const TRZESAWISKA_BACK = CROSSINGS.find((c) => c.from === "las-blednych-ogni")!;
const LODOWY_LAS = CROSSINGS.find((c) => c.from === "przelecz-wichrow")!;

const dice = (...results: number[]) => ports({ random: scriptedRandom(results) });

/* --------------------------------------------------------------------------
 * The two doorways the fight cluster shares.
 * ----------------------------------------------------------------------- */

describe("wejście na Most (11.9-11.11)", () => {
  const standing = (over: Parameters<typeof aSeat>[0] = {}) =>
    aTable({
      game: { round: 3, turn_state: { phase: "bridge", bridge: RUINY } },
      seats: [aSeat({ field_id: "ruiny-twierdzy", ...over })],
    });

  it("puts the character on the entrance and ends the turn there (11.10)", () => {
    const { writes, result } = settleBridge(standing(), RUINY, "wygrana");
    expect(result).toEqual({ at: "wejscie-na-most-a" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { field_id: "wejscie-na-most-a" } }]);
    expect(top(writes.game!.turn_state!)).toEqual({ phase: "end" });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bridge-entry",
      payload: { from: "ruiny-twierdzy", guardian: RUINY.guardian },
    });
  });

  it("takes the point and bars the next turn on a loss (11.11)", () => {
    const { writes, result } = settleBridge(standing({ sword_own: 5 }), RUINY, "przegrana");
    expect(result).toEqual({ at: null });
    expect(writes.seats).toEqual([
      { id: "seat-a", patch: { bridge_blocked_until_round: 5, sword_own: 4 } },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bridge-failed",
      payload: { outcome: "przegrana" },
    });
  });

  /**
   * "Postać nie traci punktu Magii lub Miecza, lecz również nie może w
   * następnej turze podjąć kolejnej próby" — cheap, but not free.
   */
  it("costs a draw the next turn's attempt and nothing else", () => {
    const { writes } = settleBridge(standing({ sword_own: 5 }), RUINY, "remis");
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { bridge_blocked_until_round: 5 } }]);
    expect(writes.journal?.[0]).toMatchObject({ payload: { outcome: "remis" } });
  });

  /** 1.2-1.5: own points never fall below what the Karta Postaci prints. */
  it("cannot take the point below the starting value", () => {
    const { writes } = settleBridge(
      standing({ sword_own: 2, sword_floor: 2 }),
      RUINY,
      "przegrana",
    );
    expect(writes.seats?.[0].patch.sword_own).toBe(2);
  });

  it("takes Magia on the Wymarłe Miasto side", () => {
    const table = aTable({
      game: { round: 3, turn_state: { phase: "bridge", bridge: MIASTO } },
      seats: [aSeat({ field_id: "wymarle-miasto", magic_own: 4, magic_floor: 1 })],
    });
    const { writes } = settleBridge(table, MIASTO, "przegrana");
    expect(writes.seats?.[0].patch).toEqual({ bridge_blocked_until_round: 5, magic_own: 3 });
  });

  /**
   * The store wrote the lost point and the bar as two updates to the same row.
   * `apply` folds seat patches by id and keeps the later one, so a cascade
   * reading its own work would have seen the point come back.
   */
  it("writes the point and the bar as one patch, not two", () => {
    const { writes } = settleBridge(standing({ sword_own: 5 }), RUINY, "przegrana");
    expect(writes.seats).toHaveLength(1);
  });
});

describe("przeprawa między Kręgami (11.4, 11.8)", () => {
  const at = (fieldId: "uroczysko" | "przelecz-wichrow", over: Parameters<typeof aSeat>[0] = {}) =>
    aTable({ game: { round: 3 }, seats: [aSeat({ field_id: fieldId, ...over })] });

  it("walks the character across and lands it on the far field", () => {
    const { writes, result } = settleCrossing(at("uroczysko"), TRZESAWISKA, "wygrana");
    expect(result).toEqual({ to: "las-blednych-ogni" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { field_id: "las-blednych-ogni" } }]);
    expect(top(writes.game!.turn_state!)).toMatchObject({
      phase: "field",
      fieldId: "las-blednych-ogni",
      from: "uroczysko",
    });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "crossing",
      payload: { from: "uroczysko", to: "las-blednych-ogni", obstacle: "trzesawiska" },
    });
  });

  /**
   * The Pan Trzęsawisk and the Władca Lodu: „przebyć w dowolnym miejscu".
   *
   * The board prints two crossing points and this is neither of them — the
   * Zaklęcie opens the obstacle wherever the character is standing, and the
   * obstacle is walked rather than tested.
   */
  describe("a crossing a Zaklęcie opened", () => {
    const withSpell = (fieldId: string, przez: "trzesawiska" | "lodowy-las") =>
      aTable({
        game: {
          round: 3,
          active_seat: 0,
          turn_state: { phase: "roll" } as never,
        },
        seats: [aSeat({ seat_index: 0, field_id: fieldId as never })],
        effects: [
          {
            id: "eff-1",
            seat_id: "seat-a",
            source: "PAN TRZĘSAWISK",
            label: przez === "trzesawiska" ? "Pan Trzęsawisk" : "Władca Lodu",
            modifier: { kind: "przeprawa", przez },
            ends: { kind: "event", what: "crossing" },
          },
        ],
      });

    it("crosses from an Obszar the board has no crossing on", async () => {
      const { writes, result } = await crossRing(
        withSpell("karczma", "trzesawiska"),
        {},
        ports(),
      );
      // Out of the Kraina they are in, by the crossing that leads that way.
      expect(result.to).toBe("las-blednych-ogni");
      expect(result.outcome).toBe("udana");
      expect(writes.journal?.[0]).toMatchObject({
        kind: "crossing",
        payload: { from: "karczma", to: "las-blednych-ogni" },
      });
    });

    it("is spent by being taken", async () => {
      const { writes } = await crossRing(withSpell("karczma", "trzesawiska"), {}, ports());
      expect(writes.effects?.delete).toEqual(["eff-1"]);
    });

    it("throws no dice: 11.3's test belongs to the Uroczysko's own card", async () => {
      const { result } = await crossRing(withSpell("karczma", "trzesawiska"), {}, ports());
      expect(result.dice).toBeUndefined();
    });

    it("refuses a Kraina the obstacle does not touch", async () => {
      // The Lodowy Las lies between the middle ring and the upper one; the
      // Karczma is on the lower.
      await expect(
        crossRing(withSpell("karczma", "lodowy-las"), {}, ports()),
      ).rejects.toThrow(/nie z tej Krainy/);
    });
  });

  it("costs a point of Życie and leaves the character where it was", () => {
    const { writes, result } = settleCrossing(at("uroczysko", { life: 4 }), TRZESAWISKA, "przegrana");
    expect(result).toEqual({ to: null });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 3 } }]);
    // Nothing moves and the turn state is untouched: 11.4 says the next turn is
    // for trying again.
    expect(writes.game).toBeUndefined();
    expect(writes.journal?.[0]).toMatchObject({
      kind: "crossing-failed",
      payload: { outcome: "przegrana" },
    });
  });

  it("costs a draw nothing but still stops the journey", () => {
    const { writes } = settleCrossing(at("przelecz-wichrow"), LODOWY_LAS, "remis");
    expect(writes.seats).toBeUndefined();
    expect(writes.journal?.[0]).toMatchObject({
      payload: { obstacle: "lodowy-las", outcome: "remis" },
    });
  });

  it("carries whatever the caller wants said into the journal line", () => {
    const { writes } = settleCrossing(at("uroczysko"), TRZESAWISKA, "remis", {
      dice: [4, 5],
      magia: 3,
    });
    expect(writes.journal?.[0].payload).toMatchObject({ dice: [4, 5], magia: 3 });
  });

  it("kills a character who cannot afford the point, and hands play on", () => {
    const dying = aTable({
      game: { active_seat: 0 },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, field_id: "uroczysko", life: 1 }),
        aSeat({ id: "seat-b", seat_index: 1 }),
      ],
    });
    const { writes } = settleCrossing(dying, TRZESAWISKA, "przegrana");
    expect(writes.game?.active_seat).toBe(1);
    // The order the store wrote them in, and therefore the order the journal
    // already reads in: the death above the crossing that caused it.
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "death",
      "turn-end",
      "crossing-failed",
    ]);
  });
});

/* --------------------------------------------------------------------------
 * Opening the fight.
 * ----------------------------------------------------------------------- */

describe("stawanie do walki ze strażnikiem", () => {
  it("opens the fight with the entrance guardian at the bridge", () => {
    const table = aTable({
      game: { turn_state: { phase: "bridge", bridge: RUINY } },
      seats: [aSeat({ field_id: "ruiny-twierdzy", sword_own: 6 })],
    });
    const { writes } = fightGuardian(table);
    const phase = top(writes.game!.turn_state!) as Extract<TurnPhase, { phase: "fight" }>;
    expect(phase.phase).toBe("fight");
    expect(phase.fight.guardian).toEqual({ kind: "bridge", entrance: RUINY });
    expect(phase.fight.playerTotal).toBe(6);
    // The two entrance guardians have no strength until a die is thrown.
    expect(phase.fight.enemyTotal).toBe(0);
    expect(phase.fight.strengthRoll).toBeNull();
    expect(writes.journal?.[0]).toMatchObject({
      kind: "guardian-start",
      payload: { guardian: RUINY.guardian },
    });
  });

  /** 11.7: the Rycerz prints Miecz 10, so his fight needs no strength die. */
  it("opens the fight with the Rycerz Wiecznych Śniegów at the Lodowy Las", () => {
    const table = aTable({ seats: [aSeat({ field_id: "przelecz-wichrow", sword_own: 4 })] });
    const { writes } = fightGuardian(table);
    const phase = top(writes.game!.turn_state!) as Extract<TurnPhase, { phase: "fight" }>;
    expect(phase.fight.enemyTotal).toBe(10);
    expect(phase.fight.strengthRoll).toBeUndefined();
    expect(writes.journal?.[0].payload).toEqual({ guardian: "Rycerz Wiecznych Śniegów" });
  });

  /** The Trzęsawiska are a threshold, not a creature: there is nobody to fight. */
  it("refuses where the crossing is not a fight", () => {
    const table = aTable({ seats: [aSeat({ field_id: "uroczysko" })] });
    expect(() => fightGuardian(table)).toThrow("Nie ma tu nikogo, z kim trzeba walczyć.");
  });

  it("refuses where nothing guards anything", () => {
    expect(() => fightGuardian(aTable())).toThrow("Nie ma tu nikogo, z kim trzeba walczyć.");
  });

  it("refuses a character standing nowhere", () => {
    const table = aTable({ seats: [aSeat({ field_id: null })] });
    expect(() => fightGuardian(table)).toThrow("Postać nie stoi na żadnym polu.");
  });
});

describe("siła strażnika Wejścia na Most", () => {
  const fighting = (over: Partial<TurnPhase> = {}) =>
    aTable({
      seats: [aSeat({ field_id: "ruiny-twierdzy" })],
      game: {
        turn_state: {
          ...startGuardianFight({ kind: "bridge", entrance: RUINY }, { miecz: 6, magia: 2 }, "ruiny-twierdzy"),
          ...over,
        } as TurnPhase,
      },
    });

  /** The board prints 1→5 through 6→10, which is the die plus four. */
  it("is the die plus four", async () => {
    const { writes, result } = await rollGuardianStrength(fighting(), {}, dice(3));
    expect(result).toEqual({ strength: 7 });
    const phase = top(writes.game!.turn_state!) as Extract<TurnPhase, { phase: "fight" }>;
    expect(phase.fight.strengthRoll).toBe(3);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "guardian-strength",
      payload: { roll: 3 },
      manual: false,
    });
  });

  it("marks the line manual when a real die decided it", async () => {
    const { writes } = await rollGuardianStrength(fighting(), { manual: true }, dice(6));
    expect(writes.journal?.[0].manual).toBe(true);
  });

  it("asks for exactly one die", async () => {
    const random = scriptedRandom([2]);
    await rollGuardianStrength(fighting(), {}, ports({ random }));
    await expect(random.rollD6("a second")).rejects.toThrow(/exhausted/);
  });

  it("refuses when there is no fight", async () => {
    const table = aTable({ game: { turn_state: { phase: "roll" } } });
    await expect(rollGuardianStrength(table, {}, dice(3))).rejects.toThrow("Nie ma walki.");
  });

  it("refuses to throw it twice", async () => {
    const already = aTable({
      seats: [aSeat({ field_id: "ruiny-twierdzy" })],
      game: {
        turn_state: recordGuardianStrength(
          startGuardianFight({ kind: "bridge", entrance: RUINY }, { miecz: 6, magia: 2 }, "ruiny-twierdzy"),
          3,
        ),
      },
    });
    await expect(rollGuardianStrength(already, {}, dice(3))).rejects.toThrow(
      "Siła przeciwnika jest już znana.",
    );
  });
});

describe("Most zgłoszony przez stół", () => {
  const attempting = aTable({
    game: { round: 3, turn_state: { phase: "bridge", bridge: MIASTO } },
    seats: [aSeat({ field_id: "wymarle-miasto", magic_own: 4, magic_floor: 1 })],
  });

  it("reads a reported porażka as a loss", () => {
    const { writes, result } = enterBridge(attempting, { outcome: "porazka" });
    expect(result).toEqual({ at: null });
    expect(writes.seats?.[0].patch).toMatchObject({ magic_own: 3 });
  });

  it("reads a reported win as the entrance being reached", () => {
    expect(enterBridge(attempting, { outcome: "wygrana" }).result).toEqual({
      at: "wejscie-na-most-b",
    });
  });

  it("refuses when nobody is trying to get onto the Most", () => {
    expect(() => enterBridge(aTable(), { outcome: "wygrana" })).toThrow(
      "Nie ma teraz próby wejścia na Most.",
    );
  });
});

/* --------------------------------------------------------------------------
 * The river and the boundary.
 * ----------------------------------------------------------------------- */

describe("przewoźnik", () => {
  const onTheRiver = (over: Parameters<typeof aSeat>[0] = {}, holdings = [] as ReturnType<typeof aHolding>[]) =>
    aTable({
      game: {
        round: 3,
        turn_state: {
          phase: "field",
          fieldId: "przeprawa-1",
          from: "dolina-cienia",
          draw: 0,
          drawn: [],
        },
      },
      seats: [aSeat({ field_id: "przeprawa-1", ...over })],
      holdings,
    });

  it("takes the Sztuka Złota and lets the turn go on", () => {
    const { writes, result } = payFerry(onTheRiver({ gold: 3 }), { pay: true });
    expect(result).toEqual({ at: "przeprawa-1" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 2 } }]);
    // Nothing about the turn changes: the toll is a toll, not a stop.
    expect(writes.game).toBeUndefined();
    expect(writes.journal?.[0]).toMatchObject({
      kind: "ferry",
      payload: { field: "przeprawa-1", paid: 1 },
    });
  });

  /** "Dzięki temu Przyjacielowi nie będziesz musiał płacić 1 Sztuki Złota." */
  it("charges a character walking with the Przewoźnik nothing", () => {
    const { writes } = payFerry(
      onTheRiver({ gold: 0 }, [aHolding({ card_id: "przewoznika", kind: "friend" })]),
      { pay: true },
    );
    expect(writes.seats).toBeUndefined();
    expect(writes.journal?.[0].payload).toEqual({ field: "przeprawa-1", paid: 0 });
  });

  it("refuses to pay what the character has not got", () => {
    expect(() => payFerry(onTheRiver({ gold: 0 }), { pay: true })).toThrow(
      "Nie masz czym zapłacić przewoźnikowi.",
    );
  });

  it("undoes the whole move when the toll is refused", () => {
    const { writes, result } = payFerry(onTheRiver({ gold: 3 }), { pay: false });
    expect(result).toEqual({ at: "dolina-cienia" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { field_id: "dolina-cienia" } }]);
    expect(top(writes.game!.turn_state!)).toEqual({ phase: "end" });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "ferry-refused",
      payload: { field: "przeprawa-1", back: "dolina-cienia" },
    });
  });

  it("has nowhere to send a character whose move has no origin", () => {
    const nowhere = aTable({
      game: {
        turn_state: { phase: "field", fieldId: "przeprawa-2", from: null, draw: 0, drawn: [] },
      },
      seats: [aSeat({ field_id: "przeprawa-2" })],
    });
    expect(() => payFerry(nowhere, { pay: false })).toThrow(
      "Nie wiadomo, skąd zaczął się ten ruch.",
    );
  });

  it("refuses anywhere that is not a Przeprawa", () => {
    expect(() => payFerry(aTable(), { pay: true })).toThrow("Nie stoisz na Przeprawie.");
  });
});

describe("przechodzenie między Kręgami (11.1-11.8)", () => {
  const at = (fieldId: "uroczysko" | "las-blednych-ogni" | "przelecz-wichrow", over: Parameters<typeof aSeat>[0] = {}, holdings = [] as ReturnType<typeof aHolding>[]) =>
    aTable({ seats: [aSeat({ field_id: fieldId, ...over })], holdings });

  /** "Rzuć dwoma kostkami: wynik mniejszy lub równy twojej Magii." */
  it("crosses the Trzęsawiska on two dice against Magia", async () => {
    const { result } = await crossRing(at("uroczysko", { magic_own: 8 }), {}, dice(3, 3));
    expect(result).toEqual({
      to: "las-blednych-ogni",
      outcome: "udana",
      dice: [3, 3],
      magia: 8,
    });
  });

  it("costs a point of Życie when the dice beat the Magia", async () => {
    const table = at("uroczysko", { magic_own: 2, life: 4 });
    const { writes, result } = await crossRing(table, {}, dice(4, 5));
    expect(result).toMatchObject({ to: null, outcome: "nieudana", dice: [4, 5], magia: 2 });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 3 } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "crossing-failed",
      payload: { dice: [4, 5], magia: 2 },
    });
  });

  /** Rusałka: "wykonanie rzutu jedną kostką, gdy będziesz przechodzić". */
  it("throws one die for a character walking with the Rusałka", async () => {
    const random = scriptedRandom([2]);
    const { result } = await crossRing(
      at("uroczysko", { magic_own: 6 }, [aHolding({ card_id: "rusalka", kind: "friend" })]),
      {},
      ports({ random }),
    );
    expect(result).toMatchObject({ dice: [2], outcome: "udana" });
    await expect(random.rollD6("a second")).rejects.toThrow(/exhausted/);
  });

  /** 11.3: "idąc w przeciwnym kierunku, nie musi wykonywać rzutu". */
  it("walks the undefended direction for free and throws nothing", async () => {
    const random = scriptedRandom([]);
    const { result, writes } = await crossRing(at("las-blednych-ogni"), {}, ports({ random }));
    expect(result).toEqual({ to: "uroczysko", outcome: "udana" });
    expect(writes.journal?.[0]).toMatchObject({ kind: "crossing" });
  });

  /** The Lodowy Las is a fight, so a companion table reports how it went. */
  it("takes the table's word for the Lodowy Las, and throws nothing", async () => {
    const random = scriptedRandom([]);
    const { result } = await crossRing(
      at("przelecz-wichrow"),
      { outcome: "remis" },
      ports({ random }),
    );
    expect(result).toEqual({ to: null, outcome: "remis" });
  });

  it("defaults a reported fight to a win when the table says nothing", async () => {
    const { result } = await crossRing(at("przelecz-wichrow"), {}, dice());
    expect(result).toEqual({ to: "dolina-czaszek", outcome: "udana" });
  });

  it("refuses from anywhere else on the board", async () => {
    await expect(crossRing(aTable(), {}, dice())).rejects.toThrow(
      "Z tego Obszaru nie można przejść do innego Kręgu (11.1, 11.5).",
    );
  });

  it("keeps the free direction of the Trzęsawiska free", () => {
    expect(TRZESAWISKA_BACK.test).toBeUndefined();
  });
});

/* --------------------------------------------------------------------------
 * The bridge itself.
 * ----------------------------------------------------------------------- */

describe("Pułapka i Magiczna Pułapka (14.5)", () => {
  const inTheTrap = (
    fieldId: "pulapka" | "magiczna-pulapka",
    over: Parameters<typeof aSeat>[0] = {},
    holdings = [] as ReturnType<typeof aHolding>[],
  ) => aTable({ game: { round: 3 }, seats: [aSeat({ field_id: fieldId, ...over })], holdings });

  /** Three dice less the character's Miecz; nothing left over is nothing at all. */
  it("misses a character whose Miecz covers the three dice", async () => {
    const { writes, result } = await resolveBridgeOrdeal(
      inTheTrap("pulapka", { sword_own: 6 }),
      undefined,
      dice(1, 1, 1),
    );
    expect(result).toEqual({ field: "pulapka", kind: "pulapka", dice: [1, 1, 1], outcome: "uniknieta" });
    expect(writes.seats).toBeUndefined();
    expect(top(writes.game!.turn_state!)).toEqual({ phase: "end" });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bridge-trap",
      payload: { dice: [1, 1, 1], result: 0 },
    });
  });

  /** 3 dice at 2 each, less Miecz 2, is 4 — the Twierdza row of the printed table. */
  it("drops a character off the bridge onto the field the table names", async () => {
    const fallen = inTheTrap("pulapka", { sword_own: 2 }, [
      aHolding({ id: "h-1", card_id: "helm", kind: "item" }),
      aHolding({ id: "h-2", card_id: "rusalka", kind: "friend" }),
    ]);
    // Three for the trap, then one per carried card, in the order they are held.
    const { writes, result } = await resolveBridgeOrdeal(fallen, undefined, dice(2, 2, 2, 1, 6));

    expect(result).toMatchObject({
      field: "pulapka",
      kind: "pulapka",
      to: "twierdza-strzegaca-drog",
      // A 1 or a 2 keeps it; the 6 does not.
      kept: ["HEŁM"],
      lost: ["RUSAŁKA"],
    });
    expect(writes.seats).toEqual([
      { id: "seat-a", patch: { field_id: "twierdza-strzegaca-drog" } },
    ]);
    expect(writes.holdings?.delete).toEqual(["h-2"]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bridge-trap",
      payload: { dice: [2, 2, 2], result: 4, to: "twierdza-strzegaca-drog", lost: ["rusalka"] },
    });
    expect(top(writes.game!.turn_state!)).toEqual({ phase: "end" });
  });

  /** The mirror table on the Wymarłe Miasto side is read against Magia. */
  /**
   * 14.5: "Postać traci Przedmiot lub Przyjaciela (należy odłożyć ich Karty)".
   *
   * Odłożyć — the stos zużytych, which is what 1.4, 4.4 and 9.6 all spell out
   * and what nothing in this game does without. The store deleted them, under a
   * comment claiming the pile, so a fall off the Kamienny Most was the one way
   * to put a Smok beyond everybody's reach for the rest of the game.
   */
  it("puts what the fall shook loose on the used pile, not out of the game", async () => {
    const fallen = inTheTrap("pulapka", { sword_own: 2 }, [
      aHolding({ id: "h-2", card_id: "rusalka", kind: "friend" }),
    ]);
    const { writes } = await resolveBridgeOrdeal(fallen, undefined, dice(2, 2, 2, 6));

    expect(writes.holdings?.delete).toEqual(["h-2"]);
    const decks = writes.game?.deck as { events: { discard: string[] } };
    const copies = EVENT_COPIES.get("rusalka") ?? [];
    expect(copies.length).toBeGreaterThan(0);
    expect(decks.events.discard).toEqual([copies[0]]);
  });

  /** A conjured card belongs to no pile, so it joins none — see `putOnPile`. */
  it("does not hand the pile a card the deck never gave up", async () => {
    const fallen = inTheTrap("pulapka", { sword_own: 2 }, [
      aHolding({ id: "h-3", card_id: "rusalka", kind: "friend", granted: true }),
    ]);
    const { writes } = await resolveBridgeOrdeal(fallen, undefined, dice(2, 2, 2, 6));
    expect(writes.holdings?.delete).toEqual(["h-3"]);
    expect(writes.game?.deck).toBeUndefined();
  });

  it("weighs Magia in the Magiczna Pułapka", async () => {
    const strong = await resolveBridgeOrdeal(
      inTheTrap("magiczna-pulapka", { sword_own: 1, magic_own: 9 }),
      undefined,
      dice(2, 2, 2),
    );
    expect(strong.result.outcome).toBe("uniknieta");

    // The same dice with the Magia low fall, which is what proves Miecz was not
    // the number being read.
    const weak = await resolveBridgeOrdeal(
      inTheTrap("magiczna-pulapka", { sword_own: 9, magic_own: 1 }),
      undefined,
      dice(2, 2, 2),
    );
    expect(weak.result.to).toBe("swiatynia-bogini-nemed");
  });

  it("throws nothing for the carried cards when the trap missed", async () => {
    const random = scriptedRandom([1, 1, 1]);
    await resolveBridgeOrdeal(
      inTheTrap("pulapka", { sword_own: 6 }, [aHolding({ card_id: "helm" })]),
      undefined,
      ports({ random }),
    );
    await expect(random.rollD6("a fourth")).rejects.toThrow(/exhausted/);
  });
});

describe("Gra ze Śmiercią", () => {
  const playing = (over: Parameters<typeof aSeat>[0] = {}) =>
    aTable({ game: { round: 3 }, seats: [aSeat({ field_id: "gra-ze-smiercia", ...over })] });

  /** Two for the character, then two for Death — in that order. */
  it("walks on when the character's two beat Death's", async () => {
    const { writes, result } = await resolveBridgeOrdeal(playing(), undefined, dice(6, 6, 1, 1));
    expect(result).toMatchObject({ outcome: "dalej", dice: [6, 6, 1, 1], lifeLost: 0 });
    expect(writes.seats).toBeUndefined();
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bridge-death-game",
      payload: { mine: [6, 6], deaths: [1, 1], outcome: "dalej" },
    });
  });

  /** A draw is not a loss — the same distinction 17.10 makes about combat. */
  it("costs nothing on a draw", async () => {
    const { writes, result } = await resolveBridgeOrdeal(playing(), undefined, dice(3, 4, 4, 3));
    expect(result.outcome).toBe("znowu");
    expect(writes.seats).toBeUndefined();
  });

  it("costs a point of Życie on a loss", async () => {
    const { writes, result } = await resolveBridgeOrdeal(
      playing({ life: 4 }),
      undefined,
      dice(1, 1, 6, 6),
    );
    expect(result).toMatchObject({ outcome: "strata", lifeLost: 1 });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 3 } }]);
  });

  /**
   * The ordering the store had to arrange by hand, as one changeset.
   *
   * The turn is closed first and the death's pass merged over it, so the table
   * ends up in the next character's turn rather than back inside the dead one's
   * — and `passTurn` is decided against a snapshot that already knows both.
   */
  it("hands play on when the game with Death kills, and never back to the dead", async () => {
    const dying = aTable({
      game: { round: 3, active_seat: 1 },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: "gra-ze-smiercia", life: 1 }),
      ],
    });
    const { writes } = await resolveBridgeOrdeal(dying, undefined, dice(1, 1, 6, 6));

    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "bridge-death-game",
      "death",
      "turn-end",
    ]);
    expect(writes.game?.active_seat).toBe(0);
    // The pass wins the column, which is the whole point of merging it second.
    expect(top(writes.game!.turn_state!)).toEqual({ phase: "roll" });
  });

  /**
   * A guard on the `apply` chain rather than a table anybody will sit at.
   *
   * `passTurn` leaves whatever was drawn and not taken lying on the Obszar
   * (16.8), and it decides that from the turn state. Handed the raw snapshot it
   * would read a turn still open and start tidying up a field the character is
   * dying on; handed `apply(snapshot, played)` it reads the turn this command
   * has just closed and does nothing. No bridge field prints a draw, so the
   * card here is contrived — the chain it pins down is not.
   */
  it("decides the pass against the turn this command has already closed", async () => {
    const dying = aTable({
      game: {
        round: 3,
        active_seat: 1,
        turn_state: {
          phase: "field",
          fieldId: "gra-ze-smiercia",
          from: null,
          draw: 0,
          drawn: [{ cardId: "cyklop", cardClass: "foe" }],
        },
      },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: "gra-ze-smiercia", life: 1 }),
      ],
    });
    const { writes } = await resolveBridgeOrdeal(dying, undefined, dice(1, 1, 6, 6));
    expect(writes.journal?.map((line) => line.kind)).not.toContain("left-behind");
    expect(writes.fieldCards?.insert?.map((card) => card.card_id) ?? []).not.toContain("cyklop");
  });

  it("asks for exactly four dice", async () => {
    const random = scriptedRandom([1, 1, 1, 1]);
    await resolveBridgeOrdeal(playing(), undefined, ports({ random }));
    await expect(random.rollD6("a fifth")).rejects.toThrow(/exhausted/);
  });
});

describe("Cerber", () => {
  const dog = (over: Parameters<typeof aSeat>[0] = {}) =>
    aTable({ game: { round: 3 }, seats: [aSeat({ field_id: "cerber", ...over })] });

  /** One die, and the dog takes between one and three points. */
  it("takes half the die, rounded up", async () => {
    const { writes, result } = await resolveBridgeOrdeal(dog({ life: 4 }), undefined, dice(5));
    expect(result).toEqual({ field: "cerber", kind: "cerber", dice: [5], lifeLost: 3 });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 1 } }]);
    expect(writes.journal?.[0]).toMatchObject({ kind: "bridge-cerberus", payload: { die: 5, loss: 3 } });
  });

  it("takes one on a 1", async () => {
    const { result } = await resolveBridgeOrdeal(dog({ life: 4 }), undefined, dice(1));
    expect(result.lifeLost).toBe(1);
  });

  it("can kill, and hands play on when it does", async () => {
    const dying = aTable({
      game: { round: 3, active_seat: 1 },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: "cerber", life: 2 }),
      ],
    });
    const { writes } = await resolveBridgeOrdeal(dying, undefined, dice(6));
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "bridge-cerberus",
      "death",
      "turn-end",
    ]);
    expect(writes.game?.active_seat).toBe(0);
  });
});

describe("Demon Zagłady i Monstrum (14.6)", () => {
  /** Two dice, added, with no offset — a different creature on a different rule. */
  it("opens a magical fight against the Demon with two dice of strength", async () => {
    const table = aTable({
      game: { round: 3 },
      seats: [aSeat({ field_id: "demon-zaglady", sword_own: 9, magic_own: 5, magic_floor: 1 })],
    });
    const { writes, result } = await resolveBridgeOrdeal(table, undefined, dice(3, 4));

    expect(result).toEqual({
      field: "demon-zaglady",
      kind: "straznik",
      dice: [3, 4],
      enemyTotal: 7,
      outcome: "Demon Zagłady",
    });
    const phase = top(writes.game!.turn_state!) as Extract<TurnPhase, { phase: "fight" }>;
    expect(phase.phase).toBe("fight");
    expect(phase.fight.kind).toBe("magical");
    expect(phase.fight.enemyTotal).toBe(7);
    expect(phase.fight.playerTotal).toBe(5);
    expect(phase.fight.guardian).toEqual({
      kind: "bridge-field",
      fieldId: "demon-zaglady",
      name: "Demon Zagłady",
      combat: "magical",
    });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bridge-guardian",
      payload: { guardian: "Demon Zagłady", dice: [3, 4], strength: 7 },
    });
  });

  it("opens an ordinary fight against the Monstrum, on Miecz", async () => {
    const table = aTable({
      seats: [aSeat({ field_id: "monstrum", sword_own: 8, magic_own: 1 })],
    });
    const { writes, result } = await resolveBridgeOrdeal(table, undefined, dice(6, 6));
    expect(result).toMatchObject({ enemyTotal: 12, outcome: "Monstrum" });
    const phase = top(writes.game!.turn_state!) as Extract<TurnPhase, { phase: "fight" }>;
    expect(phase.fight.kind).toBe("ordinary");
    expect(phase.fight.playerTotal).toBe(8);
  });

  /** The fight is the turn: this one does not end it. */
  it("leaves the turn open", async () => {
    const table = aTable({ seats: [aSeat({ field_id: "monstrum" })] });
    const { writes } = await resolveBridgeOrdeal(table, undefined, dice(1, 1));
    expect(top(writes.game!.turn_state!).phase).toBe("fight");
  });
});

describe("gdzie na Moście nie ma czego rozpatrywać", () => {
  it("refuses on a bridge entrance, which is not an ordeal", async () => {
    const table = aTable({ seats: [aSeat({ field_id: "wejscie-na-most-a" })] });
    await expect(resolveBridgeOrdeal(table, undefined, dice())).rejects.toThrow(
      "Na tym Obszarze nie ma czego rozpatrywać.",
    );
  });

  it("refuses off the Most entirely", async () => {
    await expect(resolveBridgeOrdeal(aTable(), undefined, dice())).rejects.toThrow(
      "Na tym Obszarze nie ma czego rozpatrywać.",
    );
  });

  it("refuses a character standing nowhere", async () => {
    const table = aTable({ seats: [aSeat({ field_id: null })] });
    await expect(resolveBridgeOrdeal(table, undefined, dice())).rejects.toThrow(
      "Na tym Obszarze nie ma czego rozpatrywać.",
    );
  });
});
