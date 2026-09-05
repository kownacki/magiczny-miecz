# Assets

How 689 MB of scans became the pictures in `public/`, and every trap the
pipeline has. Lifted out of CLAUDE.md on 2026-09-06: it was a third of a file
that loads into every session and every agent, and it is needed only when
somebody touches the pipeline itself. Nothing here changed in the move.

macOS-only throughout (`sips`, and the system's own Bodoni), like the rest of
the pipeline.

`assets/raw/` holds 689 MB of scans mirrored from Drive and is gitignored. Every
scan is image-only with **no text layer**, so all transcription is done by
reading images. `node scripts/extract-assets.mjs` rebuilds `assets/extracted/`
(also gitignored) at native resolution — 2480x3508 per sheet, sliced into cards
by detecting the printed cut lines. That slicer cannot handle either Karta
Postaci — the small ones sit in teal gutters it cuts only roughly, and the big
ones butt together with the same teal printed *on* them — so
`node scripts/build-character-cards.mjs` re-cuts both sets to one size each.
`node scripts/export-card-art.mjs` cuts the framed illustration out of every
card — the same rectangle on all of them, 10%–90% across and 14.5%–56.5% down —
for use as an icon where a whole card would be a grey smear.
`node scripts/export-tokens.mjs` cuts the thirteen Żetony Pomocnicze — Miecz,
Magia and Życie in denominations of 1 to 4, and the Sztuka Złota — off `MM -
Żetony.pdf` into `public/tokens/`, which is committed.
`node scripts/export-card-back.mjs` cuts one back per pile into
`public/cards/back-*.jpg`, committed. The ZDARZENIE back was in the scans all
along, filed where nobody would look — the five of them share sheet 9's reverse
with the Zamieniony w Kamień cards, the Dobry/Zły markers and the standees,
which is why there is no "Karty Zdarzeń (tyły)" file to go looking for. The
ZAKLĘCIE and WYPOSAŻENIE backs were **not** in the Drive at all: they came from
the community archive `oficjalne.rar` (linked from the *MAGICZNY MIECZ DO
DRUKU* thread on forum.magiaimiecz.eu), which carries a `rewersy/` folder the
Drive copy does not, at the same 2480x3508 as everything else. Those two are
mirrored into `assets/raw/MM - Magiczny Miecz/Rewersy/` under the archive's own
spelling. macOS `bsdtar` reads RAR; `unar` is not needed.
`node scripts/export-nature-card.mjs` builds 7.2's Karta Zmiany Natury, one
per Natura, into `public/cards/natura-*.jpg`, committed. **There is no third
face and no scan of one**: not in the box and not in any of the five
expansions, checked on the Gród, Labirynt Magów and Krypta Upiorów piony
sheets and their reverses. Chaotyczna is the Natura the card is *absent* for,
which works at a table because the Karta Postaci is lying there saying what
the character started as, and does not work for a referee that has to name the
current Natura outright.

None of the printed lettering is used. `Zły` is a calligraphic italic in title
case and `DOBRY` is Roman capitals on the reverse — two thirds of one object
that read as two objects, which a third in either hand makes worse rather than
better. So all three words are **set here**, one face at one size, in Bodoni:
the Didone nearest the sheet, and nearer than the Times `make-random-card.py`
uses, which is that card's because it imitates a Karta Postaci title band.

The frame is the box's, and it comes in **pieces**. A card here is a white
field with a quarter-circle bitten out of each corner and nothing else — the
straight edges carry no printing — so `buildCard` cuts the four corners off
sheet 9's `Zły` and stands them on a white field of any shape with the teal
painted round it. That is what lets this card lie **on its side**
(`NATURE_CARD_RATIO`) so `CHAOTYCZNY` fits at the same size as `ZŁY` with
nothing squashed — turned, not reshaped: it keeps the printed card's own 398 by
705, which the script re-measures and warns about on every run. Corners scale off the shorter side, because a
bitten corner is a fixed thing a blade did. If an expansion card turns out to
have a rule down its edges, a fifth and sixth piece go in there.

macOS-only (`sips`, and the system's own Bodoni) like the rest of the pipeline.
`node scripts/generate-ids.mjs` regenerates `src/data/ids.ts` — the literal
id types — and must be re-run after anything that renames a card or a
character. Then `node scripts/export-card-images.mjs` writes the
web-sized JPEGs into `public/cards/` — those *are* committed, so a fresh
checkout has the pictures without needing the scans.

`python3 scripts/set-missing-card-titles.py` runs **after** that one and
overwrites fourteen of its files. The box went to print with the template's
own words in the title band of ten cards on the *Wyposażenie i Zaklęcia*
sheet and four on the *Wyposażenie* one — **NAZWA KARTY**, corner labels
still reading "Wyposażenie / Wyposażenie" — so the scans say it and
`src/data/raw/` records it verbatim, because a transcription that quietly
corrected the paper is one you cannot check against the paper. Thirteen of
the fourteen never surfaced: every other Wyposażenie card is also in the
event deck under the same id and `cardImages.ts` walks that deck first. The
Tarcza Tolimana is the exception, its twin being filed as TARCZA BOGA
TOLIMANA, so it was the one card in the game whose picture said NAZWA KARTY.
The name is *set* rather than lifted off the event card, which would carry
that other title across; Times New Roman condensed to the measured 0.92,
scaled by cap height and placed on the printed baseline. Needs Pillow, like
`make-random-card.py` and for the same reason.

**The board is a painting with 57 torn parchment scraps printed over it**, one
per Obszar, and three scripts share `scripts/lib/parchment.mjs`, which draws the
line between the two. It does **not** find the scraps by brightness: the paper
is pure white and unsaturated, and so are the snow, the cloud, the slabs of the
Kamienny Most and every highlight — 23% of the board passes a threshold tight
enough to throw away a third of the real paper, and the first attempt called
53.7% of the board parchment. Four rules do it instead, and each is there
because the one before it was not enough. Seed only on paper that is
unmistakably paper (238, against the 200–225 of the pale artwork beside it);
seed only *beside lettering*, which keeps out the snowfield by Urwisko and the
cliff by Ruiny Twierdzy — as white as the paper, touching it, and with nothing
printed on them; keep only fills the field's words are printed **on**, which
keeps out the snow directly above Ruiny Twierdzy's top line; and bound every
fill to the field's own square, without which one scrap's fill reaches the next,
takes its box, takes its lettering and grows again.

So `src/data/field-text-boxes.json` is load-bearing twice over — it says where
each description is, and it is the only record of a point that is certainly
paper — and `src/data/field-cells.json` is what keeps each field inside its own
square. `fieldScraps` returns them one per field rather than as one mask,
because two neighbouring tears very nearly touch and growing both out to their
contours merges them: Strażnik Magicznych Wrót, Magiczne Wrota and Wieża
Przeznaczenia all measured the same blob before they were kept apart.

`node scripts/export-field-text.mjs` cuts the 57 descriptions out, de-rotated
and on a transparent ground, into `assets/extracted/field-text/`, and keeps the
masks in `assets/extracted/field-masks/`. Both are gitignored, and deliberately:
nothing renders them yet and the boxes regenerate them in seconds.
`node scripts/export-field-art.mjs` measures the complement — the largest
rectangle of each cell with no parchment in it — into the committed
`src/data/field-art-windows.json`, worst-first, with the crops in
`assets/extracted/field-art/`. Median 58.9% of the cell, worst 18.8%. Each crop
is **turned upright** by the quarter turn nearest its field's reading angle: the
board is painted to be read from all four sides of a table, so a window cut
straight off the scan comes out on its side or upside down. The number to act on
is still the *shape* rather than the area — some windows are usable art in an
awkward frame, and a few are letterboxes no crop rescues.

The growth out to the drawn contour goes through **anything**, for a fixed
number of pixels, and that is deliberate. It used to be allowed onto paper-ish
or dark pixels only, and those two tests do not meet: a pixel at luminance 141,
or a bright but saturated one, passes neither, and that is exactly the fringe
where the printed line blends into coloured artwork. The growth died on that
band where it was there and sailed through to the line where it was not, so the
boundary stopped at different distances a few pixels apart — a stepped
silhouette — and where the band lay on the line, the line came out chopped in
half. A fixed number of steps nothing can halt gives a boundary the same
distance from the core everywhere. It costs a two or three pixel rim of painting
where the outline is thinner than that, which against the picture it was cut
from reads as part of the scan; `export-parchment.mjs` takes that rim off its
own pieces, because on an eighty-pixel corner composited onto a parchment we
made it would read as a halo.

`node scripts/export-parchment.mjs` harvests the torn edge itself into
`public/parchment/`, which **is** committed, on the same reasoning as
`public/cards`. The point is to set the transcription we already have inside a
scrap we assemble, rather than ship 57 pictures of printed text that cannot
resize. It works because the edges are not a repeated stamp — every blob was
drawn separately, same hand and same idiom, no two sequences alike — so there is
no canonical corner to look for and no pattern an assembled edge could be caught
deviating from. The one constraint that makes the pieces a *library*: every one
is cut where its contour crosses the baseline **on the way out**, so any end
butts against any other without a step. `fieldBoards.test.ts` pins that every
run shares one height, which is what puts every baseline on the same row.
