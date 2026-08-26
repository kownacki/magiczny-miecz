import { describe, expect, it } from "vitest";
import {
  MANY_TAKERS,
  aimedAt,
  cardLookup,
  cardOwners,
  charactersInOrder,
  chosenSeats,
  mayAdminister,
  mayChooseFor,
  mySeat,
  namedSeats,
  readingCharacter,
  seatColour,
  seatName,
  seatNameInline,
  seatPortrait,
  seatReadiness,
  seatStanding,
  startRefusal,
  stripColumns,
  surpriseTakers,
  tableIsFull,
  takenBorder,
  tileDimming,
  withDraftName,
  type Aiming,
  type LobbySeat,
} from "./lobby-view";
import { SEAT_COLOURS } from "@/lib/view/boardMap";
import { characterStandeeUrl } from "@/lib/view/cardImages";
import { RANDOM_CHARACTER_ID, asSeatCharacter } from "@/lib/engine/characters";
import type { Character } from "@/data/types";

/**
 * The poczekalnia's own arithmetic.
 *
 * None of it has a rule number — `docs/LOBBY.md` is the authority for all of it
 * — and until this file it lived inside a 565-line component, which is a place
 * nothing can be asked a question. What it decides is not small: who may hand
 * you a Kat, whether the start button is refusing you or merely waiting for
 * somebody, and whose name is written across the foot of the Kapłanka.
 */

const goblin = asSeatCharacter("goblin")!;
const kaplanka = asSeatCharacter("kaplanka")!;

function aSeat(over: Partial<LobbySeat> = {}): LobbySeat {
  return {
    id: "seat-a",
    seatIndex: 0,
    playerName: "Michał",
    characterId: null,
    isHost: false,
    abandoned: false,
    away: false,
    ready: false,
    noDevice: false,
    ...over,
  };
}

/** A Karta Postaci with only the parts the strip reads filled in. */
function aCard(id: string, name: string): Character {
  return { id, name } as Character;
}

const aiming = (over: Partial<Aiming> = {}): Aiming => ({
  mySeatIndex: 0,
  canAdminister: false,
  mode: "simulation",
  ...over,
});

describe("what a seat is called", () => {
  it("is the name its player typed", () => {
    expect(seatName(aSeat({ playerName: "Ola" }))).toBe("Ola");
  });

  it("counts from one, because nobody sits at seat zero", () => {
    // The host seats somebody by hand in companion mode without typing a name,
    // and a table where that shows as an empty slot is a table nobody can be
    // asked about.
    expect(seatName(aSeat({ playerName: null, seatIndex: 2 }))).toBe("Miejsce 3");
  });

  it("drops its capital in the middle of a sentence", () => {
    // Polish does not capitalise a common noun mid-clause, and this is the
    // spelling the server already uses in its own refusals — "Nie wszyscy są
    // gotowi: miejsce 3" — so both halves of the app say the same thing.
    expect(seatNameInline(aSeat({ playerName: null, seatIndex: 2 }))).toBe("miejsce 3");
    expect(seatNameInline(aSeat({ playerName: "Ola" }))).toBe("Ola");
  });
});

describe("who may work the table's controls", () => {
  it("is the host", () => {
    expect(mayAdminister(true, false)).toBe(true);
  });

  it("is anybody once the host has gone", () => {
    // Without this second door a table whose host closed their laptop can never
    // be configured or started again.
    expect(mayAdminister(false, true)).toBe(true);
  });

  it("is nobody else while the host is here", () => {
    expect(mayAdminister(false, false)).toBe(false);
  });
});

describe("whose character you may choose", () => {
  it("is your own", () => {
    expect(mayChooseFor(aSeat({ seatIndex: 0 }), aiming({ mySeatIndex: 0 }))).toBe(true);
  });

  it("is not the seat next to you", () => {
    // An earlier version let any visitor aim at any slot, which meant a
    // stranger could hand you a Kat.
    expect(mayChooseFor(aSeat({ seatIndex: 1 }), aiming({ mySeatIndex: 0 }))).toBe(false);
  });

  it("is a device-less player's, when you are running a companion table", () => {
    const seat = aSeat({ seatIndex: 1, noDevice: true });
    expect(mayChooseFor(seat, aiming({ canAdminister: true, mode: "companion" }))).toBe(true);
  });

  it("is not a device-less player's when you are not running the table", () => {
    const seat = aSeat({ seatIndex: 1, noDevice: true });
    expect(mayChooseFor(seat, aiming({ canAdminister: false, mode: "companion" }))).toBe(false);
  });

  it("is nobody else's in a simulation, where everybody has their own device", () => {
    const seat = aSeat({ seatIndex: 1, noDevice: true });
    expect(mayChooseFor(seat, aiming({ canAdminister: true, mode: "simulation" }))).toBe(false);
  });

  it("is not the seat of somebody who has a device of their own", () => {
    const seat = aSeat({ seatIndex: 1, noDevice: false });
    expect(mayChooseFor(seat, aiming({ canAdminister: true, mode: "companion" }))).toBe(false);
  });
});

