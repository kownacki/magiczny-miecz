"use client";

/** One offer, opened: the Płatnerz's shelf, the Medyk's wounds, the Lichwiarz's desk — each with the thing it does attached to a button. */

import { useState } from "react";
import type { Effect } from "@/lib/engine/cardScript";
import { HEAL_CEILING } from "@/lib/engine/derive";
import { cardName } from "@/lib/engine/polish";
import type { CardId } from "@/data/ids";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import type { Holding } from "@/lib/engine/state";
import { EffectControls } from "./effect-controls";
import { Shop } from "./shop";
import type { Confirmation } from "./confirm";
import type { Offer } from "./field-offers";
import type { OnService, OnSuggestion } from "./turn-controls";

/**
 * Everything the controls under an offer need, gathered into one.
 *
 * `ServiceEffect` walks into itself twice — through a `po-kolei`'s steps and a
 * die table's six faces — and every prop it needs has to make both journeys.
 * Passed one at a time that was twelve names repeated at four call sites, where
 * the compiler will happily let a new one reach three of them; the Zamek's
 * healer is a `po-kolei` and its second step is a `rzut`, so anything dropped
 * on either hop is dropped exactly where a purchase is being made.
 */
export interface OfferContext {
  busy: boolean;
  /** The other face of `Simulated`: true at a physical table, where a die may be typed in rather than thrown. */
  typedRolls: boolean;
  /** Asks the server to throw this offer's die and apply the row. */
  onRollOffer: () => void;
  gold: number;
  life: number;
  /** How many of each Wyposażenie card are left in the box (21.2). */
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  /** What the buyer holds and how much room 5.4 leaves them — see `whyPackIsFull`. */
  pack?: { holdings: readonly Holding[]; carried: number; limit: number; eqMode: EqMode };
  /**
   * Why nothing here can be acted on, or null when it can.
   *
   * 13.1's window and 12.1's two exceptions, in the words the server refuses
   * with — see `whyNotCollectHere`. The offer is still readable: what is shut
   * is the buttons.
   */
  blocked: string | null;
  eqMode?: EqMode;
  nature?: Nature | null;
  onInspect: (cardId: CardId) => void;
  /** Raises the app's one "are you sure?" — spending is irreversible. */
  onAsk: (ask: Confirmation) => void;
  onSuggestion: OnSuggestion;
  onService?: OnService;
}

/**
 * An offer, opened.
 *
 * The board's own sentence for it, what you are carrying to spend, and the
 * thing it does with a button on it. Nothing else: this replaces the window's
 * body, so what is not about the Płatnerz is one tap back rather than under
 * him.
 */
export function FieldService({ offer, ctx }: { offer: Offer; ctx: OfferContext }) {
  return (
    <div className="flex flex-col gap-3">
      {/**
       * Why nothing here can be done, said once and said first.
       *
       * It used to hang off each control — over the shop's shelf, over the
       * healer's wounds, over a die table — which on the Zamek's Nadworny Medyk
       * is one `po-kolei` of two steps and so the same sentence twice, in a
       * row, about one refusal. It is a fact about the whole visit: 13.1 shuts
       * the Obszar and 12.1's exceptions shut everything on it. So it belongs
       * under the name of whoever you walked up to, above what they offer,
       * where it reads as the answer to "why are these dead" before the reader
       * has had to ask.
       */}
      {ctx.blocked && <p className="text-[11px] text-vermilion/90">{ctx.blocked}</p>}

      {/* The board, before the app's reading of it. A player who thinks the
          referee has it wrong can check without leaving the shop. */}
      {offer.text && (
        <p className="whitespace-pre-line text-xs leading-relaxed text-muted">{offer.text}</p>
      )}

      <ServiceEffect effect={offer.effect} name={offer.label} ctx={ctx} />
    </div>
  );
}

