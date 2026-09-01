"use client";


/** A field that trades: the Płatnerz's price list, the Medyk's wounds and the Lichwiarz's offer, each with the thing it does attached to a button. */

import { useState } from "react";
import { scriptFor, type Effect } from "@/lib/engine/cardScript";
import { fieldScriptFor, residesOn, trades } from "@/lib/engine/fieldScript";
import { goodsId } from "@/lib/engine/goods";
import { HEAL_CEILING } from "@/lib/engine/derive";
import { cardName, plural } from "@/lib/engine/polish";
import { drawsFromPool, startingPool } from "@/lib/engine/pools";
import type { FieldId } from "@/lib/engine/board";
import { EffectControls } from "./effect-controls";
import type { OnService, OnSuggestion } from "./turn-controls";

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
/** What the three wells lay out, in the case the sentence needs. */
const POOL_OF: Record<"life" | "sword" | "magic", string> = {
  life: "Życia",
  sword: "Miecza",
  magic: "Magii",
};

export function FieldServices({
  fieldId,
  fieldCards,
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
  /**
   * The Karty lying here, with what is left beside a well.
   *
   * Ids alone until a Miejsce needed to say how much of itself was left — a
   * Drzewo Życia with one fruit on it is a different offer from one with four,
   * and the count is the Karta's rather than the square's.
   */
  fieldCards: { cardId: string; pool?: number }[];
  busy: boolean;
  /** The other face of `Simulated`: true at a physical table, where a die may be typed in rather than thrown. */
  typedRolls: boolean;
  onRollOffer: (offer: string) => void;
  purse?: { gold: number; life: number };
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  onSuggestion: OnSuggestion;
  onService?: OnService;
}) {
  /**
   * The Karty that have settled here and are things you may go and do.
   *
   * A shop that arrived on a Karta is not a different kind of shop from one
   * printed on the board — the Targowisko sells eight Przedmioty off a square
   * it landed on — and a healer is not a different kind of healer either. The
   * Cudotwórca lives on his Obszar "do końca rozgrywki" and gives two punkty
   * Życia "podczas każdych odwiedzin", which is the Osada's Medyk with no board
   * printed under him. Both belong in this box with the same buttons.
   *
   * `residesOn` is the wider question and `trades` the older, narrower one:
   * every shop is a resident, but the Czarodziej and the Sztukmistrz sell
   * nothing `kup` understands and were left out while the test was "does it
   * trade". Asked as `||` rather than replaced, because a Karta can trade
   * without staying — nothing in the base game does, and the two questions are
   * still not the same question.
   */
  const fromCards = fieldCards.flatMap(({ cardId, pool }) => {
    const script = scriptFor(cardId);
    if (!script) return [];
    if (!trades(script.effect) && !residesOn(cardId)) return [];
    /**
     * "Po znalezieniu Drzewa, połóż przy nim 4 punkty Życia [...] Po
     * wykorzystaniu 4 punktów, Drzewo usycha."
     *
     * Said on the offer, because it is the offer: a well with one fruit left is
     * a different thing to walk to than one with four, and until now the number
     * lived on a database row that nothing on screen ever asked. A row written
     * before the column reads as full, the same way `afterVisit` reads it.
     */
    const left = drawsFromPool(cardId) ? (pool ?? startingPool(cardId)) : null;
    const beside =
      left === null || script.disposition.kind !== "zostaje-z-pula"
        ? null
        : `${left} ${plural(left, "punkt", "punkty", "punktów")} ${POOL_OF[script.disposition.stat]}`;
    return [
      {
        name: beside === null ? cardName(cardId) : `${cardName(cardId)} — ${beside}`,
        effect: script.effect,
      },
    ];
  });
  const script = fieldScriptFor(fieldId);
  // A compulsory field is not offered here: "MUSISZ RZUCIĆ KOSTKĄ" happens to
  // you, which puts it in the modal with the drawn cards, where the whole table
  // can watch and where nobody can re-equip halfway through. What stays is the
  // visiting — "MOŻESZ TU ODWIEDZIĆ" — because deciding not to go in is a real
  // answer and nobody else needs to watch you decline.
  const offers = [...(script?.obowiazkowe ? [] : (script?.offers ?? [])), ...fromCards];
  if (offers.length === 0) return null;
  const gold = purse?.gold ?? 0;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-wide text-ochre/80">
        {script?.obowiazkowe ? "To pole trzeba rozpatrzeć" : "Możesz tu odwiedzić"}
        {purse && (
          <span className="ml-2 normal-case tracking-normal text-muted">
            masz <span className="tnum text-zloto">{purse.gold} Sz. Z.</span>
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
            life={purse?.life ?? 0}
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
  life,
  stock,
  sellable,
  onSuggestion,
  onService,
}: {
  effect: Effect;
  name: string;
  busy: boolean;
  /** The other face of `Simulated`: true at a physical table, where a die may be typed in rather than thrown. */
  typedRolls: boolean;
  onRollOffer?: () => void;
  gold: number;
  life: number;
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  onSuggestion: OnSuggestion;
  onService?: OnService;
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
            life={life}
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
        life={life}
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
              {cardName(held.cardId)} → <span className="tnum text-zloto">+{effect.cena}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (effect.op === "uzdrow" && onService) {
    const price = effect.cena ?? 0;
    const missing = Math.max(0, HEAL_CEILING - life);
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
  life,
  stock,
  sellable,
  onSuggestion,
  onService,
}: {
  effect: Extract<Effect, { op: "rzut" }>;
  name: string;
  busy: boolean;
  /** The other face of `Simulated`: true at a physical table, where a die may be typed in rather than thrown. */
  typedRolls: boolean;
  /** Asks the server to throw this offer's die and apply the row. */
  onRollOffer?: () => void;
  gold: number;
  life: number;
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  onSuggestion: OnSuggestion;
  onService?: OnService;
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
              life={life}
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
