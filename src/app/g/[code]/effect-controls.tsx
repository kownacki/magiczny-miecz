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
    case "nothing":
      return stated("nic się nie dzieje");
    case "sequence":
      return (
        <div className="flex flex-col gap-1">
          {effect.steps.map((step, i) => (
            <EffectControls key={i} effect={step} prefix={prefix} />
          ))}
        </div>
      );
    case "choice":
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
    case "roll":
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
    case "points": {
      const label = `${effect.delta > 0 ? "+" : "−"}${Math.abs(effect.delta)} ${STAT_LABEL[effect.stat]}`;
      if (effect.target && effect.target !== "you") {
        return stated(`${label}${andWhom(effect.target)}`);
      }
      return stated(label);
    }
    case "heal":
      return stated(`uzdrowienie do ${effect.upTo} punktów Życia (nie ponad start, 4.7)`);
    case "lose-turn":
      return stated(
        effect.target && effect.target !== "you"
          ? `−${effect.turns} tura${andWhom(effect.target)}` +
              (effect.except?.length
                ? `, oprócz: ${effect.except.map(characterName).join(", ")}`
                : "")
          : `−${effect.turns} tura`,
      );
    case "extra-move":
      return stated("dodatkowy ruch");
    case "gain-spell":
      return stated(`+${effect.count} Zaklęcie`);
    case "spells-to-limit":
      return stated("Zaklęcia do limitu twojej Magii (2.6)");
    case "move":
      return stated(
        effect.to.kind === "field"
          ? `przenieś się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`
          : effect.to.kind === "anywhere-in-ring"
            ? "przenieś się na dowolny Obszar w tym Kręgu"
            : "wracasz tam, skąd zacząłeś ruch",
      );
    case "draw-cards":
      return stated(`wyciągnij ${effect.count} Karty`);
    case "fight":
      return stated(
        `walka: ${effect.name} (${effect.sword !== undefined ? `Miecz ${effect.sword}` : `Magia ${effect.magic}`})`,
      );
    case "lose":
      /**
       * Whose loss it is, said out loud — like the two cases above it.
       *
       * `points` and `lose-turn` both name a target that is not you, and
       * `lose` did not: it was the one effect in this switch that takes cards
       * away and the one that never said whose. Burza Siedmiu Słońc is
       * `{ what: "all-spells", target: "everyone" }`, and the panel read
       * "tracisz wszystkie Zaklęcia" — a storm that ends the magic in the world
       * looking like a bad afternoon for whoever drew it.
       */
      return stated(`${describeLoss(effect)}${andWhom(effect.target)}`);
    case "stone":
      return stated("Zamiana w Kamień (20.1)");
    case "swap-points":
      // 1.3 and 2.3 still hold on both sides of the swap, which is what makes
      // it a decision rather than a free re-roll of the character sheet. The
      // direction is settled by now — it is what the player chose off the
      // Kuglarz's three — so this states one trade rather than offering both.
      return stated(
        effect.from === "sword"
          ? "zamiana punktów Miecza na punkty Magii (nie poniżej wartości początkowych)"
          : "zamiana punktów Magii na punkty Miecza (nie poniżej wartości początkowych)",
      );
    case "guess":
      return (
        <div>
          <p className="text-[11px] text-muted">
            {prefix}Powiedz na głos cyfrę od 1 do 6, potem rzuć. Trafienie:
          </p>
          <div className="mt-0.5">
            <EffectControls effect={effect.prize} />
          </div>
        </div>
      );
    case "set-nature":
      return stated(`zmiana Natury na: ${effect.to === "evil" ? "zła" : effect.to}`);
    case "buy":
      return (
        <div>
          <p className="text-[11px] text-muted">{prefix}Możesz kupić:</p>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {effect.goods.map((good) => (
              <li key={good.name} className="text-[11px] text-ink">
                {good.name}{" "}
                <span className="text-zloto">
                  {good.price} Sz. Z.
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "sell":
      return stated(`skup Przedmiotów: ${effect.price} Sz. Z. za sztukę`);
    case "as-field":
      return stated(
        `modlisz się na zasadach z: ${FIELDS.get(effect.fieldId)?.name ?? effect.fieldId}`,
      );
    case "place-card":
      return stated(
        effect.where.kind === "field"
          ? `połóż Kartę na: ${FIELDS.get(effect.where.fieldId)?.name ?? effect.where.fieldId}`
          : effect.where.kind === "one-of"
            ? `połóż Kartę na wolnym z: ${effect.where.fieldIds
                .map((id) => FIELDS.get(id)?.name ?? id)
                .filter((name, i, all) => all.indexOf(name) === i)
                .join(", ")}`
            : "połóż Kartę",
      );
    case "receive":
      return stated(`otrzymujesz: ${effect.what}`);
    case "when":
      return (
        <div className="flex flex-col gap-1">
          <EffectControls
            effect={effect.then}
            prefix={`${describeCondition(effect.condition)}: `}
          />
          {effect.else && (
            <EffectControls effect={effect.else} prefix="w przeciwnym razie: " />
          )}
        </div>
      );
  }
}
