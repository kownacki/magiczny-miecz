"use client";

/** The table screen: one component that reads the table and composes the board, the sheet, the drawers and the overlays. */

import { top } from "@/lib/engine/stack";
import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readTestMode, watchTestMode, writeTestMode, TESTING_POSSIBLE } from "@/lib/game/testMode";
import { FIELDS, asFieldId, type FieldId } from "@/lib/engine/board";
import { useSurfaces } from "./use-surfaces";
import { CHARACTERS, asNature, type Seat } from "./table";
import { driverOf as driverOfSeat, pickingFor as whoIsPicking } from "./table-view";
import { CardLibrary } from "./card-library";
import { useTable, type Said } from "./use-table";
import { turnViewOf } from "./turn-view";
import { useAsks } from "./use-asks";
import { TheTable, type TableScreen as TableScreenValue } from "./the-table";
import { Overlays } from "./overlays";
import { TableScreen } from "./table-screen";
import { wakeConsole } from "./console";
import { Lobby } from "./lobby";
import { JoinGate, ReturnGate, SecondTabNotice, TakeOverGate } from "./door";
import { asLobbySeat } from "./table-view";
import { Journal } from "./journal";
import { TableSettings } from "./table-settings";
import { useMovedNotice } from "./moved-notice";
import { MAX_SEATS } from "@/lib/game/modes";
import { Toasts } from "./toast";
import { OpenRule } from "./rule-ref";
import { usePreferences } from "./preferences";


/**
 * How close two presses of the console key have to be to count as one.
 *
 * See `lastTick`. Deliberately short: it is meant to swallow a stutter, not to
 * make the key sluggish.
 */
const DOUBLE_TICK_MS = 350;

