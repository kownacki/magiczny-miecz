import { top } from "@/lib/engine/stack";
import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports, pressDalej } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFieldOffer } from "./resolving";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { breakFree } from "./friends";
import { beginFight } from "./fight";
import { movementCap } from "@/lib/engine/status";
import { storedStatuses } from "./turn";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";

/**
 * Obszary that do something to whoever stops on them.
 *
 * Until these were scripted the board's text was shown and the players applied
 * it themselves — so the Ruchome Skały cost nothing, the Bagna took nothing,
 * and the three cards that guard against them (Rękawice, Święty Graal, Kij i
 * Sznur) had nothing to guard against.
 */

const standing = (field: FieldId, cards: string[] = []) =>
  aTable({
    game: {
      turn_state: {
        phase: "field",
        fieldId: field,
        from: null,
        draw: 0,
        drawn: [],
        resolved: [],
      } as TurnPhase,
      active_seat: 0,
    },
    seats: [aSeat({ id: "seat-a", field_id: field, life: 4, nature: "good" })],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
    ),
  });

/**
 * Arriving, throwing whatever the square throws, and pressing „Dalej".
 *
 * A die suspends the offer over the row it landed in until the player says go
 * on (`heldAt`), so a visit is both halves — which is what a player does, and
 * `resume` is the same call their button makes. It does nothing at all to an
 * Obszar that never rolled.
 */
const arrive = async (table: ReturnType<typeof standing>, field: FieldId, choices: number[] = []) => {
  const owed = compulsoryOffer(field, []);
  if (!owed) throw new Error(`nothing owed at ${field}`);
  const dice = { random: scriptedRandom([1, 1, 1]) };
  const out = await resolveFieldOffer(
    table,
    { offerName: owed.name, decided: { choices }, shuffle: (items) => [...items] },
    ports(dice),
  );
  const done = await pressDalej(table, out, dice);
  return { out, said: done.did, after: apply(table, done.writes) };
};

describe("the Ruchome Skały (Tracisz 1 Życie)", () => {
  it("takes the point from whoever stops there", async () => {
    const table = standing("ruchome-skaly-1");
    expect((await arrive(table, "ruchome-skaly-1")).after.seats[0].life).toBe(3);
  });

  /** It is compulsory: the board states it flat, with no "MOŻESZ" anywhere. */
  it("is owed on arrival rather than offered", () => {
    expect(compulsoryOffer("ruchome-skaly-1", [])).not.toBeNull();
  });

  it("is kept by the Rękawice and by the Święty Graal", async () => {
    for (const card of ["rekawice", "swiety-graal"]) {
      const table = standing("ruchome-skaly-1", [card]);
      const { after, out } = await arrive(table, "ruchome-skaly-1");
      expect(after.seats[0].life).toBe(4);
      expect(out.result.did.join(" ")).toMatch(/chroni na tym Obszarze/);
    }
  });

  it("does the same at the other one", async () => {
    const table = standing("ruchome-skaly-2");
    expect((await arrive(table, "ruchome-skaly-2")).after.seats[0].life).toBe(3);
  });
});

describe("the Bagna (Tracisz 1 Przedmiot lub Przyjaciela, wedle własnego wyboru)", () => {
  /**
   * Two decisions, in order: which kind, then which card. 5.6 makes both the
   * holder's, and until this field existed nothing in the box used that shape —
   * so a loss the holder chose could be asked and never answered.
   */
  it("takes the card the holder names", async () => {
    const table = standing("bagna-1", ["helm"]);
    const { after, out } = await arrive(table, "bagna-1", [0, 0]);
    expect(after.holdings).toHaveLength(0);
    expect(out.result.pending).toBeNull();
    expect(out.result.did.join(" ")).toMatch(/HEŁM/);
  });

  it("stays a question while nobody has answered it", async () => {
    const table = standing("bagna-1", ["helm"]);
    const { after, out } = await arrive(table, "bagna-1", [0]);
    expect(out.result.pending).not.toBeNull();
    expect(after.holdings).toHaveLength(1);
  });

  it("is kept whole by the Kij i Sznur", async () => {
    const table = standing("bagna-1", ["helm", "kij-i-sznur"]);
    const { after, out } = await arrive(table, "bagna-1", [0, 0]);
    expect(after.holdings).toHaveLength(2);
    expect(out.result.did.join(" ")).toMatch(/nic nie traci/);
  });

  it("can be paid with a Przyjaciel instead", async () => {
    const table = aTable({
      game: {
        turn_state: {
          phase: "field", fieldId: "bagna-2", from: null, draw: 0, drawn: [], resolved: [],
        } as TurnPhase,
        active_seat: 0,
      },
      seats: [aSeat({ id: "seat-a", field_id: "bagna-2", nature: "good" })],
      holdings: [
        aHolding({ id: "h0", seat_id: "seat-a", card_id: "helm", kind: "item" }),
        aHolding({ id: "h1", seat_id: "seat-a", card_id: "pasterz", kind: "friend" }),
      ],
    });
    // Option 1 is the Przyjaciel; then the first (only) candidate of that kind.
    const { after } = await arrive(table, "bagna-2", [1, 0]);
    expect(after.holdings.map((h) => h.card_id)).toEqual(["helm"]);
  });
});


