# Stół, gospodarz i gracze

How a table is created, joined, administered and left. This is the part of the
app that is not Magiczny Miecz — it is the ordinary machinery every online
multiplayer game needs, and it is written down because the rules of *that* are
not in the rulebook and so cannot be looked up when a decision is questioned.

Grounded in how lobby systems are normally built (see the sources at the end);
where this one differs, the reason is that everybody is in the same room.

---

## The two roles

**Gospodarz (host)** — exactly one per table, always a seated player. Owns the
setup and the administration of the table.

**Gracz (player)** — everyone else. Plays their own character and nothing else.

There is no third role, and — in the lobby — no unseated state either. Opening
the link *is* joining: the door asks for a name and puts you at the table, with
a character still to choose. There was once a two-step way in (arrive, then
press "Usiądź" to claim a seat), which existed for nobody: everyone plays on
their own device and opens the link for exactly one reason.

During play the seatless state does still exist — somebody who opens a table
already in progress is a spectator by consequence rather than by design. They
see everything public, can act on nothing, and can take over any seat nobody is
behind.

### What only the host may do

| | |
|---|---|
| remove a player | in the lobby, and during play |
| choose a character *for another seat* | companion mode, for players with no device |
| add a player by hand | companion mode only |
| hand the host role to another player | any time |

### What any player may do

**Start the game**, once at least two characters are chosen and everybody
holding one has said they are ready. This is not a host power. Readiness is
already unanimous consent — it is exactly what the button waits for — so by the
time it can be pressed there is nothing left for a host to decide, and making
four people wait on a fifth to press a button they are all entitled to press is
a rule with no work to do. The server enforces both conditions; the button
carries whichever one is missing as its label.

And: choose their own character, say they are ready, change the name
they are shown under, leave, take over an abandoned seat, adjust their own
tracked values, and — during play — everything the rules give
their character. Corrections to *other* seats' points stay open to everyone
during play on purpose: at a table people fix each other's mistakes out loud,
and a rule that only the owner may correct a value is unusable at the moment
somebody else spots it.

The administrative powers are deliberately narrow. This is a game among people
sitting together, not a public server; the host exists so that setup has one
owner and the start has one trigger, not to police anybody.

---

## Becoming and ceasing to be host

**On creation.** Whoever opens the table is its host.

**On the host leaving.** The role passes automatically to the player who has
been at the table longest of those remaining — the lowest seat index, since
seats are appended in join order. A table is never left without a host while a
single player remains.

**By hand.** The host may pass the role to any seated player at any time. The
old host becomes an ordinary player; there is no co-host.

**When the host is absent.** If the host's seat is abandoned (see below), any
seated player may take the role without being given it. Without this a table
whose host closed their laptop can never be started or configured again, which
is the failure mode host migration exists to prevent.

**Companion mode.** The host's device is also the one that plays for everybody
in *sędzia przy planszy* mode, because there is one screen in the middle of a
real table. That is the same role, not a second one.

---

## Presence

A seat is in one of three states.

| state | meaning |
|---|---|
| **obecny** | a device holds this seat's token and has been seen recently |
| **nieobecny** | the device has stopped checking in — closed tab, flat battery, walked off |
| **bez gracza** | the player left deliberately, or the seat was taken over |

A player also carries a **gotów** flag. Choosing a character and being ready are
different things — the first is a decision you may still be mulling over — so
the host cannot start until everyone with a character has said so. Swapping
character clears it again, or a player who changed their mind at the last moment
would still be counted.

Only you can set your own ready flag, and only you can change your own name. A
host who could mark everybody ready would have a start button with extra steps.

Absence is never death. **A character is not removed when its player goes.** It
stays on its Obszar with its points, its Przedmioty and its Przyjaciele, because
the other players may already have acted on all of them, and because 4.4's death
is a different event with different consequences. Only the claim on the seat is
released.

An abandoned seat can be **taken over** — by somebody else, or by the same
person on a new tab, which is the commonest case since the usual way a seat
empties is a closed tab. The character continues exactly as it was left, with
its points, its cards and its position. The person taking over may give their
own name or leave the seat under the one the table already knows it by.

