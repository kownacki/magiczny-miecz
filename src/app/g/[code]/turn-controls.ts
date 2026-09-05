/** What the turn's controls hand work back through. */

/**
 * These were fields on a `Props` interface belonging to a component called
 * `TurnPanel`, and by the end that component did not exist: the crossings had
 * moved into the Obszar window, the fight into the draw modal, and what was
 * left of the file was eight components sharing nothing but a name and three
 * callback signatures they reached through `Props["onAction"]`. A type quoted
 * out of a props bag that nothing has props for is the shape of a refactor that
 * stopped one step early.
 */

import type { Requests } from "@/lib/game/requests";

/** One command for the turn in progress — a move, a crossing, a roll, a fight. */
export type OnAction = (body: Partial<Requests["turn"]>) => void;

/** Buying, selling and paying a healer — see `fieldScript.ts`. */
export type OnService = (body: Partial<Requests["holdings"]>) => void;
