"use client";

import { useState } from "react";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { DIRECTION_LABEL, type Fight, type TurnPhase } from "@/lib/engine/turn";

const EVENTS = events as EventCard[];

/**
 * Card lookup for the companion flow. The Roman numeral printed on a card is
 * its resolution *class*, not an identifier, so there is no number to type —
 * the player finds the card they drew by name instead. Diacritics are folded on
 * both sides so "zaraza" finds "ZARAZA" without a Polish keyboard.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
}

function searchCards(query: string): EventCard[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const seen = new Set<string>();
  return EVENTS.filter((card) => {
    if (!fold(card.name).includes(needle)) return false;
    // The deck holds real duplicates; the player only needs to find the card
    // once, so identical names collapse to one row.
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  }).slice(0, 8);
}

interface Props {
  phase: TurnPhase;
  isMine: boolean;
  playerName: string;
  fieldName: string;
  /** The instruction printed on the board for the field, if it has been transcribed. */
  fieldText: string | null;
  dieSource: string;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => void;
}

export function TurnPanel({
  phase,
  isMine,
  playerName,
  fieldName,
  fieldText,
  dieSource,
  busy,
  onAction,
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
        <p className="mb-4 whitespace-pre-line rounded border-l-2 border-ochre/40 bg-night/60 px-3 py-2 text-xs leading-relaxed text-muted">
          {fieldText}
        </p>
      )}

      {!isMine ? (
        <p className="text-sm text-muted">Czekamy na ruch gracza {playerName}.</p>
      ) : (
        <PhaseControls
          phase={phase}
          dieSource={dieSource}
          busy={busy}
          onAction={onAction}
        />
      )}
    </section>
  );
}

function PhaseControls({
  phase,
  dieSource,
  busy,
  onAction,
}: Pick<Props, "phase" | "dieSource" | "busy" | "onAction">) {
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
                key={option.direction}
                disabled={busy}
                onClick={() => onAction({ action: "move", fieldId: option.fieldId })}
                className="rounded border border-edge bg-raised px-4 py-3 text-left transition hover:border-ochre disabled:opacity-50"
              >
                <span className="block font-medium text-ink">{option.fieldName}</span>
                <span className="block text-[11px] text-muted">
                  {DIRECTION_LABEL[option.direction]}
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
    case "pole":
      return <FieldControls phase={phase} busy={busy} onAction={onAction} />;
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
  busy,
  onAction,
}: {
  phase: Extract<TurnPhase, { phase: "pole" }>;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  const [query, setQuery] = useState("");
  const results = searchCards(query);
  const outstanding = phase.draw - phase.drawn.length;

  return (
    <div className="flex flex-col gap-4">
      {phase.draw > 0 && (
        <p className="text-sm text-muted">
          To pole każe wyciągnąć{" "}
          <span className="text-ink">
            {phase.draw} {phase.draw === 1 ? "kartę" : "karty"}
          </span>
          {outstanding > 0 ? ` — zostało ${outstanding}.` : " — komplet."}
        </p>
      )}

      {outstanding > 0 && (
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
        <DrawnCards drawn={phase.drawn} busy={busy} onAction={onAction} />
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
}: {
  drawn: { cardId: string; cardClass: string }[];
  busy: boolean;
  onAction: Props["onAction"];
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
            {card?.miecz !== undefined && (
              <p className="tnum mt-1 text-xs text-miecz">Miecz przeciwnika: {card.miecz}</p>
            )}
            {card?.magia !== undefined && (
              <p className="tnum mt-1 text-xs text-magia">Magia przeciwnika: {card.magia}</p>
            )}
            {card && (card.miecz !== undefined || card.magia !== undefined) && (
              <button
                disabled={busy}
                onClick={() => onAction({ action: "fight", cardId: card.id })}
                className="mt-2 rounded border border-vermilion/50 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
              >
                Walcz
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
