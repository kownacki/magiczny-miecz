/** What a one-shot or fixture card does, and — just as importantly — where the card goes afterwards. */

import type { CardClass, Nature } from "@/data/types";
import type { Ends, Modifier } from "./status";
import { MIEJSCA } from "./scripts/miejsca";
import { NIEZNAJOMI } from "./scripts/nieznajomi";
import { PRZEDMIOTY } from "./scripts/przedmioty";
import { SPOTKANIA } from "./scripts/spotkania";
import { WROGOWIE } from "./scripts/wrogowie";
import type { FieldId } from "./board";
import type { CardId } from "@/data/ids";
import { nodesOf, wordOf } from "./words";

/**
 * The second of the three card shapes.
 *
 * `abilities.ts` covers the standing rules a character carries around. This
 * covers the cards that *happen*: a Spotkanie that resolves once, a Nieznajomy
 * who grants a wish and leaves, a Miejsce that settles onto a field and serves
 * everyone who passes.
 *
 * Disposition is a field of its own rather than an afterthought because the
 * corpus makes it one. Twenty-five cards say some version of "pozostanie tu, aż
 * ktoś go..." and eighteen say "a następnie ją odłóż"; where the card ends up
 * is frequently the *only* thing distinguishing two otherwise identical
 * effects, and it is the part a table gets wrong without a referee. Knowing
 * that Jednorożec carries you anywhere in your Krąg is half the card; knowing
 * that he then leaves, whether or not you took the ride, is the other half.
 */
export interface CardScript {
  /** What resolving the card does, where it lies. */
  effect: Effect;
  /**
   * Where the Karta goes the moment it is turned over (15.1).
   *
   * „Karty, które zgodnie z ich instrukcją powinny zostać położone na
   * konkretnym Obszarze, niezależnie od tego, gdzie zostały wyciągnięte,
   * rozpatrywane są w pierwszej kolejności. **Nie mają one wpływu na Postać,
   * która je wyciągnęła** (oczywiście tylko podczas aktualnej tury)." Three
   * cards in the box do it: the UPIÓR and the EREMITA roll for their Obszar,
   * the LEWIATAN is put down on one of six.
   *
   * Its own field for the same reason `onLoss` is: this is a *second* thing
   * the card's text says, and it is said to somebody else. The Eremita reads
   * „Rzuć kostką i umieść Kartę Eremity na odpowiednim Obszarze… Pierwszej
   * Postaci, Eremita ofiaruje do wyboru: Magiczny Miecz lub Tarczę Tolimana" —
   * one sentence to whoever turned him over and one to whoever finds him, and
   * they are never the same person. Both lived in `effect` as a `sequence`
   * until this field existed, which handed the Magiczny Miecz to the very
   * Postać 15.1 says the Karta cannot touch, and made a visitor roll for his
   * Obszar all over again — an Eremita who moved every time somebody called on
   * him.
   *
   * `instructionIn` is what picks between the two, off the one fact that tells
   * them apart: whether the Karta came off the pile or off the board.
   */
  onDraw?: Effect;
  /**
   * What losing a fight to this creature costs, on top of 17.4's point of Życie.
   *
   * A Wróg is not *resolved* the way a Spotkanie is — you fight it — so its
   * `effect` is whatever the card does when you turn it over, and for most of
   * them that is nothing at all. This is the other thing a creature's card can
   * say, and exactly one in the box says it: "Każdej pokonanej Postaci,
   * Złoczyńca zabiera do wyboru: 1 Sztukę Złota lub jeden Przedmiot."
   *
   * Its own field rather than a reading of `effect`, because the two are not
   * the same thing and one card proves it: the Wędrowiec's `effect` is a die
   * that decides whether the fight happens at all, and running that on a loss
   * would open a second fight with the creature that just beat you.
   *
   * "On top of" and not "instead of": the card says what the Złoczyńca takes
   * and says nothing about the point of Życie, and 17.4 is the general rule
   * that governs every fight.
   */
  onLoss?: Effect;
  /** Where the card goes once it has been resolved. */
  disposition: Disposition;
  /**
   * Set when a character may simply decline — "Jeżeli chcesz", "Możesz". The
   * disposition still applies: the Jednorożec leaves either way.
   */
  optional?: boolean;
  /**
   * The card is not kept — resolving it is the whole of it.
   *
   * A Sztuka Złota is filed as a Przedmiot because that is the numeral printed
   * on it, but it is money: the card turns into gold and goes on the used pile.
   * Nothing about it survives to be carried, so it costs nothing against the
   * four-item limit of 5.4 and there is nothing to lose on the Bagna later.
   *
   * Class alone cannot tell you this — `kindForCard` sees "item" and says
   * "item", which is how gold ended up sitting in players' packs with a discard
   * button under it. The script is what knows.
   */
  consumed?: boolean;
  /**
   * The card's own proofs: a table, some dice and answers, and what must be
   * true afterwards. `commands/examples.ts` plays every one of them, and
   * `npm run card -- try` plays one out loud.
   *
   * On the Karta rather than in a test file beside it, because a card that
   * carries its own examples can be moved, read and doubted as one thing —
   * Fireplace, XMage and Argentum all test a card this way, a minimal state
   * and a scripted game, and none of them keeps the proof away from the card
   * (docs/KARTA.md §5).
   */
  examples?: readonly Example[];
}

