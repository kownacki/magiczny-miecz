/** Turns a journal row into the one sentence the table is allowed to read. */

import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import characters from "@/data/characters.json";
import type { Character, EventCard, Item, Spell } from "@/data/types";
import { asFieldId, FIELDS } from "./board";
import { asCharacterId } from "./characters";

/** One row of `magiczny_miecz.moves`, as the route hands it over. */
export interface JournalEntry {
  seq: number;
  seatId: string | null;
  turn: number;
  kind: string;
  payload: Record<string, unknown>;
  manual: boolean;
}

export interface JournalSeat {
  id: string;
  seatIndex: number;
  playerName: string | null;
  characterId: string | null;
}

export interface JournalLine {
  seq: number;
  turn: number;
  text: string;
  /** A human correction rather than something the rules did (LOBBY.md). */
  manual: boolean;
  /** Seat the line is about, for colouring it like the rest of the table. */
  seatIndex: number | null;
}

const CARD_NAMES = new Map<string, string>([
  ...(events as EventCard[]).map((card) => [card.id, card.name] as const),
  ...(spells as Spell[]).map((card) => [card.id, card.name] as const),
  ...(items as Item[]).map((card) => [card.id, card.name] as const),
]);

const CHARACTER_NAMES = new Map(
  (characters as Character[]).map((character) => [character.id, character.name]),
);

/**
 * A payload value is a `string` off the wire, never an id.
 *
 * The journal is written from JSON that was stored months of turns ago, so it
 * is exactly the "from outside" case the guards exist for: narrow once, here,
 * and an id that no longer names anything renders as itself instead of
 * crashing a feed.
 */
function characterName(id: unknown): string {
  if (typeof id !== "string") return "?";
  const known = asCharacterId(id);
  return known ? (CHARACTER_NAMES.get(known) ?? id) : id;
}

/**
 * Entries that are true but not worth a line.
 *
 * Every die roll is public at a physical table, and logging each one buries the
 * things this journal exists for — who took what, who lost what — under a wall
 * of numbers. The outcomes are journalled separately and those are what get
 * rendered; move to a per-kind filter if anyone ever wants the rolls back.
 */
const UNSPOKEN = new Set([
  "rzut",
  "walka-rzut",
  "straznik-sila",
  "karta-tabela",
  "pole-tabela",
  "wyposazenie-poczatkowe",
]);

function cardName(id: unknown): string {
  return typeof id === "string" ? (CARD_NAMES.get(id) ?? id) : "kartę";
}

function fieldName(id: unknown): string {
  if (typeof id !== "string") return "?";
  const known = asFieldId(id);
  return known ? (FIELDS.get(known)?.name ?? id) : id;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

/** How the table refers to a seat: the player's name, else their character. */
function nameOf(seat: JournalSeat | undefined): string {
  if (!seat) return "Ktoś";
  if (seat.playerName) return seat.playerName;
  if (seat.characterId) return characterName(seat.characterId);
  return `Miejsce ${seat.seatIndex + 1}`;
}

/** Polish counts things three ways, and the journal shows small numbers. */
function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const last = count % 10;
  const tens = count % 100;
  if (last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14)) return few;
  return many;
}

const zycie = (n: number) => `${n} ${plural(n, "Życie", "Życia", "Żyć")}`;
const sztuki = (n: number) => `${n} ${plural(n, "Sztukę", "Sztuki", "Sztuk")} Złota`;
const tury = (n: number) => `${n} ${plural(n, "turę", "tury", "tur")}`;

/**
 * Renders one entry, or null when the table should not see it.
 *
 * Pure, so the whole vocabulary is testable without a database. `viewerSeatId`
 * is threaded through even though nothing currently needs it: rule 9.3 keeps a
 * player's Zaklęcia hidden, and the moment anything journals a spell *draw*
 * this is where it has to be masked. Casting is not that case — 12.5 has the
 * spell spoken aloud, so a cast names its card.
 */
