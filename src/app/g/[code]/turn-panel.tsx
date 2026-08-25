"use client";

import { useState } from "react";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { DIRECTION_LABEL, type Fight, type TurnPhase } from "@/lib/engine/turn";
import { suggestActions } from "@/lib/engine/cardEffects";
import {
  describeDisposition,
  scriptFor,
  type CardScript,
  type Effect,
} from "@/lib/engine/cardScript";
import { NOT_HANDLED, coverageOf, manualNote } from "@/lib/engine/coverage";
import { BRIDGE_ORDEAL } from "@/lib/engine/bridge";
import { bonusOf, combatValueOf } from "@/lib/engine/cards";
import { kindForCard } from "@/lib/engine/holdings";
import { crossingFrom } from "@/lib/engine/rings";
import { FIELDS, isFerry } from "@/lib/engine/board";
import { RollTable } from "./roll-table";
import { parseRollTable } from "@/lib/engine/rollTable";

const EVENTS = events as EventCard[];

/**
 * Card lookup for the companion flow. The Roman numeral printed on a card is
 * its resolution *class*, not an identifier, so there is no number to type —
 * the player finds the card they drew by name instead. Diacritics are folded on
 * both sides so "zaraza" finds "ZARAZA" without a Polish keyboard.
 */
/** True when a die table accounts for nearly all of a field's printed text. */
function isTableOnly(text: string): boolean {
  const table = parseRollTable(text);
  if (!table) return false;
  const covered = new Set(Object.values(table.outcomes)).size
    ? Object.values(table.outcomes).join(" ").length
    : 0;
  return covered >= text.length * 0.6;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
}

/**
 * How well a card name matches what was typed. Lower sorts first.
 *
 * Substring matching alone ranks badly in Polish, where "czar-" opens a whole
 * family of words: typing "zar" put SABAT CZAROWNIC and CZARODZIEJ above
 * ZARAZA, because "czarownic" and "czarodziej" both contain "zar" mid-word. A
 * player types the opening letters of the card in their hand and expects it
 * first, so a name that starts with the query beats one where a *word* starts
 * with it, which beats a match buried inside a word.
 */
function matchRank(name: string, needle: string): number {
  const folded = fold(name);
  if (folded.startsWith(needle)) return 0;
  if (folded.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
  return folded.includes(needle) ? 2 : 3;
}

function searchCards(query: string): EventCard[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const seen = new Set<string>();
  return EVENTS.filter((card) => {
    if (matchRank(card.name, needle) === 3) return false;
    // The deck holds real duplicates; the player only needs to find the card
    // once, so identical names collapse to one row.
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  })
    .sort(
      (a, b) =>
        matchRank(a.name, needle) - matchRank(b.name, needle) ||
        a.name.localeCompare(b.name, "pl"),
    )
    .slice(0, 8);
}

export { matchRank };

interface Props {
  phase: TurnPhase;
  isMine: boolean;
  playerName: string;
  fieldName: string;
  /** The instruction printed on the board for the field, if it has been transcribed. */
  fieldText: string | null;
  /** Named when a held card lets this character skip the field's die roll. */
  rollSkippedBy?: string | null;
  /** The field the active character is standing on, for the ring crossing. */
  fieldId: string | null;
  /** True when this is the shared table screen driving somebody else's turn. */
  actingForOther?: boolean;
  dieSource: string;
  /** "simulation" means the app owns the deck and deals cards itself. */
  mode: string;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => void;
  /** Applies a card's suggested bookkeeping to the active player's own seat. */
  onSuggestion: (stat: string, delta: number, reason: string) => void;
  /** Takes a drawn card into the active player's keeping. */
  onTake: (cardId: string) => void;
}

export function TurnPanel({
  phase,
  isMine,
  playerName,
  fieldName,
  fieldText,
  fieldId,
  rollSkippedBy,
  actingForOther = false,
  dieSource,
  mode,
  busy,
  onAction,
  onSuggestion,
  onTake,
}: Props) {
  return (
    <section className="rounded-lg border border-ochre/40 bg-panel p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ochre">
          Tura: {playerName}
        </h2>
        <span className="text-xs text-muted">{fieldName}</span>
      </header>

      {/* Shown to everyone, not only the active player: at a table the others
          read the field aloud and argue about it, and the board itself is
          usually under somebody's elbow. */}
      {fieldText && (phase.phase === "pole" || phase.phase === "walka") && (
        <div className="mb-4">
          {/* A field like Karczma is nothing but its die table, so printing the
              prose above the parsed version says everything twice. Where the
              table does not account for most of the text — Gród, Osada — the
              prose carries rules the table does not, and is kept. */}
          {!isTableOnly(fieldText) && (
            <p className="whitespace-pre-line rounded border-l-2 border-ochre/40 bg-night/60 px-3 py-2 text-xs leading-relaxed text-muted">
              {fieldText}
            </p>
          )}
          {/* A Przyjaciel who says you walk past this field's roll means the
              roll does not happen — not that it happens and is ignored, which
              some of these tables would make a meaningful difference. The
              table stays one tap away, because the app is always correctable. */}
          {rollSkippedBy ? (
            <RollSkipped by={rollSkippedBy} text={fieldText} busy={busy} onSuggestion={onSuggestion} />
          ) : (
            <RollTable text={fieldText} busy={busy} onSuggestion={isMine ? onSuggestion : undefined} />
          )}
        </div>
      )}

      {actingForOther && (
        <p className="mb-3 text-xs text-ochre/80">
          To urządzenie prowadzi turę gracza {playerName}.
        </p>
      )}

      {/* Only four fields on the whole board allow it (11.1, 11.5), and each
          demands something first — Magia for the Trzęsawiska, beating the
          Rycerz Wiecznych Śniegów for the Lodowy Las — which the board text
          above spells out. Both outcomes are offered because the app cannot
          adjudicate a fight it is not running. */}
      {/* 11.10 puts the attempt in the move itself — a character standing on
          Wymarłe Miasto or Ruiny Twierdzy is expressly the one case that may
          NOT try, so there is deliberately nothing offered here. */}

      {isMine &&
        fieldId &&
        crossingFrom(fieldId) &&
        // 11.4 makes retrying the point of the next turn — "czy będzie ponownie
        // próbowała przekroczyć granicę Kręgów" — so this is offered before the
        // roll as well as on arrival. Drawing it only on arrival meant a failed
        // crossing could never be attempted again.
        (phase.phase === "pole" || phase.phase === "rzut") && (
        <Crossing
          crossing={crossingFrom(fieldId)!}
          busy={busy}
          onAction={onAction}
        />
      )}

      {/* The Kamienny Most's own fields. Offered on arrival and again on the
          next turn's roll, because most of them are things you have to sit
          through more than once — the Demon does not move and neither do
          you. */}
      {isMine &&
        fieldId &&
        BRIDGE_ORDEAL.has(fieldId) &&
        (phase.phase === "pole" || phase.phase === "rzut") && (
          <BridgeOrdeal fieldId={fieldId} busy={busy} onAction={onAction} />
        )}

      {!isMine ? (
        <p className="text-sm text-muted">Czekamy na ruch gracza {playerName}.</p>
      ) : (
        <PhaseControls
          phase={phase}
          dieSource={dieSource}
          mode={mode}
          busy={busy}
          onAction={onAction}
          onSuggestion={onSuggestion}
          onTake={onTake}
        />
      )}
    </section>
  );
}

/**
 * Facing the guardian at a bridge entrance (11.9-11.11).
 *
 * Three outcomes rather than two, because 11.11 gives a draw its own: it costs
 * no point but still bars next turn's attempt, exactly as a loss does. Offering
 * only "won" and "lost" quietly turned every draw into a loss and took a point
 * the rules leave alone.
 */
function BridgeControls({
  bridge,
  busy,
  onAction,
}: {
  bridge: { from: string; guardian: string; entersAt: string; stat: "miecz" | "magia" };
  busy: boolean;
  onAction: Props["onAction"];
}) {
  const stat = bridge.stat === "magia" ? "Magii" : "Miecza";
  return (
    <div>
      <p className="mb-1 text-sm text-ink">
        Zanim wejdziesz na Most, musisz pokonać:{" "}
        <span className="text-vermilion">{bridge.guardian}</span>.
      </p>
      <p className="mb-3 text-[11px] text-muted">
        Rzuć kostką, by poznać jego siłę {stat}: 1&nbsp;→&nbsp;5, 2&nbsp;→&nbsp;6,
        3&nbsp;→&nbsp;7, 4&nbsp;→&nbsp;8, 5&nbsp;→&nbsp;9, 6&nbsp;→&nbsp;10. Potem
        zwykła walka. Przegrana to 1 punkt {stat}; remis nic nie kosztuje. Po obu
        nie spróbujesz ponownie w następnej turze (11.11).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => onAction({ action: "guardian" })}
          className="rounded border border-ochre/60 px-3 py-1 text-xs text-ochre transition hover:bg-edge disabled:opacity-50"
        >
          Stocz walkę
        </button>
        <button
          disabled={busy}
          onClick={() => onAction({ action: "bridge", outcome: "wygrana" })}
          className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
        >
          Pokonany — wchodzę na Most
        </button>
        <button
          disabled={busy}
          onClick={() => onAction({ action: "bridge", outcome: "remis" })}
          className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
        >
          Remis
        </button>
        <button
          disabled={busy}
          onClick={() => onAction({ action: "bridge", outcome: "porazka" })}
          className={`rounded border border-vermilion/50 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50`}
        >
          Przegrana (−1 {stat})
        </button>
      </div>
    </div>
  );
}

