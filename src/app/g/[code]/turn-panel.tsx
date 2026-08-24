"use client";

import { useState } from "react";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { DIRECTION_LABEL, type Fight, type TurnPhase } from "@/lib/engine/turn";
import { suggestActions } from "@/lib/engine/cardEffects";
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
          <RollTable text={fieldText} busy={busy} onSuggestion={isMine ? onSuggestion : undefined} />
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
            {fight.result.outcome === "remis" ? (
              <span className="text-muted">
                Remis — nikt nic nie traci (17.10).
              </span>
            ) : fight.result.outcome === "wygrana" ? (
              <span className="text-verdigris">
                Wygrywasz. Możesz odebrać 1 Życie, 1 Przedmiot albo 1 Sztukę Złota (17.9).
              </span>
            ) : (
              <span className="text-vermilion">
                Przegrywasz — tracisz 1 punkt Życia
                {fight.kind === "magiczna" ? " (nie można temu zapobiec, 18.2)" : ""}.
              </span>
            )}
          </p>
          <button
            disabled={busy}
            onClick={() => onAction({ action: "fight-done" })}
            className="mt-3 rounded border border-edge bg-raised px-4 py-2 text-sm text-ink hover:border-ochre disabled:opacity-50"
          >
            Zastosuj i wróć
          </button>
        </div>
      )}
    </div>
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
  return (
    <ol className="flex flex-col gap-2 border-l-2 border-ochre/30 pl-3">
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
            {card && (
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
              {/* Offered only where the card's text says one thing without
                  branching. Tapping applies it through the same journalled
                  correction path as the manual +/-, so a wrong suggestion is
                  visible afterwards rather than silently baked in. */}
              {card &&
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
          </li>
        );
      })}
    </ol>
  );
}
