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
- [ ] `docs/RULES.md` — full rulebook transcribed to structured markdown
      (read end to end already; not yet written down)
- [x] Dolny Krąg field instructions — all 14 transcribed and shown in the turn
      panel. Draw counts agree with the independently-read engine data.
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
- [x] 165 event cards → typed data
- [x] 30 spells → typed data
- [x] 30 items → typed data (14 unnamed in the print files, named in overrides.json)
- [x] 27 characters → typed data
- [x] Rule 2.6 read at full resolution: 1->0 2->1 3->2 4->2 5->3 6+->3, capped at 3.
      The worked example beneath it is garbled in the scan; the table wins.

## Phase 3 — Engine

Pure TypeScript, no React and no Supabase, so it is unit-testable in isolation.

- [x] State and move types
- [~] Board topology — Dolny Krąg (14 fields) and Kamienny Most (9) verified
      against the scan; middle and upper rings being read now
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
- [ ] Ring crossings (11.1-11.8) — blocked on verifying the middle/outer ring order
- [ ] Stepping onto the bridge from Górny Krąg (11.9-11.11) — same blocker
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
- [ ] The seat's character card as an image

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
- [ ] Board rendering from the scan

---

## Known corrections

- The number at the top of each card is a **Roman numeral for the card class**
  (I Spotkanie, II Wróg, V Przedmiot), used for resolution ordering in 15.2 —
  it is *not* a unique card id. Cards cannot be identified by number.


## Findings worth keeping

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
