"use client";

import { useState } from "react";
import Image from "next/image";
import type { Character } from "@/data/types";
import { characterStandeeUrl } from "@/lib/engine/cardImages";
import { CardBack, CardTile, type TileCard } from "./card-tile";
import { SEAT_COLOURS } from "@/lib/engine/boardMap";

/**
 * The game screen: a board on the left, everything about you on the right.
 *
 * It does not scroll as a page. A board game is a thing you look *at* — the map,
 * your character and the choice in front of you have to be on screen together,
 * because deciding where to move means comparing all three. The old single
 * column put the board a scroll away from the buttons that acted on it, which is
 * the one arrangement that cannot work.
 *
 * So the frame is exactly the viewport, the two halves are independent, and only
 * the right-hand column scrolls — the board never moves out from under you.
 */
export function TableLayout({
  header,
  map,
  right,
}: {
  header: React.ReactNode;
  map: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-edge px-4 py-2">
        {header}
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Half the screen, and the board is sized to fill it rather than to a
            fixed width: on a laptop the height is what runs out first. */}
        <section className="flex min-h-0 shrink-0 items-center justify-center border-edge p-3 lg:h-full lg:w-1/2 lg:shrink lg:border-r">
          {map}
        </section>
        <section className="min-h-0 flex-1 overflow-y-auto p-3 lg:w-1/2">{right}</section>
      </div>
    </main>
  );
}

export interface PublicSeat {
  id: string;
  seatIndex: number;
  playerName: string | null;
  characterId: string | null;
  fieldName: string;
  miecz: number;
  mieczOwn: number;
  magia: number;
  magiaOwn: number;
  zycie: number;
  zloto: number;
  nature: string | null;
  eliminated: boolean;
  /** Nobody is behind this seat; the character plays on (see leaveGame). */
  abandoned: boolean;
  /** Device has gone quiet — a closed tab rather than a decision. */
  away: boolean;
  isHost: boolean;
  turnsLost: number;
  cards: TileCard[];
  hiddenSpells: number;
}

/**
 * What everyone else at the table has.
 *
 * Everything here is public by the rulebook and shown in full: Przedmioty and
 * Przyjaciele lie face up (5.2, 6.2), points and gold are tokens beside the
 * character card, and where a figure stands is on the board. The single
 * exception is the contents of a spell hand (9.3), which appears as a back with
 * a count on it — the count is public too, since the cards are visibly held,
 * and it is exactly what you weigh before attacking somebody.
 */
