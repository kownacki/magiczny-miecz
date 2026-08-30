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

**Where it stands.** 126 rules ✅, 10 ◐, none ❌. Of the 138 Karty Zdarzeń, 112
are `pelne`, 20 `czesciowe` and 6 `brak` — all 17 Nieznajomi are done; all 27
Zaklęcia are carried out, 23 of them fully; and all 57 Obszary do what is
printed on them.
The counts move, so trust the code over this paragraph — `coverage.ts` and
`fieldScript.ts` are where the truth is, and both are checked by tests.

One caveat on that first number, learned the hard way on the Eremita:
`coverageOf` reports whether a card has a *script*, not whether the script can
resolve. He was `pelne` for months while his first step, `poloz-karte`, was
declared and unimplemented — so he rolled for where to settle and settled
nowhere. If a card matters, run it rather than counting it.

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
| 1.2 | only own points are tracked; card bonuses added when needed | ✅ | `sword_own` vs `derive.ts` |
| 1.3 | losses recorded, never below the starting value | ✅ | `sword_floor`, `adjustOwn` |
| 1.4 | trophies trade at 1 Miecz per 7 points, remainder lost | ✅ | `tradeTrophies`, `TROPHY_RATE` |
| 1.4 | the traded Wróg card goes to the stos zużytych | ✅ | `returnToPile` |
| 1.4 | a table may score Wrogowie instead of hoarding the Karty | ✅¹ | `trophy_mode`, docs/TROFEA.md |
| 1.5 | total = own + Przedmioty + Przyjaciele | ✅ | `totalsFor` |

¹ A variant, not the printed rule, and the default — see docs/TROFEA.md. „Karty"
plays 1.4 as written; „Punkty" (`points`) banks the beaten Wróg's Miecz on the seat and
sends the Karta to the stos zużytych. The rate, the refusal below it and the
loss on death are the same either way, so nothing above this line changes.

## 2. Magia Postaci

| | rule | status | where |
|---|---|---|---|
| 2.1–2.5 | as 1.1–1.5, for Magia | ✅ | same |
| 2.6 | spell limit from Magia; excess must be discarded at once | ✅ | the limit is computed and shown beside the hand (`Zaklęcia 3/2`), drawing past it is refused, and an excess that arises the other way stops the game until it is shed — `refuseWhileOverLimit`, at the two doors of a turn. Which Zaklęcie goes is the player's; 9.4 already lets one be dropped from a hand that is over this limit and no other. The limit moves under you, which is 2.6's own example: a Pierścień Mocy lends nothing on the Zaczarowane Wzgórza, so walking there can put you over |
| 2.6 | Różdżka Zaklęć: at least one more than the setup hand, refilled on demand | ✅ | `spellAllowance` floors the limit; `drawSpellWithWand` is the refill |
| 2.6 | Zaczarowane Wzgórza suspend the Miecz and Magia drawn from Przedmioty, and bar casting | ✅ | `suppressesItems`; the board's own text names every Przedmiot, not only the magical ones |

## 3. Złoto

| | rule | status | where |
|---|---|---|---|
| 3.1 | gold buys things | ✅ | `payFerry`; the board's shops in `fieldScript.ts`, paid through `buyGoods` / `sellHolding` / `payHealer` |
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
| 4.4 | the player may take a new character and restart from its MGR | ✅ | `takeNewCharacter` |
| 4.4 | its Karta is set aside and stays out of the game | ✅ | `games.characters_out`; written by `killSeat`, read by every choosing path |
| 4.5 | Życie can be gained | ✅ | |
| 4.6 | no ceiling on gains | ✅ | |
| 4.7 | healing restores only up to the starting 4 | ✅ | `HEAL_CEILING` |

## 5. Przedmioty

