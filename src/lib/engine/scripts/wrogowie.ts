/** Wrogowie — the creatures you fight, and what their cards do beyond the fight. */

import type { CardScript } from "../cardScript";

/**
 * A Wróg's numbers live on the card itself (its printed Miecz or Magia) and are
 * read by `combatValueOf`, so nothing here repeats them. What belongs here is
 * everything else the card says: what beating it gives you, what losing costs
 * beyond the usual point of Życie, and above all where the card goes — most of
 * these say "pozostanie tu, aż ktoś go pokona", which is a fixture, not a
 * discard.
 */
export const WROGOWIE: Readonly<Record<string, CardScript>> = {};
