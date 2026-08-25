"use client";

import { useMemo, useState } from "react";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import characters from "@/data/characters.json";
import type { EqMode } from "@/lib/engine/slots";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import type { Nature } from "@/data/types";
import type { Character, EventCard, Item, Spell } from "@/data/types";
import { CARD_CLASS_LABEL, type CardClass } from "@/data/types";
import { CardDetail, CardTile, type TileCard } from "./card-tile";

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

/** Only while testing: the board as a list, to stand on any of it at once. */
const FIELD_SHELF: { key: Shelf; label: string } = { key: "obszary", label: "Obszary" };

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
  onGrant,
  onTeleport,
}: {
  onClose: () => void;
  /**
   * Testing only, and absent in a deployed build.
   *
   * Reaching a fight on the Kamienny Most legitimately is twenty minutes of
   * play; these hand you the card and the square so the thing being tested can
   * be tested.
   */
  onGrant?: (cardId: string) => void;
  onTeleport?: (fieldId: FieldId) => void;
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

  const cards = useMemo(() => {
    if (!searching) return shelfCards(shelf);
    /**
     * A search is for a card, not for a card on this shelf.
     *
     * It used to filter the open shelf only, so looking for the Tajemnicza
     * Szkatuła from anywhere except Przedmioty found nothing — and the one
     * thing you reach for a search box to avoid is having to know where the
     * thing already is.
     */
    const needle = fold(query.trim());
    const everywhere = new Map<string, TileCard>();
    for (const { key } of SHELVES) {
      for (const card of shelfCards(key)) {
        if (!everywhere.has(card.cardId)) everywhere.set(card.cardId, card);
      }
    }
    return [...everywhere.values()].filter(
      (card) => fold(card.name).includes(needle) || fold(card.text ?? "").includes(needle),
    );
  }, [shelf, query, searching]);

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
        {[...SHELVES, ...(onTeleport ? [FIELD_SHELF] : [])].map((entry) => (
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
          {cards.length} {cards.length === 1 ? "karta" : "kart"}
          {searching ? " — szukam w całej talii, nie tylko na tej półce." : null}
          {searching ? null : " — pokazane są pojedyncze wzory, nie wszystkie egzemplarze z talii."}
        </p>
        {shelf === "obszary" && onTeleport ? (
          <div className="flex flex-wrap gap-2">
            {[...FIELDS.values()].map((field) => (
              <button
                key={field.id}
                onClick={() => onTeleport(field.id as FieldId)}
                title={`Stań na: ${field.name}`}
                className="rounded border border-edge bg-panel px-2 py-1 text-[11px] text-ink transition hover:border-ochre"
              >
                {field.name}
                <span className="ml-1 text-muted/60">{field.region}</span>
              </button>
            ))}
          </div>
        ) : (
        <div className="flex flex-wrap gap-3">
          {cards.map((card) => (
            <CardTile
              key={card.cardId}
              card={card}
              eqMode={eqMode}
              nature={nature}
              onClick={() => setOpen(card)}
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
        </div>
        )}
      </div>
    </div>
  );
}
