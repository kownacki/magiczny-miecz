import { describe, expect, it } from "vitest";
import { asFieldId } from "./board";
import {
  allStatuses,
  cardStatuses,
  fromColumns,
  stillStone,
  afterEvent,
  afterFight,
  afterTurn,
  bonusFrom,
  dispel,
  forcedNature,
  frozen,
  carryBonus,
  heldStatuses,
  movementCap,
  crossingDiceFrom,
  shieldUpTo,
  type HeldCard,
  type Status,
} from "./status";
import { describeEnd, markOf } from "./statusRows";

function status(over: Partial<Status> = {}): Status {
  return {
    id: "a",
    source: "eliksir-sily",
    label: "+2 Miecza",
    modifier: { kind: "points", miecz: 2 },
    ends: { kind: "turns", turns: 1 },
    ...over,
  };
}

const ids = (list: Status[]) => list.map((s) => s.id);

describe("what a character is under", () => {
  it("adds points up without touching own points", () => {
    // 1.2-1.5: only own Miecz and Magia are stored, and totals are worked out
    // at read time. A buff that wrote itself into sword_own would outlive its
    // own expiry, because 1.3 forbids pushing own points back down.
    const under = [
      status({ modifier: { kind: "points", miecz: 2 } }),
      status({ id: "b", modifier: { kind: "points", miecz: 1, magia: 3 } }),
    ];
    expect(bonusFrom(under)).toEqual({ miecz: 3, magia: 3 });
  });

  it("counts nothing when nothing gives points", () => {
    expect(bonusFrom([status({ modifier: { kind: "frozen" } })])).toEqual({
      miecz: 0,
      magia: 0,
    });
  });

  it("takes the tightest movement cap in force", () => {
    // Mgła caps at one Obszar; Południca does too. Two caps do not add up, and
    // the stricter of them is the one being obeyed.
    const under = [
      status({ modifier: { kind: "move-max", fields: 2 } }),
      status({ id: "b", modifier: { kind: "move-max", fields: 1 } }),
    ];
    expect(movementCap(under)).toBe(1);
    expect(movementCap([])).toBeNull();
  });

  it("takes the widest osłona in force, not the sum", () => {
    // A Hełm, a Tarcza and a Zbroja worn together are one roll against 3,
    // not three rolls against 1, 2 and 3 in turn.
    const under = [
      status({ modifier: { kind: "oslona", upTo: 1 } }),
      status({ id: "b", modifier: { kind: "oslona", upTo: 3 } }),
      status({ id: "c", modifier: { kind: "oslona", upTo: 2 } }),
    ];
    expect(shieldUpTo(under)).toBe(3);
    expect(shieldUpTo([])).toBe(0);
  });

  it("sums udzwig, unlike osłona's widest", () => {
    // A Koń and a Muł worn together really do carry twelve.
    const under = [
      status({ modifier: { kind: "udzwig", items: 8 } }),
      status({ id: "b", modifier: { kind: "udzwig", items: 4 } }),
    ];
    expect(carryBonus(under)).toBe(12);
    expect(carryBonus([])).toBe(0);
  });

  it("is unbounded once a Zaprzęg is among them, whatever else is summed in", () => {
    const under = [
      status({ modifier: { kind: "udzwig", items: 8 } }),
      status({ id: "b", modifier: { kind: "udzwig", items: "bez-limitu" } }),
    ];
    expect(carryBonus(under)).toBe(Infinity);
  });

  it("knows when the holder cannot act at all", () => {
    expect(frozen([status({ modifier: { kind: "frozen" } })])).toBe(true);
    expect(frozen([status()])).toBe(false);
  });

  it("reports a Natura being forced", () => {
    expect(forcedNature([status({ modifier: { kind: "nature", to: "evil" } })])).toBe("evil");
    expect(forcedNature([status()])).toBeNull();
  });
});

