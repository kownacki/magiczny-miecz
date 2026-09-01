/** What the console prints: the lines, labels and lookups both consoles turn rows into. */

/** One typed line from the test console, carried out against a real table. */

import characters from "@/data/characters.json";
import { cardIdNamed, describeCard } from "@/lib/engine/lookup";

import type { Character } from "@/data/types";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import { isRandomPick } from "@/lib/engine/characters";
import { type EffectName } from "@/lib/engine/console";
import { cardName } from "@/lib/engine/polish";
import { trophyPointsOf } from "@/lib/engine/trophies";
import { SPELL_BY_REF } from "./decks";
import { TROPHY_RATE, offersFor } from "./commands/shop";
import { fightsForYou, type Ability } from "@/lib/engine/abilities";
import type { Modifier } from "@/lib/engine/status";
import { type StatusRow } from "@/lib/engine/statusRows";
import { nameOfSeat } from "./commands/lobby";
import { activeStore } from "./gameStore";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import type { TurnPhase } from "@/lib/engine/turn";
import { askOnTop } from "@/lib/engine/ask";
import { overflowOnTop, overflowSaid } from "@/lib/engine/overflow";
import { overflowOf, waysOut } from "./commands/overflow";
import type { Snapshot } from "./change";
import { cardLending } from "./commands/seat";
import { fold } from "@/lib/engine/search";

/**
 * The third edge, beside `turnStore.ts` and `lobbyStore.ts`.
 *
 * The grammar this carries out is `engine/console.ts`'s and is pure; this is
 * the half with the database in it, and it does almost nothing of its own —
 * every branch calls the function the game itself calls, so a tested Życie is
 * lost the way a real one is and a staged fight rolls the dice real combat
 * rolls. Nothing here can quietly disagree with the rules by keeping its own
 * copy of them.
 *
 * It lived in `turnStore.ts`, which made that file the largest in the repo and
 * made two unrelated things one: the turn, and the shortcut for testing the
 * turn. They are not read together and they are not changed together, and only
 * one of them ships to a table that is actually playing.
 */

/**
 * What each of the console's three effect words writes.
 *
 * The label is what a player is shown, so it names the card the state comes
 * from rather than the word that was typed — a chip reading "frozen" would be
 * the only English on anybody's screen, and the point of the state is to look
 * exactly like the card's.
 */
export const EFFECTS: Record<EffectName, { label: string; modifier: Modifier }> = {
  fog: { label: "Mgła (tryb testowy)", modifier: { kind: "move-max", fields: 1 } },
  frozen: { label: "Bez ruchu (tryb testowy)", modifier: { kind: "frozen" } },
  barred: {
    label: "Most zamknięty (tryb testowy)",
    modifier: { kind: "barred", place: "most" },
  },
};

/**
 * What is printed on a Karta Postaci, from what the column holds.
 *
 * The surprise is a state and not a card (`RANDOM_CHARACTER_ID`), so it says
 * so rather than coming back as a missing name — a seat that has chosen to be
 * dealt one is not the same as a seat that has chosen nothing.
 */
export function characterName(id: string | null): string {
  if (!id) return "—";
  if (isRandomPick(id)) return "niespodzianka";
  return (characters as Character[]).find((one) => one.id === id)?.name ?? id;
}

/**
 * What an Obszar is called, or an em dash for a figure that is nowhere.
 *
 * Takes a `FieldId` and not a string: `seatsFor` narrowed the column on the way
 * in, so there is nothing to guard against here and a cast would only be this
 * file forgetting that.
 */