export function describe(
  entry: JournalEntry,
  seats: readonly JournalSeat[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  viewerSeatId: string | null,
): JournalLine | null {
  if (UNSPOKEN.has(entry.kind)) return null;

  const seat = seats.find((candidate) => candidate.id === entry.seatId);
  const who = nameOf(seat);
  const data = entry.payload;
  const line = (text: string): JournalLine => ({
    seq: entry.seq,
    turn: entry.turn,
    text,
    manual: entry.manual,
    seatIndex: seat?.seatIndex ?? null,
  });

  switch (entry.kind) {
    case "start":
      return line(`Gra się zaczyna — ${num(data.seats)} postaci przy stole.`);

    // — where people are ————————————————————————————————————————————
    case "ruch":
      return line(`${who} idzie z ${fieldName(data.from)} na ${fieldName(data.to)}.`);
    // The same move, but aimed at the Most — 11.9 makes it an attempt that the
    // entrance's guardian can refuse, so it is worth saying differently.
    case "proba-mostu":
      return line(`${who} próbuje wejść na Most przez ${fieldName(data.from)}.`);
    case "przestawienie":
      return line(
        `${who} — przestawienie na ${fieldName(data.to)}${data.reason ? `, ${data.reason}` : ""}.`,
      );
    case "przeprawa":
      return line(`${who} przeprawia się przez ${String(data.obstacle ?? "przeszkodę")}.`);
    case "przeprawa-nieudana":
      return line(`${who} nie daje rady przeprawić się przez ${String(data.obstacle ?? "przeszkodę")}.`);
    case "przewoznik":
      return line(`${who} płaci Przewoźnikowi ${sztuki(num(data.paid))}.`);
    case "przewoznik-odmowa":
      return line(`${who} odmawia Przewoźnikowi i zostaje na miejscu.`);

    // — the bridge ——————————————————————————————————————————————————
    case "wejscie-na-most":
      return line(`${who} wchodzi na Kamienny Most.`);
    case "most-nieudane":
      return line(`${who} nie wchodzi na Most — zatrzymuje go ${String(data.guardian ?? "strażnik")}.`);
    case "straznik-start":
      return line(`${who} staje przed strażnikiem: ${String(data.guardian ?? "?")}.`);
    case "straznik-koniec":
      return line(
        `${who} ${data.outcome === "wygrana" ? "pokonuje" : "przegrywa z"}: ${String(data.guardian ?? "strażnik")}.`,
      );
    case "most-cerber":
      return line(`Cerber zabiera ${who} ${zycie(num(data.loss))}.`);
    case "most-pulapka":
      return line(`${who} wpada w Pułapkę.`);
    case "most-gra-ze-smiercia":
      return line(`${who} gra ze Śmiercią — ${String(data.outcome ?? "?")}.`);

    // — fighting ————————————————————————————————————————————————————
    case "walka-start": {
      const ids = Array.isArray(data.cardIds) ? data.cardIds : [];
      const foe = ids.map(cardName).join(" i ") || "wroga";
      return line(`${who} walczy z: ${foe} (${num(data.enemyTotal)}).`);
    }
    case "walka-koniec":
      return line(
        `${who} ${data.outcome === "wygrana" ? "wygrywa" : data.outcome === "remis" ? "remisuje" : "przegrywa"} walkę z: ${cardName(data.cardId)}.`,
      );
    case "pojedynek": {
      const target = seats.find((candidate) => candidate.seatIndex === num(data.target, -1));
      return line(`${who} atakuje: ${nameOf(target)}.`);
    }
    case "ucieczka":
      return line(`${who} ucieka z walki.`);
    case "ucieczka-nieudana":
      return line(`${who}: ucieczka się nie udaje.`);
    case "oslona":
      return line(data.saved ? `${who} osłania się przed ciosem.` : `${who} nie osłania się przed ciosem.`);

    // — what people have ————————————————————————————————————————————
    case "zabranie":
      return line(`${who} bierze: ${cardName(data.cardId)}.`);
    case "odrzucenie":
      return line(`${who} odrzuca: ${cardName(data.cardId)}.`);
    case "kupno":
      return line(`${who} kupuje: ${cardName(data.cardId)} za ${sztuki(num(data.price))}.`);
    case "sprzedaz":
      return line(`${who} sprzedaje: ${cardName(data.cardId)} za ${sztuki(num(data.price))}.`);
    case "wymiana-trofeow":
      return line(`${who} wymienia trofea — zyskuje ${num(data.gained)} Miecza.`);
    case "karta":
      return line(`${who} wyciąga: ${cardName(data.cardId)}.`);

    // — what people are ————————————————————————————————————————————
    case "korekta": {
      const delta = num(data.delta);
      const sign = delta > 0 ? `+${delta}` : String(delta);
      return line(
        `${who}: ${String(data.stat ?? "?")} ${sign} (${num(data.from)} → ${num(data.to)})` +
          `${data.reason ? ` — ${data.reason}` : ""}.`,
      );
    }
    case "uzdrowienie":
      return line(`${who} wraca do ${zycie(num(data.to))}.`);
    case "leczenie":
      return line(`${who} leczy ${zycie(num(data.points))} za ${sztuki(num(data.paid))}.`);
    case "zmiana-natury":
      return line(`${who} zmienia naturę na: ${String(data.to ?? "?")}.`);
    case "kamien":
      return line(`${who} zamienia się w Kamień — wraca w turze ${num(data.until)}.`);
    case "smierc":
      return line(`${who} ginie na polu ${fieldName(data.field)}.`);
    case "nowa-postac":
      return line(
        `${who} gra dalej jako: ${characterName(data.characterId)}.`,
      );
    /**
     * Two opposite events share this kind, and only the payload separates them.
     *
     * `drawSpell` writes { spellId } when a card enters a hand — including the
     * Zaklęcia some characters start with. That must never be named: 9.3 keeps
     * them hidden, and the holding itself is stored face:"hidden" for exactly
     * that reason, so naming it here would undo the concealment everywhere else
     * in the app enforces.
     *
     * Casting writes { cardId, name }, and 12.5 has the spell spoken aloud, so
     * the table hears which one.
     *
     * Distinguishing on payload shape is thinner than it should be. The real fix
     * is a separate kind for the draw, in turnStore.ts.
     */
    case "zaklecie": {
      const cast = typeof data.cardId === "string" || typeof data.name === "string";
      if (!cast) return line(`${who} dobiera Zaklęcie.`);
      const named = typeof data.name === "string" ? data.name : cardName(data.cardId);
      const at = typeof data.target === "string" ? ` na: ${data.target}` : "";
      return line(`${who} wypowiada Zaklęcie: ${named}${at}.`);
    }

    // — the end ——————————————————————————————————————————————————————
    case "zwyciestwo":
      return line(`${who} pokonuje Bestię (${num(data.beastTotal)}) i wygrywa grę.`);
    case "bestia-porazka":
      return line(`${who} przegrywa z Bestią (${num(data.beastTotal)}).`);
    case "bestia-remis":
      return line(`${who} remisuje z Bestią (${num(data.beastTotal)}).`);

    default:
      return null;
  }
}

/**
 * Everything the end of a turn is worth saying, which is the seats it passed
 * over.
 *
 * Separate from `describe` because one row becomes several lines: "koniec tury"
 * itself is not news, but each seat that sat out is exactly the thing players
 * kept missing, and it is the same fact the turn bar draws.
 */
export function describeSkips(
  entry: JournalEntry,
  seats: readonly JournalSeat[],
): JournalLine[] {
  if (entry.kind !== "koniec-tury") return [];
  const skipped = Array.isArray(entry.payload.skipped) ? entry.payload.skipped : [];
  return skipped.map((index, at) => {
    const seat = seats.find((candidate) => candidate.seatIndex === index);
    return {
      // Keeps several lines from one row distinct and in order.
      seq: entry.seq + at / 1000,
      turn: entry.turn,
      text: `${nameOf(seat)} traci turę.`,
      manual: false,
      seatIndex: seat?.seatIndex ?? null,
    };
  });
}

/** Every line a viewer may read, oldest first. */
export function journalLines(
  entries: readonly JournalEntry[],
  seats: readonly JournalSeat[],
  viewerSeatId: string | null,
): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const entry of entries) {
    lines.push(...describeSkips(entry, seats));
    const one = describe(entry, seats, viewerSeatId);
    if (one) lines.push(one);
  }
  return lines.sort((a, b) => a.seq - b.seq);
}

export { tury };
