/** The rail up the side of a Karta Postaci: one parameter, drawn as its żetony. */

import Image from "next/image";
import { COLUMNS_MAX, pileColumns, tokensFor } from "@/lib/view/tokens";
import { CoinStack, MoreThanFits } from "./token-pile";
import { IN_FIGHT, figuresOf } from "@/lib/engine/figures";

/**
 * The pictures, and the sums that arrange them.
 *
 * Split out of `seat-card.tsx`, which had grown to a thousand lines around one
 * component. Three of the doc comments in here were found at the bottom of that
 * file, stacked above constants they had nothing to do with: an earlier split
 * moved the functions and left their explanations behind, which is the quiet
 * way a file stops being worth reading. They are back on the things they
 * describe.
 */

/**
 * How tall one pile may stand: half the Karta Postaci — drawn 192 wide, so 238
 * tall — less the ± and the total that share the rail underneath it.
 *
 * Ninety-one, and nothing computes against it any more. It used to divide the
 * gold's overlap, which made how far the coins sat over each other a function
 * of how many there were; the overlap is half a coin now, wherever a coin is
 * drawn, and `tokens.test.ts` holds a full stack of ten to this number instead.
 * The two agree because the proportion was read off this rail in the first
 * place: `(91 - 16) / 9` floors to exactly 8.
 *
 * Kept as the note it is. A constant nothing reads is worth deleting; a measure
 * a test is enforcing somewhere else is worth writing down where the thing it
 * measures is drawn.
 */


/**
 * The colour each parameter is counted in.
 *
 * The same four the box prints its żetony in (1.2, 2.2, 4.1, 3.1), so the
 * numeral under a pile belongs to it by colour alone. Nothing else on the rail
 * names the parameter — the word is on the card, printed up the edge the pile
 * stands against.
 */

const STAT_COLOUR: Record<string, string> = {
  sword: "text-miecz",
  magic: "text-magia",
  life: "text-zycie",
  gold: "text-zloto",
};


/**
 * A number of points, as the tokens it is made of.
 *
 * This is what the table looks like: a character's own Miecz is a little pile
 * of red squares beside its card, and the rulebook never asks anybody to write
 * the number down. It asks for "żetony o odpowiednim nominale" (1.4, 2.4, 4.5)
 * — change, made out of the four denominations the box prints.
 *
 * Złoto is the exception and gets one coin and a count. There is only the one
 * gold denomination, so a hoard would be that many coins in a row, and by the
 * middle of a game that is a picture of a pile rather than a reading of it.
 * Everything else in the app already counts gold in numerals — "za 2 Sztuki
 * Złota" — so this reads the same way.
 */
export function Tokens({ stat, points, label }: { stat: string; points: number; label: string }) {
  /**
   * How big a żeton is drawn, and the number everything else on the rail comes
   * off. The pictures are about 100px square, so this is a sixth of what is
   * there and stays sharp on any screen worth having.
   *
   * Sixteen is where a column of five finally fits the half of the card it is
   * given — eighty-eight against ninety-one — where at eighteen it was seven
   * over and two full rails could outgrow the Karta they stand against.
   *
   * It also brings the two kinds of pile to the same height: a stack of ten
   * coins is eighty-eight as well, so a full rail is a full rail whichever
   * parameter it belongs to.
   */
  const SIZE = 16;
  if (stat === "gold") {
    /**
     * Money is a stack, not a row — see `CoinStack`, which is that picture and
     * is shared with the gold lying on an Obszar.
     *
     * Stacks of ten, each finished before the next is started. Ten is how money
     * is counted at a table — nobody builds two stacks of seven — and a full one
     * is exactly what its half of the card holds. Three stacks at the outside
     * (`COLUMNS_MAX`): past thirty the pile stops growing and the numeral goes
     * on being exact, which costs nothing, since the coins are all ones and the
     * picture was only ever an impression of how rich somebody is.
     */
    return (
      <CoinStack
        count={points}
        src="/tokens/gold.png"
        size={SIZE}
        perStack={10}
        maxColumns={COLUMNS_MAX}
        // The two piles on a rail nearly touch, which is `gap-0.5`.
        gap={2}
        stat={stat}
        title={`${label}: ${points}`}
        /* Announced once, exactly as the żetony branch below does it. The pile
           of coins used to be silent — every `alt` empty — and the only thing
           saying how rich a seat was, was the numeral `RailStat` prints under
           it. */
        alt={`${label} ${points}`}
      />
    );
  }

  const tokens = tokensFor(points);
  // Nothing is the honest picture of nothing: a character at zero Życie has had
  // its last token taken off the table (4.4), and the empty space where its
  // żetony were is what the table itself shows.
  //
  // There was a "0" drawn here instead, on the reasoning that a gap would read
  // as a stat the app had failed to work out. What actually reads that way is
  // two zeros in a column — one standing where the tokens go and one under it
  // as the reading — because the rail below always prints the figure when the
  // pile is not already it. The gold has done it this way from the start: an
  // empty stack, and the numeral saying nought.

  /**
   * Five to a column, each one finished before the next is started.
   *
   * The same counting the gold stacks use, and for the same reason: a column
   * of a known height is a number you can take in without reading, and a
   * column whose height depends on how much there is altogether is not. Five
   * because these do not overlap the way coins do — every żeton has to show
   * its face, since unlike gold they come in four denominations and which ones
   * they are is half the reading.
   */
  const PER_COLUMN = 5;
  // And three columns at the outside, the same ceiling the gold has — the same
  // sum, too, which is why both ask `pileColumns` rather than each doing it.
  // What gets dropped is the tail, and `tokensFor` puts the big denominations
  // first, so a pile too large to draw still shows the part worth looking at.
  const { columns, drawn: room, cut } = pileColumns(tokens.length, PER_COLUMN);
  const drawn = tokens.slice(0, room);

  return (
    <span className="flex items-start gap-0.5" title={`${label}: ${points}`}>
      {Array.from({ length: columns }, (_, column) => (
        <span key={column} className="flex flex-col items-center gap-0.5">
          {drawn
            .slice(column * PER_COLUMN, (column + 1) * PER_COLUMN)
            .map((token, index) => (
              <Image
                key={index}
                src={`/tokens/${stat}-${token}.png`}
                // Read once, by the very first token. Four images each
                // announcing a number would have a screen reader count the
                // pile aloud.
                alt={column === 0 && index === 0 ? `${label} ${points}` : ""}
                width={SIZE}
                height={SIZE}
                className="rounded-[2px]"
                unoptimized
              />
            ))}
          {cut && column === columns - 1 && <MoreThanFits stat={stat} size={SIZE} />}
        </span>
      ))}
    </span>
  );
}


