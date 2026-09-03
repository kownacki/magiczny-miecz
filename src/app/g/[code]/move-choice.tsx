"use client";

/**
 * Where this character goes next: the fork in the road, and the Most's toll for
 * taking it.
 */

import { DrawSheet, type SheetChrome } from "./draw-sheet";
import { BridgeControls } from "./crossing-controls";
import type { OnAction, Simulated } from "./turn-controls";
import { DIRECTION_LABEL, type TurnMoveOption } from "@/lib/engine/turn";

/**
 * The die has been thrown and the character is standing between two roads.
 *
 * On the sheet rather than in a panel because it is the same shape as
 * everything else in that window: a thing you are being asked to do, once, with
 * the table watching. Where somebody is headed is public, and it used to be
 * drawn only on their own device.
 */
export function MoveChoice({
  who,
  chrome,
  move,
  busy,
  onAction,
}: {
  who: string;
  chrome: SheetChrome;
  move: { roll: number; options: TurnMoveOption[] };
  busy: boolean;
  onAction: OnAction;
}) {
  return (
    <DrawSheet
      {...chrome}
      label={`Wyrzucono ${move.roll}`}
      art={null}
      watching={`${who} wybiera drogę`}
      wide
    >
      <p className="mb-3 text-sm text-muted">
        {chrome.canAct ? "Wybierz kierunek." : `${who} wybiera kierunek.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {move.options.map((option) => (
          <button
            key={`${option.direction}-${option.fieldId}-${option.bridge ? "most" : "ring"}`}
            disabled={busy || !chrome.canAct}
            onClick={() =>
              onAction({
                action: "move",
                fieldId: option.fieldId,
                ...(option.bridge ? { viaBridge: true } : {}),
              })
            }
            className={`rounded border bg-raised px-4 py-3 text-left transition disabled:opacity-50 ${
              option.bridge
                ? "border-vermilion/50 hover:border-vermilion"
                : "border-edge hover:border-ochre"
            }`}
          >
            <span className="block font-medium text-ink">
              {option.bridge ? "Kamienny Most" : option.fieldName}
            </span>
            <span className="block text-[11px] text-muted">
              {option.bridge
                ? `skręć z ${option.fieldName} — czeka ${option.bridge.guardian}`
                : DIRECTION_LABEL[option.direction]}
            </span>
            {option.through.length > 0 && (
              <span className="mt-1 block text-[11px] text-muted/70">
                przez: {option.through.join(" → ")}
              </span>
            )}
          </button>
        ))}
      </div>
    </DrawSheet>
  );
}

/**
 * The Kamienny Most's entrance (11.9-11.11).
 *
 * Beside the move because the card says it is the same shape as one: a thing to
 * decide, once, with the table watching. The difference is only that the Most
 * charges a Strażnik for the turning.
 */
export function BridgeChoice({
  who,
  chrome,
  bridge,
  simulated,
  busy,
  onAction,
}: {
  who: string;
  chrome: SheetChrome;
  bridge: React.ComponentProps<typeof BridgeControls>["bridge"];
  simulated: Simulated;
  busy: boolean;
  onAction: OnAction;
}) {
  return (
    <DrawSheet
      {...chrome}
      label="Kamienny Most"
      art={null}
      watching={`${who} wchodzi na Most`}
    >
      <BridgeControls
        bridge={bridge}
        simulated={simulated}
        busy={busy}
        onAction={onAction}
      />
    </DrawSheet>
  );
}
