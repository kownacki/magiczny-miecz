"use client";

/**
 * Something that happened to you, said out loud.
 *
 * Not a dialog and not a prompt: there is nothing to decide here and exactly
 * one way out. What it exists for is the half of this game that happens on
 * somebody else's turn — Burza Siedmiu Słońc costs every character in the Krąg
 * a turn, drawn by one player, and until now the others found out by noticing
 * they had been skipped, if they noticed at all.
 */

import { useEffect, useRef } from "react";
import type { Announcement } from "@/lib/engine/announcements";

export function AnnouncementModal({
  announcement,
  onDismiss,
  children,
}: {
  announcement: Announcement | null;
  onDismiss: () => void;
  /** What to offer besides "rozumiem" — choosing a new Postać, after a death. */
  children?: React.ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!announcement) return;
    button.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [announcement, onDismiss]);

  if (!announcement) return null;
  const grave = announcement.tone === "grave";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={announcement.title}
      // Dismissed by clicking away, like everything else here. There is nothing
      // to lose by closing it: what it reports has already happened, and the
      // journal keeps it.
      onClick={onDismiss}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-night/85 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-sm rounded-lg border bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)] ${
          grave ? "border-vermilion/60" : "border-ochre/50"
        }`}
      >
        <h2
          className={`mb-2 font-[family-name:var(--font-display)] text-xl ${
            grave ? "text-vermilion" : "text-ochre"
          }`}
        >
          {announcement.title}
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">{announcement.body}</p>
        <div className="flex items-center justify-end gap-2">
          {children}
          <button
            ref={button}
            onClick={onDismiss}
            className="rounded border border-edge px-3 py-1 text-[13px] text-muted transition hover:border-ochre hover:text-ink"
          >
            Rozumiem
          </button>
        </div>
      </div>
    </div>
  );
}
