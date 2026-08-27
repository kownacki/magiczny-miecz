"use client";
import { WithRules } from "./rule-ref";

/**
 * The card, big enough to read, with what the app knows about it beside it.
 *
 * Shared by every place a card is shown small — the pack, the body, the shelf,
 * the journal — so hovering means the same thing everywhere.
 *
 * Rendered into `document.body`. Hands and shelves sit inside scrolling,
 * clipping containers, and a preview drawn beside the thing it describes is cut
 * off by the first `overflow-hidden` above it. Fixed to the viewport, nothing
 * clips it.
 *
 * It sits above everything, deliberately: the overlays here are z-50 and so was
 * this, which is a tie — and a tie is settled by document order, so the card
 * came up *behind* the modal that had just offered it.
 */

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { cardImageUrl, characterImageUrl } from "@/lib/view/cardImages";
import { characterProfile, forbiddenNatures, itemProfile } from "@/lib/engine/abilityText";
import { numeralMeaning, numeralOf } from "@/lib/engine/cards";
import type { Nature } from "@/data/types";
import { CardMark } from "./card-mark";
import { LAYER } from "./layers";
import type { EqMode } from "@/lib/engine/slots";
import type { TileCard } from "./card-tile";

/**
 * Width of the card picture.
 *
 * 208 CSS px is 416 on a retina screen, and the cards are exported 528 across —
 * so it is downscaled with room to spare, which is the side of the line to be
 * on. The panel is read for the formalised lines beside the picture; the
 * picture is there to be recognised.
 */
const PICTURE_WIDTH = 208;
const CARD_RATIO = 780 / 629;
const GAP = 12;

/**
 * Hover plumbing for one small card.
 *
 * Returns handlers to spread onto whatever the pointer lands on, and the
 * preview to render. The anchor is captured on enter rather than tracked on
 * every move: the card sits beside the thing it belongs to, so it does not need
 * to chase the cursor, and not chasing it means no work per mousemove.
 */
export function useCardPreview(
  card: TileCard | null,
  imageless = false,
  eqMode: EqMode = "classic",
  /** Who is looking, so a requirement can say whether THEY meet it. */
  nature: Nature | null = null,
) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const handlers = {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) =>
      setAnchor(event.currentTarget.getBoundingClientRect()),
    onMouseLeave: () => setAnchor(null),
    // A dragged element leaves no mouseleave behind it, and a preview left
    // hanging over the board during a drag hides where the card is going.
    onPointerDown: () => setAnchor(null),
  };

  const preview =
    anchor && card ? (
      <CardPreview
        card={card}
        anchor={anchor}
        imageless={imageless}
        eqMode={eqMode}
        nature={nature}
      />
    ) : null;
  return { handlers, preview, hovering: anchor !== null };
}

