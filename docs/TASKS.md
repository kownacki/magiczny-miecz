# Tasks

Living checklist for the revival. Updated as work lands — this is the file to
watch for progress.

Scope for v1: **base game only** (Magiczny Miecz). The five expansions
(Gród, Jaskinia, Krypta Upiorów, Labirynt Magów, Magia) are out of scope and
their scans are deliberately untouched.

---

## Phase 0 — Foundation

- [x] Park the 2020 Lit/Firebase app on the `legacy-lit` branch
- [x] Strip the repo to `assets/` and rebuild as Next 16 + TS + Tailwind 4
- [x] Configs: `package.json`, `tsconfig`, `next.config`, `postcss`, `eslint`
- [x] `.env.example` documenting every credential
- [x] `npm install` (dev server not yet booted)
- [x] `db/schema.sql`, applied and smoke-tested; anon confirmed locked out
- [x] `CLAUDE.md`

## Phase 1 — Asset pipeline

Turning 689 MB of image-only PDFs into files the system can be built on.

- [x] Native-resolution image extraction from the scans (`scripts/lib/pdf-images.mjs`)
      — the scans are 2480×3508; rasterising the page instead gives 595×841
- [x] Dependency-free PNG encoder + cropper (`scripts/lib/png.mjs`)
- [x] Automatic grid detection and card slicing
- [x] Extract every base-game sheet to individual card images (267)
- [x] `assets/extracted/catalogue.json` — every source PDF, what it holds, how many
- [x] Verify counts against the rulebook — all six match exactly
- [x] Web-optimised card images into `public/` — 267 slices, 9.8 MB, committed

## Phase 2 — Transcription

Every scan is image-only with no text layer, so all of this is read visually.

- [x] Rulebook read end to end (9 pages)
- [x] `docs/RULES.md` — the whole rulebook, verbatim, 109 numbered rules.
      Every one of the 72 rules the engine cites is present.
- [x] Dolny Krąg field instructions — all 14 transcribed and shown in the turn
      panel. Draw counts agree with the independently-read engine data.
- [x] Board fields: all 58 read off the scans and ordered. Each edge was read as
      ONE continuous strip so both corners fell in the same image, which forces
      the splice. Corroborated two ways: reading down the left edge reproduces
      Dolny Krąg indices 9-13 exactly, and the four twice-printed names land in
      symmetric positions. **Not yet checked against the physical board** —
      `RINGS_VERIFIED_AGAINST_PHYSICAL_BOARD` is false and rings.test.ts encodes
      every constraint the rulebook places on them.
<!-- superseded, kept for the record:
- [~] Board fields: 58 fields read off the scans. Names and ring membership are
      corroborated — all five rule cross-checks pass (Uroczysko/Las Błędnych
      Ogni, Przełęcz Wichrów/Dolina Czaszek, both bridge crossings, both bridge
      entrances). **Cyclic order is NOT verified** and is deliberately not wired
      into movement: the outer ring came out shorter than the middle ring, which
      is backwards for concentric rings. A second attempt from full-board views
      confirmed the bridge order exactly but could not splice the outer two
      rings — their edges mix fields from different rings, four names repeat
      symmetrically (Bagna, Ruchome Skały, Urwisko, Rozstajne Drogi), and the
      corners are ambiguous. **Fastest fix is to read the order off the physical
      board.**
-->
- [x] 165 event cards → typed data
- [x] 30 spells → typed data
- [x] 30 items → typed data (14 unnamed in the print files, named in overrides.json)
- [x] 27 characters → typed data
- [x] Rule 2.6 read at full resolution: 1->0 2->1 3->2 4->2 5->3 6+->3, capped at 3.
      The worked example beneath it is garbled in the scan; the table wins.

## Phase 3 — Engine

Pure TypeScript, no React and no Supabase, so it is unit-testable in isolation.

- [x] State and move types
- [x] Board topology — all four rings: Dolny (14), Środkowy (16), Górny (18),
      Kamienny Most (9)
- [x] Effects ports: `RandomPort`, `DeckPort`, `ChoicePort`
- [x] Derived stats: totals, spell capacity, carrying limit, nature gating
- [x] Legal-move computation (both directions round a ring, with the route walked)
- [x] Card resolution ordering (15.2, 16.4)
- [x] Combat and magic combat (17, 18) incl. the Beast (14.7)
- [x] The Beast and victory (14.7, 22) — two dice set the fight kind and its
      strength 10-15; losing costs two Życia, winning ends the game
