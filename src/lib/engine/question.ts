/** What the turn is waiting to be told, as a fact about the game rather than as a widget. */

import { ringFields, type FieldId } from "./board";
import type { Destination, Effect } from "./cardScript";
import type { CardId } from "@/data/ids";
import { nodeAt } from "./resolve";
import type { TurnPhase } from "./turn";
import { wordOf } from "./words";

/**
 * The question a suspended Karta is asking, decided once for every surface.
 *
 * # Why this is the engine's and not each screen's
 *
 * It was each screen's, and they disagreed. `ScriptFramePanel` read the node at
 * the cursor and drew buttons for the two shapes it knew; `waitingOn` returned
 * `[]` for a `script` frame and printed nothing at all — while the panel, met
 * with a question it had no controls for, told the table „odpowiedzcie w
 * konsoli". A closed loop, built by two layers each sure the other had it.
 *
 * The reading here is that **a question is a rule**. 16.4 decides which Karta a
 * player is looking at; the Karta's own text decides what it asks; „na dowolny
 * Obszar w tym Kręgu" decides which squares may be pointed at. None of that is
 * a matter of how a screen is laid out, and the moment it was treated as one it
 * went wrong in the way rules go wrong when an interface owns them: the browser
 * drew only ring buttons and so kept 11.2, and the server, trusting it, would
 * put a Postać anywhere at all.
 *
 * So the surfaces choose the widget and nothing else. The browser turns
 * `wybor` into buttons and `gdzie` into a row of Obszary; the console prints
 * the same two as numbered lines and `answer … to <Obszar>`. Neither decides
 * *what* is being asked, and neither can be the only one that knows a rule.
 *
 * # And what it deliberately does not answer
 *
 * `przenies-karte` — the Władca Zdarzeń — asks two things at once, which Karta
 * and where it goes, and the first of them is not on the frame. It comes back
 * `nieobslugiwane`, which is what both surfaces already said about it in their
 * own words. Named rather than guessed at, and named identically on both.
 */
export type TurnQuestion =
  /**
   * Nothing is being chosen: a die has fallen and what it does is waiting for
   * one press. The face is on the Obszar's frame (`markRolled`) and in
   * `reason`, which is why this carries neither.
   */
  | { kind: "dalej"; reason: string }
  /** „Do wyboru" — the Karta's own options, in the Karta's own order. */
  | { kind: "wybor"; reason: string; options: readonly string[] }
  /** An Obszar to point at, and the only ones the Karta allows. */
  | { kind: "gdzie"; reason: string; fields: readonly FieldId[] }
  /**
   * A face of the die, named before it is thrown — the MĘDRZEC's riddle.
   *
   * The only question in the box whose answer is a number the player *chooses*
   * rather than an index into a list, which is why it is its own shape: an
   * index would let „6" mean the sixth option of six and read the same.
   */
  | { kind: "cyfra"; reason: string; faces: readonly number[] }
  /**
   * Which of your own Karty — „tracisz 1 Przedmiot wedle własnego wyboru".
   *
   * The generic „pick one out of a list you are holding", and the shape the
   * box asks for far more often than it asks anything else. It was built once,
   * for the UROCZA DIABLICA's fourth face, and built *in the browser* — so the
   * engine had no answer for it, `questionOn` called it `nieobslugiwane`, and
   * the next card to want the same thing would have grown a second copy.
   *
   * `among` is the list both ends count, in one order, because an index is
   * only an answer if the server and the screen number the same cards the same
   * way.
   */
  | {
      kind: "ktora";
      reason: string;
      co: HeldKind;
      among: readonly { id: string; cardId: CardId }[];
    }
  /** A question no surface can ask yet, said the same way by all of them. */
  | { kind: "nieobslugiwane"; reason: string; op: Effect["op"] };

/** What a holder may be asked to give up — `Losable`'s own three. */
export type HeldKind = "item" | "friend" | "spell";

/**
 * Which pile a loss reaches into, or null when it is not a card at all.
 *
 * `reachableBy` in `losses.ts` is the same question and stays where it is —
 * this is the narrow half `questionOn` needs, kept here so the question type
 * does not import the loss vocabulary whole.
 */
function heldKindFor(co: Extract<Effect, { op: "strata" }>["co"]): HeldKind | null {
  return co === "przedmiot" ? "item" : co === "przyjaciel" ? "friend" : co === "zaklecie" ? "spell" : null;
}

