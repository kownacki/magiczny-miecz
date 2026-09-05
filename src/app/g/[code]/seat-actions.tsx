"use client";

/** The things a character can do outside the move-draw-fight loop: the Bestia, and Magog's Natura. */

import { Rules } from "./rule-ref";

import { useState } from "react";
import { NATURE_LABEL } from "@/lib/engine/polish";

/**
 * The things a character can do that are not part of the move-draw-fight loop.
 *
 * Only what a player genuinely decides. Everything else this box used to hold —
 * drawing a Zaklęcie, healing, turning to Kamień, choosing a Natura — was the
 * app being *told* what a physical table had done, and a button for it is not a
 * rule the player is exercising but a way to edit the game's record of itself.
 * 9.5 grants spells through encounters and areas, 7.2 describes what happens
 * *when* a Natura changes rather than a choice anyone gets to make, and 20.1's
 * Kamień is something a card does to you.
 *
 * The Bestia is a real choice made on a real square, and Magog really may
 * change Natura at will — which is why that is a typed ability now instead of a
 * note: it is what tells the one character who may reach for it apart from the
 * twenty-six who may not.
 */
export function SeatActions({
  busy,
  nature,
  canFightBeast,
  mayChooseNature,
  onNature,
  onBeast,
}: {
  busy: boolean;
  nature: string | null;
  /** Only offered on the Zamek, where 10.5 says the fight is compulsory. */
  canFightBeast: boolean;
  /** This character may change Natura whenever they like — Magog, and only Magog. */
  mayChooseNature: boolean;
  onNature: (nature: string) => void;
  onBeast: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Nothing left to offer: no header either, rather than a heading that opens
  // onto an empty box.
  if (!mayChooseNature && !canFightBeast) return null;

  return (
    <div className="mt-4 border-t border-edge pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] uppercase tracking-widest text-muted transition hover:text-ink"
      >
        {open ? "− " : "+ "}Pozostałe zasady
      </button>

      {open && (
        // Wrapped once around the block rather than around each label: the
        // rule numbers here are in six different sentences and half of them
        // sit beside other markup.
        <Rules>
          <div className="mt-3 flex flex-col gap-3 text-xs">
            {mayChooseNature && (
              <Row label="Natura (7.2)">
                {/* Good, chaotic, evil — in that order, because 7.1 describes them
                as two departures from a middle rather than as a list, and the
                middle belongs between them.

                Every one of these was printed in Polish by hand, which is to
                say one of them was: the map that has held these words since the
                rename was two directories away, and `option` went to the screen
                for the other two. */}
                {(["good", "chaotic", "evil"] as const).map((option) => (
                  <Action
                    key={option}
                    busy={busy}
                    active={nature === option}
                    onClick={() => onNature(option)}
                  >
                    {NATURE_LABEL[option] ?? option}
                  </Action>
                ))}
                <Note>Najwyżej raz na turę (7.3).</Note>
              </Row>
            )}

            {canFightBeast && (
              <Row label="Zamek Bestii (14.7)">
                <Action busy={busy} danger onClick={onBeast}>
                  Stocz walkę z Bestią
                </Action>
                <Note>Wygrana kończy grę (22). Przegrana to 2 Życia.</Note>
              </Row>
            )}
          </div>
        </Rules>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-[10px] uppercase tracking-wide text-muted sm:w-40">
        {label}
      </span>
      {children}
    </div>
  );
}

function Action({
  busy,
  active,
  danger,
  onClick,
  children,
}: {
  busy: boolean;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`rounded border px-2 py-1 transition disabled:opacity-50 ${
        active
          ? "border-ochre text-ochre"
          : danger
            ? "border-vermilion/50 text-ink hover:bg-vermilion/20"
            : "border-edge text-ink hover:border-ochre"
      }`}
    >
      {children}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] text-muted/80">{children}</span>;
}
