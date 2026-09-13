# System kart — brief dla nowej sesji

**Napisane 2026-09-13 przez sesję Opusa, dla świeżej sesji, która ma to
rozkminić od początku.** Michał był wyraźny: *„jesteś Opus więc nie wytyczaj
kierunku — właściwie tylko przygotuj dla fable nowej sesji co wiesz ty po swojej
sesji i co ja chcę osiągnąć"*. Więc tutaj nie ma projektu ani rekomendacji. Są
trzy rzeczy: **czego chce Michał, jego własnymi słowami**, **co dziś jest w
repo i gdzie boli**, i **co robią inni**. Kierunek jest do wymyślenia, nie do
odczytania stąd.

Jedno zastrzeżenie do całości: **nic z tego nie jest pilne i nic nie jest
zepsute.** Gra działa, 3256 testów przechodzi, a błędy, które ten przegląd
znalazł, są już naprawione. To jest rozmowa o tym, na czym budować dalej —
zwłaszcza pod dodatki, których jest pięć i 512 kart (docs/EXPANSIONS.md).

---

## 1. Czego chce Michał — dosłownie

Przepisane bez zmian, bo interpretacja należy do czytającego.

> OK fajne punkty - ogólnie widzę jedną ważną rzecz - trzeba wzmocnim system
> kart wydarzeń i przedmiotów. Myślę że najlepiej będzie stworzyć system trochę
> na nowo od podstaw (i ile nie wygląda już tak - albo wtedy podciągnąć co mamy)
> żeby móc w ogóle tworzyć własne karty (albo właściwie kodować je prosto -
> czyli dodać taką warstwę gdzie "kod" karty jest osobny od silnika
> interpretującego tą kartę) Do tego potrzebny jest system właściwości kart tak
> żebyśmy mogli kontruować je z tego systemu i mieć logiczny ścisły sposób
> zapisu kodu/intrukcji karty (jak to nazwać). Taki system pozwoli nam łatwiej
> testować - nie powinno być jakiegoś kodu nierozerwalnego z daną kartą tylko
> może ona co najwyżej mieć poodane w kodzie że ma ona tą specjalną właściwość.
> Dzięki takiemu creatorowi powinniśmy mieć sklasyfikowany wszystkie właściwości
> i tworzyć z nich karty - nawet te bardziej skomplikowane jak eremita, gdzie np
> mamy conditionale (wylosowana vs napotkana), różne funicje (wybierz jedno,
> rzuć kostką) i oczywiście efekty dziejące się też sklasyfikowane i
> uporządkowane (+1 do miecza, ty/wszyscy/wybrana postać, co ile, itd). Żeby ten
> system był łatwiej sprawdzalny i testowalny musimy stworzyć ten kreator - to
> będzie taka osobna warstwa gdzie będziemy mogli tworzyć i testować karty w
> izolacji (będzie można uporządkować kod i testy) - w konsoli czy możnaby
> zrobić taki system gdzie np tworze customową kartę i wybieram - funckja rzuć
> kostką i potem dla każdego efektu wybieram efekt. I tworzy mi kod tej karty
> który potem jest interpretowany jak opisałem. Tak więc wracając do kodowania
> kart, pomyśl jakim kodem to robić biorąc pod uwagę jakie występują tam
> mechaniki żeby to było robust w sam raz do tego i tak żebyśmy mogli potem
> oglądać sobie kod w plikach każdej karty z gry (a potem prostu używac tego
> systemu do dodatków). Tak samo z tego kodu potem łatwo będzie renderować
> opisy w kartach. Podobny system musi byc rozszerzony potem o karty postaci,
> obszary, zaklęcia itd - jak taki system się nazywa ogólnie?

I drugi list, o researchu i o sprzątaniu:

