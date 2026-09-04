/** Which words the console knows, what each is for, and who is allowed to type it. */

import { type FieldId } from "./board";
import type { CardClass } from "@/data/types";
import type { TurnPhase } from "./turn";
import { findByName } from "./search";
import { RANDOM_CHARACTER_ID, RANDOM_CHARACTER_NAME } from "./characters";
import {
  AS,
  AT,
  BY_TYPE,
  CARDS,
  CATEGORIES,
  DEALABLE,
  EFFECTS,
  FIELD_KINDS,
  FOES,
  GOLD_OFFERED,
  GOLD_WORDS,
  NATURES,
  OUTCOMES,
  PEOPLE,
  PLACEABLE,
  PLACES,
  READABLE,
  READ_KINDS,
  SLOT_WORDS,
  STACKABLE,
  STACK_KINDS,
  TO,
  ZAKLECIA,
  afterComma,
  fieldNamed,
  finishedName,
  goldAsked,
  isCategory,
  keywordAt,
  missing,
  named,
  nothing,
  shelved,
  type Pool,
} from "./consoleCatalogue";

/**
 * A tester's console, and why the game has one.
 *
 * The interface had grown a test button wherever a test needed one: a "weź" on
 * every card in the drawer, a "walcz" on every Wróg, a chip for every one of
 * the fifty-seven Obszary, a ± under every parameter, a way out of a fight in
 * the corner of a fight. Each was reasonable on its own and together they were
 * a second interface laid over the first, in the way of the game they existed
 * to test.
 *
 * A line of text costs nothing to add and nothing to look at. This is the
 * grammar half of it, kept pure — a line in, a command or a complaint out, no
 * database, no clock, no game — so the whole vocabulary can be tested the way
 * the rest of the engine is. Carrying a command out is `runCommand`'s job, and
 * it does it by calling the same functions the game does.
 *
 * English, alone among everything the app says. The rest is Polish because the
 * game is Polish and its players are; this is not part of the game, and the
 * words in it are the names of functions.
 */
export interface CommandSpec {
  name: string;
  aliases: string[];
  /** How to type it, for `help`. */
  usage: string;
  summary: string;
  /**
   * When it is worth offering, or absent for "whenever".
   *
   * Only the verbs that are genuinely stage-bound carry one — `roll` before the
   * move, `answer` on an Obszar that asked something. The overrides mostly do
   * not: `kill` and `give` exist to put a table into a state it could not reach
   * on its own, so restricting when they may be reached for would defeat them.
   */
  when?: readonly Stage[];
  /**
   * True when it can be answered without a game at all.
   *
   * `help` reads the vocabulary and `card` reads the box; neither touches a
   * table, and both are things somebody wants *before* opening one. Declared
   * here rather than listed at the prompt so a surface cannot forget one.
   */
  offTable?: boolean;
  /**
   * Whether this is playing the game or overruling it.
   *
   * Required rather than defaulted, so a verb cannot be added without somebody
   * deciding which it is — the mistake this exists to stop is a rule-break
   * quietly reachable from a table that never turned testmode on.
   *
   * The line is "does this break a rule the game has?", not "is this
   * dangerous". `kick` puts a person out of a table and is `play`, because a
   * host can already do it from the roster and no rule of Magiczny Miecz says
   * otherwise. `kill` is `testmode`, because 4.4 says how a Postać dies and
   * this is not it.
   */
  needs: Capability;
  /**
   * Which heading it is listed under.
   *
   * Required, like `needs`, so a verb cannot be added without somebody saying
   * what kind of thing it is. Fifty-nine of them in one column is a list you
   * read once and then stop reading — you cannot find `raid` in it unless you
   * already know it is called `raid`, which is the one case where you did not
   * need the list.
   *
   * Orthogonal to `needs`: the group says what you are doing, the capability
   * says whether you may. `nature` and `stone` sit under Overruling and are
   * `play`, because 7.2 and 20.1 do let you reach them.
   */
  group: Group;
}

/** What a line needs before it may run. */
export type Capability = "play" | "testmode";

/**
 * The headings `help` lists under, in the order it lists them.
 *
 * Ordered as somebody meets them: what to read, then a turn, then the things
 * a turn runs into, then the table around it, and the overrides last because
 * they are the only ones that are not the game.
 */
export type Group =
  | "reading"
  | "turn"
  | "fight"
  | "board"
  | "carrying"
  | "friends"
  | "trade"
  | "table"
  | "override";

/** The heading each group prints, in listing order. */
export const GROUPS: readonly { id: Group; title: string }[] = [
  { id: "reading", title: "Reading the game" },
  { id: "turn", title: "Your turn" },
  { id: "fight", title: "Fighting" },
  { id: "board", title: "What the board asks of you" },
  { id: "carrying", title: "What you carry" },
  { id: "friends", title: "Przyjaciele" },
  { id: "trade", title: "Złoto and trofea" },
  { id: "table", title: "The table" },
  { id: "override", title: "Test mode" },
];

/**
 * Where the game has got to, as far as *offering* a command is concerned.
 *
 * Coarser than the turn state on purpose. This decides what to put in front of
 * somebody, not what to allow: every command still refuses for itself at the
 * wrong moment — `roll` throws "Nie czas na rzut" — and that refusal is the
 * rule. This is the difference between a shell offering a filename and the
 * program deciding whether it can open it, and it is why a wrong answer here
 * costs a bad suggestion rather than a bad game.
 */
export type Stage = "none" | "lobby" | "roll" | "move" | "field" | "fight" | "other";

/**
 * The stages a game is actually being played in.
 *
 * Named once because three verbs need exactly this list, and a fourth would
 * have been written out by hand and got it slightly wrong.
 */
const PLAYING: readonly Stage[] = ["roll", "move", "field", "fight", "other"];

/**
 * A game read as a stage, from the two plain values that decide it.
 *
 * Takes the status and the phase rather than a game row, so the engine stays
 * ignorant of the store — and so both surfaces reach the same answer through
 * the same function. Two readings of "where has this got to" would be two
 * consoles wearing one vocabulary.
 */
export function stageOf(status: string, phase: TurnPhase["phase"] | undefined): Stage {
  if (status !== "playing") return "lobby";
  return phase === "roll" || phase === "move" || phase === "field" || phase === "fight"
    ? phase
    : "other";
}

/**
 * Which parameter a stat command moves. The column names, as the store knows them.
 *
 * `tury` is the odd one and is here for the same reason `stone` and `effect`
 * are: it is a state a card makes, `turns_lost` has always held it, and there
 * was no way to reach it at a prompt — so the one thing on the board that
 * silently skips a player could be seen only by drawing the card that causes
 * it. It is not a parameter and never touches 1.3's floor; it is a debt, spent
 * one per pass by `passTurn`.
 */
export type StatName = "sword" | "magic" | "life" | "gold" | "tury";

/** The three a character can have. 3.2's fourth, "any", is a card's word, not a state. */
export type Nature = "good" | "evil" | "chaotic";

/**
 * The states worth reaching that no other command reaches.
 *
 * A closed list, like the `Ends` and `Modifier` unions it stands in front of.
 * The console could take a modifier as JSON and be able to say anything the
 * engine can hold — and would then be a second, worse way of writing cards,
 * with no rule behind any of it. These three are the ones a card makes and
 * nothing else does: the Mgła's cap on a move, the Zaklinacz Czasu's stolen
 * turn, and 11.11's year off the Kamienny Most.
 */
/**
 * `nolimit` is the one here that is on no Karta.
 *
 * It takes 2.6's cap off one seat so that a hand can be built at all. Testing
 * anything about Zaklęcia runs into the limit being tested around: a surplus
 * stops the table, `deal` is refused while it is up, and filling a hand past
 * three otherwise means shedding it again between every pair of cards. One
 * seat, never the table, and it stays until somebody takes it off.
 */
export type EffectName = "fog" | "frozen" | "barred" | "nolimit";

