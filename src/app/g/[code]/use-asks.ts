"use client";

/**
 * The questions asked before an act the rules give no way back from: spending
 * a Karta, dropping one, speaking a Zaklęcie, leaving the table.
 */

/**
 * Why a hook, and why these four together.
 *
 * Each of them builds a `Confirmation` and hands it to the one dialog the app
 * asks everything in — the poczekalnia's three questions go through the same
 * one — and each says, in the question, what will actually happen: where the
 * dropped card will be lying, that the Zaklęcie leaves the hand for good, that
 * the Postać stays on the board without you. They lived in `page.tsx` between
 * the effects and the render, closing over the table; here they close over
 * what they are handed and own the dialog's state, which is theirs.
 */

import { useState } from "react";
import type { Confirmation } from "./confirm";
import { CARD_NAMES, type Seat } from "./table";
import type { FieldCard, Game, Table } from "./use-table";
import { asFieldId } from "@/lib/engine/board";
import { fieldName } from "@/lib/engine/polish";
import { askAbout, usageOf } from "@/lib/engine/uses";
import { spellScript } from "@/lib/engine/spells";
import { overflowOnTop } from "@/lib/engine/overflow";

/**
 * What an Obszar is called, from an id that has not been narrowed yet.
 *
 * A picker hands its answer back as a plain string — that is what a DOM value
 * is — and the guard belongs here rather than at every place that reads one.
 * Unknown ids print themselves, which is what every other name lookup here does.
 */
function fieldNamed(fieldId: string): string {
  const known = asFieldId(fieldId);
  return known === null ? fieldId : fieldName(known);
}

/** Where a Zaklęcie is aimed, as the hand hands it up. */
export interface CastTarget {
  seatIndex?: number;
  fieldCardId?: string;
  fieldId?: string;
  /** Where the Karta goes, for the one Zaklęcie that moves one. */
  destination?: string;
}

export interface AsksInput {
  game: Game | null;
  seats: Seat[];
  fieldCards: FieldCard[];
  mySeatIndex: number | null;
  post: Table["post"];
  leave: () => Promise<void>;
  /** One ask per card while it is out — see `askFor` in `page.tsx`. */
  askFor: (id: string, run: () => Promise<unknown>) => Promise<void>;
}

export type Asks = ReturnType<typeof useAsks>;