- [x] Death (4.4), carrying limit (5.4), spell capacity (2.6, 9.2), trophies (1.4)
- [x] Player-versus-player combat (17.6) and escape (17.2, 19)
- [x] Nature changes (7.2) and Turned to Stone (20)
- [x] Bridge movement (10.3, 10.4) — one field per turn, die ignored, may turn back
- [x] Ring crossings (11.1-11.8) — the two the rules allow, and nothing else
- [x] Stepping onto the bridge from Górny Krąg (11.9-11.11) — only from Wymarłe
      Miasto or Ruiny Twierdzy, only with a Magiczny Miecz, guardian first
- [x] The whole route start-to-Beast is asserted end to end in playthrough.test.ts
- [x] Vitest coverage — 53 tests green; caught a real bug where healing
      drained a character who was above four Życie

## Phase 4 — Companion app

The primary mode: physical board and cards, app as referee.

- [x] Game + seat model, join code, no accounts
- [x] Table view — responsive, so a phone gets the same page with only its own controls
- [x] Card identification by type-ahead on name, diacritics folded
- [x] Manual override on every tracked value, journalled as manual
- [x] Physical-die input alongside the app rolling, everywhere a die is needed
- [~] Sync — 2s polling; the Realtime revision ping drops into the same seam

## Card effects

- [x] Suggested actions: unconditional card text becomes a one-tap button,
      applied through the same journalled correction path as the manual +/-
- [x] Conditional text (Nature, die roll, choice, all-players) suggests nothing
      at all, deliberately — a plausible wrong button is worse than none
- [x] Roll-table cards and fields ("rzuć kostką: 1 - ...") — parsed into six
      outcomes with a die to roll against them. Commits only when all six faces
      are covered exactly once, so Czarci Młyn (two tables) and Osada (the 1993
      printing claims face 2 twice) are correctly refused and fall back to text.
- [ ] Nature-dependent cards — the seat's Nature is known, so these are
      resolvable once Kat's setup choice is handled

## Card display

Show the actual scanned card beside the turn, in both modes. In simulation it
is the only way to see what you drew; at a physical table it settles "what does
this one do again?" without passing the card round.

- [x] Export card slices to web-sized images keyed by slice reference
- [x] Side panel showing the drawn card, or the whole stack when a field draws
      several (Bezdroża draws 2, Płaskowyż Mgieł draws 3)
- [x] Fall back to text when a card has no image
- [x] A seat's hand listed on its card, with concealment applied server-side
- [x] The seat's character card as an image, with its abilities

## Card effect vocabulary — the next big piece

Every card's text is transcribed, but the app only *reads* it back. To resolve
cards without a human interpreting each one, they need a small set of typed
effects the engine can apply — and the vocabulary has to be derived from what
the 165 cards actually say, not invented up front.

The shape the cards suggest so far:

- **what happens**: adjust a stat, move the character, draw more cards, take or
  lose a card, lose a turn, change Nature, turn to stone, start a fight
- **on whom**: the drawer, every player, players of one Nature, players in one
  ring
- **under what condition**: a Nature, a die roll, a choice, holding some item
- **what becomes of the card afterwards** — this is its own axis and the deck
  leans on it heavily: discarded ("odłóż Kartę"), left lying on the field until
  someone deals with it ("Pozostanie tu, aż ktoś go pokona"), kept by the player,
  or moved to a named field ("Połóż tam Kartę")

Jednorożec is the worked example: it moves the character to any field in the
ring, then the card is discarded whether or not the offer was taken.

- [ ] Derive the vocabulary from the transcribed corpus rather than guessing
- [ ] Type it, with an exhaustive `Record` per behaviour so a new effect kind
      fails the build at every site that must handle it
- [ ] Encode cards against it, leaving unencoded cards falling back to today's
      "show the text and let a human apply it" — the progressive-enhancement
      rule stays
- [ ] Card disposition as a first-class field, since where a card ends up is
      what makes fields accumulate cards over a game

## Phase 5 — Full simulation

Now the primary mode; companion is the opt-in.

- [x] Virtual deck — 165 event cards and 30 spells, shuffled, dealt, recycled
      (9.5). Every printed copy is in the pile, so draw odds match the sheets.
- [x] Virtual dice everywhere a die is needed
- [x] Hidden information per player — concealment applied on the server, so a
      rival's spells never reach the device at all
- [x] Board rendering — a drawn map of all three rings and the bridge, one
      shape per field, a coloured dot per character, fanned when several share a
      field. Tapping a field shows its printed text. Serves simulation as the
      board and companion mode as the position check.
- [x] Middle and outer ring field text — 34 fields transcribed from the scan;
      `scripts/build-ring-fields.mjs` checks every draw count against the count
      the engine already carried from a separate pass. All 34 agree.
- [x] Verify the middle/outer ring order — done from the scan rather than the
      physical board. The whole board was read at once, which settled what three
      earlier tile-by-tile passes could not, and boardMap.test.ts now holds the
      two independent readings against each other.

---

## Open, found while playing

