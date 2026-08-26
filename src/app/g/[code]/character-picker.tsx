"use client";

/**
 * Choosing a Karta Postaci: the strip of 28 tiles along the foot of the
 * poczekalnia, and the one card in the column beside it that is big enough to
 * read.
 *
 * The two halves are one thing. You run along the strip, each tile you point at
 * opens in the reading column, and the one you stop on is the one you take —
 * which is why the big card lives here rather than with the lobby's other
 * furniture.
 */

import Image from "next/image";
import type { Character } from "@/data/types";
import { characterImageUrl, characterStandeeUrl } from "@/lib/view/cardImages";
import { characterTitle } from "@/lib/engine/polish";
import {
  RANDOM_CHARACTER_ID,
  isRandomPick,
  type SeatCharacter,
} from "@/lib/engine/characters";
import {
  cardOwners,
  charactersInOrder,
  seatColour,
  seatNameInline,
  stripColumns,
  surpriseTakers,
  takenBorder,
  tileDimming,
  type LobbySeat,
} from "./lobby-view";

/**
 * The whole strip: the surprise first, then the 27 printed characters.
 *
 * Two rows deep. One row of 28 needed a long horizontal drag to reach the far
 * half of the roster, and the characters at the end were the ones nobody ever
 * looked at.
 */
