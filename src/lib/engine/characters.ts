/** What each of the 27 characters brings to the table, and what its own Charakterystyka does (8.1, 8.2). */

import type { Ability } from "./abilities";
import { isCharacterId, type CharacterId } from "@/data/ids";

/**
 * Rule 8.1 gives every character two to five printed powers, and until now the
 * app showed them and consulted none. They are the most visible thing in the
 * game — each player has theirs face up in front of them all evening.
 *
 * They are expressed in the *same* vocabulary as the cards, because most of
 * them are the same shapes: the Barbarzyńca is safe at the Urwisko exactly as
 * the Opiekun makes you safe there, the Karzeł walks past the Strażnik's toll
 * exactly as the Przewoźnik walks past the ferryman's. A separate character
 * vocabulary would have duplicated all of it and then drifted.
 *
 * What does not fit is left out and named in `CHARACTER_NOTES`, on the same
 * terms as the cards: the app says which powers it is carrying and which the
 * player has to remember, rather than going quiet and hoping.
 */
export const CHARACTER_ABILITIES: Readonly<Partial<Record<CharacterId, readonly Ability[]>>> = {
  barbarzynca: [
    {
      kind: "bezpieczny",
      fields: ["urwisko-1", "urwisko-2", "wilczy-parow"],
      from: "rzut",
    },
  ],
  elf: [
    { kind: "bezpieczny", fields: ["urwisko-1", "urwisko-2"], from: "rzut" },
    // "na Równinach" — all three of them.
    {
      kind: "ucieczka",
      fields: ["rownina-traw", "rownina-snu", "rownina-samotnych-skal"],
    },
  ],
  goblin: [
    { kind: "bezpieczny", fields: ["krag-mocy", "wilczy-parow"], from: "rzut" },
  ],
  hobgoblin: [
    { kind: "bezpieczny", fields: ["kurhan", "krypta-upiorow"], from: "rzut" },
    { kind: "ucieczka", fields: ["step-1", "step-2"] },
    // "Określając Miecz Kamiennego Potwora ... możesz odjąć 1 od wyniku rzutu."
    {
      kind: "modyfikator-rzutu",
      gdzie: { na: "pola", fields: ["ruiny-twierdzy"] },
      delta: -1,
    },
  ],
  hummit: [
    {
      kind: "bezpieczny",
      fields: ["krag-mocy", "urwisko-1", "urwisko-2"],
      from: "rzut",
    },
  ],
  troll: [{ kind: "bezpieczny", fields: ["krag-mocy", "kurhan"], from: "rzut" }],
  obbol: [
    { kind: "ucieczka", fields: ["mokradla-1", "mokradla-2"] },
    // The mirror of the Hobgoblin's, at the other bridge entrance.
    {
      kind: "modyfikator-rzutu",
      gdzie: { na: "pola", fields: ["wymarle-miasto"] },
      delta: -1,
    },
  ],
  karzel: [{ kind: "bez-oplaty", fields: ["straznik-magicznych-wrot"] }],
  pustelnik: [
    { kind: "magia-do-miecza" },
    { kind: "zakazane", cardIds: ["miecz", "sztylet", "helm", "zbroja"] },
  ],
  magog: [
    // "Możesz dowolnie zmieniać swoją naturę, jednak musi być ona określona
    // w każdym momencie gry." Carried by the app now rather than remembered:
    // it is the only reason a Natura control belongs on screen in simulation.
    { kind: "natura-dowolna" },
    // "Możesz dodać 1 ... w walkach rozgrywanych na Równinach."
    {
      kind: "modyfikator-rzutu",
      gdzie: {
        na: "pola",
        fields: ["rownina-traw", "rownina-snu", "rownina-samotnych-skal"],
      },
      delta: 1,
    },
  ],
};

/**
 * What a character owns before anybody rolls anything.
 *
 * Ten of the twenty-seven start with equipment, a spell or two, or a purse, and
 * the app gave every one of them a single Sztuka Złota and nothing else — which
 * is wrong from the first turn of every game, and wrong in the direction that
 * quietly flattens the characters into each other.
 *
 * `gold` overrides rule 3.2's single coin ("chyba, że jej Karta daje w tym
 * względzie inne instrukcje"); leaving it out means the default stands.
 */
