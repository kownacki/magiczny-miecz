import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFieldOffer } from "./effects";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
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

const arrive = async (table: ReturnType<typeof standing>, field: FieldId, choices: number[] = []) => {
  const owed = compulsoryOffer(field, []);
  if (!owed) throw new Error(`nothing owed at ${field}`);
  const out = await resolveFieldOffer(
    table,
    { offerName: owed.name, decided: { choices }, shuffle: (items) => [...items] },
    ports({ random: scriptedRandom([1, 1, 1]) }),
  );
  return { out, after: apply(table, out.writes) };
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
  const out = await resolveFieldOffer(
    rolling(field, die, cards),
    { offerName: owed.name, decided: {}, shuffle: (items) => [...items] },
    ports({ random: scriptedRandom([die, die, die]) }),
  );
  return out.result.did.join("; ");
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
