"use client";

/**
 * The card, big enough to read, with what the app knows about it beside it.
 *
 * Shared by every place a card is shown small — the pack, the body, the shelf,
 * the journal — so hovering means the same thing everywhere.
 *
 * Rendered into `document.body`. Hands and shelves sit inside scrolling,
 * clipping containers, and a preview drawn beside the thing it describes is cut
 * off by the first `overflow-hidden` above it. Fixed to the viewport, nothing
 * clips it.
 *
 * It sits above everything, deliberately: the overlays here are z-50 and so was
 * this, which is a tie — and a tie is settled by document order, so the card
 * came up *behind* the modal that had just offered it.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { cardImageUrl, characterImageUrl } from "@/lib/view/cardImages";
import { characterProfile, forbiddenNatures, itemProfile } from "@/lib/engine/abilityText";
import { numeralMeaning, numeralOf } from "@/lib/engine/cards";
import type { Nature } from "@/data/types";
import { CardMark } from "./card-mark";
import { LAYER } from "./layers";
import type { EqMode } from "@/lib/engine/slots";
import { CardTile, type TileCard } from "./card-tile";
import { asCharacterId, startingKit } from "@/lib/engine/characters";
import charactersData from "@/data/characters.json";
import type { Character } from "@/data/types";
import { NATURE_LABEL } from "@/lib/engine/polish";
import { cardName, plural } from "@/lib/engine/polish";

const CHARACTERS = charactersData as Character[];

/**
 * Width of the card picture.
 *
 * 208 CSS px is 416 on a retina screen, and the cards are exported 528 across —
 * so it is downscaled with room to spare, which is the side of the line to be
 * on. The panel is read for the formalised lines beside the picture; the
 * picture is there to be recognised.
 */
const PICTURE_WIDTH = 208;
/**
 * A Karta Postaci, which is read rather than recognised.
 *
 * The same 340 the click-to-open detail draws one at, and for the same reason:
 * everything that decides the choice is printed *on* it — four numbered clauses
 * of small type, the two starting figures, the Natura and the MGR — and none of
 * that survives 208. Every other card in the box is a picture and a name, with
 * whatever the app knows about it set in real text beside the picture, so 208 is
 * plenty; a Postać carries no such column, because the abilities are the card.
 *
 * Kept in step with `CardDetail` by hand, which is the sort of thing that
 * drifts. It has not been pulled into one constant because the two disagree
 * about the *other* cards on purpose — the detail view has a whole overlay to
 * fill and this has to sit beside a tile without covering the board.
 */
const CHARACTER_PICTURE_WIDTH = 340;
const CARD_RATIO = 780 / 629;
const GAP = 12;

/**
 * Whether this event is the command key going down or coming up.
 *
 * Both are accepted rather than one being chosen by sniffing the platform:
 * whichever of the two a browser treats as *command* is the one whose C means
 * copy there, and holding the other simply does nothing. `key` and not
 * `metaKey`/`ctrlKey`, because the flags are also true for every combination
 * *containing* the key — `Cmd-C` itself would otherwise read as a fresh press
 * and re-open a panel the copy was meant to finish with.
 */
function isHold(event: KeyboardEvent): boolean {
  return event.key === "Meta" || event.key === "Control";
}

/**
 * What to call it on this machine, for the hint.
 *
 * The label is the one printed on the key in front of the reader — "Cmd" on a
 * Mac, "Ctrl" everywhere else — because a hint naming the other one is a hint
 * that reads as being about somebody else's computer. Guarded for the server,
 * where there is no navigator and no hint being drawn either.
 */
function holdKeyName(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";
}

/**
 * Which preview, if any, has been pinned — shared by every one of them.
 *
 * `useCardPreview` runs once per tile, so there are dozens of these on a seat
 * card alone and each knows only about itself. Pinning has to be the table's
 * business rather than a tile's: without somewhere shared to put it, pinning
 * one card and then pointing at another would leave two panels open, and the
 * pinned one would be the one you could not get rid of.
 *
 * A symbol per hook instance rather than a card id, because the same card can
 * be drawn twice — the same Miecz in two players' packs — and pinning one of
 * them should not light up the other.
 */