/**
 * One play of a Karta, written down: the table before, what is thrown and
 * answered, and what is true after.
 *
 * Plain data, no functions and no regular expressions, so a card file is
 * still JSON with comments (docs/KARTA.md §2). Everything left out is the
 * harness's default: a Goblin with Miecz 2, Magia 1, four Życie and one Sztuka
 * Złota, standing on the Wrzosowiska, holding nothing.
 */
export interface Example {
  name: string;
  /** The seat before the Karta, where it differs from the default. */
  given?: {
    gold?: number;
    life?: number;
    /** Own points — the tracked ones, 1.2 and 2.2 — and the floor under them. */
    sword?: number;
    magic?: number;
    nature?: Nature;
    items?: readonly CardId[];
    friends?: readonly CardId[];
    /** How many Zaklęcia are already in the hand. */
    spells?: number;
  };
  /** The Karta is found lying on the Obszar rather than turned over (15.1). */
  lying?: true;
  /** Dice, in the order the Karta throws them. */
  dice?: readonly number[];
  /** Answers, one per question the Karta asks, in the order it asks. */
  answers?: readonly number[];
  /** The Obszar pointed at, when the Karta asks `where`. */
  destination?: FieldId;
  expect: {
    gold?: number;
    life?: number;
    sword?: number;
    magic?: number;
    items?: number;
    friends?: number;
    spells?: number;
    /** Where the Postać stands afterwards. */
    standingOn?: FieldId;
    /** Where the Karta itself lies afterwards. */
    lyingOn?: FieldId;
    /** A phrase the play reports, in the journal's own words. */
    says?: string;
    /** The question still open at the end, or null for none. */
    waitingOn?: Effect["op"] | null;
  };
}

/**
 * Where a card ends up. Every variant is a phrasing the deck actually uses.
 */
export type Disposition =
  /** "odłóż jego Kartę" — onto the used pile, gone. */
  | { kind: "discard" }
  /** "pozostanie na tym Obszarze do końca rozgrywki" — a permanent fixture. */
  | { kind: "stays" }
  /**
   * Stays with a pool of points that visitors draw down, and is discarded when
   * they run out: Drzewo Życia with four Życie, Jezioro Magiczne with four
   * Miecza, Zaklęte Źródło with four Magii.
   */
  | { kind: "stays-with-pool"; stat: "life" | "sword" | "magic"; points: number }
  /**
   * Waits for one character and then leaves — "Pierwszej Postaci ... Następnie
   * odłóż jego Kartę". Distinct from `discard` because the card sits on the board
   * in the meantime, and from `stays` because it does not stay.
   */
  | { kind: "until-first-visitor" }
  /** Taken into the character's keeping, like any Przedmiot or Przyjaciel. */
  | { kind: "kept" }
  /** Lasts a stated number of turns and is then discarded (Mgła, Układ Planet). */
  | { kind: "after-turns"; turns: number }
  /** Shuffled back in rather than discarded (a Magiczny Miecz found too low). */
  | { kind: "back-to-pile" };

/** Who an effect lands on. */
export type Target =
  | "you"
  /** Every character on the board, the drawer included (Burza Siedmiu Słońc). */
  | "everyone"
  /** Everyone in the drawer's own Krąg (Zaraza). */
  | "everyone-in-ring"
  /** Whoever later stops on the field the card is lying on. */
  | "whoever-lands-here"
  /**
   * Everybody standing on one Obszar, the caster included where they stand
   * there. The Władca Gromu: "Wszystkie istoty w tym Obszarze (także Postacie)
   * zostaną sparaliżowane lękiem."
   *
   * Distinct from `everyone-in-ring`, which is a whole Kraina — this is the
   * square somebody is pointing at, and the only spell in the box that aims at
   * one.
   */
  | "everyone-here"
  /**
   * A group picked out by Natura or by which ring they are walking. The Danina
   * rolls a die to decide which of the six groups pays the Beast this time, so
   * these are not six special cases but one card's six faces.
   */
  | "good"
  | "chaotic"
  | "evil"
  | "in-lower-ring"
  | "in-middle-ring"
  | "in-upper-ring"
  /** One other character, chosen by whoever is holding the card. */
  | "another-character";

