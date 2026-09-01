/** The Obszar's kolejka: which of the Karty lying there the turn must stop for, in the order 15.2 puts them. */

import { CARD_CLASS, type CardClass } from "@/data/types";
import { goesToAField, scriptFor } from "./cardScript";
import type { TurnCard } from "./state";

/**
 * Two words that are not the same word.
 *
 * **The stack** is docs/STACK.md's, and it is a stack of turn *phases* —
 * `[field, loop, fight]` — that exists so a turn can be interrupted and come
 * back to where it was. **The kolejka** is this: the Karty waiting on one
 * Obszar, which live inside a single `field` frame as `drawn` and `resolved`.
 *
 * The relationship is that the kolejka sits inside one frame of the stack.
 * Working a Karta may *push* a stack frame — a Wróg pushes `fight`, a script
 * that suspends pushes `script` — and when that pops the turn is back in the
 * same `field` frame with the same kolejka, one Karta further along. Six Karty
 * on Płaskowyż Mgieł are one `field` frame with six entries, not six frames.
 *
 * # What earns a place here
 *
 * Not every Karta. A frame is for **what must happen**; everything a character
 * merely *may* do belongs in the Obszar's own window, where 12.1 already puts
 * it: "w każdej chwili, aż do końca swojej tury może odwiedzić znajdującego się
 * tam Nieznajomego, zabrać leżące złoto, Przedmioty lub Przyjaciół". A rule
 * that grants free timing is a rule against sequencing the thing it names.
 *
 * So the Cudotwórca who has lived on this Obszar for twenty turns does not get
 * a ceremonial frame on the twenty-first visit — he is a service, and services
 * are offered, not queued. The Labirynt does, because it happens to you.
 *
 * The table still sees every Karta: that is what the reveal on arrival is for,
 * where the whole deal is shown at once before anything is resolved. A frame is
 * an obligation, not an announcement.
 */

export type FrameKind =
  /** 15.1: goes to a named Obszar, "rozpatrywana w pierwszej kolejności". */
  | "placed"
  /** I, 16.1: "należy wykonać zawartą w Karcie instrukcję". */
  | "spotkanie"
  /** II, 16.2 + 17.5: every Bestia here at once, their Miecze summed. */
  | "wrogowie-miecz"
  /** III, 16.3 + 18.2: every Demon here at once, their Magie summed. */
  | "wrogowie-magia"
  /** IV, 16.5, and only the ones that give no choice. */
  | "nieznajomy"
  /** VI, 16.7, and only the ones that give no choice. */
  | "miejsce";

export interface KolejkaFrame {
  kind: FrameKind;
  /** The Karty this frame is about: one, except the two Wrogowie frames. */
  cards: TurnCard[];
  /** Every card in it has been settled this turn. */
  done: boolean;
}

/**
 * Whether the character may simply walk past this Karta.
 *
 * `optional` has been on `CardScript` since the cards were transcribed and read
 * by nothing — this is its first caller. It is set from the verb the card
 * itself uses, which is the distinction the box draws and draws consistently:
 * "Każdy, kto tu **trafi**" happens because you landed (the Labirynt, the
 * Spalona Ziemia, the Urocza Diablica), while "która tu **zawita**", "podczas
 * każdych **odwiedzin**", "jeżeli **chcesz**" happen because you visited.
 *
 * A Karta with no script at all counts as compulsory. 16.5 and 16.7 both say
 * the instruction must be carried out, and an untranscribed card is one nobody
 * has checked — skipping it silently is the worse of the two mistakes.
 */
function mayWalkPast(cardId: string): boolean {
  return scriptFor(cardId)?.optional === true;
}

/**
 * Whether this Karta stops the turn, or merely offers itself.
 *
 * Exported because the Obszar's window needs the same answer from the other
 * side: what does not earn a frame is exactly what that window offers.
 */
