/** The card vocabulary as one table: what each word is made of, what it asks, what it names and what it is worth — so no reader has to know the shapes by heart. */

import type { FieldId } from "./board";
import type { ComposingOp, Destination, Effect, Valence } from "./cardScript";
import { takesEverything } from "./losses";

/**
 * Why a table, and why here.
 *
 * What a word of the vocabulary *means* used to live wherever somebody needed
 * to know: `isSettled` was one switch, `nodeAt` another, `valenceOf` and
 * `fieldsNamedBy` two more with a `default`, `reopensTheDrawing` searched the
 * script as JSON text, and `coverage.test.ts` and `wordsRead.test.ts` each
 * carried a tree walker of their own — six walkers, and the newest of them
 * did not know `jak-pole` had a child. Adding a word meant finding all of
 * them, and nothing said which one had been missed until a card stalled on
 * it (docs/KARTA.md, „Słownik jako dane").
 *
 * This is the same trick the repo plays everywhere else (docs/WHERE.md, „The
 * trick the whole repo plays"): one `Record` over the union, so a word added
 * to `Effect` with no entry here — or an entry the union does not name — is a
 * build failure at this table. Two other tables stand beside it over the same
 * union and stay where they are: `OPS` in `commands/ops.ts`, which *runs* a
 * leaf and needs a `Changeset`, and the two voices in `effectText.ts`, which
 * *say* a word and were exhaustive already.
 *
 * One thing this table deliberately does not know: where a borrowed table
 * lives. `jak-pole` names an Obszar whose offer is in `FIELD_SCRIPTS`, and
 * that registry imports `state.ts`, which would import this file — so the word
 * says *which* Obszar it borrows (`pozycza`) and `resolve.ts`, which already
 * reads the registry, hands the borrowed effect in as a child. Every walker
 * that descends therefore lives in `resolve.ts` and takes its children from
 * `childrenOf` there.
 */

export type Op = Effect["op"];
export type Of<K extends Op> = Extract<Effect, { op: K }>;
export type LeafOp = Exclude<Op, ComposingOp>;

/** A node under another, with the index a cursor uses to reach it (docs/STACK.md). */
export type Child = readonly [index: number, effect: Effect];

/**
 * What a surface asks when the cursor stands on a node — the shape of the
 * question, before any board or hand has been consulted.
 *
 * `question.ts` turns one of these into a `TurnQuestion` by adding what only
 * the table knows: which Obszary are free, which Karty are in the hand, and
 * whether the hand may be shown. Absent means the node asks nothing.
 */
export type Ask =
  | { kind: "wybor"; options: readonly string[] }
  | { kind: "gdzie"; to: Destination }
  | { kind: "cyfra"; faces: readonly number[] }
  | { kind: "ktora"; co: Of<"strata">["co"]; count: number }
  /** A question the vocabulary holds and no surface can ask yet. */
  | { kind: "nieobslugiwane" };

export interface Word<K extends Op> {
  /**
   * Every field a card may write on this word.
   *
   * A map rather than a list so the compiler requires all of them and refuses
   * any other: this is the builder's menu, `ask slowo`'s answer, and the list
   * `wordsRead.test.ts` checks a reader against. The PÓŁBÓG's `zeStosu` was a
   * field with two renderers and no executor, and nothing could ask „who reads
   * this?" until the fields were written down somewhere that is not the type.
   */
  pola: { readonly [P in Exclude<keyof Of<K>, "op">]-?: true };
  /** A shape the walk descends through rather than a thing it does (`COMPOSING_OPS`). */
  sklada: K extends ComposingOp ? true : false;
  /** The nodes under this one, each with the index a cursor uses to reach it. */
  dzieci(effect: Of<K>): readonly Child[];
  /** The Obszar whose own table this word borrows, for `resolve.ts` to fetch. */
  pozycza?(effect: Of<K>): FieldId;
  /**
   * The node an index reaches, where that is not a lookup in `dzieci`.
   *
   * Only `zgadnij`: the walk writes the *guessed face* into the cursor, so any
   * of six indices reaches the one reward.
   */
  pod?(effect: Of<K>, index: number): Effect | null;
  /**
   * Whether nothing about it is left for a person to say.
   *
   * `children` is what `resolve.ts` found under the node, borrowed tables
   * included, and `settled` is the recursion — a composing word answers from
   * its children and a leaf from its own fields.
   */
  rozstrzygniete(
    effect: Of<K>,
    children: readonly Effect[],
    settled: (child: Effect) => boolean,
  ): boolean;
  /** The question a cursor standing here asks, or null for none. */
  pyta(effect: Of<K>): Ask | null;
  /** Gift or loss, or null where the card does not settle it; `of` is the recursion. */
  walencja(effect: Of<K>, of: (child: Effect) => Valence | null): Valence | null;
  /** The Obszary this node itself names — not its children's. */
  obszary(effect: Of<K>): readonly FieldId[];
}