/**
 * Where a card can send a character.
 *
 * "dowolny Obszar w tym Kręgu" is the commonest and is a genuine choice, not a
 * destination, which is why it is a variant rather than a field id.
 */
/**
 * The ops the walk **composes** rather than executes.
 *
 * A card's vocabulary has two kinds of word. Most name a thing that happens —
 * a point, a Zaklęcie, a fight — and are carried out in one step. These six
 * name a *shape*: a choice among others, a sequence of others, a table of
 * others, a branch, a borrowed Obszar's whole script, a riddle whose prize is
 * another effect. Nothing executes them; the walk descends through them.
 *
 * Here, in the file that owns the vocabulary, rather than in the command that
 * dispatches it — `commands/ops.ts` derives its leaf table from this, and
 * `coverage.test.ts` asks it which nodes could ever stall. It was declared in
 * the command, which made it a fact about one dispatcher instead of a fact
 * about the language, and left a reader in the engine with nothing to ask.
 *
 * `words.ts` carries the same fact per word as `composes`, typed off this list,
 * so the two cannot disagree: a word listed here must say `composes: true` in
 * its entry, and one not listed must say `false`.
 */
export const COMPOSING_OPS = [
  "choice",
  "sequence",
  "roll",
  "when",
  "as-field",
  "move-card",
  "guess",
] as const;

export type ComposingOp = (typeof COMPOSING_OPS)[number];

export type Destination =
  | { kind: "field"; fieldId: FieldId }
  | { kind: "anywhere-in-ring" }
  /** Straight back where the move began (Straż). */
  | { kind: "move-start" }
  /**
   * One of a listed set, whichever is free — the Lewiatan settles on whichever
   * of the Mokradła, Przeprawa or Bagna is unoccupied. The choice among them is
   * the players'; what matters is that it is these fields and no others.
   */
  | { kind: "one-of"; fieldIds: readonly FieldId[] };

/**
 * What a card does, as an ordered list of operations.
 *
 * The operations are the ones the corpus needs and no more. Anything a card
 * asks for that is not here keeps working the way it always has: the text is
 * shown and the players apply it.
 */
