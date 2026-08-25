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

/**
 * Which copy of a card to put back, when all we know is which card it is.
 *
 * A hand and a field hold card *ids*; the piles hold slice refs, because the box
 * has genuine duplicates and discarding by id would discard all four Magiczne
 * Miecze at once. Going the other way there is nothing to look up — so a copy
 * is chosen instead, and the copies are identical, so any of them will do.
 *
 * "Any" with one condition: it must be a copy neither pile already accounts
 * for. That is what makes this safe to call twice by mistake — the second call
 * finds every copy accounted for and returns null rather than conjuring a fifth
 * Magiczny Miecz into a deck that only ever held four.
 */
export function returningRef(deck: DeckState, copies: readonly CardRef[]): CardRef | null {
  const accounted = new Set([...deck.draw, ...deck.discard]);
  return copies.find((ref) => !accounted.has(ref)) ?? null;
}

/**
 * Takes one copy out of a pile without dealing it.
 *
 * The counterpart to `returningRef`, and it exists for the test shortcut: a
 * card conjured into a hand is a card the deck must stop holding, or it will
 * deal the same Cyklop again and the table will have two. Reaching into the box
 * is allowed while testing; the box quietly refilling behind you is not.
 *
 * The draw pile first, because that is where a copy would have come from. Null
 * when neither pile has one — every copy is already in play, which is a normal
 * answer and not a failure.
 */
export function removeCopy(deck: DeckState, copies: readonly CardRef[]): DeckState | null {
  const wanted = new Set(copies);
  const inDraw = deck.draw.findIndex((ref) => wanted.has(ref));
  if (inDraw !== -1) {
    return { draw: deck.draw.filter((_, at) => at !== inDraw), discard: deck.discard };
  }
  const inDiscard = deck.discard.findIndex((ref) => wanted.has(ref));
  if (inDiscard === -1) return null;
  return { draw: deck.draw, discard: deck.discard.filter((_, at) => at !== inDiscard) };
}

export function remaining(deck: DeckState): number {
  return deck.draw.length + deck.discard.length;
}
