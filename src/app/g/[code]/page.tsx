"use client";

import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { forgetSeatToken, readSeatToken, writeSeatToken } from "@/lib/game/seatToken";
import { readTestMode, watchTestMode, writeTestMode, TESTING_POSSIBLE } from "@/lib/game/testMode";
import { watchRevision } from "@/lib/game/liveRevision";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import {
  RANDOM_CHARACTER_ID,
  abilitiesOfCharacter,
  asCharacterId,
  isRandomPick,
  type SeatCharacter,
} from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";
import { SeatActions } from "./seat-actions";
import { SpellHand } from "./spell-hand";
import { CardDetail, type TileCard } from "./card-tile";
import { SeatCard } from "./seat-card";
import {
  CARD_NAMES,
  CARD_TEXTS,
  CHARACTERS,
  KIND_LABEL,
  asHoldings,
  asNature,
  type Seat,
} from "./table";
import { CardLibrary } from "./card-library";
import { TestConsole } from "./console";
import { fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { carriedCount, carryLimit } from "@/lib/engine/derive";
import { JoinGate, LeaveButton, Lobby, TakeOverGate, type LobbySeat } from "./lobby";
import { TableLayout, type PublicSeat } from "./table-layout";
import { TurnQueue } from "./turn-queue";
import { NowBox } from "./now-box";
import { factsIn, turnSteps, windowsFor } from "@/lib/engine/turnWindows";
import { dutiesBeforeEnding, mayEndTurn, whyCannotEnd } from "@/lib/engine/duties";
import { Journal } from "./journal";
import { momentsIn, spellScript } from "@/lib/engine/spells";
import { BoardMap } from "./board-map";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import type { EventCard, Spell } from "@/data/types";
import { FieldModal } from "./field-modal";
import { DrawModal, ringFields } from "./draw-modal";
import { RebornModal } from "./reborn-modal";
import { AnnouncementModal } from "./announcement";
import { announce, watch, type Announcement, type Watched } from "@/lib/engine/announcements";
import { ConfirmDialog, type Confirmation } from "./confirm";
import { askAbout, usageOf } from "@/lib/engine/uses";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { describeResult } from "@/lib/engine/noticeText";
import { MAX_SEATS } from "@/lib/game/modes";
import { PlayersDrawer } from "./players";
import { PilesDrawer } from "./piles";


/**
 * How many of each the box prints — 165 and 30, said on the manual's first page
 * and counted again by the slicer, which cut exactly that many out of the scans.
 *
 * Read off the data rather than typed in, so the day a card turns out to be
 * missing from a scan this number moves with it instead of quietly disagreeing.
 */
const PRINTED_EVENTS = (events as EventCard[]).length;

/**
 * The card a slice ref came off, for a used pile showing the copy it spent.
 *
 * By ref and not by id: the box prints four Magiczne Miecze and two Upiory, and
 * a pile that showed "some Upiór" would be showing a card rather than the card.
 */
const BY_REF = new Map<string, TileCard>(
  [
    ...(events as EventCard[]).map((card) => [card, "Karta Zdarzeń"] as const),
    ...(spells as Spell[]).map((card) => [card, "Zaklęcie"] as const),
  ].map(([card, kindLabel]) => [
    `${card.source.sheet}#${card.source.index}`,
    { cardId: card.id, name: card.name, text: card.text, ref: `${card.source.sheet}#${card.source.index}`, kindLabel },
  ]),
);
const cardOfRef = (ref: string) => BY_REF.get(ref) ?? null;
const PRINTED_SPELLS = (spells as Spell[]).length;

const FIELD_NAMES = new Map(
  [...FIELDS.values()].map((field) => [field.id, field.name]),
);

interface FieldCard {
  /** The row, because a field can hold two of the same Przedmiot. */
  id: string;
  fieldId: FieldId;
  cardId: CardId;
}

interface Game {
  id: string;
  /** Which equipment variant this table plays (`EqMode`). */
  eq_mode: string;
  join_code: string;
  mode: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
  die_source: string;
  turn_state: TurnPhase;
  /**
   * What is left in each pile, and what has come back to it.
   *
   * Counts only — the orders themselves never leave the server, because the
   * next Karta Zdarzeń is the one thing at this table nobody is allowed to
   * know. Absent in companion mode, where both piles are physical.
   */
  deckCounts?: {
    events: { draw: number; discard: number };
    spells: { draw: number; discard: number };
  } | null;
  /**
   * The card on top of each stos zużytych, by slice ref.
   *
   * Only the top one, and only ever this pile: what is next off the stos Kart
   * Zdarzeń is the one thing at this table nobody may know, so the draw order
   * never leaves the server. See the note in the route.
   */
  used?: { events: string | null; spells: string | null } | null;
}

/** The shared table screen: the whole game state everyone is allowed to see. */
export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  /** Cards lying face up on the board (16.8) — public to every seat. */
  const [fieldCards, setFieldCards] = useState<FieldCard[]>([]);
  /** What the Wyposażenie pile still holds (21.2), so a shop offers only what it has. */
  const [stock, setStock] = useState<Record<string, number>>({});
  /** A field the player tapped on the map, to read what it says. */
  const [inspecting, setInspecting] = useState<FieldId | null>(null);
  /** What the app just decided by itself, shown until the next action. */
  const [notice, setNotice] = useState<string | null>(null);
  /** A card somebody tapped, shown large with its full text. */
  const [inspectingCard, setInspectingCard] = useState<TileCard | null>(null);
  /** The reference drawer of every card in the box. */
  /**
   * Which drawer is out on each side, at most one apiece.
   *
   * A side rather than a flag per drawer, because that is the rule: the two
   * sit on opposite edges so both can be out at once, and a side has room for
   * exactly one. Naming the side rather than the drawer means the third one to
   * be written swaps with whatever is already there instead of being drawn on
   * top of it, and nobody has to remember to close the other first.
   */
  const [leftDrawer, setLeftDrawer] = useState<"ksiega" | "stosy" | null>(null);
  /** The stacks, drawn as stacks (`piles.tsx`). */
  /**
   * Testing rather than playing — see `testMode.ts`.
   *
   * Subscribed to rather than copied into state, so the server renders "off"
   * and the browser renders what the switch actually says, without a second
   * pass to correct the first.
   */
  const testMode = useSyncExternalStore(watchTestMode, readTestMode, () => false);
  /**
   * The console, opened with a backtick or from the switch that gates it.
   *
   * The key is the one every game with a console uses, and it is unshifted, so
   * it never lands in a Polish word being typed anywhere else.
   */
  const [consoleOpen, setConsoleOpen] = useState(false);

  /**
   * Two keys, on the same physical one.
   *
   * Backtick opens and closes the console — the key every game with a console
   * uses — and shifted, as a tilde, it turns testing itself on and off. They
   * belong together: the console is the whole of what testing offers now, and
   * the switch that gates it was otherwise reachable only by finding a small
   * word in the top bar.
   *
   * Unshifted backtick cannot land in a Polish word, and neither can a tilde —
   * except in a field somebody is typing into, which is why that is checked:
   * the console's own input is a field, and so is the card search.
   */
  useEffect(() => {
    if (!TESTING_POSSIBLE) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
      if (typing) return;
      if (event.key === "~") {
        event.preventDefault();
        // Turning it off takes the console with it: what is behind the switch
        // cannot outlive the switch.
        writeTestMode(!readTestMode());
        if (readTestMode() === false) setConsoleOpen(false);
        return;
      }
      if (event.key === "`") {
        event.preventDefault();
        setConsoleOpen((was) => !was);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const setTestMode = writeTestMode;
  const testing = TESTING_POSSIBLE && testMode;
  /** A seatless visitor who chose to watch rather than take a character over. */
  const [watching, setWatching] = useState(false);
  /** The character asked for and not yet heard back about (see `chooseCharacter`). */
  const [pendingCharacter, setPendingCharacter] = useState<string | null>(null);
  /**
   * Cards the player has waved past for now.
   *
   * 16.8 lets a card simply stay where it fell, and 12.1 gives until the end of
   * the turn to come back to it — so "not now" has to be a real answer, and it
   * is this device's business rather than the table's. Cleared when the turn
   * moves on, since the next character meets the same cards fresh.
   */
  const [waved, setWaved] = useState<string[]>([]);
  /** Whether the "choose again" modal is open (4.4). */
  const [reborn, setReborn] = useState(false);
  /** The roster, open over the right-hand column. */
  const [rightDrawer, setRightDrawer] = useState<"gracze" | null>(null);
  /**
   * Something that happened to this character and has to be said out loud.
   *
   * Half of these arrive on somebody else's turn — Burza Siedmiu Słońc costs
   * every character in the Krąg a turn, drawn by one player — so they cannot
   * wait for the next thing this device does. See `announcements.ts` for what
   * is worth interrupting somebody for and what is not.
   */
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  /**
   * The last reading of this seat, to compare the next one against.
   *
   * A ref and not state: nothing renders from it, and re-rendering on every
   * poll to store a value nobody looks at would be a re-render per two
   * seconds, per device, for the whole game.
   */
  const watched = useRef<Watched | null>(null);
  /**
   * The irreversible thing waiting to be confirmed.
   *
   * Spending a card and speaking a Zaklęcie are the two acts here that cannot
   * be taken back by the person they happen to — the Karta is gone, and 9.6 has
   * the spell reaching its victim anywhere on the board. The poczekalnia
   * already asks before its three, and this is the same dialog.
   */
  const [ask, setAsk] = useState<Confirmation | null>(null);
  /**
   * Whether a watcher has folded somebody else's turn away.
   *
   * Kept until their own turn comes round, and cleared then: staying folded
   * across your own turn would hide the thing you are being asked to do, and
   * unfolding it on every card would make the control useless — you fold it
   * once because you want to look at the board, and it stays out of the way
   * until it is yours again.
   */
  const [folded, setFolded] = useState(false);
  /** Moves this device has made and the server has not confirmed (see `equip`). */
  const [moved, setMoved] = useState<Record<string, Slot | null>>({});
  /**
   * Characters taken client-first, by seat id.
   *
   * Only ever the surprise — see `chooseCharacter`. Cleared the moment the
   * server reports the same thing, so a pick that never landed reverts on the
   * next poll rather than lingering as a lie.
   */
  const [taking, setTaking] = useState<Record<string, SeatCharacter>>({});
  /** Which seat is choosing a character; "auto" lets the app decide. */
  const [picking, setPicking] = useState<string | "auto" | null>("auto");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);
  /** The newest revision this device has rendered — see `refresh`. */
  const seenRevision = useRef(-1);
  /** When each optimistic move was made, so a lost one cannot pin a card forever. */
  const movedAt = useRef<Record<string, number>>({});
  const router = useRouter();

  const refresh = useCallback(async () => {
    const stored = readSeatToken(code);
    const query = stored ? `?token=${encodeURIComponent(stored)}` : "";
    const response = await fetch(`/api/games/${code}${query}`);
    if (!response.ok) return setError((await response.json()).error ?? "Błąd");
    const data = await response.json();

    // Never go backwards. The poll and a move's own refetch are in flight at
    // the same time, and a poll that started *before* the write can land after
    // it — putting the old state back and snapping the card the player just
    // moved into its old place, until the next tick moved it again. The
    // revision counter already numbers every change the table makes, so an
    // answer older than what is on screen is simply dropped.
    if (data.game.revision < seenRevision.current) return;
    seenRevision.current = data.game.revision;

    setGame(data.game);
    setSeats(data.seats);
    setTaking((current) => {
      const still = Object.fromEntries(
        Object.entries(current).filter(([seatId, characterId]) => {
          const seat = data.seats.find((row: Seat) => row.id === seatId);
          // Gone once the server says the same thing — and gone anyway once the
          // game is running, where a seat holds whatever it was dealt.
          return seat ? seat.character_id !== characterId : false;
        }),
      );
      return Object.keys(still).length === Object.keys(current).length ? current : still;
    });
    // An optimistic move stands until the server reports the same place. Timing
    // it to the request instead meant the card fell back the moment a stale
    // answer arrived, which is the same race in a different coat.
    setMoved((current) => {
      const still = Object.fromEntries(
        Object.entries(current).filter(([holdingId, slot]) => {
          const held = (data.seats as Seat[])
            .flatMap((seat) => seat.holdings)
            .find((candidate) => candidate.id === holdingId);
          if (!held) return false;
          // Waiting on agreement, but not forever: a request that never arrived
          // would otherwise hold the card in a place the table does not know
          // about for the rest of the game. Four seconds is two polls.
          if (Date.now() - (movedAt.current[holdingId] ?? 0) > 4000) return false;
          return (held.slot ?? null) !== slot;
        }),
      );
      return Object.keys(still).length === Object.keys(current).length ? current : still;
    });
    setFieldCards(data.fieldCards ?? []);
    setStock(data.stock ?? {});
    setMySeatIndex(data.mySeatIndex);

    // Done here rather than in an effect because this is where the new reading
    // arrives, and because the comparison has to happen exactly once per
    // answer: an effect keyed on the seat would fire again on any unrelated
    // re-render and announce a death twice.
    const mineNow = (data.seats as Seat[]).find(
      (seat) => seat.seat_index === data.mySeatIndex,
    );
    if (mineNow) {
      const reading = watch({
        turnsLost: mineNow.turns_lost,
        stoneUntilTurn: mineNow.stone_until_turn,
        eliminated: mineNow.eliminated,
      });
      const said = announce(watched.current, reading);
      watched.current = reading;
      if (said) setAnnouncement(said);
    }
  }, [code]);

  const turnKey = game ? `${game.turn}:${game.active_seat}` : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaved([]);
  }, [turnKey]);

  // Back in front of you the moment the turn is yours again.
  const myTurn = game !== null && mySeatIndex !== null && game.active_seat === mySeatIndex;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (myTurn) setFolded(false);
  }, [myTurn]);

  useEffect(() => {
    // Polling stands in for the Realtime revision ping. Two seconds is
    // imperceptible at a table where a turn takes a minute, and every refetch
    // still goes through the route handler, so the secrecy model is unchanged.
    //
    // The lint rule cannot see that `refresh` is async: its every setState runs
    // after `await fetch`, so nothing is set synchronously during the effect.
    // This is exactly the "subscribe to an external system" shape the rule's
    // own message endorses — the external system here being the table's state
    // on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Realtime says when something happened; the poll is what catches it if
    // Realtime is down, blocked, or the tab was asleep when the message went
    // out. Fifteen seconds rather than two, because it is now a backstop
    // instead of the mechanism — and because a hidden tab is throttled to about
    // a minute anyway, which the sweep thresholds already assume.
    //
    // The poll stays at two seconds until Realtime has actually delivered
    // something. It subscribes either way, but on this project the broadcasts
    // are accepted and never arrive (see `liveRevision.ts`), and slowing the
    // poll down on the strength of a subscription that might be inert would
    // make the table *less* responsive than it is today. So the first message
    // that really lands is what earns the slower poll.
    let live = false;
    let timer = setInterval(refresh, 2000);
    const stop = watchRevision(code, () => {
      if (!live) {
        live = true;
        clearInterval(timer);
        timer = setInterval(refresh, 15_000);
      }
      void refresh();
    });
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [code, refresh]);

  /**
   * Tells the table this page is going away, so the seat is freed in seconds
   * rather than in minutes.
   *
   * `pagehide` and not `beforeunload`: the latter is unreliable — mobile
   * browsers frequently never fire it — and having a handler for it disqualifies
   * the page from the back/forward cache. `pagehide` fires in both cases and is
   * bfcache-compatible; `event.persisted` says which happened, and a page going
   * into the cache has not gone anywhere.
   *
   * `sendBeacon` and not `fetch`: a request started from an unloading page is
   * dropped. The browser guarantees to queue a beacon and run it to completion
   * after the page is discarded, which is the whole point of it existing.
   *
   * A reload fires this too, and out here that is indistinguishable from a
   * closed tab — so the server treats it as a countdown, not a departure, and
   * the reload's first poll cancels it.
   */
  useEffect(() => {
    const bye = (event: PageTransitionEvent) => {
      if (event.persisted) return; // going into the bfcache, not going away
      const token = readSeatToken(code);
      if (!token) return;
      navigator.sendBeacon?.(
        `/api/games/${code}/bye`,
        new Blob([JSON.stringify({ token })], { type: "text/plain" }),
      );
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [code]);

  /** One line, run on the server, answered with what to print. */
  const runConsole = useCallback(
    async (line: string) => {
      const response = await fetch(`/api/games/${code}/debug`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "console", line, token: readSeatToken(code) }),
      });
      const body = await response.json().catch(() => ({}));
      await refresh();
      return response.ok ? String(body.said ?? "ok") : String(body.error ?? "?");
    },
    [code, refresh],
  );

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        // Read the token at call time rather than holding it in state: it
        // only exists in this tab's sessionStorage, which is unavailable while
        // this renders on the server, and mirroring it into state meant setting
        // state inside an effect for no gain.
        const response = await fetch(`/api/games/${code}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, token: readSeatToken(code) }),
        });
        if (!response.ok) {
          setError((await response.json()).error);
        } else {
          // Anything the app decided on the player's behalf has to be visible,
          // or the table is being asked to take the referee's word for it. The
          // Trzęsawiska roll is the first of these; the roll is journalled too,
          // but the journal is not what someone is looking at mid-turn.
          setNotice(describeResult(await response.json().catch(() => null)));
        }
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [code, refresh],
  );

  /**
   * Gives up this device's seat.
   *
   * Mid-game this does not remove anybody: the character stays on its Obszar
   * with everything it owns and is marked as having no player, so it can be
   * taken over later — by somebody else, or by this player on a new device.
   * Only in the lobby does leaving actually delete the seat.
   */
  async function leave() {
    const seated = mySeatIndex !== null;
    if (!seated) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/games/${code}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: readSeatToken(code) }),
      });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      // Forget the seat locally too, or this browser keeps showing the
      // controls for a seat it no longer holds.
      forgetSeatToken(code);
      // Leaving before the start means leaving, not standing in the doorway:
      // the seat is gone, and staying here would only show the join form again
      // as though the click had failed.
      if (!playing) return router.push("/");
      setMySeatIndex(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Claims a seat for THIS device, from the join gate. Only reachable when the
   * device holds none — joining twice from one browser used to overwrite its
   * identity.
   */
  async function join(name: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/games/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error);
      writeSeatToken(code, data.token);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Adds a player who is sitting at this table but has no device of their own.
   *
   * This is the ordinary case, not an edge case: one laptop in the middle and
   * everyone playing on it. The seat's token is deliberately discarded rather
   * than stored — this device already has an identity, and taking on a second
   * one is the bug that stranded a player earlier. The table screen acts for
   * them the same way it acts for anyone whose turn it is.
   */
  /**
   * Sits down at a seat nobody is behind — including your own, after you closed
   * the tab. The character, its points and everything it carries are exactly as
   * the last player left them.
   */
  async function claimSeat(seatId: string, name: string | null = null) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatId, name }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    writeSeatToken(code, data.token);
    refresh();
  }

  /**
   * Asks for a character, and waits.
   *
   * Two people can want Kapłanka at the same instant and only the server knows
   * who asked first, so nothing is taken here optimistically: the card appears
   * on the seat when the server says it is yours and not before.
   *
   * Losing that race is not an error. Somebody else was quicker, the roster
   * updates to show the character as taken, and the choice you already had
   * stands — there is nothing for the player to do about it and nothing to
   * apologise for, so it happens quietly.
   *
   * This deliberately does not go through `post`: that raises the table-wide
   * busy flag, which would grey out the whole strip when the point is to grey
   * out everything *except* the card being asked for.
   */
  async function chooseCharacter(seatId: string, characterId: string) {
    if (pendingCharacter) return; // one at a time; a double-click is not two choices
    // Choosing what is already chosen is not a choice. The strip disables the
    // card too, but the rule belongs here as well: `chooseCharacter` resets the
    // seat, ready flag included, so a no-op request is not harmless.
    if (seats.find((seat) => seat.id === seatId)?.character_id === characterId) return;

    // The surprise is the one pick that cannot be refused: any number of seats
    // may hold it, so there is no race to lose and nothing the server can say
    // that this does not already know. It lands on the seat immediately and the
    // request goes out behind it — the same client-first rule the item moves
    // follow, for the same reason. Everything else still waits, because two
    // people can want Kapłanka and only the server knows who asked first.
    if (isRandomPick(characterId)) {
      setTaking((current) => ({ ...current, [seatId]: RANDOM_CHARACTER_ID }));
      void fetch(`/api/games/${code}/character`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId, seatId, token: readSeatToken(code) }),
      })
        .then(refresh)
        .catch(() => {
          // A dropped request leaves the seat as it was; the next poll will
          // put the optimistic pick right.
        });
      return;
    }

    setPendingCharacter(characterId);
    try {
      await fetch(`/api/games/${code}/character`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId, seatId, token: readSeatToken(code) }),
      });
      // Taken or refused, the next question is the same one: what is true now?
      await refresh();
    } catch {
      // A dropped request leaves the table exactly as it was, which is the
      // same outcome as being refused.
    } finally {
      setPendingCharacter(null);
    }
  }

  /**
   * Moves a card between the pack and a place on the body — on screen first.
   *
   * Unlike choosing a character, this has nobody to race. Two players can want
   * the same Kapłanka and only the server knows who asked first; nobody else is
   * moving *your* Hełm from your pack to your head. So the card moves when you
   * move it, and the server is told afterwards.
   *
   * What the server can still refuse — a card that does not fit, a pack with no
   * room — the browser can work out for itself, so it is checked here first and
   * the move never happens rather than happening and being taken back. If the
   * server refuses anyway, the next refresh has the truth in it and the
   * optimistic move is dropped on top of it, which puts the card back.
   */
  /**
   * Asks before a card is spent, and spends it on a yes.
   *
   * Nine Przedmioty are one act rather than a possession — the Karta goes on
   * the used pile whatever comes of it — so this is the one place in the pack
   * where a misclick costs something that cannot be put back. `uses.ts` writes
   * the question, so the words are the same here as in the hover.
   */
  function askToUse(holdingId: string, cardId: string) {
    const spend = usageOf(cardId);
    if (!spend) return;
    const name = CARD_NAMES.get(cardId) ?? cardId;
    setAsk({
      title: `Użyj: ${name}`,
      body: askAbout(name, spend),
      confirmLabel: "Użyj",
      // Red, like everything that takes something away from somebody — here
      // from the person pressing it.
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", { action: "use", holdingId });
      },
    });
  }

  /**
   * Asks before a card is thrown away, because it is not thrown away.
   *
   * 5.5 does not destroy what a character puts down: the card stays face up on
   * the Obszar it was dropped on, and 16.8 and 21.3 let the next person through
   * pick it up. So this costs less than using a card and more than it looks —
   * one click under every card in the pack, and a Magiczny Miecz left in the
   * Karczma is a present for whoever walks in.
   *
   * The question says where it will be lying, because that is the part a player
   * is deciding and the button cannot say it.
   */
  function askToDrop(holdingId: string) {
    const seat = seats.find((candidate) => candidate.seat_index === mySeatIndex);
    const held = seat?.holdings.find((candidate) => candidate.id === holdingId);
    if (!held) return;
    const name = CARD_NAMES.get(held.cardId) ?? held.cardId;
    const here = seat?.field_id ? FIELD_NAMES.get(seat.field_id) : null;
    setAsk({
      title: `Wyrzuć: ${name}`,
      body: here
        ? `${name} zostanie na Obszarze ${here}, odkryta — kto się tu zatrzyma, może ją wziąć (5.5, 16.8).`
        : `${name} zostanie na Obszarze, odkryta — kto się tu zatrzyma, może ją wziąć (5.5, 16.8).`,
      confirmLabel: "Wyrzuć",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", { action: "drop", holdingId });
      },
    });
  }

  /**
   * The same question before a Zaklęcie is spoken.
   *
   * 9.6 puts the spell on its victim wherever they are standing and takes the
   * card out of the hand for good, and until now that was one click of a button
   * sitting under every card in the hand.
   */
  function askToCast(
    holdingId: string,
    cardId: string,
    target: { seatIndex?: number; fieldCardId?: string } = {},
  ) {
    const name = CARD_NAMES.get(cardId) ?? cardId;
    const lying = fieldCards.find((row) => row.id === target.fieldCardId);
    const at =
      target.seatIndex !== undefined
        ? ` na: ${seats.find((seat) => seat.seat_index === target.seatIndex)?.player_name ?? `Miejsce ${target.seatIndex + 1}`}`
        : lying
          ? ` na: ${CARD_NAMES.get(lying.cardId) ?? lying.cardId}`
          : "";
    // Two of them the app carries out, and both of those take cards away for
    // good — so the question says what will actually happen rather than the
    // usual "rozpatrzcie sami", which would be untrue here and is the only
    // sentence standing between a player and a hand they cannot get back.
    const applied = spellScript(cardId)?.applies;
    const what =
      applied === "gasi-zaklecia"
        ? "Ofiara traci wszystkie Zaklęcia — ich Karty idą na stos zużytych (9.6). Zrobi to aplikacja."
        : applied === "zdejmuje-karte"
          ? "Karta znika z planszy i trafia na stos zużytych. Zrobi to aplikacja."
          : "Skutek rozpatrzcie sami.";
    setAsk({
      title: `Rzuć Zaklęcie: ${name}`,
      body:
        `${name}${at}. Karta odchodzi z ręki na stos kart zużytych i cały stół dowiaduje się, ` +
        `co zostało wypowiedziane (12.5). ${what}`,
      confirmLabel: "Rzuć",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", {
          action: "cast",
          seatId: seats.find((seat) => seat.seat_index === mySeatIndex)?.id,
          holdingId,
          ...(target.seatIndex !== undefined ? { targetSeat: target.seatIndex } : {}),
          ...(target.fieldCardId !== undefined ? { fieldCardId: target.fieldCardId } : {}),
        });
      },
    });
  }

  async function equip(holdingId: string, slot: Slot | null) {
    const mineNow = seats.find((seat) => seat.seat_index === mySeatIndex);
    const held = mineNow?.holdings.find((h) => h.id === holdingId);
    if (!held || !mineNow) return;

    if (slot !== null && !fitsIn(held.cardId, slot)) {
      return setError(
        isWearable(held.cardId)
          ? `${CARD_NAMES.get(held.cardId) ?? held.cardId} nie pasuje w ten slot.`
          : `${CARD_NAMES.get(held.cardId) ?? held.cardId} to nie jest rzecz do noszenia.`,
      );
    }
    if (slot === null && held.slot != null) {
      const mineCards = asHoldings(mineNow.holdings);
      if (carriedCount(mineCards, "slots") >= carryLimit(mineCards, "slots")) {
        return setError("Plecak jest pełny — najpierw coś wyrzuć (5.4, 5.6).");
      }
    }

    setError(null);
    /**
     * Both halves of a swap at once.
     *
     * Putting a card on a place that is taken moves two cards, and only the one
     * being put on was moved here — so the card it replaced sat on the body
     * until the server answered and the next poll came round, a second or so
     * later. You saw your Excalibur go on and your Miecz stay where it was,
     * which is not a swap, it is a glitch that fixes itself.
     */
    const displaced =
      slot === null
        ? undefined
        : mineNow.holdings.find((h) => h.slot === slot && h.id !== holdingId);
    movedAt.current[holdingId] = Date.now();
    if (displaced) movedAt.current[displaced.id] = Date.now();
    setMoved((current) => ({
      ...current,
      [holdingId]: slot,
      ...(displaced ? { [displaced.id]: null } : {}),
    }));
    try {
      const response = await fetch(`/api/games/${code}/holdings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "equip",
          holdingId,
          slot,
          token: readSeatToken(code),
        }),
      });
      if (!response.ok) {
        // Refused, so put both of them back where they were — and say why.
        setError((await response.json().catch(() => ({}))).error ?? null);
        setMoved((current) => {
          const next = { ...current };
          delete next[holdingId];
          if (displaced) delete next[displaced.id];
          return next;
        });
      }
      await refresh();
    } catch {
      // A dropped request leaves the card where the player put it; the next
      // poll will move it back if the server never heard.
    }
  }

  async function addLocalPlayer(name: string) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `local` marks a seat the host is filling for somebody at the table with
      // no device — the only seat anybody may choose a character for but their
      // own.
      body: JSON.stringify({ name: name.trim() || null, local: true }),
    });
    if (!response.ok) return setError((await response.json()).error);
    refresh();
  }

  if (error && !game) {
    return <Centered>{<span className="text-vermilion">{error}</span>}</Centered>;
  }
  if (!game) return <Centered>Wczytuję stół…</Centered>;

  const mySeat = seats.find((seat) => seat.seat_index === mySeatIndex);
  // The shared screen in the middle of the table. Whoever's turn it is reaches
  // over and taps it, so it drives the active player rather than sitting idle
  // saying "waiting".
  const isTableScreen = mySeat?.is_host === true && game.mode === "companion";
  const tableScreenHolder = seats.find((seat) => seat.is_host)?.player_name ?? null;

  // Whose character is being chosen. Left to the app until somebody says
  // otherwise: this device's own seat first, then — only where the host is
  // choosing on behalf of people with no device — a companion seat still
  // without one. It used to fall through to *any* characterless seat, which is
  // why opening a table could leave you aiming at a stranger's slot.
  const pickingFor =
    picking === "auto"
      ? mySeat && !mySeat.character_id
        ? mySeat
        : mySeat?.is_host && game.mode === "companion"
          ? (seats.find((seat) => seat.no_device && !seat.character_id) ?? null)
          : null
      : (seats.find((seat) => seat.id === picking) ?? null);

  // Cards in play this turn. A fight keeps the stack it interrupted, so the
  // panel does not empty out mid-combat.
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const playing = game.status === "playing";

  /**
   * The windows the turn is open for, for the spell hand (9.6, 17.3).
   *
   * Read off the whole turn state rather than the phase alone: a fight before
   * the dice and a fight after the first one are the same phase and are not
   * the same moment, and neither is a field with a card just turned over.
   */
  // The same reading the server refuses a cast against (9.1), not a second one
  // that agrees with it most of the time.
  const now = game ? momentsIn(game.turn_state) : ["dowolna-chwila" as const];

  const mine = mySeat
    ? {
        ...mySeat,
        holdings: mySeat.holdings.map((held) =>
          held.id in moved ? { ...held, slot: moved[held.id] } : held,
        ),
      }
    : mySeat;
  const others = seats.filter((seat) => seat.id !== mine?.id && seat.character_id);

  /**
   * What this turn is offering, as a short list of windows.
   *
   * The reading of the rules is `windowsFor`'s — 16.4's order, and which of
   * these are not offers at all. What is left here is turning the turn state
   * into the plain facts it asks about.
   */
  const turnState = game.turn_state;
  const turnWindows = active ? windowsFor(factsIn(turnState, active.field_id)) : [];
  // Only the "pole" phase has a stack of drawn cards. Narrowed once here for
  // the controls further down that ask how much of the draw is left; what the
  // turn is *offering* is `factsIn`'s reading, not this one.
  const onField = turnState.phase === "field" ? turnState : null;

  const overlays = (
    <>
      {testing && (
        <TestConsole
          open={consoleOpen}
          table={code}
          busy={busy}
          players={seats
            .filter((seat) => seat.character_id)
            .map((seat) => seat.player_name ?? `Miejsce ${seat.seat_index + 1}`)}
          onClose={() => setConsoleOpen(false)}
          onRun={runConsole}
        />
      )}
      {/* Above everything: what it reports has already happened, and half of it
          happened while this player was not even looking at their own turn. */}
      <AnnouncementModal
        announcement={announcement}
        onDismiss={() => setAnnouncement(null)}
      >
        {announcement?.kind === "death" && (
          <button
            onClick={() => {
              setAnnouncement(null);
              setReborn(true);
            }}
            className="rounded border border-ochre bg-ochre/10 px-3 py-1 text-[13px] text-ochre transition hover:bg-ochre/20"
          >
            Wybierz nową Postać
          </button>
        )}
      </AnnouncementModal>

      {/* Above everything else it could be asked about, and dismissed by
          clicking away — the safest answer is the one you get by not deciding. */}
      <ConfirmDialog ask={ask} busy={busy} onCancel={() => setAsk(null)} />

      {inspectingCard && (
        <CardDetail card={inspectingCard} onClose={() => setInspectingCard(null)} />
      )}


      {/* Offered, never forced — 4.4 says *może*. Opened from the line on the
          dead character's card and closed back to it.

          A latecomer gets it unasked, because for them it is not an offer:
          they have just sat down and there is nothing else on the screen for
          them to do. Closing it still leaves the line above as the way back. */}
      {mySeat?.eliminated && (reborn || !mySeat.character_id) && (
        <RebornModal
          characters={CHARACTERS}
          taken={
            new Set(seats.map((seat) => seat.character_id).filter(Boolean) as string[])
          }
          arriving={!mySeat.character_id}
          busy={busy}
          onConfirm={(characterId) => {
            setReborn(false);
            post("character", { again: true, seatId: mySeat.id, characterId });
          }}
          onClose={() => setReborn(false)}
        />
      )}

      {/* The card you just turned over, at a size you can read, with exactly
          the things this card lets you do under it. */}
      {active &&
        (game.turn_state.phase === "fight" ||
          game.turn_state.phase === "move" ||
          game.turn_state.phase === "bridge" ||
          (game.turn_state.phase === "field" &&
            (game.turn_state.drawn.length > 0 ||
              // A field nobody may walk past opens it too, even with nothing
              // drawn: the Karczma happens to you the moment you arrive.
              compulsoryOffer(active.field_id, game.turn_state.resolved ?? []) !== null))) && (
          <DrawModal
            // Everybody at the table watches. A fight is the moment the game
            // is most worth looking at, and it used to happen entirely inside
            // one person's browser while the rest read about it afterwards in
            // the journal. Only the player whose turn it is can press anything.
            who={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
            canAct={mySeatIndex === active.seat_index || isTableScreen}
            minimized={folded}
            onMinimize={() => setFolded(true)}
            onRestore={() => setFolded(false)}
            cards={game.turn_state.phase === "field" ? game.turn_state.drawn : []}
            resolved={
              game.turn_state.phase === "field"
                ? [...(game.turn_state.resolved ?? []), ...waved]
                : []
            }
            fought={game.turn_state.phase === "field" ? (game.turn_state.fought ?? []) : []}
            fight={game.turn_state.phase === "fight" ? game.turn_state.fight : null}
            // The direction choice, which used to be a panel of its own below
            // the queue. It is the same shape as everything else in here: one
            // thing you are asked to do, with the table watching.
            move={
              game.turn_state.phase === "move"
                ? { roll: game.turn_state.roll, options: game.turn_state.options }
                : null
            }
            bridge={game.turn_state.phase === "bridge" ? game.turn_state.bridge : null}
            fieldOffer={
              game.turn_state.phase === "field" ? compulsoryOffer(active.field_id, game.turn_state.resolved ?? []) : null
            }
            simulated={game.mode === "simulation"}
            /**
             * Your own hand, beside whatever is happening — which in a fight is
             * somebody else's turn as often as your own.
             *
             * 9.3 keeps these from every other device and the server never
             * sends them there; this is the one seat they belong to.
             */
            spells={
              mine
                ? mine.holdings
                    .filter((held) => held.kind === "spell" && isSpellId(held.cardId))
                    .map((held) => ({
                      holdingId: held.id,
                      cardId: held.cardId as SpellId,
                      granted: held.granted,
                    }))
                : []
            }
            moment={now}
            opponents={others.map((seat) => ({
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
            }))}
            floor={
              game.turn_state.phase === "fight"
                ? (game.turn_state.fight.caster ?? null)
                : null
            }
            mySeatIndex={mySeatIndex}
            seatName={(index) =>
              seats.find((seat) => seat.seat_index === index)?.player_name ??
              `Miejsce ${index + 1}`
            }
            onClaimFloor={() => post("turn", { action: "spell-claim" })}
            onReleaseFloor={() => post("turn", { action: "spell-release" })}
            /**
             * Spoken on the press, with no second question.
             *
             * Everywhere else a Zaklęcie is confirmed before it leaves the
             * hand, because 9.6 spends the card whatever comes of it. Here the
             * confirming already happened: asking for the floor is the
             * declaration, and it cost the half-minute. Asking again ran
             * the clock out inside the dialog — you claimed, read the question,
             * pressed yes, and were told to claim first.
             */
            onCastSpell={(holdingId, target) =>
              post("holdings", {
                action: "cast",
                seatId: mine?.id,
                holdingId,
                ...(target.seatIndex === undefined ? {} : { targetSeat: target.seatIndex }),
                ...(target.fieldCardId === undefined ? {} : { fieldCardId: target.fieldCardId }),
              })
            }
            onInspect={setInspectingCard}
            /* 17.6: in a duel the escape is the attacked character's, so the
               button goes to their device rather than the attacker's. The
               shared screen keeps it too, since in companion mode it is the
               device the whole table is pressing. */
            myEscape={
              game.turn_state.phase === "fight" &&
              game.turn_state.fight.opponentSeat !== undefined &&
              (isTableScreen || game.turn_state.fight.opponentSeat === mySeatIndex)
            }
            ring={ringFields(active.field_id)}
            busy={busy}
            error={error}
            onAction={(body) => post("turn", body)}
            onResolve={(cardId, decisions) =>
              post("turn", { action: "karta-efekt", cardId, ...decisions })
            }
            onResolveField={(choices) => {
              const offer = compulsoryOffer(
                active.field_id,
                game.turn_state.phase === "field" ? (game.turn_state.resolved ?? []) : [],
              );
              if (offer) post("turn", { action: "pole-tabela", offer: offer.name, choices });
            }}
            onFight={(cardIds) => post("turn", { action: "fight", cardIds })}
            onEscape={() => post("turn", { action: "escape" })}
            onTake={(cardId) =>
              post("holdings", { action: "take", seatId: active.id, cardId })
            }
            onLeave={(cardId) => setWaved((current) => [...current, cardId])}
          />
        )}

      {/* Tapping a field opens it, rather than filling in a panel off to the
          side where nobody looked. */}
      {inspecting && (
        <FieldModal
          eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
          nature={asNature(mySeat?.nature)}
          fieldId={inspecting}
          cards={fieldCards
            .filter((card) => card.fieldId === inspecting)
            .map((card) => ({ id: card.id, cardId: card.cardId }))}
          standingHere={mySeat?.field_id === inspecting}
          canAct={mySeat?.seat_index === game?.active_seat}
          busy={busy}
          onTake={(fieldCardId) =>
            post("holdings", { action: "take-field", fieldCardId })
          }
          onInspect={(cardId) =>
            setInspectingCard({
              cardId,
              name: CARD_NAMES.get(cardId) ?? cardId,
              text: CARD_TEXTS.get(cardId),
            })
          }
          // Everything the Obszar can be *done* about, which used to live in a
          // panel down the page. Only passed for the field the active character
          // is standing on: reading about somewhere else is the other half of
          // what this window is for, and none of these belong there.
          {...(active && inspecting === active.field_id
            ? {
                phase: turnState.phase,
                simulated: game.mode === "simulation",
                typedRolls: game.mode !== "simulation",
                onAction: (body: Record<string, unknown>) => post("turn", body),
                onSuggestion: (stat: string, delta: number, reason: string) =>
                  post("adjust", { seatId: active.id, stat, delta, reason }),
                onService: (body: Record<string, unknown>) =>
                  post("holdings", { ...body, seatId: active.id }),
                purse: { gold: active.gold, life: active.life },
                stock,
                sellable: active.holdings
                  .filter((holding) => holding.kind === "item")
                  .map((holding) => ({ id: holding.id, cardId: holding.cardId })),
              }
            : {})}
          notice={error ? null : notice}
          onClose={() => {
            setInspecting(null);
            setNotice(null);
          }}
        />
      )}
    </>
  );

  if (!playing) {
    // No name, no seat, no lobby. Everyone joins on their own device, so a
    // visitor standing in the lobby without a seat was never a state worth
    // having — it just deferred the one question the table needs answered.
    if (mySeatIndex === null) {
      return (
        <>
          {error && (
            <p className="fixed inset-x-0 top-0 z-30 bg-vermilion/20 px-4 py-2 text-center text-sm text-vermilion">
              {error}
            </p>
          )}
          <JoinGate
            code={game.join_code}
            seats={seats.map((seat) =>
            asLobbySeat(
              taking[seat.id] ? { ...seat, character_id: taking[seat.id], ready: false } : seat,
            ),
          )}
            busy={busy}
            onJoin={join}
          />
        </>
      );
    }

    return (
      <>
        {overlays}
        {error && (
          <p className="fixed inset-x-0 top-0 z-30 bg-vermilion/20 px-4 py-2 text-center text-sm text-vermilion">
            {error}
          </p>
        )}
        <Lobby
          code={game.join_code}
          mode={game.mode}
          seats={seats.map((seat) =>
            asLobbySeat(
              taking[seat.id] ? { ...seat, character_id: taking[seat.id], ready: false } : seat,
            ),
          )}
          mySeatIndex={mySeatIndex}
          characters={CHARACTERS}
          pickingFor={pickingFor ? asLobbySeat(pickingFor) : null}
          busy={busy}
          onAddLocal={addLocalPlayer}
          onPickFor={(seat) => setPicking(seat ? seat.id : null)}
          pendingCharacterId={pendingCharacter}
          onChooseCharacter={async (seat, characterId) => {
            await chooseCharacter(seat.id, characterId);
            setPicking("auto");
          }}
          onRemove={(seat) => post("leave", { seatId: seat.id })}
          onMakeHost={(seat) => post("host", { seatId: seat.id })}
          onReady={(ready) => post("seat", { ready })}
          onRename={(name) => post("seat", { name })}
          onLeave={leave}
          onDeal={() => post("character", { deal: true })}
          isHost={mySeat?.is_host === true}
          hostAway={seats.find((seat) => seat.is_host)?.abandoned_at !== null}
          onStart={() => post("start", {})}
          onLibrary={() => setLeftDrawer("ksiega")}
        />
      </>
    );
  }

  // Somebody who opened a game already in progress. They cannot join — the
  // characters were dealt at setup — but they can pick up one nobody is behind,
  // which is exactly what the app does with a player who leaves or closes their
  // tab. Offered up front rather than buried in a card somebody has to expand.
  if (mySeatIndex === null && !watching) {
    const free = seats
      .filter((seat) => seat.character_id && !seat.eliminated && !seat.no_device)
      .filter((seat) => seat.abandoned_at !== null || seat.away)
      .map((seat) => ({
        seatId: seat.id,
        playerName: seat.player_name,
        characterName:
          CHARACTERS.find((character) => character.id === seat.character_id)?.name ?? "?",
        why: seat.abandoned_at !== null ? "gracz odszedł od stołu" : "gracz się rozłączył",
      }));
    return (
      <>
        {error && (
          <p className="fixed inset-x-0 top-0 z-30 bg-vermilion/20 px-4 py-2 text-center text-sm text-vermilion">
            {error}
          </p>
        )}
        <TakeOverGate
          code={game.join_code}
          free={free}
          taken={seats.filter((seat) => seat.character_id && !seat.eliminated).length}
          // 2-6 players, and every seat that exists is somebody's — so room is
          // simply whether a seventh would fit.
          room={seats.length < MAX_SEATS}
          busy={busy}
          onTakeOver={claimSeat}
          onJoin={(name) => join(name ?? "")}
          onWatch={() => setWatching(true)}
        />
      </>
    );
  }

  /**
   * This seat, with any move this device has just made already applied.
   *
   * Laid over the server's answer rather than written into it, so the two-second
   * poll landing mid-flight cannot undo what the player just did.
   */

  return (
    <>
      {overlays}
      <TableLayout
        drawer={
          <>
          {leftDrawer === "ksiega" && (
            <CardLibrary
              eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
              nature={asNature(mySeat?.nature)}
              // "walcz" and the Obszary chips became `fight` and `go` in the
              // console; taking a card stayed, because this shelf is where somebody
              // already is when they want one, with the picture in front of them.
              {...(testing && mySeatIndex !== null
                ? { onGrant: (cardId: string) => post("debug", { action: "grant", cardId }) }
                : {})}
              onClose={() => setLeftDrawer(null)}
            />
          )}
            {leftDrawer === "stosy" && game.deckCounts && game.used ? (
              <PilesDrawer
                counts={game.deckCounts}
                used={game.used}
                printed={{ events: PRINTED_EVENTS, spells: PRINTED_SPELLS }}
                backs={{
                  events: "/cards/back-zdarzenie.jpg",
                  spells: "/cards/back-zaklecie.jpg",
                }}
                nameOf={cardOfRef}
                onInspect={setInspectingCard}
                onClose={() => setLeftDrawer(null)}
              />
            ) : null}
            {rightDrawer === "gracze" ? (
            <PlayersDrawer
              // Every seat, in seat order, this one included — see the note on the
              // component about why the roster it replaces left you out.
              seats={[...seats].sort((a, b) => a.seat_index - b.seat_index).map(asPublicSeat)}
              characters={CHARACTERS}
              activeSeatIndex={game.active_seat}
              mySeatId={mySeat?.id ?? null}
              amHost={mySeat?.is_host === true}
              room={seats.length < MAX_SEATS}
              busy={busy}
              onClose={() => setRightDrawer(null)}
              onInspect={setInspectingCard}
              onClaim={mySeatIndex === null ? claimSeat : undefined}
              onKick={
                mySeat?.is_host ? (seat) => post("leave", { seatId: seat.id }) : undefined
              }
              onPassHost={
                mySeat?.is_host ? (seat) => post("host", { seatId: seat.id }) : undefined
              }
              onJoin={
                mySeatIndex === null
                  ? () => {
                      setRightDrawer(null);
                      join("");
                    }
                  : undefined
              }
            />
            ) : null}
          </>
        }
        header={
          <>
            <div className="flex items-baseline gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-lg text-ochre">
                Magiczny Miecz
              </h1>
              {/* Both openers for this side, together: the Księga and the
                  piles are the two things you consult rather than play, and
                  they take turns over the board because only one drawer opens
                  down a side at a time. */}
              <button
                onClick={() => setLeftDrawer((out) => (out === "ksiega" ? null : "ksiega"))}
                title="Każda Karta i każdy Obszar w grze — zdradzi ci tajemnicę"
                className="text-[11px] text-ochre/80 transition hover:text-ochre"
              >
                Księga Tolimana
              </button>
              {/* Both piles, beside the turn they are being drawn into. At a
                  physical table the stacks sit on the table and everybody
                  watches them thin; in simulation they were invisible, so a
                  deck about to turn over (9.5) did it with no warning and no
                  trace. The number after the slash is the stos zużytych — what
                  a reshuffle will bring back. */}
              {game.deckCounts && (
                <button
                  onClick={() => setLeftDrawer((out) => (out === "stosy" ? null : "stosy"))}
                  title="Zobacz stosy"
                  className="flex items-baseline gap-3 text-[11px] text-muted/70 transition hover:text-ink"
                >
                  <span title="Karty Zdarzeń: w talii / na stosie zużytych">
                    Zdarzenia{" "}
                    <span className="tnum text-ink/70">
                      {game.deckCounts.events.draw}
                      <span className="text-muted/50">/{game.deckCounts.events.discard}</span>
                    </span>
                  </span>
                  <span title="Karty Zaklęć: w stosie / na stosie zużytych (9.5)">
                    Zaklęcia{" "}
                    <span className="tnum text-magia/80">
                      {game.deckCounts.spells.draw}
                      <span className="text-muted/50">/{game.deckCounts.spells.discard}</span>
                    </span>
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              {/* Whose turn it is, beside who is here and where "here" is. It
                  used to sit under the title on the far side of the bar, a
                  screen-width away from the roster that answers the next
                  question you have after reading it. */}
              <span className="text-muted">
                Tura <span className="tnum text-ink/70">{game.turn}</span> ·{" "}
                {active ? (active.player_name ?? "—") : "—"}
              </span>
              {/* Who is at the table, which is a question about the table and
                  not about the turn — so it lives up here with the rest of
                  them, and stays reachable while a fight is open. */}
              <button
                onClick={() => setRightDrawer((out) => (out === "gracze" ? null : "gracze"))}
                className="text-ochre/80 transition hover:text-ochre"
              >
                Gracze <span className="tnum text-muted">{seats.length}</span>
              </button>
              <span className="tnum tracking-[0.2em] text-muted">{game.join_code}</span>
              {/* Loud on purpose while it is on. Everything it unlocks writes a
                  manual override into the journal, and a switch you can forget
                  you flipped is how a tested game gets mistaken for a played
                  one. */}
              {TESTING_POSSIBLE && (
                <button
                  onClick={() => setTestMode(!testMode)}
                  aria-pressed={testMode}
                  title={
                    testMode
                      ? "Tryb testowy jest włączony — konsola pod ` (~ wyłącza)"
                      : "Włącz tryb testowy — konsola pod ` (~ włącza)"
                  }
                  className={
                    testMode
                      ? "rounded border border-vermilion/60 bg-vermilion/15 px-1.5 py-0.5 text-vermilion"
                      : "text-muted/60 transition hover:text-muted"
                  }
                >
                  tryb testowy{testMode ? " ✓" : ""}
                </button>
              )}
              {testing && (
                <button
                  onClick={() => setConsoleOpen((was) => !was)}
                  title="Konsola testowa (`)"
                  className="text-vermilion/80 transition hover:text-vermilion"
                >
                  konsola
                </button>
              )}
              {mySeatIndex !== null && (
                <LeaveButton
                  playing
                  busy={busy}
                  onLeave={leave}
                />
              )}
            </div>
          </>
        }
        map={
          // The board with the journal under it. `relative` is what lets the
          // journal expand over the board instead of pushing it out of the way.
          <div className="relative flex h-full w-full flex-col gap-2">
            <div className="flex min-h-0 flex-1 items-center justify-center">
          <BoardMap
            seats={seats.map((seat) => ({
              id: seat.id,
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
              fieldId: seat.field_id,
              eliminated: seat.eliminated,
            }))}
            activeSeatIndex={game.active_seat}
            cardsOnFields={fieldCards.reduce<
              Partial<Record<FieldId, { id: string; cardId: CardId }[]>>
            >((byField, card) => {
              (byField[card.fieldId] ??= []).push({ id: card.id, cardId: card.cardId });
              return byField;
            }, {})}
            highlight={
              game.turn_state.phase === "move"
                ? game.turn_state.options.map((option) => option.fieldId)
                : []
            }
            onPick={(fieldId) => setInspecting(fieldId)}
          />
            </div>
            <Journal
              code={code}
              revision={game.revision}
              eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
            />
          </div>
        }
        right={
          <div className="flex flex-col gap-3">
            {/* First thing in the column, above everything a player acts on.
                Two questions side by side: "now" on the left, in a box that
                never changes size, and "when" to the right of it — the queue
                gives up the width, since it already scrolls. */}
            <div className="flex items-stretch gap-3">
              {active && (
                <NowBox
                  playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
                  isMine={
                    (mySeatIndex !== null && active.seat_index === mySeatIndex) || isTableScreen
                  }
                  fieldName={
                    active.field_id ? (FIELD_NAMES.get(active.field_id) ?? active.field_id) : "—"
                  }
                  fieldId={active.field_id}
                  windows={turnWindows}
                  steps={turnSteps(turnState.phase)}
                  // 17.4 ends a fight when the dice are compared, not when
                  // somebody walks away from it; and 10.1-10.2 make the move
                  // the first of the two things a turn is made of.
                  canEnd={
                    game.turn_state.phase !== "fight" &&
                    mayEndTurn({
                      fieldId: active.field_id,
                      done: [],
                      phase: game.turn_state.phase,
                    })
                  }
                  whyNotEnd={whyCannotEnd(
                    dutiesBeforeEnding({
                      fieldId: active.field_id,
                      done: [],
                      phase: game.turn_state.phase,
                    }),
                  )}
                  canRoll={game.turn_state.phase === "roll"}
                  onRoll={() => post("turn", { action: "roll" })}
                  // 13.4: what is already lying here counts against the number
                  // the field asks for, which is why a silted-up Obszar draws
                  // nothing and the button is not there.
                  canDraw={onField !== null && onField.draw - onField.drawn.length > 0}
                  onDraw={() => post("turn", { action: "draw" })}
                  busy={busy}
                  onOpen={(id) => {
                    // The two the draw modal already owns open themselves; the
                    // rest are the Obszar, which is one window with the field's
                    // own actions in it.
                    if (id === "walka" || id === "karty") return setFolded(false);
                    setInspecting(active.field_id);
                  }}
                  onEnd={() => post("turn", { action: "end" })}
                />
              )}
              <TurnQueue
                seats={seats.map((seat) => ({
                  seatIndex: seat.seat_index,
                  playerName: seat.player_name,
                  characterId: seat.character_id,
                  turnsLost: seat.turns_lost,
                  stoneUntilTurn: seat.stone_until_turn,
                  eliminated: seat.eliminated,
                }))}
                activeSeat={game.active_seat}
                turn={game.turn}
                mySeatIndex={mySeatIndex}
              />
            </div>
            {error && <p className="text-sm text-vermilion">{error}</p>}
            {/* Only when there is no window open to say it in. What the app
                decided has to be visible — it threw the die — but it belongs
                where the thing was done, not in a bordered box behind it. */}
            {notice && !error && inspecting === null && (
              <p className="px-1 text-sm text-ochre">{notice}</p>
            )}

            {game.mode === "companion" && mySeatIndex !== null && (
              <p className="rounded border border-edge/60 bg-panel/50 px-2 py-1 text-[11px] text-muted">
                {isTableScreen ? (
                  <span className="text-ochre">To urządzenie prowadzi wszystkich graczy.</span>
                ) : (
                  <>
                    Prowadzi: <span className="text-ink">{tableScreenHolder ?? "—"}</span>.{" "}
                    <button onClick={() => post("host", {})} className="underline hover:text-ink">
                      graj tu za wszystkich
                    </button>
                  </>
                )}
              </p>
            )}
            {/* The turn panel is gone. Everything it drew has a home: the roll
                and the draw are buttons in the box, the direction and the Most
                are decisions and open the action window, the Obszar's own
                business is in its window, and a fight was always in the
                window. What was left was a bordered rectangle with nothing in
                it. */}


            {active && (mySeatIndex === active.seat_index || isTableScreen) && (
              <SeatActions
                busy={busy}
                nature={active.nature}
                canFightBeast={active.field_id === "zamek-bestii"}
                // Companion mode is the app being told what a physical table
                // did, so it has to ask. Simulation rolls and applies these
                // itself, and a button for them would be editing the record
                // rather than playing (see CLAUDE.md).
                byHand={game.mode === "companion"}
                mayChooseNature={abilitiesOfCharacter(
                  asCharacterId(active.character_id),
                ).some((ability) => ability.kind === "natura-dowolna")}
                onSpell={() => post("holdings", { action: "spell", seatId: active.id })}
                onNature={(nature) =>
                  post("holdings", { action: "nature", seatId: active.id, nature })
                }
                onStone={() => post("holdings", { action: "stone", seatId: active.id })}
                onHeal={() => post("holdings", { action: "heal", seatId: active.id })}
                onBeast={() => post("turn", { action: "beast" })}
              />
            )}

            {/* Your own seat, in full. 9.3 hides a hand from the others, not
                from its owner, so this is the one place spells are face up. */}
            {mine && (
              <SeatCard
                seat={mine}
                active={mine.seat_index === game.active_seat}
                canAdjust
                // Companion play is corrected by hand because the board is the
                // source of truth there and the app will desync. Simulation is
                // settled the other way — nothing is entered by hand — and a
                // tester who needs a number moved says `gold +5` rather than
                // finding a ± under every parameter for the rest of time.
                canCorrect={game.mode !== "simulation"}
                isMine
                slotted={game.eq_mode === "slots"}
                onAdjust={(stat, delta) => post("adjust", { seatId: mine.id, stat, delta })}
                onDrop={askToDrop}
                onEquip={equip}
                onTrade={() => post("holdings", { action: "trade", seatId: mine.id })}
                onUse={askToUse}
                onWand={() => post("holdings", { action: "wand-spell", seatId: mine.id })}
                onReorder={(holdingIds) =>
                  post("holdings", { action: "order", seatId: mine.id, holdingIds })
                }
                onInspect={setInspectingCard}
                /* Under the pack, in the same card and the same idiom: the
                   pack says what 5.4 allows and this says what 2.6 does, and
                   they are the two limits on what one player is holding. */
                spells={
                  <SpellHand
                    frame="section"
                    capacity={mine.spell_capacity}
                    spells={mine.holdings
                      // Both halves matter: the server says which holdings are
                      // Zaklęcia, and `isSpellId` is what turns that claim into
                      // a card the spell hand can actually look up.
                      .filter((held) => held.kind === "spell" && isSpellId(held.cardId))
                      .map((held) => ({
                      holdingId: held.id,
                      cardId: held.cardId as SpellId,
                      granted: held.granted,
                    }))}
                    moment={now}
                    opponents={others.map((seat) => ({
                      seatIndex: seat.seat_index,
                      name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
                    }))}
                    busy={busy}
                    onInspect={setInspectingCard}
                    boardCards={fieldCards.map((row) => ({
                      id: row.id,
                      name: CARD_NAMES.get(row.cardId) ?? row.cardId,
                      where: FIELD_NAMES.get(row.fieldId) ?? row.fieldId,
                    }))}
                    onCast={(holdingId, target) => {
                      const held = mine.holdings.find((card) => card.id === holdingId);
                      if (held) askToCast(holdingId, held.cardId, target);
                    }}
                  />
                }
              />
            )}

            {/* 4.4: death ends a character, not a player's evening — but the
                rule says *może*, so choosing again is offered rather than
                demanded. Dismissing the modal leaves this line, which is the
                way back into it whenever they want. */}
            {mine?.eliminated && (
              <section className="mt-3 rounded-lg border border-vermilion/50 bg-vermilion/5 p-3">
                <h3 className="mb-1 font-[family-name:var(--font-display)] text-sm text-vermilion">
                  {mine.character_id ? "Twoja Postać zginęła" : "Dosiadasz się do stołu"}
                </h3>
                {/* The same box for the two ways of sitting here without a
                    Postać in play — see `takeNewCharacter`. A latecomer is out
                    of the round until they pick one, which is the same state a
                    death leaves behind and the same way out of it. */}
                <p className="mb-2 text-[11px] leading-relaxed text-muted">
                  {mine.character_id
                    ? "Jesteś poza kolejnością tur i oglądasz grę. Możesz wrócić nową Postacią, kiedy zechcesz (4.4)."
                    : "Wybierz Postać, a wejdziesz do gry od jej Miejsca Gracza. Do tego czasu tury cię omijają."}
                </p>
                <button
                  disabled={busy}
                  onClick={() => setReborn(true)}
                  className="rounded border border-ochre/60 px-3 py-1 text-xs text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
                >
                  {mine.character_id ? "Wybierz nową Postać" : "Wybierz Postać"}
                </button>
              </section>
            )}

            {/* The roster moved into the drawer: every seat rather than everybody
                else, reachable from the bar rather than by scrolling past your
                own pack, and open while a fight is — see `players.tsx`. What
                stays here is the one line that says it is there. */}
            <button
              onClick={() => setRightDrawer("gracze")}
              className="mt-3 w-full rounded border border-edge/60 px-2 py-1.5 text-left text-[11px] text-muted transition hover:border-ochre hover:text-ink"
            >
              Gracze przy stole:{" "}
              <span className="text-ink">
                {others.map((seat) => seat.player_name ?? `Miejsce ${seat.seat_index + 1}`).join(", ") || "nikt jeszcze"}
              </span>
            </button>
          </div>
        }
      />
    </>
  );
}

function asLobbySeat(seat: Seat): LobbySeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: seat.player_name,
    characterId: seat.character_id,
    isHost: seat.is_host,
    abandoned: seat.abandoned_at !== null,
    away: seat.away,
    ready: seat.ready,
    noDevice: seat.no_device,
  };
}

