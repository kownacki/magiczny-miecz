import { describe, expect, it } from "vitest";
import {
  BRIDGE_ENTRANCES,
  DOLNY_KRAG,
  destination,
  isFerry,
  moveOptions,
  ringOf,
} from "./board";
import { crossingFrom } from "./rings";
import {
  afterDraw,
  afterMove,
  afterRoll,
  bridgeBlockUntil,
  bridgeBlocked,
  endFight,
  recordGuardianStrength,
  startGuardianFight,
  strengthPending,
  nextSeat,
  recordFightRoll,
  startFight,
  startTurn,
  type TurnOrderSeat,
  type TurnPhase,
} from "./turn";
import { resolutionOrder } from "./state";

const seat = (index: number, over: Partial<TurnOrderSeat> = {}): TurnOrderSeat => ({
  index,
  eliminated: false,
  turnsLost: 0,
  stoneUntilTurn: null,
  ...over,
});

describe("the ring (10.2)", () => {
  it("has the fourteen Dolny Krąg fields", () => {
    expect(DOLNY_KRAG).toHaveLength(14);
  });

  it("walks clockwise and anticlockwise from the same square", () => {
    // Clockwise from Osada runs along the top edge of the ring and down its
    // right-hand side, which is the direction the board is printed in.
    expect(destination(DOLNY_KRAG, "osada", 3, "zgodnie")?.id).toBe("czarci-mlyn");
    expect(destination(DOLNY_KRAG, "osada", 3, "przeciwnie")?.id).toBe("step-2");
  });

  it("wraps round the ring", () => {
    // Karczma is index 0, so stepping back off it has to wrap to the far end.
    expect(destination(DOLNY_KRAG, "mrozne-pustkowie", 1, "zgodnie")?.id).toBe("karczma");
    expect(destination(DOLNY_KRAG, "karczma", 1, "przeciwnie")?.id).toBe("mrozne-pustkowie");
  });

  it("returns to the start after a full lap", () => {
    expect(destination(DOLNY_KRAG, "grod", 14, "zgodnie")?.id).toBe("grod");
  });

  it("reports the fields walked through, excluding the landing square", () => {
    const [clockwise] = moveOptions(DOLNY_KRAG, "karczma", 3);
    expect(clockwise.through.map((f) => f.id)).toEqual(["uroczysko", "step-2"]);
    expect(clockwise.field.id).toBe("mokradla-2");
  });

  it("offers both directions even when a roll of seven lands on the same field", () => {
    // Seven steps either way round a fourteen-field ring meets at the far side.
    const options = moveOptions(DOLNY_KRAG, "karczma", 7);
    expect(options).toHaveLength(2);
    expect(options[0].field.id).toBe(options[1].field.id);
  });

  it("does not place bridge squares on the ring", () => {
    expect(DOLNY_KRAG.some((f) => f.id === "zamek-bestii")).toBe(false);
    expect(ringOf("zamek-bestii")).not.toBe(DOLNY_KRAG);
  });
});

describe("turn phases (10.1)", () => {
  it("opens on the roll", () => {
    expect(startTurn()).toEqual({ phase: "rzut" });
  });

  it("offers two destinations after a roll", () => {
    const phase = afterRoll("karczma", 2);
    expect(phase.phase).toBe("ruch");
    if (phase.phase !== "ruch") return;
    expect(phase.roll).toBe(2);
    expect(phase.options).toHaveLength(2);
  });

  it("carries the field's draw count on landing (13.4)", () => {
    const bezdroza = DOLNY_KRAG.find((f) => f.id === "bezdroza")!;
    const phase = afterMove(bezdroza);
    expect(phase).toMatchObject({ phase: "pole", fieldId: "bezdroza", draw: 2 });
  });

  it("keeps drawn cards in resolution order however they arrive (15.2)", () => {
    let phase: TurnPhase = afterMove(DOLNY_KRAG.find((f) => f.id === "bezdroza")!);
    phase = afterDraw(phase, { cardId: "zloto", cardClass: "item" });
    phase = afterDraw(phase, { cardId: "wilk", cardClass: "foe" });
    phase = afterDraw(phase, { cardId: "mgla", cardClass: "encounter" });
    if (phase.phase !== "pole") throw new Error("expected pole");
    expect(phase.drawn.map((c) => c.cardId)).toEqual(["mgla", "wilk", "zloto"]);
  });
});

