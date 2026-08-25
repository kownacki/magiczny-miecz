"use client";

import { useMemo, useState } from "react";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import characters from "@/data/characters.json";
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
type Shelf = "zaklecia" | "wyposazenie" | "postacie" | CardClass;

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

/** Deduplicated, because the deck holds several copies of many cards on purpose. */
function shelfCards(shelf: Shelf): TileCard[] {
  const unique = new Map<string, TileCard>();
  const add = (card: TileCard) => {
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

export function CardLibrary({ onClose }: { onClose: () => void }) {
  const [shelf, setShelf] = useState<Shelf>("zaklecia");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<TileCard | null>(null);

  const cards = useMemo(() => {
    const all = shelfCards(shelf);
    if (!query.trim()) return all;
    const needle = fold(query.trim());
    return all.filter(
      (card) => fold(card.name).includes(needle) || fold(card.text ?? "").includes(needle),
    );
  }, [shelf, query]);

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
        {SHELVES.map((entry) => (
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
          {cards.length} {cards.length === 1 ? "karta" : "kart"} — pokazane są pojedyncze
          wzory, nie wszystkie egzemplarze z talii.
        </p>
        <div className="flex flex-wrap gap-3">
          {cards.map((card) => (
            <CardTile key={card.cardId} card={card} onClick={() => setOpen(card)} />
          ))}
        </div>
      </div>
    </div>
  );
}
