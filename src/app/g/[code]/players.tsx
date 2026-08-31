"use client";

/**
 * Who is at this table, and what can be done about them.
 *
 * A drawer rather than a modal, and above the modals rather than under them.
 * Both follow from the same thing: the questions it answers are about the
 * *table*, not about the turn — where is everybody, what is Karol carrying,
 * has Ola's tab closed, can the host let somebody go — and every one of them is
 * asked most often while something else is on screen. A fight is exactly when
 * you want to know what the character you are about to attack is holding.
 *
 * So it slides in over the right-hand column and leaves the board alone, and
 * the board is the half you are looking at when you ask.
 *
 * It shows every seat, your own included. The roster it grew out of was called
 * "pozostali gracze" and left you out of it, which is fine for a column beside
 * your own card and wrong for the one place that answers "who is playing".
 */

import { useState } from "react";
import { Lookable } from "./lookable";
import Image from "next/image";
import type { Character } from "@/data/types";
import { characterStandeeUrl } from "@/lib/view/cardImages";
import { SEAT_COLOURS } from "@/lib/view/boardMap";
import { asCharacterId } from "@/lib/engine/characters";
import { CardBack, CardTile, type TileCard } from "./card-tile";
import type { PublicSeat } from "./table-layout";
import { Drawer } from "./drawer";
import { Fold } from "./fold";
import { useCardPreview } from "./card-preview";
import { StatFigure } from "./token-rail";
import { natureSaid } from "./nature-line";
import { MAX_SEATS } from "@/lib/game/modes";
import { NATURE_LABEL, characterKind } from "@/lib/engine/polish";
import { EffectList } from "./effect-list";