describe("fights", () => {
  const field = afterMove(DOLNY_KRAG.find((f) => f.id === "kurhan")!);

  it("uses Miecz for an ordinary enemy", () => {
    const phase = startFight(
      field,
      { cardId: "cyklop", cardName: "CYKLOP", miecz: 6 },
      { miecz: 3, magia: 5 },
    );
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.kind).toBe("zwykla");
    expect(phase.fight.enemyTotal).toBe(6);
    expect(phase.fight.playerTotal).toBe(3);
  });

  it("switches to Magia when the card is a Demon (16.3, 18.2)", () => {
    const phase = startFight(
      field,
      { cardId: "demon", cardName: "DEMON", magia: 7 },
      { miecz: 3, magia: 5 },
    );
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.kind).toBe("magiczna");
    expect(phase.fight.enemyTotal).toBe(7);
    expect(phase.fight.playerTotal).toBe(5);
  });

  it("settles only once both dice are in (17.8)", () => {
    let phase = startFight(
      field,
      { cardId: "cyklop", cardName: "CYKLOP", miecz: 6 },
      { miecz: 3, magia: 5 },
    );
    phase = recordFightRoll(phase, "player", 6);
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.result).toBeNull();

    phase = recordFightRoll(phase, "enemy", 1);
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.result).toMatchObject({ outcome: "wygrana" });
  });

  it("returns to the field it interrupted, drawn cards intact", () => {
    let phase: TurnPhase = afterDraw(field, { cardId: "cyklop", cardClass: "foe" });
    phase = startFight(
      phase,
      { cardId: "cyklop", cardName: "CYKLOP", miecz: 6 },
      { miecz: 3, magia: 5 },
    );
    const back = endFight(phase);
    expect(back).toMatchObject({ phase: "pole", fieldId: "kurhan" });
    if (back.phase !== "pole") return;
    expect(back.drawn).toHaveLength(1);
  });

  it("writes the enemy down as fought, so it cannot be rolled against twice (17.4)", () => {
    let phase: TurnPhase = afterDraw(field, { cardId: "cyklop", cardClass: "foe" });
    phase = startFight(
      phase,
      { cardId: "cyklop", cardName: "CYKLOP", miecz: 6 },
      { miecz: 3, magia: 5 },
    );
    phase = recordFightRoll(phase, "player", 1);
    phase = recordFightRoll(phase, "enemy", 6);
    const back = endFight(phase);
    if (back.phase !== "pole") throw new Error("expected pole");
    // Lost, so the Cyklop is still on the field — and still not something to
    // roll against again this turn.
    expect(back.drawn.map((c) => c.cardId)).toEqual(["cyklop"]);
    expect(back.fought).toEqual(["cyklop"]);
  });

  it("settles every creature of a pack that attacked as one (17.5)", () => {
    let phase: TurnPhase = afterDraw(field, { cardId: "wilk", cardClass: "foe" });
    phase = afterDraw(phase, { cardId: "wilki", cardClass: "foe" });
    phase = startFight(
      phase,
      {
        cardId: "wilk+wilki",
        cardName: "WILK + WILKI",
        miecz: 7,
        settles: ["wilk", "wilki"],
      },
      { miecz: 3, magia: 5 },
    );
    const back = endFight(phase);
    if (back.phase !== "pole") throw new Error("expected pole");
    expect(back.fought).toEqual(["wilk", "wilki"]);
  });

  it("settles nothing in a duel — the other character is still standing (17.9)", () => {
    const phase = startFight(
      field,
      { cardId: "seat:1", cardName: "Ola", miecz: 4, opponentSeat: 1 },
      { miecz: 3, magia: 5 },
    );
    const back = endFight(phase);
    if (back.phase !== "pole") throw new Error("expected pole");
    expect(back.fought).toEqual([]);
  });
});

