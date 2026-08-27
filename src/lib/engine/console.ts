/** The test console's grammar: turning a typed line into something the store can carry out. */

import characters from "@/data/characters.json";
import events from "@/data/events.json";
import itemCards from "@/data/items.json";
import spells from "@/data/spells.json";
import type { Character, EventCard, Item, Spell } from "@/data/types";
import { FIELDS, type FieldId } from "./board";
import { SLOTS } from "./slots";
import { findByName, fold } from "./search";

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
}

/** What a line needs before it may run. */
export type Capability = "play" | "testmode";

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
export function stageOf(status: string, phase: string | undefined): Stage {
  if (status !== "playing") return "lobby";
  return phase === "roll" || phase === "move" || phase === "field" || phase === "fight"
    ? phase
    : "other";
}

/** Which parameter a stat command moves. The column names, as the store knows them. */
export type StatName = "sword" | "magic" | "life" | "gold";

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
export type EffectName = "fog" | "frozen" | "barred";

export type Command =
  | { kind: "help"; about: string | null }
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
  | { kind: "give"; cardId: string }
  | { kind: "place"; cardId: string; fieldId: FieldId | null }
  | { kind: "teleport"; fieldId: FieldId }
  | { kind: "summon"; cardId: string }
  | { kind: "settle"; outcome: "wygrana" | "przegrana" | "remis" }
  | { kind: "endgame"; won: boolean }
  | { kind: "endfight" }
  | { kind: "endturn" }
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
  /* What you carry. A name, because a holding's id is a uuid nobody can type. */
  | { kind: "take"; name: string }
  | { kind: "putdown"; name: string }
  | { kind: "equip"; name: string; slot: string | null }
  | { kind: "use"; name: string }
  /* The Bestia, the Most, and the two thresholds between the rings. */
  | { kind: "beast" }
  | { kind: "bridge" }
  | { kind: "cross" }
  | { kind: "guardian" }
  | { kind: "ferry"; pay: boolean }
  /* Shops, healers and Zaklęcia. */
  | { kind: "buy"; name: string }
  | { kind: "sell"; name: string }
  | { kind: "heal"; points: number | null }
  | { kind: "cast"; name: string; who: string | null }
  | { kind: "trade" }
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
  | { kind: "turn"; who: string | null }
  | { kind: "stone"; who: string | null }
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
const STATS: Record<string, StatName> = {
  sword: "sword",
  magic: "magic",
  life: "life",
  gold: "gold",
};