A seat that has gone *quiet* — heard from once and then not for `AWAY_AFTER_MS`
— can be taken over on the same terms. A player who closed their tab never said
they were leaving, so the seat is never marked abandoned, and refusing it would
strand the character for the rest of the evening. The people in the room settle
who picks it up; the server only refuses a seat somebody is actively using, and
a seat the host is driving on somebody else's behalf (`no_device`).

Taking over is offered only to a tab holding no seat of its own. **One tab, one
seat** — not one device. A seat's claim lives in `sessionStorage`, which is
scoped to the window, so two tabs of one browser are two players. It used to be
`localStorage` and they were the same player: opening a second tab arrived as
whoever the first tab was, and neither could be anybody else. See
`src/lib/game/seatToken.ts`. Reloading keeps the seat, which is the case that
actually happens; closing the tab drops the claim, and the takeover above is
how it comes back.

---

## The life of a table

```
utworzony ──> poczekalnia ──> w trakcie ──> zakończona
                   │              │
                   │              └─ gracz odchodzi ─> miejsce bez gracza ─> ktoś je przejmuje
                   ├─ gospodarz usuwa miejsce ─> miejsce znika
                   └─ gracz zamyka kartę ─────> miejsce znika ─> (ostatnie) stół znika
```

**Poczekalnia.** Seats are intentions, not characters. Leaving deletes the seat
and the host may remove any of them. Nothing is lost because nothing has
happened yet.

Closing the tab is the same act without the click, so it has the same effect —
and the page says so on its way out rather than being waited out. A `pagehide`
handler fires a `navigator.sendBeacon` to `/bye`, which is the only kind of
request that survives a page being discarded; `beforeunload` is not used, as
mobile browsers frequently never fire it and having a handler for it disqualifies
the page from the back/forward cache.

That is not a departure, because a reload fires `pagehide` too and the two are
indistinguishable from the server. It starts a `GOODBYE_GRACE_MS` countdown that
the reloaded page's first poll cancels.

The backstop, for the tabs that never manage to say anything, is silence: a seat
unheard-from for `LOBBY_GONE_AFTER_MS` is deleted. That threshold is much longer
than the one for *nieobecny*, because browsers throttle timers in a background
tab to roughly once a minute and evicting somebody for reading something else
would be worse than a ghost on screen for two minutes.

**The host stops being host before anybody is removed.** `HOST_MISSING_AFTER_MS`
is shorter than `LOBBY_GONE_AFTER_MS` on purpose: they answer different
questions — "can this table still be administered?" and "is this person still
here?" — and the first has to be answered first, or a table full of people sits
there unable to start. Only the role moves; the seat stays, so a host who comes
back is still at the table, just not running it.

A table everybody has gone quiet on is **unlisted before it is deleted**. It has
minutes left on its clock and is still advertised as somewhere you could go and
play, which is the one thing it is not — but deleting it the moment it looks
quiet would take a table away from somebody whose laptop had merely gone to
sleep. It stays reachable by its code the whole time.

When the last seat goes, so does the table. An empty poczekalnia is not a game
anybody can join; it is a code taking up space in the list. A table left holding
only seats the host filled in by hand counts as empty too — those have no device
behind them, so nobody can choose a character or start it.

Nobody polls a table everybody has closed, so it never hears that it is empty.
The sweep therefore runs in two places: when anybody opens the table, and when
anybody loads the list of tables.

Arriving at a table already in progress is not joining — the Karty Postaci were
dealt at setup and there is no 27th player. What the newcomer is offered is the
list of characters nobody is behind, and failing that, watching.

**W trakcie.** Seats are characters. *Leaving* abandons — the character plays
on. *Being removed by the host* is different and really does take the character
out, freeing the seat for somebody new. What it was carrying stays: the
Przedmioty, Przyjaciele and gold are left face up on its Obszar for whoever
stops there next (12.1), because a character vanishing with four items in its
hands makes the whole table quietly poorer.

