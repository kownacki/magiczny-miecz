# Pokrycie zasad

Every numbered rule in [RULES.md](RULES.md), and whether the app carries it.

This exists because "is it finished?" was not answerable without it. The engine
covers the move–fight–card loop well and has gaps elsewhere, and until they were
written down side by side it was impossible to tell which was which.

**Status**

| | meaning |
|---|---|
| ✅ | the app applies the rule |
| ◐ | partly — the app does some of it and the table does the rest |
| ❌ | the app does nothing; read the rule and apply it yourselves |
| — | nothing to implement (physical bookkeeping the app replaces by existing) |

A card-by-card equivalent of this table is enforced in code rather than written
down: see `src/lib/engine/coverage.ts`, which puts the same three states on
screen next to every drawn card.

---

## 0. Przygotowanie do gry

The setup paragraphs are unnumbered in the book; they are listed here because
they are rules, and one of them was missing.

| | rule | status | where |
|---|---|---|---|
| 0.0 | the Karty Postaci come in two forms: the big card with the description, and the small illustration-only one for the stand | ✅ | `characterImageUrl` / `characterStandeeUrl` |
| 0.1 | shuffle the Karty Postaci and deal one at random to each player | ✅ | `dealCharacters` — "rozlosuj postacie" in the lobby |
| 0.2 | by unanimous agreement, free choice instead of the random deal | ✅ | the character strip; this is the variant, offered as the default |
| 0.3 | one character per player — 27 cards, one figure each, no duplicates | ✅ | `chooseCharacter` rejects a taken character; the strip greys it out |
| 0.4 | each figure starts on its MGR (Miejsce Gracza) | ✅ | `startingFieldId` from the card's `start` |
| 0.5 | every character starts with 1 Sztuka Złota and 4 Życia | ✅ | column defaults in `db/schema.sql` |
| 0.6 | characters with starting Zaklęcia draw them at once, unseen by others | ✅ | `STARTING_KIT`, dealt on start; hidden by 9.3 |
| 0.7 | shuffle the Karty Zdarzeń and Zaklęć into face-down stacks | ✅ | simulation shuffles a virtual deck; in companion mode the table holds it |

## 1. Miecz Postaci

| | rule | status | where |
|---|---|---|---|
| 1.1 | Miecz used in combat and to overcome obstacles | ✅ | `combat.ts`, guardians, crossings |
| 1.2 | only own points are tracked; card bonuses added when needed | ✅ | `miecz_own` vs `derive.ts` |
| 1.3 | losses recorded, never below the starting value | ✅ | `miecz_floor`, `adjustOwn` |
| 1.4 | trophies trade at 1 Miecz per 7 points, remainder lost | ✅ | `tradeTrophies`, `TROPHY_RATE` |
| 1.5 | total = own + Przedmioty + Przyjaciele | ✅ | `totalsFor` |

## 2. Magia Postaci

| | rule | status | where |
|---|---|---|---|
| 2.1–2.5 | as 1.1–1.5, for Magia | ✅ | same |
| 2.6 | spell limit from Magia; excess must be discarded at once | ◐ | limit computed and shown; **discarding the excess is not forced** |

## 3. Złoto

