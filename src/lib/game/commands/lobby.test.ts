import { describe, expect, it } from "vitest";
import {
  AWAY_AFTER_MS,
  GOODBYE_GRACE_MS,
  HOST_MISSING_AFTER_MS,
  LOBBY_GONE_AFTER_MS,
  driverOf,
  goneFrom,
  isQuiet,
  leaveTable,
  nameOfSeat,
  needsSweep,
  nextHost,
  noteArrival,
  promoteHost,
  renameUser,
  resumeAs,
  seatUnder,
  setReady,
  sweepLobby,
  takeHostRole,
  takeSeat,
  unseat,
  userOf,
} from "./lobby";
import { aSeat, aTable, aUser, ports } from "../fixture";
import { apply } from "../change";
import type { SeatRow, UserRow } from "../store";

/**
 * The part of this app that is not Magiczny Miecz.
 *
 * None of it has a rule number, because the rulebook has nothing to say about a
 * browser tab closing — it is all `docs/LOBBY.md`'s. Who runs a table when the
 * person who opened it has gone to bed, how long a phone may sleep before its
 * chair belongs to somebody else, and what happens to a Postać when the person
 * driving it walks off are the sort of thing you find out about in the middle
 * of an evening, with five people watching.
 *
 * Everything here is asked of *people* now. A seat is a place at the table with
 * a Postać standing in it and it outlives everybody who ever drove it; a user
 * is somebody in the room. The two used to be one row, and half of these tests
 * are here because that made questions like "did the player leave or did the
 * character die?" impossible to ask.
 */

const NOW = Date.parse("2026-01-01T12:00:00Z");
const at = (agoMs: number) => new Date(NOW - agoMs).toISOString();
const clock = (now = NOW) => ports({ now: () => now });

/** Seats in board order, which is turn order. Nobody is in them yet. */
function seated(...over: Partial<SeatRow>[]): SeatRow[] {
  return over.map((one, index) => aSeat({ id: `seat-${index}`, seat_index: index, ...one }));
}

/**
 * People in join order, oldest first, the host at the front.
 *
 * Driving the seat of the same number unless a test says otherwise, because
 * that is the ordinary table — and the interesting ones are exactly those where
 * the two lists do not line up.
 */
function here(...over: Partial<UserRow>[]): UserRow[] {
  return over.map((one, index) =>
    aUser({
      id: `usr-${index}`,
      name: `Gracz ${index + 1}`,
      is_host: index === 0,
      seat_index: index,
      created_at: new Date(NOW - (over.length - index) * 60_000).toISOString(),
      ...one,
    }),
  );
}

/** A table of `n` chairs with a person in each. */
const table = (n: number) =>
  aTable({
    seats: seated(...Array.from({ length: n }, () => ({}))),
    users: here(...Array.from({ length: n }, () => ({}))),
  });

describe("somebody who has gone quiet", () => {
  it("is not quiet before they have ever spoken", () => {
    // Somebody who joined a second ago has not checked in yet. Calling them
    // absent made a fresh poczekalnia look like a room everybody had left.
    expect(isQuiet({ seen_at: null }, NOW)).toBe(false);
  });

  it("is quiet once the silence is longer than the window it is measured against", () => {
    expect(isQuiet({ seen_at: at(AWAY_AFTER_MS + 1) }, NOW)).toBe(true);
    expect(isQuiet({ seen_at: at(AWAY_AFTER_MS - 1) }, NOW)).toBe(false);
  });

  it("is measured against whichever window the caller is asking about", () => {
    // The same silence is three different answers. Two minutes is away, is not
    // yet gone from the poczekalnia, and has already cost you the host role.
    const one = { seen_at: at(120_000) };
    expect(isQuiet(one, NOW, AWAY_AFTER_MS)).toBe(true);
    expect(isQuiet(one, NOW, HOST_MISSING_AFTER_MS)).toBe(true);
    expect(isQuiet(one, NOW, LOBBY_GONE_AFTER_MS)).toBe(false);
  });

  it("reads the moment it is given rather than the clock on the wall", () => {
    const one = { seen_at: at(0) };
    expect(isQuiet(one, NOW)).toBe(false);
    expect(isQuiet(one, NOW + AWAY_AFTER_MS + 1)).toBe(true);
  });
});

