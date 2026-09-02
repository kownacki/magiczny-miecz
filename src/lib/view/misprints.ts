/** The box's own printing errors, and what the Księga shows instead. */

/**
 * A citation the Instrukcja prints wrongly, and its settled reading.
 *
 * The transcription in `docs/RULES.md` keeps what the paper says, errors and
 * all, and it has to: a transcription that quietly repaired the paper is one
 * nobody can check against the paper, which is the same contract as
 * „ORYGINALNY OPIS" on an Obszar and `src/data/raw/` for the fourteen cards
 * that went to print reading NAZWA KARTY.
 *
 * But the Księga is not the transcription. It is the Instrukcja as a reader
 * uses it — every rule number in it is a link — and a number that leads nowhere
 * is worse than one that is silently right. So the correction lives here,
 * between the record and the reader, named and reasoned rather than edited into
 * the source.
 *
 * One entry so far. Deliberately not a general spell-checker: each of these is
 * a decision about what the book meant, and each one has to be argued.
 */
export interface Misprint {
  /** Exactly as printed. */
  printed: string;
  /** What it is shown as. */
  reading: string;
  /** Why — carried into the Księga's own note beside the rule. */
  because: string;
}

export const MISPRINTS: readonly Misprint[] = [
  {
    // 16.6: „Postać może zabrać te Karty ze sobą, jeżeli tylko wolno jej to
    // zrobić (58.3-4.)."
    printed: "(58.3-4.)",
    reading: "(5.3-4.)",
    because:
      "Rozdział 8 kończy się na 8.2, więc nie ma czego cytować jako 8.3-4. " +
      "A 5.3 (Przedmiot, którym nie wolno się posługiwać) i 5.4 (najwyżej cztery) " +
      "to dokładnie te dwa warunki, o które chodzi w „jeżeli tylko wolno jej to " +
      "zrobić" + '"' + " — dlatego cytat jest zakresem. 12.1 i 13.5 odsyłają w tej " +
      "samej sprawie do rozdziału 5.",
  },
];

/**
 * One line of the Instrukcja, as the Księga shows it.
 *
 * A plain replace rather than anything cleverer: these are exact strings the
 * book prints, and a pattern would be a way of correcting something nobody
 * looked at.
 */
export function asRead(text: string): string {
  let out = text;
  for (const misprint of MISPRINTS) out = out.split(misprint.printed).join(misprint.reading);
  return out;
}

/** Whether a line carries one, so the Księga can say it did the swapping. */
export function misprintsIn(text: string): Misprint[] {
  return MISPRINTS.filter((one) => text.includes(one.printed));
}
