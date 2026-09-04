/** Every action on the holdings route, declared once: what it reads off the body and what it runs. */

/**
 * Taking, dropping and trading in cards.
 *
 * Any seated player may act on any seat, as with the stat corrections: at a
 * table people hand each other cards and correct each other's mistakes, and a
 * rule that only the owner may touch their own pile is unusable in the moment
 * somebody else notices. So `seatId` off the body names whose pile, and falls
 * back to the presser's own.
 */

import type { Slot } from "@/lib/engine/slots";
import { requireFieldId } from "@/lib/engine/board";
import type { Body, HoldingsAction } from "../requests";
import { action, type ActionContext, type Actions } from "./shape";
import {
  endlessStock,
  buyGoods,
  castSpell,
  changeNature,
  drawSpell,
  drawSpellWithWand,
  dropCard,
  equipCard,
  healSeat,
  payHealer,
  reorderPack,
  sellHolding,
  settleSpell,
  takeCard,
  takeFieldGold,
  takeFromField,
  tradeTrophies,
  turnToStone,
  spendHolding,
} from "../turnStore";

const holdings = action<"holdings">();

/** The three Natury as `changeNature` spells them. */
type Natura = Parameters<typeof changeNature>[2];

/** Whose pile: the seat named, or the presser's own. */
const seatOr = (body: Body<"holdings">, { seat }: ActionContext) => String(body.seatId ?? seat.id);

