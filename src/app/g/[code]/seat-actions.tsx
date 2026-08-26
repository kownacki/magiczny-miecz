"use client";

import { useState } from "react";

/**
 * The things a character can do that are not part of the move-draw-fight loop.
 *
 * Most of these are companion mode's. They exist because at a physical table
 * the app is a referee being told what happened: a Nature changed on some
 * card's say-so (7.2), something granted a spell (9.5), a Medyk healed
 * somebody. Rather than scatter a button into every card that might trigger
 * one, they live in one place the player can reach.
 *
 * In simulation none of that is true. 9.5 grants spells through encounters and
 * areas, 7.2 describes what happens *when* a Nature changes rather than a
 * choice anyone gets to make, and 20.1's Kamień is something a card does to
 * you. A button for each is not a rule the player is exercising, it is a way to
 * edit the game's record of itself — so in simulation they are not offered.
 *
 * What survives is what a player genuinely decides. The Bestia is a real choice
 * made on a real square, and Magog really may change Natura at will, which is
 * why that is a typed ability now instead of a note: it is what tells the one
 * character who may reach for it apart from the twenty-six who may not.
 */
export function SeatActions({
  busy,
  nature,
  canFightBeast,
  byHand,
  mayChooseNature,
  onSpell,
  onNature,
  onStone,
  onHeal,
  onBeast,
}: {
  busy: boolean;
  nature: string | null;
  /** Only offered on the Zamek, where 10.5 says the fight is compulsory. */
  canFightBeast: boolean;
  /** Companion mode: the app is being told what the table did, so it must ask. */
  byHand: boolean;
  /** This character may change Natura whenever they like — Magog, and only Magog. */
  mayChooseNature: boolean;
  onSpell: () => void;
  onNature: (nature: string) => void;
  onStone: () => void;
  onHeal: () => void;
  onBeast: () => void;
}) {
  const [open, setOpen] = useState(false);
  const showNature = byHand || mayChooseNature;
  // Nothing left to offer: no header either, rather than a heading that opens
  // onto an empty box.
  if (!byHand && !showNature && !canFightBeast) return null;

  return (
    <div className="mt-4 border-t border-edge pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] uppercase tracking-widest text-muted transition hover:text-ink"
      >
        {open ? "− " : "+ "}Pozostałe zasady
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 text-xs">
          {byHand && (
          <Row label="Zaklęcie (9.5)">
            <Action busy={busy} onClick={onSpell}>
              Wyciągnij Zaklęcie
            </Action>
            <Note>Limit zależy od Magii (2.6).</Note>
          </Row>
          )}

          {showNature && (
          <Row label="Natura (7.2)">
            {(["good", "chaotic", "evil"] as const).map((option) => (
              <Action
                key={option}
                busy={busy}
                active={nature === option}
                onClick={() => onNature(option)}
              >
                {option === "evil" ? "zła" : option}
              </Action>
            ))}
            <Note>Najwyżej raz na turę (7.3).</Note>
          </Row>
          )}

          {byHand && (
          <Row label="Życie (4.7)">
            <Action busy={busy} onClick={onHeal}>
              Uzdrowienie
            </Action>
            <Note>Tylko do 4 punktów z początku gry.</Note>
          </Row>
          )}

          {byHand && (
          <Row label="Zamiana w Kamień (20.1)">
            <Action busy={busy} onClick={onStone}>
              Zamień w Kamień
            </Action>
            <Note>Trzy tury bez ruchu.</Note>
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
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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
