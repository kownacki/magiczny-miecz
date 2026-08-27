"use client";

import { Rules } from "./rule-ref";

/** A fight, one die at a time — the two totals, the two rolls, and what the result costs (17.x, and a guardian's own terms at 11.8 and 11.11). */

import { type Fight } from "@/lib/engine/turn";
import type { OnAction, Simulated } from "./turn-controls";

/**
 * A fight, one die at a time.
 *
 * Both rolls are shown as they land rather than the result appearing at once,
 * because at a table the tension is in watching the second die — and because
 * every other player needs to be able to check the arithmetic.
 *
 * This is the fighter's half of the sheet; `WatchFight` in the draw modal is
 * what everybody else sees of the same two dice. The split is over what may be
 * pressed, never over what the numbers are.
 */
export function FightControls({
  fight,
  simulated,
  busy,
  floorHeld = false,
  canFlee = true,
  onAction,
}: {
  fight: Fight;
  /** Somebody has claimed the moment before the dice (17.3), so they wait. */
  floorHeld?: boolean;
  /**
   * Whether this device may take 17.2's decision.
   *
   * False for the attacker in a duel: 17.6 gives the escape to the character
   * who was attacked, and attacking is a choice already made. Their opponent
   * gets the button instead, in the sheet they are watching the fight through.
   */
  canFlee?: boolean;
  /** No typed rolls and no edited totals — see `Simulated`. */
  simulated: Simulated;
  busy: boolean;
  onAction: OnAction;
}) {
  const label = fight.kind === "magical" ? "Magia" : "Miecz";
  /**
   * The dice are held until 17.3's window closes, and they have to look held.
   *
   * They were offered the whole time and refused by the route, which is the one
   * combination an interface must never present: a button that is plainly
   * there, plainly enabled, and answers every press with the same complaint.
   * A player who has not read 17.7 has no way to guess that the way out is a
   * third button in a box that appears to be about somebody else.
   */
  const waiting = floorHeld;

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
      {/* The name is in the sheet's header now; what is left here is the kind
          of fight it is, which the header cannot say without repeating itself.
          Phrased as a label rather than "walka z <nazwa>" because Polish would
          need the instrumental case there ("z Cyklopem", "z Rusałką"), and the
          card names are stored as printed. Declining them reliably is not
          possible, and getting it wrong is more jarring than not trying. */}
      <p className="text-sm text-muted">
        {fight.kind === "magical" ? "Walka magiczna" : "Walka zwykła"}
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
        {canFlee &&
          fight.playerRoll === null &&
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

      {/* The spell panel is beside the fight now, not inside it — see
          `SpellFloorControl` in the modal. All that is left here is the
          consequence: while somebody holds the moment before the dice, the
          dice do not move, and they look it. */}
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
    if (guardian?.kind === "bridge") {
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
          <Rules>Remis — nie tracisz Życia, ale zatrzymujesz się po tej stronie (11.8).</Rules>
        </span>
      );
    }
    return (
      <span className="text-muted">
        <Rules>Remis — nikt nic nie traci (17.10).</Rules>
      </span>
    );
  }

  if (outcome === "wygrana") {
    if (guardian?.kind === "bridge") {
      return (
        <span className="text-verdigris">
          <Rules>Pokonany — wchodzisz na Most (11.10).</Rules>
        </span>
      );
    }
    if (guardian) {
      return (
        <span className="text-verdigris">
          <Rules>Pokonany — przeprawiasz się (11.7).</Rules>
        </span>
      );
    }
    return (
      <span className="text-verdigris">
        Wygrywasz. Możesz odebrać 1 Życie, 1 Przedmiot albo 1 Sztukę Złota (17.9).
      </span>
    );
  }

  if (guardian?.kind === "bridge") {
    const stat = guardian.entrance.stat === "magic" ? "Magii" : "Miecza";
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
      {fight.kind === "magical" ? " (nie można temu zapobiec, 18.2)" : ""}.
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
