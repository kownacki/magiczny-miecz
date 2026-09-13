# Jedna Karta — kierunek dla systemu kart

**Napisane 2026-09-13 przez sesję Fable, w odpowiedzi na
[SYSTEM-KART.md](SYSTEM-KART.md).** Tamten brief celowo nie wytycza kierunku;
ten go wytycza. Wszystko poniżej jest propozycją do decyzji Michała — poza
krokiem 0, który jest zrobiony, bo mierzy, a nie zmienia.

## W jednym akapicie

System kart nie wymaga budowy od nowa. Jego środek — drzewo `Effect`, `walk` z
kursorem i zawieszeniem, trzy głosy tekstu, `questionOn` — jest dokładnie tym,
o co Michał pyta („kod karty osobny od silnika interpretującego"), i jest
najlepszą częścią repo. Boli w trzech miejscach i to one dają całą listę
objawów z SYSTEM-KART §3:

1. **Słownik nie jest domknięty.** Dwadzieścia trzy Karty mają regułę wpisaną
   w silnik po *nazwie* (`includes("wampir")`, `"tajemna-sakwa"`), więc nic
   pochodnego — pokrycie, Księga, kreator — nie może być prawdziwe.
2. **Słownik nie jest jedną rzeczą.** Co słowo znaczy, jest rozpisane w siedmiu
   przełącznikach w pięciu plikach; dodanie słowa to siedem miejsc i nic nie
   pilnuje, że wszystkie. Stąd `zeStosu` bez czytelnika.
3. **Karta nie jest jednym kształtem.** Pięć rejestrów o czterech kształtach,
   i „co robi ta Karta" trzeba składać z kilku plików.

Kierunek: **domknąć słownik testem, uczynić słownik tabelą, dać Karcie jeden
kształt i jeden plik** — w tej kolejności, każdy krok osobno wysyłalny, żaden
nie przepisuje `walk`.

---

## Odpowiedzi na pięć pytań z briefu

### 1. Czy słownik ma być zamknięty? — Tak. I oto co to znaczy

Definicja, jedno zdanie: **kod reguł nigdy nie zna Karty po nazwie. Karta
mówi, co robi, słowami ze słownika; silnik czyta słowa.**

To nie znaczy, że reguła WAMPIRA wyprowadza się ze `spoils.ts` — tam jest jej
miejsce, bo to jest reguła o łupach. Znaczy, że klucz do niej jest słowem na
Karcie (`{ kind: "wysysa-zycie" }` wśród jej cech), a nie `includes("wampir")`.
Wtedy pokrycie jest pochodną Karty, Księga mówi prawdę bez `CARRIED_ELSEWHERE`,
a druga karta o tej samej właściwości (w dodatkach będą) dostaje ją jednym
słowem.

**Miara i strażnik: `src/lib/engine/namedCards.test.ts`** (krok 0). Skanuje
`src/lib/engine` i `src/lib/game` poza rejestrami treści i zamraża każde miejsce,
gdzie kod cytuje `CardId` albo `SpellId`. Lista może maleć i nie może rosnąć.
Stan na 2026-09-13, pogrupowany według tego, *co* to jest:

| co | gdzie | karty | jak zamknąć |
|---|---|---|---|
| **transkrypcja w kodzie** — gdzie Przedmiot się nosi | `slots.ts` `SLOT_OF` | 14 | cecha na Karcie: `nosi-sie: "amulet"`; `SLOT_OF` staje się widokiem |
| **transkrypcja w kodzie** — skończony zapas | `stock.ts`, `slots.ts` `RELICS` | Magiczny Miecz, Tarcza Tolimana | cecha `zapas: 1` |
| **reguła na nazwie** — kieszeń, z której nikt nie sięga | `slots.ts` | Tajemna Sakwa | cecha `schowek: 1`, czytana tam, gdzie dziś czytane jest `"tajemna-sakwa"` |
| reguła na nazwie — łupy | `spoils.ts` | Wampir | cecha `wysysa-zycie` |
| reguła na nazwie — kształt walki | `cards.ts` | Sobowtór, Trójgłowy Smok, Przybysz z Krainy Cieni | cechy `odbija-miecz`, `glowy: 3`, `bez-broni` |
| reguła na nazwie — po rozpatrzeniu | `resolving.ts` | Układ Planet | Efekt na Karcie kładzie status na Demony; op już istnieje (`status` z `target`) |
| reguła na nazwie — dobieranie | `draw.ts` | Różdżka Zaklęć | klauzula do `Ability` `spells-over-limit` (`natychmiast: true`) |
| reguła na nazwie — rzucanie | `commands/spells.ts` | Władca Gromu, Władca Zaklęć, Zwierciadło | cechy `paralizuje-istoty`, `rozprasza`, `odbija-zaklecie` — trzy słowa, które model odpowiedzi i tak będzie potrzebował |
| reguła na nazwie — ucieczka przed Postacią | `fight.ts` | Krąg Płomieni | `Ability` `escape` z `from: ["character"]` **już istnieje** — tylko nikt go nie nadał Zaklęciu |
| czytelnik po nazwie zamiast po słowie | `turnStore.ts` `bridgeRequirements` | Magiczny Miecz, Tarcza | `Ability` `required` **już istnieje** — czytelnik ma pytać o nie |
| nagroda misji | `friends.ts` | Tarcza Tolimana (Władca) | to jest `receive` — treść Karty Przyjaciela, nie kod |

Cztery z jedenastu wierszy zamykają się słowem, które słownik już ma. To jest
ważna wiadomość: **słownik prawie wystarcza; nieszczelny jest nie on, tylko
nawyk.** Dlatego test przed przebudową — nawyk zmienia się od dnia, w którym
nowa nazwa w kodzie wywala build.

Koszt zamknięcia jest ten, który brief nazywa: każda nowa mechanika najpierw
wchodzi do słownika. To jest koszt *jednego dnia* na mechanikę i zysk na każdej
karcie, która ją potem dostanie. Otwarcie było tańsze cztery razy i cztery razy
skłamało.

### 2. Embedded czy external DSL? — Embedded, ale jeden plik na Kartę

Zostaje TypeScript i `satisfies Karta`: kompilator jest walidatorem schematu,
wyczerpujące `Record`y są tym, co brief nazywa „strażnikiem", a repo umie to
lepiej niż cokolwiek innego (docs/WHERE.md, „The trick the whole repo plays").
Osobny parser i osobny plik-schemat dałyby dokładnie to, co `tsc` daje za darmo,
i odebrały komentarze — a komentarze przy kartach są najlepszą dokumentacją
reguł, jaką to repo ma.

To, o co Michał naprawdę prosi — „oglądać sobie kod w plikach każdej karty" —
nie wymaga innego *formatu*, tylko innego *podziału*: **jeden plik na Kartę**,
`src/lib/engine/karty/<klasa>/<id>.ts`, z komentarzem karty w tym samym pliku.
Literał TS jest JSON-em z komentarzami; kreator, który „tworzy kod karty", pisze
taki plik jednym `JSON.stringify` i nagłówkiem.

Co trzyma drzwi do external otwarte za darmo: **test, że każda Karta przechodzi
przez `JSON.parse(JSON.stringify(karta))` bez zmiany** — żadnych funkcji, klas
ani `undefined` w treści. `WISH()` w `scripts/wish.ts` przechodzi (zwraca dane);
to jest jedyna „funkcja" w dzisiejszej treści i taką ma zostać: pomocnik, który
*produkuje* dane, nie dane, które *są* kodem.

Identyfikatory: z nazw plików, przez `generate-ids.mjs`, tak jak dziś. Kreator
nie tworzy id w locie — **„an id is never a `string`"** obowiązuje kreator tak
samo jak resztę. Zapisuje plik, uruchamia generator, i od tej chwili Karta jest
wszędzie: w Księdze, w `deal`, w testach.

### 3. Ile kart nie mieści się w słowniku? — Policzone

- Trzydzieści trzy słowa w `Effect`, **wszystkie trzydzieści trzy używane**
  w treści (79 skryptów, 23 Zaklęcia ze `script`, 23 Obszary). Nie ma słowa
  bez karty.
- Pięć rejestrów pokrywa 225 Kart podstawki (165 Zdarzeń, 30 Wyposażenia,
  30 Zaklęć) z trzema nakładkami (Łódź, Latarnia, Jabłko — w `USES` i
  `ABILITIES` naraz, bo mają obie połowy).
- Poza słownikiem: **23 Karty w 10 plikach** — tabela wyżej. Nie „nie mieszczą
  się"; nikt ich tam nie wpisał.

Dla dodatków (docs/EXPANSIONS.md): każda z wymienionych tam mechanik — dług,
banicja, więzienie, maksimum Życia, timery wieloturowe, flagi planszy, wspólna
pula — to **nowe słowo, nie nowy kształt**. Kształty (drzewo zdarzenia, reguła
stała, status z zegarem, warunek, cel) trzymają. Przegląd 677 tekstów pod
stos (docs/STACK.md) jest tego dowodem od innej strony. Dwie rzeczy dodatki
naprawdę łamią: **`Ability` bez warunku** (Krypta nadpisuje zdolności Postaci
„tylko w Krypcie"; dziś warunek ma tylko `safe.nature` i `nature-only`) —
więc `Ability` dostaje opcjonalne `gdy: Condition`, ten sam `Condition` co
`Effect`; i **id po nazwie** (PRZEWODNIK KRYPTY ×3 na jednym arkuszu), na co
EXPANSIONS.md ma już odpowiedź. Obie zmiany są tanie teraz i drogie potem, i
obie robi się dopiero, gdy pudełko się otwiera.

### 4. Co ze `Status`? — Dwie gramatyki, jedna Karta, jedna tabela

Nie składać. `Effect` to *zdarzenie* („dzieje się"), `Ability` to *reguła stała*
(„póki trzymasz"), `Status` to *wiersz stanu* („jest ci teraz, do kiedy"). MTG
ma tę samą trójkę (one-shot effect, static ability, continuous effect z
warstwami) i nie składa jej z tego samego powodu: pytania, które im się zadaje,
są różne. TASKS.md mówi „do not reopen" o składaniu `Ability` w `Status`, koszt
został policzony i ten dokument go nie podważa.

Co *się* składa, to nie typy, tylko **miejsce**: Karta ma jeden kształt, w
którym każda z gramatyk jest polem (niżej), i **słownik ma jedną tabelę na
gramatykę** — `WORDS` dla `Effect`, `ABILITY_WORDS` dla `Ability` — z których
kreator, tekst, pytania i pokrycie czytają to samo. `HELD_TWIN` zostaje jako
most między `Ability` a `Status`, bo jest wyczerpujący i to jest dokładnie ten
kształt.

### 5. Co znaczy „testować kartę w izolacji"? — Trzy warstwy, przykłady na Karcie

Dziś test karty stawia `Snapshot`, woła `resolveDrawnCard`, `resume`, i czyta
tabelę. To jest test *tury z tą kartą*. Granularniej, od dołu:

1. **Słowo** — jeden test na wpis w `OPS`: minimalny `Snapshot`, jedno słowo,
   `writes` i `did`. `effects.test.ts` już to robi dla części; reszta to
   dopisanie, nie projekt.
2. **Karta** — **przykłady na Karcie, jeden runner dla wszystkich.**
   ```ts
   examples: [
     {
       name: "takes the coin and hands over the card",
       given: { gold: 3, magic: 4 },
       answers: [0],
       expect: { gold: 2, spells: 1 },
     },
     { name: "refuses an empty purse", given: { gold: 0, magic: 4 }, answers: [0], expect: { gold: 0, spells: 0, says: "Za mało złota" } },
   ]
   ```
   `examples.test.ts` buduje stół z `aTable`, rozdaje Kartę, i gra jak gracz:
   „Dalej" nad rzuconą kostką, jedna odpowiedź na jedno pytanie, Obszar tam,
   gdzie Karta pyta „gdzie"; potem sprawdza `expect`. Ten sam runner jest
   **walidatorem kreatora**: `npm run card -- try` to ten sam kod bez `expect`.
   Granie jedną odpowiedzią naraz od razu znalazło błąd, którego żadna
   powierzchnia nie widziała, bo każda wysyła odpowiedzi hurtem: gałąź `choice`
   w `walk` gubiła zawieszenie z wybranej opcji (kostka pod Godziną Duchów,
   „gdzie" pod Jednorożcem, strata na Bagnach nie stawiały ramki).
   Tak testuje się karty w Forge i w każdym silniku, który ma ich tysiąc: karta
   niesie swoje własne dowody.
3. **Tura** — transkrypty `.mm`. Zostają jako to, co sprawdza, że *tura* działa,
   nie że *karta* działa.

Testy per-karta w `commands/*.test.ts` nie znikają hurtem. Każdy przechodzi do
`examples` wtedy, gdy przykład niesie te same asercje; te, które sprawdzają
coś o *turze* (kolejka, ramki, znak `resolved`), zostają tam, gdzie są.

---

## Kształt: `Karta`

Jeden interfejs. Każda klasa wypełnia pola, które ma na druku, i żadnych innych.

```ts
/** Wszystko, co mówi jedna karta z pudełka, w jednym miejscu. */
export interface Karta {
  id: CardId | CharacterId | FieldId;   // = nazwa pliku
  klasa: Klasa;                          // spotkanie | wrog | demon | nieznajomy | przyjaciel
                                         // | przedmiot | miejsce | zaklecie | postac | obszar
  zestaw: "podstawka";                   // dodatki: "grod" | "jaskinia" | … ; "wlasne" dla kreatora

  // Co robi — według chwili, w której to robi. Dzisiejsze rejestry, jako pola.
  wyciagnieta?: Effect;      // CardScript.placed — powiedziane temu, kto ją odkrył (15.1)
  rozpatrzona?: Effect;      // CardScript.effect — Spotkanie, Nieznajomy, Miejsce
  oferuje?: FieldOffer[];    // FieldScript.offers — Obszar, Miejsce-sklep
  trzymana?: Ability[];      // ABILITIES — reguły stałe; moce Postaci
  uzyta?: Use;               // USES — wydawana jednym aktem
  rzucona?: SpellScript;     // SPELLS — kiedy, na co, co robi
  przegrana?: Effect;        // CardScript.przegrana — co kosztuje przegrana z nią
  cechy?: Cecha[];           // nowe słowa dla dzisiejszych ucieczek: glowy: 3, zapas: 1,
                             // nosi-sie: "amulet", schowek: 1, wysysa-zycie, …
  potem: Disposition;        // gdzie ląduje

  dobrowolna?: boolean;      // CardScript.optional
  zuzywana?: boolean;        // CardScript.consumed

  examples?: Example[];      // §5
}
```

`Cecha` to fakt o *Karcie* (ile ma głów, gdzie się ją nosi, ile jest w
pudełku), czytany przy jednych drzwiach; `Ability` to, co Karta robi *dla
posiadacza*. Rozróżnienie jest to samo, które `abilities.ts` już robi między
`capacity` a `doesNotCount`.

**Kto wypełnia co:**

| klasa | pola |
|---|---|
| Spotkanie | `rozpatrzona`, `potem` |
| Wróg, Demon | `cechy`, `onLoss`, `wyciagnieta` (Lewiatan), `potem` |
| Nieznajomy | `rozpatrzona`, `wyciagnieta` (Eremita), `dobrowolna`, `potem` |
| Przyjaciel | `trzymana`, `cechy`, `potem: bierzesz` |
| Przedmiot | `trzymana`, `uzyta`, `cechy`, `zuzywana` |
| Miejsce | `rozpatrzona` albo `oferuje`, `potem: zostaje` |
| Zaklęcie | `rzucona`, `cechy` |
| Postać | `trzymana` (moce), `cechy` (wyprawka, start, Natura, Miecz, Magia) |
| Obszar | `oferuje`; reszta (tekst, Krąg, sąsiedzi) zostaje w `ring-fields.json` |

**Pliki:** `src/lib/engine/karty/<klasa>/<id>.ts`, `export default { … }
satisfies Karta`, z komentarzem karty *w tym pliku*. Indeks
`src/lib/engine/karty/index.ts` generowany przez `scripts/generate-karty.mjs`,
tak jak `generate-ids.mjs` generuje id, z testem, który wywala build, gdy indeks
jest nieświeży. **`SCRIPTS`, `ABILITIES`, `USES`, `SPELLS`, `FIELD_SCRIPTS` stają
się widokami nad `KARTY`** pierwszego dnia — żaden z ich czytelników nie musi się
ruszyć, żeby przeprowadzka się dokonała.

Ta sama Karta renderuje się do opisu tak jak dziś (`describeEffect`), tylko z
jednego miejsca dla wszystkich pól — Księga Tolimana czyta `Karta`, nie pięć
rejestrów.

---

## Słownik jako dane: `WORDS`

Sztuczka, którą repo już zna (`SPECS`/`VERBS` dla konsoli, `HELD_TWIN` dla
statusów), zastosowana do słownika kart. Dziś, co słowo *znaczy*, mieszka w:

| pytanie | gdzie | wyczerpujące? |
|---|---|---|
| jak je wykonać | `commands/ops.ts` `OPS` | tak, kompilator |
| czy jest rozstrzygnięte | `resolve.ts` `isSettled` | tak |
| co jest winne graczowi | `resolve.ts` `owedIn` | **nie** — `default` |
| który węzeł pod kursorem | `resolve.ts` `nodeAt` | **nie** — `default` |
| jakie pytanie zadać | `question.ts` | częściowo |
| pełne zdanie | `effectText.ts` `describeEffect` | tak |
| wiersz przy cyfrze | `effectText.ts` `summariseEffect` | tak (od 2026-09-13) |
| korzyść czy strata | `cardScript.ts` `valenceOf` | **nie** — `default` |
| które Obszary nazywa | `cardScript.ts` `fieldsNamedBy` | **nie** — `default` |
| czy otwiera dobieranie | `cardScript.ts` `reopensTheDrawing` | **`JSON.stringify` po tekście** |
| które składają | `cardScript.ts` `COMPOSING_OPS` | lista ręczna |

Jedenaście miejsc, cztery z `default`, jedno szukające po tekście. Zamiast tego:

```ts
export const WORDS: { [K in Effect["op"]]: Word<K> } = {
  punkty: {
    params: ["stat", "delta", "target"],
    children: () => [],
    settled: () => true,
    asks: () => null,
    valence: (e) => (e.delta > 0 ? "korzysc" : "strata"),
    fieldsNamed: () => [],
  },
  wybor: {
    params: ["options"],
    children: (e) => e.options.map((o, i) => [i, o.effect]),
    settled: () => false,
    asks: (e) => ({ kind: "wybor", options: e.options.map((o) => o.label) }),
    …
  },
  …
};
```

`children` zastępuje `nodeAt`, `fieldsNamedBy` i
`reopensTheDrawing` naraz — każde z nich jest przejściem po drzewie, które dziś
zna kształty na pamięć. `OPS` w `commands/` zostaje jako druga tabela nad tą samą
unią (wykonanie potrzebuje `Changeset` i innych komend, a silnik ma być czysty):
**dwa `Record`y, jedna unia, oba wyczerpujące** — jak `SPECS` i `VERBS`.

Co z tego wynika dla kreatora: menu „wybierz funkcję, potem dla każdego efektu
wybierz efekt" to *przejście po `WORDS.params`*. Nie trzeba go projektować —
trzeba mieć tabelę. I `ask word punkty` w `npm run ask` staje się jedną
linijką.

**Stan po kroku 1 (2026-09-13).** `src/lib/engine/words.ts` istnieje: `WORDS`
nad `Effect["op"]`, z `params` (mapa, więc kompilator wymaga każdego pola i
odrzuca obce), `composes` (typowane z `COMPOSING_OPS`, więc lista i tabela nie
mogą się rozjechać), `children` z indeksem kursora, `settled`, `asks`,
`valence`, `fieldsNamed`. `isSettled`, `nodeAt`, `valenceOf`, `fieldsNamedBy`,
`reopensTheDrawing`, `questionOn`, `coverage.test.ts` i `wordsRead.test.ts`
czytają tabelę zamiast znać kształty na pamięć. Dwa odstępstwa od szkicu
wyżej, oba celowe:

- **Tekst został w `effectText.ts`.** Dwa głosy były już wyczerpujące, a
  reguła stylu Michała mówi „jeden `Record` na zachowanie, przy definicji
  typu", nie „jeden `Record` na wszystko". Nad jedną unią stoją więc trzy
  tabele: `WORDS` (struktura), dwa `switch`e tekstu, `OPS` (wykonanie).
  Składanie tekstu do `WORDS` jest możliwe i nic nie daje, dopóki nie pojawi
  się czytelnik, który potrzebuje obu naraz.
- **Chodzenie po drzewie z pożyczonymi tabelami mieszka w `resolve.ts`.**
  `as-field` pożycza tabelę Obszaru z `FIELD_SCRIPTS`, a ten rejestr importuje
  `state.ts`, które importuje słownik; `words.ts` nie może więc sięgnąć po
  tabelę bez cyklu. Słowo mówi *którą* pożycza (`borrows`), a `childrenOf` w
  `resolve.ts` ją dokłada. `nodesOf` w `words.ts` chodzi po karcie „jak
  napisana", `everyNode` w `resolve.ts` wchodzi do pożyczonych tabel.

Tabela naprawiła po drodze dwie ciche luki: `nodeAt` znał cztery kształty i
odpowiadał `null` dla dwóch pozostałych, więc ramka zawieszona w pożyczonej
modlitwie Kapliczki albo w nagrodzie Mędrca nie miała pytania na ekranie;
teraz ma (`words.test.ts`).

**Nazwy: po angielsku.** Identyfikatory silnika są angielskie; polskie są
tylko nazwy własne gry (Karta, Obszar, Zaklęcie, Miecz) i istniejące słowa
karty (`op: "points"`, `price`). Pierwsza wersja tej tabeli miała `pola`,
`dzieci`, `pyta` i Michał ją zawrócił: rejestr języka karty przeniósł się na
API silnika, a to dwie różne rzeczy. Czy same słowa karty mają kiedyś przejść
na angielski, jest pytaniem do kroku 3, nie decyzją tego dokumentu; sprzątanie
starszych nazw jest zadaniem w TASKS.md.

Strażnik z kroku 0, `wordsRead.test.ts`, zostaje: sprawdza, że każdy parametr,
jaki treść daje słowu, jest czytany przez jego wpis w `OPS`. Dziś wie o trzech,
których nikt nie czyta — `zaklecie.zeStosu` (PÓŁBÓG rozdaje z wierzchu zamiast
dać wybrać), `zabierz.wybiera` (SZALEŃSTWO: kto wybiera, mówi Karta, walk nie
pyta), `katastrofa.zasieg` (jedna wartość, nikt nie czyta). Dwa pierwsze to
karty, które mówią jedno, a robią drugie. **Brief SYSTEM-KART mówi, że błędy z
przeglądu są naprawione; (b) nie jest.**

---

## Kreator

Trzy postacie, w kolejności wartości, i szczerze o trzeciej:

1. **`npm run card -- try <id> --dice 3,5 --answers 0,1 --gold 2`** — buduje
   stół z flag, rozdaje Kartę, gra jedną odpowiedzią na pytanie, drukuje co
   powiedziała, na czym stanęła i stan przed i po; `-- examples <id>` gra
   przykłady zapisane na Karcie. To jest runner z §5 bez `expect`
   (**zrobione 2026-09-13**). Na żywym stole to samo robi `mm`: `testmode on`,
   `dice`, `deal`, `answer`.
2. **`ask word <op>`** — parametry, kształt, przykład z treści, gdzie wykonywane,
   gdzie opisywane, kto mówi. Czyta `WORDS` (**zrobione 2026-09-13**). Wartość: to jest „sklasyfikowane
   właściwości", o które Michał pyta, jako polecenie zamiast jako dokument.
3. **Budowniczy w konsoli** — `karta new MOJA klasa=spotkanie`, `karta op rzut`,
   `karta 1 punkty life -1`, …, `karta zapisz` → plik z §Kształt. Robi się go
   *po* `WORDS`, bo wtedy jest przejściem po tabeli i kosztuje popołudnie.
   Szczerze: dla kogoś, kto pisze TypeScript, edytor z podpowiadaniem nad
   `satisfies Karta` daje osiemdziesiąt procent tego samego — więc budowniczy
   jest wart zbudowania, jeśli ma go używać ktoś przy stole, nie przy
   klawiaturze. To jest decyzja Michała, nie tego dokumentu.

Karta z kreatora dostaje `zestaw: "wlasne"` i nie trafia do `freshDecks`, dopóki
stół nie wybierze zestawu — to ten sam mechanizm, którego dodatki będą
potrzebowały („load a set", EXPANSIONS.md), więc buduje się go raz.

---

## Kolejność

Każdy krok jest osobnym, zielonym, wysyłalnym stanem repo. Żaden nie zależy od
zgody na następny.

| # | krok | co dowodzi, że zrobiony |
|---|---|---|
| 0 | **Strażnicy** — `namedCards.test.ts`, `wordsRead.test.ts` | **zrobione 2026-09-13**; liczby wyżej |
| 1 | **`WORDS`** — jedna tabela w silniku, jedenaście przełączników staje się lookupem; `OPS` bez zmian | **zrobione 2026-09-13**: `words.ts`; słowo dotyka unii, `WORDS`, `OPS` i dwóch głosów w `effectText.ts`, wszystkie cztery pilnowane przez kompilator; WHERE.md przepis 13; `ask word` |
| 2 | **`examples` + runner + `card try`** | **zrobione 2026-09-13**: `Example` na `CardScript`, `commands/examples.ts` gra jedną odpowiedzią na pytanie, `examples.test.ts` puszcza wszystkie; siedemnastu Nieznajomych niesie 28 przykładów; `npm run card -- try` i `-- examples` |
| 3 | **`Karta` + pliki + generowany indeks**; pięć rejestrów jako widoki | `karty/` istnieje, rejestry są jednolinijkowe, żaden czytelnik się nie ruszył; round-trip przez JSON |
| 4 | **Zamknięcie ucieczek**, jedna cecha na commit | `FROZEN` w `namedCards.test.ts` pusty; `CARRIED_ELSEWHERE` skasowane; `full` wyprowadzone z `Karta` |
| 5 | **Budowniczy w konsoli** — jeśli Michał go chce | `karta new … zapisz` produkuje plik, który przechodzi 3 i 2 |
| 6 | **Gotowość na dodatki** — `when` na `Ability`, `zestaw`, id z koordynatu | dopiero gdy pudełko się otwiera |

1 przed 3, bo tabela sprawia, że przeprowadzka jest mechaniczna. 2 przed 3, bo
przykłady na Karcie są tym, co pozwala przenieść kartę z jej testem w jednym
commicie. 4 może iść równolegle z każdym.

---

## Czego nie robić

- **External DSL, parser, plik-schemat.** Kompilator już jest walidatorem.
  Round-trip przez JSON trzyma drzwi otwarte; nie trzeba przez nie przechodzić.
- **Ładowanie kart w czasie działania.** Id z plików, indeks generowany, build
  — jak dziś. Karta „w locie" to `string` udający id.
- **Składanie `Ability` w `Status`.** Policzone, porzucone, TASKS.md.
- **Przepisywanie `walk`.** Kursor, zawieszenie, `follow` — to jest dokładnie
  ta część, która w MTG Arena i Argentum jest silnikiem. Dostaje `WORDS.children`
  zamiast siedmiu `if (effect.op === …)`, i tyle.
- **Budowniczy przed tabelą.** Menu zbudowane ręcznie to dwunasty przełącznik.
- **Usuwanie testów per-karta, zanim przykład niesie te same asercje.**

## Ryzyka

- **Dwieście pięćdziesiąt plików.** To jest to, o co Michał prosił, i jest to
  cena za „otwórz plik karty i widzisz wszystko". Komentarze przenoszą się z
  kartami — bez nich przeprowadzka jest stratą, nie zyskiem.
- **Drugi agent w repo.** Krok 3 robi się klasą po klasie, jedna klasa na jedno
  posiedzenie, żeby nie zostawiać rejestru w połowie drogi między tabelą a
  widokiem.
- **Nazwy pól.** `wyciagnieta`/`rozpatrzona`/`trzymana`/`uzyta`/`rzucona` są
  propozycją; jeśli któreś kłóci się z CONTEXT.md, wygrywa CONTEXT.md.

---

## Research: jak robią to inni, ze źródłami (2026-09-13)

Sprawdzone tego dnia w internecie, na pytanie Michała: *„jak tworzyć taki
system: silnik, karty, DSL — JSON czy coś innego?"*. Każdy wiersz ma źródło;
gdzie strona nie dała się otworzyć, jest to powiedziane. Wnioski dla nas są na
końcu sekcji.

### Sześć sposobów zapisu karty, po jednym przykładzie na każdy

| sposób | kto | jak wygląda karta | tekst na karcie | testy |
|---|---|---|---|---|
| **własna składnia tekstowa, plik na kartę** | [Forge](https://github.com/Card-Forge/forge/wiki/Card-scripting-API) (MTG, Java, ~30 000 kart) | `lightning_bolt.txt`: `A:SP$ DealDamage \| ValidTgts$ Any \| NumDmg$ 3 \| SpellDescription$ CARDNAME deals 3 damage to any target.` — `A:` zdolność, `T:` wyzwalacz, `S:` statyczna, `R:` zastąpienie, `SVar:` zmienne, `SubAbility$` łańcuch | **ręcznie** w `SpellDescription$` i `Oracle:`; nic nie sprawdza zgodności | brak testów per karta w dokumentacji; Developer Mode, AI grające ze sobą, i [pliki `.pzl`](https://github.com/Card-Forge/forge/blob/master/forge-gui/res/puzzle/MTGP_01.pzl): `[metadata] Goal:Win Turns:1` + `[state] p0hand=…; p0battlefield=Mizzix\|Tapped` — stan plus cel, czyli nasz transkrypt `.mm` |
| **klasa na kartę w języku gospodarza** | [XMage](https://raw.githubusercontent.com/magefree/mage/master/Mage.Sets/src/mage/cards/l/LightningBolt.java) (Java), [throneteki](https://github.com/throneteki/throneteki/blob/master/docs/implementing-cards.md), [ringteki](https://github.com/gryffon/ringteki/blob/master/docs/implementing-cards.md) (JS) | `LightningBolt extends CardImpl`; `getSpellAbility().addTarget(new TargetAnyTarget()); addEffect(new DamageTargetEffect(3))`. throneteki: `setupCardAbilities(ability)` z `this.action()`, `this.reaction()`, `this.persistentEffect()`, słownik `ability.effects.modifyStrength()`, `ability.costs.kneelSelf()` | **generowany z obiektów** i sprawdzany: [`VerifyCardDataTest`](https://github.com/magefree/mage/blob/master/Mage.Verify/src/test/java/mage/verify/VerifyCardDataTest.java) (`checkWrongAbilitiesText`) porównuje z tekstem MTGJSON | [DSL testowy](https://github.com/magefree/mage/blob/master/Mage.Tests/src/test/java/org/mage/test/cards/replacement/WinLoseEffectsTest.java): `addCard(Zone.BATTLEFIELD, playerA, "Platinum Angel"); setStopAt(40, END_TURN); execute(); assertLife(…)` — scenariusz na kartę |
| **deklaratywny DSL osadzony, karta = dane w języku gospodarza** | [Fireplace](https://github.com/jleclanche/fireplace/wiki/1:-The-Fireplace-Card-API) (Hearthstone, Python), [Argentum](https://deepwiki.com/wingedsheep/argentum-engine/2.1-card-dsl-and-cardbuilder) (MTG, Kotlin), [SabberStone](https://github.com/HearthSim/SabberStone/wiki/Model) (C#), [jinteki](https://raw.githubusercontent.com/mtgred/netrunner/master/src/clj/game/cards/events.clj) (Netrunner, Clojure) | Fireplace: `play = Destroy(TARGET)`, `deathrattle = Draw(CONTROLLER)`, `events = OWN_TURN_END.on(Hit(ALL_CHARACTERS - SELF, 2))`, `play = (Attr(TARGET, HEALTH) <= 15) & Buff(TARGET, "EX1_561e")`; ~30 akcji z selektorem celu ([Actions](https://github.com/jleclanche/fireplace/wiki/Actions)). Argentum: `card { manaCost = "{2}{U}{B}"; triggeredAbility { … }; spell { Effects.DealDamage(3) } }`, „pure data (serializable)", efekty jako sealed hierarchy: atomowe / `CompositeEffect` / `ConditionalEffect` / `ForEachInGroupEffect` / pipeline (gather → select → move), warunki `AllConditions`/`AnyCondition`/`NotCondition`, ilości `Count(Filter)`, `Arithmetic` ([2.2](https://deepwiki.com/wingedsheep/argentum-engine/2.2-effects-conditions-and-dynamic-amounts)). jinteki: `(defcard "Diesel" {:on-play (draw-abi 3)})` — mapy, ale `:effect` to makro, więc pół dane, pół kod | Argentum: [Assay](https://deepwiki.com/wingedsheep/argentum-engine/8.2-oracle-assay:-bidirectional-oracle-text-parser) — gramatyka **dwukierunkowa**, każda fraza ma `build` (tekst → model) i `match` (model → tekst), test `print(parse(text)) == text` na całym korpusie; to, czego nie umie przeczytać, liczy i szereguje „ile kart blokuje każda luka". Fireplace: dane statyczne z `CardDefs.xml` Blizzarda, tekst z nich | Fireplace: [jeden test na kartę, w izolacji](https://raw.githubusercontent.com/jleclanche/fireplace/master/tests/test_classic.py): `game = prepare_game(); wisp = game.player1.give(WISP); wisp.play(); give("CS2_188").play(target=wisp); assert wisp.atk == 3`. Argentum: [„one test file per card"](https://deepwiki.com/wingedsheep/argentum-engine/8.3-testing-infrastructure), `ScenarioTestBase`, stan planszy z JSON-a, decyzje przez protokół |
| **skrypt na kartę w osadzonym języku** | [EDOPro / ygopro](https://raw.githubusercontent.com/ProjectIgnis/CardScripts/master/official/c5318639.lua) (Yu-Gi-Oh!, Lua), [Legends of Runeterra](https://www.riotgames.com/en/news/engineering-tools-designers-legends-runeterra) (Riot, IronPython) | ygopro: `cX.lua` na kartę, `e1=Effect.CreateEffect(c); e1:SetType(EFFECT_TYPE_ACTIVATE); e1:SetCode(EVENT_FREE_CHAIN); e1:SetTarget(s.target); e1:SetOperation(s.activate)`; dane statyczne w SQLite `.cdb`; „każda karta poza zwykłymi potworami potrzebuje własnego skryptu". LoR: `## EventDoDamage` + `game.Draw()` | ygopro: tekst w bazie, osobno | ygopro: brak w dokumentacji |
| **słowniki / JSON interpretowany w czasie działania** | [Godot Card Game Framework](https://github.com/db0/godot-card-game-framework), [cardgameengine](https://github.com/martiendejong/cardgameengine) | CGF: skrypt karty to „simple json dictionary" zadań (ruch karty, żetony, właściwości) z wyzwalaczami i filtrami; cardgameengine: całe reguły w `game.json` | brak generowania | brak |
| **dane w XML, zachowanie w kodzie** | [Hearthstone](https://github.com/jleclanche/fireplace/wiki/CardDefs.xml) (Blizzard) | `CardDefs.xml`: tagi, `PlayRequirement`, `Entourage`; element `Power` wskazuje **GUID** implementacji w kodzie serwera | tekst w XML | — |

Poza tabelą, dwie rzeczy z przemysłu i dwie z akademii:

- **MTG Arena** ([Wizards](https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough)): Game Rules Engine w C++ i CLIPS (dialekt LISP-a); *„what it does not know is what any of the thousands of individual Magic cards do"*; Game Rules Parser w Pythonie tłumaczy angielski tekst karty na reguły CLIPS; *„80% or so of newly written Magic cards just work automatically"*, a pozostałe 20% to praca nad parserem, nie nad kartą.
- **Legends of Runeterra** ([Riot](https://www.riotgames.com/en/news/engineering-tools-designers-legends-runeterra)): zaczęli od wizualnego BlockBuildera z League; *„designers would keep coming up with cool ideas, and then get bottlenecked because they needed an engineer to create a specific custom block"*. Przeszli na skrypty w IronPythonie dla projektantów. Skład zespołu z „two designers and four engineers" na „around 15 designers and just three engineers". Lekcja o migracji: *„sometimes just having a good ol' toggle is an important safeguard when replacing a legacy system"*.
- **CGDL** ([Font, Mahlmann, Manrique, Togelius 2013](http://gpbib.cs.ucl.ac.uk/gp-html/Font_evoapps13.html)) i **RECYCLE** ([Goadrich, Bell; CardStock](https://cardstock.readthedocs.io/en/latest/recycle/index.html)): gramatyki **całych gier** (Texas hold'em, Blackjack, UNO; etapy i cykle tur, `CardMoveAction`, `ConditionalAction`, `Choice`, `PointMap`), do generowania i symulacji gier, nie do zapisu efektów pojedynczej karty. Ich lista pierwotnych pojęć pokrywa się z naszą (ruch karty, warunek, wybór, punkty); nic z nich nie nadaje się do wzięcia wprost.
- **riftbound-oracle** ([issue #26](https://github.com/gear-null/riftbound-oracle/issues/26)), projekt pisany przez agentów dla gry Riot: DSL jako JSON-owe AST, słownik **zwymiarowany empirycznie** przez klastrowanie 288 kart według czasownika, wyzwalacza i modyfikatora — cel 50–90 pierwotnych, 25–40 zdarzeń, poniżej 10 zastąpień; *„LLM generation against a fat per-card API (2,712 symbols) measured 5.3% exact accuracy, so the DSL is the lever"*; każda klauzula tekstu oznaczona jako implemented / approximate / unsupported; 40–60 ręcznie napisanych skryptów jako testy akceptacyjne i few-shot naraz. Cytowane jako jedyne miejsce, gdzie ktoś zmierzył, ile słownik pomaga agentowi.

Nie dało się otworzyć (403/404): `throneteki` testy per karta (widać tylko foldery po cyklach), `tcg-engines` (TypeScript, Lorcana; autorzy mają [skill](https://agent-skills.md/skills/TheCardGoat/tcg-engines/lorcana-cards) „single owner for everything related to a specific card… and any bounded engine or types extension required to make the printed text work" — to samo, co nasz przepis, ale kodu nie widziałem), pełna gramatyka CGDL, wiki Godot CGF ze skryptem przykładowym.

### Odpowiedź na „JSON czy coś innego"

**Nikt z dużym korpusem nie trzyma *zachowania* karty w gołym JSON-ie.** Ci, którzy to robią (Godot CGF, cardgameengine), są frameworkami dla małych własnych gier bez testów i bez generowania tekstu. Blizzard trzyma w XML-u dane i wymagania do sprawdzenia po stronie klienta, a zachowanie w kodzie pod GUID-em. Dojrzałe silniki dzielą się na trzy obozy:

1. **Własna składnia z własnym parserem** (Forge). Działa na 30 000 kart, ale opisy są pisane ręcznie i nic nie sprawdza ich zgodności z zachowaniem; rada dla autora brzmi „znajdź inną kartę, która robi to samo, i skopiuj". To jest cena zewnętrznego DSL-a: parser zamiast kompilatora.
2. **Klasa na kartę** (XMage, throneteki). To kształt `includes("wampir")` w skali: każda karta może zrobić wszystko, więc pokrycie i tekst trzeba sprawdzać osobnym testem przeciw zewnętrznej bazie. XMage tak właśnie robi i to działa, ale jest to dokładnie to, od czego odchodzimy.
3. **Karta jako dane w języku gospodarza, nad zamkniętym słownikiem** (Fireplace, Argentum, SabberStone). Argentum mówi to wprost: *„pure data (serializable)"* i *„prefer composing existing primitives over adding new SDK types; when you do add a type, parameterize it and name the mechanic, not the card"*. To jest zdanie z §1 tego dokumentu, napisane niezależnie przez kogoś, kto ma za sobą kilka tysięcy kart.

Więc pytanie nie brzmi „JSON czy TypeScript", tylko **„czy karta jest serializowalnymi danymi nad zamkniętym słownikiem"**. Literał TS z `satisfies Karta` plus test round-trip przez JSON ma tę własność i ma kompilator; JSON ma tę własność i nie ma kompilatora. Stąd decyzja z §2 zostaje: **TS jako źródło, JSON jako dowód (round-trip) i jako eksport**, kiedy jakieś narzędzie go potrzebuje.

### Co research zmienia w tym dokumencie

- **Potwierdza §1 i §2** (zamknięty słownik; dane w języku gospodarza). Rozmiar naszego słownika — 33 słowa `Effect`, 33 rodzaje `Ability` — mieści się w tym, co riftbound zmierzył jako właściwe (50–90 pierwotnych) i w tym, co ma Fireplace (~30 akcji).
- **Kształty Argentum jako lista kontrolna dla `WORDS`**: atomowe, sekwencja, warunek, **iteracja po grupie**, pipeline. Cztery mamy (`sequence`, `when`, liście, `take`/`move-card`); iterację mamy rozproszoną — `target: everyone` na trzech słowach i `roll-for-each` jako osobny op. Warto rozważyć przy kroku 1, czy `dla-kazdego` nie powinno być ósmym słowem składającym; to jest pytanie do zadania, nie decyzja.
- **Testy per karta są normą, nie wyjątkiem.** Fireplace, XMage i Argentum robią to samo: minimalny stan, karta, zaskryptowane decyzje, asercje na stanie. Nikt nie testuje tylko słów. `examples` na Karcie z §5 to ten wzorzec przeniesiony *na kartę*; nie znalazłem nikogo, kto trzyma je w pliku karty, najbliżej są pliki `.pzl` Forge (stan plus cel w jednym pliku).
- **Tekst z kodu ma mieć test przeciw drukowi.** XMage porównuje wygenerowany tekst z bazą MTGJSON; Argentum robi round-trip przez gramatykę. My generujemy (`describeEffect`) i nie sprawdzamy niczego. Tani odpowiednik: *touchstone* — każda liczba i każda nazwa własna z drukowanego tekstu Karty musi wystąpić w wygenerowanym opisie. Nie równość, bo polska proza się różni; obecność. Dopisane do kroku 2.
- **Pokrycie liczone klauzulami, nie kartami.** riftbound oznacza każdą klauzulę tekstu jako implemented / approximate / unsupported; Argentum szereguje luki po liczbie kart, które blokują. Nasze `LIVE_ABILITIES` już jest per klauzula dla Postaci; `coverage.ts` jest per karta. Przy kroku 4 warto to wyrównać.
- **Kreator: lekcja z LoR.** Bottleneck nie był w braku formularza, tylko w tym, że każdy nowy klocek wymagał inżyniera; rozwiązaniem był *język* dla projektantów, nie edytor. U nas język to `satisfies Karta`; budowniczy w konsoli (krok 5) jest wart zbudowania, jeśli ma go używać ktoś, kto nie pisze TypeScriptu. Wniosek z §Kreator bez zmian, teraz ze źródłem.
- **Migracja z przełącznikiem.** Riot: „a good ol' toggle". Krok 3 (rejestry jako widoki nad `KARTY`) jest tym przełącznikiem; to dodatkowy argument, żeby nie robić kroku 3 inaczej.

---

## Słowa silnika po angielsku (decyzja Michała, 2026-09-13)

Michał: „oba po angielsku — to są słowa kluczowe silnika, to powinno być po
angielsku od początku". Czyli nie tylko klucze, ale i nazwy słów, cele,
dyspozycje, warunki, rodzaje pytań. Po polsku zostaje wyłącznie to, co jest
nazwą własną gry (Karta, Obszar, Zaklęcie, Postać, Miecz, Magia, Życie,
Natura, Krąg), cytaty z druku w komentarzach, etykiety pokazywane graczom
i nazwy testów. Robi się to **przed krokiem 3**, bo po rozbiciu na pliki to
250 diffów, i falami, bo część słów leży w bazie.

**Fala 1 — słownik kart** (nic z tego nie jest trwale zapisane; `turn_state`
niesie drzewo efektu tylko w trakcie karty, więc stół w połowie karty w
chwili wdrożenia jest do zakończenia ręcznie):

| dziś | po | parametry (dziś → po) |
|---|---|---|
| `nic` | `nothing` | |
| `po-kolei` | `sequence` | `steps` |
| `wybor` | `choice` | `options` (`label`, `effect`) |
| `rzut` | `roll` | `faces`, `kostki`→`dice` |
| `gdy` | `when` | `warunek`→`condition`, `to`→`then`, `inaczej`→`else` |
| `jak-pole` | `as-field` | `fieldId` |
| `przenies-karte` | `move-card` | |
| `zgadnij` | `guess` | `nagroda`→`prize` |
| `punkty` | `points` | `stat`, `delta`, `target` |
| `uzdrow` | `heal` | `upTo`, `cena`→`price` |
| `sprzedaj` | `sell` | `cena`→`price` |
| `tura-stracona` | `lose-turn` | `turns`, `target`, `oprocz`→`except` |
| `ruch-dodatkowy` | `extra-move` | |
| `zaklecie` | `gain-spell` | `count`, `cena`→`price`, `zeStosu`→`fromPile` |
| `zaklecia-do-limitu` | `spells-to-limit` | |
| `przenies` | `move` | `to` |
| `wyciagnij` | `draw-cards` | `count` |
| `walka` | `fight` | `nazwa`→`name`, `miecz`→`sword`, `magia`→`magic` |
| `przyzwij` | `summon` | `nazwa`→`name`, `miecz`→`sword` |
| `podejrzyj` | `peek` | `count` |
| `katastrofa` | `wipe` | `klasa`→`cardClass`, `zasieg`→`reach` |
| `wymien-karte` | `redraw` | |
| `strata` | `lose` | `co`→`what`, `oprocz`→`except`, `count`, `wybor`→`chosenBy` (`ty`→`you`, `losowo`→`random`), `target` |
| `kamien` | `stone` | |
| `zamien-punkty` | `swap-points` | `z`→`from` |
| `natura` | `set-nature` | `na`→`to` |
| `kup` | `buy` | `towar`→`goods` (`co`→`name`, `cena`→`price`) |
| `poloz-karte` | `place-card` | `gdzie`→`where` |
| `otrzymaj` | `receive` | `co`→`what` |
| `efekt` | `status` | `label`, `modifier`, `ends`, `target` |
| `rzut-za-kazdego` | `roll-for-each` | `co`→`what` (`przyjaciel`→`friend`, `przedmiot`→`item`), `gubiPrzy`→`lostOn` |
| `uwolnij` | `release` | `od`→`from` |
| `zabierz` | `take` | `co`→`what` (`przedmiot-lub-zloto`→`item-or-gold`), `wybiera`→`chosenBy` (`ofiara`→`victim`, `rzucajacy`→`caster`) |

Rodzaje straty (`lose.what`, `losses.ts`): `przedmiot`→`item`,
`przyjaciel`→`friend`, `zaklecie`→`spell`, `gold`, `wszystkie-przedmioty`→
`all-items`, `wszystkie-zaklecia`→`all-spells`,
`wszyscy-przyjaciele-oprocz`→`all-friends-except`.

`Target`: `ty`→`you`, `wszyscy`→`everyone`, `wszyscy-w-kregu`→
`everyone-in-ring`, `kazdy-kto-tu-trafi`→`whoever-lands-here`,
`wszyscy-tutaj`→`everyone-here`, `dobrzy`→`good`, `chaotyczni`→`chaotic`,
`zli`→`evil`, `w-dolnym-kregu`→`in-lower-ring`, `w-srodkowym-kregu`→
`in-middle-ring`, `w-gornym-kregu`→`in-upper-ring`, `inna-postac`→
`another-character`.

`Destination.kind`: `pole`→`field`, `dowolne-w-kregu`→`anywhere-in-ring`,
`poczatek-ruchu`→`move-start`, `jedno-z`→`one-of`.

`Disposition.kind`: `odloz`→`discard`, `zostaje`→`stays`, `zostaje-z-pula`→
`stays-with-pool`, `do-pierwszej`→`until-first-visitor`, `bierzesz`→`kept`,
`po-turach`→`after-turns`, `wraca-do-stosu`→`back-to-pile`.

`Condition.is`: `natura`→`nature` (`jedna_z`→`oneOf`), `prog`→`threshold`
(`ponizej`→`below`), `ma-zloto`→`has-gold`, `attacker`.

`Valence`: `korzysc`→`gain`, `strata`→`loss`.

`CardScript`: `placed`→`onDraw`, `przegrana`→`onLoss`; `FieldScript`:
`obowiazkowe`→`mandatory`.

`Ask.kind` i `TurnQuestion.kind`: `dalej`→`continue`, `wybor`→`choice`,
`gdzie`→`where`, `cyfra`→`digit`, `ktora`→`which`, `nieobslugiwane`→
`unsupported`.

**Fala 2 — reguły stałe i statusy — zrobione 2026-09-13**: rodzaje `Ability`
(33), `Modifier` (10 z 18 — reszta była już angielska), `SpellTiming`,
`SpellTarget`, pola `Use`, wartości pokrycia (`pelne`→`full`, `czesciowe`→
`partial`, `brak`→`none`). Migracja dla `Modifier.kind` (`seat_effects.modifier`
leży w bazie) jest napisana w `db/migrations/2026-09-13-english-modifier-kinds.sql`
i **nie zastosowana** — stosuje ją wyłącznie sesja główna na słowo Michała
(WHERE.md, przepis 10).

`Ability["kind"]` (`abilities.ts`) — parametry w tej samej fali, dziś → po:

| dziś | po | parametry (dziś → po) |
|---|---|---|
| `bez-oplaty` | `no-toll` | `fields` |
| `bez-zaklec` | `no-spells` | `przeciwnikBez`→`opponentWithout` |
| `bezpieczny` | `safe` | `fields`, `from` (`rzut`→`roll`, `life`, `utrata`→`loss`), `natura`→`nature` |
| `cena-przyjecia` | `hiring-price` | `zloto`→`gold`, `zycie`→`life`, `bezZaplaty`→`ifUnpaid` (`zostaje`→`stays`, `odchodzi`→`leaves`) |
| `ginie-zamiast-ciebie` | `dies-for-you` | `onRollUpTo`, `onlyWhenRaiding` |
| `magia-do-miecza` | `magic-to-sword` | |
| `modyfikator-rzutu` | `roll-modifier` | `gdzie`→`where` (`na: "pola"`→`at: "fields"`, `na: "walke"`→`at: "fight"`, `rodzaj`→`kind`), `delta`, `dowolnyZnak`→`eitherSign`, `jednorazowy`→`once` |
| `natura-dowolna` | `any-nature` | |
| `niedostepny` | `unavailable` | `region` — wartość `dolny` zostaje: to nazwa krainy z `Region`, nie słowo silnika |
| `nosi-zaklecie` | `carries-spell` | `cena`→`price`, `znika`→`vanishes`, `mozeszObejrzec`→`mayView` |
| `oddaj-w` | `returned-at` | `cena`→`price` |
| `odporny-na-zaklecie` | `immune-to-spell` | `zaklecia`→`spells` |
| `oslona` | `shield` | `upTo` |
| `placi-za-przegrana` | `pays-for-loss` | |
| `podglad-zaklec` | `spell-peek` | |
| `pokonuje-bez-walki` | `beats-without-fight` | `kogo`→`whom`, `"demony"`→`"demons"` |
| `przeciw` | `against` | `komu`→`whom`, `miecz`→`sword`, `magia`→`magic` |
| `przeprawa-kostki` | `crossing-dice` | `obstacle`, `dice` |
| `przeprawa-wszedzie` | `crosses-anywhere` | |
| `punkty-na-polach` | `points-on-fields` | `punkty`→`points` |
| `punkty` | `points` | `miecz`→`sword`, `magia`→`magic`, `tylkoWalka`→`fightOnly` |
| `ruch-bonus` | `move-bonus` | `min`, `max` |
| `skup` | `buys` | `cena`→`price` |
| `sprzedaj-w` | `sells-at` | `cena`→`price` |
| `tylko-natura` | `nature-only` | `natury`→`natures` |
| `ucieczka` | `escape` | `fields`, `przed`→`from` (`wrog`→`foe`, `postac`→`character`) |
| `udzwig` | `capacity` | `items` (`bez-limitu`→`unlimited`), `samaSieNieLiczy`→`doesNotCount`, `giniePrzyUtracie`→`lostWithIt` |
| `uzdrowienie` | `healing` | |
| `walczy-za-ciebie` | `fights-for-you` | `miecz`→`sword`, `magia`→`magic`, `tylkoWyprawa`→`raidOnly` |
| `wymagany` | `required` | `place` (wartości `most`, `zamek-bestii` zostają: to nazwy planszy) |
| `za-oplata` | `for-a-fee` | `cena`→`price`, `miecz`→`sword`, `magia`→`magic`, `razNaTure`→`onceATurn` |
| `zabiera-zycie` | `takes-life` | `zycie`→`life` |
| `zakazane` | `forbidden` | `cardIds` |
| `zaklecia-ponad-limit` | `spells-over-limit` | `count` |

`EscapeTarget`: `wrog`→`foe`, `postac`→`character`.

`Modifier["kind"]` (`status.ts`), zapisane w `seat_effects.modifier`:
`bez-limitu-zaklec`→`no-spell-limit`, `magia-as-miecz`→`magic-as-sword`,
`magia-x2`→`magic-x2`, `ocalenie`→`rescue`, `oslona`→`shield`,
`przeprawa`→`crossing` (`przez`→`over`), `przeprawa-kostki`→`crossing-dice`,
`udzwig`→`capacity`, `unieruchomiony`→`immobilised`, `znowu`→`again`. Reszta
(`points`, `frozen`, `no-spells`, `move-max`, `spoken`, `nature`, `barred`,
`note`, `mission`, `no-friends`, `move-x2`, `attacker`) była już angielska.

`SpellTiming`: `dowolna-chwila`→`any-time`, `poczatek-tury`→`turn-start`,
`przed-ruchem`→`before-move`, `zamiast-ruchu`→`instead-of-move`,
`po-ruchu`→`after-move`, `przed-walka`→`before-fight`, `w-walce`→`in-fight`,
`spotkanie`→`meeting`, `po-karcie`→`after-card`.

`SpellTarget`: `siebie`→`self`, `postac`→`character`,
`siebie-lub-postac`→`self-or-character`, `wrog`→`foe`,
`postac-lub-wrog`→`character-or-foe`, `obszar`→`field`,
`karta-na-planszy`→`card-on-board`, `zaklecie`→`spell`, `brak`→`none`.
`SpellScript`: `stosuje`→`script`; `applies` wartości `gasi-zaklecia`→
`dispels-spells`, `zdejmuje-karte`→`removes-card`.

`Use` (`uses.ts`): `co`→`what`, `kiedy`→`when`, `rozpatruje`→`resolvedBy`
(`aplikacja`→`app`, `stol`→`table`), `efekt`→`status`.

`Coverage` (`coverage.ts`): `pelne`→`full`, `czesciowe`→`partial`,
`brak`→`none`.

Fala 2 zabrała też słowa silnika walki poza card-vocabulary: `Opens` w
`commands/ops.ts` (`kind: "walka"`→`kind: "fight"`, `nazwa`→`name`,
`miecz`→`sword`, `magia`→`magic`), `summonFighter` i `beginNamedFight` w
`commands/fight.ts` (te same cztery pola), i `commands/bridge.ts`'s
`DeathGameOutcome`: `dalej`→`onward`, `znowu`→`again`, `strata`→`loss`.

**Fala 3 — reszta silnika**: to, co TASKS.md nazywa „English sweep" (pola
`TurnPhase`, `Status`, `Command` konsoli, fixture'y).
