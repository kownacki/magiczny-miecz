"use client";

import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { forgetSeatToken, readSeatToken, writeSeatToken } from "@/lib/game/seatToken";
import { readTestMode, watchTestMode, writeTestMode, TESTING_POSSIBLE } from "@/lib/game/testMode";
import { watchRevision } from "@/lib/game/liveRevision";
import characters from "@/data/characters.json";
import type { Character, Nature } from "@/data/types";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import { describeAbility } from "@/lib/engine/abilityText";
import {
  RANDOM_CHARACTER_ID,
  abilitiesOfCharacter,
  asCharacterId,
  isRandomPick,
  notesForCharacter,
  startingKit,
  type SeatCharacter,
} from "@/lib/engine/characters";
import { cardArtUrl, characterImageUrl } from "@/lib/view/cardImages";
import Image from "next/image";
import type { TurnPhase } from "@/lib/engine/turn";
import { SeatActions } from "./seat-actions";
import { SpellHand } from "./spell-hand";
import { CardBack, CardDetail, type TileCard } from "./card-tile";
import { useCardPreview } from "./card-preview";
import { CardLibrary } from "./card-library";
import { TestConsole } from "./console";
import { tokensFor } from "@/lib/view/tokens";
import { DRAG_TYPE, SlotPanel, startHoldingDrag, type SlotItem } from "./slot-panel";
import { ItemSlot, SLOT_ART_HEIGHT, SLOT_WIDTH } from "./item-slot";
import { CarriedCard, type Carried } from "./carry";
import { SLOTS, fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { carriedCount, carryLimit, wandRefills } from "@/lib/engine/derive";
import type { Holding } from "@/lib/engine/state";
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
import items from "@/data/items.json";
import type { EventCard, Item, Spell } from "@/data/types";
import { FieldModal } from "./field-modal";
import { DrawModal, ringFields } from "./draw-modal";
import { RebornModal } from "./reborn-modal";
import { AnnouncementModal } from "./announcement";
import { announce, watch, type Announcement, type Watched } from "@/lib/engine/announcements";
import { ConfirmDialog, type Confirmation } from "./confirm";
import { USE_VERB, askAbout, isUsable, usageOf } from "@/lib/engine/uses";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { describeResult } from "@/lib/engine/noticeText";
import { MAX_SEATS } from "@/lib/game/modes";
import { PlayersDrawer } from "./players";
import { PilesView } from "./piles";
import { dismissableOpen } from "./overlay";

const CHARACTERS = characters as Character[];

/**
 * How many of each the box prints — 165 and 30, said on the manual's first page
 * and counted again by the slicer, which cut exactly that many out of the scans.
 *
 * Read off the data rather than typed in, so the day a card turns out to be
 * missing from a scan this number moves with it instead of quietly disagreeing.
 */
const PRINTED_EVENTS = (events as EventCard[]).length;
const PRINTED_SPELLS = (spells as Spell[]).length;
const EVENTS = events as EventCard[];

/**
 * Every card a seat can hold, by id, across all four decks.
 *
 * A hand mixes them: an item from the event deck, a Zaklęcie from the spell
 * pile, a trophy that was a Wróg. Looking only in the event deck left spells
 * showing their raw id.
 */
const CARD_NAMES = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.name] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.name] as const),
  ...(items as Item[]).map((c) => [c.id, c.name] as const),
]);
const CARD_TEXTS = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.text] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.text] as const),
  ...(items as Item[]).map((c) => [c.id, c.text ?? ""] as const),
]);
const FIELD_NAMES = new Map(
  [...FIELDS.values()].map((field) => [field.id, field.name]),
);

interface Held {
  /** Where it is worn in the slotted variant; null when it is in the pack. */
  slot?: Slot | null;
  id: string;
  /** Any card in the box — 16.6 makes the event and equipment id spaces overlap. */
  cardId: CardId;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
  /** Conjured by the test shortcut — marked on the card, not just in the journal. */
  granted?: boolean;
}

/**
 * A seat's cards in the shape the engine's rules read them.
 *
 * The rules that count a pack live in `derive.ts` and are the same ones the
 * server enforces with, so this is the whole of what the browser has to do to
 * ask them. Counting the pack by hand instead is what put a Magiczny Miecz on
 * the wrong side of 5.4 — `carriedCount` leaves the two relics out (see
 * `RELICS`) and a filter written next to it did not.
 */
function asHoldings(holdings: readonly Held[]): Holding[] {
  return holdings.map((h) => ({
    cardId: h.cardId,
    kind: h.kind,
    face: h.face,
    slot: h.slot ?? null,
  }));
}

