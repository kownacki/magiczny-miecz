# „Wybierz cyfrę od 1 do 6 (musisz ją głośno powiedzieć), a następnie rzuć
# kostką. Jeżeli wynikiem jest cyfra, którą wybrałeś, otrzymujesz 1 Zaklęcie."
#
# The MĘDRZEC was listed as `pelne` — fully carried — and could not be resolved
# on either surface. `zgadnij` sat in the leaf table as `unimplemented`, so
# `isSettled` answered false for ever and the gate handed the whole card back:
# at the prompt „waiting on an answer no surface can ask yet", and in the
# browser a panel saying „odpowiedzcie w konsoli". Two surfaces pointing at each
# other over a card the coverage said was done.
#
# Saying the number out loud stays the table's ritual. Holding it while the die
# falls is the bookkeeping this app exists for — and it is the half that cannot
# be fudged once the app holds it.

table new Ala, Ola
pick KRASNOLUD
ready
pick TROLL
ready
start
testmode on

deal MĘDRZEC

# Bare `answer` opens the Karta; the question is then on the frame and `look`
# says what it is — which is the whole of the fix, since it used to say nothing.
answer
look
expect says MĘDRZEC: nazwij cyfrę — `answer <1-6>`

# Guessed right: the die is scripted, so the riddle is a rule rather than luck.
dice 4
answer 4
expect says zgadłeś!
expect ok

quit