export type Command =
  | { kind: "help"; about: string | null }
  /**
   * A rule out of the Instrukcja, by number or by chapter.
   *
   * `mm` has no Księga and never will — there is no drawer in a terminal — so
   * every "(5.3)" it prints is a dead end there, and the terminal is where a
   * player meets refusals fastest, because they are typing commands rather
   * than clicking legal moves. This is the way out that the browser has by
   * making the number a link.
   */
  | { kind: "rule"; about: string | null }
  | { kind: "kill"; who: string | null }
  /* People. `who` is a user: their id, their name, or the number of the seat
     they are driving — see `pickPlayer`. */
  | { kind: "who" }
  | { kind: "kick"; who: string }
  | { kind: "unseat"; who: string | null }
  | { kind: "seat"; who: string; seat: number }
  | { kind: "leave" }
  | { kind: "rename"; who: string; name: string }
  | { kind: "host"; who: string }
  /* Postacie. `seat` is the number printed beside a seat, counting from one;
     exactly one of the two is ever set. */
  | { kind: "pick"; characterId: string | null; seat: number | null }
  | { kind: "remove"; seat: number | null; characterId: string | null; hard: boolean }
  | { kind: "revive"; seat: number | null; characterId: string | null }
  /**
   * A parameter moved, or put where you want it.
   *
   * `delta` for `+5` and `-1`, `set` for `=12`. Not one field carrying both:
   * what you meant is decided when you type it and should not have to be worked
   * out again from a sign, and only one of the two can be turned into the other
   * — which needs the current value, and the grammar does not have one.
   */
  | {
      kind: "stat";
      stat: StatName;
      delta: number;
      set: number | null;
      who: string | null;
      force: boolean;
    }
  /**
   * Test mode: Karty happen to you, whatever kind of Karta they are.
   *
   * A list, because a deal is: 13.4 settles the whole number at the moment of
   * badanie Obszaru and `drawAll` deals it in one act, so the verb that stands
   * in for a draw has to be able to stand in for the whole of one. Empty lists
   * what there is to ask for, as bare `give` used to.
   */
  | { kind: "deal"; cardIds: string[] }
  /**
   * A Karta laid on an Obszar, and — with no card named — the catalogue of what
   * there is to lay.
   *
   * Null lists rather than refuses, exactly as bare `deal` does. The two ask
   * the same question of the same box, and answering one with the six kinds
   * and the other with "Which card?" made the shorter list the harder one to
   * find.
   */
  | { kind: "place"; cardId: string | null; fieldId: FieldId | null; gold: null }
  /**
   * The money half, which is not a card and never was.
   *
   * The box prints two gold *cards* — „1 SZTUKA ZŁOTA", „2 SZTUKI ZŁOTA" — and
   * `place 2 SZTUKI ZŁOTA` still lays one of those down: a Przedmiot lying on
   * the Obszar until somebody takes it, which is when it becomes money. Loose
   * gold has been through that already, or never was a card — a purse spilled
   * where a Postać died (4.4) — and 12.1 lets it be picked up an arbitrary
   * amount at a time, which no card does. So the two are two words apart.
   */
  | { kind: "place"; cardId: null; fieldId: FieldId | null; gold: number }
  | { kind: "teleport"; fieldId: FieldId }
  | { kind: "settle"; outcome: "wygrana" | "przegrana" | "remis" }
  | { kind: "endgame"; won: boolean }
  | { kind: "endfight" }
  /** Closes the window on a Zaklęcie nobody answered, so it happens now. */
  | { kind: "endcast" }
  /** 17.9's choice: null takes the Życie, "zloto" the coin, a name the Przedmiot. */
  | { kind: "spoils"; take: "zycie" | "zloto"; card: string | null }
  /**
   * Test mode: a Karta on top of its pile, so `draw` finds it.
   *
   * By name, or by where it lies in the draw order — which is what `pile`
   * prints, numbered from the top, so the two read as one another's halves.
   */
  | { kind: "stack"; cardId: string; pile: null; at: null }
  | { kind: "stack"; cardId: null; pile: "events" | "spells"; at: number }
  /**
   * Test mode: everything lying on an Obszar, off it (`place`'s inverse).
   *
   * Three ways of saying *what*, and they are three fields of one command
   * rather than three commands: `cardIds` names Karty, `classes` names whole
   * kinds, `gold` names the money. One comma-separated list fills all three —
   * `clear MIECZ, strangers, gold` — the way `deal`'s list fills its one, and
   * naming nothing at all is the bare sweep that takes the lot.
   */
  | {
      kind: "clear";
      fieldId: FieldId | null;
      cardIds: string[];
      gold: null;
      classes: CardClass[];
    }
  /**
   * The money named on its own, which bare `clear` takes anyway and
   * `clear MIECZ` leaves alone — so there was no way to say "just the coins".
   *
   * "all" rather than a number, because bare `clear gold` means the lot the way
   * bare `take gold` does. A third state and not a nullable number: `cardId:
   * null` already means "everything on the square", so nothing about the two
   * card fields could have carried this.
   */
  | {
      kind: "clear";
      fieldId: FieldId | null;
      cardIds: string[];
      gold: number | "all";
      classes: CardClass[];
    }
  /** Test mode: what is left in a pile, and what has been used (9.5, 16.8). */
  | { kind: "pile"; pile: "events" | "spells" | null }
  /**
   * The turn, in the three things anybody does to one.
   *
   * They were three verbs — `endturn`, `resetturn` and `turn <player>` — which
   * is three words to learn for one noun, and `help` listed them a screen
   * apart. The act is the second word now, so the family reads as a family and
   * Tab offers what there is to do to a turn the moment you have typed it.
   *
   * **`end`** is 10.1 and belongs to everybody; it is what the bare word
   * means, because handing the turn on is the thing you type twenty times a
   * session. `force` is the test console's: everything it walks past is a rule
   * — 5.6's surplus, 14.7's Bestia, and a Karta or a question the turn has not
   * finished — so the capability comes off the flag rather than off a second
   * verb, the way `gold +5 force` does.
   *
   * **`reset`** is this turn from the top, and **`<player>`** hands play round
   * until it is somebody's. Both overrule the rules, and both are the console's.
   */
  | { kind: "turn"; act: "end"; force: boolean }
  | { kind: "turn"; act: "reset" }
  /** Whose turn to walk play round to — never null, or a typo would end yours. */
  | { kind: "turn"; act: "reach"; who: string }
  /* Playing. These are the game as printed: you roll, you walk it out, you meet
     what is on the Obszar, you hand the turn on. */
  | { kind: "roll" }
  | { kind: "move"; fieldId: FieldId }
  | { kind: "draw" }
  | { kind: "look" }
  | { kind: "me"; who: string | null }
  /**
   * What a Karta says, read without holding it.
   *
   * A Postać, a Zdarzenie, a Przedmiot or a Zaklęcie — one verb, because from
   * where somebody is sitting they are all "that card I want to read", and
   * making them remember which pile it came from to look it up would be the
   * app's filing system leaking into the game.
   */
  | { kind: "card"; name: string }
  /* Encounters. What is standing in front of you, and the two ways past it. */
  | { kind: "fight"; cardId: string | null }
  | { kind: "escape" }
  | { kind: "attack"; who: string }
  | { kind: "raid"; who: string }
  | { kind: "pay" }
  | { kind: "ask" }
  | { kind: "free" }
  | { kind: "claim" }
  /* What you carry. A name, because a holding's id is a uuid nobody can type. */
  | { kind: "take"; name: string }
  /** The same distinction `place` draws, going the other way. Null takes the lot. */
  | { kind: "take"; name: null; gold: number | null }
  | { kind: "putdown"; name: string }
  | { kind: "equip"; name: string; slot: string | null }
  | { kind: "use"; name: string }
  /* The Bestia, the Most, and the two thresholds between the rings. */
  | { kind: "beast" }
  | { kind: "bridge" }
  /** `cross`, and `cross Uroczysko` where several Obszary border you (11.2). */
  | { kind: "cross"; to: FieldId | null }
  | { kind: "guardian" }
  | { kind: "ferry"; pay: boolean }
  /* Shops, healers and Zaklęcia. */
  | { kind: "buy"; name: string }
  | { kind: "sell"; name: string }
  | { kind: "heal"; points: number | null }
  | {
      kind: "cast";
      name: string;
      who: string | null;
      /** Where the Karta goes, for the one Zaklęcie that moves one. */
      to: string | null;
    }
  | { kind: "trade"; cards: string[]; swords: number | null }
  | { kind: "trophies"; mode: "points" | "cards" | null }
  /**
   * What a card asked, answered.
   *
   * The choices are a path, not a single pick: an effect can ask twice, and the
   * server re-walks the card from the start against the whole list — which is
   * what stops a card being talked into doing something it does not say. So
   * `answer 2 1` is "the second branch, then the first", and the browser sends
   * exactly the same array from a modal that remembered it.
   *
   * `card` names which one when more than one is waiting; null takes the only
   * one there is.
   */
  | { kind: "answer"; card: string | null; choices: number[] }
  /* The poczekalnia, which is playing the game too — somebody has to say the
     waiting is over (docs/LOBBY.md). */
  | { kind: "ready"; who: string | null; ready: boolean }
  | { kind: "start" }
  /**
   * A Zaklęcie into a hand (9.5).
   *
   * `wand` is the Różdżka Zaklęć's second clause — a hand that refills itself
   * up to its setup size — which is a different condition from 2.6's ceiling
   * and so a different draw. A flag rather than a verb of its own: it is the
   * same act, reached because a card says you may.
   */
  | { kind: "spell"; who: string | null; wand: boolean }
  /**
   * 7.2's change, and 7.3's "once a turn" either obeyed or not.
   *
   * `force` is what makes this one line two commands: without it the rule
   * decides, with it the console does — so the capability comes off the flag
   * rather than off a second word. `gold +5 force` set the pattern.
   */
  /**
   * `force` here is only half of what it is on `gold`, because 7.3 has two
   * halves and only one of them was ever the console's business.
   *
   * *Writing* the mark never is. Typing a Natura is not the character changing
   * one, so it cannot use up the change 7.3 allows them — and the plain line
   * used to spend it anyway, on something that never happened in the game. The
   * next card to turn them Zły would be refused over a change nobody at the
   * table had made. That is not a switch, so there is no word for it.
   *
   * *Reading* it is, and that is what the word is left for. A character who
   * already changed Natura this turn — really, in the game — refuses, and says
   * so, because a tester who was not told would read the refusal as the console
   * being broken. `force` is the answer to having been told.
   */
  | { kind: "nature"; nature: Nature; who: string | null; force: boolean }
  /** `stone` turns one to Kamień, `unstone` lifts it — see `freeFromStone`. */
  | { kind: "stone"; who: string | null; stone: boolean }
  | { kind: "effect"; effect: EffectName; who: string | null };

/**
 * The four parameters, under the words you type at them.
 *
 * English on the left, the store's column names on the right, and the line
 * between the two languages drawn here: everything you *type* at this console
 * is English, and everything you *name* keeps the name printed on it. A stat is
 * typed, so it is `magic`; a card, a field, an Obszar or a Postać is named, so
 * it stays MAGICZNY MIECZ and Karczma and BŁĘDNY RYCERZ. One rule, no list of
 * exceptions to remember, and `help` is the whole vocabulary again.
 */
export const STATS: Record<string, StatName> = {
  sword: "sword",
  magic: "magic",
  life: "life",
  gold: "gold",
  tury: "tury",
};

/**
 * What one verb's grammar is given: the word that was typed — which matters to
 * the few whose meaning turns on it, `stone`/`unstone`, `gold`/`sword` — its
 * own usage line for the refusals, and every word the console answers to, for
 * `help` to check a name against.
 */
export interface ParseContext {
  word: string;
  usage: string;
  words: ReadonlySet<string>;
}

/** What Tab is given: the parts typed so far, who is at the table, and what may be offered. */
export interface CompleteContext {
  players: readonly string[];
  offering: { stage?: Stage; testmode?: boolean };
  words: ReadonlySet<string>;
}

type Parsed<K extends Command["kind"]> = { ok: Extract<Command, { kind: K }> } | { error: string };

/**
 * One verb, whole: what `help` says of it, who may type it, how the line is
 * read, and what Tab offers after it.
 *
 * These were five tables — the `Command` union, `COMMANDS`, a `NEEDS` keyed on
 * the kind, sixty-five `word === "x"` branches in the parser and twenty-six
 * `verb === "x"` branches in the completer — and adding a verb meant finding all
 * five, which nobody did: thirty-six verbs had no completion because nobody
 * added the branch. Keyed on the command's kind rather than on the word typed,
 * so the same `Record` over `Command["kind"]` that `VERBS` uses on the
 * effectful side checks this one too — a kind in the union with no entry here
 * is a compile error, at this table.
 */
export interface Spec<K extends Command["kind"]> extends CommandSpec {
  parse: (tail: string, ctx: ParseContext) => Parsed<K>;
  /**
   * What Tab offers after the verb, or nothing: a verb that takes no argument
   * leaves it out, and one that takes a name it cannot know — a player's new
   * name, a number — says so by offering an empty pool.
   */
  complete?: (parts: readonly string[], ctx: CompleteContext) => Pool;
}

const spec = <K extends Command["kind"]>(one: Spec<K>): Spec<K> => one;

/** A whole number of coins, or the reason it is not one. */
function coins(said: string, verb: string): { gold: number } | { error: string } {
  const asked = Number(said);
  if (!Number.isInteger(asked) || asked < 1) {
    return { error: `\`${verb} gold\` wants a whole number of Sztuki Złota — \`${verb} gold 5\`.` };
  }
  return { gold: asked };
}

/** `force`, `hard`, `wand`, `pay`: a trailing bare word, taken off the end of the parts. */
function trailing(parts: readonly string[], flag: string): { on: boolean; rest: readonly string[] } {
  const on = parts.length > 0 && parts[parts.length - 1].toLowerCase() === flag;
  return { on, rest: on ? parts.slice(0, -1) : parts };
}

