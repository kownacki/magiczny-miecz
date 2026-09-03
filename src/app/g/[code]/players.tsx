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
import type { Character } from "@/data/types";
import { seatColour } from "@/lib/view/boardMap";
import { asCharacterId } from "@/lib/engine/characters";
import { CardBack, CardTile, type TileCard } from "./card-tile";
import { asNature } from "./table";
import type { PublicSeat } from "./table-layout";
import { PlayerName } from "./player-name";
import { Drawer } from "./drawer";
import { Fold } from "./fold";
import { StatFigure } from "./token-rail";
import { natureSaid } from "./nature-line";
import { MAX_SEATS } from "@/lib/game/modes";
import { NATURE_LABEL } from "@/lib/engine/polish";
import { EffectList } from "./effect-list";
import { EffectMark, EffectTally, effectsSaid } from "./effect-mark";
import { SeatFigure } from "./seat-figure";
import { STONE } from "@/lib/engine/status";
import { TileRow } from "./tile-row";

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
   *
   * A set, and not one id. Opening a seat used to shut whichever was open,
   * which makes the one thing this panel is for — comparing players — a matter
   * of remembering what the last one said. Two characters' numbers are a
   * comparison; two characters' numbers one after the other are two facts.
   */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const start = openSeatId ?? (seats.length === 1 ? seats[0].id : null);
    return new Set(start ? [start] : []);
  });
  const toggleSeat = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
       * The drawer's own width, which is the Stosy drawer's.
       *
       * It was 350px, counted to fit exactly three `CardTile`s across and not a
       * pixel more: 3 x 92 + 2 x 8 = 292, plus the seat box's padding and
       * border, the column's, a scrollbar, and the drawer's own left edge. The
       * arithmetic was right and the premise stopped being: a seat now carries
       * a row of effect tiles, their durations in words underneath, and
       * several seats open at once. The widest thing in here is no longer the
       * row of three.
       *
       * So it takes the default, and the default is what Stosy takes — two
       * drawers of the same width read as two drawers rather than as one that
       * has moved. Three tiles still fit, with slack rather than to the pixel.
       */
      onClose={onClose}
    >
      <div className="flex flex-col gap-2 p-3">
        {seats.map((seat) => {
          const real = asCharacterId(seat.characterId);
          const character = real ? (byId.get(real) ?? null) : null;
          // 20.1: a character turned to stone is not standing there any more —
          // the Karta Zaklętego w Kamień is. Read off the effects rather than
          // off a column, because that is the half of the model the roster is
          // already given: `fromColumns` projects `stone_until_round` into one
          // of these, and the mark beside the name comes from the same row.
          const stone = seat.effects.some((effect) => effect.source === STONE);
          const expanded = open.has(seat.id);
          const mine = seat.id === mySeatId;
          const colour = seatColour(seat.seatIndex);

          return (
            <div
              key={seat.id}
              className={`rounded border bg-panel/50 ${
                seat.seatIndex === activeSeatIndex ? "border-ochre/60" : "border-edge/60"
              } ${seat.eliminated ? "opacity-50" : ""}`}
            >
              {/**
                * Two lines, because a row is two different facts.
                *
                * Who is playing — the name, whether it is you, whether they are
                * the host, whether anybody is there at all — and what their
                * Postać is doing. Both were on one line, in one long truncating
                * span, so a table of five people showed „Test (ty) BARBARZYŃ…"
                * and the Postać's name, the one thing you open this drawer to
                * check, was the first casualty of a long player name.
                *
                * The split is by *subject*, not by fitting: the person above,
                * their figure below. Which is why the numbers stay on the top
                * line — they are the seat's, and the drawer's whole job is to
                * put five of them in a column you can read down.
                */}
              <button
                onClick={() => toggleSeat(seat.id)}
                className="flex w-full items-start gap-2 px-2 py-1.5 text-left"
              >
                {/* Against the top line, both of them.
                    
                    The dot is the seat's colour and „+" is the handle, and both
                    belong to the row's first line — the one with the name on
                    it. Centred against the pair they drifted to the seam
                    between the two lines, pointing at neither: the dot sat
                    beside the gap under the name and the handle beside the
                    Postać, which is not what either is about. `mt-1` puts the
                    dot on the name's own middle rather than on the top of its
                    line box, which is where `items-start` alone would leave a
                    12px circle beside 20px of text. */}
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ background: colour }}
                  aria-hidden
                />
                {/* The two lines, and the handle beside them rather than on
                    one of them. „+" opens the whole row, not its top half, so
                    it stands in a column of its own down the right — with the
                    effects ending where the numbers above them do instead of
                    stopping a glyph short and leaving the corner ragged. */}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {/* Your own row is named, because a list of everybody that
                        does not say which one is you is a list you have to count
                        your way through. Shared with the sheet's actor column,
                        which has to mark you the same way — see `PlayerName`. */}
                    <PlayerName
                      name={seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`}
                      mine={mine}
                    />
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
                  <span className="tnum shrink-0 text-[11px]">
                    <span className="text-miecz">{seat.miecz}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-magia">{seat.magia}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-zycie">{seat.life}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-zloto">{seat.gold}</span>
                  </span>
                </span>

                {/* Under the name, and inside the same column, so the two lines
                    read as one row rather than as two entries. */}
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                    {character ? (
                      <Lookable kind="character" id={character.id} name={character.name} />
                    ) : (
                      "wybiera Postać"
                    )}
                  </span>
                  {/* Shut, the row still has to admit there is something to open.

                      A seat sitting out three rounds in Kamień looked, folded,
                      exactly like a seat having an ordinary game — and this
                      drawer is where the table comes to ask why the turn keeps
                      skipping somebody.

                      Beside the Postać rather than beside the player, because
                      that is whose they are: a Kamień and two Eliksiry are
                      things happening to a figure on the board.

                      Counted, not one glyph per effect: two Eliksiry drew "▲▲",
                      which says "some" in the space where "▲2" says how many. The
                      same summary a folded seat card carries, from the same
                      component, so the two cannot come to disagree. */}
                  {seat.effects.length > 0 && (
                    <span
                      /* How many, not which — `effectsSaid`, the same sentence
                         a folded seat card gives its own bar.
                         
                         It used to be every effect's full title strung
                         together, which on a Postać carrying three of them was
                         a paragraph hanging off a row two glyphs wide, and
                         still not the thing the glyphs raise: they say „▲1 ■1"
                         and the question is what those *are*. Which ones is
                         what opening the row answers, and opening it is one
                         click away on the same row. */
                      title={effectsSaid(seat.effects)}
                      className="tnum shrink-0 text-[11px] leading-none"
                    >
                      <EffectTally effects={seat.effects} />
                    </span>
                  )}
                </span>
                </span>
                {/* Bigger than the small print it sits beside, because it is
                    not print: it is the one thing on the row you press, and at
                    ten pixels it read as a footnote to the numbers above it.

                    Centred inside a box the height of the first line — `h-5`,
                    which is the `gap-0.5` column's own line — rather than left
                    to a line-height that happens to match. The glyph can then
                    be any size and still sit on the row it belongs to; matching
                    two numbers by hand is how it drifted off in the first
                    place. */}
                <span className="flex h-5 shrink-0 items-center self-start text-[15px] text-muted">
                  {expanded ? "−" : "+"}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-edge/60 px-2 py-2">
                  {/* The Karty first, above the figure and its numbers.

                      They are the reason the numbers are what they are: a
                      Miecz of 9 on a character whose card says 5 is a question,
                      and the two Eliksiry answering it were below the answer.
                      The same tiles the seat card draws beside a name, with the
                      same hover onto the Karta itself — this drawer is where
                      you look at somebody else's cards, so the one kind of card
                      that was only ever a glyph here should be a card too. */}
                  {seat.effects.length > 0 && (
                    <div className="mb-2">
                      <TileRow size="mark" frame={false}>
                        {seat.effects.map((effect) => (
                          <EffectMark
                            key={effect.id}
                            mark={effect}
                            nature={asNature(seat.nature)}
                          />
                        ))}
                      </TileRow>
                    </div>
                  )}
                  <div className="mb-2 flex items-start gap-3">
                    {(character || stone) && (
                      <SeatFigure characterId={seat.characterId} stone={stone} width={56} />
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
                      <TileRow frame={false}>
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
                      </TileRow>
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

