"use client";

import { useEffect, useState } from "react";
import { DrawSheet, type SheetChrome } from "./draw-sheet";
import { dismissableOpen } from "./overlay";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { cardImageUrl } from "@/lib/view/cardImages";
import { combatValueOf, roundsOf } from "@/lib/engine/cards";
import { attackAsOne } from "@/lib/engine/combat";
import { kindForCard } from "@/lib/engine/holdings";
import { KolejkaStrip, worthShowing } from "./kolejka-strip";
import { scriptFor, describeDisposition } from "@/lib/engine/cardScript";
import { isSettled, pendingIn } from "@/lib/engine/resolve";
import { coverageOf, manualNote, NOT_HANDLED } from "@/lib/engine/coverage";
import { FIELDS, type FieldId } from "@/lib/engine/board";

const EVENTS = events as EventCard[];

/** The Karta you just turned over, and exactly the things it lets you do. */

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
 * So it is on a sheet — the card at a size you can read, and under it exactly
 * the things this card lets you do and nothing else.
 *
 * What those are comes from the card's own class and script, which is why there
 * is no list of special cases here: a Wróg attacks, a Przedmiot is picked up or
 * left, a Spotkanie is applied, and anything the rules leave to the player is
 * asked as the question the rules ask.
 */
export function DrawnCard({
  who,
  chrome,
  card,
  cards,
  resolved,
  fought,
  beaten,
  ring,
  occupied = [],
  mySword,
  busy,
  onResolve,
  onFight,
  onEscape,
  onTake,
  onLeave,
}: {
  who: string;
  chrome: SheetChrome;
  /** The one being dealt with: first of the stack that is neither settled nor fought. */
  card: DrawnEntry;
  /** In 15.2 order, which is the order they are dealt with. */
  cards: DrawnEntry[];
  resolved: string[];
  fought: string[];
  /** Wrogowie who died here (16.2) — struck in the kolejka, gone from the Obszar. */
  beaten?: string[];
  /** Fields the character could be sent to, for the cards that let it choose. */
  ring: FieldId[];
  /**
   * Where the other Postacie are standing, for the one Karta that may not be
   * put down on top of one — „nie zajętym przez inną Postać" (Lewiatan).
   *
   * Filtered here as well as on the server so that a player is not offered an
   * answer that will be refused, which is the same courtesy the move options
   * get.
   */
  occupied?: FieldId[];
  /**
   * What the character fights with (1.5), for the one Wróg who has no strength
   * of his own: the Sobowtór „posiada zawsze tyle punktów Miecza, ile jego
   * przeciwnik", so the button cannot say how strong he is without it.
   */
  mySword: number;
  busy: boolean;
  onResolve: (
    cardId: string,
    decisions: { choices?: number[]; destination?: FieldId },
  ) => void;
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
  const [choices, setChoices] = useState<number[]>([]);
  const [going, setGoing] = useState<FieldId | "">("");

  /**
   * A new Karta starts with nothing decided about it.
   *
   * Adjusted during the render rather than in an effect. React documents this
   * as the way to reset state when a prop changes, and the effect version cost
   * a second render of the whole sheet every time the stack moved on — the one
   * the lint rule is warning about.
   */
  const [decidingAbout, setDecidingAbout] = useState(card.cardId);
  if (card.cardId !== decidingAbout) {
    setDecidingAbout(card.cardId);
    setChoices([]);
    setGoing("");
  }

  const { canAct } = chrome;
  useEffect(() => {
    if (!canAct) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Not while something is open over this one. Escape belongs to whatever
      // is on top, and leaving a Karta on the field is not the sort of thing to
      // do as a side effect of closing the Karta you were reading.
      if (dismissableOpen()) return;
      onLeave(card.cardId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `canAct` belongs here: a watcher who takes the seat over mid-Karta
    // changes it without changing the Karta, and the listener was staying as it
    // was — bound for somebody who could no longer act, or missing for somebody
    // who now could.
  }, [card.cardId, canAct, onLeave]);

  const known = EVENTS.find((c) => c.id === card.cardId);
  if (!known) return null;

  const art = cardImageUrl(known.id);
  const script = scriptFor(known.id);
  // Whose Miecz the Sobowtór borrows — see `combatValueOf`. Harmless for every
  // other creature, which carries its own number.
  const mirror = { miecz: mySword };
  const foe = combatValueOf(known, mirror);

  // 17.5: several creatures attacking at once are one opponent — their Miecze
  // added and one die thrown for the lot, which is the difference between hard
  // and hopeless. Only when they are of a kind: an ordinary Wróg and a magical
  // one cannot be summed, because the sums are of different things.
  const standing = cards
    .map((entry) => EVENTS.find((c) => c.id === entry.cardId))
    .filter(
      (c): c is EventCard =>
        !!c &&
        !!combatValueOf(c, mirror) &&
        !fought.includes(c.id) &&
        !resolved.includes(c.id),
    );
  // 17.5 asked once, of the engine, rather than restated here — the server
  // refuses a mixed fight against this same answer. A creature that is several
  // fights rather than one cannot be in the pack either: his card asks for
  // three comparisons and 17.5 offers one, so the button is not shown rather
  // than shown and refused.
  const asOne =
    standing.length > 1 && !standing.some((c) => roundsOf(c.id))
      ? attackAsOne(standing.map((c) => combatValueOf(c, mirror)!))
      : null;
  const together = asOne ? standing : null;
  const keep = kindForCard(known);
  const label = CARD_CLASS_LABEL[card.cardClass as CardClass] ?? card.cardClass;

  // What the card is still asking, walked down through the choices already
  // made. Null when there is nothing left to ask and the app can simply do it.
  const asking = script ? pendingIn(script.effect, choices) : null;

  return (
    <DrawSheet
      {...chrome}
      label={known.name}
      art={art}
      granted={card.granted === true}
      watching={`${who} ciągnie Kartę`}
      /**
       * The kolejka, across the foot of the sheet.
       *
       * It replaced the sentence "3 Karty na tym Obszarze — po kolei", which is
       * a count and an assurance: it says there is an order without saying what
       * the order is, so a player halfway through a busy Obszar knew how many
       * were left and not which, nor whether the next one was a Wróg.
       *
       * At the foot rather than at the top of the right-hand column, where it
       * first went. Up there it was a third thing competing with the card's own
       * title, and it is not a third thing — it is the row on the table, and
       * the Karta above it is the one in your hand.
       */
      footer={
        worthShowing(cards) ? (
        <KolejkaStrip
          cards={cards.map((one) => ({
            cardId: one.cardId,
            cardClass: one.cardClass as CardClass,
          }))}
          settled={[...resolved, ...fought]}
          /* The Karta this sheet is showing, so the row cannot light a
             different one. */
          current={card.cardId}
          beaten={beaten}
        />
        ) : null
      }
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
              Walcz ({foe.kind === "magical" ? "Magia" : "Miecz"} {foe.total}
              {/* Said, because a number that is your own is not a number you
                  read off the card — and next turn it will be different. */}
              {foe.mirrors ? " — tyle co ty" : ""})
            </button>
            {together && (
              <button
                disabled={busy}
                onClick={() => onFight(together.map((c) => c.id))}
                title={together.map((c) => c.name).join(" + ")}
                className="rounded border border-vermilion/60 px-4 py-2 text-sm text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
              >
                Walcz ze wszystkimi naraz ({together.length}) — {asOne?.total}
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

        {/* "połóż jego Kartę na którymś z tych Obszarów, nie zajętym przez
            inną Postać" — the card names the list, and the ones somebody is
            standing on are struck off it here as well as on the server, so a
            player is not offered an answer that will be refused. */}
        {canAct && asking?.op === "poloz-karte" && asking.gdzie.kind === "jedno-z" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={going}
              onChange={(event) => setGoing(event.target.value as FieldId)}
              className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink"
            >
              <option value="">— wybierz Obszar —</option>
              {asking.gdzie.fieldIds
                .filter((fieldId) => !occupied.includes(fieldId))
                .map((fieldId) => (
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
              Połóż tutaj
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
    </DrawSheet>
  );
}