> Co do tego systemu prawdopodobnie w grach typu rpg robi się takie systemy w
> których potem się składa przedmioty i inne rzeczy jak z klocków (np heroes 3
> mi się kojarzy) - poszukaj w interencie informacji na temat jak konstruować
> system kart zdarzeń, przedmiotów, postaci itp w kodzie - szczególnie pod
> kontem renderowania potem z tego kodu opisu i podpięcia do silnika (także jak
> skontruować silnik), oraz kreatora/edytora do kontruowania customowych kart.
> Prawdopodonbnie będzie potrzebne trochę posprzątanie w naszym kodzie - nie
> szkodzi możesz dużo pousuwać, poprzenosić i ogólnei zastąpić udoskonalonym
> systemem - moze też testy i ich struktura się zmieni (np zamiast testowania
> każdej karty end to end - granularne testowanie bliżej core systemu kart).
> Tak jak mówiłem zastanów się dobrze i przygotuj ogólne przemyślenia - ale
> jesteś Opus więc nie wytyczaj kierunku - właściwie tylkp rzygotuj dla fable
> nowej sesji co wiesz ty po swojej sesji i co ja chcę osiągnąć, oraz przekopuj
> tam to co tu piszę dokładnie i wcześniej na temat twgo systemu żeby on też
> mógł sam zinterpretować. A na razie dokończ 1-8 i potem ten handoff dla fable
> żeby on od początku rozkminił

**Wolno dużo wywalić.** To jest w tekście wyżej i warto to wyłowić, bo zmienia
zakres tego, co jest na stole: *„nie szkodzi możesz dużo pousuwać, poprzenosić i
ogólnie zastąpić udoskonalonym systemem"*, łącznie ze strukturą testów.

**Jak to się nazywa** (pytanie z końca pierwszego listu). Kilka nazw, każda o
innym kawałku: dane kart trzymane osobno od interpretera to **data-driven
design**; sam zapis karty to **card definition language** albo **content
schema**, a jeśli ma własną gramatykę — **DSL** (domain-specific language,
zwykle *embedded*, czyli pisany w typach języka gospodarza, albo *external*,
czyli własny plik i parser); interpreter to **rules engine**; budowanie efektu z
mniejszych to **composite pattern** albo **effect primitives**; narzędzie do
składania kart to **authoring tool** i cała droga od niego do gry to **content
pipeline**. Skojarzenie z Heroes 3 jest trafne w tym sensie, że tam artefakty i
umiejętności są rekordami z listą modyfikatorów, a nie kodem.

---

## 2. Co jest dziś w repo

To nie jest zielone pole. Spory kawałek tego, o czym mowa, już istnieje — i
właśnie dlatego pierwszą robotą jest zdecydować, co z tego zostaje.

### Słownik kart

`src/lib/engine/cardScript.ts` trzyma unię `Effect` — około trzydziestu
operacji. Od dziś dzieli się jawnie na dwie części:

- **`COMPOSING_OPS`** (7): `wybor`, `po-kolei`, `rzut`, `gdy`, `jak-pole`,
  `przenies-karte`, `zgadnij`. To są *kształty* — wybór spośród innych efektów,
  sekwencja, tabela kostki, gałąź warunkowa. Nic ich nie wykonuje; chodzenie po
  drzewie schodzi przez nie.
- **liście** (reszta): `punkty`, `zaklecie`, `uzdrow`, `strata`, `walka`,
  `przenies`, `poloz-karte`, `katastrofa`, `kup`, `sprzedaj`, `otrzymaj`,
  `kamien`, `tura-stracona`, `efekt`, … — rzeczy, które się dzieją.

Karta to `CardScript`: `{ optional?, placed?, effect, disposition }`, po jednej
na `CardId`, w `src/lib/engine/scripts/` z podziałem na klasy (`nieznajomi.ts`,
`wrogowie.ts`, `spotkania.ts`, `miejsca.ts`, `przedmioty.ts`). `placed` to
druga wypowiedź karty — Michał wspomniał Eremitę i to właśnie ten mechanizm:
*„conditionale (wylosowana vs napotkana)"* są dziś dwoma polami, `placed` i
`effect`, wybieranymi przez `instructionIn(script, being.lying)`.

