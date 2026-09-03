"use client";

/**
 * Which surfaces are out over the table, and the gestures that open and shut them.
 */

/**
 * Why this is a hook of its own.
 *
 * `page.tsx` held eighteen `useState`s, and these eight were the only ones that
 * answer a question the server has never heard of: what is *open*. The Ksiega,
 * the Stosy, an Obszar, the roster, the settings, the console, a card held up
 * to be read, and the rule somebody last followed a reference to. None of them
 * is game state — reload the page and every one of them is shut, and nothing is
 * lost — and none appears in a `Snapshot`, a `Changeset` or a route.
 *
 * They were also the tangled ones, for a reason worth keeping in view: the rule
 * is that the left column holds *one* thing, so opening any of the three has to
 * put the other two away. That was enforced by four functions — `openAt`,
 * `toggleDrawer`, `closeDrawer`, `openField` — each remembering to clear the
 * same three states, which works only for as long as everybody writes the fifth
 * one the same way. Here they are the file's whole subject and sit within ten
 * lines of each other.
 *
 * Three setters stay private on purpose. `setLeftDrawer`, `setRule` and
 * `setAskedAbout` are never called from outside those four functions, and that
 * is the invariant: a caller says *what it wants open*, not which of the three
 * pieces of state to move. `setInspecting` is returned, because the map and the
 * turn bar do set an Obszar directly, and `openField` is the same thing with
 * the column cleared first.
 */

import { useCallback, useEffect, useState } from "react";
import { type FieldId } from "@/lib/engine/board";
import type { TileCard } from "./card-tile";
import type { RulesShelf } from "./rules-shelf";

