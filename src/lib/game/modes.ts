/** How many can sit at one table. */

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
