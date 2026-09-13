/** What a card does while you are holding it, as a typed vocabulary rather than prose to be re-read every time. */

import type { Nature } from "@/data/types";
import type { FieldId } from "./board";
import type { CardId, SpellId } from "@/data/ids";
import { KARTY } from "./content/index";
import { heldOf, notesOf } from "./karta";

/**
 * Why this exists, and why it is not one big "effect" type.
 *
 * Reading the corpus, cards fall into three quite different shapes. A Spotkanie
 * happens once and is gone. A Miejsce sits on a field and offers something to
 * whoever arrives. And a Przedmiot or Przyjaciel is a *standing rule* that
 * changes how the other rules evaluate — "nie musisz wykonywać rzutów kostką w
 * Wieży Przeznaczenia", "nie będziesz musiał płacić 1 Sztuki Złota za
 * Przeprawę", "Koń może nieść 8 twoich Przedmiotów".
 *
 * Only the third shape is modelled here, because only the third shape is
 * something the engine has to consult while resolving something else. Trying to
 * cover all three with one union produced a type where most cases were
 * meaningless in most contexts.
 *
 * The vocabulary below was derived from the printed text, not invented: every
 * variant is there because at least one card needs it, and the parameters are
 * the ones the cards actually vary. Hełm, Tarcza and Zbroja differ only in how
 * high a roll saves you, so they are one variant with a number.
 */
/**
 * What an escape is being attempted *from* (19.1, 19.2).
 *
 * The rulebook keeps these apart and so must the code: 19.2 permits fleeing
 * "każdą istotą (lub Postacią)", but the two are reached by different means.
 * Every printed ability covers Wrogowie only; a Postać is the Krąg Płomieni's
 * business, and on the Kamienny Most 19.3 allows nothing else.
 */
export type EscapeTarget = "foe" | "character";

