# Two Wrogowie on one Obszar, and `fight` will not guess which.
#
# 17.5 sums the Miecze of creatures that attack together, and 18.1 says an
# ordinary and a magical Wróg cannot: `attackAsOne` refuses a mixed pack and
# `beginFight` throws „Zwykli i magiczni Wrogowie nie atakują razem —
# rozpatrzcie osobno (18.1)."
#
# That refusal has no door at this prompt. The console's `fight` takes exactly
# one Wróg — it asks which when more than one is waiting — so a mixed pack is
# never handed to `beginFight` together from here, and 18.1 is reachable only
# through the browser's `fight-start`. What this transcript pins is the console
# behaviour that stands in front of it: bare `fight` refuses and names both,
# and naming one fights that one alone.

table new Ala, Ola
pick MAGOG
ready
pick TROLL
ready
start
testmode on

# WILK prints a Miecz, WIDMO a Magia — the mix 18.1 is about.
deal WILK, WIDMO
expect phase field
look
expect says Kolejka: » WILK · WIDMO

fight
expect refused
expect says Which one — WILK, WIDMO?

# Both are still standing there; the refusal took nothing off the Obszar.
fight WILK
expect ok

quit