/**
 * The five Obszary that make you roll.
 *
 * All five print "MUSISZ RZUCIĆ KOSTKĄ" or the same in other words, so all five
 * are compulsory — and all five are what the `bezpieczny` cards *and* four of
 * the Postacie were written to walk past. Until the tables existed there was no
 * roll for any of them to skip.
 *
 * `awanturnik` throughout: twenty-one of the twenty-seven Postacie carry no
 * protection of their own, and the Goblin and the Barbarzyńca — the fixture's
 * usual stand-ins — both happen to walk past two of these fields for free.
 */
const rolling = (field: FieldId, die: number, cards: string[] = []) =>
  aTable({
    game: {
      turn_state: {
        phase: "field", fieldId: field, from: null, draw: 0, drawn: [], resolved: [],
      } as TurnPhase,
      active_seat: 0,
    },
    seats: [
      aSeat({
        id: "seat-a",
        character_id: asSeatCharacter("awanturnik"),
        field_id: field,
        nature: "good",
      }),
    ],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "friend" }),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as ReturnType<typeof standing>;

const face = async (field: FieldId, die: number, cards: string[] = []) => {
  const owed = compulsoryOffer(field, []);
  if (!owed) throw new Error(`nothing owed at ${field}`);
  const table = rolling(field, die, cards);
  const dice = { random: scriptedRandom([die, die, die]) };
  const out = await resolveFieldOffer(
    table,
    { offerName: owed.name, decided: {}, shuffle: (items) => [...items] },
    ports(dice),
  );
  // What the row did, which the throw does not say yet: the face waits for
  // „Dalej" and the words come with what it then carries out.
  return (await pressDalej(table, out, dice)).did.join("; ");
};