export type Ability =
  /**
   * Points a held card lends its owner (1.5, 2.5).
   *
   * `fightOnly` is the difference between the two figures the rulebook quotes
   * for the same character. Its worked example under 1.5 gives the Troll a
   * "parametr Miecza równy 8" and "podczas walki 11 punktom" — the Miecz card
   * and the Krzyżowiec count in a fight and nowhere else, and the printed text
   * says so in as many words ("podczas walki", "podczas każdej walki").
   *
   * It matters off the battlefield too: 14.5 has the Pułapka subtract "wartość
   * swojego parametru Miecza", which is the 8.
   */
  | { kind: "points"; sword?: number; magic?: number; fightOnly?: true }
  /**
   * A point of Życie off every opponent you beat (Excalibur).
   *
   * "Po każdej zwycięskiej walce Postać zyskuje także 1 punkt Życia (zabierając
   * ten punkt pokonanemu przeciwnikowi)." The parenthesis is bookkeeping rather
   * than flavour: in a duel the point really does leave the other Postać, which
   * makes a lost duel against Excalibur cost two. Against a Wróg there is no
   * track to take it from and the winner simply gains one.
   *
   * A gain and not healing, so 4.7's ceiling of four does not apply — 4.6 caps
   * only what a Uzdrowiciel restores.
   */
  | { kind: "takes-life"; life: number }
  /**
   * A save against the point of Życie a lost fight costs: Hełm on a 1, Tarcza on
   * 1-2, Zbroja on 1-3. The fight is still lost either way.
   */
  | { kind: "shield"; upTo: number }
  /**
   * The Kryształ Magów's first and third clauses: its owner "nie może rzucać
   * ani używać Zaklęć", and an opponent fighting them may not use the named
   * one against them.
   *
   * The middle clause — "całkowicie odporny" to six named ones — used to live
   * here too as `odpornyNa`, read by nothing (`spellWards` had zero callers).
   * It is `immune-to-spell` now, the door the two Talizmany already open,
   * so immunity is asked the one way the app asks it anywhere: of the victim,
   * at the one cast door. `opponentWithout` is this ability's alone because it
   * is not immunity — it is a ban on a spell an *opponent* would otherwise be
   * free to cast on themselves, which `immune-to-spell` has no shape for.
   */
  | { kind: "no-spells"; opponentWithout: readonly SpellId[] }
  /**
   * Passes a named field without what it normally does to you. `roll` skips a
   * field's die roll entirely (Opiekun, Przewodnik); `life` keeps the point it
   * would cost (Rękawice on Ruchome Skały); `loss` keeps the Przedmiot or
   * Przyjaciel it would take (Kij i Sznur on Bagna).
   */
  | {
      kind: "safe";
      fields: readonly FieldId[];
      from: "roll" | "life" | "loss";
      /**
       * Some protections are conditional on who is holding them: the Relikwiarz
       * spares a Dobra Postać at the Czarci Młyn and a Zła one at the Studnia
       * Wieczności, and nobody at the other. Without this the card would have to
       * be encoded as sparing everyone at both fields, or not at all.
       */
      nature?: readonly Nature[];
    }
  /**
   * Reliably slips away on named fields (Elf, Hobgoblin, Obbol, Elflin, Rusałka).
   *
   * `from` is *what* may be fled, and it defaults to Wrogowie because every
   * card that grants this says so in as many words — "możesz wymykać się
   * **Wrogom** na Równinach". 19.1 and 19.2 both also allow fleeing another
   * Postać, and nothing printed on a character or a friend does it: that is the
   * Krąg Płomieni's alone. Without this the check could not tell the two apart,
   * and an Elf standing on a Równina escaped a duel on the strength of an
   * ability about monsters.
   */
  | { kind: "escape"; fields: readonly FieldId[]; from?: readonly EscapeTarget[] }
  /**
   * Raises the four-Przedmiot limit of 5.4 by a stated amount — Koń eight, Muł
   * and Tragarz four apiece, Magiczna Sakwa five. Only the Zaprzęg is actually
   * unbounded ("możesz przewozić dowolną liczbę Przedmiotów"), which is why
   * that is a separate value rather than a very large number.
   */
  | {
      kind: "capacity";
      items: number | "unlimited";
      /**
       * The carrier does not fill one of the places it opens.
       *
       * "(sama Sakwa nie jest liczona jako Przedmiot)" — the Magiczna Sakwa
       * says it and nothing else in the box does, which I checked against every
       * card text in all three decks. Without it she is +5 that costs one of
       * your four, and a net +4 is not what the card offers.
       *
       * A flag on the ability rather than a set beside `RELICS`, because it is
       * a fact about *this carrier* rather than about a class of card: a Koń
       * takes up room in your hands and says nothing to the contrary.
       */
      doesNotCount?: true;
      /**
       * What it carries goes with it.
       *
       * "Utrata Sakwy oznacza jednocześnie utratę wszystkich niesionych w niej
       * Przedmiotów" and the Tragarz's own "jeśli stracisz go w jakiś sposób,
       * przepadną również niesione przez niego Przedmioty" — only these two
       * say it. A Koń, a Muł and a Zaprzęg lost the same way leave their load
       * behind on the Obszar (5.5, 5.6); these two take it with them, which is
       * why `overflow.ts` needs to tell the four apart rather than treating
       * every `capacity` carrier alike.
       */
      lostWithIt?: true;
    }
  /** Zaprzęg adds one to the movement roll; Wierzchowiec one to three. */
  | { kind: "move-bonus"; min: number; max: number }
  /** Bojowy Rumak: "do punktów Miecza możesz dodać swoje punkty Magii". */
  | { kind: "magic-to-sword" }
  /**
   * Dies in your place rather than you losing the point — the Bojowy Rumak
   * whenever you are beaten, the Giermek on a roll of one.
   *
   * `onlyWhenRaiding` is the Poszukiwacz Przygód, who is different in kind: he
   * dies only on the raid *he* was sent out on, not in your own fights. Without
   * the flag the engine would offer his life every time anyone lost anything,
   * which is a good deal more friend than the card describes.
   */
  | { kind: "dies-for-you"; onRollUpTo?: number; onlyWhenRaiding?: boolean }
  /** A key rather than a bonus: no Magiczny Miecz, no Kamienny Most. */
  | { kind: "required"; place: "most" | "zamek-bestii" }
  /**
   * Passes a field's toll without paying it. The Przewoźnik waives the
   * ferryman's Sztuka Złota; the Karzeł walks past the Strażnik Magicznych Wrót
   * without buying his way through. One shape, two tolls.
   */
  | { kind: "no-toll"; fields: readonly FieldId[] }
  /** Cards this character may not hold at all — the Pustelnik bears no blade. */
  | { kind: "forbidden"; cardIds: readonly CardId[] }
  /**
   * Shifts a die roll, either at named fields or in a kind of fight.
   *
   * Seven cards want this and they vary along exactly two axes: what the roll is
   * for, and by how much. The Talizman Ognia adds one in an ordinary fight and
   * the Talizman Powietrza in a magical one; the Gliniana Tabliczka takes two
   * off the Pułapka. The Jabłko Natchnienia is the odd one that lets the holder
   * choose the sign, and is eaten in the using.
   */
  | {
      kind: "roll-modifier";
      where:
        | { at: "fields"; fields: readonly FieldId[] }
        | { at: "fight"; kind: "ordinary" | "magical" };
      delta: number;
      /** "odjąć lub dodać 1 ... jeśli taka jest wola gracza" — the holder picks. */
      eitherSign?: boolean;
      /** "Karta Jabłka może być wykorzystana tylko raz". */
      once?: boolean;
    }
  /**
   * Raises the spell limit of 2.6 by a stated amount, exactly as `capacity`
   * raises the item limit of 5.4. Only the Różdżka Zaklęć does it.
   */
  | { kind: "spells-over-limit"; count: number }
  /**
   * Look at the first N Karty of the Zaklęcia and take the one you like.
   *
   * Only the Chochlik: "gdy będziesz chciał wziąć Zaklęcie, Przyjaciel pozwoli
   * ci obejrzeć pierwsze 2 Karty ze stosu i wybrać tę, która najbardziej ci
   * odpowiada." A number rather than a flag, because what the card grants is
   * how wide the look is, and a second such Przyjaciel would differ in exactly
   * that.
   */
  | { kind: "spell-peek"; count: number }
  /**
   * Named Zaklęcia do nothing to the holder.
   *
   * The two Talizmany, and they name their spells rather than a kind of magic:
   * "Talizman Ognia daje odporność na Zaklęcie Krąg Płomieni", "Talizman
   * Powietrza — na Siedem Wichrów i Władcę Gromu". A list of ids, because that
   * is what the cards print, and because guessing at a category would make the
   * Talizman Ognia proof against the Władca Lodu on a theory nobody wrote down.
   *
   * The immunity is the *victim's*, which is what makes it worth having as an
   * ability at all: it is read off whoever the Zaklęcie was aimed at, never off
   * the caster.
   */
  | { kind: "immune-to-spell"; spells: readonly SpellId[] }
  /**
   * Points at named Obszary, on whichever parameter the Obszar reads.
   *
   * "Właściciel Kości ma prawo dodać sobie 1 punkt Miecza lub Magii w Pułapce
   * albo Magicznej Pułapce." The "lub" is the holder's choice and it is moot
   * where it lands: each Pułapka compares exactly one of the two — the Pułapka
   * Miecz and the Magiczna Pułapka Magia (14.5, `BRIDGE_SIDE`) — so the point
   * goes on the one being read whichever the holder would have named.
   *
   * Distinct from `roll-modifier`, which moves the *dice*. Against three
   * dice and a threshold the two are arithmetically the same, and they are not
   * the same rule: this card says "punkt Miecza", and a rule written as a die
   * shift would be wrong the moment anything else read the number.
   */
  | { kind: "points-on-fields"; fields: readonly FieldId[]; points: number }
  /** Rusałka: one die at the Trzęsawiska instead of the usual two. */
  | { kind: "crossing-dice"; obstacle: "trzesawiska"; dice: number }
  /**
   * A Lichwiarz you carry with you: the Alchemik turns any Przedmiot into gold,
   * one for one, wherever the character happens to be standing.
   *
   * Same shape as the Gród's desk, and deliberately so — "proces ten jest
   * nieodwracalny" is exactly what selling a card means, and there is no reason
   * for the app to have two ways of doing it.
   */
  | { kind: "buys"; price: number }
  /**
   * A Przedmiot with a buyer of its own, named on the card.
   *
   * Not `buys`, which is a *desk* that takes anything at a flat rate — the
   * Gród's Lichwiarz, the Alchemik's pouch. This is the other way round: one
   * Karta with one price at one named Obszar, and the DIAMENT KRÓLÓW is the
   * only thing in the box that has it. "Może zostać sprzedany w Zamku za 5
   * Sztuk Złota."
   *
   * `fields` rather than a single id, the way `no-toll` carries the two
   * Przeprawy: nothing in the base game names two buyers, and a list costs
   * nothing and reads the same.
   */
  | { kind: "sells-at"; fields: readonly FieldId[]; price: number }
  /**
   * Paid to the winner of a duel in place of the punkt Życia 17.9 lets her take.
   *
   * The rule 17.9 leaves room for in its own parenthesis — "czemu może zapobiec
   * użycie odpowiednich Przedmiotów lub Zaklęć" — said from the Przedmiot's
   * end. What it costs to use is itself: the Karta changes hands.
   *
   * Read by `spoils.ts` rather than by a hand-written card id, so a second one
   * — an expansion, a house card — needs nothing but this line.
   */
  | { kind: "pays-for-loss" }
  /**
   * Łódź and Latarnia: cross anywhere rather than only at the two legal places
   * (11.2, 11.6). Both are consumed whether or not they are used.
   */
  | { kind: "crosses-anywhere"; obstacle: "trzesawiska" | "lodowy-las" }
  /** Księżniczka at the Zamek, Władca at the Twierdza: up to two Życia a visit. */
  | { kind: "healing"; field: FieldId; upTo: number }
  /**
   * Giving the Karta up where the friend belongs, for gold.
   *
   * "Jeżeli zrezygnujesz tam z jej Karty, otrzymasz 3 Sztuki Złota" — the same
   * offer on the Księżniczka and the Władca, each at their own Obszar. Its own
   * kind rather than a field on `healing`, because they are two different
   * things a card offers at one place: one you may do on every visit and one
   * you may do once, since it ends with the card on the used pile.
   */
  | { kind: "returned-at"; field: FieldId; price: number }
  /**
   * What it costs to take this friend at all, and what he does if you refuse.
   *
   * Three cards ask a price up front and each names its own consequence.
   * "Najemnik będzie twoim Przyjacielem, jeżeli zapłacisz mu 1 Sztukę Złota.
   * Jeśli odmówisz zapłaty, będzie czekał tu na bardziej hojną Postać" — so he
   * lies on the Obszar like anything else left behind (16.8). The Tragarz is
   * paid "przedtem" and otherwise "odejdzie na stos użytych Kart", which is the
   * exception: he does not wait. The Chochlik asks for a point of Życie rather
   * than gold.
   *
   * Taking the card *is* agreeing to the price — there is no third state
   * between paying and walking away, and walking away is already what leaving a
   * card on the Obszar means.
   */
  | {
      kind: "hiring-price";
      gold?: number;
      life?: number;
      /** Unpaid: waits where it lies (16.8), or goes to the stos zużytych. */
      ifUnpaid: "stays" | "leaves";
    }
  /**
   * Fights with its own points rather than lending you any — and the two cards
   * that do it are not doing the same thing.
   *
   * The Rycerz stands in for you at home: "będzie walczył zamiast ciebie w
   * każdej walce (również magicznej)", so his figure replaces yours whenever
   * anything attacks you. The Poszukiwacz Przygód never stands in for anybody.
   * He "posiada 3 punkty Miecza" and spends them on the raid you send him out
   * on, up to three Obszary away, and your own fights are still yours.
   *
   * `raidOnly` is the difference, and it has to be stated rather than
   * inferred: without it, reading the registry for "who fights for me" found
   * the Poszukiwacz too and quietly dropped a Barbarzyńca from Miecz 5 to the
   * 3 his friend raids with.
   */
  | { kind: "fights-for-you"; sword: number; magic: number; raidOnly?: true }
  /** The Magiczny Miecz cannot be picked up in the lower ring. */
  | { kind: "unavailable"; region: "dolny" }
  /**
   * May change Natura at will, rather than only when something changes it.
   *
   * 7.2 describes what happens *when* a Nature changes, not a choice anybody
   * gets to make: cards change it. Magog is the exception, and this is what
   * separates the one character who may reach for it from the twenty-six who
   * may not — so that in simulation the control can exist for him and for
   * nobody else, instead of being a hand-editing button for everyone.
   *
   * Still bounded by 7.3: once per turn.
   */
  | { kind: "any-nature" }
  /**
   * Only these Natures may possess the card (5.3).
   *
   * A requirement rather than a bonus, and the only one the base game states.
   * It was being read out of the card's prose by regex, which looked for
   * "jedynie" and "tylko" — and every card that has this restriction phrases it
   * the other way round, as a prohibition: "Włóczni nie mogą posiadać Złe
   * Postacie". So the search found nothing on all three of them and 5.3 went
   * unenforced on exactly the cards it exists for.
   *
   * Stated as who MAY hold it rather than who may not, because that is the
   * shorter list on all three and the one a player wants read out.
   */
  | { kind: "nature-only"; natures: readonly Nature[] }
  /**
   * Beats a whole class of enemy without fighting it at all.
   *
   * "Postać mająca Relikwiarz pokonuje wszystkie Demony, bez konieczności walki
   * z nimi." Not a combat bonus — no dice are thrown — so `points` and
   * `roll-modifier` both say the wrong thing about it.
   */
  | { kind: "beats-without-fight"; whom: "demons" }
  /**
   * A different bonus against particular enemies.
   *
   * Arondight and the Topór both add one point of Miecz, "a w walce z
   * Wilkołakiem - 2 punkty" — so this REPLACES the standing bonus against the
   * named foe rather than stacking with it. Two points in total, not three.
   *
   * `roll-modifier` cannot say this: its `where` knows fields and the kind
   * of fight, never who is being fought.
   */
  | { kind: "against"; whom: readonly CardId[]; sword?: number; magic?: number }
  /**
   * Points bought by the turn rather than lent for nothing (Najemnik).
   *
   * "Najemnik dodaje ci na jedną turę 3 punkty Miecza, ilekroć zapłacisz mu 1
   * Sztukę Złota. Płacić Najemnikowi można tylko raz na turę."
   *
   * Not `points`: a `points` bonus is simply true while the
   * card is held, and this one is false until somebody pays and false again a
   * turn later. It is an effect the friend sells you, which is why it lands in
   * `seat_effects` beside an Eliksir rather than in the held-card totals.
   *
   * `onceATurn` is the sentence that stops it being a money pump — without it
   * three Sztuki Złota buy nine points of Miecz in one fight.
   */
  | { kind: "for-a-fee"; price: number; sword?: number; magic?: number; onceATurn?: true }
  /**
   * Walks around with a Zaklęcie of its own (Krzyżowiec, Gnom).
   *
   * "weź Kartę Zaklęcia i połóż ją z Kartą Krzyżowca" — the card is drawn when
   * the Przyjaciel joins and lies with him, not in the hand. So 2.6 never
   * counts it, nothing that takes "your Zaklęcia" reaches it, and it leaves
   * when he does. That is what the `carried` holding kind is for.
   *
   * The two differ in the asking. The Krzyżowiec "użyje, gdy sobie tego
   * zażyczysz" and stays; the Gnom wants "1 Sztukę Złota" and then "zniknie
   * zabierając swoją zapłatę" — so `price` buys the casting and `vanishes` says
   * whether the friend survives having been asked.
   */
  | { kind: "carries-spell"; price?: number; vanishes?: true; mayView?: true };

