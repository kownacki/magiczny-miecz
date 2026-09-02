"use client";

/** What an Obszar offers: the list you pick from, and the one you walked into. */

import { scriptFor, type Effect } from "@/lib/engine/cardScript";
import {
  fieldScriptFor,
  offersFromCard,
  touchesGold,
  tradesForGold,
} from "@/lib/engine/fieldScript";
import { offerText } from "@/lib/view/fieldText";
import { cardName, plural } from "@/lib/engine/polish";
import { drawsFromPool, startingPool } from "@/lib/engine/pools";
import type { FieldId } from "@/lib/engine/board";
import { CardTile } from "./card-tile";
import { tileFor } from "./table";
import type { CardId } from "@/data/ids";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";

/** What the three wells lay out, in the case the sentence needs. */
const POOL_OF: Record<"life" | "sword" | "magic", string> = {
  life: "Życia",
  sword: "Miecza",
  magic: "Magii",
};

/**
 * One thing you may go and do on an Obszar.
 *
 * The board's word — „MOŻESZ TU ODWIEDZIĆ:" — and the engine's, which is the
 * same word: `FieldScript.offers`. A shop that arrived on a Karta and stayed
 * (16.8) is one of these too, because 21.1 makes no distinction and neither
 * should the window.
 */
export interface Offer {
  /**
   * What `resolveFieldOffer` and `pole-tabela` call it, which is its name.
   *
   * Kept apart from `label` because the label grows things the server has never
   * heard of — a Drzewo Życia's remaining fruit — and the round trip has to
   * name the offer the board prints.
   */
  key: string;
  /** As it reads on the button: the name, and what is left where that varies. */
  label: string;
  /** The board's own sentence for this one, where the board prints one. */
  text: string | null;
  /**
   * The Karta this offer walked in on, where it walked in on one.
   *
   * So the button can carry its illustration. A TARGOWISKO is on the Obszar
   * twice over — a thing lying there and a thing to go and do — and those are
   * two honest questions about one object (16.8 makes it public, 13.4 counts
   * it, and 21.1 makes it a shop). Two entries with nothing in common but a
   * name read as two objects; the same picture in both says they are one.
   */
  cardId: string | null;
  /** Conjured by the test shortcut — the wrench belongs on this tile too. */
  granted?: boolean;
  /** Whether a purse is any part of it — see `touchesGold`. */
  gold: boolean;
  /** Whether somebody here deals in gold — see `tradesForGold`. */
  trade: boolean;
  effect: Effect;
}

/**
 * Everything this Obszar offers — the board's own desks and whatever settled here.
 *
 * Built in one place because two things need the same list and used to build it
 * separately: the window decides whether to draw the section, and the section
 * draws the buttons. See `offersFromCard` for what that split already cost.
 *
 * A compulsory field contributes nothing. „MUSISZ RZUCIĆ KOSTKĄ" is not an
 * offer however the data files it — it happens to whoever arrives, in the draw
 * sheet, where the whole table watches and nobody can re-equip halfway through.
 * A button that opens it would be a button to choose something you do not get
 * to choose.
 */
export function offersHere(
  fieldId: FieldId,
  /** The Karty lying here, with what is left beside a well. */
  fieldCards: readonly { cardId: string; pool?: number; granted?: boolean }[],
): Offer[] {
  const script = fieldScriptFor(fieldId);
  const printed: Offer[] = script?.obowiazkowe
    ? []
    : (script?.offers ?? []).map((offer) => ({
        key: offer.name,
        label: offer.name,
        text: offerText(fieldId, offer),
        cardId: null,
        gold: touchesGold(offer.effect),
        trade: tradesForGold(offer.effect),
        effect: offer.effect,
      }));

  const settled = fieldCards.flatMap(({ cardId, pool, granted }) => {
    const script = scriptFor(cardId);
    if (!script || !offersFromCard(cardId)) return [];
    /**
     * "Po znalezieniu Drzewa, połóż przy nim 4 punkty Życia [...] Po
     * wykorzystaniu 4 punktów, Drzewo usycha."
     *
     * Said on the button, because it is the offer: a well with one fruit left
     * is a different thing to walk to than one with four, and until this the
     * number lived on a database row nothing on screen ever asked.
     */
    const left = drawsFromPool(cardId) ? (pool ?? startingPool(cardId)) : null;
    const beside =
      left === null || script.disposition.kind !== "zostaje-z-pula"
        ? null
        : `${left} ${plural(left, "punkt", "punkty", "punktów")} ${POOL_OF[script.disposition.stat]}`;
    return [
      {
        key: cardName(cardId),
        label: beside === null ? cardName(cardId) : `${cardName(cardId)} — ${beside}`,
        cardId,
        granted,
        gold: touchesGold(script.effect),
        trade: tradesForGold(script.effect),
        /**
         * A Karta's own words are on the Karta, one hover away, and it is a
         * picture rather than a line of board text. Quoting it into the
         * subview's header would be the third place the same sentence appears.
         */
        text: null,
        effect: script.effect,
      },
    ];
  });

  return [...printed, ...settled];
}

/**
 * The list of things to go and do, one button each.
 *
 * Drawn for anybody reading the Obszar, whether or not they are standing on it
 * — the same rule the Karty lying here already follow. Reading about somewhere
 * you are not is half of what this window is for, and „co tam jest" includes
 * who keeps a shop there. What 13.1 governs is the buttons *inside*, and those
 * say so themselves.
 */
export function OfferList({
  offers,
  eqMode,
  nature,
  onOpen,
}: {
  offers: readonly Offer[];
  /** Passed through to the tile's hover, which says where a Przedmiot is worn. */
  eqMode?: EqMode;
  nature?: Nature | null;
  onOpen: (key: string) => void;
}) {
  if (offers.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted">
        Możesz tu odwiedzić
      </h3>
      <ul className="flex flex-col gap-1">
        {offers.map((offer) => (
            <li key={offer.key}>
              <button
                onClick={() => onOpen(offer.key)}
                className="flex w-full items-center gap-2 rounded border border-edge bg-night/40 p-2 text-left text-xs text-ink transition hover:border-ochre hover:bg-edge"
              >
                {/* The Karta itself, drawn the way every card in this app is
                    drawn — so the TARGOWISKO on this button and the TARGOWISKO
                    on the shelf below are recognisably one object rather than
                    two entries sharing a name.

                    `CardTile` and not a bare picture, because the tile is more
                    than the picture: the wrench that says a Karta was conjured,
                    the strike, the badge, and the hover that opens the whole
                    thing. A hand-rolled `<Image>` here was a second kind of
                    tile that would have quietly stopped agreeing with the first
                    the next time a mark was added to it.

                    `inControl` because the row is the button — see the note on
                    the prop. */}
                {offer.cardId && (
                  <span className="shrink-0">
                    <CardTile
                      card={tileFor({ cardId: offer.cardId as CardId, granted: offer.granted })}
                      eqMode={eqMode}
                      nature={nature}
                      inControl
                    />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{offer.label}</span>
                  {/* What the board says about this one, on the button that
                      opens it. It used to be in a paragraph at the top of the
                      window with every other offer's line, three inches from
                      the control it describes; the board's whole text is a
                      fold up there now, for checking rather than reading. */}
                  {offer.text && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                      {offer.text}
                    </span>
                  )}
                </span>
                {/* The direction of travel, not an ornament: this is the one
                    control in the window that replaces what is under it rather
                    than doing something to the game. */}
                <span aria-hidden className="shrink-0 text-ochre/70">
                  →
                </span>
              </button>
            </li>
        ))}
      </ul>
    </section>
  );
}