`disposition` mówi, co z Kartą potem: `odloz`, `zostaje`, `do-pierwszej`,
`bierzesz`, `po-turach`.

### Cztery inne rejestry mówiące, co karta robi

- **`ABILITIES`** (`abilities.ts`) — klauzule drukowane, wspólne dla Kart
  Zdarzeń i Kart Postaci. Dane, nie kod.
- **`USES`** (`uses.ts`) — Przedmioty zużywalne, z polem `rozpatruje:
  "aplikacja" | "stol"`.
- **`SPELLS`** (`spells.ts`) — 27 Zaklęć, wszystkie ze skryptami.
- **`FIELD_SCRIPTS`** (`fieldScript.ts`) — Obszary, które coś oferują; ta sama
  gramatyka `Effect`, opakowana w `offers`.

Czyli **pięć miejsc, w których mieszka „co robi ta rzecz", i cztery różne
kształty**. Michał pyta o system, który obejmie też Postacie, Obszary i Zaklęcia
— częściowo już je obejmuje, ale nie jednym kształtem.

### Silnik

`src/lib/game/commands/effects.ts` — `walk()` schodzi po drzewie, zużywa
`Decisions` (lista liczb), i **zawiesza się** w ramkę `script` z kursorem, gdy
trafi na pytanie albo na rzuconą kostkę (docs/STACK.md; `heldAt`,
`continueTopScript`). `commands/ops.ts` to tablica liści: `Record<LeafOp, …>`,
wyczerpująca przez kompilator.

Warto zauważyć: **silnik jest już oddzielony od kart**, a wykonanie jest czyste
(`Snapshot` → `Changeset`). To, czego nie ma, to nie jest rozdzielenie — to
*zamknięcie* słownika. Patrz niżej.

### Trzy głosy tekstu

- `describeEffect` (`effectText.ts`) — pełne zdanie pod kartą.
- `summariseEffect` (`effectText.ts`) — wiersz obok cyfry na kostce. Od dziś
  wyczerpujący, bez `default`.
- `previewOf` (`abilityText.ts`) — „Miecz 6 → 7", liczby na przycisku.

Renderowanie opisu z kodu, o które Michał pyta, **już działa** i jest jednym z
lepszych kawałków repo. Zdanie pod Eremitą jest generowane, nie przepisane.

### Pytania

`src/lib/engine/question.ts` (napisane dziś) — `questionOn(frame, at)` zwraca
`TurnQuestion`: `dalej`, `wybor`, `gdzie` (z listą legalnych Obszarów), `cyfra`,
`ktora` (wskaż swoją Kartę), `nieobslugiwane`. Obie powierzchnie — konsola i
przeglądarka — czytają to samo; wcześniej każda decydowała sama i się nie
zgadzały.

### Testy

- Per-karta, end-to-end, w `src/lib/game/commands/*.test.ts` — dokładnie to, o
  czym Michał mówi *„zamiast testowania każdej karty end to end - granularne
  testowanie bliżej core systemu kart"*.
- Transkrypty `src/cli/transcripts/*.mm` — partia wpisana do `mm`, z `expect`.
  Dziesięć sztuk. Od dziś jest `dice 3 5 2`, więc da się pisać transkrypt na
  regułę zależną od kostki.
- `coverage.test.ts` — od dziś pyta, czy kartą **da się zagrać**, a nie tylko
  czy jest gdzieś zapisana.

---

## 3. Gdzie to dziś boli — z dowodami z tej sesji

To jest najcenniejsza część tego dokumentu: nie opinie, tylko błędy, które
przegląd siedemnastu Nieznajomych faktycznie wyprodukował. Każdy mówi coś o
kształcie systemu.

