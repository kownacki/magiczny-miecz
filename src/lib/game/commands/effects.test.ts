import { describe, expect, it } from "vitest";
import { scriptedRandom } from "@/lib/engine/ports";
import type { Effect } from "@/lib/engine/cardScript";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { applyEffect, resolveDrawnCard, resolveFieldOffer, spendHolding } from "./effects";
import { EVENT_COPIES } from "../decks";
import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";

/** Piles are not shuffled in these; the order in is the order out. */
const asIs = <T,>(items: readonly T[]): T[] => [...items];

const run = (
  effect: Effect,
  table = aTable({ seats: [aSeat({ id: "seat-a", seat_index: 0 })] }),
  over: { decided?: Parameters<typeof applyEffect>[1]["decided"]; random?: ReturnType<typeof scriptedRandom> } = {},
) =>
  applyEffect(
    table,
    { seatId: "seat-a", effect, reason: "KARTA", decided: over.decided, shuffle: asIs },
    ports(over.random ? { random: over.random } : {}),
  );

describe("carrying out what a Karta says", () => {
  it("does nothing, and says so", async () => {
    const { writes, result } = await run({ op: "nic" });
    expect(writes).toEqual({});
    expect(result).toEqual({ did: ["nic się nie dzieje"], pending: null });
  });

  it("moves points and declines the noun", async () => {
    const { writes, result } = await run({ op: "punkty", stat: "sword", delta: 2, target: "ty" });
    expect(result.did).toEqual(["+2 Miecza"]);
    expect(writes.seats?.[0]).toMatchObject({ id: "seat-a", patch: { sword_own: 4 } });
    expect(writes.journal?.[0]).toMatchObject({ kind: "points", manual: false });
  });

  it("declines Złoto, which is the one that declines", async () => {
    expect((await run({ op: "punkty", stat: "gold", delta: 1, target: "ty" })).result.did).toEqual([
      "+1 Sztukę Złota",
    ]);
    expect((await run({ op: "punkty", stat: "gold", delta: 3, target: "ty" })).result.did).toEqual([
      "+3 Sztuki Złota",
    ]);
    expect((await run({ op: "punkty", stat: "gold", delta: 7, target: "ty" })).result.did).toEqual([
      "+7 Sztuk Złota",
    ]);
  });

  /**
   * The property the whole shape exists for.
   *
   * Each step reads a table that already shows what the step before it wrote.
   * Against the raw snapshot both steps would compute from Miecz 2 and the
   * second would overwrite the first, so +1 then +1 would land on 3.
   */
  it("lets a later step see what an earlier one did", async () => {
    const { writes } = await run({
      op: "po-kolei",
      steps: [
        { op: "punkty", stat: "sword", delta: 1, target: "ty" },
        { op: "punkty", stat: "sword", delta: 1, target: "ty" },
      ],
    });
    // Two patches for one row, folded in order by `apply` exactly as `commit`
    // applies them: 2 → 3 → 4.
    expect(writes.seats?.map((s) => s.patch)).toEqual([{ sword_own: 3 }, { sword_own: 4 }]);
  });

  /**
   * `isSettled` asks about the whole sequence before any of it runs, and a
   * `po-kolei` is settled only if every step is — so one undecided step stops
   * the card at the door rather than half-way down it. Nothing is written, and
   * the player is asked.
   */
  it("does not start a sequence that has an undecided step in it", async () => {
    const undecided: Effect = {
      op: "po-kolei",
      steps: [
        { op: "punkty", stat: "sword", delta: 1, target: "ty" },
        { op: "wybor", options: [{ label: "A", effect: { op: "nic" } }] },
      ],
    };
    const { writes, result } = await run(undecided);
    expect(writes).toEqual({});
    expect(result).toEqual({ did: [], pending: undecided });
  });
});