**Zakończona.** Reached by somebody beating the Bestia (22), or by the table
falling to a single remaining player.

Tables are listed on the home page, most recently played first, with who is at
each and which seats have nobody behind them. `last_played_at` is touched on
every change, so the order reflects what was being *played* rather than what was
opened — which matters for a game that takes several sittings.

---

## Wybór postaci: "Losowa"

The first tile in the strip, ahead of the 27 printed characters, because it is
the rulebook's own default — "należy potasować Karty Postaci, a następnie
rozłożyć losowo" — and choosing freely from the strip is the variant everybody
has to agree to.

Held in `seats.character_id` as the sentinel `losowa` (`RANDOM_CHARACTER_ID` in
`characters.ts`). A sentinel rather than a null because **"surprise me" and
"I have not looked yet" are different answers**: the first can be ready to
play, and the second cannot. Everything else about the seat waits — no starting
field, no Miecz, no Magia, no Natura — which is what makes it a surprise rather
than a card dealt early and hidden by the interface.

Rules that fall out of it:

- **Several seats may hold it at once.** There is one Kapłanka, but no limit on
  how many people want whatever comes, so the uniqueness check skips it and the
  strip keeps its tile live for everybody except whoever already picked it.
- **`startGame` resolves it, and nothing else does.** `resolveRandomPicks` deals
  a distinct free character to every seat holding the sentinel, at the moment
  the game starts and not before — so no device, the player's own included, can
  see what is coming while the poczekalnia is still open.
- **Deliberately not `dealCharacters`.** That one also fills seats that chose
  nothing at all, and a seat that never picked has not agreed to play; dealing
  it a character when somebody presses start would put a stranger in the game.
- **Being dealt what you asked for does not un-ready you.** Choosing a character
  clears the ready flag, which is right when you change your mind and wrong
  here — it would make the start button refuse the very table that pressed it.
- **4.4 refuses it.** A dead player's new character is a choice from what is
  left, made in front of everybody mid-game; there is no game start left to
  resolve a sentinel against.

The tile's artwork is a Karta Postaci with the figure and printed name lifted
off the white field and the word LOSOWA in their place. Until it exists the
placeholders are marked `data-placeholder="losowa-standee"` and
`data-placeholder="losowa-karta"`, and hold the exact shape the real asset will
occupy so the strip lays out now as it will then.

## Decisions taken, and what was left out

**No ban list.** Kicking exists only before the start, and among friends in one
room a ban is a solution to a problem nobody has.

**No chat.** They are in the same room.

**The mode is chosen before the table exists** and never changes. It is not a
setting but a description of the evening: whether the board is in the room or
only in the app. Everything downstream branches on it — whether the host seats
people by hand, whether a deck is shuffled, who is asked to roll — so a table
that does not know yet is a table nothing can be decided about, and a table that
changes its mind halfway through setting up has to unpick all of it. The lobby
shows which mode it is and offers no way to switch.

**Adding a player by hand is companion-only.** There, one screen sits in the
middle of a real table and nobody else has a device. In *pełna symulacja*
everybody has their own and joins with the code, so a slot the host filled in
would be a way of taking somebody's seat before they arrived.

**The join code is the loudest thing on the screen.** For everybody not yet at
the table, reading it out or sending the link is the whole of what the lobby is
for; it was eight grey pixels next to the word "kod" and somebody across a table
had to lean in. Clicking it copies the link — the code is what you say, the link
is what you paste.

**Leaving before the start deletes the seat** and returns you to the table list.
Only during play does leaving abandon a character instead. Either way the button
is in the lobby header, next to your name, and asks once.

**Characters cannot be shared.** The box has 27 Karty Postaci and one figure per
card, and setup deals one to each player, so two seats holding the same
character is not a rule the game has an answer for. The lobby greys taken
characters out and the server refuses them, because two devices can reach for
the same one in the same second and only the server sees both.

