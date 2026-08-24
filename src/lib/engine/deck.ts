/** The virtual deck: shuffling, drawing and recycling, as pure functions over a card order. */

/**
 * A card in a deck is referenced by where it was sliced from, never by its id.
 *
 * The deck holds genuine duplicates — four "1 SZTUKA ZŁOTA", two "UPIÓR", four
 * "MAGICZNY MIECZ" — so ids repeat by design. Drawing has to distinguish the
 * copies, or discarding one would discard them all.
 */
export type CardRef = string;

export function cardRef(source: { sheet: string; index: number }): CardRef {
  return `${source.sheet}#${source.index}`;
}

export interface DeckState {
  /** Remaining cards, front first. */
  draw: CardRef[];
  /** Cards already resolved and set aside (16.8, "stos kart zużytych"). */
  discard: CardRef[];
}

/** A shuffle is randomness, so it arrives as a function rather than being taken. */
export type Shuffle = <T>(items: readonly T[]) => T[];

/**
 * Fisher-Yates over a caller-supplied source of randomness.
 *
 * Takes `random` rather than calling `Math.random` so the engine stays pure and
 * a test can lay the deck out in a known order.
 */
export function shuffleWith(random: () => number): Shuffle {
  return <T,>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
}

export function buildDeck(refs: readonly CardRef[], shuffle: Shuffle): DeckState {
  return { draw: shuffle(refs), discard: [] };
}

export interface DrawResult {
  deck: DeckState;
  drawn: CardRef[];
  /** True when the discard pile had to be shuffled back in to satisfy the draw. */
  recycled: boolean;
}

/**
 * Takes `count` cards off the top.
 *
 * When the draw pile runs out the discard is shuffled and becomes the new draw
 * pile — rule 9.5 says exactly this for spells, and the event deck has no other
 * sensible behaviour in a game that can run for hours. Cards currently lying on
 * the board are not in either pile, so they are never dealt twice.
 *
 * If even the recycled deck cannot cover the request, it returns what it has
 * rather than throwing: running out entirely is a table state a referee should
 * report, not crash on.
 */
export function drawFrom(deck: DeckState, count: number, shuffle: Shuffle): DrawResult {
  if (count <= 0) return { deck, drawn: [], recycled: false };

  let { draw, discard } = { draw: [...deck.draw], discard: [...deck.discard] };
  let recycled = false;

  if (draw.length < count && discard.length > 0) {
    draw = [...draw, ...shuffle(discard)];
    discard = [];
    recycled = true;
  }

  const drawn = draw.slice(0, count);
  return { deck: { draw: draw.slice(drawn.length), discard }, drawn, recycled };
}

/** Sets resolved cards aside. */
export function discardTo(deck: DeckState, refs: readonly CardRef[]): DeckState {
  return { draw: deck.draw, discard: [...deck.discard, ...refs] };
}

export function remaining(deck: DeckState): number {
  return deck.draw.length + deck.discard.length;
}