/**
 * Rules the typed vocabulary cannot hold, written out instead.
 *
 * Same bargain `CHARACTER_NOTES` makes, for the same reason: the app says what
 * a card does either way, and is honest about which half it is enforcing. A
 * rule stated here is one the players apply themselves.
 *
 * The point of writing them at all is that the scan stops being load-bearing.
 * A fresh checkout has no card pictures, and a player should still be able to
 * read what they are holding.
 */
export const CARD_NOTES: Readonly<Partial<Record<CardId, readonly string[]>>> = {
  "poszukiwacz-przygod": ["atakuje Postać lub Wroga do 3 Obszarów stąd, po twoim ruchu"],
  // Both clauses are the engine's now — the sale is `sells-at` and the lost
  // duel is `spoils.ts` — so neither is here. See the note above: a rule stated
  // in CARD_NOTES is one the players apply themselves, and a card that keeps
  // its note after the engine takes the rule claims to be doing less than it
  // is. What the reader gets instead is the two `describeAbility` lines, which
  // is one fewer thing to keep in step.
  "tajemna-sakwa": [
    "1 Przedmiot włożony do Sakwy jest nie do odebrania — zabierze go tylko Pan Bogactwa",
  ],
  "eliksir-sily": ["+2 Miecza na 1 turę, potem odłóż Kartę"],
  "krysztal-losu": [
    "w walce rzut: 1 — tracisz 1 Życie; 2 — Kryształ niszczeje; 3 — nic; 4, 5, 6 — +1, +2, +3 do rzutu w tej walce",
  ],
  "owoc-jarzebiny-wiedzy": [
    "przed ciągnięciem Kart: ciągniesz o 1 więcej i odrzucasz jedną; raz",
  ],
  "rozdzka-przeznaczenia": [
    "napotkany Wróg staje się Przyjacielem na jedną walkę i dodaje swoje punkty; potem odłóż",
  ],
  "zwierciadlo-zniszczenia": [
    "innej Postaci −2 Miecza lub Magii, albo −1 i −1 — tylko z jej własnych punktów; raz",
  ],
  // The Karty that have moved to one file each — see `karta.ts`.
  ...notesOf(KARTY),
};