**a) Słownik nie jest zamknięty, a ucieczki z niego są niewidzialne.**
Reguła WAMPIRA („zabiera Życie i dodaje do swoich punktów") mieszka w
`commands/spoils.ts`. Reguła TAJEMNEJ SAKWY mieszka w `engine/slots.ts` jako
`storage`. Obie działają, obie były przez `coverage.ts` ogłaszane jako
„aplikacja tej Karty nie prowadzi", bo pokrycie wyprowadza odpowiedź z tego,
*gdzie karta jest zakodowana*, i znało cztery rejestry. Naprawione piątą półką
(`CARRIED_ELSEWHERE`), ale **to jest łatka, nie rozwiązanie**: dopóki karta może
mieć regułę „gdziekolwiek, gdzie pasuje", żadna pochodna nie będzie prawdziwa.
To jest dokładnie Michałowe *„nie powinno być jakiegoś kodu nierozerwalnego z
daną kartą tylko może ona co najwyżej mieć podane w kodzie że ma ona tą
specjalną właściwość"*.

**b) Właściwość karty bez czytelnika.** PÓŁBÓG ma `zeStosu: true`. To pole
czyta **wyłącznie** dwa renderery tekstu — żaden op go nie widzi. Efekt: karta
mówi „Możesz je wybrać ze stosu", a apka daje losowe. Nic tego nie łapało, bo
nic nie wymaga, żeby pole słownika miało czytelnika w silniku.

**c) Dwa znaczenia jednej flagi.** `optional` znaczyło naraz „wolno minąć" i
„nie ma go w kolejce 15.2". Rozdzielone dziś, ale pokazuje, jak łatwo w tym
kształcie skleić dwie rzeczy: flaga jest `boolean` na karcie, a pytania są dwa.

**d) Pytanie było własnością ekranu, nie reguły.** „Wskaż Przedmiot, który
tracisz" było zaimplementowane w `turn-view.ts` — w przeglądarce. Konsola nie
umiała tego zapytać wcale. Z tej samej rodziny: reguła „w tym Kręgu" była
trzymana przez to, że przeglądarka rysowała guziki tylko dla Kręgu, a serwer jej
ufał.

**e) Pokrycie mierzyło nie to co trzeba.** MĘDRZEC i MAGICZNA TABLICA miały
`pelne` i **nie dawały się rozegrać na żadnej powierzchni** — op był
`unimplemented`, `isSettled` mówiło „to pytanie", a żadna powierzchnia nie umiała
go zadać. Obie naprawione; test, który to łapie, jest nowy.

**f) Test, który odbija implementację, nie może jej sfalsyfikować.**
`coverage.test.ts` pytał o te same cztery rejestry co `coverageOf`, więc gdy
WAMPIR został zakodowany, nic nie pękło — mimo że sam komentarz testu prosił,
żeby go wtedy zaktualizować.

