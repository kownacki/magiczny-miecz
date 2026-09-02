/** Sentences this table adds to the Instrukcja where the Instrukcja leaves a hole. */

import { asRead } from "./misprints";

/**
 * An addition to a printed rule.
 *
 * Not a correction — that is `misprints.ts`, where the book says something wrong
 * and we show what it meant. This is the other kind of defect: the book says
 * nothing at all, and a referee cannot say nothing. Somebody is standing on an
 * Obszar waiting to be told whether they may walk up to the Targowisko, and
 * „the Instrukcja is silent” is not an answer a game can be played on.
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
 * Księga prints it under the rule. A reader holding the Instrukcja next to the
 * screen has to be able to see exactly what we added and why — otherwise the
 * referee is quietly making up rules, which is the one thing it may never do.
 *
 * **Never in the transcription.** `docs/RULES.md` and `rules.json` keep only
 * what was printed. The addition lives here and is composed in at render time,
 * drawn in ochre so it is visibly ours.
 *
 * Shown as „Uzupełnienie”, never „dodatek” — that word already means an
 * expansion box (docs/EXPANSIONS.md), and this is its opposite: a sentence the
 * base game should have had.
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
  /**
   * Renders as its own paragraph after the anchor, rather than inside it.
   *
   * For an addition that is a *clause of a list* — 12.1's exceptions are three
   * paragraphs, a), b) and now c), and a c) run onto the end of b) reads as
   * part of b).
   */
  own?: true;
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
      "(LABIRYNT), pozostaje obowiązkowe. Uzupełnienie mówi tylko, KIEDY wolno " +
      "skorzystać, a nie CZY trzeba.",
  },
  {
    rule: "12.1",
    after: "lub rozpatrzeć treść wyciągniętych Kart.",
    text:
      " Swoboda ta dotyczy chwili, a nie wyboru: Kartę, której instrukcja każe " +
      "(16.5, 16.7), trzeba rozpatrzyć przed końcem tury.",
    because:
      "12.1 mówi „może odwiedzić”, więc czyta się jak zgoda na to, żeby nie " +
      "odwiedzać wcale — a UROCZA DIABLICA i LABIRYNT zostają na Obszarze i " +
      "każą („będziesz musiał”, „Każdy, kto tu trafi”). Bez tego zdania " +
      "wychodzi, że 12.1 znosi ich przymus, czego nie robi: daje wolność " +
      "chwili, nie wyboru. Druga połowa tej samej granicy stoi przy 15.2.",
  },
  {
    rule: "15.2",
    after: "Karta o najniższym numerze rozpatrywana jest jako pierwsza.",
    text:
      " Kolejność ta wiąże Karty, których instrukcję trzeba wykonać; z Kart, " +
      "które jedynie coś oferują, wolno skorzystać w dowolnej chwili (12.1).",
    because:
      "15.2 każe rozpatrywać „pozostałe Karty Zdarzeń” po kolei, tak jakby " +
      "każda Karta była zdarzeniem. Nie każda jest: instrukcją TARGOWISKA jest " +
      "„może kupić”, a wykonanie takiej instrukcji to po prostu otwarty " +
      "kram — nie ma tu czego ustawiać w kolejce. Instrukcja nie przewiduje " +
      "Karty, która niczego nie robi, tylko stoi; to zdanie ją przewiduje. " +
      "Bez niego 15.2 i 12.1 przeczą sobie wprost: jedno każe trzymać " +
      "kolejność Kart IV-VI, drugie pozwala z nich korzystać „w każdej chwili”.",
  },
  {
    rule: "12.1",
    after: "b) Jest to Obszar, na który ciągnięte są Karty (13.4).",
    own: true,
    text:
      "c) Na Obszarze leżą Karty, do których instrukcji Postać musi się " +
      "zastosować (16.5, 16.7).",
    because:
      "a) i b) mówią to samo dwa razy: Obszar coś Postaci zadał i póki tego nie " +
      "załatwi, niczego stąd nie bierze — raz o Wrogach, raz o Kartach do " +
      "wyciągnięcia. Trzeciego przypadku Instrukcja nie wypisała, choć jest " +
      "tego samego rodzaju: na Obszarze leży LABIRYNT albo UROCZA DIABLICA, " +
      "czyli Karta, której instrukcji trzeba się zastosować. Sam podział jest " +
      "w książce — 13.5: „Do niektórych instrukcji Postać musi się zastosować, " +
      "do innych może, jeśli ma ochotę”. Bez c) wychodzi, że można " +
      "spokojnie kupować u Płatnerza, mając nad głową nierozpatrzoną Kartę, " +
      "która każe.",
  },
];

/** One piece of a rule's paragraph: printed, or ours. */
export interface Segment {
  text: string;
  added: boolean;
  /** Which addendum put it there, so the text can point at its own argument. */
  addendum?: Addendum;
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
  const mine = ADDENDA.filter(
    (one) => !one.own && one.rule === rule && para.includes(one.after),
  );
  if (mine.length === 0) return [{ text: para, added: false }];

  let rest = para;
  const out: Segment[] = [];
  for (const one of mine) {
    const at = rest.indexOf(one.after) + one.after.length;
    out.push({ text: rest.slice(0, at), added: false });
    out.push({ text: one.text, added: true, addendum: one });
    rest = rest.slice(at);
  }
  if (rest) out.push({ text: rest, added: false });
  return out;
}

/** Additions that stand as their own paragraph after this one — see `own`. */
export function afterParagraph(rule: string | null, para: string): Addendum[] {
  return ADDENDA.filter((one) => one.own && one.rule === rule && para.includes(one.after));
}

/** The addenda that actually landed in this paragraph, for the note under it. */
export function addendaFor(rule: string | null, para: string): Addendum[] {
  return ADDENDA.filter((one) => one.rule === rule && para.includes(one.after));
}

/** A stable handle for one addendum, so its text can point at its own argument. */
export function addendumId(addendum: Addendum): string {
  return `uzupelnienie-${addendum.rule}-${ADDENDA.indexOf(addendum)}`;
}

/**
 * A rule as the Księga shows it: misprints read, addenda composed in.
 *
 * For search, which was matching the printed text alone — so „lub Miejsce”
 * found nothing, though it is on the page in front of you. A reader searching
 * for words they can see and being told the book does not contain them is the
 * app calling its own page a lie.
 *
 * Corrections too, for the same reason: somebody who reads „(5.3-4.)” in 16.6
 * and searches for it should land on 16.6.
 */
export function asShown(rule: string | null, paras: readonly string[]): string {
  return paras
    .map((para) =>
      [
        ...withAddenda(rule, asRead(para)).map((segment) => segment.text),
        ...afterParagraph(rule, para).map((one) => ` ${one.text}`),
      ].join(""),
    )
    .join(" ");
}