/**
 * A Postać out of the game, or back into it — the grammar `remove` and
 * `revive` share.
 *
 * Named by seat or by its own name, and the two are not interchangeable: a
 * seat is where a Postać is standing, so only a living one has one, while a
 * name reaches the dead as well. Which is the line between what a host may do
 * and what only this console may — the rulebook says nothing at all about
 * withdrawing a living Postać, and says exactly what happens to a dead one
 * (4.4), so putting that Karta back is the break.
 *
 * `hard` last, the way `force` is, and for the same reason: it is about the
 * removal rather than about who it lands on, and the common line never has to
 * step over it.
 */
function postac(
  tail: string,
  usage: string,
): { seat: number | null; characterId: string | null; hard: boolean } | { error: string } {
  const { on: hard, rest } = trailing(tail.split(/\s+/).filter(Boolean), "hard");
  const said = rest.join(" ");
  if (said === "") return missing(usage, "Which Postać?");
  if (/^\d+$/.test(said)) return { seat: Number(said), characterId: null, hard };
  const hit = findByName(PEOPLE, (person) => person.name, said);
  if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
  if ("missing" in hit) return { error: `No Postać called \`${said}\`.` };
  return { seat: null, characterId: hit.found.id, hard };
}

/** Who to offer: everybody at the table, for the verbs that take `[player]`. */
const people = (parts: readonly string[], { players }: CompleteContext): Pool => ({
  pool: [...players],
  at: 1,
});

/** The board, wherever an Obszar is named on its own. */
const board = (): Pool => shelved(FIELD_KINDS, 1);

/**
 * `place` names a Karta first and an Obszar only after `at`; `clear` is its
 * inverse and reads the same way.
 *
 * `clear` offered Obszary in both places, which is the wrong half of the
 * grammar: the common use is "take that Karta off the square I am standing
 * on", and Tab answered with a wall of place names.
 */
function placeOrClear(verb: "place" | "clear", parts: readonly string[]): Pool {
  const at = keywordAt(parts, "at");
  if (at !== -1) return shelved(FIELD_KINDS, at + 1);
  /**
   * The money form, which both verbs have: `place gold N` puts coins down and
   * `clear gold [N]` takes them off. Tab cannot finish a number, so the word is
   * offered and then it gets out of the way — nothing where the amount goes,
   * and `at` once something has been typed there.
   *
   * `clear` differs in one respect: the amount is optional, because bare
   * `clear gold` means the lot. So `at` is offered as soon as the word is
   * finished, and again after a number.
   */
  const money = (parts[1] ?? "").toLowerCase();
  if (GOLD_WORDS.has(money)) {
    const amountIn = parts.length >= 4 && parts[parts.length - 1] === "";
    const bare = verb === "clear" && parts.length === 3 && parts[2] === "";
    return amountIn || bare ? { pool: ["at"], at: parts.length - 1 } : nothing(parts);
  }
  /**
   * `clear` takes whole kinds, comma-separated, so what is being typed is
   * whatever follows the last comma — `deal`'s rule, for the same grammar.
   * `place` has no list and keeps the plain first argument. Past a comma the
   * Obszar drops out and everything else stays: a list may hold Karty as well
   * as kinds — `clear MIECZ, strangers` — so both are offered. What cannot be
   * there is a place name: `at` takes the one Obszar a sweep has.
   */
  if (verb === "clear") {
    const comma = afterComma(parts);
    if (comma > 1) return shelved([BY_TYPE, ...PLACEABLE], comma);
  }
  const names = PLACEABLE.flatMap((group) => group.cards.map((one) => one.name));
  if (finishedName(parts, names)) return { pool: ["at"], at: parts.length - 1 };
  // Money first, the way 12.1 lists it — "zabrać leżące złoto, Przedmioty lub
  // Przyjaciół" — and because it is one word against a hundred and sixty-five,
  // which is the one a list this long can afford to lead with. For `clear` it
  // leads the kinds instead of standing alone, because there the two are one
  // answer: everything you can name instead of a card.
  return verb === "clear" ? shelved([BY_TYPE, ...PLACEABLE], 1) : shelved([GOLD_OFFERED, ...PLACEABLE], 1);
}