describe("Obszary that make you roll", () => {
  it("reads the Kurhan's table off the board", async () => {
    expect(await face("kurhan", 1)).toMatch(/\+1 Miecza/);
    expect(await face("kurhan", 2)).toMatch(/nic się nie dzieje/);
    expect(await face("kurhan", 4)).toMatch(/tracisz 1 turę/);
    expect(await face("kurhan", 6)).toMatch(/Duch/);
  });

  /** The same creature at three strengths, not three creatures. */
  it("sets the Wilkołak's Miecz from the die", async () => {
    expect(await face("wilczy-parow", 3)).toMatch(/nic się nie dzieje/);
    expect(await face("wilczy-parow", 4)).toMatch(/Wilkołak/);
    expect(await face("wilczy-parow", 6)).toMatch(/Wilkołak/);
  });

  it("does the same for the Upiór, in Magia", async () => {
    expect(await face("krypta-upiorow", 1)).toMatch(/nic się nie dzieje/);
    expect(await face("krypta-upiorow", 5)).toMatch(/Upiór/);
  });

  it("reads the Krąg Mocy and the Wieża Przeznaczenia", async () => {
    expect(await face("krag-mocy", 1)).toMatch(/Strażnik/);
    expect(await face("krag-mocy", 6)).toMatch(/\+1 Magii/);
    expect(await face("wieza-przeznaczenia", 2)).toMatch(/Kamień/);
    expect(await face("wieza-przeznaczenia", 4)).toMatch(/dodatkowy ruch/);
  });

  /**
   * "nie musisz wykonywać rzutów kostką ... Zawsze możesz tamtędy bezpiecznie
   * przejść." The roll does not happen, and neither does whatever it would have
   * found — which is why the good faces are skipped along with the bad.
   */
  it("is walked past by the Przyjaciele written for it", async () => {
    expect(await face("krag-mocy", 1, ["przewodnik"])).toMatch(/bezpiecznie — bez rzutu/);
    expect(await face("wilczy-parow", 6, ["przewodnik"])).toMatch(/bezpiecznie — bez rzutu/);
    expect(await face("krypta-upiorow", 6, ["przewodnik"])).toMatch(/bezpiecznie — bez rzutu/);
    expect(await face("wieza-przeznaczenia", 2, ["opiekun"])).toMatch(/bezpiecznie — bez rzutu/);
    expect(await face("kurhan", 6, ["rusalka"])).toMatch(/bezpiecznie — bez rzutu/);
    // Even the face that would have been a gift.
    expect(await face("kurhan", 1, ["rusalka"])).toMatch(/bezpiecznie — bez rzutu/);
  });

  /** A Postać's own ability does it too — the Goblin at these two, for nothing. */
  it("is walked past by a Postać whose own Karta says so", async () => {
    const goblin = aTable({
      game: {
        turn_state: {
          phase: "field", fieldId: "krag-mocy", from: null, draw: 0, drawn: [], resolved: [],
        } as TurnPhase,
        active_seat: 0,
      },
      seats: [aSeat({ id: "seat-a", field_id: "krag-mocy", nature: "good" })],
    });
    const out = await resolveFieldOffer(
      goblin,
      { offerName: "Krąg Mocy", decided: {}, shuffle: (items) => [...items] },
      ports({ random: scriptedRandom([1]) }),
    );
    expect(out.result.did.join(" ")).toMatch(/bezpiecznie — bez rzutu/);
  });
});


/**
 * The two Obszary that ask what Natura you are.
 *
 * Both were read off the board scan rather than trusted from the transcription,
 * because a mis-split here costs the wrong Natura a point of Życie. Both came
 * back matching, and the Studnia came back with something missing that the
 * Relikwiarz claims — see the note on its script.
 */
const asNature = (field: FieldId, nature: "good" | "evil" | "chaotic", cards: string[] = []) =>
  aTable({
    game: {
      turn_state: {
        phase: "field", fieldId: field, from: null, draw: 0, drawn: [], resolved: [],
      } as TurnPhase,
      active_seat: 0,
    },
    seats: [
      aSeat({
        id: "seat-a",
        character_id: asSeatCharacter("awanturnik"),
        field_id: field,
        life: 3,
        nature,
      }),
    ],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
    ),
  });

const visit = async (
  field: FieldId,
  offer: string,
  nature: "good" | "evil" | "chaotic",
  die: number,
  choices: number[] = [],
  cards: string[] = [],
) => {
  const table = asNature(field, nature, cards);
  const dice = { random: scriptedRandom([die, die, die]) };
  const out = await resolveFieldOffer(
    table,
    { offerName: offer, decided: { choices }, shuffle: (items) => [...items] },
    ports(dice),
  );
  const done = await pressDalej(table, out, dice);
  return { said: done.did.join("; "), life: apply(table, done.writes).seats[0].life };
};

