"use client";

/** The one Obszar dropdown, in the three places a Karta asks for one. */

import { asFieldId, type FieldId } from "@/lib/engine/board";
import { fieldName } from "@/lib/engine/polish";

/**
 * The one Obszar dropdown, in the three places a Karta asks for one.
 *
 * It was written out three times — same markup, same classes, same placeholder,
 * differing only in which fields it offers — and had already started to drift,
 * which is the argument `ActionButton` makes one file over about the buttons
 * beside it. `action-button.tsx` even pins this control's padding from the
 * outside ("Inline beside a `select`, whose own padding this matches"), so
 * three copies were three chances to break a promise made somewhere else.
 *
 * Module-level rather than inline, or the `select` is a new element type on
 * every render and loses focus mid-choice.
 *
 * `asFieldId` is the other half. A dropdown's value is a string from outside,
 * and this is the one place in the sheet where one becomes a `FieldId` —
 * narrowed once, at the boundary, the way CLAUDE.md's first non-negotiable asks
 * rather than asserted at each of three call sites.
 */
export function ObszarPicker({
  among,
  value,
  disabled,
  onPick,
}: {
  among: readonly FieldId[];
  value: FieldId | "";
  /** Shut with the buttons beside it: a decision in flight takes the panel. */
  disabled: boolean;
  onPick: (field: FieldId | "") => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onPick(asFieldId(event.target.value) ?? "")}
      className="rounded border border-edge bg-night px-2 py-1.5 text-sm text-ink disabled:opacity-50"
    >
      <option value="">— wybierz Obszar —</option>
      {among.map((fieldId) => (
        <option key={fieldId} value={fieldId}>
          {fieldName(fieldId)}
        </option>
      ))}
    </select>
  );
}