| | rule | status | where |
|---|---|---|---|
| 5.1 | items are gained from encounters and fields | ✅ | `takeCard` |
| 5.2 | held face up | ✅ | `face: "open"` |
| 5.3 | a character may not hold an item its Natura forbids | ✅ | refused in `takeCard`, so it stays lying where it was found; refused again in `equipCard`, which the console and 7.2 can both reach |
| 5.3 | …and one already held, after the Natura moved under it | ✅ | in klasyczny it is put down at once — see 7.4, which is where the two modes part company. In both, `inEffect` lends nothing off it and the slot is drawn red |
| 5.4 | four at a time unless carrying transport | ✅ | `carryLimit` |
| 5.5 | may be dropped at any moment, **onto the current field** | ✅ | `dropCard` inserts it into `field_cards` where the character stands |
| 5.6 | must drop down to the limit at once | ✅ | taking beyond the limit is refused, and an excess that arises the other way — the Koń lost, the limit falling under the pack — stops the game until it is dropped. `refuseWhileOverCarried` guards the two doors of a turn: you cannot begin one owing the rule and cannot hand one on. Which Przedmiot goes is not chosen for you, because 5.4 says it is yours |

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
| 7.4 | an item forbidden by the new Natura must be dropped | ◐ | **klasyczny: yes** — `changeNature` puts it on the character's Obszar at once (12.1) and journals a plain `odrzuca`. **slotowy: no, deliberately** — the variant has already split carrying from using, and 5.3 forbids possession *because* it forbids use ("którymi na mocy zasad nie wolno się jej posługiwać"). A card in the Plecak there is baggage: it stays, goes red, lends nothing through `inEffect`, and `equipCard` refuses it. Worn when the Natura moved under it, it stays worn and stays dead — taking it off is the owner's move. This is a departure from the printed rule, and it lives in the variant because klasyczny is the game as the box has it |

## 8. Charakterystyki Postaci

| | rule | status | where |
|---|---|---|---|
| 8.1 | each character has special abilities and limits | ◐ | the mechanical ones are encoded in the card vocabulary (`characters.ts`); the rest are named on screen |
| 8.2 | an ability overrides the general rules | ◐ | encoded abilities join the seat's own, so they win where they apply |

## 9. Zaklęcia

| | rule | status | where |
|---|---|---|---|
| 9.1 | a spell's effect is on its card | ✅ | every spell's timing, target and effect are typed, and **all twenty-seven are carried out** — through `SpellScript.stosuje`, `applies` or `reactive`. Four are carried in part and say which part in `MANUAL` (`coverage.ts`), so they read `czesciowe` and print the rest where a player reads the card: KRĄG PŁOMIENI and WŁADCA GROMU cannot hold a status on a Karta lying on an Obszar, WOJNA ŻYWIOŁÓW cannot know which Przedmioty are *Magiczne* because the word was never transcribed, and OCALONY's Przyjaciel and „remis" thirds are the table's |
| 9.2 | held only up to the Magia limit | ✅ | |
| 9.3 | held concealed from the other players | ✅ | enforced server-side |
| 9.4 | may not be discarded unless over the limit | ✅ | `dropCard` refuses under the limit |
| 9.5 | drawn from the top; the pile is reshuffled when empty; some characters start holding one | ✅ | `drawSpell`, `STARTING_KIT`; the reshuffle is journalled and both piles are counted in the top bar |
| 9.6 | casting: only as the card allows, then discarded, reaching anywhere on the board | ✅ | `castSpell` — the window is enforced, the card reaches the used pile and the table is told (12.5). A cast anybody could answer waits as a `spoken` status while they decide, and the two answering Karty turn or negate it; the browser counts the window down and closes it. The one card that asks a second question — WŁADCA ZDARZEŃ, „na inny, nie zajęty Obszar" — is refused rather than spent until it is answered |
| 9.7 | no spell works on the Most or the Bestia | ✅ | refused in `castSpell` |

## 10. Tury

| | rule | status | where |
|---|---|---|---|
| 10.1 | move, then deal with where you landed | ✅ | `TurnPhase` |
| 10.2 | one ring, either direction, chosen each turn | ✅ | `moveOptions` |
| 10.3 | on the Most, one field per turn | ✅ | `bridgeOptions` |
| 10.4 | you may turn round and leave the Most | ✅ | both neighbours offered |
| 10.5 | having declared for the Bestia you must fight it | ✅ | compelled by the condition 14.7 states in cardboard rather than the one 10.5 states in etiquette: "nie może z niej zrezygnować **jeśli posiada Tarczę Tolimana**". Standing in the Zamek holding either Tarcza, `refuseWhileBeastAwaits` closes the two doors of a turn — you cannot roll away and cannot pass. The spoken declaration is deliberately not modelled |

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
| 12.1 | pick up gold, items and friends lying on your field | ✅ | `liftFieldCards` on arrival; `takeFromField` for anything lying there, from the field's own modal |
| 12.1 | …but only after any Wrogowie are dealt with | ✅ | `takeCard` refuses while an unsettled Wróg is on the field |

