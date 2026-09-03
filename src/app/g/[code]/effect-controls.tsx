"use client";

/** A card's or a field's script drawn as controls: what the app can apply for you becomes a button, and what it cannot is stated. */

import { Rules } from "./rule-ref";

import { type Effect } from "@/lib/engine/cardScript";
import { FIELDS } from "@/lib/engine/board";
import { andWhom, describeCondition, describeLoss } from "@/lib/engine/effectText";
import { characterName, STAT_LABEL } from "@/lib/engine/polish";
import type { OnSuggestion } from "./turn-controls";
import { ActionButton } from "./action-button";

/**
 * The buttons for one effect.
 *
 * Recursive, because the effects are: a die table's face can be a fight, a
 * wish's option can be a teleport. Anything the app cannot apply on its own —
 * a move, a fight, a Nature change — is stated rather than offered, since those
 * already have their own controls elsewhere in the turn.
 */
export function EffectControls({
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
  onSuggestion: OnSuggestion;
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
      {/* Here rather than at the call sites: a dozen of these are built from
          template strings and four happen to cite a rule, and which four is
          not a thing worth keeping track of. */}
      <Rules>{text}</Rules>
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
        return stated(`${label}${andWhom(effect.target)}`);
      }
      if (applied) return stated(label);
      return (
        <ActionButton
          role="gain"
          size="xs"
          disabled={busy}
          onClick={() => onSuggestion(effect.stat, effect.delta, cardName)}
        >
          {label}
        </ActionButton>
      );
    }
    case "uzdrow":
      return stated(`uzdrowienie do ${effect.upTo} punktów Życia (nie ponad start, 4.7)`);
    case "tura-stracona":
      if (applied) return stated(`−${effect.turns} tura`);
      return effect.target && effect.target !== "ty" ? (
        stated(
          `−${effect.turns} tura${andWhom(effect.target)}` +
            (effect.oprocz?.length
              ? `, oprócz: ${effect.oprocz.map(characterName).join(", ")}`
              : ""),
        )
      ) : (
        <ActionButton
          role="harm"
          size="xs"
          disabled={busy}
          onClick={() => onSuggestion("tury", effect.turns, cardName)}
        >
          −{effect.turns} tura
        </ActionButton>
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
      /**
       * Whose loss it is, said out loud — like the two cases above it.
       *
       * `punkty` and `tura-stracona` both name a target that is not you, and
       * `strata` did not: it was the one effect in this switch that takes cards
       * away and the one that never said whose. Burza Siedmiu Słońc is
       * `{ co: "wszystkie-zaklecia", target: "wszyscy" }`, and the panel read
       * "tracisz wszystkie Zaklęcia" — a storm that ends the magic in the world
       * looking like a bad afternoon for whoever drew it.
       */
      return stated(`${describeLoss(effect)}${andWhom(effect.target)}`);
    case "kamien":
      return stated("Zamiana w Kamień (20.1)");
    case "zamien-punkty":
      // 1.3 and 2.3 still hold on both sides of the swap, which is what makes
      // it a decision rather than a free re-roll of the character sheet. The
      // direction is settled by now — it is what the player chose off the
      // Kuglarz's three — so this states one trade rather than offering both.
      return stated(
        effect.z === "sword"
          ? "zamiana punktów Miecza na punkty Magii (nie poniżej wartości początkowych)"
          : "zamiana punktów Magii na punkty Miecza (nie poniżej wartości początkowych)",
      );
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
      return stated(`zmiana Natury na: ${effect.na === "evil" ? "zła" : effect.na}`);
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
            prefix={`${describeCondition(effect.warunek)}: `}
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