describe("the Czarci Młyn, which asks your Natura first", () => {
  /** "Dobry - tracisz 1 Życie" — no die for them at all. */
  it("takes a point from a Dobra Postać", async () => {
    expect((await visit("czarci-mlyn", "Czarci Młyn", "good", 1)).life).toBe(2);
  });

  it("is the Obszar the Relikwiarz spares a Dobra Postać at", async () => {
    const { life, said } = await visit("czarci-mlyn", "Czarci Młyn", "good", 1, [], ["relikwiarz"]);
    expect(life).toBe(3);
    expect(said).toMatch(/chroni na tym Obszarze/);
  });

  /** "Chaotyczny - rzuć kostką 1, 2, 3 - zyskujesz 1 Życie; 4, 5, 6 - tracisz 1 Życie" */
  it("makes a Chaotyczna Postać roll for it, either way", async () => {
    expect((await visit("czarci-mlyn", "Czarci Młyn", "chaotic", 2)).life).toBe(4);
    expect((await visit("czarci-mlyn", "Czarci Młyn", "chaotic", 5)).life).toBe(2);
  });

  /**
   * "Zły - możesz wezwać Siły Ciemności" — the only optional branch, and
   * declining is a real answer: two of its six faces are bad.
   */
  it("lets a Zła Postać call on the Siły Ciemności, or not", async () => {
    expect((await visit("czarci-mlyn", "Czarci Młyn", "evil", 1, [0])).said).toMatch(/\+1 Miecza/);
    expect((await visit("czarci-mlyn", "Czarci Młyn", "evil", 6, [0])).life).toBe(2);

    const declined = await visit("czarci-mlyn", "Czarci Młyn", "evil", 6, [1]);
    expect(declined.life).toBe(3);
    expect(declined.said).toMatch(/Nie wzywaj/);
  });
});

describe("the Studnia Wieczności, which only answers a Dobra Postać", () => {
  /** "możesz odzyskać punkty Życia z początku gry" — 4.7 caps it at the four. */
  it("restores what the character started with", async () => {
    expect((await visit("studnia-wiecznosci", "Studnia Wieczności", "good", 1, [0])).life).toBe(4);
  });

  it("or rolls the water's own table instead", async () => {
    expect((await visit("studnia-wiecznosci", "Studnia Wieczności", "good", 4, [1])).life).toBe(4);
    expect((await visit("studnia-wiecznosci", "Studnia Wieczności", "good", 1, [1])).life).toBe(3);
  });

  /**
   * The whole sentence hangs off "Jeżeli jesteś Dobry", so nobody else is
   * offered anything — and no face of the table is a loss, for any Natura.
   * The Relikwiarz says a Zła Postać "nie traci punktu Życia przy Studni
   * Wieczności"; the Obszar has no such clause, checked twice against the scan.
   */
  it("does nothing at all to any other Natura", async () => {
    for (const nature of ["evil", "chaotic"] as const) {
      const { life, said } = await visit("studnia-wiecznosci", "Studnia Wieczności", nature, 4);
      expect(life).toBe(3);
      expect(said).toMatch(/nic się nie dzieje/);
    }
  });
});


/**
 * The two Świątynie — the only two-die tables in the box.
 *
 * Eleven rows each, so the middle is far likelier than the ends, and both are
 * offers: "MOŻESZ MODLIĆ SIĘ". Between them they were the first callers for
 * three things the vocabulary had and nothing used — a two-die table, a Karta
 * the Obszar simply gives you, and a status a card can actually cause.
 */
const praying = (field: FieldId) =>
  aTable({
    game: {
      turn_state: {
        phase: "field", fieldId: field, from: null, draw: 0, drawn: [], resolved: [],
      } as TurnPhase,
      active_seat: 0,
    },
    seats: [
      aSeat({
        id: "seat-a",
        character_id: asSeatCharacter("awanturnik"),
        field_id: field,
        life: 3,
        nature: "good",
      }),
    ],
  });

/** Two dice summing to what the row needs. */
const pair = (sum: number): number[] => {
  const first = Math.min(6, sum - 1);
  return [first, sum - first];
};

const pray = async (field: FieldId, sum: number, choices: number[] = []) => {
  const table = praying(field);
  const dice = { random: scriptedRandom([...pair(sum), 1, 1]) };
  const out = await resolveFieldOffer(
    table,
    { offerName: "Modlitwa", decided: { choices }, shuffle: (items) => [...items] },
    ports(dice),
  );
  const done = await pressDalej(table, out, dice);
  return { said: done.did, after: apply(table, done.writes) };
};