export const SPECS: { [K in Command["kind"]]: Spec<K> } = {
  help: spec({
    name: "help",
    offTable: true,
    aliases: ["?"],
    usage: "help [command]",
    summary: "list these commands, or explain one of them",
    needs: "play",
    group: "reading",
    parse: (tail, { words }) => {
      // Refused here rather than reported as an empty list, because `help go`
      // typed at a console that has no `go` is a question, and "there is no
      // such command" is the answer to it.
      const asked = tail.toLowerCase().split(/\s+/)[0];
      // `all` is not a command and is the one word this takes that is not one:
      // it asks for the whole list rather than about anything.
      if (tail !== "" && asked !== "all" && !words.has(asked)) {
        return { error: `No command \`${tail}\`. Type \`help\` for the list.` };
      }
      return { ok: { kind: "help", about: asked || null } };
    },
    // `help` takes every command, locked or out of season: asking about one you
    // cannot run is a fair question, and the answer says why.
    complete: (_parts, { words }) => ({ pool: [...words], at: 1 }),
  }),
  rule: spec({
    name: "rule",
    offTable: true,
    aliases: [],
    usage: "rule [5.3|5]",
    summary: "read a rule out of the Instrukcji, or list a chapter",
    needs: "play",
    group: "reading",
    parse: (tail) => ({ ok: { kind: "rule", about: tail.trim() || null } }),
  }),
  stat: spec({
    name: "gold",
    aliases: ["sword", "magic", "life", "tury"],
    usage: "gold +5|=12 [player] [force]",
    summary: "move a parameter, or `=` it to a number — `force` passes 1.3's floor; `tury` owes turns",
    needs: "testmode",
    group: "override",
    parse: (tail, { word, usage }) => {
      let [amount, ...rest] = tail.split(/\s+/).filter(Boolean);
      if (!amount) return missing(usage, "How much?");
      // `= 12` as readily as `=12`, since one is what a person types and the
      // other is what they type when they are being careful.
      if (amount === "=" && rest.length > 0) {
        amount = `=${rest[0]}`;
        rest = rest.slice(1);
      }
      /**
       * `=12` puts the number where you want it; `+5` and `-1` move it.
       *
       * A bare number stays a gain — "gold 5" plainly means five more of it,
       * and has meant that for as long as there has been a console. What it is
       * not is a way to *set* one, which is what somebody wants about as often:
       * reaching a Miecz of 8 from 3 should not be arithmetic done by the
       * person typing.
       */
      const assigning = amount.startsWith("=");
      const number = Number(assigning ? amount.slice(1) : amount.startsWith("+") ? amount.slice(1) : amount);
      if (!Number.isInteger(number) || (!assigning && number === 0)) {
        return { error: `\`${amount}\` is not a whole number of points.` };
      }
      if (assigning && number < 0) {
        return { error: `\`${amount}\`: nothing goes below zero.` };
      }
      const delta = assigning ? 0 : number;
      const set = assigning ? number : null;
      /**
       * `force` last, after the player, because it is about the change and not
       * about who it lands on: `magic -1 Ola force`. A word rather than a flag,
       * so it reads as the sentence it is and Tab finishes it like everything
       * else — and last, so the common line never has to step over it.
       */
      const { on: force, rest: who } = trailing(rest, "force");
      return { ok: { kind: "stat", stat: STATS[word], delta, set, who: who.join(" ") || null, force } };
    },
    // A stat takes its amount first and a player after it.
    complete: (_parts, { players }) => ({ pool: [...players, "force"], at: 2 }),
  }),
  /* --------------------------------------------------------------------------
   * Playing. The game as printed: roll, walk it out, meet what is there, pass.
   * ----------------------------------------------------------------------- */
  ready: spec({
    name: "ready",
    when: ["lobby"],
    aliases: ["unready"],
    usage: "ready [player]",
    summary: "say you have chosen — `unready` takes it back",
    needs: "play",
    group: "table",
    parse: (tail, { word }) => ({ ok: { kind: "ready", who: tail || null, ready: word === "ready" } }),
    complete: people,
  }),
  start: spec({
    name: "start",
    when: ["lobby"],
    aliases: [],
    usage: "start",
    summary: "begin the game; everyone who has a Postać must be ready",
    needs: "play",
    group: "table",
    parse: () => ({ ok: { kind: "start" } }),
  }),
  roll: spec({
    name: "roll",
    when: ["roll"],
    aliases: [],
    usage: "roll",
    summary: "throw the die for your move (10.2)",
    needs: "play",
    group: "turn",
    parse: () => ({ ok: { kind: "roll" } }),
  }),
  move: spec({
    name: "move",
    when: ["move"],
    aliases: ["walk"],
    usage: "move <field>",
    summary: "walk the roll out and stand there (10.2) — `look` lists where it reaches",
    needs: "play",
    group: "turn",
    parse: (tail, { usage }) =>
      named(PLACES, (field) => field.name, tail, "Obszar", (field) => ({ kind: "move" as const, fieldId: field.id }), usage),
    complete: board,
  }),
  draw: spec({
    name: "draw",
    when: ["field"],
    aliases: [],
    usage: "draw",
    summary: "take what the Obszar you are standing on owes you (13.4)",
    needs: "play",
    group: "turn",
    parse: () => ({ ok: { kind: "draw" } }),
  }),
  answer: spec({
    name: "answer",
    when: ["field"],
    // No `a`: the single-letter aliases are interactive fiction's own three —
    // l, i, x — and a letter that saves nothing costs a word somebody else
    // wanted.
    aliases: [],
    usage: "answer [n] [card]",
    summary: "settle what a Karta or an Obszar asked — `look` shows the question",
    needs: "play",
    group: "turn",
    parse: (tail) => {
      const parts = tail.split(/\s+/).filter(Boolean);
      const numbers = parts.filter((one) => /^\d+$/.test(one)).map(Number);
      const named = parts.filter((one) => !/^\d+$/.test(one)).join(" ");
      // No number is a real answer. A compulsory Obszar comes in two shapes —
      // one that asks (`wybor`) and one that only rolls (`rzut`, the Karczma)
      // — and the second has nothing to choose. `answer` alone means "get on
      // with it"; `answer 2` means "and I pick the second".
      return { ok: { kind: "answer", card: named || null, choices: numbers } };
    },
  }),
  buy: spec({
    name: "buy",
    aliases: [],
    when: PLAYING,
    usage: "buy <card>",
    summary: "buy from the Obszar you are standing on, at its printed price",
    needs: "play",
    group: "trade",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "buy", name: tail } } : missing(usage, "Buy what?")),
    complete: () => shelved(PLACEABLE, 1),
  }),
  sell: spec({
    name: "sell",
    aliases: [],
    when: PLAYING,
    usage: "sell <card>",
    summary: "sell one back to the Lichwiarz in the Gród",
    needs: "play",
    group: "trade",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "sell", name: tail } } : missing(usage, "Sell what?")),
    complete: () => shelved(PLACEABLE, 1),
  }),
  heal: spec({
    name: "heal",
    aliases: [],
    when: PLAYING,
    usage: "heal [n]",
    summary: "take back a point of Życie, or buy several where they are sold (4.2)",
    needs: "play",
    group: "trade",
    parse: (tail, { usage }) => {
      if (!tail) return { ok: { kind: "heal", points: null } };
      if (!/^\d+$/.test(tail)) return missing(usage, `How many — \`${tail}\`?`);
      return { ok: { kind: "heal", points: Number(tail) } };
    },
  }),
  cast: spec({
    name: "cast",
    aliases: [],
    when: PLAYING,
    usage: "cast <spell> [at player] [to field]",
    summary: "cast a Zaklęcie you are holding (9.6)",
    needs: "play",
    group: "carrying",
    parse: (tail, { usage }) => {
      if (!tail) return missing(usage, "Cast what?");
      // `at` joins the two names, the way `place MIECZ at Karczma` does, and
      // `to` adds the third for the card that moves what it points at.
      const [named, rest] = tail.split(AT);
      if (!named?.trim()) return missing(usage, "Cast what?");
      const [at, to] = (rest ?? "").split(TO);
      return { ok: { kind: "cast", name: named.trim(), who: at?.trim() || null, to: to?.trim() || null } };
    },
    // The Zaklęcie first; past `at` a player, past `to` an Obszar.
    complete: (parts, { players }) => {
      const to = keywordAt(parts, "to");
      if (to !== -1) return shelved(FIELD_KINDS, to + 1);
      const at = keywordAt(parts, "at");
      if (at !== -1) return { pool: [...players], at: at + 1 };
      return shelved([ZAKLECIA], 1);
    },
  }),
  trophies: spec({
    // A table setting, so it lives in the noun-space beside `table` and
    // `testmode` rather than in the game's verb-space. Bare `trophies` says
    // which way it is, as bare `testmode` does.
    name: "trophies",
    aliases: [],
    when: ["none", "lobby"],
    offTable: false,
    usage: "trophies [points|cards]",
    summary: "how beaten Wrogowie are kept (1.4) — points, or the Karty as printed",
    needs: "play",
    group: "trade",
    parse: (tail, { usage }) => {
      if (!tail) return { ok: { kind: "trophies", mode: null } };
      const asked = tail.trim().toLowerCase();
      if (asked === "points" || asked === "cards") return { ok: { kind: "trophies", mode: asked } };
      return missing(usage, "`points` (score them) or `cards` (keep the Karty, as printed)?");
    },
    complete: () => ({ pool: ["points", "cards"], at: 1 }),
  }),
  trade: spec({
    // Naming nothing hands in everything, which is what a player cashing out
    // is usually after. Naming cards hands in those — 1.4 lets you pick, and a
    // Smok held back is six points not burnt.
    name: "trade",
    aliases: [],
    when: PLAYING,
    usage: "trade [n|cards]",
    summary: "cash beaten Wrogowie in at 7 points a Miecz (1.4) — how many Miecze you want, the Karty you name, or all of them",
    needs: "play",
    group: "trade",
    parse: (tail, { usage }) => {
      /**
       * A bare number is a count of Miecze, not a card.
       *
       * Unambiguous because no Karta is called "2", and it is the thing
       * somebody actually wants: you know how much Miecz you are short, not
       * which of your four Wrogowie add up to it. Working that out is
       * `offerFor`'s.
       */
      if (tail && /^\d+$/.test(tail)) {
        const swords = Number(tail);
        if (swords < 1) return missing(usage, "How many Miecze — at least one?");
        return { ok: { kind: "trade", cards: [], swords } };
      }
      // Commas or spaces: "trade CYKLOP, NOBBIN" and "trade CYKLOP NOBBIN" are
      // the same list, because a player typing two card names will use either.
      const cards = tail ? tail.split(",").flatMap((part) => part.trim()).filter((part) => part.length > 0) : [];
      return { ok: { kind: "trade", cards, swords: null } };
    },
  }),
  beast: spec({
    name: "beast",
    aliases: [],
    when: PLAYING,
    usage: "beast",
    summary: "fight the Bestia at the Zamek — winning ends the game (14.7, 22)",
    needs: "play",
    group: "fight",
    parse: () => ({ ok: { kind: "beast" } }),
  }),
  bridge: spec({
    name: "bridge",
    aliases: ["most"],
    when: ["move", "field"],
    usage: "bridge",
    summary: "try to step onto the Kamienny Most from an entrance (11.10)",
    needs: "play",
    group: "board",
    parse: () => ({ ok: { kind: "bridge" } }),
  }),
  cross: spec({
    name: "cross",
    aliases: [],
    when: PLAYING,
    usage: "cross [field]",
    summary: "cross between the Kręgi — the Trzęsawiska or the Lodowy Las (11.1-11.8)",
    needs: "play",
    group: "board",
    parse: (tail) => {
      if (tail === "") return { ok: { kind: "cross", to: null } };
      const where = fieldNamed(tail);
      if ("error" in where) return where;
      return { ok: { kind: "cross", to: where.fieldId } };
    },
    complete: board,
  }),
  guardian: spec({
    name: "guardian",
    aliases: [],
    when: PLAYING,
    usage: "guardian",
    summary: "square up to whatever is standing in the way (11.9-11.11)",
    needs: "play",
    group: "fight",
    parse: () => ({ ok: { kind: "guardian" } }),
  }),
  ferry: spec({
    name: "ferry",
    aliases: [],
    when: PLAYING,
    usage: "ferry [pay]",
    summary: "the Przeprawa — `pay` a Sztuka Złota, or be sent back",
    needs: "play",
    group: "board",
    // `pay` last and bare, the way `force` and `hard` are.
    parse: (tail) => ({ ok: { kind: "ferry", pay: tail.toLowerCase() === "pay" } }),
    complete: () => ({ pool: ["pay"], at: 1 }),
  }),
  take: spec({
    name: "take",
    aliases: ["get"],
    when: ["field", "fight"],
    usage: "take <gold [N]|card>",
    summary: "pick up the Złoto lying on your Obszar — all of it unless a number says — or a Karta you drew or one lying there (12.1, 13.4)",
    needs: "play",
    group: "carrying",
    parse: (tail, { usage }) => {
      /**
       * `take gold` scoops up the lot, which is what a hand does at a table and
       * what the Obszar's own „weź wszystko" does on screen. A number takes
       * that many — 12.1 puts the amount in the player's gift, and Talisman's
       * 12:1, the sentence it is adapted from, says *any* Gold Counters may be
       * taken.
       */
      const asked = goldAsked(tail);
      if (asked !== null) {
        if (asked === "" || asked.toLowerCase() === "all") return { ok: { kind: "take", name: null, gold: null } };
        const amount = coins(asked, "take");
        if ("error" in amount) return amount;
        return { ok: { kind: "take", name: null, gold: amount.gold } };
      }
      return tail ? { ok: { kind: "take", name: tail } } : missing(usage, "Take what?");
    },
    /**
     * `take` names something lying on the Obszar or dealt into the turn, which
     * is the same pool `place` puts there — and the gold beside it, since 12.1
     * gives both to whoever finished their move here. Tab cannot know what is
     * actually on the square, so it offers what could be. That is what `drop`
     * does with a hand it cannot see either.
     */
    complete: (parts) => {
      const money = (parts[1] ?? "").toLowerCase();
      // Bare `take gold` already means the lot; `all` is the word for saying so.
      if (GOLD_WORDS.has(money)) return { pool: ["all"], at: 2 };
      return shelved([GOLD_OFFERED, ...PLACEABLE], 1);
    },
  }),
  putdown: spec({
    // `drop` is the lawful one: `place` conjures a card onto a field and this
    // puts down one you are holding. The kind is `putdown` because `place` had
    // the obvious name first.
    name: "drop",
    when: PLAYING,
    aliases: [],
    usage: "drop <card>",
    summary: "put one down on the Obszar you are standing on (12.1)",
    needs: "play",
    group: "carrying",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "putdown", name: tail } } : missing(usage, "Drop what?")),
    // A Karta out of your own hand, and no Obszar — it is the square you are
    // standing on (12.1). It sat in `place`'s branch from when the two shared a
    // word, so Tab offered it an `at` the grammar rejects.
    complete: () => ({ pool: CARDS.map((c) => c.name), at: 1 }),
  }),
  equip: spec({
    name: "equip",
    when: PLAYING,
    aliases: ["wear"],
    usage: "equip <card> [slot]",
    summary: "put a Przedmiot on — the place is worked out unless it fits two",
    needs: "play",
    group: "carrying",
    parse: (tail, { usage }) => {
      if (!tail) return missing(usage, "Wear what?");
      // The slot last, the way `force` and `hard` are: it is about where the
      // card goes rather than which card it is, and most cards fit one place.
      const parts = tail.split(/\s+/);
      const last = parts[parts.length - 1].toLowerCase();
      const slot = parts.length > 1 && SLOT_WORDS.has(last) ? last : null;
      const name = (slot === null ? parts : parts.slice(0, -1)).join(" ");
      if (!name) return missing(usage, "Wear what?");
      return { ok: { kind: "equip", name, slot } };
    },
    complete: () => shelved(PLACEABLE, 1),
  }),
  use: spec({
    name: "use",
    when: PLAYING,
    aliases: [],
    usage: "use <card>",
    summary: "spend a Karta that is spent by using it",
    needs: "play",
    group: "carrying",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "use", name: tail } } : missing(usage, "Use what?")),
    complete: () => shelved(PLACEABLE, 1),
  }),
  fight: spec({
    name: "fight",
    aliases: [],
    when: ["field", "fight"],
    usage: "fight [foe]",
    summary: "square up to a Wróg on your Obszar — named when more than one is there (16.2)",
    needs: "play",
    group: "fight",
    parse: (tail, { usage }) => {
      // Nothing named takes whatever is waiting, which is the usual case: a
      // Wróg attacks the character who drew him (16.2), and there is only one
      // of him.
      if (!tail) return { ok: { kind: "fight", cardId: null } };
      return named(FOES, (card) => card.name, tail, "Wróg", (card) => ({ kind: "fight" as const, cardId: card.id }), usage);
    },
    /**
     * Every Wróg, in one list and not two.
     *
     * The box prints `Wróg II Bestia` and `Wróg III Demon`, and they are two
     * classes everywhere a rule counts them (15.2, 17.5, 18.2) — but this is a
     * list read by name, and the Księga shelves them together for the same
     * reason. One heading over the whole pool is no heading at all, so `fight`
     * keeps the plain alphabet.
     */
    complete: () => ({ pool: FOES.map((c) => c.name), at: 1 }),
  }),
  escape: spec({
    name: "escape",
    aliases: ["flee"],
    when: ["field", "fight"],
    usage: "escape",
    summary: "try to slip away instead of fighting (19.1)",
    needs: "play",
    group: "fight",
    parse: () => ({ ok: { kind: "escape" } }),
  }),
  attack: spec({
    name: "attack",
    aliases: [],
    when: ["field"],
    usage: "attack <player>",
    summary: "pick a fight with a Postać standing on your Obszar (13.3, 17.6)",
    needs: "play",
    group: "fight",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "attack", who: tail } } : missing(usage, "Attack whom?")),
    complete: people,
  }),
  claim: spec({
    // The Władca's word is "wypełnić", but what the player does at the counter
    // is collect — the errand was finished somewhere else, often turns ago.
    name: "claim",
    aliases: [],
    when: ["field", "move", "roll"],
    usage: "claim",
    summary: "hand the Władca's misja in and take the Tarcza (Twierdza)",
    needs: "play",
    group: "board",
    parse: () => ({ ok: { kind: "claim" } }),
  }),
  free: spec({
    // Named for what it is trying to do rather than for what is holding you:
    // the Świątynie call it being opętany, and a second Obszar that pinned a
    // character would reach for this verb rather than earn its own.
    name: "free",
    aliases: [],
    when: ["field", "move", "roll"],
    usage: "free",
    summary: "throw to shake off something holding you in place (Świątynie)",
    needs: "play",
    group: "board",
    parse: () => ({ ok: { kind: "free" } }),
  }),
  ask: spec({
    // "gdy sobie tego zażyczysz" — the card's own word for it is asking, and a
    // player with a Krzyżowiec is asking a person rather than reading a scroll.
    name: "ask",
    aliases: [],
    when: ["field", "move", "roll", "fight"],
    usage: "ask",
    summary: "have a Przyjaciel speak the Zaklęcie he carries (Krzyżowiec, Gnom)",
    needs: "play",
    group: "friends",
    parse: () => ({ ok: { kind: "ask" } }),
  }),
  pay: spec({
    // No argument: only one card in the box sells anything, and naming him
    // would be asking the player to tell the app what it already knows.
    name: "pay",
    aliases: [],
    when: ["field", "move", "roll"],
    usage: "pay",
    summary: "buy a turn of a Przyjaciel's help with a Sztuka Złota (Najemnik)",
    needs: "play",
    group: "friends",
    parse: () => ({ ok: { kind: "pay" } }),
  }),
  raid: spec({
    // Named for what it is rather than for the card that does it: "wyprawa" is
    // the word the Poszukiwacz's own text reaches for, and a second card that
    // sends somebody out would use this verb rather than earn a new one.
    name: "raid",
    aliases: [],
    when: ["field"],
    usage: "raid <player>",
    summary: "send a Przyjaciel to attack up to 3 Obszary away (Poszukiwacz Przygód)",
    needs: "play",
    group: "friends",
    parse: (tail, { usage }) =>
      tail ? { ok: { kind: "raid", who: tail } } : missing(usage, "Send your Przyjaciel against whom?"),
    complete: people,
  }),
  card: spec({
    // `card` is the alias `give` used to answer to. It is a better name for
    // reading one than for conjuring one, and reading is the commoner want.
    name: "card",
    offTable: true,
    // `x` is `examine` — Zork's word, and forty-five years of muscle memory
    // for "tell me about that thing".
    aliases: ["read", "x"],
    usage: "card <name>",
    summary: "what a Karta says — Postać, Zdarzenie, Przedmiot or Zaklęcie",
    needs: "play",
    group: "reading",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "card", name: tail } } : missing(usage, "Which card?")),
    // Everything readable, which is every Karta in the box and every Postać: a
    // Wróg cannot be dealt into a hand and can certainly be looked at.
    complete: () => shelved(READ_KINDS, 1),
  }),
  look: spec({
    name: "look",
    aliases: ["l"],
    usage: "look",
    summary: "the Obszar you are on, what is on it, and what the turn is waiting for",
    needs: "play",
    group: "reading",
    parse: () => ({ ok: { kind: "look" } }),
  }),
  me: spec({
    name: "me",
    // `i` is `inventory`, the most-typed word in interactive fiction. What it
    // shows here is a Karta Postaci, which is that and the numbers beside it.
    aliases: ["sheet", "i"],
    usage: "me [player]",
    summary: "a Karta Postaci as it stands: points, Życie, Złoto, Natura and what is carried",
    needs: "play",
    group: "reading",
    parse: (tail) => ({ ok: { kind: "me", who: tail || null } }),
    complete: people,
  }),
  who: spec({
    name: "who",
    aliases: [],
    usage: "who",
    summary: "everyone at the table, and which seat they drive",
    needs: "play",
    group: "reading",
    parse: () => ({ ok: { kind: "who" } }),
  }),
  seat: spec({
    name: "seat",
    aliases: [],
    usage: "seat <player> <seat>",
    summary: "put somebody in a seat; refuses one that is taken",
    needs: "play",
    group: "table",
    /**
     * `seat Ola 3` — the seat is the number on the end.
     *
     * No keyword between them, unlike `rename`, because the two arguments are
     * not the same kind of thing: a seat is a bare number and no name here
     * begins with a digit, so the line reads itself.
     */
    parse: (tail, { usage }) => {
      const parts = tail.split(/\s+/).filter(Boolean);
      const last = parts[parts.length - 1] ?? "";
      if (!/^\d+$/.test(last)) return missing(usage, "Into which seat?");
      const who = parts.slice(0, -1).join(" ");
      if (!who) return missing(usage, "Seat whom?");
      return { ok: { kind: "seat", who, seat: Number(last) } };
    },
    // `seat Ola 3` finishes the person; the seat is a digit and finishes itself.
    complete: people,
  }),
  unseat: spec({
    name: "unseat",
    aliases: [],
    usage: "unseat [player]",
    summary: "out of the seat, still at the table — the Postać stays put",
    needs: "play",
    group: "table",
    parse: (tail) => ({ ok: { kind: "unseat", who: tail || null } }),
    complete: people,
  }),
  kick: spec({
    name: "kick",
    aliases: [],
    usage: "kick <player>",
    summary: "put somebody out of the table",
    needs: "play",
    group: "table",
    /**
     * The one command here that will not default to you.
     *
     * Everything else that takes `[player]` means yourself when it is left
     * off, which is right when the worst case is a Życie you can put back.
     * This takes the seat away from whoever it names and cannot be undone by
     * typing it again, and a bare `kick` meaning "kick me" is a way to lose
     * your own table to a fumbled line.
     */
    parse: (tail, { usage }) => (tail ? { ok: { kind: "kick", who: tail } } : missing(usage, "Kick whom?")),
    complete: people,
  }),
  leave: spec({
    // No `exit` alias. `mm` claims that word for leaving the *program*, and its
    // local commands run first — so this advertised a word that did nothing
    // here and something else in the browser. Two meanings for one word, and
    // which you got depended on where you typed it.
    name: "leave",
    aliases: [],
    usage: "leave",
    summary: "go, by your own choice",
    needs: "play",
    group: "table",
    parse: () => ({ ok: { kind: "leave" } }),
  }),
  rename: spec({
    name: "rename",
    aliases: [],
    usage: "rename <player> as <name>",
    summary: "give somebody a name",
    needs: "play",
    group: "table",
    /**
     * `rename Ola as Basia` — two names in one line, split by the word that
     * reads as English and appears in no Postać and no Obszar, exactly as
     * `place` uses `at`. Without the split there is no telling where one name
     * ends.
     */
    parse: (tail, { usage }) => {
      const cut = tail.search(AS);
      if (cut === -1) return missing(usage, "Rename them to what?");
      const who = tail.slice(0, cut).trim();
      const name = tail.slice(cut).replace(AS, "").trim();
      if (!who) return missing(usage, "Rename whom?");
      if (!name) return missing(usage, "Rename them to what?");
      return { ok: { kind: "rename", who, name } };
    },
    // Only the person. What they are being renamed to is not a name anybody
    // has yet, which is the point of typing it.
    complete: (parts, ctx) => (keywordAt(parts, "as") === -1 ? people(parts, ctx) : nothing(parts)),
  }),
  host: spec({
    name: "host",
    aliases: [],
    usage: "host <player>",
    summary: "hand over the host role",
    needs: "play",
    group: "table",
    parse: (tail, { usage }) => (tail ? { ok: { kind: "host", who: tail } } : missing(usage, "Hand it to whom?")),
    complete: people,
  }),
  pick: spec({
    name: "pick",
    aliases: [],
    usage: "pick [character] [seat]",
    summary: "a Postać into a seat — LOSOWA or nothing takes the surprise, yours unless numbered (4.4)",
    needs: "play",
    group: "table",
    /**
     * A Postać into a seat: 4.4's "moze wybrac sobie nowa", and a latecomer's
     * first one, which are the same act for different reasons.
     *
     * Both arguments optional and told apart by shape. A trailing bare number
     * is the seat — yours when it is left off — and whatever is in front of it
     * is the Postać, drawn when that is left off too, which is what 4.4
     * describes.
     */
    parse: (tail) => {
      const parts = tail.split(/\s+/).filter(Boolean);
      const numbered = parts.length > 0 && /^\d+$/.test(parts[parts.length - 1]);
      const seat = numbered ? Number(parts[parts.length - 1]) : null;
      const said = (numbered ? parts.slice(0, -1) : parts).join(" ");
      if (said === "") return { ok: { kind: "pick", characterId: null, seat } };
      // The surprise, by the name on its own Karta. `null` already means it —
      // a bare `pick` takes it — and this is the same answer said out loud, so
      // typing what Tab offered does what Tab implied.
      if (said.toUpperCase() === RANDOM_CHARACTER_NAME) {
        return { ok: { kind: "pick", characterId: RANDOM_CHARACTER_ID, seat } };
      }
      const hit = findByName(PEOPLE, (person) => person.name, said);
      if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
      if ("missing" in hit) return { error: `No Postać called \`${said}\`.` };
      return { ok: { kind: "pick", characterId: hit.found.id, seat } };
    },
    // The surprise first: it is the one entry that is not a Postać, and a
    // player scanning for "any of them" should not have to know that the way
    // to say it is to say nothing.
    complete: () => ({ pool: [RANDOM_CHARACTER_NAME, ...PEOPLE.map((person) => person.name)], at: 1 }),
  }),
  remove: spec({
    name: "remove",
    aliases: ["erase"],
    usage: "remove <character> [hard]",
    summary: "a Postać out of the game, its Karty to the used piles — `hard` bars it for good",
    needs: "testmode",
    group: "override",
    parse: (tail, { usage }) => {
      const said = postac(tail, usage);
      if ("error" in said) return said;
      return { ok: { kind: "remove", ...said } };
    },
    // Postacie by name — a seat number would do just as well, but a number has
    // nothing to finish.
    complete: () => ({ pool: PEOPLE.map((person) => person.name), at: 1 }),
  }),
  revive: spec({
    name: "revive",
    aliases: [],
    usage: "revive <character>",
    summary: "back to life where it fell, with its own points and no Przedmioty",
    needs: "testmode",
    group: "override",
    parse: (tail, { usage }) => {
      const said = postac(tail, usage);
      if ("error" in said) return said;
      if (said.hard) return { error: "`hard` is a removal's word, not a revival's." };
      return { ok: { kind: "revive", seat: said.seat, characterId: said.characterId } };
    },
    complete: () => ({ pool: PEOPLE.map((person) => person.name), at: 1 }),
  }),
  kill: spec({
    name: "kill",
    aliases: [],
    usage: "kill [player]",
    summary: "take a character to 0 Życia (4.4)",
    needs: "testmode",
    group: "override",
    parse: (tail) => ({ ok: { kind: "kill", who: tail || null } }),
    complete: people,
  }),
  nature: spec({
    name: "nature",
    when: PLAYING,
    aliases: [],
    usage: "nature good|evil|chaotic [player] [force]",
    summary: "change a Natura (7.2) — leaves no mark of 7.3; `force` ignores one",
    // 7.2 changes a Natura by Karta Zmiany Natury. Typing it changes one with
    // no card, which is the definition this file gives for `testmode`.
    needs: "testmode",
    group: "override",
    parse: (tail) => {
      const [said, ...rest] = tail.split(/\s+/).filter(Boolean);
      const nature = NATURES[(said ?? "").toLowerCase()];
      if (!nature) return { error: `Which Natura — ${Object.keys(NATURES).join(", ")}?` };
      // `force` last, after the player, the way `gold` takes it.
      const { on: force, rest: who } = trailing(rest, "force");
      return { ok: { kind: "nature", nature, who: who.join(" ") || null, force } };
    },
    // The Natura first, then who it belongs to.
    complete: (parts, { players }) =>
      parts.length === 2 ? { pool: Object.keys(NATURES), at: 1 } : { pool: [...players], at: 2 },
  }),
  turn: spec({
    /**
     * One noun, three things you do to it — see the `turn` Command for why the
     * three verbs became one.
     *
     * `needs: "play"` because the bare word is 10.1 and belongs to everybody;
     * the two acts that overrule the rules are locked by `needsOf` instead,
     * which is where a capability that depends on the *arguments* is decided.
     */
    name: "turn",
    aliases: ["pass", "endturn"],
    // Anything but the poczekalnia, where there is no turn to do anything to.
    when: PLAYING,
    usage: "turn [end|reset|<player>] [force]",
    summary:
      "hand the turn on (10.1) — bare, or `end`. `reset` starts it over, a name hands play round to somebody; `force` overrules what refuses",
    needs: "play",
    group: "turn",
    /**
     * Bare is `end`, because handing the turn on is the line somebody types
     * twenty times a session and it kept its own word for years — `pass` and
     * `endturn` still say it, and now they say it as this. Anything else in the
     * first position is a person: `turn reset` and `turn Ola` are told apart by
     * the one word that is not a name.
     *
     * A player really called „reset" is out of luck and can use their seat
     * number. That is the whole cost of the subword, and it is worth it: the
     * alternative is a fourth verb nobody would find.
     */
    parse: (tail) => {
      // `force` last and bare, the way `gold`'s and `nature`'s are.
      const { on: forced, rest } = trailing(tail.split(/\s+/).filter(Boolean), "force");
      const said = rest.join(" ");
      const act = said.toLowerCase();
      if (act === "reset") {
        if (forced) return { error: "`turn reset` takes no `force` — it refuses nothing." };
        return { ok: { kind: "turn", act: "reset" } };
      }
      if (act === "" || act === "end") return { ok: { kind: "turn", act: "end", force: forced } };
      // A name, which is the one act that cannot default to you: a bare `turn`
      // is handing yours on, and walking play round to yourself is a no-op
      // nobody types.
      if (forced) return { error: "`force` belongs to `turn end`, not to a name." };
      return { ok: { kind: "turn", act: "reach", who: said } };
    },
    /**
     * What there is to do to a turn, and who to do the third one to.
     *
     * Offered rather than left to be remembered: `force` is a word you type at
     * a console that has just refused you, and a refusal that does not say
     * what to type next is a refusal you argue with. The two acts that need
     * test mode are not offered without it, the way `availableIn` hides a
     * locked verb — Tab must not teach a line that will be refused.
     */
    complete: (parts, { players, offering }) => {
      if (offering.testmode === false) return { pool: ["end"], at: 1 };
      // `force` after `end`, and nowhere else — it is the only act that refuses
      // anything.
      const said = (parts[1] ?? "").toLowerCase();
      if (parts.length > 2 && (said === "end" || said === "")) return { pool: ["force"], at: 2 };
      return { pool: ["end", "reset", ...players], at: 1 };
    },
  }),
  stone: spec({
    name: "stone",
    when: PLAYING,
    aliases: ["unstone"],
    usage: "stone [player]",
    summary: "turn to stone for three turns (20.1) — `unstone` lifts it early",
    // Likewise: 20.1 says what turns a Postać to stone, and it is never a
    // player deciding to be.
    needs: "testmode",
    group: "override",
    /**
     * Two words, one act and its undo — the shape `ready`/`unready` already
     * has. The lift is a word rather than a flag on the same one because that
     * is what a person types when they mean it: `stone Ola off` reads as an
     * argument to `stone` and `unstone Ola` reads as the opposite of `stone
     * Ola`, which it is.
     */
    parse: (tail, { word }) => ({ ok: { kind: "stone", who: tail || null, stone: word === "stone" } }),
    complete: people,
  }),
  effect: spec({
    name: "effect",
    aliases: [],
    usage: "effect fog|frozen|barred|nolimit [player]",
    summary: "a Mgła's cap, a stolen turn, 11.11's year off the Most — or 2.6 off",
    needs: "testmode",
    group: "override",
    parse: (tail) => {
      const [said, ...who] = tail.split(/\s+/).filter(Boolean);
      const effect = EFFECTS[(said ?? "").toLowerCase()];
      if (!effect) return { error: `Which effect — ${Object.keys(EFFECTS).join(", ")}?` };
      return { ok: { kind: "effect", effect, who: who.join(" ") || null } };
    },
    complete: (parts, { players }) =>
      parts.length === 2 ? { pool: Object.keys(EFFECTS), at: 1 } : { pool: [...players], at: 2 },
  }),
  deal: spec({
    /**
     * One verb for every Karta in the box, because `draw` is already one.
     *
     * It replaced `give` and `summon`, which between them covered ninety of the
     * hundred and sixty-five and left the rest reachable only by drawing until
     * one came up. Those two were named after their *destinations* — a hand, a
     * fight — which is why there had to be two, and why neither could take a
     * Spotkanie: nobody holds one and nobody fights one.
     *
     * `deal` is named after the act instead. The table deals and the player
     * draws, so the referee's word is the one that overrules: `deal` is to
     * `draw` what `teleport` is to `move` — the same end state, with the choice
     * taken off the dice.
     *
     * Nothing comes off a pile. Every Karta it conjures is `granted`, so the
     * deck keeps its own copy and the Wyposażenie stock is untouched — `stack`
     * is the verb for when you want the real card off the real pile.
     */
    name: "deal",
    aliases: [],
    usage: "deal <card>[, <card>…]",
    summary: "any Karta happens to you, whatever kind it is — bare, it lists them",
    needs: "testmode",
    group: "override",
    parse: (tail) => {
      // Bare, it is a question rather than a mistake: "what can I ask for?" is
      // the thing somebody dressing a test table wants, and Tab's grid cannot
      // carry the headings that answer it.
      if (tail === "") return { ok: { kind: "deal", cardIds: [] } };
      /**
       * Several Karty, separated by commas.
       *
       * A comma because no card in the box has one in its name and every card
       * has spaces in it, so nothing else can tell TOPÓR ŚWIATŁA I CIEMNOŚCI
       * from two cards. It is also what you would write on paper listing what
       * came up.
       *
       * The list is the point rather than a convenience: 13.4 settles how many
       * Karty an Obszar is worth at the moment you arrive and `drawAll` deals
       * them in one act, so a verb that stands in for a draw and could only
       * ever produce one card could not reproduce the thing the game actually
       * does. The order typed is the order they arrive in, which is all 15.2
       * needs — `resolutionOrder` does the rest.
       *
       * A trailing comma is not an error. `deal SMOK,` is a line halfway
       * through being typed, and refusing it teaches nothing the next keystroke
       * would not have fixed.
       */
      const said = tail.split(",").map((one) => one.trim()).filter(Boolean);
      const cardIds: string[] = [];
      for (const one of said) {
        // Every Karta in the box, because every Karta can be drawn. The two
        // verbs this replaced each matched a slice of the deck, which is why
        // asking for the wrong slice answered "No card called `SMOK`" about a
        // card that is printed twice.
        const hit = findByName(READABLE, (card) => card.name, one);
        if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
        // Named rather than "one of them": with several on the line, "No card
        // called ``" would leave you counting commas to find which.
        if ("missing" in hit) return { error: `No card called \`${one}\`.` };
        cardIds.push(hit.found.id);
      }
      return { ok: { kind: "deal", cardIds } };
    },
    complete: (parts) => shelved(DEALABLE, afterComma(parts)),
  }),
  stack: spec({
    // The one test shortcut that does not step round the game. `give`, `place`
    // and `summon` each put a card in play by fiat; this puts it back on the
    // deck so the ordinary `draw` finds it, which is the only way to watch a
    // Karta do what it actually does — 15.2's ordering, its own disposition,
    // and the journal line that says where it went.
    name: "stack",
    aliases: [],
    usage: "stack <card>",
    summary: "put a Karta on top of its pile, so the next draw is that one",
    needs: "testmode",
    group: "override",
    parse: (tail, { usage }) => {
      /**
       * A number is a position in the draw order, not a name.
       *
       * No card in the box is called a number, so the two forms cannot
       * collide. A bare number means the Karty Zdarzeń: they are *the* deck,
       * and the Zaklęcia are always called by their own name.
       */
      const spot = /^(?:(events|spells|zdarzenia|zaklecia|zaklęcia)\s+)?(\d+)$/i.exec(tail.trim());
      if (spot) {
        const said = (spot[1] ?? "events").toLowerCase();
        const pile = said.startsWith("s") || said.startsWith("zak") ? "spells" : "events";
        return { ok: { kind: "stack", cardId: null, pile, at: Number(spot[2]) } };
      }
      return named(
        STACKABLE,
        (card) => card.name,
        tail,
        "card",
        (card) => ({ kind: "stack" as const, cardId: card.id, pile: null, at: null }),
        usage,
      );
    },
    complete: () => shelved(STACK_KINDS, 1),
  }),
  pile: spec({
    // The half `stack` needs to be usable by position: you cannot ask for the
    // tenth card without seeing the list. Also the only way to answer "is the
    // Smok still in there, or has somebody had him?" — which the used pile
    // answers and nothing else does.
    name: "pile",
    aliases: ["deck"],
    usage: "pile [events|spells]",
    summary: "look through a pile, top first — bare, both of them in brief",
    needs: "testmode",
    group: "override",
    parse: (tail) => {
      const said = tail.trim().toLowerCase();
      if (said === "") return { ok: { kind: "pile", pile: null } };
      if (said.startsWith("e") || said.startsWith("zd")) return { ok: { kind: "pile", pile: "events" } };
      if (said.startsWith("s") || said.startsWith("zak")) return { ok: { kind: "pile", pile: "spells" } };
      return { error: "Which pile — `events` or `spells`?" };
    },
    complete: () => ({ pool: ["events", "spells"], at: 1 }),
  }),
  clear: spec({
    // `place`'s inverse, and the reason it exists is that nothing else undoes
    // it: a Karta leaves an Obszar by being taken, beaten or walked onto, and
    // a test table that dressed a field had no way to undress it.
    name: "clear",
    aliases: [],
    usage: "clear [gold [N]|card|kinds][, …] [at field]",
    summary: "take Złoto, Karty or whole kinds off an Obszar — bare, the lot; `at` names another",
    needs: "testmode",
    group: "override",
    parse: (tail) => {
      if (tail === "") return { ok: { kind: "clear", fieldId: null, cardIds: [], gold: null, classes: [] } };
      /**
       * `place`'s grammar backwards, and the same `at` between the two names.
       *
       * `clear` takes the lot off the Obszar you stand on, `clear Karczma` the
       * lot off a named one, `clear TARGOWISKO` one Karta off yours, and
       * `clear TARGOWISKO at Karczma` one off a named one. A bare word is tried
       * as an Obszar first and as a Karta second, which is unambiguous in
       * practice and settled by `at` when it is not.
       */
      const cut = tail.search(AT);
      const said = cut === -1 ? tail : tail.slice(0, cut);
      const place = cut === -1 ? "" : tail.slice(cut).replace(AT, "");
      let fieldId: FieldId | null = null;
      if (place !== "") {
        const where = fieldNamed(place);
        if ("error" in where) return where;
        fieldId = where.fieldId;
      }
      const words = said.split(",").map((one) => one.trim()).filter(Boolean);
      /**
       * A single bare word is still tried as an Obszar first.
       *
       * `clear Karczma` means the square, and has since before any of this.
       * Only for one word: two Obszary cannot both be swept — `at` takes one —
       * so in a list the same word can only be a Karta or a kind, and trying
       * the board there would let a place name shadow one.
       */
      if (cut === -1 && words.length === 1 && !isCategory(words[0])) {
        const where = findByName(PLACES, (field) => field.name, said);
        if ("found" in where) {
          return { ok: { kind: "clear", fieldId: where.found.id, cardIds: [], gold: null, classes: [] } };
        }
      }
      /**
       * One list, three kinds of thing in it: `clear MIECZ, strangers, gold`.
       *
       * `deal`'s grammar, and the same reason — one act at a table is one line
       * here. What is new against `deal` is that the words are not all of one
       * sort, and they do not have to be: a Karta by name, a whole kind, and
       * the money are three ways of pointing at what is lying on a square, and
       * „take the Miecz, the Nieznajomych and the money" is one wish. Each is
       * tried as a kind first — the words are English and nothing in the box
       * is called `places` — then as a Karta.
       *
       * A named Karta takes **one copy**, as it always has, and a kind takes
       * every one of its class; `clear MIECZ, MIECZ` therefore takes two,
       * which is the only way to say it.
       *
       * All or nothing. A list with one word the console does not know is a
       * typo rather than a smaller sweep, and half-obeying it would take Karty
       * off a square the typist meant to keep — so a miss is an error naming
       * the word, the way `deal` names the card it could not find.
       */
      const classes: CardClass[] = [];
      const cardIds: string[] = [];
      let money: number | "all" | null = null;
      for (const one of words) {
        // The money, with or without an amount, and in the list like
        // everything else: `clear gold`, `clear gold all`, `clear MIECZ, gold 3`.
        const asked = goldAsked(one);
        if (asked !== null) {
          if (asked === "" || asked.toLowerCase() === "all") {
            money = "all";
            continue;
          }
          const amount = coins(asked, "clear");
          if ("error" in amount) return amount;
          money = amount.gold;
          continue;
        }
        const kind = CATEGORIES.get(one.toLowerCase());
        if (kind) {
          for (const cardClass of kind) if (!classes.includes(cardClass)) classes.push(cardClass);
          continue;
        }
        const hit = findByName(CARDS, (card) => card.name, one);
        if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
        if ("missing" in hit) {
          return words.length === 1
            ? { error: `No card called \`${one}\`.` }
            : { error: `No card or kind called \`${one}\`.` };
        }
        cardIds.push(hit.found.id);
      }
      return {
        ok:
          money !== null
            ? { kind: "clear", fieldId, cardIds, gold: money, classes }
            : { kind: "clear", fieldId, cardIds, gold: null, classes },
      };
    },
    complete: (parts) => placeOrClear("clear", parts),
  }),
  place: spec({
    name: "place",
    // `drop` was an alias here and is not any more: it is the lawful "put a
    // Przedmiot down", and a word cannot mean both that and a card conjured
    // onto a field.
    aliases: ["put"],
    usage: "place [gold N|card] [at field]",
    summary: "leave loose Złoto or a card on an Obszar, the one you stand on unless named — bare, the catalogue",
    needs: "testmode",
    group: "override",
    /**
     * A card left lying on a field, rather than put in a hand.
     *
     * Two names in one line, which nothing else here takes, so they are
     * separated by the word that reads as English and appears in no card and
     * no Obszar: `place MIECZ at Karczma`. Without it, the Obszar is the one
     * you are standing on — which is what a tester wants most of the time, and
     * the only reason the field is optional.
     */
    parse: (tail, { usage }) => {
      const cut = tail.search(AT);
      const cardPart = cut === -1 ? tail : tail.slice(0, cut);
      const fieldPart = cut === -1 ? "" : tail.slice(cut).replace(AT, "");
      let fieldId: FieldId | null = null;
      if (fieldPart !== "") {
        const where = fieldNamed(fieldPart);
        if ("error" in where) return where;
        fieldId = where.fieldId;
      }
      // Money before Karty, because there is no Karta it could be: nothing in
      // the box is called „gold" or „złoto" on its own, and the two that come
      // close — „1 SZTUKA ZŁOTA", „2 SZTUKI ZŁOTA" — start with a numeral.
      const asked = goldAsked(cardPart);
      if (asked !== null) {
        if (asked === "") return missing(usage, "How much gold?");
        const amount = coins(asked, "place");
        if ("error" in amount) return amount;
        return { ok: { kind: "place", cardId: null, gold: amount.gold, fieldId } };
      }
      // Bare, it is a question rather than a mistake — the same reading bare
      // `deal` has, and the same catalogue behind it.
      if (cardPart.trim() === "") return { ok: { kind: "place", cardId: null, gold: null, fieldId } };
      return named(
        CARDS,
        (c) => c.name,
        cardPart,
        "card",
        (c) => ({ kind: "place" as const, cardId: c.id, gold: null, fieldId }),
        usage,
      );
    },
    complete: (parts) => placeOrClear("place", parts),
  }),
  teleport: spec({
    // Was `go`, with `move` as an alias. Both words belong to the lawful walk
    // — you roll, then you move — and this is the one that puts a figure
    // anywhere at all, which is a different act and now says so.
    name: "teleport",
    aliases: [],
    usage: "teleport <field>",
    summary: "stand on any Obszar, without a roll and without walking there",
    needs: "testmode",
    group: "override",
    parse: (tail, { usage }) =>
      named(PLACES, (field) => field.name, tail, "Obszar", (field) => ({ kind: "teleport" as const, fieldId: field.id }), usage),
    complete: board,
  }),
  settle: spec({
    name: "settle",
    aliases: [],
    usage: "settle won|lost|draw",
    summary: "settle the fight you are in — won, lost or drawn",
    needs: "testmode",
    group: "override",
    // Spelled out, because `win` alone is two different things: the fight in
    // front of you, and the game.
    parse: (tail, { usage }) => {
      const said = tail.toLowerCase();
      const outcome = OUTCOMES[said];
      if (!outcome) return missing(usage, `Won, lost or drawn — \`${said || "?"}\`?`);
      return { ok: { kind: "settle", outcome } };
    },
    complete: () => ({ pool: Object.keys(OUTCOMES), at: 1 }),
  }),
  endgame: spec({
    name: "endgame",
    aliases: [],
    usage: "endgame won|lost",
    summary: "end the game on the Bestia — losing to it costs 2 Życia (14.7)",
    needs: "testmode",
    group: "override",
    parse: (tail, { usage }) => {
      const said = tail.toLowerCase();
      if (said !== "won" && said !== "lost") return missing(usage, `Won or lost — \`${said || "?"}\`?`);
      return { ok: { kind: "endgame", won: said === "won" } };
    },
    complete: () => ({ pool: ["won", "lost"], at: 1 }),
  }),
  spoils: spec({
    // Only a duel offers it, and only to the winner — there is nothing to take
    // off a Karta. Grouped with fighting because that is where it happens.
    name: "spoils",
    aliases: [],
    when: ["fight"],
    usage: "spoils [gold|card]",
    summary: "settle a won duel: the Życie, their Sztuka Złota, or a Przedmiot you name (17.9)",
    needs: "play",
    group: "fight",
    parse: (tail) => {
      const said = tail.trim();
      if (said === "") return { ok: { kind: "spoils", take: "zycie", card: null } };
      /**
       * `gold`, because the vocabulary is the engine's and the engine is
       * English. The two Polish spellings still answer — nobody's fingers
       * should have to relearn a word — but the printed line says the one that
       * belongs to the app rather than to the box.
       */
      if (GOLD_WORDS.has(said.toLowerCase())) return { ok: { kind: "spoils", take: "zloto", card: null } };
      // Anything else is a Przedmiot by name, matched the way every card name is.
      return { ok: { kind: "spoils", take: "zycie", card: said } };
    },
    complete: () => shelved([GOLD_OFFERED, ...PLACEABLE], 1),
  }),
  endcast: spec({
    // The other end of the pause a cast opens (9.6): a Zaklęcie waits while
    // anybody could answer it, and this is the table saying nobody will. It
    // also happens on its own when the window closes, so this is the shortcut
    // rather than the only way.
    name: "endcast",
    aliases: [],
    when: PLAYING,
    usage: "endcast",
    summary: "let the Zaklęcie in the air take effect now (9.6)",
    needs: "play",
    group: "carrying",
    parse: () => ({ ok: { kind: "endcast" } }),
  }),
  endfight: spec({
    name: "endfight",
    aliases: [],
    usage: "endfight",
    summary: "drop the fight without settling it",
    needs: "testmode",
    group: "override",
    parse: () => ({ ok: { kind: "endfight" } }),
  }),
  spell: spec({
    name: "spell",
    when: PLAYING,
    aliases: [],
    usage: "spell [player] [wand]",
    summary: "draw a Zaklęcie (9.5) — `wand` is the Różdżka refilling a hand",
    needs: "play",
    group: "carrying",
    parse: (tail) => {
      // `wand` last and bare, the way `force` and `hard` are.
      const { on: wand, rest } = trailing(tail.split(/\s+/).filter(Boolean), "wand");
      return { ok: { kind: "spell", who: rest.join(" ") || null, wand } };
    },
    complete: people,
  }),
};