describe("who takes over the table", () => {
  it("is whoever has been here longest of those left", () => {
    const people = here({}, {}, {});
    expect(nextHost(people, people[0])?.id).toBe("usr-1");
  });

  it("is not the person who is leaving", () => {
    const people = here({}, {});
    expect(nextHost(people, people[0])?.id).toBe("usr-1");
    expect(nextHost(people, people[1])?.id).toBe("usr-0");
  });

  it("skips somebody whose own page has said it is going away", () => {
    // Handing the role to a tab that is closing is how a table ends up
    // unstartable: the controls belong to a device that is not there.
    const people = here({}, { left_at: at(0) }, {});
    expect(nextHost(people, people[0])?.id).toBe("usr-2");
  });

  it("takes somebody who is driving nothing, because watching is still being here", () => {
    /**
     * The one place the split changes this outright. A spectator used to be
     * unrepresentable — no seat, no row, nobody — and is now an ordinary person
     * at the table who can perfectly well run it. 4.4 makes them common: a
     * player whose Postać died may decline to take another and stay.
     */
    const people = here({}, { seat_index: null });
    expect(nextHost(people, people[0])?.id).toBe("usr-1");
  });

  it("goes by when somebody joined and not by where they sit", () => {
    /**
     * Places freed in the middle are filled by the next person to arrive, so a
     * low seat index now means "sat in a gap", not "got here first". Seat 2
     * here is the older player and takes the table.
     */
    const people = [
      aUser({ id: "host", seat_index: 0, is_host: true, created_at: at(300_000) }),
      aUser({ id: "latecomer", seat_index: 1, is_host: false, created_at: at(10_000) }),
      aUser({ id: "veteran", seat_index: 2, is_host: false, created_at: at(200_000) }),
    ];
    expect(nextHost(people, people[0])?.id).toBe("veteran");
  });

  it("has nobody to hand it to when everybody else is going", () => {
    const people = here({}, { left_at: at(0) });
    expect(nextHost(people, people[0])).toBeNull();
  });
});

describe("handing the role over", () => {
  it("does nothing when the person leaving was never running the table", () => {
    const people = here({}, {});
    expect(promoteHost(people, people[1], 3)).toEqual({});
  });

  it("hands it over rather than copying it", () => {
    /**
     * Both halves matter. Leaving the outgoing host's flag set would leave the
     * table with two, the second being somebody who is not there — and when the
     * outgoing row is being deleted in the same change the demotion lands on
     * nothing, which is why removals are applied first.
     */
    const people = here({}, {});
    expect(promoteHost(people, people[0], 3)).toEqual({
      users: [
        { id: "usr-1", patch: { is_host: true } },
        { id: "usr-0", patch: { is_host: false } },
      ],
      // Nobody chose this: the host left or went quiet, and the role went to
      // whoever had been here longest. `taken` is `takeHostRole`'s, for the
      // other door — somebody picking it up deliberately.
      journal: [
        {
          seatId: null,
          turn: 3,
          kind: "new-host",
          payload: { name: "Gracz 2", from: "Gracz 1" },
        },
      ],
    });
  });

  it("leaves the flag where it is when there is nobody to take it", () => {
    // Better a table hosted by an absent person than a table hosted by nobody:
    // the second cannot be recovered, and `takeHostRole` can rescue the first.
    const people = here({}, { left_at: at(0) });
    expect(promoteHost(people, people[0], 3)).toEqual({});
  });
});

describe("finding a person, and naming a chair", () => {
  it("refuses an id nobody at this table has", () => {
    // The old version updated nothing and said it had worked, because a
    // PostgREST update matching no rows is not an error.
    expect(() => userOf(table(2), "usr-9")).toThrow("Nie ma takiego gracza");
  });

  it("says outright when somebody is driving nothing", () => {
    const snapshot = aTable({ seats: seated({}), users: here({ seat_index: null }) });
    expect(() => seatUnder(snapshot, snapshot.users[0])).toThrow("nie prowadzi żadnej Postaci");
  });

  it("names a seat after whoever is driving it", () => {
    const snapshot = table(2);
    expect(driverOf(snapshot.users, 1)?.id).toBe("usr-1");
    expect(nameOfSeat(snapshot.users, 1)).toBe("Gracz 2");
  });

  it("names an empty chair after the chair, which is what it is", () => {
    /**
     * Not a fallback for a missing name — an empty seat is a real state now,
     * and mid-game a common one: the Postać stands there with its Przedmioty
     * while whoever was driving it has closed their laptop.
     */
    const snapshot = aTable({ seats: seated({}, {}), users: here({}) });
    expect(driverOf(snapshot.users, 1)).toBeNull();
    expect(nameOfSeat(snapshot.users, 1)).toBe("miejsce 2");
  });
});

