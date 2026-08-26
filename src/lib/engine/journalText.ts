/** Turns a journal row into the one sentence the table is allowed to read. */

import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import characters from "@/data/characters.json";
import type { Character, EventCard, Item, Spell } from "@/data/types";
import { asFieldId } from "./board";
import { asCharacterId } from "./characters";
import { fieldName as nameOfField, plural } from "./polish";
import { USE_VERB_PAST } from "./uses";
import { describeEnd, type Ends } from "./status";
import type { JournalKind } from "./journal";

/** One row of `magiczny_miecz.moves`, as the route hands it over. */
export interface JournalEntry {
  seq: number;
  seatId: string | null;
  turn: number;
  kind: JournalKind;
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
  kind: "card" | "field" | "character";
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
const UNSPOKEN: ReadonlySet<JournalKind> = new Set<JournalKind>([
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

/**
 * A field, from a payload rather than from the board.
 *
 * The engine's `fieldName` takes a `FieldId`; a journal row holds whatever was
 * written into it, so this is the guarded door in front of it — "?" when the
 * payload has no field at all, and the raw value when it names one the board
 * has never heard of.
 */
/**
 * What the floor did to a change, when it did anything.
 *
 * 1.3 and 2.3 hold a character's own Miecz and Magia at or above the values it
 * started with, and Życie and Złoto at nothing, so a card that takes a point
 * from a character with none to give does nothing at all. It still *happened* —
 * the card was drawn, the rule was applied, and two turns later somebody will
 * ask why that Magia is still 3 — so the line says both: what was taken, and
 * that it came to nothing.
 *
 * Empty when the whole of it landed, which is almost always, so the common line
 * is the short one.
 */
function held(data: Record<string, unknown>): string {
  if (typeof data.from !== "number" || typeof data.to !== "number") return "";
  const asked = num(data.delta);
  const moved = data.to - data.from;
  if (moved === asked || asked === 0) return "";

  const stat = data.stat === "miecz" ? "Miecz" : data.stat === "magia" ? "Magia" : null;
  const floor = typeof data.floor === "number" ? data.floor : 0;
  const why =
    asked > 0
      ? `wyżej niż ${data.to} nie idzie`
      : !stat || floor === 0
        ? "nie ma poniżej czego zejść"
        : data.to < floor
          ? // Under its own floor already, which nothing in the game can do —
            // only the test console, forcing. The rule is about going down, so
            // it holds the number where it is rather than pulling it back up.
            `${stat} jest już poniżej swojego minimum (${floor})`
          : `${stat} nie spada poniżej ${floor} (1.3, 2.3)`;
  return moved === 0
    ? ` — bez zmiany: ${why}`
    : ` — z tego ${Math.abs(moved)}: ${why}`;
}

function fieldName(id: unknown): string {
  if (typeof id !== "string") return "?";
  const known = asFieldId(id);
  return known ? nameOfField(known) : id;
}

/** " (10)", or nothing at all when no die was thrown for it. */
function strength(data: Record<string, unknown>): string {
  const total = data.beastTotal;
  return typeof total === "number" && total > 0 ? ` (${total})` : "";
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

/** How the table refers to a seat: the player's name, else their character. */
/**
 * Who, and as whom — with the character recorded so its Karta is a hover away.
 *
 * `remember` is passed in because only `describe` keeps a list; the turn-change
 * lines want the same words and the same lookup, and building the sentence in
 * two places is how the two drifted apart before.
 */
function personName(
  who: JournalSeat | undefined,
  remember?: (kind: JournalRef["kind"], id: unknown, name: string) => string,
): string {
  if (!who) return "Ktoś";
  const named = who.characterId ? characterName(who.characterId) : null;
  const character =
    named && who.characterId
      ? (remember ? remember("character", who.characterId, named) : named)
      : null;
  if (!who.playerName) return character ?? `Miejsce ${who.seatIndex + 1}`;
  return character ? `${who.playerName} (${character})` : who.playerName;
}

function nameOf(seat: JournalSeat | undefined): string {
  if (!seat) return "Ktoś";
  if (seat.playerName) return seat.playerName;
  if (seat.characterId) return characterName(seat.characterId);
  return `Miejsce ${seat.seatIndex + 1}`;
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

  /**
   * Who did it: the player, and the character they are playing.
   *
   * Both, because neither is enough on its own. A journal read three turns
   * later is full of "Michał" and "Karol", and which of them was the Goblin is
   * exactly what you have lost by then — while a column of character names
   * alone stops saying who at the table is doing anything. The Karta Postaci
   * is a hover away on the character, because half of what a character can do
   * is prose on it and that is usually the question being asked.
   */
  const person = (who: JournalSeat | undefined) => personName(who, remember);

  const who = person(seat);

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
    case "walka-koniec": {
      // 17.5 packs several Wrogowie into one fight and `beginFight` joins their
      // ids with a "+", so the id here is not always an id. Split it, and each
      // of them is a card you can look at — which is the moment you most want
      // to, since the fight has just been decided by their combined Miecz.
      const foes = String(data.cardId ?? "")
        .split("+")
        .filter(Boolean)
        .map((id) => card(id))
        .join(" i ");
      const how =
        data.outcome === "wygrana"
          ? "wygrywa"
          : data.outcome === "remis"
            ? "remisuje"
            : "przegrywa";
      return line(`${who} ${how} walkę z: ${foes || "przeciwnikiem"}.`);
    }
    case "pojedynek": {
      const target = seats.find((candidate) => candidate.seatIndex === num(data.target, -1));
      return line(`${who} atakuje: ${person(target)}.`);
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
    // Its counterpart: a card put on the board rather than into a hand. Worded
    // like a real `zostawienie`, because what the next visitor finds is exactly
    // that — the manual flag is what says where it came from, and saying it
    // twice would be the only difference the table cannot check.
    case "test-karta-obszar":
      return line(`${who} kładzie na polu ${field(data.fieldId)}: ${card(data.cardId)}.`);
    // Deliberately not worded as an ucieczka. 19.1 is a rule with conditions
    // and this is a switch that ignores them, so the journal keeps the two
    // apart — a test row that read "ucieka z walki" would be the one row you
    // could not trust while testing exactly that.
    case "test-koniec-walki": {
      // Not `card()`: a fight's name is a display string, and 17.5 joins a pack
      // into "Cyklop + Smok" while a duel carries the other player's name.
      // Neither is an id, and neither is something to link to.
      const against = typeof data.cardName === "string" ? data.cardName : "przeciwnikiem";
      // Not "(tryb testowy)": every row written with the manual flag already
      // carries that badge, and saying it in the sentence too printed it twice.
      // The badge is the one to keep — it is on every override, in the same
      // place, and it is what a reader is scanning the column for.
      return line(`${who} przerywa walkę z: ${against}.`);
    }
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
      return line(`${who} wyrzuca: ${card(data.cardId)}.`);

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
    // 9.5's reshuffle, which belongs to the table rather than to a player —
    // hence no `who`. It is the one deck event everybody at a physical table
    // notices, and the app used to do it in complete silence.
    case "przetasowanie":
      return line(
        data.pile === "zaklecia"
          ? "Stos Kart Zaklęć się wyczerpał — zużyte Zaklęcia potasowano ponownie (9.5)."
          : "Talia Kart Zdarzeń się wyczerpała — zużyte Karty potasowano ponownie.",
      );

    // — what people are ————————————————————————————————————————————
    case "korekta": {
      const delta = num(data.delta);
      const sign = delta > 0 ? `+${delta}` : String(delta);
      return line(
        `${who}: ${String(data.stat ?? "?")} ${sign} (${num(data.from)} → ${num(data.to)})` +
          `${data.forced === true ? " — wymuszone" : held(data)}` +
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
          `${held(data)}` +
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

    // Something a character is now under, and how long for. Public: 5.2 puts
    // what somebody carries on the table, and what they are under is weighed
    // the same way by anyone deciding whether to attack them.
    case "efekt": {
      const what = typeof data.label === "string" ? data.label : "efekt";
      const ends = data.ends as Ends | undefined;
      return line(`${who}: ${what}${ends ? ` — ${describeEnd(ends)}` : ""}.`);
    }

    case "kamien":
      return line(`${who} zamienia się w Kamień — wraca w turze ${num(data.until)}.`);
    case "smierc":
      return line(`${who} ginie na polu ${field(data.field)}.`);
    // Somebody who was not at the table when it started. A different line from
    // "nowa-postac", because arriving is not the same event as coming back
    // from the dead and a table reading its own history should be able to tell
    // which of the two happened.
    case "dosiadka":
      return line(`${who} dosiada się do stołu jako ${characterName(data.characterId)}.`);
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
    /**
     * The Bestia's strength in brackets, when there was one.
     *
     * 14.7 rolls for it, so in a played game there always is — but an ending
     * arrived at without walking the Most has nothing to put there, and
     * "pokonuje Bestię (0)" reads as a Bestia with no strength rather than as a
     * number nobody threw.
     */
    case "zwyciestwo":
      return line(`${who} pokonuje Bestię${strength(data)} i wygrywa grę.`);
    case "bestia-porazka":
      return line(`${who} przegrywa z Bestią${strength(data)}.`);
    case "bestia-remis":
      return line(`${who} remisuje z Bestią${strength(data)}.`);

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

  /** One line's worth of names, so each carries only what it mentions. */
  const named = (who: JournalSeat | undefined) => {
    const refs: JournalRef[] = [];
    const text = personName(who, (kind, id, name) => {
      if (typeof id === "string") refs.push({ kind, id, name });
      return name;
    });
    return { text, refs: refs.length > 0 ? refs : undefined };
  };

  for (const index of skipped) {
    const missed = seats.find((candidate) => candidate.seatIndex === index);
    const it = named(missed);
    lines.push({
      seq: at_(),
      turn: entry.turn,
      text: `${it.text} traci turę.`,
      manual: false,
      seatIndex: missed?.seatIndex ?? null,
      ...(it.refs ? { refs: it.refs } : {}),
    });
  }

  // Two events, two lines. One sentence covering both could only carry one
  // seat, so the half about the player taking over was coloured for the player
  // handing off — and the feed is read by scanning those colours for your own.
  const next = seats.find((candidate) => candidate.seatIndex === data.next);
  lines.push({
    seq: at_(),
    turn: entry.turn,
    text: `${named(seat).text} kończy turę.`,
    manual: false,
    seatIndex: seat?.seatIndex ?? null,
    ...(named(seat).refs ? { refs: named(seat).refs } : {}),
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
      text: `${named(next).text} zaczyna turę.`,
      manual: false,
      seatIndex: next.seatIndex,
      ...(named(next).refs ? { refs: named(next).refs } : {}),
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
