/** How a table is played, and which of those ways is currently open. */

/**
 * The two modes.
 *
 * `simulation` runs the whole game here — board, deck, dice. `companion` is the
 * one this project was built around: you play on the physical board with the
 * physical cards and the app owns everything tedious.
 */
export type GameMode = "simulation" | "companion";

/**
 * Companion mode is parked.
 *
 * It is not abandoned. But everything being worked on now is the simulation,
 * and keeping both honest means testing every change twice against a mode
 * nobody is currently playing. So no new table can be opened in it, and the
 * option stays on screen struck through rather than being removed — it reads
 * as "later", not as a mode this app never had.
 *
 * Nothing companion-specific has been deleted, and nothing needed to be. Every
 * one of those paths is already gated on the mode — typing in a die roll,
 * correcting a tracked value by hand, naming a card the physical deck dealt,
 * seating a player who has no device, one screen driving somebody else's turn —
 * so refusing to *create* the mode switches all of them off at once. Tables
 * that already exist in it keep working.
 *
 * Flip this to false and companion mode is back, with no other change.
 *
 * This lives in its own module rather than beside `createGame` because the
 * "new table" dialog is a client component, and `store.ts` carries the
 * service-role database handle. One import of the wrong file would have put
 * that key's client in the browser bundle.
 */
export const COMPANION_PARKED = true;

/**
 * How many can sit at one table.
 *
 * The ceiling only. `store.ts` enforces it on the way in, because a stale lobby
 * page must not be able to squeeze in a seventh, and the lobby reads it to know
 * whether to offer a chair at all.
 *
 * There is no floor. `MIN_SEATS = 2` lived here unread by anything, because the
 * rule it claimed to state is not one this app keeps: `startGame` needs one
 * character, and says why at length — the box prints 2-6 on its lid but the
 * rulebook never states a count, the only rule that assumes company is 17.4's
 * "jeden z pozostałych graczy" throwing the enemy's die, and in simulation the
 * app throws it. A constant nothing reads is harmless; a constant nothing reads
 * that contradicts a decision taken elsewhere is a trap for whoever wires it up.
 */
export const MAX_SEATS = 6;
