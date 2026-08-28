"use client";

import { useEffect, useState } from "react";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import type { TileCard } from "./card-tile";
import { Fold } from "./fold";
import { Rules } from "./rule-ref";
import { useRack } from "./rack";
import { ItemSlot, SLOT_WIDTH } from "./item-slot";
import type { SpellId } from "@/data/ids";
import {
  TARGET_LABEL,
  TIMING_LABEL,
  castableNow,
  spellScript,
  type SpellTiming,
} from "@/lib/engine/spells";

const SPELL_BY_ID = new Map((spells as Spell[]).map((spell) => [spell.id, spell]));

/**
 * The drag type a Zaklęcie travels under, and deliberately not the pack's.
 *
 * A spell moves only inside this row — it has no place on the body, and 9.3 and
 * 2.6 keep it out of the Plecak — so a drag from here must not light up the
 * places on the paper doll, and one from there must not aim at this row. Two
 * names is how the browser is told that, and it costs nothing.
 */
const SPELL_DRAG = "application/x-magiczny-miecz-zaklecie";

export interface HeldSpell {
  holdingId: string;
  cardId: SpellId;
  /** Conjured by the test shortcut, and marked on the card like any other. */
  granted?: boolean;
}

/**
 * The spells in your hand, and the ones you may speak right now.
 *
 * Concealed from everyone else (9.3), so this only ever renders for the seat
 * that holds them. A spell whose card names a window it is not currently in is
 * shown greyed with that window named, rather than hidden: knowing that the
 * Magiczna Wędrówka is waiting for the start of your move is most of what you
 * need to plan a turn around it.
 */