**g) Sześć sposobów mówienia, co karta robi** — to jest w docs/TASKS.md jako
rzecz *rozstrzygnięta* („Card vocabularies — done, do not reopen"). Wnioski
stamtąd trzeba przeczytać, zanim się je odwróci: `Effect` to zdarzenie,
`FieldScript` to menu zdarzeń, `Status` to stan posiadacza, `Ability` to druk na
karcie — i próba zwinięcia `Ability` w `Status` została **porzucona po
policzeniu kosztu**. Nie znaczy to, że decyzja jest wieczna; znaczy, że
argument jest spisany i wart przeczytania.

---

## 4. Co robią inni

Z researchu, o który Michał prosił. Podane jako informacja, nie jako wybór.

**MTG Arena** ma *Game Rules Engine* w C++ i **CLIPS** (dialekt LISP-a,
silnik regułowy). Osobny program w Pythonie tłumaczy angielski tekst karty na
reguły CLIPS-a — i ok. **80% nowo drukowanych kart działa automatycznie**, bez
pisania kodu na kartę. To jest skrajna wersja tego, o co pyta Michał: słownik
jest tak ciasny, że da się w niego celować tłumaczeniem z polszczyzny karty.
([magic.wizards.com](https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough))

**Argentum** (silnik MTG w Kotlinie, opisany krok po kroku) — deklaratywny
**embedded DSL**: karta to czyste dane składane z prymitywów
(`Effects.DealDamage(3)`, `TargetCreature(filter = …)`, `triggeredAbility {
trigger = OnEnterBattlefield() }`). Autor nazywa to wprost: *„the shared
language that card definitions and the engine both speak"*. Silnik to
`(GameState, GameAction) → ExecutionResult(GameState, List<GameEvent>)` na
niezmiennym stanie — bardzo blisko naszego `Snapshot → Changeset`. Efekty ciągłe
są liczone warstwami, osobno od stanu bazowego.
([wingedsheep.com](https://wingedsheep.com/building-argentum-a-magic-the-gathering-rules-engine/))

**Wzorzec efektów** powtarza się wszędzie: *composite* — każdy efekt daje się
rozłożyć na „unit effects", których już nie da się dzielić, a karta zadająca
obrażenia trzem celom to trzy instancje jednego prymitywu. Tak samo „keywords i
efekty działają jak metody, do których karta dostaje dostęp".
([InfoQ](https://www.infoq.com/articles/exploring-architecture-building-game/),
[critpoints.net](https://critpoints.net/2023/05/26/card-game-design-as-systems-architecture/))

**Walidacja schematem.** Współczesne implementacje (np. projekt MCD) trzymają
definicje kart jako JSON ze schematem i **warstwą kontraktu/walidacji** dzieloną
przez interfejsy TypeScriptu — „reusable composable effect primitives" nad
„headless rules engine".
([github.com/SteveRodrigue/MCD](https://github.com/SteveRodrigue/MCD),
[github.com/cmwedin/CardEngine](https://github.com/cmwedin/CardEngine))

**Istnieją gotowe języki do gier karcianych** — CGCL (Card Game Configuration
Language) i CGDL (Card Game Design Language) — warte zerknięcia choćby po to,
żeby zobaczyć, jakie pojęcia uznały za pierwotne.

**Edytory** (Card Creator, Tabletop Creator, Dextrous) okazały się **nie o tym**:
to narzędzia do *składu graficznego* kart i eksportu do druku, nie do zapisu
reguł. Tabletop Creator ma jedną rzecz na temat — zmienne, dzięki którym tekst i
statystyki aktualizują się wszędzie naraz. Kreatora reguł w sensie, o jaki pyta
Michał, w tym zestawieniu nie ma; bliżej mu do pythonowego tłumacza z MTG Arena
albo do walidatora schematu niż do któregokolwiek z tych narzędzi.
([Tabletop Creator](https://tabletop-creator.com/create-your-own-card-game-how/),
[Dextrous](https://www.dextrous.com.au/))

---

## 5. Czego nie wolno zgubić

Cokolwiek powstanie, te rzeczy są w CLAUDE.md i w docs/ jako rozstrzygnięte, a
ten przegląd potwierdził, że są zarobione bólem:

- **Id nigdy nie jest `string`**, a klucz w `resolved` nigdy nie jest `CardId`.
  Oba kosztowały po dwa realne błędy.
- **Silnik w `src/lib/engine/` jest czysty** — bez React, bez Supabase, bez
  `Math.random`. Kostka to port.
- **Zapis do gry idzie przez Command**: `Snapshot` → `Changeset` → commit pod
  CAS-em. To jest powód, dla którego każdy op ma test i żaden nie potrzebuje
  bazy.
- **Decyzja gracza jedzie jako liczba**, a serwer przechodzi kartę od nowa — żeby
  karty nie dało się namówić na coś, czego nie mówi.
- **Numer reguły to obietnica.** `journalRules.test.ts` wywala się na cytacie,
  którego Instrukcja nie ma.
- **Gra jest odtworzona 1:1** z druku — duplikaty w talii są celowe, bo zmieniają
  szanse.
- **`mm` jest najszybszą drogą do prawdy.** Cztery z pięciu błędów tej sesji
  wyszły z grania, nie z czytania kodu.

---

## 6. Pytania, które warto zadać zanim się zacznie

Nie są retoryczne — nie znam na nie odpowiedzi i nie powinienem był jej wybierać.

1. **Czy słownik ma być zamknięty?** Dziś karta może mieć regułę w komendzie
   (WAMPIR) albo w slotach (TAJEMNA SAKWA). Zamknięcie daje prawdziwe pokrycie i
   kreator; kosztuje tym, że każda nowa mechanika musi najpierw wejść do
   słownika. Otwarcie jest tańsze z dnia na dzień i właśnie cztery razy skłamało.
2. **Embedded czy external DSL?** Dziś: embedded w typach TS, co daje
   wyczerpujące tablice i błąd kompilacji za brakujący op. External (własny plik
   na kartę, parser, schemat) daje pliki, które da się oglądać i generować
   kreatorem — to chyba to, o czym Michał mówi *„żebyśmy mogli potem oglądać
   sobie kod w plikach każdej karty"* — ale traci kompilator jako strażnika.
   Trzecia droga: external plik + generator typów, jak `generate-ids.mjs` już
   robi dla idów.
3. **Ile kart naprawdę nie mieści się w słowniku?** Warto policzyć, zanim się
   projektuje. Dziś 134 ze 138 Kart Zdarzeń są `pelne`, wszystkie 27 Zaklęć mają
   skrypty — czyli słownik już *prawie* wystarcza na podstawkę. Prawdziwy test
   to 512 kart z pięciu dodatków (docs/EXPANSIONS.md), których nikt jeszcze nie
   przełożył.
4. **Co z `Status`?** Dziś osobna rzecz od `Effect` — „czym posiadacz *jest*"
   kontra „co się *dzieje*". W MTG to są efekty ciągłe liczone warstwami. Czy w
   nowym systemie to nadal dwie rzeczy?
5. **Co znaczy „testować kartę w izolacji"?** Dziś test karty stawia `Snapshot`
   i puszcza komendę. Granularniej mogłoby znaczyć: test samego drzewa efektu na
   sztucznym stanie, bez ramek i bez tury. Wtedy transkrypty zostają jako to, co
   sprawdza, że *tura* działa, a nie że *karta* działa.

---

## 7. Skąd zacząć czytać kod

W tej kolejności — to jest najkrótsza droga do zrozumienia, co dziś jest:

1. `src/lib/engine/cardScript.ts` — słownik. Unia `Effect`, `CardScript`,
   `COMPOSING_OPS`.
2. `src/lib/engine/scripts/nieznajomi.ts` — siedemnaście kart przełożonych, z
   komentarzami mówiącymi *dlaczego* każda tak wygląda. Najlepszy przekrój.
3. `src/lib/game/commands/effects.ts` — `walk`, zawieszenie, kursor.
4. `src/lib/game/commands/ops.ts` — tablica liści.
5. `src/lib/engine/effectText.ts` — renderowanie opisu z kodu, dwa głosy.
6. `src/lib/engine/question.ts` — co karta pyta, jeden raz dla obu powierzchni.
7. `docs/STACK.md` — dlaczego jedna ramka stanu tury nie wystarcza.
8. `docs/OBSZAR.md` — jak czyta się 12.1 przeciw 15.2. Najlepszy przykład tego,
   jak w tym repo rozstrzyga się sprzeczność w druku.

I `npm run mm`, żeby zobaczyć, jak to gra:

```
printf 'table new Ala, Ola\npick MAGOG\nready\npick TROLL\nready\nstart\ntestmode on\ndeal EREMITA\nanswer\nanswer\nlook\nquit\n' \
  | npx tsx src/cli/mm.ts
```