describe("a choice the player makes", () => {
  const choice: Effect = {
    op: "wybor",
    options: [
      { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1, target: "ty" } },
      { label: "nic", effect: { op: "nic" } },
    ],
  };

  it("waits when nobody has picked", async () => {
    const { writes, result } = await run(choice);
    expect(writes).toEqual({});
    expect(result.pending).toBe(choice);
  });

  it("takes the branch the number points at", async () => {
    const { result } = await run(choice, undefined, { decided: { choices: [1] } });
    expect(result).toEqual({ did: ["nic", "nic się nie dzieje"], pending: null });
  });

  /** An option called "+1 Miecza" whose effect says "+1 Miecza" is not said twice. */
  it("does not write the label down twice", async () => {
    const { result } = await run(choice, undefined, { decided: { choices: [0] } });
    expect(result.did).toEqual(["+1 Miecza"]);
  });
});

describe("a condition on the character (gdy)", () => {
  const onNature = (na: "good" | "evil"): Effect => ({
    op: "gdy",
    warunek: { is: "natura", jedna_z: [na] },
    to: { op: "punkty", stat: "magic", delta: 1, target: "ty" },
  });

  it("takes the branch when it holds", async () => {
    const good = aTable({ seats: [aSeat({ id: "seat-a", nature: "good" })] });
    expect((await run(onNature("good"), good)).result.did).toEqual(["+1 Magii"]);
  });

  it("says so when it does not, rather than doing nothing quietly", async () => {
    const good = aTable({ seats: [aSeat({ id: "seat-a", nature: "good" })] });
    const { writes, result } = await run(onNature("evil"), good);
    expect(writes).toEqual({});
    expect(result.did).toEqual(["warunek niespełniony — nic się nie dzieje"]);
  });

  it("reads the purse for ma-zloto", async () => {
    const broke = aTable({ seats: [aSeat({ id: "seat-a", gold: 0 })] });
    const { result } = await run(
      { op: "gdy", warunek: { is: "ma-zloto" }, to: { op: "nic" } },
      broke,
    );
    expect(result.did).toEqual(["warunek niespełniony — nic się nie dzieje"]);
  });
});

describe("losing a turn (16.1)", () => {
  const table = () =>
    aTable({
      game: { active_seat: 0 },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, player_name: "Michał" }),
        aSeat({
          id: "seat-b",
          seat_index: 1,
          player_name: "Ania",
          character_id: asSeatCharacter("mag"),
        }),
      ],
    });

  /**
   * "TA WŁAŚNIE tura liczy się jako stracona."
   *
   * The player who drew it has already moved and already arrived; what the card
   * takes is the rest of this turn. Banking it forward as well would cost them
   * two turns for one — and let them keep acting through a turn the rules had
   * closed, which is why the phase goes to `koniec`.
   */
  it("spends the turn in progress on the character who drew it", async () => {
    const { writes, result } = await run({ op: "tura-stracona", turns: 1, target: "ty" }, table());
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { turns_lost: 0 } }]);
    expect(writes.game?.turn_state).toEqual({ phase: "end" });
    expect(result.did).toEqual(["tracisz 1 turę"]);
  });

  it("banks it for everybody who is not playing", async () => {
    const { writes, result } = await run(
      { op: "tura-stracona", turns: 1, target: "wszyscy" },
      table(),
    );
    expect(writes.seats).toEqual([
      { id: "seat-a", patch: { turns_lost: 0 } },
      { id: "seat-b", patch: { turns_lost: 1 } },
    ]);
    expect(result.did).toEqual(["tracą turę: Michał, Ania"]);
  });

  /** `oprocz` names Karty Postaci the card lets off, not seats. */
  it("leaves the turn alone when it lands on nobody who is playing", async () => {
    const { writes } = await run(
      { op: "tura-stracona", turns: 1, target: "wszyscy", oprocz: ["goblin"] },
      table(),
    );
    expect(writes.seats).toEqual([{ id: "seat-b", patch: { turns_lost: 1 } }]);
    expect(writes.game).toBeUndefined();
  });
});