/**
 * Where a Karta may send a Postać — the list, not just the test.
 *
 * The same rule the walk enforces, read forwards: `walk` refuses an Obszar off
 * the Krąg (11.2) and this is what a surface offers so that nobody is refused
 * for pointing at a button that was drawn for them. One function, so the offer
 * and the refusal cannot drift — which they had, in the only direction that
 * matters: the buttons were right and the refusal did not exist.
 *
 * `poczatek-ruchu` is not a choice at all. The STRAŻ names its destination in
 * terms of the turn rather than of the board, so there is nothing to offer and
 * `questionOn` never reaches here for it.
 */
export function destinationsFor(
  to: Destination,
  at: { standingOn: FieldId | null; occupied: readonly FieldId[] },
): FieldId[] {
  switch (to.kind) {
    case "pole":
      return [to.fieldId];
    case "dowolne-w-kregu":
      return ringFields(at.standingOn);
    case "jedno-z":
      // „nie zajętym przez inną Postać" — the Lewiatan's own sentence, and the
      // only one of the three that reads the board as well as the card.
      return to.fieldIds.filter((fieldId) => !at.occupied.includes(fieldId));
    case "poczatek-ruchu":
      return [];
  }
}

/**
 * What the frame on screen is waiting to be told, or null when it is waiting
 * for nothing that can be answered.
 *
 * Takes the two facts a destination needs rather than a `Snapshot`, the way
 * `factsIn` does: this is asked on a browser that has no Snapshot, and the
 * whole point is that both surfaces ask the same function.
 */
export function questionOn(
  frame: TurnPhase,
  at: {
    standingOn: FieldId | null;
    occupied: readonly FieldId[];
    /**
     * The frame's own seat's Karty, and whether any of its hand is concealed.
     *
     * Only a `strata` needs them, and only to list what may be given up.
     * Optional so the callers that ask about a destination need not carry a
     * hand they will not use.
     */
    hand?: {
      holdings: readonly { id: string; cardId: CardId; kind: string }[];
      hidden: number;
    };
  },
): TurnQuestion | null {
  if (frame.phase !== "script") return null;
  /* A thrown die is not a question — see `heldAt`. Nothing has run yet, so
     what the cursor points at is not being asked, it is about to happen. */
  if (frame.held) return { kind: "dalej", reason: frame.reason };

  const asking = nodeAt(frame.effect, frame.cursor);
  if (!asking) return { kind: "dalej", reason: frame.reason };

  const reason = frame.reason;
  const cannot: TurnQuestion = { kind: "nieobslugiwane", reason, op: asking.op };
  /**
   * What the word asks is the word's own (`words.ts`, `asks`); what the table
   * can add to it — free Obszary, the hand — is added here. A node that asks
   * nothing should never be under an unheld cursor, and if one is, saying no
   * surface can ask it is the honest answer rather than a guessed widget.
   */
  const ask = wordOf(asking).asks(asking);
  if (!ask) return cannot;

  switch (ask.kind) {
    case "wybor":
      return { kind: "wybor", reason, options: ask.options };
    case "gdzie":
      return { kind: "gdzie", reason, fields: destinationsFor(ask.to, at) };
    case "cyfra":
      return { kind: "cyfra", reason, faces: ask.faces };
    case "nieobslugiwane":
      return cannot;
    /**
     * „Tracisz 1 Przedmiot" — which one is the holder's, and 5.6 says so.
     *
     * Three ways this is *not* a question, and all three are rules rather than
     * interface limits, which is why they live here now instead of in a
     * browser file:
     *
     * - **More than one at a time.** `chooseLosses` picks against a pool that
     *   shrinks between picks, so two answers are indices into two different
     *   lists. No card in the box asks it.
     * - **A hand somebody cannot see in full** (9.3). Only Zaklęcia are ever
     *   concealed, and a short list numbers differently from the server's.
     * - **Nothing of that kind to lose**, which the server settles by itself.
     */
    case "ktora": {
      const hand = at.hand;
      const co = heldKindFor(ask.co);
      if (!hand || !co || ask.count !== 1) return cannot;
      if (co === "spell" && hand.hidden > 0) return cannot;
      const among = hand.holdings.filter((held) => held.kind === co);
      if (among.length === 0) return null;
      return {
        kind: "ktora",
        reason,
        co,
        among: among.map((held) => ({ id: held.id, cardId: held.cardId })),
      };
    }
  }
}
