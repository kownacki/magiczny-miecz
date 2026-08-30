"use client";

/** The two Karty the Chochlik lifted off the stos, and the choice between them. */

import { cardName } from "@/lib/engine/polish";
import { SPELL_BY_REF } from "@/lib/game/decks";
import { CardBack } from "./card-tile";
import { Overlay } from "./overlay";

/**
 * An `ask` frame on screen (docs/STACK.md).
 *
 * The question printed on a Charakterystyka rather than on the Karta being
 * resolved — the Chochlik's "obejrzeć pierwsze 2 Karty ze stosu i wybrać tę,
 * która najbardziej ci odpowiada". Drawn for everybody, because the whole
 * table is waiting on it, but only one seat is shown what is on the cards:
 * `envelopeFor` empties the refs for every other device, so the rest arrive
 * holding a count and nothing else and this panel draws backs.
 *
 * That asymmetry is the panel's whole job. A player watching should see that
 * somebody is choosing between two Zaklęcia — that much is true at a physical
 * table, where two cards are visibly held up — and should not see which.
 */
export function AskFramePanel({
  frame,
  who,
  canAct,
  busy,
  onAnswer,
}: {
  frame: {
    seatId: string;
    reason: string;
    question: { kind: string; count: number; refs: string[] };
  };
  /** Whose answer it is — the frame's own seat, named (law 5). */
  who: string;
  canAct: boolean;
  busy: boolean;
  onAnswer: (choice: number) => void;
}) {
  const { count, refs } = frame.question;
  // The refs are slice references, not ids: the pile deals in copies, and the
  // card is looked up through the same table the server dealt it from.
  const offered = refs.map((ref) => SPELL_BY_REF.get(ref) ?? null);
  const mine = refs.length > 0;

  return (
    // Not dismissable: the turn is stuck here, and clicking away would hide the
    // thing everybody is waiting for.
    <Overlay label={frame.reason} onDismiss={null} tone="bg-night/80">
      <div className="w-full max-w-md rounded-lg border border-edge bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{frame.reason}</h2>
        <p className="mt-1 text-xs text-muted">
          {canAct
            ? `Obejrzyj ${count} pierwsze Karty Zaklęć i weź jedną.`
            : `${who} wybiera jedno z ${count} Zaklęć — zakryte dla reszty stołu (9.3).`}
        </p>

        {mine ? (
          <div className="mt-3 flex flex-col gap-2">
            {offered.map((spell, index) => (
              <button
                key={index}
                type="button"
                disabled={busy || !canAct}
                onClick={() => onAnswer(index)}
                className="rounded border border-edge px-3 py-2 text-left text-sm text-ink transition hover:border-ochre disabled:opacity-50"
              >
                {spell ? cardName(spell.id) : `Karta ${index + 1}`}
                {spell?.text && (
                  <span className="mt-1 block text-[12px] leading-snug text-muted">
                    {spell.text}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          // Backs, and as many of them as are being looked at. Nothing here is
          // hidden in the browser — the names never arrived.
          <div className="mt-3">
            <CardBack count={count} />
          </div>
        )}

        <p className="mt-3 text-[12px] text-muted">
          Ta, której nie weźmiesz, wraca na wierzch stosu.
        </p>
      </div>
    </Overlay>
  );
}