describe("the seat this device is sitting in", () => {
  it("is found by its place at the table and not by its place in the list", () => {
    // Seats are deleted from the middle — the host removes somebody, a tab
    // closes — so the third seat in the array is routinely not seat 3.
    const seats = [aSeat({ id: "a", seatIndex: 0 }), aSeat({ id: "c", seatIndex: 2 })];
    expect(mySeat(seats, 2)?.id).toBe("c");
  });

  it("is nobody for a device that is only watching", () => {
    expect(mySeat([aSeat()], null)).toBeNull();
  });
});

describe("where the character strip is aimed", () => {
  const mine = aSeat({ id: "mine", seatIndex: 0 });
  const theirs = aSeat({ id: "theirs", seatIndex: 1 });

  it("is your own seat until you say otherwise", () => {
    expect(aimedAt([mine, theirs], null, aiming())?.id).toBe("mine");
  });

  it("is the seat you deliberately picked, when you are allowed to pick it", () => {
    const seat = aSeat({ id: "theirs", seatIndex: 1, noDevice: true });
    const at = aimedAt([mine, seat], seat, aiming({ canAdminister: true, mode: "companion" }));
    expect(at?.id).toBe("theirs");
  });

  it("falls back to your own seat rather than staying aimed at one you may not choose for", () => {
    // A stale pick: the mode changed under it, or the seat stopped being one
    // the host drives. Aiming at nobody would leave the whole strip inert.
    expect(aimedAt([mine, theirs], theirs, aiming())?.id).toBe("mine");
  });
});

describe("whether the table can start", () => {
  /**
   * The server's `startGame` guard, written out a second time so the button can
   * carry the missing condition as its label instead of being pressed and
   * refused. These are the two refusals it throws.
   */
  it("refuses a table nobody has chosen a Postać at", () => {
    expect(startRefusal([aSeat(), aSeat({ id: "b", seatIndex: 1 })])).toEqual({
      because: "nobody",
    });
  });

  it("names everybody still deciding", () => {
    const seats = [
      aSeat({ id: "a", seatIndex: 0, characterId: goblin, ready: true }),
      aSeat({ id: "b", seatIndex: 1, characterId: kaplanka, ready: false }),
    ];
    expect(startRefusal(seats)).toEqual({ because: "waiting", on: [seats[1]] });
  });

  it("does not wait on a seat nobody is behind", () => {
    // An abandoned seat cannot say it is ready, so it is not asked — otherwise
    // one closed tab would hold the table for the rest of the evening.
    const seats = [aSeat({ characterId: goblin, ready: false, abandoned: true })];
    expect(startRefusal(seats)).toBeNull();
  });

  it("lets one character start alone", () => {
    // The box says 2-6 and the rulebook never states a count; the victory
    // condition is beating the Bestia, which one character can do.
    expect(startRefusal([aSeat({ characterId: goblin, ready: true })])).toBeNull();
  });

  it("counts a seat that asked to be surprised as having chosen", () => {
    // "Surprise me" and "I have not looked yet" are different answers, and only
    // the first can be ready to play.
    const surprised = asSeatCharacter(RANDOM_CHARACTER_ID);
    expect(startRefusal([aSeat({ characterId: surprised, ready: true })])).toBeNull();
  });

  it("counts every seat holding a Karta, and no others", () => {
    const seats = [aSeat({ characterId: goblin }), aSeat({ id: "b", seatIndex: 1 })];
    expect(chosenSeats(seats)).toEqual([seats[0]]);
  });
});

describe("the name you are still typing", () => {
  const seats = [
    aSeat({ id: "a", seatIndex: 0, playerName: "Michał" }),
    aSeat({ id: "b", seatIndex: 1, playerName: "Ola" }),
  ];

  it("hands back the very same list when nothing is drafted", () => {
    // This runs on every poll, on every device, all evening. Rebuilding an
    // identical array would be a re-render for nothing.
    expect(withDraftName(seats, 0, null)).toBe(seats);
  });

  it("shows on your own seat before the server has heard about it", () => {
    const shown = withDraftName(seats, 0, "Michalina");
    expect(shown[0].playerName).toBe("Michalina");
  });

  it("leaves everybody else's name alone", () => {
    expect(withDraftName(seats, 0, "Michalina")[1].playerName).toBe("Ola");
  });

  it("keeps the saved name while the field is empty", () => {
    // Otherwise clearing the box to retype it flashes "Miejsce 1" at somebody
    // who has not gone anywhere.
    expect(withDraftName(seats, 0, "   ")[0].playerName).toBe("Michał");
  });
});