/** What a leaf has to say for itself; everything unsaid is the leaf default. */
interface LeafSpec<K extends LeafOp> {
  pola: Word<K>["pola"];
  /** True unless the word says otherwise: most leaves are one thing that happens. */
  rozstrzygniete?: (effect: Of<K>) => boolean;
  pyta?: (effect: Of<K>) => Ask | null;
  walencja?: (effect: Of<K>) => Valence | null;
  obszary?: (effect: Of<K>) => readonly FieldId[];
}

function leaf<K extends LeafOp>(_op: K, spec: LeafSpec<K>): Word<K> {
  return {
    pola: spec.pola,
    sklada: false as Word<K>["sklada"],
    dzieci: () => [],
    rozstrzygniete: (effect) => spec.rozstrzygniete?.(effect) ?? true,
    pyta: (effect) => spec.pyta?.(effect) ?? null,
    walencja: (effect) => spec.walencja?.(effect) ?? null,
    obszary: (effect) => spec.obszary?.(effect) ?? [],
  };
}

const settledAll = (children: readonly Effect[], settled: (child: Effect) => boolean) =>
  children.every(settled);

/**
 * Whether a destination is named, or is the player pointing at the board.
 *
 * `poczatek-ruchu` counts as named. The STRAŻ „zawraca cię na Obszar, z
 * którego rozpocząłeś wędrówkę" — as exact as any `pole`, only said in terms
 * of the turn rather than of the board, and the walk reads it off the frame's
 * `from`. Calling it unsettled made it a question nobody could ask.
 */
const namedDestination = (to: Destination) => to.kind === "pole" || to.kind === "poczatek-ruchu";

const SIX = [1, 2, 3, 4, 5, 6] as const;

