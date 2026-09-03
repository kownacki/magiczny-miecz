"use client";

/**
 * The Karta you just turned over, at a size you can read, and what the app
 * knows it is. What you may *do* about it is `drawn-actions.tsx`.
 */

import { useEffect } from "react";
import { DrawSheet, type SheetChrome } from "./draw-sheet";
import { dismissableOpen } from "./overlay";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type EventCard } from "@/data/types";
import { cardImageUrl } from "@/lib/view/cardImages";
import { numeralMeaning, numeralOf } from "@/lib/engine/cards";
import { KolejkaStrip, worthShowing } from "./kolejka-strip";
import { scriptFor, describeDisposition } from "@/lib/engine/cardScript";
import { itemProfile, staysAs } from "@/lib/engine/abilityText";
import { CardFacts } from "./card-facts";
import { DrawnActions, type DrawnActionsProps } from "./drawn-actions";
import { coverageOf, manualNote, NOT_HANDLED } from "@/lib/engine/coverage";

const EVENTS = events as EventCard[];

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
  chrome,
  /**
   * Everything else, kept whole so it can be handed on whole.
   *
   * Eleven of these twenty were named here only to be written out again three
   * lines from the bottom — `ring`, `occupied`, `mySword`, `aggression`,
   * `busy`, `intent` and the five callbacks are not read in this file at all.
   * Spelling each one three times (type, destructure, forward) is three chances
   * to add a prop to `DrawnActions` and forget one of them here, for nothing:
   * the type already says the two surfaces are the same surface minus `chrome`.
   *
   * `chrome` is the one thing this file owns, so it is the one thing lifted out
   * of the rest — which makes the sentence below structural rather than prose.
   */
  ...props
}: Omit<DrawnActionsProps, "canAct"> & {
  /**
   * The sheet's own frame: who is acting, whether this device may, the
   * minimise control and the error line.
   *
   * The one prop `DrawnActions` does not take, and the reason its props are
   * `Omit`ed rather than reused whole: `canAct` is read off this and handed
   * down explicitly, so the buttons never reach for chrome of their own.
   */
  chrome: SheetChrome;
}) {
  const { who, card, cards, resolved, fought, beaten, nature, eqMode, onLeave } = props;
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
  const label = CARD_CLASS_LABEL[card.cardClass] ?? card.cardClass;

  /**
   * Everything the app knows this Karta does, read once.
   *
   * The same `itemProfile` the hover panel is drawn from, so the sheet and the
   * hover cannot come to describe one card two ways — which they had, by the
   * sheet describing nothing. A Nieznajomy's whole content is how long it stays
   * and whom it is for, and the sheet drew both by hand; a Przedmiot's is its
   * slot and its bonuses, and the sheet drew neither, so KOŃ was a picture, a
   * name and an empty column.
   */
  const profile = itemProfile(known.id, eqMode);

  return (
    <DrawSheet
      {...chrome}
      label={known.name}
      /* The bar names the window, not the Karta: what is being worked through
         is the Obszar's kolejka, and the Karta's own name now stands at the
         head of the column beside its picture, where the scan is right there
         to be compared against it. */
      heading="Karty do rozpatrzenia"
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
          /* The whole card, straight through. It used to be rebuilt as
             `{ cardId, cardClass }`, which dropped `granted` — so a Karta the
             console had conjured wore its wrench on the sheet above and lost it
             in the row below, the one place the two are side by side; `ref` and
             `pool` went the same way. The sheet takes `TurnCard` now, so there
             is nothing left to rebuild and nothing to drop. */
          cards={cards}
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
      {/* One stack, spaced the way `CardFacts` spaces these lines in the hover:
          the sheet's own column is `gap-3`, which is right between the card and
          the buttons and half again too much between statements that belong
          together. `CardFacts` is now literally what draws most of them — the
          spacing agreeing was the first sign the two panels wanted to be one. */}
      <div className="flex flex-col gap-1.5">
      {/* Whose Karta this is, at the head of the column — with or without a
          scan. It used to be here only when there was no picture, on the
          reasoning that the scan carries its own title band; true, in a
          nineteen-nineties display face at the size the print was, next to a
          window whose own bar was carrying the name instead. Now the bar names
          the window and this names the Karta. */}
      <header>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-ochre">
          {known.name}
        </h2>
        <p className="text-[11px] uppercase tracking-widest text-muted">
          {label}
          {numeralOf(known.id) && (
            <>
              {" · "}
              <span title={numeralMeaning(known.id) ?? undefined}>{numeralOf(known.id)}</span>
            </>
          )}
        </p>
        {/* The prose only where the picture is not: the scan says it better,
            in the type it was set in. */}
        {!art && (
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted">
            {known.text}
          </p>
        )}
      </header>

      {/* What happens to the Karta afterwards, and only where it does not say
          how long it stays: `CardFacts` draws `visit` — which *is* `staysAs` —
          and this is the other half of the same question, in the disposition's
          own words. Both would be one card answering twice. */}
      {!staysAs(known.id) && script && (
        <p className="border-t border-edge/60 pt-2 text-[11px] text-ochre/80">
          {describeDisposition(script.disposition)}
        </p>
      )}

      {/* Where it goes, in the same place and the same words the hover panel
          puts it: above the bonuses, because „may I even wear this" is answered
          before „what does it give me". */}
      {profile.slotLabel && (
        <p className="border-t border-edge/60 pt-2 text-[11px] text-muted">
          Slot: <span className="text-ink">{profile.slotLabel}</span>
        </p>
      )}

      {/* And the rest of it, from the component the hover is built out of.

          This column used to draw two of these lines by hand — how long the
          Karta stays, and whom it is for — which is exactly the two a
          Nieznajomy has, and is why nobody noticed that a Przedmiot had none.
          KOŃ carries „+8 Przedmiotów ponad limit (5.4)" and a slot, and the
          sheet showed a picture, a name and eight centimetres of nothing while
          the hover over the same card said both. One telling now, so the two
          cannot drift apart again.

          `special` is emptied rather than drawn. What using a Karta does is
          what the buttons under this column *are* for the player whose turn it
          is, and `offered` lists them for everybody else — a third copy between
          the two would be the card telling you the same thing three ways. */}
      <CardFacts
        cardId={known.id}
        profile={{ ...profile, special: [] }}
        nature={nature}
      />

      </div>

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

      {/* And what you may do about it, which is the sheet's other half and
          now its own file. Every callback above lands in there and both
          pieces of decision state live there; nothing in the column above
          this line takes a handler at all. See `DrawnActions`. */}
      <DrawnActions {...props} canAct={canAct} />
    </DrawSheet>
  );
}