/**
 * Which cards have which standing rules.
 *
 * Keyed by card id, so all four printed Magiczne Miecze share one entry — they
 * are the same card and the deck holds four of them on purpose.
 *
 * Absence is not an error and never blocks play. A card with no entry keeps
 * working exactly as it did before this file existed: its text is shown and the
 * players apply it. That is the same progressive-enhancement bargain the rest of
 * the card data makes.
 */
export const ABILITIES: Readonly<Partial<Record<CardId, readonly Ability[]>>> = {
  // --- equipment ------------------------------------------------------------
  // "Miecz podczas walki dodaje właścicielowi 1 punkt Miecza."
  miecz: [{ kind: "points", sword: 1, fightOnly: true }],
  // "Sztylet podczas walki dodaje właścicielowi 1 punkt Miecza."
  sztylet: [{ kind: "points", sword: 1, fightOnly: true }],
  helm: [{ kind: "shield", upTo: 1 }],
  tarcza: [{ kind: "shield", upTo: 2 }],
  zbroja: [{ kind: "shield", upTo: 3 }],
  rekawice: [
    { kind: "safe", fields: ["ruchome-skaly-1", "ruchome-skaly-2"], from: "life" },
  ],
  "kij-i-sznur": [
    { kind: "safe", fields: ["bagna-1", "bagna-2"], from: "loss" },
  ],
  kon: [{ kind: "capacity", items: 8 }],
  mul: [{ kind: "capacity", items: 4 }],
  zaprzeg: [
    { kind: "capacity", items: "unlimited" },
    { kind: "move-bonus", min: 1, max: 1 },
  ],
  wierzchowiec: [{ kind: "move-bonus", min: 1, max: 3 }],
  "magiczna-sakwa": [{ kind: "capacity", items: 5, doesNotCount: true, lostWithIt: true }],
  // "Właściciel Kryształu nie może rzucać ani używać Zaklęć. Jest całkowicie
  // odporny na Zaklęcia: Krąg Płomieni, Fatum, Magia i Miecz, Golem, Pan
  // Bogactwa i Pan Przyjaciół. Przeciwnik właściciela Kryształu nie może
  // walcząc z nim użyć Zaklęcia Odrodzenie."
  "krysztal-magow": [
    { kind: "no-spells", opponentWithout: ["odrodzenie"] },
    {
      kind: "immune-to-spell",
      spells: [
        "krag-plomieni",
        "fatum",
        "magia-i-miecz",
        "golem",
        "pan-bogactwa",
        "pan-przyjaciol",
      ],
    },
  ],
  "bojowy-rumak": [{ kind: "magic-to-sword" }, { kind: "dies-for-you" }],
  lodz: [{ kind: "crosses-anywhere", obstacle: "trzesawiska" }],
  latarnia: [{ kind: "crosses-anywhere", obstacle: "lodowy-las" }],
  "magiczny-miecz": [
    { kind: "required", place: "most" },
    { kind: "unavailable", region: "dolny" },
  ],
  "tarcza-tolimana": [{ kind: "required", place: "zamek-bestii" }],

  // --- magic items ----------------------------------------------------------
  //
  // Several of these print an ownership restriction as well — the Miecz Chaosu
  // is closed to a Dobra Postać, the Graal and the Włócznia to a Zła one, the
  // Topór to a Chaotyczna. There is no variant for "who may hold this", so that
  // line stays on the card where the players can read it; what is encoded here
  // is only what the card does once it is held.
  //
  // The Arondight and the Topór print a second line too: two points of Miecza
  // rather than one when the fight is against a Wilkołak. The bonus below is
  // the one that applies in every other fight; the exception is left to the
  // text rather than half-encoded.
  arondight: [
    { kind: "points", sword: 1, fightOnly: true },
    { kind: "against", whom: ["wilkolak"], sword: 2 },
  ],
  // "nie może być w posiadaniu Chaotycznych Postaci" — a 5.3 restriction the
  // prose-reading version never found, because it is phrased differently again.
  "topor-swiatla-i-ciemnosci": [
    { kind: "nature-only", natures: ["good", "evil"] },
    { kind: "points", sword: 1, fightOnly: true },
    { kind: "against", whom: ["wilkolak"], sword: 2 },
  ],
  // "Miecz króla Artura użyty w walce dodaje 1 punkt Miecza. Po każdej
  // zwycięskiej walce Postać zyskuje także 1 punkt Życia (zabierając ten punkt
  // pokonanemu przeciwnikowi)." Both halves, now that there is a kind for the
  // second — without it the flag alone would have made Excalibur strictly worse
  // than a common Miecz.
  excalibur: [
    { kind: "points", sword: 1, fightOnly: true },
    { kind: "takes-life", life: 1 },
  ],
  // "Włóczni nie mogą posiadać Złe Postacie."
  "swieta-wlocznia": [
    { kind: "nature-only", natures: ["good", "chaotic"] },
    { kind: "points", sword: 1, fightOnly: true },
  ],
  // "Miecza Chaosu nie może posiadać Dobra Postać."
  "miecz-chaosu": [
    { kind: "nature-only", natures: ["evil", "chaotic"] },
    { kind: "points", sword: 2, fightOnly: true },
  ],
  "pierscien-mocy": [{ kind: "points", magic: 2 }],
  "srebrna-strzala": [{ kind: "points", sword: 1, magic: 1 }],
  /** "zyskuje 1 punkt Magii i nie traci 1 Życia przechodząc przez Ruchome Skały" — the second half is the Rękawice's rule. */
  // "Graala nie może posiadać Zła Postać."
  "swiety-graal": [
    { kind: "nature-only", natures: ["good", "chaotic"] },
    { kind: "points", magic: 1 },
    { kind: "safe", fields: ["ruchome-skaly-1", "ruchome-skaly-2"], from: "life" },
  ],
  /** The same key as the Tarcza Tolimana, printed again on the Zdarzenia sheets. */
  "tarcza-boga-tolimana": [{ kind: "required", place: "zamek-bestii" }],
  "gliniana-tabliczka": [
    { kind: "roll-modifier", where: { at: "fields", fields: ["pulapka"] }, delta: -2 },
  ],
  "magiczny-manuskrypt": [
    {
      kind: "roll-modifier",
      where: { at: "fields", fields: ["magiczna-pulapka"] },
      delta: -2,
    },
  ],
  // Both halves of the Kość, and they are two different rules: a point of
  // Miecza or Magii inside the two Pułapki, and a shift of the die everywhere
  // else on the Most.
  "czarodziejska-kosc": [
    { kind: "points-on-fields", fields: ["pulapka", "magiczna-pulapka"], points: 1 },
    {
      kind: "roll-modifier",
      where: {
        at: "fields",
        fields: [
          "wejscie-na-most-a",
          "gra-ze-smiercia",
          "demon-zaglady",
          "zamek-bestii",
          "monstrum",
          "cerber",
          "wejscie-na-most-b",
        ],
      },
      delta: 1,
    },
  ],
  "talizman-ognia": [
    { kind: "roll-modifier", where: { at: "fight", kind: "ordinary" }, delta: 1 },
    // "daje odporność na Zaklęcie Krąg Płomieni" — carried now that the Krąg is
    // a state the app applies rather than a sentence it reads out.
    { kind: "immune-to-spell", spells: ["krag-plomieni"] },
  ],
  "talizman-powietrza": [
    { kind: "roll-modifier", where: { at: "fight", kind: "magical" }, delta: 1 },
    { kind: "immune-to-spell", spells: ["siedem-wichrow", "wladca-gromu"] },
  ],
  "jablko-natchnienia": [
    {
      kind: "roll-modifier",
      where: {
        at: "fields",
        fields: ["swiatynia-bogini-nemed", "swiatynia-tolimana"],
      },
      delta: 1,
      eitherSign: true,
      once: true,
    },
  ],
  // Two protections in one card, each for the opposite Natura. The third
  // clause — beating every Demon without a fight — has no variant and stays on
  // the card.
  relikwiarz: [
    { kind: "safe", fields: ["czarci-mlyn"], from: "life", nature: ["good"] },
    { kind: "safe", fields: ["studnia-wiecznosci"], from: "life", nature: ["evil"] },
    // "pokonuje wszystkie Demony, bez konieczności walki z nimi" — the third of
    // its three rules, and the only one the card was not carrying.
    { kind: "beats-without-fight", whom: "demons" },
  ],
  "rozdzka-zaklec": [{ kind: "spells-over-limit", count: 1 }],

  // --- friends --------------------------------------------------------------
  // "1 Przedmiot zamienia się w 1 Sztukę cennego kruszcu."
  alchemik: [{ kind: "buys", price: 1 }],
  // "może zostać sprzedany w Zamku za 5 Sztuk Złota" — the one Karta in the box
  // with a buyer of its own. The other half of its text, the one about paying
  // for a lost duel with the Diament rather than a Życie, is still CARD_NOTES'.
  "diament-krolow": [
    { kind: "sells-at", fields: ["zamek"], price: 5 },
    // "Jeżeli przegrasz walkę z inną Postacią, będzie ci musiała odebrać
    // Diament, dzięki czemu nie utracisz 1 punktu Życia." 17.9's own
    // parenthesis is what it answers — "czemu może zapobiec użycie
    // odpowiednich Przedmiotów lub Zaklęć" — and `spoils.ts` is where it fires.
    { kind: "pays-for-loss" },
  ],
  pasterz: [{ kind: "points", sword: 1, magic: 1 }],
  strzyga: [{ kind: "points", magic: 1 }],
  chochlik: [
    { kind: "hiring-price", life: 1, ifUnpaid: "stays" },
    { kind: "points", magic: 2 },
    // "pozwoli ci obejrzeć pierwsze 2 Karty ze stosu i wybrać tę, która
    // najbardziej ci odpowiada" — the third of his three clauses.
    { kind: "spell-peek", count: 2 },
  ],
  giermek: [
    // "będzie dodawał ci 2 punkty Miecza podczas każdej walki".
    { kind: "points", sword: 2, fightOnly: true },
    { kind: "dies-for-you", onRollUpTo: 1 },
  ],
  // "będzie dodawał ci 2 punkty Miecza podczas każdej walki" — and the 1.5
  // example counts him only in the fight figure.
  // "Krzyżowiec posiada również 1 Zaklęcie, którego użyje, gdy sobie tego
  // zażyczysz (weź Kartę Zaklęcia i połóż ją z Kartą Krzyżowca)."
  krzyzowiec: [
    { kind: "points", sword: 2, fightOnly: true },
    { kind: "carries-spell" },
  ],
  // "dodaje ci na jedną turę 3 punkty Miecza, ilekroć zapłacisz mu 1 Sztukę
  // Złota. Płacić Najemnikowi można tylko raz na turę."
  najemnik: [
    { kind: "hiring-price", gold: 1, ifUnpaid: "stays" },
    { kind: "for-a-fee", price: 1, sword: 3, onceATurn: true },
  ],
  // "Gnom posiada 1 Zaklęcie (weź Kartę Zaklęcia i połóż ją razem z Kartą
  // Gnoma - wolno ci ją obejrzeć). Gnom wypowie Zaklęcie, gdy ofiarujesz mu 1
  // Sztukę Złota, a następnie zniknie zabierając swoją zapłatę."
  gnom: [{ kind: "carries-spell", price: 1, vanishes: true, mayView: true }],
  tragarz: [
    { kind: "hiring-price", gold: 1, ifUnpaid: "leaves" },
    { kind: "capacity", items: 4, lostWithIt: true },
  ],
  przewoznika: [{ kind: "no-toll", fields: ["przeprawa-1", "przeprawa-2"] }],
  rycerz: [{ kind: "fights-for-you", sword: 3, magic: 3 }],
  /**
   * Deliberately no `points`: the Poszukiwacz "posiada 3 punkty Miecza" of his
   * own and spends them on the raid you send him on, unlike the Giermek and the
   * Krzyżowiec who "dodają ci" theirs. And no `fights-for-you` either — he
   * does not stand in for you in your fights, he goes out up to three Obszary
   * and attacks something, which nothing here can say. What is left, and what
   * the printed text is unambiguous about, is that his failure costs him rather
   * than you.
   */
  "poszukiwacz-przygod": [
    // "posiada 3 punkty Miecza" — the strength it raids with, which nothing said.
    { kind: "fights-for-you", sword: 3, magic: 0, raidOnly: true },
    { kind: "dies-for-you", onlyWhenRaiding: true },
  ],
  opiekun: [
    { kind: "safe", fields: ["wieza-przeznaczenia", "urwisko-1", "urwisko-2"], from: "roll" },
  ],
  przewodnik: [
    {
      kind: "safe",
      fields: ["krag-mocy", "wilczy-parow", "krypta-upiorow"],
      from: "roll",
    },
  ],
  elflin: [
    { kind: "safe", fields: ["urwisko-1", "urwisko-2"], from: "roll" },
    {
      kind: "escape",
      fields: ["bezdroza", "wrzosowiska", "rownina-samotnych-skal", "kamienny-las"],
    },
  ],
  rusalka: [
    { kind: "safe", fields: ["kurhan"], from: "roll" },
    { kind: "escape", fields: ["mokradla-1", "mokradla-2", "las-blednych-ogni"] },
    { kind: "crossing-dice", obstacle: "trzesawiska", dice: 1 },
  ],
  ksiezniczka: [
    { kind: "healing", field: "zamek", upTo: 2 },
    { kind: "returned-at", field: "zamek", price: 3 },
  ],
  wladca: [
    { kind: "healing", field: "twierdza-strzegaca-drog", upTo: 2 },
    { kind: "returned-at", field: "twierdza-strzegaca-drog", price: 3 },
  ],
  // The Karty that have moved to one file each — see `karta.ts`.
  ...heldOf(KARTY),
};

