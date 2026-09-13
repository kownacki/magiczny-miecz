# „Strażnicy natychmiast zawracają cię na Obszar, z którego rozpocząłeś
# wędrówkę."
#
# This is the transcript that could not be written. The STRAŻ's destination is
# named in terms of the turn rather than of the board, so playing it means
# rolling a move whose end you know — and `roll` throws real dice. Three
# attempts gave three different squares, and what got written instead was a unit
# test with a hand-built `field` frame carrying `from`. That is the fixture the
# transcripts exist to avoid: it asserts that the code does what the code does,
# and nobody reading it can see a turn.
#
# `dice` binds the port to a script, which is the binding it has always had for
# tests. So here is the turn: roll a 3, walk to the Step, meet the guard, and be
# marched back to the Osada.

table new Ala, Ola
pick KRASNOLUD
ready
pick TROLL
ready
start
testmode on

expect at Osada

dice 3
roll
expect says Rolled 3. Reaches: Czarci Młyn, Step I
move Step I
expect at Step I

# The card asks nothing — its destination is the Obszar the move began from, and
# `answer` is just „get on with it". It used to ask, and obey whatever it was
# told, which turned „zawracają cię" into „go wherever you like".
deal STRAŻ
answer
expect says przenosisz się na: Osada
expect at Osada

# And the queue is empty, so nothing here leaks into the next transcript.
dice
expect says 0 throws still scripted.

quit
