# A session written down and played back reaches the same game.
#
# `record.ts` says what a replay needs and why it is only two things: the lines
# somebody typed, and the dice that fell while they ran. Shuffles need neither,
# because they come off the game's seed and the revision they happen at — and
# the rows the recording carries hold that seed, so the replayed table turns its
# piles over in the same order.
#
# What is asserted here is only what is the same on every run: where the figures
# stand, what is carried, whose turn it is. The dice themselves differ run to
# run — that is what makes them worth recording — so a transcript cannot name
# them, and a replay that re-threw them would still land on these numbers. What
# it would *not* land on is the same Zaklęcie off the same shuffle, which is the
# half checked by hand against `me` on both sides.
#
# A bare filename lands beside the saves, so this writes into whatever MM_HOME
# the run was given and never into the repository.

table new Ala, Ola
testmode on
record roundtrip.json

pick MAGOG
ready
pick TROLL
ready
start
roll
turn end
roll
turn end
deal MIECZ
take MIECZ
turn end

record off

# What the game came to, before anything is replayed.
expect at Step I Ala
expect holds MIECZ Ala
expect life 4 Ala
expect sword 6 Ola
expect phase roll

# Same lines, same dice, a fresh table.
replay roundtrip.json
expect ok
expect says Ala takes MIECZ.

expect at Step I Ala
expect holds MIECZ Ala
expect life 4 Ala
expect sword 6 Ola
expect phase roll

quit
