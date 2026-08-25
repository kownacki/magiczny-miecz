"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { cardImageUrl } from "@/lib/engine/cardImages";
import { combatValueOf } from "@/lib/engine/cards";
import { kindForCard } from "@/lib/engine/holdings";
import { scriptFor, describeDisposition, type Effect } from "@/lib/engine/cardScript";
import { isSettled } from "@/lib/engine/resolve";
import { coverageOf, manualNote, NOT_HANDLED } from "@/lib/engine/coverage";
import { FIELDS, ringOf, type FieldId } from "@/lib/engine/board";
import { FightControls } from "./turn-panel";
import type { Fight } from "@/lib/engine/turn";

const EVENTS = events as EventCard[];

export interface DrawnEntry {
  cardId: string;
  cardClass: string;
}

/**
 * The card you just turned over.
 *
 * Drawing is the moment the game happens to you, and it used to happen in a
 * column of small print beside the board: the card's picture on the right, its
 * name and buttons in the turn panel, the two never quite next to each other.
 * So it is a modal — the card at a size you can read, and under it exactly the
 * things this card lets you do and nothing else.
 *
 * What those are comes from the card's own class and script, which is why there
 * is no list of special cases here: a Wróg attacks, a Przedmiot is picked up or
 * left, a Spotkanie is applied, and anything the rules leave to the player is
 * asked as the question the rules ask.
 */