export type Effect =
  /** Do nothing at all — a die table's "Zostałeś zignorowany" face. */
  | { op: "nothing" }
  /** Several things in order. */
  | { op: "sequence"; steps: Effect[] }
  /** The character picks one (Król Lasu, Wróżka, Koszmar). */
  | { op: "choice"; options: { label: string; effect: Effect }[] }
  /**
   * A die table: one die and six outcomes (Grota, Sidh, Urocza Diablica,
   * Nieznana Świątynia), or two dice and eleven.
   *
   * `dice` is the count, and defaults to one because that is what every card
   * in the box rolls. The two Świątynie are the exception — "MOŻESZ MODLIĆ SIĘ
   * RZUCAJĄC 2 KOSTKAMI" — and their tables are keyed 2 to 12, which is why the
   * faces are a map rather than a tuple: a two-die table has no face 1 and the
   * middle of it is far likelier than the ends.
   */
  | { op: "roll"; faces: Record<number, Effect>; dice?: 2 }
  | { op: "points"; stat: "sword" | "magic" | "life" | "gold"; delta: number; target?: Target }
  /**
   * Restores Życie but no higher than the four a character starts with (4.7) —
   * Cudotwórca, Księżniczka, the Zamek's Medyk.
   *
   * `price` is what one restored point costs, where it costs anything: the
   * Osada's Medyk asks "za każdą Sztukę Złota przywróci ci 1 punkt Życia" and
   * the Pustelnik "1 Sz. Z. za każdą wyleczoną ranę". Free healing leaves it
   * out. It matters because a character with two gold cannot buy back three
   * wounds, and that arithmetic is exactly what a table gets wrong.
   */
  | { op: "heal"; upTo: number; price?: number }
  /**
   * The other direction: Przedmioty handed back for gold. The Gród's Lichwiarz
   * pays a Sztuka Złota apiece, "odłóż ich Karty i weź po 1 Sz.Z. za każdy" —
   * and by 21.2 the card returning to its pile is the point, because it puts
   * the thing back within somebody's reach.
   */
  | { op: "sell"; price: number }
  | {
      op: "lose-turn";
      turns: number;
      target?: Target;
      /**
       * Character ids the effect passes over. The Zaklinacz Czasu's flute
       * stills everyone "z wyjątkiem Elfa, Hummita, Spryciarza, Czarodziejki
       * i Szczęściarza" — an exemption list is the card, not a footnote to it.
       *
       * `string` and not `CharacterId`, which is the only such exception in the
       * engine. Two of the five the card names — Czarodziejka and Szczęściarz —
       * are expansion characters and are not in this box, so they are not
       * `CharacterId`s and never will be while the scope is the base game.
       * Narrowing this would mean deleting them from the card, and the card is
       * what is being transcribed. They simply never match, which is correct.
       */
      except?: readonly string[];
    }
  | { op: "extra-move" }
  /**
   * Draws Zaklęcia, and where one is being sold, charges for it.
   *
   * The Sztukmistrz is the only seller: "mogą podczas każdej wizyty kupić u
   * niego 1 Zaklęcie za 1 Sztukę Złota". A price here rather than in `buy`
   * because `buy` sells Wyposażenie, and a Zaklęcie is not a thing on that
   * sheet — it comes off the pile, under 2.6's limit and 9.5's reshuffle, and
   * only the drawing knows whether either of those refused.
   *
   * Charged after the draw and only if it happened, which is the order that
   * matters: a Postać whose Magia allows no Zaklęcia must not pay to be told
   * so.
   */
  | {
      op: "gain-spell";
      count: number;
      price?: number;
      /**
       * Chosen off the pile rather than taken off the top.
       *
       * The PÓŁBÓG alone: „Możesz je wybrać ze stosu. Po wybraniu Karty
       * Zaklęcia, potasuj resztę Kart." Every other Zaklęcie in the box comes
       * off the top, and the difference is the whole of what makes him worth
       * meeting — a Zaklęcie you pick is not the same gift as one you are
       * dealt.
       */
      fromPile?: true;
    }
  /** "taką liczbę Zaklęć, na jaką pozwala ci twoja Magia" (Magiczna Tablica). */
  | { op: "spells-to-limit" }
  | { op: "move"; to: Destination }
  | { op: "draw-cards"; count: number }
  /** A creature attacks (usually from inside a die table). */
  | { op: "fight"; name: string; sword?: number; magic?: number }
  /**
   * A creature the caster conjures and sends at somebody else.
   *
   * The Golem (Miecz 3) and the Homunculus (Miecz 5), and the difference from
   * `fight` is who is in danger. `fight` is a creature that attacks *you* — a
   * die table's Duch, the Straż at a gate — and you fight it with everything
   * you have. This one is a creature that attacks *them*: „atakuje wybraną
   * Postać lub Wroga (w granicach Kręgu). Ofiara musi walczyć na zwykłych
   * zasadach", and the caster stands out of it with nothing at stake — „jeśli
   * zwycięży [ofiara] — nic się nie dzieje".
   *
   * Which is the wyprawa's shape exactly, and it is fought through the same
   * path: a fighter that is not the character, at a distance the character
   * never crosses. What it is not is a duel — neither side of it is the caster.
   */
  | { op: "summon"; name: string; sword: number }
  /**
   * A look at the top of a pile, for the caster's eyes only.
   *
   * Olśnienie: „Pozwoli Postaci obejrzeć w tajemnicy 5 pierwszych Kart Zdarzeń
   * ze stosu." Nothing about the game changes — the cards are not drawn, not
   * reordered and not spent — so this is the one effect that writes nothing at
   * all and whose whole product is what it says back.
   *
   * „W tajemnicy" is kept by where the answer goes rather than by any rule
   * here: what a command returns is the response to the device that asked, and
   * the journal line for a Zaklęcie says which card was spoken and never what
   * it showed.
   */
  | { op: "peek"; count: number }
  /**
   * Moves a Karta that is already lying on the board to another Obszar.
   *
   * Władca Zdarzeń: „będzie ci wolno zdjąć z planszy odkrytą Kartę Zdarzeń i
   * położyć ją na innym Obszarze w tym samym Kręgu. Nowy Obszar nie może być
   * zajęty przez inną Postać."
   *
   * Not `place-card`, which puts the card being *resolved* somewhere — the
   * Upiór rolling for which Obszar he haunts. This one takes a card nobody is
   * resolving, off a field the character is not standing on, and the player
   * points at both ends of it: which Karta, and which Obszar.
   */
  | { op: "move-card" }
  /**
   * Wipes a whole class of Karta off the acting seat's Krąg.
   *
   * Kometa alone: "Na Krainę, po której wędrujesz spada apokaliptyczna Gwiazda.
   * W katastrofie giną wszyscy Nieznajomi - należy odłożyć ich Karty." Not
   * `lose`, which takes something the *character* holds — this reaches for
   * Karty nobody has picked up yet, lying on squares the character may never
   * even have visited, and sends every one of them to the used pile at once.
   *
   * `reach` is a field of its own rather than a hardcoded ring, on the chance
   * a future card asks for less than a Krąg — Kometa is the only one
   * transcribed and it always says `krag`, the same Krąg `zaraza` and
   * `burza-siedmiu-slonc` already reach with a `target`.
   */
  | { op: "wipe"; cardClass: CardClass; reach: "krag" }
  /**
   * Throws back the Karta in front of you and turns over another.
   *
   * Odmiana Losu: „Pozwala na odrzucenie jednej z wyciągniętych Kart i
   * wyciągnięcie w zamian innej", spoken „natychmiast po wzięciu Karty
   * Zdarzenia".
   *
   * „Jednej z wyciągniętych" is the card being dealt with, which 15.2 makes
   * exactly one: cards drawn onto an Obszar are resolved in a fixed order, and
   * the one at the head of that order is the one in front of the player when
   * this may be spoken. So there is nothing to point at and no picker for a
   * stack that already has an order.
   */
  | { op: "redraw" }
  | {
      op: "lose";
      what:
        | "item"
        | "friend"
        | "spell"
        | "gold"
        | "all-items"
        | "all-spells"
        /**
         * Every Przyjaciel but the ones named. Only the Zły Duch: "Natychmiast
         * opuszczą cię wszyscy dotychczasowi Przyjaciele (z wyjątkiem
         * Południcy)" — and the exception is the card telling you these two are
         * meant to be met together. She is not a Przyjaciel anybody gained.
         */
        | "all-friends-except";
      /** Cards a sweeping loss leaves alone, by id. */
      except?: readonly CardId[];
      count?: number;
      /** Who picks which one goes: the holder, or chance. */
      chosenBy?: "you" | "random";
      target?: Target;
    }
  | { op: "stone" }
  /**
   * The Kuglarz's trade: Miecz points become Magia points or the other way
   * about. Not two `points` steps — the number swapped is the player's choice
   * and the two halves must move together or a character could take the gain
   * and refuse the cost.
   *
   * `from` is the side being spent, and it is part of the op rather than a second
   * question asked afterwards. „Zamienić twoje punkty Miecza na punkty Magii
   * **lub odwrotnie**" is two offers, and a card that showed one „Zamień
   * punkty" was hiding the only part of it a player actually decides — which
   * way round. There is no third direction and no „either", so the op cannot
   * be built without saying.
   */
  | { op: "swap-points"; from: "sword" | "magic" }
  /**
   * The Mędrzec's riddle: name a face aloud, then roll. Distinct from `roll`
   * because the guess comes first and is the whole game of it — a die table
   * would give away that five faces are worth nothing.
   */
  | { op: "guess"; prize: Effect }
  | { op: "set-nature"; to: Nature }
  /**
   * A shop. Targowisko lists eight Przedmioty with prices, the Sztukmistrz
   * sells Zaklęcia at one Sztuka Złota each, and the Gród and Osada do the same
   * from the board itself — so this is a shape the game uses repeatedly rather
   * than a special case for one card.
   */
  /*
   * `name` is the name printed on the Karta, not an id — „Miecz", „Hełm", „Kij i
   * Sznur" — because that is what the Obszar prints and this is a
   * transcription. `goodsId` is the one door from that name to an `ItemId`.
   */
  | { op: "buy"; goods: { name: string; price: number }[] }
  /**
   * "Możesz modlić się na takich samych zasadach, jak w Świątyni Nemed."
   *
   * Both Kapliczki borrow a temple's table wholesale rather than reprinting it.
   * Pointing at the field is more faithful than copying its outcomes, and it
   * cannot drift out of step with the field it borrows from.
   */
  | { op: "as-field"; fieldId: FieldId }
  /**
   * Puts the *card* somewhere, which is not the same as moving a character.
   *
   * The Upiór rolls for which of six fields he haunts; the Eremita rolls for
   * where he settles; the Lewiatan takes whichever crossing is free. Encoding
   * any of these as `move` would teleport the player who drew the card,
   * which is a different and wrong game.
   */
  | { op: "place-card"; where: Destination }
  /**
   * A specific named thing rather than a point: the Eremita offers a Magiczny
   * Miecz or a Tarcza Tolimana, and two temples give the same two away. Both
   * are finite — "jeśli jeszcze są" — which is why the name matters and a
   * generic "+1 Przedmiot" would not do.
   */
  | { op: "receive"; what: string }
  /**
   * Puts the character under something that lasts (`status.ts`).
   *
   * The gap this fills was the oldest one in the vocabulary: `seat_effects` and
   * the whole Modifier/Ends model existed, `movementCap` was read by the
   * movement rules, and nothing in any card or Obszar could *cause* one — the
   * only way into the table was the test console's `effect` shortcut. So the
   * Mgła machinery worked and the Mgła card could not reach it.
   *
   * The two Świątynie are the first callers: "zostałeś opętany, pozostaniesz
   * tu, dopóki nie wyrzucisz 1, 2 lub 3 oczka" is a cap of nought on how far
   * you may walk, held until something lifts it.
   */
  | {
      op: "status";
      label: string;
      modifier: Modifier;
      ends: Ends;
      /**
       * Who it lands on, where it is not only the one it happened to.
       *
       * The Wojna Żywiołów is the first: „żaden gracz, łącznie z tobą" is
       * `everyone`, and the same three words `points`, `lose` and
       * `lose-turn` have carried since the Burza. Absent, it lands on the
       * seat the effect is being applied to, which is every other card.
       */
      target?: Target;
    }
  /**
   * One die per card of a kind, each thrown for that card alone.
   *
   * Both Urwiska: "Rzuć także za każdego z Przyjaciół: 1 lub 2 oczka Przyjaciel
   * traci Życie (odłóż jego kartę)." Not a `lose` — nobody chooses and no
   * single card is at stake — and not a `roll`, whose one die decides one
   * outcome for the whole seat. A character with four Przyjaciele throws four
   * times and may lose all of them or none.
   *
   * `lostOn` is the highest face that loses the card. The Kamienny Most's
   * fall is the same shape with the polarity reversed — there 1 and 2 are what
   * *keeps* a card — and it is left in `bridge.ts` where its own rule lives,
   * because it reaches for Przedmioty as well and 14.5 states it separately.
   */
  | { op: "roll-for-each"; what: "friend" | "item"; lostOn: number }
  /**
   * Rid of a named card and everything it was doing to you.
   *
   * "Nie możesz zdobywać nowych Przyjaciół, dopóki nie uwolnisz się od niego,
   * odwiedzając Pustelnię. Po wizycie u Pustelnika odłóż Kartę." Both halves in
   * one op, because they are one act: the status it laid on you goes and the
   * Karta goes with it, and a card whose weight had lifted but which was still
   * in the pack would be a Przyjaciel doing nothing.
   *
   * The Południca ends the same way on a crossing — that one is `Ends` raising
   * an event rather than an Obszar offering a cure, which is the difference
   * between shaking something off and being freed of it.
   */
  | { op: "release"; from: CardId }
  /**
   * Takes a card off somebody else and gives it to the caster.
   *
   * Three Zaklęcia do it and they differ only in what they reach for: the Pan
   * Bogactwa "zabrać wybranej Postaci jeden Przedmiot lub jedną Sztukę Złota",
   * the Pan Przyjaciół "jednego z Przyjaciół i dołączyć go do swoich", and
   * Szaleństwo "jedno z należących do niej Zaklęć".
   *
   * Distinct from `lose`, which destroys: what is taken here changes hands
   * and is still in the game. That difference is the whole of the Pan
   * Przyjaciół — a Przyjaciel who went to the used pile would be no use to
   * anybody, and the card says "dołączyć go do swoich".
   *
   * Which card goes is the victim's to choose under 5.6, except for Szaleństwo,
   * whose own text hands the choice to the caster: "obejrzeć Zaklęcia i wybrać
   * jedno z nich" — the one place a hand held under 9.3 is opened to somebody
   * else.
   */
  | {
      op: "take";
      what: "item" | "friend" | "spell" | "item-or-gold";
      /** Who picks. Defaults to the victim, which is 5.6's rule. */
      chosenBy?: "victim" | "caster";
    }
  /** Only happens to some characters (Posłańcy Bogów, Sabat Czarownic). */
  | { op: "when"; condition: Condition; then: Effect; else?: Effect };

