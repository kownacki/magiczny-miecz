"use client";

import { useState } from "react";
import events from "@/data/events.json";
import characters from "@/data/characters.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { DIRECTION_LABEL, type Fight, type TurnPhase } from "@/lib/engine/turn";
import { suggestActions } from "@/lib/engine/cardEffects";
import { fieldScriptFor } from "@/lib/engine/fieldScript";
import { isSettled } from "@/lib/engine/resolve";
import { goodsId } from "@/lib/engine/goods";
import { HEAL_CEILING } from "@/lib/engine/derive";
import {
  describeDisposition,
  scriptFor,
  type CardScript,
  type Effect,
  type Target,
} from "@/lib/engine/cardScript";
import { NOT_HANDLED, coverageOf, manualNote } from "@/lib/engine/coverage";
import { BRIDGE_ORDEAL } from "@/lib/engine/bridge";
import { bonusOf, combatValueOf } from "@/lib/engine/cards";
import { kindForCard } from "@/lib/engine/holdings";
import { crossingFrom } from "@/lib/engine/rings";
import { FIELDS, isFerry, type FieldId } from "@/lib/engine/board";
import { RollTable } from "./roll-table";
import { parseRollTable } from "@/lib/engine/rollTable";

const EVENTS = events as EventCard[];