describe("turn order", () => {
  it("passes to the next seat", () => {
    expect(nextSeat([seat(0), seat(1), seat(2)], 0, 1).seat).toBe(1);
  });

  it("wraps back to the first", () => {
    expect(nextSeat([seat(0), seat(1)], 1, 1).seat).toBe(0);
  });

  it("skips a seat that is sitting out a lost turn", () => {
    const result = nextSeat([seat(0), seat(1, { turnsLost: 1 }), seat(2)], 0, 1);
    expect(result.seat).toBe(2);
    expect(result.skipped).toEqual([1]);
  });

  it("skips the dead entirely, without spending anything (4.4)", () => {
    const result = nextSeat([seat(0), seat(1, { eliminated: true }), seat(2)], 0, 1);
    expect(result.seat).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it("skips a character turned to stone until its three turns are up (20.1)", () => {
    const stone = [seat(0), seat(1, { stoneUntilTurn: 5 })];
    expect(nextSeat(stone, 0, 3).seat).toBe(0);
    expect(nextSeat(stone, 0, 5).seat).toBe(1);
  });

  it("gives up rather than looping forever when nobody can act", () => {
    const none = [seat(0, { eliminated: true }), seat(1, { eliminated: true })];
    expect(nextSeat(none, 0, 1).seat).toBeNull();
  });
});

describe("resolution numerals (15.2, 16.6)", () => {
  it("puts Nieznajomy (IV) after Wróg (II) and before Przedmiot (V)", () => {
    const drawn = [
      { cardId: "zloto", cardClass: "item" as const },
      { cardId: "cudotworca", cardClass: "stranger" as const },
      { cardId: "cyklop", cardClass: "foe" as const },
    ];
    expect(resolutionOrder(drawn).map((c) => c.cardId)).toEqual([
      "cyklop",
      "cudotworca",
      "zloto",
    ]);
  });

  it("treats Przedmiot and Przyjaciel as equals, both printing V", () => {
    // Rule 16.6 names them in one clause and the cards agree, so drawing order
    // decides between them rather than an invented precedence.
    const drawn = [
      { cardId: "alchemik", cardClass: "friend" as const },
      { cardId: "zloto", cardClass: "item" as const },
    ];
    expect(resolutionOrder(drawn).map((c) => c.cardId)).toEqual(["alchemik", "zloto"]);
    const reversed = [drawn[1], drawn[0]];
    expect(resolutionOrder(reversed).map((c) => c.cardId)).toEqual(["zloto", "alchemik"]);
  });

  it("still puts Miejsce (VI) last", () => {
    const drawn = [
      { cardId: "swiatynia", cardClass: "place" as const },
      { cardId: "mgla", cardClass: "encounter" as const },
    ];
    expect(resolutionOrder(drawn)[0].cardId).toBe("mgla");
  });
});

describe("the Kamienny Most (10.3, 10.4)", () => {
  it("moves one field per turn regardless of the die", () => {
    const rolled6 = afterRoll("gra-ze-smiercia", 6);
    if (rolled6.phase !== "ruch") throw new Error("expected ruch");
    // Six pips, but the bridge only ever offers its two neighbours.
    expect(rolled6.options.map((o) => o.fieldId)).toEqual([
      "demon-zaglady",
      "pulapka",
    ]);
  });

  it("offers going back, since a character may leave at any time (10.4)", () => {
    const phase = afterRoll("monstrum", 1);
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    expect(phase.options.map((o) => o.fieldId)).toContain("zamek-bestii");
    expect(phase.options.map((o) => o.fieldId)).toContain("cerber");
  });

  it("offers only one way from an entrance, which is the end of the bridge", () => {
    const phase = afterRoll("wejscie-na-most-a", 3);
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    expect(phase.options).toHaveLength(1);
    expect(phase.options[0].fieldId).toBe("pulapka");
  });

  it("still uses the die on an ordinary ring", () => {
    // Karczma is index 0, so three steps back wraps round to Bezdroża.
    const phase = afterRoll("karczma", 3);
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    expect(phase.options.map((o) => o.fieldId)).toEqual(["mokradla-2", "bezdroza"]);
  });
});

describe("stepping onto the Kamienny Most (11.10)", () => {
  // Ruiny Twierdzy is index 1 of the outer ring, so a character on Urwisko
  // (index 0) walks over it with anything better than a roll of one.
  const from = "urwisko-1";

  it("offers the bridge when the walk passes an entrance with a step to spare", () => {
    const phase = afterRoll(from, 2, { bridgeOffered: true });
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    const bridge = phase.options.find((option) => option.bridge);
    expect(bridge?.bridge?.guardian).toBe("Kamienny Potwór");
    expect(bridge?.fieldId).toBe("ruiny-twierdzy");
    expect(bridge?.bridge?.entersAt).toBe("wejscie-na-most-a");
  });

  it("does NOT offer it when the move ends exactly on the entrance", () => {
    // "Postać, której ruch kończy się dokładnie na Obszarze Wymarłego Miasta
    // albo Ruin Twierdzy, nie może podjąć próby wkroczenia na Most."
    const phase = afterRoll(from, 1, { bridgeOffered: true });
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    expect(phase.options.some((option) => option.fieldId === "ruiny-twierdzy")).toBe(true);
    expect(phase.options.some((option) => option.bridge)).toBe(false);
  });

  it("does not offer it at all without a sword, or while barred by 11.11", () => {
    const phase = afterRoll(from, 2);
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    expect(phase.options.some((option) => option.bridge)).toBe(false);
  });

  it("keeps the ordinary walk alongside the diversion", () => {
    const phase = afterRoll(from, 2, { bridgeOffered: true });
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    // Both ways round the ring, plus the turn onto the bridge.
    expect(phase.options).toHaveLength(3);
    expect(phase.options.filter((option) => !option.bridge)).toHaveLength(2);
  });

  it("stops the walk short at the entrance rather than at the landing square", () => {
    const phase = afterRoll(from, 3, { bridgeOffered: true });
    if (phase.phase !== "ruch") throw new Error("expected ruch");
    const bridge = phase.options.find((option) => option.bridge)!;
    // Walked from Urwisko straight to the ruins: nothing in between.
    expect(bridge.through).toEqual([]);
    expect(bridge.fieldId).toBe("ruiny-twierdzy");
  });
});

describe("the Przeprawa (middle ring)", () => {
  it("knows both river crossings and nothing else", () => {
    expect(isFerry("przeprawa-1")).toBe(true);
    expect(isFerry("przeprawa-2")).toBe(true);
    expect(isFerry("pustelnia")).toBe(false);
    expect(isFerry("karczma")).toBe(false);
  });
});

describe("where a move started", () => {
  it("is carried into the field phase, for the ferryman to send you back to", () => {
    const ring = DOLNY_KRAG;
    const phase = afterMove(ring[3], "karczma");
    if (phase.phase !== "pole") throw new Error("expected pole");
    expect(phase.from).toBe("karczma");
  });
});

describe("the one-turn bar after a failed bridge attempt (11.11)", () => {
  it("bars the next round and no more", () => {
    const failedOn = 3;
    const until = bridgeBlockUntil(failedOn);
    expect(bridgeBlocked(until, failedOn)).toBe(true);
    expect(bridgeBlocked(until, failedOn + 1)).toBe(true);
    // "w następnej turze" is one turn, not two.
    expect(bridgeBlocked(until, failedOn + 2)).toBe(false);
    expect(bridgeBlocked(until, failedOn + 3)).toBe(false);
  });

  it("does not bar a character that never tried", () => {
    expect(bridgeBlocked(null, 7)).toBe(false);
  });
});

describe("fighting a guardian", () => {
  const ruins = BRIDGE_ENTRANCES.find((e) => e.from === "ruiny-twierdzy")!;
  const totals = { miecz: 5, magia: 2 };

  it("starts a bridge guardian with no strength until its die is thrown", () => {
    const phase = startGuardianFight({ kind: "most", entrance: ruins }, totals, "ruiny-twierdzy");
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(strengthPending(phase.fight)).toBe(true);
    expect(phase.fight.enemyTotal).toBe(0);
    // Kamienny Potwór is fought on Miecz, so the character brings its Miecz.
    expect(phase.fight.kind).toBe("zwykla");
    expect(phase.fight.playerTotal).toBe(5);
  });

  it("reads the board's table as a die plus four", () => {
    const opened = startGuardianFight({ kind: "most", entrance: ruins }, totals, "ruiny-twierdzy");
    for (const [roll, strength] of [
      [1, 5],
      [2, 6],
      [3, 7],
      [4, 8],
      [5, 9],
      [6, 10],
    ]) {
      const phase = recordGuardianStrength(opened, roll);
      if (phase.phase !== "walka") throw new Error("expected walka");
      expect(phase.fight.enemyTotal, `roll ${roll}`).toBe(strength);
      expect(strengthPending(phase.fight)).toBe(false);
    }
  });

  it("refuses combat dice while the strength die is owed", () => {
    // Rolling early would compare against zero and hand over a free win.
    const opened = startGuardianFight({ kind: "most", entrance: ruins }, totals, "ruiny-twierdzy");
    const same = recordFightRoll(opened, "player", 6);
    expect(same).toEqual(opened);
  });

  it("fights the Duch Skał on Magia, not Miecz", () => {
    const city = BRIDGE_ENTRANCES.find((e) => e.from === "wymarle-miasto")!;
    const phase = startGuardianFight({ kind: "most", entrance: city }, totals, "wymarle-miasto");
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.kind).toBe("magiczna");
    expect(phase.fight.playerTotal).toBe(2);
  });

  it("gives the Rycerz his printed Miecz and asks for no strength die", () => {
    const crossing = crossingFrom("przelecz-wichrow")!;
    const phase = startGuardianFight({ kind: "przeprawa", crossing }, totals, "przelecz-wichrow");
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.cardName).toBe("Rycerz Wiecznych Śniegów");
    expect(phase.fight.enemyTotal).toBe(10);
    expect(strengthPending(phase.fight)).toBe(false);
  });

  it("carries what the fight is for, so its outcome can be routed", () => {
    const phase = startGuardianFight({ kind: "most", entrance: ruins }, totals, "ruiny-twierdzy");
    if (phase.phase !== "walka") throw new Error("expected walka");
    expect(phase.fight.guardian).toEqual({ kind: "most", entrance: ruins });
  });
});