export function fieldName(fieldId: FieldId | null): string {
  if (!fieldId) return "—";
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/** What a resolution did, and whether the card is still asking. */
export function said(did: readonly string[], pending: boolean): string {
  const lines = did.length > 0 ? did.join("\n") : "Nic się nie stało.";
  return pending ? `${lines}\nWciąż czeka — odpowiedz jeszcze raz (\`look\`).` : lines;
}

/**
 * The turn's phase, spelled out.
 *
 * The stored words are the engine's and read as such — `field` is a phase name
 * rather than a thing you can point at — so this is only the difference between
 * a state machine's label and a sentence.
 */
export const PHASE: Record<string, string> = {
  roll: "roll",
  move: "move",
  field: "the Obszar",
  fight: "fight",
  bridge: "the Most",
  script: "a Karta mid-resolution",
  loop: "a Wróg fought in rounds",
  overflow: "somebody is over their limit",
  end: "end of turn",
};

/**
 * One frame, named for the `Stack:` line.
 *
 * A loop is the one frame whose kind is not the interesting part: three heads
 * with one cut is a different position from three with two, and "a Wróg fought
 * in rounds" says neither. It is also the one frame never on top, so this line
 * is the only place it is ever seen.
 */
export function frameLabel(frame: TurnPhase): string {
  if (frame.phase === "loop") {
    return `${frame.of.cardName}: ${frame.round} ${frame.done + 1} z ${frame.times}`;
  }
  return PHASE[frame.phase] ?? frame.phase;
}

/**
 * The overflow frame written out, with every way out of it listed.
 *
 * Public, all of it, and that is the difference from `askLines`. A hand of
 * Zaklęcia is 9.3's secret; a Przedmiot is not, and neither is the fact that
 * somebody is carrying more than they may. The whole table is waiting on this,
 * so the whole table is told what it is waiting for and what would end it.
 *
 * The ways out are read fresh rather than off the frame, because using a card
 * changes them — see `waysOut`.
 */
export function overflowLines(snapshot: Snapshot): string[] {
  const frame = overflowOnTop(snapshot.game.turn_state);
  if (!frame) return [];
  const seat = snapshot.seats.find((one) => one.id === frame.seatId);
  const over = overflowOf(snapshot, frame.seatId);
  if (!seat || !over) return [];

  const whose = nameOfSeat(snapshot.users, seat.seat_index);
  const said: Record<string, string> = {
    odrzuc: "odrzuć  (na Obszar)",
    uzyj: "użyj    (na stos zużytych)",
    zaloz: "załóż   (na siebie)",
  };
  return [
    overflowSaid(over, whose),
    ...waysOut(snapshot, frame.seatId).map(
      (way) => `  ${said[way.kind]}  ${cardName(way.cardId)}`,
    ),
    "  — `drop <nazwa>`, `use <nazwa>` albo `equip <nazwa>`",
  ];
}

/**
 * The `ask` frame written out, with its options numbered for `answer <n>`.
 *
 * Shown only to the seat it is waiting on. The two Karty are off the top of a
 * pile nobody may see (9.3, and `withoutDeck`), so a console driving another
 * seat is told that somebody is choosing and not what they are choosing
 * between — the same line every other device gets.
 */
export function askLines(snapshot: Snapshot, forSeatId: string | null): string[] {
  const frame = askOnTop(snapshot.game.turn_state);
  if (!frame) return [];
  const who = snapshot.seats.find((one) => one.id === frame.seatId);
  const whose = who ? nameOfSeat(snapshot.users, who.seat_index) : "somebody";
  if (forSeatId !== frame.seatId) return [`${whose} is choosing a Zaklęcie (9.3 — not yours to see).`];
  return [
    `${frame.reason}: pick one — \`answer <n>\``,
    ...frame.question.refs.map((ref, at) => {
      const spell = SPELL_BY_REF.get(ref);
      return `  ${at} — ${spell ? cardName(spell.id) : ref}`;
    }),
  ];
}

/** The question the turn is stuck on, for `look`. */
export function waitingOn(frame: TurnPhase): string[] {
  if (frame.phase !== "field") return [];
  const state = frame;
  const offer = compulsoryOffer(state.fieldId ?? null, state.resolved ?? []);
  /**
   * Fought counts as dealt with, not just resolved.
   *
   * 17.4 settles a Wróg the moment the dice are compared, and `beginFight`
   * refuses a rematch on that same list — so a creature in `fought` is one this
   * turn can do nothing more about, whether it was beaten or walked away from.
   * Reading only `resolved` had the console announce a Smok as still waiting
   * after he had been killed and picked up as a trophy, which is the referee
   * telling the table to deal with something it has already dealt with.
   */
  const settled = new Set([...(state.resolved ?? []), ...(state.fought ?? [])]);
  const waiting = (state.drawn ?? []).filter((one) => !settled.has(one.cardId));
  return [
    ...(offer ? [`The Obszar asks: ${offer.name} — \`answer\` or \`answer <n>\``] : []),
    ...(waiting.length
      ? [`Waiting: ${waiting.map((one) => cardName(one.cardId)).join(", ")}`]
      : []),
  ];
}

/**
 * One Karta read out, or the reason it could not be.
 *
 * Shared with `mm`, which answers `card` before it has a game to answer it
 * against — see `worksOffTable`. The refusal is a throw here because that is
 * how every other refusal in this file reaches the surface.
 */
export function cardLines(name: string): string[] {
  const found = describeCard(name);
  if ("lines" in found) return found.lines;
  if ("candidates" in found) throw new Error(`Which one — ${found.candidates.join(", ")}?`);
  throw new Error(`No card called \`${found.missing}\`.`);
}

/**
 * A card id off a printed name, for the verbs that name one nobody holds yet.
 *
 * `buy` is the only one: what is on sale is the Obszar's list rather than
 * anything in a hand, so there is no holding to look the id up from.
 */
export function idNamed(said: string): string {
  const found = cardIdNamed(said);
  if ("id" in found) return found.id;
  if ("candidates" in found) throw new Error(`Which one — ${found.candidates.join(", ")}?`);
  throw new Error(`No card called \`${found.missing}\`.`);
}

/** Whether a card id is the card somebody just named. */
export function sameName(cardId: string, said: string): boolean {
  return fold(cardName(cardId)) === fold(said.trim());
}

/**
 * An Obszar by the name printed on the board, for a Zaklęcie thrown at one.
 *
 * The `place` verb resolves its field in the parser, where the grammar knows
 * it is a field. `cast` cannot: what the word after `at` names depends on the
 * card, and the card is not known until the hand has been looked in.
 */
export function fieldNamed(said: string): FieldId {
  const want = fold(said.trim());
  for (const field of FIELDS.values()) {
    if (fold(field.name) === want || field.id === said.trim()) return field.id;
  }
  const near = [...FIELDS.values()].filter((field) => fold(field.name).startsWith(want));
  if (near.length > 0) {
    throw new Error(`Which one — ${near.map((field) => field.name).join(", ")}?`);
  }
  throw new Error(`No Obszar called \`${said}\`.`);
}

/** A Karta lying face up on the board, by name (16.8). */
export async function fieldCardNamed(gameId: string, said: string) {
  const snapshot = await activeStore().load(gameId);
  const hit = snapshot.fieldCards.find((row) => sameName(row.card_id, said));
  if (hit) return hit;
  const near = snapshot.fieldCards.filter((row) =>
    fold(cardName(row.card_id)).startsWith(fold(said.trim())),
  );
  if (near.length > 0) {
    throw new Error(`Which one — ${near.map((row) => cardName(row.card_id)).join(", ")}?`);
  }
  throw new Error(`No Karta called \`${said}\` is lying on the board.`);
}

/**
 * One of this seat's holdings, by the name printed on it.
 *
 * A holding's id is a uuid and a person types a name, so every verb that acts
 * on something carried goes through here. Two copies of the same card are the
 * same card as far as this is concerned — the first is as good as the second.
 */
export async function holdingNamed(gameId: string, seatId: string, said: string) {
  const snapshot = await activeStore().load(gameId);
  const mine = snapshot.holdings.filter((one) => one.seat_id === seatId);
  const hit = mine.find((one) => sameName(one.card_id, said));
  if (hit) return hit;
  const near = mine.filter((one) => fold(cardName(one.card_id)).startsWith(fold(said.trim())));
  if (near.length > 0) {
    throw new Error(`Which one — ${near.map((one) => cardName(one.card_id)).join(", ")}?`);
  }
  throw new Error(`You are not holding \`${said}\`.`);
}

/**
 * Who is doing the fighting, when it is not the character.
 *
 * Only the Rycerz does this, and without saying so the fight line reads as a
 * character who has mysteriously become 3 and 3 — worse for a player holding
 * one, because his figure is often *lower* than their own and looks like a bug
 * rather than the card working.
 */
export function championLine(view: { abilities: readonly Ability[]; holdings: readonly { cardId: string }[] }): string {
  if (!fightsForYou(view.abilities)) return "";
  const who = cardLending(view, (held) => fightsForYou(held) !== null);
  return who ? `${cardName(who)} fights for you` : "";
}

/**
 * What a second copy of an effect did, in the two words it takes to say it.
 *
 * Only ever printed where there *was* a second copy. A card that visibly did
 * nothing is the sort of thing a table argues about two turns later, and the
 * argument is always the same one: did it stack? `stackingOf` already knows;
 * this is that answer reaching the person who drew the card.
 */
export const STACK_SAID: Record<StatusRow["stacking"], string> = {
  sums: "sumuje się",
  queues: "po kolei",
  refreshes: "odnawia",
  exclusive: "bez zmian",
};

/** One effect, as a line: what it is, how many landed, and when it lapses. */
export function effectRow(row: StatusRow): string {
  return (
    `${row.mark.glyph} ${row.label}` +
    (row.count > 1 ? ` ×${row.count} (${STACK_SAID[row.stacking]})` : "") +
    ` — ${row.when}`
  );
}

/**
 * A seat's effects as a block, with the one caveat that applies to all of them.
 *
 * The caveat is printed once and only where it is earned. A round taken off a
 * stored deadline is exact; a round worked out by walking the turn order is a
 * forecast, because the next Karta drawn can add a lost turn to somebody and
 * move every date after it. Saying so on every line would be noise, and noise
 * is what stops the real warnings being read.
 */
export function effectLines(rows: readonly StatusRow[]): string[] {
  if (rows.length === 0) return [];
  return [
    "Effects:",
    ...rows.map((row) => `  ${effectRow(row)}`),
    ...(rows.some((row) => row.lapse?.certainty === "prognoza")
      ? ["  (rundy liczone w turach są prognozą — jedna Karta może je przesunąć)"]
      : []),
  ];
}

export function columns(names: readonly string[], perRow = 4): string[] {
  const widest = Math.max(...names.map((one) => one.length), 0);
  const rows: string[] = [];
  for (let at = 0; at < names.length; at += perRow) {
    rows.push(
      "  " +
        names
          .slice(at, at + perRow)
          .map((one) => one.padEnd(widest))
          .join("  ")
          .trimEnd(),
    );
  }
  return rows;
}

/**
 * The sum, the Miecze it buys and what handing in all of it would burn.
 *
 * Said because 1.4 gives the player the choice of what to offer, and a choice
 * you have to do arithmetic for on paper is a choice the referee is not helping
 * with. Empty when there is nothing to say — a hand worth less than one Miecz
 * has no waste to warn about, only a total.
 */
export function trophyLedger(cardIds: readonly string[], mirror: { miecz: number }): string {
  const points = cardIds.reduce((sum, cardId) => sum + trophyPointsOf(cardId, mirror), 0);
  const swords = Math.floor(points / TROPHY_RATE);
  const wasted = points - swords * TROPHY_RATE;
  if (swords < 1) return `  (${points} pkt — ${TROPHY_RATE} za Miecz)`;
  return `  (${points} pkt → ${swords} Miecz${swords === 1 ? "" : "e"}, ${wasted} przepadnie)`;
}

/**
 * What each number of Miecze would actually cost, one row apiece.
 *
 * The line above says what an all-in trade comes to, which is the trade nobody
 * should make: 1.4 lets you pick, and picking well is a subset-sum the engine
 * already solves. Printing the answers turns "what do I hand in for two
 * Miecze" from arithmetic on paper into a line you read and a number you type.
 *
 * Nothing when there is only the one way to do it — a hand that buys exactly
 * one Miecz using everything it has needs no menu, and the line above already
 * said so.
 */
export function tradeMenu(cardIds: readonly string[], mirror: { miecz: number }): string[] {
  const offers = offersFor(
    cardIds.map((cardId) => ({ cardId, points: trophyPointsOf(cardId, mirror) })),
  );
  if (offers.length === 0) return [];
  const only = offers.length === 1 && offers[0].cardIds.length === cardIds.length;
  if (only) return [];
  return offers.map((offer) => {
    const cost =
      offer.cardIds.length === cardIds.length
        ? "wszystko"
        : offer.cardIds.map((cardId) => cardName(cardId)).join(", ");
    const burn = offer.wasted > 0 ? `, ${offer.wasted} przepadnie` : ", nic nie przepadnie";
    return `  trade ${offer.swords} → ${cost} (${offer.points} pkt${burn})`;
  });
}