describe("what makes an effect stop", () => {
  it("counts down the holder's own turns, not the table's rounds", () => {
    // "Na 1 turę" on a card means one of yours. Measured in rounds it would
    // last longer at a table of six than at a table of two, which no card says.
    const three = [status({ ends: { kind: "turns", turns: 3 } })];
    const two = afterTurn(three);
    expect(two[0].ends).toEqual({ kind: "turns", turns: 2 });
    expect(ids(afterTurn(afterTurn(two)))).toEqual([]);
  });

  it("leaves everything that is not counting turns alone", () => {
    const under = [
      status({ id: "walka", ends: { kind: "fight" } }),
      status({ id: "fatum", ends: { kind: "dispelled" } }),
    ];
    expect(ids(afterTurn(under))).toEqual(["walka", "fatum"]);
  });

  it("ends a one-fight effect however the fight ended", () => {
    // 17.4 ends a fight the moment the dice are compared — win, lose or draw.
    const under = [status({ id: "magia-i-miecz", ends: { kind: "fight" } }), status({ id: "b" })];
    expect(ids(afterFight(under))).toEqual(["b"]);
  });

  it("ends an effect on the event it was waiting for, and no other", () => {
    const under = [
      status({ id: "poludnica", ends: { kind: "event", what: "crossing" } }),
      status({ id: "most", ends: { kind: "event", what: "bridge-entry" } }),
    ];
    expect(ids(afterEvent(under, "crossing"))).toEqual(["most"]);
    expect(ids(afterEvent(under, "death"))).toEqual(["poludnica", "most"]);
  });

  it("dispels only what was waiting to be dispelled", () => {
    // A countdown is not cancelled by being argued with.
    const under = [
      status({ id: "fatum", ends: { kind: "dispelled" } }),
      status({ id: "eliksir", ends: { kind: "turns", turns: 1 } }),
    ];
    expect(ids(dispel(under))).toEqual(["eliksir"]);
  });
});

describe("telling the player how long", () => {
  it("says what it is waiting for, in every case", () => {
    expect(describeEnd({ kind: "turns", turns: 1 })).toBe("do końca tej tury");
    expect(describeEnd({ kind: "turns", turns: 3 })).toContain("3");
    expect(describeEnd({ kind: "fight" })).toBe("do końca walki");
    expect(describeEnd({ kind: "event", what: "crossing" })).toContain("Trzęsawiska");
    expect(describeEnd({ kind: "dispelled" })).toContain("zdejmie");
  });

  it("never leaves a player without an answer", () => {
    // The point of a closed list of endings: every one of them can be said.
    const all = [
      { kind: "turns", turns: 2 },
      { kind: "fight" },
      { kind: "event", what: "bridge-entry" },
      { kind: "event", what: "death" },
      { kind: "dispelled" },
    ] as const;
    for (const ends of all) expect(describeEnd(ends).length).toBeGreaterThan(0);
  });
});

describe("the four ad-hoc columns, read as effects", () => {
  const none = {
    turnsLost: 0,
    stoneUntilRound: null,
    bridgeBlockedUntilRound: null,
    natureChangedRound: null,
  };

  it("says nothing about a seat nothing is true of", () => {
    expect(fromColumns(none, 5)).toEqual([]);
  });

  it("counts a lost turn, and leaves the number to the duration", () => {
    expect(fromColumns({ ...none, turnsLost: 2 }, 5)[0]).toMatchObject({
      label: "Traci turę",
      ends: { kind: "turns", turns: 2 },
    });
  });

  it("dates Kamień to the round it wears off in, rather than counting turns (20.1)", () => {
    // The column holds a round number and is passed through as one. A countdown
    // would have to be in the holder's own turns, and a statue takes none — it
    // would never reach zero. It says nothing once that round has arrived.
    expect(fromColumns({ ...none, stoneUntilRound: 8 }, 5)[0].ends).toEqual({
      kind: "round",
      round: 8,
    });
    expect(fromColumns({ ...none, stoneUntilRound: 5 }, 5)).toEqual([]);
  });

  it("ends Kamień on the round it names, not the one after (20.1)", () => {
    // The comparison five places make, made in one. 20.1's „po zakończeniu 3
    // tury" is what makes it strict: the round the column names is the one the
    // character is flesh again in. A `>=` here is a statue standing a whole
    // round too long, and nothing downstream would have said so.
    expect(stillStone(8, 7)).toBe(true);
    expect(stillStone(8, 8)).toBe(false);
    expect(stillStone(8, 9)).toBe(false);
    // A seat that has never been stone.
    expect(stillStone(null, 3)).toBe(false);
  });

  it("shows the Most being barred without calling it a freeze (11.11)", () => {
    // A character barred from the bridge walks normally everywhere else.
    const [barred] = fromColumns({ ...none, bridgeBlockedUntilRound: 6 }, 5);
    expect(barred.modifier).toEqual({ kind: "barred", place: "most" });
    expect(frozen([barred])).toBe(false);
  });

  it("mentions a Natura changed this turn, and only this turn (7.2)", () => {
    expect(fromColumns({ ...none, natureChangedRound: 5 }, 5)).toHaveLength(1);
    expect(fromColumns({ ...none, natureChangedRound: 4 }, 5)).toEqual([]);
  });

  it("puts both halves of the model in one list", () => {
    const stored = [status({ id: "eliksir" })];
    const all = allStatuses(stored, { ...none, turnsLost: 1 }, 5);
    expect(all.map((s) => s.id)).toEqual(["tura-stracona", "eliksir"]);
  });
});

