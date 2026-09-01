"use client";

/**
 * The figure standing for a seat, wherever the app draws one.
 *
 * At the table this is a physical object: the mała Karta Postaci in a plastic
 * stand, which a player points at to mean "me". 20.1 says what happens to it
 * when the character is turned to stone — „reprezentującą ją na planszy Kartę
 * należy zamienić na Kartę Zamieniony w Kamień" — and that is a swap of the
 * object, not a badge added to it. Everything else about chapter 20 the engine
 * enforces; this is the part that has to be *drawn*, and drawing it in one
 * place is what stops the turn bar, the roster and the Obszar disagreeing about
 * whether somebody is stone.
 *
 * Its own component rather than a helper because of the hover: `useCardPreview`
 * is a hook and every one of those three lists draws one of these per seat. A
 * hook cannot be called in a loop, so the loop calls a component instead.
 */

import Image from "next/image";
import charactersData from "@/data/characters.json";
import type { Character } from "@/data/types";
import { STONE_CARD, figureUrl } from "@/lib/view/cardImages";
import { characterKind } from "@/lib/engine/polish";
import { useCardPreview } from "./card-preview";
import { ART_BORDER, PICKABLE } from "./pickable";
import type { TileCard } from "./card-tile";

const CHARACTERS = charactersData as Character[];

/**
 * The standee's own 249x420, as the width a caller gives and the height that
 * follows from it. Written as one ratio rather than as pairs of numbers at
 * each call, which is how the turn bar came to hold 85x144 and the roster
 * 56x94 — both right, and neither checkable against the other.
 */
const FIGURE_RATIO = 420 / 249;

export function figureHeight(width: number): number {
  return Math.round(width * FIGURE_RATIO);
}

/**
 * What the hover opens: the Karta this figure *is*.
 *
 * A statue is the Kamień card and not the Postać, and that is the useful
 * answer rather than a pedantic one — the printed card says in four lines
 * exactly what being stone costs, which is the question somebody pointing at a
 * frozen figure has. The Karta Postaci is still one click away in the roster,
 * where the numbers it explains are.
 */
function cardOf(character: Character | null, stone: boolean): TileCard | null {
  if (stone) {
    return {
      cardId: STONE_CARD.cardId,
      name: STONE_CARD.name,
      text: STONE_CARD.text,
      ref: STONE_CARD.ref,
      kindLabel: "Karta Zamienionego w Kamień",
    };
  }
  if (!character) return null;
  return {
    cardId: character.id,
    name: character.name,
    character: true,
    text: character.abilities.join("\n\n"),
    kindLabel: characterKind(character),
  };
}

export function SeatFigure({
  characterId,
  stone = false,
  width,
  colour,
  /** Passed over this round — the wash the turn bar puts on a skipped chip. */
  dimmed = false,
  onClick,
  title,
}: {
  /**
   * The id alone. The Charakterystyka the hover needs is looked up here rather
   * than passed in, so a caller that has a seat and nothing else — the Obszar
   * window is one — does not have to carry the character list to get a figure.
   */
  characterId: string | null;
  stone?: boolean;
  width: number;
  /** The seat's colour, which is what the border is for. */
  colour?: string;
  dimmed?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const character = CHARACTERS.find((one) => one.id === characterId) ?? null;
  const src = figureUrl(characterId, stone);
  const card = cardOf(character, stone);
  // No `eqMode`: neither a Karta Postaci nor the Kamień card has a slot, and
  // `characterProfile` ignores the variant. It only matters for a Przedmiot.
  const { handlers, preview } = useCardPreview(card);
  const height = figureHeight(width);

  const box = (
    <span
      style={{ width, height, ...(colour ? { borderColor: colour } : {}) }}
      className={`relative block overflow-hidden rounded border ${
        colour ? "" : ART_BORDER
      } bg-panel ${onClick ? PICKABLE : ""} ${dimmed ? "opacity-55" : ""}`}
    >
      {src ? (
        <Image
          src={src}
          alt={card?.name ?? ""}
          width={width}
          height={height}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight text-muted">
          {card?.name ?? "—"}
        </span>
      )}
    </span>
  );

  return onClick ? (
    <button type="button" onClick={onClick} title={title} {...handlers} className="shrink-0">
      {box}
      {preview}
    </button>
  ) : (
    <span {...handlers} title={title} className="shrink-0">
      {box}
      {preview}
    </span>
  );
}
