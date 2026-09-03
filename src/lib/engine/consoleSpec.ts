/** Which words the console knows, what each is for, and who is allowed to type it. */

import { type FieldId } from "./board";
import type { CardClass } from "@/data/types";
import type { TurnPhase } from "./turn";

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

export const COMMANDS: CommandSpec[] = [
  {
    name: "help",
    offTable: true,
    aliases: ["?"],
    usage: "help [command]",
    summary: "list these commands, or explain one of them",
    needs: "play",
    group: "reading",
  },
  {
    name: "rule",
    offTable: true,
    aliases: [],
    usage: "rule [5.3|5]",
    summary: "read a rule out of the Instrukcji, or list a chapter",
    needs: "play",
    group: "reading",
  },
  {
    name: "gold",
    aliases: ["sword", "magic", "life", "tury"],
    usage: "gold +5|=12 [player] [force]",
    summary: "move a parameter, or `=` it to a number — `force` passes 1.3's floor; `tury` owes turns",
    needs: "testmode",
    group: "override",
  },
  /* --------------------------------------------------------------------------
   * Playing. The game as printed: roll, walk it out, meet what is there, pass.
   * ----------------------------------------------------------------------- */
  {
    name: "ready",
    when: ["lobby"],
    aliases: ["unready"],
    usage: "ready [player]",
    summary: "say you have chosen — `unready` takes it back",
    needs: "play",
    group: "table",
  },
  {
    name: "start",
    when: ["lobby"],
    aliases: [],
    usage: "start",
    summary: "begin the game; everyone who has a Postać must be ready",
    needs: "play",
    group: "table",
  },
  {
    name: "roll",
    when: ["roll"],
    aliases: [],
    usage: "roll",
    summary: "throw the die for your move (10.2)",
    needs: "play",
    group: "turn",
  },
  {
    name: "move",
    when: ["move"],
    aliases: ["walk"],
    usage: "move <field>",
    summary: "walk the roll out and stand there (10.2) — `look` lists where it reaches",
    needs: "play",
    group: "turn",
  },
  {
    name: "draw",
    when: ["field"],
    aliases: [],
    usage: "draw",
    summary: "take what the Obszar you are standing on owes you (13.4)",
    needs: "play",
    group: "turn",
  },
  {
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
  },
  {
    name: "buy",
    aliases: [],
    when: PLAYING,
    usage: "buy <card>",
    summary: "buy from the Obszar you are standing on, at its printed price",
    needs: "play",
    group: "trade",
  },
  {
    name: "sell",
    aliases: [],
    when: PLAYING,
    usage: "sell <card>",
    summary: "sell one back to the Lichwiarz in the Gród",
    needs: "play",
    group: "trade",
  },
  {
    name: "heal",
    aliases: [],
    when: PLAYING,
    usage: "heal [n]",
    summary: "take back a point of Życie, or buy several where they are sold (4.2)",
    needs: "play",
    group: "trade",
  },
  {
    name: "cast",
    aliases: [],
    when: PLAYING,
    usage: "cast <spell> [at player] [to field]",
    summary: "cast a Zaklęcie you are holding (9.6)",
    needs: "play",
    group: "carrying",
  },
  {
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
  },
  {
    // Naming nothing hands in everything, which is what a player cashing out is
    // usually after. Naming cards hands in those — 1.4 lets you pick, and a
    // Smok held back is six points not burnt.
    name: "trade",
    aliases: [],
    when: PLAYING,
    usage: "trade [n|cards]",
    summary: "cash beaten Wrogowie in at 7 points a Miecz (1.4) — how many Miecze you want, the Karty you name, or all of them",
    needs: "play",
    group: "trade",
  },
  {
    name: "beast",
    aliases: [],
    when: PLAYING,
    usage: "beast",
    summary: "fight the Bestia at the Zamek — winning ends the game (14.7, 22)",
    needs: "play",
    group: "fight",
  },
  {
    name: "bridge",
    aliases: ["most"],
    when: ["move", "field"],
    usage: "bridge",
    summary: "try to step onto the Kamienny Most from an entrance (11.10)",
    needs: "play",
    group: "board",
  },
  {
    name: "cross",
    aliases: [],
    when: PLAYING,
    usage: "cross [field]",
    summary: "cross between the Kręgi — the Trzęsawiska or the Lodowy Las (11.1-11.8)",
    needs: "play",
    group: "board",
  },
  {
    name: "guardian",
    aliases: [],
    when: PLAYING,
    usage: "guardian",
    summary: "square up to whatever is standing in the way (11.9-11.11)",
    needs: "play",
    group: "fight",
  },
  {
    name: "ferry",
    aliases: [],
    when: PLAYING,
    usage: "ferry [pay]",
    summary: "the Przeprawa — `pay` a Sztuka Złota, or be sent back",
    needs: "play",
    group: "board",
  },
  {
    name: "take",
    aliases: ["get"],
    when: ["field", "fight"],
    usage: "take <gold [N]|card>",
    summary: "pick up the Złoto lying on your Obszar — all of it unless a number says — or a Karta you drew or one lying there (12.1, 13.4)",
    needs: "play",
    group: "carrying",
  },
  {
    name: "drop",
    when: PLAYING,
    aliases: [],
    usage: "drop <card>",
    summary: "put one down on the Obszar you are standing on (12.1)",
    needs: "play",
    group: "carrying",
  },
  {
    name: "equip",
    when: PLAYING,
    aliases: ["wear"],
    usage: "equip <card> [slot]",
    summary: "put a Przedmiot on — the place is worked out unless it fits two",
    needs: "play",
    group: "carrying",
  },
  {
    name: "use",
    when: PLAYING,
    aliases: [],
    usage: "use <card>",
    summary: "spend a Karta that is spent by using it",
    needs: "play",
    group: "carrying",
  },
  {
    name: "fight",
    aliases: [],
    when: ["field", "fight"],
    usage: "fight [foe]",
    summary: "square up to a Wróg on your Obszar — named when more than one is there (16.2)",
    needs: "play",
    group: "fight",
  },
  {
    name: "escape",
    aliases: ["flee"],
    when: ["field", "fight"],
    usage: "escape",
    summary: "try to slip away instead of fighting (19.1)",
    needs: "play",
    group: "fight",
  },
  {
    name: "attack",
    aliases: [],
    when: ["field"],
    usage: "attack <player>",
    summary: "pick a fight with a Postać standing on your Obszar (13.3, 17.6)",
    needs: "play",
    group: "fight",
  },
  {
    // The Władca's word is "wypełnić", but what the player does at the counter
    // is collect — the errand was finished somewhere else, often turns ago.
    name: "claim",
    aliases: [],
    when: ["field", "move", "roll"],
    usage: "claim",
    summary: "hand the Władca's misja in and take the Tarcza (Twierdza)",
    needs: "play",
    group: "board",
  },
  {
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
  },
  {
    // "gdy sobie tego zażyczysz" — the card's own word for it is asking, and a
    // player with a Krzyżowiec is asking a person rather than reading a scroll.
    name: "ask",
    aliases: [],
    when: ["field", "move", "roll", "fight"],
    usage: "ask",
    summary: "have a Przyjaciel speak the Zaklęcie he carries (Krzyżowiec, Gnom)",
    needs: "play",
    group: "friends",
  },
  {
    // No argument: only one card in the box sells anything, and naming him
    // would be asking the player to tell the app what it already knows.
    name: "pay",
    aliases: [],
    when: ["field", "move", "roll"],
    usage: "pay",
    summary: "buy a turn of a Przyjaciel's help with a Sztuka Złota (Najemnik)",
    needs: "play",
    group: "friends",
  },
  {
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
  },
  {
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
  },
  {
    name: "look",
    aliases: ["l"],
    usage: "look",
    summary: "the Obszar you are on, what is on it, and what the turn is waiting for",
    needs: "play",
    group: "reading",
  },
  {
    name: "me",
    // `i` is `inventory`, the most-typed word in interactive fiction. What it
    // shows here is a Karta Postaci, which is that and the numbers beside it.
    aliases: ["sheet", "i"],
    usage: "me [player]",
    summary: "a Karta Postaci as it stands: points, Życie, Złoto, Natura and what is carried",
    needs: "play",
    group: "reading",
  },
  {
    name: "who",
    aliases: [],
    usage: "who",
    summary: "everyone at the table, and which seat they drive",
    needs: "play",
    group: "reading",
  },
  {
    name: "seat",
    aliases: [],
    usage: "seat <player> <seat>",
    summary: "put somebody in a seat; refuses one that is taken",
    needs: "play",
    group: "table",
  },
  {
    name: "unseat",
    aliases: [],
    usage: "unseat [player]",
    summary: "out of the seat, still at the table — the Postać stays put",
    needs: "play",
    group: "table",
  },
  {
    name: "kick",
    aliases: [],
    usage: "kick <player>",
    summary: "put somebody out of the table",
    needs: "play",
    group: "table",
  },
  {
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
  },
  {
    name: "rename",
    aliases: [],
    usage: "rename <player> as <name>",
    summary: "give somebody a name",
    needs: "play",
    group: "table",
  },
  {
    name: "host",
    aliases: [],
    usage: "host <player>",
    summary: "hand over the host role",
    needs: "play",
    group: "table",
  },
  {
    name: "pick",
    aliases: [],
    usage: "pick [character] [seat]",
    summary: "a Postać into a seat — LOSOWA or nothing takes the surprise, yours unless numbered (4.4)",
    needs: "play",
    group: "table",
  },
  {
    name: "remove",
    aliases: ["erase"],
    usage: "remove <character> [hard]",
    summary: "a Postać out of the game, its Karty to the used piles — `hard` bars it for good",
    needs: "testmode",
    group: "override",
  },
  {
    name: "revive",
    aliases: [],
    usage: "revive <character>",
    summary: "back to life where it fell, with its own points and no Przedmioty",
    needs: "testmode",
    group: "override",
  },
  {
    name: "kill",
    aliases: [],
    usage: "kill [player]",
    summary: "take a character to 0 Życia (4.4)",
    needs: "testmode",
    group: "override",
  },
  {
    name: "nature",
    when: PLAYING,
    aliases: [],
    usage: "nature good|evil|chaotic [player] [force]",
    summary: "change a Natura (7.2) — leaves no mark of 7.3; `force` ignores one",
    // 7.2 changes a Natura by Karta Zmiany Natury. Typing it changes one with
    // no card, which is the definition this file gives for `testmode`.
    needs: "testmode",
    group: "override",
  },
  {
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
  },
  {
    name: "stone",
    when: PLAYING,
    aliases: ["unstone"],
    usage: "stone [player]",
    summary: "turn to stone for three turns (20.1) — `unstone` lifts it early",
    // Likewise: 20.1 says what turns a Postać to stone, and it is never a
    // player deciding to be.
    needs: "testmode",
    group: "override",
  },
  {
    name: "effect",
    aliases: [],
    usage: "effect fog|frozen|barred|nolimit [player]",
    summary: "a Mgła's cap, a stolen turn, 11.11's year off the Most — or 2.6 off",
    needs: "testmode",
    group: "override",
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    // `place`'s inverse, and the reason it exists is that nothing else undoes
    // it: a Karta leaves an Obszar by being taken, beaten or walked onto, and
    // a test table that dressed a field had no way to undress it.
    name: "clear",
    aliases: [],
    usage: "clear [gold [N]|card|kinds][, …] [at field]",
    summary: "take Złoto, Karty or whole kinds off an Obszar — bare, the lot; `at` names another",
    needs: "testmode",
    group: "override",
  },
  {
    name: "place",
    // `drop` was an alias here and is not any more: it is the lawful "put a
    // Przedmiot down", and a word cannot mean both that and a card conjured
    // onto a field.
    aliases: ["put"],
    usage: "place [gold N|card] [at field]",
    summary: "leave loose Złoto or a card on an Obszar, the one you stand on unless named — bare, the catalogue",
    needs: "testmode",
    group: "override",
  },
  {
    // Was `go`, with `move` as an alias. Both words belong to the lawful walk
    // — you roll, then you move — and this is the one that puts a figure
    // anywhere at all, which is a different act and now says so.
    name: "teleport",
    aliases: [],
    usage: "teleport <field>",
    summary: "stand on any Obszar, without a roll and without walking there",
    needs: "testmode",
    group: "override",
  },
  {
    name: "settle",
    aliases: [],
    usage: "settle won|lost|draw",
    summary: "settle the fight you are in — won, lost or drawn",
    needs: "testmode",
    group: "override",
  },
  {
    name: "endgame",
    aliases: [],
    usage: "endgame won|lost",
    summary: "end the game on the Bestia — losing to it costs 2 Życia (14.7)",
    needs: "testmode",
    group: "override",
  },
  {
    // Only a duel offers it, and only to the winner — there is nothing to take
    // off a Karta. Grouped with fighting because that is where it happens.
    name: "spoils",
    aliases: [],
    when: ["fight"],
    usage: "spoils [gold|card]",
    summary: "settle a won duel: the Życie, their Sztuka Złota, or a Przedmiot you name (17.9)",
    needs: "play",
    group: "fight",
  },
  {
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
  },
  {
    name: "endfight",
    aliases: [],
    usage: "endfight",
    summary: "drop the fight without settling it",
    needs: "testmode",
    group: "override",
  },
  {
    name: "spell",
    when: PLAYING,
    aliases: [],
    usage: "spell [player] [wand]",
    summary: "draw a Zaklęcie (9.5) — `wand` is the Różdżka refilling a hand",
    needs: "play",
    group: "carrying",
  },
];