/**
 * The list `help` prints, in the order the table is written — which is the
 * order somebody meets the verbs, and the order the tests type them in.
 */
export const COMMANDS: CommandSpec[] = Object.values(SPECS);

/**
 * The entry for a word somebody typed: a verb's own name or any of its aliases.
 *
 * Built once. `VERBS` in the parser is the same map's keys, so a word that
 * parses is a word this finds and the other way round.
 */
export const BY_WORD: ReadonlyMap<string, Spec<Command["kind"]>> = new Map(
  (Object.values(SPECS) as Spec<Command["kind"]>[]).flatMap((one) =>
    [one.name, ...one.aliases].map((word) => [word, one] as const),
  ),
);

/** The entry for a kind, which is where a capability is looked up once a line has parsed. */
export function specOf<K extends Command["kind"]>(kind: K): Spec<K> {
  return SPECS[kind];
}

export function needsOf(command: Command): Capability {
  /**
   * `turn` is the game; two of the three things you can do to one are not.
   *
   * Handing it on is 10.1 and everybody's. Forcing it past 5.6 and 14.7,
   * starting it over, and walking play round to a named seat are the console
   * overruling the rules — and what needs test mode is the *act*, not the
   * verb, so this answer cannot be read off `NEEDS`.
   */
  if (command.kind === "turn") {
    return command.act === "end" && !command.force ? "play" : "testmode";
  }
  return SPECS[command.kind].needs;
}

