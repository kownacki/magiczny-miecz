"use client";

/**
 * What the app knows a card does, formalised — the lines beside the picture.
 *
 * Four groups in one order, and the order is an argument: what the card asks of
 * you first, then what it gives, then what using it does once, then the rules
 * the app states and leaves to you. A card you may not hold is not a card whose
 * bonuses matter.
 *
 * Lifted out of the hover panel so that the Obszar can say the same thing. What
 * is lying on a field was described by its printed prose, clamped to two lines
 * — which is the half of a sentence that fits, ending in an ellipsis, when the
 * question being asked is "is this worth ending my move here for". These lines
 * answer it in a phrase.
 */

import { createContext, useContext } from "react";
import type { ItemProfile, Reader } from "@/lib/engine/abilityText";
import { forbiddenNatures, requirementOf } from "@/lib/engine/abilityText";
import type { Nature } from "@/data/types";
import { sentence } from "@/lib/engine/polish";
import { WithRules } from "./rule-ref";

/** Whether there is any formalised line at all, or only the printed prose. */
export function hasFacts(profile: ItemProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.visit !== null ||
    profile.facts.length > 0 ||
    profile.requirements.length > 0 ||
    profile.special.length > 0 ||
    profile.notes.length > 0
  );
}

/**
 * Whom a Karta's conditions are being read *for*.
 *
 * Usually the viewer — a hover in the Księga is somebody looking a card up, and
 * the question is whether it has anything on them. Not always: the Karty being
 * worked through on an Obszar were dealt to whoever is having the turn, and a
 * WRÓŻKA in that kolejka is a WRÓŻKA for *them*. The sheet provides the active
 * seat over its own subtree and everything under it answers about that Postać.
 *
 * A context and not a prop, because this panel is reached from nine places —
 * every tile, every slot, the Księga, the piles, a figure on the board — and
 * threading the reader through all nine is plumbing nobody maintains. `nature`
 * stays a prop as well, because half those call sites pass a Natura that is
 * nobody's — a Postać card in the picker, a card looked up outside a game.
 *
 * Null is the default and means unknown: the lines are then muted and say
 * nothing about anybody.
 */
export const TheReader = createContext<Reader | null>(null);

export function CardFacts({
  cardId,
  profile,
  /** Who is looking, so a requirement can say whether THEY meet it. */
  nature,
}: {
  cardId: string;
  profile: ItemProfile;
  nature: Nature | null;
}) {
  // 5.3, answered for the reader rather than stated in the abstract.
  const barred = nature !== null && (forbiddenNatures(cardId)?.includes(nature) ?? false);

  /**
   * The Karta's own condition, from wherever it is written.
   *
   * `profile.requirements` is 5.3's, off the abilities, and a Nieznajomy's
   * lives in its script instead — so the CZARODZIEJ, „Każda Dobra Postać,
   * która tu zawita", said nothing here at all. One question for the reader,
   * one answer, and the same two colours as the Przedmioty.
   */
  const reader = useContext(TheReader);
  const needs = requirementOf(cardId, reader ?? { nature });
  const passes =
    needs === null || needs.met === null
      ? "text-muted"
      : needs.met
        ? "text-verdigris"
        : "text-vermilion";

  return (
    <>
      {/* How long it is here, before anything else the Karta does. Coloured
          like an item's „gdy założony", because it is the same kind of
          statement: not what the card gives, but the terms it gives it on. */}
      {profile.visit !== null && (
        <p
          className={`border-t border-edge/60 pt-2 text-[11px] leading-snug ${
            "text-magia/80"
          }`}
        >
          {sentence(profile.visit)}
        </p>
      )}

      {/* The Karta's condition, where the line above has not already folded it
          in — „czeka tu na pierwszą Dobrą Postać" says both at once. */}
      {needs && (
        <p className={`border-t border-edge/60 pt-2 text-[11px] leading-snug ${passes}`}>
          {/* Only the answer is hoverable: „tylko Postać" is the question and
              has nothing to explain, and dotting the whole line offers a
              tooltip on the half that does not have one. Dotted only where
              there is something under it, since a line that looks hoverable and
              answers nothing is worse than a plain one. */}
          {sentence(needs.label)}:{" "}
          <span
            className={needs.detail ? "cursor-help underline decoration-dotted underline-offset-2" : ""}
            title={needs.detail}
          >
            {needs.value}
          </span>
        </p>
      )}

      {/* What it asks before it gives. Above the bonuses on purpose: a card
          you may not hold is not a card whose bonuses matter.

          Green or red by whether the person reading it passes — the useful
          question is not "does this have a restriction" but "does it shut
          ME out", and the answer is known. Neutral only when no Natura is
          known, which is the shelf read from outside a game. */}
      {profile.requirements.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
          {profile.requirements.map((need, at) => (
            <li
              key={at}
              className={`text-[11px] leading-snug ${
                nature === null ? "text-muted" : barred ? "text-vermilion" : "text-verdigris"
              }`}
            >
              <WithRules text={sentence(need.what)} />
            </li>
          ))}
        </ul>
      )}

      {profile.facts.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-edge/60 pt-2">
          {profile.facts.map((fact, at) => (
            <li key={at} className="flex flex-col text-[11px] leading-snug">
              <span className="text-ink">
                <WithRules text={sentence(fact.what)} />
              </span>
              {/* Only where there is a condition to meet, and there can be
                  two: a MIECZ has to be in your hand *and* only counts in a
                  fight, and neither of those implies the other. Almost
                  everything simply has to be on you, and saying so every
                  time said nothing. */}
              {fact.when.length > 0 && (
                <span className="text-magia/80">
                  <WithRules text={sentence(fact.when.join(", "))} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* What using it does, once — as opposed to what holding it gives. */}
      {profile.special.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
          {profile.special.map((line, at) =>
            /* An empty row is a group break — see `effectRows`. Drawn as space
               rather than as a rule, because the two groups are one card's
               doing and a divider would read as a second card. */
            line === "" ? (
              <li key={at} className="h-1.5" aria-hidden />
            ) : (
              <li key={at} className="text-[11px] leading-snug text-ochre/90">
                <WithRules text={sentence(line)} />
              </li>
            ),
          )}
        </ul>
      )}

      {/* Rules the app states but does not apply. Marked, because at a table
          the difference is who has to remember them. */}
      {profile.notes.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
          {profile.notes.map((note, at) => (
            <li key={at} className="text-[11px] leading-snug text-ochre/90">
              <WithRules text={sentence(note)} />
              {at === 0 && <span className="ml-1 text-[10px] text-muted/70">· pilnujesz sam</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