describe("the two Świątynie, and their two dice", () => {
  it("reads the row the pair of dice actually landed on", async () => {
    expect((await pray("swiatynia-bogini-nemed", 2)).after.seats[0].life).toBe(5);
    expect((await pray("swiatynia-bogini-nemed", 12)).after.seats[0].life).toBe(1);
    expect((await pray("swiatynia-tolimana", 11)).after.seats[0].life).toBe(4);
  });

  /** "otrzymujesz Magiczny Miecz (jeżeli jeszcze jakieś są)" */
  it("hands over the Karta the row names", async () => {
    const nemed = await pray("swiatynia-bogini-nemed", 11);
    expect(nemed.after.holdings.map((h) => h.card_id)).toContain("magiczny-miecz");

    const toliman = await pray("swiatynia-tolimana", 10);
    expect(toliman.after.holdings.map((h) => h.card_id)).toContain("tarcza-tolimana");
  });

  /**
   * A gift the character may not accept is said out loud rather than thrown.
   * The Awanturnik's Magia allows no Zaklęcia at all (2.6), and this row used
   * to abort the whole prayer with a stack trace.
   */
  it("says why a gift could not be taken, and finishes the prayer", async () => {
    const { said, after } = await pray("swiatynia-bogini-nemed", 7);
    expect(said.join(" ")).toMatch(/2\.6/);
    // Finished: the prayer's frame is off and the Obszar is underneath again.
    expect(after.game.turn_state.stack).toHaveLength(1);
  });

  it("takes both points where the row says both", async () => {
    const { said } = await pray("swiatynia-tolimana", 3);
    expect(said.join(" ")).toMatch(/Magii/);
    expect(said.join(" ")).toMatch(/Miecza/);
  });
});

describe("being held in place, and throwing to get out", () => {
  /**
   * "zostałeś opętany, pozostaniesz tu, dopóki nie wyrzucisz podczas swojej
   * tury 1, 2 lub 3 oczek (na 1 kostce)" — a cap of nought on how far you may
   * walk, and an ending that is neither a countdown nor something anybody else
   * can lift.
   */
  it("caps the character's movement at nothing", async () => {
    const { after } = await pray("swiatynia-tolimana", 9);
    expect(movementCap(storedStatuses(after, "seat-a"))).toBe(0);
  });

  it("keeps holding on a high roll and lets go on a low one", async () => {
    const { after } = await pray("swiatynia-bogini-nemed", 9);

    const missed = await breakFree(after, {}, ports({ random: scriptedRandom([5]) }));
    expect(missed.result.freed).toHaveLength(0);
    expect(movementCap(storedStatuses(apply(after, missed.writes), "seat-a"))).toBe(0);

    const escaped = await breakFree(after, {}, ports({ random: scriptedRandom([3]) }));
    expect(escaped.result.freed).toHaveLength(1);
    expect(movementCap(storedStatuses(apply(after, escaped.writes), "seat-a"))).toBeNull();
  });

  it("refuses to throw when nothing is holding you", async () => {
    await expect(breakFree(praying("swiatynia-tolimana"), {}, ports())).rejects.toThrow(
      /Nic cię tu nie trzyma/,
    );
  });
});


/**
 * The Urwisko, which throws for the character and again for each Przyjaciel.
 *
 * "Rzuć kostką: 1 lub 2 oczka oznaczają, że tracisz 1 Życie. Rzuć także za
 * każdego z Przyjaciół: 1 lub 2 oczka Przyjaciel traci Życie." So a character
 * walking the cliff with three friends throws four times, and may lose all of
 * them or none — which is neither a `strata` (nobody chooses) nor a `rzut`
 * (one die settling one outcome for the whole seat).
 */
const onTheCliff = (who: string, friends: string[]) =>
  aTable({
    game: {
      turn_state: {
        phase: "field", fieldId: "urwisko-1", from: null, draw: 0, drawn: [], resolved: [],
      } as TurnPhase,
      active_seat: 0,
    },
    seats: [
      aSeat({
        id: "seat-a",
        character_id: asSeatCharacter(who),
        field_id: "urwisko-1",
        life: 4,
        nature: "good",
      }),
    ],
    holdings: friends.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "friend" }),
    ),
  });

const walkTheCliff = async (who: string, friends: string[], dice: number[]) => {
  const table = onTheCliff(who, friends);
  const out = await resolveFieldOffer(
    table,
    { offerName: "Urwisko", decided: {}, shuffle: (items) => [...items] },
    ports({ random: scriptedRandom(dice) }),
  );
  return { out, after: apply(table, out.writes) };
};