export function abilitiesOf(cardId: CardId): readonly Ability[] {
  // Both ends are checked now. The registry's *keys* are `CardId`, so a typo in
  // one of the ~250 card names above is a compile error; and the argument is a
  // `CardId` too, so a Postać cannot be asked what a Karta of the same name
  // does. `czarodziej` and `demon` each name both, and this took the parameter
  // as a plain string for as long as it was fed ids straight off the wire.
  // It is not any more: a stored `card_id` becomes a `CardId` at `holdingsFor`,
  // the way a stored `field_id` becomes a `FieldId` at `seatsFor`.
  //
  // The registry is still partial, so the contract is unchanged: nothing, for a
  // card that has no standing rule.
  return ABILITIES[cardId] ?? [];
}

/** Every standing rule a seat is currently holding. */
export function heldAbilities(cardIds: readonly CardId[]): Ability[] {
  return cardIds.flatMap((cardId) => abilitiesOf(cardId));
}

/**
 * Whether a field's die roll can simply be skipped.
 *
 * Deliberately narrow: this answers only "does the roll happen", never "what
 * would it have given". A character with the Opiekun walks past the Wieża
 * Przeznaczenia; it does not roll and then ignore the result, because some of
 * those tables do things a skipped roll should not do.
 */
export function skipsRollAt(abilities: readonly Ability[], fieldId: FieldId): boolean {
  return abilities.some(
    (ability) =>
      ability.kind === "safe" &&
      ability.from === "roll" &&
      ability.fields.includes(fieldId),
  );
}