describe("who a seat is, in one word", () => {
  it("says nothing about somebody else who is here", () => {
    expect(seatStanding(aSeat(), false)).toBeNull();
  });

  it("says it is you, on your own slot", () => {
    expect(seatStanding(aSeat(), true)).toBe("you");
  });

  it("says the device has gone quiet", () => {
    expect(seatStanding(aSeat({ away: true }), false)).toBe("away");
  });

  it("says nobody is behind it, whatever else is true of it", () => {
    // The server never reports both, and "bez gracza" is the more useful of the
    // two anyway: it is the one somebody can act on.
    expect(seatStanding(aSeat({ abandoned: true, away: true }), true)).toBe("gone");
  });
});

describe("the three states a player is in before the start", () => {
  it("says nothing at all about a seat still choosing", () => {
    // "Niegotowy" of somebody who has not been asked yet is news about nothing.
    expect(seatReadiness(aSeat({ characterId: null }))).toBe("silent");
  });

  it("says nothing about a seat nobody is behind", () => {
    expect(seatReadiness(aSeat({ characterId: goblin, abandoned: true }))).toBe("silent");
  });

  it("is waiting once a Postać is chosen and nothing has been said", () => {
    expect(seatReadiness(aSeat({ characterId: goblin }))).toBe("waiting");
  });

  it("is ready when they have said so", () => {
    expect(seatReadiness(aSeat({ characterId: goblin, ready: true }))).toBe("ready");
  });
});

describe("the picture on a seat", () => {
  it("is the mała Karta of the character it holds", () => {
    const card = aCard("goblin", "Goblin");
    expect(seatPortrait(aSeat({ characterId: goblin }), card)).toBe(characterStandeeUrl("goblin"));
  });

  it("is the surprise's own card for a seat that asked to be surprised", () => {
    // That seat has chosen and can be ready, so showing it the "still choosing"
    // placeholder would be wrong twice over.
    const seat = aSeat({ characterId: asSeatCharacter(RANDOM_CHARACTER_ID) });
    expect(seatPortrait(seat, null)).toBe(characterStandeeUrl(RANDOM_CHARACTER_ID));
  });

  it("is nothing while the seat is still deciding", () => {
    expect(seatPortrait(aSeat(), null)).toBeNull();
  });
});

describe("the colour of a seat", () => {
  it("comes from where it sits, so one colour means one person all evening", () => {
    expect(seatColour(aSeat({ seatIndex: 1 }))).toBe(SEAT_COLOURS[1]);
  });

  it("wraps rather than running out", () => {
    // Six colours and `MAX_SEATS` of 6 today, but an index is not a count and a
    // seventh must not be undefined.
    expect(seatColour(aSeat({ seatIndex: SEAT_COLOURS.length + 1 }))).toBe(SEAT_COLOURS[1]);
  });
});

describe("the order of the strip", () => {
  it("is alphabetical in Polish — Ł after L, Ż after Z", () => {
    const cards = [aCard("zmija", "Żmija"), aCard("lotr", "Łotr"), aCard("lis", "Lis")];
    expect(charactersInOrder(cards).map((card) => card.name)).toEqual(["Lis", "Łotr", "Żmija"]);
  });

  it("leaves the list it was given where it was", () => {
    // The data file is passed straight down from the page; sorting it in place
    // would reorder everybody else's copy of it.
    const cards = [aCard("zmija", "Żmija"), aCard("lis", "Lis")];
    expect(charactersInOrder(cards)).not.toBe(cards);
    expect(cards[0].name).toBe("Żmija");
  });

  it("wraps the 27 printed cards and the surprise into two rows", () => {
    expect(stripColumns(27)).toBe(14);
  });

  it("keeps the surprise in the count, so a row is never one tile short", () => {
    // Four cards make five tiles, and five tiles do not fit in two rows of two.
    expect(stripColumns(4)).toBe(3);
  });
});

describe("looking a Karta up", () => {
  const cards = [aCard("goblin", "Goblin"), aCard("kaplanka", "Kapłanka")];

  it("finds the card a seat is holding", () => {
    expect(cardLookup(cards)(goblin)?.name).toBe("Goblin");
  });

  it("finds nothing for the surprise, which is a seat state and not a card", () => {
    expect(cardLookup(cards)(asSeatCharacter(RANDOM_CHARACTER_ID))).toBeNull();
  });

  it("finds nothing for a seat that has not chosen", () => {
    expect(cardLookup(cards)(null)).toBeNull();
  });
});

