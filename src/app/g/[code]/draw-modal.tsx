"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CardMark } from "./card-mark";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { cardImageUrl } from "@/lib/engine/cardImages";
import { combatValueOf } from "@/lib/engine/cards";
import { kindForCard } from "@/lib/engine/holdings";
import {
  scriptFor,
  describeDisposition,
  type Effect,
} from "@/lib/engine/cardScript";
import { isSettled } from "@/lib/engine/resolve";
import { coverageOf, manualNote, NOT_HANDLED } from "@/lib/engine/coverage";
import { FIELDS, ringOf, type FieldId } from "@/lib/engine/board";
import { BridgeControls, FightControls } from "./turn-panel";
import { SpellHand, type HeldSpell } from "./spell-hand";
import type { TileCard } from "./card-tile";
import {
  castableNow,
  spellScript,
  type SpellTiming,
} from "@/lib/engine/spells";
import { DIRECTION_LABEL, type Fight, type TurnMoveOption } from "@/lib/engine/turn";

const EVENTS = events as EventCard[];

export interface DrawnEntry {
  cardId: string;
  cardClass: string;
  /** Staged by the test shortcut rather than drawn — see `TurnCard.granted`. */
  granted?: boolean;
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
  error,
  spells,
  moment,
  opponents,
  floor,
  mySeatIndex,
  seatName,
  onClaimFloor,
  onReleaseFloor,
  onCastSpell,
  onInspect,
  cards,
  resolved,
  fought,
  fight,
  move,
  bridge,
  fieldOffer,
  simulated,
  myEscape,
  ring,
  busy,
  onAction,
  onResolve,
  onResolveField,
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
  /** A refusal from the last thing pressed, said inside the sheet that hides it. */
  error: string | null;
  /**
   * This device's own hand, and everything a fight needs to let it speak.
   *
   * Shown to whoever is looking, fighting or watching: a Zaklęcie that says
   * "w dowolnej chwili" belongs to its holder wherever they are sitting, and
   * thirteen of the twenty-seven say exactly that.
   */
  spells: HeldSpell[];
  moment: readonly SpellTiming[];
  opponents: { seatIndex: number; name: string }[];
  /** Who has claimed the moment before the dice, and until when. */
  floor: { seat: number; until: number } | null;
  mySeatIndex: number | null;
  seatName: (index: number) => string;
  onClaimFloor: () => void;
  onReleaseFloor: () => void;
  onCastSpell: (
    holdingId: string,
    target: { seatIndex?: number; fieldCardId?: string },
  ) => void;
  onInspect: (card: TileCard) => void;
  /** In 15.2 order, which is the order they are dealt with. */
  cards: DrawnEntry[];
  resolved: string[];
  fought: string[];
  /** The fight in progress, which is fought here rather than behind the modal. */
  fight: Fight | null;
  /**
   * The die has been thrown and the character is standing between two roads.
   *
   * Here rather than in a panel because it is the same shape as everything else
   * in this window: a thing you are being asked to do, once, with the table
   * watching. Where somebody is headed is public, and it used to be drawn only
   * on their own device.
   */
  move: { roll: number; options: TurnMoveOption[] } | null;
  /**
   * The Kamienny Most's entrance (11.9-11.11), which is the same shape as the
   * move: one thing to decide, once, with the table watching.
   */
  bridge: {
    from: string;
    guardian: string;
    entersAt: string;
    stat: "miecz" | "magia";
  } | null;
  /**
   * A field's compulsory table, when the character is standing on one.
   *
   * "MUSISZ RZUCIĆ KOSTKĄ" at the Karczma, and the Strażnik's toll: two things
   * that happen to you rather than being offered, which puts them in the same
   * class as a drawn card. The Osada's Czarownica and Płatnerz stay in the
   * panel — those are a visit, and a visit is optional.
   */
  fieldOffer: { name: string; effect: Effect } | null;
  simulated: boolean;
  /** Names of the seats 17.3's spell window is still open for. */
  /** Whether this device is one of them — a watcher can be (17.7). */
  /**
   * Whether this device is the character being attacked in a duel (17.6).
   *
   * The other half of the same idea as `myTurnToPass`: a fight has two sides,
   * and both of the decisions taken before the dice — a Zaklęcie, and whether
   * to run — belong to whichever side the rule names, not to whoever happens
   * to be having their turn.
   */
  myEscape: boolean;
  /** Fields the character could be sent to, for the cards that let it choose. */
  ring: FieldId[];
  busy: boolean;
  onAction: (body: Record<string, unknown>) => void;
  onResolve: (
    cardId: string,
    decisions: { choices?: number[]; destination?: FieldId },
  ) => void;
  /** Throws the field's own table and applies the row. */
  onResolveField: (choices: number[]) => void;
  /** One creature, or several at once when 17.5 lets them attack together. */
  onFight: (cardIds: string[]) => void;
  onEscape: () => void;
  onTake: (cardId: string) => void;
  /** Nothing to do with this one — it stays on the field (16.8). */
  onLeave: (cardId: string) => void;
}) {
  // The choices made so far for the card on screen, as indices into its own
  // options. Sent back with the next attempt, so the server re-walks the card
  // and takes the branch rather than being handed an effect.
  /**
   * The one clock the sheet keeps.
   *
   * A claim lapses by time, not by anybody writing it down, so every part of
   * the modal that cares — the dice, the cast buttons, the box itself — has to
   * agree on the moment it stops counting. Held once here and passed down: with
   * the countdown inside the box, the box went back to "Chcę rzucić" while the
   * dice stayed held, because nothing else had noticed the second go by.
   *
   * The number is a courtesy and the deadline is a fact: the server checks it
   * again, so two devices with different clocks cannot disagree about who may
   * speak.
   */
  const until = floor?.until ?? null;
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (until === null) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    // The first one a beat late rather than in the effect's own body, and the
    // rest on the interval: reading the clock while rendering is not allowed to
    // be a pure function of anything, and setting state as an effect runs is
    // the cascade the same rule is there to stop.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  const held = floor !== null && left > 0 ? floor : null;

  const [choices, setChoices] = useState<number[]>([]);
  const [going, setGoing] = useState<FieldId | "">("");

  // First card that is neither resolved, fought, nor waved past. 15.2 already
  // put them in order, so "first" is "next".
  const card = cards.find(
    (entry) =>
      !resolved.includes(entry.cardId) && !fought.includes(entry.cardId),
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
  // The move, before anything drawn — you cannot have drawn a card on an
  // Obszar you have not arrived at yet, so these never overlap. It is only
  // ordered first because a fight is checked below and cannot be running here.
  if (move) {
    return (
      <Shell
        label={`Wyrzucono ${move.roll}`}
        art={null}
        watching={canAct ? null : `${who} wybiera drogę`}
        minimized={minimized && !canAct}
        onMinimize={canAct ? null : onMinimize}
        onRestore={onRestore}
        error={error}
        wide
      >
        <p className="mb-3 text-sm text-muted">
          {canAct ? "Wybierz kierunek." : `${who} wybiera kierunek.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {move.options.map((option) => (
            <button
              key={`${option.direction}-${option.fieldId}-${option.bridge ? "most" : "ring"}`}
              disabled={busy || !canAct}
              onClick={() =>
                onAction({
                  action: "move",
                  fieldId: option.fieldId,
                  ...(option.bridge ? { viaBridge: true } : {}),
                })
              }
              className={`rounded border bg-raised px-4 py-3 text-left transition disabled:opacity-50 ${
                option.bridge
                  ? "border-vermilion/50 hover:border-vermilion"
                  : "border-edge hover:border-ochre"
              }`}
            >
              <span className="block font-medium text-ink">
                {option.bridge ? "Kamienny Most" : option.fieldName}
              </span>
              <span className="block text-[11px] text-muted">
                {option.bridge
                  ? `skręć z ${option.fieldName} — czeka ${option.bridge.guardian}`
                  : DIRECTION_LABEL[option.direction]}
              </span>
              {option.through.length > 0 && (
                <span className="mt-1 block text-[11px] text-muted/70">
                  przez: {option.through.join(" → ")}
                </span>
              )}
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  if (bridge) {
    return (
      <Shell
        label="Kamienny Most"
        art={null}
        watching={canAct ? null : `${who} wchodzi na Most`}
        minimized={minimized && !canAct}
        onMinimize={canAct ? null : onMinimize}
        onRestore={onRestore}
        error={error}
      >
        <BridgeControls
          bridge={bridge}
          simulated={simulated}
          busy={busy}
          onAction={onAction}
        />
      </Shell>
    );
  }

  if (fight) {
    return (
      <Shell
        label={fight.cardName}
        art={cardImageUrl(fight.cardId.split("+")[0])}
        granted={fight.granted === true}
        watching={canAct ? null : `${who} walczy`}
        minimized={minimized && !canAct}
        onMinimize={canAct ? null : onMinimize}
        onRestore={onRestore}
        error={error}
        wide
      >
        {/* Two columns inside the sheet: what is happening, and what you are
            holding while it happens. */}
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {canAct ? (
              <FightControls
                fight={fight}
                simulated={simulated}
                busy={busy}
                floorHeld={held !== null}
                // A duel's escape is the other player's (17.6) — except on the
                // shared screen, which acts for whoever is fleeing and so keeps it.
                canFlee={fight.opponentSeat === undefined || myEscape}
                onAction={onAction}
              />
            ) : (
              <>
                <WatchFight fight={fight} />
                {myEscape &&
                  fight.playerRoll === null &&
                  fight.enemyRoll === null && (
                    <div className="rounded border border-ochre/50 bg-ochre/5 p-3">
                      <p className="text-xs text-ink">
                        Zaatakowano cię. Możesz spróbować się wymknąć, zanim
                        padną kostki (17.6) — udaje się to dzięki
                        Charakterystyce albo Zaklęciu Krąg Płomieni (19.1).
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {simulated ? (
                          <button
                            disabled={busy}
                            onClick={() => onAction({ action: "escape" })}
                            className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
                          >
                            Spróbuj się wymknąć (19.1)
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                onAction({ action: "escape", succeeded: true })
                              }
                              className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
                            >
                              Wymknąłem się (19.1)
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                onAction({ action: "escape", succeeded: false })
                              }
                              className="rounded border border-edge px-3 py-1 text-xs text-muted transition hover:border-vermilion disabled:opacity-50"
                            >
                              Próba nieudana
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Everybody's hand, beside everybody's fight. 17.3 puts a fighter's
            spells before their own roll, 17.7 gives a duel's other side the
            same, and the thirteen cards that say "w dowolnej chwili" give it to
            the rest of the table — so this is the same panel whoever reads it,
            and the only thing that differs is whose hand is in it. */}
          <aside className="flex w-[290px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-edge/60 pl-3">
            <SpellFloorControl
              floor={held}
              left={left}
              mySeatIndex={mySeatIndex}
              seatName={seatName}
              canClaim={
                !fight.result &&
                spells.some((entry) => {
                  const script = spellScript(entry.cardId);
                  return script ? castableNow(script, moment) : true;
                })
              }
              busy={busy}
              onClaim={onClaimFloor}
              onRelease={onReleaseFloor}
            />
            <SpellHand
              spells={spells}
              moment={moment}
              blocked={
                held === null
                  ? "Najpierw zgłoś, że chcesz rzucić."
                  : held.seat === mySeatIndex
                    ? null
                    : `Teraz rzuca ${seatName(held.seat)}.`
              }
              opponents={opponents}
              busy={busy}
              onCast={onCastSpell}
              onInspect={onInspect}
            />
          </aside>
        </div>
      </Shell>
    );
  }

  // Nothing drawn to deal with, but the field itself demands something. Same
  // shape as a card: it happened to you, here is what you can do about it.
  if (!card && fieldOffer) {
    const owed = pendingIn(fieldOffer.effect, [...choices]);
    return (
      <Shell
        label={fieldOffer.name}
        art={null}
        watching={canAct ? null : `${who} na polu: ${fieldOffer.name}`}
        minimized={minimized && !canAct}
        onMinimize={canAct ? null : onMinimize}
        onRestore={onRestore}
          error={error}
      >
        <FieldEffect effect={fieldOffer.effect} />
        {canAct && (
          <div className="mt-auto flex flex-wrap gap-2 border-t border-edge pt-3">
            {owed?.op === "wybor" ? (
              owed.options.map((option, index) => (
                <button
                  key={option.label}
                  disabled={busy}
                  onClick={() => {
                    const next = [...choices, index];
                    setChoices(next);
                    onResolveField(next);
                  }}
                  className="rounded border border-ochre/60 px-3 py-1.5 text-sm text-ochre transition hover:bg-edge disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))
            ) : (
              <button
                disabled={busy}
                onClick={() => onResolveField(choices)}
                className="rounded border border-ochre/60 bg-ochre/10 px-4 py-2 text-sm text-ochre transition hover:bg-ochre/20 disabled:opacity-50"
              >
                {fieldOffer.effect.op === "rzut"
                  ? "Rzuć i rozpatrz"
                  : "Rozpatrz"}
              </button>
            )}
          </div>
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

  // 17.5: several creatures attacking at once are one opponent — their Miecze
  // added and one die thrown for the lot, which is the difference between hard
  // and hopeless. Only when they are of a kind: an ordinary Wróg and a magical
  // one cannot be summed, because the sums are of different things.
  const standing = cards
    .map((entry) => EVENTS.find((c) => c.id === entry.cardId))
    .filter(
      (c): c is EventCard =>
        !!c &&
        !!combatValueOf(c) &&
        !fought.includes(c.id) &&
        !resolved.includes(c.id),
    );
  const together =
    standing.length > 1 &&
    new Set(standing.map((c) => combatValueOf(c)!.kind)).size === 1
      ? standing
      : null;
  const keep = kindForCard(known);
  const label = CARD_CLASS_LABEL[card.cardClass as CardClass] ?? card.cardClass;

  // What the card is still asking, walked down through the choices already
  // made. Null when there is nothing left to ask and the app can simply do it.
  const asking = script ? pendingIn(script.effect, [...choices]) : null;

  return (
    <Shell
      label={known.name}
      art={art}
      granted={card.granted === true}
      watching={canAct ? null : `${who} ciągnie Kartę`}
      minimized={minimized && !canAct}
      onMinimize={canAct ? null : onMinimize}
      onRestore={onRestore}
      error={error}
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
              onClick={() => onFight([known.id])}
              className="rounded border border-vermilion/60 bg-vermilion/10 px-4 py-2 text-sm text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
            >
              Walcz ({foe.kind === "magiczna" ? "Magia" : "Miecz"} {foe.total})
            </button>
            {together && (
              <button
                disabled={busy}
                onClick={() => onFight(together.map((c) => c.id))}
                title={together.map((c) => c.name).join(" + ")}
                className="rounded border border-vermilion/60 px-4 py-2 text-sm text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
              >
                Walcz ze wszystkimi naraz ({together.length}) —{" "}
                {together.reduce((sum, c) => sum + combatValueOf(c)!.total, 0)}
              </button>
            )}
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
              onClick={() =>
                onResolve(known.id, { choices, destination: going as FieldId })
              }
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
            onClick={() =>
              script ? onResolve(known.id, { choices }) : onLeave(known.id)
            }
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
        {/* 16.8 lets a card stay where it fell — but not a Wróg. Rule 11 is
            explicit that creatures present "muszą najpierw zostać pokonani ...
            lub należy im uciec", so a fight is fought or fled, never shelved.
            16.8 is about what is left when a turn ends, not a way out of one. */}
        {canAct && asking && (
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
/**
 * Asking for the moment before the dice, and the half-minute it buys.
 *
 * The race is the button, not the casting. Everybody at the table sees the same
 * one and it is live for anybody holding something they could speak (17.3,
 * 17.7, and the thirteen cards that say "w dowolnej chwili") — so pressing it
 * is the tell, the way reaching for a card is at a table, and nobody is named
 * in advance the way a poll would name them (9.3).
 *
 * The clock is a house rule; the rulebook has none, only "before the roll". It
 * is there so a fight cannot hang on somebody who has left the room, and it is
 * generous enough not to be a test of reflexes: the hard part was getting the
 * floor, and reading a hand afterwards is not a race.
 */
function SpellFloorControl({
  floor,
  left,
  mySeatIndex,
  seatName,
  canClaim,
  busy,
  onClaim,
  onRelease,
}: {
  /** Live only: a lapsed claim is nobody's, and reaches here as null. */
  floor: { seat: number; until: number } | null;
  /** Seconds still on it, counted by the one clock the modal keeps. */
  left: number;
  mySeatIndex: number | null;
  seatName: (index: number) => string;
  /** Whether this device is holding anything it could speak right now. */
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
  onRelease: () => void;
}) {
  const mine = floor !== null && floor.seat === mySeatIndex;
  const held = floor !== null;

  return (
    <div className="rounded border border-magia/40 bg-magia/5 p-2">
      {held ? (
        <>
          <p className="text-[11px] text-ink">
            {mine
              ? "Rzucasz Zaklęcie"
              : `${seatName(floor.seat)} rzuca Zaklęcie`}{" "}
            — <span className="tnum text-magia">{left}s</span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            {mine ? "Kostki czekają na ciebie." : "Kostki i pozostali czekają."}
          </p>
          {mine && (
            <button
              disabled={busy}
              onClick={onRelease}
              className="mt-1.5 rounded border border-edge px-2 py-0.5 text-[11px] text-muted transition hover:border-ochre hover:text-ink disabled:opacity-50"
            >
              Jednak nie rzucam
            </button>
          )}
        </>
      ) : (
        <>
          <button
            disabled={busy || !canClaim}
            onClick={onClaim}
            title={
              canClaim
                ? "Zgłoś się przed rzutem kostką (17.3) — dostaniesz 30 sekund"
                : "Nie masz Zaklęcia, które można teraz rzucić"
            }
            className="rounded border border-magia/60 bg-magia/10 px-2 py-1 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
          >
            Chcę rzucić Zaklęcie
          </button>
          <p className="mt-1 text-[10px] text-muted">
            Kto pierwszy się zgłosi, ten rzuca — 30 sekund, potem kostki idą
            dalej.
          </p>
        </>
      )}
    </div>
  );
}

function Shell({
  label,
  art,
  granted = false,
  watching,
  minimized,
  onMinimize,
  onRestore,
  error,
  wide = false,
  children,
}: {
  label: string;
  art: string | null;
  /** Staged by the test shortcut rather than drawn — marked on the card. */
  granted?: boolean;
  /** Set when this device is only watching — says whose turn it is. */
  watching: string | null;
  minimized: boolean;
  onMinimize: (() => void) | null;
  onRestore: () => void;
  /** A refusal from the last thing pressed. */
  error: string | null;
  /** Room for a third column: the card, the fight, and a hand beside it. */
  wide?: boolean;
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
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-ochre"
          aria-hidden
        />
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
      <div
        className={`flex max-h-[90vh] w-full flex-col gap-3 overflow-hidden rounded-lg border border-ochre/40 bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.7)] ${
          wide ? "max-w-5xl" : "max-w-3xl"
        }`}
      >
        {/*
          One header across the whole sheet.
          
          What is happening on the left, what you can do about the sheet itself
          on the right — folding it away, and the test hatch out of a fight.
          They belong together and above everything: they are not moves in the
          game, and putting them among the moves meant the abandon button
          floated in a corner of the spell column, which is not the column it
          has anything to do with.
        */}
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-edge/60 pb-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate font-[family-name:var(--font-display)] text-lg text-ochre">
              {label}
            </h2>
            {watching && (
              <span className="truncate text-[11px] uppercase tracking-wide text-muted">
                {watching} — oglądasz
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {onMinimize && (
              <button
                onClick={onMinimize}
                className="text-[11px] text-muted underline transition hover:text-ink"
              >
                zwiń
              </button>
            )}
          </div>
        </header>

        {/* Said here, because here is where it happened.

            A modal covers the panel that used to carry these, so anything
            refused while one is open was refused in silence: the dice would not
            move, the button that pressed them looked exactly as it had before,
            and the reason was written on a card behind the sheet. */}
        {error && (
          <p className="shrink-0 rounded border border-vermilion/50 bg-vermilion/10 px-2 py-1 text-xs text-vermilion">
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1 gap-4">
          {art && (
            <div className="relative hidden shrink-0 self-start sm:block">
              <Image
                src={art}
                alt={label}
                width={300}
                height={500}
                className="h-auto w-[260px] rounded border border-edge"
                priority
                unoptimized
              />
              {/* A staged fight is a Wróg the deck never dealt, and this is the
                  card you are looking at while you decide whether to run from
                  it. On the picture, where every other view puts it. */}
              {granted && (
                <span className="absolute bottom-1 right-1 rounded bg-night/85 px-1 py-0.5">
                  <CardMark mark="granted" size={26} />
                </span>
              )}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            {children}
          </div>
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
  if (effect.op === "przenies")
    return effect.to.kind === "pole" ? null : effect;
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
      <p className="mb-2 truncate text-xs uppercase tracking-wide text-muted">
        {title}
      </p>
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
      {/* The name is in the sheet's header; this says what kind of fight it
          is, which is the part the header cannot carry. */}
      <p className="text-sm text-muted">
        {fight.kind === "magiczna" ? "Walka magiczna" : "Walka zwykła"}
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

/** A field's table, written out. The app rolls it; nothing here is pressable. */
function FieldEffect({ effect }: { effect: Effect }) {
  if (effect.op === "rzut") {
    return (
      <ol className="flex flex-col gap-0.5 text-xs">
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <li key={face} className="flex items-baseline gap-2">
            <span className="tnum w-3 text-ochre">{face}</span>
            <span className="text-muted">{say(effect.faces[face])}</span>
          </li>
        ))}
      </ol>
    );
  }
  return <p className="text-xs text-muted">{say(effect)}</p>;
}

/** One line for what an effect does, for a table nobody is meant to press. */
function say(effect: Effect): string {
  switch (effect.op) {
    case "nic":
      return "nic się nie dzieje";
    case "punkty": {
      const name = {
        miecz: "Miecza",
        magia: "Magii",
        zycie: "Życia",
        zloto: "Złota",
      }[effect.stat];
      return `${effect.delta > 0 ? "+" : "−"}${Math.abs(effect.delta)} ${name}`;
    }
    case "tura-stracona":
      return `tracisz ${effect.turns} turę`;
    case "walka":
      return `walka: ${effect.nazwa} (${
        effect.magia !== undefined
          ? `Magia ${effect.magia}`
          : `Miecz ${effect.miecz}`
      })`;
    case "przenies":
      return effect.to.kind === "pole"
        ? `przenieś się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`
        : "przenieś się na dowolny Obszar w tym Kręgu";
    case "zaklecie":
      return `+${effect.count} Zaklęcie`;
    case "kamien":
      return "Zamiana w Kamień (20.1)";
    case "uzdrow":
      return effect.cena
        ? `leczenie za ${effect.cena} Sz. Z. za punkt`
        : "uzdrowienie";
    case "wybor":
      return effect.options.map((option) => option.label).join(" albo ");
    case "po-kolei":
      return effect.steps.map(say).join(", potem ");
    case "gdy":
      return `${say(effect.to)}${effect.inaczej ? `, inaczej ${say(effect.inaczej)}` : ""}`;
    default:
      return "rozpatrzcie sami";
  }
}