describe("saying you are ready, and what you are called", () => {
  const lobby = () =>
    aTable({
      game: { status: "lobby" },
      seats: seated({}, {}),
      users: here({ ready: false }, {}),
    });

  it("writes the change", () => {
    expect(setReady(lobby(), { userId: "usr-0", ready: true }).writes).toEqual({
      users: [{ id: "usr-0", patch: { ready: true } }],
    });
  });

  it("writes nothing when it is already so", () => {
    /**
     * An empty changeset commits nothing at all — see `isEmpty` — and that is
     * the point of checking. The browser sends the state it wants rather than a
     * toggle, so a second click on a button that is already down would
     * otherwise bump the revision and wake every device at the table.
     */
    expect(setReady(lobby(), { userId: "usr-1", ready: true }).writes).toEqual({});
    expect(renameUser(lobby(), { userId: "usr-0", name: "Gracz 1" }).writes).toEqual({});
  });

  it("renames somebody", () => {
    expect(renameUser(lobby(), { userId: "usr-0", name: "  Ola  " }).writes).toEqual({
      users: [{ id: "usr-0", patch: { name: "Ola" } }],
    });
  });

  it("refuses a name somebody else at this table is already using", () => {
    /**
     * The whole reason names are unique is that `kick Michał` has to mean one
     * person, and a table holding a Michał and a "Michał (2)" has given that up
     * to avoid one refusal.
     */
    expect(() => renameUser(lobby(), { userId: "usr-0", name: "Gracz 2" })).toThrow(
      "Przy stole jest już Gracz 2",
    );
  });

  it("refuses an empty name", () => {
    expect(() => renameUser(lobby(), { userId: "usr-0", name: "   " })).toThrow(
      "Imię nie może być puste",
    );
  });
});

describe("out of the chair, still at the table", () => {
  const playing = (people: Partial<UserRow>[], seats: number, activeSeat: number | null = 0) =>
    aTable({
      game: { status: "playing", active_seat: activeSeat },
      seats: seated(...Array.from({ length: seats }, () => ({}))),
      users: here(...people),
    });

  it("releases the seat, writes it down, and touches no other row", () => {
    /**
     * A player walking away is not a Postać dying. The figure stays on its
     * Obszar with its points, its Przedmioty and its Przyjaciele, because other
     * players may already have acted on all of them — 4.4's death is a
     * different event with different consequences.
     *
     * The line is the whole of what else it does. Standing up is one of the
     * four things that happen in a room rather than in a game, and all four
     * were silent until the Dziennik was hung in the poczekalnia where they
     * happen.
     */
    const { writes, result } = unseat(playing([{}, {}], 2, 1), { userId: "usr-0" });
    expect(writes.users).toEqual([{ id: "usr-0", patch: { seat_index: null } }]);
    expect(writes.journal).toEqual([
      {
        seatId: "seat-0",
        turn: 3,
        kind: "left-seat",
        payload: { name: "Gracz 1", seatIndex: 0 },
      },
    ]);
    expect(writes.seats).toBeUndefined();
    expect(writes.seatsRemoved).toBeUndefined();
    expect(result).toEqual({ removed: false, passedTo: null, gameFinished: false });
  });

  it("writes no line of its own when it is the first half of leaving", () => {
    // Otherwise walking away from a table says two things about one act:
    // "wstaje od stołu" and then "odchodzi od stołu". `leaveTable` writes the
    // second and this stays quiet for it.
    const { writes } = unseat(playing([{}, {}], 2, 1), {
      userId: "usr-0",
      partOfLeaving: true,
    });
    expect(writes.journal).toBeUndefined();
    expect(writes.users).toEqual([{ id: "usr-0", patch: { seat_index: null } }]);
  });

  it("does nothing to somebody who was already driving nothing", () => {
    const { writes } = unseat(playing([{}, { seat_index: null }], 2, 0), { userId: "usr-1" });
    expect(writes).toEqual({});
  });

  it("does not stop play for an empty chair", () => {
    const { writes, result } = unseat(playing([{}, {}], 2, 1), { userId: "usr-0" });
    expect(writes.game).toBeUndefined();
    expect(result.passedTo).toBeNull();
  });

  it("moves the turn on when it was theirs", () => {
    // Play does not wait on somebody who has gone.
    const { writes, result } = unseat(playing([{}, {}, {}], 3, 0), { userId: "usr-0" });
    expect(writes.game).toEqual({ active_seat: 1, turn_state: { phase: "roll" } });
    expect(result.passedTo).toBe(1);
  });

  it("wraps round to the first seat when the leaver was the last", () => {
    const { result } = unseat(playing([{}, {}, {}], 3, 2), { userId: "usr-2" });
    expect(result.passedTo).toBe(0);
  });

  it("skips seats with no Postać and seats that are out", () => {
    const snapshot = aTable({
      game: { status: "playing", active_seat: 0 },
      seats: [
        aSeat({ id: "seat-0", seat_index: 0 }),
        aSeat({ id: "seat-1", seat_index: 1, character_id: null }),
        aSeat({ id: "seat-2", seat_index: 2, eliminated: true }),
        aSeat({ id: "seat-3", seat_index: 3 }),
      ],
      users: here({}, {}, {}, {}),
    });
    expect(unseat(snapshot, { userId: "usr-0" }).result.passedTo).toBe(3);
  });

  it("leaves the turn where it is when there is nobody to pass it to", () => {
    const snapshot = aTable({
      game: { status: "playing", active_seat: 0 },
      seats: [
        aSeat({ id: "seat-0", seat_index: 0 }),
        aSeat({ id: "seat-1", seat_index: 1, character_id: null }),
      ],
      users: here({}, {}),
    });
    const { writes, result } = unseat(snapshot, { userId: "usr-0" });
    expect(writes.game).toBeUndefined();
    expect(result.passedTo).toBeNull();
  });
});

