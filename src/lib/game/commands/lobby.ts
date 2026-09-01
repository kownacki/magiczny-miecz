/** The poczekalnia: opening a table, sitting down, being renamed, handing the host role on, and leaving. Who is still here is ./presence. */

import type { EqMode } from "@/lib/engine/slots";
import { HOST_MISSING_AFTER_MS, isQuiet } from "./presence";
import { only } from "@/lib/engine/stack";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import type { SeatRow, UserRow } from "../store";
import { convertTrophies } from "./shop";

/**
 * The part that is not Magiczny Miecz.
 *
 * Nothing in this file has a rule number, because the rulebook has nothing to
 * say about a browser tab closing. It is all the app's own — see
 * `docs/LOBBY.md` — and it is the last of the store's writing to come across to
 * the command shape.
 *
 * Two reasons it had to. It was untested, and it is not simple: who becomes
 * host when the host walks away, how long a hidden tab may stay hidden before
 * its seat is somebody else's, and which of two thresholds a quiet seat has
 * crossed are decisions with consequences, and they were only ever asked of a
 * live database. And it ran without a compare-and-swap while being called from
 * the busiest path in the app — every device polls the state every two seconds
 * and every one of those polls swept the lobby, so six devices at one table ran
 * six concurrent host promotions against a row none of them had locked.
 */

/* --------------------------------------------------------------------------
 * Who runs the table.
 * ----------------------------------------------------------------------- */

/**
 * Whoever takes over when `leaving` stops being host.
 *
 * Whoever has been at the table longest of those left — a stable, explicable
 * rule, which matters because nobody chose it in the moment.
 *
 * By `created_at` and not by `seat_index`: places freed in the middle are
 * filled by the next person to arrive, so a low index now means "sat in a gap",
 * not "got here first". Ties break on index, which is the old rule and is what
 * every seat that predates the column will do.
 *
 * Somebody whose own page has said it is going away is skipped, and if that is
 * everybody the role stays where it is: handing it to a tab that is closing is
 * how a table ends up unstartable, and an absent host can at least be replaced
 * through `takeHostRole`'s second door.
 */
export function nextHost(users: readonly UserRow[], leaving: UserRow): UserRow | null {
  return (
    users
      .filter((one) => one.id !== leaving.id && one.left_at === null)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] ?? null
  );
}

/**
 * Keeps a table hosted.
 *
 * The host flag only decides who sees the lobby controls, but a table whose
 * host walked away with it would strand everyone else.
 *
 * The role is handed over rather than copied: a retired seat keeps its row so
 * the journal's references survive, and leaving it marked host would leave the
 * table with two — the outgoing one being a seat nobody is sitting in. When the
 * outgoing seat is being removed in the same change the demotion patch lands on
 * nothing, which is exactly why removals are applied first (see `seatsRemoved`).
 */
export function promoteHost(
  users: readonly UserRow[],
  leaving: UserRow,
  /**
   * Which round to file the line under.
   *
   * Required rather than optional, so that adding the journal line here could
   * not silently miss a caller: both of them — somebody leaving, and the sweep
   * — have a snapshot to hand and the compiler named them.
   */
  round: number,
): Changeset {
  if (!leaving.is_host) return {};
  const candidate = nextHost(users, leaving);
  if (!candidate) return {};
  return {
    users: [
      { id: candidate.id, patch: { is_host: true } },
      { id: leaving.id, patch: { is_host: false } },
    ],
    journal: [
      {
        seatId: null,
        round,
        kind: "new-host",
        // Nobody chose this one: the host walked away or went quiet, and the
        // role goes to whoever has been here longest. `taken` is the other
        // door — see `takeHostRole`.
        payload: { name: candidate.name, from: leaving.name },
      },
    ],
  };
}

/** The person, or a refusal naming the thing that is not there. */
export function userOf(snapshot: Snapshot, userId: string): UserRow {
  const user = snapshot.users.find((one) => one.id === userId);
  if (!user) throw new Error("Nie ma takiego gracza.");
  return user;
}

/** The seat somebody is driving, or a refusal. */
export function seatUnder(snapshot: Snapshot, user: UserRow): SeatRow {
  const seat =
    user.seat_index === null
      ? undefined
      : snapshot.seats.find((one) => one.seat_index === user.seat_index);
  if (!seat) throw new Error("Ten gracz nie prowadzi żadnej Postaci.");
  return seat;
}

/**
 * Whoever is driving this seat, or nobody.
 *
 * Takes the people rather than the whole table, because the two callers that
 * are not commands — the console and the roster — have a list of users and no
 * `Snapshot` to put it in, and a rule that can only be asked from inside a
 * command is one the edges quietly reimplement.
 */