let pinnedPreview: symbol | null = null;
const pinListeners = new Set<() => void>();

function setPinnedPreview(id: symbol | null): void {
  if (pinnedPreview === id) return;
  pinnedPreview = id;
  for (const listen of pinListeners) listen();
}

function subscribeToPin(listen: () => void): () => void {
  pinListeners.add(listen);
  return () => pinListeners.delete(listen);
}

/** Nothing is pinned on the server, and nothing is pinned before hydration. */
const noPin = () => null;

/**
 * Hover plumbing for one small card.
 *
 * Returns handlers to spread onto whatever the pointer lands on, and the
 * preview to render. The anchor is captured on enter rather than tracked on
 * every move: the card sits beside the thing it belongs to, so it does not need
 * to chase the cursor, and not chasing it means no work per mousemove.
 */
export function useCardPreview(
  card: TileCard | null,
  imageless = false,
  eqMode: EqMode = "classic",
  /** Who is looking, so a requirement can say whether THEY meet it. */
  nature: Nature | null = null,
) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  /**
   * This instance's name in the shared pin — see `pinnedPreview`.
   *
   * Lazy state rather than a ref, because it is read while rendering to decide
   * whether this is the pinned one, and a ref read during render is a value
   * React has not promised is current. The initialiser runs once, so the
   * identity is as stable as a ref's would have been.
   */
  const [me] = useState(() => Symbol("preview"));
  /**
   * Whether the pointer is still on the tile, read when Shift comes up.
   *
   * A ref and not state: nothing renders differently for it, and it is only
   * ever read from an event handler — which is the one place a ref may be read.
   */
  const over = useRef(false);

  const pinned = useSyncExternalStore(subscribeToPin, () => pinnedPreview, noPin);
  const mine = pinned === me;
  /**
   * Somebody else's preview is pinned, so this one stays shut.
   *
   * Otherwise pointing at a second card while the first is pinned puts two
   * panels on screen, one of which cannot be dismissed by moving the mouse.
   * Pinning is a way of saying "this one, and hold still".
   */
  const elsewhere = pinned !== null && !mine;
  /**
   * Whether this lookup lives *inside* a preview, which changes what the rule
   * above is protecting against.
   *
   * `elsewhere` exists so that pointing at a second card on the board while one
   * is pinned does not leave a panel nobody can wave away. A name written in a
   * pinned panel is the opposite case: the pointer can only be there because
   * somebody put it there deliberately, having pinned the thing first, and the
   * whole reason to pin is to reach into it. A Postać's starting Przedmioty are
   * the case this was added for — the Karta names them and the reader wants to
   * see what they are.
   *
   * Read off the DOM rather than passed down. It is a fact about where this
   * lookup was rendered, and threading it through every `Lookable` between here
   * and the panel would be four components carrying an answer that the element
   * already knows.
   */
  const [nested, setNested] = useState(false);

  /**
   * Held Cmd — Ctrl away from a Mac — holds the panel: down to keep it, up to
   * let it go.
   *
   * The key is decided by what you do while holding it, and there are three
   * things: drag to select, press C to copy, click a rule number. Copy is the
   * demanding one, because the selection dies with the panel — release the key
   * and there is nothing left to copy — so the copy has to happen *while* the
   * key is down. That makes the hold key the one that already means copy when
   * you add C to it, which is exactly the platform's command key: Cmd here,
   * Ctrl on Windows.
   *
   * The three that lost, each for a different reason:
   *
   * - Shift is the extend-selection modifier. Holding it and dragging selects
   *   from the last selection anchor to the pointer, which is most of the page.
   * - Ctrl *on macOS* is the right-click modifier, so reaching for a rule
   *   number while holding it opens a context menu. It is only the right key
   *   where it is not that, which is everywhere else.
   * - Alt survives the drag and the click and then fails the copy: holding it
   *   and pressing Cmd-C is Cmd-Option-C, which is Chrome's Inspect Element.
   *
   * `metaKey`/`ctrlKey` rather than a platform sniff. Whichever of the two is
   * down is the one that browser treats as command, and holding the wrong one
   * for your machine simply does nothing.
   *
   * Firefox reads this pair as *discontiguous* selection, so there a drag adds
   * to the selection instead of replacing it. Worse, not broken — and the same
   * class of blemish Alt has there for a different reason.
   *
   * Releasing closes it only when the pointer has since left the tile. Holding
   * Shift over a card and letting go should leave you exactly where you were —
   * hovering it — rather than shutting a panel that hovering alone would have
   * kept open.
   *
   * `blur` releases it too, and is not paranoia: a keyup that happens while the
   * window is not focused never arrives, so anything that takes focus mid-hold
   * would leave the panel stuck open over the board with no key to press.
   */
  useEffect(() => {
    if (anchor === null && !mine) return;
    const onDown = (event: KeyboardEvent) => {
      /**
       * A nested lookup does not pin.
       *
       * The pin is a single seat and holding the key inside a pinned panel
       * would take it from the panel you are standing in — which closes it,
       * and the thing you were pointing at with it. One level deep is as far as
       * this goes on purpose: the second panel is for reading, and it is
       * dismissed by moving the pointer off the name that opened it.
       */
      if (isHold(event) && !mine && !nested && anchor !== null) setPinnedPreview(me);
      if (event.key === "Escape" && mine) setPinnedPreview(null);
    };
    const onUp = (event: KeyboardEvent) => {
      if (!isHold(event) || !mine) return;
      setPinnedPreview(null);
      // The pointer wandered off while it was held, so there is nothing keeping
      // it open any more.
      if (!over.current) setAnchor(null);
    };
    const onBlur = () => {
      if (!mine) return;
      setPinnedPreview(null);
      if (!over.current) setAnchor(null);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [anchor, mine, me, nested]);

  const handlers = {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      over.current = true;
      const inside = event.currentTarget.closest('[role="tooltip"]') !== null;
      setNested(inside);
      if (elsewhere && !inside) return;
      setAnchor(event.currentTarget.getBoundingClientRect());
    },
    // A pinned panel outlives the pointer leaving the tile it came from, which
    // is the whole point of pinning it.
    onMouseLeave: () => {
      over.current = false;
      if (!mine) setAnchor(null);
    },
    // A dragged element leaves no mouseleave behind it, and a preview left
    // hanging over the board during a drag hides where the card is going.
    onPointerDown: () => {
      if (!mine) setAnchor(null);
    },
  };

  const preview =
    anchor && card && (!elsewhere || nested) ? (
      <CardPreview
        card={card}
        anchor={anchor}
        imageless={imageless}
        eqMode={eqMode}
        nature={nature}
        pinned={mine}
        onUnpin={() => setPinnedPreview(null)}
      />
    ) : null;
  return { handlers, preview, hovering: anchor !== null };
}