## 13. Spotkania i badanie Obszarów

| | rule | status | where |
|---|---|---|---|
| 13.1 | only on the field your move ended on | ✅ | |
| 13.2 | meet another character *or* explore, not both | ✅ | the choice stays the player's and only the "not both" is enforced: attacking is refused once a Karta has been drawn or the Obszar's offer resolved, and drawing is refused once the turn has been spent meeting. The mark rides through the fight and back out (`endFight`), because a settled duel leaves nothing behind saying it happened — and a fight with a Wróg is not a meeting and does not spend the turn |
| 13.3 | attack, or use an ability on them | ◐ | attacking works; abilities do not exist (8.1) |
| 13.4 | draw only enough to bring the field up to its printed count | ✅ | `afterMove(field, from, waiting)` |
| 13.5 | obey the field's instruction; beat or flee Wrogowie first | ◐ | text and die tables shown; ordering is the players' |

## 14. Spotkania na Kamiennym Moście

| | rule | status | where |
|---|---|---|---|
| 14.1 | characters may meet only at the two Wejścia | ✅ | `attackSeat` refuses elsewhere on the Most |
| 14.2 | meetings resolve as elsewhere | ✅ | `attackSeat` |
| 14.3 | each Most field's printed instruction | ✅ | `most-fields.json` — all nine |
| 14.4 | no spells and no escape on the Most | ◐ | escape is blocked (19.3); a spell is refused where 9.7 says so, but a spell the app does not apply cannot be stopped from doing what it does not do |
| 14.5 | Pułapka / Magiczna Pułapka: 3 dice less Miecz or Magia, then a roll per item | ✅ | `bridge.ts`, `resolveBridgeOrdeal` |
| 14.6 | Demon Zagłady / Monstrum: roll for its strength, fight until beaten | ✅ | two dice, then the ordinary fight machinery |
| 14.7 | Zamek Bestii: roll the kind of fight, roll the Bestia at 10–15, win = win the game | ✅ | `fightBeast`, and both halves of its parenthesis. Without a Tarcza the Zamek is not a square at all — "musi ominąć Zamek, potraktować to pole tak, jakby go nie było" — so `bridgeOptions` steps over it in either direction and records it in `through`; with one, the fight cannot be declined (10.5) |

## 15. Karty Zdarzeń

| | rule | status | where |
|---|---|---|---|
| 15.1 | cards that go to a named field resolve first and do not affect the drawer | ✅ | both halves. The ordering sits above 15.2's numerals in `resolutionOrder` — the Upiór is a Wróg and the Eremita a Spotkanie and neither waits its class — and is read off the script (`goesToAField`) rather than a list, so a fifth such card transcribed tomorrow is ordered without anybody remembering this rule. The immunity needs no code and never did: `poloz-karte` lifts the card out of `drawn` into `fieldCards`, so it stops being part of this turn as it resolves and waits for whoever ends a move there next |
| 15.2 | the rest resolve in printed numeral order | ✅ | `resolutionOrder` |

## 16. Rodzaje Kart Zdarzeń

| | rule | status | where |
|---|---|---|---|
| 16.1 | Spotkanie — obey it; a lost turn ends the turn at once | ✅ | |
| 16.2 | Wróg attacks immediately; its card is kept as a trophy | ✅ | `beginFight` opens it; `trophiesFrom` banks the Karta when it is won. The keeping was the half that was missing — `kindForCard` only ever said what kind a trophy *would* be, and until this was written no beaten Wróg became one, which left the whole of 1.4 unreachable in play |
| 16.3 | a Demon forces magical combat | ✅ | `startFight` |
| 16.4 | all Spotkania and Wrogowie first, then the rest | ✅ | `resolutionOrder` |
| 16.5 | Nieznajomy — obey it | ✅ | |
| 16.6 | Przedmioty and Przyjaciele may be taken | ✅ | `takeCard` |
| 16.6 | a drawn Magiczny Miecz / Tarcza Tolimana is swapped for the equipment copy | ✅ | `takeCard` — the drawn copy goes to the stos zużytych, the held one occupies a `PRINTED_STOCK` slot |
| 16.7 | Miejsce — obey it | ✅ | |
| 16.8 | cards left behind stay face up on the field for the next character | ✅ | `leaveCardsBehind` |
| 16.8 | a Karta whose own text says "odłóż" joins the stos zużytych instead | ✅ | `leaveCardsBehind` → `returnToPile`; it used to leave the game for good |

