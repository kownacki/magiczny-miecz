import { describe, expect, it } from "vitest";
import {
  AWAY_AFTER_MS,
  GOODBYE_GRACE_MS,
  HOST_MISSING_AFTER_MS,
  LOBBY_GONE_AFTER_MS,
  claimSeat,
  goneFrom,
  isQuiet,
  leaveSeat,
  needsSweep,
  nextHost,
  promoteHost,
  removeSeat,
  renameSeat,
  setReady,
  sweepLobby,
  takeHostRole,
} from "./lobby";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { apply } from "../change";
import type { SeatRow } from "../store";

/**
 * The part of this app that is not Magiczny Miecz.
 *
 * None of it has a rule number, because the rulebook has nothing to say about a
 * browser tab closing — it is all `docs/LOBBY.md`'s, and until now none of it
 * had a test either. That is the wrong way round for what it decides. Who runs
 * a table when the person who opened it has gone to bed, how long a phone may
 * sleep before its seat belongs to somebody else, and whether a character's
 * Przedmioty survive their player being removed are the sort of thing you find
 * out about in the middle of an evening, with five people watching.
 */

const NOW = Date.parse("2026-01-01T12:00:00Z");
const at = (agoMs: number) => new Date(NOW - agoMs).toISOString();
const clock = (now = NOW) => ports({ now: () => now });

/** Seats in join order, oldest first, the host at the front. */
function seated(...over: Partial<SeatRow>[]): SeatRow[] {
  return over.map((one, index) =>
    aSeat({
      id: `seat-${index}`,
      seat_index: index,
      is_host: index === 0,
      created_at: new Date(NOW - (over.length - index) * 60_000).toISOString(),
      ...one,
    }),
  );
}

describe("a seat that has gone quiet", () => {
  it("is not quiet before it has ever spoken", () => {
    // A seat the host filled in by hand never checks in, and neither does one
    // created a second ago. Calling either absent made a fresh poczekalnia look
    // like a room everybody had walked out of.
    expect(isQuiet({ seen_at: null }, NOW)).toBe(false);
  });

  it("is quiet once the silence is longer than the window it is measured against", () => {
    expect(isQuiet({ seen_at: at(AWAY_AFTER_MS + 1) }, NOW)).toBe(true);
    expect(isQuiet({ seen_at: at(AWAY_AFTER_MS - 1) }, NOW)).toBe(false);
  });

  it("is measured against whichever window the caller is asking about", () => {
    // The same silence is three different answers. Two minutes is away, is not
    // yet gone from the poczekalnia, and has already cost you the host role.
    const seat = { seen_at: at(120_000) };
    expect(isQuiet(seat, NOW, AWAY_AFTER_MS)).toBe(true);
    expect(isQuiet(seat, NOW, HOST_MISSING_AFTER_MS)).toBe(true);
    expect(isQuiet(seat, NOW, LOBBY_GONE_AFTER_MS)).toBe(false);
  });

  it("reads the moment it is given rather than the clock on the wall", () => {
    const seat = { seen_at: at(0) };
    expect(isQuiet(seat, NOW)).toBe(false);
    expect(isQuiet(seat, NOW + AWAY_AFTER_MS + 1)).toBe(true);
  });
});

