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
import { CARD_CLASS_LABEL, type CardClass } from "@/data/types";
import { CardDetail, CardTile, type TileCard } from "./card-tile";
import { useCardPreview } from "./card-preview";
import { fieldWithText } from "@/lib/engine/fieldText";

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
  "przedmiot",
  "przyjaciel",
]);

const SHELVES: { key: Shelf; label: string }[] = [
  { key: "zaklecia", label: "Zaklęcia" },
  { key: "wyposazenie", label: "Wyposażenie" },
  { key: "postacie", label: "Postacie" },
  { key: "przedmiot", label: "Przedmioty" },
  { key: "przyjaciel", label: "Przyjaciele" },
  { key: "wrog", label: "Wrogowie" },
  { key: "spotkanie", label: "Spotkania" },
  { key: "nieznajomy", label: "Nieznajomi" },
  { key: "miejsce", label: "Miejsca" },
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
      if (card.cardClass !== shelf) continue;
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

/** Polish counts things three ways, and these are small numbers. */
function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const last = count % 10;
  const tens = count % 100;
  return last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? few : many;
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
    (events as EventCard[]).filter((card) => card.cardClass === shelf).map((card) => card.id),
  );
}

/** The heading's tally: "44 rodzaje · 63 karty", or just the one when they agree. */
function shelfTally(shelf: Shelf): string {
  const { designs, cards } = shelfSize(shelf);
  const named = `${cards} ${plural(cards, "karta", "karty", "kart")}`;
  if (designs === cards) return named;
  return `${designs} ${plural(designs, "rodzaj", "rodzaje", "rodzajów")} · ${named}`;
}

/** Folds Polish diacritics so "zaklecie" finds "Zaklęcie" without a Polish keyboard. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
}

export function CardLibrary({
  onClose,
  eqMode = "klasyczny",
  nature = null,
}: {
  onClose: () => void;
  /**
   * Testing only, and absent in a deployed build.
   *
   * Reaching a fight on the Kamienny Most legitimately is twenty minutes of
   * play; these hand you the card and the square so the thing being tested can
   * be tested.
   */

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
}) {
  const [shelf, setShelf] = useState<Shelf>("zaklecia");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<TileCard | null>(null);

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
    const seen = new Set<string>();
    const found: { key: Shelf; label: string; cards: TileCard[] }[] = [];
    for (const { key, label } of SHELVES) {
      const hits = shelfCards(key).filter(
        (card) =>
          !seen.has(card.cardId) &&
          (fold(card.name).includes(needle) || fold(card.text ?? "").includes(needle)),
      );
      for (const card of hits) seen.add(card.cardId);
      if (hits.length > 0) found.push({ key, label, cards: hits });
    }
    return found;
  }, [shelf, query, searching]);

  const cards = useMemo(() => sections.flatMap((section) => section.cards), [sections]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-night">
      {open && <CardDetail card={open} onClose={() => setOpen(null)} />}

      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-edge px-4 py-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ochre">
          Karty do wglądu
        </h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="szukaj po nazwie lub treści…"
          className="min-w-0 flex-1 rounded border border-edge bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-ochre"
        />
        <button onClick={onClose} className="text-sm text-muted hover:text-ink">
          zamknij
        </button>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-edge px-4 py-2">
        {[...SHELVES, FIELD_SHELF].map((entry) => (
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
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-[11px] text-muted">
          {/* The board is not the deck: counting it in "kart" said 0, because
              no card in the box has a field on it. */}
          {shelf === "obszary" ? (
            "Najedź na Obszar, żeby przeczytać, co na nim napisano."
          ) : (
            <>
              {/* The headings carry the tally now; this is left with the one
                  thing they cannot say, which is where the search looked. */}
              {searching
                ? `${cards.length} ${plural(cards.length, "karta", "karty", "kart")} — szukam w całej talii, nie tylko na tej półce.`
                : "Kliknij kartę, żeby ją obejrzeć."}
            </>
          )}
        </p>
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
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.key}>
              <h3 className="mb-2 flex items-baseline gap-2 border-b border-edge/60 pb-1 text-[11px] uppercase tracking-wide text-ochre/80">
                {section.label}
                <span className="tnum normal-case tracking-normal text-muted/70">
                  {/* Searching, the number is how many were found; browsing, it
                      is what the box holds. */}
                  {searching ? section.cards.length : shelfTally(section.key)}
                </span>
              </h3>
              <div className="flex flex-wrap gap-3">
                {section.cards.map((card) => (
                  <CardTile
                    key={card.cardId}
                    card={card}
                    eqMode={eqMode}
                    nature={nature}
                    onClick={() => setOpen(card)}
                  >
                  </CardTile>
                ))}
              </div>
            </section>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