describe("losing what you carry (strata)", () => {
  const carrying = () =>
    aTable({
      seats: [aSeat({ id: "seat-a", gold: 3 })],
      holdings: [
        aHolding({ id: "h1", card_id: "helm", kind: "item" }),
        aHolding({ id: "h2", card_id: "miecz", kind: "item" }),
        aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" }),
      ],
    });

  it("takes everything of a kind when the card says wszystkie", async () => {
    const { writes } = await run({ op: "strata", co: "wszystkie-przedmioty", target: "ty" }, carrying());
    expect(writes.holdings?.delete?.sort()).toEqual(["h1", "h2"]);
  });

  /** The die picks, and it picks from a pool that shrinks — see the comment. */
  it("picks at random when the card says losowo, and spends one die per pick", async () => {
    const random = scriptedRandom([1]);
    const { writes } = await run(
      { op: "strata", co: "przedmiot", count: 1, wybor: "losowo", target: "ty" },
      carrying(),
      { random },
    );
    expect(writes.holdings?.delete).toHaveLength(1);
    // Exactly one pick was asked for, so exactly one die was spent.
    await expect(random.rollD6("a second")).rejects.toThrow(/exhausted/);
  });

  it("waits rather than choosing for somebody when the choice is theirs (5.6)", async () => {
    const { writes, result } = await run(
      { op: "strata", co: "przedmiot", count: 1, wybor: "ty", target: "ty" },
      carrying(),
    );
    expect(writes).toEqual({});
    expect(result.pending).toMatchObject({ op: "strata" });
  });

  it("takes gold off the seat rather than out of the pack (3.5)", async () => {
    const { writes } = await run({ op: "strata", co: "gold", count: 2, target: "ty" }, carrying());
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 1 } }]);
    expect(writes.holdings).toBeUndefined();
  });

  it("says there was nothing to lose rather than pretending something happened", async () => {
    const empty = aTable({ seats: [aSeat({ id: "seat-a", gold: 0 })] });
    const { writes, result } = await run(
      { op: "strata", co: "wszystkie-przedmioty", target: "ty" },
      empty,
    );
    expect(writes).toEqual({});
    expect(result.did).toEqual(["nie ma czego stracić"]);
  });
});

describe("the rest of the vocabulary", () => {
  it("heals up to the starting level, and says so when there is nothing to heal", async () => {
    const hurt = aTable({ seats: [aSeat({ id: "seat-a", life: 2 })] });
    expect((await run({ op: "uzdrow", upTo: 1 }, hurt)).result.did).toEqual(["+3 Życia (4.7)"]);

    const whole = aTable({ seats: [aSeat({ id: "seat-a", life: 4 })] });
    const { writes, result } = await run({ op: "uzdrow", upTo: 1 }, whole);
    expect(writes).toEqual({});
    expect(result.did).toEqual(["Życie już na poziomie początkowym"]);
  });

  it("turns a character to stone", async () => {
    const { writes, result } = await run({ op: "kamien" });
    expect(result.did).toEqual(["Zamiana w Kamień (20.1)"]);
    expect(writes.journal?.[0]).toMatchObject({ kind: "stone" });
  });

  it("changes a Natura and names it the way Polish does", async () => {
    const { result } = await run({ op: "natura", na: "evil" });
    expect(result.did).toEqual(["Natura: zła"]);
  });

  it("moves a figure to the Obszar the card names", async () => {
    const { writes, result } = await run({
      op: "przenies",
      to: { kind: "pole", fieldId: "karczma" },
    });
    expect(result.did).toEqual(["przenosisz się na: Karczma"]);
    expect(writes.seats?.[0]).toMatchObject({ patch: { field_id: "karczma" } });
  });

  it("waits for a destination when the card leaves it open", async () => {
    const open: Effect = { op: "przenies", to: { kind: "dowolne-w-kregu" } };
    const { writes, result } = await run(open);
    expect(writes).toEqual({});
    expect(result.pending).toBe(open);
  });

  it("opens a fight with a creature the card conjures", async () => {
    const arrived = aTable({
      game: {
        active_seat: 0,
        turn_state: { phase: "field", fieldId: "karczma", from: null, draw: 0, drawn: [] },
      },
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "karczma" })],
    });
    const { writes, result } = await run(
      { op: "walka", nazwa: "miejscowy osiłek", miecz: 4 },
      arrived,
    );
    expect(result.did).toEqual(["walka: miejscowy osiłek"]);
    expect((writes.game?.turn_state as { phase: string }).phase).toBe("fight");
  });

  it("hands an extra move back to the turn rather than taking it itself", async () => {
    const { writes, result } = await run({ op: "ruch-dodatkowy" });
    expect(writes).toEqual({});
    expect(result.did).toEqual(["dodatkowy ruch — rzuć jeszcze raz"]);
  });
});

