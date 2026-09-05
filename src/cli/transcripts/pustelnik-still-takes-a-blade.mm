# The Pustelnik picks up a MIECZ, which his own Karta forbids.
#
# „Nie możesz używać Miecza, Sztyletu, Hełmu ani Zbroi." is clause [1] of his
# Karta Postaci, and it is encoded — `abilities.ts` has him under `zakazane`
# with those four cardIds. It does not run: `CHARACTER_POWERS_PARKED` is true,
# `abilitiesOfCharacter` answers with nothing, and every printed power outside
# a starting kit is off wholesale.
#
# So this transcript asserts what the app does today, not what the card says.
# When the powers come back it will fail here, and that failure is the point:
# it is the line that says which behaviour changed.

table new Ala, Ola
pick PUSTELNIK
ready
pick TROLL
ready
start

expect at Uroczysko
expect sword 2
expect magic 3

testmode on
deal MIECZ
take MIECZ
expect ok
expect holds MIECZ

# And the blade is worth nothing standing still — 1.5's other figure is the
# one it moves, which is a separate reading from the parked clause above.
expect sword 2

quit
