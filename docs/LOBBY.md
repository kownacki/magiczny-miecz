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

There is no third role. Somebody who opens the table without joining is a
spectator by consequence rather than by design: they see everything public and
can act on nothing.

### What only the host may do

| | |
|---|---|
| change the mode (symulacja / sędzia przy planszy) | before the start only |
| remove a player | in the lobby, and during play |
| choose a character *for another seat* | for seats with no device of their own |
| start the game | when at least two characters are chosen |
| hand the host role to another player | any time |

### What any player may do

Take a seat, choose their own character, say they are ready, change the name
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
person on a new device, which is the commonest case since the usual way a seat
empties is a closed tab. The character continues exactly as it was left.

Taking over is offered only to a device holding no seat of its own. One device,
one seat.

---

## The life of a table

```
utworzony ──> poczekalnia ──> w trakcie ──> zakończona
                   │              │
                   │              └─ gracz odchodzi ─> miejsce bez gracza ─> ktoś je przejmuje
                   └─ gospodarz usuwa miejsce ─> miejsce znika
```

**Poczekalnia.** Seats are intentions, not characters. Leaving deletes the seat
and the host may remove any of them. Nothing is lost because nothing has
happened yet.

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

## Decisions taken, and what was left out

**No ban list.** Kicking exists only before the start, and among friends in one
room a ban is a solution to a problem nobody has.

**No chat.** They are in the same room.

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