/* --------------------------------------------------------------------------
 * The three doors.
 * ----------------------------------------------------------------------- */


const holding = (cardId: string) =>
  aTable({
    game: { active_seat: 0 },
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "karczma" })],
    holdings: [aHolding({ id: "h1", card_id: cardId, kind: "item" })],
  });

describe("spending a Karta that is used up by using it", () => {
  it("refuses a Zaklęcie, which is spoken rather than used (9.6)", async () => {
    const hand = aTable({
      seats: [aSeat({ id: "seat-a" })],
      holdings: [aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" })],
    });
    await expect(
      spendHolding(hand, { holdingId: "s1", shuffle: asIs }, ports()),
    ).rejects.toThrow(/rzuca, nie używa/);
  });

  it("refuses a Karta that is not spent by being used", async () => {
    await expect(
      spendHolding(holding("helm"), { holdingId: "h1", shuffle: asIs }, ports()),
    ).rejects.toThrow(/się nie zużywa/);
  });

  /** "Po wypiciu Eliksiru, Postać zyskuje na 1 turę dodatkowe 2 punkty Miecza." */
  it("puts a character under what the card bought, and spends the card", async () => {
    const { writes, result } = await spendHolding(
      holding("eliksir-sily"),
      { holdingId: "h1", shuffle: asIs },
      ports(),
    );
    expect(writes.holdings?.delete).toEqual(["h1"]);
    expect(writes.effects?.insert?.[0]).toMatchObject({
      source: "eliksir-sily",
      modifier: { kind: "points", miecz: 2 },
      ends: { kind: "turns", turns: 1 },
    });
    expect(result).toEqual({ card: "ELIKSIR SIŁY", did: ["+2 Miecza"], stol: false });
  });

  it("puts the spent Karta on the used pile, not out of the game", async () => {
    const { writes } = await spendHolding(
      holding("eliksir-sily"),
      { holdingId: "h1", shuffle: asIs },
      ports(),
    );
    const decks = writes.game?.deck as { events: { discard: string[] } };
    expect(decks.events.discard).toEqual([(EVENT_COPIES.get("eliksir-sily") ?? [])[0]]);
  });

  /** The Szkatuła's own table: one die, then whichever face it landed on. */
  it("rolls a card whose script is a table, and reports the face", async () => {
    const { result } = await spendHolding(
      holding("tajemnicza-szkatula"),
      { holdingId: "h1", shuffle: asIs },
      ports({ random: scriptedRandom([3]) }),
    );
    expect(result.face).toBe(3);
    expect(result.did).toEqual(["+2 Sztuki Złota"]);
    expect(result.stol).toBe(false);
  });

  /**
   * A face the app cannot finish is handed back rather than dropped.
   *
   * Face 1 is the Tarcza Tolimana — a Karta somebody has to pass across the
   * table — so the card is still spent and the rest is the table's.
   */
  it("hands back what it cannot finish", async () => {
    const { result } = await spendHolding(
      holding("tajemnicza-szkatula"),
      { holdingId: "h1", shuffle: asIs },
      ports({ random: scriptedRandom([1]) }),
    );
    expect(result.stol).toBe(true);
    expect(result.did.length).toBeGreaterThan(0);
  });
});

describe("an Obszar's own table (15.1)", () => {
  const standing = (name: string) => {
    const fieldId = asFieldId(name)!;
    return aTable({
      game: {
        active_seat: 0,
        turn_state: { phase: "field", fieldId, from: null, draw: 0, drawn: [] },
      },
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: fieldId })],
    });
  };

  it("refuses an offer this Obszar does not make", async () => {
    await expect(
      resolveFieldOffer(standing("karczma"), { offerName: "Lichwiarz", shuffle: asIs }, ports()),
    ).rejects.toThrow(/nie ma: Lichwiarz/);
  });

  it("refuses before the character has arrived", async () => {
    const rolling = aTable({
      game: { active_seat: 0, turn_state: { phase: "roll" } },
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "karczma" })],
    });
    await expect(
      resolveFieldOffer(rolling, { offerName: "Karczma", shuffle: asIs }, ports()),
    ).rejects.toThrow(/po wejściu na Obszar/);
  });

  it("rolls the table, says the face, and notes the offer as settled", async () => {
    const { writes, result } = await resolveFieldOffer(
      standing("karczma"),
      { offerName: "Karczma", shuffle: asIs },
      ports({ random: scriptedRandom([1]) }),
    );
    expect(result.offer).toBe("Karczma");
    expect(result.face).toBe(1);
    expect(writes.journal?.[0]).toMatchObject({ kind: "field-table", payload: { face: 1 } });
    const state = writes.game?.turn_state as { resolved?: string[] };
    expect(state.resolved).toContain("pole:Karczma");
  });

  /** A table the app rolled itself is not a human overruling the referee. */
  it("marks a typed-in face as manual and an app roll as not", async () => {
    const app = await resolveFieldOffer(
      standing("karczma"),
      { offerName: "Karczma", shuffle: asIs },
      ports({ random: scriptedRandom([2]) }),
    );
    expect(app.writes.journal?.[0]).toMatchObject({ manual: false });

    const typed = await resolveFieldOffer(
      standing("karczma"),
      { offerName: "Karczma", manual: true, shuffle: asIs },
      ports({ random: scriptedRandom([2]) }),
    );
    expect(typed.writes.journal?.[0]).toMatchObject({ manual: true });
  });
});

