/** The poczekalnia: seats arriving, going quiet, being taken over, and going away. */

import { mergeAll, type Changeset, type CommandPorts, type Outcome, type Snapshot } from "../change";
import type { SeatRow } from "../store";

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
 * How long is too long.
 * ----------------------------------------------------------------------- */

/**
 * How long a seat may go unheard-from before it is shown as away.
 *
 * The browser polls every two seconds, so this is generous: a tab in the
 * background, a phone that slept, or a slow network should not make somebody
 * look like they have left the table.
 */
export const AWAY_AFTER_MS = 45_000;

/**
 * How long a seat in the poczekalnia may go unheard-from before it is taken off
 * the table.
 *
 * Much longer than `AWAY_AFTER_MS`, because a hidden tab is not a closed one.
 * Browsers throttle timers in background tabs to roughly once a minute, so
 * somebody who switched away to read something else is still checking in —
 * just slowly. Anything under two minutes evicts them for looking away.
 */
export const LOBBY_GONE_AFTER_MS = 150_000;

/**
 * How long the host may go unheard-from before the role moves on.
 *
 * Deliberately shorter than `LOBBY_GONE_AFTER_MS`. The two thresholds answer
 * different questions — "can this table still be administered?" and "is this
 * person still here?" — and the first has to be answered first. If the host
 * only lost the role at the moment their seat was deleted, then between the
 * host going quiet and the sweep catching it the table would have nobody able
 * to start it, and a table full of people who cannot start is worse than a
 * table with an absent host.
 *
 * The seat stays where it is. This moves the role, nothing else, so a host who
 * comes back is still at the table — just not running it any more.
 */
export const HOST_MISSING_AFTER_MS = 60_000;

/**
 * How long a seat is held after its page said it was going away.
 *
 * A page fires `pagehide` when the tab closes and when it reloads, and those
 * are indistinguishable from the outside — so this is not a removal, it is a
 * countdown that reloading cancels. Long enough for a slow reload to land,
 * short enough that a closed tab frees the place while people are still
 * looking at the screen.
 */
export const GOODBYE_GRACE_MS = 10_000;

/**
 * A seat that checked in once and then stopped.
 *
 * A seat that has *never* checked in is not quiet — it is either brand new or a
 * player the host seated by hand, and neither is free for the taking.
 *
 * Takes the moment rather than reading the clock, like every other rule
 * measured in time here: a threshold that cannot be asked what it would say at
 * a given instant cannot be tested at all.
 */
export function isQuiet(
  seat: Pick<SeatRow, "seen_at">,
  now: number,
  after = AWAY_AFTER_MS,
): boolean {
  if (!seat.seen_at) return false;
  return now - Date.parse(seat.seen_at) > after;
}

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
 * Somebody who has themselves walked away is skipped; handing the role to an
 * empty chair is how a table ends up unstartable.
 */
