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

import { useEffect, useMemo, useRef, useState } from "react";
import rulesData from "@/data/rules.json";
import { VARIANT_CHANGES, type EqMode } from "@/lib/engine/slots";
import { Fold } from "./fold";
import { WithRules } from "./rule-ref";

interface Rule {
  id: string | null;
  paras: string[];
  examples: string[];
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
  query,
}: {
  shelf: RulesShelf;
  /** A rule to scroll to and mark, from a `(5.3)` somewhere else in the app. */
  focus: string | null;
  eqMode: EqMode;
  /** The Księga's own search box, which reads the book as well as the deck. */
  query: string;
}) {
  if (shelf === "wariant") return <Variant eqMode={eqMode} />;
  if (shelf === "aplikacja") return <WhatItDoes />;
  if (shelf === "slowniczek") return <Glossary />;
  if (shelf === "skroty") return <Keys />;
  return <Manual focus={focus} query={query} />;
}

/* --------------------------------------------------------------------------
 * The book.
 * ----------------------------------------------------------------------- */

function Manual({ focus, query }: { focus: string | null; query: string }) {
  const needle = query.trim().toLowerCase();
  const chapters = useMemo(() => {
    if (!needle) return CHAPTERS;
    return CHAPTERS.map((chapter) => ({
      ...chapter,
      rules: chapter.rules.filter((rule) =>
        [rule.id ?? "", ...rule.paras, ...rule.examples]
          .join(" ")
          .toLowerCase()
          .includes(needle),
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
                  } ${rule.id ? "p-2" : ""}`}
                >
                  {rule.id && (
                    <p className="tnum mb-1 text-[11px] uppercase tracking-widest text-ochre/80">
                      {rule.id}
                    </p>
                  )}
                  {rule.paras.map((para, n) => (
                    <p key={n} className="mb-2 text-[13px] leading-relaxed text-ink/90">
                      <WithRules text={para} />
                    </p>
                  ))}
                  {rule.examples.map((example, n) => (
                    // Set apart because the book sets them apart, and because
                    // they are the half of it people actually remember.
                    <p
                      key={`ex-${n}`}
                      className="mb-2 border-l-2 border-edge pl-3 text-[12px] leading-relaxed text-muted"
                    >
                      <span className="text-ochre/70">Przykład: </span>
                      <WithRules text={example} />
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

/* --------------------------------------------------------------------------
 * The four the box does not contain.
 * ----------------------------------------------------------------------- */

function Variant({ eqMode }: { eqMode: EqMode }) {
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
      {VARIANT_CHANGES.map((change) => (
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
          <p className="mt-2 text-[11px] text-muted/70">
            <WithRules text={`Zasady: ${change.rules.join(", ")}.`} />
          </p>
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
      said: "Miecz Postaci to jej parametr — to, o co pyta Karta i co odejmuje Pułapka. W walce liczy się czasem więcej, bo niektóre Przedmioty działają wyłącznie podczas walki (1.5).",
    },
    {
      word: "własne punkty",
      said: "To, co Postać ma sama z siebie. Nigdy nie spadają poniżej tego, z czym zaczynała, a punkty z Przedmiotów i Przyjaciół nie są własne — dolicza się je dopiero przy liczeniu (1.2, 2.2).",
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
