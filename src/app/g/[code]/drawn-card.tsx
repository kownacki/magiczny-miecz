"use client";

import { useContext, useEffect, useState } from "react";
import { DrawSheet, type SheetChrome } from "./draw-sheet";
import { dismissableOpen } from "./overlay";
import events from "@/data/events.json";
import { CARD_CLASS_LABEL, type CardClass, type EventCard } from "@/data/types";
import { cardImageUrl } from "@/lib/view/cardImages";
import { classOf, combatValueOf, numeralMeaning, numeralOf, roundsOf } from "@/lib/engine/cards";
import { attackAsOne } from "@/lib/engine/combat";
import { listed } from "@/lib/engine/state";
import { kindForCard } from "@/lib/engine/holdings";
import { KolejkaStrip, worthShowing } from "./kolejka-strip";
import { ActionButton } from "./action-button";
import { intentSaid, isIntentKind } from "@/lib/engine/intentText";
import { scriptFor, describeDisposition } from "@/lib/engine/cardScript";
import { itemProfile, previewOf, requirementOf, staysAs } from "@/lib/engine/abilityText";
import { sentence } from "@/lib/engine/polish";
import { mayWalkPast } from "@/lib/engine/kolejka";
import { CardFacts, TheReader } from "./card-facts";
import type { Confirmation } from "./confirm";
import type { Nature } from "@/data/types";
import { pendingIn } from "@/lib/engine/resolve";
import { coverageOf, manualNote, NOT_HANDLED } from "@/lib/engine/coverage";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import type { EqMode } from "@/lib/engine/slots";

const EVENTS = events as EventCard[];

/** The Karta you just turned over, and exactly the things it lets you do. */

export interface DrawnEntry {
  cardId: string;
  cardClass: string;
  /** Staged by the test shortcut rather than drawn — see `TurnCard.granted`. */
  granted?: boolean;
}

/**
 * The card you just turned over.
 *
 * Drawing is the moment the game happens to you, and it used to happen in a
 * column of small print beside the board: the card's picture on the right, its
 * name and buttons in the turn panel, the two never quite next to each other.
 * So it is on a sheet — the card at a size you can read, and under it exactly
 * the things this card lets you do and nothing else.
 *
 * What those are comes from the card's own class and script, which is why there
 * is no list of special cases here: a Wróg attacks, a Przedmiot is picked up or
 * left, a Spotkanie is applied, and anything the rules leave to the player is
 * asked as the question the rules ask.
 */