/** A test a card applies before doing anything. */
export type Condition =
  | { is: "nature"; oneOf: Nature[] }
  | { is: "threshold"; stat: "sword" | "magic"; below: number }
  | { is: "has-gold" }
  /**
   * Whether this character has attacked another during the game.
   *
   * The Dobre Bóstwo alone: "Jeśli podczas tej rozgrywki zaatakowałeś inną
   * Postać lub użyłeś swoich zdolności na jej niekorzyść". Every other
   * condition in the box asks what is true of a character now; this one asks
   * what they did, which is why 13.3 leaves a mark for it to read.
   *
   * The second half — „lub użyłeś swoich zdolności na jej niekorzyść" — is
   * 13.3's other form of meeting: „Postać która właśnie weszła na dany Obszar
   * może zaatakować Postać, która już się tam znajduje (17.6-10.) **lub użyć w
   * stosunku do niej swoich specjalnych zdolności**." Five Charakterystyki
   * carry one, and all five are used *instead of* attacking:
   *
   * ```
   * AWANTURNIK      „Zamiast atakować spotkaną Postać… zabrać jej 1 Zaklęcie"
   * QUARK           „Zamiast atakować… możesz rzucić na nią urok"
   * WIEDŹMA         „rzucić urok na napotkaną Postać lub z nią walczyć"
   * SPRYCIARZ       „Od napotkanej Postaci możesz próbować wyłudzić 1 Sz. Z."
   * BŁĘDNY RYCERZ   „Każdej napotkanej Postaci możesz odebrać Krzyżowca i Giermka"
   * ```
   *
   * Not the ones that follow a fight — the Troll's eviction, the Zdobywca's two
   * points, the Łotr's dishonest roll, the Kat's beheading. Those are part of
   * an attack and the first half of the condition already has them.
   *
   * None of the five is encoded yet, so nothing marks for this half and the
   * Bóstwo currently under-judges: a Wiedźma who cursed somebody walks free.
   * When one is written it writes the same `attacker` status `attackSeat` does,
   * and this needs no change.
   */
  | { is: "attacker" };

