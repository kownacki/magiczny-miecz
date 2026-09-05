"use client";

/**
 * A name in a sentence, with whatever there is to see about it on hover.
 *
 * The app names cards, Obszary and Postacie all over the place — in the
 * journal, in the roster, in the box beside the queue — and a name you cannot
 * look at is a name you have to remember. This is the one way of drawing one,
 * so the three do not drift apart: the journal grew its own copy first, and the
 * end-of-turn lines grew a second, and the two said different things about the
 * same seat until they were pulled back together.
 */

import { fieldWithText } from "@/lib/view/fieldText";
import { asFieldId } from "@/lib/engine/board";
import { useCardPreview } from "./card-preview";
import type { TileCard } from "./card-tile";
import { isCardId } from "@/data/ids";
import charactersData from "@/data/characters.json";
import type { Character } from "@/data/types";
import type { EqMode } from "@/lib/engine/slots";
import { characterKind } from "@/lib/engine/polish";

/** Keyed by a plain string: asked about ids off the wire, and "no" is an answer. */
const CHARACTERS = new Map<string, Character>(
  (charactersData as Character[]).map((character) => [character.id, character]),
);

export type LookKind = "card" | "field" | "character";

export function Lookable({
  kind,
  id,
  name,
  eqMode = "classic",
  className = "",
}: {
  kind: LookKind;
  id: string;
  /** What is written, which is not always the id's own name — "Kurhan", "GOBLIN". */
  name: string;
  eqMode?: EqMode;
  className?: string;
}) {
  // A stored id becomes a FieldId only through the guard, and a name the board
  // no longer knows simply has nothing to show rather than throwing.
  const fieldId = kind === "field" ? asFieldId(id) : null;
  const field = fieldId ? fieldWithText(fieldId) : null;
  // A Postać is looked up in its own manifest and drawn at its own size: the
  // flag is the only thing that knows, because `demon` and `czarodziej` each
  // name a character AND an event card, so the id alone hands back the wrong
  // picture rather than none.
  const character = kind === "character" ? CHARACTERS.get(id) : null;

  /**
   * Which of the three this name is, decided once, here.
   *
   * `id` arrives as a plain string — off a journal row, off the wire — and
   * `kind` is what says which registry it belongs to. So the id is narrowed on
   * the way into the tile rather than at each lookup inside it, and a Postać
   * whose id also names a Karta (`demon`, `czarodziej`) can no longer be
   * looked up as one. A name none of the three knows still hovers, with its
   * name and nothing else, which is what it did before.
   */
  const card: TileCard = character
    ? {
        cardId: character.id,
        name,
        text: character.abilities.join("\n\n"),
        kindLabel: characterKind(character),
        character: true,
      }
    : fieldId
      ? { cardId: fieldId, name, text: field?.text ?? undefined, kindLabel: "Obszar", field: true }
      : isCardId(id)
        ? { cardId: id, name }
        : { cardId: id, name, ...(kind === "field" ? { kindLabel: "Obszar" } : {}), noCard: true };

  const { handlers, preview } = useCardPreview(
    card,
    // A field has no card to show; its printed instruction is what there is.
    kind === "field",
    eqMode,
  );

  return (
    <>
      <span
        {...handlers}
        className={`cursor-help underline decoration-dotted decoration-muted/50 underline-offset-2 hover:text-ink ${className}`}
      >
        {name}
      </span>
      {preview}
    </>
  );
}
