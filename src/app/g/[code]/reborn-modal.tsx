"use client";

import { Rules } from "./rule-ref";

import { useState } from "react";
import Image from "next/image";
import type { Character } from "@/data/types";
import { RANDOM_CHARACTER_ID, type SeatCharacter } from "@/lib/engine/characters";
import { characterStandeeUrl } from "@/lib/view/cardImages";
import { useCharacterPreview } from "./character-picker";
import { Overlay } from "./overlay";
import { characterTitle } from "@/lib/engine/polish";

/**
 * Choosing again, after dying.
 *
 * Rule 4.4: "Gracz, który kierował niefortunną Postacią, może wybrać sobie nową
 * i rozpocząć z nią grę od początku (z Obszaru oznaczonego jako MGR)". *Może* —
 * so this is offered and never forced, and it can be closed. A player who would
 * rather watch the rest of the game from outside it keeps that choice, and the
 * button to reopen this stays where their character used to be.
 *
 * Built like the poczekalnia because it is the same decision: the strip to
 * choose from, the Karta big enough to read beside it, and a confirmation —
 * a character is four clauses of Charakterystyka and two numbers, and picking
 * one off a thumbnail is picking blind.
 */
export function RebornModal({
  characters,
  taken,
  arriving = false,
  busy,
  onConfirm,
  onClose,
}: {
  characters: Character[];
  /** Every character already in the game — 4.4 puts the dead one out for good. */
  taken: ReadonlySet<string>;
  /**
   * Sitting down at a table already running, rather than coming back from a
   * death. The choice is the same and the sentence above it is not.
   */
  arriving?: boolean;
  busy: boolean;
  onConfirm: (characterId: SeatCharacter) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<SeatCharacter | null>(null);

  const free = characters.filter((character) => !taken.has(character.id));
  const randomStandee = characterStandeeUrl(RANDOM_CHARACTER_ID);

  return (
    // Dismissable, and 4.4 is why: choosing again is offered rather than
    // demanded ("*może*"), and the line on the seat card is the way back in.
    // The one who cannot dismiss it is a player who has only just sat down —
    // they have no character at all, and nothing else on screen to do — but
    // that is `page.tsx`'s to decide, since it is the one that knows which.
    <Overlay label="Wybierz nową Postać" onDismiss={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-ochre/40 bg-panel shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-edge px-4 py-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-ochre">
              {arriving ? "Wybierz Postać" : "Twoja Postać zginęła"}
            </h2>
            <p className="text-[11px] text-muted">
              <Rules>
              {arriving
                ? "Gra już trwa. Bierzesz Postać, której nikt nie ma, i zaczynasz od jej Obszaru startowego — z pełnym Życiem i wyposażeniem początkowym."
                : "Jej Przedmioty i Przyjaciele zostali na Obszarze, na którym zginęła. Możesz wybrać nową i zacząć od jej Obszaru startowego (4.4)."}
              </Rules>
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[11px] text-muted transition hover:text-ink"
          >
            oglądaj dalej
          </button>
        </header>

        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
              {/* First, the way it is first in the poczekalnia. 4.4 says only
                  that the player "może wybrać sobie nową" Postać — nothing in
                  it forbids letting the pile choose, and a player who wanted a
                  surprise the first time still wants one now. Unlike in the
                  poczekalnia there is no start of the game left to reveal it
                  at, so the draw happens on the press. */}
              <RandomTile
                disabled={busy || free.length === 0}
                dim={picked === RANDOM_CHARACTER_ID || !picked ? "opacity-100" : "opacity-45"}
                standee={randomStandee}
                chosen={picked === RANDOM_CHARACTER_ID}
                onPick={() => setPicked(RANDOM_CHARACTER_ID)}
              />
              {free.map((character) => (
                <RebornTile
                  key={character.id}
                  character={character}
                  disabled={busy}
                  chosen={picked === character.id}
                  dim={picked === character.id || !picked ? "opacity-100" : "opacity-45"}
                  onPick={() => setPicked(character.id)}
                />
              ))}
            </div>
          </div>

        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-edge px-4 py-3">
          <p className="min-w-0 truncate text-[12px] text-muted">
            {picked === RANDOM_CHARACTER_ID
              ? "Wybrano: losowa — Karta zostanie wylosowana z tych, które zostały."
              : picked
                ? `Wybrano: ${characters.find((c) => c.id === picked)?.name}`
                : "Wybierz Postać z listy."}
          </p>
          <button
            disabled={busy || !picked}
            onClick={() => picked && onConfirm(picked)}
            className="shrink-0 rounded border border-ochre bg-ochre/10 px-4 py-1.5 font-[family-name:var(--font-display)] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
          >
            Zacznij nową Postacią
          </button>
        </footer>
      </div>
    </Overlay>
  );
}

/**
 * One choosable Postać, with its Karta on hover.
 *
 * A component rather than a branch inside the `map` it replaced, because the
 * preview is a hook and a hook cannot be called from a loop body. That is the
 * whole reason this exists; everything it draws was already here.
 *
 * The handlers go on a wrapper and not on the button. A disabled button fires
 * no mouse events at all, and while nothing here is disabled today, `busy`
 * makes every tile so for as long as a pick is in flight — which is exactly the
 * moment somebody is still reading them.
 */
function RebornTile({
  character,
  disabled,
  chosen,
  dim,
  onPick,
}: {
  character: Character;
  disabled: boolean;
  chosen: boolean;
  /** How faded, once something else is picked — the strip's own ladder. */
  dim: string;
  onPick: () => void;
}) {
  const standee = characterStandeeUrl(character.id);
  const { handlers, preview } = useCharacterPreview(character, character.id);

  return (
    <div className="min-w-0" {...handlers}>
      <button
        disabled={disabled}
        onClick={onPick}
        title={characterTitle(character)}
        className={`block w-full overflow-hidden rounded border transition disabled:opacity-40 ${
          chosen ? "border-ochre" : "border-edge hover:border-ochre/60"
        }`}
      >
        {standee ? (
          <Image
            src={standee}
            alt={character.name}
            width={114}
            height={190}
            className={`h-auto w-full transition-opacity ${dim}`}
            unoptimized
          />
        ) : (
          <span className="block p-2 text-[10px] text-ink">{character.name}</span>
        )}
      </button>
      {preview}
    </div>
  );
}

/**
 * The surprise, which has a Karta and no Charakterystyka.
 *
 * Worth pointing at precisely because it says nothing about what you get: the
 * card is the whole of the answer, so there is no character to read abilities
 * off and the preview shows the picture alone.
 */
function RandomTile({
  disabled,
  chosen,
  dim,
  standee,
  onPick,
}: {
  disabled: boolean;
  chosen: boolean;
  dim: string;
  standee: string | null;
  onPick: () => void;
}) {
  const { handlers, preview } = useCharacterPreview(null, RANDOM_CHARACTER_ID);

  return (
    <div className="min-w-0" {...handlers}>
      <button
        disabled={disabled}
        onClick={onPick}
        title="Losowa — Karta Postaci zostanie wylosowana spośród tych, które zostały"
        className={`block w-full overflow-hidden rounded border transition disabled:opacity-40 ${
          chosen ? "border-ochre" : "border-edge hover:border-ochre/60"
        }`}
      >
        {standee ? (
          <Image
            src={standee}
            alt="Losowa postać"
            width={114}
            height={190}
            className={`h-auto w-full transition-opacity ${dim}`}
            unoptimized
          />
        ) : (
          <span className="block p-2 text-[10px] text-ink">Losowa</span>
        )}
      </button>
      {preview}
    </div>
  );
}