export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const table = useTable(code);
  const surfaces = useSurfaces();
  /**
   * Everything the server has said, and everything this device may say back.
   *
   * The screen's own state stays below — which drawer is out, which card
   * somebody tapped, whether a watcher has folded the turn away. See
   * `use-table.ts` for where the line is and why it is there.
   */
  const {
    game,
    seats,
    fieldCards,
    users,
    me,
    mySeatIndex,
    moved,
    taking,
    pendingCharacter,
    error,
    notices,
    dismissNotice,
    setHouseRule,
    busy,
    post,
    leave,
    join,
    claimSeat,
    wasHere,
    elsewhere,
    resumeHere,
    joinAsSomebodyElse,
    addLocalPlayer,
    chooseCharacter,
  } = table;
  /**
   * What is open over the table, and the gestures that open and shut it.
   *
   * Eight pieces of state and six ways to move them, none of which the
   * server has ever heard of — see `use-surfaces.ts` for why they are one
   * thing and why three of their setters are not in this list.
   */
  const {
    leftDrawer,
    rule,
    openAt,
    openRule,
    toggleDrawer,
    closeDrawer,
    openField,
    setInspectingCard,
    setConsoleOpen,
  } = surfaces;
  /**
   * Cards with a request out, drawn where they are and greyed until it lands.
   *
   * Taking and dropping are the two writes that move a card from one place to
   * another, and neither may be done optimistically. 12.1 gives what is lying
   * on an Obszar to whoever's move ends there, and two characters can be
   * standing on it — so the browser does not know it has the card until the
   * server says so. 5.5's drop is the same fact from the other end: where the
   * card lands is the Obszar the server thinks you are on.
   *
   * So the card does not move on the press. It greys, which says the ask is
   * out, and it moves when the answer arrives — the whole journey in one step
   * rather than a card that leaves and comes back. `equip` is the opposite
   * bargain on purpose: nobody can race you to your own Hełm, so that one moves
   * under the hand and is corrected by the next refresh.
   */
  const [asked, setAsked] = useState<readonly string[]>([]);
  /**
   * The same list, readable during an event rather than after the next render.
   *
   * One card, one ask: a second press on a card already out is dropped here and
   * not left to the server to refuse. State cannot answer that — two clicks
   * landing in one batch both read the same `asked` — so the ref is the
   * authority and the state is how it is drawn.
   */
  const outstanding = useRef<Set<string>>(new Set());
  /**
   * Asks about one card, while any number of other cards are being asked about.
   *
   * Deliberately per card and not a single flag. Two Przedmioty lying on one
   * Obszar are two independent questions — 5.4 may allow one and refuse the
   * other, and the answers are decided one at a time against the table as it
   * stands when each is decided — so pressing „weź" on the first must not close
   * the second. `busy` would have: it is the whole table's flag.
   *
   * Which is safe to do because the writes are ordered underneath: `change`
   * puts every change to one game through one chain in arrival order, and the
   * compare-and-swap on `games.revision` is what makes it correct when two
   * servers have two chains. So a second take is decided against a table that
   * already has the first card in the pack, and „nie uniesiesz" and „tej Karty
   * już tam nie ma" are answers the rules give rather than accidents of timing.
   */
  const askFor = useCallback(async (id: string, run: () => Promise<unknown>) => {
    if (outstanding.current.has(id)) return;
    outstanding.current.add(id);
    setAsked((was) => [...was, id]);
    try {
      await run();
    } finally {
      outstanding.current.delete(id);
      setAsked((was) => was.filter((one) => one !== id));
    }
  }, []);
  /**
   * A drawer opened for its own sake, rather than at a reference.
   *
   * `rule` is forgotten on the way in and on the way out, because it is the
   * destination of one click and stops being anybody's destination the moment
   * the drawer shuts. Left standing, the next plain Księga — the button, the K
   * — opened back at a rule somebody followed twenty minutes ago, remounted at
   * it and scrolled to it, with nothing on screen saying why it had not opened
   * where they left it.
   */
  const prefs = usePreferences();
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
  /**
   * When the console key was last obeyed, so a doubled press is not two answers.
   *
   * The key toggles, which means the second of a quick pair undoes the first
   * and leaves the console exactly where it started — the one outcome nobody
   * pressing it twice was asking for. Two ways to arrive there and both are
   * ordinary: holding the key down, and the double tap that a layout using `
   * as a dead key trains into your fingers.
   *
   * A window rather than a lock, because pressing it twice *slowly* is a real
   * thing to do — open the console, read a line, put it away. A third of a
   * second is longer than a stutter and far shorter than a decision.
   */
  const lastTick = useRef(0);
  useEffect(() => {
    if (!TESTING_POSSIBLE) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Holding a key is one press held, not a press per frame.
      if (event.repeat) return;
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
        /**
         * The key means "give me the console", so a minimised one grows rather
         * than closing.
         *
         * Shrunk to its bar it is technically open, and a toggle read that as
         * "already here, take it away" — which threw away the transcript for a
         * key somebody pressed to *see* it. Growing first costs nothing: with
         * nothing minimised `wakeConsole` does nothing and says so, and the
         * toggle behaves exactly as it did.
         */
        const now = Date.now();
        const doubled = now - lastTick.current < DOUBLE_TICK_MS;
        lastTick.current = now;
        if (doubled) return;
        const grew = wakeConsole();
        setConsoleOpen((was) => !was || grew);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `setConsoleOpen` is the same `useState` setter it always was, and so
    // stable; naming it is what the rule needs now that it arrives through
    // `useSurfaces` rather than being declared here.
  }, [setConsoleOpen]);
  const setTestMode = writeTestMode;
  const testing = TESTING_POSSIBLE && testMode;
  /** A seatless visitor who chose to watch rather than take a character over. */
  const [watching, setWatching] = useState(false);
  /**
   * Cards the player has waved past for now.
   *
   * 16.8 lets a card simply stay where it fell, and 12.1 gives until the end of
   * the turn to come back to it — so "not now" has to be a real answer, and it
   * is this device's business rather than the table's. Cleared when the turn
   * moves on, since the next character meets the same cards fresh.
   */
  const [waved, setWaved] = useState<string[]>([]);
  /**
   * The die that was just thrown, held until the player who threw it says go on.
   *
   * The one thing `post`'s reply is read for — see `Said` and `RollResult`. A
   * roll is the only act in the game the player has no part in: they press
   * „Rzuć kostką", the app throws, and by the time the table comes back the
   * Karta is settled and the kolejka has moved on. Without this the whole of it
   * was a number in the Dziennik and a Karta Postaci that had quietly changed.
   *
   * Here rather than under the sheet, because the sheet is gone by then: a
   * Karta that placed itself is out of the frame entirely and the next one is
   * already up, so a notice living inside the card's own panel would have
   * nowhere to stand.
   */
  const [rolled, setRolled] = useState<{
    cardId: string;
    face: number;
    did: string[];
  } | null>(null);
  /**
   * Keeps the lines a reply carried about a die, for the device that got one.
   *
   * The face itself is on the frame and reaches every device (see
   * `shownRoll`); what the frame does not carry is what the app *did* with it —
   * „Zaklęcie: KAMIEŃ FILOZOFICZNY" is the card a 1 turned out to be. That is
   * in the reply to the request that threw it and nowhere else, so the thrower
   * keeps it here and everybody else reads the marked row.
   *
   * Everything goes through here and most of it falls straight through: a
   * `wybor` answered, a Przedmiot taken, a Karta with no table — none of them
   * roll, so none of them have a `face`.
   */
  const showDie = useCallback((cardId: string, said: Said | null) => {
    if (!said || typeof said.face !== "number") return;
    setRolled({ cardId, face: said.face, did: said.did ?? [] });
  }, []);
  /** Whether the "choose again" modal was *asked* for (4.4). */
  const [reborn, setReborn] = useState(false);
  /**
   * Whether the picker was waved away by somebody who has a seat but no Postać.
   *
   * Its own state, and not `watching` above — that one is a *seatless* visitor
   * who never sat down. This is the other half: "I asked for the picker" and "I
   * dismissed the picker" are different questions, and `reborn` alone could not
   * answer both. The picker opens unasked for somebody with no Postać at all,
   * so `reborn` was already false while it was on screen and "oglądaj dalej"
   * turning it off again closed nothing — the gate re-opened it on the same
   * render. The button was there the whole time and did nothing.
   *
   * Cleared on picking, so waving it away once does not silence it for a death
   * three turns later.
   */
  const [pickerWavedOff, setPickerWavedOff] = useState(false);


  /**
   * The four questions asked before an irreversible act, and the dialog they
   * are asked in — see `use-asks.ts`.
   */
  const { ask, setAsk, askToUse, askToLeave, askToDrop, askToCast } = useAsks({
    game,
    seats,
    fieldCards,
    mySeatIndex,
    post,
    leave,
    askFor,
  });
  /**
   * Whether the turn's sheet has been folded away — anybody's, including your
   * own.
   *
   * It was a watcher's only, on the reasoning that hiding what the game is
   * waiting on is how a table stops. What makes it safe on your own turn is
   * `TurnFab`: it cannot be dismissed while the turn is yours, it says what is
   * owed, and ending the turn is behind it — so the way back is on the path of
   * every turn that ends.
   *
   * Cleared when the turn changes hands rather than when it becomes yours: you
   * fold it once because you want the board, and it should stay out of the way
   * until the game moves on.
   */
  const [folded, setFolded] = useState(false);
  /** Which seat is choosing a character; "auto" lets the app decide. */
  const [picking, setPicking] = useState<string | "auto" | null>("auto");


  const turnKey = game ? `${game.round}:${game.active_seat}` : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaved([]);
  }, [turnKey]);

  const myTurn = game !== null && mySeatIndex !== null && game.active_seat === mySeatIndex;
  // Unfolded whenever the turn changes hands: a new turn is a new thing to
  // look at, whoever it belongs to.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFolded(false);
  }, [turnKey]);

  /**
   * Arriving somewhere that owes Karty opens the Obszar, once.
   *
   * 10.1 makes a turn two things — "a) ruch b) spotkania i badanie Obszaru" —
   * and the second used to begin with a player hunting for a button. Landing on
   * a square that draws is not a moment with a decision in it: something is
   * going to be turned over, and the only question is what. So the window that
   * says what is here opens itself, with the count and the deal in it.
   *
   * Keyed on the Obszar and not on the turn, so it fires again for a character
   * a Karta moved (13.1 gives them a fresh badanie where they land) and does
   * not fire twice for the same one. Only for the seat whose turn it is: a
   * watcher gets the kolejka across the top and no window opening in their face.
   */
  const myField = seats.find((seat) => seat.seat_index === mySeatIndex)?.field_id ?? null;

  /**
   * Told when a Karta moves your figure — see `useMovedNotice`.
   *
   * The only outcome that happens *to* you and cannot be found out afterwards:
   * the Karta is gone, the Obszar under the figure is somewhere else, and the
   * next thing the app asks is about a square nobody chose to be on (16.8).
   *
   * Up here with the other top-level state rather than down beside the turn it
   * is about, because `body()` is a plain function and a hook called inside one
   * is a hook React cannot count.
   */
  const turnFrame = game ? top(game.turn_state) : null;
  useMovedNotice(
    turnFrame?.phase === "field" ? turnFrame.fieldId : null,
    myTurn,
    useCallback(
      (moved: { from: FieldId; to: FieldId }) =>
        setAsk({
          title: "Przeniesiono twoją Postać",
          body:
            `Z Obszaru: ${FIELDS.get(moved.from)?.name ?? moved.from}. ` +
            `Na Obszar: ${FIELDS.get(moved.to)?.name ?? moved.to}. ` +
            "Rozpatrzysz go tak, jakby twój ruch skończył się tam (16.8).",
          confirmLabel: "Rozumiem",
          telling: true,
          onConfirm: () => setAsk(null),
        }),
      [setAsk],
    ),
  );
  // Read here rather than from `turnState` below, which is past the early
  // returns a hook may not sit behind.
  const nowOnField = game ? top(game.turn_state) : null;
  const dealDone =
    nowOnField?.phase === "field" && nowOnField.draw <= 0 && nowOnField.drawn.length > 0;
  /** One badanie of one Obszar: the thing all of this is keyed on. */
  const hereKey = myTurn && myField ? `${turnKey}:${myField}` : null;
  /** Something to deal, or something already lying here to look at. */
  const hasBusiness =
    nowOnField?.phase === "field" && (nowOnField.draw > 0 || nowOnField.drawn.length > 0);
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hasBusiness || hereKey === null || openedFor.current === hereKey) return;
    openedFor.current = hereKey;
    openField(asFieldId(myField));
  }, [hasBusiness, hereKey, myField, openField]);

  /**
   * The deal is turned over and looked at before anything is resolved.
   *
   * Badanie Obszaru is one motion at a table with two halves: you deal the
   * Karty the square owes, and then everybody looks at what came up — all of
   * it, together, before the first one is picked up. The app did the first half
   * and jumped straight to a Wróg's sheet, so the only view of the whole deal
   * was the one nobody got, the moment in between.
   *
   * The window is already open — it is the one the deal was made in — so the
   * reveal is that window staying put until the player says go on. Until they
   * do, the sheet is held back (`sheetApplies`), which is also what stops the
   * two stacking on top of each other.
   *
   * It covers arriving at a square that owed nothing, too: three Karty left
   * lying on a Płaskowyż Mgieł are a deal somebody else made, and looking at
   * them before working through them is the same act.
   *
   * Once per badanie, so a player who opens the Obszar again later — to end the
   * turn, to read the square — is not shown a reveal they have already had.
   */
  const [dealSeen, setDealSeen] = useState<string | null>(null);
  /**
   * Nothing on this Obszar has been dealt with yet.
   *
   * The reveal used to hang on `dealSeen` alone, which is a piece of this
   * component's state: it survives no reload, and there is no way back into a
   * moment the app has forgotten it was in. A player who refreshed mid-badanie
   * got the sheet and never the deal.
   *
   * So the moment is *derived* from the turn, and the client flag only ends it
   * early. "The Karty are down and none of them has been touched" is what being
   * at the start of a badanie means, and it is on the frame, so it comes back
   * with the page.
   */
  const nothingSettledHere =
    nowOnField?.phase === "field" &&
    (nowOnField.resolved?.length ?? 0) === 0 &&
    (nowOnField.fought?.length ?? 0) === 0 &&
    (nowOnField.beaten?.length ?? 0) === 0;
  /**
   * Which deal this is — the Karty themselves, not the turn and the square.
   *
   * Keyed on `${turn}:${field}` first, which is the same key twice for two
   * different deals: a character who leaves an Obszar and comes back inside one
   * turn — routine while testing, where the console teleports back and forth —
   * gets a fresh badanie under a key already marked as looked at, and the
   * reveal never appears. The Karty in front of you are what makes it a
   * different deal, so they are the key.
   *
   * By `ref` where there is one, because two Nobbiny are two Karty and the same
   * name: the slice off the pile is what tells one copy from the other.
   */
  const dealKey =
    nowOnField?.phase === "field" && nowOnField.drawn.length > 0
      ? nowOnField.drawn.map((card) => card.ref ?? card.cardId).join("|")
      : null;
  const revealing =
    dealKey !== null && dealDone === true && nothingSettledHere && dealSeen !== dealKey;


  /**
   * Everything below, under one provider.
   *
   * `Table` answers with one of five screens and they all quote rule numbers,
   * so `WithRules` has to be able to find the opener from any of them. An IIFE
   * rather than five providers, because five is five chances for the next
   * screen to be the one that forgot.
   */
  // `WithRules` draws plain text when there is nobody to open a rule, so the
  // setting is enforced by withholding the opener rather than by every caller
  // remembering to ask.
  return (
    <OpenRule.Provider value={prefs.ruleRefs ? openRule : null}>{body()}</OpenRule.Provider>
  );

  function body() {
  if (error && !game) {
    return <Centered>{<span className="text-vermilion">{error}</span>}</Centered>;
  }
  if (!game) return <Centered>Wczytuję stół…</Centered>;

  /**
   * Before either door: this browser has been here before.
   *
   * In front of both gates rather than inside one of them, because it is the
   * same question whether the game has started or not — and the answer changes
   * which gate you are even looking at. Watching is unaffected: `wasHere` is
   * only ever set for a window holding no claim at all.
   */
  if (wasHere) {
    return (
      <ReturnGate
        code={game.join_code}
        name={wasHere.name}
        seatIndex={wasHere.seatIndex}
        busy={busy}
        onResume={resumeHere}
        onSomebodyElse={joinAsSomebodyElse}
      />
    );
  }

  /**
   * The turn, read once — see `turn-view.ts` for what each of these is.
   *
   * Destructured back under the names the blocks below have always used, so
   * moving the readings out did not mean touching the JSX that reads them.
   */
  const view = turnViewOf({
    game,
    seats,
    fieldCards,
    users,
    me,
    mySeatIndex,
    moved,
    rolled,
    revealing,
    folded,
  });
  const {
    mySeat,
    amHost,
    playing,
    eqMode,
  } = view;
  const driverOf = (seat: Seat | null | undefined) => driverOfSeat(users, seat);

  /**
   * A chair as the poczekalnia draws it, with this device's own pick laid over.
   *
   * The Karta taken client-first is still the seat's (`taking`), and the flag
   * that used to be reset beside it is not: changing your mind un-readies the
   * *person*, which the server writes and the next poll brings back. Laying a
   * `ready: false` over somebody else's row here would have been this device
   * guessing at a fact about another player.
   */
  const lobbySeat = (seat: Seat) =>
    asLobbySeat(
      taking[seat.id] ? { ...seat, character_id: taking[seat.id] } : seat,
      driverOf(seat),
    );

  const pickingFor = whoIsPicking(picking, seats, mySeat, amHost && game.mode === "companion");

  /**
   * The screen, as one object — see `the-table.ts` for why it is a context and
   * what each layer of it is. Built here because this is where every hook is.
   */
  const screen: TableScreenValue = {
    ...table,
    game,
    ...surfaces,
    ...view,
    code,
    asked,
    askFor,
    myTurn,
    revealing,
    dealKey,
    setDealSeen,
    setRolled,
    showDie,
    reborn,
    setReborn,
    pickerWavedOff,
    setPickerWavedOff,
    ask,
    setAsk,
    folded,
    setFolded,
    waved,
    setWaved,
    testing,
    testMode,
    setTestMode,
    askToUse,
    askToLeave,
    askToDrop,
    askToCast,
  };


  /**
   * Księga Tolimana, built once and opened from either surface.
   *
   * It used to be constructed inside the playing branch, which is why the
   * lobby's own "Księga Tolimana" did nothing at all: the button set
   * `leftDrawer` and nothing in the poczekalnia read it. Every card in the box
   * is exactly as worth reading while you are choosing a Postać as it is
   * mid-game — more so, since choosing is the one moment you are comparing
   * twenty-seven of them — so it is the same drawer rather than a second one.
   */
  const library =
    leftDrawer === "ksiega" ? (
      <CardLibrary
        key={rule ? `rule-${rule.nth}` : "cards"}
        openRule={rule?.id ?? null}
        openShelf={rule?.shelf ?? null}
        endlessStock={game.endless_stock}
        eqMode={eqMode}
        nature={asNature(mySeat?.nature)}
        onInspect={setInspectingCard}
        // "walcz" and the Obszary chips became `fight` and `go` in the console;
        // taking a card stayed, because this shelf is where somebody already is
        // when they want one, with the picture in front of them.
        {...(testing && mySeatIndex !== null
          ? { onGrant: (cardId: string) => post("debug", { action: "grant", cardId }) }
          : {})}
        onClose={closeDrawer}
      />
    ) : null;

  /**
   * Everything below the gates, under the one provider.
   *
   * The poczekalnia and the table both draw the overlays, so both sit under
   * it; the two gates before them do not, and are returned above. An arrow
   * rather than a hoisted function, because a hoisted one does not inherit
   * the narrowing of `game` from the early returns above.
   */
  const room = () => {
    if (!playing) {
      // No name, no seat, no lobby. Everyone joins on their own device, so a
      // visitor standing in the lobby without a seat was never a state worth
      // having — it just deferred the one question the table needs answered.
      if (mySeatIndex === null) {
        return (
          <>
            <Toasts notices={notices} onDismiss={dismissNotice} />
            <JoinGate
              code={game.join_code}
              seats={seats.map((seat) => lobbySeat(seat))}
              busy={busy}
              onJoin={join}
              notice={
                elsewhere ? (
                  <SecondTabNotice busy={busy} onSomebodyElse={joinAsSomebodyElse} />
                ) : null
              }
            />
          </>
        );
      }

      return (
        <>
          <Overlays />
          <Toasts notices={notices} onDismiss={dismissNotice} />
          <Lobby
            code={game.join_code}
            mode={game.mode}
            seats={seats.map((seat) => lobbySeat(seat))}
            users={users}
            mySeatIndex={mySeatIndex}
            /* The same feed the table gets, in the room where the lines about
               arriving and sitting down are actually written. */
            journal={<Journal code={code} revision={game.revision} covers="kolumnę" />}
            /* The house rules, where the table can talk about them. Each switch
               posts only the setting it moved — see the route. */
            settings={
              // The host's, and only the host's: one of these cannot be taken
              // back, and a one-way switch six people can reach is one that gets
              // pressed by whoever misreads it first. Everybody else sees what
              // the table has settled on, which is the part that matters to them.
              <TableSettings
                eqMode={eqMode}
                endlessStock={game.endless_stock}
                started={game.status === "playing"}
                canChange={amHost}
                onExplain={() => openAt("wariant", null)}
                onEqMode={(eqMode) => setHouseRule({ eq_mode: eqMode })}
                onEndlessStock={(on) => setHouseRule({ endless_stock: on })}
                /* Absent until the engine half lands, which is what keeps the
                   group off the panel rather than on it and refused. */
                trophyMode={game.trophy_mode}
                onTrophyMode={(mode) => setHouseRule({ trophy_mode: mode })}
              />
            }
            characters={CHARACTERS}
            pickingFor={pickingFor ? lobbySeat(pickingFor) : null}
            busy={busy}
            onAddLocal={addLocalPlayer}
            onPickFor={(seat) => setPicking(seat ? seat.id : null)}
            pendingCharacterId={pendingCharacter}
            onChooseCharacter={async (seat, characterId) => {
              await chooseCharacter(seat.id, characterId);
              setPicking("auto");
            }}
            // Both of these act on a person. They sent `seatId`, which neither
            // route reads — and neither failed, because both fall back to the
            // caller when nobody is named. The same bug as the roster's pair, in
            // a second place, found by the contract rather than by looking.
            onRemove={(seat) => seat.driverId && post("leave", { userId: seat.driverId })}
            onMakeHost={(seat) => seat.driverId && post("host", { userId: seat.driverId })}
            onReady={(ready) => post("seat", { ready })}
            onRename={(name) => post("seat", { name })}
            onLeave={askToLeave}
            onDeal={() => post("character", { deal: true })}
            isHost={amHost}
            // The host is somebody, so "gone" is something they are rather than
            // something their chair is: no host at all, or one who has gone quiet.
            hostAway={!users.some((one) => one.isHost && !one.away)}
            onStart={() => post("start", {})}
            onLibrary={() => toggleDrawer("ksiega")}
            library={library}
          />
        </>
      );
    }

    // Somebody who opened a game already in progress. They cannot join — the
    // characters were dealt at setup — but they can pick up one nobody is behind,
    // which is exactly what the app does with a player who leaves or closes their
    // tab. Offered up front rather than buried in a card somebody has to expand.
    if (mySeatIndex === null && !watching) {
      // A Postać standing there with nobody behind it, or with somebody who has
      // gone quiet. Both are pickable — the people in the room settle which —
      // and the difference between them is worth saying out loud, because one is
      // a decision somebody made and the other is a phone that went to sleep.
      const free = seats
        .filter((seat) => seat.character_id && !seat.eliminated)
        .filter((seat) => seat.driver_id === null || seat.away)
        .map((seat) => ({
          seatId: seat.id,
          playerName: seat.player_name,
          characterName:
            CHARACTERS.find((character) => character.id === seat.character_id)?.name ?? "?",
          why: seat.driver_id === null ? "nikt nią nie gra" : "gracz się rozłączył",
        }));
      return (
        <>
          <Toasts notices={notices} onDismiss={dismissNotice} />
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

    return <TableScreen library={library} />;
  };
  return <TheTable.Provider value={screen}>{room()}</TheTable.Provider>;
  }
}

/**
 * A chair and whoever is in it, folded into the one thing the poczekalnia draws.
 *
 * The driver is passed in rather than looked up, because this is a pure
 * function of two rows and the lookup is the caller's — which is also the whole
 * of what changed: four of these fields used to be columns on the seat, and
 * every one of them is a fact about a person.
 */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-muted">
      {children}
    </main>
  );
}
