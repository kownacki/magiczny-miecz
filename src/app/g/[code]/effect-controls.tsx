"use client";

/** A card's or a field's script, read out: what each face of it does, in plain words. */

import { Rules } from "./rule-ref";

import { type Effect } from "@/lib/engine/cardScript";
import { FIELDS } from "@/lib/engine/board";
import { andWhom, describeCondition, describeLoss } from "@/lib/engine/effectText";
import { characterName, STAT_LABEL } from "@/lib/engine/polish";

/**
 * What one effect says, drawn.
 *
 * Recursive, because the effects are: a die table's face can be a fight, a
 * wish's option can be a teleport.
 *
 * Nothing here is a button. The app applies every script itself — the server
 * throws the die, takes the row and writes the result — so this is the reading
 * of what a face does, before and after it happens. A control that applied
 * "−1 Złota" a second time would not be an affordance but a trap.
 */
export function EffectControls({
  effect,
  prefix = "",
}: {
  effect: Effect;
  prefix?: string;
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
            <EffectControls key={i} effect={step} prefix={prefix} />
          ))}
        </div>
      );
    case "wybor":
      return (
        <div>
          <p className="mb-1 text-[11px] text-muted">{prefix}Wybierz jedno:</p>
          <div className="flex flex-wrap gap-1">
            {effect.options.map((option) => (
              <EffectControls key={option.label} effect={option.effect} />
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
                <EffectControls effect={effect.faces[face]} />
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
      return stated(label);
    }
    case "uzdrow":
      return stated(`uzdrowienie do ${effect.upTo} punktów Życia (nie ponad start, 4.7)`);
    case "tura-stracona":
      return stated(
        effect.target && effect.target !== "ty"
          ? `−${effect.turns} tura${andWhom(effect.target)}` +
              (effect.oprocz?.length
                ? `, oprócz: ${effect.oprocz.map(characterName).join(", ")}`
                : "")
          : `−${effect.turns} tura`,
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
            <EffectControls effect={effect.nagroda} />
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
            prefix={`${describeCondition(effect.warunek)}: `}
          />
          {effect.inaczej && (
            <EffectControls effect={effect.inaczej} prefix="w przeciwnym razie: " />
          )}
        </div>
      );
  }
}