export function CardPreview({
  card,
  anchor,
  imageless = false,
  eqMode = "classic",
  nature = null,
  pinned = false,
  onUnpin,
}: {
  card: TileCard;
  anchor: DOMRect;
  /**
   * Held open on purpose, and therefore reachable.
   *
   * Unpinned this thing is `pointer-events-none` — it has to be, because it is
   * drawn over the tile it describes and the tile is a control. Pinned, it is
   * the opposite: the reason to pin is to put the pointer *in* it, to select a
   * line of a card's text or to follow a rule number into the Instrukcja.
   */
  pinned?: boolean;
  onUnpin?: () => void;
  nature?: Nature | null;
  /**
   * There is no picture of this and there should be no lookup for one.
   *
   * A field is not a card, and its id can collide with a card's — asking for
   * the picture of "kurhan" could hand back a Miejsce card that merely shares
   * the name. Its printed instruction is what there is to show.
   */
  imageless?: boolean;
  eqMode?: EqMode;
}) {
  /**
   * Placed from what it measures, not from what it was expected to be.
   *
   * Working the height out in advance only ever worked for a bare picture. The
   * moment the panel had a column of text beside it — or a field's printed
   * instruction instead of a card — the real height had nothing to do with the
   * arithmetic, so the clamp used a wrong number and the bottom ran off the
   * screen. A ref callback runs at commit, before paint, so measuring and then
   * positioning is invisible rather than a jump.
   *
   * The CSS caps do the rest: whatever ends up inside, the panel can never be
   * taller or wider than the window, and tall content scrolls instead of
   * overflowing it.
   */
  /**
   * The panel itself, kept so a press elsewhere can be told from a press in it.
   *
   * Set by the same ref callback that places it, rather than a second ref on
   * the same element: two refs on one node is two things to keep in step, and
   * the placement one already runs at exactly the moment the node appears.
   */
  const held = useRef<HTMLDivElement | null>(null);

  const place = useCallback(
    (node: HTMLDivElement | null) => {
      held.current = node;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const room = { x: window.innerWidth, y: window.innerHeight };
      const fitsRight = room.x - anchor.right > box.width + GAP;
      const wanted = fitsRight ? anchor.right + GAP : anchor.left - box.width - GAP;
      node.style.left = `${clamp(wanted, GAP, room.x - box.width - GAP)}px`;
      node.style.top = `${clamp(
        anchor.top + anchor.height / 2 - box.height / 2,
        GAP,
        room.y - box.height - GAP,
      )}px`;
    },
    [anchor],
  );

  /**
   * A press anywhere else lets a pinned panel go.
   *
   * `pointerdown` and not `click`, so it releases as the press lands rather
   * than after it — otherwise the click that dismisses the panel also lands on
   * whatever was behind it, which on a seat card is a tile that picks a card
   * up. Presses *inside* are the panel being used and are left alone.
   *
   * Nothing is bound while it is merely hovering: there is no state to leave
   * behind then, and the mouse leaving the tile has already closed it.
   */
  useEffect(() => {
    if (!pinned || !onUnpin) return;
    const onPress = (event: PointerEvent) => {
      if (held.current?.contains(event.target as Node)) return;
      onUnpin();
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [pinned, onUnpin]);

  if (typeof document === "undefined") return null;

  // A character's id is not a card id, even when it looks like one: `demon` and
  // `czarodziej` name both. Going through the card registry for those two hands
  // back a Wróg and a Nieznajomy rather than the Postać being pointed at.
  const src = imageless
    ? null
    : card.character
      ? characterImageUrl(card.cardId)
      : cardImageUrl(card.cardId, card.ref);
  // A Postać is read at the size the detail view reads one at; everything else
  // is recognised at the smaller one. See `CHARACTER_PICTURE_WIDTH`.
  const pictureWidth = card.character ? CHARACTER_PICTURE_WIDTH : PICTURE_WIDTH;
  const profile = imageless
    ? null
    : card.character
      ? characterProfile(card.cardId)
      : itemProfile(card.cardId, eqMode);
  // What is printed at the top of the card. Null for a Zaklęcie, a Karta
  // Postaci and anything off the Wyposażenie sheets — none of those is a Karta
  // Zdarzeń and none of them carries one.
  const numeral = numeralOf(card.cardId);
  // Only a Postać has one, and `startingKit` answers with an empty kit for
  // anything else — including the "Losowa" card, which is nobody yet.
  const kit = card.character ? startingKit(asCharacterId(card.cardId)) : null;
  // The Karta's own printed figures. Absent for the "Losowa" card, which is
  // nobody yet and has nothing to print.
  const starting = card.character ? (CHARACTERS.find((one) => one.id === card.cardId) ?? null) : null;
  // 5.3, answered for the reader rather than stated in the abstract.
  const barred = nature !== null && (forbiddenNatures(card.cardId)?.includes(nature) ?? false);
  const anythingToSay =
    !src ||
    card.text ||
    card.kindLabel ||
    profile?.slotLabel ||
    (profile?.facts.length ?? 0) > 0 ||
    (profile?.requirements.length ?? 0) > 0 ||
    (profile?.special.length ?? 0) > 0 ||
    (profile?.notes.length ?? 0) > 0;

  return createPortal(
    <div
      ref={place}
      role="tooltip"
      style={{
        // A first guess, corrected before paint.
        left: anchor.right + GAP,
        top: anchor.top,
        maxWidth: `calc(100vw - ${GAP * 2}px)`,
        maxHeight: `calc(100vh - ${GAP * 2}px)`,
      }}
      /* Never under the pointer while it is only hovering: a preview you can
         hover flickers, because it is drawn over the tile that opened it and
         the pointer would cross from one to the other.

         Pinned it is exactly the opposite. The whole reason to pin is to put
         the pointer in it — to drag a line of the card's text, or to follow a
         rule number into the Instrukcja — so it takes events, and says so with
         a brighter edge. */
      className={`fixed ${LAYER.hover} flex gap-3 overflow-y-auto rounded-lg border bg-night p-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] ${
        pinned
          ? "pointer-events-auto select-text border-ochre"
          : "pointer-events-none select-none border-ochre/40"
      }`}
    >
      {src && (
        <div className="relative shrink-0 self-start">
          <Image
            src={src}
            alt={card.name}
            width={pictureWidth}
            height={Math.round(pictureWidth * CARD_RATIO)}
            style={{ width: pictureWidth }}
            className="block h-auto rounded"
          />
          {/* On the card, where the tile puts it, so the hover and the thing
              being hovered agree about where to look. */}
          {card.granted && (
            <span className="absolute bottom-1 right-1 rounded bg-night/85 px-1 py-0.5">
              <CardMark mark="granted" size={22} />
            </span>
          )}
        </div>
      )}

      {/* What the app knows, beside what the card says. Skipped entirely when
          there is nothing to put here: a picture alone beats a picture with an
          empty column next to it. */}
      {anythingToSay && (
        <div className="flex w-[18rem] max-w-[55vw] flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-sm text-ochre">
              {card.name}
            </p>
            {/* The Roman numeral printed at the top of the card. Not an
                identity and not a level — it is the class, and 15.2 resolves a
                stack of cards drawn on one Obszar from the lowest up. Set apart
                on the right the way it is on the card itself. */}
            {numeral && (
              <span
                title={numeralMeaning(card.cardId) ?? undefined}
                className="shrink-0 font-[family-name:var(--font-display)] text-sm leading-none text-ochre/50"
              >
                {numeral}
              </span>
            )}
          </div>
          {card.kindLabel && <p className="text-[11px] text-muted">{card.kindLabel}</p>}

          {profile?.slotLabel && (
            <p className="text-[11px] text-muted">
              Slot: <span className="text-ink">{profile.slotLabel}</span>
            </p>
          )}

          {/* What it asks before it gives. Above the bonuses on purpose: a card
              you may not hold is not a card whose bonuses matter.

              Green or red by whether the person reading it passes — the useful
              question is not "does this have a restriction" but "does it shut
              ME out", and the answer is known. Neutral only when no Natura is
              known, which is the shelf read from outside a game. */}
          {profile && profile.requirements.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              {profile.requirements.map((need, at) => (
                <li
                  key={at}
                  className={`text-[11px] leading-snug ${
                    nature === null
                      ? "text-muted"
                      : barred
                        ? "text-vermilion"
                        : "text-verdigris"
                  }`}
                >
                  {need.what}
                </li>
              ))}
            </ul>
          )}

          {profile && profile.facts.length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t border-edge/60 pt-2">
              {profile.facts.map((fact, at) => (
                <li key={at} className="flex flex-col text-[11px] leading-snug">
                  <span className="text-ink">{fact.what}</span>
                  {/* Only where there is a condition to meet. Almost everything
                      simply has to be on you, and saying so every time said
                      nothing. */}
                  {fact.when && <span className="text-magia/80">{fact.when}</span>}
                </li>
              ))}
            </ul>
          )}

          {/* What using it does, once — as opposed to what holding it gives. */}
          {profile && profile.special.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              {profile.special.map((line, at) => (
                <li key={at} className="text-[11px] leading-snug text-ochre/90">
                  {line}
                </li>
              ))}
            </ul>
          )}

          {/* Rules the app states but does not apply. Marked, because at a table
              the difference is who has to remember them. */}
          {profile && profile.notes.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              {profile.notes.map((note, at) => (
                <li key={at} className="text-[11px] leading-snug text-ochre/90">
                  {note}
                  {at === 0 && (
                    <span className="ml-1 text-[10px] text-muted/70">· pilnujesz sam</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/**
           * What a Postać owns before anybody rolls (8.1).
           *
           * It is printed on the Karta and the Karta is right there — but at
           * this size the Charakterystyka is a grey smear, and "z czym zaczynam"
           * is the question somebody comparing twenty-seven of them is actually
           * asking. So it is pulled out and named.
           *
           * The Przedmioty are `Lookable`, which means they open previews of
           * their own — and that only works with the pointer inside this panel,
           * which only happens once it is pinned. The note at the bottom already
           * says how; this is one more thing pinning is for.
           */}
          {/**
           * What a Postać is before anybody rolls, laid out the way the roster
           * lays out what one has become.
           *
           * The same four figures in the same order and the same colours, so
           * comparing a Karta you are thinking of taking against a player who
           * already has one is reading the same table twice. The Karta prints
           * all of it — Natura, MGR, Miecz, Magia — at a size where it is a
           * grey smear, and Życie and Złoto are not on it at all: 4.2 and 3.2
           * give everybody four and one unless a Charakterystyka says otherwise.
           */}
          {starting && (
            <dl className="grid grid-cols-[1fr_2fr] gap-x-3 gap-y-1 border-t border-edge/60 pt-2 text-[11px]">
              <dt className="text-muted">Zaczyna na</dt>
              <dd className="truncate text-ink">{starting.start}</dd>
              <dt className="text-muted">Natura</dt>
              <dd className="text-ink">{NATURE_LABEL[starting.nature] ?? starting.nature}</dd>
              <dt className="text-muted">Miecz</dt>
              <dd className="tnum text-miecz">{starting.miecz}</dd>
              <dt className="text-muted">Magia</dt>
              <dd className="tnum text-magia">{starting.magia}</dd>
              <dt className="text-muted">Życie</dt>
              <dd className="tnum text-zycie">4</dd>
              <dt className="text-muted">Złoto</dt>
              <dd className="tnum text-zloto">{kit?.gold ?? 1}</dd>
            </dl>
          )}

          {kit && (kit.items?.length || kit.spells) && (
            <div className="flex flex-col gap-1 border-t border-edge/60 pt-2">
              <p className="text-[11px] text-muted">Na start:</p>
              {/* Pictures, not names. A Przedmiot is recognised by its
                  illustration the way everything else in this app is, and two
                  names in a row read as prose while two tiles read as a
                  character's gear — which is what they are. `CardTile` brings
                  its own hover with it, which is the whole trick: the tiles
                  answer once this panel is pinned, and are inert until then. */}
              {kit.items && kit.items.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {kit.items.map((cardId, at) => (
                    <CardTile
                      key={`${cardId}-${at}`}
                      card={{ cardId, name: cardName(cardId) }}
                      eqMode={eqMode}
                      nature={nature}
                    />
                  ))}
                </div>
              )}
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-ink">
                {kit.spells ? (
                  <span className="text-magia">
                    {kit.spells} {plural(kit.spells, "Zaklęcie", "Zaklęcia", "Zaklęć")}
                  </span>
                ) : null}
              </p>
            </div>
          )}

          {/* The prose only when there is no picture of it.
              Beside the card, repeating its text is repeating what the reader is
              already looking at — and it pushed the formalised lines, which are
              what the app will actually DO, off the bottom of the panel. */}
          {card.text && !src && (
            <p className="whitespace-pre-line border-t border-edge/60 pt-2 text-[11px] leading-relaxed text-muted">
              {card.text}
            </p>
          )}

          {/**
           * How to hold it still, and what holding it is for.
           *
           * "Przypiąć", which is the word the code has used for this from the
           * start — `pinnedPreview`, `pinned` — and now the word the reader
           * sees. It names the state rather than one of the things the state is
           * for: a panel that is pinned can be copied from *and* clicked, and a
           * hint that promised only one of those would be wrong about the
           * other.
           *
           * Without this the feature does not exist for anybody who was not
           * told about it: a modifier key leaves no trace on screen, and the
           * panel it acts on is one that disappears the moment you look away
           * from the thing that opened it.
           *
           * At the foot of the column rather than over the picture, and in the
           * quietest ink on the panel — it is chrome about the panel, not
           * something the card says.
           */}
          <p className="mt-auto pt-2 text-[10px] leading-none text-muted/50">
            {pinned ? `przypięte — puść ${holdKeyName()}, żeby odpiąć` : `${holdKeyName()} — przytrzymaj, żeby przypiąć`}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Keeps a value inside the window even when the window is smaller than the panel. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}