export function useAsks({ game, seats, fieldCards, mySeatIndex, post, leave, askFor }: AsksInput) {
  /**
   * The irreversible thing waiting to be confirmed.
   *
   * Spending a card and speaking a Zaklęcie are the two acts here that cannot
   * be taken back by the person they happen to — the Karta is gone, and 9.6 has
   * the spell reaching its victim anywhere on the board. The poczekalnia
   * already asks before its three, and this is the same dialog.
   */
  const [ask, setAsk] = useState<Confirmation | null>(null);

  /**
   * Asks before a card is spent, and spends it on a yes.
   *
   * Nine Przedmioty are one act rather than a possession — the Karta goes on
   * the used pile whatever comes of it — so this is the one place in the pack
   * where a misclick costs something that cannot be put back. `uses.ts` writes
   * the question, so the words are the same here as in the hover.
   */
  function askToUse(holdingId: string, cardId: string) {
    const spend = usageOf(cardId);
    if (!spend) return;
    const name = CARD_NAMES.get(cardId) ?? cardId;
    setAsk({
      title: `Użyj: ${name}`,
      body: askAbout(name, spend),
      confirmLabel: "Użyj",
      // Red, like everything that takes something away from somebody — here
      // from the person pressing it.
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        /* No die shown for this one, unlike a Karta's own table or an Obszar's:
           the face stands in the place the button that threw it was standing,
           and a Przedmiot spent from the pack has no such place. What it did is
           in the Dziennik, where it was before. */
        post("holdings", { action: "use", holdingId });
      },
    });
  }

  /**
   * Leaving, asked in the dialog everything else is asked in.
   *
   * Two answers to one act, which is why the question is here rather than in
   * the button: in the poczekalnia the seat goes with you, and mid-game the
   * Postać stays on the board without a driver for somebody else to take over.
   * The second is the one worth stopping somebody over, and it used to be a
   * sentence squeezed into the bar between a join code and a test-mode switch.
   */
  function askToLeave() {
    const playing = game?.status === "playing" && mySeatIndex !== null;
    setAsk({
      title: "Opuść stół",
      body: playing
        ? "Twoja Postać zostanie w grze, na swoim Obszarze i ze wszystkim, co ma — tyle że bez gracza, dopóki ktoś jej nie przejmie. Ty zostajesz przy stole jako widz."
        : "Twoje miejsce przy stole zniknie. Wrócić można tym samym kodem, dopóki gra się nie zaczęła.",
      confirmLabel: "Opuść stół",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        void leave();
      },
    });
  }

  /**
   * Asks before a card is thrown away, because it is not thrown away.
   *
   * 5.5 does not destroy what a character puts down: the card stays face up on
   * the Obszar it was dropped on, and 16.8 and 21.3 let the next person through
   * pick it up. So this costs less than using a card and more than it looks —
   * one click under every card in the pack, and a Magiczny Miecz left in the
   * Karczma is a present for whoever walks in.
   *
   * The question says where it will be lying, because that is the part a player
   * is deciding and the button cannot say it.
   */
  function askToDrop(holdingId: string) {
    const seat = seats.find((candidate) => candidate.seat_index === mySeatIndex);
    const held = seat?.holdings.find((candidate) => candidate.id === holdingId);
    if (!held) return;
    const name = CARD_NAMES.get(held.cardId) ?? held.cardId;
    const here = seat?.field_id ? fieldName(seat.field_id) : null;
    const where = here ? `na Obszarze ${here}` : "na Obszarze";
    /**
     * Two words for two destinations, and the dialog is where the difference
     * is worth spelling out.
     *
     * „Upuść" for a Przedmiot or a Przyjaciel: the Karta lies face up on the
     * Obszar you are standing on and 12.1 lets the next visitor take it, so
     * nothing is destroyed and the table can see where it went. „Odrzuć" for a
     * Zaklęcie, which goes on the stos Kart już zużytych (9.6) — out of the
     * hand for good, and back into circulation only when 9.5 reshuffles the
     * pile. The app said „odrzuć" for all three, which is the rulebook's verb
     * for both and the wrong word for one of them here, because a player
     * reading a button wants to know where the card is going.
     */
    const spell = held.kind === "spell";
    /**
     * A Przedmiot shed because its Sakwa or Tragarz perished does not lie
     * anywhere — the two cards say what they carried goes with them — so the
     * question must not promise the Obszar. The frame on top says why the
     * seat is over; `dropCard` reads the same frame to send the Karta to the
     * used pile instead of the square.
     */
    const perished =
      held.kind === "item" && game !== null
        ? overflowOnTop(game.turn_state)?.because
        : undefined;
    const destroyed = perished?.kind === "container-lost";
    setAsk({
      title: `${spell ? "Odrzuć" : destroyed ? "Zniszcz" : "Upuść"}: ${name}`,
      /**
       * A Przyjaciel is left, not thrown away, and the rule is his own.
       *
       * 5.5 is about a Przedmiot and 6.4 about him — „pozostawiając jego
       * Kartę, na Obszarze, na którym aktualnie się znajduje" — and the two
       * sentences differ in what happens next as well as in the number: a card
       * is picked up, and he *goes with* whoever picks him up. Saying it in the
       * dialog is the last moment anybody is deciding.
       */
      body: spell
        ? // Said plainly, because this is the one card that does not come back:
          // 9.4 only lets it go while there is a surplus, and 9.6's pile is
          // where it goes rather than the Obszar underneath you.
          `${name} trafi na stos Kart już zużytych — nie zostanie na Obszarze i nikt jej stąd nie weźmie (9.4, 9.6).`
        : held.kind === "friend"
          ? `Zostawisz jego Kartę ${where} — kto się tu zatrzyma, może go wziąć ze sobą (6.4, 12.1).`
          : destroyed && perished
            ? `${CARD_NAMES.get(perished.cardId) ?? perished.cardId} przepadła, a z nią to, co niosła: ${name} trafi na stos Kart już zużytych i nie zostanie na Obszarze.`
            : `${name} zostanie ${where}, odkryta — kto się tu zatrzyma, może ją wziąć (5.5, 16.8).`,
      confirmLabel: spell ? "Odrzuć" : destroyed ? "Zniszcz" : "Upuść",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        void askFor(holdingId, () => post("holdings", { action: "drop", holdingId }));
      },
    });
  }

  /**
   * The same question before a Zaklęcie is spoken.
   *
   * 9.6 puts the spell on its victim wherever they are standing and takes the
   * card out of the hand for good, and until now that was one click of a button
   * sitting under every card in the hand.
   */
  function askToCast(
    holdingId: string,
    cardId: string,
    target: CastTarget = {},
  ) {
    const name = CARD_NAMES.get(cardId) ?? cardId;
    const lying = fieldCards.find((row) => row.id === target.fieldCardId);
    const at =
      target.seatIndex !== undefined
        ? ` na: ${seats.find((seat) => seat.seat_index === target.seatIndex)?.player_name ?? `Miejsce ${target.seatIndex + 1}`}`
        : lying
          ? ` na: ${CARD_NAMES.get(lying.cardId) ?? lying.cardId}` +
            (target.destination ? ` → ${fieldNamed(target.destination)}` : "")
          : target.fieldId
            ? ` na: ${fieldNamed(target.fieldId)}`
            : "";
    // Two of them the app carries out, and both of those take cards away for
    // good — so the question says what will actually happen rather than the
    // usual "rozpatrzcie sami", which would be untrue here and is the only
    // sentence standing between a player and a hand they cannot get back.
    const applied = spellScript(cardId)?.applies;
    const what =
      applied === "gasi-zaklecia"
        ? "Ofiara traci wszystkie Zaklęcia — ich Karty idą na stos zużytych (9.6). Zrobi to aplikacja."
        : applied === "zdejmuje-karte"
          ? "Karta znika z planszy i trafia na stos zużytych. Zrobi to aplikacja."
          : "Skutek rozpatrzcie sami.";
    setAsk({
      title: `Rzuć Zaklęcie: ${name}`,
      body:
        `${name}${at}. Karta odchodzi z ręki na stos kart zużytych i cały stół dowiaduje się, ` +
        `co zostało wypowiedziane (12.5). ${what}`,
      confirmLabel: "Rzuć",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", {
          action: "cast",
          seatId: seats.find((seat) => seat.seat_index === mySeatIndex)?.id,
          holdingId,
          ...(target.seatIndex !== undefined ? { targetSeat: target.seatIndex } : {}),
          ...(target.fieldCardId !== undefined ? { fieldCardId: target.fieldCardId } : {}),
          ...(target.fieldId !== undefined ? { fieldId: target.fieldId } : {}),
          ...(target.destination !== undefined ? { destination: target.destination } : {}),
        });
      },
    });
  }

  return { ask, setAsk, askToUse, askToLeave, askToDrop, askToCast };
}