describe("what a Karta lying on an Obszar is under (16.8)", () => {
  const row = (id: string, fieldCardId: string | null) => ({
    id,
    field_card_id: fieldCardId,
    source: "krag-plomieni",
    label: "Krąg Płomieni",
    modifier: { kind: "frozen" as const },
    ends: { kind: "dispelled" as const },
  });

  it("returns only the rows held by that Karta", () => {
    const effects = [row("a", "fc-1"), row("b", "fc-2"), row("c", "fc-1")];
    expect(ids(cardStatuses(effects, "fc-1"))).toEqual(["a", "c"]);
  });

  it("has no columns of its own to project — a card has no `fromColumns`", () => {
    // Unlike a seat, a Karta carries no turns-lost, Kamień, barred-Most or
    // Natura-changed column: it sits on the board, not at the table, so there
    // is no timed state beside `seat_effects` to fold in. A card with no rows
    // is under nothing at all.
    expect(cardStatuses([], "fc-1")).toEqual([]);
  });

  it("ignores rows held by a seat", () => {
    const seatHeld = { ...row("s", null), field_card_id: null };
    expect(cardStatuses([seatHeld], "fc-1")).toEqual([]);
  });
});

describe("the held half: a card's own Abilities as Status rows", () => {
  function heldCard(over: Partial<HeldCard> = {}): HeldCard {
    return { id: "h1", cardId: "miecz", kind: "item", slot: null, ...over };
  }

  it("puts a held card's points beside an applied status, both as points (1.5, 2.5)", () => {
    const applied = [status({ id: "eliksir", source: "eliksir-sily", label: "+2 Miecza" })];
    const rows = [...applied, ...heldStatuses([heldCard()], "classic", null)];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.modifier.kind === "points")).toBe(true);
  });

  it("carries `tylkoWalka` across from the Ability untouched", () => {
    // Miecz: "podczas walki dodaje właścicielowi 1 punkt Miecza" — a Karta
    // that lends nothing to the parametr, only to a fight (1.5).
    const [row] = heldStatuses([heldCard()], "classic", null);
    expect(row.modifier).toMatchObject({ kind: "points", miecz: 1, tylkoWalka: true });
    expect(row.ends).toEqual({ kind: "held" });
  });

  it("yields nothing for a card this Natura may not hold (5.3)", () => {
    const forbidden = heldCard({ cardId: "topor-swiatla-i-ciemnosci" });
    expect(heldStatuses([forbidden], "classic", "chaotic")).toEqual([]);
    expect(heldStatuses([forbidden], "classic", "good").length).toBeGreaterThan(0);
  });

  it("in slotowy, a pack card lends nothing and a worn one does", () => {
    const packed = heldCard({ slot: null });
    const worn = heldCard({ slot: "main-hand" });
    expect(heldStatuses([packed], "slots", null)).toEqual([]);
    expect(heldStatuses([worn], "slots", null).length).toBeGreaterThan(0);
  });

  it("yields nothing for an Ability with no twin yet (the exhaustive mapping compiles)", () => {
    // Rękawice are `bezpieczny`, read only when the named field is stepped on
    // — not a standing fact, so `HELD_TWIN` maps it to null rather than
    // guessing at a Modifier.
    expect(heldStatuses([heldCard({ cardId: "rekawice" })], "classic", null)).toEqual([]);
  });

  /**
   * 17.4's three shields, held rather than rolled: a Hełm, Tarcza or Zbroja
   * stands for the right to roll the moment it is worn, the same way a Miecz
   * stands for its point whether or not a fight ever happens. `shieldSaves`
   * (fight.ts) is the reader that asks for the roll itself.
   */
  it("puts a held Rusałka's die on the standing list", () => {
    // She is a Przyjaciel, so `heldStatuses` walks her like any other friend —
    // which is the whole reason this reader could be folded at all.
    const rows = heldStatuses([heldCard({ cardId: "rusalka", kind: "friend" })], "classic", null);
    const die = rows.find((row) => row.modifier.kind === "przeprawa-kostki");
    expect(die?.modifier).toEqual({ kind: "przeprawa-kostki", obstacle: "trzesawiska", dice: 1 });
    expect(die?.ends).toEqual({ kind: "held" });
    expect(crossingDiceFrom(rows, "trzesawiska", 2)).toBe(1);
  });

  it("puts Hełm, Tarcza and Zbroja on the standing list as `oslona`", () => {
    const [row] = heldStatuses([heldCard({ cardId: "helm" })], "classic", null);
    expect(row.modifier).toEqual({ kind: "oslona", upTo: 1 });
    expect(row.ends).toEqual({ kind: "held" });
    expect(heldStatuses([heldCard({ cardId: "tarcza" })], "classic", null)[0].modifier).toEqual({
      kind: "oslona",
      upTo: 2,
    });
    expect(heldStatuses([heldCard({ cardId: "zbroja" })], "classic", null)[0].modifier).toEqual({
      kind: "oslona",
      upTo: 3,
    });
  });

  it("in slotowy, a packed Hełm shields nothing and a worn one does", () => {
    const packed = heldCard({ cardId: "helm", slot: null });
    const worn = heldCard({ cardId: "helm", slot: "main-hand" });
    expect(heldStatuses([packed], "slots", null)).toEqual([]);
    expect(shieldUpTo(heldStatuses([worn], "slots", null))).toBe(1);
  });

  /**
   * Koń, Muł, Zaprzęg, Magiczna Sakwa and the Tragarz (a Przyjaciel, filed
   * `kind: "friend"` — see docs/TASKS.md) are the five udzwig carriers, and
   * this is `derive.carryLimit`'s own reading of what they lend, moved.
   */
  it("puts Koń, Muł, Zaprzęg, Magiczna Sakwa and Tragarz on the standing list as `udzwig`", () => {
    expect(heldStatuses([heldCard({ cardId: "kon" })], "classic", null)[0].modifier).toEqual({
      kind: "udzwig",
      items: 8,
    });
    expect(heldStatuses([heldCard({ cardId: "mul" })], "classic", null)[0].modifier).toEqual({
      kind: "udzwig",
      items: 4,
    });
    expect(heldStatuses([heldCard({ cardId: "zaprzeg" })], "classic", null)[0].modifier).toEqual({
      kind: "udzwig",
      items: "bez-limitu",
    });
    expect(
      heldStatuses([heldCard({ cardId: "magiczna-sakwa" })], "classic", null)[0].modifier,
    ).toEqual({ kind: "udzwig", items: 5 });
    expect(
      heldStatuses([heldCard({ cardId: "tragarz", kind: "friend" })], "classic", null)[0]
        .modifier,
    ).toEqual({ kind: "udzwig", items: 4 });
  });

  it("in slotowy, a packed Koń carries nothing and a worn one does", () => {
    const packed = heldCard({ cardId: "kon", slot: null });
    const worn = heldCard({ cardId: "kon", slot: "mount" });
    expect(heldStatuses([packed], "slots", null)).toEqual([]);
    expect(carryBonus(heldStatuses([worn], "slots", null))).toBe(8);
  });

  /**
   * A behaviour change from the ad-hoc filter `derive.carryLimit` used to run
   * by hand: that filter required `inPlayAt(held.slot)` of *every* holding in
   * slotowy, and a Tragarz — a Przyjaciel, with nowhere the slotted variant
   * ever puts one — has no slot to be in, so its `udzwig` never lent anything
   * there. `inEffect` (holdings.ts), which `heldStatuses` reads instead,
   * already treats a card `!isWearable` (slots.ts) as always in effect
   * regardless of slot — the same rule every other Przyjaciel's bonus has
   * followed all along — so a held Tragarz now carries in slotowy too.
   */
  it("a Tragarz carries in slotowy too, having nowhere to be worn", () => {
    const carried = heldCard({ cardId: "tragarz", kind: "friend", slot: null });
    expect(carryBonus(heldStatuses([carried], "slots", null))).toBe(4);
  });

  /**
   * `lentBy` is the map both readers of "does this card lend points" consult
   * — `bonusFromHoldings`, summing a whole hand, and this file, projecting one
   * card's own points into a `Status` row. No card in the box today only has a
   * printed corner number and no encoded `punkty` Ability — every one of them
   * is either encoded, spent (`isUsable`), or a friend who fights on their own
   * account — so this pins the two readers agreeing on every card that *does*
   * lend something, rather than asserting a case nothing in `events.json`
   * exercises yet. If a future transcription adds a printed-only card, this
   * fails the moment `heldStatuses` stops reading `lentBy` for it.
   */
  it("agrees with bonusFromHoldings on every lending card in the box", async () => {
    const { bonusFromHoldings } = await import("./holdings");
    const events = (await import("@/data/events.json")).default as { id: string; cardClass: string }[];
    const lending = events.filter((c) => c.cardClass === "item" || c.cardClass === "friend");
    for (const card of lending) {
      const kind = card.cardClass === "friend" ? "friend" : "item";
      const held = heldCard({ cardId: card.id, kind: kind as "item" | "friend" });
      for (const as of ["parametr", "walka"] as const) {
        const fromStanding = bonusFrom(heldStatuses([held], "classic", null), as);
        const fromHoldings = bonusFromHoldings([{ ...held, face: "open" }], "classic", as);
        expect(fromStanding, card.id).toEqual(fromHoldings);
      }
    }
  });

  it("suppresses a held Przedmiot's points on the Zaczarowane Wzgórza, same as bonusFromHoldings", () => {
    const armed = [heldCard({ cardId: "srebrna-strzala" })];
    expect(heldStatuses(armed, "classic", null, asFieldId("zaczarowane-wzgorza"))).toEqual([]);
    expect(heldStatuses(armed, "classic", null, asFieldId("mroczna-polana")).length).toBeGreaterThan(0);
  });

  it("suppresses a Magiczny Przedmiot under the Wojna Żywiołów, same as bonusFromHoldings", () => {
    const magical = [heldCard({ cardId: "excalibur" })];
    expect(heldStatuses(magical, "classic", null, null, true)).toEqual([]);
    // A plain Miecz is not magical and keeps lending.
    expect(heldStatuses([heldCard({ cardId: "miecz" })], "classic", null, null, true).length).toBe(1);
  });
});

