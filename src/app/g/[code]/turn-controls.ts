/** What the turn's controls hand work back through, and the one thing every one of them has to ask about the mode. */

/**
 * These were fields on a `Props` interface belonging to a component called
 * `TurnPanel`, and by the end that component did not exist: the crossings had
 * moved into the Obszar window, the fight into the draw modal, and what was
 * left of the file was eight components sharing nothing but a name and three
 * callback signatures they reached through `Props["onAction"]`. A type quoted
 * out of a props bag that nothing has props for is the shape of a refactor that
 * stopped one step early.
 */

/** One command for the turn in progress — a move, a crossing, a roll, a fight. */
export type OnAction = (body: Record<string, unknown>) => void;

/** Applies a card's suggested bookkeeping to the active player's own seat. */
export type OnSuggestion = (stat: string, delta: number, reason: string) => void;

/** Buying, selling and paying a healer — see `fieldScript.ts`. */
export type OnService = (body: Record<string, unknown>) => void;

/**
 * Whether the app owns the deck, the dice and the arithmetic.
 *
 * "simulation" means the app deals the cards itself. It also means it owns
 * everything else. In a simulation there is no physical die to read and no
 * figure to have been moved wrongly, so every control that exists to let a
 * person *tell* the app what happened is gone: no typing a roll, no editing a
 * total, no reporting the outcome of a fight the app is running. What is left
 * is the game asking to be played.
 *
 * Companion mode keeps all of them, and must: there the board on the table is
 * the truth and the app is a record of it, so a referee you cannot correct is
 * worse than no referee.
 *
 * A named boolean rather than a bare one because four components take it and
 * each of them used to point at the same paragraph, in a file that has since
 * been split four ways.
 */
export type Simulated = boolean;
