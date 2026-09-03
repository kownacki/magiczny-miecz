"use client";

/**
 * What you may do about the Karta in front of you: every button under the sheet, and the decisions that pick which of them there are.
 */

/**
 * Why this is not in `drawn-card.tsx`.
 *
 * The sheet answers two questions that only look like one. Above this
 * component it says what the Karta *is* — its picture, its name, its class, its
 * slot, what it gives, whom it is for — and every line of that is drawn from
 * the card alone. Here it says what you may *do* about it, which is a different
 * question with different inputs: whose turn it is, what they have already
 * chosen, what the script is still asking, whether they can act at all.
 *
 * The two had grown into one 845-line component, and the seam was visible in
 * the props before it was visible anywhere else: every callback the sheet takes
 * and both pieces of its state were used only inside this block, and nothing
 * above it touched one. Ten mutually exclusive `canAct &&` branches is what a
 * turn's worth of decisions looks like; it does not want to be read in the same
 * pass as a paragraph about a Przedmiot's slot.
 *
 * So this owns its own decisions rather than taking them as props. `foe`,
 * `keep`, `asking`, `inert`, `skippable` and the rest are derived here, from
 * the same raw inputs the sheet gets, because they are only ever used to pick a
 * button. What crosses the boundary is what the table knows, not what somebody
 * has already concluded from it.
 *
 * The one thing that stayed behind is Escape. It leaves the Karta, so it looks
 * like it belongs here — but it is the *sheet's* shortcut and has to be bound
 * even for a card this app has never heard of, which is exactly the case where
 * the sheet renders nothing at all and this component is never reached.
 */

import { useContext, useState } from "react";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { classOf, combatValueOf, roundsOf } from "@/lib/engine/cards";
import { attackAsOne } from "@/lib/engine/combat";
import { listed } from "@/lib/engine/state";
import { kindForCard } from "@/lib/engine/holdings";
import { ActionButton } from "./action-button";
import { intentSaid, isIntentKind } from "@/lib/engine/intentText";
import { scriptFor } from "@/lib/engine/cardScript";
import { itemProfile, previewOf, requirementOf } from "@/lib/engine/abilityText";
import { fieldName, plural, sentence } from "@/lib/engine/polish";
import { mayWalkPast } from "@/lib/engine/kolejka";
import { TheReader, specialRows } from "./card-facts";
import { inertFor, pendingIn } from "@/lib/engine/resolve";
import { asFieldId, type FieldId } from "@/lib/engine/board";
import type { Confirmation } from "./confirm";
import type { Nature } from "@/data/types";
import type { EqMode } from "@/lib/engine/slots";
import type { TurnCard } from "@/lib/engine/state";

const EVENTS = events as EventCard[];

/**
 * Everything this needs, which is also everything the sheet above it needs
 * except its own chrome — see `DrawnCard`, whose props are these plus that.
 */
