/** Sentences this table adds to the Instrukcja where the Instrukcja leaves a hole. */

/**
 * An addition to a printed rule.
 *
 * Not a correction — that is `misprints.ts`, where the book says something wrong
 * and we show what it meant. This is the other kind of defect: the book says
 * nothing at all, and a referee cannot say nothing. Somebody is standing on an
 * Obszar waiting to be told whether they may walk up to the Targowisko, and
 * „the Instrukcja is silent" is not an answer a game can be played on.
 *
 * # The rules for adding a rule
 *
 * **Only where the book is silent.** If it says something and says it wrongly,
 * that is a misprint. If it says something we dislike, that is a house variant
 * and belongs behind a table setting, not here.
 *
 * **In the book's own voice and vocabulary**, so it reads as the sentence that
 * should have been there rather than as a patch. Where the box already uses a
 * word for the thing, use that word.
 *
 * **Argued, and the argument shown.** Every addendum carries `because`, and the
 * Księga prints it under the rule. A reader holding the Instruktja next to the
 * screen has to be able to see exactly what we added and why — otherwise the
 * referee is quietly making up rules, which is the one thing it may never do.
 *
 * **Never in the transcription.** `docs/RULES.md` and `rules.json` keep only
 * what was printed. The addition lives here and is composed in at render time,
 * drawn in ochre so it is visibly ours.
 */
export interface Addendum {
  /** The rule it joins, as the book numbers it. */
  rule: string;
  /** Verbatim text from that rule, immediately before the insertion. */
  after: string;
  /** What is added, in the book's own register. */
  text: string;
  /** Why the hole is real and why this fills it. Shown under the rule. */
  because: string;
}

export const ADDENDA: readonly Addendum[] = [
  {
    rule: "12.1",
    after: "odwiedzić znajdującego się tam Nieznajomego",
    text: " lub Miejsce (16.7)",
    because:
      "Instrukcja nigdzie nie mówi, kiedy wolno skorzystać z Miejsca, które " +
      "zostaje na Obszarze — z TARGOWISKA, DRZEWA ŻYCIA czy GROTY. 15.2 " +
      "porządkuje rozpatrywanie Kart, a nie odwiedziny; 12.1 daje swobodę " +
      "odwiedzin, ale wylicza tylko Nieznajomych, złoto, Przedmioty i " +
      "Przyjaciół. Zostaje dziura: sklep stojący na Obszarze do końca " +
      "rozgrywki i żadnej reguły mówiącej, kiedy się do niego podchodzi. Sama " +
      "Instrukcja nazywa Miejsca odwiedzanymi (opisy Miejsc, które odwiedzą " +
      "podczas wędrówki — z opisu Kart Zdarzeń), więc dopisujemy je tam, gdzie " +
      "już powinny były być. Nie zmienia to 16.7: Miejsce, którego Karta każe " +
      "(LABIRYNT), pozostaje obowiązkowe. Dodatek mówi tylko, KIEDY wolno " +
      "skorzystać, a nie CZY trzeba.",
  },
];

/** One piece of a rule's paragraph: printed, or ours. */
export interface Segment {
  text: string;
  added: boolean;
}

/**
 * A paragraph split into what the book printed and what this table adds.
 *
 * Anchored on verbatim text rather than an offset, for the reason `misprints.ts`
 * uses exact strings: an addendum that silently stopped applying because the
 * transcription gained a comma would be worse than one that never applied.
 * `addendaFor` is how a caller notices it did nothing.
 */
export function withAddenda(rule: string | null, para: string): Segment[] {
  const mine = ADDENDA.filter((one) => one.rule === rule && para.includes(one.after));
  if (mine.length === 0) return [{ text: para, added: false }];

  let rest = para;
  const out: Segment[] = [];
  for (const one of mine) {
    const at = rest.indexOf(one.after) + one.after.length;
    out.push({ text: rest.slice(0, at), added: false });
    out.push({ text: one.text, added: true });
    rest = rest.slice(at);
  }
  if (rest) out.push({ text: rest, added: false });
  return out;
}

/** The addenda that actually landed in this paragraph, for the note under it. */
export function addendaFor(rule: string | null, para: string): Addendum[] {
  return ADDENDA.filter((one) => one.rule === rule && para.includes(one.after));
}
