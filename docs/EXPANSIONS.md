# The five expansions

Out of scope, and worth knowing about anyway.

CLAUDE.md settles it: base game only, and the expansion scans in `assets/raw/`
are deliberately untouched. This file is not a plan to transcribe them. It is a
survey of what is in the boxes, written down because several of them break the
base game's data model in ways that are cheap to allow for now and expensive to
retrofit — and because a survey done once is worth more than the same afternoon
spent again in a year.

Everything below was read off the scans. Where a claim rests on a filename
rather than a printed page, it says so.

## What they are

| Set | Board | Contents, as its own rulebook lists them |
|---|---|---|
| **Gród** | a walled city, hanging off the base board's `Gród` field | 60 Kart Grodu, 10 Zaklęć, 10 Wyposażenia, 5 Kart Postaci, 4 Karty Kredytu, 10 Kart Zdarzeń, 5 Kart "Wyjęty spod Prawa", 5 pionków, plansza |
| **Jaskinia** | an underground cave, entered at Wejście do Jaskini | ~60 Kart Jaskini, ~40 Zdarzeń, ~20 spells and items, 8 Postacie, 2 die-roll tables *(counts inferred from sheet slots; the 8 characters are counted)* |
| **Krypta Upiorów** | a crypt, **also playable standalone** | 2 Zdarzenia, 9 large + 9 small Karty Postaci, 9 Zaklęć, 27 Kart Krypty, 3 Karty Upiorów, two 5-card decks for "Smok i Księżniczka", żetony, 6 stands, a die |
| **Labirynt Magów** | a spiral maze, **also playable standalone** | 40 Kart Labiryntu, 40 Zdarzeń, 16 Zaklęć, 18 Kart Postaci, plansza, 6 Kart Alternatywnych Zakończeń Gry |
| **Magia** | none | more cards for the other three decks, plus 10 spells |

Jaskinia's rulebook is a 126 MB scan that would not open; its component list is
the one inferred from sheets rather than read. Every scan is image-only, and the
card sheets are A4 at 2480×3508 like the base game's, so `extract-assets.mjs`
should slice them unchanged.

## What would have to change

Ordered by how much of the app it touches.

### The board is not rings

`Field.adjacent: [string, string]` says a field has exactly two neighbours,
which is true of three concentric rings and of nothing else in these boxes. Gród
is a street map with junctions; Jaskinia is a branching cave — one of its fields
is called *Odnoga Korytarza*, "the fork in the corridor"; Labirynt is a spiral
with a centre.

**Krypta does not use adjacency at all.** You pick a compass direction, roll,
and move that many squares, wrapping round at the board's edge. That is a grid
with coordinates, and no list of neighbours expresses it.

`Region` is `"dolny" | "srodkowy" | "gorny" | "most"`; each board expansion adds
one.

### A field's text is not always a sentence

Several Jaskinia fields print only *KOMNATA (patrz opis komnat)* and are
resolved by rolling a d6 against a table that ships as a separate card —
Komnata Grozy, Świątynia Melkarta, Cudowna Grota, Pieczara Demonów, Siedziba
Gladiatorów, Otchłań Nicości. `Field.text` is a verbatim string.

### Field ids will have to name their set

Magia's spells send you to *"Kamienne Wrota (Labirynt Magów)"*, *"Wrota
(Gród)"*, *"Bramy Otchłani (Krypta Upiorów)"*. The set is printed on the card as
part of the destination, because the same name appears on more than one board.

### A name is not an identity — and `set:slug` is not enough either

The Magia set's *Karty Krypty* sheet prints **PRZEWODNIK KRYPTY three times:
twice as `Nieznajomy IV` with one text, once as `Przyjaciel V` with another.**
Two different cards, one name, one sheet.

This is the case that settles the id question. Namespacing by set —
`krypta:przewodnik-krypty` — does not separate these two, because they are in
the same set. What separates them is what has always separated them: `source`,
the sheet and the square it was cut from. That is a collector number, and it is
the only handle in this data that is guaranteed unique. See `sets.test.ts`,
which asserts it.

The likeliest ordinary collision is Gród's Warsztat Płatnerski, which sells
*Sztylet, Hełm, Tarcza, Miecz* at prices alongside its own new items. Whether it
ships duplicate cards or lets you buy the base ones is not stated on the board;
its `Zaklęcia i Wyposażenie` sheet would answer it in one look.

### Card kinds outside the six classes