describe("who is holding which Karta", () => {
  it("names the seat holding each one", () => {
    const seats = [aSeat({ id: "a", characterId: goblin })];
    expect(cardOwners(seats).get("goblin")?.id).toBe("a");
  });

  it("never counts the surprise as taken", () => {
    // There is one Kapłanka, but no limit on how many people want whatever
    // comes — so the tile stays live for everybody.
    const seats = [aSeat({ characterId: asSeatCharacter(RANDOM_CHARACTER_ID) })];
    expect(cardOwners(seats).size).toBe(0);
  });

  it("ignores seats that have chosen nothing", () => {
    expect(cardOwners([aSeat()]).size).toBe(0);
  });

  it("lists everybody who asked to be surprised, in the roster's order", () => {
    const surprise = asSeatCharacter(RANDOM_CHARACTER_ID);
    const seats = [
      aSeat({ id: "c", seatIndex: 2, characterId: surprise }),
      aSeat({ id: "b", seatIndex: 1, characterId: goblin }),
      aSeat({ id: "a", seatIndex: 0, characterId: surprise }),
    ];
    expect(surpriseTakers(seats).map((seat) => seat.id)).toEqual(["a", "c"]);
  });
});

describe("the border round a taken tile", () => {
  it("is nothing at all while nobody holds it", () => {
    expect(takenBorder([])).toBeNull();
  });

  it("is the colour of the one seat holding it", () => {
    expect(takenBorder([aSeat({ seatIndex: 1 })])).toBe(SEAT_COLOURS[1]);
  });

  it("goes neutral once two seats hold it", () => {
    // Two seats cannot share a border, and picking either of their colours
    // would name the wrong person.
    const takers = [aSeat({ id: "a", seatIndex: 0 }), aSeat({ id: "b", seatIndex: 1 })];
    expect(takenBorder(takers)).toBe(MANY_TAKERS);
  });
});

describe("how bright a tile is", () => {
  const tile = {
    pending: false,
    waiting: false,
    held: false,
    ours: false,
    aimed: true,
  };

  it("keeps the card a request is out for lit, and steps the rest back", () => {
    // Dimming all of them, or dimming none, leaves the player unable to tell
    // whether their click registered.
    expect(tileDimming({ ...tile, pending: true, held: true })).toBe("opacity-100");
    // A card somebody already holds steps back with the rest of them. The
    // owner-dimming used to win here, so clicking a character flashed every
    // taken card to full brightness for a moment and then sank it.
    expect(tileDimming({ ...tile, waiting: true, held: true })).toBe("opacity-20");
  });

  it("dims a card somebody already holds", () => {
    expect(tileDimming({ ...tile, held: true })).toBe("opacity-35");
  });

  it("dims your own pick less than everybody else's", () => {
    // "Which did I pick?" is the one you go looking for.
    expect(tileDimming({ ...tile, held: true, ours: true })).toBe("opacity-70");
  });

  it("is full brightness for a free card once there is a seat to choose for", () => {
    expect(tileDimming(tile)).toBe("opacity-100");
  });

  it("steps the whole strip back when this device may choose for nobody", () => {
    expect(tileDimming({ ...tile, aimed: false })).toBe("opacity-40");
  });

  it("never dims the surprise for being taken, because it cannot be", () => {
    // The tile passes `held: false` however many people are standing on it —
    // a card that cannot be taken away from you is never the greyed-out kind.
    expect(tileDimming({ ...tile, ours: true })).toBe("opacity-100");
  });
});

describe("which Karta the reading column shows", () => {
  const me = aSeat({ id: "mine", seatIndex: 0, characterId: goblin });
  const target = aSeat({ id: "theirs", seatIndex: 1, characterId: kaplanka });

  it("is whatever the cursor is over", () => {
    // Running along the strip and reading each one is how you choose.
    expect(readingCharacter(goblin, target, me)).toBe(goblin);
  });

  it("falls back to the seat being chosen for", () => {
    expect(readingCharacter(null, target, me)).toBe(kaplanka);
  });

  it("falls back to your own, so the column is never blank once you have picked", () => {
    expect(readingCharacter(null, aSeat({ characterId: null }), me)).toBe(goblin);
  });

  it("is blank when nobody anywhere has chosen anything", () => {
    expect(readingCharacter(null, null, aSeat())).toBeNull();
  });
});

describe("the door", () => {
  const table = (count: number) =>
    Array.from({ length: count }, (_, index) => aSeat({ id: `s${index}`, seatIndex: index }));

  it("is shut once the box's six are sitting down", () => {
    expect(tableIsFull(table(6))).toBe(true);
  });

  it("is open while a chair is free", () => {
    expect(tableIsFull(table(5))).toBe(false);
  });

  it("says who is already at the table", () => {
    const seats = [aSeat({ id: "a", playerName: "Ola" }), aSeat({ id: "b", playerName: null })];
    expect(namedSeats(seats).map((seat) => seat.id)).toEqual(["a"]);
  });
});