/**
 * One parameter, as a pile of żetony up the side of the character card.
 *
 * The colour is the label. Every token in the box says which parameter it
 * belongs to by being red, blue, green or gold (1.2, 2.2, 4.1, 3.1), the card
 * prints the word right beside where the pile goes, and a caption under each
 * one would be the third time. The word is still in the title and read aloud to
 * a screen reader; it is just not drawn twice.
 *
 * The +/- are always available to any seated player, not just the value's
 * owner. At a table people spot each other's miscounts, and an override that
 * only the owner can use is useless in the moment someone else notices.
 */
/**
 * What a parameter reads as: all three figures, with the ones that say nothing
 * left out.
 *
 * One place decides it, because two say it — the rail under the pile and the
 * folded sheet's own heading — and a folded card reading "3" against a rail
 * reading "5 (3)" is the same character with two strengths. 1.2 and 2.2 are
 * what make the pair necessary at all: the żetony are own points and a
 * Przedmiot's are never marked with one, so the second number is the only place
 * the cards on the table are added up.
 *
 * Dimmed rather than recoloured, so the total stays the thing being read. Where
 * nothing has been added — Życie and Złoto always, since 3.1 and 4.1 make the
 * żetony the whole value — it is one number and no parenthesis: "12 (12)" is
 * the same fact twice.
 */
export function StatFigure({
  value,
  total,
  inFight,
}: {
  value: number;
  total?: number;
  /**
   * The same reckoned for a fight (1.5).
   *
   * It used to be a `title`, reachable only by pointing — absent on a phone,
   * which is the device at a table, and invisible to the person deciding
   * whether to start a fight. Every weapon in the box counts „w walce" and
   * nowhere else, so for anybody armed this is *the* number.
   */
  inFight?: number;
}) {
  const parametr = total ?? value;
  const figures = figuresOf(value, parametr, inFight ?? parametr);
  if (figures.bare) return <>{figures.parametr}</>;
  return (
    <>
      {figures.parametr}
      {figures.walka !== null && (
        <>
          {", "}
          {figures.walka}
          {/* Bigger than the digits it sits among, the same way an effect mark
              is drawn at 15px inside 13px text: a symbol at the size of a
              numeral reads smaller than one, because it has no x-height to
              match. */}
          <span className="text-[15px] leading-none opacity-70">{IN_FIGHT}</span>
        </>
      )}
      {figures.own !== null && <span className="opacity-60"> ({figures.own})</span>}
    </>
  );
}

/**
 * The hover for one rail: the numeral in words, in the same order it is drawn.
 *
 * The parametr needs no name — it is what the label already said, and it is
 * what a Karta means by „Miecz". The other two are departures from it and are
 * named as such.
 *
 * ```
 * Miecz: 6                                nothing lends anything
 * Miecz: 8, bazowe 6                      always-on only
 * Miecz: 6, w walce 9                     fight-only only
 * Miecz: 105, w walce 106, bazowe 104     all three
 * ```
 */