export const WORDS: { [K in Op]: Word<K> } = {
  // ── the shapes the walk descends through ────────────────────────────────

  "po-kolei": {
    pola: { steps: true },
    sklada: true,
    dzieci: (effect) => effect.steps.map((step, at) => [at, step] as const),
    rozstrzygniete: (_effect, children, settled) => settledAll(children, settled),
    pyta: () => null,
    /** A sequence costs you if any step does; the gift does not offset it. */
    walencja: (effect, of) => {
      const steps = effect.steps.map(of);
      if (steps.includes("strata")) return "strata";
      return steps.includes("korzysc") ? "korzysc" : null;
    },
    obszary: () => [],
  },

  wybor: {
    pola: { options: true },
    sklada: true,
    dzieci: (effect) => effect.options.map((option, at) => [at, option.effect] as const),
    /** The decision *is* the effect. */
    rozstrzygniete: () => false,
    pyta: (effect) => ({ kind: "wybor", options: effect.options.map((option) => option.label) }),
    /**
     * A choice you may decline is not a loss, whatever else is on offer.
     *
     * „Pomiń", „Nie wzywaj" — an arm on which nothing happens is a way past
     * the whole Karta. Nothing to gain and no way out is the DOBRE BÓSTWO
     * asking a guilty Postać for a coin or a turn: one readable arm is enough.
     */
    walencja: (effect, of) => {
      const arms = effect.options.map((option) => of(option.effect));
      const declinable = effect.options.some((option) => option.effect.op === "nic");
      if (arms.includes("korzysc") || declinable) return "korzysc";
      return arms.includes("strata") ? "strata" : null;
    },
    obszary: () => [],
  },

  rzut: {
    pola: { faces: true, kostki: true },
    sklada: true,
    /** Keyed by face, which is what the walk writes into the cursor. */
    dzieci: (effect) =>
      Object.keys(effect.faces)
        .map(Number)
        .sort((a, b) => a - b)
        .map((face) => [face, effect.faces[face]] as const),
    /** A die table is settled only if every face it can land on is. */
    rozstrzygniete: (_effect, children, settled) => settledAll(children, settled),
    /** Not a question: the app rolls it, and what it lands on is asked afterwards. */
    pyta: () => null,
    walencja: () => null,
    obszary: () => [],
  },

  gdy: {
    pola: { warunek: true, to: true, inaczej: true },
    sklada: true,
    dzieci: (effect) =>
      effect.inaczej
        ? ([[0, effect.to], [1, effect.inaczej]] as const)
        : ([[0, effect.to]] as const),
    /** A condition the app can test, on branches it can carry out. */
    rozstrzygniete: (_effect, children, settled) => settledAll(children, settled),
    pyta: () => null,
    /** A condition inside a condition is still one card, and its arm decides. */
    walencja: (effect, of) => of(effect.to),
    obszary: () => [],
  },

  /**
   * „Możesz modlić się na takich samych zasadach, jak w Świątyni Bogini Nemed"
   * — the two Kapliczki. The child is the Obszar's own table, which
   * `resolve.ts` fetches off `pozycza`; here the word only says which one.
   */
  "jak-pole": {
    pola: { fieldId: true },
    sklada: true,
    dzieci: () => [],
    pozycza: (effect) => effect.fieldId,
    /** Exactly as settled as the table it borrows; a table nobody has is not. */
    rozstrzygniete: (_effect, children, settled) =>
      children.length > 0 && settledAll(children, settled),
    pyta: () => null,
    walencja: () => null,
    obszary: (effect) => [effect.fieldId],
  },

  /** The Władca Zdarzeń: which Karta and where, and the first is not on the frame. */
  "przenies-karte": {
    pola: {},
    sklada: true,
    dzieci: () => [],
    rozstrzygniete: () => false,
    pyta: () => ({ kind: "nieobslugiwane" }),
    walencja: () => null,
    obszary: () => [],
  },

  /** The MĘDRZEC's riddle: a face named aloud, then the die. */
  zgadnij: {
    pola: { nagroda: true },
    sklada: true,
    dzieci: (effect) => [[0, effect.nagroda]],
    pod: (effect, index) => (index >= 1 && index <= 6 ? effect.nagroda : null),
    rozstrzygniete: () => false,
    pyta: () => ({ kind: "cyfra", faces: SIX }),
    walencja: () => null,
    obszary: () => [],
  },

  // ── the things that happen ──────────────────────────────────────────────

  nic: leaf("nic", { pola: {} }),

  punkty: leaf("punkty", {
    pola: { stat: true, delta: true, target: true },
    // Gold included: a Sztuka Złota is a point like the others here.
    walencja: (effect) => (effect.delta === 0 ? null : effect.delta > 0 ? "korzysc" : "strata"),
  }),

  /** Free healing is capped by 4.7 and has one answer; healing that charges is a purchase, and how much to buy is the buyer's. */
  uzdrow: leaf("uzdrow", {
    pola: { upTo: true, cena: true },
    rozstrzygniete: (effect) => !effect.cena,
    pyta: (effect) => (effect.cena ? { kind: "nieobslugiwane" } : null),
    walencja: (effect) => (effect.cena === undefined ? "korzysc" : null),
  }),

  sprzedaj: leaf("sprzedaj", { pola: { cena: true } }),

  "tura-stracona": leaf("tura-stracona", {
    pola: { turns: true, target: true, oprocz: true },
    walencja: () => "strata",
  }),

  "ruch-dodatkowy": leaf("ruch-dodatkowy", { pola: {}, walencja: () => "korzysc" }),

  zaklecie: leaf("zaklecie", {
    pola: { count: true, cena: true, zeStosu: true },
    // A Zaklęcie with a price is the Sztukmistrz's shop, a trade rather than a gift.
    walencja: (effect) => (effect.cena === undefined ? "korzysc" : null),
  }),

  "zaklecia-do-limitu": leaf("zaklecia-do-limitu", { pola: {}, walencja: () => "korzysc" }),

  przenies: leaf("przenies", {
    pola: { to: true },
    rozstrzygniete: (effect) => namedDestination(effect.to),
    pyta: (effect) => (namedDestination(effect.to) ? null : { kind: "gdzie", to: effect.to }),
    obszary: (effect) => (effect.to.kind === "pole" ? [effect.to.fieldId] : []),
  }),

  wyciagnij: leaf("wyciagnij", { pola: { count: true } }),

  walka: leaf("walka", { pola: { nazwa: true, miecz: true, magia: true } }),

  /** Whom it is sent at was named as the Zaklęcie was spoken — the only choice it holds. */
  przyzwij: leaf("przyzwij", { pola: { nazwa: true, miecz: true } }),

  podejrzyj: leaf("podejrzyj", { pola: { count: true } }),

  /** The class is on the card and the whole Krąg is swept; nobody picks which Nieznajomi die. */
  katastrofa: leaf("katastrofa", { pola: { klasa: true, zasieg: true } }),

  /** 15.2 has already said which Karta is in front of you. */
  "wymien-karte": leaf("wymien-karte", { pola: {} }),

  /**
   * „Tracisz 1 z Przedmiotów wedle własnego wyboru" — which one is yours (5.6),
   * unless nothing is left to decide: everything going is not a choice, gold is
   * a number, and a loss the card assigns to chance is chance's. Which losses
   * name what goes is `takesEverything`'s, not this table's — both kept the
   * list once and disagreed about one value.
   */
  strata: leaf("strata", {
    pola: { co: true, oprocz: true, count: true, wybor: true, target: true },
    rozstrzygniete: (effect) => takesEverything(effect.co) || effect.wybor === "losowo",
    pyta: (effect) =>
      takesEverything(effect.co) || effect.wybor === "losowo"
        ? null
        : { kind: "ktora", co: effect.co, count: effect.count ?? 1 },
    walencja: () => "strata",
  }),

  kamien: leaf("kamien", { pola: {}, walencja: () => "strata" }),

  /** The Kuglarz: the two offers are the question, and answering one leaves nothing to decide. */
  "zamien-punkty": leaf("zamien-punkty", { pola: { z: true } }),

  natura: leaf("natura", { pola: { na: true } }),

  /** A shop is a standing offer, not a question; the buying is `buy` afterwards. */
  kup: leaf("kup", { pola: { towar: true } }),

  /**
   * Two of the three cards that put a Karta down name one Obszar and ask
   * nothing. The Lewiatan names six, „nie zajętym przez inną Postać" — that is
   * the player pointing at the board.
   */
  "poloz-karte": leaf("poloz-karte", {
    pola: { gdzie: true },
    rozstrzygniete: (effect) => effect.gdzie.kind === "pole",
    pyta: (effect) =>
      effect.gdzie.kind === "pole"
        ? null
        : effect.gdzie.kind === "jedno-z"
          ? { kind: "gdzie", to: effect.gdzie }
          : { kind: "nieobslugiwane" },
    obszary: (effect) =>
      effect.gdzie.kind === "pole"
        ? [effect.gdzie.fieldId]
        : effect.gdzie.kind === "jedno-z"
          ? [...effect.gdzie.fieldIds]
          : [],
  }),

  /** The card is named and the stock is the app's to count. */
  otrzymaj: leaf("otrzymaj", { pola: { co: true }, walencja: () => "korzysc" }),

  efekt: leaf("efekt", { pola: { label: true, modifier: true, ends: true, target: true } }),

  /** A die per card, and nobody picks which — 5.6 is not engaged. */
  "rzut-za-kazdego": leaf("rzut-za-kazdego", {
    pola: { co: true, gubiPrzy: true },
    walencja: () => "strata",
  }),

  uwolnij: leaf("uwolnij", { pola: { od: true } }),

  /** Somebody has to say which card changes hands (5.6, or Szaleństwo's own text). */
  zabierz: leaf("zabierz", {
    pola: { co: true, wybiera: true },
    rozstrzygniete: () => false,
    pyta: () => ({ kind: "nieobslugiwane" }),
  }),
};