/** Whether a field's automatic cost is waived — the point, or the thing taken. */
export function isSpared(
  abilities: readonly Ability[],
  fieldId: FieldId,
  from: "life" | "loss",
  /** The holder's Natura, for the protections that depend on it. */
  natura?: Nature | null,
): boolean {
  return abilities.some(
    (ability) =>
      ability.kind === "safe" &&
      ability.from === from &&
      ability.fields.includes(fieldId) &&
      (!ability.nature || (natura != null && ability.nature.includes(natura))),
  );
}

/**
 * How much a character may shift a die roll here.
 *
 * Returns the total and whether the holder may choose its sign. Modifiers add:
 * nothing in the texts says two of them cannot apply at once, and the two
 * Talizmany are for different kinds of fight anyway.
 */
/**
 * The Krainy a card cannot be picked up in.
 *
 * "Miecza nie można otrzymać w Krainie Dolnego Kręgu" — a property of the card
 * rather than of the character, so it is asked by id and not off a hand.
 */
/**
 * Cards whose bonus changes against particular Wrogowie, and what it becomes.
 *
 * "Miecz Lancelota użyty w walce dodaje właścicielowi 1 punkt Miecza, a w walce
 * z Wilkołakiem - 2 punkty Miecza." The second figure REPLACES the first rather
 * than adding to it — two points against a Wilkołak, not three — so the caller
 * gets what the card is worth here and subtracts what it is worth ordinarily.
 * Returning a delta instead would need this to know the standing bonus, which
 * lives with the deck and not with the abilities.
 */
/**
 * The Wrogowie the Relikwiarz walks through: "pokonuje wszystkie Demony, bez
 * konieczności walki z nimi."
 *
 * Written out rather than matched on the printed name. Two cards in the box are
 * Demons, and a search for "DEMON" in a title would also have to decide about
 * the Demon Zagłady on the Kamienny Most — which 14.6 makes a guardian standing
 * in a doorway rather than a Wróg drawn onto an Obszar, and which the bridge
 * settles by its own rules. It is not on this list because beating it without a
 * fight would walk a character across the bridge for free.
 */
const DEMONY: ReadonlySet<CardId> = new Set<CardId>(["demon", "ksiaze-demonow"]);

/** Whether a held card beats this Wróg outright, without a fight being fought. */
export function beatsWithoutFighting(
  cardIds: readonly CardId[],
  foeId: CardId,
): CardId | null {
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind !== "beats-without-fight") continue;
      if (ability.whom === "demons" && DEMONY.has(foeId)) return cardId;
    }
  }
  return null;
}

export function insteadAgainst(
  cardIds: readonly CardId[],
  foeIds: readonly CardId[],
): { cardId: CardId; sword: number; magic: number }[] {
  const swapped: { cardId: CardId; sword: number; magic: number }[] = [];
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind !== "against") continue;
      if (!foeIds.some((foe) => ability.whom.includes(foe))) continue;
      swapped.push({ cardId, sword: ability.sword ?? 0, magic: ability.magic ?? 0 });
    }
  }
  return swapped;
}

export function unavailableIn(cardId: CardId): "dolny" | null {
  for (const ability of abilitiesOf(cardId)) {
    if (ability.kind === "unavailable") return ability.region;
  }
  return null;
}

export function rollModifier(
  abilities: readonly Ability[],
  at: { fieldId?: FieldId; fight?: "ordinary" | "magical" },
): { delta: number; eitherSign: boolean } {
  let delta = 0;
  let eitherSign = false;
  for (const ability of abilities) {
    if (ability.kind !== "roll-modifier") continue;
    const applies =
      ability.where.at === "fields"
        ? at.fieldId !== undefined && ability.where.fields.includes(at.fieldId)
        : at.fight !== undefined && ability.where.kind === at.fight;
    if (!applies) continue;
    delta += ability.delta;
    if (ability.eitherSign) eitherSign = true;
  }
  return { delta, eitherSign };
}

/** Extra Zaklęcia allowed over the limit rule 2.6 sets from Magia. */
export function spellsOverLimit(abilities: readonly Ability[]): number {
  return abilities.reduce(
    (extra, ability) =>
      ability.kind === "spells-over-limit" ? extra + ability.count : extra,
    0,
  );
}

/**
 * Whether a named Zaklęcie does nothing to whoever holds these cards.
 *
 * Asked of the victim, so the caster's own Talizman is no defence against
 * their own spell — which is right, and the only reading of "daje odporność"
 * that means anything.
 */