**A name is required** to open a table or to join one, and it is asked at the
one moment somebody will answer it: on the way in — in a dialog, not as a field
on the entry page. Opening a table and joining one need different things (the
first also has to settle the mode), and a page carrying the union of both asks
most people for something irrelevant to what they came to do. The entry page is
therefore three things in the order they are wanted: join by code, open a table,
and the list of tables that already exist. A device that already holds a seat at
a table walks straight in from either of the last two — being asked your name at
a table you are sitting at is the app forgetting who you are, and a join without
a token would take a *second* seat and strand the first. A table of "Miejsce 2" and
"Miejsce 4" is nobody's game, and asking afterwards never happens — though it
can be changed at any time.

**A player is in one of three states**, and the lobby says which at a glance:
still choosing a character, chosen, or ready. Nothing else about a seat matters
before the start.

**No password, and every table is public.** The five-character code is the only
lock, and the list of tables shows them all. Anyone who can see the list is
somebody sitting in the room.

**Deleting a table is unguarded.** It takes two clicks and says what it does,
but the server does not ask who you are — there is no identity here that a
check could mean anything against. Without it the list becomes a graveyard of
abandoned experiments nobody can clear.

**Corrections stay open to everyone during play.** See above; this is
deliberate, and the journal records who changed what so an abuse would be
visible rather than prevented.

---

## Sources

Conventions checked against how these systems are normally built:

- [Unity — Lobby and Relay integration, host migration](https://docs.unity3d.com/Packages/com.unity.netcode@1.5/manual/host-migration/lobby-relay-integration.html)
- [Implementing a "Kick Out" feature in a multiplayer game lobby](https://blog.yarsalabs.com/creating-kick-system-in-multiplayer-game/)
- [Heroic Labs — How to create a multiplayer lobby system](https://heroiclabs.com/docs/nakama/guides/concepts/lobby/)
- [Unity — game-lobby sample](https://github.com/Unity-Technologies/com.unity.services.samples.game-lobby)

---

## Realtime zamiast odpytywania

Every device polls its table every two seconds. It works, it is simple, and it
is the reason the disconnect thresholds have to be minutes rather than seconds
(browsers throttle a hidden tab's timers to about once a minute). Replacing it
was researched and half-built; here is where it stands.

**It has to be Broadcast, not Postgres Changes.** Postgres Changes respects RLS
on the table it watches. This schema has RLS on with *no policies at all* — the
anon key can read nothing, by design — so a subscription to table changes would
deliver silence forever. Broadcast does not read tables, which also means the
secrecy model is untouched: no client learns anything from Supabase that a route
handler did not decide to tell it. Postgres Changes also authorises every event
per subscriber, so its cost scales with the number of people watching rather
than with the number of changes.

**The message is a number.** `stol:{KOD}` carries `{ revision }` and nothing
else — not who moved, not what they drew, and above all not anybody's Zaklęcia
(9.3). A device that hears a new number asks the server what happened, through
the same route handler as always, and is told only what its seat may see.

**Sent from a trigger, not from the route handlers.** Every mutation already
funnels through `bumpRevision`, so `games.revision` is the one place that knows
something happened. A trigger there (`magiczny_miecz.broadcast_revision`) cannot
be forgotten by a new endpoint the way a broadcast call in a handler would be.

### What works, and what does not

- The trigger is installed and fires.
- The HTTP broadcast endpoint accepts messages: `POST /realtime/v1/api/broadcast`
  returns **202**.
- The browser subscribes successfully: the channel reports `SUBSCRIBED`.
- **Messages are never delivered to the subscriber.** Public channels first —
  accepted, dropped. Then private, with a `select` policy on `realtime.messages`
  for `anon` scoped to `stol:%` topics — same result.

The remaining suspect is the project's Realtime settings, which are a dashboard
concern rather than a SQL one: whether Realtime is enabled for the project at
all, and whether "Allow public access" is on. Neither can be checked or changed
from a migration, so this is where it stopped.

**Nothing is worse in the meantime.** The client subscribes either way and the
poll stays at two seconds until a message *actually arrives*; the first one that
lands slows the poll to fifteen. So the day the setting is flipped, the table
gets faster on its own and nobody has to remember to change anything — and if it
never is, the app behaves exactly as it did before.
