"use client";

/**
 * Who is at this table, and what can be done about them.
 *
 * A drawer rather than a modal, and above the modals rather than under them.
 * Both follow from the same thing: the questions it answers are about the
 * *table*, not about the turn — where is everybody, what is Karol carrying,
 * has Ola's tab closed, can the host let somebody go — and every one of them is
 * asked most often while something else is on screen. A fight is exactly when
 * you want to know what the character you are about to attack is holding.
 *
 * So it slides in over the right-hand column and leaves the board alone, and
 * the board is the half you are looking at when you ask.
 *
 * It shows every seat, your own included. The roster it grew out of was called
 * "pozostali gracze" and left you out of it, which is fine for a column beside
 * your own card and wrong for the one place that answers "who is playing".
 */

import { useState } from "react";
import { Lookable } from "./lookable";
import Image from "next/image";
import type { Character } from "@/data/types";
import { characterStandeeUrl } from "@/lib/view/cardImages";
import { SEAT_COLOURS } from "@/lib/view/boardMap";
import { asCharacterId } from "@/lib/engine/characters";
import { CardBack, CardTile, type TileCard } from "./card-tile";
import type { PublicSeat } from "./table-layout";
import { Drawer } from "./drawer";
import { NATURE_LABEL, characterKind } from "@/lib/engine/polish";