export interface StartingKit {
  /** Card ids from the equipment sheet, taken as items. */
  items?: readonly string[];
  /** Zaklęcia dealt at setup (9.5). */
  spells?: number;
  gold?: number;
}

export const STARTING_KIT: Readonly<Partial<Record<CharacterId, StartingKit>>> = {
  "bledny-rycerz": { items: ["miecz", "zbroja"] },
  czarodziej: { spells: 2 },
  demon: { spells: 1 },
  hummit: { spells: 1 },
  kaplan: { spells: 1 },
  kaplanka: { spells: 2 },
  karzel: { spells: 2 },
  kat: { spells: 1, items: ["miecz"] },
  krasnolud: { items: ["tarcza", "sztylet"] },
  ksiaze: { items: ["helm", "miecz"], gold: 5 },
  lotr: { items: ["sztylet"] },
  mag: { spells: 2 },
  magog: { spells: 1 },
  quark: { spells: 1 },
  "rycerz-ciemnosci": { spells: 1, items: ["miecz"] },
  wiedzma: { spells: 1 },
  zdobywca: { items: ["miecz", "tarcza"] },
};

/**
 * The powers the app is NOT carrying, per character, in the words a player
 * needs to act on.
 *
 * Same bargain as the cards: silence would let a table assume the referee has
 * a power it does not have. Almost every character has at least one of these,
 * because the interesting half of a Charakterystyka is usually the half that
 * bends a rule rather than adds a number.
 */
