/** One Karta: everything one card in the box says, in one file — and the registries as views over the index of them. */

import type { CardClass } from "@/data/types";
import type { CardId, CharacterId, SpellId } from "@/data/ids";
import type { Ability } from "./abilities";
import type { FieldId } from "./board";
import type { CardScript, Disposition, Effect, Example } from "./cardScript";
import type { StartingKit } from "./characters";
import type { FieldOffer, FieldScript } from "./fieldScript";
import type { SpellScript } from "./spells";
import type { Use } from "./uses";

/**
 * Why one shape.
 *
 * What a card does used to live in five registries of four shapes —
 * `SCRIPTS`, `ABILITIES`, `USES`, `SPELLS`, `FIELD_SCRIPTS` — and „what does
 * this Karta do" had to be assembled from several files; the ŁÓDŹ was in two
 * of them. docs/KARTA.md step 3: a Karta is one file under
 * `src/lib/engine/content/<kind>/<id>.ts`, exporting one of these, with the
 * comment that explains it in the same file. The registries keep their names
 * and shapes as *views* over the generated index (`content/index.ts`), so no
 * reader had to move on the day a card did.
 *
 * Each field is the moment the card speaks: `onDraw` to whoever turned it
 * over (15.1), `resolved` where it lies, `held` while it is carried, `used`
 * when it is spent, `cast` when it is spoken, `onLoss` when it beats you,
 * `offers` when it is an Obszar or a shop. A class fills the fields it has on
 * the print and no others. `content.test.ts` holds that every Karta is plain
 * data — through JSON and back unchanged — so a card can never be a function
 * in a coat, which is the property a builder and a set loader both need.
 */

/** Which box a Karta comes from. Only the base game until a set is opened (docs/EXPANSIONS.md). */
export type CardSet = "base";

interface KartaBase {
  set: CardSet;
  /** Printed clauses the app does not run — was `CARD_NOTES` / `CHARACTER_NOTES`. */
  notes?: readonly string[];
  examples?: readonly Example[];
}

/** A Karta Zdarzeń or a Wyposażenie card: the six printed classes. */
export interface EventKarta extends KartaBase {
  kind: CardClass;
  id: CardId;
  /** Said to whoever turned it over (15.1) — was `CardScript.placed`. */
  onDraw?: Effect;
  /** What resolving it does where it lies — was `CardScript.effect`. */
  resolved?: Effect;
  /** What losing a fight to it costs — was `CardScript.przegrana`. */
  onLoss?: Effect;
  /** Where it goes afterwards; required wherever `resolved` is. */
  disposition?: Disposition;
  optional?: boolean;
  consumed?: boolean;
  /** Standing rules while it is carried — was `ABILITIES[id]`. */
  held?: readonly Ability[];
  /** Spent by one act — was `USES[id]`. */
  used?: Use;
}

export interface SpellKarta extends KartaBase {
  kind: "spell";
  id: SpellId;
  /** When it may be spoken, at what, and what it does — was `SPELLS[id]`. */
  cast: SpellScript;
  /** A Zaklęcie that is also carried, like the KRYSZTAŁ MAGÓW — was `ABILITIES[id]`. */
  held?: readonly Ability[];
}

export interface CharacterKarta extends KartaBase {
  kind: "character";
  id: CharacterId;
  /** The printed powers — was `CHARACTER_ABILITIES[id]`. */
  held?: readonly Ability[];
  /** What the Postać starts with — was `STARTING_KIT[id]`. */
  kit?: StartingKit;
}

export interface FieldKarta extends KartaBase {
  kind: "field";
  id: FieldId;
  /** What the Obszar offers — was `FIELD_SCRIPTS[id].offers`. */
  offers: readonly FieldOffer[];
  /** No choice about it — was `FieldScript.obowiazkowe`. */
  mandatory?: boolean;
}

export type Karta = EventKarta | SpellKarta | CharacterKarta | FieldKarta;

