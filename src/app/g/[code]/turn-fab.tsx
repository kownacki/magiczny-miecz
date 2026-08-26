"use client";

/**
 * The way back to your own turn, when you have put it aside.
 *
 * A turn used to be something you could not fold away: the sheet that asks you
 * to fight is the thing the game is waiting on, and hiding it was how a table
 * stopped. So only a *watcher* could fold, and the player being asked was held
 * in front of the question until they answered it.
 *
 * Which is right about the danger and wrong about the cure. A player mid-turn
 * has other things to do — put on the Zbroja they just picked up, read what
 * somebody is carrying, look at the board they are about to cross — and every
 * one of them is behind the sheet. Being unable to move it is not the same as
 * being able to act.
 *
 * So the sheet folds, and this is what makes that safe: a button that cannot be
 * dismissed while it is your turn, and that says what is *owed* rather than
 * whose turn it is. "Walka: WILKOŁAK" is a thing to go back to. "Twoja tura" is
 * a thing you already knew.
 *
 * It is also the only way to end a turn. That is deliberate — ending a turn now
 * lives in the window this opens rather than in the box in the corner — so this
 * button is on the path of every turn that ever ends, which is the strongest
 * guarantee available that it is never missing.
 */
export function TurnFab({
  owed,
  onOpen,
}: {
  /** What is still to be done, in the words the turn uses for it. */
  owed: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      /**
       * Bottom centre, over everything, on the same pill the folded draw sheet
       * has always used — because to a player it *is* that pill, and the two
       * appearing in different shapes would read as two different features.
       *
       * Below the console's layer and above the board's: this is the game
       * asking, and the console is the thing you type at while it asks.
       */
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-ochre bg-panel px-4 py-2 text-xs text-ink shadow-[0_4px_20px_rgba(0,0,0,0.6)] transition hover:bg-ochre/10"
    >
      {/* The same slow dot the folded sheet uses for "something is waiting". */}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ochre motion-safe:animate-pulse" aria-hidden />
      <span className="font-[family-name:var(--font-display)] tracking-wide">Twoja tura</span>
      <span className="text-muted">·</span>
      <span className="text-ochre">{owed}</span>
    </button>
  );
}

/**
 * What the turn still owes, said in as few words as it can be.
 *
 * Taken from `windowsFor`'s own ranking rather than worked out again here: the
 * first compulsory window is by definition the thing that cannot be walked past
 * (16.4 puts the cards before the Obszar, a fight before either), and where
 * nothing is compulsory the only thing left to do is end the turn.
 */
export function owedLabel(
  windows: readonly { id: string; label: string; count?: number; compulsory?: boolean }[],
  fightName: string | null,
): string {
  const first = windows.find((window) => window.compulsory);
  if (!first) return "zakończ turę";
  if (first.id === "walka") return fightName ? `walka: ${fightName}` : "walka";
  if (first.id === "karty") return first.count === 1 ? "1 karta" : `${first.count} karty`;
  return first.label.toLowerCase();
}