| | rule | status | where |
|---|---|---|---|
| 3.1 | gold buys things | ✅ | `payFerry`; shops are ◐, see 21.2 |
| 3.2 | each character starts with 1, unless its card says otherwise | ✅ | `STARTING_KIT` (the Książę's five) |
| 3.3 | prices are in Sztuki Złota | — | |
| 3.4 | payments go back to the supply | — | no token supply to model |
| 3.5 | gold never counts against the item limit | ✅ | `carriedCount` |

## 4. Punkty Życia

| | rule | status | where |
|---|---|---|---|
| 4.1 | Życie is lost to combat and hazards | ✅ | |
| 4.2 | everyone starts on 4 | ✅ | column default |
| 4.3 | losses are recorded | ✅ | |
| 4.4 | at 0 the character dies; items and friends stay on the field, spells are discarded | ✅ | `killSeat` |
| 4.4 | the player may take a new character and restart from its MGR | ❌ | elimination is final in the app |
| 4.5 | Życie can be gained | ✅ | |
| 4.6 | no ceiling on gains | ✅ | |
| 4.7 | healing restores only up to the starting 4 | ✅ | `HEAL_CEILING` |

## 5. Przedmioty

| | rule | status | where |
|---|---|---|---|
| 5.1 | items are gained from encounters and fields | ✅ | `takeCard` |
| 5.2 | held face up | ✅ | `face: "open"` |
| 5.3 | a character may not hold an item its Natura forbids | ◐ | checked when Natura *changes*; not checked when the item is taken |
| 5.4 | four at a time unless carrying transport | ✅ | `carryLimit` |
| 5.5 | may be dropped at any moment, onto the current field | ✅ | `dropCard` |
| 5.6 | must drop down to the limit at once | ◐ | taking beyond the limit is refused; an existing excess is not forced out |

## 6. Przyjaciele

| | rule | status | where |
|---|---|---|---|
| 6.1–6.4 | gained, held face up, unlimited, may be dismissed | ✅ | `takeCard`, `dropCard` |

## 7. Natura

| | rule | status | where |
|---|---|---|---|
| 7.1 | every character is Dobra, Zła or Chaotyczna | ✅ | |
| 7.2 | Natura can change mid-game | ✅ | `changeNature` |
| 7.3 | at most one change per turn | ✅ | `nature_changed_turn`; Magog is exempt by 8.2 |
| 7.4 | an item forbidden by the new Natura must be dropped | ◐ | the app names them; dropping is left to the player |

## 8. Charakterystyki Postaci

| | rule | status | where |
|---|---|---|---|
| 8.1 | each character has special abilities and limits | ◐ | the mechanical ones are encoded in the card vocabulary (`characters.ts`); the rest are named on screen |
| 8.2 | an ability overrides the general rules | ◐ | encoded abilities join the seat's own, so they win where they apply |

## 9. Zaklęcia

| | rule | status | where |
|---|---|---|---|
| 9.1 | a spell's effect is on its card | ◐ | every spell's timing, target and effect are typed; the effect is stated, not applied |
| 9.2 | held only up to the Magia limit | ✅ | |
| 9.3 | held concealed from the other players | ✅ | enforced server-side |
| 9.4 | may not be discarded unless over the limit | ❌ | |
| 9.5 | drawn from the top; the pile is reshuffled when empty; some characters start holding one | ✅ | `drawSpell`, `STARTING_KIT` |
| 9.6 | casting: only as the card allows, then discarded, reaching anywhere on the board | ◐ | `castSpell` — the window is enforced, the card is spent and the table is told; the effect is the players' |
| 9.7 | no spell works on the Most or the Bestia | ✅ | refused in `castSpell` |

## 10. Tury

| | rule | status | where |
|---|---|---|---|
| 10.1 | move, then deal with where you landed | ✅ | `TurnPhase` |
| 10.2 | one ring, either direction, chosen each turn | ✅ | `moveOptions` |
| 10.3 | on the Most, one field per turn | ✅ | `bridgeOptions` |
| 10.4 | you may turn round and leave the Most | ✅ | both neighbours offered |
| 10.5 | having declared for the Bestia you must fight it | ◐ | the fight is offered, not compelled |

## 11. Przekraczanie granic Kręgów

| | rule | status | where |
|---|---|---|---|
| 11.1 | Trzęsawiska only at Uroczysko / Las Błędnych Ogni | ✅ | `CROSSINGS` |
| 11.2 | except by Łódź, or by field and card effects | ◐ | the Łódź is encoded as an ability; crossing anywhere is not wired up |
| 11.3 | rolled for only going inward | ✅ | `crossingIsDefended` |
| 11.4 | failure costs 1 Życie and stops you; a draw only stops you | ✅ | `settleCrossing` |
| 11.5 | Lodowy Las only at Przełęcz Wichrów / Dolina Czaszek | ✅ | |
| 11.6 | except by Latarnia | ◐ | as 11.2 |
| 11.7 | the Rycerz attacks only outbound characters | ✅ | |
| 11.8 | loss costs 1 Życie, a draw stops you | ✅ | |
| 11.9 | the Most is entered only from Ruiny Twierdzy / Wymarłe Miasto, past a guardian | ✅ | `BRIDGE_ENTRANCES`, `fightGuardian` |
| 11.10 | entered in passing, never by ending your move there | ✅ | `afterRoll` |
| 11.11 | a failed or drawn attempt costs a point and bars next turn | ✅ | `settleBridge`, `bridgeBlockUntil` |

## 12. Zbieranie z planszy odkrytych kart

| | rule | status | where |
|---|---|---|---|
| 12.1 | pick up gold, items and friends lying on your field, after any Wrogowie and drawn cards are dealt with | ✅ | `liftFieldCards`, `takeCard` |

## 13. Spotkania i badanie Obszarów

| | rule | status | where |
|---|---|---|---|
| 13.1 | only on the field your move ended on | ✅ | |
| 13.2 | meet another character *or* explore, not both | ◐ | both are offered; the choice is the players' |
| 13.3 | attack, or use an ability on them | ◐ | attacking works; abilities do not exist (8.1) |
| 13.4 | draw only enough to bring the field up to its printed count | ✅ | `afterMove(field, from, waiting)` |
| 13.5 | obey the field's instruction; beat or flee Wrogowie first | ◐ | text and die tables shown; ordering is the players' |

## 14. Spotkania na Kamiennym Moście

| | rule | status | where |
|---|---|---|---|
| 14.1 | characters may meet only at the two Wejścia | ❌ | not enforced |
| 14.2 | meetings resolve as elsewhere | ✅ | `attackSeat` |
| 14.3 | each Most field's printed instruction | ✅ | `most-fields.json` — all nine |
| 14.4 | no spells and no escape on the Most | ◐ | escape is blocked (19.3); spells do not exist |
| 14.5 | Pułapka / Magiczna Pułapka: 3 dice less Miecz or Magia, then a roll per item | ❌ | |
| 14.6 | Demon Zagłady / Monstrum: roll for its strength, fight until beaten | ❌ | |
| 14.7 | Zamek Bestii: roll the kind of fight, roll the Bestia at 10–15, win = win the game | ✅ | `fightBeast` |

## 15. Karty Zdarzeń

| | rule | status | where |
|---|---|---|---|
| 15.1 | cards that go to a named field resolve first and do not affect the drawer | ◐ | `poloz-karte` encodes the destination; the ordering is not applied |
| 15.2 | the rest resolve in printed numeral order | ✅ | `resolutionOrder` |

## 16. Rodzaje Kart Zdarzeń

| | rule | status | where |
|---|---|---|---|
| 16.1 | Spotkanie — obey it; a lost turn ends the turn at once | ✅ | |
| 16.2 | Wróg attacks immediately; its card is kept as a trophy | ✅ | `beginFight`, `kindForCard` |
| 16.3 | a Demon forces magical combat | ✅ | `startFight` |
| 16.4 | all Spotkania and Wrogowie first, then the rest | ✅ | `resolutionOrder` |
| 16.5 | Nieznajomy — obey it | ✅ | |
| 16.6 | Przedmioty and Przyjaciele may be taken | ✅ | `takeCard` |
| 16.6 | a drawn Magiczny Miecz / Tarcza Tolimana is swapped for the equipment copy | ❌ | |
| 16.7 | Miejsce — obey it | ✅ | |
| 16.8 | cards left behind stay face up on the field for the next character | ✅ | `leaveCardsBehind` |

## 17. Walka

| | rule | status | where |
|---|---|---|---|
| 17.1 | when a fight happens | ✅ | |
| 17.2 | flight is decided before any dice | ✅ | `escape` |
| 17.3 | spells must be used before the roll | ◐ | the fight window offers them; nothing forces the order |
| 17.4 | one die each, added to total Miecz; loser loses 1 Życie | ✅ | `compareCombat` |
| 17.4 | an item or spell may prevent that loss | ❌ | `oslona` is encoded but nothing consumes it |
| 17.5 | several enemies at once add their Miecze together | ❌ | one opponent at a time |
| 17.6 | the attacked character may try to slip away | ✅ | |
| 17.7 | **both** characters may cast before the roll | ◐ | a hand is castable during anyone's fight, not only its owner's turn; there is no explicit reaction pause |
| 17.8 | attacker's Miecz worked out first | ✅ | |
| 17.9 | the winner takes a Życie, an item, or a Sztuka Złota | ◐ | the Życie is applied; the choice is the players' |
| 17.10 | a draw costs nobody anything | ✅ | |

## 18. Walka magiczna

| | rule | status | where |
|---|---|---|---|
| 18.1 | when magical combat happens | ✅ | |
| 18.2a | Magia replaces Miecz | ✅ | `CombatKind` |
| 18.2b | no item can prevent the loss of Życie | ◐ | true by accident: no item prevention exists at all |

## 19. Ucieczka

| | rule | status | where |
|---|---|---|---|
| 19.1 | escape by special ability or Krąg Płomieni | ◐ | recorded; the app cannot judge it, since 8.1 and 9.6 are missing |
| 19.2 | you may flee anything in the three Kręgi | ✅ | |
| 19.3 | on the Most you may flee only other characters | ✅ | enforced |

## 20. Zamiana w Kamień

| | rule | status | where |
|---|---|---|---|
| 20.1 | three turns as stone | ✅ | `stone_until_turn` |
| 20.2 | a stone character keeps no items, gold or friends | ✅ | `turnToStone` — items and gold to the field, friends discarded |
| 20.3 | Miecz and Magia are kept but unusable | ◐ | kept; the ban is not enforced |
| 20.4 | cannot move for three turns | ✅ | `nextSeat` |
| 20.5 | cannot lose Życie, cannot be targeted; keeps its spells | ◐ | the spells are kept; the two prohibitions are not enforced |

## 21. Magiczne Miecze, Tarcze Tolimana i Karty Wyposażenia

| | rule | status | where |
|---|---|---|---|
| 21.1 | take the matching equipment card | ✅ | |
| 21.2 | bought items return to the shop stack and can run out | ❌ | shops are not modelled (see `kup`) |
| 21.3 | they may be left on the board like any card | ✅ | `dropCard` |

## 22. Zwycięstwo

| | rule | status | where |
|---|---|---|---|
| 22 | reach the Zamek Bestii and beat the Bestia | ✅ | `fightBeast` ends the game |

---

## The three that matter most

Counting rules is misleading — 20.5 and 9.6 are not the same size of hole. In
descending order of what they cost a table:

1. **9.6 — spells are cast but not applied.** All 27 have a typed window and
   target, the card leaves the hand and the table is told; what the spell does
   is still the players'. The remaining piece is 17.7's explicit reaction pause
   before combat dice.
2. **8.1 — character abilities are only half alive.** The mechanical ones now
   work; the ones that bend a rule rather than add a number (the Krasnolud's
   reroll, the Łotr's dirty fighting, the Olbrzym's extra card) are named on
   screen for the player to apply.
3. ~~**12.1 / 13.4 / 16.8 — cards on fields.**~~ Done. The board accumulates
   what previous characters left behind, the map marks which fields are holding
   something, and a field draws only up to its printed count.

After those: the two Pułapki and the Demon Zagłady / Monstrum (14.5, 14.6) print
their own procedures and the app shows them but does not run them.

---

## Wariant: ekwipunek slotowy

Not a rule. The rulebook has one kind of possession and one limit — four
Przedmioty, no distinction between what a character wears and what it carries
(5.4) — and nothing anywhere says a Hełm must be on your head to work. This is a
house variant in the Diablo mould, chosen when the table is opened
(`games.eq_mode`), and it never changes how the printed rules behave when it is
off. **Klasyczny** is the default.

In **slotowy** a character has nine places. What is worn sits in its place and
does not count against the pack; what is carried goes in the pack, which is
still the four of 5.4.

| miejsce | co tam pasuje | kart |
|---|---|---|
| Głowa | Hełm | 1 |
| Amulet | Talizman Ognia, Talizman Powietrza | 2 |
| Tułów | Zbroja | 1 |
| Ręka główna | Miecz, Sztylet, Magiczny Miecz, Arondight, Excalibur, Miecz Chaosu, Święta Włócznia, Topór Światła i Ciemności, Różdżka Przeznaczenia, Różdżka Zaklęć | 10 |
| Ręka pomocnicza | Tarcza, Tarcza Tolimana, Tarcza Boga Tolimana | 3 |
| Rękawice | Rękawice | 1 |
| Pierścień | Pierścień Mocy | 1 |
| Wierzchowiec | Koń, Muł, Zaprzęg, Wierzchowiec, Bojowy Rumak | 5 |
| Sakwa | Magiczna Sakwa, Tajemna Sakwa | 2 |

26 of the 45 Przedmioty are worn somewhere; the other 19 are carried.

**A weapon goes in the main hand only.** Two weapons at once is a character
ability — a Barbarzyńca fighting with a sword in each hand — and no character in
this box has one, so the rule waits until one does rather than being invented
for nobody. The off hand takes shields.

**Nothing is two-handed.** The two candidates by weapon type are the Święta
Włócznia and the Topór Światła i Ciemności, and the art on both cards shows a
single gauntleted hand on the haft. No card text mentions hands at all.

**There is no belt and there are no boots.** Both were proposed and neither has
a card anywhere: not among the 63 Przedmiot cards, not in the Wyposażenie, and
not in the text of any of the 165 Karty Zdarzeń — all of which are transcribed,
so that is the whole box rather than a gap in the transcription. The places were
dropped rather than drawn empty all game. The five expansions are out of scope
(CLAUDE.md) and their scans are untouched, so if a Pas or a pair of Butów turns
up in one of them, `slots.ts` says what to add.

### Plecak

What is not worn is in the **plecak**, and in the variant it holds sixteen, not
four. In klasyczny the limit of 5.4 is on everything a character owns; in
slotowy the worn things hang on the character and the pack is what is left over,
so keeping it at four would make the variant *stricter* than the book while
claiming to be a convenience. Sixteen is the Diablo grid this is modelled on — a
house number for a house rule. A Koń or a Sakwa still adds on top, and only
while worn: a Koń in the pack pulls nothing.

Taking something off puts it in the pack, so it can be refused: a character
carrying four things has nowhere to put its helmet, and the rulebook's answer to
being over the limit is to drop something (5.6) rather than to grow a fifth
place. The pack shows `n / limit` and draws its empty places, so the ceiling is
visible instead of being discovered by being refused.

### Co działa gdzie

**A card that has a place only works in it.** A sheathed Excalibur adds nothing.
That is the whole of the variant, and it is why the places matter at all.

**A card with no place goes on working from the pack.** The Latarnia, the Kij i
sznur, the Łódź, the Tabliczka, the Manuskrypt, the fruits and potions, the
Diament, the Szkatuła — and the relics and crystals whose effect is having them
about you rather than wearing them anywhere in particular: the Graal, the
Relikwiarz, the Kryształ Magów, the Kryształ Losu, the Zwierciadło Zniszczenia
and the Srebrna Strzała. Otherwise a quarter of the deck would fall silent the
moment the variant was switched on.

Przyjaciele are never worn and always count, as do trophies, which are not
carried at all but kept for trading (1.4).

### Co już działa, a co nie

| | status |
|---|---|
| the places, and which card fits which | ✅ `slots.ts`, `slots.test.ts` |
| chosen when the table is opened | ✅ `games.eq_mode` |
| put on, take off, swap what is already there | ✅ `equipCard` |
| refusing a card the place cannot take | ✅ a Tarcza will not go in the main hand |
| the pack limit counts only what is *not* worn | ✅ `carriedCount`, `carryLimit` |
| a Koń pulls nothing while it is in the pack | ✅ `carryLimit` |
| Miecz and Magia bonuses only from worn cards | ✅ `inEffect`, `bonusFromHoldings` |
| card abilities only from worn cards | ✅ `inEffect` at the ferry and the crossings |
| drawn as a body beside the character card | ✅ `slot-panel.tsx` |
| the pack drawn as its places, with the count | ✅ "Plecak n / 4" |
| the illustration as the icon, whole card on hover | ✅ `cardArtUrl`, `export-card-art.mjs` |
| dragging between the pack and a place, both ways | ✅ `slot-panel.tsx` |
| one click carries a card, a second puts it down | ✅ `carry.tsx` — works on touch, unlike drag |
| two clicks put it on or take it off | ✅ |
| a place says green or red before you let go | ✅ `movingCardId` + `fitsIn` |
| the move shows at once, the server is told after | ✅ optimistic; measured at 14ms |
| taking something off into a full pack is refused | ✅ `equipCard` |
| two weapons at once, for a character that can | ❌ no character in the box has the ability |

Klasyczny is untouched by all of it: `inEffect` returns everything, which is
what the rulebook says (5.4).