## 17. Walka

| | rule | status | where |
|---|---|---|---|
| 17.1 | when a fight happens | ✅ | |
| 17.2 | flight is decided before any dice | ✅ | `escape` |
| 17.3 | spells must be used before the roll | ◐ | the fight window offers them; nothing forces the order |
| 17.4 | one die each, added to total Miecz; loser loses 1 Życie | ✅ | `compareCombat` |
| 17.4 | an item or spell may prevent that loss | ✅ | `bestShield`, rolled in `shieldSaves` |
| 17.4 | "na tym walka się kończy" — one roll per enemy per turn | ✅ | `endFight` records `fought`; `beginFight` refuses a rematch |
| 17.5 | several enemies at once add their Miecze together | ✅ | `beginFight` takes a list; `combinedEnemyTotal` |
| 17.4/17.5 | one creature that is several fights — the Trójgłowy Smok's three heads, regrown on a loss | ✅ | the `loop` frame (docs/STACK.md law 3): `roundsOf` says how many, `beginFight` opens the count under the first head, `resolveFight` puts the next head up or closes the attempt. A head pays out nothing — no trophy, no errand, no Excalibur — and the pack is refused, because 17.5 offers one comparison and the card asks for three |
| 17.6 | the attacked character may try to slip away | ✅ | `escape` resolves the fleeing seat as the duel's `opponentSeat`, and refuses the attacker |
| 17.7 | **both** characters may cast before the roll | ✅ | `claimFloor` gives any seat holding a castable spell an exclusive claim, and `fightRoll` refuses the dice while it stands — duels included |
| 17.8 | attacker's Miecz worked out first | ✅ | |
| 17.9 | the winner takes a Życie, an item, or a Sztuka Złota | ◐ | **all three happen, and the console asks.** `resolveFight` takes a `Spoils`; the Przedmiot changes hands rather than being destroyed (so 21.2's stock holds) and arrives through `slotOnArrival`; taking it or the Złoto skips the blow entirely — no osłona, no Giermek dying in anybody's place, no Excalibur. A won duel is the one fight that does not settle itself: `fight` says who won and `spoils` takes it, bare for the Życie, `zloto`, or a Przedmiot by name. ◐ only because **the browser does not ask yet** — the press exists (`fight-done`) and the route reads `spoils` / `spoilsHoldingId`, so it is a picker on a button that is already there |
| 17.10 | a draw costs nobody anything | ✅ | |

## 18. Walka magiczna

| | rule | status | where |
|---|---|---|---|
| 18.1 | when magical combat happens | ✅ | |
| 18.2a | Magia replaces Miecz | ✅ | `CombatKind` |
| 18.2b | no item can prevent the loss of Życie | ✅ | `shieldSaves` returns false for a magical fight before it looks at anything worn — the Hełm, Tarcza and Zbroja are read for an ordinary one and never for this |

## 19. Ucieczka

| | rule | status | where |
|---|---|---|---|
| 19.1 | escape by special ability or Krąg Płomieni | ✅ | `canEscapeAt` for the abilities; the Krąg Płomieni is spent from hand for one target |
| 19.1 | an ability escapes every istota on the Obszar at once; the Krąg Płomieni just one | ✅ | the ability sweeps every drawn Wróg into `fought` |
| 19.2 | you may flee anything in the three Kręgi | ✅ | a permission, not a grant — 19.1 still has to supply the means |
| 19.3 | on the Most you may flee only other characters | ✅ | enforced, and reachable: the Krąg Płomieni is the only means that fits, and it is wired |

## 20. Zamiana w Kamień

| | rule | status | where |
|---|---|---|---|
| 20.1 | three turns as stone | ✅ | `stone_until_turn` |
| 20.2 | a stone character keeps no items, gold or friends | ✅ | `turnToStone` — items and gold to the field, friends to the used pile |
| 20.3 | Miecz and Magia are kept but unusable | ✅ | kept, and never used: the only moment a statue would swing either is defending an attack, and 20.5 forbids the attack. Two rows, one guard — see below |
| 20.4 | cannot move for three turns | ✅ | `nextSeat` |
| 20.5 | cannot lose Życie, cannot be targeted; keeps its spells | ✅ | the spells are kept (20.2 takes everything else), and stone is not a legal target: `spendLife` takes nothing from it, so a Karta or an Obszar that sweeps the table passes it by, and `attackSeat`, a Poszukiwacz's raid and a Zaklęcie aimed at a Postać all refuse out loud (`refuseAgainstStone`) |

## 21. Magiczne Miecze, Tarcze Tolimana i Karty Wyposażenia

| | rule | status | where |
|---|---|---|---|
| 21.1 | take the matching equipment card | ✅ | |
| 21.2 | bought items return to the shop stack and can run out | ✅ | `stock.ts` — derived from what is in play; `returnToPile` keeps a Wyposażenie card out of the event pile, since eleven of the twelve are printed on both |
| 21.3 | they may be left on the board like any card | ✅ | same path as 5.5 |
| 21.2 | a shop shows what it still has, and refuses what it has not | ✅ | `stock` on the table state; the Płatnerz greys out an empty pile |

## 22. Zwycięstwo

| | rule | status | where |
|---|---|---|---|
| 22 | reach the Zamek Bestii and beat the Bestia | ✅ | `fightBeast` ends the game |

---

## The three that matter most

Counting rules is misleading — 20.5 and 9.6 are not the same size of hole. In
descending order of what they cost a table:

1. **9.6 — half the Zaklęcia are still the table's.** Thirteen of twenty-seven
   are carried out now. The fourteen left divide cleanly: six answer another
   spell or a loss as it happens (Zwierciadło, Władca Zaklęć, Ocalony, Wojna
   Żywiołów, Krąg Płomieni, Formuła Czasu) and want a spell to be *pending*
   rather than resolved — 17.7's reaction pause, and a turn state that can hold
   an unanswered cast. The other eight each want one specific thing: a field to
   aim at (Władca Gromu, Władca Zdarzeń), a conjured attacker (Golem,
   Homunculus), a redraw (Odmiana Losu), a peek (Olśnienie), and the crossing
   permission 11.2 and 11.6 are also waiting on (Pan Trzęsawisk, Władca Lodu).
2. **8.1 — character abilities are only half alive.** The mechanical ones now
   work; the ones that bend a rule rather than add a number (the Krasnolud's
   reroll, the Łotr's dirty fighting, the Olbrzym's extra card) are named on
   screen for the player to apply.
3. ~~**12.1 / 13.4 / 16.8 — cards on fields.**~~ Done. The board accumulates
   what previous characters left behind, the map marks which fields are holding
   something, and a field draws only up to its printed count.

~~After those: the two Pułapki and the Demon Zagłady / Monstrum.~~ Also done —
`resolveBridgeOrdeal` runs all six of the Kamienny Most's stopping Obszary, and
the board itself is finished: fifty-seven of fifty-seven Obszary now do what is
printed on them, between `FIELD_SCRIPTS`, `bridge.ts`, the crossings, the ferry
and 13.4's general rule about drawing down to a field's printed count.

---

## Tryb symulacji: nic nie wpisuje się ręcznie

W `simulation` aplikacja prowadzi grę, więc zniknęły wszystkie kontrolki, które
służyły do *powiedzenia* jej, co się stało:

| co było | gdzie | teraz w symulacji |
|---|---|---|
| „albo wpisz wynik" 1–6 | rzut na ruch | tylko **Rzuć kostką** |
| 1–6 przy sile strażnika | Most, Lodowy Las | tylko rzut aplikacji |
| 1–6 przy rzucie w walce | obie strony walki | tylko **Rzuć** |
| ± przy Całkowitym Mieczu | walka | nic — 1.5 liczy aplikacja |
| „Pokonany / Remis / Przegrana" | Most, przeprawa | tylko **Stocz walkę** |
| „Wymknąłem się / Próba nieudana" | walka | **Spróbuj się wymknąć** — 19.1 to zdolność, nie rzut, więc odpowiada `canEscapeAt` |
| 1–6 w tabelach kostki na kartach i Obszarach | wszędzie | tylko **Rzuć** |
| ± przy Mieczu, Magii, Życiu, Złocie | Karta gracza | nic |

Tryb `companion` zachowuje wszystkie z nich i musi: tam plansza na stole jest
prawdą, a aplikacja jej zapisem — sędzia, którego nie można poprawić, jest
gorszy niż żaden. Ten tryb jest jednak **wstrzymany** (`COMPANION_PARKED`), więc
w praktyce nie da się dziś otworzyć stołu, na którym te kontrolki są widoczne.

**Skutki wykonuje aplikacja.** Tabela kostki na Obszarze i skrypt Karty są
rozpatrywane po stronie serwera: jedno naciśnięcie, serwer rzuca, odczytuje
wiersz i **stosuje go** — a potem mówi, co wypadło i co z tego wynikło.
Wcześniej trzeba było jeszcze kliknąć „−1 Złota", co jest przepisywaniem, nie
graniem.

Granicę wyznacza `isSettled` w `src/lib/engine/resolve.ts`: automatyzujemy
wszystko, co **nie jest decyzją**. „Tracisz 1 Sz. Z." ma jeden wynik i robi to
aplikacja. „Wybierz jedno", „tracisz 1 Przedmiot wedle własnego wyboru",
„przenieś się na dowolny Obszar w tym Kręgu" — to zostaje graczowi, bo sędzia,
który wybiera za ciebie, gra twoją Postacią. Serwer odsyła taką resztę jako
`pending` i wtedy interfejs pyta dokładnie o to jedno.

**Czego jeszcze brakuje.** Skutki, które sięgają innych graczy (`target` inny
niż „ty"), wracają jako `pending` — aplikacja stosuje je tylko na siedzeniu,
które rzucało. Tabele kostki czytane z prozy (`RollTable`, dla Kart bez
skryptu) losują nadal w przeglądarce. Punkt `adjust` pozostaje otwarty, bo tędy
idą właśnie te dwa przypadki.

## Obszary, które handlują

Nine of the board's fields are establishments rather than events: they print a
price list, a service or a die table. `src/lib/engine/fieldScript.ts` encodes
them in the same `Effect` language the card scripts use, so a shop is one thing
in this codebase and not two, and `EffectControls` draws them without knowing
they came from the board rather than from a card.

| Obszar | co oferuje | działa |
|---|---|---|
| Osada | Czarownica (kostka), Płatnerz (Miecz 2, Sztylet 3, Hełm 1), Medyk (1 Sz.Z. za punkt) | ✅ |
| Gród | Wróżbita (kostka), Lichwiarz (skup Przedmiotów po 1 Sz.Z.) | ✅ |
| Karczma | obowiązkowa kostka, sześć wyników | ✅ |
| Zamek | Nadworny Medyk: płacisz, potem rzucasz | ✅ |
| Pustelnia | Pustelnik leczy za 1 Sz.Z. od rany | ✅ |
| Magiczne Wrota | życzenie: Miecz, Magia, Zaklęcie albo Złoto | ✅ |
| Strażnik Magicznych Wrót | 1 Sz.Z. albo 1 Życia | ✅ |
| Przeprawa ×2 | 1 Sz.Z. przewoźnikowi | ✅ `payFerry` |
| Twierdza Strzegąca Dróg | misja Władcy, potem Tarcza Tolimana | ✅ misja żyje w `seat_effects`; `resolveFight` ją zalicza, `claimMission` wypłaca |
| Ruchome Skały ×2 | 1 Życie | ✅ |
| Bagna ×2 | Przedmiot albo Przyjaciel, twój wybór | ✅ |
| Urwisko ×2 | kostka za ciebie i za każdego Przyjaciela | ✅ `rzut-za-kazdego` |
| Kurhan, Wilczy Parów, Krypta Upiorów, Krąg Mocy, Wieża Przeznaczenia | obowiązkowa kostka | ✅ |
| Czarci Młyn, Studnia Wieczności | zależnie od Natury | ✅ |
| Świątynia Bogini Nemed, Świątynia Tolimana | modlitwa na 2 kostkach | ✅ |

Ceny czyta serwer z planszy, nigdy z żądania. Klient mówi *co* kupuje; ile to
kosztuje nie jest jego rzeczą, a sędzia, który przyjmuje cenę od kupującego,
nie jest sędzią.

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