describe("who takes over the table", () => {
  it("is whoever has been here longest of those left", () => {
    const seats = seated({}, {}, {});
    expect(nextHost(seats, seats[0])?.id).toBe("seat-1");
  });

  it("is not the seat that is leaving", () => {
    const seats = seated({}, {});
    expect(nextHost(seats, seats[0])?.id).toBe("seat-1");
    expect(nextHost(seats, seats[1])?.id).toBe("seat-0");
  });

  it("skips a chair nobody is sitting in", () => {
    // Handing the role to an abandoned seat is how a table ends up unstartable:
    // the controls belong to a device that is not there.
    const seats = seated({}, { abandoned_at: at(0) }, {});
    expect(nextHost(seats, seats[0])?.id).toBe("seat-2");
  });

  it("skips a character that is out of the game", () => {
    const seats = seated({}, { eliminated: true }, {});
    expect(nextHost(seats, seats[0])?.id).toBe("seat-2");
  });

  it("goes by when somebody joined and not by where they sit", () => {
    /**
     * Places freed in the middle are filled by the next person to arrive, so a
     * low seat index now means "sat in a gap", not "got here first". Seat 2
     * here is the older player and takes the table.
     */
    const seats = [
      aSeat({ id: "host", seat_index: 0, is_host: true, created_at: at(300_000) }),
      aSeat({ id: "latecomer", seat_index: 1, is_host: false, created_at: at(10_000) }),
      aSeat({ id: "veteran", seat_index: 2, is_host: false, created_at: at(200_000) }),
    ];
    expect(nextHost(seats, seats[0])?.id).toBe("veteran");
  });

  it("breaks a tie on the index, which is what every old row will do", () => {
    const same = at(100_000);
    const seats = [
      aSeat({ id: "host", seat_index: 0, is_host: true, created_at: same }),
      aSeat({ id: "b", seat_index: 2, is_host: false, created_at: same }),
      aSeat({ id: "a", seat_index: 1, is_host: false, created_at: same }),
    ];
    expect(nextHost(seats, seats[0])?.id).toBe("a");
  });

  it("has nobody to hand it to at an emptying table", () => {
    const seats = seated({}, { abandoned_at: at(0) });
    expect(nextHost(seats, seats[0])).toBeNull();
  });
});

describe("handing the role over", () => {
  it("does nothing when the seat leaving was never running the table", () => {
    const seats = seated({}, {});
    expect(promoteHost(seats, seats[1])).toEqual({});
  });

  it("hands it over rather than copying it", () => {
    /**
     * Both halves matter. A retired seat keeps its row so the journal's
     * references survive, and leaving it marked host would leave the table with
     * two — the second being a seat nobody is sitting in.
     */
    const seats = seated({}, {});
    expect(promoteHost(seats, seats[0])).toEqual({
      seats: [
        { id: "seat-1", patch: { is_host: true } },
        { id: "seat-0", patch: { is_host: false } },
      ],
    });
  });

  it("leaves the flag where it is when there is nobody to take it", () => {
    // Better a table hosted by an absent seat than a table hosted by nobody:
    // the second cannot be recovered, and `takeHostRole` can rescue the first.
    const seats = seated({}, { abandoned_at: at(0) });
    expect(promoteHost(seats, seats[0])).toEqual({});
  });
});

describe("saying you are ready, and what you are called", () => {
  const table = () => aTable({ game: { status: "lobby" }, seats: seated({ ready: false }, {}) });

  it("writes the change", () => {
    expect(setReady(table(), { seatId: "seat-0", ready: true }).writes).toEqual({
      seats: [{ id: "seat-0", patch: { ready: true } }],
    });
  });

  it("writes nothing when it is already so", () => {
    /**
     * An empty changeset commits nothing at all — see `isEmpty` — and that is
     * the point of checking. The browser sends the state it wants rather than a
     * toggle, so a second click on a button that is already down would
     * otherwise bump the revision and wake every device at the table.
     */
    expect(setReady(table(), { seatId: "seat-1", ready: true }).writes).toEqual({});
    expect(renameSeat(table(), { seatId: "seat-0", name: "Michał" }).writes).toEqual({});
  });

  it("refuses a seat that is not at this table", () => {
    // The old version updated nothing and said it had worked, because a
    // PostgREST update matching no rows is not an error.
    expect(() => setReady(table(), { seatId: "seat-9", ready: true })).toThrow(
      "Nie ma takiego miejsca",
    );
  });

  it("takes a name away when one is given away", () => {
    expect(renameSeat(table(), { seatId: "seat-0", name: null }).writes).toEqual({
      seats: [{ id: "seat-0", patch: { player_name: null } }],
    });
  });
});

