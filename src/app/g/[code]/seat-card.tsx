"use client";

/**
 * One player's whole sheet: their Karta Postaci, what they are worth, what they
 * are under, and what they are carrying.
 *
 * The marks, the rails and the żetony used to live here too, on the argument
 * that nothing else draws them — the card is the thing with an outside, and
 * that was all of its inside. The ownership half of that is still true and
 * nothing else imports them even now. What changed is the evidence: at a
 * thousand lines, three of this file's doc comments had come adrift from the
 * functions they described and were sitting in a stack at the bottom above
 * constants they had nothing to do with, left behind by an earlier split. A
 * file only one component owns is still a file people stop reading to the end
 * of, and explanations quietly parting company with the code is what that looks
 * like before anybody notices.
 *
 * So: `token-rail.tsx`, `nature-line.tsx` and `effect-mark.tsx`, with the
 * comments back on their functions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { describeAbility } from "@/lib/engine/abilityText";
import { abilitiesOfCharacter, asCharacterId, notesForCharacter } from "@/lib/engine/characters";
import { SLOT_LABEL, STORAGE, openStorage, type Slot } from "@/lib/engine/slots";
import { characterImageUrl } from "@/lib/view/cardImages";
import { type TileCard } from "./card-tile";
import { CarriedCard, type Carried } from "./carry";
import { Hand } from "./hand";
import { TrophySection } from "./trophy-section";
import { dismissableOpen } from "./overlay";
import { PLACES_ON_THE_BODY, SlotPanel } from "./slot-panel";
import { CHARACTERS, asNature, type Seat, wornBySlot } from "./table";
import { forbiddenTo } from "@/lib/engine/holdings";
import Image from "next/image";
import { characterKind, plural } from "@/lib/engine/polish";
import { seatColour } from "@/lib/view/boardMap";
import { RailStat, StatFigure } from "./token-rail";
import { FightsForYou } from "./fights-for-you";
import { Fold } from "./fold";
import { NatureLine, natureSaid } from "./nature-line";
import { Lookable } from "./lookable";
import { EffectMark, EffectTally } from "./effect-mark";
import { EffectList } from "./effect-list";
import { TILE_GAP } from "./tile-row";
/**
 * How many marks the folded bar shows before it starts counting.
 *
 * Three is where the row stops being readable beside four numbers, a name and a
 * Natura. The rest become "+2", which says there is more without pretending to
 * say what — and carries their titles on its own hover, so nothing is lost that
 * was not already a hover away.
 */
/**
 * Neither, good, bad — the order effects are read in, wherever they are read.
 *
 * The folded bar counts them in this order and the open card draws them in it,
 * because they are one set shown two ways and somebody folding the card to
 * check should find the same thing in the same place.
 *
 * Within a tone they stay in the order they started: `effectsFor` reads them
 * `.order("created_at")` and this sort is stable, so the secondary key is the
 * one the server already sorted by and neither end has to carry a timestamp to
 * get it. The four ad-hoc statuses — a lost turn, the Kamień, a barred Most —
 * have no start of their own and keep the place `allStatuses` gives them.
 */
const TONE_ORDER = ["obojetny", "dobry", "zly"] as const;

/**
 * What is helping and what is not, said in words.
 *
 * No "otwórz Kartę, żeby zobaczyć które" on the end any more: it was a sentence
 * explaining a click, hanging off the thing that answers the click, under a
 * cursor that already says it can be pressed.
 *
 * Polish counts in three — jeden efekt, dwa efekty, pięć efektów — so the
 * sentence is built rather than pluralised with an "s", the way every other
 * count in this app is (`plural` in `polish.ts`). "Obojętne" are left out of
 * both numbers and named on the end: they are true of the character and neither
 * help nor hurt, and folding them into either count would be an opinion.
 */
function effectsSaid(effects: readonly { tone: string; title: string }[]): string {
  const count = (tone: string) => effects.filter((mark) => mark.tone === tone).length;
  const said = (n: number, one: string, few: string, many: string) =>
    `${n} ${plural(n, one, few, many)}`;
  const words: Record<string, [string, string, string]> = {
    obojetny: ["inny efekt", "inne efekty", "innych efektów"],
    dobry: ["wzmocnienie", "wzmocnienia", "wzmocnień"],
    zly: ["osłabienie", "osłabienia", "osłabień"],
  };
  // `TONE_ORDER`, like the marks and the counts: one set, three readings, one
  // order between them.
  return TONE_ORDER.filter((tone) => count(tone) > 0)
    .map((tone) => said(count(tone), ...words[tone]))
    .join(", ");
}