export function PlayersDrawer({
  seats,
  openSeatId,
  characters,
  activeSeatIndex,
  mySeatId,
  amHost,
  room,
  busy,
  onClose,
  onInspect,
  onClaim,
  onKick,
  onPassHost,
  onJoin,
}: {
  /** Every seat, in seat order — yours among them. */
  seats: PublicSeat[];
  /**
   * A seat to open on, for a drawer that was opened *about* somebody.
   *
   * Arriving here from a player's name means the question was about them, and
   * a list that opens with everything shut makes you ask it again with a
   * click.
   */
  openSeatId?: string | null;
  characters: Character[];
  activeSeatIndex: number | null;
  mySeatId: string | null;
  amHost: boolean;
  /** Whether a newcomer would fit (2-6). */
  room: boolean;
  busy: boolean;
  onClose: () => void;
  onInspect: (card: TileCard) => void;
  /** Take a character nobody is behind. Offered only to a device with no seat. */
  onClaim?: (seatId: string) => void;
  /** Host only: takes the character out and leaves what it carried on its Obszar. */
  onKick?: (seat: PublicSeat) => void;
  /** Host only: hands the role to somebody who is staying. */
  onPassHost?: (seat: PublicSeat) => void;
  /** Sit down as somebody new. Offered only to a device with no seat. */
  onJoin?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(openSeatId ?? null);
  const byId = new Map(characters.map((character) => [character.id, character]));

  return (
    <Drawer
      side="right"
      title={
        <>
          Gracze <span className="tnum text-muted">{seats.length}/6</span>
        </>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-2 p-3">
        {seats.map((seat) => {
          const real = asCharacterId(seat.characterId);
          const character = real ? (byId.get(real) ?? null) : null;
          const portrait = character ? characterStandeeUrl(character.id) : null;
          const expanded = open === seat.id;
          const mine = seat.id === mySeatId;
          const colour = SEAT_COLOURS[seat.seatIndex % SEAT_COLOURS.length];

          return (
            <div
              key={seat.id}
              className={`rounded border bg-panel/50 ${
                seat.seatIndex === activeSeatIndex ? "border-ochre/60" : "border-edge/60"
              } ${seat.eliminated ? "opacity-50" : ""}`}
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
                  {/* Your own row is named, because a list of everybody that
                      does not say which one is you is a list you have to count
                      your way through. */}
                  {mine && <span className="ml-1 text-[11px] text-ochre">(ty)</span>}
                  <span className="ml-2 text-[11px] text-muted">
                    {character ? (
                      <Lookable kind="character" id={character.id} name={character.name} />
                    ) : (
                      "wybiera Postać"
                    )}
                  </span>
                  {seat.isHost && (
                    <span className="ml-2 text-[11px] text-ochre/80">gospodarz</span>
                  )}
                  {/* The character is still in the game; only its player is
                      gone. Worth saying plainly — whoever is left has to decide
                      whether to play it or leave it standing. */}
                  {!seat.driven ? (
                    <span className="ml-2 text-[11px] text-vermilion/80">bez gracza</span>
                  ) : seat.away ? (
                    <span className="ml-2 text-[11px] text-muted">nieobecny</span>
                  ) : null}
                </span>
                <span className="tnum shrink-0 text-[11px]">
                  <span className="text-miecz">{seat.miecz}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-magia">{seat.magia}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-zycie">{seat.life}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-zloto">{seat.gold}</span>
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
                            character: true,
                            text: character.abilities.join("\n\n"),
                            kindLabel: characterKind(character),
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
                      <Row
                        label="Obszar"
                        value={
                          seat.fieldId ? (
                            <Lookable kind="field" id={seat.fieldId} name={seat.fieldName} />
                          ) : (
                            seat.fieldName
                          )
                        }
                      />
                      {/* The stored key is English like every other key; the table is not.
                          This one printed `evil` at a Polish table for as long as
                          the roster has had a Natura row in it. */}
                      <Row
                        label="Natura"
                        value={seat.nature ? (NATURE_LABEL[seat.nature] ?? seat.nature) : "—"}
                      />
                      <Row
                        label="Miecz"
                        value={`${seat.miecz}${seat.miecz !== seat.swordOwn ? ` (${seat.swordOwn} własne)` : ""}`}
                      />
                      <Row
                        label="Magia"
                        value={`${seat.magia}${seat.magia !== seat.magicOwn ? ` (${seat.magicOwn} własne)` : ""}`}
                      />
                      {seat.turnsLost > 0 && (
                        <Row label="Traci tur" value={String(seat.turnsLost)} />
                      )}
                    </dl>
                  </div>

                  {/* 5.2 and 6.2 put these face up, so they are everybody's to
                      read. A spell hand is 9.3's and shows as a back. */}
                  {(seat.cards.length > 0 || seat.hiddenSpells > 0) && (
                    <div className="mb-2 flex flex-wrap gap-2">
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

                  <div className="flex flex-wrap gap-2">
                    {!seat.driven && onClaim && (
                      <button
                        onClick={() => onClaim(seat.id)}
                        disabled={busy}
                        className="rounded border border-ochre/60 px-2 py-1 text-[11px] text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
                      >
                        Przejmij tę postać
                      </button>
                    )}
                    {/* Handing the role on rather than losing it: a host who has
                        to leave takes the table's only administrator with them
                        otherwise, and `claimTableScreen` will only let somebody
                        else take it once they have actually gone quiet. */}
                    {amHost && onPassHost && !mine && seat.driven && (
                      <button
                        onClick={() => onPassHost(seat)}
                        disabled={busy}
                        className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-ochre hover:text-ochre disabled:opacity-40"
                      >
                        Przekaż gospodarza
                      </button>
                    )}
                    {onKick && !mine && <KickButton seat={seat} busy={busy} onKick={onKick} />}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* The other half of joining, for a device that is only watching. */}
        {onJoin && (
          <button
            onClick={onJoin}
            disabled={busy || !room}
            className="mt-1 rounded border border-ochre/60 px-2 py-2 text-[11px] text-ochre transition hover:bg-ochre/10 disabled:border-edge disabled:text-muted"
          >
            {room ? "Dosiądź się nową Postacią" : "Stół jest pełny (2-6 graczy)"}
          </button>
        )}
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </>
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
  busy,
  onKick,
}: {
  seat: PublicSeat;
  busy: boolean;
  onKick: (seat: PublicSeat) => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-vermilion hover:text-vermilion"
      >
        Usuń gracza
      </button>
    );
  }
  return (
    <button
      onClick={() => {
        setArmed(false);
        onKick(seat);
      }}
      disabled={busy}
      className="rounded border border-vermilion/60 bg-vermilion/10 px-2 py-1 text-[11px] text-vermilion disabled:opacity-40"
    >
      Na pewno? Postać znika, rzeczy zostają na Obszarze
    </button>
  );
}