/**
 * Every encoded card, gathered from the per-class modules.
 *
 * Split by card class because the classes are genuinely different work — a
 * Miejsce is a fixture, a Spotkanie is an event, a Wróg is a fight — and
 * because it lets several people encode different parts of the deck without
 * meeting in the same file.
 *
 * Absent is the normal state and always will be for some of the deck. A card
 * with no script shows its text, exactly as before.
 */
export const SCRIPTS: Readonly<Partial<Record<CardId, CardScript>>> = {
  ...NIEZNAJOMI,
  ...MIEJSCA,
  ...SPOTKANIA,
  ...WROGOWIE,
  ...PRZEDMIOTY,
};

/**
 * Whether a card is spent by being resolved rather than kept.
 *
 * Answers "no, this is an ordinary card" for anything with no script, which is
 * most of the box.
 */
export function isConsumedOnResolve(cardId: CardId): boolean {
  return scriptFor(cardId)?.consumed === true;
}

/**
 * Whether this card's instruction sends it to a named Obszar (15.1).
 *
 * "Karty, które zgodnie z ich instrukcją powinny zostać położone na konkretnym
 * Obszarze, niezależnie od tego, gdzie zostały wyciągnięte" — three cards in
 * the box: the Lewiatan, the Upiór and the Eremita, whose die tables send them
 * to water, to the Osada and to the Bezdroża.
 *
 * Asked of `onDraw`, which is that instruction and nothing else. It used to be
 * a `JSON.stringify(effect).includes('"place-card"')` — the whole script
 * searched as text, because the placement was buried inside a `roll` inside a
 * `sequence` and there was no field to ask. A card that is asked "do you send
 * yourself somewhere" now answers from the one place that says so.
 *
 * Read off the script rather than listed, so a fourth transcribed tomorrow is
 * ordered correctly without anybody remembering this rule exists.
 */
