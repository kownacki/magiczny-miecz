/** What a character is under, beside its name. */

import Image from "next/image";
import { type Nature } from "@/data/types";
import { CARD_NAMES, CARD_TEXTS, type Seat } from "./table";
import { STONE_CARD, cardArtUrl } from "@/lib/view/cardImages";
import { STONE } from "@/lib/engine/status";
import { useCardPreview } from "./card-preview";
import { ART_BORDER, PICKABLE } from "./pickable";
import { type TileCard } from "./card-tile";
import { SLOT_ART_HEIGHT, SLOT_WIDTH } from "./item-slot";
import { plural } from "@/lib/engine/polish";

/** Twice what it was, and the shape every other card in the app is drawn in. */
const MARK_WIDTH = 40;


/**
 * The three tone marks, drawn rather than typed.
 *
 * `▲ ▼ ■` as characters are three glyphs from a font, and a font sizes them for
 * reading rather than for standing beside each other: the square came out
 * visibly smaller than the triangles and sat lower on the line. No amount of
 * CSS fixes that reliably, because it is the typeface's own metrics.
 *
 * Drawn, they are one shape language: the same box, the same optical area — a
 * triangle of base 8 and height 7 covers 28, so the square is 5.2 a side rather
 * than the 6 that would make it the heavier of the two — and `currentColor`, so
 * whatever colours the count colours the mark.
 */
export function ToneGlyph({ shape }: { shape: "up" | "down" | "square" }) {
  return (
    <svg
      viewBox="0 0 10 10"
      aria-hidden
      className="mr-0.5 inline-block h-[0.85em] w-[0.85em] align-[-0.1em]"
      fill="currentColor"
    >
      {shape === "up" && <path d="M5 1.5 L9 8.5 H1 Z" />}
      {shape === "down" && <path d="M5 8.5 L1 1.5 H9 Z" />}
      {shape === "square" && <rect x="2.4" y="2.4" width="5.2" height="5.2" />}
    </svg>
  );
}

/**
 * Neither, good, bad — the order effects are read in, wherever they are read.
 *
 * The folded bar counts them in this order and the open card draws them in it,
 * because they are one set shown two ways and somebody folding the card to
 * check should find the same thing in the same place.
 *
 * Within a tone they stay in the order they started: `effectsFor` reads them
 * `.order("created_at")` and this sort is stable, so the secondary key is the
 * one the server already sorted by and neither end has to carry a timestamp to
 * get it. The four ad-hoc statuses — a lost turn, the Kamień, a barred Most —
 * have no start of their own and keep the place `allStatuses` gives them.
 */
export const TONE_ORDER = ["obojetny", "dobry", "zly"] as const;

/**
 * What is helping and what is not, said in words.
 *
 * No "otwórz Kartę, żeby zobaczyć które" on the end any more: it was a sentence
 * explaining a click, hanging off the thing that answers the click, under a
 * cursor that already says it can be pressed.
 *
 * Polish counts in three — jeden efekt, dwa efekty, pięć efektów — so the
 * sentence is built rather than pluralised with an "s", the way every other
 * count in this app is (`plural` in `polish.ts`). "Obojętne" are left out of
 * both numbers and named on the end: they are true of the character and neither
 * help nor hurt, and folding them into either count would be an opinion.
 */
export function effectsSaid(effects: readonly { tone: string; title: string }[]): string {
  const count = (tone: string) => effects.filter((mark) => mark.tone === tone).length;
  const said = (n: number, one: string, few: string, many: string) =>
    `${n} ${plural(n, one, few, many)}`;
  const words: Record<string, [string, string, string]> = {
    obojetny: ["inny efekt", "inne efekty", "innych efektów"],
    dobry: ["wzmocnienie", "wzmocnienia", "wzmocnień"],
    zly: ["osłabienie", "osłabienia", "osłabień"],
  };
  // `TONE_ORDER`, like the marks and the counts: one set, three readings, one
  // order between them.
  return TONE_ORDER.filter((tone) => count(tone) > 0)
    .map((tone) => said(count(tone), ...words[tone]))
    .join(", ");
}

