import { describe, expect, it } from "vitest";
import { seatsTargeted, type TargetSeat } from "./targets";

function seat(seatIndex: number, over: Partial<TargetSeat> = {}): TargetSeat {
  return {
    seatIndex,
    characterId: `postac-${seatIndex}`,
    fieldId: "karczma",
    nature: "dobra",
    eliminated: false,
    ...over,
  };
}

const indices = (found: TargetSeat[] | null) => found?.map((s) => s.seatIndex) ?? null;

describe("who an effect hits", () => {
  it("means the drawer when no target is named", () => {
    const seats = [seat(0), seat(1)];
    expect(indices(seatsTargeted(undefined, seats, seats[0]))).toEqual([0]);
    expect(indices(seatsTargeted("ty", seats, seats[0]))).toEqual([0]);
  });

  it("means the whole table, drawer included", () => {
    // Burza Siedmiu Słońc: "Wszystkie Postacie tracą 1 turę" — the person who
    // drew it is one of them.
    const seats = [seat(0), seat(1), seat(2)];
    expect(indices(seatsTargeted("wszyscy", seats, seats[1]))).toEqual([0, 1, 2]);
  });

  it("spares the characters a card names", () => {
    // Zaklinacz Czasu exempts five characters by name.
    const seats = [seat(0, { characterId: "elf" }), seat(1, { characterId: "goblin" })];
    expect(indices(seatsTargeted("wszyscy", seats, seats[1], ["elf", "hummit"]))).toEqual([1]);
  });

  it("ignores exemptions naming characters this box does not have", () => {
    // Two of Zaklinacz Czasu's five are expansion characters. They never match,
    // and that is correct rather than a gap.
    const seats = [seat(0, { characterId: "goblin" })];
    expect(indices(seatsTargeted("wszyscy", seats, seats[0], ["czarodziejka"]))).toEqual([0]);
  });

  it("leaves the dead out of it", () => {
    const seats = [seat(0), seat(1, { eliminated: true }), seat(2)];
    expect(indices(seatsTargeted("wszyscy", seats, seats[0]))).toEqual([0, 2]);
  });

  it("hits only the drawer's own ring", () => {
    const seats = [
      seat(0, { fieldId: "karczma" }), // dolny
      seat(1, { fieldId: "wrzosowiska" }), // srodkowy
      seat(2, { fieldId: "kurhan" }), // dolny
    ];
    expect(indices(seatsTargeted("wszyscy-w-kregu", seats, seats[0]))).toEqual([0, 2]);
    expect(indices(seatsTargeted("wszyscy-w-kregu", seats, seats[1]))).toEqual([1]);
  });

  it("does not reach somebody up on the Most", () => {
    // The bridge stands above the valley and belongs to no ring (p3), so a card
    // sweeping a Krąg does not touch anyone on it — in either direction.
    const seats = [seat(0, { fieldId: "karczma" }), seat(1, { fieldId: "cerber" })];
    expect(indices(seatsTargeted("wszyscy-w-kregu", seats, seats[0]))).toEqual([0]);
    expect(indices(seatsTargeted("wszyscy-w-kregu", seats, seats[1]))).toEqual([]);
  });

  it("picks a named ring regardless of where the drawer is", () => {
    const seats = [
      seat(0, { fieldId: "karczma" }),
      seat(1, { fieldId: "wrzosowiska" }),
      seat(2, { fieldId: "bagna-1" }),
    ];
    expect(indices(seatsTargeted("w-dolnym-kregu", seats, seats[1]))).toEqual([0]);
    expect(indices(seatsTargeted("w-srodkowym-kregu", seats, seats[1]))).toEqual([1]);
    expect(indices(seatsTargeted("w-gornym-kregu", seats, seats[1]))).toEqual([2]);
  });

  it("picks a Natura", () => {
    // Zaćmienie Słońc: Dobre and Chaotyczne lose a turn, Złe do not.
    const seats = [
      seat(0, { nature: "dobra" }),
      seat(1, { nature: "zla" }),
      seat(2, { nature: "chaotyczna" }),
    ];
    expect(indices(seatsTargeted("dobrzy", seats, seats[0]))).toEqual([0]);
    expect(indices(seatsTargeted("zli", seats, seats[0]))).toEqual([1]);
    expect(indices(seatsTargeted("chaotyczni", seats, seats[0]))).toEqual([2]);
  });

  it("cannot answer for a card that waits on the board", () => {
    // Labirynt and Spalona Ziemia catch whoever stops there later, so there is
    // nobody to name at the moment they are drawn.
    const seats = [seat(0)];
    expect(seatsTargeted("kazdy-kto-tu-trafi", seats, seats[0])).toBeNull();
  });

  it("cannot answer before the holder has chosen", () => {
    const seats = [seat(0), seat(1)];
    expect(seatsTargeted("inna-postac", seats, seats[0])).toBeNull();
  });

  it("hits nobody when the drawer is gone", () => {
    expect(indices(seatsTargeted("ty", [seat(0)], undefined))).toEqual([]);
    expect(indices(seatsTargeted("ty", [seat(0)], seat(0, { eliminated: true })))).toEqual([]);
  });
});
