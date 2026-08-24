/** Reads a card's printed text and proposes the bookkeeping it implies — never applying anything on its own. */

import type { EventCard } from "@/data/types";

export interface SuggestedAction {
  /** What the button says, in Polish. */
  label: string;
  stat: "miecz" | "magia" | "zycie" | "zloto" | "tury";
  delta: number;
}

/**
 * Words that make a card's outcome depend on something this function cannot
 * know: the character's Nature, a die roll, a choice, another player.
 *
 * Their presence suppresses every numeric suggestion. A card reading "jeżeli
 * jesteś Zły, ich zapach pozwoli ci zyskać 1 Życie, jeśli jesteś Dobry -
 * tracisz 1 Życie" contains both a gain and a loss of one Życie, and any
 * pattern match on it lands on the wrong one half the time. Offering nothing is
 * strictly better than offering a plausible wrong button, because a player
 * tapping a suggestion has stopped reading.
 */
const CONDITIONAL = [
  /je[żś]eli/i,
  /je[śs]li/i,
  /rzuć\s+kostk/i,
  /do\s+wyboru/i,
  /możesz/i,
  /wszystkie\s+Postacie/i,
  /wszystkich/i,
  /każd[ay]/i,
  /przeciwnik/i,
  /o\s+ile/i,
];

function isConditional(text: string): boolean {
  return CONDITIONAL.some((pattern) => pattern.test(text));
}

/**
 * Polish word characters.
 *
 * `\w` is ASCII-only in JavaScript, so `Sztuk\w*` does not match "Sztukę" and
 * `punkt\w*` does not match "punktów". Every pattern below therefore uses
 * `\p{L}` with the `u` flag. This bug is invisible without a test against the
 * real deck: the regexes look right, compile fine, and quietly match three
 * cards out of the fifteen they should.
 */
const LETTERS = "\\p{L}";

/**
 * Unconditional patterns, in the exact phrasings the deck actually uses.
 *
 * Deliberately short. The corpus is 165 cards and almost all of them branch on
 * something; the one genuinely mechanical family is the gold pickup, which is
 * also the commonest card in the deck. Everything else stays as text for a
 * human to read.
 */
const RULES: { pattern: RegExp; build: (n: number) => SuggestedAction }[] = [
  {
    // "Zamień tę Kartę na 1 Sztukę Złota, a następnie ją odłóż."
    pattern: new RegExp(`Zamień\\s+tę\\s+Kartę\\s+na\\s+(\\d+)\\s+Sztuk${LETTERS}*\\s+Złota`, "iu"),
    build: (n) => ({ label: `+${n} Złota`, stat: "zloto", delta: n }),
  },
  {
    // The board's own tables abbreviate: "wygrałeś 1 Sz. Z." at Karczma.
    pattern: /wygrałeś\s+(\d+)\s*Sz\.?\s*Z\.?/iu,
    build: (n) => ({ label: `+${n} Złota`, stat: "zloto", delta: n }),
  },
  {
    pattern: /przegrałeś\s+(?:w\s+kości\s+)?(\d+)\s*Sz\.?\s*Z\.?/iu,
    build: (n) => ({ label: `−${n} Złota`, stat: "zloto", delta: -n }),
  },
  {
    // Losing turns is a tracked value like any other, and several fields and
    // cards cost one. Without this the only unautomatable outcome on Karczma's
    // table would be the one that happens on a third of rolls.
    pattern: /tracisz\s+(\d+)\s+tur\p{L}*/iu,
    build: (n) => ({ label: `−${n} tura`, stat: "tury", delta: n }),
  },
  {
    pattern: new RegExp(`tracisz\\s+(\\d+)\\s+(?:punkt${LETTERS}*\\s+)?Życi${LETTERS}*`, "iu"),
    build: (n) => ({ label: `−${n} Życia`, stat: "zycie", delta: -n }),
  },
  {
    pattern: new RegExp(`(?:zyskujesz|otrzymujesz)\\s+(\\d+)\\s+(?:punkt${LETTERS}*\\s+)?Życi${LETTERS}*`, "iu"),
    build: (n) => ({ label: `+${n} Życia`, stat: "zycie", delta: n }),
  },
  {
    pattern: new RegExp(`tracisz\\s+(\\d+)\\s+punkt${LETTERS}*\\s+Miecza`, "iu"),
    build: (n) => ({ label: `−${n} Miecza`, stat: "miecz", delta: -n }),
  },
  {
    pattern: new RegExp(`(?:zyskujesz|otrzymujesz)\\s+(\\d+)\\s+punkt${LETTERS}*\\s+Miecza`, "iu"),
    build: (n) => ({ label: `+${n} Miecza`, stat: "miecz", delta: n }),
  },
  {
    pattern: new RegExp(`tracisz\\s+(\\d+)\\s+punkt${LETTERS}*\\s+Magii`, "iu"),
    build: (n) => ({ label: `−${n} Magii`, stat: "magia", delta: -n }),
  },
  {
    pattern: new RegExp(`(?:zyskujesz|otrzymujesz)\\s+(\\d+)\\s+punkt${LETTERS}*\\s+Magii`, "iu"),
    build: (n) => ({ label: `+${n} Magii`, stat: "magia", delta: n }),
  },
];

/**
 * What the card unambiguously says to do, as buttons for the player to confirm.
 *
 * Confirmation rather than application is the whole design. The referee is
 * allowed to be wrong here — it is reading 1993 prose with regular expressions
 * — so its output has to pass through a human who is holding the actual card.
 * An empty array is the normal, expected result for most of the deck.
 */
export function suggestActions(card: Pick<EventCard, "text">): SuggestedAction[] {
  if (isConditional(card.text)) return [];
  const actions: SuggestedAction[] = [];
  for (const rule of RULES) {
    const match = card.text.match(rule.pattern);
    if (match) actions.push(rule.build(Number(match[1])));
  }
  return actions;
}
