/** Generates the codes players type to join a table and the secrets that authorise a seat. */

import { randomBytes, randomInt } from "node:crypto";

/**
 * Join codes are read aloud across a table and typed on a phone, so the
 * alphabet drops every glyph that gets misheard or misread: no O/0, no I/1/L,
 * no S/5, no B/8. What is left is unambiguous in both directions.
 *
 * Polish speakers are the audience, so the letters left in are ones whose
 * Polish names are distinct when spoken.
 */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ2346789";

export function makeJoinCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Normalises what a player typed: upper-cases it and drops spaces, dashes and
 * anything outside the alphabet.
 *
 * It deliberately does NOT try to repair confusable characters. Both halves of
 * every confusable pair are excluded from the alphabet — O and 0 together, I
 * and 1 and L together, S and 5 together — so a typed O carries no information
 * about which valid character was meant. Guessing could only turn a typo into a
 * *different real table*, which is far worse than saying the code is wrong.
 */
export function normaliseJoinCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((char) => ALPHABET.includes(char))
    .join("");
}

/**
 * The secret a device holds to prove it owns a seat. This is the only thing
 * standing between one player and another player's hidden spells, so it is a
 * full-strength random token rather than anything guessable.
 */
export function makeClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Where a game's shuffles come from, minted once when the table is opened.
 *
 * Not a secret and not trying to be — a save file holds the whole game, and the
 * seed is in it. What it has to be is *stable*: written down once so that
 * replaying the game reaches the same order, which is the whole of why it
 * exists. See `prng.ts`.
 */
export function makeSeed(): string {
  return randomBytes(9).toString("base64url");
}