describe("leaving before the game has started", () => {
  const lobby = (...over: Partial<SeatRow>[]) =>
    aTable({ game: { status: "lobby" }, seats: seated(...over) });

  it("deletes the seat outright", () => {
    // Nothing references it and somebody who joined the wrong table should
    // leave no trace.
    const { writes, result } = leaveSeat(lobby({}, {}), { seatId: "seat-1", token: "t" }, clock());
    expect(writes.seatsRemoved).toEqual(["seat-1"]);
    expect(writes.seats).toBeUndefined();
    expect(result).toEqual({ removed: true, passedTo: null, gameFinished: false });
  });

  it("hands the table on in the same breath as the host leaves it", () => {
    const { writes } = leaveSeat(lobby({}, {}), { seatId: "seat-0", token: "t" }, clock());
    expect(writes.seatsRemoved).toEqual(["seat-0"]);
    expect(writes.seats).toEqual([
      { id: "seat-1", patch: { is_host: true } },
      { id: "seat-0", patch: { is_host: false } },
    ]);
  });

  it("leaves the table with exactly one host afterwards", () => {
    /**
     * The demotion lands on a row that is being deleted in the same change, so
     * this is the case `seatsRemoved`-before-`seats` exists for. Asked of
     * `apply`, which is what `commit` promises to do to the database.
     */
    const { writes } = leaveSeat(lobby({}, {}, {}), { seatId: "seat-0", token: "t" }, clock());
    const after = apply(lobby({}, {}, {}), writes);
    expect(after.seats.map((seat) => seat.id)).toEqual(["seat-1", "seat-2"]);
    expect(after.seats.filter((seat) => seat.is_host).map((seat) => seat.id)).toEqual(["seat-1"]);
  });
});

describe("leaving a game that is already being played", () => {
  const playing = (over: Partial<SeatRow>[], activeSeat: number | null = 0) =>
    aTable({ game: { status: "playing", active_seat: activeSeat }, seats: seated(...over) });

  it("keeps the seat and releases the claim", () => {
    /**
     * A player walking away is not a character dying. The figure stays on its
     * Obszar with its points, its Przedmioty and its Przyjaciele, because other
     * players may already have acted on all of them — 4.4's death is a
     * different event with different consequences. And the seat row itself has
     * to survive, because the journal holds `seat_id` references to everything
     * that seat ever did.
     */
    const { writes, result } = leaveSeat(
      playing([{}, {}], 1),
      { seatId: "seat-0", token: "fresh" },
      clock(),
    );
    expect(writes.seatsRemoved).toBeUndefined();
    expect(writes.seats?.[0]).toEqual({
      id: "seat-0",
      patch: { abandoned_at: new Date(NOW).toISOString(), claim_token: "fresh" },
    });
    expect(result.removed).toBe(false);
  });

  it("rotates the token so the departing device cannot act as this seat again", () => {
    const { writes } = leaveSeat(playing([{}, {}], 1), { seatId: "seat-0", token: "fresh" }, clock());
    expect(writes.seats?.[0].patch.claim_token).toBe("fresh");
  });

  it("does not stop play for an empty chair", () => {
    const { writes, result } = leaveSeat(
      playing([{}, {}], 1),
      { seatId: "seat-0", token: "t" },
      clock(),
    );
    expect(writes.game).toBeUndefined();
    expect(result.passedTo).toBeNull();
  });

  it("moves the turn on when it was theirs", () => {
    // Play does not wait on somebody who has gone.
    const { writes, result } = leaveSeat(
      playing([{}, {}, {}], 0),
      { seatId: "seat-0", token: "t" },
      clock(),
    );
    expect(writes.game).toEqual({ active_seat: 1, turn_state: { phase: "roll" } });
    expect(result.passedTo).toBe(1);
  });

  it("wraps round to the first seat when the leaver was the last", () => {
    const { result } = leaveSeat(playing([{}, {}, {}], 2), { seatId: "seat-2", token: "t" }, clock());
    expect(result.passedTo).toBe(0);
  });

  it("skips seats with no character and seats that are out", () => {
    const { result } = leaveSeat(
      playing([{}, { character_id: null }, { eliminated: true }, {}], 0),
      { seatId: "seat-0", token: "t" },
      clock(),
    );
    expect(result.passedTo).toBe(3);
  });

  it("leaves the turn where it is when there is nobody to pass it to", () => {
    const { writes, result } = leaveSeat(
      playing([{}, { character_id: null }], 0),
      { seatId: "seat-0", token: "t" },
      clock(),
    );
    expect(writes.game).toBeUndefined();
    expect(result.passedTo).toBeNull();
  });
});