/** Character ids to their printed names, for the cards that name exceptions. */
const CHARACTER_NAMES = new Map(
  (characters as { id: string; name: string }[]).map((c) => [c.id, c.name]),
);

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
  fieldId: FieldId | null;
  /** True when this is the shared table screen driving somebody else's turn. */
  actingForOther?: boolean;
  dieSource: string;
  /**
   * "simulation" means the app owns the deck and deals cards itself.
   *
   * It also means it owns everything else. In a simulation there is no physical
   * die to read and no figure to have been moved wrongly, so every control that
   * exists to let a person *tell* the app what happened is gone: no typing a
   * roll, no editing a total, no reporting the outcome of a fight the app is
   * running. What is left is the game asking to be played.
   *
   * Companion mode keeps all of them, and must: there the board on the table is
   * the truth and the app is a record of it, so a referee you cannot correct is
   * worse than no referee.
   */
  mode: string;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => void;
  /** Applies a card's suggested bookkeeping to the active player's own seat. */
  onSuggestion: (stat: string, delta: number, reason: string) => void;
  /** Takes a drawn card into the active player's keeping. */
  onTake: (cardId: string) => void;
  /** What the character standing here has to spend and to spend it on. */
  purse?: { zloto: number; zycie: number };
  /** What the Wyposażenie pile still holds, so a shop can grey out what it lacks. */
  stock?: Record<string, number>;
  /** The active character's Przedmioty, for the Lichwiarz to buy back. */
  sellable?: { id: string; cardId: string }[];
  /** Buying, selling and paying a healer — see `fieldScript.ts`. */
  onService?: (body: Record<string, unknown>) => void;
  /** Card ids lying face up on the active character's field (16.8). */
  fieldCardIds?: string[];
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
  purse,
  stock,
  sellable,
  onService,
  fieldCardIds,
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
          {(!isTableOnly(fieldText) || (fieldId && fieldScriptFor(fieldId))) && (
            <p className="whitespace-pre-line rounded border-l-2 border-ochre/40 bg-night/60 px-3 py-2 text-xs leading-relaxed text-muted">
              {fieldText}
            </p>
          )}
          {/* A Przyjaciel who says you walk past this field's roll means the
              roll does not happen — not that it happens and is ignored, which
              some of these tables would make a meaningful difference. The
              table stays one tap away, because the app is always correctable. */}
          {/* An encoded field wins over the prose reader, the same way an
              encoded card does. `suggestActions` is regular expressions
              guessing at 1993 Polish, and on the Gród it glues the Lichwiarz's
              sentence onto three faces of the Wróżbita's die. Where somebody
              has read the field, that reading stands. */}
          {fieldId && fieldScriptFor(fieldId) ? null : rollSkippedBy ? (
            <RollSkipped
              by={rollSkippedBy}
              text={fieldText}
              busy={busy}
              typedRolls={mode !== "simulation"}
              onSuggestion={onSuggestion}
            />
          ) : (
            <RollTable
              text={fieldText}
              busy={busy}
              typedRolls={mode !== "simulation"}
              onSuggestion={isMine ? onSuggestion : undefined}
            />
          )}
        </div>
      )}

      {/* The establishments. Ten fields on the board sell things, buy things or
          mend wounds, and until this panel existed the app read their price
          lists out and left the table to do the sums. */}
      {isMine && fieldId && phase.phase === "pole" && (
        <FieldServices
          fieldId={fieldId}
          fieldCardIds={fieldCardIds ?? []}
          busy={busy}
          typedRolls={mode !== "simulation"}
          onRollOffer={(offer) => onAction({ action: "pole-tabela", offer })}
          purse={purse}
          stock={stock}
          sellable={sellable}
          onSuggestion={onSuggestion}
          onService={onService}
        />
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
          simulated={mode === "simulation"}
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
  simulated,
  busy,
  onAction,
}: {
  bridge: { from: string; guardian: string; entersAt: string; stat: "miecz" | "magia" };
  /** No manual outcomes when the app is the one fighting — see `Props["mode"]`. */
  simulated: boolean;
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
        {/* Reporting the outcome instead of fighting it is a companion-mode
            affordance: there the fight may have been settled by a card the app
            has never read. In a simulation the app is the one rolling, so being
            told who won would be taking its word for its own work. */}
        {!simulated && (
          <>
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
          </>
        )}
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
  simulated,
  busy,
  onAction,
}: {
  crossing: NonNullable<ReturnType<typeof crossingFrom>>;
  busy: boolean;
  /** No manual outcomes when the app is the one fighting — see `Props["mode"]`. */
  simulated: boolean;
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
            {/* As at the bridge: reporting a result belongs to a table that
                fought it themselves. */}
            {!simulated && (
              <>
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
              </>
            )}
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
  typedRolls,
  onSuggestion,
}: {
  by: string;
  text: string;
  busy: boolean;
  typedRolls: boolean;
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
      {anyway && (
        <RollTable text={text} busy={busy} typedRolls={typedRolls} onSuggestion={onSuggestion} />
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
      return (
        <RollControls
          dieSource={dieSource}
          simulated={mode === "simulation"}
          busy={busy}
          onAction={onAction}
        />
      );
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
      return (
        <BridgeControls
          bridge={phase.bridge}
          simulated={mode === "simulation"}
          busy={busy}
          onAction={onAction}
        />
      );
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
      return (
        <FightControls
          fight={phase.fight}
          simulated={mode === "simulation"}
          busy={busy}
          onAction={onAction}
        />
      );
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
  simulated,
  busy,
  onAction,
}: Pick<Props, "dieSource" | "busy" | "onAction"> & { simulated: boolean }) {
  // At a physical table both ways of getting a number are offered whatever the
  // table's configured preference: people reach for the die mid-game, and a
  // referee that refuses to accept it would be worse than no referee. In a
  // simulation there is no die to reach for and the app throws its own.
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={busy}
        onClick={() => onAction({ action: "roll" })}
        className="rounded border border-edge bg-raised px-5 py-3 font-[family-name:var(--font-display)] text-ink transition hover:border-ochre disabled:opacity-50"
      >
        Rzuć kostką
      </button>
      {!simulated && (
        <>
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
        </>
      )}
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
        <DrawnCards drawn={phase.drawn} />
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
/**
 * Exported because the draw modal shows the same fight.
 *
 * One component in two places rather than two that drift: the modal is what the
 * player fighting looks at, and this panel is what everybody else watches it
 * through. Nothing about a fight differs between the two views — it is the same
 * two dice.
 */
export function FightControls({
  fight,
  simulated,
  busy,
  waitingOn = [],
  myTurnToPass = false,
  onAction,
}: {
  fight: Fight;
  /** Names of the seats 17.3's window is still open for. */
  waitingOn?: string[];
  /** Whether this device is one of them. */
  myTurnToPass?: boolean;
  /** No typed rolls and no edited totals — see `Props["mode"]`. */
  simulated: boolean;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  const label = fight.kind === "magiczna" ? "Magia" : "Miecz";
  /**
   * The dice are held until 17.3's window closes, and they have to look held.
   *
   * They were offered the whole time and refused by the route, which is the one
   * combination an interface must never present: a button that is plainly
   * there, plainly enabled, and answers every press with the same complaint.
   * A player who has not read 17.7 has no way to guess that the way out is a
   * third button in a box that appears to be about somebody else.
   */
  const waiting = (fight.spellsOwedBy?.length ?? 0) > 0;

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
          {!simulated && (
            <>
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
            </>
          )}
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
        {/* Declared before any dice (17.2). Whether it works is not a roll —
            19.1 makes it an ability or the Krąg Płomieni — so a companion table
            says which happened, and a simulation asks the app, which knows the
            abilities in play and answers with `canEscapeAt`. */}
        {fight.playerRoll === null &&
          fight.enemyRoll === null &&
          (simulated ? (
            <button
              disabled={busy}
              onClick={() => onAction({ action: "escape" })}
              className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
            >
              Spróbuj się wymknąć (19.1)
            </button>
          ) : (
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
          ))}
      </div>

      {/* 17.3 and 17.7: the spells go in before the dice, and both sides get
          the chance. So the dice wait — and they wait on a decision rather than
          on a clock. Talisman's digital edition puts a countdown here and it is
          the most complained-about thing in that game: the roll lands before
          anybody has read what they were meant to react to.

          Nobody who has nothing to cast is ever asked, so most fights never see
          this at all. */}
      {waiting && (
        <div className="rounded border border-magia/50 bg-magia/5 p-3">
          {/* Said to whoever is reading it. "Czekamy na: Karol" is a strange
              thing to tell Karol, and it was the whole of what the window said
              to the one person who could close it: the dice would not move, the
              only sentence on screen named somebody else's job, and the player
              it was addressed to read their own name as somebody they were
              waiting for. */}
          <p className="text-xs text-ink">
            {myTurnToPass
              ? "Zaklęcia przed rzutem (17.3, 17.7) — kostki czekają na ciebie."
              : `Zaklęcia przed rzutem (17.3, 17.7) — czekamy na: ${waitingOn.join(", ")}.`}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {myTurnToPass
              ? "Rzuć Zaklęcie ze swojej ręki albo powiedz, że nie rzucasz — dopiero potem można rzucać kostkami."
              : "Rzuć Zaklęcie ze swojej ręki albo powiedz, że nie rzucasz. Kostki czekają."}
          </p>
          {myTurnToPass && (
            <button
              disabled={busy}
              onClick={() => onAction({ action: "spell-pass" })}
              className="mt-2 rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
            >
              Nie rzucam Zaklęcia
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FightSide
          title="Ty"
          total={fight.playerTotal}
          roll={fight.playerRoll}
          label={label}
          // 1.5 says the total is the character plus everything it carries, and
          // in a simulation the app already knows all of it. Nudging the number
          // by hand is for a table holding cards the app has never read.
          editable={!simulated}
          typedRolls={!simulated}
          busy={busy || waiting}
          onTotal={(total) => onAction({ action: "fight-total", total })}
          onRoll={(value) => onAction({ action: "fight-roll", side: "player", value })}
        />
        <FightSide
          title={fight.cardName}
          total={fight.enemyTotal}
          roll={fight.enemyRoll}
          label={label}
          editable={false}
          typedRolls={!simulated}
          busy={busy || waiting}
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
  typedRolls,
  busy,
  onTotal,
  onRoll,
}: {
  title: string;
  total: number;
  roll: number | null;
  label: string;
  editable: boolean;
  /** Whether a die may be typed in rather than thrown — see `Props["mode"]`. */
  typedRolls: boolean;
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
            {typedRolls &&
              [1, 2, 3, 4, 5, 6].map((value) => (
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
function DrawnCards({ drawn }: { drawn: { cardId: string; cardClass: string }[] }) {
  // Nothing here is pressable. Everything a player *does* about a drawn card
  // happens in the modal, where the whole table can see it and where nobody can
  // quietly re-equip mid-encounter — this is the same stack written down so
  // that the field can be read at a glance while the modal is folded away.
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
  simulated,
  onResolve,
  onSuggestion,
}: {
  script: CardScript;
  cardName: string;
  busy: boolean;
  /** The app carries the card out rather than listing what you should do. */
  simulated: boolean;
  onResolve: () => void;
  onSuggestion: Props["onSuggestion"];
}) {
  // Everything the app can do without asking. What is left — a `wybor`, which
  // Przedmiot to give up — comes back from the server as `pending` and is asked
  // then, so the card is read here and decided there.
  const settled = isSettled(script.effect);
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
        // Read, not pressed: the button below is what applies it.
        applied={simulated}
      />
      {simulated && settled && (
        <button
          disabled={busy}
          onClick={onResolve}
          className="mt-2 rounded border border-ochre/60 px-3 py-1 text-xs text-ochre transition hover:bg-edge disabled:opacity-50"
        >
          {script.effect.op === "rzut" ? "Rzuć i rozpatrz" : "Rozpatrz"}
        </button>
      )}
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
  applied = false,
}: {
  effect: Effect;
  cardName: string;
  busy: boolean;
  onSuggestion: Props["onSuggestion"];
  prefix?: string;
  /**
   * Whether the app has already carried this out.
   *
   * When it has, the outcomes are read, not pressed: a button that applies
   * "−1 Złota" a second time is not an affordance, it is a trap. Set for every
   * die table a simulation rolls, where the server applied the row before the
   * page ever saw it.
   */
  applied?: boolean;
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
              applied={applied}
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
                  applied={applied}
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
      if (applied) return stated(label);
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
      if (applied) return stated(`−${effect.turns} tura`);
      return effect.target && effect.target !== "ty" ? (
        stated(
          `−${effect.turns} tura — ${TARGET_LABEL[effect.target]}` +
            (effect.oprocz?.length
              ? `, oprócz: ${effect.oprocz.map((id) => CHARACTER_NAMES.get(id) ?? id).join(", ")}`
              : ""),
        )
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
    case "zamien-punkty":
      // 1.3 and 2.3 still hold on both sides of the swap, which is what makes
      // it a decision rather than a free re-roll of the character sheet.
      return stated("zamiana punktów Miecza na Magię albo odwrotnie (nie poniżej wartości początkowych)");
    case "zgadnij":
      return (
        <div>
          <p className="text-[11px] text-muted">
            {prefix}Powiedz na głos cyfrę od 1 do 6, potem rzuć. Trafienie:
          </p>
          <div className="mt-0.5">
            <EffectControls
              effect={effect.nagroda}
              cardName={cardName}
              busy={busy}
              onSuggestion={onSuggestion}
            />
          </div>
        </div>
      );
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
    case "sprzedaj":
      return stated(`skup Przedmiotów: ${effect.cena} Sz. Z. za sztukę`);
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

const TARGET_LABEL: Record<Target, string> = {
  ty: "ty",
  wszyscy: "wszystkie Postacie",
  "wszyscy-w-kregu": "wszystkie Postacie w tym Kręgu",
  "kazdy-kto-tu-trafi": "każdy, kto tu trafi",
  dobrzy: "Postacie o Naturze dobrej",
  chaotyczni: "Postacie o Naturze chaotycznej",
  zli: "Postacie o Naturze złej",
  "w-dolnym-kregu": "wędrujący po Dolnym Kręgu",
  "w-srodkowym-kregu": "wędrujący po Środkowym Kręgu",
  "w-gornym-kregu": "wędrujący po Górnym Kręgu",
  "inna-postac": "wybrana inna Postać",
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

/**
 * A field that trades.
 *
 * Each named service is a box with the thing it does actually attached to a
 * button: the Płatnerz's three lines become three prices you can pay, the
 * Medyk's sentence becomes a number of wounds you can afford, and the
 * Lichwiarz's becomes the list of what you are carrying with what he will give
 * you for it. Everything else — a die table, a wish, a change of Natura —
 * falls through to `EffectControls`, which already knows how to draw it.
 *
 * Nothing here decides a price. The buttons say what to buy; the server reads
 * what it costs off the same board.
 */
function FieldServices({
  fieldId,
  fieldCardIds,
  busy,
  typedRolls,
  onRollOffer,
  purse,
  stock,
  sellable,
  onSuggestion,
  onService,
}: {
  fieldId: FieldId;
  fieldCardIds: string[];
  busy: boolean;
  typedRolls: boolean;
  onRollOffer: (offer: string) => void;
  purse?: { zloto: number; zycie: number };
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  onSuggestion: Props["onSuggestion"];
  onService?: Props["onService"];
}) {
  // A shop that arrived on a card is not a different kind of shop from one
  // printed on the board: the Targowisko settles on a field and sells eight
  // Przedmioty from it, so it belongs in the same box with the same buttons.
  const fromCards = fieldCardIds.flatMap((cardId) => {
    const script = scriptFor(cardId);
    const card = EVENTS.find((c) => c.id === cardId);
    if (!script || !card) return [];
    return sells(script.effect) ? [{ name: card.name, effect: script.effect }] : [];
  });
  const script = fieldScriptFor(fieldId);
  // A compulsory field is not offered here: "MUSISZ RZUCIĆ KOSTKĄ" happens to
  // you, which puts it in the modal with the drawn cards, where the whole table
  // can watch and where nobody can re-equip halfway through. What stays is the
  // visiting — "MOŻESZ TU ODWIEDZIĆ" — because deciding not to go in is a real
  // answer and nobody else needs to watch you decline.
  const offers = [...(script?.obowiazkowe ? [] : (script?.offers ?? [])), ...fromCards];
  if (offers.length === 0) return null;
  const gold = purse?.zloto ?? 0;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-wide text-ochre/80">
        {script?.obowiazkowe ? "To pole trzeba rozpatrzeć" : "Możesz tu odwiedzić"}
        {purse && (
          <span className="ml-2 normal-case tracking-normal text-muted">
            masz <span className="tnum text-zloto">{purse.zloto} Sz. Z.</span>
          </span>
        )}
      </p>
      {offers.map((offer) => (
        <div key={offer.name} className="rounded border border-edge bg-night/40 p-2">
          <p className="mb-1 text-xs font-medium text-ink">{offer.name}</p>
          <ServiceEffect
            effect={offer.effect}
            name={offer.name}
            busy={busy}
            typedRolls={typedRolls}
            onRollOffer={() => onRollOffer(offer.name)}
            gold={gold}
            zycie={purse?.zycie ?? 0}
            stock={stock}
            sellable={sellable}
            onSuggestion={onSuggestion}
            onService={onService}
          />
        </div>
      ))}
    </div>
  );
}

/** The three trading operations, with everything else handed to `EffectControls`. */
function ServiceEffect({
  effect,
  name,
  busy,
  typedRolls,
  onRollOffer,
  gold,
  zycie,
  stock,
  sellable,
  onSuggestion,
  onService,
}: {
  effect: Effect;
  name: string;
  busy: boolean;
  typedRolls: boolean;
  onRollOffer?: () => void;
  gold: number;
  zycie: number;
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  onSuggestion: Props["onSuggestion"];
  onService?: Props["onService"];
}) {
  if (effect.op === "po-kolei") {
    return (
      <div className="flex flex-col gap-2">
        {effect.steps.map((step, i) => (
          <ServiceEffect
            key={i}
            effect={step}
            name={name}
            busy={busy}
            typedRolls={typedRolls}
            onRollOffer={onRollOffer}
            gold={gold}
            zycie={zycie}
            stock={stock}
            sellable={sellable}
            onSuggestion={onSuggestion}
            onService={onService}
          />
        ))}
      </div>
    );
  }

  // A scripted die table keeps the affordance the prose reader had: roll here,
  // or tap the face that came up on a real die. Local state, because this is a
  // lookup — what the face *does* is still applied through its own control, so
  // the referee never silently decides a player's outcome.
  if (effect.op === "rzut") {
    return (
      <ScriptedRoll
        effect={effect}
        name={name}
        busy={busy}
        typedRolls={typedRolls}
        onRollOffer={onRollOffer}
        gold={gold}
        zycie={zycie}
        stock={stock}
        sellable={sellable}
        onSuggestion={onSuggestion}
        onService={onService}
      />
    );
  }

  if (effect.op === "kup" && onService) {
    return (
      <ul className="flex flex-wrap gap-1">
        {effect.towar.map((towar) => {
          const cardId = goodsId(towar.co);
          // 21.2: a shop with none left is not offering it. Said plainly rather
          // than hidden, because "nieosiągalny" is information the table wants.
          const left = cardId && stock ? (stock[cardId] ?? Infinity) : Infinity;
          const affordable = gold >= towar.cena;
          const can = !!cardId && left > 0 && affordable;
          return (
            <li key={towar.co}>
              <button
                disabled={busy || !can}
                title={
                  left <= 0
                    ? "Nie ma już ani jednej (21.2)"
                    : affordable
                      ? undefined
                      : "Za mało złota"
                }
                onClick={() => onService({ action: "buy", cardId })}
                className="rounded border border-zloto/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-zloto/20 disabled:opacity-40"
              >
                {towar.co} <span className="tnum text-zloto">{towar.cena} Sz. Z.</span>
                {left <= 0 && <span className="ml-1 text-muted">(brak)</span>}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (effect.op === "sprzedaj" && onService) {
    if (!sellable?.length) {
      return <p className="text-[11px] text-muted">Nie masz Przedmiotów na sprzedaż.</p>;
    }
    return (
      <ul className="flex flex-wrap gap-1">
        {sellable.map((held) => (
          <li key={held.id}>
            <button
              disabled={busy}
              onClick={() => onService({ action: "sell", holdingId: held.id })}
              className="rounded border border-zloto/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-zloto/20 disabled:opacity-40"
            >
              {cardNameOf(held.cardId)} → <span className="tnum text-zloto">+{effect.cena}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (effect.op === "uzdrow" && onService) {
    const price = effect.cena ?? 0;
    const missing = Math.max(0, HEAL_CEILING - zycie);
    const affordable = price > 0 ? Math.floor(gold / price) : missing;
    const most = Math.min(missing, affordable);
    if (missing === 0) {
      return (
        <p className="text-[11px] text-muted">
          Życie jest już na poziomie początkowym — 4.7 nie pozwala wyżej.
        </p>
      );
    }
    return (
      <div>
        <p className="mb-1 text-[11px] text-muted">
          {price > 0 ? `${price} Sz. Z. za punkt Życia` : "leczenie za darmo"} — brakuje ci{" "}
          <span className="tnum text-zycie">{missing}</span>
          {most < missing && `, stać cię na ${most}`}.
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: most }, (_, i) => i + 1).map((points) => (
            <button
              key={points}
              disabled={busy}
              onClick={() => onService({ action: "heal-paid", points })}
              className="tnum rounded border border-zycie/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-zycie/20 disabled:opacity-40"
            >
              +{points} Życia{price > 0 && ` (${points * price} Sz. Z.)`}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <EffectControls
      effect={effect}
      cardName={name}
      busy={busy}
      onSuggestion={onSuggestion}
      applied={!typedRolls}
    />
  );
}

/** A card's printed name, for the few places holding only an id. */
function cardNameOf(cardId: string): string {
  return EVENTS.find((c) => c.id === cardId)?.name ?? cardId;
}

/**
 * A field's die table.
 *
 * In a simulation this is one button: the server throws the die, applies the
 * row and says what it did — pressing "−1 Złota" afterwards would be the player
 * doing the app's job. The six faces stay on screen because they are the board,
 * and knowing what the Karczma can do to you before you walk in is the game.
 *
 * At a physical table it is the older thing: pick the face your own die showed
 * and apply the row yourself, because there the app is keeping the record and
 * not making it.
 */
function ScriptedRoll({
  effect,
  name,
  busy,
  typedRolls,
  onRollOffer,
  gold,
  zycie,
  stock,
  sellable,
  onSuggestion,
  onService,
}: {
  effect: Extract<Effect, { op: "rzut" }>;
  name: string;
  busy: boolean;
  typedRolls: boolean;
  /** Asks the server to throw this offer's die and apply the row. */
  onRollOffer?: () => void;
  gold: number;
  zycie: number;
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  onSuggestion: Props["onSuggestion"];
  onService?: Props["onService"];
}) {
  const [rolled, setRolled] = useState<number | null>(null);
  // Nothing is picked out for the player in a simulation: the app rolled and
  // acted, and the notice above says what came of it. Showing one face as
  // "yours" here would invite a second, contradictory click.
  const faces = rolled === null || !typedRolls ? [1, 2, 3, 4, 5, 6] : [rolled];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] text-muted">Rzuć kostką:</span>
        <button
          disabled={busy}
          onClick={() =>
            typedRolls
              ? setRolled(1 + Math.floor(Math.random() * 6))
              : onRollOffer?.()
          }
          className="rounded border border-edge px-2 py-0.5 text-[11px] text-ink transition hover:border-ochre disabled:opacity-50"
        >
          Rzuć
        </button>
        {typedRolls &&
          [1, 2, 3, 4, 5, 6].map((face) => (
            <button
              key={face}
              onClick={() => setRolled(face)}
              className={`tnum h-5 w-5 rounded border text-[11px] transition ${
                rolled === face
                  ? "border-ochre text-ochre"
                  : "border-edge text-muted hover:border-ochre"
              }`}
            >
              {face}
            </button>
          ))}
        {rolled !== null && (
          <button
            onClick={() => setRolled(null)}
            className="ml-auto text-[11px] text-muted underline hover:text-ink"
          >
            wyczyść
          </button>
        )}
      </div>
      <ol className="flex flex-col gap-0.5">
        {faces.map((face) => (
          <li key={face} className="flex items-baseline gap-2">
            <span className="tnum w-3 text-[11px] text-ochre">{face}</span>
            <ServiceEffect
              effect={effect.faces[face]}
              name={name}
              busy={busy}
              typedRolls={typedRolls}
              onRollOffer={onRollOffer}
              gold={gold}
              zycie={zycie}
              stock={stock}
              sellable={sellable}
              onSuggestion={onSuggestion}
              onService={onService}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Whether an effect trades in anything — the test for putting a card in the services box. */
function sells(effect: Effect): boolean {
  if (effect.op === "kup" || effect.op === "sprzedaj" || effect.op === "uzdrow") return true;
  if (effect.op === "po-kolei") return effect.steps.some(sells);
  if (effect.op === "wybor") return effect.options.some((o) => sells(o.effect));
  return false;
}