/** The trading operations, with everything else handed to `EffectControls`. */
function ServiceEffect({
  effect,
  name,
  ctx,
}: {
  effect: Effect;
  name: string;
  ctx: OfferContext;
}) {
  if (effect.op === "po-kolei") {
    return (
      <div className="flex flex-col gap-2">
        {effect.steps.map((step, i) => (
          <ServiceEffect key={i} effect={step} name={name} ctx={ctx} />
        ))}
      </div>
    );
  }

  // A scripted die table keeps the affordance the prose reader had: roll here,
  // or tap the face that came up on a real die. Local state, because this is a
  // lookup — what the face *does* is still applied through its own control, so
  // the referee never silently decides a player's outcome.
  if (effect.op === "rzut") {
    return <ScriptedRoll effect={effect} name={name} ctx={ctx} />;
  }

  if (effect.op === "kup") {
    return (
      <Shop
        effect={effect}
        gold={ctx.gold}
        stock={ctx.stock}
        pack={ctx.pack}
        blocked={ctx.blocked}
        busy={ctx.busy}
        eqMode={ctx.eqMode}
        nature={ctx.nature}
        onInspect={ctx.onInspect}
        onAsk={ctx.onAsk}
        onService={ctx.onService}
      />
    );
  }

  if (effect.op === "sprzedaj") {
    if (!ctx.sellable?.length) {
      return <p className="text-[11px] text-muted">Nie masz Przedmiotów na sprzedaż.</p>;
    }
    return (
      <div className="flex flex-col gap-2">
        <ul className="flex flex-wrap gap-1">
          {ctx.sellable.map((held) => (
            <li key={held.id}>
              <button
                disabled={ctx.busy || ctx.blocked !== null}
                onClick={() =>
                  ctx.onAsk({
                    title: `Sprzedaj: ${cardName(held.cardId)}`,
                    // "proces ten jest nieodwracalny" — the Lichwiarz's own
                    // words, and the reason this is asked at all.
                    body: `${cardName(held.cardId)} przejdzie na stos za ${effect.cena} Sz. Z. Tego nie da się cofnąć.`,
                    confirmLabel: "Sprzedaj",
                    tone: "grave",
                    onConfirm: () => ctx.onService?.({ action: "sell", holdingId: held.id }),
                  })
                }
                className="rounded border border-zloto/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-zloto/20 disabled:opacity-40"
              >
                {cardName(held.cardId)} → <span className="tnum text-zloto">+{effect.cena}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (effect.op === "uzdrow") {
    const price = effect.cena ?? 0;
    const missing = Math.max(0, HEAL_CEILING - ctx.life);
    const affordable = price > 0 ? Math.floor(ctx.gold / price) : missing;
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
              disabled={ctx.busy || ctx.blocked !== null}
              onClick={() =>
                price === 0
                  ? ctx.onService?.({ action: "heal-paid", points })
                  : ctx.onAsk({
                      title: "Zapłać za leczenie",
                      body: `${points * price} Sz. Z. za ${points} ${
                        points === 1 ? "punkt" : points < 5 ? "punkty" : "punktów"
                      } Życia. Zostanie ci ${ctx.gold - points * price} z ${ctx.gold}.`,
                      confirmLabel: "Zapłać",
                      onConfirm: () => ctx.onService?.({ action: "heal-paid", points }),
                    })
              }
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
      busy={ctx.busy}
      onSuggestion={ctx.onSuggestion}
      applied={!ctx.typedRolls}
    />
  );
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
  ctx,
}: {
  effect: Extract<Effect, { op: "rzut" }>;
  name: string;
  ctx: OfferContext;
}) {
  const [rolled, setRolled] = useState<number | null>(null);
  // Nothing is picked out for the player in a simulation: the app rolled and
  // acted, and the notice above says what came of it. Showing one face as
  // "yours" here would invite a second, contradictory click.
  const faces = rolled === null || !ctx.typedRolls ? [1, 2, 3, 4, 5, 6] : [rolled];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] text-muted">Rzuć kostką:</span>
        <button
          disabled={ctx.busy || ctx.blocked !== null}
          onClick={() =>
            ctx.typedRolls ? setRolled(1 + Math.floor(Math.random() * 6)) : ctx.onRollOffer()
          }
          className="rounded border border-edge px-2 py-0.5 text-[11px] text-ink transition hover:border-ochre disabled:opacity-50"
        >
          Rzuć
        </button>
        {ctx.typedRolls &&
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
            <ServiceEffect effect={effect.faces[face]} name={name} ctx={ctx} />
          </li>
        ))}
      </ol>
    </div>
  );
}
