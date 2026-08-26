"use client";

/**
 * One player's whole sheet: their Karta Postaci, what they are worth, what they
 * are under, and what they are carrying.
 *
 * The marks, the rails and the żetony are its own parts and nothing else draws
 * them, so they live here rather than in four files of their own — the card is
 * the thing with an outside, and this is all of its inside.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { type Nature } from "@/data/types";
import { describeAbility } from "@/lib/engine/abilityText";
import { abilitiesOfCharacter, asCharacterId, notesForCharacter } from "@/lib/engine/characters";
import { type Slot } from "@/lib/engine/slots";
import { cardArtUrl, characterImageUrl } from "@/lib/view/cardImages";
import { tokensFor } from "@/lib/view/tokens";
import { useCardPreview } from "./card-preview";
import { type TileCard } from "./card-tile";
import { CarriedCard, type Carried } from "./carry";
import { Hand } from "./hand";
import { SLOT_ART_HEIGHT, SLOT_WIDTH } from "./item-slot";
import { dismissableOpen } from "./overlay";
import { SlotPanel } from "./slot-panel";
import { CARD_NAMES, CARD_TEXTS, CHARACTERS, asNature, type Seat, wornBySlot } from "./table";
import Image from "next/image";
export function SeatCard({
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
  // its last token taken off the table (4.4), and the empty space where its
  // żetony were is what the table itself shows.
  //
  // There was a "0" drawn here instead, on the reasoning that a gap would read
  // as a stat the app had failed to work out. What actually reads that way is
  // two zeros in a column — one standing where the tokens go and one under it
  // as the reading — because the rail below always prints the figure when the
  // pile is not already it. The gold has done it this way from the start: an
  // empty stack, and the numeral saying nought.

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
  // One token says its own value on its face. Gold is never one token in the
  // sense that matters — its stack is all ones — and a total the żetony do not
  // add up to has to be written down whatever the pile looks like.
  const saysItself =
    stat !== "zloto" && shown === value && tokensFor(value).length === 1;

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
        The number, wherever the pile is not already the number.

        A pile of nine tokens is not a reading of nine, which is why the gold
        has carried a numeral from the start and the other three want one too.
        But a rail showing ONE token has nothing to add: the żeton has its value
        printed on its face, so "1" under a tile reading 1 is the same fact
        twice and makes a small character's card look like a stat block.

        Gold keeps it always — that stack is all ones and capped at three
        columns, so the picture never states the amount — and so does any rail
        where the total differs from what the żetony show, since 1.2 keeps a
        Przedmiot's points off them and the numeral is then carrying what the
        tokens cannot.

        The space is held either way, so four rails with different answers still
        end level.
      */}
      <span
        title={
          inFight !== undefined && inFight !== shown
            ? `${label}: ${shown}, w walce ${inFight} (własne ${value})`
            : shown !== value
              ? `${label}: ${shown} (własne ${value})`
              : `${label}: ${shown}`
        }
        className={`tnum mt-1 min-h-[13px] text-[13px] font-medium leading-none ${STAT_COLOUR[stat] ?? "text-ink"}`}
      >
        {saysItself ? "" : shown}
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