export function goesToAField(cardId: CardId): boolean {
  return scriptFor(cardId)?.onDraw !== undefined;
}

/**
 * Which of a Karta's two instructions is the one being carried out now.
 *
 * 15.1 is a *draw-time* rule — the parenthesis scopes it to the turn the card
 * was turned over — so a Karta with a `onDraw` says one thing on the way to its
 * Obszar and another once it is there, and the only fact that tells the two
 * apart is where this copy came from: off the pile, or off the board.
 *
 * One function, so the server and the sheet cannot disagree about which
 * sentence is being read. Everything else about resolving is already shared
 * that way; a card that rolled for its Obszar on one side and offered a
 * Magiczny Miecz on the other would be the worst kind of divergence, because
 * both halves look right on their own.
 */
export function instructionIn(script: CardScript, lying: boolean | undefined): Effect {
  return !lying && script.onDraw ? script.onDraw : script.effect;
}

/**
 * Whether resolving this card re-opens the badanie by drawing more Karty.
 *
 * One card in the box: SKALNE WROTA, „wyciągnij 3 nowe Karty Zdarzeń". Read off
 * the script rather than named, the way `goesToAField` is, so a second one
 * transcribed tomorrow is ordered correctly without anybody remembering this
 * exists — and the whole script is searched, not just its top level, because
 * the next one may well reach `draw-cards` through a `roll` table.
 *
 * # Why the ordering needs it
 *
 * The card text does not say when you may go through, and the community read
 * — [forum.magiaimiecz.eu t=3660](https://forum.magiaimiecz.eu/viewtopic.php?t=3660)
 * — is that the three are a fresh badanie: „cofasz się do fazy badania obszaru
 * … Co, jakbyś został teleportowany na inny obszar" (Nemomon), „Po prostu
 * dostajesz nowe karty które rozpatrujesz **niezależnie** od rozpatrzonych już
 * kart" (Wiktor). The thread then finds the cheap way to get that: Misiek's
 * „Jeśli wylosowałeś Skalne Wrota wraz z innymi Kartami Miejsc, to rozpatrz je
 * jako ostatnie", which Wiktor turns into an erratum for the card — „**Po
 * rozpatrzeniu wszystkich kart**, jeżeli chcesz możesz przejść przez Skalne
 * Wrota".
 *
 * That is what makes appending correct. Resolved last, there is nothing left in
 * the kolejka when the three arrive, so joining the queue and opening a new one
 * are the same play — and the kolejka stays one frame per Obszar, which is what
 * `kolejka.ts` is built on and what keeps 13.4's count, `resolved`, `fought`
 * and `leaveCardsBehind` single-valued for one square.
 *
 * Skalne Wrota is a Miejsce (VI), the highest numeral, so 15.2 already puts it
 * behind everything **except another Miejsce drawn after it** — ties keep
 * arrival order. This is the key that closes that one case.
 */