export const CHARACTER_NOTES: Readonly<Partial<Record<CharacterId, readonly string[]>>> = {
  awanturnik: [
    "Zamiast atakować Postać możesz zabrać jej 1 losowe Zaklęcie.",
    "W walce rzucasz dwa razy i bierzesz wyższy wynik.",
  ],
  barbarzynca: [
    "Na Bagnach rzuć kostką: 1 lub 2 — nie tracisz Przedmiotu ani Przyjaciela.",
    "Wygrywając zaczepkę bez odbierania Życia możesz zaatakować tę Postać drugi raz.",
  ],
  "bledny-rycerz": [
    "Przegraną zwykłą walkę możesz powtórzyć raz; drugi wynik jest ostateczny.",
    "Z Excaliburem lub Świętym Graalem bierzesz o 1 Zaklęcie więcej i odrzucasz jedno.",
    "Każdej napotkanej Postaci możesz odebrać Krzyżowca i Giermka.",
  ],
  czarodziej: [
    "Musisz mieć zawsze co najmniej 2 Zaklęcia — dobierasz po rzuceniu przedostatniego.",
    "Możesz ignorować wyciągnięte Spotkania i Nieznajomych.",
    "Możesz ignorować Uroczą Diablicę.",
  ],
  demon: [
    "Ignorujesz napotkane Demony.",
    "Rzuć kostką przeciw każdemu Zaklęciu na ciebie: 1 lub 2 — ignorujesz je.",
    "Wygrywając walkę magiczną z Postacią możesz dodać zabrane Życie do swojego.",
  ],
  elf: [
    "Kończąc ruch na Równinie możesz iść dalej — raz na turę, bez badania Obszaru.",
  ],
  goblin: [
    "Nobbina możesz wziąć jako Przyjaciela; dodaje swój Miecz do twojego.",
    "Hadrona możesz przesunąć na wolny Obszar w swoim Kręgu; nie zaatakuje cię.",
  ],
  hobgoblin: ["Hadrona możesz wziąć jako Przyjaciela; dodaje swój Miecz do twojego."],
  hummit: [
    "W walkach na Stepie i w Dolinach dodajesz 1 do rzutu.",
    "Możesz ignorować Zaklętą Ścieżkę.",
    "Wilka albo Łosia możesz dosiąść — wtedy ruch określasz dwoma kostkami.",
  ],
  kaplan: [
    "Podczas modlitw możesz powtórzyć rzut; drugi wynik jest ostateczny.",
    "Demona możesz próbować pokonać egzorcyzmem: 1, 2 lub 3 — zwyciężasz.",
  ],
  kaplanka: [
    "Musisz mieć zawsze co najmniej 2 Zaklęcia.",
    "Bestie cię nie atakują.",
    "Łoś, Wilk lub Niedźwiedź zostaje Przyjacielem przy rzucie 1, 2 lub 3.",
  ],
  karzel: ["Musisz mieć zawsze co najmniej 2 Zaklęcia."],
  kat: [
    "Naturę wybierasz sam, po wszystkich innych graczach.",
    "Atakując możesz ścinać głowę: 1 lub 2 — udaje się. Inaczej walczysz normalnie.",
    "Atakując wybierasz rodzaj walki — zwykłą albo magiczną.",
  ],
  krasnolud: [
    "Każdy swój rzut możesz powtórzyć raz; drugi wynik jest ostateczny.",
    "Rzuć kostką przeciw każdemu Zaklęciu na ciebie: 1 lub 2 — ignorujesz je.",
  ],
  ksiaze: [
    "Hełm i Miecz odzyskasz w Zamku, jeśli je stracisz.",
    "Możesz nie badać Obszaru — Karty ciągniesz, ale zostawiasz zakryte.",
  ],
  lotr: [
    "Nie możesz mieć żadnych Przyjaciół.",
    "Pokonanej Postaci możesz odebrać 1 punkt Miecza lub Magii zamiast Życia.",
    "Atakując możesz walczyć nieuczciwie — przeciwnik nie dodaje rzutu do Miecza.",
  ],
  mag: ["Musisz mieć zawsze co najmniej 1 Zaklęcie.", "Golem i Homunculus cię nie atakują."],
  magog: ["Możesz ignorować Mgłę."],
  obbol: ["Przegrywasz dopiero przy różnicy 2 punktów; różnica 1 to remis."],
  olbrzym: [
    "Kończąc ruch na zajętym Obszarze idziesz dalej, na pierwszy wolny.",
    "Przeciw silniejszej Postaci liczy się wyłącznie wynik rzutu kostką.",
    "Ciągniesz o 1 Kartę Zdarzeń więcej i jedną odrzucasz.",
  ],
  pustelnik: ["Zamiast walki możesz odpędzić Demona na wolny Obszar w swoim Kręgu."],
  quark: [
    "Zamiast ataku możesz rzucić urok — ofiara traci turę, ty wykorzystujesz jej ruch.",
    "Rzut 6 na ruch pozwala przenieść się na dowolny Obszar w twoim Kręgu.",
  ],
  "rycerz-ciemnosci": [
    "Atakując wybierasz rodzaj walki — zwykłą albo magiczną.",
    "Za każde 10 punktów Magii pokonanych Demonów: 1 Zaklęcie albo 1 punkt Magii.",
    "W Turnieju Rycerskim możesz stoczyć dwa pojedynki, jeśli wygrasz pierwszy.",
  ],
  spryciarz: [
    "Od napotkanej Postaci możesz wyłudzić 1 Sz. Z. przy rzucie 1.",
    "Możesz towarzyszyć Postaci ruszającej z twojego Obszaru, bez badania celu.",
    "Możesz oswoić 1 Bestię — zostaje Przyjacielem i dodaje swój Miecz.",
  ],
  troll: ["Pokonaną Postać możesz przepędzić o tyle Obszarów, ile wyrzucisz."],
  wiedzma: ["Zamiast walki możesz rzucić urok — ofiara musi iść do Świątyni, by go zdjąć."],
  zdobywca: [
    "Kartę Przyjaciela możesz zawsze wymienić na 1 punkt Życia.",
    "Po wygranej zwykłej walce możesz odebrać 2 punkty Życia.",
  ],
};

/**
 * The seat has decided, and what it decided is not to decide.
 *
 * Held in `seats.character_id` between the pick and the start of the game, and
 * gone by the time anything reads a character: `startGame` deals a real one
 * before the first turn. It is a sentinel rather than a null because "I want a
 * surprise" and "I have not looked yet" are different answers to the same
 * question — the first can be ready to play, and the second cannot.
 *
 * Not a character id anybody could otherwise hold: the 27 printed ones are all
 * names, and none of them is this.
 */