describe("off the table altogether", () => {
  const lobby = (...over: Partial<UserRow>[]) =>
    aTable({
      game: { status: "lobby" },
      seats: seated(...over.map(() => ({}))),
      users: here(...over),
    });

  it("takes the person and leaves the Postać standing", () => {
    /**
     * It is not theirs to take away — 4.4 is the only thing in the book that
     * removes a Postać — and the chair itself has to survive, because the
     * journal holds `seat_id` references to everything that seat ever did. In
     * the poczekalnia the sweep is what clears the empty chair afterwards.
     */
    const { writes, result } = leaveTable(lobby({}, {}), { userId: "usr-1" });
    expect(writes.usersRemoved).toEqual(["usr-1"]);
    expect(writes.seatsRemoved).toBeUndefined();
    expect(writes.seats).toBeUndefined();
    expect(result.removed).toBe(true);
  });

  it("writes down whether they walked or were thrown off", () => {
    /**
     * The only difference the two make, and it is worth making: being kicked is
     * not the same event as leaving, and a log that cannot tell them apart
     * cannot settle the argument it will be opened to settle.
     */
    const walked = leaveTable(lobby({}, {}), { userId: "usr-1" });
    const thrown = leaveTable(lobby({}, {}), { userId: "usr-1", kicked: true });
    expect(walked.writes.journal?.[0]).toEqual({
      seatId: null,
      turn: 3,
      kind: "left-table",
      payload: { user: "usr-1", name: "Gracz 2", kicked: false },
    });
    expect(thrown.writes.journal?.[0].payload).toMatchObject({ kicked: true });
  });

  it("hands the table on in the same breath as the host leaves it", () => {
    // Standing up, then the handover, then the row itself — leaving is
    // `unseat` and one thing more, and all three land in one change.
    const { writes } = leaveTable(lobby({}, {}), { userId: "usr-0" });
    expect(writes.usersRemoved).toEqual(["usr-0"]);
    expect(writes.users).toEqual([
      { id: "usr-0", patch: { seat_index: null } },
      { id: "usr-1", patch: { is_host: true } },
      { id: "usr-0", patch: { is_host: false } },
    ]);
  });

  it("leaves the table with exactly one host afterwards", () => {
    /**
     * The demotion lands on a row that is being deleted in the same change, so
     * this is the case removals-before-patches exists for. Asked of `apply`,
     * which is what `commit` promises to do to the database.
     */
    const before = lobby({}, {}, {});
    const after = apply(before, leaveTable(before, { userId: "usr-0" }).writes);
    expect(after.users.map((one) => one.id)).toEqual(["usr-1", "usr-2"]);
    expect(after.users.filter((one) => one.is_host).map((one) => one.id)).toEqual(["usr-1"]);
  });

  it("moves the turn on when the person leaving was the one to play", () => {
    // Leaving is standing up and then going, so it inherits everything
    // `unseat` decides about the turn.
    const playing = aTable({
      game: { status: "playing", active_seat: 0 },
      seats: seated({}, {}),
      users: here({}, {}),
    });
    const { writes, result } = leaveTable(playing, { userId: "usr-0" });
    expect(writes.game).toEqual({ active_seat: 1, turn_state: { phase: "roll" } });
    expect(result.passedTo).toBe(1);
  });

  it("refuses somebody who is not at this table", () => {
    expect(() => leaveTable(lobby({}), { userId: "usr-9" })).toThrow("Nie ma takiego gracza");
  });

  /**
   * A kick is the host's, and the refusal was lost in the split: `removeSeat`
   * enforced it and `leaveTable` replaced that function without replacing it,
   * so for a while any seated player could post another player's id and clear
   * them off the table. Leaving needs no permission because it takes nothing
   * from anybody; this does.
   */
  it("lets only the host throw somebody else off", () => {
    expect(() =>
      leaveTable(lobby({}, {}, {}), { userId: "usr-2", kicked: true, byUser: "usr-1" }),
    ).toThrow("Tylko gospodarz");
    expect(
      leaveTable(lobby({}, {}, {}), { userId: "usr-2", kicked: true, byUser: "usr-0" }).writes
        .usersRemoved,
    ).toEqual(["usr-2"]);
  });

  it("asks nobody's permission to leave of your own accord", () => {
    // Including the host's own exit, which hands the table on rather than
    // needing anybody to allow it.
    expect(leaveTable(lobby({}, {}), { userId: "usr-1" }).result.removed).toBe(true);
    expect(leaveTable(lobby({}, {}), { userId: "usr-0" }).result.removed).toBe(true);
  });
});

