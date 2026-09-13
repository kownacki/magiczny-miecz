# 15.2 puts every Karta on the Obszar in one row, and „Pomiń" is how you get
# past one.
#
# It did not. `owesAFrame` asked each Karta's own verb — „Każdy, kto tu trafi"
# against „która tu zawita" — and kept fifteen of them out of the kolejka
# altogether. A square holding a CUDOTWÓRCA, a CZARODZIEJ and a DOBRE BÓSTWO
# opened on the Bóstwo, and the other two were not in the row at all. From a
# player's chair that reads as the app skipping two cards.
#
# 15.2 is plain: „rozpatrywane są pozostałe Karty Zdarzeń … znajdujące się lub
# wyciągnięte na danym Obszarze. Konieczne jest przy tym zachowanie kolejności."
# 16.5: „konieczne jest wykonanie zawartej w Karcie instrukcji." Nothing takes a
# Karta out of the sequence for being an offer — and docs/OBSZAR.md had already
# written that down: „No addendum draws the compulsory/optional line by hand."
#
# The second half is why it was ever done that way: declining used to mark the
# Karta `resolved`, which spent it for the rest of the turn — and 12.1 gives a
# Nieznajomy „w każdej chwili, aż do końca swojej tury". `declined` is its own
# list for exactly that reason, and the last two lines here are the proof.

table new Ala, Ola
pick KRASNOLUD
ready
pick TROLL
ready
start
testmode on
life =2

deal CUDOTWÓRCA, CZARODZIEJ, DOBRE BÓSTWO, HEŁM
look
expect says Kolejka: » CUDOTWÓRCA · CZARODZIEJ · DOBRE BÓSTWO

# Walked past in the row's own order (15.2), not the window's: the Bóstwo is the
# compulsory one and it still waits its turn behind the two offers.
skip
expect says CUDOTWÓRCA — pominięta (możesz wrócić do końca tury).
skip
expect says CZARODZIEJ — pominięta (możesz wrócić do końca tury).
look
expect says Kolejka: » DOBRE BÓSTWO

answer DOBRE BÓSTWO
expect ok

# The row is worked through, so 12.1's window opens on the loot.
take HEŁM
expect holds HEŁM

# And the Cudotwórca is still there. This is the line that fails on the old
# code: declining him marked him resolved and he could not be visited again.
answer CUDOTWÓRCA 0
expect life 4

quit