/** Whether a card is a Karta Zdarzeń or Wyposażenie, the way the deck knows it. */
export function isEventKarta(card: Karta): card is EventKarta {
  return card.kind !== "spell" && card.kind !== "character" && card.kind !== "field";
}

// ── the registries, as views ──────────────────────────────────────────────

/** What `SCRIPTS` held: every Karta that is resolved, in `CardScript`'s shape. */
export function scriptsOf(cards: readonly Karta[]): Partial<Record<CardId, CardScript>> {
  const out: Partial<Record<CardId, CardScript>> = {};
  for (const card of cards) {
    if (!isEventKarta(card) || !card.resolved || !card.disposition) continue;
    out[card.id] = {
      effect: card.resolved,
      disposition: card.disposition,
      ...(card.onDraw ? { onDraw: card.onDraw } : {}),
      ...(card.onLoss ? { onLoss: card.onLoss } : {}),
      ...(card.optional ? { optional: true } : {}),
      ...(card.consumed ? { consumed: true } : {}),
      ...(card.examples ? { examples: card.examples } : {}),
    };
  }
  return out;
}

/** What `ABILITIES` held: every carried Karta's standing rules. */
export function heldOf(cards: readonly Karta[]): Partial<Record<CardId, readonly Ability[]>> {
  const out: Partial<Record<CardId, readonly Ability[]>> = {};
  for (const card of cards) {
    if ((isEventKarta(card) || card.kind === "spell") && card.held) out[card.id] = card.held;
  }
  return out;
}

/** What `CARD_NOTES` held. */
export function notesOf(cards: readonly Karta[]): Partial<Record<CardId, readonly string[]>> {
  const out: Partial<Record<CardId, readonly string[]>> = {};
  for (const card of cards) if (isEventKarta(card) && card.notes) out[card.id] = card.notes;
  return out;
}

/** What `USES` held. */
export function usesOf(cards: readonly Karta[]): Partial<Record<CardId, Use>> {
  const out: Partial<Record<CardId, Use>> = {};
  for (const card of cards) if (isEventKarta(card) && card.used) out[card.id] = card.used;
  return out;
}

/** What `SPELLS` held. */
export function spellsOf(cards: readonly Karta[]): Partial<Record<SpellId, SpellScript>> {
  const out: Partial<Record<SpellId, SpellScript>> = {};
  for (const card of cards) if (card.kind === "spell") out[card.id] = card.cast;
  return out;
}

/** What `FIELD_SCRIPTS` held. */
export function fieldScriptsOf(cards: readonly Karta[]): Partial<Record<FieldId, FieldScript>> {
  const out: Partial<Record<FieldId, FieldScript>> = {};
  for (const card of cards) {
    if (card.kind !== "field") continue;
    out[card.id] = {
      offers: [...card.offers],
      ...(card.mandatory ? { mandatory: true } : {}),
    };
  }
  return out;
}

/** What `CHARACTER_ABILITIES` held. */
export function characterAbilitiesOf(
  cards: readonly Karta[],
): Partial<Record<CharacterId, readonly Ability[]>> {
  const out: Partial<Record<CharacterId, readonly Ability[]>> = {};
  for (const card of cards) if (card.kind === "character" && card.held) out[card.id] = card.held;
  return out;
}

/** What `STARTING_KIT` held. */
export function kitsOf(cards: readonly Karta[]): Partial<Record<CharacterId, StartingKit>> {
  const out: Partial<Record<CharacterId, StartingKit>> = {};
  for (const card of cards) if (card.kind === "character" && card.kit) out[card.id] = card.kit;
  return out;
}

/** What `CHARACTER_NOTES` held. */
export function characterNotesOf(
  cards: readonly Karta[],
): Partial<Record<CharacterId, readonly string[]>> {
  const out: Partial<Record<CharacterId, readonly string[]>> = {};
  for (const card of cards) if (card.kind === "character" && card.notes) out[card.id] = card.notes;
  return out;
}