/**
 * A seat as the rest of the table is allowed to see it.
 *
 * Everything the rulebook lays out face up (5.2, 6.2, and the tokens beside a
 * character card) is copied across in full. Concealed spells never reach the
 * browser at all — the server already replaced them with a count (9.3) — so
 * there is nothing here that could leak by being careless.
 */
function asPublicSeat(seat: Seat): PublicSeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: seat.player_name,
    characterId: seat.character_id,
    fieldName: seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—",
    fieldId: seat.field_id,
    miecz: seat.sword_total,
    swordOwn: seat.sword_own,
    magia: seat.magic_total,
    magicOwn: seat.magic_own,
    life: seat.life,
    gold: seat.gold,
    nature: seat.nature,
    eliminated: seat.eliminated,
    abandoned: seat.abandoned_at !== null,
    away: seat.away,
    isHost: seat.is_host,
    turnsLost: seat.turns_lost,
    cards: seat.holdings
      .filter((held) => held.kind !== "spell")
      .map((held) => ({
        cardId: held.cardId,
        name: CARD_NAMES.get(held.cardId) ?? held.cardId,
        text: CARD_TEXTS.get(held.cardId),
        kindLabel: KIND_LABEL[held.kind],
      })),
    hiddenSpells:
      seat.hidden_count + seat.holdings.filter((held) => held.kind === "spell").length,
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-muted">
      {children}
    </main>
  );
}
