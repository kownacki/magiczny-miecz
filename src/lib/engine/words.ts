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
 * did not know `as-field` had a child. Adding a word meant finding all of
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
 * lives. `as-field` names an Obszar whose offer is in `FIELD_SCRIPTS`, and
 * that registry imports `state.ts`, which would import this file — so the word
 * says *which* Obszar it borrows (`borrows`) and `resolve.ts`, which already
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
  | { kind: "choice"; options: readonly string[] }
  | { kind: "where"; to: Destination }
  | { kind: "digit"; faces: readonly number[] }
  | { kind: "which"; what: Of<"lose">["what"]; count: number }
  /** A question the vocabulary holds and no surface can ask yet. */
  | { kind: "unsupported" };

export interface Word<K extends Op> {
  /**
   * Every field a card may write on this word.
   *
   * A map rather than a list so the compiler requires all of them and refuses
   * any other: this is the builder's menu, `ask word`'s answer, and the list
   * `wordsRead.test.ts` checks a reader against. The PÓŁBÓG's `fromPile` was a
   * field with two renderers and no executor, and nothing could ask „who reads
   * this?" until the fields were written down somewhere that is not the type.
   */
  params: { readonly [P in Exclude<keyof Of<K>, "op">]-?: true };
  /** A shape the walk descends through rather than a thing it does (`COMPOSING_OPS`). */
  composes: K extends ComposingOp ? true : false;
  /** The nodes under this one, each with the index a cursor uses to reach it. */
  children(effect: Of<K>): readonly Child[];
  /** The Obszar whose own table this word borrows, for `resolve.ts` to fetch. */
  borrows?(effect: Of<K>): FieldId;
  /**
   * The node an index reaches, where that is not a lookup in `children`.
   *
   * Only `guess`: the walk writes the *guessed face* into the cursor, so any
   * of six indices reaches the one reward.
   */
  childAt?(effect: Of<K>, index: number): Effect | null;
  /**
   * Whether nothing about it is left for a person to say.
   *
   * `children` is what `resolve.ts` found under the node, borrowed tables
   * included, and `settled` is the recursion — a composing word answers from
   * its children and a leaf from its own fields.
   */
  settled(
    effect: Of<K>,
    children: readonly Effect[],
    isSettled: (child: Effect) => boolean,
  ): boolean;
  /** The question a cursor standing here asks, or null for none. */
  asks(effect: Of<K>): Ask | null;
  /** Gift or loss, or null where the card does not settle it; `of` is the recursion. */
  valence(effect: Of<K>, of: (child: Effect) => Valence | null): Valence | null;
  /** The Obszary this node itself names — not its children's. */
  fieldsNamed(effect: Of<K>): readonly FieldId[];
}

/** What a leaf has to say for itself; everything unsaid is the leaf default. */
interface LeafSpec<K extends LeafOp> {
  params: Word<K>["params"];
  /** True unless the word says otherwise: most leaves are one thing that happens. */
  settled?: (effect: Of<K>) => boolean;
  asks?: (effect: Of<K>) => Ask | null;
  valence?: (effect: Of<K>) => Valence | null;
  fieldsNamed?: (effect: Of<K>) => readonly FieldId[];
}

function leaf<K extends LeafOp>(_op: K, spec: LeafSpec<K>): Word<K> {
  return {
    params: spec.params,
    composes: false as Word<K>["composes"],
    children: () => [],
    settled: (effect) => spec.settled?.(effect) ?? true,
    asks: (effect) => spec.asks?.(effect) ?? null,
    valence: (effect) => spec.valence?.(effect) ?? null,
    fieldsNamed: (effect) => spec.fieldsNamed?.(effect) ?? [],
  };
}

const settledAll = (children: readonly Effect[], isSettled: (child: Effect) => boolean) =>
  children.every(isSettled);

/**
 * Whether a destination is named, or is the player pointing at the board.
 *
 * `move-start` counts as named. The STRAŻ „zawraca cię na Obszar, z
 * którego rozpocząłeś wędrówkę" — as exact as any `pole`, only said in terms
 * of the turn rather than of the board, and the walk reads it off the frame's
 * `from`. Calling it unsettled made it a question nobody could ask.
 */
const namedDestination = (to: Destination) => to.kind === "field" || to.kind === "move-start";

const SIX = [1, 2, 3, 4, 5, 6] as const;

