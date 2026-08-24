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
- [ ] `npm install` and a booting dev server
- [ ] `db/schema.sql` for the `magiczny_miecz` schema in `biggerfish`
- [ ] `CLAUDE.md`

## Phase 1 — Asset pipeline

Turning 689 MB of image-only PDFs into files the system can be built on.

- [x] Native-resolution image extraction from the scans (`scripts/lib/pdf-images.mjs`)
      — the scans are 2480×3508; rasterising the page instead gives 595×841
- [x] Dependency-free PNG encoder + cropper (`scripts/lib/png.mjs`)
- [ ] Automatic grid detection and card slicing
- [ ] Extract every base-game sheet to individual card images
- [ ] `assets/catalogue.json` — every source PDF, what it holds, how many
- [ ] Verify counts against the rulebook (165 / 30 / 30 / 27 / 4 / 4)
- [ ] Web-optimised card images into `public/`

## Phase 2 — Transcription

Every scan is image-only with no text layer, so all of this is read visually.

- [x] Rulebook read end to end (9 pages)
- [ ] `docs/RULES.md` — full rulebook transcribed to structured markdown
- [ ] Board fields: names, ring membership, adjacency, printed instructions
- [ ] 165 event cards → typed data
- [ ] 30 spells → typed data
- [ ] 30 items (swords / shields / equipment) → typed data
- [ ] 27 characters → typed data
- [ ] Resolve the rule 2.6 discrepancy (spell table vs. the worked example)

## Phase 3 — Engine

Pure TypeScript, no React and no Supabase, so it is unit-testable in isolation.

- [ ] State and move types
- [ ] Board topology — Dolny Krąg + Kamienny Most are verified; the middle and
      upper rings still need reading off the board
- [ ] Effects ports: `RandomPort` (physical die vs. RNG), `DeckPort`
- [ ] Derived stats: total Miecz/Magia, spell capacity, nature gating
- [ ] Legal-move computation
- [ ] Card resolution ordering (15.1–15.2, 16.1–16.8)
- [ ] Combat and magic combat (17, 18)
- [ ] Ring crossings (11) and the bridge (14)
- [ ] Vitest coverage for the above

## Phase 4 — Companion app

The primary mode: physical board and cards, app as referee.

- [ ] Game + seat model, join code, no accounts
- [ ] Table view (shared screen) and player view (phone)
- [ ] Card identification by type-ahead on name
- [ ] Manual override on every tracked value
- [ ] Physical-die input as an alternative to the app rolling
- [ ] Supabase Realtime sync

## Phase 5 — Full simulation

Secondary. Same engine, virtual ports.

- [ ] Board rendering from the scan
- [ ] Virtual deck and dice
- [ ] Hidden information per player

---

## Known corrections

- The number at the top of each card is a **Roman numeral for the card class**
  (I Spotkanie, II Wróg, V Przedmiot), used for resolution ordering in 15.2 —
  it is *not* a unique card id. Cards cannot be identified by number.
