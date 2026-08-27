"use client";

import { Rules } from "./rule-ref";

/** Everything the board asks of a character leaving one Obszar for another: a toll, a guardian, a threshold, and the six squares of the Kamienny Most (11.x, 14.x). */

import { crossingFrom } from "@/lib/engine/rings";
import { FIELDS, asFieldId } from "@/lib/engine/board";
import { fieldWithText } from "@/lib/view/fieldText";
import type { OnAction, Simulated } from "./turn-controls";

/**
 * The Przewoźnik's toll (11.2), drawn in the Obszar window with the rest of
 * what a field asks of you.
 */
export function Ferry({
  busy,
  onAction,
}: {
  busy: boolean;
  onAction: OnAction;
}) {
  return (
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
export function BridgeControls({
  bridge,
  simulated,
  busy,
  onAction,
}: {
  bridge: { from: string; guardian: string; entersAt: string; stat: "sword" | "magic" };
  /** No manual outcomes when the app is the one fighting — see `Simulated`. */
  simulated: Simulated;
  busy: boolean;
  onAction: OnAction;
}) {
  const stat = bridge.stat === "magic" ? "Magii" : "Miecza";
  return (
    <div>
      <p className="mb-1 text-sm text-ink">
        Zanim wejdziesz na Most, musisz pokonać:{" "}
        <span className="text-vermilion">{bridge.guardian}</span>.
      </p>
      <p className="mb-3 text-[11px] text-muted">
        <Rules>
        Rzuć kostką, by poznać jego siłę {stat}: 1&nbsp;→&nbsp;5, 2&nbsp;→&nbsp;6,
        3&nbsp;→&nbsp;7, 4&nbsp;→&nbsp;8, 5&nbsp;→&nbsp;9, 6&nbsp;→&nbsp;10. Potem
        zwykła walka. Przegrana to 1 punkt {stat}; remis nic nie kosztuje. Po obu
        nie spróbujesz ponownie w następnej turze (11.11).
        </Rules>
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
 * One of the six things on the bridge that has to be got past (14.5-14.6).
 *
 * Every one of them is printed where the player is standing, so the text is
 * quoted rather than paraphrased and the button only does the arithmetic. The
 * app owns the dice here because there is nothing to adjudicate: three dice
 * less a number you already know, or a table.
 *
 * Quoted from the transcription, which is what "quoted" has to mean. These six
 * were hand-shortened here instead — a third copy of tables that already exist
 * as `TRAP_TABLE`'s arithmetic in `bridge.ts` and as the rulebook's own words in
 * `most-fields.json`, and the only one of the three that could drift without
 * anything failing.
 */
export function BridgeOrdeal({
  fieldId,
  busy,
  onAction,
}: {
  fieldId: string;
  busy: boolean;
  onAction: OnAction;
}) {
  // Only the label on the button is this component's to write; the title and
  // the text belong to the board.
  const button: Record<string, string> = {
    pulapka: "Rzuć trzema kostkami",
    "magiczna-pulapka": "Rzuć trzema kostkami",
    "gra-ze-smiercia": "Zagraj ze Śmiercią",
    cerber: "Rzuć kostką",
    "demon-zaglady": "Rzuć za Demona",
    monstrum: "Rzuć za Monstrum",
  };
  const here = asFieldId(fieldId);
  const field = here ? fieldWithText(here) : null;
  const label = button[fieldId];
  if (!field || !label) return null;

  return (
    <section className="mb-3 rounded border border-vermilion/40 bg-vermilion/5 p-3">
      <h3 className="mb-1 font-[family-name:var(--font-display)] text-sm text-vermilion">
        {field.name}
      </h3>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">{field.text}</p>
      <button
        disabled={busy}
        onClick={() => onAction({ action: "most-pole" })}
        className="rounded border border-vermilion/60 px-3 py-1 text-xs text-ink transition hover:bg-vermilion/20 disabled:opacity-50"
      >
        {label}
      </button>
    </section>
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
export function Crossing({
  crossing,
  simulated,
  busy,
  onAction,
}: {
  crossing: NonNullable<ReturnType<typeof crossingFrom>>;
  busy: boolean;
  /** No manual outcomes when the app is the one fighting — see `Simulated`. */
  simulated: Simulated;
  onAction: OnAction;
}) {
  const to = FIELDS.get(crossing.to)?.name ?? crossing.to;
  const test = crossing.test;

  return (
    <div className="mb-4 rounded border border-ochre/40 bg-night/60 p-3">
      <p className="mb-1 text-xs text-muted">
        <Rules>
        Stąd można przejść do: <span className="text-ink">{to}</span>
        {!test && (
          <>
            {" "}
            — <span className="text-verdigris">bez rzutu kostką</span> (11.3, 11.7).
          </>
        )}
        </Rules>
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

      {test?.kind === "magic" && (
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

      {test?.kind === "fight" && (
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