/**
 * Whether this line may run here.
 *
 * The one function both surfaces ask, which is the whole point of it. The
 * browser console opens only in test mode and so has always been allowed
 * everything; a terminal is not always in test mode, and the two must not end
 * up with different ideas about which words break a rule. So the engine owns
 * the answer and neither caller gets a vote.
 *
 * Parsing is unaffected: a locked command still parses, and still reaches this,
 * so the refusal can say what it was rather than "no such command". A verb you
 * cannot discover is a verb that does not exist.
 */
/**
 * The commands worth offering right now.
 *
 * Used by Tab and by nothing that decides anything. `help` deliberately does
 * *not* use it: a command you cannot discover is a command that does not
 * exist, and the list is where you go to find a word — Tab is where you go to
 * finish one you already know will work.
 */
export function availableIn(at: { stage?: Stage; testmode?: boolean }): CommandSpec[] {
  /**
   * No game open is not the same as a poczekalnia, and treating it as one is
   * what put `ready`, `start` and `pick` in front of somebody who had not
   * opened a table yet. Nothing that needs a game can be offered when there
   * is not one, whatever else a verb says about itself.
   */
  if (at.stage === "none") return COMMANDS.filter((spec) => spec.offTable === true);

  return COMMANDS.filter((spec) => {
    if (spec.needs === "testmode" && at.testmode === false) return false;
    if (at.stage === undefined || spec.when === undefined) return true;
    return spec.when.includes(at.stage);
  });
}