export const HOLDINGS: Actions<"holdings", HoldingsAction> = {
  take: holdings({
    from: (body, ctx) => ({ seatId: seatOr(body, ctx), cardId: String(body.cardId) }),
    run: (gameId, { seatId, cardId }) => takeCard(gameId, seatId, cardId),
  }),
  // From the board rather than from the turn's stack — see `takeFromField`.
  "take-field": holdings({
    from: (body, ctx) => ({ seatId: seatOr(body, ctx), fieldCardId: String(body.fieldCardId) }),
    run: (gameId, { seatId, fieldCardId }) => takeFromField(gameId, seatId, fieldCardId),
  }),
  // 12.1's other half: "zabrać leżące złoto". The amount is the player's —
  // see `takeFieldGold`.
  "take-gold": holdings({
    from: (body, ctx) => ({ seatId: seatOr(body, ctx), gold: Number(body.gold) }),
    run: (gameId, { seatId, gold }) => takeFieldGold(gameId, seatId, gold),
  }),
  drop: holdings({
    from: (body) => String(body.holdingId),
    run: (gameId, holdingId) => dropCard(gameId, holdingId),
  }),
  // Spending a card by using it, which is not the same as putting it down:
  // 5.5 leaves a discarded Przedmiot lying on the Obszar for whoever comes
  // next, and a drunk Eliksir is gone. Which cards have a use, and what it
  // costs, is `uses.ts`'s to say and never the request's.
  use: holdings({
    from: (body) => String(body.holdingId),
    run: (gameId, holdingId) => spendHolding(gameId, holdingId),
  }),
  // How somebody's own pack is laid out. Not a move and not journalled — 5.4
  // counts what you carry and has no opinion about the order.
  order: holdings({
    from: (body, ctx) => ({
      seatId: seatOr(body, ctx),
      holdingIds: Array.isArray(body.holdingIds) ? body.holdingIds.map(String) : [],
    }),
    run: (gameId, { seatId, holdingIds }) => reorderPack(gameId, seatId, holdingIds),
  }),
  // The three establishment verbs. What each of them costs is read off the
  // board inside these, never taken from the request.
  buy: holdings({
    from: (body, ctx) => ({ seatId: seatOr(body, ctx), cardId: String(body.cardId) }),
    run: (gameId, { seatId, cardId }) => buyGoods(gameId, seatId, cardId),
  }),
  sell: holdings({
    from: (body, ctx) => ({ seatId: seatOr(body, ctx), holdingId: String(body.holdingId) }),
    run: (gameId, { seatId, holdingId }) => sellHolding(gameId, seatId, holdingId),
  }),
  "heal-paid": holdings({
    from: (body, ctx) => ({ seatId: seatOr(body, ctx), points: Number(body.points) }),
    run: (gameId, { seatId, points }) => payHealer(gameId, seatId, points),
  }),
  // `slot: null` takes it off. The slot itself is validated in `equipCard`
  // against what the card may wear, so anything unrecognised simply fails to
  // fit.
  equip: holdings({
    from: (body) => ({
      holdingId: String(body.holdingId),
      slot: body.slot == null ? null : (String(body.slot) as Slot),
    }),
    run: (gameId, { holdingId, slot }) => equipCard(gameId, holdingId, slot),
  }),
  // Casting is the caster's own act (9.6), but the table screen plays for
  // whoever is sitting there, so the seat is taken from the body like every
  // other action here.
  cast: holdings({
    from: (body, ctx) => ({
      seatId: seatOr(body, ctx),
      holdingId: String(body.holdingId),
      target: {
        ...(typeof body.targetSeat === "number" ? { seatIndex: body.targetSeat } : {}),
        // The Siewca Spustoszenia names a Karta lying on the board, which is a
        // row id rather than a seat — see `applySpell`.
        ...(body.fieldCardId ? { fieldCardId: String(body.fieldCardId) } : {}),
        // And the Obszar itself, for the Zaklęcie thrown at a square.
        ...(body.fieldId ? { fieldId: requireFieldId(String(body.fieldId)) } : {}),
        // The creature standing opposite in the fight on screen, which is a
        // frame rather than a row — see `CastSpell.target`.
        ...(body.foeInFight === true ? { foeInFight: true as const } : {}),
        ...(body.note ? { note: String(body.note) } : {}),
      },
      // The one answer a Zaklęcie asks for: where the Karta it moves is to go.
      // Narrowed here, at the door, like every other field id.
      decided: body.destination ? { destination: requireFieldId(String(body.destination)) } : {},
    }),
    run: (gameId, { seatId, holdingId, target, decided }) =>
      castSpell(gameId, seatId, holdingId, target, decided),
  }),
  /**
   * The Zaklęcie left in the air, taking effect.
   *
   * Any seat may send it, which is the point: the window belongs to the table
   * rather than to the caster, and whoever is watching the clock can close it.
   * With nothing waiting it writes nothing.
   */
  "settle-spell": holdings({
    from: (body) => body.force === true,
    run: async (gameId, force) => ({ settled: await settleSpell(gameId, force) }),
  }),
  spell: holdings({
    from: seatOr,
    run: async (gameId, seatId) => ({ spellId: await drawSpell(gameId, seatId) }),
  }),
  // The Różdżka Zaklęć refilling a hand back up to its setup size. A separate
  // action rather than a flag on the one above, because the condition is the
  // card's and not 2.6's.
  "wand-spell": holdings({
    from: seatOr,
    run: async (gameId, seatId) => ({ spellId: await drawSpellWithWand(gameId, seatId) }),
  }),
  /**
   * The table's answer to 21.2, turned on for good.
   *
   * Any seated player may, not only the host: it takes nothing away from
   * anybody, cannot be undone into a state worth arguing about, and a table
   * that has just watched a Miecz be refused should not have to find out who
   * opened it.
   */
  "endless-stock": holdings({
    from: (body) => body.on !== false,
    run: (gameId, on) => endlessStock(gameId, on),
  }),
  nature: holdings({
    from: (body, ctx) => {
      const nature = body.nature;
      if (nature === "good" || nature === "evil" || nature === "chaotic") {
        return { seatId: seatOr(body, ctx), nature: nature as Natura };
      }
      throw new Error("Nieznana Natura.");
    },
    run: (gameId, { seatId, nature }) => changeNature(gameId, seatId, nature),
  }),
  heal: holdings({
    from: seatOr,
    run: async (gameId, seatId) => ({ life: await healSeat(gameId, seatId) }),
  }),
  stone: holdings({
    from: seatOr,
    run: (gameId, seatId) => turnToStone(gameId, seatId),
  }),
  trade: holdings({
    from: (body, ctx) => ({
      seatId: seatOr(body, ctx),
      deal: {
        // Naming nothing hands in everything, which is what the command means
        // by an absent list — so an empty array is not the same as no array
        // and must not be flattened into one.
        ...(Array.isArray(body.cardIds) ? { cardIds: body.cardIds.map(String) } : {}),
        ...(typeof body.swords === "number" ? { swords: body.swords } : {}),
      },
    }),
    run: async (gameId, { seatId, deal }) => ({ gained: await tradeTrophies(gameId, seatId, deal) }),
  }),
};
