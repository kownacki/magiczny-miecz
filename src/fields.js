export const eventTypes = {
  CARD_1: 1,
  CARD_2: 2,
};

export const list = {
  1: {adjacent: [2, 14], name: 'Karczma'},
  2: {adjacent: [3, 1], name: 'Mroźne Pustkowie', event: eventTypes.CARD_1},
  3: {adjacent: [4, 2], name: 'Gród'},
  4: {adjacent: [5, 3], name: 'Bezdroża', event: eventTypes.CARD_2},
  5: {adjacent: [6, 4], name: 'Studnia Wieczności'},
  6: {adjacent: [7, 5], name: 'Krąg Mocy'},
  7: {adjacent: [8, 6], name: 'Czarci Młyn'},
  8: {adjacent: [9, 7], name: 'Mokradła', event: eventTypes.CARD_1},
  9: {adjacent: [10, 8], name: 'Step', event: eventTypes.CARD_1},
  10: {adjacent: [11, 9], name: 'Osada'},
  11: {adjacent: [12, 10], name: 'Kurhan'},
  12: {adjacent: [13, 11], name: 'Mokradła', event: eventTypes.CARD_1},
  13: {adjacent: [14, 12], name: 'Step', event: eventTypes.CARD_1},
  14: {adjacent: [1, 13], name: 'Uroczysko', event: eventTypes.CARD_1},
};

const descriptions = {
  1: `MUSISZ RZUCIĆ KOSTKĄ:
1 - przegrałeś w kości 1 Sz. Z;
2 - wygrałeś 1 Sz. Z;
3 - musisz tu nocować, tracisz 1 turę;
4 - musisz stawić czoła miejscowemu osiłkowi (Miecz 4);
5 - poczęstowano cię eliksirem, dzięki któremu możesz przenieść się do dowolnego miejsca w tym Kręgu;
6 - eliksir, który ci podano może przenieść cię do Świątyni Nemed.`,
  2: `WYCIĄGNIJ 1 KARTĘ.
Nie ciągnij Karty jeśli jakaś już tu jest.`,
  3: `MOŻESZ TU ODWIEDZIĆ:
<strong>Wróżbitę</strong>: rzuć kostką
1 - zyskujesz 1 Zaklęcie;
2 - zostajesz Zaklęty w Kamień;
3 - jeżeli jesteś Zły stajesz się Dobry. Jeżeli jesteś Chaotyczny stajesz się Zły;
4-6 zostałeś zignorowany.
<strong>Lichwiarza</strong> - możesz wymienić dowolne Przedmioty na złoto (odłóż ich Karty i weź po 1 Sz. Z za każdy).`,
};
