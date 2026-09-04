"use client";

/**
 * Everything the table screen knows and can do, provided once, so the surfaces
 * that compose it read what they need instead of being handed it prop by prop.
 */

/**
 * Why a context, and why this shape.
 *
 * `page.tsx` composed the whole screen in one function of 2,800 lines, and the
 * handoff that measured it found the reason: the three blocks it was made of —
 * the Obszar drawer, the overlays and the table itself — closed over 24, 46
 * and 44 names each. Cut out as components on props they would have been
 * props hell; left in place they were one file every change went through.
 *
 * So the feed changes rather than the file. One provider, built where the
 * hooks are, and three orchestrators under it that read this and pass
 * explicit props to the same leaves as before. The leaves stay pure: nothing
 * below `Overlays`, `FieldDrawer` or `TableScreen` reads this context, and
 * that is the rule to keep.
 *
 * The type is derived from the layers that make it up rather than restated —
 * the table as `use-table.ts` sends it, what is open from `use-surfaces.ts`,
 * the turn read once by `turn-view.ts` — plus the one interface below for what
 * this device holds of its own. `game` is narrowed to non-null here because
 * the provider is only ever mounted once there is one.
 */

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Confirmation } from "./confirm";
import type { Game, Said, Table } from "./use-table";
import type { useSurfaces } from "./use-surfaces";
import type { TurnView } from "./turn-view";
import type { writeTestMode } from "@/lib/game/testMode";

/** What is open over the table — the return of `useSurfaces`. */
export type Surfaces = ReturnType<typeof useSurfaces>;

/** The die this device threw and is holding until „Dalej" — see `showDie`. */
export interface Rolled {
  cardId: string;
  face: number;
  did: string[];
}

/** Where a Zaklęcie is aimed, as the hand hands it up. */
export interface CastTarget {
  seatIndex?: number;
  fieldCardId?: string;
  fieldId?: string;
  /** Where the Karta goes, for the one Zaklęcie that moves one. */
  destination?: string;
}

/**
 * This device's own state over the table, and the questions it asks before an
 * irreversible act. Each is documented where it is declared, in `page.tsx`.
 */
export interface Device {
  code: string;
  /** Cards with a request out, greyed until it lands. */
  asked: readonly string[];
  askFor: (id: string, run: () => Promise<unknown>) => Promise<void>;
  myTurn: boolean;
  /** The deal is turned over and being looked at; the sheet waits. */
  revealing: boolean;
  dealKey: string | null;
  setDealSeen: Dispatch<SetStateAction<string | null>>;
  setRolled: Dispatch<SetStateAction<Rolled | null>>;
  showDie: (cardId: string, said: Said | null) => void;
  reborn: boolean;
  setReborn: Dispatch<SetStateAction<boolean>>;
  pickerWavedOff: boolean;
  setPickerWavedOff: Dispatch<SetStateAction<boolean>>;
  ask: Confirmation | null;
  setAsk: Dispatch<SetStateAction<Confirmation | null>>;
  folded: boolean;
  setFolded: Dispatch<SetStateAction<boolean>>;
  waved: string[];
  setWaved: Dispatch<SetStateAction<string[]>>;
  testing: boolean;
  testMode: boolean;
  setTestMode: typeof writeTestMode;
  askToUse: (holdingId: string, cardId: string) => void;
  askToLeave: () => void;
  askToDrop: (holdingId: string) => void;
  askToCast: (holdingId: string, cardId: string, target?: CastTarget) => void;
}

export type TableScreen = Omit<Table, "game"> & { game: Game } & Surfaces & TurnView & Device;

export const TheTable = createContext<TableScreen | null>(null);

/** The screen, for the three orchestrators that compose it. Throws outside the provider on purpose. */
export function useTheTable(): TableScreen {
  const screen = useContext(TheTable);
  if (screen === null) throw new Error("useTheTable() poza <TheTable.Provider>");
  return screen;
}
