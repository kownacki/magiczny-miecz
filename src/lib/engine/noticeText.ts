/** What to tell the player who just pressed the button — second person, immediately, with the dice. */

import { FIELDS, isFieldId } from "./board";

/**
 * Not the journal, and deliberately not.
 *
 * `journalText` writes the third-person record everybody reads afterwards —
 * "Michał wpada w Pułapkę" — kept terse because it scrolls, and gender-neutral
 * because a name typed into a box cannot be declined. This is the other thing:
 * one line to the person who just acted, in the second person, with the numbers
 * quoted. "Spadasz na Osadę" needs no gender and no name, which is exactly why
 * it can afford to be direct where the journal cannot.
 *
 * Both render the same events. Folding them together would make the journal
 * chatty or this impersonal, so they stay two — but this half used to live in
 * the page component, which is the only reason it was the untested one.
 */
export function describeResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const data = result as {
    dice?: number[];
    magia?: number;
    outcome?: string;
    spell?: string;
    effect?: string;
    /** The Kamienny Most's own fields (14.5-14.6). */
    kind?: string;
    /** 19.1, which is answered rather than rolled. */
    succeeded?: boolean;
    onBridge?: boolean;
    to?: string;
    lost?: string[];
    kept?: string[];
    lifeLost?: number;
    enemyTotal?: number;
    healed?: number;
    paid?: number;
    /** A field's die table or a card's script, thrown and applied by the server. */
    offer?: string;
    card?: string;
    face?: number;
    did?: string[];
    /** A used card the app could not finish working out — see `uses.ts`. */
    stol?: boolean;
  };
  // 19.1 is answered, not rolled — an escape works because an ability says so.
  // "No" is therefore a real result, and it changes nothing on the board, so
  // saying it is the only way to tell it apart from the button doing nothing.
  if (typeof data.succeeded === "boolean" && typeof data.onBridge === "boolean") {
    return data.succeeded
      ? "Wymknąłeś się (19.1) — nie możesz już nic zrobić temu, przed czym uciekłeś."
      : "Nie udało się wymknąć: twoja Postać nie potrafi tego na tym Obszarze (19.1).";
  }

  // A spell has to be announced loudly: 9.6 reaches its victim anywhere on the
  // board, so the person it lands on may not be looking at this turn at all.
  if (data.spell) return `Rzucono Zaklęcie: ${data.spell}. ${data.effect ?? ""}`.trim();

  // The bridge. These are the most expensive things that happen in the game —
  // a fall from the Pułapka takes two thirds of everything a character owns —
  // and they used to happen in silence, the figure simply appearing somewhere
  // else with a lighter pack. The dice are quoted because at a table somebody
  // always asks to see them.
  const roll = (dice?: number[]) => (dice ?? []).join(" + ");
  switch (data.kind) {
    case "pulapka": {
      const sum = (data.dice ?? []).reduce((total, die) => total + die, 0);
      if (data.outcome === "uniknieta") {
        return `Pułapka: ${roll(data.dice)} = ${sum} — mniej niż twoje punkty, zostajesz na miejscu.`;
      }
      // Straight off the wire, so it is looked up rather than trusted.
      const where = (isFieldId(data.to) ? FIELDS.get(data.to)?.name : null) ?? data.to ?? "?";
      const lost = data.lost?.length ? `Tracisz: ${data.lost.join(", ")}.` : "Nic nie tracisz.";
      const kept = data.kept?.length ? ` Zostaje przy tobie: ${data.kept.join(", ")}.` : "";
      return `Pułapka: ${roll(data.dice)} = ${sum} — spadasz na ${where}. ${lost}${kept}`;
    }
    case "gra-ze-smiercia": {
      const mine = (data.dice ?? []).slice(0, 2);
      const deaths = (data.dice ?? []).slice(2);
      const verdict =
        data.outcome === "dalej"
          ? "wygrywasz — idziesz dalej"
          : data.outcome === "znowu"
            ? "remis — grasz jeszcze raz w następnej turze"
            : "przegrywasz — tracisz 1 Życia i grasz dalej";
      return `Gra ze Śmiercią: ty ${roll(mine)} przeciw ${roll(deaths)} — ${verdict}.`;
    }
    case "cerber":
      return `Cerber: ${roll(data.dice)} — tracisz ${data.lifeLost} Życia.`;
    case "straznik":
      return `${data.outcome}: ${roll(data.dice)} — jego siła to ${data.enemyTotal}. Nie przejdziesz, póki nie zginie.`;
  }

  // A die table the app rolled and acted on. The player pressed one button and
  // did not see either half, so both are said: the face, and what it did.
  const source = data.offer ?? data.card;
  if (source && (typeof data.face === "number" || data.did)) {
    const did = data.did?.length ? data.did.join(", ") : "nic się nie dzieje";
    const rolled = typeof data.face === "number" ? `wypadło ${data.face} — ` : "";
    // A spent card whose effect the app cannot carry out says so, rather than
    // reading like something that has already been applied. The Karta is gone
    // either way; what is left is the table's to do.
    const owed = data.stol ? " — rozpatrzcie sami." : ".";
    return `${source}: ${rolled}${did}${owed}`;
  }

  // Paying a healer: what the money and 4.7 between them actually bought.
  if (typeof data.healed === "number") {
    return `Wyleczone: ${data.healed} ${data.healed === 1 ? "punkt" : "punkty"} Życia za ${data.paid} Sz. Z.`;
  }

  if (!Array.isArray(data.dice) || typeof data.magia !== "number") return null;
  const total = data.dice.reduce((sum, die) => sum + die, 0);
  const verdict =
    data.outcome === "udana" ? "przeprawa udana" : "porażka — tracisz 1 Życie";
  return `Trzęsawiska: ${data.dice.join(" + ")} = ${total} przeciw Magii ${data.magia} — ${verdict}.`;
}