export function reopensTheDrawing(cardId: CardId): boolean {
  const script = scriptFor(cardId);
  if (!script) return false;
  // Walked, not searched as text: it was `JSON.stringify(effect).includes(
  // '"draw-cards"')` for a while, which is a reader of the vocabulary that the
  // vocabulary cannot see.
  return nodesOf(script.effect).some((node) => node.op === "draw-cards");
}

/**
 * Whether what an effect does is in the reader's favour, or null where the card
 * does not settle it — `valenceOf` in `words.ts` reads it off each word.
 *
 * For the one line that needs it: a Karta whose whole content sits behind a
 * condition, and a panel that colours that condition green where the reader
 * meets it. Green is the right answer on every Przedmiot and every Nieznajomy,
 * because a condition on those gates a gift — and it is exactly backwards on a
 * Spotkanie, where a Natura usually names who *suffers*. ZAĆMIENIE SŁOŃC told a
 * Dobra Postać in green that she qualified, for a turn taken off her.
 */
export type Valence = "gain" | "loss";

export function scriptFor(cardId: CardId): CardScript | null {
  // Both ends are checked. The registry's *keys* are `CardId`, so a typo in one
  // of the ~250 card names above is a compile error; and so is the argument, so
  // the Postać CZARODZIEJ cannot be handed to the Nieznajomy's script. A stored
  // `card_id` becomes a `CardId` at `holdingsFor`, the way a stored `field_id`
  // becomes a `FieldId` at `seatsFor`.
  //
  // The registry is partial, so the contract is unchanged: nothing, for a card
  // nobody has transcribed.
  return SCRIPTS[cardId as CardId] ?? null;
}

/** Every field id a script names, for checking against the board. */
export function fieldsNamedBy(effect: Effect): FieldId[] {
  return nodesOf(effect).flatMap((node) => wordOf(node).fieldsNamed(node));
}

/**
 * A short, human phrasing of where the card ends up.
 *
 * This is the line the app most needs to say out loud. A table that resolves a
 * card correctly and then leaves it in the wrong place has still got the game
 * wrong, and nothing on the card is easier to skim past.
 */
export function describeDisposition(disposition: Disposition): string {
  switch (disposition.kind) {
    case "discard":
      return "Odłóż Kartę na stos użytych.";
    case "stays":
      return "Karta zostaje na tym Obszarze do końca gry.";
    case "stays-with-pool": {
      const stat =
        disposition.stat === "life" ? "Życia" : disposition.stat === "sword" ? "Miecza" : "Magii";
      return `Karta zostaje z ${disposition.points} punktami ${stat}; odłóż ją, gdy się wyczerpią.`;
    }
    case "until-first-visitor":
      return "Karta czeka tu na pierwszą Postać, potem ją odłóż.";
    case "kept":
      return "Bierzesz Kartę ze sobą.";
    case "after-turns":
      return `Karta działa przez ${disposition.turns} ${
        disposition.turns === 1 ? "turę" : "tury"
      }, potem ją odłóż.`;
    case "back-to-pile":
      return "Karta wraca do stosu — potasuj.";
  }
}