describe("taking over a seat nobody is behind", () => {
  const table = (over: Partial<SeatRow>) =>
    aTable({ game: { status: "playing" }, seats: [aSeat({ id: "seat-0", ...over })] });

  it("issues the fresh token the edge minted", () => {
    const { writes } = claimSeat(
      table({ abandoned_at: at(0) }),
      { seatId: "seat-0", playerName: "Ola", token: "new-token" },
      clock(),
    );
    expect(writes.seats).toEqual([
      {
        id: "seat-0",
        patch: { abandoned_at: null, claim_token: "new-token", player_name: "Ola" },
      },
    ]);
  });

  it("keeps the name the table already knows when none is offered", () => {
    // The commonest takeover by far is the same person on a new tab, and
    // renaming them to nothing — or making them retype it — would be obtuse.
    const { writes } = claimSeat(
      table({ abandoned_at: at(0), player_name: "Michał" }),
      { seatId: "seat-0", playerName: null, token: "t" },
      clock(),
    );
    expect(writes.seats?.[0].patch).not.toHaveProperty("player_name");
  });

  it("takes a seat that never said it was leaving but has fallen silent", () => {
    /**
     * A player who closed their tab never said so, so the seat is only quiet.
     * Refusing it would strand the character for the rest of the evening, and
     * the people in the room can settle who picks it up between them.
     */
    const { writes } = claimSeat(
      table({ seen_at: at(AWAY_AFTER_MS + 1) }),
      { seatId: "seat-0", playerName: null, token: "t" },
      clock(),
    );
    expect(writes.seats?.[0].patch.claim_token).toBe("t");
  });

  it("refuses a seat somebody is actively using", () => {
    expect(() =>
      claimSeat(
        table({ seen_at: at(1_000) }),
        { seatId: "seat-0", playerName: null, token: "t" },
        clock(),
      ),
    ).toThrow("To miejsce ma już swojego gracza");
  });

  it("refuses a seat the host is driving from the shared screen", () => {
    // It has no device of its own and never checks in, so every other test here
    // would read it as long gone.
    expect(() =>
      claimSeat(
        table({ no_device: true, abandoned_at: at(0) }),
        { seatId: "seat-0", playerName: null, token: "t" },
        clock(),
      ),
    ).toThrow("wspólnym ekranie");
  });
});

describe("removing somebody from the table", () => {
  const table = (status: string, ...over: Partial<SeatRow>[]) =>
    aTable({
      game: { status },
      seats: seated(...over),
      holdings: [
        aHolding({ id: "h1", seat_id: "seat-1", card_id: "helm", kind: "item" }),
        aHolding({ id: "h2", seat_id: "seat-1", card_id: "wilk", kind: "friend" }),
        aHolding({ id: "h3", seat_id: "seat-1", card_id: "blyskawica", kind: "spell", face: "hidden" }),
        aHolding({ id: "h4", seat_id: "seat-0", card_id: "miecz", kind: "item" }),
      ],
    });

  it("is the host's job when it is somebody else", () => {
    expect(() =>
      removeSeat(table("lobby", {}, {}), { seatId: "seat-0", byId: "seat-1" }),
    ).toThrow("Tylko gospodarz");
  });

  it("is nobody's permission to give when it is yourself", () => {
    // Removing yourself is just leaving, and a lobby where the host cannot drop
    // out is worse than one where anybody can tidy up.
    const { writes } = removeSeat(table("lobby", {}, {}), { seatId: "seat-1", byId: "seat-1" });
    expect(writes.seatsRemoved).toEqual(["seat-1"]);
  });

  it("leaves nothing behind in the poczekalnia", () => {
    const { writes } = removeSeat(table("lobby", {}, {}), { seatId: "seat-1", byId: "seat-0" });
    expect(writes.fieldCards).toBeUndefined();
  });

  it("leaves the kit on the Obszar mid-game, where 12.1 lets the next comer take it", () => {
    /**
     * Deleting the row without this would take the Przedmioty and Przyjaciele
     * out of the game silently, and the board would be quietly poorer for it.
     * The gold goes down as coins, one card each, because that is what a
     * Sztuka Złota is on a field.
     */
    const { writes } = removeSeat(
      table("playing", {}, { field_id: "osada", gold: 2 }),
      { seatId: "seat-1", byId: "seat-0" },
    );
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: "osada", card_id: "helm" },
      { field_id: "osada", card_id: "wilk" },
      { field_id: "osada", card_id: "1-sztuka-zlota" },
      { field_id: "osada", card_id: "1-sztuka-zlota" },
    ]);
  });

  it("does not spill the Zaklęcia, which nobody ever saw (9.3)", () => {
    const { writes } = removeSeat(
      table("playing", {}, { field_id: "osada", gold: 0 }),
      { seatId: "seat-1", byId: "seat-0" },
    );
    const dropped = (writes.fieldCards?.insert ?? []).map((card) => card.card_id);
    expect(dropped).not.toContain("blyskawica");
  });

  it("takes nothing off a figure that is not on the board", () => {
    const { writes } = removeSeat(
      table("playing", {}, { field_id: null, gold: 3 }),
      { seatId: "seat-1", byId: "seat-0" },
    );
    expect(writes.fieldCards).toBeUndefined();
  });

  it("hands the table on when the host removes themselves", () => {
    const { writes } = removeSeat(table("lobby", {}, {}), { seatId: "seat-0", byId: "seat-0" });
    expect(writes.seats).toEqual([
      { id: "seat-1", patch: { is_host: true } },
      { id: "seat-0", patch: { is_host: false } },
    ]);
  });

  it("refuses a seat that is not there", () => {
    expect(() =>
      removeSeat(table("lobby", {}, {}), { seatId: "seat-9", byId: "seat-0" }),
    ).toThrow("Nie ma takiego miejsca");
  });
});

