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
import { intentSaid, type Intent } from "@/lib/engine/intentText";
import { instructionIn, scriptFor } from "@/lib/engine/cardScript";
import { itemProfile, previewOf, requirementOf } from "@/lib/engine/abilityText";
import { fieldName, plural, sentence } from "@/lib/engine/polish";
import { mayWalkPast } from "@/lib/engine/kolejka";
import { TheReader, specialRows } from "./card-facts";
import { DieMark } from "./die-mark";
import { RollSaid, type Rolled } from "./roll-result";
import { TileRow } from "./tile-row";
import { ItemSlot } from "./item-slot";
import { CARD_NAMES, tileFor, type Held } from "./table";
import { dieGroups, faceRun } from "@/lib/engine/effectText";
import { WithRules } from "./rule-ref";
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
   * A die thrown for this Karta and not yet read — see `RollSaid`.
   *
   * Only ever on the device that threw it: the turn has moved on for everybody
   * else, and this is the sentence the app owes the one player who watched it
   * decide something on their behalf. Null names no Karta and holds nothing.
   */
  rolled?: Rolled | null;
  /** „Dalej": the player has read the face, and the kolejka may go on. */
  onRollRead?: () => void;
  /**
   * A loss this Karta is waiting on, and the pack it reaches into.
   *
   * Built by the table for every device — see `losing` in `page.tsx` — because
   * both ends have to number the same cards in the same order: the answer is an
   * index into this list, and the watchers read what was chosen off the same
   * one. Null where there is no such question, or where this device cannot
   * vouch for the list.
   */
  losing?: { cardId: string; kind: Held["kind"]; cards: Held[] } | null;
  /** Which of them goes, by its place in that list. */
  onLose?: (index: number) => void;
  /**
   * What the acting player's button is about to do, while it is still filling.
   *
   * Only ever set on a device that is *watching*: the three seconds an
   * irreversible decision waits before it is sent (`channelling.ts`) are the
   * only moment between „nothing yet" and „it is done" that anybody else at the
   * table has ever had, and this is what fills them.
   */
  intent?: Intent | null;
  /**
   * Sends a decision about the Karta, and settles when the server has answered.
   *
   * The promise is what `answer` below waits on: the panel holds the button
   * that was pressed until the turn state carrying it comes back, rather than
   * drawing what it guesses comes next. `void` for a caller with nothing to
   * wait on.
   */
  onResolve: (
    cardId: string,
    decisions: { choices?: number[]; destination?: FieldId },
  ) => void | Promise<void>;
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
  disabled,
  onPick,
}: {
  among: readonly FieldId[];
  value: FieldId | "";
  /** Shut with the buttons beside it: a decision in flight takes the panel. */
  disabled: boolean;
  onPick: (field: FieldId | "") => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onPick(asFieldId(event.target.value) ?? "")}
      className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink disabled:opacity-50"
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

/**
 * One card of the pack, in the row a loss is chosen from.
 *
 * The Trofea's tile, in every respect that matters — `ItemSlot` with the name
 * under the picture, `chosen` for the one that is picked out, and the Karta a
 * hover away whether or not the click does anything. A loss is the same gesture
 * as a trade: a handful of cards, one of them going.
 */