export function PlayersDrawer({
  seats,
  openSeatId,
  characters,
  activeSeatIndex,
  mySeatId,
  amHost,
  room,
  busy,
  onClose,
  onInspect,
  onClaim,
  onKick,
  onWithdraw,
  onPassHost,
  onJoin,
}: {
  /** Every seat, in seat order — yours among them. */
  seats: PublicSeat[];
  /**
   * A seat to open on, for a drawer that was opened *about* somebody.
   *
   * Arriving here from a player's name means the question was about them, and
   * a list that opens with everything shut makes you ask it again with a
   * click.
   */
  openSeatId?: string | null;
  characters: Character[];
  activeSeatIndex: number | null;
  mySeatId: string | null;
  amHost: boolean;
  /** Whether a newcomer would fit (2-6). */
  room: boolean;
  busy: boolean;
  onClose: () => void;
  onInspect: (card: TileCard) => void;
  /** Take a character nobody is behind. Offered only to a device with no seat. */
  onClaim?: (seatId: string) => void;
  /** Host only: takes the character out and leaves what it carried on its Obszar. */
  onKick?: (seat: PublicSeat) => void;
  /** The host taking a Postać out of the game. `hard` bars it from being picked again. */
  onWithdraw?: (seat: PublicSeat, hard: boolean) => void;
  /** Host only: hands the role to somebody who is staying. */
  onPassHost?: (seat: PublicSeat) => void;
  /** Sit down as somebody new. Offered only to a device with no seat. */
  onJoin?: () => void;
}) {
  /**
   * Which seat is unfolded. Shut by default, with two exceptions.
   *
   * Arriving from a player's name is a question about *them*, which `openSeatId`
   * carries. And a roster of one has nothing to choose between: the list is
   * that person, so the click that opens them answers a question nobody asked
   * — it is the drawer opening itself a second time.
   *
   * Read once, when the drawer mounts, which is every time it opens: it is a
   * starting point and not a rule, so somebody who shuts the only seat gets to
   * keep it shut for as long as they are looking at it.
   */
  const [open, setOpen] = useState<string | null>(
    openSeatId ?? (seats.length === 1 ? seats[0].id : null),
  );
  /**
   * Which seats have their cards unfolded, by exception.
   *
   * A set of the open ones, so the default is shut: unfolding a seat is asking
   * about a *player*, and their whole hand of Przedmioty is a second question.
   * The tally answers most of it without opening anything.
   */
  const [showCards, setShowCards] = useState<ReadonlySet<string>>(new Set());
  const byId = new Map(characters.map((character) => [character.id, character]));

  return (
    <Drawer
      side="right"
      title={
        <>
          Gracze{" "}
          <span className="tnum text-muted">
            {seats.length}/{MAX_SEATS}
          </span>
        </>
      }
      /**
       * Three Przedmioty across, exactly.
       *
       * The roster's widest thing is a row of `CardTile`s, and a row that fits
       * three and a sliver reads as a row that could not decide. Counted rather
       * than rounded: 3 x 92 (`CardTile`'s own width) + 2 x 8 (`gap-2`) = 292,
       * + 16 for the seat box's `px-2`, + 2 for its border, + 24 for the
       * column's `p-3`, + 15 for the scrollbar gutter the drawer always
       * reserves — measured, not assumed — + 1 for the drawer's own left edge,
       * which the sum missed and which left the row a pixel short of three.
       * = 350, and the row measures 292 exactly.
       *
       * The gutter stays reserved whether or not the list scrolls, which is
       * what keeps the tiles from stepping sideways when a seat is unfolded.
       */
      width="max-w-[350px]"
      onClose={onClose}
    >
      <div className="flex flex-col gap-2 p-3">
        {seats.map((seat) => {
          const real = asCharacterId(seat.characterId);
          const character = real ? (byId.get(real) ?? null) : null;
          const portrait = character ? characterStandeeUrl(character.id) : null;
          const expanded = open === seat.id;
          const mine = seat.id === mySeatId;
          const colour = SEAT_COLOURS[seat.seatIndex % SEAT_COLOURS.length];

          return (
            <div
              key={seat.id}
              className={`rounded border bg-panel/50 ${
                seat.seatIndex === activeSeatIndex ? "border-ochre/60" : "border-edge/60"
              } ${seat.eliminated ? "opacity-50" : ""}`}
            >
              <button
                onClick={() => setOpen(expanded ? null : seat.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: colour }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`}
                  {/* Your own row is named, because a list of everybody that
                      does not say which one is you is a list you have to count
                      your way through. */}
                  {mine && <span className="ml-1 text-[11px] text-ochre">(ty)</span>}
                  <span className="ml-2 text-[11px] text-muted">
                    {character ? (
                      <Lookable kind="character" id={character.id} name={character.name} />
                    ) : (
                      "wybiera Postać"
                    )}
                  </span>
                  {seat.isHost && (
                    <span className="ml-2 text-[11px] text-ochre/80">gospodarz</span>
                  )}
                  {/* The character is still in the game; only its player is
                      gone. Worth saying plainly — whoever is left has to decide
                      whether to play it or leave it standing. */}
                  {!seat.driven ? (
                    <span className="ml-2 text-[11px] text-vermilion/80">bez gracza</span>
                  ) : seat.away ? (
                    <span className="ml-2 text-[11px] text-muted">nieobecny</span>
                  ) : null}
                </span>
                {/* Shut, the row still has to admit there is something to open.

                    A seat sitting out three rounds in Kamień looked, folded,
                    exactly like a seat having an ordinary game — and this
                    drawer is where the table comes to ask why the turn keeps
                    skipping somebody. The glyphs rather than a count, because
                    two of them fit where "2 efekty" does not, and they are the
                    same shapes the row shows when it opens. */}
                {seat.effects.length > 0 && (
                  <span
                    aria-hidden
                    title={seat.effects.map((effect) => effect.title).join(" · ")}
                    className="shrink-0 text-[11px] leading-none"
                  >
                    {seat.effects.map((effect) => (
                      <span
                        key={effect.id}
                        className={
                          effect.tone === "dobry"
                            ? "text-verdigris"
                            : effect.tone === "zly"
                              ? "text-vermilion"
                              : "text-muted"
                        }
                      >
                        {effect.glyph}
                      </span>
                    ))}
                  </span>
                )}
                <span className="tnum shrink-0 text-[11px]">
                  <span className="text-miecz">{seat.miecz}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-magia">{seat.magia}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-zycie">{seat.life}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-zloto">{seat.gold}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted">{expanded ? "−" : "+"}</span>
              </button>

              {expanded && (
                <div className="border-t border-edge/60 px-2 py-2">
                  <div className="mb-2 flex items-start gap-3">
                    {portrait && character && (
                      <Standee character={character} portrait={portrait} />
                    )}
                    {/* A third for the names and two for the answers. Even
                        columns gave the six shortest words in the app half the
                        room and truncated "chaotyczna (niezmieniona)" next to
                        them, which is the wrong way round: the labels are
                        fixed and known, the values are the part that varies. */}
                    <dl className="grid flex-1 grid-cols-[1fr_2fr] gap-x-3 gap-y-1 text-[11px]">
                      <Row
                        label="Obszar"
                        value={
                          seat.fieldId ? (
                            <Lookable kind="field" id={seat.fieldId} name={seat.fieldName} />
                          ) : (
                            seat.fieldName
                          )
                        }
                      />
                      {/* Through `natureSaid`, so this says what the sheet says:
                          "chaotyczna (niezmieniona)" while no Karta Zmiany Natury
                          is lying beside the Karta Postaci, and the bare word once
                          one is (7.2). Two places naming one thing two ways is the
                          drift that function exists to end — and the stored key is
                          English like every other key, which this row printed raw
                          at a Polish table for as long as it has existed. */}
                      <Row
                        label="Natura"
                        value={
                          (character ? natureSaid(seat.nature, character.nature) : null)?.label ??
                          (seat.nature ? (NATURE_LABEL[seat.nature] ?? seat.nature) : "—")
                        }
                      />
                      {/* All four, in the order the Karta prints them up its
                          own edges and in the colours they wear everywhere
                          else — the same figures the folded seat card shows,
                          said the same way. Two of them were missing here
                          entirely, which made the roster the one place at the
                          table where you could not see how much Życia somebody
                          had left. */}
                      <Row
                        label="Miecz"
                        tone="text-miecz"
                        value={
                          <StatFigure
                            value={seat.swordOwn}
                            total={seat.miecz}
                            inFight={seat.mieczWWalce}
                          />
                        }
                      />
                      <Row
                        label="Magia"
                        tone="text-magia"
                        value={
                          <StatFigure
                            value={seat.magicOwn}
                            total={seat.magia}
                            inFight={seat.magiaWWalce}
                          />
                        }
                      />
                      <Row label="Życie" tone="text-zycie" value={seat.life} />
                      <Row label="Złoto" tone="text-zloto" value={seat.gold} />
                    </dl>
                  </div>

                  {/* Under the numbers, because it is the thing that decides
                      what the numbers are allowed to do next.

                      This replaces a lone "Traci tur 2", which was the wrong
                      half of the answer twice: a count with no idea when it
                      runs out, and nothing at all about the Kamień or the
                      Zaklęcie sitting beside it. Same component as the player's
                      own sheet, so the two cannot drift into two vocabularies
                      for one set of facts. */}
                  <EffectList effects={seat.effects} />

                  {/* 5.2 and 6.2 put these face up, so they are everybody's to
                      read. A spell hand is 9.3's and shows as a back.
                      
                      Folded, like the sections of one's own sheet, and by the
                      same component — a seat holding nine Przedmioty pushed
                      every other player off the bottom of the roster, which is
                      the one thing this panel exists to show. The tally on the
                      bar is what a folded section owes its reader: how many
                      there are is usually the whole question. */}
                  {(seat.cards.length > 0 || seat.hiddenSpells > 0) && (
                    <Fold
                      first
                      title="Ma przy sobie"
                      tally={seat.cards.length + seat.hiddenSpells}
                      open={showCards.has(seat.id)}
                      onToggle={() =>
                        setShowCards((were) => {
                          const next = new Set(were);
                          if (next.has(seat.id)) next.delete(seat.id);
                          else next.add(seat.id);
                          return next;
                        })
                      }
                    >
                      <div className="mb-2 flex flex-wrap gap-2">
                        {/* The hand first, and always in the same corner.
                        
                            It is the one thing in the row that cannot be read,
                            which makes it the thing you look for: how many
                            Zaklęcia somebody is holding is what you weigh
                            before attacking them (9.3 hides which, not how
                            many). At the end it moved every time they picked
                            something up, and on a full pack it was the tile
                            that had wrapped onto the next line. */}
                        {seat.hiddenSpells > 0 && <CardBack count={seat.hiddenSpells} />}
                        {/* Then what is on the body, then what is in the pack.
                        
                            The row answers „what has this character got" and
                            those are three different answers: Zaklęcia are
                            spoken, worn Przedmioty are already counting towards
                            the Miecz and Magia printed above, and the pack is
                            what could be got at or dropped. Reading them in
                            that order is reading the seat card's own order —
                            Na sobie, then Plecak — in a row that has no room to
                            label them.
                            
                            A stable sort, so within each half the cards stay in
                            the order their owner arranged them (5.4 has no
                            opinion about it, and `reorderPack` writes it down
                            because the player does).
                            
                            Nothing moves in the klasyczny variant, where no
                            card is worn and every one of them is in the pack. */}
                        {[...seat.cards]
                          .sort((a, b) => (a.slot ? 0 : 1) - (b.slot ? 0 : 1))
                          .map((card, index) => (
                            <CardTile
                              key={`${card.cardId}-${index}`}
                              card={card}
                              onClick={() => onInspect(card)}
                            />
                          ))}
                      </div>
                    </Fold>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!seat.driven && onClaim && (
                      <button
                        onClick={() => onClaim(seat.id)}
                        disabled={busy}
                        className="rounded border border-ochre/60 px-2 py-1 text-[11px] text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
                      >
                        Przejmij tę postać
                      </button>
                    )}
                    {/* Handing the role on rather than losing it: a host who has
                        to leave takes the table's only administrator with them
                        otherwise, and `claimTableScreen` will only let somebody
                        else take it once they have actually gone quiet. */}
                    {amHost && onPassHost && !mine && seat.driven && (
                      <button
                        onClick={() => onPassHost(seat)}
                        disabled={busy}
                        className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-ochre hover:text-ochre disabled:opacity-40"
                      >
                        Przekaż gospodarza
                      </button>
                    )}
                    {onKick && !mine && seat.driverId && (
                      <KickButton seat={seat} busy={busy} onKick={onKick} />
                    )}
                    {onWithdraw && seat.characterId && !seat.eliminated && (
                      <WithdrawButton seat={seat} busy={busy} onWithdraw={onWithdraw} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* The other half of joining, for a device that is only watching. */}
        {onJoin && (
          <button
            onClick={onJoin}
            disabled={busy || !room}
            className="mt-1 rounded border border-ochre/60 px-2 py-2 text-[11px] text-ochre transition hover:bg-ochre/10 disabled:border-edge disabled:text-muted"
          >
            {room ? "Dosiądź się nową Postacią" : "Stół jest pełny (2-6 graczy)"}
          </button>
        )}
      </div>
    </Drawer>
  );
}

function Row({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: React.ReactNode;
  /** The colour a figure wears everywhere else — Miecz, Magia, Życie, Złoto. */
  tone?: string;
}) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`tnum truncate ${tone}`}>{value}</dd>
    </>
  );
}

/**
 * The host putting a player out of the table.
 *
 * The Postać is not theirs to take away: it stays exactly where it is standing
 * with everything it owns, and the chair is left for somebody to take over.
 * Taking the *Postać* out is a different act and a different button — see
 * `WithdrawButton` below, which is the one the rulebook has nothing to say
 * about either way.
 *
 * Hidden when nobody is driving, because there is then nobody to put out. It
 * used to promise "Postać znika, rzeczy zostają na Obszarze", which was true of
 * a command that no longer exists.
 *
 * Two clicks, and the second one says what it does.
 */
function KickButton({
  seat,
  busy,
  onKick,
}: {
  seat: PublicSeat;
  busy: boolean;
  onKick: (seat: PublicSeat) => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-vermilion hover:text-vermilion"
      >
        Usuń gracza
      </button>
    );
  }
  return (
    <button
      onClick={() => {
        setArmed(false);
        onKick(seat);
      }}
      disabled={busy}
      className="rounded border border-vermilion/60 bg-vermilion/10 px-2 py-1 text-[11px] text-vermilion disabled:opacity-40"
    >
      Na pewno? {seat.playerName ?? "Gracz"} wyjdzie od stołu, Postać zostaje
    </button>
  );
}

/**
 * The host taking a Postać out of the game.
 *
 * The rulebook says nothing about withdrawing a living Postać — it is a 1993
 * game where everybody is in one room and a person who walks away is the
 * table's problem — so the host overrules nothing here. It is the only tool
 * that addresses abandonment at all.
 *
 * It is not a small thing, though: the Postać leaves with everything it was
 * carrying, and no command puts that hand back. So both clicks name what goes,
 * and the second one is the grave red every irreversible thing in this app
 * wears.
 *
 * Soft puts the Karta back in the pool for somebody to pick; `hard` bars it for
 * good, which is what death does. Neither reaches a Postać that is already dead
 * — 4.4 is explicit about where that Karta goes, and putting it back is a break
 * rather than a gap, so it belongs to the test console where it is journalled
 * as something somebody typed.
 */
function WithdrawButton({
  seat,
  busy,
  onWithdraw,
}: {
  seat: PublicSeat;
  busy: boolean;
  onWithdraw: (seat: PublicSeat, hard: boolean) => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-vermilion hover:text-vermilion"
      >
        Wycofaj Postać
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <button
        onClick={() => {
          setArmed(false);
          onWithdraw(seat, false);
        }}
        disabled={busy}
        className="rounded border border-vermilion/60 bg-vermilion/10 px-2 py-1 text-[11px] text-vermilion disabled:opacity-40"
      >
        Wycofaj — Karta wraca do wyboru
      </button>
      <button
        onClick={() => {
          setArmed(false);
          onWithdraw(seat, true);
        }}
        disabled={busy}
        className="rounded border border-vermilion bg-vermilion/20 px-2 py-1 text-[11px] text-vermilion disabled:opacity-40"
      >
        Na dobre — nikt jej już nie wybierze
      </button>
      <button
        onClick={() => setArmed(false)}
        className="px-1 text-[11px] text-muted underline hover:text-ink"
      >
        anuluj
      </button>
    </span>
  );
}

/**
 * The Postać a seat is playing, read by pointing at it.
 *
 * It used to be a click that opened the whole Karta over the table — a modal to
 * answer "which one is that again?", with the roster gone behind it while you
 * read. The hover says the same thing beside the figure and leaves the roster
 * where it was; holding Cmd keeps it, which is the way to read the
 * Charakterystyka at length.
 *
 * Its own component because `useCardPreview` is a hook and the roster draws one
 * of these per seat. A hook cannot be called in a loop, so the loop calls a
 * component instead.
 */
function Standee({ character, portrait }: { character: Character; portrait: string }) {
  const card = {
    cardId: character.id,
    name: character.name,
    character: true,
    text: character.abilities.join("\n\n"),
    kindLabel: characterKind(character),
  };
  // No `eqMode`: a Karta Postaci has no slots and `characterProfile` ignores
  // it. The variant only matters for a Przedmiot, which this never is.
  const { handlers, preview } = useCardPreview(card);
  return (
    <span {...handlers} className="shrink-0 rounded border border-edge transition hover:border-ochre">
      <Image src={portrait} alt={character.name} width={56} height={94} className="rounded" />
      {preview}
    </span>
  );
}
