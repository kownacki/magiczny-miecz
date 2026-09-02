# Znaczniki

Dwa oznaczenia na rogu obrazka karty — `trofeum.svg` (pokonany Wróg, 1.4)
i `granted.svg` (karta z trybu testowego) — oraz cztery znaczniki Obszaru,
rysowane pod jego nazwą na mapie i obok niej w szufladzie: co ten Obszar
oferuje, zanim się na niego wejdzie (`src/lib/view/fieldMarks.ts`).

Ten sam zestaw i ta sama technika co ikony pustych miejsc w `public/slots/`:
sylwetki z [game-icons.net](https://game-icons.net), na licencji
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), pobrane w wariancie
`000000/transparent` i używane jako maski CSS — kształt bierze kolor tego,
w czym stoi. Ochra dla trofeum, czerwień dla znacznika testowego.

| plik | ikona | autor |
| --- | --- | --- |
| `granted.svg` | Spanner | Lorc |
| `trofeum.svg` | Trophy | Lorc |
| `sakwa.svg` | Swap bag | Lorc |
| `przeprawa.svg` | Sailboat | Delapouite |
| `kostka.svg` | Perspective dice six faces random | Delapouite |
| `gwiazda.svg` | Star swirl | Lorc |

`sakwa.svg` to ta sama sylwetka co `slots/sakwa.svg` i to samo pobranie —
skopiowana, a nie zaimportowana, bo mówi tu co innego: tam jest to *miejsce*
na ciele Postaci, tutaj *kupiec stojący na Obszarze*. Jeden plik dla dwóch
znaczeń byłby oszczędnością, która wiąże ze sobą dwie rzeczy mogące się
rozejść.

Emoji tego nie potrafi — niesie własne kolory — i to było powodem przejścia na
maski. Rysowanie tych dwóch ręcznie też nie: znak, który jest czytelny przy 48
pikselach i nieczytelny przy 16, jest znakiem nieczytelnym, bo szesnaście to
rozmiar, w jakim się go naprawdę ogląda.
