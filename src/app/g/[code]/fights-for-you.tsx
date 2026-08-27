/** Who is swinging, when it is not the character — the line that keeps a falling number from reading as a bug. */

import Image from "next/image";
import { ART_RATIO, cardArtUrl } from "@/lib/view/cardImages";
import type { CardId } from "@/data/ids";
import { CARD_NAMES } from "./table";

/**
 * Small, because it is a caption and not a card.
 *
 * The Karta Postaci above it is 192 across and the Karta Zmiany Natury beside
 * it is 88; this is the illustration alone, at the size the pack draws a card's
 * picture, because what it has to do is let somebody recognise the Rycerz — not
 * be read.
 */
const ART_WIDTH = 34;

/**
 * The Przyjaciel fighting in the character's place (6.2).
 *
 * This exists for one reason, and it is not decoration. The Rycerz's card says
 * his 3 and 3 are used "zamiast" the character's own — they *replace* the pair
 * rather than adding to it — so for every Postać that starts above three, the
 * fight figure **falls** when he arrives. A number that goes down when you gain
 * a card is indistinguishable from a bug in the app unless something on screen
 * names the card doing it. That is this line's whole job.
 *
 * Drawn rather than left on the rail's hover. The hover carries the figure
 * already, and would be the obvious place to carry the reason too — but phones
 * are the primary device at a table and have no hover, so a hover-gated
 * explanation is no explanation for most of the people who need it. The same
 * reasoning that keeps the +/- overrides always visible on the rails.
 *
 * Silent when nobody is standing in, which is nearly always. A permanent line
 * reading "walczysz sam" would be the app announcing the absence of a card
 * nobody has — and it is under the rails, where the two figures it explains
 * are, rather than in the pack where the card physically sits.
 */
export function FightsForYou({
  cardId,
  sword,
  magic,
}: {
  /** The friend swinging, or null for the usual case — the character's own arms. */
  cardId: CardId | null;
  /** What the pair became, which is what wants explaining. */
  sword: number;
  magic: number;
}) {
  if (cardId === null) return null;

  const name = CARD_NAMES.get(cardId) ?? cardId;
  const art = cardArtUrl(cardId);

  return (
    <p
      title={
        `${name} walczy za ciebie (6.2): w walce liczą się jego punkty` +
        ` — Miecz ${sword}, Magia ${magic} — zamiast twoich własnych,` +
        " więc dla większości Postaci ta liczba spada, i tak ma być."
      }
      className="mt-1 flex cursor-help items-center justify-center gap-1.5 text-[12px] text-ochre/90"
    >
      {art && (
        <Image
          src={art}
          alt=""
          width={ART_WIDTH}
          height={Math.round(ART_WIDTH / ART_RATIO)}
          className="shrink-0 rounded-[2px]"
          unoptimized
        />
      )}
      {/* "Za ciebie" and not "zamiast ciebie": the card is fighting on your
          behalf, which is the part a player wants to know, and the replacing
          is what the figures beside it are already showing. */}
      <span>
        W walce bije się {name} — {sword} / {magic}
      </span>
    </p>
  );
}