export function OtherPlayers({
  seats,
  activeSeatIndex,
  characters,
  onInspect,
  onClaim,
  onKick,
}: {
  seats: PublicSeat[];
  activeSeatIndex: number | null;
  characters: Character[];
  onInspect: (card: TileCard) => void;
  /** Offered only when this device holds no seat of its own. */
  onClaim?: (seatId: string) => void;
  /** Offered only to the host: removes the character and frees the seat. */
  onKick?: (seat: PublicSeat) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(characters.map((character) => [character.id, character]));
  if (seats.length === 0) return null;

  return (
    <section className="mt-3">
      <h2 className="mb-2 text-[11px] uppercase tracking-widest text-muted">
        Pozostali gracze
      </h2>
      <div className="flex flex-col gap-2">
        {seats.map((seat) => {
          const character = seat.characterId ? byId.get(seat.characterId) : null;
          // The small card: a thumbnail of the big one is a page of print too
          // small to read, where the standee is the figure on the board.
          const portrait = character ? characterStandeeUrl(character.id) : null;
          const expanded = open === seat.id;
          const colour = SEAT_COLOURS[seat.seatIndex % SEAT_COLOURS.length];

          return (
            <div
              key={seat.id}
              className={`rounded border bg-panel/50 ${
                seat.seatIndex === activeSeatIndex ? "border-ochre/50" : "border-edge/60"
              } ${seat.eliminated ? "opacity-40" : ""}`}
            >
              <button
                onClick={() => setOpen(expanded ? null : seat.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: colour }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`}
                  <span className="ml-2 text-[11px] text-muted">
                    {character?.name ?? "—"}
                  </span>
                  {/* The character is still in the game; only its player is
                      gone. Worth saying plainly, because whoever is left has to
                      decide whether to play it or leave it standing. */}
                  {seat.isHost && (
                    <span className="ml-2 text-[11px] text-ochre/80">gospodarz</span>
                  )}
                  {seat.abandoned ? (
                    <span className="ml-2 text-[11px] text-vermilion/80">bez gracza</span>
                  ) : seat.away ? (
                    // Quiet, not gone. Says so differently because the two mean
                    // different things at a table: one is a closed tab, the
                    // other is somebody who said they were leaving.
                    <span className="ml-2 text-[11px] text-muted">nieobecny</span>
                  ) : null}
                </span>
                <span className="tnum shrink-0 text-[11px]">
                  <span className="text-miecz">{seat.miecz}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-magia">{seat.magia}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-zycie">{seat.zycie}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-zloto">{seat.zloto}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted">{expanded ? "−" : "+"}</span>
              </button>

              {expanded && (
                <div className="border-t border-edge/60 px-2 py-2">
                  <div className="mb-2 flex items-start gap-3">
                    {portrait && character && (
                      <button
                        onClick={() =>
                          onInspect({
                            cardId: character.id,
                            name: character.name,
                            text: character.abilities.join("\n\n"),
                            kindLabel: `Postać · Miecz ${character.miecz} · Magia ${character.magia} · ${character.nature}`,
                          })
                        }
                        className="shrink-0 rounded border border-edge transition hover:border-ochre"
                      >
                        <Image
                          src={portrait}
                          alt={character.name}
                          width={56}
                          height={94}
                          className="rounded"
                        />
                      </button>
                    )}
                    <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      <Row label="Obszar" value={seat.fieldName} />
                      <Row label="Natura" value={seat.nature ?? "—"} />
                      <Row
                        label="Miecz"
                        value={`${seat.miecz}${seat.miecz !== seat.mieczOwn ? ` (${seat.mieczOwn} własne)` : ""}`}
                      />
                      <Row
                        label="Magia"
                        value={`${seat.magia}${seat.magia !== seat.magiaOwn ? ` (${seat.magiaOwn} własne)` : ""}`}
                      />
                      {seat.turnsLost > 0 && (
                        <Row label="Traci tur" value={String(seat.turnsLost)} />
                      )}
                    </dl>
                  </div>

                  {onKick && <KickButton seat={seat} onKick={onKick} />}

                  {seat.abandoned && onClaim && (
                    <button
                      onClick={() => onClaim(seat.id)}
                      className="mb-2 rounded border border-ochre/60 px-2 py-1 text-[11px] text-ochre transition hover:bg-ochre/10"
                    >
                      Przejmij tę postać
                    </button>
                  )}

                  {(seat.cards.length > 0 || seat.hiddenSpells > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {seat.cards.map((card, index) => (
                        <CardTile
                          key={`${card.cardId}-${index}`}
                          card={card}
                          onClick={() => onInspect(card)}
                        />
                      ))}
                      {seat.hiddenSpells > 0 && <CardBack count={seat.hiddenSpells} />}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The host removing a player mid-game.
 *
 * Unlike leaving, this really does take the character out — but not what it was
 * carrying: the Przedmioty, Przyjaciele and gold are left on its Obszar for
 * whoever stops there next (12.1), because a character vanishing with four
 * items in its hands quietly makes the whole table poorer.
 *
 * Two clicks, and the second one says what it does.
 */
function KickButton({
  seat,
  onKick,
}: {
  seat: PublicSeat;
  onKick: (seat: PublicSeat) => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="mb-2 mr-2 rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-vermilion hover:text-vermilion"
      >
        Usuń ze stołu
      </button>
    );
  }
  return (
    <span className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-vermilion">
        Postać zniknie, rzeczy zostaną na Obszarze. Na pewno?
      </span>
      <button
        onClick={() => onKick(seat)}
        className="rounded border border-vermilion/60 px-1.5 text-vermilion"
      >
        tak
      </button>
      <button onClick={() => setArmed(false)} className="text-muted hover:text-ink">
        nie
      </button>
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </>
  );
}