export function immuneToSpell(abilities: readonly Ability[], spellId: SpellId): boolean {
  return abilities.some(
    (ability) => ability.kind === "immune-to-spell" && ability.spells.includes(spellId),
  );
}

/**
 * How many Karty Zaklęć may be looked at before one is taken, or 0 for none.
 *
 * The widest on offer rather than a sum: two Chochliki do not let you see four,
 * because each of them says the same thing about the same top of the same
 * stos. `spellsOverLimit` adds because two wands really do raise the ceiling
 * twice; this is a look, and the wider look contains the narrower.
 */
/**
 * What a held card adds to the parameter this Obszar reads, standing here.
 *
 * Only the Czarodziejska Kość, and only in the two Pułapki. Summed rather than
 * maxed, because two such cards really would be two points — unlike a *look*
 * at a pile, where the wider contains the narrower.
 */
export function pointsAt(abilities: readonly Ability[], fieldId: FieldId | null): number {
  if (fieldId === null) return 0;
  return abilities.reduce(
    (points, ability) =>
      ability.kind === "points-on-fields" && ability.fields.includes(fieldId)
        ? points + ability.points
        : points,
    0,
  );
}

export function spellsPeeked(abilities: readonly Ability[]): number {
  return abilities.reduce(
    (widest, ability) =>
      ability.kind === "spell-peek" ? Math.max(widest, ability.count) : widest,
    0,
  );
}

/**
 * Whether a Charakterystyka or a held card gets you away from this, here (19.1).
 *
 * Two questions, not one. The field has to be named — every escape in the game
 * is bound to particular ground, and the Obbol who slips Wrogom on the Mokradła
 * fights them everywhere else. And what is being fled has to match: `from`
 * defaults to a Wróg because that is what all of them say.
 */
export function canEscapeAt(
  abilities: readonly Ability[],
  fieldId: FieldId,
  from: EscapeTarget = "foe",
): boolean {
  return abilities.some(
    (ability) =>
      ability.kind === "escape" &&
      ability.fields.includes(fieldId) &&
      (ability.from ?? WROGOWIE_ONLY).includes(from),
  );
}

/** What a printed escape covers when its card does not say otherwise. */
const WROGOWIE_ONLY: readonly EscapeTarget[] = ["foe"];

/** Whether this character walks past the toll charged on a given field. */
export function tollIsWaived(abilities: readonly Ability[], fieldId: FieldId): boolean {
  return abilities.some(
    (ability) => ability.kind === "no-toll" && ability.fields.includes(fieldId),
  );
}

/**
 * Who will buy this Przedmiot where its owner is standing, and for how much.
 *
 * Three buyers, in the order the sale is offered, and the order is the rule:
 *
 * 1. **The card's own.** "Może zostać sprzedany w Zamku za 5 Sztuk Złota" —
 *    one Karta, one price, one named Obszar, and the DIAMENT KRÓLÓW is the only
 *    thing in the box that has one. Asked first because a card that names its
 *    buyer has said what it is worth to him; asked *only where it names*, so at
 *    the Gród the Diament is not the Zamek's business and falls through to the
 *    Lichwiarz's flat 1 — a bad trade the rules plainly allow.
 * 2. **The Obszar's desk.** `sell`, printed on the board or arrived on a
 *    Karta that stayed; the caller has already looked, because looking needs a
 *    list of what is lying here and that is not this file's business.
 * 3. **A desk you brought with you.** The ALCHEMIK is a Lichwiarz in your bag
 *    and works wherever you happen to be standing.
 *
 * Written once, here, because two callers need the same answer and the answer
 * *is* the rule: `sellHolding` spends it and the browser draws it, and a
 * button offering 1 Sz. Z. for something the command sells for 5 is worse than
 * no button at all.
 *
 * Says nothing about whether the seller may trade at all — that is 12.1 and
 * 13.1, and `standingShopper`'s. This answers only "what is it worth here".
 */
export function buyerFor(
  cardId: CardId,
  /** Where the seller is standing; null before anybody has been placed. */
  fieldId: FieldId | null,
  /** What this Obszar's desk pays for anything, or null where there is none. */
  desk: number | null,
  /** Every Karta the seller is carrying, for a desk they are carrying too. */
  carrying: readonly CardId[],
): { price: number; from: "karta" | "obszar" | "sakwa" } | null {
  const named =
    fieldId === null
      ? undefined
      : abilitiesOf(cardId).find(
          (ability): ability is Extract<Ability, { kind: "sells-at" }> =>
            ability.kind === "sells-at" && ability.fields.includes(fieldId),
        );
  if (named) return { price: named.price, from: "karta" };
  if (desk !== null) return { price: desk, from: "obszar" };
  const pouch = heldAbilities(carrying).find((ability) => ability.kind === "buys");
  return pouch?.kind === "buys" ? { price: pouch.price, from: "sakwa" } : null;
}

/** Cards this character may never hold (its own Charakterystyka, 8.1). */
export function isForbidden(abilities: readonly Ability[], cardId: CardId): boolean {
  return abilities.some(
    (ability) => ability.kind === "forbidden" && ability.cardIds.includes(cardId),
  );
}

/**
 * How many Przedmioty may be carried, over rule 5.4's four.
 *
 * The bonuses add up: nothing in any of these texts says a character may not
 * lead a Koń and employ a Tragarz at once, and each states its own capacity.
 *
 * That capacity is the point. The engine used to read 5.4's "unless the
 * character has transport" as *unlimited* for any of them, which is far more
 * generous than what the cards say — the Koń carries eight, the Muł and the
 * Tragarz four each. Only the Zaprzęg is truly unbounded.
 */
/**
 * The best save a character has against the point of Życie a lost fight costs
 * (17.4: "może temu zapobiec użycie Przedmiotu lub Zaklęcia").
 *
 * The three cards that grant it are cumulative in reach rather than in number —
 * a Hełm saves on a 1, a Tarcza on 1-2, a Zbroja on 1-3 — so wearing all three
 * is one roll against the widest of them, not three rolls. Returns 0 when there
 * is nothing to roll for.
 */
/**
 * Spells an opponent fighting this character may not use — the Kryształ
 * Magów's third clause, "przeciwnik ... nie może ... użyć Zaklęcia Odrodzenie".
 *
 * Used to also collect an `immune` set off the same ability's `odpornyNa`,
 * which had zero callers anywhere in `src`: nothing asked a holder's own
 * abilities whether a spell landing on *someone else* should bounce, because
 * that question belongs to the victim, not this card. Immunity moved to
 * `immune-to-spell`, read by `immuneToSpell` at the one cast door — the
 * same door the two Talizmany already used. This half stays, because a
 * `deniedToOpponent` opponent is asked here for the first time, at the same
 * door: `castSpell` calls it on the *other* side of a duel to enforce the
 * Kryształ's ban on Odrodzenie.
 */
