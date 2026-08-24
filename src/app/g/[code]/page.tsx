"use client";

import { use, useCallback, useEffect, useState } from "react";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";
import { FIELDS } from "@/lib/engine/board";
import { fieldWithText } from "@/lib/engine/fieldText";
import { abilitiesOf, skipsRollAt, type Ability } from "@/lib/engine/abilities";
import { abilitiesOfCharacter, notesForCharacter } from "@/lib/engine/characters";
import { characterImageUrl } from "@/lib/engine/cardImages";
import Image from "next/image";
import type { TurnPhase } from "@/lib/engine/turn";
import { TurnPanel } from "./turn-panel";
import { CardView, type ShownCard } from "./card-view";
import { SeatActions } from "./seat-actions";
import { SpellHand } from "./spell-hand";
import { CardBack, CardDetail, CardTile, type TileCard } from "./card-tile";
import { CardLibrary } from "./card-library";
import { Lobby, type LobbySeat } from "./lobby";
import { OtherPlayers, TableLayout, type PublicSeat } from "./table-layout";
import { momentOf } from "@/lib/engine/spells";
import { BoardMap } from "./board-map";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import type { EventCard, Item, Spell } from "@/data/types";

const CHARACTERS = characters as Character[];
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
  id: string;
  cardId: string;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
}

interface Seat {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: string | null;
  field_id: string | null;
  miecz_own: number;
  magia_own: number;
  /** Own points plus everything carried (1.5, 2.5), computed server-side. */
  miecz_total: number;
  magia_total: number;
  zycie: number;
  zloto: number;
  nature: string | null;
  turns_lost: number;
  eliminated: boolean;
  /** Set when the player behind this seat walked away; the character stays. */
  abandoned_at: string | null;
  /** Device has not checked in recently — a closed tab, not a decision. */
  away: boolean;
  ready: boolean;
  is_host: boolean;
  holdings: Held[];
  /** Cards this viewer is not allowed to see the faces of (9.3). */
  hidden_count: number;
}

interface FieldCard {
  fieldId: string;
  cardId: string;
}

interface Game {
  id: string;
  join_code: string;
  mode: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
  die_source: string;
  turn_state: TurnPhase;
}