export function SpellHand({
  spells: held,
  moment,
  blocked = null,
  title,
  capacity,
  frame = "panel",
  opponents,
  boardCards = [],
  busy,
  onCast,
  onInspect,
  onReorder,
}: {
  spells: HeldSpell[];
  /** Every window the turn is open for right now — a moment can be several. */
  moment: readonly SpellTiming[];
  /** Why nothing can be spoken at this instant, if something cannot. */
  blocked?: string | null;
  /** Shown above the hand. */
  title?: string;
  /**
   * How many the hand may hold (2.6), when the caller knows.
   *
   * Drawn beside the count the way the pack draws 5.4's, because it is the same
   * kind of fact and was the one of the two nobody could see: a player learns
   * their limit by being refused a Zaklęcie they had already decided to take.
   */
  capacity?: number;
  /**
   * Where this is standing.
   *
   * `section` is the seat card, under the pack and reading as part of it —
   * a rule about your hand belongs beside the rule about your pack. `panel` is
   * the fight sheet, where it is a box of its own beside the dice.
   */
  frame?: "panel" | "section";
  /** Other seats, for the spells that need a victim. */
  opponents: { seatIndex: number; name: string }[];
  busy: boolean;
  /** Boards cards this spell could be aimed at, when its own says so. */
  boardCards?: { id: string; name: string; where: string }[];
  onCast: (holdingId: string, target: { seatIndex?: number; fieldCardId?: string }) => void;
  onInspect: (card: TileCard) => void;
  /**
   * Absent where the hand cannot be arranged — the fight sheet, and anybody
   * else's. Given, the row works exactly as the Plecak does: pick a card up,
   * drop it where you want it, and the order is written down.
   */
  onReorder?: (holdingIds: string[]) => void;
}) {
  const [aiming, setAiming] = useState<string | null>(null);
  /**
   * The card in the air, which for a hand of Zaklęcia never leaves the hand.
   *
   * Its own state and not the seat card's: a Zaklęcie has no place on the body
   * and cannot go in the Plecak (9.3 keeps it concealed and 2.6 counts it
   * separately), so the only journey it can make is within this row. Sharing
   * the seat card's carry would offer places it can never land in.
   */
  const [lifted, setLifted] = useState<string | null>(null);
  /** Whether the hand is showing. Before the early return, like every hook. */
  const [showing, setShowing] = useState(true);

  /**
   * The hand in the order its owner put it in.
   *
   * It used to sort itself, live cards first, on the argument that card order
   * was "the order they happened to arrive in, which answers nothing". That was
   * true while there was no way to arrange it. There is now — the same row the
   * Plecak is, through the same `useRack` — so the order answers the thing a
   * player decided, and an app that reshuffled it under them would be undoing
   * that decision every time a window opened or closed. Which is live is still
   * said, in the greying: 9.1 puts the window on the card, and knowing that the
   * Magiczna Wędrówka is waiting for the start of a move is most of what you
   * plan a turn around.
   */
  const rack = useRack({
    cards: held.map((entry) => ({ ...entry, id: entry.holdingId })),
    liftedHoldingId: lifted,
    onReorder,
  });
  const hand = rack.arranged;

  /**
   * A click anywhere that is not the row, or Escape, puts the card back.
   *
   * The seat card does this for a Przedmiot and this row is the same gesture,
   * so it needs the same way out: a card left on the cursor is a gesture half
   * finished, and the first click anywhere would otherwise move it.
   */
  useEffect(() => {
    if (lifted === null) return;
    const timer = setTimeout(() => {
      const putBack = () => setLifted(null);
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") setLifted(null);
      };
      window.addEventListener("click", putBack);
      window.addEventListener("keydown", onKey);
      cancel = () => {
        window.removeEventListener("click", putBack);
        window.removeEventListener("keydown", onKey);
      };
    }, 0);
    let cancel: (() => void) | undefined;
    return () => {
      clearTimeout(timer);
      cancel?.();
    };
  }, [lifted]);

  // An empty hand under the pack is still worth a line, for the same reason an
  // empty pack is drawn: the cap is the thing being said, and "0 / 2" says it.
  // In the fight sheet there is no cap to report and nothing to do, so nothing
  // is drawn.
  if (held.length === 0 && (frame === "panel" || capacity === undefined)) return null;

  const section = frame === "section";
  // The count against what will fit, exactly as the pack says it — and the same
  // red when there is no room, which is the moment 9.4 starts to bite.
  const tally =
    capacity === undefined ? (
      `(${held.length})`
    ) : (
      <span className={held.length >= capacity ? "text-vermilion" : "text-muted/70"}>
        {held.length} / {capacity}
      </span>
    );

  return (
    // Folded away like the pack above it and the Zdolności below. Open to begin
    // with, because a hand you cannot see is a hand you cannot plan with — but
    // six Zaklęcia is six squares, and a seat card is read for other things too.
    //
    // Controlled outright rather than left to the browser, which is the pack's
    // arrangement kept for the sake of one behaviour rather than two.
    <div className={section ? "" : "mt-4 rounded-lg border border-magia/30 bg-panel/60 p-3"}>
    <Fold
      // A section in the seat card, or a panel of its own on a table screen:
      // the same fold either way, and only the box round it differs.
      first={!section}
      title={title ?? (section ? "Zaklęcia" : "Twoje Zaklęcia")}
      tally={tally}
      /* Which Zaklęcia, kept on the bar while the hand is shut — the same
         thing the Plecak and Przyjaciele keep, for the same reason: „1 / 1"
         says how full the hand is and nothing about what is in it. Only ever
         your own hand: 9.3 keeps everybody else's concealed, and this
         component is never given anybody else's cards. */
      aside={
        showing || hand.length === 0 ? undefined : (
          <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-magia/80">
            {hand.map((entry) => SPELL_BY_ID.get(entry.cardId)?.name ?? entry.cardId).join(" · ")}
          </span>
        )
      }
      tone={section ? "text-muted" : "text-magia"}
      open={showing}
      onToggle={() => setShowing(!showing)}
    >
      {blocked && <p className="mb-2 text-[11px] text-muted">{blocked}</p>}
      {/* No room at all, said rather than drawn.
       *
       * 2.6's table starts [0, 0, 1, …], so a character of Magia 1 holds no
       * Zaklęcia — not a corner case but the ordinary state of half the box,
       * and the section for it was a heading, a red „0 / 0" and an empty
       * outline. Three things that each look like something has gone wrong and
       * together say nothing about the rule that made them.
       *
       * The threshold is the part worth printing. „You have no room" invites
       * the question this answers in the same breath: room arrives at Magia 2,
       * which is a thing a player can go and do something about.
       *
       * In 2.6's and 9.4's own verbs. „Zmieścić się" was mine and sounded like
       * luggage; the rulebook says a Postać *posiada* Zaklęcia, that a Magia
       * *pozwala* on a number of them, and that anything over it is a
       * *nadwyżka* to be dropped *natychmiast*. Copy that vocabulary and a
       * player who goes to the Instrukcja from here reads the same words twice.
       */}
      {capacity === 0 && (
        <p
          className={`p-1 text-[11px] leading-snug ${
            held.length > 0 ? "text-vermilion/90" : "text-muted"
          }`}
        >
          <Rules>
            {held.length > 0
              ? "Posiadasz więcej Zaklęć, niż wynika z twojej Magii — nadwyżkę trzeba natychmiast odrzucić (9.4)."
              : "Twoja Magia nie pozwala posiadać żadnych Zaklęć — pierwsze wolno przy Magii 2 (2.6)."}
          </Rules>
        </p>
      )}
      {/* Face up, because they are yours — 9.3 hides them from everyone else,
          not from you, and a hand you cannot see is a hand you cannot plan
          with. */}
      {/* The row, and the thing a card lands in.
          
          The same shape the Plecak has: the whole row answers while a card is
          in the air, and the gap that opens under the pointer says where in it.
          A Zaklęcie never leaves this row — it has no place on the body and
          does not go in the pack — so this is the only target there is. */}
      {/* The row itself goes away when it would hold nothing and could take
          nothing: with no room and no Zaklęcia there is no rack, no drop target
          and no gap to open, and an empty outline under the sentence above only
          contradicts it. Kept the moment either is true — one square of room is
          a place to aim at, and a Zaklęcie held over the cap has to be visible
          to be discarded. */}
      {(capacity !== 0 || held.length > 0) && (
      <div
        onDragOver={(event) => {
          if (!onReorder || !event.dataTransfer.types.includes(SPELL_DRAG)) return;
          event.preventDefault();
          rack.setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          rack.setDragOver(false);
          rack.setInsertAt(null);
        }}
        onDrop={(event) => {
          const before = rack.insertAt === null ? null : rack.lands(rack.insertAt);
          rack.setDragOver(false);
          rack.setInsertAt(null);
          setLifted(null);
          const holdingId = event.dataTransfer.getData(SPELL_DRAG);
          if (!holdingId) return;
          event.preventDefault();
          rack.moveWithin(holdingId, before);
        }}
        // A click with a card on the cursor puts it down, wherever the gap is —
        // and on the end when there is none, which is what the free squares
        // past the last card mean.
        onClick={() => {
          if (!lifted) return;
          const before = rack.insertAt === null ? null : rack.lands(rack.insertAt);
          rack.setInsertAt(null);
          rack.moveWithin(lifted, before);
          setLifted(null);
        }}
        className={`flex flex-wrap gap-3 rounded border p-1 transition ${
          lifted === null
            ? "border-transparent"
            : rack.dragOver
              ? "border-solid border-magia bg-magia/25"
              : "border-dashed border-magia/60 bg-magia/10"
        }`}
      >
        {hand.map((entry, index) => {
          const card = SPELL_BY_ID.get(entry.cardId);
          const script = spellScript(entry.cardId);
          const now = script ? castableNow(script, moment) : true;
          const needsVictim =
            script?.target === "postac" || script?.target === "siebie-lub-postac";
          // Only the one the app actually carries out. The Władca Zdarzeń names
          // a board card too, but it *moves* one and stays announced — offering
          // a picker there would ask for something nothing reads.
          const needsCard = script?.applies === "zdejmuje-karte";
          const aims = needsCard
            ? boardCards.map((entry) => ({
                key: entry.id,
                label: `${entry.name} — ${entry.where}`,
                target: { fieldCardId: entry.id },
              }))
            : opponents.map((seat) => ({
                key: String(seat.seatIndex),
                label: seat.name,
                target: { seatIndex: seat.seatIndex },
              }));
          const mustAim = (needsVictim || needsCard) && aims.length > 0;
          const name = card?.name ?? entry.cardId;

          return (
            // The same square the pack is built from, at the same size. A
            // Zaklęcie and a Przedmiot are both a card you hold, and drawing
            // them at two different sizes in two different frames made the
            // hand read as something from another screen. The picture is the
            // illustration; the whole Karta is a hover away, as everywhere.
            <ItemSlot
              key={entry.holdingId}
              item={{
                holdingId: entry.holdingId,
                cardId: entry.cardId,
                card: {
                  cardId: entry.cardId,
                  name,
                  text: card?.text,
                  kindLabel: "Zaklęcie",
                  granted: entry.granted,
                },
                granted: entry.granted,
              }}
              label={name}
              tone="filled"
              dimmed={!now}
              disabled={busy}
              // A card would land in front of this one, so this and everything
              // after it steps aside to show the space it is going into — the
              // pack's gesture, drawn the pack's way.
              step={rack.stepAt(index)}
              quiet={lifted !== null}
              lifted={entry.holdingId === lifted}
              draggable={Boolean(onReorder) && !busy}
              onDragStart={(event) => {
                event.dataTransfer.setData(SPELL_DRAG, entry.holdingId);
                event.dataTransfer.effectAllowed = "move";
                setLifted(entry.holdingId);
              }}
              onDragEnd={() => {
                setLifted(null);
                rack.setInsertAt(null);
              }}
              onDragOver={() =>
                rack.setInsertAt(rack.itsOwnSquare(entry.holdingId) ? null : entry.holdingId)
              }
              onPointerEnter={() =>
                lifted !== null &&
                rack.setInsertAt(rack.itsOwnSquare(entry.holdingId) ? null : entry.holdingId)
              }
              /**
               * One click picks it up; the next puts down what is on the
               * cursor, in front of the card it lands on. The same rule the
               * pack has, for the same reason: clicking moves things and
               * hovering reads them, and a gesture that meant "pick up" on one
               * card and "let me look" on the next was the thing the pack got
               * rid of. The Karta is still a hover away, as everywhere.
               */
              onClick={(event) => {
                if (!onReorder) {
                  return onInspect({
                    cardId: entry.cardId,
                    name,
                    text: card?.text,
                    kindLabel: "Zaklęcie",
                    granted: entry.granted,
                  });
                }
                event.stopPropagation();
                if (lifted === null) return setLifted(entry.holdingId);
                if (lifted !== entry.holdingId) rack.moveWithin(lifted, rack.lands(entry.holdingId));
                rack.setInsertAt(null);
                setLifted(null);
              }}
              // Two clicks on the card speak it — the same gesture that puts
              // a Przedmiot on, for the act that is a hand's equivalent. It
              // goes through the same question the button below does, so a
              // Zaklęcie is never spent by a double-click that missed.
              onDoubleClick={
                now && !busy && !blocked
                  ? () => (mustAim ? setAiming(entry.holdingId) : onCast(entry.holdingId, {}))
                  : undefined
              }
            >
              {/* When it may be spoken and at what, under the card that says
                  it. Almost every Zaklęcie opens with a clause about its
                  moment — "przed wykonaniem ruchu", "w dowolnej chwili" — and
                  that clause is most of what you need to know while deciding
                  which to hold and which to spend. It used to be a badge on
                  the corner showing the first of them and hiding the rest.
                  Lit when the window is open, so a hand can be read at a
                  glance for what is live. */}
              {script && (
                <div className="text-center leading-tight" style={{ width: SLOT_WIDTH }}>
                  <p className={`text-[10px] ${now ? "text-magia" : "text-muted/60"}`}>
                    {script.timing.map((when) => TIMING_LABEL[when]).join(" / ")}
                  </p>
                  <p className="text-[10px] text-muted/60">{TARGET_LABEL[script.target]}</p>
                </div>
              )}

              {aiming === entry.holdingId && mustAim ? (
                <div
                  className="flex flex-wrap justify-center gap-1"
                  style={{ width: SLOT_WIDTH }}
                >
                  {aims.map((aim) => (
                    <button
                      key={aim.key}
                      disabled={busy || blocked !== null}
                      onClick={() => {
                        onCast(entry.holdingId, aim.target);
                        setAiming(null);
                      }}
                      className="rounded border border-magia/50 px-1.5 py-0.5 text-[10px] text-ink transition hover:bg-magia/20 disabled:opacity-50"
                    >
                      {aim.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setAiming(null)}
                    className="text-[9px] text-muted underline hover:text-ink"
                  >
                    anuluj
                  </button>
                </div>
              ) : (
                <button
                  disabled={busy || !now || blocked !== null || (needsCard && aims.length === 0)}
                  onClick={() => (mustAim ? setAiming(entry.holdingId) : onCast(entry.holdingId, {}))}
                  title={
                    now
                      ? script?.effect
                      : `tylko ${script?.timing.map((t) => TIMING_LABEL[t]).join(" / ")}`
                  }
                  style={{ width: SLOT_WIDTH }}
                  className="rounded border border-magia/50 px-2 py-1 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
                >
                  {needsCard && aims.length === 0 ? "brak Kart" : now ? "Rzuć" : "nie teraz"}
                </button>
              )}
            </ItemSlot>
          );
        })}
        {/* How much room 2.6 has left, drawn — the same squares the Plecak
            draws for 5.4, from the same component and in the same size. Not
            places to aim at: past the last card is the end of the row, which is
            what a free square means. */}
        {capacity !== undefined &&
          Array.from({ length: Math.max(0, capacity - held.length) }, (_, i) => (
            <ItemSlot
              key={`wolne-${i}`}
              item={null}
              label="wolne"
              glyph="+"
              tone="empty"
              disabled
              onPointerEnter={() => rack.setInsertAt(null)}
              onDragOver={() => rack.setInsertAt(null)}
            />
          ))}
      </div>
      )}
    </Fold>
    </div>
  );
}
