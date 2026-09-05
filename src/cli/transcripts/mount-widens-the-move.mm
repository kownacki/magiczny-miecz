# A Wierzchowiec widens where a roll can put you.
#
# 10.2 walks the roll out in either direction, so a plain roll offers two
# Obszary from anywhere on a stretch of ring with no branch in it. The
# WIERZCHOWIEC prints „możesz dodać od 1 do 3 punktów do wyniku rzutu kostką",
# which `moveBonusRange` reads as 1..3 — and a range that may be *declined*
# offers the base roll too, so the offer is four distances each way.
#
# Both counts are the same whatever the die says, which is what makes this a
# test rather than a lucky run: 2 without the mount, 8 with it, from Step I.

table new Ala, Ola
pick MAGOG
ready
pick TROLL
ready
start

expect phase roll
expect at Step I

roll
expect phase move
expect reaches 2

# The same seat, the same Obszar, one Karta different.
testmode on
turn reset
deal WIERZCHOWIEC
take WIERZCHOWIEC
expect holds WIERZCHOWIEC

turn reset
roll
expect phase move
expect reaches 8

quit
