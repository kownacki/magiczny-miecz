import { only } from "@/lib/engine/stack";
import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { resolveDrawnCard, resolveFieldOffer } from "./resolving";
import { settleCrossing } from "./bridge";
import { takeCard } from "./holdings";
import { storedStatuses } from "./turn";
import { barredFromFriends, movementCap } from "@/lib/engine/status";
import { asSeatCharacter } from "@/lib/engine/characters";
import { CROSSINGS } from "@/lib/engine/rings";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";

/**
 * The two Spotkania you cannot decline, and cannot simply put down.
 *
 * Both were `brak` until the vocabulary caught up with them: nothing could put
 * a character under a lasting effect, nothing acted on the `bierzesz`
 * disposition, and nothing ever raised the `crossing` event that `Ends` had
 * named since the day it was written.
 */

const drawing = (field: FieldId, card: string, friends: string[] = []) =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: field,
        from: null,
        draw: 0,
        drawn: [{ cardId: card, cardClass: "encounter" }],
        resolved: [],
      } as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a",
        character_id: asSeatCharacter("awanturnik"),
        field_id: field,
        gold: 5,
      }),
    ],
    holdings: friends.map((cardId, at) =>
      aHolding({ id: `f${at}`, seat_id: "seat-a", card_id: cardId, kind: "friend" }),
    ),
  });

const meet = async (table: ReturnType<typeof drawing>, cardId: string) =>
  apply(
    table,
    (
      await resolveDrawnCard(
        table,
        { cardId, decided: {}, shuffle: (items) => [...items] },
        ports(),
      )
    ).writes,
  );

const held = (t: ReturnType<typeof drawing>) => t.holdings.map((h) => h.card_id);

describe("the Południca, who slows you until you cross water", () => {
  /** "Musisz ją zabrać jako Przyjaciela" — not optional, and she is kept. */
  it("joins as a Przyjaciel and caps the walk at one Obszar", async () => {
    const after = await meet(drawing("uroczysko", "poludnica"), "poludnica");
    expect(held(after)).toEqual(["poludnica"]);
    expect(movementCap(storedStatuses(after, "seat-a"))).toBe(1);
  });

  /**
   * "Jedynym sposobem pozbycia się Południcy jest przeprawa przez Trzęsawiska
   * lub Lodowy Las. Gdy to zrobisz, odłóż jej Kartę." Both halves: the weight
   * lifts and the Karta goes with it.
   */
  it("is shed by a crossing, card and all", async () => {
    const carrying = await meet(drawing("uroczysko", "poludnica"), "poludnica");
    const crossing = CROSSINGS.find((one) => one.from === "uroczysko");
    const across = apply(carrying, settleCrossing(carrying, crossing!, "wygrana").writes);

    expect(held(across)).toEqual([]);
    expect(movementCap(storedStatuses(across, "seat-a"))).toBeNull();
  });

  it("stays through a crossing that failed", async () => {
    const carrying = await meet(drawing("uroczysko", "poludnica"), "poludnica");
    const crossing = CROSSINGS.find((one) => one.from === "uroczysko");
    const stuck = apply(carrying, settleCrossing(carrying, crossing!, "przegrana").writes);

    expect(held(stuck)).toEqual(["poludnica"]);
    expect(movementCap(storedStatuses(stuck, "seat-a"))).toBe(1);
  });
});

describe("the Zły Duch, who empties the room", () => {
  /**
   * "Natychmiast opuszczą cię wszyscy dotychczasowi Przyjaciele (z wyjątkiem
   * Południcy)." The exception is the card telling you these two are meant to
   * be met together: she is not a Przyjaciel anybody gained.
   */
  it("sends every Przyjaciel away but the Południca, and moves in", async () => {
    const before = drawing("mroczna-polana", "zly-duch", ["pasterz", "giermek", "poludnica"]);
    const after = await meet(before, "zly-duch");
    expect(held(after).sort()).toEqual(["poludnica", "zly-duch"]);
  });

  it("bars new Przyjaciele while he is there", async () => {
    const after = await meet(drawing("mroczna-polana", "zly-duch"), "zly-duch");
    expect(barredFromFriends(storedStatuses(after, "seat-a"))).toBe(true);
    expect(() => takeCard(after, { seatId: "seat-a", cardId: "krzyzowiec" })).toThrow(
      /nie pozwala ci zdobywać Przyjaciół/,
    );
  });

  /** "Po wizycie u Pustelnika odłóż Kartę." */
  it("is exorcised at the Pustelnia, and takes his Karta with him", async () => {
    const haunted = await meet(drawing("mroczna-polana", "zly-duch", ["poludnica"]), "zly-duch");
    const atPustelnia = apply(haunted, {
      seats: [{ id: "seat-a", patch: { field_id: "pustelnia" } }],
      game: {
        turn_state: only({
          phase: "field", fieldId: "pustelnia", from: null, draw: 0, drawn: [], resolved: [],
        } as TurnPhase),
      },
    });
    const freed = apply(
      atPustelnia,
      (
        await resolveFieldOffer(
          atPustelnia,
          { offerName: "Egzorcyzm", decided: {}, shuffle: (items) => [...items] },
          ports(),
        )
      ).writes,
    );

    expect(held(freed)).toEqual(["poludnica"]);
    expect(barredFromFriends(storedStatuses(freed, "seat-a"))).toBe(false);
    expect(() => takeCard(freed, { seatId: "seat-a", cardId: "krzyzowiec" })).not.toThrow();
  });

  it("does nothing to a visitor who never met him", async () => {
    const clean = drawing("pustelnia", "zly-duch");
    const out = await resolveFieldOffer(
      clean,
      { offerName: "Egzorcyzm", decided: {}, shuffle: (items) => [...items] },
      ports(),
    );
    expect(out.result.did.join(" ")).toMatch(/nic cię nie trzyma/);
  });
});

/**
 * The third Spotkanie that lasts, and the only one that lands on everybody.
 *
 * It was `{ op: "nic" }` with a two-turn disposition, so the app counted the
 * turns and told the table the storm did nothing — while `EFFECTS.fog` in the
 * console had been able to conjure the very same cap under this Karta's own
 * name the whole time.
 */
describe("the Mgła, which slows the whole board", () => {
  const twoSeats = () =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "uroczysko",
          from: null,
          draw: 0,
          drawn: [{ cardId: "mgla", cardClass: "encounter" }],
          resolved: [],
        } as TurnPhase,
      },
      seats: [
        aSeat({
          id: "seat-a",
          seat_index: 0,
          character_id: asSeatCharacter("awanturnik"),
          field_id: "uroczysko",
        }),
        aSeat({
          id: "seat-b",
          seat_index: 1,
          character_id: asSeatCharacter("wojownik"),
          field_id: "osada",
        }),
      ],
    });

  /** „Wszystkie Krainy" — the drawer included, which is what `wszyscy` means. */
  it("caps every Postać at one Obszar, the one who drew it too", async () => {
    const after = await meet(twoSeats(), "mgla");
    expect(movementCap(storedStatuses(after, "seat-a"))).toBe(1);
    expect(movementCap(storedStatuses(after, "seat-b"))).toBe(1);
  });

  /** „Przez 2 tury… (1 Obszar na turę)" — two of each seat's own turns. */
  it("lasts the two turns the Karta names", async () => {
    const after = await meet(twoSeats(), "mgla");
    for (const seat of ["seat-a", "seat-b"]) {
      const fog = storedStatuses(after, seat).find((one) => one.label.startsWith("Mgła"));
      expect(fog?.ends, seat).toEqual({ kind: "turns", turns: 2 });
    }
  });
});