interface Seat {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: SeatCharacter | null;
  /**
   * Narrow here as well as on the server, because the server is what guarantees
   * it: `seatsFor` turns the stored column into a `FieldId` or null before it
   * ever reaches a response, so the browser is not trusting a wire value — it is
   * naming the type the API already promises.
   */
  field_id: FieldId | null;
  miecz_own: number;
  magia_own: number;
  /** Own points plus everything carried (1.5, 2.5), computed server-side. */
  miecz_total: number;
  magia_total: number;
  /**
   * How many Zaklęcia this hand may hold (2.6), computed server-side.
   *
   * Sent rather than worked out here so the number shown is the number the
   * server refuses a draw against — the same basis, not one that happens to
   * agree most of the time.
   */
  spell_capacity: number;
  /** The same, reckoned for a fight — 1.5's other figure. */
  miecz_walka: number;
  magia_walka: number;
  /**
   * What the character is under, already worked out into marks.
   *
   * The server folds the stored effects together with the four ad-hoc columns
   * the turn engine reads, so the browser gets one list and never has to know
   * there were two halves.
   */
  effects: {
    id: string;
    /** The card that put it there, where a card did. */
    source: string;
    glyph: string;
    tone: "dobry" | "zly" | "obojetny";
    title: string;
  }[];
  zycie: number;
  zloto: number;
  nature: string | null;
  turns_lost: number;
  /** Turn the Kamień wears off on (20.1). Null when not petrified. */
  stone_until_turn: number | null;
  eliminated: boolean;
  /** Set when the player behind this seat walked away; the character stays. */
  abandoned_at: string | null;
  /** Device has not checked in recently — a closed tab, not a decision. */
  away: boolean;
  ready: boolean;
  no_device: boolean;
  is_host: boolean;
  holdings: Held[];
  /** Cards this viewer is not allowed to see the faces of (9.3). */
  hidden_count: number;
}

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
  const [leftDrawer, setLeftDrawer] = useState<"karty" | null>(null);
  /** The stacks, drawn as stacks (`piles.tsx`). */
  const [piles, setPiles] = useState(false);
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
      if (carriedCount(mineCards, "slotowy") >= carryLimit(mineCards, "slotowy")) {
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
  const onField = turnState.phase === "pole" ? turnState : null;

  const overlays = (
    <>
      {testing && (
        <TestConsole
          open={consoleOpen}
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
        {announcement?.kind === "smierc" && (
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

      {piles && game.deckCounts && (
        <PilesView
          counts={game.deckCounts}
          printed={{ events: PRINTED_EVENTS, spells: PRINTED_SPELLS }}
          onClose={() => setPiles(false)}
        />
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
        (game.turn_state.phase === "walka" ||
          game.turn_state.phase === "ruch" ||
          game.turn_state.phase === "most" ||
          (game.turn_state.phase === "pole" &&
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
            cards={game.turn_state.phase === "pole" ? game.turn_state.drawn : []}
            resolved={
              game.turn_state.phase === "pole"
                ? [...(game.turn_state.resolved ?? []), ...waved]
                : []
            }
            fought={game.turn_state.phase === "pole" ? (game.turn_state.fought ?? []) : []}
            fight={game.turn_state.phase === "walka" ? game.turn_state.fight : null}
            // The direction choice, which used to be a panel of its own below
            // the queue. It is the same shape as everything else in here: one
            // thing you are asked to do, with the table watching.
            move={
              game.turn_state.phase === "ruch"
                ? { roll: game.turn_state.roll, options: game.turn_state.options }
                : null
            }
            bridge={game.turn_state.phase === "most" ? game.turn_state.bridge : null}
            fieldOffer={
              game.turn_state.phase === "pole" ? compulsoryOffer(active.field_id, game.turn_state.resolved ?? []) : null
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
              game.turn_state.phase === "walka"
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
              game.turn_state.phase === "walka" &&
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
                game.turn_state.phase === "pole" ? (game.turn_state.resolved ?? []) : [],
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
          eqMode={game.eq_mode === "slotowy" ? "slotowy" : "klasyczny"}
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
                purse: { zloto: active.zloto, zycie: active.zycie },
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
          onLibrary={() => setLeftDrawer("karty")}
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
          {leftDrawer === "karty" && (
            <CardLibrary
              eqMode={game.eq_mode === "slotowy" ? "slotowy" : "klasyczny"}
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
              <span className="text-xs text-muted">
                Tura {game.turn} · {active ? (active.player_name ?? "—") : "—"}
              </span>
              {/* Both piles, beside the turn they are being drawn into. At a
                  physical table the stacks sit on the table and everybody
                  watches them thin; in simulation they were invisible, so a
                  deck about to turn over (9.5) did it with no warning and no
                  trace. The number after the slash is the stos zużytych — what
                  a reshuffle will bring back. */}
              {game.deckCounts && (
                <button
                  onClick={() => setPiles(true)}
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
              {/* Who is at the table, which is a question about the table and
                  not about the turn — so it lives up here with the rest of
                  them, and stays reachable while a fight is open. */}
              <button
                onClick={() => setRightDrawer("gracze")}
                className="text-ochre/80 transition hover:text-ochre"
              >
                Gracze <span className="tnum text-muted">{seats.length}</span>
              </button>
              <span className="tnum tracking-[0.2em] text-muted">{game.join_code}</span>
              <button onClick={() => setLeftDrawer("karty")} className="text-ochre/80 hover:text-ochre">
                Karty
              </button>
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
              game.turn_state.phase === "ruch"
                ? game.turn_state.options.map((option) => option.fieldId)
                : []
            }
            onPick={(fieldId) => setInspecting(fieldId)}
          />
            </div>
            <Journal
              code={code}
              revision={game.revision}
              eqMode={game.eq_mode === "slotowy" ? "slotowy" : "klasyczny"}
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
                  windows={turnWindows}
                  steps={turnSteps(turnState.phase)}
                  // 17.4 ends a fight when the dice are compared, not when
                  // somebody walks away from it; and 10.1-10.2 make the move
                  // the first of the two things a turn is made of.
                  canEnd={
                    game.turn_state.phase !== "walka" &&
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
                  canRoll={game.turn_state.phase === "rzut"}
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
                slotted={game.eq_mode === "slotowy"}
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
    miecz: seat.miecz_total,
    mieczOwn: seat.miecz_own,
    magia: seat.magia_total,
    magiaOwn: seat.magia_own,
    zycie: seat.zycie,
    zloto: seat.zloto,
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

const KIND_LABEL: Record<Held["kind"], string> = {
  item: "Przedmiot",
  friend: "Przyjaciel",
  trophy: "Trofeum",
  spell: "Zaklęcie",
};

/**
 * What a seat is carrying.
 *
 * Another player's concealed spells never reach this component — the server
 * strips them and sends a count instead (9.3) — so there is nothing here that
 * could leak by rendering carelessly.
 */
function Hand({
  seat,
  isMine,
  canAct,
  trophies,
  slotted,
  carried,
  moving,
  liftedHoldingId,
  onCarry,
  onDragging,
  onDrop,
  onTrade,
  onEquip,
  onUse,
  onWand,
  onReorder,
}: {
  seat: Seat;
  isMine: boolean;
  canAct: boolean;
  slotted: boolean;
  trophies: number;
  /** The card on the cursor, if any. */
  carried: Carried | null;
  /** A card is in the air, however it was picked up — so nothing offers to be read. */
  moving: boolean;
  /** What is in the air, however it was picked up, so its place looks emptied. */
  liftedHoldingId: string | null;
  onCarry: (carried: Carried | null) => void;
  /** The card id being dragged out of the pack, or null when the drag ends. */
  onDragging: (moving: { cardId: string; holdingId: string } | null) => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onEquip: (holdingId: string, slot: Slot | null) => void;
  /** Spend a card by using it. Absent on somebody else's pack. */
  onUse?: (holdingId: string, cardId: string) => void;
  /** Takes a Zaklęcie on the Różdżka's terms, not 2.6's. */
  onWand?: () => void;
  /** The pack, in the order its owner wants it. Absent on somebody else's. */
  onReorder?: (holdingIds: string[]) => void;
  onInspect: (card: TileCard) => void;
}) {
  /** Something is being carried or dragged over the pack itself. */
  const [dragOver, setDragOver] = useState(false);
  /** The card a reordering drag is currently over, so it can show where it lands. */
  const [insertAt, setInsertAt] = useState<string | null>(null);
  /**
   * The order this device has just asked for and the server has not confirmed.
   *
   * Without it a card dragged across the pack snaps back for as long as the
   * round trip takes, which for a gesture that is *about* where the card ends
   * up reads as the drag having failed. Never cleared: once the server agrees,
   * sorting by it is a no-op, and the moment a card is gained or lost it stops
   * matching the pack and is ignored.
   */
  const [wanted, setWanted] = useState<string[] | null>(null);

  /**
   * The Różdżka Zaklęć's condition, asked of the engine where its button is
   * drawn — the same question `drawSpellWithWand` refuses against.
   */
  const setupSpells = startingKit(asCharacterId(seat.character_id)).spells ?? 0;
  const wandReady = wandRefills(
    seat.holdings.filter((held) => held.kind === "spell").length,
    setupSpells,
  );

  const shown = seat.holdings.filter((held) => held.kind !== "spell");
  // Counted through the engine rather than beside it, so what the pack says is
  // what `takeCard` and `equipCard` will actually allow. Still counted here and
  // not sent down ready-made: `mine.holdings` carries the optimistic slot a
  // drag has just asked for, and a number from the last poll would lag the
  // gesture it is describing.
  const cards = asHoldings(seat.holdings);
  const variant = slotted ? "slotowy" : "klasyczny";
  const packed = carriedCount(cards, variant);
  const limit = carryLimit(cards, variant);

  /**
   * The pack, in the order it should be drawn.
   *
   * The server's order is the truth; `wanted` overrides it only while it still
   * describes exactly this set of cards. A stale one — from before a card was
   * taken or lost — is simply ignored rather than cleared, which keeps this a
   * derivation and not a thing that has to be kept in step.
   */
  const inPack = shown.filter((held) => !slotted || held.slot == null);
  const packOrder = inPack.map((held) => held.id);
  const arranged =
    wanted !== null &&
    wanted.length === packOrder.length &&
    packOrder.every((id) => wanted.includes(id))
      ? [...inPack].sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
      : inPack;

  /**
   * The one square that is not a place to put a card: the square it came from.
   *
   * No gap opens there, because the hollow left behind is already the answer —
   * and dropping there used to do worse than nothing. It asked the row to put
   * the card in front of itself, which stops being a position the moment the
   * card is lifted out of the row to look for one, so it fell through to "no
   * position given", which means the end of the queue. A card picked up and put
   * straight back down came to rest at the back of the pack.
   *
   * The square *after* it is a place, even though landing there leaves the card
   * exactly where it started. It was quiet for a while on the reasoning that a
   * gap is a promise something will change — but every other square in the row
   * answers, so the one next door staying dark reads as a hole in the
   * interface rather than as an argument about identity. Nothing is written
   * when nothing moves; that belongs on the write, not on the gap.
   */
  const liftedIndex = arranged.findIndex((held) => held.id === liftedHoldingId);
  const itsOwnSquare = (id: string) => id === liftedHoldingId;

  /**
   * Which way each card steps aside, and how few of them have to.
   *
   * A card leaves a hollow where it was, and the row closes over it from
   * whichever side the card is going. Aim to your left and the cards between
   * there and the hollow step right, the way a hand opens a place. Aim to your
   * right and they step *left* instead, into the hollow, because that is the
   * direction they will really travel — everything from the target rightwards
   * stays exactly where it is, since nothing past the landing place moves.
   *
   * Stepping one way for both was the wrong picture in half the cases: dropping
   * on the far end pushed the whole tail of the pack sideways to make a place
   * that was already there, five squares back.
   *
   * A card off the body leaves no hollow, so there is nothing to close and the
   * row opens in front of the target as before.
   *
   * The gap is drawn by moving pictures and not by moving boxes (see
   * `ItemSlot`): laying it out would slide the row sideways under the pointer
   * and take the card you were aiming at with it.
   */
  /**
   * Where the gap is, and nowhere when nothing is in the air.
   *
   * The insertion point is a hover, and a hover outlives what it was for: put
   * the card down with Escape or a click on the board and the pointer has not
   * moved, so nothing tells the row to close. It used to stay open — and open
   * far wider than it had been, because with no card in the air the rule that
   * decides which way each one steps reads the row as a card arriving from the
   * body, and the whole tail steps aside for it. Fourteen cards stepped and
   * twelve places drawn, for a card that was already back in the pack.
   *
   * Read from what is actually in the air rather than from what was last
   * hovered, and the row cannot be left open by anything at all.
   */
  const insertIndex =
    insertAt === null || liftedHoldingId === null
      ? -1
      : arranged.findIndex((held) => held.id === insertAt);
  const stepFor = (index: number): -1 | 0 | 1 => {
    if (insertIndex < 0) return 0;
    if (liftedIndex < 0) return index >= insertIndex ? 1 : 0;
    if (insertIndex < liftedIndex) return index >= insertIndex && index < liftedIndex ? 1 : 0;
    return index > liftedIndex && index <= insertIndex ? -1 : 0;
  };

  /**
   * The card a landing card goes in front of, given the square you aimed at.
   *
   * You aim at a square and the card takes it. Coming from the left that means
   * going in front of the card *after* the one under the pointer, not in front
   * of that one — which is the same square counted from the other end, and
   * counting it from the wrong end put the card down one place short of where
   * it was aimed. Point at the fifth square and the fourth card was the one
   * that moved.
   *
   * Coming from the right, and for a card off the body with no place in the row
   * yet, the square you aim at is the one you go in front of.
   */
  const landsBefore = (targetId: string): string | null => {
    const target = arranged.findIndex((held) => held.id === targetId);
    if (target < 0 || liftedIndex < 0 || target < liftedIndex) return targetId;
    return arranged[target + 1]?.id ?? null;
  };

  /** The pack's order with one card put before another, or on the end. */
  const orderWith = (holdingId: string, beforeId: string | null) => {
    const without = arranged.map((held) => held.id).filter((id) => id !== holdingId);
    const at = beforeId === null ? -1 : without.indexOf(beforeId);
    without.splice(at < 0 ? without.length : at, 0, holdingId);
    return without;
  };

  /**
   * Moves a card already in the pack to sit before another, or on the end.
   *
   * A move that changes nothing writes nothing. Dropping a card in front of the
   * one that already follows it is a real aim at a real place, and the place
   * happens to be the one it is in — so it is allowed, and answered with
   * silence rather than with a round trip that reorders the pack into the order
   * it is already in.
   */
  const moveWithin = (holdingId: string, beforeId: string | null) => {
    if (!onReorder) return;
    if (!arranged.some((held) => held.id === holdingId)) return;
    const order = orderWith(holdingId, beforeId);
    if (order.every((id, index) => arranged[index]?.id === id)) return;
    setWanted(order);
    onReorder(order);
  };

  /**
   * Takes a card off the body and puts it in the pack, where the pointer says.
   *
   * It used to land on the end however carefully you aimed, on the reasoning
   * that a card the pack has not seen before has no place in it yet. But the
   * pack is a row a player arranges, and coming off the body is the commonest
   * way a card enters it — so "anywhere you like, except where you were
   * pointing" was the one gesture that did not work.
   *
   * The two writes do not race. Where a card sits and whether it is worn are
   * different columns, and the order is written for whatever the seat holds
   * without asking where any of it is, so neither has to land first.
   */
  const dropIntoPack = (holdingId: string, beforeId: string | null) => {
    onEquip(holdingId, null);
    if (!onReorder) return;
    const order = orderWith(holdingId, beforeId);
    setWanted(order);
    onReorder(order);
  };

  /**
   * The pack is about to be dropped into, and whether it would take it.
   *
   * Lit while the pointer is inside it with a card in the air — the same answer
   * a place on the body gives, and given the same way: you are over me, and I
   * would take this. A card in the air is not enough on its own; it lit the
   * rectangle from the moment anything was picked up, so the pack claimed to be
   * the destination while you were aiming at a hand or the board.
   *
   * Being over one of the pack's own cards still counts as being inside it. The
   * two lights say different things and do not compete: the rectangle is *the
   * pack will take this*, and the gap is *here, exactly*.
   *
   * `refuses` is 5.4 — a card coming in from the body when there is no room for
   * it — and never a card already in the pack, which is only being moved about
   * inside a limit it already satisfies.
   */
  const landing = liftedHoldingId !== null;
  const refuses =
    landing && carried !== null && carried.from !== "plecak" && packed >= limit;

  // After the hooks, which have to run every render whatever is on show.
  //
  // Your own pack is always drawn, empty or not. It used to disappear until the
  // first card landed in it, which meant the places you drop things into did
  // not exist until you already had something to drop — and taking a card off
  // the body aims at nothing. Somebody else's empty pack is still hidden: that
  // one is information, and "nothing" is a whole row to say it in.
  if (!isMine && shown.length === 0 && seat.hidden_count === 0) return null;

  return (
    <div className="mt-3 border-t border-edge pt-3">
      {/* What is in the pack, against what will fit. In the variant a place on
          the body is not the pack, so the number here is the one 5.4 is about —
          and seeing it beats finding out by being refused. */}
      <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">
        Plecak{" "}
        <span className={packed >= limit ? "text-vermilion" : "text-muted/70"}>
          {packed} / {Number.isFinite(limit) ? limit : "∞"}
        </span>
      </p>
      {/* Cards, as cards. A player at a table recognises their Miecz by its
          picture long before they read the word, and the ability text that used
          to sit under every line now lives one tap away in the detail view. */}
      {/* The pack is one place, and this rectangle is it.
          
          The free squares used to light up green one by one, which offered
          something the pack does not have: a card dropped in the fourth square
          does not go to the fourth square, it goes on the end, because the only
          positions a pack has are the ones its cards are in. The squares are
          how much room is left — 5.4's number, drawn — and nothing more.
          
          So the whole rectangle answers instead — for as long as a card is in
          the air, and the gap that opens under the pointer says where in it. */}
      <div
        onDragOver={(event) => {
          if (!canAct || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          setDragOver(true);
        }}
        // Move rather than enter: a card is picked up by clicking one that is
        // already inside the pack, so the pointer never crosses the boundary
        // and `pointerenter` never fires. The guard keeps this from setting
        // state on every pixel.
        onPointerMove={() => {
          if (carried && !dragOver) setDragOver(true);
        }}
        onPointerLeave={() => {
          setDragOver(false);
          setInsertAt(null);
        }}
        onDragLeave={(event) => {
          // Only when the pointer leaves the pack itself, not on its way across
          // a card inside it.
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(event) => {
          // Whatever gap is open is where it lands — dropping into the space
          // the row has made is the same gesture as dropping on the card that
          // made it. With none open this is the end of the queue, which is
          // where a card the pack has not seen before goes anyway.
          const before = insertAt === null ? null : landsBefore(insertAt);
          setDragOver(false);
          setInsertAt(null);
          if (!canAct) return;
          const holdingId = event.dataTransfer.getData(DRAG_TYPE);
          if (!holdingId) return;
          event.preventDefault();
          if (packOrder.includes(holdingId)) moveWithin(holdingId, before);
          else dropIntoPack(holdingId, before);
        }}
        // Clicking the pack with something on the cursor puts it there, which
        // is how a worn card comes off without aiming at a particular card —
        // and how a card already in the pack is sent to the back of it.
        onClick={(event) => {
          if (!carried) return;
          event.stopPropagation();
          // Wherever the gap happens to be, this is the pack itself: the end.
          const before = insertAt === null ? null : landsBefore(insertAt);
          setInsertAt(null);
          if (carried.from === "plecak") {
            moveWithin(carried.holdingId, before);
            return onCarry(null);
          }
          dropIntoPack(carried.holdingId, before);
          onCarry(null);
        }}
        // The same two strengths every place on the body uses (see `TONE`):
        // dashed and faint for somewhere the card could go, solid and filled in
        // for where it would go. Red is 5.4 — no room — said while the card is
        // still in the air rather than as a refusal after it lands.
        // Clipped to itself, because a card at the start of a wrapped row steps
        // aside into nothing: there is no room inside the rectangle to its
        // left, so it leans out past the edge and was being cut off by the
        // panel behind, several pixels further out and in the wrong colour.
        // Cut by the pack's own border it reads as a card half out of the bag.
        className={`flex flex-wrap gap-2 overflow-hidden rounded border p-1 transition ${
          !landing
            ? "border-transparent"
            : refuses
              ? dragOver
                ? "border-solid border-vermilion bg-vermilion/25"
                : "border-dashed border-vermilion/60 bg-vermilion/10"
              : dragOver
                ? "border-solid border-verdigris bg-verdigris/25"
                : "border-dashed border-verdigris/60 bg-verdigris/10"
        }`}
      >
        {/* Your own Zaklęcia are not repeated here: they have their own panel
            above, face up and with the cast controls on them. What belongs on a
            seat card is what the *table* can see. */}
        {arranged.map((held, index) => (
          <ItemSlot
            key={held.id}
            // The same component the body is built from: a card in the pack and
            // a card being worn are the same object to a player, so picking one
            // up feels the same either way and both are the same size.
            item={{
              holdingId: held.id,
              cardId: held.cardId,
              card: tileFor(held),
              granted: held.granted,
            }}
            label={tileFor(held).name}
            eqMode={slotted ? "slotowy" : "klasyczny"}
            nature={asNature(seat.nature)}
            tone="filled"
            // A card would land in front of this one, so this and everything
            // after it steps aside to show the space it is going into. Said
            // with a gap rather than by tinting the card under the pointer,
            // which reads as "this one is about to be replaced".
            step={stepFor(index)}
            // Reading and moving are different modes: no Karta opens over the
            // place you are aiming at while a card is in the air.
            quiet={moving}
            // The test mark comes off the card itself — see `ItemSlot`.
            marks={held.kind === "trophy" ? ["trofeum"] : []}
            // Up onto the body, mirroring the arrow down that takes a card
            // off it. Only where there is one place it could go: with two
            // hands to choose between, an arrow would be choosing for you, and
            // the pair of named buttons below is the whole point.
            corner={
              canAct && slotted && wearsInOnePlace(held.cardId) ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCarry(null);
                    const slot = SLOTS.find((place) => fitsIn(held.cardId, place))!;
                    // Where the two change places, say where the displaced one
                    // is going before the server does: it takes this card's
                    // square, and waiting to be told that means watching it
                    // arrive at the back of the pack and then jump.
                    const displaced = wornBySlot(seat)[slot];
                    if (displaced && onReorder) {
                      const order = arranged.map((card) => card.id).filter((id) => id !== held.id);
                      order.splice(index, 0, displaced.holdingId);
                      setWanted(order);
                      onReorder(order);
                    }
                    onEquip(held.id, slot);
                  }}
                  title={
                    wornBySlot(seat)[SLOTS.find((slot) => fitsIn(held.cardId, slot))!]
                      ? "Załóż — to, co tam jest, wraca na to miejsce w plecaku"
                      : "Załóż"
                  }
                  className="absolute right-0 top-0 z-10 rounded-bl bg-night/85 px-1.5 leading-none text-muted transition hover:text-ochre"
                >
                  <span className="block pb-0.5 text-[14px]">↑</span>
                </button>
              ) : null
            }
            // The one on the cursor is not also in the pack.
            lifted={held.id === liftedHoldingId}
            dimmed={held.kind === "trophy"}
            disabled={!canAct}
            // One click picks it up; the next puts down whatever is on the
            // cursor, in front of the card it lands on. Clicking moves things;
            // hovering reads them.
            //
            // Everything in the pack can be picked up, not only what could be
            // worn. It used to be the wearables alone, which made the pack an
            // inventory in a game where three quarters of what you carry has no
            // place on the body — a Graal, an Eliksir and a trophy could not be
            // moved at all, so a pack could not be arranged.
            //
            // It used to open the card as a fallback, so the same gesture meant
            // "pick this up" on one card and "let me look at that" on the next —
            // and a modal landed on top of the pack you were in the middle of
            // rearranging. Reading is what the hover is for, and it is always
            // available without disturbing anything.
            onClick={(event) => {
              if (!canAct) return;
              event.stopPropagation();
              if (carried) {
                setInsertAt(null);
                // From the pack: it goes in front of this card. From the body:
                // it is being taken off, which lands it at the end.
                if (carried.from === "plecak") {
                  // Its own square is putting it back, which is the pack left
                  // exactly as it was.
                  if (!itsOwnSquare(held.id)) {
                    moveWithin(carried.holdingId, landsBefore(held.id));
                  }
                  return onCarry(null);
                }
                // Off the body, and in front of this card rather than on the
                // end of the row.
                dropIntoPack(carried.holdingId, landsBefore(held.id));
                return onCarry(null);
              }
              // Picked up from inside the pack, so the pointer is inside it —
              // said now rather than waiting for the first move, or the
              // rectangle stays dark until the hand twitches.
              setDragOver(true);
              onCarry({
                holdingId: held.id,
                cardId: held.cardId,
                name: tileFor(held).name,
                from: "plecak",
              });
            }}
            // Two clicks put a card on — and where there is nothing to put it
            // on, two clicks spend it instead. Never both for the same card:
            // the Różdżka Przeznaczenia is worn *and* spent, and it keeps the
            // gesture the other nine wearables have, with its "użyj" on the
            // button below. A gesture that meant one thing on this card and
            // another on the next would be worse than no gesture.
            onDoubleClick={() => {
              if (!canAct || held.kind !== "item") return;
              const place = slotted
                ? SLOTS.find((slot) => fitsIn(held.cardId, slot))
                : undefined;
              if (place) {
                onCarry(null);
                return onEquip(held.id, place);
              }
              if (onUse && isUsable(held.cardId)) onUse(held.id, held.cardId);
            }}
            // Dragged onto a place to put it on — the same journey the
            // "załóż" button makes, for people who reach for the card — or onto
            // another card in the pack, which is how the pack is arranged.
            draggable={canAct}
            onDragStart={(event) => {
              startHoldingDrag(event, held.id);
              onDragging({ cardId: held.cardId, holdingId: held.id });
            }}
            onDragEnd={() => {
              setInsertAt(null);
              onDragging(null);
            }}
            onDragOver={(event) => {
              if (!canAct || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
              // Taken here rather than left to the pack behind it, so the card
              // lands where the pointer is instead of at the end.
              event.stopPropagation();
              event.preventDefault();
              // The same two squares that mean "put it back" under the pointer
              // mean it under a drag.
              if (!itsOwnSquare(held.id)) setInsertAt(held.id);
            }}
            // No onDragLeave: unlike pointerleave, it fires on the way into a
            // child as well as on the way out, so a drag crossing the picture
            // inside this box would keep closing the gap it had just opened.
            // Leaving the pack clears it, and the next card claims it.
            onDrop={(event) => {
              setInsertAt(null);
              setDragOver(false);
              if (!canAct) return;
              const holdingId = event.dataTransfer.getData(DRAG_TYPE);
              if (!holdingId || holdingId === held.id) return;
              event.stopPropagation();
              event.preventDefault();
              // A card off the body is being taken off; one already in the pack
              // is being moved within it.
              const before = landsBefore(held.id);
              if (packOrder.includes(holdingId)) moveWithin(holdingId, before);
              else dropIntoPack(holdingId, before);
            }}
            /**
             * A carried card has no drag events behind it, so hovering is
             * watched directly for the same answer to show.
             *
             * Both halves of it: coming to a card opens the gap in front of it
             * and going away closes it again, wherever you go — onto the pack's
             * own margin, onto the body, off the panel. For a while only the
             * first half was safe, because the gap used to be made of layout
             * and opening it slid this card out from under the pointer, which
             * fired the leave, which closed the gap, which slid the card back.
             * The card shivered and the gap strobed, so the leave was simply
             * not listened for and the gap stayed open until something else
             * claimed it.
             *
             * The gap is drawn rather than laid out now (see `ItemSlot`) and
             * this box does not move, so leaving it means the pointer really
             * has left.
             */
            onPointerEnter={() => {
              if (!carried) return;
              // Its own square is not a place to put it, so nothing is open
              // while the pointer is there — said rather than left to the leave
              // of whatever was hovered before, which does not always come.
              // A card that has stepped aside is standing over its neighbour's
              // square, so coming back to the square you lifted from can mean
              // arriving under the very card that stepped, with no boundary
              // crossed to fire anything.
              setInsertAt(itsOwnSquare(held.id) ? null : held.id);
            }}
            // Only this card's own gap: moving straight to the next card sets
            // the new one in the same breath, and React keeps the last word.
            onPointerLeave={() => setInsertAt((at) => (at === held.id ? null : at))}
          >
            {canAct && (
              <span className="flex items-center gap-2">
                {/* Only where there is something to decide. A card with one
                    place has the arrow in its corner and needs no word for the
                    same act; a card with two hands to go in needs the two
                    named buttons, which is what this is. */}
                {slotted && held.kind === "item" && !wearsInOnePlace(held.cardId) && (
                  <EquipButton
                    cardId={held.cardId}
                    worn={wornBySlot(seat)}
                    onEquip={(slot) => onEquip(held.id, slot)}
                  />
                )}
                {/* Always drawn where a card has a use, whether or not the
                    double-click reaches it — a gesture nobody can see is not
                    an offer. In ochre because it costs you the card, unlike
                    "wyrzuć", which leaves it lying on the Obszar (5.5). */}
                {onUse && isUsable(held.cardId) && (
                  <button
                    onClick={() => onUse(held.id, held.cardId)}
                    title={usageOf(held.cardId)?.co}
                    className="text-[9px] text-ochre underline hover:text-ink"
                  >
                    {USE_VERB}
                  </button>
                )}
                {/* The Różdżka's refill, on the Różdżka. Drawn whenever the
                    card is held and greyed when the hand is still above its
                    setup size, rather than appearing and vanishing: an offer
                    that comes and goes is one nobody learns the shape of, and
                    the shape is the whole rule the card carries. */}
                {onWand && held.cardId === "rozdzka-zaklec" && (
                  <button
                    disabled={!wandReady}
                    onClick={onWand}
                    title={
                      wandReady
                        ? "Weź nowe Zaklęcie — Różdżka pozwala, gdy masz tyle, co na początku gry, lub mniej"
                        : `Różdżka da nowe Zaklęcie, gdy będziesz mieć najwyżej ${setupSpells}`
                    }
                    className="text-[9px] text-magia underline hover:text-ink disabled:text-muted/50 disabled:no-underline"
                  >
                    dobierz Zaklęcie
                  </button>
                )}
                <button
                  onClick={() => onDrop(held.id)}
                  className="text-[9px] text-muted underline hover:text-vermilion"
                >
                  wyrzuć
                </button>
              </span>
            )}
          </ItemSlot>
          ))}
        {/* Free places, built from the same component and wearing the same
            colours as the body's: green while a card that would fit is in the
            air, red when nothing more will. An empty place is a place, so it
            has no business being a differently-sized span with a highlight of
            its own. */}
        {(() => {
          // How much room is left, drawn. Not places to aim at — see the
          // rectangle above — so they never light up and never take a click of
          // their own; one lands on the pack, which is the thing they are part
          // of. No limit still shows one, so the row does not collapse.
          const free = Number.isFinite(limit) ? Math.max(0, limit - packed) : 1;
          return Array.from({ length: free }, (_, i) => (
            <ItemSlot
              key={`wolne-${i}`}
              item={null}
              label="wolne"
              glyph="+"
              tone="empty"
              disabled
              // Past the last card is the end of the queue, which is what a
              // free square means: not a position of its own, just the room
              // 5.4 has left.
              onPointerEnter={() => setInsertAt(null)}
              onDragOver={() => setInsertAt(null)}
            />
          ));
        })()}
        {seat.hidden_count > 0 && <CardBack count={seat.hidden_count} />}
      </div>

      {isMine && trophies > 0 && (
        <button
          onClick={onTrade}
          className="mt-2 rounded border border-edge px-2 py-1 text-[11px] text-ink transition hover:border-ochre"
        >
          Wymień trofea na punkty Miecza (1.4)
        </button>
      )}
    </div>
  );
}

/** What this seat is wearing, keyed by place. */
function wornBySlot(seat: Seat): Partial<Record<Slot, SlotItem>> {
  const worn: Partial<Record<Slot, SlotItem>> = {};
  for (const held of seat.holdings) {
    if (!held.slot) continue;
    worn[held.slot] = {
      holdingId: held.id,
      cardId: held.cardId,
      card: tileFor(held),
      granted: held.granted,
    };
  }
  return worn;
}

/**
 * Putting a Przedmiot on.
 *
 * One button when there is one place it can go, and a choice of two when it is
 * a weapon and both hands are places it could go — which is the only real
 * decision the variant offers, so it is the only one worth a second button.
 */
/** Somewhere to put it, and only one somewhere — so no choice to offer. */
function wearsInOnePlace(cardId: string): boolean {
  return SLOTS.filter((slot) => fitsIn(cardId, slot)).length === 1;
}

function EquipButton({
  cardId,
  worn,
  onEquip,
}: {
  cardId: string;
  worn: Partial<Record<Slot, SlotItem>>;
  onEquip: (slot: Slot) => void;
}) {
  const places = SLOTS.filter((slot) => fitsIn(cardId, slot));
  if (places.length === 0) return null;

  if (places.length === 1) {
    return (
      <button
        onClick={() => onEquip(places[0])}
        className="text-[9px] text-ochre/80 underline hover:text-ochre"
      >
        {worn[places[0]] ? "zamień" : "załóż"}
      </button>
    );
  }
  // Both hands. Named rather than numbered, because "gł." and "pom." is what
  // somebody staring at the two boxes either side of the body will read them as.
  return (
    <span className="flex items-center gap-1 text-[9px]">
      <span className="text-muted">załóż:</span>
      {places.map((slot) => (
        <button
          key={slot}
          onClick={() => onEquip(slot)}
          title={slot === "reka-glowna" ? "Ręka główna" : "Ręka pomocnicza"}
          className="text-ochre/80 underline hover:text-ochre"
        >
          {slot === "reka-glowna" ? "gł." : "pom."}
        </button>
      ))}
    </span>
  );
}


function tileFor(held: Held): TileCard {
  return {
    cardId: held.cardId,
    name: CARD_NAMES.get(held.cardId) ?? held.cardId,
    text: CARD_TEXTS.get(held.cardId),
    kindLabel: KIND_LABEL[held.kind],
    // Travels with the card into every view that draws it — the hover, the
    // whole Karta — rather than each of them being told separately.
    granted: held.granted,
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-muted">
      {children}
    </main>
  );
}

function SeatCard({
  seat,
  active,
  canAdjust,
  canCorrect,
  isMine,
  slotted,
  onAdjust,
  onDrop,
  onTrade,
  onEquip,
  onUse,
  onWand,
  onReorder,
  onInspect,
  spells,
}: {
  seat: Seat;
  active: boolean;
  canAdjust: boolean;
  /**
   * Whether the tracked values may be corrected by hand.
   *
   * Separate from `canAdjust`, which is really "this is your card and you may
   * act on it" — dropping a Przedmiot and equipping one are moves, not
   * corrections. Nudging Miecz with a ± is a correction, and a simulation has
   * nothing to correct: the app moved the figure, threw the die and applied the
   * result, so a player editing the outcome is not playing the game, they are
   * editing its record of itself.
   */
  canCorrect: boolean;
  isMine: boolean;
  /** The table plays the slotted variant. */
  slotted: boolean;
  onAdjust: (stat: string, delta: number) => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onEquip: (holdingId: string, slot: Slot | null) => void;
  /** Spend a card by using it — asked about first, because it cannot be undone. */
  onUse?: (holdingId: string, cardId: string) => void;
  /** Takes a Zaklęcie on the Różdżka's terms, not 2.6's. */
  onWand?: () => void;
  /** The pack, in the order its owner wants it. */
  onReorder?: (holdingIds: string[]) => void;
  onInspect: (card: TileCard) => void;
  /**
   * The hand, drawn under the pack.
   *
   * Passed in rather than built here because casting needs the turn's open
   * windows and the other seats to aim at, none of which a seat card knows.
   * What it does know is where the section belongs: 5.4 and 2.6 are the same
   * kind of fact about the same player, and they read as a pair.
   */
  spells?: React.ReactNode;
}) {
  const character = CHARACTERS.find((c) => c.id === seat.character_id);
  const trophies = seat.holdings.filter((h) => h.kind === "trophy");

  /**
   * The card on the cursor.
   *
   * Held here rather than in either half, because the whole point of picking
   * something up is to put it down somewhere else — and "somewhere else" is
   * usually the other half.
   */
  const [carried, setCarried] = useState<Carried | null>(null);
  /**
   * The card being dragged, by id.
   *
   * Kept in state because a `dragover` handler is not allowed to read what the
   * drag is carrying — only the drop is — so without this the place under the
   * pointer could not say whether it would accept before it was let go.
   */
  const [dragging, setDragging] = useState<{ cardId: string; holdingId: string } | null>(null);
  /**
   * Says what a drag has picked up — a tick after it picks it up.
   *
   * The browser takes its picture of the card being dragged at the end of the
   * `dragstart` handler, and the place the card came from is faded the moment
   * this lands. Fade it inside the handler and the picture on the cursor is the
   * faded one, which is the opposite of what a card in the air should look
   * like. Letting go cancels a pending fade rather than queueing behind it, so
   * a drag abandoned in the same breath cannot leave a hollow behind.
   */
  const dragTimer = useRef<number | null>(null);
  const announceDrag = useCallback((moving: { cardId: string; holdingId: string } | null) => {
    if (dragTimer.current !== null) window.clearTimeout(dragTimer.current);
    dragTimer.current = null;
    if (!moving) return setDragging(null);
    dragTimer.current = window.setTimeout(() => setDragging(moving), 0);
  }, []);
  const movingCardId = carried?.cardId ?? dragging?.cardId ?? null;
  /**
   * The card that is in the air, whichever way it was picked up.
   *
   * Clicking a card and dragging it are the same journey — one with the button
   * held — so the place it came from looks the same either way: emptied, not
   * still occupied by something that has gone slightly grey.
   */
  const liftedHoldingId = carried?.holdingId ?? dragging?.holdingId ?? null;

  /**
   * Puts down what is being carried.
   *
   * Onto the place it came from, it is simply put back: nothing moved, so
   * nothing is sent. That is also what happens when it is dropped anywhere that
   * is not a place at all — a click on the board, or Escape — because a card
   * picked up and not put anywhere has not gone anywhere.
   */
  const place = (slot: Slot | null) => {
    if (!carried) return;
    if (carried.from === (slot ?? "plecak")) return setCarried(null);
    onEquip(carried.holdingId, slot);
    setCarried(null);
  };

  // A click anywhere that is not a place, or Escape, puts it back. The places
  // stop their own clicks from reaching the window, so this only hears the
  // ones that missed. Registered a tick late so the click that picked the card
  // up does not immediately put it down again.
  useEffect(() => {
    if (!carried) return;
    let cancel: (() => void) | undefined;
    const timer = setTimeout(() => {
      const putBack = () => setCarried(null);
      const onKey = (event: KeyboardEvent) => {
        // Not while a sheet is open over the table: Escape is the top one's.
        if (event.key === "Escape" && !dismissableOpen()) setCarried(null);
      };
      window.addEventListener("click", putBack);
      window.addEventListener("keydown", onKey);
      cancel = () => {
        window.removeEventListener("click", putBack);
        window.removeEventListener("keydown", onKey);
      };
    }, 0);
    return () => {
      clearTimeout(timer);
      cancel?.();
    };
  }, [carried]);

  /**
   * Going away puts the card down.
   *
   * A card on the cursor is a gesture half finished, and a gesture cannot be
   * left running in a tab nobody is looking at: you come back minutes later to
   * a card stuck to the pointer, having forgotten which card it was or where it
   * came from, and the first click anywhere puts it somewhere. Leaving the tab
   * ends it, and so does the window losing focus.
   *
   * Nothing is lost by being eager about this. Putting it down is not a move —
   * the card has not gone anywhere yet, and the pack is exactly as it was.
   */
  useEffect(() => {
    if (!carried) return;
    const putBack = () => setCarried(null);
    const onHidden = () => {
      if (document.hidden) putBack();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", putBack);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", putBack);
    };
  }, [carried]);

  return (
    <article
      className={`rounded-lg border bg-panel p-4 transition ${
        active ? "border-ochre shadow-[0_0_0_1px_var(--color-ochre)]" : "border-edge"
      }`}
    >
      {/* A fixed height, so a seat card does not jump when an effect appears or
          wears off — the marks are as tall as a mark can be whether or not any
          are there. And aligned to the top rather than to the baseline: a
          picture has no baseline to sit on, so matching one stretched the row
          to whatever the tallest mark happened to be. */}
      <header className="mb-3 flex h-9 items-start gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-ink">
          {/* A seat with a character but no name is somebody who joined without
              typing one, not an empty chair — calling it "wolne" made a player
              look absent at their own table. */}
          {seat.player_name ?? (
            <span className="text-muted">
              {seat.character_id ? `Miejsce ${seat.seat_index + 1}` : "wolne miejsce"}
            </span>
          )}
        </h3>
        {/* What is true of this character right now, beside the name it is
            true of. A mark is a reminder that something holds, not an
            explanation — the hover carries the whole of it, including how long
            it has left, which is the part a player is actually deciding
            around. */}
        {/* Beside the name, not across the card from it: these are true of
            the person the name belongs to, and at the far edge of a wide seat
            card they read as belonging to whatever they happen to be next to. */}
        {seat.effects.length > 0 && (
          <span className="flex shrink-0 items-start gap-1">
            {seat.effects.map((mark) => (
              <EffectMark key={mark.id} mark={mark} nature={asNature(seat.nature)} />
            ))}
          </span>
        )}
      </header>

      {character ? (
        <>
          {/* The character and what it is wearing, pushed to opposite sides.
              They are two different things to look at — who this is, and what
              they have on — and sitting them shoulder to shoulder in the middle
              made one wide object out of two. Wrapping is kept, because on a
              narrow screen a row that will not fit has to become two. */}
          <div className="mb-3 flex flex-wrap items-start justify-between gap-6">
            <div className="shrink-0">
              {/*
                The card between its tokens, laid out the way the card itself
                says to.

                Every Karta Postaci prints its four parameters up its own
                edges — Miecz and Magia reading up the left side, Złoto and
                Życia up the right — and those printed words are captions for
                the piles of żetony a player builds against them. A row of
                numbers underneath said the same thing and looked like a
                spreadsheet; this looks like the table.
              */}
              <div className="flex items-stretch gap-1">
                <div className="flex flex-col justify-between gap-2 py-1">
                  <RailStat
                    label="Miecz"
                    value={seat.miecz_own}
                    total={seat.miecz_total}
                    inFight={seat.miecz_walka}
                    stat="miecz"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                  <RailStat
                    label="Magia"
                    value={seat.magia_own}
                    total={seat.magia_total}
                    inFight={seat.magia_walka}
                    stat="magia"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                </div>

                {/* The card carries the abilities, which no amount of stat
                    display replaces — half of what a character can do is prose
                    on it. At this size most of that prose is legible and the
                    rest is a click away: the Karta opens full size, which is
                    the only way to read the small print on the Charakterystyka
                    without leaning into the screen. */}
                {characterImageUrl(character.id) && (
                  <button
                    type="button"
                    onClick={() =>
                      onInspect({
                        cardId: character.id,
                        name: character.name,
                        text: character.abilities.join("\n\n"),
                        kindLabel: `Postać · Miecz ${character.miecz} · Magia ${character.magia} · ${character.nature}`,
                        character: true,
                      })
                    }
                    title={`${character.name} — powiększ Kartę`}
                    className="shrink-0 cursor-zoom-in rounded border border-edge transition hover:border-ochre"
                  >
                    <Image
                      src={characterImageUrl(character.id)!}
                      alt={character.name}
                      width={192}
                      height={238}
                      className="h-auto w-48 rounded"
                      unoptimized
                    />
                  </button>
                )}

                <div className="flex flex-col justify-between gap-2 py-1">
                  <RailStat
                    label="Złoto"
                    value={seat.zloto}
                    stat="zloto"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                  <RailStat
                    label="Życie"
                    value={seat.zycie}
                    stat="zycie"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                </div>
              </div>

              {/* The card prints its own name and its own Natura, so neither is
                  repeated — except that 7.2 can change a Natura mid-game, and
                  then what is printed is out of date and this is the only place
                  saying so. */}
              <p className="mt-1 text-center text-[10px] text-muted">
                {seat.nature ? `natura: ${seat.nature}` : "natura nieustalona"}
              </p>
            </div>

            {/* The body, beside the character card, in the slotted variant
                only — klasyczny play has nowhere to put anything. */}
            {slotted && (
              <SlotPanel
                worn={wornBySlot(seat)}
                canAct={canAdjust}
                busy={false}
                carrying={carried !== null}
                movingCardId={movingCardId}
                liftedHoldingId={liftedHoldingId}
                onDragging={announceDrag}
                onPickUp={(item, from) =>
                  setCarried({ ...item, name: item.card.name, from })
                }
                onTakeOff={(holdingId) => {
                  setCarried(null);
                  onEquip(holdingId, null);
                }}
                onUse={onUse}
                // A drag carries an id; a click carries nothing and means
                // "put down what I am holding".
                onDropInto={(holdingId, slot) =>
                  holdingId ? onEquip(holdingId, slot) : place(slot)
                }
              />
            )}
          </div>

          <Hand
            seat={seat}
            isMine={isMine}
            canAct={canAdjust}
            slotted={slotted}
            trophies={trophies.length}
            carried={carried}
            moving={movingCardId !== null}
            liftedHoldingId={liftedHoldingId}
            onCarry={setCarried}
            onDragging={announceDrag}
            onDrop={onDrop}
            onTrade={onTrade}
            onEquip={onEquip}
            onUse={onUse}
            onWand={onWand}
            onReorder={onReorder}
            onInspect={onInspect}
          />
          {spells}
          <CarriedCard carried={carried} />
          {/* Where the figure is standing is not repeated here. The board says
              it, the turn header says it for whoever is playing, and the roster
              says it for everybody else — a fourth copy under your own pack was
              the one nobody was reading. */}
          {character.abilities.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted">
                Zdolności ({character.abilities.length})
                {abilitiesOfCharacter(asCharacterId(seat.character_id)).length > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-verdigris/80">
                    {abilitiesOfCharacter(asCharacterId(seat.character_id)).map(describeAbility).join(" · ")}
                  </span>
                )}
              </summary>
              {/* Which of them the app is watching for, and which the player has
                  to remember. A Charakterystyka overrides the general rules
                  (8.2), so a power nobody applies is a rule quietly dropped. */}
              {notesForCharacter(asCharacterId(seat.character_id)).length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-ochre/40 pl-2 text-[10px] leading-snug text-ochre/80">
                  {notesForCharacter(asCharacterId(seat.character_id)).map((note) => (
                    <li key={note}>↳ {note}</li>
                  ))}
                </ul>
              )}
              <ol className="mt-1 flex list-decimal flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted">
                {character.abilities.map((ability, index) => (
                  <li key={index}>{ability}</li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">bez postaci</p>
      )}
    </article>
  );
}

/**
 * One tracked value with its correction buttons.
 *
 * The +/- are always available to any seated player, not just the value's
 * owner. At a table people spot each other's miscounts, and an override that
 * only the owner can use is useless in the moment someone else notices.
 */
/**
 * A number of points, as the tokens it is made of.
 *
 * This is what the table looks like: a character's own Miecz is a little pile
 * of red squares beside its card, and the rulebook never asks anybody to write
 * the number down. It asks for "żetony o odpowiednim nominale" (1.4, 2.4, 4.5)
 * — change, made out of the four denominations the box prints.
 *
 * Złoto is the exception and gets one coin and a count. There is only the one
 * gold denomination, so a hoard would be that many coins in a row, and by the
 * middle of a game that is a picture of a pile rather than a reading of it.
 * Everything else in the app already counts gold in numerals — "za 2 Sztuki
 * Złota" — so this reads the same way.
 */
/**
 * The Karta Postaci is drawn 192 wide and keeps its proportions, so it stands
 * this tall. Two piles share each side of it.
 */
const CARD_HEIGHT = 238;

/**
 * How tall one pile may stand: half the card, less the ± and the total that
 * share the rail underneath it.
 *
 * Only the gold uses it, and only to work out how much of each coin can show:
 * a full stack of ten is exactly this tall. The żetony proper are counted
 * rather than measured — five to a column — because they have faces that have
 * to stay visible, and a pile whose height depends on the arithmetic is a pile
 * you have to read instead of recognise.
 */
const STACK_HEIGHT = Math.round(CARD_HEIGHT / 2) - 28;

/**
 * The colour each parameter is counted in.
 *
 * The same four the box prints its żetony in (1.2, 2.2, 4.1, 3.1), so the
 * numeral under a pile belongs to it by colour alone. Nothing else on the rail
 * names the parameter — the word is on the card, printed up the edge the pile
 * stands against.
 */
/**
 * How wide any one pile is allowed to get.
 *
 * A ceiling rather than a considered number: three columns is enough for
 * anything this game actually hands out, and past it the picture stops growing
 * while the numeral underneath carries the truth. A hundred Sztuk Złota draws
 * as thirty and reads as a hundred, which is the right way round — the count
 * was always the exact half of this and the stacks were always the impression.
 */
const COLUMNS_MAX = 3;

const STAT_COLOUR: Record<string, string> = {
  miecz: "text-miecz",
  magia: "text-magia",
  zycie: "text-zycie",
  zloto: "text-zloto",
};

function Tokens({ stat, points, label }: { stat: string; points: number; label: string }) {
  /**
   * How big a żeton is drawn, and the number everything else on the rail comes
   * off. The pictures are about 100px square, so this is a sixth of what is
   * there and stays sharp on any screen worth having.
   *
   * Sixteen is where a column of five finally fits the half of the card it is
   * given — eighty-eight against ninety-one — where at eighteen it was seven
   * over and two full rails could outgrow the Karta they stand against.
   *
   * It also brings the two kinds of pile to the same height: a stack of ten
   * coins is eighty-eight as well, so a full rail is a full rail whichever
   * parameter it belongs to.
   */
  const SIZE = 16;
  if (stat === "zloto") {
    /**
     * Money is a stack, not a row.
     *
     * There is one gold denomination in the box, so twelve Sztuk Złota is
     * twelve identical coins — and twelve identical coins side by side is a
     * picture nobody reads, while twelve coins in a pile is a thing everybody
     * recognises from across a table. Each sits over the one before with a
     * sliver showing, which is what a stack of chips looks like and costs
     * nothing to draw, since every coin is the same picture anyway.
     *
     * Stacks of ten, each one finished before the next is started.
     *
     * Ten is how money is counted at a table — nobody builds two stacks of
     * seven — and a full one is exactly what its half of the card holds, nine
     * slivers under a whole top coin. Filling each before starting the next is
     * the point of counting that way: a glance at four full stacks and a short
     * one is forty-something without reading anything, where four stacks of
     * eleven and a straggler is just a heap that happens to be in columns.
     *
     * Three stacks and no more — see COLUMNS_MAX. Past thirty the pile stops
     * growing and the numeral goes on being exact, which costs nothing: the
     * coins are all ones, so the picture was only ever an impression of how
     * rich somebody is and the count was always the reading.
     */
    const PER_STACK = 10;
    const REVEAL = Math.floor((STACK_HEIGHT - SIZE) / (PER_STACK - 1));
    const stacks = Math.min(COLUMNS_MAX, Math.ceil(points / PER_STACK));

    return (
      <span className="flex items-start gap-0.5" title={`${label}: ${points}`}>
        {Array.from({ length: stacks }, (_, stack) => (
          <span key={stack} className="flex flex-col items-center">
            {Array.from(
              { length: Math.min(PER_STACK, points - stack * PER_STACK) },
              (_, index) => (
                <Image
                  key={index}
                  src="/tokens/zloto.png"
                  alt=""
                  width={SIZE}
                  height={SIZE}
                  style={index > 0 ? { marginTop: REVEAL - SIZE } : undefined}
                  className="rounded-[2px] shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
                  unoptimized
                />
              ),
            )}
          </span>
        ))}
      </span>
    );
  }

  const tokens = tokensFor(points);
  // Nothing is the honest picture of nothing: a character at zero Życie has had
  // its last token taken off the table (4.4). A bare 0 says so; an empty gap
  // would read as a stat the app had failed to work out.
  if (tokens.length === 0) return <span className="text-lg font-medium text-muted">0</span>;

  /**
   * Five to a column, each one finished before the next is started.
   *
   * The same counting the gold stacks use, and for the same reason: a column
   * of a known height is a number you can take in without reading, and a
   * column whose height depends on how much there is altogether is not. Five
   * because these do not overlap the way coins do — every żeton has to show
   * its face, since unlike gold they come in four denominations and which ones
   * they are is half the reading.
   */
  const PER_COLUMN = 5;
  // And three columns at the outside, the same ceiling the gold has. What gets
  // dropped is the tail, and `tokensFor` puts the big denominations first — so
  // a pile too large to draw still shows the part of itself worth looking at.
  const columns = Math.min(COLUMNS_MAX, Math.ceil(tokens.length / PER_COLUMN));

  return (
    <span className="flex items-start gap-0.5" title={`${label}: ${points}`}>
      {Array.from({ length: columns }, (_, column) => (
        <span key={column} className="flex flex-col items-center gap-0.5">
          {tokens
            .slice(column * PER_COLUMN, (column + 1) * PER_COLUMN)
            .map((token, index) => (
              <Image
                key={index}
                src={`/tokens/${stat}-${token}.png`}
                // Read once, by the very first token. Four images each
                // announcing a number would have a screen reader count the
                // pile aloud.
                alt={column === 0 && index === 0 ? `${label} ${points}` : ""}
                width={SIZE}
                height={SIZE}
                className="rounded-[2px]"
                unoptimized
              />
            ))}
        </span>
      ))}
    </span>
  );
}

/**
 * One parameter, as a pile of żetony up the side of the character card.
 *
 * The colour is the label. Every token in the box says which parameter it
 * belongs to by being red, blue, green or gold (1.2, 2.2, 4.1, 3.1), the card
 * prints the word right beside where the pile goes, and a caption under each
 * one would be the third time. The word is still in the title and read aloud to
 * a screen reader; it is just not drawn twice.
 */
/** Twice what it was, and the shape every other card in the app is drawn in. */
const MARK_WIDTH = 40;

/**
 * One thing that is true of a character, beside the name it is true of.
 *
 * The card's own illustration where a card is what did it — an Eliksir is
 * recognised by its picture the way everything else in this app is. A shape is
 * the fallback and is what the effects with no card behind them get: a lost
 * turn and a barred Most are rules, not things.
 *
 * Hovering opens the whole Karta, the same preview a card in the pack opens,
 * because the question "what is this doing to me" is answered by the card that
 * did it. How long it has left rides in where the class label usually goes —
 * that part belongs to this instance rather than to the card, and it is the
 * half a player is deciding around.
 */
function EffectMark({
  mark,
  nature,
}: {
  mark: Seat["effects"][number];
  nature: Nature | null;
}) {
  const name = CARD_NAMES.get(mark.source);
  const card: TileCard | null = name
    ? {
        cardId: mark.source,
        name,
        text: CARD_TEXTS.get(mark.source),
        kindLabel: mark.title,
      }
    : null;
  const { handlers, preview } = useCardPreview(card, false, "klasyczny", nature);
  const art = cardArtUrl(mark.source);
  // The shape a card is drawn in everywhere else: the illustration export is
  // 240x155 and every slot in the pack and on the body takes that ratio, so a
  // mark that took it too stopped needing to crop. A square was cutting the
  // sides off an Eliksir to make it fit a shape nothing else here uses.
  const height = Math.round(MARK_WIDTH * (SLOT_ART_HEIGHT / SLOT_WIDTH));
  const ring =
    mark.tone === "dobry"
      ? "border-verdigris text-verdigris"
      : mark.tone === "zly"
        ? "border-vermilion text-vermilion"
        : "border-edge text-muted";

  return (
    <>
      <span
        {...handlers}
        // The native tooltip only where there is no Karta to open instead: two
        // things appearing at once over the same mark is one too many.
        title={card ? undefined : mark.title}
        style={{ width: MARK_WIDTH, height }}
        className={`flex shrink-0 cursor-help items-center justify-center overflow-hidden rounded border leading-none ${ring}`}
      >
        {art ? (
          <Image
            src={art}
            alt=""
            width={MARK_WIDTH}
            height={height}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <span className="text-[15px]">{mark.glyph}</span>
        )}
      </span>
      {preview}
    </>
  );
}

function RailStat({
  label,
  value,
  total,
  inFight,
  stat,
  canAdjust,
  onAdjust,
}: {
  label: string;
  value: number;
  /** Own points plus what is carried. Shown only when the two differ. */
  total?: number;
  /**
   * The same reckoned for a fight, which is the same or more.
   *
   * A character has two figures and 1.5 quotes both — the Troll's "parametr
   * Miecza równy 8" and "podczas walki 11 punktom" — because the Miecz card and
   * the Krzyżowiec count in a fight and nowhere else. The rail shows the
   * parameter, which is what the card is asking for and what 14.5's Pułapka
   * subtracts; the fight figure is a hover away, where somebody deciding
   * whether to start one will look for it.
   */
  inFight?: number;
  stat: string;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  // Życie and Złoto have no derived half at all — 3.1 and 4.1 make the żetony
  // the whole value — so those rails have no `total` and the number under them
  // is simply what they are.
  const shown = total ?? value;

  return (
    // No width of its own. It was a fixed nine while a pile was always one
    // column wide, then a minimum of nine so a pile that had turned a corner
    // had room for the second — and by the time a żeton was drawn at sixteen
    // the minimum was more than twice what a single column needs, holding the
    // rails away from the Karta they are captions for. What is in it is what
    // it is wide.
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <Tokens stat={stat} points={value} label={label} />
      {/* The +/- move OWN points, which are what the rules floor at the
          starting value (1.3, 2.3). The total is derived from the cards on the
          table and is not editable — correcting it means changing what is held,
          not typing a different number.

          Which is also why the tokens stand for `value` and never `total`: 1.3
          and 2.5 are explicit that what a Przedmiot or a Przyjaciel lends you
          is not marked with a żeton, so a pile adding up to a number the table
          never had tokens for would be the interface inventing a rule. The
          figure under the pile is the one the cards make. */}
      {/*
        The number, under every pile and not just the ones with a second
        figure to report.

        A pile is a picture and a picture of nine tokens is not a reading of
        nine — that is the whole reason the gold has carried a numeral from the
        start, and the other three want it for the same reason. In the
        parameter's colour, because the pile it belongs to is that colour and
        nothing else on the rail says which one it is.
      */}
      <span
        title={
          inFight !== undefined && inFight !== shown
            ? `${label}: ${shown}, w walce ${inFight} (własne ${value})`
            : shown !== value
              ? `${label}: ${shown} (własne ${value})`
              : `${label}: ${shown}`
        }
        className={`tnum mt-1 text-[13px] font-medium leading-none ${STAT_COLOUR[stat] ?? "text-ink"}`}
      >
        {shown}
        {/* Own points behind it, but only where something has added to them:
            "12 (12)" is the same number twice. Dimmed rather than recoloured,
            so the total stays the thing being read.

            Two numbers and no more. The fight figure is a third — 1.5 quotes it
            and it is real, but a rail reading "53 (51) 54" is three numbers to
            hold in your head at a glance, which is worse than knowing one of
            them late. It is on the hover, which is where somebody weighing a
            fight will be looking anyway. */}
        {shown !== value && <span className="opacity-60"> ({value})</span>}
      </span>
      {canAdjust && (
        // Always visible rather than revealed on hover. Phones are the primary
        // device at a table and have no hover, so a hover-gated override is an
        // override that does not exist for most of the people using it.
        <div className="flex gap-0.5">
          <button
            onClick={() => onAdjust(stat, -1)}
            title={`${label} −1`}
            className="h-4 w-4 rounded border border-edge text-[10px] leading-none text-muted hover:border-vermilion hover:text-ink"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(stat, 1)}
            title={`${label} +1`}
            className="h-4 w-4 rounded border border-edge text-[10px] leading-none text-muted hover:border-verdigris hover:text-ink"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A one-line account of something the app worked out on its own.
 *
 * Only the results that were not visible as they happened need this. A card the
 * player drew is already on screen; two dice thrown inside a route handler are
 * not, and a referee that says only "you failed" is exactly the referee this
 * app exists to not be.
 */
/**
 * The reader's own Natura, narrowed once.
 *
 * The column is a plain string, and 5.3 is answered against a Nature — so this
 * is the boundary the guard belongs at, exactly like `asFieldId` elsewhere.
 */
function asNature(value: string | null | undefined): Nature | null {
  return value === "dobra" || value === "zla" || value === "chaotyczna" ? value : null;
}