export function nextHost(seats: readonly SeatRow[], leaving: SeatRow): SeatRow | null {
  return (
    seats
      .filter((seat) => seat.id !== leaving.id && !seat.eliminated && !seat.abandoned_at)
      .sort(
        (a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) || a.seat_index - b.seat_index,
      )[0] ?? null
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
export function promoteHost(seats: readonly SeatRow[], leaving: SeatRow): Changeset {
  if (!leaving.is_host) return {};
  const candidate = nextHost(seats, leaving);
  if (!candidate) return {};
  return {
    seats: [
      { id: candidate.id, patch: { is_host: true } },
      { id: leaving.id, patch: { is_host: false } },
    ],
  };
}

/** The seat, or a refusal naming the thing that is not there. */
function seatOf(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((one) => one.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  return seat;
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
  command: { seatId: string; ready: boolean },
): Outcome<void> {
  const seat = seatOf(snapshot, command.seatId);
  if (seat.ready === command.ready) return { writes: {}, result: undefined };
  return {
    writes: { seats: [{ id: seat.id, patch: { ready: command.ready } }] },
    result: undefined,
  };
}

/** Changes the name shown for a seat. Only ever your own. */
export function renameSeat(
  snapshot: Snapshot,
  command: { seatId: string; name: string | null },
): Outcome<void> {
  const seat = seatOf(snapshot, command.seatId);
  if (seat.player_name === command.name) return { writes: {}, result: undefined };
  return {
    writes: { seats: [{ id: seat.id, patch: { player_name: command.name } }] },
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
 * Gives up a seat.
 *
 * Before the game starts the seat is deleted outright — nothing references it
 * and someone who joined the wrong table should leave no trace. Once play has
 * begun it is retired instead: the journal holds `seat_id` references to
 * everything that seat did, and deleting the row would cascade those away and
 * take the game's history with them.
 *
 * A player walking away is not a character dying. The figure stays on its
 * Obszar with its points, its Przedmioty and its Przyjaciele, because other
 * players may already have acted on all of them and 4.4's death is a different
 * event with different consequences. What is released is the *claim*: the token
 * is rotated so the departing device cannot act as this seat any more, and the
 * seat is marked as having nobody behind it — free for somebody to take over,
 * and shown as such.
 *
 * Seat indexes are deliberately not compacted. `nextSeat` walks the seat array
 * rather than counting indexes, so a gap is harmless, whereas renumbering would
 * silently change who `active_seat` points at.
 *
 * The fresh token comes in rather than being made here: minting one is
 * `node:crypto`, and a command that reached for it could not be replayed by a
 * retried commit (see `replayable`). The edge makes it, the rule places it.
 */
export function leaveSeat(
  snapshot: Snapshot,
  command: { seatId: string; token: string },
  ports: CommandPorts,
): Outcome<LeaveResult> {
  const seat = seatOf(snapshot, command.seatId);

  // Before the game starts a seat is just an intention, so leaving deletes it.
  if (snapshot.game.status === "lobby") {
    return {
      writes: mergeAll({ seatsRemoved: [seat.id] }, promoteHost(snapshot.seats, seat)),
      result: { removed: true, passedTo: null, gameFinished: false },
    };
  }

  const released: Changeset = {
    seats: [
      {
        id: seat.id,
        patch: {
          abandoned_at: new Date(ports.now()).toISOString(),
          claim_token: command.token,
        },
      },
    ],
  };
  const handed = promoteHost(snapshot.seats, seat);

  // Play does not stop for an empty chair, but it must not wait on one either:
  // if it was their turn, it moves on.
  if (snapshot.game.active_seat !== seat.seat_index) {
    return {
      writes: mergeAll(released, handed),
      result: { removed: false, passedTo: null, gameFinished: false },
    };
  }
  const others = snapshot.seats.filter(
    (other) => other.character_id && !other.eliminated && other.id !== seat.id,
  );
  if (others.length === 0) {
    return {
      writes: mergeAll(released, handed),
      result: { removed: false, passedTo: null, gameFinished: false },
    };
  }
  const next = others.find((other) => other.seat_index > seat.seat_index) ?? others[0];
  return {
    writes: mergeAll(released, handed, {
      game: { active_seat: next.seat_index, turn_state: { phase: "roll" } },
    }),
    result: { removed: false, passedTo: next.seat_index, gameFinished: false },
  };
}

/**
 * Picks up a seat nobody is behind.
 *
 * The counterpart to leaving: a fresh token is issued for that seat and handed
 * to the device asking, which then plays that character exactly as its previous
 * player did. This is also how somebody rejoins after closing the tab, which is
 * the commonest way a seat is abandoned in the first place.
 */
export function claimSeat(
  snapshot: Snapshot,
  command: { seatId: string; playerName: string | null; token: string },
  ports: CommandPorts,
): Outcome<void> {
  const seat = seatOf(snapshot, command.seatId);

  // Either nobody is behind it, or nobody has been for long enough that the
  // difference stopped mattering. A player who closed their tab never said they
  // were leaving, so the seat is only quiet — and refusing it would strand the
  // character for the rest of the evening. The people in the room settle who
  // picks it up; the server only refuses a seat somebody is actively using.
  if (seat.no_device) {
    throw new Error("Tym miejscem kieruje gospodarz przy wspólnym ekranie.");
  }
  if (!seat.abandoned_at && !isQuiet(seat, ports.now())) {
    throw new Error("To miejsce ma już swojego gracza.");
  }

  return {
    writes: {
      seats: [
        {
          id: seat.id,
          patch: {
            abandoned_at: null,
            claim_token: command.token,
            // Left alone when nobody supplied one, because the commonest
            // takeover by far is the same person on a new tab, and renaming
            // them to nothing — or making them retype it — would be the app
            // being obtuse.
            ...(command.playerName ? { player_name: command.playerName } : {}),
          },
        },
      ],
    },
    result: undefined,
  };
}

/**
 * Takes a seat out of the table.
 *
 * Only by someone already seated, and removing somebody else is the host's job.
 * Removing yourself is not — that is just leaving, and nobody should need
 * permission for it. A lobby where the host cannot drop out is worse than one
 * where anybody can tidy up.
 *
 * Mid-game the character goes with the player and the seat is free for somebody
 * new, but what it was carrying does not vanish with it: the Przedmioty,
 * Przyjaciele and gold are left face up on its Obszar, where 12.1 lets the next
 * character to stop there pick them up. Deleting the row without that would
 * take them out of the game silently, and the board would be quietly poorer for
 * it. Zaklęcia are the exception, because 9.3 says nobody saw them.
 */
export function removeSeat(
  snapshot: Snapshot,
  command: { seatId: string; byId: string },
): Outcome<void> {
  const by = seatOf(snapshot, command.byId);
  if (!by.is_host && by.id !== command.seatId) {
    throw new Error("Tylko gospodarz może usuwać graczy.");
  }
  const seat = seatOf(snapshot, command.seatId);

  const field = seat.field_id;
  const spilled: Changeset =
    snapshot.game.status === "playing" && field
      ? {
          fieldCards: {
            insert: [
              ...snapshot.holdings
                .filter((held) => held.seat_id === seat.id && held.kind !== "spell")
                .map((held) => ({ field_id: field, card_id: held.card_id })),
              ...Array.from({ length: seat.gold }, () => ({
                field_id: field,
                card_id: "1-sztuka-zlota",
              })),
            ],
          },
        }
      : {};

  return {
    writes: mergeAll(
      spilled,
      { seatsRemoved: [seat.id] },
      promoteHost(snapshot.seats, seat),
    ),
    result: undefined,
  };
}

/**
 * Hands the host role to a seat.
 *
 * Two ways in, and only two. The host may give it away deliberately, and any
 * player may take it when the host's own seat has been abandoned — without that
 * second door, a table whose host closed their laptop can never be configured
 * or started again, which is the whole reason host migration exists. It also
 * recovers a table whose host seat became unreachable, which is easy to do by
 * joining twice from one browser and overwriting the stored token.
 *
 * Taking it from a host who is present is not a door. There is no co-host.
 */
export function takeHostRole(
  snapshot: Snapshot,
  command: { seatId: string; byId: string },
): Outcome<void> {
  const by = seatOf(snapshot, command.byId);
  const host = snapshot.seats.find((seat) => seat.is_host);
  if (host && host.id !== by.id && !host.abandoned_at) {
    throw new Error("Rolę gospodarza może przekazać tylko obecny gospodarz.");
  }
  const target = seatOf(snapshot, command.seatId);
  if (target.abandoned_at) throw new Error("To miejsce nie ma gracza.");

  return {
    writes: {
      seats: [
        ...snapshot.seats
          .filter((seat) => seat.is_host && seat.id !== target.id)
          .map((seat) => ({ id: seat.id, patch: { is_host: false } })),
        ...(target.is_host ? [] : [{ id: target.id, patch: { is_host: true } }]),
      ],
    },
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * The sweep.
 * ----------------------------------------------------------------------- */

/**
 * The four columns presence is decided from, and nothing else.
 *
 * A whole `SeatRow` is more than these questions need, and asking for one would
 * mean the list of tables could not answer them off the cut-down seat rows it
 * already fetches for every game at once. See `listGames`.
 */
export type Presence = Pick<SeatRow, "no_device" | "left_at" | "seen_at" | "is_host">;

/**
 * Which seats the poczekalnia has stopped hearing from.
 *
 * Two ways to be gone: the page said so and did not come back inside the grace,
 * or nothing has been heard for long enough that it does not matter what it
 * would have said.
 *
 * A seat the host filled in by hand has no device and never checks in; it is
 * driven from the shared screen, and sweeping it would delete players sitting
 * at the table.
 */
export function goneFrom<T extends Presence>(seats: readonly T[], now: number): T[] {
  return seats
    .filter((seat) => !seat.no_device)
    .filter(
      (seat) =>
        (seat.left_at !== null && now - Date.parse(seat.left_at) > GOODBYE_GRACE_MS) ||
        isQuiet(seat, now, LOBBY_GONE_AFTER_MS),
    );
}

/**
 * Whether a sweep would do anything, asked without loading the whole table.
 *
 * The sweep runs on every poll from every device and finds nothing to do almost
 * every time, so the common path must stay one query. This answers off the seat
 * list the caller already has; only when it says yes does anybody pay for a
 * snapshot. See `sweepLobby` in `store.ts`.
 */
export function needsSweep(seats: readonly Presence[], now: number): boolean {
  if (goneFrom(seats, now).length > 0) return true;
  const host = seats.find((seat) => !seat.no_device && seat.is_host);
  return host ? isQuiet(host, now, HOST_MISSING_AFTER_MS) : false;
}

/**
 * Clears out a poczekalnia that people have closed their tabs on.
 *
 * Before the game starts a seat is an intention, not a character: nothing has
 * happened to it, nobody has acted on anything it owns, and a table showing
 * four names when one person is present is worse than a table showing one. So a
 * seat nobody has been heard from is deleted outright rather than marked —
 * which is what leaving does too, and closing the tab is the same act without
 * the click.
 *
 * The host role moves on its own timer and before anybody is removed, so a host
 * who is merely quiet keeps their seat and loses the role. And when the last
 * seat goes the table goes with it, because an empty poczekalnia is not a game
 * anybody can join — it is a code taking up space in the list. Deleting the
 * game is the caller's: a changeset can write every table this app has except
 * the one it is a change *to*.
 */
export function sweepLobby(
  snapshot: Snapshot,
  _command: void,
  ports: CommandPorts,
): Outcome<{ gameGone: boolean }> {
  if (snapshot.game.status !== "lobby") {
    return { writes: {}, result: { gameGone: false } };
  }

  const now = ports.now();
  const gone = goneFrom(snapshot.seats, now);
  const goneIds = new Set(gone.map((seat) => seat.id));
  const staying = snapshot.seats.filter((seat) => !goneIds.has(seat.id));

  /**
   * Two ways the role has to move, and one place that decides where to.
   *
   * The host's tab closed, or the host has been quiet for longer than a table
   * can be left unadministered. The successor is picked from the seats that are
   * *staying*, which is the one thing the old version got wrong: it chose from
   * everybody, so a seat about to be swept could be handed the role and then
   * deleted a line later. It recovered — the second promotion pass caught it,
   * because by then the newly-made host was one of the gone — but only by
   * accident of ordering, and it left the table briefly hosted by somebody who
   * had closed the tab.
   */
  const host = snapshot.seats.find((seat) => !seat.no_device && seat.is_host);
  const handover =
    host && (goneIds.has(host.id) || isQuiet(host, now, HOST_MISSING_AFTER_MS))
      ? promoteHost(staying, host)
      : {};

  if (gone.length === 0) return { writes: handover, result: { gameGone: false } };

  /**
   * Nobody left who could do anything.
   *
   * Seats the host filled in by hand have no device of their own, so a table
   * holding only those is a table with nobody able to choose a character or
   * start it — an empty room with figures set out, not a game waiting for
   * anybody. No point handing the role on in that case; the table is going.
   */
  const gameGone = staying.every((seat) => seat.no_device);

  return {
    writes: mergeAll({ seatsRemoved: [...goneIds] }, gameGone ? {} : handover),
    result: { gameGone },
  };
}