/**
 * The lines that can be answered with no game open.
 *
 * Keyed on the kind, like `NEEDS` above and for the same reason: the spec table
 * is keyed on the word you type and these two questions are about what the word
 * parsed to. `CommandSpec.offTable` is the same fact for `help` to print, and a
 * test types every usage line to check the two agree.
 */
const OFF_TABLE = new Set<Command["kind"]>(["help", "card", "rule"]);

export function worksOffTable(command: Command): boolean {
  return OFF_TABLE.has(command.kind);
}

export function permits(
  command: Command,
  at: { testmode: boolean },
): { ok: true } | { ok: false; why: string } {
  if (needsOf(command) === "play" || at.testmode) return { ok: true };
  // The act, where the act is what is locked: „`turn` overrules the rules" is
  // a lie about a verb everybody has, and the reader would go looking for the
  // wrong thing to turn on.
  const said =
    command.kind === "turn"
      ? `turn ${command.act === "reach" ? command.who : command.act === "reset" ? "reset" : "force"}`
      : command.kind;
  return {
    ok: false,
    why: `\`${said}\` overrules the rules — turn testmode on first.`,
  };
}

/**
 * The list `help` prints, one command to a line.
 *
 * Every word that can be typed starts its own line, `place|put|drop`, rather
 * than trailing the summary as "(also put, drop)". Somebody reading this is
 * looking for the word to type, and the alternatives were both the furthest
 * thing from where the eye goes and the reason the lines were long enough to
 * wrap — which on a narrow window is what made a list of twelve look like a
 * list of seven.
 */