- **Karty Kredytu** (Gród) — a debt, 4 Sz.Z. borrowed at the Gildia Kupców and
  repayable with interest.
- **Karty "Wyjęty spod Prawa"** (Gród) — outlaw status, held by a character.
- **Karty Alternatywnych Zakończeń Gry** (Labirynt) — six of them, and they
  replace the game's victory condition. One is placed face down on the *base*
  board's Zamek Bestii.
- **Karty Upiorów Krypty** — these print **no Roman numeral and no class
  header**. They attach to a character, alter its combat, and follow it out of
  the Krypta onto the main board. One character can carry three, and they stack.
- **"Smok i Księżniczka"** — two five-card decks played head to head as a
  betting game, wagering points of Miecz, Magia or Złoto. Not a deck, not a
  board, not a card in any sense this app has.
- **Runy Bóstw** (Krypta) print as `Przedmiot V Magiczny` but are counted as a
  resource — *"dowolny (dostępny) Run"*.

Karty Jaskini also print `Przedmiot | V | Magiczny` next to ordinary
`Przedmiot | V | Przedmiot`. The class enum survives, but `EventCard` has no
`magical` field — only `Item` does — and no event card in the base game needs
one.

### A character is not fixed for the game

Gród turns a player into the *Namiestnik*, the *Książęcy Wysłannik*, the *Mistrz
Czarnoksięski* or the *Herszt Złodziei* mid-game: you take a different Karta
Postaci and keep your points and your possessions. Krypta transforms you into
one of three *Rycerze Dawnych Bóstw*, which can change your Nature. Magia's spell
*Pan Postaci* swaps your character card for another, keeping only Miecz and
Magia.

Krypta also ships **9 large and 9 small Karty Postaci** — the same nine
characters, printed twice, the small ones for the standalone game. `source` is
one sheet and one square.

And one set patches another's characters. Krypta rewrites the abilities of
Demon, Quark, Pustelnik, Troll and Kapłan from the base game, Żartowniś and
Boginka from Labirynt, and Książę de Belial and Mistrz Czarnoksięski from Gród —
but only while inside the Krypta. Labirynt does the same to six base characters.
Abilities are region-conditional and overridable across sets.

Abilities of kinds the engine has no shape for: eliminating another player
outright (Jaskinia's KANIBAL eats a character on 2 Życia; Labirynt's YILDUN
kills a beaten opponent on a 1–2), forbidding an attack (MONARCHA: *Dobre
Postacie nie mogą cię atakować*), reshaping a fight (HEGEMON forces an unarmed
duel and caps the opponent's magic items to his own count), and reading other
players' hands (SARIN).

Two small mercies. No character id collides with a base one — all 18 Labirynt
names, all 8 Jaskinia names and the 5 Gród ones were checked. And
`nature: "any"` is not the Kat one-off the comment in `types.ts` calls it:
Labirynt's HEGEMON prints `natura: dowolna` as well.

### State beyond Miecz, Magia, Życie and Złoto

Debt. Outlaw status. Imprisonment in the Wieża. How many Upiory are attached
(one, two or three, stacking). A raisable **maximum** Życie, distinct from
current Życie — Jaskinia's Posąg raises the indicator itself. Multi-turn timers:
*tracisz 3 następne tury*, and *przez 3 następne tury przesuwasz się tylko o 1
Obszar*, which is not the same as losing a turn. Board flags that outlive the
turn — Jaskinia's Potężne Wrota *stay open to the end of the game*. A shared pot
on a field, Krypta's Skarbona Upiora Chciwości, which players throw gold into.

### Not cards at all

Standee sheets in every set. Gród's five pionki. Krypta's żetony, six stands and
its own die. Jaskinia's two Tabela cards, which are die-roll tables that belong
to no field.

## What this suggests, when the day comes

Nothing here needs doing now. What it argues for, in the order the evidence is
strongest:

1. **Identity comes from the coordinate, not the name.** `source` is already a
   collector number. Where a name repeats — and it does, inside one sheet — the
   coordinate is what tells two cards apart. A `set:slug` id is the readable
   half and cannot be the whole of it.
2. **A field's neighbours are a list, not a pair.** Widening `adjacent` to
   `string[]` costs almost nothing today and is the single change that unblocks
   three of the four boards.
3. **Two of these are standalone games**, not modules. Krypta doubles every
   Miecz and Magia when played alone. Whatever "load a set" comes to mean, it is
   not always "add to the base game".