describe("a table where everybody owes a turn", () => {
  const seat = (index: number, turnsLost = 0) => ({
    index,
    eliminated: false,
    turnsLost,
    stoneUntilTurn: null,
  });

  it("finds nobody when every seat is waiting", () => {
    // Burza Siedmiu Słońc does exactly this: "Wszystkie Postacie tracą 1 turę".
    // `nextSeat` walks the table once, so it reports nobody — and it is the
    // caller's job to pass again rather than to stop the game for good.
    const { seat: next, skipped } = nextSeat([seat(0, 1), seat(1, 1)], 0, 5);
    expect(next).toBeNull();
    expect(skipped).toEqual([1, 0]);
  });

  it("finds somebody once those turns have been spent", () => {
    // Which is what the second pass looks like: one taken off each.
    const { seat: next } = nextSeat([seat(0, 0), seat(1, 0)], 0, 5);
    expect(next).toBe(1);
  });

  it("still reports nobody when what is left is stone, which no pass helps", () => {
    // 20.1 measures Kamień in turn numbers, so it comes back as the counter
    // moves rather than by being passed over.
    const stone = { index: 0, eliminated: false, turnsLost: 0, stoneUntilTurn: 9 };
    expect(nextSeat([stone], 0, 5).seat).toBeNull();
    expect(nextSeat([stone], 0, 9).seat).toBe(0);
  });
});