/**
 * Stepping between two Kręgi.
 *
 * Three different panels, because these are three different situations and the
 * old single pair of buttons made them look like one. Walking back down is
 * free (11.3, 11.7) and needs no outcome at all. The Trzęsawiska are a
 * threshold the app can settle from two dice against the character's Magia, so
 * it does. The Lodowy Las is a fight with a creature that has a printed Miecz,
 * and 11.8 lets a fight be drawn — costing no Życie but still stopping the
 * journey — which the two-button version silently turned into a loss.
 */
/**
 * One of the six things on the bridge that has to be got past (14.5-14.6).
 *
 * Every one of them is printed on the board where the player is standing, so
 * the text is quoted rather than paraphrased and the button only does the
 * arithmetic. The app owns the dice here because there is nothing to
 * adjudicate: three dice less a number you already know, or a table.
 */
function BridgeOrdeal({
  fieldId,
  busy,
  onAction,
}: {
  fieldId: string;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => void;
}) {
  const what: Record<string, { title: string; text: string; button: string }> = {
    pulapka: {
      title: "Pułapka",
      text: "Rzuć 3 kostkami i odejmij swoje punkty Miecza: 0 — zostajesz; 1 — wejście na Most; 2-3 — Ruiny Twierdzy; 4-5 — Twierdza Strzegąca Dróg; 6 i więcej — Osada. Strącony rzucasz kostką za każdy Przedmiot i każdego Przyjaciela: 1 lub 2 zostaje przy tobie.",
      button: "Rzuć trzema kostkami",
    },
    "magiczna-pulapka": {
      title: "Magiczna Pułapka",
      text: "Rzuć 3 kostkami i odejmij swoje punkty Magii: 0 — zostajesz; 2-3 — Wymarłe Miasto; 4-5 — Świątynia Nemed; 6 i więcej — Karczma. Strącony rzucasz kostką za każdy Przedmiot i każdego Przyjaciela: 1 lub 2 zostaje przy tobie.",
      button: "Rzuć trzema kostkami",
    },
    "gra-ze-smiercia": {
      title: "Gra ze Śmiercią",
      text: "Dwie kostki za siebie i dwie za Śmierć. Wyżej — idziesz dalej. Równo — grasz dalej w następnej turze. Niżej — tracisz 1 Życie i grasz ponownie.",
      button: "Zagraj ze Śmiercią",
    },
    cerber: {
      title: "Cerber",
      text: "Rzuć kostką: 1-2 — tracisz 1 Życie; 3-4 — 2 Życia; 5-6 — 3 Życia.",
      button: "Rzuć kostką",
    },
    "demon-zaglady": {
      title: "Demon Zagłady",
      text: "Rzuć 2 kostkami — suma to Magia Demona. Walczysz magicznie i nie przejdziesz dalej, dopóki go nie zabijesz. Przegrana kosztuje 1 Życie i walczysz znowu w następnej turze.",
      button: "Rzuć za Demona",
    },
    monstrum: {
      title: "Monstrum",
      text: "Rzuć 2 kostkami — suma to Miecz Monstrum. Nie przejdziesz dalej, dopóki go nie zabijesz. Przegrana kosztuje 1 Życie i walczysz znowu w następnej turze.",
      button: "Rzuć za Monstrum",
    },
  };
  const it = what[fieldId];
  if (!it) return null;

  return (
    <section className="mb-3 rounded border border-vermilion/40 bg-vermilion/5 p-3">
      <h3 className="mb-1 font-[family-name:var(--font-display)] text-sm text-vermilion">
        {it.title}
      </h3>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">{it.text}</p>
      <button
        disabled={busy}
        onClick={() => onAction({ action: "most-pole" })}
        className="rounded border border-vermilion/60 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
      >
        {it.button}
      </button>
    </section>
  );
}