/**
 * How many are helping, how many are not, and how many are neither.
 *
 * The summary a *shut* thing owes its reader. One glyph per tone with a number
 * on it rather than one glyph per effect: a row of five identical triangles
 * says "several" in the space where "▲5" says how many, and beside four
 * parameters and a name the space is the whole constraint.
 *
 * "Obojętny" gets its own count rather than being folded into one of the
 * others. Putting a mark that neither helps nor hurts under "helping" would be
 * the app taking a view it has no basis for — and leaving it out entirely was
 * the same mistake the other way, because the hover said "1 inny efekt" over a
 * bar showing only "▲1".
 *
 * Counted in `TONE_ORDER`, which is the order an open card draws the marks in:
 * one set, two readings, one order between them.
 */
export function EffectTally({
  effects,
}: {
  effects: readonly { tone: "dobry" | "zly" | "obojetny" }[];
}) {
  const count = (tone: string) => effects.filter((effect) => effect.tone === tone).length;
  const rows = (
    [
      { n: count("obojetny"), shape: "square", tone: "text-muted" },
      { n: count("dobry"), shape: "up", tone: "text-verdigris" },
      { n: count("zly"), shape: "down", tone: "text-vermilion" },
    ] as const
  ).filter((row) => row.n > 0);

  return (
    <>
      {rows.map((row, at) => (
        <span key={row.shape} className={`${row.tone} ${at > 0 ? "ml-1.5" : ""}`}>
          <ToneGlyph shape={row.shape} />
          {row.n}
        </span>
      ))}
    </>
  );
}

export
function EffectMark({
  mark,
  nature,
}: {
  mark: Seat["effects"][number];
  nature: Nature | null;
}) {
  /**
   * The one status with no card that has a card anyway.
   *
   * `mark.source` is a card id for everything a Karta or a Zaklęcie put on a
   * seat, and one of four bare words for the statuses `fromColumns` projects
   * off the seat's own columns — which is why three of those four fall back to
   * a glyph. Kamień is the exception, and it is the exception because 20.1
   * says so: the box prints a Karta for exactly this state and puts it on the
   * board. A mark that had a picture available and drew an orange square
   * instead was the one status in the app whose own card the app was hiding.
   *
   * The hover follows it. Every other mark with a picture opens the Karta
   * behind it, and this one has the best Karta of the lot to open — four
   * printed lines saying precisely what being stone costs.
   */
  const stone = mark.source === STONE;
  const name = stone ? STONE_CARD.name : CARD_NAMES.get(mark.source);
  const card: TileCard | null = name
    ? {
        cardId: stone ? STONE_CARD.cardId : mark.source,
        name,
        ...(stone ? { ref: STONE_CARD.ref, text: STONE_CARD.text } : { text: CARD_TEXTS.get(mark.source) }),
        kindLabel: mark.title,
      }
    : null;
  const { handlers, preview } = useCardPreview(card, false, "classic", nature);
  const art = stone
    ? cardArtUrl(STONE_CARD.cardId, STONE_CARD.ref)
    : cardArtUrl(mark.source);
  // The shape a card is drawn in everywhere else: the illustration export is
  // 240x155 and every slot in the pack and on the body takes that ratio, so a
  // mark that took it too stopped needing to crop. A square was cutting the
  // sides off an Eliksir to make it fit a shape nothing else here uses.
  const height = Math.round(MARK_WIDTH * (SLOT_ART_HEIGHT / SLOT_WIDTH));
  const ring =
    mark.tone === "dobry"
      ? "border-verdigris text-verdigris"
      : mark.tone === "zly"
        ? "border-vermilion text-vermilion"
        : `${ART_BORDER} text-muted`;

  return (
    <>
      <span
        {...handlers}
        // The native tooltip only where there is no Karta to open instead: two
        // things appearing at once over the same mark is one too many.
        title={card ? undefined : mark.title}
        style={{ width: MARK_WIDTH, height }}
        className={`flex shrink-0 cursor-help items-center justify-center overflow-hidden rounded border leading-none ${ring} ${PICKABLE}`}
      >
        {art ? (
          <Image
            src={art}
            alt=""
            width={MARK_WIDTH}
            height={height}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <span className="text-[15px]">{mark.glyph}</span>
        )}
      </span>
      {preview}
    </>
  );
}
