/** The rail up the side of a Karta Postaci: one parameter, drawn as its żetony. */

import Image from "next/image";
import { pileColumns, tokensFor } from "@/lib/view/tokens";

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
 * The Karta Postaci is drawn 192 wide and keeps its proportions, so it stands
 * this tall. Two piles share each side of it.
 */
const CARD_HEIGHT = 238;


/**
 * How tall one pile may stand: half the card, less the ± and the total that
 * share the rail underneath it.
 *
 * Only the gold uses it, and only to work out how much of each coin can show:
 * a full stack of ten is exactly this tall. The żetony proper are counted
 * rather than measured — five to a column — because they have faces that have
 * to stay visible, and a pile whose height depends on the arithmetic is a pile
 * you have to read instead of recognise.
 */
const STACK_HEIGHT = Math.round(CARD_HEIGHT / 2) - 28;


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
 * The two colours printed on a żeton, read off the scans rather than guessed:
 * the field it is printed on and the ink of the numeral standing on it.
 *
 * `MoreThanFits` is the one square on a rail that is drawn instead of
 * photographed, and this is what keeps it from announcing the fact.
 */
const TOKEN_INK: Record<string, { field: string; ink: string }> = {
  sword: { field: "#ff4f14", ink: "#fff300" },
  magic: { field: "#404491", ink: "#f0f8f1" },
  life: { field: "#009640", ink: "#fff508" },
  // The coin is the one with nothing to copy: it carries no numeral, so it has
  // no ink of its own and the dots take a dark gold — the colour a stamp on a
  // coin would be, against the yellow the rest of the stack is.
  gold: { field: "#fff300", ink: "#6f5300" },
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
     * Money is a stack, not a row.
     *
     * There is one gold denomination in the box, so twelve Sztuk Złota is
     * twelve identical coins — and twelve identical coins side by side is a
     * picture nobody reads, while twelve coins in a pile is a thing everybody
     * recognises from across a table. Each sits over the one before with a
     * sliver showing, which is what a stack of chips looks like and costs
     * nothing to draw, since every coin is the same picture anyway.
     *
     * Stacks of ten, each one finished before the next is started.
     *
     * Ten is how money is counted at a table — nobody builds two stacks of
     * seven — and a full one is exactly what its half of the card holds, nine
     * slivers under a whole top coin. Filling each before starting the next is
     * the point of counting that way: a glance at four full stacks and a short
     * one is forty-something without reading anything, where four stacks of
     * eleven and a straggler is just a heap that happens to be in columns.
     *
     * Three stacks and no more — see COLUMNS_MAX. Past thirty the pile stops
     * growing and the numeral goes on being exact, which costs nothing: the
     * coins are all ones, so the picture was only ever an impression of how
     * rich somebody is and the count was always the reading.
     */
    const PER_STACK = 10;
    const REVEAL = Math.floor((STACK_HEIGHT - SIZE) / (PER_STACK - 1));
    // Past thirty the top coin stands down and says so — see `MoreThanFits`.
    // A coin of picture is nothing to give up on a stack this deep, and what
    // is bought with it is the difference between a full pile and a full pile
    // that has stopped counting.
    const { columns: stacks, drawn: coins, cut } = pileColumns(points, PER_STACK);

    return (
      <span className="flex items-start gap-0.5" title={`${label}: ${points}`}>
        {Array.from({ length: stacks }, (_, stack) => (
          <span key={stack} className="flex flex-col items-center">
            {Array.from(
              { length: Math.min(PER_STACK, coins - stack * PER_STACK) },
              (_, index) => (
                <Image
                  key={index}
                  src="/tokens/gold.png"
                  alt=""
                  width={SIZE}
                  height={SIZE}
                  style={index > 0 ? { marginTop: REVEAL - SIZE } : undefined}
                  className="rounded-[2px] shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
                  unoptimized
                />
              ),
            )}
            {cut && stack === stacks - 1 && (
              <MoreThanFits stat={stat} size={SIZE} lift={REVEAL - SIZE} />
            )}
          </span>
        ))}
      </span>
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
 * The last square of a pile that has outgrown its rail.
 *
 * Three columns is the ceiling (`COLUMNS_MAX`), and a rail filled to it used to
 * look exactly like a rail that merely happened to be full: fifteen żetony of
 * four read as sixty whether the seat had sixty or nine hundred, and the only
 * thing that knew the difference was the numeral underneath. The picture had
 * stopped counting without admitting it.
 *
 * So the last token stands down and says there is more. One square of picture
 * is a cheap price at a size where nobody is counting the pile anyway, and
 * anybody who misses the mark still has the exact figure printed below it.
 *
 * Kept from a screen reader: the first token in the pile already announces the
 * parameter and its value, and this adds nothing a listener does not have.
 *
 * Drawn as a żeton and not as a control. It was a dashed outline over the panel
 * for a while, which is the costume every button in this app wears — so the one
 * square on the rail that does nothing was the one square that looked like it
 * did. It wears the pile's own field and ink instead: last in the row, plainly
 * part of it, and plainly not a number.
 */
function MoreThanFits({
  stat,
  size,
  /** The overlap a coin in a gold stack sits at, so the mark stacks like one. */
  lift,
}: {
  stat: string;
  size: number;
  lift?: number;
}) {
  const { field, ink } = TOKEN_INK[stat] ?? TOKEN_INK.sword;
  /**
   * Three dots, drawn rather than typed.
   *
   * A "…" is text, and text on a line sits on its baseline: centring the line
   * box in the square leaves the ink four and a half pixels low, because an
   * ellipsis is all descender-less and hugs the bottom of the em. Measured, not
   * guessed — but the correction is a share of Inter's own metrics, and a
   * magic percentage that quietly stops being right if the font ever falls back
   * is a worse thing to leave behind than three circles.
   *
   * Sized off `size` so they stay the same dots at whatever a żeton is drawn
   * at, and heavy enough to read as the printed ink rather than as punctuation.
   */
  const dot = Math.max(2, Math.round(size * 0.18));
  const gap = Math.max(1, Math.round(size * 0.07));
  return (
    <span
      style={{ width: size, height: size, marginTop: lift, background: field }}
      aria-hidden
      // The coins carry a shadow because they overlap and a stack needs its
      // edges; the żetony sit apart and do not. Whichever pile this ends, it
      // is drawn the way the pictures above it are.
      className={`flex items-center justify-center rounded-[2px] ${
        lift === undefined ? "" : "shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
      }`}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: dot,
            height: dot,
            background: ink,
            marginLeft: index === 0 ? 0 : gap,
          }}
          className="rounded-full"
        />
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
 * What a parameter reads as: the total, with own points behind it where they
 * differ.
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
export function StatFigure({ value, total }: { value: number; total?: number }) {
  const shown = total ?? value;
  return (
    <>
      {shown}
      {shown !== value && <span className="opacity-60"> ({value})</span>}
    </>
  );
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
   * The same reckoned for a fight, which is the same or more.
   *
   * A character has two figures and 1.5 quotes both — the Troll's "parametr
   * Miecza równy 8" and "podczas walki 11 punktom" — because the Miecz card and
   * the Krzyżowiec count in a fight and nowhere else. The rail shows the
   * parameter, which is what the card is asking for and what 14.5's Pułapka
   * subtracts; the fight figure is a hover away, where somebody deciding
   * whether to start one will look for it.
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
    stat !== "gold" && shown === value && tokensFor(value).length === 1;

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
        title={
          inFight !== undefined && inFight !== shown
            ? `${label}: ${shown}, w walce ${inFight} (własne ${value})`
            : shown !== value
              ? `${label}: ${shown} (własne ${value})`
              : `${label}: ${shown}`
        }
        className={`tnum mt-1 min-h-[13px] text-[13px] font-medium leading-none ${STAT_COLOUR[stat] ?? "text-ink"}`}
      >
        {/* Two numbers and no more. The fight figure is a third — 1.5 quotes
            it and it is real, but a rail reading "53 (51) 54" is three numbers
            to hold in your head at a glance, which is worse than knowing one of
            them late. It is on the hover, where somebody weighing a fight will
            be looking anyway. */}
        {saysItself ? "" : <StatFigure value={value} total={total} />}
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