export function CharacterStrip({
  characters,
  seats,
  target,
  pendingCharacterId,
  busy,
  onPreview,
  onPick,
}: {
  characters: Character[];
  /** Every seat at the table, for working out who is holding what. */
  seats: readonly LobbySeat[];
  /** The seat being chosen for, or null when this device may choose for nobody. */
  target: LobbySeat | null;
  /** Asked for, not yet granted. Everything else in the strip waits with it. */
  pendingCharacterId: string | null;
  busy: boolean;
  onPreview: (characterId: SeatCharacter | null) => void;
  onPick: (characterId: string) => void;
}) {
  const inOrder = charactersInOrder(characters);
  const owners = cardOwners(seats);
  const takers = surpriseTakers(seats);

  return (
    // Height is left to the content — a cap here silently cut the second row's
    // names off.
    // `w-fit` + `mx-auto`: a full-width grid pushed the columns apart, so 27
    // cards sat in a thin spread across the whole screen instead of side by
    // side with margins either side of them. When they do not fit, the margins
    // collapse to nothing and this scrolls.
    <div className="overflow-x-auto pb-1">
      {/* The columns share whatever width is left, so all 28 tiles are on
          screen at once and each is as large as that allows — capped,
          because past a point they stop being easier to read and start
          being a poster.
          Sizing them in fixed pixels instead pushed five characters off the
          right-hand edge, which is the drag-to-find problem that put them
          in two rows in the first place. */}
      {/* Row by row. Filling column-first put Awanturnik above Barbarzyńca
          and Błędny Rycerz in the next column along, so the alphabet ran
          down-then-across and finding a name meant reading a boustrophedon.
          Explicit columns rather than `grid-flow-col grid-rows-2`, because
          row-first flow has no way to say "two rows" — it has to be told
          how wide a row is. */}
      <div
        style={{ gridTemplateColumns: `repeat(${stripColumns(inOrder.length)}, minmax(0, 1fr))` }}
        className="mx-auto grid w-full max-w-[1708px] gap-2"
      >
        <RandomChoice
          takenBy={takers}
          mine={isRandomPick(target?.characterId ?? null)}
          aimed={target !== null}
          busy={busy || pendingCharacterId !== null || !target}
          pending={pendingCharacterId === RANDOM_CHARACTER_ID}
          dimmed={pendingCharacterId !== null && pendingCharacterId !== RANDOM_CHARACTER_ID}
          onPreview={onPreview}
          onPick={() => onPick(RANDOM_CHARACTER_ID)}
        />
        {inOrder.map((character) => (
          <CharacterTile
            key={character.id}
            character={character}
            // Every character somebody holds is out, and wears the colour of
            // whoever holds it — the same colour as their dot on the board and
            // the stripe on their slot. Who took Kapłanka is a question people
            // ask out loud, and the answer was only readable by comparing the
            // strip against six seat cards one at a time.
            owner={owners.get(character.id) ?? null}
            ours={target?.characterId === character.id}
            aimed={target !== null}
            busy={busy}
            pending={pendingCharacterId === character.id}
            waiting={pendingCharacterId !== null && pendingCharacterId !== character.id}
            onPreview={onPreview}
            onPick={() => onPick(character.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** One of the 27 printed Karty Postaci. */
function CharacterTile({
  character,
  owner,
  ours,
  aimed,
  busy,
  pending,
  waiting,
  onPreview,
  onPick,
}: {
  character: Character;
  /** The seat holding this card, if anybody is. */
  owner: LobbySeat | null;
  /** Held by the seat the strip is aimed at. */
  ours: boolean;
  aimed: boolean;
  busy: boolean;
  pending: boolean;
  waiting: boolean;
  onPreview: (characterId: SeatCharacter | null) => void;
  onPick: () => void;
}) {
  const colour = owner ? seatColour(owner) : null;
  // The mała Karta — the one that goes in a plastic stand. It carries its own
  // name in print and is a figure rather than a page, which is what makes 27 of
  // them scannable at this size where 27 pages of small type were not.
  const standee = characterStandeeUrl(character.id);
  const dim = tileDimming({ pending, waiting, held: owner !== null, ours, aimed });

  return (
    // Pointing at a card reads it, and that has to work for cards nobody can
    // choose. A disabled button fires no mouse events at all, so with the
    // handlers on the button itself every character somebody had already taken
    // became unreadable — which is exactly when you most want to know what it
    // does.
    <div
      className="min-w-0"
      onMouseEnter={() => onPreview(character.id)}
      onMouseLeave={() => onPreview(null)}
    >
      <button
        // Already theirs: nothing to ask for. Re-sending it would rewrite the
        // seat with the values it already has and, worse, clear the ready flag
        // — so the one thing a second click on your own character could do is
        // un-ready you.
        disabled={busy || owner !== null || !aimed || pending || waiting}
        onClick={onPick}
        onFocus={() => onPreview(character.id)}
        onBlur={() => onPreview(null)}
        title={characterTitle(character)}
        // Whoever holds it, holds it — including while somebody else's pick is
        // in flight. Dropping the colour during `waiting` left the border with
        // no colour class at all, so it fell back to `currentColor` and every
        // taken card turned gold for as long as the request took.
        style={colour && !pending ? { borderColor: colour, borderWidth: 2 } : undefined}
        className={`relative block w-full overflow-hidden rounded border transition disabled:cursor-default ${
          pending
            ? "animate-pulse border-ochre"
            : colour
              ? "" // the border colour is set inline, and stays lit
              : "border-edge hover:border-ochre"
        }`}
      >
        {standee ? (
          <Image
            src={standee}
            alt={character.name}
            width={114}
            height={190}
            className={`h-auto w-full transition-opacity ${dim}`}
          />
        ) : (
          <span
            className={`flex aspect-[114/190] items-center p-2 text-center text-[12px] text-ink transition-opacity ${dim}`}
          >
            {character.name}
          </span>
        )}
        {/* Whose it is, written across the foot of the card in their colour.
            The colour alone says somebody has it; six people round a table need
            it to say *who*, and the seat cards are too far from the strip to
            answer that by comparison. */}
        {owner && (
          <span
            style={{ background: colour ?? undefined }}
            className="absolute inset-x-0 bottom-0 flex h-[14.3%] min-h-[21px] items-center justify-center overflow-hidden px-0.5 text-[13px] font-medium leading-none text-night"
          >
            <span className="truncate">{seatNameInline(owner)}</span>
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * The first tile in the strip: take whatever comes.
 *
 * Sits ahead of the 27 printed characters because it is the rulebook's own
 * default — "należy potasować Karty Postaci, a następnie rozłożyć losowo" — and
 * choosing from the strip is the variant everybody has to agree to. Picking it
 * is a decision, not a deferral: the seat can be ready, and what it turns into
 * is not settled until the game starts.
 *
 * The one tile that is never unavailable. There is a single Kapłanka, but no
 * limit on how many people want a surprise, so this is never dimmed for being
 * taken and never disabled for somebody else holding it — it behaves exactly
 * like a card nobody has picked, because in the only sense that matters to a
 * player looking at the strip, nobody has. Who *has* picked it is carried by
 * the border and the row of names instead.
 */
function RandomChoice({
  takenBy,
  mine,
  aimed,
  busy,
  pending,
  dimmed,
  onPreview,
  onPick,
}: {
  /** Every seat holding the surprise, in seat order. */
  takenBy: LobbySeat[];
  mine: boolean;
  /** Whether there is a seat to choose for at all. */
  aimed: boolean;
  busy: boolean;
  pending: boolean;
  dimmed: boolean;
  onPreview: (characterId: SeatCharacter | null) => void;
  onPick: () => void;
}) {
  const standee = characterStandeeUrl(RANDOM_CHARACTER_ID);
  const border = takenBorder(takenBy);
  // The same ladder the other tiles climb, minus the owner-dimming: a card that
  // cannot be taken away from you is never the greyed-out kind. `mine` needs no
  // mention of its own — a seat can only be holding the surprise if there is a
  // seat being aimed at.
  const dim = tileDimming({ pending, waiting: dimmed, held: false, ours: mine, aimed });

  return (
    <div
      className="min-w-0"
      onMouseEnter={() => onPreview(RANDOM_CHARACTER_ID)}
      onMouseLeave={() => onPreview(null)}
    >
      <button
        // Live even while somebody else holds it — unless that somebody is you,
        // in which case there is nothing to ask for and a second click could
        // only un-ready you.
        disabled={busy || mine}
        onClick={onPick}
        onFocus={() => onPreview(RANDOM_CHARACTER_ID)}
        onBlur={() => onPreview(null)}
        title="Losowa — Karta Postaci zostanie wylosowana i odsłonięta po rozpoczęciu gry"
        style={border && !pending ? { borderColor: border, borderWidth: 2 } : undefined}
        className={`relative block w-full overflow-hidden rounded border transition disabled:cursor-default ${
          pending ? "animate-pulse border-ochre" : border ? "" : "border-edge hover:border-ochre"
        }`}
      >
        {standee && (
          <Image
            src={standee}
            alt="Losowa postać"
            width={114}
            height={190}
            className={`h-auto w-full transition-opacity ${dim}`}
          />
        )}
        {/* Everybody who wants a surprise, stacked in seat order — the same
            order they sit in above, so the strip and the roster read as one
            list. The other tiles need only one of these; this is the only
            place two people can be standing on the same card. */}
        {takenBy.length > 0 && (
          <span className="absolute inset-x-0 bottom-0 flex flex-col">
            {takenBy.map((seat) => (
              <span
                key={seat.id}
                style={{ background: seatColour(seat) }}
                className="flex min-h-[21px] items-center justify-center overflow-hidden px-0.5 text-[13px] font-medium leading-none text-night"
              >
                <span className="truncate">{seatNameInline(seat)}</span>
              </span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * The Karta Postaci in the reading column, big enough to read.
 *
 * A character is four numbered clauses of Charakterystyka and two numbers, and
 * every one of them matters to the choice being made to the left of it — but at
 * strip size the print is a grey smudge, and a player picking Kat has no way to
 * find out what Kat does without picking it first.
 */
export function ReadingCard({
  reading,
  character,
}: {
  /** What the cursor is over, or what the aimed seat is holding. */
  reading: SeatCharacter | null;
  /** The Karta for it — null for the surprise, which has no card to look up. */
  character: Character | null;
}) {
  if (isRandomPick(reading)) return <RandomCard />;
  if (reading) return <BigCard character={character} />;
  return (
    <p className="max-w-[16rem] text-center text-[12px] leading-relaxed text-muted/70">
      Najedź na postać, żeby przeczytać jej Kartę.
    </p>
  );
}

/** The reading column's version of the surprise: the card itself, and nothing said about it. */
function RandomCard() {
  const src = characterImageUrl(RANDOM_CHARACTER_ID);
  if (!src) return null;
  return (
    <Image
      src={src}
      alt="Karta Postaci: losowa"
      width={780}
      height={972}
      className="max-h-full w-auto rounded border border-edge object-contain"
      priority
    />
  );
}

/** The big card, filling the column and never overflowing it. */
function BigCard({ character }: { character: Character | null }) {
  if (!character) return null;
  const src = characterImageUrl(character.id);
  if (!src) {
    return (
      <p className="text-center text-[12px] text-muted">
        {character.name} — brak skanu Karty
      </p>
    );
  }
  return (
    <Image
      src={src}
      alt={`Karta Postaci: ${character.name}`}
      width={780}
      height={972}
      className="max-h-full w-auto rounded border border-edge object-contain"
      // The one image on the page somebody actually reads, so it is worth
      // fetching before it is asked for rather than after.
      priority
    />
  );
}