export interface DrawnActionsProps {
  who: string;
  /** Whether this device may press anything. The sheet reads it off `chrome`. */
  canAct: boolean;
  /** The one being dealt with: first of the stack that is neither settled nor fought. */
  card: TurnCard;
  /** In 15.2 order, which is the order they are dealt with. */
  cards: TurnCard[];
  resolved: string[];
  fought: string[];
  /** Wrogowie who died here (16.2) — struck in the kolejka, gone from the Obszar. */
  beaten?: string[];
  /** Fields the character could be sent to, for the cards that let it choose. */
  ring: FieldId[];
  /**
   * Where the other Postacie are standing, for the one Karta that may not be
   * put down on top of one — „nie zajętym przez inną Postać" (Lewiatan).
   *
   * Filtered here as well as on the server so that a player is not offered an
   * answer that will be refused, which is the same courtesy the move options
   * get.
   */
  occupied?: FieldId[];
  /**
   * What the character fights with (1.5), for the one Wróg who has no strength
   * of his own: the Sobowtór „posiada zawsze tyle punktów Miecza, ile jego
   * przeciwnik", so the button cannot say how strong he is without it.
   */
  mySword: number;
  /**
   * The active character's Natura, for the three Nieznajomi whose whole content
   * is behind a `gdy natura` — see `pendingIn`. Null while it is unknown, which
   * only puts the sheet back where it was.
   */
  nature: Nature | null;
  /**
   * Which equipment variant this table plays.
   *
   * Used here only for the rows a watcher is shown in place of the buttons:
   * they are `itemProfile`'s, and what a Przedmiot's bonus is conditional on
   * differs between the two variants.
   */
  eqMode: EqMode;
  /**
   * The active character's last act of aggression, in words, or null.
   *
   * Undefined where it is not known, which is what makes the Dobre Bóstwo's
   * line say nothing rather than say „no" — see `requirementOf`.
   */
  aggression?: string | null;
  busy: boolean;
  /**
   * What the acting player's button is about to do, while it is still filling.
   *
   * Only ever set on a device that is *watching*: the three seconds an
   * irreversible decision waits before it is sent (`channelling.ts`) are the
   * only moment between „nothing yet" and „it is done" that anybody else at the
   * table has ever had, and this is what fills them.
   */
  intent?: { kind: string; option?: number } | null;
  onResolve: (
    cardId: string,
    decisions: { choices?: number[]; destination?: FieldId },
  ) => void;
  /** One creature, or several at once when 17.5 lets them attack together. */
  onFight: (cardIds: string[]) => void;
  onEscape: () => void;
  onTake: (cardId: string) => void;
  /** Nothing to do with this one — it stays on the field (16.8). */
  onLeave: (cardId: string) => void;
  /** Raises the table's one „are you sure?" — see `ConfirmDialog`. */
  onAsk: (question: Omit<Confirmation, "tone">) => void;
}

/**
 * The one Obszar dropdown, in the three places a Karta asks for one.
 *
 * It was written out three times — same markup, same classes, same placeholder,
 * differing only in which fields it offers — and had already started to drift,
 * which is the argument `ActionButton` makes one file over about the buttons
 * beside it. `action-button.tsx` even pins this control's padding from the
 * outside ("Inline beside a `select`, whose own padding this matches"), so
 * three copies were three chances to break a promise made somewhere else.
 *
 * Module-level rather than inline, or the `select` is a new element type on
 * every render and loses focus mid-choice.
 *
 * `asFieldId` is the other half. A dropdown's value is a string from outside,
 * and this is the one place in the sheet where one becomes a `FieldId` —
 * narrowed once, at the boundary, the way CLAUDE.md's first non-negotiable asks
 * rather than asserted at each of three call sites.
 */
function ObszarPicker({
  among,
  value,
  onPick,
}: {
  among: readonly FieldId[];
  value: FieldId | "";
  onPick: (field: FieldId | "") => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onPick(asFieldId(event.target.value) ?? "")}
      className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink"
    >
      <option value="">— wybierz Obszar —</option>
      {among.map((fieldId) => (
        <option key={fieldId} value={fieldId}>
          {fieldName(fieldId)}
        </option>
      ))}
    </select>
  );
}

