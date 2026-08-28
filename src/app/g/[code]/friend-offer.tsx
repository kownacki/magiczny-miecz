"use client";

/** What a Przyjaciel offers on the one Obszar he belongs to (Księżniczka, Władca). */

import { abilitiesOf } from "@/lib/engine/abilities";
import { HEAL_CEILING } from "@/lib/engine/derive";
import type { FieldId } from "@/lib/engine/board";
import { CARD_NAMES, type Seat } from "./table";

/**
 * The two things the Księżniczka and the Władca do where they belong.
 *
 * "Dzięki przyjaźni Księżniczki będziesz mógł odzyskać do 2 punktów Życia,
 * podczas każdej wizyty w Zamku. Jeżeli zrezygnujesz tam z jej Karty, otrzymasz
 * 3 Sztuki Złota." The Władca says the same of the Twierdza Strzegąca Dróg.
 *
 * In the Obszar's window rather than on the seat card, because both are things
 * you do *here* — the card is with you everywhere and worth something only in
 * one place, which is the whole shape of the clause. The same reason the
 * wyprawa is drawn there.
 *
 * Neither is offered anywhere else, and neither is offered by a friend somebody
 * else is holding: `seat` is the character standing here.
 */
export function FriendOffer({
  seat,
  fieldId,
  busy,
  onHeal,
  onPart,
}: {
  seat: Seat;
  /** Where the character is standing, which is the whole question. */
  fieldId: FieldId;
  busy: boolean;
  onHeal: (points: number) => void;
  onPart: (holdingId: string) => void;
}) {
  const offers = seat.holdings
    .filter((held) => held.kind === "friend")
    .map((held) => ({
      held,
      name: CARD_NAMES.get(held.cardId) ?? held.cardId,
      heals: abilitiesOf(held.cardId).find(
        (ability) => ability.kind === "uzdrowienie" && ability.field === fieldId,
      ),
      parts: abilitiesOf(held.cardId).find(
        (ability) => ability.kind === "oddaj-w" && ability.field === fieldId,
      ),
    }))
    .filter((one) => one.heals || one.parts);

  // Nothing here belongs to this Obszar, so there is no heading either. Most
  // Obszary are most Obszary.
  if (offers.length === 0) return null;

  return (
    <section className="border-t border-edge pt-3">
      <h3 className="text-[11px] uppercase tracking-widest text-muted">Przyjaciel tutaj</h3>
      {offers.map(({ held, name, heals, parts }) => {
        // 4.7: "odzyskać" is recovering what you lost, and nothing lifts a
        // Postać above what it started with — so a character at full Życie is
        // offered the trade and not the cure.
        const missing = Math.max(0, HEAL_CEILING - seat.life);
        const canHeal =
          heals?.kind === "uzdrowienie" ? Math.min(heals.upTo, missing) : 0;

        return (
          <div key={held.id} className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-ochre/90">{name}</p>
            {heals?.kind === "uzdrowienie" && (
              <button
                type="button"
                disabled={busy || canHeal === 0}
                onClick={() => onHeal(canHeal)}
                title={
                  canHeal === 0
                    ? `Życie jest już na poziomie początkowym (${HEAL_CEILING}) — 4.7 nie pozwala wyżej`
                    : undefined
                }
                className="rounded border border-edge px-2 py-1.5 text-left text-xs text-ink transition hover:border-verdigris disabled:opacity-50"
              >
                Odzyskaj {canHeal || heals.upTo} Życia — za darmo, raz na wizytę
              </button>
            )}
            {parts?.kind === "oddaj-w" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPart(held.id)}
                // Not asked about first, though it cannot be undone: 6.4 already
                // lets anybody put a friend down anywhere for nothing, so the
                // irreversible half is the ordinary case and this is the one
                // that pays. The gold in the label is the whole warning.
                className="rounded border border-edge px-2 py-1.5 text-left text-xs text-ink transition hover:border-ochre disabled:opacity-50"
              >
                Oddaj Kartę za {parts.cena} Sz. Z. — {name} zostaje tutaj
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
