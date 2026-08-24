"use client";

import { useState } from "react";

/**
 * The things a character can do that are not part of the move-draw-fight loop.
 *
 * These exist because the rules allow them at moments the turn structure does
 * not anticipate: a Nature can change on any card's say-so (7.2), a spell is
 * drawn whenever something grants one (9.5), healing happens at a Medyk. Rather
 * than scatter a button into every card that might trigger one, they live in
 * one place the active player can always reach.
 */
export function SeatActions({
  busy,
  nature,
  canFightBeast,
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
  onSpell: () => void;
  onNature: (nature: string) => void;
  onStone: () => void;
  onHeal: () => void;
  onBeast: () => void;
}) {
  const [open, setOpen] = useState(false);

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
          <Row label="Zaklęcie (9.5)">
            <Action busy={busy} onClick={onSpell}>
              Wyciągnij Zaklęcie
            </Action>
            <Note>Limit zależy od Magii (2.6).</Note>
          </Row>

          <Row label="Natura (7.2)">
            {(["dobra", "chaotyczna", "zla"] as const).map((option) => (
              <Action
                key={option}
                busy={busy}
                active={nature === option}
                onClick={() => onNature(option)}
              >
                {option === "zla" ? "zła" : option}
              </Action>
            ))}
            <Note>Najwyżej raz na turę (7.3).</Note>
          </Row>

          <Row label="Życie (4.7)">
            <Action busy={busy} onClick={onHeal}>
              Uzdrowienie
            </Action>
            <Note>Tylko do 4 punktów z początku gry.</Note>
          </Row>

          <Row label="Zamiana w Kamień (20.1)">
            <Action busy={busy} onClick={onStone}>
              Zamień w Kamień
            </Action>
            <Note>Trzy tury bez ruchu.</Note>
          </Row>

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