function Crossing({
  crossing,
  busy,
  onAction,
}: {
  crossing: NonNullable<ReturnType<typeof crossingFrom>>;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  const to = FIELDS.get(crossing.to)?.name ?? crossing.to;
  const test = crossing.test;

  return (
    <div className="mb-4 rounded border border-ochre/40 bg-night/60 p-3">
      <p className="mb-1 text-xs text-muted">
        Stąd można przejść do: <span className="text-ink">{to}</span>
        {!test && (
          <>
            {" "}
            — <span className="text-verdigris">bez rzutu kostką</span> (11.3, 11.7).
          </>
        )}
      </p>
      {/* Uroczysko and Przełęcz Wichrów both print the same exemption: the card
          this field would otherwise make you draw is not drawn if you are
          crossing. Said here rather than enforced, because the player may
          legitimately decide to stay and draw instead. */}
      {test && (
        <p className="mb-2 text-[11px] text-muted/80">
          Przeprawiając się, nie ciągniesz karty z tego Obszaru.
        </p>
      )}

      {!test && (
        <button
          disabled={busy}
          onClick={() => onAction({ action: "cross", outcome: "udana" })}
          className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
        >
          Przejdź do: {to}
        </button>
      )}

      {test?.kind === "magia" && (
        <>
          <p className="mb-2 text-[11px] text-muted/80">
            Dwie kostki przeciw twojej Magii: wynik mniejszy lub równy — przeprawa
            udana. Większy to porażka i 1 Życie.
          </p>
          <button
            disabled={busy}
            onClick={() => onAction({ action: "cross" })}
            className="rounded border border-ochre/50 px-3 py-1 text-xs text-ink transition hover:bg-edge disabled:opacity-50"
          >
            Rzuć dwoma kostkami
          </button>
        </>
      )}

      {test?.kind === "walka" && (
        <>
          <p className="mb-2 text-[11px] text-muted/80">
            Drogę zagradza <span className="text-vermilion">{test.guardian}</span>{" "}
            (Miecz {test.miecz}). Remis nie kosztuje Życia, ale też zatrzymuje (11.8).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => onAction({ action: "guardian" })}
              className="rounded border border-ochre/60 px-3 py-1 text-xs text-ochre transition hover:bg-edge disabled:opacity-50"
            >
              Stocz walkę
            </button>
            <button
              disabled={busy}
              onClick={() => onAction({ action: "cross", outcome: "udana" })}
              className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
            >
              Pokonany — przechodzę
            </button>
            <button
              disabled={busy}
              onClick={() => onAction({ action: "cross", outcome: "remis" })}
              className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
            >
              Remis
            </button>
            <button
              disabled={busy}
              onClick={() => onAction({ action: "cross", outcome: "nieudana" })}
              className="rounded border border-vermilion/50 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
            >
              Przegrana (−1 Życie)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A field's die roll, waived.
 *
 * Says which card is doing the waiving, because that is the part a player wants
 * to check — the whole value of the Przewodnik is knowing, at the Krypta
 * Upiorów, that you have him.
 */
function RollSkipped({
  by,
  text,
  busy,
  onSuggestion,
}: {
  by: string;
  text: string;
  busy: boolean;
  onSuggestion: Props["onSuggestion"];
}) {
  const [anyway, setAnyway] = useState(false);
  return (
    <div className="mt-2 rounded border border-verdigris/40 bg-night/60 p-3">
      <p className="text-xs text-verdigris">
        Przechodzisz bezpiecznie — <span className="text-ink">{by}</span> zwalnia cię
        z rzutu na tym Obszarze.
      </p>
      <button
        onClick={() => setAnyway((on) => !on)}
        className="mt-1 text-[10px] text-muted underline hover:text-ink"
      >
        {anyway ? "ukryj tabelę" : "rzuć mimo to"}
      </button>
      {anyway && <RollTable text={text} busy={busy} onSuggestion={onSuggestion} />}
    </div>
  );
}

function PhaseControls({
  phase,
  dieSource,
  mode,
  busy,
  onAction,
  onSuggestion,
  onTake,
}: Pick<Props, "phase" | "dieSource" | "mode" | "busy" | "onAction" | "onSuggestion" | "onTake">) {
  switch (phase.phase) {
    case "rzut":
      return <RollControls dieSource={dieSource} busy={busy} onAction={onAction} />;
    case "ruch":
      return (
        <div>
          <p className="mb-3 text-sm text-muted">
            Wyrzucono <span className="tnum text-2xl font-medium text-ink">{phase.roll}</span> —
            wybierz kierunek.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {phase.options.map((option) => (
              <button
                key={`${option.direction}-${option.fieldId}-${option.bridge ? "most" : "ring"}`}
                disabled={busy}
                onClick={() =>
                  onAction({
                    action: "move",
                    fieldId: option.fieldId,
                    ...(option.bridge ? { viaBridge: true } : {}),
                  })
                }
                className={`rounded border bg-raised px-4 py-3 text-left transition disabled:opacity-50 ${
                  option.bridge
                    ? "border-vermilion/50 hover:border-vermilion"
                    : "border-edge hover:border-ochre"
                }`}
              >
                <span className="block font-medium text-ink">
                  {option.bridge ? "Kamienny Most" : option.fieldName}
                </span>
                <span className="block text-[11px] text-muted">
                  {option.bridge
                    ? `skręć z ${option.fieldName} — czeka ${option.bridge.guardian}`
                    : DIRECTION_LABEL[option.direction]}
                </span>
                {option.through.length > 0 && (
                  <span className="mt-1 block text-[11px] text-muted/70">
                    przez: {option.through.join(" → ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      );
    case "most":
      return <BridgeControls bridge={phase.bridge} busy={busy} onAction={onAction} />;
    case "pole":
      return (
        <FieldControls
          phase={phase}
          mode={mode}
          busy={busy}
          onAction={onAction}
          onSuggestion={onSuggestion}
          onTake={onTake}
        />
      );
    case "walka":
      return <FightControls fight={phase.fight} busy={busy} onAction={onAction} />;
    case "koniec":
      return (
        <button
          disabled={busy}
          onClick={() => onAction({ action: "end" })}
          className="rounded border border-edge bg-raised px-4 py-2 text-sm text-ink hover:border-ochre"
        >
          Zakończ turę
        </button>
      );
  }
}

function RollControls({
  dieSource,
  busy,
  onAction,
}: Pick<Props, "dieSource" | "busy" | "onAction">) {
  // Both ways of getting a number are always offered regardless of the table's
  // configured preference: people reach for the physical die mid-game, and a
  // referee that refuses to accept it would be worse than no referee.
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={busy}
        onClick={() => onAction({ action: "roll" })}
        className="rounded border border-edge bg-raised px-5 py-3 font-[family-name:var(--font-display)] text-ink transition hover:border-ochre disabled:opacity-50"
      >
        Rzuć kostką
      </button>
      <span className="text-xs text-muted">
        albo wpisz wynik {dieSource === "physical" ? "(stół gra własną kostką)" : ""}
      </span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <button
            key={value}
            disabled={busy}
            onClick={() => onAction({ action: "roll", value })}
            className="tnum h-10 w-10 rounded border border-edge bg-night text-ink transition hover:border-ochre disabled:opacity-50"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldControls({
  phase,
  mode,
  busy,
  onAction,
  onSuggestion,
  onTake,
}: {
  phase: Extract<TurnPhase, { phase: "pole" }>;
  mode: string;
  busy: boolean;
  onAction: Props["onAction"];
  onSuggestion: Props["onSuggestion"];
  onTake: Props["onTake"];
}) {
  const [query, setQuery] = useState("");
  const results = searchCards(query);
  const outstanding = phase.draw - phase.drawn.length;

  return (
    <div className="flex flex-col gap-4">
      {isFerry(phase.fieldId) && (
        <div className="rounded border border-ochre/40 bg-night/60 p-3">
          <p className="mb-2 text-xs text-muted">
            Przewoźnik żąda <span className="text-zloto">1 Sz. Z.</span> za przeprawę.
            Bez zapłaty wracasz tam, skąd zacząłeś ruch.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => onAction({ action: "ferry", pay: true })}
              className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
            >
              Płacę 1 Sz. Z.
            </button>
            <button
              disabled={busy}
              onClick={() => onAction({ action: "ferry", pay: false })}
              className="rounded border border-vermilion/50 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
            >
              Nie płacę — wracam
            </button>
          </div>
        </div>
      )}

      {phase.draw > 0 && (
        <p className="text-sm text-muted">
          To pole każe wyciągnąć{" "}
          <span className="text-ink">
            {phase.draw} {phase.draw === 1 ? "kartę" : "karty"}
          </span>
          {outstanding > 0 ? ` — zostało ${outstanding}.` : " — komplet."}
        </p>
      )}

      {outstanding > 0 && mode === "simulation" && (
        // The app owns the deck here, so there is nothing to identify — the
        // only question is whether to deal the next card.
        <button
          disabled={busy}
          onClick={() => onAction({ action: "draw" })}
          className="self-start rounded border border-ochre/50 bg-raised px-4 py-2 text-sm text-ink transition hover:bg-edge disabled:opacity-50"
        >
          Wyciągnij kartę
        </button>
      )}

      {outstanding > 0 && mode !== "simulation" && (
        <div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Wpisz nazwę wyciągniętej karty…"
            className="w-full rounded border border-edge bg-night px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-ochre focus:outline-none"
          />
          {results.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {results.map((card) => (
                <li key={card.id}>
                  <button
                    disabled={busy}
                    onClick={() => {
                      onAction({ action: "draw", cardId: card.id, cardClass: card.cardClass });
                      setQuery("");
                    }}
                    className="w-full rounded border border-edge bg-raised px-3 py-2 text-left text-sm transition hover:border-ochre disabled:opacity-50"
                  >
                    <span className="text-ink">{card.name}</span>
                    <span className="ml-2 text-[11px] uppercase text-muted">
                      {CARD_CLASS_LABEL[card.cardClass]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase.drawn.length > 0 && (
        <DrawnCards
          drawn={phase.drawn}
          busy={busy}
          onAction={onAction}
          onSuggestion={onSuggestion}
          onTake={onTake}
        />
      )}

      <button
        disabled={busy}
        onClick={() => onAction({ action: "end" })}
        className="self-start rounded border border-edge bg-raised px-4 py-2 text-sm text-ink transition hover:border-ochre disabled:opacity-50"
      >
        Zakończ turę
      </button>
    </div>
  );
}

/**
 * A fight, one die at a time.
 *
 * Both rolls are shown as they land rather than the result appearing at once,
 * because at a table the tension is in watching the second die — and because
 * every other player needs to be able to check the arithmetic.
 */
function FightControls({
  fight,
  busy,
  onAction,
}: {
  fight: Fight;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  const label = fight.kind === "magiczna" ? "Magia" : "Miecz";

  // A bridge guardian has no strength until a die is thrown for it — the board
  // prints "1 - 5; 2 - 6; ... 6 - 10" at both entrances — so nothing else about
  // the fight can be asked for until that is settled.
  if (fight.strengthRoll === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Przeciwnik: <span className="text-vermilion">{fight.cardName}</span>
        </p>
        <p className="text-xs text-muted/80">
          Rzuć kostką, by poznać jego {label}: 1&nbsp;→&nbsp;5, 2&nbsp;→&nbsp;6,
          3&nbsp;→&nbsp;7, 4&nbsp;→&nbsp;8, 5&nbsp;→&nbsp;9, 6&nbsp;→&nbsp;10.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => onAction({ action: "guardian-strength" })}
            className="rounded border border-ochre/60 bg-raised px-4 py-2 font-[family-name:var(--font-display)] text-sm tracking-wide text-ochre transition hover:bg-edge disabled:opacity-50"
          >
            Rzuć kostką
          </button>
          <span className="text-xs text-muted">albo wpisz wynik</span>
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <button
              key={value}
              disabled={busy}
              onClick={() => onAction({ action: "guardian-strength", value })}
              className="tnum rounded border border-edge px-3 py-2 text-sm text-ink transition hover:border-ochre disabled:opacity-50"
            >
              {value}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Phrased as a label rather than "walka z <nazwa>" because Polish would
          need the instrumental case there ("z Cyklopem", "z Rusałką"), and the
          card names are stored as printed. Declining them reliably is not
          possible, and getting it wrong is more jarring than not trying. */}
      <p className="text-sm text-muted">
        Przeciwnik: <span className="text-vermilion">{fight.cardName}</span>{" "}
        <span className="text-xs">
          ({fight.kind === "magiczna" ? "walka magiczna" : "walka zwykła"})
        </span>
        {typeof fight.strengthRoll === "number" && (
          <span className="ml-2 text-xs text-muted/80">
            kostka {fight.strengthRoll} → {label} {fight.enemyTotal}
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Declared before any dice (17.2). Whether it works is the character's
            own ability to judge (19.1), so both outcomes are offered rather
            than the app rolling for something the rulebook does not roll for. */}
        {fight.playerRoll === null && fight.enemyRoll === null && (
          <>
            <button
              disabled={busy}
              onClick={() => onAction({ action: "escape", succeeded: true })}
              className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
            >
              Wymknąłem się (19.1)
            </button>
            <button
              disabled={busy}
              onClick={() => onAction({ action: "escape", succeeded: false })}
              className="rounded border border-edge px-3 py-1 text-xs text-muted transition hover:border-vermilion disabled:opacity-50"
            >
              Próba nieudana
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FightSide
          title="Ty"
          total={fight.playerTotal}
          roll={fight.playerRoll}
          label={label}
          editable
          busy={busy}
          onTotal={(total) => onAction({ action: "fight-total", total })}
          onRoll={(value) => onAction({ action: "fight-roll", side: "player", value })}
        />
        <FightSide
          title={fight.cardName}
          total={fight.enemyTotal}
          roll={fight.enemyRoll}
          label={label}
          editable={false}
          busy={busy}
          onTotal={() => {}}
          onRoll={(value) => onAction({ action: "fight-roll", side: "enemy", value })}
        />
      </div>

      {fight.result && (
        <div className="rounded border border-edge bg-night p-3">
          <p className="text-sm">
            <FightVerdict fight={fight} outcome={fight.result.outcome} />
          </p>
          <button
            disabled={busy}
            onClick={() => onAction({ action: "fight-done" })}
            className="mt-3 rounded border border-edge bg-raised px-4 py-2 text-sm text-ink hover:border-ochre disabled:opacity-50"
          >
            {fight.guardian ? "Zastosuj i zakończ turę" : "Zastosuj i wróć"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What the result of this fight actually costs.
 *
 * A guardian charges what its doorway charges, not the usual point of Życie: a
 * bridge guardian takes a point of the very stat it was fought with (11.11) and
 * the Rycerz stops the journey (11.8). Saying "tracisz 1 punkt Życia" at a
 * bridge would have been wrong on every count — wrong stat, wrong rule, and
 * contradicted by what the app was about to do.
 */
function FightVerdict({
  fight,
  outcome,
}: {
  fight: Fight;
  outcome: "wygrana" | "przegrana" | "remis";
}) {
  const guardian = fight.guardian;

  if (outcome === "remis") {
    if (guardian?.kind === "most") {
      return (
        <span className="text-muted">
          Remis — nic nie tracisz, ale nie wchodzisz na Most i nie spróbujesz
          ponownie w następnej turze (11.11).
        </span>
      );
    }
    if (guardian) {
      return (
        <span className="text-muted">
          Remis — nie tracisz Życia, ale zatrzymujesz się po tej stronie (11.8).
        </span>
      );
    }
    return <span className="text-muted">Remis — nikt nic nie traci (17.10).</span>;
  }

  if (outcome === "wygrana") {
    if (guardian?.kind === "most") {
      return <span className="text-verdigris">Pokonany — wchodzisz na Most (11.10).</span>;
    }
    if (guardian) {
      return <span className="text-verdigris">Pokonany — przeprawiasz się (11.7).</span>;
    }
    return (
      <span className="text-verdigris">
        Wygrywasz. Możesz odebrać 1 Życie, 1 Przedmiot albo 1 Sztukę Złota (17.9).
      </span>
    );
  }

  if (guardian?.kind === "most") {
    const stat = guardian.entrance.stat === "magia" ? "Magii" : "Miecza";
    return (
      <span className="text-vermilion">
        Przegrywasz — tracisz 1 punkt {stat} i nie spróbujesz ponownie w następnej
        turze (11.11).{" "}
        {/* Own points never fall below what the character started with (1.3,
            2.3), so a character still on its starting value pays nothing here.
            Said plainly, because promising a cost that does not arrive looks
            like the referee failing to apply its own ruling. */}
        <span className="text-muted">
          Punktu nie stracisz, jeśli masz już tylko tyle, ile na starcie (1.3).
        </span>
      </span>
    );
  }
  if (guardian) {
    return (
      <span className="text-vermilion">
        Przegrywasz — tracisz 1 punkt Życia i zatrzymujesz się (11.8).
      </span>
    );
  }
  return (
    <span className="text-vermilion">
      Przegrywasz — tracisz 1 punkt Życia
      {fight.kind === "magiczna" ? " (nie można temu zapobiec, 18.2)" : ""}.
    </span>
  );
}

function FightSide({
  title,
  total,
  roll,
  label,
  editable,
  busy,
  onTotal,
  onRoll,
}: {
  title: string;
  total: number;
  roll: number | null;
  label: string;
  editable: boolean;
  busy: boolean;
  onTotal: (total: number) => void;
  onRoll: (value: number | null) => void;
}) {
  return (
    <div className="rounded border border-edge bg-night p-3">
      <p className="mb-2 truncate text-xs uppercase tracking-wide text-muted">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className="tnum text-2xl text-ink">{total}</span>
        <span className="text-xs text-muted">{label}</span>
        {editable && (
          <span className="ml-auto flex gap-1">
            <button
              disabled={busy}
              onClick={() => onTotal(total - 1)}
              className="h-5 w-5 rounded border border-edge text-[11px] text-muted hover:border-vermilion"
            >
              −
            </button>
            <button
              disabled={busy}
              onClick={() => onTotal(total + 1)}
              className="h-5 w-5 rounded border border-edge text-[11px] text-muted hover:border-verdigris"
            >
              +
            </button>
          </span>
        )}
      </div>
      {editable && (
        <p className="mt-1 text-[10px] leading-tight text-muted/70">
          + Przedmioty i Przyjaciele (1.5)
        </p>
      )}

      <div className="mt-3">
        {roll === null ? (
          <div className="flex flex-wrap gap-1">
            <button
              disabled={busy}
              onClick={() => onRoll(null)}
              className="rounded border border-edge px-2 py-1 text-xs text-ink hover:border-ochre disabled:opacity-50"
            >
              Rzuć
            </button>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <button
                key={value}
                disabled={busy}
                onClick={() => onRoll(value)}
                className="tnum h-6 w-6 rounded border border-edge text-xs text-muted hover:border-ochre disabled:opacity-50"
              >
                {value}
              </button>
            ))}
          </div>
        ) : (
          <p className="tnum text-sm text-muted">
            rzut <span className="text-ink">{roll}</span> — razem{" "}
            <span className="text-ochre">{total + roll}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The drawn stack, already in the order rule 15.2 requires — lowest class
 * numeral first. Showing them pre-sorted is most of the point of the referee:
 * getting this order wrong by hand is the commonest mistake at the table.
 */
function DrawnCards({
  drawn,
  busy,
  onAction,
  onSuggestion,
  onTake,
}: {
  drawn: { cardId: string; cardClass: string }[];
  busy: boolean;
  onAction: Props["onAction"];
  onSuggestion: Props["onSuggestion"];
  onTake: Props["onTake"];
}) {
  // 17.5: several creatures attacking at once are one opponent, their Miecze
  // added and one die rolled for the lot. Only offered when there is more than
  // one and they are of a kind — an ordinary Wróg and a magical one cannot be
  // summed, because the sums are of different things.
  const foes = drawn
    .map((entry) => EVENTS.find((c) => c.id === entry.cardId))
    .filter((card): card is EventCard => !!card && !!combatValueOf(card));
  const together =
    foes.length > 1 && new Set(foes.map((c) => combatValueOf(c)!.kind)).size === 1
      ? foes
      : null;

  return (
    <ol className="flex flex-col gap-2 border-l-2 border-ochre/30 pl-3">
      {together && (
        <li className="rounded border border-vermilion/40 bg-vermilion/5 p-2">
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            {together.length} Wrogów naraz: ich Miecze sumują się i rzucacie raz
            za wszystkich (17.5) — razem{" "}
            <span className="text-vermilion">
              {together.reduce((sum, card) => sum + combatValueOf(card)!.total, 0)}
            </span>
            .
          </p>
          <button
            disabled={busy}
            onClick={() =>
              onAction({ action: "fight", cardIds: together.map((card) => card.id) })
            }
            className="rounded border border-vermilion/60 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
          >
            Walcz ze wszystkimi naraz
          </button>
        </li>
      )}
      {drawn.map((entry, index) => {
        const card = EVENTS.find((c) => c.id === entry.cardId);
        return (
          <li key={`${entry.cardId}-${index}`}>
            <p className="text-sm font-medium text-ink">
              {index + 1}. {card?.name ?? entry.cardId}
              <span className="ml-2 text-[11px] uppercase text-muted">
                {CARD_CLASS_LABEL[entry.cardClass as CardClass] ?? entry.cardClass}
              </span>
            </p>
            {card && (
              <p className="mt-1 text-xs leading-relaxed text-muted">{card.text}</p>
            )}
            {/* The prose reader and the script would otherwise print the same
                die table twice, in two different wordings. The script wins. */}
            {card && !scriptFor(card.id) && (
              <RollTable text={card.text} busy={busy} onSuggestion={onSuggestion} />
            )}
            {card && combatValueOf(card) && (
              <p
                className={`tnum mt-1 text-xs ${
                  combatValueOf(card)!.kind === "magiczna" ? "text-magia" : "text-miecz"
                }`}
              >
                {combatValueOf(card)!.kind === "magiczna" ? "Magia" : "Miecz"} przeciwnika:{" "}
                {combatValueOf(card)!.total}
              </p>
            )}
            {card && bonusOf(card) && (
              <p className="tnum mt-1 text-xs text-verdigris">
                Dodaje:{" "}
                {[
                  bonusOf(card)!.miecz ? `+${bonusOf(card)!.miecz} Miecza` : null,
                  bonusOf(card)!.magia ? `+${bonusOf(card)!.magia} Magii` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {card && kindForCard(card) === "item" && (
                <button
                  disabled={busy}
                  onClick={() => onTake(card.id)}
                  className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
                >
                  Weź Przedmiot
                </button>
              )}
              {card && kindForCard(card) === "friend" && (
                <button
                  disabled={busy}
                  onClick={() => onTake(card.id)}
                  className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
                >
                  Weź Przyjaciela
                </button>
              )}
              {card && combatValueOf(card) && (
                <button
                  disabled={busy}
                  onClick={() => onAction({ action: "fight", cardId: card.id })}
                  className="rounded border border-vermilion/50 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
                >
                  Walcz
                </button>
              )}
              {/* An encoded card wins over the prose reader: the script says
                  what the card does because someone read it, where
                  suggestActions is regular expressions guessing at 1993 Polish.
                  Only unscripted cards fall back to the guess. */}
              {card &&
                !scriptFor(card.id) &&
                suggestActions(card).map((suggestion) => (
                  <button
                    key={suggestion.label}
                    disabled={busy}
                    onClick={() =>
                      onSuggestion(suggestion.stat, suggestion.delta, card.name)
                    }
                    className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
                  >
                    {suggestion.label}
                  </button>
                ))}
            </div>
            {card && scriptFor(card.id) && (
              <ScriptedCard
                script={scriptFor(card.id)!}
                cardName={card.name}
                busy={busy}
                onSuggestion={onSuggestion}
              />
            )}
            {card && <Coverage cardId={card.id} />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * How much of this card the app is actually handling.
 *
 * Silence is the dangerous answer. Once a table has watched the referee resolve
 * twenty cards it will assume it is resolving the twenty-first, and a card the
 * app cannot read looks exactly like one it has already dealt with. So the ones
 * it is not carrying say so, and the ones it is carrying only halfway name the
 * half it is not.
 */
function Coverage({ cardId }: { cardId: string }) {
  const coverage = coverageOf(cardId);
  if (coverage === "pelne") return null;
  const note = manualNote(cardId);
  return (
    <p
      className={`mt-1 rounded border-l-2 px-2 py-1 text-[11px] leading-snug ${
        coverage === "brak"
          ? "border-vermilion/50 bg-vermilion/5 text-vermilion/90"
          : "border-ochre/50 bg-ochre/5 text-ochre/90"
      }`}
    >
      <span className="uppercase tracking-wide">
        {coverage === "brak" ? "Ręcznie" : "Częściowo ręcznie"}
      </span>{" "}
      — {note ?? NOT_HANDLED}
    </p>
  );
}

/**
 * A card whose rules have been read and typed, rather than guessed at.
 *
 * Two jobs. It offers the outcomes the card actually has — including the ones
 * a regular expression could never find, like the six-way wish or a face of a
 * die table — and it says where the card goes afterwards, which is the part a
 * table skips and the part the app is best placed to remember.
 *
 * Nothing here applies itself. Every button goes through the same journalled
 * correction path as the manual plus and minus, so a wrong reading of a card is
 * visible in the log afterwards rather than silently baked into the game.
 */
function ScriptedCard({
  script,
  cardName,
  busy,
  onSuggestion,
}: {
  script: CardScript;
  cardName: string;
  busy: boolean;
  onSuggestion: Props["onSuggestion"];
}) {
  return (
    <div className="mt-2 rounded border border-edge/60 bg-night/40 p-2">
      {script.optional && (
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">
          Możesz z tego nie skorzystać
        </p>
      )}
      <EffectControls
        effect={script.effect}
        cardName={cardName}
        busy={busy}
        onSuggestion={onSuggestion}
      />
      <p className="mt-2 border-t border-edge/60 pt-1 text-[11px] text-ochre/80">
        {describeDisposition(script.disposition)}
      </p>
    </div>
  );
}

/**
 * The buttons for one effect.
 *
 * Recursive, because the effects are: a die table's face can be a fight, a
 * wish's option can be a teleport. Anything the app cannot apply on its own —
 * a move, a fight, a Nature change — is stated rather than offered, since those
 * already have their own controls elsewhere in the turn.
 */
function EffectControls({
  effect,
  cardName,
  busy,
  onSuggestion,
  prefix = "",
}: {
  effect: Effect;
  cardName: string;
  busy: boolean;
  onSuggestion: Props["onSuggestion"];
  prefix?: string;
}) {
  const stated = (text: string) => (
    <p className="text-[11px] text-muted">
      {prefix}
      {text}
    </p>
  );

  switch (effect.op) {
    case "nic":
      return stated("nic się nie dzieje");
    case "po-kolei":
      return (
        <div className="flex flex-col gap-1">
          {effect.steps.map((step, i) => (
            <EffectControls
              key={i}
              effect={step}
              cardName={cardName}
              busy={busy}
              onSuggestion={onSuggestion}
              prefix={prefix}
            />
          ))}
        </div>
      );
    case "wybor":
      return (
        <div>
          <p className="mb-1 text-[11px] text-muted">{prefix}Wybierz jedno:</p>
          <div className="flex flex-wrap gap-1">
            {effect.options.map((option) => (
              <EffectControls
                key={option.label}
                effect={option.effect}
                cardName={cardName}
                busy={busy}
                onSuggestion={onSuggestion}
              />
            ))}
          </div>
        </div>
      );
    case "rzut":
      return (
        <div>
          <p className="mb-1 text-[11px] text-muted">{prefix}Rzuć kostką:</p>
          <ol className="flex flex-col gap-0.5">
            {[1, 2, 3, 4, 5, 6].map((face) => (
              <li key={face} className="flex items-baseline gap-2">
                <span className="tnum w-3 text-[11px] text-ochre">{face}</span>
                <EffectControls
                  effect={effect.faces[face]}
                  cardName={cardName}
                  busy={busy}
                  onSuggestion={onSuggestion}
                />
              </li>
            ))}
          </ol>
        </div>
      );
    case "punkty": {
      const label = `${effect.delta > 0 ? "+" : "−"}${Math.abs(effect.delta)} ${STAT_LABEL[effect.stat]}`;
      if (effect.target && effect.target !== "ty") {
        return stated(`${label} — ${TARGET_LABEL[effect.target]}`);
      }
      return (
        <button
          disabled={busy}
          onClick={() => onSuggestion(effect.stat, effect.delta, cardName)}
          className="rounded border border-verdigris/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
        >
          {label}
        </button>
      );
    }
    case "uzdrow":
      return stated(`uzdrowienie do ${effect.upTo} punktów Życia (nie ponad start, 4.7)`);
    case "tura-stracona":
      return effect.target && effect.target !== "ty" ? (
        stated(`−${effect.turns} tura — ${TARGET_LABEL[effect.target]}`)
      ) : (
        <button
          disabled={busy}
          onClick={() => onSuggestion("tury", effect.turns, cardName)}
          className="rounded border border-vermilion/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
        >
          −{effect.turns} tura
        </button>
      );
    case "ruch-dodatkowy":
      return stated("dodatkowy ruch");
    case "zaklecie":
      return stated(`+${effect.count} Zaklęcie`);
    case "zaklecia-do-limitu":
      return stated("Zaklęcia do limitu twojej Magii (2.6)");
    case "przenies":
      return stated(
        effect.to.kind === "pole"
          ? `przenieś się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`
          : effect.to.kind === "dowolne-w-kregu"
            ? "przenieś się na dowolny Obszar w tym Kręgu"
            : "wracasz tam, skąd zacząłeś ruch",
      );
    case "wyciagnij":
      return stated(`wyciągnij ${effect.count} Karty`);
    case "walka":
      return stated(
        `walka: ${effect.nazwa} (${effect.miecz !== undefined ? `Miecz ${effect.miecz}` : `Magia ${effect.magia}`})`,
      );
    case "strata":
      return stated(LOSS_LABEL(effect));
    case "kamien":
      return stated("Zamiana w Kamień (20.1)");
    case "natura":
      return stated(`zmiana Natury na: ${effect.na === "zla" ? "zła" : effect.na}`);
    case "kup":
      return (
        <div>
          <p className="text-[11px] text-muted">{prefix}Możesz kupić:</p>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {effect.towar.map((towar) => (
              <li key={towar.co} className="text-[11px] text-ink">
                {towar.co}{" "}
                <span className="text-zloto">
                  {towar.cena} Sz. Z.
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "jak-pole":
      return stated(
        `modlisz się na zasadach z: ${FIELDS.get(effect.fieldId)?.name ?? effect.fieldId}`,
      );
    case "poloz-karte":
      return stated(
        effect.gdzie.kind === "pole"
          ? `połóż Kartę na: ${FIELDS.get(effect.gdzie.fieldId)?.name ?? effect.gdzie.fieldId}`
          : effect.gdzie.kind === "jedno-z"
            ? `połóż Kartę na wolnym z: ${effect.gdzie.fieldIds
                .map((id) => FIELDS.get(id)?.name ?? id)
                .filter((name, i, all) => all.indexOf(name) === i)
                .join(", ")}`
            : "połóż Kartę",
      );
    case "otrzymaj":
      return stated(`otrzymujesz: ${effect.co}`);
    case "gdy":
      return (
        <div className="flex flex-col gap-1">
          <EffectControls
            effect={effect.to}
            cardName={cardName}
            busy={busy}
            onSuggestion={onSuggestion}
            prefix={`${conditionLabel(effect.warunek)}: `}
          />
          {effect.inaczej && (
            <EffectControls
              effect={effect.inaczej}
              cardName={cardName}
              busy={busy}
              onSuggestion={onSuggestion}
              prefix="w przeciwnym razie: "
            />
          )}
        </div>
      );
  }
}

const STAT_LABEL = {
  miecz: "Miecza",
  magia: "Magii",
  zycie: "Życia",
  zloto: "Złota",
} as const;

const TARGET_LABEL = {
  ty: "ty",
  wszyscy: "wszystkie Postacie",
  "wszyscy-w-kregu": "wszystkie Postacie w tym Kręgu",
  "kazdy-kto-tu-trafi": "każdy, kto tu trafi",
} as const;

function LOSS_LABEL(effect: Extract<Effect, { op: "strata" }>): string {
  const what = {
    przedmiot: "Przedmiot",
    przyjaciel: "Przyjaciela",
    zaklecie: "Zaklęcie",
    zloto: "całe złoto",
    "wszystkie-przedmioty": "wszystkie Przedmioty",
  }[effect.co];
  const how = effect.wybor === "losowo" ? " (losowo)" : "";
  const count = effect.count && effect.count > 1 ? `${effect.count} ` : "";
  return `tracisz ${count}${what}${how}`;
}

function conditionLabel(condition: Extract<Effect, { op: "gdy" }>["warunek"]): string {
  switch (condition.is) {
    case "natura":
      return `jeśli ${condition.jedna_z.map((n) => (n === "zla" ? "zła" : n)).join(" lub ")}`;
    case "prog":
      return `jeśli ${condition.stat === "miecz" ? "Miecz" : "Magia"} < ${condition.ponizej}`;
    case "ma-zloto":
      return "jeśli masz złoto";
  }
}
