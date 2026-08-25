"use client";

import { useEffect } from "react";
import Image from "next/image";
import { fieldWithText } from "@/lib/engine/fieldText";
import { cardArtUrl, cardImageUrl } from "@/lib/engine/cardImages";
import { useCardPreview } from "./card-preview";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import { kindForCard } from "@/lib/engine/holdings";
import type { FieldId } from "@/lib/engine/board";
import { crossingFrom } from "@/lib/engine/rings";
import { BRIDGE_ORDEAL } from "@/lib/engine/bridge";
import { fieldScriptFor } from "@/lib/engine/fieldScript";
import { BridgeOrdeal, Crossing, Ferry, FieldServices } from "./turn-panel";
import { isFerry } from "@/lib/engine/board";
import { RollTable } from "./roll-table";
import type { CardId } from "@/data/ids";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";

const EVENTS = events as EventCard[];

/**
 * Both decks a field can hold.
 *
 * Not only Karty Zdarzeń: 21.3 lets a Magiczny Miecz or a Tarcza Tolimana be
 * left on the board like anything else, and those are Wyposażenie — they have
 * ids the event deck has never heard of. Looking in one place showed the raw id
 * for exactly the cards worth leaving behind.
 */
const NAMES = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.name] as const),
  ...(items as Item[]).map((c) => [c.id, c.name] as const),
]);
const TEXTS = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.text] as const),
  ...(items as Item[]).map((c) => [c.id, c.text ?? ""] as const),
]);
/** Only the event deck carries the class that says whether a card is takeable. */
const EVENT_BY_ID = new Map(EVENTS.map((card) => [card.id, card]));

export interface FieldCardHere {
  id: string;
  cardId: CardId;
}

/**
 * A field, opened.
 *
 * The map can only ever be a summary — a name, some dots, one small picture —
 * and the questions a player actually has about a field are longer than that:
 * what does it say, what is lying on it, can I have any of it. So tapping one
 * opens it properly rather than filling in a panel somewhere off to the side,
 * which is where this lived before and where nobody looked.
 *
 * Cards lying here are drawn from their own illustrations at a size you can
 * recognise, because 16.8's whole point is that they are face up: what is
 * waiting on a field is public information and part of everybody's next
 * decision, not a surprise for whoever lands there.
 */