describe("a Karta drawn onto the Obszar (16.1)", () => {
  const drawn = (cardId: string) =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "karczma",
          from: null,
          draw: 1,
          drawn: [{ cardId, cardClass: "encounter" }],
        },
      },
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "karczma" })],
    });

  it("refuses a Karta that is not lying here", async () => {
    await expect(
      resolveDrawnCard(drawn("zaraza"), { cardId: "smok", shuffle: asIs }, ports()),
    ).rejects.toThrow(/Tej Karty tu nie ma/);
  });

  it("hands an untranscribed Karta to the table rather than guessing", async () => {
    const unknown = drawn("nie-ma-takiej-karty");
    await expect(
      resolveDrawnCard(unknown, { cardId: "nie-ma-takiej-karty", shuffle: asIs }, ports()),
    ).rejects.toThrow(/rozpatrzcie sami/);
  });

  it("carries the card out and notes it settled", async () => {
    const { writes, result } = await resolveDrawnCard(
      drawn("zaraza"),
      { cardId: "zaraza", shuffle: asIs },
      ports(),
    );
    expect(result.card).toBe("ZARAZA");
    expect(result.pending).toBeNull();
    const state = writes.game?.turn_state as { resolved?: string[] };
    expect(state.resolved).toContain("zaraza");
  });
});