/** The shared table screen: the whole game state everyone is allowed to see. */
export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  /** Cards lying face up on the board (16.8) — public to every seat. */
  const [fieldCards, setFieldCards] = useState<FieldCard[]>([]);
  /** A field the player tapped on the map, to read what it says. */
  const [inspecting, setInspecting] = useState<string | null>(null);
  /** What the app just decided by itself, shown until the next action. */
  const [notice, setNotice] = useState<string | null>(null);
  /** A card somebody tapped, shown large with its full text. */
  const [inspectingCard, setInspectingCard] = useState<TileCard | null>(null);
  /** The reference drawer of every card in the box. */
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** Which seat is choosing a character; "auto" lets the app decide. */
  const [picking, setPicking] = useState<string | "auto" | null>("auto");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const stored = localStorage.getItem(`mm:${code}`);
    const query = stored ? `?token=${encodeURIComponent(stored)}` : "";
    const response = await fetch(`/api/games/${code}${query}`);
    if (!response.ok) return setError((await response.json()).error ?? "Błąd");
    const data = await response.json();
    setGame(data.game);
    setSeats(data.seats);
    setFieldCards(data.fieldCards ?? []);
    setMySeatIndex(data.mySeatIndex);
  }, [code]);

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
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [code, refresh]);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        // Read the token at call time rather than holding it in state: it only
        // exists in localStorage, which is unavailable while this renders on
        // the server, and mirroring it into state meant setting state inside an
        // effect for no gain.
        const response = await fetch(`/api/games/${code}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, token: localStorage.getItem(`mm:${code}`) }),
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
        body: JSON.stringify({ token: localStorage.getItem(`mm:${code}`) }),
      });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      // Forget the seat locally too, or this browser keeps showing the
      // controls for a seat it no longer holds.
      localStorage.removeItem(`mm:${code}`);
      setMySeatIndex(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Claims a seat for THIS device. Only offered when it holds none — joining
   * twice from one browser used to overwrite its identity.
   *
   * The name arrives from a field in the page. A native `prompt` blocked
   * everything behind it, could not be styled, and on a phone interrupts the
   * game with a system alert.
   */
  async function join(name: string) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() || null }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    localStorage.setItem(`mm:${code}`, data.token);
    refresh();
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
  async function claimSeat(seatId: string) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatId }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    localStorage.setItem(`mm:${code}`, data.token);
    refresh();
  }

  async function addLocalPlayer(name: string) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() || null }),
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
  // otherwise: this device's own seat first, then any seat with no device of
  // its own, so a locally-added player is not stranded without one. Once a
  // player picks a seat explicitly — or closes the picker — that choice wins.
  const pickingFor =
    picking === "auto"
      ? mySeat && !mySeat.character_id
        ? mySeat
        : (seats.find((seat) => !seat.character_id) ?? null)
      : (seats.find((seat) => seat.id === picking) ?? null);

  // Cards in play this turn. A fight keeps the stack it interrupted, so the
  // panel does not empty out mid-combat.
  const shown: ShownCard[] = (() => {
    const state = game.turn_state;
    const drawn =
      state?.phase === "pole"
        ? state.drawn
        : state?.phase === "walka"
          ? state.fight.drawn
          : [];
    return drawn.map((entry) => ({
      cardId: entry.cardId,
      cardClass: entry.cardClass,
      ref: entry.ref,
      name: EVENTS.find((c) => c.id === entry.cardId)?.name ?? entry.cardId,
    }));
  })();
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const taken = new Set(seats.map((seat) => seat.character_id).filter(Boolean));
  const playing = game.status === "playing";

  const overlays = (
    <>
      {inspectingCard && (
        <CardDetail card={inspectingCard} onClose={() => setInspectingCard(null)} />
      )}
      {libraryOpen && <CardLibrary onClose={() => setLibraryOpen(false)} />}
    </>
  );

  if (!playing) {
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
          seats={seats.map(asLobbySeat)}
          mySeatIndex={mySeatIndex}
          characters={CHARACTERS}
          taken={taken}
          pickingFor={pickingFor ? asLobbySeat(pickingFor) : null}
          busy={busy}
          onMode={(mode) => post("mode", { mode })}
          onAddLocal={addLocalPlayer}
          onJoin={join}
          onPickFor={(seat) => setPicking(seat ? seat.id : null)}
          onChooseCharacter={(seat, characterId) => {
            post("character", { characterId, seatId: seat.id });
            setPicking("auto");
          }}
          onRemove={(seat) => post("leave", { seatId: seat.id })}
          onMakeHost={(seat) => post("host", { seatId: seat.id })}
          onReady={(ready) => post("seat", { ready })}
          onRename={(name) => post("seat", { name })}
          isHost={mySeat?.is_host === true}
          hostAway={seats.find((seat) => seat.is_host)?.abandoned_at !== null}
          onStart={() => post("start", {})}
          onLibrary={() => setLibraryOpen(true)}
        />
      </>
    );
  }

  const mine = mySeat;
  const others = seats.filter((seat) => seat.id !== mine?.id && seat.character_id);

  return (
    <>
      {overlays}
      <TableLayout
        header={
          <>
            <div className="flex items-baseline gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-lg text-ochre">
                Magiczny Miecz
              </h1>
              <span className="text-xs text-muted">
                Tura {game.turn} · {active ? (active.player_name ?? "—") : "—"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="tnum tracking-[0.2em] text-muted">{game.join_code}</span>
              <button onClick={() => setLibraryOpen(true)} className="text-ochre/80 hover:text-ochre">
                Karty
              </button>
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
          <BoardMap
            seats={seats.map((seat) => ({
              id: seat.id,
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
              fieldId: seat.field_id,
              eliminated: seat.eliminated,
            }))}
            activeSeatIndex={game.active_seat}
            cardsOnFields={fieldCards.reduce<Record<string, number>>((count, card) => {
              count[card.fieldId] = (count[card.fieldId] ?? 0) + 1;
              return count;
            }, {})}
            highlight={
              game.turn_state.phase === "ruch"
                ? game.turn_state.options.map((option) => option.fieldId)
                : []
            }
            onPick={(fieldId) => setInspecting(fieldId)}
          />
        }
        right={
          <div className="flex flex-col gap-3">
            {error && <p className="text-sm text-vermilion">{error}</p>}
            {notice && !error && (
              <p className="rounded border border-ochre/30 bg-panel/60 px-3 py-2 text-sm text-ochre">
                {notice}
              </p>
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

            {inspecting && (
              <FieldNote fieldId={inspecting} pinned onClear={() => setInspecting(null)} />
            )}

            {active && (
              <TurnPanel
                phase={game.turn_state}
                isMine={
                  (mySeatIndex !== null && active.seat_index === mySeatIndex) || isTableScreen
                }
                actingForOther={isTableScreen && active.seat_index !== mySeatIndex}
                playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
                fieldName={
                  active.field_id ? (FIELD_NAMES.get(active.field_id) ?? active.field_id) : "—"
                }
                fieldText={
                  active.field_id ? (fieldWithText(active.field_id)?.text ?? null) : null
                }
                fieldId={active.field_id}
                rollSkippedBy={rollSkippedBy(active)}
                dieSource={game.die_source}
                mode={game.mode}
                busy={busy}
                onAction={(body) => post("turn", body)}
                onSuggestion={(stat, delta, reason) =>
                  post("adjust", { seatId: active.id, stat, delta, reason })
                }
                onTake={(cardId) =>
                  post("holdings", { action: "take", seatId: active.id, cardId })
                }
              />
            )}

            <CardView cards={shown} />

            {active && (mySeatIndex === active.seat_index || isTableScreen) && (
              <SeatActions
                busy={busy}
                nature={active.nature}
                canFightBeast={active.field_id === "zamek-bestii"}
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
                isMine
                onAdjust={(stat, delta) => post("adjust", { seatId: mine.id, stat, delta })}
                onDrop={(holdingId) => post("holdings", { action: "drop", holdingId })}
                onTrade={() => post("holdings", { action: "trade", seatId: mine.id })}
                onInspect={setInspectingCard}
              />
            )}

            {mine && (
              <SpellHand
                spells={mine.holdings
                  .filter((held) => held.kind === "spell")
                  .map((held) => ({ holdingId: held.id, cardId: held.cardId }))}
                moment={momentOf(game.turn_state.phase, game.turn_state.phase !== "rzut")}
                opponents={others.map((seat) => ({
                  seatIndex: seat.seat_index,
                  name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
                }))}
                busy={busy}
                onInspect={setInspectingCard}
                onCast={(holdingId, targetSeat) =>
                  post("holdings", {
                    action: "cast",
                    seatId: mine.id,
                    holdingId,
                    ...(targetSeat !== undefined ? { targetSeat } : {}),
                  })
                }
              />
            )}

            <OtherPlayers
              seats={others.map(asPublicSeat)}
              activeSeatIndex={game.active_seat}
              characters={CHARACTERS}
              onInspect={setInspectingCard}
              // Only offered to a device with no seat of its own; sitting at two
              // at once is the bug that stranded a player early on.
              onClaim={mySeatIndex === null ? claimSeat : undefined}
              onKick={
                mySeat?.is_host
                  ? (seat) => post("leave", { seatId: seat.id })
                  : undefined
              }
            />
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
  onDrop,
  onTrade,
  onInspect,
}: {
  seat: Seat;
  isMine: boolean;
  canAct: boolean;
  trophies: number;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onInspect: (card: TileCard) => void;
}) {
  const shown = seat.holdings.filter((held) => held.kind !== "spell");
  if (shown.length === 0 && seat.hidden_count === 0) return null;

  return (
    <div className="mt-3 border-t border-edge pt-3">
      {/* Cards, as cards. A player at a table recognises their Miecz by its
          picture long before they read the word, and the ability text that used
          to sit under every line now lives one tap away in the detail view. */}
      <div className="flex flex-wrap gap-2">
        {/* Your own Zaklęcia are not repeated here: they have their own panel
            above, face up and with the cast controls on them. What belongs on a
            seat card is what the *table* can see. */}
        {seat.holdings
          .filter((held) => held.kind !== "spell")
          .map((held) => (
          <CardTile
            key={held.id}
            card={tileFor(held)}
            badge={held.kind === "trophy" ? "trofeum" : undefined}
            dimmed={held.kind === "trophy"}
            onClick={() => onInspect(tileFor(held))}
          >
            {canAct && (
              <button
                onClick={() => onDrop(held.id)}
                className="text-[9px] text-muted underline hover:text-vermilion"
              >
                odrzuć
              </button>
            )}
          </CardTile>
          ))}
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

function tileFor(held: Held): TileCard {
  return {
    cardId: held.cardId,
    name: CARD_NAMES.get(held.cardId) ?? held.cardId,
    text: CARD_TEXTS.get(held.cardId),
    kindLabel: KIND_LABEL[held.kind],
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
  isMine,
  onAdjust,
  onDrop,
  onTrade,
  onInspect,
}: {
  seat: Seat;
  active: boolean;
  canAdjust: boolean;
  isMine: boolean;
  onAdjust: (stat: string, delta: number) => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onInspect: (card: TileCard) => void;
}) {
  const character = CHARACTERS.find((c) => c.id === seat.character_id);
  const trophies = seat.holdings.filter((h) => h.kind === "trophy");
  return (
    <article
      className={`rounded-lg border bg-panel p-4 transition ${
        active ? "border-ochre shadow-[0_0_0_1px_var(--color-ochre)]" : "border-edge"
      }`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
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
        {seat.turns_lost > 0 && (
          <span className="text-[10px] uppercase text-vermilion">
            traci {seat.turns_lost}
          </span>
        )}
      </header>

      {character ? (
        <>
          <div className="mb-3 flex items-center gap-3">
            {/* The character card itself, small. It carries the abilities,
                which no amount of stat display replaces — half of what a
                character can do is prose on this card. */}
            {characterImageUrl(character.id) && (
              <Image
                src={characterImageUrl(character.id)!}
                alt={character.name}
                width={64}
                height={92}
                className="h-auto w-16 shrink-0 rounded border border-edge"
                unoptimized
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm text-ochre">{character.name}</p>
              <p className="text-[10px] text-muted">
                {seat.nature ?? "natura nieustalona"}
              </p>
            </div>
          </div>
          <dl className="tnum grid grid-cols-4 gap-2 text-center text-sm">
            <Stat
              label="Miecz"
              value={seat.miecz_own}
              total={seat.miecz_total}
              tone="text-miecz"
              stat="miecz"
              canAdjust={canAdjust}
              onAdjust={onAdjust}
            />
            <Stat
              label="Magia"
              value={seat.magia_own}
              total={seat.magia_total}
              tone="text-magia"
              stat="magia"
              canAdjust={canAdjust}
              onAdjust={onAdjust}
            />
            <Stat label="Życie" value={seat.zycie} tone="text-zycie" stat="zycie" canAdjust={canAdjust} onAdjust={onAdjust} />
            <Stat label="Złoto" value={seat.zloto} tone="text-zloto" stat="zloto" canAdjust={canAdjust} onAdjust={onAdjust} />
          </dl>

          <Hand
            seat={seat}
            isMine={isMine}
            canAct={canAdjust}
            trophies={trophies.length}
            onDrop={onDrop}
            onTrade={onTrade}
            onInspect={onInspect}
          />
          <p className="mt-3 text-xs text-muted">
            {seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—"}
          </p>
          {character.abilities.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted">
                Zdolności ({character.abilities.length})
                {abilitiesOfCharacter(seat.character_id).length > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-verdigris/80">
                    {abilitiesOfCharacter(seat.character_id).map(describeAbility).join(" · ")}
                  </span>
                )}
              </summary>
              {/* Which of them the app is watching for, and which the player has
                  to remember. A Charakterystyka overrides the general rules
                  (8.2), so a power nobody applies is a rule quietly dropped. */}
              {notesForCharacter(seat.character_id).length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-ochre/40 pl-2 text-[10px] leading-snug text-ochre/80">
                  {notesForCharacter(seat.character_id).map((note) => (
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
function Stat({
  label,
  value,
  total,
  tone,
  stat,
  canAdjust,
  onAdjust,
}: {
  label: string;
  value: number;
  /** Own points plus what is carried. Shown only when the two differ. */
  total?: number;
  tone: string;
  stat: string;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  return (
    <div className="group">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-xl font-medium ${tone}`}>
        {/* The +/- move OWN points, which are what the rules floor at the
            starting value (1.3, 2.3). The total is derived from the cards on
            the table and is not editable — correcting it means changing what is
            held, not typing a different number. */}
        {total !== undefined && total !== value ? (
          <>
            {total}
            <span className="ml-1 text-[11px] text-muted">({value})</span>
          </>
        ) : (
          value
        )}
      </dd>
      {canAdjust && (
        // Always visible rather than revealed on hover. Phones are the primary
        // device at a table and have no hover, so a hover-gated override is an
        // override that does not exist for most of the people using it.
        <div className="mt-1 flex justify-center gap-1">
          <button
            onClick={() => onAdjust(stat, -1)}
            className="h-5 w-5 rounded border border-edge text-[11px] leading-none text-muted hover:border-vermilion hover:text-ink"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(stat, 1)}
            className="h-5 w-5 rounded border border-edge text-[11px] leading-none text-muted hover:border-verdigris hover:text-ink"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What the field under the pointer says.
 *
 * The map can only ever show a field's name, and half the board's rules are
 * printed on the fields themselves — so tapping one has to produce the text, or
 * the map would send players back to squinting at the physical board for
 * something the app already knows.
 */
function FieldNote({
  fieldId,
  pinned,
  onClear,
}: {
  fieldId: string | null;
  pinned: boolean;
  onClear: () => void;
}) {
  const field = fieldId ? fieldWithText(fieldId) : null;
  if (!field) return null;
  return (
    <div className="w-full rounded-lg border border-edge/60 bg-panel/50 p-4 lg:max-w-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ochre">{field.name}</h3>
        {pinned && (
          <button onClick={onClear} className="text-[11px] text-muted hover:text-ink">
            wróć do pola gracza
          </button>
        )}
      </div>
      {field.draw ? (
        <p className="mb-2 text-[11px] uppercase tracking-wide text-verdigris">
          Wyciągnij {field.draw} {field.draw === 1 ? "kartę" : "karty"}
        </p>
      ) : null}
      <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
        {field.text ?? "Brak przepisanego tekstu dla tego Obszaru."}
      </p>
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
function describeResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const data = result as {
    dice?: number[];
    magia?: number;
    outcome?: string;
    spell?: string;
    effect?: string;
  };
  // A spell has to be announced loudly: 9.6 reaches its victim anywhere on the
  // board, so the person it lands on may not be looking at this turn at all.
  if (data.spell) return `Rzucono Zaklęcie: ${data.spell}. ${data.effect ?? ""}`.trim();
  if (!Array.isArray(data.dice) || typeof data.magia !== "number") return null;
  const total = data.dice.reduce((sum, die) => sum + die, 0);
  const verdict =
    data.outcome === "udana" ? "przeprawa udana" : "porażka — tracisz 1 Życie";
  return `Trzęsawiska: ${data.dice.join(" + ")} = ${total} przeciw Magii ${data.magia} — ${verdict}.`;
}


function describeAbility(ability: Ability): string {
  switch (ability.kind) {
    case "punkty": {
      const parts = [];
      if (ability.miecz) parts.push(`+${ability.miecz} Miecza`);
      if (ability.magia) parts.push(`+${ability.magia} Magii`);
      return parts.join(", ");
    }
    case "oslona":
      return `osłona przy przegranej (rzut ≤ ${ability.upTo})`;
    case "bezpieczny": {
      const where = fieldNames(ability.fields);
      if (ability.from === "rzut") return `bez rzutu: ${where}`;
      if (ability.from === "zycie") return `bez straty Życia: ${where}`;
      return `bez straty Przedmiotu: ${where}`;
    }
    case "ucieczka":
      return `ucieczka przed Wrogiem: ${fieldNames(ability.fields)}`;
    case "udzwig":
      return ability.items === "bez-limitu"
        ? "niesie dowolną liczbę Przedmiotów"
        : `niesie +${ability.items} Przedmiotów`;
    case "ruch-bonus":
      return ability.min === ability.max
        ? `+${ability.max} do ruchu`
        : `+${ability.min}–${ability.max} do ruchu`;
    case "magia-do-miecza":
      return "w walce dodajesz Magię do Miecza";
    case "ginie-zamiast-ciebie":
      return ability.onRollUpTo
        ? `ginie zamiast ciebie (rzut ≤ ${ability.onRollUpTo})`
        : "ginie zamiast ciebie";
    case "wymagany":
      return ability.place === "most" ? "wstęp na Kamienny Most" : "wstęp do Zamku Bestii";
    case "bez-oplaty":
      return `bez opłaty: ${ability.fields.map(fieldName).filter((n, i, all) => all.indexOf(n) === i).join(", ")}`;
    case "zakazane":
      return `nie możesz używać: ${ability.cardIds.map((id) => CARD_NAMES.get(id) ?? id).join(", ")}`;
    case "przeprawa-kostki":
      return `Trzęsawiska na ${ability.dice} kostkę`;
    case "przeprawa-wszedzie":
      return ability.obstacle === "trzesawiska"
        ? "przeprawa przez Trzęsawiska w dowolnym miejscu"
        : "przeprawa przez Lodowy Las w dowolnym miejscu";
    case "uzdrowienie":
      return `do ${ability.upTo} Życia w: ${fieldName(ability.field)}`;
    case "walczy-za-ciebie":
      return `walczy za ciebie (Miecz ${ability.miecz}, Magia ${ability.magia})`;
    case "niedostepny":
      return "nie do zdobycia w Dolnym Kręgu";
    case "modyfikator-rzutu": {
      const sign = ability.dowolnyZnak
        ? `±${Math.abs(ability.delta)}`
        : `${ability.delta > 0 ? "+" : "−"}${Math.abs(ability.delta)}`;
      const where =
        ability.gdzie.na === "walke"
          ? ability.gdzie.rodzaj === "magiczna"
            ? "w walce magicznej"
            : "w walce zwykłej"
          : `na: ${ability.gdzie.fields.map(fieldName).join(", ")}`;
      return `${sign} do rzutu ${where}${ability.jednorazowy ? " (raz)" : ""}`;
    }
    case "zaklecia-ponad-limit":
      return `+${ability.count} Zaklęcie ponad limit (2.6)`;
  }
}

function fieldName(fieldId: string): string {
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/**
 * Field names for a list, without saying "Urwisko, Urwisko".
 *
 * Six places on the board are printed twice and carry suffixed ids, and a card
 * that names one almost always names both — so the ids are right and the label
 * is what needs to collapse.
 */
function fieldNames(fieldIds: readonly string[]): string {
  return [...new Set(fieldIds.map(fieldName))].join(", ");
}

/**
 * Which held card, if any, lets this character walk past the field's die roll.
 *
 * Returns the card's name rather than a boolean, because "you may skip this"
 * is much less useful to a player than "your Przewodnik lets you skip this" —
 * the second can be checked against the card lying on the table.
 */
function rollSkippedBy(seat: Seat): string | null {
  if (!seat.field_id) return null;
  for (const held of seat.holdings) {
    if (skipsRollAt(abilitiesOf(held.cardId), seat.field_id)) {
      return CARD_NAMES.get(held.cardId) ?? held.cardId;
    }
  }
  return null;
}

/**
 * Leaving, confirmed by a second click rather than a browser dialog.
 *
 * It says what actually happens, which is much less than it used to: the
 * character stays in the game exactly as it is and somebody can pick it up
 * again. Only this device stops speaking for it.
 */
function LeaveButton({
  playing,
  busy,
  onLeave,
}: {
  playing: boolean;
  busy: boolean;
  onLeave: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} className="text-muted hover:text-vermilion">
        Opuść stół
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-vermilion">
        {playing ? "Postać zostanie w grze bez gracza — na pewno?" : "Na pewno?"}
      </span>
      <button
        onClick={onLeave}
        disabled={busy}
        className="rounded border border-vermilion/60 px-1.5 text-vermilion disabled:opacity-50"
      >
        tak
      </button>
      <button onClick={() => setArmed(false)} className="text-muted hover:text-ink">
        nie
      </button>
    </span>
  );
}