export const WORDS: { [K in Op]: Word<K> } = {
  // ── the shapes the walk descends through ────────────────────────────────

  sequence: {
    params: { steps: true },
    composes: true,
    children: (effect) => effect.steps.map((step, at) => [at, step] as const),
    settled: (_effect, children, isSettled) => settledAll(children, isSettled),
    asks: () => null,
    /** A sequence costs you if any step does; the gift does not offset it. */
    valence: (effect, of) => {
      const steps = effect.steps.map(of);
      if (steps.includes("loss")) return "loss";
      return steps.includes("gain") ? "gain" : null;
    },
    fieldsNamed: () => [],
  },

  choice: {
    params: { options: true },
    composes: true,
    children: (effect) => effect.options.map((option, at) => [at, option.effect] as const),
    /** The decision *is* the effect. */
    settled: () => false,
    asks: (effect) => ({ kind: "choice", options: effect.options.map((option) => option.label) }),
    /**
     * A choice you may decline is not a loss, whatever else is on offer.
     *
     * „Pomiń", „Nie wzywaj" — an arm on which nothing happens is a way past
     * the whole Karta. Nothing to gain and no way out is the DOBRE BÓSTWO
     * asking a guilty Postać for a coin or a turn: one readable arm is enough.
     */
    valence: (effect, of) => {
      const arms = effect.options.map((option) => of(option.effect));
      const declinable = effect.options.some((option) => option.effect.op === "nothing");
      if (arms.includes("gain") || declinable) return "gain";
      return arms.includes("loss") ? "loss" : null;
    },
    fieldsNamed: () => [],
  },

  roll: {
    params: { faces: true, dice: true },
    composes: true,
    /** Keyed by face, which is what the walk writes into the cursor. */
    children: (effect) =>
      Object.keys(effect.faces)
        .map(Number)
        .sort((a, b) => a - b)
        .map((face) => [face, effect.faces[face]] as const),
    /** A die table is settled only if every face it can land on is. */
    settled: (_effect, children, isSettled) => settledAll(children, isSettled),
    /** Not a question: the app rolls it, and what it lands on is asked afterwards. */
    asks: () => null,
    valence: () => null,
    fieldsNamed: () => [],
  },

  when: {
    params: { condition: true, then: true, else: true },
    composes: true,
    children: (effect) =>
      effect.else
        ? ([[0, effect.then], [1, effect.else]] as const)
        : ([[0, effect.then]] as const),
    /** A condition the app can test, on branches it can carry out. */
    settled: (_effect, children, isSettled) => settledAll(children, isSettled),
    asks: () => null,
    /** A condition inside a condition is still one card, and its arm decides. */
    valence: (effect, of) => of(effect.then),
    fieldsNamed: () => [],
  },

  /**
   * „Możesz modlić się na takich samych zasadach, jak w Świątyni Bogini Nemed"
   * — the two Kapliczki. The child is the Obszar's own table, which
   * `resolve.ts` fetches off `borrows`; here the word only says which one.
   */
  "as-field": {
    params: { fieldId: true },
    composes: true,
    children: () => [],
    borrows: (effect) => effect.fieldId,
    /** Exactly as settled as the table it borrows; a table nobody has is not. */
    settled: (_effect, children, isSettled) =>
      children.length > 0 && settledAll(children, isSettled),
    asks: () => null,
    valence: () => null,
    fieldsNamed: (effect) => [effect.fieldId],
  },

  /** The Władca Zdarzeń: which Karta and where, and the first is not on the frame. */
  "move-card": {
    params: {},
    composes: true,
    children: () => [],
    settled: () => false,
    asks: () => ({ kind: "unsupported" }),
    valence: () => null,
    fieldsNamed: () => [],
  },

  /** The MĘDRZEC's riddle: a face named aloud, then the die. */
  guess: {
    params: { prize: true },
    composes: true,
    children: (effect) => [[0, effect.prize]],
    childAt: (effect, index) => (index >= 1 && index <= 6 ? effect.prize : null),
    settled: () => false,
    asks: () => ({ kind: "digit", faces: SIX }),
    valence: () => null,
    fieldsNamed: () => [],
  },

  // ── the things that happen ──────────────────────────────────────────────

  nothing: leaf("nothing", { params: {} }),

  points: leaf("points", {
    params: { stat: true, delta: true, target: true },
    // Gold included: a Sztuka Złota is a point like the others here.
    valence: (effect) => (effect.delta === 0 ? null : effect.delta > 0 ? "gain" : "loss"),
  }),

  /** Free healing is capped by 4.7 and has one answer; healing that charges is a purchase, and how much to buy is the buyer's. */
  heal: leaf("heal", {
    params: { upTo: true, price: true },
    settled: (effect) => !effect.price,
    asks: (effect) => (effect.price ? { kind: "unsupported" } : null),
    valence: (effect) => (effect.price === undefined ? "gain" : null),
  }),

  sell: leaf("sell", { params: { price: true } }),

  "lose-turn": leaf("lose-turn", {
    params: { turns: true, target: true, except: true },
    valence: () => "loss",
  }),

  "extra-move": leaf("extra-move", { params: {}, valence: () => "gain" }),

  "gain-spell": leaf("gain-spell", {
    params: { count: true, price: true, fromPile: true },
    // A Zaklęcie with a price is the Sztukmistrz's shop, a trade rather than a gift.
    valence: (effect) => (effect.price === undefined ? "gain" : null),
  }),

  "spells-to-limit": leaf("spells-to-limit", { params: {}, valence: () => "gain" }),

  move: leaf("move", {
    params: { to: true },
    settled: (effect) => namedDestination(effect.to),
    asks: (effect) => (namedDestination(effect.to) ? null : { kind: "where", to: effect.to }),
    fieldsNamed: (effect) => (effect.to.kind === "field" ? [effect.to.fieldId] : []),
  }),

  "draw-cards": leaf("draw-cards", { params: { count: true } }),

  fight: leaf("fight", { params: { name: true, sword: true, magic: true } }),

  /** Whom it is sent at was named as the Zaklęcie was spoken — the only choice it holds. */
  summon: leaf("summon", { params: { name: true, sword: true } }),

  peek: leaf("peek", { params: { count: true } }),

  /** The class is on the card and the whole Krąg is swept; nobody picks which Nieznajomi die. */
  wipe: leaf("wipe", { params: { cardClass: true, reach: true } }),

  /** 15.2 has already said which Karta is in front of you. */
  redraw: leaf("redraw", { params: {} }),

  /**
   * „Tracisz 1 z Przedmiotów wedle własnego wyboru" — which one is yours (5.6),
   * unless nothing is left to decide: everything going is not a choice, gold is
   * a number, and a loss the card assigns to chance is chance's. Which losses
   * name what goes is `takesEverything`'s, not this table's — both kept the
   * list once and disagreed about one value.
   */
  lose: leaf("lose", {
    params: { what: true, except: true, count: true, chosenBy: true, target: true },
    settled: (effect) => takesEverything(effect.what) || effect.chosenBy === "random",
    asks: (effect) =>
      takesEverything(effect.what) || effect.chosenBy === "random"
        ? null
        : { kind: "which", what: effect.what, count: effect.count ?? 1 },
    valence: () => "loss",
  }),

  stone: leaf("stone", { params: {}, valence: () => "loss" }),

  /** The Kuglarz: the two offers are the question, and answering one leaves nothing to decide. */
  "swap-points": leaf("swap-points", { params: { from: true } }),

  "set-nature": leaf("set-nature", { params: { to: true } }),

  /** A shop is a standing offer, not a question; the buying is `buy` afterwards. */
  buy: leaf("buy", { params: { goods: true } }),

  /**
   * Two of the three cards that put a Karta down name one Obszar and ask
   * nothing. The Lewiatan names six, „nie zajętym przez inną Postać" — that is
   * the player pointing at the board.
   */
  "place-card": leaf("place-card", {
    params: { where: true },
    settled: (effect) => effect.where.kind === "field",
    asks: (effect) =>
      effect.where.kind === "field"
        ? null
        : effect.where.kind === "one-of"
          ? { kind: "where", to: effect.where }
          : { kind: "unsupported" },
    fieldsNamed: (effect) =>
      effect.where.kind === "field"
        ? [effect.where.fieldId]
        : effect.where.kind === "one-of"
          ? [...effect.where.fieldIds]
          : [],
  }),

  /** The card is named and the stock is the app's to count. */
  receive: leaf("receive", { params: { what: true }, valence: () => "gain" }),

  status: leaf("status", { params: { label: true, modifier: true, ends: true, target: true } }),

  /** A die per card, and nobody picks which — 5.6 is not engaged. */
  "roll-for-each": leaf("roll-for-each", {
    params: { what: true, lostOn: true },
    valence: () => "loss",
  }),

  release: leaf("release", { params: { from: true } }),

  /** Somebody has to say which card changes hands (5.6, or Szaleństwo's own text). */
  take: leaf("take", {
    params: { what: true, chosenBy: true },
    settled: () => false,
    asks: () => ({ kind: "unsupported" }),
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
 * Own, meaning a borrowed table is not entered: `as-field` is a leaf here and
 * a branch in `resolve.ts`'s `everyNode`, which is the walker to use whenever
 * what is inside the Świątynia's prayer matters. This one is for questions
 * about the card as written — which Obszary it names, whether it draws — and
 * for callers that cannot reach `FIELD_SCRIPTS` without an import cycle.
 */
export function nodesOf(effect: Effect): Effect[] {
  return [effect, ...wordOf(effect).children(effect).flatMap(([, child]) => nodesOf(child))];
}

/**
 * Whether what an effect does is in the reader's favour, or null where the
 * card does not settle it.
 *
 * For the one line that needs it: a Karta whose whole content sits behind a
 * condition, and a panel that colours that condition green where the reader
 * meets it. Deliberately the small half of the union — the words a card uses
 * to give and to take — because a `fight` is a fight you may win and an
 * `status` may be the Mgła's cap or the Konik Polny's second throw, and a
 * colour on those would be a claim the card never made.
 */
export function valenceOf(effect: Effect): Valence | null {
  return wordOf(effect).valence(effect, valenceOf);
}
