/**
 * What the poczekalnia works out for itself: every decision behind the markup
 * in `lobby.tsx`, `seat-slot.tsx`, `character-picker.tsx` and `door.tsx`.
 *
 * None of it carries a rule number, because the rulebook has nothing to say
 * about a browser tab — `docs/LOBBY.md` is the authority for all of it. Two of
 * these answers are also the server's, and both say so where they are:
 * `startRefusal` is `startGame`'s two refusals written out a second time, and
 * `cardOwners` is 0.3's uniqueness. A second copy of a rule is a rule that will
 * drift, and the only defence is that both copies are somewhere they can be
 * read.
 *
 * It lived inside a 565-line component, which is a place nothing can be asked a
 * question.
 */

import type { Character } from "@/data/types";
import { SEAT_COLOURS } from "@/lib/view/boardMap";
import { characterStandeeUrl } from "@/lib/view/cardImages";
import {
  RANDOM_CHARACTER_ID,
  isRandomPick,
  asCharacterId,
  type SeatCharacter,
} from "@/lib/engine/characters";
import { MAX_SEATS } from "@/lib/game/modes";

/**
 * A seat as the poczekalnia sees it.
 *
 * Everything here is the server's answer rather than this device's: `away` is
 * decided in `envelopeFor` against `AWAY_AFTER_MS`, and `abandoned` is the
 * `abandoned_at` column. The browser is told, and does not work either out.
 */
export interface LobbySeat {
  id: string;
  seatIndex: number;
  playerName: string | null;
  characterId: SeatCharacter | null;
  isHost: boolean;
  /** Nobody is behind this seat — see `leaveGame`. */
  abandoned: boolean;
  /** Device has gone quiet, which is not the same as having left. */
  away: boolean;
  /** Said they are ready to start. */
  ready: boolean;
  /** Seated by the host in companion mode; has no device of their own. */
  noDevice: boolean;
}

/* --------------------------------------------------------------------------
 * Naming a seat.
 * ----------------------------------------------------------------------- */

/**
 * How a seat is named where a sentence starts, or on its own card.
 *
 * A seat can be nameless: the host seats somebody by hand in companion mode
 * without typing one, and a table where that shows as an empty slot is a table
 * nobody can be asked about.
 */
