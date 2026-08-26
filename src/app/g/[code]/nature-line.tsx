/** 7.2's Karta Zmiany Natury, lying beside the Karta Postaci — or the sentence that stands in for it. */

import Image from "next/image";
import { NATURE_CARD_RATIO, natureCardUrl } from "@/lib/view/cardImages";
import { NATURE_LABEL } from "@/lib/engine/polish";


/**
 * Under half the Karta Postaci it lies below, and no taller than a line of it.
 *
 * The card is 192 across and this is much the smaller object of the two — a
 * marker put down beside a card, not a second card, and a marker that has to
 * stay a marker when four seats are on screen at once. Fifty-one tall, which
 * is where it was when it was a third as wide: the card grew sideways to give
 * CHAOTYCZNY its room, and growing in the other direction was never the point.
 */
const NATURE_CARD_WIDTH = 88;

export 
/**
 * One thing that is true of a character, beside the name it is true of.
 *
 * The card's own illustration where a card is what did it — an Eliksir is
 * recognised by its picture the way everything else in this app is. A shape is
 * the fallback and is what the effects with no card behind them get: a lost
 * turn and a barred Most are rules, not things.
 *
 * Hovering opens the whole Karta, the same preview a card in the pack opens,
 * because the question "what is this doing to me" is answered by the card that
 * did it. How long it has left rides in where the class label usually goes —
 * that part belongs to this instance rather than to the card, and it is the
 * half a player is deciding around.
 */
/**
 * What Natura this character is of, said the way 7.2 says it.
 *
 * The Karta Postaci prints one, and while that is still true the app has no
 * business printing it a second time — so this is a quiet line under the card,
 * repeating what the card already says only because the card is drawn small
 * enough that reading it means opening it.
 *
 * A change is a different thing entirely, and the box has an object for it:
 * "Gdy Postać zmienia swoją Naturę, obok jej Karty musi zostać umieszczona
 * Karta Zmiany Natury... Jeżeli Postać powróci później do swojej pierwotnej
 * Natury, Kartę Zmiany należy odłożyć." So the plaque is laid beside the card
 * exactly while the two disagree, and taken away the moment they stop — which
 * is the rule, drawn, rather than a badge somebody had to invent.
 *
 * A Kat prints no Natura at all and picks one at setup (8.2), which is not a
 * change and gets no card: there is nothing for the Karta Zmiany to disagree
 * with, and the line under the card is the only place that Natura is written
 * down at all.
 */
function NatureLine({
  nature,
  printed,
}: {
  nature: string | null;
  /** What the Karta Postaci has printed on it — "any" for a Kat. */
  printed: string;
}) {
  // A line rather than a whisper. It is the only place a Natura is written down
  // when there is no card beside the Karta to say it, and at ten pixels it was
  // being read as a caption on the card above it.
  const quiet = "mt-1 text-center text-[12px] text-muted";
  if (nature === null) return <p className={quiet}>Natura nieustalona</p>;

  const changed = printed !== "any" && nature !== printed;
  const art = changed ? natureCardUrl(nature) : null;
  if (!art) {
    // "Niezmieniona" and not just the Natura, because the absence of a Karta
    // Zmiany Natury is itself the statement 7.2 makes — and an absence is not
    // something a screen can show by leaving a gap where a card would be. This
    // line is that card not being there, said out loud.
    return (
      <p className={quiet}>
        Natura niezmieniona: {NATURE_LABEL[nature] ?? nature}
      </p>
    );
  }

  return (
    <span className="mt-1 flex justify-center">
      <Image
        src={art}
        alt={`Karta Zmiany Natury: ${NATURE_LABEL[nature] ?? nature}`}
        // The whole of it in words, the way an effect's mark beside the name
        // carries its own. A marker on a table is a reminder that something is
        // true; what it means is a question you ask it, and the question mark
        // on the cursor is what says it can be asked.
        title={
          `Karta Zmiany Natury (7.2): ${NATURE_LABEL[printed] ?? printed}` +
          ` → ${NATURE_LABEL[nature] ?? nature}.` +
          " Leży przy Karcie Postaci, dopóki natura nie wróci do wydrukowanej."
        }
        width={NATURE_CARD_WIDTH}
        height={Math.round(NATURE_CARD_WIDTH / NATURE_CARD_RATIO)}
        // No border of its own: the card is printed on a blue field with a
        // die-cut edge, and an outline round that is an outline round an edge.
        className="cursor-help rounded-[2px]"
        unoptimized
      />
    </span>
  );
}
