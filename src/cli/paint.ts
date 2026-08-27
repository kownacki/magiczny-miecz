/** The little terminal styling there is, and the two reasons it turns itself off. */

/**
 * Why this is a function and not a template literal at the call site.
 *
 * Escape codes are invisible until they are not. Piped into a file, read by a
 * script, or shown on something that does not speak SGR, `\x1b[3m` is four
 * characters of noise in the middle of a sentence — and this program is driven
 * by pipes more than by people: `npm run soak` plays a whole game through it,
 * and every test that touches the prompt feeds it stdin.
 *
 * So the decision is made once, here, on the two conditions everybody honours:
 * a terminal on the other end, and `NO_COLOR` unset (no-color.org — it is about
 * styling generally, not only colour). Nothing else in the CLI writes an escape
 * code, which keeps the answer to "why is there garbage in my output" a single
 * place to look.
 */
export interface Paint {
  /** The journal, and anything else quoting the game back at you. */
  italic(text: string): string;
  /** Secondary text — a hint beside an answer, not the answer. */
  dim(text: string): string;
}

const PLAIN: Paint = { italic: (text) => text, dim: (text) => text };

const STYLED: Paint = {
  // 23 rather than 0, so this cannot switch off styling somebody else turned on.
  italic: (text) => `\x1b[3m${text}\x1b[23m`,
  dim: (text) => `\x1b[2m${text}\x1b[22m`,
};

/**
 * Italic is the one SGR code with real gaps in support — a few terminals render
 * it as reverse video, which is worse than nothing. Both of the ones that do
 * are decades old and neither sets `TERM` to anything this would match, so the
 * check is the ordinary one and the escape hatch is `NO_COLOR`.
 */
export function paintFor(
  tty: boolean | undefined,
  /** Read rather than reached for, so a test can say what the world looks like. */
  env: Partial<Record<string, string>> = process.env,
): Paint {
  if (!tty) return PLAIN;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return PLAIN;
  if (env.TERM === "dumb") return PLAIN;
  return STYLED;
}