export function driverOf(users: readonly UserRow[], seatIndex: number): UserRow | null {
  return users.find((one) => one.seat_index === seatIndex) ?? null;
}

/**
 * What to call a seat in a sentence somebody reads.
 *
 * The person driving it, and the chair when nobody is — which is the honest
 * answer rather than a fallback, because an empty seat is a real state now and
 * has no name of its own. Seats used to carry `player_name` and every message
 * reached for it; there is nothing to reach for any more, so this is the one
 * place that decides.
 */
export function nameOfSeat(users: readonly UserRow[], seatIndex: number): string {
  return driverOf(users, seatIndex)?.name ?? `miejsce ${seatIndex + 1}`;
}

/* --------------------------------------------------------------------------
 * Saying who you are and whether you are ready.
 * ----------------------------------------------------------------------- */

/**
 * Says whether a player is ready to start (docs/LOBBY.md).
 *
 * Only ever your own seat: readiness is a statement about yourself, and a host
 * who could mark everyone ready would have a start button with extra steps.
 * Which seat is asking is settled by the route, off the token, before this is
 * reached.
 */
export function setReady(
  snapshot: Snapshot,
  command: { userId: string; ready: boolean },
): Outcome<void> {
  const user = userOf(snapshot, command.userId);
  if (user.ready === command.ready) return { writes: {}, result: undefined };
  return {
    writes: { users: [{ id: user.id, patch: { ready: command.ready } }] },
    result: undefined,
  };
}

/**
 * Changes what somebody is called.
 *
 * Unique per table, and refused rather than quietly suffixed: the whole reason
 * names are unique is that `kick Michał` has to mean one person, and a table
 * holding a Michał and a "Michał (2)" has given that up to avoid one refusal.
 */