export function helpLines(
  about: string | null = null,
  at: { testmode?: boolean; stage?: Stage; all?: boolean } = { testmode: true },
  /**
   * Commands a surface has of its own, listed among the rest.
   *
   * `mm` has four the browser could never carry out — `table`, `test`, `quit`
   * — and they were a footer in a different shape underneath the real list.
   * Tab treated them as peers, `help` did not, and the difference read as Tab
   * offering something `help` had never heard of. They are the same kind of
   * thing to somebody typing, so they are in the same list.
   */
  extra: readonly CommandSpec[] = [],
): string[] {
  const words = (spec: CommandSpec) => [spec.name, ...spec.aliases].join("|");
  /** The usage line without its verb, which the words have just replaced. */
  const args = (spec: CommandSpec) => spec.usage.split(/\s+/).slice(1).join(" ");

  /**
   * One command, asked about by name or by any of its other names.
   *
   * Two lines instead of a padded row, because there is no column to line up
   * with any more and the summaries are the length they are: the shape first,
   * then what it does, then the other words for it where there are any. The
   * list is for finding a command; this is for reading one.
   */
  if (about !== null) {
    const spec = [...COMMANDS, ...extra].find(
      (one) => one.name === about || one.aliases.includes(about),
    );
    if (!spec) return [`No command \`${about}\`. Type \`help\` for the list.`];
    return [
      spec.usage,
      spec.summary,
      ...(spec.aliases.length > 0 ? [`also: ${spec.aliases.join(", ")}`] : []),
      ...(spec.needs === "testmode" && !at.testmode
        ? ["locked — this one overrules the rules; turn testmode on first"]
        : []),
    ];
  }

  /**
   * What would work right now, and a count of what would not.
   *
   * The list used to be all thirty-odd commands whatever was going on, on the
   * argument that a command you cannot discover is a command that does not
   * exist. That argument is right about *discovery* and wrong about a list: a
   * poczekalnia offering `winfight`, `escape` and `teleport` is not teaching
   * anybody the vocabulary, it is burying the six words that work.
   *
   * So the answer keeps both. What applies is listed; what does not is counted,
   * named as a keystroke away, and still explained in full by `help <command>`.
   * Nothing becomes unfindable — it just stops being in the way.
   */
  const shown = [...(at.all === true ? COMMANDS : availableIn(at)), ...extra];

  /**
   * The column is measured across the whole list, not per heading.
   *
   * Ragged columns under headings read as several small tables rather than one
   * grouped one, and the eye stops carrying down the page. One width costs a
   * few spaces in the short groups and keeps the summaries in a line.
   */
  const row = (spec: CommandSpec) => `${words(spec)} ${args(spec)}`.trimEnd();
  const widest = Math.max(...shown.map((spec) => row(spec).length), 0);
  const listed = (spec: CommandSpec) => {
    const idle = at.all === true && !availableIn(at).includes(spec) && !extra.includes(spec);
    return `${idle ? "\u00b7" : " "}${row(spec).padEnd(widest)}  ${spec.summary}`;
  };

  /**
   * A heading is only worth its two lines when it has something under it.
   *
   * In a poczekalnia most of these are empty — there is no Zaklęcie to cast and
   * nothing to fight — and printing "Fighting" over nothing would be the same
   * burying this was written to stop, one level up.
   */
  const lines: string[] = [];
  for (const group of GROUPS) {
    const mine = shown.filter((spec) => spec.group === group.id);
    if (mine.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(`${group.title}`);
    for (const spec of mine) lines.push(listed(spec));
  }

  const hidden = COMMANDS.length + extra.length - shown.length;
  return hidden === 0
    ? lines
    : [...lines, "", ` ${`(${hidden} more)`.padEnd(widest)}  \`help all\` — every command, whenever it applies`];
}

/**
 * Commands the console asks about before carrying out.
 *
 * The rule is: **confirm what no other command can undo.** A question you are
 * asked once in a session is a question you read; one you are asked every third
 * line is one you learn to dismiss, and a console full of those is a console
 * that has stopped protecting anything.
 *
 * `kick` is here for a different reason from the rest. Nothing it does is
 * unrecoverable — the person opens the link again — but it is the only one that
 * is rude to somebody *else*, and being thrown off a table by a typo is worth a
 * second of somebody's time. `leave` does the same thing to nobody but you, and
 * is not here.
 *
 * `unseat` takes nothing away at all; the Postać stays exactly where it was
 * standing. `remove` and `kill` scatter a hand of Karty that no command can
 * gather back, whatever else can be undone afterwards.
 */
export function needsConfirming(command: Command): boolean {
  return (
    command.kind === "kick" || command.kind === "kill" || command.kind === "remove"
  );
}

/**
 * The question a destructive line is answered with, in the words of what it
 * would do.
 *
 * "Are you sure?" is a question nobody reads, because it is the same question
 * every time and carries none of the answer. These name the thing that goes, so
 * the second of somebody's time it costs buys them something: which player,
 * which seat, and whether it can be had back.
 *
 * Built from the parsed command rather than from the table, so it stays in the
 * pure half. What it cannot say is which Postać is sitting in seat 3 — that is
 * the reply's job, after the fact.
 */
export function confirmationFor(command: Command): string | null {
  if (!needsConfirming(command)) return null;
  const said = (what: string) => `${what} Type \`yes\` to go ahead, anything else to drop it.`;

  if (command.kind === "kick") return said(`${command.who} goes from the table.`);
  if (command.kind === "kill") {
    // "Your Postać" rather than "You" for the unnamed case: the subject has to
    // agree with `drops`, and naming the figure rather than the person is what
    // the other two questions do anyway.
    const dying = command.who ?? "Your Postać";
    return said(`${dying} drops to 0 Życia — the hand goes with it (4.4).`);
  }
  if (command.kind !== "remove") return null;
  const which =
    command.seat !== null ? `The Postać in seat ${command.seat}` : (command.characterId ?? "It");
  return said(
    command.hard
      ? `${which} leaves the game for good — nobody picks it again.`
      : `${which} leaves the game; its Karty go to the used piles.`,
  );
}