describe("what a player sees on a name", () => {
  it("marks a bonus up and a penalty down", () => {
    expect(markOf(status({ modifier: { kind: "points", miecz: 2 } })).tone).toBe("dobry");
    expect(markOf(status({ modifier: { kind: "points", miecz: -2 } })).tone).toBe("zly");
  });

  it("says the whole thing, and how long, in the hover", () => {
    const mark = markOf(status({ label: "+2 Miecza", ends: { kind: "turns", turns: 1 } }));
    expect(mark.title).toBe("+2 Miecza — do końca tej tury");
  });

  it("has a mark for every modifier there is", () => {
    // A closed union with a mark each: a new kind that forgets one is a
    // compile error, not a blank space on somebody's name.
    const all: Status["modifier"][] = [
      { kind: "points", miecz: 1 },
      { kind: "move-max", fields: 1 },
      { kind: "frozen" },
      { kind: "nature", to: "evil" },
      { kind: "barred", place: "most" },
      { kind: "note" },
    ];
    for (const modifier of all) {
      expect(markOf(status({ modifier })).glyph.length).toBeGreaterThan(0);
    }
  });
});

describe("how many dice a crossing takes (11.3)", () => {
  it("throws what the Obszar asks when nothing speaks", () => {
    expect(crossingDiceFrom([], "trzesawiska", 2)).toBe(2);
  });

  it("takes the fewest on offer, not the first found", () => {
    // Everything that speaks here speaks to make a crossing likelier, so two
    // of them are the better of the two rather than two rolls.
    const under = [
      status({ modifier: { kind: "przeprawa-kostki", obstacle: "trzesawiska", dice: 1 } }),
      status({ id: "b", modifier: { kind: "przeprawa-kostki", obstacle: "trzesawiska", dice: 2 } }),
    ];
    expect(crossingDiceFrom(under, "trzesawiska", 2)).toBe(1);
  });

  it("answers for the obstacle the card names and no other", () => {
    // „gdy będziesz przechodzić z Uroczyska do Lasu Błędnych Ogni" — a Rusałka
    // is no help at all at the Lodowy Las.
    const under = [
      status({ modifier: { kind: "przeprawa-kostki", obstacle: "trzesawiska", dice: 1 } }),
    ];
    expect(crossingDiceFrom(under, "lodowy-las", 2)).toBe(2);
  });
});

