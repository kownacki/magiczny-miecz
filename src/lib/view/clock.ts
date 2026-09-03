/** An instant the server wrote, read on the clock of whoever is looking at it. */

/**
 * Why this is in `view/` and not beside the journal's other text.
 *
 * Everything `journalText.ts` produces is the same for everybody: the sentence
 * a row makes is a fact about the game. A time is not. The row carries an
 * instant in UTC because that is the only thing two people in two places can
 * agree on, and what it *reads* as depends on the machine doing the reading —
 * so this cannot run on the server and be sent down finished, the way the
 * sentences are. It is the one part of a journal line the browser has to work
 * out for itself.
 *
 * Which also means it must not be rendered on the server and hydrated on the
 * client: the two would disagree wherever the reader is not in the server's
 * zone, which is most readers. The journal is fetched client-side, so this only
 * ever runs in one place — but that is a property of the caller, and a second
 * caller has to keep it.
 */

/**
 * Polish, like everything else a player reads.
 *
 * Fixed rather than taken from the browser: this app is Polish only (CLAUDE.md
 * — "all source material is Polish; an i18n layer would be pure overhead"), and
 * a journal that said „3 September" beside „Michał zabiera MIECZ" would be one
 * sentence in two languages. The *zone* is the reader's, which is the half that
 * actually varies.
 */
const LOCALE = "pl-PL";

/**
 * An invalid or missing instant reads as nothing at all.
 *
 * Not "—", not "??:??". A time is a detail beside the line, and a placeholder
 * for a detail that is missing is worse than the gap: it draws the eye to the
 * one part of the row that has no information in it. Rows written before the
 * column was read are the case this is for.
 */
function moment(iso: string | undefined): Date | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The hour and the minute, on the reader's clock — „14:32".
 *
 * Two figures and no more, because a journal line is read down a column and
 * seconds would be three characters of noise per row. What a reader wants from
 * the feed is roughly when, and the exact answer is on the hover.
 *
 * `hourCycle: "h23"` rather than trusting the locale, so midnight is 00:00.
 * Polish uses a 24-hour clock and would get this right anyway; naming it means
 * a reader whose machine is set to English does not suddenly see „2:32 PM"
 * beside Polish prose.
 */
export function clockOf(iso: string | undefined): string {
  const at = moment(iso);
  if (!at) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/**
 * The whole of it, for the hover — „3 września 2026, 14:32:07".
 *
 * The date because a table can sit for a week between sessions and „14:32" two
 * lines apart can be six days apart. The seconds because this is the answer to
 * "when exactly", and two lines written in the same minute are the case where
 * somebody is asking.
 */
export function momentOf(iso: string | undefined): string {
  const at = moment(iso);
  if (!at) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(at);
}