export function DrawnCard({
  who,
  chrome,
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
}: {
  who: string;
  chrome: SheetChrome;
  /** The one being dealt with: first of the stack that is neither settled nor fought. */
  card: DrawnEntry;
  /** In 15.2 order, which is the order they are dealt with. */
  cards: DrawnEntry[];
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
   * Not decoration on a panel that only describes: what a Przedmiot's bonus is
   * *conditional* on differs between the two — klasyczny counts a MIECZ that is
   * anywhere on you, slotowy only one that is in a hand — and `whenApplies` is
   * where that is decided. Reading the profile with the default would have this
   * sheet quietly describing the other table's rules.
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
}) {
  // The choices made so far for the card on screen, as indices into its own
  // options. Sent back with the next attempt, so the server re-walks the card
  // and takes the branch rather than being handed an effect.
  /**
   * Whom these Karty are being read for — the Postać they were dealt to, which
   * the sheet's own provider supplies. See `TheReader`.
   */
  const reader = useContext(TheReader);
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

  const { canAct } = chrome;
  useEffect(() => {
    if (!canAct) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Not while something is open over this one. Escape belongs to whatever
      // is on top, and leaving a Karta on the field is not the sort of thing to
      // do as a side effect of closing the Karta you were reading.
      if (dismissableOpen()) return;
      onLeave(card.cardId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `canAct` belongs here: a watcher who takes the seat over mid-Karta
    // changes it without changing the Karta, and the listener was staying as it
    // was — bound for somebody who could no longer act, or missing for somebody
    // who now could.
  }, [card.cardId, canAct, onLeave]);

  const known = EVENTS.find((c) => c.id === card.cardId);
  if (!known) return null;

  const art = cardImageUrl(known.id);
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
  const together = asOne ? standing : null;
  const keep = kindForCard(known);
  const label = CARD_CLASS_LABEL[card.cardClass as CardClass] ?? card.cardClass;

  // What the card is still asking, walked down through the choices already
  // made. Null when there is nothing left to ask and the app can simply do it.
  const asking = script ? pendingIn(script.effect, choices, nature) : null;

  /**
   * Whether walking away is one of the answers.
   *
   * Never for a Nieznajomy. 16.5 is flat — „konieczne jest wykonanie zawartej w
   * Karcie instrukcji" — and every one of them either gives you something or
   * happens to you; there is nothing there a player would decline. A Miejsce is
   * different, and says so itself: „**Jeżeli chcesz** do niej wejść, rzuć
   * kostką" is the Grota's own sentence, and rolling it can cost a turn or
   * start a fight.
   *
   * The exception is a Karta that has nothing for this character at all — the
   * WRÓŻKA met by a Zła Postać. Resolving it is a no-op, so „Pomiń" says what
   * is happening and „Rozpatrz, co się da" does not.
   */
  /**
   * What this Karta asks of the character in front of it, and whether they pass.
   *
   * Printed on its own line unless the „czeka tu na pierwszą Dobrą Postać" line
   * has already said it — „Pierwszej Dobrej Postaci" is one fact and was coming
   * out as two, the second being the first with a word missing.
   */
  /* Kept for `inert` below: the line itself is `CardFacts`'s now, drawn from
     the same `requirementOf` against the same reader. What is asked here is
     narrower — not what the condition says, only whether this Postać fails it. */
  const needs = requirementOf(known.id, reader ?? { nature, aggression });

  /**
   * Nothing here for this Postać at all — a `gdy natura` with no other branch,
   * met by the wrong Natura. The WRÓŻKA and a Zła Postać.
   *
   * Resolving is still what clears it from the kolejka, so the one control is
   * „Pomiń" wired to `onResolve`: nothing happens, and the Karta is done. The
   * old pair — „Rozpatrz" beside „Pomiń" — offered a choice between two ways of
   * doing nothing, one of which quietly did not finish the Karta.
   */
  /**
   * Nothing here for this Postać at all.
   *
   * A `gdy` whose condition they fail and whose other branch does nothing —
   * the WRÓŻKA met by a Zła Postać, the DOBRE BÓSTWO met by somebody who has
   * raised no hand. Read off `requirementOf`, so it covers every condition the
   * requirement line can state rather than only a Natura: `inertFor` knew about
   * `gdy natura` and left the Bóstwo to fall through to a button promising to
   * do what it could, which was nothing.
   */
  const gate = script?.effect;
  const inert =
    gate?.op === "gdy" &&
    (gate.inaczej === undefined || gate.inaczej.op === "nic") &&
    needs?.met === false;

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
   * Everything the app knows this Karta does, read once.
   *
   * The same `itemProfile` the hover panel is drawn from, so the sheet and the
   * hover cannot come to describe one card two ways — which they had, by the
   * sheet describing nothing. A Nieznajomy's whole content is how long it stays
   * and whom it is for, and the sheet drew both by hand; a Przedmiot's is its
   * slot and its bonuses, and the sheet drew neither, so KOŃ was a picture, a
   * name and an empty column.
   */
  const profile = itemProfile(known.id, eqMode);

  /**
   * What this Karta offers, in rows — for the people who cannot press it.
   *
   * `itemProfile`'s, so it is word for word the panel the hover draws and the
   * buttons the acting player sees, rather than a third telling of the same
   * card.
   */
  const offered = canAct ? [] : profile.special;

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
   * Whether walking away is one of the answers.
   *
   * Never for a Nieznajomy: 16.5 is flat and every one of them either gives you
   * something or happens to you. A Miejsce says otherwise itself — „Jeżeli
   * chcesz do niej wejść, rzuć kostką" is the Grota's own sentence, and that
   * die costs a turn on 4 and starts a fight on 5 or 6.
   */
  const skippable = classOf(known.id) !== "stranger" && mayWalkPast(known.id);


  return (
    <DrawSheet
      {...chrome}
      label={known.name}
      /* The bar names the window, not the Karta: what is being worked through
         is the Obszar's kolejka, and the Karta's own name now stands at the
         head of the column beside its picture, where the scan is right there
         to be compared against it. */
      heading="Karty do rozpatrzenia"
      art={art}
      granted={card.granted === true}
      watching={`${who} ciągnie Kartę`}
      /**
       * The kolejka, across the foot of the sheet.
       *
       * It replaced the sentence "3 Karty na tym Obszarze — po kolei", which is
       * a count and an assurance: it says there is an order without saying what
       * the order is, so a player halfway through a busy Obszar knew how many
       * were left and not which, nor whether the next one was a Wróg.
       *
       * At the foot rather than at the top of the right-hand column, where it
       * first went. Up there it was a third thing competing with the card's own
       * title, and it is not a third thing — it is the row on the table, and
       * the Karta above it is the one in your hand.
       */
      footer={
        worthShowing(cards) ? (
        <KolejkaStrip
          /* The whole card, not two fields of it. Rebuilding it as `{ cardId,
             cardClass }` dropped `granted`, so a Karta the console had conjured
             wore its wrench on the sheet above and lost it in the row below —
             the one place the two are side by side. `ref` and `pool` went the
             same way. */
          cards={cards.map((one) => ({ ...one, cardClass: one.cardClass as CardClass }))}
          settled={[...resolved, ...fought]}
          /* The Karta this sheet is showing, so the row cannot light a
             different one. */
          current={card.cardId}
          beaten={beaten}
        />
        ) : null
      }
    >
      {/* Only what the card does not say itself. The scan carries its own
          name, class, Miecz and full text at a size you can read — printing
          all of it again beside the picture was two of everything and pushed
          the buttons off the bottom. What is left is this app's reading of the
          card and the things you can do about it. */}
      {/* One stack, spaced the way `CardFacts` spaces these lines in the hover:
          the sheet's own column is `gap-3`, which is right between the card and
          the buttons and half again too much between statements that belong
          together. `CardFacts` is now literally what draws most of them — the
          spacing agreeing was the first sign the two panels wanted to be one. */}
      <div className="flex flex-col gap-1.5">
      {/* Whose Karta this is, at the head of the column — with or without a
          scan. It used to be here only when there was no picture, on the
          reasoning that the scan carries its own title band; true, in a
          nineteen-nineties display face at the size the print was, next to a
          window whose own bar was carrying the name instead. Now the bar names
          the window and this names the Karta. */}
      <header>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-ochre">
          {known.name}
        </h2>
        <p className="text-[11px] uppercase tracking-widest text-muted">
          {label}
          {numeralOf(known.id) && (
            <>
              {" · "}
              <span title={numeralMeaning(known.id) ?? undefined}>{numeralOf(known.id)}</span>
            </>
          )}
        </p>
        {/* The prose only where the picture is not: the scan says it better,
            in the type it was set in. */}
        {!art && (
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted">
            {known.text}
          </p>
        )}
      </header>

      {/* What happens to the Karta afterwards, and only where it does not say
          how long it stays: `CardFacts` draws `visit` — which *is* `staysAs` —
          and this is the other half of the same question, in the disposition's
          own words. Both would be one card answering twice. */}
      {!staysAs(known.id) && script && (
        <p className="border-t border-edge/60 pt-2 text-[11px] text-ochre/80">
          {describeDisposition(script.disposition)}
        </p>
      )}

      {/* Where it goes, in the same place and the same words the hover panel
          puts it: above the bonuses, because „may I even wear this" is answered
          before „what does it give me". */}
      {profile.slotLabel && (
        <p className="border-t border-edge/60 pt-2 text-[11px] text-muted">
          Slot: <span className="text-ink">{profile.slotLabel}</span>
        </p>
      )}

      {/* And the rest of it, from the component the hover is built out of.

          This column used to draw two of these lines by hand — how long the
          Karta stays, and whom it is for — which is exactly the two a
          Nieznajomy has, and is why nobody noticed that a Przedmiot had none.
          KOŃ carries „+8 Przedmiotów ponad limit (5.4)" and a slot, and the
          sheet showed a picture, a name and eight centimetres of nothing while
          the hover over the same card said both. One telling now, so the two
          cannot drift apart again.

          `special` is emptied rather than drawn. What using a Karta does is
          what the buttons under this column *are* for the player whose turn it
          is, and `offered` lists them for everybody else — a third copy between
          the two would be the card telling you the same thing three ways. */}
      <CardFacts
        cardId={known.id}
        profile={{ ...profile, special: [] }}
        nature={nature}
      />

      </div>

      {coverageOf(known.id) === "brak" && (
        <p className="rounded border border-edge bg-night/50 px-2 py-1 text-[11px] text-muted">
          {NOT_HANDLED}
        </p>
      )}
      {manualNote(known.id) && (
        <p className="rounded border border-ochre/40 bg-night/50 px-2 py-1 text-[11px] text-ochre/80">
          {manualNote(known.id)}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
        {/* What the watchers get where the buttons are.

            The choices themselves first, because that is what a table watching
            somebody decide wants to see — the buttons are the acting player's
            and everyone else was left with a picture and a name. The same rows
            the hover panel draws, from the same `itemProfile`.

            Then who is deciding: an empty panel under a Karta says the app is
            thinking, and it is not. */}
        {!canAct && offered.length > 0 && (
          <ul className="flex flex-col gap-1 pb-1">
            {offered.map((row, at) => (
              <li key={at} className="text-[11px] leading-snug text-ochre/90">
                {sentence(row)}
              </li>
            ))}
          </ul>
        )}
        {/* One line, three things it can say: waiting for somebody, watching
            them decide, and — when the Karta was never theirs to act on —
            saying so.

            One colour for all three. The middle one was ochre for a while, on
            the reasoning that it is the only sentence here about something
            that has not happened yet; on screen it read as a different kind of
            notice arriving rather than as this one changing what it says, and
            the sentence is doing that work by itself. A step up in size
            instead, for all three at once — this is the only thing the rest of
            the table has to read, and it was set smaller than the card's own
            small print. */}
        {!canAct && (
          <p className="text-xs text-muted">
            {said ?? (inert ? `${actor} nie spełnia warunków` : `Decyzję podejmuje ${actor}`)}
          </p>
        )}
        {/* A Wróg attacks the moment it is turned over (16.2), so the two
            things you may do about it are the two the rules give you. */}
        {canAct && foe && (
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
            {together && (
              <ActionButton
                role="harm"
                size="lg"
                says={{ kind: "walczy" }}
                disabled={busy}
                onClick={() => onFight(together.map((c) => c.id))}
                title={together.map((c) => c.name).join(" + ")}
              >
                Walcz ze wszystkimi naraz ({together.length}) — {asOne?.total}
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
        {canAct && !foe && keep && (
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
        {canAct && asking?.op === "wybor" && (
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
                    <select
                      value={going}
                      onChange={(event) => setGoing(event.target.value as FieldId)}
                      className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="">— wybierz Obszar —</option>
                      {ring.map((fieldId) => (
                        <option key={fieldId} value={fieldId}>
                          {FIELDS.get(fieldId)?.name ?? fieldId}
                        </option>
                      ))}
                    </select>
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
                          body:
                            `Obszar: ${FIELDS.get(going as FieldId)?.name ?? going}. ` +
                            "Rozpatrzysz go tak, jakby twój ruch skończył się tam (16.8).",
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
        {canAct && asking?.op === "przenies" && asking.to.kind !== "pole" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={going}
              onChange={(event) => setGoing(event.target.value as FieldId)}
              className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink"
            >
              <option value="">— wybierz Obszar —</option>
              {ring.map((fieldId) => (
                <option key={fieldId} value={fieldId}>
                  {FIELDS.get(fieldId)?.name ?? fieldId}
                </option>
              ))}
            </select>
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
        {canAct && asking?.op === "poloz-karte" && asking.gdzie.kind === "jedno-z" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={going}
              onChange={(event) => setGoing(event.target.value as FieldId)}
              className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink"
            >
              <option value="">— wybierz Obszar —</option>
              {asking.gdzie.fieldIds
                .filter((fieldId) => !occupied.includes(fieldId))
                .map((fieldId) => (
                  <option key={fieldId} value={fieldId}>
                    {FIELDS.get(fieldId)?.name ?? fieldId}
                  </option>
                ))}
            </select>
            <ActionButton
              says={{ kind: "kladzie" }}
              disabled={busy || !going}
              onClick={() => onResolve(known.id, { choices, destination: going as FieldId })}
            >
              Połóż tutaj
            </ActionButton>
          </div>
        )}

        {/* Nothing left to ask: the app does it, and the notice says what it
            did. A card with no script has nothing to do but be read. */}
        {/* Nothing here for this Postać, and one control that finishes it.

            Resolving is what clears a Karta from the kolejka, so „Pomiń" is
            wired to `onResolve` rather than to `onLeave`: nothing happens and
            the Karta is done. The pair that stood here before — „Rozpatrz"
            beside „Pomiń" — offered a choice between two ways of doing nothing,
            one of which quietly did not finish the Karta. */}
        {canAct && !foe && !keep && !asking && inert && (
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
        {canAct && !foe && !keep && !asking && !inert && (
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
        {canAct && !foe && !inert && skippable && (
          <button
            disabled={busy}
            onClick={() => onLeave(known.id)}
            className="self-start text-[11px] text-muted underline transition hover:text-ink"
          >
            Pomiń
          </button>
        )}
      </div>
    </DrawSheet>
  );
}
