/** Turns a journal row into the one sentence the table is allowed to read. */

import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import characters from "@/data/characters.json";
import type { Character, EventCard, Item, Spell } from "@/data/types";
import { asFieldId, FIELDS } from "./board";
import { asCharacterId } from "./characters";
import { USE_VERB_PAST } from "./uses";

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

/**
 * Something a line named that can be looked at.
 *
 * The journal is where a card or a field is mentioned long after it left the
 * screen — "zostawia na polu Kurhan: MAGICZNY MIECZ" is exactly the sentence
 * you want to be able to interrogate two turns later. So a line records what it
 * named, and the reader turns those names into things you can hover.
 *
 * `name` is what appears in `text`, which is what lets the client find it there
 * without the sentence having to be built out of fragments.
 */
export interface JournalRef {
  kind: "card" | "field";
  id: string;
  name: string;
}

export interface JournalLine {
  seq: number;
  turn: number;
  text: string;
  /** A human correction rather than something the rules did (LOBBY.md). */
  manual: boolean;
  /** Seat the line is about, for colouring it like the rest of the table. */
  seatIndex: number | null;
  /** Cards and fields this line named, in the order it named them. */
  refs?: JournalRef[];
  /**
   * A round boundary rather than something somebody did.
   *
   * Drawn as a heading, and it *is* the heading: the expanded view used to
   * derive one whenever `turn` changed, which would now print "Tura 4"
   * immediately above a line saying the same thing. The derived heading stays
   * for games that were already running when this was added, and for the very
   * first line, which has no boundary before it.
   */
  marker?: true;
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

/** The cards print "zła", not "zla". Null when there is no Natura to name. */
function natura(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return value === "zla" ? "zła" : value;
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

  // Every name the sentence resolves is remembered as it is resolved, so the
  // list cannot drift from the words: the same call that puts a name in the
  // text is the one that records it.
  const refs: JournalRef[] = [];
  const remember = (kind: JournalRef["kind"], id: unknown, name: string) => {
    if (typeof id === "string" && !refs.some((ref) => ref.name === name)) {
      refs.push({ kind, id, name });
    }
    return name;
  };
  const card = (id: unknown) => remember("card", id, cardName(id));
  const field = (id: unknown) => remember("field", id, fieldName(id));

  const line = (text: string): JournalLine => ({
    seq: entry.seq,
    turn: entry.turn,
    text,
    manual: entry.manual,
    seatIndex: seat?.seatIndex ?? null,
    refs: refs.length > 0 ? refs : undefined,
  });

  switch (entry.kind) {
    case "start":
      return line(`Gra się zaczyna — ${num(data.seats)} postaci przy stole.`);

    // — where people are ————————————————————————————————————————————
    case "ruch":
      return line(`${who} idzie z ${field(data.from)} na ${field(data.to)}.`);
    // The same move, but aimed at the Most — 11.9 makes it an attempt that the
    // entrance's guardian can refuse, so it is worth saying differently.
    case "proba-mostu":
      return line(`${who} próbuje wejść na Most przez ${field(data.from)}.`);
    case "przestawienie":
      return line(
        `${who} — przestawienie na ${field(data.to)}${data.reason ? `, ${data.reason}` : ""}.`,
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
    // 14.6's two creatures, which stand in the middle of the bridge rather than
    // at its door. The table saw the fight end and never saw it begin, and the
    // strength is two dice rolled on the spot — so without this the line saying
    // somebody lost to the Monstrum never said what they were losing to.
    case "straznik-mostu":
      return line(
        `${who} staje przed: ${String(data.guardian ?? "strażnikiem")} (${num(data.strength)}).`,
      );
    case "straznik-start":
      return line(`${who} staje przed strażnikiem: ${String(data.guardian ?? "?")}.`);
    case "straznik-koniec":
      return line(
        `${who} ${data.outcome === "wygrana" ? "pokonuje" : "przegrywa z"}: ${String(data.guardian ?? "strażnik")}.`,
      );
    // The player's name is the subject, not the object: Polish would want it in
    // the dative after "zabiera" ("zabiera Michałowi"), and a name typed into a
    // box cannot be declined. Every other line in this file is built the same
    // way for the same reason — the seat acts, and what acted on it is named
    // after the dash.
    case "most-cerber":
      return line(`${who} traci ${zycie(num(data.loss))} — Cerber.`);
    case "most-pulapka":
      return line(`${who} wpada w Pułapkę.`);
    case "most-gra-ze-smiercia":
      return line(`${who} gra ze Śmiercią — ${String(data.outcome ?? "?")}.`);

    // — fighting ————————————————————————————————————————————————————
    case "walka-start": {
      // Usually cards; sometimes a creature a field conjured, which has a name
      // and no card at all — the Karczma's "miejscowy osiłek" is a line on the
      // board with a number after it. Saying "wroga" for those was the journal
      // reporting less than it knew.
      const ids = Array.isArray(data.cardIds) ? data.cardIds : [];
      const foe =
        ids.map((id) => card(id)).join(" i ") ||
        (typeof data.nazwa === "string" ? data.nazwa : "wroga");
      return line(`${who} walczy z: ${foe} (${num(data.enemyTotal)}).`);
    }
    case "walka-koniec":
      return line(
        `${who} ${data.outcome === "wygrana" ? "wygrywa" : data.outcome === "remis" ? "remisuje" : "przegrywa"} walkę z: ${card(data.cardId)}.`,
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
      return line(`${who} zdobywa: ${card(data.cardId)}.`);
    // A card handed over by the test shortcut rather than won. Said, and marked
    // manual like every other override: a card that appeared by fiat must not
    // read like one that was earned, and a row nothing can render at all is
    // worse — the grant went in the journal and the journal stayed silent.
    case "test-karta":
      return line(`${who} bierze z talii: ${card(data.cardId)}.`);
    // 16.8: what was not taken stays where it fell, face up. Saying where is the
    // whole point — a card on a field two turns later is otherwise unexplained.
    case "zostawienie": {
      const left = Array.isArray(data.cardIds) ? data.cardIds : [];
      if (left.length === 0) return null;
      return line(
        `${who} zostawia na polu ${field(data.fieldId)}: ${left.map((id) => card(id)).join(", ")}.`,
      );
    }

    // A card taking something off you. Distinct from "odrzucenie", which is the
    // holder choosing to put a card down (5.5).
    case "strata": {
      const lost = Array.isArray(data.cardIds) ? data.cardIds : [];
      const gold = num(data.zloto);
      const parts = [
        lost.length > 0 ? lost.map((id) => card(id)).join(", ") : "",
        gold > 0 ? sztuki(gold) : "",
      ].filter(Boolean);
      if (parts.length === 0) return null;
      return line(`${who} traci: ${parts.join(", ")}.`);
    }

    case "odrzucenie":
      return line(`${who} odrzuca: ${card(data.cardId)}.`);

    // Spending a card by using it. One word for all nine — the cards have their
    // own idioms, but this is one act and the line is read as a list.
    case "uzycie": {
      const face = typeof data.face === "number" ? ` — wypadło ${data.face}` : "";
      return line(`${who} ${USE_VERB_PAST}: ${card(data.cardId)}${face}.`);
    }
    case "kupno":
      return line(`${who} kupuje: ${card(data.cardId)} za ${sztuki(num(data.price))}.`);
    case "sprzedaz":
      return line(`${who} sprzedaje: ${card(data.cardId)} za ${sztuki(num(data.price))}.`);
    case "wymiana-trofeow":
      return line(`${who} wymienia trofea — zyskuje ${num(data.gained)} Miecza.`);
    case "karta":
      return line(`${who} wyciąga: ${card(data.cardId)}.`);

    // — what people are ————————————————————————————————————————————
    case "korekta": {
      const delta = num(data.delta);
      const sign = delta > 0 ? `+${delta}` : String(delta);
      return line(
        `${who}: ${String(data.stat ?? "?")} ${sign} (${num(data.from)} → ${num(data.to)})` +
          `${data.reason ? ` — ${data.reason}` : ""}.`,
      );
    }
    // A card giving or taking points. Distinct from "korekta", which is a person
    // overruling the referee and is drawn as such.
    case "punkty": {
      const delta = num(data.delta);
      if (delta === 0) return null;
      const many = Math.abs(delta);
      const what =
        data.stat === "zloto"
          ? sztuki(many)
          : data.stat === "zycie"
            ? zycie(many)
            : `${many} ${plural(many, "punkt", "punkty", "punktów")} ` +
              `${data.stat === "miecz" ? "Miecza" : "Magii"}`;
      return line(
        `${who} ${delta > 0 ? "zyskuje" : "traci"} ${what}` +
          `${typeof data.reason === "string" && data.reason ? ` — ${data.reason}` : ""}.`,
      );
    }

    case "uzdrowienie":
      return line(`${who} wraca do ${zycie(num(data.to))}.`);
    case "leczenie":
      return line(`${who} leczy ${zycie(num(data.points))} za ${sztuki(num(data.paid))}.`);
    // 7.2 puts a Karta Zmiany Natury next to the character showing the new one,
    // and the old one is what everybody has been playing against all game —
    // whether the Święta Włócznia still works, whether the Czarci Młyn heals or
    // hurts. Saying only the destination loses half the fact.
    case "zmiana-natury": {
      const to = natura(data.to) ?? "?";
      const from = natura(data.from);
      return line(
        from && from !== to
          ? `${who} zmienia naturę z ${from} na ${to}.`
          : `${who} zmienia naturę na: ${to}.`,
      );
    }
    // A card taking a turn away, which is a different event from the seat later
    // sitting out — describeTurnChange says that one, when it happens.
    case "tura-stracona":
      return line(
        `${who} traci ${tury(num(data.turns, 1))}` +
          `${typeof data.reason === "string" && data.reason ? ` — ${data.reason}` : ""}.`,
      );

    case "kamien":
      return line(`${who} zamienia się w Kamień — wraca w turze ${num(data.until)}.`);
    case "smierc":
      return line(`${who} ginie na polu ${field(data.field)}.`);
    case "nowa-postac":
      return line(
        `${who} gra dalej jako: ${characterName(data.characterId)}` +
          `${data.losowa === true ? " (wylosowana)" : ""}.`,
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
      const named = typeof data.name === "string" ? data.name : card(data.cardId);
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
 * Everything the end of a turn is worth saying.
 *
 * Separate from `describe` because one row becomes several lines, in the order
 * they happened: whoever was passed over, then the handover itself, then — when
 * play has come back round to the first seat — the number of the round that
 * just began.
 *
 * The handover is one line and not two. "X kończy turę" followed by "Y zaczyna
 * turę" is the same fact written twice, and at four players it would double the
 * length of the journal with news nobody reads.
 */
export function describeTurnChange(
  entry: JournalEntry,
  seats: readonly JournalSeat[],
): JournalLine[] {
  if (entry.kind !== "koniec-tury") return [];
  const data = entry.payload;
  const seat = seats.find((candidate) => candidate.id === entry.seatId);
  const skipped = Array.isArray(data.skipped) ? data.skipped : [];

  // Fractions of a seq keep several lines from one row distinct and in the
  // order they are written here.
  let at = 0;
  const at_ = () => entry.seq + at++ / 1000;
  const lines: JournalLine[] = [];

  for (const index of skipped) {
    const missed = seats.find((candidate) => candidate.seatIndex === index);
    lines.push({
      seq: at_(),
      turn: entry.turn,
      text: `${nameOf(missed)} traci turę.`,
      manual: false,
      seatIndex: missed?.seatIndex ?? null,
    });
  }

  // Two events, two lines. One sentence covering both could only carry one
  // seat, so the half about the player taking over was coloured for the player
  // handing off — and the feed is read by scanning those colours for your own.
  const next = seats.find((candidate) => candidate.seatIndex === data.next);
  lines.push({
    seq: at_(),
    turn: entry.turn,
    text: `${nameOf(seat)} kończy turę.`,
    manual: false,
    seatIndex: seat?.seatIndex ?? null,
  });

  // A round, not a player's turn: the counter that 20.1's three turns of Stone
  // are measured in. Carries no seat, because it belongs to the whole table —
  // which is also what makes it read as a heading rather than as somebody's
  // move.
  //
  // It goes BETWEEN the two halves, because the turn it heads is the one the
  // next player is about to take. After them it announced a round that had
  // already started a line earlier.
  const wrapped = Boolean(data.wrapped);
  if (wrapped) {
    lines.push({
      seq: at_(),
      turn: num(data.turnAfter),
      text: `Tura ${num(data.turnAfter)}`,
      manual: false,
      seatIndex: null,
      marker: true,
    });
  }

  if (next) {
    lines.push({
      // Filed under the round it belongs to, so the expanded view groups it
      // beneath the heading above rather than the one before it.
      seq: at_(),
      turn: wrapped ? num(data.turnAfter) : entry.turn,
      text: `${nameOf(next)} zaczyna turę.`,
      manual: false,
      seatIndex: next.seatIndex,
    });
  }

  return lines;
}

/** Every line a viewer may read, oldest first. */
export function journalLines(
  entries: readonly JournalEntry[],
  seats: readonly JournalSeat[],
  viewerSeatId: string | null,
): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const entry of entries) {
    lines.push(...describeTurnChange(entry, seats));
    const one = describe(entry, seats, viewerSeatId);
    if (one) lines.push(one);
  }
  return lines.sort((a, b) => a.seq - b.seq);
}

export { tury };