export function DrawnActions({
  who,
  canAct,
  card,
  cards,
  resolved,
  fought,
  beaten,
  ring,
  occupied = [],
  mySword,
  nature,
  eqMode,
  aggression,
  busy,
  intent,
  onResolve,
  onFight,
  onEscape,
  onTake,
  onLeave,
  onAsk,
}: DrawnActionsProps) {
  /**
   * Whom these Karty are being read for — the Postać they were dealt to.
   *
   * Supplied by the provider `page.tsx` wraps the whole sheet in, not by
   * anything here: the Karty on this Obszar were dealt to whoever is having the
   * turn, so every condition inside reads for them and not for the watcher.
   * See `TheReader`.
   */
  const reader = useContext(TheReader);
  // The choices made so far for the card on screen, as indices into its own
  // options. Sent back with the next attempt, so the server re-walks the card
  // and takes the branch rather than being handed an effect.
  const [choices, setChoices] = useState<number[]>([]);
  const [going, setGoing] = useState<FieldId | "">("");

  /**
   * A new Karta starts with nothing decided about it.
   *
   * Adjusted during the render rather than in an effect. React documents this
   * as the way to reset state when a prop changes, and the effect version cost
   * a second render of the whole sheet every time the stack moved on — the one
   * the lint rule is warning about.
   */
  const [decidingAbout, setDecidingAbout] = useState(card.cardId);
  if (card.cardId !== decidingAbout) {
    setDecidingAbout(card.cardId);
    setChoices([]);
    setGoing("");
  }

  const known = EVENTS.find((c) => c.id === card.cardId);
  if (!known) return null;

  const script = scriptFor(known.id);

  // Whose Miecz the Sobowtór borrows — see `combatValueOf`. Harmless for every
  // other creature, which carries its own number.
  const mirror = { miecz: mySword };
  const foe = combatValueOf(known, mirror);

  // 17.5: several creatures attacking at once are one opponent — their Miecze
  // added and one die thrown for the lot, which is the difference between hard
  // and hopeless. Only when they are of a kind: an ordinary Wróg and a magical
  // one cannot be summed, because the sums are of different things.
  const standing = cards
    /* The turn's own entry is kept beside the card, because `resolved` names a
       *copy* — two Wilki on one Obszar are two entries, and asking the lists
       with a bare id would settle both when one of them was dealt with. */
    .map((entry) => ({ entry, card: EVENTS.find((c) => c.id === entry.cardId) }))
    .filter(
      (one): one is { entry: (typeof cards)[number]; card: EventCard } =>
        !!one.card &&
        !!combatValueOf(one.card, mirror) &&
        !listed(fought, one.entry) &&
        !listed(resolved, one.entry),
    )
    .map((one) => one.card);
  // 17.5 asked once, of the engine, rather than restated here — the server
  // refuses a mixed fight against this same answer. A creature that is several
  // fights rather than one cannot be in the pack either: his card asks for
  // three comparisons and 17.5 offers one, so the button is not shown rather
  // than shown and refused.
  const asOne =
    standing.length > 1 && !standing.some((c) => roundsOf(c.id))
      ? attackAsOne(standing.map((c) => combatValueOf(c, mirror)!))
      : null;
  const keep = kindForCard(known);

  // What the card is still asking, walked down through the choices already
  // made. Null when there is nothing left to ask and the app can simply do it.
  const asking = script ? pendingIn(script.effect, choices, nature) : null;

  /* Kept for `inert` below: the line itself is `CardFacts`'s now, drawn from
     the same `requirementOf` against the same reader. What is asked here is
     narrower — not what the condition says, only whether this Postać fails it. */
  const needs = requirementOf(known.id, reader ?? { nature, aggression });

  /**
   * Nothing here for this Postać at all.
   *
   * A `gdy` whose condition they fail and whose other branch does nothing — the
   * WRÓŻKA met by a Zła Postać, the DOBRE BÓSTWO met by somebody who has raised
   * no hand. The shape is `inertFor`'s question and the verdict is
   * `requirementOf`'s; this only puts the two together.
   */
  const inert = inertFor(script?.effect, needs?.met === false);

  /**
   * Whose decision this is, as the table knows them — „Test (WIEDŹMA)".
   *
   * Everybody at the table is looking at this sheet and only one of them can
   * press anything, so every sentence in it has a second person and a third:
   * „Nie spełniasz warunków" for the one being asked, and the name for
   * everybody watching. Falling back to the player's name alone, for a device
   * that has not been told which Postać it is.
   */
  const actor = reader?.name ?? who;

  /**
   * What going somewhere else costs, said before it is chosen.
   *
   * 16.8's own worked example is the warning: Obbol is carried off the
   * Płaskowyż mid-deal and „nie zmierzy się już z Niedźwiedziem, ani nie
   * weźmie 2 Sztuk Złota — pozostaną one w formie odkrytej… stanowiąc 2 z 3
   * Kart dla następnej Postaci". Everything still standing on this Obszar is
   * forfeited at once: the rest of the kolejka, whatever is lying there, and
   * the Obszar's own desks.
   *
   * The count is the Karty this turn has not finished with, less the one being
   * resolved — it is going either way, „bez względu na to, czy skorzystasz".
   */
  const leavingHere = (to: FieldId) => {
    /* Asked through `listed`, like the pack above — `resolved` names a *copy*
       and `fought`/`beaten` name a card, and a bare `.includes` on the id gets
       the first of those wrong. Two Wilki on one Obszar are two Karty, and one
       of them being dealt with does not leave the other behind. */
    const left = cards.filter(
      (entry) =>
        entry.cardId !== known.id &&
        !listed(resolved, entry) &&
        !listed(fought, entry) &&
        !listed(beaten ?? [], entry),
    ).length;
    const stays =
      left > 0
        ? `Zostawiasz tu ${left} ${plural(left, "Kartę", "Karty", "Kart")} i wszystko, co na tym Obszarze leży — poczekają na następną Postać (16.8).`
        : "To, co na tym Obszarze leży, zostaje tu dla następnej Postaci (16.8).";
    return (
      `Obszar: ${fieldName(to)}. ${stays} ` +
      "Tam zaczniesz tak, jakby twój ruch skończył się na nowym Obszarze."
    );
  };

  /**
   * „Test (WIEDŹMA) wybiera: Tracisz 1 Sztukę Złota…"
   *
   * The option arrives as a number and is turned back into words *here*, out of
   * this device's own copy of the card — the same discipline as `Decisions`,
   * and the reason the sentence quotes the `Do wyboru:` line above it word for
   * word rather than approximately.
   *
   * The sender leaves the number out once it is already partway down a nested
   * question, because this end re-walks the script with its own (empty)
   * `choices` and would be pointing into a different list. „wybiera…" with no
   * option is the honest answer there, and better than a confident wrong one.
   */
  const chosen =
    intent?.option !== undefined && asking?.op === "wybor"
      ? (asking.options[intent.option]?.label ?? null)
      : null;
  const said =
    intent && isIntentKind(intent.kind)
      ? intentSaid(actor, intent.kind, chosen ? sentence(chosen) : null)
      : null;

  /**
   * No Wróg standing, nothing to pick up, and no question outstanding.
   *
   * Named because it is the condition two branches share and differ on only by
   * `inert` — written out twice, a fifth term would have had to be remembered
   * in both.
   */
  const nothingLeftToAsk = !foe && !keep && !asking;

  /**
   * Whether walking away is one of the answers.
   *
   * Never for a Nieznajomy: 16.5 is flat and every one of them either gives you
   * something or happens to you. A Miejsce says otherwise itself — „Jeżeli
   * chcesz do niej wejść, rzuć kostką" is the Grota's own sentence, and that
   * die costs a turn on 4 and starts a fight on 5 or 6.
   */
  const skippable = classOf(known.id) !== "stranger" && mayWalkPast(known.id);

  /**
   * What the rest of the table gets, where the buttons are.
   *
   * Returned early rather than guarded eight times over. Everything below this
   * line is one player's to press, and each branch used to say `canAct &&`
   * again — so the answer to "can anybody here do anything" was re-read ten
   * times down one component, and `offered` was written as a ternary whose job
   * was to be empty half the time.
   *
   * The choices themselves first, because that is what a table watching
   * somebody decide wants to see — the buttons are the acting player's and
   * everyone else was left with a picture and a name. Drawn by `specialRows`,
   * so they really are the rows the hover panel draws.
   *
   * Then who is deciding: an empty panel under a Karta says the app is
   * thinking, and it is not. One colour for the line's three readings, and a
   * step up in size — this is the only thing the rest of the table has to read,
   * and it was set smaller than the card's own small print.
   */
  if (!canAct) {
    const offered = itemProfile(known.id, eqMode).special;
    return (
      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
        {offered.length > 0 && (
          <ul className="flex flex-col gap-1 pb-1">{specialRows(offered)}</ul>
        )}
        <p className="text-xs text-muted">
          {said ?? (inert ? `${actor} nie spełnia warunków` : `Decyzję podejmuje ${actor}`)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
      {/* A Wróg attacks the moment it is turned over (16.2), so the two
          things you may do about it are the two the rules give you. */}
      {foe && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            role="harm"
            weight="lead"
            size="lg"
            says={{ kind: "walczy" }}
            disabled={busy}
            onClick={() => onFight([known.id])}
          >
            Walcz ({foe.kind === "magical" ? "Magia" : "Miecz"} {foe.total}
            {/* Said, because a number that is your own is not a number you
                read off the card — and next turn it will be different. */}
            {foe.mirrors ? " — tyle co ty" : ""})
          </ActionButton>
          {asOne && (
            <ActionButton
              role="harm"
              size="lg"
              says={{ kind: "walczy" }}
              disabled={busy}
              onClick={() => onFight(standing.map((c) => c.id))}
              title={standing.map((c) => c.name).join(" + ")}
            >
              Walcz ze wszystkimi naraz ({standing.length}) — {asOne.total}
            </ActionButton>
          )}
          <ActionButton
            weight="quiet"
            size="lg"
            says={{ kind: "wymyka-sie" }}
            disabled={busy}
            onClick={onEscape}
          >
            Spróbuj się wymknąć (19.1)
          </ActionButton>
        </div>
      )}

      {/* Picked up or left where it lies — 12.1 and 16.8, and the app
          refuses for 5.3, 5.4 or 21.2 if it must. */}
      {!foe && keep && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            role="gain"
            weight="lead"
            size="lg"
            says={{ kind: keep === "friend" ? "bierze-przyjaciela" : "bierze-przedmiot" }}
            disabled={busy}
            onClick={() => onTake(known.id)}
          >
            {keep === "friend" ? "Weź Przyjaciela" : "Weź Przedmiot"}
          </ActionButton>
          <ActionButton
            weight="decline"
            size="lg"
            says={{ kind: keep === "friend" ? "zostawia-przyjaciela" : "zostawia-przedmiot" }}
            disabled={busy}
            onClick={() => onLeave(known.id)}
          >
            Zostaw
          </ActionButton>
        </div>
      )}

      {/* A choice the rules give the player: "wedle własnego wyboru". */}
      {asking?.op === "wybor" && (
        <div>
          <p className="mb-1 text-[11px] text-muted">Wybierz jedno:</p>
          <div className="flex flex-wrap items-center gap-2">
            {asking.options.map((option, index) =>
              /**
               * An option that is itself a question, asked in place.
               *
               * The Jednorożec's „przenosisz się na dowolny Obszar w tym
               * Kręgu" was a button that revealed a button: pressing it only
               * brought up the Obszar picker, so the card took two clicks to
               * say one thing — and „Pomiń" disappeared between them, which
               * is the worse half, since the second screen offered no way
               * back from the answer the first had just taken.
               *
               * The picker stands among the other options instead and its
               * confirm carries both halves at once: which option, and where.
               */
              option.effect.op === "przenies" && option.effect.to.kind !== "pole" ? (
                <span key={option.label} className="flex flex-wrap items-center gap-2">
                  <ObszarPicker among={ring} value={going} onPick={setGoing} />
                  <ActionButton
                    says={{
                      kind: "wybiera",
                      ...(choices.length === 0 ? { option: index } : {}),
                    }}
                    disabled={busy || !going}
                    /**
                     * Asked before it happens, like dropping a Przedmiot and
                     * spending gold.
                     *
                     * A relocation cannot be taken back and the Karta goes
                     * either way — „Bez względu na to, czy skorzystasz z
                     * propozycji, Jednorożec oddala się" — so a mis-picked
                     * Obszar off a dropdown is spent. 16.8 then makes you
                     * explore where you landed, which can be a fight you did
                     * not choose.
                     *
                     * The Obszar is named rather than declined — „Obszar:
                     * Karczma", not „na Karczmę" — for the reason the journal
                     * keeps names bare: the data carries one case and Polish
                     * wants several.
                     *
                     * Asked first and the three seconds after — see `confirm`
                     * on `ActionButton`. `onClick` is what those seconds
                     * eventually run, not what the press runs.
                     */
                    onClick={() =>
                      onResolve(known.id, {
                        choices: [...choices, index],
                        destination: going as FieldId,
                      })
                    }
                    confirm={(proceed) =>
                      onAsk({
                        title: "Przenieść się?",
                        body: leavingHere(going as FieldId),
                        confirmLabel: "Przenieś się",
                        onConfirm: proceed,
                      })
                    }
                  >
                    Przenieś się
                  </ActionButton>
                </span>
              ) : (
                <ActionButton
                  key={option.label}
                  // The index goes only while this is still the first
                  // question asked. Past that, the watching device re-walks
                  // the script with its own empty `choices` and would read
                  // the number against a different list — see `chosen`.
                  says={{ kind: "wybiera", ...(choices.length === 0 ? { option: index } : {}) }}
                  disabled={busy}
                  onClick={() => {
                    const next = [...choices, index];
                    setChoices(next);
                    onResolve(known.id, { choices: next });
                  }}
                  // What it would leave you with. A choice between two rules is
                  // not a choice until you know the numbers: „Miecz 6 → 2 ·
                  // Magia 2 → 6" is the decision the label only describes.
                  note={reader?.points ? previewOf(option.effect, reader.points) : undefined}
                >
                  {sentence(option.label)}
                </ActionButton>
              ),
            )}
          </div>
        </div>
      )}

      {/* "przenieś się na dowolny Obszar w tym Kręgu" — the player points at
          the board, so the board is what is offered. */}
      {asking?.op === "przenies" && asking.to.kind !== "pole" && (
        <div className="flex flex-wrap items-center gap-2">
          <ObszarPicker among={ring} value={going} onPick={setGoing} />
          <ActionButton
            says={{ kind: "przenosi-sie" }}
            disabled={busy || !going}
            onClick={() => onResolve(known.id, { choices, destination: going as FieldId })}
          >
            Przenieś się
          </ActionButton>
        </div>
      )}

      {/* "połóż jego Kartę na którymś z tych Obszarów, nie zajętym przez
          inną Postać" — the card names the list, and the ones somebody is
          standing on are struck off it here as well as on the server, so a
          player is not offered an answer that will be refused. */}
      {asking?.op === "poloz-karte" && asking.gdzie.kind === "jedno-z" && (
        <div className="flex flex-wrap items-center gap-2">
          <ObszarPicker
            among={asking.gdzie.fieldIds.filter((fieldId) => !occupied.includes(fieldId))}
            value={going}
            onPick={setGoing}
          />
          <ActionButton
            says={{ kind: "kladzie" }}
            disabled={busy || !going}
            onClick={() => onResolve(known.id, { choices, destination: going as FieldId })}
          >
            Połóż tutaj
          </ActionButton>
        </div>
      )}

      {/* Nothing here for this Postać, and one control that finishes it.

          Resolving is what clears a Karta from the kolejka, so „Pomiń" is
          wired to `onResolve` rather than to `onLeave`: nothing happens and
          the Karta is done. The pair that stood here before — „Rozpatrz"
          beside „Pomiń" — offered a choice between two ways of doing nothing,
          one of which quietly did not finish the Karta. */}
      {nothingLeftToAsk && inert && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[11px] text-vermilion">Nie spełniasz warunków</p>
          <ActionButton
            weight="lead"
            size="lg"
            says={{ kind: "pomija" }}
            disabled={busy}
            onClick={() => onResolve(known.id, { choices })}
          >
            {/* „Musisz", because it is the only thing there is to press. The
                other „Pomiń" — a Miejsce whose own text asks first — is a
                choice among others and says so by not saying this. */}
            Musisz pominąć
          </ActionButton>
        </div>
      )}

      {/* Nothing left to ask: the app does it, and the notice says what it
          did. A card with no script has nothing to do but be read. */}
      {nothingLeftToAsk && !inert && (
        <ActionButton
          weight="lead"
          size="lg"
          className="self-start"
          says={{ kind: "rozpatruje" }}
          disabled={busy}
          onClick={() => (script ? onResolve(known.id, { choices }) : onLeave(known.id))}
        >
          {/* „Rozpatrz, co się da" is gone. It was the label for an effect
              the browser could not fully predict, and it read as a shrug —
              a button that promises to try. What the app actually does is
              resolve the Karta; how much of it applies is the card's business
              and the server's, and either way the player pressed one thing. */}
          {!script ? "Rozumiem" : script.effect.op === "rzut" ? "Rzuć i rozpatrz" : "Rozpatrz"}
        </ActionButton>
      )}

      {/* Walking away, where the Karta itself allows it.

          Only where it does. „zostaw na później" used to show on anything
          mid-question, which put a way out under a Karta that has none — a
          Nieznajomy is carried out at its place in the kolejka (16.5) and a
          Wróg is fought or fled (13.5), never shelved. What is left is a
          Miejsce whose own text asks first („Jeżeli chcesz do niej wejść"). */}
      {!foe && !inert && skippable && (
        <button
          disabled={busy}
          onClick={() => onLeave(known.id)}
          className="self-start text-[11px] text-muted underline transition hover:text-ink"
        >
          Pomiń
        </button>
      )}
    </div>
  );
}
