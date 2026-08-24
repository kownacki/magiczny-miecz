/** Przedmioty whose card is an event rather than a standing rule. */

import type { CardScript } from "../cardScript";

/**
 * Most Przedmiot cards are things you pick up and keep, and what they then do
 * is a standing rule — those live in `abilities.ts`, not here. This module is
 * for the ones that resolve and go: gold you simply take, a card that must be
 * shuffled back, an item consumed on use.
 */
export const PRZEDMIOTY: Readonly<Record<string, CardScript>> = {};
