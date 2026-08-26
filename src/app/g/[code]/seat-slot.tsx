"use client";

/**
 * One chair at the table, taken or free: the row of six across the middle of
 * the poczekalnia.
 *
 * What a slot shows is who is sitting there, what they have chosen, and what
 * can be done about them — and, for the seat with nobody in it, the one way a
 * seat is filled other than somebody opening the link.
 */

import Image from "next/image";
import { useState } from "react";
import type { Character } from "@/data/types";
import type { SeatCharacter } from "@/lib/engine/characters";
import {
  seatColour,
  seatName,
  seatNameInline,
  seatPortrait,
  seatReadiness,
  seatStanding,
  type LobbySeat,
} from "./lobby-view";

/**
 * One seat, tall rather than wide: six have to sit side by side, and what a slot
 * shows — a portrait, a name, a state — stacks naturally.
 */
export function SeatSlot({
  seat,
  character,
  isMine,
  isTarget,
  selectable,
  canAdminister,
  isHost,
  busy,
  onSelect,
  onRemove,
  onMakeHost,
  onReady,
  onPreview,
}: {
  seat: LobbySeat;
  character: Character | null;
  isMine: boolean;
  isTarget: boolean;
  selectable: boolean;
  /** May take the host role — the wide door, open once the host has gone. */
  canAdminister: boolean;
  /** Actually holds the role. Removing somebody is the host's and only the host's. */
  isHost: boolean;
  busy: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMakeHost: () => void;
  /** Only your own slot gets this. */
  onReady?: (ready: boolean) => void;
  /** Points the reading column at this player's character while pointed at. */
  onPreview: (characterId: SeatCharacter | null) => void;
}) {
  const portrait = seatPortrait(seat, character);
  const colour = seatColour(seat);
  const standing = seatStanding(seat, isMine);
  const readiness = seatReadiness(seat);

  return (
    <div
      onMouseEnter={() => onPreview(seat.characterId)}
      onMouseLeave={() => onPreview(null)}
      style={{ borderTopColor: colour, borderTopWidth: 3 }}
      className={`relative flex h-full max-h-[340px] w-[190px] shrink-0 flex-col rounded-lg border p-2 ${
        isTarget
          ? "border-ochre bg-panel"
          : seat.ready
            ? "border-verdigris/60 bg-panel"
            : isMine
              ? "border-ochre/50 bg-panel"
              : "border-edge bg-panel/50"
      }`}
    >
      {/* Everything above the card, at a height that never changes.
          
          The standee is the one thing on this slot you read at a glance across
          a table, and it used to grow and shrink: it took whatever vertical
          space was left over, so a seat gained height when "zrób gospodarzem"
          went away and lost it when the host badge appeared. Six slots side by
          side, each with a different-sized figure, and none of the differences
          meaning anything. Every row around the card is now a fixed height and
          the card gets the constant remainder. */}
      <div className="flex h-[48px] shrink-0 flex-col">
        <p className="flex h-6 items-center gap-1.5 truncate pr-4 font-[family-name:var(--font-display)] text-base text-ink">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: colour }}
            aria-hidden
          />
          <span className="truncate">{seatName(seat)}</span>
        </p>
        {/* One row for who this seat is and what can be done about it.
            
            They belong together and they are mutually exclusive: a seat that is
            already the host is never offered "zrób gospodarzem", so the badge
            and the button occupy the same line rather than two, and the same
            line on every slot. Two rows meant Michał's "gospodarz" sat a line
            above Ola's button, which read as a misalignment because it was one.

            Removing lives here too, next to promoting, instead of as an × in
            the corner: both are things the host does to somebody else's seat,
            and a × the size of a full stop is a poor control for taking a
            player's seat away. */}
        <div className="mt-0.5 flex h-[22px] items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[12px] leading-none">
            {seat.isHost && <span className="text-ochre">gospodarz</span>}
            {seat.isHost && standing !== null && <span className="text-muted"> · </span>}
            {standing === "gone" ? (
              <span className="text-vermilion/80">bez gracza</span>
            ) : standing === "away" ? (
              <span className="text-muted/70">nieobecny</span>
            ) : standing === "you" ? (
              <span className="text-ochre/70">to ty</span>
            ) : null}
          </p>
          {canAdminister && !seat.isHost && !seat.abandoned && (
            <button
              onClick={onMakeHost}
              disabled={busy}
              title={`Przekaż rolę gospodarza: ${seatNameInline(seat)}`}
              className="shrink-0 rounded border border-edge px-1 py-0.5 text-[11px] leading-none text-muted transition hover:border-ochre hover:text-ochre disabled:opacity-40"
            >
              zrób gospodarzem
            </button>
          )}
          {/* Never your own seat: leaving is "Opuść stół", and a host who
              removes themselves has done something they meant to spell
              differently.

              `isHost` and not `canAdminister`: `removeSeat` wants the role
              outright, so offering this to everybody at a table whose host has
              gone quiet is offering a 403. The button that helps there is the
              one above. */}
          {isHost && !isMine && (
            <button
              onClick={onRemove}
              disabled={busy}
              title={`Usuń ze stołu: ${seatNameInline(seat)}`}
              className="shrink-0 rounded border border-edge px-1 py-0.5 text-[11px] leading-none text-muted transition hover:border-vermilion hover:text-vermilion disabled:opacity-40"
            >
              usuń
            </button>
          )}
        </div>
      </div>

      {/* Tapping the slot aims the character strip at it. */}
      {/* The portrait gives height back on a short screen but is capped, since
          a slot that grows to whatever is left over turns an empty seat into a
          very tall grey rectangle. */}
      {/* Your own slot is not a button. The strip is already aimed at you, so
          clicking it could only un-aim it, and lighting up under the cursor
          promised something there was nothing behind. The host aiming at a
          player they seated by hand is the one case where tapping a slot does
          anything, so that one keeps the affordance. */}
      <button
        onClick={onSelect}
        disabled={busy || !selectable || isMine}
        title={
          isMine
            ? undefined
            : selectable
              ? "Wybierz postać dla tego miejsca"
              : "Tylko właściciel miejsca wybiera swoją postać"
        }
        className={`max-h-[270px] min-h-[120px] w-full flex-1 overflow-hidden rounded border transition ${
          selectable && !isMine
            ? "border-edge/60 hover:border-ochre"
            : "cursor-default border-edge/40"
        }`}
      >
        {portrait ? (
          <Image
            src={portrait}
            alt={character?.name ?? "Losowa postać"}
            width={174}
            height={270}
            // Contained, not cropped: the small card is a whole illustration
            // with its name printed at the top, and cropping it cuts the name
            // off — which is the one thing on it.
            className="h-full w-full object-contain"
          />
        ) : (
          // The empty card says what is happening; the line below stays quiet
          // until there is something else to report. Saying it twice, once in
          // the box and once under it, was one sentence broken in half.
          <span className="flex h-full items-center justify-center p-2 text-center text-[12px] leading-snug text-muted">
            wybiera postać…
          </span>
        )}
      </button>

      {/* The three states a player is ever in: still choosing, chosen, ready —
          and the same line says which, for you and for everybody else. Yours is
          a button because saying you are ready is the only thing left to do
          once you have a character; theirs is a word because it is news. */}
      <div className="mt-1 flex h-[27px] shrink-0 items-stretch">
        {onReady ? (
          <button
            disabled={busy || !seat.characterId}
            onClick={() => onReady(!seat.ready)}
            title={seat.characterId ? undefined : "Najpierw wybierz postać"}
            className={`w-full rounded border px-2 text-[12px] transition disabled:opacity-40 ${
              seat.ready
                ? "border-verdigris bg-verdigris/10 text-verdigris"
                : "border-edge text-ink hover:border-ochre"
            }`}
          >
            {seat.ready ? "Gotów ✓" : "Jestem gotów"}
          </button>
        ) : (
          <p
            className={`flex items-center truncate text-[12px] ${
              seat.ready ? "text-verdigris" : "text-muted/60"
            }`}
          >
            {readiness === "silent" ? "" : readiness === "ready" ? "gotów ✓" : "niegotowy"}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A place nobody is in.
 *
 * Only companion mode fills one from here. There, one screen sits in the middle
 * of a real table and nobody else has a device; in simulation everybody has
 * their own and joins with the code, so a slot the host filled in would be a
 * way of taking somebody's seat before they arrived.
 */
export function EmptySlot({
  canAdd,
  busy,
  onAdd,
}: {
  canAdd: boolean;
  busy: boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  if (!canAdd) {
    return (
      <div className="flex h-full max-h-[340px] w-[190px] shrink-0 items-center justify-center rounded-lg border border-dashed border-edge/60 p-2 text-center text-[12px] leading-snug text-muted/60">
        wolne miejsce — dołączcie kodem
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd(name);
        setName("");
      }}
      className="flex h-full max-h-[340px] w-[190px] shrink-0 flex-col justify-center gap-2 rounded-lg border border-dashed border-edge p-2"
    >
      <span className="text-center text-[12px] uppercase tracking-widest text-muted">
        Dodaj gracza
      </span>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="imię"
        maxLength={24}
        className="rounded border border-edge bg-night px-2 py-1 text-center text-sm text-ink outline-none focus:border-ochre"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded border border-edge px-2 py-1 text-sm text-ink transition hover:border-ochre disabled:opacity-40"
      >
        + Dodaj
      </button>
    </form>
  );
}
