"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normaliseJoinCode } from "@/lib/game/codes";

/** Entry point: start a new table, or join one whose code is being read out across it. */
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTable() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/games", { method: "POST" });
      if (!response.ok) throw new Error("Nie udało się otworzyć stołu.");
      const { joinCode, token } = await response.json();
      // The host's token is kept per-table so one device can sit at several.
      localStorage.setItem(`mm:${joinCode}`, token);
      router.push(`/g/${joinCode}`);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-10 px-6 py-16">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-wide text-ochre">
          Magiczny Miecz
        </h1>
        <p className="mt-3 text-sm text-muted">
          Sędzia do gry planszowej. Grasz na planszy — liczenie, rzuty i kolejność kart
          bierze na siebie aplikacja.
        </p>
      </header>

      <button
        onClick={startTable}
        disabled={busy}
        className="rounded-lg border border-edge bg-raised px-6 py-4 font-[family-name:var(--font-display)] text-lg font-medium text-ink transition hover:border-ochre hover:bg-edge disabled:opacity-50"
      >
        {busy ? "Otwieram stół…" : "Otwórz nowy stół"}
      </button>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const clean = normaliseJoinCode(code);
          if (clean.length >= 4) router.push(`/g/${clean}`);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="code" className="text-xs uppercase tracking-widest text-muted">
          albo dołącz kodem
        </label>
        <div className="flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="np. K7DQM"
            autoCapitalize="characters"
            autoComplete="off"
            className="tnum flex-1 rounded-lg border border-edge bg-panel px-4 py-3 text-center text-2xl tracking-[0.3em] text-ink uppercase placeholder:text-muted/50 focus:border-ochre focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-edge bg-raised px-5 text-sm text-ink transition hover:border-ochre"
          >
            Dołącz
          </button>
        </div>
      </form>

      {error && <p className="text-center text-sm text-vermilion">{error}</p>}
    </main>
  );
}