function LosableTile({
  held,
  picked,
  onPick,
  eqMode,
}: {
  held: Held;
  picked: boolean;
  onPick?: () => void;
  eqMode: EqMode;
}) {
  return (
    <ItemSlot
      item={{
        holdingId: held.id,
        cardId: held.cardId,
        card: tileFor({ cardId: held.cardId, kind: held.kind, granted: held.granted }),
        inert: false,
      }}
      label={CARD_NAMES.get(held.cardId) ?? held.cardId}
      eqMode={eqMode}
      tone={picked ? "chosen" : "filled"}
      disabled={!onPick}
      onClick={onPick}
    />
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
  rolled,
  onRollRead,
  losing,
  onLose,
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
  /**
   * The answer that has gone to the server and has not come back.
   *
   * This panel does not walk the Karta ahead of the server. It used to: an
   * option press appended its index to a local list of choices, and the next
   * render asked `pendingIn` again with the longer list — so the moment a
   * decision was *sent*, the panel drew what it thought came next. For every
   * card in the box that is the same thing: the options vanish and „Rozpatrz"
   * takes their place, disabled for as long as the request is in flight and
   * live again if the new turn state is a beat behind it. The player who chose
   * a wish from the KRÓL LASU pressed six buttons and got a seventh.
   *
   * The list bought nothing. A question this panel asks is answered by the
   * request that carries it, and a question left over after that one is the
   * *server's* to ask — it suspends the walk into a `script` frame with a
   * cursor (docs/STACK.md), and `ScriptFramePanel` is what draws it. So there
   * is never a second question here to walk down to, and every press is the
   * first: the panel keeps what it is showing, marks the button that was
   * pressed, and waits for the turn state to move it on.
   *
   * `option` is which of a `wybor`'s buttons it was, for the mark; null for a
   * decision that is not one of several.
   */
  const [sent, setSent] = useState<{ option: number | null } | null>(null);
  const [going, setGoing] = useState<FieldId | "">("");
  /** Which of the pack the player has picked out to lose, by its place in it. */
  const [giving, setGiving] = useState<number | null>(null);

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
    setSent(null);
    setGoing("");
    setGiving(null);
  }

  const known = EVENTS.find((c) => c.id === card.cardId);
  if (!known) return null;

  const script = scriptFor(known.id);

  /**
   * Which of the Karta's sentences this Postać is being read (15.1).
   *
   * The same question `resolveDrawnCard` asks and the same function, off the
   * same fact: a Karta that came off the pile is on its way to the Obszar its
   * instruction names, and one that came off the board is where it was going.
   * The EREMITA is „Rzuć i rozpatrz" to the player who turned him over and two
   * gifts to the player who finds him, and the sheet must not offer one in
   * place of the other — it did, and the Magiczny Miecz was on the table three
   * squares from where the Eremita went to live.
   */
  const instruction = script ? instructionIn(script, card.lying) : null;

  /**
   * Sends one decision and holds it on screen until the server has answered.
   *
   * Every button under a Karta that resolves it goes through here, so that the
   * one that was pressed is the one that says something is happening — the rest
   * of the panel dims behind `busy`, and what a player is left looking at is
   * their own answer rather than a control they did not choose.
   *
   * `finally`, because a refusal has to release the button too: the Karta is
   * still there and the error is on the sheet above, and a decision stuck
   * mid-press would be the one thing on screen that cannot be corrected.
   */
  const answer = async (
    was: { option: number | null },
    decisions: { choices?: number[]; destination?: FieldId },
  ) => {
    setSent(was);
    try {
      await onResolve(known.id, decisions);
    } finally {
      // Only if it is still ours: the Karta may have moved on and reset this
      // already, and a late answer must not clear the next one's mark.
      setSent((current) => (current === was ? null : current));
    }
  };

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

  // What the card is asking. Null when there is nothing to ask and the app can
  // simply do it. Nothing has been decided yet by definition — an answer given
  // here is sent, and what the card asks after it is the server's frame to put
  // up, not this panel's to guess at (see `sent`).
  const asking = instruction ? pendingIn(instruction, [], nature) : null;

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
  const inert = inertFor(instruction ?? undefined, needs?.met === false);

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
   * Both ends read the same list, which is what makes the number mean the same
   * thing at both: every answer this panel sends is the first question of its
   * Karta, so the watching device walks to the very node the sender was looking
   * at. A question that comes after one is asked by a `script` frame, and that
   * panel says its own piece.
   */
  const chosen =
    intent?.option !== undefined && asking?.op === "wybor"
      ? (asking.options[intent.option]?.label ?? null)
      : null;
  const said = intent
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
   * The Karta the app throws a die for, rather than one anybody decides.
   *
   * Three things hang off it and each is the same argument from a different
   * side: the button says „Rzuć kostką" and carries a die, because that is what
   * pressing it does; the six outcomes are listed above it, because the player
   * is about to have one of them applied to them and the buttons — which are
   * what usually says what a Karta can do — say only „throw"; and the line the
   * rest of the table reads says he is rolling rather than deciding, since
   * there is nothing here to decide.
   */
  const rolls = nothingLeftToAsk && !inert && instruction?.op === "rzut";

  /**
   * What can come up, grouped as the card groups it.
   *
   * `DrawnCard` empties `special` for the player whose turn it is, on the
   * grounds that what a Karta does is what the buttons under it are — true of a
   * `wybor`, whose options are the buttons, and false of a die: one button and
   * six outcomes, none of them written anywhere the actor could read.
   *
   * The groups rather than the rendered rows, because a table that has been
   * thrown has to know which line the face landed in — and reading „3" back out
   * of „1-3 — przemykasz" is parsing our own output. `dieGroups` is that
   * grouping before it becomes a string.
   */
  const faces =
    rolls && instruction?.op === "rzut" ? dieGroups(instruction.faces) : [];

  /**
   * The table, with the face that came up standing out of it.
   *
   * Drawn for everybody and not only for the player pressing: the six lines are
   * what a 3 *means*, so a watcher reading „WYPADŁO 3" without them is reading
   * a number. Before the throw they are all one colour — nothing has happened
   * yet and no line is the answer; after it, the line that came up keeps the
   * colour and the rest step back, which is the same „lighting a few beats
   * dulling the rest" the trofea settled on.
   *
   * No „rzuć kostką:" over it. That was `describeEffect`'s heading for the
   * whole table, and read as an instruction — to a watcher, an instruction
   * addressed to them. The one player it *is* addressed to has „Musisz rzucić
   * kostką" and a button; everybody else has a list of what the Karta can do.
   */
  const dieTable = (face: number | null) =>
    faces.length > 0 ? (
      <ul className="flex flex-col gap-1">
        {faces.map((group) => {
          const hit = face !== null && group.on.includes(face);
          return (
            <li
              key={group.on.join(",")}
              className={`text-[11px] leading-snug ${
                face === null ? "text-ochre/90" : hit ? "text-ochre" : "text-muted/50"
              }`}
            >
              <WithRules text={`${faceRun(group.on)} — ${group.said}`} />
            </li>
          );
        })}
      </ul>
    ) : null;

  /** What the face that came up says it does, so the outcome need not repeat it. */
  const saidByFace = (face: number) => faces.find((group) => group.on.includes(face))?.said;

  /**
   * The loss this Karta is waiting on, if it is this Karta's.
   *
   * Asked by card id for the same reason the die is: the sheet is held on the
   * Karta the question belongs to, and a mismatch would offer one Karta's pack
   * against another one's instruction.
   */
  const owing = losing && losing.cardId === card.cardId ? losing : null;

  /**
   * The die thrown for *this* Karta, if it is still waiting to be read.
   *
   * Asked by card id rather than taken on trust: the sheet is held on the Karta
   * whose die is up (`DrawModal`), and a mismatch would put one Karta's face
   * under another one's list.
   */
  const said6 = rolled && rolled.cardId === card.cardId ? rolled : null;

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
    /**
     * The card being given up, once there is one — and never the pack.
     *
     * A row of somebody else's Przedmioty laid out while they decide is an
     * invitation to lean over and point, and the decision is 5.6's and theirs.
     * What the table is owed is the answer, which arrives with the three
     * seconds (`channelling.ts`) as an index into the same list this device
     * built — see `losing` — and stands there until the loss lands.
     */
    const chosenCard =
      owing && intent?.kind === "traci" && intent.option !== undefined
        ? (owing.cards[intent.option] ?? null)
        : null;
    return (
      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
        {/* The same table the player pressing is looking at, marked the same
            way — and headed by nothing, because „Rzuć kostką:" said to somebody
            who cannot press anything is an instruction addressed to the wrong
            person. For every other Karta this is `itemProfile`'s rows, which is
            what a watcher has always had. */}
        {rolls ? (
          dieTable(said6?.face ?? null)
        ) : offered.length > 0 ? (
          <ul className="flex flex-col gap-1 pb-1">{specialRows(offered)}</ul>
        ) : null}
        {/* The face, for the players who did not press the button — the same
            one they are looking at, off the frame everybody polls. No „Dalej":
            the throw is the thrower's to acknowledge, and a second way past it
            would move one device's sheet on while the rest stayed. */}
        {said6 && <RollSaid face={said6.face} did={said6.did} />}
        {chosenCard && (
          <TileRow frame={false}>
            <LosableTile held={chosenCard} picked eqMode={eqMode} />
          </TileRow>
        )}
        {/* Who the table is waiting for — and only while it is still waiting.
            „Test (KRASNOLUD) rzuca kostką" is the present tense, and it stood
            under „WYPADŁO 6" as though the die were still in the air: the one
            line a watcher has to read said the opposite of the number above it.
            The face is the answer to this sentence, so the sentence goes when
            the face arrives. What is left to wait for then is the thrower's
            „Dalej", which is theirs and needs no narration.

            An announcement still speaks over it: `said` is somebody's three
            seconds running (`channelling.ts`), and „Test (KRASNOLUD) — dalej"
            is exactly the thing a watcher wants under a face that has landed.
            Only the standing sentence goes. */}
        {(said || !(rolls && said6)) && (
          <p className="text-xs text-muted">
            {said ??
              (inert
                ? `${actor} nie spełnia warunków`
                : owing
                  ? `${actor} wybiera, co traci`
                  : rolls
                    ? /* Nothing is being decided, so „Decyzję podejmuje" was the
                         wrong sentence: the app throws and the Karta says what
                         the face means. What the table is waiting for is the
                         die. */
                      `${actor} rzuca kostką`
                    : `Decyzję podejmuje ${actor}`)}
          </p>
        )}
      </div>
    );
  }

  /**
   * A loss, asked where the die that caused it was thrown.
   *
   * On its own and before everything else, because while the Karta is
   * suspended on this question there is nothing else to do about it: „Walcz"
   * under a Wróg whose `przegrana` is being paid, or „Rzuć kostką" under a
   * table already rolled, would both be a second act offered mid-sentence.
   *
   * The face stays above it — the same „WYPADŁO 4" the throw put there, minus
   * its „Dalej", because answering is going on and two ways forward is one too
   * many. The row is the kolejka's row with the pack in it: pick one, and the
   * button beneath says which is about to go.
   */
  if (owing) {
    const chosen = giving !== null ? (owing.cards[giving] ?? null) : null;
    return (
      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
        {dieTable(said6?.face ?? null)}
        {said6 && (
          <RollSaid
            face={said6.face}
            did={said6.did.filter((line) => line !== saidByFace(said6.face))}
          />
        )}
        <p className="text-[11px] text-muted">Wybierz, co tracisz</p>
        <TileRow frame={false}>
          {owing.cards.map((held, index) => (
            <LosableTile
              key={held.id}
              held={held}
              picked={giving === index}
              eqMode={eqMode}
              onPick={busy ? undefined : () => setGiving(index)}
            />
          ))}
        </TileRow>
        <ActionButton
          role="harm"
          weight="lead"
          size="lg"
          className="self-start"
          /* „Odrzuć", the word this app already uses for a Karta that goes to
             the stos zużytych rather than onto the Obszar — which is where a
             card taken by an effect goes (6.4). */
          disabled={busy || chosen === null}
          /* 9.3: a hand nobody else may see announces nothing. Everything else
             is public (5.2, 6.2), so the index names a card the table is
             already looking at — the same bargain a `wybor` makes. */
          says={
            owing.kind === "spell" || giving === null
              ? undefined
              : { kind: "traci", option: giving }
          }
          onClick={() => giving !== null && onLose?.(giving)}
        >
          {chosen ? `Odrzuć: ${CARD_NAMES.get(chosen.cardId) ?? chosen.cardId}` : "Odrzuć"}
        </ActionButton>
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
                  <ObszarPicker among={ring} value={going} disabled={busy} onPick={setGoing} />
                  <ActionButton
                    says={{ kind: "wybiera", option: index }}
                    disabled={busy || !going}
                    sent={sent?.option === index}
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
                      void answer(
                        { option: index },
                        { choices: [index], destination: going as FieldId },
                      )
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
                  // The number means the same thing at both ends: this is the
                  // Karta's first question, so the watching device walks to the
                  // same node with its own empty choices — see `chosen`.
                  says={{ kind: "wybiera", option: index }}
                  disabled={busy}
                  sent={sent?.option === index}
                  onClick={() => void answer({ option: index }, { choices: [index] })}
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
          <ObszarPicker among={ring} value={going} disabled={busy} onPick={setGoing} />
          <ActionButton
            says={{ kind: "przenosi-sie" }}
            disabled={busy || !going}
            sent={sent !== null}
            onClick={() => void answer({ option: null }, { destination: going as FieldId })}
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
            disabled={busy}
            onPick={setGoing}
          />
          <ActionButton
            says={{ kind: "kladzie" }}
            disabled={busy || !going}
            sent={sent !== null}
            onClick={() => void answer({ option: null }, { destination: going as FieldId })}
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
            sent={sent !== null}
            onClick={() => void answer({ option: null }, {})}
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
        <div className="flex flex-col items-start gap-2">
          {/* The same line „Wybierz jedno:" is, over the list it heads, because
              the two are the same kind of thing: what the Karta is asking of
              you. „Musisz", because a Nieznajomy is carried out at its place in
              the kolejka (16.5) and there is no walking past one — and it is
              dropped once the die is thrown, an instruction being no longer an
              instruction when it has been obeyed. */}
          {rolls && !said6 && <p className="text-[11px] text-muted">Musisz rzucić kostką</p>}
          {/* What the die can do, read before it is thrown — and after, with
              the line it landed in picked out of the list. */}
          {dieTable(said6?.face ?? null)}
          {said6 ? (
            <RollSaid
              face={said6.face}
              /* Only what the marked line does not already say. „+1 Miecza"
                 under a list whose third row reads „+1 Miecza" is the same
                 sentence twice; „Zaklęcie: KAMIEŃ FILOZOFICZNY" over „zyskujesz
                 1 Zaklęcie" is the card it turned out to be, and worth a line. */
              did={said6.did.filter((line) => line !== saidByFace(said6.face))}
              /* The button only while the row is still waiting — see `held`. */
              {...(said6.held ? { onDone: onRollRead ?? (() => {}) } : {})}
            />
          ) : (
          <ActionButton
            weight="lead"
            size="lg"
            /* A die is not a decision: there is nothing to prefer and nothing
               to take back, so the three seconds are a delay — see `immediate`
               on `ActionButton`. The deliberation such a window is for happens
               on the Karta before this button, not after it. */
            immediate={rolls}
            says={rolls ? undefined : { kind: "rozpatruje" }}
            after={rolls ? <DieMark /> : undefined}
            disabled={busy}
            sent={sent !== null}
            onClick={() => (script ? void answer({ option: null }, {}) : onLeave(known.id))}
          >
            {/* „Rozpatrz, co się da" is gone. It was the label for an effect
                the browser could not fully predict, and it read as a shrug —
                a button that promises to try. What the app actually does is
                resolve the Karta; how much of it applies is the card's business
                and the server's, and either way the player pressed one thing.

                „Rzuć kostką" and not „Rzuć i rozpatrz", because rozpatrzenie is
                not a second act the player takes: the die decides and the app
                applies what it decided. The card's own words are „rzuć
                kostką". */}
            {!instruction ? "Rozumiem" : rolls ? "Rzuć kostką" : "Rozpatrz"}
          </ActionButton>
          )}
        </div>
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