describe("the Urwisko, and one die for each Przyjaciel", () => {
  it("costs the point on a one or a two, and nothing above", async () => {
    expect((await walkTheCliff("awanturnik", [], [1])).after.seats[0].life).toBe(3);
    expect((await walkTheCliff("awanturnik", [], [4])).after.seats[0].life).toBe(4);
  });

  /** A die each, so some go and some stay. */
  it("throws separately for every Przyjaciel", async () => {
    const { after, out } = await walkTheCliff(
      "awanturnik",
      ["pasterz", "krzyzowiec", "giermek"],
      [5, 1, 4, 2],
    );
    expect(after.holdings.map((h) => h.card_id)).toEqual(["krzyzowiec"]);
    expect(out.result.did.join(" ")).toMatch(/PASTERZ przepada/);
    expect(out.result.did.join(" ")).toMatch(/KRZYŻOWIEC zostaje/);
  });

  it("keeps all of them when every die is high", async () => {
    const { after } = await walkTheCliff("awanturnik", ["pasterz", "giermek"], [6, 6, 6]);
    expect(after.holdings).toHaveLength(2);
    expect(after.seats[0].life).toBe(4);
  });

  /**
   * The bug this pins. The guard asked whether the offer was a top-level `rzut`,
   * which held while every protected Obszar was one die and one table — and the
   * Urwisko is a `po-kolei`, so the Opiekun, the Elflin and the Barbarzyńca
   * walked straight into it. The cards say *where*, not *how*.
   */
  it("is walked past by the cards and Postacie written for it", async () => {
    const byCard = await walkTheCliff("awanturnik", ["elflin", "pasterz"], [1, 1, 1]);
    expect(byCard.after.seats[0].life).toBe(4);
    expect(byCard.after.holdings).toHaveLength(2);
    expect(byCard.out.result.did.join(" ")).toMatch(/bezpiecznie — bez rzutu/);

    // The Barbarzyńca's own Karta names both Urwiska.
    const byCharacter = await walkTheCliff("barbarzynca", ["pasterz"], [1, 1]);
    expect(byCharacter.after.seats[0].life).toBe(4);
    expect(byCharacter.after.holdings).toHaveLength(1);
  });
});


/**
 * Six Obszary that make every Wróg met on them stronger.
 *
 * "Każdy Wróg, z którym zmierzysz się w Kamiennym Lesie dodaje 3 punkty do
 * swojej Magii lub Miecza." Not an offer and not a table — a property of the
 * ground that the fight reads, which is why it lives in `board.ts` beside the
 * fields rather than in a script.
 *
 * It went unimplemented longer than it should have because the clause reads
 * like boilerplate: it sits under a "WYCIĄGNIJ 2 KARTY" on six different
 * Obszary, and an audit that stripped the draw sentence stripped this with it.
 */
const meeting = (field: FieldId, foes: string[]) =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: field,
        from: null,
        draw: 0,
        drawn: foes.map((cardId) => ({ cardId, cardClass: "foe" })),
      } as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a", field_id: field })],
  });

const strengthAt = (field: FieldId, foes: string[]) =>
  (
    top(beginFight(meeting(field, foes), { cardIds: foes }).writes.game!.turn_state!) as {
      fight: { enemyTotal: number };
    }
  ).fight.enemyTotal;

describe("Obszary where a Wróg fights harder", () => {
  it("leaves a creature alone on ground that says nothing", () => {
    expect(strengthAt("wrzosowiska", ["cyklop"])).toBe(6);
  });

  it("adds what the Obszar prints", () => {
    expect(strengthAt("mroczna-polana", ["cyklop"])).toBe(7);
    expect(strengthAt("rownina-samotnych-skal", ["cyklop"])).toBe(8);
    expect(strengthAt("kamienny-las", ["cyklop"])).toBe(9);
  });

  /**
   * "Każdy" is the word that decides how a pack is counted. 17.5 sums their
   * Miecze, and each of those is already the bigger number — so the ground's
   * bonus lands once per creature, not once on the sum.
   */
  it("adds it once for each creature in a pack (17.5)", () => {
    const alone = strengthAt("wrzosowiska", ["cyklop", "nobbin"]);
    expect(strengthAt("kamienny-las", ["cyklop", "nobbin"])).toBe(alone + 3 * 2);
  });
});