export function FieldModal({
  eqMode = "klasyczny",
  nature = null,
  fieldId,
  cards,
  standingHere,
  canAct,
  busy,
  onTake,
  onInspect,
  onClose,
  phase,
  simulated = true,
  typedRolls = false,
  onAction,
  onSuggestion,
  onService,
  purse,
  stock,
  sellable,
}: {
  /** Which variant the table plays, so a hover can say where a card must be. */
  eqMode?: EqMode;
  nature?: Nature | null;
  fieldId: FieldId;
  cards: FieldCardHere[];
  /** Whether the viewer's own character is on this field (12.1, 13.1). */
  standingHere: boolean;
  /** Whether it is their turn to be doing anything about it. */
  canAct: boolean;
  /**
   * Everything the Obszar can be *done* about, which used to live in a panel
   * that grew down the page: its die table, its shops, the crossing it offers
   * and the ordeal it is. Optional, because this same window opens from a tap
   * on the map — reading about somewhere you are not standing is the other half
   * of what it is for, and none of these belong there.
   */
  phase?: string;
  simulated?: boolean;
  typedRolls?: boolean;
  onAction?: (body: Record<string, unknown>) => void;
  onSuggestion?: (stat: string, delta: number, reason: string) => void;
  onService?: (body: Record<string, unknown>) => void;
  purse?: { zloto: number; zycie: number };
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  busy: boolean;
  onTake: (fieldCardId: string) => void;
  onInspect: (cardId: CardId) => void;
  onClose: () => void;
}) {
  const field = fieldWithText(fieldId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!field) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={field.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      >
        <header className="flex items-baseline justify-between gap-3 border-b border-edge px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-ochre">
            {field.name}
          </h2>
          <button
            onClick={onClose}
            className="text-[11px] text-muted transition hover:text-ink"
          >
            zamknij
          </button>
        </header>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-3">
          <section>
            {field.draw ? (
              <p className="mb-1 text-[11px] uppercase tracking-wide text-verdigris">
                Wyciągnij {field.draw} {field.draw === 1 ? "kartę" : "karty"}
                {/* 13.4: what is already lying here counts against that number,
                    which is why a field that has silted up draws nothing. */}
                {cards.length > 0 && ` — leżą tu już ${cards.length}`}
              </p>
            ) : null}
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
              {field.text ?? "Brak przepisanego tekstu dla tego Obszaru."}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted">
              Leży tutaj
            </h3>
            {cards.length === 0 ? (
              <p className="text-xs text-muted/70">Nic — Obszar jest pusty.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {cards.map((lying) => {
                  const name = NAMES.get(lying.cardId) ?? lying.cardId;
                  const text = TEXTS.get(lying.cardId);
                  const art = cardArtUrl(lying.cardId) ?? cardImageUrl(lying.cardId);
                  // Only Przedmioty and Przyjaciele are picked up (12.1). A Wróg
                  // lying here is fought and a Spotkanie is read — and a card
                  // off the Wyposażenie sheet is always a Przedmiot.
                  const event = EVENT_BY_ID.get(lying.cardId as EventCard["id"]);
                  const takeable = event ? kindForCard(event) !== null : NAMES.has(lying.cardId);
                  return (
                    <li
                      key={lying.id}
                      className="flex items-center gap-3 rounded border border-edge/60 bg-night/40 p-2"
                    >
                      <LyingThumb
                        eqMode={eqMode}
                        nature={nature}
                        cardId={lying.cardId}
                        name={name}
                        text={text}
                        art={art}
                        onInspect={onInspect}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{name}</p>
                        <p className="line-clamp-2 text-[11px] leading-snug text-muted">
                          {text}
                        </p>
                      </div>
                      {takeable && standingHere && canAct && (
                        <button
                          disabled={busy}
                          onClick={() => onTake(lying.id)}
                          className="shrink-0 rounded border border-verdigris/50 px-2 py-1 text-[11px] text-ink transition hover:bg-verdigris/20 disabled:opacity-40"
                        >
                          Weź
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {/* 13.1 and 12.1: things happen on the field your move ended on, so
                a player reading about somewhere else is told why there is no
                button rather than left to wonder. */}
            {cards.length > 0 && !standingHere && (
              <p className="mt-2 text-[11px] text-muted/70">
                Zbierać można tylko z Obszaru, na którym się stoi (12.1).
              </p>
            )}
          </section>

          {/* What can be done here, for whoever is standing here on their own
              turn. Everyone can read the Obszar — at a table the others read it
              aloud and argue about it — but only the character on it acts.
              
              And only on the turn they arrived. 13.1 could not be plainer:
              "W żadnym przypadku nie mogą nikogo spotkać ani wogóle podejmować
              żadnych czynności na Obszarze, z którego rozpoczynają ruch." The
              field you begin a turn standing on is the one you finished the
              last turn on, and it is spent. `resolveFieldOffer` refuses it
              server-side too; this is so the button is not there to be pressed
              in the first place. */}
          {standingHere && canAct && onAction && phase === "pole" && (
            <section className="flex flex-col gap-3 border-t border-edge/60 pt-3">
              {/* 11.2's toll, which is a thing this Obszar asks of you and so
                  belongs with the rest of what it asks. */}
              {isFerry(fieldId) && <Ferry busy={busy} onAction={onAction} />}

              {/* The die table, where the field has one. */}
              {field.text && (
                <RollTable
                  text={field.text}
                  busy={busy}
                  typedRolls={typedRolls}
                  onSuggestion={onSuggestion}
                />
              )}

              {/* The ten fields that sell, buy or mend (and the shops that
                  arrive on a card and settle here). */}
              {fieldScriptFor(fieldId) && (
                <FieldServices
                  fieldId={fieldId}
                  fieldCardIds={cards.map((card) => card.cardId)}
                  busy={busy}
                  typedRolls={typedRolls}
                  onRollOffer={(offer) => onAction({ action: "pole-tabela", offer })}
                  purse={purse}
                  stock={stock}
                  sellable={sellable}
                  onSuggestion={onSuggestion ?? (() => {})}
                  onService={onService}
                />
              )}

            </section>
          )}

          {/* The two exceptions 13.1 makes room for, and the reason they are
              outside the gate above: 11.4 puts retrying a crossing in the next
              turn by name — "czy będzie ponownie próbowała przekroczyć granicę
              Kręgów" — and the Kamienny Most's ordeals are things you sit
              through more than once, because the Demon does not move and
              neither do you. Both are therefore offered before the roll as
              well as on arrival. */}
          {standingHere && canAct && onAction && (phase === "pole" || phase === "rzut") && (
            <section className="flex flex-col gap-3 border-t border-edge/60 pt-3">
              {crossingFrom(fieldId) && (
                <Crossing
                  crossing={crossingFrom(fieldId)!}
                  simulated={simulated}
                  busy={busy}
                  onAction={onAction}
                />
              )}
              {BRIDGE_ORDEAL.has(fieldId) && (
                <BridgeOrdeal fieldId={fieldId} busy={busy} onAction={onAction} />
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A card lying on the field, as a thumbnail with the whole card on hover.
 *
 * Its own component because the hover is a hook, and the list this sits in is a
 * map. Clicking still opens the full card — hover is the quick look, not the
 * only way in, and a touch screen has no hover at all.
 */
function LyingThumb({
  eqMode,
  nature,
  cardId,
  name,
  text,
  art,
  onInspect,
}: {
  eqMode: EqMode;
  nature: Nature | null;
  cardId: CardId;
  name: string;
  text: string | undefined;
  art: string | null;
  onInspect: (cardId: CardId) => void;
}) {
  const { handlers, preview } = useCardPreview({ cardId, name, text }, false, eqMode, nature);

  return (
    <>
      <button
        onClick={() => onInspect(cardId)}
        {...handlers}
        title="Pokaż całą Kartę"
        className="shrink-0 overflow-hidden rounded border border-edge transition hover:border-ochre"
      >
        {art ? (
          <Image
            src={art}
            alt={name}
            width={74}
            height={65}
            className="h-auto w-[74px]"
            unoptimized
          />
        ) : (
          <span className="block w-[74px] p-2 text-[10px] text-muted">{name}</span>
        )}
      </button>
      {preview}
    </>
  );
}