/**
 * The one character 6.3 does not apply to.
 *
 * "Postać może posiadać dowolną liczbę Przyjaciół" is the rule, and the ŁOTR's
 * Karta overrides it flatly: "Nie możesz mieć żadnych Przyjaciół." 8.2 is what
 * lets a Charakterystyka do that, and this is the only card in the box that
 * does it to friends.
 *
 * Named here rather than tested for wherever it matters, for the reason ids
 * exist at all: `"lotr"` typed into a component is a string the compiler cannot
 * check, and there would be nothing to find if the id ever changed. It is still
 * a *note* rather than an enforced ability — nothing refuses to hand a ŁOTR a
 * Przyjaciel — so this answers "may they?", not "did the app stop them?".
 *
 * Not the same question as being Zamienionym w Kamień, which strips friends
 * from anybody (20.x) and gives them back. That is a state; this is the card.
 */
export function mayHaveFriends(characterId: CharacterId | null): boolean {
  return characterId !== "lotr";
}

export const RANDOM_CHARACTER_ID = "losowa";

/**
 * What the surprise is called where a player has to read or type it.
 *
 * The name printed on the card the picker draws, so the console offers the same
 * word the browser shows. It was reachable at the prompt only as a bare `pick`
 * with nothing after it — which does take it, and which no completion list ever
 * said, so a wall of twenty-seven names looked like the whole choice.
 */
export const RANDOM_CHARACTER_NAME = "LOSOWA";

/** Whether a seat is holding the surprise rather than a Karta Postaci. */
export function isRandomPick(characterId: string | null | undefined): boolean {
  return characterId === RANDOM_CHARACTER_ID;
}

/**
 * What a seat's `character_id` column can hold, spelled out.
 *
 * Three states, and they are genuinely different: one of the 27 cards, the
 * sentinel meaning "surprise me", or nothing chosen yet. Writing it as a string
 * left all three looking alike, which is how the sentinel could have reached an
 * ability lookup and quietly returned nothing.
 */
export type SeatCharacter = CharacterId | typeof RANDOM_CHARACTER_ID;

/** The card a seat is holding, or null — including when it is holding the surprise. */
export function asCharacterId(value: string | null | undefined): CharacterId | null {
  return isCharacterId(value) ? value : null;
}

/** Narrows a stored column to the three states it can be in. */
export function asSeatCharacter(value: string | null | undefined): SeatCharacter | null {
  if (isCharacterId(value)) return value;
  return value === RANDOM_CHARACTER_ID ? RANDOM_CHARACTER_ID : null;
}

export function abilitiesOfCharacter(characterId: CharacterId | null): readonly Ability[] {
  return characterId ? (CHARACTER_ABILITIES[characterId] ?? []) : [];
}

export function notesForCharacter(characterId: CharacterId | null): readonly string[] {
  return characterId ? (CHARACTER_NOTES[characterId] ?? []) : [];
}

/**
 * The kit without its promised Przedmioty, for a journal line that has to name
 * what actually arrived.
 *
 * 21.2 can leave a character short — three Miecze in the pile and five Karty
 * Postaci printed with one — and the line then has to say what was handed over
 * and nothing else. Spreading the kit and adding the real list after it does
 * not work: the key is the same, and the promise wins wherever the real list
 * is empty.
 */
export function withoutItems(kit: StartingKit): Omit<StartingKit, "items"> {
  const { items: _promised, ...rest } = kit;
  return rest;
}

export function startingKit(characterId: CharacterId | null): StartingKit {
  return characterId ? (STARTING_KIT[characterId] ?? {}) : {};
}

/**
 * How many Zaklęcia a character was dealt at setup (9.5).
 *
 * The Różdżka Zaklęć is measured against this rather than against 2.6's table,
 * so the limit cannot be worked out from Magia alone — see `spellAllowance` and
 * `wandRefills`. A stored `character_id` is narrowed on the way in, and an
 * unseated seat has no starting hand.
 */
export function spellsAtSetup(characterId: string | null): number {
  return startingKit(asCharacterId(characterId)).spells ?? 0;
}