export const COMMANDS: CommandSpec[] = [
  {
    name: "help",
    offTable: true,
    aliases: ["?"],
    usage: "help [command]",
    summary: "list these commands, or explain one of them",
    needs: "play",
  },
  {
    name: "gold",
    aliases: ["sword", "magic", "life"],
    usage: "gold +5|=12 [player] [force]",
    summary: "move a parameter, or `=` it to a number — `force` passes 1.3's floor",
    needs: "testmode",
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
  },
  {
    name: "start",
    when: ["lobby"],
    aliases: [],
    usage: "start",
    summary: "begin the game; everyone who has a Postać must be ready",
    needs: "play",
  },
  {
    name: "roll",
    when: ["roll"],
    aliases: [],
    usage: "roll",
    summary: "throw the die for your move (10.2)",
    needs: "play",
  },
  {
    name: "move",
    when: ["move"],
    aliases: ["walk"],
    usage: "move Karczma",
    summary: "walk the roll out and stand there (10.2) — `look` lists where it reaches",
    needs: "play",
  },
  {
    name: "draw",
    when: ["field"],
    aliases: [],
    usage: "draw",
    summary: "take what the Obszar you are standing on owes you (13.4)",
    needs: "play",
  },
  {
    name: "answer",
    when: ["field"],
    // No `a`: the single-letter aliases are interactive fiction's own three —
    // l, i, x — and a letter that saves nothing costs a word somebody else
    // wanted.
    aliases: [],
    usage: "answer [2] [KARTA]",
    summary: "settle what a Karta or an Obszar asked — `look` shows the question",
    needs: "play",
  },
  {
    name: "buy",
    aliases: [],
    when: PLAYING,
    usage: "buy MIECZ",
    summary: "buy from the Obszar you are standing on, at its printed price",
    needs: "play",
  },
  {
    name: "sell",
    aliases: [],
    when: PLAYING,
    usage: "sell MIECZ",
    summary: "sell one back to the Lichwiarz in the Gród",
    needs: "play",
  },
  {
    name: "heal",
    aliases: [],
    when: PLAYING,
    usage: "heal [2]",
    summary: "take back a point of Życie, or buy several where they are sold (4.2)",
    needs: "play",
  },
  {
    name: "cast",
    aliases: [],
    when: PLAYING,
    usage: "cast BŁYSKAWICA [at Ola]",
    summary: "cast a Zaklęcie you are holding (9.6)",
    needs: "play",
  },
  {
    name: "trade",
    aliases: [],
    when: PLAYING,
    usage: "trade",
    summary: "turn beaten Wrogowie into a point, where they are traded (18)",
    needs: "play",
  },
  {
    name: "beast",
    aliases: [],
    when: PLAYING,
    usage: "beast",
    summary: "fight the Bestia at the Zamek — winning ends the game (14.7, 22)",
    needs: "play",
  },
  {
    name: "bridge",
    aliases: ["most"],
    when: ["move", "field"],
    usage: "bridge",
    summary: "try to step onto the Kamienny Most from an entrance (11.10)",
    needs: "play",
  },
  {
    name: "cross",
    aliases: [],
    when: PLAYING,
    usage: "cross",
    summary: "cross between the Kręgi — the Trzęsawiska or the Lodowy Las (11.1-11.8)",
    needs: "play",
  },
  {
    name: "guardian",
    aliases: [],
    when: PLAYING,
    usage: "guardian",
    summary: "square up to whatever is standing in the way (11.9-11.11)",
    needs: "play",
  },
  {
    name: "ferry",
    aliases: [],
    when: PLAYING,
    usage: "ferry [pay]",
    summary: "the Przeprawa — `pay` a Sztuka Złota, or be sent back",
    needs: "play",
  },
  {
    name: "take",
    aliases: ["get"],
    when: ["field", "fight"],
    usage: "take MAGICZNY MIECZ",
    summary: "pick up a Karta you drew or one lying on your Obszar (12.1, 13.4)",
    needs: "play",
  },
  {
    name: "drop",
    when: PLAYING,
    aliases: [],
    usage: "drop MAGICZNY MIECZ",
    summary: "put one down on the Obszar you are standing on (12.1)",
    needs: "play",
  },
  {
    name: "equip",
    when: PLAYING,
    aliases: ["wear"],
    usage: "equip HEŁM [slot]",
    summary: "put a Przedmiot on — the place is worked out unless it fits two",
    needs: "play",
  },
  {
    name: "use",
    when: PLAYING,
    aliases: [],
    usage: "use KRYSZTAŁ LOSU",
    summary: "spend a Karta that is spent by using it",
    needs: "play",
  },
  {
    name: "fight",
    aliases: [],
    when: ["field", "fight"],
    usage: "fight [WILKOŁAK]",
    summary: "square up to a Wróg on your Obszar — named when more than one is there (16.2)",
    needs: "play",
  },
  {
    name: "escape",
    aliases: ["flee"],
    when: ["field", "fight"],
    usage: "escape",
    summary: "try to slip away instead of fighting (19.1)",
    needs: "play",
  },
  {
    name: "attack",
    aliases: [],
    when: ["field"],
    usage: "attack <player>",
    summary: "pick a fight with a Postać standing on your Obszar (13.3, 17.6)",
    needs: "play",
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
  },
  {
    // `card` is the alias `give` used to answer to. It is a better name for
    // reading one than for conjuring one, and reading is the commoner want.
    name: "card",
    offTable: true,
    // `x` is `examine` — Zork's word, and forty-five years of muscle memory
    // for "tell me about that thing".
    aliases: ["read", "x"],
    usage: "card MAGOG",
    summary: "what a Karta says — Postać, Zdarzenie, Przedmiot or Zaklęcie",
    needs: "play",
  },
  {
    name: "look",
    aliases: ["l"],
    usage: "look",
    summary: "the Obszar you are on, what is on it, and what the turn is waiting for",
    needs: "play",
  },
  {
    name: "me",
    // `i` is `inventory`, the most-typed word in interactive fiction. What it
    // shows here is a Karta Postaci, which is that and the numbers beside it.
    aliases: ["sheet", "i"],
    usage: "me [player]",
    summary: "a Karta Postaci as it stands: points, Życie, Złoto, Natura and what is carried",
    needs: "play",
  },
  {
    name: "who",
    aliases: [],
    usage: "who",
    summary: "everyone at the table, and which seat they drive",
    needs: "play",
  },
  {
    name: "seat",
    aliases: [],
    usage: "seat <player> 3",
    summary: "put somebody in a seat; refuses one that is taken",
    needs: "play",
  },
  {
    name: "unseat",
    aliases: [],
    usage: "unseat [player]",
    summary: "out of the seat, still at the table — the Postać stays put",
    needs: "play",
  },
  {
    name: "kick",
    aliases: [],
    usage: "kick <player>",
    summary: "put somebody out of the table",
    needs: "play",
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
  },
  {
    name: "rename",
    aliases: [],
    usage: "rename <player> as Ola",
    summary: "give somebody a name",
    needs: "play",
  },
  {
    name: "host",
    aliases: [],
    usage: "host <player>",
    summary: "hand over the host role",
    needs: "play",
  },
  {
    name: "pick",
    aliases: [],
    usage: "pick [MAGOG] [3]",
    summary: "a Postać into a seat — drawn unless named, yours unless numbered (4.4)",
    needs: "play",
  },
  {
    name: "remove",
    aliases: ["erase"],
    usage: "remove 3|MAGOG [hard]",
    summary: "a Postać out of the game, its Karty to the used piles — `hard` bars it for good",
    needs: "testmode",
  },
  {
    name: "revive",
    aliases: [],
    usage: "revive 3|MAGOG",
    summary: "back to life where it fell, with its own points and no Przedmioty",
    needs: "testmode",
  },
  {
    name: "kill",
    aliases: [],
    usage: "kill [player]",
    summary: "take a character to 0 Życia (4.4)",
    needs: "testmode",
  },
  {
    name: "nature",
    when: PLAYING,
    aliases: [],
    usage: "nature good|evil|chaotic [player] [force]",
    summary: "change a Natura (7.2) — leaves no mark of 7.3; `force` ignores one",
    needs: "play",
  },
  {
    name: "turn",
    aliases: [],
    usage: "turn [player]",
    summary: "pass until it is their turn (10.1)",
    needs: "testmode",
  },
  {
    name: "stone",
    when: PLAYING,
    aliases: [],
    usage: "stone [player]",
    summary: "turn to stone for three turns (20.1)",
    needs: "play",
  },
  {
    name: "effect",
    aliases: [],
    usage: "effect fog|frozen|barred [player]",
    summary: "a Mgła's cap, a stolen turn, or 11.11's year off the Most",
    needs: "testmode",
  },
  {
    name: "give",
    // `card` was an alias here and has become a verb: reading one is what
    // somebody usually wants from that word, and conjuring one is `give`.
    aliases: [],
    usage: "give MAGICZNY MIECZ",
    summary: "put a card in a hand",
    needs: "testmode",
  },
  {
    name: "place",
    // `drop` was an alias here and is not any more: it is the lawful "put a
    // Przedmiot down", and a word cannot mean both that and a card conjured
    // onto a field.
    aliases: ["put"],
    usage: "place MIECZ at Karczma",
    summary: "leave a card on an Obszar, the one you stand on unless named",
    needs: "testmode",
  },
  {
    // Was `go`, with `move` as an alias. Both words belong to the lawful walk
    // — you roll, then you move — and this is the one that puts a figure
    // anywhere at all, which is a different act and now says so.
    name: "teleport",
    aliases: [],
    usage: "teleport Karczma",
    summary: "stand on any Obszar, without a roll and without walking there",
    needs: "testmode",
  },
  {
    // Was `fight`. The lawful word is what a player types all game — you fight
    // what is standing in front of you — and this conjures a Wróg out of
    // nothing, which is a different act and now says so.
    name: "summon",
    aliases: [],
    usage: "summon WILKOŁAK",
    summary: "conjure a Wróg onto your Obszar and square up to it",
    needs: "testmode",
  },
  {
    name: "settle",
    aliases: [],
    usage: "settle won|lost|draw",
    summary: "settle the fight you are in — won, lost or drawn",
    needs: "testmode",
  },
  {
    name: "endgame",
    aliases: [],
    usage: "endgame won|lost",
    summary: "end the game on the Bestia — losing to it costs 2 Życia (14.7)",
    needs: "testmode",
  },
  {
    name: "endfight",
    aliases: [],
    usage: "endfight",
    summary: "drop the fight without settling it",
    needs: "testmode",
  },
  {
    name: "endturn",
    aliases: ["pass"],
    usage: "endturn",
    summary: "hand the turn on",
    // Anything but the poczekalnia, where there is no turn to hand on.
    when: PLAYING,
    needs: "play",
  },
  {
    name: "spell",
    when: PLAYING,
    aliases: [],
    usage: "spell [player] [wand]",
    summary: "draw a Zaklęcie (9.5) — `wand` is the Różdżka refilling a hand",
    needs: "play",
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
const VERBS = new Set(COMMANDS.flatMap((spec) => [spec.name, ...spec.aliases]));

/** Every card that can be fought: only a Wróg has a Miecz or a Magia to roll against. */
const FOES = (events as EventCard[]).filter((card) => card.cardClass === "foe");

/**
 * Everything nameable as a card.
 *
 * The 165 Karty Zdarzeń and the Wyposażenie, which is a separate file because
 * it is a separate deck — and which mostly reprints the same cards, so it is
 * merged by id rather than concatenated. The one name only it has is TARCZA
 * TOLIMANA, and it was already once the card that could not be asked for.
 */
const CARDS: { id: string; name: string }[] = [
  ...(events as EventCard[]),
  ...(itemCards as Item[]).filter((item) => !events.some((card) => card.id === item.id)),
];

/**
 * What a hand can hold, which is the above plus the Zaklęcia.
 *
 * `grantCard` has always taken a spell — 9.3 keeps it face down even when it
 * arrived by fiat — but the console could not name one, so the thirteen spells
 * that may be cast "w dowolnej chwili" were reachable only by drawing until one
 * turned up. Kept out of `place`, where 9.6 refuses them anyway: a list that
 * offers what the next line will reject is worse than a shorter list.
 */
const HOLDABLE: { id: string; name: string }[] = [...CARDS, ...(spells as Spell[])];

const PEOPLE = characters as Character[];

/** What each effect word means, for the answer and for Tab. */
const EFFECTS: Record<string, EffectName> = {
  fog: "fog",
  frozen: "frozen",
  barred: "barred",
};

/** The three Natury, under the words typed at them. English, like every verb here. */
/** How a fight ended, as you would say it. The store's words are the rulebook's. */
/**
 * The places a Przedmiot can be worn, as words you might type.
 *
 * Read off `SLOTS` rather than listed again, so a slot added there is typeable
 * here without anybody remembering to come back.
 */
const SLOT_WORDS = new Set<string>(SLOTS);

const OUTCOMES: Record<string, "wygrana" | "przegrana" | "remis"> = {
  won: "wygrana",
  lost: "przegrana",
  draw: "remis",
  drawn: "remis",
};

const NATURES: Record<string, Nature> = {
  good: "good",
  evil: "evil",
  chaotic: "chaotic",
};
const PLACES = [...FIELDS.values()];

/** Where `at` splits `place MIECZ at Karczma` into its two names. */
const AT = /\s+at\s+/i;

/**
 * And `as`, which does the same for `revive Ola as MAGOG`.
 *
 * Allowed at the very start as well, because the player is optional: `revive as
 * MAGOG` is your own seat, and requiring a space before the word would have
 * read that whole line as somebody's name.
 */
const AS = /(^|\s+)as\s+/i;

/**
 * Reads one line.
 *
 * A leading slash is allowed and ignored — it is what a person types out of
 * habit, and refusing it would be pedantry. Everything is case-insensitive and
 * the rest of the line after the verb is one argument, so a card can be named
 * with the spaces it is printed with: `give magiczny miecz`.
 */
export function parseCommand(line: string): { ok: Command } | { error: string } {
  const trimmed = line.trim().replace(/^\//, "");
  if (trimmed === "") return { error: "Type a command, or `help`." };

  const [first, ...rest] = trimmed.split(/\s+/);
  /**
   * `sword+1` and `gold-2`, split where a person forgot the space.
   *
   * Only where the sign or the digit begins, so it can never break a name: no
   * command has a number in it, and a card that does is one argument later.
   */
  const glued = /^([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)([+-]?\d.*)$/.exec(first);
  const verb = glued ? glued[1] : first;
  const word = verb.toLowerCase();
  const tail = [...(glued ? [glued[2]] : []), ...rest].join(" ").trim();

  if (!VERBS.has(word)) return { error: `No command \`${word}\`. Type \`help\` for the list.` };

  if (word === "help" || word === "?") {
    // Refused here rather than reported as an empty list, because `help go`
    // typed at a console that has no `go` is a question, and "there is no such
    // command" is the answer to it.
    const asked = tail.toLowerCase().split(/\s+/)[0];
    // `all` is not a command and is the one word this takes that is not one:
    // it asks for the whole list rather than about anything.
    if (tail !== "" && asked !== "all" && !VERBS.has(asked)) {
      return { error: `No command \`${tail}\`. Type \`help\` for the list.` };
    }
    return { ok: { kind: "help", about: tail.toLowerCase().split(/\s+/)[0] || null } };
  }

  if (word in STATS) {
    let [amount, ...rest2] = tail.split(/\s+/).filter(Boolean);
    if (!amount) return needs("gold", "How much?");
    // `= 12` as readily as `=12`, since one is what a person types and the
    // other is what they type when they are being careful.
    if (amount === "=" && rest2.length > 0) {
      amount = `=${rest2[0]}`;
      rest2 = rest2.slice(1);
    }

    /**
     * `=12` puts the number where you want it; `+5` and `-1` move it.
     *
     * A bare number stays a gain — "gold 5" plainly means five more of it, and
     * has meant that for as long as there has been a console. What it is not is
     * a way to *set* one, which is what somebody wants about as often: reaching
     * a Miecz of 8 from 3 should not be arithmetic done by the person typing.
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
    const force = rest2.length > 0 && rest2[rest2.length - 1].toLowerCase() === "force";
    const who = (force ? rest2.slice(0, -1) : rest2).join(" ");
    return { ok: { kind: "stat", stat: STATS[word], delta, set, who: who || null, force } };
  }

  if (word === "kill") return { ok: { kind: "kill", who: tail || null } };
  /**
   * The one command here that will not default to you.
   *
   * Everything else takes `[player]` and means yourself when it is left off,
   * which is right when the worst case is a Życie you can put back. This one
   * takes the seat away from whoever it names and cannot be undone by typing it
   * again, and a bare `kick` meaning "kick me" is a way to lose your own table
   * to a fumbled line.
   */
  if (word === "kick") {
    return tail ? { ok: { kind: "kick", who: tail } } : needs("kick", "Kick whom?");
  }
  if (word === "spell") {
    // `wand` last and bare, the way `force` and `hard` are.
    const parts = tail.split(/\s+/).filter(Boolean);
    const wand = parts.length > 0 && parts[parts.length - 1].toLowerCase() === "wand";
    const who = (wand ? parts.slice(0, -1) : parts).join(" ");
    return { ok: { kind: "spell", who: who || null, wand } };
  }
  // Spelled out, because `win` alone is two different things: the fight in
  // front of you, and the game.
  if (word === "settle") {
    const said = tail.toLowerCase();
    const outcome = OUTCOMES[said];
    if (!outcome) return needs("settle", `Won, lost or drawn — \`${said || "?"}\`?`);
    return { ok: { kind: "settle", outcome } };
  }
  if (word === "endgame") {
    const said = tail.toLowerCase();
    if (said !== "won" && said !== "lost") {
      return needs("endgame", `Won or lost — \`${said || "?"}\`?`);
    }
    return { ok: { kind: "endgame", won: said === "won" } };
  }
  if (word === "endfight") return { ok: { kind: "endfight" } };
  if (word === "endturn" || word === "pass") return { ok: { kind: "endturn" } };

  if (word === "give") {
    return name(HOLDABLE, (card) => card.name, tail, "card", (card) => ({
      kind: "give",
      cardId: card.id,
    }), "give");
  }

  /**
   * A card left lying on a field, rather than put in a hand.
   *
   * Two names in one line, which nothing else here takes, so they are separated
   * by the word that reads as English and appears in no card and no Obszar:
   * `place MIECZ at Karczma`. Without it, the Obszar is the one you are
   * standing on — which is what a tester wants most of the time, and the only
   * reason the field is optional.
   */
  if (word === "place" || word === "put") {
    const cut = tail.search(AT);
    const cardPart = cut === -1 ? tail : tail.slice(0, cut);
    const fieldPart = cut === -1 ? "" : tail.slice(cut).replace(AT, "");
    let fieldId: FieldId | null = null;
    if (fieldPart !== "") {
      const where = findByName(PLACES, (field) => field.name, fieldPart);
      if ("ambiguous" in where) return { error: `Which one — ${where.ambiguous.join(", ")}?` };
      if ("missing" in where) return { error: `No Obszar called \`${fieldPart}\`.` };
      fieldId = where.found.id;
    }
    return name(CARDS, (c) => c.name, cardPart, "card", (c) => ({
      kind: "place",
      cardId: c.id,
      fieldId,
    }), "place");
  }

  if (word === "nature") {
    const [said, ...rest3] = tail.split(/\s+/).filter(Boolean);
    const nature = NATURES[(said ?? "").toLowerCase()];
    if (!nature) {
      return { error: `Which Natura — ${Object.keys(NATURES).join(", ")}?` };
    }
    // `force` last, after the player, the way `gold` takes it.
    const forced = rest3.length > 0 && rest3[rest3.length - 1].toLowerCase() === "force";
    const who = (forced ? rest3.slice(0, -1) : rest3).join(" ");
    return { ok: { kind: "nature", nature, who: who || null, force: forced } };
  }

  if (word === "who") return { ok: { kind: "who" } };
  if (word === "leave") return { ok: { kind: "leave" } };
  if (word === "unseat") return { ok: { kind: "unseat", who: tail || null } };

  /**
   * The one command here that will not default to you.
   *
   * Everything else that takes `[player]` means yourself when it is left off,
   * which is right when the worst case is a Życie you can put back. This puts
   * somebody out of the table and a bare `kick` meaning "kick me" is a way to
   * lose your own seat to a fumbled line.
   */
  if (word === "kick") {
    return tail ? { ok: { kind: "kick", who: tail } } : needs("kick", "Kick whom?");
  }
  if (word === "host") {
    return tail ? { ok: { kind: "host", who: tail } } : needs("host", "Hand it to whom?");
  }

  /**
   * `rename Ola as Basia` — two names in one line, split by the word that reads
   * as English and appears in no Postać and no Obszar, exactly as `place` uses
   * `at`. Without the split there is no telling where one name ends.
   */
  if (word === "rename") {
    const cut = tail.search(AS);
    if (cut === -1) return needs("rename", "Rename them to what?");
    const who = tail.slice(0, cut).trim();
    const name = tail.slice(cut).replace(AS, "").trim();
    if (!who) return needs("rename", "Rename whom?");
    if (!name) return needs("rename", "Rename them to what?");
    return { ok: { kind: "rename", who, name } };
  }

  /**
   * `seat Ola 3` — the seat is the number on the end.
   *
   * No keyword between them, unlike `rename`, because the two arguments are not
   * the same kind of thing: a seat is a bare number and no name here begins
   * with a digit, so the line reads itself.
   */
  if (word === "seat") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (!/^\d+$/.test(last)) return needs("seat", "Into which seat?");
    const who = parts.slice(0, -1).join(" ");
    if (!who) return needs("seat", "Seat whom?");
    return { ok: { kind: "seat", who, seat: Number(last) } };
  }

  /**
   * A Postać into a seat: 4.4's "moze wybrac sobie nowa", and a latecomer's
   * first one, which are the same act for different reasons.
   *
   * Both arguments optional and told apart by shape. A trailing bare number is
   * the seat — yours when it is left off — and whatever is in front of it is
   * the Postać, drawn when that is left off too, which is what 4.4 describes.
   */
  if (word === "pick") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const numbered = parts.length > 0 && /^\d+$/.test(parts[parts.length - 1]);
    const seat = numbered ? Number(parts[parts.length - 1]) : null;
    const said = (numbered ? parts.slice(0, -1) : parts).join(" ");
    if (said === "") return { ok: { kind: "pick", characterId: null, seat } };
    const hit = findByName(PEOPLE, (person) => person.name, said);
    if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
    if ("missing" in hit) return { error: `No Postać called \`${said}\`.` };
    return { ok: { kind: "pick", characterId: hit.found.id, seat } };
  }

  /**
   * A Postać out of the game, or back into it.
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
  if (word === "remove" || word === "erase" || word === "revive") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const hard = parts.length > 0 && parts[parts.length - 1].toLowerCase() === "hard";
    const said = (hard ? parts.slice(0, -1) : parts).join(" ");
    if (said === "") return needs(word === "revive" ? "revive" : "remove", "Which Postać?");

    let seat: number | null = null;
    let characterId: string | null = null;
    if (/^\d+$/.test(said)) {
      seat = Number(said);
    } else {
      const hit = findByName(PEOPLE, (person) => person.name, said);
      if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
      if ("missing" in hit) return { error: `No Postać called \`${said}\`.` };
      characterId = hit.found.id;
    }
    if (word === "revive") {
      if (hard) return { error: "`hard` is a removal's word, not a revival's." };
      return { ok: { kind: "revive", seat, characterId } };
    }
    return { ok: { kind: "remove", seat, characterId, hard } };
  }

  if (word === "turn") return { ok: { kind: "turn", who: tail || null } };
  if (word === "stone") return { ok: { kind: "stone", who: tail || null } };

  if (word === "effect") {
    const [said, ...who] = tail.split(/\s+/).filter(Boolean);
    const effect = EFFECTS[(said ?? "").toLowerCase()];
    if (!effect) return { error: `Which effect — ${Object.keys(EFFECTS).join(", ")}?` };
    return { ok: { kind: "effect", effect, who: who.join(" ") || null } };
  }

  if (word === "summon") {
    return name(FOES, (card) => card.name, tail, "Wróg", (card) => ({
      kind: "summon",
      cardId: card.id,
    }), "summon");
  }

  if (word === "answer") {
    const parts = tail.split(/\s+/).filter(Boolean);
    const numbers = parts.filter((one) => /^\d+$/.test(one)).map(Number);
    const named = parts.filter((one) => !/^\d+$/.test(one)).join(" ");
    // No number is a real answer. A compulsory Obszar comes in two shapes —
    // one that asks (`wybor`) and one that only rolls (`rzut`, the Karczma) —
    // and the second has nothing to choose. `answer` alone means "get on with
    // it"; `answer 2` means "and I pick the second".
    return { ok: { kind: "answer", card: named || null, choices: numbers } };
  }

  if (word === "ready" || word === "unready") {
    return { ok: { kind: "ready", who: tail || null, ready: word === "ready" } };
  }
  if (word === "start") return { ok: { kind: "start" } };
  if (word === "card" || word === "read" || word === "x") {
    if (!tail) return needs("card", "Which card?");
    return { ok: { kind: "card", name: tail } };
  }

  if (word === "take" || word === "get") {
    return tail ? { ok: { kind: "take", name: tail } } : needs("take", "Take what?");
  }
  // `drop` is the lawful one: `place` conjures a card onto a field and this puts
  // down one you are holding. The kind is `putdown` because `place` had the
  // obvious name first.
  if (word === "drop") {
    return tail ? { ok: { kind: "putdown", name: tail } } : needs("drop", "Drop what?");
  }
  if (word === "use") {
    return tail ? { ok: { kind: "use", name: tail } } : needs("use", "Use what?");
  }
  if (word === "equip" || word === "wear") {
    if (!tail) return needs("equip", "Wear what?");
    // The slot last, the way `force` and `hard` are: it is about where the
    // card goes rather than which card it is, and most cards fit one place.
    const parts = tail.split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    const slot = parts.length > 1 && SLOT_WORDS.has(last) ? last : null;
    const named = (slot === null ? parts : parts.slice(0, -1)).join(" ");
    if (!named) return needs("equip", "Wear what?");
    return { ok: { kind: "equip", name: named, slot } };
  }

  if (word === "buy") {
    return tail ? { ok: { kind: "buy", name: tail } } : needs("buy", "Buy what?");
  }
  if (word === "sell") {
    return tail ? { ok: { kind: "sell", name: tail } } : needs("sell", "Sell what?");
  }
  if (word === "trade") return { ok: { kind: "trade" } };
  if (word === "heal") {
    if (!tail) return { ok: { kind: "heal", points: null } };
    if (!/^\d+$/.test(tail)) return needs("heal", `How many — \`${tail}\`?`);
    return { ok: { kind: "heal", points: Number(tail) } };
  }
  if (word === "cast") {
    if (!tail) return needs("cast", "Cast what?");
    // `at` joins the two names, the way `place MIECZ at Karczma` does.
    const [named, at] = tail.split(AT);
    if (!named?.trim()) return needs("cast", "Cast what?");
    return { ok: { kind: "cast", name: named.trim(), who: at?.trim() || null } };
  }

  if (word === "beast") return { ok: { kind: "beast" } };
  if (word === "bridge" || word === "most") return { ok: { kind: "bridge" } };
  if (word === "cross") return { ok: { kind: "cross" } };
  if (word === "guardian") return { ok: { kind: "guardian" } };
  if (word === "ferry") {
    // `pay` last and bare, the way `force` and `hard` are.
    return { ok: { kind: "ferry", pay: tail.toLowerCase() === "pay" } };
  }

  if (word === "escape" || word === "flee") return { ok: { kind: "escape" } };
  if (word === "attack") {
    return tail ? { ok: { kind: "attack", who: tail } } : needs("attack", "Attack whom?");
  }
  if (word === "pay") return { ok: { kind: "pay" } };
  if (word === "ask") return { ok: { kind: "ask" } };
  if (word === "raid") {
    return tail
      ? { ok: { kind: "raid", who: tail } }
      : needs("raid", "Send your Przyjaciel against whom?");
  }
  if (word === "fight") {
    // Nothing named takes whatever is waiting, which is the usual case: a Wróg
    // attacks the character who drew him (16.2), and there is only one of him.
    if (!tail) return { ok: { kind: "fight", cardId: null } };
    return name(FOES, (card) => card.name, tail, "Wróg", (card) => ({
      kind: "fight",
      cardId: card.id,
    }), "fight");
  }

  if (word === "roll") return { ok: { kind: "roll" } };
  if (word === "draw") return { ok: { kind: "draw" } };
  if (word === "look" || word === "l") return { ok: { kind: "look" } };
  if (word === "me" || word === "sheet" || word === "i") {
    return { ok: { kind: "me", who: tail || null } };
  }

  if (word === "move" || word === "walk") {
    return name(PLACES, (field) => field.name, tail, "Obszar", (field) => ({
      kind: "move",
      fieldId: field.id,
    }), "move");
  }

  if (word === "teleport") {
    return name(PLACES, (field) => field.name, tail, "Obszar", (field) => ({
      kind: "teleport",
      fieldId: field.id,
    }), "teleport");
  }

  // Only reachable if something is advertised and then not read, which the
  // tests type every line of `help` to prevent.
  return { error: `\`${word}\` is listed but does nothing yet.` };
}

/** Resolves one name, or says why it could not. */
/**
 * Something is missing, and here is the shape of the line.
 *
 * Every one of these used to be written by hand and about half of them
 * remembered the usage — so `card` taught you how to type it and `kick` did
 * not, for no reason anybody chose. Being stopped is exactly the moment the
 * shape is worth seeing.
 *
 * The usage rather than the whole of `help <command>`: you have just typed the
 * verb, so you know what it does; what you are missing is where the argument
 * goes.
 */
function needs(verb: string, question: string): { error: string } {
  return { error: `${question} ${usageOf(verb)}` };
}

function name<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  what: string,
  build: (item: T) => Command,
  /** Whose usage to show when nothing was named. */
  verb: string,
): { ok: Command } | { error: string } {
  if (query === "") return needs(verb, `Which ${what}?`);
  const hit = findByName(items, nameOf, query);
  if ("found" in hit) return { ok: build(hit.found) };
  if ("ambiguous" in hit) {
    return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
  }
  return { error: `No ${what} called \`${query}\`.` };
}

function usageOf(command: string): string {
  return COMMANDS.find((spec) => spec.name === command)?.usage ?? command;
}

/**
 * What to say about a parameter that was asked to move.
 *
 * Written against what actually moved, never against what was asked for. The
 * store clamps — 1.3 and 2.3 hold own Miecz and Magia at or above the values
 * the character started with, Życie and Złoto at nothing, and everything at
 * `CEILING` — and it clamps silently, which is right, because the rule is the
 * rule. The console then printed the resulting value, so asking to take a point
 * off a Magia already at its floor answered "magia -1 → 3" and read exactly
 * like it had worked. Twice in a row, identically, which is how it was found.
 *
 * Here rather than beside the database, because that is where the mistake was:
 * a sentence assembled where nothing could ask it what it would say.
 */
export function statReply(said: {
  who: string;
  stat: StatName;
  /** What the line asked for. */
  asked: number;
  /** What the parameter moved by, which a floor or the ceiling may have cut. */
  moved: number;
  /** Where it ended up. */
  now: number;
  /** What the rule puts under it: the starting value, or nothing. */
  floor?: number;
  /** Whether the line said `force`, which lifts the floor under own points. */
  forced?: boolean;
}): string {
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const mark = said.forced ? " (forced)" : "";
  if (said.moved === said.asked) {
    return `${said.who}: ${said.stat} ${signed(said.moved)} → ${said.now}${mark}`;
  }

  const floor = said.floor ?? 0;
  /**
   * One sentence for the floor, whether the number is sitting on it or under
   * it.
   *
   * Under it is a state only `force` can arrange, and it does behave a little
   * differently — the number is held where it is rather than at the rule's
   * value — but saying so took a second sentence to explain a distinction
   * nobody typing into a test console needs drawn. What both cases need is the
   * same: it did not move, here is the rule, here is the word that gets past
   * it.
   */
  const limit =
    said.asked > 0
      ? // Nothing can be above the ceiling to begin with, so this is the only
        // way up that is ever refused.
        `${said.stat} stops at ${said.now}`
      : said.forced || floor === 0
        ? `${said.stat} cannot go below ${said.now}`
        : `${said.stat} cannot go below the ${floor} this character started with (1.3, 2.3) — say \`force\` to`;
  return said.moved === 0
    ? `${said.who}: ${said.stat} stays at ${said.now} — ${limit}.`
    : `${said.who}: ${said.stat} ${signed(said.moved)} → ${said.now}, not ${signed(said.asked)} — ${limit}.`;
}

/**
 * Which of the people at the table a `[player]` names.
 *
 * By player, by character, or by seat number — whichever is on the screen when
 * somebody types, because a tester driving four seats reads them off four
 * different parts of it. The character is matched on its *printed* name and not
 * on its id: `bledny-rycerz` is what the row holds, and nobody types the hyphen
 * or knows it is there.
 *
 * Everybody seated is searchable, including a seat with no character on it. It
 * used to be only those with one, which quietly made `revive` unable to name
 * the seat it exists for — a latecomer's, whose character has not been dealt.
 *
 * Asked about a *person* rather than a seat, the same three handles work and a
 * fourth arrives: the id off the roster, for somebody who drives no seat at all
 * and can therefore be named by nothing that is printed on the board. So
 * `seat` is nullable here, and null is a spectator rather than a missing value.
 *
 * Pure, and it answers with an index rather than a row, so the caller keeps
 * whatever kind of row it started with.
 */
export function pickPlayer(
  people: readonly {
    /** The seat they drive; null for somebody watching. */
    seat: number | null;
    name: string | null;
    character: string | null;
    /** Four characters off the roster — see `makeUserId`. A seat has none. */
    id?: string;
  }[],
  who: string,
): { at: number } | { error: string } {
  const asked = who.trim();
  if (asked === "") return { error: "Who?" };

  // The number printed beside a seat is one-based; `seat` is the stored index.
  if (/^\d+$/.test(asked)) {
    const at = people.findIndex((one) => one.seat === Number(asked) - 1);
    if (at !== -1) return { at };
  }

  /**
   * The id, whole and exact, and ahead of the names.
   *
   * Four characters with no meaning in them: a prefix of one is a coincidence
   * rather than an abbreviation, so it is matched outright or not at all. It
   * goes first because it is the one handle that is guaranteed to name exactly
   * one person — which is what `who` prints it for.
   */
  const byId = people.findIndex((one) => one.id !== undefined && fold(one.id) === fold(asked));
  if (byId !== -1) return { at: byId };

  const named = people.map((one, index) => ({
    index,
    name:
      one.name ??
      nameOfCharacter(one.character) ??
      // A seat with neither is named by the number printed beside it. A person
      // always has a name, so for them this is unreachable — and an empty
      // string matches nothing, which is the honest answer if it ever is.
      (one.seat === null ? "" : `${one.seat + 1}`),
    also: one.name ? nameOfCharacter(one.character) : null,
  }));
  // A character's name is as good a handle as its player's, so both are in the
  // pool and either one finds the seat.
  const pool = named.flatMap((one) =>
    one.also ? [one, { ...one, name: one.also }] : [one],
  );

  const hit = findByName(pool, (one) => one.name, asked);
  if ("found" in hit) return { at: hit.found.index };
  if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
  return { error: `Nobody called \`${asked}\` is at this table.` };
}

function nameOfCharacter(id: string | null): string | null {
  if (!id) return null;
  return PEOPLE.find((one) => one.id === id)?.name ?? null;
}

/**
 * What a Tab should finish, given a half-typed line.
 *
 * Names in this box are long, printed in capitals and full of Polish letters —
 * ZWIERCIADŁO ZNISZCZENIA, ŚWIĄTYNIA BOGINI NEMED — and a console whose
 * arguments have to be typed exactly is a console that is slower than the
 * buttons it replaced. So the same vocabulary the parser matches against is the
 * vocabulary Tab completes from, and the same folded comparison decides what
 * counts as a start: `swi` finds ŚWIĘTY GRAAL.
 *
 * Given several, it fills in as far as they agree and hands back the list, the
 * way a shell does. Pure, and the players are passed in rather than looked up,
 * because who is at the table is not something the grammar knows.
 */
export function complete(
  line: string,
  players: readonly string[] = [],
  /** What to offer. Everything, unless a surface says where the game has got to. */
  offering: { stage?: Stage; testmode?: boolean } = {},
): { line: string; options: string[] } {
  const words = new Set(
    availableIn(offering).flatMap((spec) => [spec.name, ...spec.aliases]),
  );
  const slash = line.startsWith("/") ? "/" : "";
  const bare = line.slice(slash.length);
  const parts = bare.split(/\s+/);
  const typingVerb = parts.length === 1;

  const verb = parts[0].toLowerCase();
  const stat = verb in STATS;

  /** Every name this position could take, and where the fragment being typed starts. */
  const from = (): { pool: string[]; at: number } => {
    if (typingVerb) {
      return { pool: [...words], at: 0 };
    }
    // `help` takes every command, locked or out of season: asking about one you
    // cannot run is a fair question, and the answer says why.
    if (verb === "help" || verb === "?") return { pool: [...VERBS], at: 1 };
    // A stat takes its amount first and a player after it; everything else
    // takes its one argument straight away.
    if (stat) return { pool: [...players, "force"], at: 2 };
    if (verb === "give" || verb === "card") return { pool: HOLDABLE.map((c) => c.name), at: 1 };
    if (verb === "place" || verb === "put" || verb === "drop") {
      // Which half of the line is being typed. Past the `at`, the names on
      // offer are the board's; before it, the deck's.
      const said = parts.findIndex((part, index) => index > 0 && part.toLowerCase() === "at");
      return said === -1
        ? { pool: CARDS.map((c) => c.name), at: 1 }
        : { pool: PLACES.map((f) => f.name), at: said + 1 };
    }
    if (verb === "summon" || verb === "fight") return { pool: FOES.map((c) => c.name), at: 1 };
    if (verb === "card" || verb === "read" || verb === "x") {
      return { pool: [...HOLDABLE.map((one) => one.name), ...PEOPLE.map((one) => one.name)], at: 1 };
    }
    if (verb === "teleport" || verb === "move" || verb === "walk") {
      return { pool: PLACES.map((f) => f.name), at: 1 };
    }
    if (
      verb === "kill" ||
      verb === "kick" ||
      verb === "unseat" ||
      verb === "host" ||
      verb === "spell" ||
      verb === "turn" ||
      verb === "stone"
    ) {
      return { pool: [...players], at: 1 };
    }
    // `seat Ola 3` finishes the person; the seat is a digit and finishes
    // itself.
    if (verb === "seat") return { pool: [...players], at: 1 };
    if (verb === "rename") {
      // Only the person. What they are being renamed to is not a name anybody
      // has yet, which is the point of typing it.
      const said = parts.findIndex((part, index) => index > 0 && part.toLowerCase() === "as");
      return said === -1 ? { pool: [...players], at: 1 } : { pool: [], at: parts.length - 1 };
    }
    // Postacie by name — and for `remove` and `revive` a seat number would do
    // just as well, but a number has nothing to finish.
    if (verb === "pick" || verb === "remove" || verb === "erase" || verb === "revive") {
      return { pool: PEOPLE.map((person) => person.name), at: 1 };
    }
    if (verb === "effect") {
      return parts.length === 2
        ? { pool: Object.keys(EFFECTS), at: 1 }
        : { pool: [...players], at: 2 };
    }
    if (verb === "nature") {
      // The Natura first, then who it belongs to.
      return parts.length === 2
        ? { pool: Object.keys(NATURES), at: 1 }
        : { pool: [...players], at: 2 };
    }
    return { pool: [], at: parts.length - 1 };
  };

  const { pool, at } = from();
  // The rest of the line is one argument, so a name with spaces in it can be
  // completed from any word of it: `give magiczny mie` is still one fragment.
  const fragment = parts.slice(at).join(" ");
  if (pool.length === 0 || at >= parts.length) return { line, options: [] };

  const needle = fold(fragment);
  const hits = [...new Set(pool.filter((name) => fold(name).startsWith(needle)))].sort((a, b) =>
    a.localeCompare(b, "pl"),
  );
  if (hits.length === 0) return { line, options: [] };

  const head = parts.slice(0, at).join(" ");
  const joined = (name: string) => `${slash}${head === "" ? "" : `${head} `}${name}`;
  if (hits.length === 1) return { line: `${joined(hits[0])} `, options: [] };

  // As far as they all agree, and then the list — a shell's answer to an
  // ambiguous Tab, and the only one that never guesses.
  let shared = hits[0];
  for (const name of hits) {
    while (!fold(name).startsWith(fold(shared))) shared = shared.slice(0, -1);
  }
  return { line: joined(shared), options: hits };
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
/**
 * What each kind of command needs before it may run.
 *
 * A second list beside `COMMANDS`, and deliberately: the spec table is keyed on
 * the word you type and this is keyed on what the word parsed *to*, and the two
 * are not one-to-one — `gold`, `sword`, `magic` and `life` are four words and
 * one `stat`. A test types every usage line `help` prints and checks the answer
 * here matches the spec it came from, which is what keeps them from drifting.
 */
const NEEDS: Record<Command["kind"], Capability> = {
  help: "play",
  who: "play",
  seat: "play",
  unseat: "play",
  kick: "play",
  leave: "play",
  rename: "play",
  host: "play",
  pick: "play",
  endturn: "play",
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
  nature: "play",
  turn: "testmode",
  // Both sides call `turnToStone`. There was never a second act here to
  // separate — 20.1 is a rule, and this is how it is reached.
  stone: "play",
  effect: "testmode",
  give: "testmode",
  place: "testmode",
  teleport: "testmode",
  summon: "testmode",
  settle: "testmode",
  endgame: "testmode",
  endfight: "testmode",
  // Both sides call `drawSpell`. 9.5 deals them; this is that.
  spell: "play",
};

export function needsOf(command: Command): Capability {
  // One verb whose capability is on the line rather than in the table: 7.2's
  // change is playing the game, and overruling a 7.3 the game itself wrote is
  // not.
  if (command.kind === "nature") return command.force ? "testmode" : "play";
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
const OFF_TABLE = new Set<Command["kind"]>(["help", "card"]);

export function worksOffTable(command: Command): boolean {
  return OFF_TABLE.has(command.kind);
}

export function permits(
  command: Command,
  at: { testmode: boolean },
): { ok: true } | { ok: false; why: string } {
  if (needsOf(command) === "play" || at.testmode) return { ok: true };
  return {
    ok: false,
    why: `\`${command.kind}\` overrules the rules — turn testmode on first.`,
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
  const rows = shown.map((spec) => `${words(spec)} ${args(spec)}`.trimEnd());
  const widest = Math.max(...rows.map((row) => row.length), 0);
  const lines = shown.map((spec, index) => {
    const idle = at.all === true && !availableIn(at).includes(spec) && !extra.includes(spec);
    return `${idle ? "·" : " "}${rows[index].padEnd(widest)}  ${spec.summary}`;
  });

  const hidden = COMMANDS.length + extra.length - shown.length;
  return hidden === 0
    ? lines
    : [...lines, ` ${`(${hidden} more)`.padEnd(widest)}  \`help all\` — every command, whenever it applies`];
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