export function renameUser(
  snapshot: Snapshot,
  command: { userId: string; name: string },
): Outcome<void> {
  const user = userOf(snapshot, command.userId);
  const wanted = command.name.trim();
  if (!wanted) throw new Error("Imię nie może być puste.");
  if (user.name === wanted) return { writes: {}, result: undefined };
  if (snapshot.users.some((one) => one.id !== user.id && one.name === wanted)) {
    throw new Error(`Przy stole jest już ${wanted}.`);
  }
  return {
    writes: { users: [{ id: user.id, patch: { name: wanted } }] },
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Leaving, and being left.
 * ----------------------------------------------------------------------- */

export interface LeaveResult {
  removed: boolean;
  /** Set when the leaver was the active player and the turn had to move on. */
  passedTo: number | null;
  gameFinished: boolean;
}

/**
 * Whoever plays after the seat at `seatIndex` stops being able to.
 *
 * Wraps: the next seat by number that still has a Postać able to act, and the
 * first of them when there is none after. Null when nobody is left, which is a
 * table with nothing to pass to rather than an error.
 */
function playsNext(snapshot: Snapshot, seatIndex: number): number | null {
  const able = snapshot.seats.filter(
    (seat) => seat.character_id && !seat.eliminated && seat.seat_index !== seatIndex,
  );
  if (able.length === 0) return null;
  const after = able.find((seat) => seat.seat_index > seatIndex) ?? able[0];
  return after.seat_index;
}

/**
 * Out of the seat, still at the table.
 *
 * The Postać stays exactly where it is standing with everything it owns, and
 * the seat is left for somebody to take over — the same person on a new tab, or
 * anybody else in the room. This is what the rulebook has no word for at all,
 * because in 1993 everybody was in one room and a person who stood up came
 * back.
 *
 * Play does not stop for an empty chair but must not wait on one either: if it
 * was that seat's turn, it moves on.
 */
export function unseat(
  snapshot: Snapshot,
  command: {
    userId: string;
    /**
     * True when this is the first half of `leaveTable`, which writes its own
     * line. Without it, walking away from a table produces two: "wstaje od
     * stołu" and then "odchodzi od stołu", about one act. Standing up and
     * staying is the case that wants a line of its own.
     */
    partOfLeaving?: boolean;
  },
): Outcome<LeaveResult> {
  const user = userOf(snapshot, command.userId);
  if (user.seat_index === null) {
    return { writes: {}, result: { removed: false, passedTo: null, gameFinished: false } };
  }

  const noted: Changeset = command.partOfLeaving
    ? {}
    : {
        journal: [
          {
            seatId: snapshot.seats.find((seat) => seat.seat_index === user.seat_index)?.id ?? null,
            round: snapshot.game.round,
            kind: "left-seat",
            payload: { name: user.name, seatIndex: user.seat_index },
          },
        ],
      };

  const released: Changeset = merge(noted, {
    users: [{ id: user.id, patch: { seat_index: null } }],
  });
  if (snapshot.game.active_seat !== user.seat_index) {
    return { writes: released, result: { removed: false, passedTo: null, gameFinished: false } };
  }
  const next = playsNext(snapshot, user.seat_index);
  if (next === null) {
    return { writes: released, result: { removed: false, passedTo: null, gameFinished: false } };
  }
  return {
    writes: merge(released, {
      game: { active_seat: next, turn_state: only({ phase: "roll" }) },
    }),
    result: { removed: false, passedTo: next, gameFinished: false },
  };
}

/**
 * Out of the table altogether.
 *
 * Which is `unseat` and then the person themselves — the row goes, the name is
 * free again, and the host role moves on if they were holding it. The Postać is
 * untouched: it is not theirs to take away, and 4.4 is the only thing in the
 * book that removes one.
 *
 * Two ways in, and the only difference is the journal. `leave` is somebody
 * going by their own choice, or the tab closing, which is the same act without
 * the click. `kick` is somebody else deciding — and being thrown off a table is
 * worth being able to tell apart from having walked away from it.
 *
 * Which is also why a kick is the host's and nothing else. Leaving needs no
 * permission because it takes nothing from anybody; throwing somebody off does,
 * and the rule was lost in the split — `removeSeat` enforced it and `leaveTable`
 * replaced that function without replacing its refusal, so for a while any
 * seated player could post another player's id and clear them off the table.
 * Here rather than in the route, because it is a rule and because the browser
 * has its own copy of it: a rule the client keeps and the server does not is
 * not a rule.
 */
/**
 * Somebody arrived, written down at the moment they did.
 *
 * The counterpart of `leaveTable`, and it was missing: the journal recorded
 * every departure and no arrival, because the only line near a join was
 * `joined`, which `takeNewCharacter` writes when a *Postać* enters play. That
 * is a different event minutes later — a person opens the join gate, sits in
 * the poczekalnia deciding, and picks a Karta when they are ready. So a table
 * filling up read as silence and then four characters at once.
 *
 * Takes the name rather than a user id, because the row this is about may not
 * be in the snapshot: `joinGame` inserts the user itself — it has to mint and
 * hand back a claim token, which a Changeset cannot do — so by the time a
 * command could look, the arrival has already happened outside it. The name is
 * copied into the payload for the reason `left-table` copies it: the row can be
 * deleted and the line has to survive it.
 */
/**
 * Which equipment variant the table plays, settled while it is still settling.
 *
 * It used to be answered in the dialog that opens a table, before anybody else
 * had arrived — so the one person clicking fastest chose a house rule for
 * everybody, and the others found out by discovering they had a Plecak. The
 * poczekalnia is where a table talks, so it is where this belongs.
 *
 * Only there, though. Half of what the variant decides has already been applied
 * to cards the moment play starts — what is worn, what merely carried, what
 * counts in a fight — and there is no honest way to reinterpret a board
 * mid-game. `Settings` in the game says exactly this about it, and now says it
 * about a setting that really was fixed rather than one nobody had moved.
 */
/**
 * How this table keeps a beaten Wróg (1.4). See docs/TROFEA.md.
 *
 * The poczekalnia only, for the same reason the ekwipunek is settled there: by
 * the time anybody has beaten a Wróg the choice has already been applied to a
 * card — either it is in a pack or its points are on a seat — and there is no
 * honest way to reinterpret that mid-game. Switching to `punkty` in play would
 * have to invent points for Karty already held, and switching the other way
 * would have to invent Karty for points already banked.
 */
export function setTrophyMode(
  snapshot: Snapshot,
  command: { mode: "points" | "cards" },
): Outcome<void> {
  if (snapshot.game.trophy_mode === command.mode) return { writes: {}, result: undefined };

  /** In the poczekalnia either answer is free: nobody holds anything yet. */
  if (snapshot.game.status === "lobby") {
    return { writes: { game: { trophy_mode: command.mode } }, result: undefined };
  }
  if (snapshot.game.status !== "playing") {
    throw new Error("Gra się skończyła.");
  }

  /**
   * Mid-game it closes in one direction only, and the asymmetry is the rule
   * rather than caution.
   *
   * Turning „Punkty" *on* is a conversion the table can make together: every
   * held Karta has its Miecz printed on it, so each one becomes that many
   * points and goes to the stos zużytych, and nobody is better or worse off
   * for it. Turning it back *off* would have to hand Karty out again, and
   * there are none — the Wrogowie went to the pile as they were beaten, and a
   * referee that dealt replacements would be inventing cards.
   */
  if (command.mode === "cards") {
    throw new Error(
      "Gra już trwa — Karty pokonanych wracają dopiero przy nowym stole: " +
        "pokonani Wrogowie leżą na stosie zużytych i nie ma czego rozdać.",
    );
  }

  return {
    writes: mergeAll(
      { game: { trophy_mode: command.mode } },
      convertTrophies(snapshot),
      {
        journal: [
          {
            seatId: null,
            round: snapshot.game.round,
            kind: "override" as const,
            payload: { what: "trophy-mode" },
          },
        ],
      },
    ),
    result: undefined,
  };
}

export function setEqMode(
  snapshot: Snapshot,
  command: { eqMode: EqMode },
): Outcome<void> {
  if (snapshot.game.status !== "lobby") {
    throw new Error("Ekwipunek wybiera się przed rozpoczęciem gry — w trakcie już nie do zmiany.");
  }
  if (snapshot.game.eq_mode === command.eqMode) return { writes: {}, result: undefined };
  return { writes: { game: { eq_mode: command.eqMode } }, result: undefined };
}

/**
 * The two lines a brand-new table starts with.
 *
 * `createGame` writes its rows itself — the games row, the host's seat and the
 * host — for the same reason `joinGame` does: it has to mint a claim token and
 * hand it back, which a Changeset cannot do. So there is no command in the
 * path, and the journal was empty until somebody moved. A Dziennik reading
 * "Jeszcze nic się nie wydarzyło" under a table you have just made yourself
 * reads as a Dziennik that does not work.
 *
 * Both lines rather than one. Opening the table and being its first player are
 * two facts — the second person to arrive gets a line for arriving, and the
 * host getting none would make the log start in the middle.
 */
export function openTable(
  snapshot: Snapshot,
  command: { hostName: string; hostSeatId: string | null },
): Outcome<void> {
  return {
    writes: {
      journal: [
        {
          seatId: null,
          round: snapshot.game.round,
          kind: "table-opened",
          // The mode, because it is the one setting that cannot be changed
          // afterwards.
          payload: { mode: snapshot.game.mode },
        },
        {
          seatId: command.hostSeatId,
          round: snapshot.game.round,
          kind: "joined-table",
          payload: { name: command.hostName },
        },
      ],
    },
    result: undefined,
  };
}

export function noteArrival(
  snapshot: Snapshot,
  command: { name: string; seatId: string | null },
): Outcome<void> {
  return {
    writes: {
      journal: [
        {
          seatId: command.seatId,
          round: snapshot.game.round,
          kind: "joined-table",
          // A person with no chair is watching, which is a thing six seats
          // allows and the journal should say plainly rather than by omission.
          payload: { name: command.name, ...(command.seatId ? {} : { spectator: true }) },
        },
      ],
    },
    result: undefined,
  };
}

export function leaveTable(
  snapshot: Snapshot,
  command: { userId: string; kicked?: boolean; byUser?: string },
): Outcome<LeaveResult> {
  const user = userOf(snapshot, command.userId);
  if (command.kicked && command.byUser !== undefined) {
    const by = userOf(snapshot, command.byUser);
    if (!by.is_host) throw new Error("Tylko gospodarz może usunąć kogoś ze stołu.");
  }
  const stood = unseat(snapshot, { userId: user.id, partOfLeaving: true });
  const after = apply(snapshot, stood.writes);

  const gone: Changeset = {
    usersRemoved: [user.id],
    journal: [
      {
        seatId: null,
        round: snapshot.game.round,
        kind: "left-table",
        payload: { user: user.id, name: user.name, kicked: command.kicked ?? false },
      },
    ],
  };

  return {
    writes: mergeAll(stood.writes, promoteHost(after.users, user, snapshot.game.round), gone),
    result: { ...stood.result, removed: true },
  };
}

/**
 * Somebody sits down.
 *
 * Refused only when a seat is actively being driven. A person who closed their
 * tab never said they were leaving, so the seat is merely quiet — and refusing
 * it would strand the Postać for the rest of the evening. The people in the
 * room settle who picks it up; the server only refuses a chair somebody is
 * using.
 */
export function takeSeat(
  snapshot: Snapshot,
  command: { userId: string; seatIndex: number },
  ports: CommandPorts,
): Outcome<void> {
  const user = userOf(snapshot, command.userId);
  const driver = snapshot.users.find(
    (one) => one.id !== user.id && one.seat_index === command.seatIndex,
  );
  if (driver && !isQuiet(driver, ports.now())) {
    throw new Error("To miejsce ma już swojego gracza.");
  }
  if (user.seat_index === command.seatIndex) return { writes: {}, result: undefined };

  // The quiet one is stood up first, or two people hold one seat and the unique
  // index refuses the write with a message nobody can act on.
  const displaced: Changeset = driver
    ? { users: [{ id: driver.id, patch: { seat_index: null } }] }
    : {};
  return {
    writes: mergeAll(displaced, {
      users: [{ id: user.id, patch: { seat_index: command.seatIndex } }],
    }, {
      journal: [
        {
          seatId: snapshot.seats.find((seat) => seat.seat_index === command.seatIndex)?.id ?? null,
          round: snapshot.game.round,
          kind: "took-seat",
          // The chair, not the Postać: nothing has been chosen yet, and
          // `joined` is the line for that — usually minutes later.
          payload: { name: user.name, seatIndex: command.seatIndex },
        },
      ],
    }),
    result: undefined,
  };
}

/**
 * Hands the host role to somebody, or takes it from a host who has gone.
 *
 * Two ways in, and only two. The host may give it away deliberately, and
 * anybody may take it when the host has gone quiet — without that second door,
 * a table whose host closed their laptop can never be configured or started
 * again, which is the whole reason host migration exists.
 *
 * Taking it from a host who is present is not a door. There is no co-host.
 */
export function takeHostRole(
  snapshot: Snapshot,
  command: { userId: string; byUser: string },
  ports: CommandPorts,
): Outcome<void> {
  const by = userOf(snapshot, command.byUser);
  const host = snapshot.users.find((one) => one.is_host);
  if (host && host.id !== by.id && !isQuiet(host, ports.now(), HOST_MISSING_AFTER_MS)) {
    throw new Error("Rolę gospodarza może przekazać tylko obecny gospodarz.");
  }
  const target = userOf(snapshot, command.userId);
  if (target.is_host) return { writes: {}, result: undefined };

  return {
    writes: {
      users: [
        { id: target.id, patch: { is_host: true } },
        ...(host ? [{ id: host.id, patch: { is_host: false } }] : []),
      ],
      journal: [
        {
          seatId: null,
          round: snapshot.game.round,
          kind: "new-host",
          // `taken` separates the two doors this command is: the host handing
          // it over, and somebody picking it up because the host has gone. A
          // table reading the log later wants to know which happened.
          payload: {
            name: target.name,
            ...(host ? { from: host.name } : {}),
            taken: host ? host.id !== by.id : false,
          },
        },
      ],
    },
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Coming back.
 * ----------------------------------------------------------------------- */

export interface Resumption {
  /** Whoever this browser was here, once it holds the fresh token. */
  user: UserRow | null;
  /**
   * True when this browser is already somebody here, in another window.
   *
   * Not a refusal — there is nothing wrong with two tabs — but the person has
   * to be asked which they meant, because coming back as somebody who is
   * *live* would take the table out from under a window that is using it.
   */
  live: boolean;
}

/**
 * The person a returning browser was, if they can be come back as.
 *
 * A tab closing takes the claim with it, deliberately (`seatToken.ts`), so
 * reopening a table is a stranger holding nothing — and before this the only
 * way back in was to join again as a second person, leaving the first sitting
 * there driving a Postać nobody could reach.
 *
 * The quiet ones first, most recently heard from. A browser can be several
 * people at one table — that is what a second tab is — so "who was I?" has a
 * list for an answer, and the useful one is whichever of them nothing is
 * currently using. Only when every one of them is live is there nobody to come
 * back as, and then the answer is to join as somebody new.
 *
 * The token is minted by the edge and handed in: a fresh one, so the window
 * that had it stops holding it, and because reading a stored token back out is
 * the one thing this app never does with them.
 */
export function resumeAs(
  snapshot: Snapshot,
  command: { deviceId: string; token: string },
  ports: CommandPorts,
): Outcome<Resumption> {
  const was = snapshot.users.filter((one) => one.device_id === command.deviceId);
  if (was.length === 0) return { writes: {}, result: { user: null, live: false } };

  const now = ports.now();
  const asleep = was
    .filter((one) => one.left_at !== null || isQuiet(one, now))
    .sort((a, b) => Date.parse(b.seen_at ?? a.created_at) - Date.parse(a.seen_at ?? b.created_at));
  const back = asleep[0];
  if (!back) return { writes: {}, result: { user: null, live: true } };

  return {
    writes: {
      users: [{ id: back.id, patch: { claim_token: command.token, left_at: null } }],
    },
    result: { user: back, live: false },
  };
}