describe("taking the host role", () => {
  const table = (...over: Partial<SeatRow>[]) =>
    aTable({ game: { status: "lobby" }, seats: seated(...over) });

  it("may be given away by the host who holds it", () => {
    const { writes } = takeHostRole(table({}, {}), { seatId: "seat-1", byId: "seat-0" });
    expect(writes.seats).toEqual([
      { id: "seat-0", patch: { is_host: false } },
      { id: "seat-1", patch: { is_host: true } },
    ]);
  });

  it("may be taken from a host who has gone", () => {
    /**
     * Without this door a table whose host closed their laptop can never be
     * configured or started again. It is also how somebody recovers a table
     * after joining twice from one browser and overwriting the stored token.
     */
    const { writes } = takeHostRole(
      table({ abandoned_at: at(0) }, {}),
      { seatId: "seat-1", byId: "seat-1" },
    );
    expect(writes.seats).toContainEqual({ id: "seat-1", patch: { is_host: true } });
  });

  it("may not be taken from a host who is present", () => {
    // There is no co-host.
    expect(() => takeHostRole(table({}, {}), { seatId: "seat-1", byId: "seat-1" })).toThrow(
      "tylko obecny gospodarz",
    );
  });

  it("may not be given to an empty chair", () => {
    expect(() =>
      takeHostRole(table({}, { abandoned_at: at(0) }), { seatId: "seat-1", byId: "seat-0" }),
    ).toThrow("To miejsce nie ma gracza");
  });

  it("leaves one host behind it", () => {
    const before = table({}, {}, {});
    const after = apply(before, takeHostRole(before, { seatId: "seat-2", byId: "seat-0" }).writes);
    expect(after.seats.filter((seat) => seat.is_host).map((seat) => seat.id)).toEqual(["seat-2"]);
  });

  it("writes nothing when the seat already has it", () => {
    expect(takeHostRole(table({}, {}), { seatId: "seat-0", byId: "seat-0" }).writes).toEqual({
      seats: [],
    });
  });
});

