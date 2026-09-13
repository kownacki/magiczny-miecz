# The Eremita rolls for his Obszar, settles on it, and the kolejka moves on.
#
# He did not. „Rzuć kostką i umieść Kartę Eremity na odpowiednim Obszarze"
# suspends over the face it threw and waits for „Dalej" (`heldAt`), so by the
# time the row actually runs, the frame on screen is the `script` frame and the
# Obszar's is one below it. `poloz-karte` read `top()`, found no kolejka to lift
# the Karta out of, and did nothing: the Eremita was laid down on his Obszar
# *and* left in the turn's `drawn`, where the browser's sheet kept holding him
# up — press „Dalej" and he asked to roll again.
#
# Two things are pinned here. The Karta leaves the kolejka, which is what lets
# the next one be answered at all (15.2, `refuseWhileQueuedFor`); and 12.1's
# window opens afterwards, which is the same bug one layer along — `resolved`
# names a *copy* (`eremita#2`) and every reader that asked for a bare name went
# on refusing forever.

table new Ala, Ola
pick KRASNOLUD
ready
pick TROLL
ready
start
testmode on

# Two compulsory Karty and a Przedmiot: 15.1 puts the Eremita first whatever he
# prints, and the Bóstwo cannot be answered until he is done with.
deal EREMITA, KOSZMAR, HEŁM
look
expect says Kolejka: » EREMITA · KOSZMAR

# The throw, and then the press that lets the face take effect.
answer EREMITA
expect says Wciąż czeka
answer
expect says osiada na

# He is gone from the row, and the Bóstwo is answerable now rather than refused
# behind him.
look
expect says Kolejka: » KOSZMAR
answer KOSZMAR
expect ok

# And with the kolejka worked through, the Obszar opens (12.1).
take HEŁM
expect holds HEŁM

quit