export function seatName(seat: LobbySeat): string {
  return seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`;
}

/**
 * The same name, lower case, for the middle of a sentence.
 *
 * Two spellings on purpose. Polish does not capitalise a common noun mid-clause,
 * and this is the spelling the server already uses in its own refusals —
 * "Nie wszyscy są gotowi: miejsce 3" — so the two halves of the app say the
 * same thing about the same seat.
 */
export function seatNameInline(seat: LobbySeat): string {
  return seat.playerName ?? `miejsce ${seat.seatIndex + 1}`;
}

/* --------------------------------------------------------------------------
 * Who may do what.
 * ----------------------------------------------------------------------- */

/**
 * Whether this device may reach for the table's controls at all.
 *
 * The host, and — when the host's own seat has been abandoned or has fallen
 * silent — anybody, because a table whose host closed their laptop could
 * otherwise never be configured or started again.
 *
 * This is the *wide* door, and only two things go through it: taking the host
 * role, which `takeHostRole` opens on exactly these terms, and aiming the
 * character strip at a seat with no device of its own. Everything else that
 * changes the table for somebody else — removing a player, dealing the Karty
 * Postaci, starting the game — is `isHost` and nothing else, because that is
 * what the server enforces.
 *
 * The two used to be one, and an absent host put two buttons on screen that
 * the server was about to refuse. A player at a stalled table pressed "usuń"
 * and got a 403 in Polish for their trouble, when the thing that would actually
 * have helped was the button beside it.
 */
export function mayAdminister(isHost: boolean, hostAway: boolean): boolean {
  return isHost || hostAway;
}

/** Everything the strip needs to know about who is holding this device. */
export interface Aiming {
  mySeatIndex: number | null;
  /** `mayAdminister`. */
  canAdminister: boolean;
  mode: string;
}

/**
 * Whose character you may choose.
 *
 * Your own, always. The one exception is companion mode, where the host seats
 * people who have no device of their own and so has to choose for them.
 *
 * Nobody else's. An earlier version let any visitor aim at any slot, which
 * meant a stranger could hand you a Kat — and the character route still allows
 * exactly that, since it takes whatever `seatId` the body names from any seated
 * player. This is the only place that refusal is made.
 */
export function mayChooseFor(seat: LobbySeat, aiming: Aiming): boolean {
  return (
    seat.seatIndex === aiming.mySeatIndex ||
    (aiming.canAdminister && aiming.mode === "companion" && seat.noDevice)
  );
}

/** The seat this device is sitting in, or null for somebody merely watching. */
export function mySeat(seats: readonly LobbySeat[], mySeatIndex: number | null): LobbySeat | null {
  return seats.find((seat) => seat.seatIndex === mySeatIndex) ?? null;
}

/**
 * The seat the character strip is pointed at.
 *
 * Your own unless you have deliberately aimed somewhere you are allowed to aim.
 * A stale pick — a seat that left, or one the mode no longer lets you choose
 * for — falls back to your own rather than staying aimed at nobody.
 */
export function aimedAt(
  seats: readonly LobbySeat[],
  pickingFor: LobbySeat | null,
  aiming: Aiming,
): LobbySeat | null {
  if (pickingFor && mayChooseFor(pickingFor, aiming)) return pickingFor;
  return mySeat(seats, aiming.mySeatIndex);
}

/* --------------------------------------------------------------------------
 * Starting.
 * ----------------------------------------------------------------------- */

/** Seats that have decided — the surprise counts, which is the whole point of it. */
export function chosenSeats(seats: readonly LobbySeat[]): LobbySeat[] {
  return seats.filter((seat) => seat.characterId);
}

/**
 * Why the table cannot start yet, or null when it can.
 *
 * This is the server's `startGame` guard a second time: one character at least,
 * and everybody holding one has said they are ready — a seat nobody is behind
 * cannot say anything, so it is not asked. The copy exists so the button can
 * carry the missing condition as its label instead of being pressed and
 * refused, and the two will have to be changed together.
 */
export type StartRefusal = { because: "nobody" } | { because: "waiting"; on: LobbySeat[] };

export function startRefusal(seats: readonly LobbySeat[]): StartRefusal | null {
  const chosen = chosenSeats(seats);
  if (chosen.length < 1) return { because: "nobody" };
  const waiting = chosen.filter((seat) => !seat.ready && !seat.abandoned);
  return waiting.length > 0 ? { because: "waiting", on: waiting } : null;
}

/* --------------------------------------------------------------------------
 * The name you are typing.
 * ----------------------------------------------------------------------- */

/**
 * Your seat wearing the name you have typed but not yet saved.
 *
 * Your name appears above your character and across the foot of the card you
 * took, and it has to follow the keystrokes — waiting for a round trip to see
 * your own typing is what makes a field feel broken. What the server hears is
 * debounced; what you see is not.
 *
 * An empty field keeps showing the saved name rather than flashing "Miejsce 2"
 * at somebody who is only retyping it. And nothing drafted hands back the very
 * same array, because this runs on every poll for every device.
 */
export function withDraftName(
  seats: readonly LobbySeat[],
  mySeatIndex: number | null,
  draft: string | null,
): readonly LobbySeat[] {
  if (draft === null) return seats;
  return seats.map((seat) =>
    seat.seatIndex === mySeatIndex
      ? { ...seat, playerName: draft.trim() || seat.playerName }
      : seat,
  );
}

/* --------------------------------------------------------------------------
 * One seat on screen.
 * ----------------------------------------------------------------------- */

/**
 * Who a seat is, in one word, or nothing worth saying.
 *
 * The three that displace each other: nobody is behind it, the device has gone
 * quiet, or it is yours. Abandoned wins over away because the server never
 * reports both — `envelopeFor` only calls a seat away while `abandoned_at` is
 * null — and because "bez gracza" is the more useful of the two anyway.
 */
export type SeatStanding = "gone" | "away" | "you" | null;

export function seatStanding(seat: LobbySeat, isMine: boolean): SeatStanding {
  if (seat.abandoned) return "gone";
  if (seat.away) return "away";
  return isMine ? "you" : null;
}

/**
 * The three states a player is ever in before the start (docs/LOBBY.md).
 *
 * Silent covers the two seats with nothing to report: one still choosing, and
 * one nobody is behind. Saying "niegotowy" of either would be news about
 * somebody who has not been asked yet.
 */
export type Readiness = "ready" | "waiting" | "silent";

export function seatReadiness(seat: LobbySeat): Readiness {
  if (seat.abandoned || !seat.characterId) return "silent";
  return seat.ready ? "ready" : "waiting";
}

/**
 * The picture on a seat, or null while it is still choosing.
 *
 * The mała Karta, because that is the piece standing on the board for this
 * player — it is what "which one are you?" is answered with at a table. The
 * surprise has a card of its own, so a seat holding it shows a picture like
 * everybody else rather than the "still choosing" placeholder, which would be
 * wrong twice over: that seat has chosen, and it can be ready.
 */
export function seatPortrait(seat: LobbySeat, character: Character | null): string | null {
  if (character) return characterStandeeUrl(character.id);
  return isRandomPick(seat.characterId) ? characterStandeeUrl(RANDOM_CHARACTER_ID) : null;
}

/**
 * The colour of this seat, everywhere it appears.
 *
 * Off the seat index and nothing else, so "the blue one" means one person all
 * evening — the dot on the slot, the stripe on the board, and the name across
 * the foot of the card they took are the same colour by construction.
 */
export function seatColour(seat: LobbySeat): string {
  return SEAT_COLOURS[seat.seatIndex % SEAT_COLOURS.length];
}

/* --------------------------------------------------------------------------
 * The strip of Karty Postaci.
 * ----------------------------------------------------------------------- */

/**
 * The 27 cards, alphabetically, in Polish — Ł after L, Ż after Z.
 *
 * The data file already happens to be in this order; sorting here means the
 * strip stays in it whatever order a card is added to the file in.
 */
export function charactersInOrder(characters: readonly Character[]): Character[] {
  return [...characters].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/**
 * How wide a row of the strip is.
 *
 * Read left to right, then wrap: two rows of fourteen for the 27 characters
 * plus the surprise. Derived rather than written down, so adding a card moves
 * the wrap instead of pushing one tile onto a third row nobody sized for.
 */
export function stripColumns(characterCount: number): number {
  return Math.ceil((characterCount + 1) / 2);
}

/**
 * The Karta a seat is showing, or null.
 *
 * Null for both "nothing chosen" and "the surprise", which is what
 * `asCharacterId` answers and why the lookup goes through it: the sentinel is a
 * seat state, not a card, and there is nothing to find for it.
 */
export function cardLookup(
  characters: readonly Character[],
): (id: SeatCharacter | null) => Character | null {
  const byId = new Map(characters.map((character) => [character.id, character]));
  return (id) => {
    const real = asCharacterId(id);
    return real ? (byId.get(real) ?? null) : null;
  };
}

/**
 * characterId -> the seat holding it.
 *
 * 0.3 again, on the browser's side of the wire: the box has 27 Karty Postaci
 * and one figure per card, so there is only ever one seat per id. The server
 * refuses a taken card in `chooseCharacter`; this is what greys it out first,
 * because two devices can reach for the same one in the same second and only
 * the server sees both.
 *
 * The surprise is never in here. Several seats may hold it at once, so it is
 * not a thing anybody can take.
 */
export function cardOwners(seats: readonly LobbySeat[]): Map<string, LobbySeat> {
  const owners = new Map<string, LobbySeat>();
  for (const seat of seats) {
    if (seat.characterId && !isRandomPick(seat.characterId)) {
      owners.set(seat.characterId, seat);
    }
  }
  return owners;
}

/** Everybody who asked to be surprised, in seat order — the roster's order. */
export function surpriseTakers(seats: readonly LobbySeat[]): LobbySeat[] {
  return seats
    .filter((seat) => isRandomPick(seat.characterId))
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/**
 * The border on the surprise when more than one player has taken it.
 *
 * Every other card carries the colour of the one seat that holds it. Two seats
 * cannot share a border, and picking either of their colours would name the
 * wrong person, so it goes to the neutral grey of `--color-muted` — which reads
 * as "several" rather than as anybody in particular.
 */
export const MANY_TAKERS = "#9aa2bd";

/** The colour a tile is outlined in: one taker's own, grey for several, none for free. */
export function takenBorder(takers: readonly LobbySeat[]): string | null {
  if (takers.length === 0) return null;
  return takers.length === 1 ? seatColour(takers[0]) : MANY_TAKERS;
}

/**
 * Everything that decides how bright one tile in the strip is.
 *
 * `held` is never true of the surprise: a card that cannot be taken away from
 * you is never the greyed-out kind, and that is the only difference between the
 * ladder the two tiles climb.
 */
export interface TileState {
  /** A request for this very card is out. */
  pending: boolean;
  /** A request for some other card is out. */
  waiting: boolean;
  /** Somebody holds this card. */
  held: boolean;
  /** Held by the seat the strip is aimed at — your own pick, usually. */
  ours: boolean;
  /** There is a seat to choose for at all. */
  aimed: boolean;
}

/**
 * The dimming, as a Tailwind opacity class.
 *
 * While a request is out the one card it is about stays lit and the rest step
 * back. Anything else — dimming all of them, or dimming none — leaves the
 * player unable to tell whether their click registered, which is the whole
 * complaint.
 *
 * Every opacity in a tile comes from here, and it goes on the picture rather
 * than on the card: fading the whole tile fades the border with it, and the
 * border is the one part carrying information. It used to be split, the
 * owner-dimming on the picture and the waiting-dimming on the button, so
 * clicking a character dropped the first instantly and faded the second in over
 * the transition — every already-taken card flashed to full brightness for a
 * moment and then sank, which is exactly what it looked like.
 */
export function tileDimming(tile: TileState): string {
  if (tile.pending) return "opacity-100";
  if (tile.waiting) return "opacity-20";
  if (tile.held) return tile.ours ? "opacity-70" : "opacity-35";
  return tile.aimed ? "opacity-100" : "opacity-40";
}

/**
 * Which character the reading column shows.
 *
 * Whatever the cursor is over wins — running along the strip and reading each
 * one is how you choose — falling back to the character of whoever you are
 * choosing for, so the column is never blank once anything has been picked.
 */
export function readingCharacter(
  preview: SeatCharacter | null,
  target: LobbySeat | null,
  me: LobbySeat | null,
): SeatCharacter | null {
  return preview ?? target?.characterId ?? me?.characterId ?? null;
}

/* --------------------------------------------------------------------------
 * The door.
 * ----------------------------------------------------------------------- */

/**
 * Whether a seventh player would have nowhere to sit.
 *
 * The box's own 2-6. `MAX_SEATS` is `modes.ts`'s so that this and `joinGame`
 * cannot hold different numbers — the lobby reads it to know whether to offer a
 * chair, and the server enforces it on the way in, because a stale lobby page
 * must not be able to squeeze in a seventh.
 */
export function tableIsFull(seats: readonly LobbySeat[]): boolean {
  return seats.length >= MAX_SEATS;
}

/** Who to say is already at the table, for somebody standing at the door. */
export function namedSeats(seats: readonly LobbySeat[]): LobbySeat[] {
  return seats.filter((seat) => seat.playerName);
}
