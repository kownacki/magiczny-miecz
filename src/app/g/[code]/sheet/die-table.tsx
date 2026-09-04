"use client";

/**
 * A Karta's printed die table, with the face that came up standing out of it.
 */

import { dieGroups, faceRun } from "@/lib/engine/effectText";
import { WithRules } from "../rule-ref";

/** One row of the table: the faces it covers and what they say. */
type DieGroup = ReturnType<typeof dieGroups>[number];

/**
 * The table, with the face that came up standing out of it.
 *
 * Drawn for everybody and not only for the player pressing: the six lines are
 * what a 3 *means*, so a watcher reading „WYPADŁO 3" without them is reading
 * a number. Before the throw they are all one colour — nothing has happened
 * yet and no line is the answer; after it, the line that came up keeps the
 * colour and the rest step back, which is the same „lighting a few beats
 * dulling the rest" the trofea settled on.
 *
 * No „rzuć kostką:" over it. That was `describeEffect`'s heading for the
 * whole table, and read as an instruction — to a watcher, an instruction
 * addressed to them. The one player it *is* addressed to has „Musisz rzucić
 * kostką" and a button; everybody else has a list of what the Karta can do.
 */
export function DieTable({ faces, face }: { faces: readonly DieGroup[]; face: number | null }) {
  return faces.length > 0 ? (
    <ul className="flex flex-col gap-1">
      {faces.map((group) => {
        const hit = face !== null && group.on.includes(face);
        return (
          <li
            key={group.on.join(",")}
            className={`text-[11px] leading-snug ${
              face === null ? "text-ochre/90" : hit ? "text-ochre" : "text-muted/50"
            }`}
          >
            <WithRules text={`${faceRun(group.on)} — ${group.said}`} />
          </li>
        );
      })}
    </ul>
  ) : null;
}

