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
import { type Slot } from "@/lib/engine/slots";
import { characterImageUrl } from "@/lib/view/cardImages";
import { type TileCard } from "./card-tile";
import { CarriedCard, type Carried } from "./carry";
import { Hand } from "./hand";
import { dismissableOpen } from "./overlay";
import { PLACES_ON_THE_BODY, SlotPanel } from "./slot-panel";
import { CHARACTERS, asNature, type Seat, wornBySlot } from "./table";
import Image from "next/image";
import { characterKind } from "@/lib/engine/polish";
import { SEAT_COLOURS } from "@/lib/view/boardMap";
import { RailStat } from "./token-rail";
import { NatureLine, natureSaid } from "./nature-line";
import { Lookable } from "./lookable";
import { EffectMark } from "./effect-mark";
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
  /** Whether the sheet is open, the way the Plecak and the Zaklęcia inside it fold. */
  const [showing, setShowing] = useState(true);
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
      <details open={showing}>
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
      {/* The heading every other foldable thing in this card has, and for the
          same reason: PLECAK, ZAKLĘCIA and NA SOBIE all say what they are in
          small capitals with the browser's own triangle beside them, and the
          one section whose control was the player's name did not read as a
          control at all. So the name row stops being the handle and this is it
          — above the name, in the idiom the card already speaks.

          Folded, it carries what the card still has to answer: who, what, the
          Natura (7.2 — the one thing neither printed on the picture nor
          derivable from the cards in hand) and the four numbers in the order
          the Karta prints them up its own edges. */}
      <summary
        onClick={(event) => {
          event.preventDefault();
          setShowing(!showing);
        }}
        /* Not `flex`: a summary laid out as a flex box stops being a
           `list-item` and loses the browser's own triangle with it — which is
           the whole of what makes these headings read alike. The folded row
           does its own laying out, one level in. */
        className="mb-3 cursor-pointer text-[11px] uppercase tracking-widest text-muted"
      >
        Postać
        {!showing && (
          <span className="ml-3 inline-flex w-[calc(100%-5rem)] items-center gap-2 align-middle normal-case tracking-normal">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: SEAT_COLOURS[seat.seat_index % SEAT_COLOURS.length] }}
              aria-hidden
            />
            <span className="truncate text-ink">
              {seat.player_name ?? `Miejsce ${seat.seat_index + 1}`}
            </span>
            {character && (
              <Lookable
                kind="character"
                id={character.id}
                name={character.name}
                eqMode={slotted ? "slots" : "classic"}
                className="shrink-0 text-muted"
              />
            )}
            {/* The four numbers next to the name they belong to, ahead of the
                Natura: they are what the rails say, in the order the Karta
                prints them up its own edges, and they change every turn. The
                Natura changes about twice a game and reads as a caption after
                them rather than as a column between them and the name. */}
            <span className="tnum shrink-0">
              <span className="text-miecz">{seat.sword_total}</span>
              <span className="text-muted"> / </span>
              <span className="text-magia">{seat.magic_total}</span>
              <span className="text-muted"> / </span>
              <span className="text-zycie">{seat.life}</span>
              <span className="text-muted"> / </span>
              <span className="text-zloto">{seat.gold}</span>
            </span>
            {/* The same words the line under the Karta uses, minus the label
                it does not need: with the Karta out of sight there is nothing
                for "Natura:" to disambiguate. A changed one says only what it
                is now — the Karta Zmiany that says what it *was* is a picture,
                and this row has no room for a picture. */}
            {character &&
              (() => {
                const said = natureSaid(seat.nature, character.nature);
                return said ? (
                  <span className="shrink-0 truncate text-muted/70">{said.label}</span>
                ) : null;
              })()}
            {/* What the body is carrying, where the body itself sits when the
                sheet is open — the right-hand end of the row. A count and not
                a list: which places are filled is what the paper doll is for,
                and this is the one thing about it worth knowing without
                opening it. Only in the variant that has places at all. */}
            {slotted && (
              <span className="ml-auto shrink-0 text-muted/70">
                na sobie{" "}
                <span className="tnum text-ink/80">
                  {Object.keys(wornBySlot(seat)).length} / {PLACES_ON_THE_BODY}
                </span>
              </span>
            )}
          </span>
        )}
      </summary>

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
          style={{ background: SEAT_COLOURS[seat.seat_index % SEAT_COLOURS.length] }}
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
          <span className="flex shrink-0 items-center gap-1">
            {seat.effects.map((mark) => (
              <EffectMark key={mark.id} mark={mark} nature={asNature(seat.nature)} />
            ))}
          </span>
        )}

      </header>

      {character && (
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
            {slotted && (
              /* `shrink-0`, so the row's `justify-between` pushes it to the
                 far edge: the Karta and the body are two things to look at,
                 and a body that stretches to fill the gap makes one wide
                 object out of them. It was `flex-1` for a version, which is
                 what pulled it in against the card. */
              <div className="shrink-0">
                <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">
                  Na sobie{" "}
                  <span className="text-muted/70">
                    {Object.keys(wornBySlot(seat)).length} / {PLACES_ON_THE_BODY}
                  </span>
                </p>
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
              </div>
            )}
          </div>
        </>
      )}
      </details>

      {character ? (
        <>
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