export function SeatCard({
  seat,
  active,
  canAdjust,
  canCorrect,
  isMine,
  slotted,
  onAdjust,
  onDrop,
  asked = [],
  onTrade,
  trophyMode,
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
  /** Cards whose drop the server has not answered yet — see `asked` in the table. */
  asked?: readonly string[];
  /** How many Miecze to buy (1.4); the engine picks the cheapest Karty for it. */
  onTrade: (
    cardIds: readonly string[],
    deal: { swords: number; points: number; wasted: number },
  ) => void;
  /** Which trofea rule this table plays (1.4) — `game.trophy_mode`. */
  trophyMode: "points" | "cards";
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

  /**
   * Which storage places this character actually has open.
   *
   * The squares on this card that are not properties of the character: they
   * come with a Karta and go with it, and drawing an empty one for somebody who
   * has never seen the bag would be an offer the rules do not make. Asked
   * through the engine so the square on screen and the refusal on the server
   * cannot come to different answers — in slotowy the Karta has to be worn,
   * which is what this variant asks of every bearer.
   */
  const stores = openStorage(seat.holdings, slotted ? "slots" : "classic");

  /**
   * The card on the cursor.
   *
   * Held here rather than in either half, because the whole point of picking
   * something up is to put it down somewhere else — and "somewhere else" is
   * usually the other half.
   */
  /**
   * The marks in the order the folded bar counts them.
   *
   * Folded, this card says "▲2 ▼1 ■1"; open, it draws the marks themselves.
   * They are the same set read two ways, so they are read in the same order —
   * otherwise the two disagree about which effect is which, and the one place
   * that is worst is the one where somebody has just folded the card to check.
   *
   * A stable sort, so cards that share a tone keep the order they arrived in.
   */
  const marks = [...seat.effects].sort(
    (a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone),
  );

  /** Whether the sheet is open, the way the Plecak and the Zaklęcia inside it fold. */
  const [showing, setShowing] = useState(true);
  /** The powers, which were the one fold here the browser held for itself. */
  const [abilities, setAbilities] = useState(false);
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
  /**
   * Nothing is in the air any more, whichever half was holding it.
   *
   * There are two: a card picked up by clicking (`carried`) and one picked up
   * by dragging (`dragging`), and both feed `liftedHoldingId` and
   * `movingCardId` — the fade on the place it came from, and the lit places it
   * could go. Clearing one and not the other leaves the table looking exactly
   * like a gesture still in progress, which is the state a mixed run of
   * double-clicks, drags and corner buttons kept ending in.
   */
  const putDown = useCallback(() => {
    setCarried(null);
    announceDrag(null);
  }, [announceDrag, setCarried]);

  /**
   * Whether this character may use that card at all (5.3).
   *
   * Asked here rather than only by the server, and the difference is a second
   * of theatre: the browser moves a card the moment you drop it, so a Topór a
   * Chaotyczna Postać may not hold went onto the arm, sat there looking worn,
   * and jumped back when the refusal arrived. A card that cannot go somewhere
   * should not appear to go there — the place says no while the card is still
   * in the air, and the drop does nothing.
   */
  const mayWear = (cardId: string) => !forbiddenTo(cardId, asNature(seat.nature));

  const place = (slot: Slot | null) => {
    if (!carried) return;
    if (carried.from === (slot ?? "plecak")) return putDown();
    // Off the body is always allowed — that is how a card this character may
    // not hold gets taken off in the first place.
    if (slot !== null && !mayWear(carried.cardId)) return putDown();
    onEquip(carried.holdingId, slot);
    putDown();
  };

  // A click anywhere that is not a place, or Escape, puts it back. The places
  // stop their own clicks from reaching the window, so this only hears the
  // ones that missed. Registered a tick late so the click that picked the card
  // up does not immediately put it down again.
  useEffect(() => {
    if (!carried) return;
    let cancel: (() => void) | undefined;
    const timer = setTimeout(() => {
      const putBack = () => putDown();
      const onKey = (event: KeyboardEvent) => {
        // Not while a sheet is open over the table: Escape is the top one's.
        if (event.key === "Escape" && !dismissableOpen()) putDown();
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
   * A drag ends when it ends, wherever that is.
   *
   * `dragend` fires on the element the drag started from — and a drop that
   * lands moves that card, so React has usually unmounted it by the time the
   * event would arrive. The handler on the card then never runs, `dragging`
   * stays set, and the table sits there with the origin faded and every place
   * it could go lit up: a gesture that finished minutes ago, still showing.
   *
   * Listening at the window catches all of it — the drop that landed, the one
   * that missed, the drag let go outside the window — and `drop` is here as
   * well as `dragend` because one of the card handlers stops propagation, so
   * that one would otherwise arrive only as the `dragend` that goes missing.
   */
  useEffect(() => {
    if (!dragging) return;
    const done = () => announceDrag(null);
    window.addEventListener("dragend", done, true);
    window.addEventListener("drop", done, true);
    return () => {
      window.removeEventListener("dragend", done, true);
      window.removeEventListener("drop", done, true);
    };
  }, [dragging, announceDrag]);

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
    const putBack = () => putDown();
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
    /**
     * The whole sheet folds away, the way the Plecak and the Zaklęcia inside it
     * already do.
     *
     * It is the tallest thing on the screen and the one you need least often
     * once you know what you are holding: mid-game the questions are about the
     * board and about whose turn it is, and your own Karta answers neither. So
     * the header carries what a folded card still has to say — what you are,
     * what you are worth, and what Natura you are of — and the rest is one
     * click away.
     */
    <article
      className={`rounded-lg border bg-panel p-4 transition ${
        active ? "border-ochre shadow-[0_0_0_1px_var(--color-ochre)]" : "border-edge"
      }`}
    >
      {/* The Postać and what it is wearing, folded together and apart from the
          rest. What is under this heading is the *character sheet* — who you
          are, what you are worth, what you have on — and the two things below
          it are hands of cards, which fold on their own and are wanted at
          different moments. Folding all three from one place would mean
          reaching for the Plecak and getting the Karta with it. */}
      <Fold
        first
        title="Postać"
        open={showing}
        onToggle={() => setShowing(!showing)}
        /**
         * What the card still has to answer while it is shut: who, what, the
         * four numbers in the order the Karta prints them up its own edges, and
         * the Natura — 7.2's, the one thing about a character that is neither
         * printed on the picture nor derivable from the cards in hand.
         */
        aside={
          !showing ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 normal-case tracking-normal">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: seatColour(seat.seat_index) }}
                aria-hidden
              />
              <span className="truncate text-ink">
                {seat.player_name ?? `Miejsce ${seat.seat_index + 1}`}
              </span>

              {/* A Lookable only here: open, the whole Karta is six lines below
                  and a hover would cover the card with a copy of the card. */}
              {character && (
                <Lookable
                  kind="character"
                  id={character.id}
                  name={character.name}
                  eqMode={slotted ? "slots" : "classic"}
                  className="shrink-0 text-muted"
                />
              )}
              {/* The same figures the rails show, said the same way — all
                  three of 1.5's, with the ones that add nothing left out.
                  Ahead of the Natura, which changes about twice a game and
                  reads as a caption after them. */}
              <span className="tnum shrink-0">
                <span className="text-miecz">
                  <StatFigure
                    value={seat.sword_own}
                    total={seat.sword_total}
                    inFight={seat.sword_in_fight}
                  />
                </span>
                <span className="text-muted"> / </span>
                <span className="text-magia">
                  <StatFigure
                    value={seat.magic_own}
                    total={seat.magic_total}
                    inFight={seat.magic_in_fight}
                  />
                </span>
                <span className="text-muted"> / </span>
                <span className="text-zycie">{seat.life}</span>
                <span className="text-muted"> / </span>
                <span className="text-zloto">{seat.gold}</span>
              </span>
              {character &&
                (() => {
                  const said = natureSaid(seat.nature, character.nature);
                  return said ? (
                    <span className="shrink-0 truncate text-muted/70">{said.label}</span>
                  ) : null;
                })()}
              {/* How much is helping and how much is not, counted.
                  
                  Not the marks themselves: a folded card is a line, and six
                  glyphs on it compete with the four numbers that are the reason
                  anybody folded it. Two numbers in the two colours the marks
                  already use say the same shape of thing at a glance — and the
                  question they raise, *which* ones, is answered by opening the
                  card, which is what clicking them does. The words are on the
                  hover for anybody who does not want to open it. */}
              {seat.effects.length > 0 && (
                <span
                  className="tnum shrink-0 cursor-pointer"
                  title={effectsSaid(seat.effects)}
                  onClick={(event) => {
                    // The bar is the fold's own handle, so this would open the
                    // card by simply falling through — but going through the
                    // toggle means it opens whichever way it is now, and reads
                    // as the button it looks like.
                    event.preventDefault();
                    event.stopPropagation();
                    setShowing(true);
                  }}
                >
                  {/* Up, down, and neither — the same three the marks
                      themselves are coloured by, in the same three colours. A
                      square because it is the shape with no direction in it, at
                      the weight the two triangles have.
                      
                      `status.ts` draws a frozen character with the same square,
                      in vermilion. They do not collide in practice: this one is
                      grey and carries a number, and the two never appear on the
                      same line — the bar is what a *folded* card shows and the
                      marks are what an open one does. */}
                  <EffectTally effects={seat.effects} />
                </span>
              )}
              {/* What the body is carrying, where the body itself sits when the
                  sheet is open — the right-hand end. Only in the variant that
                  has places at all. */}
              {slotted && (
                <span className="ml-auto shrink-0 text-muted/70">
                  na sobie{" "}
                  <span className="tnum text-ink/80">
                    {Object.keys(wornBySlot(seat)).length} / {PLACES_ON_THE_BODY}
                  </span>
                </span>
              )}
            </span>
          ) : undefined
        }
      >
      {/* A fixed height, so a seat card does not jump when an effect appears or
          wears off — the row is as tall as a mark can be whether or not any are
          there.

          Centred in it rather than aligned to the top, which is what puts the
          name level with the marks: a mark is 35 of the row's 36 and a line of
          the name is about two thirds of it, so hanging both from the top left
          the name riding above the middle of everything beside it.

          And centred rather than sat on a shared baseline. A picture has no
          baseline, so matching one stretches the row to whatever the tallest
          mark happens to be — which is the fixed height gone, and the jump back.

          Because the height is fixed and both children are centred in it, where
          the name sits depends on the name alone. Effects appearing and wearing
          off cannot move it. */}

      {/* A fixed height, so a seat card does not jump when an effect appears or
          wears off — the row is as tall as a mark can be whether or not any are
          there. Centred in it rather than aligned to the top, which is what
          puts the name level with the marks. */}
      <header className="mb-3 flex h-9 items-center gap-2">
        {/* Your colour, beside your name, on the card you look at most.
            Everything else in the app already speaks in these — the figure on
            the board, the dots down the journal, the tinted card in the queue —
            and nothing anywhere said which one was yours. */}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: seatColour(seat.seat_index) }}
          aria-hidden
        />
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
        {/* What you are, beside who you are. The roster has said it next to
            every other player's name from the beginning; your own was the one
            place you had to read the picture to find out.

            A plain word and not a `Lookable`: the whole Karta is six lines
            below, so a hover that opens it again covers the card with a copy of
            the card. Folded it *is* a Lookable — see the summary — because
            then there is nothing else on screen to read. */}
        {character && (
          <span className="shrink-0 text-[11px] text-muted">{character.name}</span>
        )}
        {/* What is true of this character right now, beside the name it is
            true of. A mark is a reminder that something holds, not an
            explanation — the hover carries the whole of it, including how long
            it has left, which is the part a player is actually deciding
            around. */}
        {/* Beside the name, not across the card from it: these are true of
            the person the name belongs to, and at the far edge of a wide seat
            card they read as belonging to whatever they happen to be next to. */}
        {seat.effects.length > 0 && (
          <span className={`flex shrink-0 items-center ${TILE_GAP.mark}`}>
            {marks.map((mark) => (
              <EffectMark key={mark.id} mark={mark} nature={asNature(seat.nature)} />
            ))}
          </span>
        )}

      </header>

      {character && (
        <>
          {/* What is true of this character, above everything it owns.

              A Kamień or a Krąg Płomieni decides whether the rest of this card
              can be acted on at all, so it is read before the pack rather than
              under it. Not behind a fold of its own: the card already has one,
              and a reading aid nobody can see without opening two things is one
              nobody reads. The marks beside the name stay — they are what a
              *folded* card shows, and this is what an open one does. */}
          <EffectList effects={marks} />

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
              {/* Two equal side tracks, so the Karta is centred in the row.
                  It was a plain flex row, which put the Karta wherever the two
                  rails happened to leave it — and the rails are as wide as the
                  piles in them, so a character with three columns of Miecz and
                  one coin had it sitting well right of the middle. Nothing on
                  the row itself gave that away; what gave it away was the line
                  underneath, centred on the row and therefore not on the card
                  it is about.

                  `1fr` and not a fixed width: a pile is at most three columns
                  but a rail also carries its numeral and, in companion mode,
                  its ± — and a track sized for the pile alone would clip them.
                  Under intrinsic sizing both fr tracks resolve to the wider of
                  the two, which is the same answer without the guess.

                  Each rail is then pinned to the edge of the Karta rather than
                  left to fill its track. The piles are captions for the words
                  printed up the card's own edges, and a caption floating in the
                  middle of a wide track is a caption for nothing. The tracks
                  stay equal either way, so the Karta stays centred. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1">
                <div className="flex flex-col justify-between justify-self-end gap-2 py-1">
                  <RailStat
                    label="Miecz"
                    value={seat.sword_own}
                    total={seat.sword_total}
                    inFight={seat.sword_in_fight}
                    stat="sword"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                  <RailStat
                    label="Magia"
                    value={seat.magic_own}
                    total={seat.magic_total}
                    inFight={seat.magic_in_fight}
                    stat="magic"
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
                        kindLabel: characterKind(character),
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
                      /* The Karta Postaci is the largest thing above the fold
                         and is on screen from the first paint, so it is the
                         Largest Contentful Paint on every table — Next says so
                         in the dev log. Lazy by default means it is fetched
                         after layout, which is the one image on the page that
                         should not be. `character-picker` already marks its
                         own for the same reason. */
                      priority
                    />
                  </button>
                )}

                <div className="flex flex-col justify-between justify-self-start gap-2 py-1">
                  <RailStat
                    label="Złoto"
                    value={seat.gold}
                    stat="gold"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                  <RailStat
                    label="Życie"
                    value={seat.life}
                    stat="life"
                    canAdjust={canCorrect}
                    onAdjust={onAdjust}
                  />
                </div>
              </div>

              <NatureLine nature={seat.nature} printed={character.nature} />
              {/* Under the rails, because it explains the rails. The two
                  figures above go *down* when a Rycerz joins, and this is the
                  card saying so. */}
              <FightsForYou
                cardId={seat.fights_for_you}
                sword={seat.sword_in_fight}
                magic={seat.magic_in_fight}
              />
            </div>

            {/* The body, beside the character card, in the slotted variant
                only — klasyczny play has nowhere to put anything. */}
            {/* The body does not fold on its own.
                
                It folds with the Karta beside it, under POSTAĆ, because the two
                are one answer: who you are and what you have on. A second
                handle inside the section its own heading already folds was one
                control too many — reaching for the sheet and hitting the body
                is what it actually got used for. The tally stays, since it is
                the part worth reading without counting. */}
            {(slotted || stores.length > 0) && (
              /* `shrink-0`, so the row's `justify-between` pushes it to the
                 far edge: the Karta and the body are two things to look at,
                 and a body that stretches to fill the gap makes one wide
                 object out of them. It was `flex-1` for a version, which is
                 what pulled it in against the card. */
              <div className="shrink-0">
                {/* The same heading as every other section, through the same
                    component — it simply does not fold, which is what a `Fold`
                    with no handler is. It was a hand-written `<p>` wearing the
                    same classes, which is exactly how four of these drifted
                    apart in the first place. */}
                <Fold
                  first
                  /* Klasyczny has no body, so the heading is the Karta's own
                     name rather than a place on a character — and no tally,
                     because one square out of one is not a sum anybody needs. */
                  title={slotted ? "Na sobie" : "Schowane"}
                  tally={
                    slotted
                      ? `${Object.keys(wornBySlot(seat)).length} / ${PLACES_ON_THE_BODY}`
                      : undefined
                  }
                >
              <SlotPanel
                /* The whole doll in slotowy; in klasyczny the one place the
                   Karta makes, in the same corner, so a player who knows where
                   to look finds it in the same spot at either kind of table. */
                /* The doll minus the storage squares that are not open, or —
                   in klasyczny, which has no doll — only those squares. */
                places={
                  slotted
                    ? (Object.keys(SLOT_LABEL) as Slot[]).filter(
                        (slot) => !STORAGE.includes(slot) || stores.includes(slot),
                      )
                    : stores
                }
                /* Klasyczny has no body to draw, so the one square the Karta
                   makes stands on its own. Slotowy is the doll either way —
                   with the Sakwa's square in the corner or with a gap where it
                   would be. */
                layout={slotted ? "doll" : "row"}
                worn={wornBySlot(seat)}
                mayWear={mayWear}
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
                  putDown();
                  onEquip(holdingId, null);
                }}
                onUse={onUse}
                // A drag carries an id; a click carries nothing and means
                // "put down what I am holding".
                onDropInto={(holdingId, slot) =>
                  holdingId ? onEquip(holdingId, slot) : place(slot)
                }
              />
                </Fold>
              </div>
            )}
          </div>
        </>
      )}
      </Fold>

      {character ? (
        <>
          <Hand
            seat={seat}
            isMine={isMine}
            canAct={canAdjust}
            slotted={slotted}
            carried={carried}
            moving={movingCardId !== null}
            liftedHoldingId={liftedHoldingId}
            onCarry={setCarried}
            onDragging={announceDrag}
            onDrop={onDrop}
            asked={asked}
            onEquip={onEquip}
            onUse={onUse}
            onWand={onWand}
            onReorder={onReorder}
            onInspect={onInspect}
          />
          {/* After the Przyjaciele and before the Zaklęcia, so the card reads
              as one story: what you wear, what you carry, who walks with you,
              what you have killed, what you know. Each section a different kind
              of thing rather than four flavours of inventory. */}
          {spells}
          {/* After the Zaklęcia, not before them.
              
              Na sobie, Plecak and Przyjaciele are one kind of thing: three sorts
              of held object that add to your totals right now, which is what 1.5
              enumerates when it defines Całkowity Miecz. Trofea add nothing —
              they are a currency waiting to be converted — so sitting inside
              that run split it with something that is not a member of it.
              
              Their real sibling is the hand. Zaklęcia and trofea are the two
              things you *spend*: both leave you when used, both go to a used
              pile, neither changes a number while held. Side by side they read
              as a pair. The hand also goes first because it is consulted before
              every fight (17.3) and trofea a handful of times a game. */}
          <TrophySection
            seat={seat}
            isMine={isMine}
            mode={trophyMode}
            busy={!canAdjust}
            onTrade={isMine ? onTrade : undefined}
          />
          <CarriedCard carried={carried} />
          {/* Where the figure is standing is not repeated here. The board says
              it, the turn header says it for whoever is playing, and the roster
              says it for everybody else — a fourth copy under your own pack was
              the one nobody was reading. */}
          {character.abilities.length > 0 && (
            <Fold
              title="Zdolności"
              tally={character.abilities.length}
              /* Which of the powers the app applies for you, on the bar: a
                 Charakterystyka overrides the general rules (8.2), so knowing
                 which ones are being watched for is the difference between a
                 rule you can forget and one you have to. */
              aside={
                abilitiesOfCharacter(asCharacterId(seat.character_id)).length > 0 ? (
                  <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-verdigris/80">
                    {abilitiesOfCharacter(asCharacterId(seat.character_id))
                      .map(describeAbility)
                      .join(" · ")}
                  </span>
                ) : undefined
              }
              open={abilities}
              onToggle={() => setAbilities(!abilities)}
            >
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
            </Fold>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">bez postaci</p>
      )}
    </article>
  );
}