export function CardPreview({
  card,
  anchor,
  imageless = false,
  eqMode = "classic",
  nature = null,
}: {
  card: TileCard;
  anchor: DOMRect;
  nature?: Nature | null;
  /**
   * There is no picture of this and there should be no lookup for one.
   *
   * A field is not a card, and its id can collide with a card's — asking for
   * the picture of "kurhan" could hand back a Miejsce card that merely shares
   * the name. Its printed instruction is what there is to show.
   */
  imageless?: boolean;
  eqMode?: EqMode;
}) {
  /**
   * Placed from what it measures, not from what it was expected to be.
   *
   * Working the height out in advance only ever worked for a bare picture. The
   * moment the panel had a column of text beside it — or a field's printed
   * instruction instead of a card — the real height had nothing to do with the
   * arithmetic, so the clamp used a wrong number and the bottom ran off the
   * screen. A ref callback runs at commit, before paint, so measuring and then
   * positioning is invisible rather than a jump.
   *
   * The CSS caps do the rest: whatever ends up inside, the panel can never be
   * taller or wider than the window, and tall content scrolls instead of
   * overflowing it.
   */
  const place = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const box = node.getBoundingClientRect();
      const room = { x: window.innerWidth, y: window.innerHeight };
      const fitsRight = room.x - anchor.right > box.width + GAP;
      const wanted = fitsRight ? anchor.right + GAP : anchor.left - box.width - GAP;
      node.style.left = `${clamp(wanted, GAP, room.x - box.width - GAP)}px`;
      node.style.top = `${clamp(
        anchor.top + anchor.height / 2 - box.height / 2,
        GAP,
        room.y - box.height - GAP,
      )}px`;
    },
    [anchor],
  );

  if (typeof document === "undefined") return null;

  // A character's id is not a card id, even when it looks like one: `demon` and
  // `czarodziej` name both. Going through the card registry for those two hands
  // back a Wróg and a Nieznajomy rather than the Postać being pointed at.
  const src = imageless
    ? null
    : card.character
      ? characterImageUrl(card.cardId)
      : cardImageUrl(card.cardId, card.ref);
  const profile = imageless
    ? null
    : card.character
      ? characterProfile(card.cardId)
      : itemProfile(card.cardId, eqMode);
  // What is printed at the top of the card. Null for a Zaklęcie, a Karta
  // Postaci and anything off the Wyposażenie sheets — none of those is a Karta
  // Zdarzeń and none of them carries one.
  const numeral = numeralOf(card.cardId);
  // 5.3, answered for the reader rather than stated in the abstract.
  const barred = nature !== null && (forbiddenNatures(card.cardId)?.includes(nature) ?? false);
  const anythingToSay =
    !src ||
    card.text ||
    card.kindLabel ||
    profile?.slotLabel ||
    (profile?.facts.length ?? 0) > 0 ||
    (profile?.requirements.length ?? 0) > 0 ||
    (profile?.special.length ?? 0) > 0 ||
    (profile?.notes.length ?? 0) > 0;

  return createPortal(
    <div
      ref={place}
      role="tooltip"
      style={{
        // A first guess, corrected before paint.
        left: anchor.right + GAP,
        top: anchor.top,
        maxWidth: `calc(100vw - ${GAP * 2}px)`,
        maxHeight: `calc(100vh - ${GAP * 2}px)`,
      }}
      // Never under the pointer: a preview that can be hovered flickers.
      className={`pointer-events-none fixed ${LAYER.hover} flex gap-3 overflow-y-auto rounded-lg border border-ochre/40 bg-night p-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)]`}
    >
      {src && (
        <div className="relative shrink-0 self-start">
          <Image
            src={src}
            alt={card.name}
            width={PICTURE_WIDTH}
            height={Math.round(PICTURE_WIDTH * CARD_RATIO)}
            style={{ width: PICTURE_WIDTH }}
            className="block h-auto rounded"
          />
          {/* On the card, where the tile puts it, so the hover and the thing
              being hovered agree about where to look. */}
          {card.granted && (
            <span className="absolute bottom-1 right-1 rounded bg-night/85 px-1 py-0.5">
              <CardMark mark="granted" size={22} />
            </span>
          )}
        </div>
      )}

      {/* What the app knows, beside what the card says. Skipped entirely when
          there is nothing to put here: a picture alone beats a picture with an
          empty column next to it. */}
      {anythingToSay && (
        <div className="flex w-[18rem] max-w-[55vw] flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-sm text-ochre">
              {card.name}
            </p>
            {/* The Roman numeral printed at the top of the card. Not an
                identity and not a level — it is the class, and 15.2 resolves a
                stack of cards drawn on one Obszar from the lowest up. Set apart
                on the right the way it is on the card itself. */}
            {numeral && (
              <span
                title={numeralMeaning(card.cardId) ?? undefined}
                className="shrink-0 font-[family-name:var(--font-display)] text-sm leading-none text-ochre/50"
              >
                {numeral}
              </span>
            )}
          </div>
          {card.kindLabel && <p className="text-[11px] text-muted">{card.kindLabel}</p>}

          {profile?.slotLabel && (
            <p className="text-[11px] text-muted">
              Slot: <span className="text-ink">{profile.slotLabel}</span>
            </p>
          )}

          {/* What it asks before it gives. Above the bonuses on purpose: a card
              you may not hold is not a card whose bonuses matter.

              Green or red by whether the person reading it passes — the useful
              question is not "does this have a restriction" but "does it shut
              ME out", and the answer is known. Neutral only when no Natura is
              known, which is the shelf read from outside a game. */}
          {profile && profile.requirements.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              {profile.requirements.map((need, at) => (
                <li
                  key={at}
                  className={`text-[11px] leading-snug ${
                    nature === null
                      ? "text-muted"
                      : barred
                        ? "text-vermilion"
                        : "text-verdigris"
                  }`}
                >
                  {need.what}
                </li>
              ))}
            </ul>
          )}

          {profile && profile.facts.length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t border-edge/60 pt-2">
              {profile.facts.map((fact, at) => (
                <li key={at} className="flex flex-col text-[11px] leading-snug">
                  <span className="text-ink">{fact.what}</span>
                  {/* Only where there is a condition to meet. Almost everything
                      simply has to be on you, and saying so every time said
                      nothing. */}
                  {fact.when && <span className="text-magia/80">{fact.when}</span>}
                </li>
              ))}
            </ul>
          )}

          {/* What using it does, once — as opposed to what holding it gives. */}
          {profile && profile.special.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              {profile.special.map((line, at) => (
                <li key={at} className="text-[11px] leading-snug text-ochre/90">
                  {line}
                </li>
              ))}
            </ul>
          )}

          {/* Rules the app states but does not apply. Marked, because at a table
              the difference is who has to remember them. */}
          {profile && profile.notes.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              {profile.notes.map((note, at) => (
                <li key={at} className="text-[11px] leading-snug text-ochre/90">
                  {note}
                  {at === 0 && (
                    <span className="ml-1 text-[10px] text-muted/70">· pilnujesz sam</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* The prose only when there is no picture of it.
              Beside the card, repeating its text is repeating what the reader is
              already looking at — and it pushed the formalised lines, which are
              what the app will actually DO, off the bottom of the panel. */}
          {card.text && !src && (
            <p className="whitespace-pre-line border-t border-edge/60 pt-2 text-[11px] leading-relaxed text-muted">
              <WithRules text={card.text} />
            </p>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Keeps a value inside the window even when the window is smaller than the panel. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}
