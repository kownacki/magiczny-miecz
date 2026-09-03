/** What a watching player is told while somebody else's button is filling. */

/**
 * The three seconds between a decision and its arrival, said out loud.
 *
 * A player who is not taking the turn used to get two frames of the game and
 * nothing in between: „Decyzję podejmuje Test (WIEDŹMA)", and then whatever had
 * happened. Every choice arrived already made. Now that an irreversible button
 * waits three seconds before it is sent (`channelling.ts`), there is a moment
 * in the middle where the decision exists and has not landed, and this is what
 * fills it — „Test (WIEDŹMA) wybiera: Tracisz 1 Sztukę Złota…", then the
 * result. Decision first, consequence after, which is the order a table tells
 * a story in.
 *
 * **The option travels as a number.** A `wybor` announces which line of its own
 * list won, and the watching browser renders that line from the copy it is
 * already drawing — the same discipline as `Decisions`, where a human choice is
 * a list of numbers the server re-walks the card against so a card cannot be
 * talked into doing something it does not say. It also settles the secrecy
 * question by construction: an index into a list somebody is already looking at
 * cannot tell them anything new. Where the options are *not* public — the
 * Zaklęcia an `ask` frame fans out, which 9.3 keeps face down — nothing is
 * announced at all, and the panel's own „wybiera jedno z 2 Zaklęć" is already
 * the whole truth.
 *
 * **No rule numbers.** Not one of these is an event in Magiczny Miecz. They are
 * things happening to a *browser* — a button held down, a mind changed, a
 * cancel — and the rulebook has nothing to say about any of it. `RULE_FOR`
 * answers `null` for the same reason about joining a table and about an
 * override.
 */

/**
 * What a button is about to do.
 *
 * A closed union rather than a sentence off the call site, so the phrasing lives
 * in one table and a new kind cannot be added without the compiler asking how
 * to say it.
 */
export type IntentKind =
  | "walczy"
  | "wymyka-sie"
  | "bierze-przedmiot"
  | "bierze-przyjaciela"
  | "zostawia-przedmiot"
  | "zostawia-przyjaciela"
  | "wybiera"
  | "przenosi-sie"
  | "kladzie"
  | "pomija"
  | "rozpatruje";

/**
 * A decision in flight: what kind, and which line of a public list won.
 *
 * `option` is only ever an index into something the whole table can see.
 */
export interface Intent {
  kind: IntentKind;
  option?: number;
}

/**
 * An intent as it reaches the rest of the table: whose it is, and what it is.
 *
 * `by` is a seat index, so a device can tell whether the decision filling is
 * the one it has been waiting on. Named here rather than written out at each
 * stop on the way down — it was spelled `{ by: number; kind: string; option?:
 * number }` in the socket, in the hook's state, in the hook's return type and
 * again in the sheet, four copies of one shape with `kind` widened to `string`
 * in every one of them.
 */
export interface AnnouncedIntent extends Intent {
  by: number;
}

/**
 * Third person, because it is being said *about* somebody to everybody else.
 *
 * The option keeps the second person the card is printed in — „Tracisz 1
 * Sztukę Złota" — and the colon is what makes that work: it quotes the line
 * rather than continuing the sentence, and it quotes it in the same words the
 * `Do wyboru:` list above is already showing, so a reader can match the two.
 * Rewriting the option into third person would break that match for the sake
 * of a grammar nobody is reading it as.
 */
const SAYS: Record<IntentKind, string> = {
  walczy: "walczy",
  "wymyka-sie": "próbuje się wymknąć",
  // „Kartę" for both of these was one word covering two things a player cares
  // about differently — a Przedmiot is points and a Przyjaciel is a Postać that
  // walks with you (6.2), and the button right above them has always said which.
  // „bierze" rather than „zabiera": nobody is being taken from. A Karta just
  // turned over belongs to nobody, and „zabiera" is the word for the Złodziej.
  "bierze-przedmiot": "bierze Przedmiot",
  "bierze-przyjaciela": "bierze Przyjaciela",
  "zostawia-przedmiot": "zostawia Przedmiot",
  "zostawia-przyjaciela": "zostawia Przyjaciela",
  wybiera: "wybiera",
  "przenosi-sie": "przenosi się",
  kladzie: "kładzie Kartę",
  pomija: "pomija",
  rozpatruje: "rozpatruje Kartę",
};

/**
 * The line a watching player reads while the button fills.
 *
 * The ellipsis is doing a job: this is the only sentence in the app that
 * describes something which has not happened and might not. „Test (WIEDŹMA)
 * pomija" would be a report; „Test (WIEDŹMA) pomija…" is a thing in progress,
 * and three seconds later it is either the journal or it never was.
 */
export function intentSaid(actor: string, kind: IntentKind, option?: string | null): string {
  return option ? `${actor} ${SAYS[kind]}: ${option}…` : `${actor} ${SAYS[kind]}…`;
}

/** Every kind this app knows how to say. Exported for the test that counts them. */
export const INTENT_KINDS = Object.keys(SAYS) as IntentKind[];

/**
 * Whether a string off the wire is a kind at all — a browser sent it.
 *
 * `hasOwn` and not `in`, which was the first way this was written and was
 * wrong: `"toString" in SAYS` is true, so a body of `{ kind: "toString" }`
 * passed the guard and came out the far side as a sentence with a function
 * printed in the middle of it.
 */
export function isIntentKind(value: unknown): value is IntentKind {
  return typeof value === "string" && Object.hasOwn(SAYS, value);
}