/**
 * The entry for an effect, typed for the whole union.
 *
 * The cast is the one mapped-dispatch seam TypeScript cannot see through —
 * the same one `runOp` crosses in `commands/ops.ts`: the table is keyed so
 * `WORDS[effect.op]` and `effect` agree by construction.
 */
export function wordOf(effect: Effect): Word<Op> {
  return WORDS[effect.op] as Word<Op>;
}

/** Every op, in the table's order — for tools that list the vocabulary. */
export const OPS_IN_ORDER = Object.keys(WORDS) as Op[];

/**
 * Every node of an effect's *own* tree, the effect itself first.
 *
 * Own, meaning a borrowed table is not entered: `jak-pole` is a leaf here and
 * a branch in `resolve.ts`'s `everyNode`, which is the walker to use whenever
 * what is inside the Świątynia's prayer matters. This one is for questions
 * about the card as written — which Obszary it names, whether it draws — and
 * for callers that cannot reach `FIELD_SCRIPTS` without an import cycle.
 */
export function nodesOf(effect: Effect): Effect[] {
  return [effect, ...wordOf(effect).dzieci(effect).flatMap(([, child]) => nodesOf(child))];
}

/**
 * Whether what an effect does is in the reader's favour, or null where the
 * card does not settle it.
 *
 * For the one line that needs it: a Karta whose whole content sits behind a
 * condition, and a panel that colours that condition green where the reader
 * meets it. Deliberately the small half of the union — the words a card uses
 * to give and to take — because a `walka` is a fight you may win and an
 * `efekt` may be the Mgła's cap or the Konik Polny's second throw, and a
 * colour on those would be a claim the card never made.
 */
export function valenceOf(effect: Effect): Valence | null {
  return wordOf(effect).walencja(effect, valenceOf);
}