/**
 * Every word this console answers to, taken from the list `help` prints.
 *
 * The gate below is the reason it exists: a verb that is not on this list is
 * refused before anything looks at it, so the parser cannot quietly know a
 * command that `help` has never heard of and Tab cannot finish. What is left is
 * the opposite mistake — advertising something nothing carries out — and the
 * tests catch that by typing every line `help` prints.
 */

const NEEDS: Record<Command["kind"], Capability> = {
  help: "play",
  rule: "play",
  who: "play",
  seat: "play",
  unseat: "play",
  kick: "play",
  leave: "play",
  rename: "play",
  host: "play",
  pick: "play",

  roll: "play",
  move: "play",
  draw: "play",
  look: "play",
  answer: "play",
  card: "play",
  fight: "play",
  escape: "play",
  attack: "play",
  raid: "play",
  pay: "play",
  ask: "play",
  free: "play",
  claim: "play",
  take: "play",
  putdown: "play",
  equip: "play",
  use: "play",
  beast: "play",
  bridge: "play",
  cross: "play",
  guardian: "play",
  ferry: "play",
  buy: "play",
  sell: "play",
  heal: "play",
  cast: "play",
  trade: "play",
  trophies: "play",
  ready: "play",
  start: "play",
  me: "play",
  stat: "testmode",
  remove: "testmode",
  revive: "testmode",
  kill: "testmode",
  // Not "testmode": `changeNature` is the same function the browser's own
  // control calls, and 7.2 is a rule of the game. What overrules anything is
  // `force`, which is why this is decided in `needsOf` rather than here.
  nature: "testmode",
  // The bare word is 10.1; `needsOf` raises it for the acts that are not.
  turn: "play",
  // Both sides call `turnToStone`. There was never a second act here to
  // separate — 20.1 is a rule, and this is how it is reached.
  stone: "testmode",
  effect: "testmode",
  deal: "testmode",
  place: "testmode",
  teleport: "testmode",
  settle: "testmode",
  endgame: "testmode",
  endfight: "testmode",
  stack: "testmode",
  pile: "testmode",
  clear: "testmode",
  endcast: "play",
  spoils: "play",
  // Both sides call `drawSpell`. 9.5 deals them; this is that.
  spell: "play",
};

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
  return NEEDS[command.kind];
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