export function owesAFrame(card: TurnCard): boolean {
  // 15.1 sits above the numerals, and a Karta that relocates itself has to be
  // dealt with before it can be anywhere else.
  if (goesToAField(card.cardId)) return true;
  switch (card.cardClass) {
    // 16.1, 16.2, 16.3: a Spotkanie is obeyed and a Wróg attacks. Neither
    // asks, and no card of either class is `optional`.
    case "encounter":
    case "foe":
    case "demon":
      return true;
    // 16.6 is the one class whose *rule* says "może", and 12.1 gives it the
    // run of the turn. Never a frame: taking is offered, not sequenced.
    case "item":
    case "friend":
      return false;
    // 16.5 and 16.7 make the instruction binding — but most of those
    // instructions are themselves "możesz", and those are the Obszar's window's.
    case "stranger":
    case "place":
      return !mayWalkPast(card.cardId);
  }
}

const FRAME_OF: Record<Exclude<CardClass, "item" | "friend">, FrameKind> = {
  encounter: "spotkanie",
  foe: "wrogowie-miecz",
  demon: "wrogowie-magia",
  stranger: "nieznajomy",
  place: "miejsce",
};

/** The two frames that hold a pack rather than a card (17.5, 18.2). */
const SUMMED = new Set<FrameKind>(["wrogowie-miecz", "wrogowie-magia"]);

/**
 * The kolejka, in the order it is worked through.
 *
 * `cards` arrives in `resolutionOrder`'s order — 15.1's placed Karty first,
 * then ascending numeral, arrival order inside each — and this preserves it:
 * frames come out in the order their first card appears, so nothing here is a
 * second copy of 15.2 to keep in step with the first.
 *
 * The two Wrogowie frames are the exception and are the reason this returns
 * groups rather than cards. 17.5 is plain — "Jeżeli Postać jest atakowana przez
 * więcej niż jedną istotę, Miecze tych istot są sumowane" — and 18.2 resolves
 * magical combat "w identyczny sposób". Miecz and Magia cannot be added to each
 * other, so a Wilk, a Wilkołak and a Demon on one Obszar are two fights and
 * never one or three.
 */
export function kolejkaFor(
  cards: readonly TurnCard[],
  resolved: readonly string[] = [],
): KolejkaFrame[] {
  const frames: KolejkaFrame[] = [];
  const summed = new Map<FrameKind, KolejkaFrame>();

  for (const card of cards) {
    if (!owesAFrame(card)) continue;
    const done = resolved.includes(card.cardId);

    // 15.1's Karty are each their own frame whatever numeral they print: each
    // rolls its own die for its own Obszar, so two of them are two questions.
    const kind: FrameKind = goesToAField(card.cardId)
      ? "placed"
      : FRAME_OF[card.cardClass as Exclude<CardClass, "item" | "friend">];

    if (SUMMED.has(kind)) {
      const already = summed.get(kind);
      if (already) {
        already.cards.push(card);
        // A pack is settled together, so it is done only when all of it is.
        already.done = already.done && done;
        continue;
      }
      const frame: KolejkaFrame = { kind, cards: [card], done };
      summed.set(kind, frame);
      frames.push(frame);
      continue;
    }

    frames.push({ kind, cards: [card], done });
  }

  return frames;
}

/** The frame the turn is stopped at, or null when the kolejka is worked through. */
export function nextFrame(
  cards: readonly TurnCard[],
  resolved: readonly string[] = [],
): KolejkaFrame | null {
  return kolejkaFor(cards, resolved).find((frame) => !frame.done) ?? null;
}

/**
 * What the Obszar's window offers: everything the kolejka does not stop for.
 *
 * The other half of `owesAFrame`, said here so the two cannot drift into
 * disagreeing about a card and either queueing it twice or losing it. 12.1's
 * "w każdej chwili" is what makes this a list rather than a sequence.
 */
export function offeredNotQueued(cards: readonly TurnCard[]): TurnCard[] {
  return cards.filter((card) => !owesAFrame(card));
}

/** For a caller that wants the numeral rather than the frame — the Obszar's inventory. */
export function classRank(cardClass: CardClass): number {
  return CARD_CLASS[cardClass];
}
