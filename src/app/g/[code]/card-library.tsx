"use client";

import { useMemo, useState } from "react";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import characters from "@/data/characters.json";
import type { EqMode } from "@/lib/engine/slots";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import type { Nature, Region } from "@/data/types";
import type { Character, EventCard, Item, Spell } from "@/data/types";
import { CARD_CLASS_LABEL, isFoeClass, type CardClass } from "@/data/types";
import { CardTile, cardKey, type TileCard } from "./card-tile";
import { TileRow } from "./tile-row";
import { Fold } from "./fold";
import {
  RULES_SHELVES,
  RuleHit,
  RulesShelfView,
  rulesMatching,
  type RulesShelf,
} from "./rules-shelf";
import { useCardPreview } from "./card-preview";
import { fieldWithText } from "@/lib/view/fieldText";
import { plural } from "@/lib/engine/polish";
import { fold } from "@/lib/engine/search";
import { Drawer } from "./drawer";

/**
 * Every card in the box, to look at.
 *
 * Two quite different needs, met by the same drawer. At a physical table the
 * Zaklęcia are held face down and nobody can remember what Władca Zaklęć does
 * without asking the person holding it — which gives the game away. And in
 * simulation the cards exist only as data, so without this there is no way to
 * see what is in the deck at all.
 *
 * It is deliberately a reference and not a hand: nothing here can be taken,
 * cast or played. Looking up a card you do not hold is exactly what the printed
 * rulebook lets you do, and it is not information anybody has to be protected
 * from — what is secret is *who holds which*, and that is not shown here.
 */
type Shelf = "zaklecia" | "wyposazenie" | "postacie" | "obszary" | CardClass;

/**
 * Shelves whose cards a hand can actually contain.
 *
 * A Wróg is a trophy you have to beat; Spotkania, Nieznajomi and Miejsca are
 * resolved and set aside. Offering to "take" one would put a row in the
 * holdings table that no rule knows how to read, so the button is only where it
 * means something.
 */
const TAKEABLE: ReadonlySet<Shelf> = new Set<Shelf>([
  "zaklecia",
  "wyposazenie",
  "item",
  "friend",
]);

const SHELVES: { key: Shelf; label: string }[] = [
  { key: "zaklecia", label: "Zaklęcia" },
  { key: "wyposazenie", label: "Wyposażenie" },
  { key: "postacie", label: "Postacie" },
  { key: "item", label: "Przedmioty" },
  { key: "friend", label: "Przyjaciele" },
  // One shelf for both printed classes. The Księga is browsed by name — every
  // shelf here is sorted alphabetically — and somebody looking up the Wilkołak
  // should not have to know first whether he fights with Miecz or Magia. Which
  // of the two each one is stays on its own tile, in `kindLabel`.
  { key: "foe", label: "Wrogowie" },
  { key: "encounter", label: "Spotkania" },
  { key: "stranger", label: "Nieznajomi" },
  { key: "place", label: "Miejsca" },
];

/**
 * The board as a list.
 *
 * A shelf like the others: the fields carry printed instructions — die-roll
 * tables, shop prices, what the Czarci Młyn does to you — and looking one up
 * without leaning over the board is exactly what this drawer is for. Only
 * *standing* on one is a test shortcut, and that is what the switch gates.
 */
const FIELD_SHELF: { key: Shelf; label: string } = { key: "obszary", label: "Obszary" };

/**
 * The four parts of the board, outermost first.
 *
 * The same order they are walked in: a character starts in the Dolny Krąg and
 * works inwards, and the Kamienny Most is the last of it. Ninety-odd fields in
 * one alphabetical heap made you read every name to find the one you wanted,
 * when what you actually know about a field is which ring it is on.
 */
const REGIONS: { key: Region; label: string }[] = [
  { key: "dolny", label: "Dolny Krąg" },
  { key: "srodkowy", label: "Środkowy Krąg" },
  { key: "gorny", label: "Górny Krąg" },
  { key: "most", label: "Kamienny Most" },
];