describe("sweeping the poczekalnia", () => {
  const lobby = (...over: Partial<SeatRow>[]) =>
    aTable({ game: { status: "lobby" }, seats: seated(...over) });
  const here = { seen_at: at(1_000) };

  it("does nothing to a game that is being played", () => {
    // The sweep deletes seats outright, which is only ever right before a
    // character exists to be attached to one.
    const playing = aTable({ game: { status: "playing" }, seats: seated({ seen_at: at(10 ** 7) }) });
    expect(sweepLobby(playing, undefined, clock())).toEqual({
      writes: {},
      result: { gameGone: false },
    });
  });

  it("does nothing at a table everybody is still watching", () => {
    /**
     * The commonest outcome by a very wide margin: this runs on every poll from
     * every device, several times a second at a full table. An empty changeset
     * commits nothing, which is the only reason that is affordable.
     */
    expect(sweepLobby(lobby(here, here), undefined, clock()).writes).toEqual({});
  });

  it("removes a seat whose page said it was going and did not come back", () => {
    const { writes } = sweepLobby(
      lobby(here, { ...here, left_at: at(GOODBYE_GRACE_MS + 1) }),
      undefined,
      clock(),
    );
    expect(writes.seatsRemoved).toEqual(["seat-1"]);
  });

  it("holds a seat whose page is still inside the grace", () => {
    // `pagehide` fires on a reload as well as on a close, and the two are
    // indistinguishable from here. The countdown is what a reload cancels.
    const { writes } = sweepLobby(
      lobby(here, { ...here, left_at: at(GOODBYE_GRACE_MS - 1_000) }),
      undefined,
      clock(),
    );
    expect(writes).toEqual({});
  });

  it("removes a seat that simply stopped answering", () => {
    const { writes } = sweepLobby(
      lobby(here, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }),
      undefined,
      clock(),
    );
    expect(writes.seatsRemoved).toEqual(["seat-1"]);
  });

  it("gives a hidden tab far longer than an away marker does", () => {
    /**
     * Browsers throttle timers in background tabs to roughly once a minute, so
     * somebody who switched away to read something else is still checking in —
     * just slowly. Anything under two minutes evicts them for looking away.
     */
    const { writes } = sweepLobby(
      lobby(here, { seen_at: at(AWAY_AFTER_MS + 1) }),
      undefined,
      clock(),
    );
    expect(writes).toEqual({});
  });

  it("never sweeps a seat the host filled in by hand", () => {
    /**
     * It has no device of its own and is driven from the shared screen, so
     * sweeping it would delete a player sitting at the table.
     *
     * Given a stale `seen_at` and a goodbye on purpose. A hand-seated place
     * normally has neither — `seen_at` is null and nothing ever says goodbye
     * for it — which means a test using the ordinary shape passes whether the
     * `no_device` filter is there or not: `isQuiet` already answers false for a
     * seat that never spoke. This one fails the moment the filter goes.
     */
    const { writes } = sweepLobby(
      lobby(here, {
        no_device: true,
        seen_at: at(LOBBY_GONE_AFTER_MS * 2),
        left_at: at(GOODBYE_GRACE_MS * 2),
      }),
      undefined,
      clock(),
    );
    expect(writes).toEqual({});
  });

  it("does not let a hand-seated place lose the host role either", () => {
    // Same reasoning one threshold down: the shared screen is often the host,
    // and it is the one seat at the table that cannot check in for itself.
    const { writes } = sweepLobby(
      lobby({ no_device: true, seen_at: at(HOST_MISSING_AFTER_MS * 3) }, here),
      undefined,
      clock(),
    );
    expect(writes).toEqual({});
  });

  it("moves the role off a quiet host before it moves the host", () => {
    /**
     * The two thresholds answer different questions — "can this table still be
     * administered?" and "is this person still here?" — and the first has to be
     * answered first. Between a host going quiet and the sweep catching up, a
     * table full of people would otherwise have nobody able to start it.
     */
    const { writes, result } = sweepLobby(
      lobby({ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, here),
      undefined,
      clock(),
    );
    expect(writes.seatsRemoved).toBeUndefined();
    expect(writes.seats).toEqual([
      { id: "seat-1", patch: { is_host: true } },
      { id: "seat-0", patch: { is_host: false } },
    ]);
    expect(result.gameGone).toBe(false);
  });

  it("hands the role on when the host is the one being removed", () => {
    const { writes } = sweepLobby(
      lobby({ seen_at: at(LOBBY_GONE_AFTER_MS + 1) }, here, here),
      undefined,
      clock(),
    );
    expect(writes.seatsRemoved).toEqual(["seat-0"]);
    expect(writes.seats).toContainEqual({ id: "seat-1", patch: { is_host: true } });
  });

  it("never hands the role to somebody who is being swept in the same breath", () => {
    /**
     * The bug this replaces. The successor used to be chosen from everybody, so
     * a seat about to be deleted could be made host and then removed a line
     * later; the table recovered only because a second pass happened to catch
     * it. Seat 1 has been silent as long as the host here, and seat 2 is the
     * only one still watching.
     */
    const gone = { seen_at: at(LOBBY_GONE_AFTER_MS + 1) };
    const before = lobby(gone, gone, here);
    const after = apply(before, sweepLobby(before, undefined, clock()).writes);
    expect(after.seats.map((seat) => seat.id)).toEqual(["seat-2"]);
    expect(after.seats.filter((seat) => seat.is_host).map((seat) => seat.id)).toEqual(["seat-2"]);
  });

  it("says the table itself should go when the last device leaves", () => {
    /**
     * An empty poczekalnia is not a game anybody can join — it is a code taking
     * up space in the list. Deleting the game is the caller's, because a
     * changeset can write every table this app has except the one it is a
     * change *to*.
     */
    const { result } = sweepLobby(
      lobby({ seen_at: at(LOBBY_GONE_AFTER_MS + 1) }),
      undefined,
      clock(),
    );
    expect(result.gameGone).toBe(true);
  });

  it("says so too when only hand-seated players are left", () => {
    // Seats with no device of their own cannot choose a character or start the
    // game: an empty room with the figures set out, not a game waiting.
    const { result } = sweepLobby(
      lobby({ seen_at: at(LOBBY_GONE_AFTER_MS + 1) }, { no_device: true, seen_at: null }),
      undefined,
      clock(),
    );
    expect(result.gameGone).toBe(true);
  });

  it("keeps a table one person is still sitting at", () => {
    const { result } = sweepLobby(
      lobby({ seen_at: at(LOBBY_GONE_AFTER_MS + 1) }, here),
      undefined,
      clock(),
    );
    expect(result.gameGone).toBe(false);
  });
});

