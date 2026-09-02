"use client";

/**
 * The half of the Księga that is not cards.
 *
 * Same drawer, same act — look something up without leaving the turn. A second
 * drawer would want its own shortcut, its own pin and its own corner of the
 * screen, and would be fighting this one for the same half of it.
 *
 * Five shelves, and the first is the book itself. The other four exist because
 * the app asks players to know things the box never told them: which house rule
 * this table is playing, what it is doing on their behalf, and what its own
 * words mean.
 */

import { Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import rulesData from "@/data/rules.json";
import { ENDLESS_STOCK_CHANGE, VARIANT_CHANGES, type EqMode } from "@/lib/engine/slots";
import { fold } from "@/lib/engine/search";
import { Fold } from "./fold";
import { OpenRule, WithRules } from "./rule-ref";
import { asRead, misprintsIn } from "@/lib/view/misprints";
import { addendaFor, addendumId, asShown, withAddenda } from "@/lib/view/addenda";

interface Rule {
  id: string | null;
  /** A named section rather than a numbered one — the Most's field instructions. */
  title: string | null;
  paras: string[];
  examples: string[];
  /** What the transcriber flagged about the printed page — see `Note`. */
  notes: string[];
  /** The book's one table, 2.6's: rows of cells, the header row first. */
  table: string[][];
  /** How many paragraphs stood above it, so it goes back where it was. */
  tableAfter: number;
}
interface Chapter {
  key: string;
  number: string | null;
  title: string;
  rules: Rule[];
}

const CHAPTERS = rulesData as Chapter[];

export type RulesShelf = "instrukcja" | "wariant" | "aplikacja" | "slowniczek" | "skroty";

export const RULES_SHELVES: { key: RulesShelf; label: string }[] = [
  { key: "instrukcja", label: "Instrukcja" },
  { key: "wariant", label: "Wariant" },
  { key: "aplikacja", label: "Co robi aplikacja" },
  { key: "slowniczek", label: "Słowniczek" },
  { key: "skroty", label: "Skróty" },
];

export function RulesShelfView({
  shelf,
  focus,
  eqMode,
  endlessStock,
  query,
}: {
  shelf: RulesShelf;
  /** A rule to scroll to and mark, from a `(5.3)` somewhere else in the app. */
  focus: string | null;
  eqMode: EqMode;
  /** The table's answer to 21.2, which is a house rule like the variant is. */
  endlessStock: boolean;
  /** The Księga's own search box, which reads the book as well as the deck. */
  query: string;
}) {
  if (shelf === "wariant") return <Variant eqMode={eqMode} endlessStock={endlessStock} />;
  if (shelf === "aplikacja") return <WhatItDoes />;
  if (shelf === "slowniczek") return <Glossary />;
  if (shelf === "skroty") return <Keys />;
  return <Manual focus={focus} query={query} />;
}

/* --------------------------------------------------------------------------
 * The book.
 * ----------------------------------------------------------------------- */

function Manual({ focus, query }: { focus: string | null; query: string }) {
  // `fold`, the same one the shelves search with. It was `toLowerCase`, so
  // "zaklecia" found nothing here and "Zaklęcia" found everything — while one
  // switch away the cards answered to both.
  const needle = fold(query.trim());
  const chapters = useMemo(() => {
    if (!needle) return CHAPTERS;
    return CHAPTERS.map((chapter) => ({
      ...chapter,
      rules: chapter.rules.filter((rule) =>
        // What the page says, not only what the book printed — a reader
        // searching for words they can see has to find them. See `asShown`.
        fold(`${rule.id ?? ""} ${asShown(rule.id, [...rule.paras, ...rule.examples])}`).includes(
          needle,
        ),
      ),
    })).filter((chapter) => chapter.rules.length > 0);
  }, [needle]);

  /**
   * What the reader has said about a chapter, against what it would do anyway.
   *
   * A set of the open ones could not answer the case below: a chapter held open
   * *because* it holds the rule you followed a link to could not then be shut,
   * since adding it to the open set changed nothing and removing it changed
   * nothing either. So this records the choice — open or shut — and silence
   * means the default, which is shut while browsing and open while it is
   * holding what you asked for.
   *
   * Twenty-nine chapters unrolled is four hundred paragraphs and the thing you
   * came for is one of them, which is why the default is shut at all.
   */
  const [said, setSaid] = useState<Readonly<Record<string, boolean>>>({});
  const held = useRef<HTMLDivElement>(null);

  /**
   * The chapter a followed reference lives in, held open by being that.
   *
   * Derived rather than pushed into `open` when the reference arrives: a
   * chapter that has to be *opened* by an effect is a chapter that is shut on
   * the first render and open on the second, which is a frame of the wrong
   * answer and a cascade the compiler is right to complain about. It is open
   * because it contains what you asked for, for as long as that is true.
   */
  const holding = focus
    ? (CHAPTERS.find((chapter) => chapter.rules.some((rule) => rule.id === focus))?.key ?? null)
    : null;

  // And then put on screen. One frame later, because the rule is inside a
  // `<details>` that has only just been told to be open.
  useEffect(() => {
    if (!focus) return;
    const soon = setTimeout(() => {
      held.current
        ?.querySelector(`[data-rule="${focus}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(soon);
  }, [focus]);

  return (
    <div ref={held} className="flex flex-col">
      {chapters.map((chapter, at) => {
        // A search has already narrowed it, so what it finds is open: shutting
        // the answer to a question somebody just asked is the one thing this
        // must not do.
        const shown = needle ? true : (said[chapter.key] ?? chapter.key === holding);
        return (
          <Fold
            key={chapter.key}
            first={at === 0}
            title={chapter.number ? `${chapter.number}. ${chapter.title}` : chapter.title}
            tally={chapter.rules.some((rule) => rule.id) ? chapter.rules.length : undefined}
            open={shown}
            onToggle={
              needle
                ? undefined
                : () => setSaid((was) => ({ ...was, [chapter.key]: !shown }))
            }
          >
            <div className="flex flex-col gap-3">
              {chapter.rules.map((rule, index) => (
                <div
                  key={rule.id ?? index}
                  data-rule={rule.id ?? undefined}
                  className={`scroll-mt-4 rounded ${
                    rule.id && rule.id === focus ? "bg-ochre/10 ring-1 ring-ochre/40" : ""
                  } ${rule.id || rule.title ? "p-2" : ""}`}
                >
                  {/* A number or a name, in the same place and the same shape:
                      the Kamienny Most's instructions have no number — 14.3
                      says so — and printing them without their heading left
                      nine paragraphs about different Obszary running together. */}
                  {(rule.id || rule.title) && (
                    <p className="tnum mb-1 text-[11px] uppercase tracking-widest text-ochre/80">
                      {rule.id ?? rule.title}
                    </p>
                  )}
                  {rule.paras.map((para, n) => (
                    <Fragment key={n}>
                      <p className="mb-2 text-[13px] leading-relaxed text-ink/90">
                        <Prose raw={para} rule={rule.id} />
                      </p>
                      {/* Where it was printed. 2.6's first paragraph ends "w
                          następujący sposób:" and the table is what follows it,
                          so hanging it under the whole rule left the colon
                          introducing the sentence after it. */}
                      {rule.table.length > 0 && rule.tableAfter === n + 1 && (
                        <RuleTable rows={rule.table} />
                      )}
                    </Fragment>
                  ))}
                  {rule.examples.map((example, n) => (
                    // Set apart because the book sets them apart, and because
                    // they are the half of it people actually remember.
                    <p
                      key={`ex-${n}`}
                      className="mb-2 border-l-2 border-edge pl-3 text-[12px] leading-relaxed text-muted"
                    >
                      <span className="text-ochre/70">Przykład: </span>
                      <Prose raw={example} rule={rule.id} />
                    </p>
                  ))}
                  {/* What the book prints, where the Księga shows something
                      else. Under the rule rather than in a tooltip: a reader
                      holding the Instrukcja next to the screen is exactly who
                      needs to know the two differ, and why. */}
                  {[...rule.paras, ...rule.examples]
                    .flatMap((para) => misprintsIn(para))
                    .map((misprint) => (
                      <p
                        key={misprint.printed}
                        className="mt-2 text-[11px] leading-snug text-muted/70"
                      >
                        <span className="text-muted/50">Błąd druku: </span>
                        w Instrukcji wydrukowano {misprint.printed}. {misprint.because}
                      </p>
                    ))}
                  {/* Why a sentence that is not in the book is on the page.
                      Ochre like the sentence itself, so the claim and its
                      justification read as one voice — ours.

                      „Uzupełnienie" and not „dodatek": that word is taken. A
                      dodatek is Labirynt Magów or Krypta Upiorów — a box you
                      buy — and this is the opposite, a sentence the base game
                      should have had. „Uzupełnienie zasad" is the ordinary
                      Polish for filling in what a ruleset left out. */}
                  {[...rule.paras, ...rule.examples]
                    .flatMap((para) => addendaFor(rule.id, para))
                    .map((addendum) => (
                      <p
                        key={addendum.after}
                        id={addendumId(addendum)}
                        className="mt-2 text-[11px] leading-snug text-ochre/70"
                      >
                        <span className="text-ochre/50">Uzupełnienie: </span>
                        {addendum.because}
                      </p>
                    ))}
                  {rule.notes.map((note, n) => (
                    <p key={`note-${n}`} className="mt-2 text-[11px] leading-snug text-muted/70">
                      <span className="text-muted/50">Uwaga do transkrypcji: </span>
                      {note}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </Fold>
        );
      })}
      {chapters.length === 0 && (
        <p className="text-[13px] text-muted">Nic takiego nie ma w Instrukcji.</p>
      )}
    </div>
  );
}

/**
 * The one table the book prints, 2.6's Magia against the Zaklęcia it allows.
 *
 * It used to arrive as three paragraphs of pipes, separator row and all, which
 * is the transcript's Markdown showing through: "|---|---|---|" on a line of
 * its own, and the numbers under it reading as a list rather than as the answer
 * to "how many may I hold".
 *
 * Scrolls in its own box. Eight columns do not fit a drawer this wide, and a
 * table that widened the panel would push the rules either side of it off the
 * edge of it.
 */
function RuleTable({ rows }: { rows: string[][] }) {
  return (
    <div className="mb-2 overflow-x-auto">
      <table className="tnum border-collapse text-[12px]">
        <tbody>
          {rows.map((row, at) => (
            <tr key={at}>
              {row.map((cell, col) => (
                <td
                  key={col}
                  className={`whitespace-nowrap border border-edge/60 px-2 py-1 ${
                    col === 0 ? "text-muted" : "text-center text-ink"
                  } ${at === 0 ? "text-ochre/80" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A paragraph of the book, with its two kinds of markup honoured.
 *
 * The transcript is Markdown and keeps the printed emphasis — **PLANSZA**,
 * **KARTY ZDARZEŃ (165 sztuk)** — which is how the book introduces each thing
 * in the box. Rendered raw, those asterisks were on screen: the app was showing
 * its own file format to a player. So the bold is bold, and each half still
 * goes through `WithRules`, because a rule number can fall on either side of it.
 */
function Prose({ raw, rule = null }: { raw: string; rule?: string | null }) {
  /**
   * The Instrukcja as a reader uses it, which is not quite as it was printed.
   *
   * One citation in the book leads nowhere — 16.6's „(58.3-4.)" — and every
   * number in this drawer is a link, so leaving it would be a dead reference in
   * the one place a reader has come to follow references. `asRead` swaps it for
   * what the book meant; `misprintsIn` puts the swap under the rule, so nobody
   * has to take it on trust. The transcription itself keeps the printed form.
   */
  const text = asRead(raw);
  /**
   * What the book printed, and what we added to it — see `addenda.ts`.
   *
   * Ochre, because that is this app's colour for its own voice: every rule
   * number, every refusal it writes, every heading it invents. A reader has to
   * be able to see at a glance which words are the box's and which are ours,
   * and on a page that is otherwise a transcription, the only honest way to add
   * a sentence is to make it look added.
   */
  const segments = withAddenda(rule, text);
  return (
    <>
      {segments.map((segment, s) =>
        segment.added ? (
          <span key={`add-${s}`} className="italic text-ochre">
            <WithRules text={segment.text} />
            {/* What it is, and the way to why. The argument sits under the
                rule, past the paragraphs and the examples, which is too far to
                be an explanation of a word you are looking at. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                document
                  .getElementById(segment.addendum ? addendumId(segment.addendum) : "")
                  ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }}
              title="Uzupełnienie — zdanie, którego nie ma w Instrukcji. Kliknij, żeby przeczytać dlaczego."
              className="ml-1 cursor-pointer align-baseline text-[10px] not-italic underline decoration-dotted underline-offset-2 transition hover:text-ink"
            >
              (uzupełnienie)
            </button>
          </span>
        ) : (
          <Bold key={`said-${s}`} text={segment.text} />
        ),
      )}
    </>
  );
}

/** The `**bold**` the transcription uses, which survives the split above. */
function Bold({ text }: { text: string }) {
  const parts = text.split(/\*\*/);
  if (parts.length === 1) return <WithRules text={text} />;
  return (
    <>
      {parts.map((part, at) =>
        // Odd pieces are what sat between a pair of asterisks.
        at % 2 === 1 ? (
          <strong key={at} className="font-semibold text-ink">
            <WithRules text={part} />
          </strong>
        ) : (
          <WithRules key={at} text={part} />
        ),
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
 * The four the box does not contain.
 * ----------------------------------------------------------------------- */

function Variant({ eqMode, endlessStock }: { eqMode: EqMode; endlessStock: boolean }) {
  const refs = useContext(OpenRule) !== null;
  /**
   * The variant's changes, plus the stock rule where the table has taken it.
   *
   * Kept out of `VARIANT_CHANGES` because it is not the variant's: a klasyczny
   * table can have it too, and a slotowy one can be without it. Listed here
   * because a reader on this shelf is asking one question — what does this
   * table do that the book does not — and the answer does not care which
   * setting each part came from.
   */
  const changes = endlessStock ? [...VARIANT_CHANGES, ENDLESS_STOCK_CHANGE] : VARIANT_CHANGES;
  return (
    <div className="flex flex-col gap-4 text-[13px] leading-relaxed">
      <p className="text-muted">
        {eqMode === "slots" ? (
          <>
            Ten stół gra <span className="text-ochre">wariantem slotowym</span>. Nie ma go w
            pudełku — poniżej jest wszystko, czym różni się od Instrukcji.
          </>
        ) : (
          <>
            Ten stół gra <span className="text-ochre">klasycznie</span>, czyli dokładnie tak, jak
            napisano w Instrukcji. Poniżej to, co zmieniłby wariant slotowy — dla porównania.
          </>
        )}
      </p>
      {changes.map((change) => (
        <section key={change.title} className="rounded border border-edge bg-raised/40 p-3">
          <h4 className="mb-2 text-ink">{change.title}</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-[11px] uppercase tracking-widest text-muted">Instrukcja</dt>
            <dd className="text-muted">
              <WithRules text={change.book} />
            </dd>
            <dt className="text-[11px] uppercase tracking-widest text-ochre/80">Tutaj</dt>
            <dd className="text-ink/90">
              <WithRules text={change.here} />
            </dd>
          </dl>
          {/* Nothing but citations, so with them hidden there is nothing left
              but the word "Zasady:" and a full stop. The rest of the entry says
              what changed in prose and stands without this. */}
          {refs && (
            <p className="mt-2 text-[11px] text-muted/70">
              <WithRules text={`Zasady: ${change.rules.join(", ")}.`} />
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * What is done for you and what is still yours.
 *
 * The first question anybody has in front of a game that plays itself, and
 * nothing answered it. The line is not "what is automated" but "what are you
 * still deciding", because that is what a player needs to know to play.
 */
function WhatItDoes() {
  const done = [
    "Rzuca kostką i przesuwa Postać — nie da się wpisać własnego wyniku.",
    "Ciągnie Karty z potasowanego stosu i odkłada zużyte na spód (9.5).",
    "Liczy Miecz i Magię z Przedmiotów, Przyjaciół i Obszaru, osobno jako parametr i osobno do walki (1.5).",
    "Pilnuje limitów: czterech Przedmiotów (5.4), Zaklęć według Magii (2.6), jednej zmiany Natury na turę (7.3).",
    "Odmawia tego, czego zasady zabraniają, i mówi którą zasadą.",
    "Prowadzi dziennik — każdy rzut, każda Karta, każda zmiana.",
  ];
  const yours = [
    "Dokąd pójść, gdy rzut daje wybór.",
    "Czy stanąć do walki, czy uciekać (19.2).",
    "Które Zaklęcie rzucić i kiedy — i czy w ogóle.",
    "Co kupić, co sprzedać, co odrzucić.",
    "Wszystko, co Karta zostawia „wedle własnego wyboru”.",
  ];
  return (
    <div className="flex flex-col gap-5 text-[13px] leading-relaxed">
      <Listing title="Aplikacja robi to za ciebie" items={done} tone="text-muted" />
      <Listing title="To zostaje twoje" items={yours} tone="text-ochre/80" />
      <p className="text-[12px] text-muted/80">
        W symulacji nic nie wpisuje się z ręki: gdyby dało się nadpisać wynik, nie grałoby się w grę,
        tylko redagowało jej zapis.
      </p>
    </div>
  );
}

function Listing({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <section>
      <h4 className={`mb-2 text-[11px] uppercase tracking-widest ${tone}`}>{title}</h4>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-ink/90">
            <span className="text-muted/50">·</span>
            <WithRules text={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The words the interface uses, which are the book's and are not obvious.
 *
 * Two of these are the difference between a right answer and a wrong one, and
 * the app leans on both on every screen: what a parameter is against what a
 * fight is (1.5), and what is a character's own against what is lent to it
 * (1.2, 2.2).
 */
function Glossary() {
  const terms: { word: string; said: string }[] = [
    {
      word: "Obszar",
      said: "Jedno pole planszy. Ma nazwę i instrukcję, którą wykonuje Postać, która na nim stanie.",
    },
    {
      word: "Krąg",
      said: "Jedna z trzech Krain: Dolny (wokół środka), Środkowy, Górny (skraj planszy). Ruch odbywa się w obrębie jednego Kręgu.",
    },
    {
      word: "parametr / w walce",
      said: "Miecz Postaci to jej parametr — bazowe punkty plus to, co Przedmioty i Przyjaciele dodają zawsze. O to pyta Karta, to odejmuje Pułapka i to sprawdza przeprawa; na pasku parametr jest pierwszy. W walce bywa inaczej: każda broń w pudełku działa wyłącznie podczas walki, a Rycerz walczy zamiast ciebie swoimi punktami, więc ta liczba potrafi być i większa, i mniejsza (1.5). Oznacza ją ⚔.",
    },
    {
      word: "bazowe punkty",
      said: "To, co Postać ma sama z siebie — żetony przy jej Karcie, i nic poza nimi. Nigdy nie spadają poniżej tego, z czym zaczynała, a punkty z Przedmiotów i Przyjaciół nie są bazowe: dolicza się je dopiero przy liczeniu (1.2, 2.2). Na pasku to liczba w nawiasie.",
    },
    {
      word: "Natura",
      said: "Dobra, Zła albo Chaotyczna. Wypisana na Karcie Postaci; gdy się zmieni, obok Karty kładzie się Kartę Zmiany Natury (7.2).",
    },
    {
      word: "Zdolność",
      said: "Ponumerowane zdanie z Charakterystyki na Karcie Postaci. Stoi ponad ogólną zasadą (8.2).",
    },
    {
      word: "Trofeum",
      said: "Karta pokonanego Wroga. Nie jest Przedmiotem i nic nie dodaje — wymienia się ją na punkty Miecza (1.4).",
    },
  ];
  return (
    <dl className="flex flex-col gap-3 text-[13px] leading-relaxed">
      {terms.map((term) => (
        <div key={term.word}>
          <dt className="text-ochre/90">{term.word}</dt>
          <dd className="text-ink/85">
            <WithRules text={term.said} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Keys() {
  const keys: { key: string; said: string }[] = [
    { key: "K", said: "Księga Tolimana — ta szuflada." },
    { key: "S", said: "Stosy — co zostało w taliach." },
    { key: "G", said: "Gracze — kto siedzi przy stole." },
    { key: "Esc", said: "Zamyka szufladę; konsolę zwija do paska. Przypięte okno nie reaguje." },
    { key: "📌", said: "Przypina okno: zostaje otwarte, dopóki go nie zamkniesz." },
  ];
  return (
    <div className="flex flex-col gap-4 text-[13px] leading-relaxed">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {keys.map((one) => (
          <div key={one.key} className="contents">
            <dt className="rounded border border-edge bg-raised px-2 py-0.5 text-center text-[11px] text-ochre">
              {one.key}
            </dt>
            <dd className="text-ink/85">{one.said}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-muted/80">
        W trybie testowym konsola przyjmuje polecenia; wpisz tam <code>help</code>, żeby zobaczyć
        pełną listę.
      </p>
    </div>
  );
}

/**
 * The rules a search turns up, for a caller that is showing cards as well.
 *
 * The Księga is one box with two halves, and a reader typing a word does not
 * know which half holds the answer — that is the whole reason they are typing.
 * So the switch above the tabs decides what you *browse*, and a search ignores
 * it and reads both.
 *
 * Capped, because a common word matches a third of the book and a shelf of
 * cards would be four screens below it. The cap is `log`ged to the reader
 * rather than silent: a list that quietly stops is a list you think you have
 * read.
 */
export function rulesMatching(query: string, limit = 8): { found: FoundRule[]; total: number } {
  const needle = fold(query.trim());
  if (!needle) return { found: [], total: 0 };
  const hits: FoundRule[] = [];
  for (const chapter of CHAPTERS) {
    for (const rule of chapter.rules) {
      // Numbered rules only. The front matter — what is in the box, how to set
      // up — is worth reading and is one tab away, but it has no number, so a
      // hit on it would be a result that cannot be opened. Every hit here goes
      // somewhere.
      if (rule.id === null) continue;
      // Without the emphasis marks: the transcript is Markdown and a search
      // result is not the place to show it.
      const text = asShown(rule.id, [...rule.paras, ...rule.examples]).replace(/\*\*/g, "");
      // A number is a query. Somebody who types "5.3" wants 5.3, and now that
      // the numbers are links it is the likeliest thing anybody types.
      const byNumber = fold(rule.id).startsWith(needle);
      if (byNumber || fold(text).includes(needle)) {
        hits.push({ id: rule.id, chapter: chapter.title, text, byNumber });
      }
    }
  }
  // Numbers first, then the order of the book.
  hits.sort((a, b) => Number(b.byNumber) - Number(a.byNumber));
  return { found: hits.slice(0, limit), total: hits.length };
}

export interface FoundRule {
  id: string | null;
  chapter: string;
  text: string;
  byNumber: boolean;
}

/** One rule as a search result — the number, and enough of it to recognise. */
export function RuleHit({ hit, onOpen }: { hit: FoundRule; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded border border-edge bg-raised/40 p-2 text-left transition hover:border-ochre/60"
    >
      <span className="tnum text-[11px] uppercase tracking-widest text-ochre/80">
        {hit.id ?? hit.chapter}
      </span>
      <span className="mt-0.5 block truncate text-[12px] text-ink/85">{hit.text}</span>
    </button>
  );
}
