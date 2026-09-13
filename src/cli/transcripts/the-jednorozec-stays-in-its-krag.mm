# „Jednorożec może natychmiast przewieźć cię do dowolnego Obszaru w tym Kręgu."
#
# Two things were wrong with that sentence and the console found both.
#
# It could not be answered here at all. The destination is not a number, and
# `answer` took only numbers — so the card came back owed however many times it
# was answered, and „Wciąż czeka — odpowiedz jeszcze raz (`look`)" pointed at a
# `look` that had nothing to add. `to <Obszar>` is `cast`'s own word for the
# same job.
#
# And „w tym Kręgu" was not a rule anywhere on the server. The browser kept it
# by drawing buttons only for the ring, which is the interface enforcing a rule
# and the server trusting the interface — the exact thing `Decisions` exists to
# prevent. From the Osada, the Jednorożec would carry you to the Zamek Bestii.

table new Ala, Ola
pick KRASNOLUD
ready
pick TROLL
ready
start
testmode on

expect at Osada
deal JEDNOROŻEC

# Owed, and the reply says which word settles it rather than sending the player
# to a `look` that cannot show a question the card never suspended on.
answer 0
expect says Wskaż Obszar — `answer [n] to <Obszar>`.

# The Zamek is the middle of the board; the Osada is on the Dolny Krąg.
answer 0 to Zamek Bestii
expect refused
expect says Zamek Bestii jest w innym Kręgu (11.2).
expect at Osada

# And the ride that the card does offer.
answer 0 to Karczma
expect at Karczma

quit