describe("the cheap question asked on every poll", () => {
  /**
   * `needsSweep` is what keeps the common path at one query. The sweep proper
   * wants a whole snapshot — five reads — and finds nothing to do almost every
   * time, so the route asks this first, off the seat list it already has, and
   * only pays for the snapshot when the answer is yes. Which means the two must
   * never disagree.
   */
  const seats = (...over: Partial<SeatRow>[]) => seated(...over);
  const here = { seen_at: at(1_000) };

  it("says no at a table everybody is watching", () => {
    expect(needsSweep(seats(here, here), NOW)).toBe(false);
  });

  it("says yes to somebody gone, and to a host merely quiet", () => {
    expect(needsSweep(seats(here, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }), NOW)).toBe(true);
    expect(needsSweep(seats({ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, here), NOW)).toBe(true);
  });

  it("agrees with the sweep itself on every table these tests describe", () => {
    const cases: Partial<SeatRow>[][] = [
      [here, here],
      [here, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }],
      [here, { ...here, left_at: at(GOODBYE_GRACE_MS + 1) }],
      [here, { ...here, left_at: at(GOODBYE_GRACE_MS - 1_000) }],
      [{ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, here],
      [here, { no_device: true, seen_at: at(LOBBY_GONE_AFTER_MS * 2), left_at: at(GOODBYE_GRACE_MS * 2) }],
      [{ no_device: true, seen_at: at(HOST_MISSING_AFTER_MS * 3) }, here],
      [here, { seen_at: at(AWAY_AFTER_MS + 1) }],
    ];
    for (const table of cases) {
      const snapshot = aTable({ game: { status: "lobby" }, seats: seated(...table) });
      const { writes } = sweepLobby(snapshot, undefined, clock());
      expect(needsSweep(snapshot.seats, NOW)).toBe(Object.keys(writes).length > 0);
    }
  });

  it("counts nobody as gone at a table of hand-seated players", () => {
    expect(goneFrom(seats({ no_device: true, seen_at: null }), NOW)).toEqual([]);
  });
});