/** Deduplicated, because the deck holds several copies of many cards on purpose. */
/**
 * Whether a card belongs on the shelf being drawn.
 *
 * A plain `card.cardClass === shelf` everywhere else, and not for the Wrogowie:
 * the box prints two classes of them — `Wróg II Bestia` and `Wróg III Demon` —
 * and this drawer shelves them together, so the Demon has no shelf of its own
 * to be found on. Said once because `shelfCards` and `shelfSize` both ask, and
 * a shelf whose tally disagreed with its contents is exactly the kind of quiet
 * wrongness the Księga is read to settle.
 */
function onShelf(card: EventCard, shelf: Shelf): boolean {
  if (shelf === "foe") return isFoeClass(card.cardClass);
  return card.cardClass === shelf;
}

function shelfCards(shelf: Shelf): TileCard[] {
  const unique = new Map<string, TileCard>();
  const holdable = TAKEABLE.has(shelf);
  const add = (card: TileCard) => {
    card.holdable = holdable;
    if (!unique.has(card.cardId)) unique.set(card.cardId, card);
  };

  if (shelf === "zaklecia") {
    for (const spell of spells as Spell[]) {
      add({ cardId: spell.id, name: spell.name, text: spell.text, kindLabel: "Zaklęcie" });
    }
  } else if (shelf === "wyposazenie") {
    for (const item of items as Item[]) {
      add({
        cardId: item.id,
        name: item.name,
        text: item.text,
        kindLabel: item.price ? `Wyposażenie · ${item.price} Sz. Z.` : "Wyposażenie",
      });
    }
  } else if (shelf === "postacie") {
    for (const character of characters as Character[]) {
      add({
        cardId: character.id,
        name: character.name,
        text: character.abilities.join("\n\n"),
        kindLabel: `Postać · Miecz ${character.miecz} · Magia ${character.magia}`,
        character: true,
      });
    }
  } else {
    for (const card of events as EventCard[]) {
      if (!onShelf(card, shelf)) continue;
      add({
        cardId: card.id,
        name: card.name,
        text: card.text,
        kindLabel: CARD_CLASS_LABEL[card.cardClass],
      });
    }
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/**
 * One field, to read and — while testing — to stand on.
 *
 * There is no card to show for a field, so the hover carries its printed
 * instruction instead, which is the same thing the journal does when a line
 * names one.
 */
function FieldChip({
  fieldId,
  name,
  eqMode,
}: {
  fieldId: FieldId;
  name: string;
  eqMode: EqMode;
}) {
  const field = fieldWithText(fieldId);
  const { handlers, preview } = useCardPreview(
    { cardId: fieldId, name, text: field?.text ?? undefined, kindLabel: "Obszar" },
    true,
    eqMode,
  );
  const look = "rounded border border-edge bg-panel px-2 py-1 text-[11px] text-ink transition";

  return (
    <>
      {/* Something to read, never something to press. Standing on an Obszar is
          `go Karczma` in the console now, which is one line instead of a button
          under each of fifty-seven names. */}
      <span {...handlers} className={`${look} cursor-help`}>
        {name}
      </span>
      {preview}
    </>
  );
}

/**
 * How much of this shelf the box actually holds.
 *
 * The grid shows one of each, which is not the same as how many there are: the
 * deck has three Wilkołaki and fifteen 1 Sztuka Złota, and the equipment pile
 * four Magiczne Miecze (21.2), so "44 Przedmioty" and "63 Przedmioty" are both
 * true answers to different questions. Both are worth knowing — how likely a
 * card is to come up is the whole shape of the deck — so the heading says the
 * designs and, where they differ, the cards.
 */
function shelfSize(shelf: Shelf): { designs: number; cards: number } {
  const count = (ids: readonly string[]) => ({
    designs: new Set(ids).size,
    cards: ids.length,
  });
  if (shelf === "zaklecia") return count((spells as Spell[]).map((card) => card.id));
  if (shelf === "wyposazenie") return count((items as Item[]).map((card) => card.id));
  if (shelf === "postacie") return count((characters as Character[]).map((one) => one.id));
  if (shelf === "obszary") return { designs: 0, cards: 0 };
  return count(
    (events as EventCard[]).filter((card) => onShelf(card, shelf)).map((card) => card.id),
  );
}

/** The heading's tally: "44 rodzaje · 63 karty", or just the one when they agree. */
function shelfTally(shelf: Shelf): string {
  const { designs, cards } = shelfSize(shelf);
  const named = `${cards} ${plural(cards, "karta", "karty", "kart")}`;
  if (designs === cards) return named;
  return `${designs} ${plural(designs, "rodzaj", "rodzaje", "rodzajów")} · ${named}`;
}

export function CardLibrary({
  onClose,
  onInspect,
  onGrant,
  eqMode = "classic",
  nature = null,
  openRule = null,
  openShelf = null,
  endlessStock = false,
}: {
  onClose: () => void;
  /**
   * Opens the Karta, which this used to do itself.
   *
   * There were two Kartas: this one and the table's, each with its own state,
   * each mounted somewhere different in the tree — so a card opened off a shelf
   * and the same card opened off a seat were two different windows that only
   * looked alike, and they drifted. One of them stacked over the bar and the
   * other did not. The Karta belongs to the page, like every other sheet.
   */
  onInspect: (card: TileCard) => void;
  /**
   * Testing only, and absent in a deployed build.
   *
   * Reaching a fight on the Kamienny Most legitimately is twenty minutes of
   * play; these hand you the card and the square so the thing being tested can
   * be tested.
   */

  /**
   * Puts this card in a hand, while testing.
   *
   * The one test shortcut that stayed. The rest became console commands because
   * a console types a name faster than a shelf can be found — but this shelf is
   * where somebody already is when they want the card, with the picture of it
   * in front of them, and `give` would mean closing it to type the name of the
   * thing they are looking at.
   */
  onGrant?: (cardId: string) => void;
  /** The reader's own Natura, so a 5.3 restriction says whether it shuts them out. */
  nature?: Nature | null;
  /**
   * Which variant the table plays.
   *
   * The shelf is read away from the board, so nothing here knows it otherwise —
   * and without it every Przedmiot claimed to work from the pack, which is only
   * true in klasyczny. A Sztylet in a slotowy game has to be in your hand.
   */
  eqMode?: EqMode;
  /**
   * A rule somebody followed a `(5.3)` to, or null for an ordinary open.
   *
   * Carried in rather than held here, because the click that starts it happens
   * anywhere in the app — a refusal in the corner, a note under a Karta — and
   * the Księga may not even be mounted when it does.
   */
  openRule?: string | null;
  /** Which shelf that reference wants — `wariant` for the mode chip in the bar. */
  openShelf?: RulesShelf | null;
  /** The table's answer to 21.2, which the Wariant shelf lists where it is on. */
  endlessStock?: boolean;
}) {
  /**
   * Which half of the Księga is open.
   *
   * Cards and rules are the same act — look something up without leaving the
   * turn — so they share the drawer, the search box and the shortcut. They are
   * not the same *list*, though, and ten tabs could not become fifteen: this is
   * the switch above the tabs, and each side keeps its own row.
   */
  // Opened *at* a rule, this starts on Zasady. The page remounts the Księga on
  // every reference followed, so this is read fresh each time rather than
  // synced by an effect — a `(5.3)` has to reach past whatever was open,
  // including another rule, or following one would depend on where you were.
  const [side, setSide] = useState<"karty" | "zasady">(openShelf ? "zasady" : "karty");
  const [rulesShelf, setRulesShelf] = useState<RulesShelf>(openShelf ?? "instrukcja");
  /** A rule the reader picked out of the search, rather than followed a link to. */
  const [focus, setFocus] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf>("zaklecia");

  /**
   * Which shelves are folded away, by exception.
   *
   * A set of the shut ones rather than of the open: a search turns up whatever
   * it turns up, and a new shelf appearing in the answer should be showing its
   * cards, not hidden because nobody had opened it yet.
   */
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");

  const searching = query.trim().length > 0;

  /**
   * The cards to show, under the heading each belongs beneath.
   *
   * A shelf on its own is one section, and the heading merely names what the
   * open tab already says. A search is the case this is for: it looks in the
   * whole deck, so the answers arrive from everywhere at once, and a flat grid
   * of them cannot say whether the ZWIERCIADŁO it found is a Zaklęcie or a
   * Przedmiot — which is the first thing you want to know about a card you were
   * looking for by name.
   */
  const sections = useMemo(() => {
    const labelled = (key: Shelf) =>
      [...SHELVES, FIELD_SHELF].find((entry) => entry.key === key)?.label ?? key;
    if (!searching) return [{ key: shelf, label: labelled(shelf), cards: shelfCards(shelf) }];

    /**
     * A search is for a card, not for a card on this shelf.
     *
     * It used to filter the open shelf only, so looking for the Tajemnicza
     * Szkatuła from anywhere except Przedmioty found nothing — and the one
     * thing you reach for a search box to avoid is having to know where the
     * thing already is.
     */
    const needle = fold(query.trim());
    // A handful of cards sit on two shelves — a Magiczny Miecz is both drawn
    // and bought — and the first shelf that claims one keeps it, so the order
    // of the tabs above is the order of the sections below.
    //
    // By `cardKey` and not by the id, because two of these are not one card on
    // two shelves but two cards with one name: searching CZARODZIEJ found the
    // Postać, and the Nieznajomy of the same name — a different picture, a
    // different rule, a card you can actually meet — never appeared at all.
    const seen = new Set<string>();
    const found: { key: Shelf; label: string; cards: TileCard[] }[] = [];
    for (const { key, label } of SHELVES) {
      const hits = shelfCards(key).filter(
        (card) =>
          !seen.has(cardKey(card)) &&
          (fold(card.name).includes(needle) || fold(card.text ?? "").includes(needle)),
      );
      for (const card of hits) seen.add(cardKey(card));
      if (hits.length > 0) found.push({ key, label, cards: hits });
    }
    return found;
  }, [shelf, query, searching]);

  const cards = useMemo(() => sections.flatMap((section) => section.cards), [sections]);

  return (
    <>
      <Drawer
        side="left"
        /**
         * Sized to the shelf: five tiles across, which is what the section
         * headings are laid out for.
         *
         * `SHELF_WIDTH` carries the arithmetic and the reason the scrollbar's
         * term cannot be a measurement. It arrives as a custom property from
         * `table-layout.tsx`, which needs the same number for the board
         * column's floor — the map may not be narrower than what is laid over
         * it.
         */
        width="max-w-[var(--shelf-w)]"
        /**
         * No reserved gutter, because there is nothing left to hold still.
         *
         * This was the one drawer that kept the scrollbar's room whether or not
         * there was a scrollbar, and the reason was real: the shelf was a grid
         * that re-divided its width the instant the scrollbar came or went, so
         * every tile in it stepped sideways as you moved between a long shelf
         * and a short one.
         *
         * Fixed columns anchored to the left edge do not move (see `TileRow`),
         * so the room can be given up. Which is worth doing: a shelf short
         * enough not to scroll — a search with two hits — was showing a strip
         * of empty panel down its inside edge to hold a place nothing needed.
         */
        title="Księga Tolimana"
        onClose={onClose}
        head={
          <>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="szukaj po nazwie lub treści…"
              className="mt-2 w-full rounded border border-edge bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-ochre"
            />
            {/* Two words, loud, above the row they change. The tabs below are
                one row or the other and never both — nine shelves of cards and
                five of rules in one wrapped heap is a heap. */}
            <nav className="mt-2 flex gap-1">
              {(["karty", "zasady"] as const).map((one) => (
                <button
                  key={one}
                  onClick={() => setSide(one)}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] uppercase tracking-widest transition ${
                    side === one
                      ? "border-ochre bg-ochre/10 text-ochre"
                      : "border-edge text-muted hover:border-ochre hover:text-ink"
                  }`}
                >
                  {one === "karty" ? "Karty" : "Zasady"}
                </button>
              ))}
            </nav>
            <nav className="mt-2 flex flex-wrap gap-1">
              {side === "karty"
                ? [...SHELVES, FIELD_SHELF].map((entry) => (
                    <button
                      key={entry.key}
                      onClick={() => setShelf(entry.key)}
                      className={`rounded border px-2 py-1 text-[11px] transition ${
                        shelf === entry.key
                          ? "border-ochre text-ochre"
                          : "border-edge text-muted hover:border-ochre hover:text-ink"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))
                : RULES_SHELVES.map((entry) => (
                    <button
                      key={entry.key}
                      onClick={() => setRulesShelf(entry.key)}
                      className={`rounded border px-2 py-1 text-[11px] transition ${
                        rulesShelf === entry.key
                          ? "border-ochre text-ochre"
                          : "border-edge text-muted hover:border-ochre hover:text-ink"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
            </nav>
          </>
        }
      >
      <div className="p-4">
        {/* A search reads both halves. The switch above chooses what you
            browse; somebody typing a word does not know which half holds the
            answer, which is the reason they are typing. */}
        {searching && (
          <RulesFound
            query={query}
            onOpen={(id) => {
              setSide("zasady");
              setRulesShelf("instrukcja");
              setFocus(id);
            }}
          />
        )}
        {side === "zasady" ? (
          <RulesShelfView
            shelf={rulesShelf}
            focus={focus ?? openRule}
            eqMode={eqMode}
            endlessStock={endlessStock}
            query={query}
          />
        ) : (
        <>
        {/* Said only where there is something to say.
            
            The headings carry the tally and the pictures are plainly pictures,
            so "click a card to look at it" was a caption explaining that cards
            can be clicked, above a shelf of cards. What is left is the one
            thing the headings cannot say — that a search leaves the shelf you
            are on and reads the whole box — and the Obszary, which are the one
            shelf you read by hovering rather than by opening. */}
        {(searching || shelf === "obszary") && (
          <p className="mb-3 text-[11px] text-muted">
            {/* The board is not the deck: counting it in "kart" said 0, because
                no card in the box has a field on it. */}
            {shelf === "obszary"
              ? "Najedź na Obszar, żeby przeczytać, co na nim napisano."
              : `${cards.length} ${plural(cards.length, "karta", "karty", "kart")} — szukam w całej talii, nie tylko na tej półce.`}
          </p>
        )}
        {shelf === "obszary" ? (
          <div className="flex flex-col gap-5">
            {REGIONS.map(({ key, label }) => {
              const here = [...FIELDS.values()].filter((field) => field.region === key);
              if (here.length === 0) return null;
              return (
                <section key={key}>
                  <h3 className="mb-2 flex items-baseline gap-2 border-b border-edge/60 pb-1 text-[11px] uppercase tracking-wide text-ochre/80">
                    {label}
                    <span className="tnum text-muted/70">{here.length}</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {here.map((field) => (
                      // The ring is the heading now, so the name is the whole
                      // chip.
                      <FieldChip
                        key={field.id}
                        fieldId={field.id as FieldId}
                        name={field.name}
                        eqMode={eqMode}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
        // No `gap`: `Fold` brings its own rhythm — a rule above every section
        // but the first, and the space is the rule's — and a gap on top of it
        // made these sit further apart than the same component does in the seat
        // card. One spacing, decided in one place.
        <div className="flex flex-col">
          {sections.map((section, at) => (
            /**
             * Browsing, there is one shelf and the tabs above already chose it:
             * a heading you can fold away over the only thing on screen is a
             * control with nothing behind it. Searching, the same answer comes
             * back in eight shelves at once — "79 kart" is four screens of
             * pictures — and folding the ones you did not mean is how a long
             * answer becomes a short one without throwing any of it away.
             *
             * Same component as the seat card's sections, and now with none of
             * its looks overridden: the heading is `text-muted` there, so it is
             * `text-muted` here.
             */
            <Fold
              key={section.key}
              first={at === 0}
              title={section.label}
              /* Searching, the number is how many were found; browsing, it is
                 what the box holds. */
              tally={searching ? section.cards.length : shelfTally(section.key)}
              open={!searching || !shut.has(section.key)}
              onToggle={
                searching
                  ? () =>
                      setShut((was) => {
                        const next = new Set(was);
                        if (!next.delete(section.key)) next.add(section.key);
                        return next;
                      })
                  : undefined
              }
            >
              {/* Five columns by construction, not by arithmetic.

                  Wrapping is what made the count a sum in the first place: a
                  row of fixed 92px tiles fits five only while the container is
                  at least 508 wide, so every pixel spent elsewhere — padding, a
                  scrollbar, a zoom level — was a pixel that could take a column
                  away. Widening the drawer until it could not fixed the count
                  and left the slack in one place: a strip of empty panel down
                  the right of every row.

                  A grid of five `1fr` columns cannot lose one, and the leftover
                  goes where leftover should go — spread between the columns, a
                  pixel or two each, instead of pooling past the last tile. The
                  tiles keep their own 92 and sit centred in whatever they are
                  given. */}
              <TileRow columns={5} frame={false}>
                {section.cards.map((card) => (
                  <CardTile
                    key={card.cardId}
                    card={card}
                    eqMode={eqMode}
                    nature={nature}
                    onClick={() => onInspect(card)}
                  >
                    {onGrant && card.holdable && (
                      <button
                        onClick={() => onGrant(card.cardId)}
                        className="text-[9px] text-ochre/80 underline transition hover:text-ochre"
                      >
                        weź (test)
                      </button>
                    )}
                  </CardTile>
                ))}
              </TileRow>
            </Fold>
          ))}
        </div>
        )}
        </>
        )}
      </div>
      </Drawer>
    </>
  );
}

/**
 * What the Instrukcja has to say about the words in the box, above the cards.
 *
 * Above rather than below: a search for "natura" or "5.3" is more often a
 * question about the rules than about a picture, and the cards are the longer
 * list. Silent when the book has nothing, so an ordinary hunt for a Karta looks
 * exactly as it did.
 */
function RulesFound({ query, onOpen }: { query: string; onOpen: (id: string) => void }) {
  const { found, total } = rulesMatching(query);
  if (found.length === 0) return null;
  return (
    <section className="mb-4">
      <h3 className="mb-2 flex items-baseline gap-2 border-b border-edge/60 pb-1 text-[11px] uppercase tracking-wide text-muted">
        Instrukcja
        <span className="tnum text-muted/70">
          {total > found.length ? `${found.length} z ${total}` : total}
        </span>
      </h3>
      <div className="flex flex-col gap-1">
        {found.map((hit, at) => (
          <RuleHit key={hit.id ?? at} hit={hit} onOpen={() => hit.id && onOpen(hit.id)} />
        ))}
      </div>
      {total > found.length && (
        <p className="mt-1 text-[10px] text-muted/70">
          Więcej na półce Zasady — tam szukanie przegląda całą Instrukcję.
        </p>
      )}
    </section>
  );
}