export function DrawModal({
  who,
  canAct,
  minimized,
  onMinimize,
  onRestore,
  cards,
  resolved,
  fought,
  fight,
  simulated,
  ring,
  busy,
  onAction,
  onResolve,
  onFight,
  onEscape,
  onTake,
  onLeave,
}: {
  /** Whose turn this is, for everybody who is only watching it. */
  who: string;
  /**
   * Whether this device may press anything.
   *
   * False for everyone but the player whose turn it is — including a player
   * whose own character has died and is watching the rest of the game. They see
   * the card, the dice as they land and the verdict; what they do not get is a
   * say in somebody else's turn.
   */
  canAct: boolean;
  /**
   * Whether a watcher has folded this away.
   *
   * Only ever a watcher's: the player whose turn it is cannot put their own
   * fight in a corner, because it is the thing they are being asked to do and
   * the game does not go on without it.
   */
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  /** In 15.2 order, which is the order they are dealt with. */
  cards: DrawnEntry[];
  resolved: string[];
  fought: string[];
  /** The fight in progress, which is fought here rather than behind the modal. */
  fight: Fight | null;
  simulated: boolean;
  /** Fields the character could be sent to, for the cards that let it choose. */
  ring: FieldId[];
  busy: boolean;
  onAction: (body: Record<string, unknown>) => void;
  onResolve: (cardId: string, decisions: { choices?: number[]; destination?: FieldId }) => void;
  onFight: (cardId: string) => void;
  onEscape: () => void;
  onTake: (cardId: string) => void;
  /** Nothing to do with this one — it stays on the field (16.8). */
  onLeave: (cardId: string) => void;
}) {
  // The choices made so far for the card on screen, as indices into its own
  // options. Sent back with the next attempt, so the server re-walks the card
  // and takes the branch rather than being handed an effect.
  const [choices, setChoices] = useState<number[]>([]);
  const [going, setGoing] = useState<FieldId | "">("");

  // First card that is neither resolved, fought, nor waved past. 15.2 already
  // put them in order, so "first" is "next".
  const card = cards.find(
    (entry) => !resolved.includes(entry.cardId) && !fought.includes(entry.cardId),
  );

  useEffect(() => {
    setChoices([]);
    setGoing("");
  }, [card?.cardId]);

  useEffect(() => {
    if (!card || !canAct) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onLeave(card.cardId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onLeave]);

  // A fight owns the modal for as long as it lasts. You cannot change your
  // equipment mid-fight (17.3 puts the spells before the dice and 17.4 gives
  // you one weapon), so there is nothing behind this worth reaching for — and
  // the two dice are the only thing anyone at the table is looking at.
  if (fight) {
    return (
      <Shell
        label={fight.cardName}
        art={cardImageUrl(fight.cardId.split("+")[0])}
        watching={canAct ? null : `${who} walczy`}
        minimized={minimized && !canAct}
        onMinimize={canAct ? null : onMinimize}
        onRestore={onRestore}
      >
        {canAct ? (
          <FightControls
            fight={fight}
            simulated={simulated}
            busy={busy}
            onAction={onAction}
          />
        ) : (
          <WatchFight fight={fight} />
        )}
      </Shell>
    );
  }

  if (!card) return null;
  const known = EVENTS.find((c) => c.id === card.cardId);
  if (!known) return null;

  const art = cardImageUrl(known.id);
  const script = scriptFor(known.id);
  const foe = combatValueOf(known);
  const keep = kindForCard(known);
  const label = CARD_CLASS_LABEL[card.cardClass as CardClass] ?? card.cardClass;

  // What the card is still asking, walked down through the choices already
  // made. Null when there is nothing left to ask and the app can simply do it.
  const asking = script ? pendingIn(script.effect, [...choices]) : null;

  return (
    <Shell
      label={known.name}
      art={art}
      watching={canAct ? null : `${who} ciągnie Kartę`}
      minimized={minimized && !canAct}
      onMinimize={canAct ? null : onMinimize}
      onRestore={onRestore}
    >
      {/* Only what the card does not say itself. The scan carries its own
          name, class, Miecz and full text at a size you can read — printing
          all of it again beside the picture was two of everything and pushed
          the buttons off the bottom. What is left is this app's reading of the
          card and the things you can do about it. */}
      {!art && (
        <header>
          <p className="text-[11px] uppercase tracking-widest text-muted">
            Wyciągnięto {label}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-ochre">
            {known.name}
          </h2>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted">
            {known.text}
          </p>
        </header>
      )}

      {cards.length > 1 && (
        <p className="text-[11px] text-muted">
          {/* 15.2 resolves them lowest numeral first, and this is that order. */}
          {cards.length} Karty na tym Obszarze — po kolei.
        </p>
      )}

      {script && (
        <p className="text-[11px] text-ochre/80">
          {describeDisposition(script.disposition)}
        </p>
      )}

      {coverageOf(known.id) === "brak" && (
        <p className="rounded border border-edge bg-night/50 px-2 py-1 text-[11px] text-muted">
          {NOT_HANDLED}
        </p>
      )}
      {manualNote(known.id) && (
        <p className="rounded border border-ochre/40 bg-night/50 px-2 py-1 text-[11px] text-ochre/80">
          {manualNote(known.id)}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
        {/* A Wróg attacks the moment it is turned over (16.2), so the two
            things you may do about it are the two the rules give you. */}
        {canAct && foe && (
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => onFight(known.id)}
              className="rounded border border-vermilion/60 bg-vermilion/10 px-4 py-2 text-sm text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
            >
              Walcz ({foe.kind === "magiczna" ? "Magia" : "Miecz"} {foe.total})
            </button>
            <button
              disabled={busy}
              onClick={onEscape}
              className="rounded border border-edge px-4 py-2 text-sm text-ink transition hover:border-ochre disabled:opacity-50"
            >
              Spróbuj się wymknąć (19.1)
            </button>
          </div>
        )}

        {/* Picked up or left where it lies — 12.1 and 16.8, and the app
            refuses for 5.3, 5.4 or 21.2 if it must. */}
        {canAct && !foe && keep && (
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => onTake(known.id)}
              className="rounded border border-verdigris/60 bg-verdigris/10 px-4 py-2 text-sm text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
            >
              {keep === "friend" ? "Weź Przyjaciela" : "Weź Przedmiot"}
            </button>
            <button
              disabled={busy}
              onClick={() => onLeave(known.id)}
              className="rounded border border-edge px-4 py-2 text-sm text-muted transition hover:border-ochre disabled:opacity-50"
            >
              Zostaw
            </button>
          </div>
        )}

        {/* A choice the rules give the player: "wedle własnego wyboru". */}
        {canAct && asking?.op === "wybor" && (
          <div>
            <p className="mb-1 text-[11px] text-muted">Wybierz jedno:</p>
            <div className="flex flex-wrap gap-2">
              {asking.options.map((option, index) => (
                <button
                  key={option.label}
                  disabled={busy}
                  onClick={() => {
                    const next = [...choices, index];
                    setChoices(next);
                    onResolve(known.id, { choices: next });
                  }}
                  className="rounded border border-ochre/60 px-3 py-1.5 text-sm text-ochre transition hover:bg-edge disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* "przenieś się na dowolny Obszar w tym Kręgu" — the player points at
            the board, so the board is what is offered. */}
        {canAct && asking?.op === "przenies" && asking.to.kind !== "pole" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={going}
              onChange={(event) => setGoing(event.target.value as FieldId)}
              className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink"
            >
              <option value="">— wybierz Obszar —</option>
              {ring.map((fieldId) => (
                <option key={fieldId} value={fieldId}>
                  {FIELDS.get(fieldId)?.name ?? fieldId}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !going}
              onClick={() => onResolve(known.id, { choices, destination: going as FieldId })}
              className="rounded border border-ochre/60 px-3 py-1.5 text-sm text-ochre transition hover:bg-edge disabled:opacity-50"
            >
              Przenieś się
            </button>
          </div>
        )}

        {/* Nothing left to ask: the app does it, and the notice says what it
            did. A card with no script has nothing to do but be read. */}
        {canAct && !foe && !keep && !asking && (
          <button
            disabled={busy}
            onClick={() => (script ? onResolve(known.id, { choices }) : onLeave(known.id))}
            className="self-start rounded border border-ochre/60 bg-ochre/10 px-4 py-2 text-sm text-ochre transition hover:bg-ochre/20 disabled:opacity-50"
          >
            {!script
              ? "Rozumiem"
              : script.effect.op === "rzut"
                ? "Rzuć i rozpatrz"
                : isSettled(script.effect)
                  ? "Rozpatrz"
                  : "Rozpatrz, co się da"}
          </button>
        )}

        {/* Always available: 16.8 lets a card simply stay where it fell. */}
        {canAct && (foe || asking) && (
          <button
            disabled={busy}
            onClick={() => onLeave(known.id)}
            className="self-start text-[11px] text-muted underline transition hover:text-ink"
          >
            zostaw na później
          </button>
        )}
      </div>
    </Shell>
  );
}

/**
 * The card on the left, what the app has to add on the right.
 *
 * Shared by the drawn card and the fight, because they are the same moment
 * looked at twice: a thing has happened to you and here is what you can do.
 */
function Shell({
  label,
  art,
  watching,
  minimized,
  onMinimize,
  onRestore,
  children,
}: {
  label: string;
  art: string | null;
  /** Set when this device is only watching — says whose turn it is. */
  watching: string | null;
  minimized: boolean;
  onMinimize: (() => void) | null;
  onRestore: () => void;
  children: React.ReactNode;
}) {
  // Folded away, a watcher gets a line at the foot of the screen instead of a
  // sheet over it. It still says what is going on — which is most of what the
  // modal was for — and the board is visible behind it again.
  if (minimized) {
    return (
      <button
        onClick={onRestore}
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-ochre/50 bg-panel px-4 py-2 text-xs text-ink shadow-[0_4px_20px_rgba(0,0,0,0.6)] transition hover:border-ochre"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ochre" aria-hidden />
        {watching ?? label} — <span className="text-ochre">pokaż</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/85 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl gap-4 overflow-hidden rounded-lg border border-ochre/40 bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
        {art && (
          <Image
            src={art}
            alt={label}
            width={300}
            height={500}
            className="hidden h-auto w-[260px] shrink-0 self-start rounded border border-edge sm:block"
            priority
            unoptimized
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
          {watching && (
            <div className="flex shrink-0 items-center justify-between gap-2 rounded border border-edge bg-night/50 px-2 py-1">
              <p className="truncate text-[11px] uppercase tracking-wide text-muted">
                {watching} — oglądasz
              </p>
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="shrink-0 text-[11px] text-muted underline transition hover:text-ink"
                >
                  zwiń
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The first thing an effect still needs a person for, given the choices already
 * made.
 *
 * Mirrors the walk the server does, so the interface asks exactly the question
 * the server is waiting for — and asks it about the branch the player has
 * already stepped into, not the top of the card.
 */
function pendingIn(effect: Effect, choices: number[]): Effect | null {
  if (effect.op === "wybor") {
    const pick = choices.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    return option ? pendingIn(option.effect, choices) : effect;
  }
  if (effect.op === "przenies") return effect.to.kind === "pole" ? null : effect;
  if (effect.op === "po-kolei") {
    for (const step of effect.steps) {
      const owed = pendingIn(step, choices);
      if (owed) return owed;
    }
    return null;
  }
  if (effect.op === "gdy") {
    // The condition is the seat's, which the browser does not evaluate; if
    // either branch needs asking, the server will say so when it gets there.
    return null;
  }
  // A die table is not a question — the app rolls it — so what it lands on is
  // asked about after the roll, from the server's answer.
  if (effect.op === "rzut") return null;
  return isSettled(effect) ? null : effect;
}

/** Every field in the character's own ring, for the cards that let it choose. */
export function ringFields(fieldId: FieldId | null): FieldId[] {
  if (!fieldId) return [];
  return (ringOf(fieldId) ?? []).map((field) => field.id);
}

/**
 * A fight somebody else is having.
 *
 * The same two numbers, with nothing to press. It exists because a fight is the
 * moment the game is most worth looking at, and it used to happen entirely
 * inside one person's browser — everybody else read about it in the journal
 * afterwards, which is not the same as watching the second die land.
 */
function WatchFight({ fight }: { fight: Fight }) {
  const label = fight.kind === "magiczna" ? "Magia" : "Miecz";
  const side = (title: string, total: number, roll: number | null) => (
    <div className="rounded border border-edge bg-night p-3">
      <p className="mb-2 truncate text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="flex items-baseline gap-2">
        <span className="tnum text-2xl text-ink">{total}</span>
        <span className="text-xs text-muted">{label}</span>
      </p>
      <p className="tnum mt-3 text-sm text-muted">
        {roll === null ? (
          "czeka na rzut…"
        ) : (
          <>
            rzut <span className="text-ink">{roll}</span> — razem{" "}
            <span className="text-ochre">{total + roll}</span>
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Przeciwnik: <span className="text-vermilion">{fight.cardName}</span>{" "}
        <span className="text-xs">
          ({fight.kind === "magiczna" ? "walka magiczna" : "walka zwykła"})
        </span>
      </p>
      <div className="grid grid-cols-2 gap-4">
        {side("Postać", fight.playerTotal, fight.playerRoll)}
        {side(fight.cardName, fight.enemyTotal, fight.enemyRoll)}
      </div>
      {fight.result && (
        <p className="rounded border border-edge bg-night p-3 text-sm text-ink">
          {fight.result.outcome === "wygrana"
            ? "Wygrana."
            : fight.result.outcome === "remis"
              ? "Remis — nikt nic nie traci (17.10)."
              : "Przegrana."}
        </p>
      )}
    </div>
  );
}
