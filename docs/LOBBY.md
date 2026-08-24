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
| remove a seat from the lobby | before the start only |
| choose a character *for another seat* | for seats with no device of their own |
| start the game | when at least two characters are chosen |
| hand the host role to another player | any time |

### What any player may do

Take a seat, choose their own character, leave, take over an abandoned seat,
adjust their own tracked values, and — during play — everything the rules give
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

**W trakcie.** Seats are characters. Nothing is deleted; leaving abandons.

**Zakończona.** Reached by somebody beating the Bestia (22), or by the table
falling to a single remaining player.

Tables are listed on the home page, most recently played first, with who is at
each and which seats have nobody behind them. `last_played_at` is touched on
every change, so the order reflects what was being *played* rather than what was
opened — which matters for a game that takes several sittings.

---

## Decisions taken, and what was left out

**No ready-up.** The usual lobby has players mark themselves ready and blocks
the start until all are. Here, choosing a character *is* being ready, and the
start is already gated on two characters being chosen. A second flag would be
ceremony for people who can see each other.

**No ban list.** Kicking exists only before the start, and among friends in one
room a ban is a solution to a problem nobody has.

**No chat.** They are in the same room.

**No password.** The five-character code is the lock. Anyone who has it was told
it by somebody at the table.

**Removal is lobby-only.** During play there is nothing a host should be able to
do to another player's character. Their seat can be abandoned, taken over, or
eliminated by the rules — never by a person.

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