function statTitle(label: string, own: number, parametr: number, walka: number): string {
  const figures = figuresOf(own, parametr, walka);
  return `${label}: ${[
    String(figures.parametr),
    figures.walka === null ? null : `w walce ${figures.walka}`,
    figures.own === null ? null : `bazowe ${figures.own}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ")}`;
}

export function RailStat({
  label,
  value,
  total,
  inFight,
  stat,
  canAdjust,
  onAdjust,
}: {
  label: string;
  value: number;
  /** Own points plus what is carried. Shown only when the two differ. */
  total?: number;
  /**
   * The same reckoned for a fight, and not necessarily more.
   *
   * 1.5 quotes both — the Troll's "parametr Miecza równy 8" and "podczas walki
   * 11" — because a Miecz and a Krzyżowiec count in a fight and nowhere else.
   * It can also be *lower*: a Rycerz fights in your place with his own three,
   * not with yours, so nothing here may assume it is the largest of the three.
   */
  inFight?: number;
  stat: string;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  // Życie and Złoto have no derived half at all — 3.1 and 4.1 make the żetony
  // the whole value — so those rails have no `total` and the number under them
  // is simply what they are.
  const shown = total ?? value;
  // One token says its own value on its face. Gold is never one token in the
  // sense that matters — its stack is all ones — and a total the żetony do not
  // add up to has to be written down whatever the pile looks like.
  const saysItself =
    stat !== "gold" &&
    shown === value &&
    (inFight === undefined || inFight === shown) &&
    tokensFor(value).length === 1;

  return (
    // No width of its own. It was a fixed nine while a pile was always one
    // column wide, then a minimum of nine so a pile that had turned a corner
    // had room for the second — and by the time a żeton was drawn at sixteen
    // the minimum was more than twice what a single column needs, holding the
    // rails away from the Karta they are captions for. What is in it is what
    // it is wide.
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <Tokens stat={stat} points={value} label={label} />
      {/* The +/- move OWN points, which are what the rules floor at the
          starting value (1.3, 2.3). The total is derived from the cards on the
          table and is not editable — correcting it means changing what is held,
          not typing a different number.

          Which is also why the tokens stand for `value` and never `total`: 1.3
          and 2.5 are explicit that what a Przedmiot or a Przyjaciel lends you
          is not marked with a żeton, so a pile adding up to a number the table
          never had tokens for would be the interface inventing a rule. The
          figure under the pile is the one the cards make. */}
      {/*
        The number, wherever the pile is not already the number.

        A pile of nine tokens is not a reading of nine, which is why the gold
        has carried a numeral from the start and the other three want one too.
        But a rail showing ONE token has nothing to add: the żeton has its value
        printed on its face, so "1" under a tile reading 1 is the same fact
        twice and makes a small character's card look like a stat block.

        Gold keeps it always — that stack is all ones and capped at three
        columns, so the picture never states the amount — and so does any rail
        where the total differs from what the żetony show, since 1.2 keeps a
        Przedmiot's points off them and the numeral is then carrying what the
        tokens cannot.

        The space is held either way, so four rails with different answers still
        end level.
      */}
      <span
        /**
         * The same three figures the numeral shows, named, and in the same
         * order it draws them.
         *
         * It used to read them the other way round, so the rail said
         * "106⚔, 105 (104)" and the hover answered "105, w walce 106, bazowe
         * 104". Two orders for three numbers is one order too many.
         *
         * Off `figuresOf`, so which of them are worth saying is decided once
         * and not twice. Every one that survives is named, because the middle
         * figure has no parenthesis or glyph to identify it — and „parametr"
         * and „w walce" are the rulebook's words, defined in the shelf's own
         * glossary.
         */
        title={statTitle(label, value, shown, inFight ?? shown)}
        className={`tnum mt-1 min-h-[13px] text-[13px] font-medium leading-none ${STAT_COLOUR[stat] ?? "text-ink"}`}
      >
        {/* All three, in `figures.ts`'s notation: the fight figure marked with
            crossed swords, then the parametr, then own in parentheses — and
            each one dropped where it equals the next. Three numbers is a lot at
            a glance, which is why most rails show one or two: only nine of the
            fifteen point-giving cards are fight-only and only one item in the
            box is both wearable and always on, so all three differ rarely. */}
        {saysItself ? "" : <StatFigure value={value} total={total} inFight={inFight} />}
      </span>
      {canAdjust && (
        // Always visible rather than revealed on hover. Phones are the primary
        // device at a table and have no hover, so a hover-gated override is an
        // override that does not exist for most of the people using it.
        <div className="flex gap-0.5">
          <button
            onClick={() => onAdjust(stat, -1)}
            title={`${label} −1`}
            className="h-4 w-4 rounded border border-edge text-[10px] leading-none text-muted hover:border-vermilion hover:text-ink"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(stat, 1)}
            title={`${label} +1`}
            className="h-4 w-4 rounded border border-edge text-[10px] leading-none text-muted hover:border-verdigris hover:text-ink"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