These came out of playing a real game through the browser. Each is a rule the
engine gets wrong or does not have, not a missing feature.

- [ ] **Guardians are still adjudicated by hand.** The board text gives their
      strength exactly — Kamienny Potwór and Duch Skał are a die plus four,
      Rycerz Wiecznych Śniegów is a flat Miecz 10 — so simulation can fight them
      instead of asking the players who won. `BRIDGE_ENTRANCES` now carries the
      stat and the offset; the fight itself is not wired up.
- [x] **11.10: the bridge is entered in passing, not on arrival.** Now a third
      move option, offered only when the walk passes an entrance with a step
      still to spend, and never when the move ends on one.
- [x] **11.11: no retry next turn.** A failed or drawn attempt marks the seat
      and the option is withheld for exactly one round.
- [x] **A crossing can be retried.** The choice is offered before the roll as
      well as on arrival, which is what 11.4 describes.
- [x] **No card is drawn when stepping onto the Most** — the entrance field is
      no longer resolved at all, so the exemption holds by construction. The
      Trzęsawiska and Lodowy Las equivalents are stated in the crossing panel
      rather than enforced, because staying and drawing is a legal choice.
- [x] **Przeprawa charges its toll.** Pay 1 Sz. Z. and carry on, or the whole
      move is undone and the turn ends where it began.
- [ ] **11.4's draw outcome.** The rulebook allows a drawn crossing — no Życie
      lost, but the character still stops. The Uroczysko card admits no draw
      ("mniejszy lub równy" succeeds), so the two disagree; the card is followed
      and the discrepancy is recorded here rather than silently resolved.


## Known corrections

- The number at the top of each card is a **Roman numeral for the card class**
  (I Spotkanie, II Wróg, V Przedmiot), used for resolution ordering in 15.2 —
  it is *not* a unique card id. Cards cannot be identified by number.


## Findings worth keeping

- **Dolny Krąg was stored counter-clockwise.** The cycle was right, so every
  distance and adjacency was right, but `destination` reads a rising index as
  "zgodnie ze wskazówkami zegara" — so the app named the two directions the
  wrong way round on the lower ring. Harmless in simulation, wrong at a table
  where a hand moves the figure. The scan settles it: that ring's top edge reads
  Osada, Step, Mokradła left to right. All three rings are now stored clockwise
  and boardMap.test.ts holds them to it.
- **The two bridge entrances were crossed.** Ruiny Twierdzy sits on the outer
  ring's top edge and opens onto the top of the bridge; Wymarłe Miasto is on the
  bottom edge and opens onto the bottom. They were mapped to the opposite ends,
  which walked a character the length of the bridge past the wrong creatures.
- **Only one direction of each crossing is defended** (11.3, 11.7, and both
  fields' printed text). Going back down costs nothing and needs no roll; the
  app was charging a point of Życie for failing a test the rules do not set.
- **Rycerz Wiecznych Śniegów stands on Przełęcz Wichrów, not Dolina Czaszek** —
  Miecz 10, and he ignores anyone arriving from Dolina Czaszek.
- The board's own draw counts agree with the ring arrays on **all 34** middle
  and outer ring fields, which is two independent readings of the scan agreeing.

- The deck contains genuine **duplicates** (4x "1 SZTUKA ZŁOTA", 2x "UPIÓR",
  4x "MAGICZNY MIECZ"), so a card id is not unique. `sheet + index` is the key.
  These are **deliberate design, not a transcription artefact**: the assets are
  printed sheets the owner cuts up with scissors, and a card printed four times
  is four times as likely to be drawn. The simulated deck holds every printed
  copy, so draw odds match the physical game exactly. Asserted in deck.test.ts.
  The game is reproduced 1:1 from the assets and the rulebook; any deliberate
  deviation gets documented when it is made.
- **Kat** prints `natura: dowolna` and chooses at setup — the only character the
  three-value Nature enum cannot hold. Hence `StartingNature`.
- **Tragarz** is filed as a Przyjaciel, not a Przedmiot, so the rule 5.4
  carrying-limit check cannot key off item-ness.
- Fourteen cards shipped with the placeholder title **"NAZWA KARTY"** — the
  print files were never finished. Named from their body text in overrides.json.
- Event class split: przedmiot 63, wrog 32, spotkanie 20, przyjaciel 20,
  nieznajomy 17, miejsce 13 = 165.

- The resolution numerals printed on the cards are **I Spotkanie, II Wróg,
  IV Nieznajomy, V Przedmiot, V Przyjaciel, VI Miejsce** — verified against the
  card headers. Przedmiot and Przyjaciel share V, matching rule 16.6 which names
  them in one clause. III is unused by any base-game card. An earlier guess of
  III/IV for Nieznajomy/Przyjaciel resolved turns in the wrong order.