export function useSurfaces() {
  /** A field the player tapped on the map, to read what it says. */
  const [inspecting, setInspecting] = useState<FieldId | null>(null);
  /** A card somebody tapped, shown large with its full text. */
  const [inspectingCard, setInspectingCard] = useState<TileCard | null>(null);
  /** Bumped to open the Zaklęcia fold from the turn box — see `showSurplus`. */
  const [openSpells, setOpenSpells] = useState(0);
  /** The reference drawer of every card in the box. */
  /**
   * Which drawer is out on each side, at most one apiece.
   *
   * A side rather than a flag per drawer, because that is the rule: the two
   * sit on opposite edges so both can be out at once, and a side has room for
   * exactly one. Naming the side rather than the drawer means the third one to
   * be written swaps with whatever is already there instead of being drawn on
   * top of it, and nobody has to remember to close the other first.
   */
  const [leftDrawer, setLeftDrawer] = useState<"ksiega" | "stosy" | null>(null);
  /**
   * The rule somebody last followed a reference to.
   *
   * Kept here rather than inside the Księga because the click happens outside
   * it — in a refusal in the corner, under a Karta, in a tooltip — and the
   * drawer is usually shut when it does. Bumped rather than only set: clicking
   * the same `(5.3)` twice should take you back to it, and a value that did not
   * change is a value nothing downstream notices.
   */
  const [rule, setRule] = useState<{ shelf: RulesShelf; id: string | null; nth: number } | null>(
    null,
  );
  const openAt = useCallback((shelf: RulesShelf, id: string | null) => {
    setInspecting(null);
    setLeftDrawer("ksiega");
    setRule((was) => ({ shelf, id, nth: (was?.nth ?? 0) + 1 }));
  }, []);
  const openRule = useCallback((id: string) => openAt("instrukcja", id), [openAt]);
  /**
   * The left column holds one thing, and these are the three that want it.
   *
   * The Księga, the Stosy and an Obszar are all drawers over the board, so
   * opening any of them has to put the others away — the same argument
   * `leftDrawer` already made for its own two, now that the Obszar has joined
   * them. Kept as two states rather than one because they answer different
   * questions: `leftDrawer` is *which surface*, and `inspecting` is *which
   * Obszar*, which the map, the turn bar and three buttons all set directly.
   */
  const toggleDrawer = useCallback((which: "ksiega" | "stosy") => {
    setRule(null);
    setInspecting(null);
    setLeftDrawer((out) => (out === which ? null : which));
  }, []);
  const closeDrawer = useCallback(() => {
    setRule(null);
    setLeftDrawer(null);
  }, []);
  /** Opening an Obszar, which is the third claim on that column. */
  const openField = useCallback((fieldId: FieldId | null) => {
    setRule(null);
    setLeftDrawer(null);
    setInspecting(fieldId);
  }, []);
  /**
   * The console, opened with a backtick or from the switch that gates it.
   *
   * The key is the one every game with a console uses, and it is unshifted, so
   * it never lands in a Polish word being typed anywhere else.
   */
  const [consoleOpen, setConsoleOpen] = useState(false);
  /** The roster, open over the right-hand column. */
  const [rightDrawer, setRightDrawer] = useState<"gracze" | "ustawienia" | null>(null);
  /** Which seat the players drawer should open on, when it was opened about one. */
  const [askedAbout, setAskedAbout] = useState<string | null>(null);
  /**
   * The roster, opened about one seat — and shut again by the same click.
   *
   * Three places point at a person and mean "who is that": a standee on the
   * Obszar's Gracze shelf, the name in the turn bar, and a skipped player's
   * chip. All three opened the drawer and none of them could close it, so the
   * gesture only worked one way: click the figure you are already reading about
   * and nothing happens, because the state it sets is the state it is in.
   *
   * The bar button and the G shortcut have always toggled. This is the same
   * rule reached from the figure instead of the letter, which is where a hand
   * that is already pointing at somebody goes.
   *
   * Only the seat it is *already about* closes it. Open about somebody else, a
   * click is a question about this one and switches — which is what you meant
   * by clicking a different figure, and shutting the drawer to make you open it
   * again would be the gesture arguing with itself.
   */
  const showSeat = useCallback(
    (seatId: string) => {
      const already = rightDrawer === "gracze" && askedAbout === seatId;
      setRightDrawer(already ? null : "gracze");
      setAskedAbout(already ? null : seatId);
    },
    [rightDrawer, askedAbout],
  );

  /**
   * A letter for each surface, being the letter it starts with.
   *
   * K for the Księga, S for the Stosy, G for the Gracze. They are the three
   * things in the bar you open and shut all game, they are two clicks away
   * across a wide screen, and the Polish names hand out three distinct initials
   * for free — so there is nothing to learn beyond the word already on the
   * button, which is where the letter is written.
   *
   * Bare letters rather than a modifier, because there is nothing here to
   * collide with: the only keyboard input on this screen is the console line
   * and the Księga search box, and both are fields. The same guard the console
   * uses covers both, which is why it is spelled out twice rather than shared —
   * that one is behind TESTING_POSSIBLE and this is not.
   *
   * Each toggles, exactly as its button does. Pressing K with the Księga open
   * shuts it, which is what "the K window" means once you have one.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      switch (event.key.toLowerCase()) {
        case "k":
          event.preventDefault();
          toggleDrawer("ksiega");
          return;
        case "s":
          event.preventDefault();
          toggleDrawer("stosy");
          return;
        case "g":
          event.preventDefault();
          setRightDrawer((out) => (out === "gracze" ? null : "gracze"));
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleDrawer]);

  return {
    /* What is out. */
    inspecting,
    inspectingCard,
    openSpells,
    leftDrawer,
    rule,
    consoleOpen,
    rightDrawer,
    askedAbout,
    /* And the ways to change it. The four that clear the left column are the
       reason the three setters they clear are not among these. */
    openAt,
    openRule,
    toggleDrawer,
    closeDrawer,
    openField,
    showSeat,
    setInspecting,
    setInspectingCard,
    setOpenSpells,
    setConsoleOpen,
    setRightDrawer,
  };
}