describe("sitting down", () => {
  const lobby = (people: Partial<UserRow>[], seats = 2) =>
    aTable({
      game: { status: "lobby" },
      seats: seated(...Array.from({ length: seats }, () => ({}))),
      users: here(...people),
    });

  it("puts somebody in a chair", () => {
    const { writes } = takeSeat(
      lobby([{}, { seat_index: null }]),
      { userId: "usr-1", seatIndex: 1 },
      clock(),
    );
    expect(writes.users).toEqual([{ id: "usr-1", patch: { seat_index: 1 } }]);
    // The chair, and only the chair. `joined` is the line for choosing a
    // Postać, and that is usually minutes later.
    expect(writes.journal).toEqual([
      {
        seatId: "seat-1",
        turn: 3,
        kind: "took-seat",
        payload: { name: "Gracz 2", seatIndex: 1 },
      },
    ]);
  });

  it("writes nothing when they are already in it", () => {
    expect(takeSeat(lobby([{}, {}]), { userId: "usr-1", seatIndex: 1 }, clock()).writes).toEqual({});
  });

  it("refuses a seat somebody is actively driving", () => {
    expect(() =>
      takeSeat(
        lobby([{}, { seen_at: at(1_000) }]),
        { userId: "usr-0", seatIndex: 1 },
        clock(),
      ),
    ).toThrow("To miejsce ma już swojego gracza");
  });

  it("takes over a seat whose driver has fallen silent, and stands them up first", () => {
    /**
     * Somebody who closed their tab never said they were leaving, so the seat
     * is merely quiet — and refusing it would strand the Postać for the rest of
     * the evening. The people in the room settle who picks it up; the server
     * only refuses a chair somebody is using.
     *
     * The quiet one is stood up in the same change, or two people hold one seat
     * and the unique index refuses the write with a message nobody can act on.
     */
    const { writes } = takeSeat(
      lobby([{ seat_index: null }, { seen_at: at(AWAY_AFTER_MS + 1) }]),
      { userId: "usr-0", seatIndex: 1 },
      clock(),
    );
    expect(writes.users).toEqual([
      { id: "usr-1", patch: { seat_index: null } },
      { id: "usr-0", patch: { seat_index: 1 } },
    ]);
  });

  it("leaves nobody in two chairs at once", () => {
    const before = lobby([{}, { seat_index: null }]);
    const after = apply(before, takeSeat(before, { userId: "usr-0", seatIndex: 1 }, clock()).writes);
    expect(after.users.map((one) => one.seat_index)).toEqual([1, null]);
  });
});