export function spellWards(abilities: readonly Ability[]): Set<string> {
  const deniedToOpponent = new Set<string>();
  for (const ability of abilities) {
    if (ability.kind !== "no-spells") continue;
    for (const id of ability.opponentWithout) deniedToOpponent.add(id);
  }
  return deniedToOpponent;
}

/** Whether holding this card costs one of the places it opens (5.4). */
export function fillsAPlace(cardId: CardId): boolean {
  return !abilitiesOf(cardId).some(
    (ability) => ability.kind === "capacity" && ability.doesNotCount === true,
  );
}

/** The most a Wierzchowiec or Zaprzęg may add to a movement roll. */
export function moveBonusRange(
  abilities: readonly Ability[],
): { min: number; max: number } | null {
  const bonuses = abilities.filter((a) => a.kind === "move-bonus");
  if (bonuses.length === 0) return null;
  return {
    min: Math.min(...bonuses.map((a) => (a.kind === "move-bonus" ? a.min : 0))),
    max: bonuses.reduce((sum, a) => sum + (a.kind === "move-bonus" ? a.max : 0), 0),
  };
}

export function opensTheWayTo(
  abilities: readonly Ability[],
  place: "most" | "zamek-bestii",
): boolean {
  return abilities.some((ability) => ability.kind === "required" && ability.place === place);
}

/* --------------------------------------------------------------------------
 * Przyjaciele (6.1-6.4), and the two things a friend does that no item does.
 *
 * The rulebook's own chapter on friends is about custody only — how you gain
 * one, that it lies face up, that you may hold any number, and how you lose
 * one. It never says a friend fights, adds points, or takes a hit for you.
 * Every one of those is printed on the individual card, which is why they are
 * read here off the ability registry rather than out of a numbered rule.
 * ----------------------------------------------------------------------- */

/**
 * The friend who fights in your place, with its own points (Rycerz).
 *
 * "Rycerz będzie walczył zamiast ciebie w każdej walce (również magicznej). Nie
 * może jednak używać twoich Zaklęć ani Przedmiotów." So this REPLACES the
 * character's combat figure rather than adding to it — the whole of it, own
 * points included, because the Rycerz is the one swinging.
 *
 * Null when nobody is standing in, which is the ordinary case.
 */
/**
 * A point of Życie taken off each beaten opponent, if anything held does that.
 *
 * Read off abilities rather than card ids, so it goes through `seatView` and
 * therefore through slotowy's "worn or it does nothing" — an Excalibur in the
 * Plecak wins you no Życie, for the same reason it lends no Miecz.
 */
export function stealsLife(abilities: readonly Ability[]): number {
  return abilities
    .filter((ability) => ability.kind === "takes-life")
    .reduce((sum, ability) => sum + (ability.kind === "takes-life" ? ability.life : 0), 0);
}

export function fightsForYou(
  abilities: readonly Ability[],
): { sword: number; magic: number } | null {
  const stand = abilities.find(
    (ability) => ability.kind === "fights-for-you" && !ability.raidOnly,
  );
  return stand && stand.kind === "fights-for-you"
    ? { sword: stand.sword, magic: stand.magic }
    : null;
}

/**
 * The friend you can send out, and what he is worth when he gets there.
 *
 * The other half of `fights-for-you`: a raider fights on his own account at
 * arm's length instead of standing in front of you, so he is found by a
 * different question and never answers this one at home.
 */
/**
 * What a friend charges to join, if he charges anything.
 *
 * Read at the moment of taking, and at the end of the turn by whatever decides
 * where an untaken card goes — the price and the consequence of not paying it
 * are one clause on the card and one ability here.
 */
export function entryPrice(
  abilities: readonly Ability[],
): { gold?: number; life?: number; ifUnpaid: "stays" | "leaves" } | null {
  for (const ability of abilities) {
    if (ability.kind === "hiring-price") {
      return { gold: ability.gold, life: ability.life, ifUnpaid: ability.ifUnpaid };
    }
  }
  return null;
}

export function raidsForYou(
  cardIds: readonly CardId[],
): { cardId: CardId; sword: number; magic: number } | null {
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind === "fights-for-you" && ability.raidOnly) {
        return { cardId, sword: ability.sword, magic: ability.magic };
      }
    }
  }
  return null;
}

/** Bojowy Rumak: "do punktów Miecza możesz dodać swoje punkty Magii". */
/**
 * The friend who walks around with a Zaklęcie, and what it takes to have it
 * spoken. Null when this character has nobody carrying one.
 */
export function carriesSpell(
  cardIds: readonly CardId[],
): { cardId: CardId; price: number; vanishes: boolean; mayView: boolean } | null {
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind !== "carries-spell") continue;
      return {
        cardId,
        price: ability.price ?? 0,
        vanishes: ability.vanishes ?? false,
        mayView: ability.mayView ?? false,
      };
    }
  }
  return null;
}

export function sellsPoints(
  cardIds: readonly CardId[],
): { cardId: CardId; price: number; sword: number; magic: number; onceATurn: boolean } | null {
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind !== "for-a-fee") continue;
      return {
        cardId,
        price: ability.price,
        sword: ability.sword ?? 0,
        magic: ability.magic ?? 0,
        onceATurn: ability.onceATurn ?? false,
      };
    }
  }
  return null;
}

export function addsMagiaToMiecz(abilities: readonly Ability[]): boolean {
  return abilities.some((ability) => ability.kind === "magic-to-sword");
}

/**
 * Who will die rather than let you lose the point of Życie, in the order asked.
 *
 * Two cards do this and they are not the same offer. The Bojowy Rumak is
 * certain — "Jeżeli zostaniesz pokonany zginie tylko twój Rumak, ty zaś nie
 * utracisz punktu Życia" — while the Giermek is a one-in-six: "rzuć kostką.
 * Wynik równy 1 oznacza, że zginął Giermek, ty zaś nie utraciłeś punktu."
 *
 * The rolled ones are offered first, and that ordering is a real decision
 * rather than an accident of iteration. Neither card is optional, so holding
 * both means one of them dies whatever happens; asking the Giermek first is the
 * literal reading of its trigger (the point is not yet saved when it rolls) and
 * it is the only order under which the Giermek can ever be the one to go.
 *
 * `raiding` is the Poszukiwacz Przygód, who is different in kind: he is spent
 * on the raid you send him out on and stands in for nothing at home. Without
 * the flag he would offer his life every time you lost a fight of your own.
 */
export function diesForYou(
  cardIds: readonly CardId[],
  { raiding = false }: { raiding?: boolean } = {},
): { cardId: CardId; onRollUpTo?: number }[] {
  const offers: { cardId: CardId; onRollUpTo?: number }[] = [];
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind !== "dies-for-you") continue;
      // A raider dies only on his own raid, and everyone else only off it.
      if ((ability.onlyWhenRaiding ?? false) !== raiding) continue;
      offers.push({ cardId, onRollUpTo: ability.onRollUpTo });
    }
  }
  return [
    ...offers.filter((offer) => offer.onRollUpTo !== undefined),
    ...offers.filter((offer) => offer.onRollUpTo === undefined),
  ];
}