describe("taking the host role", () => {
  const lobby = (...over: Partial<UserRow>[]) =>
    aTable({
      game: { status: "lobby" },
      seats: seated(...over.map(() => ({}))),
      users: here(...over),
    });

  it("may be given away by the host who holds it", () => {
    const { writes } = takeHostRole(lobby({}, {}), { userId: "usr-1", byUser: "usr-0" }, clock());
    expect(writes.users).toEqual([
      { id: "usr-1", patch: { is_host: true } },
      { id: "usr-0", patch: { is_host: false } },
    ]);
  });

  it("may be taken from a host who has gone quiet", () => {
    /**
     * Without this door a table whose host closed their laptop can never be
     * configured or started again. The threshold is the host's own, and shorter
     * than the one that sweeps them: a table nobody can administer is a problem
     * before an absent player is.
     */
    const { writes } = takeHostRole(
      lobby({ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, {}),
      { userId: "usr-1", byUser: "usr-1" },
      clock(),
    );
    expect(writes.users).toContainEqual({ id: "usr-1", patch: { is_host: true } });
  });

  it("may not be taken from a host who is present", () => {
    // There is no co-host.
    expect(() =>
      takeHostRole(lobby({ seen_at: at(1_000) }, {}), { userId: "usr-1", byUser: "usr-1" }, clock()),
    ).toThrow("tylko obecny gospodarz");
  });

  it("may not be given to somebody who is not at the table", () => {
    expect(() =>
      takeHostRole(lobby({}, {}), { userId: "usr-9", byUser: "usr-0" }, clock()),
    ).toThrow("Nie ma takiego gracza");
  });

  it("leaves one host behind it", () => {
    const before = lobby({}, {}, {});
    const after = apply(
      before,
      takeHostRole(before, { userId: "usr-2", byUser: "usr-0" }, clock()).writes,
    );
    expect(after.users.filter((one) => one.is_host).map((one) => one.id)).toEqual(["usr-2"]);
  });

  it("writes nothing when they already have it", () => {
    expect(
      takeHostRole(lobby({}, {}), { userId: "usr-0", byUser: "usr-0" }, clock()).writes,
    ).toEqual({});
  });
});

describe("coming back to a table this browser was at", () => {
  const room = (...over: Partial<UserRow>[]) =>
    aTable({
      game: { status: "playing" },
      seats: seated(...over.map(() => ({}))),
      users: here(...over),
    });

  it("says nobody when this browser has never been here", () => {
    const { writes, result } = resumeAs(
      room({ device_id: "chrome" }),
      { deviceId: "firefox", token: "fresh" },
      clock(),
    );
    expect(result).toEqual({ user: null, live: false });
    expect(writes).toEqual({});
  });

  it("hands the fresh token to whoever this browser was", () => {
    /**
     * A tab closing takes the claim with it on purpose, so a browser coming
     * back holds nothing. Without this the only way in is to join again as a
     * second person, leaving the first sitting there driving a Postać nobody
     * can reach.
     */
    const { writes, result } = resumeAs(
      room({ device_id: "chrome", seen_at: at(LOBBY_GONE_AFTER_MS) }),
      { deviceId: "chrome", token: "fresh" },
      clock(),
    );
    expect(result.user?.id).toBe("usr-0");
    expect(writes.users).toEqual([
      { id: "usr-0", patch: { claim_token: "fresh", left_at: null } },
    ]);
  });

  it("takes somebody whose page said goodbye, however recently", () => {
    // The countdown a reload cancels has not run out, but the page said it was
    // going and this is the reload. Nothing is being taken from anybody.
    const { result } = resumeAs(
      room({ device_id: "chrome", seen_at: at(0), left_at: at(0) }),
      { deviceId: "chrome", token: "fresh" },
      clock(),
    );
    expect(result.user?.id).toBe("usr-0");
  });

  it("does not take a window that is using the table", () => {
    /**
     * Two tabs of one browser is a thing people do on purpose here — it is how
     * one person drives four seats to test something — so this is a question
     * for them rather than a refusal. Coming back as somebody live would take
     * the table out from under the window that is using it.
     */
    const { writes, result } = resumeAs(
      room({ device_id: "chrome", seen_at: at(1_000) }),
      { deviceId: "chrome", token: "fresh" },
      clock(),
    );
    expect(result).toEqual({ user: null, live: true });
    expect(writes).toEqual({});
  });

  it("picks the quiet one when this browser is two people", () => {
    // Michał is live in the first tab; the second was closed. Coming back is
    // coming back as the one nothing is using.
    const { result } = resumeAs(
      room(
        { device_id: "chrome", seen_at: at(1_000) },
        { device_id: "chrome", seen_at: at(LOBBY_GONE_AFTER_MS) },
      ),
      { deviceId: "chrome", token: "fresh" },
      clock(),
    );
    expect(result.user?.id).toBe("usr-1");
  });

  it("picks the most recently heard from of several quiet ones", () => {
    const { result } = resumeAs(
      room(
        { device_id: "chrome", seen_at: at(LOBBY_GONE_AFTER_MS * 4) },
        { device_id: "chrome", seen_at: at(LOBBY_GONE_AFTER_MS) },
      ),
      { deviceId: "chrome", token: "fresh" },
      clock(),
    );
    expect(result.user?.id).toBe("usr-1");
  });
});

describe("sweeping the poczekalnia", () => {
  const lobby = (...over: Partial<UserRow>[]) =>
    aTable({
      game: { status: "lobby" },
      seats: seated(...over.map(() => ({}))),
      users: here(...over),
    });
  const watching = { seen_at: at(1_000) };

  it("does nothing to a game that is being played", () => {
    /**
     * The sweep deletes people and their chairs outright, which is only ever
     * right before a Postać exists to be attached to one. Once play has begun
     * the seat outlives everybody who ever drove it — that is the whole point
     * of the split — and a phone that went to sleep is not a resignation.
     */
    const playing = aTable({
      game: { status: "playing" },
      seats: seated({}),
      users: here({ seen_at: at(10 ** 7) }),
    });
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
    expect(sweepLobby(lobby(watching, watching), undefined, clock()).writes).toEqual({});
  });

  it("removes somebody whose page said it was going and did not come back", () => {
    const { writes } = sweepLobby(
      lobby(watching, { ...watching, left_at: at(GOODBYE_GRACE_MS + 1) }),
      undefined,
      clock(),
    );
    expect(writes.usersRemoved).toEqual(["usr-1"]);
  });

  it("takes the chair with them, and only here", () => {
    // Before the game starts a seat is an intention rather than a Postać:
    // nothing has happened to it and nobody has acted on anything it owns.
    const { writes } = sweepLobby(
      lobby(watching, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }),
      undefined,
      clock(),
    );
    expect(writes.seatsRemoved).toEqual(["seat-1"]);
  });

  it("leaves no chair behind for somebody who was only watching", () => {
    const { writes } = sweepLobby(
      lobby(watching, { seat_index: null, seen_at: at(LOBBY_GONE_AFTER_MS + 1) }),
      undefined,
      clock(),
    );
    expect(writes.usersRemoved).toEqual(["usr-1"]);
    expect(writes.seatsRemoved).toBeUndefined();
  });

  it("holds somebody whose page is still inside the grace", () => {
    // `pagehide` fires on a reload as well as on a close, and the two are
    // indistinguishable from here. The countdown is what a reload cancels.
    const { writes } = sweepLobby(
      lobby(watching, { ...watching, left_at: at(GOODBYE_GRACE_MS - 1_000) }),
      undefined,
      clock(),
    );
    expect(writes).toEqual({});
  });

  it("gives a hidden tab far longer than an away marker does", () => {
    /**
     * Browsers throttle timers in background tabs to roughly once a minute, so
     * somebody who switched away to read something else is still checking in —
     * just slowly. Anything under two minutes evicts them for looking away.
     */
    const { writes } = sweepLobby(
      lobby(watching, { seen_at: at(AWAY_AFTER_MS + 1) }),
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
      lobby({ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, watching),
      undefined,
      clock(),
    );
    expect(writes.usersRemoved).toBeUndefined();
    expect(writes.users).toEqual([
      { id: "usr-1", patch: { is_host: true } },
      { id: "usr-0", patch: { is_host: false } },
    ]);
    expect(result.gameGone).toBe(false);
  });

  it("hands the role on when the host is the one being removed", () => {
    const { writes } = sweepLobby(
      lobby({ seen_at: at(LOBBY_GONE_AFTER_MS + 1) }, watching, watching),
      undefined,
      clock(),
    );
    expect(writes.usersRemoved).toEqual(["usr-0"]);
    expect(writes.users).toContainEqual({ id: "usr-1", patch: { is_host: true } });
  });

  it("never hands the role to somebody who is being swept in the same breath", () => {
    /**
     * The bug this replaces. The successor used to be chosen from everybody, so
     * somebody about to be deleted could be made host and then removed a line
     * later; the table recovered only because a second pass happened to catch
     * it. The second person here has been silent as long as the host, and the
     * third is the only one still watching.
     */
    const gone = { seen_at: at(LOBBY_GONE_AFTER_MS + 1) };
    const before = lobby(gone, gone, watching);
    const after = apply(before, sweepLobby(before, undefined, clock()).writes);
    expect(after.users.map((one) => one.id)).toEqual(["usr-2"]);
    expect(after.users.filter((one) => one.is_host).map((one) => one.id)).toEqual(["usr-2"]);
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

  it("keeps a table one person is still sitting at", () => {
    const { result } = sweepLobby(
      lobby({ seen_at: at(LOBBY_GONE_AFTER_MS + 1) }, watching),
      undefined,
      clock(),
    );
    expect(result.gameGone).toBe(false);
  });

    it("writes a line for each person it removes", () => {
      const { writes } = sweepLobby(
        lobby(watching, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }),
        undefined,
        clock(),
      );

      expect(writes.usersRemoved).toEqual(["usr-1"]);
      expect(writes.journal).toEqual([
        {
          seatId: null,
          turn: 3,
          kind: "left-table",
          payload: { user: "usr-1", name: "Gracz 2", kicked: false, swept: true },
        },
      ]);
    });

    it("says it was the silence and not a decision", () => {
      // `kicked: false` alone renders "odchodzi od stołu", which credits somebody
      // with a choice they did not make. `swept` is what tells the reader that
      // nobody decided anything.
      const line = sweepLobby(
        lobby(watching, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }),
        undefined,
        clock(),
      ).writes.journal?.[0];
      expect(line?.payload).toMatchObject({ swept: true, kicked: false });
    });

    it("writes nothing when nobody has gone quiet enough to remove", () => {
      expect(sweepLobby(lobby(watching, watching), undefined, clock()).writes.journal).toBeUndefined();
    });
});

describe("the cheap question asked on every poll", () => {
  /**
   * `needsSweep` is what keeps the common path at one query. The sweep proper
   * wants a whole snapshot — six reads — and finds nothing to do almost every
   * time, so the route asks this first, off the user list it already has, and
   * only pays for the snapshot when the answer is yes. Which means the two must
   * never disagree.
   */
  const watching = { seen_at: at(1_000) };

  it("says no at a table everybody is watching", () => {
    expect(needsSweep(here(watching, watching), NOW)).toBe(false);
  });

  it("says yes to somebody gone, and to a host merely quiet", () => {
    expect(needsSweep(here(watching, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }), NOW)).toBe(true);
    expect(needsSweep(here({ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, watching), NOW)).toBe(true);
  });

  it("agrees with the sweep itself on every table these tests describe", () => {
    const cases: Partial<UserRow>[][] = [
      [watching, watching],
      [watching, { seen_at: at(LOBBY_GONE_AFTER_MS + 1) }],
      [watching, { ...watching, left_at: at(GOODBYE_GRACE_MS + 1) }],
      [watching, { ...watching, left_at: at(GOODBYE_GRACE_MS - 1_000) }],
      [{ seen_at: at(HOST_MISSING_AFTER_MS + 1) }, watching],
      [watching, { seen_at: at(AWAY_AFTER_MS + 1) }],
      [watching, { seat_index: null, seen_at: at(LOBBY_GONE_AFTER_MS + 1) }],
    ];
    for (const people of cases) {
      const snapshot = aTable({
        game: { status: "lobby" },
        seats: seated(...people.map(() => ({}))),
        users: here(...people),
      });
      const { writes } = sweepLobby(snapshot, undefined, clock());
      expect(needsSweep(snapshot.users, NOW)).toBe(Object.keys(writes).length > 0);
    }
  });

  it("counts nobody as gone at a table nobody has spoken at yet", () => {
    // Everybody has just arrived and none of them has polled once. A fresh
    // poczekalnia is not a room everybody walked out of.
    expect(goneFrom(here({}, {}), NOW)).toEqual([]);
  });
});

/**
 * Arriving, which the journal did not record until it did.
 *
 * The gap this closes: `joined` is written by `takeNewCharacter` and means a
 * *Postać* entered play. Between opening the join gate and choosing a Karta a
 * person sits in the poczekalnia, and everything they did there was invisible —
 * so a table filling up read as silence followed by four characters at once.
 */
describe("somebody arriving at the table", () => {
  it("writes a line naming them, against the seat they were given", () => {
    expect(noteArrival(table(2), { name: "Ola", seatId: "seat-1" }).writes.journal?.[0]).toEqual({
      seatId: "seat-1",
      turn: 3,
      kind: "joined-table",
      payload: { name: "Ola" },
    });
  });

  it("says so when they got no chair", () => {
    // Six seats is a limit on Postacie, not on people (LOBBY.md), so a full
    // table still admits somebody — and "przygląda się" is a different sentence
    // from "przychodzi do stołu", which is the whole reason the flag is in the
    // payload rather than inferred from a null seat by the reader.
    const watching = noteArrival(table(2), { name: "Ola", seatId: null });
    expect(watching.writes.journal?.[0]).toEqual({
      seatId: null,
      turn: 3,
      kind: "joined-table",
      payload: { name: "Ola", spectator: true },
    });
  });

  it("keeps the name rather than pointing at the row it came from", () => {
    // The same copy `left-table` makes, for the same reason: the user row can
    // be deleted — swept, kicked, walked away — and a journal that loses the
    // name with it cannot answer what it is opened to answer.
    const line = noteArrival(table(2), { name: "Ola", seatId: "seat-1" }).writes.journal?.[0];
    expect(line?.payload).toMatchObject({ name: "Ola" });
    expect(line?.payload).not.toHaveProperty("user");
  });
});

/**
 * The sweep, which used to take people off the table without a word.
 *
 * It is the third way somebody leaves — walking away writes `left-table`, being
 * kicked writes it with `kicked`, and going quiet long enough deleted the row
 * and said nothing at all. A name disappearing off the roster with no account
 * of why is exactly what the journal is opened to settle.
 */
